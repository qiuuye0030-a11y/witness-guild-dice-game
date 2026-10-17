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
