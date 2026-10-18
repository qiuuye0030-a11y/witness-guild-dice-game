'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, section } = require('./lib/harness.cjs');
const { compile } = require('./build-beasts.cjs');
const { RollLog } = require('../src/rng');
const { SLOTS } = require('../src/soulbone/instance');
const { createEquipmentLedger } = require('../src/soulbone/absorption');
const { assertTraitHandlers } = require('../src/battle/equipment');
const { createHandlerRegistry } = require('../src/soulbone/handlers');
const F = require('./lib/fixtures.cjs');
const clone = (value) => JSON.parse(JSON.stringify(value));

module.exports = function beastChecks(ctx) {
  const assert = ctx.assert;
  const root = path.resolve(__dirname, '..');
  const library = ctx.modules.beast.library;
  const source = JSON.parse(fs.readFileSync(path.join(root, 'data/beast/catalog-source.json'), 'utf8'));
  section('正式魂兽七例与随机魂骨');

  test('正式库恰含用户七例，定义均可构建，红环十万年不受实际年龄影响', () => {
    assert.equal(library.status().count, 7);
    assert.deepEqual(library.status().errors, []);
    assert.deepEqual(library.list().map((b) => b.name), ['霜苔巨蛙','霜蚋','沧渊帝螈','负岳蝾螈','遮天毒鸩','金鳞镇魂螭','焚天赤烛龙']);
    assert.equal(library.definition('frost-moss-frog').species, '两栖纲·蛙类');
    for (const beast of library.available()) {
      const instance = library.buildInstance({ id: beast.id });
      assert.equal(instance.years, 100000);
      assert.equal(beast.ringReward.years, 100000);
      assert.equal(instance.hp > 0 && instance.mp > 0 && instance.sh > 0, true);
      assert.deepEqual(instance.elements, beast.elements);
      assert.equal(instance.style, beast.style);
    }
  });
  test('六维逐项只乘原文比例，血脉不额外修正，总评保持强/凶/凶', () => {
    for (const entry of source.beasts) {
      const beast = library.definition(entry.id);
      ctx.bridge.rules().KEYS.forEach((key, i) => assert.equal(beast.panel.stats[key], ctx.bridge.rules().round2(500 * entry.statRatios[i])));
      assert.equal(beast.panel.level, 91);
      assert.equal(beast.bloodline.modifiesStats, false);
      assert.equal(ctx.bridge.rating(beast.panel).label, beast.panel.rating);
    }
    assert.deepEqual(library.available().map((b) => b.panel.rating), ['强级','凶级','凶级','强级','强级','凶级','狂级']);
  });
  test('每兽恰四技且至少一个攻击技；按S分档、K1，费用调用战斗接口', () => {
    for (const beast of library.available()) {
      assert.equal(beast.skills.length, 4);
      assert.equal(beast.skills.some((s) => s.category === '攻击'), true);
      assert.equal(new Set(beast.skills.map((s) => s.id)).size, 4);
      for (const skill of beast.skills) {
        assert.equal(skill.years, beast.skillPowerBasis.years);
        assert.equal(skill.q, beast.skillPowerBasis.q);
        assert.equal(skill.K, 1);
        assert.equal(skill.Q, beast.skillPowerBasis.q);
        assert.equal(skill.operations.length, 1);
        assert.equal(skill.cost, ctx.bridge.rules().skillBudget(beast.panel, skill));
        assert.equal(skill.cast > 0 && skill.cooldown > 0, true);
      }
    }
  });
  test('主动招式符合防御/敏攻/控制风格，不把四技复制为四个魂环奖励', () => {
    const [tank, swift, control] = library.available();
    assert.equal(tank.skills.some((s) => s.category === '防御'), true);
    assert.equal(tank.skills.some((s) => s.category === '治疗'), true);
    assert.equal(swift.skills.find((s) => s.name === '雪屑掩形').agility, 0.456);
    assert.equal(swift.skills.some((s) => s.category === '持续伤害'), true);
    assert.equal(control.skills.find((s) => s.category === '攻击').channel, '能量');
    assert.equal(control.skills.some((s) => s.category === '控制'), true);
    assert.equal(control.skills.some((s) => s.category === '减益'), true);
  });
  test('两条原被动及反制保留，永久苔凝有独立持久化字段，接入标记与宿主操作一致', () => {
    const expected = [['霜苔不侵','苔甲凝积'],['冰壳护生','霜域'],['沧澜压境','吞噬回魂'],['负岳','山根透地'],['双囊之躯','弥天瘴羽'],['金气削骨','螭纹压魂'],['焚龙破甲','赤烛不焚']];
    library.available().forEach((beast, i) => {
      assert.deepEqual(beast.traits.map((t) => t.name), expected[i]);
      assert.equal(beast.implementation.hostIntegrated, true);
      assert.equal(beast.traits.every((t) => t.implementation.status === 'live' && !t.inherit.requiresHostAdapter), true);
    });
    assert.equal(library.available()[0].traits[1].params.stackLifetime, 'permanent');
    assert.deepEqual(library.available()[0].traits[1].inherit.save.fields, ['mossStacks']);
  });
  test('来源文本哈希与可重建数值完全一致，无改动原始资料', () => {
    const text = fs.readFileSync(path.resolve(root, 'reference', source.sourceFile));
    const rebuilt = compile(source, text);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'data/beast/library.json'), 'utf8')), rebuilt);
  });
  test('正式七例优先缺失部位，包含霜蚋也不生成外附骨', () => {
    for (const beast of library.available()) {
      assert.equal(beast.bone.slot, 'random');
      assert.equal(beast.bone.slotPolicy, 'prefer-unoccupied-six');
    }
  });
  function reward(beast, seed, store = {}) {
    const input = { firstWin: true, sessionId: 'beast-test:' + seed, transactionId: 'reward:' + seed, beastSnapshot: beast, character: F.characterFixture(), equipmentLedger: createEquipmentLedger(), level: 80, rng: new RollLog(seed), makeSkill: F.makeSkillStub };
    const result = ctx.modules.reward.createRunner(store).run(input);
    assert.equal(result.failedStep, null);
    return { input, result, store };
  }
  test('实际奖励按1d6均等映射部位，六槽均可出现，不因已装备部位而缩池', () => {
    const found = new Set();
    for (let seed = 0; seed < 60; seed++) {
      const { result } = reward(library.available()[seed % 3], 'six-slots-' + seed);
      const bone = result.result.bone;
      found.add(bone.base.slot);
      assert.deepEqual(bone.rolls.slot.pool, SLOTS);
      assert.equal(bone.rolls.slot.sides, 6);
      assert.equal(bone.base.slot, SLOTS[bone.rolls.slot.face - 1]);
      assert.equal(result.result.ring.skills.length, 2);
    }
    assert.equal(found.size, 6);
  });
  test('正式魂兽奖励JSON读档重放保持同一部位与继承结果，不重投骰', () => {
    const { input, result, store } = reward(library.available()[1], 'save-slot');
    const rng = new RollLog('different-seed');
    const again = ctx.modules.reward.createRunner(clone(store)).run({ ...input, rng });
    assert.deepEqual(again.result.bone, result.result.bone);
    assert.equal(rng.entries.length, 0);
    const check = assertTraitHandlers(again.equipmentLedger, createHandlerRegistry());
    assert.equal(check.ok, false, '六个正式被动尚无宿主处理器，不得假装已生效');
  });
};
