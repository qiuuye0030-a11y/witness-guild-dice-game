'use strict';

/**
 * 程良 · 战斗特性适配（交接文档第十九节重点1）。
 *
 * 数据来自 data/npc/chengliang.json 的 traits / implementation：
 *   - 周天格阵：每有效个人回合开始，敌人各+1层困阵（敏捷−5%/层，上限6），
 *     程良+1层据阵（伤害+10%/层，上限6）；每累计3个有效回合，
 *     先完成本回合叠层，再将双方层数分别减半向下取整；被控时暂停叠层与计数，层数保留。
 *   - 六库仙贼：回合末回复最大生命5%；对“有生命的受击实体”造成实际生命伤害时
 *     吸取30%回血；每累计3次有效吞噬永久+1层盗气（肉体强度+10%/层，上限10，跨战斗保留）。
 *     免疫疲劳以及带衰老、腐坏标签的减益。
 *   - 易中日月：免疫幻象与伪装、锁定真实本体；不计纯敏捷差造成的负向命中修正；
 *     闪避修正后的基础命中下限60%；每回合锁定一名凝视对象，对其命中+8个百分点，
 *     该对象对程良造成的伤害+10%；正向命中合计最高97%，致盲等在保底之后结算，最终最低5%。
 *
 * 这里只维护状态与应发生的效果；真实伤害、护盾、控制仍由主游戏战斗引擎结算。
 * 旧版的每层3%／2%已不复用，本文件按当前定稿的10%／10%实现。
 */

const { clamp, hitChance } = require('./common');

const ID = 'chengliang';
const GRID = Object.freeze({ maxStacks: 6, agilityDownPerStack: 0.05, damageUpPerStack: 0.1, period: 3 });
const REGEN = Object.freeze({ endTurnMaxHPRate: 0.05, endTurnMaxMPRate: 0.05, lifestealRate: 0.3, eventsPerPermanentStack: 3, bodyUpPerPermanentStack: 0.1, maximumPermanentStacks: 10, immuneTags: ['fatigue', 'aging', 'decay'] });
const VISION = Object.freeze({ ignoreIllusion: true, ignoreDisguise: true, selectRealBody: true, ignoreNegativeAgilityDifference: true, preDebuffHitFloor: 0.6, gazeHitPoints: 8, gazeIncomingDamageMultiplier: 1.1, hitCap: 0.97, postDebuffHitFloor: 0.05 });

