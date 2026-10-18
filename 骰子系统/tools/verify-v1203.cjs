'use strict';
// v12.03 专项：讨伐血量倍率、冰壳/封寒基数、玩家聚能、战报归档与离场卡顿回归。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const x=require('./runtime-1008.cjs').load(),B=x.WitnessBattle.Battle,CC=x.WitnessCampaign,C=CC.Campaign,V=CC.V12,A=x.WitnessV12,R=x.WitnessRules,tests=[],copy=o=>JSON.parse(JSON.stringify(o));
function test(name,fn){fn();tests.push(name);console.log('PASS',name);}
function fight(target='frost-gnat',rank=10,level=81,seed='v1203'){const c=V.testCharacter(x.WITNESS_CATALOG,{seed,target,originRank:rank,level});c.v12Choose('接受');const options=c.v12StartBattle();return {c,b:new B(options),options};}
function ready(b,u){b.scheduleAI=()=>{};b.activeId=u.id;u.progress=1;u.readyAt=b.now;u.cast=null;u.cooldowns={};u.bonusAttack=false;u.mp=u.model.derived.MP;u.v12Channel=null;b.selectActor();return u;}
function wakeOnly(b,unit){b.scheduleAI=()=>{};for(const u of b.units){if(u!==unit){u.progress=0;u.readyAt=1e9;u.cast=null;}}unit.progress=1;unit.readyAt=0;unit.cast=null;unit.v12TurnOpen=false;b.activeId=null;b.selectActor();return unit;}

// 一、血量倍率：有援军×2、独行×1.5，只在开战乘一次。
for(const beast of A.beast.library.available())for(const rank of [1,8,10])test(beast.name+' rank'+rank+' 使用 ×'+(rank===1?1.5:2)+' 实际生命且不改其它六维',()=>{
  const {b}=fight(beast.id,rank),u=b.units.find(u=>u.beastId),k=rank===1?1.5:2;
  assert.equal(u.huntHealth.multiplier,k);
  assert.equal(u.huntHealth.baseHP,beast.panel.derived.HP);
  assert.equal(u.hp,Math.round(beast.panel.derived.HP*k));
  assert.equal(u.model.derived.HP,u.hp);
  const actual=copy(u.model),base=copy(beast.panel);delete actual.derived.HP;delete base.derived.HP;
  assert.deepEqual(actual,base);
  assert.equal(A.beast.library.definition(beast.id).panel.derived.HP,beast.panel.derived.HP);
  for(const friend of b.units.filter(u=>u.npcId))assert.equal(friend.model.derived.HP,A.roster.combatSpec(friend.npcId).model.derived.HP);
});
test('读档保留当前生命与上限，不会二次乘倍率',()=>{const {c,b}=fight('frost-moss-frog',10),u=b.units.find(u=>u.beastId),max=u.model.derived.HP;u.hp-=100;c.v12Observe(b);const restored=new C(x.WITNESS_CATALOG,{snapshot:c.snapshot()}),again=new B({snapshot:restored.state.v12.battleSnapshot});assert.equal(again.units.find(u=>u.beastId).hp,max-100);assert.equal(again.units.find(u=>u.beastId).model.derived.HP,max);});
test('重试从原始面板重建，援军退场不改变本场倍率',()=>{const {c,b}=fight('frost-moss-frog',10),u=b.units.find(u=>u.beastId),max=u.model.derived.HP;for(const friend of b.units.filter(u=>u.npcId))friend.hp=0;assert.equal(u.model.derived.HP,max);b.surrender();c.v12Observe(b);const again=new B(c.v12Retry());assert.equal(again.units.find(u=>u.beastId).model.derived.HP,Math.round(u.huntHealth.baseHP*2));assert.equal(again.units.find(u=>u.beastId).huntHealth.multiplier,2);});
test('普通考官血量不受讨伐倍率影响',()=>{const {c}=fight('frost-gnat',1),normal=new B({character:c.state.character,soul:c.soul(),enemyId:'qinyan',duel:true}),base=x.WitnessBattle.templateUnit(x.WitnessBattle.templates.find(t=>t.id==='qinyan'),c.state.character.level,'enemy',1);assert.equal(normal.unit('enemy').model.derived.HP,base.model.derived.HP);assert(!normal.unit('enemy').huntHealth);});
test('召唤系独行仍用 ×1.5，召唤体不计为援军',()=>{const c=V.testCharacter(x.WITNESS_CATALOG,{seed:'solo-summon-v1203',originRank:1}),soul=x.WITNESS_CATALOG.find(s=>s.main_kind==='兽'&&s.release_options.includes('召唤'));assert(soul);c.state.character.soulId=soul.id;c.state.character.release='召唤';c.refresh();c.v12Choose('接受');const b=new B(c.v12StartBattle());assert(b.unit('player').petMax>0);assert.equal(b.units.find(u=>u.beastId).huntHealth.multiplier,1.5);});

