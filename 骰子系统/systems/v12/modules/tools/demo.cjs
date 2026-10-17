'use strict';

/**
 * 端到端演示：用 tools 下的固定数据跑一遍“邀请→接受→到场→前进→战斗→奖励→恢复”。
 *
 * 这不是正式魂兽库，也不会写入任何存档；只是让人直观看到模块之间如何拼接。
 * 运行：node tools/demo.cjs
 */

const { createModules } = require('../src/splice/compose');
const { createHuntController } = require('../src/hunt/controller');
const { createBeastLibrary } = require('../src/beast/library');
const { RollLog } = require('../src/rng');
const F = require('./lib/fixtures.cjs');

const ratingFn = () => ({ label: '凶级', score: 1.9, thresholds: { version: 2, crazy: 1.75, divine: 2.1 } });
const modules = createModules({ ratingFn });
const library = createBeastLibrary({ data: { schemaVersion: 1, libraryVersion: 1, beasts: [F.beastFixture()] } });
const controller = createHuntController({ roster: modules.roster, ratingFn, library });
const ledgerApi = modules.hunt.ledger;

function line(text) {
  console.log(text);
}

function paragraphs(list) {
  for (const paragraph of list) line(paragraph);
}

const flow = { phase: 'growth', completed: 4, consumedEvents: 9, rewardsGranted: 5, pending: { eventId: 'E05', settled: false } };
const rng = new RollLog('demo-seed');
const character = F.characterFixture({ level: 80 });

line('== 1. 安全节点：固定触发 ==');
let result = controller.consider({ level: 80, model: { level: 80, stats: {} }, ledger: ledgerApi.createLedger(), flow, safeNode: 'growth-settled', key: 'demo', at: 1 });
line(result.presentation.title);
paragraphs(result.presentation.paragraphs);
line('选项：' + result.presentation.options.join(' / '));

line('\n== 2. 接受：队友判定 + 到场 ==');
let chosen = controller.choose({ ledger: result.ledger, option: '接受', originRank: 10, rng, at: 2 });
paragraphs(chosen.acceptedText.paragraphs);
paragraphs(chosen.arrival.paragraphs);
line('到场友方：' + chosen.allies.npcIds.join('、'));
line('前进入口：' + chosen.arrival.advanceOption);

line('\n== 3. 前进：冻结目标并组队 ==');
const playerUnit = { id: 'player', name: character.name, level: character.level, team: 0, model: character.stats, skills: [] };
const allyUnits = chosen.allies.npcIds.map((id) => modules.npc.buildUnit({ definition: modules.roster.combatSpec(id), id: 'ally:' + id, team: 0 }));
const forward = controller.forward({ ledger: chosen.ledger, rng, seed: 'demo-battle', playerUnit, allyUnits });
line('遭遇：' + forward.encounter.name + ' · ' + forward.encounter.years + '年 · ' + forward.encounter.lifeType);
line('队伍：' + forward.battlePlan.sizes.player + '玩家 + ' + forward.battlePlan.sizes.allies + '友方 对 ' + forward.battlePlan.sizes.enemy + '魂兽');
line('规则：自动补员=' + forward.battlePlan.rules.autoSupport + '，敌方支援=' + forward.battlePlan.rules.enemySupport + '，占用挑战账本=' + forward.battlePlan.rules.consumeChallengeLedger);

line('\n== 4. 战斗结算 ==');
let battleLedger = controller.startBattle(forward.ledger, 'demo-session');
const resolved = controller.resolve({ ledger: battleLedger, outcome: 'victory', enemy: { defeated: true }, survivors: ['ally:' + chosen.allies.npcIds[0]], plan: forward.battlePlan, traits: [], triggers: [] });
line('判定：' + resolved.judge.winner + ' · ' + resolved.judge.reason + ' · 发奖=' + resolved.judge.loot);
line('战报类型：' + resolved.report.type);

line('\n== 5. 首胜奖励事务 ==');
const store = {};
const runner = modules.reward.createRunner(store);
const reward = runner.run({
  transactionId: 'demo:' + forward.target.id,
  firstWin: resolved.firstWin, sessionId: battleLedger.battleSessionId,
  beastSnapshot: forward.target ? library.definition(forward.target.id) : null,
  character,
  equipmentLedger: modules.soulbone.absorption.createEquipmentLedger(),
  level: character.level,
  seed: 'demo-reward',
  rng: new RollLog('demo-reward'),
  makeSkill: F.makeSkillStub,
  at: { year: 6102, month: 5 },
  restore: () => modules.hunt.flow.restoreFlow(forward.ledger.restorePoint)
});
line('事务状态：' + reward.transaction.status);
line('魂环：' + reward.result.ring.years + '年 · ' + reward.result.ring.skills.map((skill) => skill.category).join(' / ') + ' · 共享冷却=' + reward.result.ring.skills[0].sharedCooldown);
line('魂骨：' + reward.result.bone.base.slot + ' · ' + reward.result.bone.base.years + '年 · 特性 ' + reward.result.bone.traits.map((trait) => trait.traitId).join('、'));
line('继承：' + reward.result.inheritance.mode + '（面 ' + reward.result.inheritance.face + '）');
line('吸收：' + reward.result.absorption.status + '（属性预算待定）');
line('第九环：' + reward.result.ninthRing.action);
line('预存环：' + !!reward.character.preStoredNinthRing + ' · 魂骨数：' + reward.character.bones.length);

line('\n== 6. 恢复原普通流程 ==');
line(JSON.stringify(resolved.restore));

line('\n演示结束。本次使用测试目标；正式魂兽库已编目' + modules.beast.library.status().count + '例，魂骨特性池仍待补充。');
