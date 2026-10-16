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
  const WEIGHTS={强攻:[45,20,10,5,5,5,0,10],敏攻:[40,20,5,10,10,0,0,15],控制:[15,5,10,20,35,0,0,15],防御:[15,15,40,15,10,0,0,5],辅助:[0,25,20,15,5,25,10,0]};
  const CATEGORIES=['攻击','强化','防御','减益','控制','治疗','回蓝','持续伤害'];
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
  function derive(stats){
    const {B,S,C,D,A,P,W}=stats;
    return {HP:Math.round(220+7*B),MP:Math.round(60+5*S),SH:Math.round(220+8*P),PA:round2(10+.65*B+.25*S),SA:round2(10+.85*S),MA:round2(10+.8*P),DEF:round2(10+.5*D+.2*B),MDEF:round2(10+.5*P+.3*W),costReduction:round2(Math.min(.40,Math.pow(Math.max(0,C-120)/900,1.5)*.40)*100),castReduction:round2(Math.min(.25,C/600)*100),controlGrowth:round2(1+Math.min(1.5,P/200))};
  }
  function buildStats({level,soul,style,release,deviations=Array(6).fill(0),wDeviation=0,growth={}}){
    const standard=benchmark(level);
    if(!soul||!Number.isInteger(soul.tier)||soul.tier<1||soul.tier>10)throw Error('先确定武魂');
    if(!STYLE[style])throw Error('战斗类别无效');
    if(deviations.length!==6||deviations.some(n=>!Number.isInteger(n)||Math.abs(n)>10))throw Error('能力偏差须在−10%至10%之间');
    if(!Number.isInteger(wDeviation)||Math.abs(wDeviation)>10)throw Error('精神稳定偏差无效');
    const shape=shapeMods(soul,release),mental=isMental(soul)?[-15,0,10,-15,0,20]:Array(6).fill(0);
    const stats={},breakdown={};
    KEYS.forEach((key,i)=>{
      const weapon=(soul.balance||[])[i]||0;
      const modifier=STYLE[style][i]+shape[i]+mental[i]+weapon;
      const generated=Math.round(standard.base*GRADE[soul.tier-1]*(1+modifier/100)*(1+deviations[i]/100));
      stats[key]=round2(clamp(generated+(growth[key]||0),10,2000));
      breakdown[key]={base:standard.base,grade:GRADE[soul.tier-1],style:STYLE[style][i],shape:shape[i],mental:mental[i],weapon,deviation:deviations[i],growth:growth[key]||0,generated};
    });
    stats.W=clamp(standard.stability+wDeviation+(growth.W||0),10,100);
    breakdown.W={base:standard.stability,grade:1,style:0,shape:0,mental:0,deviation:wDeviation,growth:growth.W||0,generated:standard.stability+wDeviation};
    return {level,rings:standard.rings,benchmark:standard.base,stats,derived:(()=>{const d=derive(stats);if(isMental(soul)){d.HP=Math.round(d.HP*.78);d.MA=round2(d.MA*.72);d.PA=round2(d.PA*.85);d.SA=round2(d.SA*.85);}return d;})(),breakdown};
  }
  function controlEffect(Q,attacker,defender){
    const chance=clamp(.65+(attacker.P-defender.P)/600+(attacker.W-defender.W)/1000,.35,.85);
    const base=1+.5*Q,ratio=(100+attacker.P)/(100+defender.P);
    return {chance:round2(chance*100),duration:round2(Math.max(.01,base*ratio)),ratio:round2(ratio),immunity:4};
  }
  function band(years){if(!Number.isInteger(years)||years<10||years>100000)throw Error('魂环年限无效');return BAND_LIMITS.findIndex(n=>years<=n);}
  function pickCategory(style,roll){let n=0;return CATEGORIES[WEIGHTS[style].findIndex(w=>(n+=w)>=roll)];}
  function makeSkill({soul,style,stats,index,years,category,variant=0}){
    const b=band(years),q=QS[b],K=1+.15*(soul.tier-1),Q=round2(q*K);
    const mental=isMental(soul),attackChannel=mental?'精神':soul.main_kind==='兽'||(soul.main_kind==='器'&&soul.subkind==='战斗')?'物理':'能量';
    const channel=(category==='治疗'||category==='防御')?(mental?'精神':'生命'):attackChannel;
    const attack=attackChannel==='精神'?stats.derived.MA:attackChannel==='物理'?stats.derived.PA:stats.derived.SA;
    const power=channel==='精神'?stats.derived.MA:stats.derived.SA;
    const target={攻击:'一名敌人',强化:'自己或一名队友',防御:'自己或一名队友',减益:'一名敌人',控制:'一名敌人',治疗:'自己或一名队友',回蓝:'另一名队友',持续伤害:'一名敌人'}[category];
    const verbs={攻击:'击',强化:'振',防御:'护',减益:'蚀',控制:'缚',治疗:'回生',回蓝:'续能',持续伤害:'灼痕'};
    let effect;
    if(category==='攻击')effect=`${attackChannel}原始伤害 ${Math.round(1.2*Q*attack)}；命中后按${mental?'精神抗御':'防御力'}减伤`;
    if(category==='强化')effect=`一项攻击值提高 ${round2(Math.min(.60,.12*Q)*100)}%，持续8秒`;
    if(category==='防御')effect=`${channel==='精神'?'精神':'生命'}护盾 ${Math.round(.45*Q*power)}，持续8秒`;
    if(category==='减益')effect=`${mental?'精神抗御':'防御力'}降低 ${round2(Math.min(.50,.10*Q)*100)}%，持续6秒；成功率由双方精神力与稳定决定`;
    if(category==='控制')effect=`基础控制 ${round2(Math.min(3,1+.5*Q))}秒；实际成功率与时长受双方精神力影响，结束后4秒免控`;
    if(category==='治疗')effect=`回复${channel==='精神'?'精神护持':'生命'} ${Math.round(.40*Q*power)}，不超过最大值`;
    if(category==='回蓝')effect=`为另一名队友回复 ${Math.round(25+10*Q)}MP，每战一次，不能给自己`;
    if(category==='持续伤害')effect=`${attackChannel}总原始伤害 ${Math.round(1.4*Q*attack)}，分3次每3秒一跳，同技能不叠层`;
    const owned=Math.max(1,stats.rings),relative=index/owned;
    const fraction=index===owned?.34:relative>=.70?.22:relative>=.40?.15:.10;
    const baseCost=stats.derived.MP*fraction*(.92+.08*q),baseTime=1.4+.2*(q-1);
    const reserve=index===owned?14:8;
    return {name:`${soul.name}·${verbs[category]}${variant?'·副技':''}`,category,channel,target,effect,q,K:round2(K),Q,cost:Math.ceil(baseCost*(1-stats.derived.costReduction/100)),costFraction:round2(fraction),highest:index===owned,cast:round2(Math.max(.75,baseTime*(1-Math.min(.25,stats.stats.C/600)))),cooldown:Math.max(CDS[b],reserve,['控制','治疗'].includes(category)?10:0),ring:index,years};
  }
  function rating(model){
    const standard=benchmark(model.level).base,score=KEYS.reduce((sum,k)=>sum+model.stats[k],0)/6/standard;
    const title=score<1?'纸':score<1.20?'并':score<1.45?'强':score<1.75?'凶':score<2.10?'狂':'神';
    return {score:round2(score),label:title+'级',basis:'六维均值 / 同等级标准 '+standard+'；并级为合格线，不含临时增益'};
  }
  const api={rating,ringFloor,ringRange,KEYS,LABELS,BASE,GRADE,STYLE,CAPS,BAND_LIMITS,BANDS,QS,WEIGHTS,CATEGORIES,benchmark,shapeMods,mainStyles,isMental,derive,buildStats,controlEffect,band,pickCategory,makeSkill,round2};
  const SE=typeof module!=='undefined'&&module.exports?require('./skill-effects.js'):root.WitnessSkillEffects;
  api.makeSkill=args=>SE.make(makeSkill,args);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessRules=api;
})(typeof globalThis==='undefined'?this:globalThis);

