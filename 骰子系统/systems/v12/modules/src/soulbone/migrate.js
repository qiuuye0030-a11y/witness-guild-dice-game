'use strict';

/**
 * 旧档迁移（交接文档第二、十七节）。
 *
 * 分清楚来源，不能见到“特性”二字就删：
 *   - 魂性谱随机武魂特性：删除定义、注册、随机生成、结算、储存与显示；
 *     已存旧随机特性的待用收益、层数和触发标记在导入时清理。
 *   - 会长、神秘伤疤女、友方NPC等直接手写的角色特性：保留。
 *   - 新魂骨特性：按魂骨实例保留，不因迁移被误删。
 *   - 过去已经结算进属性的成长：不回扣。
 *   - 旧千年赠骨仍是合法道具；是否补新特性未指定，不自动升级为万年骨。
 *   - 旧“非空魂骨技能”校验升级为按版本、类型和已实现处理器验证，不取消全部校验。
 */

const { clone, isPlainObject } = require('../util');
const { VERSIONS } = require('../versions');

const SOUL_RANDOM_SOURCES = Object.freeze(['魂性谱', 'soul-random', 'soul_random', 'random-soul-trait', 'soulTrait', 'soul-trait']);
const ROLE_SOURCES = Object.freeze(['role', 'character', 'innate', 'guildmaster', 'scarred', '角色固有']);
const NPC_SOURCES = Object.freeze(['npc', 'friendly-npc']);
const BONE_SOURCES = Object.freeze(['soulbone', 'bone', '魂骨']);

function classifyTraitSource(trait) {
  if (!isPlainObject(trait)) return 'unknown';
  const source = typeof trait.source === 'string' ? trait.source : '';
  if (SOUL_RANDOM_SOURCES.includes(source)) return 'soul-random';
  if (ROLE_SOURCES.includes(source)) return 'role';
  if (NPC_SOURCES.includes(source) || (typeof trait.npcId === 'string' && trait.npcId)) return 'npc';
  if (BONE_SOURCES.includes(source) || (typeof trait.sourceBoneId === 'string' && trait.sourceBoneId)) return 'soulbone';
  if (typeof trait.sourceBoneId === 'string' && trait.sourceBoneId) return 'soulbone';
  if (typeof trait.definitionId === 'string' && /^(soul-trait[-:]|trait:)/.test(trait.definitionId)) return 'soul-random';
  if (trait.bindsSoulId === true && !source) return 'soul-random';
  return 'unknown';
}

function scrubTraitList(list, label, report) {
  const kept = [];
  for (const trait of list) {
    const kind = classifyTraitSource(trait);
    if (kind === 'soul-random') {
      report.removed.push({ where: label, kind, trait: clone(trait) });
    } else {
      kept.push(trait);
      if (kind === 'unknown') report.needsReview.push({ where: label, trait: clone(trait) });
      else report.kept.push({ where: label, kind });
    }
  }
  return kept;
}

/**
 * 清理角色身上的旧随机武魂特性及其待用收益／层数／触发标记。
 * 只改特性相关容器；growth、stats、rings、bones、mutations 原样保留。
 */
function migrateCharacter(character) {
  if (!isPlainObject(character)) throw new Error('角色存档无效');
  const next = clone(character);
  const report = { version: VERSIONS.legacyMigration, removed: [], kept: [], needsReview: [], containers: [] };
  for (const key of ['soulTrait', 'passive']) {
    if (classifyTraitSource(next[key]) !== 'soul-random') continue;
    report.removed.push({ where: key, kind: 'soul-random', trait: clone(next[key]) });
    delete next[key];
    if (key === 'passive') delete next.passiveState;
  }

  for (const key of ['traits', 'passiveTraits', 'traitStates']) {
    if (!Array.isArray(next[key])) continue;
    report.containers.push(key);
    next[key] = scrubTraitList(next[key], key, report);
  }

  // 旧随机特性的待用收益/层数/触发标记。只清这些标记，不动已结算成长。
  for (const key of ['traitPending', 'traitStacks', 'traitStackTime', 'pendingTraitBenefits']) {
    if (next[key] === undefined) continue;
    report.removed.push({ where: key, kind: 'soul-random-marker', trait: clone(next[key]) });
    delete next[key];
  }

  report.growthUntouched = clone(character.growth || null);
  report.statsUntouched = clone(character.stats || null);
  return { character: next, report };
}

