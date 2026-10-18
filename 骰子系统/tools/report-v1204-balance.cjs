 'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),x=require('./runtime-1008.cjs').load(),B=x.WitnessBattle.Battle,rows=[];
for(const target of ['frost-moss-frog','frost-gnat','abyss-imperial-salamander'])for(const rank of [1,6,8,10]){
 const samples=[];for(let i=0;i<8;i++){const c=x.WitnessCampaign.V12.testCharacter(x.WITNESS_CATALOG,{target,originRank:rank,level:81,seed:'v1204-smoke-'+i});c.v12Choose('接受');const b=new B(c.v12StartBattle());b.tick(300000,true);for(const u of b.units)for(const key of ['hp','mp','sh'])assert(Number.isFinite(u[key])&&u[key]>=0);const team=b.units.filter(u=>u.team===0);samples.push({seed:i,winner:b.result?.winner??null,outcome:b.result?.huntOutcome||'unfinished',seconds:(b.result?.time||b.now)/1000,playerAlive:b.alive(b.unit('player')),friendHP:team.reduce((n,u)=>n+u.hp,0)/team.reduce((n,u)=>n+u.model.derived.HP,0)});}
 const wins=samples.filter(r=>r.winner===0).length,loss=samples.filter(r=>r.winner===1).length;rows.push({target,rank,allies:rank===1?0:rank===6?1:rank===8?2:3,runs:8,wins,loss,other:8-wins-loss,winRate:wins/8,meanSeconds:Math.round(samples.reduce((n,r)=>n+r.seconds,0)/8),samples});
 console.log(target,rank,wins+'/8');
}
const report={gameVersion:'v12.04',method:'真实时间轴、自动AI、81级赞助测试模版、每组相同8颗种子；300秒仅为本脚本停止观察点，游戏无180秒限制；无万年魂骨，无统计置信保证。',rows};fs.writeFileSync(path.join(__dirname,'../output/v12/v12.04平衡模拟.json'),JSON.stringify(report,null,2));
