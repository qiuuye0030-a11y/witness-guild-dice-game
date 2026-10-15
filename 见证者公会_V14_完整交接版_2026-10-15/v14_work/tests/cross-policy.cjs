// Matched-template policy comparison. Actual resolution is always V14.
// Only the policy used by the old side is evaluated on an isolated V14 state
// whose prototype is the mechanics-only (legacy AI/prediction) prototype.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const {performance}=require('perf_hooks'),{load}=require('../load.cjs');
const args=new Set(process.argv.slice(2));
const output=process.env.CROSS_POLICY_OUTPUT||'cross-policy';
if(!/^[a-z0-9-]+$/i.test(output))throw Error('Unsafe output stem');
const dir=path.join(__dirname,'../results');fs.mkdirSync(dir,{recursive:true});
const jsonl=path.join(dir,output+'.jsonl'),manifestFile=path.join(dir,output+'.manifest.json');
const sourceModules=['battle-v14-mechanics.js','battle-v14-projection.js','battle-v14-ai.js'];
const hashModules=()=>Object.fromEntries(sourceModules.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src',name))).digest('hex')]));
const modules=hashModules();
const fixed=load('fixed'),legacy=load('mechanics');
const newProto=fixed.WitnessBattle.Battle.prototype,oldProto=legacy.WitnessBattle.Battle.prototype;
const newAI=newProto.aiChoice,oldAI=oldProto.aiChoice;
const seedArgument=process.argv.indexOf('--seed-start');
const seedStart=seedArgument<0?0:Number(process.argv[seedArgument+1]);
if(!Number.isInteger(seedStart)||seedStart<0||seedStart>1000000)throw Error('seed-start must be a nonnegative integer no greater than 1000000');
const levels=args.has('--smoke')?[61]:[41,51,61],seeds=args.has('--smoke')?[seedStart]:[seedStart,seedStart+1];
const templates=args.has('--smoke')?fixed.WitnessBattle.templates.slice(0,1):fixed.WitnessBattle.templates;
const plan=[];
for(const template of templates)for(const level of levels)for(const seedIndex of seeds)for(const newSide of [0,1])plan.push({
 id:[template.id,level,seedIndex,newSide].join(':'),templateId:template.id,name:template.name,level,seedIndex,newSide,
 seed:['v14-cross-policy',template.id,level,seedIndex].join('|')
});
const manifest={design:'same template / same level / V14 mechanics; fixed AI vs mechanics-only legacy AI on isolated fork',modules,plannedGames:plan.length,levels,seeds,plan};
if(args.has('--plan')){console.log(JSON.stringify({plannedGames:plan.length,levels,seeds,modules}));process.exit(0);}
if(fs.existsSync(manifestFile)){
 const prior=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 assert.deepEqual(prior.modules,modules,'Module changed: use a new output stem or explicitly archive the prior run');
 assert.deepEqual(prior.plan,plan,'Plan changed');
}else fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));
const rows=fs.existsSync(jsonl)?fs.readFileSync(jsonl,'utf8').trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)):[];
const finished=new Set(rows.map(row=>row.id));
const publicState=b=>JSON.stringify(b,(key,value)=>key.startsWith('_')||typeof value==='function'?undefined:value);
const started=performance.now();
for(const item of plan){
 if(finished.has(item.id))continue;
 const b=new fixed.WitnessBattle.Battle({playerTemplateId:item.templateId,enemyId:item.templateId,testLevel:item.level,duel:true,difficulty:'standard',seed:item.seed});
 const metrics={fixed:{calls:0,ms:0,maxMs:0,samples:[]},legacy:{calls:0,ms:0,maxMs:0,samples:[]}};
 let purityChecks=0;
 b.aiChoice=function(u){
   const modern=u.team===item.newSide,key=modern?'fixed':'legacy',m=metrics[key];
   const inspect=m.calls===0,before=inspect?publicState(this):null,at=performance.now();let choice;
   if(modern)choice=newAI.call(this,u);
   else {
     const fork=this.forkProjectionState();Object.setPrototypeOf(fork,oldProto);
     if(inspect){assert.equal(fork.aiChoice,oldAI);assert.equal(fork.aiStrike,oldProto.aiStrike);assert.notEqual(fork.aiStrike,newProto.aiStrike);}
     // Deliberately take the legacy method, and ensure every dynamic helper
     // call also resolves to the legacy prototype rather than the fixed one.
     choice=oldAI.call(fork,fork.unit(u.id));
   }
   const ms=performance.now()-at;m.calls++;m.ms+=ms;m.maxMs=Math.max(m.maxMs,ms);m.samples.push(ms);
   if(inspect){assert.equal(publicState(this),before,item.id+' '+key+' must preserve real state/RNG');purityChecks++;}
   if(choice){assert.equal(this.actionReason(u,choice.action),'',item.id+' '+key+' legal action');assert(this.targetOptions(u,choice.action).some(t=>t.id===choice.target),item.id+' '+key+' legal target');}
   return choice;
 };
 const at=performance.now();b.tick(180000,true);assert(b.result,'Battle completed');
 const row={...item,winner:b.result.winner,newWin:b.result.winner===item.newSide,draw:b.result.winner===null,reason:b.result.reason,tieBreak:b.result.tieBreak||null,timeout:b.now>=180000,adjudicated:!!b.result.tieBreak||b.now>=180000,combatMs:b.now,wallMs:performance.now()-at,purityChecks,
   metrics:Object.fromEntries(Object.entries(metrics).map(([k,m])=>{const sorted=m.samples.sort((a,z)=>a-z);return[k,{calls:m.calls,totalMs:m.ms,averageMs:m.ms/Math.max(1,m.calls),p95Ms:sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]||0,maxMs:m.maxMs}];})),
   final:b.units.map(u=>({id:u.id,team:u.team,hp:u.hp,sh:u.sh,mp:u.mp,actions:u.actions,uses:u.uses}))};
 rows.push(row);finished.add(item.id);fs.appendFileSync(jsonl,JSON.stringify(row)+'\n');
 if(rows.length%4===0||rows.length===plan.length)console.log(JSON.stringify({completed:rows.length,total:plan.length,newWins:rows.filter(r=>r.newWin).length,elapsedSeconds:(performance.now()-started)/1000,last:item.id}));
}
function summarize(items){
 const wins=items.filter(r=>r.newWin).length,draws=items.filter(r=>r.winner===null).length;
 return {games:items.length,newWins:wins,oldWins:items.filter(r=>r.winner!==null&&!r.newWin).length,draws,newWinRate:items.length?wins/items.length:0,
   adjudications:items.filter(r=>r.adjudicated).length,timeouts:items.filter(r=>r.timeout).length,
   meanCombatSeconds:items.reduce((n,r)=>n+r.combatMs,0)/Math.max(1,items.length)/1000,
   totalWallSeconds:items.reduce((n,r)=>n+r.wallMs,0)/1000,
   averageFixedDecisionMs:items.reduce((n,r)=>n+r.metrics.fixed.totalMs,0)/Math.max(1,items.reduce((n,r)=>n+r.metrics.fixed.calls,0)),
   averageLegacyDecisionMs:items.reduce((n,r)=>n+r.metrics.legacy.totalMs,0)/Math.max(1,items.reduce((n,r)=>n+r.metrics.legacy.calls,0))};
}
const endModules=hashModules(),sourcesUnchanged=JSON.stringify(modules)===JSON.stringify(endModules);
const out={...manifest,endModules,sourcesUnchanged,complete:rows.length===plan.length&&sourcesUnchanged,overall:summarize(rows),byLevel:Object.fromEntries(levels.map(level=>[level,summarize(rows.filter(r=>r.level===level))])),byTemplate:templates.map(t=>({id:t.id,name:t.name,...summarize(rows.filter(r=>r.templateId===t.id))})),
 interpretation:'Matched-template policy diagnostic; 2 seed pairs per level. Swapped sides and repeated templates are paired, not independent observations. This is not the guild relative-win-rate table.'};
fs.writeFileSync(path.join(dir,output+'.summary.json'),JSON.stringify(out,null,2));
assert(sourcesUnchanged,'Sources changed during run: results describe start modules only and are not a final frozen comparison');
console.log(JSON.stringify({complete:out.complete,overall:out.overall}));
