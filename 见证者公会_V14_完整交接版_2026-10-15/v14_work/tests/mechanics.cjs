'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { load } = require('../load.cjs');
const box = load('mechanics');
const baseline = load('baseline');
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
const cases = [], examples = [];
function test(name, fn) {
  fn(); passed++;
  cases.push({ name, status: 'passed', conclusion: '全部验收断言通过' });
  console.log('PASS ' + name);
}
function battle(player = 'xiaowen', enemy = 'qinyan', api = box) {
  return new api.WitnessBattle.Battle({ playerTemplateId: player, enemyId: enemy,
    testLevel: 61, duel: true, withSupport: true, seed: 'v14-mechanics-test' });
}
function plan(b, u, s, t = u) {
  const pre = Object.fromEntries(b.units.map(unit => [unit.id, b.effective(unit)]));
  return b.plan(u, { action: s.id, target: t.id, skill: s, rage: 0 }, pre);
}
function cast(b, u, s, t = u) {
  const p = plan(b, u, s, t);
  if (p.damage) b.applyDamage(p.t, p.damage, p.channel, u, s.fx);
  for (const extra of p.extraDamage || []) b.applyDamage(p.t, extra.amount, extra.channel, u, s.fx);
  p.effects.forEach(effect => effect());
  return p;
}
function add(b, t, source, amount, options = {}) {
  return b.addShieldLayer(t, { source, amount, until: b.now + 8000,
    channel: '生命', label: source, ...options });
}
function setupStack() {
  const b = battle(), t = b.unit('player');
  t.mp = 0;
  cast(b, b.unit('ally'), b.unit('ally').skills[4], t);
  cast(b, t, t.skills[2], t);
  return { b, t, hp: t.hp };
}

