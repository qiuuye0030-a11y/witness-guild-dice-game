'use strict';
// 缺陷回归：普通玩家 vs 神秘伤疤女，修复前 34/120 崩溃，修复后应为 0。
const { load } = require('./verify-v11.cjs');
const x = load(), B = x.WitnessBattle.Battle;
let crash = 0, ok = 0; const first = [];
for (const p of ['qinyan', 'linshi', 'xuejidong', 'qingling', 'hash'])
  for (const level of [41, 61, 81])
    for (let i = 0; i < 8; i++) {
      try { new B({ playerTemplateId: p, testLevel: level, enemyId: 'xuejidong', duel: true, challengeId: 'mysterious_scarred_woman', traitsEnabled: false, seed: `probe-${p}-${level}-${i}` }).tick(180000, true); ok++; }
      catch (e) { crash++; if (first.length < 3) first.push(`${p}/L${level}#${i}: ${e.message}`); }
    }
console.log(`普通玩家 vs 神秘伤疤女：成功 ${ok} 崩溃 ${crash}`);
for (const f of first) console.log('  ' + f);
if (crash) process.exit(1);
