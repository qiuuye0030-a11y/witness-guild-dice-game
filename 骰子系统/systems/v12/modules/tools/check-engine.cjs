'use strict';

const { test, section } = require('./lib/harness.cjs');
const F = require('./lib/fixtures.cjs');
const { createHundredThousandRing } = require('../src/reward/ring');
const { RollLog } = require('../src/rng');
const sailiyaTrait = require('../src/npc/traits/sailiya');

module.exports = function engineChecks(ctx) {
  const bridge = ctx.bridge;
  const R = bridge.rules();
  const conditions = ctx.modules.hunt.conditions;

  section('调用 v11.01 现有战斗/规则代码（不是本包另写的数值）');

  test('接入的是已移除魂性谱随机特性的“武魂精简版”基线', () => {
    const baseline = bridge.baseline();
    ctx.assert.equal(baseline.hasRandomSoulTraitRuntime, false, '基线仍带随机武魂特性运行时：' + baseline.dir);
    ctx.assert.equal(baseline.hasBattle, true);
    ctx.assert.equal(baseline.hasRoleChallenge, true, '会长/伤疤女等独立角色机制入口应保留');
    ctx.assert.equal(baseline.rulesVersion, 11);
    ctx.assert.equal(baseline.ratingRulesVersion, 2);
    ctx.assert.equal(typeof globalThis.WitnessTraitRuntime, 'undefined', '本包不得重新注册旧随机特性运行时');
  });

  test('评级接口为现行规则版本，且带门槛版本', () => {
    ctx.assert.equal(R.calculationVersion, 11);
    ctx.assert.equal(R.ratingRulesVersion, 2);
    const sample = R.rating({ level: 81, stats: ctx.roster.combatSpec('chengliang').stats, rings: 8, ratingProfile: 'npc' });
    ctx.assert.equal(sample.thresholds.version, 2);
    ctx.assert.equal(sample.label, '狂级');
  });

  test('三位NPC评级与名录记录一致（狂级/强级/强级）', () => {
    for (const id of ['chengliang', 'xutaiping', 'sailiya_fengzhi']) {
      const definition = ctx.roster.combatSpec(id);
      const rating = bridge.rating({ level: definition.level, stats: definition.stats, rings: definition.model.rings, ratingProfile: 'npc' });
      ctx.assert.equal(rating.label, definition.rating, id);
    }
  });

  test('派生值由战斗侧 derive 复算，与名录记录一致', () => {
    for (const id of ['chengliang', 'xutaiping', 'sailiya_fengzhi']) {
      const definition = ctx.roster.combatSpec(id);
      const derived = bridge.derive(definition.stats);
      for (const key of Object.keys(derived)) {
        if (id === 'sailiya_fengzhi' && key === 'MP') continue; // 赛利亚上限已含秘元+50%，单独核对
        ctx.assert.equal(derived[key], definition.derived[key], id + '.' + key);
      }
    }
  });

  test('赛利亚魂力上限50%只施加一次，baseMP仍是费用基数', () => {
    const definition = ctx.roster.combatSpec('sailiya_fengzhi');
    const engine = bridge.derive(definition.stats);
    ctx.assert.equal(sailiyaTrait.effectiveMaxMP(engine.MP), definition.derived.MP);
    ctx.assert.equal(definition.model.derived.baseMP, engine.baseMP);
  });

  test('魂环分档：99999年为万年、100000年为十万年，精确整数区分', () => {
    ctx.assert.equal(R.BANDS[R.band(99999)], '万年');
    ctx.assert.equal(R.BANDS[R.band(100000)], '十万年');
    ctx.assert.equal(R.CAPS[8], 100000);
  });

  test('控制结算公式与战斗侧一致：基础时长按精神力比例', () => {
    const attacker = { P: 859.56, W: 80 };
    const defender = { P: 500, W: 70 };
    const result = R.controlEffect(2.97, attacker, defender);
    ctx.assert.equal(result.ratio, R.round2((100 + attacker.P) / (100 + defender.P)));
    ctx.assert.equal(result.immunity, 4);
  });

  test('十万年魂环两技由战斗侧 makeSkill 真实生成并共享冷却', () => {
    const character = F.characterFixture({ level: 90 });
    const ring = createHundredThousandRing({
      character,
      seed: 'engine-ring',
      rng: new RollLog('engine-ring'),
      makeSkill: bridge.makeSkill,
      pickCategory: bridge.pickCategory,
      transactionId: 'engine-tx'
    });
    ctx.assert.equal(ring.skills.length, 2);
    ctx.assert.notEqual(ring.skills[0].category, ring.skills[1].category);
    for (const skill of ring.skills) {
      ctx.assert.equal(skill.years, 100000);
      ctx.assert.equal(skill.ring, 9);
      ctx.assert.equal(skill.sharedCooldown, 'ring-9');
      ctx.assert.ok(Number.isFinite(skill.cost) && skill.cost > 0, '费用须为战斗侧实数');
      ctx.assert.ok(Number.isFinite(skill.cast) && skill.cast >= 0.5, '读条须符合引擎下限');
      ctx.assert.ok(Number.isFinite(skill.cooldown) && skill.cooldown > 0);
      ctx.assert.equal(skill.Q, R.round2(R.QS[R.band(100000)] * (1 + 0.15 * (character.soul.tier - 1))));
    }
  });

  test('用真实评级驱动固定触发：80级狂级触发、80级强级触发、79级狂级不触发', () => {
    const chengliang = ctx.roster.combatSpec('chengliang');
    const xutaiping = ctx.roster.combatSpec('xutaiping');
    const at80 = (stats) => ({ level: 80, stats, rings: 8 });
    const crazy = conditions.evaluateCondition({ level: 80, model: at80(chengliang.stats), ratingFn: bridge.rating });
    ctx.assert.equal(crazy.rating.label, '狂级');
    ctx.assert.equal(crazy.eligible, true);
    const strong = conditions.evaluateCondition({ level: 80, model: at80(xutaiping.stats), ratingFn: bridge.rating });
    ctx.assert.equal(strong.rating.label, '强级');
    ctx.assert.equal(strong.eligible, true);
    ctx.assert.equal(strong.reason, 'eligible');
    const under = conditions.evaluateCondition({ level: 79, model: { level: 79, stats: chengliang.stats, rings: 7 }, ratingFn: bridge.rating });
    ctx.assert.equal(under.rating.label, '狂级');
    ctx.assert.equal(under.eligible, false);
    ctx.assert.equal(under.reason, 'level-below-80');
  });

  test('NPC八技费用/读条/冷却都是战斗侧可用实数，且不按玩家等级重算', () => {
    for (const id of ['chengliang', 'xutaiping', 'sailiya_fengzhi']) {
      const definition = ctx.roster.combatSpec(id);
      for (const skill of definition.skills) {
        ctx.assert.ok(Number.isInteger(skill.cost) && skill.cost > 0, id + ' ' + skill.name + ' 费用');
        ctx.assert.ok(Number.isFinite(skill.cast) && skill.cast >= 0.5, id + ' ' + skill.name + ' 读条');
        ctx.assert.ok(Number.isFinite(skill.cooldown) && skill.cooldown > 0, id + ' ' + skill.name + ' 冷却');
        ctx.assert.equal(skill.Q, R.round2(skill.q * skill.K));
      }
    }
  });
};
