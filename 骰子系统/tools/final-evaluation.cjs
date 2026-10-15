const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),handover=path.resolve(root,'../见证者公会_V14_完整交接版_2026-10-15');
const out=path.join(root,'output/1006-final');fs.mkdirSync(out,{recursive:true});
const file=path.join(handover,'v14_work/tests/compare.cjs');
let source=fs.readFileSync(file,'utf8');source=source.slice(0,source.indexOf('async function main()'));
source=source.replace("offset=o.partition==='development'?0:10",'offset=o.offset??20');
const api=new Function('require','__dirname','__filename',source+';return {plan,fight,summarizeMode,compareRows};')(require,path.dirname(file),file);
const options={label:'1006-final-frozen',partition:'holdout',offset:20,perStyle:2,campaignReps:1,robinReps:1,teamReps:1,levels:[41,51,61],suites:['campaign','robin','team'],limit:0};
const p=api.plan(options);for(const c of p.cases)c.seed='1006-final-new-'+c.seed;
p.metadata.characterOffset=20;p.metadata.seeds='1006-final-new- prefix';p.metadata.protocol.push('Current frozen V14 is the baseline, not V13. New character indices start at offset 20 per style; previous development and holdout used 0..19.');
const mode=process.argv[2]||'final';
const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');
if(mode==='summary'){
 const read=m=>fs.readFileSync(path.join(out,m+'.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const before=read('baseline'),after=read('final');
 if(before.length!==p.cases.length||after.length!==p.cases.length)throw Error('incomplete final matrix');
 const comparison=api.compareRows(before,after);
 const differences=after.filter((r,i)=>JSON.stringify([r.result,r.units])!==JSON.stringify([before[i].result,before[i].units])).map(r=>r.key);
 fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify({casesPerVersion:p.cases.length,total:before.length+after.length,differences,comparison},null,2));
 console.log({total:before.length+after.length,differences:differences.length});process.exit();
}
const manifestPath=path.join(out,mode+'.manifest.json'),rowsPath=path.join(out,mode+'.jsonl');
const sourceHash=mode==='baseline'?JSON.parse(fs.readFileSync(path.join(handover,'handover-state.json'))).modules:sha(fs.readFileSync(path.join(root,'battle-v13-browser.js')));
const manifest={mode,source:sourceHash,plan:p.metadata,planHash:sha(JSON.stringify(p.cases)),harnessHash:sha(fs.readFileSync(__filename))};
if(fs.existsSync(manifestPath)&&JSON.stringify(JSON.parse(fs.readFileSync(manifestPath)))!==JSON.stringify(manifest))throw Error('Source or plan changed: use a new output label');
fs.writeFileSync(manifestPath,JSON.stringify(manifest));
const box=mode==='baseline'?require(path.join(handover,'v14_work/load.cjs')).load('fixed'):require('./runtime-1006.cjs').load();
const rows=fs.existsSync(rowsPath)?fs.readFileSync(rowsPath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
for(const c of p.cases.slice(rows.length)){
 const row=api.fight(box.WitnessBattle,c,p.cohort,{current:null});rows.push(row);fs.appendFileSync(rowsPath,JSON.stringify(row)+'\n');
 if(rows.length%25===0)console.log(mode,rows.length,p.cases.length,c.key);
}
const summary=api.summarizeMode(rows,{...manifest,status:'completed'});
summary.overallAdjudicated=rows.filter(r=>r.adjudicated||r.timeout).length;
fs.writeFileSync(path.join(out,mode+'.summary.json'),JSON.stringify(summary,null,2));console.log('completed',mode,rows.length);
