'use strict';
// v12.03.02 平衡回归：用构建后的实际数值跑三人讨伐（玩家+2援军），确认“较轻松取胜”。
// 断言：0 战败、胜+平 ≥ 95%、队伍剩余生命 ≥ 50%、平均用时 ≤ 120 秒；并对比旧数值必败。
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const x = require('./runtime-1008.cjs').load();
const B = x.WitnessBattle.Battle, V = x.WitnessCampaign.V12, T = x.WitnessV12Tuning;
const tests = [];
const test = (name, fn) => { fn(); tests.push(name); console.log('PASS', name); };

function runOne({ seed, level, rank = 10 }) {
  const c = V.testCharacter(x.WITNESS_CATALOG, { seed, target: 'frost-gnat', originRank: rank, level });
  c.v12Choose('接受');
  const b = new B(c.v12StartBattle());
  const beast = b.units.find(u => u.beastId);
  b.tick(b.now + 300000, true);
  const team = b.units.filter(u => u.team === 0), teamMax = team.reduce((n, u) => n + u.model.derived.HP, 0);
  return {
    winner: b.result ? b.result.winner : null, time: b.result ? b.result.time : b.now,
    teamFrac: team.reduce((n, u) => n + u.hp, 0) / Math.max(1, teamMax),
    playerAlive: b.alive(b.unit('player')) ? 1 : 0,
    tier: beast.v12State ? beast.v12State.domainTier : 0,
    shell: (beast.shieldLayers || []).filter(l => l.label === '冰壳护生').map(l => l.amount)
  };
}
function runSet(level, runs) {
  const rows = []; for (let i = 0; i < runs; i++) rows.push(runOne({ seed: `fg-${level}-r10-${i}`, level }));
  const wins = rows.filter(r => r.winner === 0).length, losses = rows.filter(r => r.winner === 1).length;
  const avg = k => rows.reduce((n, r) => n + r[k], 0) / rows.length;
  return { level, runs, wins, losses, draws: runs - wins - losses, winRate: wins / runs, resolvedRate: (runs - losses) / runs,
    avgTime: Math.round(avg('time')), avgTeamFrac: +avg('teamFrac').toFixed(3), playerAliveRate: +avg('playerAlive').toFixed(3), avgTier: +avg('tier').toFixed(2) };
}

test('tuning 与更新说明一致（冰壳40%、每档2%/4%/4%、三档2%/2%）', () => {
  assert.deepEqual({ ...T }, { iceShellRate: .4, domainMaxTier: 3, domainAllyAgility: .04, domainEnemyAgility: .02, domainEnemyGauge: .04, domainShieldRate: .02, domainDamageRate: .02 });
});

const results = [];
for (const level of [81, 85]) test('三人讨伐 Lv' + level + '：0 战败，胜+平≥95%，剩余生命≥50%', () => {
  const r = runSet(level, 32);
  results.push(r);
  assert.equal(r.losses, 0, '出现战败：' + JSON.stringify(r));
  assert(r.resolvedRate >= .95, '胜+平不足：' + JSON.stringify(r));
  assert(r.avgTeamFrac >= .5, '队伍剩余生命过低：' + JSON.stringify(r));
  assert(r.avgTime <= 120000, '平均用时过长：' + JSON.stringify(r));
  assert.equal(r.avgTier, 3, '霜域应打到三档');
});

test('旧数值（冰壳70%、12%/10%）在同一批种子下确实会全灭', () => {
  const keep = { ...T };
  Object.assign(T, { iceShellRate: .7, domainAllyAgility: .15, domainEnemyAgility: .05, domainEnemyGauge: .15, domainShieldRate: .12, domainDamageRate: .10 });
  const rows = []; for (let i = 0; i < 8; i++) rows.push(runOne({ seed: `fg-81-r10-${i}`, level: 81 }));
  const losses = rows.filter(r => r.winner === 1).length;
  Object.assign(T, keep);
  assert(losses >= 6, '旧数值未体现过高强度：' + losses + '/8');
});

const out = path.join(__dirname, '../output/v12'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'v12.03.02平衡回归.json'), JSON.stringify({ tuning: { ...T }, results, passed: tests.length }, null, 2));
console.log('ALL BALANCE', tests.length);
