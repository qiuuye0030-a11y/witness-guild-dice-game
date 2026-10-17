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
