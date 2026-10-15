const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {load}=require('../load.cjs');
const root=path.resolve(__dirname,'..');
const mode=fs.existsSync(path.join(root,'src/battle-v14-ai.js'))?'fixed':'projection';
const baseline=load('baseline'),box=load(mode),B=box.WitnessBattle;
const results=[];
const test=(name,fn)=>{fn();results.push({name,passed:true});};
const copy=x=>JSON.parse(JSON.stringify(x));
const battle=()=>new B.Battle({playerTemplateId:'xiaowen',enemyId:'qinyan',testLevel:61,duel:true,difficulty:'standard',seed:'v14-ui-integration'});
function journey(snapshot){
  const c=new box.WitnessCampaign.Campaign(box.WITNESS_CATALOG,{staged:false,seed:'v14-save-ui',name:'集成测试',level:41});
  const s=c.state;s.completed=s.character.time.quarters;s.date={year:6102,month:s.character.time.month,age:s.character.time.age};
  s.phase='battle';s.battleSnapshot=copy(snapshot);s.battleOptions={enemyId:'qinyan',seed:'preserved'};s.attempts=3;
  return c.snapshot();
}
test('Campaign upgrade changes only accepted combat versions, preserving every migration step',()=>{
  const clean=s=>s.replace(/^function\s+upgrade\s*\(/,'upgrade(').replace(/\s/g,'');
  const old=clean(baseline.WitnessCampaign.Campaign.prototype.upgrade.toString());
  const next=clean(box.WitnessCampaign.Campaign.prototype.upgrade.toString());
  assert.equal(next,old.replace('s.battleSnapshot.combatRulesVersion!==13','![13,14].includes(s.battleSnapshot.combatRulesVersion)'));
});
test('V13 and V14 journey battle saves retain battle phase, attempts, RNG, and snapshot version',()=>{
  const oldBattle=new baseline.WitnessBattle.Battle({playerTemplateId:'xiaowen',enemyId:'qinyan',testLevel:61,duel:true,seed:'old-save'});
  for(const snapshot of [oldBattle.snapshot(),battle().snapshot()]){
    const s=journey(snapshot),restored=new box.WitnessCampaign.Campaign(box.WITNESS_CATALOG,{snapshot:s}).state;
    assert.equal(restored.phase,'battle');assert.equal(restored.attempts,3);assert.deepEqual(restored.battleOptions,s.battleOptions);
    assert.equal(restored.battleSnapshot.combatRulesVersion,snapshot.combatRulesVersion);
    assert.equal(restored.battleSnapshot.rngState,snapshot.rngState);
    const live=new B.Battle({snapshot:restored.battleSnapshot});assert.equal(live.snapshot().combatRulesVersion,14);
  }
});
test('Unsupported rule revisions still archive the old report and return to arrival',()=>{
  for(const [key,bad]of [['combatRulesVersion',12],['combatRulesVersion',15],['playerRulesVersion',1],['tacticsRulesVersion',999],['version',9],['soulControlVersion',10]]){
    const snapshot=battle().snapshot();snapshot[key]=bad;const s=journey(snapshot);
    const restored=new box.WitnessCampaign.Campaign(box.WITNESS_CATALOG,{snapshot:s}).state;
    assert.equal(restored.phase,'arrival');assert.equal(restored.battleSnapshot,null);
    assert.equal(restored.legacyBattleReport[key],bad);assert.equal(restored.attempts,3);
  }
});
test('Invalid battle resources are still rejected before migration',()=>{
  const snap=battle().snapshot();snap.units[0].mp=-1;
  assert.throws(()=>new box.WitnessCampaign.Campaign(box.WITNESS_CATALOG,{snapshot:journey(snap)}),/战斗资源无效/);
});
test('Shield tooltips expose independent life/spirit layers in impact order without mutating the battle',()=>{
  const b=battle(),u=b.unit('player');
  b.addShieldLayer(u,{channel:'生命',source:'ally:flower',label:'栀子花露',amount:547,until:15000});
  b.addShieldLayer(u,{channel:'生命',source:'self:mirror',label:'尘镜',amount:416,until:8000,oneHit:true});
  b.addShieldLayer(u,{channel:'精神',source:'self:mental',label:'精神防护',amount:291,until:12000});
  const before=JSON.stringify(b.snapshot()),badges=box.WitnessUIV14.shieldBadges(b,u);
  assert.equal(JSON.stringify(b.snapshot()),before);assert.equal(badges.length,3);
  assert.match(badges[0].name,/尘镜 416/);assert.match(badges[0].tip,/最先承伤.*8\.0秒/);
  assert.match(badges[1].name,/栀子花露 547/);assert.match(badges[1].tip,/第2层承伤.*15\.0秒/);
  assert.match(badges[2].name,/精神盾 精神防护 291/);assert.match(badges[2].tip,/12\.0秒/);
});
test('Self-only skill cards identify the actual target and mana return uses base MP points',()=>{
  for(const template of ['qingling','xuejidong']){
    const b=new B.Battle({playerTemplateId:template,enemyId:'qinyan',testLevel:61,duel:true,seed:'self-card'}),u=b.unit('player');
    const skill=u.skills.find(s=>s.phantomDance||s.iceArmor);assert.ok(skill,'self skill '+template);
    const text=box.WitnessSkillText.describe(skill,{battle:b,unit:u});assert.match(text,/仅限自身/);assert.doesNotMatch(text,/自己或一名队友/);
    assert.match(box.WitnessUIV14.cardDescription(skill,u),/仅限自身/);
  }
  const b=new B.Battle({playerTemplateId:'xiaweiyu',enemyId:'qinyan',testLevel:61,duel:true,seed:'mp-card'}),u=b.unit('player'),s=u.skills.find(s=>s.manaReturn);
  const text=box.WitnessSkillText.describe(s,{battle:b,unit:u});
  assert.match(text,new RegExp('反哺至多 '+Math.round(u.model.derived.baseMP*.02)+' 点'));assert.doesNotMatch(text,/2%最大魂力/);
  const card=box.WitnessUIV14.cardDescription(s,u);assert.doesNotMatch(card,/2%最大魂力/);assert.match(card,/2%基础魂力/);
});
test('Skill prediction states probability, conditional loss and expected loss, and caches only decision state',()=>{
  const b=battle(),u=b.unit('player'),t=b.unit('enemy'),s=u.skills.find(s=>s.category==='攻击');
  assert.ok(s);let calls=0;const actual=b.forecastAction;
  b.forecastAction=function(...args){calls++;return actual.apply(this,args);};
  b.activeId=null;box.WitnessSkillText.describe(s,{battle:b,unit:u,target:t});assert.equal(calls,0);
  b.activeId=u.id;u.readyAt=0;u.cast=null;
  const before=JSON.stringify(b.snapshot());
  const one=box.WitnessSkillText.describe(s,{battle:b,unit:u,target:t});
  const two=box.WitnessSkillText.describe(s,{battle:b,unit:u,target:t});
  assert.equal(one,two);assert.equal(calls,1);assert.equal(JSON.stringify(b.snapshot()),before);
  assert.match(one,/命中 .*%/);assert.match(one,/命中后.*损失约/);assert.match(one,/期望.*损失约/);assert.match(one,/魂力消耗 \d+ 点/);
  t.mp=Math.max(0,t.mp-1);box.WitnessSkillText.describe(s,{battle:b,unit:u,target:t});assert.equal(calls,2);
});
if(!process.argv.includes('--skip-html'))test('Both HTML editions share the same battle/runtime scripts and retain their theme-specific UI',()=>{
  const names=['经典深靛版','晨曦朝阳版'];let first=null;
  for(const name of names){
    const html=fs.readFileSync(path.join(root,'dist',`见证者公会_10.05_V14_${name}.html`),'utf8');
    const blocks=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
    assert.equal(blocks.length,name==='经典深靛版'?25:27);for(const [i,source]of blocks.entries())new vm.Script(source,{filename:`${name}-script-${i}.js`});
    if(first)assert.deepEqual(blocks.slice(0,24),first.slice(0,24));else first=blocks;
    const original=fs.readFileSync(path.join(root,'../guild/见证者公会双前端',name+'.html'),'utf8').replace(/\r\n/g,'\n');
    const oldBlocks=[...original.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
    assert.deepEqual(blocks.slice(24),oldBlocks.slice(19));
    assert.match(html,/<title>见证者公会 10.05版 · 战斗 V14/);assert.match(html,/10\.05版 · 战斗 V14 · 一段/);
    assert.ok(html.indexOf('data-v14-module="battle-v14-ui.js"')<html.indexOf("const KEY='witness-battle-combined-v13'"));
    assert.ok(html.indexOf('data-v14-module="campaign-v14-compat.js"')<html.lastIndexOf('WitnessFullGame'));
    assert.doesNotMatch(blocks[13],/u\.shieldUntil-battle\.now/);
  }
});
const report={mode,passed:results.length,results};
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
fs.writeFileSync(path.join(root,'test-results','integration.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
