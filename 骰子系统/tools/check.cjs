// Portable checks: Node built-ins only. Optional browser tests are separate.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'output'),{recursive:true});
for(const file of ['verify-structure.cjs','verify-1005.cjs','verify-members-1005.cjs','verify-quests-1005.cjs','verify-refactor-battle.cjs','verify-refactor-campaign.cjs']){
 const result=spawnSync(process.execPath,[file],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
console.log('All structural, regression and paired baseline checks passed.');
