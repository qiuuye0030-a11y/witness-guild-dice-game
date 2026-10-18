'use strict';

const { test, section } = require('./lib/harness.cjs');
const { RollLog } = require('../src/rng');

function stubRng(face) {
  return { die: () => face, entries: [] };
}

function model(level, stats) {
  return { level, stats, rings: Math.floor(Math.max(0, level - 1) / 10) };
}

function ratingFn(label) {
  return () => ({ label, score: 1.5, thresholds: { version: 2, crazy: 1.75, divine: 2.1 } });
}

module.exports = function numberChecks(ctx) {
  const drop = ctx.modules.soulbone.drop;
  const inheritance = ctx.modules.reward.inheritance;
  const conditions = ctx.modules.hunt.conditions;
  const ledgerApi = ctx.modules.hunt.ledger;
  const allies = ctx.modules.hunt.allies;

  section('万年魂骨掉落骰（交接文档10.2）');

  test('十档阈值与文档表格逐行一致', () => {
    const expected = [100, 256, 411, 567, 722, 878, 1033, 1189, 1344, 1500];
    const table = drop.probabilityTable();
    ctx.assert.equal(table.length, 10);
    for (let i = 0; i < 10; i++) {
      ctx.assert.equal(table[i].luck, i + 1);
      ctx.assert.equal(table[i].threshold, expected[i], '气运' + (i + 1));
      ctx.assert.equal(drop.thresholdForLuck(i + 1), expected[i]);
    }
  });

  test('十档阈值单调递增', () => {
    for (let luck = 2; luck <= 10; luck++) ctx.assert.ok(drop.thresholdForLuck(luck) > drop.thresholdForLuck(luck - 1));
  });

  test('逐点枚举10000个骰面，每档成功数精确等于阈值', () => {
    for (let luck = 1; luck <= 10; luck++) {
      const threshold = drop.thresholdForLuck(luck);
      let success = 0;
      for (let face = 1; face <= 10000; face++) if (face <= threshold) success++;
      ctx.assert.equal(success, threshold, '气运' + luck);
    }
  });

  test('气运1：100成功、101失败；气运10：1500成功、1501失败', () => {
    const one = (face) => drop.rollBoneDrop({ acquisitionId: 'a' + face, years: 10000, luck: 1, rng: stubRng(face) }).dropped;
    ctx.assert.equal(one(100), true);
    ctx.assert.equal(one(101), false);
    const ten = (face) => drop.rollBoneDrop({ acquisitionId: 'b' + face, years: 99999, luck: 10, rng: stubRng(face) }).dropped;
    ctx.assert.equal(ten(1500), true);
    ctx.assert.equal(ten(1501), false);
  });

  test('年限边界：十年/百年/千年/9999不投；10000与99999投；100000走专门来源', () => {
    for (const years of [10, 100, 1000, 9999]) {
      const result = drop.rollBoneDrop({ acquisitionId: 'y' + years, years, luck: 10, rng: stubRng(1) });
      ctx.assert.equal(result.skipped, true);
      ctx.assert.equal(result.dropped, false);
      ctx.assert.equal(result.eligible, false);
    }
    ctx.assert.equal(drop.rollBoneDrop({ acquisitionId: 'y10000', years: 10000, luck: 1, rng: stubRng(1) }).eligible, true);
    ctx.assert.equal(drop.rollBoneDrop({ acquisitionId: 'y99999', years: 99999, luck: 1, rng: stubRng(1) }).eligible, true);
    const hundred = drop.rollBoneDrop({ acquisitionId: 'y100000', years: 100000, luck: 10, rng: stubRng(1) });
    ctx.assert.equal(hundred.skipped, true);
    ctx.assert.equal(hundred.reason, 'hundred-thousand-uses-hunt-source');
  });

  test('同一 huntAcquisitionId 只结算一次，重复调用不重投', () => {
    const store = {};
    const rng = new RollLog('sel1');
    const first = drop.settleBoneDrop(store, { acquisitionId: 'acq-1', years: 20000, luck: 5, rng });
    const rollsAfterFirst = rng.entries.length;
    const second = drop.settleBoneDrop(store, { acquisitionId: 'acq-1', years: 20000, luck: 5, rng });
    ctx.assert.equal(rng.entries.length, rollsAfterFirst);
    ctx.assert.equal(second.duplicate, true);
    ctx.assert.equal(second.face, first.face);
    ctx.assert.equal(store.settlements['acq-1'].face, first.face);
  });

  test('预检不投骰、不消耗序列', () => {
    const rng = new RollLog('sel2');
    drop.inspect({ years: 50000, luck: 7 });
    ctx.assert.equal(rng.entries.length, 0);
  });

  test('最终成果ID稳定：同一结果重复结算不重投，放弃后重猎是新成果', () => {
    const ring = { index: 5, years: 20000, skills: [{ category: '攻击' }] };
    const a = drop.huntAcquisitionId({ seed: 's', characterName: '甲', ringIndex: 5, years: 20000, attempt: 1 });
    const b = drop.huntAcquisitionId({ seed: 's', characterName: '甲', ringIndex: 5, years: 20000, attempt: 1 });
    const c = drop.huntAcquisitionId({ seed: 's', characterName: '甲', ringIndex: 5, years: 20000, attempt: 2 });
    ctx.assert.equal(a, b);
    ctx.assert.notEqual(a, c);
    const store = {};
    const rng = new RollLog('acq');
    const first = drop.settleConfirmedHunt({ store, ring, seed: 's', characterName: '甲', attempt: 1, luck: 10, rng });
    const rolls = rng.entries.length;
    const again = drop.settleConfirmedHunt({ store, ring, seed: 's', characterName: '甲', attempt: 1, luck: 10, rng });
    ctx.assert.equal(rng.entries.length, rolls);
    ctx.assert.equal(again.duplicate, true);
    ctx.assert.equal(first.acquisitionId, a);
    const reroll = drop.settleConfirmedHunt({ store, ring, seed: 's', characterName: '甲', attempt: 2, luck: 10, rng });
    ctx.assert.equal(reroll.duplicate, false);
    ctx.assert.equal(reroll.acquisitionId, c);
    ctx.assert.throws(() => drop.settleConfirmedHunt({ store, ring: { index: 5, years: 20000, skills: [] }, luck: 10, rng }), /最终确认/);
  });

  section('十万年继承骰（交接文档第十三节）');

  test('1—25全部、26—100一条', () => {
    const traits = [{ id: 't1' }, { id: 't2' }];
    ctx.assert.equal(inheritance.rollInheritance({ traits, rng: stubRng(1) }).mode, 'all');
    ctx.assert.equal(inheritance.rollInheritance({ traits, rng: stubRng(25) }).mode, 'all');
    ctx.assert.equal(inheritance.rollInheritance({ traits, rng: stubRng(26) }).mode, 'one');
    ctx.assert.equal(inheritance.rollInheritance({ traits, rng: stubRng(100) }).mode, 'one');
  });

  test('全部继承时选中全部特性；一条时只选一条', () => {
    const traits = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
    ctx.assert.deepEqual(inheritance.rollInheritance({ traits, rng: stubRng(1) }).selectedTraitIds, ['t1', 't2', 't3']);
    const one = inheritance.rollInheritance({ traits, rng: stubRng(50) });
    ctx.assert.equal(one.selectedTraitIds.length, 1);
  });

  test('同种子结果可复现', () => {
    const traits = [{ id: 't1' }, { id: 't2' }];
    const a = inheritance.rollInheritance({ traits, rng: new RollLog('inherit-seed') });
    const b = inheritance.rollInheritance({ traits, rng: new RollLog('inherit-seed') });
    ctx.assert.deepEqual(a.selectedTraitIds, b.selectedTraitIds);
    ctx.assert.equal(a.face, b.face);
  });

  test('两条特性时全部25%、各单独继承37.5%（4000次抽样）', () => {
    const traits = [{ id: 't1' }, { id: 't2' }];
    const rng = new RollLog('inherit-dist');
    let all = 0;
    let one = 0;
    const included = { t1: 0, t2: 0 };
    const oneOnly = { t1: 0, t2: 0 };
    for (let i = 0; i < 4000; i++) {
      const result = inheritance.rollInheritance({ traits, rng });
      if (result.mode === 'all') all++;
      else {
        one++;
        oneOnly[result.selectedTraitIds[0]]++;
      }
      for (const id of result.selectedTraitIds) included[id]++;
    }
    ctx.assert.ok(Math.abs(all / 4000 - 0.25) < 0.03, '全部继承比例 ' + all / 4000);
    ctx.assert.ok(Math.abs(one / 4000 - 0.75) < 0.03, '一条继承比例 ' + one / 4000);
    // “各单独继承结果37.5%”指只走一条分支时被选中的概率。
    ctx.assert.ok(Math.abs(oneOnly.t1 / 4000 - 0.375) < 0.03, 't1单独 ' + oneOnly.t1 / 4000);
    ctx.assert.ok(Math.abs(oneOnly.t2 / 4000 - 0.375) < 0.03, 't2单独 ' + oneOnly.t2 / 4000);
    // 计入“全部继承”后，每条特性被包含的概率为25% + 37.5% = 62.5%。
    ctx.assert.ok(Math.abs(included.t1 / 4000 - 0.625) < 0.03, 't1被包含 ' + included.t1 / 4000);
  });

  yearExactness(ctx);

  section('家境判定友方NPC（交接文档第五节）');

  test('1—2档无援军且不投概率骰', () => {
    for (let rank = 1; rank <= 2; rank++) {
      const rng = new RollLog('rank' + rank);
      const result = allies.ensureAllies({ originRank: rank, roster: ctx.roster, rng });
      ctx.assert.equal(result.count, 0);
      ctx.assert.equal(result.npcIds.length, 0);
      ctx.assert.equal(result.rolls.length, 0);
      ctx.assert.equal(rng.entries.length, 0);
    }
  });

  test('6—7档必1位、8—9档必2位、10档必3位且不投是否到场骰', () => {
    for (const rank of [6,7,8,9]) {
      const rng = new RollLog('must' + rank);
      const result = allies.ensureAllies({ originRank: rank, roster: ctx.roster, rng });
      ctx.assert.equal(result.count,rank>=8?2:1);
      ctx.assert.equal(result.rolls.filter((roll) => roll.sides === 100).length, 0);
    }
    const rng = new RollLog('must10');
    const ten = allies.ensureAllies({ originRank: 10, roster: ctx.roster, rng });
    ctx.assert.equal(ten.count, 3);
    ctx.assert.equal(new Set(ten.npcIds).size, 3);
    ctx.assert.equal(ten.rolls.filter((roll) => roll.sides === 100).length, 0);
  });

  test('3档约25%、4档约50%、5档约75%（各2000次）', () => {
    for (const [rank, expected] of [[3,.25],[4,.5],[5,.75]]) {
      const rng = new RollLog('prob' + rank);
      let attended = 0;
      for (let i = 0; i < 2000; i++) if (allies.ensureAllies({ originRank: rank, roster: ctx.roster, rng }).count === 1) attended++;
      ctx.assert.ok(Math.abs(attended / 2000 - expected) < 0.04, rank + '档到场率 ' + attended / 2000);
    }
  });

  test('已落盘的阵容不重抽，刷新/读档沿用原队友', () => {
    const rng = new RollLog('persist');
    const first = allies.ensureAllies({ originRank: 10, roster: ctx.roster, rng });
    const rollsAfter = rng.entries.length;
    const again = allies.ensureAllies({ originRank: 10, roster: ctx.roster, rng, existing: first });
    ctx.assert.deepEqual(again.npcIds, first.npcIds);
    ctx.assert.equal(rng.entries.length, rollsAfter);
  });

  section('固定触发条件（交接文档第三节）');

  test('79级神级不触发', () => {
    const result = conditions.evaluateCondition({ level: 79, model: model(79, {}), ratingFn: ratingFn('神级') });
    ctx.assert.equal(result.eligible, false);
    ctx.assert.equal(result.reason, 'level-below-80');
  });

  test('80级强级触发；80级凶/狂/神触发', () => {
    const strong = conditions.evaluateCondition({ level: 80, model: model(80, {}), ratingFn: ratingFn('强级') });
    ctx.assert.equal(strong.eligible, true);
    ctx.assert.equal(strong.reason, 'eligible');
    for (const label of ['凶级', '狂级', '神级']) {
      const result = conditions.evaluateCondition({ level: 80, model: model(80, {}), ratingFn: ratingFn(label) });
      ctx.assert.equal(result.eligible, true, label);
      ctx.assert.equal(result.checks.rating, true);
    }
  });

  test('触发条件不投概率骰，也不进入普通事件权重池', () => {
    const result = conditions.evaluateCondition({ level: 80, model: model(80, {}), ratingFn: ratingFn('凶级') });
    ctx.assert.equal(result.randomTriggerRoll, null);
    ctx.assert.equal(result.weightPool, null);
  });

  test('已处理/已拒绝后不再触发', () => {
    let ledger = ledgerApi.createLedger();
    ledger = ledgerApi.registerPending(ledger, { level: 80, rating: '凶级' }).ledger;
    ledger = ledgerApi.presentInvitation(ledger, 'k1');
    ledger = ledgerApi.refuse(ledger);
    const result = conditions.evaluateCondition({ level: 85, model: model(85, {}), ratingFn: ratingFn('神级'), ledger });
    ctx.assert.equal(result.eligible, false);
    ctx.assert.equal(result.reason, 'already-handled');
  });

  test('评级接口必须返回带门槛版本的现行结果（防显示文字/历史高水位冒充）', () => {
    ctx.assert.throws(
      () => conditions.evaluateCondition({ level: 80, model: model(80, {}), ratingFn: () => ({ label: '凶级' }) }),
      /门槛版本/
    );
    ctx.assert.throws(() => conditions.evaluateCondition({ level: 80, model: model(80, {}), ratingFn: () => ({ label: '神仙级', thresholds: { version: 2 } }) }), /评级名称无效/);
    ctx.assert.throws(() => conditions.evaluateCondition({ level: 80, model: null, ratingFn: ratingFn('凶级') }), /实际基础面板/);
  });
};

function yearExactness(ctx) {
  section('年限与十万年边界');
  test('第八环最高99999年为万年，100000年才是十万年', () => {
    const R = ctx.bridge.rules();
    ctx.assert.equal(R.BANDS[R.band(99999)], '万年');
    ctx.assert.equal(R.BANDS[R.band(100000)], '十万年');
    ctx.assert.notEqual(R.band(99999), R.band(100000));
  });
}
