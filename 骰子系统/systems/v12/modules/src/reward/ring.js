'use strict';

/**
 * 十万年魂环生成与第九环落地（交接文档第九、十三、十五节）。
 *
 * 已定：
 *   - 新获得十万年魂环／魂兽成果只开放两个合法入口：本次固定讨伐实际战胜库中魂兽；
 *     原有第九环极端出目，保留其现有生成规则和概率链，不额外放宽。
 *   - 100000年魂环沿用同环两技及共享冷却，且两个魂技都要能正常显示与参战。
 *   - 胜利时不足90级：保存并标记“预留第九环”，不提前装成第八环，也不丢弃；
 *     达到90级且第1—8环齐备、第九环空缺时自动吸收；
 *     中间缺环则保留在队列，不跳过缺环装到错误位置。
 *   - 90级已合法持有第九环时，不再生成第十个魂环。
 *
 * 魂技的实际威力、费用与准备时间由战斗侧 makeSkill 计算，本模块不自造第二套数值。
 */

const { clone, isPlainObject, requireInteger } = require('../util');
const { VERSIONS } = require('../versions');
const { tagSkill } = require('../battle/skill-attributes');

const RING_INDEX = 9;
const YEARS = 100000;
const CAP = 100000;
const CATEGORIES = Object.freeze(['攻击', '强化', '防御', '减益', '控制']);
const ALLOWED_ENTRANCES = Object.freeze(['fixed-hunt', 'legacy-ninth-extreme']);

function assertCharacter(character) {
  if (!isPlainObject(character)) throw new Error('角色数据无效');
  if (!Array.isArray(character.rings)) throw new Error('角色缺少魂环数组');
  if (!isPlainObject(character.stats)) throw new Error('角色缺少实际面板，无法生成魂技');
  if (!isPlainObject(character.soul)) throw new Error('角色缺少武魂数据，无法生成魂技');
  return character;
}

/**
 * @param {object} input {character, seed, rng, makeSkill, pickCategory, transactionId, category, acquiredAt}
 */
function createHundredThousandRing(input) {
  const character = assertCharacter(input.character);
  if (typeof input.seed !== 'string' || !input.seed) throw new Error('十万年魂环须带确定性种子');
  if (!input.rng || typeof input.rng.die !== 'function') throw new Error('十万年魂环须使用游戏确定性投骰器');
  if (typeof input.makeSkill !== 'function') throw new Error('十万年魂环须调用战斗侧 makeSkill，禁止另写一套数值');
  if (typeof input.transactionId !== 'string' || !input.transactionId) throw new Error('十万年魂环须记录奖励事务ID');

  let first = input.category;
  if (!first) {
    first = typeof input.pickCategory === 'function'
      ? input.pickCategory(character.style, input.rng.die(100, '十万年第一魂技类别'))
      : CATEGORIES[0];
  }
  if (!CATEGORIES.includes(first)) first = CATEGORIES[0];
  const remaining = CATEGORIES.filter((category) => category !== first);
  const second = remaining[input.rng.die(remaining.length, '十万年第二魂技类别') - 1];

  const make = (category, variant) => {
    const effectSeed = input.seed + '|event-ring|9|' + variant;
    const skill = input.makeSkill({
      soul: character.soul,
      style: character.style,
      stats: character.stats,
      index: RING_INDEX,
      years: YEARS,
      category,
      variant,
      effectSeed
    });
    return {
      ...tagSkill(skill, character.soul),
      category,
      variant,
      effectSeed,
      ring: RING_INDEX,
      years: YEARS,
      sharedCooldown: 'ring-9',
      guarantee: '同环两技共享冷却'
    };
  };

  const skills = [make(first, 0), make(second, 1)];
  if (skills.length !== 2 || skills[0].category === skills[1].category) throw new Error('十万年魂环必须生成两个不同类别的魂技');
  skills.forEach((skill) => {
    if (skill.sharedCooldown !== 'ring-9') throw new Error('同环两技必须共享冷却');
  });

  const entrance = input.entrance || 'fixed-hunt';
  if (!ALLOWED_ENTRANCES.includes(entrance)) throw new Error('非法十万年来源入口：' + entrance);
  const ring = {
    index: RING_INDEX,
    years: YEARS,
    cap: CAP,
    quality: 100,
    plan: 'hunt',
    band: '十万年',
    q: 4.5,
    skills,
    guarantee: '同环两技共享冷却',
    acquiredAt: input.acquiredAt === undefined ? null : clone(input.acquiredAt),
    source: {
      type: entrance === 'fixed-hunt' ? 'hunt' : 'legacy-ninth-extreme',
      transactionId: input.transactionId,
      generationVersion: VERSIONS.rewardTransaction,
      allowedEntrances: ALLOWED_ENTRANCES.slice(),
      entrance
    }
  };
  assertLegalTenThousandSource(ring);
  return ring;
}

/**
 * 新获得十万年魂环的合法来源校验：
 * 只允许本次固定讨伐，或原有第九环极端出目；普通八环及以前的猎魂、
 * 普通事件随机奖池、武魂特性、临时返还、魂骨生成池都不能混入。
 */