function createState(input = {}) {
  return {
    id: ID,
    grid: { self: 0, enemies: Object.create(null), turns: 0, paused: false, defeated: false, cleared: false },
    regen: {
      devourEvents: 0,
      thiefQi: clamp(input.permanentProgress && input.permanentProgress.thiefQiStacks || 0, 0, REGEN.maximumPermanentStacks)
    },
    vision: { gazeTargetId: null, gazePicked: false },
    maxHP: input.maxHP
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function halveGrid(state) {
  const next = cloneState(state);
  next.grid.self = Math.floor(next.grid.self / 2);
  for (const key of Object.keys(next.grid.enemies)) next.grid.enemies[key] = Math.floor(next.grid.enemies[key] / 2);
  return next;
}

function handle(state, event) {
  const next = cloneState(state);
  const effects = [];
  switch (event.type) {
    case 'turn-start': {
      next.vision.gazePicked = false;
      if (next.grid.defeated) break;
      if (event.controlled) {
        next.grid.paused = true;
        effects.push({ op: 'log', text: '周天格阵：程良被控制，暂停叠层与周期计数，已有层数保留' });
        break;
      }
      next.grid.paused = false;
      next.grid.self = Math.min(GRID.maxStacks, next.grid.self + 1);
      for (const enemyId of event.livingEnemyIds || []) {
        next.grid.enemies[enemyId] = Math.min(GRID.maxStacks, (next.grid.enemies[enemyId] || 0) + 1);
      }
      next.grid.turns++;
      if (next.grid.turns % GRID.period === 0) {
        const before = { self: next.grid.self, enemies: { ...next.grid.enemies } };
        const halved = halveGrid(next);
        next.grid.self = halved.grid.self;
        next.grid.enemies = halved.grid.enemies;
        effects.push({ op: 'log', text: '周天格阵第' + next.grid.turns + '回合：叠层后减半（据阵' + before.self + '→' + next.grid.self + '）' });
      }
      break;
    }
    case 'turn-end': {
      if (event.dead || next.grid.defeated) break;
      const missing = Math.max(0, (event.maxHP || next.maxHP || 0) - (event.hp || 0));
      const amount = Math.min(Math.round((event.maxHP || next.maxHP || 0) * REGEN.endTurnMaxHPRate), missing);
      if (amount > 0) effects.push({ op: 'heal', amount, reason: '六库仙贼·回合末' });
      const mana = Math.min(Math.round((event.maxMP || 0) * REGEN.endTurnMaxMPRate), Math.max(0, (event.maxMP || 0) - (event.mp || 0)));
      if (mana > 0) effects.push({ op: 'restoreMP', amount: mana, reason: '六库仙贼·回合末5%' });
      break;
    }
    case 'damage-dealt': {
      if (next.grid.defeated) break;
      const target = event.target || {};
      const living = target.lifeType === '生活' || target.lifeType === 'living';
      const actual = Number(event.actualHP) || 0;
      if (!living || actual <= 0) break;
      effects.push({ op: 'heal', amount: Math.round(actual * REGEN.lifestealRate), reason: '六库仙贼·吸血' });
      next.regen.devourEvents++;
      if (next.regen.devourEvents % REGEN.eventsPerPermanentStack === 0 && next.regen.thiefQi < REGEN.maximumPermanentStacks) {
        next.regen.thiefQi++;
        effects.push({ op: 'permanentProgress', key: 'thiefQiStacks', value: next.regen.thiefQi });
        effects.push({ op: 'bodyBonus', perStack: REGEN.bodyUpPerPermanentStack, stacks: next.regen.thiefQi });
      }
      break;
    }
    case 'gaze-select': {
      if (next.vision.gazePicked) {
        effects.push({ op: 'reject', reason: '凝视每回合至多选择一次' });
        break;
      }
      next.vision.gazeTargetId = event.targetId;
      next.vision.gazePicked = true;
      effects.push({ op: 'log', text: '易中日月：锁定凝视对象 ' + event.targetId + '，本回合对其命中+8个百分点' });
      break;
    }
    case 'defeat': {
      next.grid.defeated = true;
      next.grid.self = 0;
      next.grid.enemies = Object.create(null);
      effects.push({ op: 'log', text: '程良退场：清除周天格阵状态' });
      break;
    }
    case 'battle-end': {
      next.grid = { self: 0, enemies: Object.create(null), turns: 0, paused: false, defeated: false, cleared: true };
      next.vision.gazeTargetId = null;
      break;
    }
    default:
      break;
  }
  return { state: next, effects };
}

function modifiers(state) {
  const agilityMultipliers = {};
  for (const [enemyId, stacks] of Object.entries(state.grid.enemies)) agilityMultipliers[enemyId] = 1 - GRID.agilityDownPerStack * stacks;
  return {
    damageMultiplier: 1 + GRID.damageUpPerStack * state.grid.self,
    agilityMultipliers,
    bodyMultiplier: 1 + REGEN.bodyUpPerPermanentStack * state.regen.thiefQi,
    gazeTargetId: state.vision.gazeTargetId,
    gazeIncomingDamageMultiplier: state.vision.gazeTargetId ? VISION.gazeIncomingDamageMultiplier : 1,
    immuneTags: REGEN.immuneTags.slice()
  };
}

function hit(state, input) {
  return hitChance(state.vision, input, VISION);
}

const trait = Object.freeze({ id: ID, traits: ['周天格阵', '六库仙贼', '易中日月'], requiredEvents: ['turn-start', 'turn-end', 'damage-dealt', 'gaze-select', 'defeat', 'battle-end', 'hit-query'], createState, handle, modifiers, hit, constants: { GRID, REGEN, VISION } });

module.exports = trait;