// 二、霜蚋冰壳：开战时一次性护盾（自身生命值40%），只结一次、不叠加。
test('霜蚋开战即获得自身生命值40%的冰壳护盾，且只结一次',()=>{const {b}=fight('frost-gnat',1),t=b.units.find(u=>u.beastId);assert.equal(t.huntHealth.baseHP,7395);assert.equal(t.model.derived.HP,11093);const layers=()=>t.shieldLayers.filter(l=>l.label==='冰壳护生');assert.equal(layers().length,1);assert.equal(layers()[0].amount,4437);assert.equal(t.shieldHP,4437);wakeOnly(b,t);assert.equal(layers().length,1);wakeOnly(b,t);assert.equal(layers().length,1);});
test('冰壳按自身生命值计算：开战倍率已计入，破盾后不再重结',()=>{const {b}=fight('frost-gnat',1),t=b.units.find(u=>u.beastId),u=b.unit('player');assert.equal(t.huntHealth.multiplier,1.5);const layer=t.shieldLayers.find(l=>l.label==='冰壳护生');assert.equal(layer.amount,Math.round(t.model.derived.HP*.4));u.mp=0;b._packetSkill={elements:['火']};b.applyDamage(t,layer.amount+1,'物理',u);assert.equal(t.shieldLayers.filter(l=>l.label==='冰壳护生').length,0);wakeOnly(b,t);assert.equal(t.shieldLayers.filter(l=>l.label==='冰壳护生').length,0,'破盾后不应重结');});
test('玩家继承冰壳：开战按自身最大生命40%结盾',()=>{const {b}=fight('frost-gnat',1),u=b.unit('player');u.v12Traits=[{id:'ice-shell-preservation'}];const before=u.shieldLayers.filter(l=>l.label==='冰壳护生').length;u.v12State.shellGranted=false;wakeOnly(b,u);const layer=u.shieldLayers.find(l=>l.label==='冰壳护生');assert(layer);assert.equal(layer.amount,Math.round(u.model.derived.HP*.4));assert.equal(before,0);});

// 三、霜苔巨蛙封寒：5%补盾与50%上限按原始生命。
test('巨蛙封寒每层原始生命5%，上限原始生命50%',()=>{const {b}=fight('frost-moss-frog',1),t=b.units.find(u=>u.beastId),u=b.unit('player'),base=t.huntHealth.baseHP;assert.equal(base,4770);const original=b.addShieldLayer,captured=[];b.addShieldLayer=function(target,spec){if(spec&&spec.label==='封寒')captured.push(spec.amount);return original.call(this,target,spec);};b._packetSkill={elements:['火']};b.applyDamage(t,1,'物理',u);assert.equal(captured.at(-1),base*.05);assert.equal(captured.at(-1),238.5);b.applyDamage(t,1,'物理',u);assert(captured.at(-1)>captured[0]);for(let i=0;i<40;i++)b.applyDamage(t,1,'物理',u);assert.equal(captured.at(-1),base*.5);assert.equal(captured.at(-1),2385);b.addShieldLayer=original;});

