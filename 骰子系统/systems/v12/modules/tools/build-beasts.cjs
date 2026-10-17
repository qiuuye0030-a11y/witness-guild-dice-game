'use strict';

// 编目输入与数值生成分离。改catalog-source.json后运行本脚本更新library.json。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bridge = require('../src/bridge/v1101');
const { validateBeast } = require('../src/beast/library');
const { tagSkill } = require('../src/battle/skill-attributes');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'data/beast/catalog-source.json');
const OUTPUT = path.join(ROOT, 'data/beast/library.json');

function compileSkill(beast, plan, index, panel, source, R) {
  const energy = beast.style === '控制';
  // 魂兽不套用武魂潜力/血脉倍率；tier1仅用于调用现有接口得到K=1。
  const proxy = { name: beast.name, tier: 1, main_kind: energy ? '特殊' : '兽', subkind: energy ? '元素' : '战斗', spirit_specialist: false };
  const skill = R.makeSkill({ soul: proxy, style: beast.style, stats: panel, index: index + 1, years: source.skillYears, category: plan.category, npcTemplate: true });
  const rate = (value) => Math.round(value * 10000) / 10000;
  // 模板入口禁用随机攻击/控制变体，避免正文写单击而实际变成持续伤害。
  skill.category = plan.category;
  const Q = skill.Q;
  const operation = {
    攻击: { type: 'direct_attack', channel: skill.channel, factor: 1.2, element: plan.element },
    防御: { type: 'shield', channel: '生命', coefficient: 0.45, power: 'Q*SA', ttlSeconds: 8 },
    治疗: { type: 'heal', channel: '生命', coefficient: 0.40, power: 'Q*SA', target: 'self', allowOverheal: false },
    控制: { type: 'control_contest', baseSeconds: Math.min(3, 1 + 0.5 * Q), interrupt: true, immunitySeconds: 4 },
    强化: { type: 'battle_stat_up', values: { [plan.buffField || 'A']: rate(0.12 * Q) }, lifetime: 'battle', sameSourcePolicy: 'refresh-not-stack', refillResources: false },
    减益: { type: 'numeric_debuff', values: { [plan.debuffField || 'D']: rate(0.10 * Q) }, ttlSeconds: 6, sameSourcePolicy: 'refresh-not-stack', contest: 'spirit-and-stability' },
    持续伤害: { type: 'periodic_attack', channel: skill.channel, factor: 1.4, parts: 3, intervalSeconds: 3, element: plan.element, sameSourcePolicy: 'refresh-not-stack' }
  }[plan.category];
  if (!operation) throw new Error('未支持的魂兽魂技类别：' + plan.category);
  const target = ['防御', '治疗', '强化'].includes(plan.category) ? '自己' : '一名敌人';
  let effect = skill.effect;
  if (plan.category === '强化') effect = '自身敏捷提高' + R.round2(0.12 * Q * 100) + '%，持续整场，同技能不叠加';
  if (plan.category === '减益') effect = '目标敏捷降低' + R.round2(0.10 * Q * 100) + '%，持续6秒；按双方精神力与稳定进行减益判定';
  const result = {
    ...skill, id: beast.id + '-skill-' + (index + 1), name: plan.name, target,
    skillIndex: index + 1, element: plan.element, description: plan.description, effect,
    factor: 1, budgetFactor: 1, cooldownGroup: beast.id + ':skill:' + (index + 1),
    strengthReference: { years: source.skillYears, band: '万年最低档', q: skill.q, K: 1, Q, bloodlineMultiplier: false },
    operations: [operation]
  };
  if (plan.category === '控制') result.baseControl = operation.baseSeconds;
  if (plan.category === '强化') {
    result.agility = rate(0.12 * Q);
  }
  result.cost = R.skillBudget(panel, result);
  result.previewCost = result.cost;
  result.previewCast = result.cast;
  const tagged = tagSkill(result, beast);
  for (const op of tagged.operations) {
    op.element = tagged.attribute;
    op.elements = tagged.elements.slice();
  }
  return tagged;
}

