// v12 encounter/trait adapter: uses the existing timeline, hit, damage and shield rules.
const V12Battle=(function(root){
'use strict';
const R=root.WitnessRules,API=root.WitnessV12,copy=x=>JSON.parse(JSON.stringify(x));
const has=(u,id)=>(u.v12Traits||[]).some(t=>t.id===id||t.traitId===id);
const state=u=>{if(!u.v12State||u.v12State.version!==1)u.v12State={turns:0,mossStacks:0,iceAgility:0,tides:{},shellFirst:false,shellSerial:0,shellAbsorbed:{},overflow:0,...(u.v12State||{}),version:1};return u.v12State;};
const elements=u=>API.battle.skillAttributes.attributeTags(u.soul||u);
const enemies=(b,u)=>b.units.filter(t=>t.team!==u.team&&b.alive(t));
const battleDuration=9007199254; // finite, JSON-safe lifetime beyond practical battle time
const battleEnd=Number.MAX_SAFE_INTEGER;
function runtime(unit){const u=copy(unit),d=u.model.derived;Object.assign(u,{progress:0,queuedAt:null,queueOrder:0,actions:0,hp:d.HP,mp:d.MP,sh:d.SH,cast:null,readyAt:0,cooldowns:{},uses:{},statuses:[],dots:[],shieldLayers:[],shieldHP:0,shieldSH:0,shieldUntil:0,oneHit:false,guard:0,immuneUntil:0,rage:0,tuneUses:0,calmUses:0,manaGiftUses:0,firstHit:false,fallen:false,modern:{sequence:0,overheat:[0,0]}});if(u.release==='召唤'){u.bodyHP=Math.round(d.HP*.45);u.petHP=d.HP-u.bodyHP;u.petMax=u.petHP;u.bodyMax=u.bodyHP;u.petAlive=true;}return u;}
function initializeBattle(b,{huntPlan,seed}){
 const units=huntPlan.units.map(runtime);Object.assign(b,{v12Battle:true,v12Session:huntPlan.sessionId,activeId:null,queueSequence:0,units,difficulty:'hunt',seed:String(seed||huntPlan.seed),rng:new root.WitnessDice.DiceEngine(seed||huntPlan.seed),now:0,result:null,log:[],events:[],turn:0,resourceConfig:R.getResourceConfig(),controlRules:{...root.WitnessControlV9.getConfig()}});
 for(const u of b.units)u.tiePriority=b.rng.die(100000);
 ShieldActions.initialize(b);b.initializeActorState();b.addLog('讨伐之战：'+(units.length-1)+'对1；只有魂兽真正退场且友方有人存活才获得环骨。无180秒限制；连续10秒无人能行动、平局、逃离与认输均无战利品。',{type:'huntStart'});b.scheduleAI();
}
function initTraits(b){
 for(const u of b.units){
  u.skills=u.skills.map(s=>API.battle.skillAttributes.tagSkill(s,u.soul));if(u.npcId==='chengliang'){const current=API.roster.combatSpec('chengliang').traits.find(t=>t.name==='六库仙贼');u.traits=(u.traits||[]).map(t=>t.name==='六库仙贼'?copy(current):t);}
  u.v12Traits||=[];if(has(u,'frost-moss-immunity'))u.statuses=u.statuses.filter(st=>!['slow','freeze','sluggish','agilityDown','statDownA','frostCastSlow'].includes(st.type));const fresh=!u.v12State;state(u);if(fresh&&u.beastId)state(u).mossStacks=u.v12InitialMossStacks||0;if(fresh){const moss=u.v12Traits.find(t=>(t.id||t.traitId)==='moss-armor-accumulation');if(moss?.ownerBoneId)state(u).mossStacks=u.v12Permanent?.[moss.ownerBoneId]?.mossStacks||0;}u.lifeType||='生活';
  if(u.npcId==='chengliang'&&!u.v12NPC)u.v12NPC=API.npc.TRAITS.chengliang.createState({maxHP:u.model.derived.HP,permanentProgress:u.permanentProgress});
  if(u.npcId==='xutaiping'&&!u.v12NPC)u.v12NPC=API.npc.TRAITS.xutaiping.createState();
  if(u.npcId==='sailiya_fengzhi'&&!u.v12NPC)u.v12NPC=API.npc.TRAITS.sailiya_fengzhi.createState();
  if(!u.v12BaseStats)u.v12BaseStats=copy(u.model.stats);
  if(u.npcId==='chengliang'&&!u.bodyMultiplierApplied&&u.permanentProgress?.thiefQiStacks)bodyProgress(b,u,u.permanentProgress.thiefQiStacks);
 }
}
function traitEffects(b,u,effects){for(const e of effects||[]){if(e.op==='heal')b.heal(u,e.amount,'生命');else if(e.op==='restoreMP')restoreMP(b,u,e.amount,e.reason);else if(e.op==='permanentProgress'){u.permanentProgress||={};u.permanentProgress[e.key]=e.value;}else if(e.op==='bodyBonus')bodyProgress(b,u,e.stacks);else if(e.op==='addStatus')b.setStatus(b.unit(e.targetId),e.type,e.value,e.duration==='battle'?battleDuration:e.duration,{source:u.id+':'+e.type,label:'黑蚀',v12Caster:u.id});else if(e.op==='log')b.addLog(e.text,{type:'trait',actor:u.id});}}
function bodyProgress(b,u,stacks){const priorHP=u.model.derived.HP,prior=u.model.stats.B;u.model.stats.B=u.v12BaseStats.B*(1+.1*stacks);const derived=R.derive(u.model.stats);for(const k of ['HP','PA','DEF'])u.model.derived[k]=derived[k];u.hp=Math.min(u.model.derived.HP,u.hp);u.bodyMultiplierApplied=true;if(prior!==u.model.stats.B)b.addLog(u.name+'盗气'+stacks+'层，肉体强度提升。',{type:'trait',actor:u.id});}
function benefit(b,t,kind,value,actual=value){let n=value;for(const owner of b.units.filter(u=>u.npcId==='xutaiping'&&u.team!==t.team&&b.alive(u))){state(owner).benefitSerial=(state(owner).benefitSerial||0)+1;const x=API.npc.TRAITS.xutaiping.applyBenefit(owner.v12NPC,{targetId:t.id,kind,value:n,actualBenefit:Math.min(actual,n),groupId:b._v12Group||b._effectKey||('resource:'+b.now+':'+state(owner).benefitSerial)});owner.v12NPC=x.state;n=x.outcome.value;traitEffects(b,owner,x.effects);}return Math.max(0,n);}
function restoreMP(b,u,amount,label){if(!b.alive(u)||!(amount>0))return;const gap=Math.max(0,u.model.derived.MP-u.mp),actual=benefit(b,u,'mp-restore',Math.min(gap,amount));u.mp=Math.min(u.model.derived.MP,u.mp+actual);if(actual)b.addLog(u.name+'回魂 '+Math.round(actual)+' · '+label,{type:'mpRestore',target:u.id,amount:actual});const overflow=Math.max(0,amount-gap);if(has(u,'devouring-soul-recovery')&&!b._v12Siphon){const shield=Math.min(overflow,u.model.derived.HP*.1-state(u).overflow);if(shield>0){state(u).overflow+=shield;b.addShieldLayer(u,{source:u.id+':overflow',label:'吞噬回魂·溢出',amount:(u.shieldLayers.find(s=>s.source===u.id+':overflow')?.amount||0)+shield,channel:'生命',until:battleEnd});}}return overflow;}
function absorbManaSpent(b,spender,amount){if(!(amount>0)||b._v12Siphon)return;b._v12Siphon=true;try{for(const u of b.units.filter(u=>has(u,'devouring-soul-recovery')&&b.alive(u)&&!state(u).sealed)){const gain=amount*.3,gap=u.model.derived.MP-u.mp;restoreMP(b,u,gain,'吞噬回魂');const overflow=Math.max(0,gain-gap),room=u.model.derived.HP*.1-state(u).overflow,shield=Math.min(room,overflow);if(shield>0){state(u).overflow+=shield;b.addShieldLayer(u,{source:u.id+':overflow',label:'吞噬回魂·溢出',amount:(u.shieldLayers.find(s=>s.source===u.id+':overflow')?.amount||0)+shield,channel:'生命',until:battleEnd});}}}finally{b._v12Siphon=false;}}
function shell(b,u){const layers=(u.shieldLayers||[]).filter(s=>s.label==='冰壳护生');if(layers.length>=2)return;const id=u.id+':shell:'+(++state(u).shellSerial);state(u).shellAbsorbed[id]=0;b.addShieldLayer(u,{source:id,label:'冰壳护生',amount:u.model.derived.HP*.8,channel:'生命',until:battleEnd});}
function beginTurn(b,u){if(u.bonusAttack||u.v12TurnOpen||!b.alive(u))return;u.v12TurnOpen=true;state(u).turns++;state(u).overflow=0;
 if(has(u,'ice-shell-preservation')){if(state(u).shellFirst)shell(b,u);else{shell(b,u);state(u).shellFirst=true;}}
 for(const owner of b.units.filter(o=>has(o,'frost-domain')&&b.alive(o))){if(owner===u&&!state(owner).domainSuppressed&&elements(u).includes('冰'))state(u).iceAgility++;else if(owner!==u&&!state(owner).domainSuppressed&&elements(u).includes('冰'))state(u).iceAgility++;}
 if(u.npcId==='chengliang'){const t=API.npc.TRAITS.chengliang;const out=t.handle(u.v12NPC,{type:'turn-start',controlled:!!b.value(u,'control'),livingEnemyIds:enemies(b,u).filter(v=>!has(v,'frost-moss-immunity')).map(v=>v.id)});u.v12NPC=out.state;traitEffects(b,u,out.effects);const target=enemies(b,u)[0];if(target)u.v12NPC=t.handle(u.v12NPC,{type:'gaze-select',targetId:target.id}).state;}
 if(u.npcId==='xutaiping')u.v12NPC=API.npc.TRAITS.xutaiping.beginTurn(u.v12NPC);
}
function endAction(b,u,cast){if(cast?.bonus||u.v12Channel)return;state(u).costPressure=false;
 if(!u.v12TurnOpen)return;u.v12TurnOpen=false;
 if(has(u,'devouring-soul-recovery')&&!state(u).sealed)restoreMP(b,u,u.model.derived.MP*.08,'吞噬回魂·回合末');
 if(u.npcId==='chengliang'){const out=API.npc.TRAITS.chengliang.handle(u.v12NPC,{type:'turn-end',dead:!b.alive(u),hp:u.hp,maxHP:u.model.derived.HP,mp:u.mp,maxMP:u.model.derived.MP});u.v12NPC=out.state;traitEffects(b,u,out.effects);}
 if(u.npcId==='sailiya_fengzhi'){const out=API.npc.TRAITS.sailiya_fengzhi.endTurn(u.v12NPC,{maxMP:u.model.derived.MP,lethal:!b.alive(u)});u.v12NPC=out.state;traitEffects(b,u,out.effects);}
 state(u).sealed=false;if(state(u).domainSuppressed)state(u).domainSuppressed=false;
}
function tideRates(b,u){if(has(u,'frost-moss-immunity'))return {cast:0,action:0};let cast=0,action=0;for(const t of Object.values(state(u).tides||{}))if(t.until>b.now){cast=Math.min(.9,cast+.2*t.stacks);action=Math.min(.9,action+.15*t.stacks);}for(const owner of b.units.filter(o=>has(o,'frost-domain')&&b.alive(o)&&!state(o).domainSuppressed)){if(elements(u).includes('冰'))continue;const tier=Math.min(2,Math.floor((state(owner).turns||0)/2));cast=Math.min(.9,cast+[.2,.275,.35][tier]);action=Math.min(.9,action+[.15,.2,.25][tier]);}return {cast,action};}
function pulse(b){
 for(const u of b.units){
  if(!b.alive(u))continue;
  if(u.npcId==='xutaiping'){const last=state(u).lastLampTime??0,dt=(b.now-last)/1000;state(u).lastLampTime=b.now;const out=API.npc.TRAITS.xutaiping.tickLamps(u.v12NPC,{dt,at:b.now/1000,controlled:!!b.value(u,'control')});u.v12NPC=out.state;traitEffects(b,u,out.effects);}
  const channel=u.v12Channel;if(channel&&channel.next<=b.now){if(b.value(u,'control')){u.v12Channel=null;b.addLog(u.name+'的剑舞被打断，未释放段数取消。');endAction(b,u,{});continue;}const target=b.unit(channel.target);if(target&&b.alive(target))attack(b,u,target,channel.skill,channel.factor,channel.channel,{rune:true});channel.left--;channel.next+=channel.interval;if(channel.left<=0){u.v12Channel=null;endAction(b,u,{});}}
 }
}
function attack(b,u,t,s,factor=1,channel=s.channel,context={}){
 if(!b.alive(t)||!b.alive(u))return false;let hit=context.hit;
 if(hit===undefined)hit=b.hit(u,t,channel,(context.accuracy||0)/100).success;
 if(!hit){b.addLog(u.name+'的'+s.name+'未命中。',{type:'miss',actor:u.id,target:t.id});return false;}
 const eff=b.effective(u),power=channel==='物理'?eff.PA:channel==='精神'?eff.MA:eff.SA;
 const pre=Object.fromEntries(b.units.map(x=>[x.id,b.effective(x)]));
 const damage=b.damageValue(u,t,1.2*s.Q*power*factor*(context.charge||1),channel,pre);
 const old=b._packetSkill;b._packetSkill=s;const double=b._v12DoubleDefense;b._v12DoubleDefense=!!u.v12NPC?.rune?.active;
 try{b.applyDamage(t,damage,channel,u,s.fx||'wave');
 if(u.npcId==='sailiya_fengzhi'&&u.v12NPC.rune.active&&b.alive(t)){
  const resist=t.elementResistances||t.resistances||{},keys=Object.keys(resist);const element=keys.length?keys.sort((a,z)=>resist[a]-resist[z])[0]:'无';
  const add=Math.round(damage*.3*(1-Math.max(-1,Math.min(1,resist[element]||0))));b._packetSkill={...s,elements:[element],attribute:element};b.applyDamage(t,add,'能量',u,'rune');
 }
 }finally{b._packetSkill=old;b._v12DoubleDefense=double;}
 if(state(u).storedEnergy&&state(u).storedUntil>b.now){const amount=state(u).storedEnergy;state(u).storedEnergy=0;b.applyDamage(t,b.damageValue(u,t,amount,'能量',pre),'能量',u,'wave');}
 return true;
}
function execute(b,u,t,s,ops){
 if(!b.alive(u)||!t)return;const previous=b._v12Group;b._v12Group=u.id+':'+s.id+':'+u.actions;
 const ctx={hit:undefined,passed:true,charge:1,accuracy:b.value(u,'v12Accuracy')*100};
 u.statuses=u.statuses.filter(st=>st.type!=='v12Accuracy');
 if(u.npcId==='sailiya_fengzhi'&&s.category==='攻击'){const charge=API.npc.TRAITS.sailiya_fengzhi.consumeCharge(u.v12NPC,true);u.v12NPC=charge.state;ctx.charge=charge.multiplier;}
 try{for(const op of ops){if(!ctx.passed)break;switch(op.type){
 case 'hit_contest_once':ctx.hit=b.hit(u,t,s.channel,ctx.accuracy/100).success;ctx.passed=ctx.hit;break;
 case 'debuff_contest':{const e=R.controlEffect(s.Q,b.effective(u),b.effective(t));ctx.passed=b.rng.die(100)<=Math.round(e.chance);b.addLog(s.name+'减益判定'+(ctx.passed?'成功':'被抵抗'),{type:'status',actor:u.id,target:t.id});break;}
 case 'direct_attack':ctx.lastHit=attack(b,u,t,s,(u.beastId?op.factor/1.2:op.factor)||1,op.channel||s.channel,{...ctx,accuracy:ctx.accuracy+(op.accuracyPoints||0)});break;
 case 'partitioned_attack':{const total=op.factor||1;for(let i=0;i<(op.parts||2);i++)attack(b,u,t,s,total/(op.parts||2),op.channel||s.channel,ctx);break;}
 case 'channeled_partitioned_attack':u.v12Channel={target:t.id,skill:copy(s),factor:(op.factor||1)/(op.parts||6),channel:op.channel||s.channel,left:op.parts||6,interval:Math.round((op.intervalSeconds||.5)*1000),next:b.now+Math.round((op.intervalSeconds||.5)*1000)};break;
 case 'budgeted_area_attack':{const targets=enemies(b,u);for(const target of targets)attack(b,u,target,s,(op.factor||1)/targets.length,op.channel||s.channel,ctx);break;}
 case 'periodic_attack':{const hit=b.hit(u,t,op.channel||s.channel);if(!hit.success)break;const eff=b.effective(u),channel=op.channel||s.channel,power=channel==='物理'?eff.PA:eff.SA,parts=op.parts||3;const pre=Object.fromEntries(b.units.map(x=>[x.id,b.effective(x)]));const raw=op.factor*s.Q*power/parts;const damage=b.damageValue(u,t,raw,channel,pre);const key=u.id+'-'+s.id;t.dots=t.dots.filter(d=>d.key!==key);t.dots.push({key,source:u.id,skill:copy(s),channel,baseDamage:damage,damage,next:b.now+3000,rawPerTick:raw,ticks:parts,fx:s.fx||'ice',damageNature:'residual'});break;}
 case 'shield':b.addShieldLayer(u,{source:u.id+':'+s.id,label:s.name,amount:(op.coefficient||.45)*s.Q*b.effective(u).SA,channel:op.channel||'生命',until:b.now+(op.ttlSeconds||8)*1000,casterId:u.id,skillId:s.id});break;
 case 'heal':b.heal(u,(op.coefficient||.4)*s.Q*b.effective(u).SA,'生命');break;
 case 'control_contest':b.tryControl(u,t,s,op.baseSeconds);break;
 case 'conditional_control_contest':if(t.cast&&ctx.lastHit)b.tryControl(u,t,s,op.baseSeconds);break;
 case 'numeric_debuff':{if(op.trigger==='three_lamps_extinguished'||op.trigger==='on_hit'&&!ctx.lastHit||op.onlyBeforeCast&&t.cast)break;const mapping={A:'agilityDown',D:'defDown',P:'mindDown',agilityDown:'agilityDown',damageDown:'damageDown',defDown:'defDown',mindDown:'mindDown',skillCostUp:'costUp',allyVulnerability:'v12Vulnerability'};const before=u.v12NPC?copy(u.v12NPC):null;
 if(u.beastId&&!op.instant){const e=R.controlEffect(s.Q,b.effective(u),b.effective(t));if(b.rng.die(100)>e.chance)break;}
 for(const [key,raw]of Object.entries(op.values||{})){const field=key==='skillCostUp'?'skillCostUp':key;let value=raw;if(u.npcId==='xutaiping'&&API.npc.TRAITS.xutaiping.constants.CAPS[field]!==undefined)value=API.npc.TRAITS.xutaiping.amplify(before,{targetId:t.id,field,baseValue:raw}).value;
 if(key==='gaugeLoss'){if(!t.cast)t.progress=Math.max(0,t.progress-value);continue;}
 const type=mapping[key]||key,duration=op.lifetime==='battle'?battleDuration:op.ttlSeconds||6;b.setStatus(t,type,value,duration,{source:u.id+':'+s.id+':'+key,label:s.name,from:u.name,v12Caster:u.id,cleansable:true});
 if(u.npcId==='xutaiping')u.v12NPC=API.npc.TRAITS.xutaiping.recordDebuff(u.v12NPC,{targetId:t.id,debuffId:s.id+':'+key,field,value,appliedAt:b.now/1000}).state;}
 break;}
 case 'delayed_three_lamps':if(u.npcId==='xutaiping'){u.v12NPC=API.npc.TRAITS.xutaiping.applyLamps(u.v12NPC,{targetId:t.id,at:b.now/1000}).state;b.addLog('三顶亮黄灯柱悬在'+t.name+'头顶。',{type:'trait',actor:u.id,target:t.id});}break;
 case 'battle_stat_up':case 'temporary_stat_up':b.setStatus(u,'v12Stats',1,op.lifetime==='battle'?battleDuration:op.ttlSeconds||12,{source:u.id+':'+s.id,label:s.name,values:copy(op.values||{})});break;
 case 'battle_attack_up':b.setStatus(u,'attackBoost',op.value,battleDuration,{source:u.id+':'+s.id,label:s.name});break;
 case 'hp_cost':{const fee=Math.ceil(u.model.derived.HP*op.maxHPRate);if(u.hp<=fee){ctx.passed=false;b.addLog(u.name+'生命不足，未能燃血。');break;}u.hp-=fee;break;}
 case 'charged_attack_modifier':u.v12NPC=API.npc.TRAITS.sailiya_fengzhi.refillCharge(u.v12NPC);break;
 case 'one_use_evasion':b.setStatus(u,'v12Evasion',Math.abs(op.incomingHitPoints)/100,battleDuration,{source:u.id+':'+s.id,label:s.name,uses:1});break;
 case 'phase_avoid_once':b.setStatus(u,'phaseSwap',1,op.ttlSeconds||5,{source:u.id+':'+s.id,label:s.name});break;
 case 'one_hit_damage_reduction':b.setStatus(u,'preDR',op.value,op.ttlSeconds||6,{source:u.id+':'+s.id,label:s.name,once:true,channels:op.channels});break;
 case 'reserve_absorbed_energy':state(u).reserve={rate:op.rate,cap:op.capMaxHP*u.model.derived.HP,until:b.now+(op.ttlSeconds||10)*1000};break;
 case 'next_attack_skill_hit_release':break; // reserve released by the next successful direct attack
 case 'next_attack_skill_accuracy':b.setStatus(u,'v12Accuracy',op.points/100,op.ttlSeconds||12,{source:u.id+':'+s.id,label:s.name});break;
 case 'next_attack_skill_cast_multiplier':b.setStatus(u,'v12Cast',op.value,battleDuration,{source:u.id+':'+s.id,label:s.name});break;
 case 'reduce_outer_life_shield':{const top=(t.shieldLayers||[]).filter(l=>l.channel==='生命').sort((a,z)=>z.order-a.order)[0];if(top){const loss=Math.min(top.amount,op.coefficient*s.Q*b.effective(u).SA);top.amount-=loss;b.expireShields(t);b.addLog(s.name+'削去外层护盾'+Math.round(loss),{type:'dispel',actor:u.id,target:t.id});}for(const owner of b.units.filter(x=>has(x,'frost-domain')&&b.alive(x)))state(owner).domainSuppressed=true;break;}
 case 'transfer_one_dispellable_numeric_debuff':{if(u.v12Transferred)break;const item=t.statuses.find(st=>st.cleansable&&st.value>0&&!['control'].includes(st.type));if(item){t.statuses=t.statuses.filter(st=>st!==item);b.setStatus(u,item.type,item.value*(op.magnitudeMultiplier||.5),battleDuration,{...item,until:battleEnd,source:item.source,transferred:true});u.v12Transferred=true;}break;}
 default:throw Error('未接入的v12技能操作：'+op.type);
 }} }finally{b._v12Group=previous;}
}
function wrap(original){const base={...original};
 return {
 initializeActorState(){base.initializeActorState.call(this);initTraits(this);if(this.v12Battle&&this.v12BattleVersion!==2){for(const u of this.units){for(const st of u.statuses)if(st.until===180001)st.until=battleEnd;for(const sh of u.shieldLayers||[])if(sh.until===180001)sh.until=battleEnd;}this.v12BattleVersion=2;}},
 forkProjectionState(){const fork=base.forkProjectionState.call(this);for(const u of fork.units)if(u.npcId||u.v12Traits?.length)u.model=copy(u.model);return fork;},
 snapshot(){return {...base.snapshot.call(this),v12Battle:!!this.v12Battle,v12Session:this.v12Session||null,v12BattleVersion:2,v12StalledSince:this.v12StalledSince??null};},
 selectActor(){const before=this.activeId;base.selectActor.call(this);const u=this.unit(this.activeId);if(u&&u.id!==before)beginTurn(this,u);},
 effective(u){let out=base.effective.call(this,u);const q={...out},s=state(u);let B=1,D=1,A=1;
  if(has(u,'moss-armor-accumulation')){B+=.05*s.mossStacks;D+=.1*s.mossStacks;}
  A+=.05*s.iceAgility;
  if(u.npcId==='chengliang')B=1; // permanent body is applied once to the source model
  for(const owner of this.units.filter(o=>o.npcId==='chengliang'&&this.alive(o))){const stacks=owner.v12NPC?.grid?.enemies?.[u.id]||0;if(!has(u,'frost-moss-immunity'))A*=1-.05*stacks;}
  for(const st of this.status(u,'v12Stats')){const scale=st.value??1;B*=1+(st.values?.B||0)*scale;D*=1+(st.values?.D||0)*scale;A*=1+(st.values?.A||0)*scale;for(const k of ['S','C','P'])q[k]*=1+(st.values?.[k]||0)*scale;}
  q.B*=B;q.D*=D;q.A*=A;const nd=R.derive(q),prior=R.derive(out);for(const k of ['PA','SA','MA','DEF','MDEF'])q[k]=out[k]*(nd[k]/Math.max(.01,prior[k]));return q;
 },
 castTime(u,s){return base.castTime.call(this,u,s)*(s.category==='攻击'?(this.value(u,'v12Cast')||1):1)/(1-tideRates(this,u).cast);},
 actionRate(u){return u.v12Channel?0:base.actionRate.call(this,u)*(1-tideRates(this,u).action);},
 cost(u,s){return Math.ceil(base.cost.call(this,u,s)*(state(u).costPressure?1.3:1));},
 basicCost(u){return Math.ceil(base.basicCost.call(this,u)*(state(u).costPressure?1.3:1));},
 targetOptions(u,action){const s=u.skills.find(s=>s.id===action);if(s?.target==='另一名队友')return this.units.filter(t=>t.team===u.team&&t.id!==u.id&&this.alive(t));return base.targetOptions.call(this,u,action);},
 hitChance(u,t,ch,bonus=0){let result=base.hitChance.call(this,u,t,ch,bonus);if(ch!=='精神'&&['chengliang','sailiya_fengzhi'].includes(u.npcId)){const a=this.effective(u),z=this.effective(t),controlled=!!this.value(t,'control'),c=this.dodgeConfig||{coefficient:.4,bonus:.35,cap:.9},active=!controlled&&this.value(t,'activeDodge'),diff=Math.max(0,a.A/Math.max(20,u.model.benchmark)-(controlled?0:z.A/Math.max(20,t.model.benchmark)));result=Math.max(.6,Math.min(.97,.9+diff*(active?c.coefficient:.12)));if(!controlled)result-=this.value(t,'evasion');if(active)result-=c.bonus;result=Math.max(active?1-c.cap:.4,result);if(u.npcId==='chengliang')result=Math.max(.6,result)+(u.v12NPC?.vision.gazeTargetId===t.id?.08:0);result=Math.min(.97,result+bonus)-this.value(u,'accuracyDown');}if(ch!=='精神'&&!this._packetSkill?.spaceLock)result-=this.value(t,'v12Evasion');return Math.max(.05,Math.min(.97,result));},
 hit(u,t,ch,bonus=0){const out=(u.npcId==='chengliang'?ControlActions.methods.hit:base.hit).call(this,u,t,ch,bonus);if(ch!=='精神')t.statuses=t.statuses.filter(st=>st.type!=='v12Evasion');return out;},
 tryControl(u,t,s,duration){if(has(t,'frost-moss-immunity')&&API.battle.skillAttributes.attributeTags(s).includes('冰')){this.addLog(t.name+'免疫冻结。');return;}return base.tryControl.call(this,u,t,s,duration);},
 actionReason(u,action){if(u.v12Channel)return '正在维持天阑舞';return base.actionReason.call(this,u,action);},
 command(id,action,target){const u=this.unit(id),before=u?.mp||0;const err=base.command.call(this,id,action,target);if(err)return err;const paid=Math.max(0,before-u.mp);absorbManaSpent(this,u,paid);if(u.cast?.skill?.category==='攻击')u.statuses=u.statuses.filter(st=>st.type!=='v12Cast');if(action==='attack'||u.cast?.skill?.category==='攻击')u.statuses=u.statuses.filter(st=>st.type!=='phaseSwap');if(u.npcId==='sailiya_fengzhi'&&(action==='attack'||['攻击','持续伤害'].includes(u.cast?.skill?.category))){const out=API.npc.TRAITS.sailiya_fengzhi.activateRune(u.v12NPC,{castId:u.cast?.eventId||id+':'+u.actions,paidMainCost:paid,mpAvailable:u.mp});u.v12NPC=out.state;if(out.activated){u.mp-=out.extraCost;absorbManaSpent(this,u,out.extraCost);this.addLog(u.name+'附上符剑，额外魂力消耗'+out.extraCost+'。',{type:'trait',actor:id});}}return '';},
 plan(u,cast,pre){const ops=cast.skill?.npcOperations||cast.skill?.v12Operations;if(ops){const t=this.unit(cast.target);return {u,t,cast,s:cast.skill,damage:0,heal:0,channel:cast.skill.channel,effects:[()=>{if(cast.skill.target==='敌方全体'&&!ops.some(op=>op.type==='budgeted_area_attack'))for(const target of enemies(this,u))execute(this,u,target,cast.skill,ops);else execute(this,u,t,cast.skill,ops);}]};}return base.plan.call(this,u,cast,pre);},
 onActionComplete(u,cast){base.onActionComplete.call(this,u,cast);endAction(this,u,cast);},
 nextTime(){let next=base.nextTime.call(this);if(this.v12Battle){next=Math.min(next,this.now+250);for(const u of this.units)if(u.v12Channel)next=Math.min(next,u.v12Channel.next);}return next;},
 v12Pulse(){pulse(this);},
 v12CanPerform(u){if(this.value(u,'control'))return false;const active=this.activeId,ready=u.readyAt,cast=u.cast;this.activeId=u.id;u.readyAt=this.now;u.cast=null;try{return ['attack',...u.skills.map(s=>s.id)].some(action=>!this.actionReason(u,action)&&this.targetOptions(u,action).length>0);}finally{this.activeId=active;u.readyAt=ready;u.cast=cast;}},
 heal(t,amount,ch){if(!(amount>0)||!this.alive(t))return;const max=ch==='精神'?t.model.derived.SH:t.model.derived.HP,gap=max-(ch==='精神'?t.sh:t.hp);return base.heal.call(this,t,benefit(this,t,'heal',Math.min(amount,gap)),ch);},
 addShieldLayer(t,spec){const amount=benefit(this,t,'shield',spec.amount||0);if(spec.amount>0&&amount===0)return null;return base.addShieldLayer.call(this,t,{...spec,amount,until:this.v12Battle&&spec.until===180001?battleEnd:spec.until});},
 setStatus(u,type,value,duration,extra={}){if(!u)return;
  if(has(u,'frost-moss-immunity')&&['slow','freeze','sluggish','agilityDown','statDownA','frostCastSlow'].includes(type))return;
  if(u.npcId==='chengliang'&&['fatigue','aging','decay','illusion','disguise'].includes(type))return;
  if(['resource_seal','resource_prohibition'].includes(type)||extra.tags?.some(t=>['resource_seal','resource_prohibition'].includes(t))){state(u).sealed=true;if(u.v12NPC?.secretOrigin){u.v12NPC.secretOrigin.sealed=true;u.v12NPC.secretOrigin.pending=0;}}
  if(duration===180.001&&this.v12Battle)duration=battleDuration;if(['agility','attackBoost','v12Stats','evasion'].includes(type)||type.startsWith('statUp')){value=benefit(this,u,'buff',value);if(!value)return;}
  return base.setStatus.call(this,u,type,value,duration,extra);
 },
 damageValue(u,t,raw,ch,pre){let amount=base.damageValue.call(this,u,t,raw,ch,pre);if(u.npcId==='chengliang')amount*=1+.1*(u.v12NPC?.grid.self||0);if(t.npcId==='chengliang'&&t.v12NPC?.vision.gazeTargetId===u.id)amount*=1.1;if(has(t,'moss-armor-accumulation')&&!u.scarred&&!this._packetSkill?.trueDamage)amount*=1-Math.min(.15,.05*Math.floor(state(t).mossStacks/4));for(const st of this.status(t,'v12Vulnerability'))if(u.id!==st.v12Caster)amount*=1+st.value;return Math.max(0,Math.round(amount));},
 previewProtection(t,damage,ch,source){let out=base.previewProtection.call(this,t,damage,ch,source);if(this._v12BypassShield){return {...out,nextLayers:copy(t.shieldLayers||[]),blocked:0,guardBlocked:0,absorbed:0,mpCost:0,healthDamage:damage};}if(this._v12DoubleDefense&&out.mpCost>0){const absorption=Math.min(out.absorbed||out.mpCost,Math.floor(t.mp/2));return {...out,absorbed:absorption,mpCost:absorption*2,healthDamage:out.afterShields-absorption};}return out;},
 applyDamage(t,amount,ch,source,fx){if(!this.alive(t)||amount<=0)return;
  const tags=API.battle.skillAttributes.attributeTags(this._packetSkill||source?.soul),ice=tags.includes('冰');
  if(has(t,'frost-moss-immunity')){const key=t.id+':cold',old=t.shieldLayers?.find(s=>s.source===key)?.amount||0;this.addShieldLayer(t,{source:key,label:'封寒',amount:Math.min(t.model.derived.HP*.5,old+t.model.derived.HP*.05*(ice?2:1)),channel:'生命',until:battleEnd});if(ice){this.heal(t,amount,'生命');this.addLog(t.name+'霜苔不侵：冰伤转为生命。',{type:'trait',target:t.id});return;}}
  if(has(t,'ice-shell-preservation')&&!state(t).shellFirst){shell(this,t);state(t).shellFirst=true;}
  const hp=t.hp,sh=t.sh,mp=t.mp,layers=copy(t.shieldLayers||[]);
  const basicRune=source?.npcId==='sailiya_fengzhi'&&source.v12NPC?.rune?.active&&!this._packetSkill&&!this._periodic&&!this._v12NoRune,priorDouble=this._v12DoubleDefense;if(basicRune)this._v12DoubleDefense=true;
  try{base.applyDamage.call(this,t,amount,ch,source,fx);}finally{this._v12DoubleDefense=priorDouble;}absorbManaSpent(this,t,Math.max(0,mp-t.mp));
  const hpLoss=Math.max(0,hp-t.hp),shLoss=Math.max(0,sh-t.sh);
  const blocked=Math.max(0,layers.reduce((n,l)=>n+l.amount,0)-(t.shieldLayers||[]).reduce((n,l)=>n+l.amount,0));if(state(t).reserve?.until>this.now&&blocked>0){state(t).storedEnergy=Math.min(state(t).reserve.cap,(state(t).storedEnergy||0)+blocked*state(t).reserve.rate);state(t).storedUntil=state(t).reserve.until;}
  if(has(t,'moss-armor-accumulation')&&(hpLoss+shLoss)>0&&!this._periodic)state(t).mossStacks=Math.min(12,state(t).mossStacks+1);
  if(has(t,'oppressive-tides')&&source&&!this._periodic){const old=state(source).tides[t.id];state(source).tides[t.id]={stacks:Math.min(3,(old&&old.until>this.now?old.stacks:0)+1),until:this.now+6000};state(source).costPressure=true;}
  if(t.npcId==='sailiya_fengzhi'){const out=API.npc.TRAITS.sailiya_fengzhi.recordDamage(t.v12NPC,{realHP:hpLoss,realSH:shLoss,lethal:!this.alive(t)});t.v12NPC=out.state;}
  if(source?.npcId==='chengliang'&&this.alive(source)&&hpLoss>0){const out=API.npc.TRAITS.chengliang.handle(source.v12NPC,{type:'damage-dealt',actualHP:hpLoss,target:{lifeType:t.lifeType||'生活'}});source.v12NPC=out.state;traitEffects(this,source,out.effects);}
  if(basicRune&&this.alive(t)){this._v12NoRune=true;try{this.applyDamage(t,Math.round(amount*.3),'能量',source,'rune');}finally{this._v12NoRune=false;}}
  if(has(t,'ice-shell-preservation')&&source&&!this._v12Reflection){for(const layer of layers.filter(l=>l.label==='冰壳护生')){const after=t.shieldLayers?.find(l=>l.source===layer.source);const absorbed=Math.max(0,layer.amount-(after?.amount||0));state(t).shellAbsorbed[layer.source]=(state(t).shellAbsorbed[layer.source]||0)+absorbed;if(!after&&absorbed>0){const reflected=Math.round(state(t).shellAbsorbed[layer.source]*.3);this._v12Reflection=true;this._v12BypassShield=true;try{this.applyDamage(source,reflected,'能量',t,'ice');}finally{this._v12Reflection=false;this._v12BypassShield=false;}}}}
 },
 aiChoice(u){if(!this.v12Battle&&!u.npcId&&!u.beastId)return base.aiChoice.call(this,u);const ts=enemies(this,u).sort((a,b)=>a.hp/a.model.derived.HP-b.hp/b.model.derived.HP),t=ts[0];if(!t)return null;if(u.bonusAttack)return {action:u.mp>=this.basicCost(u)?'attack':'skipBonus',target:t.id};const skills=u.skills.filter(s=>!this.actionReason(u,s.id));let best={action:!this.actionReason(u,'attack')?'attack':'wait',target:t.id,score:2};for(const s of skills){const self=['强化','防御','治疗'].includes(s.category),target=s.target==='另一名队友'?this.targetOptions(u,s.id)[0]:(self?u:t);if(!target)continue;let score=['攻击','持续伤害'].includes(s.category)?8:s.category==='控制'?(t.cast?11:5):s.category==='减益'?4:s.category==='防御'?(u.shieldHP<u.model.derived.HP*.15?6:-1):s.category==='治疗'?(u.hp<u.model.derived.HP*.7?10:-1):u.statuses.some(st=>st.source===u.id+':'+s.id||st.source===u.id+'-'+s.id||st.label===s.name)?-1:7;if((s.damageMode==='periodic'||s.category==='持续伤害')&&t.dots.some(d=>d.key===u.id+'-'+s.id))score=-1;if(score>best.score)best={action:s.id,target:target.id,score};}return best;},
 checkResult(){if(!this.v12Battle)return base.checkResult.call(this);for(const u of this.units){if(!u.fallen&&!this.alive(u)){u.fallen=true;u.cast=null;u.v12Channel=null;if(u.npcId==='chengliang')u.v12NPC=API.npc.TRAITS.chengliang.handle(u.v12NPC,{type:'defeat'}).state;if(u.npcId==='xutaiping')u.v12NPC=API.npc.TRAITS.xutaiping.onOwnerDefeat(u.v12NPC);this.addLog(u.name+'退场。',{type:'fall',target:u.id});}}const friend=this.units.some(u=>u.team===0&&this.alive(u)),enemy=this.units.some(u=>u.team===1&&this.alive(u));if(!enemy||!friend){this.result={winner:!friend&&!enemy?null:friend&&!enemy?0:1,reason:!friend&&!enemy?'双方同时退场':friend&&!enemy?'魂兽实际退场':'讨伐队伍全灭',time:this.now,huntOutcome:!friend&&!enemy?'draw':friend&&!enemy?'victory':'loss'};this.addLog(this.result.reason,{type:'huntResult'});return;}const capable=this.units.some(u=>this.alive(u)&&((u.cast&&u.cast.action!=='wait')||u.v12Channel||this.v12CanPerform(u)));if(capable)this.v12StalledSince=null;else this.v12StalledSince??=this.now;if(this.v12StalledSince!==null&&this.now-this.v12StalledSince>=10000){this.result={winner:null,reason:'连续10秒无人能行动，讨伐中止',time:this.now,huntOutcome:'draw'};this.addLog(this.result.reason,{type:'huntResult'});}},
 resolveDraw(reason){if(!this.v12Battle)return base.resolveDraw.call(this,reason);this.result={winner:null,reason:'讨伐平局：'+reason,time:this.now,huntOutcome:'draw'};},
 finishByTime(){if(!this.v12Battle)return base.finishByTime.call(this);this.checkResult();}
 };
}
return {wrap,initializeBattle,runtime,initTraits,restoreMP,has,state};
})(globalThis);
