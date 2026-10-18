(function(root){
const factories={"/modules/src/battle/equipment.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 装备来源效果（交接文档第十一、十六节）。
 *
 * 魂骨属性与特性是“装备来源”，不是第二套基础数值：
 *   - 基础面板始终来自人物面板；
 *   - 魂骨属性只作为来源修正叠加一次；
 *   - 特性只注册到同一个运行时来源表，按魂骨实例去重；
 *   - 不写回成长账本，不重复加算。
 */

const { clone, isPlainObject } = require('../util');
const { attributeTotals, validateLedger } = require('../soulbone/absorption');

const STAT_KEYS = Object.freeze(['B', 'S', 'C', 'D', 'A', 'P', 'W']);

/**
 * @param {object} baseModel 人物面板现算模型（含 stats/derived）
 * @param {object} modifiers {attributes, traits, sources}
 * @param {object} options {derive} 战斗侧 derive 函数；有属性修正时必需
 */
function buildEffectivePanel(baseModel, modifiers, options = {}) {
  if (!isPlainObject(baseModel) || !isPlainObject(baseModel.stats)) throw new Error('有效面板须基于人物实际面板');
  const attributes = (modifiers && modifiers.attributes) || {};
  const sources = (modifiers && modifiers.sources) || [];
  const traits = (modifiers && modifiers.traits) || [];
  const stats = clone(baseModel.stats);
  const applied = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!STAT_KEYS.includes(key)) throw new Error('装备属性含未知维度：' + key);
    if (!Number.isFinite(value)) throw new Error('装备属性数值无效：' + key);
    stats[key] = (stats[key] || 0) + value;
    applied[key] = value;
  }
  let derived = clone(baseModel.derived || null);
  if (Object.keys(applied).length) {
    if (typeof options.derive !== 'function') throw new Error('有魂骨属性修正时必须调用战斗侧 derive 重算派生值，禁止另写一套数值');
    derived = options.derive(stats);
  }
  return {
    version: 1,
    model: { ...clone(baseModel), stats, derived },
    base: { stats: clone(baseModel.stats), derived: clone(baseModel.derived || null) },
    appliedAttributes: applied,
    traitSources: traits.map((trait) => ({ id: trait.traitId, boneId: trait.ownerBoneId || trait.sourceBoneId || null })),
    sources: sources.slice(),
    growthTouched: false
  };
}

/** 直接从事装备来源账本构建，避免调用方漏传属性或重复叠加。 */
function effectivePanelFromLedger(baseModel, ledger, options = {}) {
  validateLedger(ledger);
  return buildEffectivePanel(baseModel, {
    attributes: attributeTotals(ledger),
    traits: Object.values(ledger.runtimeTraits),
    sources: Object.keys(ledger.absorbedBones)
  }, options);
}

/** 同一特性只能注册一次；每块骨的属性来源也只能有一个条目。 */
function assertSingleRegistration(ledger) {
  validateLedger(ledger);
  const keys = Object.keys(ledger.runtimeTraits);
  if (new Set(keys).size !== keys.length) throw new Error('同一特性被重复注册');
  const bones = Object.keys(ledger.absorbedBones);
  if (new Set(bones).size !== bones.length) throw new Error('同一魂骨被重复吸收');
  for (const [boneId, entry] of Object.entries(ledger.attributes)) {
    if (!ledger.absorbedBones[boneId]) throw new Error('属性来源没有对应已吸收魂骨：' + boneId);
    if (typeof entry.budgetVersion !== 'number' || entry.budgetVersion < 1) throw new Error('属性来源缺少已定版预算：' + boneId);
  }
  return { traits: keys.length, bones: bones.length, attributeSources: Object.keys(ledger.attributes).length };
}

/** 校验每块骨的特性都有已实现的处理器；缺一个就显式报告，不假装生效。 */
function assertTraitHandlers(ledger, registry) {
  validateLedger(ledger);
  if (!registry || typeof registry.has !== 'function') throw new Error('须提供魂骨特性处理器登记表');
  const missing = [];
  for (const trait of Object.values(ledger.runtimeTraits)) {
    if (!registry.has(trait.handler)) missing.push({ traitId: trait.traitId, boneId: trait.ownerBoneId, handler: trait.handler });
  }
  return { ok: missing.length === 0, missing };
}

/**
 * 来源分离：魂骨特性必须绑定魂骨实例，不得用武魂ID作为唯一绑定键；
 * 角色固有特性不在本账本内，由角色自己的来源字段负责，二者不混用。
 */
function assertSourceSeparation(ledger) {
  validateLedger(ledger);
  const traits = Object.values(ledger.runtimeTraits);
  for (const trait of traits) {
    if (trait.source !== 'soulbone') throw new Error('运行时特性来源不是魂骨：' + trait.traitId);
    if (!trait.ownerBoneId) throw new Error('魂骨特性缺少所属魂骨实例ID：' + trait.traitId);
    if (trait.soulId !== undefined) throw new Error('魂骨特性不得以武魂ID作为绑定键：' + trait.traitId);
    if (!ledger.absorbedBones[trait.ownerBoneId]) throw new Error('魂骨特性指向未吸收的魂骨：' + trait.ownerBoneId);
  }
  return { traits: traits.length, bones: Object.keys(ledger.absorbedBones).length, innateTraitsOutsideLedger: true };
}

module.exports = { STAT_KEYS, buildEffectivePanel, effectivePanelFromLedger, assertSingleRegistration, assertTraitHandlers, assertSourceSeparation };

},"/modules/src/battle/hooks.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 通用战斗事件钩子（交接文档第十八、十九节）。
 *
 * 魂骨效果与友方NPC、会长、神秘伤疤女共用同一组可靠事件：
 * 受伤、护盾、控制、回魂、行动起止，以及战斗开始/结束。
 * 不另造一套“回合”计数：个人回合由显式行动机会开始与结束，附赠普攻、
 * 连击分段、持续伤害跳数都不额外计回合。
 */

const { VERSIONS } = require('../versions');

const EVENTS = Object.freeze([
  'battle-start',
  'turn-start',
  'turn-end',
  'damage-dealt',
  'damage-taken',
  'shield-gained',
  'shield-broken',
  'control-start',
  'control-end',
  'heal',
  'mp-restore',
  'defeat',
  'battle-end'
]);

const TURN_KINDS = Object.freeze({ normal: true, bonus: false, dot: false, segment: false, reaction: false });

function createHookRegistry() {
  const handlers = new Map();
  const order = [];

  function on(event, handler, meta = {}) {
    if (!EVENTS.includes(event)) throw new Error('未知战斗事件：' + event + '；不允许自造回合类事件');
    if (typeof handler !== 'function') throw new Error('事件处理器须为函数');
    const id = meta.id;
    if (typeof id !== 'string' || !id) throw new Error('事件处理器须有唯一ID');
    if (handlers.has(id)) throw new Error('事件处理器重复注册：' + id);
    handlers.set(id, { id, event, handler, owner: meta.owner || null, priority: meta.priority || 0, version: VERSIONS.battleHooks });
    order.push(id);
    return api;
  }

  function off(id) {
    handlers.delete(id);
    const index = order.indexOf(id);
    if (index >= 0) order.splice(index, 1);
  }

  function offOwner(owner) {
    for (const [id, entry] of [...handlers]) if (entry.owner === owner) off(id);
  }

  /** frame 由宿主提供，至少含 {logs:[], unit, ...}；处理器只读事件并写入 frame。 */
  function emit(event, frame) {
    if (!EVENTS.includes(event)) throw new Error('未知战斗事件：' + event);
    if (!frame || typeof frame !== 'object') throw new Error('事件帧无效');
    if (!Array.isArray(frame.logs)) frame.logs = [];
    const entries = order.map((id) => handlers.get(id)).filter((entry) => entry && entry.event === event).sort((a, b) => b.priority - a.priority);
    const results = [];
    for (const entry of entries) {
      const before = frame.logs.length;
      const output = entry.handler(frame, event);
      results.push({ id: entry.id, output: output === undefined ? null : output, logs: frame.logs.slice(before) });
    }
    return { frame, results, handlers: entries.map((entry) => entry.id) };
  }

  function list() {
    return order.map((id) => handlers.get(id)).filter(Boolean).map((entry) => ({ id: entry.id, event: entry.event, owner: entry.owner, priority: entry.priority }));
  }

  function countByEvent() {
    const counts = Object.fromEntries(EVENTS.map((event) => [event, 0]));
    for (const entry of handlers.values()) counts[entry.event]++;
    return counts;
  }

  const api = Object.freeze({ on, off, offOwner, emit, list, countByEvent, EVENTS });
  return api;
}

/**
 * 个人回合时钟。只有“获得一次正常行动机会”才 begin，
 * 只有正常行动完成才计一个有效回合；附赠普攻、持续伤害跳数、连击分段不计。
 * 被控制时暂停（不产生新回合，已有层数保留）。
 */
function createTurnClock() {
  const state = new Map(); // unitId -> {active, turns, controlled, wasControlled}

  function ensure(unitId) {
    if (typeof unitId !== 'string' || !unitId) throw new Error('回合时钟须绑定单位ID');
    if (!state.has(unitId)) state.set(unitId, { active: false, turns: 0, controlled: false, wasControlled: false, startedAt: null });
    return state.get(unitId);
  }

  function begin(unitId, meta = {}) {
    const entry = ensure(unitId);
    if (entry.active) throw new Error('同一单位不能同时开始两个个人回合');
    entry.active = true;
    entry.controlled = meta.controlled === true;
    entry.startedAt = meta.at === undefined ? null : meta.at;
    return { unitId, active: true, controlled: entry.controlled };
  }

  function complete(unitId, meta = {}) {
    const entry = ensure(unitId);
    if (!entry.active) throw new Error('个人回合尚未开始');
    const kind = meta.kind || 'normal';
    if (!(kind in TURN_KINDS)) throw new Error('未知行动类型：' + kind);
    entry.active = false;
    entry.wasControlled = entry.controlled;
    if (TURN_KINDS[kind] && !entry.controlled) entry.turns++;
    return { unitId, kind, counted: TURN_KINDS[kind] && !entry.controlled, turns: entry.turns };
  }

  function markControlled(unitId) {
    ensure(unitId).controlled = true;
  }

  function turnsOf(unitId) {
    return ensure(unitId).turns;
  }

  function snapshot() {
    return [...state.entries()].map(([unitId, entry]) => ({ unitId, ...entry }));
  }

  return Object.freeze({ begin, complete, markControlled, turnsOf, snapshot });
}

module.exports = { EVENTS, TURN_KINDS, createHookRegistry, createTurnClock };

},"/modules/src/battle/skill-attributes.js":function(require,module,exports,__dirname){
'use strict';

const { clone } = require('../util');

const NONE = new Set(['无', '无属性', '无属性武魂', 'none', 'neutral']);

/** 只读取武魂/魂兽的属性，不把空间等机制标签自动当成元素属性。 */
function attributeTags(source) {
  const soul = source && source.soul ? source.soul : source;
  if (!soul || typeof soul !== 'object') return ['无'];
  if (typeof soul.attribute_category === 'string' && NONE.has(soul.attribute_category.trim())) return ['无'];
  const raw = Array.isArray(soul.elements) && soul.elements.length ? soul.elements : [soul.attribute];
  const tags = raw.flatMap((value) => typeof value === 'string' ? value.replace(/^复合(?:属性)?[·：:]?/, '').split(/[／/、,，+＆&|\s]+/u) : [])
    .map((value) => value.trim()).filter((value) => value && !NONE.has(value));
  return [...new Set(tags)].length ? [...new Set(tags)] : ['无'];
}

/** 标签与伤害通道分开：物理/能量/精神仍用channel；复合属性不丢失。 */
function tagSkill(skill, source) {
  if (!skill || typeof skill !== 'object') throw new Error('魂技属性标签缺少技能');
  const tags = attributeTags(source);
  return { ...clone(skill), attribute: tags.join('／'), element: tags.join('／'), elements: tags.slice(), attributeTags: tags.slice(), attributeRulesVersion: 1 };
}

function tagUnitSkills(unit) {
  const next = clone(unit);
  next.skills = (next.skills || []).map((skill) => tagSkill(skill, next.soul || next));
  return next;
}

/** 旧档/武魂变化后的统一刷新入口。不触碰魂骨技与角色成长，不重抽技能。 */
function tagCharacterSkills(character, resolvedSoul = character && character.soul) {
  const next = clone(character);
  for (const ring of next.rings || []) ring.skills = (ring.skills || []).map((skill) => tagSkill(skill, resolvedSoul));
  for (const key of ['preStoredNinthRing', 'pendingNinthRing']) {
    if (next[key]) next[key].skills = (next[key].skills || []).map((skill) => tagSkill(skill, resolvedSoul));
  }
  if (Array.isArray(next.skills)) next.skills = next.skills.map((skill) => tagSkill(skill, resolvedSoul));
  return next;
}

module.exports = { attributeTags, tagSkill, tagUnitSkills, tagCharacterSkills };

},"/modules/src/beast/library.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 独立的十万年魂兽库（交接文档第八节）。
 *
 * 本包交付的是“封装规格 + 空库状态”，不编造第一个可领奖的十万年魂兽，
 * 也不拿考官或神秘伤疤女改名充当魂兽。用户补充正式目标后，把记录写进
 * data/beast/library.json 的 beasts 数组即可，接口不用改。
 *
 * 空库行为：不进入空战斗、不自动胜利、不产生占位奖励；
 * 任务停在“目标资料尚未开放”的待办状态，保留接受与援军结果，可返回普通流程。
 *
 * 对外职责分开：列出可用目标、按固定随机结果选取、返回只读定义、构建战斗实例、
 * 验证奖励来源。战斗实例与定义数据隔离，战斗受伤不会污染库原型。
 */

const fs = require('node:fs');
const path = require('node:path');
const { clone, deepFreeze, isPlainObject, requireInteger } = require('../util');
const { VERSIONS, PENDING } = require('../versions');
const { SLOTS } = require('../soulbone/instance');

const DATA_PATH = path.resolve(__dirname, '..', '..', 'data', 'beast', 'library.json');
const TEN_THOUSAND_YEARS = 100000;
const LIFE_TYPES = Object.freeze(['生活', '元素', '灵体', '构装', '亡灵', '无生命']);

function emptyLibrary() {
  return { schemaVersion: VERSIONS.beastLibrarySchema, libraryVersion: VERSIONS.beastSelection, note: '空库：等待用户补充正式十万年魂兽定义。', beasts: [] };
}

function loadLibrary(dataPath) {
  const target = dataPath || DATA_PATH;
  if (!fs.existsSync(target)) return emptyLibrary();
  const raw = JSON.parse(fs.readFileSync(target, 'utf8'));
  return raw;
}

function validateBeast(beast) {
  if (!isPlainObject(beast)) throw new Error('魂兽定义须为对象');
  if (typeof beast.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(beast.id)) throw new Error('魂兽稳定ID无效：' + beast.id);
  if (typeof beast.name !== 'string' || !beast.name) throw new Error(beast.id + ' 缺少名称');
  if (!Number.isInteger(beast.version) || beast.version < 1) throw new Error(beast.id + ' 缺少定义版本');
  if (beast.years !== TEN_THOUSAND_YEARS) throw new Error(beast.id + ' 年限须精确为100000，实际 ' + beast.years);
  if (typeof beast.available !== 'boolean') throw new Error(beast.id + ' 缺少可用标记');
  if (!Array.isArray(beast.battleTags) || !beast.battleTags.includes('hunt')) throw new Error(beast.id + ' 缺少讨伐参战标签');
  if (!LIFE_TYPES.includes(beast.lifeType)) throw new Error(beast.id + ' 的实体生命类型无效：' + beast.lifeType);
  if (!isPlainObject(beast.panel) && !isPlainObject(beast.build)) throw new Error(beast.id + ' 缺少实际战斗面板或构建参数');
  if (beast.panel) {
    requireInteger(beast.panel.level, beast.id + ' 魂力等级', 1, 99);
    if (!isPlainObject(beast.panel.stats)) throw new Error(beast.id + ' 面板缺少六维');
  }
  if (!Array.isArray(beast.skills) || beast.skills.length < 1) throw new Error(beast.id + ' 缺少魂技');
  if (!Array.isArray(beast.traits) || beast.traits.length < 2) throw new Error(beast.id + ' 至少需要两个不同特性');
  const traitIds = beast.traits.map((trait) => trait && trait.id);
  if (traitIds.some((id) => typeof id !== 'string' || !id)) throw new Error(beast.id + ' 的特性缺少稳定ID');
  if (new Set(traitIds).size !== traitIds.length) throw new Error(beast.id + ' 存在重复特性ID');
  for (const trait of beast.traits) {
    if (!trait.name || !trait.effect) throw new Error(beast.id + ' 的特性「' + trait.id + '」缺少名称或效果');
    if (!trait.inherit || typeof trait.inherit !== 'object') throw new Error(beast.id + ' 的特性「' + trait.id + '」缺少玩家魂骨继承版本');
    if (typeof trait.inherit.handler !== 'string' || !trait.inherit.handler || !Number.isInteger(trait.inherit.implementationVersion) || trait.inherit.implementationVersion < 1) throw new Error(beast.id + ' 的特性「' + trait.id + '」缺少有效继承处理器或版本');
  }
  if (!Number.isInteger(beast.traitInheritanceVersion) || beast.traitInheritanceVersion < 1) throw new Error(beast.id + ' 缺少特性继承版本');
  if (!isPlainObject(beast.ringReward) || beast.ringReward.years !== TEN_THOUSAND_YEARS) throw new Error(beast.id + ' 的魂环奖励不是十万年');
  if (!isPlainObject(beast.bone) || typeof beast.bone.slot !== 'string' || !beast.bone.slot) throw new Error(beast.id + ' 缺少魂骨部位规则');
  if (!SLOTS.includes(beast.bone.slot) && beast.bone.slot !== 'random') throw new Error(beast.id + ' 的魂骨部位无效');
  if (typeof beast.battleText !== 'string' || !beast.battleText) throw new Error(beast.id + ' 缺少战斗文本');
  if (typeof beast.defeatText !== 'string' || !beast.defeatText) throw new Error(beast.id + ' 缺少败北文本');
  if (typeof beast.exitRule !== 'string' || !beast.exitRule) throw new Error(beast.id + ' 缺少退场规则');
  return true;
}

function createBeastLibrary(options = {}) {
  const raw = options.data || loadLibrary(options.dataPath);
  if (!raw || raw.schemaVersion !== VERSIONS.beastLibrarySchema) {
    throw new Error('魂兽库版本不支持：' + (raw && raw.schemaVersion));
  }
  if (!Array.isArray(raw.beasts)) throw new Error('魂兽库 beasts 须为数组');
  const errors = [];
  const records = new Map();
  for (const beast of raw.beasts) {
    try {
      validateBeast(beast);
      if (records.has(beast.id)) throw new Error('魂兽ID重复：' + beast.id);
      records.set(beast.id, deepFreeze(clone(beast)));
    } catch (error) {
      errors.push(error.message);
    }
  }

  function list() {
    return [...records.values()].map((beast) => ({
      id: beast.id,
      name: beast.name,
      version: beast.version,
      years: beast.years,
      available: beast.available,
      lifeType: beast.lifeType,
      elements: clone(beast.elements || []),
      style: beast.style,
      rating: beast.panel && beast.panel.rating,
      traitIds: beast.traits.map((trait) => trait.id)
    }));
  }

  function available() {
    return [...records.values()].filter((beast) => beast.available === true);
  }

  function definition(id) {
    const beast = records.get(id);
    if (!beast) throw new Error('魂兽库中没有目标：' + id);
    return deepFreeze(clone(beast));
  }

  /**
   * “前进”时首次确定目标并立即保存。
   * frozen 已存在时沿用，不重抽；库为空时返回空库状态，不造假目标。
   */
  function pick(input = {}) {
    if (input.frozen) {
      // 已冻结目标带着定义快照；即使库后来改版或被清空，也沿用原目标与版本。
      const beast = input.frozen.snapshot
        ? deepFreeze(clone(input.frozen.snapshot))
        : definition(input.frozen.id);
      if (beast.id !== input.frozen.id || beast.version !== input.frozen.version) {
        throw new Error('已冻结目标的定义版本发生变化，不能重抽；须显式迁移');
      }
      return { empty: false, reused: true, target: { id: beast.id, version: beast.version, snapshot: beast }, roll: null };
    }
    const pool = available();
    if (!pool.length) {
      return { empty: true, reused: false, target: null, status: PENDING.EMPTY_BEAST_LIBRARY, reason: '目标资料尚未开放', poolSize: 0 };
    }
    const rng = input.rng;
    if (!rng) throw new Error('目标选取须使用游戏确定性投骰器');
    const draw = pool.length === 1 ? { face: 1, sides: 1 } : { face: rng.die(pool.length, '十万年魂兽目标抽取'), sides: pool.length };
    const beast = clone(pool[draw.face - 1]);
    return {
      empty: false,
      reused: false,
      target: { id: beast.id, version: beast.version, snapshot: deepFreeze(beast) },
      roll: { sides: draw.sides, face: draw.face, label: '十万年魂兽目标抽取', equalWeight: true, degenerate: draw.sides === 1 }
    };
  }

  /**
   * 构建战斗实例：从定义深拷贝并补齐运行时资源，与原型隔离。
   * 实际行动条/伤害结算仍交给主游戏战斗代码。
   */
  function buildInstance(input) {
    const beast = input && input.snapshot ? deepFreeze(clone(input.snapshot)) : definition(input && input.id);
    validateBeast(beast);
    if (!beast.available) throw new Error('该十万年魂兽当前不可参战：' + beast.id);
    const panel = beast.panel;
    if (!panel || !panel.stats) throw new Error('该魂兽缺少实际战斗面板，不能构建实例');
    const instance = {
      id: input.instanceId || 'beast:' + beast.id,
      definitionId: beast.id,
      definitionVersion: beast.version,
      name: beast.name,
      team: 1,
      level: panel.level,
      years: beast.years,
      lifeType: beast.lifeType,
      elements: clone(beast.elements || []),
      style: beast.style,
      model: clone(panel),
      stats: clone(panel.stats),
      derived: clone(panel.derived || {}),
      skills: clone(beast.skills),
      traits: clone(beast.traits),
      exitRule: beast.exitRule,
      hp: panel.derived && panel.derived.HP !== undefined ? panel.derived.HP : null,
      mp: panel.derived && panel.derived.MP !== undefined ? panel.derived.MP : null,
      sh: panel.derived && panel.derived.SH !== undefined ? panel.derived.SH : null,
      traitsFought: [],
      tags: beast.battleTags.slice()
    };
    for (const key of ['hp', 'mp', 'sh']) if (!Number.isFinite(instance[key]) || instance[key] < 0 || (key === 'hp' && instance[key] === 0)) throw new Error('魂兽面板缺少有效' + key.toUpperCase() + '，不能作为正式讨伐目标');
    return instance;
  }

  function validateRewardSource(id, version) {
    const beast = records.get(id);
    if (!beast) throw new Error('奖励来源不是库中十万年魂兽：' + id);
    if (version !== beast.version) throw new Error('奖励来源定义版本不一致：' + version + ' / ' + beast.version);
    if (beast.ringReward.years !== TEN_THOUSAND_YEARS) throw new Error('奖励来源的魂环不是十万年');
    if (!beast.bone || !beast.bone.slot) throw new Error('奖励来源缺少魂骨部位规则');
    return true;
  }

  function status() {
    return {
      empty: available().length === 0,
      count: records.size,
      availableCount: available().length,
      pendingReason: available().length === 0 ? PENDING.EMPTY_BEAST_LIBRARY : null,
      errors
    };
  }

  return Object.freeze({ list, available, definition, pick, buildInstance, validateRewardSource, status, TEN_THOUSAND_YEARS });
}

module.exports = { createBeastLibrary, validateBeast, emptyLibrary, TEN_THOUSAND_YEARS, LIFE_TYPES, DATA_PATH };

},"/modules/src/bridge/v1101.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 与 v11.01 现有战斗/规则代码的连接桥。
 *
 * “战斗的数值可以调用战斗方面的代码”：评级、派生值、魂技生成、控制结算、
 * 魂环年限分档都直接调用 v11.01 的 WitnessRules，而不是在本包里再写一套。
 * 主游戏拼接时也可以不经过本桥，直接把活着的 WitnessRules 作为 ratingFn/rules 注入。
 */

const fs = require('node:fs');
const path = require('node:path');
const { tagSkill } = require('../battle/skill-attributes');

const GAME_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// 交接文档指定的v12基线是“武魂精简版”（已移除魂性谱随机特性运行模块与数据）；
// 若不存在则退回v11.01开发。两者规则版本一致（计算11、评级2）。
const CANDIDATES = [
  path.resolve(__dirname, '..', '..', '..', '..', '..'),
  path.join(GAME_ROOT, 'v11.01武魂精简开发', '骰子系统'),
  path.join(GAME_ROOT, 'v11.01开发', '骰子系统')
];

let cached = null;

function resolveGameDir() {
  if (process.env.WITNESS_GAME_DIR) return process.env.WITNESS_GAME_DIR;
  const found = CANDIDATES.find((dir) => fs.existsSync(path.join(dir, 'v13-runtime.cjs')));
  return found || CANDIDATES[CANDIDATES.length - 1];
}

function loadRuntime() {
  if (cached) return cached;
  const dir = resolveGameDir();
  const entry = path.join(dir, 'v13-runtime.cjs');
  if (!fs.existsSync(entry)) {
    throw new Error('找不到 v11.01 战斗运行时：' + entry + '；可用 WITNESS_GAME_DIR 指定，或在拼接时直接注入 WitnessRules');
  }
  cached = require(entry);
  return cached;
}

function rules() {
  const runtime = loadRuntime();
  if (!runtime.WitnessRules) throw new Error('v11.01 运行时缺少 WitnessRules');
  return runtime.WitnessRules;
}

function rating(model) {
  return rules().rating(model);
}

function derive(stats) {
  return rules().derive(stats);
}

function makeSkill(args) {
  return tagSkill(rules().makeSkill(args), args.soul);
}

function pickCategory(style, roll) {
  return rules().pickCategory(style, roll);
}

function controlEffect(Q, attacker, defender) {
  return rules().controlEffect(Q, attacker, defender);
}

function benchmark(level) {
  return rules().benchmark(level);
}

function band(years) {
  return rules().band(years);
}

function constants() {
  const R = rules();
  return { CAPS: R.CAPS.slice(), BANDS: R.BANDS.slice(), QS: R.QS.slice(), CATEGORIES: R.CATEGORIES.slice() };
}

/**
 * 基线自检：确认接的是“已删除魂性谱随机特性”的精简版，而不是把旧随机特性带回游戏。
 * 同时保留会长/伤疤女等独立角色机制的入口（WitnessScarredChallenge）。
 */
function baseline() {
  const runtime = loadRuntime();
  return {
    dir: resolveGameDir(),
    rulesVersion: rules().calculationVersion,
    ratingRulesVersion: rules().ratingRulesVersion,
    hasRandomSoulTraitRuntime: !!(runtime.WitnessTraitRuntime || runtime.WitnessTraitData || runtime.WitnessTraits),
    hasBattle: !!runtime.WitnessBattle,
    hasRoleChallenge: !!runtime.WitnessScarredChallenge
  };
}

module.exports = { resolveGameDir, loadRuntime, rules, rating, derive, makeSkill, pickCategory, controlEffect, benchmark, band, constants, baseline };

},"/modules/src/hunt/allies.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 家境判定友方NPC（交接文档第五节）。
 *
 * v12.04：3/4/5档25/50/75%；6—7档1位；8—9档2位；10档3位。
 * 6、7档的50%／75%是交接文档标注的“建议值”，实现里单独带 suggested:true，
 * 方便确认后只改一条表，不改抽取与落盘逻辑。
 *
 * 落盘规则：援助概率、人数和抽中的角色都在第一次接受时固定；
 * 刷新、返回、保存再读取、展开人物说明都不能重抽。
 */

const { clone, requireInteger, uniqueIds } = require('../util');
const { VERSIONS } = require('../versions');
const { drawIndex } = require('../rng');

const LEGACY_ALLY_RULES = Object.freeze({1:{count:0,roll:null},2:{count:0,roll:null},3:{count:0,roll:null},4:{count:0,roll:null},5:{count:0,roll:null},6:{count:1,roll:50,threshold:50},7:{count:1,roll:75,threshold:75},8:{count:1,roll:null},9:{count:1,roll:null},10:{count:2,roll:null}});
// v12.04：新邀请按此表；已接受的旧邀请保持原阵容，不重抽。
const ALLY_RULES = Object.freeze({
  1:{count:0,roll:null},2:{count:0,roll:null},
  3:{count:1,roll:25,threshold:25},4:{count:1,roll:50,threshold:50},5:{count:1,roll:75,threshold:75},
  6:{count:1,roll:null},7:{count:1,roll:null},8:{count:2,roll:null},9:{count:2,roll:null},10:{count:3,roll:null}
});

function ruleFor(originRank) {
  requireInteger(originRank, '家境档位', 1, 10);
  return { originRank, rulesVersion: VERSIONS.allyRules, ...ALLY_RULES[originRank] };
}

/** 只取角色建立时的家境／出身档位；不得用武魂潜力、成长天赋、魅力或气运代替。 */
function resolveOriginRank(character) {
  const rank = character && character.identity && character.identity.originRank;
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
    throw new Error('角色缺少建立时的家境／出身档位 identity.originRank；不得用武魂潜力、成长天赋、魅力或气运代替');
  }
  return rank;
}

function drawNpcIds(roster, count, rng) {  // 可出场集合：有定稿到场正文的角色；未来新增但未补正文的角色不进入抽取。
  const pool = roster.list().filter((character) => character.arrivalTextAvailable !== false).map((character) => character.id);
  if (count > pool.length) throw new Error('友方NPC可出场名录不足：需要' + count + '位，只有' + pool.length + '位');
  const picked = [];
  for (let i = 0; i < count; i++) {
    const draw = drawIndex(rng, pool.length, '友方NPC抽取·第' + (i + 1) + '位');
    picked.push(pool[draw.face - 1]);
    pool.splice(draw.face - 1, 1); // 不放回，别名不会构成第二位
  }
  uniqueIds(picked, '友方NPC抽签');
  return picked;
}

/**
 * 第一次接受时判定并落盘。existing 存在时原样返回，不重投任何骰。
 * @param {object} input { originRank, roster, rng, existing }
 */
function ensureAllies(input) {
  const { roster, rng, existing } = input;
  const originRank = requireInteger(input.originRank, '家境档位', 1, 10);
  if (existing !== undefined && existing !== null) return validateAllies(existing, roster, originRank);

  const rule = ruleFor(originRank);
  const rolls = [];
  let attended = rule.count;
  if (rule.roll !== null) {
    const face = rng.d100('家境' + originRank + '档援助概率');
    attended = face <= rule.threshold ? 1 : 0;
    rolls.push({ label: '援助概率', sides: 100, face, threshold: rule.threshold, success: attended === 1 });
  }
  const npcIds = attended ? drawNpcIds(roster, attended, rng) : [];
  return Object.freeze({
    rulesVersion: VERSIONS.allyRules,
    originRank,
    count: attended,
    npcIds,
    rolls,
    source: '家境判定',
    redrawable: false
  });
}

/**
 * 读档/刷新时的校验：不自作主张重抽，只核对版本、档位与阵容合法性。
 * 若旧存档里的规则版本不同，显式报错并要求迁移，而不是静默改队友。
 */
function validateAllies(allies, roster, originRank) {
  if (!allies || typeof allies !== 'object') throw new Error('友方阵容数据无效');
  if (![1, VERSIONS.allyRules].includes(allies.rulesVersion)) {
    throw new Error('友方阵容规则版本不一致：存档 ' + allies.rulesVersion + '，当前 ' + VERSIONS.allyRules + '；须显式迁移，不能重抽');
  }
  if (originRank !== undefined && allies.originRank !== originRank) throw new Error('友方阵容家境档位与当前存档不一致');
  if (!Array.isArray(allies.npcIds) || !Number.isInteger(allies.count) || allies.count !== allies.npcIds.length) {
    throw new Error('友方阵容人数与名单不一致');
  }
  if (allies.count < 0 || allies.count > 3) throw new Error('友方阵容人数须为0—3');
  if (new Set(allies.npcIds).size !== allies.count) throw new Error('友方NPC不得重复');
  for (const id of allies.npcIds) {
    const record = roster.get(id);
    if (!record) throw new Error('友方NPC不存在：' + id);
  }
  requireInteger(allies.originRank, '家境档位', 1, 10);
  const rule = allies.rulesVersion === 1 ? LEGACY_ALLY_RULES[allies.originRank] : ruleFor(allies.originRank);
  if (rule.roll === null && allies.count !== rule.count) throw new Error('必定到场的友方NPC人数不符合家境规则');
  if (allies.count > rule.count) throw new Error('家境' + allies.originRank + '档最多' + rule.count + '位友方NPC');

  return Object.freeze(clone(allies));
}

function describeAllies(allies, roster) {
  validateAllies(allies, roster);
  const names = allies.npcIds.map((id) => roster.get(id).name);
  if (!allies.count) return { text: '无友方NPC', names: [] };
  return { text: names.join('、') + '（' + allies.count + '位）', names };
}

module.exports = { ALLY_RULES, ruleFor, resolveOriginRank, ensureAllies, validateAllies, drawNpcIds, describeAllies };

},"/modules/src/hunt/battle.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 讨伐战模式（交接文档第七节）。
 *
 * 独立模式，不挪用转正考核或结局挑战的机会账本：
 *   0 位NPC → 1对1；1 位 → 2对1；2 位 → 3对1。
 * 不因徐太平是辅助系而自动补敌方考官、支援会员或补成2对2。
 * 本模块只产出“可交给现有行动条引擎”的队伍描述与胜负判定，不另写一套战斗循环，
 * 战斗数值仍由主游戏战斗代码结算。
 */

const { clone, uniqueIds } = require('../util');
const { EVENT_ID } = require('./conditions');
const { VERSIONS } = require('../versions');
const { tagUnitSkills } = require('../battle/skill-attributes');

const MAX_ALLIES = 3;

function buildHuntBattle(input) {
  let { player, enemy, allies = [], seed } = input;
  if (!player) throw new Error('讨伐战缺少玩家参战者');
  if (!enemy) throw new Error('讨伐战缺少十万年魂兽目标实例');
  if (!Array.isArray(allies) || allies.length > MAX_ALLIES) throw new Error('讨伐战友方NPC须为0—3位');
  if (typeof seed !== 'string' || !seed) throw new Error('讨伐战须带确定性种子');
  player = tagUnitSkills(player);
  enemy = tagUnitSkills(enemy);
  allies = allies.map(tagUnitSkills);

  const allyIds = uniqueIds(allies.map((ally) => ally.id), '讨伐战友方');
  if (allyIds.length !== allies.length) throw new Error('讨伐战友方ID重复');
  if (allyIds.includes(player.id)) throw new Error('友方NPC不能与玩家同ID');
  if (enemy.id === player.id || allyIds.includes(enemy.id)) throw new Error('魂兽目标ID与参战者冲突');

  const units = [player, ...allies, enemy];
  const plan = {
    mode: 'hunt',
    eventId: EVENT_ID,
    version: VERSIONS.huntBattle,
    seed,
    // 这些开关必须在拼接时真正限制引擎，不能只写在注释里。
    rules: {
      autoSupport: false,
      allySupport: false,
      enemySupport: false,
      supplementEnemyToTwo: false,
      allowAdmissionFighter: false,
      allowGuildmaster: false,
      consumePromotionAttempts: false,
      consumeChallengeLedger: false,
      actionBar: 'engine',
      timeLimitSeconds: null
    },
    teams: { player: [player], allies: allies.map((ally) => ally), enemy: [enemy] },
    units,
    sizes: { player: 1, allies: allies.length, enemy: 1 }
  };
  validateHuntBattle(plan);
  return plan;
}

function validateHuntBattle(plan) {
  if (!plan || plan.mode !== 'hunt') throw new Error('不是讨伐战模式');
  const sizes = plan.sizes || {};
  if (sizes.player !== 1 || sizes.enemy !== 1 || ![0, 1, 2, 3].includes(sizes.allies)) {
    throw new Error('讨伐战人数只能为1对1、2对1、3对1或4对1');
  }
  if ((plan.units || []).length !== 2 + sizes.allies) throw new Error('讨伐战单位数与人数不一致');
  const rules = plan.rules || {};
  for (const key of ['autoSupport', 'allySupport', 'enemySupport', 'supplementEnemyToTwo', 'allowAdmissionFighter', 'allowGuildmaster', 'consumePromotionAttempts', 'consumeChallengeLedger']) {
    if (rules[key] !== false) throw new Error('讨伐战不得开启 ' + key);
  }
  return true;
}

/**
 * 胜负判定。
 *
 * 胜利：魂兽按其明确退场规则被实际击败，且己方至少一名参战者存活。
 * 玩家先退场而队友最后获胜 → 团队胜利。
 * 超时、平局、逃离、认输、全灭 → 不得获得魂环与魂骨。
 */
function judgeHunt(input) {
  const outcome = input.outcome;
  const enemy = input.enemy || {};
  const survivors = Array.isArray(input.survivors) ? input.survivors.slice() : [];
  const allowed = ['victory', 'timeout', 'draw', 'escape', 'surrender', 'wipe', 'loss'];
  if (!allowed.includes(outcome)) throw new Error('讨伐结果类型无效：' + outcome);

  const defeated = enemy.defeated === true || enemy.exitRuleMet === true;
  const allyAlive = survivors.length > 0;

  if (outcome !== 'victory') {
    return { winner: ['loss', 'wipe'].includes(outcome) ? 'enemy' : 'none', loot: false, reason: 'outcome-' + outcome, defeated, allyAlive };
  }
  if (!defeated) {
    return { winner: 'none', loot: false, reason: 'beast-still-alive', defeated, allyAlive };
  }
  if (!allyAlive) {
    return { winner: 'enemy', loot: false, reason: 'team-wiped', defeated, allyAlive };
  }
  return { winner: 'team', loot: true, reason: 'beast-defeated-with-survivor', defeated, allyAlive };
}

/**
 * 战报骨架。胜败都能保存、查看、导出；记录类型必须区分为讨伐。
 * 具体战报内容由主游戏战斗快照填充，本模块只锁定“讨伐”类型与关键字段。
 */
function buildHuntReport(input) {
  const { plan, judge, target, traits, triggers, loot, preStoredRing } = input;
  if (!plan || plan.mode !== 'hunt') throw new Error('战报缺少讨伐战计划');
  if (!judge) throw new Error('战报缺少胜负判定');
  return {
    type: 'hunt',
    recordVersion: 1,
    rulesVersion: VERSIONS.huntBattle,
    targetId: target && target.id,
    targetVersion: target && target.version,
    seed: plan.seed,
    team: {
      player: plan.teams.player.map((unit) => ({ id: unit.id, name: unit.name, level: unit.level })),
      allies: plan.teams.allies.map((unit) => ({ id: unit.id, name: unit.name, level: unit.level })),
      enemy: plan.teams.enemy.map((unit) => ({ id: unit.id, name: unit.name, level: unit.level }))
    },
    traits: clone(traits || []),
    triggers: clone(triggers || []),
    result: { outcome: judge.winner, loot: judge.loot, reason: judge.reason },
    rewards: clone(loot || { rings: [], bones: [] }),
    preStoredRing: preStoredRing ? clone(preStoredRing) : null,
    savedAt: null
  };
}

/** 战报导出：与挑战战报一样可读，但格式标记为讨伐。 */
function exportHuntReport(report) {
  if (!report || report.type !== 'hunt') throw new Error('不是讨伐战报');
  return { format: 'witness-hunt-report', version: 1, report: clone(report) };
}

module.exports = { MAX_ALLIES, buildHuntBattle, validateHuntBattle, judgeHunt, buildHuntReport, exportHuntReport };

},"/modules/src/hunt/conditions.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 讨伐事件的固定触发条件（交接文档第三节）。
 *
 * 同时满足：
 *   1. 玩家等级 ≥ 80；
 *   2. 当前基础实力评级达到强级或以上（强／凶／狂／神）；
 *   3. 本角色尚未处理过该邀请，也未处于该任务流程中。
 *
 * 评级必须由角色面板与战斗共用的现行接口现算，采用实际基础面板；
 * 因此本模块不接收“显示文字”“历史最高评级”“临时战斗增益”或旧晋升标记，
 * 只接收等级、实际基础六维与一个评级函数（默认接 v11.01 的 WitnessRules.rating）。
 */

const { RATING_ORDER, RATING_MIN_FOR_HUNT, requireInteger } = require('../util');

const REQUIRED_LEVEL = 80;
const EVENT_ID = 'hunt_hundred_thousand';

function ratingIndex(label) {
  const index = RATING_ORDER.indexOf(label);
  if (index < 0) throw new Error('评级名称无效：' + label + '；只接受现行接口返回的' + RATING_ORDER.join('/'));
  return index;
}

function ratingAtLeast(label, minimum) {
  return ratingIndex(label) >= ratingIndex(minimum);
}

/**
 * @param {object} input
 * @param {number} input.level 当前等级（不是历史最高等级）
 * @param {object} input.model 实际基础面板（含 level 与 stats 六维），由角色面板现算
 * @param {function} input.ratingFn 现行评级接口，返回 {label, score, thresholds}
 * @param {object} [input.ledger] 讨伐任务账本
 */
function evaluateCondition(input) {
  const level = requireInteger(input.level, '等级', 0, 99);
  if (typeof input.ratingFn !== 'function') throw new Error('必须注入角色面板与战斗共用的评级函数');
  if (!input.model || !input.model.stats) throw new Error('缺少实际基础面板，不能用显示文字或历史评级代替');
  if (input.model.level !== undefined && input.model.level !== level) {
    throw new Error('面板等级与当前等级不一致，须用当前实际面板重算');
  }

  const rating = input.ratingFn(input.model);
  if (!rating || typeof rating.label !== 'string') throw new Error('评级接口未返回现行评级');
  if (!rating.thresholds || typeof rating.thresholds !== 'object' || !Number.isInteger(rating.thresholds.version)) {
    throw new Error('评级接口未返回门槛版本，无法确认是现行计算接口');
  }
  // 只接受带门槛版本的现行结果；旧版晋升标记或手写评级没有 thresholds。
  const labelIndex = ratingIndex(rating.label);

  const checks = {
    level: level >= REQUIRED_LEVEL,
    rating: ratingAtLeast(rating.label, RATING_MIN_FOR_HUNT),
    notHandled: !isHandled(input.ledger)
  };
  const eligible = checks.level && checks.rating && checks.notHandled;

  let reason = 'eligible';
  if (!checks.level) reason = 'level-below-80';
  else if (!checks.rating) reason = 'rating-below-qiang';
  else if (!checks.notHandled) reason = 'already-handled';

  return {
    eventId: EVENT_ID,
    eligible,
    reason,
    level,
    requiredLevel: REQUIRED_LEVEL,
    rating: { label: rating.label, score: rating.score, thresholds: rating.thresholds, labelIndex },
    minimumRating: RATING_MIN_FOR_HUNT,
    checks,
    // 固定触发：不进入普通事件权重池，也不额外投“是否触发”骰。
    randomTriggerRoll: null,
    weightPool: null
  };
}

function isHandled(ledger) {
  if (!ledger) return false;
  if (ledger.handled === true) return true;
  return !['idle', 'pending'].includes(ledger.status);
}

/**
 * 首次满足条件时登记待办；已登记或已处理时返回原状态。
 * “固定触发”不替换当前普通事件：登记只写任务账本，不消费事件次数。
 */
function registerPending(ledger, detail) {
  if (isHandled(ledger)) return { changed: false, ledger };
  const next = {
    ...ledger,
    version: ledger.version,
    eventId: EVENT_ID,
    status: 'pending',
    handled: false,
    pendingSince: ledger.pendingSince || detail && detail.at || null,
    pendingLevel: ledger.pendingLevel === undefined ? detail && detail.level : ledger.pendingLevel,
    pendingRating: ledger.pendingRating || (detail && detail.rating && detail.rating.label) || null
  };
  return { changed: true, ledger: next };
}

module.exports = { EVENT_ID, REQUIRED_LEVEL, MINIMUM_RATING: RATING_MIN_FOR_HUNT, evaluateCondition, ratingAtLeast, ratingIndex, isHandled, registerPending };

},"/modules/src/hunt/controller.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 讨伐事件控制器（交接文档第三、四、五、六、七节）。
 *
 * 固定顺序：邀请正文 → 接受／拒绝 → 接受后的队友判定 → 到场正文 → 前进 →
 * 调用十万年魂兽 → 战斗 → 结果与奖励 → 恢复原流程。
 *
 * 边界：
 *   - 条件用现行评级接口现算，不看显示文字/历史最高/临时增益；
 *   - 固定触发，不投是否触发骰，不替换当前普通事件（保留恢复点）；
 *   - 接受与拒绝本身不发经验、属性、准备值、关系、气运；
 *   - 队友在第一次接受时落盘，读档/刷新不重抽；
 *   - 到场正文严格按已保存顺序整段显示，不合并、不改写、不省略；
 *   - 空魂兽库时停在“目标资料尚未开放”，保留接受与援军结果，可返回普通流程；
 *   - 讨伐战是独立模式，不挪用餐/结局挑战机会账本。
 */

const conditions = require('./conditions');
const ledgerApi = require('./ledger');
const texts = require('./texts');
const { snapshotFlow, restoreFlow } = require('./flow');
const { evaluateCondition } = conditions;
const { ensureAllies, validateAllies, resolveOriginRank } = require('./allies');
const { buildHuntBattle, judgeHunt, buildHuntReport } = require('./battle');
const { PENDING } = require('../versions');

const DEFAULT_CONFIG = Object.freeze({
  modes: { journey: true, trial: false },
  recordJourneyOnly: true,
  allowRerollAllies: false
});

function createHuntController(options) {
  const roster = options && options.roster;
  const ratingFn = options && options.ratingFn;
  const library = options && options.library;
  const config = {
    ...DEFAULT_CONFIG,
    ...(options && options.config),
    modes: { ...DEFAULT_CONFIG.modes, ...((options && options.config && options.config.modes) || {}) }
  };
  if (!roster) throw new Error('讨伐控制器缺少友方NPC名录');
  if (typeof ratingFn !== 'function') throw new Error('讨伐控制器缺少现行评级接口');
  if (!library) throw new Error('讨伐控制器缺少十万年魂兽库');

  function modeEnabled(mode) {
    return !!(config.modes && config.modes[mode]);
  }

  function evaluate(input) {
    const mode = input.mode || 'journey';
    if (!modeEnabled(mode)) {
      return { eventId: conditions.EVENT_ID, eligible: false, reason: 'mode-disabled', mode, level: input.level, randomTriggerRoll: null, weightPool: null };
    }
    const result = evaluateCondition({ level: input.level, model: input.model, ratingFn, ledger: input.ledger });
    return { ...result, mode, recordCompletion: mode === 'journey' || !config.recordJourneyOnly };
  }

  /**
   * 安全节点检查 + 登记待办 + 展示邀请。
   * presentationKey 用于幂等：同一安全节点重复调用不会第二次弹出。
   */
  function consider(input) {
    const mode = input.mode || 'journey';
    const condition = evaluate({ ...input, mode });
    if (!condition.eligible) {
      return { ledger: ledgerApi.normalize(input.ledger), condition, presentation: null, deduped: input.ledger && input.ledger.status === 'invitation' };
    }

    let ledger = ledgerApi.normalize(input.ledger);
    // 先确认安全节点，再登记待办：读档预览/面板刷新/战斗动画里不得留下任务痕迹。
    texts.assertSafeNode(input.safeNode);
    if (ledger.status === 'idle') {
      const restorePoint = input.flow ? snapshotFlow(input.flow) : null;
      ledger = ledgerApi.registerPending(ledger, {
        at: input.at === undefined ? null : input.at,
        level: condition.level,
        rating: condition.rating.label,
        mode,
        recordCompletion: condition.recordCompletion,
        restorePoint
      }).ledger;
    }
    if (ledger.status !== 'pending') {
      return { ledger, condition, presentation: null, deduped: ledger.status === 'invitation' };
    }
    const key = input.key || ('hunt:' + (input.at === undefined ? condition.level : input.at));
    if (ledger.presentations.includes(key)) return { ledger, condition, presentation: null, deduped: true };
    ledger = ledgerApi.presentInvitation(ledger, key);
    return {
      ledger,
      condition,
      presentation: { kind: 'invitation', ...texts.invitationView(), mode, recordCompletion: condition.recordCompletion }
    };
  }

  /**
   * 接受／拒绝。接受时先落盘友方阵容，再给出共同正文与到场正文。
   * option 只接受定稿的两个选项文字。
   */
  function choose(input) {
    const ledger = ledgerApi.normalize(input.ledger);
    if (ledger.status !== 'invitation') throw new Error('当前不在邀请阶段，不能选择接受或拒绝');
    const option = input.option;
    if (!texts.TEXTS.invitation.options.includes(option)) throw new Error('邀请选项无效：' + option);

    if (option === '拒绝') {
      const next = ledgerApi.refuse(ledger);
      return { ledger: next, accepted: false, texts: texts.refusalView(), restore: restoreFlowOrNull(next) };
    }

    const originRank = input.originRank === undefined ? resolveOriginRank(input.character) : input.originRank;
    if (!Number.isInteger(originRank) || originRank < 1 || originRank > 10) throw new Error('接受时须提供角色建立时的家境档位');
    const allies = ledger.allies
      ? validateAllies(ledger.allies, roster, originRank)
      : ensureAllies({ originRank, roster, rng: input.rng });
    let next = ledgerApi.accept(ledger, allies, { at: input.at });
    next = ledgerApi.arrive(next);
    return {
      ledger: next,
      accepted: true,
      allies,
      acceptedText: texts.acceptedView(),
      arrival: texts.arrivalView(roster, allies.npcIds),
      note: '接受本身不发经验、属性、准备值、关系或气运；到达场正文后必须点前进才进入狩猎。'
    };
  }

  /**
   * 前进：首次确定并立即冻结目标；空库则停在待办，不空战、不自动胜利、不发占位奖励。
   * 需要玩家单位与友方单位供拼接层构建队伍。
   */
  function forward(input) {
    const ledger = ledgerApi.normalize(input.ledger);
    if (!['arrival', 'forwarded', 'awaiting-library'].includes(ledger.status)) throw new Error('只有到场正文之后、或空库待办中才能前进');

    const picked = library.pick({ frozen: ledger.target, rng: input.rng });
    if (picked.empty) {
      const waiting = ledgerApi.setTarget(ledger, null);
      return { ledger: waiting, pending: true, reason: PENDING.EMPTY_BEAST_LIBRARY, message: '目标资料尚未开放', allies: waiting.allies };
    }
    const next = ledgerApi.setTarget(ledger, picked.target);
    const expected = ledger.allies.npcIds;
    const supplied = input.allyUnits || [];
    if (supplied.length !== expected.length || supplied.some((unit, i) => unit.npcId !== expected[i])) {
      throw new Error('参战友方NPC与已冻结的援军名单或顺序不一致');
    }
    const target = picked.target.snapshot;
    const enemyInstance = library.buildInstance({ snapshot: picked.target.snapshot, instanceId: 'beast:' + target.id });
    const plan = buildHuntBattle({
      player: input.playerUnit,
      allies: input.allyUnits || [],
      enemy: enemyInstance,
      seed: ledger.battleSeed || input.seed
    });
    return {
      ledger: { ...next, battleSeed: ledger.battleSeed || input.seed },
      pending: false,
      target: { id: target.id, version: target.version },
      encounter: { name: target.name, years: target.years, battleText: target.battleText, lifeType: target.lifeType, traitIds: target.traits.map((trait) => trait.id) },
      battlePlan: plan,
      roll: picked.roll
    };
  }

  function startBattle(ledger, sessionId) {
    return ledgerApi.startBattle(ledger, sessionId);
  }

  /** 结算：超时/平局/逃离/认输/全灭都不给环与骨。 */
  function resolve(input) {
    const ledger = ledgerApi.normalize(input.ledger);
    if (ledger.status !== 'battle') throw new Error('当前不在讨伐战斗中');
    if (!input.plan || input.plan.mode !== 'hunt') throw new Error('结算缺少讨伐战计划');
    if (input.plan.teams.enemy[0].definitionId !== ledger.target.id) throw new Error('结算目标与冻结魂兽不一致');
    const friendlyIds = [...input.plan.teams.player, ...input.plan.teams.allies].map((unit) => unit.id);
    if ((input.survivors || []).some((id) => !friendlyIds.includes(id))) throw new Error('存活者不属于本次讨伐友方');
    const judge = judgeHunt({ outcome: input.outcome, enemy: input.enemy, survivors: input.survivors });
    const next = ledgerApi.resolveBattle(ledger, judge);
    const report = buildHuntReport({ plan: input.plan, judge, target: ledger.target, traits: input.traits, triggers: input.triggers });
    return {
      ledger: next,
      judge,
      report,
      firstWin: judge.loot && ledger.status === 'battle',
      restore: restoreFlowOrNull(next)
    };
  }

  function restoreFlowOrNull(ledger) {
    return ledger.restorePoint ? restoreFlow(ledger.restorePoint) : null;
  }

  /** 读档/刷新时只校验，不重抽队友、不换目标。 */
  function validate(ledger) {
    ledgerApi.validate(ledger);
    if (ledger.allies) validateAllies(ledger.allies, roster, ledger.allies.originRank);
    return true;
  }

  return Object.freeze({ evaluate, consider, choose, forward, startBattle, resolve, validate, restoreFlow: restoreFlowOrNull, summary: ledgerApi.summary });
}

module.exports = { createHuntController, DEFAULT_CONFIG };

},"/modules/src/hunt/flow.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 原普通流程的恢复点（交接文档第三、四节）。
 *
 * “固定触发”不等于替换当前普通事件：触发前记录原流程恢复点；
 * 拒绝或讨伐流程结束后，恢复原先未完成的普通流程，
 * 不能吞掉一次事件、重复发放原事件奖励或推进额外培养阶段。
 *
 * 本模块不解释流程内部字段，只做三件事：
 *   1. 取快照（深拷贝 + 核心字段指纹）；
 *   2. 恢复快照（返回新对象，不改调用方对象）；
 *   3. 对比恢复前后的“已消费/已发放”计数，证明没有多吞或多发。
 */

const { clone, isPlainObject } = require('../util');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}

function fingerprint(value) {
  let h = 2166136261;
  for (const ch of stableStringify(value)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const COUNTER_FIELDS = Object.freeze(['completed', 'consumedEvents', 'eventCount', 'quarter', 'rewardsGranted', 'stage']);

/** 记录恢复点。flow 为当前普通流程的只读副本；不修改传入对象。 */
function snapshotFlow(flow) {
  if (!isPlainObject(flow)) throw new Error('恢复点须建立在普通流程对象上');
  const snapshot = clone(flow);
  return Object.freeze({
    version: 1,
    phase: snapshot.phase === undefined ? null : snapshot.phase,
    fingerprint: fingerprint(snapshot),
    counters: Object.fromEntries(
      COUNTER_FIELDS.filter((key) => snapshot[key] !== undefined).map((key) => [key, clone(snapshot[key])])
    ),
    snapshot
  });
}

/** 恢复原流程：返回深拷贝，不返回快照本体，避免后续被任务流程改写。 */
function restoreFlow(restorePoint) {
  if (!isPlainObject(restorePoint) || restorePoint.version !== 1 || !isPlainObject(restorePoint.snapshot)) {
    throw new Error('恢复点无效');
  }
  return clone(restorePoint.snapshot);
}

/**
 * 证明恢复前后没有多吞事件、多发奖励或多推进培养：
 * 只比较双方都存在的计数，缺字段不算差异（旧流程结构可能没有这些字段）。
 */
function compareFlow(before, after) {
  const diffs = [];
  for (const key of COUNTER_FIELDS) {
    if (before[key] === undefined || after[key] === undefined) continue;
    if (stableStringify(before[key]) !== stableStringify(after[key])) {
      diffs.push({ field: key, before: clone(before[key]), after: clone(after[key]) });
    }
  }
  return { equal: diffs.length === 0, diffs, comparedFields: COUNTER_FIELDS.filter((key) => before[key] !== undefined && after[key] !== undefined) };
}

/** 断言恢复点仍指向同一份流程（防止把 A 角色的恢复点用回 B 角色）。 */
function assertSameFlow(restorePoint, flow, label) {
  if (!isPlainObject(flow)) throw new Error((label || '流程') + '对象无效');
  if (fingerprint(flow) !== restorePoint.fingerprint) {
    throw new Error('恢复点与当前流程不一致：中间已推进或更换了流程，不能直接回滚');
  }
  return true;
}

module.exports = { snapshotFlow, restoreFlow, compareFlow, assertSameFlow, fingerprint, COUNTER_FIELDS };

},"/modules/src/hunt/ledger.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 讨伐任务账本（每角色一份）。
 *
 * 只记录本角色与这次固定邀请有关的状态：是否登记、是否展示、接受/拒绝、
 * 已落盘的队友、已冻结的目标、战斗场次、结果与奖励事务ID、恢复点。
 * 不加经验、不加属性、不发准备值、不改关系或气运——这些不属于邀请本身的收益。
 */

const { clone, isPlainObject } = require('../util');
const { EVENT_ID } = require('./conditions');
const { VERSIONS } = require('../versions');

const STATUSES = Object.freeze([
  'idle',
  'pending',
  'invitation',
  'refused',
  'accepted',
  'arrival',
  'forwarded',
  'awaiting-library',
  'battle',
  'won',
  'lost'
]);

const TERMINAL = Object.freeze(['refused', 'won', 'lost']);

const ALLOWED = Object.freeze({
  idle: ['pending'],
  pending: ['invitation'],
  invitation: ['refused', 'accepted'],
  refused: [],
  accepted: ['arrival'],
  arrival: ['forwarded', 'awaiting-library'],
  forwarded: ['battle', 'awaiting-library'],
  'awaiting-library': ['forwarded'],
  battle: ['won', 'lost'],
  won: [],
  lost: ['forwarded']
});

function createLedger() {
  return {
    version: VERSIONS.huntLedger,
    eventId: EVENT_ID,
    status: 'idle',
    handled: false,
    refused: false,
    pendingSince: null,
    pendingLevel: null,
    pendingRating: null,
    mode: 'journey',
    recordCompletion: true,
    acceptedAt: null,
    allies: null,
    target: null,
    battleSessionId: null,
    result: null,
    rewardTransactionId: null,
    restorePoint: null,
    presentations: [],
    history: []
  };
}

function normalize(raw) {
  if (raw === undefined || raw === null) return createLedger();
  if (!isPlainObject(raw)) throw new Error('讨伐任务账本无效');
  const ledger = { ...createLedger(), ...clone(raw) };
  if (ledger.version !== VERSIONS.huntLedger) {
    throw new Error('讨伐任务账本版本不一致：' + ledger.version + '，当前 ' + VERSIONS.huntLedger);
  }
  if (!STATUSES.includes(ledger.status)) throw new Error('讨伐任务状态无效：' + ledger.status);
  if (!Array.isArray(ledger.presentations)) throw new Error('讨伐展示记录无效');
  if (!Array.isArray(ledger.history)) throw new Error('讨伐历史记录无效');
  return ledger;
}

function validate(raw) {
  const ledger = normalize(raw);
  if (ledger.status === 'refused' && ledger.refused !== true) throw new Error('拒绝状态缺少拒绝标记');
  if (['accepted', 'arrival', 'forwarded', 'awaiting-library', 'battle', 'won', 'lost'].includes(ledger.status) && !ledger.allies) {
    throw new Error('已接受的讨伐缺少友方阵容结果');
  }
  if (ledger.allies && (!Array.isArray(ledger.allies.npcIds) || !Number.isInteger(ledger.allies.count))) {
    throw new Error('友方阵容结果无效');
  }
  if (ledger.target) {
    if (typeof ledger.target.id !== 'string' || !ledger.target.id) throw new Error('已冻结目标缺少稳定ID');
    if (!Number.isInteger(ledger.target.version)) throw new Error('已冻结目标缺少定义版本');
  }
  if (ledger.presentations.some((x) => typeof x !== 'string' || !x)) throw new Error('展示键无效');
  if (new Set(ledger.presentations).size !== ledger.presentations.length) throw new Error('展示键重复');
  return true;
}

function transition(ledger, to, patch, note) {
  const current = normalize(ledger);
  if (!ALLOWED[current.status].includes(to)) throw new Error('讨伐任务不能从 ' + current.status + ' 进入 ' + to);
  const next = {
    ...current,
    ...clone(patch || {}),
    version: VERSIONS.huntLedger,
    eventId: EVENT_ID,
    status: to,
    history: [...current.history, { from: current.status, to, note: note || null, index: current.history.length }]
  };
  if (['refused', 'won', 'lost'].includes(to)) next.handled = true;
  validate(next);
  return next;
}

function registerPending(ledger, detail = {}) {
  const current = normalize(ledger);
  if (current.status !== 'idle') return { changed: false, ledger: current };
  const next = transition(current, 'pending', {
    pendingSince: detail.at === undefined ? null : detail.at,
    pendingLevel: detail.level === undefined ? null : detail.level,
    pendingRating: detail.rating === undefined ? null : detail.rating,
    mode: detail.mode || 'journey',
    recordCompletion: detail.recordCompletion !== false,
    restorePoint: detail.restorePoint === undefined ? null : clone(detail.restorePoint)
  }, 'fixed-trigger');
  return { changed: true, ledger: next };
}

function presentInvitation(ledger, presentationKey) {
  const current = normalize(ledger);
  if (current.status !== 'pending') throw new Error('只有待办状态可以展示讨伐邀请');
  if (typeof presentationKey !== 'string' || !presentationKey) throw new Error('展示须带幂等键');
  if (current.presentations.includes(presentationKey)) throw new Error('同一安全节点不能重复弹出讨伐邀请');
  return transition(current, 'invitation', { presentations: [...current.presentations, presentationKey] }, 'present-invitation');
}

function refuse(ledger) {
  return transition(ledger, 'refused', { refused: true, allies: null, target: null }, 'refuse');
}

function accept(ledger, allies, detail = {}) {
  if (!allies) throw new Error('接受后必须落盘友方阵容结果');
  return transition(ledger, 'accepted', {
    acceptedAt: detail.at === undefined ? null : detail.at,
    allies: clone(allies)
  }, 'accept');
}

function arrive(ledger) {
  return transition(ledger, 'arrival', {}, 'arrival-text');
}

function setTarget(ledger, target) {
  const current = normalize(ledger);
  if (!['arrival', 'forwarded', 'awaiting-library'].includes(current.status)) {
    throw new Error('当前阶段不能确定魂兽目标：' + current.status);
  }
  if (!target) {
    if (current.status === 'awaiting-library') return current;
    return transition(current, 'awaiting-library', { target: null }, 'library-empty');
  }
  if (typeof target.id !== 'string' || !target.id) throw new Error('魂兽目标缺少稳定ID');
  if (!Number.isInteger(target.version)) throw new Error('魂兽目标缺少定义版本');
  if (current.status === 'forwarded') {
    // 目标已冻结：重开界面沿用原目标，不重抽。
    return { ...current, target: clone(target), history: [...current.history, { from: 'forwarded', to: 'forwarded', note: 'target-reused', index: current.history.length }] };
  }
  return transition(current, 'forwarded', { target: clone(target) }, 'target-frozen');
}

function startBattle(ledger, battleSessionId) {
  if (typeof battleSessionId !== 'string' || !battleSessionId) throw new Error('讨伐战斗缺少唯一场次ID');
  return transition(ledger, 'battle', { battleSessionId }, 'battle-start');
}

function resolveBattle(ledger, result) {
  const won = !!(result && result.loot === true);
  return transition(ledger, won ? 'won' : 'lost', { result: clone(result || {}) }, won ? 'win' : 'not-win');
}

function resumeFromPending(ledger) {
  const current = normalize(ledger);
  if (current.status !== 'awaiting-library') throw new Error('只有空库待办状态可以继续');
  return { ...current, status: 'forwarded', history: [...current.history, { from: 'awaiting-library', to: 'forwarded', note: 'library-ready', index: current.history.length }] };
}

function setReward(ledger, rewardTransactionId) {
  const current = normalize(ledger);
  return { ...current, rewardTransactionId };
}

function isTerminal(ledger) {
  const current = normalize(ledger);
  return TERMINAL.includes(current.status);
}

function summary(ledger) {
  const current = normalize(ledger);
  return {
    status: current.status,
    handled: current.handled,
    refused: current.refused,
    mode: current.mode,
    recordCompletion: current.recordCompletion,
    allyIds: current.allies ? current.allies.npcIds.slice() : [],
    target: current.target ? { id: current.target.id, version: current.target.version } : null,
    battleSessionId: current.battleSessionId,
    result: current.result,
    rewardTransactionId: current.rewardTransactionId,
    hasRestorePoint: !!current.restorePoint
  };
}

module.exports = {
  STATUSES,
  TERMINAL,
  ALLOWED,
  createLedger,
  normalize,
  validate,
  transition,
  registerPending,
  presentInvitation,
  refuse,
  accept,
  arrive,
  setTarget,
  startBattle,
  resolveBattle,
  resumeFromPending,
  setReward,
  isTerminal,
  summary
};

},"/modules/src/hunt/texts.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 定稿叙事文本查询。文本本体由 tools/extract-texts.cjs 从交接文档机械提取，
 * 本文件只负责按流程顺序取用，不改写、不合并、不省略。
 */

const TEXTS = require('../text/hunt-texts.generated');

const SAFE_NODES = Object.freeze(['growth-settled', 'hunt-settled', 'battle-settled']);
const UNSAFE_NODES = Object.freeze(['read-preview', 'panel-refresh', 'battle-animation', 'loading', 'battle']);
const ALL_SAFE = Object.freeze([...SAFE_NODES, ...UNSAFE_NODES]);

function assertSafeNode(node) {
  if (!ALL_SAFE.includes(node)) throw new Error('未知的剧情节点：' + node + '；不能把邀请塞进读档预览、面板刷新或战斗动画');
  if (!SAFE_NODES.includes(node)) throw new Error('当前节点不是安全节点：' + node + '；讨伐邀请只能在不可分割的结算完成之后展示');
  return node;
}

/** 邀请正文：标题单独给出（渲染为标题行），正文两段；正文下只给「接受」「拒绝」两个选项。 */
function invitationView() {
  return {
    eventId: TEXTS.eventId,
    title: TEXTS.title,
    paragraphs: TEXTS.invitation.paragraphs.slice(1),
    allParagraphs: TEXTS.invitation.paragraphs.slice(),
    options: TEXTS.invitation.options.slice(),
    noOptionRewards: true
  };
}

function refusalView() {
  return { paragraphs: TEXTS.refusal.slice(), options: [] };
}

function acceptedView() {
  return { paragraphs: TEXTS.accepted.slice() };
}

/** 到场正文。必须传入已保存的顺序；0位/1位/2位由名录决定。 */
function arrivalView(roster, npcIds) {
  if (!Array.isArray(npcIds) || npcIds.length > 3) throw new Error('到场阵容须为0—3位友方NPC');
  return {
    npcIds: npcIds.slice(),
    paragraphs: roster.arrivalParagraphs(npcIds),
    advanceOption: TEXTS.advance
  };
}

function advanceLabel() {
  return TEXTS.advance;
}

module.exports = { TEXTS, SAFE_NODES, UNSAFE_NODES, assertSafeNode, invitationView, refusalView, acceptedView, arrivalView, advanceLabel };

},"/modules/src/npc/combat.js":function(require,module,exports,__dirname){
'use strict';

/**
 * NPC战斗适配（交接文档第十八、十九节）。
 *
 * 交接文档明确：名录里的 skills[].operations 与 implementation 只是待实现规范，
 * 不能直接当旧引擎原生技能使用。本模块做两件事：
 *   1. buildUnit：把名录里的实际面板、八魂技、特性转成“可进入现有行动条”的单位描述；
 *      等级、面板不随玩家等级缩放；费用/读条/冷却/倍率都用名录已核算的值。
 *   2. runSkill / dispatch：把 operations 映射到宿主（主游戏战斗引擎）原语，
 *      特性则用状态机计算应发生的效果，再由拼接层交给同一组战斗事件。
 *
 * 本模块不实现伤害公式，不维护第二套基础数值；宿主缺少某个原语时显式抛错，
 * 而不是静默跳过（“界面展示完整特性却实际无效”是交接文档禁止的）。
 */

const chengliang = require('./traits/chengliang');
const xutaiping = require('./traits/xutaiping');
const sailiya = require('./traits/sailiya');
const { VERSIONS } = require('../versions');
const { clone } = require('../util');
const { tagSkill } = require('../battle/skill-attributes');

const TRAITS = Object.freeze({ chengliang, xutaiping, sailiya_fengzhi: sailiya });
const EXPECTED_TRAITS = Object.freeze({ chengliang: ['周天格阵', '六库仙贼', '易中日月'], xutaiping: ['深暗', '灯灭'], sailiya_fengzhi: ['承露符锋', '秘元归宿体'] });

/** 宿主需提供的战斗原语。每一项都对应现有引擎里真实存在的结算环节。 */
const PRIMITIVES = Object.freeze([
  'directAttack', 'partitionedAttack', 'channeledAttack', 'areaAttack', 'conditionalControl',
  'controlContest', 'debuffContest', 'numericDebuff', 'gaugeLoss', 'addShield', 'reduceOuterShield',
  'heal', 'statUp', 'battleStatUp', 'attackUp', 'hpCost', 'charge', 'evasion', 'phaseAvoid',
  'oneHitReduction', 'reserveEnergy', 'hitRelease', 'accuracyBuff', 'castMultiplier', 'lamps',
  'transferDebuff', 'hitContestOnce'
]);

const OPS = Object.freeze({
  next_attack_skill_accuracy: { primitive: 'accuracyBuff', build: (op) => ({ points: op.points, uses: op.uses, ttlSeconds: op.ttlSeconds }) },
  next_attack_skill_cast_multiplier: { primitive: 'castMultiplier', build: (op) => ({ value: op.value, sharedUse: !!op.sharedUse }) },
  one_hit_damage_reduction: { primitive: 'oneHitReduction', build: (op) => ({ value: op.value, channels: op.channels, ttlSeconds: op.ttlSeconds, directOnly: !!op.directOnly }) },
  control_contest: { primitive: 'controlContest', build: (op) => ({ baseSeconds: op.baseSeconds, ratio: op.ratio, interrupt: !!op.interrupt, gaugeCeiling: op.gaugeCeiling, immunitySeconds: op.immunitySeconds, deepDarkEligible: op.deepDarkEligible !== false }) },
  shield: { primitive: 'addShield', build: (op) => ({ coefficient: op.coefficient, power: op.power, ttlSeconds: op.ttlSeconds }) },
  reserve_absorbed_energy: { primitive: 'reserveEnergy', build: (op) => ({ rate: op.rate, capMaxHP: op.capMaxHP, ttlSeconds: op.ttlSeconds, slots: op.slots }) },
  next_attack_skill_hit_release: { primitive: 'hitRelease', build: (op) => ({ channel: op.channel, mitigated: !!op.mitigated }) },
  phase_avoid_once: { primitive: 'phaseAvoid', build: (op) => ({ channels: op.channels, ttlSeconds: op.ttlSeconds, directOnly: !!op.directOnly, breakOnOffense: !!op.breakOnOffense }) },
  direct_attack: { primitive: 'directAttack', build: (op) => ({ channel: op.channel, factor: op.factor, accuracyPoints: op.accuracyPoints || 0, reuseHit: !!op.reuseHit }) },
  temporary_stat_up: { primitive: 'statUp', build: (op) => ({ values: op.values, ttlSeconds: op.ttlSeconds, refreshOnly: !!op.refreshOnly, refillResources: !!op.refillResources }) },
  hit_contest_once: { primitive: 'hitContestOnce', build: () => ({}) },
  reduce_outer_life_shield: { primitive: 'reduceOuterShield', build: (op) => ({ coefficient: op.coefficient, power: op.power, layers: op.layers, damageIfNoShield: op.damageIfNoShield || 0 }) },
  debuff_contest: { primitive: 'debuffContest', build: (op) => ({ perTarget: !!op.perTarget, once: !!op.once }) },
  delayed_three_lamps: { primitive: 'lamps', build: (op) => ({ targetId: null, intervalSeconds: op.intervalSeconds, lamps: op.lamps, timeoutSeconds: op.timeoutSeconds, pauseOnOwnerControl: !!op.pauseOnOwnerControl, dispelEligible: !!op.dispelEligible, removeIncompleteOnOwnerDefeat: !!op.removeIncompleteOnOwnerDefeat, slotsPerTarget: op.slotsPerTarget }) },
  numeric_debuff: { primitive: 'numericDebuff', build: (op, ctx) => numericDebuffPayload(op, ctx) },
  transfer_one_dispellable_numeric_debuff: { primitive: 'transferDebuff', build: (op) => ({ exclude: op.exclude, receiver: op.receiver, magnitudeMultiplier: op.magnitudeMultiplier, keepSource: !!op.keepSource, keepRemainingTime: !!op.keepRemainingTime, lifetime: op.lifetime, keepStacks: !!op.keepStacks, capacity: op.capacity, reapplyAmplifier: !!op.reapplyAmplifier }) },
  battle_stat_up: { primitive: 'battleStatUp', build: (op) => ({ values: op.values, lifetime: op.lifetime, sameSourcePolicy: op.sameSourcePolicy, refillResources: !!op.refillResources }) },
  battle_attack_up: { primitive: 'attackUp', build: (op) => ({ channel: op.channel, value: op.value, lifetime: op.lifetime, sameSourcePolicy: op.sameSourcePolicy, extraActions: op.extraActions || 0 }) },
  partitioned_attack: { primitive: 'partitionedAttack', build: (op) => ({ channel: op.channel, factor: op.factor, parts: op.parts, hitPolicy: op.hitPolicy, sharedCast: !!op.sharedCast, sharedRuneActivation: !!op.sharedRuneActivation }) },
  conditional_control_contest: { primitive: 'conditionalControl', build: (op) => ({ condition: op.condition, baseSeconds: op.baseSeconds, immunitySeconds: op.immunitySeconds, interrupt: !!op.interrupt }) },
  hp_cost: { primitive: 'hpCost', build: (op) => ({ maxHPRate: op.maxHPRate, mustRemainAlive: !!op.mustRemainAlive, countsAsDamage: !!op.countsAsDamage }) },
  charged_attack_modifier: { primitive: 'charge', build: (op) => ({ rawMultiplier: op.rawMultiplier, charges: op.charges, maxCharges: op.maxCharges, lifetime: op.lifetime, recastPolicy: op.recastPolicy, consumePerCast: op.consumePerCast, applyToMainAttackOnly: !!op.applyToMainAttackOnly }) },
  channeled_partitioned_attack: { primitive: 'channeledAttack', build: (op) => ({ channel: op.channel, factor: op.factor, parts: op.parts, intervalSeconds: op.intervalSeconds, hitPolicy: op.hitPolicy, interruptible: !!op.interruptible, blockOtherActions: !!op.blockOtherActions, sharedRuneActivation: !!op.sharedRuneActivation, unexecutedParts: op.unexecutedParts }) },
  one_use_evasion: { primitive: 'evasion', build: (op) => ({ incomingHitPoints: op.incomingHitPoints, uses: op.uses, lifetime: op.lifetime, channels: op.channels, directOnly: !!op.directOnly, consumeOnHitAttempt: !!op.consumeOnHitAttempt, ignoreAgainst: op.ignoreAgainst, maxStoredUses: op.maxStoredUses }) },
  budgeted_area_attack: { primitive: 'areaAttack', build: (op) => ({ channel: op.channel, factor: op.factor, totalBudgetFixed: !!op.totalBudgetFixed, splitPolicy: op.splitPolicy, hitPolicy: op.hitPolicy, missedShares: op.missedShares, sharedRuneActivation: !!op.sharedRuneActivation }) }
});

function numericDebuffPayload(op, ctx) {
  const values = { ...op.values };
  const multipliers = {};
  if (ctx && ctx.npcId === 'xutaiping' && ctx.traitState) {
    for (const field of Object.keys(values)) {
      if (!Object.prototype.hasOwnProperty.call(xutaiping.constants.CAPS, field)) continue;
      if (op.amplifierSnapshot === 'none') continue;
      const amplified = xutaiping.amplify(ctx.traitState, {
        targetId: ctx.targetId,
        field,
        baseValue: values[field],
        snapshotAt: op.amplifierSnapshot === 'curse_resolution_before_group' ? ctx.at : ctx.castStartedAt
      });
      values[field] = amplified.value;
      multipliers[field] = amplified.multiplier;
    }
  }
  return {
    values,
    multipliers,
    lifetime: op.lifetime || 'battle',
    sameSourcePolicy: op.sameSourcePolicy,
    paidSoulSkillsOnly: !!op.paidSoulSkillsOnly,
    instant: !!op.instant,
    onlyBeforeCast: !!op.onlyBeforeCast,
    floor: op.floor,
    oncePerCast: !!op.oncePerCast,
    trigger: op.trigger,
    damageSources: op.damageSources,
    amplifierSnapshot: op.amplifierSnapshot
  };
}

/** 把名录技能转成宿主可读结构；不删 operations，另存为 npcOperations 以便逐步实现。 */
function toEngineSkill(definition, skill, index) {
  if (!skill || typeof skill.category !== 'string') throw new Error(definition.id + ' 的第' + (index + 1) + '技能缺少类别');
  for (const key of ['cost', 'cast', 'cooldown']) if (!Number.isFinite(skill[key])) throw new Error(definition.id + ' 技能「' + skill.name + '」缺少' + key);
  return tagSkill({
    id: skill.id || definition.id + '-skill-' + (index + 1),
    name: skill.name,
    ring: skill.ring || index + 1,
    years: skill.years,
    category: skill.category,
    channel: skill.channel,
    target: skill.target,
    Q: skill.Q,
    q: skill.q,
    K: skill.K,
    factor: skill.factor,
    budgetFactor: skill.budgetFactor,
    cost: skill.cost,
    costPercent: skill.costPercent,
    cast: skill.cast,
    cooldown: skill.cooldown,
    baseControl: skill.baseControl,
    role: skill.role,
    effect: skill.effect,
    npcOperations: clone(skill.operations || []),
    source: { registry: '友方npc', npcId: definition.id }
  }, definition.soul);
}

function buildUnit(input) {
  const { definition, id, team } = input;
  if (!definition || !definition.id) throw new Error('缺少友方NPC名录定义');
  if (typeof id !== 'string' || !id) throw new Error('NPC战斗单位缺少ID');
  if (!definition.model || !definition.model.derived) throw new Error('NPC缺少实际面板，不能参战');
  if (!Array.isArray(definition.skills) || definition.skills.length !== 8) throw new Error('NPC应有八个魂技');
  const skills = definition.skills.map((skill, index) => toEngineSkill(definition, skill, index));
  const progress = input.permanentProgress || definition.permanentProgress || {};
  const thiefQi = Math.max(0, Math.min(10, Number(progress.thiefQiStacks) || 0));
  return {
    id,
    npcId: definition.id,
    name: definition.name,
    team,
    level: definition.level,
    soul: clone(definition.soul),
    style: definition.style,
    release: definition.release,
    model: clone(definition.model),
    skills,
    traits: clone(definition.traits),
    // 永久盗气只在构建时给一次肉体强度倍率；不写回模型、不每次参战重复加算、不用于展示评级。
    permanentProgress: clone(progress),
    bodyMultiplier: 1 + 0.1 * thiefQi,
    bodyMultiplierApplied: false,
    source: '友方npc',
    levelScaling: 'fixed',
    adapterVersion: VERSIONS.npcCombatAdapter
  };
}

/**
 * 执行一次NPC技能：按 operations 顺序调用宿主原语。
 * ctx: { npcId, traitState, targetId, castStartedAt, at }
 */
function runSkill(input) {
  const { unit, skill, host } = input;
  if (!unit || !skill) throw new Error('执行NPC技能缺少单位或技能');
  if (!host) throw new Error('执行NPC技能缺少战斗宿主');
  // 先整体检查，避免前半招已经扣血，后半招才因缺处理器抛错。
  for (const op of skill.npcOperations || []) {
    const executor = OPS[op.type];
    if (!executor) throw new Error('未实现的技能操作：' + op.type);
    if (typeof host[executor.primitive] !== 'function') throw new Error('宿主缺少战斗原语 ' + executor.primitive);
  }
  const ctx = { npcId: unit.npcId, traitState: input.traitState, targetId: input.targetId, castStartedAt: input.castStartedAt, at: input.at };
  const calls = [];
  for (const op of skill.npcOperations || []) {
    const executor = OPS[op.type];
    if (!executor) throw new Error('未实现的技能操作：' + op.type + '（技能「' + skill.name + '」）');
    const primitive = executor.primitive;
    if (typeof host[primitive] !== 'function') throw new Error('宿主缺少战斗原语 ' + primitive + '，不能真正执行「' + skill.name + '」的 ' + op.type);
    const payload = executor.build(op, ctx);
    const tagged = tagSkill(skill, unit.soul);
    payload.attribute = tagged.attribute;
    payload.elements = tagged.elements;
    payload.attributeTags = tagged.attributeTags;
    if (payload.targetId === null) payload.targetId = ctx.targetId;
    const result = host[primitive](payload);
    calls.push({ type: op.type, primitive, payload, result: result === undefined ? null : result });
  }
  return { skill: skill.name, calls };
}

function coverage() {
  return Object.keys(OPS).map((type) => ({ type, primitive: OPS[type].primitive, implemented: true }));
}

/** 正式讨伐前的显式就绪报告；缺原语或技能操作缺失就返回 ready:false。 */
function assertCombatReady(definition) {
  const missing = [];
  if (!TRAITS[definition && definition.id]) missing.push('trait-adapter-missing');
  if (!definition || !definition.implementation) missing.push('implementation-missing');
  if (definition && definition.implementation && definition.implementation.integrated !== false) missing.push('source-status-mismatch');
  if (definition && (!Array.isArray(definition.skills) || definition.skills.length !== 8)) missing.push('skill-count-mismatch');
  const expected = EXPECTED_TRAITS[definition && definition.id] || [];
  const actual = (definition && definition.traits || []).map((trait) => trait.name);
  for (const name of expected) if (!actual.includes(name)) missing.push('trait-missing:' + name);
  const unimplemented = [];
  for (const skill of (definition && definition.skills) || []) {
    for (const op of skill.operations || []) if (!OPS[op.type]) unimplemented.push(skill.name + ':' + op.type);
  }
  return { ready: missing.length === 0 && unimplemented.length === 0, missing, unimplementedOperations: unimplemented, operationTypes: Object.keys(OPS).length, traits: expected };
}

/** 正式讨伐前检查宿主是否真的提供全部所需原语；缺一项就列出，不靠运行时逐个爆。 */
function assertHostReady(host, definition) {
  if (!host) throw new Error('缺少战斗宿主');
  const missing = new Set();
  if (!definition || !Array.isArray(definition.skills) || !definition.skills.length) missing.add('definition-or-skills-missing');
  for (const skill of (definition && definition.skills) || []) {
    for (const op of skill.operations || []) {
      const executor = OPS[op.type];
      if (!executor) missing.add('operation:' + op.type);
      else if (typeof host[executor.primitive] !== 'function') missing.add('primitive:' + executor.primitive);
    }
  }
  return { ready: missing.size === 0, missing: [...missing] };
}

/** 特性状态机分发：不同NPC的入口不同，这里统一成一个 dispatch。 */
function createTraitRuntime(definition) {
  const trait = TRAITS[definition.id];
  if (!trait) throw new Error('没有该友方NPC的特性适配：' + definition.id);
  let state = trait.createState({ maxHP: definition.model && definition.model.derived && definition.model.derived.HP, permanentProgress: definition.permanentProgress });
  return {
    traitId: trait.id,
    get state() {
      return state;
    },
    dispatch(event) {
      if (trait.id === 'chengliang') {
        const result = trait.handle(state, event);
        state = result.state;
        return result;
      }
      if (trait.id === 'xutaiping') {
        if (event.type === 'turn-start') {
          state = trait.beginTurn(state);
          return { state, effects: [] };
        }
        if (event.type === 'benefit') {
          const result = trait.applyBenefit(state, event);
          state = result.state;
          return result;
        }
        if (event.type === 'debuff-applied') {
          const result = trait.recordDebuff(state, event);
          state = result.state;
          return result;
        }
        if (event.type === 'debuff-removed') {
          state = trait.removeDebuff(state, event);
          return { state, effects: [] };
        }
        if (event.type === 'lamps') {
          const result = trait.applyLamps(state, event);
          state = result.state;
          return result;
        }
        if (event.type === 'tick') {
          const result = trait.tickLamps(state, event);
          state = result.state;
          return result;
        }
        if (event.type === 'defeat') {
          state = trait.onOwnerDefeat(state);
          return { state, effects: [{ op: 'log', text: '徐太平退场：未完成的三灯消散，灯灭层数清除' }] };
        }
        if (event.type === 'battle-end') {
          state = trait.battleEnd();
          return { state, effects: [] };
        }
        return { state, effects: [] };
      }
      if (trait.id === 'sailiya_fengzhi') {
        if (event.type === 'defeat') {
          const result = trait.recordDamage(state, { lethal: true });
          state = result.state;
          return { state, effects: [] };
        }
        if (event.type === 'attack-cast') {
          const result = trait.activateRune(state, event);
          state = result.state;
          return { state, effects: [], activated: result.activated, extraCost: result.extraCost, duplicate: result.duplicate === true };
        }
        if (event.type === 'damage-taken') {
          const result = trait.recordDamage(state, event);
          state = result.state;
          return { state, effects: [], pending: result.pending, sealed: result.sealed };
        }
        if (event.type === 'attack-hit') {
          const active = state.rune.active && (!event.castId || event.castId === state.rune.castId);
          // 这两个值由宿主继续用于本次攻击结算：符剑附伤与抵挡魂力倍耗。
          return {
            state,
            effects: [],
            addOn: active ? trait.runeAddOn(event.mainEffectiveDamage || 0) : 0,
            defenseCost: trait.defenseCostOnHit(event.actualPaidDefenseCost, active)
          };
        }
        if (event.type === 'charge-refill') {
          state = trait.refillCharge(state);
          return { state, effects: [] };
        }
        if (event.type === 'charge-consume') {
          const result = trait.consumeCharge(state, event.isMainAttack !== false);
          state = result.state;
          return { state, effects: [], multiplier: result.multiplier, consumed: result.consumed };
        }
        if (event.type === 'turn-end') {
          const result = trait.endTurn(state, event);
          state = result.state;
          return result;
        }
        if (event.type === 'battle-end') {
          state = trait.battleEnd();
          return { state, effects: [] };
        }
        return { state, effects: [] };
      }
      throw new Error('未支持的特性分发：' + trait.id);
    }
  };
}

/** 把特性算出的效果交给宿主；未知 op 显式报错。 */
function applyEffects(host, unitId, effects) {
  const calls = [];
  for (const effect of effects || []) {
    switch (effect.op) {
      case 'log': calls.push({ op: 'log', result: host.log({ unitId, text: effect.text }) }); break;
      case 'heal': calls.push({ op: 'heal', result: host.heal({ unitId, amount: effect.amount, reason: effect.reason }) }); break;
      case 'permanentProgress': calls.push({ op: 'permanentProgress', result: host.setPermanentProgress({ unitId, key: effect.key, value: effect.value }) }); break;
      case 'bodyBonus': calls.push({ op: 'bodyBonus', result: host.applyBodyBonus({ unitId, perStack: effect.perStack, stacks: effect.stacks }) }); break;
      case 'addStatus': calls.push({ op: 'addStatus', result: host.addStatus({ unitId, targetId: effect.targetId, type: effect.type, value: effect.value, duration: effect.duration, source: effect.source }) }); break;
      case 'halveDuration': calls.push({ op: 'halveDuration', result: host.halveDuration({ unitId, targetId: effect.targetId, factor: effect.factor }) }); break;
      case 'restoreMP': calls.push({ op: 'restoreMP', result: host.restoreMP({ unitId, amount: effect.amount, reason: effect.reason, eventId: effect.eventId }) }); break;
      case 'reject': calls.push({ op: 'reject', result: host.reject && host.reject({ unitId, reason: effect.reason }) }); break;
      default: throw new Error('未知特性效果：' + effect.op);
    }
  }
  return calls;
}

module.exports = { TRAITS, EXPECTED_TRAITS, PRIMITIVES, OPS, toEngineSkill, buildUnit, runSkill, coverage, assertCombatReady, assertHostReady, createTraitRuntime, applyEffects, numericDebuffPayload };

},"/modules/src/npc/roster.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 友方NPC名录（只读封装）。
 *
 * 交接文档第十八节：名录“负责角色定义、名称别名、定稿介绍文本、角色版本；
 * 不直接操作主线事件与玩家奖励”。本模块只读，返回深拷贝，改调用结果不会污染名录。
 * 绑定一律用稳定ID（chengliang / xutaiping / sailiya_fengzhi），显示名与别名只用于查询。
 */

const fs = require('node:fs');
const path = require('node:path');
const { clone, uniqueIds } = require('../util');
const TEXTS = require('../text/hunt-texts.generated');

const DEFAULT_DIR = path.resolve(__dirname, '..', '..', 'data', 'npc');
const REQUIRED_IDS = Object.freeze(['chengliang', 'xutaiping', 'sailiya_fengzhi']);

function createRoster(options = {}) {
  const dir = options.dir || DEFAULT_DIR;
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('名录快照缺少 manifest.json，请先运行 node tools/sync-npc.cjs');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.rosterVersion !== 1) throw new Error('不支持的名录快照版本：' + manifest.rosterVersion);

  const characters = manifest.files.map((entry) => {
    const full = path.join(dir, entry.file);
    if (!fs.existsSync(full)) throw new Error('名录快照缺少文件：' + full);
    const record = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (record.id !== entry.id) throw new Error('名录ID与清单不一致：' + entry.file);
    return record;
  });

  const ids = uniqueIds(characters, '友方NPC名录');
  for (const required of REQUIRED_IDS) {
    if (!ids.includes(required)) throw new Error('名录缺少交接文档列明的角色：' + required);
  }

  const records = new Map(characters.map((character) => [character.id, character]));
  const aliases = new Map();
  for (const character of characters) {
    for (const name of [character.name, ...(character.aliases || [])]) {
      if (aliases.has(name)) throw new Error('名录别名重复：' + name);
      aliases.set(name, character.id);
    }
  }

  function resolve(idOrName) {
    if (typeof idOrName !== 'string' || !idOrName) throw new Error('友方NPC查询须为稳定ID或名称');
    const id = aliases.get(idOrName) || idOrName;
    if (!records.has(id)) throw new Error('友方NPC不存在：' + idOrName);
    return id;
  }

  function get(idOrName) {
    return clone(records.get(resolve(idOrName)));
  }

  function list() {
    return characters.map((character) => ({
      id: character.id,
      name: character.name,
      aliases: [...(character.aliases || [])],
      nationality: character.nationality,
      level: character.level,
      rating: character.rating,
      soul: character.soul.name,
      role: character.role,
      integrated: character.implementation.integrated,
      arrivalTextAvailable: Array.isArray(TEXTS.arrivals[character.id])
    }));
  }

  function eventReference(idOrName) {
    const character = get(idOrName);
    return {
      registry: '友方npc',
      schemaVersion: character.schemaVersion,
      npcId: character.id,
      moduleVersion: manifest.rosterVersion
    };
  }

  function traitDisplay(idOrName) {
    // 交接文档：玩家显示只需要名称和效果，不显示来源、分类或子级标题。
    return get(idOrName).traits.map(({ name, effect }) => ({ name, effect }));
  }

  function arrivalText(idOrName) {
    const character = get(idOrName);
    const paragraphs = TEXTS.arrivals[character.id];
    if (!Array.isArray(paragraphs) || !paragraphs.length) throw new Error('角色缺少定稿到场正文：' + character.id);
    return paragraphs.slice();
  }

  /**
   * 按已保存的顺序拼接到场正文：
   *   0 位 → 无NPC段；1 位 → 该角色两段；2 位 → 依次两组，不合并、不改写、不省略。
   */
  function arrivalParagraphs(npcIds) {
    if (!Array.isArray(npcIds)) throw new Error('到场阵容须为稳定ID数组');
    if (npcIds.length < 0 || npcIds.length > 3) throw new Error('讨伐队伍最多三位友方NPC');
    const resolved = npcIds.map(resolve);
    if (new Set(resolved).size !== resolved.length) throw new Error('到场阵容出现重复角色，别名不构成第二位NPC');
    if (!resolved.length) return TEXTS.noNpc.slice();
    return resolved.flatMap((id) => arrivalText(id));
  }

  function combatSpec(idOrName) {
    const character = get(idOrName);
    return {
      id: character.id,
      name: character.name,
      aliases: character.aliases || [],
      level: character.level,
      rating: character.rating,
      ratingRatio: character.ratingRatio,
      style: character.style,
      role: character.role,
      soul: clone(character.soul),
      release: character.release,
      model: clone(character.model),
      stats: clone(character.model.stats),
      derived: clone(character.model.derived),
      permanentProgress: clone(character.permanentProgress || null),
      skills: clone(character.skills),
      traits: clone(character.traits),
      implementation: clone(character.implementation),
      source: { registry: '友方npc', npcId: character.id, schemaVersion: character.schemaVersion, snapshotVersion: manifest.rosterVersion }
    };
  }

  function aliasesOf(idOrName) {
    const character = get(idOrName);
    return [character.name, ...(character.aliases || [])];
  }

  function summary() {
    return {
      rosterVersion: manifest.rosterVersion,
      copiedFrom: manifest.copiedFrom,
      count: characters.length,
      ids: ids.slice(),
      characters: list()
    };
  }

  return Object.freeze({
    get,
    list,
    eventReference,
    traitDisplay,
    arrivalText,
    arrivalParagraphs,
    combatSpec,
    aliasesOf,
    resolve,
    summary,
    REQUIRED_IDS
  });
}

module.exports = { createRoster, DEFAULT_DIR, REQUIRED_IDS };

},"/modules/src/npc/traits/chengliang.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 程良 · 战斗特性适配（交接文档第十九节重点1）。
 *
 * 数据来自 data/npc/chengliang.json 的 traits / implementation：
 *   - 周天格阵：每有效个人回合开始，敌人各+1层困阵（敏捷−5%/层，上限6），
 *     程良+1层据阵（伤害+10%/层，上限6）；每累计3个有效回合，
 *     先完成本回合叠层，再将双方层数分别减半向下取整；被控时暂停叠层与计数，层数保留。
 *   - 六库仙贼：回合末回复最大生命5%；对“有生命的受击实体”造成实际生命伤害时
 *     吸取30%回血；每累计3次有效吞噬永久+1层盗气（肉体强度+10%/层，上限10，跨战斗保留）。
 *     免疫疲劳以及带衰老、腐坏标签的减益。
 *   - 易中日月：免疫幻象与伪装、锁定真实本体；不计纯敏捷差造成的负向命中修正；
 *     闪避修正后的基础命中下限60%；每回合锁定一名凝视对象，对其命中+8个百分点，
 *     该对象对程良造成的伤害+10%；正向命中合计最高97%，致盲等在保底之后结算，最终最低5%。
 *
 * 这里只维护状态与应发生的效果；真实伤害、护盾、控制仍由主游戏战斗引擎结算。
 * 旧版的每层3%／2%已不复用，本文件按当前定稿的10%／10%实现。
 */

const { clamp, hitChance } = require('./common');

const ID = 'chengliang';
const GRID = Object.freeze({ maxStacks: 6, agilityDownPerStack: 0.05, damageUpPerStack: 0.1, period: 3 });
const REGEN = Object.freeze({ endTurnMaxHPRate: 0.05, endTurnMaxMPRate: 0.05, lifestealRate: 0.3, eventsPerPermanentStack: 3, bodyUpPerPermanentStack: 0.1, maximumPermanentStacks: 10, immuneTags: ['fatigue', 'aging', 'decay'] });
const VISION = Object.freeze({ ignoreIllusion: true, ignoreDisguise: true, selectRealBody: true, ignoreNegativeAgilityDifference: true, preDebuffHitFloor: 0.6, gazeHitPoints: 8, gazeIncomingDamageMultiplier: 1.1, hitCap: 0.97, postDebuffHitFloor: 0.05 });

function createState(input = {}) {
  return {
    id: ID,
    grid: { self: 0, enemies: Object.create(null), turns: 0, paused: false, defeated: false, cleared: false },
    regen: {
      devourEvents: 0,
      thiefQi: clamp(input.permanentProgress && input.permanentProgress.thiefQiStacks || 0, 0, REGEN.maximumPermanentStacks)
    },
    vision: { gazeTargetId: null, gazePicked: false },
    maxHP: input.maxHP
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function halveGrid(state) {
  const next = cloneState(state);
  next.grid.self = Math.floor(next.grid.self / 2);
  for (const key of Object.keys(next.grid.enemies)) next.grid.enemies[key] = Math.floor(next.grid.enemies[key] / 2);
  return next;
}

function handle(state, event) {
  const next = cloneState(state);
  const effects = [];
  switch (event.type) {
    case 'turn-start': {
      next.vision.gazePicked = false;
      if (next.grid.defeated) break;
      if (event.controlled) {
        next.grid.paused = true;
        effects.push({ op: 'log', text: '周天格阵：程良被控制，暂停叠层与周期计数，已有层数保留' });
        break;
      }
      next.grid.paused = false;
      next.grid.self = Math.min(GRID.maxStacks, next.grid.self + 1);
      for (const enemyId of event.livingEnemyIds || []) {
        next.grid.enemies[enemyId] = Math.min(GRID.maxStacks, (next.grid.enemies[enemyId] || 0) + 1);
      }
      next.grid.turns++;
      if (next.grid.turns % GRID.period === 0) {
        const before = { self: next.grid.self, enemies: { ...next.grid.enemies } };
        const halved = halveGrid(next);
        next.grid.self = halved.grid.self;
        next.grid.enemies = halved.grid.enemies;
        effects.push({ op: 'log', text: '周天格阵第' + next.grid.turns + '回合：叠层后减半（据阵' + before.self + '→' + next.grid.self + '）' });
      }
      break;
    }
    case 'turn-end': {
      if (event.dead || next.grid.defeated) break;
      const missing = Math.max(0, (event.maxHP || next.maxHP || 0) - (event.hp || 0));
      const amount = Math.min(Math.round((event.maxHP || next.maxHP || 0) * REGEN.endTurnMaxHPRate), missing);
      if (amount > 0) effects.push({ op: 'heal', amount, reason: '六库仙贼·回合末' });
      const mana = Math.min(Math.round((event.maxMP || 0) * REGEN.endTurnMaxMPRate), Math.max(0, (event.maxMP || 0) - (event.mp || 0)));
      if (mana > 0) effects.push({ op: 'restoreMP', amount: mana, reason: '六库仙贼·回合末5%' });
      break;
    }
    case 'damage-dealt': {
      if (next.grid.defeated) break;
      const target = event.target || {};
      const living = target.lifeType === '生活' || target.lifeType === 'living';
      const actual = Number(event.actualHP) || 0;
      if (!living || actual <= 0) break;
      effects.push({ op: 'heal', amount: Math.round(actual * REGEN.lifestealRate), reason: '六库仙贼·吸血' });
      next.regen.devourEvents++;
      if (next.regen.devourEvents % REGEN.eventsPerPermanentStack === 0 && next.regen.thiefQi < REGEN.maximumPermanentStacks) {
        next.regen.thiefQi++;
        effects.push({ op: 'permanentProgress', key: 'thiefQiStacks', value: next.regen.thiefQi });
        effects.push({ op: 'bodyBonus', perStack: REGEN.bodyUpPerPermanentStack, stacks: next.regen.thiefQi });
      }
      break;
    }
    case 'gaze-select': {
      if (next.vision.gazePicked) {
        effects.push({ op: 'reject', reason: '凝视每回合至多选择一次' });
        break;
      }
      next.vision.gazeTargetId = event.targetId;
      next.vision.gazePicked = true;
      effects.push({ op: 'log', text: '易中日月：锁定凝视对象 ' + event.targetId + '，本回合对其命中+8个百分点' });
      break;
    }
    case 'defeat': {
      next.grid.defeated = true;
      next.grid.self = 0;
      next.grid.enemies = Object.create(null);
      effects.push({ op: 'log', text: '程良退场：清除周天格阵状态' });
      break;
    }
    case 'battle-end': {
      next.grid = { self: 0, enemies: Object.create(null), turns: 0, paused: false, defeated: false, cleared: true };
      next.vision.gazeTargetId = null;
      break;
    }
    default:
      break;
  }
  return { state: next, effects };
}

function modifiers(state) {
  const agilityMultipliers = {};
  for (const [enemyId, stacks] of Object.entries(state.grid.enemies)) agilityMultipliers[enemyId] = 1 - GRID.agilityDownPerStack * stacks;
  return {
    damageMultiplier: 1 + GRID.damageUpPerStack * state.grid.self,
    agilityMultipliers,
    bodyMultiplier: 1 + REGEN.bodyUpPerPermanentStack * state.regen.thiefQi,
    gazeTargetId: state.vision.gazeTargetId,
    gazeIncomingDamageMultiplier: state.vision.gazeTargetId ? VISION.gazeIncomingDamageMultiplier : 1,
    immuneTags: REGEN.immuneTags.slice()
  };
}

function hit(state, input) {
  return hitChance(state.vision, input, VISION);
}

const trait = Object.freeze({ id: ID, traits: ['周天格阵', '六库仙贼', '易中日月'], requiredEvents: ['turn-start', 'turn-end', 'damage-dealt', 'gaze-select', 'defeat', 'battle-end', 'hit-query'], createState, handle, modifiers, hit, constants: { GRID, REGEN, VISION } });

module.exports = trait;

},"/modules/src/npc/traits/common.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 友方NPC特性适配的共用小工具。
 *
 * 说明：这些处理器只计算“应该发生什么”，通过 effect 列表交给拼接层映射到
 * 现有战斗引擎的真实事件（受伤、护盾、控制、回魂、行动起止、个人回合）。
 * 不在这里另写伤害公式；数值基数由名录中的实际面板与技能给出。
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round3(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/**
 * 命中率换算。程良“易中日月”与赛利亚“秘元归宿体”的感知条款共用此函数，
 * 区别由 config 决定是否忽略敏捷差、是否可锁隐形/虚化。
 */
function hitChance(state, input, config) {
  if (!Number.isFinite(input.base)) throw new Error('命中率基数无效');
  let base = clamp(input.base, 0, 1);
  const agilityDiff = input.agilityDiff || 0;
  if (!(config.ignoreNegativeAgilityDifference && agilityDiff < 0)) base += agilityDiff;
  if (input.concealmentPenalty) {
    if (!config.ignoreConcealmentPenalty) base -= input.concealmentPenalty;
  }
  if (input.targetHidden && !config.canSelectHidden) base = 0;
  // 闪避修正后的基础命中下限先结算；凝视的+8个百分点加在保底之后。
  base = Math.max(base, config.preDebuffHitFloor || 0);
  if (state.gazeTargetId && input.targetId === state.gazeTargetId && config.gazeHitPoints) {
    base += config.gazeHitPoints / 100;
  }
  base = Math.min(base, config.hitCap || 0.97);
  if (input.debuffPenalty) base -= input.debuffPenalty;
  base = Math.max(base, config.postDebuffHitFloor || 0.05);
  return { chance: round3(base), cap: config.hitCap, floor: config.postDebuffHitFloor, gaze: input.targetId === state.gazeTargetId };
}

function immunityList(config) {
  return (config.immuneTags || []).slice();
}

module.exports = { clamp, round3, hitChance, immunityList };

},"/modules/src/npc/traits/sailiya.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 赛利亚·风织 · 战斗特性适配（交接文档第十九节重点3、4）。
 *
 * 数据来自 data/npc/sailiya_fengzhi.json 的 traits / implementation：
 *   - 承露符锋：每次普通攻击或攻击魂技，可在正常费用外再付“本次实际魂力费用的50%”
 *     （向上取整），为整次攻击附加一次符剑；附伤基数为各主攻击段进入护盾与承伤分配前的
 *     有效生命伤害的30%，自动选目标元素抗性最低的一项，再结算抗性/护盾/承伤；
 *     主攻击已结算的普通防御不重复扣。多段、群攻共享一次选择与费用。
 *     被该次攻击命中的目标若实际消耗魂力抵挡，本次抵挡魂力费用翻倍；
 *     预先付费护盾不追溯，免费护盾/纯肉体/绝对免伤不凭空产生费用。
 *   - 秘元归宿体：魂力上限+50%（只作用一次，baseMP仍为费用基数）；每人回合末回复
 *     有效最大魂力5%；自上次回合末以来真实受到的生命/精神护持伤害20%凝为秘元，
 *     本次回合末等量回魂；护盾损失、过量伤害、生命费用、自伤不计；
 *     被带封锁/禁绝标签的效果命中则本周期不凝结、待凝量清零；
 *     致命后退场，不再执行回合末回魂。5%与20%分别发出回复事件。
 *   - 感知：不受隐匿与目标高速造成的命中惩罚，可锁隐形/虚化目标，但仍受正常命中判定。
 */

const { clamp, round3, hitChance } = require('./common');

const ID = 'sailiya_fengzhi';
const RUNE = Object.freeze({ extraCostRate: 0.5, extraCostRounding: 'ceil', damageRate: 0.3, activationUnit: 'one_basic_or_one_skill_cast', defenseResourceCostMultiplier: 2, multiplyCostOnlyOnce: true, noRetroactiveShieldCastFees: true });
const SECRET = Object.freeze({ maxMPMultiplier: 1.5, endTurnMPRecoveryRate: 0.05, damageToMPRecoveryRate: 0.2, sealTags: ['resource_seal', 'resource_prohibition'], revives: false });
const CHARGE = Object.freeze({ multiplier: 1.15, maxCharges: 3, consumePerCast: 1, applyToMainAttackOnly: true });
const PERCEPTION = Object.freeze({ ignoreConcealmentPenalty: true, ignoreNegativeAgilityDifference: true, canSelectHidden: true, canSelectPhased: true, bypassHitRoll: false, hitCap: 0.97, postDebuffHitFloor: 0.05 });

function createState() {
  return {
    id: ID,
    rune: { active: false, castId: null, mainCost: 0, extraCost: 0 },
    secretOrigin: { pending: 0, sealed: false, lethal: false },
    charge: { charges: 0, multiplier: CHARGE.multiplier },
    maxMP: null,
    baseMP: null
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/** 符剑附加费：本次实际主攻击费用的50%，向上取整；0费攻击的附加费为0。 */
function runeExtraCost(paidMainCost) {
  const cost = Number(paidMainCost);
  if (!Number.isFinite(cost) || cost < 0) throw new Error('符剑附加费基数无效');
  return Math.ceil(cost * RUNE.extraCostRate);
}

/**
 * 开启一次符剑（整次施放只付一次）。魂力不足时不附加，但可只施放原攻击。
 * input: { castId, paidMainCost, mpAvailable }
 */
function activateRune(state, input) {
  const next = cloneState(state);
  if (input.castId && input.castId === next.rune.castId) return { state: next, activated: next.rune.active, extraCost: 0, duplicate: true };
  const extraCost = runeExtraCost(input.paidMainCost);
  if (input.enabled === false || extraCost > input.mpAvailable) {
    next.rune = { active: false, castId: input.castId || null, mainCost: input.paidMainCost, extraCost, reason: '魂力不足，未附加符剑' };
    return { state: next, activated: false, extraCost };
  }
  next.rune = { active: true, castId: input.castId || null, mainCost: input.paidMainCost, extraCost };
  return { state: next, activated: true, extraCost };
}

/** 附伤原始值：主攻击有效生命伤害的30%。削盾段不计入基数。 */
function runeAddOn(mainEffectiveDamage) {
  const damage = Number(mainEffectiveDamage);
  if (!Number.isFinite(damage) || damage < 0) throw new Error('符剑附伤基数无效');
  return Math.round(damage * RUNE.damageRate);
}

/** 实际抵挡魂力的倍耗：只在命中当时实际支付的防御魂力上翻倍，不追溯预先付费护盾。 */
function defenseCostOnHit(actualPaidDefenseCost, runeActive) {
  const cost = Number(actualPaidDefenseCost) || 0;
  if (cost <= 0) return 0;
  return runeActive ? cost * RUNE.defenseResourceCostMultiplier : cost;
}

/** 魂力上限提高50%。传入的是引擎已算出的上限（已含资源系数），只在其上再乘一次。 */
function effectiveMaxMP(engineMP) {
  return Math.round(engineMP * SECRET.maxMPMultiplier);
}

function onCast(state, input) {
  const next = cloneState(state);
  if (input.baseMP !== undefined) next.baseMP = input.baseMP;
  if (input.engineMP !== undefined) next.maxMP = effectiveMaxMP(input.engineMP);
  return next;
}

/** 受伤凝元：只累计真实生命/精神护持伤害；护盾损失、过量伤害、生命费用、自伤不计。 */
function recordDamage(state, input) {
  const next = cloneState(state);
  if (input.lethal) {
    next.secretOrigin.lethal = true;
    next.secretOrigin.pending = 0;
    return { state: next, pending: 0, sealed: next.secretOrigin.sealed };
  }
  const tags = input.tags || [];
  if (tags.some((tag) => SECRET.sealTags.includes(tag))) {
    next.secretOrigin.sealed = true;
    next.secretOrigin.pending = 0;
    return { state: next, pending: 0, sealed: true };
  }
  const realHP = Number(input.realHP) || 0;
  const realSH = Number(input.realSH) || 0;
  if (next.secretOrigin.sealed || next.secretOrigin.lethal || input.selfDamage === true || input.hpCost === true) return { state: next, pending: next.secretOrigin.pending, gained: 0, sealed: next.secretOrigin.sealed };
  const gained = (realHP + realSH) * SECRET.damageToMPRecoveryRate;
  next.secretOrigin.pending = next.secretOrigin.pending + gained;
  next.secretOrigin.sealed = false;
  return { state: next, pending: next.secretOrigin.pending, gained, sealed: false };
}

/**
 * 回合末：先回复有效最大魂力5%，再把本周期凝元等量回魂；两个独立回复事件。
 * 致死后退场，不执行任何回合末回魂。
 */
function endTurn(state, input) {
  const next = cloneState(state);
  const effects = [];
  if (input.lethal || next.secretOrigin.lethal) {
    next.secretOrigin.pending = 0;
    return { state: next, effects, recovered: 0, reason: 'lethal-no-recovery' };
  }
  const maxMP = input.maxMP === undefined ? next.maxMP : input.maxMP;
  if (!Number.isFinite(maxMP)) throw new Error('秘元归宿体缺少有效最大魂力');
  const baseRecovery = Math.round(maxMP * SECRET.endTurnMPRecoveryRate);
  effects.push({ op: 'restoreMP', amount: baseRecovery, reason: '秘元归宿体·回合末5%', eventId: 'secret-origin:5%' });
  const pending = Math.round(next.secretOrigin.pending);
  if (pending > 0) effects.push({ op: 'restoreMP', amount: pending, reason: '秘元归宿体·受伤凝元20%', eventId: 'secret-origin:pending' });
  next.secretOrigin.pending = 0;
  next.secretOrigin.sealed = false;
  return { state: next, effects, recovered: baseRecovery + pending, baseRecovery, pending };
}

/** 化羽华：三次主攻击+15%，每次施放消耗一枚，重复施放只补满不叠层。 */
function refillCharge(state) {
  const next = cloneState(state);
  next.charge.charges = CHARGE.maxCharges;
  return next;
}

function consumeCharge(state, isMainAttack) {
  const next = cloneState(state);
  if (!isMainAttack) return { state: next, multiplier: 1, consumed: false };
  if (next.charge.charges <= 0) return { state: next, multiplier: 1, consumed: false };
  next.charge.charges--;
  return { state: next, multiplier: CHARGE.multiplier, consumed: true };
}

function hit(state, input) {
  return hitChance(state, input, PERCEPTION);
}

function onHit(state, input) {
  return { defenseCost: defenseCostOnHit(input.actualPaidDefenseCost, state.rune.active), multiplier: RUNE.defenseResourceCostMultiplier };
}

function battleEnd() {
  return createState();
}

function modifiers(state) {
  return {
    runeActive: state.rune.active,
    runeExtraCostRate: RUNE.extraCostRate,
    runeDamageRate: RUNE.damageRate,
    defenseCostMultiplier: RUNE.defenseResourceCostMultiplier,
    maxMPMultiplier: SECRET.maxMPMultiplier,
    chargeCharges: state.charge.charges,
    chargeMultiplier: state.charge.multiplier,
    immuneTags: []
  };
}

const trait = Object.freeze({
  id: ID,
  traits: ['承露符锋', '秘元归宿体'],
  requiredEvents: ['attack-cast', 'attack-hit', 'damage-taken', 'turn-end', 'defeat', 'battle-end', 'hit-query'],
  createState,
  runeExtraCost,
  activateRune,
  runeAddOn,
  defenseCostOnHit,
  effectiveMaxMP,
  onCast,
  recordDamage,
  endTurn,
  refillCharge,
  consumeCharge,
  hit,
  onHit,
  battleEnd,
  modifiers,
  constants: { RUNE, SECRET, CHARGE, PERCEPTION }
});

module.exports = trait;

},"/modules/src/npc/traits/xutaiping.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 徐太平 · 战斗特性适配（交接文档第十九节重点2）。
 *
 * 数据来自 data/npc/xutaiping.json 的 traits / implementation：
 *   - 深暗：她施加的数值削弱幅度提高50%；同一目标已带有她一项生效削弱时改为80%。
 *     两档互相替代、不连续相乘；只加幅度，不加持续时间、层数上限、控制时长或成功率。
 *     三灯、灯灭计数与她自身承接的减益不用于升级增幅档。
 *   - 灯灭：每个个人回合，对每名敌方目标第一次真正获得的增益/治疗/护盾/回魂进行压制：
 *     数值幅度或回复量减半，并为该目标积1层；达到3层后，该目标下一次可被压制的正向效果
 *     完全失效，随后清空层数。每回合每目标最多压制一次；同一次施放的多项正向效果合并只计一次。
 *   - 黑蚀三灯：3盏，每2秒熄灭一盏，全部熄灭时诅咒落下：敏捷−20%、造成伤害−15%，
 *     持续至战斗结束；受控时暂停灌注；12秒未完成则散去；同一目标只保留一组。
 *
 * 数值削弱统一持续整场，不按秒自动到期；可净化的仍可解除，同来源重施不叠层。
 */

const { clamp, round3 } = require('./common');

const ID = 'xutaiping';
const DEEP_DARK = Object.freeze({ normalMultiplier: 1.5, coveredMultiplier: 1.8, stackMultipliers: false });
const CAPS = Object.freeze({ agilityDown: 0.9, damageDown: 0.9, defDown: 1, mindDown: 1, skillCostUp: 1, gaugeLoss: 0.9, allyVulnerability: 0.6 });
const IGNORE_MARKERS = Object.freeze(['black_erosion_lamps', 'lamp_out_stacks', 'transferred_debuff']);
const LAMP_OUT = Object.freeze({ maxStacks: 3, normalMultiplier: 0.5, fullStacksMultiplier: 0, usesPerTargetPerOwnerTurn: 1, ownerDefeatRemoves: true });
const BLACK_EROSION = Object.freeze({ lamps: 3, intervalSeconds: 2, timeoutSeconds: 12, pauseWhileControlled: true });

function createState(input = {}) {
  return {
    id: ID,
    deepDark: { debuffs: Object.create(null) },
    lampOut: { stacks: Object.create(null), budget: Object.create(null), defeated: false },
    blackErosion: { groups: Object.create(null), controlled: false }
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * 深暗增幅。input: { targetId, field, baseValue, snapshotAt }
 * snapshotAt 为本次施放开始时间；只有此前已生效、且属于她自己的数值削弱才升级到1.8倍。
 */
function amplify(state, input) {
  const field = input.field;
  if (!Object.prototype.hasOwnProperty.call(CAPS, field)) throw new Error('深暗不适用于该字段：' + field);
  const entries = state.deepDark.debuffs[input.targetId] || [];
  const snapshotAt = input.snapshotAt === undefined ? Infinity : input.snapshotAt;
  const covered = entries.some((entry) => entry && entry.active !== false && entry.field && !IGNORE_MARKERS.includes(entry.field) && (entry.appliedAt === undefined || entry.appliedAt < snapshotAt));
  const multiplier = covered ? DEEP_DARK.coveredMultiplier : DEEP_DARK.normalMultiplier;
  const raw = Number(input.baseValue) * multiplier;
  return { value: round3(Math.min(CAPS[field], raw)), multiplier, covered, cap: CAPS[field], raw: round3(raw) };
}

/** 记录一项由徐太平施加、已生效的数值削弱，供后续深暗判定。 */
function recordDebuff(state, input) {
  const next = cloneState(state);
  const list = next.deepDark.debuffs[input.targetId] || (next.deepDark.debuffs[input.targetId] = []);
  const existing = list.find((entry) => entry && entry.id === input.debuffId);
  if (existing) {
    existing.value = input.value;
    existing.active = true;
    return { state: next, effects: [{ op: 'log', text: '同来源重施只更新幅度，不叠层：' + input.field }] };
  }
  list.push({ id: input.debuffId, field: input.field, value: input.value, appliedAt: input.appliedAt === undefined ? null : input.appliedAt, active: true, source: 'xutaiping' });
  return { state: next, effects: [] };
}

function removeDebuff(state, input) {
  const next = cloneState(state);
  for (const entry of next.deepDark.debuffs[input.targetId] || []) if (entry.id === input.debuffId) entry.active = false;
  return next;
}

/**
 * 灯灭压制一次正向效果。input: { targetId, groupId, kind, value, actualBenefit, durationOnly }
 * 返回 outcome.value（实际生效值）与是否完全失效。
 */
function applyBenefit(state, input) {
  const next = cloneState(state);
  const effects = [];
  const budget = next.lampOut.budget[input.targetId];
  if (next.lampOut.defeated || input.eligible === false || (input.kind && !['buff', 'heal', 'shield', 'mp-restore', 'restoreMP'].includes(input.kind))) {
    return { state: next, effects, outcome: { value: input.value, counted: false, reason: 'ineligible-benefit' } };
  }
  // 同一次施放的多项收益同倍率、只计一层。重复回调不重复累计层数。
  if (budget && input.groupId && budget.groupId === input.groupId) {
    if (input.durationOnly && budget.factor === 0.5) effects.push({ op: 'halveDuration', targetId: input.targetId, factor: 0.5 });
    return { state: next, effects, outcome: { value: budget.factor === 0 ? 0 : input.durationOnly ? input.value : Math.min(input.value, input.actualBenefit === undefined ? input.value : input.actualBenefit) * budget.factor, counted: false, blocked: budget.factor === 0, grouped: true } };
  }
  const actual = Number(input.actualBenefit === undefined ? input.value : input.actualBenefit);
  if (!(actual > 0)) return { state: next, effects, outcome: { value: input.value, counted: false, reason: 'zero-actual-benefit' } };
  if (budget) {
    return { state: next, effects, outcome: { value: input.value, counted: false, reason: 'already-suppressed-this-turn' } };
  }
  const stacks = next.lampOut.stacks[input.targetId] || 0;
  next.lampOut.budget[input.targetId] = { groupId: input.groupId || null, factor: stacks >= LAMP_OUT.maxStacks ? 0 : LAMP_OUT.normalMultiplier };
  if (stacks >= LAMP_OUT.maxStacks) {
    next.lampOut.stacks[input.targetId] = 0;
    effects.push({ op: 'log', text: '灯灭：' + input.targetId + ' 三层封锁，本次正向效果完全失效并清层' });
    return { state: next, effects, outcome: { value: LAMP_OUT.fullStacksMultiplier * input.value, counted: true, blocked: true, stacksAfter: 0 } };
  }
  next.lampOut.stacks[input.targetId] = stacks + 1;
  if (input.durationOnly) effects.push({ op: 'halveDuration', targetId: input.targetId, factor: LAMP_OUT.normalMultiplier });
  effects.push({ op: 'log', text: '灯灭：' + input.targetId + ' 正向效果减半，累计' + (stacks + 1) + '层' });
  return {
    state: next,
    effects,
    outcome: { value: input.durationOnly ? input.value : Math.min(input.value, actual) * LAMP_OUT.normalMultiplier, counted: true, blocked: false, stacksAfter: stacks + 1 }
  };
}

function beginTurn(state) {
  const next = cloneState(state);
  next.lampOut.budget = Object.create(null);
  return next;
}

/** 挂上一组三灯；同一目标只保留一组，重复施放不叠组、不提前引爆。 */
function applyLamps(state, input) {
  const next = cloneState(state);
  const existing = next.blackErosion.groups[input.targetId];
  if (existing && !existing.resolved && !existing.dissipated) {
    return { state: next, effects: [{ op: 'log', text: '同一目标已有一组三灯，重复施放不叠组' }], group: existing };
  }
  const group = { targetId: input.targetId, lamps: BLACK_EROSION.lamps, elapsed: 0, age: 0, resolved: false, dissipated: false, startedAt: input.at === undefined ? null : input.at };
  next.blackErosion.groups[input.targetId] = group;
  return { state: next, effects: [{ op: 'log', text: '黑蚀三灯已布下：' + input.targetId }], group };
}

/**
 * 灌注推进。受控时暂停；每2秒熄一盏；三盏俱灭时按深暗结算诅咒；
 * 满12秒未完成则散去，不产生诅咒。
 */
function tickLamps(state, input) {
  const next = cloneState(state);
  const effects = [];
  const dt = Number(input.dt);
  if (!(dt > 0)) return { state: next, effects };
  next.blackErosion.controlled = input.controlled === true;
  for (const group of Object.values(next.blackErosion.groups)) {
    if (group.resolved || group.dissipated) continue;
    // 墙钟时间用于12秒散标；灌注进度 elapsed 才受“受控暂停”影响。
    const timeLeft = BLACK_EROSION.timeoutSeconds - (group.age || 0);
    const progressLeft = BLACK_EROSION.lamps * BLACK_EROSION.intervalSeconds - group.elapsed;
    const completesBeforeTimeout = !input.controlled && progressLeft <= dt && progressLeft < timeLeft;
    group.age = (group.age || 0) + dt;
    if (!completesBeforeTimeout && group.age >= BLACK_EROSION.timeoutSeconds) {
      group.dissipated = true;
      effects.push({ op: 'log', text: '黑蚀三灯超时散去：' + group.targetId });
      continue;
    }
    if (input.controlled) continue;
    group.elapsed += dt;
    const burned = Math.min(BLACK_EROSION.lamps, Math.floor(group.elapsed / BLACK_EROSION.intervalSeconds));
    group.lamps = Math.max(0, BLACK_EROSION.lamps - burned);
    if (group.lamps === 0 && !group.resolved) {
      group.resolved = true;
      // 同一次施放的多项削弱统一使用结算前的一次判定：先各自增幅，再一起记账。
      const agility = amplify(next, { targetId: group.targetId, field: 'agilityDown', baseValue: 0.2, snapshotAt: input.at });
      const damage = amplify(next, { targetId: group.targetId, field: 'damageDown', baseValue: 0.15, snapshotAt: input.at });
      next.deepDark = recordDebuff(next, { targetId: group.targetId, debuffId: 'black-erosion:' + group.targetId, field: 'agilityDown', value: agility.value, appliedAt: input.at }).state.deepDark;
      next.deepDark = recordDebuff(next, { targetId: group.targetId, debuffId: 'black-erosion-dmg:' + group.targetId, field: 'damageDown', value: damage.value, appliedAt: input.at }).state.deepDark;
      effects.push({ op: 'addStatus', targetId: group.targetId, type: 'agilityDown', value: agility.value, duration: 'battle', source: '徐太平·黑蚀三灯', amplifier: agility.multiplier });
      effects.push({ op: 'addStatus', targetId: group.targetId, type: 'damageDown', value: damage.value, duration: 'battle', source: '徐太平·黑蚀三灯', amplifier: damage.multiplier });
      effects.push({ op: 'log', text: '黑蚀三灯俱灭：' + group.targetId + ' 敏捷−' + Math.round(agility.value * 100) + '%、伤害−' + Math.round(damage.value * 100) + '%' });
    }
  }
  return { state: next, effects };
}

function onOwnerDefeat(state) {
  const next = cloneState(state);
  next.lampOut = { stacks: Object.create(null), budget: Object.create(null), defeated: true };
  for (const group of Object.values(next.blackErosion.groups)) if (!group.resolved) group.dissipated = true;
  return next;
}

function battleEnd(state) {
  return createState();
}

function modifiers(state) {
  return {
    deepDarkMultiplier: DEEP_DARK.normalMultiplier,
    lampOutStacks: { ...state.lampOut.stacks },
    lampOutCap: LAMP_OUT.maxStacks,
    immuneTags: [],
    numericDebuffLifetime: 'battle'
  };
}

const trait = Object.freeze({
  id: ID,
  traits: ['深暗', '灯灭'],
  requiredEvents: ['turn-start', 'benefit', 'tick', 'defeat', 'battle-end', 'debuff-applied', 'debuff-removed'],
  createState,
  amplify,
  recordDebuff,
  removeDebuff,
  applyBenefit,
  beginTurn,
  applyLamps,
  tickLamps,
  onOwnerDefeat,
  battleEnd,
  modifiers,
  constants: { DEEP_DARK, CAPS, LAMP_OUT, BLACK_EROSION, IGNORE_MARKERS }
});

module.exports = trait;

},"/modules/src/reward/inheritance.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 十万年魂骨的特性继承（交接文档第十三节）。
 *
 * 已定：魂兽至少有两个不同的可继承特性，奖励记录锁定这组定义与版本；
 * 继承规则必须同时支持“获得其中之一”和“全部获得”。
 * 初版建议（文档标注为待确认建议）：1d100 为 1—25 → 全部；26—100 → 等概率一条。
 * 若魂兽恰有两条，各单独继承结果概率为37.5%，全部为25%。
 *
 * 继承骰与具体选中项在首胜奖励事务中一次落盘；重开界面、换装备、保存重读不能改为另一条。
 */

const { clone, isPlainObject, requireInteger } = require('../util');
const { attributeTags } = require('../battle/skill-attributes');
const { VERSIONS } = require('../versions');

const DEFAULT_CONFIG = Object.freeze({
  version: VERSIONS.tenThousandInheritance,
  sides: 100,
  allThreshold: 25,
  suggested: true,
  note: '25%全部、75%一条为交接文档建议值，确认后可改配置而不改存档结构。'
});

function validateTraits(traits) {
  if (!Array.isArray(traits) || traits.length < 2) throw new Error('十万年魂兽至少需要两个不同的可继承特性');
  const ids = traits.map((trait) => trait && trait.id);
  if (ids.some((id) => typeof id !== 'string' || !id)) throw new Error('可继承特性缺少稳定ID');
  if (new Set(ids).size !== ids.length) throw new Error('可继承特性ID重复');
  return ids;
}

function matchingAttributes(player,beast){const asTags=x=>Array.isArray(x)?attributeTags({elements:x}):attributeTags(x);const playerTags=asTags(player),beastTags=asTags(beast);return playerTags.filter(t=>t!=='无'&&beastTags.includes(t));}

function rollInheritance(input) {
  const config = { ...DEFAULT_CONFIG, ...(input.config || {}) };
  requireInteger(config.sides, '继承骰面数', 2, 100000);
  requireInteger(config.allThreshold, '全部继承阈值', 0, config.sides);
  const traits = input.traits;
  const ids = validateTraits(traits);
  if (!input.rng || typeof input.rng.die !== 'function') throw new Error('继承骰须使用游戏确定性投骰器');

  const matchedAttributes=matchingAttributes(input.characterAttributes,input.beastAttributes);
  if(matchedAttributes.length)return Object.freeze({version:config.version,configVersion:config.version,beastId:input.beastId||null,face:null,sides:config.sides,mode:'all',selectedTraitIds:ids.slice(),probabilityAll:1,probabilityOne:0,matchedAttributes,reason:'attribute-match',frozen:true,suggestedConfig:false});

  const face = input.rng.die(config.sides, '十万年魂骨特性继承', { beastId: input.beastId || null });
  if (face <= config.allThreshold) {
    return Object.freeze({
      version: config.version,
      configVersion: config.version,
      beastId: input.beastId || null,
      face,
      sides: config.sides,
      mode: 'all',
      selectedTraitIds: ids.slice(),
      probabilityAll: config.allThreshold / config.sides,
      probabilityOne: (config.sides - config.allThreshold) / config.sides,
      frozen: true,
      suggestedConfig: config.suggested
    });
  }
  const pickFace = input.rng.die(ids.length, '十万年魂骨特性继承·单条');
  return Object.freeze({
    version: config.version,
    configVersion: config.version,
    beastId: input.beastId || null,
    face,
    sides: config.sides,
    mode: 'one',
    selectedTraitIds: [ids[pickFace - 1]],
    pick: { sides: ids.length, face: pickFace },
    probabilityAll: config.allThreshold / config.sides,
    probabilityOne: (config.sides - config.allThreshold) / config.sides,
    frozen: true,
    suggestedConfig: config.suggested
  });
}

/** 已验证的继承结果（读档时只用它，不重投）。 */
function validateInheritance(result, traits) {
  if (!isPlainObject(result) || result.frozen !== true) throw new Error('魂骨继承结果未冻结');
  if (![1, VERSIONS.tenThousandInheritance].includes(result.version)) throw new Error('魂骨继承规则版本不一致');
  const ids = validateTraits(traits);
  if (!Array.isArray(result.selectedTraitIds) || !result.selectedTraitIds.length) throw new Error('继承结果缺少选中特性');
  if (!['all', 'one'].includes(result.mode)) throw new Error('继承模式无效');
  if (new Set(result.selectedTraitIds).size !== result.selectedTraitIds.length) throw new Error('继承结果含重复特性');
  if (result.selectedTraitIds.some((id) => !ids.includes(id))) throw new Error('继承结果含魂兽之外的特性');
  if (result.mode === 'all' && result.selectedTraitIds.length !== ids.length) throw new Error('“全部继承”结果不完整');
  if (result.mode === 'one' && result.selectedTraitIds.length !== 1) throw new Error('“获得一条”结果不合法');
  return true;
}

/** 供文档/测试使用的理论分布：每条特性单独被选中的概率。 */
function theoreticalDistribution(count) {
  if (!Number.isInteger(count) || count < 2) throw new Error('特性数量须为≥2的整数');
  const all = DEFAULT_CONFIG.allThreshold / DEFAULT_CONFIG.sides;
  const perOne = (1 - all) / count;
  return { all, perTrait: all + perOne, selectedOnlyPerTrait: perOne, count };
}

module.exports = { DEFAULT_CONFIG, rollInheritance, validateInheritance, validateTraits, theoreticalDistribution, matchingAttributes };

},"/modules/src/reward/ring.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 十万年魂环生成与第九环落地（交接文档第九、十三、十五节）。
 *
 * 已定：
 *   - 新获得十万年魂环／魂兽成果只开放两个合法入口：本次固定讨伐实际战胜库中魂兽；
 *     原有第九环极端出目，保留其现有生成规则和概率链，不额外放宽。
 *   - 100000年魂环沿用同环两技及共享冷却，且两个魂技都要能正常显示与参战。
 *   - 胜利时不足90级：保存并标记“预留第九环”，不提前装成第八环，也不丢弃；
 *     达到90级且第1—8环齐备、第九环空缺时自动吸收；
 *     中间缺环则保留在队列，不跳过缺环装到错误位置。
 *   - 90级已合法持有第九环时，不再生成第十个魂环。
 *
 * 魂技的实际威力、费用与准备时间由战斗侧 makeSkill 计算，本模块不自造第二套数值。
 */

const { clone, isPlainObject, requireInteger } = require('../util');
const { VERSIONS } = require('../versions');
const { tagSkill } = require('../battle/skill-attributes');

const RING_INDEX = 9;
const YEARS = 100000;
const CAP = 100000;
const CATEGORIES = Object.freeze(['攻击', '强化', '防御', '减益', '控制']);
const ALLOWED_ENTRANCES = Object.freeze(['fixed-hunt', 'legacy-ninth-extreme']);

function assertCharacter(character) {
  if (!isPlainObject(character)) throw new Error('角色数据无效');
  if (!Array.isArray(character.rings)) throw new Error('角色缺少魂环数组');
  if (!isPlainObject(character.stats)) throw new Error('角色缺少实际面板，无法生成魂技');
  if (!isPlainObject(character.soul)) throw new Error('角色缺少武魂数据，无法生成魂技');
  return character;
}

/**
 * @param {object} input {character, seed, rng, makeSkill, pickCategory, transactionId, category, acquiredAt}
 */
function createHundredThousandRing(input) {
  const character = assertCharacter(input.character);
  if (typeof input.seed !== 'string' || !input.seed) throw new Error('十万年魂环须带确定性种子');
  if (!input.rng || typeof input.rng.die !== 'function') throw new Error('十万年魂环须使用游戏确定性投骰器');
  if (typeof input.makeSkill !== 'function') throw new Error('十万年魂环须调用战斗侧 makeSkill，禁止另写一套数值');
  if (typeof input.transactionId !== 'string' || !input.transactionId) throw new Error('十万年魂环须记录奖励事务ID');

  let first = input.category;
  if (!first) {
    first = typeof input.pickCategory === 'function'
      ? input.pickCategory(character.style, input.rng.die(100, '十万年第一魂技类别'))
      : CATEGORIES[0];
  }
  if (!CATEGORIES.includes(first)) first = CATEGORIES[0];
  const remaining = CATEGORIES.filter((category) => category !== first);
  const second = remaining[input.rng.die(remaining.length, '十万年第二魂技类别') - 1];

  const make = (category, variant) => {
    const effectSeed = input.seed + '|event-ring|9|' + variant;
    const skill = input.makeSkill({
      soul: character.soul,
      style: character.style,
      stats: character.stats,
      index: RING_INDEX,
      years: YEARS,
      category,
      variant,
      effectSeed
    });
    return {
      ...tagSkill(skill, character.soul),
      category,
      variant,
      effectSeed,
      ring: RING_INDEX,
      years: YEARS,
      sharedCooldown: 'ring-9',
      guarantee: '同环两技共享冷却'
    };
  };

  const skills = [make(first, 0), make(second, 1)];
  if (skills.length !== 2 || skills[0].category === skills[1].category) throw new Error('十万年魂环必须生成两个不同类别的魂技');
  skills.forEach((skill) => {
    if (skill.sharedCooldown !== 'ring-9') throw new Error('同环两技必须共享冷却');
  });

  const entrance = input.entrance || 'fixed-hunt';
  if (!ALLOWED_ENTRANCES.includes(entrance)) throw new Error('非法十万年来源入口：' + entrance);
  const ring = {
    index: RING_INDEX,
    years: YEARS,
    cap: CAP,
    quality: 100,
    plan: 'hunt',
    band: '十万年',
    q: 4.5,
    skills,
    guarantee: '同环两技共享冷却',
    acquiredAt: input.acquiredAt === undefined ? null : clone(input.acquiredAt),
    source: {
      type: entrance === 'fixed-hunt' ? 'hunt' : 'legacy-ninth-extreme',
      transactionId: input.transactionId,
      generationVersion: VERSIONS.rewardTransaction,
      allowedEntrances: ALLOWED_ENTRANCES.slice(),
      entrance
    }
  };
  assertLegalTenThousandSource(ring);
  return ring;
}

/**
 * 新获得十万年魂环的合法来源校验：
 * 只允许本次固定讨伐，或原有第九环极端出目；普通八环及以前的猎魂、
 * 普通事件随机奖池、武魂特性、临时返还、魂骨生成池都不能混入。
 */
function assertLegalTenThousandSource(ring) {
  if (!isPlainObject(ring) || ring.index !== RING_INDEX || ring.years !== YEARS) throw new Error('不是十万年第九环');
  if (!isPlainObject(ring.source)) throw new Error('十万年魂环缺少来源记录');
  if (!ALLOWED_ENTRANCES.includes(ring.source.entrance)) throw new Error('十万年魂环来源入口非法：' + ring.source.entrance);
  if (!['hunt', 'legacy-ninth-extreme'].includes(ring.source.type)) throw new Error('十万年魂环来源类型非法：' + ring.source.type);
  if (ring.source.entrance === 'fixed-hunt' && (typeof ring.source.transactionId !== 'string' || !ring.source.transactionId)) {
    throw new Error('讨伐来源必须记录奖励事务ID');
  }
  return true;
}

/**
 * 吸收时重算魂技：预留阶段只锁定年限、来源、魂技类别与生成种子；
 * 实际威力、费用与准备预览必须按吸收后当前角色的统一接口重算，不能沿用旧面板的数值。
 */
function rehydrateHundredThousandRing(input) {
  const character = assertCharacter(input.character);
  if (typeof input.makeSkill !== 'function') throw new Error('重算预留魂环须调用战斗侧 makeSkill');
  const ring = input.ring;
  if (!isPlainObject(ring) || ring.index !== RING_INDEX || ring.years !== YEARS) throw new Error('不是十万年第九环');
  if (!Array.isArray(ring.skills) || ring.skills.length !== 2) throw new Error('十万年第九环必须有两个魂技');
  const skills = ring.skills.map((stored, index) => {
    const category = stored.category;
    if (!CATEGORIES.includes(category)) throw new Error('预留魂环的魂技类别无效：' + category);
    const variant = stored.variant === undefined ? index : stored.variant;
    const effectSeed = stored.effectSeed || (input.seed || '') + '|event-ring|9|' + variant;
    const fresh = input.makeSkill({
      soul: character.soul,
      style: character.style,
      stats: character.stats,
      index: RING_INDEX,
      years: YEARS,
      category,
      variant,
      effectSeed
    });
    return {
      ...tagSkill(fresh, character.soul),
      category,
      variant,
      effectSeed,
      ring: RING_INDEX,
      years: YEARS,
      sharedCooldown: 'ring-9',
      guarantee: '同环两技共享冷却'
    };
  });
  return { ...clone(ring), skills };
}

/** 第九环落地：不足90级预留；90级且八环齐备自动吸收；缺环或已九环保持队列。 */
function handleNinthRing(input) {
  const character = assertCharacter(input.character);
  const level = requireInteger(input.level, '等级', 1, 99);
  const ring = input.ring;
  if (!isPlainObject(ring) || ring.index !== RING_INDEX || ring.years !== YEARS) throw new Error('不是十万年第九环');

  assertLegalTenThousandSource(ring);
  if (character.rings.some((item) => item.index === 9) || character.rings.length >= 9) {
    return {
      action: 'already-nine',
      absorbed: false,
      reason: '已合法持有第九环：不覆盖、不生成第十环、不塞第三个技能',
      pendingRing: clone(ring)
    };
  }
  if (level < 90) {
    return { action: 'pre-stored', absorbed: false, reason: '不足90级：预留第九环，不提前装成第八环', pendingRing: clone(ring) };
  }
  const hasAllEight = Array.from({ length: 8 }, (_, i) => character.rings.some((item) => item.index === i + 1)).every(Boolean);
  if (!hasAllEight) {
    return { action: 'queued-gap', absorbed: false, reason: '第1—8环不齐备：保留在队列，不跳过缺环', pendingRing: clone(ring) };
  }
  // 真正吸收时按当前面板重算两技数值；类别与种子沿用预留时锁定的值。
  const finalRing = input.makeSkill ? rehydrateHundredThousandRing({ ring, character, makeSkill: input.makeSkill, seed: input.seed }) : ring;
  character.rings.push(clone(finalRing));
  for (const key of ['preStoredNinthRing', 'pendingNinthRing']) {
    const pending = character[key];
    if (pending && pending.source && ring.source && pending.source.transactionId === ring.source.transactionId) delete character[key];
  }
  return { action: 'absorbed', absorbed: true, reason: '90级且八环齐备、第九环空缺：自动吸收', pendingRing: null };
}

/** 面板/战斗/存档共用的一致性检查：第九环必须是真实已吸收的十万年环。 */
function assertNinthRingConsistency(character) {
  const rings = character.rings || [];
  if (rings.length > 9) throw new Error('出现第十个魂环，超出九环上限');
  if (new Set(rings.map((ring) => ring.index)).size !== rings.length) throw new Error('魂环位置重复');
  const ninth = rings.find((ring) => ring.index === RING_INDEX);
  if (!ninth) return { hasNinth: false, consistent: true };
  if (ninth.years !== YEARS) {
    if (ninth.source && ninth.source.type === 'hunt') throw new Error('第九环不是十万年，不能标记为事件奖励');
    return { hasNinth: true, consistent: true, skillCount: (ninth.skills || []).length, years: ninth.years };
  }
  if (!Array.isArray(ninth.skills) || ninth.skills.length !== 2) throw new Error('十万年第九环必须有两个魂技');
  if (!ninth.skills.every((skill) => skill.sharedCooldown === 'ring-9')) throw new Error('十万年第九环两技未共享冷却');
  if (rings.length > 9) throw new Error('出现第十个魂环，超出九环上限');
  return { hasNinth: true, consistent: true, skillCount: ninth.skills.length, years: ninth.years };
}

module.exports = { RING_INDEX, YEARS, CAP, CATEGORIES, ALLOWED_ENTRANCES, createHundredThousandRing, rehydrateHundredThousandRing, handleNinthRing, assertNinthRingConsistency, assertLegalTenThousandSource };

},"/modules/src/reward/runner.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 讨伐首胜奖励执行器（把交接文档第十四节的九步接到一起）。
 *
 * 只负责“玩家这一套”战利品：队伍胜利不会因为两位NPC而发三套，
 * 也不会因为最后一击由NPC完成而不给玩家。
 * 所有步骤在克隆后的角色/账本上进行，失败时由事务记录断点，重试不会重发已完成的奖励。
 */

const { clone, isPlainObject } = require('../util');
const { ensureTransaction, settleTransaction, freezeBeastReward } = require('./transaction');
const { attributeTags } = require('../battle/skill-attributes');
const { rollInheritance } = require('./inheritance');
const { createHundredThousandRing, handleNinthRing } = require('./ring');
const { createBoneInstance } = require('../soulbone/instance');
const { absorbBone, applySource, validateLedger } = require('../soulbone/absorption');
const { SLOTS, rollBoneSlot } = require('../soulbone/instance');
const { validateBeast } = require('../beast/library');
const { RollLog } = require('../rng');

function createHuntRewardRunner(input) {
  const { library, store } = input;
  if (!library) throw new Error('奖励执行器缺少魂兽库');
  if (!isPlainObject(store)) throw new Error('奖励执行器缺少奖励账本');

  /**
   * @param {object} run { transactionId, beastSnapshot, character, equipmentLedger, ledger, level, rng, makeSkill, pickCategory, at }
   */
  function run(runInput) {
    let beast = runInput.beastSnapshot;
    if (!beast) throw new Error('奖励执行器缺少冻结魂兽定义');
    validateBeast(beast);
    const character = clone(runInput.character);
    const equipmentLedger = clone(runInput.equipmentLedger);
    if (!character || runInput.level !== character.level) throw new Error('奖励等级与角色当前等级不一致');
    validateLedger(equipmentLedger);
    const ensured = ensureTransaction(store, {
      transactionId: runInput.transactionId,
      sessionId: runInput.sessionId || null,
      target: { id: beast.id, version: beast.version },
      characterLevel: runInput.level,
      mode: 'hunt',
      firstWin: runInput.firstWin === true
    });
    const tx = ensured.transaction;
    if (!tx.beastSnapshot) tx.beastSnapshot = clone(beast);
    beast = tx.beastSnapshot;
    if(!tx.characterAttributes)tx.characterAttributes=attributeTags(character.soul); // 首胜结算起点锁定，断点重试不改适配结果。
    // 每一步使用同一份持久化骰序。失败步骤的骰序回滚；成功步骤随事务一起保存。
    if (!tx.rngSnapshot) {
      if (!runInput.rng || typeof runInput.rng.snapshot !== 'function') throw new Error('奖励骰须支持可存档快照');
      tx.rngSnapshot = runInput.rng.snapshot();
      tx.rewardSeed = runInput.seed || 'hunt-reward:' + runInput.transactionId;
    }
    const rewardRng = RollLog.restore(tx.rngSnapshot);

    // 断点续结：已完成的步骤不重掷，但要把它们的落地效果补到本次传入的角色/账本上。
    const resumedSteps = reconcile(ensured.transaction, character, equipmentLedger, runInput);
    const actions = {
      'win-record': () => ({ at: runInput.at === undefined ? null : runInput.at, transactionId: runInput.transactionId }),
      'freeze-reward': () => freezeBeastReward(beast),
      ring: () => {
        return createHundredThousandRing({
          character,
          seed: tx.rewardSeed,
          rng: rewardRng,
          makeSkill: runInput.makeSkill,
          pickCategory: runInput.pickCategory,
          transactionId: runInput.transactionId,
          acquiredAt: runInput.at
        });
      },
      bone: ({ results }) => {
        const frozen = results['freeze-reward'];
        const slotRoll = frozen.bone.slot === 'random' ? rollBoneSlot({ rng: rewardRng, availableSlots: (()=>{const occupied=new Set([...(character.bones||[]),...(character.inventory||[])].map(b=>b.base?.slot||b.slot));const empty=SLOTS.filter(s=>!occupied.has(s));return empty.length?empty:SLOTS;})() }) : null;
        const slot = slotRoll ? slotRoll.slot : frozen.bone.slot;
        if (!SLOTS.includes(slot)) throw new Error('魂兽魂骨部位规则无效：' + frozen.bone.slot);
        return createBoneInstance({
          boneId: 'bone:' + runInput.transactionId,
          definitionId: 'beast-bone:' + beast.id,
          source: { type: 'hunt', acquisitionId: runInput.transactionId, beastId: beast.id, beastVersion: beast.version, obtainedAt: runInput.at },
          base: { years: 100000, slot, name: beast.name + '·' + slot + '魂骨', affinity: (beast.elements || []).join('／') || beast.lifeType },
          budget: runInput.budget,
          traits: [],
          rolls: { drop: null, slot: slotRoll, assembly: null, inheritance: null }
        });
      },
      inheritance: ({ results }) => {
        const frozen = results['freeze-reward'];
        const inheritance = rollInheritance({ traits: frozen.traits, rng: rewardRng, beastId: beast.id, config: runInput.inheritanceConfig, characterAttributes: tx.characterAttributes, beastAttributes: beast.elements });
        const chosen = frozen.traits.filter((trait) => inheritance.selectedTraitIds.includes(trait.id));
        const bone = results.bone;
        const inherited = chosen.map((trait) => ({
          traitId: trait.id,
          name: trait.inherit.name || trait.name,
          effect: trait.inherit.effect || trait.effect,
          definitionVersion: frozen.beastVersion,
          implementationVersion: trait.inherit.implementationVersion,
          handler: trait.inherit.handler,
          params: trait.inherit.params || {},
          save: trait.inherit.save || { schemaVersion: 1, fields: [] },
          dependsOn: trait.inherit.dependsOn || [],
          stackGroup: trait.inherit.stackGroup || trait.id,
          maxStacks: trait.inherit.maxStacks || 1,
          assemblyVersion: 1
        }));
        const nextBone = createBoneInstance({
          boneId: bone.boneId,
          definitionId: bone.definitionId,
          source: bone.source,
          base: bone.base,
          attributes: bone.attributes,
          traits: inherited,
          rolls: { ...bone.rolls, inheritance: { face: inheritance.face, mode: inheritance.mode, selectedTraitIds: inheritance.selectedTraitIds, configVersion: inheritance.configVersion, matchedAttributes: inheritance.matchedAttributes || [], reason: inheritance.reason || 'roll' } }
        });
        return { inheritance, bone: nextBone, traits: inherited };
      },
      absorb: ({ results }) => {
        return absorbBone({ character, bone: results.inheritance.bone, ledger: equipmentLedger });
      },
      'ninth-ring': ({ results }) => {
        const result = handleNinthRing({
          character,
          ring: results.ring,
          level: runInput.level,
          makeSkill: runInput.makeSkill,
          seed: tx.rewardSeed
        });
        if (result.action === 'already-nine') {
          character.pendingNinthRing = result.pendingRing;
        } else if (result.pendingRing) {
          character.preStoredNinthRing = result.pendingRing;
        }
        return result;
      },
      report: ({ results }) => {
        const record = {
          ...clone(runInput.battleReport || {}),
          type: 'hunt',
          recordVersion: 1,
          transactionId: runInput.transactionId,
          targetId: beast.id,
          targetVersion: beast.version,
          level: runInput.level,
          ring: { index: results.ring.index, years: results.ring.years, categories: results.ring.skills.map((skill) => skill.category) },
          bone: { boneId: results['inheritance'].bone.boneId, slot: results['inheritance'].bone.base.slot, years: results['inheritance'].bone.base.years },
          inheritance: clone(results.inheritance.inheritance),
          absorption: { status: results.absorb.status },
          ninthRing: { action: results['ninth-ring'].action },
          preStoredRing: results['ninth-ring'].pendingRing || null,
          rewards: { rings: [clone(results.ring)], bones: [clone(results.inheritance.bone)] },
          at: runInput.at === undefined ? null : runInput.at
        };
        if (!Array.isArray(store.reports)) store.reports = [];
        store.reports = [...store.reports.filter((item) => item.transactionId !== runInput.transactionId), record];
        return record;
      },
      'restore-flow': () => ({ restored: !!runInput.restore && runInput.restore() })
    };
    const checkpointed = Object.fromEntries(Object.entries(actions).map(([key, action]) => [key, (context) => {
      const result = action(context);
      context.transaction.rngSnapshot = rewardRng.snapshot();
      return result;
    }]));
    const settled = settleTransaction(tx, checkpointed);

    store.transactions[runInput.transactionId] = clone(settled.transaction);
    return {
      transaction: settled.transaction,
      reused: ensured.reused,
      resumedSteps,
      failedStep: settled.failedStep,
      error: settled.error,
      character,
      equipmentLedger,
      result: settled.failedStep ? null : {
        ring: settled.transaction.steps.ring.result,
        bone: settled.transaction.steps['inheritance'].result.bone,
        inheritance: settled.transaction.steps['inheritance'].result.inheritance,
        absorption: settled.transaction.steps.absorb.result,
        ninthRing: settled.transaction.steps['ninth-ring'].result,
        report: settled.transaction.steps.report.result
      }
    };
  }

  return Object.freeze({ run });
}

/**
 * 断点续结的落地补偿：已完成步骤的骰果不再重掷，但如果调用方传入的角色/账本
 * 还没有这些成果（例如读到“已胜利未展示奖励”的存档），就把它们补上。
 * 以 boneId / 第九环索引去重，绝不重复发放。
 */
function reconcile(transaction, character, ledger, input) {
  const applied = [];
  const inheritanceStep = transaction.steps.inheritance;
  if (transaction.steps.absorb.status === 'done' && inheritanceStep.status === 'done') {
    const bone = inheritanceStep.result.bone;
    const equipped = character.bones.find((item) => item.boneId === bone.boneId);
    if (equipped) {
      applySource(equipped, ledger);
      applied.push('equipment-source');
    }
    const known = character.bones.some((item) => item.boneId === bone.boneId)
      || (character.inventory || []).some((item) => item.boneId === bone.boneId);
    if (!known && !ledger.removedBones[bone.boneId]) {
      // 账本已保存而角色未保存时也要恢复实物；曾主动拆下的骨不自动重新装备。
      delete ledger.absorbedBones[bone.boneId];
      absorbBone({ character, bone, ledger });
      applied.push('absorb');
    }
  }
  const ninth = transaction.steps['ninth-ring'];
  if (ninth.status === 'done' && transaction.steps.ring.status === 'done') {
    const ring = transaction.steps.ring.result;
    const action = ninth.result.action;
    if (action === 'absorbed' && !character.rings.some((item) => item.index === 9)) {
      handleNinthRing({ character, ring, level: input.level, makeSkill: input.makeSkill });
      applied.push('ninth-ring');
    } else if ((action === 'pre-stored' || action === 'queued-gap') && !character.rings.some((item) => item.index === 9 && item.source && item.source.transactionId === transaction.transactionId)) {
      if (!character.preStoredNinthRing) character.preStoredNinthRing = clone(ring);
    } else if (action === 'already-nine') {
      if (!character.pendingNinthRing) character.pendingNinthRing = clone(ring);
    }
  }
  return applied;
}

module.exports = { createHuntRewardRunner };

},"/modules/src/reward/transaction.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 首胜奖励事务（交接文档第十四节）。
 *
 * 首次真正胜利后按固定顺序完成：
 *   记录胜利凭证 → 冻结魂兽奖励 → 生成100000年魂环 → 生成100000年魂骨 →
 *   完成魂骨继承判定 → 自动吸收／冲突处理 → 处理立即或预存的第九环 →
 *   写入战报与领取账本 → 恢复原剧情。
 *
 * 同一场胜利只能创建一个奖励事务ID。重复回调、读到“已胜利未展示奖励”的存档
 * 或奖励页面重开时，只补完未完成步骤，不重发魂环、魂骨、属性或特性。
 */

const { clone, deepFreeze, isPlainObject } = require('../util');
const { VERSIONS } = require('../versions');

const STEP_KEYS = Object.freeze([
  'win-record',
  'freeze-reward',
  'ring',
  'bone',
  'inheritance',
  'absorb',
  'ninth-ring',
  'report',
  'restore-flow'
]);

function createTransaction(input) {
  if (!isPlainObject(input)) throw new Error('奖励事务参数无效');
  if (typeof input.transactionId !== 'string' || !input.transactionId) throw new Error('奖励事务缺少唯一ID');
  if (!isPlainObject(input.target) || typeof input.target.id !== 'string' || !Number.isInteger(input.target.version)) {
    throw new Error('奖励事务缺少冻结目标ID与版本');
  }
  if (input.firstWin !== true) throw new Error('只有首胜才能创建奖励事务');
  if (typeof input.sessionId !== 'string' || !input.sessionId) throw new Error('首胜奖励必须提供唯一战斗场次ID');
  const steps = {};
  for (const key of STEP_KEYS) steps[key] = { status: 'pending', result: null, error: null };
  return {
    version: VERSIONS.rewardTransaction,
    transactionId: input.transactionId,
    sessionId: input.sessionId || null,
    target: { id: input.target.id, version: input.target.version },
    characterLevel: input.characterLevel,
    mode: input.mode || 'hunt',
    status: 'pending',
    steps,
    createdAt: input.createdAt === undefined ? null : input.createdAt,
    completedAt: null
  };
}

/** 同一事务ID只创建一次；已有记录原样返回，不追加奖励。 */
function ensureTransaction(store, input) {
  if (!isPlainObject(store)) throw new Error('奖励账本无效');
  if (!store.transactions) store.transactions = Object.create(null);
  if (input.sessionId) {
    const clash = Object.values(store.transactions).find((item) => item.sessionId === input.sessionId && item.transactionId !== input.transactionId);
    if (clash) throw new Error('同一场胜利只能创建一个奖励事务ID：已有 ' + clash.transactionId);
  }
  const existing = store.transactions[input.transactionId];
  if (existing) {
    if (existing.target.id !== input.target.id || existing.target.version !== input.target.version) {
      throw new Error('同一奖励事务ID指向了不同目标，拒绝重发');
    }
    if (existing.sessionId !== input.sessionId) throw new Error('奖励事务的战斗场次ID不一致');
    return { transaction: clone(existing), reused: true };
  }
  const transaction = createTransaction(input);
  store.transactions[input.transactionId] = clone(transaction);
  return { transaction, reused: false };
}

/**
 * 断点续结。actions 每个步骤一个函数，参数为 {transaction, results}。
 * 已完成步骤直接跳过；失败步骤记录原因，下次从该步继续。
 */
function settleTransaction(transaction, actions) {
  if (!isPlainObject(transaction) || transaction.version !== VERSIONS.rewardTransaction) throw new Error('奖励事务无效');
  const next = clone(transaction);
  const results = {};
  for (const key of STEP_KEYS) if (next.steps[key].status === 'done') results[key] = next.steps[key].result;
  const events = [];

  for (const key of STEP_KEYS) {
    const step = next.steps[key];
    if (step.status === 'done') {
      events.push({ key, status: 'skipped-already-done' });
      continue;
    }
    const action = actions[key];
    if (typeof action !== 'function') {
      next.steps[key] = { ...step, status: 'blocked', error: '缺少步骤实现：' + key };
      next.status = 'blocked';
      return { transaction: next, events, blockedStep: key, error: next.steps[key].error };
    }
    try {
      const result = action({ transaction: next, results });
      next.steps[key] = { status: 'done', result: result === undefined ? null : clone(result), error: null };
      results[key] = next.steps[key].result;
      events.push({ key, status: 'done' });
    } catch (error) {
      next.steps[key] = { status: 'failed', result: null, error: error.message };
      next.status = 'failed';
      return { transaction: next, events, failedStep: key, error };
    }
  }
  next.status = 'done';
  next.completedAt = null;
  return { transaction: next, events, failedStep: null, error: null };
}

/** 冻结魂兽奖励：锁定该兽的魂环描述、魂骨部位规则与可继承特性定义／版本。 */
function freezeBeastReward(beast) {
  if (!isPlainObject(beast)) throw new Error('冻结奖励须有魂兽定义');
  if (!Array.isArray(beast.traits) || beast.traits.length < 2) throw new Error('冻结奖励要求至少两个可继承特性');
  for (const trait of beast.traits) {
    if (!trait.inherit || typeof trait.inherit.handler !== 'string' || !trait.inherit.handler) {
      throw new Error('魂兽特性「' + trait.id + '」没有玩家可执行的继承版本，不能进入奖励事务');
    }
    if (!Number.isInteger(trait.inherit.implementationVersion) || trait.inherit.implementationVersion < 1) {
      throw new Error('魂兽特性「' + trait.id + '」的继承版本号无效');
    }
  }
  return deepFreeze({
    version: VERSIONS.rewardTransaction,
    beastId: beast.id,
    beastVersion: beast.version,
    years: beast.years,
    ring: clone(beast.ringReward),
    bone: { slot: beast.bone.slot, description: beast.bone.description || null },
    traits: beast.traits.map((trait) => ({
      id: trait.id,
      name: trait.name,
      effect: trait.effect,
      inherit: clone(trait.inherit)
    })),
    traitInheritanceVersion: beast.traitInheritanceVersion
  });
}

function isComplete(transaction) {
  return transaction && transaction.status === 'done';
}

function pendingSteps(transaction) {
  return STEP_KEYS.filter((key) => transaction.steps[key].status !== 'done');
}

module.exports = { STEP_KEYS, createTransaction, ensureTransaction, settleTransaction, freezeBeastReward, isComplete, pendingSteps };

},"/modules/src/rng.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 与游戏 core.js 的 DiceEngine 同算法的确定性投骰。
 *
 * 交接文档要求：沿用游戏确定性种子与投骰日志，禁止读取浏览器当前时间另起随机数。
 * 因此这里不调用 Math.random，也不读 Date；种子由调用方传入，序列状态可存档续投。
 * 算法逐行对齐 v11.01 的 `骰子系统/core.js`：
 *   hashSeed = FNV-1a；nextUint = (state + 0x6D2B79F5) 再 xorshift-mix；die 用拒绝采样。
 */

function hashSeed(seed) {
  let h = 2166136261;
  for (const c of String(seed)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

class DiceEngine {
  constructor(seed, state) {
    this.seed = String(seed);
    this.state = state === undefined ? hashSeed(seed) : state >>> 0;
  }

  nextUint() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  die(sides) {
    if (!Number.isInteger(sides) || sides < 2 || sides > 100000) {
      throw new Error('骰子面数须为2—100000的整数');
    }
    const limit = Math.floor(4294967296 / sides) * sides;
    let u;
    do {
      u = this.nextUint();
    } while (u >= limit);
    return (u % sides) + 1;
  }

  roll(sides, count = 1, modifier = 0) {
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      throw new Error('同投数量须为1—100的整数');
    }
    if (!Number.isInteger(modifier) || modifier < -999 || modifier > 999) {
      throw new Error('总修正须为−999到999的整数');
    }
    const before = this.state;
    const faces = Array.from({ length: count }, () => this.die(sides));
    const subtotal = faces.reduce((a, b) => a + b, 0);
    return { sides, count, modifier, faces, subtotal, total: subtotal + modifier, before, after: this.state };
  }
}

/**
 * 带日志的投骰器。日志条目结构与游戏 state.rolls 接近，至少含：
 * label / sides / face / seq / seed / stateAfter / version。
 * 调用方可把 entries 原样落入存档，读档后用 restore 继续，序列不回卷。
 */
class RollLog {
  constructor(seed, entries, state) {
    this.engine = new DiceEngine(seed, state === undefined ? undefined : state);
    this.seed = String(seed);
    this.entries = Array.isArray(entries) ? entries.map((e) => ({ ...e })) : [];
    this.seq = this.entries.reduce((n, e) => Math.max(n, e.seq || 0), 0);
  }

  die(sides, label, context) {
    const before = this.engine.state;
    const face = this.engine.die(sides);
    const entry = {
      seq: ++this.seq,
      label: String(label || '投骰'),
      sides,
      face,
      seed: this.seed,
      stateBefore: before,
      stateAfter: this.engine.state,
      ...(context === undefined ? {} : { context })
    };
    this.entries.push(entry);
    return face;
  }

  d100(label, context) {
    return this.die(100, label, context);
  }

  d10000(label, context) {
    return this.die(10000, label, context);
  }

  get state() {
    return this.engine.state;
  }

  snapshot() {
    return { seed: this.seed, state: this.engine.state, seq: this.seq, entries: this.entries.map((e) => ({ ...e })) };
  }

  static restore(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('投骰日志快照无效');
    if (typeof snapshot.seed !== 'string' && typeof snapshot.seed !== 'number') throw new Error('投骰日志缺少种子');
    return new RollLog(snapshot.seed, snapshot.entries, snapshot.state);
  }
}

/** 统一入口：种子 + 可选日志快照。 */
function createRng(seed, snapshot) {
  if (snapshot !== undefined) return RollLog.restore(snapshot);
  return new RollLog(seed);
}

/**
 * 从 count 个等概率选项中取一个。count 为 1 时只有一种结果，不消耗随机序列，
 * 但仍返回一个可审计的退化记录（游戏骰子要求面数≥2，不能 die(1)）。
 */
function drawIndex(rng, count, label, context) {
  if (!Number.isInteger(count) || count < 1) throw new Error('抽取项数须为≥1的整数');
  if (count === 1) return { face: 1, sides: 1, degenerate: true, label };
  return { face: rng.die(count, label, context), sides: count, degenerate: false, label };
}

/** 大权重池仍只调用宿主支持的≤100000面骰，使用拒绝采样保持等概率。 */
function drawWeightedFace(rng, total, label, context) {
  if (!Number.isSafeInteger(total) || total < 1 || total > 281474976710656) throw new Error('权重总和超出可投骰范围');
  if (total === 1) return 1;
  if (total <= 100000) return rng.die(total, label, context);
  const range = 281474976710656; // 2^48，三枚1d65536组合，无浮点精度损失
  const limit = Math.floor(range / total) * total;
  let value;
  do {
    value = 0;
    for (let i = 0; i < 3; i++) value = value * 65536 + rng.die(65536, label, context) - 1;
  } while (value >= limit);
  return value % total + 1;
}

module.exports = { DiceEngine, RollLog, hashSeed, createRng, drawIndex, drawWeightedFace };

},"/modules/src/soulbone/absorption.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 魂骨吸收（交接文档第十六节）。
 *
 * 核心口径：
 *   - 得到可吸收魂骨后，在该次获得或战斗结算结束的安全节点直接处理；
 *     不消耗普通事件次数、不推进月份、不多给事件经验、不重投事件成功与否。
 *   - 剧情赠骨、万年掉骨、讨伐十万年掉骨共用同一入口。
 *   - 永久属性修正进入“装备来源账本”；特性进入“运行时来源注册”；
 *     保存、读取、刷新面板与进入战斗只构建同一份有效修正，
 *     不把属性反复加进成长，也不把同一特性注册两次。
 *   - 有合法空位时自动完成；有部位冲突时先保证新骨已获得，
 *     转入独立换骨处理窗口，不占事件；不悄悄丢骨，也不暗拆旧骨。
 */

const { clone, isPlainObject } = require('../util');
const { VERSIONS, PENDING } = require('../versions');
const { SLOTS, validateBoneInstance, markStatus } = require('./instance');

function createEquipmentLedger() {
  return {
    version: VERSIONS.equipmentSource,
    attributes: Object.create(null), // sourceBoneId -> {slot, years, stats, budgetVersion}
    runtimeTraits: Object.create(null), // `${boneId}::${traitId}` -> trait record
    absorbedBones: Object.create(null), // boneId -> {slot, years}
    removedBones: Object.create(null),
    pendingBudget: Object.create(null)
  };
}

function validateLedger(ledger) {
  if (!isPlainObject(ledger) || ledger.version !== VERSIONS.equipmentSource) throw new Error('装备来源账本无效');
  if (!isPlainObject(ledger.attributes) || !isPlainObject(ledger.runtimeTraits)) throw new Error('装备来源账本结构无效');
  for (const key of ['absorbedBones', 'removedBones', 'pendingBudget']) {
    if (!isPlainObject(ledger[key])) throw new Error('装备来源账本缺少 ' + key);
  }
  return true;
}

function attributeTotals(ledger) {
  validateLedger(ledger);
  const totals = {};
  for (const entry of Object.values(ledger.attributes)) {
    for (const [key, value] of Object.entries(entry.stats)) totals[key] = (totals[key] || 0) + value;
  }
  return totals;
}

function slotOf(bone) {
  return bone && bone.base && bone.base.slot ? bone.base.slot : bone && bone.slot;
}

function boneIdOf(bone) {
  return bone && (bone.boneId || bone.id);
}

function findSlotOwner(character, slot) {
  return (character.bones || []).find((bone) => slotOf(bone) === slot) || null;
}

/**
 * @param {object} input {character, bone, ledger, policy?, inventory?}
 * @returns {object} 吸收结果；绝不静默丢弃新骨或旧骨。
 */
function absorbBone(input) {
  const { character, bone, ledger } = input;
  if (!isPlainObject(character) || !Array.isArray(character.bones)) throw new Error('角色缺少魂骨槽');
  if (!Array.isArray(character.inventory)) character.inventory = [];
  validateBoneInstance(bone);
  validateLedger(ledger);

  if (ledger.absorbedBones[bone.boneId]) {
    return { status: 'already-absorbed', changed: false, duplicate: true, boneId: bone.boneId, eventConsumed: 0, monthsAdvanced: 0 };
  }
  if (character.bones.some((item) => boneIdOf(item) === bone.boneId)) {
    // 旧档已穿在身上但没有装备来源账本：补登记来源，不重复加属性。
    applySource(bone, ledger);
    return { status: 'already-equipped', changed: false, duplicate: true, boneId: bone.boneId, eventConsumed: 0, monthsAdvanced: 0 };
  }

  const owner = findSlotOwner(character, bone.base.slot);
  if (owner) {
    // 先保证新骨已获得：进入背包，开独立换骨窗口；不吞事件、不丢新骨。
    if (!character.inventory.some((item) => boneIdOf(item) === bone.boneId)) character.inventory = [...character.inventory, clone(bone)];
    return {
      status: 'slot-conflict',
      changed: true,
      conflict: { incomingBoneId: bone.boneId, existingBoneId: boneIdOf(owner), slot: bone.base.slot },
      session: createReplacementSession({ incoming: bone, existing: owner, policy: input.policy }),
      eventConsumed: 0,
      monthsAdvanced: 0
    };
  }

  const applied = applySource(bone, ledger);
  character.bones = [...character.bones, markStatus(bone, 'absorbed', 'safe-node-absorption')];
  character.inventory = character.inventory.filter((item) => boneIdOf(item) !== bone.boneId);
  return {
    status: applied.attributesPending ? 'absorbed-with-pending-budget' : 'absorbed',
    changed: true,
    applied,
    eventConsumed: 0,
    monthsAdvanced: 0,
    repeatedEventReward: false
  };
}

function applySource(bone, ledger) {
  // 进入运行时前核对叠加组。即使调用者漏传抽池排除表也不能无限叠加。
  for (const trait of bone.traits) {
    const group = trait.stackGroup || trait.traitId;
    const count = Object.values(ledger.runtimeTraits).filter((entry) => entry.ownerBoneId !== bone.boneId && (entry.stackGroup || entry.traitId) === group).length;
    const ownCount = bone.traits.filter((entry) => (entry.stackGroup || entry.traitId) === group).length;
    if (count + ownCount > (trait.maxStacks || 1)) throw new Error('魂骨特性叠加组超出上限：' + group);
  }
  const attributesPending = bone.attributes === null;
  if (!attributesPending) {
    ledger.attributes[bone.boneId] = {
      slot: bone.base.slot,
      years: bone.base.years,
      stats: clone(bone.attributes.stats),
      budgetVersion: bone.attributes.budgetVersion
    };
    delete ledger.pendingBudget[bone.boneId];
  } else {
    ledger.pendingBudget[bone.boneId] = { slot: bone.base.slot, years: bone.base.years, reason: PENDING.ATTRIBUTE_BUDGET_UNSET };
  }
  for (const trait of bone.traits) {
    const key = bone.boneId + '::' + trait.traitId;
    if (ledger.runtimeTraits[key]) continue; // 同一特性只注册一次
    ledger.runtimeTraits[key] = {
      ...clone(trait),
      source: 'soulbone',
      ownerBoneId: bone.boneId,
      registeredVersion: VERSIONS.battleHooks
    };
  }
  ledger.absorbedBones[bone.boneId] = { slot: bone.base.slot, years: bone.base.years };
  return { attributesPending, attributeKeys: attributesPending ? [] : Object.keys(bone.attributes.stats), traitKeys: bone.traits.map((trait) => bone.boneId + '::' + trait.traitId) };
}

/** 拆除来源效果：只移除该骨自己的属性与特性，不碰训练成长账本。 */
function removeBoneSource(ledger, boneId) {
  validateLedger(ledger);
  const removed = { boneId, attributes: false, traits: [] };
  if (ledger.attributes[boneId]) {
    delete ledger.attributes[boneId];
    removed.attributes = true;
  }
  for (const key of Object.keys(ledger.runtimeTraits)) {
    if (ledger.runtimeTraits[key].ownerBoneId === boneId) {
      delete ledger.runtimeTraits[key];
      removed.traits.push(key);
    }
  }
  if (ledger.absorbedBones[boneId]) {
    delete ledger.absorbedBones[boneId];
    ledger.removedBones[boneId] = true;
  }
  delete ledger.pendingBudget[boneId];
  return removed;
}

function createReplacementSession(input) {
  const policy = input.policy || {};
  return {
    version: VERSIONS.soulboneAbsorption,
    slot: slotOf(input.incoming),
    incomingBoneId: boneIdOf(input.incoming),
    existingBoneId: boneIdOf(input.existing),
    options: ['replace-existing', 'keep-in-inventory'],
    allowDisassembly: policy.allowDisassembly === true,
    requiresConfirmation: true,
    note: '同部位冲突：新骨已获得并留在背包；由玩家确认换骨，不占用事件，不暗拆旧骨。'
  };
}

/**
 * 玩家确认后的换骨。未确认前不执行任何移除。
 * replace-existing：旧骨转入背包（不销毁），执行新骨吸收与旧骨来源清理。
 * keep-in-inventory：新骨留在背包并说明待处理原因。
 */
function confirmReplacement(input) {
  const { session, choice, character, ledger } = input;
  if (!session || session.requiresConfirmation !== true) throw new Error('换骨须有独立处理会话');
  if (!session.options.includes(choice)) throw new Error('换骨选项无效：' + choice);
  if (!isPlainObject(character) || !Array.isArray(character.bones)) throw new Error('角色缺少魂骨槽');
  validateLedger(ledger);
  if (!Array.isArray(character.inventory)) character.inventory = [];
  const incoming = character.inventory.find((bone) => boneIdOf(bone) === session.incomingBoneId);
  if (!incoming) throw new Error('背包中找不到待换的新魂骨');
  const existingIndex = character.bones.findIndex((bone) => boneIdOf(bone) === session.existingBoneId);
  if (existingIndex < 0) throw new Error('槽位上的旧魂骨已不存在');
  validateBoneInstance(incoming);
  if (slotOf(incoming) !== session.slot || slotOf(character.bones[existingIndex]) !== session.slot) {
    throw new Error('换骨会话的部位已失效，请重新检查槽位');
  }

  if (choice === 'keep-in-inventory') {
    return {
      status: 'kept-in-inventory',
      changed: false,
      pendingReason: PENDING.SLOT_CONFLICT,
      message: '新魂骨保留在背包，待玩家另行处理；旧魂骨未被拆除。'
    };
  }

  const existing = character.bones[existingIndex];
  const draft = clone(ledger);
  const removed = removeBoneSource(draft, boneIdOf(existing));
  applySource(incoming, draft);
  character.bones = character.bones.filter((bone) => boneIdOf(bone) !== boneIdOf(existing));
  character.inventory = character.inventory.filter((bone) => boneIdOf(bone) !== incoming.boneId);
  character.bones.push(markStatus(incoming, 'absorbed', 'replacement-confirmed'));
  character.inventory.push(markStatus(existing, 'in-inventory', 'replaced-by-' + incoming.boneId));
  Object.assign(ledger, draft);
  return { status: 'replaced', changed: true, removed, replacedBoneId: boneIdOf(existing), absorbedBoneId: incoming.boneId };
}

/** 读档/进战斗时构建同一份有效修正（不写回成长）。 */
function effectiveModifiers(ledger) {
  validateLedger(ledger);
  return {
    attributes: attributeTotals(ledger),
    traits: Object.values(ledger.runtimeTraits).map((trait) => clone(trait)),
    sources: Object.keys(ledger.absorbedBones)
  };
}

/** 空池或预算补齐后，在安全节点刷新已装备实例；同一来源覆盖登记，不重复叠加。 */
function refreshAbsorbedBone({ character, bone, ledger }) {
  validateBoneInstance(bone);
  validateLedger(ledger);
  const index = (character.bones || []).findIndex((item) => boneIdOf(item) === bone.boneId);
  if (index < 0 || slotOf(character.bones[index]) !== bone.base.slot) throw new Error('待补齐魂骨当前未装备或部位不一致');
  const old = character.bones[index];
  if (old.attributes && JSON.stringify(old.attributes) !== JSON.stringify(bone.attributes)) throw new Error('补齐不能改写已确定的魂骨属性');
  if ((old.traits || []).some((trait) => !bone.traits.some((next) => JSON.stringify(next) === JSON.stringify(trait)))) throw new Error('补齐不能改写已确定的魂骨特性');
  const applied = applySource(bone, ledger);
  character.bones[index] = markStatus(bone, 'absorbed', 'pending-content-completed');
  return { status: 'refreshed', applied, eventConsumed: 0, monthsAdvanced: 0 };
}

module.exports = {
  createEquipmentLedger,
  validateLedger,
  attributeTotals,
  absorbBone,
  removeBoneSource,
  createReplacementSession,
  confirmReplacement,
  effectiveModifiers,
  refreshAbsorbedBone,
  applySource,
  SLOTS
};

},"/modules/src/soulbone/drop.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 普通猎魂的万年魂骨掉落骰（交接文档第十节）。
 *
 * 已定：
 *   - 本次已猎杀魂兽产生的候选魂环，其魂兽年限在10000—99999年，才投骰；
 *     十年、百年、千年掉落概率为0；100000年走讨伐专门来源，不走这里。
 *   - 气运1约1%、气运10约15%；阈值曲线为可调建议：
 *       阈值 = 四舍五入〔100 + 1400 × (L−1) ÷ 9〕，1d10000 骰面 ≤ 阈值即掉落。
 *   - 每份最终成果有唯一 huntAcquisitionId，只结算一次；
 *     看同一结果、开背包、读档不重投；放弃魂环仍保留已掉落魂骨，下一次猎杀按新attempt判定。
 *
 * 掉落只影响是否爆骨，不自动影响魂骨特性强度、部位、十万年传承数量或讨伐胜率。
 */

const { requireInteger } = require('../util');
const { VERSIONS } = require('../versions');
const { hashSeed } = require('../rng');

const SIDES = 10000;
const RULE = 'linear-1d10000-v1';

function isTenThousand(years) {
  return Number.isInteger(years) && years >= 10000 && years <= 99999;
}

/** 超出万年区间（含100000年）一律不投本骰。 */
function rollEligibility(years) {
  if (!Number.isInteger(years)) throw new Error('魂环年限须为整数');
  if (isTenThousand(years)) return { eligible: true, reason: 'ten-thousand-range' };
  if (years === 100000) return { eligible: false, reason: 'hundred-thousand-uses-hunt-source' };
  return { eligible: false, reason: 'not-ten-thousand' };
}

function thresholdForLuck(luck) {
  requireInteger(luck, '有效气运档位', 1, 10);
  return Math.round(100 + (1400 * (luck - 1)) / 9);
}

/** 逐点枚举用的表格：与交接文档10.2表逐行一致。 */
function probabilityTable() {
  const rows = [];
  for (let luck = 1; luck <= 10; luck++) {
    const threshold = thresholdForLuck(luck);
    rows.push({ luck, threshold, range: '1—' + threshold, rate: threshold / SIDES });
  }
  return rows;
}

/**
 * 结算一次掉落。调用点只能是“最终确认获得魂环”的唯一结算点。
 * @param {object} input { acquisitionId, years, luck, rng, at }
 */
function rollBoneDrop(input) {
  const acquisitionId = input.acquisitionId;
  if (typeof acquisitionId !== 'string' || !acquisitionId) throw new Error('魂骨掉落须带唯一 huntAcquisitionId');
  const years = requireInteger(input.years, '魂环年限', 10, 100000);
  const eligibility = rollEligibility(years);
  if (!eligibility.eligible) {
    return Object.freeze({
      version: VERSIONS.boneDropRules,
      rule: RULE,
      acquisitionId,
      years,
      luck: input.luck === undefined ? null : input.luck,
      eligible: false,
      skipped: true,
      reason: eligibility.reason,
      dropped: false,
      face: null,
      threshold: null,
      sides: SIDES
    });
  }
  const luck = requireInteger(input.luck, '有效气运档位', 1, 10);
  if (!input.rng || typeof input.rng.die !== 'function') throw new Error('掉落骰须使用游戏确定性投骰器');
  const threshold = thresholdForLuck(luck);
  const face = input.rng.die(SIDES, '万年魂骨掉落', { acquisitionId, luck, threshold });
  return Object.freeze({
    version: VERSIONS.boneDropRules,
    rule: RULE,
    acquisitionId,
    years,
    luck,
    eligible: true,
    skipped: false,
    sides: SIDES,
    face,
    threshold,
    dropped: face <= threshold,
    rollLabel: '万年魂骨掉落',
    at: input.at === undefined ? null : input.at
  });
}

/**
 * 一次成果一次结算：store 以 acquisitionId 为键。
 * 重复调用返回首次结果并标记 duplicate，不重投、不改写。
 */
function settleBoneDrop(store, input) {
  if (!store || typeof store !== 'object') throw new Error('结算存储无效');
  if (!store.settlements) store.settlements = Object.create(null);
  const existing = store.settlements[input.acquisitionId];
  if (existing) return Object.freeze({ ...existing, duplicate: true });
  const settlement = rollBoneDrop(input);
  store.settlements[input.acquisitionId] = settlement;
  return Object.freeze({ ...settlement, duplicate: false });
}

/** 预览用：只读当前配置，不投骰、不消耗序列。 */
function inspect(input) {
  const eligibility = rollEligibility(input.years);
  const luck = input.luck === undefined ? null : requireInteger(input.luck, '有效气运档位', 1, 10);
  return {
    years: input.years,
    eligible: eligibility.eligible,
    reason: eligibility.reason,
    luck,
    threshold: eligibility.eligible && luck !== null ? thresholdForLuck(luck) : null,
    sides: SIDES,
    rule: RULE,
    pendingReason: eligibility.eligible ? null : eligibility.reason
  };
}

/**
 * 为一次“最终确认获得的魂环”生成唯一成果ID。
 * 同一结果重复调用得到同一ID（只结算一次）；放弃候选后重新猎魂会递增 attempt，
 * 因此新成果不会复用旧ID，但也不会因为重开界面被当成两次成果。
 */
function huntAcquisitionId(input) {
  const ringIndex = requireInteger(input.ringIndex, '魂环位置', 1, 9);
  const years = requireInteger(input.years, '魂环年限', 10, 100000);
  const attempt = requireInteger(input.attempt === undefined ? 1 : input.attempt, '猎魂尝试次数', 1, 999);
  const seed = input.seed === undefined ? '' : String(input.seed);
  const owner = input.characterName === undefined ? '' : String(input.characterName);
  const hash = hashSeed([seed, owner, ringIndex, years, attempt].join('|')).toString(16).padStart(8, '0');
  return 'hunt:' + ringIndex + ':' + years + ':' + attempt + ':' + hash;
}

/**
 * 常规猎魂的唯一掉落结算点：只在“最终确认获得魂环”后调用。
 * ring 必须已经有魂技（即已确认成果），预览/候选/放弃阶段不得调用。
 */
function settleConfirmedHunt(input) {
  const ring = input.ring;
  if (!ring || !Number.isInteger(ring.index) || !Array.isArray(ring.skills) || !ring.skills.length) {
    throw new Error('掉骨骰只能在最终确认获得魂环后结算');
  }
  const acquisitionId = huntAcquisitionId({
    seed: input.seed,
    characterName: input.characterName,
    ringIndex: ring.index,
    years: ring.years,
    attempt: input.attempt
  });
  const settlement = settleBoneDrop(input.store, {
    acquisitionId,
    years: ring.years,
    luck: input.luck,
    rng: input.rng,
    at: input.at
  });
  return { ...settlement, acquisitionId };
}

module.exports = {
  SIDES,
  RULE,
  isTenThousand,
  rollEligibility,
  thresholdForLuck,
  probabilityTable,
  rollBoneDrop,
  settleBoneDrop,
  inspect,
  huntAcquisitionId,
  settleConfirmedHunt
};

},"/modules/src/soulbone/handlers.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 魂骨特性实现处理器登记表。
 *
 * 交接文档第十九节：任意需要的处理器未实现时，必须显式报告该定义不可用于正式讨伐，
 * 不能在界面展示完整特性却实际无效。所以池里每条特性的 handler 必须在这里有实现，
 * 否则该条不进入候选，只在 unavailable 中报告原因。
 *
 * 本文件只提供登记器；v12.04由compose注册trait-effects.js中的20条正式处理器，
 * 额外实现仍可通过拼接层register()注册；仅登记名称不能令未实现的效果生效。
 */

function createHandlerRegistry(initial) {
  const handlers = new Map();
  function register(id, implementation) {
    if (typeof id !== 'string' || !id) throw new Error('处理器ID无效');
    if (typeof implementation !== 'function') throw new Error('处理器实现须为函数：' + id);
    if (handlers.has(id)) throw new Error('处理器重复注册：' + id);
    handlers.set(id, implementation);
    return api;
  }
  function has(id) {
    return handlers.has(id);
  }
  function get(id) {
    const handler = handlers.get(id);
    if (!handler) throw new Error('魂骨特性处理器未实现：' + id);
    return handler;
  }
  function list() {
    return [...handlers.keys()];
  }
  const api = Object.freeze({ register, has, get, list, size: () => handlers.size });
  if (initial) for (const [id, implementation] of Object.entries(initial)) register(id, implementation);
  return api;
}

module.exports = { createHandlerRegistry };

},"/modules/src/soulbone/instance.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 魂骨实例（交接文档第十一节）。
 *
 * 每块魂骨是独立实例，记录身份、来源、基础、数值、特性、骰序与状态。
 * 魂骨属性加持进入“装备来源账本”，不混进训练成长账本；特性绑定魂骨实例，
 * 吸收后由佩戴者执行；玩家武魂改变时不改名、不重抽。
 *
 * 属性预算尚未由用户给出（交接文档第十二节）。因此默认 budget.version === 0，
 * attributes 保持 null，实例进入待处理；本模块不会照抄Boss整张面板，也不会凭空写六维数字。
 */

const { clone, deepFreeze, isPlainObject, requireInteger } = require('../util');
const { VERSIONS, PENDING, assertVersion } = require('../versions');

const SLOTS = Object.freeze(['头部', '躯干', '左臂', '右臂', '左腿', '右腿']);
const STAT_KEYS = Object.freeze(['B', 'S', 'C', 'D', 'A', 'P', 'W']);
const SOURCE_TYPES = Object.freeze(['hunt', 'hunt-ring', 'event-gift', 'ten-thousand-drop', 'legacy']);
const STATUSES = Object.freeze(['pending', 'ready', 'absorbed', 'slot-conflict', 'replaced', 'in-inventory']);

const DEFAULT_ATTRIBUTE_BUDGET = Object.freeze({
  version: VERSIONS.soulboneAttributeBudget,
  note: '万年、十万年属性预算尚未确定；未确定前不写入任何六维数值。',
  values: null
});

function createAttributeBudget(input) {
  if (!isPlainObject(input)) throw new Error('属性预算配置无效');
  requireInteger(input.version, '属性预算版本', 0, 1000);
  if (input.version === 0) {
    if (input.values !== null && input.values !== undefined) throw new Error('属性预算未定版时不得携带数值');
    return Object.freeze({ version: 0, note: input.note || DEFAULT_ATTRIBUTE_BUDGET.note, values: null });
  }
  if (!isPlainObject(input.values)) throw new Error('已定版的属性预算须给出数值表');
  for (const [years, stats] of Object.entries(input.values)) {
    if (!['1000', '10000', '100000'].includes(years)) throw new Error('属性预算年份档无效：' + years);
    if (!isPlainObject(stats)) throw new Error('属性预算 ' + years + ' 年档须为对象');
    for (const [key, value] of Object.entries(stats)) {
      if (!STAT_KEYS.includes(key)) throw new Error('属性预算含未知属性：' + key);
      if (!Number.isFinite(value)) throw new Error('属性预算数值无效：' + key);
    }
  }
  return deepFreeze({ version: input.version, note: input.note || '', values: clone(input.values) });
}

/**
 * 预算未定版 → 返回 null，实例不得显示“已加持”。
 * 预算表按档位存：1000（千年）、10000（万年）、100000（十万年）；具体年限落到所属档。
 */
function resolveAttributes(years, budget) {
  const config = budget || DEFAULT_ATTRIBUTE_BUDGET;
  if (config.version === 0 || !config.values) return { attributes: null, reason: PENDING.ATTRIBUTE_BUDGET_UNSET, budgetVersion: 0 };
  const bandKey = years >= 100000 ? '100000' : years >= 10000 ? '10000' : years >= 1000 ? '1000' : null;
  const table = config.values[String(years)] || (bandKey ? config.values[bandKey] : null);
  if (!table) return { attributes: null, reason: PENDING.ATTRIBUTE_BUDGET_UNSET, budgetVersion: config.version };
  return { attributes: { stats: clone(table), budgetVersion: config.version, appliedTo: 'equipment-source' }, reason: null, budgetVersion: config.version };
}

function rollBoneSlot(input) {
  const pool = input.availableSlots ? input.availableSlots.slice() : SLOTS.slice();
  if (!pool.length) throw new Error('没有可用魂骨部位');
  if (!input.rng) throw new Error('魂骨部位须使用游戏确定性投骰器');
  const face = pool.length === 1 ? 1 : input.rng.die(pool.length, '魂骨部位抽取');
  const slot = pool[face - 1];
  return Object.freeze({ sides: pool.length, face, slot, pool: pool.slice(), label: '魂骨部位抽取', degenerate: pool.length === 1 });
}

/**
 * @param {object} input
 * @param {string} input.boneId 唯一魂骨ID
 * @param {string} input.definitionId 定义／模板ID
 * @param {object} input.source {type, acquisitionId?, beastId?, beastVersion?, obtainedAt?}
 * @param {object} input.base {years, slot, name, affinity}
 * @param {object|null} [input.attributes] 已确定的属性修正；不传则按预算解析
 * @param {Array} [input.traits] 已装配特性
 * @param {object} [input.rolls] 冻结骰序
 */
function createBoneInstance(input) {
  if (!isPlainObject(input)) throw new Error('魂骨实例参数无效');
  const base = input.base || {};
  const years = requireInteger(base.years, '魂骨年限', 1000, 100000);
  if (!SLOTS.includes(base.slot)) throw new Error('魂骨部位无效：' + base.slot);
  const source = input.source || {};
  if (!SOURCE_TYPES.includes(source.type)) throw new Error('魂骨来源类型无效：' + source.type);
  if (source.type !== 'legacy' && source.type !== 'event-gift') {
    if (typeof source.acquisitionId !== 'string' || !source.acquisitionId) throw new Error('魂骨来源缺少成果ID');
  }
  if (typeof input.boneId !== 'string' || !input.boneId) throw new Error('魂骨缺少唯一ID');
  if (typeof input.definitionId !== 'string' || !input.definitionId) throw new Error('魂骨缺少定义ID');

  const resolved = input.attributes === undefined
    ? resolveAttributes(years, input.budget)
    : { attributes: input.attributes === null ? null : clone(input.attributes), reason: input.attributes === null ? PENDING.ATTRIBUTE_BUDGET_UNSET : null, budgetVersion: input.attributes && input.attributes.budgetVersion };

  const traits = (input.traits || []).map((trait) => normalizeTrait(trait, input.boneId));
  const pendingReasons = [];
  if (!resolved.attributes && years >= 10000) pendingReasons.push(PENDING.ATTRIBUTE_BUDGET_UNSET);
  if (!traits.length && years >= 10000) pendingReasons.push(PENDING.EMPTY_TRAIT_POOL);

  const bone = {
    boneId: input.boneId,
    definitionId: input.definitionId,
    rulesVersion: VERSIONS.soulboneInstance,
    source: {
      type: source.type,
      acquisitionId: source.acquisitionId || null,
      beastId: source.beastId || null,
      beastVersion: source.beastVersion === undefined ? null : source.beastVersion,
      obtainedAt: source.obtainedAt === undefined ? null : clone(source.obtainedAt),
      eventId: source.eventId || null
    },
    base: {
      years,
      slot: base.slot,
      name: base.name || ('魂骨·' + base.slot),
      affinity: base.affinity || '通用'
    },
    attributes: resolved.attributes,
    attributeBudgetVersion: resolved.budgetVersion,
    traits,
    rolls: clone(input.rolls || { drop: null, slot: null, assembly: null, inheritance: null }),
    status: pendingReasons.length ? 'pending' : 'ready',
    pendingReasons,
    absorbed: false,
    history: [{ step: 'created', index: 0 }]
  };
  validateBoneInstance(bone);
  return bone;
}

function normalizeTrait(trait, boneId) {
  if (!isPlainObject(trait) || typeof trait.traitId !== 'string' || !trait.traitId) throw new Error('魂骨特性缺少 traitId');
  if (typeof trait.handler !== 'string' || !trait.handler) throw new Error('魂骨特性缺少实现处理器：' + trait.traitId);
  return {
    traitId: trait.traitId,
    name: trait.name || trait.traitId,
    effect: trait.effect || '',
    definitionVersion: trait.definitionVersion === undefined ? null : trait.definitionVersion,
    implementationVersion: trait.implementationVersion || 1,
    handler: trait.handler,
    params: clone(trait.params || {}),
    sourceBoneId: boneId,
    assemblyVersion: trait.assemblyVersion || VERSIONS.soulboneTraitAssembly,
    stackGroup: trait.stackGroup || trait.traitId,
    maxStacks: trait.maxStacks || 1,
    save: clone(trait.save || { schemaVersion: 1, fields: [] }),
    dependsOn: clone(trait.dependsOn || [])
  };
}

function validateBoneInstance(bone) {
  if (!isPlainObject(bone)) throw new Error('魂骨实例无效');
  if (typeof bone.boneId !== 'string' || !bone.boneId) throw new Error('魂骨实例缺少唯一ID');
  assertVersion(bone.rulesVersion, VERSIONS.soulboneInstance, '魂骨实例版本');
  if (!SLOTS.includes(bone.base && bone.base.slot)) throw new Error('魂骨部位无效');
  requireInteger(bone.base.years, '魂骨年限', 1000, 100000);
  if (!SOURCE_TYPES.includes(bone.source && bone.source.type)) throw new Error('魂骨来源类型无效');
  if (!Array.isArray(bone.traits)) throw new Error('魂骨特性须为数组');
  for (const trait of bone.traits) {
    if (!isPlainObject(trait) || typeof trait.traitId !== 'string' || !trait.traitId || typeof trait.handler !== 'string' || !trait.handler) throw new Error('魂骨特性缺少ID或处理器');
    requireInteger(trait.implementationVersion, '魂骨特性实现版本', 1, 1000);
  }
  if (bone.traits.some((trait) => trait.sourceBoneId !== bone.boneId)) throw new Error('特性来源魂骨ID不一致');
  if (bone.attributes !== null) {
    if (!isPlainObject(bone.attributes.stats)) throw new Error('魂骨属性修正无效');
    for (const [key, value] of Object.entries(bone.attributes.stats)) {
      if (!STAT_KEYS.includes(key)) throw new Error('魂骨属性含未知项：' + key);
      if (!Number.isFinite(value)) throw new Error('魂骨属性数值无效：' + key);
    }
    if (!(bone.attributes.budgetVersion >= 1)) throw new Error('魂骨属性缺少已定版预算版本');
  }
  const years = bone.base.years;
  const pendingReasons = bone.pendingReasons || [];
  const traitPending = pendingReasons.includes(PENDING.EMPTY_TRAIT_POOL) || pendingReasons.includes(PENDING.NO_LEGAL_TRAIT);
  if (years >= 10000 && years <= 99999) {
    if (bone.traits.length > 1) throw new Error('每块万年魂骨最多一条装配特性');
    if (bone.traits.length !== 1 && !traitPending) throw new Error('每块万年魂骨恰应有一条有效装配特性');
  }
  if (years === 100000 && bone.traits.length < 1 && !traitPending) {
    throw new Error('十万年魂骨至少继承一条特性');
  }
  if (!STATUSES.includes(bone.status)) throw new Error('魂骨状态无效：' + bone.status);
  if (new Set(bone.traits.map((trait) => trait.traitId)).size !== bone.traits.length) {
    throw new Error('同一块魂骨出现重复特性定义');
  }
  return true;
}

function markStatus(bone, status, note) {
  if (!STATUSES.includes(status)) throw new Error('魂骨状态无效：' + status);
  const next = clone(bone);
  next.status = status;
  next.absorbed = status === 'absorbed';
  next.history = [...(next.history || []), { step: status, note: note || null, index: (next.history || []).length }];
  return next;
}

function isHundredThousand(bone) {
  return bone.base.years === 100000;
}

/** 预览魂骨属性：只读，预算未定时明确返回原因，不显示数字。 */
function previewBoneAttributes(bone) {
  validateBoneInstance(bone);
  if (!bone.attributes) return { stats: null, budgetVersion: 0, reason: PENDING.ATTRIBUTE_BUDGET_UNSET };
  return { stats: clone(bone.attributes.stats), budgetVersion: bone.attributes.budgetVersion, reason: null };
}

/** 导出：只导出实例本身，带格式与版本，便于跨存档/跨模块传递。 */
function exportBone(bone) {
  validateBoneInstance(bone);
  return {
    format: 'witness-soulbone-instance',
    version: VERSIONS.soulboneInstance,
    exportedAt: null,
    bone: clone(bone)
  };
}

/** 导入：格式/版本/结构三层校验，不接受的旧版本显式报错而不是猜字段。 */
function importBone(payload) {
  if (!isPlainObject(payload) || payload.format !== 'witness-soulbone-instance') throw new Error('不是魂骨实例导出格式');
  assertVersion(payload.version, VERSIONS.soulboneInstance, '魂骨实例导出格式版本');
  const bone = clone(payload.bone);
  validateBoneInstance(bone);
  return bone;
}

module.exports = {
  SLOTS,
  STAT_KEYS,
  SOURCE_TYPES,
  STATUSES,
  DEFAULT_ATTRIBUTE_BUDGET,
  createAttributeBudget,
  resolveAttributes,
  rollBoneSlot,
  createBoneInstance,
  validateBoneInstance,
  markStatus,
  isHundredThousand,
  previewBoneAttributes,
  exportBone,
  importBone
};

},"/modules/src/soulbone/migrate.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 旧档迁移（交接文档第二、十七节）。
 *
 * 分清楚来源，不能见到“特性”二字就删：
 *   - 魂性谱随机武魂特性：删除定义、注册、随机生成、结算、储存与显示；
 *     已存旧随机特性的待用收益、层数和触发标记在导入时清理。
 *   - 会长、神秘伤疤女、友方NPC等直接手写的角色特性：保留。
 *   - 新魂骨特性：按魂骨实例保留，不因迁移被误删。
 *   - 过去已经结算进属性的成长：不回扣。
 *   - 旧千年赠骨仍是合法道具；是否补新特性未指定，不自动升级为万年骨。
 *   - 旧“非空魂骨技能”校验升级为按版本、类型和已实现处理器验证，不取消全部校验。
 */

const { clone, isPlainObject } = require('../util');
const { VERSIONS } = require('../versions');

const SOUL_RANDOM_SOURCES = Object.freeze(['魂性谱', 'soul-random', 'soul_random', 'random-soul-trait', 'soulTrait', 'soul-trait']);
const ROLE_SOURCES = Object.freeze(['role', 'character', 'innate', 'guildmaster', 'scarred', '角色固有']);
const NPC_SOURCES = Object.freeze(['npc', 'friendly-npc']);
const BONE_SOURCES = Object.freeze(['soulbone', 'bone', '魂骨']);

function classifyTraitSource(trait) {
  if (!isPlainObject(trait)) return 'unknown';
  const source = typeof trait.source === 'string' ? trait.source : '';
  if (SOUL_RANDOM_SOURCES.includes(source)) return 'soul-random';
  if (ROLE_SOURCES.includes(source)) return 'role';
  if (NPC_SOURCES.includes(source) || (typeof trait.npcId === 'string' && trait.npcId)) return 'npc';
  if (BONE_SOURCES.includes(source) || (typeof trait.sourceBoneId === 'string' && trait.sourceBoneId)) return 'soulbone';
  if (typeof trait.sourceBoneId === 'string' && trait.sourceBoneId) return 'soulbone';
  if (typeof trait.definitionId === 'string' && /^(soul-trait[-:]|trait:)/.test(trait.definitionId)) return 'soul-random';
  if (trait.bindsSoulId === true && !source) return 'soul-random';
  return 'unknown';
}

function scrubTraitList(list, label, report) {
  const kept = [];
  for (const trait of list) {
    const kind = classifyTraitSource(trait);
    if (kind === 'soul-random') {
      report.removed.push({ where: label, kind, trait: clone(trait) });
    } else {
      kept.push(trait);
      if (kind === 'unknown') report.needsReview.push({ where: label, trait: clone(trait) });
      else report.kept.push({ where: label, kind });
    }
  }
  return kept;
}

/**
 * 清理角色身上的旧随机武魂特性及其待用收益／层数／触发标记。
 * 只改特性相关容器；growth、stats、rings、bones、mutations 原样保留。
 */
function migrateCharacter(character) {
  if (!isPlainObject(character)) throw new Error('角色存档无效');
  const next = clone(character);
  const report = { version: VERSIONS.legacyMigration, removed: [], kept: [], needsReview: [], containers: [] };
  for (const key of ['soulTrait', 'passive']) {
    if (classifyTraitSource(next[key]) !== 'soul-random') continue;
    report.removed.push({ where: key, kind: 'soul-random', trait: clone(next[key]) });
    delete next[key];
    if (key === 'passive') delete next.passiveState;
  }

  for (const key of ['traits', 'passiveTraits', 'traitStates']) {
    if (!Array.isArray(next[key])) continue;
    report.containers.push(key);
    next[key] = scrubTraitList(next[key], key, report);
  }

  // 旧随机特性的待用收益/层数/触发标记。只清这些标记，不动已结算成长。
  for (const key of ['traitPending', 'traitStacks', 'traitStackTime', 'pendingTraitBenefits']) {
    if (next[key] === undefined) continue;
    report.removed.push({ where: key, kind: 'soul-random-marker', trait: clone(next[key]) });
    delete next[key];
  }

  report.growthUntouched = clone(character.growth || null);
  report.statsUntouched = clone(character.stats || null);
  return { character: next, report };
}

/** 清理旧战斗快照里残留的随机武魂特性待用状态；角色固有/NPC特性保留。 */
function migrateBattleSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error('战斗快照无效');
  const next = clone(snapshot);
  const report = { removed: [], kept: [] };
  for (const unit of next.units || []) {
    const passive = unit.passive;
    if (!passive) continue;
    const kind = classifyTraitSource(passive);
    if (kind === 'soul-random') {
      report.removed.push({ unitId: unit.id, definitionId: passive.definitionId || null });
      unit.passive = null;
      delete unit.passiveState;
    } else {
      report.kept.push({ unitId: unit.id, kind });
    }
  }
  return { snapshot: next, report };
}

/** 旧成长绑定实际在state.soulTrait，战斗绑定在units[].passive；处理整份存档。 */
function migrateSave(save) {
  if (!isPlainObject(save)) throw new Error('存档无效');
  const next = clone(save);
  const removed = [];
  function walk(value, path) {
    if (!value || typeof value !== 'object') return;
    for (const key of ['soulTrait', 'passive']) {
      if (classifyTraitSource(value[key]) !== 'soul-random') continue;
      removed.push({ where: path + '.' + key, definitionId: value[key].definitionId });
      delete value[key];
      if (key === 'passive') delete value.passiveState;
    }
    for (const [key, child] of Object.entries(value)) walk(child, path + '.' + key);
  }
  walk(next, 'save');
  return { save: next, report: { version: VERSIONS.legacyMigration, removed } };
}

/**
 * 旧存档的魂骨技能校验：不再“非空就整包拒绝”，而是逐条要求
 * 生成版本、类型与已实现处理器；缺一项就显式报错，交由迁移处理。
 */
function validateLegacyBoneSkills(bone, options = {}) {
  const implemented = new Set(options.implementedHandlers || []);
  if (!isPlainObject(bone)) throw new Error('魂骨数据无效');
  if (bone.skills === undefined || bone.skills === null) return true;
  if (!Array.isArray(bone.skills)) throw new Error('魂骨技能须为数组');
  if (!bone.skills.length) return true;
  bone.skills.forEach((skill, index) => {
    if (!isPlainObject(skill)) throw new Error('魂骨技能第' + (index + 1) + '项无效');
    if (!Number.isInteger(skill.generationVersion) || skill.generationVersion < 1) {
      throw new Error('魂骨技能第' + (index + 1) + '项缺少生成版本，不能进入正式流程');
    }
    if (typeof skill.type !== 'string' || !skill.type) throw new Error('魂骨技能第' + (index + 1) + '项缺少类型');
    if (typeof skill.handler !== 'string' || !implemented.has(skill.handler)) {
      throw new Error('魂骨技能第' + (index + 1) + '项的处理器未实现：' + skill.handler);
    }
  });
  return true;
}

/**
 * 旧E02“魂骨与武魂的共鸣”迁移：
 *   - 已经结算的旧事件保留应得成果，并标记防止重发；
 *   - 新流程不再要求为吸骨单开一次培养事件。
 */
function migrateLegacyBoneEvent(pending) {
  if (!isPlainObject(pending)) return { pending, report: { changed: false } };
  if (pending.eventId !== 'E02' && pending.eventId !== 2) return { pending: clone(pending), report: { changed: false } };
  const next = clone(pending);
  next.legacyBoneEvent = true;
  next.absorptionMovedToSafeNode = true;
  if (next.settled === true || next.reward !== undefined || next.rewards !== undefined) {
    next.rewardsAlreadyGranted = true;
    next.duplicateRewardPrevented = true;
  }
  return { pending: next, report: { changed: true, rewardsAlreadyGranted: next.rewardsAlreadyGranted === true } };
}

module.exports = {
  SOUL_RANDOM_SOURCES,
  classifyTraitSource,
  migrateCharacter,
  migrateSave,
  migrateBattleSnapshot,
  validateLegacyBoneSkills,
  migrateLegacyBoneEvent
};

},"/modules/src/soulbone/ten-thousand.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 万年魂骨的一次性装配入口（交接文档第十二节）。
 *
 * 把“部位骰 → 实例 → 属性预算 → 特性池筛选/抽取”接成一次调用，
 * 这是底层纯构造器；正式结算必须通过文件下方 settleTenThousandBone 持久化去重。
 * 每次构造的万年骨：
 *   - 属性能加就加；预算未定版则保持 null 并进入待处理；
 *   - 特性只抽一条并绑定该骨实例；
 *   - 池空、处理器缺失或无合法项时保留实例与待处理原因，不显示“特性已生效”。
 */

const { clone, requireInteger } = require('../util');
const { PENDING } = require('../versions');
const { SLOTS, rollBoneSlot, resolveAttributes, createBoneInstance, validateBoneInstance } = require('./instance');

function createTenThousandBone(input) {
  if (!input || !input.pool) throw new Error('万年魂骨装配缺少魂骨特性池');
  if (!input.rng || typeof input.rng.die !== 'function') throw new Error('万年魂骨装配须使用游戏确定性投骰器');
  const years = requireInteger(input.years, '万年魂骨年限', 10000, 99999);
  if (typeof input.boneId !== 'string' || !input.boneId) throw new Error('万年魂骨缺少唯一ID');
  if (typeof input.acquisitionId !== 'string' || !input.acquisitionId) throw new Error('万年魂骨缺少猎魂成果ID');

  const slotRoll = input.slot ? null : rollBoneSlot({ rng: input.rng, availableSlots: input.availableSlots });
  const slot = input.slot || slotRoll.slot;
  if (!SLOTS.includes(slot)) throw new Error('魂骨部位无效：' + slot);

  const assembly = input.pool.assemble({
    boneId: input.boneId,
    years,
    slot,
    rng: input.rng,
    excludeDefinitionIds: input.excludeDefinitionIds,
    stackCounts: input.stackCounts
  });
  const resolved = resolveAttributes(years, input.budget);

  const bone = createBoneInstance({
    boneId: input.boneId,
    definitionId: input.definitionId || 'ten-thousand:' + years,
    source: {
      type: 'ten-thousand-drop',
      acquisitionId: input.acquisitionId,
      beastId: input.beastId || null,
      beastVersion: input.beastVersion === undefined ? null : input.beastVersion,
      obtainedAt: input.obtainedAt
    },
    base: {
      years,
      slot,
      name: input.name || (input.affinity ? input.affinity + '万年' + slot + '骨' : '万年' + slot + '骨'),
      affinity: input.affinity || '通用'
    },
    attributes: resolved.attributes,
    traits: assembly.trait ? [assembly.trait] : [],
    rolls: { drop: input.drop || null, slot: slotRoll, assembly: assembly.roll, inheritance: null }
  });

  if (assembly.status !== 'assembled') {
    if (!bone.pendingReasons.includes(assembly.reason)) bone.pendingReasons.push(assembly.reason);
    bone.status = 'pending';
  }
  bone.assembly = {
    status: assembly.status,
    reason: assembly.reason,
    candidates: assembly.candidates,
    unavailable: clone(assembly.unavailable || [])
  };
  return bone;
}

/** 玩家可见的魂骨特性只有名称和效果，不暴露目录分类、内部来源或随机过程。 */
function displayBoneTrait(bone) {
  return (bone && bone.traits || []).map(({ name, effect }) => ({ name, effect }));
}

/** 成果结算入口：store 必须与角色一同存档，读档与重复回调不重抽部位/特性。 */
function settleTenThousandBone(store, input) {
  if (!store || typeof store !== 'object') throw new Error('万年骨装配缺少持久化账本');
  if (!input || typeof input.acquisitionId !== 'string' || !input.acquisitionId) throw new Error('万年骨装配缺少成果ID');
  if (!store.boneAssemblies) store.boneAssemblies = Object.create(null);
  const existing = Object.prototype.hasOwnProperty.call(store.boneAssemblies, input.acquisitionId) ? store.boneAssemblies[input.acquisitionId] : null;
  if (existing) {
    if (existing.boneId !== input.boneId || existing.base.years !== input.years) throw new Error('同一成果对应的魂骨身份不一致');
    validateBoneInstance(existing);
    return { bone: clone(existing), duplicate: true };
  }
  const bone = createTenThousandBone(input);
  store.boneAssemblies[input.acquisitionId] = clone(bone);
  return { bone: clone(bone), duplicate: false };
}

/** 补齐空池/预算待定的旧成果；已经抽出的特性、部位和属性绝不重抽。 */
function completePendingTenThousandBone(store, input) {
  const old = store && store.boneAssemblies && store.boneAssemblies[input.acquisitionId];
  if (!old) throw new Error('找不到待补齐的万年魂骨成果');
  validateBoneInstance(old);
  const next = clone(old);
  if (next.attributes === null) {
    const resolved = resolveAttributes(next.base.years, input.budget);
    if (resolved.attributes) {
      next.attributes = resolved.attributes;
      next.attributeBudgetVersion = resolved.budgetVersion;
      next.pendingReasons = next.pendingReasons.filter((reason) => reason !== PENDING.ATTRIBUTE_BUDGET_UNSET);
    }
  }
  if (!next.traits.length) {
    const assembly = input.pool.assemble({ ...input, boneId: next.boneId, years: next.base.years, slot: next.base.slot });
    if (assembly.trait) {
      const typed = createBoneInstance({ boneId: next.boneId, definitionId: next.definitionId, source: next.source, base: next.base, attributes: next.attributes, traits: [assembly.trait] });
      next.traits = typed.traits;
      next.rolls.assembly = assembly.roll;
      next.pendingReasons = next.pendingReasons.filter((reason) => ![PENDING.EMPTY_TRAIT_POOL, PENDING.NO_LEGAL_TRAIT].includes(reason));
    }
    next.assembly = { status: assembly.status, reason: assembly.reason, candidates: assembly.candidates, unavailable: clone(assembly.unavailable || []) };
  }
  if (!next.pendingReasons.length) next.status = next.absorbed ? 'absorbed' : 'ready';
  validateBoneInstance(next);
  store.boneAssemblies[input.acquisitionId] = clone(next);
  return { bone: next };
}

module.exports = { createTenThousandBone, settleTenThousandBone, completePendingTenThousandBone, displayBoneTrait };

},"/modules/src/soulbone/trait-effects.js":function(require,module,exports,__dirname){
'use strict';
const handlers={
 'tt-essence':(e,p)=>e.type==='maxMP'?p.maxMP:0,
 'tt-dragon':(e,p)=>e.type==='phasePower'&&e.lowHP?p.phasePower:0,
 'tt-thorn':(e,p)=>e.type==='stackDamage'?p.stackDamage*Math.min(p.stackCap,e.stacks||0):0,
 'tt-rune':(e,p)=>e.type==='skillDamage'?p.skillDamage:0,
 'tt-erosion':(e,p)=>e.type==='debuffAmp'?p.debuffAmp:0,
 'tt-frost':(e,p)=>e.type==='enemyAgilityStack'?p.enemyAgilityStack:0,
 'tt-shadow':(e,p)=>e.type==='enemyGauge'?p.enemyGauge:e.type==='enemyAccuracy'?p.enemyAccuracy:0,
 'tt-gap':(e,p)=>e.type==='shieldPierce'?p.shieldPierce:0,
 'tt-lamp':(e,p)=>e.type==='benefitDown'?p.benefitDown:0,
 'tt-shell':(e,p)=>e.type==='openingShield'?p.openingShield:0,
 'tt-ghost':(e,p)=>e.type==='manaGuard'?p.manaGuard:0,
 'tt-reserve':(e,p)=>e.type==='lifeReserve'?p.lifeReserve:0,
 'tt-spring':(e,p)=>e.type==='regen'?p.regen:0,
 'tt-armor':(e,p)=>e.type==='armorPierce'?p.armorPierce:0,
 'tt-sacrifice':(e,p)=>e.type==='extraCost'?p.extraCost:e.type==='wardPierce'?p.wardPierce:0,
 'tt-clarity':(e,p)=>e.type==='controlShorten'?p.controlShorten:0,
 'tt-iceward':(e,p)=>e.type==='iceResist'?p.iceResist:0,
 'tt-sight':(e,p)=>e.type==='hitAssist'?Math.min(p.hitBonusCap,Math.max(0,p.hitFloor-e.chance)):0,
 'tt-flow':(e,p)=>e.type==='mpRegen'?p.mpRegen:e.type==='costDiscount'?p.costDiscount:0,
 'tt-field':(e,p)=>e.type==='allyAgility'?p.allyAgility:e.type==='enemyAgility'?p.enemyAgility:e.type==='enemyAction'?p.enemyAction:0
};
const fs=require('node:fs'),path=require('node:path');
const definitions=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../data/soulbone/trait-pool.json'),'utf8')).traits;
const latest=new Map(definitions.map(t=>[t.id,t]));
const inheritedUpdates=new Map(JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../data/beast/library.json'),'utf8')).beasts.flatMap(b=>b.traits).filter(t=>['sky-full-of-miasma','blaze-armor-break'].includes(t.id)).map(t=>[t.id,t]));
function upgrade(trait){const revised=inheritedUpdates.get(trait?.traitId||trait?.id);if(revised)return {...trait,name:revised.name,effect:revised.effect,params:{...revised.inherit.params},inheritanceRulesVersion:120501};const d=latest.get(trait?.traitId||trait?.id);if(!d||!(trait.implementationVersion<2))return trait;return {...trait,name:d.name,effect:d.effect,params:{...d.params},implementationVersion:2,definitionVersion:3};}
function value(traits,type,context={}){let out=0;const seen=new Set();for(const raw of traits||[]){const t=upgrade(raw),id=t.handler;if(seen.has(id)||!handlers[id])continue;seen.add(id);out+=handlers[id]({...context,type},t.params||{});}return out;}
module.exports={handlers,value,upgrade};

},"/modules/src/soulbone/trait-pool.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 魂骨特性池与装配（交接文档第十二节）。
 *
 * 规则：
 *   - 每条定义带稳定ID、显示名称、效果说明、可用年限、允许部位、实现处理器、
 *     参数、触发与退出条件、叠加规则、存档结构、依赖机制；
 *   - 先筛选年限、部位和实现条件，再按池权重抽取；没有权重时等权；
 *   - 只抽一次并保存，不随面板刷新重组；
 *   - 重名不能作为重复的唯一判断，检查定义ID与叠加组；
 *   - 抽到不允许重复的特性时，从剩余合法集合无放回重选；无合法项返回待处理，
 *     不无限重抽，也不偷偷改成现金、经验或另一块骨。
 */

const fs = require('node:fs');
const path = require('node:path');
const { clone, deepFreeze, isPlainObject, requireInteger } = require('../util');
const { VERSIONS, PENDING } = require('../versions');
const { drawWeightedFace } = require('../rng');

const DATA_PATH = path.resolve(__dirname, '..', '..', 'data', 'soulbone', 'trait-pool.json');
const SLOTS = Object.freeze(['头部', '躯干', '左臂', '右臂', '左腿', '右腿']);

function emptyPool() {
  return { schemaVersion: 1, poolVersion: VERSIONS.soulboneTraitPool, note: '空池：等待用户编写魂骨特性。', traits: [] };
}

function loadPool(dataPath) {
  const target = dataPath || DATA_PATH;
  if (!fs.existsSync(target)) return emptyPool();
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function validateTraitDefinition(trait) {
  if (!isPlainObject(trait)) throw new Error('特性定义须为对象');
  if (typeof trait.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(trait.id)) throw new Error('特性稳定ID无效：' + trait.id);
  if (typeof trait.name !== 'string' || !trait.name) throw new Error(trait.id + ' 缺少显示名称');
  if (typeof trait.effect !== 'string' || !trait.effect) throw new Error(trait.id + ' 缺少效果说明');
  if (!Array.isArray(trait.years) || trait.years.length !== 2) throw new Error(trait.id + ' 缺少可用年限区间');
  requireInteger(trait.years[0], trait.id + ' 年限下限', 1000, 100000);
  requireInteger(trait.years[1], trait.id + ' 年限上限', trait.years[0], 100000);
  if (!Array.isArray(trait.slots) || !trait.slots.length) throw new Error(trait.id + ' 缺少允许部位');
  if (trait.slots.some((slot) => !SLOTS.includes(slot))) throw new Error(trait.id + ' 含未知部位');
  if (typeof trait.handler !== 'string' || !trait.handler) throw new Error(trait.id + ' 缺少实现处理器');
  if (trait.weight !== undefined) requireInteger(trait.weight, trait.id + ' 池权重', 1, 1000000);
  if (trait.stackGroup !== undefined && (typeof trait.stackGroup !== 'string' || !trait.stackGroup)) throw new Error(trait.id + ' 叠加组无效');
  if (trait.maxStacks !== undefined) requireInteger(trait.maxStacks, trait.id + ' 叠加上限', 1, 99);
  if (trait.implementationVersion !== undefined) requireInteger(trait.implementationVersion, trait.id + ' 实现版本', 1, 1000);
  if(trait.rRanges!==undefined){
    if(!Array.isArray(trait.rRanges)||!trait.rRanges.length)throw new Error(trait.id+' R目录须非空');
    const faces=new Set();for(const r of trait.rRanges){requireInteger(r.min,'R下限',1,100);requireInteger(r.max,'R上限',r.min,100);if(typeof r.category!=='string'||!/^[A-G][1-5]$/.test(r.category))throw new Error(trait.id+' R分类无效');for(let i=r.min;i<=r.max;i++){if(faces.has(i))throw new Error(trait.id+' R出目重复');faces.add(i);}}
    if(trait.weight!==faces.size)throw new Error(trait.id+' 权重与R出目数不一致');
  }
  if (trait.params !== undefined && !isPlainObject(trait.params)) throw new Error(trait.id + ' 参数须为对象');
  return true;
}

function createTraitPool(options = {}) {
  const raw = options.data || loadPool(options.dataPath);
  if (!raw || raw.schemaVersion !== 1) throw new Error('魂骨特性池版本不支持');
  if (!Array.isArray(raw.traits)) throw new Error('魂骨特性池 traits 须为数组');
  const registry = options.registry;
  if (!registry || typeof registry.has !== 'function') throw new Error('特性池须绑定已实现的处理器登记表');

  const errors = [];
  const traits = new Map();
  for (const trait of raw.traits) {
    try {
      validateTraitDefinition(trait);
      if (traits.has(trait.id)) throw new Error('特性ID重复：' + trait.id);
      traits.set(trait.id, deepFreeze(clone(trait)));
    } catch (error) {
      errors.push(error.message);
    }
  }

  function candidates(input) {
    const years = requireInteger(input.years, '魂骨年限', 1000, 100000);
    if (!SLOTS.includes(input.slot)) throw new Error('魂骨部位无效：' + input.slot);
    const excludeIds = new Set(input.excludeDefinitionIds || []);
    const stackCounts = input.stackCounts || {};
    const unavailable = [];
    const legal = [];
    for (const trait of traits.values()) {
      if (years < trait.years[0] || years > trait.years[1]) {
        unavailable.push({ id: trait.id, reason: 'years-not-eligible' });
        continue;
      }
      if (!trait.slots.includes(input.slot)) {
        unavailable.push({ id: trait.id, reason: 'slot-not-allowed' });
        continue;
      }
      if (!registry.has(trait.handler)) {
        unavailable.push({ id: trait.id, reason: 'handler-missing' });
        continue;
      }
      if (excludeIds.has(trait.id)) {
        unavailable.push({ id: trait.id, reason: 'already-equipped' });
        continue;
      }
      const group = trait.stackGroup || trait.id;
      const maxStacks = trait.maxStacks || 1;
      if ((stackCounts[group] || 0) >= maxStacks) {
        unavailable.push({ id: trait.id, reason: 'stack-limit' });
        continue;
      }
      legal.push(trait);
    }
    return { legal, unavailable };
  }

  /**
   * 装配一条特性到魂骨实例。只抽一次并返回冻结结果，不修改池。
   * @param {object} input { boneId, years, slot, rng, excludeDefinitionIds, stackCounts }
   */
  function assemble(input) {
    if (typeof input.boneId !== 'string' || !input.boneId) throw new Error('装配须绑定魂骨实例ID');
    if (!input.rng || typeof input.rng.die !== 'function') throw new Error('特性装配须使用游戏确定性投骰器');
    const { legal, unavailable } = candidates(input);
    if (!traits.size) {
      return { status: 'pending', reason: PENDING.EMPTY_TRAIT_POOL, trait: null, candidates: 0, unavailable, roll: null };
    }
    if (!legal.length) {
      return { status: 'pending', reason: PENDING.NO_LEGAL_TRAIT, trait: null, candidates: 0, unavailable, roll: null };
    }
    const mapped=legal.every(t=>Array.isArray(t.rRanges)&&t.rRanges.length);
    let chosen,face,total,sourceFace=null,category=null;
    if(mapped){
      const tickets=legal.flatMap(t=>t.rRanges.flatMap(r=>Array.from({length:r.max-r.min+1},(_,i)=>({trait:t,sourceFace:r.min+i,category:r.category})))).sort((a,b)=>a.sourceFace-b.sourceFace);
      if(new Set(tickets.map(t=>t.sourceFace)).size!==tickets.length)throw new Error('特性池中R出目存在跨定义重复');
      total=tickets.length;face=total===1?1:drawWeightedFace(input.rng,total,'魂骨特性1d100分类',{boneId:input.boneId});
      const ticket=tickets[face-1];chosen=ticket.trait;sourceFace=ticket.sourceFace;category=ticket.category;
    }else{
      const weights=legal.map(t=>t.weight||1);total=weights.reduce((a,b)=>a+b,0);face=legal.length===1?total:drawWeightedFace(input.rng,total,'魂骨特性装配',{boneId:input.boneId});
      let cursor=face,index=0;for(;index<legal.length;index++){cursor-=weights[index];if(cursor<=0)break;}chosen=legal[index];
    }
    const assembled = {
      traitId: chosen.id,
      name: chosen.name,
      effect: chosen.effect,
      definitionVersion: raw.poolVersion,
      implementationVersion: chosen.implementationVersion || 1,
      handler: chosen.handler,
      params: clone(chosen.params || {}),
      sourceBoneId: input.boneId,
      assemblyVersion: VERSIONS.soulboneTraitAssembly,
      stackGroup: chosen.stackGroup || chosen.id,
      maxStacks: chosen.maxStacks || 1,
      save: clone(chosen.save || { schemaVersion: 1, fields: [] }),
      dependsOn: clone(chosen.dependsOn || [])
    };
    return Object.freeze({
      status: 'assembled',
      reason: null,
      trait: deepFreeze(assembled),
      candidates: legal.length,
      unavailable,
      roll: { sides: total, face, label: '魂骨特性装配', weighted: true, sourceFace, category, conditional: mapped && total!==100, degenerate: legal.length === 1 }
    });
  }

  function status() {
    return {
      empty: traits.size === 0,
      count: traits.size,
      pendingReason: traits.size === 0 ? PENDING.EMPTY_TRAIT_POOL : null,
      definitionErrors: errors,
      poolVersion: raw.poolVersion,
      handlers: registry.list()
    };
  }

  return Object.freeze({ assemble, candidates, status, list: () => [...traits.values()].map((trait) => clone(trait)), SLOTS });
}

module.exports = { createTraitPool, validateTraitDefinition, emptyPool, SLOTS, DATA_PATH };

},"/modules/src/splice/compose.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 拼接入口：把所有独立模块装成一个可直接调用的 API。
 *
 * 本文件不会修改主游戏、不会写主游戏存档、不会注册任何全局变量。
 * 主游戏接入方式见《拼接说明.md》：在现有 compose 一次性装配处创建本组合，
 * 把活着的 WitnessRules / 战斗引擎作为注入项传入即可。
 */

const { VERSIONS } = require('../versions');
const { createRng, RollLog, DiceEngine } = require('../rng');
const { createRoster } = require('../npc/roster');
const npcCombat = require('../npc/combat');
const huntConditions = require('../hunt/conditions');
const huntAllies = require('../hunt/allies');
const huntLedger = require('../hunt/ledger');
const huntBattle = require('../hunt/battle');
const huntTexts = require('../hunt/texts');
const huntFlow = require('../hunt/flow');
const { createHuntController } = require('../hunt/controller');
const { createBeastLibrary } = require('../beast/library');
const boneDrop = require('../soulbone/drop');
const { createTraitPool } = require('../soulbone/trait-pool');
const { createHandlerRegistry } = require('../soulbone/handlers');
const soulboneInstance = require('../soulbone/instance');
const soulboneAbsorption = require('../soulbone/absorption');
const soulboneMigrate = require('../soulbone/migrate');
const soulboneTenThousand = require('../soulbone/ten-thousand');
const inheritance = require('../reward/inheritance');
const rewardTransaction = require('../reward/transaction');
const { createHuntRewardRunner } = require('../reward/runner');
const battleHooks = require('../battle/hooks');
const battleEquipment = require('../battle/equipment');
const bridge = require('../bridge/v1101');
const skillAttributes = require('../battle/skill-attributes');

function createModules(options = {}) {
  const activeBridge = options.rules ? {
    rules: () => options.rules,
    baseline: () => ({ injected: true, rulesVersion: options.rules.calculationVersion, ratingRulesVersion: options.rules.ratingRulesVersion }),
    ...Object.fromEntries(['rating', 'derive', 'makeSkill', 'pickCategory', 'controlEffect', 'benchmark', 'band'].map((key) => [key, (...args) => {
      if (typeof options.rules[key] !== 'function') throw new Error('注入的战斗规则缺少 ' + key);
      const result = options.rules[key](...args);
      return key === 'makeSkill' ? skillAttributes.tagSkill(result, args[0].soul) : result;
    }]))
  } : bridge;
  const roster = options.roster || createRoster(options.rosterDir ? { dir: options.rosterDir } : undefined);
  const ratingFn = options.ratingFn || activeBridge.rating;
  const library = options.library || createBeastLibrary(options.libraryPath ? { dataPath: options.libraryPath } : undefined);
  const beastHandlers=Object.fromEntries(library.available().flatMap(b=>b.traits.map(t=>[t.inherit.handler,event=>{if(!event?.battle||!['effective','tryControl','applyDamage','onActionComplete'].includes(event.method)||typeof event.battle[event.method]!=='function')throw Error('继承特性须由已接入的战斗宿主分发');return event.battle[event.method](...(event.args||[]));}])));
  const registry = options.registry || createHandlerRegistry({ ...beastHandlers, ...require('../soulbone/trait-effects').handlers, ...(options.handlers || {}) });
  const traitPool = options.traitPool || createTraitPool({ dataPath: options.poolPath, registry });
  const controller = createHuntController({ roster, ratingFn, library, config: options.config });

  function makeRewardRunner(store) {
    return createHuntRewardRunner({ library, store });
  }

  function status() {
    return {
      versions: { ...VERSIONS },
      baseline: activeBridge.baseline(),
      roster: roster.summary(),
      library: library.status(),
      traitPool: traitPool.status(),
      npcCombat: {
        hostIntegrated: false,
        operationTypes: npcCombat.coverage().length,
        primitives: npcCombat.PRIMITIVES.length,
        readiness: ['chengliang', 'xutaiping', 'sailiya_fengzhi'].map((id) => ({ id, ...npcCombat.assertCombatReady(roster.combatSpec(id)) }))
      },
      emptyStates: { beastLibrary: library.status().empty, traitPool: traitPool.status().empty }
    };
  }

  return Object.freeze({
    versions: VERSIONS,
    rng: { createRng, RollLog, DiceEngine },
    roster,
    hunt: { conditions: huntConditions, allies: huntAllies, ledger: huntLedger, battle: huntBattle, texts: huntTexts, flow: huntFlow, controller },
    npc: npcCombat,
    beast: { library },
    soulbone: { registry, effects: require('../soulbone/trait-effects'), drop: boneDrop, instance: soulboneInstance, tenThousand: soulboneTenThousand, traitPool, absorption: soulboneAbsorption, migrate: soulboneMigrate },
    reward: { ring: require('../reward/ring'), inheritance, transaction: rewardTransaction, createRunner: makeRewardRunner },
    battle: { hooks: battleHooks, equipment: battleEquipment, skillAttributes },
    bridge: activeBridge,
    status
  });
}

module.exports = { createModules };

},"/modules/src/text/hunt-texts.generated.js":function(require,module,exports,__dirname){
'use strict';

// 本文件由 tools/extract-texts.cjs 从《v12_重大更新交接文档.md》自动生成，请勿手改。
// 文本逐字来自交接文档，包含全角空格、引号与标点；校验见 tools/check-text.cjs。
const TEXTS = {
  "source": {
    "file": "v12_重大更新交接文档.md",
    "sha256": "163c3d373713a06274376de3651ef9b9b9721e9935bf809d1185705a5966070f",
    "docDate": "2026-10-17",
    "note": "由 tools/extract-texts.cjs 机械提取，禁止手改；校验见 tools/check-text.cjs。"
  },
  "textsVersion": 1,
  "eventId": "hunt_hundred_thousand",
  "title": "讨伐之战。",
  "invitation": {
    "paragraphs": [
      "讨伐之战。",
      "　　通过特殊的渠道，你的实力得到了认可，一系列的委托砸也似得传到你的耳中，可最引人瞩目的仍旧是一封委托——",
      "　　邀你共讨十万年魂兽的委托。这无疑令你心跳加速，但这需要你斟酌："
    ],
    "options": [
      "接受",
      "拒绝"
    ]
  },
  "refusal": [
    "　　你摇摇头，认为十万年并非是你能挑战的目标，一口回绝。"
  ],
  "accepted": [
    "　　你选择应允，时岁推移，终于到了约定的那天。"
  ],
  "noNpc": [
    "　　你承过了委托人的情报，独自前往猎杀魂兽的道路。"
  ],
  "arrivals": {
    "chengliang": [
      "　　你立于聚落前沿，踱步等待。兀然，空间似乎扭曲变形，翻转腾挪，转即，一名身着宽大衣袍，脚步随意的男子步入。他双手自然斜插入兜中，纯黑的衣袍凸显其皮肤的白皙，气度平凡，气息内敛，浑然看不出魂斗罗的派头。他向你颔首，在眨眼间跃然越过你的感知，随后像是安抚你的疑虑般，流露过如渊的魂力如磅礴近乎实质的气血，转瞬归入平常。他随后轻笑——",
      "　　“秘巫塔——程良”"
    ],
    "xutaiping": [
      "　　你立于聚落前沿，踱步等待。漆黑如墨的黑暗攀附上了天空，浓稠似胶的魂力滞于空气，你转头回望，仿佛连呼吸都因此阻塞，一抹昏黄的灯忽明忽灭，流动的黄黑擒于少女的手中，那是个绝美的少女，似向画中落入凡尘的美人，她一步步走来，惊呼道：“不好意思！”鲛人般的鳞片自其脖颈退散，连带这彻天动地的黑暗也纳入她的身躯，一抹灯光转瞬即逝，她伸出带着黑色胶皮手套的右手，轻轻向你伸来：",
      "　　“徐太平，请多指教了！”"
    ],
    "sailiya_fengzhi": [
      "　　你立于聚落前沿，踱步等待。轻盈的风传来讯息，比起更快的是似海般磅礴的魂力，背负双剑的女子自前沿的树木下盈盈落地，仿佛被拖举般自如，她右手缠绕绷带，白色齐肩短发夹带黛色挑染，她轻轻吹拂起落于目前的碎发，随风般流走环绕：",
      "　　“天枢宗——赛利亚”"
    ]
  },
  "advance": "前进"
};

(function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
})(TEXTS);

module.exports = TEXTS;

},"/modules/src/util.js":function(require,module,exports,__dirname){
'use strict';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requireInteger(value, label, min, max) {
  if (!Number.isInteger(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) {
    throw new Error((label || '数值') + '须为' + (min === undefined ? '整数' : min + '—' + max + '的整数') + '，实际 ' + value);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.length) throw new Error((label || '字段') + '须为非空字符串');
  return value;
}

function uniqueIds(list, label) {
  const ids = list.map((x) => (typeof x === 'string' ? x : x && x.id));
  if (new Set(ids).size !== ids.length) throw new Error((label || '名录') + '存在重复ID：' + ids.join(','));
  return ids;
}

const RATING_ORDER = Object.freeze(['纸级', '并级', '强级', '凶级', '狂级', '神级']);
const RATING_MIN_FOR_HUNT = '强级';

module.exports = { clone, deepFreeze, isPlainObject, requireInteger, requireString, uniqueIds, RATING_ORDER, RATING_MIN_FOR_HUNT };

},"/modules/src/versions.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 独立模块包的版本登记。
 *
 * 交接文档第十八节要求“所有池和定义带版本号；实例保存来源定义与必要的参数快照”。
 * 这里把每个封装的规则版本集中登记，实例/存档只引用这里的数字，避免散落魔法值。
 * 注意：这不是游戏版本号，本模块包不产出任何 v12 游戏构建。
 */
const VERSIONS = Object.freeze({
  modulePackage: 'split-2-beasts.1',
  skillAttributes: 1,
  // 讨伐事件控制器
  huntController: 1,
  huntTexts: 1,
  allyRules: 2,
  huntLedger: 1,
  huntBattle: 1,
  // 名录与战斗适配
  npcRoster: 1,
  npcArrivalTexts: 1,
  npcCombatAdapter: 1,
  // 十万年魂兽库
  beastLibrarySchema: 1,
  beastSelection: 1,
  // 魂骨
  soulboneInstance: 1,
  soulboneAttributeBudget: 0, // 0 = 预算未定，禁止写入具体数值
  boneDropRules: 1,
  soulboneTraitPool: 3,
  soulboneTraitAssembly: 1,
  soulboneAbsorption: 1,
  // 奖励
  rewardTransaction: 1,
  tenThousandInheritance: 2,
  // 战斗适配层
  battleHooks: 1,
  equipmentSource: 1,
  // 旧档迁移
  legacyMigration: 1
});

const PENDING = Object.freeze({
  EMPTY_BEAST_LIBRARY: 'beast-library-empty',
  EMPTY_TRAIT_POOL: 'trait-pool-empty',
  ATTRIBUTE_BUDGET_UNSET: 'attribute-budget-unset',
  SLOT_CONFLICT: 'slot-conflict',
  NO_LEGAL_TRAIT: 'no-legal-trait',
  PRE_STORED_RING: 'pre-stored-ninth-ring',
  OWNER_NOT_READY: 'owner-not-ready'
});

function versionOf(name) {
  if (!Object.prototype.hasOwnProperty.call(VERSIONS, name)) {
    throw new Error('未登记的版本项：' + name);
  }
  return VERSIONS[name];
}

function assertVersion(value, expected, label) {
  if (value !== expected) {
    throw new Error((label || '版本') + '不一致：期望 ' + expected + '，实际 ' + value);
  }
  return true;
}

module.exports = { VERSIONS, PENDING, versionOf, assertVersion };

}},files={"/modules/data/beast/catalog-source.json": "{\n  \"schemaVersion\": 1,\n  \"libraryVersion\": 4,\n  \"sourceFile\": \"魂兽资料_七例.txt\",\n  \"baselineLevel\": 91,\n  \"baselineNote\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\",\n  \"skillPotencyMultiplier\": 1,\n  \"beasts\": [\n    {\n      \"id\": \"frost-moss-frog\",\n      \"name\": \"霜苔巨蛙\",\n      \"version\": 2,\n      \"originalName\": \"霜苔巨螈\",\n      \"style\": \"防御\",\n      \"elements\": [\n        \"木\",\n        \"冰\"\n      ],\n      \"statDice\": [\n        3,\n        2,\n        1,\n        10,\n        9,\n        9\n      ],\n      \"statRatios\": [\n        1.3,\n        1.05,\n        0.85,\n        2.25,\n        2.05,\n        2.05\n      ],\n      \"bloodline\": {\n        \"roll\": 3,\n        \"name\": \"凡血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"两栖纲·蛙类\",\n      \"size\": \"大（象鲸级）\",\n      \"sociality\": \"成对\",\n      \"actualAge\": \"约十四万年\",\n      \"habitat\": \"极北冻林最深处的活水沼——水面结壳，底下永远不冻。\",\n      \"appearance\": \"体形如伏地的巨蛙，背阔腹沉，通体覆一层会结霜的青苔。苔甲沿背脊木质化成脊板，板缝嵌冰壳；前肢短粗，后肢壮硕，趾间有蹼。头骨宽扁，口裂极大，双眼半埋苔层，只露出暗黄光点。它不动的时候，整只兽就是沼面上一块长苔的石头。\",\n      \"habits\": \"一年里大半时间伏在沼底不动，靠皮肤与苔甲缓慢吸取周围生机。它几乎不运使魂力，可被惊动时暴起极快。\",\n      \"role\": \"敌方——冻林守地兽。不主动离沼，但踏进它的沼面就别想走出来。\",\n      \"battleText\": \"沼面的青苔忽然隆起，冰壳沿着脊板接连崩裂。霜苔巨蛙睁开暗黄的眼，粗壮的后肢一撑，庞大的身躯便封住了退路。\",\n      \"defeatText\": \"苔甲层层剥落，巨蛙终于伏回冻沼。寒雾散去，一枚猩红魂环缓缓升起。\",\n      \"talents\": [\n        {\n          \"name\": \"苔甲覆霜\",\n          \"effect\": \"体表苔层吸寒变硬，短时间几乎吃不下物理攻击。\"\n        },\n        {\n          \"name\": \"霜沼拖拽\",\n          \"effect\": \"四肢陷泥时不能移动，但周围寒气会把靠近者一并冻住。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"苔甲覆霜\",\n          \"category\": \"防御\",\n          \"element\": \"冰\",\n          \"description\": \"苔甲吸寒凝霜，在体表结成生命护盾。\"\n        },\n        {\n          \"name\": \"霜沼拖拽\",\n          \"category\": \"控制\",\n          \"element\": \"冰\",\n          \"description\": \"寒泥攀住目标四肢；控制成功后短暂冻结并打断蓄力。\"\n        },\n        {\n          \"name\": \"冻沼撞击\",\n          \"category\": \"攻击\",\n          \"element\": \"木\",\n          \"description\": \"以覆满苔甲的庞大身躯猛撞目标，造成单次物理伤害。\"\n        },\n        {\n          \"name\": \"生苔回息\",\n          \"category\": \"治疗\",\n          \"element\": \"木\",\n          \"description\": \"苔层汲取沼中生机，回复自身生命。\"\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"frost-moss-immunity\",\n          \"name\": \"霜苔不侵\",\n          \"effect\": \"冰属性伤害完全免疫，并改为回复等量生命；免疫全部减速、冻结、迟缓类效果，不参与判定。受击时叠加封寒：冰属性攻击叠2层，非冰攻击叠1层；每层提供原始生命5%的护盾，累计不超过原始生命的50%。原始生命指魂兽定义面板，不含讨伐血量倍率；玩家继承时按自身最大生命计算。非冰属性越盾真伤不受减免。\",\n          \"params\": {\n            \"iceDamageImmunity\": true,\n            \"iceDamageToHealing\": 1,\n            \"immuneTags\": [\n              \"slow\",\n              \"freeze\",\n              \"sluggish\"\n            ],\n            \"iceHitStacks\": 2,\n            \"otherHitStacks\": 1,\n            \"shieldPerStackBaseHealth\": 0.05,\n            \"shieldCapBaseHealth\": 0.5,\n            \"shieldBasis\": \"original-panel-hp\",\n            \"maxStacks\": 10,\n            \"shieldMode\": \"stack-capacity\"\n          }\n        },\n        {\n          \"id\": \"moss-armor-accumulation\",\n          \"name\": \"苔甲凝积\",\n          \"effect\": \"每次实际受创叠1层苔凝，每层永久提高防御素质10%、肉体强度5%，上限12层；每满4层额外获得5%固定减伤，最多15%。持续伤害不叠层。\",\n          \"params\": {\n            \"trigger\": \"actual-damage-received\",\n            \"excludeDamageTags\": [\n              \"dot\"\n            ],\n            \"defensePerStack\": 0.1,\n            \"bodyPerStack\": 0.05,\n            \"maxStacks\": 12,\n            \"reductionEveryStacks\": 4,\n            \"reductionPerStep\": 0.05,\n            \"maxReduction\": 0.15,\n            \"stackLifetime\": \"permanent\",\n            \"saveFields\": [\n              \"mossStacks\"\n            ]\n          }\n        }\n      ]\n    },\n    {\n      \"id\": \"frost-gnat\",\n      \"name\": \"霜蚋\",\n      \"version\": 1,\n      \"style\": \"敏攻\",\n      \"elements\": [\n        \"冰\"\n      ],\n      \"statDice\": [\n        9,\n        6,\n        1,\n        5,\n        10,\n        8\n      ],\n      \"statRatios\": [\n        2.05,\n        1.63,\n        0.85,\n        1.55,\n        2.25,\n        1.82\n      ],\n      \"bloodline\": {\n        \"roll\": 2,\n        \"name\": \"凡血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"虫类·蚋（双翅目）\",\n      \"size\": \"微（指掌以下）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"不可考，换过太多次壳\",\n      \"habitat\": \"冰原裂隙与积雪层下的暖缝，那一线不结冰的缝就是它的领地。\",\n      \"appearance\": \"体长不足三分，通体冰蓝半透，翅薄如霜且几乎不反光。飞行时肉眼只能看到一点雪屑似的浮动。口器细长如针，腹末两根短刺。\",\n      \"habits\": \"终生独居，不结群、不筑巢。以极高速度在雪面跳点，用口针吸取体温与少量魂力；极惧光，日间深藏隙中。\",\n      \"role\": \"异种·首领——体型最小、最难打的十万年魂兽。\",\n      \"battleText\": \"一粒雪屑停在你的感知边缘，下一瞬却已掠至近前。冰蓝的薄翅无声展开，脚下的雪地渐渐凝成霜域。\",\n      \"defeatText\": \"薄翅终于停止震颤，最后一层冰壳碎成细雪。霜域消退，猩红魂环在雪面上凝聚。\",\n      \"talents\": [\n        {\n          \"name\": \"霜针\",\n          \"effect\": \"口器刺入时注入寒气，伤口不流血而是结霜。\"\n        },\n        {\n          \"name\": \"雪屑掩形\",\n          \"effect\": \"高速移动时翅膜散出细霜，短时间内难以锁定其位置。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"霜针\",\n          \"category\": \"攻击\",\n          \"element\": \"冰\",\n          \"description\": \"掠近目标，以冰针般的口器完成一次迅疾刺击。\"\n        },\n        {\n          \"name\": \"雪屑掩形\",\n          \"category\": \"强化\",\n          \"element\": \"冰\",\n          \"buffField\": \"A\",\n          \"description\": \"翅膜散霜，借细雪遮掩行迹，提高自身敏捷。\"\n        },\n        {\n          \"name\": \"寒痕入骨\",\n          \"category\": \"持续伤害\",\n          \"element\": \"冰\",\n          \"description\": \"将寒气留在创口，分三次侵蚀目标，不重复叠加同一寒痕。\"\n        },\n        {\n          \"name\": \"掠影断脉\",\n          \"category\": \"控制\",\n          \"element\": \"冰\",\n          \"description\": \"疾掠时刺向魂力流转的间隙；判定成功后短暂打断并控制目标。\"\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"ice-shell-preservation\",\n          \"name\": \"冰壳护生\",\n          \"effect\": \"战斗开始时，获得相当于自身生命值40%的护盾。护盾被击破时，向攻击者反弹该护盾已吸收伤害的30%，冰屑穿透护盾；越盾真伤无视冰壳。护盾只结一次，不会自行重结或叠加。\",\n          \"params\": {\n            \"battleStartShieldMaxHPRate\": 0.4,\n            \"shieldBasis\": \"own-max-hp\",\n            \"maxLayers\": 1,\n            \"reflectionRate\": 0.3,\n            \"reflectionElement\": \"冰\",\n            \"reflectionBypassShield\": true,\n            \"bypassedByTags\": [\n              \"shield-bypass-true-damage\"\n            ]\n          }\n        },\n        {\n          \"id\": \"frost-domain\",\n          \"name\": \"霜域\",\n          \"effect\": \"展开不可驱散的霜域，持续整场。每档使敌方单位敏捷降低2%、行动条速度降低4%，友方单位（含自身）敏捷提高4%；每1个自身回合加深一档，最多3档。达到3档后，每次加深不再提高这些数值，改为：友方单位（含自身）获得相当于其生命上限2%的寒冰护盾，敌方单位承受相当于其生命上限2%的伤害（按生命上限计算，不经过防御衰减）。驱散技能可压住霜域一个自身回合。\",\n          \"params\": {\n            \"lifetime\": \"battle\",\n            \"dispellable\": false,\n            \"suppressibleByDispelOwnerTurns\": 1,\n            \"enemyAgilityDownPerTier\": 0.02,\n            \"enemyGaugeSpeedDownPerTier\": 0.04,\n            \"allyAgilityUpPerTier\": 0.04,\n            \"maxTier\": 3,\n            \"deepenEveryOwnerTurns\": 1,\n            \"tierThreeAllyShieldMaxHPRate\": 0.02,\n            \"tierThreeEnemyDamageMaxHPRate\": 0.02,\n            \"tierThreeDamageBasis\": \"max-hp\",\n            \"tierThreeDamageMitigation\": \"none\"\n          }\n        }\n      ]\n    },\n    {\n      \"id\": \"abyss-imperial-salamander\",\n      \"name\": \"沧渊帝螈\",\n      \"version\": 1,\n      \"style\": \"控制\",\n      \"elements\": [\n        \"水\"\n      ],\n      \"statDice\": [\n        8,\n        10,\n        2,\n        4,\n        8,\n        7\n      ],\n      \"statRatios\": [\n        1.82,\n        2.25,\n        1.05,\n        1.4,\n        1.82,\n        1.72\n      ],\n      \"bloodline\": {\n        \"roll\": 9,\n        \"name\": \"帝血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"两栖纲·鲵\",\n      \"size\": \"中（马牛级）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"约十二万年\",\n      \"habitat\": \"地下暗河汇成的深潭，水面常年浮一层不散的白气。\",\n      \"appearance\": \"大小如牛犊的鲵，通体青灰近墨，皮肤湿滑。头部两侧生有鳍状冠，冠缘不断逸出淡蓝色光雾。\",\n      \"habits\": \"独居且极静，魂力庞大而难以收束。泄露的魂力驱动附近水流，自行形成压迫与吸取。\",\n      \"role\": \"首领——深潭区域的唯一强敌，擅长把战斗拖长到自己回满。\",\n      \"battleText\": \"潭底亮起两道幽光，逸散的魂力令四周水汽骤然下沉。沧渊帝螈浮出暗河，鳍冠间的蓝雾正牵动整片深潭。\",\n      \"defeatText\": \"鳍冠间的蓝雾渐渐熄灭，沉重的水压终于散去。沧渊帝螈伏入浅水，猩红魂环随涟漪升起。\",\n      \"talents\": [\n        {\n          \"name\": \"沧澜压\",\n          \"effect\": \"潭水骤然加重，范围内所有单位的读条与行动被拖慢。\"\n        },\n        {\n          \"name\": \"引潮\",\n          \"effect\": \"外泄魂力自行抽取周围单位逸散的魂力，补回自身。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"沧澜压\",\n          \"category\": \"控制\",\n          \"element\": \"水\",\n          \"description\": \"将水压收束在一名敌人身上，控制成功后打断其行动。\"\n        },\n        {\n          \"name\": \"潭流冲击\",\n          \"category\": \"攻击\",\n          \"element\": \"水\",\n          \"description\": \"释放一道沉重水流，造成单次能量伤害。\"\n        },\n        {\n          \"name\": \"滞水缠身\",\n          \"category\": \"减益\",\n          \"element\": \"水\",\n          \"debuffField\": \"A\",\n          \"description\": \"黏滞水流缠住目标，精神对抗成功后降低其敏捷。\"\n        },\n        {\n          \"name\": \"回潮护身\",\n          \"category\": \"防御\",\n          \"element\": \"水\",\n          \"description\": \"以回旋水流包覆身体，生成生命护盾。\"\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"oppressive-tides\",\n          \"name\": \"沧澜压境\",\n          \"effect\": \"每次受到攻击后，对攻击者施加滞流：读条速度降低20%、行动条速度降低15%，持续6秒，可叠3层；同时该目标本回合魂力消耗提高30%。无魂力单位只受减速，不受费用惩罚。\",\n          \"params\": {\n            \"trigger\": \"attack-received\",\n            \"castSpeedDownPerStack\": 0.2,\n            \"gaugeSpeedDownPerStack\": 0.15,\n            \"maxStacks\": 3,\n            \"durationSeconds\": 6,\n            \"costUp\": 0.3,\n            \"costDuration\": \"target-current-turn\",\n            \"excludeResourceFreeUnits\": true\n          }\n        },\n        {\n          \"id\": \"devouring-soul-recovery\",\n          \"name\": \"吞噬回魂\",\n          \"effect\": \"每回合结束回复最大魂力8%。场上任一单位消耗魂力时，吸收其实际消耗量的30%转为自身魂力。魂力满溢部分转为护盾，每回合最多生成最大生命10%的护盾。被封锁或禁绝效果命中时，该回合不吸收。\",\n          \"params\": {\n            \"endTurnMaxMPRate\": 0.08,\n            \"manaSpentSiphonRate\": 0.3,\n            \"manaSpentScope\": \"all-units-including-self\",\n            \"overflowShieldRate\": 1,\n            \"overflowShieldPerTurnMaxHP\": 0.1,\n            \"sealTags\": [\n              \"resource_seal\",\n              \"resource_prohibition\"\n            ],\n            \"siphonTransfersOpponentMana\": false,\n            \"resourceRecoveryTriggersSiphon\": false\n          }\n        }\n      ]\n    },\n    {\n      \"id\": \"fu-yue-ju-rong-yuan\",\n      \"name\": \"负岳蝾螈\",\n      \"version\": 2,\n      \"style\": \"防御\",\n      \"elements\": [\n        \"土\"\n      ],\n      \"statDice\": [\n        8,\n        2,\n        3,\n        8,\n        1,\n        9\n      ],\n      \"statRatios\": [\n        1.82,\n        1.05,\n        1.3,\n        1.82,\n        0.85,\n        2.05\n      ],\n      \"bloodline\": {\n        \"roll\": 6,\n        \"name\": \"灵血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"两栖纲·巨型蝾螈\",\n      \"size\": \"大（象鲸级）\",\n      \"sociality\": \"成对\",\n      \"actualAge\": \"约十八万年\",\n      \"habitat\": \"西极地脉裂谷尽头的泥沼——沼底压着一条断掉的龙脉，泥水终年温热。\",\n      \"appearance\": \"一头放大了上千倍的蝾螈。头骨宽扁，口裂横贯半张脸，眼退成两点浑浊的琥珀；四肢短粗，趾间厚蹼，尾侧扁如桨。背脊覆着一层层土黄的岩甲，甲缝嵌着碎石与苔，远看就是一座伏在沼里的石丘。皮肤终年渗着温热的泥浆，它爬过的地方会留下一条慢慢合拢的沟。\",\n      \"habits\": \"极慢。伏在沼底时与一块长苔的礁石没有分别，靠皮肤与岩甲一点点汲取地脉之气。不捕不猎，十万年里只做一件事——把背上那层越积越厚的岩甲负稳。它不追人，只把路“坐断”。\",\n      \"role\": \"敌方——地脉守门兽。站在必经之路上，绕不过，也推不动。\",\n      \"battleText\": \"整片泥沼忽然下沉半尺。背甲上的苔土层层剥落，一座山的影子从沼底缓缓升起——负岳蝾螈抬起头，泥水顺着宽扁的头骨往下淌，像一道倒流的瀑布。\",\n      \"defeatText\": \"背上的岳影终于崩散，碎石如雨落回泥沼。负岳蝾螈伏低宽扁的头，十万年不肯放下的那口气，随一声闷响散进地脉。\",\n      \"talents\": [\n        {\n          \"name\": \"岳甲覆身\",\n          \"effect\": \"甲缝渗出的黄雾裹住躯体，土石自行攀附，结成一层越来越厚的甲。\"\n        },\n        {\n          \"name\": \"裂地摆尾\",\n          \"effect\": \"扁尾横扫，沼底的地脉被整条掀了起来。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"岳甲覆身\",\n          \"category\": \"防御\",\n          \"element\": \"土\",\n          \"description\": \"甲缝涌出的黄雾裹住全身，土石层层攀附，结成一面越来越厚的生命护盾。\"\n        },\n        {\n          \"name\": \"地脉贯石\",\n          \"category\": \"攻击\",\n          \"element\": \"土\",\n          \"description\": \"前肢往沼底一按，地脉自目标足下暴起，碎石穿身而过，造成单次物理伤害。\"\n        },\n        {\n          \"name\": \"镇岳\",\n          \"category\": \"减益\",\n          \"element\": \"土\",\n          \"debuffField\": \"A\",\n          \"description\": \"山岳之势压落，目标举步维艰，敏捷被一寸寸拖低。\"\n        },\n        {\n          \"name\": \"山崩余震\",\n          \"category\": \"持续伤害\",\n          \"element\": \"土\",\n          \"description\": \"一击之后地裂未止，余震分三次从脚底翻上来。\"\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"bearing-mountain\",\n          \"name\": \"负岳\",\n          \"effect\": \"战斗开始时，背上的山影凝成护盾，值等于自身最大生命80%。自身受到的伤害有40%先由山影承担；山影每承担一次伤害，叠1层“山重”，每层使自身防御素质提高6%、受到的伤害降低2%，最多10层。山影被击破时，立即回复自身最大生命20%，山重层数不清空。越盾真伤不转嫁、不叠层。\",\n          \"params\": {\n            \"battleStartShieldMaxHPRate\": 0.8,\n            \"transferRate\": 0.4,\n            \"defensePerStack\": 0.06,\n            \"damageTakenDownPerStack\": 0.02,\n            \"maxStacks\": 10,\n            \"breakHealMaxHPRate\": 0.2,\n            \"stackLifetime\": \"battle\",\n            \"bypassTags\": [\n              \"shield-bypass-true-damage\"\n            ],\n            \"saveFields\": [\n              \"yueStacks\"\n            ],\n            \"statusLifetime\": \"battle\"\n          }\n        },\n        {\n          \"id\": \"ley-line-pierce\",\n          \"name\": \"山根透地\",\n          \"effect\": \"负岳蝾螈的攻击循地脉自目标足下穿出：无视目标40%防御素质，并无视护盾直接伤及本体。代价是每次攻击后自身行动条速度降低15%，持续整场战斗，可叠2层。对悬空或无形体的目标，只无视防御，不无视护盾。\",\n          \"params\": {\n            \"defenseIgnoreRate\": 0.4,\n            \"ignoreShield\": true,\n            \"selfGaugeSpeedDown\": 0.15,\n            \"maxStacks\": 2,\n            \"exceptions\": [\n              \"airborne\",\n              \"incorporeal\"\n            ],\n            \"duration\": \"battle\",\n            \"statusLifetime\": \"battle\"\n          }\n        }\n      ]\n    },\n    {\n      \"id\": \"zhe-tian-du-zhen\",\n      \"name\": \"遮天毒鸩\",\n      \"version\": 2,\n      \"style\": \"防御\",\n      \"elements\": [\n        \"毒\"\n      ],\n      \"statDice\": [\n        6,\n        2,\n        4,\n        7,\n        5,\n        1\n      ],\n      \"statRatios\": [\n        1.63,\n        1.05,\n        1.4,\n        1.72,\n        1.55,\n        0.85\n      ],\n      \"bloodline\": {\n        \"roll\": 5,\n        \"name\": \"异血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"鸟纲·猛禽（鸩，表外补充）\",\n      \"size\": \"巨（楼舍级）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"约十一万年（换过九次羽）\",\n      \"habitat\": \"南疆瘴泽上空终年不散的毒云——云底垂着紫黑色的雨丝。\",\n      \"appearance\": \"形如巨雕，双翼展开遮住半座楼舍；羽色墨绿近黑，羽尖凝着暗紫的毒露，飞过处落下一阵细如针的毒雨。喙如弯钩，颈侧生着九枚肉冠，每枚冠里封着一口颜色不同的瘴。翅骨细，撑不住楼舍般的身子，所以它飞不高，也飞不久。\",\n      \"habits\": \"不筑巢，随瘴云迁徙。以腐尸与毒虫为食，越毒越壮；寻常猛禽避之不及的腐肉，是它的正餐。它落在哪里，哪里的水十年不能饮。因为太重，多数时候蹲在毒云里等风来推；一旦真动起来，是整片云一起压下去。\",\n      \"role\": \"异种·首领——瘴泽上空的活灾。它落在哪里，哪里十年不长草。\",\n      \"battleText\": \"毒云低垂，楼舍般的黑影从云里坠下来。遮天毒鸩抖开墨绿的双翼，羽尖滴落的毒露在落地前就蒸成了一片紫雾。\",\n      \"defeatText\": \"最后一枚肉冠裂开又合上，毒云失了主心，四散而去。遮天毒鸩重重跌进泽地，腐羽间升起一枚猩红魂环。\",\n      \"talents\": [\n        {\n          \"name\": \"瘴羽覆身\",\n          \"effect\": \"抖落一层毒羽，在身周结成腐绿色的雾甲。\"\n        },\n        {\n          \"name\": \"九冠吐瘴\",\n          \"effect\": \"九枚肉冠依次裂开，喷出九道颜色各异的瘴气，合起来是一堵墙。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"腐羽裹身\",\n          \"category\": \"防御\",\n          \"element\": \"毒\",\n          \"description\": \"抖落腐羽，毒雾在体表凝成一层黏腻的雾甲。\"\n        },\n        {\n          \"name\": \"毒喙贯骨\",\n          \"category\": \"攻击\",\n          \"element\": \"毒\",\n          \"description\": \"弯钩般的喙自高处凿下，毒液随创口灌入，造成单次物理伤害。\"\n        },\n        {\n          \"name\": \"弥天瘴\",\n          \"category\": \"减益\",\n          \"element\": \"毒\",\n          \"debuffField\": \"A\",\n          \"description\": \"瘴羽漫天，目标四肢发沉，敏捷被一层层拖低。\"\n        },\n        {\n          \"name\": \"百瘴蚀骨\",\n          \"category\": \"持续伤害\",\n          \"element\": \"毒\",\n          \"description\": \"腐毒留在创口，分三次由内向外蚀空。\"\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"twin-sac-frame\",\n          \"name\": \"双囊之躯\",\n          \"effect\": \"腐毒在体内结成第二副脏腑。生命之外另有一条“毒囊”，容量等于自身最大生命50%，受到伤害时毒囊优先承伤，毒囊见底后才扣生命。毒囊每回合结束回复8%，见底即进入“破囊”：受到的伤害提高25%。毒囊被击破的瞬间，向全场敌人喷散腐毒，各叠2层“瘴羽”。两槽俱空才败。反制：毒囊不挡精神伤害，精神攻击直取本体。\",\n          \"params\": {\n            \"secondPool\": \"toxin-sac\",\n            \"secondPoolMaxHPRate\": 0.5,\n            \"damagePriority\": \"toxin-sac-first\",\n            \"regenPerTurn\": 0.08,\n            \"brokenDamageTakenUp\": 0.25,\n            \"breakSpreadStacks\": 2,\n            \"defeatWhenBothEmpty\": true,\n            \"mentalDamageBypassPool\": true,\n            \"saveFields\": [\n              \"toxinSac\"\n            ],\n            \"statusLifetime\": \"battle\"\n          }\n        },\n        {\n          \"id\": \"sky-full-of-miasma\",\n          \"name\": \"弥天瘴羽\",\n          \"effect\": \"每回合结束时，向所有敌人各撒1层“瘴羽”，最多6层：每层使目标敏捷降低5%、魂力操纵降低5%、魂力回复降低10%、受到的伤害提高8%。敌人每消耗一次魂力，额外叠1层。叠满6层时，该目标下一次获得的护盾、治疗、回魂完全失效一次，随后层数清零。净化类技能一次可剥除2层。\",\n          \"params\": {\n            \"stacksPerTurn\": 1,\n            \"maxStacks\": 6,\n            \"agilityDownPerStack\": 0.05,\n            \"manaRegenDownPerStack\": 0.1,\n            \"extraStackOnManaSpend\": 1,\n            \"purgeStacks\": 2,\n            \"lockoutAtMax\": true,\n            \"lockoutScope\": [\n              \"shield\",\n              \"heal\",\n              \"mana-recovery\"\n            ],\n            \"statusLifetime\": \"battle\",\n            \"controlDownPerStack\": 0.05,\n            \"damageTakenUpPerStack\": 0.08,\n            \"damageScope\": \"all\"\n          }\n        }\n      ]\n    },\n    {\n      \"id\": \"jin-lin-zhen-hun-chi\",\n      \"name\": \"金鳞镇魂螭\",\n      \"version\": 2,\n      \"style\": \"控制\",\n      \"elements\": [\n        \"金\"\n      ],\n      \"statDice\": [\n        4,\n        7,\n        3,\n        10,\n        5,\n        9\n      ],\n      \"statRatios\": [\n        1.4,\n        1.72,\n        1.3,\n        2.25,\n        1.55,\n        2.05\n      ],\n      \"bloodline\": {\n        \"roll\": 2,\n        \"name\": \"凡血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"龙属·亚龙（螭，无角之龙）\",\n      \"size\": \"大（象鲸级）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"约十万年整（刚满）\",\n      \"habitat\": \"西极金铁矿脉最深处——洞壁被它的鳞刮得发亮，像一面走不到头的镜子。\",\n      \"appearance\": \"无角之龙，身长如鲸，通体覆着层层叠叠的金鳞，每一片的边缘都能割开岩石。腹下四爪扣住矿脉，脊背生一道锯齿状的铁脊。眼如熔金，不眨——与它对视超过三息，体内的魂力会自己往下沉。它游过矿洞时，鳞与岩壁相击，声如千万柄刀同时出鞘。\",\n      \"habits\": \"守着一座金山，不吃不喝，只以金气淬鳞。凡带兵刃入山者，它额前的金鳞会先一步发烫——不是预警，是记住了这个人。它的目光落在谁身上，谁的魂力就开始滞；所以识相的猎魂者都低着头进山。十万年里它的鳞磨掉一层、长一层，越磨越硬。\",\n      \"role\": \"首领——金山之主。不追人，但凡带兵刃入山者，它都记得。\",\n      \"battleText\": \"矿洞深处传来鳞甲相击的脆响，像千万柄刀同时出鞘。金鳞镇魂螭盘在脉心，熔金般的双眼睁开，整座金山的金气随之一沉。\",\n      \"defeatText\": \"金鳞一片片黯淡、卷起，像烧尽的纸。金鳞镇魂螭松开扣住矿脉的爪，脊背的锯齿缓缓伏平，一枚红环从矿尘里浮起。\",\n      \"talents\": [\n        {\n          \"name\": \"金鳞共鸣\",\n          \"effect\": \"周身金鳞震颤，方圆内的兵刃与魂力运转一并滞涩。\"\n        },\n        {\n          \"name\": \"削金吐息\",\n          \"effect\": \"喷出一道金灰色的气，所过之处甲胄如泥。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"金气贯岳\",\n          \"category\": \"攻击\",\n          \"element\": \"金\",\n          \"description\": \"一道金灰色的气自口中吐出，贯石穿岳，造成单次能量伤害。\"\n        },\n        {\n          \"name\": \"金枷锁脉\",\n          \"category\": \"减益\",\n          \"element\": \"金\",\n          \"debuffField\": \"A\",\n          \"description\": \"金气凝成枷锁，锁住目标魂力流转与四肢。\"\n        },\n        {\n          \"name\": \"螭纹锁魂\",\n          \"category\": \"控制\",\n          \"element\": \"金\",\n          \"description\": \"螭纹自地面爬起，缠住目标魂力流转的间隙。\"\n        },\n        {\n          \"name\": \"鎏金鳞甲\",\n          \"category\": \"防御\",\n          \"element\": \"金\",\n          \"description\": \"金鳞层叠合拢，结成一面临时甲盾。\"\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"metal-breath-carve\",\n          \"name\": \"金气削骨\",\n          \"effect\": \"金鳞镇魂螭的攻击与魂技无视目标30%防御素质；命中时额外越盾扣除目标最大生命的3%，每回合最多触发2次；目标带有护盾时改为6%。每次触发使目标叠1层“削金”：防御素质降低4%，最多5层。反制：对无生命或构装类目标，越盾部分减半。\",\n          \"params\": {\n            \"defenseIgnoreRate\": 0.3,\n            \"bypassMaxHPRate\": 0.03,\n            \"perTurnMax\": 2,\n            \"vsShieldRate\": 0.06,\n            \"defenseDownPerStack\": 0.04,\n            \"maxStacks\": 5,\n            \"exemptAgainst\": [\n              \"non-living\",\n              \"construct\"\n            ],\n            \"statusLifetime\": \"battle\"\n          }\n        },\n        {\n          \"id\": \"chi-pattern-suppress\",\n          \"name\": \"螭纹压魂\",\n          \"effect\": \"自身获得3层传奇抗性：前三次可施加的控制效果固定被免疫，不进行豁免检定，每次消耗1层，战斗中不恢复。每次受到攻击，对攻击者施加1层“螭纹”：敏捷降低6%、魂力消耗提高8%，持续整场战斗，最多6层。叠满6层时，攻击者下一次行动无法获得任何增益、护盾、治疗与回魂，且读条速度降低20%，持续整场战斗。无魂力单位只受减速，不受费用惩罚。\",\n          \"params\": {\n            \"trigger\": \"attack-received\",\n            \"agilityDownPerStack\": 0.06,\n            \"costUpPerStack\": 0.08,\n            \"maxStacks\": 6,\n            \"lockoutAtMax\": true,\n            \"lockoutScope\": [\n              \"buff\",\n              \"shield\",\n              \"heal\",\n              \"mana-recovery\"\n            ],\n            \"castSpeedDownOnLockout\": 0.2,\n            \"excludeResourceFreeUnits\": true,\n            \"duration\": \"battle\",\n            \"statusLifetime\": \"battle\",\n            \"legendaryResistanceCharges\": 3,\n            \"legendaryControlBlockMode\": \"before-save-no-roll\",\n            \"legendaryRefresh\": \"battle-start-only\",\n            \"castSpeedDownLifetime\": \"battle\",\n            \"saveFields\": [\n              \"legendaryRemaining\",\n              \"chiStacksByActor\"\n            ]\n          }\n        }\n      ]\n    },\n    {\n      \"id\": \"fen-tian-chi-yan-long\",\n      \"name\": \"焚天赤烛龙\",\n      \"version\": 2,\n      \"style\": \"强攻\",\n      \"elements\": [\n        \"火\"\n      ],\n      \"statDice\": [\n        10,\n        8,\n        10,\n        7,\n        5,\n        5\n      ],\n      \"statRatios\": [\n        2.25,\n        1.82,\n        2.25,\n        1.72,\n        1.55,\n        1.55\n      ],\n      \"bloodline\": {\n        \"roll\": 3,\n        \"name\": \"凡血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"融合体·双龙嵌合（表外补充：两条火龙熔为一体）\",\n      \"size\": \"中（马牛级）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"约十三万年\",\n      \"habitat\": \"极西火脉尽头，岩浆河分岔处的黑曜石台——台下是烧了十万年的火。\",\n      \"appearance\": \"只有马牛大小，却是两条火龙熔在一起：一具身子，两颗头，左首赤如熔金、右首黑如焦炭；颈下的鳞各自生长，到胸前熔成一片烧红的铁。四足两尾，脊背裂着一道始终不灭的火缝。火缝亮时四周如白昼，火缝闭时连影子都被烤化。\",\n      \"habits\": \"两条龙争一副身子，争了十万年，谁也吞不掉谁。不动时火缝半明半灭，像在呼吸；双首同时睁眼，身周百步的火属性魂力会被抽干，连空气都烧成白焰。它不喜欢光——它自己就是光。\",\n      \"role\": \"首领——火脉尽头的双生凶物。两条龙共用一副身子，也共用一份杀意。\",\n      \"battleText\": \"黑曜石台上的火缝忽然大亮，照得整条岩浆河都失了颜色。焚天赤烛龙双首同时抬起，一赤一黑，四只眼睛里各烧着一条不肯认输的龙。\",\n      \"defeatText\": \"火缝熄了一半，两个头终于不再争了。焚天赤烛龙伏在黑曜石上，赤首阖眼，黑首吐出最后一缕烟，红环在余烬中缓缓转亮。\",\n      \"talents\": [\n        {\n          \"name\": \"火缝照夜\",\n          \"effect\": \"脊背火缝大亮，照见一切隐匿；光本身即是灼。\"\n        },\n        {\n          \"name\": \"双龙绞\",\n          \"effect\": \"两首各吐一道火，交缠成一根绞索。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"赤炎贯天\",\n          \"category\": \"攻击\",\n          \"element\": \"火\",\n          \"description\": \"火缝大亮，一道赤炎直贯而出，造成单次物理伤害。\"\n        },\n        {\n          \"name\": \"焚天吐息\",\n          \"category\": \"持续伤害\",\n          \"element\": \"火\",\n          \"description\": \"两首同吐，火舌在目标身上分三次爆开。\"\n        },\n        {\n          \"name\": \"双龙绞\",\n          \"category\": \"控制\",\n          \"element\": \"火\",\n          \"description\": \"两道火索交缠，将目标捆在原地。\"\n        },\n        {\n          \"name\": \"逆鳞火甲\",\n          \"category\": \"防御\",\n          \"element\": \"火\",\n          \"description\": \"逆鳞倒竖，火幕合拢成甲。\"\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"blaze-armor-break\",\n          \"name\": \"焚龙破甲\",\n          \"effect\": \"火光所照，甲胄如纸。自身造成的伤害无视目标35%防御素质，并无视全部减伤与防守状态（不含护盾）。代价：每次攻击额外消耗当前魂力的15%，且自身受到的伤害提高10%，持续整场战斗。反制：护盾仍按原值吸收，穿透不等于必中。\",\n          \"params\": {\n            \"defenseIgnoreRate\": 0.35,\n            \"ignoreMitigation\": true,\n            \"ignoreDefensiveStates\": true,\n            \"excludeShield\": true,\n            \"extraManaCostRate\": 0.15,\n            \"selfDamageTakenUp\": 0.1,\n            \"duration\": \"battle\",\n            \"statusLifetime\": \"battle\",\n            \"damageScope\": \"all\"\n          }\n        },\n        {\n          \"id\": \"reverse-scale-unburned\",\n          \"name\": \"赤烛不焚\",\n          \"effect\": \"首次受到某属性伤害时正常承受100%伤害，结算后获得该属性50%抗性，第二次及后续该属性伤害固定减半，不再继续减半。受到有属性伤害或被施加有属性减益时，叠1层“烛炎”并获得对应属性抗性；减益本身仍按原幅度结算。每层烛炎使自身魂技伤害提高10%，最多10层，层数与抗性持续整场战斗；无属性伤害与减益不记录、不叠层。被控制后的免控期由4秒延长至8秒；控制期间每回合对控制者造成其最大生命4%的火属性伤害。\",\n          \"params\": {\n            \"trigger\": \"attributed-damage-or-debuff-received\",\n            \"stackName\": \"烛炎\",\n            \"stackPerDamagePacket\": 1,\n            \"maxStacks\": 10,\n            \"stackLifetime\": \"battle\",\n            \"recordAttributeHits\": true,\n            \"resistanceAtHitCount\": 1,\n            \"resistanceDamageMultiplier\": 0.5,\n            \"resistanceIncludesThresholdHit\": false,\n            \"resistanceLifetime\": \"battle\",\n            \"recordNeutralDamage\": false,\n            \"stackOnNeutralDamage\": false,\n            \"compositeHitRecord\": \"each-non-neutral-tag-once-per-packet\",\n            \"compositeDamageStackCount\": 1,\n            \"repeatedResistancePolicy\": \"one-half-once-no-repeated-halving\",\n            \"controlImmunitySeconds\": 8,\n            \"controlReflectMaxHPRate\": 0.04,\n            \"controlReflectElement\": \"火\",\n            \"controlReflectCadence\": \"once-per-logical-turn-while-controlled\",\n            \"controlReflectTarget\": \"current-controller\",\n            \"controlReflectBypassShield\": false,\n            \"fireDamageImmunity\": false,\n            \"fireDamageToHealing\": 0,\n            \"saveFields\": [\n              \"candleFlameStacks\",\n              \"attributeHitCounts\",\n              \"resistedAttributes\",\n              \"currentControllerId\",\n              \"lastControlReflectTurn\"\n            ],\n            \"skillDamageUpPerStack\": 0.1,\n            \"resistanceAppliesToDebuffMagnitude\": false\n          }\n        }\n      ]\n    }\n  ],\n  \"skillTierPolicy\": {\n    \"version\": 1,\n    \"basis\": \"single-stat-S-over-same-level-benchmark\",\n    \"ratingProfile\": \"npc\",\n    \"note\": \"按魂力强度S单项相对同级基准判档，不按六维平均总评；只决定魂兽四技威力，不改变十万年魂环与魂骨年限。\",\n    \"bands\": [\n      {\n        \"rating\": \"纸级\",\n        \"label\": \"万年第一档\",\n        \"years\": 10000,\n        \"q\": 2.8\n      },\n      {\n        \"rating\": \"并级\",\n        \"label\": \"万年第二档\",\n        \"years\": 30000,\n        \"q\": 3.15\n      },\n      {\n        \"rating\": \"强级\",\n        \"label\": \"万年第三档\",\n        \"years\": 50000,\n        \"q\": 3.5\n      },\n      {\n        \"rating\": \"凶级\",\n        \"label\": \"万年第四档\",\n        \"years\": 70000,\n        \"q\": 3.8\n      },\n      {\n        \"rating\": \"狂级\",\n        \"label\": \"万年第五档\",\n        \"years\": 90000,\n        \"q\": 4\n      },\n      {\n        \"rating\": \"神级\",\n        \"label\": \"十万年档\",\n        \"years\": 100000,\n        \"q\": 4.5\n      }\n    ]\n  },\n  \"statusPolicy\": {\n    \"version\": 1,\n    \"numericBuffLifetime\": \"battle\",\n    \"numericDebuffLifetime\": \"battle\",\n    \"shieldLifetime\": \"battle\",\n    \"sameSourcePolicy\": \"refresh-not-stack-unless-explicit\",\n    \"controlLifetime\": \"original-contest-seconds\",\n    \"periodicDamageSchedule\": \"original-parts-and-interval\",\n    \"persistentCombatStacks\": \"battle-only\",\n    \"note\": \"数值增益、削弱与防御盾持续本场；控制时长、控制后免疫窗口、持续伤害跳数/间隔及单次触发不改成无限时长。\"\n  }\n}\n", "/modules/data/beast/library.json": "{\n  \"schemaVersion\": 1,\n  \"libraryVersion\": 4,\n  \"note\": \"七例正式魂兽资料，四技按魂力强度S分档、增益与减益持续本场；v12.05宿主已接入十四条被动及魂骨继承处理器，独立模块执行战斗仍需宿主。\",\n  \"source\": {\n    \"file\": \"魂兽资料_七例.txt\",\n    \"sha256\": \"95c923b0cd3efafb9605f4ae06815d55543c07dcffaa4134e1981a28c392aab7\",\n    \"rulesVersion\": 11,\n    \"ratingRulesVersion\": 2,\n    \"skillYears\": null,\n    \"skillTierPolicy\": {\n      \"version\": 1,\n      \"basis\": \"single-stat-S-over-same-level-benchmark\",\n      \"ratingProfile\": \"npc\",\n      \"note\": \"按魂力强度S单项相对同级基准判档，不按六维平均总评；只决定魂兽四技威力，不改变十万年魂环与魂骨年限。\",\n      \"bands\": [\n        {\n          \"rating\": \"纸级\",\n          \"label\": \"万年第一档\",\n          \"years\": 10000,\n          \"q\": 2.8\n        },\n        {\n          \"rating\": \"并级\",\n          \"label\": \"万年第二档\",\n          \"years\": 30000,\n          \"q\": 3.15\n        },\n        {\n          \"rating\": \"强级\",\n          \"label\": \"万年第三档\",\n          \"years\": 50000,\n          \"q\": 3.5\n        },\n        {\n          \"rating\": \"凶级\",\n          \"label\": \"万年第四档\",\n          \"years\": 70000,\n          \"q\": 3.8\n        },\n        {\n          \"rating\": \"狂级\",\n          \"label\": \"万年第五档\",\n          \"years\": 90000,\n          \"q\": 4\n        },\n        {\n          \"rating\": \"神级\",\n          \"label\": \"十万年档\",\n          \"years\": 100000,\n          \"q\": 4.5\n        }\n      ]\n    },\n    \"statusPolicy\": {\n      \"version\": 1,\n      \"numericBuffLifetime\": \"battle\",\n      \"numericDebuffLifetime\": \"battle\",\n      \"shieldLifetime\": \"battle\",\n      \"sameSourcePolicy\": \"refresh-not-stack-unless-explicit\",\n      \"controlLifetime\": \"original-contest-seconds\",\n      \"periodicDamageSchedule\": \"original-parts-and-interval\",\n      \"persistentCombatStacks\": \"battle-only\",\n      \"note\": \"数值增益、削弱与防御盾持续本场；控制时长、控制后免疫窗口、持续伤害跳数/间隔及单次触发不改成无限时长。\"\n    },\n    \"generatedBy\": \"tools/build-beasts.cjs\"\n  },\n  \"beasts\": [\n    {\n      \"id\": \"frost-moss-frog\",\n      \"name\": \"霜苔巨蛙\",\n      \"version\": 2,\n      \"originalName\": \"霜苔巨螈\",\n      \"style\": \"防御\",\n      \"elements\": [\n        \"木\",\n        \"冰\"\n      ],\n      \"statDice\": [\n        3,\n        2,\n        1,\n        10,\n        9,\n        9\n      ],\n      \"statRatios\": [\n        1.3,\n        1.05,\n        0.85,\n        2.25,\n        2.05,\n        2.05\n      ],\n      \"bloodline\": {\n        \"roll\": 3,\n        \"name\": \"凡血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"两栖纲·蛙类\",\n      \"size\": \"大（象鲸级）\",\n      \"sociality\": \"成对\",\n      \"actualAge\": \"约十四万年\",\n      \"habitat\": \"极北冻林最深处的活水沼——水面结壳，底下永远不冻。\",\n      \"appearance\": \"体形如伏地的巨蛙，背阔腹沉，通体覆一层会结霜的青苔。苔甲沿背脊木质化成脊板，板缝嵌冰壳；前肢短粗，后肢壮硕，趾间有蹼。头骨宽扁，口裂极大，双眼半埋苔层，只露出暗黄光点。它不动的时候，整只兽就是沼面上一块长苔的石头。\",\n      \"habits\": \"一年里大半时间伏在沼底不动，靠皮肤与苔甲缓慢吸取周围生机。它几乎不运使魂力，可被惊动时暴起极快。\",\n      \"role\": \"敌方——冻林守地兽。不主动离沼，但踏进它的沼面就别想走出来。\",\n      \"battleText\": \"沼面的青苔忽然隆起，冰壳沿着脊板接连崩裂。霜苔巨蛙睁开暗黄的眼，粗壮的后肢一撑，庞大的身躯便封住了退路。\",\n      \"defeatText\": \"苔甲层层剥落，巨蛙终于伏回冻沼。寒雾散去，一枚猩红魂环缓缓升起。\",\n      \"talents\": [\n        {\n          \"name\": \"苔甲覆霜\",\n          \"effect\": \"体表苔层吸寒变硬，短时间几乎吃不下物理攻击。\"\n        },\n        {\n          \"name\": \"霜沼拖拽\",\n          \"effect\": \"四肢陷泥时不能移动，但周围寒气会把靠近者一并冻住。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"苔甲覆霜\",\n          \"category\": \"防御\",\n          \"channel\": \"生命\",\n          \"target\": \"自己\",\n          \"effect\": \"生命护盾 647，持续整场战斗\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 145,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 8.5,\n          \"ring\": 1,\n          \"years\": 30000,\n          \"previewCost\": 145,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"木／冰\",\n          \"element\": \"木／冰\",\n          \"elements\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"frost-moss-frog-skill-1\",\n          \"skillIndex\": 1,\n          \"description\": \"苔甲吸寒凝霜，在体表结成生命护盾。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-moss-frog:skill:1\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"shield\",\n              \"channel\": \"生命\",\n              \"coefficient\": 0.45,\n              \"power\": \"Q*SA\",\n              \"lifetime\": \"battle\",\n              \"element\": \"木／冰\",\n              \"elements\": [\n                \"木\",\n                \"冰\"\n              ]\n            }\n          ],\n          \"statusLifetime\": \"battle\",\n          \"duration\": null,\n          \"shieldDuration\": null\n        },\n        {\n          \"name\": \"霜沼拖拽\",\n          \"category\": \"控制\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"基础控制 2.58秒；实际成功率与时长受双方精神力影响，结束后4秒免控\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 164,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 10,\n          \"ring\": 2,\n          \"years\": 30000,\n          \"previewCost\": 164,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"木／冰\",\n          \"element\": \"木／冰\",\n          \"elements\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"frost-moss-frog-skill-2\",\n          \"skillIndex\": 2,\n          \"description\": \"寒泥攀住目标四肢；控制成功后短暂冻结并打断蓄力。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-moss-frog:skill:2\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"control_contest\",\n              \"baseSeconds\": 2.575,\n              \"interrupt\": true,\n              \"immunitySeconds\": 4,\n              \"element\": \"木／冰\",\n              \"elements\": [\n                \"木\",\n                \"冰\"\n              ]\n            }\n          ],\n          \"baseControl\": 2.575\n        },\n        {\n          \"name\": \"冻沼撞击\",\n          \"category\": \"攻击\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理原始伤害 2131；命中后按防御力减伤\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 253,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 8.5,\n          \"ring\": 3,\n          \"years\": 30000,\n          \"effectSeed\": \"|3|30000|0\",\n          \"damageMode\": \"direct\",\n          \"attackSubtype\": \"direct\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 253,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"木／冰\",\n          \"element\": \"木／冰\",\n          \"elements\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"frost-moss-frog-skill-3\",\n          \"skillIndex\": 3,\n          \"description\": \"以覆满苔甲的庞大身躯猛撞目标，造成单次物理伤害。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-moss-frog:skill:3\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"direct_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.2,\n              \"element\": \"木／冰\",\n              \"elements\": [\n                \"木\",\n                \"冰\"\n              ]\n            }\n          ]\n        },\n        {\n          \"name\": \"生苔回息\",\n          \"category\": \"治疗\",\n          \"channel\": \"生命\",\n          \"target\": \"自己\",\n          \"effect\": \"回复生命 575，不超过最大值\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 145,\n          \"costFraction\": 0.15,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 10,\n          \"ring\": 4,\n          \"years\": 30000,\n          \"previewCost\": 145,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"木／冰\",\n          \"element\": \"木／冰\",\n          \"elements\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"frost-moss-frog-skill-4\",\n          \"skillIndex\": 4,\n          \"description\": \"苔层汲取沼中生机，回复自身生命。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-moss-frog:skill:4\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"heal\",\n              \"channel\": \"生命\",\n              \"coefficient\": 0.4,\n              \"power\": \"Q*SA\",\n              \"target\": \"self\",\n              \"allowOverheal\": false,\n              \"element\": \"木／冰\",\n              \"elements\": [\n                \"木\",\n                \"冰\"\n              ]\n            }\n          ]\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"frost-moss-immunity\",\n          \"name\": \"霜苔不侵\",\n          \"effect\": \"冰属性伤害完全免疫，并改为回复等量生命；免疫全部减速、冻结、迟缓类效果，不参与判定。受击时叠加封寒：冰属性攻击叠2层，非冰攻击叠1层；每层提供原始生命5%的护盾，累计不超过原始生命的50%。原始生命指魂兽定义面板，不含讨伐血量倍率；玩家继承时按自身最大生命计算。非冰属性越盾真伤不受减免。\",\n          \"params\": {\n            \"iceDamageImmunity\": true,\n            \"iceDamageToHealing\": 1,\n            \"immuneTags\": [\n              \"slow\",\n              \"freeze\",\n              \"sluggish\"\n            ],\n            \"iceHitStacks\": 2,\n            \"otherHitStacks\": 1,\n            \"shieldPerStackBaseHealth\": 0.05,\n            \"shieldCapBaseHealth\": 0.5,\n            \"shieldBasis\": \"original-panel-hp\",\n            \"maxStacks\": 10,\n            \"shieldMode\": \"stack-capacity\"\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:frost-moss-immunity\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:frost-moss-immunity\",\n            \"implementationVersion\": 1,\n            \"name\": \"霜苔不侵\",\n            \"effect\": \"冰属性伤害完全免疫，并改为回复等量生命；免疫全部减速、冻结、迟缓类效果，不参与判定。受击时叠加封寒：冰属性攻击叠2层，非冰攻击叠1层；每层提供原始生命5%的护盾，累计不超过原始生命的50%。原始生命指魂兽定义面板，不含讨伐血量倍率；玩家继承时按自身最大生命计算。非冰属性越盾真伤不受减免。\",\n            \"params\": {\n              \"iceDamageImmunity\": true,\n              \"iceDamageToHealing\": 1,\n              \"immuneTags\": [\n                \"slow\",\n                \"freeze\",\n                \"sluggish\"\n              ],\n              \"iceHitStacks\": 2,\n              \"otherHitStacks\": 1,\n              \"shieldPerStackBaseHealth\": 0.05,\n              \"shieldCapBaseHealth\": 0.5,\n              \"shieldBasis\": \"original-panel-hp\",\n              \"maxStacks\": 10,\n              \"shieldMode\": \"stack-capacity\",\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        },\n        {\n          \"id\": \"moss-armor-accumulation\",\n          \"name\": \"苔甲凝积\",\n          \"effect\": \"每次实际受创叠1层苔凝，每层永久提高防御素质10%、肉体强度5%，上限12层；每满4层额外获得5%固定减伤，最多15%。持续伤害不叠层。\",\n          \"params\": {\n            \"trigger\": \"actual-damage-received\",\n            \"excludeDamageTags\": [\n              \"dot\"\n            ],\n            \"defensePerStack\": 0.1,\n            \"bodyPerStack\": 0.05,\n            \"maxStacks\": 12,\n            \"reductionEveryStacks\": 4,\n            \"reductionPerStep\": 0.05,\n            \"maxReduction\": 0.15,\n            \"stackLifetime\": \"permanent\",\n            \"saveFields\": [\n              \"mossStacks\"\n            ]\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:moss-armor-accumulation\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:moss-armor-accumulation\",\n            \"implementationVersion\": 1,\n            \"name\": \"苔甲凝积\",\n            \"effect\": \"每次实际受创叠1层苔凝，每层永久提高防御素质10%、肉体强度5%，上限12层；每满4层额外获得5%固定减伤，最多15%。持续伤害不叠层。\",\n            \"params\": {\n              \"trigger\": \"actual-damage-received\",\n              \"excludeDamageTags\": [\n                \"dot\"\n              ],\n              \"defensePerStack\": 0.1,\n              \"bodyPerStack\": 0.05,\n              \"maxStacks\": 12,\n              \"reductionEveryStacks\": 4,\n              \"reductionPerStep\": 0.05,\n              \"maxReduction\": 0.15,\n              \"stackLifetime\": \"permanent\",\n              \"saveFields\": [\n                \"mossStacks\"\n              ],\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": [\n                \"mossStacks\"\n              ]\n            }\n          }\n        }\n      ],\n      \"years\": 100000,\n      \"available\": true,\n      \"battleTags\": [\n        \"hunt\"\n      ],\n      \"lifeType\": \"生活\",\n      \"level\": 91,\n      \"panel\": {\n        \"level\": 91,\n        \"rings\": 9,\n        \"benchmark\": 500,\n        \"ratingProfile\": \"npc\",\n        \"stats\": {\n          \"B\": 650,\n          \"S\": 525,\n          \"C\": 425,\n          \"D\": 1125,\n          \"A\": 1025,\n          \"P\": 1025,\n          \"W\": 77\n        },\n        \"derived\": {\n          \"HP\": 4770,\n          \"baseMP\": 2685,\n          \"MP\": 4028,\n          \"SH\": 8420,\n          \"PA\": 563.75,\n          \"SA\": 456.25,\n          \"MA\": 830,\n          \"DEF\": 702.5,\n          \"MDEF\": 545.6,\n          \"costReduction\": 32.5,\n          \"castReduction\": 30,\n          \"controlGrowth\": 2.5\n        },\n        \"rating\": \"强级\",\n        \"ratingScore\": 1.59\n      },\n      \"statBasis\": {\n        \"level\": 91,\n        \"benchmark\": 500,\n        \"W\": 77,\n        \"ratios\": [\n          1.3,\n          1.05,\n          0.85,\n          2.25,\n          2.05,\n          2.05\n        ],\n        \"bloodlineModifiesStats\": false,\n        \"note\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\"\n      },\n      \"skillPowerBasis\": {\n        \"stat\": \"S\",\n        \"value\": 525,\n        \"benchmark\": 500,\n        \"ratio\": 1.05,\n        \"rating\": \"并级\",\n        \"label\": \"万年第二档\",\n        \"years\": 30000,\n        \"q\": 3.15\n      },\n      \"traitInheritanceVersion\": 1,\n      \"ringReward\": {\n        \"years\": 100000,\n        \"description\": \"十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技\"\n      },\n      \"bone\": {\n        \"slot\": \"random\",\n        \"slotPolicy\": \"prefer-unoccupied-six\",\n        \"description\": \"胜利后优先在未装备且未携带的常规部位中等概率抽取，六部位齐备才在全部六部位抽取；不生成外附骨，结果随奖励事务保存\"\n      },\n      \"exitRule\": \"hp-or-spirit-zero\",\n      \"implementation\": {\n        \"status\": \"host-integrated-v1205\",\n        \"hostIntegrated\": true,\n        \"skills\": \"operations-live\",\n        \"traits\": \"live\",\n        \"inheritanceHandlers\": \"live\"\n      }\n    },\n    {\n      \"id\": \"frost-gnat\",\n      \"name\": \"霜蚋\",\n      \"version\": 1,\n      \"style\": \"敏攻\",\n      \"elements\": [\n        \"冰\"\n      ],\n      \"statDice\": [\n        9,\n        6,\n        1,\n        5,\n        10,\n        8\n      ],\n      \"statRatios\": [\n        2.05,\n        1.63,\n        0.85,\n        1.55,\n        2.25,\n        1.82\n      ],\n      \"bloodline\": {\n        \"roll\": 2,\n        \"name\": \"凡血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"虫类·蚋（双翅目）\",\n      \"size\": \"微（指掌以下）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"不可考，换过太多次壳\",\n      \"habitat\": \"冰原裂隙与积雪层下的暖缝，那一线不结冰的缝就是它的领地。\",\n      \"appearance\": \"体长不足三分，通体冰蓝半透，翅薄如霜且几乎不反光。飞行时肉眼只能看到一点雪屑似的浮动。口器细长如针，腹末两根短刺。\",\n      \"habits\": \"终生独居，不结群、不筑巢。以极高速度在雪面跳点，用口针吸取体温与少量魂力；极惧光，日间深藏隙中。\",\n      \"role\": \"异种·首领——体型最小、最难打的十万年魂兽。\",\n      \"battleText\": \"一粒雪屑停在你的感知边缘，下一瞬却已掠至近前。冰蓝的薄翅无声展开，脚下的雪地渐渐凝成霜域。\",\n      \"defeatText\": \"薄翅终于停止震颤，最后一层冰壳碎成细雪。霜域消退，猩红魂环在雪面上凝聚。\",\n      \"talents\": [\n        {\n          \"name\": \"霜针\",\n          \"effect\": \"口器刺入时注入寒气，伤口不流血而是结霜。\"\n        },\n        {\n          \"name\": \"雪屑掩形\",\n          \"effect\": \"高速移动时翅膜散出细霜，短时间内难以锁定其位置。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"霜针\",\n          \"category\": \"攻击\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理原始伤害 4013；命中后按防御力减伤\",\n          \"q\": 3.8,\n          \"K\": 1,\n          \"Q\": 3.8,\n          \"cost\": 444,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.37,\n          \"cooldown\": 9.5,\n          \"ring\": 1,\n          \"years\": 70000,\n          \"effectSeed\": \"|1|70000|0\",\n          \"damageMode\": \"direct\",\n          \"attackSubtype\": \"direct\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 444,\n          \"previewCast\": 1.37,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"冰\",\n          \"element\": \"冰\",\n          \"elements\": [\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"frost-gnat-skill-1\",\n          \"skillIndex\": 1,\n          \"description\": \"掠近目标，以冰针般的口器完成一次迅疾刺击。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-gnat:skill:1\",\n          \"strengthReference\": {\n            \"years\": 70000,\n            \"band\": \"万年第四档\",\n            \"rating\": \"凶级\",\n            \"q\": 3.8,\n            \"K\": 1,\n            \"Q\": 3.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"direct_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.2,\n              \"element\": \"冰\",\n              \"elements\": [\n                \"冰\"\n              ]\n            }\n          ]\n        },\n        {\n          \"name\": \"雪屑掩形\",\n          \"category\": \"强化\",\n          \"channel\": \"物理\",\n          \"target\": \"自己\",\n          \"effect\": \"自身敏捷提高45.6%，持续整场，同技能不叠加\",\n          \"q\": 3.8,\n          \"K\": 1,\n          \"Q\": 3.8,\n          \"cost\": 232,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.37,\n          \"cooldown\": 9.5,\n          \"ring\": 2,\n          \"years\": 70000,\n          \"previewCost\": 232,\n          \"previewCast\": 1.37,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"冰\",\n          \"element\": \"冰\",\n          \"elements\": [\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"frost-gnat-skill-2\",\n          \"skillIndex\": 2,\n          \"description\": \"翅膜散霜，借细雪遮掩行迹，提高自身敏捷。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-gnat:skill:2\",\n          \"strengthReference\": {\n            \"years\": 70000,\n            \"band\": \"万年第四档\",\n            \"rating\": \"凶级\",\n            \"q\": 3.8,\n            \"K\": 1,\n            \"Q\": 3.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"battle_stat_up\",\n              \"values\": {\n                \"A\": 0.456\n              },\n              \"lifetime\": \"battle\",\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"refillResources\": false,\n              \"element\": \"冰\",\n              \"elements\": [\n                \"冰\"\n              ]\n            }\n          ],\n          \"agility\": 0.456,\n          \"statusLifetime\": \"battle\",\n          \"duration\": null\n        },\n        {\n          \"name\": \"寒痕入骨\",\n          \"category\": \"持续伤害\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理总原始伤害 4682，分3次每3秒一跳，同技能不叠层\",\n          \"q\": 3.8,\n          \"K\": 1,\n          \"Q\": 3.8,\n          \"cost\": 497,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.37,\n          \"cooldown\": 9.5,\n          \"ring\": 3,\n          \"years\": 70000,\n          \"damageNature\": \"residual\",\n          \"effectSeed\": \"|3|70000|0\",\n          \"damageMode\": \"periodic\",\n          \"attackSubtype\": \"periodic\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 497,\n          \"previewCast\": 1.37,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"冰\",\n          \"element\": \"冰\",\n          \"elements\": [\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"frost-gnat-skill-3\",\n          \"skillIndex\": 3,\n          \"description\": \"将寒气留在创口，分三次侵蚀目标，不重复叠加同一寒痕。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-gnat:skill:3\",\n          \"strengthReference\": {\n            \"years\": 70000,\n            \"band\": \"万年第四档\",\n            \"rating\": \"凶级\",\n            \"q\": 3.8,\n            \"K\": 1,\n            \"Q\": 3.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"periodic_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.4,\n              \"parts\": 3,\n              \"intervalSeconds\": 3,\n              \"element\": \"冰\",\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"elements\": [\n                \"冰\"\n              ]\n            }\n          ]\n        },\n        {\n          \"name\": \"掠影断脉\",\n          \"category\": \"控制\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"基础控制 2.9秒；实际成功率与时长受双方精神力影响，结束后4秒免控\",\n          \"q\": 3.8,\n          \"K\": 1,\n          \"Q\": 3.8,\n          \"cost\": 267,\n          \"costFraction\": 0.15,\n          \"highest\": false,\n          \"cast\": 1.37,\n          \"cooldown\": 10,\n          \"ring\": 4,\n          \"years\": 70000,\n          \"previewCost\": 267,\n          \"previewCast\": 1.37,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"冰\",\n          \"element\": \"冰\",\n          \"elements\": [\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"frost-gnat-skill-4\",\n          \"skillIndex\": 4,\n          \"description\": \"疾掠时刺向魂力流转的间隙；判定成功后短暂打断并控制目标。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-gnat:skill:4\",\n          \"strengthReference\": {\n            \"years\": 70000,\n            \"band\": \"万年第四档\",\n            \"rating\": \"凶级\",\n            \"q\": 3.8,\n            \"K\": 1,\n            \"Q\": 3.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"control_contest\",\n              \"baseSeconds\": 2.9,\n              \"interrupt\": true,\n              \"immunitySeconds\": 4,\n              \"element\": \"冰\",\n              \"elements\": [\n                \"冰\"\n              ]\n            }\n          ],\n          \"baseControl\": 2.9\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"ice-shell-preservation\",\n          \"name\": \"冰壳护生\",\n          \"effect\": \"战斗开始时，获得相当于自身生命值40%的护盾。护盾被击破时，向攻击者反弹该护盾已吸收伤害的30%，冰屑穿透护盾；越盾真伤无视冰壳。护盾只结一次，不会自行重结或叠加。\",\n          \"params\": {\n            \"battleStartShieldMaxHPRate\": 0.4,\n            \"shieldBasis\": \"own-max-hp\",\n            \"maxLayers\": 1,\n            \"reflectionRate\": 0.3,\n            \"reflectionElement\": \"冰\",\n            \"reflectionBypassShield\": true,\n            \"bypassedByTags\": [\n              \"shield-bypass-true-damage\"\n            ]\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:ice-shell-preservation\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:ice-shell-preservation\",\n            \"implementationVersion\": 1,\n            \"name\": \"冰壳护生\",\n            \"effect\": \"战斗开始时，获得相当于自身生命值40%的护盾。护盾被击破时，向攻击者反弹该护盾已吸收伤害的30%，冰屑穿透护盾；越盾真伤无视冰壳。护盾只结一次，不会自行重结或叠加。\",\n            \"params\": {\n              \"battleStartShieldMaxHPRate\": 0.4,\n              \"shieldBasis\": \"own-max-hp\",\n              \"maxLayers\": 1,\n              \"reflectionRate\": 0.3,\n              \"reflectionElement\": \"冰\",\n              \"reflectionBypassShield\": true,\n              \"bypassedByTags\": [\n                \"shield-bypass-true-damage\"\n              ],\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        },\n        {\n          \"id\": \"frost-domain\",\n          \"name\": \"霜域\",\n          \"effect\": \"展开不可驱散的霜域，持续整场。每档使敌方单位敏捷降低2%、行动条速度降低4%，友方单位（含自身）敏捷提高4%；每1个自身回合加深一档，最多3档。达到3档后，每次加深不再提高这些数值，改为：友方单位（含自身）获得相当于其生命上限2%的寒冰护盾，敌方单位承受相当于其生命上限2%的伤害（按生命上限计算，不经过防御衰减）。驱散技能可压住霜域一个自身回合。\",\n          \"params\": {\n            \"lifetime\": \"battle\",\n            \"dispellable\": false,\n            \"suppressibleByDispelOwnerTurns\": 1,\n            \"enemyAgilityDownPerTier\": 0.02,\n            \"enemyGaugeSpeedDownPerTier\": 0.04,\n            \"allyAgilityUpPerTier\": 0.04,\n            \"maxTier\": 3,\n            \"deepenEveryOwnerTurns\": 1,\n            \"tierThreeAllyShieldMaxHPRate\": 0.02,\n            \"tierThreeEnemyDamageMaxHPRate\": 0.02,\n            \"tierThreeDamageBasis\": \"max-hp\",\n            \"tierThreeDamageMitigation\": \"none\"\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:frost-domain\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:frost-domain\",\n            \"implementationVersion\": 1,\n            \"name\": \"霜域\",\n            \"effect\": \"展开不可驱散的霜域，持续整场。每档使敌方单位敏捷降低2%、行动条速度降低4%，友方单位（含自身）敏捷提高4%；每1个自身回合加深一档，最多3档。达到3档后，每次加深不再提高这些数值，改为：友方单位（含自身）获得相当于其生命上限2%的寒冰护盾，敌方单位承受相当于其生命上限2%的伤害（按生命上限计算，不经过防御衰减）。驱散技能可压住霜域一个自身回合。\",\n            \"params\": {\n              \"lifetime\": \"battle\",\n              \"dispellable\": false,\n              \"suppressibleByDispelOwnerTurns\": 1,\n              \"enemyAgilityDownPerTier\": 0.02,\n              \"enemyGaugeSpeedDownPerTier\": 0.04,\n              \"allyAgilityUpPerTier\": 0.04,\n              \"maxTier\": 3,\n              \"deepenEveryOwnerTurns\": 1,\n              \"tierThreeAllyShieldMaxHPRate\": 0.02,\n              \"tierThreeEnemyDamageMaxHPRate\": 0.02,\n              \"tierThreeDamageBasis\": \"max-hp\",\n              \"tierThreeDamageMitigation\": \"none\",\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        }\n      ],\n      \"years\": 100000,\n      \"available\": true,\n      \"battleTags\": [\n        \"hunt\"\n      ],\n      \"lifeType\": \"生活\",\n      \"level\": 91,\n      \"panel\": {\n        \"level\": 91,\n        \"rings\": 9,\n        \"benchmark\": 500,\n        \"ratingProfile\": \"npc\",\n        \"stats\": {\n          \"B\": 1025,\n          \"S\": 815,\n          \"C\": 425,\n          \"D\": 775,\n          \"A\": 1125,\n          \"P\": 910,\n          \"W\": 77\n        },\n        \"derived\": {\n          \"HP\": 7395,\n          \"baseMP\": 4135,\n          \"MP\": 6203,\n          \"SH\": 7500,\n          \"PA\": 880,\n          \"SA\": 702.75,\n          \"MA\": 738,\n          \"DEF\": 602.5,\n          \"MDEF\": 488.1,\n          \"costReduction\": 32.5,\n          \"castReduction\": 30,\n          \"controlGrowth\": 2.5\n        },\n        \"rating\": \"凶级\",\n        \"ratingScore\": 1.69\n      },\n      \"statBasis\": {\n        \"level\": 91,\n        \"benchmark\": 500,\n        \"W\": 77,\n        \"ratios\": [\n          2.05,\n          1.63,\n          0.85,\n          1.55,\n          2.25,\n          1.82\n        ],\n        \"bloodlineModifiesStats\": false,\n        \"note\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\"\n      },\n      \"skillPowerBasis\": {\n        \"stat\": \"S\",\n        \"value\": 815,\n        \"benchmark\": 500,\n        \"ratio\": 1.63,\n        \"rating\": \"凶级\",\n        \"label\": \"万年第四档\",\n        \"years\": 70000,\n        \"q\": 3.8\n      },\n      \"traitInheritanceVersion\": 1,\n      \"ringReward\": {\n        \"years\": 100000,\n        \"description\": \"十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技\"\n      },\n      \"bone\": {\n        \"slot\": \"random\",\n        \"slotPolicy\": \"prefer-unoccupied-six\",\n        \"description\": \"胜利后优先在未装备且未携带的常规部位中等概率抽取，六部位齐备才在全部六部位抽取；不生成外附骨，结果随奖励事务保存\"\n      },\n      \"exitRule\": \"hp-or-spirit-zero\",\n      \"implementation\": {\n        \"status\": \"host-integrated-v1205\",\n        \"hostIntegrated\": true,\n        \"skills\": \"operations-live\",\n        \"traits\": \"live\",\n        \"inheritanceHandlers\": \"live\"\n      }\n    },\n    {\n      \"id\": \"abyss-imperial-salamander\",\n      \"name\": \"沧渊帝螈\",\n      \"version\": 1,\n      \"style\": \"控制\",\n      \"elements\": [\n        \"水\"\n      ],\n      \"statDice\": [\n        8,\n        10,\n        2,\n        4,\n        8,\n        7\n      ],\n      \"statRatios\": [\n        1.82,\n        2.25,\n        1.05,\n        1.4,\n        1.82,\n        1.72\n      ],\n      \"bloodline\": {\n        \"roll\": 9,\n        \"name\": \"帝血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"两栖纲·鲵\",\n      \"size\": \"中（马牛级）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"约十二万年\",\n      \"habitat\": \"地下暗河汇成的深潭，水面常年浮一层不散的白气。\",\n      \"appearance\": \"大小如牛犊的鲵，通体青灰近墨，皮肤湿滑。头部两侧生有鳍状冠，冠缘不断逸出淡蓝色光雾。\",\n      \"habits\": \"独居且极静，魂力庞大而难以收束。泄露的魂力驱动附近水流，自行形成压迫与吸取。\",\n      \"role\": \"首领——深潭区域的唯一强敌，擅长把战斗拖长到自己回满。\",\n      \"battleText\": \"潭底亮起两道幽光，逸散的魂力令四周水汽骤然下沉。沧渊帝螈浮出暗河，鳍冠间的蓝雾正牵动整片深潭。\",\n      \"defeatText\": \"鳍冠间的蓝雾渐渐熄灭，沉重的水压终于散去。沧渊帝螈伏入浅水，猩红魂环随涟漪升起。\",\n      \"talents\": [\n        {\n          \"name\": \"沧澜压\",\n          \"effect\": \"潭水骤然加重，范围内所有单位的读条与行动被拖慢。\"\n        },\n        {\n          \"name\": \"引潮\",\n          \"effect\": \"外泄魂力自行抽取周围单位逸散的魂力，补回自身。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"沧澜压\",\n          \"category\": \"控制\",\n          \"channel\": \"能量\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"基础控制 3秒；实际成功率与时长受双方精神力影响，结束后4秒免控\",\n          \"q\": 4.5,\n          \"K\": 1,\n          \"Q\": 4.5,\n          \"cost\": 345,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.47,\n          \"cooldown\": 12,\n          \"ring\": 1,\n          \"years\": 100000,\n          \"previewCost\": 345,\n          \"previewCast\": 1.47,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"水\",\n          \"element\": \"水\",\n          \"elements\": [\n            \"水\"\n          ],\n          \"attributeTags\": [\n            \"水\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"abyss-imperial-salamander-skill-1\",\n          \"skillIndex\": 1,\n          \"description\": \"将水压收束在一名敌人身上，控制成功后打断其行动。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"abyss-imperial-salamander:skill:1\",\n          \"strengthReference\": {\n            \"years\": 100000,\n            \"band\": \"十万年档\",\n            \"rating\": \"神级\",\n            \"q\": 4.5,\n            \"K\": 1,\n            \"Q\": 4.5,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"control_contest\",\n              \"baseSeconds\": 3,\n              \"interrupt\": true,\n              \"immunitySeconds\": 4,\n              \"element\": \"水\",\n              \"elements\": [\n                \"水\"\n              ]\n            }\n          ],\n          \"baseControl\": 3\n        },\n        {\n          \"name\": \"潭流冲击\",\n          \"category\": \"攻击\",\n          \"channel\": \"能量\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"能量原始伤害 5218；命中后按防御力减伤\",\n          \"q\": 4.5,\n          \"K\": 1,\n          \"Q\": 4.5,\n          \"cost\": 614,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.47,\n          \"cooldown\": 12,\n          \"ring\": 2,\n          \"years\": 100000,\n          \"effectSeed\": \"|2|100000|0\",\n          \"damageMode\": \"direct\",\n          \"attackSubtype\": \"direct\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 614,\n          \"previewCast\": 1.47,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"水\",\n          \"element\": \"水\",\n          \"elements\": [\n            \"水\"\n          ],\n          \"attributeTags\": [\n            \"水\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"abyss-imperial-salamander-skill-2\",\n          \"skillIndex\": 2,\n          \"description\": \"释放一道沉重水流，造成单次能量伤害。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"abyss-imperial-salamander:skill:2\",\n          \"strengthReference\": {\n            \"years\": 100000,\n            \"band\": \"十万年档\",\n            \"rating\": \"神级\",\n            \"q\": 4.5,\n            \"K\": 1,\n            \"Q\": 4.5,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"direct_attack\",\n              \"channel\": \"能量\",\n              \"factor\": 1.2,\n              \"element\": \"水\",\n              \"elements\": [\n                \"水\"\n              ]\n            }\n          ]\n        },\n        {\n          \"name\": \"滞水缠身\",\n          \"category\": \"减益\",\n          \"channel\": \"能量\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"目标敏捷降低45%，持续整场战斗；按双方精神力与稳定进行减益判定\",\n          \"q\": 4.5,\n          \"K\": 1,\n          \"Q\": 4.5,\n          \"cost\": 297,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.47,\n          \"cooldown\": 12,\n          \"ring\": 3,\n          \"years\": 100000,\n          \"previewCost\": 297,\n          \"previewCast\": 1.47,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"水\",\n          \"element\": \"水\",\n          \"elements\": [\n            \"水\"\n          ],\n          \"attributeTags\": [\n            \"水\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"abyss-imperial-salamander-skill-3\",\n          \"skillIndex\": 3,\n          \"description\": \"黏滞水流缠住目标，精神对抗成功后降低其敏捷。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"abyss-imperial-salamander:skill:3\",\n          \"strengthReference\": {\n            \"years\": 100000,\n            \"band\": \"十万年档\",\n            \"rating\": \"神级\",\n            \"q\": 4.5,\n            \"K\": 1,\n            \"Q\": 4.5,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"numeric_debuff\",\n              \"values\": {\n                \"A\": 0.45\n              },\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"contest\": \"spirit-and-stability\",\n              \"lifetime\": \"battle\",\n              \"element\": \"水\",\n              \"elements\": [\n                \"水\"\n              ]\n            }\n          ],\n          \"statusLifetime\": \"battle\",\n          \"duration\": null\n        },\n        {\n          \"name\": \"回潮护身\",\n          \"category\": \"防御\",\n          \"channel\": \"生命\",\n          \"target\": \"自己\",\n          \"effect\": \"生命护盾 1957，持续整场战斗\",\n          \"q\": 4.5,\n          \"K\": 1,\n          \"Q\": 4.5,\n          \"cost\": 273,\n          \"costFraction\": 0.15,\n          \"highest\": false,\n          \"cast\": 1.47,\n          \"cooldown\": 12,\n          \"ring\": 4,\n          \"years\": 100000,\n          \"previewCost\": 273,\n          \"previewCast\": 1.47,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"水\",\n          \"element\": \"水\",\n          \"elements\": [\n            \"水\"\n          ],\n          \"attributeTags\": [\n            \"水\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"abyss-imperial-salamander-skill-4\",\n          \"skillIndex\": 4,\n          \"description\": \"以回旋水流包覆身体，生成生命护盾。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"abyss-imperial-salamander:skill:4\",\n          \"strengthReference\": {\n            \"years\": 100000,\n            \"band\": \"十万年档\",\n            \"rating\": \"神级\",\n            \"q\": 4.5,\n            \"K\": 1,\n            \"Q\": 4.5,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"shield\",\n              \"channel\": \"生命\",\n              \"coefficient\": 0.45,\n              \"power\": \"Q*SA\",\n              \"lifetime\": \"battle\",\n              \"element\": \"水\",\n              \"elements\": [\n                \"水\"\n              ]\n            }\n          ],\n          \"statusLifetime\": \"battle\",\n          \"duration\": null,\n          \"shieldDuration\": null\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"oppressive-tides\",\n          \"name\": \"沧澜压境\",\n          \"effect\": \"每次受到攻击后，对攻击者施加滞流：读条速度降低20%、行动条速度降低15%，持续6秒，可叠3层；同时该目标本回合魂力消耗提高30%。无魂力单位只受减速，不受费用惩罚。\",\n          \"params\": {\n            \"trigger\": \"attack-received\",\n            \"castSpeedDownPerStack\": 0.2,\n            \"gaugeSpeedDownPerStack\": 0.15,\n            \"maxStacks\": 3,\n            \"durationSeconds\": 6,\n            \"costUp\": 0.3,\n            \"costDuration\": \"target-current-turn\",\n            \"excludeResourceFreeUnits\": true\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:oppressive-tides\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:oppressive-tides\",\n            \"implementationVersion\": 1,\n            \"name\": \"沧澜压境\",\n            \"effect\": \"每次受到攻击后，对攻击者施加滞流：读条速度降低20%、行动条速度降低15%，持续6秒，可叠3层；同时该目标本回合魂力消耗提高30%。无魂力单位只受减速，不受费用惩罚。\",\n            \"params\": {\n              \"trigger\": \"attack-received\",\n              \"castSpeedDownPerStack\": 0.2,\n              \"gaugeSpeedDownPerStack\": 0.15,\n              \"maxStacks\": 3,\n              \"durationSeconds\": 6,\n              \"costUp\": 0.3,\n              \"costDuration\": \"target-current-turn\",\n              \"excludeResourceFreeUnits\": true,\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        },\n        {\n          \"id\": \"devouring-soul-recovery\",\n          \"name\": \"吞噬回魂\",\n          \"effect\": \"每回合结束回复最大魂力8%。场上任一单位消耗魂力时，吸收其实际消耗量的30%转为自身魂力。魂力满溢部分转为护盾，每回合最多生成最大生命10%的护盾。被封锁或禁绝效果命中时，该回合不吸收。\",\n          \"params\": {\n            \"endTurnMaxMPRate\": 0.08,\n            \"manaSpentSiphonRate\": 0.3,\n            \"manaSpentScope\": \"all-units-including-self\",\n            \"overflowShieldRate\": 1,\n            \"overflowShieldPerTurnMaxHP\": 0.1,\n            \"sealTags\": [\n              \"resource_seal\",\n              \"resource_prohibition\"\n            ],\n            \"siphonTransfersOpponentMana\": false,\n            \"resourceRecoveryTriggersSiphon\": false\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:devouring-soul-recovery\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:devouring-soul-recovery\",\n            \"implementationVersion\": 1,\n            \"name\": \"吞噬回魂\",\n            \"effect\": \"每回合结束回复最大魂力8%。场上任一单位消耗魂力时，吸收其实际消耗量的30%转为自身魂力。魂力满溢部分转为护盾，每回合最多生成最大生命10%的护盾。被封锁或禁绝效果命中时，该回合不吸收。\",\n            \"params\": {\n              \"endTurnMaxMPRate\": 0.08,\n              \"manaSpentSiphonRate\": 0.3,\n              \"manaSpentScope\": \"all-units-including-self\",\n              \"overflowShieldRate\": 1,\n              \"overflowShieldPerTurnMaxHP\": 0.1,\n              \"sealTags\": [\n                \"resource_seal\",\n                \"resource_prohibition\"\n              ],\n              \"siphonTransfersOpponentMana\": false,\n              \"resourceRecoveryTriggersSiphon\": false,\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        }\n      ],\n      \"years\": 100000,\n      \"available\": true,\n      \"battleTags\": [\n        \"hunt\"\n      ],\n      \"lifeType\": \"生活\",\n      \"level\": 91,\n      \"panel\": {\n        \"level\": 91,\n        \"rings\": 9,\n        \"benchmark\": 500,\n        \"ratingProfile\": \"npc\",\n        \"stats\": {\n          \"B\": 910,\n          \"S\": 1125,\n          \"C\": 525,\n          \"D\": 700,\n          \"A\": 910,\n          \"P\": 860,\n          \"W\": 77\n        },\n        \"derived\": {\n          \"HP\": 6590,\n          \"baseMP\": 5685,\n          \"MP\": 8528,\n          \"SH\": 7100,\n          \"PA\": 882.75,\n          \"SA\": 966.25,\n          \"MA\": 698,\n          \"DEF\": 542,\n          \"MDEF\": 463.1,\n          \"costReduction\": 40,\n          \"castReduction\": 30,\n          \"controlGrowth\": 2.5\n        },\n        \"rating\": \"凶级\",\n        \"ratingScore\": 1.68\n      },\n      \"statBasis\": {\n        \"level\": 91,\n        \"benchmark\": 500,\n        \"W\": 77,\n        \"ratios\": [\n          1.82,\n          2.25,\n          1.05,\n          1.4,\n          1.82,\n          1.72\n        ],\n        \"bloodlineModifiesStats\": false,\n        \"note\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\"\n      },\n      \"skillPowerBasis\": {\n        \"stat\": \"S\",\n        \"value\": 1125,\n        \"benchmark\": 500,\n        \"ratio\": 2.25,\n        \"rating\": \"神级\",\n        \"label\": \"十万年档\",\n        \"years\": 100000,\n        \"q\": 4.5\n      },\n      \"traitInheritanceVersion\": 1,\n      \"ringReward\": {\n        \"years\": 100000,\n        \"description\": \"十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技\"\n      },\n      \"bone\": {\n        \"slot\": \"random\",\n        \"slotPolicy\": \"prefer-unoccupied-six\",\n        \"description\": \"胜利后优先在未装备且未携带的常规部位中等概率抽取，六部位齐备才在全部六部位抽取；不生成外附骨，结果随奖励事务保存\"\n      },\n      \"exitRule\": \"hp-or-spirit-zero\",\n      \"implementation\": {\n        \"status\": \"host-integrated-v1205\",\n        \"hostIntegrated\": true,\n        \"skills\": \"operations-live\",\n        \"traits\": \"live\",\n        \"inheritanceHandlers\": \"live\"\n      }\n    },\n    {\n      \"id\": \"fu-yue-ju-rong-yuan\",\n      \"name\": \"负岳蝾螈\",\n      \"version\": 2,\n      \"style\": \"防御\",\n      \"elements\": [\n        \"土\"\n      ],\n      \"statDice\": [\n        8,\n        2,\n        3,\n        8,\n        1,\n        9\n      ],\n      \"statRatios\": [\n        1.82,\n        1.05,\n        1.3,\n        1.82,\n        0.85,\n        2.05\n      ],\n      \"bloodline\": {\n        \"roll\": 6,\n        \"name\": \"灵血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"两栖纲·巨型蝾螈\",\n      \"size\": \"大（象鲸级）\",\n      \"sociality\": \"成对\",\n      \"actualAge\": \"约十八万年\",\n      \"habitat\": \"西极地脉裂谷尽头的泥沼——沼底压着一条断掉的龙脉，泥水终年温热。\",\n      \"appearance\": \"一头放大了上千倍的蝾螈。头骨宽扁，口裂横贯半张脸，眼退成两点浑浊的琥珀；四肢短粗，趾间厚蹼，尾侧扁如桨。背脊覆着一层层土黄的岩甲，甲缝嵌着碎石与苔，远看就是一座伏在沼里的石丘。皮肤终年渗着温热的泥浆，它爬过的地方会留下一条慢慢合拢的沟。\",\n      \"habits\": \"极慢。伏在沼底时与一块长苔的礁石没有分别，靠皮肤与岩甲一点点汲取地脉之气。不捕不猎，十万年里只做一件事——把背上那层越积越厚的岩甲负稳。它不追人，只把路“坐断”。\",\n      \"role\": \"敌方——地脉守门兽。站在必经之路上，绕不过，也推不动。\",\n      \"battleText\": \"整片泥沼忽然下沉半尺。背甲上的苔土层层剥落，一座山的影子从沼底缓缓升起——负岳蝾螈抬起头，泥水顺着宽扁的头骨往下淌，像一道倒流的瀑布。\",\n      \"defeatText\": \"背上的岳影终于崩散，碎石如雨落回泥沼。负岳蝾螈伏低宽扁的头，十万年不肯放下的那口气，随一声闷响散进地脉。\",\n      \"talents\": [\n        {\n          \"name\": \"岳甲覆身\",\n          \"effect\": \"甲缝渗出的黄雾裹住躯体，土石自行攀附，结成一层越来越厚的甲。\"\n        },\n        {\n          \"name\": \"裂地摆尾\",\n          \"effect\": \"扁尾横扫，沼底的地脉被整条掀了起来。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"岳甲覆身\",\n          \"category\": \"防御\",\n          \"channel\": \"生命\",\n          \"target\": \"自己\",\n          \"effect\": \"生命护盾 647，持续整场战斗\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 129,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 8.5,\n          \"ring\": 1,\n          \"years\": 30000,\n          \"previewCost\": 129,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"土\",\n          \"element\": \"土\",\n          \"elements\": [\n            \"土\"\n          ],\n          \"attributeTags\": [\n            \"土\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"fu-yue-ju-rong-yuan-skill-1\",\n          \"skillIndex\": 1,\n          \"description\": \"甲缝涌出的黄雾裹住全身，土石层层攀附，结成一面越来越厚的生命护盾。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"fu-yue-ju-rong-yuan:skill:1\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"shield\",\n              \"channel\": \"生命\",\n              \"coefficient\": 0.45,\n              \"power\": \"Q*SA\",\n              \"lifetime\": \"battle\",\n              \"element\": \"土\",\n              \"elements\": [\n                \"土\"\n              ]\n            }\n          ],\n          \"statusLifetime\": \"battle\",\n          \"duration\": null,\n          \"shieldDuration\": null\n        },\n        {\n          \"name\": \"地脉贯石\",\n          \"category\": \"攻击\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理原始伤害 2770；命中后按防御力减伤\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 225,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 8.5,\n          \"ring\": 2,\n          \"years\": 30000,\n          \"effectSeed\": \"|2|30000|0\",\n          \"damageMode\": \"direct\",\n          \"attackSubtype\": \"direct\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 225,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"土\",\n          \"element\": \"土\",\n          \"elements\": [\n            \"土\"\n          ],\n          \"attributeTags\": [\n            \"土\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"fu-yue-ju-rong-yuan-skill-2\",\n          \"skillIndex\": 2,\n          \"description\": \"前肢往沼底一按，地脉自目标足下暴起，碎石穿身而过，造成单次物理伤害。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"fu-yue-ju-rong-yuan:skill:2\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"direct_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.2,\n              \"element\": \"土\",\n              \"elements\": [\n                \"土\"\n              ]\n            }\n          ]\n        },\n        {\n          \"name\": \"镇岳\",\n          \"category\": \"减益\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"目标敏捷降低31.5%，持续整场战斗；按双方精神力与稳定进行减益判定\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 128,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 8.5,\n          \"ring\": 3,\n          \"years\": 30000,\n          \"previewCost\": 128,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"土\",\n          \"element\": \"土\",\n          \"elements\": [\n            \"土\"\n          ],\n          \"attributeTags\": [\n            \"土\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"fu-yue-ju-rong-yuan-skill-3\",\n          \"skillIndex\": 3,\n          \"description\": \"山岳之势压落，目标举步维艰，敏捷被一寸寸拖低。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"fu-yue-ju-rong-yuan:skill:3\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"numeric_debuff\",\n              \"values\": {\n                \"A\": 0.315\n              },\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"contest\": \"spirit-and-stability\",\n              \"lifetime\": \"battle\",\n              \"element\": \"土\",\n              \"elements\": [\n                \"土\"\n              ]\n            }\n          ],\n          \"statusLifetime\": \"battle\",\n          \"duration\": null\n        },\n        {\n          \"name\": \"山崩余震\",\n          \"category\": \"持续伤害\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理总原始伤害 3231，分3次每3秒一跳，同技能不叠层\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 251,\n          \"costFraction\": 0.15,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 8.5,\n          \"ring\": 4,\n          \"years\": 30000,\n          \"damageNature\": \"residual\",\n          \"effectSeed\": \"|4|30000|0\",\n          \"damageMode\": \"periodic\",\n          \"attackSubtype\": \"periodic\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 251,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"土\",\n          \"element\": \"土\",\n          \"elements\": [\n            \"土\"\n          ],\n          \"attributeTags\": [\n            \"土\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"fu-yue-ju-rong-yuan-skill-4\",\n          \"skillIndex\": 4,\n          \"description\": \"一击之后地裂未止，余震分三次从脚底翻上来。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"fu-yue-ju-rong-yuan:skill:4\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"periodic_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.4,\n              \"parts\": 3,\n              \"intervalSeconds\": 3,\n              \"element\": \"土\",\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"elements\": [\n                \"土\"\n              ]\n            }\n          ]\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"bearing-mountain\",\n          \"name\": \"负岳\",\n          \"effect\": \"战斗开始时，背上的山影凝成护盾，值等于自身最大生命80%。自身受到的伤害有40%先由山影承担；山影每承担一次伤害，叠1层“山重”，每层使自身防御素质提高6%、受到的伤害降低2%，最多10层。山影被击破时，立即回复自身最大生命20%，山重层数不清空。越盾真伤不转嫁、不叠层。\",\n          \"params\": {\n            \"battleStartShieldMaxHPRate\": 0.8,\n            \"transferRate\": 0.4,\n            \"defensePerStack\": 0.06,\n            \"damageTakenDownPerStack\": 0.02,\n            \"maxStacks\": 10,\n            \"breakHealMaxHPRate\": 0.2,\n            \"stackLifetime\": \"battle\",\n            \"bypassTags\": [\n              \"shield-bypass-true-damage\"\n            ],\n            \"saveFields\": [\n              \"yueStacks\"\n            ],\n            \"statusLifetime\": \"battle\"\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:bearing-mountain\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:bearing-mountain\",\n            \"implementationVersion\": 1,\n            \"name\": \"负岳\",\n            \"effect\": \"战斗开始时，背上的山影凝成护盾，值等于自身最大生命80%。自身受到的伤害有40%先由山影承担；山影每承担一次伤害，叠1层“山重”，每层使自身防御素质提高6%、受到的伤害降低2%，最多10层。山影被击破时，立即回复自身最大生命20%，山重层数不清空。越盾真伤不转嫁、不叠层。\",\n            \"params\": {\n              \"battleStartShieldMaxHPRate\": 0.8,\n              \"transferRate\": 0.4,\n              \"defensePerStack\": 0.06,\n              \"damageTakenDownPerStack\": 0.02,\n              \"maxStacks\": 10,\n              \"breakHealMaxHPRate\": 0.2,\n              \"stackLifetime\": \"battle\",\n              \"bypassTags\": [\n                \"shield-bypass-true-damage\"\n              ],\n              \"saveFields\": [\n                \"yueStacks\"\n              ],\n              \"statusLifetime\": \"battle\",\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": [\n                \"yueStacks\"\n              ]\n            }\n          }\n        },\n        {\n          \"id\": \"ley-line-pierce\",\n          \"name\": \"山根透地\",\n          \"effect\": \"负岳蝾螈的攻击循地脉自目标足下穿出：无视目标40%防御素质，并无视护盾直接伤及本体。代价是每次攻击后自身行动条速度降低15%，持续整场战斗，可叠2层。对悬空或无形体的目标，只无视防御，不无视护盾。\",\n          \"params\": {\n            \"defenseIgnoreRate\": 0.4,\n            \"ignoreShield\": true,\n            \"selfGaugeSpeedDown\": 0.15,\n            \"maxStacks\": 2,\n            \"exceptions\": [\n              \"airborne\",\n              \"incorporeal\"\n            ],\n            \"duration\": \"battle\",\n            \"statusLifetime\": \"battle\"\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:ley-line-pierce\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:ley-line-pierce\",\n            \"implementationVersion\": 1,\n            \"name\": \"山根透地\",\n            \"effect\": \"负岳蝾螈的攻击循地脉自目标足下穿出：无视目标40%防御素质，并无视护盾直接伤及本体。代价是每次攻击后自身行动条速度降低15%，持续整场战斗，可叠2层。对悬空或无形体的目标，只无视防御，不无视护盾。\",\n            \"params\": {\n              \"defenseIgnoreRate\": 0.4,\n              \"ignoreShield\": true,\n              \"selfGaugeSpeedDown\": 0.15,\n              \"maxStacks\": 2,\n              \"exceptions\": [\n                \"airborne\",\n                \"incorporeal\"\n              ],\n              \"duration\": \"battle\",\n              \"statusLifetime\": \"battle\",\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        }\n      ],\n      \"years\": 100000,\n      \"available\": true,\n      \"battleTags\": [\n        \"hunt\"\n      ],\n      \"lifeType\": \"生活\",\n      \"level\": 91,\n      \"panel\": {\n        \"level\": 91,\n        \"rings\": 9,\n        \"benchmark\": 500,\n        \"ratingProfile\": \"npc\",\n        \"stats\": {\n          \"B\": 910,\n          \"S\": 525,\n          \"C\": 650,\n          \"D\": 910,\n          \"A\": 425,\n          \"P\": 1025,\n          \"W\": 77\n        },\n        \"derived\": {\n          \"HP\": 6590,\n          \"baseMP\": 2685,\n          \"MP\": 4028,\n          \"SH\": 8420,\n          \"PA\": 732.75,\n          \"SA\": 456.25,\n          \"MA\": 830,\n          \"DEF\": 647,\n          \"MDEF\": 545.6,\n          \"costReduction\": 40,\n          \"castReduction\": 30,\n          \"controlGrowth\": 2.5\n        },\n        \"rating\": \"强级\",\n        \"ratingScore\": 1.48\n      },\n      \"statBasis\": {\n        \"level\": 91,\n        \"benchmark\": 500,\n        \"W\": 77,\n        \"ratios\": [\n          1.82,\n          1.05,\n          1.3,\n          1.82,\n          0.85,\n          2.05\n        ],\n        \"bloodlineModifiesStats\": false,\n        \"note\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\"\n      },\n      \"skillPowerBasis\": {\n        \"stat\": \"S\",\n        \"value\": 525,\n        \"benchmark\": 500,\n        \"ratio\": 1.05,\n        \"rating\": \"并级\",\n        \"label\": \"万年第二档\",\n        \"years\": 30000,\n        \"q\": 3.15\n      },\n      \"traitInheritanceVersion\": 1,\n      \"ringReward\": {\n        \"years\": 100000,\n        \"description\": \"十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技\"\n      },\n      \"bone\": {\n        \"slot\": \"random\",\n        \"slotPolicy\": \"prefer-unoccupied-six\",\n        \"description\": \"胜利后优先在未装备且未携带的常规部位中等概率抽取，六部位齐备才在全部六部位抽取；不生成外附骨，结果随奖励事务保存\"\n      },\n      \"exitRule\": \"hp-or-spirit-zero\",\n      \"implementation\": {\n        \"status\": \"host-integrated-v1205\",\n        \"hostIntegrated\": true,\n        \"skills\": \"operations-live\",\n        \"traits\": \"live\",\n        \"inheritanceHandlers\": \"live\"\n      }\n    },\n    {\n      \"id\": \"zhe-tian-du-zhen\",\n      \"name\": \"遮天毒鸩\",\n      \"version\": 2,\n      \"style\": \"防御\",\n      \"elements\": [\n        \"毒\"\n      ],\n      \"statDice\": [\n        6,\n        2,\n        4,\n        7,\n        5,\n        1\n      ],\n      \"statRatios\": [\n        1.63,\n        1.05,\n        1.4,\n        1.72,\n        1.55,\n        0.85\n      ],\n      \"bloodline\": {\n        \"roll\": 5,\n        \"name\": \"异血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"鸟纲·猛禽（鸩，表外补充）\",\n      \"size\": \"巨（楼舍级）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"约十一万年（换过九次羽）\",\n      \"habitat\": \"南疆瘴泽上空终年不散的毒云——云底垂着紫黑色的雨丝。\",\n      \"appearance\": \"形如巨雕，双翼展开遮住半座楼舍；羽色墨绿近黑，羽尖凝着暗紫的毒露，飞过处落下一阵细如针的毒雨。喙如弯钩，颈侧生着九枚肉冠，每枚冠里封着一口颜色不同的瘴。翅骨细，撑不住楼舍般的身子，所以它飞不高，也飞不久。\",\n      \"habits\": \"不筑巢，随瘴云迁徙。以腐尸与毒虫为食，越毒越壮；寻常猛禽避之不及的腐肉，是它的正餐。它落在哪里，哪里的水十年不能饮。因为太重，多数时候蹲在毒云里等风来推；一旦真动起来，是整片云一起压下去。\",\n      \"role\": \"异种·首领——瘴泽上空的活灾。它落在哪里，哪里十年不长草。\",\n      \"battleText\": \"毒云低垂，楼舍般的黑影从云里坠下来。遮天毒鸩抖开墨绿的双翼，羽尖滴落的毒露在落地前就蒸成了一片紫雾。\",\n      \"defeatText\": \"最后一枚肉冠裂开又合上，毒云失了主心，四散而去。遮天毒鸩重重跌进泽地，腐羽间升起一枚猩红魂环。\",\n      \"talents\": [\n        {\n          \"name\": \"瘴羽覆身\",\n          \"effect\": \"抖落一层毒羽，在身周结成腐绿色的雾甲。\"\n        },\n        {\n          \"name\": \"九冠吐瘴\",\n          \"effect\": \"九枚肉冠依次裂开，喷出九道颜色各异的瘴气，合起来是一堵墙。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"腐羽裹身\",\n          \"category\": \"防御\",\n          \"channel\": \"生命\",\n          \"target\": \"自己\",\n          \"effect\": \"生命护盾 647，持续整场战斗\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 129,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 8.5,\n          \"ring\": 1,\n          \"years\": 30000,\n          \"previewCost\": 129,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"毒\",\n          \"element\": \"毒\",\n          \"elements\": [\n            \"毒\"\n          ],\n          \"attributeTags\": [\n            \"毒\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"zhe-tian-du-zhen-skill-1\",\n          \"skillIndex\": 1,\n          \"description\": \"抖落腐羽，毒雾在体表凝成一层黏腻的雾甲。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"zhe-tian-du-zhen:skill:1\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"shield\",\n              \"channel\": \"生命\",\n              \"coefficient\": 0.45,\n              \"power\": \"Q*SA\",\n              \"lifetime\": \"battle\",\n              \"element\": \"毒\",\n              \"elements\": [\n                \"毒\"\n              ]\n            }\n          ],\n          \"statusLifetime\": \"battle\",\n          \"duration\": null,\n          \"shieldDuration\": null\n        },\n        {\n          \"name\": \"毒喙贯骨\",\n          \"category\": \"攻击\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理原始伤害 2536；命中后按防御力减伤\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 225,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 8.5,\n          \"ring\": 2,\n          \"years\": 30000,\n          \"effectSeed\": \"|2|30000|0\",\n          \"damageMode\": \"direct\",\n          \"attackSubtype\": \"direct\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 225,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"毒\",\n          \"element\": \"毒\",\n          \"elements\": [\n            \"毒\"\n          ],\n          \"attributeTags\": [\n            \"毒\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"zhe-tian-du-zhen-skill-2\",\n          \"skillIndex\": 2,\n          \"description\": \"弯钩般的喙自高处凿下，毒液随创口灌入，造成单次物理伤害。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"zhe-tian-du-zhen:skill:2\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"direct_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.2,\n              \"element\": \"毒\",\n              \"elements\": [\n                \"毒\"\n              ]\n            }\n          ]\n        },\n        {\n          \"name\": \"弥天瘴\",\n          \"category\": \"减益\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"目标敏捷降低31.5%，持续整场战斗；按双方精神力与稳定进行减益判定\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 128,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 8.5,\n          \"ring\": 3,\n          \"years\": 30000,\n          \"previewCost\": 128,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"毒\",\n          \"element\": \"毒\",\n          \"elements\": [\n            \"毒\"\n          ],\n          \"attributeTags\": [\n            \"毒\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"zhe-tian-du-zhen-skill-3\",\n          \"skillIndex\": 3,\n          \"description\": \"瘴羽漫天，目标四肢发沉，敏捷被一层层拖低。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"zhe-tian-du-zhen:skill:3\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"numeric_debuff\",\n              \"values\": {\n                \"A\": 0.315\n              },\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"contest\": \"spirit-and-stability\",\n              \"lifetime\": \"battle\",\n              \"element\": \"毒\",\n              \"elements\": [\n                \"毒\"\n              ]\n            }\n          ],\n          \"statusLifetime\": \"battle\",\n          \"duration\": null\n        },\n        {\n          \"name\": \"百瘴蚀骨\",\n          \"category\": \"持续伤害\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理总原始伤害 2959，分3次每3秒一跳，同技能不叠层\",\n          \"q\": 3.15,\n          \"K\": 1,\n          \"Q\": 3.15,\n          \"cost\": 251,\n          \"costFraction\": 0.15,\n          \"highest\": false,\n          \"cast\": 1.28,\n          \"cooldown\": 8.5,\n          \"ring\": 4,\n          \"years\": 30000,\n          \"damageNature\": \"poison\",\n          \"effectSeed\": \"|4|30000|0\",\n          \"damageMode\": \"periodic\",\n          \"attackSubtype\": \"periodic\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 251,\n          \"previewCast\": 1.28,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"毒\",\n          \"element\": \"毒\",\n          \"elements\": [\n            \"毒\"\n          ],\n          \"attributeTags\": [\n            \"毒\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"zhe-tian-du-zhen-skill-4\",\n          \"skillIndex\": 4,\n          \"description\": \"腐毒留在创口，分三次由内向外蚀空。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"zhe-tian-du-zhen:skill:4\",\n          \"strengthReference\": {\n            \"years\": 30000,\n            \"band\": \"万年第二档\",\n            \"rating\": \"并级\",\n            \"q\": 3.15,\n            \"K\": 1,\n            \"Q\": 3.15,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"periodic_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.4,\n              \"parts\": 3,\n              \"intervalSeconds\": 3,\n              \"element\": \"毒\",\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"elements\": [\n                \"毒\"\n              ]\n            }\n          ]\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"twin-sac-frame\",\n          \"name\": \"双囊之躯\",\n          \"effect\": \"腐毒在体内结成第二副脏腑。生命之外另有一条“毒囊”，容量等于自身最大生命50%，受到伤害时毒囊优先承伤，毒囊见底后才扣生命。毒囊每回合结束回复8%，见底即进入“破囊”：受到的伤害提高25%。毒囊被击破的瞬间，向全场敌人喷散腐毒，各叠2层“瘴羽”。两槽俱空才败。反制：毒囊不挡精神伤害，精神攻击直取本体。\",\n          \"params\": {\n            \"secondPool\": \"toxin-sac\",\n            \"secondPoolMaxHPRate\": 0.5,\n            \"damagePriority\": \"toxin-sac-first\",\n            \"regenPerTurn\": 0.08,\n            \"brokenDamageTakenUp\": 0.25,\n            \"breakSpreadStacks\": 2,\n            \"defeatWhenBothEmpty\": true,\n            \"mentalDamageBypassPool\": true,\n            \"saveFields\": [\n              \"toxinSac\"\n            ],\n            \"statusLifetime\": \"battle\"\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:twin-sac-frame\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:twin-sac-frame\",\n            \"implementationVersion\": 1,\n            \"name\": \"双囊之躯\",\n            \"effect\": \"腐毒在体内结成第二副脏腑。生命之外另有一条“毒囊”，容量等于自身最大生命50%，受到伤害时毒囊优先承伤，毒囊见底后才扣生命。毒囊每回合结束回复8%，见底即进入“破囊”：受到的伤害提高25%。毒囊被击破的瞬间，向全场敌人喷散腐毒，各叠2层“瘴羽”。两槽俱空才败。反制：毒囊不挡精神伤害，精神攻击直取本体。\",\n            \"params\": {\n              \"secondPool\": \"toxin-sac\",\n              \"secondPoolMaxHPRate\": 0.5,\n              \"damagePriority\": \"toxin-sac-first\",\n              \"regenPerTurn\": 0.08,\n              \"brokenDamageTakenUp\": 0.25,\n              \"breakSpreadStacks\": 2,\n              \"defeatWhenBothEmpty\": true,\n              \"mentalDamageBypassPool\": true,\n              \"saveFields\": [\n                \"toxinSac\"\n              ],\n              \"statusLifetime\": \"battle\",\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": [\n                \"toxinSac\"\n              ]\n            }\n          }\n        },\n        {\n          \"id\": \"sky-full-of-miasma\",\n          \"name\": \"弥天瘴羽\",\n          \"effect\": \"每回合结束时，向所有敌人各撒1层“瘴羽”，最多6层：每层使目标敏捷降低5%、魂力操纵降低5%、魂力回复降低10%、受到的伤害提高8%。敌人每消耗一次魂力，额外叠1层。叠满6层时，该目标下一次获得的护盾、治疗、回魂完全失效一次，随后层数清零。净化类技能一次可剥除2层。\",\n          \"params\": {\n            \"stacksPerTurn\": 1,\n            \"maxStacks\": 6,\n            \"agilityDownPerStack\": 0.05,\n            \"manaRegenDownPerStack\": 0.1,\n            \"extraStackOnManaSpend\": 1,\n            \"purgeStacks\": 2,\n            \"lockoutAtMax\": true,\n            \"lockoutScope\": [\n              \"shield\",\n              \"heal\",\n              \"mana-recovery\"\n            ],\n            \"statusLifetime\": \"battle\",\n            \"controlDownPerStack\": 0.05,\n            \"damageTakenUpPerStack\": 0.08,\n            \"damageScope\": \"all\"\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:sky-full-of-miasma\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:sky-full-of-miasma\",\n            \"implementationVersion\": 1,\n            \"name\": \"弥天瘴羽\",\n            \"effect\": \"每回合结束时，向所有敌人各撒1层“瘴羽”，最多6层：每层使目标敏捷降低5%、魂力操纵降低5%、魂力回复降低10%、受到的伤害提高8%。敌人每消耗一次魂力，额外叠1层。叠满6层时，该目标下一次获得的护盾、治疗、回魂完全失效一次，随后层数清零。净化类技能一次可剥除2层。\",\n            \"params\": {\n              \"stacksPerTurn\": 1,\n              \"maxStacks\": 6,\n              \"agilityDownPerStack\": 0.05,\n              \"manaRegenDownPerStack\": 0.1,\n              \"extraStackOnManaSpend\": 1,\n              \"purgeStacks\": 2,\n              \"lockoutAtMax\": true,\n              \"lockoutScope\": [\n                \"shield\",\n                \"heal\",\n                \"mana-recovery\"\n              ],\n              \"statusLifetime\": \"battle\",\n              \"controlDownPerStack\": 0.05,\n              \"damageTakenUpPerStack\": 0.08,\n              \"damageScope\": \"all\",\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        }\n      ],\n      \"years\": 100000,\n      \"available\": true,\n      \"battleTags\": [\n        \"hunt\"\n      ],\n      \"lifeType\": \"生活\",\n      \"level\": 91,\n      \"panel\": {\n        \"level\": 91,\n        \"rings\": 9,\n        \"benchmark\": 500,\n        \"ratingProfile\": \"npc\",\n        \"stats\": {\n          \"B\": 815,\n          \"S\": 525,\n          \"C\": 700,\n          \"D\": 860,\n          \"A\": 775,\n          \"P\": 425,\n          \"W\": 77\n        },\n        \"derived\": {\n          \"HP\": 5925,\n          \"baseMP\": 2685,\n          \"MP\": 4028,\n          \"SH\": 3620,\n          \"PA\": 671,\n          \"SA\": 456.25,\n          \"MA\": 350,\n          \"DEF\": 603,\n          \"MDEF\": 245.6,\n          \"costReduction\": 40,\n          \"castReduction\": 30,\n          \"controlGrowth\": 2.5\n        },\n        \"rating\": \"强级\",\n        \"ratingScore\": 1.37\n      },\n      \"statBasis\": {\n        \"level\": 91,\n        \"benchmark\": 500,\n        \"W\": 77,\n        \"ratios\": [\n          1.63,\n          1.05,\n          1.4,\n          1.72,\n          1.55,\n          0.85\n        ],\n        \"bloodlineModifiesStats\": false,\n        \"note\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\"\n      },\n      \"skillPowerBasis\": {\n        \"stat\": \"S\",\n        \"value\": 525,\n        \"benchmark\": 500,\n        \"ratio\": 1.05,\n        \"rating\": \"并级\",\n        \"label\": \"万年第二档\",\n        \"years\": 30000,\n        \"q\": 3.15\n      },\n      \"traitInheritanceVersion\": 1,\n      \"ringReward\": {\n        \"years\": 100000,\n        \"description\": \"十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技\"\n      },\n      \"bone\": {\n        \"slot\": \"random\",\n        \"slotPolicy\": \"prefer-unoccupied-six\",\n        \"description\": \"胜利后优先在未装备且未携带的常规部位中等概率抽取，六部位齐备才在全部六部位抽取；不生成外附骨，结果随奖励事务保存\"\n      },\n      \"exitRule\": \"hp-or-spirit-zero\",\n      \"implementation\": {\n        \"status\": \"host-integrated-v1205\",\n        \"hostIntegrated\": true,\n        \"skills\": \"operations-live\",\n        \"traits\": \"live\",\n        \"inheritanceHandlers\": \"live\"\n      }\n    },\n    {\n      \"id\": \"jin-lin-zhen-hun-chi\",\n      \"name\": \"金鳞镇魂螭\",\n      \"version\": 2,\n      \"style\": \"控制\",\n      \"elements\": [\n        \"金\"\n      ],\n      \"statDice\": [\n        4,\n        7,\n        3,\n        10,\n        5,\n        9\n      ],\n      \"statRatios\": [\n        1.4,\n        1.72,\n        1.3,\n        2.25,\n        1.55,\n        2.05\n      ],\n      \"bloodline\": {\n        \"roll\": 2,\n        \"name\": \"凡血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"龙属·亚龙（螭，无角之龙）\",\n      \"size\": \"大（象鲸级）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"约十万年整（刚满）\",\n      \"habitat\": \"西极金铁矿脉最深处——洞壁被它的鳞刮得发亮，像一面走不到头的镜子。\",\n      \"appearance\": \"无角之龙，身长如鲸，通体覆着层层叠叠的金鳞，每一片的边缘都能割开岩石。腹下四爪扣住矿脉，脊背生一道锯齿状的铁脊。眼如熔金，不眨——与它对视超过三息，体内的魂力会自己往下沉。它游过矿洞时，鳞与岩壁相击，声如千万柄刀同时出鞘。\",\n      \"habits\": \"守着一座金山，不吃不喝，只以金气淬鳞。凡带兵刃入山者，它额前的金鳞会先一步发烫——不是预警，是记住了这个人。它的目光落在谁身上，谁的魂力就开始滞；所以识相的猎魂者都低着头进山。十万年里它的鳞磨掉一层、长一层，越磨越硬。\",\n      \"role\": \"首领——金山之主。不追人，但凡带兵刃入山者，它都记得。\",\n      \"battleText\": \"矿洞深处传来鳞甲相击的脆响，像千万柄刀同时出鞘。金鳞镇魂螭盘在脉心，熔金般的双眼睁开，整座金山的金气随之一沉。\",\n      \"defeatText\": \"金鳞一片片黯淡、卷起，像烧尽的纸。金鳞镇魂螭松开扣住矿脉的爪，脊背的锯齿缓缓伏平，一枚红环从矿尘里浮起。\",\n      \"talents\": [\n        {\n          \"name\": \"金鳞共鸣\",\n          \"effect\": \"周身金鳞震颤，方圆内的兵刃与魂力运转一并滞涩。\"\n        },\n        {\n          \"name\": \"削金吐息\",\n          \"effect\": \"喷出一道金灰色的气，所过之处甲胄如泥。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"金气贯岳\",\n          \"category\": \"攻击\",\n          \"channel\": \"能量\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"能量原始伤害 3379；命中后按防御力减伤\",\n          \"q\": 3.8,\n          \"K\": 1,\n          \"Q\": 3.8,\n          \"cost\": 416,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.37,\n          \"cooldown\": 9.5,\n          \"ring\": 1,\n          \"years\": 70000,\n          \"effectSeed\": \"|1|70000|0\",\n          \"damageMode\": \"direct\",\n          \"attackSubtype\": \"direct\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 416,\n          \"previewCast\": 1.37,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"金\",\n          \"element\": \"金\",\n          \"elements\": [\n            \"金\"\n          ],\n          \"attributeTags\": [\n            \"金\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"jin-lin-zhen-hun-chi-skill-1\",\n          \"skillIndex\": 1,\n          \"description\": \"一道金灰色的气自口中吐出，贯石穿岳，造成单次能量伤害。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"jin-lin-zhen-hun-chi:skill:1\",\n          \"strengthReference\": {\n            \"years\": 70000,\n            \"band\": \"万年第四档\",\n            \"rating\": \"凶级\",\n            \"q\": 3.8,\n            \"K\": 1,\n            \"Q\": 3.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"direct_attack\",\n              \"channel\": \"能量\",\n              \"factor\": 1.2,\n              \"element\": \"金\",\n              \"elements\": [\n                \"金\"\n              ]\n            }\n          ]\n        },\n        {\n          \"name\": \"金枷锁脉\",\n          \"category\": \"减益\",\n          \"channel\": \"能量\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"目标敏捷降低38%，持续整场战斗；按双方精神力与稳定进行减益判定\",\n          \"q\": 3.8,\n          \"K\": 1,\n          \"Q\": 3.8,\n          \"cost\": 217,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.37,\n          \"cooldown\": 9.5,\n          \"ring\": 2,\n          \"years\": 70000,\n          \"previewCost\": 217,\n          \"previewCast\": 1.37,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"金\",\n          \"element\": \"金\",\n          \"elements\": [\n            \"金\"\n          ],\n          \"attributeTags\": [\n            \"金\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"jin-lin-zhen-hun-chi-skill-2\",\n          \"skillIndex\": 2,\n          \"description\": \"金气凝成枷锁，锁住目标魂力流转与四肢。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"jin-lin-zhen-hun-chi:skill:2\",\n          \"strengthReference\": {\n            \"years\": 70000,\n            \"band\": \"万年第四档\",\n            \"rating\": \"凶级\",\n            \"q\": 3.8,\n            \"K\": 1,\n            \"Q\": 3.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"numeric_debuff\",\n              \"values\": {\n                \"A\": 0.38\n              },\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"contest\": \"spirit-and-stability\",\n              \"lifetime\": \"battle\",\n              \"element\": \"金\",\n              \"elements\": [\n                \"金\"\n              ]\n            }\n          ],\n          \"statusLifetime\": \"battle\",\n          \"duration\": null\n        },\n        {\n          \"name\": \"螭纹锁魂\",\n          \"category\": \"控制\",\n          \"channel\": \"能量\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"基础控制 2.9秒；实际成功率与时长受双方精神力影响，结束后4秒免控\",\n          \"q\": 3.8,\n          \"K\": 1,\n          \"Q\": 3.8,\n          \"cost\": 250,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.37,\n          \"cooldown\": 10,\n          \"ring\": 3,\n          \"years\": 70000,\n          \"previewCost\": 250,\n          \"previewCast\": 1.37,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"金\",\n          \"element\": \"金\",\n          \"elements\": [\n            \"金\"\n          ],\n          \"attributeTags\": [\n            \"金\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"jin-lin-zhen-hun-chi-skill-3\",\n          \"skillIndex\": 3,\n          \"description\": \"螭纹自地面爬起，缠住目标魂力流转的间隙。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"jin-lin-zhen-hun-chi:skill:3\",\n          \"strengthReference\": {\n            \"years\": 70000,\n            \"band\": \"万年第四档\",\n            \"rating\": \"凶级\",\n            \"q\": 3.8,\n            \"K\": 1,\n            \"Q\": 3.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"control_contest\",\n              \"baseSeconds\": 2.9,\n              \"interrupt\": true,\n              \"immunitySeconds\": 4,\n              \"element\": \"金\",\n              \"elements\": [\n                \"金\"\n              ]\n            }\n          ],\n          \"baseControl\": 2.9\n        },\n        {\n          \"name\": \"鎏金鳞甲\",\n          \"category\": \"防御\",\n          \"channel\": \"生命\",\n          \"target\": \"自己\",\n          \"effect\": \"生命护盾 1267，持续整场战斗\",\n          \"q\": 3.8,\n          \"K\": 1,\n          \"Q\": 3.8,\n          \"cost\": 210,\n          \"costFraction\": 0.15,\n          \"highest\": false,\n          \"cast\": 1.37,\n          \"cooldown\": 9.5,\n          \"ring\": 4,\n          \"years\": 70000,\n          \"previewCost\": 210,\n          \"previewCast\": 1.37,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"金\",\n          \"element\": \"金\",\n          \"elements\": [\n            \"金\"\n          ],\n          \"attributeTags\": [\n            \"金\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"jin-lin-zhen-hun-chi-skill-4\",\n          \"skillIndex\": 4,\n          \"description\": \"金鳞层叠合拢，结成一面临时甲盾。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"jin-lin-zhen-hun-chi:skill:4\",\n          \"strengthReference\": {\n            \"years\": 70000,\n            \"band\": \"万年第四档\",\n            \"rating\": \"凶级\",\n            \"q\": 3.8,\n            \"K\": 1,\n            \"Q\": 3.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"shield\",\n              \"channel\": \"生命\",\n              \"coefficient\": 0.45,\n              \"power\": \"Q*SA\",\n              \"lifetime\": \"battle\",\n              \"element\": \"金\",\n              \"elements\": [\n                \"金\"\n              ]\n            }\n          ],\n          \"statusLifetime\": \"battle\",\n          \"duration\": null,\n          \"shieldDuration\": null\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"metal-breath-carve\",\n          \"name\": \"金气削骨\",\n          \"effect\": \"金鳞镇魂螭的攻击与魂技无视目标30%防御素质；命中时额外越盾扣除目标最大生命的3%，每回合最多触发2次；目标带有护盾时改为6%。每次触发使目标叠1层“削金”：防御素质降低4%，最多5层。反制：对无生命或构装类目标，越盾部分减半。\",\n          \"params\": {\n            \"defenseIgnoreRate\": 0.3,\n            \"bypassMaxHPRate\": 0.03,\n            \"perTurnMax\": 2,\n            \"vsShieldRate\": 0.06,\n            \"defenseDownPerStack\": 0.04,\n            \"maxStacks\": 5,\n            \"exemptAgainst\": [\n              \"non-living\",\n              \"construct\"\n            ],\n            \"statusLifetime\": \"battle\"\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:metal-breath-carve\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:metal-breath-carve\",\n            \"implementationVersion\": 1,\n            \"name\": \"金气削骨\",\n            \"effect\": \"金鳞镇魂螭的攻击与魂技无视目标30%防御素质；命中时额外越盾扣除目标最大生命的3%，每回合最多触发2次；目标带有护盾时改为6%。每次触发使目标叠1层“削金”：防御素质降低4%，最多5层。反制：对无生命或构装类目标，越盾部分减半。\",\n            \"params\": {\n              \"defenseIgnoreRate\": 0.3,\n              \"bypassMaxHPRate\": 0.03,\n              \"perTurnMax\": 2,\n              \"vsShieldRate\": 0.06,\n              \"defenseDownPerStack\": 0.04,\n              \"maxStacks\": 5,\n              \"exemptAgainst\": [\n                \"non-living\",\n                \"construct\"\n              ],\n              \"statusLifetime\": \"battle\",\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        },\n        {\n          \"id\": \"chi-pattern-suppress\",\n          \"name\": \"螭纹压魂\",\n          \"effect\": \"自身获得3层传奇抗性：前三次可施加的控制效果固定被免疫，不进行豁免检定，每次消耗1层，战斗中不恢复。每次受到攻击，对攻击者施加1层“螭纹”：敏捷降低6%、魂力消耗提高8%，持续整场战斗，最多6层。叠满6层时，攻击者下一次行动无法获得任何增益、护盾、治疗与回魂，且读条速度降低20%，持续整场战斗。无魂力单位只受减速，不受费用惩罚。\",\n          \"params\": {\n            \"trigger\": \"attack-received\",\n            \"agilityDownPerStack\": 0.06,\n            \"costUpPerStack\": 0.08,\n            \"maxStacks\": 6,\n            \"lockoutAtMax\": true,\n            \"lockoutScope\": [\n              \"buff\",\n              \"shield\",\n              \"heal\",\n              \"mana-recovery\"\n            ],\n            \"castSpeedDownOnLockout\": 0.2,\n            \"excludeResourceFreeUnits\": true,\n            \"duration\": \"battle\",\n            \"statusLifetime\": \"battle\",\n            \"legendaryResistanceCharges\": 3,\n            \"legendaryControlBlockMode\": \"before-save-no-roll\",\n            \"legendaryRefresh\": \"battle-start-only\",\n            \"castSpeedDownLifetime\": \"battle\",\n            \"saveFields\": [\n              \"legendaryRemaining\",\n              \"chiStacksByActor\"\n            ]\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:chi-pattern-suppress\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:chi-pattern-suppress\",\n            \"implementationVersion\": 1,\n            \"name\": \"螭纹压魂\",\n            \"effect\": \"自身获得3层传奇抗性：前三次可施加的控制效果固定被免疫，不进行豁免检定，每次消耗1层，战斗中不恢复。每次受到攻击，对攻击者施加1层“螭纹”：敏捷降低6%、魂力消耗提高8%，持续整场战斗，最多6层。叠满6层时，攻击者下一次行动无法获得任何增益、护盾、治疗与回魂，且读条速度降低20%，持续整场战斗。无魂力单位只受减速，不受费用惩罚。\",\n            \"params\": {\n              \"trigger\": \"attack-received\",\n              \"agilityDownPerStack\": 0.06,\n              \"costUpPerStack\": 0.08,\n              \"maxStacks\": 6,\n              \"lockoutAtMax\": true,\n              \"lockoutScope\": [\n                \"buff\",\n                \"shield\",\n                \"heal\",\n                \"mana-recovery\"\n              ],\n              \"castSpeedDownOnLockout\": 0.2,\n              \"excludeResourceFreeUnits\": true,\n              \"duration\": \"battle\",\n              \"statusLifetime\": \"battle\",\n              \"legendaryResistanceCharges\": 3,\n              \"legendaryControlBlockMode\": \"before-save-no-roll\",\n              \"legendaryRefresh\": \"battle-start-only\",\n              \"castSpeedDownLifetime\": \"battle\",\n              \"saveFields\": [\n                \"legendaryRemaining\",\n                \"chiStacksByActor\"\n              ],\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": [\n                \"legendaryRemaining\",\n                \"chiStacksByActor\"\n              ]\n            }\n          }\n        }\n      ],\n      \"years\": 100000,\n      \"available\": true,\n      \"battleTags\": [\n        \"hunt\"\n      ],\n      \"lifeType\": \"生活\",\n      \"level\": 91,\n      \"panel\": {\n        \"level\": 91,\n        \"rings\": 9,\n        \"benchmark\": 500,\n        \"ratingProfile\": \"npc\",\n        \"stats\": {\n          \"B\": 700,\n          \"S\": 860,\n          \"C\": 650,\n          \"D\": 1125,\n          \"A\": 775,\n          \"P\": 1025,\n          \"W\": 77\n        },\n        \"derived\": {\n          \"HP\": 5120,\n          \"baseMP\": 4360,\n          \"MP\": 6540,\n          \"SH\": 8420,\n          \"PA\": 680,\n          \"SA\": 741,\n          \"MA\": 830,\n          \"DEF\": 712.5,\n          \"MDEF\": 545.6,\n          \"costReduction\": 40,\n          \"castReduction\": 30,\n          \"controlGrowth\": 2.5\n        },\n        \"rating\": \"凶级\",\n        \"ratingScore\": 1.71\n      },\n      \"statBasis\": {\n        \"level\": 91,\n        \"benchmark\": 500,\n        \"W\": 77,\n        \"ratios\": [\n          1.4,\n          1.72,\n          1.3,\n          2.25,\n          1.55,\n          2.05\n        ],\n        \"bloodlineModifiesStats\": false,\n        \"note\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\"\n      },\n      \"skillPowerBasis\": {\n        \"stat\": \"S\",\n        \"value\": 860,\n        \"benchmark\": 500,\n        \"ratio\": 1.72,\n        \"rating\": \"凶级\",\n        \"label\": \"万年第四档\",\n        \"years\": 70000,\n        \"q\": 3.8\n      },\n      \"traitInheritanceVersion\": 1,\n      \"ringReward\": {\n        \"years\": 100000,\n        \"description\": \"十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技\"\n      },\n      \"bone\": {\n        \"slot\": \"random\",\n        \"slotPolicy\": \"prefer-unoccupied-six\",\n        \"description\": \"胜利后优先在未装备且未携带的常规部位中等概率抽取，六部位齐备才在全部六部位抽取；不生成外附骨，结果随奖励事务保存\"\n      },\n      \"exitRule\": \"hp-or-spirit-zero\",\n      \"implementation\": {\n        \"status\": \"host-integrated-v1205\",\n        \"hostIntegrated\": true,\n        \"skills\": \"operations-live\",\n        \"traits\": \"live\",\n        \"inheritanceHandlers\": \"live\"\n      }\n    },\n    {\n      \"id\": \"fen-tian-chi-yan-long\",\n      \"name\": \"焚天赤烛龙\",\n      \"version\": 2,\n      \"style\": \"强攻\",\n      \"elements\": [\n        \"火\"\n      ],\n      \"statDice\": [\n        10,\n        8,\n        10,\n        7,\n        5,\n        5\n      ],\n      \"statRatios\": [\n        2.25,\n        1.82,\n        2.25,\n        1.72,\n        1.55,\n        1.55\n      ],\n      \"bloodline\": {\n        \"roll\": 3,\n        \"name\": \"凡血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"融合体·双龙嵌合（表外补充：两条火龙熔为一体）\",\n      \"size\": \"中（马牛级）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"约十三万年\",\n      \"habitat\": \"极西火脉尽头，岩浆河分岔处的黑曜石台——台下是烧了十万年的火。\",\n      \"appearance\": \"只有马牛大小，却是两条火龙熔在一起：一具身子，两颗头，左首赤如熔金、右首黑如焦炭；颈下的鳞各自生长，到胸前熔成一片烧红的铁。四足两尾，脊背裂着一道始终不灭的火缝。火缝亮时四周如白昼，火缝闭时连影子都被烤化。\",\n      \"habits\": \"两条龙争一副身子，争了十万年，谁也吞不掉谁。不动时火缝半明半灭，像在呼吸；双首同时睁眼，身周百步的火属性魂力会被抽干，连空气都烧成白焰。它不喜欢光——它自己就是光。\",\n      \"role\": \"首领——火脉尽头的双生凶物。两条龙共用一副身子，也共用一份杀意。\",\n      \"battleText\": \"黑曜石台上的火缝忽然大亮，照得整条岩浆河都失了颜色。焚天赤烛龙双首同时抬起，一赤一黑，四只眼睛里各烧着一条不肯认输的龙。\",\n      \"defeatText\": \"火缝熄了一半，两个头终于不再争了。焚天赤烛龙伏在黑曜石上，赤首阖眼，黑首吐出最后一缕烟，红环在余烬中缓缓转亮。\",\n      \"talents\": [\n        {\n          \"name\": \"火缝照夜\",\n          \"effect\": \"脊背火缝大亮，照见一切隐匿；光本身即是灼。\"\n        },\n        {\n          \"name\": \"双龙绞\",\n          \"effect\": \"两首各吐一道火，交缠成一根绞索。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"赤炎贯天\",\n          \"category\": \"攻击\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理原始伤害 4650；命中后按防御力减伤\",\n          \"q\": 4,\n          \"K\": 1,\n          \"Q\": 4,\n          \"cost\": 457,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.4,\n          \"cooldown\": 10,\n          \"ring\": 1,\n          \"years\": 90000,\n          \"effectSeed\": \"|1|90000|0\",\n          \"damageMode\": \"direct\",\n          \"attackSubtype\": \"direct\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 457,\n          \"previewCast\": 1.4,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"火\",\n          \"element\": \"火\",\n          \"elements\": [\n            \"火\"\n          ],\n          \"attributeTags\": [\n            \"火\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"fen-tian-chi-yan-long-skill-1\",\n          \"skillIndex\": 1,\n          \"description\": \"火缝大亮，一道赤炎直贯而出，造成单次物理伤害。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"fen-tian-chi-yan-long:skill:1\",\n          \"strengthReference\": {\n            \"years\": 90000,\n            \"band\": \"万年第五档\",\n            \"rating\": \"狂级\",\n            \"q\": 4,\n            \"K\": 1,\n            \"Q\": 4,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"direct_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.2,\n              \"element\": \"火\",\n              \"elements\": [\n                \"火\"\n              ]\n            }\n          ]\n        },\n        {\n          \"name\": \"焚天吐息\",\n          \"category\": \"持续伤害\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理总原始伤害 5425，分3次每3秒一跳，同技能不叠层\",\n          \"q\": 4,\n          \"K\": 1,\n          \"Q\": 4,\n          \"cost\": 512,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.4,\n          \"cooldown\": 10,\n          \"ring\": 2,\n          \"years\": 90000,\n          \"damageNature\": \"residual\",\n          \"effectSeed\": \"|2|90000|0\",\n          \"damageMode\": \"periodic\",\n          \"attackSubtype\": \"periodic\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 512,\n          \"previewCast\": 1.4,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"火\",\n          \"element\": \"火\",\n          \"elements\": [\n            \"火\"\n          ],\n          \"attributeTags\": [\n            \"火\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"fen-tian-chi-yan-long-skill-2\",\n          \"skillIndex\": 2,\n          \"description\": \"两首同吐，火舌在目标身上分三次爆开。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"fen-tian-chi-yan-long:skill:2\",\n          \"strengthReference\": {\n            \"years\": 90000,\n            \"band\": \"万年第五档\",\n            \"rating\": \"狂级\",\n            \"q\": 4,\n            \"K\": 1,\n            \"Q\": 4,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"periodic_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.4,\n              \"parts\": 3,\n              \"intervalSeconds\": 3,\n              \"element\": \"火\",\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"elements\": [\n                \"火\"\n              ]\n            }\n          ]\n        },\n        {\n          \"name\": \"双龙绞\",\n          \"category\": \"控制\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"基础控制 3秒；实际成功率与时长受双方精神力影响，结束后4秒免控\",\n          \"q\": 4,\n          \"K\": 1,\n          \"Q\": 4,\n          \"cost\": 269,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.4,\n          \"cooldown\": 10,\n          \"ring\": 3,\n          \"years\": 90000,\n          \"previewCost\": 269,\n          \"previewCast\": 1.4,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"火\",\n          \"element\": \"火\",\n          \"elements\": [\n            \"火\"\n          ],\n          \"attributeTags\": [\n            \"火\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"fen-tian-chi-yan-long-skill-3\",\n          \"skillIndex\": 3,\n          \"description\": \"两道火索交缠，将目标捆在原地。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"fen-tian-chi-yan-long:skill:3\",\n          \"strengthReference\": {\n            \"years\": 90000,\n            \"band\": \"万年第五档\",\n            \"rating\": \"狂级\",\n            \"q\": 4,\n            \"K\": 1,\n            \"Q\": 4,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"control_contest\",\n              \"baseSeconds\": 3,\n              \"interrupt\": true,\n              \"immunitySeconds\": 4,\n              \"element\": \"火\",\n              \"elements\": [\n                \"火\"\n              ]\n            }\n          ],\n          \"baseControl\": 3\n        },\n        {\n          \"name\": \"逆鳞火甲\",\n          \"category\": \"防御\",\n          \"channel\": \"生命\",\n          \"target\": \"自己\",\n          \"effect\": \"生命护盾 1410，持续整场战斗\",\n          \"q\": 4,\n          \"K\": 1,\n          \"Q\": 4,\n          \"cost\": 222,\n          \"costFraction\": 0.15,\n          \"highest\": false,\n          \"cast\": 1.4,\n          \"cooldown\": 10,\n          \"ring\": 4,\n          \"years\": 90000,\n          \"previewCost\": 222,\n          \"previewCast\": 1.4,\n          \"previewRulesVersion\": 17,\n          \"attribute\": \"火\",\n          \"element\": \"火\",\n          \"elements\": [\n            \"火\"\n          ],\n          \"attributeTags\": [\n            \"火\"\n          ],\n          \"attributeRulesVersion\": 1,\n          \"id\": \"fen-tian-chi-yan-long-skill-4\",\n          \"skillIndex\": 4,\n          \"description\": \"逆鳞倒竖，火幕合拢成甲。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"fen-tian-chi-yan-long:skill:4\",\n          \"strengthReference\": {\n            \"years\": 90000,\n            \"band\": \"万年第五档\",\n            \"rating\": \"狂级\",\n            \"q\": 4,\n            \"K\": 1,\n            \"Q\": 4,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"shield\",\n              \"channel\": \"生命\",\n              \"coefficient\": 0.45,\n              \"power\": \"Q*SA\",\n              \"lifetime\": \"battle\",\n              \"element\": \"火\",\n              \"elements\": [\n                \"火\"\n              ]\n            }\n          ],\n          \"statusLifetime\": \"battle\",\n          \"duration\": null,\n          \"shieldDuration\": null\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"blaze-armor-break\",\n          \"name\": \"焚龙破甲\",\n          \"effect\": \"火光所照，甲胄如纸。自身造成的伤害无视目标35%防御素质，并无视全部减伤与防守状态（不含护盾）。代价：每次攻击额外消耗当前魂力的15%，且自身受到的伤害提高10%，持续整场战斗。反制：护盾仍按原值吸收，穿透不等于必中。\",\n          \"params\": {\n            \"defenseIgnoreRate\": 0.35,\n            \"ignoreMitigation\": true,\n            \"ignoreDefensiveStates\": true,\n            \"excludeShield\": true,\n            \"extraManaCostRate\": 0.15,\n            \"selfDamageTakenUp\": 0.1,\n            \"duration\": \"battle\",\n            \"statusLifetime\": \"battle\",\n            \"damageScope\": \"all\"\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:blaze-armor-break\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:blaze-armor-break\",\n            \"implementationVersion\": 1,\n            \"name\": \"焚龙破甲\",\n            \"effect\": \"火光所照，甲胄如纸。自身造成的伤害无视目标35%防御素质，并无视全部减伤与防守状态（不含护盾）。代价：每次攻击额外消耗当前魂力的15%，且自身受到的伤害提高10%，持续整场战斗。反制：护盾仍按原值吸收，穿透不等于必中。\",\n            \"params\": {\n              \"defenseIgnoreRate\": 0.35,\n              \"ignoreMitigation\": true,\n              \"ignoreDefensiveStates\": true,\n              \"excludeShield\": true,\n              \"extraManaCostRate\": 0.15,\n              \"selfDamageTakenUp\": 0.1,\n              \"duration\": \"battle\",\n              \"statusLifetime\": \"battle\",\n              \"damageScope\": \"all\",\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        },\n        {\n          \"id\": \"reverse-scale-unburned\",\n          \"name\": \"赤烛不焚\",\n          \"effect\": \"首次受到某属性伤害时正常承受100%伤害，结算后获得该属性50%抗性，第二次及后续该属性伤害固定减半，不再继续减半。受到有属性伤害或被施加有属性减益时，叠1层“烛炎”并获得对应属性抗性；减益本身仍按原幅度结算。每层烛炎使自身魂技伤害提高10%，最多10层，层数与抗性持续整场战斗；无属性伤害与减益不记录、不叠层。被控制后的免控期由4秒延长至8秒；控制期间每回合对控制者造成其最大生命4%的火属性伤害。\",\n          \"params\": {\n            \"trigger\": \"attributed-damage-or-debuff-received\",\n            \"stackName\": \"烛炎\",\n            \"stackPerDamagePacket\": 1,\n            \"maxStacks\": 10,\n            \"stackLifetime\": \"battle\",\n            \"recordAttributeHits\": true,\n            \"resistanceAtHitCount\": 1,\n            \"resistanceDamageMultiplier\": 0.5,\n            \"resistanceIncludesThresholdHit\": false,\n            \"resistanceLifetime\": \"battle\",\n            \"recordNeutralDamage\": false,\n            \"stackOnNeutralDamage\": false,\n            \"compositeHitRecord\": \"each-non-neutral-tag-once-per-packet\",\n            \"compositeDamageStackCount\": 1,\n            \"repeatedResistancePolicy\": \"one-half-once-no-repeated-halving\",\n            \"controlImmunitySeconds\": 8,\n            \"controlReflectMaxHPRate\": 0.04,\n            \"controlReflectElement\": \"火\",\n            \"controlReflectCadence\": \"once-per-logical-turn-while-controlled\",\n            \"controlReflectTarget\": \"current-controller\",\n            \"controlReflectBypassShield\": false,\n            \"fireDamageImmunity\": false,\n            \"fireDamageToHealing\": 0,\n            \"saveFields\": [\n              \"candleFlameStacks\",\n              \"attributeHitCounts\",\n              \"resistedAttributes\",\n              \"currentControllerId\",\n              \"lastControlReflectTurn\"\n            ],\n            \"skillDamageUpPerStack\": 0.1,\n            \"resistanceAppliesToDebuffMagnitude\": false\n          },\n          \"implementation\": {\n            \"status\": \"live\",\n            \"handler\": \"beast:reverse-scale-unburned\",\n            \"version\": 1,\n            \"requiresHostAdapter\": false\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:reverse-scale-unburned\",\n            \"implementationVersion\": 1,\n            \"name\": \"赤烛不焚\",\n            \"effect\": \"首次受到某属性伤害时正常承受100%伤害，结算后获得该属性50%抗性，第二次及后续该属性伤害固定减半，不再继续减半。受到有属性伤害或被施加有属性减益时，叠1层“烛炎”并获得对应属性抗性；减益本身仍按原幅度结算。每层烛炎使自身魂技伤害提高10%，最多10层，层数与抗性持续整场战斗；无属性伤害与减益不记录、不叠层。被控制后的免控期由4秒延长至8秒；控制期间每回合对控制者造成其最大生命4%的火属性伤害。\",\n            \"params\": {\n              \"trigger\": \"attributed-damage-or-debuff-received\",\n              \"stackName\": \"烛炎\",\n              \"stackPerDamagePacket\": 1,\n              \"maxStacks\": 10,\n              \"stackLifetime\": \"battle\",\n              \"recordAttributeHits\": true,\n              \"resistanceAtHitCount\": 1,\n              \"resistanceDamageMultiplier\": 0.5,\n              \"resistanceIncludesThresholdHit\": false,\n              \"resistanceLifetime\": \"battle\",\n              \"recordNeutralDamage\": false,\n              \"stackOnNeutralDamage\": false,\n              \"compositeHitRecord\": \"each-non-neutral-tag-once-per-packet\",\n              \"compositeDamageStackCount\": 1,\n              \"repeatedResistancePolicy\": \"one-half-once-no-repeated-halving\",\n              \"controlImmunitySeconds\": 8,\n              \"controlReflectMaxHPRate\": 0.04,\n              \"controlReflectElement\": \"火\",\n              \"controlReflectCadence\": \"once-per-logical-turn-while-controlled\",\n              \"controlReflectTarget\": \"current-controller\",\n              \"controlReflectBypassShield\": false,\n              \"fireDamageImmunity\": false,\n              \"fireDamageToHealing\": 0,\n              \"saveFields\": [\n                \"candleFlameStacks\",\n                \"attributeHitCounts\",\n                \"resistedAttributes\",\n                \"currentControllerId\",\n                \"lastControlReflectTurn\"\n              ],\n              \"skillDamageUpPerStack\": 0.1,\n              \"resistanceAppliesToDebuffMagnitude\": false,\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"live\",\n            \"requiresHostAdapter\": false,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": [\n                \"candleFlameStacks\",\n                \"attributeHitCounts\",\n                \"resistedAttributes\",\n                \"currentControllerId\",\n                \"lastControlReflectTurn\"\n              ]\n            }\n          }\n        }\n      ],\n      \"years\": 100000,\n      \"available\": true,\n      \"battleTags\": [\n        \"hunt\"\n      ],\n      \"lifeType\": \"生活\",\n      \"level\": 91,\n      \"panel\": {\n        \"level\": 91,\n        \"rings\": 9,\n        \"benchmark\": 500,\n        \"ratingProfile\": \"npc\",\n        \"stats\": {\n          \"B\": 1125,\n          \"S\": 910,\n          \"C\": 1125,\n          \"D\": 860,\n          \"A\": 775,\n          \"P\": 775,\n          \"W\": 77\n        },\n        \"derived\": {\n          \"HP\": 8095,\n          \"baseMP\": 4610,\n          \"MP\": 6915,\n          \"SH\": 6420,\n          \"PA\": 968.75,\n          \"SA\": 783.5,\n          \"MA\": 630,\n          \"DEF\": 665,\n          \"MDEF\": 420.6,\n          \"costReduction\": 40,\n          \"castReduction\": 30,\n          \"controlGrowth\": 2.5\n        },\n        \"rating\": \"狂级\",\n        \"ratingScore\": 1.86\n      },\n      \"statBasis\": {\n        \"level\": 91,\n        \"benchmark\": 500,\n        \"W\": 77,\n        \"ratios\": [\n          2.25,\n          1.82,\n          2.25,\n          1.72,\n          1.55,\n          1.55\n        ],\n        \"bloodlineModifiesStats\": false,\n        \"note\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\"\n      },\n      \"skillPowerBasis\": {\n        \"stat\": \"S\",\n        \"value\": 910,\n        \"benchmark\": 500,\n        \"ratio\": 1.82,\n        \"rating\": \"狂级\",\n        \"label\": \"万年第五档\",\n        \"years\": 90000,\n        \"q\": 4\n      },\n      \"traitInheritanceVersion\": 1,\n      \"ringReward\": {\n        \"years\": 100000,\n        \"description\": \"十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技\"\n      },\n      \"bone\": {\n        \"slot\": \"random\",\n        \"slotPolicy\": \"prefer-unoccupied-six\",\n        \"description\": \"胜利后优先在未装备且未携带的常规部位中等概率抽取，六部位齐备才在全部六部位抽取；不生成外附骨，结果随奖励事务保存\"\n      },\n      \"exitRule\": \"hp-or-spirit-zero\",\n      \"implementation\": {\n        \"status\": \"host-integrated-v1205\",\n        \"hostIntegrated\": true,\n        \"skills\": \"operations-live\",\n        \"traits\": \"live\",\n        \"inheritanceHandlers\": \"live\"\n      }\n    }\n  ]\n}\n", "/modules/data/npc/chengliang.json": "{\n  \"schemaVersion\": 1,\n  \"id\": \"chengliang\",\n  \"name\": \"程良\",\n  \"nationality\": \"斗灵\",\n  \"gender\": \"男\",\n  \"level\": 81,\n  \"style\": \"控制\",\n  \"role\": \"空间控制／友方护持\",\n  \"soul\": {\n    \"id\": \"friendly-soul-mofang\",\n    \"name\": \"魔方\",\n    \"tier\": 9,\n    \"main_kind\": \"器\",\n    \"subkind\": \"阵器\",\n    \"attribute\": \"空间\",\n    \"attribute_category\": \"无属性\",\n    \"elements\": [],\n    \"mechanisms\": [\n      \"空间\"\n    ],\n    \"spirit_specialist\": false,\n    \"release_options\": [\n      \"召出\"\n    ],\n    \"balance\": [\n      0,\n      0,\n      0,\n      0,\n      0,\n      0\n    ],\n    \"basicChannel\": \"物理\"\n  },\n  \"release\": \"召出\",\n  \"rating\": \"狂级\",\n  \"ratingRatio\": 1.9,\n  \"model\": {\n    \"level\": 81,\n    \"rings\": 8,\n    \"benchmark\": 390,\n    \"stats\": {\n      \"B\": 652.08,\n      \"S\": 681.72,\n      \"C\": 918.84,\n      \"D\": 548.34,\n      \"A\": 785.46,\n      \"P\": 859.56,\n      \"W\": 80\n    },\n    \"derived\": {\n      \"HP\": 4785,\n      \"baseMP\": 3469,\n      \"MP\": 5203,\n      \"SH\": 7096,\n      \"PA\": 604.28,\n      \"SA\": 589.46,\n      \"MA\": 697.65,\n      \"DEF\": 414.59,\n      \"MDEF\": 463.78,\n      \"costReduction\": 40,\n      \"castReduction\": 30,\n      \"controlGrowth\": 2.5\n    },\n    \"breakdown\": {\n      \"B\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -20,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 246.08,\n        \"generated\": 406\n      },\n      \"S\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 10,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 130.72,\n        \"generated\": 551\n      },\n      \"C\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 20,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 338.84,\n        \"generated\": 580\n      },\n      \"D\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -10,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 132.34,\n        \"generated\": 416\n      },\n      \"A\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -10,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 350.46,\n        \"generated\": 435\n      },\n      \"P\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 10,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 346.56,\n        \"generated\": 513\n      },\n      \"W\": {\n        \"base\": 74,\n        \"grade\": 1,\n        \"style\": 0,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"deviation\": 6,\n        \"growth\": 0,\n        \"generated\": 80\n      }\n    },\n    \"ratingProfile\": \"npc\"\n  },\n  \"permanentProgress\": {\n    \"thiefQiStacks\": 0,\n    \"devourRemainder\": 0,\n    \"maximumStacks\": 10,\n    \"maximumRemainder\": 2,\n    \"carryAcrossBattles\": true\n  },\n  \"matureModel\": {\n    \"level\": 81,\n    \"rings\": 8,\n    \"benchmark\": 390,\n    \"stats\": {\n      \"B\": 1304.16,\n      \"S\": 681.72,\n      \"C\": 918.84,\n      \"D\": 548.34,\n      \"A\": 785.46,\n      \"P\": 859.56,\n      \"W\": 80\n    },\n    \"derived\": {\n      \"HP\": 9349,\n      \"baseMP\": 3469,\n      \"MP\": 5203,\n      \"SH\": 7096,\n      \"PA\": 1028.13,\n      \"SA\": 589.46,\n      \"MA\": 697.65,\n      \"DEF\": 545,\n      \"MDEF\": 463.78,\n      \"costReduction\": 40,\n      \"castReduction\": 30,\n      \"controlGrowth\": 2.5\n    },\n    \"breakdown\": {\n      \"B\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -20,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 246.08,\n        \"generated\": 406\n      },\n      \"S\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 10,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 130.72,\n        \"generated\": 551\n      },\n      \"C\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 20,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 338.84,\n        \"generated\": 580\n      },\n      \"D\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -10,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 132.34,\n        \"generated\": 416\n      },\n      \"A\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -10,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 350.46,\n        \"generated\": 435\n      },\n      \"P\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 10,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 346.56,\n        \"generated\": 513\n      },\n      \"W\": {\n        \"base\": 74,\n        \"grade\": 1,\n        \"style\": 0,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"deviation\": 6,\n        \"growth\": 0,\n        \"generated\": 80\n      }\n    },\n    \"ratingProfile\": \"npc\"\n  },\n  \"skills\": [\n    {\n      \"q\": 1.35,\n      \"K\": 2.2,\n      \"Q\": 2.97,\n      \"name\": \"演\",\n      \"category\": \"强化\",\n      \"channel\": \"能量\",\n      \"years\": 420,\n      \"target\": \"自己或一名队友\",\n      \"castFixed\": 0.7,\n      \"cooldown\": 14,\n      \"effect\": \"魔方推演已知的攻防变化，标记自己或一名队友。8秒内，其下一次攻击魂技的命中提高12个百分点，且该次准备时间缩短20%；开始施放时耗用。不能预知未知情报，也不改变伤害、冷却或骰果。\",\n      \"operations\": [\n        {\n          \"type\": \"next_attack_skill_accuracy\",\n          \"points\": 12,\n          \"uses\": 1,\n          \"ttlSeconds\": 8\n        },\n        {\n          \"type\": \"next_attack_skill_cast_multiplier\",\n          \"value\": 0.8,\n          \"sharedUse\": true\n        }\n      ],\n      \"id\": \"chengliang-skill-1\",\n      \"ring\": 1,\n      \"costPercent\": 0.06,\n      \"cost\": 125,\n      \"cast\": 0.7,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.35,\n      \"K\": 2.2,\n      \"Q\": 2.97,\n      \"name\": \"门\",\n      \"category\": \"防御\",\n      \"channel\": \"生命\",\n      \"years\": 760,\n      \"target\": \"自己或一名队友\",\n      \"castFixed\": 0.5,\n      \"cooldown\": 12,\n      \"effect\": \"在友方身侧展开相连的方门，6秒内为其转移一次冲击。下一次非精神直接攻击命中时，最终生命伤害减少45%，随后门扉闭合；不会增加行动机会，也不处理精神伤害、持续伤害或已结算的攻击。\",\n      \"operations\": [\n        {\n          \"type\": \"one_hit_damage_reduction\",\n          \"value\": 0.45,\n          \"channels\": [\n            \"物理\",\n            \"能量\"\n          ],\n          \"ttlSeconds\": 6,\n          \"directOnly\": true\n        }\n      ],\n      \"id\": \"chengliang-skill-2\",\n      \"ring\": 2,\n      \"costPercent\": 0.08,\n      \"cost\": 167,\n      \"cast\": 0.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.8,\n      \"K\": 2.2,\n      \"Q\": 3.96,\n      \"name\": \"锁\",\n      \"category\": \"控制\",\n      \"channel\": \"精神\",\n      \"years\": 1700,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1.1,\n      \"cooldown\": 16,\n      \"baseControl\": 3,\n      \"effect\": \"将魔方投影合拢在目标周围，按双方精神力与精神稳定进行普通控制判定。成功后打断读条，并以3秒为基础、按双方精神力比例结算禁锢；行动条压至最多40%，结束后获得4秒免控。目标仍可受伤，不进入不可选中状态；不永久封印敌人或拆除魂环。\",\n      \"operations\": [\n        {\n          \"type\": \"control_contest\",\n          \"baseSeconds\": 3,\n          \"ratio\": \"(100+attacker.P)/(100+defender.P)\",\n          \"interrupt\": true,\n          \"gaugeCeiling\": 0.4,\n          \"immunitySeconds\": 4\n        }\n      ],\n      \"id\": \"chengliang-skill-3\",\n      \"ring\": 3,\n      \"costPercent\": 0.09,\n      \"cost\": 202,\n      \"cast\": 1.1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.05,\n      \"K\": 2.2,\n      \"Q\": 4.51,\n      \"name\": \"封\",\n      \"category\": \"防御\",\n      \"channel\": \"生命\",\n      \"years\": 4800,\n      \"target\": \"自己\",\n      \"castFixed\": 1,\n      \"cooldown\": 18,\n      \"effect\": \"展开一层封存壁，获得0.65×Q×魂力攻击值的生命护盾，持续8秒。护盾实际吸收的能量直接伤害有50%封存为一份余能，至多为最大生命的15%。10秒内下一次攻击魂技命中后，以原能量伤害追加释放并按目标防御结算；未命中不释放，到期消散，不重复蓄存。场外仍可封存普通物品；战斗不调用师父预存魂技，也不收取敌方魂技或魂环。\",\n      \"operations\": [\n        {\n          \"type\": \"shield\",\n          \"coefficient\": 0.65,\n          \"power\": \"SA\",\n          \"ttlSeconds\": 8\n        },\n        {\n          \"type\": \"reserve_absorbed_energy\",\n          \"rate\": 0.5,\n          \"capMaxHP\": 0.15,\n          \"ttlSeconds\": 10,\n          \"slots\": 1\n        },\n        {\n          \"type\": \"next_attack_skill_hit_release\",\n          \"channel\": \"能量\",\n          \"mitigated\": true\n        }\n      ],\n      \"id\": \"chengliang-skill-4\",\n      \"ring\": 4,\n      \"costPercent\": 0.11,\n      \"cost\": 229,\n      \"cast\": 1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.2,\n      \"Q\": 6.16,\n      \"name\": \"隐\",\n      \"category\": \"防御\",\n      \"channel\": \"生命\",\n      \"years\": 11500,\n      \"target\": \"自己\",\n      \"castFixed\": 0.8,\n      \"cooldown\": 20,\n      \"effect\": \"将本体藏入裂隙，最多维持5秒。期间避开下一次非精神直接攻击，并立即回到现实；主动攻击也会提前现身。精神攻击、既有持续伤害与场地持续伤害照常结算。本回合不重开、不附送行动，也不能携带敌人进入裂隙。\",\n      \"operations\": [\n        {\n          \"type\": \"phase_avoid_once\",\n          \"channels\": [\n            \"物理\",\n            \"能量\"\n          ],\n          \"ttlSeconds\": 5,\n          \"directOnly\": true,\n          \"breakOnOffense\": true\n        }\n      ],\n      \"id\": \"chengliang-skill-5\",\n      \"ring\": 5,\n      \"costPercent\": 0.1,\n      \"cost\": 209,\n      \"cast\": 0.8,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.2,\n      \"Q\": 6.16,\n      \"name\": \"游\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 19000,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1,\n      \"cooldown\": 14,\n      \"factor\": 1.1,\n      \"effect\": \"以预先记下的坐标折跃至可交战位置，接续一记刀斩。造成1.2×Q×物理攻击值×1.10的原始伤害，再按命中、防御与护盾正常结算。本次命中额外提高10个百分点；不必中、不越盾、不额外触发一次普攻，也不将目标坐标重叠判为即死。\",\n      \"operations\": [\n        {\n          \"type\": \"direct_attack\",\n          \"factor\": 1.1,\n          \"channel\": \"物理\",\n          \"accuracyPoints\": 10\n        }\n      ],\n      \"id\": \"chengliang-skill-6\",\n      \"ring\": 6,\n      \"costPercent\": 0.12,\n      \"cost\": 517,\n      \"cast\": 1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.15,\n      \"K\": 2.2,\n      \"Q\": 6.93,\n      \"name\": \"虚空真身\",\n      \"category\": \"强化\",\n      \"channel\": \"能量\",\n      \"years\": 48000,\n      \"target\": \"自己\",\n      \"castFixed\": 1.6,\n      \"cooldown\": 32,\n      \"effect\": \"魔方展开为环绕周身的空间格架。12秒内魂力操纵提高20%、精神力提高15%、敏捷提高12%；沿用当前游戏的六维增益换算，不额外回满资源或提高生命上限。再次施放只刷新持续时间。空间转动作为护持与步法表现，不强制搬动敌人，不额外叠阵，也不改变三回合转位周期。\",\n      \"operations\": [\n        {\n          \"type\": \"temporary_stat_up\",\n          \"values\": {\n            \"C\": 0.2,\n            \"P\": 0.15,\n            \"A\": 0.12\n          },\n          \"ttlSeconds\": 12,\n          \"refreshOnly\": true,\n          \"refillResources\": false\n        }\n      ],\n      \"id\": \"chengliang-skill-7\",\n      \"ring\": 7,\n      \"costPercent\": 0.12,\n      \"cost\": 250,\n      \"cast\": 1.6,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.8,\n      \"K\": 2.2,\n      \"Q\": 8.36,\n      \"name\": \"解\",\n      \"category\": \"攻击\",\n      \"channel\": \"能量\",\n      \"years\": 88000,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1.4,\n      \"cooldown\": 20,\n      \"factor\": 0.9,\n      \"effect\": \"逆转魔方的结构，拆开目标最外层的生命护盾。先进行一次普通命中判定；成功后仅削去该护盾至多0.50×Q×魂力攻击值的盾量，再结算1.2×Q×魂力攻击值×0.90的能量攻击。没有生命护盾时仅造成攻击伤害。不能清除精神盾、无限次防护、角色固有机制或直接拆解生命；不重复判定命中，不同时拆除全部护盾。\",\n      \"operations\": [\n        {\n          \"type\": \"hit_contest_once\"\n        },\n        {\n          \"type\": \"reduce_outer_life_shield\",\n          \"coefficient\": 0.5,\n          \"power\": \"SA\",\n          \"layers\": 1\n        },\n        {\n          \"type\": \"direct_attack\",\n          \"factor\": 0.9,\n          \"channel\": \"能量\",\n          \"reuseHit\": true\n        }\n      ],\n      \"id\": \"chengliang-skill-8\",\n      \"ring\": 8,\n      \"costPercent\": 0.14,\n      \"cost\": 564,\n      \"cast\": 1.4,\n      \"extensionRequired\": true\n    }\n  ],\n  \"traits\": [\n    {\n      \"name\": \"周天格阵\",\n      \"effect\": \"开场布阵，持续至程良退场。每个有效个人回合开始时，所有在场敌人各叠1层困阵，每层敏捷降低5%；程良叠1层据阵，每层造成的伤害提高10%，两者各上限6层。每累计3个有效回合，先完成本回合叠层，再将双方层数分别减半并向下取整，随后继续累积。程良被控制时，暂停叠层与周期计数，已有层数保留；退场后清除本阵法的状态。\"\n    },\n    {\n      \"name\": \"六库仙贼\",\n      \"effect\": \"每个个人回合结束时回复最大生命的5%与最大魂力的5%，分别不超过各自上限。对有生命的受击实体造成实际生命伤害时，吸取该伤害的30%回复自身生命；不计算护盾、精神槽损失、过量伤害或自伤。每累计3次有效吞噬永久获得1层盗气，每层肉体强度提高10%，上限10层，跨战斗保留；满血仍可计吞噬次数，溢出治疗不转为护盾。免疫疲劳以及带衰老、腐坏标签的减益。对元素、灵体、构装、亡灵等无生命目标，吸血与盗气均不生效。\"\n    },\n    {\n      \"name\": \"易中日月\",\n      \"effect\": \"免疫幻象与伪装，面对分身、替身、虚影始终锁定真实本体。对高敏捷目标不计纯敏捷差造成的负向命中修正，完成闪避修正后的基础命中下限提高到60%。每个个人回合开始时锁定一名凝视对象，本回合对其命中提高8个百分点；该对象对程良造成的伤害同时提高10%，至下次选择或任一方退场。正向命中加成合计后最高97%，致盲等命中降低在保底之后结算，最终最低5%。识破不等于穿越位面或无视伤害免疫。\"\n    }\n  ],\n  \"implementation\": {\n    \"status\": \"specification-only\",\n    \"integrated\": false,\n    \"turnClock\": \"个人回合：从获得一次正常行动机会到该次行动结束；普攻、魂技、防御等正常行动均计，附赠普攻、持续伤害跳数、连击分段和凝视选择不额外计回合。\",\n    \"grid\": {\n      \"maxStacks\": 6,\n      \"agilityDownPerStack\": 0.05,\n      \"damageUpPerStack\": 0.1,\n      \"period\": 3,\n      \"rounding\": \"floor\",\n      \"order\": \"add-then-halve-before-action\",\n      \"pauseCounterWhileControlled\": true,\n      \"removeOnOwnerDefeat\": true\n    },\n    \"regeneration\": {\n      \"endTurnMaxHPRate\": 0.05,\n      \"lifestealRate\": 0.3,\n      \"eventsPerPermanentStack\": 3,\n      \"bodyUpPerPermanentStack\": 0.1,\n      \"maximumPermanentStacks\": 10,\n      \"appliesToLivingOnly\": true,\n      \"actualHPOnly\": true,\n      \"countAtFullHP\": true,\n      \"unclassifiedLifeType\": \"ineligible-until-tagged\",\n      \"raiseHPMaximumWithoutRefill\": true,\n      \"endTurnMaxMPRate\": 0.05\n    },\n    \"vision\": {\n      \"ignoreIllusion\": true,\n      \"ignoreDisguise\": true,\n      \"selectRealBody\": true,\n      \"ignoreNegativeAgilityDifference\": true,\n      \"preDebuffHitFloor\": 0.6,\n      \"gazeHitPoints\": 8,\n      \"gazeIncomingDamageMultiplier\": 1.1,\n      \"hitCap\": 0.97,\n      \"postDebuffHitFloor\": 0.05\n    },\n    \"requiredAdapters\": [\n      \"personal-turn-events\",\n      \"life-type-tags\",\n      \"permanent-npc-progress\",\n      \"scoped-grid-states\",\n      \"real-body-targeting\",\n      \"gaze-target-selection\",\n      \"per-hit-skill-extensions\"\n    ],\n    \"notes\": [\n      \"本项目是事件可读取的角色规范，未向主游戏注册，不能把operations直接传入旧战斗引擎当成已经实现的技能。\",\n      \"行动机会开始和结束各触发一次回合钩子；控制期间跳过场地钩子，不借无效指令刷层；连击、追击和防御反击均不能另开回合。\",\n      \"阵法伤害倍率作用于程良自己造成的已结算伤害；盗气不是场内临时buff，读取永久层数时只应用一次。\",\n      \"生命实体判定依据实际受击者，不凭其武魂是否元素属性推断；阵法来源清除只移除程良自己的状态。\",\n      \"演与易中日月、游的命中加成可以相加，最高97%；控制技能另走精神对抗，不将攻击命中保底套到控制成功率。\",\n      \"凝视每回合至多选择一次，可沿用上一存活敌人；不产生独立行动。多个友方使用者的场地来源需分别记账，不共享层数。\"\n    ]\n  }\n}", "/modules/data/npc/manifest.json": "{\n  \"rosterVersion\": 1,\n  \"copiedFrom\": \"../../../../../友方npc/characters\",\n  \"sourceNote\": \"友方npc 名录为独立规范，尚未接入主游戏战斗；本目录只保存只读快照。\",\n  \"files\": [\n    {\n      \"id\": \"chengliang\",\n      \"name\": \"程良\",\n      \"file\": \"chengliang.json\",\n      \"sha256\": \"1fc780214649005e0af03dc6db7b99d5e4a387807e9426f98fd5e676dec87633\",\n      \"bytes\": 18313,\n      \"level\": 81,\n      \"rating\": \"狂级\",\n      \"traitCount\": 3,\n      \"skillCount\": 8\n    },\n    {\n      \"id\": \"sailiya_fengzhi\",\n      \"name\": \"赛利亚·风织\",\n      \"file\": \"sailiya_fengzhi.json\",\n      \"sha256\": \"6713b447ef674e01bff431bb3d5823144fc8e653f236e5d0f4fe2dfb5a1fad87\",\n      \"bytes\": 19834,\n      \"level\": 81,\n      \"rating\": \"强级\",\n      \"traitCount\": 2,\n      \"skillCount\": 8\n    },\n    {\n      \"id\": \"xutaiping\",\n      \"name\": \"徐太平\",\n      \"file\": \"xutaiping.json\",\n      \"sha256\": \"5717eae771ae4027f04291489cefd942a1c8c18868d4f8db8d30a093fcc2c850\",\n      \"bytes\": 17969,\n      \"level\": 81,\n      \"rating\": \"强级\",\n      \"traitCount\": 2,\n      \"skillCount\": 8\n    }\n  ]\n}\n", "/modules/data/npc/sailiya_fengzhi.json": "{\n  \"schemaVersion\": 1,\n  \"id\": \"sailiya_fengzhi\",\n  \"name\": \"赛利亚·风织\",\n  \"aliases\": [\n    \"赛丽亚·风织\",\n    \"赛利亚\",\n    \"赛丽亚\"\n  ],\n  \"nationality\": \"斗灵\",\n  \"gender\": \"女\",\n  \"level\": 81,\n  \"stage\": \"魂斗罗\",\n  \"sect\": \"天枢宗·承露门\",\n  \"style\": \"敏攻\",\n  \"role\": \"敏攻双剑／符剑消耗／受伤回魂\",\n  \"soul\": {\n    \"id\": \"friendly-soul-tianhuiyujian\",\n    \"name\": \"天廻羽剑\",\n    \"tier\": 9,\n    \"main_kind\": \"器\",\n    \"subkind\": \"战斗\",\n    \"attribute\": \"风\",\n    \"attribute_category\": \"单属性\",\n    \"elements\": [\n      \"风\"\n    ],\n    \"mechanisms\": [],\n    \"spirit_specialist\": false,\n    \"release_options\": [\n      \"召出\"\n    ],\n    \"balance\": [\n      0,\n      0,\n      0,\n      0,\n      0,\n      0\n    ],\n    \"basicChannel\": \"物理\"\n  },\n  \"release\": \"召出\",\n  \"rating\": \"强级\",\n  \"ratingRatio\": 1.5,\n  \"appearance\": \"白色齐肩短发夹带黛色挑染，右手缠绕绷带；双持细长弯钩剑，黑白羽翼覆剑，靛青刃锋近乎隐形。\",\n  \"model\": {\n    \"level\": 81,\n    \"rings\": 8,\n    \"benchmark\": 390,\n    \"stats\": {\n      \"B\": 643.5,\n      \"S\": 666.9,\n      \"C\": 526.5,\n      \"D\": 339.3,\n      \"A\": 854.1,\n      \"P\": 479.7,\n      \"W\": 78\n    },\n    \"derived\": {\n      \"HP\": 4725,\n      \"baseMP\": 3395,\n      \"MP\": 7638,\n      \"SH\": 4058,\n      \"PA\": 595,\n      \"SA\": 576.87,\n      \"MA\": 393.76,\n      \"DEF\": 308.35,\n      \"MDEF\": 273.25,\n      \"costReduction\": 40,\n      \"castReduction\": 30,\n      \"controlGrowth\": 2.5\n    },\n    \"breakdown\": {\n      \"B\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 0,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 140.5,\n        \"generated\": 503\n      },\n      \"S\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 0,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 163.9,\n        \"generated\": 503\n      },\n      \"C\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 10,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": -5.5,\n        \"generated\": 532\n      },\n      \"D\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -20,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": -28.7,\n        \"generated\": 368\n      },\n      \"A\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 30,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 225.1,\n        \"generated\": 629\n      },\n      \"P\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -20,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 111.7,\n        \"generated\": 368\n      },\n      \"W\": {\n        \"base\": 74,\n        \"grade\": 1,\n        \"style\": 0,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"deviation\": 4,\n        \"growth\": 0,\n        \"generated\": 78\n      }\n    },\n    \"ratingProfile\": \"npc\"\n  },\n  \"skills\": [\n    {\n      \"q\": 1.35,\n      \"K\": 2.2,\n      \"Q\": 2.97,\n      \"name\": \"回羽双刺\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 420,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 0.6,\n      \"cooldown\": 6,\n      \"factor\": 0.75,\n      \"role\": \"快速双剑试探\",\n      \"effect\": \"双持细剑先后刺出，钩旋收刃。总原始伤害为1.2×Q×物理攻击值×0.75，均分为两段，各自命中与正常减伤；两段共用一次施放、一次冷却与一次符剑选择。准备短，适合寻找破绽，不附送第三次普攻。\",\n      \"operations\": [\n        {\n          \"type\": \"partitioned_attack\",\n          \"channel\": \"物理\",\n          \"factor\": 0.75,\n          \"parts\": 2,\n          \"hitPolicy\": \"per_part\",\n          \"sharedCast\": true,\n          \"sharedRuneActivation\": true\n        }\n      ],\n      \"id\": \"sailiya-skill-1\",\n      \"ring\": 1,\n      \"costPercent\": 0.1,\n      \"cost\": 228,\n      \"cast\": 0.6,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.35,\n      \"K\": 2.2,\n      \"Q\": 2.97,\n      \"name\": \"星月静谧\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 760,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1.5,\n      \"cooldown\": 16,\n      \"factor\": 0.95,\n      \"role\": \"蓄势点刺与读条干扰\",\n      \"effect\": \"星与月的光辉在双剑之间蓄成，随一记即沾即走的刺探迸发。造成1.2×Q×物理攻击值×0.95的原始伤害，按普通命中、防御与护盾结算。命中时若目标正在准备魂技，另作一次普通精神对抗；成功则打断，并以1秒为基础按精神力比例结算短控，随后保留4秒免控窗。目标没有读条时只造成伤害；不直接封死魂力循环。\",\n      \"operations\": [\n        {\n          \"type\": \"direct_attack\",\n          \"channel\": \"物理\",\n          \"factor\": 0.95\n        },\n        {\n          \"type\": \"conditional_control_contest\",\n          \"condition\": \"target_casting_and_attack_hit\",\n          \"baseSeconds\": 1,\n          \"immunitySeconds\": 4,\n          \"interrupt\": true\n        }\n      ],\n      \"id\": \"sailiya-skill-2\",\n      \"ring\": 2,\n      \"costPercent\": 0.12,\n      \"cost\": 265,\n      \"cast\": 1.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.8,\n      \"K\": 2.2,\n      \"Q\": 3.96,\n      \"name\": \"化羽华\",\n      \"category\": \"强化\",\n      \"channel\": \"能量\",\n      \"years\": 1700,\n      \"target\": \"自己\",\n      \"castFixed\": 1,\n      \"cooldown\": 20,\n      \"role\": \"血敕蓄羽，强化有限次数攻击\",\n      \"effect\": \"支付最大生命6%的生命费用，令黑白羽织自剑上生长，血色法符托住三枚风羽。随后三次攻击魂技的主攻击原始伤害提高15%，每次施放只消耗一枚，整次连击共用；三枚风羽保留至耗尽或战斗结束。重复施放只将余数补至三枚，不叠加增幅。施放须保证支付后仍存活；这笔生命费用不产生秘元，不治疗也不生成护盾。符剑以增强后的主攻击为基数，但不会再被单独增幅一次。\",\n      \"operations\": [\n        {\n          \"type\": \"hp_cost\",\n          \"maxHPRate\": 0.06,\n          \"mustRemainAlive\": true,\n          \"countsAsDamage\": false\n        },\n        {\n          \"type\": \"charged_attack_modifier\",\n          \"rawMultiplier\": 1.15,\n          \"charges\": 3,\n          \"maxCharges\": 3,\n          \"lifetime\": \"battle\",\n          \"recastPolicy\": \"refill-not-stack\",\n          \"consumePerCast\": 1,\n          \"applyToMainAttackOnly\": true\n        }\n      ],\n      \"id\": \"sailiya-skill-3\",\n      \"ring\": 3,\n      \"costPercent\": 0.09,\n      \"cost\": 184,\n      \"cast\": 1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.05,\n      \"K\": 2.2,\n      \"Q\": 4.51,\n      \"name\": \"天阑舞\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 4800,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 0.8,\n      \"cooldown\": 18,\n      \"factor\": 1.6,\n      \"role\": \"可被打断的持续剑舞\",\n      \"effect\": \"法符连血色燃起，双剑牵动黑白羽翼，将风卷成连续六次斩击。进入剑舞后，每0.5秒结算一段，总原始伤害为1.2×Q×物理攻击值×1.60，均分六段，各段独立命中、正常减伤。剑舞期间不能另起正常行动；被控制、打断或退场时，尚未挥出的斩击终止。一次剑舞只支付一次符剑附加费，附伤预算随实际挥出并命中的分段结算，未完成部分不追加伤害，也不退还已经支付的费用。\",\n      \"operations\": [\n        {\n          \"type\": \"channeled_partitioned_attack\",\n          \"channel\": \"物理\",\n          \"factor\": 1.6,\n          \"parts\": 6,\n          \"intervalSeconds\": 0.5,\n          \"hitPolicy\": \"per_part\",\n          \"interruptible\": true,\n          \"blockOtherActions\": true,\n          \"sharedRuneActivation\": true,\n          \"unexecutedParts\": \"discard\"\n        }\n      ],\n      \"id\": \"sailiya-skill-4\",\n      \"ring\": 4,\n      \"costPercent\": 0.15,\n      \"cost\": 533,\n      \"cast\": 0.8,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.2,\n      \"Q\": 6.16,\n      \"name\": \"牵丝风\",\n      \"category\": \"防御\",\n      \"channel\": \"生命\",\n      \"years\": 11500,\n      \"target\": \"自己\",\n      \"castFixed\": 0.5,\n      \"cooldown\": 12,\n      \"role\": \"有限偏斜，避开一次直接攻势\",\n      \"effect\": \"千丝之风牵引身形偏倚，保留一次偏斜机会，直至遭受下一次非精神直接攻击或本场战斗结束。该次攻击的命中额外降低25个百分点，无论最终命中与否均消耗机会；同来源不能囤积。它不提供减伤或护盾，不规避已有持续伤害；明确无视闪避、强制命中或已锁定空间的攻击不受这次偏斜影响。\",\n      \"operations\": [\n        {\n          \"type\": \"one_use_evasion\",\n          \"incomingHitPoints\": -25,\n          \"uses\": 1,\n          \"lifetime\": \"battle\",\n          \"channels\": [\n            \"物理\",\n            \"能量\"\n          ],\n          \"directOnly\": true,\n          \"consumeOnHitAttempt\": true,\n          \"ignoreAgainst\": [\n            \"bypass_evasion\",\n            \"forced_hit\",\n            \"space_lock\"\n          ],\n          \"maxStoredUses\": 1\n        }\n      ],\n      \"id\": \"sailiya-skill-5\",\n      \"ring\": 5,\n      \"costPercent\": 0.08,\n      \"cost\": 163,\n      \"cast\": 0.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.2,\n      \"Q\": 6.16,\n      \"name\": \"青红敕剑\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 19000,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1.2,\n      \"cooldown\": 18,\n      \"factor\": 0.85,\n      \"budgetFactor\": 1.25,\n      \"role\": \"双符合敕，先削生命盾再斩击\",\n      \"effect\": \"以断肠之红、真实之青合敕双剑。作一次普通命中判定；命中后先以0.45×Q×魂力攻击值削减目标最外层生命护盾，再造成1.2×Q×物理攻击值×0.85的物理原始伤害。削盾部分不足以摧毁护盾时，后续攻击仍正常受剩余护盾阻挡；没有生命护盾时，该部分不转为生命伤害。整式只附加一次符剑，削盾段不重复生成附伤基数，不移除精神盾、免疫或角色固有机制。\",\n      \"operations\": [\n        {\n          \"type\": \"hit_contest_once\"\n        },\n        {\n          \"type\": \"reduce_outer_life_shield\",\n          \"coefficient\": 0.45,\n          \"power\": \"SA\",\n          \"layers\": 1,\n          \"damageIfNoShield\": 0,\n          \"runeBasis\": false\n        },\n        {\n          \"type\": \"direct_attack\",\n          \"channel\": \"物理\",\n          \"factor\": 0.85,\n          \"reuseHit\": true\n        }\n      ],\n      \"id\": \"sailiya-skill-6\",\n      \"ring\": 6,\n      \"costPercent\": 0.14,\n      \"cost\": 563,\n      \"cast\": 1.2,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.15,\n      \"K\": 2.2,\n      \"Q\": 6.93,\n      \"name\": \"天廻真身\",\n      \"category\": \"强化\",\n      \"channel\": \"能量\",\n      \"years\": 48000,\n      \"target\": \"自己\",\n      \"castFixed\": 1.5,\n      \"cooldown\": 32,\n      \"role\": \"双剑真身，强化持续攻伐\",\n      \"effect\": \"黑白羽翼自双剑展开，靛青刃锋如细线贯入风中。本场战斗内物理攻击值提高20%，同来源重施不叠层。该效果作用于攻击值，不赠送额外斩击或回合，不提供新的减伤、治疗或魂力上限加成。秘元归宿体与符剑仍按各自规则结算。\",\n      \"operations\": [\n        {\n          \"type\": \"battle_attack_up\",\n          \"channel\": \"物理\",\n          \"value\": 0.2,\n          \"lifetime\": \"battle\",\n          \"sameSourcePolicy\": \"replace-not-stack\",\n          \"extraActions\": 0\n        }\n      ],\n      \"id\": \"sailiya-skill-7\",\n      \"ring\": 7,\n      \"costPercent\": 0.12,\n      \"cost\": 245,\n      \"cast\": 1.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.8,\n      \"K\": 2.2,\n      \"Q\": 8.36,\n      \"name\": \"万羽归风\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 88000,\n      \"target\": \"敌方全体\",\n      \"castFixed\": 2,\n      \"cooldown\": 26,\n      \"factor\": 1.25,\n      \"role\": \"分配总威力的群体终式\",\n      \"effect\": \"万千羽翼卷向剑锋，将乱舞尽数压入一阵纵横的风。整次原始伤害预算为1.2×Q×物理攻击值×1.25，在施放完成时所有存活敌人之间均分，各目标独立命中并按防御与护盾结算；未命中份额不转移给其他目标。整式只选择一次符剑、支付一次附加费，附伤按各目标主攻击份额分别结算，不因敌人数增加总伤害预算。目标数于施放完成时固定，不追补后来入场者。\",\n      \"operations\": [\n        {\n          \"type\": \"budgeted_area_attack\",\n          \"channel\": \"物理\",\n          \"factor\": 1.25,\n          \"totalBudgetFixed\": true,\n          \"splitPolicy\": \"equal_living_targets_at_release\",\n          \"hitPolicy\": \"per_target\",\n          \"missedShares\": \"discard\",\n          \"sharedRuneActivation\": true\n        }\n      ],\n      \"id\": \"sailiya-skill-8\",\n      \"ring\": 8,\n      \"costPercent\": 0.18,\n      \"cost\": 571,\n      \"cast\": 2,\n      \"extensionRequired\": true\n    }\n  ],\n  \"traits\": [\n    {\n      \"name\": \"承露符锋\",\n      \"effect\": \"每次普通攻击或攻击魂技施放时，可在正常费用之外，再支付本次实际魂力费用的50%，为整次攻击附加一次符剑。符剑以各主攻击段进入生命护盾与承伤分配前的有效伤害为基数，取其30%作为附伤原始值，自动选择目标元素抗性最低的一项，再结算对应元素抗性、护盾与承伤机制；主攻击已结算的普通防御不重复扣除。连击和群攻共享一次附加选择与费用，不因附伤再次触发。魂力不足时不能附加，但可只施放原攻击。被该次攻击命中的目标，若在抵挡主攻击或附伤时实际消耗魂力，对应的本次抵挡魂力费用翻倍；预先付费护盾不追溯收费，免费护盾、纯肉体承伤或绝对免伤不凭空产生费用。\"\n    },\n    {\n      \"name\": \"秘元归宿体\",\n      \"effect\": \"魂力上限提高50%，每个个人回合结束回复有效最大魂力的5%。自上次个人回合结束以来，真实受到的生命或精神护持伤害有20%凝为秘元，在本次回合末等量回复魂力，不超过魂力上限；护盾损失、过量伤害、主动支付的生命费用与自伤不计。若本次结算周期被带有封锁或禁绝标签的效果命中，则该周期不凝结秘元，待凝结量清空，不留到下一回合；其他回魂是否受阻依封锁效果本身结算。她不受隐匿与目标高速造成的命中惩罚，能锁定隐形或虚化目标，但仍受正常命中判定与明确伤害免疫约束。\"\n    }\n  ],\n  \"implementation\": {\n    \"status\": \"specification-only\",\n    \"integrated\": false,\n    \"numericStatusLifetime\": \"battle_or_consumed\",\n    \"turnClock\": \"个人回合以一次正常行动机会至行动结束计；连击分段、符剑附伤、持续伤害跳数不额外计回合。受伤凝元从上次回合末累计至本次回合末，包含待机期间的真实受伤。\",\n    \"runeEdge\": {\n      \"optional\": true,\n      \"extraCostRate\": 0.5,\n      \"extraCostRounding\": \"ceil\",\n      \"basisCost\": \"actual_main_attack_cost_before_rune_surcharge\",\n      \"damageRate\": 0.3,\n      \"damageBasis\": \"main_damage_after_hit_and_ordinary_defense_before_shields_and_resource_routing\",\n      \"additionalDamageMitigated\": true,\n      \"ordinaryDefenseAlreadyAccounted\": true,\n      \"lifeDamageOnly\": true,\n      \"includeShieldedMainDamage\": true,\n      \"excludeShieldStrip\": true,\n      \"activationUnit\": \"one_basic_or_one_skill_cast\",\n      \"partPolicy\": \"allocate_to_executed_hit_parts\",\n      \"targetPolicy\": \"allocate_to_main_target_shares\",\n      \"recursive\": false,\n      \"defenseResourceCostMultiplier\": 2,\n      \"defenseCostScope\": \"actual_on_hit_resource_cost_only\",\n      \"noRetroactiveShieldCastFees\": true,\n      \"zeroCostDefenseSurcharge\": 0,\n      \"multiplyCostOnlyOnce\": true,\n      \"elementSelection\": {\n        \"eligible\": [\n          \"金\",\n          \"木\",\n          \"水\",\n          \"火\",\n          \"土\",\n          \"毒\",\n          \"风\",\n          \"雷\",\n          \"光\",\n          \"暗\",\n          \"冰\"\n        ],\n        \"minimum\": \"effective_target_element_resistance\",\n        \"tiePriority\": [\n          \"风\",\n          \"金\",\n          \"木\",\n          \"水\",\n          \"火\",\n          \"土\",\n          \"毒\",\n          \"雷\",\n          \"光\",\n          \"暗\",\n          \"冰\"\n        ],\n        \"missingTableFallback\": \"neutral_energy_no_repeat_base_defense\",\n        \"mentalSlotEligible\": false,\n        \"ignoreImmunity\": false\n      }\n    },\n    \"secretOrigin\": {\n      \"maxMPMultiplier\": 1.5,\n      \"costBaseMPUnchanged\": true,\n      \"normalMaxMP\": 5092,\n      \"effectiveMaxMP\": 7638,\n      \"endTurnMPRecoveryRate\": 0.05,\n      \"damageToMPRecoveryRate\": 0.2,\n      \"poolLosses\": [\n        \"HP\",\n        \"SH\"\n      ],\n      \"exclude\": [\n        \"shield_loss\",\n        \"overkill\",\n        \"hp_cost\",\n        \"self_damage\",\n        \"resource_cost\"\n      ],\n      \"pendingExpires\": \"owner_turn_end\",\n      \"sealTags\": [\n        \"resource_seal\",\n        \"resource_prohibition\"\n      ],\n      \"discardPendingOnSeal\": true,\n      \"revives\": false,\n      \"endTurnRecoveryOrder\": [\n        \"max_mp_5percent\",\n        \"damage_conversion_20percent\"\n      ],\n      \"separateRecoveryEventIDs\": true\n    },\n    \"perception\": {\n      \"ignoreConcealmentAccuracyPenalty\": true,\n      \"ignoreNegativeAgilityDifference\": true,\n      \"canSelectInvisible\": true,\n      \"canSelectPhased\": true,\n      \"bypassHitRoll\": false,\n      \"bypassDamageImmunity\": false,\n      \"positiveHitCap\": 0.97,\n      \"negativeHitFloor\": 0.05\n    },\n    \"requiredAdapters\": [\n      \"optional_rune_payment\",\n      \"grouped_attack_budget\",\n      \"element_resistance_table\",\n      \"on_hit_defense_resource_fee\",\n      \"turn_end_recovery\",\n      \"actual_damage_ledger\",\n      \"resource_seal_tags\",\n      \"real_target_perception\",\n      \"charged_attack_modifier\",\n      \"interruptible_sword_dance\",\n      \"budgeted_area_attack\"\n    ],\n    \"notes\": [\n      \"符剑追踪整次施放标识；一击多段、群体攻击及符剑本身均不能递归征费或附伤。\",\n      \"免费攻击的本次费用为0时，符剑的50%附加费也为0；正数附加费向上取整。\",\n      \"默认不逐元素猜测抗性。缺少完整元素抗性数据时，附伤按中性能量附伤处理，不重复扣除主攻击已结算的普通防御，不臆造最低抗性或转为真实伤害、精神槽伤害。\",\n      \"倍耗只改变抵挡魂力的单价，不把同一笔伤害再复制一份。若某承伤机制原拟用90魂力抵挡90伤害，倍耗后需180魂力；仅余100魂力时最多抵挡50伤害，其余按原承伤规则回落。\",\n      \"幽行在护盾后的非精神伤害中转魂力承伤时会产生实际费用，可受倍耗；祥光等入场免费盾不因命中补扣魂力。此处只规定交互，不宣称必胜或抽空对手全部魂力。\",\n      \"魂力上限增幅只施加一次，保留原始baseMP作为魂技和普攻费用基数，不因上限扩大而再次抬高同一技能的费用。\",\n      \"秘元不是护盾、减伤或生命治疗；致命伤害造成退场后，不再执行回合末回魂。5%回复与20%凝元分别发出回复事件，能被明确拦截回魂的规则处理。\",\n      \"仅带真实封锁／禁绝标签并实际命中的效果可阻止该周期凝元；不能只凭技能名称含封、锁就判定封锁魂力。\",\n      \"化羽华的生命费用不纳入受伤凝元；回魂与附伤都不产生额外行动。\"\n    ]\n  }\n}", "/modules/data/npc/xutaiping.json": "{\n  \"schemaVersion\": 1,\n  \"id\": \"xutaiping\",\n  \"name\": \"徐太平\",\n  \"nationality\": \"斗灵\",\n  \"gender\": \"女\",\n  \"level\": 81,\n  \"stage\": \"魂斗罗\",\n  \"style\": \"辅助\",\n  \"role\": \"减益特化／团队集火辅助\",\n  \"soul\": {\n    \"id\": \"friendly-soul-yemodengjiao\",\n    \"name\": \"夜魔灯鲛\",\n    \"tier\": 10,\n    \"main_kind\": \"兽\",\n    \"subkind\": \"水生\",\n    \"attribute\": \"暗\",\n    \"attribute_category\": \"单属性\",\n    \"elements\": [\n      \"暗\"\n    ],\n    \"mechanisms\": [],\n    \"spirit_specialist\": false,\n    \"release_options\": [\n      \"附体\",\n      \"召唤\"\n    ],\n    \"balance\": [\n      0,\n      0,\n      0,\n      0,\n      0,\n      0\n    ]\n  },\n  \"release\": \"附体\",\n  \"rating\": \"强级\",\n  \"ratingRatio\": 1.5,\n  \"model\": {\n    \"level\": 81,\n    \"rings\": 8,\n    \"benchmark\": 390,\n    \"stats\": {\n      \"B\": 386.1,\n      \"S\": 549.9,\n      \"C\": 748.8,\n      \"D\": 421.2,\n      \"A\": 514.8,\n      \"P\": 889.2,\n      \"W\": 76\n    },\n    \"derived\": {\n      \"HP\": 2923,\n      \"baseMP\": 2810,\n      \"MP\": 4214,\n      \"SH\": 7334,\n      \"PA\": 398.44,\n      \"SA\": 477.42,\n      \"MA\": 721.36,\n      \"DEF\": 297.82,\n      \"MDEF\": 477.4,\n      \"costReduction\": 40,\n      \"castReduction\": 30,\n      \"controlGrowth\": 2.5\n    },\n    \"breakdown\": {\n      \"B\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": -20,\n        \"shape\": 8,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": -59.9,\n        \"generated\": 446\n      },\n      \"S\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": 10,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": -8.1,\n        \"generated\": 558\n      },\n      \"C\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": 20,\n        \"shape\": -8,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 180.8,\n        \"generated\": 568\n      },\n      \"D\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": -10,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": -34.8,\n        \"generated\": 456\n      },\n      \"A\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": -10,\n        \"shape\": 6,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 27.8,\n        \"generated\": 487\n      },\n      \"P\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": 10,\n        \"shape\": -6,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 362.2,\n        \"generated\": 527\n      },\n      \"W\": {\n        \"base\": 74,\n        \"grade\": 1,\n        \"style\": 0,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"deviation\": 2,\n        \"growth\": 0,\n        \"generated\": 76\n      }\n    },\n    \"ratingProfile\": \"npc\"\n  },\n  \"skills\": [\n    {\n      \"q\": 1.35,\n      \"K\": 2.35,\n      \"Q\": 3.17,\n      \"name\": \"黑蚀\",\n      \"category\": \"减益\",\n      \"channel\": \"能量\",\n      \"years\": 420,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1,\n      \"cooldown\": 16,\n      \"role\": \"延迟复合诅咒\",\n      \"effect\": \"抬灯指向目标，按双方精神力与精神稳定作一次减益对抗。成功后，目标头顶浮现三盏亮黄魂灯；持续灌注，每2秒熄灭一盏，三灯俱灭时诅咒落下：敏捷降低20%，造成的伤害降低15%，持续至本场战斗结束，可被正常净化。灌注期间可作其他正常行动；徐太平受控时暂停灌注，解除后继续，布标满12秒尚未完成则散去。标记可被净化，徐太平退场时未完成的灯消散；不即时禁锢或清空行动条。同一目标只能保留她的一组三灯，重复施放不叠组、不提前引爆。\",\n      \"operations\": [\n        {\n          \"type\": \"debuff_contest\",\n          \"once\": true\n        },\n        {\n          \"type\": \"delayed_three_lamps\",\n          \"intervalSeconds\": 2,\n          \"lamps\": 3,\n          \"timeoutSeconds\": 12,\n          \"pauseOnOwnerControl\": true,\n          \"dispelEligible\": true,\n          \"removeIncompleteOnOwnerDefeat\": true,\n          \"slotsPerTarget\": 1\n        },\n        {\n          \"type\": \"numeric_debuff\",\n          \"values\": {\n            \"agilityDown\": 0.2,\n            \"damageDown\": 0.15\n          },\n          \"lifetime\": \"battle\",\n          \"trigger\": \"three_lamps_extinguished\",\n          \"amplifierSnapshot\": \"curse_resolution_before_group\"\n        }\n      ],\n      \"id\": \"xutaiping-skill-1\",\n      \"ring\": 1,\n      \"costPercent\": 0.08,\n      \"cost\": 135,\n      \"cast\": 1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.35,\n      \"K\": 2.35,\n      \"Q\": 3.17,\n      \"name\": \"沉鳞\",\n      \"category\": \"减益\",\n      \"channel\": \"能量\",\n      \"years\": 760,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 0.8,\n      \"cooldown\": 14,\n      \"role\": \"破除防御\",\n      \"effect\": \"银蓝鳞光落在目标护甲的接缝。通过普通减益对抗后，防御与精神抗御各降低15%，持续至本场战斗结束；同来源重施只更新幅度，不叠加层数，可被正常净化。不直接削去护盾，也不穿透角色固有伤害免疫。\",\n      \"operations\": [\n        {\n          \"type\": \"debuff_contest\"\n        },\n        {\n          \"type\": \"numeric_debuff\",\n          \"values\": {\n            \"defDown\": 0.15,\n            \"mindDown\": 0.15\n          },\n          \"lifetime\": \"battle\",\n          \"sameSourcePolicy\": \"replace-not-stack\",\n          \"amplifierSnapshot\": \"before_cast_group\"\n        }\n      ],\n      \"id\": \"xutaiping-skill-2\",\n      \"ring\": 2,\n      \"costPercent\": 0.08,\n      \"cost\": 135,\n      \"cast\": 0.8,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.8,\n      \"K\": 2.35,\n      \"Q\": 4.23,\n      \"name\": \"窒流\",\n      \"category\": \"减益\",\n      \"channel\": \"能量\",\n      \"years\": 1700,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1,\n      \"cooldown\": 16,\n      \"role\": \"抬高魂技消耗\",\n      \"effect\": \"暗潮堵塞目标的魂力流转。通过普通减益对抗后，其魂技消耗提高20%，持续至本场战斗结束；原本免费或无需支付魂力的效果不因此产生费用，不直接扣除现有魂力，也不改变普通攻击的费用。同来源重施只更新幅度，不叠加层数，可被正常净化。\",\n      \"operations\": [\n        {\n          \"type\": \"debuff_contest\"\n        },\n        {\n          \"type\": \"numeric_debuff\",\n          \"values\": {\n            \"skillCostUp\": 0.2\n          },\n          \"lifetime\": \"battle\",\n          \"paidSoulSkillsOnly\": true,\n          \"sameSourcePolicy\": \"replace-not-stack\",\n          \"amplifierSnapshot\": \"before_cast_group\"\n        }\n      ],\n      \"id\": \"xutaiping-skill-3\",\n      \"ring\": 3,\n      \"costPercent\": 0.09,\n      \"cost\": 152,\n      \"cast\": 1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.05,\n      \"K\": 2.35,\n      \"Q\": 4.82,\n      \"name\": \"噤声\",\n      \"category\": \"控制\",\n      \"channel\": \"精神\",\n      \"years\": 4800,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 0.5,\n      \"cooldown\": 14,\n      \"baseControl\": 1.2,\n      \"role\": \"打断施法\",\n      \"effect\": \"灯芯骤暗，截断对手正在组织的魂力。按正常控制对抗结算；成功后打断读条，并以1.2秒为基础、按双方精神力比例结算短促控制，行动条压至最多40%，结束后获得4秒免控。不处于读条时仍只产生同样的短控，不额外附加长时间禁技。深暗不增加其控制时长或成功率。\",\n      \"operations\": [\n        {\n          \"type\": \"control_contest\",\n          \"baseSeconds\": 1.2,\n          \"ratio\": \"(100+attacker.P)/(100+defender.P)\",\n          \"interrupt\": true,\n          \"gaugeCeiling\": 0.4,\n          \"immunitySeconds\": 4,\n          \"deepDarkEligible\": false\n        }\n      ],\n      \"id\": \"xutaiping-skill-4\",\n      \"ring\": 4,\n      \"costPercent\": 0.09,\n      \"cost\": 175,\n      \"cast\": 0.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.35,\n      \"Q\": 6.58,\n      \"name\": \"替鳞\",\n      \"category\": \"防御\",\n      \"channel\": \"生命\",\n      \"years\": 11500,\n      \"target\": \"另一名队友\",\n      \"castFixed\": 0.8,\n      \"cooldown\": 18,\n      \"role\": \"代承友方减益\",\n      \"effect\": \"亮黄灯光照住队友，替其承接一项可净化的数值减益。该效果从队友身上移除，转至徐太平身上，保留原施加者与原层数，当前削弱幅度减半，承接后持续至本场战斗结束，可被正常净化。只转移一项，不转移硬控制、持续伤害、生命上限削减、角色固有机制或不可净化诅咒；自身没有承接位置时不能施放，不因转移再次触发深暗。转入效果尚未被净化或随战斗结束清除前，不能再承接第二项；不生成护盾或治疗。\",\n      \"operations\": [\n        {\n          \"type\": \"transfer_one_dispellable_numeric_debuff\",\n          \"exclude\": [\n            \"hard_control\",\n            \"damage_over_time\",\n            \"max_hp_reduction\",\n            \"innate_mechanic\",\n            \"undispellable\"\n          ],\n          \"receiver\": \"self\",\n          \"magnitudeMultiplier\": 0.5,\n          \"keepSource\": true,\n          \"keepRemainingTime\": false,\n          \"lifetime\": \"battle\",\n          \"keepStacks\": true,\n          \"capacity\": 1,\n          \"reapplyAmplifier\": false\n        }\n      ],\n      \"id\": \"xutaiping-skill-5\",\n      \"ring\": 5,\n      \"costPercent\": 0.1,\n      \"cost\": 169,\n      \"cast\": 0.8,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.35,\n      \"Q\": 6.58,\n      \"name\": \"逆潮\",\n      \"category\": \"攻击\",\n      \"channel\": \"能量\",\n      \"years\": 19000,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1.2,\n      \"cooldown\": 15,\n      \"factor\": 0.75,\n      \"role\": \"有限伤害与行动条干扰\",\n      \"effect\": \"夜魔灯鲛的暗潮卷过目标，按普通命中、防御与护盾结算，造成1.2×Q×魂力攻击值×0.75的能量原始伤害。命中后，将目标尚未进入读条的行动条降低20个百分点，最低归零；这项瞬时削弱可受深暗增幅。已经开始准备的魂技不会因此取消或延长，不额外禁锢目标，也不为己方附送行动。单次施放只干扰一次。\",\n      \"operations\": [\n        {\n          \"type\": \"direct_attack\",\n          \"factor\": 0.75,\n          \"channel\": \"能量\"\n        },\n        {\n          \"type\": \"numeric_debuff\",\n          \"values\": {\n            \"gaugeLoss\": 0.2\n          },\n          \"instant\": true,\n          \"onlyBeforeCast\": true,\n          \"floor\": 0,\n          \"oncePerCast\": true,\n          \"trigger\": \"on_hit\",\n          \"amplifierSnapshot\": \"before_cast_group\"\n        }\n      ],\n      \"id\": \"xutaiping-skill-6\",\n      \"ring\": 6,\n      \"costPercent\": 0.12,\n      \"cost\": 326,\n      \"cast\": 1.2,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.15,\n      \"K\": 2.35,\n      \"Q\": 7.4,\n      \"name\": \"夜魔真身\",\n      \"category\": \"强化\",\n      \"channel\": \"能量\",\n      \"years\": 48000,\n      \"target\": \"自己\",\n      \"castFixed\": 1.5,\n      \"cooldown\": 32,\n      \"role\": \"维持辅助生存与对抗能力\",\n      \"effect\": \"银蓝鲛鳞覆体，明黄灯火沉入鳞隙。本场战斗内精神力提高20%、防御素质提高15%，按游戏六维增益规则换算；不增加当前资源，不另增生命上限。同来源重复施放不叠层；不再额外提高深暗倍率，也不额外积累灯灭层数。\",\n      \"operations\": [\n        {\n          \"type\": \"battle_stat_up\",\n          \"values\": {\n            \"P\": 0.2,\n            \"D\": 0.15\n          },\n          \"lifetime\": \"battle\",\n          \"sameSourcePolicy\": \"replace-not-stack\",\n          \"refillResources\": false\n        }\n      ],\n      \"id\": \"xutaiping-skill-7\",\n      \"ring\": 7,\n      \"costPercent\": 0.12,\n      \"cost\": 203,\n      \"cast\": 1.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.8,\n      \"K\": 2.35,\n      \"Q\": 8.93,\n      \"name\": \"沉灯之海\",\n      \"category\": \"减益\",\n      \"channel\": \"能量\",\n      \"years\": 88000,\n      \"target\": \"敌方全体\",\n      \"castFixed\": 1.8,\n      \"cooldown\": 26,\n      \"role\": \"团队集火易伤\",\n      \"effect\": \"将灯影铺成一片无昼的海。逐个敌人独立进行普通减益对抗，成功者在本场战斗内，受到徐太平以外的友方角色造成的伤害提高15%；这项易伤受深暗增幅。同来源重施只更新幅度，不叠加层数，可被正常净化；不削双防，不降低敌方输出，不同时结算黑蚀三灯或灯灭封锁；没有其他友方输出时，不转化为徐太平自己的额外伤害。\",\n      \"operations\": [\n        {\n          \"type\": \"debuff_contest\",\n          \"perTarget\": true\n        },\n        {\n          \"type\": \"numeric_debuff\",\n          \"values\": {\n            \"allyVulnerability\": 0.15\n          },\n          \"lifetime\": \"battle\",\n          \"sameSourcePolicy\": \"replace-not-stack\",\n          \"damageSources\": \"allies_except_owner\",\n          \"amplifierSnapshot\": \"before_cast_group\"\n        }\n      ],\n      \"id\": \"xutaiping-skill-8\",\n      \"ring\": 8,\n      \"costPercent\": 0.16,\n      \"cost\": 270,\n      \"cast\": 1.8,\n      \"extensionRequired\": true\n    }\n  ],\n  \"traits\": [\n    {\n      \"name\": \"深暗\",\n      \"effect\": \"她施加的数值削弱幅度提高50%；同一目标已带有她的一项生效削弱时，改为提高80%。两档互相替代，不连续相乘；只增加幅度，不增加持续时间、层数上限、控制时长或成功率。同一次施放的多项削弱统一使用结算前的一次判定；尚未完成的三灯、灯灭计数和她自身承接的减益不用于升级增幅档。\"\n    },\n    {\n      \"name\": \"灯灭\",\n      \"effect\": \"每个个人回合，对每名敌方目标第一次真正获得的增益、治疗、护盾或回魂进行压制：数值幅度或回复量减半，并为该目标积1层灯灭。达到3层后，该目标下一次可被压制的正向效果完全失效，随后清空灯灭层数。每回合每目标最多压制一次，其余正向效果正常结算；同一次施放对同一目标产生的多项正向效果合并处理，只计一次。完全失效仍正常消耗施放者的资源与冷却。灯灭层数独立于黑蚀三灯，不受深暗放大，战斗结束或徐太平退场后清除。\"\n    }\n  ],\n  \"implementation\": {\n    \"status\": \"specification-only\",\n    \"integrated\": false,\n    \"numericStatusLifetime\": \"battle\",\n    \"numericStatusEndsOn\": \"battle_end_or_valid_dispel\",\n    \"turnClock\": \"徐太平个人回合：从获得一次正常行动机会至该次行动结束；普通攻击、魂技与正常防御均计，连击分段、追击和持续伤害跳数不额外计回合。每次有效回合开始重置一次灯灭的每目标触发名额。\",\n    \"deepDark\": {\n      \"normalMultiplier\": 1.5,\n      \"coveredMultiplier\": 1.8,\n      \"stackMultipliers\": false,\n      \"eligible\": \"enemy_numeric_debuffs_from_self\",\n      \"eligibilitySnapshot\": \"before_cast_group_or_delayed_curse_group\",\n      \"ignoreMarkers\": [\n        \"black_erosion_lamps\",\n        \"lamp_out_stacks\",\n        \"transferred_debuff\"\n      ],\n      \"excluded\": [\n        \"control_duration\",\n        \"debuff_duration\",\n        \"control_chance\",\n        \"stack_cap\",\n        \"buffs\",\n        \"damage\",\n        \"lamp_out\"\n      ],\n      \"caps\": {\n        \"agilityDown\": 0.9,\n        \"damageDown\": 0.9,\n        \"defDown\": 1,\n        \"mindDown\": 1,\n        \"skillCostUp\": 1,\n        \"gaugeLoss\": 0.9,\n        \"allyVulnerability\": 0.6\n      }\n    },\n    \"lampOut\": {\n      \"scope\": \"living_enemy_beneficiaries\",\n      \"eligibleEvents\": [\n        \"buff_received\",\n        \"healing_received\",\n        \"shield_received\",\n        \"mana_recovery_received\"\n      ],\n      \"normalMultiplier\": 0.5,\n      \"maxStacks\": 3,\n      \"fullStacksNextMultiplier\": 0,\n      \"consumeAllOnBlock\": true,\n      \"usesPerTargetPerOwnerTurn\": 1,\n      \"groupBy\": \"cast_or_tick_id+beneficiary_id\",\n      \"sameTurnAfterThird\": \"wait_for_next_eligible_turn\",\n      \"zeroActualBenefitCounts\": false,\n      \"affectsInitialResources\": false,\n      \"affectsInnatePassives\": false,\n      \"affectsCleanse\": false,\n      \"affectsRevive\": false,\n      \"durationOnlyBuffPolicy\": \"halve_duration\",\n      \"untimedBooleanBuffPolicy\": \"explicit_adapter_required\",\n      \"removeOnOwnerDefeat\": true,\n      \"persistAcrossBattles\": false\n    },\n    \"blackErosion\": {\n      \"lamps\": 3,\n      \"intervalSeconds\": 2,\n      \"timeoutSeconds\": 12,\n      \"pauseWhileControlled\": true,\n      \"progressIsNotLampOut\": true,\n      \"amplifyOnCurseResolution\": true\n    },\n    \"requiredAdapters\": [\n      \"personal-turn-events\",\n      \"delayed-lamp-channel\",\n      \"grouped-benefit-events\",\n      \"source-tagged-debuffs\",\n      \"debuff-amplification\",\n      \"debuff-transfer\",\n      \"precast-gauge-reduction\",\n      \"ally-source-vulnerability\"\n    ],\n    \"notes\": [\n      \"灯灭以获得正向效果的敌人为受益目标记账，而不是按施放者记账；群体治疗逐个受益者独立判断。\",\n      \"持续治疗每一跳是新的正向效果事件，但同一回合同一目标仍只压制一次；实际零治疗或零回复不计触发。\",\n      \"只有时长、没有数值幅度的主动增益减半时长；完全封锁时整项不生效。无幅度且无时限的二值增益必须另写适配，不能擅自减半概率。\",\n      \"控制结束后的系统免控窗不视为可封锁的主动增益。驱散、复活、入场初始资源和角色常驻固有机制不默认被灯灭拦截。\",\n      \"深暗只改变原有削弱字段，仍受该字段原上限约束；不会扩大目标数或把多项效果拆开，借同一次施放先挂弱项再吃80%。\",\n      \"无昼场景只作沉灯之海的视觉表现，不改变照明、命中、位移或事件骰。\",\n      \"原稿的早年受伤经历只作为背景资料；本次81级战斗稿不推定具体恢复经过，也不另乘未指定的伤残惩罚。\"\n    ]\n  }\n}", "/modules/data/soulbone/trait-pool.json": "{\n  \"schemaVersion\": 1,\n  \"poolVersion\": 3,\n  \"note\": \"v12.04.01万年池：有利参数约为v12.04的200%；分类出目、代价、触发、层数不变。\",\n  \"traits\": [\n    {\n      \"id\": \"tt-essence\",\n      \"name\": \"养元\",\n      \"effect\": \"吸收后魂力上限提高25%；面板与战斗共用此上限。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-essence\",\n      \"params\": {\n        \"maxMP\": 0.25\n      },\n      \"weight\": 9,\n      \"rRanges\": [\n        {\n          \"category\": \"A1\",\n          \"min\": 1,\n          \"max\": 8\n        },\n        {\n          \"category\": \"F3\",\n          \"min\": 94,\n          \"max\": 94\n        }\n      ],\n      \"stackGroup\": \"tt-essence\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-dragon\",\n      \"name\": \"潜鳞\",\n      \"effect\": \"生命不高于一半时，物攻、魂攻与精神攻击提高15%；恢复后退去。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-dragon\",\n      \"params\": {\n        \"phasePower\": 0.15\n      },\n      \"weight\": 4,\n      \"rRanges\": [\n        {\n          \"category\": \"A2\",\n          \"min\": 9,\n          \"max\": 12\n        }\n      ],\n      \"stackGroup\": \"tt-dragon\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-thorn\",\n      \"name\": \"霜棘\",\n      \"effect\": \"攻击魂技命中后凝一层霜棘，每个自身回合至多一层；每层伤害提高5%，上限三层，本场保留。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-thorn\",\n      \"params\": {\n        \"stackDamage\": 0.05,\n        \"stackCap\": 3\n      },\n      \"weight\": 6,\n      \"rRanges\": [\n        {\n          \"category\": \"A3\",\n          \"min\": 13,\n          \"max\": 18\n        }\n      ],\n      \"stackGroup\": \"tt-thorn\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-rune\",\n      \"name\": \"符锋\",\n      \"effect\": \"攻击魂技的直接伤害提高15%；普攻与持续伤害不受此增幅。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-rune\",\n      \"params\": {\n        \"skillDamage\": 0.15\n      },\n      \"weight\": 4,\n      \"rRanges\": [\n        {\n          \"category\": \"A4\",\n          \"min\": 19,\n          \"max\": 22\n        }\n      ],\n      \"stackGroup\": \"tt-rune\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-erosion\",\n      \"name\": \"蚀痕\",\n      \"effect\": \"自身魂技施加的数值削弱幅度提高25%；不延长控制、时长或增加层数。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-erosion\",\n      \"params\": {\n        \"debuffAmp\": 0.25\n      },\n      \"weight\": 2,\n      \"rRanges\": [\n        {\n          \"category\": \"A5\",\n          \"min\": 23,\n          \"max\": 24\n        }\n      ],\n      \"stackGroup\": \"tt-erosion\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-frost\",\n      \"name\": \"迟霜\",\n      \"effect\": \"攻击魂技造成伤害后，目标敏捷降低5%，每个自身回合至多叠一层，上限三层；本场保留。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-frost\",\n      \"params\": {\n        \"enemyAgilityStack\": 0.05,\n        \"stackCap\": 3\n      },\n      \"weight\": 7,\n      \"rRanges\": [\n        {\n          \"category\": \"B1\",\n          \"min\": 25,\n          \"max\": 31\n        }\n      ],\n      \"stackGroup\": \"tt-frost\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-shadow\",\n      \"name\": \"影缠\",\n      \"effect\": \"攻击魂技造成伤害后，目标行动速度降低5%、命中降低5个百分点，持续6秒；同源刷新。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-shadow\",\n      \"params\": {\n        \"enemyGauge\": 0.05,\n        \"enemyAccuracy\": 0.05,\n        \"seconds\": 6\n      },\n      \"weight\": 9,\n      \"rRanges\": [\n        {\n          \"category\": \"B2\",\n          \"min\": 32,\n          \"max\": 36\n        },\n        {\n          \"category\": \"B4\",\n          \"min\": 40,\n          \"max\": 43\n        }\n      ],\n      \"stackGroup\": \"tt-shadow\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-gap\",\n      \"name\": \"透障\",\n      \"effect\": \"攻击魂技的50%直接伤害越过护盾，仍受普通防御、魂力抵挡与承伤特性约束。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-gap\",\n      \"params\": {\n        \"shieldPierce\": 0.5\n      },\n      \"weight\": 6,\n      \"rRanges\": [\n        {\n          \"category\": \"B3\",\n          \"min\": 37,\n          \"max\": 39\n        },\n        {\n          \"category\": \"D2\",\n          \"min\": 70,\n          \"max\": 72\n        }\n      ],\n      \"stackGroup\": \"tt-gap\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-lamp\",\n      \"name\": \"晦灯\",\n      \"effect\": \"每个自身回合，令每名敌人的首次增益、治疗、护盾或回魂收益降低25%；不叠层、不禁绝。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-lamp\",\n      \"params\": {\n        \"benefitDown\": 0.25\n      },\n      \"weight\": 1,\n      \"rRanges\": [\n        {\n          \"category\": \"B5\",\n          \"min\": 44,\n          \"max\": 44\n        }\n      ],\n      \"stackGroup\": \"tt-lamp\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-shell\",\n      \"name\": \"霜衣\",\n      \"effect\": \"开战时获得最大生命20%的生命护盾，每场一次；读档不重复生成。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-shell\",\n      \"params\": {\n        \"openingShield\": 0.2\n      },\n      \"weight\": 6,\n      \"rRanges\": [\n        {\n          \"category\": \"C1\",\n          \"min\": 45,\n          \"max\": 50\n        }\n      ],\n      \"stackGroup\": \"tt-shell\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-ghost\",\n      \"name\": \"幽息\",\n      \"effect\": \"非精神伤害经过通常防护后，再将剩余伤害的45%转由魂力承担；一点魂力抵一点伤害。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-ghost\",\n      \"params\": {\n        \"manaGuard\": 0.45\n      },\n      \"weight\": 3,\n      \"rRanges\": [\n        {\n          \"category\": \"C2\",\n          \"min\": 51,\n          \"max\": 53\n        }\n      ],\n      \"stackGroup\": \"tt-ghost\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-reserve\",\n      \"name\": \"借神\",\n      \"effect\": \"生命首次归零时，以精神抵偿本次致死伤害，最多消耗精神上限50%；精神须仍有余量，每场一次。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-reserve\",\n      \"params\": {\n        \"lifeReserve\": 0.5\n      },\n      \"weight\": 5,\n      \"rRanges\": [\n        {\n          \"category\": \"C3\",\n          \"min\": 54,\n          \"max\": 57\n        },\n        {\n          \"category\": \"E4\",\n          \"min\": 87,\n          \"max\": 87\n        }\n      ],\n      \"stackGroup\": \"tt-reserve\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-spring\",\n      \"name\": \"回春\",\n      \"effect\": \"每个正常自身回合结束时，回复最大生命2.5%；退场后无效，附赠普攻不触发。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-spring\",\n      \"params\": {\n        \"regen\": 0.025\n      },\n      \"weight\": 7,\n      \"rRanges\": [\n        {\n          \"category\": \"C4\",\n          \"min\": 58,\n          \"max\": 64\n        }\n      ],\n      \"stackGroup\": \"tt-spring\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-armor\",\n      \"name\": \"裂甲\",\n      \"effect\": \"攻击魂技结算直接伤害时，无视目标50%的普通防御或精神防御；不影响护盾。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-armor\",\n      \"params\": {\n        \"armorPierce\": 0.5\n      },\n      \"weight\": 5,\n      \"rRanges\": [\n        {\n          \"category\": \"D1\",\n          \"min\": 65,\n          \"max\": 69\n        }\n      ],\n      \"stackGroup\": \"tt-armor\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-sacrifice\",\n      \"name\": \"舍魂\",\n      \"effect\": \"攻击魂技耗魂提高5%；直接伤害中有50%不受防御前额外减伤影响，普通防御与护盾仍有效。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-sacrifice\",\n      \"params\": {\n        \"extraCost\": 0.05,\n        \"wardPierce\": 0.5\n      },\n      \"weight\": 4,\n      \"rRanges\": [\n        {\n          \"category\": \"D3\",\n          \"min\": 73,\n          \"max\": 75\n        },\n        {\n          \"category\": \"D4\",\n          \"min\": 76,\n          \"max\": 76\n        }\n      ],\n      \"stackGroup\": \"tt-sacrifice\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-clarity\",\n      \"name\": \"清心\",\n      \"effect\": \"每次受到控制时，实际受控时间缩短50%；不抵消命中、不延长免控窗口。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-clarity\",\n      \"params\": {\n        \"controlShorten\": 0.5\n      },\n      \"weight\": 7,\n      \"rRanges\": [\n        {\n          \"category\": \"E1\",\n          \"min\": 77,\n          \"max\": 80\n        },\n        {\n          \"category\": \"E2\",\n          \"min\": 81,\n          \"max\": 83\n        }\n      ],\n      \"stackGroup\": \"tt-clarity\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-iceward\",\n      \"name\": \"冰御\",\n      \"effect\": \"受到冰属性伤害时，进入通常防护前伤害降低50%；不免疫冻结。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-iceward\",\n      \"params\": {\n        \"iceResist\": 0.5\n      },\n      \"weight\": 3,\n      \"rRanges\": [\n        {\n          \"category\": \"E3\",\n          \"min\": 84,\n          \"max\": 86\n        }\n      ],\n      \"stackGroup\": \"tt-iceward\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-sight\",\n      \"name\": \"洞微\",\n      \"effect\": \"非精神攻击命中低于50%时，最多回补10个百分点；不突破高端闪避或空间规则。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-sight\",\n      \"params\": {\n        \"hitFloor\": 0.5,\n        \"hitBonusCap\": 0.1\n      },\n      \"weight\": 1,\n      \"rRanges\": [\n        {\n          \"category\": \"E5\",\n          \"min\": 88,\n          \"max\": 88\n        }\n      ],\n      \"stackGroup\": \"tt-sight\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-flow\",\n      \"name\": \"归流\",\n      \"effect\": \"魂技耗魂降低10%；每个正常自身回合结束回复最大魂力2.5%，受回魂削弱影响。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-flow\",\n      \"params\": {\n        \"mpRegen\": 0.025,\n        \"costDiscount\": 0.1\n      },\n      \"weight\": 5,\n      \"rRanges\": [\n        {\n          \"category\": \"F1\",\n          \"min\": 89,\n          \"max\": 91\n        },\n        {\n          \"category\": \"F2\",\n          \"min\": 92,\n          \"max\": 93\n        }\n      ],\n      \"stackGroup\": \"tt-flow\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    },\n    {\n      \"id\": \"tt-field\",\n      \"name\": \"薄霜\",\n      \"effect\": \"在场时，友方敏捷提高6%，敌方敏捷降低3%、行动速度降低6%；同名场域只取一份，退场失效。\",\n      \"years\": [\n        10000,\n        99999\n      ],\n      \"slots\": [\n        \"头部\",\n        \"躯干\",\n        \"左臂\",\n        \"右臂\",\n        \"左腿\",\n        \"右腿\"\n      ],\n      \"handler\": \"tt-field\",\n      \"params\": {\n        \"allyAgility\": 0.06,\n        \"enemyAgility\": 0.03,\n        \"enemyAction\": 0.06\n      },\n      \"weight\": 6,\n      \"rRanges\": [\n        {\n          \"category\": \"G1\",\n          \"min\": 95,\n          \"max\": 97\n        },\n        {\n          \"category\": \"G2\",\n          \"min\": 98,\n          \"max\": 99\n        },\n        {\n          \"category\": \"G3\",\n          \"min\": 100,\n          \"max\": 100\n        }\n      ],\n      \"stackGroup\": \"tt-field\",\n      \"maxStacks\": 1,\n      \"implementationVersion\": 2,\n      \"save\": {\n        \"schemaVersion\": 1,\n        \"fields\": [\n          \"ttState\"\n        ]\n      },\n      \"dependsOn\": [\n        \"battle-v1204\"\n      ]\n    }\n  ]\n}"},cache={};
function normalize(p){const out=[];for(const x of p.replace(/\\/g,'/').split('/')){if(x==='..')out.pop();else if(x&&x!=='.')out.push(x);}return '/'+out.join('/');}
const paths={resolve:(...p)=>normalize(p.join('/')),join:(...p)=>normalize(p.join('/'))};
const fs={existsSync:p=>Object.hasOwn(files,normalize(p)),readFileSync:p=>{const key=normalize(p);if(!Object.hasOwn(files,key))throw Error('内置资料不存在：'+key);return files[key];}};
function load(id){if(cache[id])return cache[id].exports;if(!factories[id])throw Error('内置模块不存在：'+id);const module={exports:{}};cache[id]=module;const dir=id.slice(0,id.lastIndexOf('/'));const req=name=>{if(name==='node:fs')return fs;if(name==='node:path')return paths;let key=normalize(dir+'/'+name);if(!key.endsWith('.js'))key+='.js';return load(key);};factories[id](req,module,module.exports,dir);return module.exports;}
root.WitnessV12Factory=load('/modules/src/splice/compose.js');
root.WitnessV12=root.WitnessV12Factory.createModules({rules:root.WitnessRules});

})(globalThis);
