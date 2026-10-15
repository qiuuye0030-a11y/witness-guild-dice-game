(function(root){
  'use strict';
  const Campaign=root.WitnessCampaign?.Campaign,Creation=root.WitnessCreation;
  if(!Campaign||!Creation)throw Error('V14 campaign compatibility requires the campaign runtime.');
  if(Campaign.prototype.upgrade.v14Compatible)return;
  const copy=x=>JSON.parse(JSON.stringify(x));
  // This is the 10.05 upgrade method with exactly one acceptance change:
  // combatRulesVersion 13 OR 14. No battle version is rewritten and all other
  // incompatibility checks, migration steps and return-to-arrival behavior stay.
  Campaign.prototype.upgrade=function upgrade(){
    const s=this.state,c=s.character;if(!c)return;this.ensureStoryState();
    c.talent=copy(Creation.TALENTS[(c.talent?.rank||1)-1]);if(!c.identity.originRank)c.identity.originRank=3;
    if(!s.growthPlan){const remaining=Math.max(1,c.time.quarters-s.completed);s.growthPlan={target:41,baseXP:Math.ceil(Math.max(50,(Math.max(0,41-c.level)*100-s.xp)/remaining)*100)/100,createdAt:s.completed};}
    if(s.phase==='battle'&&s.battleSnapshot&&(s.battleSnapshot.tacticsRulesVersion!==1005||s.battleSnapshot.playerRulesVersion!==2||s.battleSnapshot.version!==10||![13,14].includes(s.battleSnapshot.combatRulesVersion)||s.battleSnapshot.soulControlVersion!==11)){s.legacyBattleReport=copy(s.battleSnapshot);s.battleSnapshot=null;s.battleOptions=null;s.result=null;s.resultHandled=false;s.phase='arrival';}
    if(s.hunt&&!s.hunt.stage){const h=s.hunt;if(h.result){h.stage='result';h.plan=h.result.plan||'balanced';h.quality=h.result.quality||50;h.low=h.high=h.years=h.result.years;}else h.stage='plan';h.initial=false;}if(s.version<3&&s.hunt){const h=s.hunt;h.selectedCategory='random';h.location='forest';h.attempt=1;h.legacyFloor=true;h.absorbed=!!h.result;}if(s.version<4){if(s.pending)s.pending.legacyEvent=true;s.eventHistory={};s.failureStreak=0;}c.luck=c.luck||5;c.eventFlags=c.eventFlags||{};c.bones=c.bones||[];c.boneInventory=c.boneInventory||[];c.mutations=c.mutations||[];s.eventHistory=s.eventHistory||{};c.charm=c.charm||5;c.fatigue=c.fatigue||0;this.freezeFortune();s.hiddenRolls=s.hiddenRolls||[];if(s.pending){s.pending.bias=s.pending.bias||10;s.pending.receipts=s.pending.receipts||[];}s.version=8;
  };
  Campaign.prototype.upgrade.v14Compatible=true;
  root.WitnessCampaignV14={version:14,supportedCombatRules:[13,14],snapshotSchema:10};
})(typeof globalThis==='undefined'?this:globalThis);
