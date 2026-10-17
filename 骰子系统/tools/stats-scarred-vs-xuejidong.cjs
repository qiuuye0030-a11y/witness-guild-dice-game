'use strict';
// 批量统计：神秘伤疤女 vs 公会会长雪寂冬，每等级 100 场。
// 等级含义：伤疤女镜像挑战者等级，雪寂冬在会长挑战中固定 95 级，
// 因此只有 L95 是同级对局，其余为「95 级会长 vs 低级伤疤女」。
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const L = require('./duel-lib.cjs');
const { makeDuel, tally, wilson, stats } = L;

// core.js:350-352 —— winner 取存活队伍：0 = team 0 = 雪寂冬（player），1 = team 1 = 神秘伤疤女（enemy）
const GM_WINS = 0, SCAR_WINS = 1;

const LEVELS = [95, 81, 61, 41], N = 100, rows = [];

for (const level of LEVELS) {
  for (let i = 0; i < N; i++) {
    const seed = `sim-${level}-${i}`;
    const b = makeDuel(level, seed);
    b.tick(180000, true);
    if (!b.result) throw new Error(`未结算 ${level}#${i}`);
    for (const u of b.units) for (const k of ['hp', 'sh', 'mp']) if (!Number.isFinite(u[k]) || u[k] < 0) throw new Error(`资源非法 ${level}#${i}`);
    // 胜者必须与失败方的退场状态一致：伤疤女需双槽皆空，雪寂冬任一槽空即退场
    const gm = b.unit('player'), scar = b.unit('enemy');
    if (b.result.winner === GM_WINS) assert(scar.hp <= 0 && scar.sh <= 0, `判雪寂冬胜但伤疤女未双槽清空 ${level}#${i}`);
    if (b.result.winner === SCAR_WINS) assert(gm.hp <= 0 || gm.sh <= 0, `判伤疤女胜但雪寂冬未退场 ${level}#${i}`);
    const t = tally(b);
    rows.push({
      level, seed, winner: b.result.winner, reason: b.result.reason,
      seconds: +(b.result.time / 1000).toFixed(2),
      // 结果指纹：用于判断战斗是否真的与种子无关
      signature: [b.result.winner, Math.round(b.result.time), t.scar.mp, t.scar.shieldLeft, t.gm.hp, t.gm.frostStacks, t.scar.hp].join('|'),
      counters: t.counters, damageTotal: t.damageTotal, damage: t.damage,
      gm: t.gm, scar: t.scar
    });
    if ((i + 1) % 25 === 0) console.log(`  L${level} 已完成 ${i + 1}/${N}`);
  }
}

const summary = LEVELS.map(level => {
  const s = rows.filter(r => r.level === level);
  const gmWins = s.filter(r => r.winner === GM_WINS).length, scarWins = s.filter(r => r.winner === SCAR_WINS).length;
  const ci = wilson(scarWins, s.length);
  const sig = new Map();
  for (const r of s) sig.set(r.signature, (sig.get(r.signature) || 0) + 1);
  const rate = k => +(s.reduce((n, r) => n + (r.counters[k] || 0), 0) / s.length).toFixed(2);
  const fired = k => +(s.filter(r => (r.counters[k] || 0) > 0).length / s.length * 100).toFixed(1);
  const reasons = {}; for (const r of s) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  return {
    level, n: s.length,
    gmWins, scarWins, draw: s.length - gmWins - scarWins,
    scarWinRate: +(scarWins / s.length).toFixed(3),
    gmWinRate: +(gmWins / s.length).toFixed(3),
    scarWinRateCI95: ci.map(v => +v.toFixed(3)),
    distinctOutcomes: sig.size,
    mostCommonOutcomeShare: +(Math.max(...sig.values()) / s.length).toFixed(3),
    reasons,
    seconds: stats(s.map(r => r.seconds)),
    damageDealt: { 雪寂冬: stats(s.map(r => r.damageTotal.player)), 伤疤女: stats(s.map(r => r.damageTotal.enemy)) },
    gmHpLeftPct: stats(s.map(r => +(r.gm.hpRatio * 100).toFixed(1))),
    scarHpLeftPct: stats(s.map(r => +(r.scar.hpRatio * 100).toFixed(1))),
    scarEndedAtFullHpPct: +(s.filter(r => r.scar.hpRatio >= 0.999).length / s.length * 100).toFixed(1),
    mechanicsPerBattle: {
      剑光布设: rate('scarSwordPlaced'), 剑光释放: rate('scarSwordRelease'), 剑光维持扣蓝: rate('scarSwordUpkeep'),
      潜行开始: rate('scarVeilStart'), 破隐吞噬: rate('scarVeilBreak'),
      霜棘冰结: rate('frostPassive'), 银岭遗御: rate('legendaryResist'), 双重龙化: rate('transform')
    },
    mechanicsFiredPct: {
      剑光布设: fired('scarSwordPlaced'), 剑光释放: fired('scarSwordRelease'), 潜行开始: fired('scarVeilStart'),
      破隐吞噬: fired('scarVeilBreak'), 霜棘冰结: fired('frostPassive'), 银岭遗御: fired('legendaryResist'), 双重龙化: fired('transform')
    },
    gmFrostStacks: stats(s.map(r => r.gm.frostStacks)),
    gmTransformedPct: +(s.filter(r => r.gm.transformed).length / s.length * 100).toFixed(1)
  };
});

