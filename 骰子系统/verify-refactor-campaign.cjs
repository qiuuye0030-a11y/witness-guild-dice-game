const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const baseline=path.resolve(__dirname,'fixtures/v13-baseline');
const Old=require(path.join(baseline,'campaign.js')),New=require('./campaign.js'),catalog=require('../武魂十档候选库.json');
const plain=x=>JSON.parse(JSON.stringify(x));let actions=0,reloads=0,refusals=0;
assert.deepEqual(New.EVENTS,Old.EVENTS);assert.deepEqual(New.CHAINS,Old.CHAINS);
function step(c,i){const s=c.state;switch(s.phase){
case'creation':if(s.awakeningPending)c.acknowledgeAwakening();else c.rollCreation();break;
case'review':c.review({style:['强攻','敏攻','控制','防御','辅助'][i%5]});c.begin();break;
case'prologue':c.startGrowth();break;
case'growth':c.startQuarter(['B','S','D','A','P','C','W'][i%7]);break;
case'event':c.chooseEvent(i%2);break;
case'eventResult':c.finishEvent();break;
case'hunt':case'initialHunt':if(s.hunt.result){if(i%11===0&&s.hunt.attempt<=5){c.abandonHunt();refusals++;}else c.finishHunt();}else if(s.hunt.stage==='plan')c.huntPlan('balanced',c.huntCategories()[i%c.huntCategories().length]);else if(s.hunt.stage==='second')c.chooseSecond(c.huntCategories().find(x=>x!==s.hunt.category));else c.huntStep();break;
default:throw Error('Unhandled phase '+s.phase);
}}
for(let i=0;i<200;i++){
 let a=new Old.Campaign(catalog,{seed:'结构对照-'+i}),b=new New.Campaign(catalog,{seed:'结构对照-'+i});
 // UUID is an identity, not a seeded game draw. Pair it before comparing state.
 b.state.characterId=a.state.characterId;
 for(let n=0;a.state.phase!=='arrival'&&n<2000;n++){
  assert.deepEqual(plain(b.snapshot()),plain(a.snapshot()),'before '+i+' '+n);step(a,i);step(b,i);assert.deepEqual(plain(b.snapshot()),plain(a.snapshot()),'after '+i+' '+n);actions++;
  if(n>0&&n%23===0){a=new Old.Campaign(catalog,{snapshot:a.snapshot()});b=new New.Campaign(catalog,{snapshot:b.snapshot()});reloads++;}
  for(;;){const pa=a.currentPromotion(),pb=b.currentPromotion();assert.deepEqual(plain(pb),plain(pa));if(!pa)break;a.acknowledgePromotion(pa.id);b.acknowledgePromotion(pb.id);}
 }
 assert.equal(b.state.phase,'arrival');assert.deepEqual(plain(b.battleOptions()),plain(a.battleOptions()));
 if((i+1)%50===0)console.log('paired journeys',i+1);
}
fs.writeFileSync('output/10.05重构_培养逐步对照.json',JSON.stringify({journeys:200,actions,pairedReloads:reloads,huntRefusalCalls:refusals,events:168,chains:10,allSnapshotsExactlyEqual:true},null,2));
console.log('PASS: exact journey snapshots, creation, events, chain timing, hunts, refusals, saved RNG and exam options.');
