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
