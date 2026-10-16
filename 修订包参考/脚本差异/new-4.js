(function(root){
  'use strict';
  const KEYS=['B','S','C','D','A','P'];
  const LABELS={B:'肉体强度',S:'魂力强度',C:'魂力操纵',D:'防御素质',A:'敏捷',P:'精神力',W:'精神稳定'};
  const BASE=[20,40,65,95,130,175,230,300,390,500];
  const GRADE=[.76,.82,.88,.94,1,1.06,1.12,1.18,1.24,1.30];
  const STYLE={
    '强攻':[20,10,0,0,-10,-20], '敏攻':[0,0,10,-20,30,-20],
    '控制':[-20,10,20,-10,-10,10], '防御':[10,0,-10,30,-20,-10],
    '辅助':[-20,10,20,-10,-10,10]
  };
  const WEIGHTS={强攻:[45,20,10,5,5,5,10],敏攻:[40,20,5,10,10,0,15],控制:[15,5,10,20,35,0,15],防御:[15,15,40,15,10,0,5],辅助:[0,25,20,15,5,25,0]};
  const CATEGORIES=['攻击','强化','防御','减益','控制','治疗','持续伤害'];
  const CAPS=[423,764,1760,5000,12000,20000,50000,99999,100000];
  const BAND_LIMITS=[99,999,3999,6999,9999,29999,49999,69999,89999,99999,100000];
  const BANDS=['十年','百年','千年','千年','千年','万年','万年','万年','万年','万年','十万年'];
  const QS=[1,1.35,1.8,2.05,2.25,2.8,3.15,3.5,3.8,4,4.5],COSTS=[20,30,44,52,60,80,90,102,112,120,140],CDS=[4,5,6,6.5,7,8,8.5,9,9.5,10,12];
  const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
  const round2=x=>Math.round((x+Number.EPSILON)*100)/100;
  function benchmark(level){
    if(!Number.isInteger(level)||level<0||level>99)throw Error('魂力等级须为0—99的整数');
    const rings=Math.floor(Math.max(0,level-1)/10),next=BASE[rings+1]??640;
    return {rings,base:round2(BASE[rings]+(next-BASE[rings])*(Math.max(0,level-1)%10)/10),stability:50+3*rings};
  }
  function shapeMods(soul,release){
    if(soul.main_kind==='兽')return release==='召唤'?[ -8,8,6,-6,0,0 ]:[8,0,-8,0,6,-6];
    if(soul.main_kind==='本体')return [8,-6,0,4,-6,0];
    if(soul.main_kind==='器')return /辅助|生活|植物/.test(soul.subkind)?[-6,0,8,-6,0,4]:[4,4,0,-4,0,-4];
    if(soul.subkind==='元素')return [-8,10,4,-6,0,0];
    return [-4,4,0,0,-4,4];
  }
  function mainStyles(soul){return Object.keys(STYLE);}
  function ringFloor(cap){return cap>=100000?10000:cap>=10000?1000:cap>=1000?100:10;}
  function ringRange(cap,quality){
    const floor=ringFloor(cap),span=cap-floor;
    const points=[floor, floor+Math.floor(span*.4),floor+Math.floor(span*.7),floor+Math.floor(span*.9),cap];
    const i=quality<=20?0:quality<=65?1:quality<=95?2:3;
    return {floor,low:i===0?floor:points[i]+1,high:points[i+1]};
  }
  function isMental(soul){return !!soul.spirit_specialist;}
  function combatRules(){
    if(!root.WitnessV13Rules)throw Error('战斗规则尚未载入');
    return root.WitnessV13Rules;
  }
  function derive(stats){return combatRules().derive(stats);}
  function buildStats(args){return combatRules().buildStats(args);}
  function controlEffect(Q,attacker,defender){
    const chance=clamp(.65+(attacker.P-defender.P)/600+(attacker.W-defender.W)/1000,.35,.85);
    const base=1+.5*Q,ratio=(100+attacker.P)/(100+defender.P);
    return {chance:round2(chance*100),duration:round2(Math.max(.01,base*ratio)),ratio:round2(ratio),immunity:4};
  }
  function band(years){if(!Number.isInteger(years)||years<10||years>100000)throw Error('魂环年限无效');return BAND_LIMITS.findIndex(n=>years<=n);}
  function pickCategory(style,roll){let n=0;const w=WEIGHTS[style],point=roll/100*w.reduce((a,b)=>a+b,0);return CATEGORIES[w.findIndex(v=>(n+=v)>=point)];}
  function makeSkill(args){
    const skill=combatRules().makeSkill(args);
    // Preview the same cost and cast methods with no temporary battle effects.
    // This creates no match, schedules no AI and consumes no random numbers.
    const battle=Object.create(root.WitnessBattle.Battle.prototype);
    const unit={id:'preview',model:args.stats,soul:args.soul,style:args.style,level:args.stats.level,statuses:[]};
    Object.assign(battle,{now:0,units:[unit],resourceConfig:combatRules().getResourceConfig(),log:[]});
    return {...skill,previewCost:battle.cost(unit,skill),previewCast:round2(battle.castTime(unit,skill)*(skill.castMultiplier||1)),previewRulesVersion:16};
  }
  function rating(model){
    const standard=benchmark(model.level).base,score=Math.round(KEYS.reduce((sum,k)=>sum+model.stats[k],0)/6/standard*10000)/10000;
    const title=score<1?'纸':score<1.35?'并':score<1.60?'强':score<1.75?'凶':score<2.10?'狂':'神';
    return {score:round2(score),label:title+'级',basis:'六维均值 / 同等级标准 '+standard+'；并级为合格线，不含临时增益'};
  }
  const api={rating,ringFloor,ringRange,KEYS,LABELS,BASE,GRADE,STYLE,CAPS,BAND_LIMITS,BANDS,QS,WEIGHTS,CATEGORIES,benchmark,shapeMods,mainStyles,isMental,derive,buildStats,controlEffect,band,pickCategory,makeSkill,round2};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessRules=api;
})(typeof globalThis==='undefined'?this:globalThis);

