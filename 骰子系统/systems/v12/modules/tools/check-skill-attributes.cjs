'use strict';

const { test, section } = require('./lib/harness.cjs');
const { attributeTags, tagSkill, tagUnitSkills, tagCharacterSkills } = require('../src/battle/skill-attributes');
const F = require('./lib/fixtures.cjs');
const { RollLog } = require('../src/rng');

module.exports = function skillAttributeChecks(ctx) {
  const assert = ctx.assert;
  section('武魂与魂技属性标签');
  test('单属性、复合属性、去重与无属性保持统一口径', () => {
    assert.deepEqual(attributeTags({ attribute: '火' }), ['火']);
    assert.deepEqual(attributeTags({ elements: ['木', '冰', '木'] }), ['木', '冰']);
    assert.deepEqual(attributeTags({ attribute: '复合·木／冰' }), ['木', '冰']);
    for (const source of [null, {}, { attribute: '无' }, { attribute: '无属性' }, { elements: [] }]) assert.deepEqual(attributeTags(source), ['无']);
  });
  test('无属性分类与机制词分离，程良魔方不会因空间机制被误写成元素', () => {
    const soul = ctx.roster.combatSpec('chengliang').soul;
    assert.deepEqual(attributeTags(soul), ['无']);
    assert.deepEqual(attributeTags({ attribute_category: '无属性', attribute: '空间', mechanisms: ['空间'] }), ['无']);
  });
  test('技能属性与物理/能量/精神通道独立；只补标签不改原数值', () => {
    const original = { name: '一击', channel: '物理', cost: 99, Q: 2.8, cast: 1, cooldown: 8, effect: '原文' };
    const tagged = tagSkill(original, { attribute: '冰' });
    assert.equal(tagged.attribute, '冰');
    assert.equal(tagged.channel, '物理');
    for (const [key, value] of Object.entries(original)) assert.deepEqual(tagged[key], value);
    assert.equal(original.attribute, undefined);
    assert.deepEqual(tagSkill(tagged, { attribute: '冰' }), tagged);
  });
  test('三例全部十二技能继承所属魂兽属性，操作参数与技能标签一致', () => {
    for (const beast of ctx.modules.beast.library.available()) for (const skill of beast.skills) {
      assert.deepEqual(skill.attributeTags, beast.elements);
      assert.equal(skill.attribute, beast.elements.join('／'));
      assert.deepEqual(skill.operations[0].elements, beast.elements);
    }
  });
  test('桥接生成与NPC八技转换都携带标签，保留原始名录快照', () => {
    const character = F.characterFixture();
    const skill = ctx.modules.bridge.makeSkill({ soul: character.soul, style: character.style, stats: character.stats, index: 1, years: 10000, category: '攻击', npcTemplate: true });
    assert.equal(skill.attribute, '火');
    for (const id of ['chengliang', 'xutaiping', 'sailiya_fengzhi']) {
      const definition = ctx.roster.combatSpec(id);
      const unit = ctx.modules.npc.buildUnit({ definition, id: 'ally:' + id, team: 0 });
      for (const converted of unit.skills) assert.deepEqual(converted.attributeTags, attributeTags(definition.soul));
    }
  });
  test('预留九环与吸收重算都继承当前武魂，类别与数值种子不重抽', () => {
    const { createHundredThousandRing, rehydrateHundredThousandRing } = require('../src/reward/ring');
    const character = F.characterFixture();
    const ring = createHundredThousandRing({ character, seed: 'attribute-ring', rng: new RollLog('attribute-ring'), makeSkill: F.makeSkillStub, transactionId: 'attribute-ring' });
    assert.equal(ring.skills.every((s) => s.attribute === '火'), true);
    character.soul = { ...character.soul, attribute: '木／冰', elements: ['木', '冰'] };
    const refreshed = rehydrateHundredThousandRing({ ring, character, makeSkill: F.makeSkillStub });
    refreshed.skills.forEach((s, i) => {
      assert.equal(s.attribute, '木／冰');
      assert.equal(s.category, ring.skills[i].category);
      assert.equal(s.effectSeed, ring.skills[i].effectSeed);
    });
  });
  test('旧档技能刷新覆盖旧标签，不改变成长、费用与技能内容；预留环同步刷新', () => {
    const character = F.characterFixture();
    character.preStoredNinthRing = { skills: [{ name: '旧预留', attribute: '水', cost: 123 }] };
    const next = tagCharacterSkills(character);
    assert.equal(next.rings.every((r) => r.skills.every((s) => s.attribute === '火')), true);
    assert.equal(next.preStoredNinthRing.skills[0].attribute, '火');
    assert.equal(next.preStoredNinthRing.skills[0].cost, 123);
    assert.deepEqual(next.growth, character.growth);
    assert.equal(character.preStoredNinthRing.skills[0].attribute, '水');
    assert.equal(tagUnitSkills({ elements: ['水'], skills: [{}] }).skills[0].attribute, '水');
  });
};
