'use strict';

/**
 * 讨伐战模式（交接文档第七节）。
 *
 * 独立模式，不挪用转正考核或结局挑战的机会账本：
 *   0 位NPC → 1对1；1 位 → 2对1；2 位 → 3对1。
 * 不因徐太平是辅助系而自动补敌方考官、支援会员或补成2对2。
 * 本模块只产出“可交给现有行动条引擎”的队伍描述与胜负判定，不另写一套战斗循环，
 * 战斗数值仍由主游戏战斗代码结算。
 */

const { clone, uniqueIds } = require('../util');
const { EVENT_ID } = require('./conditions');
const { VERSIONS } = require('../versions');
const { tagUnitSkills } = require('../battle/skill-attributes');

const MAX_ALLIES = 2;

function buildHuntBattle(input) {
  let { player, enemy, allies = [], seed } = input;
  if (!player) throw new Error('讨伐战缺少玩家参战者');
  if (!enemy) throw new Error('讨伐战缺少十万年魂兽目标实例');
  if (!Array.isArray(allies) || allies.length > MAX_ALLIES) throw new Error('讨伐战友方NPC须为0—2位');
  if (typeof seed !== 'string' || !seed) throw new Error('讨伐战须带确定性种子');
  player = tagUnitSkills(player);
  enemy = tagUnitSkills(enemy);
  allies = allies.map(tagUnitSkills);

  const allyIds = uniqueIds(allies.map((ally) => ally.id), '讨伐战友方');
  if (allyIds.length !== allies.length) throw new Error('讨伐战友方ID重复');
  if (allyIds.includes(player.id)) throw new Error('友方NPC不能与玩家同ID');
  if (enemy.id === player.id || allyIds.includes(enemy.id)) throw new Error('魂兽目标ID与参战者冲突');

  const units = [player, ...allies, enemy];
  const plan = {
    mode: 'hunt',
    eventId: EVENT_ID,
    version: VERSIONS.huntBattle,
    seed,
    // 这些开关必须在拼接时真正限制引擎，不能只写在注释里。
    rules: {
      autoSupport: false,
      allySupport: false,
      enemySupport: false,
      supplementEnemyToTwo: false,
      allowAdmissionFighter: false,
      allowGuildmaster: false,
      consumePromotionAttempts: false,
      consumeChallengeLedger: false,
      actionBar: 'engine',
      timeLimitSeconds: 180
    },
    teams: { player: [player], allies: allies.map((ally) => ally), enemy: [enemy] },
    units,
    sizes: { player: 1, allies: allies.length, enemy: 1 }
  };
  validateHuntBattle(plan);
  return plan;
}

function validateHuntBattle(plan) {
  if (!plan || plan.mode !== 'hunt') throw new Error('不是讨伐战模式');
  const sizes = plan.sizes || {};
  if (sizes.player !== 1 || sizes.enemy !== 1 || ![0, 1, 2].includes(sizes.allies)) {
    throw new Error('讨伐战人数只能为1对1、2对1或3对1');
  }
  if ((plan.units || []).length !== 2 + sizes.allies) throw new Error('讨伐战单位数与人数不一致');
  const rules = plan.rules || {};
  for (const key of ['autoSupport', 'allySupport', 'enemySupport', 'supplementEnemyToTwo', 'allowAdmissionFighter', 'allowGuildmaster', 'consumePromotionAttempts', 'consumeChallengeLedger']) {
    if (rules[key] !== false) throw new Error('讨伐战不得开启 ' + key);
  }
  return true;
}

/**
 * 胜负判定。
 *
 * 胜利：魂兽按其明确退场规则被实际击败，且己方至少一名参战者存活。
 * 玩家先退场而队友最后获胜 → 团队胜利。
 * 超时、平局、逃离、认输、全灭 → 不得获得魂环与魂骨。
 */
function judgeHunt(input) {
  const outcome = input.outcome;
  const enemy = input.enemy || {};
  const survivors = Array.isArray(input.survivors) ? input.survivors.slice() : [];
  const allowed = ['victory', 'timeout', 'draw', 'escape', 'surrender', 'wipe', 'loss'];
  if (!allowed.includes(outcome)) throw new Error('讨伐结果类型无效：' + outcome);

  const defeated = enemy.defeated === true || enemy.exitRuleMet === true;
  const allyAlive = survivors.length > 0;

  if (outcome !== 'victory') {
    return { winner: ['loss', 'wipe'].includes(outcome) ? 'enemy' : 'none', loot: false, reason: 'outcome-' + outcome, defeated, allyAlive };
  }
  if (!defeated) {
    return { winner: 'none', loot: false, reason: 'beast-still-alive', defeated, allyAlive };
  }
  if (!allyAlive) {
    return { winner: 'enemy', loot: false, reason: 'team-wiped', defeated, allyAlive };
  }
  return { winner: 'team', loot: true, reason: 'beast-defeated-with-survivor', defeated, allyAlive };
}

/**
 * 战报骨架。胜败都能保存、查看、导出；记录类型必须区分为讨伐。
 * 具体战报内容由主游戏战斗快照填充，本模块只锁定“讨伐”类型与关键字段。
 */
function buildHuntReport(input) {
  const { plan, judge, target, traits, triggers, loot, preStoredRing } = input;
  if (!plan || plan.mode !== 'hunt') throw new Error('战报缺少讨伐战计划');
  if (!judge) throw new Error('战报缺少胜负判定');
  return {
    type: 'hunt',
    recordVersion: 1,
    rulesVersion: VERSIONS.huntBattle,
    targetId: target && target.id,
    targetVersion: target && target.version,
    seed: plan.seed,
    team: {
      player: plan.teams.player.map((unit) => ({ id: unit.id, name: unit.name, level: unit.level })),
      allies: plan.teams.allies.map((unit) => ({ id: unit.id, name: unit.name, level: unit.level })),
      enemy: plan.teams.enemy.map((unit) => ({ id: unit.id, name: unit.name, level: unit.level }))
    },
    traits: clone(traits || []),
    triggers: clone(triggers || []),
    result: { outcome: judge.winner, loot: judge.loot, reason: judge.reason },
    rewards: clone(loot || { rings: [], bones: [] }),
    preStoredRing: preStoredRing ? clone(preStoredRing) : null,
    savedAt: null
  };
}

/** 战报导出：与挑战战报一样可读，但格式标记为讨伐。 */
function exportHuntReport(report) {
  if (!report || report.type !== 'hunt') throw new Error('不是讨伐战报');
  return { format: 'witness-hunt-report', version: 1, report: clone(report) };
}

module.exports = { MAX_ALLIES, buildHuntBattle, validateHuntBattle, judgeHunt, buildHuntReport, exportHuntReport };
