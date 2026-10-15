const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {load}=require('../load.cjs');
const x=load('projection'),B=x.WitnessBattle;
const copy=v=>JSON.parse(JSON.stringify(v));
const checks=[];
function fresh(player='xiaowen',enemy='qinyan'){
 const b=new B.Battle({playerTemplateId:player,enemyId:enemy,testLevel:61,duel:true,seed:'independent-review'});
 b.now=0;b.result=null;b.events=[];b.log=[];b.activeId='player';b.scheduleAI=()=>{};
 for(const u of b.units)Object.assign(u,{cast:null,statuses:[],dots:[],progress:0,readyAt:0,fallen:false,hp:u.model.derived.HP,mp:u.model.derived.MP,sh:u.model.derived.SH,shieldLayers:[],shieldHP:0,shieldSH:0,shieldUntil:0,guard:0,oneHit:false,immuneUntil:0,cooldowns:{},uses:{}});
 b.units[0].progress=1;return b;
}
// Verify the user's precise shield example independently from skill math.
{
 const b=fresh(),t=b.units[0];t.mp=0;
 b.addShieldLayer(t,{source:'ally:gardenia',label:'栀子花露',channel:'生命',amount:547,until:8000});
 b.addShieldLayer(t,{source:'self:mirror',label:'尘镜',channel:'生命',amount:416,oneHit:true,until:8000});
 b.addShieldLayer(t,{source:'self:mind',channel:'精神',amount:200,until:15000});
 const hp=t.hp;b.applyDamage(t,500,'物理',null);
 assert.equal(t.hp,hp);assert.equal(t.shieldHP,463);assert.equal(t.shieldSH,200);
 assert.deepEqual(b.shieldLayersFor(t,'生命').map(q=>[q.source,q.amount]),[['ally:gardenia',463]]);
 b.tick(8001,true);assert.equal(t.shieldHP,0);assert.equal(t.shieldSH,200);
 checks.push({label:'416 mirror consumes before 547 gardenia; overflow 84; mental expires independently',passed:true});
}
// A V13 snapshot with independent serialized resources must survive once only.
{
 const old=load('baseline'),base=new old.WitnessBattle.Battle({playerTemplateId:'xiaowen',enemyId:'qinyan',testLevel:61,duel:true,seed:'legacy-review'});
 const snap=base.snapshot();Object.assign(snap.units[0],{shieldHP:547,shieldSH:291,shieldUntil:8000,guard:0,oneHit:true});
 const before=JSON.stringify(snap),b=new B.Battle({snapshot:snap}),t=b.units[0];
 assert.equal(JSON.stringify(snap),before);assert.equal(t.shieldLayers.length,2);
 t.mp=0;b.applyDamage(t,1,'物理',null);assert.equal(t.shieldHP,0);assert.equal(t.shieldSH,291);
 const restored=new B.Battle({snapshot:b.snapshot()});assert.equal(restored.units[0].shieldLayers.length,1);assert.equal(restored.units[0].shieldSH,291);
 checks.push({label:'V13 shield snapshot imports once; broken life layer cannot resurrect after V14 save/load',passed:true});
}
// Annihilation is per packet rather than per layer. Source weakening precedes it.
{
 const b=fresh(),[t,u]=b.units;t.mp=0;u.soul=copy(u.soul);u.soul.combat_profile={...(u.soul.combat_profile||{}),trait:'annihilation'};
 b.setStatus(u,'damageDown',.4,20,{source:'review'});
 b.addShieldLayer(t,{source:'inner',channel:'生命',amount:100,until:8000});
 b.addShieldLayer(t,{source:'outer',channel:'生命',amount:100,until:8000});
 const before=JSON.stringify(b),out=b.previewProtection(t,500,'物理',u);
 assert.equal(JSON.stringify(b),before);assert.equal(out.beforeShields,390);assert.equal(out.healthDamage,190);
 const hp=t.hp;b.applyDamage(t,500,'物理',u);assert.equal(hp-t.hp,190);
 checks.push({label:'damageDown .4 then annihilation 1.3 once across two layers: 500 -> 390 -> 190 HP',passed:true});
}
// Dispel preserves old aggregate rounding while affecting each existing layer.
{
 const b=fresh(),t=b.units[0];
 for(const [source,amount]of [['inner',101],['outer',102]])b.addShieldLayer(t,{source,channel:'生命',amount,until:8000});
 b.addShieldLayer(t,{source:'mind',channel:'精神',amount:999,until:8000});
 assert.equal(b.dispelShieldLayers(t,.6),122);assert.equal(t.shieldHP,81);assert.equal(t.shieldSH,999);
 assert.deepEqual(b.shieldLayersFor(t,'生命').map(q=>q.amount),[41,40]);
 checks.push({label:'60% dispel removes 122 of 203 life shield, keeps mental shield',passed:true});
}
// Enumerate all d100 outcomes for blood first-strike's separate control roll.
{
 const b=fresh('xiaweiyu'),[u,t]=b.units,s=u.skills[1];b.setStatus(u,'bloodFirstStrike',1,100,{source:'review'});
 const forecast=b.forecastAction(u,t,s),mean={hp:0,mp:0,control:0};
 for(let roll=1;roll<=100;roll++){
   const actual=new B.Battle({snapshot:b.snapshot()});actual.scheduleAI=()=>{};let i=0;actual.rng.die=()=>++i===1?100:roll;
   const au=actual.unit(u.id),at=actual.unit(t.id);assert.equal(actual.command(au.id,s.id,at.id),'');actual.tick(au.cast.end,true);
   mean.hp+=(t.hp-at.hp)/100;mean.mp+=(t.mp-at.mp)/100;mean.control+=(actual.value(at,'control')?1:0)/100;
 }
 assert(Math.abs(forecast.immediate.hp-mean.hp)<1e-8);assert(Math.abs(forecast.immediate.mp-mean.mp)<1e-8);
 const projectedControl=forecast.branches.reduce((n,br)=>n+(br.state.value(br.target,'control')?br.probability:0),0);
 assert(Math.abs(projectedControl-mean.control)<1e-8);
 checks.push({label:'exact probability branches equal all 100 outcomes of independent blood first-strike control',passed:true,mean});
}
// Registered future DOT must use real protection and per-packet integer costs.
for(const kind of ['full-shield','weaken-source','one-mp']){
 const b=fresh('anmu'),[u,t]=b.units,s=u.skills[1];t.mp=kind==='one-mp'?1:0;
 if(kind==='full-shield')b.addShieldLayer(t,{source:'review',channel:'生命',amount:9999,until:180001});
 if(kind==='weaken-source')b.setStatus(u,'damageDown',.4,100,{source:'review'});
 const f=b.forecastAction(u,t,s,{rolls:[1]}),before=JSON.stringify(b),expected=b.forecastFutureDOT(f);
 assert.equal(JSON.stringify(b),before,'future DOT projection remains pure');
 const actual=f.branches[0].state.forkProjectionState(),oldHP=actual.unit(t.id).hp,oldMP=actual.unit(t.id).mp;
 const registeredState=JSON.stringify(f.branches[0].state),registered=f.branches[0].state.forecastExistingDOT({horizon:9});
 assert.equal(JSON.stringify(f.branches[0].state),registeredState,'registered DOT projection remains pure');
 actual.tick(actual.now+9000,true);
 const observed={hp:oldHP-actual.unit(t.id).hp,mp:oldMP-actual.unit(t.id).mp},got=expected.byTarget[t.id];
 assert.equal(got.hp,observed.hp,kind+' protected future HP');assert.equal(got.mp,observed.mp,kind+' protected future MP');
 assert.equal(registered.byTarget[t.id].hp,observed.hp,kind+' registered DOT HP');assert.equal(registered.byTarget[t.id].mp,observed.mp,kind+' registered DOT MP');
 checks.push({label:'future and registered DOT '+kind+' use real protection and source weakening',passed:true,observed});
}
// Two casters completing together must not merge their future DOT attribution.
{
 const b=fresh('anmu','anmu'),[u,t]=b.units,s=u.skills[1];
 b.activeId=t.id;t.progress=1;assert.equal(b.command(t.id,t.skills[1].id,u.id),'');b.activeId=u.id;u.progress=1;
 const f=b.forecastAction(u,t,s,{rolls:[1,1]}),dot=b.forecastFutureDOT(f);
 assert.equal(dot.byTarget[u.id]?.hp||0,0,'opponent DOT is not candidate contribution');
 assert.equal(dot.byTarget[t.id].hp,687);
 checks.push({label:'same-time opposing DOT remains attributed to each caster',passed:true,hp:dot.byTarget[t.id].hp});
}
const crypto=require('crypto');
const modules=Object.fromEntries(['battle-v14-mechanics.js','battle-v14-projection.js'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src',name))).digest('hex')]));
const out={passed:true,modules,checks};
const dest=path.join(__dirname,'../results/review-probes.json');fs.writeFileSync(dest,JSON.stringify(out,null,2));
console.log(JSON.stringify(out));
