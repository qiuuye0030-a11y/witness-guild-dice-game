'use strict';
// Read-only game verification: runs the current engine and writes a separate report.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{load}=require('./runtime-1008.cjs');
const x=load(),out=path.join(__dirname,'../output/v11'),rows=[];
const engineSHA256=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../battle-engine-v13-player.js'))).digest('hex');
const reportFile=path.join(out,'秦衍当前版本胜率.json');
const group=rs=>Object.fromEntries(['off','on'].map(mode=>[mode,{n:rs.length,wins:rs.filter(r=>r[mode].winner===0).length,winRate:rs.filter(r=>r[mode].winner===0).length/rs.length,meanSeconds:rs.reduce((n,r)=>n+r[mode].seconds,0)/rs.length,ownProcs:rs.reduce((n,r)=>n+r[mode].ownProcs,0),enemyProcs:rs.reduce((n,r)=>n+r[mode].enemyProcs,0)}]));
function save(complete=false){const report={complete,engineSHA256,legacyGenericPassives:false,method:'当前已删除旧通用被动的v11，秦衍对其余15名普通会员；41/61/81级、每对阵一个固定配对种子。双方同级，普通对战；辅助对手按游戏实际规则组对称2v2，其余1v1。关闭/双方开启新特性分别实算，不复用旧结果。自动AI，180秒裁判规则保留。',overall:group(rows),byLevel:Object.fromEntries([41,61,81].map(l=>[l,group(rows.filter(r=>r.level===l))])),byTeam:Object.fromEntries([1,2].map(n=>[n,group(rows.filter(r=>r.teamSize===n))])),lossToWin:rows.filter(r=>r.off.winner===1&&r.on.winner===0).length,winToLoss:rows.filter(r=>r.off.winner===0&&r.on.winner===1).length,rows};fs.writeFileSync(reportFile,JSON.stringify(report,null,2));return report;}
for(const level of [41,61,81])for(const enemy of x.WitnessTemplates.filter(t=>t.id!=='qinyan')){
 const row={level,enemyId:enemy.id,enemyName:enemy.name,seed:'qinyan-current-v11-'+level+'-'+enemy.id};
 for(const [mode,traitsEnabled]of [['off',false],['on',true]]){const b=new x.WitnessBattle.Battle({playerTemplateId:'qinyan',enemyId:enemy.id,testLevel:level,duel:false,traitsEnabled,seed:row.seed});b.tick(180000,true);if(!b.result)throw Error('unfinished');row.teamSize=b.units.length/2;row[mode]={winner:b.result.winner,seconds:b.result.time/1000,reason:b.result.reason,ownProcs:b.units.filter(u=>u.team===0).reduce((n,u)=>n+(u.passive?.procs||0),0),enemyProcs:b.units.filter(u=>u.team===1).reduce((n,u)=>n+(u.passive?.procs||0),0)};}
 rows.push(row);save();console.log('Qinyan paired',rows.length,'/45',level,enemy.name,row.off.winner,row.on.winner);
}
const result=save(true);console.log('COMPLETE',JSON.stringify({overall:result.overall,byLevel:result.byLevel,byTeam:result.byTeam,lossToWin:result.lossToWin,winToLoss:result.winToLoss}));
