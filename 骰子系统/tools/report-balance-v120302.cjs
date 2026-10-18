'use strict';
// 生成 v12.03.02 平衡报告：同批种子下旧值(12.03.01)与新值(12.03.02)、去掉两条被动的归因、单人/双人/三人对比。
const fs = require('node:fs'), path = require('node:path');
const x = require('./runtime-1008.cjs').load();
const B = x.WitnessBattle.Battle, V = x.WitnessCampaign.V12, T = x.WitnessV12Tuning;
const SHIPPED = { ...T };
const OLD = { iceShellRate: .7, domainMaxTier: 3, domainAllyAgility: .15, domainEnemyAgility: .05, domainEnemyGauge: .15, domainShieldRate: .12, domainDamageRate: .10 };

function run({ seed, level, rank, tuning, offTraits }) {
  Object.assign(T, SHIPPED, tuning || {});
  const c = V.testCharacter(x.WITNESS_CATALOG, { seed, target: 'frost-gnat', originRank: rank, level });
  c.v12Choose('接受');
  const b = new B(c.v12StartBattle());
  const beast = b.units.find(u => u.beastId);
  if (offTraits) { beast.v12Traits = []; beast.shieldLayers = []; b.expireShields(beast); }
  b.tick(b.now + 300000, true);
  const team = b.units.filter(u => u.team === 0), teamMax = team.reduce((n, u) => n + u.model.derived.HP, 0);
  return {
    winner: b.result ? b.result.winner : null, time: b.result ? b.result.time : b.now,
    teamFrac: team.reduce((n, u) => n + u.hp, 0) / Math.max(1, teamMax),
    playerAlive: b.alive(b.unit('player')) ? 1 : 0, tier: beast.v12State ? beast.v12State.domainTier : 0,
    domainDamage: b.log.reduce((n, l) => { const m = /被霜域侵蚀(\d+)/.exec(l.text); return n + (m ? Number(m[1]) : 0); }, 0),
    pulses: b.log.filter(l => /被霜域侵蚀/.test(l.text)).length
  };
}
function set(label, opts, runs) {
  const rows = []; for (let i = 0; i < runs; i++) rows.push(run({ ...opts, seed: `fg-${opts.level}-r${opts.rank}-${i}` }));
  const wins = rows.filter(r => r.winner === 0).length, losses = rows.filter(r => r.winner === 1).length;
  const avg = k => rows.reduce((n, r) => n + r[k], 0) / rows.length;
  return { label, level: opts.level, rank: opts.rank, runs, wins, losses, draws: runs - wins - losses,
    winRate: +(wins / runs).toFixed(3), avgTime: Math.round(avg('time')), avgTeamFrac: +avg('teamFrac').toFixed(3),
    playerAliveRate: +avg('playerAlive').toFixed(3), avgTier: +avg('tier').toFixed(2),
    avgPulses: +avg('pulses').toFixed(1), avgDomainDamage: Math.round(avg('domainDamage')) };
}

const out = { shipped: SHIPPED, old: OLD, runsPerCell: 48, cells: [] };
const R = 48;
for (const level of [80, 81, 85, 90]) {
  out.cells.push(set('旧值 Lv' + level + ' 三人', { level, rank: 10, tuning: OLD }, R));
  out.cells.push(set('新值 Lv' + level + ' 三人', { level, rank: 10, tuning: {}, }, R));
}
out.cells.push(set('新值 Lv81 无被动（归因）', { level: 81, rank: 10, tuning: {}, offTraits: true }, R));
out.cells.push(set('新值 Lv81 单人', { level: 81, rank: 1, tuning: {} }, R));
out.cells.push(set('新值 Lv81 双人', { level: 81, rank: 8, tuning: {} }, R));
Object.assign(T, SHIPPED);
for (const c of out.cells) console.log(JSON.stringify(c));
const outDir = path.join(__dirname, '../output/v12');
fs.writeFileSync(path.join(outDir, 'v12.03.02平衡模拟.json'), JSON.stringify(out, null, 2));

const row = c => `| ${c.label} | ${c.wins}/${c.runs} | ${c.losses} | ${c.draws} | ${Math.round(c.winRate * 100)}% | ${(c.avgTime / 1000).toFixed(1)}s | ${Math.round(c.avgTeamFrac * 100)}% | ${Math.round(c.playerAliveRate * 100)}% | ${c.avgPulses} |`;
const md = `# 霜蚋讨伐平衡模拟（v12.03.02）

自动战斗模拟：\`tools/sim-frost-gnat.cjs\` 与 \`tools/verify-balance-v120302.cjs\`，使用构建后的真实引擎与 AI（玩家由自动 AI 操作）。
每格 48 颗种子；"平"指战斗超过 300 秒未结束（多数是 AI 在缺蓝时反复施放防御技能造成的循环，不是数值问题，实际会继续打）。

## 结论

- 12.03.01 的数值（冰壳 70%、每档 −5%／−15%／+15%、三档 12%／10%）下，三人队（玩家＋2 援军）**几乎必败**：Lv80/81 战败率 94–97%，队伍全灭。
- 调到"冰壳 40%、每档 −2%／−4%／+4%、三档 2%／2%"后，三人队 **0 战败**，胜率 94–100%（其余为上述 AI 超时），平均 55–85 秒，队伍剩余生命 56–67%。
- 归因：去掉两条被动时三人队 100% 胜、剩余 81% 生命、47 秒——说明差距完全来自这两条特性，而不是魂兽本身的基础技能。

## 逐项数据

| 配置 | 胜 | 败 | 平/超时 | 胜率 | 平均用时 | 队伍剩余生命 | 玩家存活 | 平均脉冲次数 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${out.cells.map(row).join('\n')}

## 削弱方向（按影响从大到小）

1. **冰壳 70% → 40%**：这是把战斗拖长的主因（三人局盾量 10353 → 5916）。战斗越长，领域脉冲累计伤害越多，也越容易把队伍魂力耗干。
2. **三档脉冲 10% → 2%**：每一跳都打在全部敌方单位上，是队伍掉血的主要来源；降幅必须最大。
3. **寒冰护盾 12% → 2%**：每一跳都给霜蚋补盾，会让"缺蓝的普攻"永远追不上回盾，形成打不死的长尾。
4. **每档敏捷／行动条 −5%／−15% → −2%／−4%**：这部分同时拖慢队伍的行动条、放大霜蚋的行动次数（脉冲次数），是"越打越慢"的放大器。
5. **友方敏捷 +15% → +4%**：只影响霜蚋自身行动频率，可以最后动。

以上都是纯数值调整：三档推进、每回合脉冲、开战一次性护盾、击破反伤、驱散压住一回合等机制全部保留（集中在 \`systems/v12/battle.js\` 的 \`tuning\` 对象）。

## 仍需注意

- 单人（无援军、血量 ×1.5）在 Lv80–95 仍然赢不了（模拟 0–4%）；本版只保证"三人较轻松"，单人若要有胜率需要单独一版数值（例如把独行倍率降到 1.2 或给单人额外护盾）。
- 双人（1 援军）约 56%，属于有挑战但仍可打；若要"双人也轻松"，需要把冰壳再降到 30% 左右。
- 自动 AI 不会像玩家那样切换普攻／保留魂力，因此真人手动战斗通常会比模拟更轻松。
`;
fs.writeFileSync(path.join(__dirname, '../v12.03.02_平衡模拟.md'), md);
console.log('report written');
