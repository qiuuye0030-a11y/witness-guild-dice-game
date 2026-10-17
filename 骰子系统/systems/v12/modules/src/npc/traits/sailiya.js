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
