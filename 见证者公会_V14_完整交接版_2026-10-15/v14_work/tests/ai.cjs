const assert=require('assert/strict');
const {performance}=require('perf_hooks');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load}=require('../load.cjs');
const box=load('fixed'),B=box.WitnessBattle,checks=[];
function fresh(id='xiaweiyu',enemy='qinyan',support=false){
  const b=new B.Battle({playerTemplateId:id,enemyId:enemy,testLevel:61,duel:!support,withSupport:support,seed:'v14-ai-regression'});
  b.activeId='player';b.units[0].progress=1;return b;
}
function test(name,fn){const start=performance.now();fn();checks.push({name,passed:true,milliseconds:Math.round(performance.now()-start)});}
function select(b,id,target){const u=b.units[0],t=target||b.units[1];return b.aiScore(u,t,id);}
function clone(v){return JSON.parse(JSON.stringify(v));}
function resolve(b,u,t,skill){
  const forecast=b.forecastAction(u,t,skill,{rolls:Array(40).fill(1)});
  assert(forecast.valid);return forecast.branches[0].state;
}
function simultaneousSelfBuff(){
  const b=fresh('quan','quan'),[u,t]=b.units;b.now=10856;
  for(const v of [u,t]){v.hp=1649;v.mp=1881;v.actions=1;v.uses={'quan-6':1};v.cooldowns={'quan-6':16658};}
  b.activeId=t.id;t.progress=1;assert.equal(b.command(t.id,'quan-2',t.id),'');
  b.activeId=u.id;u.progress=1;return b;
}
test('all 14 examiners share legal candidates, without changing battle or dice',()=>{
  for(const template of B.templates){
    const b=fresh(template.id),u=b.units[0],before=JSON.stringify(b.snapshot()),dice=b.rng.state;
    const candidates=b.aiCandidates(u);assert(candidates.length,template.id);
    for(const c of candidates){assert.equal(b.actionReason(u,c.action),'');assert(b.targetOptions(u,c.action).some(t=>t.id===c.target));assert(Number.isFinite(c.score));}
    assert.equal(JSON.stringify(b.snapshot()),before);assert.equal(b.rng.state,dice);
    assert.equal(b.aiChoice(u).action,candidates[0].action);
  }
});
test('evasion lowers exact attack value and AI chooses the easier identical target',()=>{
  const b=fresh(),[u,t]=b.units,s=u.skills[1];u.skills=[s];
  const evasive=clone(t);evasive.id='evasive';b.units.push(evasive);b.setStatus(evasive,'evasion',.5,100,{source:'test'});
  const plain=select(b,s.id,t),dodged=select(b,s.id,evasive);
  assert(plain.detail.hitProbability>dodged.detail.hitProbability);assert(plain.detail.immediate>dodged.detail.immediate);
  const choices=b.aiCandidates(u).filter(c=>c.action===s.id);assert.equal(choices[0].target,t.id);
});
test('MP-protected surviving target gets no immediate finisher bonus',()=>{
  const b=fresh(),[u,t]=b.units,s=u.skills[1];t.hp=275;
  const score=select(b,s.id);assert.equal(score.detail.knockout,0);
  const real=resolve(b,u,t,s);assert.equal(real.unit(t.id).hp,32);assert(real.alive(real.unit(t.id)));
});
test('normalized dark-priest periodic attack reaches DOT scorer; future DOT is not instant kill',()=>{
  const b=fresh('anmu'),[u,t]=b.units,s=u.skills[1];t.hp=400;
  assert.equal(s.category,'攻击');assert.equal(s.damageMode,'periodic');
  const c=select(b,s.id);assert.equal(c.detail.category,'持续伤害');assert(c.detail.futureDOT>0);assert.equal(c.detail.immediate,0);assert.equal(c.detail.knockout,0);
  assert.notEqual(b.darkActionScore(u,t,s.id,123456),123456);
  assert.equal(b.aiChoice(u).action,s.id);
});
test('aiDisabled is honored in every AI entry, including six-stat effects',()=>{
  const b=fresh('qinyan'),[u,t]=b.units,s=u.skills[5];assert(s.effects.length);s.aiDisabled=true;
  assert(!b.aiCandidates(u).some(c=>c.action===s.id));assert.notEqual(b.aiChoice(u).action,s.id);
  assert.equal(b.aiScore(u,t,s.id),null);assert.equal(b.compactActionScore(u,t,s.id,999),-Infinity);
  assert.equal(b.darkActionScore(u,t,s.id,999),-Infinity);assert.equal(b.scoreControlVariant(u,t,s),-Infinity);
});
test('failed probability discounts benefit but never the already-paid skill cost',()=>{
  const b=fresh('qinyan'),[u,t]=b.units,s=u.skills[5],first=select(b,s.id);
  b.setStatus(t,'statUpP',2,100,{source:'test'});const resisted=select(b,s.id);
  assert(resisted&&first);assert(resisted.detail.successProbability<first.detail.successProbability);
  assert.equal(resisted.detail.paidMP,first.detail.paidMP);assert.equal(resisted.detail.cost,first.detail.cost);
  const miss=b.forecastAction(u,t,s,{rolls:Array(40).fill(100)});assert.equal(miss.branches[0].actor.mp,u.mp-miss.cost);
});
test('no shield is valued against a foe with no affordable offense or paid cast',()=>{
  const b=fresh('qinyan'),[u,t]=b.units;t.skills=[];t.mp=0;
  assert(!b.aiCandidates(u).some(c=>['qinyan-4','defend','defendSH','dodge'].includes(c.action)));
});
test('a paid incoming cast remains a shield threat after enemy mana reaches zero',()=>{
  const b=fresh('qinyan','xiaweiyu'),[u,t]=b.units;t.progress=1;b.activeId=t.id;
  assert.equal(b.command(t.id,t.skills[1].id,u.id),'');t.cast.end=4000;t.mp=0;
  b.activeId=u.id;u.progress=1;
  const shield=select(b,'qinyan-4',u);assert(shield&&shield.detail.effects>0);
});
test('bonus turns allow only a legal basic, and skip when basic cost is unavailable',()=>{
  const b=fresh('qinyan'),u=b.units[0];u.bonusAttack=true;
  assert(b.aiCandidates(u).every(c=>c.action==='attack'));u.mp=0;
  assert.equal(b.aiChoice(u).action,'skipBonus');
});
test('tune remains disabled by real combat rule and no-mana actor returns legal wait',()=>{
  const b=fresh(),u=b.units[0];u.mp=0;u.skills=[];
  assert(b.actionReason(u,'tune'));assert(!b.aiCandidates(u).some(c=>c.action==='tune'));
  // Free defense remains allowed if it prevents damage; otherwise waiting is legal.
  b.units[1].mp=0;b.units[1].skills=[];assert.equal(b.aiChoice(u).action,'wait');assert.equal(b.actionReason(u,'wait'),'');
});
test('mana gift values the ally attack it unlocks and respects its once-per-battle use',()=>{
  const b=fresh('qinyan','qinyan',true),u=b.units[0],ally=b.units.find(v=>v.id==='ally');
  const skill={...clone(u.skills[1]),id:'test-mana',category:'回蓝',Q:30,cost:5,costPercent:undefined};u.skills=[skill];ally.mp=0;
  const c=select(b,skill.id,ally);assert(c&&c.detail.immediate>0);assert(c.detail.effects>0);
  assert.equal(b.aiChoice(u).action,skill.id);u.manaGiftUses=1;
  assert(!b.aiCandidates(u).some(c=>c.action===skill.id));
});
test('poison amplifier values existing enemy DOT despite its friendly cast target',()=>{
  let b=fresh('anmu'),[u,t]=b.units;b=resolve(b,u,t,u.skills[1]);u=b.units[0];t=b.units[1];
  b.activeId=u.id;u.progress=1;u.readyAt=b.now;u.bonusAttack=false;
  const c=select(b,'anmu-3',u);assert(c&&c.detail.futureDOT>0);
});
test('rage gain changes future attack value and spent/maxed skills stay unavailable',()=>{
  const b=fresh('yixing'),[u,t]=b.units;u.skills=u.skills.filter(s=>['yixing-1','yixing-4'].includes(s.id));const c=select(b,'yixing-1');assert(c&&c.detail.effects>0);
  assert(!b.aiCandidates(u).some(c=>c.action==='yixing-4'));u.rage=3;u.uses['yixing-4']=3;
  assert(!b.aiCandidates(u).some(c=>c.action==='yixing-4'));
});
test('self-buff has one continuation value, with no second additive basic award',()=>{
  const b=fresh('qinyan'),u=b.units[0],c=select(b,'qinyan-2',u);assert(c&&c.detail.effects>0);assert.equal(c.detail.bonus,0);
  const forecast=b.forecastAction(u,u,u.skills[1]);assert(forecast.branches.some(br=>br.actor.bonusAttack));
});
test('an expired future swap does not confer permanent dodge value',()=>{
  const b=fresh('qingling'),[u,t]=b.units;b.setStatus(u,'phantomSwapReady',1,.5,{source:'test'});
  const f=b.forecastAction(t,u,t.skills[0],{at:3});assert(f.hitProbability>0);
});
test('DOT value uses actual shield, source reduction and sequential MP consumption',()=>{
  const plain=fresh('anmu'),[u,t]=plain.units;t.mp=0;
  const score=select(plain,'anmu-2');assert(score.detail.futureDOT>0);
  const shield=fresh('anmu');shield.units[1].mp=0;shield.addShieldLayer(shield.units[1],{source:'full',channel:'生命',amount:9999,until:180000});
  assert.equal(select(shield,'anmu-2').detail.futureDOT,0);
  const weakened=fresh('anmu');weakened.units[1].mp=0;weakened.setStatus(weakened.units[0],'damageDown',.4,100,{source:'test'});
  assert(select(weakened,'anmu-2').detail.futureDOT<score.detail.futureDOT*.7);
  const lastMana=fresh('anmu');lastMana.units[1].mp=1;
  assert(select(lastMana,'anmu-2').detail.futureDOT>score.detail.futureDOT*.98);
});
test('compound ice armor values its separate mitigation in addition to stat effects',()=>{
  const full=fresh('xuejidong'),u=full.units[0],complete=select(full,'xuejidong-5',u);
  const stats=fresh('xuejidong');stats.units[0].skills.find(s=>s.id==='xuejidong-5').iceArmor=0;
  const partial=select(stats,'xuejidong-5',stats.units[0]);
  assert(complete);assert(complete.detail.effects>(partial?.detail.effects||0));
});
test('blood domain retains its independent bonuses even when stat debuff is resisted',()=>{
  const b=fresh(),[u,t]=b.units,s=u.skills[5];b.setStatus(t,'statUpP',3,100,{source:'test'});
  const f=b.forecastAction(u,t,s,{rolls:Array(40).fill(100)});
  assert(f.branches[0].actor.statuses.some(x=>x.type==='bloodFirstStrike'));
  assert(f.branches[0].target.statuses.some(x=>x.type==='accuracyDown'));
  assert(select(b,s.id).detail.effects>0);
});
test('shield pressure credit disappears when the layer expires before any follow-up',()=>{
  const lasting=fresh('qinyan');lasting.addShieldLayer(lasting.units[1],{source:'test',channel:'生命',amount:9999,until:180000});
  const a=select(lasting,'qinyan-3');assert(a.detail.shieldPressure>0);
  const short=fresh('qinyan');short.addShieldLayer(short.units[1],{source:'test',channel:'生命',amount:9999,until:2500});
  assert.equal(select(short,'qinyan-3').detail.shieldPressure,0);
});
test('capped soul-control buff does not receive a flat stat-percentage reward',()=>{
  const b=fresh('qinyan','qinyan',true),u=b.units[0],ally=b.units.find(v=>v.id==='ally');
  const skill={...clone(u.skills[1]),id:'test-capped-control',effects:[{key:'C',value:.2}],buff:0,agility:0};u.skills=[skill];ally.skills=[];
  b.setStatus(ally,'statUpC',10,180,{source:'already-capped'});
  const before=b.effective(ally),projected=b.forecastAction(u,ally,skill),after=projected.branches[0].state.effective(projected.branches[0].target);
  assert.equal(after.costReduction,before.costReduction);assert.equal(after.castReduction,before.castReduction);
  assert.equal(select(b,skill.id,ally),null);
});
test('same-source permanent ally buff refresh does not invent new full-battle gain',()=>{
  let b=fresh('qinyan','qinyan',true),u=b.units[0],ally=b.units.find(v=>v.id==='ally');
  b=resolve(b,u,ally,u.skills[1]);u=b.units[0];ally=b.unit(ally.id);u.progress=1;u.readyAt=b.now;b.activeId=u.id;u.cooldowns={};
  assert.equal(select(b,'qinyan-2',ally),null);
});
test('equivalent completed-action timing cannot reward mental defense against only physical attacks',()=>{
  const b=simultaneousSelfBuff(),u=b.units[0];
  assert.equal(select(b,'defendSH',u),null);
  assert.equal(b.aiChoice(u).action,'quan-4');
});
test('enemy self-buff target does not hide its following affordable bonus attack threat',()=>{
  const b=simultaneousSelfBuff(),[u,t]=b.units;
  assert.equal(t.cast.target,t.id);assert.equal(t.cast.skill.category,'强化');
  const physical=select(b,'defend',u);assert(physical&&physical.detail.effects>0);
  const forecast=b.forecastAction(u,u,'defend'),post=forecast.branches[0].state;
  const enemy=post.unit(t.id),ready=post.forecastAdvance((enemy.cast.end-post.now)/1000).branches[0].state;
  assert(ready.unit(t.id).bonusAttack);assert(ready.unit(t.id).mp>=ready.basicCost(ready.unit(t.id)));
});
test('controlled bonus opportunity resumes after control instead of erasing the entire future threat',()=>{
  const b=simultaneousSelfBuff(),[u,t]=b.units,control=select(b,'quan-5');
  const branch=b.forecastAction(u,t,'quan-5',{rolls:Array(40).fill(1)}).branches[0];
  assert(branch.target.bonusAttack);const until=Math.max(...branch.target.statuses.filter(s=>s.type==='control').map(s=>s.until));
  const resumed=branch.state.forecastAction(branch.target,branch.actor,'attack',{at:(until-branch.state.now)/1000});
  assert(resumed.valid);assert(resumed.immediate.hp>0);
  assert(control&&control.detail.effects>0);assert(control.score<select(b,'quan-4').score);
});
test('four-unit full candidate evaluation fits interactive play budget',()=>{
  const b=fresh('hash','qinyan',true),start=performance.now(),choice=b.aiChoice(b.units[0]);
  const duration=performance.now()-start;assert(choice);assert(duration<3000,'four-unit decision '+duration+'ms');
  checks.push({name:'four-unit performance',milliseconds:Math.round(duration),forecasts:b._lastAIv14.forecasts,choice});
});
const sourcePath=path.resolve(__dirname,'../src/battle-v14-ai.js'),sourceSHA256=crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
const result={version:14,sourceSHA256,passed:checks.filter(c=>c.passed).length,checks};
const output=path.resolve(__dirname,'../results');fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'ai-results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(process.argv.includes('--benchmark')){
  const summary=rows=>{const sorted=rows.map(r=>r.milliseconds).sort((a,z)=>a-z);return {decisions:rows.length,meanMS:rows.reduce((n,r)=>n+r.milliseconds,0)/rows.length,p95MS:sorted[Math.ceil(sorted.length*.95)-1],maxMS:sorted.at(-1),meanForecasts:rows.reduce((n,r)=>n+r.forecasts,0)/rows.length,rows};};
  const bench=(id,support)=>{const b=fresh(id,'qinyan',support),start=performance.now(),choice=b.aiChoice(b.units[0]);return {id,milliseconds:performance.now()-start,forecasts:b._lastAIv14.forecasts,choice};};
  for(let i=0;i<2;i++)for(const t of B.templates)bench(t.id,false);
  const duels=[];for(let i=0;i<5;i++)for(const t of B.templates)duels.push(bench(t.id,false));
  for(let i=0;i<2;i++)bench('hash',true);
  const parties=[];for(let i=0;i<10;i++)parties.push(bench('hash',true));
  const benchmark={sourceSHA256,node:process.version,singleProcess:true,warmup:'2 rounds of all 14 duel templates; 2 four-unit decisions',scenario:'Level 61, first legal action, full resources and legal skills; constructors excluded',duel:summary(duels),fourUnit:summary(parties)};
  fs.writeFileSync(path.join(output,'ai-microbenchmark.json'),JSON.stringify(benchmark,null,2));
  console.log(JSON.stringify({benchmark:{duel:{...benchmark.duel,rows:undefined},fourUnit:{...benchmark.fourUnit,rows:undefined}}},null,2));
}
