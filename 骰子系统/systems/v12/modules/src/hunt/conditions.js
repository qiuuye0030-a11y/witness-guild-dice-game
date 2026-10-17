'use strict';

/**
 * 讨伐事件的固定触发条件（交接文档第三节）。
 *
 * 同时满足：
 *   1. 玩家等级 ≥ 80；
 *   2. 当前基础实力评级达到凶级或以上（凶／狂／神）；
 *   3. 本角色尚未处理过该邀请，也未处于该任务流程中。
 *
 * 评级必须由角色面板与战斗共用的现行接口现算，采用实际基础面板；
 * 因此本模块不接收“显示文字”“历史最高评级”“临时战斗增益”或旧晋升标记，
 * 只接收等级、实际基础六维与一个评级函数（默认接 v11.01 的 WitnessRules.rating）。
 */

const { RATING_ORDER, RATING_MIN_FOR_HUNT, requireInteger } = require('../util');

const REQUIRED_LEVEL = 80;
const EVENT_ID = 'hunt_hundred_thousand';

function ratingIndex(label) {
  const index = RATING_ORDER.indexOf(label);
  if (index < 0) throw new Error('评级名称无效：' + label + '；只接受现行接口返回的' + RATING_ORDER.join('/'));
  return index;
}

function ratingAtLeast(label, minimum) {
  return ratingIndex(label) >= ratingIndex(minimum);
}

/**
 * @param {object} input
 * @param {number} input.level 当前等级（不是历史最高等级）
 * @param {object} input.model 实际基础面板（含 level 与 stats 六维），由角色面板现算
 * @param {function} input.ratingFn 现行评级接口，返回 {label, score, thresholds}
 * @param {object} [input.ledger] 讨伐任务账本
 */
function evaluateCondition(input) {
  const level = requireInteger(input.level, '等级', 0, 99);
  if (typeof input.ratingFn !== 'function') throw new Error('必须注入角色面板与战斗共用的评级函数');
  if (!input.model || !input.model.stats) throw new Error('缺少实际基础面板，不能用显示文字或历史评级代替');
  if (input.model.level !== undefined && input.model.level !== level) {
    throw new Error('面板等级与当前等级不一致，须用当前实际面板重算');
  }

  const rating = input.ratingFn(input.model);
  if (!rating || typeof rating.label !== 'string') throw new Error('评级接口未返回现行评级');
  if (!rating.thresholds || typeof rating.thresholds !== 'object' || !Number.isInteger(rating.thresholds.version)) {
    throw new Error('评级接口未返回门槛版本，无法确认是现行计算接口');
  }
  // 只接受带门槛版本的现行结果；旧版晋升标记或手写评级没有 thresholds。
  const labelIndex = ratingIndex(rating.label);

  const checks = {
    level: level >= REQUIRED_LEVEL,
    rating: ratingAtLeast(rating.label, RATING_MIN_FOR_HUNT),
    notHandled: !isHandled(input.ledger)
  };
  const eligible = checks.level && checks.rating && checks.notHandled;

  let reason = 'eligible';
  if (!checks.level) reason = 'level-below-80';
  else if (!checks.rating) reason = 'rating-below-xiong';
  else if (!checks.notHandled) reason = 'already-handled';

  return {
    eventId: EVENT_ID,
    eligible,
    reason,
    level,
    requiredLevel: REQUIRED_LEVEL,
    rating: { label: rating.label, score: rating.score, thresholds: rating.thresholds, labelIndex },
    minimumRating: RATING_MIN_FOR_HUNT,
    checks,
    // 固定触发：不进入普通事件权重池，也不额外投“是否触发”骰。
    randomTriggerRoll: null,
    weightPool: null
  };
}

function isHandled(ledger) {
  if (!ledger) return false;
  if (ledger.handled === true) return true;
  return !['idle', 'pending'].includes(ledger.status);
}

/**
 * 首次满足条件时登记待办；已登记或已处理时返回原状态。
 * “固定触发”不替换当前普通事件：登记只写任务账本，不消费事件次数。
 */
function registerPending(ledger, detail) {
  if (isHandled(ledger)) return { changed: false, ledger };
  const next = {
    ...ledger,
    version: ledger.version,
    eventId: EVENT_ID,
    status: 'pending',
    handled: false,
    pendingSince: ledger.pendingSince || detail && detail.at || null,
    pendingLevel: ledger.pendingLevel === undefined ? detail && detail.level : ledger.pendingLevel,
    pendingRating: ledger.pendingRating || (detail && detail.rating && detail.rating.label) || null
  };
  return { changed: true, ledger: next };
}

module.exports = { EVENT_ID, REQUIRED_LEVEL, MINIMUM_RATING: RATING_MIN_FOR_HUNT, evaluateCondition, ratingAtLeast, ratingIndex, isHandled, registerPending };
