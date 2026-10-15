// MemberActions: live V13 behavior; composed once by systems/battle/compose.js.
const MemberActions=(function(root){
'use strict';
const B=root.WitnessBattle;
const R=root.WitnessRules;

  const applyUnderlyingDamage=ControlActions.methods.applyDamage;
  const selectUnderlyingTargets=AttributeActions.methods.targetOptions;
  const validateUnderlyingAction=AttributeActions.methods.actionReason;
  const executeUnderlyingCommand=AttributeActions.methods.command;
  const underlyingoldHit=ControlActions.methods.hit;
  const planUnderlyingAction=PermanentEffects.methods.plan;
  const applyTemplateControl=ControlActions.methods.tryControl;

  const controlNumbers=function(u,t,s){
    const a=this.effective(u),b=this.effective(t),effect=R.controlEffect(s.Q,a,b),ratio=(100+a.P)/(100+b.P);
    effect.duration=R.round2(Math.max(.01,(s.baseControl??(1+.5*s.Q))*ratio));
    if(this.trait(u)==='binding')effect.duration=R.round2(effect.duration+.2);
    if(this.trait(u)==='ice')effect.chance=Math.min(85,effect.chance+6);
    if(s.controlChance!==undefined)effect.chance=s.controlChance;
    return effect;
  };

  const gainRage=function(u,amount){const gain=Math.max(0,Math.min(amount,5-(u.rageTotal||0)));u.rage=Math.min(5,u.rage+gain);u.rageTotal=(u.rageTotal||0)+gain;};

  const damageValue=function(u,t,raw,channel,pre){
      const penetration=this.value(u,'phantomPierce');
      if(channel!=='精神'&&penetration)pre={...pre,[t.id]:{...pre[t.id],DEF:pre[t.id].DEF*Math.max(0,1-penetration)}};
      const target=pre[t.id],trait=this.trait(u);let def=channel==='精神'?target.MDEF:target.DEF;def*=130/Math.max(20,t.model.benchmark);
      if(trait==='pierce'&&channel!=='精神')def*=.88;if(trait==='mind'&&channel==='精神')def*=.88;
      let damage=Math.max(1,Math.round(raw*100/(100+def)));
      if(this.difficulty==='admission'&&u.team===1)damage=Math.max(1,Math.round(damage*.9));
      if(channel!=='精神'&&this.trait(t)==='body')damage=Math.round(damage*.92);
      if(this.status(t,channel==='精神'?'defendSH':'defendHP').length)damage=Math.round(damage*.70);
      damage=Math.max(1,damage);
      if(this._valuingAI&&this.value(u,'damageDown'))damage=Math.max(1,Math.round(damage*(1-this.value(u,'damageDown'))));
      return channel==='精神'?damage:Math.max(1,Math.round(damage*Math.max(0,1-this.value(t,'iceArmor'))));
    };

  const applyDamage=function(t,damage,channel,source,fx){
    const before=t.hp;applyUnderlyingDamage.call(this,t,damage,channel,source,fx);
    if(source?.soul.name==='血君'&&t.hp<before){t.bloodMarks||=[];if(!t.bloodMarks.includes(source.id))t.bloodMarks.push(source.id);}
  };

  const targetOptions=function(u,action){
    if(['phantomSacrifice','phantomSwap'].includes(action))return [u];
    const targets=selectUnderlyingTargets.call(this,u,action),s=u.skills.find(s=>s.id===action);
    return s?.requireBlood?targets.filter(t=>t.bloodMarks?.includes(u.id)&&t.cast):targets;
  };

  const actionReason=function(u,action){
    if(!['phantomSacrifice','phantomSwap'].includes(action))return validateUnderlyingAction.call(this,u,action);
    if(!this.alive(u))return '已退场';if(!u.phantoms)return '没有可用分身';if(u.cast||!this.canAct(u)||u.bonusAttack)return '等待完整行动回合';if(action==='phantomSwap'&&u.phantomSwapped)return '本场换位机会已用尽';return '';
  };

  const command=function(id,action,target){
    if(!['phantomSacrifice','phantomSwap'].includes(action))return executeUnderlyingCommand.call(this,id,action,target);
    const u=this.unit(id),reason=this.actionReason(u,action);if(reason)return reason;if(this.result)return '战斗已结束';u.phantoms--;
    if(action==='phantomSwap'){u.phantomSwapped=true;this.setStatus(u,'phantomSwapReady',1,4,{source:u.id+'-phantom-swap',label:'分身换位'});this.addLog(u.name+'以分身准备换位，下一次直接生命攻击可被避开；此分身不提供泯灭增幅。',{type:'status',actor:id,target:id});}
    else {u.phantomSacrificed=(u.phantomSacrificed||0)+1;for(const type of ['attackBoost','agility'])this.setBuff(u,type,.06*u.phantomSacrificed,{}, {source:u.id+'-phantom-sacrifice',label:'分身泯灭',from:u.name});this.addLog(u.name+'泯灭一道分身，累计额外攻击与敏捷增幅'+(u.phantomSacrificed*6)+'%。',{type:'status',actor:id,target:id});}
    this.endTurn(u);return '';
  };

  const hit=function(u,t,channel,bonus=0){
    const result=underlyingoldHit.call(this,u,t,channel,bonus);
    if(channel!=='精神'&&this.value(t,'phantomSwapReady')&&!this.value(t,'control')){t.statuses=t.statuses.filter(s=>s.type!=='phantomSwapReady');this.addLog(t.name+'与分身换位，避开这次直接攻击。',{type:'miss',actor:u.id,target:t.id});return {...result,success:false};}
    return this.value(u,'bloodFirstStrike')?{...result,success:true,chance:100}:result;
  };

  const plan=function(u,cast,pre){
    const s=cast.skill,t=this.unit(cast.target);
    if(s?.bloodInterrupt&&(!t?.bloodMarks?.includes(u.id)||!t.cast))return {u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};
    const isAttack=s?['攻击','持续伤害'].includes(s.category):cast.action==='attack',first=isAttack&&this.value(u,'bloodFirstStrike'),plan=planUnderlyingAction.call(this,u,cast,pre);
    if(s?.phantomDance)plan.effects.push(()=>{if(u.phantoms===undefined){u.phantoms=5;u.phantomSwapped=false;u.phantomSacrificed=0;}this.setBuff(u,'phantomPierce',.1,s,{source:this.statusSource(u,s),label:s.name,from:u.name});});
    if(s?.iceArmor)plan.effects.push(()=>this.setBuff(u,'iceArmor',s.iceArmor,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
    if(s?.bloodDomain)plan.effects.push(()=>{
      this.setBuff(u,'attackBoost',.15,s,{source:this.statusSource(u,s),label:s.name,from:u.name});
      this.setStatus(t,'accuracyDown',.2,180.001,{source:this.statusSource(u,s),label:s.name,from:u.name});
      if(!u.bloodDomainUsed){u.bloodDomainUsed=true;this.setStatus(u,'bloodFirstStrike',1,180.001,{source:this.statusSource(u,s),label:'血夜首击'});}
    });
    if(first&&plan.hit?.success){
      plan.damage=Math.round(plan.damage*1.35);for(const extra of plan.extraDamage||[])extra.amount=Math.round(extra.amount*1.35);const beforeDots=new Set(t.dots);
      plan.effects.push(()=>{for(const dot of t.dots)if(!beforeDots.has(dot)&&dot.source===u.id){dot.baseDamage=Math.round(dot.baseDamage*1.35);dot.damage=this.dotDamage(dot);}u.statuses=u.statuses.filter(x=>x.type!=='bloodFirstStrike');this.tryControl(u,t,{...s,Q:s?.Q||1,controlChance:50},1);});
    }
    return plan;
  };

  const tryControl=function(u,t,s,base){
    if(s?.controlChance===undefined)return applyTemplateControl.call(this,u,t,s,base);
    if(!this.alive(t)||t.immuneUntil>this.now||this.value(t,'controlWard'))return;
    if(this.rng.die(100)>s.controlChance)return;
    const seconds=R.controlEffect(s.Q,this.effective(u),this.effective(t)).ratio*(base||1);
    this.setStatus(t,'control',1,seconds);t.progress=Math.min(t.progress,.4);t.queuedAt=null;t.immuneUntil=this.now+Math.round(seconds*1000)+4000;
    if(t.cast){t.cast=null;this.endTurn(t,false);}t.readyAt=Math.max(t.readyAt,this.now+seconds*1000);this.addLog(t.name+'受到血夜首击禁锢'+R.round2(seconds)+'秒。',{type:'control',actor:u.id,target:t.id});
  };


root.WitnessCombatV13.specialMembers=true;
  return {methods:{controlNumbers,gainRage,damageValue,applyDamage,targetOptions,actionReason,command,hit,plan,tryControl}};
})(globalThis);
