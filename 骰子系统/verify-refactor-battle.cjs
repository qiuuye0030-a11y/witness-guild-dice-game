const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const baseline=path.resolve(__dirname,'fixtures/v13-baseline');
function load(file){const c=vm.createContext({});vm.runInContext(fs.readFileSync(file,'utf8'),c);return c;}
const original=load(path.join(baseline,'battle-engine-v13-player.js')),modern=vm.createContext({});
const manifest=require('./systems/battle/manifest.json');vm.runInContext(manifest.modules.map(f=>fs.readFileSync(path.join(__dirname,'systems/battle',f),'utf8')).join('\n'),modern);
const plain=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(plain(modern.WitnessTemplates),plain(original.WitnessTemplates));
for(const seed of ['见证者','白沉香','same-seed','0']){const a=new original.WitnessDice.DiceEngine(seed),b=new modern.WitnessDice.DiceEngine(seed);for(let i=0;i<1000;i++)assert.equal(a.die([6,10,20,100,1000][i%5]),b.die([6,10,20,100,1000][i%5]));assert.equal(a.state,b.state);}
const catalog=require('../武魂十档候选库.json');let skills=0,battles=0,frames=0;
for(const tier of [1,5,10])for(const style of ['强攻','敏攻','控制','防御','辅助']){
 const soul=catalog.find(s=>s.tier===tier),character={name:'同种子对照',soulId:soul.id,level:61,style,release:soul.release_options[0],deviations:[0,0,0,0,0,0],wDeviation:0,growth:{},rings:[]};
 const stats=original.WitnessRules.buildStats({...character,soul});
 for(const category of ['攻击','持续伤害','强化','减益','控制','防御','回蓝','治疗'])for(const years of [423,1760,10000,30000,50000,70000,90000,100000]){
  const args={soul,style,stats,index:6,years,category,effectSeed:'compare-'+category+'-'+years};const old=original.WitnessRules.makeSkill(args),next=modern.WitnessRules.makeSkill(args);assert.deepEqual(plain(next),plain(old),'skill '+style+' '+tier+' '+category+' '+years);skills++;
 }
 // Explicit rings include damage, permanent stats and control, plus NPC specialist mechanics.
 character.rings=['攻击','强化','减益','控制','防御','回蓝'].map((category,i)=>({index:i+1,years:30000,skills:[original.WitnessRules.makeSkill({soul,style,stats,index:i+1,years:30000,category,effectSeed:'ring-'+i})]}));
 for(const opponent of original.WitnessTemplates){
  const options={character,soul,enemyId:opponent.id,difficulty:'admission',seed:'exact-'+tier+'-'+style+'-'+opponent.id};const a=new original.WitnessBattle.Battle(options),b=new modern.WitnessBattle.Battle(options);assert.deepEqual(plain(b.snapshot()),plain(a.snapshot()),'initial '+opponent.id);
  for(let at=1000;!a.result&&at<=181000;at+=1000){a.tick(at,true);b.tick(at,true);assert.deepEqual(plain(b.snapshot()),plain(a.snapshot()),'frame '+style+' '+opponent.id+' '+at);frames++;}
  assert.ok(a.result);const restored=new modern.WitnessBattle.Battle({snapshot:a.snapshot()});assert.deepEqual(plain(restored.snapshot()),plain(a.snapshot()));battles++;
 }
}
const result={diceRolls:4000,skillCases:skills,battles,comparedFrames:frames,allSnapshotsExactlyEqual:true};fs.writeFileSync('output/10.05重构_战斗逐步对照.json',JSON.stringify(result,null,2));console.log(result);
