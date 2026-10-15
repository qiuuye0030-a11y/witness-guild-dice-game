// Read-only replay of a small number of already-finished cross-policy games.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const {load}=require('../load.cjs');
const fixed=load('fixed'),legacy=load('mechanics'),oldProto=legacy.WitnessBattle.Battle.prototype;
const sourceFile=path.join(__dirname,'../src/battle-v14-ai.js'),hash=source=>crypto.createHash('sha256').update(source).digest('hex'),sha=()=>hash(fs.readFileSync(sourceFile)),before=sha();
// Recreate the reviewed V1 policy in memory after the production V2 correction.
// A strict hash prevents silently comparing the stored games with another policy.
let policy=fs.readFileSync(sourceFile,'utf8');
if(hash(policy)!=='ded0dda31a400d758619eaab3944e1b26be053517fccd191b766ddfef685a3f8'){
  policy=policy.replace('  function nextOpportunity(b,u,forceNext=false){\n','  function nextOpportunity(b,u,forceNext=false){\n    if(u.bonusAttack)return 0;\n')
    .replace('    if(u.bonusAttack)return Math.max(recovery,control);\n','')
    .replace('if(forceNext)return Math.max(recovery,control)+1/rate;','if(forceNext)return Math.max(recovery,control)+1/rate+.3;')
    .replace("\n      // End the same action without granting its effects or bonus attack.\n      const selfBonus=ctx.root.resourceConfig.selfBuffBonus&&forecast.s?.category==='强化'&&t.id===u.id;\n      pre.endTurn(payer,!selfBonus);payer.bonusAttack=false;",'')
    .replace("for(const foe of foes){\n      const castTarget=foe.cast?pre.unit(foe.cast.target):null;\n      const target=castTarget?.team===u.team?castTarget:t.team===u.team?pre.unit(t.id):weakest(pre,allies,foe);\n      if(target)pairs.push({a:foe.id,t:target.id,sign:-1});\n    }","for(const foe of foes){const target=foe.cast?pre.unit(foe.cast.target):t.team===u.team?pre.unit(t.id):weakest(pre,allies,foe);if(target&&target.team===u.team)pairs.push({a:foe.id,t:target.id,sign:-1});}");
}
assert.equal(hash(policy),'ded0dda31a400d758619eaab3944e1b26be053517fccd191b766ddfef685a3f8');
new Function('window',policy)(fixed);const newAI=fixed.WitnessBattle.Battle.prototype.aiChoice;
const rows=fs.readFileSync(path.join(__dirname,'../results/cross-policy.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
const ids=['quan:51:0:0','quan:61:0:0','xuejidong:41:0:0','xuejidong:61:0:0','xuejidong:61:1:0'];
const output=[];
for(const id of ids){
  const expected=rows.find(r=>r.id===id);assert(expected);
  const b=new fixed.WitnessBattle.Battle({playerTemplateId:expected.templateId,enemyId:expected.templateId,testLevel:expected.level,duel:true,seed:expected.seed});
  const trace=[],snapshots=[];
  b.aiChoice=function(u){
    const modern=u.team===expected.newSide;let choice;
    if(modern){snapshots.push({decision:trace.length,snapshot:this.snapshot()});choice=newAI.call(this,u);}
    else{const fork=this.forkProjectionState();Object.setPrototypeOf(fork,oldProto);choice=oldProto.aiChoice.call(fork,fork.unit(u.id));}
    trace.push({time:this.now,actor:u.id,modern,choice,candidates:modern?this._lastAIv14.candidates:undefined,units:this.units.map(v=>({id:v.id,hp:v.hp,mp:v.mp,sh:v.sh,actions:v.actions,bonus:v.bonusAttack,cast:v.cast,uses:{...v.uses},cooldowns:{...v.cooldowns},statuses:v.statuses.map(s=>({...s})),dots:v.dots.map(d=>({...d}))}))});
    return choice;
  };
  b.tick(180000,true);assert.equal(b.result.winner,expected.winner);assert.equal(b.now,expected.combatMs);
  output.push({id,skills:b.units[0].skills,result:b.result,final:b.units.map(u=>({id:u.id,hp:u.hp,mp:u.mp,uses:u.uses})),trace,snapshots});
}
assert.equal(sha(),before);
const out={sourceSHA256:hash(policy),productionSourceSHA256:before,sourceUnchanged:true,productionChanges:false,games:output};
fs.writeFileSync(path.join(__dirname,'../results/ai-loss-diagnostics.json'),JSON.stringify(out,null,2));
console.log(JSON.stringify(output.map(g=>({id:g.id,result:g.result,decisions:g.trace.map(t=>({time:t.time,actor:t.actor,choice:t.choice.action,top:t.candidates?.slice(0,4).map(c=>[c.action,Math.round(c.score*100)/100])}))})),null,2));
