/* 魂性谱接口v2／收益矩阵3：预算与纯结算函数，主游戏通过独立适配器接入。 */
(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WitnessTraitBalance=api;
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const VERSION=2,BUDGET_VERSION=3,RATES=[.06,.08,.10,.12,.14,.16,.18,.20,.23,.27];
  const KEYS=['B','S','C','D','A','P'];
  const LABELS={B:'肉体强度',S:'魂力强度',C:'魂力操纵',D:'防御素质',A:'敏捷',P:'精神力'};
  const clone=x=>JSON.parse(JSON.stringify(x)),round=n=>Math.round((n+Number.EPSILON)*10000)/10000;
  const floor2=n=>Math.floor((n+1e-9)*100)/100,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function number(n,label,{integer=false}={}){if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e12||integer&&!Number.isInteger(n))throw Error(label+'须为0—10^12内的'+(integer?'整数':'有限数'));return n;}
  function tier(n){if(!Number.isInteger(n)||n<1||n>10)throw Error('武魂潜力须为1—10档整数');return n;}
  const pct=n=>(round(n*100)).toString()+'%';
  function profile(trait,effectiveTier=trait.effectiveTier??trait.tier){
    const rank=tier(effectiveTier),rate=RATES[rank-1],factor={window:1,reserve:.9,stack:1.25,convert:1.1}[trait.spec.settlement];
    if(!factor)throw Error('未知兑现方式');
    const rare=['mp_fall','hp_fall','shield_broken','control_ended','protection_end','cooldown_ready','training_milestone','skill_milestone','adapt_milestone'].includes(trait.spec.event)||trait.spec.condition==='first_method';
    const rarity=(rare?1.3:1)*(['hp_low','mp_low','shielded','changed_last'].includes(trait.spec.condition)?1.15:1);
    return {
      version:BUDGET_VERSION,tier:rank,baseRate:rate,rarityMultiplier:round(rarity),
      battle:{potencyRate:round(Math.min(.50,rate*factor*rarity)),costReduction:round(Math.min(.18,rate*.45*factor*rarity)),castReduction:round(Math.min(.22,rate*.60*factor*rarity)),
        controlDurationRate:round(Math.min(.12,rate*.35*factor*rarity)),controlExtraSecondsCap:.50,buffRelativeRate:round(Math.min(.20,rate*.5*factor*rarity)),buffExtraPointsCap:.05,
        cooldownSeconds:4,maxUses:8,stackTarget:rare?1:2,windowSeconds:12,reserveSeconds:20,stackSeconds:28,conversionSeconds:18,actionTTL:4},
      growth:{rate:round(rate*.5),flatInsight:round(rank*.06),deficitRecovery:.35,stageFlatCap:round(.5+rank*.25),
        maxUsesPerStage:2,stackTarget:rare?1:2,choiceTTL:3,stageTTL:2},
      thresholds:{high:.5,low:.5},
      scaling:'只对已结算的当次基础效果加成，不再乘G、K、天赋或训练倍率',
      routing:'follow-player-choice',xpBonus:0,extraActions:0,controlChanceBonus:0,cooldownReduction:0
    };
  }
  function autoEffects(trait){
    const p=profile(trait);
    if(trait.kind==='growth'){
      const effect=trait.spec.benefit==='progress'?`当次有效训练成果增加${pct(p.growth.rate)}`:
        trait.spec.benefit==='reliability'?`弥补当次正常预期与实际成果差额的35%，最多正常成果的${pct(p.growth.rate)}；没有差额时增加实际成果的${pct(p.growth.rate*.5)}`:
        `当次训练增加最多${p.growth.flatInsight}点领悟收益，且不超过正常成果的${pct(p.growth.rate)}`;
      return [{when:'玩家已选的正常训练或训练型事件',effect:effect+'，自动加到本次实际结算的能力项；XP与精神稳定W不加成'}];
    }
    if(trait.spec.benefit==='economy')return [{when:'当次付费攻击、防护、控制、强化或减益魂技',effect:`实际魂力消耗降低${pct(p.battle.costReduction)}，最低仍支付1点；不恢复魂力`}];
    if(trait.spec.benefit==='preparation')return [{when:'当次需要读条的攻击、防护、控制、强化或减益魂技',effect:`读条缩短${pct(p.battle.castReduction)}，最低0.5秒；不影响行动条与冷却`}];
    return [
      {when:'攻击或持续伤害魂技',effect:`整次施法总伤害增加${pct(p.battle.potencyRate)}，多段与持续伤害共享一次预算`},
      {when:'有明确盾量的防护魂技',effect:`整次施法总盾量增加${pct(p.battle.potencyRate)}`},
      {when:'正常判定成功的控制魂技',effect:`控制时长增加${pct(p.battle.controlDurationRate)}，单次最多增加0.5秒；不提高成功率、不绕过免控`},
      {when:'单项或多项强化／减益魂技',effect:`原效果相对提高${pct(p.battle.buffRelativeRate)}，整次施法合计最多增加5个百分点，不增加持续时间`}
    ];
  }
  function attach(trait){
    const t=clone(trait);t.schemaVersion=VERSION;t.status='budgeted-spec';t.runtimeEnabled=false;t.settlementEngineReady=true;
    if(t.spec.routeOptions){t.spec.applicableContexts=t.spec.routeOptions;delete t.spec.routeOptions;}
    t.routing='follow-player-choice';t.balance=profile(t);t.autoEffects=autoEffects(t);
    delete t.routes;delete t.selectedRoute;
    t.limits={...t.limits,selectedRoutes:undefined,autoMatchChoice:true,perChoiceEffects:1,values:'tier-budget-v2',noXPFormulaOverride:true};
    delete t.limits.selectedRoutes;
    return t;
  }
  function budgetText(t){const p=profile(t);return t.kind==='growth'?
    `每个正常培养阶段最多兑现${p.growth.maxUsesPerStage}次，阶段额外成长不超过实际正常训练基数的${pct(p.growth.rate)}且不超过${p.growth.stageFlatCap}点；不增加魂力经验。`:
    `兑现间隔至少${p.battle.cooldownSeconds}秒，每场最多${p.battle.maxUses}次；不额外赠送行动、冷却缩减或控制成功率。`;}
  function timingText(t){const p=profile(t);return t.kind==='growth'?
    `叠层目标为${p.growth.stackTarget}层；待用收益最多保留${p.growth.choiceTTL}次正常训练选择，或跨越${p.growth.stageTTL}个阶段后失效；方向/方法变化仍按该条失效规则执行。`:
    `叠层目标为${p.battle.stackTarget}层；即时窗口12秒、储存20秒、叠层28秒、转化18秒。若原规则按动作到期，则最多保留4次正常魂技选择。`;}
  function createState(trait,scopeId,{effectiveTier=trait.effectiveTier??trait.tier}={}){
    if(typeof scopeId!=='string'||!scopeId)throw Error('需要唯一战斗或旅程scopeId');
    return {version:VERSION,budgetVersion:BUDGET_VERSION,traitId:trait.id,scopeId,tier:tier(effectiveTier),pending:null,stacks:0,stackCredit:1,
      seen:[],uses:0,stageUses:{},stageBase:{},stageBonus:{},lastProcTime:null,lastTime:0,lastStage:0,
      choices:0,lastTrainingKey:null,lastMethod:null,lastTarget:null,lastProcStage:null,stackStage:null,stackTime:null};
  }
  function checkState(trait,state){
    if(!state||state.version!==VERSION||state.traitId!==trait.id||typeof state.scopeId!=='string'||!Array.isArray(state.seen))throw Error('特性状态不匹配或版本无效');
    tier(state.tier);for(const k of ['stacks','uses','choices','lastTime','lastStage'])number(state[k],k);
    if(state.seen.length>20000)throw Error('本作用域事件过多，请开始新的合法作用域');
    for(const dict of [state.stageUses,state.stageBase,state.stageBonus]){if(!dict||typeof dict!=='object'||Array.isArray(dict))throw Error('阶段账本无效');for(const v of Object.values(dict))number(v,'阶段账本值');}
    if(state.lastProcTime!==null)number(state.lastProcTime,'最近兑现时间');
    if(state.pending){number(state.pending.credit,'收益系数');if(state.pending.credit>1)throw Error('收益系数超出上限');number(state.pending.time,'待用时刻');number(state.pending.stage,'待用阶段');number(state.pending.choiceIndex,'待用选择序号');number(state.pending.ttl,'待用时限');}
  }
  function advance(trait,state,input){
    checkState(trait,state);const s=clone(state);s.budgetVersion=BUDGET_VERSION;
    if(typeof input.id!=='string'||!input.id)throw Error('每次调用需要稳定且唯一的id');
    if(input.scopeId!==undefined&&input.scopeId!==s.scopeId)throw Error('事件作用域与状态不一致');
    if(input.effectiveTier!==undefined)s.tier=tier(input.effectiveTier);
    const time=number(input.time??s.lastTime,'time'),stage=number(input.stage??s.lastStage,'stage',{integer:true});
    if(time<s.lastTime||stage<s.lastStage)throw Error('特性状态不能倒退时间或培养阶段');
    s.lastTime=time;s.lastStage=stage;
    const p=profile(trait,s.tier),e=s.pending;
    if(e){
      let expired=trait.kind==='battle'?(time-e.time>=e.ttl||s.choices-e.choiceIndex>=p.battle.actionTTL):
        (stage-e.stage>=p.growth.stageTTL||s.choices-e.choiceIndex>=p.growth.choiceTTL);
      if(trait.spec.expiry==='target_change'&&e.target&&input.target&&e.target!==input.target)expired=true;
      if(trait.spec.expiry==='direction_change'&&e.trainingKey&&input.trainingKey&&e.trainingKey!==input.trainingKey)expired=true;
      if(trait.spec.expiry==='method_change'&&e.method&&input.method&&e.method!==input.method)expired=true;
      if(expired)s.pending=null;
    }
    if(s.stacks){const stale=trait.kind==='battle'?time-(s.stackTime??time)>=p.battle.stackSeconds:stage-(s.stackStage??stage)>=p.growth.stageTTL;if(stale){s.stacks=0;s.stackCredit=1;}}
    return s;
  }
  function mark(s,id,phase){const key=phase+':'+id;if(s.seen.includes(key))return false;if(s.seen.length>=20000)throw Error('作用域事件已达上限');s.seen.push(key);return true;}
  function conditionMatches(condition,event){
    const hp=event.hpFraction,mp=event.mpFraction;
    for(const x of [hp,mp])if(x!==undefined&&(typeof x!=='number'||!Number.isFinite(x)||x<0||x>1))throw Error('资源比例须为0—1');
    const predicates={always:true,hp_high:hp>.5,hp_low:hp<=.5,mp_high:mp>.5,mp_low:mp<=.5,
      shielded:event.hasShield===true,unshielded:event.hasShield===false,changed_last:event.changedLast===true,
      focused:event.focused===true,dual:event.dual===true,rested:event.rested===true,reviewed:event.reviewed===true,
      first_method:event.firstMethod===true,familiar_method:event.familiarMethod===true,adapted_env:event.adaptedEnvironment===true};
    return predicates[condition]===true;
  }
  function recordEvent(trait,state,event){
    const s=advance(trait,state,event),p=profile(trait,s.tier);
    if(!mark(s,event.id,'event'))return {state:s,triggered:false,reason:'重复事件'};
    if(event.type!==trait.spec.event||!conditionMatches(trait.spec.condition,event))return {state:s,triggered:false,reason:'未满足触发条件'};
    if(event.generatedByTrait||event.valid===false)return {state:s,triggered:false,reason:'特性派生或无效训练不触发'};
    if(trait.kind==='battle'&&(s.uses>=p.battle.maxUses||s.lastProcTime!==null&&s.lastTime-s.lastProcTime<p.battle.cooldownSeconds))return {state:s,triggered:false,reason:'达到次数或间隔限制'};
    if(trait.kind==='growth'&&(s.stageUses[s.lastStage]||0)>=p.growth.maxUsesPerStage)return {state:s,triggered:false,reason:'本阶段次数已用完'};
    if(s.pending)return {state:s,triggered:false,reason:'已有待用收益，不刷新时限或叠加'};
    let credit=1;
    if(trait.spec.settlement==='convert'){
      const actual=number(event.actualContribution??0,'actualContribution'),reference=number(event.contributionReference??0,'contributionReference');
      if(actual<=0||reference<=0)return {state:s,triggered:false,reason:'没有真实可转化基数'};
      credit=clamp(actual/reference,0,1);
    }
    if(trait.spec.settlement==='stack'){
      if(!s.stacks){s.stackStage=s.lastStage;s.stackTime=s.lastTime;}s.stacks++;s.stackCredit=Math.min(s.stackCredit,credit);
      if(s.stacks<(trait.kind==='battle'?p.battle.stackTarget:p.growth.stackTarget))return {state:s,triggered:true,ready:false};
      credit=s.stackCredit;s.stacks=0;s.stackCredit=1;
    }
    const ttl={window:p.battle.windowSeconds,reserve:p.battle.reserveSeconds,stack:p.battle.stackSeconds,convert:p.battle.conversionSeconds}[trait.spec.settlement];
    s.pending={originId:event.id,time:s.lastTime,stage:s.lastStage,choiceIndex:s.choices,credit,ttl,
      trainingKey:event.trainingKey||s.lastTrainingKey,method:event.method||s.lastMethod,target:event.target||s.lastTarget};
    return {state:s,triggered:true,ready:true};
  }
  function routeFor(trait,choice){
    if(trait.kind==='growth'){const key=choice.rewardKey??choice.trainingKey;return KEYS.includes(key)?{field:'amount',key,label:LABELS[key]}:null;}
    if(choice.paid===false||choice.kind==='basic'||choice.action==='attack')return null;
    if(!['攻击','持续伤害','防御','控制','强化','减益'].includes(choice.category))return null;
    if(trait.spec.benefit==='economy')return choice.paid!==false?{field:'cost',label:'魂力消耗'}:null;
    if(trait.spec.benefit==='preparation')return {field:'castSeconds',label:'读条'};
    return {field:'amount',label:['攻击','持续伤害'].includes(choice.category)?'整次施法总伤害':choice.category==='防御'?'整次施法总盾量':choice.category==='控制'?'成功控制时长':'整次施法强化或减益幅度'};
  }
  function applyToChoice(trait,state,choice){
    const s=advance(trait,state,choice),out=clone(choice),p=profile(trait,s.tier);
    const result=(applied,reason,delta=0)=>({state:s,choice:out,applied,reason,delta,runtimeIntegration:'caller-applies-once'});
    if(!mark(s,choice.id,'choice'))return result(false,'重复结算');
    const route=routeFor(trait,choice);
    if(!route)return result(false,'该选择不适用；XP、精神稳定与额外资源不加成');
    const before=number(choice[route.field],route.field);
    if(route.field==='cost'&&before<1||route.field==='castSeconds'&&before<=.5)return result(false,'零消耗或已达读条下限，不增加负担');
    if(choice.validTraining===false||choice.generatedByTrait)return result(false,'无效训练或特性派生收益');
    let baseline=before;
    if(trait.kind==='growth'){
      baseline=Math.max(before,number(choice.expectedAmount??before,'expectedAmount'));
      s.stageBase[s.lastStage]=round((s.stageBase[s.lastStage]||0)+baseline);
    }
    s.choices++;
    const pending=s.pending;
    if(route.key||choice.trainingKey)s.lastTrainingKey=route.key||choice.trainingKey;if(choice.method)s.lastMethod=choice.method;if(choice.target)s.lastTarget=choice.target;
    if(!pending)return result(false,'尚无已触发的待用收益');
    if(pending.originId===choice.id)return result(false,'同一事件不能同时生成和消费收益');
    if(trait.kind==='battle'&&(s.uses>=p.battle.maxUses||s.lastProcTime!==null&&s.lastTime-s.lastProcTime<p.battle.cooldownSeconds))return result(false,'达到次数或间隔限制');
    let after=before;
    if(trait.kind==='growth'){
      if((s.stageUses[s.lastStage]||0)>=p.growth.maxUsesPerStage)return result(false,'本阶段次数已用完');
      const g=p.growth,credit=pending.credit;
      let bonus=trait.spec.benefit==='progress'?before*g.rate:
        trait.spec.benefit==='reliability'?(baseline>before?Math.min((baseline-before)*g.deficitRecovery,baseline*g.rate):before*g.rate*.5):
        Math.min(g.flatInsight,baseline*g.rate);
      const remaining=Math.max(0,Math.min(g.stageFlatCap,s.stageBase[s.lastStage]*g.rate)-(s.stageBonus[s.lastStage]||0));
      bonus=floor2(Math.min(bonus*credit,remaining));after=round(before+bonus);
      if(bonus>0){s.stageBonus[s.lastStage]=round((s.stageBonus[s.lastStage]||0)+bonus);s.stageUses[s.lastStage]=(s.stageUses[s.lastStage]||0)+1;}
    }else{
      const b=p.battle,credit=pending.credit;
      if(route.field==='cost')after=Math.max(1,Math.ceil(before*(1-b.costReduction*credit)));
      else if(route.field==='castSeconds')after=round(Math.max(.5,before*(1-b.castReduction*credit)));
      else if(choice.category==='控制'){
        if(choice.success!==true||choice.immune===true)return result(false,'控制未成功或目标免控，不消费收益');
        after=round(before+Math.min(before*b.controlDurationRate*credit,b.controlExtraSecondsCap));
      }else if(['强化','减益'].includes(choice.category)){
        if(choice.category==='减益'&&choice.success!==true)return result(false,'减益未成功，不消费收益');
        after=round(before+Math.min(before*b.buffRelativeRate*credit,b.buffExtraPointsCap));
      }else after=round(before*(1+b.potencyRate*credit));
    }
    const delta=round(after-before);if(!delta)return result(false,'收益不足结算精度或本阶段上限已达');
    out[route.field]=after;
    // effects/parts只能按整次施法同一比例分配，合计不再获得额外预算。
    if(route.field==='amount'&&Array.isArray(choice.parts)){
      const total=choice.parts.reduce((n,v)=>n+number(v,'分段值'),0);if(Math.abs(total-before)>1e-6)throw Error('分段合计必须等于整次施法amount');
      let used=0,cumulative=0;out.parts=choice.parts.map((v,i)=>{cumulative+=v;const upto=i===choice.parts.length-1?after:round(after*cumulative/total),n=round(upto-used);used=upto;return n;});
    }
    s.pending=null;s.uses++;s.lastProcTime=s.lastTime;s.lastProcStage=s.lastStage;
    return result(true,'自动作用于'+route.label,delta);
  }
  return Object.freeze({version:VERSION,budgetVersion:BUDGET_VERSION,RATES,KEYS,LABELS,profile,autoEffects,attach,budgetText,timingText,validateState:checkState,createState,recordEvent,applyToChoice,routeFor});
});
