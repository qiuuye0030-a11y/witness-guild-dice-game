'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const tests=['tools/verify-rating-curve.cjs','tools/verify-scarred-challenge.cjs','tools/verify-v1101.cjs','tools/verify-trait-card-v11.cjs','tools/verify-v11.cjs','tools/verify-merged-v11.cjs','tools/verify-edges-v11.cjs','tools/verify-journey-v11.cjs','tools/verify-naming-v11.cjs','tools/verify-quests-v11.cjs','tools/verify-growth-1008.cjs','tools/verify-achievements-1008.cjs','tools/verify-cultivation-1008.cjs','systems/traits/test.cjs','systems/traits/test-balance.cjs'];
fs.mkdirSync(path.join(root,'output/1008/数值回调验算'),{recursive:true});const rows=[];
for(const test of tests){const r=spawnSync(process.execPath,[test],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});console.log(test+' '+(r.status===0?'PASS':'FAIL'));rows.push({test,passed:r.status===0,output:r.stdout,errors:r.stderr});if(r.status!==0){console.error(r.stdout,r.stderr);break;}}
fs.writeFileSync(path.join(root,'output/v11/最终回归.json'),JSON.stringify({gameVersion:'v11.01',budgetVersion:3,passed:rows.length===tests.length&&rows.every(r=>r.passed),tests:rows,visualBrowserQA:false},null,2));
if(rows.length!==tests.length||rows.some(r=>!r.passed))process.exitCode=1;
