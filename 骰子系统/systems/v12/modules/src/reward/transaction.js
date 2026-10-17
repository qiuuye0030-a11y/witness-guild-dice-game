'use strict';

/**
 * 首胜奖励事务（交接文档第十四节）。
 *
 * 首次真正胜利后按固定顺序完成：
 *   记录胜利凭证 → 冻结魂兽奖励 → 生成100000年魂环 → 生成100000年魂骨 →
 *   完成魂骨继承判定 → 自动吸收／冲突处理 → 处理立即或预存的第九环 →
 *   写入战报与领取账本 → 恢复原剧情。
 *
 * 同一场胜利只能创建一个奖励事务ID。重复回调、读到“已胜利未展示奖励”的存档
 * 或奖励页面重开时，只补完未完成步骤，不重发魂环、魂骨、属性或特性。
 */

const { clone, deepFreeze, isPlainObject } = require('../util');
const { VERSIONS } = require('../versions');

const STEP_KEYS = Object.freeze([
  'win-record',
  'freeze-reward',
  'ring',
  'bone',
  'inheritance',
  'absorb',
  'ninth-ring',
  'report',
  'restore-flow'
]);

function createTransaction(input) {
  if (!isPlainObject(input)) throw new Error('奖励事务参数无效');
  if (typeof input.transactionId !== 'string' || !input.transactionId) throw new Error('奖励事务缺少唯一ID');
  if (!isPlainObject(input.target) || typeof input.target.id !== 'string' || !Number.isInteger(input.target.version)) {
    throw new Error('奖励事务缺少冻结目标ID与版本');
  }
  if (input.firstWin !== true) throw new Error('只有首胜才能创建奖励事务');
  if (typeof input.sessionId !== 'string' || !input.sessionId) throw new Error('首胜奖励必须提供唯一战斗场次ID');
  const steps = {};
  for (const key of STEP_KEYS) steps[key] = { status: 'pending', result: null, error: null };
  return {
    version: VERSIONS.rewardTransaction,
    transactionId: input.transactionId,
    sessionId: input.sessionId || null,
    target: { id: input.target.id, version: input.target.version },
    characterLevel: input.characterLevel,
    mode: input.mode || 'hunt',
    status: 'pending',
    steps,
    createdAt: input.createdAt === undefined ? null : input.createdAt,
    completedAt: null
  };
}

/** 同一事务ID只创建一次；已有记录原样返回，不追加奖励。 */
function ensureTransaction(store, input) {
  if (!isPlainObject(store)) throw new Error('奖励账本无效');
  if (!store.transactions) store.transactions = Object.create(null);
  if (input.sessionId) {
    const clash = Object.values(store.transactions).find((item) => item.sessionId === input.sessionId && item.transactionId !== input.transactionId);
    if (clash) throw new Error('同一场胜利只能创建一个奖励事务ID：已有 ' + clash.transactionId);
  }
  const existing = store.transactions[input.transactionId];
  if (existing) {
    if (existing.target.id !== input.target.id || existing.target.version !== input.target.version) {
      throw new Error('同一奖励事务ID指向了不同目标，拒绝重发');
    }
    if (existing.sessionId !== input.sessionId) throw new Error('奖励事务的战斗场次ID不一致');
    return { transaction: clone(existing), reused: true };
  }
  const transaction = createTransaction(input);
  store.transactions[input.transactionId] = clone(transaction);
  return { transaction, reused: false };
}

/**
 * 断点续结。actions 每个步骤一个函数，参数为 {transaction, results}。
 * 已完成步骤直接跳过；失败步骤记录原因，下次从该步继续。
 */
function settleTransaction(transaction, actions) {
  if (!isPlainObject(transaction) || transaction.version !== VERSIONS.rewardTransaction) throw new Error('奖励事务无效');
  const next = clone(transaction);
  const results = {};
  for (const key of STEP_KEYS) if (next.steps[key].status === 'done') results[key] = next.steps[key].result;
  const events = [];

  for (const key of STEP_KEYS) {
    const step = next.steps[key];
    if (step.status === 'done') {
      events.push({ key, status: 'skipped-already-done' });
      continue;
    }
    const action = actions[key];
    if (typeof action !== 'function') {
      next.steps[key] = { ...step, status: 'blocked', error: '缺少步骤实现：' + key };
      next.status = 'blocked';
      return { transaction: next, events, blockedStep: key, error: next.steps[key].error };
    }
    try {
      const result = action({ transaction: next, results });
      next.steps[key] = { status: 'done', result: result === undefined ? null : clone(result), error: null };
      results[key] = next.steps[key].result;
      events.push({ key, status: 'done' });
    } catch (error) {
      next.steps[key] = { status: 'failed', result: null, error: error.message };
      next.status = 'failed';
      return { transaction: next, events, failedStep: key, error };
    }
  }
  next.status = 'done';
  next.completedAt = null;
  return { transaction: next, events, failedStep: null, error: null };
}

/** 冻结魂兽奖励：锁定该兽的魂环描述、魂骨部位规则与可继承特性定义／版本。 */
function freezeBeastReward(beast) {
  if (!isPlainObject(beast)) throw new Error('冻结奖励须有魂兽定义');
  if (!Array.isArray(beast.traits) || beast.traits.length < 2) throw new Error('冻结奖励要求至少两个可继承特性');
  for (const trait of beast.traits) {
    if (!trait.inherit || typeof trait.inherit.handler !== 'string' || !trait.inherit.handler) {
      throw new Error('魂兽特性「' + trait.id + '」没有玩家可执行的继承版本，不能进入奖励事务');
    }
    if (!Number.isInteger(trait.inherit.implementationVersion) || trait.inherit.implementationVersion < 1) {
      throw new Error('魂兽特性「' + trait.id + '」的继承版本号无效');
    }
  }
  return deepFreeze({
    version: VERSIONS.rewardTransaction,
    beastId: beast.id,
    beastVersion: beast.version,
    years: beast.years,
    ring: clone(beast.ringReward),
    bone: { slot: beast.bone.slot, description: beast.bone.description || null },
    traits: beast.traits.map((trait) => ({
      id: trait.id,
      name: trait.name,
      effect: trait.effect,
      inherit: clone(trait.inherit)
    })),
    traitInheritanceVersion: beast.traitInheritanceVersion
  });
}

function isComplete(transaction) {
  return transaction && transaction.status === 'done';
}

function pendingSteps(transaction) {
  return STEP_KEYS.filter((key) => transaction.steps[key].status !== 'done');
}

module.exports = { STEP_KEYS, createTransaction, ensureTransaction, settleTransaction, freezeBeastReward, isComplete, pendingSteps };
