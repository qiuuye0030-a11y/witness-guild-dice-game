// Portable checks: Node built-ins only. Optional browser tests are separate.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'output'),{recursive:true});
for(const file of ['verify-structure.cjs','tools/verify-achievements-1006.cjs','tools/verify-integration-1006.cjs','tools/verify-v14-migration.cjs']){
 const result=spawnSync(process.execPath,[file],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
console.log('10.06: structure, hidden achievements, integration, legacy behavior and frozen V14 paired checks passed.');
