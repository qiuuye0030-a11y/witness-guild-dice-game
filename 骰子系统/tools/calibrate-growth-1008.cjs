'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),current=require('./runtime-1008.cjs').load();
const root=path.resolve(__dirname,'..'),round=n=>Math.round(n*1000)/1000,copy=v=>JSON.parse(JSON.stringify(v));
const N=Number(process.env.GROWTH_SAMPLES||8),mode=process.env.GROWTH_MODE||'fixed',policy=process.env.GROWTH_POLICY||'random',innate=Number(process.env.GROWTH_INITIAL||5),favored=process.env.GROWTH_PROFILE==='favored';
const output=path.join(root,'output/1008/数值回调验算');fs.mkdirSync(output,{recursive:true});
function create(x,rank,seed,preset){
 const c=new x.WitnessCampaign.Campaign(x.WITNESS_CATALOG,{seed,tier:preset.tier,level:preset.level});
 while(c.state.phase==='creation'){if(c.state.awakeningPending)c.acknowledgeAwakening();else c.rollCreation();}
 const s=c.state,a=s.character,soul=x.WITNESS_CATALOG.find(v=>v.tier===preset.tier&&!v.spirit_specialist&&v.style.includes('强攻'))||x.WITNESS_CATALOG.find(v=>v.tier===preset.tier&&!v.spirit_specialist);
 Object.assign(a,{level:preset.level,initialLevel:preset.level,soulId:soul.id,initialPotential:preset.tier,style:x.WitnessRules.mainStyles(soul)[0],release:soul.release_options[0],luck:preset.luck,initialLuck:preset.luck,charm:preset.charm,initialCharm:preset.charm,talent:copy(x.WitnessCreation.TALENTS[rank-1]),deviations:Array(6).fill(0),wDeviation:0});
 a.identity.originRank=preset.origin;a.identity.origin=preset.region;
 a.time={month:1,age:28,span:22,rawSpan:22,birthYear:6074,startYear:6080,startAge:6,quarters:24,timelineMode:'stages',awakeningAge:6};
 s.date={year:6080,month:1,age:6};s.growthPlan={target:41,baseXP:Math.ceil((41-a.level)*100/24*100)/100,createdAt:0};s.completed=0;s.xp=0;c.refresh();
 if(preset.fixedTier){const baseDraw=c.draw;c.draw=function(sides,label){const face=baseDraw.call(this,sides,label);if(label==='魂骨引发武魂变异'){const r=this.state.rolls.at(-1);r.face=100;return 100;}return face;};}
 c.begin();return c;
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
 return {level:c.state.character.level,xp:c.state.xp,events,opportunities,eventXP:round(eventXP),seasonXP:round(seasonXP),questXP:round(questXP),mutations,finalPotential:c.soul().tier,rings:c.state.character.rings.length};
}
function summarize(rows){const ls=rows.map(r=>r.level).sort((a,b)=>a-b),mean=ls.reduce((a,b)=>a+b,0)/ls.length,sd=Math.sqrt(ls.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,ls.length-1));return {n:rows.length,mean:round(mean),ci95:round(1.96*sd/Math.sqrt(ls.length)),p05:ls[Math.floor((ls.length-1)*.05)],median:ls[Math.floor((ls.length-1)*.5)],p95:ls[Math.floor((ls.length-1)*.95)],maxObserved:ls.at(-1),cap99Percent:round(100*ls.filter(v=>v===99).length/ls.length),meanEvents:round(rows.reduce((n,r)=>n+r.events,0)/ls.length),meanEventXP:round(rows.reduce((n,r)=>n+r.eventXP+r.questXP,0)/ls.length)};}

module.exports={create,run,summarize};
if(require.main===module){
const cells=[];let journeys=0;
for(let rank=1;rank<=10;rank++){
 for(let tier=1;tier<=10;tier++){
  const rows=[];for(let seed=0;seed<N;seed++)rows.push(run(current,rank,'growth-calibration-'+seed,{level:innate,tier,luck:favored?10:5,charm:favored?10:5,origin:favored?10:5,region:'集镇',fixedTier:mode==='fixed'},policy));
  cells.push({rank,tier,mode,policy,...summarize(rows),below90UnlessDouble:rows.every(r=>r.level<90||rank===10&&r.finalPotential===10),lowTalentAtMostFourRings:rank>=5||rows.every(r=>r.rings<=4),rows});journeys+=N;
 }
 console.log('matrix',mode,policy,'talent',rank,cells.slice(-10).map(c=>c.mean.toFixed(1)).join(' '));
 fs.writeFileSync(path.join(output,`matrix-${mode}-${policy}-${N}${innate!==5||favored?`-initial${innate}-${favored?'favored':'middle'}`:''}.json`),JSON.stringify({version:10081,configuration:copy(current.WitnessCreation.CULTIVATION),N,mode,policy,innate,favored,journeys,cells},null,2));
}
assert.equal(cells.length,100);assert(cells.every(c=>c.below90UnlessDouble));assert(cells.every(c=>c.lowTalentAtMostFourRings));
console.log('COMPLETE',mode,policy,journeys,'journeys',100,'cells');

}
