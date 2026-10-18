'use strict';

/**
 * 十万年魂骨的特性继承（交接文档第十三节）。
 *
 * 已定：魂兽至少有两个不同的可继承特性，奖励记录锁定这组定义与版本；
 * 继承规则必须同时支持“获得其中之一”和“全部获得”。
 * 初版建议（文档标注为待确认建议）：1d100 为 1—25 → 全部；26—100 → 等概率一条。
 * 若魂兽恰有两条，各单独继承结果概率为37.5%，全部为25%。
 *
 * 继承骰与具体选中项在首胜奖励事务中一次落盘；重开界面、换装备、保存重读不能改为另一条。
 */

const { clone, isPlainObject, requireInteger } = require('../util');
const { attributeTags } = require('../battle/skill-attributes');
const { VERSIONS } = require('../versions');

const DEFAULT_CONFIG = Object.freeze({
  version: VERSIONS.tenThousandInheritance,
  sides: 100,
  allThreshold: 25,
  suggested: true,
  note: '25%全部、75%一条为交接文档建议值，确认后可改配置而不改存档结构。'
});

function validateTraits(traits) {
  if (!Array.isArray(traits) || traits.length < 2) throw new Error('十万年魂兽至少需要两个不同的可继承特性');
  const ids = traits.map((trait) => trait && trait.id);
  if (ids.some((id) => typeof id !== 'string' || !id)) throw new Error('可继承特性缺少稳定ID');
  if (new Set(ids).size !== ids.length) throw new Error('可继承特性ID重复');
  return ids;
}

function matchingAttributes(player,beast){const asTags=x=>Array.isArray(x)?attributeTags({elements:x}):attributeTags(x);const playerTags=asTags(player),beastTags=asTags(beast);return playerTags.filter(t=>t!=='无'&&beastTags.includes(t));}

function rollInheritance(input) {
  const config = { ...DEFAULT_CONFIG, ...(input.config || {}) };
  requireInteger(config.sides, '继承骰面数', 2, 100000);
  requireInteger(config.allThreshold, '全部继承阈值', 0, config.sides);
  const traits = input.traits;
  const ids = validateTraits(traits);
  if (!input.rng || typeof input.rng.die !== 'function') throw new Error('继承骰须使用游戏确定性投骰器');

  const matchedAttributes=matchingAttributes(input.characterAttributes,input.beastAttributes);
  if(matchedAttributes.length)return Object.freeze({version:config.version,configVersion:config.version,beastId:input.beastId||null,face:null,sides:config.sides,mode:'all',selectedTraitIds:ids.slice(),probabilityAll:1,probabilityOne:0,matchedAttributes,reason:'attribute-match',frozen:true,suggestedConfig:false});

  const face = input.rng.die(config.sides, '十万年魂骨特性继承', { beastId: input.beastId || null });
  if (face <= config.allThreshold) {
    return Object.freeze({
      version: config.version,
      configVersion: config.version,
      beastId: input.beastId || null,
      face,
      sides: config.sides,
      mode: 'all',
      selectedTraitIds: ids.slice(),
      probabilityAll: config.allThreshold / config.sides,
      probabilityOne: (config.sides - config.allThreshold) / config.sides,
      frozen: true,
      suggestedConfig: config.suggested
    });
  }
  const pickFace = input.rng.die(ids.length, '十万年魂骨特性继承·单条');
  return Object.freeze({
    version: config.version,
    configVersion: config.version,
    beastId: input.beastId || null,
    face,
    sides: config.sides,
    mode: 'one',
    selectedTraitIds: [ids[pickFace - 1]],
    pick: { sides: ids.length, face: pickFace },
    probabilityAll: config.allThreshold / config.sides,
    probabilityOne: (config.sides - config.allThreshold) / config.sides,
    frozen: true,
    suggestedConfig: config.suggested
  });
}

/** 已验证的继承结果（读档时只用它，不重投）。 */
function validateInheritance(result, traits) {
  if (!isPlainObject(result) || result.frozen !== true) throw new Error('魂骨继承结果未冻结');
  if (![1, VERSIONS.tenThousandInheritance].includes(result.version)) throw new Error('魂骨继承规则版本不一致');
  const ids = validateTraits(traits);
  if (!Array.isArray(result.selectedTraitIds) || !result.selectedTraitIds.length) throw new Error('继承结果缺少选中特性');
  if (!['all', 'one'].includes(result.mode)) throw new Error('继承模式无效');
  if (new Set(result.selectedTraitIds).size !== result.selectedTraitIds.length) throw new Error('继承结果含重复特性');
  if (result.selectedTraitIds.some((id) => !ids.includes(id))) throw new Error('继承结果含魂兽之外的特性');
  if (result.mode === 'all' && result.selectedTraitIds.length !== ids.length) throw new Error('“全部继承”结果不完整');
  if (result.mode === 'one' && result.selectedTraitIds.length !== 1) throw new Error('“获得一条”结果不合法');
  return true;
}

/** 供文档/测试使用的理论分布：每条特性单独被选中的概率。 */
function theoreticalDistribution(count) {
  if (!Number.isInteger(count) || count < 2) throw new Error('特性数量须为≥2的整数');
  const all = DEFAULT_CONFIG.allThreshold / DEFAULT_CONFIG.sides;
  const perOne = (1 - all) / count;
  return { all, perTrait: all + perOne, selectedOnlyPerTrait: perOne, count };
}

module.exports = { DEFAULT_CONFIG, rollInheritance, validateInheritance, validateTraits, theoreticalDistribution, matchingAttributes };
