'use strict';

/**
 * 独立模块包的版本登记。
 *
 * 交接文档第十八节要求“所有池和定义带版本号；实例保存来源定义与必要的参数快照”。
 * 这里把每个封装的规则版本集中登记，实例/存档只引用这里的数字，避免散落魔法值。
 * 注意：这不是游戏版本号，本模块包不产出任何 v12 游戏构建。
 */
const VERSIONS = Object.freeze({
  modulePackage: 'split-2-beasts.1',
  skillAttributes: 1,
  // 讨伐事件控制器
  huntController: 1,
  huntTexts: 1,
  allyRules: 1,
  huntLedger: 1,
  huntBattle: 1,
  // 名录与战斗适配
  npcRoster: 1,
  npcArrivalTexts: 1,
  npcCombatAdapter: 1,
  // 十万年魂兽库
  beastLibrarySchema: 1,
  beastSelection: 1,
  // 魂骨
  soulboneInstance: 1,
  soulboneAttributeBudget: 0, // 0 = 预算未定，禁止写入具体数值
  boneDropRules: 1,
  soulboneTraitPool: 1,
  soulboneTraitAssembly: 1,
  soulboneAbsorption: 1,
  // 奖励
  rewardTransaction: 1,
  tenThousandInheritance: 1,
  // 战斗适配层
  battleHooks: 1,
  equipmentSource: 1,
  // 旧档迁移
  legacyMigration: 1
});

const PENDING = Object.freeze({
  EMPTY_BEAST_LIBRARY: 'beast-library-empty',
  EMPTY_TRAIT_POOL: 'trait-pool-empty',
  ATTRIBUTE_BUDGET_UNSET: 'attribute-budget-unset',
  SLOT_CONFLICT: 'slot-conflict',
  NO_LEGAL_TRAIT: 'no-legal-trait',
  PRE_STORED_RING: 'pre-stored-ninth-ring',
  OWNER_NOT_READY: 'owner-not-ready'
});

function versionOf(name) {
  if (!Object.prototype.hasOwnProperty.call(VERSIONS, name)) {
    throw new Error('未登记的版本项：' + name);
  }
  return VERSIONS[name];
}

function assertVersion(value, expected, label) {
  if (value !== expected) {
    throw new Error((label || '版本') + '不一致：期望 ' + expected + '，实际 ' + value);
  }
  return true;
}

module.exports = { VERSIONS, PENDING, versionOf, assertVersion };
