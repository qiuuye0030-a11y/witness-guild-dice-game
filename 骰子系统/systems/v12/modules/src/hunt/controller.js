'use strict';

/**
 * 讨伐事件控制器（交接文档第三、四、五、六、七节）。
 *
 * 固定顺序：邀请正文 → 接受／拒绝 → 接受后的队友判定 → 到场正文 → 前进 →
 * 调用十万年魂兽 → 战斗 → 结果与奖励 → 恢复原流程。
 *
 * 边界：
 *   - 条件用现行评级接口现算，不看显示文字/历史最高/临时增益；
 *   - 固定触发，不投是否触发骰，不替换当前普通事件（保留恢复点）；
 *   - 接受与拒绝本身不发经验、属性、准备值、关系、气运；
 *   - 队友在第一次接受时落盘，读档/刷新不重抽；
 *   - 到场正文严格按已保存顺序整段显示，不合并、不改写、不省略；
 *   - 空魂兽库时停在“目标资料尚未开放”，保留接受与援军结果，可返回普通流程；
 *   - 讨伐战是独立模式，不挪用餐/结局挑战机会账本。
 */

const conditions = require('./conditions');
const ledgerApi = require('./ledger');
const texts = require('./texts');
const { snapshotFlow, restoreFlow } = require('./flow');
const { evaluateCondition } = conditions;
const { ensureAllies, validateAllies, resolveOriginRank } = require('./allies');
const { buildHuntBattle, judgeHunt, buildHuntReport } = require('./battle');
const { PENDING } = require('../versions');

const DEFAULT_CONFIG = Object.freeze({
  modes: { journey: true, trial: false },
  recordJourneyOnly: true,
  allowRerollAllies: false
});

