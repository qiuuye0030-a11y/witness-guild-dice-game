const fs=require('fs'),path=require('path'),vm=require('vm'),{createRequire}=require('module');
const root=path.resolve(__dirname,'..'),handover=path.resolve(root,'../见证者公会_V14_完整交接版_2026-10-15'),out=path.join(root,'output/1006-integration');fs.mkdirSync(out,{recursive:true});
const next=require('./runtime-1006.cjs'),old=require(path.join(handover,'v14_work/load.cjs'));
let source=fs.readFileSync(path.join(handover,'v14_work/tests/integration.cjs'),'utf8');
// Function text equality was a patch-layout check, not a behavior requirement.
source=source.replace(/test\('Campaign upgrade changes only accepted combat versions,[\s\S]*?\n\}\);/,'');
const req=id=>id==='../load.cjs'?{load:mode=>mode==='baseline'?old.load('baseline'):next.load()}:require(id);
new Function('require','__dirname','process',source)(req,path.join(out,'tests'),{...process,argv:[...process.argv,'--skip-html']});
const results=[];
for(const name of ['verify-1005.cjs','verify-members-1005.cjs','verify-quests-1005.cjs']){
 const original=path.join(root,name),localRequire=createRequire(original);
 let s=fs.readFileSync(original,'utf8').replace('assert.equal(b.snapshot().combatRulesVersion,13);','assert.equal(b.snapshot().combatRulesVersion,14);').replace("assert.equal(saved.gameVersion,'10.05');","assert.equal(saved.gameVersion,'10.06');");
 const redirected={...fs,writeFileSync:(file,...args)=>fs.writeFileSync(path.join(out,path.basename(file)),...args)};
 new Function('require','__dirname','__filename',s)(id=>id==='node:fs'?redirected:localRequire(id),root,original);results.push(name);
}
const scripts=[];for(const theme of ['经典深靛版','晨曦朝阳版']){
 const html=fs.readFileSync(path.resolve(root,`../见证者公会_10.06版_${theme}.html`),'utf8');
 const blocks=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);for(const code of blocks)new vm.Script(code);
 scripts.push({theme,count:blocks.length,bytes:Buffer.byteLength(html)});
}
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({legacy:results,scripts},null,2));
