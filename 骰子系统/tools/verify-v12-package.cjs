'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'v12.05.03版双前端分享/资料与校验/构建清单.json'),'utf8')),results=[];
for(const [edition,record] of Object.entries(manifest.editions)){
 const file=record.file,bytes=fs.readFileSync(file),html=bytes.toString('utf8');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),record.sha256);
 assert(!/<(?:script|link)\b[^>]+(?:src|href)\s*=\s*["']https?:\/\//i.test(html));
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);assert(scripts.length>10);
 scripts.forEach((script,i)=>new vm.Script(script,{filename:edition+'-script-'+i+'.js'}));
 for(const needle of ['campChallengesButton','campBeastsButton','campEnemyCategory','settleManualExhaustion','万象皆证','可以找作者实现一个愿望。','achievement-platinum','v12HuntTarget','v12-bone-copy','v12SelectTarget','讨伐之战。','直接体验 · 讨伐之战','继续结算战利品','witness-complete-game-v12','霜苔巨蛙','startHuntTest:','v12Pulse','WitnessV12Effects','再次挑战 · 剩余','讨伐无时限','聚能','WitnessV12Reports','显示更多','霜域·寒冰','已读'])assert(html.includes(needle),edition+' missing '+needle);
 assert(html.indexOf('root.WitnessV12UI=')<html.indexOf('function v12Context()'));
 assert(html.includes('body.campaign-battle #battleStage{display:block}'));
 const shared=path.join(root,'v12.05.03版双前端分享',edition+'.html');assert.equal(fs.readFileSync(shared,'utf8'),html);
 results.push({edition,scriptsCompiled:scripts.length,sha256:record.sha256,bytes:bytes.length});
}
for(const [file,hash] of Object.entries(manifest.sources)){const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'骰子系统',file))).digest('hex');assert.equal(actual,hash,'source changed after build: '+file);}
const top=fs.readdirSync(path.join(root,'v12.05.03版双前端分享')).sort();assert.deepEqual(top,['v12.05.03_更新说明.md','晨曦朝阳版.html','经典深靛版.html','资料与校验'].sort());
const report={passed:true,visualReview:false,externalAssets:false,gameVersion:manifest.gameVersion,results};fs.writeFileSync(path.join(__dirname,'../output/v12/离线包核对.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
