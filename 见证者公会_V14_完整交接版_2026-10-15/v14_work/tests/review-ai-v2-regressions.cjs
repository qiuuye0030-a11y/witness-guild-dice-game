const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const {load}=require('../load.cjs');
const x=load('fixed'),candidate=process.argv.includes('--candidate');
const source=path.join(__dirname,candidate?'../experiments/battle-ai-candidate.js':'../src/battle-v14-ai.js');
if(candidate)new Function('window','globalThis',fs.readFileSync(source,'utf8'))(x,x);
const B=x.WitnessBattle,checks=[];
function fresh(){
 const b=new B.Battle({playerTemplateId:'xiaowen',enemyId:'xuejidong',testLevel:61,duel:true,seed:'review-v2-threat'});
 b.now=0;b.result=null;b.events=[];b.log=[];b.activeId='player';b.scheduleAI=()=>{};
 for(const u of b.units)Object.assign(u,{cast:null,statuses:[],dots:[],progress:0,readyAt:0,fallen:false,hp:u.model.derived.HP,mp:u.model.derived.MP,sh:u.model.derived.SH,shieldLayers:[],shieldHP:0,shieldSH:0,shieldUntil:0,guard:0,oneHit:false,immuneUntil:0,cooldowns:{},uses:{}});
 b.units[0].progress=1;return b;
}
// Authentic V1 loss state: neither side has a mental attack. Spending a turn on
// mental defense cannot produce the previously reported 30.78 offense benefit.
{
 const report=JSON.parse(fs.readFileSync(path.join(__dirname,'../results/ai-loss-diagnostics.json'),'utf8'));
 const game=report.games.find(g=>g.id==='quan:61:0:0'),snap=game.snapshots.find(s=>s.decision===3).snapshot;
 assert.equal(snap.now,10856);
 const b=new B.Battle({snapshot:snap}),u=b.unit('player'),before=JSON.stringify(b);
 const score=b.aiScore(u,u,'defendSH');assert.equal(JSON.stringify(b),before);
 assert.equal(score,null,'no phantom offense gain from mental defense and mismatched cooldown gate');
 const buff=u.skills.find(s=>s.id==='quan-2'),f=b.forecastAction(u,u,buff);
 assert(f.valid);assert(f.branches.some(br=>br.actor.bonusAttack),'real self-buff bonus must remain in post state');
 assert(f.branches.some(br=>br.state.value(br.actor,'attackBoost')>0),'real stat buff must remain in post state');
 const buffScore=b.aiScore(u,u,buff.id);assert(buffScore&&buffScore.detail.effects>0,'neutral baseline must not erase real buff and bonus value');
 checks.push({label:'real quan 10.856s fixture: false mental-defense gain removed; real bonus/stat buff retained',passed:true,defendSH:score,buffScore:buffScore.score});
}
// A foe preparing a self buff has a real bonus basic attack against us after
// completion; its friendly current target must not remove that threat pair.
{
 const b=fresh(),[u,t]=b.units,s=t.skills.find(s=>s.id==='xuejidong-3');
 b.activeId=t.id;t.progress=1;assert.equal(b.command(t.id,s.id,t.id),'');b.activeId=u.id;u.progress=1;
 const enemyDone=t.cast.end,score=b.aiScore(u,u,'defend'),mental=b.aiScore(u,u,'defendSH');
 assert(score&&score.detail.effects>0,'life defense must value impending enemy bonus basic attack');
 assert.equal(mental,null,'enemy life attacks do not create a mental-defense benefit');
 function actual(action){
   const a=new B.Battle({snapshot:b.snapshot()});a.scheduleAI=()=>{};a.rng.die=()=>1;
   const au=a.unit(u.id),at=a.unit(t.id),hp=au.hp;
   assert.equal(a.command(au.id,action,au.id),'');a.tick(enemyDone,true);
   assert(at.bonusAttack,'known self buff grants bonus');a.activeId=at.id;
   assert.equal(a.command(at.id,'attack',au.id),'');a.tick(at.cast.end,true);
   return hp-au.hp;
 }
 const unprotected=actual('wait'),protectedLoss=actual('defend');assert(protectedLoss<unprotected);
 checks.push({label:'opponent self-buff remains a threat; life defense has observed HP value',passed:true,effects:score.detail.effects,unprotected,protectedLoss});
}
const out={passed:true,checks,sourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),candidate};
fs.writeFileSync(path.join(__dirname,'../results/review-ai-v2-regressions'+(candidate?'-candidate':'')+'.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
