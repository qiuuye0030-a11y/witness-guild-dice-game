'use strict';

/**
 * 讨伐任务账本（每角色一份）。
 *
 * 只记录本角色与这次固定邀请有关的状态：是否登记、是否展示、接受/拒绝、
 * 已落盘的队友、已冻结的目标、战斗场次、结果与奖励事务ID、恢复点。
 * 不加经验、不加属性、不发准备值、不改关系或气运——这些不属于邀请本身的收益。
 */

const { clone, isPlainObject } = require('../util');
const { EVENT_ID } = require('./conditions');
const { VERSIONS } = require('../versions');

const STATUSES = Object.freeze([
  'idle',
  'pending',
  'invitation',
  'refused',
  'accepted',
  'arrival',
  'forwarded',
  'awaiting-library',
  'battle',
  'won',
  'lost'
]);

const TERMINAL = Object.freeze(['refused', 'won', 'lost']);

const ALLOWED = Object.freeze({
  idle: ['pending'],
  pending: ['invitation'],
  invitation: ['refused', 'accepted'],
  refused: [],
  accepted: ['arrival'],
  arrival: ['forwarded', 'awaiting-library'],
  forwarded: ['battle', 'awaiting-library'],
  'awaiting-library': ['forwarded'],
  battle: ['won', 'lost'],
  won: [],
  lost: ['forwarded']
});

function createLedger() {
  return {
    version: VERSIONS.huntLedger,
    eventId: EVENT_ID,
    status: 'idle',
    handled: false,
    refused: false,
    pendingSince: null,
    pendingLevel: null,
    pendingRating: null,
    mode: 'journey',
    recordCompletion: true,
    acceptedAt: null,
    allies: null,
    target: null,
    battleSessionId: null,
    result: null,
    rewardTransactionId: null,
    restorePoint: null,
    presentations: [],
    history: []
  };
}

function normalize(raw) {
  if (raw === undefined || raw === null) return createLedger();
  if (!isPlainObject(raw)) throw new Error('讨伐任务账本无效');
  const ledger = { ...createLedger(), ...clone(raw) };
  if (ledger.version !== VERSIONS.huntLedger) {
    throw new Error('讨伐任务账本版本不一致：' + ledger.version + '，当前 ' + VERSIONS.huntLedger);
  }
  if (!STATUSES.includes(ledger.status)) throw new Error('讨伐任务状态无效：' + ledger.status);
  if (!Array.isArray(ledger.presentations)) throw new Error('讨伐展示记录无效');
  if (!Array.isArray(ledger.history)) throw new Error('讨伐历史记录无效');
  return ledger;
}

function validate(raw) {
  const ledger = normalize(raw);
  if (ledger.status === 'refused' && ledger.refused !== true) throw new Error('拒绝状态缺少拒绝标记');
  if (['accepted', 'arrival', 'forwarded', 'awaiting-library', 'battle', 'won', 'lost'].includes(ledger.status) && !ledger.allies) {
    throw new Error('已接受的讨伐缺少友方阵容结果');
  }
  if (ledger.allies && (!Array.isArray(ledger.allies.npcIds) || !Number.isInteger(ledger.allies.count))) {
    throw new Error('友方阵容结果无效');
  }
  if (ledger.target) {
    if (typeof ledger.target.id !== 'string' || !ledger.target.id) throw new Error('已冻结目标缺少稳定ID');
    if (!Number.isInteger(ledger.target.version)) throw new Error('已冻结目标缺少定义版本');
  }
  if (ledger.presentations.some((x) => typeof x !== 'string' || !x)) throw new Error('展示键无效');
  if (new Set(ledger.presentations).size !== ledger.presentations.length) throw new Error('展示键重复');
  return true;
}

function transition(ledger, to, patch, note) {
  const current = normalize(ledger);
  if (!ALLOWED[current.status].includes(to)) throw new Error('讨伐任务不能从 ' + current.status + ' 进入 ' + to);
  const next = {
    ...current,
    ...clone(patch || {}),
    version: VERSIONS.huntLedger,
    eventId: EVENT_ID,
    status: to,
    history: [...current.history, { from: current.status, to, note: note || null, index: current.history.length }]
  };
  if (['refused', 'won', 'lost'].includes(to)) next.handled = true;
  validate(next);
  return next;
}

