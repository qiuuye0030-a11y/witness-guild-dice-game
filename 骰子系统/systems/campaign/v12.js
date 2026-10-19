const CampaignV12=(function(root){
'use strict';
const A=typeof module!=='undefined'&&module.exports?require('./v13-runtime.cjs').WitnessV12:root.WitnessV12;
const RT=()=>typeof module!=='undefined'&&module.exports?require('./v13-runtime.cjs'):root;
const R=CampaignCore.R,copy=x=>JSON.parse(JSON.stringify(x));
const BUDGET={version:1,note:'v12初版可调装备预算；不改变成长与等级。',values:{1000:{B:3,S:3,C:3,D:3,A:3,P:3},10000:{B:15,S:15,C:15,D:15,A:15,P:15},100000:{B:45,S:45,C:45,D:45,A:45,P:45}}};
function ensure(){const s=this.state,c=s.character;if(!c)return null;s.v12||={version:1,hunt:A.hunt.ledger.createLedger(),equipment:A.soulbone.absorption.createEquipmentLedger(),drop:{},rewards:{},reports:[],npcProgress:{},attributeBudget:copy(BUDGET)};const v=s.v12;v.attributeBudget||=copy(BUDGET);if(v.attemptsUsed===undefined)v.attemptsUsed=Math.max(v.reports?.length||0,['battle','won','lost'].includes(v.hunt.status)?1:0);v.attemptLimit=3;if(!v.beastProgress){v.beastProgress={};const old=v.battleSnapshot?.units?.find(u=>u.beastId);if(old)v.beastProgress[old.beastId]={mossStacks:old.v12State?.mossStacks||0};}c.v12Equipment=v.equipment;c.boneInventory||=[];return v;}
function decorate(bone){if(!bone.base)return bone;return {...bone,id:bone.boneId,slot:bone.base.slot,years:bone.base.years,name:bone.base.name,skills:[]};}
function reportArchive(){const api=RT().WitnessV12Reports;return api&&typeof api.archiveReport==='function'?api:null;}
function archiveReport(report){const api=reportArchive();if(!api)return null;try{return api.archiveReport(report);}catch(error){return {ok:false,persisted:'none',error};}}
function reportBrief(report){if(!report)return null;const api=reportArchive();const summary=report.snapshot&&api&&api.summarize?api.summarize(report):report;return {id:summary.id||report.id,targetId:summary.targetId||report.targetId||null,targetName:summary.targetName||null,reason:summary.reason||report.reason||null,seconds:summary.seconds===undefined?null:summary.seconds,winner:summary.winner===undefined?null:summary.winner,logCount:summary.logCount===undefined?0:summary.logCount,units:copy(summary.units||[]).map(u=>({id:u.id,name:u.name,team:u.team,beastId:u.beastId||null})),date:summary.date||null};}
function absorb(item){const v=ensure.call(this),c=this.state.character;c.inventory=c.boneInventory;const out=A.soulbone.absorption.absorbBone({character:c,bone:decorate(item),ledger:v.equipment});c.boneInventory=c.inventory.map(decorate);delete c.inventory;c.bones=c.bones.map(decorate);if(out.status==='slot-conflict'){v.replacements||=[];if(!v.replacements.some(x=>x.incomingBoneId===out.session.incomingBoneId))v.replacements.push(out.session);}return out;}
function characterForRewards(c,soul){return {...copy(c),soul:copy(soul),inventory:copy(c.boneInventory||[])};}
function applyCharacter(s,c,ledger){c.boneInventory=(c.inventory||[]).map(decorate);delete c.inventory;delete c.soul;c.bones=c.bones.map(decorate);c.v12Equipment=ledger;s.character=c;s.v12.equipment=ledger;}
// Upgrade only actual unassembled ordinary drops. Event gifts/ten-thousand ancestors and already rolled traits remain unchanged.
function upgradeOrdinaryTraits(){const v=ensure.call(this),c=this.state.character,upgrade=A.soulbone.effects.upgrade;
 for(const key of ['bones','boneInventory'])for(const bone of c[key]||[])bone.traits=(bone.traits||[]).map(upgrade);
 for(const [key,t]of Object.entries(v.equipment.runtimeTraits))v.equipment.runtimeTraits[key]=upgrade(t);
 for(const bone of Object.values(v.drop.boneAssemblies||{}))bone.traits=(bone.traits||[]).map(upgrade);
 if(v.reward?.bone)v.reward.bone.traits=(v.reward.bone.traits||[]).map(upgrade);
}
function backfillOrdinaryBones(){const s=this.state,c=s.character,v=ensure.call(this);if(s.phase==='battle'||s.challenge?.active||s.phase==='v12Hunt'&&v.hunt.status==='battle')return;
 for(const key of ['bones','boneInventory'])for(let i=0;i<c[key].length;i++){
  const old=c[key][i];if(old.source?.type!=='ten-thousand-drop'||old.traits?.length||!(old.base?.years>=10000&&old.base.years<100000))continue;
  const acquisitionId=old.source.acquisitionId;if(!acquisitionId)continue;v.drop.boneAssemblies||={};v.drop.boneAssemblies[acquisitionId]||=copy(old);
  const excludes=[...Object.values(v.equipment.runtimeTraits),...c.boneInventory.flatMap(b=>b.traits||[])].map(t=>t.traitId);
  const out=A.soulbone.tenThousand.completePendingTenThousandBone(v.drop,{acquisitionId,pool:A.soulbone.traitPool,rng:A.rng.createRng(s.seed+'|v1204-backfill|'+old.boneId),budget:v.attributeBudget,excludeDefinitionIds:excludes});
  const bone=decorate(out.bone);if(old.absorbed){bone.absorbed=true;if(!bone.pendingReasons.length)bone.status='absorbed';A.soulbone.absorption.applySource(bone,v.equipment);}c[key][i]=bone;
 }
}
function refresh(){CampaignModern.methods.refresh.call(this);const s=this.state,c=s.character;if(!c)return;const v=ensure.call(this);upgradeOrdinaryTraits.call(this);backfillOrdinaryBones.call(this);if(!v.legacyBonesMigrated){v.legacyBonesMigrated=true;const pending=c.boneInventory.filter(b=>!b.boneId);c.boneInventory=c.boneInventory.filter(b=>b.boneId);for(const old of pending){const bone=A.soulbone.instance.createBoneInstance({boneId:old.id||'legacy:'+old.slot,definitionId:'legacy-gift',source:{type:'legacy'},base:{years:old.years,slot:old.slot,name:old.name,affinity:old.affinity},attributes:null,traits:[]});absorb.call(this,bone);}}const tags=A.battle.skillAttributes.tagCharacterSkills(c,this.soul());c.rings=tags.rings;
 if(c.preStoredNinthRing&&c.level>=90&&c.rings.length===8){const actor=characterForRewards(c,this.soul());const out=A.reward.transaction&&A.reward;const ring=A.reward.ring.handleNinthRing({character:actor,ring:c.preStoredNinthRing,level:c.level,makeSkill:R.makeSkill});if(ring.absorbed){c.rings=actor.rings;delete c.preStoredNinthRing;}}
 c.stats.rings=Math.max(c.stats.rings,c.rings.length);s.gameVersion='v12.05.03';
}
function check(){const s=this.state,c=s.character;if(!c||!['growth','eventResult','arrival','ending'].includes(s.phase))return false;const v=ensure.call(this);if(!['idle','pending'].includes(v.hunt.status))return false;
 const result=A.hunt.controller.consider({level:c.level,model:c.stats,ledger:v.hunt,flow:{phase:s.phase},safeNode:s.phase==='eventResult'?'growth-settled':'battle-settled',key:'v12:'+s.completed+':'+c.level});v.hunt=result.ledger;if(result.presentation){v.returnPhase=s.phase;s.phase='v12Hunt';return true;}return false;}
function choose(option){const v=ensure.call(this),rng=v.rng?A.rng.RollLog.restore(v.rng):A.rng.createRng(this.state.seed+'|hundred-thousand');const out=A.hunt.controller.choose({ledger:v.hunt,option,character:this.state.character,rng,at:copy(this.state.date)});v.hunt=out.ledger;v.rng=rng.snapshot();if(!out.accepted){v.message=out.texts.paragraphs.join('\n');this.state.phase=v.returnPhase;this.sync();}return out;}
function selectTarget(id){const v=ensure.call(this);if(this.state.phase!=='v12Hunt'||!['invitation','arrival','awaiting-library'].includes(v.hunt.status)||v.hunt.target||v.attemptsUsed>0||v.reward)throw Error('讨伐目标已锁定，不能更换');const def=A.beast.library.definition(id);if(!def.available)throw Error('该魂兽暂未开放');v.selectedTarget=def.id;this.sync();return def.id;}
function startBattle(){const v=ensure.call(this),s=this.state,c=s.character,rng=A.rng.RollLog.restore(v.rng);if(v.attemptsUsed>=3||v.reward)throw Error('本次讨伐挑战已结束');let ledger=v.hunt;
 if((v.selectedTarget||v.testTarget)&&!ledger.target){const def=A.beast.library.definition(v.selectedTarget||v.testTarget);ledger={...ledger,target:{id:def.id,version:def.version,snapshot:def}};}
 const player=RT().WitnessBattle.playerUnit(c,this.soul());player.v12Traits=Object.values(v.equipment.runtimeTraits).map(t=>({...t,id:t.traitId}));
 const allies=ledger.allies.npcIds.map(id=>{const def=A.roster.combatSpec(id);const unit=A.npc.buildUnit({definition:def,id:'ally:'+id,team:0,permanentProgress:v.npcProgress[id]});unit.displayRating=def.rating;unit.skills=unit.skills.map(x=>({...x,selfOnly:['自己'].includes(x.target),cost:x.cost,fx:RT().WitnessBattle.fxFor(unit.soul)}));return unit;});
 const out=A.hunt.controller.forward({ledger,playerUnit:player,allyUnits:allies,rng,seed:s.seed+'|hunt-battle'});v.rng=rng.snapshot();v.hunt=out.ledger;if(out.pending)return out;
 const beast=out.ledger.target.snapshot,enemy=out.battlePlan.teams.enemy[0];enemy.beastId=beast.id;enemy.v12InitialMossStacks=v.beastProgress[beast.id]?.mossStacks||0;enemy.v12Traits=copy(beast.traits);enemy.model=copy(beast.panel);enemy.huntHealth={version:1,baseHP:enemy.model.derived.HP,multiplier:allies.length?2:1.5};enemy.model.derived.HP=Math.round(enemy.huntHealth.baseHP*enemy.huntHealth.multiplier);enemy.source='十万年魂兽';enemy.release='本体';enemy.soul={id:'npc-beast-'+beast.id,name:beast.name,tier:1,main_kind:'兽',subkind:'魂兽',elements:copy(beast.elements),attribute:beast.elements.join('／'),spirit_specialist:false};enemy.skills=beast.skills.map(x=>({...copy(x),selfOnly:['自己'].includes(x.target),v12Operations:copy(x.operations),fx:RT().WitnessBattle.fxFor(enemy.soul)}));
 v.attemptsUsed++;const session=s.characterId+':hunt'+(v.attemptsUsed===1?'':':'+v.attemptsUsed);out.battlePlan.sessionId=session;out.battlePlan.seed+='|attempt:'+v.attemptsUsed;v.hunt=A.hunt.controller.startBattle(v.hunt,session);v.plan=copy(out.battlePlan);v.options={huntPlan:copy(out.battlePlan),seed:out.battlePlan.seed};v.battleSnapshot=null;v.result=null;this.sync();return v.options;
}
function retry(){const v=ensure.call(this);if(v.hunt.status!=='lost'||v.attemptsUsed>=3||v.reward)throw Error('没有剩余讨伐挑战机会');v.hunt=A.hunt.ledger.transition(v.hunt,'forwarded',{result:null,battleSessionId:null},'retry-same-target');this.state.phase='v12Hunt';return startBattle.call(this);}
function reopen(){const v=ensure.call(this);if(v.hunt.status!=='lost'||v.attemptsUsed>=3||v.reward)throw Error('没有待继续的讨伐');if(this.state.phase!=='v12Hunt'){v.returnPhase=this.state.phase;this.state.phase='v12Hunt';}this.sync();}
function observe(b){const s=this.state,v=ensure.call(this);if(!b.v12Battle||v.hunt.status!=='battle'||b.v12Session!==v.hunt.battleSessionId)return false;
 if(!b.result){v.battleSnapshot=b.snapshot();this.sync();return false;}
 const enemy=b.units.find(u=>u.beastId),survivors=b.units.filter(u=>u.team===0&&b.alive(u)).map(u=>u.id),outcome=b.result.huntOutcome||(b.result.reason==='认输'?'surrender':b.result.winner===0&&!b.alive(enemy)?'victory':'loss');
 const resolved=A.hunt.controller.resolve({ledger:v.hunt,outcome,enemy:{defeated:!b.alive(enemy)},survivors,plan:v.plan,traits:b.units.map(u=>({id:u.id,traits:u.v12Traits||u.traits||[]})),triggers:b.log.filter(x=>x.type==='trait')});v.hunt=resolved.ledger;v.result=copy(b.result);
 for(const u of b.units.filter(u=>u.beastId))v.beastProgress[u.beastId]={mossStacks:u.v12State?.mossStacks||0};
 for(const u of b.units.filter(u=>u.npcId))v.npcProgress[u.npcId]=copy(u.permanentProgress||{});
 RT().WitnessV12Live.persist(s.character,b);
 const report={...resolved.report,id:v.hunt.battleSessionId,snapshot:b.snapshot(),initial:copy(v.options),date:copy(s.date)};
 const archived=archiveReport(report);
 if(archived&&archived.ok&&archived.summary){v.reports.push(archived.summary);v.archiveWarning=archived.persisted==='archive'?null:'战报已暂存在本次会话，请先导出这份战报。';}
 else{v.reports.push(report);v.archiveWarning='战报未能写入本机归档，已并入主存档；请导出战报以保留完整日志。';}
 v.reports=v.reports.slice(-20);v.battleSnapshot=null;
 if(resolved.firstWin)this.v12Claim();
 this.refresh();this.sync();return true;
}
function recoverReport(id){const v=ensure.call(this),api=reportArchive(),full=api&&api.peek?api.peek(id):null;if(!full)return false;const index=v.reports.findIndex(r=>r.id===id);if(index<0)return false;v.reports[index]={...copy(full),archive:'embedded',archiveError:true};v.archiveWarning='战报归档写入失败，已暂存于主存档；请先导出这份战报。';this.sync();return true;}
function claim(){const s=this.state,v=ensure.call(this);if(v.reward)return false;
 const report=v.reports.find(r=>r.id===v.hunt.battleSessionId);
 const winner=v.result?.winner??report?.winner??report?.snapshot?.result?.winner;
 if(v.hunt.status!=='won'||!v.hunt.result?.loot||!report||winner!==0)throw Error('缺少真实讨伐首胜凭证');
 const rng=A.rng.createRng(s.seed+'|hunt-reward');const reward=A.reward.createRunner(v.rewards).run({transactionId:'reward:'+v.hunt.battleSessionId,sessionId:v.hunt.battleSessionId,firstWin:true,beastSnapshot:v.hunt.target.snapshot,character:characterForRewards(s.character,this.soul()),equipmentLedger:v.equipment,level:s.character.level,seed:s.seed+'|hunt-reward',rng,makeSkill:R.makeSkill,pickCategory:R.pickCategory,budget:v.attributeBudget,battleReport:reportBrief(report),at:copy(s.date)});
 if(reward.failedStep)throw Error('讨伐奖励暂未完成：'+reward.failedStep+' '+reward.error.message);
 applyCharacter(s,reward.character,reward.equipmentLedger);v.reward=copy(reward.result);if(reward.result.absorption.session){v.replacements||=[];if(!v.replacements.some(x=>x.incomingBoneId===reward.result.absorption.session.incomingBoneId))v.replacements.push(reward.result.absorption.session);}v.hunt.rewardTransactionId=reward.transaction.transactionId;
 this.refresh();this.sync();return true;
}
function resume(){const v=ensure.call(this);if(v.hunt.status==='battle')throw Error('请先完成讨伐战');if(v.hunt.status==='won'&&!v.reward)this.v12Claim();this.state.phase=v.returnPhase||'growth';v.plan=null;v.options=null;v.battleSnapshot=null;v.message=null;this.sync();}
function replacement(id,choice){const v=ensure.call(this),session=v.replacements?.find(x=>x.incomingBoneId===id);if(!session)throw Error('换骨会话已结束');const c=this.state.character;c.inventory=c.boneInventory;const result=A.soulbone.absorption.confirmReplacement({session,choice,character:c,ledger:v.equipment});c.boneInventory=c.inventory.map(decorate);delete c.inventory;c.bones=c.bones.map(decorate);v.replacements=v.replacements.filter(x=>x!==session);this.refresh();this.sync();return result;}
function availableBoneSlots(){const c=this.state.character,owned=new Set([...(c.bones||[]),...(c.boneInventory||[])].map(b=>b.base?.slot||b.slot));const free=A.soulbone.instance.SLOTS.filter(slot=>!owned.has(slot));return free.length?free:A.soulbone.instance.SLOTS.slice();}
function settleKilledCandidate(){const s=this.state,h=s.hunt;if(!h?.result||h.absorbed)return null;const v=ensure.call(this),c=s.character;if(h.dropChecked)return h.boneDrop||null;
 const rng=A.rng.createRng(s.seed+'|bone-drop|'+h.index+'|'+(h.attempt||1));const drop=A.soulbone.drop.settleConfirmedHunt({store:v.drop,ring:h.result,seed:s.seed,characterName:s.characterId,luck:c.luck,attempt:h.attempt||1,rng,at:copy(s.date)});
 h.dropChecked=true;h.boneDrop=copy(drop);
 if(drop.eligible&&!drop.duplicate)s.journal.push({type:'bone',title:'猎杀所得·掉骨判定',text:'气运'+c.luck+'：1d10000＝'+drop.face+'，阈值'+drop.threshold+'。'+(drop.dropped?'发现魂骨。':'未发现魂骨。'),date:copy(s.date)});
 if(drop.dropped){const record=A.soulbone.tenThousand.settleTenThousandBone(v.drop,{boneId:'bone:'+drop.acquisitionId,acquisitionId:drop.acquisitionId,years:h.result.years,affinity:this.soul().attribute,pool:A.soulbone.traitPool,rng,budget:v.attributeBudget,availableSlots:availableBoneSlots.call(this),excludeDefinitionIds:[...Object.values(v.equipment.runtimeTraits),...c.boneInventory.flatMap(b=>b.traits||[])].map(t=>t.traitId),drop});
  const bone=decorate(record.bone);if(!c.bones.some(b=>b.boneId===bone.boneId)&&!c.boneInventory.some(b=>b.boneId===bone.boneId))c.boneInventory.push({...bone,awaitingRingAbsorption:true,status:'in-inventory'});
  v.pendingHuntBones||=[];if(!v.pendingHuntBones.includes(bone.boneId))v.pendingHuntBones.push(bone.boneId);
  v.boneNotifications||=[];if(!v.boneNotifications.some(n=>n.boneId===bone.boneId))v.boneNotifications.push({boneId:bone.boneId,name:bone.base.name,slot:bone.base.slot,years:bone.base.years,read:false});
 }
 return drop;
}
function prepareHuntCandidate(){CampaignCore.methods.prepareHuntCandidate.call(this);settleKilledCandidate.call(this);}
function acknowledgeBone(id){const v=ensure.call(this),notice=v.boneNotifications?.find(n=>n.boneId===id);if(notice)notice.read=true;this.sync();}
function finishHunt(){settleKilledCandidate.call(this);const out=CampaignCore.methods.finishHunt.call(this),v=ensure.call(this),c=this.state.character;
 for(const id of v.pendingHuntBones||[]){const bone=c.boneInventory.find(b=>b.boneId===id);if(!bone)continue;delete bone.awaitingRingAbsorption;absorb.call(this,bone);}v.pendingHuntBones=[];this.refresh();this.v12Check();this.sync();return out;
}
function abandonHunt(){settleKilledCandidate.call(this);return JourneyActions.methods.abandonHunt.call(this);}
function grantBone(p){const v=ensure.call(this),rng=A.rng.createRng(this.state.seed+'|gift-bone|'+this.state.completed),slot=A.soulbone.instance.rollBoneSlot({rng}).slot;const bone=A.soulbone.instance.createBoneInstance({boneId:'gift:'+this.state.characterId+':'+this.state.completed,definitionId:'event-gift',source:{type:'event-gift',eventId:this.event()?.id},base:{years:1000,slot,name:this.soul().attribute+'共鸣'+slot+'骨',affinity:this.soul().attribute},budget:v.attributeBudget});const out=absorb.call(this,bone);p.reward.push('获得'+bone.base.name+'；'+(out.status==='slot-conflict'?'同部位新骨收入行囊':'已自动吸收，不占事件'));}
function validate(s,catalog){if(s.v12){if(!Number.isInteger(s.v12.attemptsUsed??0)||(s.v12.attemptsUsed??0)<0||(s.v12.attemptsUsed??0)>3)throw Error('讨伐挑战次数无效');A.soulbone.absorption.validateLedger(s.v12.equipment);A.hunt.ledger.validate(s.v12.hunt);if(!Array.isArray(s.v12.reports)||s.v12.reports.length>20)throw Error('讨伐战报无效');for(const bone of [...(s.character?.bones||[]),...(s.character?.boneInventory||[])])if(bone.boneId)A.soulbone.instance.validateBoneInstance(bone);}return CampaignModern.methods.static_validate(s,catalog);}
const safe=(fn)=>function(...args){const out=fn.apply(this,args);if(this.state.character){ensure.call(this);this.refresh();this.v12Check();}return out;};
function install(methods){Object.assign(methods,{refresh,v12Ensure:ensure,v12Check:check,v12Choose:choose,v12SelectTarget:selectTarget,v12StartBattle:startBattle,v12Retry:retry,v12Reopen:reopen,v12Observe:observe,v12Claim:claim,v12Resume:resume,v12Replace:replacement,v12RecoverReport:recoverReport,grantBone,finishHunt,prepareHuntCandidate,abandonHunt,v125SettleKill:settleKilledCandidate,v125AcknowledgeBone:acknowledgeBone,observeBattle(b){RT().WitnessV12Live.persist(this.state.character,b);return JourneyActions.methods.observeBattle.call(this,b);},snapshot(){const out=JourneyActions.methods.snapshot.call(this);out.gameVersion='v12.05.03';return out;},startGrowth:safe(CampaignCore.methods.startGrowth),finishQuarter:safe(JourneyActions.methods.finishQuarter),chooseEvent:safe(CampaignCore.methods.chooseEvent)});}
function testCharacter(catalog,{seed='讨伐测试',target='frost-moss-frog',originRank=10,level=81}={}){const C=RT().WitnessCampaign||CampaignCore;const c=new CampaignCore.Campaign(catalog,{seed,name:'讨伐试炼者',level,tier:8,staged:false});const s=c.state,p=s.character;p.identity.originRank=originRank;c.setPlayMode('member');p.time.age=Math.max(16,p.time.age);p.time.startAge=p.time.age-p.time.span;p.time.birthYear=6102-p.time.age;s.date.age=p.time.startAge;
 c.refresh();for(const key of R.KEYS)p.growth[key]+=Math.max(0,R.benchmark(level).base*1.9-p.stats.stats[key]);c.refresh();p.rings=[];for(let i=1;i<=R.benchmark(level).rings;i++)p.rings.push(c.generateRing(i,'balanced',0,R.benchmark(level).rings));s.phase='growth';c.refresh();const v=ensure.call(c);v.test=true;v.testTarget=target;c.v12Check();return c;}
return {install,validate,testCharacter,BUDGET};
})(typeof globalThis==='undefined'?this:globalThis);
