const fs=require('fs'),path=require('path'),{load}=require('./runtime-1006.cjs');
const out=path.resolve(__dirname,'../output/1006-strategy'),box=load(),fixtures=JSON.parse(fs.readFileSync(path.join(out,'decision-fixtures.json')));
const rows=[];
for(const id of ['anmu','yiqiran','yixiaobei','hash'])for(const enemy of ['qinyan','xuejidong']){
 const f=fixtures.find(x=>x.id===id&&x.level===61&&x.enemy===enemy);if(!f)continue;
 const initial=new box.WitnessBattle.Battle({snapshot:f.snapshot}),u=initial.unit('player');
 const ranked=initial.aiCandidates(u),alternatives=ranked.filter(x=>u.skills.find(s=>s.id===x.action)?.category==='强化'||x.target==='ally'||/Swap|Sacrifice/.test(x.action));
 const chosen=[ranked[0],...alternatives.slice(0,3)].filter((x,i,a)=>x&&a.findIndex(z=>z?.action===x.action&&z?.target===x.target)===i);
 const trials=[];
 for(const action of chosen){
  const b=new box.WitnessBattle.Battle({snapshot:f.snapshot});const error=b.command('player',action.action,action.target);if(error)throw Error(error);b.tick(180000,true);
  trials.push({action,skill:u.skills.find(s=>s.id===action.action)?.name||action.action,result:b.result,player:b.unit('player'),ally:b.unit('ally'),time:b.now,log:b.log});
 }
 rows.push({id,enemy,level:61,at:f.snapshot.now,candidates:ranked,trials});
}
fs.writeFileSync(path.join(out,'counterfactuals.json'),JSON.stringify(rows));
console.log(JSON.stringify(rows.map(r=>({id:r.id,enemy:r.enemy,trials:r.trials.map(t=>({skill:t.skill,target:t.action.target,score:t.action.score,winner:t.result.winner,time:t.time}))})),null,2));