function assertLegalTenThousandSource(ring) {
  if (!isPlainObject(ring) || ring.index !== RING_INDEX || ring.years !== YEARS) throw new Error('不是十万年第九环');
  if (!isPlainObject(ring.source)) throw new Error('十万年魂环缺少来源记录');
  if (!ALLOWED_ENTRANCES.includes(ring.source.entrance)) throw new Error('十万年魂环来源入口非法：' + ring.source.entrance);
  if (!['hunt', 'legacy-ninth-extreme'].includes(ring.source.type)) throw new Error('十万年魂环来源类型非法：' + ring.source.type);
  if (ring.source.entrance === 'fixed-hunt' && (typeof ring.source.transactionId !== 'string' || !ring.source.transactionId)) {
    throw new Error('讨伐来源必须记录奖励事务ID');
  }
  return true;
}

/**
 * 吸收时重算魂技：预留阶段只锁定年限、来源、魂技类别与生成种子；
 * 实际威力、费用与准备预览必须按吸收后当前角色的统一接口重算，不能沿用旧面板的数值。
 */
function rehydrateHundredThousandRing(input) {
  const character = assertCharacter(input.character);
  if (typeof input.makeSkill !== 'function') throw new Error('重算预留魂环须调用战斗侧 makeSkill');
  const ring = input.ring;
  if (!isPlainObject(ring) || ring.index !== RING_INDEX || ring.years !== YEARS) throw new Error('不是十万年第九环');
  if (!Array.isArray(ring.skills) || ring.skills.length !== 2) throw new Error('十万年第九环必须有两个魂技');
  const skills = ring.skills.map((stored, index) => {
    const category = stored.category;
    if (!CATEGORIES.includes(category)) throw new Error('预留魂环的魂技类别无效：' + category);
    const variant = stored.variant === undefined ? index : stored.variant;
    const effectSeed = stored.effectSeed || (input.seed || '') + '|event-ring|9|' + variant;
    const fresh = input.makeSkill({
      soul: character.soul,
      style: character.style,
      stats: character.stats,
      index: RING_INDEX,
      years: YEARS,
      category,
      variant,
      effectSeed
    });
    return {
      ...tagSkill(fresh, character.soul),
      category,
      variant,
      effectSeed,
      ring: RING_INDEX,
      years: YEARS,
      sharedCooldown: 'ring-9',
      guarantee: '同环两技共享冷却'
    };
  });
  return { ...clone(ring), skills };
}

/** 第九环落地：不足90级预留；90级且八环齐备自动吸收；缺环或已九环保持队列。 */
function handleNinthRing(input) {
  const character = assertCharacter(input.character);
  const level = requireInteger(input.level, '等级', 1, 99);
  const ring = input.ring;
  if (!isPlainObject(ring) || ring.index !== RING_INDEX || ring.years !== YEARS) throw new Error('不是十万年第九环');

  assertLegalTenThousandSource(ring);
  if (character.rings.some((item) => item.index === 9) || character.rings.length >= 9) {
    return {
      action: 'already-nine',
      absorbed: false,
      reason: '已合法持有第九环：不覆盖、不生成第十环、不塞第三个技能',
      pendingRing: clone(ring)
    };
  }
  if (level < 90) {
    return { action: 'pre-stored', absorbed: false, reason: '不足90级：预留第九环，不提前装成第八环', pendingRing: clone(ring) };
  }
  const hasAllEight = Array.from({ length: 8 }, (_, i) => character.rings.some((item) => item.index === i + 1)).every(Boolean);
  if (!hasAllEight) {
    return { action: 'queued-gap', absorbed: false, reason: '第1—8环不齐备：保留在队列，不跳过缺环', pendingRing: clone(ring) };
  }
  // 真正吸收时按当前面板重算两技数值；类别与种子沿用预留时锁定的值。
  const finalRing = input.makeSkill ? rehydrateHundredThousandRing({ ring, character, makeSkill: input.makeSkill, seed: input.seed }) : ring;
  character.rings.push(clone(finalRing));
  for (const key of ['preStoredNinthRing', 'pendingNinthRing']) {
    const pending = character[key];
    if (pending && pending.source && ring.source && pending.source.transactionId === ring.source.transactionId) delete character[key];
  }
  return { action: 'absorbed', absorbed: true, reason: '90级且八环齐备、第九环空缺：自动吸收', pendingRing: null };
}

/** 面板/战斗/存档共用的一致性检查：第九环必须是真实已吸收的十万年环。 */
function assertNinthRingConsistency(character) {
  const rings = character.rings || [];
  if (rings.length > 9) throw new Error('出现第十个魂环，超出九环上限');
  if (new Set(rings.map((ring) => ring.index)).size !== rings.length) throw new Error('魂环位置重复');
  const ninth = rings.find((ring) => ring.index === RING_INDEX);
  if (!ninth) return { hasNinth: false, consistent: true };
  if (ninth.years !== YEARS) {
    if (ninth.source && ninth.source.type === 'hunt') throw new Error('第九环不是十万年，不能标记为事件奖励');
    return { hasNinth: true, consistent: true, skillCount: (ninth.skills || []).length, years: ninth.years };
  }
  if (!Array.isArray(ninth.skills) || ninth.skills.length !== 2) throw new Error('十万年第九环必须有两个魂技');
  if (!ninth.skills.every((skill) => skill.sharedCooldown === 'ring-9')) throw new Error('十万年第九环两技未共享冷却');
  if (rings.length > 9) throw new Error('出现第十个魂环，超出九环上限');
  return { hasNinth: true, consistent: true, skillCount: ninth.skills.length, years: ninth.years };
}

module.exports = { RING_INDEX, YEARS, CAP, CATEGORIES, ALLOWED_ENTRANCES, createHundredThousandRing, rehydrateHundredThousandRing, handleNinthRing, assertNinthRingConsistency, assertLegalTenThousandSource };
