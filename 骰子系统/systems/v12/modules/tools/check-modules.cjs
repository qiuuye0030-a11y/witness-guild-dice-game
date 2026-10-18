'use strict';

const { test, section } = require('./lib/harness.cjs');
const F = require('./lib/fixtures.cjs');

const { createHuntController } = require('../src/hunt/controller');
const { createBeastLibrary } = require('../src/beast/library');
const { createTraitPool } = require('../src/soulbone/trait-pool');
const { createHandlerRegistry } = require('../src/soulbone/handlers');
const { createBoneInstance, validateBoneInstance, createAttributeBudget, previewBoneAttributes, exportBone, importBone } = require('../src/soulbone/instance');
const { createTenThousandBone, displayBoneTrait } = require('../src/soulbone/ten-thousand');
const { rollInheritance } = require('../src/reward/inheritance');
const { rehydrateHundredThousandRing } = require('../src/reward/ring');
const { createEquipmentLedger, absorbBone, confirmReplacement, effectiveModifiers } = require('../src/soulbone/absorption');
const { buildEffectivePanel, effectivePanelFromLedger, assertSingleRegistration, assertTraitHandlers, assertSourceSeparation } = require('../src/battle/equipment');
const { migrateCharacter, migrateBattleSnapshot, validateLegacyBoneSkills, migrateLegacyBoneEvent } = require('../src/soulbone/migrate');
const { createHundredThousandRing, handleNinthRing } = require('../src/reward/ring');
const { createEquipmentLedger: makeLedger } = require('../src/soulbone/absorption');
const { RollLog } = require('../src/rng');

const ratingFn = (label) => () => ({ label, score: 1.9, thresholds: { version: 2, crazy: 1.75, divine: 2.1 } });

function fixtureLibrary() {
  return createBeastLibrary({ data: { schemaVersion: 1, libraryVersion: 1, beasts: [F.beastFixture()] } });
}

function controllerWith(library, label = '凶级') {
  return createHuntController({ roster: args().roster, ratingFn: ratingFn(label), library });
}

let CTX;
function args() {
  return CTX;
}

function playerUnit() {
  return { id: 'player', name: '玩家', level: 80, team: 0, model: { derived: { HP: 1, MP: 1, SH: 1 } }, skills: [] };
}

function allyUnits(ids) {
  return ids.map((id) => CTX.modules.npc.buildUnit({ definition: CTX.roster.combatSpec(id), id: 'ally:' + id, team: 0 }));
}

