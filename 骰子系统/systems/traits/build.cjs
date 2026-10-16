/* 仅构建特性编目，不运行游戏、旅程或对战模拟。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const api=require('./index.js');
const dir=__dirname,systems=path.dirname(dir),game=path.resolve(dir,'../../..');
const catalogPath=path.join(game,'武魂十档候选库.json');
const examinerPath=path.join(systems,'battle/examiners.js');
const challengePath=path.join(systems,'challenge/battle.js');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function readCatalog(){
  const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8').replace(/^\uFEFF/,''));
  const sandbox={};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(examinerPath,'utf8'),sandbox,{timeout:2000});
  if(!Array.isArray(sandbox.WitnessTemplates))throw Error('找不到正式会员模板');
  const npcs=JSON.parse(JSON.stringify(sandbox.WitnessTemplates)).map(t=>({
    id:'npc-'+t.id,name:t.weapon,tier:7,main_kind:t.kind,subkind:t.subkind,
    attribute:t.attribute,elements:[],mechanisms:[],style:t.style,source:'10.08会员模板·'+t.name,
    feature:t.skills.map(s=>s.name+'：'+s.description).join('；'),npcTemplateId:t.id,owner:t.name
  }));
  // challenge/battle.js实际使用data.id= guildmaster_xuejidong，templateUnit前缀npc-。
  const challengeText=fs.readFileSync(challengePath,'utf8');
  if(!challengeText.includes("const id='guildmaster_xuejidong'"))throw Error('会长ID发生变化，请复核适配');
  const base=npcs.find(t=>t.id==='npc-xuejidong');if(!base)throw Error('缺少普通雪寂冬');
  npcs.push({...base,id:'npc-guildmaster_xuejidong',source:'10.08独立会长挑战',npcTemplateId:'guildmaster_xuejidong',owner:'会长版雪寂冬',feature:base.feature+'；会长挑战另有真身、寒龙撕天爪、绝对零度吐息及独立被动；本条新特性仍为设计草案，不替换原设。'});
  return {catalog,npcs,all:[...catalog,...npcs]};
}
function build(){
  const source=readCatalog(),namingPrevious=fs.existsSync(path.join(dir,'traits.json'))?JSON.parse(fs.readFileSync(path.join(dir,'traits.json'),'utf8')):null,payload=api.generate(source.all,{nameSeed:namingPrevious?.nameMigration?.seed||'属性命名-v11'});
  const previousPath=path.join(dir,'traits.json');
  const identity=t=>JSON.stringify({soulId:t.soulId,name:t.name,primaryAttribute:t.primaryAttribute,keyword:t.keyword,kind:t.kind,event:t.spec.event,condition:t.spec.condition,settlement:t.spec.settlement,expiry:t.spec.expiry,benefit:t.spec.benefit});
  if(fs.existsSync(previousPath)){
    const previous=JSON.parse(fs.readFileSync(previousPath,'utf8')),old=new Map(previous.items.map(t=>[t.soulId,identity(t)]));
    const changed=payload.items.filter(t=>old.has(t.soulId)&&old.get(t.soulId)!==identity(t)).map(t=>t.soulId);
    if(changed.length)throw Error('已有特性身份发生变化，停止覆盖：'+changed.slice(0,5).join('、'));
    payload.nameMigration=previous.nameMigration||null;
    payload.migration={fromVersion:previous.migration?.fromVersion??previous.schemaVersion,toVersion:api.version,preservedBindings:payload.items.filter(t=>old.has(t.soulId)).length,changedBindings:changed.length,routeMigration:'移除手选培养分支，自动跟随玩家正常训练或魂技'};
  }
  payload.source={catalog:'../../../武魂十档候选库.json',catalogSHA256:sha(fs.readFileSync(catalogPath)),catalogCount:source.catalog.length,
    examinerSHA256:sha(fs.readFileSync(examinerPath)),npcCount:source.npcs.length,challengeSHA256:sha(fs.readFileSync(challengePath)),
    gameVersion:'v11',combatRulesVersion:17,cultivationRulesVersion:10081};
  payload.generation.balanceStatus='v11预算矩阵3：延长兑现窗口，增加稀有条件补偿与分档收益；已接主游戏，数值验算见v11报告';
  payload.integration={gameVersion:'v11',enabled:true,battleAdapter:'systems/battle/traits.js',growthAdapter:'systems/campaign/traits.js',note:'定义与预算端口保持独立；主游戏通过适配器自动触发。runtimeEnabled:false属于可复用规格对象，主游戏启用状态见WitnessTraitRuntime.enabled。'};
  const ownerMap=new Map(source.npcs.map(s=>[s.id,s.owner]));
  for(const t of payload.items){t.bindingScope=t.soulId.startsWith('npc-')?'member':'catalog';if(ownerMap.has(t.soulId))t.owner=ownerMap.get(t.soulId);}
  const json=JSON.stringify(payload,null,2)+'\n';
  fs.writeFileSync(path.join(dir,'traits.json'),json);
  fs.writeFileSync(path.join(dir,'traits-data.js'),'/* 魂性谱自动生成数据；修改词库后重建。 */\nglobalThis.WitnessTraitData='+JSON.stringify(payload).replace(/</g,'\\u003c')+';\n');
  fs.writeFileSync(path.join(dir,'audit.json'),JSON.stringify(payload.report,null,2)+'\n');
  const r=payload.report,byClass={},byAttribute={};
  for(const t of payload.items){byClass[t.category]=(byClass[t.category]||0)+1;byAttribute[t.primaryAttribute]=(byAttribute[t.primaryAttribute]||0)+1;}
  const samples=['T01-01',...source.catalog.filter(s=>['冰碧蝎','蓝银皇','天书','幽灵','噬灵锤'].includes(s.name)).map(s=>s.id),'npc-qinyan','npc-anjingwen','npc-linshi'];
  const lookup=new Map(payload.items.map(t=>[t.soulId,t]));
  const md=['# 魂性谱v2 · 编目与查重报告','','v11沿用独立v2预算端口，并通过战斗、成长适配器实际接入主游戏。数值验算另见v11报告；重建此编目本身不运行战斗。','',
    `- 覆盖：${source.catalog.length}个可觉醒武魂ID＋${source.npcs.length}个实际会员/会长武魂ID，共${payload.items.length}条。`,
    `- 名称重复：${r.duplicateNames.length}组；严格机制重复：${r.duplicateMechanics.length}组。`,
    `- 漏绑：${r.missingSoulIds.length}；多绑：${r.duplicateSoulIds.length}组；未知ID：${r.unknownSoulIds.length}。`,
    `- 相近机制家族：${r.similarFamilies.length}组，详见audit.json。它们共享触发事件、兑现方式和收益组，只在条件或失效规则上不同，属于应人工审阅的近似设计。`,
    `- 生成时拒绝重复候选${payload.generation.collisionsRejected}次，拒绝逻辑冲突组合${payload.generation.invalidCombinationsRejected}次。`,
    '- 查重签名排除ID、名字、描述、属性、关键词、档位和强度数字；换名字、换属性文案、只改倍率不能避开严格查重。',
    '- 唯一性是全库结构唯一，不是宣称每条都有全新的核心玩法。自动目录仍会产生相似设计。',
    '- 固定种子仅负责武魂ID绑定，使用独立DiceEngine，不消耗玩家当前骰序。',
    '- 不再有手选培养分支：每次只影响玩家已选训练项或已选魂技的对应数值。',
    '- 数值作用于现有修正后的实际基数，不再乘武魂G/K、天赋或训练倍率；XP加成为零。','',
    '## 1—10档基础预算','',
    '|武魂潜力|基础战斗效力|基础减耗|基础读条缩短|成长比例上限|阶段成长点数上限|',
    '|---|---|---|---|---|---|',
    ...api.balance.RATES.map((r,i)=>`|${i+1}|${Math.round(r*10000)/100}%|${Math.round(r*4500)/100}%|${Math.round(r*6000)/100}%|${Math.round(r*5000)/100}%|${Math.round((.5+(i+1)*.25)*100)/100}|`),
    '', '战斗兑现系数：即时×1、储存×0.9、叠层×1.25、转化×1.1；转化另乘真实贡献比例。成长比例为每阶段总额上限，不随上述系数放大。','',
    '## 类别分布','',...Object.entries(byClass).map(([k,v])=>`- ${k}：${v}`),'','## 属性机制来源分布','',...Object.entries(byAttribute).map(([k,v])=>`- ${k}：${v}`),'','## 样例',''];
  for(const id of samples){const t=lookup.get(id);if(!t)continue;md.push(`### ${t.name}`,``, `武魂ID：${id}；${t.category}；机制来源：${t.primaryAttribute}／${t.keyword}。`,'',t.description,'',`原武魂表现：${t.soulExpression}`,'');}
  fs.writeFileSync(path.join(dir,'编目与查重报告.md'),md.join('\n'));
  const template=fs.readFileSync(path.join(dir,'viewer.template.html'),'utf8');
  const safe=JSON.stringify(payload).replace(/</g,'\\u003c');
  fs.writeFileSync(path.join(dir,'魂性谱.html'),template.replace('/*__PAYLOAD__*/',`const payload=${safe};`));
  console.log(JSON.stringify({total:payload.items.length,catalog:source.catalog.length,npc:source.npcs.length,ok:r.ok,
    duplicateNames:r.duplicateNames.length,duplicateMechanics:r.duplicateMechanics.length,similarFamilies:r.similarFamilies.length,
    generation:payload.generation,classes:byClass},null,2));
  return payload;
}
module.exports={readCatalog,build};
if(require.main===module)build();
