// v12.05: four real hunt beasts and their inherited bone passives, same timeline and damage API.
const V125Beasts=(function(root){
'use strict';
const A=root.WitnessV12,R=root.WitnessRules,END=Number.MAX_SAFE_INTEGER,SECONDS=9007199254;
const find=(u,id)=>(u?.v12Traits||[]).find(t=>(t.traitId||t.id)===id),has=(u,id)=>!!find(u,id),p=(u,id)=>find(u,id)?.params||{};
const st=u=>u.v125||(u.v125={version:1,initialized:false,turn:0,mountainStacks:0,sacBroken:false,legendaryRemaining:3,candle:0,attributes:{},miasma:{},chi:{},tokens:{}});
const alive=(b,u)=>u&&b.alive(u),skill=b=>b._packetSkill||b._v125Skill||b._ttSkill||b._damageSpec;
const tags=s=>A.battle.skillAttributes.attributeTags(s).filter(t=>t!=='无');
const opponents=(b,u)=>b.units.filter(t=>t.team!==u.team&&alive(b,t));
function context(b,u,s,fn){const old=[b._v125Caster,b._v125Skill];b._v125Caster=u;b._v125Skill=s;try{return fn();}finally{[b._v125Caster,b._v125Skill]=old;}}
function recordCandle(b,u,source,kind){if(!has(u,'reverse-scale-unburned'))return;const elements=tags(source);if(!elements.length)return;const s=st(u),token=(b._v12Group||b._effectKey||b._v125Event||('event:'+b.now))+':'+(source?.id||elements.join('/'))+':'+kind;
 if(s.tokens.candle===token&&kind==='debuff')return;s.tokens.candle=token;s.candle=Math.min(10,s.candle+1);for(const el of elements)s.attributes[el]=true;
 b.addLog(u.name+'获得烛炎 '+s.candle+'/10，记录属性抗性：'+elements.join('／')+'。',{type:'trait',target:u.id});}
function syncMiasma(b,t,owner,count){const s=st(t);s.miasma[owner.id]={count:Math.min(6,count)};const n=s.miasma[owner.id].count,key=owner.id+':miasma';for(const [type,value]of [['statDownA',n*.05],['statDownC',n*.05]])b.setStatus(t,type,value,SECONDS,{source:key+':'+type,label:'弥天瘴羽',from:owner.name,v125Internal:true,stacks:n,cleansable:true});}
function addMiasma(b,t,owner,n){if(!alive(b,t)||!alive(b,owner))return;syncMiasma(b,t,owner,(st(t).miasma[owner.id]?.count||0)+n);recordCandle(b,t,owner.soul,'debuff');}
function benefit(b,t,kind,value){if(!(value>0))return value;const s=st(t),group=b._effectKey||b._v12Group||('benefit:'+b.now);if(s.blockedBenefitGroup===group)return 0;
 if(s.chiLock&&t.actions<=s.chiLock.untilAction&&['buff','heal','shield','mp-restore'].includes(kind))return 0;
 if(['shield','heal','mp-restore'].includes(kind))for(const [id,data]of Object.entries(s.miasma)){if(data.count>=6){s.blockedBenefitGroup=group;const owner=b.unit(id);if(owner)syncMiasma(b,t,owner,0);else data.count=0;b.addLog(t.name+'满层瘴羽吞没了本次收益。',{type:'trait',target:t.id});return 0;}}
 if(kind==='mp-restore'){const n=Math.max(0,...Object.values(s.miasma).map(m=>m.count));return value*(1-Math.min(.6,n*.1));}return value;
}
function manaSpend(b,u,amount){if(!(amount>0))return;for(const owner of opponents(b,u).filter(o=>has(o,'sky-full-of-miasma')))addMiasma(b,u,owner,1);}
function bypass(b,t,amount,source,label){if(!alive(b,t)||!(amount>0))return;const n=Math.min(t.release==='召唤'?t.bodyHP:t.hp,Math.round(amount));if(t.release==='召唤'){t.bodyHP=Math.max(0,t.bodyHP-n);t.hp=t.bodyHP+t.petHP;}else t.hp=Math.max(0,t.hp-n);b.addLog(label+'越盾扣除'+t.name+'生命 '+n+'。',{type:'damage',actor:source?.id,target:t.id,amount:n,channel:'生命',bypassShield:true});}
function afterAttack(b,u,t,shieldBefore){if(!alive(b,u)||!alive(b,t)||b._periodic||b._v125Secondary)return;
 if(has(t,'chi-pattern-suppress')){const s=st(t),before=s.chi[u.id]||0,n=Math.min(6,before+1);s.chi[u.id]=n;recordCandle(b,u,t.soul,'debuff');for(const [type,v]of [['statDownA',.06*n],['costUp',.08*n]])if(type!=='costUp'||u.model.derived.MP>0)b.setStatus(u,type,v,SECONDS,{source:t.id+':chi:'+type,label:'螭纹压魂',from:t.name,v125Internal:true,stacks:n});
  if(before<6&&n===6){st(u).chiLock={untilAction:u.actions+1};b.setStatus(u,'slow',.2,SECONDS,{source:t.id+':chi-cast',label:'螭纹·迟滞',v125Internal:true});}}
 if(has(u,'metal-breath-carve')){const s=st(u),token=u.actions||0;if(s.tokens.metalTurn!==token){s.tokens.metalTurn=token;s.metalProcs=0;}if(s.metalProcs<2){s.metalProcs++;let rate=shieldBefore?.06:.03;if(['无生命','构装','亡灵','灵体','元素'].includes(t.lifeType))rate*=.5;bypass(b,t,t.model.derived.HP*rate,u,'金气削骨');const key=u.id+':carve',old=b.status(t,'statDownD').find(x=>x.source===key),n=Math.min(5,(old?.stacks||0)+1);b.setStatus(t,'statDownD',.04*n,SECONDS,{source:key,label:'削金',from:u.name,stacks:n,v125Internal:true});}}
}
function finishTurn(b,u,cast){if(cast?.bonus)return;const s=st(u),token=u.actions||0;if(s.tokens.end===token)return;s.tokens.end=token;s.turn++;
 if(has(u,'twin-sac-frame')&&alive(b,u)){s.sacHP=Math.min(s.sacMax,s.sacHP+Math.round(s.sacMax*.08));}
 if(has(u,'sky-full-of-miasma')&&alive(b,u))for(const t of opponents(b,u))addMiasma(b,t,u,1);
 if(has(u,'ley-line-pierce')&&(cast.action==='attack'||['攻击','持续伤害'].includes(cast.skill?.category)))b.setStatus(u,'v125GaugeDown',Math.min(.3,(b.value(u,'v125GaugeDown')||0)+.15),SECONDS,{source:u.id+':root',label:'山根透地·滞重',v125Internal:true});
 if(has(u,'blaze-armor-break')&&(cast.action==='attack'||['攻击','持续伤害'].includes(cast.skill?.category))){const spent=Math.ceil(u.mp*.15);u.mp-=spent;manaSpend(b,u,spent);b.setStatus(u,'v125Vulnerable',.1,SECONDS,{source:u.id+':blaze-price',label:'焚龙破甲·承伤',v125Internal:true});}
 for(const target of b.units)if(has(target,'reverse-scale-unburned')&&alive(b,target)&&b.value(target,'control')&&st(target).controllerId===u.id&&alive(b,u)){
  const ts=st(target);if(ts.reflectTurn===token)continue;ts.reflectTurn=token;const prev=b._v125Secondary,oldPacket=b._packetSkill;b._v125Secondary=true;b._packetSkill={name:'赤烛不焚',elements:['火'],category:'特性'};
  try{b.applyDamage(u,Math.round(u.model.derived.HP*.04),'能量',target,'fire');b.addLog(target.name+'受控反击：控制者回合结算，赤烛灼伤。',{type:'trait',actor:target.id,target:u.id});}finally{b._v125Secondary=prev;b._packetSkill=oldPacket;}}
 if(s.chiLock&&token>=s.chiLock.untilAction)delete s.chiLock;
}
function wrap(original){const base={...original};return {
 initializeActorState(){base.initializeActorState.call(this);for(const u of this.units){u.v12Traits=(u.v12Traits||[]).map(A.soulbone.effects.upgrade);const s=st(u);if(s.initialized)continue;s.initialized=true;if(has(u,'bearing-mountain'))s.mountainHP=s.mountainMax=Math.round(u.model.derived.HP*.8);if(has(u,'twin-sac-frame'))s.sacHP=s.sacMax=Math.round(u.model.derived.HP*.5);}},
 alive(u){if(!u)return false;if(has(u,'twin-sac-frame'))return u.sh>0&&(u.hp>0||(u.v125?.sacHP||0)>0);return base.alive.call(this,u);},
 effective(u){const out=base.effective.call(this,u),s=st(u);if(has(u,'bearing-mountain')&&s.mountainStacks){const before=R.derive(out),next=R.derive({...out,D:out.D*(1+.06*s.mountainStacks)});out.D*=1+.06*s.mountainStacks;out.DEF*=next.DEF/before.DEF;out.MDEF*=next.MDEF/before.MDEF;}return out;},
 actionRate(u){return base.actionRate.call(this,u)*(1-this.value(u,'v125GaugeDown'));},
 plan(u,cast,pre){const out=context(this,u,cast.skill,()=>base.plan.call(this,u,cast,pre));out.effects=(out.effects||[]).map(fn=>()=>context(this,u,cast.skill,fn));return out;},
 damageValue(u,t,raw,ch,pre){const s=skill(this);if(s&&['攻击','持续伤害'].includes(s.category)&&has(u,'reverse-scale-unburned'))raw*=1+.1*st(u).candle;
  let pierce=1;if(has(u,'ley-line-pierce'))pierce*=.6;if(has(u,'metal-breath-carve'))pierce*=.7;const flame=has(u,'blaze-armor-break');if(flame)pierce*=.65;if(pierce!==1)pre={...pre,[t.id]:{...pre[t.id],DEF:pre[t.id].DEF*pierce}};
  if(!flame)return base.damageValue.call(this,u,t,raw,ch,pre);const old=t.statuses;t.statuses=old.filter(x=>!['preDR','defendHP','defendSH','iceArmor'].includes(x.type));try{return base.damageValue.call(this,u,t,raw,ch,pre);}finally{t.statuses=old;}
 },
 previewShieldDamage(t,amount,ch,u){if(has(u,'ley-line-pierce')&&!t.airborne&&!t.incorporeal&&t.lifeType!=='灵体'){const out=base.previewShieldDamage.call(this,t,0,ch,u),reduced=Math.round(amount*(1-this.value(u,'damageDown')));return {...out,beforeShields:reduced,afterShields:reduced};}return base.previewShieldDamage.call(this,t,amount,ch,u);},
 previewProtection(t,amount,ch,u){const out=base.previewProtection.call(this,t,amount,ch,u);if(has(t,'twin-sac-frame')&&ch!=='精神'&&!out.bypassShield){const absorbed=Math.min(st(t).sacHP||0,out.healthDamage);return {...out,toxinAbsorbed:absorbed,healthDamage:out.healthDamage-absorbed};}return out;},
 tryControl(u,t,s,duration){if(!alive(this,t))return;const data=st(t);if(has(t,'chi-pattern-suppress')&&data.legendaryRemaining>0&&!(t.immuneUntil>this.now||this.value(t,'controlWard'))){data.legendaryRemaining--;this.addLog(t.name+'传奇抗性：控制固定失败，不投豁免；剩余'+data.legendaryRemaining+'次。',{type:'resist',actor:u.id,target:t.id,legendary:true});return;}
  const before=this.status(t,'control')[0]?.until||0;context(this,u,s,()=>base.tryControl.call(this,u,t,s,duration));const control=this.status(t,'control')[0];if(control&&control.until>before&&has(t,'reverse-scale-unburned')){data.controllerId=u.id;data.reflectTurn=null;t.immuneUntil=Math.max(t.immuneUntil,control.until+8000);}
 },
 setStatus(t,type,value,duration,extra={}){const caster=this._v125Caster,s=this._v125Skill;if(caster&&caster.team!==t.team&&!extra.v125Internal&&(s?.category==='减益'||s?.category==='控制'||extra.cleansable||/^(statDown)/.test(type)||['slow','accuracyDown','damageDown','costUp','control','defDown','mindDown','agilityDown'].includes(type)))recordCandle(this,t,s||caster.soul,'debuff');return base.setStatus.call(this,t,type,value,duration,extra);},
 applyDotDamage(t,d){const u=this.unit(d.source),s=d.skill||u?.skills.find(s=>d.key===u.id+'-'+s.id);return context(this,u,s,()=>base.applyDotDamage.call(this,t,d));},
 applyDamage(t,amount,ch,u,fx){if(!alive(this,t)||!(amount>0))return;const data=st(t),elements=tags(skill(this)||u?.soul),shieldBefore=(t.shieldHP||0)>0,oldHP=t.hp,oldSH=t.sh,oldMP=t.mp;
  if(has(t,'reverse-scale-unburned')&&elements.some(el=>data.attributes[el]))amount*=.5;
  const m=Math.max(0,...Object.values(data.miasma).map(x=>x.count));amount*=1+.08*m;
  if(data.sacBroken)amount*=1.25;amount*=1+this.value(t,'v125Vulnerable');if(has(t,'bearing-mountain'))amount*=1-.02*data.mountainStacks;
  let breakMountain=false;if(has(t,'bearing-mountain')&&data.mountainHP>0&&!u?.scarred&&!this._v12BypassShield&&!skill(this)?.trueDamage){const absorbed=Math.min(data.mountainHP,amount*.4);data.mountainHP-=absorbed;amount-=absorbed;if(absorbed>0)data.mountainStacks=Math.min(10,data.mountainStacks+1);breakMountain=data.mountainHP<=0;}
  const preview=has(t,'twin-sac-frame')?this.previewProtection(t,Math.round(amount),ch,u):null;
  if(breakMountain&&alive(this,t))this.heal(t,Math.round(t.model.derived.HP*.2),'生命');
  base.applyDamage.call(this,t,Math.round(amount),ch,u,fx);if(preview?.toxinAbsorbed){data.sacHP=Math.max(0,data.sacHP-preview.toxinAbsorbed);if(data.sacHP===0&&!data.sacBroken){data.sacBroken=true;for(const enemy of opponents(this,t))addMiasma(this,enemy,t,2);this.addLog(t.name+'毒囊破裂，瘴羽喷向全体敌人。',{type:'trait',actor:t.id});}}
  manaSpend(this,t,Math.max(0,oldMP-t.mp));
  if(u&&u.team!==t.team){recordCandle(this,t,skill(this)||u.soul,'damage');if(t.hp<oldHP||t.sh<oldSH||preview?.toxinAbsorbed||shieldBefore)afterAttack(this,u,t,shieldBefore);}
 },
 command(id,action,target){const u=this.unit(id),old=u?.mp||0,actions=u?.actions||0,bonus=u?.bonusAttack,error=base.command.call(this,id,action,target);if(!error&&u){manaSpend(this,u,Math.max(0,old-u.mp));if(!u.cast&&!bonus&&u.actions>actions)finishTurn(this,u,{action});}return error;},
 onActionComplete(u,cast){base.onActionComplete.call(this,u,cast);finishTurn(this,u,cast);if(cast.skill?.cleanse||cast.skill?.purgeDebuffs){const t=this.unit(cast.target)||u;this.v125CleanseMiasma(t,2);}},
 v125CleanseMiasma(t,count=2){for(const [id,data]of Object.entries(st(t).miasma)){const owner=this.unit(id);if(owner)syncMiasma(this,t,owner,Math.max(0,data.count-count));}return t;}
};}
function badges(b,u){const s=u.v125||{},rows=[],add=(name,tip,bad=false)=>rows.push({key:'v125:'+name,name,tip,bad});
 if(has(u,'bearing-mountain'))add('负岳·山重 '+(s.mountainStacks||0)+'/10','山影 '+Math.round(s.mountainHP||0)+' / '+(s.mountainMax||0)+'；防御＋'+(s.mountainStacks||0)*6+'%，减伤'+(s.mountainStacks||0)*2+'%。');
 if(has(u,'twin-sac-frame'))add('毒囊 '+Math.round(s.sacHP||0),'毒囊上限'+s.sacMax+'；'+(s.sacBroken?'破囊承伤＋25%。':'先于生命承伤，精神伤害不入毒囊。'),!!s.sacBroken);
 if(has(u,'chi-pattern-suppress'))add('传奇抗性 '+s.legendaryRemaining+'/3','免检抵消控制效果，当前剩余'+s.legendaryRemaining+'次。');
 if(has(u,'reverse-scale-unburned')){add('烛炎 '+(s.candle||0)+'/10','魂技伤害提高'+(s.candle||0)*10+'%。');const attrs=Object.keys(s.attributes||{});if(attrs.length)add('赤烛·属性抗性','以下属性后续伤害固定减半：'+attrs.join('／')+'。');}
 for(const [id,m]of Object.entries(s.miasma||{}))if(m.count)add('瘴羽 '+m.count+'/6','来源 '+(b.unit(id)?.name||id)+'；敏捷与魂力操纵各降低'+m.count*5+'%，回魂降低'+m.count*10+'%，伤害承受提高'+m.count*8+'%。',true);
 if(s.chiLock)add('螭纹·收益封锁','下一次行动不能获得增益、护盾、治疗与回魂。',true);
 return rows;}
root.WitnessV125Beasts={badges};return {wrap,benefit};
})(globalThis);
