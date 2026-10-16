// v11 passive adapter. Every actor, NPC and public projection uses the same hooks.
const SoulTraitActions=(function(root){
'use strict';
const API=root.WitnessTraits,BAL=root.WitnessTraitBalance;
const registry=root.WitnessTraitRegistry=API.createRegistry(root.WitnessTraitData);
root.WitnessTraitRuntime=Object.freeze({version:11,budgetVersion:BAL.budgetVersion,namingVersion:API.naming.version,enabled:true,registry,combatAdapter:'SoulTraitActions',growthAdapter:'CampaignTraits'});
const definition=u=>registry.getBySoulId(u.soul.id);
const base=ModernActions.methods;
function initialize(){
  if(this.traitsEnabled===undefined)this.traitsEnabled=true;
  this.traitRulesVersion=11;
  for(const u of this.units){delete u.soul.combat_profile;const t=definition(u);if(!t)continue;
    u.passive||={version:11,definitionId:t.id,state:t.kind==='battle'?BAL.createState(t,this.seed+':'+u.id,{effectiveTier:u.soul.tier}):null,
      lastHP:u.hp/u.model.derived.HP,lastMP:u.mp/u.model.derived.MP,wasControlled:false,clock:0,cooldowns:{},lastCategory:null,lastTarget:null,procs:0};
    if(u.passive.definitionId!==t.id)throw Error('武魂特性绑定不一致');if(u.passive.state)BAL.validateState(t,u.passive.state);
  }
}
function enabled(b,u){return b.traitsEnabled!==false&&u.passive?.state&&definition(u)?.kind==='battle';}
function emit(u,type,id,extra={}){
  if(!enabled(this,u))return;const t=definition(u);if(t.spec.event!==type)return;
  const p=u.passive,state=p.state;
  const result=BAL.recordEvent(t,state,{id,type,time:this.now/1000,effectiveTier:u.soul.tier,
    hpFraction:Math.max(0,Math.min(1,u.hp/u.model.derived.HP)),mpFraction:Math.max(0,Math.min(1,u.mp/u.model.derived.MP)),
    hasShield:(u.shieldHP||0)+(u.shieldSH||0)>0,changedLast:!!p.changedLast,target:p.lastTarget,...extra});
  p.state=result.state;
  if(result.ready)this.addLog(u.name+'的特性「'+t.name+'」已就绪',{type:'traitReady',actor:u.id,trait:t.id});
}
function consume(u,cast,choice,preview=false){
  if(!enabled(this,u)||!u.passive.state.pending)return null;
  const t=definition(u),id=cast?.eventId||u.id+':'+((u.modern?.sequence||0)+1);
  const result=BAL.applyToChoice(t,u.passive.state,{id,time:this.now/1000,paid:true,target:cast?.target||this._traitCommandTarget,...choice});
  if(!preview){u.passive.state=result.state;if(result.applied){u.passive.procs++;this.addLog(u.name+'的特性「'+t.name+'」自动生效：'+result.reason+' '+result.delta,{type:'traitProc',actor:u.id,trait:t.id,delta:result.delta,field:choice.category});}}
  return result;
}
function cost(u,s){const n=base.cost.call(this,u,s);if(definition(u)?.spec.benefit!=='economy')return n;return consume.call(this,u,null,{category:s.category,cost:n},true)?.choice.cost??n;}
function castTime(u,s){const n=base.castTime.call(this,u,s);if(definition(u)?.spec.benefit!=='preparation')return n;return consume.call(this,u,null,{category:s.category,castSeconds:n},true)?.choice.castSeconds??n;}
function command(id,action,target){
  const u=this.unit(id),s=u?.skills.find(s=>s.id===action),before=u?.mp;
  const prior=this._traitCommandTarget;const targets=u?this.targetOptions(u,action):[];this._traitCommandTarget=(targets.find(t=>t.id===target)||targets[0])?.id;
  let error;try{error=base.command.call(this,id,action,target);if(error)return error;
    if(s&&u.cast){const t=definition(u);u.cast.traitPaid=Math.max(0,before-u.mp);
      if(t?.spec.benefit==='economy')consume.call(this,u,u.cast,{category:s.category,cost:base.cost.call(this,u,s)});
      else if(t?.spec.benefit==='preparation')consume.call(this,u,u.cast,{category:s.category,castSeconds:base.castTime.call(this,u,s)});
    }
    thresholds.call(this,u,'pay:'+u.id+':'+(u.modern?.sequence||0));return '';
  }finally{this._traitCommandTarget=prior;}
}
function thresholds(u,id){if(!u?.passive)return;const p=u.passive,h=u.hp/u.model.derived.HP,m=u.mp/u.model.derived.MP;
  if(p.lastHP>.5&&h<=.5)emit.call(this,u,'hp_fall',id+':hp',{actualContribution:Math.max(0,p.lastHP-h),contributionReference:.1});
  if(p.lastMP>.5&&m<=.5)emit.call(this,u,'mp_fall',id+':mp',{actualContribution:Math.max(0,p.lastMP-m),contributionReference:.1});
  p.lastHP=h;p.lastMP=m;
}
function pulse(u){
  if(!enabled(this,u)||!this.alive(u))return;const p=u.passive,controlled=!!this.value(u,'control');
  if(p.wasControlled&&!controlled)emit.call(this,u,'control_ended',u.id+':cc-end:'+this.now,{actualContribution:1,contributionReference:1});p.wasControlled=controlled;
  const clock=Math.floor(this.now/8000);if(clock>p.clock){p.clock=clock;emit.call(this,u,'battle_clock',u.id+':clock:'+clock,{actualContribution:1,contributionReference:1});}
  for(const [key,until]of Object.entries(u.cooldowns))if(until<=this.now&&p.cooldowns[key]!==until){p.cooldowns[key]=until;emit.call(this,u,'cooldown_ready',u.id+':cd:'+key+':'+until,{actualContribution:1,contributionReference:1});}
  thresholds.call(this,u,u.id+':pulse:'+this.now);
}
function scheduleAI(autoPlayer=false){for(const u of this.units)pulse.call(this,u);return BattleCore.methods.scheduleAI.call(this,autoPlayer);}
function plan(u,cast,pre){
  u._traitResolvingId=cast.eventId||u.id+':'+u.actions+':'+this.now;
  const p=base.plan.call(this,u,cast,pre),s=cast.skill;
  cast.traitHit=!!p.hit?.success;cast.traitEffective=!!(p.hit?.success||s&&['强化','防御'].includes(s.category));
  if(!s)return p;
  if(definition(u)?.spec.benefit==='potency'&&['攻击','持续伤害'].includes(s.category)&&p.hit?.success){
    const periodic=s.damageMode==='periodic'||s.category==='持续伤害';
    const amounts=[p.damage||0,...(p.extraDamage||[]).map(d=>d.amount)],total=amounts.reduce((n,v)=>n+v,0);
    const r=consume.call(this,u,cast,{category:'攻击',amount:periodic?100:total,parts:periodic?undefined:amounts});
    if(r?.applied){if(periodic){const scale=r.choice.amount/100;p.effects.push(()=>{const t=p.t;for(const d of t.dots.filter(d=>d.key===u.id+'-'+s.id)){if(Number.isFinite(d.rawPerTick))d.damageMultiplier=(d.damageMultiplier??1)*scale;else d.baseDamage=Math.round(d.baseDamage*scale);d.damage=this.dotDamage(d,t);}});}else{p.damage=r.choice.parts[0];for(let i=0;i<(p.extraDamage||[]).length;i++)p.extraDamage[i].amount=r.choice.parts[i+1];}}
  }
  const magnitude=s.effects?.reduce((n,e)=>n+Math.max(0,e.value),0)||['buff','agility','evasion','dotBuff','slow','costUp'].reduce((n,k)=>n+Math.max(0,s[k]||0),0);
  const context={u,cast,s,magnitude,ratio:null};
  p.effects=p.effects.map(effect=>()=>{const before=this._traitEffect;this._traitEffect=context;try{effect();}finally{this._traitEffect=before;}});
  return p;
}
function scaleStatus(type,value){const c=this._traitEffect;if(!c||!['强化','减益'].includes(c.s.category)||!c.magnitude||definition(c.u)?.spec.benefit!=='potency')return value;
  if(!/^(statUp|statDown)/.test(type)&&!['attackBoost','agility','evasion','dotBoost','slow','costUp','defDown','mindDown','agilityDown','damageDown','accuracyDown'].includes(type))return value;
  if(c.ratio===null){const r=consume.call(this,c.u,c.cast,{category:c.s.category,amount:c.magnitude,success:true});c.ratio=r?.applied?r.choice.amount/c.magnitude:1;}
  return value*c.ratio;
}
function setStatus(u,type,value,duration,extra={}){return AttributeActions.methods.setStatus.call(this,u,type,scaleStatus.call(this,type,value),duration,extra);}
function setBuff(u,type,value,s,extra={}){return StatusActions.methods.setBuff.call(this,u,type,scaleStatus.call(this,type,value),s,extra);}
function addShieldLayer(t,layer){const c=this._traitEffect;if(c&&c.s.category==='防御'&&layer.amount>0&&definition(c.u)?.spec.benefit==='potency'){
  const r=consume.call(this,c.u,c.cast,{category:'防御',amount:layer.amount});if(r?.applied)layer={...layer,amount:Math.round(r.choice.amount)};
}return ShieldActions.methods.addShieldLayer.call(this,t,layer);}
function tryControl(u,t,s,duration){const oldUntil=this.value(t,'control')?Math.max(...this.status(t,'control').map(s=>s.until)):0;
  const answer=base.tryControl.call(this,u,t,s,duration),status=this.status(t,'control').find(x=>x.until>oldUntil);
  if(status){if(t.passive)t.passive.wasControlled=true;
    if(definition(u)?.spec.benefit==='potency'){const before=(status.until-this.now)/1000,r=consume.call(this,u,{eventId:u._traitResolvingId,target:t.id},{category:'控制',amount:before,success:true,immune:false});
      if(r?.applied){const extra=Math.round(r.delta*1000);status.until+=extra;t.immuneUntil+=extra;t.readyAt+=extra;}}
  }return answer;
}
function applyDamage(t,amount,channel,source,fx){const oldHP=t.hp,oldSH=t.sh,oldShield=(t.shieldHP||0)+(t.shieldSH||0),eventStart=this.events.length;
  base.applyDamage.call(this,t,amount,channel,source,fx);
  const damageEvent=this.events.slice(eventStart).find(e=>e.type==='damage'&&e.target===t.id),hits=damageEvent?.shieldLayersHit||[];
  const loss=Math.max(0,oldHP-t.hp)+Math.max(0,oldSH-t.sh),newShield=(t.shieldHP||0)+(t.shieldSH||0),blocked=(damageEvent?.shieldBlocked||0)+(damageEvent?.guardBlocked||0),id=source?source._traitResolvingId||source.id+':'+this.now:'environment:'+this.now;
  if(!this._periodic&&loss>0){if(source)emit.call(this,source,'hit_direct',id,{actualContribution:loss,contributionReference:Math.max(1,(channel==='精神'?t.model.derived.SH:t.model.derived.HP)*.1),target:t.id});emit.call(this,t,'direct_loss',id+':received:'+t.id,{actualContribution:loss,contributionReference:t.model.derived.HP*.1});}
  if(blocked>0)emit.call(this,t,'effective_guard',id+':guard:'+t.id,{actualContribution:blocked,contributionReference:t.model.derived.HP*.1});
  const broken=hits.filter(h=>h.removed&&h.blocked>0).reduce((n,h)=>n+h.blocked,0),ended=hits.filter(h=>h.removed).reduce((n,h)=>n+h.blocked+h.guardBlocked,0);
  if(broken>0)emit.call(this,t,'shield_broken',id+':shield:'+t.id,{actualContribution:broken,contributionReference:t.model.derived.HP*.1});
  if(ended>0)emit.call(this,t,'protection_end',id+':protection:'+t.id,{actualContribution:ended,contributionReference:t.model.derived.HP*.1});
  thresholds.call(this,t,id+':threshold:'+t.id);
}
function onActionComplete(u,cast){base.onActionComplete.call(this,u,cast);if(!u.passive)return;
  const p=u.passive,id=cast.eventId||u.id+':'+u.actions+':'+this.now,category=cast.skill?.category||cast.action;
  if(p.completedId===id)return;p.completedId=id;p.changedLast=p.lastCategory!==null&&p.lastCategory!==category;p.lastTarget=cast.target;
  const contribution=cast.traitPaid|| (cast.action==='attack'?this.basicCost(u):1),extra={actualContribution:contribution,contributionReference:cast.skill?u.model.derived.baseMP*.1:1,target:cast.target};
  if(cast.skill)emit.call(this,u,'paid_action',id,extra);
  if(cast.action==='attack')emit.call(this,u,'basic_action',id,extra);
  if(['defend','defendSH','dodge'].includes(cast.action))emit.call(this,u,'defensive_action',id,extra);
  if(cast.traitEffective)emit.call(this,u,'effective_skill',id,extra);
  if(p.changedLast){emit.call(this,u,'category_change',id,extra);if([p.lastCategory,category].includes('attack'))emit.call(this,u,'basic_skill_switch',id,extra);if([p.lastCategory,category].some(x=>['防御','defend','defendSH'].includes(x))&&[p.lastCategory,category].some(x=>['攻击','attack'].includes(x)))emit.call(this,u,'offense_defense_switch',id,extra);}
  if(u.actions>0&&u.actions%3===0)emit.call(this,u,'own_action_cycle',id,extra);
  p.lastCategory=category;for(const v of this.units)pulse.call(this,v);
}
return {registry,initialize,methods:{cost,castTime,command,plan,setStatus,setBuff,addShieldLayer,tryControl,applyDamage,onActionComplete,scheduleAI}};
})(globalThis);
