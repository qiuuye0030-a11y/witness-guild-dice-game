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
