/* Existing regression gates against the new runtime; only version assertion changes. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {load}=require('../load.cjs');
const root=path.resolve(__dirname,'../..');
const sourceDir=path.join(root,'v14_review/package/V14战斗系统优化_跨电脑交接_2026-10-15/骰子系统');
const out=path.resolve(__dirname,'../results/legacy');
fs.mkdirSync(path.join(out,'output'),{recursive:true});
const mode=process.argv[2]||'fixed';
const previousCwd=process.cwd();
const results=[];
try {
  process.chdir(out);
  for(const file of ['verify-1005.cjs','verify-members-1005.cjs','verify-quests-1005.cjs']) {
    const box=load(mode),originalPath=path.join(sourceDir,file),req=createRequire(originalPath);
    let source=fs.readFileSync(originalPath,'utf8');
    if(mode!=='baseline')source=source.replace('assert.equal(b.snapshot().combatRulesVersion,13);','assert.equal(b.snapshot().combatRulesVersion,14);');
    const runtime={...box,WitnessRules:box.WitnessV13Rules};
    const readRelative={...fs,readFileSync:(p,...args)=>fs.readFileSync(typeof p==='string'&&!path.isAbsolute(p)?path.join(sourceDir,p):p,...args)};
    const customRequire=name=>name==='./v13-runtime.cjs'?runtime:/^\.\/campaign(?:\.js)?$/.test(name)?box.WitnessCampaign:name==='node:fs'?readRelative:req(name);
    const start=performance.now();
    const fn=vm.runInThisContext('(function(require,module,exports,__dirname,__filename){'+source+'\n})',{filename:originalPath});
    const module={exports:{}};
    fn(customRequire,module,module.exports,sourceDir,originalPath);
    results.push({file,passed:true,milliseconds:Math.round(performance.now()-start)});
  }
} finally {process.chdir(previousCwd);}
fs.writeFileSync(path.join(out,'regression-summary.json'),JSON.stringify({mode,results,adaptation:'Only expected combatRulesVersion changed from 13 to 14; original assertions retained.'},null,2));
console.log(JSON.stringify({mode,passed:results.length,results}));
