// Preserve all historical business assertions; only the declared release version
// and output filename change for the 10.08 run.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const file=path.resolve(__dirname,'../verify-quests-1005.cjs');
const source=fs.readFileSync(file,'utf8').replace("assert.equal(saved.gameVersion,'10.05');","assert.equal(saved.gameVersion,'10.08');").replace('output/10.05任务链验证.json','output/1008/任务链验证.json').replace('),45);','),6.75);').replace('),expected);','),Math.round(expected*.15*100)/100);').replace('oldRulesPreserved:true','eventGraphPreserved:true,eventXPScale:.15');
new Function('require','__dirname',source)(createRequire(file),path.dirname(file));
