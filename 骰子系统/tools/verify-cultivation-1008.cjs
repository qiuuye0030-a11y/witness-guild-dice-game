'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),x=require('./runtime-1008.cjs').load(),C=x.WitnessCreation;
const plain=x=>JSON.parse(JSON.stringify(x)),tests=[],root=path.resolve(__dirname,'..');
function test(name,fn){fn();tests.push(name);console.log('PASS',name);}
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixtures/1007/achievement-ending.json'),'utf8'));
const campaign=()=>new x.WitnessCampaign.Campaign(x.WITNESS_CATALOG,{snapshot:plain(fixture.state)});
test('all 100 coefficient cells are finite and monotonic in talent and weapon',()=>{for(let rank=1;rank<=10;rank++)for(let tier=1;tier<=10;tier++){const a=C.cultivationRates({rank,tier});assert(a.xp>0&&Number.isFinite(a.xp));if(rank<10)assert(C.cultivationRates({rank:rank+1,tier}).xp>a.xp);if(tier<10)assert(C.cultivationRates({rank,tier:tier+1}).xp>a.xp);}});
test('initial level advantage is preserved at 25 percent, never reversed',()=>{for(let rank=1;rank<=10;rank++)for(let tier=1;tier<=10;tier++){const lo=1+24*C.cultivationRates({rank,tier,initialLevel:1}).xp/100,hi=10+24*C.cultivationRates({rank,tier,initialLevel:10}).xp/100;assert(Math.abs(hi-lo-2.25)<.003);}});
test('qualified fifth talent reaches fifth ring even from innate1 without event XP',()=>{for(let tier=1;tier<=10;tier++)for(let initial=1;initial<=10;initial++){const final=initial+24*C.cultivationRates({rank:5,tier,initialLevel:initial}).xp/100;assert(final>=51);}});
test('old baseXP values no longer multiply the catch-up-to41 allowance',()=>{const c=campaign();c.state.character.talent=plain(C.TALENTS[9]);const a=c.growthRates();c.state.growthPlan.baseXP=1000;const b=c.growthRates();assert.equal(a.xp,b.xp);assert.equal(b.version,10081);});
test('event, opportunity and quest XP scale once; seasonal XP and all attribute receipts retain their rules',()=>{const c=campaign();for(const context of ['event','opportunity','quest','season']){const p={training:'A',PStart:c.state.character.stats.stats.P,receipts:[],reward:[],rewardContext:context},before=c.state.xp;c.reward('XP',150,p);const expected=context==='season'?150:22.5;assert(Math.abs(c.state.xp-before-expected)<.0001);assert.equal(p.receipts.at(-1).amount,expected);}const p={PStart:100,receipts:[],reward:[],rewardContext:'event'},before=c.state.character.growth.B;c.reward('B',2,p);assert.equal(c.state.character.growth.B-before,x.WitnessRules.round2(2*3*1.08*c.state.character.talent.attributeMultiplier));});
test('preview and reload cannot grant scaled XP a second time',()=>{const c=campaign(),i=x.WitnessEvents.EVENTS.findIndex(e=>e.id==='E05');c.openStoryEvent({event:x.WitnessEvents.EVENTS[i],index:i},'A');const before=JSON.stringify(c.snapshot());c.previewEvent(0);assert.equal(JSON.stringify(c.snapshot()),before);c.state.pending.bias=20;c.chooseEvent(0);const xp=c.state.xp,snapshot=c.snapshot();assert.throws(()=>c.chooseEvent(1));const d=new x.WitnessCampaign.Campaign(x.WITNESS_CATALOG,{snapshot});assert.equal(d.state.xp,xp);assert(d.state.pending.receipts.some(r=>r.context==='opportunity'&&r.amount===22.5));});
// A conservative bound across every non-extreme event, not merely observed samples.
let maxPerEvent=0;
for(const e of x.WitnessEvents.EVENTS)for(const o of e.options)for(let bias=1;bias<20;bias++){
 const mult=bias>=17?1.6:bias>=13?1.2:bias<=4?1.3:1;
 const direct=(o.gain.XP||0)*mult,gift=['family','bone'].includes(o.special)?25:0,opportunity=bias===1?60:bias>=17?35:bias>=13?10:0;
 maxPerEvent=Math.max(maxPerEvent,direct+gift+opportunity);
}
const extraChapters=x.WitnessEvents.CHAINS.filter(c=>c.cadence==='same_period_episode').reduce((n,c)=>n+c.nodes.length-1,0);
const questBound=x.WitnessEvents.CHAINS.reduce((n,c)=>n+(c.completion.bonus.XP||0)+(c.completion.perfectExtra?.XP||0)+Object.values(c.alternateEndings||{}).reduce((a,b)=>a+(b.bonus?.XP||0),0),0);
const eventXPBound=((24+extraChapters)*maxPerEvent+questBound)*C.CULTIVATION.eventMultiplier+10; // +10XP safely covers all two-decimal rounding.
const bounds=[];
test('conservative ordinary-event upper bounds exclude non-double90 and low-talent fifth rings',()=>{for(let rank=1;rank<=10;rank++)for(let tier=1;tier<=10;tier++){const xp=C.cultivationRates({rank,tier,initialLevel:10}).xp,upper=10+(24*xp+eventXPBound)/100;bounds.push({rank,tier,upper});if(rank<10||tier<10)assert(upper<90,`rank ${rank}, tier ${tier}, bound ${upper}`);if(rank<5)assert(upper<51,`low talent bound ${upper}`);}});
const report={passed:tests.length,tests,configuration:plain(C.CULTIVATION),nonExtremeDefinition:'bias1..19, includes all successes, full bone fallback and every quest ending; bias20 excluded only from this analytical bound',maxPerEvent,extraChapters,questBound,eventXPBound,bounds};
fs.writeFileSync(path.join(root,'output/1008/数值回调验算/公式与边界验证.json'),JSON.stringify(report,null,2));console.log('ALL',tests.length,'normal-event additional-level bound',eventXPBound/100);
