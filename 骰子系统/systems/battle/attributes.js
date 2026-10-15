// AttributeActions: live V13 behavior; composed once by systems/battle/compose.js.
const AttributeActions=(function(root){
'use strict';
const R=root.WitnessRules;
const B=root.WitnessBattle;
const SE=root.WitnessSkillEffects;
const copy=value=>JSON.parse(JSON.stringify(value));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const config={coefficient:.40,bonus:.35,cap:.90,costFraction:.02,duration:4};
  const buildUnderlyingSkill=ControlActions.methods.makeSkill;

  const validateUnderlyingAction=BattleCore.methods.actionReason;
  const selectUnderlyingTargets=BattleCore.methods.targetOptions;
  const executeUnderlyingCommand=BattleCore.methods.command;
  const applyUnderlyingStatus=StatusActions.methods.setStatus;

  const calculateUnderlyingCost=BattleCore.methods.cost;
  const calculateUnderlyingCast=BattleCore.methods.castTime;
  const planUnderlyingAction=ControlActions.methods.plan;

  const makeSkill=args=>SE.make(buildUnderlyingSkill,args);

  const snapshot=function(){this.expireShields();return {v14ShieldVersion:1,shieldLayerSequence:this.shieldLayerSequence||0,version:10,soulControlVersion:11,combatRulesVersion:14,playerRulesVersion:2,drawRulesVersion:2,resourceConfig:this.resourceConfig,doubleEmptySince:this.doubleEmptySince??null,activeId:this.activeId,queueSequence:this.queueSequence,units:copy(this.units),seed:this.seed,rngState:this.rng.state,now:this.now,result:copy(this.result),log:copy(this.log),turn:this.turn,difficulty:this.difficulty||'standard',controlRules:{...(this.controlRules||root.WitnessControlV9.getConfig())},tacticsRulesVersion:1005,dodgeConfig:{...config,...this.dodgeConfig}};};

  const dodgeCost=function(u){return Math.max(1,Math.ceil(u.model.derived.baseMP*(this.dodgeConfig||config).costFraction));};

  const actionReason=function(u,action){
    if(action!=='dodge')return validateUnderlyingAction.call(this,u,action);
    if(this.value(u,'control'))return '受控中，无法闪避';if(!this.alive(u))return '已退场';if(u.cast)return '正在读条';if(!this.canAct(u))return '等待敏捷行动回合';if(u.bonusAttack)return '附赠普攻机会不能用于闪避';return u.mp<this.dodgeCost(u)?'魂力不足以闪避':'';
  };

  const targetOptions=function(u,action){return action==='dodge'?[u]:selectUnderlyingTargets.call(this,u,action);};

  const command=function(id,action,target){
    if(action!=='dodge')return executeUnderlyingCommand.call(this,id,action,target);if(this.result)return '战斗已结束';const u=this.unit(id),reason=this.actionReason(u,action);if(reason)return reason;
    const c=this.dodgeConfig||config,cost=this.dodgeCost(u);u.mp-=cost;u.dodgeCount=(u.dodgeCount||0)+1;u.dodgeSpent=(u.dodgeSpent||0)+cost;this.setStatus(u,'activeDodge',1,c.duration,{source:'active-dodge',label:'主动闪避'});this.endTurn(u);
    this.addLog(u.name+'主动闪避，消耗'+cost+'点魂力，持续'+c.duration+'秒',{type:'dodge',actor:id,target:id,cost});return '';
  };

  const setStatus=function(u,type,value,duration,extra={}){if(type==='control')u.statuses=u.statuses.filter(s=>s.type!=='activeDodge');if(type.startsWith('statDown')||type.startsWith('statUp')){const source=extra.source||'system:'+type;u.statuses=u.statuses.filter(s=>s.type!==type||s.source!==source);u.statuses.push({type,value,until:this.now+duration*1000,...extra,source});return;}return applyUnderlyingStatus.call(this,u,type,value,duration,extra);};

  const hitChance=function(u,t,channel,bonus=0){
    const a=this.effective(u),b=this.effective(t),mind=channel==='精神',controlled=!!this.value(t,'control'),c=this.dodgeConfig||config;
    let chance;
    if(mind)chance=clamp(.85+(a.P-b.P)/600,.55,.97);
    else {
      const diff=a.A/Math.max(20,u.model.benchmark)-(controlled?0:b.A/Math.max(20,t.model.benchmark));
      const active=!controlled&&this.value(t,'activeDodge');
      chance=clamp(.9+diff*(active?c.coefficient:.12),.6,.97);
      if(!controlled){chance-=this.value(t,'evasion');if(this.trait(t)==='evasion')chance-=.08;}
      if(active){const advantage=Math.max(0,-diff);chance-=c.bonus+advantage*c.coefficient;}
      chance=clamp(chance,active?1-c.cap:.4,.97);
    }
    if(this.trait(u)==='sense')chance+=.05;
    chance=clamp(chance+bonus,mind?.55:(!controlled&&this.value(t,'activeDodge')?1-c.cap:.4),.97);
    return Math.round(clamp(chance-this.value(u,'accuracyDown'),.05,.97)*100)/100;
  };

  const effective=function(u){
    const base={...u.model.stats},s={...base},d={...u.model.derived},next={...base};
    const boost=this.value(u,'attackBoost'),weak=this.value(u,'fatigue');
    d.PA*=1+boost;d.SA*=1+boost;d.MA*=1+boost;
    d.PA*=Math.max(0,1-weak);d.SA*=Math.max(0,1-weak);d.MA*=Math.max(0,1-weak);
    d.DEF=u.model.derived.DEF*(1-clamp(this.value(u,'defDown'),0,1));
    d.MDEF=u.model.derived.MDEF*(1-clamp(this.value(u,'mindDown'),0,1));
    s.A*=1+this.value(u,'agility');const out={...s,...d};
    out.A*=1-clamp(this.value(u,'agilityDown'),0,.9);
    for(const key of R.KEYS){const up=this.status(u,'statUp'+key).reduce((n,s)=>n+s.value,0),down=this.status(u,'statDown'+key).reduce((n,s)=>n+s.value,0);next[key]=base[key]*(1+up)*Math.max(0,1-down);out[key]*=next[key]/base[key];}
    const before=R.derive(base),after=R.derive(next);for(const key of ['PA','SA','MA','DEF','MDEF'])out[key]*=after[key]/before[key];
    out.costReduction=after.costReduction;out.castReduction=after.castReduction;return out;
  };

  const cost=function(u,s){const factor=(1-this.effective(u).costReduction/100)/(1-u.model.derived.costReduction/100);return Math.max(1,Math.ceil(calculateUnderlyingCost.call(this,u,s)*factor));};

  const castTime=function(u,s){const factor=(1-this.effective(u).castReduction/100)/(1-u.model.derived.castReduction/100);return Math.max(.5,calculateUnderlyingCast.call(this,u,s)*factor);};

  const plan=function(u,cast,pre){
    const s=cast.skill;if(!s?.effects?.length)return planUnderlyingAction.call(this,u,cast,pre);
    const t=this.unit(cast.target),plan={u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};if(!t||!this.alive(t))return plan;
    plan.effects.push(()=>{if(s.category==='减益'){const chance=R.controlEffect(s.Q,pre[u.id],pre[t.id]).chance,roll=this.rng.die(100);this.addLog(s.name+'判定 '+roll+' / '+Math.round(chance)+'%',{type:roll<=Math.round(chance)?'status':'resist',actor:u.id,target:t.id});if(roll>Math.round(chance))return;}
      for(const effect of s.effects){const type=(s.category==='强化'?'statUp':'statDown')+effect.key,extra={source:this.statusSource(u,s),label:s.name,from:u.name};if(s.category==='强化')this.setBuff(t,type,effect.value,s,extra);else this.setStatus(t,type,effect.value,180.001,extra);}
    });return plan;
  };



  const dotNature=function(u,s){return s?.damageNature||(s?.fx==='poison'||/毒/.test([s?.name,s?.description,s?.effect,(u?.soul.elements||[]).join('')].join(''))?'poison':'residual');};

  const dotLabel=function(dot){const owner=this.unit(dot.source),s=owner?.skills.find(s=>dot.key===owner.id+'-'+s.id);return (dot.damageNature||this.dotNature(owner,s))==='poison'?'毒伤':'残伤';};

  const applyDotDamage=function(t,dot){const nature=this.dotLabel(dot)==='毒伤'?'poison':'residual',start=this.events.length;this.applyDamage(t,dot.damage,dot.channel,this.unit(dot.source),dot.fx);for(const event of this.events.slice(start))if(event.type==='damage'){event.periodic=true;event.damageNature=nature;event.text=(nature==='poison'?'毒伤：':'残伤：')+event.text;}};
root.WitnessTacticsV10={config};
  return {methods:{makeSkill,snapshot,dodgeCost,actionReason,targetOptions,command,setStatus,hitChance,effective,cost,castTime,plan,dotNature,dotLabel,applyDotDamage}};
})(globalThis);
