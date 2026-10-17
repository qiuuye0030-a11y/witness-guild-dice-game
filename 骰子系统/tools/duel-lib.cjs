'use strict';
// 两位独立挑战 Boss 的同场构建与战报统计（供对打测试与批量统计共用）。
//
// 挑战机制都挂在单位自身（u.scarred / u.guildmaster），且由 compose.js 常驻装配，
// 因此可以让两位 Boss 同场。两者都用【官方 initialize】构建，不复制任何数值代码：
//   雪寂冬 —— challengeId:'guildmaster_xuejidong' 官方初始化，固定 95 级（会长挑战口径）
//   伤疤女 —— challengeId:'mysterious_scarred_woman' 官方初始化，等级与挑战者一致
// 之后把官方雪寂冬换进 player 槽（保持 id='player' 以便自动战斗驱动）。
const assert = require('assert/strict');
const { load } = require('./verify-v11.cjs');
const x = load(), B = x.WitnessBattle.Battle, copy = v => JSON.parse(JSON.stringify(v));
const ID = 'mysterious_scarred_woman', GM = 'guildmaster_xuejidong';

// 会长挑战固定 95 级；九魂技＋头部魂骨（skillLimit:9 → 9 技，再 push 魂骨）
function guildmasterUnit(seed) {
  const a = new B({ playerTemplateId: 'qinyan', testLevel: 95, enemyId: 'xuejidong', duel: true, challengeId: GM, traitsEnabled: false, seed });
  const u = a.unit('enemy');
  assert(u.guildmaster, '会长被动未挂载');
  assert.equal(u.name, '公会会长——雪寂冬');
  assert.equal(u.level, 95);
  assert.equal(u.skills.length, 10, '会长应为九魂技+头部魂骨');
  assert(u.skills.some(s => s.name === '武魂真身') && u.skills.some(s => s.name === '绝对零度吐息') && u.skills.some(s => s.sourceKind === 'soulbone'), '会长魂技构成不符');
  return copy(u);
}

function makeDuel(level, seed) {
  const b = new B({ playerTemplateId: 'qinyan', testLevel: level, enemyId: 'xuejidong', duel: true, challengeId: ID, traitsEnabled: false, seed });
  const scar = b.unit('enemy');
  assert(scar.scarred, '伤疤女状态未挂载');
  assert.equal(scar.level, level, '伤疤女等级应等于挑战者等级');
  assert.equal(scar.skills.length, 2);
  const gm = guildmasterUnit(seed + '-gm');
  gm.id = 'player'; gm.team = 0;
  b.units[b.units.findIndex(u => u.id === 'player')] = gm;
  assert.equal(b.unit('player').name, '公会会长——雪寂冬');
  assert.equal(b.unit('enemy').name, '神秘伤疤女');
  return b;
}

const TYPES = ['scarSwordPlaced', 'scarSwordRelease', 'scarSwordUpkeep', 'scarVeilStart', 'scarVeilBreak', 'frostPassive', 'transform'];

function tally(b) {
  const c = {}, dmg = { player: { hp: 0, mp: 0, shield: 0 }, enemy: { hp: 0, mp: 0, shield: 0 } };
  for (const l of b.log) {
    if (TYPES.includes(l.type)) c[l.type] = (c[l.type] || 0) + 1;
    if (l.type === 'resist' && l.legendary) c.legendaryResist = (c.legendaryResist || 0) + 1;
    if (l.type === 'damage') {
      const side = l.actor === 'player' ? dmg.player : l.actor === 'enemy' ? dmg.enemy : null;
      if (!side) continue;
      // 伤疤女承伤走她的分段日志；普通单位承伤走 BattleCore 的 amount 格式，两者都要兼容。
      const split = (l.healthLost || 0) + (l.mentalLost || 0);
      side.hp += split || (l.amount || 0);
      side.mp += l.paid || 0;
      side.shield += (l.shieldBlocked || 0) + (l.guardBlocked || 0);
    }
  }
  const gm = b.unit('player'), scar = b.unit('enemy');
  const frost = b.status(scar, 'statDownA').find(s => s.source === 'player:frostThorns');
  return {
    counters: c,
    damage: dmg,
    damageTotal: { player: dmg.player.hp + dmg.player.mp + dmg.player.shield, enemy: dmg.enemy.hp + dmg.enemy.mp + dmg.enemy.shield },
    logLines: b.log.length,
    gm: { hp: gm.hp, sh: gm.sh, mp: gm.mp, hpRatio: gm.hp / gm.model.derived.HP, transformed: !!gm.guildmaster.transformed, legendaryLeft: gm.guildmaster.legendaryRemaining, frostStacks: frost?.stacks || 0 },
    scar: { hp: scar.hp, sh: scar.sh, mp: scar.mp, hpRatio: scar.hp / scar.model.derived.HP, shieldLeft: scar.shieldHP, swords: scar.scarred?.swords?.length ?? 0, veiled: !!scar.scarred?.veil }
  };
}

// Wilson 95% 置信区间，小样本下比正态近似可靠
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n);
  const m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

const stats = a => {
  if (!a.length) return null;
  const s = [...a].sort((m, n) => m - n), q = p => s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
  return { n: s.length, mean: +(s.reduce((m, n) => m + n, 0) / s.length).toFixed(2), min: s[0], p10: q(.10), median: q(.5), p90: q(.90), max: s[s.length - 1] };
};

module.exports = { x, B, copy, ID, GM, guildmasterUnit, makeDuel, tally, wilson, stats, TYPES };
