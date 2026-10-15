const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),handover=path.resolve(root,'../见证者公会_V14_完整交接版_2026-10-15');
const migrated=require('./runtime-1006.cjs'),frozen=require(path.join(handover,'v14_work/load.cjs'));
const out=path.join(root,'output/1006-migration');fs.mkdirSync(out,{recursive:true});
// Run the unchanged assertion bodies against the canonical runtime. Output paths
// and source-fingerprint paths are redirected, never written over frozen evidence.
for(const name of ['mechanics','projection','ai','review-probes','review-ai-v2-regressions']){
 const file=path.join(handover,'v14_work/tests',name+'.cjs');let source=fs.readFileSync(file,'utf8');
 source=source.replace("const projectRoot = path.resolve(__dirname, '../..');",'const projectRoot = '+JSON.stringify(handover)+';');
 const customRequire=id=>id==='../load.cjs'?{load:mode=>mode==='baseline'?frozen.load(mode):migrated.load()}:require(id);
 const virtualDir=path.join(out,'tests');fs.mkdirSync(virtualDir,{recursive:true});
 const srcDir=path.join(out,'src');fs.mkdirSync(srcDir,{recursive:true});
 fs.mkdirSync(path.join(out,'results'),{recursive:true});
 fs.copyFileSync(path.join(handover,'v14_work/results/ai-loss-diagnostics.json'),path.join(out,'results/ai-loss-diagnostics.json'));
 for(const [old,current]of [['battle-v14-ai.js','unified-decision.js'],['battle-v14-mechanics.js','shields.js'],['battle-v14-projection.js','projection.js']])fs.copyFileSync(path.join(root,'systems/battle',current),path.join(srcDir,old));
 new Function('require','__dirname','__filename','process',source)(customRequire,virtualDir,file,process);
}
const a=frozen.load('fixed'),b=migrated.load();let games=0,steps=0;
for(const level of [41,51,61])for(const member of a.WitnessBattle.templates){
 const options={playerTemplateId:member.id,enemyId:'qinyan',testLevel:level,duel:true,seed:'migration-'+member.id+'-'+level};
 const x=new a.WitnessBattle.Battle(options),y=new b.WitnessBattle.Battle(options);
 for(let i=0;i<180&&!x.result;i++){
  x.tick(x.now+1000,true);y.tick(y.now+1000,true);
  const clean=v=>JSON.parse(JSON.stringify(v));
  assert.deepEqual(clean(y.snapshot()),clean(x.snapshot()),member.id+' '+level+' '+x.now);steps++;
 }
 assert.deepEqual(y.result,x.result);games++;
}
fs.writeFileSync(path.join(out,'paired.json'),JSON.stringify({passed:true,games,steps},null,2));
console.log('V14 migration paired validation',games,steps);