function registerPending(ledger, detail = {}) {
  const current = normalize(ledger);
  if (current.status !== 'idle') return { changed: false, ledger: current };
  const next = transition(current, 'pending', {
    pendingSince: detail.at === undefined ? null : detail.at,
    pendingLevel: detail.level === undefined ? null : detail.level,
    pendingRating: detail.rating === undefined ? null : detail.rating,
    mode: detail.mode || 'journey',
    recordCompletion: detail.recordCompletion !== false,
    restorePoint: detail.restorePoint === undefined ? null : clone(detail.restorePoint)
  }, 'fixed-trigger');
  return { changed: true, ledger: next };
}

function presentInvitation(ledger, presentationKey) {
  const current = normalize(ledger);
  if (current.status !== 'pending') throw new Error('只有待办状态可以展示讨伐邀请');
  if (typeof presentationKey !== 'string' || !presentationKey) throw new Error('展示须带幂等键');
  if (current.presentations.includes(presentationKey)) throw new Error('同一安全节点不能重复弹出讨伐邀请');
  return transition(current, 'invitation', { presentations: [...current.presentations, presentationKey] }, 'present-invitation');
}

function refuse(ledger) {
  return transition(ledger, 'refused', { refused: true, allies: null, target: null }, 'refuse');
}

function accept(ledger, allies, detail = {}) {
  if (!allies) throw new Error('接受后必须落盘友方阵容结果');
  return transition(ledger, 'accepted', {
    acceptedAt: detail.at === undefined ? null : detail.at,
    allies: clone(allies)
  }, 'accept');
}

function arrive(ledger) {
  return transition(ledger, 'arrival', {}, 'arrival-text');
}

function setTarget(ledger, target) {
  const current = normalize(ledger);
  if (!['arrival', 'forwarded', 'awaiting-library'].includes(current.status)) {
    throw new Error('当前阶段不能确定魂兽目标：' + current.status);
  }
  if (!target) {
    if (current.status === 'awaiting-library') return current;
    return transition(current, 'awaiting-library', { target: null }, 'library-empty');
  }
  if (typeof target.id !== 'string' || !target.id) throw new Error('魂兽目标缺少稳定ID');
  if (!Number.isInteger(target.version)) throw new Error('魂兽目标缺少定义版本');
  if (current.status === 'forwarded') {
    // 目标已冻结：重开界面沿用原目标，不重抽。
    return { ...current, target: clone(target), history: [...current.history, { from: 'forwarded', to: 'forwarded', note: 'target-reused', index: current.history.length }] };
  }
  return transition(current, 'forwarded', { target: clone(target) }, 'target-frozen');
}

function startBattle(ledger, battleSessionId) {
  if (typeof battleSessionId !== 'string' || !battleSessionId) throw new Error('讨伐战斗缺少唯一场次ID');
  return transition(ledger, 'battle', { battleSessionId }, 'battle-start');
}

function resolveBattle(ledger, result) {
  const won = !!(result && result.loot === true);
  return transition(ledger, won ? 'won' : 'lost', { result: clone(result || {}) }, won ? 'win' : 'not-win');
}

function resumeFromPending(ledger) {
  const current = normalize(ledger);
  if (current.status !== 'awaiting-library') throw new Error('只有空库待办状态可以继续');
  return { ...current, status: 'forwarded', history: [...current.history, { from: 'awaiting-library', to: 'forwarded', note: 'library-ready', index: current.history.length }] };
}

function setReward(ledger, rewardTransactionId) {
  const current = normalize(ledger);
  return { ...current, rewardTransactionId };
}

function isTerminal(ledger) {
  const current = normalize(ledger);
  return TERMINAL.includes(current.status);
}

function summary(ledger) {
  const current = normalize(ledger);
  return {
    status: current.status,
    handled: current.handled,
    refused: current.refused,
    mode: current.mode,
    recordCompletion: current.recordCompletion,
    allyIds: current.allies ? current.allies.npcIds.slice() : [],
    target: current.target ? { id: current.target.id, version: current.target.version } : null,
    battleSessionId: current.battleSessionId,
    result: current.result,
    rewardTransactionId: current.rewardTransactionId,
    hasRestorePoint: !!current.restorePoint
  };
}

module.exports = {
  STATUSES,
  TERMINAL,
  ALLOWED,
  createLedger,
  normalize,
  validate,
  transition,
  registerPending,
  presentInvitation,
  refuse,
  accept,
  arrive,
  setTarget,
  startBattle,
  resolveBattle,
  resumeFromPending,
  setReward,
  isTerminal,
  summary
};
