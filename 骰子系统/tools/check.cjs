const {spawnSync}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const file of ['tools/verify-matrix-1008.cjs','tools/verify-cultivation-1008.cjs','tools/verify-new-1008.cjs','tools/verify-1008.cjs','tools/verify-growth-1008.cjs','tools/verify-achievements-1008.cjs','tools/verify-quests-1008.cjs']){const r=spawnSync(process.execPath,[file],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
console.log('10.08 mechanism, growth/reload, hidden achievement and quest-chain checks passed.');