function compile(source, sourceText, R = bridge.rules()) {
  const standard = R.benchmark(source.baselineLevel);
  const definitions = source.beasts.map((entry) => {
    if (entry.statRatios.length !== 6 || entry.skills.length !== 4 || !entry.skills.some((s) => s.category === '攻击')) throw new Error(entry.name + ' 必须具备六维比例、四技及至少一个攻击技');
    const stats = Object.fromEntries(R.KEYS.map((key, i) => [key, R.round2(standard.base * entry.statRatios[i])]));
    stats.W = standard.stability;
    const panel = { level: source.baselineLevel, rings: standard.rings, benchmark: standard.base, ratingProfile: 'npc', stats, derived: R.derive(stats) };
    const rating = R.rating(panel);
    panel.rating = rating.label;
    panel.ratingScore = rating.score;
    const traits = entry.traits.map((trait) => ({
      ...trait,
      implementation: { status: 'spec-only', handler: 'beast:' + trait.id, version: 1, requiresHostAdapter: true },
      inherit: {
        handler: 'inherit:' + trait.id, implementationVersion: 1,
        name: trait.name, effect: trait.effect,
        params: { ...trait.params, sourceOwner: 'equipped-bone-owner' },
        implementationStatus: 'spec-only', requiresHostAdapter: true,
        save: { schemaVersion: 1, fields: trait.params.saveFields || [] }
      }
    }));
    const beast = {
      ...entry, years: 100000, available: true, battleTags: ['hunt'], lifeType: '生活',
      level: source.baselineLevel, panel,
      statBasis: { level: source.baselineLevel, benchmark: standard.base, W: standard.stability, ratios: entry.statRatios, bloodlineModifiesStats: false, note: source.baselineNote },
      skills: entry.skills.map((plan, index) => compileSkill(entry, plan, index, panel, source, R)),
      traits, traitInheritanceVersion: 1,
      ringReward: { years: 100000, description: '十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技' },
      bone: { slot: 'random', slotPolicy: 'uniform-six', description: '胜利后从六个常规部位等概率抽取一次，不采用原表部位，不生成外附骨；抽中结果随奖励事务保存' },
      exitRule: 'hp-or-spirit-zero',
      implementation: { status: 'catalogued', hostIntegrated: false, skills: 'operations-spec', traits: 'spec-only', inheritanceHandlers: 'spec-only' }
    };
    validateBeast(beast);
    return beast;
  });
  return JSON.parse(JSON.stringify({
    schemaVersion: 1, libraryVersion: source.libraryVersion,
    note: '三例正式魂兽资料已编目；四个主动技能统一最低万年档。available表示可选取定义，实际战斗与六条被动/继承处理器仍需宿主实现，不能将编目完成视作实战接入完成。',
    source: { file: source.sourceFile, sha256: crypto.createHash('sha256').update(sourceText).digest('hex'), rulesVersion: R.calculationVersion, ratingRulesVersion: R.ratingRulesVersion, skillYears: source.skillYears, generatedBy: 'tools/build-beasts.cjs' },
    beasts: definitions
  }));
}

if (require.main === module) {
  const source = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const text = fs.readFileSync(path.resolve(ROOT, 'reference', source.sourceFile));
  const result = compile(source, text);
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + '\n', 'utf8');
  const doc = [
    '# 十万年魂兽库 · 三例', '',
    '来源：用户《魂兽资料_三例.txt》。保留原六维比例、血脉和两条被动；本次补齐四个主动技能。', '',
    '暂用91级、基准500换算六维，血脉不修正面板。十万年是修为；实际年龄不改变魂环年限。', '',
    '全部主动技能以10000年最低万年档生成，q＝Q＝2.8、K＝1。费用、读条、冷却采用战斗规则接口；不套用武魂潜力倍率。魂技标签继承魂兽全部属性。', '',
    '魂骨胜利后以1d6在头部、躯干、左臂、右臂、左腿、右腿中等概率抽一次，每部位1/6；包括霜蚋，均不再采用原表指定部位或外附骨。结果随奖励事务保存，重开不重抽。', '',
    '**状态：已编目，未接入主游戏。六条被动与魂骨继承处理器目前保存为效果和参数规范，尚不能视为实战生效。**', ''
  ];
  for (const beast of result.beasts) {
    doc.push('## ' + beast.name, '',
      beast.elements.join('／') + '｜' + beast.style + '｜' + beast.panel.ratingScore + ' ' + beast.panel.rating + '｜' + beast.bloodline.name, '',
      '六维：' + Object.entries(beast.panel.stats).map(([key, value]) => key + ' ' + value).join('；') + '。', '',
      '| 魂技 | 类型 | 属性 | 效果 | 魂力消耗 | 读条／冷却 |', '|---|---|---|---|---:|---|');
    for (const skill of beast.skills) doc.push('| ' + [skill.name, skill.category, skill.attribute, skill.description + ' ' + skill.effect, skill.cost, skill.cast + '秒／' + skill.cooldown + '秒'].join(' | ') + ' |');
    doc.push('', '被动：', '');
    for (const trait of beast.traits) doc.push('- **' + trait.name + '**：' + trait.effect);
    doc.push('');
  }
  doc.push('## 编目与接口说明', '',
    '- 可编辑输入：`catalog-source.json`；执行 `node tools/build-beasts.cjs` 重建 `library.json` 与本文。',
    '- 霜域中间档暂按端点线性取值：读条速度降低27.5%、行动条速度降低20%；其他端点与上限沿用原稿。',
    '- 苔凝的“永久”按原稿保留并预留持久化层数字段；不擅自改成战后清零。',
    '- `available:true` 表示有可调用定义，`implementation.hostIntegrated:false` 明确尚无主游戏执行接入。',
    '- 原始资料不改写。主动技能、魂兽被动、胜利魂环双技分别储存；不把魂兽四技直接复制成玩家四个魂技。', '');
  fs.writeFileSync(path.join(ROOT, 'data/beast/十万年魂兽库_三例.md'), doc.join('\n'), 'utf8');
  console.log('已编目' + result.beasts.length + '只十万年魂兽，每只4技；随机六部位魂骨。');
  for (const beast of result.beasts) console.log(beast.name + '：' + beast.panel.ratingScore + ' ' + beast.panel.rating + '；' + beast.skills.map((skill) => skill.name).join('／'));
}

module.exports = { compile, compileSkill };
