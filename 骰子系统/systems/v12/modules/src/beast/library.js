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
