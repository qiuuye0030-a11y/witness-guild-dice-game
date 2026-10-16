const {spawnSync}=require('node:child_process'),path=require('node:path');
const cwd=path.resolve(__dirname,'..');
for(const config of [{N:32,mode:'fixed',policy:'random'},{N:32,mode:'fixed',policy:'xpExpected'},{N:32,mode:'natural',policy:'random'},{N:8,mode:'fixed',policy:'random',initial:1,favored:true},{N:8,mode:'fixed',policy:'random',initial:10,favored:true}]){
 const env={...process.env,GROWTH_SAMPLES:String(config.N),GROWTH_MODE:config.mode,GROWTH_POLICY:config.policy,GROWTH_INITIAL:String(config.initial||5),GROWTH_PROFILE:config.favored?'favored':'middle'};
 const r=spawnSync(process.execPath,['tools/calibrate-growth-1008.cjs'],{cwd,env,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);
}
for(const file of ['tools/verify-cultivation-1008.cjs','tools/verify-matrix-1008.cjs']){const r=spawnSync(process.execPath,[file],{cwd,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
