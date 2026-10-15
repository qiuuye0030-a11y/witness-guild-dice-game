const assert=require('assert/strict');
const fs=require('fs'),path=require('path'),{performance}=require('perf_hooks');
const {load}=require('../load.cjs');
const x=load('projection'),B=x.WitnessBattle;
const checks=[];
function fresh(id='xiaweiyu',foe='qinyan',support=false){
 const b=new B.Battle({playerTemplateId:id,enemyId:foe,testLevel:61,duel:!support,withSupport:support,difficulty:'standard',seed:'v14-projection-regression'});
 b.now=0;b.result=null;b.log=[];b.events=[];b.activeId='player';
 for(const u of b.units)Object.assign(u,{cast:null,statuses:[],dots:[],readyAt:0,progress:0,cooldowns:{},uses:{},hp:u.model.derived.HP,mp:u.model.derived.MP,sh:u.model.derived.SH,actions:0,bonusAttack:false,shieldLayers:[],shieldHP:0,shieldSH:0,shieldUntil:0,guard:0,oneHit:false,immuneUntil:0});
 b.units[0].progress=1;return b;
}
function publicState(b){return JSON.stringify({now:b.now,result:b.result,activeId:b.activeId,queueSequence:b.queueSequence,turn:b.turn,units:b.units.map(u=>Object.fromEntries(Object.entries(u).filter(([k])=>!['model','soul','skills'].includes(k))))});}
function actual(b,u,t,s,roll=1,options={}){
 const a=new B.Battle({snapshot:b.snapshot()});a.scheduleAI=()=>{};a.rng.die=()=>roll;a._valuingAI=false;
 const au=a.unit(u.id),at=a.unit(t.id),action=s?.id||'attack';
 if(options.at)a.tick(a.now+Math.round(options.at*1000),true);
 if(!options.paid){a.activeId=au.id;au.progress=1;au.readyAt=Math.min(au.readyAt,a.now);const error=a.command(au.id,action,at.id);assert.equal(error,'');}
 const end=au.cast.end;a.tick(end,true);return a;
}
function exact(label,b,u,t,s,roll=1,options={}){
 const before=JSON.stringify(b),forecast=b.forecastAction(u,t,s||'attack',{...options,rolls:Array(40).fill(roll)});
 assert.equal(JSON.stringify(b),before,label+' must not mutate real battle or rng');
 assert.equal(forecast.valid,true,label+' valid');assert.equal(forecast.branches.length,1);
 const a=actual(b,u,t,s,roll,options),pred=forecast.branches[0].state;
 assert.equal(publicState(pred),publicState(a),label+' exact state must equal actual engine');
 for(const packet of forecast.branches[0].packets)for(const key of ['hp','sh','mp','petHP','bodyHP'])assert.equal(Number.isInteger(packet[key]),true,label+' integer packet '+key);
 checks.push({label,passed:true,hit:forecast.hit,immediate:forecast.immediate,packets:forecast.branches[0].packets.length,futureDOT:forecast.futureDOT.damage});
 return forecast;
}
{
 const b=fresh('anmu'),[u,t]=b.units,s=u.skills.find(s=>s.damageMode==='periodic');
 const f=exact('normalized poison DOT uses real periodic plan',b,u,t,s);assert.equal(f.immediate.hp,0);assert.equal(f.knockoutProbability,0);assert.equal(f.futureDOT.damage,867);
}
{
 const b=fresh('xuejidong'),[u,t]=b.units,s=u.skills[1];b.setBuff(u,'coldAura',.38,{id:'test'});
 const f=exact('cold aura creates its own third packet',b,u,t,s);assert.equal(f.branches[0].packets.length,3);assert.equal(f.damage,496);
}
{
 const b=fresh(),[u,t]=b.units,s=u.skills[1];b.setStatus(t,'evasion',.5,100,{source:'test'});b.setStatus(u,'bloodFirstStrike',1,100,{source:'test'});
 const f=exact('blood first strike succeeds at roll 99 and adds 35 percent',b,u,t,s,99);assert.equal(f.hitProbability,1);assert.equal(f.damage,437);
 const all=b.forecastAction(u,t,s);assert.equal(all.hitProbability,1);assert.equal(all.branches.length,2);assert.equal(all.branches.filter(z=>z.target.statuses.some(q=>q.type==='control')).reduce((n,z)=>n+z.probability,0),.5);
}
{
 const b=fresh('qinyan','qingling'),[u,t]=b.units,s=u.skills[0];b.setStatus(t,'phantomSwapReady',1,4,{source:'test'});
 const f=exact('phantom swap forces miss and consumes readiness',b,u,t,s);assert.equal(f.hitProbability,0);assert.equal(f.immediate.hp,0);
}
for(const shield of [false,true]){
 const b=fresh('xuejidong'),[u,t]=b.units,s=u.skills[1];b.addShieldLayer(t,{source:'inner',channel:'生命',amount:200,until:8000});b.addShieldLayer(t,{source:'outer',channel:'生命',amount:shield?300:0,guard:.4,oneHit:shield,until:8000});
 exact('separate packet guard/MP/layers '+shield,b,u,t,s);
}
{
 const b=fresh('xuejidong'),[u,t]=b.units,s=u.skills[3];const f=exact('secondary packet does not inherit main penetration',b,u,t,s);assert.equal(f.damage,573);
}
{
 const b=fresh(),[u,t]=b.units,s=u.skills[1];b.setStatus(u,'damageDown',.4,100,{source:'test'});
 const f=exact('damageDown applied once',b,u,t,s);assert.equal(f.branches[0].packets[0].hp,146);
 const off=b.forecastAction(u,t,s);b._valuingAI=true;const on=b.forecastAction(u,t,s);delete b._valuingAI;assert.deepEqual(on.immediate,off.immediate);assert.equal(on.damage,off.damage);
}
{
 const b=fresh(),[u,t]=b.units,s=u.skills[1];b.setStatus(t,'evasion',.5,5,{source:'test'});
 const now=b.forecastAction(u,t,s),later=b.forecastAction(u,t,s,{at:10});assert.equal(now.hit,.47);assert.equal(later.hit,.97);exact('future expiry is advanced before resolution',b,u,t,s,1,{at:10});
}
{
 const b=fresh(),[u,t]=b.units,s=u.skills[1];t.release='召唤';t.petHP=20;t.bodyHP=50;t.hp=70;t.mp=0;t.petAlive=true;t.petMax=200;t.bodyMax=500;
 const f=exact('single packet stops at summoned body boundary',b,u,t,s);assert.equal(f.immediate.hp,20);assert.equal(f.immediate.bodyHP,0);assert.equal(f.knockoutProbability,0);assert.equal(f.branches[0].target.bodyHP,50);
}
{
 const b=fresh(),[u,t]=b.units,s=u.skills[1];t.hp=275;const f=exact('MP defense prevents false immediate finisher',b,u,t,s);assert.equal(f.knockoutProbability,0);assert.equal(f.branches[0].target.hp,32);
}
{
 const b=fresh(),[u,t]=b.units,s=u.skills[1];b.addShieldLayer(t,{source:'full',channel:'生命',amount:9999,until:10000});
 const f=exact('preserved V13 mana drain triggers through full shield',b,u,t,s);assert.equal(f.immediate.hp,0);assert.equal(f.immediate.mp,110);assert(f.branches[0].actor.mp>u.mp-f.cost);
}
{
 const b=fresh(),[u,t]=b.units,s=u.skills[5];const f=exact('blood domain resistance preserves independent self and accuracy effects',b,u,t,s,100);assert(f.branches[0].actor.statuses.some(q=>q.type==='bloodFirstStrike'));assert(f.branches[0].target.statuses.some(q=>q.type==='accuracyDown'));assert(!f.branches[0].target.statuses.some(q=>q.type==='statDownA'));
 const both=b.forecastAction(u,t,s);assert.equal(both.branches.length,2);assert.equal(both.cost,b.cost(u,s));
}
{
 const b=fresh(),[u,t]=b.units,s=u.skills[1];assert.equal(b.command(u.id,s.id,t.id),'');u.mp=0;
 const f=exact('paid cast retains damage when MP is now zero',b,u,t,s,1,{paid:true});assert.equal(f.cost,0);assert(f.immediate.hp>0);
}
{
 const b=fresh('qingling'),[u]=b.units,s=u.skills.find(s=>s.phantomDance);const f=exact('self form preserves complete effects and bonus basic',b,u,u,s);assert.equal(f.branches[0].actor.bonusAttack,true);assert.equal(f.branches[0].actor.phantoms,5);
}
{
 const b=fresh('xuejidong'),[u,t]=b.units,s=u.skills[1],other=t.skills.find(s=>s.category==='攻击');
 b.activeId=t.id;t.progress=1;assert.equal(b.command(t.id,other.id,u.id),'');b.activeId=u.id;u.progress=1;
 exact('known overlapping casts and same-time batch order',b,u,t,s);
}
{
 const b=fresh(),[u,t]=b.units;b.setStatus(t,'evasion',.5,1,{source:'test'});const state=JSON.stringify(b);const future=b.forecastAdvance(2);assert.equal(JSON.stringify(b),state);assert.equal(future.branches.length,1);assert(!future.branches[0].state.unit(t.id).statuses.some(x=>x.type==='evasion'));checks.push({label:'known-only advance expires state without an action',passed:true});
}
let matrixCount=0;
for(const template of B.templates){
 const b=fresh(template.id),[u,t]=b.units;u.rage=3;t.bloodMarks=[u.id];t.cast={action:'attack',target:u.id,start:0,end:50000,skill:null,rage:0};
 for(const s of u.skills){const target=['强化','防御','治疗','回蓝'].includes(s.category)?(s.category==='回蓝'?null:u):t;if(!target||b.actionReason(u,s.id)||!b.targetOptions(u,s.id).some(z=>z.id===target.id))continue;
  for(const roll of [1,100]){exact('template '+template.id+' '+s.id+' roll '+roll,b,u,target,s,roll);matrixCount++;}
 }
}
const bench=fresh('xuejidong'),[bu,bt]=bench.units,start=performance.now();for(let i=0;i<100;i++)bench.forecastAction(bu,bt,bu.skills[1]);const timing=(performance.now()-start)/100;
function actualDots(branch,before=false){
 const a=new B.Battle({snapshot:branch.state.snapshot()});a.scheduleAI=()=>{};a.rng.die=()=>1;
 for(const unit of a.units){unit.cast=null;if(before){unit.dots=structuredClone(branch.futureDOT.beforeDots?.[unit.id]||[]);unit.statuses=[...unit.statuses.filter(s=>s.type!=='dotBoost'),...structuredClone(branch.futureDOT.beforeDotBoost?.[unit.id]||[])];}}
 const initial=Object.fromEntries(a.units.map(u=>[u.id,{hp:u.hp,sh:u.sh,mp:u.mp,petHP:u.petHP||0,bodyHP:u.bodyHP||0,shieldHP:u.shieldHP,shieldSH:u.shieldSH}]));
 const end=Math.max(a.now,...a.units.flatMap(u=>u.dots.map(d=>d.next+Math.max(0,d.ticks-1)*3000)));a.tick(end,true);
 return Object.fromEntries(a.units.map(u=>[u.id,Object.fromEntries(Object.keys(initial[u.id]).map(k=>[k,initial[u.id][k]-(u[k]||0)]))]));
}
for(const fixture of ['shield','expiring shield','limited MP','summon','amplifier']){
 const b=fresh('anmu'),[u,t]=b.units;let s=u.skills.find(s=>s.damageMode==='periodic');
 if(fixture==='shield'||fixture==='expiring shield')b.addShieldLayer(t,{source:'dot-regression',amount:9999,channel:'生命',until:fixture==='shield'?20000:6000});
 if(fixture==='limited MP')t.mp=50;
 if(fixture==='summon'){t.release='召唤';t.petHP=20;t.bodyHP=50;t.hp=70;t.mp=0;t.petAlive=true;t.petMax=200;t.bodyMax=500;}
 if(fixture==='amplifier'){
  const applied=b.forecastAction(u,t,s,{rolls:Array(20).fill(1)}).branches[0];
  const later=applied.state;later.activeId=u.id;later.unit(u.id).bonusAttack=false;later.unit(u.id).readyAt=later.now;
  s=later.unit(u.id).skills.find(z=>z.dotBuff);const forecast=later.forecastAction(later.unit(u.id),later.unit(u.id),s,{rolls:Array(20).fill(1)});
  assert(forecast.valid);const projected=later.forecastFutureDOT(forecast),after=actualDots(forecast.branches[0]),before=actualDots(forecast.branches[0],true);
  for(const key of ['hp','sh','mp','petHP','bodyHP'])assert.equal(projected.byTarget[t.id][key],after[t.id][key]-before[t.id][key],'DOT amplifier '+key);
  checks.push({label:'future DOT protection '+fixture,passed:true,loss:projected.byTarget[t.id]});continue;
 }
 const forecast=b.forecastAction(u,t,s,{rolls:Array(20).fill(1)}),branch=forecast.branches[0],beforeJSON=JSON.stringify(branch.state);
 const projected=b.forecastFutureDOT(forecast),real=actualDots(branch);
 assert.equal(JSON.stringify(branch.state),beforeJSON,'future DOT must not mutate forecast state');
 for(const key of ['hp','sh','mp','petHP','bodyHP'])assert.equal(projected.byTarget[t.id][key],real[t.id][key],fixture+' future DOT '+key);
 if(fixture==='shield')assert.equal(projected.hp,0);
 if(fixture==='summon')assert.equal(projected.hp,70);
 checks.push({label:'future DOT protection '+fixture,passed:true,loss:projected.byTarget[t.id]});
}
{
 const b=fresh('anmu','anmu'),[u,t]=b.units,s=u.skills.find(s=>s.damageMode==='periodic'),other=t.skills.find(s=>s.damageMode==='periodic');
 b.activeId=t.id;t.progress=1;assert.equal(b.command(t.id,other.id,u.id),'');b.activeId=u.id;u.progress=1;
 const f=b.forecastAction(u,t,s,{rolls:Array(20).fill(1)}),future=b.forecastFutureDOT(f);
 assert.equal(f.branches[0].state.unit(u.id).dots.length,1,'other caster DOT is present');
 assert.equal(future.byTarget[u.id].hp,0,'other caster simultaneous DOT is not attributed to candidate');assert(future.byTarget[t.id].hp>0);
 checks.push({label:'future DOT delta excludes simultaneous opposing caster',passed:true,byTarget:future.byTarget});
}
for(const fixture of ['full shield','one MP','expired shield']){
 const b=fresh('anmu'),[u,t]=b.units,s=u.skills.find(s=>s.damageMode==='periodic');
 const state=b.forecastAction(u,t,s,{rolls:Array(20).fill(1)}).branches[0].state,target=state.unit(t.id);
 if(fixture==='one MP')target.mp=1;else state.addShieldLayer(target,{source:'existing-dot-test',amount:9999,channel:'生命',until:state.now+(fixture==='full shield'?20000:2000)});
 const unchanged=JSON.stringify(state),forecast=state.forecastExistingDOT({horizon:3});assert.equal(JSON.stringify(state),unchanged);
 const real=new B.Battle({snapshot:state.snapshot()});real.scheduleAI=()=>{};for(const unit of real.units)unit.cast=null;
 const start={hp:real.unit(t.id).hp,sh:real.unit(t.id).sh,mp:real.unit(t.id).mp};real.tick(real.now+3000,true);
 for(const key of ['hp','sh','mp'])assert.equal(forecast.byTarget[t.id][key],start[key]-real.unit(t.id)[key],'existing DOT '+fixture+' '+key);
 if(fixture==='full shield')assert.equal(forecast.hp,0);else assert(forecast.hp>0);
 if(fixture==='one MP')assert.equal(forecast.mp,1);
 checks.push({label:'existing DOT protection '+fixture,passed:true,loss:forecast.byTarget[t.id]});
}
const out={passed:true,checks:checks.length,templateCases:matrixCount,averageAttackProjectionMs:timing,items:checks};
const dest=path.resolve(__dirname,'../test-results/projection.json');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out,null,2));
console.log(JSON.stringify({passed:out.passed,checks:out.checks,templateCases:matrixCount,averageAttackProjectionMs:timing}));
