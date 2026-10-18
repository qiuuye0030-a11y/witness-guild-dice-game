'use strict';

/**
 * 魂骨特性池与装配（交接文档第十二节）。
 *
 * 规则：
 *   - 每条定义带稳定ID、显示名称、效果说明、可用年限、允许部位、实现处理器、
 *     参数、触发与退出条件、叠加规则、存档结构、依赖机制；
 *   - 先筛选年限、部位和实现条件，再按池权重抽取；没有权重时等权；
 *   - 只抽一次并保存，不随面板刷新重组；
 *   - 重名不能作为重复的唯一判断，检查定义ID与叠加组；
 *   - 抽到不允许重复的特性时，从剩余合法集合无放回重选；无合法项返回待处理，
 *     不无限重抽，也不偷偷改成现金、经验或另一块骨。
 */

const fs = require('node:fs');
const path = require('node:path');
const { clone, deepFreeze, isPlainObject, requireInteger } = require('../util');
const { VERSIONS, PENDING } = require('../versions');
const { drawWeightedFace } = require('../rng');

const DATA_PATH = path.resolve(__dirname, '..', '..', 'data', 'soulbone', 'trait-pool.json');
const SLOTS = Object.freeze(['头部', '躯干', '左臂', '右臂', '左腿', '右腿']);

function emptyPool() {
  return { schemaVersion: 1, poolVersion: VERSIONS.soulboneTraitPool, note: '空池：等待用户编写魂骨特性。', traits: [] };
}

