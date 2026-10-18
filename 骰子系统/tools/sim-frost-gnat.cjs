'use strict';
// 霜蚋讨伐平衡模拟：三人队（玩家+2援军）自动战斗，统计胜率/用时/剩余生命/领域伤害。
// 用法：
//   node tools/sim-frost-gnat.cjs                 # 基线 + 候选方案对比
//   node tools/sim-frost-gnat.cjs --json out.json # 另存结果
const fs = require('node:fs');
const path = require('node:path');
const x = require('./runtime-1008.cjs').load();
const B = x.WitnessBattle.Battle, V = x.WitnessCampaign.V12, T = x.WitnessV12Tuning;
const BASE = { ...T };

function runOne({ seed, level = 81, rank = 10, tuning }) {
  Object.assign(T, BASE, tuning || {});
  const c = V.testCharacter(x.WITNESS_CATALOG, { seed, target: 'frost-gnat', originRank: rank, level });
  c.v12Choose('接受');
  const b = new B(c.v12StartBattle());
  const beast = b.units.find(u => u.beastId);
  b.tick(Math.min(300000, b.now + 300000), true);
  const team = b.units.filter(u => u.team === 0);
  const teamMax = team.reduce((n, u) => n + u.model.derived.HP, 0);
  const teamHP = team.reduce((n, u) => n + Math.max(0, u.hp), 0);
  const pulses = b.log.filter(l => /被霜域侵蚀/.test(l.text)).length;
  const domainDamage = b.log.reduce((n, l) => { const m = /被霜域侵蚀(\d+)/.exec(l.text); return n + (m ? Number(m[1]) : 0); }, 0);
  const player = b.unit('player');
  return {
    seed, winner: b.result ? b.result.winner : null, outcome: b.result ? b.result.huntOutcome : 'timeout',
    time: b.result ? b.result.time : b.now,
    teamFrac: teamHP / Math.max(1, teamMax), bossFrac: Math.max(0, beast.hp) / Math.max(1, beast.model.derived.HP),
    alive: team.filter(u => b.alive(u)).length, playerAlive: b.alive(player) ? 1 : 0,
    tier: beast.v12State ? beast.v12State.domainTier : 0,
    pulses, domainDamage, logLines: b.log.length,
    teamMax, teamHP
  };
}

function runSet(label, tuning, { runs = 24, level = 81, rank = 10 } = {}) {
  const rows = [];
  for (let i = 0; i < runs; i++) rows.push(runOne({ seed: `fg-${level}-r${rank}-${i}`, level, rank, tuning }));
  const wins = rows.filter(r => r.winner === 0).length;
  const losses = rows.filter(r => r.winner === 1).length;
  const draws = rows.length - wins - losses;
  const stalls = rows.filter(r => r.outcome === 'draw').length, timeouts = rows.filter(r => r.outcome === 'timeout').length;
  const avg = key => rows.reduce((n, r) => n + r[key], 0) / rows.length;
  return {
    label, tuning: { ...tuning }, runs, level, rank,
    winRate: wins / rows.length, losses, draws, stalls, timeouts,
    avgTime: Math.round(avg('time')), avgTeamFrac: +avg('teamFrac').toFixed(3), avgBossFrac: +avg('bossFrac').toFixed(3),
    avgAlive: +avg('alive').toFixed(2), playerAliveRate: +avg('playerAlive').toFixed(3),
    avgTier: +avg('tier').toFixed(2), avgPulses: +avg('pulses').toFixed(1),
    avgDomainDamage: Math.round(avg('domainDamage'))
  };
}

const VARIANTS = [
  { id: 'baseline', tuning: {} },
  { id: 'no-traits', tuning: { __off: true } },
  { id: 'nerf-A', tuning: { domainDamageRate: .08, domainShieldRate: .10, domainAllyAgility: .12, domainEnemyAgility: .04, domainEnemyGauge: .12 } },
  { id: 'nerf-B', tuning: { domainDamageRate: .06, domainShieldRate: .08, domainAllyAgility: .10, domainEnemyAgility: .03, domainEnemyGauge: .10 } },
  { id: 'nerf-C', tuning: { domainDamageRate: .05, domainShieldRate: .06, domainAllyAgility: .08, domainEnemyAgility: .02, domainEnemyGauge: .08 } }
];

const out = { base: BASE, results: [] };
const runs = Number(process.env.RUNS || 24);
const LEVEL = Number(process.env.LEVEL || 81), RANK = Number(process.env.RANK || 10);
const vFlag = process.argv.indexOf('--variants');
const variants = vFlag > 0 ? JSON.parse(fs.readFileSync(path.resolve(process.argv[vFlag + 1]), 'utf8')) : VARIANTS;
for (const v of variants) {
  if (v.tuning.__off) {
    // 关闭两条被动只用于归因：临时清空霜蚋的 v12Traits
    const rows = [];
    for (let i = 0; i < runs; i++) {
      const c = V.testCharacter(x.WITNESS_CATALOG, { seed: `fg-off-${i}`, target: 'frost-gnat', originRank: RANK, level: LEVEL });
      c.v12Choose('接受');
      const b = new B(c.v12StartBattle());
      const beast = b.units.find(u => u.beastId);
      beast.v12Traits = [];
      beast.shieldLayers = []; b.expireShields(beast);
      b.tick(b.now + 300000, true);
      const team = b.units.filter(u => u.team === 0), teamMax = team.reduce((n, u) => n + u.model.derived.HP, 0);
      rows.push({ winner: b.result ? b.result.winner : null, time: b.result ? b.result.time : b.now, teamFrac: team.reduce((n, u) => n + u.hp, 0) / teamMax, playerAlive: b.alive(b.unit('player')) ? 1 : 0 });
    }
    out.results.push({ label: 'no-traits', runs, winRate: rows.filter(r => r.winner === 0).length / runs, avgTime: Math.round(rows.reduce((n, r) => n + r.time, 0) / runs), avgTeamFrac: +(rows.reduce((n, r) => n + r.teamFrac, 0) / runs).toFixed(3), playerAliveRate: +(rows.reduce((n, r) => n + r.playerAlive, 0) / runs).toFixed(3) });
  } else {
    out.results.push(runSet(v.id, v.tuning, { runs, level: LEVEL, rank: RANK }));
  }
  console.log(JSON.stringify(out.results.at(-1)));
}
const jsonFlag = process.argv.indexOf('--json');
if (jsonFlag > 0) fs.writeFileSync(path.resolve(process.argv[jsonFlag + 1]), JSON.stringify(out, null, 2));