const all = { n: rows.length, gmWins: rows.filter(r => r.winner === GM_WINS).length, scarWins: rows.filter(r => r.winner === SCAR_WINS).length };
all.scarWinRate = +(all.scarWins / all.n).toFixed(3);
all.scarWinRateCI95 = wilson(all.scarWins, all.n).map(v => +v.toFixed(3));
all.distinctOutcomes = new Set(rows.map(r => r.signature)).size;

const out = {
  version: 'v11.01', match: '神秘伤疤女 vs 公会会长雪寂冬', generatedBy: 'tools/stats-scarred-vs-xuejidong.cjs',
  design: { seedsPerLevel: N, levels: LEVELS, totalBattles: rows.length, duel: true, traitsEnabled: false, timeLimit: 180, scarredLevel: '与挑战者同级', guildmasterLevel: 95, timeoutWinner: '神秘伤疤女' },
  all, summary, rows
};
const dir = path.join(__dirname, '../output/v11'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, '双挑战对打_百次统计.json'), JSON.stringify(out, null, 2));

console.log('\n══ 总计 ══');
console.log(`${all.n} 场：伤疤女胜 ${all.scarWins}（${(all.scarWinRate * 100).toFixed(1)}%，95%CI ${(all.scarWinRateCI95[0] * 100).toFixed(1)}–${(all.scarWinRateCI95[1] * 100).toFixed(1)}%）｜雪寂冬胜 ${all.gmWins}｜不同结果指纹 ${all.distinctOutcomes}`);
for (const s of summary) {
  console.log(`\n── L${s.level}（n=${s.n}）──`);
  console.log(`  伤疤女胜 ${s.scarWins}/${s.n} = ${(s.scarWinRate * 100).toFixed(1)}%（95%CI ${(s.scarWinRateCI95[0] * 100).toFixed(1)}–${(s.scarWinRateCI95[1] * 100).toFixed(1)}%）｜不同结果指纹 ${s.distinctOutcomes}｜最常见结果占比 ${(s.mostCommonOutcomeShare * 100).toFixed(1)}%`);
  console.log(`  时长 中位${s.seconds.median}s 均值${s.seconds.mean}s 范围${s.seconds.min}–${s.seconds.max}s`);
  console.log(`  雪寂冬输出 中位${s.damageDealt.雪寂冬.median} 均值${s.damageDealt.雪寂冬.mean}｜伤疤女输出 中位${s.damageDealt.伤疤女.median} 均值${s.damageDealt.伤疤女.mean}`);
  console.log(`  伤疤女残血 中位${s.scarHpLeftPct.median}% 均值${s.scarHpLeftPct.mean}%｜满血结束 ${s.scarEndedAtFullHpPct}%`);
  console.log(`  雪寂冬残血 中位${s.gmHpLeftPct.median}%｜真身触发 ${s.gmTransformedPct}%｜霜棘层数 中位${s.gmFrostStacks.median}`);
  console.log(`  机制命中率 ${JSON.stringify(s.mechanicsFiredPct)}`);
}
console.log('\n已写出 output/v11/双挑战对打_百次统计.json');