/** 清理旧战斗快照里残留的随机武魂特性待用状态；角色固有/NPC特性保留。 */
function migrateBattleSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error('战斗快照无效');
  const next = clone(snapshot);
  const report = { removed: [], kept: [] };
  for (const unit of next.units || []) {
    const passive = unit.passive;
    if (!passive) continue;
    const kind = classifyTraitSource(passive);
    if (kind === 'soul-random') {
      report.removed.push({ unitId: unit.id, definitionId: passive.definitionId || null });
      unit.passive = null;
      delete unit.passiveState;
    } else {
      report.kept.push({ unitId: unit.id, kind });
    }
  }
  return { snapshot: next, report };
}

/** 旧成长绑定实际在state.soulTrait，战斗绑定在units[].passive；处理整份存档。 */
function migrateSave(save) {
  if (!isPlainObject(save)) throw new Error('存档无效');
  const next = clone(save);
  const removed = [];
  function walk(value, path) {
    if (!value || typeof value !== 'object') return;
    for (const key of ['soulTrait', 'passive']) {
      if (classifyTraitSource(value[key]) !== 'soul-random') continue;
      removed.push({ where: path + '.' + key, definitionId: value[key].definitionId });
      delete value[key];
      if (key === 'passive') delete value.passiveState;
    }
    for (const [key, child] of Object.entries(value)) walk(child, path + '.' + key);
  }
  walk(next, 'save');
  return { save: next, report: { version: VERSIONS.legacyMigration, removed } };
}

/**
 * 旧存档的魂骨技能校验：不再“非空就整包拒绝”，而是逐条要求
 * 生成版本、类型与已实现处理器；缺一项就显式报错，交由迁移处理。
 */
function validateLegacyBoneSkills(bone, options = {}) {
  const implemented = new Set(options.implementedHandlers || []);
  if (!isPlainObject(bone)) throw new Error('魂骨数据无效');
  if (bone.skills === undefined || bone.skills === null) return true;
  if (!Array.isArray(bone.skills)) throw new Error('魂骨技能须为数组');
  if (!bone.skills.length) return true;
  bone.skills.forEach((skill, index) => {
    if (!isPlainObject(skill)) throw new Error('魂骨技能第' + (index + 1) + '项无效');
    if (!Number.isInteger(skill.generationVersion) || skill.generationVersion < 1) {
      throw new Error('魂骨技能第' + (index + 1) + '项缺少生成版本，不能进入正式流程');
    }
    if (typeof skill.type !== 'string' || !skill.type) throw new Error('魂骨技能第' + (index + 1) + '项缺少类型');
    if (typeof skill.handler !== 'string' || !implemented.has(skill.handler)) {
      throw new Error('魂骨技能第' + (index + 1) + '项的处理器未实现：' + skill.handler);
    }
  });
  return true;
}

/**
 * 旧E02“魂骨与武魂的共鸣”迁移：
 *   - 已经结算的旧事件保留应得成果，并标记防止重发；
 *   - 新流程不再要求为吸骨单开一次培养事件。
 */
function migrateLegacyBoneEvent(pending) {
  if (!isPlainObject(pending)) return { pending, report: { changed: false } };
  if (pending.eventId !== 'E02' && pending.eventId !== 2) return { pending: clone(pending), report: { changed: false } };
  const next = clone(pending);
  next.legacyBoneEvent = true;
  next.absorptionMovedToSafeNode = true;
  if (next.settled === true || next.reward !== undefined || next.rewards !== undefined) {
    next.rewardsAlreadyGranted = true;
    next.duplicateRewardPrevented = true;
  }
  return { pending: next, report: { changed: true, rewardsAlreadyGranted: next.rewardsAlreadyGranted === true } };
}

module.exports = {
  SOUL_RANDOM_SOURCES,
  classifyTraitSource,
  migrateCharacter,
  migrateSave,
  migrateBattleSnapshot,
  validateLegacyBoneSkills,
  migrateLegacyBoneEvent
};
