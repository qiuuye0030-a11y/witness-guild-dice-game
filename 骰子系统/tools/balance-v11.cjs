'use strict';
const {load,character,copy}=require('./verify-v11.cjs'),fs=require('fs'),path=require('path'),{fork}=require('child_process');
const out=path.join(__dirname,'../output/v11');fs.mkdirSync(out,{recursive:true});
if(process.argv[2]==='worker'){
 console.log('worker starting',process.argv[3]);const shard=Number(process.argv[3]),x=load(),B=x.WitnessBattle.Battle,R=x.WitnessRules,rows=[];let n=0;
 for(let tier=1;tier<=10;tier++)for(const style of Object.keys(R.STYLE))for(let seed=0;seed<2;seed++){
  const level=[41,55,71][(tier+Object.keys(R.STYLE).indexOf(style)+seed)%3];
  const index=n++;if(index%3!==shard)continue;
  const candidates=x.WITNESS_CATALOG.filter(s=>s.tier===tier),soul=candidates[(index*37+seed*71)%candidates.length];
  const args=character(x,{tier,style,level,seed:'balance-'+index,soul}),enemy=x.WitnessTemplates[(tier*7+Object.keys(R.STYLE).indexOf(style)*3+seed)%x.WitnessTemplates.length],options={...args,enemyId:enemy.id,difficulty:'admission',seed:'v11-paired-'+index};
  const results={};for(const mode of ['off','player','all']){const b=new B({...options,traitsEnabled:mode!=='off'});if(mode==='player')for(const u of b.units)if(u.team!==0&&u.passive)u.passive.state=null;
   b.tick(180000,true);if(!b.result)throw Error('unfinished');for(const u of b.units)for(const k of ['hp','sh','mp'])if(!Number.isFinite(u[k])||u[k]<0)throw Error('invalid resources');
   results[mode]={win:b.result.winner===0?1:0,time:b.result.time,playerProcs:b.units.filter(u=>u.team===0).reduce((n,u)=>n+(u.passive?.procs||0),0),enemyProcs:b.units.filter(u=>u.team===1).reduce((n,u)=>n+(u.passive?.procs||0),0),playerHP:b.units.filter(u=>u.team===0).reduce((n,u)=>n+u.hp,0),playerMP:b.units.filter(u=>u.team===0).reduce((n,u)=>n+u.mp,0),result:b.result};
  }
  rows.push({index,tier,style,level,soulId:soul.id,kind:x.WitnessTraitRegistry.getBySoulId(soul.id).kind,enemy:enemy.id,teamSize:style==='辅助'||enemy.style==='辅助'?2:1,results});
  if(rows.length%1===0){fs.writeFileSync(path.join(out,'battle-final-shard-'+shard+'.json'),JSON.stringify(rows,null,2));console.log('shard',shard,rows.length,'/'+[34,33,33][shard]);}
 }
 fs.writeFileSync(path.join(out,'battle-final-shard-'+shard+'.json'),JSON.stringify(rows,null,2));process.exit(0);
}
async function main(){await Promise.all([0,1,2].map(i=>new Promise((resolve,reject)=>{const p=fork(__filename,['worker',String(i)],{stdio:'inherit'});p.on('exit',code=>code===0?resolve():reject(Error('worker '+i+' exit '+code)));})));const rows=[0,1,2].flatMap(i=>JSON.parse(fs.readFileSync(path.join(out,'battle-final-shard-'+i+'.json')))).sort((a,b)=>a.index-b.index);
 const mean=a=>a.reduce((n,v)=>n+v,0)/a.length,round=n=>Math.round(n*10000)/10000;
 const summary=rs=>{const modes={};for(const mode of ['off','player','all'])modes[mode]={wins:rs.reduce((n,r)=>n+r.results[mode].win,0),winRate:round(mean(rs.map(r=>r.results[mode].win))),meanSeconds:round(mean(rs.map(r=>r.results[mode].time/1000))),meanPlayerProcs:round(mean(rs.map(r=>r.results[mode].playerProcs))),meanEnemyProcs:round(mean(rs.map(r=>r.results[mode].enemyProcs)))};const deltas=rs.map(r=>r.results.all.win-r.results.off.win),m=mean(deltas),sd=Math.sqrt(deltas.reduce((n,v)=>n+(v-m)**2,0)/Math.max(1,deltas.length-1));return {n:rs.length,modes,pairedWinRateDelta:round(m),ci95HalfWidth:round(1.96*sd/Math.sqrt(rs.length)),lossToWin:rs.filter(r=>!r.results.off.win&&r.results.all.win).length,winToLoss:rs.filter(r=>r.results.off.win&&!r.results.all.win).length,withPlayerProc:rs.filter(r=>r.results.all.playerProcs>0).length};};
 const report={note:'人工控制人物：六维=原生成值+同级基准20%训练；每环一项固定类别技能，年限为上限60%；无特性/仅我方/双方分别使用同一种子与初始人物；每个潜力/路线2个配对种子、等级交错；总100组300场，不是人口胜率。',overall:summary(rows),byTier:Object.fromEntries(Array.from({length:10},(_,i)=>[i+1,summary(rows.filter(r=>r.tier===i+1))])),byStyle:Object.fromEntries([...new Set(rows.map(r=>r.style))].map(k=>[k,summary(rows.filter(r=>r.style===k))])),byLevel:Object.fromEntries([41,55,71].map(k=>[k,summary(rows.filter(r=>r.level===k))])),byKind:Object.fromEntries(['battle','growth'].map(k=>[k,summary(rows.filter(r=>r.kind===k))])),rows};fs.writeFileSync(path.join(out,'特性配对战斗对比.json'),JSON.stringify(report,null,2));console.log('COMPLETE',JSON.stringify(report.overall));}
main().catch(e=>{console.error(e);process.exit(1)});