// 四、玩家聚能。
test('0蓝玩家可聚能：3秒读条、0耗蓝、回复最大魂力10%',()=>{const {b}=fight('frost-gnat',1),u=b.unit('player');b.scheduleAI=()=>{};ready(b,u);u.model.derived.MP=5648;u.mp=0;assert.equal(b.command(u.id,'focus',u.id),'');assert.equal(u.cast.action,'focus');assert.equal(u.cast.end-u.cast.start,3000);assert.equal(u.mp,0);b.tick(u.cast.end+1,false);assert.equal(u.mp,565);assert.equal(u.bonusAttack,false);assert(!u.skills.some(s=>s.id==='focus'));});
test('聚能不可被打断重复结算：受控打断不回蓝，读条中不能再次聚能',()=>{const {b}=fight('frost-gnat',10),u=b.unit('player'),t=b.units.find(u=>u.beastId);b.scheduleAI=()=>{};ready(b,u);u.mp=0;assert.equal(b.command(u.id,'focus',u.id),'');assert.match(b.command(u.id,'focus',u.id),/读条/);b.rng.die=()=>1;const control=t.skills.find(s=>s.category==='控制');b.tryControl(t,u,control,2);assert.equal(u.cast,null);b.tick(b.now+5000,false);assert.equal(u.mp,0);});
test('满蓝禁用、受控禁用、NPC与魂兽直接调用聚能均失败',()=>{const {b}=fight('frost-moss-frog',10),u=b.unit('player'),ally=b.units.find(x=>x.npcId),beast=b.units.find(x=>x.beastId);b.scheduleAI=()=>{};ready(b,u);u.mp=u.model.derived.MP;assert.match(b.actionReason(u,'focus'),/魂力已满/);assert.notEqual(b.command(u.id,'focus',u.id),'');assert.match(b.actionReason(ally,'focus'),/只有玩家/);assert.match(b.command(ally.id,'focus',ally.id),/只有玩家/);assert.match(b.actionReason(beast,'focus'),/只有玩家/);assert.match(b.command(beast.id,'focus',beast.id),/只有玩家/);});
test('聚能遵守封锁与恢复压制；读档不会重复回蓝',()=>{const {b}=fight('frost-gnat',1),u=b.unit('player');b.scheduleAI=()=>{};ready(b,u);u.model.derived.MP=5648;u.mp=100;u.v12State.sealed=true;assert.match(b.actionReason(u,'focus'),/封锁/);u.v12State.sealed=false;assert.equal(b.command(u.id,'focus',u.id),'');const snap=b.snapshot(),restored=new B({snapshot:copy(snap)});restored.scheduleAI=()=>{};const fresh=restored.unit('player');restored.tick(fresh.cast.end+1,false);assert.equal(fresh.mp,100+565);restored.tick(restored.now+10000,false);assert.equal(fresh.mp,100+565);const again=new B({snapshot:restored.snapshot()});assert.equal(again.unit('player').mp,100+565);});
test('可行动查询与自动AI在只能等待时选择聚能',()=>{const {b}=fight('frost-gnat',1),u=b.unit('player');b.scheduleAI=()=>{};u.skills=[];u.mp=0;u.cast=null;u.progress=0;u.readyAt=b.now;assert.equal(b.v12CanPerform(u),true);b.activeId=u.id;u.progress=1;u.readyAt=b.now;const choice=b.aiChoice(u);assert.equal(choice.action,'focus');assert.equal(choice.target,u.id);});
test('无人能行动仍按10秒判平局；可聚能时不会误判十秒僵局',()=>{const {b}=fight('frost-gnat',1),u=b.unit('player');b.scheduleAI=()=>{};for(const unit of b.units){unit.skills=[];unit.mp=0;unit.cast=null;}b.activeId=null;b.checkResult();b.now=10000;b.checkResult();assert.equal(b.result,null);u.v12State.sealed=true;b.now=20000;b.checkResult();b.now=30000;b.checkResult();assert.equal(b.result.huntOutcome,'draw');});