test('real gardenia 547 + dust mirror 416 coexist in outer-first order', () => {
  const { b, t } = setupStack();
  assert.equal(t.shieldHP, 963);
  assert.deepEqual(b.shieldLayersFor(t).map(x => x.amount), [416, 547]);
  assert.deepEqual(b.shieldLayersFor(t).map(x => x.oneHit), [true, false]);
  examples.push({ id: 'real-skill-stack', title: '栀子花露与尘镜可以同时存在',
    conditions: '61级；依次通过正式魂技的plan/effects结算栀子花露和尘刃·尘镜；目标魂力设为0，以隔离护盾效果。',
    steps: [
      { action: '伊筱蓓先给晓雯施放栀子花露', lifeShield: 547 },
      { action: '晓雯再施放尘刃·尘镜', lifeShield: t.shieldHP,
        outerToInner: b.shieldLayersFor(t).map(x => ({ name: x.label, amount: x.amount, oneHit: x.oneHit })) }
    ], conclusion: '总护盾为963：外层尘镜416、内层栀子547，先抵挡伤害的是后施放的尘镜。' });
});
for (const [damage, remaining, loss] of [[100, 547, 0], [416, 547, 0], [500, 463, 0], [1100, 0, 137]]) {
  test('outer one-hit shield with incoming ' + damage, () => {
    const { b, t, hp } = setupStack();
    b.applyDamage(t, damage, '物理', b.unit('enemy'));
    assert.equal(t.shieldHP, remaining);
    assert.equal(t.hp, hp - loss);
    assert.ok(b.shieldLayersFor(t).every(layer => !layer.oneHit));
  });
}
test('two damage segments consume only reached shields', () => {
  const { b, t, hp } = setupStack();
  b.applyDamage(t, 100, '物理');
  const afterFirst = { lifeShield: t.shieldHP, hpLoss: hp - t.hp };
  b.applyDamage(t, 600, '能量');
  assert.equal(t.hp, hp - 53);
  assert.equal(t.shieldHP, 0);
  examples.push({ id: 'one-hit-multiple-segments', title: '一次性护盾只保护接触它的那一段',
    conditions: '同一套547栀子内层+416尘镜外层；两段已经完成防御减伤计算的伤害依次为100和600；目标魂力为0。',
    steps: [
      { action: '第一段100伤害由尘镜挡下，尘镜随后消散', incomingDamage: 100, ...afterFirst },
      { action: '第二段600伤害击穿栀子547', incomingDamage: 600,
        lifeShield: t.shieldHP, totalHpLoss: hp - t.hp }
    ], conclusion: '第一段结束时栀子仍有547，生命损失0；第二段结束时护盾归零，生命累计损失53。尘镜未使用的316不会继续抵挡第二段。' });
});
test('inner one-hit shield stays until outer shield is penetrated', () => {
  const b = battle(), t = b.unit('player'); t.mp = 0;
  add(b, t, 'inner-once', 100, { oneHit: true, rageOnBreak: true });
  add(b, t, 'outer-normal', 200);
  b.applyDamage(t, 50, '物理');
  assert.equal(t.rage, 0);
  assert.deepEqual(b.shieldLayersFor(t).map(x => [x.source, x.amount, x.oneHit]),
    [['outer-normal', 150, false], ['inner-once', 100, true]]);
  b.applyDamage(t, 151, '物理');
  assert.equal(t.shieldHP, 0);
  assert.equal(t.rage, 1);
});
test('mental and life shields never clear the other channel', () => {
  const b = battle(), t = b.unit('player'); t.mp = 0;
  add(b, t, 'life-once', 100, { oneHit: true });
  add(b, t, 'mind-normal', 300, { channel: '精神' });
  b.applyDamage(t, 50, '精神');
  assert.equal(t.shieldSH, 250); assert.equal(t.shieldHP, 100);
  const afterMental = { lifeShield: t.shieldHP, mentalShield: t.shieldSH };
  b.applyDamage(t, 20, '物理');
  assert.equal(t.shieldHP, 0); assert.equal(t.shieldSH, 250);
  examples.push({ id: 'independent-channels', title: '生命护盾和精神护盾各管各的',
    conditions: '隔离验收层：生命一次盾100、精神普通盾300；目标魂力为0。',
    steps: [
      { action: '受到50精神伤害', incomingDamage: 50, ...afterMental },
      { action: '再受到20生命伤害，生命一次盾触发后消散', incomingDamage: 20,
        lifeShield: t.shieldHP, mentalShield: t.shieldSH }
    ], conclusion: '精神伤害后保留生命盾100、精神盾250；生命伤害后仅生命一次盾消散，精神盾仍有250。两次都未损失生命或精神护持。' });
});
test('mental one-hit layer applies only within mental channel', () => {
  const b = battle(), t = b.unit('player'); t.mp = 0;
  add(b, t, 'mind-inner', 80, { channel: '精神' });
  add(b, t, 'mind-once', 40, { channel: '精神', oneHit: true });
  b.applyDamage(t, 10, '精神');
  assert.equal(t.shieldSH, 80);
  b.applyDamage(t, 100, '精神');
  assert.equal(t.sh, t.model.derived.SH - 20);
});
test('independent shield expiry and legacy totals', () => {
  const b = battle(), t = b.unit('player');
  add(b, t, 'life-short', 50, { until: 1000 });
  add(b, t, 'life-long', 75, { until: 3000 });
  add(b, t, 'mind-medium', 100, { channel: '精神', until: 2000 });
  b.now = 1000; b.expireShields();
  assert.equal(t.shieldHP, 75); assert.equal(t.shieldSH, 100); assert.equal(t.shieldUntil, 2000);
  b.now = 2000; b.expireShields(t);
  assert.equal(t.shieldHP, 75); assert.equal(t.shieldSH, 0); assert.equal(t.shieldUntil, 3000);
});
test('actual tick preserves later layer when shared legacy deadline expires', () => {
  const b = battle(), t = b.unit('player');
  for (const unit of b.units) { unit.readyAt = 10000; unit.progress = 0; unit.cast = null; }
  b.activeId = null; b.scheduleAI = () => {};
  add(b, t, 'short', 10, { until: 1000 }); add(b, t, 'long', 20, { until: 4000 });
  b.tick(1500, true);
  assert.equal(b.now, 1500); assert.equal(t.shieldHP, 20); assert.equal(t.shieldUntil, 4000);
});
test('same caster and skill refreshes amount duration and moves outermost', () => {
  const b = battle(), t = b.unit('player'), ally = b.unit('ally');
  cast(b, t, t.skills[2]); cast(b, ally, ally.skills[4], t);
  b.now = 1000; cast(b, t, t.skills[2]);
  const layers = b.shieldLayersFor(t);
  assert.equal(layers.length, 2); assert.equal(layers[0].skillId, t.skills[2].id);
  assert.equal(layers[0].until, 9000); assert.equal(layers[1].until, 8000);
  assert.equal(t.shieldHP, 963);
});
test('same skill from two casters remains independent', () => {
  const b = battle(), t = b.unit('player');
  cast(b, b.unit('ally'), b.unit('ally').skills[4], t);
  cast(b, b.unit('enemySupport'), b.unit('enemySupport').skills[4], t);
  assert.equal(b.shieldLayersFor(t).length, 2); assert.equal(t.shieldHP, 1094);
});
test('snapshot V14 roundtrip preserves order amounts flags and expiry', () => {
  const { b, t } = setupStack();
  add(b, t, 'mental', 80, { channel: '精神', until: 9000 });
  const snapshot = b.snapshot();
  assert.equal(snapshot.version, 10); assert.equal(snapshot.combatRulesVersion, 14);
  assert.equal(snapshot.v14ShieldVersion, 1);
  const restored = new box.WitnessBattle.Battle({ snapshot });
  assert.deepEqual(plain(restored.shieldLayersFor(restored.unit('player'))), plain(b.shieldLayersFor(t)));
  b.applyDamage(t, 450, '物理'); restored.applyDamage(restored.unit('player'), 450, '物理');
  assert.deepEqual(plain(restored.unit('player')), plain(t));
});
test('V13 migration keeps separate legacy life/mind layers and original deadlines', () => {
  const original = battle('xiaowen', 'qinyan', baseline), t = original.unit('player');
  original.now = 2000;
  Object.assign(t, { shieldHP: 150, shieldSH: 250, shieldUntil: 6000, guard: .7, oneHit: true, rageOnBreak: true });
  const restored = new box.WitnessBattle.Battle({ snapshot: original.snapshot() });
  const u = restored.unit('player');
  assert.equal(restored.shieldLayersFor(u).length, 2);
  assert.ok(restored.shieldLayersFor(u).every(x => x.legacy && x.until === 6000));
  add(restored, u, 'new-cast', 100);
  assert.equal(u.shieldHP, 250); assert.equal(u.shieldSH, 250);
  restored.now = 6000; restored.expireShields();
  assert.equal(u.shieldHP, 100); assert.equal(u.shieldSH, 0);
  restored.expireShields(); assert.equal(restored.shieldLayersFor(u).length, 1);
});
test('expired V13 shields do not resurrect and initialized empty array never reimports', () => {
  const original = battle('xiaowen', 'qinyan', baseline); original.now = 3000;
  Object.assign(original.unit('player'), { shieldHP: 100, shieldUntil: 2000 });
  const restored = new box.WitnessBattle.Battle({ snapshot: original.snapshot() });
  const t = restored.unit('player'); assert.equal(t.shieldHP, 0);
  t.shieldHP = 100; t.shieldUntil = 8000; restored.expireShields(t);
  assert.equal(t.shieldHP, 0);
});
test('percentage guard is outer-first, one-use, and overflow reaches inner layer', () => {
  const b = battle(), t = b.unit('player'); t.mp = 0;
  add(b, t, 'inner', 100); add(b, t, 'guard', 0, { guard: .7, oneHit: true, rageOnBreak: true });
  b.applyDamage(t, 400, '物理');
  assert.equal(t.hp, t.model.derived.HP - 20); assert.equal(t.rage, 1); assert.equal(t.shieldHP, 0);
  b.applyDamage(t, 50, '物理'); assert.equal(t.hp, t.model.derived.HP - 70); assert.equal(t.rage, 1);
});
test('inner percentage guard is not consumed when outer numeric layer blocks all', () => {
  const b = battle(), t = b.unit('player'); t.mp = 0;
  add(b, t, 'guard', 0, { guard: .7, oneHit: true, rageOnBreak: true }); add(b, t, 'outer', 500);
  b.applyDamage(t, 100, '能量');
  assert.equal(b.shieldLayersFor(t).find(x => x.source === 'guard').guard, .7); assert.equal(t.rage, 0);
  b.applyDamage(t, 500, '能量');
  assert.equal(t.hp, t.model.derived.HP - 30); assert.equal(t.rage, 1);
});
test('ordinary rage shield triggers when broken but expiry grants no rage', () => {
  const b = battle(), t = b.unit('player'); t.mp = 0;
  add(b, t, 'rage', 20, { rageOnBreak: true }); b.applyDamage(t, 10, '物理');
  assert.equal(t.rage, 0); b.applyDamage(t, 10, '物理'); assert.equal(t.rage, 1);
  add(b, t, 'expired-rage', 20, { rageOnBreak: true, until: 1000 });
  b.now = 1000; b.expireShields(); assert.equal(t.rage, 1);
});
test('layer dispel preserves aggregate rounding without cross-channel or one-hit loss', () => {
  const b = battle(), t = b.unit('player');
  add(b, t, 'a', 3, { oneHit: true, rageOnBreak: true }); add(b, t, 'b', 4);
  add(b, t, 'mind', 8, { channel: '精神' });
  assert.equal(b.dispelShieldLayers(t, .6), 4);
  assert.equal(t.shieldHP, 3); assert.equal(t.shieldSH, 8);
  assert.equal(b.shieldLayersFor(t).find(x => x.source === 'a').oneHit, true); assert.equal(t.rage, 0);
});
test('actual dispel skill reduces all remaining life layers once and preserves mental layers', () => {
  const b = battle('hash'), u = b.unit('player'), t = b.unit('enemy');
  add(b, t, 'a', 100); add(b, t, 'b', 200); add(b, t, 'mind', 80, { channel: '精神' });
  const skill = u.skills.find(s => s.dispel), p = plan(b, u, skill, t);
  p.effects.forEach(f => f());
  assert.equal(t.shieldHP, 120); assert.equal(t.shieldSH, 80);
  assert.equal(b.shieldLayersFor(t, '生命').length, 2);
});
test('pure preview matches real MP protection and resource event', () => {
  const b = battle(), t = b.unit('player'), source = b.unit('enemy');
  t.mp = 17; add(b, t, 'small', 30);
  const before = JSON.stringify(t), preview = b.previewProtection(t, 130, '物理', source);
  assert.equal(JSON.stringify(t), before);
  assert.equal(preview.blocked, 30); assert.equal(preview.absorbed, 17);
  assert.equal(preview.mpCost, 17); assert.equal(preview.healthDamage, 83);
  b.applyDamage(t, 130, '物理', source);
  assert.equal(t.hp, t.model.derived.HP - 83); assert.equal(t.mp, 0);
  const event = b.events.findLast(e => e.type === 'armor');
  assert.equal(event.paid, 17); assert.equal(event.absorbed, 17); assert.equal(event.healthLost, 83);
});
for (const id of ['qingling', 'xuejidong']) {
  test(id + ' self-only target rejects ally before cost and applies complete package to self', () => {
    const b = battle(id), u = b.unit('player'), ally = b.unit('ally');
    const skill = u.skills.find(s => s.phantomDance || s.iceArmor);
    b.activeId = u.id; u.progress = 1; u.readyAt = 0;
    assert.deepEqual(b.targetOptions(u, skill.id).map(x => x.id), [u.id]);
    const before = JSON.stringify({ mp: u.mp, uses: u.uses, cooldowns: u.cooldowns, cast: u.cast, progress: u.progress });
    assert.ok(b.command(u.id, skill.id, ally.id));
    assert.equal(JSON.stringify({ mp: u.mp, uses: u.uses, cooldowns: u.cooldowns, cast: u.cast, progress: u.progress }), before);
    assert.equal(b.command(u.id, skill.id, u.id), '');
    assert.equal(u.cast.target, u.id);
    cast(b, u, skill, ally); // Migration/direct-plan protection also keeps the package on self.
    assert.equal(ally.statuses.length, 0); assert.ok(u.statuses.length >= 2);
    if (skill.phantomDance) { assert.equal(u.phantoms, 5); assert.equal(b.value(u, 'phantomPierce'), .1); }
    if (skill.iceArmor) assert.equal(b.value(u, 'iceArmor'), skill.iceArmor);
  });
}
test('ordinary ally support remains legal', () => {
  const b = battle('yixiaobei'), u = b.unit('player'), skill = u.skills[2];
  b.activeId = u.id; u.progress = 1; u.readyAt = 0;
  assert.ok(b.targetOptions(u, skill.id).some(x => x.id === 'ally'));
  assert.equal(b.command(u.id, skill.id, 'ally'), ''); assert.equal(u.cast.target, 'ally');
});
test('restored V13 in-flight transformation retargets whole package to caster', () => {
  const old = battle('qingling', 'qinyan', baseline), u = old.unit('player'), skill = u.skills[4];
  u.cast = { action: skill.id, target: 'ally', skill, end: 1000, start: 0, rage: 0 };
  const b = new box.WitnessBattle.Battle({ snapshot: old.snapshot() });
  assert.equal(b.unit('player').cast.target, 'player');
});
test('zero damage does not consume one-hit layer', () => {
  const b = battle(), t = b.unit('player'); add(b, t, 'once', 30, { oneHit: true });
  b.applyDamage(t, 0, '物理'); assert.equal(t.shieldHP, 30);
});

