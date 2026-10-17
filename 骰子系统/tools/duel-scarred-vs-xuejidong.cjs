'use strict';
// 双独立挑战互殴——断言型冒烟测试。
// 批量统计请用 tools/stats-scarred-vs-xuejidong.cjs（同一套 duel-lib 构建逻辑）。
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const L = require('./duel-lib.cjs');
const { x, B, makeDuel, tally } = L;

// core.js:350-352 —— winner 取存活队伍：0 = team 0 = 雪寂冬（player），1 = team 1 = 神秘伤疤女（enemy）
const GM_WINS = 0, SCAR_WINS = 1;
const name = w => w === GM_WINS ? '雪寂冬' : w === SCAR_WINS ? '神秘伤疤女' : '平';

assert(x.WitnessTemplates.some(t => t.id === 'xuejidong'), 'v11.01 未包含雪寂冬考官模板');
assert(x.WitnessScarredChallenge, '打包白名单未导出 WitnessScarredChallenge（_sync_v13.py）');

// ── 本轮修掉的引擎缺陷（回归点） ───────────────────────────────────
// projection.js 的 dotTimeline() 会调用 checkResult() 与 applyDotDamage()，两条链都会落到伤疤女的
// 延迟结算上：pulse()（释放蛰伏剑光）与 breakVeil()（破隐吞噬一击）。两者都要经 strike() → hit()
// 掷骰，但投影分叉的 rng 按设计禁止随机，于是抛 "Projection randomness requires an explicit branch"
// 并中断整个 AI 预测。实测普通玩家对伤疤女 120 场曾崩 34 场（28%），并非 Boss 对 Boss 专属。
// 已修：forkProjectionState 标记 _projection；pulse 与 breakVeil 在投影内直接返回。
{
  const b = makeDuel(95, 'duel-projection-guard');
  const u = b.unit('enemy');
  u.scarred.swords.push({ id: 999, at: b.now });
  u.scarred.veil = { at: b.now };
  assert.doesNotThrow(() => b.forecastExistingDOT({ horizon: 18 }), '投影内仍会掷骰：pulse/breakVeil 未被隔离');
  assert.equal(typeof b.rng.state, 'number', '真实战斗的 rng 必须是 DiceEngine');
}

// 两套挑战机制在无对局中也应各自就绪
{
  const b = makeDuel(95, 'duel-selftest');
  assert.equal(b.unit('player').guildmaster.version, 1);
  assert.equal(b.unit('enemy').scarred.version, 1);
  assert.equal(b.unit('enemy').shieldHP, b.unit('enemy').model.derived.HP, '祥光盾应等于最大生命');
  assert.equal(b.unit('enemy').mp, x.WitnessRules.derive(b.unit('enemy').model.stats).MP * 3, '伤疤女魂力应为三倍');
}

// ── 存档往返 ─────────────────────────────────────────────────────
// 严格比对会因一个纯显示字段不等：shields.js:267 的 initialize() 会把 selfOnly 技能的
// skill.target 改写成「仅自身」，而会长挑战是在 ShieldActions.initialize 之后才换掉技能表
// （challenge/battle.js:16-18），所以实时单位里「寒锋龙躯」的 target 仍是「自己或一名队友」，
// 读档时又被规范化。targetOptions 只读 selfOnly / modernEffect，不读该字符串，属显示层差异。
const functional = snap => {
  const c = JSON.parse(JSON.stringify(snap));
  for (const u of c.units || []) for (const s of u.skills || []) delete s.target;
  return JSON.stringify(c);
};
function roundTrip(level, seed) {
  const b = makeDuel(level, seed);
  b.tick(4000, true);
  const r = new B({ snapshot: b.snapshot() });
  b.tick(20000, true); r.tick(20000, true);
  const a = b.snapshot(), z = r.snapshot();
  return { strict: JSON.stringify(a) === JSON.stringify(z), functional: functional(a) === functional(z) };
}
const rt = roundTrip(95, 'duel-roundtrip');
console.log('存档往返：严格一致', rt.strict, '| 功能一致', rt.functional);
assert(rt.functional, '存档往返在功能层面不一致');

// ── 主流程 ───────────────────────────────────────────────────────
const LEVELS = [95, 81, 61, 41], SEEDS = 12, rows = [];
for (const level of LEVELS) for (let i = 0; i < SEEDS; i++) {
  const seed = `duel-${level}-${i}`;
  const b = makeDuel(level, seed);
  b.tick(180000, true);
  assert(b.result, '战斗未结算');
  const gm = b.unit('player'), scar = b.unit('enemy');
  for (const u of b.units) for (const k of ['hp', 'sh', 'mp']) assert(Number.isFinite(u[k]) && u[k] >= 0, '资源出现非法值');
  if (b.result.winner === GM_WINS) assert(scar.hp <= 0 && scar.sh <= 0, `判雪寂冬胜但伤疤女未双槽清空 ${level}#${i}`);
  if (b.result.winner === SCAR_WINS) assert(gm.hp <= 0 || gm.sh <= 0, `判伤疤女胜但雪寂冬未退场 ${level}#${i}`);
  const t = tally(b);
  rows.push({ level, seed, winner: b.result.winner, reason: b.result.reason, seconds: +(b.result.time / 1000).toFixed(2), counters: t.counters, damageTotal: t.damageTotal, damage: t.damage, gm: t.gm, scar: t.scar });
  console.log(`L${level} #${i} ${name(b.result.winner)}胜 ${(b.result.time / 1000).toFixed(2)}s | 伤疤女 生命${(t.scar.hpRatio * 100).toFixed(1)}% 魂力${t.scar.mp} 盾${t.scar.shieldLeft} | 雪寂冬 生命${(t.gm.hpRatio * 100).toFixed(1)}% 霜棘${t.gm.frostStacks}层 真身${t.gm.transformed ? 'on' : 'off'} 遗御剩${t.gm.legendaryLeft}`);
}

