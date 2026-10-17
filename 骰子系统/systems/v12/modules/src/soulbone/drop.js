'use strict';

/**
 * 普通猎魂的万年魂骨掉落骰（交接文档第十节）。
 *
 * 已定：
 *   - 只有本次最终确认获得的魂环，其魂兽年限在10000—99999年，才投骰；
 *     十年、百年、千年掉落概率为0；100000年走讨伐专门来源，不走这里。
 *   - 气运1约1%、气运10约15%；阈值曲线为可调建议：
 *       阈值 = 四舍五入〔100 + 1400 × (L−1) ÷ 9〕，1d10000 骰面 ≤ 阈值即掉落。
 *   - 每份最终成果有唯一 huntAcquisitionId，只结算一次；
 *     预览、重抽、放弃候选、看结果、开背包、读档都不额外投骰。
 *
 * 掉落只影响是否爆骨，不自动影响魂骨特性强度、部位、十万年传承数量或讨伐胜率。
 */

const { requireInteger } = require('../util');
const { VERSIONS } = require('../versions');
const { hashSeed } = require('../rng');

const SIDES = 10000;
const RULE = 'linear-1d10000-v1';

function isTenThousand(years) {
  return Number.isInteger(years) && years >= 10000 && years <= 99999;
}

/** 超出万年区间（含100000年）一律不投本骰。 */
function rollEligibility(years) {
  if (!Number.isInteger(years)) throw new Error('魂环年限须为整数');
  if (isTenThousand(years)) return { eligible: true, reason: 'ten-thousand-range' };
  if (years === 100000) return { eligible: false, reason: 'hundred-thousand-uses-hunt-source' };
  return { eligible: false, reason: 'not-ten-thousand' };
}

function thresholdForLuck(luck) {
  requireInteger(luck, '有效气运档位', 1, 10);
  return Math.round(100 + (1400 * (luck - 1)) / 9);
}

/** 逐点枚举用的表格：与交接文档10.2表逐行一致。 */
function probabilityTable() {
  const rows = [];
  for (let luck = 1; luck <= 10; luck++) {
    const threshold = thresholdForLuck(luck);
    rows.push({ luck, threshold, range: '1—' + threshold, rate: threshold / SIDES });
  }
  return rows;
}

/**
 * 结算一次掉落。调用点只能是“最终确认获得魂环”的唯一结算点。
 * @param {object} input { acquisitionId, years, luck, rng, at }
 */
function rollBoneDrop(input) {
  const acquisitionId = input.acquisitionId;
  if (typeof acquisitionId !== 'string' || !acquisitionId) throw new Error('魂骨掉落须带唯一 huntAcquisitionId');
  const years = requireInteger(input.years, '魂环年限', 10, 100000);
  const eligibility = rollEligibility(years);
  if (!eligibility.eligible) {
    return Object.freeze({
      version: VERSIONS.boneDropRules,
      rule: RULE,
      acquisitionId,
      years,
      luck: input.luck === undefined ? null : input.luck,
      eligible: false,
      skipped: true,
      reason: eligibility.reason,
      dropped: false,
      face: null,
      threshold: null,
      sides: SIDES
    });
  }
  const luck = requireInteger(input.luck, '有效气运档位', 1, 10);
  if (!input.rng || typeof input.rng.die !== 'function') throw new Error('掉落骰须使用游戏确定性投骰器');
  const threshold = thresholdForLuck(luck);
  const face = input.rng.die(SIDES, '万年魂骨掉落', { acquisitionId, luck, threshold });
  return Object.freeze({
    version: VERSIONS.boneDropRules,
    rule: RULE,
    acquisitionId,
    years,
    luck,
    eligible: true,
    skipped: false,
    sides: SIDES,
    face,
    threshold,
    dropped: face <= threshold,
    rollLabel: '万年魂骨掉落',
    at: input.at === undefined ? null : input.at
  });
}

/**
 * 一次成果一次结算：store 以 acquisitionId 为键。
 * 重复调用返回首次结果并标记 duplicate，不重投、不改写。
 */
function settleBoneDrop(store, input) {
  if (!store || typeof store !== 'object') throw new Error('结算存储无效');
  if (!store.settlements) store.settlements = Object.create(null);
  const existing = store.settlements[input.acquisitionId];
  if (existing) return Object.freeze({ ...existing, duplicate: true });
  const settlement = rollBoneDrop(input);
  store.settlements[input.acquisitionId] = settlement;
  return Object.freeze({ ...settlement, duplicate: false });
}

/** 预览用：只读当前配置，不投骰、不消耗序列。 */
function inspect(input) {
  const eligibility = rollEligibility(input.years);
  const luck = input.luck === undefined ? null : requireInteger(input.luck, '有效气运档位', 1, 10);
  return {
    years: input.years,
    eligible: eligibility.eligible,
    reason: eligibility.reason,
    luck,
    threshold: eligibility.eligible && luck !== null ? thresholdForLuck(luck) : null,
    sides: SIDES,
    rule: RULE,
    pendingReason: eligibility.eligible ? null : eligibility.reason
  };
}

/**
 * 为一次“最终确认获得的魂环”生成唯一成果ID。
 * 同一结果重复调用得到同一ID（只结算一次）；放弃候选后重新猎魂会递增 attempt，
 * 因此新成果不会复用旧ID，但也不会因为重开界面被当成两次成果。
 */
function huntAcquisitionId(input) {
  const ringIndex = requireInteger(input.ringIndex, '魂环位置', 1, 9);
  const years = requireInteger(input.years, '魂环年限', 10, 100000);
  const attempt = requireInteger(input.attempt === undefined ? 1 : input.attempt, '猎魂尝试次数', 1, 999);
  const seed = input.seed === undefined ? '' : String(input.seed);
  const owner = input.characterName === undefined ? '' : String(input.characterName);
  const hash = hashSeed([seed, owner, ringIndex, years, attempt].join('|')).toString(16).padStart(8, '0');
  return 'hunt:' + ringIndex + ':' + years + ':' + attempt + ':' + hash;
}

/**
 * 常规猎魂的唯一掉落结算点：只在“最终确认获得魂环”后调用。
 * ring 必须已经有魂技（即已确认成果），预览/候选/放弃阶段不得调用。
 */
function settleConfirmedHunt(input) {
  const ring = input.ring;
  if (!ring || !Number.isInteger(ring.index) || !Array.isArray(ring.skills) || !ring.skills.length) {
    throw new Error('掉骨骰只能在最终确认获得魂环后结算');
  }
  const acquisitionId = huntAcquisitionId({
    seed: input.seed,
    characterName: input.characterName,
    ringIndex: ring.index,
    years: ring.years,
    attempt: input.attempt
  });
  const settlement = settleBoneDrop(input.store, {
    acquisitionId,
    years: ring.years,
    luck: input.luck,
    rng: input.rng,
    at: input.at
  });
  return { ...settlement, acquisitionId };
}

module.exports = {
  SIDES,
  RULE,
  isTenThousand,
  rollEligibility,
  thresholdForLuck,
  probabilityTable,
  rollBoneDrop,
  settleBoneDrop,
  inspect,
  huntAcquisitionId,
  settleConfirmedHunt
};