function createHuntController(options) {
  const roster = options && options.roster;
  const ratingFn = options && options.ratingFn;
  const library = options && options.library;
  const config = {
    ...DEFAULT_CONFIG,
    ...(options && options.config),
    modes: { ...DEFAULT_CONFIG.modes, ...((options && options.config && options.config.modes) || {}) }
  };
  if (!roster) throw new Error('讨伐控制器缺少友方NPC名录');
  if (typeof ratingFn !== 'function') throw new Error('讨伐控制器缺少现行评级接口');
  if (!library) throw new Error('讨伐控制器缺少十万年魂兽库');

  function modeEnabled(mode) {
    return !!(config.modes && config.modes[mode]);
  }

  function evaluate(input) {
    const mode = input.mode || 'journey';
    if (!modeEnabled(mode)) {
      return { eventId: conditions.EVENT_ID, eligible: false, reason: 'mode-disabled', mode, level: input.level, randomTriggerRoll: null, weightPool: null };
    }
    const result = evaluateCondition({ level: input.level, model: input.model, ratingFn, ledger: input.ledger });
    return { ...result, mode, recordCompletion: mode === 'journey' || !config.recordJourneyOnly };
  }

  /**
   * 安全节点检查 + 登记待办 + 展示邀请。
   * presentationKey 用于幂等：同一安全节点重复调用不会第二次弹出。
   */
  function consider(input) {
    const mode = input.mode || 'journey';
    const condition = evaluate({ ...input, mode });
    if (!condition.eligible) {
      return { ledger: ledgerApi.normalize(input.ledger), condition, presentation: null, deduped: input.ledger && input.ledger.status === 'invitation' };
    }

    let ledger = ledgerApi.normalize(input.ledger);
    // 先确认安全节点，再登记待办：读档预览/面板刷新/战斗动画里不得留下任务痕迹。
    texts.assertSafeNode(input.safeNode);
    if (ledger.status === 'idle') {
      const restorePoint = input.flow ? snapshotFlow(input.flow) : null;
      ledger = ledgerApi.registerPending(ledger, {
        at: input.at === undefined ? null : input.at,
        level: condition.level,
        rating: condition.rating.label,
        mode,
        recordCompletion: condition.recordCompletion,
        restorePoint
      }).ledger;
    }
    if (ledger.status !== 'pending') {
      return { ledger, condition, presentation: null, deduped: ledger.status === 'invitation' };
    }
    const key = input.key || ('hunt:' + (input.at === undefined ? condition.level : input.at));
    if (ledger.presentations.includes(key)) return { ledger, condition, presentation: null, deduped: true };
    ledger = ledgerApi.presentInvitation(ledger, key);
    return {
      ledger,
      condition,
      presentation: { kind: 'invitation', ...texts.invitationView(), mode, recordCompletion: condition.recordCompletion }
    };
  }

  /**
   * 接受／拒绝。接受时先落盘友方阵容，再给出共同正文与到场正文。
   * option 只接受定稿的两个选项文字。
   */
  function choose(input) {
    const ledger = ledgerApi.normalize(input.ledger);
    if (ledger.status !== 'invitation') throw new Error('当前不在邀请阶段，不能选择接受或拒绝');
    const option = input.option;
    if (!texts.TEXTS.invitation.options.includes(option)) throw new Error('邀请选项无效：' + option);

    if (option === '拒绝') {
      const next = ledgerApi.refuse(ledger);
      return { ledger: next, accepted: false, texts: texts.refusalView(), restore: restoreFlowOrNull(next) };
    }

    const originRank = input.originRank === undefined ? resolveOriginRank(input.character) : input.originRank;
    if (!Number.isInteger(originRank) || originRank < 1 || originRank > 10) throw new Error('接受时须提供角色建立时的家境档位');
    const allies = ledger.allies
      ? validateAllies(ledger.allies, roster, originRank)
      : ensureAllies({ originRank, roster, rng: input.rng });
    let next = ledgerApi.accept(ledger, allies, { at: input.at });
    next = ledgerApi.arrive(next);
    return {
      ledger: next,
      accepted: true,
      allies,
      acceptedText: texts.acceptedView(),
      arrival: texts.arrivalView(roster, allies.npcIds),
      note: '接受本身不发经验、属性、准备值、关系或气运；到达场正文后必须点前进才进入狩猎。'
    };
  }

  /**
   * 前进：首次确定并立即冻结目标；空库则停在待办，不空战、不自动胜利、不发占位奖励。
   * 需要玩家单位与友方单位供拼接层构建队伍。
   */
  function forward(input) {
    const ledger = ledgerApi.normalize(input.ledger);
    if (!['arrival', 'forwarded', 'awaiting-library'].includes(ledger.status)) throw new Error('只有到场正文之后、或空库待办中才能前进');

    const picked = library.pick({ frozen: ledger.target, rng: input.rng });
    if (picked.empty) {
      const waiting = ledgerApi.setTarget(ledger, null);
      return { ledger: waiting, pending: true, reason: PENDING.EMPTY_BEAST_LIBRARY, message: '目标资料尚未开放', allies: waiting.allies };
    }
    const next = ledgerApi.setTarget(ledger, picked.target);
    const expected = ledger.allies.npcIds;
    const supplied = input.allyUnits || [];
    if (supplied.length !== expected.length || supplied.some((unit, i) => unit.npcId !== expected[i])) {
      throw new Error('参战友方NPC与已冻结的援军名单或顺序不一致');
    }
    const target = picked.target.snapshot;
    const enemyInstance = library.buildInstance({ snapshot: picked.target.snapshot, instanceId: 'beast:' + target.id });
    const plan = buildHuntBattle({
      player: input.playerUnit,
      allies: input.allyUnits || [],
      enemy: enemyInstance,
      seed: ledger.battleSeed || input.seed
    });
    return {
      ledger: { ...next, battleSeed: ledger.battleSeed || input.seed },
      pending: false,
      target: { id: target.id, version: target.version },
      encounter: { name: target.name, years: target.years, battleText: target.battleText, lifeType: target.lifeType, traitIds: target.traits.map((trait) => trait.id) },
      battlePlan: plan,
      roll: picked.roll
    };
  }

  function startBattle(ledger, sessionId) {
    return ledgerApi.startBattle(ledger, sessionId);
  }

  /** 结算：超时/平局/逃离/认输/全灭都不给环与骨。 */
  function resolve(input) {
    const ledger = ledgerApi.normalize(input.ledger);
    if (ledger.status !== 'battle') throw new Error('当前不在讨伐战斗中');
    if (!input.plan || input.plan.mode !== 'hunt') throw new Error('结算缺少讨伐战计划');
    if (input.plan.teams.enemy[0].definitionId !== ledger.target.id) throw new Error('结算目标与冻结魂兽不一致');
    const friendlyIds = [...input.plan.teams.player, ...input.plan.teams.allies].map((unit) => unit.id);
    if ((input.survivors || []).some((id) => !friendlyIds.includes(id))) throw new Error('存活者不属于本次讨伐友方');
    const judge = judgeHunt({ outcome: input.outcome, enemy: input.enemy, survivors: input.survivors });
    const next = ledgerApi.resolveBattle(ledger, judge);
    const report = buildHuntReport({ plan: input.plan, judge, target: ledger.target, traits: input.traits, triggers: input.triggers });
    return {
      ledger: next,
      judge,
      report,
      firstWin: judge.loot && ledger.status === 'battle',
      restore: restoreFlowOrNull(next)
    };
  }

  function restoreFlowOrNull(ledger) {
    return ledger.restorePoint ? restoreFlow(ledger.restorePoint) : null;
  }

  /** 读档/刷新时只校验，不重抽队友、不换目标。 */
  function validate(ledger) {
    ledgerApi.validate(ledger);
    if (ledger.allies) validateAllies(ledger.allies, roster, ledger.allies.originRank);
    return true;
  }

  return Object.freeze({ evaluate, consider, choose, forward, startBattle, resolve, validate, restoreFlow: restoreFlowOrNull, summary: ledgerApi.summary });
}

module.exports = { createHuntController, DEFAULT_CONFIG };