// Regression comparisons below pin the unapproved V13 rules, not preferred alternatives.
function damageState(b, t) {
  return plain({ hp: t.hp, sh: t.sh, mp: t.mp, petHP: t.petHP, petAlive: t.petAlive,
    bodyHP: t.bodyHP, readyAt: t.readyAt, firstHit: t.firstHit, bloodMarks: t.bloodMarks,
    armor: b.events.filter(e => e.type === 'armor').map(({ paid, absorbed, healthLost, remainingDamage, channel }) =>
      ({ paid, absorbed, healthLost, remainingDamage, channel })) });
}
for (const player of ['xiaowen', 'linluoying', 'yixiaobei']) {
  test('V13 HP/MP and blood mark parity: ' + player, () => {
    const old = battle(player, 'xiaweiyu', baseline), current = battle(player, 'xiaweiyu');
    for (const b of [old, current]) {
      const t = b.unit('player'), source = b.unit('enemy');
      b.setStatus(source, 'damageDown', .4, 10, { source: 'test' });
      b.setStatus(t, 'soulArmor', 1, 10, { source: 'test' });
      for (const [n, ch] of [[100, '物理'], [100, '精神'], [3000, '物理']]) b.applyDamage(t, n, ch, source);
    }
    assert.deepEqual(damageState(current, current.unit('player')), damageState(old, old.unit('player')));
  });
}
test('summon defeat interruption and life auxiliary first-hit healing match V13', () => {
  for (const variant of ['summon', 'life']) {
    const old = battle('xiaowen', 'xiaweiyu', baseline), current = battle('xiaowen', 'xiaweiyu');
    for (const b of [old, current]) {
      const t = b.unit('player'); t.mp = 0;
      if (variant === 'summon') Object.assign(t, { release: '召唤', petAlive: true,
        petHP: 100, petMax: 100, bodyHP: 900, bodyMax: 900, hp: 1000,
        cast: { action: 'attack', target: 'enemy', start: 0, end: 2000 } });
      else { t.style = '辅助'; t.soul.combat_profile.trait = 'life'; }
      b.applyDamage(t, 150, '物理', b.unit('enemy'));
    }
    assert.deepEqual(damageState(current, current.unit('player')), damageState(old, old.unit('player')));
    if (variant === 'summon') {
      assert.equal(current.unit('player').petAlive, false);
      assert.equal(current.unit('player').cast, null);
      assert.equal(current.unit('player').readyAt, 2000);
    } else assert.equal(current.unit('player').firstHit, true);
  }
});
test('source damage reduction and annihilation multiply once before layer traversal', () => {
  const b = battle(), t = b.unit('player'), u = b.unit('enemy'); t.mp = 0;
  u.soul.combat_profile.trait = 'annihilation';
  b.setStatus(u, 'damageDown', .4, 10, { source: 'test' });
  add(b, t, 'life', 10); add(b, t, 'mind', 100, { channel: '精神' });
  const preview = b.previewProtection(t, 100, '物理', u);
  assert.equal(preview.beforeShields, 78); assert.equal(preview.healthDamage, 68);
  b.applyDamage(t, 100, '物理', u);
  assert.equal(t.hp, t.model.derived.HP - 68);
  // A remaining mental shield cannot activate annihilation for life damage.
  assert.equal(b.previewProtection(t, 100, '物理', u).beforeShields, 60);
});
test('zero-mana and fractional-cost soul armour agree with V13 resource accounting', () => {
  const old = battle('xiaowen', 'qinyan', baseline), current = battle();
  for (const b of [old, current]) {
    const t = b.unit('player'); t.mp = 2;
    b.setStatus(t, 'soulArmor', 1, 10, { source: 'test' });
    b.applyDamage(t, 20, '物理'); b.applyDamage(t, 20, '物理');
  }
  assert.deepEqual(damageState(current, current.unit('player')), damageState(old, old.unit('player')));
});
test('V13 phantom swap still consumes on natural miss and periodic attack application', () => {
  for (const api of [baseline, box]) {
    for (const action of ['attack', 'periodic']) {
      const b = battle('qingling', 'anmu', api), t = b.unit('player'), u = b.unit('enemy');
      b.setStatus(t, 'phantomSwapReady', 1, 4, { source: 'test' });
      b.rng.die = () => 100;
      const skill = action === 'periodic' ? u.skills.find(s => s.category === '持续伤害' || s.damageMode === 'periodic') : null;
      const pre = Object.fromEntries(b.units.map(x => [x.id, b.effective(x)]));
      const p = b.plan(u, { action: skill?.id || 'attack', target: t.id, skill, rage: 0 }, pre);
      assert.equal(p.hit.success, false); assert.equal(b.value(t, 'phantomSwapReady'), 0);
      assert.equal(t.dots.length, 0);
    }
  }
});
test('V13 blood-night blindness ignores failed normal resist while first-strike stun has separate roll', () => {
  for (const api of [baseline, box]) {
    const b = battle('xiaweiyu', 'qinyan', api), u = b.unit('player'), t = b.unit('enemy');
    b.rng.die = () => 100;
    const domain = u.skills.find(s => s.bloodDomain);
    cast(b, u, domain, t);
    assert.equal(b.value(t, 'accuracyDown'), .2);
    assert.equal(b.value(u, 'bloodFirstStrike'), 1);
    assert.equal(b.value(t, 'control'), 0);
    const attack = u.skills.find(s => s.category === '攻击');
    const p = cast(b, u, attack, t);
    assert.equal(p.hit.success, true); assert.equal(b.value(u, 'bloodFirstStrike'), 0);
    assert.equal(b.value(t, 'control'), 0);
  }
});
test('V13 ice armour leaves pre-existing DOT base damage unchanged', () => {
  for (const api of [baseline, box]) {
    const b = battle('xuejidong', 'anmu', api), t = b.unit('player'), u = b.unit('enemy');
    b.hit = () => ({ success: true, roll: 1, chance: 100 });
    const dotSkill = u.skills.find(s => s.category === '持续伤害' || s.damageMode === 'periodic');
    cast(b, u, dotSkill, t);
    const before = t.dots[0].baseDamage;
    cast(b, t, t.skills.find(s => s.iceArmor), t);
    assert.equal(t.dots[0].baseDamage, before);
  }
});
test('V13 blood bite mana drain still triggers on hit fully absorbed by shield', () => {
  for (const api of [baseline, box]) {
    const b = battle('xiaweiyu', 'qinyan', api), u = b.unit('player'), t = b.unit('enemy');
    b.hit = () => ({ success: true, roll: 1, chance: 100 });
    if (api === box) add(b, t, 'huge', 100000);
    else Object.assign(t, { shieldHP: 100000, shieldUntil: 8000 });
    const skill = u.skills.find(s => s.manaDrain), hp = t.hp, mp = t.mp;
    cast(b, u, skill, t);
    assert.equal(t.hp, hp); assert.equal(t.mp, mp - Math.round(t.model.derived.baseMP * skill.manaDrain));
    assert.equal(u.manaReturnUses, 1);
  }
});
const projectRoot = path.resolve(__dirname, '../..');
const sourceFiles = ['analysis_src/script_6.js', 'v14_work/src/battle-v14-mechanics.js',
  'v14_work/load.cjs', 'v14_work/tests/mechanics.cjs'].map(file => ({
    path: file,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(projectRoot, file))).digest('hex')
  }));
const result = { suite: 'V14 mechanics', generatedAt: new Date().toISOString(),
  command: 'node v14_work/tests/mechanics.cjs', total: cases.length, passed, failed: 0,
  sourceFiles, cases, examples };
const output = path.join(__dirname, '../test-results/mechanics.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(`Mechanics: ${passed} targeted cases passed. Evidence: ${output}`);
