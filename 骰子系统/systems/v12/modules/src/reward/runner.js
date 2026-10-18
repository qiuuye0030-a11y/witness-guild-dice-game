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
