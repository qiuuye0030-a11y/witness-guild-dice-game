const CampaignModern=(function(){
'use strict';
const baseRefresh=JourneyActions.methods.refresh;
function refresh(){
  const s=this.state,c=s.character;
  if(c)for(const ring of [...(c.rings||[]),...(s.hunt?.result?[s.hunt.result]:[])])for(let i=0;i<ring.skills.length;i++){const sk=ring.skills[i];if(sk.attackSubtype==='pursuit'&&(c.style!=='敏攻'||this.soul().spirit_specialist)){s.skillMigrations||=[];s.skillMigrations.push({ring:ring.index,slot:i,old:sk.name,reason:'追势仅限敏攻系，转为普通攻击'});sk.attackSubtype='direct';sk.name=this.soul().name+'·击';}if(sk.category==='回蓝'){s.skillMigrations||=[];s.skillMigrations.push({ring:ring.index,slot:i,old:sk.name,reason:'回蓝类退场，确定性迁移为防御'});sk.category='防御';sk.name=this.soul().name+'·护';delete sk.attackSubtype;delete sk.effects;}}
  baseRefresh.call(this);if(!c)return;
  if(s.promotionState?.ratingRulesVersion!==CampaignCore.R.ratingRulesVersion)CampaignCore.methods.ensurePromotionState.call(this);
  if(s.growthPlan?.cultivationVersion!==CampaignCore.Creation.CULTIVATION.version){s.cultivationMigration={version:CampaignCore.Creation.CULTIVATION.version,atPeriod:s.completed,previousBaseXP:s.growthPlan?.baseXP??null,earnedLevel:c.level,earnedXP:s.xp};s.growthPlan={...(s.growthPlan||{}),baseXP:CampaignCore.R.round2(CampaignCore.Creation.CULTIVATION.journeyXP/Math.max(1,c.time.quarters)),cultivationVersion:CampaignCore.Creation.CULTIVATION.version};}

  for(const ring of c.rings||[])for(let i=0;i<ring.skills.length;i++){
    const skill=ring.skills[i];
    if(skill.category==='回蓝'){
      s.skillMigrations||=[];s.skillMigrations.push({ring:ring.index,slot:i,old:skill.name,reason:'回蓝类退场，确定性迁移为防御'});
      ring.skills[i]=CampaignCore.R.makeSkill({soul:this.soul(),style:c.style,stats:c.stats,index:ring.index,years:ring.years,category:'防御',effectSeed:s.seed+'|migration-1007|'+ring.index+'|'+i});
    }else if(skill.category==='攻击'&&!skill.attackSubtype){skill.attackSubtype=skill.damageMode==='periodic'?'periodic':'direct';skill.generationVersion=1006;}
  }
  if(s.hunt?.selectedCategory==='回蓝'){s.hunt.selectedCategory='random';if(s.hunt.result){s.hunt.result=null;s.hunt.stage='category';}s.hunt.category=undefined;}
  if(s.hunt?.category==='回蓝')s.hunt.category='防御';if(s.hunt?.secondCategory==='回蓝')s.hunt.secondCategory=s.hunt.category==='防御'?'强化':'防御';
  if(s.phase==='battle'&&s.battleSnapshot&&![1007,1008,1100].includes(s.battleSnapshot.modernVersion)){s.legacyBattleReport=s.battleSnapshot;s.battleSnapshot=null;s.result=null;s.resultHandled=false;s.modernBattleRestart=true;s.pendingExamResume=true;s.phase='arrival';}
  s.cultivationRulesVersion=10082;s.gameVersion='v11.01';
}
function static_validate(s,catalog){
  JourneyActions.methods.static_validate(s,catalog);const runtime=typeof module!=='undefined'&&module.exports?require('./v13-runtime.cjs'):globalThis;const challengeAPI=typeof module!=='undefined'&&module.exports?require('./systems/challenge/state.js'):globalThis.WitnessChallenge;challengeAPI?.validate(s.challenge);
  if(s.challenge){const q=s.challenge;if(q.version!==1||!Number.isInteger(q.failures)||q.failures<0||q.failures>5||!Array.isArray(q.completed)||q.completed.length>40||!Array.isArray(q.resolved)||q.resolved.length>200)throw Error('挑战进度无效');if(q.active&&(!q.options?.postGameChallenge||q.options.challengeSessionId!==q.active||typeof q.active!=='string'||q.active.length>160))throw Error('挑战场次无效');}
  for(const ring of s.character?.rings||[])for(const sk of ring.skills){if(sk.attackSubtype!==undefined&&!['direct','periodic','multi','pursuit'].includes(sk.attackSubtype))throw Error('攻击子类无效');}
  return true;
}
function battleOptions(...args){const s=this.state;if(s.pendingExamResume){if(s.phase!=='arrival'||s.exam?.badEnding)throw Error('旧战斗恢复资格无效');const options=JSON.parse(JSON.stringify(s.battleOptions));options.character=JSON.parse(JSON.stringify(s.character));options.soul=JSON.parse(JSON.stringify(this.soul()));s.phase='battle';s.pendingExamResume=false;s.battleSnapshot=null;s.result=null;s.resultHandled=false;return options;}return JourneyActions.methods.battleOptions.apply(this,args);}
function autoEventStep(){
 const s=this.state;if(s.phase==='growth')return this.startQuarter(s.quickTraining||'C');
 if(s.phase==='event'){
  const p=s.pending;if(p.choice===null||p.choice===undefined){
   const chances=p.legacyEvent?[50,50]:[this.eventEstimate(0),this.eventEstimate(1)];
   const choice=chances[1]>chances[0]?1:0;p.autoChoice={index:choice,policy:'公开估计成功率较高者；同率选前项',chances};
   if(p.legacyEvent)return this.chooseEvent(choice);this.prepareEvent(choice);return;
  }return this.chooseEvent();
 }
 if(s.phase==='eventResult')return this.finishEvent();
 throw Error('当前阶段需要本人确认');
}
return {methods:{refresh,static_validate,battleOptions,autoEventStep}};
})();