const summary = LEVELS.map(level => {
  const s = rows.filter(r => r.level === level);
  const gmWins = s.filter(r => r.winner === GM_WINS).length, scarWins = s.filter(r => r.winner === SCAR_WINS).length;
  const sum = k => s.reduce((n, r) => n + (r.counters[k] || 0), 0);
  const avg = f => Math.round(s.reduce((n, r) => n + f(r), 0) / s.length);
  return {
    level, n: s.length, gmWins, scarWins, draw: s.length - gmWins - scarWins,
    gmWinRate: +(gmWins / s.length).toFixed(3),
    avgSeconds: +(s.reduce((n, r) => n + r.seconds, 0) / s.length).toFixed(1),
    avgScarHpLeft: +(s.reduce((n, r) => n + r.scar.hpRatio, 0) / s.length).toFixed(4),
    avgGmHpLeft: +(s.reduce((n, r) => n + r.gm.hpRatio, 0) / s.length).toFixed(4),
    mechanics: {
      剑光布设: sum('scarSwordPlaced'), 剑光释放: sum('scarSwordRelease'), 剑光维持扣蓝: sum('scarSwordUpkeep'),
      潜行开始: sum('scarVeilStart'), 破隐吞噬: sum('scarVeilBreak'),
      霜棘冰结触发: sum('frostPassive'), 银岭遗御: sum('legendaryResist'), 双重龙化: sum('transform')
    },
    avgDamage: { 雪寂冬总输出: avg(r => r.damageTotal.player), 伤疤女总输出: avg(r => r.damageTotal.enemy) },
    avgDamageBreakdown: {
      雪寂冬: { 击穿生命: avg(r => r.damage.player.hp), 被魂力抵消: avg(r => r.damage.player.mp), 被护盾吸收: avg(r => r.damage.player.shield) },
      伤疤女: { 击穿生命: avg(r => r.damage.enemy.hp), 被魂力抵消: avg(r => r.damage.enemy.mp), 被护盾吸收: avg(r => r.damage.enemy.shield) }
    }
  };
});

// 两套挑战机制确实同场生效
{
  const tot = k => summary.reduce((n, s) => n + (s.mechanics[k] || 0), 0);
  for (const k of ['剑光布设', '剑光释放', '潜行开始', '破隐吞噬', '霜棘冰结触发', '双重龙化']) assert(tot(k) > 0, `机制未触发：${k}`);
}

const out = {
  version: 'v11.01', match: '神秘伤疤女 vs 公会会长雪寂冬', generatedBy: 'tools/duel-scarred-vs-xuejidong.cjs',
  rules: { duel: true, traitsEnabled: false, timeLimit: 180, scarredLevel: '与挑战者同级', guildmasterLevel: 95, timeoutWinner: '神秘伤疤女' },
  notes: {
    修复: ['systems/battle/projection.js：forkProjectionState 增加 _projection 标记', 'systems/battle/scarred-woman.js：pulse 与 breakVeil 在投影内直接返回', '_sync_v13.py：白名单补出 WitnessScarredChallenge，并重新生成 bundle'],
    显示层差异: 'shields.js:267 会把 selfOnly 技能的 skill.target 改写为「仅自身」，会长挑战在 ShieldActions.initialize 之后才替换技能表，故实时单位保留「自己或一名队友」；targetOptions 不读该字符串，非功能差异',
    机制覆盖提示: '银岭遗御在本对局中恒为 0：伤疤女只有一项攻击与一项自身强化，从不施加控制。'
  },
  snapshotRoundTrip: rt, summary, rows
};
const dir = path.join(__dirname, '../output/v11'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, '双挑战对打_伤疤女vs雪寂冬.json'), JSON.stringify(out, null, 2));
console.log('\n── 汇总 ──');
for (const s of summary) console.log(`L${s.level}: 雪寂冬 ${s.gmWins}/${s.n} 胜（${(s.gmWinRate * 100).toFixed(0)}%） 均时${s.avgSeconds}s 伤疤女残血${(s.avgScarHpLeft * 100).toFixed(1)}% 雪寂冬残血${(s.avgGmHpLeft * 100).toFixed(1)}%`);
console.log('已写出 output/v11/双挑战对打_伤疤女vs雪寂冬.json');
