// Independent challenge. Never part of the random examiner/trait registry.
const ScarredActions=(function(root){
'use strict';
const R=root.WitnessRules,ID='mysterious_scarred_woman',copy=x=>JSON.parse(JSON.stringify(x));
const base={...ModernActions.methods,scheduleAI:BattleCore.methods.scheduleAI,basicCost:BattleCore.methods.basicCost,damageValue:ModernActions.methods.damageValue,effective:ModernActions.methods.effective,previewProtection:ShieldActions.methods.previewProtection,actionReason:ModernActions.methods.actionReason,nextTime:BattleCore.methods.nextTime,hasOffense:BattleCore.methods.hasOffense,finishByTime:BattleCore.methods.finishByTime};
function initialize(b){
 const old=b.unit('enemy'),level=b.unit('player').level,soul={id:'npc-'+ID,name:'幽行剑',tier:9,main_kind:'器',subkind:'战斗',style:'敏攻',attribute:'空间',elements:[],spirit_specialist:false};
 const raw=R.buildStats({level,soul,style:'敏攻',release:'召出'}),average=R.KEYS.reduce((n,k)=>n+raw.stats[k],0)/6;
 const growth=Object.fromEntries(R.KEYS.map(k=>[k,R.round2(raw.stats[k]*(raw.benchmark*2.20/average-1))]));
 const model=R.buildStats({level,soul,style:'敏攻',release:'召出',growth});model.ratingProfile='npc';model.derived.MP*=3;
 const skills=['攻击','强化'].map((category,i)=>{const s=R.makeSkill({soul,style:'敏攻',stats:model,index:i+1,years:99999,category});delete s.effects;return {...s,id:ID+'-'+(i+1),ring:i+1,years:99999,fx:'ghost'};});
 Object.assign(skills[0],{name:'无幽剑光',category:'攻击',channel:'物理',factor:.5,budgetFactor:.9,castFixed:.6,costPercent:.05,cooldown:3,scarEffect:'sword',maxCharges:3,deferredRelease:true,dormantDrainPerSecond:.012,effect:'布设剑光潜入幽行位面，最多三道；蛰伏持续耗蓝，择机透归现实。三道上限与威力不随蛰伏时间增加。'});
 Object.assign(skills[1],{name:'虚影之纱',category:'强化',channel:'能量',selfOnly:true,castFixed:1,costPercent:.09,cooldown:14,scarEffect:'veil',evasion:R.round2(.28*skills[1].Q/2.97),chargePerSecond:1,maxCharges:10,devourFactor:1,chargeFactor:.08,lifesteal:.4,effect:'潜行并逐秒蓄能，最多十层；出手或实际受创后破隐，结算吞噬一击，并将实际伤害的一部分转为生命。'});
 for(const s of skills){s.cost=R.skillBudget(model,s);s.previewCost=s.cost*(s.category==='攻击'?2:1);s.previewCast=s.castFixed;}
 Object.assign(old,{name:'神秘伤疤女',templateId:ID,source:'独立神级挑战',portrait:null,soul,style:'敏攻',release:'召出',level,model,skills,hp:model.derived.HP,sh:model.derived.SH,mp:model.derived.MP,cast:null,statuses:[],dots:[],shieldLayers:[],shieldHP:0,shieldSH:0,shieldUntil:0,cooldowns:{},uses:{},fallen:false,modern:{sequence:0,overheat:[0,0]},scarred:{version:1,swords:[],serial:0,veil:null,lastPulse:b.now,nextPulse:b.now+1000,drainRemainder:0}});
 delete old.passive;delete old.guildmaster;
 b.units=b.units.filter(u=>u.id!=='enemySupport');b.challengeId=ID;
 b.addShieldLayer(old,{source:ID+':auspicious',label:'祥光',channel:'生命',amount:model.derived.HP,until:180001});
 b.addLog('神秘伤疤女登台：与挑战者同级，神级六维，仅有两项万年最高档魂技。需在时限内清空她的生命与精神双槽。',{type:'challengeStart',target:old.id});
}
function validate(b){const u=b.unit('enemy'),p=u?.scarred;if(!p||p.version!==1||!Array.isArray(p.swords)||p.swords.length>3||u.skills.length!==2||u.level!==b.unit('player').level)throw Error('神秘挑战快照无效');for(const k of ['lastPulse','nextPulse','drainRemainder','serial'])if(!Number.isFinite(p[k])||p[k]<0)throw Error('幽行状态无效');for(const sword of p.swords)if(!Number.isFinite(sword.at)||sword.at<0||sword.at>b.now)throw Error('剑光记录无效');if(p.veil&&(!Number.isFinite(p.veil.at)||p.veil.at<0||p.veil.at>b.now))throw Error('潜行记录无效');}
function basicCost(u){return u.scarred?base.basicCost.call(this,u)*2:base.basicCost.call(this,u);}
function cost(u,s){if(!u.scarred)return base.cost.call(this,u,s);if(u.hp<=0)return 0;return base.cost.call(this,u,s)*(s.category==='攻击'?2:1);}
function effective(u){return base.effective.call(this,u);}
function damageValue(u,t,raw,ch,pre){return u.scarred?Math.max(1,Math.round(raw*.3)):base.damageValue.call(this,u,t,raw,ch,pre);}
function previewProtection(t,damage,ch,source){
 if(source?.scarred){const out=ShieldActions.methods.previewShieldDamage.call(this,t,0,ch,null),reduction=this.value(source,'damageDown');const amount=Math.max(0,Math.round(damage*(1-reduction)));return {...out,beforeShields:amount,afterShields:amount,blocked:0,guardBlocked:0,absorbed:0,mpCost:0,healthDamage:amount,bypassShield:true};}
 if(t.scarred&&ch!=='精神'){const out=this.previewShieldDamage(t,damage,ch,source),mpCost=Math.min(Math.max(0,t.mp),Math.floor(out.afterShields*.90));return {...out,absorbed:mpCost,mpCost,healthDamage:out.afterShields-mpCost,shadowWalk:true};}
 return base.previewProtection.call(this,t,damage,ch,source);
}
function chooseTarget(b,u){return b.units.filter(t=>t.team!==u.team&&b.alive(t)).sort((a,z)=>(a.hp+a.sh)/(a.model.derived.HP+a.model.derived.SH)-(z.hp+z.sh)/(z.model.derived.HP+z.model.derived.SH))[0];}
function strike(b,u,t,factor,Q,label){if(!t||!b.alive(t)||!b.alive(u))return 0;const hit=b.hit(u,t,'物理');if(!hit.success){b.addLog(label+'未命中。',{type:'miss',actor:u.id,target:t.id});return 0;}const before=t.hp+t.sh,pre=Object.fromEntries(b.units.map(v=>[v.id,b.effective(v)])),amount=b.damageValue(u,t,1.2*Q*b.effective(u).PA*factor,'物理',pre);b.applyDamage(t,amount,'物理',u,'ghost');return Math.max(0,before-t.hp-t.sh);}
function breakVeil(b,u,target){const p=u.scarred;if(!p?.veil||b._projection)return;const elapsed=Math.max(0,(b.now-p.veil.at)/1000),s=u.skills[1],layers=Math.min(s.maxCharges,Math.floor(elapsed));p.veil=null;u.statuses=u.statuses.filter(st=>st.source!==ID+':veil');const actual=strike(b,u,target||chooseTarget(b,u),s.devourFactor+layers*s.chargeFactor,s.Q,'虚影之纱·吞噬');const before=u.hp;b.heal(u,Math.floor(actual*s.lifesteal),'生命');b.addLog('虚影之纱破隐：'+layers+'层蓄能，实际吞噬'+actual+'，回复生命'+(u.hp-before)+'。',{type:'scarVeilBreak',actor:u.id,layers,actual,healed:u.hp-before});}
function releaseSwords(b,u){const p=u.scarred,s=u.skills[0],swords=p.swords.splice(0);if(!swords.length)return;breakVeil(b,u,chooseTarget(b,u));for(const sword of swords){const t=chooseTarget(b,u);if(!t)break;strike(b,u,t,s.factor,s.Q,'无幽剑光');}b.addLog('无幽剑光透归现实，释放'+swords.length+'道。',{type:'scarSwordRelease',actor:u.id,count:swords.length});}
function pulse(b,u,force=false){const p=u.scarred;if(!p||b._projection||b._scarPulsing||!b.alive(u)||!force&&b.now<p.nextPulse)return;b._scarPulsing=true;try{
 const elapsed=Math.max(0,b.now-p.lastPulse)/1000;
 if(p.swords.length&&u.hp>0){const exact=u.model.derived.baseMP*.012*2*p.swords.length*elapsed+p.drainRemainder,wanted=Math.floor(exact),paid=Math.min(u.mp,wanted);u.mp-=paid;p.drainRemainder=exact-wanted;if(paid)b.addLog('蛰伏剑光维持，魂力 −'+paid+'。',{type:'scarSwordUpkeep',actor:u.id,paid});if(paid<wanted)releaseSwords(b,u);}
 p.lastPulse=b.now;p.nextPulse=b.now+1000;
 if(p.swords.length&&(p.swords.length>=3||b.now-p.swords[0].at>=6000||u.mp<=0&&u.hp>0))releaseSwords(b,u);
 }finally{b._scarPulsing=false;}}
function applyDamage(t,amount,ch,source,fx){
 if(!t.scarred)return base.applyDamage.call(this,t,amount,ch,source,fx);
 if(!amount||!this.alive(t))return;this.expireShields(t);const hp=t.hp,sh=t.sh,out=this.previewProtection(t,amount,ch,source);
 t.shieldLayers=out.nextLayers;this.expireShields(t);t.mp=Math.max(0,t.mp-out.mpCost);
 let remain=out.healthDamage;const first=ch==='精神'?'sh':'hp',second=first==='hp'?'sh':'hp',paid=Math.min(t[first],remain);t[first]-=paid;remain-=paid;t[second]=Math.max(0,t[second]-remain);
 this.addLog(t.name+'承伤：生命 −'+(hp-t.hp)+'，精神 −'+(sh-t.sh)+'，魂力 −'+out.mpCost+'。',{type:'damage',actor:source?.id,target:t.id,amount:out.healthDamage,channel:ch,healthLost:hp-t.hp,mentalLost:sh-t.sh,paid:out.mpCost,shieldBlocked:out.blocked,guardBlocked:out.guardBlocked,shieldLayersHit:out.hits});
 if(this.alive(t)&&(hp>t.hp||sh>t.sh))breakVeil(this,t,source||chooseTarget(this,t));
}
function plan(u,cast,pre){
 if(!u.scarred||!cast.skill?.scarEffect){const p=base.plan.call(this,u,cast,pre);if(u.scarred&&cast.action==='attack'&&u.scarred.veil)p.effects.unshift(()=>breakVeil(this,u,p.t));return p;}
 const s=cast.skill,t=this.unit(cast.target),p={u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};
 if(s.scarEffect==='sword')p.effects.push(()=>{pulse(this,u,true);if(u.scarred.swords.length<3){u.scarred.swords.push({id:++u.scarred.serial,at:this.now});this.addLog('无幽剑光潜入幽行位面，当前'+u.scarred.swords.length+'道。',{type:'scarSwordPlaced',actor:u.id});}breakVeil(this,u,chooseTarget(this,u));pulse(this,u,true);});
 else p.effects.push(()=>{u.scarred.veil={at:this.now};this.setStatus(u,'evasion',s.evasion,180.001,{source:ID+':veil',label:'虚影之纱'});this.addLog('虚影之纱展开，潜行蓄能。',{type:'scarVeilStart',actor:u.id});});
 return p;
}
function actionReason(u,action){const s=u.skills.find(s=>s.id===action);if(u.scarred&&s?.scarEffect==='sword'&&u.scarred.swords.length>=3)return '剑光已达三道';if(u.scarred&&s?.scarEffect==='veil'&&u.scarred.veil)return '仍在潜行';return base.actionReason.call(this,u,action);}
function aiChoice(u){if(!u.scarred)return UnifiedDecision.methods.aiChoice.call(this,u);const target=chooseTarget(this,u);if(!target)return null;const action=(id,t=target.id)=>({action:id,target:t});if(u.bonusAttack)return u.scarred.veil||u.mp<this.basicCost(u)?action('skipBonus',u.id):action('attack');if(u.scarred.veil&&this.now-u.scarred.veil.at<10000)return action('wait',u.id);for(const s of [u.skills[1],u.skills[0]])if(!this.actionReason(u,s.id))return action(s.id,s.selfOnly?u.id:target.id);return !this.actionReason(u,'attack')?action('attack'):action('wait',u.id);}
function onResourceChange(u){ModernActions.methods.onResourceChange.call(this,u);pulse(this,u);}
function scheduleAI(auto=false){for(const u of this.units)pulse(this,u);return base.scheduleAI.call(this,auto);}
function nextTime(){const next=base.nextTime.call(this);return Math.min(next,...this.units.filter(u=>u.scarred&&this.alive(u)&&u.scarred.nextPulse>this.now).map(u=>u.scarred.nextPulse));}
function hasOffense(u){return u.scarred?this.alive(u):base.hasOffense.call(this,u);}
function finishByTime(){const boss=this.units.find(u=>u.scarred);if(boss&&this.alive(boss)){this.result={winner:boss.team,reason:'180秒内未清空神秘伤疤女双槽',time:this.now};this.addLog(this.result.reason);return;}return base.finishByTime.call(this);}
root.WitnessScarredChallenge={id:ID,initialize,validate};
return {methods:{basicCost,cost,effective,damageValue,previewProtection,applyDamage,plan,actionReason,aiChoice,onResourceChange,scheduleAI,nextTime,hasOffense,finishByTime}};
})(globalThis);
