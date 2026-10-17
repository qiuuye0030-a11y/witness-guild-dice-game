'use strict';

/**
 * 通用战斗事件钩子（交接文档第十八、十九节）。
 *
 * 魂骨效果与友方NPC、会长、神秘伤疤女共用同一组可靠事件：
 * 受伤、护盾、控制、回魂、行动起止，以及战斗开始/结束。
 * 不另造一套“回合”计数：个人回合由显式行动机会开始与结束，附赠普攻、
 * 连击分段、持续伤害跳数都不额外计回合。
 */

const { VERSIONS } = require('../versions');

const EVENTS = Object.freeze([
  'battle-start',
  'turn-start',
  'turn-end',
  'damage-dealt',
  'damage-taken',
  'shield-gained',
  'shield-broken',
  'control-start',
  'control-end',
  'heal',
  'mp-restore',
  'defeat',
  'battle-end'
]);

const TURN_KINDS = Object.freeze({ normal: true, bonus: false, dot: false, segment: false, reaction: false });

function createHookRegistry() {
  const handlers = new Map();
  const order = [];

  function on(event, handler, meta = {}) {
    if (!EVENTS.includes(event)) throw new Error('未知战斗事件：' + event + '；不允许自造回合类事件');
    if (typeof handler !== 'function') throw new Error('事件处理器须为函数');
    const id = meta.id;
    if (typeof id !== 'string' || !id) throw new Error('事件处理器须有唯一ID');
    if (handlers.has(id)) throw new Error('事件处理器重复注册：' + id);
    handlers.set(id, { id, event, handler, owner: meta.owner || null, priority: meta.priority || 0, version: VERSIONS.battleHooks });
    order.push(id);
    return api;
  }

  function off(id) {
    handlers.delete(id);
    const index = order.indexOf(id);
    if (index >= 0) order.splice(index, 1);
  }

  function offOwner(owner) {
    for (const [id, entry] of [...handlers]) if (entry.owner === owner) off(id);
  }

  /** frame 由宿主提供，至少含 {logs:[], unit, ...}；处理器只读事件并写入 frame。 */
  function emit(event, frame) {
    if (!EVENTS.includes(event)) throw new Error('未知战斗事件：' + event);
    if (!frame || typeof frame !== 'object') throw new Error('事件帧无效');
    if (!Array.isArray(frame.logs)) frame.logs = [];
    const entries = order.map((id) => handlers.get(id)).filter((entry) => entry && entry.event === event).sort((a, b) => b.priority - a.priority);
    const results = [];
    for (const entry of entries) {
      const before = frame.logs.length;
      const output = entry.handler(frame, event);
      results.push({ id: entry.id, output: output === undefined ? null : output, logs: frame.logs.slice(before) });
    }
    return { frame, results, handlers: entries.map((entry) => entry.id) };
  }

  function list() {
    return order.map((id) => handlers.get(id)).filter(Boolean).map((entry) => ({ id: entry.id, event: entry.event, owner: entry.owner, priority: entry.priority }));
  }

  function countByEvent() {
    const counts = Object.fromEntries(EVENTS.map((event) => [event, 0]));
    for (const entry of handlers.values()) counts[entry.event]++;
    return counts;
  }

  const api = Object.freeze({ on, off, offOwner, emit, list, countByEvent, EVENTS });
  return api;
}

/**
 * 个人回合时钟。只有“获得一次正常行动机会”才 begin，
 * 只有正常行动完成才计一个有效回合；附赠普攻、持续伤害跳数、连击分段不计。
 * 被控制时暂停（不产生新回合，已有层数保留）。
 */
function createTurnClock() {
  const state = new Map(); // unitId -> {active, turns, controlled, wasControlled}

  function ensure(unitId) {
    if (typeof unitId !== 'string' || !unitId) throw new Error('回合时钟须绑定单位ID');
    if (!state.has(unitId)) state.set(unitId, { active: false, turns: 0, controlled: false, wasControlled: false, startedAt: null });
    return state.get(unitId);
  }

  function begin(unitId, meta = {}) {
    const entry = ensure(unitId);
    if (entry.active) throw new Error('同一单位不能同时开始两个个人回合');
    entry.active = true;
    entry.controlled = meta.controlled === true;
    entry.startedAt = meta.at === undefined ? null : meta.at;
    return { unitId, active: true, controlled: entry.controlled };
  }

  function complete(unitId, meta = {}) {
    const entry = ensure(unitId);
    if (!entry.active) throw new Error('个人回合尚未开始');
    const kind = meta.kind || 'normal';
    if (!(kind in TURN_KINDS)) throw new Error('未知行动类型：' + kind);
    entry.active = false;
    entry.wasControlled = entry.controlled;
    if (TURN_KINDS[kind] && !entry.controlled) entry.turns++;
    return { unitId, kind, counted: TURN_KINDS[kind] && !entry.controlled, turns: entry.turns };
  }

  function markControlled(unitId) {
    ensure(unitId).controlled = true;
  }

  function turnsOf(unitId) {
    return ensure(unitId).turns;
  }

  function snapshot() {
    return [...state.entries()].map(([unitId, entry]) => ({ unitId, ...entry }));
  }

  return Object.freeze({ begin, complete, markControlled, turnsOf, snapshot });
}

module.exports = { EVENTS, TURN_KINDS, createHookRegistry, createTurnClock };
