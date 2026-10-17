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
