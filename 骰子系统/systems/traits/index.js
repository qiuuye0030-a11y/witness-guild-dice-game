/* 魂性谱 v2 — 数值预算、自动匹配玩家选择、编目与查重；独立于主游戏。 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)
    module.exports=factory(require('./tables.js'),require('../dice/engine.js'),require('./balance.js'),require('./naming.js'));
  else root.WitnessTraits=factory(root.WitnessTraitTables,root.WitnessDice,root.WitnessTraitBalance,root.WitnessTraitNames);
})(typeof globalThis==='undefined'?this:globalThis,function(T,D,B,N){
  'use strict';
  if(!T||!D||!B)throw Error('魂性谱需要先加载tables.js、balance.js和骰子引擎');
  const VERSION=2,SEED='魂性谱-v1-20261016';
  const clone=x=>JSON.parse(JSON.stringify(x));
  // UI prose is derived from the binding, never copied into a character save.
  function brief(t){
    if(!t)return '';
    const lead=t.kind==='growth'?'魂性渐明':({window:'魂性共鸣',reserve:'魂蕴待发',stack:'积势成锋',convert:'借势化用'})[t.spec.settlement];
    const effect=t.kind==='growth'?({progress:'修行精进',reliability:'补拙固本',insight:'悟法精进'})[t.spec.benefit]:({economy:'施术省力',preparation:'凝魂迅捷',potency:'魂技增幅'})[t.spec.benefit];
    return (lead||'魂性共鸣')+'，'+(effect||(t.kind==='growth'?'修行精进':'魂技增幅'));
  }
  function freeze(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.freeze(x);for(const v of Object.values(x))freeze(v);}return x;}
  freeze(T);
  const normalizeName=s=>String(s||'').normalize('NFKC').replace(/[\p{P}\p{Z}\p{C}]/gu,'').toLowerCase();
  function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
  function itemById(items,id){return items.find(x=>(Array.isArray(x)?x[0]:x.id)===id);}
  function suggestNames(t){
    if(!t||typeof t.soulName!=='string'||!T.attributes[t.primaryAttribute]?.includes(t.keyword))throw Error('取名需要武魂名、合法属性与关键词');
    return N.candidates(t,{limit:1088});
  }

  function validateTrait(t){
    const errors=[];
    if(!t||typeof t!=='object')return ['特性不是对象'];
    for(const key of ['id','soulId','name','soulName','description'])if(typeof t[key]!=='string'||!t[key].trim())errors.push('缺少'+key);
    if(t.schemaVersion!==VERSION)errors.push('不支持的特性结构版本');
    if(!T.attributes[t.primaryAttribute]?.includes(t.keyword))errors.push('属性/关键词不匹配');
    if(!['battle','growth'].includes(t.kind))errors.push('类别无效');
    if(!Array.isArray(t.sourceAttributes)||!t.sourceAttributes.includes(t.primaryAttribute))errors.push('主属性不在武魂来源属性中');
    if(!Array.isArray(t.mechanismKeywords)||t.mechanismKeywords.length!==1||t.mechanismKeywords[0]!==t.keyword)errors.push('必须且只能保留一个机制关键词');
    const s=t.spec;
    if(!s)return [...errors,'缺少被动机制'];
    const events=(T.triggers[t.kind]||[]).flatMap(g=>g.variants.map(v=>v[0]));
    if(!events.includes(s.event))errors.push('触发事件无效');
    if(!itemById(T.qualifiers[t.kind]||[],s.condition))errors.push('触发限制无效');
    if(!itemById(T.settlements,s.settlement))errors.push('兑现方式无效');
    if(!itemById(T.expiries[t.kind]||[],s.expiry))errors.push('失效规则无效');
    if(!itemById(T.benefits[t.kind]||[],s.benefit))errors.push('收益机制无效');
    const expected=itemById(T.benefits[t.kind]||[],s.benefit)?.routes.map(r=>r[0]);
    if(canonical(s.applicableContexts)!==canonical(expected))errors.push('自动适用上下文与收益机制不符');
    if(t.routes!==undefined||t.selectedRoute!==undefined||t.routing!=='follow-player-choice')errors.push('v2不允许玩家另选特性培养分支');
    if(t.status!=='budgeted-spec'||t.runtimeEnabled!==false)errors.push('本版为独立数值接口，尚未挂接主游戏');
    try{if(canonical(t.balance)!==canonical(B.profile(t))||canonical(t.autoEffects)!==canonical(B.autoEffects(t)))errors.push('数值或自动效果与分档预算不符');}catch(error){errors.push(error.message);}
    return errors;
  }
  // 不含ID、名称、描述、属性标签、关键词、档位和预算数字。
  // 同一被动只改名称/属性文案/强度，仍视作机制重复。
  function fingerprint(t){
    const errors=validateTrait(t);if(errors.length)throw Error(errors.join('；'));
    const s=t.spec;
    return canonical({kind:t.kind,event:s.event,condition:s.condition,settlement:s.settlement,expiry:s.expiry,benefit:s.benefit,applicableContexts:s.applicableContexts});
  }
  function skeleton(t){const s=t.spec;return canonical({kind:t.kind,event:s.event,settlement:s.settlement,benefit:s.benefit});}
  function groupDuplicates(items,key){const groups=new Map();for(const t of items){const k=key(t);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t.soulId);}return [...groups].filter(([,ids])=>ids.length>1).map(([signature,soulIds])=>({signature,soulIds,count:soulIds.length}));}
  function audit(items,{catalog}={}){
    if(!Array.isArray(items))throw Error('待检查特性必须为数组');
    const invalid=[];for(const [index,t]of items.entries()){const errors=validateTrait(t);if(errors.length)invalid.push({index,soulId:t?.soulId||null,errors});}
    const valid=items.filter(t=>!validateTrait(t).length);
    const duplicateSoulIds=groupDuplicates(valid,t=>t.soulId),duplicateTraitIds=groupDuplicates(valid,t=>t.id);
    const duplicateNames=groupDuplicates(valid,t=>normalizeName(t.name));
    const duplicateMechanics=groupDuplicates(valid,fingerprint),similarFamilies=groupDuplicates(valid,skeleton);
    const expected=catalog?new Set(catalog.map(s=>s.id)):null,actual=new Set(valid.map(t=>t.soulId));
    const missingSoulIds=expected?[...expected].filter(id=>!actual.has(id)):[];
    const unknownSoulIds=expected?[...actual].filter(id=>!expected.has(id)):[];
    const mismatchedBindings=catalog?valid.filter(t=>{const s=catalog.find(x=>x.id===t.soulId);return s&&(s.name!==t.soulName||s.tier!==t.tier);}).map(t=>t.soulId):[];
    const ok=!invalid.length&&!duplicateSoulIds.length&&!duplicateTraitIds.length&&!duplicateNames.length&&!duplicateMechanics.length&&!missingSoulIds.length&&!unknownSoulIds.length&&!mismatchedBindings.length;
    return {schemaVersion:VERSION,ok,total:items.length,valid:valid.length,invalid,duplicateSoulIds,duplicateTraitIds,duplicateNames,duplicateMechanics,similarFamilies,missingSoulIds,unknownSoulIds,mismatchedBindings,
      caveat:'零严格重复仅表示结构签名不同；相近家族仍需审阅，不能据此宣称全库均为全新战斗玩法。'};
  }
  function sourceAttributes(soul){
    let tags=[...new Set([...(soul.elements||[]),...(soul.mechanisms||[])])];
    if(!tags.length){if(soul.ordinary_no_attribute||/普通/.test(soul.attribute||''))tags=['普通'];else tags=String(soul.attribute||'').replace(/^(复合|无属性|单属性)[·：:]?/,'').split(/[\/／、]/).filter(Boolean);}
    if(!tags.length)throw Error(soul.id+'没有可识别属性');
    for(const tag of tags)if(!T.attributes[tag])throw Error(soul.id+'的属性未登记：'+tag);
    return tags.sort((a,b)=>Object.keys(T.attributes).indexOf(a)-Object.keys(T.attributes).indexOf(b));
  }
  function die(rng,sides,step,trace){const before=rng.state,value=sides===1?1:rng.die(sides);trace.push({step,sides,value,before,after:rng.state});return value;}
  function describe(t){
    const groups=T.triggers[t.kind],g=groups.find(g=>g.variants.some(v=>v[0]===t.spec.event));
    const event=g.variants.find(v=>v[0]===t.spec.event)[1];
    const condition=itemById(T.qualifiers[t.kind],t.spec.condition)[1],mode=itemById(T.settlements,t.spec.settlement);
    const expiry=t.kind==='growth'&&t.spec.expiry==='stage'?'跨越2个正常培养阶段后失效':itemById(T.expiries[t.kind],t.spec.expiry)[1],benefit=itemById(T.benefits[t.kind],t.spec.benefit);
    const low=t.activation==='mundane'?'1—2档仅按原有物性、技巧和练习习惯解释，不赋予超凡造物或改写骰果。':'';
    return `${event}时，在“${condition}”条件下，${mode.text}。收益随玩家接下来正常选择的训练或魂技自动匹配，不额外选择特性分支。${t.autoEffects.map(e=>e.when+'：'+e.effect).join('；')}。${expiry}。${B.budgetText(t)}${B.timingText(t)}以${t.soulName}的“${t.keyword}”表现为载体：${T.images[t.primaryAttribute]}。${low}`;
  }
  function makeCandidate(soul,seed,base,attempt){
    const rng=new D.DiceEngine(seed+'|candidate|'+soul.id+'|'+attempt),trace=[];
    const groups=T.triggers[base.kind],groupIndex=die(rng,6,'被动触发目录',trace)-1,g=groups[groupIndex];
    const variantIndex=die(rng,3,'触发子项',trace)-1,variant=g.variants[variantIndex];
    const mode=T.settlements[die(rng,4,'兑现方式',trace)-1];
    const qualifier=T.qualifiers[base.kind][die(rng,8,'条件细分',trace)-1];
    const benefit=T.benefits[base.kind][die(rng,3,'开放培养用途组',trace)-1];
    const expiry=T.expiries[base.kind][die(rng,3,'失效方式',trace)-1];
    // 已越过生命/魂力低线时不再要求同资源高位；避免逻辑上不能触发。
    if(variant[0]==='mp_fall'&&qualifier[0]==='mp_high'||variant[0]==='hp_fall'&&qualifier[0]==='hp_high')return null;
    const trait={schemaVersion:VERSION,id:'trait:'+soul.id,soulId:soul.id,soulName:soul.name,tier:soul.tier,
      sourceAttributes:base.attributes,primaryAttribute:base.attribute,secondaryAttributes:base.attributes.filter(x=>x!==base.attribute),
      keyword:base.keyword,mechanismKeywords:[base.keyword],kind:base.kind,category:base.kind==='battle'?'战斗类':'成长类',
      // Legacy token replays historical candidate selection only.
      // The final naming pass uses attributes and never spec subdirectories.
      name:`${soul.name}·${base.keyword}${({window:'回响',reserve:'藏韵',stack:'叠势',convert:'化用'})[mode.id]}`,
      soulExpression:soul.feature||'',sourceKind:soul.main_kind||soul.kind,activation:soul.tier<=2?'mundane':'supernatural',
      spec:{event:variant[0],condition:qualifier[0],settlement:mode.id,expiry:expiry[0],benefit:benefit.id,applicableContexts:benefit.routes.map(r=>r[0])},
      limits:{perCastTrigger:1,recursiveTrigger:false,extraActions:false,consumeAndGenerateSameEvent:false,
        actualConversionBaseRequired:true,battleResets:true,growthStageCapRequired:true,hardControlUsesNormalContest:true,
        values:'pending-balance',noXPFormulaOverride:true},
      status:'design-draft',runtimeEnabled:false,
      provenance:{seed,initialRolls:base.trace,candidateAttempt:attempt+1,candidateRolls:trace,selection:'固定属性、关键词、类别后，只重抽发生冲突的下级目录'},
      description:''};
    const balanced=B.attach(trait);balanced.description=describe(balanced);return balanced;
  }
  function generate(catalog,{seed=SEED,maxAttempts=20000,existing,nameSeed}={}){
    if(!Array.isArray(catalog)||!catalog.length)throw Error('武魂库必须为非空数组');
    if(typeof seed!=='string'||!seed)throw Error('seed须为非空字符串');
    if(!Number.isInteger(maxAttempts)||maxAttempts<1)throw Error('maxAttempts无效');
    const inputIds=new Set();for(const s of catalog){if(!s||typeof s.id!=='string'||!s.id||typeof s.name!=='string'||!s.name||!Number.isInteger(s.tier)||s.tier<1||s.tier>10)throw Error('武魂记录格式无效');if(inputIds.has(s.id))throw Error('源武魂ID重复：'+s.id);inputIds.add(s.id);}
    const sorted=[...catalog].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),items=[],names=new Set(),mechanics=new Set();
    const retained=new Map();
    if(existing){
      const previous=clone(Array.isArray(existing)?existing:existing.items),previousReport=audit(previous);
      if(!previousReport.ok)throw Error('已有绑定未通过查重，拒绝增量生成');
      for(const t of previous){const soul=catalog.find(s=>s.id===t.soulId);if(!soul||soul.name!==t.soulName||soul.tier!==t.tier||canonical(sourceAttributes(soul))!==canonical(t.sourceAttributes))throw Error('已有绑定与新武魂库不一致：'+t.soulId);retained.set(t.soulId,t);names.add(normalizeName(t.name));mechanics.add(fingerprint(t));}
    }
    let collisions=0,invalidCombinations=0;
    for(const soul of sorted){
      if(retained.has(soul.id)){items.push(retained.get(soul.id));continue;}
      const rng=new D.DiceEngine(seed+'|identity|'+soul.id),trace=[],attributes=sourceAttributes(soul);
      const mechanisms=attributes.filter(a=>(soul.mechanisms||[]).includes(a));
      const pool=mechanisms.length?mechanisms:attributes;
      const attribute=pool[die(rng,pool.length,'复合属性机制来源（仅选一种）',trace)-1];
      const keyword=T.attributes[attribute][die(rng,2,'属性关键词',trace)-1];
      const kind=die(rng,2,'战斗或成长',trace)===1?'battle':'growth';
      const base={attributes,attribute,keyword,kind,trace};let accepted=false;
      for(let attempt=0;attempt<maxAttempts;attempt++){
        const trait=makeCandidate(soul,seed,base,attempt);if(!trait){invalidCombinations++;continue;}
        const name=normalizeName(trait.name),signature=fingerprint(trait);
        if(names.has(name)||mechanics.has(signature)){collisions++;continue;}
        items.push(trait);names.add(name);mechanics.add(signature);accepted=true;break;
      }
      if(!accepted)throw Error('候选空间耗尽，未绑定：'+soul.id+'；请扩展目录，禁止用ID后缀伪造独特性');
    }
    const namingSeed=nameSeed||(Array.isArray(existing)?existing[0]?.naming?.seed:existing?.nameMigration?.seed||existing?.items?.[0]?.naming?.seed)||'属性命名-v11';const renamed=N.renameTraits(items,{seed:namingSeed});items.splice(0,items.length,...renamed.items);
    const report=audit(items,{catalog});
    if(!report.ok)throw Error('生成后查重失败');
    return {schemaVersion:VERSION,name:'魂性谱',gameVersion:'v11',seed,items,report,
      generation:{collisionsRejected:collisions,invalidCombinationsRejected:invalidCombinations,retainedBindings:retained.size,order:'按武魂ID固定排序；固定种子与同一武魂库可重放；扩库时传入existing保留旧绑定',balanceStatus:'接口v2、收益矩阵3；主游戏适配器已接入，独立生成过程不运行对战'}};
  }
  function createRegistry(data,{catalog}={}){
    const items=clone(Array.isArray(data)?data:data?.items),report=audit(items,{catalog});
    if(!report.ok)throw Error('特性库校验失败：'+JSON.stringify({invalid:report.invalid.length,names:report.duplicateNames.length,mechanics:report.duplicateMechanics.length,soulIds:report.duplicateSoulIds.length,missing:report.missingSoulIds.length,unknown:report.unknownSoulIds.length}));
    freeze(items);const bySoul=new Map(items.map(t=>[t.soulId,t])),byName=new Map(items.map(t=>[normalizeName(t.name),t]));
    return Object.freeze({
      version:VERSION,size:items.length,
      getBySoulId(id){return bySoul.get(id)||null;},
      getForCharacter(character){const id=character?.soulId||character?.soul?.id,t=bySoul.get(id);if(!t)return null;const effectiveTier=character?.effectiveTier??character?.soul?.tier??t.tier;if(effectiveTier===t.tier)return t;const out=B.attach({...clone(t),effectiveTier});out.description=describe(out);return freeze(out);},
      list({attribute,kind,tier,query='',offset=0,limit=50}={}){if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>5000)throw Error('分页参数无效');if(tier!==undefined&&(!Number.isInteger(tier)||tier<1||tier>10))throw Error('潜力档位无效');const q=String(query).trim();const filtered=items.filter(t=>(!attribute||t.sourceAttributes.includes(attribute))&&(!kind||t.kind===kind)&&(tier===undefined||t.tier===tier)&&(!q||[t.soulId,t.soulName,t.name,t.description,t.soulExpression].some(s=>s.includes(q))));return {total:filtered.length,items:filtered.slice(offset,offset+limit)};},
      audit(){return clone(report);},
      checkCandidate(candidate,{replaceSoulId}={}){const errors=validateTrait(candidate);if(errors.length)return {ok:false,errors};const rest=items.filter(t=>t.soulId!==replaceSoulId);return audit([...rest,candidate]);},
      checkName(name,{replaceSoulId}={}){const normalized=normalizeName(name);return {ok:!!normalized&&!items.some(t=>t.soulId!==replaceSoulId&&normalizeName(t.name)===normalized),normalized,matches:items.filter(t=>t.soulId!==replaceSoulId&&normalizeName(t.name)===normalized).map(t=>({soulId:t.soulId,name:t.name}))};},
      suggestNames(candidate,{replaceSoulId}={}){return suggestNames(candidate).filter(name=>{const found=byName.get(normalizeName(name));return !found||found.soulId===replaceSoulId;}).slice(0,16);},
      createState(soulId,scopeId,options){const t=bySoul.get(soulId);if(!t)throw Error('未知武魂ID：'+soulId);return B.createState(t,scopeId,options);},
      recordEvent(soulId,state,event){const t=bySoul.get(soulId);if(!t)throw Error('未知武魂ID：'+soulId);return B.recordEvent(t,state,event);},
      applyToChoice(soulId,state,choice){const t=bySoul.get(soulId);if(!t)throw Error('未知武魂ID：'+soulId);return B.applyToChoice(t,state,choice);},
      export(){return {schemaVersion:VERSION,items:clone(items)};}
    });
  }
  function upgrade(data){const copyData=clone(data);const items=Array.isArray(copyData)?copyData:copyData.items;for(let i=0;i<items.length;i++){items[i]=B.attach(items[i]);items[i].description=describe(items[i]);}if(!Array.isArray(copyData)){copyData.schemaVersion=VERSION;copyData.report=audit(items);}return copyData;}
  return Object.freeze({version:VERSION,naming:N,brief,defaultSeed:SEED,tables:T,balance:B,upgrade,generate,createRegistry,audit,validateTrait,fingerprint,normalizeName,suggestNames});
});
