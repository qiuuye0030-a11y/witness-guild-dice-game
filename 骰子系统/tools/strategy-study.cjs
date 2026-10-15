// Controlled development experiment, no production edits or extra RNG knowledge.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load}=require('./runtime-1006.cjs'),root=path.resolve(__dirname,'..');
const out=path.join(root,'output/1006-strategy');fs.mkdirSync(out,{recursive:true});
const boxes=[load(),load({candidate:true})],rows=[],counterfactuals=[];
const ids=['anmu','yiqiran','yixiaobei','hash','quan','xuejidong'];
const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'battle-v13-browser.js'))).digest('hex');
for(const id of ids)for(const enemy of ['qinyan','xiaowen','yixing','xuejidong'])for(const level of [41,51,61]){
 const seed=`1006-dev-${id}-${enemy}-${level}`;
 for(const [mode,box]of boxes.entries()){
  const b=new box.WitnessBattle.Battle({playerTemplateId:id,enemyId:enemy,testLevel:level,duel:true,seed});
  if(['yiqiran','yixiaobei'].includes(id)){
   const p=new box.WitnessBattle.Battle({playerTemplateId:level===51?'hash':'yixing',enemyId:level===51?'hash':'yixing',testLevel:level,duel:true,seed:seed+'partners'});
   for(const [i,u]of p.units.entries()){u.id=i?'enemySupport':'ally';b.units.push(u);}
  }
  let ms=0,n=0,first=true;const choose=b.aiChoice;
  b.aiChoice=function(u){const start=performance.now(),v=choose.call(this,u);ms+=performance.now()-start;n++;
   if(first&&u.id==='player'&&mode===0){first=false;
    counterfactuals.push({id,enemy,level,snapshot:this.snapshot(),candidates:this._lastAIv14?.candidates});
   }return v;};
  b.tick(180000,true);
  const row={id,enemy,level,mode,seed,result:b.result,ms,decisions:n,units:b.units.map(u=>({id:u.id,hp:u.hp,mp:u.mp,maxMP:u.model.derived.MP,fallen:u.fallen,uses:u.uses})),log:b.log};rows.push(row);
  fs.appendFileSync(path.join(out,'development.jsonl'),JSON.stringify(row)+'\n');
 }
 console.log(id,enemy,level,rows.at(-2).result.winner,rows.at(-1).result.winner);
}
const report={sourceHash:hash,candidate:'24-second horizon, up to two sequential affordable normal actions; actual state advances',games:rows.length,groups:ids.map(id=>({id,modes:[0,1].map(mode=>{const r=rows.filter(x=>x.id===id&&x.mode===mode);return {mode,games:r.length,wins:r.filter(x=>x.result.winner===0).length,meanDecisionMS:r.reduce((n,x)=>n+x.ms,0)/r.reduce((n,x)=>n+x.decisions,0),adjudicated:r.filter(x=>x.result.tieBreak||x.result.time>=180000).length};})}))};
fs.writeFileSync(path.join(out,'development-summary.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'decision-fixtures.json'),JSON.stringify(counterfactuals));
console.log(JSON.stringify(report));
