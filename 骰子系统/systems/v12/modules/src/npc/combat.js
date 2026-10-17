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
