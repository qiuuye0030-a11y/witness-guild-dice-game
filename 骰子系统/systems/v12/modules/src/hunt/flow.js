'use strict';

/**
 * 原普通流程的恢复点（交接文档第三、四节）。
 *
 * “固定触发”不等于替换当前普通事件：触发前记录原流程恢复点；
 * 拒绝或讨伐流程结束后，恢复原先未完成的普通流程，
 * 不能吞掉一次事件、重复发放原事件奖励或推进额外培养阶段。
 *
 * 本模块不解释流程内部字段，只做三件事：
 *   1. 取快照（深拷贝 + 核心字段指纹）；
 *   2. 恢复快照（返回新对象，不改调用方对象）；
 *   3. 对比恢复前后的“已消费/已发放”计数，证明没有多吞或多发。
 */

const { clone, isPlainObject } = require('../util');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}

function fingerprint(value) {
  let h = 2166136261;
  for (const ch of stableStringify(value)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const COUNTER_FIELDS = Object.freeze(['completed', 'consumedEvents', 'eventCount', 'quarter', 'rewardsGranted', 'stage']);

/** 记录恢复点。flow 为当前普通流程的只读副本；不修改传入对象。 */
function snapshotFlow(flow) {
  if (!isPlainObject(flow)) throw new Error('恢复点须建立在普通流程对象上');
  const snapshot = clone(flow);
  return Object.freeze({
    version: 1,
    phase: snapshot.phase === undefined ? null : snapshot.phase,
    fingerprint: fingerprint(snapshot),
    counters: Object.fromEntries(
      COUNTER_FIELDS.filter((key) => snapshot[key] !== undefined).map((key) => [key, clone(snapshot[key])])
    ),
    snapshot
  });
}

/** 恢复原流程：返回深拷贝，不返回快照本体，避免后续被任务流程改写。 */
function restoreFlow(restorePoint) {
  if (!isPlainObject(restorePoint) || restorePoint.version !== 1 || !isPlainObject(restorePoint.snapshot)) {
    throw new Error('恢复点无效');
  }
  return clone(restorePoint.snapshot);
}

/**
 * 证明恢复前后没有多吞事件、多发奖励或多推进培养：
 * 只比较双方都存在的计数，缺字段不算差异（旧流程结构可能没有这些字段）。
 */
function compareFlow(before, after) {
  const diffs = [];
  for (const key of COUNTER_FIELDS) {
    if (before[key] === undefined || after[key] === undefined) continue;
    if (stableStringify(before[key]) !== stableStringify(after[key])) {
      diffs.push({ field: key, before: clone(before[key]), after: clone(after[key]) });
    }
  }
  return { equal: diffs.length === 0, diffs, comparedFields: COUNTER_FIELDS.filter((key) => before[key] !== undefined && after[key] !== undefined) };
}

/** 断言恢复点仍指向同一份流程（防止把 A 角色的恢复点用回 B 角色）。 */
function assertSameFlow(restorePoint, flow, label) {
  if (!isPlainObject(flow)) throw new Error((label || '流程') + '对象无效');
  if (fingerprint(flow) !== restorePoint.fingerprint) {
    throw new Error('恢复点与当前流程不一致：中间已推进或更换了流程，不能直接回滚');
  }
  return true;
}

module.exports = { snapshotFlow, restoreFlow, compareFlow, assertSameFlow, fingerprint, COUNTER_FIELDS };
