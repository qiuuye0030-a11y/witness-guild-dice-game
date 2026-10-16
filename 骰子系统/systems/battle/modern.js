// Canonical 10.07 mechanics, assembled once. Challenge hooks are isolated.
const ModernActions=(function(root){
'use strict';
const R=root.WitnessRules;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const original={...MemberActions.methods,...Object.fromEntries(['actionReason','command','effective','cost','castTime','applyDotDamage'].map(k=>[k,AttributeActions.methods[k]||MemberActions.methods[k]])),plan:ShieldActions.methods.plan,targetOptions:ShieldActions.methods.targetOptions,applyDamage:ShieldActions.methods.applyDamage,actionRate:BattleCore.methods.actionRate};
original.actionReason=MemberActions.methods.actionReason;original.command=MemberActions.methods.command;
const initialize=b=>{for(const u of b.units)u.modern||={sequence:0,overheat:[0,0]};};
const state=u=>(u.modern||=( {sequence:0,overheat:[0,0]} ));
function effective(u){
  let out=AttributeActions.methods.effective.call(this,u);const before=R.derive(out),q={...out};
  if(this.value(u,'qinyanForm')){q.B*=1.25;const after=R.derive(q);for(const k of ['PA','SA','DEF','MDEF'])q[k]=out[k]*after[k]/before[k];}
  if(this.value(u,'goldBlade'))q.PA*=1.20;if(this.value(u,'goldBurn'))q.SA*=1.25;return ChallengeBattle.effective(this,u,q);
}
function cost(u,s){let n=s.modernEffect==='linSun'?Math.ceil(u.model.derived.baseMP*.10*(1-this.effective(u).costReduction/100)*(1+this.value(u,'costUp'))):AttributeActions.methods.cost.call(this,u,s);if(this.value(u,'qinyanForm')&&s.modernEffect!=='uranus')n*=.78;return Math.max(1,Math.ceil(n));}
function castTime(u,s){let t=AttributeActions.methods.castTime.call(this,u,s);if(s.modernEffect==='qinyanSix'&&this.value(u,'qinyanForm'))t=.9;return t*(1+this.value(u,'frostCastSlow'))/(this.value(u,'pursuit')?1.30:1);}
function actionRate(u){return BattleCore.methods.actionRate.call(this,u)*(this.value(u,'pursuit')?1.30:1);}
function targetOptions(u,action){const s=u.skills.find(x=>x.id===action);if(s?.selfOnly||s?.modernEffect&&['uranus','qinyanSpeed','qinyanSwap','iceCrown','yananGuard'].includes(s.modernEffect))return [u];return ShieldActions.methods.targetOptions.call(this,u,action);}
function actionReason(u,action){
  const s=u.skills.find(x=>x.id===action);if(s?.attackSubtype==='pursuit'&&(u.style!=='敏攻'||u.soul.spirit_specialist))return '追势仅限敏攻系';if(s?.autoOnly)return '满足条件时自动发动';if(s?.category==='回蓝')return '该类魂技已移除';
  if(s?.modernEffect){if(['goldBlade','goldBurn','goldHand'].includes(s.modernEffect)&&this.value(u,s.modernEffect))return '该形态已生效';const m=state(u),hot=m.overheat.filter(x=>x>this.now).length;
    if(s.modernEffect==='qinyanSwap'&&hot)return '重炮过热期间不能置换';
    if(['qinyanSpeed','railgun','uranus'].includes(s.modernEffect)&&hot===2&&!this.value(u,'qinyanForm'))return '双臂均在过热';
    if(s.modernEffect==='uranus'&&(this.value(u,'qinyanForm')||this.value(u,'mentalRecovery')))return '仍在半能量形态或精神蓄养中';
    if(s.modernEffect==='uranus'&&u.sh<=Math.ceil(u.model.derived.SH*.06))return '精神护持不足以安全融合';
    if(s.modernEffect==='uranusRepair'&&!this.value(u,'qinyanForm'))return '仅半能量形态内可修补';
    if(s.modernEffect==='qinyanSwap'&&this.value(u,'phaseSwap'))return '置换保险尚未消耗';
    if(s.modernEffect==='yananGuard'&&this.value(u,'preDR'))return '迎击防护仍有效';
  }
  return MemberActions.methods.actionReason.call(this,u,action);
}
function command(id,action,target){
  const u=this.unit(id),pursuit=!!this.value(u,'pursuit'),before=u.actions||0;
  const error=MemberActions.methods.command.call(this,id,action,target);if(error)return error;
  const eventId=id+':'+(++state(u).sequence);
  if(u.cast){u.cast.eventId=eventId;if(pursuit&&action!=='wait'){if(!u.cast.skill)u.cast.end=this.now+Math.round((u.cast.end-this.now)/1.30);u.statuses=u.statuses.filter(x=>x.type!=='pursuit');u.cast.pursuitUsed=true;this.addLog(u.name+'消耗追势：本次出手读条享受30%增速。',{type:'pursuitConsume',actor:id});}}
  else if((u.actions||0)>before)this.onActionComplete(u,{action,eventId,skill:null});
  return '';
}
function damageValue(u,t,raw,channel,pre){
  const s=this._damageSpec,kind=s?.hitKind||'unknown';let remain=1;
  if(!s?.damageMode||s.damageMode!=='periodic')for(const st of this.status(t,'preDR')){
    if(st.channels&&!st.channels.includes(channel))continue;if(st.hitKinds&&!st.hitKinds.includes(kind))continue;
    if(st.once){if(this._periodic)continue;const key=this._planKey||'periodic';if(st.reserved&&st.reserved!==key)continue;st.reserved=key;}
    const rankFactor=st.levelLimit===undefined?1:Math.pow(.5,Math.max(0,u.level-st.levelLimit)/10);
    remain*=1-clamp(st.value*rankFactor,0,.80);
  }
  if(this.value(t,'qinyanForm')&&channel==='物理'&&['slash','pierce'].includes(kind))remain*=.80;
  const reduced=raw*Math.max(.20,remain);
  const crown=this.value(u,'iceCrown')&&s?.fx==='ice'?1.10:1;
  const n=MemberActions.methods.damageValue.call(this,u,t,reduced*crown,channel,pre);
  if(remain<1&&!this._dotPreview)this.addLog(t.name+'防御前免伤：原伤'+Math.round(raw)+' → '+Math.round(reduced)+'，防御后'+n+'。',{type:'preReduction',actor:u.id,target:t.id,raw,reduced,damage:n});
  return n;
}
function tryControl(u,t,s,duration){
  if(!t||!this.alive(t))return;if(t.immuneUntil>this.now||this.value(t,'controlWard'))return;
  const key=this._effectKey||this._planKey||`${this.now}:${u.id}:${s.id}:${u.actions}`;
  if(ChallengeBattle.blockControl(this,u,t,s,key))return;
  return MemberActions.methods.tryControl.call(this,u,t,s,duration);
}
function plan(u,cast,pre){
  if(u.templateId==='anjingwen'&&(!cast.skill&&cast.action==='attack'||cast.skill?.leafAttack)){const burn=!!this.value(u,'goldBurn'),skill=cast.skill||{name:'黄金叶普攻',category:'攻击',Q:1,factor:.375};cast={...cast,skill:{...skill,channel:burn?'能量':'物理',factor:(skill.factor??1)*(this.value(u,'goldHand')?1.15:1),fx:burn?'fire':'slash'}};}
  const s=cast.skill,t=this.unit(cast.target),key=cast.eventId||`${this.now}:${u.id}:${s?.id||cast.action}:${u.actions}`;
  if(s?.category==='控制'&&t?.guildmaster&&!(t.immuneUntil>this.now||this.value(t,'controlWard'))&&(t.guildmaster.legendaryRemaining>0||t.guildmaster.blocked.includes(key))){ChallengeBattle.blockControl(this,u,t,s,key);return {u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};}
  const previous=this._damageSpec,oldKey=this._planKey;this._damageSpec=s;this._planKey=key;
  let p;try{p=ShieldActions.methods.plan.call(this,u,cast,pre);}finally{this._damageSpec=previous;this._planKey=oldKey;}
  p._preDamage=t?.hp;
  // Custom active effects are ordinary actions; resource payment stays in command.
  if(s?.modernEffect&&['qinyanSpeed','qinyanSwap','uranus','iceCrown','yananGuard'].includes(s.modernEffect))p.effects=[];
  if(s?.modernEffect==='qinyanSpeed')p.effects.push(()=>{for(const [k,value]of [['B',.35],['A',.30]])this.setStatus(u,'statUp'+k,value,this.value(u,'qinyanForm')?12:24,{source:u.id+':speed'+k,label:'极速',from:u.name,actionsRemaining:4,fatigue:!this.value(u,'qinyanForm'),fatigueValue:.05,fatigueSeconds:4});this.addLog(u.name+'极速：肉体强度提高35%、敏捷提高30%。',{type:'status',actor:u.id,target:u.id});});
  if(s?.modernEffect==='qinyanSwap')p.effects.push(()=>this.setStatus(u,'phaseSwap',1,4,{source:u.id+':swap',label:'置换保险'}));
  if(s?.modernEffect==='uranus')p.effects.push(()=>{u.sh-=Math.ceil(u.model.derived.SH*.06);this.setStatus(u,'qinyanForm',1,12,{source:u.id+':uranus',label:'乌拉诺斯'});this.setStatus(u,'mentalRecovery',1,24,{source:u.id+':recovery',label:'精神蓄养'});this.addLog(u.name+'融合极光：支付精神护持，进入12秒半能量形态；结束后需蓄养。',{type:'status',actor:u.id,target:u.id});});
  if(s?.modernEffect==='iceCrown')p.effects.push(()=>this.setStatus(u,'iceCrown',.10,10,{source:u.id+':crown',label:'冰棘王冠'}));
  if(s?.modernEffect==='yananGuard')p.effects.push(()=>this.setStatus(u,'preDR',.30,4,{source:u.id+':windGuard',label:'风铭回锋',once:true,channels:['物理','能量']}));
  if(s?.modernEffect==='linEnergy')p.effects.push(()=>{
    const controlled=this.events.some(e=>e.time===this.now&&e.type==='control'&&e.actor===u.id&&e.target===t.id);
    if(!controlled||(state(u).lightConversions||0)>=2)return;
    const drain=Math.min(t.mp,Math.floor(t.mp*.08),Math.floor(t.model.derived.baseMP*.06));if(drain<=0)return;
    t.mp-=drain;state(u).lightConversions=(state(u).lightConversions||0)+1;
    const converted=Math.max(0,Math.min(Math.floor(drain*.25),Math.floor(u.model.derived.baseMP*.015),u.model.derived.MP-u.mp));u.mp+=converted;
    this.addLog(u.name+'光缚成功：抽离魂力'+drain+'，有限转化'+converted+'。',{type:'lightConversion',actor:u.id,target:t.id,drain,converted});
  });
  if(s?.modernEffect&&['goldBlade','goldBurn'].includes(s.modernEffect)){p.effects=[];p.effects.push(()=>{u.statuses=u.statuses.filter(st=>!['goldBlade','goldBurn'].includes(st.type));this.setStatus(u,s.modernEffect,1,180.001,{source:u.id+':leafMode',label:s.name});this.addLog(u.name+'切换为'+s.name+'，另一形态同时解除。',{type:'leafMode',actor:u.id,mode:s.modernEffect});});}
  if(s?.modernEffect==='goldHand')p.effects.push(()=>this.setStatus(u,'goldHand',.15,180.001,{source:u.id+':goldHand',label:'黄金左手·叶势'}));
  if(s?.modernEffect&&['linLightwall','goldWall'].includes(s.modernEffect)){p.effects=[];p.effects.push(()=>this.setStatus(u,'preDR',.20,4,{source:u.id+':'+s.modernEffect,label:s.name,channels:s.modernEffect==='goldWall'?['物理']:['物理','能量']}));}
  if(s?.energyWard)p.effects.push(()=>this.setStatus(u,'preDR',s.energyWardRate||.30,s.energyWardDuration||4,{source:u.id+':energyWard',label:'虚能抵消',once:true,channels:['能量'],levelLimit:u.level}));
  if(s?.attackSubtype==='pursuit'&&p.hit?.success)p.effects.push(()=>{this.setStatus(u,'pursuit',.30,8,{source:u.id+':pursuit',label:'追势'});u.readyAt=Math.min(u.readyAt,this.now+Math.round(300/1.30));this.addLog(u.name+'获得追势：下一轮整体出手速度提高30%，伤害采用敏捷强化系数。',{type:'pursuitGain',actor:u.id,target:u.id});});
  if(s?.modernEffect==='railgun')p.effects.push(()=>{if(!this.value(u,'qinyanForm')){const heat=state(u).overheat,arm=heat[0]<=this.now?0:1;heat[arm]=this.now+6000;this.addLog(u.name+(arm?'右':'左')+'臂重炮过热6秒。',{type:'overheat',actor:u.id});}});
  if(s?.fleshFrost&&t)p.effects.push(()=>{if(t.hp<p._preDamage&&this.alive(t)){const d=this.effective(u).SA*.12;t.dots.push({key:u.id+':clawFrost',source:u.id,channel:'能量',baseDamage:Math.round(d),damage:Math.round(d),rawPerTick:d,next:this.now+3000,ticks:3,fx:'ice',damageNature:'residual'});}});
  // One-shot DR is reserved to this whole cast, not consumed per segment.
  for(const target of this.units)if(this.status(target,'preDR').some(st=>st.once&&st.reserved===key))p.effects.push(()=>{target.statuses=target.statuses.filter(st=>!(st.type==='preDR'&&st.once&&st.reserved===key));this.addLog(target.name+'的一次迎击防护已消耗。',{type:'guardConsumed',target:target.id});});
  // Keep passive losses inside the candidate's effects so exact projection
  // captures them too. The scheduler's completion call is idempotent.
  if(u.guildmaster)p.effects.push(()=>this.onActionComplete(u,{...cast,eventId:key}));
  p.effects=p.effects.map(fn=>()=>{const prev=this._effectKey;this._effectKey=key;try{fn();}finally{this._effectKey=prev;}});
  return p;
}
function applyDamage(t,amount,channel,source,fx){
  // A successful phase swap avoids one direct life packet, not poison ticks.
  if(channel!=='精神'&&!this._periodic&&this.value(t,'phaseSwap')){t.statuses=t.statuses.filter(s=>s.type!=='phaseSwap');this.addLog(t.name+'以极光置换避开一次直接生命伤害。',{type:'phaseSwap',target:t.id});return;}
  const hp=t.hp;ShieldActions.methods.applyDamage.call(this,t,amount,channel,source,fx);
  if(t.hp<hp&&t.cast?.skill?.modernEffect==='qinyanSwap'){t.cast=null;this.endTurn(t,false);this.addLog(t.name+'的置换准备被伤害打断。',{type:'interrupt',target:t.id});}
  this.onResourceChange(t);
}
function applyDotDamage(t,d){
  const u=this.unit(d.source);if(!u)return;
  const previous=this._periodic;this._periodic=true;
  try{const amount=this.dotDamage(d,t);d.damage=amount;this.applyDamage(t,amount,d.channel,u,d.fx);this.addLog(t.name+'受到'+(d.damageNature==='poison'?'毒伤':'冻伤/残伤')+'一跳。',{type:'dotTick',actor:u.id,target:t.id,amount});}finally{this._periodic=previous;}
}
function onActionComplete(u,cast){
  if(!cast.eventId)cast.eventId=u.id+':'+(++state(u).sequence);
  ChallengeBattle.completed(this,u,cast);
}
function onResourceChange(u){ChallengeBattle.resourceChange(this,u);}
return {initialize,methods:{effective,cost,castTime,actionRate,targetOptions,actionReason,command,damageValue,tryControl,plan,applyDamage,applyDotDamage,onActionComplete,onResourceChange}};
})(globalThis);