module.exports = function moduleChecks(ctx) {
  CTX = ctx;
  const ledgerApi = ctx.modules.hunt.ledger;

  section('讨伐流程（交接文档第三—七节）');

  test('80级凶级：登记待办并在安全节点展示邀请', () => {
    const controller = controllerWith(fixtureLibrary());
    const flow = { phase: 'growth', completed: 3, consumedEvents: 5, rewardsGranted: 2, pending: { eventId: 'E05', settled: false } };
    const result = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'g3', at: 100 });
    ctx.assert.equal(result.presentation.kind, 'invitation');
    ctx.assert.equal(result.ledger.status, 'invitation');
    ctx.assert.deepEqual(result.presentation.options, ['接受', '拒绝']);
    ctx.assert.equal(result.ledger.restorePoint.snapshot.completed, 3);
  });

  test('同一安全节点不重复弹出；拒绝后不再询问', () => {
    const controller = controllerWith(fixtureLibrary());
    const flow = { phase: 'growth', completed: 3 };
    const first = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'g3' });
    const again = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: first.ledger, flow, safeNode: 'growth-settled', key: 'g3' });
    ctx.assert.equal(again.presentation, null);
    ctx.assert.equal(again.deduped, true);
    const refused = controller.choose({ ledger: first.ledger, option: '拒绝' });
    ctx.assert.equal(refused.ledger.status, 'refused');
    ctx.assert.equal(refused.texts.paragraphs.length, 1);
    ctx.assert.deepEqual(refused.restore, flow);
    const later = controller.consider({ level: 85, model: { level: 85, stats: {} }, ledger: refused.ledger, flow, safeNode: 'growth-settled', key: 'g9' });
    ctx.assert.equal(later.presentation, null);
  });

  test('接受：先落盘队友，再给共同正文与到场正文；接受本身无收益', () => {
    const controller = controllerWith(fixtureLibrary());
    const flow = { phase: 'growth', completed: 1 };
    const shown = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'k' });
    const rng = new RollLog('accept-seed');
    const chosen = controller.choose({ ledger: shown.ledger, option: '接受', originRank: 10, rng, at: 200 });
    ctx.assert.equal(chosen.ledger.status, 'arrival');
    ctx.assert.equal(chosen.allies.count, 3);
    ctx.assert.equal(chosen.arrival.paragraphs.length, 6);
    ctx.assert.equal(chosen.acceptedText.paragraphs.length, 1);
    ctx.assert.equal(chosen.arrival.advanceOption, '前进');
    ctx.assert.ok(chosen.note.includes('接受本身不发'));
    ctx.assert.equal(chosen.ledger.result, null);
  });

  test('家境档位只取 identity.originRank，不用武魂潜力、魅力或气运代替', () => {
    const controller = controllerWith(fixtureLibrary());
    const flow = { phase: 'growth' };
    const low = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'o1' });
    const richSoul = F.characterFixture();
    richSoul.identity = { originRank: 2 };
    richSoul.soul.tier = 10;
    richSoul.charm = 10;
    richSoul.luck = 10;
    const lowChosen = controller.choose({ ledger: low.ledger, option: '接受', character: richSoul, rng: new RollLog('o1') });
    ctx.assert.equal(lowChosen.allies.count, 0, '2档不应因为武魂潜力/魅力/气运而出现援军');

    const high = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'o2' });
    const poorSoul = F.characterFixture();
    poorSoul.identity = { originRank: 10 };
    poorSoul.soul.tier = 1;
    poorSoul.charm = 1;
    poorSoul.luck = 1;
    const highChosen = controller.choose({ ledger: high.ledger, option: '接受', character: poorSoul, rng: new RollLog('o2') });
    ctx.assert.equal(highChosen.allies.count, 3);

    const missing = F.characterFixture();
    const shown = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'o3' });
    ctx.assert.throws(() => controller.choose({ ledger: shown.ledger, option: '接受', character: missing, rng: new RollLog('o3') }), /identity\.originRank/);
  });

  test('前进：先冻结目标，再给出1对1/2对1/3对1/4对1队伍，不补敌方支援', () => {
    const library = fixtureLibrary();
    const controller = controllerWith(library);
    const flow = { phase: 'growth', completed: 1 };
    const shown = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'k' });
    const rng = new RollLog('forward-seed');
    const chosen = controller.choose({ ledger: shown.ledger, option: '接受', originRank: 10, rng, at: 200 });
    const forward = controller.forward({ ledger: chosen.ledger, rng, seed: 'battle-seed', playerUnit: playerUnit(), allyUnits: allyUnits(chosen.allies.npcIds) });
    ctx.assert.equal(forward.pending, false);
    ctx.assert.equal(forward.target.id, 'fixture-leviathan');
    ctx.assert.equal(forward.battlePlan.sizes.allies, 3);
    ctx.assert.equal(forward.battlePlan.sizes.enemy, 1);
    ctx.assert.equal(forward.battlePlan.units.length, 5);
    for (const key of ['autoSupport', 'enemySupport', 'supplementEnemyToTwo', 'consumeChallengeLedger']) ctx.assert.equal(forward.battlePlan.rules[key], false);
    ctx.assert.equal(forward.ledger.status, 'forwarded');
    ctx.assert.equal(forward.ledger.target.version, 1);
  });

  test('重开界面沿用已冻结目标：不重抽、不再投目标骰', () => {
    const controller = controllerWith(fixtureLibrary());
    const flow = { phase: 'growth', completed: 1 };
    const shown = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'k' });
    const rng = new RollLog('freeze-seed');
    const chosen = controller.choose({ ledger: shown.ledger, option: '接受', originRank: 8, rng });
    const first = controller.forward({ ledger: chosen.ledger, rng, seed: 's1', playerUnit: playerUnit(), allyUnits: allyUnits(chosen.allies.npcIds) });
    const rng2 = new RollLog('another-seed');
    const second = controller.forward({ ledger: first.ledger, rng: rng2, seed: 's2', playerUnit: playerUnit(), allyUnits: allyUnits(chosen.allies.npcIds) });
    ctx.assert.equal(second.target.id, first.target.id);
    ctx.assert.equal(second.target.version, first.target.version);
    ctx.assert.equal(second.roll, null);
    ctx.assert.equal(rng2.entries.length, 0);
    ctx.assert.equal(second.ledger.target.id, first.ledger.target.id);
  });

  test('胜利判定：魂兽实际退场且至少一人存活才发奖；队友最后一击仍算团队胜利', () => {
    const judge = ctx.modules.hunt.battle.judgeHunt;
    ctx.assert.equal(judge({ outcome: 'victory', enemy: { defeated: true }, survivors: ['ally:xutaiping'] }).loot, true);
    ctx.assert.equal(judge({ outcome: 'victory', enemy: { defeated: true }, survivors: ['player'] }).winner, 'team');
    ctx.assert.equal(judge({ outcome: 'timeout', enemy: { defeated: false }, survivors: ['player'] }).loot, false);
    ctx.assert.equal(judge({ outcome: 'draw', enemy: { defeated: false }, survivors: ['player'] }).loot, false);
    ctx.assert.equal(judge({ outcome: 'escape', enemy: { defeated: false }, survivors: ['player'] }).loot, false);
    ctx.assert.equal(judge({ outcome: 'surrender', enemy: { defeated: false }, survivors: ['player'] }).loot, false);
    ctx.assert.equal(judge({ outcome: 'victory', enemy: { defeated: false }, survivors: ['player'] }).loot, false);
    ctx.assert.equal(judge({ outcome: 'victory', enemy: { defeated: true }, survivors: [] }).loot, false);
  });

  test('战斗结算后写入讨伐类型战报并恢复原流程', () => {
    const library = fixtureLibrary();
    const controller = controllerWith(library);
    const flow = { phase: 'growth', completed: 2, consumedEvents: 7, rewardsGranted: 3 };
    const shown = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'k' });
    const rng = new RollLog('battle-seed');
    const chosen = controller.choose({ ledger: shown.ledger, option: '接受', originRank: 8, rng });
    const forward = controller.forward({ ledger: chosen.ledger, rng, seed: 's', playerUnit: playerUnit(), allyUnits: allyUnits(chosen.allies.npcIds) });
    const inBattle = controller.startBattle(forward.ledger, 'session-1');
    const resolved = controller.resolve({ ledger: inBattle, outcome: 'victory', enemy: { defeated: true }, survivors: ['player'], plan: forward.battlePlan, traits: [], triggers: [] });
    ctx.assert.equal(resolved.ledger.status, 'won');
    ctx.assert.equal(resolved.judge.loot, true);
    ctx.assert.equal(resolved.report.type, 'hunt');
    ctx.assert.equal(resolved.report.recordVersion, 1);
    const exported = ctx.modules.hunt.battle.exportHuntReport(resolved.report);
    ctx.assert.equal(exported.format, 'witness-hunt-report');
    ctx.assert.deepEqual(exported.report, resolved.report);
    ctx.assert.throws(() => ctx.modules.hunt.battle.exportHuntReport({ type: 'challenge' }), /不是讨伐战报/);
    ctx.assert.deepEqual(resolved.restore, flow);
    ctx.assert.throws(() => controller.resolve({ ledger: resolved.ledger, outcome: 'victory', enemy: { defeated: true }, survivors: ['player'] }), /不在讨伐战斗中/);
  });

  test('恢复点比较：事件数/奖励数/培养阶段没有多吞或多发', () => {
    const flowApi = ctx.modules.hunt.flow;
    const flow = { phase: 'growth', completed: 3, consumedEvents: 5, rewardsGranted: 2 };
    const point = flowApi.snapshotFlow(flow);
    const restored = flowApi.restoreFlow(point);
    ctx.assert.deepEqual(restored, flow);
    ctx.assert.equal(flowApi.compareFlow(flow, restored).equal, true);
    ctx.assert.equal(flowApi.compareFlow(flow, { ...flow, consumedEvents: 6 }).equal, false);
    ctx.assert.throws(() => flowApi.assertSameFlow(point, { ...flow, completed: 4 }), /不一致/);
  });

  test('队友最后一击：判定为团队胜利，玩家仍拿到一套环骨', () => {
    const library = fixtureLibrary();
    const controller = controllerWith(library);
    const flow = { phase: 'growth', completed: 2 };
    const shown = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'k' });
    const rng = new RollLog('npc-last-seed');
    const chosen = controller.choose({ ledger: shown.ledger, option: '接受', originRank: 8, rng });
    const forward = controller.forward({ ledger: chosen.ledger, rng, seed: 's', playerUnit: playerUnit(), allyUnits: allyUnits(chosen.allies.npcIds) });
    const inBattle = controller.startBattle(forward.ledger, 'session-ally');
    const resolved = controller.resolve({ ledger: inBattle, outcome: 'victory', enemy: { defeated: true }, survivors: ['ally:' + chosen.allies.npcIds[0]], plan: forward.battlePlan });
    ctx.assert.equal(resolved.judge.winner, 'team');
    ctx.assert.equal(resolved.judge.loot, true);
    const store = {};
    const runner = ctx.modules.reward.createRunner(store);
    const reward = runner.run({
      transactionId: 'npc-last-hit',
      firstWin: resolved.firstWin, sessionId: inBattle.battleSessionId,
      beastSnapshot: library.definition('fixture-leviathan'),
      character: F.characterFixture(),
      equipmentLedger: createEquipmentLedger(),
      level: 80,
      seed: 'reward',
      rng: new RollLog('reward'),
      makeSkill: F.makeSkillStub,
      restore: () => resolved.restore
    });
    ctx.assert.equal(reward.transaction.status, 'done');
    ctx.assert.equal(reward.character.bones.length, 1);
    ctx.assert.ok(reward.character.preStoredNinthRing);
    ctx.assert.equal(reward.character.rings.filter((ring) => ring.years === 100000).length, 0);
  });

  test('空魂兽库：停在目标资料尚未开放，保留接受与援军，可返回普通流程', () => {
    const empty = createBeastLibrary({ data: { schemaVersion: 1, libraryVersion: 1, beasts: [] } });
    ctx.assert.equal(empty.status().empty, true);
    ctx.assert.equal(empty.pick({ rng: new RollLog('x') }).empty, true);
    ctx.assert.throws(() => empty.buildInstance({ id: 'none' }), /没有目标/);
    const controller = controllerWith(empty);
    const flow = { phase: 'growth', completed: 4 };
    const shown = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'k' });
    const rng = new RollLog('empty-seed');
    const chosen = controller.choose({ ledger: shown.ledger, option: '接受', originRank: 9, rng });
    const forward = controller.forward({ ledger: chosen.ledger, rng, seed: 's', playerUnit: playerUnit(), allyUnits: allyUnits(chosen.allies.npcIds) });
    ctx.assert.equal(forward.pending, true);
    ctx.assert.equal(forward.ledger.status, 'awaiting-library');
    ctx.assert.equal(forward.battlePlan, undefined);
    ctx.assert.deepEqual(forward.ledger.allies.npcIds, chosen.allies.npcIds);
    ctx.assert.deepEqual(controller.restoreFlow(forward.ledger), flow);
    const summary = empty.status();
    ctx.assert.equal(summary.empty, true);
    ctx.assert.equal(summary.pendingReason, 'beast-library-empty');
  });

  test('非安全节点直接拒绝，且不会留下待办痕迹', () => {
    const controller = controllerWith(fixtureLibrary());
    ctx.assert.throws(() => controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow: { phase: 'growth' }, safeNode: 'read-preview', key: 'bad' }), /安全节点/);
  });

  test('试炼模式可显式关闭，且不得写入正式任务完成记录', () => {
    const configs = { modes: { journey: true, trial: true } };
    const controller = createHuntController({ roster: ctx.roster, ratingFn: ratingFn('凶级'), library: fixtureLibrary(), config: configs });
    const trial = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow: { phase: 'growth' }, safeNode: 'growth-settled', mode: 'trial', key: 't' });
    ctx.assert.equal(trial.presentation.recordCompletion, false);
    ctx.assert.equal(trial.ledger.mode, 'trial');
    ctx.assert.equal(trial.ledger.recordCompletion, false);
    const journey = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow: { phase: 'growth' }, safeNode: 'growth-settled', mode: 'journey', key: 'j' });
    ctx.assert.equal(journey.presentation.recordCompletion, true);
    const disabled = controllerWith(fixtureLibrary()).consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow: { phase: 'growth' }, safeNode: 'growth-settled', mode: 'trial', key: 't2' });
    ctx.assert.equal(disabled.presentation, null);
    ctx.assert.equal(disabled.condition.reason, 'mode-disabled');
  });

  test('旧档导入即满足条件：安全节点补发一次，之后不再重复', () => {
    const controller = controllerWith(fixtureLibrary());
    const flow = { phase: 'arrival', completed: 34 };
    const first = controller.consider({ level: 90, model: { level: 90, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'battle-settled', key: 'old-save' });
    ctx.assert.equal(first.presentation.kind, 'invitation');
    ctx.assert.equal(first.ledger.status, 'invitation');
    const second = controller.consider({ level: 90, model: { level: 90, stats: {} }, ledger: first.ledger, flow, safeNode: 'battle-settled', key: 'old-save-2' });
    ctx.assert.equal(second.presentation, null);
    ctx.assert.equal(second.ledger.presentations.length, 1);
  });

  test('空库待办在库补齐后可从原处继续，不重抽队友', () => {
    const empty = createBeastLibrary({ data: { schemaVersion: 1, libraryVersion: 1, beasts: [] } });
    const first = controllerWith(empty);
    const flow = { phase: 'growth', completed: 2 };
    const shown = first.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'k' });
    const rng = new RollLog('resume-seed');
    const chosen = first.choose({ ledger: shown.ledger, option: '接受', originRank: 9, rng });
    const waiting = first.forward({ ledger: chosen.ledger, rng, seed: 's', playerUnit: playerUnit(), allyUnits: allyUnits(chosen.allies.npcIds) });
    ctx.assert.equal(waiting.ledger.status, 'awaiting-library');
    const second = controllerWith(fixtureLibrary());
    const resumed = second.forward({ ledger: waiting.ledger, rng, seed: 's', playerUnit: playerUnit(), allyUnits: allyUnits(chosen.allies.npcIds) });
    ctx.assert.equal(resumed.pending, false);
    ctx.assert.equal(resumed.ledger.status, 'forwarded');
    ctx.assert.deepEqual(resumed.ledger.allies.npcIds, chosen.allies.npcIds);
    ctx.assert.equal(resumed.target.id, 'fixture-leviathan');
  });

  test('魂兽战斗实例与库原型隔离：实例受伤不污染定义', () => {
    const library = fixtureLibrary();
    const definition = library.definition('fixture-leviathan');
    const instance = library.buildInstance({ id: 'fixture-leviathan' });
    instance.stats.B = 1;
    instance.traits[0].name = '已改名';
    instance.skills.length = 0;
    ctx.assert.equal(definition.panel.stats.B, 900);
    ctx.assert.equal(definition.traits[0].name, '潮汐');
    ctx.assert.equal(definition.skills.length, 2);
    ctx.assert.equal(library.definition('fixture-leviathan').panel.stats.B, 900);
  });

  section('魂骨特性池与实例（交接文档第十一、十二节）');

  test('正式池20条；自定义空池仍返回待处理，不显示“特性已生效”', () => {
    ctx.assert.equal(ctx.modules.soulbone.traitPool.status().count,20);
    const empty=createTraitPool({data:{schemaVersion:1,poolVersion:2,traits:[]},registry:createHandlerRegistry()});
    const status = empty.status();
    ctx.assert.equal(status.empty, true);
    const result = empty.assemble({ boneId: 'b1', years: 20000, slot: '躯干', rng: new RollLog('p') });
    ctx.assert.equal(result.status, 'pending');
    ctx.assert.equal(result.reason, 'trait-pool-empty');
    ctx.assert.equal(result.trait, null);
  });

  test('有合法池时按权重抽一条并绑定魂骨实例；同种子可复现', () => {
    const registry = createHandlerRegistry({ 'fixture-handler-a': () => {}, 'fixture-handler-b': () => {} });
    const pool = createTraitPool({ data: F.traitPoolData(), registry });
    ctx.assert.equal(pool.status().count, 2);
    const a = pool.assemble({ boneId: 'b1', years: 20000, slot: '躯干', rng: new RollLog('trait-seed') });
    const b = pool.assemble({ boneId: 'b2', years: 20000, slot: '躯干', rng: new RollLog('trait-seed') });
    ctx.assert.equal(a.status, 'assembled');
    ctx.assert.equal(a.trait.traitId, b.trait.traitId);
    ctx.assert.equal(a.trait.sourceBoneId, 'b1');
    ctx.assert.equal(a.trait.assemblyVersion, 1);
  });

  test('排除已装备与叠加组用尽后无合法项 → 待处理，不无限重抽', () => {
    const registry = createHandlerRegistry({ 'fixture-handler-a': () => {}, 'fixture-handler-b': () => {} });
    const pool = createTraitPool({ data: F.traitPoolData(), registry });
    const onlyB = pool.assemble({ boneId: 'b1', years: 20000, slot: '躯干', rng: new RollLog('s'), excludeDefinitionIds: ['fixture-trait-a'] });
    ctx.assert.equal(onlyB.trait.traitId, 'fixture-trait-b');
    const none = pool.assemble({ boneId: 'b2', years: 20000, slot: '躯干', rng: new RollLog('s'), excludeDefinitionIds: ['fixture-trait-a', 'fixture-trait-b'] });
    ctx.assert.equal(none.status, 'pending');
    ctx.assert.equal(none.reason, 'no-legal-trait');
    const stacked = pool.assemble({ boneId: 'b3', years: 20000, slot: '躯干', rng: new RollLog('s'), stackCounts: { 'fixture-group-a': 1, 'fixture-group-b': 1 } });
    ctx.assert.equal(stacked.status, 'pending');
  });

  test('处理器缺失的定义不进入候选并显式报告', () => {
    const registry = createHandlerRegistry({ 'fixture-handler-a': () => {} });
    const data = F.traitPoolData();
    data.traits[1].handler = 'missing-handler';
    const pool = createTraitPool({ data, registry });
    const result = pool.assemble({ boneId: 'b1', years: 20000, slot: '躯干', rng: new RollLog('s'), excludeDefinitionIds: ['fixture-trait-a'] });
    ctx.assert.equal(result.status, 'pending');
    ctx.assert.ok(result.unavailable.some((item) => item.reason === 'handler-missing'));
  });

  test('属性预算未定：实例 attributes 为 null 并进入待处理，不编造六维', () => {
    const bone = createBoneInstance({
      boneId: 'bone-1',
      definitionId: 'def-1',
      source: { type: 'ten-thousand-drop', acquisitionId: 'acq-1', beastId: 'x', beastVersion: 1 },
      base: { years: 20000, slot: '头部', name: '校验头骨', affinity: '火' },
      traits: [{ traitId: 'fixture-trait-a', handler: 'fixture-handler-a', name: '甲', implementationVersion: 1 }]
    });
    ctx.assert.equal(bone.attributes, null);
    ctx.assert.equal(bone.status, 'pending');
    ctx.assert.ok(bone.pendingReasons.includes('attribute-budget-unset'));
    ctx.assert.equal(validateBoneInstance(bone), true);
  });

  test('已定版属性预算才写入数值；预算未定版时禁止携带数值', () => {
    const { createAttributeBudget, resolveAttributes } = ctx.modules.soulbone.instance;
    ctx.assert.throws(() => createAttributeBudget({ version: 0, values: { '20000': { B: 10 } } }), /不得携带数值/);
    const budget = createAttributeBudget({ version: 1, values: { '10000': { B: 10 }, '100000': { B: 60 } } });
    ctx.assert.deepEqual(resolveAttributes(100000, budget).attributes.stats, { B: 60 });
    ctx.assert.deepEqual(resolveAttributes(20000, budget).attributes.stats, { B: 10 });
    ctx.assert.deepEqual(resolveAttributes(5000, budget).attributes, null);
  });

  test('魂骨导出/导入：格式、版本、结构三层校验', () => {
    const item = createBoneInstance({
      boneId: 'export-bone',
      definitionId: 'def-x',
      source: { type: 'ten-thousand-drop', acquisitionId: 'acq-x', beastId: 'b', beastVersion: 1 },
      base: { years: 20000, slot: '头部', name: '导出骨', affinity: '风' },
      attributes: { stats: { B: 10 }, budgetVersion: 1 },
      traits: [{ traitId: 'fixture-trait-a', handler: 'fixture-handler-a', name: '甲', implementationVersion: 1 }]
    });
    const payload = exportBone(item);
    ctx.assert.equal(payload.format, 'witness-soulbone-instance');
    ctx.assert.deepEqual(importBone(payload), item);
    ctx.assert.deepEqual(previewBoneAttributes(item), { stats: { B: 10 }, budgetVersion: 1, reason: null });
    ctx.assert.throws(() => importBone({ ...payload, version: 99 }), /版本不一致/);
    ctx.assert.throws(() => importBone({ ...payload, format: 'other' }), /不是魂骨实例导出格式/);
  });

  section('万年魂骨一次装配（交接文档第十二节）');

  test('池空：万年骨实例照常获得，但特性待处理，不显示为已生效', () => {
    const registry = createHandlerRegistry({});
    const pool = createTraitPool({ data: { schemaVersion: 1, poolVersion: 1, traits: [] }, registry });
    const item = createTenThousandBone({ boneId: 'tb-empty', acquisitionId: 'a-empty', years: 20000, slot: '躯干', pool, rng: new RollLog('e') });
    ctx.assert.equal(item.traits.length, 0);
    ctx.assert.equal(item.status, 'pending');
    ctx.assert.equal(item.assembly.reason, 'trait-pool-empty');
    ctx.assert.ok(item.pendingReasons.includes('trait-pool-empty'));
    ctx.assert.deepEqual(displayBoneTrait(item), []);
  });

  test('有池：恰装配一条特性；预算未定时属性仍为 null', () => {
    const registry = createHandlerRegistry({ 'fixture-handler-a': () => {}, 'fixture-handler-b': () => {} });
    const pool = createTraitPool({ data: F.traitPoolData(), registry });
    const item = createTenThousandBone({ boneId: 'tb-one', acquisitionId: 'a-one', years: 20000, slot: '躯干', pool, rng: new RollLog('one') });
    ctx.assert.equal(item.traits.length, 1);
    ctx.assert.equal(item.assembly.status, 'assembled');
    ctx.assert.equal(item.attributes, null);
    ctx.assert.ok(item.pendingReasons.includes('attribute-budget-unset'));
    ctx.assert.deepEqual(displayBoneTrait(item).length, 1);
    ctx.assert.ok(displayBoneTrait(item)[0].name && displayBoneTrait(item)[0].effect);
  });

  test('预算定版后同一入口写入属性；部位可由骰子冻结', () => {
    const registry = createHandlerRegistry({ 'fixture-handler-a': () => {}, 'fixture-handler-b': () => {} });
    const pool = createTraitPool({ data: F.traitPoolData(), registry });
    const budget = createAttributeBudget({ version: 1, values: { '10000': { B: 25, S: 5 } } });
    const item = createTenThousandBone({ boneId: 'tb-budget', acquisitionId: 'a-budget', years: 20000, pool, rng: new RollLog('budget'), budget, affinity: '火' });
    ctx.assert.deepEqual(item.attributes.stats, { B: 25, S: 5 });
    ctx.assert.equal(item.status, 'ready');
    ctx.assert.ok(item.rolls.slot && item.rolls.slot.sides === 6);
  });

  section('魂骨吸收与部位冲突（交接文档第十六节）');

  section('魂骨吸收与部位冲突（交接文档第十六节）');

  function bone(overrides = {}) {
    return createBoneInstance({
      boneId: overrides.boneId || 'bone-a',
      definitionId: 'def-a',
      source: { type: 'ten-thousand-drop', acquisitionId: overrides.acquisitionId || 'acq-a', beastId: 'x', beastVersion: 1 },
      base: { years: 20000, slot: overrides.slot || '躯干', name: '校验魂骨', affinity: '火' },
      attributes: overrides.attributes === undefined ? { stats: { B: 20 }, budgetVersion: 1 } : overrides.attributes,
      traits: overrides.traits || [{ traitId: 'fixture-trait-a', handler: 'fixture-handler-a', name: '甲', implementationVersion: 1 }]
    });
  }

  test('空位自动吸收：属性进装备账本、特性进运行时来源，事件次数与月份不变', () => {
    const character = F.characterFixture();
    const ledger = createEquipmentLedger();
    const result = absorbBone({ character, bone: bone(), ledger });
    ctx.assert.equal(result.status, 'absorbed');
    ctx.assert.equal(result.eventConsumed, 0);
    ctx.assert.equal(result.monthsAdvanced, 0);
    ctx.assert.equal(character.bones.length, 1);
    ctx.assert.deepEqual(ledger.attributes['bone-a'].stats, { B: 20 });
    ctx.assert.equal(Object.keys(ledger.runtimeTraits).length, 1);
    ctx.assert.deepEqual(character.growth, F.characterFixture().growth);
  });

  test('重复吸收同一块骨不重复加属性、不重复注册特性', () => {
    const character = F.characterFixture();
    const ledger = createEquipmentLedger();
    const item = bone();
    absorbBone({ character, bone: item, ledger });
    const again = absorbBone({ character, bone: item, ledger });
    ctx.assert.equal(again.duplicate, true);
    ctx.assert.equal(character.bones.length, 1);
    ctx.assert.deepEqual(effectiveModifiers(ledger).attributes, { B: 20 });
    ctx.assert.equal(Object.keys(ledger.runtimeTraits).length, 1);
  });

  test('部位冲突：新骨保留在背包，旧骨不被暗拆；确认后替换并清理旧来源', () => {
    const character = F.characterFixture();
    const ledger = createEquipmentLedger();
    absorbBone({ character, bone: bone({ boneId: 'bone-a', attributes: { stats: { B: 20 }, budgetVersion: 1 } }), ledger });
    const conflict = absorbBone({ character, bone: bone({ boneId: 'bone-b', acquisitionId: 'acq-b', attributes: { stats: { B: 30 }, budgetVersion: 1 } }), ledger });
    ctx.assert.equal(conflict.status, 'slot-conflict');
    ctx.assert.equal(character.bones.length, 1);
    ctx.assert.equal(character.inventory.length, 1);
    ctx.assert.equal(character.inventory[0].boneId, 'bone-b');
    ctx.assert.equal(conflict.session.requiresConfirmation, true);
    const replaced = confirmReplacement({ session: conflict.session, choice: 'replace-existing', character, ledger });
    ctx.assert.equal(replaced.status, 'replaced');
    ctx.assert.equal(character.bones.length, 1);
    ctx.assert.equal(character.bones[0].boneId, 'bone-b');
    ctx.assert.equal(character.inventory.length, 1);
    ctx.assert.equal(character.inventory[0].boneId, 'bone-a');
    ctx.assert.deepEqual(effectiveModifiers(ledger).attributes, { B: 30 });
  });

  test('旧档魂骨（顶层slot/id）参与部位冲突，不被新骨静默覆盖', () => {
    const character = F.characterFixture();
    character.bones = [{ id: 'legacy-bone', slot: '躯干', name: '旧千年骨', years: 1000, skills: [], absorbed: true }];
    const ledger = createEquipmentLedger();
    const conflict = absorbBone({ character, bone: bone({ slot: '躯干' }), ledger });
    ctx.assert.equal(conflict.status, 'slot-conflict');
    ctx.assert.equal(character.bones.length, 1);
    ctx.assert.equal(character.bones[0].id, 'legacy-bone');
    ctx.assert.equal(character.inventory[0].boneId, 'bone-a');
    const replaced = confirmReplacement({ session: conflict.session, choice: 'replace-existing', character, ledger });
    ctx.assert.equal(replaced.replacedBoneId, 'legacy-bone');
    ctx.assert.equal(character.bones[0].boneId, 'bone-a');
    ctx.assert.equal(character.inventory[0].id, 'legacy-bone');
  });

  test('不可拆骨时保留在背包并说明待处理原因', () => {
    const character = F.characterFixture();
    const ledger = createEquipmentLedger();
    absorbBone({ character, bone: bone({ boneId: 'bone-a' }), ledger });
    const conflict = absorbBone({ character, bone: bone({ boneId: 'bone-c', acquisitionId: 'acq-c' }), ledger });
    const kept = confirmReplacement({ session: conflict.session, choice: 'keep-in-inventory', character, ledger });
    ctx.assert.equal(kept.status, 'kept-in-inventory');
    ctx.assert.equal(kept.pendingReason, 'slot-conflict');
    ctx.assert.equal(character.inventory.length, 1);
    ctx.assert.equal(character.bones[0].boneId, 'bone-a');
  });

  section('装备来源与有效面板（交接文档第十八节）');

  test('有效面板 = 人物基础面板 + 魂骨来源修正，只叠加一次且不改成长', () => {
    const character = F.characterFixture();
    const ledger = createEquipmentLedger();
    absorbBone({ character, bone: bone({ attributes: { stats: { B: 40, S: 10 }, budgetVersion: 1 } }), ledger });
    const panel = effectivePanelFromLedger(character.stats, ledger, { derive: (stats) => ({ HP: stats.B * 7 }) });
    ctx.assert.equal(panel.model.stats.B, 740);
    ctx.assert.equal(panel.model.stats.S, 710);
    ctx.assert.equal(panel.appliedAttributes.B, 40);
    ctx.assert.equal(panel.growthTouched, false);
    ctx.assert.deepEqual(character.stats, F.characterFixture().stats);
  });

  test('有属性修正但缺少战斗侧 derive 时显式报错，不另写一套数值', () => {
    const character = F.characterFixture();
    const ledger = createEquipmentLedger();
    absorbBone({ character, bone: bone({ attributes: { stats: { B: 10 }, budgetVersion: 1 } }), ledger });
    ctx.assert.throws(() => effectivePanelFromLedger(character.stats, ledger), /derive/);
  });

  test('同一特性/同一魂骨只登记一次；缺失处理器显式列出', () => {
    const character = F.characterFixture();
    const ledger = createEquipmentLedger();
    absorbBone({ character, bone: bone(), ledger });
    const registry = createHandlerRegistry({ 'fixture-handler-a': () => {} });
    ctx.assert.deepEqual(assertSingleRegistration(ledger), { traits: 1, bones: 1, attributeSources: 1 });
    ctx.assert.equal(assertTraitHandlers(ledger, registry).ok, true);
    const missing = assertTraitHandlers(ledger, createHandlerRegistry({}));
    ctx.assert.equal(missing.ok, false);
    ctx.assert.equal(missing.missing[0].handler, 'fixture-handler-a');
  });

  test('来源分离：魂骨特性绑定骨实例，不以武魂ID作为唯一键', () => {
    const character = F.characterFixture();
    const ledger = createEquipmentLedger();
    absorbBone({ character, bone: bone(), ledger });
    ctx.assert.deepEqual(assertSourceSeparation(ledger), { traits: 1, bones: 1, innateTraitsOutsideLedger: true });
    const forged = JSON.parse(JSON.stringify(ledger));
    forged.runtimeTraits[Object.keys(forged.runtimeTraits)[0]].soulId = 'fixture-soul';
    ctx.assert.throws(() => assertSourceSeparation(forged), /武魂ID/);
  });

  section('十万年魂环与第九环（交接文档第十五节）');

  test('90级且八环齐备：自动吸收预留第九环，两技共享冷却', () => {
    const character = F.characterFixture();
    const ring = createHundredThousandRing({ character, seed: 'ring-seed', rng: new RollLog('r'), makeSkill: F.makeSkillStub, transactionId: 'tx-1' });
    ctx.assert.equal(ring.years, 100000);
    ctx.assert.equal(ring.skills.length, 2);
    ctx.assert.notEqual(ring.skills[0].category, ring.skills[1].category);
    ctx.assert.ok(ring.skills.every((skill) => skill.sharedCooldown === 'ring-9'));
    const result = handleNinthRing({ character, ring, level: 90 });
    ctx.assert.equal(result.action, 'absorbed');
    ctx.assert.equal(character.rings.length, 9);
    ctx.assert.equal(character.rings[8].index, 9);
  });

  test('预留环吸收时按当前面板重算两技，类别与生成种子不变', () => {
    const character = F.characterFixture();
    const ring = createHundredThousandRing({ character, seed: 'rehydrate', rng: new RollLog('r'), makeSkill: F.makeSkillStub, transactionId: 'tx-rehydrate', category: '攻击' });
    const categories = ring.skills.map((skill) => skill.category);
    const seeds = ring.skills.map((skill) => skill.effectSeed);
    const before = ring.skills.map((skill) => skill.cost);
    character.stats.stats.B = 1400;
    const result = handleNinthRing({ character, ring, level: 90, makeSkill: F.makeSkillStub, seed: 'rehydrate' });
    ctx.assert.equal(result.action, 'absorbed');
    const ninth = character.rings.find((item) => item.index === 9);
    ctx.assert.deepEqual(ninth.skills.map((skill) => skill.category), categories);
    ctx.assert.deepEqual(ninth.skills.map((skill) => skill.effectSeed), seeds);
    ctx.assert.equal(before[0], 350);
    ctx.assert.equal(ninth.skills[0].cost, 700);
    ctx.assert.ok(ninth.skills.every((skill) => skill.sharedCooldown === 'ring-9'));
  });

  test('全部继承也只获得一块魂骨，该骨携带多条特性', () => {
    const frozen = ctx.modules.reward.transaction.freezeBeastReward(F.beastFixture());
    const result = rollInheritance({ traits: frozen.traits, rng: { die: () => 1 } });
    ctx.assert.equal(result.mode, 'all');
    ctx.assert.equal(result.selectedTraitIds.length, 2);
    const traits = result.selectedTraitIds.map((id) => {
      const trait = frozen.traits.find((item) => item.id === id);
      return { traitId: trait.id, name: trait.name, effect: trait.effect, handler: trait.inherit.handler, implementationVersion: trait.inherit.implementationVersion, params: trait.inherit.params };
    });
    const bone = createBoneInstance({
      boneId: 'all-bone',
      definitionId: 'beast-bone:fixture-leviathan',
      source: { type: 'hunt', acquisitionId: 'tx-all', beastId: 'fixture-leviathan', beastVersion: 1 },
      base: { years: 100000, slot: '躯干', name: '全部继承骨' },
      attributes: null,
      traits
    });
    ctx.assert.equal(bone.traits.length, 2);
    ctx.assert.equal(validateBoneInstance(bone), true);
  });

  test('不足90级：预留第九环，不提前装成第八环', () => {
    const character = F.characterFixture();
    const ring = createHundredThousandRing({ character, seed: 'ring-seed', rng: new RollLog('r'), makeSkill: F.makeSkillStub, transactionId: 'tx-2' });
    const result = handleNinthRing({ character, ring, level: 89 });
    ctx.assert.equal(result.action, 'pre-stored');
    ctx.assert.equal(character.rings.length, 8);
    ctx.assert.equal(result.pendingRing.years, 100000);
  });

  test('90级但中间缺环：保留在队列，不跳过缺环', () => {
    const character = F.characterFixture();
    character.rings = character.rings.filter((ring) => ring.index !== 5);
    const ring = createHundredThousandRing({ character, seed: 'ring-seed', rng: new RollLog('r'), makeSkill: F.makeSkillStub, transactionId: 'tx-3' });
    const result = handleNinthRing({ character, ring, level: 90 });
    ctx.assert.equal(result.action, 'queued-gap');
    ctx.assert.equal(character.rings.length, 7);
  });

  test('已有九环：不覆盖、不生成第十环、不塞第三技', () => {
    const character = F.characterFixture();
    character.rings.push({ index: 9, years: 100000, skills: [{ sharedCooldown: 'ring-9', category: '攻击' }, { sharedCooldown: 'ring-9', category: '控制' }] });
    const ring = createHundredThousandRing({ character, seed: 'ring-seed', rng: new RollLog('r'), makeSkill: F.makeSkillStub, transactionId: 'tx-4' });
    const result = handleNinthRing({ character, ring, level: 95 });
    ctx.assert.equal(result.action, 'already-nine');
    ctx.assert.equal(character.rings.length, 9);
    ctx.assert.equal(result.pendingRing.years, 100000);
  });

  test('九环一致性：面板/战斗/存档读真实已吸收第九环，91级不重复生环', () => {
    const { assertNinthRingConsistency } = require('../src/reward/ring');
    const character = F.characterFixture();
    character.rings.push({ index: 9, years: 100000, skills: [{ sharedCooldown: 'ring-9', category: '攻击' }, { sharedCooldown: 'ring-9', category: '控制' }] });
    ctx.assert.deepEqual(assertNinthRingConsistency(character), { hasNinth: true, consistent: true, skillCount: 2, years: 100000 });
    ctx.assert.throws(() => assertNinthRingConsistency({ rings: [{ index: 9, years: 99999, source: { type: 'hunt' }, skills: [] }] }), /不是十万年/);
    const ring = createHundredThousandRing({ character, seed: 'ring-seed', rng: new RollLog('r'), makeSkill: F.makeSkillStub, transactionId: 'tx-91' });
    const at91 = handleNinthRing({ character, ring, level: 91 });
    ctx.assert.equal(at91.action, 'already-nine');
    ctx.assert.equal(character.rings.filter((item) => item.index === 9).length, 1);
    ctx.assert.equal(character.rings.length, 9);
  });

  test('非讨伐、非第九环极端的来源不能产出十万年魂环', () => {
    const character = F.characterFixture();
    ctx.assert.throws(() => createHundredThousandRing({ character, seed: 's', rng: new RollLog('r'), makeSkill: F.makeSkillStub, transactionId: 'tx', entrance: 'normal-hunt' }), /非法十万年来源入口/);
    const { assertLegalTenThousandSource } = require('../src/reward/ring');
    ctx.assert.throws(() => assertLegalTenThousandSource({ index: 9, years: 100000, source: { entrance: 'normal-hunt', type: 'hunt' } }), /来源入口非法/);
    ctx.assert.equal(assertLegalTenThousandSource({ index: 9, years: 100000, source: { entrance: 'legacy-ninth-extreme', type: 'legacy-ninth-extreme' } }), true);
  });

  section('战斗适配层（交接文档第十九节第5项）');

  test('个人回合只计正常行动；附赠普攻、持续伤害跳数、连击分段不计；被控不计', () => {
    const { createTurnClock } = ctx.modules.battle.hooks;
    const clock = createTurnClock();
    clock.begin('a');
    ctx.assert.equal(clock.complete('a', { kind: 'normal' }).counted, true);
    clock.begin('a');
    ctx.assert.equal(clock.complete('a', { kind: 'bonus' }).counted, false);
    clock.begin('a');
    ctx.assert.equal(clock.complete('a', { kind: 'dot' }).counted, false);
    clock.begin('a');
    ctx.assert.equal(clock.complete('a', { kind: 'segment' }).counted, false);
    clock.begin('a', { controlled: true });
    ctx.assert.equal(clock.complete('a', { kind: 'normal' }).counted, false);
    ctx.assert.equal(clock.turnsOf('a'), 1);
  });

  test('统一事件清单覆盖受伤/护盾/控制/回魂/行动起止；不能自造回合事件', () => {
    const { EVENTS, createHookRegistry } = ctx.modules.battle.hooks;
    for (const event of ['damage-taken', 'damage-dealt', 'shield-gained', 'shield-broken', 'control-start', 'control-end', 'heal', 'mp-restore', 'turn-start', 'turn-end', 'battle-start', 'battle-end']) {
      ctx.assert.ok(EVENTS.includes(event), event);
    }
    const registry = createHookRegistry();
    ctx.assert.throws(() => registry.on('round-tick', () => {}, { id: 'x' }), /未知战斗事件/);
    registry.on('damage-taken', () => {}, { id: 'h1', owner: 'bone-a' });
    ctx.assert.throws(() => registry.on('damage-taken', () => {}, { id: 'h1' }), /重复注册/);
    const result = registry.emit('damage-taken', { logs: [] });
    ctx.assert.equal(result.handlers.length, 1);
    registry.offOwner('bone-a');
    ctx.assert.equal(registry.list().length, 0);
  });

  section('奖励事务（交接文档第十四节）');

  function runner() {
    const store = {};
    const instance = ctx.modules.reward.createRunner(store);
    return { store, instance };
  }

  function runReward(instance, overrides = {}) {
    const character = overrides.character || F.characterFixture();
    const equipmentLedger = makeLedger();
    return instance.run({
      transactionId: overrides.transactionId || 'hunt:session-1',
      firstWin: true, sessionId: 'session-1',
      beastSnapshot: F.beastFixture(),
      character,
      equipmentLedger,
      level: character.level,
      rng: new RollLog(overrides.seed || 'reward-seed'),
      makeSkill: F.makeSkillStub,
      at: { year: 6102, month: 3 },
      restore: () => ({ restored: true }),
      ...overrides
    });
  }

  test('首胜九步一次完成：环、骨、继承、吸收、预存九环、战报', () => {
    const { store, instance } = runner();
    const result = runReward(instance);
    ctx.assert.equal(result.transaction.status, 'done');
    ctx.assert.equal(result.result.ring.years, 100000);
    ctx.assert.equal(result.result.bone.base.years, 100000);
    ctx.assert.equal(result.result.bone.traits.length >= 1, true);
    ctx.assert.equal(result.result.inheritance.frozen, true);
    ctx.assert.equal(['absorbed', 'absorbed-with-pending-budget'].includes(result.result.absorption.status), true);
    ctx.assert.equal(result.result.ninthRing.action, 'pre-stored');
    ctx.assert.equal(result.character.rings.length, 8);
    ctx.assert.ok(result.character.preStoredNinthRing);
    ctx.assert.equal(result.character.bones.length, 1);
    ctx.assert.equal(store.reports.length, 1);
    ctx.assert.equal(store.reports[0].type, 'hunt');
  });

  test('重复回调同一事务只补完未完成步骤，不重发环骨与特性', () => {
    const { store, instance } = runner();
    const first = runReward(instance);
    const second = runReward(instance);
    ctx.assert.equal(second.reused, true);
    ctx.assert.equal(Object.keys(store.transactions).length, 1);
    ctx.assert.equal(store.reports.length, 1);
    ctx.assert.equal(first.result.inheritance.selectedTraitIds.join(','), second.result.inheritance.selectedTraitIds.join(','));
    ctx.assert.equal(second.result.ring.skills.length, 2);
  });

  test('队伍胜利只给玩家一套：两位NPC不会变成三套', () => {
    const { store, instance } = runner();
    const result = runReward(instance);
    ctx.assert.equal(store.reports.length, 1);
    ctx.assert.equal(store.reports[0].transactionId, 'hunt:session-1');
    ctx.assert.equal(result.character.bones.length, 1);
    ctx.assert.equal(result.character.rings.filter((ring) => ring.years === 100000).length, 0);
  });

  test('读到“已胜利未展示奖励”的存档：只补落地效果，不重掷环骨', () => {
    const { instance } = runner();
    runReward(instance);
    const fresh = F.characterFixture();
    const again = runReward(instance, { character: fresh });
    ctx.assert.equal(again.reused, true);
    ctx.assert.equal(again.failedStep, null);
    ctx.assert.ok(again.resumedSteps.includes('absorb'));
    ctx.assert.equal(again.character.bones.length, 1);
    ctx.assert.ok(again.character.preStoredNinthRing);
    ctx.assert.equal(again.character.rings.length, 8);
    ctx.assert.equal(fresh.bones.length, 0, '调用方传入对象不被就地修改');
  });

  test('90级八环齐备时直接吸收第九环', () => {
    const { instance } = runner();
    const character = F.characterFixture({ level: 90 });
    const result = runReward(instance, { character, transactionId: 'hunt:session-90' });
    ctx.assert.equal(result.result.ninthRing.action, 'absorbed');
    ctx.assert.equal(result.character.rings.length, 9);
  });

  test('首胜之外不能创建奖励事务', () => {
    const { instance } = runner();
    ctx.assert.throws(() => runReward(instance, { firstWin: false }), /首胜/);
  });

  test('同一场胜利不能换一个事务ID再领一次', () => {
    const { instance } = runner();
    runReward(instance, { transactionId: 'hunt:same-session', sessionId: 'session-x' });
    ctx.assert.throws(() => runReward(instance, { transactionId: 'hunt:other-id', sessionId: 'session-x' }), /同一场胜利只能创建一个奖励事务ID/);
  });

  section('旧档迁移（交接文档第二、十七节）');

  test('只清理魂性谱随机武魂特性，保留角色固有/NPC/魂骨特性，成长不回扣', () => {
    const character = F.characterFixture();
    character.rings.push({ index: 9, years: 100000, skills: [{ name: '旧十万年技', category: '攻击' }] });
    character.traits = [
      { id: 'role-1', name: '会长固有', source: 'role' },
      { id: 'soul-1', name: '随机特性', source: '魂性谱' },
      { id: 'npc-1', name: '程良特性', source: 'npc' },
      { id: 'bone-1', name: '魂骨特性', sourceBoneId: 'bone-a', source: 'soulbone' },
      { id: 'unknown-1', name: '来源不明' }
    ];
    character.traitPending = { soul: 3 };
    const before = JSON.parse(JSON.stringify(character.growth));
    const ringsBefore = JSON.parse(JSON.stringify(character.rings));
    const migrated = migrateCharacter(character);
    ctx.assert.deepEqual(migrated.character.rings, ringsBefore, '旧合法十万年魂环不回收');
    ctx.assert.deepEqual(migrated.character.traits.map((trait) => trait.id), ['role-1', 'npc-1', 'bone-1', 'unknown-1']);
    ctx.assert.equal(migrated.report.removed.filter((item) => item.kind === 'soul-random').length, 1);
    ctx.assert.equal(migrated.report.needsReview.length, 1);
    ctx.assert.deepEqual(migrated.character.growth, before);
    ctx.assert.equal(migrated.character.traitPending, undefined);
  });

  test('战斗快照里旧随机特性待用状态被清除，角色/NPC状态保留', () => {
    const snapshot = {
      units: [
        { id: 'player', passive: { definitionId: 'soul-trait-001', pending: 5, stacks: 2 } },
        { id: 'guildmaster', passive: { definitionId: 'role-trait-x', source: 'role' } }
      ]
    };
    const result = migrateBattleSnapshot(snapshot);
    ctx.assert.equal(result.snapshot.units[0].passive, null);
    ctx.assert.equal(result.snapshot.units[1].passive.definitionId, 'role-trait-x');
    ctx.assert.equal(result.report.removed.length, 1);
  });

  test('旧魂骨技能校验升级：非空不再整包拒绝，但缺版本/缺处理器显式报错', () => {
    ctx.assert.equal(validateLegacyBoneSkills({ skills: [] }), true);
    ctx.assert.throws(() => validateLegacyBoneSkills({ skills: [{ type: 'active', handler: 'x' }] }), /生成版本/);
    ctx.assert.throws(() => validateLegacyBoneSkills({ skills: [{ generationVersion: 1, type: 'active', handler: 'x' }] }, { implementedHandlers: [] }), /处理器未实现/);
    ctx.assert.equal(validateLegacyBoneSkills({ skills: [{ generationVersion: 1, type: 'active', handler: 'x' }] }, { implementedHandlers: ['x'] }), true);
  });

  test('旧E02已结算成果保留并防止重发', () => {
    const settled = migrateLegacyBoneEvent({ eventId: 'E02', settled: true, reward: ['魂骨'] });
    ctx.assert.equal(settled.pending.rewardsAlreadyGranted, true);
    ctx.assert.equal(settled.pending.duplicateRewardPrevented, true);
    ctx.assert.deepEqual(settled.pending.reward, ['魂骨']);
    const other = migrateLegacyBoneEvent({ eventId: 'E05', settled: true });
    ctx.assert.equal(other.report.changed, false);
  });
};
