'use strict';

// 独立审查补充：真实故障路径、JSON读档、失败后续结，而非只检查接口存在。
const { test, section } = require('./lib/harness.cjs');
const F = require('./lib/fixtures.cjs');
const { clone } = require('../src/util');
const { RollLog } = require('../src/rng');
const A = require('../src/soulbone/absorption');
const I = require('../src/soulbone/instance');
const R = require('../src/reward/ring');
const IN = require('../src/reward/inheritance');
const S = require('../src/npc/traits/sailiya');
const X = require('../src/npc/traits/xutaiping');
const { createTraitPool } = require('../src/soulbone/trait-pool');
const { createHandlerRegistry } = require('../src/soulbone/handlers');
const { settleTenThousandBone } = require('../src/soulbone/ten-thousand');
const { createHuntController } = require('../src/hunt/controller');
const { createBeastLibrary } = require('../src/beast/library');

function bone(id = 'reg-bone', slot = '躯干') {
  return I.createBoneInstance({ boneId: id, definitionId: 'reg-definition', source: { type: 'event-gift' }, base: { years: 1000, slot }, traits: [], attributes: { stats: { B: 10 }, budgetVersion: 1 } });
}

module.exports = function regressions(ctx) {
  const assert = ctx.assert;
  section('独立审查回归：魂骨实物、来源账本与存档');

  test('从背包自动吸收后，实物只在装备槽中保留一份', () => {
    const item = bone();
    const character = F.characterFixture({ inventory: [clone(item)] });
    const ledger = A.createEquipmentLedger();
    A.absorbBone({ character, bone: item, ledger });
    assert.equal(character.inventory.length, 0);
    assert.equal(character.bones.length, 1);
    assert.deepEqual(A.effectiveModifiers(ledger).attributes, { B: 10 });
  });

  test('被换下的骨不再标记已吸收，旧版ID也能准确返回冲突信息', () => {
    const character = F.characterFixture({ bones: [{ id: 'legacy', slot: '躯干', years: 1000, absorbed: true }] });
    const ledger = A.createEquipmentLedger();
    const conflict = A.absorbBone({ character, bone: bone(), ledger });
    assert.equal(conflict.conflict.existingBoneId, 'legacy');
    A.confirmReplacement({ session: conflict.session, choice: 'replace-existing', character, ledger });
    assert.equal(character.inventory[0].absorbed, false);
  });

  test('失效换骨会话在修改实物和属性之前被拒绝', () => {
    const character = F.characterFixture();
    const ledger = A.createEquipmentLedger();
    A.absorbBone({ character, bone: bone('old'), ledger });
    const conflict = A.absorbBone({ character, bone: bone('new'), ledger });
    character.inventory[0].base.slot = '头部';
    const before = clone({ character, ledger });
    assert.throws(() => A.confirmReplacement({ session: conflict.session, choice: 'replace-existing', character, ledger }), /部位/);
    assert.deepEqual(clone({ character, ledger }), before);
  });

  test('损坏账本、实例版本和无处理器特性不能经导入混入运行时', () => {
    assert.throws(() => A.validateLedger({ version: 1, attributes: {}, runtimeTraits: {} }), /缺少/);
    const payload = I.exportBone(bone());
    payload.bone.rulesVersion = 999;
    assert.throws(() => I.importBone(payload), /版本/);
    payload.bone.rulesVersion = 1;
    payload.bone.traits = [{ traitId: 'broken', sourceBoneId: payload.bone.boneId }];
    assert.throws(() => I.importBone(payload), /处理器/);
  });

  test('魂骨保存结构、依赖与叠加上限经过构造和导出导入不丢失', () => {
    const item = I.createBoneInstance({ boneId: 'typed', definitionId: 'd', source: { type: 'event-gift' }, base: { years: 10000, slot: '头部' }, traits: [{ traitId: 'x', handler: 'x', save: { schemaVersion: 2, fields: ['charges'] }, dependsOn: ['shield'], maxStacks: 3 }] });
    const restored = I.importBone(I.exportBone(item));
    assert.deepEqual(restored.traits[0].save, { schemaVersion: 2, fields: ['charges'] });
    assert.deepEqual(restored.traits[0].dependsOn, ['shield']);
    assert.equal(restored.traits[0].maxStacks, 3);
  });

  test('同一万年成果重开与JSON读档后不再抽部位或特性', () => {
    const registry = createHandlerRegistry({ 'fixture-handler-a': () => {}, 'fixture-handler-b': () => {} });
    const pool = createTraitPool({ data: F.traitPoolData(), registry });
    const input = { boneId: 'persist-bone', acquisitionId: 'persist-acq', years: 20000, slot: '头部', pool, rng: new RollLog('first') };
    const store = {};
    const first = settleTenThousandBone(store, input);
    const rng = new RollLog('changed-seed');
    const again = settleTenThousandBone(clone(store), { ...input, rng });
    assert.equal(again.duplicate, true);
    assert.deepEqual(again.bone, first.bone);
    assert.equal(rng.entries.length, 0);
  });
  test('空池成果以后可补齐，重复补齐不重抽；已装备来源同步一次', () => {
    const registry = createHandlerRegistry({ 'fixture-handler-a': () => {}, 'fixture-handler-b': () => {} });
    const empty = createTraitPool({ data: F.traitPoolData({ traits: [] }), registry });
    const pool = createTraitPool({ data: F.traitPoolData(), registry });
    const store = {};
    const input = { acquisitionId: 'later', boneId: 'later-bone', years: 20000, slot: '头部', pool: empty, rng: new RollLog('empty') };
    const first = settleTenThousandBone(store, input);
    const character = F.characterFixture();
    const ledger = A.createEquipmentLedger();
    A.absorbBone({ character, bone: first.bone, ledger });
    const { completePendingTenThousandBone } = require('../src/soulbone/ten-thousand');
    const completion = { ...input, pool, rng: new RollLog('completion'), budget: I.createAttributeBudget({ version: 1, values: { 10000: { B: 20 } } }) };
    const filled = completePendingTenThousandBone(store, completion).bone;
    A.refreshAbsorbedBone({ character, bone: filled, ledger });
    A.refreshAbsorbedBone({ character, bone: filled, ledger });
    assert.deepEqual(A.effectiveModifiers(ledger).attributes, { B: 20 });
    assert.equal(Object.keys(ledger.runtimeTraits).length, 1);
    const rng = new RollLog('no-reroll');
    const again = completePendingTenThousandBone(clone(store), { ...completion, rng }).bone;
    assert.deepEqual(again, filled);
    assert.equal(rng.entries.length, 0);
  });
  test('允许的百万级权重可以正常投骰，不超过宿主单骰面数', () => {
    const registry = createHandlerRegistry({ 'fixture-handler-a': () => {}, 'fixture-handler-b': () => {} });
    const data = F.traitPoolData();
    for (const trait of data.traits) trait.weight = 1000000;
    const pool = createTraitPool({ data, registry });
    const rng = new RollLog('large-weights');
    assert.equal(pool.assemble({ boneId: 'weighted', years: 20000, slot: '头部', rng }).status, 'assembled');
    assert.equal(rng.entries.every((entry) => entry.sides <= 100000), true);
  });
  test('漏传抽池排除表也不能叠加超过限制的特性，失败不污染原装备', () => {
    const make = (id, slot) => I.createBoneInstance({ boneId: id, definitionId: 'd', source: { type: 'event-gift' }, base: { years: 10000, slot }, traits: [{ traitId: 'unique', handler: 'handler', maxStacks: 1 }] });
    const character = F.characterFixture();
    const ledger = A.createEquipmentLedger();
    A.absorbBone({ character, bone: make('a', '头部'), ledger });
    const before = clone({ character, ledger });
    assert.throws(() => A.absorbBone({ character, bone: make('b', '躯干'), ledger }), /叠加组/);
    assert.deepEqual(clone({ character, ledger }), before);
  });
  test('按真实旧版trait: ID与state.soulTrait迁移，成长和角色被动保留', () => {
    const save = { state: { soulTrait: { version: 2, soulId: 'T01-01', definitionId: 'trait:T01-01', state: { stacks: 2 } }, character: F.characterFixture() }, battle: { units: [{ passive: { definitionId: 'trait:T01-01' }, passiveState: {} }, { passive: { source: 'role', name: '祥光' } }] } };
    const migrate = ctx.modules.soulbone.migrate;
    const result = migrate.migrateSave(save);
    assert.equal(result.save.state.soulTrait, undefined);
    assert.equal(result.save.battle.units[0].passive, undefined);
    assert.equal(result.save.battle.units[1].passive.name, '祥光');
    assert.deepEqual(result.save.state.character, save.state.character);
    const battle = migrate.migrateBattleSnapshot(save.battle);
    assert.equal(battle.snapshot.units[0].passive, null);
  });

  section('独立审查回归：讨伐队伍、战报与九环');
  const ratingFn = () => ({ label: '凶级', score: 1.65, thresholds: { version: 2 } });
  function accepted(rank = 8) {
    const library = createBeastLibrary({ data: { schemaVersion: 1, libraryVersion: 1, beasts: [F.beastFixture()] } });
    const controller = createHuntController({ roster: ctx.roster, ratingFn, library });
    const shown = controller.consider({ level: 80, model: { level: 80, stats: {} }, flow: { phase: 'growth' }, safeNode: 'growth-settled' });
    const rng = new RollLog('reg-party');
    const chosen = controller.choose({ ledger: shown.ledger, option: '接受', originRank: rank, rng });
    const playerUnit = { id: 'player', name: '玩家', level: 80, team: 0 };
    const allyUnits = chosen.allies.npcIds.map((npcId) => ctx.modules.npc.buildUnit({ definition: ctx.roster.combatSpec(npcId), id: 'ally:' + npcId, team: 0 }));
    return { controller, chosen, rng, playerUnit, allyUnits };
  }
  test('抽中的援军必须真实参战，不能只在到场文字中出现', () => {
    const a = accepted();
    assert.throws(() => a.controller.forward({ ledger: a.chosen.ledger, seed: 's', rng: a.rng, playerUnit: a.playerUnit, allyUnits: [] }), /援军名单/);
  });
  test('读档不能改变已经冻结的战斗种子', () => {
    const a = accepted();
    const first = a.controller.forward({ ...a, ledger: a.chosen.ledger, seed: 'original' });
    const again = a.controller.forward({ ...a, ledger: clone(first.ledger), seed: 'reroll' });
    assert.equal(again.battlePlan.seed, first.battlePlan.seed);
  });
  test('失败与超时也生成可导出的讨伐战报', () => {
    const a = accepted();
    const forward = a.controller.forward({ ...a, ledger: a.chosen.ledger, seed: 's' });
    for (const outcome of ['timeout', 'loss', 'escape', 'surrender', 'draw']) {
      const ledger = a.controller.startBattle(forward.ledger, 'session:' + outcome);
      const result = a.controller.resolve({ ledger, outcome, enemy: { defeated: false }, survivors: ['player'], plan: forward.battlePlan });
      assert.equal(result.judge.loot, false);
      assert.equal(ctx.modules.hunt.battle.exportHuntReport(result.report).report.type, 'hunt');
    }
  });
  test('未参战者不能冒充存活援军触发胜利', () => {
    const a = accepted();
    const forward = a.controller.forward({ ...a, ledger: a.chosen.ledger, seed: 's' });
    const ledger = a.controller.startBattle(forward.ledger, 'session-forged');
    assert.throws(() => a.controller.resolve({ ledger, outcome: 'victory', enemy: { defeated: true }, survivors: ['outsider'], plan: forward.battlePlan }), /不属于/);
  });
  test('必有援军的家境不能读入人数为零的存档', () => {
    for (const rank of [8, 9, 10]) {
      assert.throws(() => ctx.modules.hunt.allies.validateAllies({ rulesVersion: 1, originRank: rank, count: 0, npcIds: [] }, ctx.roster), /必定/);
    }
  });
  function ring(character) {
    return R.createHundredThousandRing({ character, seed: 'r', rng: new RollLog('r'), makeSkill: F.makeSkillStub, transactionId: 'ring-tx' });
  }
  test('90级吸收清除预留记录，异常已有九环时不再塞入第二个九环', () => {
    const character = F.characterFixture({ level: 90 });
    const item = ring(character);
    character.preStoredNinthRing = clone(item);
    R.handleNinthRing({ character, ring: item, level: 90, makeSkill: F.makeSkillStub });
    assert.equal(character.preStoredNinthRing, undefined);
    const broken = F.characterFixture({ level: 90, rings: [...character.rings.filter((r) => r.index !== 1)] });
    assert.equal(R.handleNinthRing({ character: broken, ring: item, level: 90 }).action, 'already-nine');
    assert.equal(broken.rings.filter((r) => r.index === 9).length, 1);
  });
  test('普通万年第九环仍合法，不因新事件校验被拒绝', () => {
    const character = F.characterFixture();
    character.rings.push({ index: 9, years: 99999, skills: [{}] });
    assert.equal(R.assertNinthRingConsistency(character).consistent, true);
  });
  test('继承统计计算真实持有概率，拒绝非法或重复的继承结果', () => {
    assert.equal(IN.theoreticalDistribution(2).perTrait, 0.625);
    const traits = F.beastFixture().traits;
    assert.throws(() => IN.validateInheritance({ version: 1, frozen: true, mode: 'all', selectedTraitIds: [traits[0].id, traits[0].id] }, traits), /重复/);
    assert.throws(() => IN.validateInheritance({ version: 1, frozen: true, mode: 'unknown', selectedTraitIds: [traits[0].id] }, traits), /模式/);
  });

  section('独立审查回归：NPC战斗状态');
  test('赛利亚封锁持续本周期，普通受伤不解除；下周期可以重新凝元', () => {
    let state = S.recordDamage(S.createState(), { tags: ['resource_seal'] }).state;
    state = S.recordDamage(state, { realHP: 100 }).state;
    const end = S.endTurn(state, { maxMP: 1000 });
    assert.equal(end.pending, 0);
    assert.equal(S.recordDamage(end.state, { realHP: 100 }).pending, 20);
  });
  test('赛利亚退场事件会阻止后续回魂', () => {
    const runtime = ctx.modules.npc.createTraitRuntime(ctx.roster.combatSpec('sailiya_fengzhi'));
    runtime.dispatch({ type: 'damage-taken', realHP: 100 });
    runtime.dispatch({ type: 'defeat' });
    assert.deepEqual(runtime.dispatch({ type: 'turn-end', maxMP: 1000 }).effects, []);
  });
  test('同一施放重复通知不重复付符剑费用，可显式关闭符剑', () => {
    const first = S.activateRune(S.createState(), { castId: 'one', paidMainCost: 100, mpAvailable: 100 });
    const again = S.activateRune(first.state, { castId: 'one', paidMainCost: 100, mpAvailable: 50 });
    assert.equal(first.extraCost, 50);
    assert.equal(again.extraCost, 0);
    assert.equal(again.duplicate, true);
    assert.equal(S.activateRune(again.state, { castId: 'two', paidMainCost: 100, mpAvailable: 100, enabled: false }).activated, false);
  });
  test('灯灭按实际可恢复量减半，三层后同组所有收益均封锁', () => {
    const capped = X.applyBenefit(X.createState(), { targetId: 'e', kind: 'heal', value: 100, actualBenefit: 10 });
    assert.equal(capped.outcome.value, 5);
    let state = X.createState();
    state.lampOut.stacks.e = 3;
    const first = X.applyBenefit(state, { targetId: 'e', groupId: 'cast', value: 100 });
    const second = X.applyBenefit(first.state, { targetId: 'e', groupId: 'cast', value: 1, durationOnly: true });
    assert.equal(second.outcome.value, 0);
    assert.equal(second.state.lampOut.stacks.e, 0);
  });
  test('灯灭同组治疗与护盾均减半，层数只计一次', () => {
    let state = X.createState();
    const first = X.applyBenefit(state, { targetId: 'e', groupId: 'cast-1', kind: 'heal', value: 100 });
    const second = X.applyBenefit(first.state, { targetId: 'e', groupId: 'cast-1', kind: 'shield', value: 80 });
    assert.equal(first.outcome.value, 50);
    assert.equal(second.outcome.value, 40);
    assert.equal(second.state.lampOut.stacks.e, 1);
    assert.equal(X.applyBenefit(second.state, { targetId: 'e', groupId: 'cast-2', kind: 'heal', value: 100 }).outcome.value, 100);
  });
  test('徐太平退场清除灯灭，后续不再压制；复活与净化不积层', () => {
    const state = X.applyBenefit(X.createState(), { targetId: 'e', value: 100 }).state;
    const defeated = X.onOwnerDefeat(state);
    assert.equal(Object.keys(defeated.lampOut.stacks).length, 0);
    assert.equal(X.applyBenefit(defeated, { targetId: 'e', value: 100 }).outcome.value, 100);
    assert.equal(X.applyBenefit(X.createState(), { targetId: 'e', kind: 'revive', value: 100 }).outcome.counted, false);
  });
  test('黑蚀采用不同时间步长仍得相同完成结果', () => {
    const initial = X.applyLamps(X.createState(), { targetId: 'e' }).state;
    const coarse = X.tickLamps(initial, { dt: 12, controlled: false, at: 12 });
    let fine = initial;
    for (let at = 2; at <= 12; at += 2) fine = X.tickLamps(fine, { dt: 2, controlled: false, at }).state;
    assert.equal(coarse.state.blackErosion.groups.e.resolved, fine.blackErosion.groups.e.resolved);
    assert.equal(coarse.state.blackErosion.groups.e.dissipated, false);
    assert.equal(coarse.effects.filter((e) => e.op === 'addStatus').length, 2);
  });
  test('NPC技能缺后续处理器时，不先执行前半招', () => {
    let attacks = 0;
    assert.throws(() => ctx.modules.npc.runSkill({ unit: { npcId: 'chengliang' }, skill: { name: 'test', npcOperations: [{ type: 'direct_attack' }, { type: 'shield' }] }, host: { directAttack: () => attacks++ } }), /宿主缺少/);
    assert.equal(attacks, 0);
  });
  test('未实现新NPC不能伪报适配就绪；没有技能定义不能伪报宿主就绪', () => {
    const definition = clone(ctx.roster.combatSpec('chengliang'));
    definition.id = 'future-npc';
    assert.equal(ctx.modules.npc.assertCombatReady(definition).ready, false);
    assert.equal(ctx.modules.npc.assertHostReady({}, null).ready, false);
  });
  test('组合入口真正使用注入的规则，并区分适配存在与主游戏接入状态', () => {
    const { createModules } = require('../src/splice/compose');
    const rules = { calculationVersion: 123, ratingRulesVersion: 9, rating: () => ({ label: '强级', score: 1.5, thresholds: { version: 9 } }) };
    const modules = createModules({ rules });
    assert.equal(modules.status().baseline.rulesVersion, 123);
    assert.equal(modules.bridge.rating({}).label, '强级');
    assert.equal(modules.status().npcCombat.hostIntegrated, false);
    const condition = modules.hunt.controller.evaluate({ level: 80, model: { level: 80, stats: {} } });
    assert.equal(condition.eligible, true);
  });

  section('独立审查回归：首胜奖励断点与冻结');
  function setup() {
    const store = {};
    const runner = ctx.modules.reward.createRunner(store);
    const input = { firstWin: true, sessionId: 'reg-session', transactionId: 'reg-tx', beastSnapshot: F.beastFixture(), character: F.characterFixture(), equipmentLedger: A.createEquipmentLedger(), level: 80, rng: new RollLog('reg-reward'), seed: 'reg-reward', makeSkill: F.makeSkillStub };
    return { store, runner, input };
  }
  test('未明确首胜、缺场次ID和非法魂兽来源不能发奖', () => {
    const { runner, input } = setup();
    assert.throws(() => runner.run({ ...input, firstWin: undefined }), /首胜/);
    assert.throws(() => runner.run({ ...input, sessionId: null }), /场次/);
    assert.throws(() => runner.run({ ...input, beastSnapshot: F.beastFixture({ years: 99999 }) }), /100000/);
  });
  test('奖励报告写入实际继承模式、骰果和特性列表', () => {
    const { runner, input } = setup();
    const result = runner.run(input);
    assert.deepEqual(result.result.report.inheritance, result.result.inheritance);
    assert.equal(result.result.report.inheritance.selectedTraitIds.length >= 1, true);
  });
  test('十万年骨能采用已定版预算，不永久锁死为null', () => {
    const { runner, input } = setup();
    const result = runner.run({ ...input, budget: I.createAttributeBudget({ version: 1, values: { 100000: { B: 100 } } }) });
    assert.deepEqual(result.result.bone.attributes.stats, { B: 100 });
    assert.deepEqual(A.effectiveModifiers(result.equipmentLedger).attributes, { B: 100 });
  });
  test('装备账本先保存、角色未保存时补回魂骨实物', () => {
    const { runner, input } = setup();
    const result = runner.run(input);
    const resumed = runner.run({ ...input, equipmentLedger: clone(result.equipmentLedger) });
    assert.equal(resumed.character.bones.length, 1);
    assert.equal(Object.keys(resumed.equipmentLedger.runtimeTraits).length, result.result.bone.traits.length);
  });
  test('角色先保存、装备账本未保存时补回来源与特性', () => {
    const { runner, input } = setup();
    const result = runner.run(input);
    const resumed = runner.run({ ...input, character: clone(result.character), equipmentLedger: A.createEquipmentLedger() });
    assert.equal(resumed.character.bones.length, 1);
    assert.equal(Object.keys(resumed.equipmentLedger.runtimeTraits).length, result.result.bone.traits.length);
  });
  test('战斗记录能与奖励凭据一起保留，重放奖励不复活已吸收的预留环', () => {
    const { runner, input } = setup();
    const first = runner.run({ ...input, battleReport: { type: 'hunt', triggers: ['实战日志'] } });
    assert.deepEqual(first.result.report.triggers, ['实战日志']);
    const character = first.character;
    character.level = 90;
    R.handleNinthRing({ character, ring: character.preStoredNinthRing, level: 90, makeSkill: F.makeSkillStub });
    const again = runner.run({ ...input, character, level: 90, equipmentLedger: first.equipmentLedger });
    assert.equal(again.character.preStoredNinthRing, undefined);
    assert.equal(again.character.rings.length, 9);
  });
  test('换下并保留背包的奖励骨不会因重放奖励而重新装备', () => {
    const { runner, input } = setup();
    const result = runner.run(input);
    const old = result.character.bones.pop();
    A.removeBoneSource(result.equipmentLedger, old.boneId);
    result.character.inventory.push(I.markStatus(old, 'in-inventory'));
    const again = runner.run({ ...input, character: result.character, equipmentLedger: result.equipmentLedger });
    assert.equal(again.character.bones.length, 0);
    assert.equal(again.character.inventory.length, 1);
  });
  test('魂技生成中途失败后，换骰种读档重试仍得到原冻结结果', () => {
    const clean = setup();
    const expected = clean.runner.run(clean.input);
    const broken = setup();
    let calls = 0;
    const failed = broken.runner.run({ ...broken.input, makeSkill: (args) => { if (++calls === 2) throw new Error('模拟中断'); return F.makeSkillStub(args); } });
    assert.equal(failed.failedStep, 'ring');
    const resumed = ctx.modules.reward.createRunner(clone(broken.store)).run({ ...broken.input, rng: new RollLog('changed'), seed: 'changed' });
    assert.equal(resumed.failedStep, null);
    assert.deepEqual(resumed.result.ring, expected.result.ring);
    assert.deepEqual(resumed.result.inheritance, expected.result.inheritance);
  });
  test('魂环补偿使用当前面板重算，防止90级奖励读档恢复旧费用', () => {
    const { runner, input } = setup();
    const character = F.characterFixture({ level: 90 });
    runner.run({ ...input, character, level: 90 });
    const changed = F.characterFixture({ level: 90 });
    changed.stats.stats.B = 1000;
    const resumed = runner.run({ ...input, character: changed, level: 90 });
    assert.equal(resumed.character.rings.find((r) => r.index === 9).skills[0].cost, 500);
  });
};
