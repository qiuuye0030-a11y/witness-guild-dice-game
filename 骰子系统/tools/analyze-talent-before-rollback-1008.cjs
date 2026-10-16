'use strict';
// Analysis only: never writes game sources or player storage.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const current=require('./runtime-1008.cjs').load(),previous=require('../fixtures/1007-reference/tools/runtime-1007.cjs').load();
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/1008/天赋等级复核');fs.mkdirSync(output,{recursive:true});
const round=n=>Math.round(n*1000)/1000,copy=x=>JSON.parse(JSON.stringify(x));
const presets={neutral:{level:5,tier:5,luck:5,charm:5,origin:5,region:'集镇'},high:{level:1,tier:10,luck:10,charm:10,origin:10,region:'集镇'}};
function create(x,rank,seed,preset){
 const c=new x.WitnessCampaign.Campaign(x.WITNESS_CATALOG,{seed,tier:preset.tier,level:preset.level});
 while(c.state.phase==='creation'){if(c.state.awakeningPending)c.acknowledgeAwakening();else c.rollCreation();}
 const s=c.state,a=s.character,soul=x.WITNESS_CATALOG.find(v=>v.tier===preset.tier&&!v.spirit_specialist&&v.style.includes('强攻'));
 Object.assign(a,{level:preset.level,initialLevel:preset.level,soulId:soul.id,initialPotential:preset.tier,style:'强攻',release:soul.release_options[0],luck:preset.luck,initialLuck:preset.luck,charm:preset.charm,initialCharm:preset.charm,talent:copy(x.WitnessCreation.TALENTS[rank-1]),deviations:Array(6).fill(0),wDeviation:0});
 a.identity.originRank=preset.origin;a.identity.origin=preset.region;
 a.time={month:1,age:28,span:22,rawSpan:22,birthYear:6074,startYear:6080,startAge:6,quarters:24,timelineMode:'stages',awakeningAge:6};
 s.date={year:6080,month:1,age:6};s.growthPlan={target:41,baseXP:Math.ceil((41-a.level)*100/24*100)/100,createdAt:0};s.completed=0;s.xp=0;c.refresh();c.begin();return c;
}
function expectedXP(c,choice){
 const e=c.event(),o=e.options[choice],p=c.state.pending;let sum=0;const old=p.bias,full=c.state.character.bones.length+c.state.character.boneInventory.length>=6;
 for(let bias=1;bias<=20;bias++){
  p.bias=bias;const prob=Math.floor(c.eventChance(choice).chance)/100,m=bias>=17?1.6:bias>=13?1.2:bias<=4?1.3:1;
  for(const [win,pr]of [[true,prob],[false,1-prob]]){
   let xp=o.gain.XP===undefined?0:win?Math.round(o.gain.XP*m*100)/100:Math.max(1,Math.floor(o.gain.XP*.25));
   if(full&&['bone','family'].includes(o.special)&&(win||bias===20))xp+=25;
   xp+=bias===20?150:bias===1?(win?60:-Math.min(20,xp)):bias>=17&&win?35:bias>=13&&win?10:0;
   sum+=pr*xp/20;
  }
 }
 p.bias=old;return sum;
}
function choose(c,policy,eventIndex){if(policy==='random')return eventIndex%2;return expectedXP(c,1)>expectedXP(c,0)?1:0;}
function finishHunt(c){const h=c.state.hunt;if(h.result)c.finishHunt();else if(h.stage==='plan')c.huntPlan('balanced','random');else if(h.stage==='second')c.chooseSecond(c.huntCategories(h.index).find(k=>k!==h.category));else c.huntStep();}
function run(x,rank,seed,preset,policy){
 const c=create(x,rank,seed,preset);let events=0,opportunities=0,eventXP=0,seasonXP=0,questXP=0,mutations=0;
 for(let steps=0;c.state.phase!=='arrival'&&steps<1000;steps++){
  const s=c.state,periodBefore=s.completed+1;switch(s.phase){
   case'initialHunt':case'hunt':finishHunt(c);break;
   case'prologue':c.startGrowth();break;
   case'growth':if(s.character.boneInventory.length){c.fuseStoredBone();delete s.boneReport;}c.startQuarter('C');break;
   case'event':{c.chooseEvent(choose(c,policy,events+(parseInt(seed.match(/\d+$/)?.[0]||'0'))));events++;for(const r of s.pending.receipts||[])if(r.kind==='xp'){if(r.context==='season')seasonXP+=r.amount;else if(r.context==='quest')questXP+=r.amount;else eventXP+=r.amount;}if(s.pending.bias===20)opportunities++;break;}
   case'eventResult':c.finishEvent();break;
   default:throw Error('unexpected '+s.phase);
  }
  while(c.currentPromotion())c.acknowledgePromotion();
 }
 assert.equal(c.state.phase,'arrival');mutations=c.state.character.mutations.length;
 return {level:c.state.character.level,xp:c.state.xp,events,opportunities,eventXP:round(eventXP),seasonXP:round(seasonXP),questXP:round(questXP),mutations};
}
function summarize(rows){const ls=rows.map(r=>r.level).sort((a,b)=>a-b),mean=ls.reduce((a,b)=>a+b,0)/ls.length,sd=Math.sqrt(ls.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,ls.length-1));return {n:rows.length,mean:round(mean),ci95:round(1.96*sd/Math.sqrt(ls.length)),p05:ls[Math.floor((ls.length-1)*.05)],median:ls[Math.floor((ls.length-1)*.5)],p95:ls[Math.floor((ls.length-1)*.95)],maxObserved:ls.at(-1),cap99Percent:round(100*ls.filter(v=>v===99).length/ls.length),meanEvents:round(rows.reduce((n,r)=>n+r.events,0)/ls.length),meanEventXP:round(rows.reduce((n,r)=>n+r.eventXP+r.questXP,0)/ls.length)};}
// A legal-outcome witness proves the global bound only if it reaches hard cap99.
// This explicitly enumerates favorable dice OUTCOMES, not a discovered PRNG seed.
function extreme(x,rank,preset=presets.high){
 const c=create(x,rank,'theoretical-witness-'+rank,preset),trace=[];
 const ordinaryDraw=c.draw,ordinaryDark=c.dark;
 function desired(sides,label){if(/本季相遇/.test(label)&&c._nextEventRoll)return c._nextEventRoll;if(/行动判定|引发武魂变异/.test(label))return 1;if(/提升幅度/.test(label))return sides;return Math.min(sides,/境遇偏倚/.test(label)?20:1);}
 c.draw=function(sides,label){const die=this.rng.die.bind(this.rng);this.rng.die=n=>{die(n);return desired(n,label);};try{return ordinaryDraw.call(this,sides,label);}finally{this.rng.die=die;}};
 c.dark=function(sides,label){const die=this.rng.die.bind(this.rng);this.rng.die=n=>{die(n);return desired(n,label);};try{return ordinaryDark.call(this,sides,label);}finally{this.rng.die=die;}};
 let n=0,first99=null;
 for(let steps=0;c.state.phase!=='arrival'&&steps<1000;steps++){
  const s=c.state,periodBefore=s.completed+1;switch(s.phase){
   case'initialHunt':case'hunt':finishHunt(c);break;
   case'prologue':c.startGrowth();break;
   case'growth':{
    while(s.character.boneInventory.length){c.fuseStoredBone();delete s.boneReport;}
    const next=c.nextQuestEvent();
    if(next){c.startQuarter('C');break;}
    const reserved=c.questReserved(),eligible=e=>!e.chainOnly&&!reserved.has(e.id)&&c.matchesEvent(e);
    let candidates=x.WitnessEvents.EVENTS.map((event,index)=>({event,index})).filter(a=>!a.event.reserve&&eligible(a.event)&&a.index!==s.lastEvent);
    if(!candidates.length)candidates=x.WitnessEvents.EVENTS.map((event,index)=>({event,index})).filter(a=>a.event.reserve&&eligible(a.event));
    if(s.failureStreak>=2){const gentle=candidates.filter(a=>a.event.options[0].base>=83&&!a.event.options.some(o=>['family','mutation'].includes(o.special)));if(gentle.length)candidates=gentle;}
    const score=a=>{const e=a.event,chain=x.WitnessEvents.CHAINS.find(q=>q.start.eventId===e.id&&!s.quests.records[q.id]);return (chain?.cadence==='same_period_episode'?2000:0)+(e.id==='E155'?500:0)+Math.max(...e.options.map(o=>1.6*(o.gain.XP||0)))+(chain?40:0);};
    const drawOrder=[...candidates];candidates.sort((a,b)=>score(b)-score(a)||a.index-b.index);const pick=candidates[0];
    // Open only an eligible event with positive probability. Confirm through engine history.
    assert(pick&&pick.event.weight>0);const weights=drawOrder.map(a=>a.event.weight*(a.event.id==='E02'?1:1+(s.character.luck-5)*.025)),total=weights.reduce((a,b)=>a+b,0),index=drawOrder.findIndex(a=>a.event.id===pick.event.id),lo=weights.slice(0,index).reduce((a,b)=>a+b,0);c._nextEventRoll=Math.ceil(lo/total*10000)+1;assert(c._nextEventRoll<=10000&&(c._nextEventRoll-1)/10000*total<lo+weights[index]);c.startQuarter('C');assert.equal(c.event().id,pick.event.id,'actual weighted selector must choose legal witness event');delete c._nextEventRoll;break;
   }
   case'event':{const e=c.event(),scores=e.options.map(o=>1.6*(o.gain.XP||0)+((s.character.bones.length+s.character.boneInventory.length>=6&&['bone','family'].includes(o.special))?25:0));let choice=scores[1]>scores[0]?1:0;const chain=x.WitnessEvents.CHAINS.find(q=>q.start.eventId===e.id&&!s.quests.records[q.id]);if(chain?.start.optionIndex!==undefined&&chain.start.outcome!=='failure')choice=chain.start.optionIndex;c.chooseEvent(choice);trace.push({stage:s.completed+1,event:e.id,choice,bias:s.pending.bias,xp:s.pending.receipts.filter(r=>r.kind==='xp').map(r=>({context:r.context,amount:r.amount})),level:s.character.level});n++;break;}
   case'eventResult':c.finishEvent();break;
   default:throw Error(s.phase);
  }
  if(c.state.character.level===99&&!first99)first99={stage:periodBefore,events:n};while(c.currentPromotion())c.acknowledgePromotion();
 }
 assert.equal(c.state.phase,'arrival');return {rank,level:c.state.character.level,first99,events:n,trace,completedQuests:copy(c.state.quests.records)};
}
const N=Number(process.env.TALENT_SAMPLES||64),groups=[],witnesses=[];
const checkpoint=path.join(output,'逐档测算数据.json'),cached=fs.existsSync(checkpoint)&&!process.argv.includes('--fresh')?JSON.parse(fs.readFileSync(checkpoint,'utf8')):{groups:[]};
if(process.argv.includes('--extreme-only')){const ws=[];for(let rank=1;rank<=10;rank++){const w=extreme(current,rank);w.previousVersionLevel=extreme(previous,rank).level;const neutral=extreme(current,rank,presets.neutral),oldNeutral=extreme(previous,rank,presets.neutral);w.neutral={level:neutral.level,previousVersionLevel:oldNeutral.level,trace:neutral.trace,first99:neutral.first99};assert.equal(neutral.level,99);assert.equal(oldNeutral.level,99);assert.equal(w.level,99);assert.equal(w.previousVersionLevel,99);ws.push(w);}fs.writeFileSync(checkpoint,JSON.stringify({...cached,witnesses:ws},null,2));console.log('All 40 extreme cases reached cap99 through actual weighted event selection; source stages corrected.');process.exit(0);}
for(let rank=1;rank<=10;rank++){
 const w=extreme(current,rank);w.previousVersionLevel=extreme(previous,rank).level;const neutral=extreme(current,rank,presets.neutral),oldNeutral=extreme(previous,rank,presets.neutral);w.neutral={level:neutral.level,previousVersionLevel:oldNeutral.level,trace:neutral.trace,first99:neutral.first99};assert.equal(neutral.level,99);assert.equal(oldNeutral.level,99);witnesses.push(w);console.log('extreme',rank,w.level,w.events);
 for(const presetName of ['neutral','high'])for(const policy of ['random','xpExpected'])for(const [version,x]of [['10.07',previous],['10.08',current]]){
  if(presetName==='high'&&version==='10.07')continue;
  const prior=cached.groups.find(g=>g.rank===rank&&g.preset===presetName&&g.policy===policy&&g.version===version);
  const rows=prior?prior.rows.slice(0,N):[];for(let seed=rows.length;seed<N;seed++)rows.push(run(x,rank,'talent-audit-'+seed,presets[presetName],policy));
  const g={rank,preset:presetName,policy,version,...summarize(rows),rows};groups.push(g);console.log(version,rank,presetName,policy,g.mean,g.p95,g.maxObserved,g.cap99Percent+'%');
 }
 fs.writeFileSync(path.join(output,'逐档测算数据.json'),JSON.stringify({samplesPerGroup:N,presets,groups,witnesses,notice:'Analysis only. xpExpected maximizes current-event expected XP, not a global future-aware policy. Extreme witnesses choose permitted favorable event/dice outcomes and do not claim a realizable fixed PRNG seed.'},null,2));
}
console.log('DONE',groups.length*N,'journeys');