// 五、战报归档：主存档只留摘要。
function fakeBackend(){const map=new Map();return {put:async row=>{map.set(row.id,row);},get:async id=>map.get(id)?.report||null,remove:async id=>{map.delete(id);},all:async()=>[...map.values()].map(row=>row.report)};}
const archive=x.WitnessV12Reports;
test('完整战报按ID归档，主存档只有摘要与引用',()=>{archive.clearMemory();archive.__setBackend(fakeBackend());const {c,b}=fight('frost-moss-frog',10,81,'archive-1');b.units.find(u=>u.beastId).hp=0;b.checkResult();assert.equal(c.v12Observe(b),true);const v=c.state.v12,record=v.reports[0];assert.equal(record.snapshot,undefined);assert.equal(record.logCount,b.log.length);assert.equal(record.winner,0);assert(record.targetName.includes('巨蛙'));assert.equal(v.battleSnapshot,null);assert.equal(archive.peek(record.id).snapshot.log.length,record.logCount);assert(JSON.stringify(c.snapshot()).length<300000);assert.equal(c.state.character.bones.length,1);assert(v.rewards.reports[0].id);assert.equal(v.rewards.reports[0].snapshot,undefined);});
test('重复观察与重复领奖都不产生第二份成果',()=>{const {c,b}=fight('abyss-imperial-salamander',10,81,'archive-2');b.units.find(u=>u.beastId).hp=0;b.checkResult();c.v12Observe(b);const first=copy(c.snapshot());assert.equal(c.v12Observe(b),false);assert.deepEqual(copy(c.snapshot()),first);c.v12Claim();assert.equal(c.state.character.bones.length,1);c.v12Claim();assert.equal(c.state.character.bones.length,1);});
test('旧存档内嵌战报迁移为归档摘要，正文不丢失',()=>{archive.clearMemory();archive.__setBackend(fakeBackend());const {c,b}=fight('frost-gnat',1,81,'migrate');b.surrender();c.v12Observe(b);const embedded=copy(c.state.v12.reports[0]);archive.clearMemory();const legacy={v12:{reports:[{...embedded,snapshot:copy(b.snapshot())}]}};const out=archive.migrate(legacy);assert.equal(out.moved,1);assert.equal(legacy.v12.reports[0].snapshot,undefined);assert(archive.peek(embedded.id));});
test('2.7万行战报不再进入主存档，摘要小于20KB',()=>{archive.clearMemory();archive.__setBackend(fakeBackend());const lines=Array.from({length:27369},(_,i)=>({time:i*250,text:'第'+i+'条判定日志，附伤与护盾结算',type:'damage'}));const full={id:'heavy-report',snapshot:{now:7263628,result:{winner:1,reason:'讨伐队伍全灭',time:7263628,huntOutcome:'loss'},units:[{id:'player',name:'试炼者',team:0,hp:0,model:{derived:{HP:5000}},fallen:true},{id:'beast',name:'霜苔巨蛙',team:1,beastId:'frost-moss-frog',hp:23850,model:{derived:{HP:23850}}}],log:lines},date:{year:6102,month:1,age:20}};const out=archive.archiveReport(full);assert.equal(out.ok,true);const state={v12:{reports:[out.summary]}};const bytes=JSON.stringify(state).length;assert(bytes<20000,'摘要 '+bytes+' 字节');const heavy=archive.peek('heavy-report');assert.equal(heavy.snapshot.log.length,27369);});

