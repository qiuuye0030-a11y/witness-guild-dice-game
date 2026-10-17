'use strict';

const { test, section } = require('./lib/harness.cjs');
const chengliang = require('../src/npc/traits/chengliang');
const xutaiping = require('../src/npc/traits/xutaiping');
const sailiya = require('../src/npc/traits/sailiya');

module.exports = function npcChecks(ctx) {
  const npc = ctx.modules.npc;

  section('友方NPC战斗适配：单位构建与就绪（交接文档第十八、十九节）');

  test('三位NPC按名录实际等级与面板参战，不跟随玩家等级缩放', () => {
    for (const id of ['chengliang', 'xutaiping', 'sailiya_fengzhi']) {
      const definition = ctx.roster.combatSpec(id);
      const unit = npc.buildUnit({ definition, id: 'ally:' + id, team: 0 });
      ctx.assert.equal(unit.level, 81);
      ctx.assert.equal(unit.level, definition.level);
      ctx.assert.equal(unit.levelScaling, 'fixed');
      ctx.assert.equal(unit.skills.length, 8);
      ctx.assert.equal(unit.model.derived.HP, definition.model.derived.HP);
      for (let i = 0; i < 8; i++) {
        ctx.assert.equal(unit.skills[i].cost, definition.skills[i].cost);
        ctx.assert.equal(unit.skills[i].cast, definition.skills[i].cast);
        ctx.assert.equal(unit.skills[i].cooldown, definition.skills[i].cooldown);
      }
    }
  });

  test('三位NPC的八技与特性适配全部就绪，无未实现操作', () => {
    for (const id of ['chengliang', 'xutaiping', 'sailiya_fengzhi']) {
      const report = npc.assertCombatReady(ctx.roster.combatSpec(id));
      ctx.assert.equal(report.ready, true, id + ' ' + JSON.stringify(report));
      ctx.assert.deepEqual(report.unimplementedOperations, []);
    }
  });

  test('技能操作全部有执行器与所需原语', () => {
    const coverage = npc.coverage();
    ctx.assert.equal(coverage.length, Object.keys(npc.OPS).length);
    ctx.assert.ok(coverage.every((item) => item.implemented && npc.PRIMITIVES.includes(item.primitive)));
  });

  section('程良（据阵/盗气/凝视）');

  test('周天格阵：每有效回合+1层，每3回合先叠后减半', () => {
    let state = chengliang.createState({ maxHP: 5000 });
    for (let i = 0; i < 3; i++) state = chengliang.handle(state, { type: 'turn-start', livingEnemyIds: ['e1'] }).state;
    ctx.assert.equal(state.grid.turns, 3);
    ctx.assert.equal(state.grid.self, 1);
    ctx.assert.equal(state.grid.enemies.e1, 1);
    ctx.assert.equal(chengliang.modifiers(state).damageMultiplier, 1.1);
    ctx.assert.equal(chengliang.modifiers(state).agilityMultipliers.e1, 0.95);
    for (let i = 0; i < 3; i++) state = chengliang.handle(state, { type: 'turn-start', livingEnemyIds: ['e1'] }).state;
    ctx.assert.equal(state.grid.turns, 6);
    ctx.assert.equal(state.grid.self, 2);
  });

  test('被控制时暂停叠层与回合计数，已有层数保留', () => {
    let state = chengliang.createState({ maxHP: 5000 });
    for (let i = 0; i < 2; i++) state = chengliang.handle(state, { type: 'turn-start', livingEnemyIds: ['e1'] }).state;
    const before = JSON.stringify(state.grid);
    const controlled = chengliang.handle(state, { type: 'turn-start', controlled: true, livingEnemyIds: ['e1'] });
    ctx.assert.equal(controlled.state.grid.turns, 2);
    ctx.assert.equal(JSON.stringify({ ...JSON.parse(before), paused: true }), JSON.stringify(controlled.state.grid));
    ctx.assert.equal(controlled.state.grid.paused, true);
  });

  test('六库仙贼：回合末回5%最大生命；对有生命目标吸血30%并每3次永久+1层盗气', () => {
    let state = chengliang.createState({ maxHP: 1000 });
    const endTurn = chengliang.handle(state, { type: 'turn-end', maxHP: 1000, hp: 900 });
    ctx.assert.equal(endTurn.effects[0].amount, 50);
    for (let i = 0; i < 3; i++) {
      const hit = chengliang.handle(state, { type: 'damage-dealt', target: { id: 'e1', lifeType: '生活' }, actualHP: 100 });
      state = hit.state;
      ctx.assert.equal(hit.effects.find((effect) => effect.op === 'heal').amount, 30);
    }
    ctx.assert.equal(state.regen.thiefQi, 1);
    ctx.assert.equal(chengliang.modifiers(state).bodyMultiplier, 1.1);
    const nonLiving = chengliang.handle(state, { type: 'damage-dealt', target: { id: 'e2', lifeType: '元素' }, actualHP: 500 });
    ctx.assert.equal(nonLiving.effects.length, 0);
    ctx.assert.equal(nonLiving.state.regen.thiefQi, 1);
  });

  test('盗气上限10层；满层后不再增长', () => {
    let state = chengliang.createState({ maxHP: 1000, permanentProgress: { thiefQiStacks: 10 } });
    for (let i = 0; i < 6; i++) state = chengliang.handle(state, { type: 'damage-dealt', target: { id: 'e1', lifeType: '生活' }, actualHP: 10 }).state;
    ctx.assert.equal(state.regen.thiefQi, 10);
  });

  test('退场清除阵法；免疫疲劳/衰老/腐坏标签', () => {
    let state = chengliang.createState({ maxHP: 1000 });
    state = chengliang.handle(state, { type: 'turn-start', livingEnemyIds: ['e1'] }).state;
    state = chengliang.handle(state, { type: 'defeat' }).state;
    ctx.assert.equal(state.grid.self, 0);
    ctx.assert.deepEqual(chengliang.modifiers(state).immuneTags, ['fatigue', 'aging', 'decay']);
  });

  test('易中日月：负敏捷差不计、命中下限60%、凝视+8pp、上限97%、致盲后最低5%', () => {
    let state = chengliang.createState({ maxHP: 1000 });
    ctx.assert.equal(chengliang.hit(state, { base: 0.3, agilityDiff: -0.3, targetId: 'e1' }).chance, 0.6);
    state = chengliang.handle(state, { type: 'gaze-select', targetId: 'e1' }).state;
    ctx.assert.equal(chengliang.hit(state, { base: 0.5, targetId: 'e1' }).chance, 0.68);
    ctx.assert.equal(chengliang.hit(state, { base: 0.95, targetId: 'e1' }).chance, 0.97);
    ctx.assert.equal(chengliang.hit(state, { base: 0.9, targetId: 'e1', debuffPenalty: 0.95 }).chance, 0.05);
    const second = chengliang.handle(state, { type: 'gaze-select', targetId: 'e2' });
    ctx.assert.ok(second.effects.some((effect) => effect.op === 'reject'));
  });

  test('凝视对象对程良造成的伤害提高10%', () => {
    let state = chengliang.createState({ maxHP: 1000 });
    state = chengliang.handle(state, { type: 'gaze-select', targetId: 'e1' }).state;
    ctx.assert.equal(chengliang.modifiers(state).gazeIncomingDamageMultiplier, 1.1);
    state = chengliang.handle(state, { type: 'battle-end' }).state;
    ctx.assert.equal(chengliang.modifiers(state).gazeIncomingDamageMultiplier, 1);
  });

  section('徐太平（深暗/灯灭/黑蚀三灯）');

  test('深暗：普通1.5倍；目标已有她一项生效削弱时1.8倍；两档替代不叠乘', () => {
    let state = xutaiping.createState();
    ctx.assert.equal(xutaiping.amplify(state, { targetId: 'e1', field: 'agilityDown', baseValue: 0.2 }).value, 0.3);
    state = xutaiping.recordDebuff(state, { targetId: 'e1', debuffId: 'd1', field: 'defDown', value: 0.15, appliedAt: 1 }).state;
    const covered = xutaiping.amplify(state, { targetId: 'e1', field: 'agilityDown', baseValue: 0.2, snapshotAt: 2 });
    ctx.assert.equal(covered.value, 0.36);
    ctx.assert.equal(covered.multiplier, 1.8);
    ctx.assert.equal(xutaiping.amplify(state, { targetId: 'e1', field: 'agilityDown', baseValue: 0.2, snapshotAt: 1 }).multiplier, 1.5);
  });

  test('深暗受字段原上限约束（gaugeLoss 0.9），且不适用于控制时长', () => {
    const state = xutaiping.createState();
    ctx.assert.equal(xutaiping.amplify(state, { targetId: 'e1', field: 'gaugeLoss', baseValue: 0.8 }).value, 0.9);
    ctx.assert.throws(() => xutaiping.amplify(state, { targetId: 'e1', field: 'controlDuration', baseValue: 1 }), /深暗不适用/);
  });

  test('灯灭：三次半量后三层封锁并清层，每回合每目标只压制一次', () => {
    let state = xutaiping.createState();
    const apply = (value) => {
      const result = xutaiping.applyBenefit(state, { targetId: 'e1', value, actualBenefit: value });
      state = result.state;
      return result.outcome;
    };
    ctx.assert.equal(apply(100).value, 50);
    ctx.assert.equal(apply(100).counted, false); // 同回合第二次不压制
    state = xutaiping.beginTurn(state);
    ctx.assert.equal(apply(100).value, 50);
    state = xutaiping.beginTurn(state);
    ctx.assert.equal(apply(100).value, 50);
    state = xutaiping.beginTurn(state);
    const blocked = apply(100);
    ctx.assert.equal(blocked.blocked, true);
    ctx.assert.equal(blocked.value, 0);
    ctx.assert.equal(state.lampOut.stacks.e1, 0);
    state = xutaiping.beginTurn(state);
    ctx.assert.equal(apply(100).value, 50);
  });

  test('黑蚀三灯：每2秒熄一盏，6秒俱灭后敏捷−30%、伤害−22.5%', () => {
    let state = xutaiping.createState();
    state = xutaiping.applyLamps(state, { targetId: 'e1', at: 0 }).state;
    let effects = [];
    for (let i = 0; i < 3; i++) {
      const result = xutaiping.tickLamps(state, { dt: 2, controlled: false, at: 2 * (i + 1) });
      state = result.state;
      effects = result.effects;
    }
    const statuses = effects.filter((effect) => effect.op === 'addStatus');
    ctx.assert.deepEqual(statuses.map((effect) => effect.type), ['agilityDown', 'damageDown']);
    ctx.assert.equal(statuses[0].value, 0.3);
    ctx.assert.equal(statuses[1].value, 0.225);
    ctx.assert.equal(state.blackErosion.groups.e1.resolved, true);
  });

  test('黑蚀灌注受控暂停；12秒未完成则散去', () => {
    let state = xutaiping.createState();
    state = xutaiping.applyLamps(state, { targetId: 'e1', at: 0 }).state;
    for (let i = 0; i < 5; i++) state = xutaiping.tickLamps(state, { dt: 2, controlled: true }).state;
    ctx.assert.equal(state.blackErosion.groups.e1.lamps, 3);
    ctx.assert.equal(state.blackErosion.groups.e1.age, 10);
    const timedOut = xutaiping.tickLamps(state, { dt: 2, controlled: true });
    ctx.assert.equal(timedOut.state.blackErosion.groups.e1.dissipated, true);
    ctx.assert.equal(timedOut.effects.filter((effect) => effect.op === 'addStatus').length, 0);
  });

  test('同一目标只保留一组三灯，重复施放不叠组', () => {
    let state = xutaiping.createState();
    state = xutaiping.applyLamps(state, { targetId: 'e1' }).state;
    const again = xutaiping.applyLamps(state, { targetId: 'e1' });
    ctx.assert.ok(again.effects.some((effect) => /不叠组/.test(effect.text)));
    ctx.assert.equal(again.state.blackErosion.groups.e1.lamps, 3);
  });

  test('黑蚀三灯与灯灭各自记账，灯灭层数不升级深暗', () => {
    let state = xutaiping.createState();
    state = xutaiping.applyBenefit(state, { targetId: 'e1', value: 100, actualBenefit: 100 }).state;
    ctx.assert.equal(state.lampOut.stacks.e1, 1);
    ctx.assert.equal(xutaiping.amplify(state, { targetId: 'e1', field: 'agilityDown', baseValue: 0.2 }).multiplier, 1.5);
    ctx.assert.equal(state.blackErosion.groups.e1, undefined);
  });

  test('三灯结算与灯灭层数分别存在，互不覆盖', () => {
    let state = xutaiping.createState();
    state = xutaiping.applyBenefit(state, { targetId: 'e1', value: 100, actualBenefit: 100 }).state;
    state = xutaiping.applyLamps(state, { targetId: 'e1' }).state;
    for (let i = 0; i < 3; i++) state = xutaiping.tickLamps(state, { dt: 2, controlled: false }).state;
    ctx.assert.equal(state.lampOut.stacks.e1, 1);
    ctx.assert.equal(state.blackErosion.groups.e1.resolved, true);
    ctx.assert.equal(state.blackErosion.groups.e1.lamps, 0);
  });

  section('赛利亚（符剑/秘元/感知）');

  test('符剑附加费为实际主攻击费用的50%，向上取整；0费攻击不凭空收费', () => {
    ctx.assert.equal(sailiya.runeExtraCost(100), 50);
    ctx.assert.equal(sailiya.runeExtraCost(1), 1);
    ctx.assert.equal(sailiya.runeExtraCost(0), 0);
    const state = sailiya.createState();
    const ok = sailiya.activateRune(state, { castId: 'c1', paidMainCost: 100, mpAvailable: 60 });
    ctx.assert.equal(ok.activated, true);
    ctx.assert.equal(ok.extraCost, 50);
    const poor = sailiya.activateRune(state, { castId: 'c2', paidMainCost: 100, mpAvailable: 10 });
    ctx.assert.equal(poor.activated, false);
  });

  test('附伤基数为主攻击有效伤害30%（削盾段不计）', () => {
    ctx.assert.equal(sailiya.runeAddOn(200), 60);
    ctx.assert.equal(sailiya.runeAddOn(0), 0);
  });

  test('抵挡倍耗只作用于命中当时实际支付的防御魂力，免费盾不追溯', () => {
    ctx.assert.equal(sailiya.defenseCostOnHit(90, true), 180);
    ctx.assert.equal(sailiya.defenseCostOnHit(90, false), 90);
    ctx.assert.equal(sailiya.defenseCostOnHit(0, true), 0);
  });

  test('秘元归宿体：上限×1.5且只生效一次；回合末5%+凝元20%分开发事件', () => {
    let state = sailiya.createState();
    ctx.assert.equal(sailiya.effectiveMaxMP(5092), 7638);
    const damaged = sailiya.recordDamage(state, { realHP: 100, realSH: 0 });
    state = damaged.state;
    ctx.assert.equal(damaged.pending, 20);
    const end = sailiya.endTurn(state, { maxMP: 7638 });
    ctx.assert.equal(end.baseRecovery, 382);
    ctx.assert.equal(end.pending, 20);
    ctx.assert.equal(end.effects.length, 2);
    ctx.assert.deepEqual(end.effects.map((effect) => effect.eventId), ['secret-origin:5%', 'secret-origin:pending']);
  });

  test('封锁标签清空待凝量；致死不回魂；护盾损失与生命费用不计', () => {
    let state = sailiya.createState();
    state = sailiya.recordDamage(state, { realHP: 100 }).state;
    const sealed = sailiya.recordDamage(state, { realHP: 50, tags: ['resource_seal'] });
    ctx.assert.equal(sealed.pending, 0);
    ctx.assert.equal(sealed.sealed, true);
    const lethal = sailiya.endTurn(sealed.state, { maxMP: 1000, lethal: true });
    ctx.assert.equal(lethal.effects.length, 0);
    const ignore = sailiya.recordDamage(sailiya.createState(), { shieldLoss: 500, hpCost: 100, selfDamage: 50, overkill: 999 });
    ctx.assert.equal(ignore.pending, 0);
  });

  test('化羽华：三枚充能、每次主攻击消耗一枚、非主攻击不消耗、重施补满不叠层', () => {
    let state = sailiya.refillCharge(sailiya.createState());
    ctx.assert.equal(state.charge.charges, 3);
    const first = sailiya.consumeCharge(state, true);
    ctx.assert.equal(first.consumed, true);
    ctx.assert.equal(first.multiplier, 1.15);
    ctx.assert.equal(first.state.charge.charges, 2);
    const nonMain = sailiya.consumeCharge(first.state, false);
    ctx.assert.equal(nonMain.consumed, false);
    ctx.assert.equal(nonMain.state.charge.charges, 2);
    ctx.assert.equal(sailiya.refillCharge(nonMain.state).charge.charges, 3);
  });

  test('感知：不受隐匿与高速惩罚，可锁隐形/虚化，仍受正常命中判定', () => {
    const state = sailiya.createState();
    const normal = sailiya.hit(state, { base: 0.8, agilityDiff: -0.3, concealmentPenalty: 0.2, targetId: 'e1' });
    ctx.assert.equal(normal.chance, 0.8);
    const hidden = sailiya.hit(state, { base: 0.8, targetHidden: true });
    ctx.assert.equal(hidden.chance, 0.8);
  });

  test('永久盗气只在构建时给一次肉体强度倍率，不重复加算、不用于评级', () => {
    const definition = ctx.roster.combatSpec('chengliang');
    const base = npc.buildUnit({ definition, id: 'a', team: 0 });
    ctx.assert.equal(base.bodyMultiplier, 1);
    const stacked = npc.buildUnit({ definition, id: 'b', team: 0, permanentProgress: { thiefQiStacks: 10 } });
    ctx.assert.equal(stacked.bodyMultiplier, 2);
    ctx.assert.equal(stacked.bodyMultiplierApplied, false);
    ctx.assert.equal(stacked.model.stats.B, definition.stats.B, '不把倍率写回模型，避免每次参战重复加算');
  });

  section('NPC技能执行器（operations → 宿主原语）');

  test('程良「解」按顺序调用命中判定、削盾、能量直击', () => {
    const definition = ctx.roster.combatSpec('chengliang');
    const unit = npc.buildUnit({ definition, id: 'ally:chengliang', team: 0 });
    const calls = [];
    const host = new Proxy({}, { get: () => (payload) => { calls.push(payload); return { ok: true }; } });
    const result = npc.runSkill({ unit, skill: unit.skills[7], host, targetId: 'beast', castStartedAt: 0, at: 0 });
    ctx.assert.deepEqual(result.calls.map((call) => call.primitive), ['hitContestOnce', 'reduceOuterShield', 'directAttack']);
    ctx.assert.equal(calls[1].coefficient, 0.5);
    ctx.assert.equal(calls[2].factor, 0.9);
    ctx.assert.equal(calls[2].reuseHit, true);
  });

  test('宿主缺少原语时显式报错，不静默跳过', () => {
    const definition = ctx.roster.combatSpec('chengliang');
    const unit = npc.buildUnit({ definition, id: 'ally:chengliang', team: 0 });
    ctx.assert.throws(() => npc.runSkill({ unit, skill: unit.skills[7], host: {}, targetId: 'beast' }), /宿主缺少战斗原语/);
  });

  test('正式讨伐前可整体检查宿主原语并列出缺失项', () => {
    const definition = ctx.roster.combatSpec('chengliang');
    const empty = npc.assertHostReady({}, definition);
    ctx.assert.equal(empty.ready, false);
    ctx.assert.ok(empty.missing.some((item) => item.includes('directAttack')));
    const full = new Proxy({}, { get: () => () => ({}) });
    ctx.assert.deepEqual(npc.assertHostReady(full, definition), { ready: true, missing: [] });
  });

  test('徐太平数值削弱在执行时走深暗增幅', () => {
    const definition = ctx.roster.combatSpec('xutaiping');
    const unit = npc.buildUnit({ definition, id: 'ally:xutaiping', team: 0 });
    let traitState = xutaiping.createState();
    traitState = xutaiping.recordDebuff(traitState, { targetId: 'beast', debuffId: 'd1', field: 'defDown', value: 0.15, appliedAt: 0 }).state;
    const calls = [];
    const host = new Proxy({}, { get: () => (payload) => { calls.push(payload); return {}; } });
    npc.runSkill({ unit, skill: unit.skills[1], host, targetId: 'beast', castStartedAt: 1, at: 1, traitState });
    const debuff = calls.find((payload) => payload.values);
    ctx.assert.equal(debuff.values.defDown, 0.27);
    ctx.assert.equal(debuff.multipliers.defDown, 1.8);
  });

  test('三位NPC特性运行时都能分发基础事件', () => {
    for (const id of ['chengliang', 'xutaiping', 'sailiya_fengzhi']) {
      const runtime = npc.createTraitRuntime(ctx.roster.combatSpec(id));
      const result = runtime.dispatch({ type: 'turn-start', livingEnemyIds: ['beast'], maxHP: 1000, hp: 900 });
      ctx.assert.ok(result && result.state);
    }
    const xu = npc.createTraitRuntime(ctx.roster.combatSpec('xutaiping'));
    const benefit = xu.dispatch({ type: 'benefit', targetId: 'beast', value: 100, actualBenefit: 100 });
    ctx.assert.equal(benefit.outcome.value, 50);
    xu.dispatch({ type: 'debuff-applied', targetId: 'beast', debuffId: 'd1', field: 'defDown', value: 0.15, appliedAt: 1 });
    const amplified = xutaiping.amplify(xu.state, { targetId: 'beast', field: 'agilityDown', baseValue: 0.2, snapshotAt: 2 });
    ctx.assert.equal(amplified.multiplier, 1.8);
    const sail = npc.createTraitRuntime(ctx.roster.combatSpec('sailiya_fengzhi'));
    const cast = sail.dispatch({ type: 'attack-cast', castId: 'c1', paidMainCost: 200, mpAvailable: 100 });
    ctx.assert.equal(cast.activated, true);
    ctx.assert.equal(cast.extraCost, 100);
    const hit = sail.dispatch({ type: 'attack-hit', mainEffectiveDamage: 100, actualPaidDefenseCost: 90 });
    ctx.assert.equal(hit.addOn, 30);
    ctx.assert.equal(hit.defenseCost, 180);
  });
};
