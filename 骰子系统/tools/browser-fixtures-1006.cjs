// Synthetic complete-save fixtures for browser acceptance, never release content.
const fs=require('fs'),path=require('path'),{load}=require('./runtime-1006.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/playwright/fixtures');fs.mkdirSync(out,{recursive:true});
const old=require(path.resolve(root,'../见证者公会_V14_完整交接版_2026-10-15/v14_work/load.cjs')).load('baseline'),next=load();
function journey(box,name){const c=new box.WitnessCampaign.Campaign(box.WITNESS_CATALOG,{seed:name,name:'验收角色',level:61,tier:7});while(c.state.phase==='creation'){if(c.state.awakeningPending)c.acknowledgeAwakening();else c.rollCreation();}c.forceAdmission('浏览器验收夹具');while(c.state.character.rings.length<6)c.state.character.rings.push(c.generateRing(c.state.character.rings.length+1));c.refresh();return c;}
function save(file,c,version='10.06'){const data={format:'witness-complete-game',version:9,gameVersion:version,speed:0,training:'C',state:c.snapshot()};fs.writeFileSync(path.join(out,file),JSON.stringify(data));return data;}
for(const [label,box]of [['v13',old],['v14',next]]){
 const c=journey(box,'browser-'+label),opts=c.battleOptions('qinyan'),b=new box.WitnessBattle.Battle(opts);b.tick(2000,false);c.observeBattle(b);save(label+'-battle.json',c,label==='v13'?'10.05':'10.06');
}
const arrival=journey(next,'browser-arrival');save('arrival.json',arrival);
const shields=journey(next,'browser-shields');shields.setPlayMode('member');const shieldOptions=shields.battleOptions('qinyan','standard',true);
Object.assign(shieldOptions,{playerTemplateId:'xuejidong',testLevel:61,duel:true});shields.state.battleOptions=JSON.parse(JSON.stringify(shieldOptions));
const shieldBattle=new next.WitnessBattle.Battle(shieldOptions),owner=shieldBattle.unit('player');shieldBattle.activeId=owner.id;owner.progress=1;
shieldBattle.addShieldLayer(owner,{channel:'生命',source:'fixture-flower',label:'栀子花露',amount:547,until:15000});
shieldBattle.addShieldLayer(owner,{channel:'生命',source:'fixture-mirror',label:'尘镜',amount:416,until:8000,oneHit:true});
shieldBattle.addShieldLayer(owner,{channel:'精神',source:'fixture-mind',label:'精神防护',amount:291,until:12000});
shields.observeBattle(shieldBattle);save('shields.json',shields);
const c=journey(next,'browser-achievement'),opts=c.battleOptions('qinyan'),b=new next.WitnessBattle.Battle(opts);
// Isolate presentation from combat randomness; rules are exercised separately.
b.unit('player').hp=b.unit('player').model.derived.HP;b.unit('enemy').hp=0;b.unit('enemy').fallen=true;b.result={winner:0,time:1000,reason:'界面验收夹具'};
c.state.source='formal';c.state.character.initialPotential=1;c.state.examDefeats=[1,2];c.observeBattle(b);save('achievement-ending.json',c);
console.log('Saved complete browser fixtures:',out);