// 六、返回事件：阶段恢复、不再投骰、不重发奖励。
test('三次机会用尽后仍能返回事件，保留三份战报且不能再挑战',()=>{const {c,b}=fight('frost-gnat',10,81,'three-attempts');let battle=b;for(let i=1;i<=3;i++){battle.surrender();c.v12Observe(battle);assert.equal(c.state.v12.attemptsUsed,i);if(i<3)battle=new B(c.v12Retry());}assert.equal(c.state.v12.reports.length,3);assert.throws(()=>c.v12Retry(),/机会/);c.state.phase='v12Hunt';c.v12Resume();assert.equal(c.state.phase,'growth');assert.equal(c.state.v12.hunt.status,'lost');assert.equal(c.state.v12.attemptsUsed,3);});
test('v12Resume 恢复原阶段且不重投事件、不重复发奖',()=>{const {c,b}=fight('frost-gnat',10,81,'resume');b.surrender();c.v12Observe(b);const before=copy({phase:c.state.v12.returnPhase,attempts:c.state.v12.attemptsUsed,xp:c.state.xp,date:c.state.date,rings:c.state.character.rings.length});c.state.phase='v12Hunt';c.v12Resume();assert.equal(c.state.phase,before.phase);assert.equal(c.state.v12.attemptsUsed,before.attempts);assert.deepEqual(copy(c.state.date),before.date);assert.equal(c.state.character.rings.length,before.rings);assert.equal(c.state.v12.battleSnapshot,null);assert.equal(c.state.v12.options,null);});

// 七、界面：日志分页与归档读取。
class Element{constructor(tag,text,cls){this.tag=tag;this.textContent=text||'';this.className=cls||'';this.children=[];this.value='';this.hidden=false;}append(...items){for(const item of items)this.children.push(item);}click(){if(this.onclick)this.onclick();}}
function Option(text,value){const el=new Element('option',text);el.value=String(value);return el;}
new Function('window','Option',fs.readFileSync(path.join(__dirname,'../systems/v12/ui.js'),'utf8'))(x,Option);
function nodes(el){return [el,...el.children.flatMap(nodes)];}
function ctxFor(campaign){return {campaign,body:new Element('main'),el:(...args)=>new Element(...args),paragraph(parent,text,cls){parent.append(new Element('p',text,cls));},button(text,fn,cls){const b=new Element('button',text,cls);b.onclick=fn;return b;},perform:fn=>fn(),notice(){},save(){},render(){},halt(){},download(value){this.exported=value;},startBattle(){},startTest(){},leaveBattle(){}};}
test('大日志分页：首屏200条，可继续加载',()=>{const log=Array.from({length:450},(_,i)=>({time:i*100,text:'第'+i+'行'}));const campaign={state:{v12:{hunt:{status:'won'},attemptsUsed:1,reports:[{id:'paged',snapshot:{units:[{beastId:'frost-gnat',name:'霜蚋'}],result:{reason:'测试',winner:0,time:45000},log,now:45000},date:{}}]}}};const ctx=ctxFor(campaign);x.WitnessV12UI.reports(ctx);const item=nodes(ctx.body).find(n=>n.tag==='details'&&n.children.some(c=>c.tag==='summary'&&c.textContent.includes('霜蚋')));assert(item);item.open=true;item.ontoggle();const count=()=>nodes(item).filter(n=>n.tag==='p'&&/秒 · /.test(n.textContent)).length;assert.equal(count(),200);const more=nodes(item).find(n=>n.tag==='button'&&n.textContent.startsWith('显示更多'));assert(more);more.click();assert.equal(count(),400);nodes(item).find(n=>n.tag==='button'&&n.textContent.startsWith('显示更多')).click();assert.equal(count(),450);});

const out=path.join(__dirname,'../output/v12');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const all=await archive.exportAll();
  assert(all.length>=1);
  const heavy=all.find(r=>r.id==='heavy-report');
  assert(heavy&&heavy.snapshot.log.length===27369);
  const imported=await archive.importAll([{...heavy,id:'imported-report'}]);
  assert.equal(imported.imported,1);
  assert(archive.peek('imported-report'));
  tests.push('战报归档可导出/导入完整日志');
  console.log('PASS','战报归档可导出/导入完整日志');
  fs.writeFileSync(path.join(out,'v12.03专项回归.json'),JSON.stringify({passed:tests.length,tests,visualReview:false},null,2));
  console.log('ALL V1203',tests.length);
})().catch(error=>{console.error(error);process.exit(1);});

