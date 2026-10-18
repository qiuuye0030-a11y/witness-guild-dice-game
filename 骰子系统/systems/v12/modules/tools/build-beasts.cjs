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
    strengthReference: { years: source.skillYears, band: source.skillBandLabel||'万年最低档', rating:source.skillPowerRating||null, q: skill.q, K: 1, Q, bloodlineMultiplier: false },
    operations: [operation]
  };
  if (plan.category === '控制') result.baseControl = operation.baseSeconds;
  if (plan.category === '强化') {
    result.agility = rate(0.12 * Q);
  }
  result.cost = R.skillBudget(panel, result);
  result.previewCost = result.cost;
  result.previewCast = result.cast;
  if(source.statusPolicy&&['强化','减益','防御'].includes(plan.category)){result.statusLifetime='battle';result.duration=null;if(plan.category==='防御')result.shieldDuration=null;result.effect=result.effect.replace(/持续\d+(?:\.\d+)?秒/g,'持续整场战斗');for(const op of result.operations){delete op.ttlSeconds;op.lifetime='battle';}}
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
    const spiritModel={...panel,stats:Object.fromEntries(R.KEYS.map(k=>[k,stats.S]))};const spiritRating=R.rating(spiritModel).label;const skillBand=source.skillTierPolicy?.bands.find(b=>b.rating===spiritRating);const skillSource=skillBand?{...source,skillYears:skillBand.years,skillBandLabel:skillBand.label,skillPowerRating:spiritRating}:source;
    const traits = entry.traits.map((trait) => ({
      ...trait,
      implementation: { status: 'live', handler: 'beast:' + trait.id, version: 1, requiresHostAdapter: false },
      inherit: {
        handler: 'inherit:' + trait.id, implementationVersion: 1,
        name: trait.name, effect: trait.effect,
        params: { ...trait.params, sourceOwner: 'equipped-bone-owner' },
        implementationStatus: 'live', requiresHostAdapter: false,
        save: { schemaVersion: 1, fields: trait.params.saveFields || [] }
      }
    }));
    const beast = {
      ...entry, years: 100000, available: true, battleTags: ['hunt'], lifeType: '生活',
      level: source.baselineLevel, panel,
      statBasis: { level: source.baselineLevel, benchmark: standard.base, W: standard.stability, ratios: entry.statRatios, bloodlineModifiesStats: false, note: source.baselineNote },
      skillPowerBasis:skillBand?{stat:'S',value:stats.S,benchmark:standard.base,ratio:entry.statRatios[1],...skillBand}:null,
      skills: entry.skills.map((plan, index) => compileSkill(entry, plan, index, panel, skillSource, R)),
      traits, traitInheritanceVersion: 1,
      ringReward: { years: 100000, description: '十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技' },
      bone: { slot: 'random', slotPolicy: 'prefer-unoccupied-six', description: '胜利后优先在未装备且未携带的常规部位中等概率抽取，六部位齐备才在全部六部位抽取；不生成外附骨，结果随奖励事务保存' },
      exitRule: 'hp-or-spirit-zero',
      implementation: { status: 'host-integrated-v1205', hostIntegrated: true, skills: 'operations-live', traits: 'live', inheritanceHandlers: 'live' }
    };
    validateBeast(beast);
    return beast;
  });
  return JSON.parse(JSON.stringify({
    schemaVersion: 1, libraryVersion: source.libraryVersion,
    note: '七例正式魂兽资料，四技按魂力强度S分档、增益与减益持续本场；v12.05宿主已接入十四条被动及魂骨继承处理器，独立模块执行战斗仍需宿主。',
    source: { file: source.sourceFile, sha256: crypto.createHash('sha256').update(sourceText).digest('hex'), rulesVersion: R.calculationVersion, ratingRulesVersion: R.ratingRulesVersion, skillYears: source.skillYears||null,skillTierPolicy:source.skillTierPolicy||null,statusPolicy:source.statusPolicy||null, generatedBy: 'tools/build-beasts.cjs' },
    beasts: definitions
  }));
}

if (require.main === module) {
  const source = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const text = fs.readFileSync(path.resolve(ROOT, 'reference', source.sourceFile));
  const result = compile(source, text);
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + '\n', 'utf8');
  const doc = [
    '# 十万年魂兽库 · 七例', '',
    '来源：原三例与新增四例。保留六维、血脉和各两条被动；每只四个主动技能，至少一个攻击技能。', '',
    '91级基准500。魂技按魂力强度S相对同级基准单独分档：纸／并／强／凶／狂对应万年一至五档，神级对应十万年档；K＝1。魂技标签继承全部属性。', '',
    '数值强化、削弱与防护持续整场，控制及免控仍按秒。伤害不因“整场”无限结算。', '',
    '魂骨优先抽未装备且未携带的部位，六部位齐备时在全部部位中抽取。抽取结果保存，刷新不重抽。', '',
    '**接入状态：v12.05已接入七例、二十八技、十四条被动与魂骨继承；旧版游戏未修改。**', ''
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
    '- 霜域按“每个自身回合加深一档、最多3档”结算：每档敌方敏捷−2%、行动条速度−4%，友方敏捷＋4%；三档后每次加深转为友方2%生命上限寒冰护盾、敌方2%生命上限伤害（不经防御衰减）。',
    '- 冰壳护生为战斗开始时一次性护盾（自身生命值40%），击破反伤30%且不自行重结；霜苔封寒仍以原始面板生命为基数。',
    '- 苔凝的“永久”按原稿保留并预留持久化层数字段；不擅自改成战后清零。',
    '- `implementation.hostIntegrated:true` 表示v12.05已接入战斗；独立模块的继承注册器需传入真实Battle宿主。',
    '- 原始资料不改写。主动技能、魂兽被动、胜利魂环双技分别储存；不把魂兽四技直接复制成玩家四个魂技。', '');
  fs.writeFileSync(path.join(ROOT, 'data/beast/十万年魂兽库_七例.md'), doc.join('\n'), 'utf8');
  console.log('已编目' + result.beasts.length + '只十万年魂兽，每只4技；随机六部位魂骨。');
  for (const beast of result.beasts) console.log(beast.name + '：' + beast.panel.ratingScore + ' ' + beast.panel.rating + '；' + beast.skills.map((skill) => skill.name).join('／'));
}

module.exports = { compile, compileSkill };