function loadPool(dataPath) {
  const target = dataPath || DATA_PATH;
  if (!fs.existsSync(target)) return emptyPool();
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function validateTraitDefinition(trait) {
  if (!isPlainObject(trait)) throw new Error('特性定义须为对象');
  if (typeof trait.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(trait.id)) throw new Error('特性稳定ID无效：' + trait.id);
  if (typeof trait.name !== 'string' || !trait.name) throw new Error(trait.id + ' 缺少显示名称');
  if (typeof trait.effect !== 'string' || !trait.effect) throw new Error(trait.id + ' 缺少效果说明');
  if (!Array.isArray(trait.years) || trait.years.length !== 2) throw new Error(trait.id + ' 缺少可用年限区间');
  requireInteger(trait.years[0], trait.id + ' 年限下限', 1000, 100000);
  requireInteger(trait.years[1], trait.id + ' 年限上限', trait.years[0], 100000);
  if (!Array.isArray(trait.slots) || !trait.slots.length) throw new Error(trait.id + ' 缺少允许部位');
  if (trait.slots.some((slot) => !SLOTS.includes(slot))) throw new Error(trait.id + ' 含未知部位');
  if (typeof trait.handler !== 'string' || !trait.handler) throw new Error(trait.id + ' 缺少实现处理器');
  if (trait.weight !== undefined) requireInteger(trait.weight, trait.id + ' 池权重', 1, 1000000);
  if (trait.stackGroup !== undefined && (typeof trait.stackGroup !== 'string' || !trait.stackGroup)) throw new Error(trait.id + ' 叠加组无效');
  if (trait.maxStacks !== undefined) requireInteger(trait.maxStacks, trait.id + ' 叠加上限', 1, 99);
  if (trait.implementationVersion !== undefined) requireInteger(trait.implementationVersion, trait.id + ' 实现版本', 1, 1000);
  if(trait.rRanges!==undefined){
    if(!Array.isArray(trait.rRanges)||!trait.rRanges.length)throw new Error(trait.id+' R目录须非空');
    const faces=new Set();for(const r of trait.rRanges){requireInteger(r.min,'R下限',1,100);requireInteger(r.max,'R上限',r.min,100);if(typeof r.category!=='string'||!/^[A-G][1-5]$/.test(r.category))throw new Error(trait.id+' R分类无效');for(let i=r.min;i<=r.max;i++){if(faces.has(i))throw new Error(trait.id+' R出目重复');faces.add(i);}}
    if(trait.weight!==faces.size)throw new Error(trait.id+' 权重与R出目数不一致');
  }
  if (trait.params !== undefined && !isPlainObject(trait.params)) throw new Error(trait.id + ' 参数须为对象');
  return true;
}

function createTraitPool(options = {}) {
  const raw = options.data || loadPool(options.dataPath);
  if (!raw || raw.schemaVersion !== 1) throw new Error('魂骨特性池版本不支持');
  if (!Array.isArray(raw.traits)) throw new Error('魂骨特性池 traits 须为数组');
  const registry = options.registry;
  if (!registry || typeof registry.has !== 'function') throw new Error('特性池须绑定已实现的处理器登记表');

  const errors = [];
  const traits = new Map();
  for (const trait of raw.traits) {
    try {
      validateTraitDefinition(trait);
      if (traits.has(trait.id)) throw new Error('特性ID重复：' + trait.id);
      traits.set(trait.id, deepFreeze(clone(trait)));
    } catch (error) {
      errors.push(error.message);
    }
  }

  function candidates(input) {
    const years = requireInteger(input.years, '魂骨年限', 1000, 100000);
    if (!SLOTS.includes(input.slot)) throw new Error('魂骨部位无效：' + input.slot);
    const excludeIds = new Set(input.excludeDefinitionIds || []);
    const stackCounts = input.stackCounts || {};
    const unavailable = [];
    const legal = [];
    for (const trait of traits.values()) {
      if (years < trait.years[0] || years > trait.years[1]) {
        unavailable.push({ id: trait.id, reason: 'years-not-eligible' });
        continue;
      }
      if (!trait.slots.includes(input.slot)) {
        unavailable.push({ id: trait.id, reason: 'slot-not-allowed' });
        continue;
      }
      if (!registry.has(trait.handler)) {
        unavailable.push({ id: trait.id, reason: 'handler-missing' });
        continue;
      }
      if (excludeIds.has(trait.id)) {
        unavailable.push({ id: trait.id, reason: 'already-equipped' });
        continue;
      }
      const group = trait.stackGroup || trait.id;
      const maxStacks = trait.maxStacks || 1;
      if ((stackCounts[group] || 0) >= maxStacks) {
        unavailable.push({ id: trait.id, reason: 'stack-limit' });
        continue;
      }
      legal.push(trait);
    }
    return { legal, unavailable };
  }

  /**
   * 装配一条特性到魂骨实例。只抽一次并返回冻结结果，不修改池。
   * @param {object} input { boneId, years, slot, rng, excludeDefinitionIds, stackCounts }
   */
  function assemble(input) {
    if (typeof input.boneId !== 'string' || !input.boneId) throw new Error('装配须绑定魂骨实例ID');
    if (!input.rng || typeof input.rng.die !== 'function') throw new Error('特性装配须使用游戏确定性投骰器');
    const { legal, unavailable } = candidates(input);
    if (!traits.size) {
      return { status: 'pending', reason: PENDING.EMPTY_TRAIT_POOL, trait: null, candidates: 0, unavailable, roll: null };
    }
    if (!legal.length) {
      return { status: 'pending', reason: PENDING.NO_LEGAL_TRAIT, trait: null, candidates: 0, unavailable, roll: null };
    }
    const mapped=legal.every(t=>Array.isArray(t.rRanges)&&t.rRanges.length);
    let chosen,face,total,sourceFace=null,category=null;
    if(mapped){
      const tickets=legal.flatMap(t=>t.rRanges.flatMap(r=>Array.from({length:r.max-r.min+1},(_,i)=>({trait:t,sourceFace:r.min+i,category:r.category})))).sort((a,b)=>a.sourceFace-b.sourceFace);
      if(new Set(tickets.map(t=>t.sourceFace)).size!==tickets.length)throw new Error('特性池中R出目存在跨定义重复');
      total=tickets.length;face=total===1?1:drawWeightedFace(input.rng,total,'魂骨特性1d100分类',{boneId:input.boneId});
      const ticket=tickets[face-1];chosen=ticket.trait;sourceFace=ticket.sourceFace;category=ticket.category;
    }else{
      const weights=legal.map(t=>t.weight||1);total=weights.reduce((a,b)=>a+b,0);face=legal.length===1?total:drawWeightedFace(input.rng,total,'魂骨特性装配',{boneId:input.boneId});
      let cursor=face,index=0;for(;index<legal.length;index++){cursor-=weights[index];if(cursor<=0)break;}chosen=legal[index];
    }
    const assembled = {
      traitId: chosen.id,
      name: chosen.name,
      effect: chosen.effect,
      definitionVersion: raw.poolVersion,
      implementationVersion: chosen.implementationVersion || 1,
      handler: chosen.handler,
      params: clone(chosen.params || {}),
      sourceBoneId: input.boneId,
      assemblyVersion: VERSIONS.soulboneTraitAssembly,
      stackGroup: chosen.stackGroup || chosen.id,
      maxStacks: chosen.maxStacks || 1,
      save: clone(chosen.save || { schemaVersion: 1, fields: [] }),
      dependsOn: clone(chosen.dependsOn || [])
    };
    return Object.freeze({
      status: 'assembled',
      reason: null,
      trait: deepFreeze(assembled),
      candidates: legal.length,
      unavailable,
      roll: { sides: total, face, label: '魂骨特性装配', weighted: true, sourceFace, category, conditional: mapped && total!==100, degenerate: legal.length === 1 }
    });
  }

  function status() {
    return {
      empty: traits.size === 0,
      count: traits.size,
      pendingReason: traits.size === 0 ? PENDING.EMPTY_TRAIT_POOL : null,
      definitionErrors: errors,
      poolVersion: raw.poolVersion,
      handlers: registry.list()
    };
  }

  return Object.freeze({ assemble, candidates, status, list: () => [...traits.values()].map((trait) => clone(trait)), SLOTS });
}

module.exports = { createTraitPool, validateTraitDefinition, emptyPool, SLOTS, DATA_PATH };
