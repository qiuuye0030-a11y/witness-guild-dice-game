'use strict';

/**
 * 校验用固定数据。只存在于 tools 下，不进入 data/ 正式库：
 * 正式魂兽库与魂骨特性池保持空，等用户补充。
 */

function beastFixture(overrides = {}) {
  return {
    id: 'fixture-leviathan',
    name: '校验用十万年魂兽',
    version: 1,
    years: 100000,
    available: true,
    battleTags: ['hunt'],
    lifeType: '生活',
    panel: {
      level: 85,
      rating: '狂级',
      stats: { B: 900, S: 900, C: 900, D: 900, A: 900, P: 900, W: 90 },
      derived: { HP: 6500, MP: 5000, SH: 1000, PA: 600, SA: 600, MA: 600, DEF: 400, MDEF: 400 }
    },
    skills: [
      { id: 'fixture-skill-1', name: '潮涌', category: '攻击', channel: '能量', Q: 4.5, cost: 300, cast: 1.2, cooldown: 10, effect: '校验用' },
      { id: 'fixture-skill-2', name: '渊压', category: '控制', channel: '精神', Q: 4.5, cost: 260, cast: 1, cooldown: 14, effect: '校验用' }
    ],
    traits: [
      { id: 'fixture-tide', name: '潮汐', effect: '校验用特性一', inherit: { handler: 'inherit-fixture-tide', implementationVersion: 1, params: { rate: 0.1 } } },
      { id: 'fixture-abyss', name: '深渊', effect: '校验用特性二', inherit: { handler: 'inherit-fixture-abyss', implementationVersion: 1, params: {} } }
    ],
    traitInheritanceVersion: 1,
    ringReward: { years: 100000, description: '校验用十万年魂环' },
    bone: { slot: '躯干', description: '校验用魂骨部位规则' },
    battleText: '校验用战斗文本',
    defeatText: '校验用败北文本',
    exitRule: 'hp-zero',
    ...overrides
  };
}

function characterFixture(overrides = {}) {
  const rings = Array.from({ length: 8 }, (_, i) => ({ index: i + 1, years: [420, 760, 1700, 4800, 11500, 19000, 48000, 88000][i], skills: [{ name: '旧技', category: '攻击' }] }));
  const six = { B: 700, S: 700, C: 700, D: 700, A: 700, P: 700, W: 70 };
  return {
    name: '校验用见证者',
    level: 80,
    style: '强攻',
    release: '附体',
    soul: {
      id: 'fixture-soul',
      name: '校验武魂',
      tier: 8,
      main_kind: '兽',
      subkind: '战斗',
      attribute: '火',
      elements: ['火'],
      mechanisms: [],
      spirit_specialist: false,
      balance: [0, 0, 0, 0, 0, 0]
    },
    // 与主游戏一致：character.stats 是 buildStats 生成的模型（含 stats/derived），不是裸六维。
    stats: {
      level: 80,
      rings: 7,
      benchmark: 381,
      stats: { ...six },
      derived: { HP: 4000, baseMP: 3000, MP: 3000, SH: 800, PA: 500, SA: 500, MA: 500, DEF: 350, MDEF: 350, costReduction: 50, castReduction: 30, controlGrowth: 2 }
    },
    rings,
    bones: [],
    inventory: [],
    growth: { B: 12, S: 8, C: 4, D: 2, A: 6, P: 3, W: 1 },
    ...overrides
  };
}

function makeSkillStub(args) {
  const body = args.stats && args.stats.stats ? args.stats.stats.B : 700;
  return {
    name: args.soul.name + '·' + args.category,
    category: args.category,
    channel: '能量',
    target: '一名敌人',
    Q: 4.5,
    cost: args.index === 9 ? Math.round(body / 2) : 300,
    cast: 1.2,
    cooldown: 10,
    ring: args.index,
    years: args.years,
    effect: '校验用生成魂技',
    variant: args.variant || 0,
    effectSeed: args.effectSeed
  };
}

function traitPoolData(overrides = {}) {
  return {
    schemaVersion: 1,
    poolVersion: 1,
    traits: [
      {
        id: 'fixture-trait-a',
        name: '校验特性甲',
        effect: '校验用效果甲',
        years: [10000, 100000],
        slots: ['躯干', '头部'],
        weight: 1,
        handler: 'fixture-handler-a',
        implementationVersion: 1,
        params: { amount: 5 },
        stackGroup: 'fixture-group-a',
        maxStacks: 1
      },
      {
        id: 'fixture-trait-b',
        name: '校验特性乙',
        effect: '校验用效果乙',
        years: [10000, 100000],
        slots: ['躯干', '头部'],
        weight: 1,
        handler: 'fixture-handler-b',
        implementationVersion: 1,
        params: {},
        stackGroup: 'fixture-group-b',
        maxStacks: 1
      }
    ],
    ...overrides
  };
}

module.exports = { beastFixture, characterFixture, makeSkillStub, traitPoolData };
