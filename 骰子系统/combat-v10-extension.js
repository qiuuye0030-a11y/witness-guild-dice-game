(function(root){
  'use strict';
  const R=root.WitnessRules,B=root.WitnessBattle,SE=root.WitnessSkillEffects,p=B.Battle.prototype,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const config={coefficient:.40,bonus:.35,cap:.90,costFraction:.02,duration:4};
  const oldMake=R.makeSkill;R.makeSkill=args=>SE.make(oldMake,args);
  const oldSnapshot=p.snapshot;p.snapshot=function(){return {...oldSnapshot.call(this),tacticsRulesVersion:1004,dodgeConfig:{...config,...this.dodgeConfig}};};
  p.dodgeCost=function(u){return Math.max(1,Math.ceil(u.model.derived.baseMP*(this.dodgeConfig||config).costFraction));};
  const oldReason=p.actionReason;p.actionReason=function(u,action){
    if(action!=='dodge')return oldReason.call(this,u,action);
    if(this.value(u,'control'))return '受控中，无法闪避';if(!this.alive(u))return '已退场';if(u.cast)return '正在读条';if(!this.canAct(u))return '等待敏捷行动回合';if(u.bonusAttack)return '附赠普攻机会不能用于闪避';return u.mp<this.dodgeCost(u)?'魂力不足以闪避':'';
  };
  const oldTargets=p.targetOptions;p.targetOptions=function(u,action){return action==='dodge'?[u]:oldTargets.call(this,u,action);};
  const oldCommand=p.command;p.command=function(id,action,target){
    if(action!=='dodge')return oldCommand.call(this,id,action,target);if(this.result)return '战斗已结束';const u=this.unit(id),reason=this.actionReason(u,action);if(reason)return reason;
    const c=this.dodgeConfig||config,cost=this.dodgeCost(u);u.mp-=cost;u.dodgeCount=(u.dodgeCount||0)+1;u.dodgeSpent=(u.dodgeSpent||0)+cost;this.setStatus(u,'activeDodge',1,c.duration,{source:'active-dodge',label:'主动闪避'});this.endTurn(u);
    this.addLog(u.name+'主动闪避，消耗'+cost+'点魂力，持续'+c.duration+'秒',{type:'dodge',actor:id,target:id,cost});return '';
  };
  const oldSetStatus=p.setStatus;p.setStatus=function(u,type,value,duration,extra={}){if(type==='control')u.statuses=u.statuses.filter(s=>s.type!=='activeDodge');if(type.startsWith('statDown')){const source=extra.source||'system:'+type;u.statuses=u.statuses.filter(s=>s.type!==type||s.source!==source);u.statuses.push({type,value,until:this.now+duration*1000,...extra,source});return;}return oldSetStatus.call(this,u,type,value,duration,extra);};
  p.hitChance=function(u,t,channel,bonus=0){
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
  const oldEffective=p.effective;p.effective=function(u){
    const out=oldEffective.call(this,u),base={...u.model.stats},next={...base};
    for(const key of R.KEYS){const up=Math.min(.65,this.status(u,'statUp'+key).reduce((n,s)=>n+s.value,0)),down=Math.min(.65,this.status(u,'statDown'+key).reduce((n,s)=>n+s.value,0));next[key]=base[key]*(1+up)*(1-down);out[key]*=next[key]/base[key];}
    const before=R.derive(base),after=R.derive(next);for(const key of ['PA','SA','MA','DEF','MDEF'])out[key]*=after[key]/before[key];
    out.costReduction=after.costReduction;out.castReduction=after.castReduction;return out;
  };
  const oldCost=p.cost;p.cost=function(u,s){const factor=(1-this.effective(u).costReduction/100)/(1-u.model.derived.costReduction/100);return Math.max(1,Math.ceil(oldCost.call(this,u,s)*factor));};
  const oldCast=p.castTime;p.castTime=function(u,s){const factor=(1-this.effective(u).castReduction/100)/(1-u.model.derived.castReduction/100);return Math.max(.5,oldCast.call(this,u,s)*factor);};
  const oldPlan=p.plan;p.plan=function(u,cast,pre){
    const s=cast.skill;if(!s?.effects?.length)return oldPlan.call(this,u,cast,pre);
    const t=this.unit(cast.target),plan={u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};if(!t||!this.alive(t))return plan;
    plan.effects.push(()=>{if(s.category==='减益'){const chance=R.controlEffect(s.Q,pre[u.id],pre[t.id]).chance,roll=this.rng.die(100);this.addLog(s.name+'判定 '+roll+' / '+Math.round(chance)+'%',{type:roll<=Math.round(chance)?'status':'resist',actor:u.id,target:t.id});if(roll>Math.round(chance))return;}
      for(const effect of s.effects){const type=(s.category==='强化'?'statUp':'statDown')+effect.key,extra={source:this.statusSource(u,s),label:s.name,from:u.name};if(s.category==='强化')this.setBuff(t,type,effect.value,s,extra);else this.setStatus(t,type,effect.value,180.001,extra);}
    });return plan;
  };
  const oldAI=p.aiChoice;p.aiChoice=function(u){
    const choice=oldAI.call(this,u);if(u.bonusAttack)return choice;
    let best=choice,bestScore=Number.isFinite(choice?.score)?choice.score:0;
    for(const s of u.skills.filter(s=>s.effects?.length&&!this.actionReason(u,s.id))){for(const t of this.targetOptions(u,s.id)){
      let gain=0;for(const e of s.effects){const type=(s.category==='强化'?'statUp':'statDown')+e.key,source=this.statusSource(u,s),current=this.status(t,type).filter(x=>x.source!==source).reduce((n,x)=>n+x.value,0),own=this.status(t,type).find(x=>x.source===source)?.value||0;gain+=Math.max(0,Math.min(.65,current+e.value)-Math.min(.65,current+own))*(e.key==='A'?65:e.key==='C'?45:70);}
      let score=gain*(s.category==='减益'?.65:1)-this.cost(u,s)/u.model.derived.baseMP*12;if(s.category==='减益')score*=R.controlEffect(s.Q,this.effective(u),this.effective(t)).chance/100;
      if(score>bestScore){best={action:s.id,target:t.id,score};bestScore=score;}
    }}return best;
  };
  p.dotNature=function(u,s){return s?.damageNature||(s?.fx==='poison'||/毒/.test([s?.name,s?.description,s?.effect,(u?.soul.elements||[]).join('')].join(''))?'poison':'residual');};
  p.dotLabel=function(dot){const owner=this.unit(dot.source),s=owner?.skills.find(s=>dot.key===owner.id+'-'+s.id);return (dot.damageNature||this.dotNature(owner,s))==='poison'?'毒伤':'残伤';};
  p.applyDotDamage=function(t,dot){const nature=this.dotLabel(dot)==='毒伤'?'poison':'residual',start=this.events.length;this.applyDamage(t,dot.damage,dot.channel,this.unit(dot.source),dot.fx);for(const event of this.events.slice(start))if(event.type==='damage'){event.periodic=true;event.damageNature=nature;event.text=(nature==='poison'?'毒伤：':'残伤：')+event.text;}};
  root.WitnessTacticsV10={config};
})(globalThis);

(function(root){
  const p=root.WitnessBattle.Battle.prototype,oldPlan=p.plan;
  p.plan=function(u,cast,pre){
    const plan=oldPlan.call(this,u,cast,pre);if(cast.skill?.category!=='减益')return plan;
    plan.effects=plan.effects.map(apply=>()=>{const before=new Set(this.units.flatMap(t=>t.statuses));apply();for(const t of this.units)for(const status of t.statuses)if(!before.has(status)){status.until=180001;delete status.hitsRemaining;delete status.actionsRemaining;}});
    return plan;
  };
})(globalThis);
