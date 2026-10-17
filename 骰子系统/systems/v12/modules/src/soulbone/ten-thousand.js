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
