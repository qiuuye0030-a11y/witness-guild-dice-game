const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),x=require('./runtime-1008.cjs').load();
let actions=0,reloads=0,refusals=0;const subtypes={},rows=[];
for(let i=0;i<60;i++){
 let c=new x.WitnessCampaign.Campaign(x.WITNESS_CATALOG,{seed:'1008-independent-growth-'+i});
 for(let n=0;c.state.phase!=='arrival'&&n<2000;n++){
  const s=c.state;
  switch(s.phase){
   case'creation':if(s.awakeningPending)c.acknowledgeAwakening();else c.rollCreation();break;
   case'review':c.review({style:['强攻','敏攻','控制','防御','辅助'][i%5]});c.begin();break;
   case'prologue':c.startGrowth();break;
   case'growth':c.startQuarter(['B','S','D','A','P','C','W'][i%7]);break;
   case'event':c.chooseEvent(i%2);break;
   case'eventResult':c.finishEvent();break;
   case'hunt':case'initialHunt':if(s.hunt.result){if(n%17===0&&s.hunt.attempt<=3){c.abandonHunt();refusals++;}else c.finishHunt();}else if(s.hunt.stage==='plan')c.huntPlan('balanced',i%2===0&&c.huntCategories().includes('攻击')?'攻击':c.huntCategories()[i%c.huntCategories().length]);else if(s.hunt.stage==='second')c.chooseSecond(c.huntCategories().find(k=>k!==s.hunt.category));else c.huntStep();break;
   default:throw Error(s.phase);
  }
  actions++;for(;;){const p=c.currentPromotion();if(!p)break;c.acknowledgePromotion(p.id);}
  if(n>0&&n%13===0){const before=JSON.stringify(c.snapshot()),d=new x.WitnessCampaign.Campaign(x.WITNESS_CATALOG,{snapshot:c.snapshot()});assert.equal(JSON.stringify(d.snapshot()),before,'reload '+i+' '+n);c=d;reloads++;}
 }
 assert.equal(c.state.phase,'arrival');for(const r of c.state.character.rings)for(const sk of r.skills){assert.notEqual(sk.category,'回蓝');if(sk.category==='攻击')subtypes[sk.attackSubtype]=(subtypes[sk.attackSubtype]||0)+1;}
 const options=c.battleOptions(),b=new x.WitnessBattle.Battle(options);assert(!b.challengeId);rows.push({seed:i,level:c.state.character.level,style:c.state.character.style,rings:c.state.character.rings.length});
 if((i+1)%10===0)console.log('growth journeys',i+1);
}
fs.mkdirSync(path.resolve(__dirname,'../output/1008'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../output/1008/培养与读档验证.json'),JSON.stringify({journeys:60,actions,reloads,refusals,subtypes,rows},null,2));console.log('PASS',actions,reloads,subtypes);
