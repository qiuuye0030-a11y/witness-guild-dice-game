(function(host){
  const globalThis={WitnessRules:host.WitnessRules};
  const WitnessControlV9={setConfig:(...args)=>globalThis.WitnessControlV9.setConfig(...args)};
  // BEGIN V13 PLAYER ENGINE
// Generated from systems/battle/manifest.json; do not edit this bundle.
(function(){
(function(root) {
  'use strict';
  const TIERS = [138,304,469,607,717,800,892,954,985,1000];
  function hashSeed(seed) {
    let h=2166136261;
    for (const c of String(seed)) { h^=c.codePointAt(0); h=Math.imul(h,16777619); }
    return h>>>0;
  }
  class DiceEngine {
    constructor(seed, state) { this.seed=String(seed); this.state=state===undefined?hashSeed(seed):state>>>0; }
    nextUint() {
      this.state=(this.state+0x6D2B79F5)>>>0;
      let t=this.state;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return (t^(t>>>14))>>>0;
    }
    die(sides) {
      if (!Number.isInteger(sides)||sides<2||sides>100000) throw Error('骰子面数须为2—100000的整数');
      const limit=Math.floor(4294967296/sides)*sides;
      let u; do { u=this.nextUint(); } while(u>=limit);
      return u%sides+1;
    }
    roll(sides,count=1,modifier=0) {
      if(!Number.isInteger(count)||count<1||count>100) throw Error('同投数量须为1—100的整数');
      if(!Number.isInteger(modifier)||modifier< -999||modifier>999) throw Error('总修正须为−999到999的整数');
      const before=this.state;
      const faces=Array.from({length:count},()=>this.die(sides));
      return {sides,count,modifier,faces,subtotal:faces.reduce((a,b)=>a+b,0),total:faces.reduce((a,b)=>a+b,0)+modifier,before,after:this.state};
    }
  }
  function tierFor(value) {
    if(!Number.isInteger(value)||value<1||value>1000) throw Error('强度骰面超出范围');
    return TIERS.findIndex(n=>value<=n)+1;
  }
  const api={DiceEngine,hashSeed,tierFor,TIERS};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.WitnessDice=api;
})(typeof globalThis==='undefined'?this:globalThis);

(function(root){
  'use strict';
  if(root.WitnessRules?.calculationVersion===11)return;
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
  let resourceConfig={multiplier:1.5,absorb:.25,mpPerDamage:1,basicFraction:.06,selfBuffBonus:true,domainAI:true};
  function setResourceConfig(c){resourceConfig={...resourceConfig,...c};}
  // C uses percentage points: cost 0–40 at C=100–500; cast 0–30 at C=0–300.
  function soulControl(C){return {costReduction:round2(clamp((C-100)/10,0,40)),castReduction:round2(clamp(C/10,0,30))};}
  function derive(stats){
    const {B,S,C,D,A,P,W}=stats;
    return {HP:Math.round(220+7*B),baseMP:Math.round(60+5*S),MP:Math.round((60+5*S)*resourceConfig.multiplier),SH:Math.round(220+8*P),PA:round2(10+.65*B+.25*S),SA:round2(10+.85*S),MA:round2(10+.8*P),DEF:round2(10+.5*D+.2*B),MDEF:round2(10+.5*P+.3*W),...soulControl(C),controlGrowth:round2(1+Math.min(1.5,P/200))};
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
  function pickCategory(style,roll){let n=0;const w=WEIGHTS[style],point=roll/100*w.reduce((a,b)=>a+b,0);return CATEGORIES[w.findIndex(v=>(n+=v)>=point)];}
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
    if(category==='强化')effect=`一项攻击值提高 ${round2(.12*Q*100)}%，持续整场`;
    if(category==='防御')effect=`${channel==='精神'?'精神':'生命'}护盾 ${Math.round(.45*Q*power)}，持续8秒`;
    if(category==='减益')effect=`${mental?'精神抗御':'防御力'}降低 ${round2(.10*Q*100)}%，持续6秒；成功率由双方精神力与稳定决定`;
    if(category==='控制')effect=`基础控制 ${round2(Math.min(3,1+.5*Q))}秒；实际成功率与时长受双方精神力影响，结束后4秒免控`;
    if(category==='治疗')effect=`回复${channel==='精神'?'精神护持':'生命'} ${Math.round(.40*Q*power)}，不超过最大值`;
    if(category==='回蓝')effect=`为另一名队友回复 ${Math.round(25+10*Q)}MP，每战一次，不能给自己`;
    if(category==='持续伤害')effect=`${attackChannel}总原始伤害 ${Math.round(1.4*Q*attack)}，分3次每3秒一跳，同技能不叠层`;
    const owned=Math.max(1,stats.rings),relative=index/owned;
    const fraction=index===owned?.34:relative>=.70?.22:relative>=.40?.15:.10;
    const baseCost=stats.derived.MP*fraction*(.92+.08*q),baseTime=1.4+.2*(q-1);
    const reserve=index===owned?14:8;
    return {name:`${soul.name}·${verbs[category]}${variant?'·副技':''}`,category,channel,target,effect,q,K:round2(K),Q,cost:skillBudget(stats,{category,Q,factor:1}),costFraction:round2(fraction),highest:index===owned,cast:round2(Math.max(.75,baseTime*(1-stats.derived.castReduction/100))),cooldown:Math.max(CDS[b],reserve,['控制','治疗'].includes(category)?10:0),ring:index,years};
  }

  function skillBudget(model,s){
    const magnitude=((s.category==='持续伤害'||s?.damageMode==='periodic')?1.4:1.2)*(s.Q||1)*(s.budgetFactor??s.factor??1);
    let fraction;
    if(['攻击','持续伤害'].includes(s.category))fraction=clamp(.045+.025*magnitude,.10,.28);
    else if(s.category==='强化')fraction=.06+(s.buff||0)*.06+(s.agility||0)*.05+(s.evasion||0)*.10+(s.dotBuff||0)*.04+(s.budgetColdOnHit??s.coldOnHit??0)*.08;
    else if(s.category==='控制')fraction=.065+.008*(s.Q||1)+(s.chipFactor||0)*.08;
    else if(s.category==='减益')fraction=.06+.006*(s.Q||1);
    else fraction=.08;
    return Math.max(1,Math.ceil((model.derived.baseMP||model.derived.MP)*fraction*(s.costMultiplier||1)*(1-model.derived.costReduction/100)));
  }
  const ratingRulesVersion=2;
  function ratingThresholds(level,{npc=false}={}){
    const rings=benchmark(level).rings,z=clamp((level-1)/60,0,1);
    const multiplier=npc?1:1+1.8*(1-z*z*(3-2*z));
    return {version:ratingRulesVersion,rings,multiplier,crazy:1.75*multiplier,divine:2.10*multiplier,phase:npc?'独立档案':rings<4?'低环校准':rings===4?'四环过渡':rings===5?'五环回落':'原有标准'};
  }
  function rating(model){
    const standard=benchmark(model.level).base,score=Math.round(KEYS.reduce((sum,k)=>sum+model.stats[k],0)/6/standard*10000)/10000;
    const thresholds=ratingThresholds(model.level,{npc:model.ratingProfile==='npc'});
    const title=score<1?'纸':score<1.35?'并':score<1.60?'强':score<thresholds.crazy?'凶':score<thresholds.divine?'狂':'神';
    return {score:round2(score),label:title+'级',thresholds,basis:'六维均值 / 同等级标准 '+standard+'；当前狂级≥'+round2(thresholds.crazy)+'倍、神级≥'+round2(thresholds.divine)+'倍，不含临时增益'};
  }
  const api={calculationVersion:11,ratingRulesVersion,ratingThresholds,ringFloor,ringRange,soulControl,setResourceConfig,getResourceConfig:()=>({...resourceConfig}),skillBudget,rating,KEYS,LABELS,BASE,GRADE,STYLE,CAPS,BAND_LIMITS,BANDS,QS,WEIGHTS,CATEGORIES,benchmark,shapeMods,mainStyles,isMental,derive,buildStats,controlEffect,band,pickCategory,makeSkill,round2};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessRules=api;
})(typeof globalThis==='undefined'?this:globalThis);

// Final V13 examiner data; no historical template mutations.
(function(root){
  const templates=[
  {
    "id": "qinyan",
    "name": "秦衍",
    "weapon": "极光",
    "tier": 7,
    "style": "强攻",
    "kind": "特殊",
    "subkind": "元素",
    "attribute": "雷",
    "portrait": "秦衍",
    "source": "用户2026-10-16新版一至五技；第六为10.07候选",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "极速",
        "category": "强化",
        "modernEffect": "qinyanSpeed",
        "selfOnly": true,
        "costPercent": 0.06,
        "castFixed": 0.5,
        "cd": 12,
        "description": "极速：肉体强度提高35%、敏捷30%，最多四个动作或24秒；普通形态结束后轻度疲劳，半能量形态无身体负荷。"
      },
      {
        "name": "置换",
        "category": "防御",
        "modernEffect": "qinyanSwap",
        "selfOnly": true,
        "costPercent": 0.06,
        "castFixed": 0.5,
        "cd": 10,
        "description": "与极光锚点置换，准备过程可被打断，完成后4秒内避开一次直接生命伤害；重炮过热时不能发动。"
      },
      {
        "name": "雷化·冲击雷矢",
        "category": "攻击",
        "channel": "能量",
        "factor": 1.35,
        "castFixed": 0.8,
        "cd": 7,
        "fx": "lightning",
        "sharedCooldown": "qinyan-spear",
        "description": "冲击雷矢直接爆炸；倍率1.35、读条0.8秒，与操控雷矢共用冷却。",
        "subActions": [
          {
            "name": "雷化·操控雷矢",
            "category": "持续伤害",
            "channel": "能量",
            "factor": 1.15,
            "castFixed": 0.8,
            "cd": 7,
            "fx": "lightning",
            "dotFirstMs": 1200,
            "dotTicks": 1,
            "sharedCooldown": "qinyan-spear",
            "description": "操控雷矢命中部署，1.2秒后爆炸；与冲击型共用冷却。"
          }
        ]
      },
      {
        "name": "重炮",
        "category": "攻击",
        "channel": "物理",
        "factor": 2.05,
        "castFixed": 1.35,
        "cd": 8,
        "hitKind": "blunt",
        "modernEffect": "railgun",
        "description": "电磁动能重炮，倍率2.05、读条1.35秒；普通形态单臂过热6秒，过热时不能置换；半能量形态无新增过热。",
        "costMultiplier": 0.9
      },
      {
        "name": "乌拉诺斯",
        "category": "强化",
        "modernEffect": "uranus",
        "selfOnly": true,
        "costPercent": 0.08,
        "castFixed": 0.75,
        "cd": 24,
        "description": "支付6%最大精神护持，半能量化12秒；肉体强度提高25%，刺斩减伤20%，其他技费用降低22%；极速无负荷，重炮无新增过热。结束后仍需精神蓄养。"
      },
      {
        "name": "极光·天极贯流",
        "category": "攻击",
        "channel": "能量",
        "attackSubtype": "multi",
        "factor": 1.65,
        "modernEffect": "qinyanSix",
        "castFixed": 1.3,
        "cd": 18,
        "fx": "lightning",
        "description": "三段极光贯流共用命中，总倍率1.65；半能量形态读条0.9秒，不附送必中或永久破甲。"
      }
    ],
    "originalTier": 7,
    "registeredLevel": 55
  },
  {
    "id": "xiaowen",
    "name": "晓雯",
    "weapon": "红拂尘刃",
    "tier": 7,
    "style": "敏攻",
    "kind": "器",
    "subkind": "战斗",
    "attribute": "无属性·斩切",
    "portrait": "晓雯",
    "source": "晓雯 2017年17楼",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "尘刃·锐",
        "category": "攻击",
        "channel": "物理",
        "factor": 1.5,
        "penetration": 0.2,
        "castFixed": 0.8,
        "cd": 6,
        "fx": "slash",
        "description": "锋锐斩击，穿透20%常规防御，短读条，可重复的付费物理攻击。"
      },
      {
        "name": "尘刃·体振",
        "category": "强化",
        "fx": "slash",
        "buff": 0.15,
        "agility": 0.24,
        "duration": 7,
        "description": "身体增幅，攻击提高15%、敏捷提高24%。 持续整场。",
        "burstActions": 0,
        "buffMode": "battle"
      },
      {
        "name": "尘刃·尘镜",
        "category": "防御",
        "fx": "crystal",
        "oneHit": true,
        "description": "一次性护盾，接住一次攻击后无论余量都消散。"
      },
      {
        "name": "拂刃·虹影",
        "category": "控制",
        "fx": "ribbon",
        "baseControl": 1.6,
        "description": "暗红魂力牵制，打断读条；持续时间受到双方精神力影响。",
        "castMultiplier": 1,
        "costMultiplier": 1
      },
      {
        "name": "尘刃·凝锋",
        "category": "攻击",
        "factor": 1.3,
        "channel": "物理",
        "penetration": 0.4,
        "cd": 12,
        "castFixed": 0.9,
        "description": "将锋锐集中于刃尖，穿透40%常规防御的付费斩击。"
      },
      {
        "name": "虹影·回缚",
        "category": "控制",
        "baseControl": 1.8,
        "cd": 13,
        "description": "虹影交错回拉，精神判定后束缚并打断目标，结束后4秒免控。"
      }
    ],
    "originalTier": 5
  },
  {
    "id": "yixing",
    "name": "李一行",
    "weapon": "霸王绝刀",
    "tier": 7,
    "style": "强攻",
    "kind": "器",
    "subkind": "战斗",
    "attribute": "无属性·力量",
    "portrait": "李一行",
    "source": "李一行 2016年23992楼",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "苍龙破",
        "category": "攻击",
        "channel": "物理",
        "fx": "slash",
        "rageGain": 1,
        "factor": 0.95,
        "description": "刀气命中积攒1层霸气。"
      },
      {
        "name": "怒风旋",
        "category": "攻击",
        "channel": "物理",
        "fx": "wind",
        "rageGain": 1,
        "factor": 0.85,
        "castExtra": -0.25,
        "description": "短读条刀风，命中积攒1层霸气。"
      },
      {
        "name": "玄重罡",
        "category": "防御",
        "fx": "crystal",
        "guard": 0.7,
        "oneHit": true,
        "rageOnBreak": true,
        "description": "下一次生命伤害降低70%，消散时积攒1层霸气。"
      },
      {
        "name": "霸刀斩",
        "category": "攻击",
        "channel": "物理",
        "fx": "slash",
        "rageSpend": true,
        "maxUses": 3,
        "factor": 1.1,
        "controlOnHit": 0.5,
        "cd": 12,
        "description": "消耗最多3层霸气提高伤害；3层时追加短眩晕。最多使用3次。"
      },
      {
        "name": "霸意凝罡",
        "category": "强化",
        "buff": 0.18,
        "agility": 0.1,
        "description": "霸意凝聚，攻击提高18%、敏捷提高10%，持续整场；不额外赠送霸气。"
      },
      {
        "name": "绝刀·破势",
        "category": "攻击",
        "factor": 1.25,
        "channel": "物理",
        "penetration": 0.25,
        "cd": 12,
        "rageGain": 1,
        "description": "循守势破绽斩击，穿透25%常规防御，命中获得一层霸气；全战累计至多五层。"
      }
    ],
    "originalTier": 7
  },
  {
    "id": "anmu",
    "name": "暗牧",
    "weapon": "噬魂毒蝎",
    "tier": 7,
    "style": "控制",
    "kind": "兽",
    "subkind": "虫",
    "attribute": "毒",
    "portrait": "暗牧",
    "source": "当前登记 用户补充的五类毒素；演绎2017年1883楼",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "麻痹毒素",
        "category": "控制",
        "fx": "poison",
        "baseControl": 1.6,
        "description": "麻痹牵制，控制成功后打断读条。",
        "castMultiplier": 1,
        "costMultiplier": 1
      },
      {
        "name": "腐蚀毒素",
        "category": "持续伤害",
        "channel": "能量",
        "fx": "poison",
        "factor": 1.25,
        "corrode": 0.12,
        "description": "强化腐蚀：三跳毒伤（1、4、7秒），降低12%防御，激化可增幅正在生效的毒伤。 精神力转化为毒效，额外采用35%精神攻击值，仍结算生命通道。",
        "poisonScaling": 0.35,
        "costMultiplier": 0.85,
        "dotFirstMs": 1000
      },
      {
        "name": "激化毒素",
        "category": "强化",
        "fx": "poison",
        "dotBuff": 0.45,
        "duration": 10,
        "description": "激化现有与后续毒伤45%，并使自身敏捷提高12%，持续整场。",
        "burstActions": 0,
        "buffMode": "battle",
        "agility": 0.12
      },
      {
        "name": "亢奋毒素",
        "category": "强化",
        "buff": 0.12,
        "agility": 0.25,
        "description": "亢奋毒素增强身体，攻击提高12%、敏捷提高25%，持续整场。"
      },
      {
        "name": "引发毒素",
        "category": "攻击",
        "channel": "能量",
        "fx": "poison",
        "detonate": true,
        "factor": 0.55,
        "cd": 10,
        "description": "引爆该目标身上自己尚未结算的毒伤，消耗对应毒状态。 精神力转化为毒效，额外采用35%精神攻击值，仍结算生命通道。",
        "poisonScaling": 0.35
      },
      {
        "name": "蝎尾封脉",
        "category": "减益",
        "effects": [
          {
            "key": "C",
            "value": 0.18
          },
          {
            "key": "S",
            "value": 0.12
          }
        ],
        "effectSeed": "proposal-蝎尾封脉",
        "description": "魂力操纵降低18%、魂力强度降低12%；一次精神判定，持续整场。"
      }
    ],
    "originalTier": 6
  },
  {
    "id": "hash",
    "name": "哈什",
    "weapon": "晦光铭符",
    "tier": 7,
    "style": "控制",
    "kind": "本体",
    "subkind": "皮肤",
    "attribute": "无属性·幻象",
    "portrait": null,
    "source": "当前登记 哈什用户补充完整原文",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "虚像投影",
        "category": "强化",
        "channel": "能量",
        "evasion": 0.22,
        "costPercent": 0.08,
        "fx": "ghost",
        "description": "无攻击幻像干扰瞄准，闪避提高22个百分点，持续整场；精神攻击仍按精神通道命中。",
        "burstActions": 0,
        "buffMode": "battle",
        "castFixed": 0.5,
        "costMultiplier": 0.8
      },
      {
        "name": "虚空匿行",
        "category": "强化",
        "channel": "能量",
        "evasion": 0.35,
        "buff": 0.28,
        "burstActions": 4,
        "costPercent": 0.1,
        "castFixed": 0.5,
        "cd": 14,
        "fx": "ghost",
        "description": "隐匿准备0.5秒，攻击提高28%、闪避提高35个百分点，持续随后四个完成动作（含附赠普攻）。幻像不独立攻击。",
        "buffMode": "actions"
      },
      {
        "name": "虚能爆裂",
        "category": "控制",
        "channel": "能量",
        "baseControl": 2,
        "dispel": 0.6,
        "chipFactor": 0.55,
        "costPercent": 0.08,
        "cd": 10,
        "castFixed": 0.5,
        "fx": "wave",
        "description": "实体铭符爆裂，精神驱动能量伤害，削去60%生命盾，并按正常精神对抗控制与打断；获得下一次能量攻击40%免伤，最多6秒。",
        "castMultiplier": 1,
        "costMultiplier": 1,
        "energyWard": true,
        "energyWardRate": 0.4,
        "energyWardDuration": 6
      },
      {
        "name": "虚实刻印",
        "category": "攻击",
        "channel": "能量",
        "mindPower": true,
        "factor": 2.75,
        "cd": 7,
        "fx": "ghost",
        "description": "实体铭符以精神力驱动能量刻印，倍率2.75、读条0.65秒，沿用2.2倍率费用预算后减耗28%；幻像不攻击。",
        "costMultiplier": 0.72,
        "castFixed": 0.65,
        "budgetFactor": 2.2
      },
      {
        "name": "铭符折护",
        "category": "防御",
        "fx": "ghost",
        "description": "实体铭符折叠防护，盾量提高25%，持续10秒；不回复生命。",
        "shieldMultiplier": 1.25,
        "shieldDuration": 10,
        "costMultiplier": 0.9
      },
      {
        "name": "晦光滞流",
        "category": "减益",
        "effects": [
          {
            "key": "C",
            "value": 0.24
          },
          {
            "key": "A",
            "value": 0.18
          }
        ],
        "effectSeed": "proposal-晦光滞流",
        "description": "晦光扰流：魂力操纵降低24%、敏捷降低18%；共享一次精神判定，持续整场，同源不叠加。"
      }
    ],
    "originalTier": 6
  },
  {
    "id": "yixiaobei",
    "name": "伊筱蓓",
    "weapon": "花露",
    "tier": 7,
    "style": "辅助",
    "kind": "器",
    "subkind": "辅助植物",
    "attribute": "复合·木/毒",
    "portrait": "伊筱蓓",
    "support": true,
    "source": "伊筱蓓 2016年6043楼",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "曼陀罗花露",
        "category": "持续伤害",
        "channel": "能量",
        "fx": "poison",
        "factor": 0.9,
        "description": "向敌方施加三跳毒伤。"
      },
      {
        "name": "玫瑰花露",
        "category": "控制",
        "fx": "petal",
        "baseControl": 1.5,
        "description": "魅惑牵制，成功率与持续时间受精神力对抗影响。",
        "castMultiplier": 1,
        "costMultiplier": 1
      },
      {
        "name": "罂粟花露",
        "category": "强化",
        "fx": "petal",
        "buff": 0.2,
        "agility": 0.15,
        "duration": 8,
        "fatigue": true,
        "description": "队友攻击提高20%、敏捷提高15%，持续自己3个动作；结束后6秒输出降低10%。",
        "burstActions": 3,
        "buffMode": "actions"
      },
      {
        "name": "玫瑰花露·缠枝",
        "category": "减益",
        "fx": "petal",
        "baseControl": 1.5,
        "description": "将玫瑰牵制拆出缠枝，减速18%，并判定削防；两项效果均持续8秒，同来源再次施放刷新时限。",
        "statusLifetime": "timed",
        "slow": 0.18,
        "duration": 8
      },
      {
        "name": "栀子花露",
        "category": "防御",
        "fx": "petal",
        "description": "花露凝成生命防护薄膜，持续8秒，不回复生命。"
      },
      {
        "name": "铃兰花露",
        "category": "减益",
        "effects": [
          {
            "key": "A",
            "value": 0.18
          },
          {
            "key": "S",
            "value": 0.1
          }
        ],
        "effectSeed": "proposal-铃兰花露",
        "description": "花露毒性阻滞行动，敏捷降低18%、魂力强度降低10%；一次精神判定，持续整场。"
      }
    ],
    "originalTier": 5
  },
  {
    "id": "xiaweiyu",
    "name": "夏维宇",
    "weapon": "血君",
    "tier": 7,
    "style": "敏攻",
    "kind": "兽",
    "subkind": "超自然兽",
    "attribute": "复合·血/暗",
    "portrait": "夏维宇",
    "registeredLevel": 74,
    "source": "登记文件·搬运帖17楼",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "血涌",
        "category": "强化",
        "buff": 0.25,
        "agility": 0.25,
        "duration": 12,
        "fx": "blood",
        "description": "血流加速，攻击与敏捷提高25%。 持续整场。",
        "burstActions": 0,
        "buffMode": "battle"
      },
      {
        "name": "血噬",
        "category": "攻击",
        "channel": "物理",
        "factor": 0.8,
        "slow": 0.2,
        "duration": 7,
        "manaDrain": 0.06,
        "manaReturn": 0.04,
        "fx": "blood",
        "description": "击伤后汲取少量魂力，目标减速20%；不回复生命。 吸魂反哺每战至多2次，每次最多2%最大魂力。"
      },
      {
        "name": "血烟",
        "category": "强化",
        "evasion": 0.18,
        "agility": 0.18,
        "controlWard": true,
        "duration": 7,
        "fx": "blood",
        "description": "位移避让，获得闪避增幅与效果存续期间免控。",
        "burstActions": 3,
        "buffMode": "actions"
      },
      {
        "name": "血蝠",
        "category": "持续伤害",
        "channel": "物理",
        "factor": 1.05,
        "fx": "blood",
        "description": "蝠群连续撕咬，三跳持续伤害。"
      },
      {
        "name": "血锢",
        "category": "控制",
        "baseControl": 1,
        "requireBlood": true,
        "cd": 12,
        "description": "须先以本体攻击留下血伤标记，在目标施法时发动；精神判定后禁锢约1秒并打断，结束后4秒免控。",
        "castFixed": 0.5,
        "bloodInterrupt": true
      },
      {
        "name": "血夜",
        "category": "减益",
        "effects": [
          {
            "key": "A",
            "value": 0.15
          },
          {
            "key": "S",
            "value": 0.12
          }
        ],
        "effectSeed": "proposal-血夜",
        "description": "血雾降低敌方敏捷15%、魂力强度12%并干扰命中；自身攻击提高15%。领域内首次攻击锁定并增伤35%，有50%几率短暂禁锢，仍受免控保护。",
        "bloodDomain": true
      }
    ],
    "originalTier": 8
  },
  {
    "id": "quan",
    "name": "瑔",
    "weapon": "冥邪剑",
    "tier": 7,
    "style": "强攻",
    "kind": "器",
    "subkind": "战斗",
    "attribute": "暗",
    "portrait": "瑔",
    "registeredLevel": 53,
    "source": "登记文件·搬运帖18楼",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "冥邪斩",
        "category": "攻击",
        "channel": "物理",
        "factor": 0.855,
        "fx": "dark",
        "description": "暗属性斩击。",
        "budgetFactor": 1
      },
      {
        "name": "半生浮屠",
        "category": "强化",
        "buff": 0.18,
        "agility": 0.1,
        "duration": 10,
        "fx": "dark",
        "description": "提高攻击18%、敏捷10%，不回复生命。 持续整场。",
        "burstActions": 0,
        "buffMode": "battle"
      },
      {
        "name": "冥邪剑法·七式",
        "category": "持续伤害",
        "channel": "物理",
        "factor": 0.81,
        "fx": "dark",
        "description": "七式连剑改编为三次延迟剑伤。",
        "budgetFactor": 1.15
      },
      {
        "name": "冥邪剑法·终式",
        "category": "攻击",
        "channel": "物理",
        "factor": 0.855,
        "fx": "dark",
        "description": "从七式剑法拆出最后一式，凝聚暗属性剑锋作收束斩击。",
        "budgetFactor": 1.15
      },
      {
        "name": "冥邪剑法·封式",
        "category": "控制",
        "baseControl": 1.5,
        "cd": 13,
        "description": "七式中的封势牵制目标，精神判定后短暂控制并打断，结束后4秒免控。"
      },
      {
        "name": "冥邪剑法·归刃",
        "category": "攻击",
        "factor": 1.3,
        "channel": "物理",
        "penetration": 0.25,
        "cd": 12,
        "description": "七式归刃凝锋，穿透25%常规防御；不附加生命回复。"
      }
    ],
    "originalTier": 7
  },
  {
    "id": "minghuan",
    "name": "明缓",
    "weapon": "风龙枪",
    "tier": 7,
    "style": "强攻",
    "kind": "器",
    "subkind": "战斗",
    "attribute": "风",
    "portrait": "明缓",
    "registeredLevel": 40,
    "source": "登记文件·搬运帖14楼",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "风炮",
        "category": "攻击",
        "channel": "能量",
        "factor": 1,
        "fx": "wind",
        "description": "凝聚风元素的炮击。"
      },
      {
        "name": "风罩",
        "category": "防御",
        "oneHit": true,
        "fx": "wind",
        "description": "局部风罩，抵挡一次攻击后消散。"
      },
      {
        "name": "凤龙诀",
        "category": "攻击",
        "channel": "能量",
        "factor": 1.2,
        "castExtra": 0.4,
        "fx": "wind",
        "description": "图腾风箭齐射，增加准备时间与伤害。"
      },
      {
        "name": "凤龙诀·风箭",
        "category": "攻击",
        "channel": "能量",
        "factor": 0.9,
        "castExtra": 0,
        "fx": "wind",
        "description": "从凤龙诀图腾风箭齐射拆出短读条风箭。"
      },
      {
        "name": "风脉回旋",
        "category": "强化",
        "buff": 0.18,
        "agility": 0.15,
        "description": "风流沿枪身回旋，攻击提高18%、敏捷提高15%，持续整场。"
      },
      {
        "name": "凤龙穿岚",
        "category": "攻击",
        "factor": 1.4,
        "channel": "能量",
        "penetration": 0.2,
        "cd": 12,
        "castExtra": 0.3,
        "description": "图腾风箭收束为炮击，穿透20%常规防御；需准备并支付魂力。"
      }
    ],
    "originalTier": 6
  },
  {
    "id": "linluoying",
    "name": "林洛樱",
    "weapon": "夹竹桃",
    "tier": 7,
    "style": "控制",
    "kind": "器",
    "subkind": "辅助植物",
    "attribute": "复合·木/毒",
    "portrait": "林洛樱",
    "registeredLevel": 50,
    "source": "登记文件·搬运帖10楼",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "毒瓣飞刃",
        "category": "持续伤害",
        "channel": "能量",
        "factor": 1,
        "corrode": 0.1,
        "fx": "petal",
        "description": "锋锐毒瓣造成持续毒伤并轻度削防。 精神力转化为毒效，额外采用85%精神攻击值，仍结算生命通道。",
        "poisonScaling": 0.85
      },
      {
        "name": "重力花场",
        "category": "持续伤害",
        "slow": 0.25,
        "costUp": 0.2,
        "duration": 9,
        "fx": "petal",
        "description": "夹竹桃毒压随重力花场持续侵蚀，三跳毒伤；目标减速25%、魂技消耗提高20%，持续9秒。 精神力转化为毒效，额外采用85%精神攻击值，仍结算生命通道。",
        "channel": "能量",
        "factor": 1,
        "poisonScaling": 0.85
      },
      {
        "name": "花息增幅",
        "category": "强化",
        "buff": 0.2,
        "agility": 0.2,
        "duration": 10,
        "fx": "petal",
        "description": "攻击与敏捷提高20%。 持续整场。",
        "burstActions": 0,
        "buffMode": "battle"
      },
      {
        "name": "夹竹桃缚",
        "category": "控制",
        "baseControl": 2,
        "fx": "petal",
        "description": "脚下花瓣合拢，精神对抗后控制目标。",
        "castMultiplier": 1,
        "costMultiplier": 1
      },
      {
        "name": "桃毒蚀脉",
        "category": "减益",
        "effects": [
          {
            "key": "S",
            "value": 0.16
          },
          {
            "key": "C",
            "value": 0.12
          }
        ],
        "effectSeed": "proposal-桃毒蚀脉",
        "description": "桃毒扰乱魂力，魂力强度降低16%、操纵降低12%；一次精神判定，持续整场。"
      },
      {
        "name": "叠瓣毒潮",
        "category": "持续伤害",
        "factor": 1.2,
        "channel": "能量",
        "poisonScaling": 0.65,
        "fx": "poison",
        "cd": 13,
        "description": "叠瓣释放三跳毒潮，同技不叠层；精神力参与毒伤，不免费刷新其他毒素。"
      }
    ],
    "originalTier": 6
  },
  {
    "id": "qingling",
    "name": "清凌",
    "weapon": "骷髅鬼剑",
    "tier": 7,
    "style": "强攻",
    "kind": "器",
    "subkind": "战斗",
    "attribute": "复合·光/暗",
    "portrait": "清凌",
    "registeredLevel": 72,
    "source": "登记文件·搬运帖11楼",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "鬼之领域",
        "category": "减益",
        "slow": 0.1,
        "duration": 10,
        "fx": "dark",
        "description": "领域削防并压低目标行动速度。"
      },
      {
        "name": "死神沾染",
        "category": "强化",
        "buff": 0.18,
        "manaRestore": 0.04,
        "duration": 10,
        "fx": "dark",
        "description": "提高攻击18%，释放时回复2%魂力。 持续整场。",
        "burstActions": 0,
        "buffMode": "battle"
      },
      {
        "name": "大千剑阵",
        "category": "攻击",
        "channel": "物理",
        "factor": 0.8800000000000001,
        "fx": "slash",
        "description": "剑阵集中打击，数量整合为一次结算。",
        "budgetFactor": 1.1
      },
      {
        "name": "绝望审判",
        "category": "持续伤害",
        "channel": "能量",
        "factor": 1,
        "corrode": 0.12,
        "fx": "dark",
        "description": "生亡碾压留下持续侵蚀。",
        "budgetFactor": 1.25
      },
      {
        "name": "凤舞六幻",
        "category": "强化",
        "buff": 0.22,
        "agility": 0.3,
        "evasion": 0.1,
        "fx": "ghost",
        "description": "展开五道分身，攻击提高22%、敏捷提高30%、闪避提高10个百分点，生命攻击穿透10%常规防御。可花一次行动泯灭分身，各增加6%攻击与敏捷；换位每战一次，消耗的分身不提供泯灭增幅。",
        "phantomDance": true,
        "maxUses": 1
      },
      {
        "name": "鬼剑·裁魂",
        "category": "攻击",
        "factor": 1.25,
        "channel": "物理",
        "penetration": 0.3,
        "cd": 12,
        "description": "鬼剑凝成穿透斩，穿透30%常规防御。"
      }
    ],
    "originalTier": 8
  },
  {
    "id": "yanan",
    "name": "莫言安",
    "weapon": "逸仙剑",
    "tier": 7,
    "style": "强攻",
    "kind": "器",
    "subkind": "战斗",
    "attribute": "风",
    "portrait": "莫言安",
    "provisional": false,
    "source": "D:/QQ/【人设】.md",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "断空",
        "category": "攻击",
        "channel": "能量",
        "factor": 1,
        "penetration": 0.25,
        "castExtra": -0.2,
        "fx": "wind",
        "description": "凝聚剑尖风刃斩出或突刺，穿透25%常规防御。"
      },
      {
        "name": "回风叠絮",
        "category": "持续伤害",
        "channel": "能量",
        "factor": 1.15,
        "fx": "wind",
        "description": "共鸣风卷夹杂细小风刃，连续剑击叠加为三次延迟风刃伤害。"
      },
      {
        "name": "逸仙剑体",
        "category": "强化",
        "buff": 0.12,
        "soulArmor": 0.3,
        "fx": "wind",
        "description": "铭文浮现，攻击提高12%；抵御生命攻击时消耗魂力，每抵挡1点伤害消耗0.3点魂力，至多抵挡该次伤害30%。持续整场，可主动关闭防护。"
      },
      {
        "name": "不尘",
        "category": "减益",
        "slow": 0.18,
        "costUp": 0,
        "duration": 9,
        "fieldEvasion": 0.12,
        "statusLifetime": "timed",
        "genericDefDown": false,
        "fx": "wind",
        "description": "张开无尘领域，近身斥退和飞行道具阻力改编为9秒减速18%，自身感知获得12个百分点闪避，持续9秒；范围与距离在当前斗魂模型中不单独计算。"
      },
      {
        "name": "裂穹",
        "category": "攻击",
        "factor": 2,
        "channel": "能量",
        "castFixed": 2.5,
        "costPercent": 0.18,
        "cd": 18,
        "fx": "wind",
        "description": "灌注魂力展开青白光剑，长读条高威力风属性攻击；不额外添加超过原设十米的距离收益。"
      },
      {
        "name": "风铭回锋",
        "category": "防御",
        "modernEffect": "yananGuard",
        "selfOnly": true,
        "castFixed": 0.5,
        "costPercent": 0.08,
        "cd": 14,
        "description": "回收风压迎击：下一次直接物理/能量施法造成的伤害在防御前降低30%，最多保留4秒；不额外生成护盾，不抵御精神或已挂持续伤害。"
      }
    ],
    "originalTier": 7,
    "registeredLevel": 59
  },
  {
    "id": "xuejidong",
    "name": "雪寂冬",
    "weapon": "银岭冰刃龙",
    "tier": 7,
    "style": "强攻",
    "kind": "兽",
    "subkind": "爬行",
    "attribute": "冰",
    "portrait": "雪寂冬",
    "provisional": false,
    "source": "用户提供的雪寂冬正式人设与魂技原文",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "寒龙之身",
        "category": "强化",
        "buff": 0,
        "coldOnHit": 0.153,
        "fx": "ice",
        "description": "身周冰雾持续整场，每次命中的攻击附带低温能量伤害；不额外创造攻击动作。",
        "budgetColdOnHit": 0.18
      },
      {
        "name": "寒影奔袭",
        "category": "攻击",
        "channel": "物理",
        "factor": 0.5525,
        "secondaryFactor": 0.2975,
        "secondaryChannel": "物理",
        "budgetFactor": 1,
        "slow": 0.15,
        "duration": 3,
        "controlOnHit": 0.8,
        "controlAlways": true,
        "castExtra": -0.2,
        "fx": "ice",
        "description": "直线奔袭撞击与翼刃割裂分两段结算，附带3秒15%减速，命中后尝试短眩晕；受精神判定与全局免控限制。"
      },
      {
        "name": "银翼刃锋",
        "category": "强化",
        "buff": 0.18,
        "agility": 0.2,
        "evasion": 0.06,
        "fx": "ice",
        "description": "强化翼刃锋锐与操控，攻击提高18%、敏捷提高20%、闪避提高6个百分点，持续整场；飞行优势在无距离模型中转为敏捷与闪避。"
      },
      {
        "name": "冰极之怒",
        "category": "攻击",
        "channel": "能量",
        "factor": 0.7224999999999999,
        "secondaryFactor": 0.2975,
        "secondaryChannel": "能量",
        "budgetFactor": 1.2,
        "penetration": 0.15,
        "castExtra": 0.3,
        "fx": "ice",
        "description": "掌心寒气命中后爆开并侵入体内再次爆炸，两段冰属性伤害；主段穿透15%常规防御。按近身切磋数值建模，尚不单独计算距离。"
      },
      {
        "name": "寒锋龙躯",
        "category": "强化",
        "effects": [
          {
            "key": "D",
            "value": 0.22
          },
          {
            "key": "B",
            "value": 0.12
          },
          {
            "key": "A",
            "value": 0.1
          }
        ],
        "effectSeed": "proposal-ice-armor",
        "fx": "ice",
        "description": "寒锋冰甲使防御素质提高22%、肉体强度提高12%、敏捷提高10%；冰甲额外抵御18%物理与能量伤害，持续整场。",
        "iceArmor": 0.18
      },
      {
        "name": "冻气龙卷",
        "category": "持续伤害",
        "factor": 1.35,
        "channel": "能量",
        "slow": 0.15,
        "duration": 4,
        "costPercent": 0.16,
        "cd": 16,
        "fx": "ice",
        "description": "冻气与冰屑形成低温龙卷，三次冰属性残伤，并短时迟缓目标。"
      }
    ],
    "originalTier": 8,
    "registeredLevel": 97,
    "age": 47,
    "gender": "男",
    "nationality": "星罗"
  },
  {
    "id": "yiqiran",
    "name": "伊其然",
    "weapon": "魔导书",
    "tier": 7,
    "style": "辅助",
    "kind": "器",
    "subkind": "辅助",
    "attribute": "无属性·魂力塑形",
    "portrait": "伊其然",
    "support": true,
    "registeredLevel": 41,
    "source": "登记文件·搬运帖8楼，41级上限版",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "魂力之手",
        "category": "控制",
        "baseControl": 1.2,
        "fx": "wave",
        "description": "魂力波动推拉，成功后打断行动。",
        "castMultiplier": 1,
        "costMultiplier": 1
      },
      {
        "name": "魂力护甲",
        "category": "防御",
        "fx": "crystal",
        "description": "魂力薄膜防护，受盾量上限约束。"
      },
      {
        "name": "魂力飞弹",
        "category": "攻击",
        "channel": "能量",
        "factor": 0.95,
        "fx": "wave",
        "description": "多枚飞弹合并结算。"
      },
      {
        "name": "羽落术",
        "category": "强化",
        "evasion": 0.12,
        "duration": 9,
        "fx": "wind",
        "description": "减缓坠落改编为位移避让，降低受到攻击的命中率。 持续整场。",
        "burstActions": 0,
        "buffMode": "battle"
      },
      {
        "name": "魂力护甲·折膜",
        "category": "防御",
        "guard": 0.4,
        "oneHit": true,
        "cd": 12,
        "description": "将魂力护甲折成局部膜，抵挡一次来袭伤害的40%；不增加人物魂环。"
      },
      {
        "name": "魂力飞弹·聚束",
        "category": "攻击",
        "factor": 1.5,
        "channel": "能量",
        "castFixed": 1.4,
        "costPercent": 0.14,
        "cd": 12,
        "description": "将原有飞弹聚束释放，较长读条造成能量伤害；不增加人物魂环。"
      }
    ],
    "originalTier": 6
  },
  {
    "id": "linshi",
    "name": "林式",
    "weapon": "光元古符",
    "tier": 7,
    "style": "控制",
    "kind": "器",
    "subkind": "符文",
    "attribute": "光",
    "portrait": null,
    "registeredLevel": 41,
    "ownerId": "o0h2",
    "source": "用户10.08登记；第五、第六魂技为游戏扩展",
    "note": "原登记41级，战斗按实际环数开放六技库。实验后外貌定格14岁，黑发金瞳，身高140cm。实体与空间作用采用单目标文字战斗抽象。",
    "skills": [
      {
        "name": "实体化",
        "category": "强化",
        "selfOnly": true,
        "effects": [
          {
            "key": "S",
            "value": 0.15
          },
          {
            "key": "C",
            "value": 0.15
          }
        ],
        "description": "聚合高浓度光元素造出实体光，靠自身魂力驱动；本作抽象为魂力强度、魂力操纵各提高15%，同源不叠加。"
      },
      {
        "name": "光之波动",
        "category": "控制",
        "baseControl": 1.2,
        "fx": "wave",
        "description": "使光元素浓稠并剧烈波动，按正常精神判定干扰并打断敌方行动。"
      },
      {
        "name": "能量之源·光缚",
        "category": "控制",
        "channel": "能量",
        "modernEffect": "linEnergy",
        "cd": 14,
        "description": "控制主技：实体光冲击以精神力驱动（0.65倍率能量伤害），随后按正常精神对抗施加基础2.5秒光缚并打断。仅控制成功时附带抽离目标当前魂力8%，单次不超过目标基础魂力6%，整场最多两次；将实际抽离量25%转为自身魂力，单次不超过自身基础魂力1.5%。免控或抵抗时不吸蓝。",
        "baseControl": 2.5,
        "castFixed": 0.75,
        "costPercent": 0.08,
        "costMultiplier": 0.8,
        "chipFactor": 0.65
      },
      {
        "name": "太阳普照",
        "modernEffect": "linSun",
        "category": "攻击",
        "channel": "能量",
        "factor": 0.6,
        "costPercent": 0.1,
        "castFixed": 1,
        "cd": 8,
        "fx": "fire",
        "description": "每次用1秒与基础魂力上限10%（可受操纵减耗）制造并引爆一枚小太阳；储能释放损失40%已计入0.60倍率。单目标战斗将照射与引爆合并为当次攻击，不另赠魂力池或模拟空间。"
      },
      {
        "name": "古符·光壁",
        "category": "防御",
        "selfOnly": true,
        "modernEffect": "linLightwall",
        "castFixed": 0.75,
        "costPercent": 0.08,
        "cd": 12,
        "description": "【游戏扩展第五技】以实体光符构筑护壁：4秒内获得20%物理、能量防御前免伤，同源不叠加。"
      },
      {
        "name": "古符·曜日连印",
        "category": "攻击",
        "channel": "能量",
        "attackSubtype": "multi",
        "factor": 1.1,
        "budgetFactor": 1.1,
        "castFixed": 1.2,
        "cd": 12,
        "description": "【游戏扩展第六技】三个光印连续引爆，共用一次命中，总原始伤害110%，三段各自经过护盾与防御。"
      }
    ]
  },
  {
    "id": "anjingwen",
    "name": "安景文",
    "weapon": "黄金叶",
    "tier": 7,
    "style": "强攻",
    "kind": "器",
    "subkind": "战斗",
    "attribute": "金",
    "portrait": null,
    "registeredLevel": 49,
    "source": "用户10.08登记；系别与第五、第六魂技为游戏扩展",
    "note": "登记49级；星辰殿天行者卫队外出训练者，不引入宗门剧情。双臂护臂的半米吸附／推送只保留设定，不对人增加额外控制。",
    "skills": [
      {
        "name": "叶刃",
        "category": "强化",
        "selfOnly": true,
        "modernEffect": "goldBlade",
        "castFixed": 0.6,
        "cd": 8,
        "description": "使黄金叶锋锐，进入叶刃形态，物理攻击提高20%；覆盖叶燃形态，两者绝不同时生效。"
      },
      {
        "name": "叶燃",
        "category": "强化",
        "selfOnly": true,
        "modernEffect": "goldBurn",
        "castFixed": 0.6,
        "cd": 8,
        "description": "使黄金叶魂力不稳定，进入叶燃形态，能量攻击提高25%，黄金叶攻击改为能量爆炸；覆盖叶刃形态，两者绝不同时生效。"
      },
      {
        "name": "叶阵",
        "category": "攻击",
        "leafAttack": true,
        "channel": "物理",
        "attackSubtype": "multi",
        "factor": 1.1,
        "budgetFactor": 1.3,
        "costMultiplier": 1.2,
        "castFixed": 1.1,
        "cd": 10,
        "description": "至多36片黄金叶编织叶阵，抽象为三段、一次命中，总原始伤害110%，费用提高；不将36片重复触发为36次附带效果。"
      },
      {
        "name": "黄金左手",
        "category": "强化",
        "selfOnly": true,
        "effects": [
          {
            "key": "B",
            "value": 0.2
          },
          {
            "key": "D",
            "value": 0.2
          }
        ],
        "modernEffect": "goldHand",
        "castFixed": 0.8,
        "cd": 14,
        "description": "左手力量与防御增强，肉体强度、防御素质各提高20%；黄金叶攻击再提高15%，同源不叠加。"
      },
      {
        "name": "黄金叶·回旋屏障",
        "category": "防御",
        "selfOnly": true,
        "modernEffect": "goldWall",
        "castFixed": 0.75,
        "costPercent": 0.08,
        "cd": 12,
        "description": "【游戏扩展第五技】以回旋叶片护住身体，4秒内获得20%物理防御前免伤；护臂的近距离推送不作为对人硬控。"
      },
      {
        "name": "黄金叶·贯阵终击",
        "category": "攻击",
        "leafAttack": true,
        "channel": "物理",
        "factor": 1.45,
        "penetration": 0.2,
        "castFixed": 1.4,
        "costPercent": 0.14,
        "cd": 14,
        "description": "【游戏扩展第六技】汇聚黄金叶进行终击，1.45倍率、20%穿甲；随叶刃／叶燃使用物理锋刃或能量爆炸。"
      }
    ]
  }
];
  root.WitnessTemplates=templates;
})(globalThis);

// Isolated challenge registry and mechanics. Never added to WitnessTemplates.
const ChallengeBattle=(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const id='guildmaster_xuejidong';
function initialize(b,challengeId){
  if(challengeId==='mysterious_scarred_woman')return root.WitnessScarredChallenge.initialize(b);
  if(challengeId!==id)throw Error('未知的独立挑战');
  const original=root.WitnessTemplates.find(t=>t.id==='xuejidong');
  const data=copy(original);
  Object.assign(data,{id,name:'公会会长——雪寂冬',skillLimit:9,statRatio:1.60,registeredLevel:97});
  data.skills.push(
    {name:'武魂真身',category:'强化',autoOnly:true,aiDisabled:true,description:'银岭遗御耗尽，或生命严格低于60%时自动进入真身；不改变生命上限。'},
    {name:'寒龙撕天爪',category:'攻击',channel:'物理',factor:1.20,penetration:.35,fleshFrost:true,castFixed:1.8,cd:14,hitKind:'slash',fx:'ice',description:'冰爪重击，穿透35%防御；直接伤及生命时附加冻伤。'},
    {name:'绝对零度吐息',category:'攻击',channel:'能量',factor:1.50,controlOnHit:2,controlAlways:true,castFixed:2.5,cd:20,fx:'ice',description:'压缩冰雪吐息，命中后按正常判定尝试冻结；并非必中或即死。'});
  const unit=root.WitnessBattle.templateUnit(data,95,'enemy',1),boss=b.unit('enemy');
  Object.assign(boss,unit,{hp:unit.model.derived.HP,mp:unit.model.derived.MP,sh:unit.model.derived.SH});
  boss.skills.push({id:id+'-headbone',name:'头部魂骨·冰棘王冠',sourceKind:'soulbone',ring:0,category:'强化',channel:'生命',selfOnly:true,modernEffect:'iceCrown',cost:Math.ceil(boss.model.derived.baseMP*.10),cast:1,cooldown:25,maxUses:2,fx:'ice',effect:'冰棘王冠唤来暴风雪，冰属性魂技威力提高10%，持续10秒；当前模型不单独计算范围。'});
  boss.guildmaster={version:1,legendaryRemaining:2,transformed:false,processed:[],blocked:[],armor:{B:1.15,D:1.20,A:1.10},dragon:{PA:1.30,SA:1.30,A:1.30},castSlow:.10};
  b.units=b.units.filter(u=>u.id!=='enemySupport');b.challengeId=id;
  b.addLog('独立会长挑战：95级封号斗罗·凶级，九魂技与头部魂骨；原设97级独立保留。',{type:'challengeStart'});
}
function restore(b){
  if(b.challengeId==='mysterious_scarred_woman')return root.WitnessScarredChallenge.validate(b);
  if(!b.challengeId)return;
  if(b.challengeId!==id)throw Error('未知挑战快照');
  const u=b.unit('enemy'),p=u?.guildmaster;
  if(!p||!Number.isInteger(p.legendaryRemaining)||p.legendaryRemaining<0||p.legendaryRemaining>2||!Array.isArray(p.processed)||!Array.isArray(p.blocked)||p.processed.length>2000||p.blocked.length>2000)throw Error('会长被动快照无效');
}
function effective(b,u,out){
  const p=u.guildmaster;if(!p)return out;
  const R=root.WitnessRules,before=R.derive(out),next={...out};
  for(const [k,f]of Object.entries(p.armor))next[k]*=f;
  const after=R.derive(next);
  for(const k of ['PA','SA','MA','DEF','MDEF'])next[k]=out[k]*after[k]/before[k];
  if(p.transformed)for(const [k,f]of Object.entries(p.dragon))next[k]*=f;
  next.HP=out.HP;next.MP=out.MP;next.SH=out.SH;return next;
}
function resourceChange(b,u){
  const p=u.guildmaster;if(!p||p.transformed||!b.alive(u))return;
  if(p.legendaryRemaining===0||u.hp/u.model.derived.HP<.60){p.transformed=true;b.addLog(u.name+'启动双重龙化·真身，攻击与敏捷进入额外30%乘区；生命不变。',{type:'transform',actor:u.id,hp:u.hp,maxHP:u.model.derived.HP});}
}
function blockControl(b,u,t,s,key){
  const p=t?.guildmaster;if(!p||!b.alive(t))return false;
  if(p.blocked.includes(key))return true;
  if(p.legendaryRemaining<=0)return false;
  p.blocked.push(key);p.legendaryRemaining--;
  b.addLog(t.name+'发动银岭遗御：'+s.name+'固定失败，不进行控制判定；剩余'+p.legendaryRemaining+'次。',{type:'resist',actor:u.id,target:t.id,legendary:true,remaining:p.legendaryRemaining});resourceChange(b,t);return true;
}
function completed(b,u,cast){
  const p=u.guildmaster;if(!p||!b.alive(u)||(!cast.skill&&!['attack','defend','defendSH','dodge','calm'].includes(cast.action)))return;
  const key=cast.eventId;if(!key||p.processed.includes(key))return;p.processed.push(key);
  for(const t of b.units.filter(v=>v.team!==u.team&&b.alive(v))){
    const source=u.id+':frostThorns',old=b.status(t,'statDownA').find(s=>s.source===source),stacks=(old?.stacks||0)+1;
    b.setStatus(t,'statDownA',stacks*.10,180.001,{source,label:'霜棘',from:u.name,stacks,unavoidable:true});
    b.setStatus(t,'frostCastSlow',p.castSlow,180.001,{source:u.id+':frostCast',label:'冰结',from:u.name,unavoidable:true});
    const max=t.release==='召唤'?t.bodyMax:t.model.derived.HP,nominal=Math.max(1,Math.round(max*.05)),before=t.release==='召唤'?t.bodyHP:t.hp;
    if(t.release==='召唤'){t.bodyHP=Math.max(0,t.bodyHP-nominal);t.hp=t.bodyHP+t.petHP;}else t.hp=Math.max(0,t.hp-nominal);
    b.addLog('霜棘'+stacks+'层：'+t.name+'敏捷累计降低'+stacks*10+'%；冰结越盾扣除生命'+(before-(t.release==='召唤'?t.bodyHP:t.hp))+'，上限不变。',{type:'frostPassive',actor:u.id,target:t.id,actionId:key,stacks,amount:nominal,bypassShield:true});
  }
}
return {id,initialize,restore,effective,resourceChange,blockControl,completed};
})(globalThis);

// BattleCore: live V13 behavior; composed once by systems/battle/compose.js.
const BattleCore=(function(root){
'use strict';
const R=typeof module!=='undefined'&&module.exports?require('./rules.js'):root.WitnessRules;
const D=typeof module!=='undefined'&&module.exports?require('./core.js'):root.WitnessDice;
const templates=typeof module!=='undefined'&&module.exports?require('./校准模板.js'):root.WitnessTemplates;
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const copy=o=>JSON.parse(JSON.stringify(o));
function fxFor(soul){const el=soul.elements||[];if(soul.spirit_specialist)return 'mind';if(el.includes('雷'))return 'lightning';if(el.includes('冰'))return 'ice';if(el.includes('毒'))return 'poison';if(el.includes('火'))return 'fire';if(el.includes('木'))return 'petal';if(el.includes('风'))return 'wind';if(soul.main_kind==='器'&&soul.subkind==='战斗')return 'slash';return 'wave';}
function normalizeSkill(skill){if(skill.category==='持续伤害')skill={...skill,category:'攻击',damageMode:'periodic'};if(skill.category==='减益'&&skill.statusLifetime!=='timed')skill={...skill,effect:String(skill.effect||'').replace(/持续\d+(?:\.\d+)?秒/g,'持续整场')};return {...copy(skill),damageNature:skill.damageNature||(skill.fx==='poison'||/毒/.test(skill.name+' '+(skill.description||''))?'poison':'residual'),id:skill.id||`${skill.ring}-${skill.name}`,fx:skill.fx||'wave'};}
function playerUnit(character,soul){soul=copy(soul);
    if(!character.stats)throw Error('先生成角色基础能力');
    const model=R.buildStats({...character,soul});
    const skills=(character.rings||[]).flatMap(r=>r.skills.map(s=>({...R.makeSkill({soul,style:character.style,stats:model,index:r.index,years:r.years,category:s.category,damageMode:s.damageMode||((s.category==='持续伤害'||s?.damageMode==='periodic')?'periodic':'direct'),attackSubtype:s.attackSubtype,generationVersion:s.generationVersion,effectVariant:s.effectVariant,effects:s.effects,effectSeed:s.effectSeed}),...(!['控制','减益'].includes(s.category)?{name:s.name}:{})}))).map(s=>normalizeSkill({...s,fx:fxFor(soul)}));
    return {id:'player',name:character.name||'你的见证者',team:0,soul:copy(soul),style:character.style,release:character.release,level:character.level,model,skills,portrait:null,source:'玩家人设'};
  }
function templateUnit(template,level,id,team){
    const soul={id:'npc-'+template.id,name:template.weapon,tier:7,main_kind:template.kind,subkind:template.subkind,style:template.style,attribute:template.attribute,elements:[],spirit_specialist:!!template.mental};
    if(template.id==='hash'){soul.basicChannel='能量';soul.basicMindPower=true;}
    const release=template.kind==='兽'?'附体':'召出';
    const raw=R.buildStats({level,soul,style:template.style,release}),average=R.KEYS.reduce((n,k)=>n+raw.stats[k],0)/6;
    const growth=Object.fromEntries(R.KEYS.map(k=>[k,R.round2(raw.stats[k]*((template.statRatio||1.28)*raw.benchmark/average-1))]));
    const model=R.buildStats({level,soul,style:template.style,release,growth});
    model.ratingProfile='npc';
    const count=R.benchmark(level).rings;
    const skills=template.skills.slice(0,Math.min(template.skillLimit||6,R.benchmark(level).rings)).map((t,i)=>{
      const years=Math.max(10,Math.floor(R.CAPS[i]*.6));
      const base=R.makeSkill({soul,style:template.style,stats:model,index:i+1,years,category:t.category,npcTemplate:true});
      const skill=normalizeSkill({...base,...t,id:template.id+'-'+(i+1),effect:t.description});skill.cost=R.skillBudget(model,skill);skill.cooldown=skill.cd??skill.cooldown;delete skill.cd;return skill;
    });
    for(const main of [...skills])for(const sub of main.subActions||[]){const base={...main,...sub,id:main.id+'-variant',ring:main.ring,sourceKind:'variant'};delete base.subActions;skills.push(normalizeSkill(base));}
    if(template.id==='qinyan'&&count>=5)skills.push({id:'qinyan-repair',name:'半能量修补',sourceKind:'form',category:'治疗',channel:'生命',selfOnly:true,modernEffect:'uranusRepair',cost:Math.ceil(model.derived.baseMP*.08),cast:1,cooldown:8,Q:1,fx:'lightning',effect:'仅乌拉诺斯内可用，支付魂力修补非致命伤势，不可复活。'});
    return {id,name:template.name,team,soul,style:template.style,release,level,model,skills,portrait:template.portrait,source:template.source,note:template.note,templateId:template.id};
  }
function runtime(unit){
    const u=copy(unit),m=u.model.derived;
    Object.assign(u,{progress:0,queuedAt:null,queueOrder:0,actions:0,hp:m.HP,mp:m.MP,sh:m.SH,cast:null,readyAt:0,cooldowns:{},uses:{},statuses:[],dots:[],shieldHP:0,shieldSH:0,shieldUntil:0,oneHit:false,guard:0,immuneUntil:0,rage:0,tuneUses:0,calmUses:0,manaGiftUses:0,firstHit:false,fallen:false});
    if(u.release==='召唤'){u.bodyHP=Math.round(m.HP*.45);u.petHP=m.HP-u.bodyHP;u.petMax=u.petHP;u.bodyMax=u.bodyHP;u.petAlive=true;}
    return u;
  }

  class Battle { constructor({character,soul,playerTemplateId=null,testLevel=41,duel=false,enemyId='qinyan',withSupport=false,traitsEnabled=true,seed='battle',snapshot=null,difficulty='standard',challengeId=null,postGameChallenge=false,challengeSessionId=null,enemyLevelOverride=null,huntPlan=null}){
      if(huntPlan&&!snapshot){V12Battle.initializeBattle(this,{huntPlan,seed});return;}
      if(snapshot){if(![13,14,15,16,17].includes(snapshot.combatRulesVersion))throw Error('不支持的战斗规则');if(snapshot.combatRulesVersion===14&&snapshot.v14ShieldVersion!==1)throw Error('不支持的V14护盾存档版本');if(snapshot.playerRulesVersion!==2||snapshot.soulControlVersion!==11||![13,14,15,16,17].includes(snapshot.combatRulesVersion))throw Error('此战报使用旧版战斗规则，请保留人物并重新开战');if(snapshot.version!==10)throw Error('旧版即时战斗战报不能用于行动滚轴，请返回登记重开本场');Object.assign(this,copy(snapshot));this.mechanicsFixVersion=snapshot.mechanicsFixVersion||0;this.rng=new D.DiceEngine(this.seed,this.rngState);this.events=[];if(!this.v12Battle&&this.result&&(this.result.winner===null||this.result.tieBreak&&snapshot.drawRulesVersion!==2))this.resolveDraw(this.result.reason.split(' · ')[0]);this.controlRules={...(snapshot.controlRules||root.WitnessControlV9.getConfig())};ShieldActions.initialize(this);ChallengeBattle.restore(this);MechanicsFix.restore(this,snapshot);if(!this.result&&snapshot.modernVersion!==1100){for(const u of this.units){const template=templates.find(t=>t.id===u.templateId);if(!template||u.guildmaster)continue;u.skills=templateUnit(template,u.level,u.id,u.team).skills;if(u.templateId==='hash'){u.soul.basicChannel='能量';u.soul.basicMindPower=true;}if(u.cast?.skill){const current=u.skills.find(s=>s.id===u.cast.skill.id);if(current)u.cast.skill=copy(current);}}this.addLog('已同步v11会员技能；既有资源与已支付费用保留。',{type:'rulesMigration',gameVersion:'v11.01'});}this.initializeActorState();return;}
      const t=templates.find(t=>t.id===enemyId)||templates[0];
      if(playerTemplateId){const chosen=templates.find(t=>t.id===playerTemplateId);if(!chosen)throw Error('角色卡不存在');const l=Math.max(41,Math.min(99,Math.round(testLevel)));soul={name:chosen.weapon};character={level:l,style:chosen.style,rings:[]};}
      soul=copy(soul);character=copy(character);const level=Math.max(1,character.level),enemyLevel=enemyLevelOverride??(difficulty==='admission'?Math.max(1,Math.floor(Math.max(0,level-1)/10)*10+1,level-5):level);character.level=level;if(!playerTemplateId)character.stats=R.buildStats({...character,soul});
      const count=R.benchmark(level).rings;
      // 玩家使用已经获得的全部魂环与魂技；考官按实际环数开放，最多六技。
      const units=[playerTemplateId?templateUnit(templates.find(t=>t.id===playerTemplateId),level,'player',0):playerUnit(character,soul),templateUnit(t,enemyLevel,'enemy',1)];
      const support=templates.find(t=>t.support),fighter=templates.find(t=>t.id==='yixing');
      if(!duel&&(character.style==='辅助'||t.style==='辅助'||withSupport)){
        const allyTemplate=character.style==='辅助'?fighter:support;
        const enemyPartner=t.style==='辅助'?fighter:support;
        units.push(templateUnit(allyTemplate,level,'ally',0),templateUnit(enemyPartner,enemyLevel,'enemySupport',1));
      }
      units[0].v12Permanent=copy(character.v12TraitProgress||{});units[0].v12Traits=Object.values(character.v12Equipment?.runtimeTraits||{}).map(t=>({...t,id:t.traitId}));this.resourceConfig=R.getResourceConfig();this.activeId=null;this.queueSequence=0;this.units=units.map(runtime);this.difficulty=difficulty;this.postGameChallenge=postGameChallenge;this.challengeSessionId=challengeSessionId;this.seed=String(seed);this.rng=new D.DiceEngine(this.seed);this.now=0;this.result=null;this.log=[];this.events=[];this.turn=0;
      for(const u of this.units)u.tiePriority=this.rng.die(100000);
      this.addLog('斗魂台开启。对手按当前等级切磋；HP或精神护持归零即退场；魂力耗尽不自动失败。同速同时准备时按种子投骰决定顺序。');
      if(difficulty==='admission')this.addLog('入会考核：考官通常低5级但保留所在魂环阶段，伤害为标准的90%，双方行动后均回气0.3秒；按环数开放，最多六技。');
      this.addLog('行动滚轴：敏捷积累行动机会，完成后依次获得回合；实际等级参战，考核降级不会跨越魂环阶段。');
      ShieldActions.initialize(this);if(challengeId)ChallengeBattle.initialize(this,challengeId);this.initializeActorState();this.scheduleAI();this.controlRules={...root.WitnessControlV9.getConfig()};
    } }
  root.WitnessBattle={Battle,templateUnit,playerUnit,fxFor,templates};


  const unit=function(id){return this.units.find(u=>u.id===id);};

  const alive=function(u){return !!u&&!u.fallen&&(u.scarred?(u.hp>0||u.sh>0):(u.hp>0&&u.sh>0));};

  const status=function(u,type){return u.statuses.filter(s=>s.type===type&&s.until>this.now);};





  const basicCost=function(u){return Math.max(1,Math.ceil(u.model.derived.baseMP*this.resourceConfig.basicFraction));};

  const refreshExhaustion=function(){};

  const cost=function(u,s){
      let cost=s.costPercent?Math.max(s.cost,Math.ceil(u.model.derived.baseMP*s.costPercent*(1-u.model.derived.costReduction/100))):s.cost;
      cost*=1+this.value(u,'costUp');
      
      return Math.max(1,Math.ceil(cost));
    };

  const castTime=function(u,s){
      let time=s.castFixed??(s.cast+(s.castExtra||0));
      time*=1+this.value(u,'slow');return Math.max(.5,time);
    };

  const targetOptions=function(u,action){
      const s=['attack','defend','defendSH','tune','calm'].includes(action)?null:u.skills.find(s=>s.id===action);
      const friendly=s&&['强化','防御','治疗','回蓝'].includes(s.category);
      if(['defend','defendSH','tune','calm','wait','armorOff','skipBonus'].includes(action))return [u];
      return this.units.filter(t=>this.alive(t)&&(friendly?t.team===u.team:t.team!==u.team)&&(s?.category!=='回蓝'||t.id!==u.id));
    };

  const canAct=function(u){return this.alive(u)&&this.activeId===u.id&&!u.cast&&u.readyAt<=this.now&&this.value(u,'control')===0;};

  const actionRate=function(u){return Math.max(.06,.20*Math.sqrt(Math.max(0,this.effective(u).A)/Math.max(20,u.model.benchmark))/(1+this.value(u,'slow')));};

  const advanceGauge=function(dt){for(const u of this.units){if(!this.alive(u)||u.id===this.activeId||u.cast||u.progress>=1||this.value(u,'control')||u.readyAt>this.now)continue;u.progress=Math.min(1,u.progress+dt/1000*this.actionRate(u));if(u.progress>=1-1e-9){u.progress=1;u.queuedAt=this.now+dt;u.queueOrder=++this.queueSequence;}}};

  const selectActor=function(){if(this.activeId){const a=this.unit(this.activeId);if(this.alive(a)&&(!this.value(a,'control')||a.cast))return;this.activeId=null;}const next=this.units.filter(u=>this.alive(u)&&!u.cast&&u.progress>=1&&!this.value(u,'control')&&u.readyAt<=this.now).sort((a,b)=>a.queuedAt-b.queuedAt||a.tiePriority-b.tiePriority||a.queueOrder-b.queueOrder)[0];if(next){this.activeId=next.id;this.addLog(next.name+'获得行动回合',{type:'turn',actor:next.id,target:next.id});}};

  const endTurn=function(u,completed=true){
      for(const s of u.statuses)if(completed&&s.actionsRemaining!==undefined)s.actionsRemaining--;
      const expired=u.statuses.filter(s=>s.actionsRemaining!==undefined&&s.actionsRemaining<=0);
      u.statuses=u.statuses.filter(s=>s.actionsRemaining===undefined||s.actionsRemaining>0);
      for(const s of expired.filter(s=>s.fatigue))this.setStatus(u,'fatigue',s.fatigueValue??.1,s.fatigueSeconds??6,{source:s.source,label:(s.label||'强化')+'后疲劳',from:s.from});
      u.progress=0;u.queuedAt=null;if(completed)u.actions++;u.readyAt=this.now+300;if(this.activeId===u.id)this.activeId=null;};

  const cooldownKey=function(u,s){if(s.sharedCooldown)return s.sharedCooldown;return u.soul.name==='九心海棠'?'海棠治疗':s.years===100000?'ring-'+s.ring:s.id;};

  const cooldownUntil=function(u,s){return u.cooldowns[this.cooldownKey(u,s)]||0;};

  const actionReason=function(u,action){
      if(!this.alive(u))return '已退场';if(u.cast)return '正在读条';if(!this.canAct(u))return '等待敏捷行动回合';
      if(u.bonusAttack&&!['attack','skipBonus'].includes(action))return '自身增益后仅能补一发普攻或放弃';
      if(action==='skipBonus')return u.bonusAttack?'':'没有附赠普攻机会';
      if(action==='tune')return '战斗中不可调息回魂';
      if(action==='attack'&&u.mp<this.basicCost(u))return '魂力不足以普通攻击';
      if(action==='wait')return '';
      if(action==='armorOff')return this.value(u,'soulArmor')?'':'未开启逸仙剑体防护';
      if(action==='calm')return u.calmUses>=1?'安神次数已用尽':u.mp<Math.ceil(u.model.derived.baseMP*.08)?'魂力不足':'';
      if(['attack','defend','defendSH'].includes(action))return '';
      const s=u.skills.find(s=>s.id===action);if(!s)return '技能不存在';
      if(u.release==='召唤'&&!u.petAlive)return '召唤体已败退';
      if(this.cooldownUntil(u,s)>this.now)return '技能冷却中';if(u.mp<this.cost(u,s))return '魂力不足';
      if(s.category==='回蓝'&&(u.manaGiftUses||0)>=1)return '本战回蓝次数已用尽';
      if(s.maxUses&&(u.uses[s.id]||0)>=s.maxUses)return '本战次数已用尽';if(s.rageSpend&&u.rage<1)return '需要霸气';
      if(s.detonate&&!this.units.some(t=>t.team!==u.team&&t.dots.some(d=>d.source===u.id)))return '目标尚未中毒';
      return '';
    };

  const command=function(id,action,targetId){
      if(this.result)return '战斗已结束';const u=this.unit(id),reason=this.actionReason(u,action);if(reason)return reason;
      const targets=this.targetOptions(u,action),target=targets.find(t=>t.id===targetId)||targets[0];if(!target)return '没有合法目标';
      if(action==='skipBonus'){u.bonusAttack=false;this.endTurn(u);this.addLog(u.name+'放弃附赠普攻',{type:'bonusSkip',actor:u.id});return '';}
      if(action==='armorOff'){u.statuses=u.statuses.filter(s=>s.type!=='soulArmor');this.addLog(u.name+'关闭逸仙剑体防护');return '';}
      const bonus=action==='attack'&&!!u.bonusAttack;u.bonusAttack=false;
      let duration,skill=null;
      if(action==='wait')duration=.5;
      else if(action==='attack'){u.mp-=this.basicCost(u);duration=1.5;}
      else if(['defend','defendSH'].includes(action))duration=.75;
      else if(action==='tune'){duration=3;u.tuneUses++;}
      else if(action==='calm'){duration=3;u.calmUses++;u.mp-=Math.ceil(u.model.derived.baseMP*.08);}
      else{
        skill=u.skills.find(s=>s.id===action);u.mp-=this.cost(u,skill);duration=this.castTime(u,skill)*(skill.castMultiplier||1);
        const cd=skill.cooldown;u.cooldowns[this.cooldownKey(u,skill)]=this.now+Math.round(cd*1000);u.uses[skill.id]=(u.uses[skill.id]||0)+1;if(skill.category==='回蓝')u.manaGiftUses=(u.manaGiftUses||0)+1;
      }
      if(action==='attack')duration*=1+this.value(u,'slow');
      u.cast={bonus,action,target:target.id,end:this.now+Math.round(duration*1000),start:this.now,skill:skill?copy(skill):null,rage:skill?.rageSpend?Math.min(3,u.rage):0};
      if(skill?.rageSpend)u.rage-=u.cast.rage;
      this.addLog(`${u.name}开始${skill?.name||{wait:'无力行动',attack:'普攻',defend:'防守',defendSH:'精神防守',tune:'调息',calm:'安神'}[action]}（${R.round2(duration)}秒）`,{type:'cast',bonus,actor:u.id,target:target.id,fx:skill?.fx||fxFor(u.soul)});
      u.progress=0;u.queuedAt=null;this.activeId=null; // Read bars may overlap; action gauge pauses while casting.
      return '';
    };

  const addLog=function(text,event={}){const line={time:this.now,text,...event};this.log.push(line);if(!this.v12Battle&&this.log.length>1500)this.log.shift();this.events.push(line);};



  const plan=function(u,cast,pre){
      const t=this.unit(cast.target),s=cast.skill,a=pre[u.id],p={u,t,cast,s,damage:0,heal:0,channel:'物理',effects:[]};
      if(cast.action==='wait')return p;
      if(!t||!this.alive(t))return p;
      if(['defend','defendSH'].includes(cast.action)){p.effects.push(()=>this.setStatus(u,cast.action==='defendSH'?'defendSH':'defendHP',1,3));return p;}
      if(cast.action==='tune'){p.effects.push(()=>{u.mp=Math.min(u.model.derived.MP,u.mp+Math.round(u.model.derived.baseMP*.08));this.addLog(u.name+'调息恢复魂力',{type:'restore',actor:u.id,target:u.id,fx:'restore'});});return p;}
      if(cast.action==='calm'){p.heal=Math.round(u.model.derived.SH*.08);p.channel='精神';return p;}
      const cat=s?.damageMode==='periodic'?'持续伤害':s?.category||'攻击',channel=s?.channel||u.soul.basicChannel||(u.soul.spirit_specialist?'精神':'物理');p.channel=channel;
      const power=s?.attackSubtype==='pursuit'?a.A*s.agilityCoefficient:(s?.mindPower||!s&&u.soul.basicMindPower)?a.MA:channel==='精神'?a.MA:channel==='物理'?a.PA:a.SA+(s?.poisonScaling||0)*a.MA,Q=s?.Q||1;
      if(cat==='攻击'||cat==='持续伤害'){
        const hit=this.hit(u,t,channel);p.hit=hit;
        if(!hit.success){this.addLog(`${u.name}的${s?.name||'普攻'}未命中（d100=${hit.roll}，阈值${hit.chance}）`,{type:'miss',actor:u.id,target:t.id,fx:'miss'});return p;}
        let raw=s?(cat==='持续伤害'?1:1.2)*Q*power*(s.factor??1):.45*power;
        
        if(cat==='持续伤害')raw*=1.4;
        if(cast.rage)raw*=1+.15*cast.rage;
        if(cat==='持续伤害'){
          const tick=this.damageValue(u,t,raw/(s.dotTicks||3),channel,pre),key=u.id+'-'+s.id;
          p.effects.push(()=>{t.dots=t.dots.filter(d=>d.key!==key);t.dots.push({key,source:u.id,channel,baseDamage:tick,damageMultiplier:1,damage:Math.round(tick*(1+this.value(u,'dotBoost'))),next:this.now+(s.dotFirstMs||3000),rawPerTick:raw/(s.dotTicks||3),ticks:s.dotTicks||3,fx:s.fx,damageNature:this.dotNature(u,s)});this.addLog(t.name+'受到持续伤害状态',{type:'status',actor:u.id,target:t.id,fx:s.fx});});
        }else if(s?.attackSubtype!=='multi')p.damage=this.damageValue(u,t,raw,channel,s?.penetration?{...pre,[t.id]:{...pre[t.id],DEF:pre[t.id].DEF*(1-s.penetration)}}:pre);
        p.extraDamage=[];
        if(s?.attackSubtype==='multi'){const eachRaw=raw/3;p.damage=0;for(let n=0;n<3;n++)p.extraDamage.push({amount:this.damageValue(u,t,eachRaw,channel,pre),channel});}
        if(s?.secondaryFactor)p.extraDamage.push({amount:this.damageValue(u,t,1.2*Q*power*s.secondaryFactor,s.secondaryChannel||channel,pre),channel:s.secondaryChannel||channel});
        const cold=this.value(u,'coldAura');
        if(cold){const hits=s?.secondaryFactor?2:1;p.extraDamage.push({amount:this.damageValue(u,t,a.SA*cold*hits,'能量',pre),channel:'能量'});}
        if(s?.detonate){const dots=t.dots.filter(d=>d.source===u.id);p.damage+=dots.reduce((sum,d)=>sum+this.dotDamage(d,t)*Math.max(0,d.ticks),0);p.effects.push(()=>t.dots=t.dots.filter(d=>d.source!==u.id));}
        if(s?.rageGain)p.effects.push(()=>this.gainRage(u,s.rageGain));
        if(s?.slow)p.effects.push(()=>this.setStatus(t,'slow',s.slow,s.duration||2,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s?.manaDrain)p.effects.push(()=>{t.mp=Math.max(0,t.mp-Math.round(t.model.derived.baseMP*s.manaDrain));if(s.manaReturn&&(u.manaReturnUses||0)<2){u.manaReturnUses=(u.manaReturnUses||0)+1;u.mp=Math.min(u.model.derived.MP,u.mp+Math.round(u.model.derived.baseMP*Math.min(.02,s.manaReturn)));}});
        if(s?.costUp)p.effects.push(()=>this.setStatus(t,'costUp',s.costUp,s.duration||8,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s?.corrode)p.effects.push(()=>this.setStatus(t,'defDown',s.corrode,6,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s?.controlOnHit&&(s.controlAlways||cast.rage>=3))p.effects.push(()=>this.tryControl(u,t,s,s.controlAlways?s.controlOnHit:Math.min(3,s.controlOnHit*cast.rage)));
        return p;
      }
      if(cat==='强化'){
        if(s.evasion)p.effects.push(()=>this.setBuff(t,'evasion',s.evasion,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        else if(s.dotBuff)p.effects.push(()=>{this.setBuff(t,'dotBoost',s.dotBuff,s,{source:this.statusSource(u,s),label:s.name,from:u.name});for(const target of this.units)for(const dot of target.dots)if(dot.source===t.id)dot.damage=this.dotDamage(dot);});
        else p.effects.push(()=>this.setBuff(t,'attackBoost',s.buff??.12*Q,s,{fatigue:!!s.fatigue,source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s.evasion&&s.buff)p.effects.push(()=>this.setBuff(t,'attackBoost',s.buff,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s.manaRestore)p.effects.push(()=>t.mp=Math.min(t.model.derived.MP,t.mp+Math.round(t.model.derived.baseMP*Math.min(.02,s.manaRestore))));
        if(s.controlWard)p.effects.push(()=>this.setBuff(t,'controlWard',1,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s.coldOnHit)p.effects.push(()=>this.setBuff(t,'coldAura',s.coldOnHit,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s.soulArmor)p.effects.push(()=>this.setBuff(t,'soulArmor',s.soulArmor,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
        if(s.agility)p.effects.push(()=>this.setBuff(t,'agility',s.agility,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
      }
      if(cat==='防御')p.effects.push(()=>{
        const mental=channel==='精神';let shield=s.guard?0:Math.round(.45*Q*(mental?a.MA:a.SA));
        if(mental)t.shieldSH=Math.max(t.shieldSH,shield);else t.shieldHP=Math.max(t.shieldHP,shield);
        t.shieldUntil=this.now+8000;t.oneHit=!!s.oneHit;t.guard=s.guard||0;t.rageOnBreak=!!s.rageOnBreak;
      });
      if(cat==='治疗'){p.channel=channel==='精神'?'精神':'生命';p.heal=Math.round(.4*Q*(p.channel==='精神'?a.MA:a.SA));}
      if(cat==='回蓝')p.effects.push(()=>t.mp=Math.min(t.model.derived.MP,t.mp+Math.round(25+10*Q)));
      if(cat==='控制'&&s.chipFactor){p.damage=this.damageValue(u,t,1.2*Q*a.MA*s.chipFactor,channel,pre);}
      if(cat==='控制')p.effects.push(()=>{if(s.dispel)t.shieldHP=Math.round(t.shieldHP*(1-s.dispel));this.tryControl(u,t,s,s.baseControl);});
      if(s?.fieldEvasion)p.effects.push(()=>this.setStatus(u,'evasion',s.fieldEvasion,s.duration||9,{source:this.statusSource(u,s),label:s.name,from:u.name}));
      if(cat==='减益'&&s.slow)p.effects.push(()=>this.setStatus(t,'slow',s.slow,s.duration||8,{source:this.statusSource(u,s),label:s.name,from:u.name}));
      if(cat==='减益'&&s.costUp)p.effects.push(()=>this.setStatus(t,'costUp',s.costUp,s.duration||8,{source:this.statusSource(u,s),label:s.name,from:u.name}));
      if(cat==='减益'&&s.genericDefDown!==false)p.effects.push(()=>{const effect=R.controlEffect(Q,pre[u.id],pre[t.id]),roll=this.rng.die(100);if(roll<=Math.round(effect.chance))this.setStatus(t,channel==='精神'?'mindDown':'defDown',.1*Q,6,{source:this.statusSource(u,s),label:s.name,from:u.name});this.addLog(`${u.name}减益判定${roll} / ${effect.chance}%`,{type:'status',actor:u.id,target:t.id,fx:s.fx});});
      return p;
    };

  const tryControl=function(u,t,s,baseControl){
      if(!this.alive(t))return;if(t.immuneUntil>this.now||this.value(t,'controlWard')){this.addLog(t.name+'处于控制免疫期');return;}
      const effect=R.controlEffect(s.Q,this.effective(u),this.effective(t));
      if(baseControl!==undefined)effect.duration=R.round2(Math.max(.01,baseControl*effect.ratio));
      const roll=this.rng.die(100);
      if(roll>Math.round(effect.chance)){this.addLog(`${t.name}抵抗控制（d100=${roll}，阈值${effect.chance}%）`,{type:'resist',actor:u.id,target:t.id,fx:'mind'});return;}
      t.progress=Math.min(t.progress,.4);t.queuedAt=null;const ms=Math.round(effect.duration*1000);this.setStatus(t,'control',1,effect.duration);t.immuneUntil=this.now+ms+4000;
      if(t.cast){this.addLog(`${t.name}的读条被打断，已扣魂力不返还`);t.cast=null;this.endTurn(t,false);}t.readyAt=Math.max(t.readyAt,this.now+ms);
      this.addLog(`${t.name}受控${effect.duration}秒（精神力P ${u.model.stats.P} 对 ${t.model.stats.P}）`,{type:'control',actor:u.id,target:t.id,fx:s.fx});
    };

  const applyDamage=function(t,damage,channel,source,fx){
      if(!damage||!this.alive(t))return;
      const mind=channel==='精神';
      const shieldKey=mind?'shieldSH':'shieldHP';let incoming=damage;
      if(!mind&&t.guard){incoming=Math.round(incoming*(1-t.guard));t.guard=0;}
      const blocked=Math.min(t[shieldKey],incoming);t[shieldKey]-=blocked;incoming-=blocked;
      const special=!mind&&this.value(t,'soulArmor')>0;
      const fraction=Math.min(.70,special?this.value(t,'soulArmor'):this.resourceConfig.absorb);
      const unitCost=special?.3:this.resourceConfig.mpPerDamage;
      const absorbed=Math.min(Math.floor(incoming*fraction),Math.floor(t.mp/unitCost));
      const paid=Math.ceil(absorbed*unitCost);
      const beforeProtection=mind?t.sh:t.hp;
      if(paid){t.mp-=paid;incoming-=absorbed;}
      // Soul armor is a stronger variant of the universal guard, not a second shield.

      if(t.oneHit&&!mind){t.shieldHP=0;t.shieldSH=0;t.oneHit=false;if(t.rageOnBreak)this.gainRage(t,1);}
      if(mind)t.sh=Math.max(0,t.sh-incoming);
      else if(t.release==='召唤'){
        if(t.petAlive){t.petHP=Math.max(0,t.petHP-incoming);if(t.petHP===0){t.petAlive=false;t.cast=null;this.endTurn(t,false);t.readyAt=Math.max(t.readyAt,this.now+2000);this.addLog(t.name+'的召唤体败退，停顿2秒。');}}
        else t.bodyHP=Math.max(0,t.bodyHP-incoming);
        t.hp=t.bodyHP+t.petHP;
      }else t.hp=Math.max(0,t.hp-incoming);
      if(paid)this.addLog(t.name+'受击同时结算：'+(mind?'精神护持':'生命')+' −'+(beforeProtection-(mind?t.sh:t.hp))+'，魂力 −'+paid,{type:'armor',target:t.id,actor:source?.id,paid,absorbed,healthLost:beforeProtection-(mind?t.sh:t.hp),remainingDamage:incoming,channel});
      this.addLog(`${t.name}${mind?'精神护持':'生命'} −${incoming}${blocked?'（盾挡'+blocked+'）':''}`,{type:'damage',actor:source?.id,target:t.id,fx,amount:incoming,channel});
      
    };

  const heal=function(t,amount,channel){
      if(t.fallen)return;const mind=channel==='精神',max=mind?t.model.derived.SH:t.model.derived.HP;
      const before=mind?t.sh:t.hp;
      if(mind)t.sh=Math.min(max,t.sh+amount);
      else if(t.release==='召唤'){if(t.petAlive)t.petHP=Math.min(t.petMax,t.petHP+amount);else t.bodyHP=Math.min(t.bodyMax,t.bodyHP+amount);t.hp=t.petHP+t.bodyHP;}
      else t.hp=Math.min(max,t.hp+amount);
      this.addLog(`${t.name}${mind?'精神护持':'生命'} +${(mind?t.sh:t.hp)-before}`,{type:'heal',target:t.id,fx:'restore'});
    };

  const scheduleAI=function(autoPlayer=false){this.expireShields();
      if(this.result)return;
      for(let i=0;i<this.units.length;i++){
        this.selectActor();const u=this.unit(this.activeId);
        if(!u||u.id==='player'&&!autoPlayer||!this.canAct(u))break;
        const choice=this.aiChoice(u);if(!choice)break;
        if(this.command(u.id,choice.action,choice.target))break;
      }
    };

  const nextTime=function(){this.expireShields();
      this.refreshExhaustion();const times=[this.v12Battle?Number.MAX_SAFE_INTEGER:180000];
      for(const u of this.units)if(this.alive(u)&&u.exhaustTick>this.now)times.push(u.exhaustTick);
      for(const u of this.units){if(this.alive(u)&&!u.cast&&u.id!==this.activeId&&u.progress<1&&!this.value(u,'control')&&u.readyAt<=this.now)times.push(this.now+Math.max(1,Math.ceil((1-u.progress)/this.actionRate(u)*1000)));if(u.cast)times.push(u.cast.end);if(u.readyAt>this.now)times.push(u.readyAt);for(const s of u.statuses)if(s.until>this.now)times.push(s.until);for(const d of u.dots)if(d.next>this.now)times.push(d.next);if(u.shieldUntil>this.now)times.push(u.shieldUntil);}
      return Math.min(...times.filter(t=>t>this.now));
    };

  const tick=function(targetTime,autoPlayer=false){this.expireShields();
      if(this.result)return;this.scheduleAI(autoPlayer);const until=this.v12Battle?targetTime:Math.min(targetTime,180000);
      let safety=0;
      while(!this.result&&this.now<until&&safety++<5000){
        if(!autoPlayer&&this.canAct(this.unit('player')))break;
        const next=this.nextTime();if(next>until){this.advanceGauge(until-this.now);this.now=until;break;}this.advanceGauge(next-this.now);this.now=next;if(this.v12Pulse)this.v12Pulse();
        for(const u of this.units){
          for(const s of u.statuses)if(s.until<=this.now&&s.fatigue)this.setStatus(u,'fatigue',s.fatigueValue??.1,s.fatigueSeconds??6,{source:s.source,label:(s.label||'强化')+'后疲劳',from:s.from});
          u.statuses=u.statuses.filter(s=>s.until>this.now);
          if(u.shieldUntil&&u.shieldUntil<=this.now){u.shieldHP=0;u.shieldSH=0;u.guard=0;u.oneHit=false;u.shieldUntil=0;}
          for(const dot of u.dots)dot.damage=this.dotDamage(dot);
          for(const dot of u.dots)if(dot.next<=this.now&&dot.ticks>0){this.applyDotDamage(u,dot);dot.ticks--;dot.next+=3000;}
          u.dots=u.dots.filter(d=>d.ticks>0);
        }
        const completed=this.units.filter(u=>u.cast&&u.cast.end<=this.now&&this.alive(u)).map(u=>({u,cast:u.cast}));
        for(const {u}of completed)u.cast=null;
        const pre=Object.fromEntries(this.units.map(u=>[u.id,this.effective(u)])),plans=completed.map(({u,cast})=>this.plan(u,cast,pre));
        for(const {u,cast}of completed)this.endTurn(u,!(this.resourceConfig.selfBuffBonus&&cast.skill?.category==='强化'&&cast.target===u.id));
        // Damage sources remain distinct; all precomputed attacks resolve before the result check.
        for(const p of plans)if(p.damage&&p.t){this._packetSkill=p.s;this.applyDamage(p.t,p.damage,p.channel,p.u,p.s?.fx||fxFor(p.u.soul));}
        for(const p of plans)for(const d of p.extraDamage||[])if(p.t&&this.alive(p.t)){this._packetSkill=p.s;this.applyDamage(p.t,d.amount,d.channel,p.u,p.s?.fx||fxFor(p.u.soul));}this._packetSkill=null;
        for(const p of plans)if(p.heal&&p.t)this.heal(p.t,p.heal,p.channel);
        for(const p of plans)for(const effect of p.effects)effect();
        this.refreshDotDamage();
        for(const {u,cast}of completed)this.onActionComplete(u,cast);
        for(const u of this.units)this.onResourceChange(u);
        for(const p of plans)if(p.s||p.cast.action==='attack')this.addLog(`${p.u.name}释放${p.s?.name||'普攻'}`,{type:'release',actor:p.u.id,target:p.t?.id,fx:p.s?.fx||fxFor(p.u.soul),label:p.s?.name||'普攻'});
        this.checkResult();
        if(!this.result&&this.resourceConfig.selfBuffBonus)for(const {u,cast}of completed){
          if(cast.skill?.category==='强化'&&cast.target===u.id&&this.alive(u)&&!this.value(u,'control')){
            u.bonusAttack=true;u.progress=1;u.readyAt=this.now;u.queuedAt=this.now;u.queueOrder=++this.queueSequence;
            this.addLog(u.name+'自身增益完成，可补一发耗魂普攻',{type:'bonusReady',actor:u.id});
          }
        }
        if(!this.result)this.scheduleAI(autoPlayer);
      }
      if(safety>=5000)throw Error('时间轴推进异常');
      if(!this.v12Battle&&!this.result&&this.now>=180000)this.finishByTime();this.expireShields();
    };

  const hasOffense=function(u){
      return this.alive(u)&&(!!u.guildmaster||u.mp>=this.basicCost(u)||u.skills.some(s=>['攻击','持续伤害'].includes(s.category)&&u.mp>=this.cost(u,s)&&(!s.maxUses||(u.uses[s.id]||0)<s.maxUses)&&(!s.rageSpend||u.rage>=1)&&(!s.detonate||this.units.some(t=>t.team!==u.team&&t.dots.some(d=>d.source===u.id)))));
    };

  const resolveDraw=function(originalReason){
      const totals=[0,1].map(team=>this.units.filter(u=>u.team===team).reduce((total,u)=>{
        const maximum=Math.max(0,u.model.derived.HP);total.maxHP+=maximum;total.hp+=Math.max(0,Math.min(maximum,u.hp));return total;
      },{hp:0,maxHP:0}));
      const hp=totals.map(t=>t.hp),maxHP=totals.map(t=>t.maxHP),ratios=totals.map(t=>t.maxHP>0?t.hp/t.maxHP:0);
      const equal=Math.abs(ratios[0]-ratios[1])<1e-9,winner=equal?0:ratios[0]>ratios[1]?0:1;
      this.result={winner,reason:originalReason+' · '+(equal?'生命比例相同，主角胜':winner===0?'生命比例领先，主角胜':'生命比例落后，主角负'),time:this.now,tieBreak:{hp,maxHP,ratios,equal,rule:'remainingHPPercentage'}};
      this.addLog(`平局加判：我方剩余生命${(ratios[0]*100).toFixed(2)}%（${hp[0]}/${maxHP[0]}），对方${(ratios[1]*100).toFixed(2)}%（${hp[1]}/${maxHP[1]}）。`+(equal?'比例相同，判主角获胜。':winner===0?'我方比例更高，判主角获胜。':'对方比例更高，判主角落败，可原局重试。'));
    };

  const checkResult=function(){for(const u of this.units)this.onResourceChange(u);
      for(const u of this.units)if(!u.fallen&&(u.scarred?(u.hp<=0&&u.sh<=0):(u.sh<=0||(u.release==='召唤'?u.bodyHP<=0:u.hp<=0)))){u.fallen=true;u.cast=null;this.addLog(u.name+'失去战斗能力，保护阵接住了他／她。',{type:'fall',target:u.id,fx:'wave'});}
      if(this.units.filter(u=>this.alive(u)).length>=2&&!this.units.some(u=>this.hasOffense(u))&&!this.units.some(u=>u.dots.length||u.cast&&u.cast.action!=='wait')){
        this.doubleEmptySince??=this.now;
        if(this.now-this.doubleEmptySince>=5000){this.resolveDraw('双方无攻击资源');return;}
      }else this.doubleEmptySince=null;
      const a=this.units.some(u=>u.team===0&&this.alive(u)),b=this.units.some(u=>u.team===1&&this.alive(u));
      if(!a&&!b){this.resolveDraw('双方同时退场');return;}
      if(!a||!b){this.result={winner:a?0:b?1:null,reason:'退场',time:this.now};this.addLog(this.postGameChallenge?(a?'追加挑战胜利。原会徽与旅程结局保留。':'追加挑战落败。失败机会由挑战区结算。'):a?'转正战胜利。人事部为你登记，交付会徽与终端。':b?'本次切磋未通过，可以重试同一场转正战。':'双方同时退场，平局。');}
    };

  const finishByTime=function(){
      const teams=[0,1].map(team=>{const us=this.units.filter(u=>u.team===team&&this.alive(u));return {count:us.length,score:us.reduce((sum,u)=>sum+Math.min(u.hp/u.model.derived.HP,u.sh/u.model.derived.SH),0)};});
      const delta=teams[0].count-teams[1].count||teams[0].score-teams[1].score;
      if(Math.abs(delta)<1e-9){this.resolveDraw('180秒裁判');return;}
      this.result={winner:delta>0?0:1,reason:'180秒裁判',time:this.now};this.addLog('180秒结束，按存活人数与生命／精神剩余比例裁判。');
    };

  const surrender=function(){this.result={winner:1,reason:'认输',time:this.now};this.addLog('你选择结束这场切磋。');};

  return {methods:{unit,alive,status,basicCost,refreshExhaustion,cost,castTime,targetOptions,canAct,actionRate,advanceGauge,selectActor,endTurn,cooldownKey,cooldownUntil,actionReason,command,addLog,plan,tryControl,applyDamage,heal,scheduleAI,nextTime,tick,hasOffense,resolveDraw,checkResult,finishByTime,surrender}};
})(globalThis);

// ControlActions: live V13 behavior; composed once by systems/battle/compose.js.
const ControlActions=(function(root){
'use strict';
const R=root.WitnessRules;
const B=root.WitnessBattle;
const D=root.WitnessDice;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let config={burstSeconds:10,ai:'adapted'};
const variants={
    bind:{category:'控制',label:'禁锢·缚',baseControl:8},
    interrupt:{category:'控制',label:'震断·震',baseControl:1,castFixed:.5},
    slow:{category:'减益',label:'迟滞·滞',status:'agilityDown',value:.30,duration:20},
    corrosion:{category:'减益',label:'侵蚀·蚀〔长效〕',value:.30,duration:180.001},
    breach:{category:'减益',label:'侵蚀·蚀〔破甲〕',value:1},
    weaken:{category:'减益',label:'衰弱·衰',status:'damageDown',value:.40,duration:20},
    confuse:{category:'减益',label:'迷乱·惑',status:'accuracyDown',value:.40,duration:12,hits:2}
  };
function select(args){
    if(variants[args.effectVariant])return args.effectVariant;
    const key=[args.soul.id||args.soul.name,args.index,args.years,args.category,args.variant||0].join('|');
    const h=D.hashSeed('control-v9|'+key);
    if(args.category==='控制')return h%2?'interrupt':'bind';
    const n=h%8;return ['slow','slow','corrosion','breach','weaken','weaken','confuse','confuse'][n];
  }
function text(s){
    const channel=s.channel==='精神'?'精神抗御':'防御力';
    const check='按双方精神力与精神稳定判定成功率。';
    switch(s.effectVariant){
      case 'bind':return '基础控制8秒，按精神力比例调整为4—12秒；成功后打断读条，行动条压到最多40%，结束后4秒免控。'+check;
      case 'interrupt':return '读条0.5秒；成功后打断读条并控制约1秒（精神对抗后0.5—1.5秒），行动条压到最多40%，结束后4秒免控。'+check;
      case 'slow':return '敏捷降低30%，持续20秒；敏捷参与行动条速度与非精神攻击命中计算。'+check;
      case 'corrosion':return channel+'降低30%，持续整场；不同来源同类削防相加，最多100%；同来源重复施放刷新。'+check;
      case 'breach':return channel+'降低100%，持续'+s.effectDuration+'秒；短效结束后仍保留未到期的长效削防。'+check;
      case 'weaken':return '造成的伤害降低40%，持续20秒；包括已经挂上的持续伤害在此期间的跳伤。'+check;
      case 'confuse':return '接下来两次攻击的命中率降低40个百分点，最多保留12秒；命中或未命中均消耗一次，最终命中率最低5%；持续伤害仅挂上时计一次。'+check;
    }
  }
  const buildUnderlyingSkill=root.WitnessRules.makeSkill;


  const applyUnderlyingDamage=BattleCore.methods.applyDamage;

  const applyTemplateControl=BattleCore.methods.tryControl;
  const planUnderlyingAction=BattleCore.methods.plan;

  const makeSkill=function(args){
    const s=buildUnderlyingSkill(args);
    if(args.npcTemplate||!['控制','减益'].includes(s.category))return s;
    const kind=select({...args,category:s.category}),v=variants[kind];
    Object.assign(s,{effectVariant:kind,category:v.category,name:args.soul.name+'·'+v.label,effectDuration:kind==='breach'?config.burstSeconds:v.duration});
    if(v.baseControl!==undefined){s.baseControl=v.baseControl;s.controlCap=kind==='bind'?12:1.5;s.controlFloor=kind==='bind'?4:.5;}
    if(kind==='interrupt'){
      s.castFixed=.5;s.cast=.5;s.cooldown=10;
      s.cost=Math.max(1,Math.ceil(args.stats.derived.baseMP*.04*(1-args.stats.derived.costReduction/100)));
    }
    s.effect=text(s);return s;
  };





  const hit=function(u,t,channel,bonus=0){
    const chance=Math.round(this.hitChance(u,t,channel,bonus)*100),roll=this.rng.die(100);
    for(const s of this.status(u,'accuracyDown'))if(s.hitsRemaining!==undefined)s.hitsRemaining--;
    u.statuses=u.statuses.filter(s=>s.type!=='accuracyDown'||s.hitsRemaining===undefined||s.hitsRemaining>0);
    return {success:roll<=chance,roll,chance};
  };

  const applyDamage=function(t,damage,channel,source,fx){
    const reduction=source?this.value(source,'damageDown'):0;
    if(reduction&&damage>0)damage=Math.max(1,Math.round(damage*(1-reduction)));
    return applyUnderlyingDamage.call(this,t,damage,channel,source,fx);
  };



  const tryControl=function(u,t,s,base){
    if(!s.effectVariant)return applyTemplateControl.call(this,u,t,s,base);
    if(!this.alive(t))return;
    if(t.immuneUntil>this.now||this.value(t,'controlWard')){this.addLog(t.name+'处于控制免疫期');return;}
    const e=this.controlNumbers(u,t,s),roll=this.rng.die(100);
    if(roll>Math.round(e.chance)){this.addLog(t.name+'抵抗'+s.name+'（d100='+roll+'，阈值'+Math.round(e.chance)+'%）',{type:'resist',actor:u.id,target:t.id,fx:'mind'});return;}
    t.progress=Math.min(t.progress,.4);t.queuedAt=null;
    this.setStatus(t,'control',1,e.duration);t.immuneUntil=this.now+Math.round(e.duration*1000)+4000;
    if(t.cast){this.addLog(t.name+'的读条被打断，已扣魂力不返还',{type:'interrupt',actor:u.id,target:t.id});t.cast=null;this.endTurn(t,false);}
    t.readyAt=Math.max(t.readyAt,this.now+Math.round(e.duration*1000));
    this.addLog(t.name+'受到'+s.name+'，控制'+e.duration+'秒',{type:'control',actor:u.id,target:t.id,fx:s.fx});
  };

  const plan=function(u,cast,pre){
    const s=cast.skill;
    if(!s?.effectVariant||s.category!=='减益')return planUnderlyingAction.call(this,u,cast,pre);
    const t=this.unit(cast.target),p={u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};
    if(!t||!this.alive(t))return p;
    p.effects.push(()=>{
      const e=R.controlEffect(s.Q,pre[u.id],pre[t.id]),roll=this.rng.die(100),success=roll<=Math.round(e.chance);
      this.addLog(u.name+'的'+s.name+'判定'+roll+' / '+Math.round(e.chance)+'%：'+(success?'成功':'抵抗'),{type:success?'status':'resist',actor:u.id,target:t.id,fx:s.fx});
      if(!success)return;
      const v=variants[s.effectVariant],type=v.status||(s.channel==='精神'?'mindDown':'defDown');
      const seconds=s.effectVariant==='breach'?(this.controlRules?.burstSeconds||10):v.duration;
      this.setStatus(t,type,v.value,seconds,{source:this.statusSource(u,s),label:s.name,from:u.name,effectVariant:s.effectVariant,...(v.hits?{hitsRemaining:v.hits}:{})});
      if(s.effectVariant==='corrosion')this.status(t,type).find(x=>x.source===this.statusSource(u,s)).until=this.v12Battle?Number.MAX_SAFE_INTEGER:180001;
    });
    return p;
  };

  const forecastDamage=function(u,t,s){
    const a=this.effective(u),channel=s?.channel||(u.soul.spirit_specialist?'精神':'物理');
    const power=s?.mindPower?a.MA:channel==='精神'?a.MA:channel==='物理'?a.PA:a.SA+(s?.poisonScaling||0)*a.MA;
    let raw=s?((s.category==='持续伤害'||s?.damageMode==='periodic')?1.4:1.2)*s.Q*power*(s.factor??1):.45*power;
    if(s?.secondaryFactor)raw+=1.2*s.Q*power*s.secondaryFactor;
    if((s?.category==='持续伤害'||s?.damageMode==='periodic'))raw*=1+this.value(u,'dotBoost');
    const pre=Object.fromEntries(this.units.map(x=>[x.id,this.effective(x)]));
    return this.damageValue(u,t,raw,channel,pre)*this.hitChance(u,t,channel);
  };

  const scoreControlVariant=function(u,t,s){
    const cost=this.cost(u,s)/u.model.derived.baseMP*12,scale=100/u.model.derived.HP;
    const best=(a,z)=>{
      const options=a.skills.filter(x=>['攻击','持续伤害'].includes(x.category)&&this.cost(a,x)<=a.mp&&(!x.detonate||z.dots.some(d=>d.source===a.id)));
      const values=options.map(x=>this.forecastDamage(a,z,x));
      if(a.mp>=this.basicCost(a))values.push(this.forecastDamage(a,z,null));
      return Math.max(0,...values);
    };
    const own=best(u,t),enemy=best(t,u),ownCycle=.3+1/this.actionRate(u)+1.15,enemyCycle=.3+1/this.actionRate(t)+1.15;
    const chance=Math.round(R.controlEffect(s.Q,this.effective(u),this.effective(t)).chance)/100;
    if(s.category==='控制'){
      if(t.immuneUntil>this.now||this.value(t,'controlWard'))return -Infinity;
      const e=this.controlNumbers(u,t,s),willInterrupt=t.cast&&t.cast.end>this.now+this.castTime(u,s)*1000;
      if(s.effectVariant==='interrupt'&&!willInterrupt&&t.progress<.8)return -Infinity;
      const blocked=willInterrupt?(t.cast.skill&&['攻击','持续伤害'].includes(t.cast.skill.category)?this.forecastDamage(t,u,t.cast.skill):enemy*.65):0;
      const delay=e.duration+Math.max(0,t.progress-.4)/this.actionRate(t);
      const dotValue=t.dots.filter(d=>d.source===u.id).reduce((n,d)=>n+this.dotDamage(d,t)*Math.min(d.ticks,e.duration/3),0);
      return e.chance/100*(blocked+enemy*Math.min(1.6,delay/enemyCycle)+dotValue*.25)*scale-cost;
    }
    const v=variants[s.effectVariant],type=v.status||(s.channel==='精神'?'mindDown':'defDown');
    const current=this.value(t,type),next=this.stackedNext(t,type,v.value,this.statusSource(u,s));
    if(next<=current+1e-9)return -Infinity;
    if(s.effectVariant==='corrosion'||s.effectVariant==='breach'){
      if(!own)return -Infinity;
      const duration=s.effectVariant==='corrosion'?Math.min(35,Math.max(ownCycle,t.hp/Math.max(1,own)*ownCycle)):(this.controlRules?.burstSeconds||10);
      const opportunities=Math.min(Math.floor(duration/ownCycle),Math.max(0,u.mp-this.cost(u,s))/Math.max(this.basicCost(u),u.model.derived.baseMP*.1));
      const base=t.model.derived[s.channel==='精神'?'MDEF':'DEF']*130/Math.max(20,t.model.benchmark);
      const relative=(100+base*(1-current))/(100+base*(1-next))-1;
      return chance*own*Math.max(0,relative)*opportunities*scale-cost;
    }
    if(s.effectVariant==='slow')return chance*enemy*(20/enemyCycle)*(1-Math.sqrt((1-next)/(1-current)))*scale-cost;
    if(s.effectVariant==='weaken')return chance*enemy*Math.min(3.5,20/enemyCycle)*(next-current)/(1-current)*scale-cost;
    if(s.effectVariant==='confuse')return chance*enemy*Math.min(2,12/enemyCycle)*((next-current)/.85)*scale-cost;
    return -Infinity;
  };


root.WitnessControlV9={variants,describe:text,select,setConfig(next){config={...config,...next};if(![8,10,12].includes(config.burstSeconds))throw Error('破甲时长只接受8、10、12秒');},getConfig:()=>({...config})};
  return {methods:{makeSkill,hit,applyDamage,tryControl,plan,forecastDamage,scoreControlVariant}};
})(globalThis);

// ActionForecast: live V13 behavior; composed once by systems/battle/compose.js.
const ActionForecast=(function(root){
'use strict';
const B=root.WitnessBattle;
const R=root.WitnessRules;
const attack=s=>!s||['攻击','持续伤害'].includes(s.category);
const channel=(u,s)=>s?.channel||(u.soul.spirit_specialist?'精神':'物理');
const pool=(u,ch)=>ch==='精神'?'sh':'hp';
const maximum=(u,ch)=>u.model.derived[ch==='精神'?'SH':'HP'];

  const aiAvailable=function(u,s,at,mp){
    return attack(s)&&(!s||!s.aiDisabled&&this.cooldownUntil(u,s)<=this.now+at*1000&&(!s.maxUses||(u.uses[s.id]||0)<s.maxUses)&&(!s.rageSpend||u.rage>0))&&mp>=(s?this.cost(u,s):this.basicCost(u));
  };

  const aiSequence=function(u,t,horizon,delay=0,mp=u.mp,defense=null,reserved=null){
    const hits=[],used=new Map(),cooldowns=new Map();
    if(reserved){used.set(reserved.id,1);cooldowns.set(reserved.id,Math.max(reserved.cooldown,(reserved.category==='持续伤害'||reserved?.damageMode==='periodic')?9:0));}
    let at=Math.max(0,(u.readyAt-this.now)/1000)+delay+(u.id===this.activeId?0:(1-u.progress)/this.actionRate(u));
    const recovery=.3;
    const controlled=Math.max(0,...this.status(u,'control').map(x=>(x.until-this.now)/1000));
    at=Math.max(at,controlled+(1-u.progress)/this.actionRate(u));
    if(u.id===this.activeId&&!controlled)at=delay;
    if(u.cast){
      at=Math.max(0,(u.cast.end-this.now)/1000);
      if(attack(u.cast.skill)&&['attack',u.cast.skill?.id].includes(u.cast.action)&&u.cast.target===t.id)hits.push({...this.aiStrike(u,t,u.cast.skill,at,defense),paid:true});
      at+=recovery+1/this.actionRate(u)+delay;
    }
    for(let n=0;n<3&&at<horizon;n++){
      const options=[null,...u.skills].filter(s=>this.aiAvailable(u,s,at,mp)&&(!s||(!s.detonate||t.dots.some(d=>d.source===u.id))&&(!s.maxUses||(u.uses[s.id]||0)+(used.get(s.id)||0)<s.maxUses)&&(cooldowns.get(s.id)||0)<=at));
      const candidates=options.map(s=>this.aiStrike(u,t,s,at,defense)).filter(x=>at+x.cast<=horizon&&(!x.dot||!t.dots.some(d=>d.key===u.id+'-'+x.s.id&&d.next+(d.ticks-1)*3000>this.now+(at+x.cast)*1000)));
      candidates.sort((a,b)=>b.damage/Math.max(1,b.cost)-a.damage/Math.max(1,a.cost)||b.damage-a.damage);
      const best=candidates[0];if(!best)break;
      best.at=at+best.cast;hits.push(best);mp-=best.cost;
      if(best.s){used.set(best.s.id,(used.get(best.s.id)||0)+1);cooldowns.set(best.s.id,at+Math.max(best.s.cooldown,best.dot?9:0));}
      at=best.at+recovery+1/this.actionRate(u);
    }
    return hits.filter(x=>x.at<=horizon);
  };

  const aiThreatValue=function(u,t,hit){
    const damage=hit.health,hp=t[pool(t,hit.ch)];
    return damage/maximum(t,hit.ch)*100*(damage>=hp?3:hp<maximum(t,hit.ch)*.35?1.6:1);
  };

  return {methods:{aiAvailable,aiSequence,aiThreatValue}};
})(globalThis);

WitnessControlV9.setConfig({ai:"compact"});

// StatusActions: live V13 behavior; composed once by systems/battle/compose.js.
const StatusActions=(function(root){
'use strict';
const numeric=new Set(['attackBoost','agility','evasion','dotBoost','coldAura','defDown','mindDown','slow','costUp','agilityDown','damageDown','accuracyDown','fatigue']);
const caps={};

  const statusSource=function(u,s){return u.id+'-'+s.id;};

  const stackCap=function(type){return caps[type]??Infinity;};

  const value=function(u,type){
    const values=this.status(u,type).map(s=>Math.max(0,s.value));
    const value=numeric.has(type)?values.reduce((a,b)=>a+b,0):Math.max(0,...values);
    return ['attackBoost','agility'].includes(type)?value:Math.min(this.stackCap(type),value);
  };

  const stackedNext=function(t,type,value,source){
    const others=this.status(t,type).filter(s=>s.source!==source).map(s=>Math.max(0,s.value));
    const next=numeric.has(type)?others.reduce((a,b)=>a+b,0)+value:Math.max(value,0,...others);
    return Math.min(this.stackCap(type),next);
  };

  const statusGain=function(t,type,value,source){
    return Math.max(0,this.stackedNext(t,type,value,source)-Math.min(this.stackCap(type),this.value(t,type)));
  };

  const buffImprovement=function(t,type,value,skill,caster){
    return this.statusGain(t,type,value,caster?this.statusSource(caster,skill):skill.id);
  };

  const setStatus=function(u,type,value,duration,extra={}){
    const source=extra.source||'system:'+type;
    u.statuses=u.statuses.filter(s=>!(s.type===type&&(numeric.has(type)?s.source===source:true)));
    u.statuses.push({type,value,until:this.now+Math.round(duration*1000),...extra,source});
  };

  const setBuff=function(u,type,value,skill,extra={}){
    const source=extra.source||skill.id,actionsRemaining=skill.burstActions||undefined;
    u.statuses=u.statuses.filter(s=>!(s.type===type&&s.source===source));
    u.statuses.push({type,value,until:this.v12Battle?Number.MAX_SAFE_INTEGER:180001,actionsRemaining,...extra,source});
  };

  // A DOT stores pre-defence power and persistent cast modifiers. Recalculate
  // the tick against current defences; damage is only a display cache.
  const dotDamage=function(dot,target){
    const owner=this.unit(dot.source);
    if(!owner||!Number.isFinite(dot.rawPerTick))return dot.baseDamage===undefined?dot.damage:Math.max(1,Math.round(dot.baseDamage*(1+(owner?this.value(owner,'dotBoost'):0))));
    target=target||this.units.find(u=>u.dots.includes(dot));
    if(!target)return dot.damage;
    const previous={periodic:this._periodic,spec:this._damageSpec,quiet:this._dotPreview};
    this._periodic=true;this._dotPreview=true;this._damageSpec={fx:dot.fx,damageMode:'direct'};
    try{
      const pre=Object.fromEntries(this.units.map(u=>[u.id,this.effective(u)]));
      const amount=this.damageValue(owner,target,dot.rawPerTick*(1+this.value(owner,'dotBoost')),dot.channel,pre);
      return Math.max(1,Math.round(amount*(dot.damageMultiplier??1)));
    }finally{this._periodic=previous.periodic;this._damageSpec=previous.spec;this._dotPreview=previous.quiet;}
  };
  const refreshDotDamage=function(){for(const target of this.units)for(const dot of target.dots)dot.damage=this.dotDamage(dot,target);};
root.WitnessStackRules={version:13,numeric:[...numeric],caps};
  return {methods:{statusSource,stackCap,value,stackedNext,statusGain,buffImprovement,setStatus,setBuff,dotDamage,refreshDotDamage}};
})(globalThis);

(function(root){
  'use strict';
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  function hash(text){let n=2166136261;for(const ch of String(text)){n^=ch.codePointAt(0);n=Math.imul(n,16777619);}return n>>>0;}
  function admissionLevel(level){const rings=Math.floor(Math.max(0,level-1)/10);return Math.max(1,rings*10+1,level-5);}
  function skillCount(level){return Math.min(6,Math.floor(Math.max(0,level-1)/10));}
  function controlKind(args){return ['bind','interrupt'].includes(args.effectVariant)?args.effectVariant:hash('control-v9|'+[args.soul.id||args.soul.name,args.index,args.years,'控制',args.variant||0].join('|'))%2?'interrupt':'bind';}
  function decorateControl(skill,args){
    if(args.category!=='控制'||args.npcTemplate)return skill;
    const kind=controlKind(args),base=round((kind==='bind'?8:1)*skill.Q/2.8),s={...skill,effectVariant:kind,baseControl:base,effectRulesVersion:13};
    delete s.controlFloor;delete s.controlCap;
    s.name=args.soul.name+(kind==='bind'?'·禁锢·缚':'·震断·震');
    if(kind==='interrupt'){s.castFixed=.5;s.cast=.5;s.cooldown=10;}
    s.effect='基础控制'+base+'秒；按双方精神力比例结算，无固定时长上限。成功后打断读条，行动条压至最多40%，结束后4秒免控。';return s;
  }
  const api={version:13,admissionLevel,skillCount,decorateControl};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessCombatV13=api;
})(typeof globalThis==='undefined'?this:globalThis);

(function(root){
  'use strict';
  const V13=typeof module!=='undefined'&&module.exports?require('./combat-rules-v13.js'):root.WitnessCombatV13;
  const keys=['B','S','C','D','A','P'],labels={B:'肉体强度',S:'魂力强度',C:'魂力操纵',D:'防御素质',A:'敏捷',P:'精神力'};
  const weights={强攻:[26,24,20,6,14,10],敏攻:[14,14,20,6,36,10],控制:[7,18,32,5,12,26],防御:[24,14,12,34,6,10],辅助:[6,24,30,12,10,18]};
  function random(seed){let n=2166136261;for(const c of String(seed))n=Math.imul(n^c.charCodeAt(0),16777619);return ()=>{n+=0x6D2B79F5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
  function generate({seed,style,channel='物理',category,Q=1}){
    const rng=random(seed),r=rng(),count=r<.45?1:r<.9?2:3,available=[...keys],chosen=[];
    const primary=channel==='精神'?'P':channel==='物理'?'B':'S';
    const w=[...(weights[style]||weights.强攻)],core={控制:'C',辅助:'C',防御:'D'}[style];w[keys.indexOf(primary)]*=1.5;if(style==='强攻')w[keys.indexOf(primary)]=Math.max(w[keys.indexOf(primary)],Math.max(...w.filter((_,i)=>i!==keys.indexOf(primary)))*1.5);if(core&&core!==primary)w[keys.indexOf(primary)]=Math.min(w[keys.indexOf(primary)],w[keys.indexOf(core)]*.9);
    for(let i=0;i<count;i++){
      // 多项非防御强化有75%的机会先绑定适配攻击，保留偏生存组合。
      let key;if(i===0&&count>1&&style!=='防御'&&category==='强化'&&rng()<.75)key=primary;
      else {const total=available.reduce((sum,k)=>sum+w[keys.indexOf(k)],0);let n=rng()*total;key=available.find(k=>(n-=w[keys.indexOf(k)])<0)||available.at(-1);}
      chosen.push(key);available.splice(available.indexOf(key),1);
    }
    const scale=[0,1,.72,.55][count],base=category==='强化'?.12*Q:.10*Q;
    return chosen.map(key=>({key,value:Math.round(base*scale*10000)/10000}));
  }
  function decorate(skill,args){
    if(args.category==='控制')return V13.decorateControl(skill,args);
    if(args.category==='持续伤害')return {...skill,damageNature:skill.damageNature||(/毒/.test([args.soul.name,args.soul.attribute,(args.soul.elements||[]).join('')].join(''))?'poison':'residual')};
    if(!['强化','减益'].includes(args.category)||args.npcTemplate)return skill;
    const seed=args.effectSeed||[args.soul.id,args.index,args.years,args.category,args.variant||0,args.style].join('|');
    const scale=[0,1,.72,.55][args.effects?.length||0],magnitude=(args.category==='强化'?.12:.10)*skill.Q;
    const effects=args.effects?.length?args.effects.map(e=>({key:e.key,value:Math.round(magnitude*scale*10000)/10000})):generate({seed,style:args.style,channel:skill.channel,category:args.category,Q:skill.Q});
    const s={...skill,category:args.category,effects,effectCount:effects.length,effectSeed:seed,effectRulesVersion:13,buff:0};delete s.effectVariant;
    s.name=args.soul.name+(args.category==='强化'?'·多维加持':'·多维削弱');
    s.effect=effects.map(e=>labels[e.key]+(s.category==='强化'?'提高':'降低')+(e.value*100).toFixed(2).replace(/\.?0+$/,'')+'%').join('、')+(s.category==='强化'?'；持续整场，同源不叠加':'；共享一次精神判定，持续整场，同源不叠加');
    return s;
  }
  function statsRef(args){const b=[20,40,65,95,130,175,230,300,390,500][Math.max(0,Math.min(9,args.stats.rings))];return b*[.76,.82,.88,.94,1,1.06,1.12,1.18,1.24,1.30][args.soul.tier-1];}
  function make(base,args){
    if(args.category==='回蓝')args={...args,category:'防御'};
    const legacy=!!args.damageMode&&!args.attackSubtype;
    let subtype=args.attackSubtype;if(subtype==='pursuit'&&(args.style!=='敏攻'||args.soul.spirit_specialist))subtype='direct';
    if(args.category==='持续伤害')subtype='periodic';
    if(args.category==='攻击'&&!subtype){
      if(legacy)subtype=args.damageMode==='periodic'?'periodic':'direct';
      else if(args.npcTemplate)subtype='direct';
      else {
        const v=random((args.effectSeed||[args.soul.id,args.index,args.years,args.variant||0].join('|'))+'|attack-1007')();
        const eligible=args.style==='敏攻'&&!args.soul.spirit_specialist;
        subtype=v<.25?'periodic':v<.40?'multi':eligible&&v<.65?'pursuit':'direct';
      }
    }
    const resolved={...args,category:subtype==='periodic'?'持续伤害':args.category};
    let skill=decorate(base(resolved),resolved);
    if(!['攻击','持续伤害'].includes(resolved.category))return skill;
    skill={...skill,effectSeed:args.effectSeed||[args.soul.id,args.index,args.years,args.variant||0].join('|'),category:'攻击',damageMode:subtype==='periodic'?'periodic':'direct',attackSubtype:subtype||'direct',generationVersion:args.generationVersion||(legacy?1006:1007)};
    if(subtype==='multi')Object.assign(skill,{name:args.soul.name+'·连刃',factor:1.10,budgetFactor:1.10,effect:'同次施法三段攻击，共用一次命中，总原始伤害为普通攻击魂技的110%；逐段结算，附带效果只触发一次。'});
    if(subtype==='pursuit')Object.assign(skill,{name:args.soul.name+'·掠影追击',agilityCoefficient:((skill.channel==='物理'?.952:.85)*(Math.max(20,statsRef(args))*1)+10)/(1.36*Math.max(20,statsRef(args))),factor:.80,budgetFactor:1.00,effect:'以有效敏捷造成伤害，基准为普通攻击魂技的80%；命中获得追势，下一轮行动条、出手读条及衔接回气速度提高30%，最多保留8秒；不缩短冷却。'});
    return skill;
  }
  const api={generate,decorate,make,weights,labels};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessSkillEffects=api;
})(typeof globalThis==='undefined'?this:globalThis);

// AttributeActions: live V13 behavior; composed once by systems/battle/compose.js.
const AttributeActions=(function(root){
'use strict';
const R=root.WitnessRules;
const B=root.WitnessBattle;
const SE=root.WitnessSkillEffects;
const copy=value=>JSON.parse(JSON.stringify(value));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const config={coefficient:.40,bonus:.35,cap:.90,costFraction:.02,duration:4};
  const buildUnderlyingSkill=ControlActions.methods.makeSkill;

  const validateUnderlyingAction=BattleCore.methods.actionReason;
  const selectUnderlyingTargets=BattleCore.methods.targetOptions;
  const executeUnderlyingCommand=BattleCore.methods.command;
  const applyUnderlyingStatus=StatusActions.methods.setStatus;

  const calculateUnderlyingCost=BattleCore.methods.cost;
  const calculateUnderlyingCast=BattleCore.methods.castTime;
  const planUnderlyingAction=ControlActions.methods.plan;

  const makeSkill=args=>SE.make(buildUnderlyingSkill,args);

  const snapshot=function(){this.expireShields();return {v14ShieldVersion:1,shieldLayerSequence:this.shieldLayerSequence||0,version:10,soulControlVersion:11,combatRulesVersion:17,modernVersion:1100,mechanicsFixVersion:this.mechanicsFixVersion??1,traitsEnabled:this.traitsEnabled!==false,challengeId:this.challengeId||null,postGameChallenge:!!this.postGameChallenge,challengeSessionId:this.challengeSessionId||null,playerRulesVersion:2,drawRulesVersion:2,resourceConfig:this.resourceConfig,doubleEmptySince:this.doubleEmptySince??null,activeId:this.activeId,queueSequence:this.queueSequence,units:copy(this.units),seed:this.seed,rngState:this.rng.state,now:this.now,result:copy(this.result),log:copy(this.log),turn:this.turn,difficulty:this.difficulty||'standard',controlRules:{...(this.controlRules||root.WitnessControlV9.getConfig())},tacticsRulesVersion:1007,dodgeConfig:{...config,...this.dodgeConfig}};};

  const dodgeCost=function(u){return Math.max(1,Math.ceil(u.model.derived.baseMP*(this.dodgeConfig||config).costFraction));};

  const actionReason=function(u,action){
    if(action!=='dodge')return validateUnderlyingAction.call(this,u,action);
    if(this.value(u,'control'))return '受控中，无法闪避';if(!this.alive(u))return '已退场';if(u.cast)return '正在读条';if(!this.canAct(u))return '等待敏捷行动回合';if(u.bonusAttack)return '附赠普攻机会不能用于闪避';return u.mp<this.dodgeCost(u)?'魂力不足以闪避':'';
  };

  const targetOptions=function(u,action){return action==='dodge'?[u]:selectUnderlyingTargets.call(this,u,action);};

  const command=function(id,action,target){
    if(action!=='dodge')return executeUnderlyingCommand.call(this,id,action,target);if(this.result)return '战斗已结束';const u=this.unit(id),reason=this.actionReason(u,action);if(reason)return reason;
    const c=this.dodgeConfig||config,cost=this.dodgeCost(u);u.mp-=cost;u.dodgeCount=(u.dodgeCount||0)+1;u.dodgeSpent=(u.dodgeSpent||0)+cost;this.setStatus(u,'activeDodge',1,c.duration,{source:'active-dodge',label:'主动闪避'});this.endTurn(u);
    this.addLog(u.name+'主动闪避，消耗'+cost+'点魂力，持续'+c.duration+'秒',{type:'dodge',actor:id,target:id,cost});return '';
  };

  const setStatus=function(u,type,value,duration,extra={}){if(type==='control')u.statuses=u.statuses.filter(s=>s.type!=='activeDodge');if(type.startsWith('statDown')||type.startsWith('statUp')){const source=extra.source||'system:'+type;u.statuses=u.statuses.filter(s=>s.type!==type||s.source!==source);u.statuses.push({type,value,until:this.now+duration*1000,...extra,source});return;}return applyUnderlyingStatus.call(this,u,type,value,duration,extra);};

  const hitChance=function(u,t,channel,bonus=0){
    const a=this.effective(u),b=this.effective(t),mind=channel==='精神',controlled=!!this.value(t,'control'),c=this.dodgeConfig||config;
    let chance;
    if(mind)chance=clamp(.85+(a.P-b.P)/600,.55,.97);
    else {
      const diff=a.A/Math.max(20,u.model.benchmark)-(controlled?0:b.A/Math.max(20,t.model.benchmark));
      const active=!controlled&&this.value(t,'activeDodge');
      chance=clamp(.9+diff*(active?c.coefficient:.12),.6,.97);
      if(!controlled){chance-=this.value(t,'evasion');}
      if(active){const advantage=Math.max(0,-diff);chance-=c.bonus+advantage*c.coefficient;}
      chance=clamp(chance,active?1-c.cap:.4,.97);
    }
    chance=clamp(chance+bonus,mind?.55:(!controlled&&this.value(t,'activeDodge')?1-c.cap:.4),.97);
    return Math.round(clamp(chance-this.value(u,'accuracyDown'),.05,.97)*100)/100;
  };

  const effective=function(u){
    const base={...u.model.stats},s={...base},d={...u.model.derived},next={...base};
    const boost=this.value(u,'attackBoost'),weak=this.value(u,'fatigue');
    d.PA*=1+boost;d.SA*=1+boost;d.MA*=1+boost;
    d.PA*=Math.max(0,1-weak);d.SA*=Math.max(0,1-weak);d.MA*=Math.max(0,1-weak);
    d.DEF=u.model.derived.DEF*(1-clamp(this.value(u,'defDown'),0,1));
    d.MDEF=u.model.derived.MDEF*(1-clamp(this.value(u,'mindDown'),0,1));
    s.A*=1+this.value(u,'agility');const out={...s,...d};
    out.A*=1-clamp(this.value(u,'agilityDown'),0,.9);
    for(const key of R.KEYS){const up=this.status(u,'statUp'+key).reduce((n,s)=>n+s.value,0),down=this.status(u,'statDown'+key).reduce((n,s)=>n+s.value,0);next[key]=base[key]*(1+up)*Math.max(0,1-down);out[key]*=next[key]/base[key];}
    const before=R.derive(base),after=R.derive(next);for(const key of ['PA','SA','MA','DEF','MDEF'])out[key]*=after[key]/before[key];
    out.costReduction=after.costReduction;out.castReduction=after.castReduction;return out;
  };

  const cost=function(u,s){const factor=(1-this.effective(u).costReduction/100)/(1-u.model.derived.costReduction/100);return Math.max(1,Math.ceil(calculateUnderlyingCost.call(this,u,s)*factor));};

  const castTime=function(u,s){const factor=(1-this.effective(u).castReduction/100)/(1-u.model.derived.castReduction/100);return Math.max(.5,calculateUnderlyingCast.call(this,u,s)*factor);};

  const plan=function(u,cast,pre){
    const s=cast.skill;if(!s?.effects?.length)return planUnderlyingAction.call(this,u,cast,pre);
    const t=this.unit(cast.target),plan={u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};if(!t||!this.alive(t))return plan;
    plan.effects.push(()=>{if(s.category==='减益'){const chance=R.controlEffect(s.Q,pre[u.id],pre[t.id]).chance,roll=this.rng.die(100);this.addLog(s.name+'判定 '+roll+' / '+Math.round(chance)+'%',{type:roll<=Math.round(chance)?'status':'resist',actor:u.id,target:t.id});if(roll>Math.round(chance))return;}
      for(const effect of s.effects){const type=(s.category==='强化'?'statUp':'statDown')+effect.key,extra={source:this.statusSource(u,s),label:s.name,from:u.name};if(s.category==='强化')this.setBuff(t,type,effect.value,s,extra);else this.setStatus(t,type,effect.value,180.001,extra);}
    });return plan;
  };



  const dotNature=function(u,s){return s?.damageNature||(s?.fx==='poison'||/毒/.test([s?.name,s?.description,s?.effect,(u?.soul.elements||[]).join('')].join(''))?'poison':'residual');};

  const dotLabel=function(dot){const owner=this.unit(dot.source),s=owner?.skills.find(s=>dot.key===owner.id+'-'+s.id);return (dot.damageNature||this.dotNature(owner,s))==='poison'?'毒伤':'残伤';};

  const applyDotDamage=function(t,dot){const nature=this.dotLabel(dot)==='毒伤'?'poison':'residual',start=this.events.length;this.applyDamage(t,dot.damage,dot.channel,this.unit(dot.source),dot.fx);for(const event of this.events.slice(start))if(event.type==='damage'){event.periodic=true;event.damageNature=nature;event.text=(nature==='poison'?'毒伤：':'残伤：')+event.text;}};
root.WitnessTacticsV10={config};
  return {methods:{makeSkill,snapshot,dodgeCost,actionReason,targetOptions,command,setStatus,hitChance,effective,cost,castTime,plan,dotNature,dotLabel,applyDotDamage}};
})(globalThis);

// PermanentEffects: live V13 behavior; composed once by systems/battle/compose.js.
const PermanentEffects=(function(root){

  const planUnderlyingAction=AttributeActions.methods.plan;
  const plan=function(u,cast,pre){
    const plan=planUnderlyingAction.call(this,u,cast,pre);if(cast.skill?.category!=='减益')return plan;
    if(cast.skill.statusLifetime==='timed'){
      plan.effects=plan.effects.map(apply=>()=>{const before=new Set(this.units.flatMap(t=>t.statuses));apply();for(const t of this.units)for(const status of t.statuses)if(!before.has(status)){status.appliedAt=this.now;status.until=this.now+Math.round(cast.skill.duration*1000);delete status.hitsRemaining;delete status.actionsRemaining;}});
      return plan;
    }
    plan.effects=plan.effects.map(apply=>()=>{const before=new Set(this.units.flatMap(t=>t.statuses));apply();for(const t of this.units)for(const status of t.statuses)if(!before.has(status)){status.until=this.v12Battle?Number.MAX_SAFE_INTEGER:180001;delete status.hitsRemaining;delete status.actionsRemaining;}});
    return plan;
  };

  return {methods:{plan}};
})(globalThis);

// MemberActions: live V13 behavior; composed once by systems/battle/compose.js.
const MemberActions=(function(root){
'use strict';
const B=root.WitnessBattle;
const R=root.WitnessRules;

  const applyUnderlyingDamage=ControlActions.methods.applyDamage;
  const selectUnderlyingTargets=AttributeActions.methods.targetOptions;
  const validateUnderlyingAction=AttributeActions.methods.actionReason;
  const executeUnderlyingCommand=AttributeActions.methods.command;
  const underlyingoldHit=ControlActions.methods.hit;
  const planUnderlyingAction=PermanentEffects.methods.plan;
  const applyTemplateControl=ControlActions.methods.tryControl;

  const controlNumbers=function(u,t,s){
    const a=this.effective(u),b=this.effective(t),effect=R.controlEffect(s.Q,a,b),ratio=(100+a.P)/(100+b.P);
    effect.duration=R.round2(Math.max(.01,(s.baseControl??(1+.5*s.Q))*ratio));
    if(s.controlChance!==undefined)effect.chance=s.controlChance;
    return effect;
  };

  const gainRage=function(u,amount){const gain=Math.max(0,Math.min(amount,5-(u.rageTotal||0)));u.rage=Math.min(5,u.rage+gain);u.rageTotal=(u.rageTotal||0)+gain;};

  const damageValue=function(u,t,raw,channel,pre){
      const penetration=this.value(u,'phantomPierce');
      if(channel!=='精神'&&penetration)pre={...pre,[t.id]:{...pre[t.id],DEF:pre[t.id].DEF*Math.max(0,1-penetration)}};
      const target=pre[t.id];let def=channel==='精神'?target.MDEF:target.DEF;def*=130/Math.max(20,t.model.benchmark);
      let damage=Math.max(1,Math.round(raw*100/(100+def)));
      if(this.difficulty==='admission'&&u.team===1)damage=Math.max(1,Math.round(damage*.9));
      if(this.status(t,channel==='精神'?'defendSH':'defendHP').length)damage=Math.round(damage*.70);
      damage=Math.max(1,damage);
      if(this._valuingAI&&this.value(u,'damageDown'))damage=Math.max(1,Math.round(damage*(1-this.value(u,'damageDown'))));
      return channel==='精神'?damage:Math.max(1,Math.round(damage*Math.max(0,1-this.value(t,'iceArmor'))));
    };

  const applyDamage=function(t,damage,channel,source,fx){
    const before=t.hp;applyUnderlyingDamage.call(this,t,damage,channel,source,fx);
    if(source?.soul.name==='血君'&&t.hp<before){t.bloodMarks||=[];if(!t.bloodMarks.includes(source.id))t.bloodMarks.push(source.id);}
  };

  const targetOptions=function(u,action){
    if(['phantomSacrifice','phantomSwap'].includes(action))return [u];
    const targets=selectUnderlyingTargets.call(this,u,action),s=u.skills.find(s=>s.id===action);
    return s?.requireBlood?targets.filter(t=>t.bloodMarks?.includes(u.id)&&t.cast):targets;
  };

  const actionReason=function(u,action){
    if(!['phantomSacrifice','phantomSwap'].includes(action))return validateUnderlyingAction.call(this,u,action);
    if(!this.alive(u))return '已退场';if(!u.phantoms)return '没有可用分身';if(u.cast||!this.canAct(u)||u.bonusAttack)return '等待完整行动回合';if(action==='phantomSwap'&&u.phantomSwapped)return '本场换位机会已用尽';return '';
  };

  const command=function(id,action,target){
    if(!['phantomSacrifice','phantomSwap'].includes(action))return executeUnderlyingCommand.call(this,id,action,target);
    const u=this.unit(id),reason=this.actionReason(u,action);if(reason)return reason;if(this.result)return '战斗已结束';u.phantoms--;
    if(action==='phantomSwap'){u.phantomSwapped=true;this.setStatus(u,'phantomSwapReady',1,4,{source:u.id+'-phantom-swap',label:'分身换位'});this.addLog(u.name+'以分身准备换位，下一次直接生命攻击可被避开；此分身不提供泯灭增幅。',{type:'status',actor:id,target:id});}
    else {u.phantomSacrificed=(u.phantomSacrificed||0)+1;for(const type of ['attackBoost','agility'])this.setBuff(u,type,.06*u.phantomSacrificed,{}, {source:u.id+'-phantom-sacrifice',label:'分身泯灭',from:u.name});this.addLog(u.name+'泯灭一道分身，累计额外攻击与敏捷增幅'+(u.phantomSacrificed*6)+'%。',{type:'status',actor:id,target:id});}
    this.endTurn(u);return '';
  };

  const hit=function(u,t,channel,bonus=0){
    const result=underlyingoldHit.call(this,u,t,channel,bonus);
    if(channel!=='精神'&&this.value(t,'phantomSwapReady')&&!this.value(t,'control')){t.statuses=t.statuses.filter(s=>s.type!=='phantomSwapReady');this.addLog(t.name+'与分身换位，避开这次直接攻击。',{type:'miss',actor:u.id,target:t.id});return {...result,success:false};}
    return this.value(u,'bloodFirstStrike')?{...result,success:true,chance:100}:result;
  };

  const plan=function(u,cast,pre){
    const s=cast.skill,t=this.unit(cast.target);
    if(s?.bloodInterrupt&&(!t?.bloodMarks?.includes(u.id)||!t.cast))return {u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};
    const isAttack=s?['攻击','持续伤害'].includes(s.category):cast.action==='attack',first=isAttack&&this.value(u,'bloodFirstStrike'),plan=planUnderlyingAction.call(this,u,cast,pre);
    if(s?.phantomDance)plan.effects.push(()=>{if(u.phantoms===undefined){u.phantoms=5;u.phantomSwapped=false;u.phantomSacrificed=0;}this.setBuff(u,'phantomPierce',.1,s,{source:this.statusSource(u,s),label:s.name,from:u.name});});
    if(s?.iceArmor)plan.effects.push(()=>this.setBuff(u,'iceArmor',s.iceArmor,s,{source:this.statusSource(u,s),label:s.name,from:u.name}));
    if(s?.bloodDomain)plan.effects.push(()=>{
      this.setBuff(u,'attackBoost',.15,s,{source:this.statusSource(u,s),label:s.name,from:u.name});
      this.setStatus(t,'accuracyDown',.2,180.001,{source:this.statusSource(u,s),label:s.name,from:u.name});
      if(!u.bloodDomainUsed){u.bloodDomainUsed=true;this.setStatus(u,'bloodFirstStrike',1,180.001,{source:this.statusSource(u,s),label:'血夜首击'});}
    });
    if(first&&plan.hit?.success){
      plan.damage=Math.round(plan.damage*1.35);for(const extra of plan.extraDamage||[])extra.amount=Math.round(extra.amount*1.35);const beforeDots=new Set(t.dots);
      plan.effects.push(()=>{for(const dot of t.dots)if(!beforeDots.has(dot)&&dot.source===u.id){dot.baseDamage=Math.round(dot.baseDamage*1.35);if(Number.isFinite(dot.rawPerTick))dot.damageMultiplier=(dot.damageMultiplier??1)*1.35;dot.damage=this.dotDamage(dot,t);}u.statuses=u.statuses.filter(x=>x.type!=='bloodFirstStrike');this.tryControl(u,t,{...s,Q:s?.Q||1,controlChance:50},1);});
    }
    return plan;
  };

  const tryControl=function(u,t,s,base){
    if(s?.controlChance===undefined)return applyTemplateControl.call(this,u,t,s,base);
    if(!this.alive(t)||t.immuneUntil>this.now||this.value(t,'controlWard'))return;
    if(this.rng.die(100)>s.controlChance)return;
    const seconds=R.controlEffect(s.Q,this.effective(u),this.effective(t)).ratio*(base||1);
    this.setStatus(t,'control',1,seconds);t.progress=Math.min(t.progress,.4);t.queuedAt=null;t.immuneUntil=this.now+Math.round(seconds*1000)+4000;
    if(t.cast){t.cast=null;this.endTurn(t,false);}t.readyAt=Math.max(t.readyAt,this.now+seconds*1000);this.addLog(t.name+'受到血夜首击禁锢'+R.round2(seconds)+'秒。',{type:'control',actor:u.id,target:t.id});
  };


root.WitnessCombatV13.specialMembers=true;
  return {methods:{controlNumbers,gainRage,damageValue,applyDamage,targetOptions,actionReason,command,hit,plan,tryControl}};
})(globalThis);

const ShieldActions=(function(root){
  const copy = value => JSON.parse(JSON.stringify(value));
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const channelName = channel => channel === '精神' ? '精神' : '生命';
  const selfOnly = skill => !!(skill && (skill.phantomDance || skill.iceArmor));

  // V13 has no source information for shields. Preserve at most one legacy layer
  // per channel until its original deadline; never reimport an initialized unit.
  function legacyLayers(unit, now) {
    const until = number(unit.shieldUntil);
    if (until <= now) return [];
    const layers = [];
    const lifeAmount = Math.max(0, number(unit.shieldHP));
    const mindAmount = Math.max(0, number(unit.shieldSH));
    if (lifeAmount > 0 || number(unit.guard) > 0) layers.push({
      source: 'legacy:' + unit.id + ':life', casterId: null, skillId: null,
      label: '原战报生命防护', channel: '生命', amount: lifeAmount,
      guard: Math.max(0, number(unit.guard)), oneHit: !!unit.oneHit,
      until, rageOnBreak: !!unit.rageOnBreak, order: 0, legacy: true
    });
    if (mindAmount > 0) layers.push({
      source: 'legacy:' + unit.id + ':mental', casterId: null, skillId: null,
      label: '原战报精神防护', channel: '精神', amount: mindAmount,
      guard: 0, oneHit: false, until, rageOnBreak: false, order: 0, legacy: true
    });
    return layers;
  }
  function readLayers(unit, now) {
    const source = Array.isArray(unit.shieldLayers) ? unit.shieldLayers : legacyLayers(unit, now);
    return source.filter(layer => number(layer.until) > now &&
      (number(layer.amount) > 0 || number(layer.guard) > 0)).map(layer => ({
        ...layer, channel: channelName(layer.channel),
        amount: Math.max(0, number(layer.amount)), guard: Math.max(0, number(layer.guard)),
        order: number(layer.order), until: number(layer.until),
        oneHit: !!layer.oneHit, rageOnBreak: !!layer.rageOnBreak
      }));
  }
  function syncLegacy(unit, now) {
    const layers = unit.shieldLayers || [];
    const active = layers.filter(layer => layer.until > now);
    const life = active.filter(layer => layer.channel === '生命').sort((a, b) => b.order - a.order);
    const mental = active.filter(layer => layer.channel === '精神');
    unit.shieldHP = life.reduce((sum, layer) => sum + layer.amount, 0);
    unit.shieldSH = mental.reduce((sum, layer) => sum + layer.amount, 0);
    // The earliest deadline keeps the existing time scheduler correct. Layer-aware
    // UI can use shieldLayersFor() to display each independent expiration.
    unit.shieldUntil = active.length ? Math.min(...active.map(layer => layer.until)) : 0;
    unit.guard = Math.max(0, ...life.map(layer => layer.guard));
    unit.oneHit = !!life[0]?.oneHit;
    unit.rageOnBreak = !!life[0]?.rageOnBreak;
  }

  const shieldLayersFor = function (unit, channel) {
    return readLayers(unit, this.now).filter(layer => channel === undefined ||
      layer.channel === channelName(channel)).sort((a, b) => b.order - a.order);
  };
  const expireShields = function (unit) {
    for (const target of unit ? [unit] : this.units || []) {
      target.shieldLayers = readLayers(target, this.now);
      syncLegacy(target, this.now);
    }
  };
  const addShieldLayer = function (target, spec) {
    this.expireShields(target);
    const channel = channelName(spec.channel);
    const source = String(spec.source || ('system:' + channel));
    const highestOrder = Math.max(0, ...this.units.flatMap(unit =>
      (unit.shieldLayers || []).map(layer => number(layer.order))));
    this.shieldLayerSequence = Math.max(number(this.shieldLayerSequence), highestOrder) + 1;
    const layer = {
      source, casterId: spec.casterId || null, skillId: spec.skillId || null,
      label: spec.label || '防护', channel,
      amount: Math.max(0, Math.round(number(spec.amount))),
      guard: Math.max(0, Math.min(1, number(spec.guard))),
      oneHit: !!spec.oneHit, until: number(spec.until, this.now + 8000),
      rageOnBreak: !!spec.rageOnBreak, order: this.shieldLayerSequence
    };
    target.shieldLayers = target.shieldLayers.filter(old =>
      old.channel !== channel || old.source !== source);
    if (layer.until > this.now && (layer.amount > 0 || layer.guard > 0)) target.shieldLayers.push(layer);
    syncLegacy(target, this.now);
    return { ...layer };
  };

  // Pure preview: damage has already passed damageValue() (ordinary defense,
  // admission scaling and V13 ice-armour snapshot). Do not apply those twice.
  const previewShieldDamage = function (target, damage, channel, source) {
    const all = readLayers(target, this.now);
    const kind = channelName(channel);
    const layers = all.filter(layer => layer.channel === kind).sort((a, b) => b.order - a.order);
    let incoming = Math.max(0, number(damage));
    const reduction = source ? this.value(source, 'damageDown') : 0;
    if (reduction && incoming > 0) incoming = Math.max(1, Math.round(incoming * (1 - reduction)));
    const beforeShields = incoming;
    let blocked = 0, guardBlocked = 0, rageTriggers = 0;
    const consumed = new Set();
    const hits = [];
    for (const layer of layers) {
      if (incoming <= 0) break; // Untouched inner layers keep one-hit eligibility.
      const before = incoming;
      let guardAmount = 0;
      if (layer.guard > 0) {
        const reduced = Math.max(0, Math.round(incoming * (1 - layer.guard)));
        guardAmount = incoming - reduced;
        guardBlocked += guardAmount;
        incoming = reduced;
        layer.guard = 0;
      }
      const absorbed = Math.min(layer.amount, incoming);
      layer.amount -= absorbed;
      incoming -= absorbed;
      blocked += absorbed;
      const removed = layer.oneHit || (layer.amount <= 0 && layer.guard <= 0);
      if (removed) {
        consumed.add(layer);
        if (layer.rageOnBreak) rageTriggers++;
      }
      hits.push({ source: layer.source, label: layer.label, incoming: before,
        blocked: absorbed, guardBlocked: guardAmount, removed, remaining: removed ? 0 : layer.amount });
    }
    return {
      beforeShields, afterShields: incoming, blocked, guardBlocked, rageTriggers, hits,
      nextLayers: all.filter(layer => !consumed.has(layer) && (layer.amount > 0 || layer.guard > 0))
    };
  };
  const previewProtection = function (target, damage, channel, source) {
    const shield = this.previewShieldDamage(target, damage, channel, source);
    const special = channel !== '精神' && this.value(target, 'soulArmor') > 0;
    const fraction = Math.min(.70, special ? this.value(target, 'soulArmor') : this.resourceConfig.absorb);
    const unitCost = special ? .3 : this.resourceConfig.mpPerDamage;
    const absorbed = Math.min(Math.floor(shield.afterShields * fraction),
      Math.floor(Math.max(0, target.mp) / unitCost));
    const mpCost = Math.ceil(absorbed * unitCost);
    return { ...shield, absorbed, mpCost, healthDamage: shield.afterShields - absorbed };
  };

  const dispelShieldLayers = function (target, fraction, channel = '生命') {
    this.expireShields(target);
    const selected = target.shieldLayers.filter(layer => layer.channel === channelName(channel))
      .sort((a, b) => b.order - a.order);
    const multiplier = 1 - Math.max(0, Math.min(1, number(fraction)));
    const before = selected.reduce((sum, layer) => sum + layer.amount, 0);
    const expected = Math.round(before * multiplier);
    let assigned = 0;
    for (const layer of selected) {
      layer._dispelFraction = layer.amount * multiplier - Math.floor(layer.amount * multiplier);
      layer.amount = Math.floor(layer.amount * multiplier);
      assigned += layer.amount;
    }
    // Preserve the old aggregate rounding exactly, with deterministic remainder
    // assignment to the largest fractional share (outer layer breaks ties).
    const remainderOrder = [...selected].sort((a, b) =>
      b._dispelFraction - a._dispelFraction || b.order - a.order);
    for (let i = 0; i < expected - assigned; i++) remainderOrder[i % remainderOrder.length].amount++;
    for (const layer of selected) delete layer._dispelFraction;
    target.shieldLayers = target.shieldLayers.filter(layer => layer.amount > 0 || layer.guard > 0);
    syncLegacy(target, this.now);
    return before - expected;
  };

  const oldTargets = MemberActions.methods.targetOptions;
  const targetOptions = function (unit, action) {
    const skill = unit?.skills.find(item => item.id === action);
    return selfOnly(skill) ? (this.alive(unit) ? [unit] : []) : oldTargets.call(this, unit, action);
  };
  const oldCommand = MemberActions.methods.command;
  const command = function (id, action, targetId) {
    const unit = this.unit(id), skill = unit?.skills.find(item => item.id === action);
    if (!this.result && selfOnly(skill) && targetId !== undefined && targetId !== null && targetId !== id) {
      return '该魂技仅能对自身施放';
    }
    return oldCommand.call(this, id, action, targetId);
  };
  const oldPlan = MemberActions.methods.plan;
  const plan = function (unit, cast, pre) {
    this.expireShields();
    const skill = cast.skill;
    // Restored V13 in-flight shape casts follow the now-explicit self target.
    if (selfOnly(skill) && cast.target !== unit.id) cast = { ...cast, target: unit.id };
    const target = this.unit(cast.target);
    if (skill?.category === '防御') {
      const result = { u: unit, t: target, cast, s: skill, damage: 0, heal: 0,
        channel: skill.channel, effects: [] };
      if (!target || !this.alive(target)) return result;
      const mental = skill.channel === '精神';
      let amount = skill.guard ? 0 : Math.round(.45 * (skill.Q || 1) *
        (mental ? pre[unit.id].MA : pre[unit.id].SA));
      amount=Math.round(amount*(skill.shieldMultiplier||1));
      result.effects.push(() => this.addShieldLayer(target, {
        source: this.statusSource(unit, skill), casterId: unit.id, skillId: skill.id,
        label: skill.name, channel: mental ? '精神' : '生命', amount,
        guard: skill.guard || 0, oneHit: !!skill.oneHit,
        rageOnBreak: !!skill.rageOnBreak, until: this.now + (skill.shieldDuration||8)*1000
      }));
      return result;
    }
    if (skill?.category === '控制' && skill.dispel) {
      const safeCast = { ...cast, skill: { ...skill, dispel: 0 } };
      const result = oldPlan.call(this, unit, safeCast, pre);
      result.s = skill;
      result.cast = cast;
      if (target && this.alive(target)) result.effects.unshift(() => {
        const amount = this.dispelShieldLayers(target, skill.dispel, '生命');
        if (amount) this.addLog(target.name + '的生命护盾削减' + amount,
          { type: 'dispel', actor: unit.id, target: target.id, amount, fx: skill.fx });
      });
      return result;
    }
    return oldPlan.call(this, unit, cast, pre);
  };

  // Same V13 resource/health semantics, with only shield traversal replaced.
  // Keep damageDown, blood marks, life trait healing and resource event payloads.
  const applyDamage = function (target, damage, channel, source, fx) {
    if (!damage || !this.alive(target)) return;
    this.expireShields(target);
    const beforeHP = target.hp;
    const mind = channel === '精神';
    const beforeProtection = mind ? target.sh : target.hp;
    const outcome = this.previewProtection(target, damage, channel, source);
    target.shieldLayers = outcome.nextLayers;
    syncLegacy(target, this.now);
    for (let i = 0; i < outcome.rageTriggers; i++) this.gainRage(target, 1);
    target.mp -= outcome.mpCost;
    const incoming = outcome.healthDamage;
    if (mind) target.sh = Math.max(0, target.sh - incoming);
    else if (target.release === '召唤') {
      if (target.petAlive) {
        target.petHP = Math.max(0, target.petHP - incoming);
        if (target.petHP === 0) {
          target.petAlive = false;
          target.cast = null;
          this.endTurn(target, false);
          target.readyAt = Math.max(target.readyAt, this.now + 2000);
          this.addLog(target.name + '的召唤体败退，停顿2秒。');
        }
      } else target.bodyHP = Math.max(0, target.bodyHP - incoming);
      target.hp = target.bodyHP + target.petHP;
    } else target.hp = Math.max(0, target.hp - incoming);
    if (outcome.mpCost) this.addLog(target.name + '受击同时结算：' +
      (mind ? '精神护持' : '生命') + ' −' + (beforeProtection - (mind ? target.sh : target.hp)) +
      '，魂力 −' + outcome.mpCost, {
        type: 'armor', target: target.id, actor: source?.id,
        paid: outcome.mpCost, absorbed: outcome.absorbed,
        healthLost: beforeProtection - (mind ? target.sh : target.hp),
        remainingDamage: incoming, channel
      });
    this.addLog(target.name + (mind ? '精神护持' : '生命') + ' −' + incoming +
      (outcome.blocked ? '（盾挡' + outcome.blocked + '）' : ''), {
        type: 'damage', actor: source?.id, target: target.id, fx,
        amount: incoming, channel, shieldBlocked: outcome.blocked,
        guardBlocked: outcome.guardBlocked, shieldLayersHit: outcome.hits
      });
    if (source?.soul.name === '血君' && target.hp < beforeHP) {
      target.bloodMarks ||= [];
      if (!target.bloodMarks.includes(source.id)) target.bloodMarks.push(source.id);
    }
  };


  function initialize(battle) {
    battle.combatRulesVersion=14; battle.v14ShieldVersion=1;
    battle.expireShields();
    battle.shieldLayerSequence=Math.max(number(battle.shieldLayerSequence),0,...battle.units.flatMap(u=>u.shieldLayers.map(l=>number(l.order))));
    for(const unit of battle.units){
      if(selfOnly(unit.cast?.skill))unit.cast.target=unit.id;
      for(const skill of unit.skills)if(selfOnly(skill))skill.target='仅自身';
    }
  }
  root.WitnessMechanicsV14={version:14,shieldVersion:1,rules:'outer-first; same-caster-skill-refresh; independent-channels; legacy-layer-expires',channelName,selfOnly};
  root.WitnessBattle.mechanicsVersion=14;
return {initialize,methods:{shieldLayersFor,expireShields,addShieldLayer,previewShieldDamage,previewProtection,dispelShieldLayers,targetOptions,command,plan,applyDamage}};
})(globalThis);

// Canonical 10.07 mechanics, assembled once. Challenge hooks are isolated.
const ModernActions=(function(root){
'use strict';
const R=root.WitnessRules;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const original={...MemberActions.methods,...Object.fromEntries(['actionReason','command','effective','cost','castTime','applyDotDamage'].map(k=>[k,AttributeActions.methods[k]||MemberActions.methods[k]])),plan:ShieldActions.methods.plan,targetOptions:ShieldActions.methods.targetOptions,applyDamage:ShieldActions.methods.applyDamage,actionRate:BattleCore.methods.actionRate};
original.actionReason=MemberActions.methods.actionReason;original.command=MemberActions.methods.command;
const initialize=b=>{for(const u of b.units)u.modern||={sequence:0,overheat:[0,0]};};
const state=u=>(u.modern||=( {sequence:0,overheat:[0,0]} ));
function effective(u){
  let out=AttributeActions.methods.effective.call(this,u);const before=R.derive(out),q={...out};
  if(this.value(u,'qinyanForm')){q.B*=1.25;const after=R.derive(q);for(const k of ['PA','SA','DEF','MDEF'])q[k]=out[k]*after[k]/before[k];}
  if(this.value(u,'goldBlade'))q.PA*=1.20;if(this.value(u,'goldBurn'))q.SA*=1.25;return ChallengeBattle.effective(this,u,q);
}
function cost(u,s){let n=s.modernEffect==='linSun'?Math.ceil(u.model.derived.baseMP*.10*(1-this.effective(u).costReduction/100)*(1+this.value(u,'costUp'))):AttributeActions.methods.cost.call(this,u,s);if(this.value(u,'qinyanForm')&&s.modernEffect!=='uranus')n*=.78;return Math.max(1,Math.ceil(n));}
function castTime(u,s){let t=AttributeActions.methods.castTime.call(this,u,s);if(s.modernEffect==='qinyanSix'&&this.value(u,'qinyanForm'))t=.9;return t*(1+this.value(u,'frostCastSlow'))/(this.value(u,'pursuit')?1.30:1);}
function actionRate(u){return BattleCore.methods.actionRate.call(this,u)*(this.value(u,'pursuit')?1.30:1);}
function targetOptions(u,action){const s=u.skills.find(x=>x.id===action);if(s?.selfOnly||s?.modernEffect&&['uranus','qinyanSpeed','qinyanSwap','iceCrown','yananGuard'].includes(s.modernEffect))return [u];return ShieldActions.methods.targetOptions.call(this,u,action);}
function actionReason(u,action){
  const s=u.skills.find(x=>x.id===action);if(s?.attackSubtype==='pursuit'&&(u.style!=='敏攻'||u.soul.spirit_specialist))return '追势仅限敏攻系';if(s?.autoOnly)return '满足条件时自动发动';if(s?.category==='回蓝')return '该类魂技已移除';
  if(s?.modernEffect){if(['goldBlade','goldBurn','goldHand'].includes(s.modernEffect)&&this.value(u,s.modernEffect))return '该形态已生效';const m=state(u),hot=m.overheat.filter(x=>x>this.now).length;
    if(s.modernEffect==='qinyanSwap'&&hot)return '重炮过热期间不能置换';
    if(['qinyanSpeed','railgun','uranus'].includes(s.modernEffect)&&hot===2&&!this.value(u,'qinyanForm'))return '双臂均在过热';
    if(s.modernEffect==='uranus'&&(this.value(u,'qinyanForm')||this.value(u,'mentalRecovery')))return '仍在半能量形态或精神蓄养中';
    if(s.modernEffect==='uranus'&&u.sh<=Math.ceil(u.model.derived.SH*.06))return '精神护持不足以安全融合';
    if(s.modernEffect==='uranusRepair'&&!this.value(u,'qinyanForm'))return '仅半能量形态内可修补';
    if(s.modernEffect==='qinyanSwap'&&this.value(u,'phaseSwap'))return '置换保险尚未消耗';
    if(s.modernEffect==='yananGuard'&&this.value(u,'preDR'))return '迎击防护仍有效';
  }
  return MemberActions.methods.actionReason.call(this,u,action);
}
function command(id,action,target){
  const u=this.unit(id),pursuit=!!this.value(u,'pursuit'),before=u.actions||0;
  const error=MemberActions.methods.command.call(this,id,action,target);if(error)return error;
  const eventId=id+':'+(++state(u).sequence);
  if(u.cast){u.cast.eventId=eventId;if(pursuit&&action!=='wait'){if(!u.cast.skill)u.cast.end=this.now+Math.round((u.cast.end-this.now)/1.30);u.statuses=u.statuses.filter(x=>x.type!=='pursuit');u.cast.pursuitUsed=true;this.addLog(u.name+'消耗追势：本次出手读条享受30%增速。',{type:'pursuitConsume',actor:id});}}
  else if((u.actions||0)>before)this.onActionComplete(u,{action,eventId,skill:null});
  return '';
}
function damageValue(u,t,raw,channel,pre){
  const s=this._damageSpec,kind=s?.hitKind||'unknown';let remain=1;
  if(!s?.damageMode||s.damageMode!=='periodic')for(const st of this.status(t,'preDR')){
    if(st.channels&&!st.channels.includes(channel))continue;if(st.hitKinds&&!st.hitKinds.includes(kind))continue;
    if(st.once){if(this._periodic)continue;const key=this._planKey||'periodic';if(st.reserved&&st.reserved!==key)continue;st.reserved=key;}
    const rankFactor=st.levelLimit===undefined?1:Math.pow(.5,Math.max(0,u.level-st.levelLimit)/10);
    remain*=1-clamp(st.value*rankFactor,0,.80);
  }
  if(this.value(t,'qinyanForm')&&channel==='物理'&&['slash','pierce'].includes(kind))remain*=.80;
  const reduced=raw*Math.max(.20,remain);
  const crown=this.value(u,'iceCrown')&&s?.fx==='ice'?1.10:1;
  const n=MemberActions.methods.damageValue.call(this,u,t,reduced*crown,channel,pre);
  if(remain<1&&!this._dotPreview)this.addLog(t.name+'防御前免伤：原伤'+Math.round(raw)+' → '+Math.round(reduced)+'，防御后'+n+'。',{type:'preReduction',actor:u.id,target:t.id,raw,reduced,damage:n});
  return n;
}
function tryControl(u,t,s,duration){
  if(!t||!this.alive(t))return;if(t.immuneUntil>this.now||this.value(t,'controlWard'))return;
  const key=this._effectKey||this._planKey||`${this.now}:${u.id}:${s.id}:${u.actions}`;
  if(ChallengeBattle.blockControl(this,u,t,s,key))return;
  return MemberActions.methods.tryControl.call(this,u,t,s,duration);
}
function plan(u,cast,pre){
  if(u.templateId==='anjingwen'&&(!cast.skill&&cast.action==='attack'||cast.skill?.leafAttack)){const burn=!!this.value(u,'goldBurn'),skill=cast.skill||{name:'黄金叶普攻',category:'攻击',Q:1,factor:.375};cast={...cast,skill:{...skill,channel:burn?'能量':'物理',factor:(skill.factor??1)*(this.value(u,'goldHand')?1.15:1),fx:burn?'fire':'slash'}};}
  const s=cast.skill,t=this.unit(cast.target),key=cast.eventId||`${this.now}:${u.id}:${s?.id||cast.action}:${u.actions}`;
  if(s?.category==='控制'&&t?.guildmaster&&!(t.immuneUntil>this.now||this.value(t,'controlWard'))&&(t.guildmaster.legendaryRemaining>0||t.guildmaster.blocked.includes(key))){ChallengeBattle.blockControl(this,u,t,s,key);return {u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};}
  const previous=this._damageSpec,oldKey=this._planKey;this._damageSpec=s;this._planKey=key;
  let p;try{p=ShieldActions.methods.plan.call(this,u,cast,pre);}finally{this._damageSpec=previous;this._planKey=oldKey;}
  p._preDamage=t?.hp;
  // Custom active effects are ordinary actions; resource payment stays in command.
  if(s?.modernEffect&&['qinyanSpeed','qinyanSwap','uranus','iceCrown','yananGuard'].includes(s.modernEffect))p.effects=[];
  if(s?.modernEffect==='qinyanSpeed')p.effects.push(()=>{for(const [k,value]of [['B',.35],['A',.30]])this.setStatus(u,'statUp'+k,value,this.value(u,'qinyanForm')?12:24,{source:u.id+':speed'+k,label:'极速',from:u.name,actionsRemaining:4,fatigue:!this.value(u,'qinyanForm'),fatigueValue:.05,fatigueSeconds:4});this.addLog(u.name+'极速：肉体强度提高35%、敏捷提高30%。',{type:'status',actor:u.id,target:u.id});});
  if(s?.modernEffect==='qinyanSwap')p.effects.push(()=>this.setStatus(u,'phaseSwap',1,4,{source:u.id+':swap',label:'置换保险'}));
  if(s?.modernEffect==='uranus')p.effects.push(()=>{u.sh-=Math.ceil(u.model.derived.SH*.06);this.setStatus(u,'qinyanForm',1,12,{source:u.id+':uranus',label:'乌拉诺斯'});this.setStatus(u,'mentalRecovery',1,24,{source:u.id+':recovery',label:'精神蓄养'});this.addLog(u.name+'融合极光：支付精神护持，进入12秒半能量形态；结束后需蓄养。',{type:'status',actor:u.id,target:u.id});});
  if(s?.modernEffect==='iceCrown')p.effects.push(()=>this.setStatus(u,'iceCrown',.10,10,{source:u.id+':crown',label:'冰棘王冠'}));
  if(s?.modernEffect==='yananGuard')p.effects.push(()=>this.setStatus(u,'preDR',.30,4,{source:u.id+':windGuard',label:'风铭回锋',once:true,channels:['物理','能量']}));
  if(s?.modernEffect==='linEnergy')p.effects.push(()=>{
    const controlled=this.events.some(e=>e.time===this.now&&e.type==='control'&&e.actor===u.id&&e.target===t.id);
    if(!controlled||(state(u).lightConversions||0)>=2)return;
    const drain=Math.min(t.mp,Math.floor(t.mp*.08),Math.floor(t.model.derived.baseMP*.06));if(drain<=0)return;
    t.mp-=drain;state(u).lightConversions=(state(u).lightConversions||0)+1;
    const converted=Math.max(0,Math.min(Math.floor(drain*.25),Math.floor(u.model.derived.baseMP*.015),u.model.derived.MP-u.mp));u.mp+=converted;
    this.addLog(u.name+'光缚成功：抽离魂力'+drain+'，有限转化'+converted+'。',{type:'lightConversion',actor:u.id,target:t.id,drain,converted});
  });
  if(s?.modernEffect&&['goldBlade','goldBurn'].includes(s.modernEffect)){p.effects=[];p.effects.push(()=>{u.statuses=u.statuses.filter(st=>!['goldBlade','goldBurn'].includes(st.type));this.setStatus(u,s.modernEffect,1,180.001,{source:u.id+':leafMode',label:s.name});this.addLog(u.name+'切换为'+s.name+'，另一形态同时解除。',{type:'leafMode',actor:u.id,mode:s.modernEffect});});}
  if(s?.modernEffect==='goldHand')p.effects.push(()=>this.setStatus(u,'goldHand',.15,180.001,{source:u.id+':goldHand',label:'黄金左手·叶势'}));
  if(s?.modernEffect&&['linLightwall','goldWall'].includes(s.modernEffect)){p.effects=[];p.effects.push(()=>this.setStatus(u,'preDR',.20,4,{source:u.id+':'+s.modernEffect,label:s.name,channels:s.modernEffect==='goldWall'?['物理']:['物理','能量']}));}
  if(s?.energyWard)p.effects.push(()=>this.setStatus(u,'preDR',s.energyWardRate||.30,s.energyWardDuration||4,{source:u.id+':energyWard',label:'虚能抵消',once:true,channels:['能量'],levelLimit:u.level}));
  if(s?.attackSubtype==='pursuit'&&p.hit?.success)p.effects.push(()=>{this.setStatus(u,'pursuit',.30,8,{source:u.id+':pursuit',label:'追势'});u.readyAt=Math.min(u.readyAt,this.now+Math.round(300/1.30));this.addLog(u.name+'获得追势：下一轮整体出手速度提高30%，伤害采用敏捷强化系数。',{type:'pursuitGain',actor:u.id,target:u.id});});
  if(s?.modernEffect==='railgun')p.effects.push(()=>{if(!this.value(u,'qinyanForm')){const heat=state(u).overheat,arm=heat[0]<=this.now?0:1;heat[arm]=this.now+6000;this.addLog(u.name+(arm?'右':'左')+'臂重炮过热6秒。',{type:'overheat',actor:u.id});}});
  if(s?.fleshFrost&&t)p.effects.push(()=>{if(t.hp<p._preDamage&&this.alive(t)){const d=this.effective(u).SA*.12;t.dots.push({key:u.id+':clawFrost',source:u.id,channel:'能量',baseDamage:Math.round(d),damage:Math.round(d),rawPerTick:d,next:this.now+3000,ticks:3,fx:'ice',damageNature:'residual'});}});
  // One-shot DR is reserved to this whole cast, not consumed per segment.
  for(const target of this.units)if(this.status(target,'preDR').some(st=>st.once&&st.reserved===key))p.effects.push(()=>{target.statuses=target.statuses.filter(st=>!(st.type==='preDR'&&st.once&&st.reserved===key));this.addLog(target.name+'的一次迎击防护已消耗。',{type:'guardConsumed',target:target.id});});
  // Keep passive losses inside the candidate's effects so exact projection
  // captures them too. The scheduler's completion call is idempotent.
  if(u.guildmaster)p.effects.push(()=>this.onActionComplete(u,{...cast,eventId:key}));
  p.effects=p.effects.map(fn=>()=>{const prev=this._effectKey;this._effectKey=key;try{fn();}finally{this._effectKey=prev;}});
  return p;
}
function applyDamage(t,amount,channel,source,fx){
  // A successful phase swap avoids one direct life packet, not poison ticks.
  if(!source?.scarred&&channel!=='精神'&&!this._periodic&&this.value(t,'phaseSwap')){t.statuses=t.statuses.filter(s=>s.type!=='phaseSwap');this.addLog(t.name+'以极光置换避开一次直接生命伤害。',{type:'phaseSwap',target:t.id});return;}
  const hp=t.hp;ShieldActions.methods.applyDamage.call(this,t,amount,channel,source,fx);
  if(t.hp<hp&&t.cast?.skill?.modernEffect==='qinyanSwap'){t.cast=null;this.endTurn(t,false);this.addLog(t.name+'的置换准备被伤害打断。',{type:'interrupt',target:t.id});}
  this.onResourceChange(t);
}
function applyDotDamage(t,d){
  const u=this.unit(d.source);if(!u)return;
  const previous=this._periodic;this._periodic=true;
  try{const amount=this.dotDamage(d,t);d.damage=amount;this.applyDamage(t,amount,d.channel,u,d.fx);this.addLog(t.name+'受到'+(d.damageNature==='poison'?'毒伤':'冻伤/残伤')+'一跳。',{type:'dotTick',actor:u.id,target:t.id,amount});}finally{this._periodic=previous;}
}
function onActionComplete(u,cast){
  if(!cast.eventId)cast.eventId=u.id+':'+(++state(u).sequence);
  ChallengeBattle.completed(this,u,cast);
}
function onResourceChange(u){ChallengeBattle.resourceChange(this,u);}
return {initialize,methods:{effective,cost,castTime,actionRate,targetOptions,actionReason,command,damageValue,tryControl,plan,applyDamage,applyDotDamage,onActionComplete,onResourceChange}};
})(globalThis);

// Migrate only ongoing battles. Completed reports remain historical records.
const MechanicsFix=(function(root){
  function restore(b,snapshot){
    if(snapshot.mechanicsFixVersion===1||b.result)return;
    const B=root.WitnessBattle,targets=new Set(['yanan-3','yanan-4','yixiaobei-4']);
    let missingTiming=false;
    for(const u of b.units){
      const template=B.templates.find(t=>t.id===u.templateId);
      if(template&&u.skills.some(s=>targets.has(s.id))){
        const canonical=B.templateUnit(template,u.level,u.id,u.team).skills;
        u.skills=u.skills.map(s=>targets.has(s.id)?canonical.find(x=>x.id===s.id)||s:s);
        if(targets.has(u.cast?.skill?.id))u.cast.skill=JSON.parse(JSON.stringify(u.skills.find(s=>s.id===u.cast.skill.id)));
      }
      for(const s of u.skills.filter(s=>s.statusLifetime==='timed')){
        const source=b.statusSource(u,s);
        for(const target of b.units){
          target.statuses=target.statuses.filter(st=>!(st.source===source&&s.genericDefDown===false&&['defDown','mindDown'].includes(st.type)));
          for(const st of target.statuses.filter(st=>st.source===source)){
            const release=[...b.log].reverse().find(e=>{
              if(e.type!=='release'||e.actor!==u.id||e.label!==s.name||!(e.target===target.id||target.id===u.id&&st.type==='evasion'))return false;
              if(!['defDown','mindDown'].includes(st.type))return true;
              return b.log.some(check=>{const roll=String(check.text||'').match(/减益判定(\d+) \/ (\d+(?:\.\d+)?)%/);return check.time===e.time&&check.actor===u.id&&check.target===target.id&&roll&&Number(roll[1])<=Math.round(Number(roll[2]));});
            });
            if(release){st.until=release.time+s.duration*1000;st.appliedAt=release.time;}
            else {st.until=b.now;missingTiming=true;}
            delete st.hitsRemaining;delete st.actionsRemaining;
          }
          target.statuses=target.statuses.filter(st=>st.until>b.now);
        }
      }
      // Old saves recorded boosted baseDamage but not the first-strike flag.
      // Identify the surviving DOT from its release and the first attack after
      // the one-time blood domain activation, instead of guessing from defence.
      const releases=b.log.filter(e=>e.type==='release'&&e.actor===u.id);
      const domain=releases.findIndex(e=>u.skills.some(s=>s.name===e.label&&s.bloodDomain));
      const first=domain<0?null:releases.slice(domain+1).find(e=>e.label==='普攻'||u.skills.some(s=>s.name===e.label&&['攻击','持续伤害'].includes(s.category)));
      for(const target of b.units)for(const dot of target.dots.filter(d=>d.source===u.id&&d.damageMultiplier===undefined)){
        const skill=u.skills.find(s=>dot.key===u.id+'-'+s.id);
        const appliedAt=skill?dot.next-(skill.dotFirstMs||3000)-((skill.dotTicks||3)-dot.ticks)*3000:null;
        dot.damageMultiplier=first&&skill&&first.label===skill.name&&first.time===appliedAt?1.35:1;
      }
    }
    b.refreshDotDamage();b.mechanicsFixVersion=1;
    b.addLog('已同步持续伤害、短时状态与逸仙剑体修复规则。'+(missingTiming?'部分旧短时状态缺少释放时间记录，已解除。':''),{type:'rulesMigration',mechanicsFixVersion:1});
  }
  return {restore};
})(globalThis);

// Restore old snapshots without reviving retired soul passives.
const ActorState={initialize(){delete this.traitsEnabled;delete this.traitRulesVersion;for(const u of this.units){delete u.passive;delete u.soul.combat_profile;for(const k of Object.keys(u))if(k.startsWith('_trait'))delete u[k];if(u.soul.id.startsWith('npc-'))u.model.ratingProfile='npc';}}};

// Independent challenge. Never part of the random examiner/trait registry.
const ScarredActions=(function(root){
'use strict';
const R=root.WitnessRules,ID='mysterious_scarred_woman',copy=x=>JSON.parse(JSON.stringify(x));
const base={...ModernActions.methods,scheduleAI:BattleCore.methods.scheduleAI,basicCost:BattleCore.methods.basicCost,damageValue:ModernActions.methods.damageValue,effective:ModernActions.methods.effective,previewProtection:ShieldActions.methods.previewProtection,actionReason:ModernActions.methods.actionReason,nextTime:BattleCore.methods.nextTime,hasOffense:BattleCore.methods.hasOffense,finishByTime:BattleCore.methods.finishByTime};
function initialize(b){
 const old=b.unit('enemy'),level=b.unit('player').level,soul={id:'npc-'+ID,name:'幽行剑',tier:9,main_kind:'器',subkind:'战斗',style:'敏攻',attribute:'空间',elements:[],spirit_specialist:false};
 const raw=R.buildStats({level,soul,style:'敏攻',release:'召出'}),average=R.KEYS.reduce((n,k)=>n+raw.stats[k],0)/6;
 const growth=Object.fromEntries(R.KEYS.map(k=>[k,R.round2(raw.stats[k]*(raw.benchmark*2.20/average-1))]));
 const model=R.buildStats({level,soul,style:'敏攻',release:'召出',growth});model.ratingProfile='npc';model.derived.MP*=3;
 const skills=['攻击','强化'].map((category,i)=>{const s=R.makeSkill({soul,style:'敏攻',stats:model,index:i+1,years:99999,category});delete s.effects;return {...s,id:ID+'-'+(i+1),ring:i+1,years:99999,fx:'ghost'};});
 Object.assign(skills[0],{name:'无幽剑光',category:'攻击',channel:'物理',factor:.5,budgetFactor:.9,castFixed:.6,costPercent:.05,cooldown:3,scarEffect:'sword',maxCharges:3,deferredRelease:true,dormantDrainPerSecond:.012,effect:'布设剑光潜入幽行位面，最多三道；蛰伏持续耗蓝，择机透归现实。三道上限与威力不随蛰伏时间增加。'});
 Object.assign(skills[1],{name:'虚影之纱',category:'强化',channel:'能量',selfOnly:true,castFixed:1,costPercent:.09,cooldown:14,scarEffect:'veil',evasion:R.round2(.28*skills[1].Q/2.97),chargePerSecond:1,maxCharges:10,devourFactor:1,chargeFactor:.08,lifesteal:.4,effect:'潜行并逐秒蓄能，最多十层；出手或实际受创后破隐，结算吞噬一击，并将实际伤害的一部分转为生命。'});
 for(const s of skills){s.cost=R.skillBudget(model,s);s.previewCost=s.cost*(s.category==='攻击'?2:1);s.previewCast=s.castFixed;}
 Object.assign(old,{name:'神秘伤疤女',templateId:ID,source:'独立神级挑战',portrait:null,soul,style:'敏攻',release:'召出',level,model,skills,hp:model.derived.HP,sh:model.derived.SH,mp:model.derived.MP,cast:null,statuses:[],dots:[],shieldLayers:[],shieldHP:0,shieldSH:0,shieldUntil:0,cooldowns:{},uses:{},fallen:false,modern:{sequence:0,overheat:[0,0]},scarred:{version:1,swords:[],serial:0,veil:null,lastPulse:b.now,nextPulse:b.now+1000,drainRemainder:0}});
 delete old.passive;delete old.guildmaster;
 b.units=b.units.filter(u=>u.id!=='enemySupport');b.challengeId=ID;
 b.addShieldLayer(old,{source:ID+':auspicious',label:'祥光',channel:'生命',amount:model.derived.HP,until:180001});
 b.addLog('神秘伤疤女登台：与挑战者同级，神级六维，仅有两项万年最高档魂技。需在时限内清空她的生命与精神双槽。',{type:'challengeStart',target:old.id});
}
function validate(b){const u=b.unit('enemy'),p=u?.scarred;if(!p||p.version!==1||!Array.isArray(p.swords)||p.swords.length>3||u.skills.length!==2||u.level!==b.unit('player').level)throw Error('神秘挑战快照无效');for(const k of ['lastPulse','nextPulse','drainRemainder','serial'])if(!Number.isFinite(p[k])||p[k]<0)throw Error('幽行状态无效');for(const sword of p.swords)if(!Number.isFinite(sword.at)||sword.at<0||sword.at>b.now)throw Error('剑光记录无效');if(p.veil&&(!Number.isFinite(p.veil.at)||p.veil.at<0||p.veil.at>b.now))throw Error('潜行记录无效');}
function basicCost(u){return u.scarred?base.basicCost.call(this,u)*2:base.basicCost.call(this,u);}
function cost(u,s){if(!u.scarred)return base.cost.call(this,u,s);if(u.hp<=0)return 0;return base.cost.call(this,u,s)*(s.category==='攻击'?2:1);}
function effective(u){return base.effective.call(this,u);}
function damageValue(u,t,raw,ch,pre){return u.scarred?Math.max(1,Math.round(raw)):base.damageValue.call(this,u,t,raw,ch,pre);}
function previewProtection(t,damage,ch,source){
 if(source?.scarred){const out=ShieldActions.methods.previewShieldDamage.call(this,t,0,ch,null),reduction=this.value(source,'damageDown');const amount=Math.max(0,Math.round(damage*(1-reduction)));return {...out,beforeShields:amount,afterShields:amount,blocked:0,guardBlocked:0,absorbed:0,mpCost:0,healthDamage:amount,bypassShield:true};}
 if(t.scarred&&ch!=='精神'){const out=this.previewShieldDamage(t,damage,ch,source),mpCost=Math.min(Math.max(0,t.mp),Math.floor(out.afterShields*.90));return {...out,absorbed:mpCost,mpCost,healthDamage:out.afterShields-mpCost,shadowWalk:true};}
 return base.previewProtection.call(this,t,damage,ch,source);
}
function chooseTarget(b,u){return b.units.filter(t=>t.team!==u.team&&b.alive(t)).sort((a,z)=>(a.hp+a.sh)/(a.model.derived.HP+a.model.derived.SH)-(z.hp+z.sh)/(z.model.derived.HP+z.model.derived.SH))[0];}
function strike(b,u,t,factor,Q,label){if(!t||!b.alive(t)||!b.alive(u))return 0;const hit=b.hit(u,t,'物理');if(!hit.success){b.addLog(label+'未命中。',{type:'miss',actor:u.id,target:t.id});return 0;}const before=t.hp+t.sh,pre=Object.fromEntries(b.units.map(v=>[v.id,b.effective(v)])),amount=b.damageValue(u,t,1.2*Q*b.effective(u).PA*factor,'物理',pre);b.applyDamage(t,amount,'物理',u,'ghost');return Math.max(0,before-t.hp-t.sh);}
function breakVeil(b,u,target){const p=u.scarred;if(!p?.veil||b._projection)return;const elapsed=Math.max(0,(b.now-p.veil.at)/1000),s=u.skills[1],layers=Math.min(s.maxCharges,Math.floor(elapsed));p.veil=null;u.statuses=u.statuses.filter(st=>st.source!==ID+':veil');const actual=strike(b,u,target||chooseTarget(b,u),s.devourFactor+layers*s.chargeFactor,s.Q,'虚影之纱·吞噬');const before=u.hp;b.heal(u,Math.floor(actual*s.lifesteal),'生命');b.addLog('虚影之纱破隐：'+layers+'层蓄能，实际吞噬'+actual+'，回复生命'+(u.hp-before)+'。',{type:'scarVeilBreak',actor:u.id,layers,actual,healed:u.hp-before});}
function releaseSwords(b,u){const p=u.scarred,s=u.skills[0],swords=p.swords.splice(0);if(!swords.length)return;breakVeil(b,u,chooseTarget(b,u));for(const sword of swords){const t=chooseTarget(b,u);if(!t)break;strike(b,u,t,s.factor,s.Q,'无幽剑光');}b.addLog('无幽剑光透归现实，释放'+swords.length+'道。',{type:'scarSwordRelease',actor:u.id,count:swords.length});}
function pulse(b,u,force=false){const p=u.scarred;if(!p||b._projection||b._scarPulsing||!b.alive(u)||!force&&b.now<p.nextPulse)return;b._scarPulsing=true;try{
 const elapsed=Math.max(0,b.now-p.lastPulse)/1000;
 if(p.swords.length&&u.hp>0){const exact=u.model.derived.baseMP*.012*2*p.swords.length*elapsed+p.drainRemainder,wanted=Math.floor(exact),paid=Math.min(u.mp,wanted);u.mp-=paid;p.drainRemainder=exact-wanted;if(paid)b.addLog('蛰伏剑光维持，魂力 −'+paid+'。',{type:'scarSwordUpkeep',actor:u.id,paid});if(paid<wanted)releaseSwords(b,u);}
 p.lastPulse=b.now;p.nextPulse=b.now+1000;
 if(p.swords.length&&(p.swords.length>=3||b.now-p.swords[0].at>=6000||u.mp<=0&&u.hp>0))releaseSwords(b,u);
 }finally{b._scarPulsing=false;}}
function applyDamage(t,amount,ch,source,fx){
 if(!t.scarred)return base.applyDamage.call(this,t,amount,ch,source,fx);
 if(!amount||!this.alive(t))return;this.expireShields(t);const hp=t.hp,sh=t.sh,out=this.previewProtection(t,amount,ch,source);
 t.shieldLayers=out.nextLayers;this.expireShields(t);t.mp=Math.max(0,t.mp-out.mpCost);
 let remain=out.healthDamage;const first=ch==='精神'?'sh':'hp',second=first==='hp'?'sh':'hp',paid=Math.min(t[first],remain);t[first]-=paid;remain-=paid;t[second]=Math.max(0,t[second]-remain);
 this.addLog(t.name+'承伤：生命 −'+(hp-t.hp)+'，精神 −'+(sh-t.sh)+'，魂力 −'+out.mpCost+'。',{type:'damage',actor:source?.id,target:t.id,amount:out.healthDamage,channel:ch,healthLost:hp-t.hp,mentalLost:sh-t.sh,paid:out.mpCost,shieldBlocked:out.blocked,guardBlocked:out.guardBlocked,shieldLayersHit:out.hits});
 if(this.alive(t)&&(hp>t.hp||sh>t.sh))breakVeil(this,t,source||chooseTarget(this,t));
}
function plan(u,cast,pre){
 if(!u.scarred||!cast.skill?.scarEffect){const p=base.plan.call(this,u,cast,pre);if(u.scarred&&cast.action==='attack'&&u.scarred.veil)p.effects.unshift(()=>breakVeil(this,u,p.t));return p;}
 const s=cast.skill,t=this.unit(cast.target),p={u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};
 if(s.scarEffect==='sword')p.effects.push(()=>{pulse(this,u,true);if(u.scarred.swords.length<3){u.scarred.swords.push({id:++u.scarred.serial,at:this.now});this.addLog('无幽剑光潜入幽行位面，当前'+u.scarred.swords.length+'道。',{type:'scarSwordPlaced',actor:u.id});}breakVeil(this,u,chooseTarget(this,u));pulse(this,u,true);});
 else p.effects.push(()=>{u.scarred.veil={at:this.now};this.setStatus(u,'evasion',s.evasion,180.001,{source:ID+':veil',label:'虚影之纱'});this.addLog('虚影之纱展开，潜行蓄能。',{type:'scarVeilStart',actor:u.id});});
 return p;
}
function actionReason(u,action){const s=u.skills.find(s=>s.id===action);if(u.scarred&&s?.scarEffect==='sword'&&u.scarred.swords.length>=3)return '剑光已达三道';if(u.scarred&&s?.scarEffect==='veil'&&u.scarred.veil)return '仍在潜行';return base.actionReason.call(this,u,action);}
function aiChoice(u){if(!u.scarred)return UnifiedDecision.methods.aiChoice.call(this,u);const target=chooseTarget(this,u);if(!target)return null;const action=(id,t=target.id)=>({action:id,target:t});if(u.bonusAttack)return u.scarred.veil||u.mp<this.basicCost(u)?action('skipBonus',u.id):action('attack');if(u.scarred.veil&&this.now-u.scarred.veil.at<10000)return action('wait',u.id);for(const s of [u.skills[1],u.skills[0]])if(!this.actionReason(u,s.id))return action(s.id,s.selfOnly?u.id:target.id);return !this.actionReason(u,'attack')?action('attack'):action('wait',u.id);}
function onResourceChange(u){ModernActions.methods.onResourceChange.call(this,u);pulse(this,u);}
function scheduleAI(auto=false){for(const u of this.units)pulse(this,u);return base.scheduleAI.call(this,auto);}
function nextTime(){const next=base.nextTime.call(this);return Math.min(next,...this.units.filter(u=>u.scarred&&this.alive(u)&&u.scarred.nextPulse>this.now).map(u=>u.scarred.nextPulse));}
function hasOffense(u){return u.scarred?this.alive(u):base.hasOffense.call(this,u);}
function finishByTime(){const boss=this.units.find(u=>u.scarred);if(boss&&this.alive(boss)){this.result={winner:boss.team,reason:'180秒内未清空神秘伤疤女双槽',time:this.now};this.addLog(this.result.reason);return;}return base.finishByTime.call(this);}
root.WitnessScarredChallenge={id:ID,initialize,validate};
return {methods:{basicCost,cost,effective,damageValue,previewProtection,applyDamage,plan,actionReason,aiChoice,onResourceChange,scheduleAI,nextTime,hasOffense,finishByTime}};
})(globalThis);

const BattleProjection=(function(root){
  'use strict';
  const B=root.WitnessBattle, R=root.WitnessRules;
  const base={plan:ScarredActions.methods.plan,hit:MemberActions.methods.hit,tryControl:ModernActions.methods.tryControl,applyDamage:ScarredActions.methods.applyDamage,heal:BattleCore.methods.heal};
  const fields=['hp','sh','mp','petHP','bodyHP','shieldHP','shieldSH'];
  const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
  const empty=()=>Object.fromEntries(fields.map(k=>[k,0]));
  const totals=u=>Object.fromEntries(fields.map(k=>[k,Number(u?.[k])||0]));
  const difference=(a,b)=>Object.fromEntries(fields.map(k=>[k,(a[k]||0)-(b[k]||0)]));
  const add=(a,b,w=1)=>{for(const k of fields)a[k]+=(b[k]||0)*w;return a;};
  const threshold=n=>Math.max(0,Math.min(100,Math.round(n)));
  const isAttack=s=>!s||s.category==='攻击'||s.category==='持续伤害'||s.damageMode==='periodic';
  const periodic=s=>!!s&&(s.category==='持续伤害'||s.damageMode==='periodic');
  const channel=(u,s)=>s?.channel||u.soul.basicChannel||(u.soul.spirit_specialist?'精神':'物理');

  // Only immutable character definitions are shared. All combat resources,
  // status records, shield layers, cooldowns and casts belong to the fork.
  const forkProjectionState=function(){
    const out=Object.create(Object.getPrototypeOf(this));
    for(const [key,value] of Object.entries(this)){
      if(['units','rng','rngState','seed','log','events'].includes(key)||key.startsWith('_')||typeof value==='function')continue;
      out[key]=value&&typeof value==='object'?copy(value):value;
    }
    out.units=this.units.map(u=>{
      const v={};for(const [key,value] of Object.entries(u))v[key]=['model','soul','skills'].includes(key)?value:(value&&typeof value==='object'?copy(value):value);return v;
    });
    out.events=[];out.log=[];out.seed='public-projection';out._valuingAI=false;out._projection=true;
    out.scheduleAI=function(){};
    // No seed or future state from the real random generator is copied.
    out.rng={die(){throw Error('Projection randomness requires an explicit branch');}};
    return out;
  };

  function dotEvents(b,dots,targetId,weight){
    return dots.flatMap(d=>Array.from({length:Math.max(0,d.ticks)},(_,i)=>({
      time:d.next+i*3000,at:(d.next+i*3000-b.now)/1000,
      channel:d.channel,damage:d.damage,weight,targetId,sourceId:d.source,key:d.key
    })));
  }
  function changedDots(b,before,after){
    const events=[];
    for(const t of b.units){
      const old=before[t.id]||[],next=after[t.id]||[];
      const keys=new Set([...old,...next].map(d=>d.key));
      for(const key of keys){const a=old.find(d=>d.key===key),z=next.find(d=>d.key===key);
        if(JSON.stringify(a)===JSON.stringify(z))continue;
        if(a)events.push(...dotEvents(b,[a],t.id,-1));if(z)events.push(...dotEvents(b,[z],t.id,1));
      }
    }
    return events;
  }

  function run(source,actorId,targetId,action,options,rollPath,explicit){
    const b=source.forkProjectionState(),origin=source.now;
    const effectiveCache=new WeakMap(),effective=ScarredActions.methods.effective;
    b.effective=function(unit){
      const previous=effectiveCache.get(unit);
      // Effective state also depends on form and passive counters; calculate afresh.
      const value=effective.call(this,unit);effectiveCache.set(unit,{now:this.now,statuses:unit.statuses,model:unit.model,value});return value;
    };
    const finish=result=>{delete b.effective;return result;};
    let rolls=0,rollLimit=null,context=null,marker=null,candidate=null,plans=[],plansAt=-1,queue=null,healQueue=null,damageDepth=0;
    const capture={immediate:empty(),actorEffects:empty(),packets:[],futureEvents:[],beforeEffects:null,beforeDotBoost:null,afterDotBoost:null,afterEffects:null,resourcesBefore:null};
    b.rng={die(sides){
      if(sides!==100)throw Error('Unsupported projection die d'+sides);
      let limit=rollLimit;
      if(limit===null&&context?.s){limit=threshold(R.controlEffect(context.s.Q,context.pre[context.u.id],context.pre[context.t.id]).chance);}
      if(limit===null)throw Error('Missing public probability for projection die');
      const index=rolls++;
      if(index<rollPath.length){const value=rollPath[index];if(!Number.isInteger(value)||value<1||value>100)throw Error('Projection rolls must be integers from 1 to 100');return value;}
      if(explicit)throw Error('Not enough explicit projection rolls');
      const choices=[];if(limit>0)choices.push({roll:1,probability:limit/100});if(limit<100)choices.push({roll:limit+1,probability:(100-limit)/100});
      throw {projectionBranch:true,choices};
    }};
    b.hit=function(u,t,ch,bonus=0){
      const previous=rollLimit;
      // These overrides still consume the real hit call and accuracy counters,
      // but the underlying d100 result cannot change the public outcome.
      rollLimit=(ch!=='精神'&&this.value(t,'phantomSwapReady')&&!this.value(t,'control'))||this.value(u,'bloodFirstStrike')?100:threshold(this.hitChance(u,t,ch,bonus)*100);
      try{return base.hit.call(this,u,t,ch,bonus);}finally{rollLimit=previous;}
    };
    b.tryControl=function(u,t,s,duration){
      const previous=rollLimit;
      rollLimit=threshold(s?.controlChance===undefined?this.controlNumbers(u,t,s).chance:s.controlChance);
      try{return base.tryControl.call(this,u,t,s,duration);}finally{rollLimit=previous;}
    };
    b.plan=function(u,cast,pre){
      const previous=context;context={u,t:this.unit(cast.target),s:cast.skill,pre};let plan;
      try{plan=base.plan.call(this,u,cast,pre);}finally{context=previous;}
      if(plansAt!==this.now){plans=[];queue=null;healQueue=null;plansAt=this.now;}
      plans.push(plan);
      if(cast===marker){candidate=plan;capture.resourcesBefore=totals(plan.t);}
      const original=plan.effects||[];
      plan.effects=original.map(effect=>()=>{
        const prior=context;context={u,t:plan.t,s:cast.skill,pre};
        const before=cast===marker?totals(plan.t):null,own=cast===marker?totals(u):null;
        if(cast===marker&&!capture.beforeEffects){capture.beforeEffects=Object.fromEntries(this.units.map(x=>[x.id,copy(x.dots)]));capture.beforeDotBoost=Object.fromEntries(this.units.map(x=>[x.id,copy(x.statuses.filter(s=>s.type==='dotBoost'))]));}
        try{effect();}finally{context=prior;}
        b.refreshDotDamage();
        if(cast===marker){add(capture.immediate,difference(before,totals(plan.t)));add(capture.actorEffects,difference(own,totals(u)));capture.afterEffects=Object.fromEntries(this.units.map(x=>[x.id,copy(x.dots)]));capture.afterDotBoost=Object.fromEntries(this.units.map(x=>[x.id,copy(x.statuses.filter(s=>s.type==='dotBoost'))]));}
      });
      return plan;
    };
    b.applyDamage=function(t,amount,ch,from,fx){
      let entry=null;
      if(plansAt===this.now){
        if(!queue)queue=[...plans.filter(x=>x.damage&&x.t).map(x=>({plan:x,amount:x.damage,ch:x.channel})),...plans.flatMap(x=>(x.extraDamage||[]).filter(d=>x.t).map(d=>({plan:x,amount:d.amount,ch:d.channel})))];
        const next=queue[0];
        if(next&&next.plan.t===t&&next.plan.u===from&&next.amount===amount&&next.ch===ch)entry=queue.shift();
      }
      const before=totals(t),alive=this.alive(t);
      let nominal=amount;const reduction=from?this.value(from,'damageDown'):0;if(reduction&&amount>0)nominal=Math.max(1,Math.round(amount*(1-reduction)));
      damageDepth++;try{base.applyDamage.call(this,t,amount,ch,from,fx);}finally{damageDepth--;}
      if(entry?.plan===candidate){const loss=difference(before,totals(t));add(capture.immediate,loss);capture.packets.push({channel:ch,raw:amount,damage:nominal,...loss,knockout:alive&&!this.alive(t)});}
    };
    b.heal=function(t,amount,ch){
      let owner=null;
      if(!damageDepth&&plansAt===this.now){if(!healQueue)healQueue=plans.filter(p=>p.heal&&p.t);const next=healQueue[0];if(next?.t===t&&next.heal===amount&&next.channel===ch)owner=healQueue.shift();}
      const before=totals(t);base.heal.call(this,t,amount,ch);if(owner===candidate)add(capture.immediate,difference(before,totals(t)));
    };
    let u=b.unit(actorId),t=b.unit(targetId),s=typeof action==='object'?action:u.skills.find(x=>x.id===action)||null;
    if(options.advanceOnly){
      b.tick(Math.min(180000,origin+Math.round(Math.max(0,Number(options.at)||0)*1000)),true);
      return finish({state:b,actor:u,target:t,immediate:empty(),actorEffects:empty(),packets:[],futureDOT:{events:[],damage:0},hit:true,success:true,resolved:true,cost:0,cast:0,knockout:false,rollsUsed:rolls,completionTime:b.now});
    }
    const actionId=typeof action==='object'?action.id:action||'attack';
    let cost=0,castSeconds=0,reason='';
    if(options.paid){
      if(!u.cast||u.cast.target!==targetId||u.cast.action!==actionId)return {invalid:'No matching paid cast'};
      marker=u.cast;castSeconds=Math.max(0,(marker.end-b.now)/1000);s=marker.skill;
    }else{
      const at=Math.max(0,Number(options.at)||0);
      if(at)b.tick(Math.min(180000,origin+Math.round(at*1000)),true);
      if(b.result||!b.alive(u)||!b.alive(t))return {invalid:'Battle or participant finished before action'};
      if(u.cast)return {invalid:'Actor still casting at requested start'};
      // The caller supplies an action opportunity, never a future hidden choice.
      b.activeId=u.id;u.progress=1;u.readyAt=Math.min(u.readyAt,b.now);
      if(options.defense){const d=options.defense;const type=d.type==='MDEF'?'mindDown':'defDown';t.statuses=t.statuses.filter(x=>x.type!==type);b.setStatus(t,type,d.value,180.001,{source:'projection-defense'});}
      reason=b.actionReason(u,actionId);
      if(reason)return {invalid:reason};
      if(!b.targetOptions(u,actionId).some(x=>x.id===targetId))return {invalid:'Illegal target'};
      const mp=u.mp;
      reason=b.command(u.id,actionId,targetId);if(reason)return {invalid:reason};
      cost=mp-u.mp;marker=u.cast;
      if(marker)castSeconds=(marker.end-b.now)/1000;
      else return finish({state:b,actor:u,target:t,immediate:empty(),actorEffects:empty(),packets:[],futureDOT:{events:[],damage:0},hit:true,success:true,resolved:true,cost,cast:0,knockout:false,rollsUsed:rolls});
    }
    const end=marker.end;b.tick(end,true);
    const hit=candidate?.hit?!!candidate.hit.success:!!candidate;
    const events=capture.beforeEffects?changedDots(b,capture.beforeEffects,capture.afterEffects):[];
    const statusEvents=b.events.filter(e=>e.time===end&&e.actor===u.id&&e.target===t.id&&['status','control','resist'].includes(e.type));
    const resisted=statusEvents.some(e=>e.type==='resist');
    const controlApplied=statusEvents.some(e=>e.type==='control');
    const success=s?.category==='控制'?controlApplied:!resisted&&hit;
    return finish({state:b,actor:u,target:t,immediate:capture.immediate,actorEffects:capture.actorEffects,packets:capture.packets,
      futureDOT:{events,damage:events.reduce((n,e)=>n+e.damage*e.weight,0),beforeDots:capture.beforeEffects,afterDots:capture.afterEffects,beforeDotBoost:capture.beforeDotBoost,afterDotBoost:capture.afterDotBoost},hit,success,resolved:!!candidate,cost,cast:castSeconds,
      knockout:capture.packets.some(x=>x.knockout)&&!b.alive(t),rollsUsed:rolls,completionTime:end});
  }

  const forecastAction=function(u,t,action='attack',options={}){
    if(!u||!t)throw Error('forecastAction requires actor and target');
    if(action===null)action='attack';
    let s=typeof action==='object'?action:u.skills.find(x=>x.id===action)||null;
    const ch=channel(u,s),queue=[{rolls:options.rolls||[],probability:1}],branches=[];
    while(queue.length){
      const task=queue.pop();
      try{const branch=run(this,u.id,t.id,action,options,task.rolls,!!options.rolls);branches.push({...branch,probability:task.probability});}
      catch(error){if(!error?.projectionBranch)throw error;for(const choice of error.choices)queue.push({rolls:[...task.rolls,choice.roll],probability:task.probability*choice.probability});}
      if(queue.length+branches.length>4096)throw Error('Projection exceeded 4096 exact public branches');
    }
    const immediate=empty(),conditional=empty(),actorEffects=empty();let hitProbability=0,successProbability=0,knockoutProbability=0,cost=0,cast=0,damage=0;
    const futureDOT={damage:0,hp:0,sh:0,events:[]};
    for(const br of branches){
      if(br.invalid)continue;
      const w=br.probability;add(immediate,br.immediate,w);add(actorEffects,br.actorEffects,w);
      if(br.hit){hitProbability+=w;add(conditional,br.immediate,w);}
      if(br.success)successProbability+=w;if(br.knockout)knockoutProbability+=w;
      cost+=br.cost*w;cast+=br.cast*w;damage+=br.packets.reduce((n,x)=>n+x.damage,0)*w;
      futureDOT.damage+=br.futureDOT.damage*w;
      for(const e of br.futureDOT.events){futureDOT.events.push({...e,probability:w});futureDOT[e.channel==='精神'?'sh':'hp']+=e.damage*e.weight*w;}
    }
    if(hitProbability)for(const k of fields)conditional[k]=Math.round(conditional[k]/hitProbability*1e10)/1e10;
    immediate.knockoutProbability=knockoutProbability;
    return {s,ch,dot:periodic(s),valid:branches.some(x=>!x.invalid),invalidReasons:[...new Set(branches.filter(x=>x.invalid).map(x=>x.invalid))],
      cost,cast,at:Math.max(0,Number(options.at)||0),hitProbability,successProbability,knockoutProbability,
      immediate,conditional,actorEffects,futureDOT,branches,damage,
      // Future DOT is deliberately excluded from immediate health and knockout.
      health:immediate[ch==='精神'?'sh':'hp'],hit:hitProbability};
  };
  const aiStrike=function(u,t,s,at=0,defense=null){
    const paid=!!u.cast&&u.cast.target===t.id&&u.cast.action===(s?.id||'attack')&&Math.abs(at-(u.cast.end-this.now)/1000)<.001;
    const result=this.forecastAction(u,t,s||'attack',{at:paid?0:at,defense,paid});
    return {...result,damage:result.damage+result.futureDOT.damage,instantDamage:result.damage,s,at};
  };
  const forecastAdvance=function(at=0,options={}){const u=this.units[0];return this.forecastAction(u,u,'wait',{...options,at,advanceOnly:true});};
  function dotTimeline(branch,before,options){
    const b=branch.state.forkProjectionState(),events=[];
    if(b.result)return events;
    if(before){
      for(const u of b.units){
        // Reverse this candidate's edits only. Other plans in the same release
        // batch may have added their own DOT or amplifier after this candidate.
        const oldDots=branch.futureDOT.beforeDots?.[u.id]||[],nextDots=branch.futureDOT.afterDots?.[u.id]||[];
        const keys=new Set([...oldDots,...nextDots].map(d=>d.key)),changed=new Set();
        for(const key of keys){const old=oldDots.find(d=>d.key===key),next=nextDots.find(d=>d.key===key);if(JSON.stringify(old)!==JSON.stringify(next))changed.add(key);}
        u.dots=u.dots.filter(d=>!changed.has(d.key));
        for(let i=0;i<oldDots.length;i++)if(changed.has(oldDots[i].key)){
          const following=oldDots.slice(i+1).find(d=>u.dots.some(x=>x.key===d.key));
          const previous=oldDots.slice(0,i).reverse().find(d=>u.dots.some(x=>x.key===d.key));
          const index=following?u.dots.findIndex(d=>d.key===following.key):previous?u.dots.findIndex(d=>d.key===previous.key)+1:0;
          u.dots.splice(index,0,copy(oldDots[i]));
        }
        const oldBoost=branch.futureDOT.beforeDotBoost?.[u.id]||[],nextBoost=branch.futureDOT.afterDotBoost?.[u.id]||[];
        const sources=new Set([...oldBoost,...nextBoost].map(s=>s.source));
        for(const source of sources){const old=oldBoost.find(s=>s.source===source),next=nextBoost.find(s=>s.source===source);if(JSON.stringify(old)===JSON.stringify(next))continue;u.statuses=u.statuses.filter(s=>s.type!=='dotBoost'||s.source!==source);if(old)u.statuses.push(copy(old));}
      }
    }
    // This continuation deliberately contains only registered DOT and expiry.
    // New choices and already-casting attacks are outside this bounded heuristic.
    for(const u of b.units)u.cast=null;
    b.activeId=null;
    const last=Math.max(b.now,...b.units.flatMap(u=>u.dots.map(d=>d.next+Math.max(0,d.ticks-1)*3000)));
    const until=Math.min(180000,last,options.until??Infinity,b.now+Math.max(0,options.horizon??18)*1000);
    let safety=0;
    while(!b.result&&b.now<until&&safety++<2000){
      const times=[until];
      for(const u of b.units){for(const s of u.statuses)if(s.until>b.now)times.push(s.until);for(const d of u.dots)if(d.ticks>0&&d.next>b.now)times.push(d.next);if(u.shieldUntil>b.now)times.push(u.shieldUntil);}
      b.now=Math.min(...times);
      for(const u of b.units){
        for(const s of u.statuses)if(s.until<=b.now&&s.fatigue)b.setStatus(u,'fatigue',s.fatigueValue??.1,s.fatigueSeconds??6,{source:s.source,label:(s.label||'强化')+'后疲劳',from:s.from});
        u.statuses=u.statuses.filter(s=>s.until>b.now);b.expireShields?.(u);
        for(const d of u.dots)d.damage=b.dotDamage(d);
        for(const d of u.dots)if(d.next<=b.now&&d.ticks>0){
          const old=totals(u);b.applyDotDamage(u,d);events.push({time:b.now,targetId:u.id,channel:d.channel,sourceId:d.source,...difference(old,totals(u))});d.ticks--;d.next+=3000;
        }
        u.dots=u.dots.filter(d=>d.ticks>0);
      }
      b.checkResult();
    }
    return events;
  }
  const forecastFutureDOT=function(forecast,options={}){
    const aggregate=empty(),byTarget={},eventMap=new Map();
    for(const branch of forecast.branches||[]){
      if(branch.invalid||!branch.state||!branch.futureDOT?.events?.length)continue;
      for(const before of [false,true])for(const e of dotTimeline(branch,before,options)){
        const weight=(before?-1:1)*branch.probability,key=e.time+'|'+e.targetId;
        if(!byTarget[e.targetId])byTarget[e.targetId]=empty();
        add(aggregate,e,weight);add(byTarget[e.targetId],e,weight);
        if(!eventMap.has(key))eventMap.set(key,{time:e.time,targetId:e.targetId,...empty()});add(eventMap.get(key),e,weight);
      }
    }
    return {...aggregate,byTarget,events:[...eventMap.values()].sort((a,b)=>a.time-b.time||a.targetId.localeCompare(b.targetId)),futureOnly:true,assumption:'Registered DOT and expiry only; no future attacks or new actions'};
  };
  const forecastExistingDOT=function(options={}){
    const aggregate=empty(),byTarget={},events=dotTimeline({state:this},false,options);
    for(const event of events){if(!byTarget[event.targetId])byTarget[event.targetId]=empty();add(aggregate,event);add(byTarget[event.targetId],event);}
    return {...aggregate,byTarget,events,futureOnly:true,assumption:'Registered DOT and expiry only; no future attacks or new actions'};
  };
  const forecastDamage=function(u,t,s){const out=this.forecastAction(u,t,s||'attack');return out.damage+out.futureDOT.damage;};
  root.WitnessProjectionV14={version:14,exactPublicBranches:true,preservedRules:['iceArmorSnapshot','swapV13','bloodDomainV13','manaDrainOnHit']};
return {methods:{forkProjectionState,forecastAction,aiStrike,forecastAdvance,forecastFutureDOT,forecastExistingDOT,forecastDamage}};
})(globalThis);

const UnifiedDecision=(function(root){
  'use strict';
  const B=root.WitnessBattle;
  const periodic=s=>!!s&&(s.category==='持续伤害'||s.damageMode==='periodic');
  const offensive=s=>!s||s.category==='攻击'||s.category==='持续伤害'||periodic(s);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const actionId=s=>s?.id||'attack';
  const maximum=(u,ch)=>Math.max(1,u.model.derived[ch==='精神'?'SH':'HP']);
  const probabilityBranches=f=>(f.branches||[]).filter(b=>!b.invalid&&b.state&&b.probability>0);
  const mainBranch=f=>probabilityBranches(f).sort((a,b)=>b.probability-a.probability)[0];
  const statusSignature=u=>JSON.stringify([u.statuses,u.shieldLayers,u.shieldHP,u.shieldSH,u.guard,u.oneHit,u.immuneUntil,u.phantoms,u.phantomSwapped,u.petAlive,u.rage,u.rageTotal,u.mp,u.bonusAttack,u.guildmaster,u.modern,u.passive,u.scarred]);
  function directionSignature(b,u,offense){
    const e=b.effective(u),excluded=offense?new Set(['evasion','iceArmor','soulArmor','phantomSwapReady','statUpD','statDownD']):new Set(['coldAura','dotBoost','damageDown','accuracyDown','phantomPierce','bloodFirstStrike','buff','slow','costUp','statUpB','statDownB','statUpS','statDownS','statUpC','statDownC']);
    const statuses=u.statuses.filter(s=>!excluded.has(s.type));
    return JSON.stringify(offense?[e.PA,e.SA,e.MA,e.A,e.C,e.P,e.costReduction,e.castReduction,statuses,u.mp,u.rage,u.rageTotal,u.bonusAttack,u.cast,u.petAlive,u.passive,u.scarred]:[e.DEF,e.MDEF,e.A,e.P,statuses,u.hp,u.sh,u.mp,u.shieldLayers,u.shieldHP,u.shieldSH,u.guard,u.oneHit,u.immuneUntil,u.phantoms,u.phantomSwapped,u.petAlive,u.petHP,u.bodyHP,u.passive,u.scarred]);
  }
  function nextOpportunity(b,u,forceNext=false){
    const rate=Math.max(.06,b.actionRate(u)),recovery=Math.max(0,(u.readyAt-b.now)/1000);
    const control=Math.max(0,...b.status(u,'control').map(s=>(s.until-b.now)/1000));
    if(u.bonusAttack)return Math.max(recovery,control);
    if(u.cast)return Math.max(0,(u.cast.end-b.now)/1000)+.3+1/rate;
    if(forceNext)return Math.max(recovery,control)+1/rate;
    if(u.id===b.activeId&&!control&&recovery===0)return 0;
    return Math.max(recovery,control)+Math.max(0,1-u.progress)/rate;
  }
  function futureLegal(b,u,t,s,at){
    if(!b.alive(u)||!b.alive(t))return false;
    if(u.bonusAttack&&s)return false;
    if(!s)return u.mp>=b.basicCost(u);
    if(s.aiDisabled||u.release==='召唤'&&!u.petAlive||b.cost(u,s)>u.mp)return false;
    if(b.cooldownUntil(u,s)>b.now+at*1000)return false;
    if(s.maxUses&&(u.uses[s.id]||0)>=s.maxUses||s.rageSpend&&u.rage<1)return false;
    if(s.detonate&&!t.dots.some(d=>d.source===u.id&&d.ticks>0))return false;
    if(periodic(s)&&t.dots.some(d=>d.key===u.id+'-'+s.id&&d.next+(d.ticks-1)*3000>b.now+at*1000))return false;
    return b.targetOptions(u,s.id).some(v=>v.id===t.id);
  }
  function rawPriority(b,u,s){
    const a=b.effective(u),ch=s?.channel||u.soul.basicChannel||(u.soul.spirit_specialist?'精神':'物理');
    const power=(s?.mindPower||!s&&u.soul.basicMindPower)?a.MA:ch==='精神'?a.MA:ch==='物理'?a.PA:a.SA+(s?.poisonScaling||0)*a.MA;
    const damage=s?(periodic(s)?1.4:1.2)*s.Q*power*((s.factor??1)+(s.secondaryFactor||0)):.45*power;
    const cost=s?b.cost(u,s):b.basicCost(u),cast=s?b.castTime(u,s)*(s.castMultiplier||1):1.5;
    return damage/Math.pow(Math.max(1,cost),.25)/(cast+.3+1/b.actionRate(u));
  }
  function ctxFor(b,u){return {root:b,actor:u,cache:new WeakMap(),dots:new WeakMap(),advance:new Map(),potential:new WeakMap(),lives:new Map(),forecastCalls:0,horizon:Math.min(18,Math.max(0,(180000-b.now)/1000))};}
  function cachedForecast(ctx,b,u,t,action,options={}){
    let cache=ctx.cache.get(b);if(!cache){cache=new Map();ctx.cache.set(b,cache);}
    const key=[u.id,t.id,typeof action==='object'?action.id:action,Math.round((options.at||0)*1000),!!options.paid].join('|');
    if(!cache.has(key)){ctx.forecastCalls++;cache.set(key,b.forecastAction(u,t,action,options));}
    return cache.get(key);
  }
  function rawValue(f,t){
    const im=f.immediate||{};
    return 100*((im.hp||0)/maximum(t,'物理')+(im.sh||0)/maximum(t,'精神'))+8*(im.mp||0)/Math.max(1,t.model.derived.baseMP);
  }
  function dotValue(ctx,f,t,horizon,delay=0){
    let value=0;
    for(const event of protectedDOT(ctx,f).events||[]){
      if(event.targetId!==t.id)continue;
      const at=Math.max(0,(event.time-ctx.root.now)/1000),remaining=Math.max(0,horizon-delay);
      // A delayed event is never part of immediate knockout. Its value is limited
      // by the target's current estimated survival time and the public clock.
      if(at>ctx.horizon+.001)continue;
      const survival=at<=remaining?1:Math.max(0,1-(at-remaining)/3);
      value+=rawValue({immediate:event},t)*survival/(1+at/30);
    }
    return value;
  }
  function protectedDOT(ctx,f){
    if(!f.futureDOT?.events?.length)return {events:[],hp:0,sh:0};
    if(!ctx.dots.has(f))ctx.dots.set(f,ctx.root.forecastFutureDOT(f,{until:ctx.root.now+ctx.horizon*1000}));
    return ctx.dots.get(f);
  }
  function costPenalty(b,u,cost){
    const fraction=clamp(u.mp/Math.max(1,u.model.derived.MP),0,1),scarcity=1+1.5*(1-fraction)*(1-fraction);
    return cost/Math.max(1,u.model.derived.baseMP)*12*scarcity;
  }
  function bestOffense(ctx,b,u,t,at=0,horizon=18){
    const legal=[null,...u.skills.filter(offensive)].filter(s=>futureLegal(b,u,t,s,at));
    // All immediate candidates are scored exactly by aiCandidates. This small
    // shortlist is only the bounded continuation heuristic, never a legality gate.
    const ranked=legal.sort((a,z)=>rawPriority(b,u,z)-rawPriority(b,u,a));
    const options=ranked.slice(0,1);
    let best=null;
    for(const s of options){
      const f=cachedForecast(ctx,b,u,t,s||'attack',{at});if(!f.valid||at+f.cast>horizon+.001)continue;
      const gross=rawValue(f,t)+dotValue(ctx,f,t,horizon,at),utility=gross-costPenalty(b,u,f.cost)*.4;
      if(!best||utility>best.utility)best={forecast:f,gross,utility,skill:s};
    }
    return best;
  }
  function survivalHorizon(ctx,t){
    if(ctx.lives.has(t.id))return ctx.lives.get(t.id);
    const b=ctx.root,unit=b.unit(t.id)||t;
    let hpRate=0,shRate=0;
    for(const foe of b.units.filter(v=>v.team!==unit.team&&b.alive(v))){
      const at=nextOpportunity(b,foe),best=bestOffense(ctx,b,foe,unit,at,ctx.horizon);
      if(best){const f=best.forecast,dot=protectedDOT(ctx,f).byTarget?.[unit.id]||{},cycle=Math.max(1,f.cast+.3+1/b.actionRate(foe));hpRate+=((f.immediate.hp||0)+Math.max(0,dot.hp||0)*.65)/cycle;shRate+=((f.immediate.sh||0)+Math.max(0,dot.sh||0)*.65)/cycle;}
    }
    if(unit.dots.length){
      // Existing DOT is not raw damage either. Reuse the real protected DOT
      // clock for one tick window, without counting an unrelated paid cast.
      const window=Math.min(3,ctx.horizon);
      if(window>0){
        if(!ctx.existingDOT)ctx.existingDOT=b.forecastExistingDOT({horizon:window});
        const known=ctx.existingDOT.byTarget[unit.id]||{};
        hpRate+=Math.max(0,known.hp||0)/window;shRate+=Math.max(0,known.sh||0)/window;
      }
    }
    const life=Math.min(ctx.horizon,hpRate>0?unit.hp/hpRate:Infinity,shRate>0?unit.sh/shRate:Infinity);
    const result=clamp(Number.isFinite(life)?life:ctx.horizon,Math.min(2,ctx.horizon),ctx.horizon);ctx.lives.set(t.id,result);return result;
  }
  function pairPotential(ctx,b,actorId,targetId,horizon,forceNextId){
    let cache=ctx.potential.get(b);if(!cache){cache=new Map();ctx.potential.set(b,cache);}
    const key=[actorId,targetId,Math.round(horizon*10),forceNextId||''].join('|');if(cache.has(key))return cache.get(key);
    let state=b,u=state.unit(actorId),t=state.unit(targetId),value=0,elapsed=0;
    if(!u||!t||!state.alive(u)||!state.alive(t)){cache.set(key,0);return 0;}
    // A paid cast remains a threat even when its caster now has no mana.
    if(u.cast){
      if(u.cast.target===t.id&&(u.cast.action==='attack'||offensive(u.cast.skill))){
        const f=cachedForecast(ctx,state,u,t,u.cast.skill||u.cast.action,{paid:true});
        if(f.valid&&f.cast<=horizon){value+=rawValue(f,t)+dotValue(ctx,f,t,horizon);const branch=mainBranch(f);if(branch){elapsed+=f.cast;state=branch.state;u=state.unit(actorId);t=state.unit(targetId);}}
      }else {
        const duration=Math.max(0,(u.cast.end-state.now)/1000),advanced=mainBranch(state.forecastAdvance(duration));
        if(!advanced){cache.set(key,value);return value;}
        elapsed+=duration;state=advanced.state;u=state.unit(actorId);t=state.unit(targetId);
      }
    }
    let normalActions=0;
    for(let n=0;n<2&&normalActions<1&&elapsed<horizon;n++){
      if(!state.alive(u)||!state.alive(t))break;
      const isBonus=!!u.bonusAttack;
      const at=nextOpportunity(state,u,n===0&&u.id===forceNextId&&!u.bonusAttack);
      const best=bestOffense(ctx,state,u,t,at,horizon-elapsed);if(!best)break;
      const f=best.forecast;
      // Only one normal continuation: actual future legality includes resource,
      // cooldown, use and time limits. Do not turn this into a multi-turn tree.
      const manaSlots=f.cost>0?Math.floor(u.mp/f.cost):2;
      const useSlots=best.skill?.maxUses?best.skill.maxUses-(u.uses[best.skill.id]||0):2;
      // Current shields, one-hit guards and action-limited buffs may be consumed
      // by this action. Never multiply its protected outcome into a second hit.
      const slots=isBonus?1:Math.max(0,Math.min(1,manaSlots,useSlots));
      value+=best.gross*slots/(1+elapsed/30);
      const branch=mainBranch(f);if(!branch)break;
      elapsed+=at+f.cast;state=branch.state;u=state.unit(actorId);t=state.unit(targetId);
      if(!isBonus)normalActions++;
    }
    cache.set(key,value);return value;
  }
  function advanceBaseline(ctx,seconds){
    const key=Math.round(seconds*1000);if(!ctx.advance.has(key))ctx.advance.set(key,ctx.root.forecastAdvance(seconds));return ctx.advance.get(key);
  }
  function weakest(b,targets,actor){
    const mental=actor.soul.spirit_specialist;
    return targets.slice().sort((a,z)=>(mental?a.sh/maximum(a,'精神'):a.hp/maximum(a,'物理'))-(mental?z.sh/maximum(z,'精神'):z.hp/maximum(z,'物理'))||a.id.localeCompare(z.id))[0];
  }
  function effectPotential(ctx,forecast,u,t){
    const duration=forecast.cast||0;
    const baseline=mainBranch(advanceBaseline(ctx,duration));if(!baseline)return 0;
    // Compare effects after the same action opportunity and payment. Otherwise
    // the unused baseline cooldown falsely makes a new DOT look like lost damage.
    const representative=mainBranch(forecast),pre=baseline.state.forkProjectionState(),payer=pre.unit(u.id);
    if(payer&&representative){
      payer.mp=Math.max(0,payer.mp-forecast.cost);
      payer.cooldowns={...representative.actor.cooldowns};payer.uses={...representative.actor.uses};
      payer.manaGiftUses=representative.actor.manaGiftUses;payer.calmUses=representative.actor.calmUses;
      // End the same action without granting its effects or bonus attack.
      const selfBonus=ctx.root.resourceConfig.selfBuffBonus&&forecast.s?.category==='强化'&&t.id===u.id;
      pre.endTurn(payer,!selfBonus);payer.bonusAttack=false;
    }
    const allies=pre.units.filter(v=>v.team===u.team&&pre.alive(v)),foes=pre.units.filter(v=>v.team!==u.team&&pre.alive(v));
    const pairs=[];
    for(const a of allies){const target=t.team!==u.team?pre.unit(t.id):weakest(pre,foes,a);if(target)pairs.push({a:a.id,t:target.id,sign:1});}
    for(const foe of foes){
      const castTarget=foe.cast?pre.unit(foe.cast.target):null;
      const target=castTarget?.team===u.team?castTarget:t.team===u.team?pre.unit(t.id):weakest(pre,allies,foe);
      if(target)pairs.push({a:foe.id,t:target.id,sign:-1});
    }
    let result=0;
    for(const branch of probabilityBranches(forecast)){
      const post=branch.state,changed=new Set();
      for(const before of pre.units){const after=post.unit(before.id);if(after&&statusSignature(before)!==statusSignature(after))changed.add(before.id);}
      // Known casts/DOT may have been prevented or interrupted during this cast.
      // Attribute that difference once, excluding this action's own direct hit/heal.
      const healthValue=(loss,unit)=>100*((loss.hp||0)/maximum(unit,'物理')+(loss.sh||0)/maximum(unit,'精神'));
      let gain=0;
      for(const before of pre.units){const after=post.unit(before.id);if(after)gain+=(before.team===u.team?1:-1)*healthValue({hp:after.hp-before.hp,sh:after.sh-before.sh},before);}
      gain-=(t.team===u.team?-1:1)*healthValue(branch.immediate||{},t);
      if(t.id!==u.id)gain+=healthValue(branch.actorEffects||{},u);
      if(!changed.size){result+=branch.probability*gain;continue;}
      for(const pair of pairs){
        if(!changed.has(pair.a)&&!changed.has(pair.t))continue;
        // A purely offensive change does not change damage arriving at its
        // owner; a pure shield change does not change the owner's outgoing hit.
        // Unknown status types remain in both signatures conservatively.
        const beforeActor=pre.unit(pair.a),afterActor=post.unit(pair.a),beforeTarget=pre.unit(pair.t),afterTarget=post.unit(pair.t);
        if(!afterActor||!afterTarget)continue;
        if(directionSignature(pre,beforeActor,true)===directionSignature(post,afterActor,true)&&directionSignature(pre,beforeTarget,false)===directionSignature(post,afterTarget,false))continue;
        const target=pre.unit(pair.t);const horizon=Math.max(0,Math.min(ctx.horizon-duration,survivalHorizon(ctx,target)));
        if(horizon<.25)continue;
        const before=pairPotential(ctx,pre,pair.a,pair.t,horizon,u.id),after=pairPotential(ctx,post,pair.a,pair.t,horizon,u.id);
        gain+=(after-before)*pair.sign;
      }
      result+=branch.probability*gain;
    }
    return result;
  }
  function hasMechanics(s,action){if(s&&(s.attackSubtype==='pursuit'||s.modernEffect||s.preDR))return true;return !s?['defend','defendSH','dodge','calm','tune','phantomSwap','phantomSacrifice'].includes(action):!offensive(s)||!!(s.slow||s.corrode||s.costUp||s.controlOnHit||s.rageGain||s.rageSpend||s.detonate);}
  function scoreCandidate(ctx,u,t,action){
    const b=ctx.root,s=u.skills.find(v=>v.id===action)||null,f=cachedForecast(ctx,b,u,t,s||action);
    if(!f.valid)return null;
    const friendly=t.team===u.team;
    let immediate=(friendly?-1:1)*rawValue(f,t);
    // Returned actorEffects excludes the paid casting cost. Count restoration to
    // the caster once (the target already contains it for self-targeted actions).
    if(t.id!==u.id)immediate-=rawValue({immediate:f.actorEffects||{}},u);
    // Effects may change existing DOT on a different unit (for example a
    // self-targeted poison amplifier), so evaluate every affected target.
    let future=0;
    for(const id of new Set((f.futureDOT?.events||[]).map(event=>event.targetId))){
      const affected=b.unit(id);if(affected)future+=(affected.team===u.team?-1:1)*dotValue(ctx,f,affected,survivalHorizon(ctx,affected));
    }
    const knockout=friendly?0:45*(f.immediate.knockoutProbability||0);
    let effects=hasMechanics(s,action)?effectPotential(ctx,f,u,t):0;
    if(!Number.isFinite(effects))effects=0;
    // effectPotential already follows the real bonusAttack state and its paid
    // basic attack. Do not award that same opportunity a second time here.
    const bonus=0;
    // Phantom sacrifice creates a real new buff; it no longer pre-empts all other
    // actions just because the fight is early. Swap is valued by the same threat window.
    // Breaking a shield only matters if a following affordable attack can arrive
    // before it expires. Cap credit by actual packets, not a one-hit layer's size.
    let shieldPressure=0;
    if(!friendly&&u.mp-f.cost>=b.basicCost(u)){
      const until=Math.max(t.shieldUntil||0,...(t.shieldLayers||[]).map(layer=>layer.until||0));
      if(until>b.now+(f.cast+.3+1/b.actionRate(u))*1000){
        const raw=probabilityBranches(f).reduce((n,br)=>n+br.probability*(br.packets||[]).reduce((v,packet)=>v+(packet.raw||0),0),0);
        shieldPressure=.2*100*(Math.min(Math.max(0,f.immediate.shieldHP||0),raw)/maximum(t,'物理')+Math.min(Math.max(0,f.immediate.shieldSH||0),raw)/maximum(t,'精神'));
      }
    }
    const cost=costPenalty(b,u,f.cost),score=immediate+future+knockout+effects+bonus+shieldPressure-cost;
    if(!(action==='attack'||s&&offensive(s))&&immediate+future+effects+bonus<=.0001)return null;
    return {action,target:t.id,score,detail:{immediate,futureDOT:future,knockout,effects,bonus,shieldPressure,cost,paidMP:f.cost,hitProbability:f.hitProbability,successProbability:f.successProbability,category:periodic(s)?'持续伤害':s?.category||action}};
  }
  const aiCandidates=function(u){
    if(!u||!this.alive(u))return [];
    const ctx=ctxFor(this,u),candidates=[];
    const actions=u.bonusAttack?['attack']:['attack',...u.skills.filter(s=>!s.aiDisabled).map(s=>s.id),'defend','defendSH','dodge','calm','tune','phantomSwap','phantomSacrifice'];
    for(const action of [...new Set(actions)]){
      if(this.actionReason(u,action))continue;
      const skill=u.skills.find(s=>s.id===action);if(skill?.aiDisabled)continue;
      for(const target of this.targetOptions(u,action)){
        if(skill?.detonate&&!target.dots.some(d=>d.source===u.id))continue;
        if(periodic(skill)&&target.dots.some(d=>d.key===u.id+'-'+skill.id&&d.next+(d.ticks-1)*3000>this.now+this.castTime(u,skill)*(skill.castMultiplier||1)*1000))continue;
        const candidate=scoreCandidate(ctx,u,target,action);if(candidate)candidates.push(candidate);
      }
    }
    candidates.sort((a,b)=>b.score-a.score||a.action.localeCompare(b.action)||a.target.localeCompare(b.target));
    this._lastAIv14={actor:u.id,forecasts:ctx.forecastCalls,candidates:candidates.map(c=>({...c,detail:{...c.detail}}))};
    return candidates;
  };
  const aiChoice=function(u){
    const candidates=this.aiCandidates(u),best=candidates[0];
    if(best)return {action:best.action,target:best.target,score:best.score};
    return u?.bonusAttack?{action:'skipBonus',target:u.id}:{action:'wait',target:u?.id};
  };
  const aiScore=function(u,t,action){
    const s=u?.skills.find(v=>v.id===action);
    if(!u||!t||s?.aiDisabled||this.actionReason(u,action)||!this.targetOptions(u,action).some(v=>v.id===t.id))return null;
    return scoreCandidate(ctxFor(this,u),u,t,action);
  };
  // Compatibility entry points use the same explicit legality and cost logic.
  // In particular, normalized periodic attacks reach the periodic scorer first.
  const darkActionScore=function(u,t,action,oldScore){
    const s=u.skills.find(v=>v.id===action);if(s?.aiDisabled)return -Infinity;
    if(u.templateId!=='anmu')return oldScore;
    if(periodic(s))return this.aiScore(u,t,action)?.score??-Infinity;
    return oldScore;
  };
  const compactActionScore=function(u,t,action){return this.aiScore(u,t,action)?.score??-Infinity;};
  const scoreControlVariant=function(u,t,s){return this.aiScore(u,t,s.id)?.score??-Infinity;};
  const compactEnabled=function(){return true;};
  root.WitnessAIV14={version:14,unifiedCandidates:true,usesProjection:true,policy:'bounded-public-state-utility',notes:'Exact immediate public branches; bounded, resource-aware continuation heuristic. No future RNG is read.'};
return {methods:{aiCandidates,aiChoice,aiScore,darkActionScore,compactActionScore,scoreControlVariant,compactEnabled}};
})(globalThis);

(function(root){
const factories={"/modules/src/battle/equipment.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 装备来源效果（交接文档第十一、十六节）。
 *
 * 魂骨属性与特性是“装备来源”，不是第二套基础数值：
 *   - 基础面板始终来自人物面板；
 *   - 魂骨属性只作为来源修正叠加一次；
 *   - 特性只注册到同一个运行时来源表，按魂骨实例去重；
 *   - 不写回成长账本，不重复加算。
 */

const { clone, isPlainObject } = require('../util');
const { attributeTotals, validateLedger } = require('../soulbone/absorption');

const STAT_KEYS = Object.freeze(['B', 'S', 'C', 'D', 'A', 'P', 'W']);

/**
 * @param {object} baseModel 人物面板现算模型（含 stats/derived）
 * @param {object} modifiers {attributes, traits, sources}
 * @param {object} options {derive} 战斗侧 derive 函数；有属性修正时必需
 */
function buildEffectivePanel(baseModel, modifiers, options = {}) {
  if (!isPlainObject(baseModel) || !isPlainObject(baseModel.stats)) throw new Error('有效面板须基于人物实际面板');
  const attributes = (modifiers && modifiers.attributes) || {};
  const sources = (modifiers && modifiers.sources) || [];
  const traits = (modifiers && modifiers.traits) || [];
  const stats = clone(baseModel.stats);
  const applied = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!STAT_KEYS.includes(key)) throw new Error('装备属性含未知维度：' + key);
    if (!Number.isFinite(value)) throw new Error('装备属性数值无效：' + key);
    stats[key] = (stats[key] || 0) + value;
    applied[key] = value;
  }
  let derived = clone(baseModel.derived || null);
  if (Object.keys(applied).length) {
    if (typeof options.derive !== 'function') throw new Error('有魂骨属性修正时必须调用战斗侧 derive 重算派生值，禁止另写一套数值');
    derived = options.derive(stats);
  }
  return {
    version: 1,
    model: { ...clone(baseModel), stats, derived },
    base: { stats: clone(baseModel.stats), derived: clone(baseModel.derived || null) },
    appliedAttributes: applied,
    traitSources: traits.map((trait) => ({ id: trait.traitId, boneId: trait.ownerBoneId || trait.sourceBoneId || null })),
    sources: sources.slice(),
    growthTouched: false
  };
}

/** 直接从事装备来源账本构建，避免调用方漏传属性或重复叠加。 */
function effectivePanelFromLedger(baseModel, ledger, options = {}) {
  validateLedger(ledger);
  return buildEffectivePanel(baseModel, {
    attributes: attributeTotals(ledger),
    traits: Object.values(ledger.runtimeTraits),
    sources: Object.keys(ledger.absorbedBones)
  }, options);
}

/** 同一特性只能注册一次；每块骨的属性来源也只能有一个条目。 */
function assertSingleRegistration(ledger) {
  validateLedger(ledger);
  const keys = Object.keys(ledger.runtimeTraits);
  if (new Set(keys).size !== keys.length) throw new Error('同一特性被重复注册');
  const bones = Object.keys(ledger.absorbedBones);
  if (new Set(bones).size !== bones.length) throw new Error('同一魂骨被重复吸收');
  for (const [boneId, entry] of Object.entries(ledger.attributes)) {
    if (!ledger.absorbedBones[boneId]) throw new Error('属性来源没有对应已吸收魂骨：' + boneId);
    if (typeof entry.budgetVersion !== 'number' || entry.budgetVersion < 1) throw new Error('属性来源缺少已定版预算：' + boneId);
  }
  return { traits: keys.length, bones: bones.length, attributeSources: Object.keys(ledger.attributes).length };
}

/** 校验每块骨的特性都有已实现的处理器；缺一个就显式报告，不假装生效。 */
function assertTraitHandlers(ledger, registry) {
  validateLedger(ledger);
  if (!registry || typeof registry.has !== 'function') throw new Error('须提供魂骨特性处理器登记表');
  const missing = [];
  for (const trait of Object.values(ledger.runtimeTraits)) {
    if (!registry.has(trait.handler)) missing.push({ traitId: trait.traitId, boneId: trait.ownerBoneId, handler: trait.handler });
  }
  return { ok: missing.length === 0, missing };
}

/**
 * 来源分离：魂骨特性必须绑定魂骨实例，不得用武魂ID作为唯一绑定键；
 * 角色固有特性不在本账本内，由角色自己的来源字段负责，二者不混用。
 */
function assertSourceSeparation(ledger) {
  validateLedger(ledger);
  const traits = Object.values(ledger.runtimeTraits);
  for (const trait of traits) {
    if (trait.source !== 'soulbone') throw new Error('运行时特性来源不是魂骨：' + trait.traitId);
    if (!trait.ownerBoneId) throw new Error('魂骨特性缺少所属魂骨实例ID：' + trait.traitId);
    if (trait.soulId !== undefined) throw new Error('魂骨特性不得以武魂ID作为绑定键：' + trait.traitId);
    if (!ledger.absorbedBones[trait.ownerBoneId]) throw new Error('魂骨特性指向未吸收的魂骨：' + trait.ownerBoneId);
  }
  return { traits: traits.length, bones: Object.keys(ledger.absorbedBones).length, innateTraitsOutsideLedger: true };
}

module.exports = { STAT_KEYS, buildEffectivePanel, effectivePanelFromLedger, assertSingleRegistration, assertTraitHandlers, assertSourceSeparation };

},"/modules/src/battle/hooks.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 通用战斗事件钩子（交接文档第十八、十九节）。
 *
 * 魂骨效果与友方NPC、会长、神秘伤疤女共用同一组可靠事件：
 * 受伤、护盾、控制、回魂、行动起止，以及战斗开始/结束。
 * 不另造一套“回合”计数：个人回合由显式行动机会开始与结束，附赠普攻、
 * 连击分段、持续伤害跳数都不额外计回合。
 */

const { VERSIONS } = require('../versions');

const EVENTS = Object.freeze([
  'battle-start',
  'turn-start',
  'turn-end',
  'damage-dealt',
  'damage-taken',
  'shield-gained',
  'shield-broken',
  'control-start',
  'control-end',
  'heal',
  'mp-restore',
  'defeat',
  'battle-end'
]);

const TURN_KINDS = Object.freeze({ normal: true, bonus: false, dot: false, segment: false, reaction: false });

function createHookRegistry() {
  const handlers = new Map();
  const order = [];

  function on(event, handler, meta = {}) {
    if (!EVENTS.includes(event)) throw new Error('未知战斗事件：' + event + '；不允许自造回合类事件');
    if (typeof handler !== 'function') throw new Error('事件处理器须为函数');
    const id = meta.id;
    if (typeof id !== 'string' || !id) throw new Error('事件处理器须有唯一ID');
    if (handlers.has(id)) throw new Error('事件处理器重复注册：' + id);
    handlers.set(id, { id, event, handler, owner: meta.owner || null, priority: meta.priority || 0, version: VERSIONS.battleHooks });
    order.push(id);
    return api;
  }

  function off(id) {
    handlers.delete(id);
    const index = order.indexOf(id);
    if (index >= 0) order.splice(index, 1);
  }

  function offOwner(owner) {
    for (const [id, entry] of [...handlers]) if (entry.owner === owner) off(id);
  }

  /** frame 由宿主提供，至少含 {logs:[], unit, ...}；处理器只读事件并写入 frame。 */
  function emit(event, frame) {
    if (!EVENTS.includes(event)) throw new Error('未知战斗事件：' + event);
    if (!frame || typeof frame !== 'object') throw new Error('事件帧无效');
    if (!Array.isArray(frame.logs)) frame.logs = [];
    const entries = order.map((id) => handlers.get(id)).filter((entry) => entry && entry.event === event).sort((a, b) => b.priority - a.priority);
    const results = [];
    for (const entry of entries) {
      const before = frame.logs.length;
      const output = entry.handler(frame, event);
      results.push({ id: entry.id, output: output === undefined ? null : output, logs: frame.logs.slice(before) });
    }
    return { frame, results, handlers: entries.map((entry) => entry.id) };
  }

  function list() {
    return order.map((id) => handlers.get(id)).filter(Boolean).map((entry) => ({ id: entry.id, event: entry.event, owner: entry.owner, priority: entry.priority }));
  }

  function countByEvent() {
    const counts = Object.fromEntries(EVENTS.map((event) => [event, 0]));
    for (const entry of handlers.values()) counts[entry.event]++;
    return counts;
  }

  const api = Object.freeze({ on, off, offOwner, emit, list, countByEvent, EVENTS });
  return api;
}

/**
 * 个人回合时钟。只有“获得一次正常行动机会”才 begin，
 * 只有正常行动完成才计一个有效回合；附赠普攻、持续伤害跳数、连击分段不计。
 * 被控制时暂停（不产生新回合，已有层数保留）。
 */
function createTurnClock() {
  const state = new Map(); // unitId -> {active, turns, controlled, wasControlled}

  function ensure(unitId) {
    if (typeof unitId !== 'string' || !unitId) throw new Error('回合时钟须绑定单位ID');
    if (!state.has(unitId)) state.set(unitId, { active: false, turns: 0, controlled: false, wasControlled: false, startedAt: null });
    return state.get(unitId);
  }

  function begin(unitId, meta = {}) {
    const entry = ensure(unitId);
    if (entry.active) throw new Error('同一单位不能同时开始两个个人回合');
    entry.active = true;
    entry.controlled = meta.controlled === true;
    entry.startedAt = meta.at === undefined ? null : meta.at;
    return { unitId, active: true, controlled: entry.controlled };
  }

  function complete(unitId, meta = {}) {
    const entry = ensure(unitId);
    if (!entry.active) throw new Error('个人回合尚未开始');
    const kind = meta.kind || 'normal';
    if (!(kind in TURN_KINDS)) throw new Error('未知行动类型：' + kind);
    entry.active = false;
    entry.wasControlled = entry.controlled;
    if (TURN_KINDS[kind] && !entry.controlled) entry.turns++;
    return { unitId, kind, counted: TURN_KINDS[kind] && !entry.controlled, turns: entry.turns };
  }

  function markControlled(unitId) {
    ensure(unitId).controlled = true;
  }

  function turnsOf(unitId) {
    return ensure(unitId).turns;
  }

  function snapshot() {
    return [...state.entries()].map(([unitId, entry]) => ({ unitId, ...entry }));
  }

  return Object.freeze({ begin, complete, markControlled, turnsOf, snapshot });
}

module.exports = { EVENTS, TURN_KINDS, createHookRegistry, createTurnClock };

},"/modules/src/battle/skill-attributes.js":function(require,module,exports,__dirname){
'use strict';

const { clone } = require('../util');

const NONE = new Set(['无', '无属性', '无属性武魂', 'none', 'neutral']);

/** 只读取武魂/魂兽的属性，不把空间等机制标签自动当成元素属性。 */
function attributeTags(source) {
  const soul = source && source.soul ? source.soul : source;
  if (!soul || typeof soul !== 'object') return ['无'];
  if (typeof soul.attribute_category === 'string' && NONE.has(soul.attribute_category.trim())) return ['无'];
  const raw = Array.isArray(soul.elements) && soul.elements.length ? soul.elements : [soul.attribute];
  const tags = raw.flatMap((value) => typeof value === 'string' ? value.replace(/^复合(?:属性)?[·：:]?/, '').split(/[／/、,，+＆&|\s]+/u) : [])
    .map((value) => value.trim()).filter((value) => value && !NONE.has(value));
  return [...new Set(tags)].length ? [...new Set(tags)] : ['无'];
}

/** 标签与伤害通道分开：物理/能量/精神仍用channel；复合属性不丢失。 */
function tagSkill(skill, source) {
  if (!skill || typeof skill !== 'object') throw new Error('魂技属性标签缺少技能');
  const tags = attributeTags(source);
  return { ...clone(skill), attribute: tags.join('／'), element: tags.join('／'), elements: tags.slice(), attributeTags: tags.slice(), attributeRulesVersion: 1 };
}

function tagUnitSkills(unit) {
  const next = clone(unit);
  next.skills = (next.skills || []).map((skill) => tagSkill(skill, next.soul || next));
  return next;
}

/** 旧档/武魂变化后的统一刷新入口。不触碰魂骨技与角色成长，不重抽技能。 */
function tagCharacterSkills(character, resolvedSoul = character && character.soul) {
  const next = clone(character);
  for (const ring of next.rings || []) ring.skills = (ring.skills || []).map((skill) => tagSkill(skill, resolvedSoul));
  for (const key of ['preStoredNinthRing', 'pendingNinthRing']) {
    if (next[key]) next[key].skills = (next[key].skills || []).map((skill) => tagSkill(skill, resolvedSoul));
  }
  if (Array.isArray(next.skills)) next.skills = next.skills.map((skill) => tagSkill(skill, resolvedSoul));
  return next;
}

module.exports = { attributeTags, tagSkill, tagUnitSkills, tagCharacterSkills };

},"/modules/src/beast/library.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 独立的十万年魂兽库（交接文档第八节）。
 *
 * 本包交付的是“封装规格 + 空库状态”，不编造第一个可领奖的十万年魂兽，
 * 也不拿考官或神秘伤疤女改名充当魂兽。用户补充正式目标后，把记录写进
 * data/beast/library.json 的 beasts 数组即可，接口不用改。
 *
 * 空库行为：不进入空战斗、不自动胜利、不产生占位奖励；
 * 任务停在“目标资料尚未开放”的待办状态，保留接受与援军结果，可返回普通流程。
 *
 * 对外职责分开：列出可用目标、按固定随机结果选取、返回只读定义、构建战斗实例、
 * 验证奖励来源。战斗实例与定义数据隔离，战斗受伤不会污染库原型。
 */

const fs = require('node:fs');
const path = require('node:path');
const { clone, deepFreeze, isPlainObject, requireInteger } = require('../util');
const { VERSIONS, PENDING } = require('../versions');
const { SLOTS } = require('../soulbone/instance');

const DATA_PATH = path.resolve(__dirname, '..', '..', 'data', 'beast', 'library.json');
const TEN_THOUSAND_YEARS = 100000;
const LIFE_TYPES = Object.freeze(['生活', '元素', '灵体', '构装', '亡灵', '无生命']);

function emptyLibrary() {
  return { schemaVersion: VERSIONS.beastLibrarySchema, libraryVersion: VERSIONS.beastSelection, note: '空库：等待用户补充正式十万年魂兽定义。', beasts: [] };
}

function loadLibrary(dataPath) {
  const target = dataPath || DATA_PATH;
  if (!fs.existsSync(target)) return emptyLibrary();
  const raw = JSON.parse(fs.readFileSync(target, 'utf8'));
  return raw;
}

function validateBeast(beast) {
  if (!isPlainObject(beast)) throw new Error('魂兽定义须为对象');
  if (typeof beast.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(beast.id)) throw new Error('魂兽稳定ID无效：' + beast.id);
  if (typeof beast.name !== 'string' || !beast.name) throw new Error(beast.id + ' 缺少名称');
  if (!Number.isInteger(beast.version) || beast.version < 1) throw new Error(beast.id + ' 缺少定义版本');
  if (beast.years !== TEN_THOUSAND_YEARS) throw new Error(beast.id + ' 年限须精确为100000，实际 ' + beast.years);
  if (typeof beast.available !== 'boolean') throw new Error(beast.id + ' 缺少可用标记');
  if (!Array.isArray(beast.battleTags) || !beast.battleTags.includes('hunt')) throw new Error(beast.id + ' 缺少讨伐参战标签');
  if (!LIFE_TYPES.includes(beast.lifeType)) throw new Error(beast.id + ' 的实体生命类型无效：' + beast.lifeType);
  if (!isPlainObject(beast.panel) && !isPlainObject(beast.build)) throw new Error(beast.id + ' 缺少实际战斗面板或构建参数');
  if (beast.panel) {
    requireInteger(beast.panel.level, beast.id + ' 魂力等级', 1, 99);
    if (!isPlainObject(beast.panel.stats)) throw new Error(beast.id + ' 面板缺少六维');
  }
  if (!Array.isArray(beast.skills) || beast.skills.length < 1) throw new Error(beast.id + ' 缺少魂技');
  if (!Array.isArray(beast.traits) || beast.traits.length < 2) throw new Error(beast.id + ' 至少需要两个不同特性');
  const traitIds = beast.traits.map((trait) => trait && trait.id);
  if (traitIds.some((id) => typeof id !== 'string' || !id)) throw new Error(beast.id + ' 的特性缺少稳定ID');
  if (new Set(traitIds).size !== traitIds.length) throw new Error(beast.id + ' 存在重复特性ID');
  for (const trait of beast.traits) {
    if (!trait.name || !trait.effect) throw new Error(beast.id + ' 的特性「' + trait.id + '」缺少名称或效果');
    if (!trait.inherit || typeof trait.inherit !== 'object') throw new Error(beast.id + ' 的特性「' + trait.id + '」缺少玩家魂骨继承版本');
    if (typeof trait.inherit.handler !== 'string' || !trait.inherit.handler || !Number.isInteger(trait.inherit.implementationVersion) || trait.inherit.implementationVersion < 1) throw new Error(beast.id + ' 的特性「' + trait.id + '」缺少有效继承处理器或版本');
  }
  if (!Number.isInteger(beast.traitInheritanceVersion) || beast.traitInheritanceVersion < 1) throw new Error(beast.id + ' 缺少特性继承版本');
  if (!isPlainObject(beast.ringReward) || beast.ringReward.years !== TEN_THOUSAND_YEARS) throw new Error(beast.id + ' 的魂环奖励不是十万年');
  if (!isPlainObject(beast.bone) || typeof beast.bone.slot !== 'string' || !beast.bone.slot) throw new Error(beast.id + ' 缺少魂骨部位规则');
  if (!SLOTS.includes(beast.bone.slot) && beast.bone.slot !== 'random') throw new Error(beast.id + ' 的魂骨部位无效');
  if (typeof beast.battleText !== 'string' || !beast.battleText) throw new Error(beast.id + ' 缺少战斗文本');
  if (typeof beast.defeatText !== 'string' || !beast.defeatText) throw new Error(beast.id + ' 缺少败北文本');
  if (typeof beast.exitRule !== 'string' || !beast.exitRule) throw new Error(beast.id + ' 缺少退场规则');
  return true;
}

function createBeastLibrary(options = {}) {
  const raw = options.data || loadLibrary(options.dataPath);
  if (!raw || raw.schemaVersion !== VERSIONS.beastLibrarySchema) {
    throw new Error('魂兽库版本不支持：' + (raw && raw.schemaVersion));
  }
  if (!Array.isArray(raw.beasts)) throw new Error('魂兽库 beasts 须为数组');
  const errors = [];
  const records = new Map();
  for (const beast of raw.beasts) {
    try {
      validateBeast(beast);
      if (records.has(beast.id)) throw new Error('魂兽ID重复：' + beast.id);
      records.set(beast.id, deepFreeze(clone(beast)));
    } catch (error) {
      errors.push(error.message);
    }
  }

  function list() {
    return [...records.values()].map((beast) => ({
      id: beast.id,
      name: beast.name,
      version: beast.version,
      years: beast.years,
      available: beast.available,
      lifeType: beast.lifeType,
      elements: clone(beast.elements || []),
      style: beast.style,
      rating: beast.panel && beast.panel.rating,
      traitIds: beast.traits.map((trait) => trait.id)
    }));
  }

  function available() {
    return [...records.values()].filter((beast) => beast.available === true);
  }

  function definition(id) {
    const beast = records.get(id);
    if (!beast) throw new Error('魂兽库中没有目标：' + id);
    return deepFreeze(clone(beast));
  }

  /**
   * “前进”时首次确定目标并立即保存。
   * frozen 已存在时沿用，不重抽；库为空时返回空库状态，不造假目标。
   */
  function pick(input = {}) {
    if (input.frozen) {
      // 已冻结目标带着定义快照；即使库后来改版或被清空，也沿用原目标与版本。
      const beast = input.frozen.snapshot
        ? deepFreeze(clone(input.frozen.snapshot))
        : definition(input.frozen.id);
      if (beast.id !== input.frozen.id || beast.version !== input.frozen.version) {
        throw new Error('已冻结目标的定义版本发生变化，不能重抽；须显式迁移');
      }
      return { empty: false, reused: true, target: { id: beast.id, version: beast.version, snapshot: beast }, roll: null };
    }
    const pool = available();
    if (!pool.length) {
      return { empty: true, reused: false, target: null, status: PENDING.EMPTY_BEAST_LIBRARY, reason: '目标资料尚未开放', poolSize: 0 };
    }
    const rng = input.rng;
    if (!rng) throw new Error('目标选取须使用游戏确定性投骰器');
    const draw = pool.length === 1 ? { face: 1, sides: 1 } : { face: rng.die(pool.length, '十万年魂兽目标抽取'), sides: pool.length };
    const beast = clone(pool[draw.face - 1]);
    return {
      empty: false,
      reused: false,
      target: { id: beast.id, version: beast.version, snapshot: deepFreeze(beast) },
      roll: { sides: draw.sides, face: draw.face, label: '十万年魂兽目标抽取', equalWeight: true, degenerate: draw.sides === 1 }
    };
  }

  /**
   * 构建战斗实例：从定义深拷贝并补齐运行时资源，与原型隔离。
   * 实际行动条/伤害结算仍交给主游戏战斗代码。
   */
  function buildInstance(input) {
    const beast = input && input.snapshot ? deepFreeze(clone(input.snapshot)) : definition(input && input.id);
    validateBeast(beast);
    if (!beast.available) throw new Error('该十万年魂兽当前不可参战：' + beast.id);
    const panel = beast.panel;
    if (!panel || !panel.stats) throw new Error('该魂兽缺少实际战斗面板，不能构建实例');
    const instance = {
      id: input.instanceId || 'beast:' + beast.id,
      definitionId: beast.id,
      definitionVersion: beast.version,
      name: beast.name,
      team: 1,
      level: panel.level,
      years: beast.years,
      lifeType: beast.lifeType,
      elements: clone(beast.elements || []),
      style: beast.style,
      model: clone(panel),
      stats: clone(panel.stats),
      derived: clone(panel.derived || {}),
      skills: clone(beast.skills),
      traits: clone(beast.traits),
      exitRule: beast.exitRule,
      hp: panel.derived && panel.derived.HP !== undefined ? panel.derived.HP : null,
      mp: panel.derived && panel.derived.MP !== undefined ? panel.derived.MP : null,
      sh: panel.derived && panel.derived.SH !== undefined ? panel.derived.SH : null,
      traitsFought: [],
      tags: beast.battleTags.slice()
    };
    for (const key of ['hp', 'mp', 'sh']) if (!Number.isFinite(instance[key]) || instance[key] < 0 || (key === 'hp' && instance[key] === 0)) throw new Error('魂兽面板缺少有效' + key.toUpperCase() + '，不能作为正式讨伐目标');
    return instance;
  }

  function validateRewardSource(id, version) {
    const beast = records.get(id);
    if (!beast) throw new Error('奖励来源不是库中十万年魂兽：' + id);
    if (version !== beast.version) throw new Error('奖励来源定义版本不一致：' + version + ' / ' + beast.version);
    if (beast.ringReward.years !== TEN_THOUSAND_YEARS) throw new Error('奖励来源的魂环不是十万年');
    if (!beast.bone || !beast.bone.slot) throw new Error('奖励来源缺少魂骨部位规则');
    return true;
  }

  function status() {
    return {
      empty: available().length === 0,
      count: records.size,
      availableCount: available().length,
      pendingReason: available().length === 0 ? PENDING.EMPTY_BEAST_LIBRARY : null,
      errors
    };
  }

  return Object.freeze({ list, available, definition, pick, buildInstance, validateRewardSource, status, TEN_THOUSAND_YEARS });
}

module.exports = { createBeastLibrary, validateBeast, emptyLibrary, TEN_THOUSAND_YEARS, LIFE_TYPES, DATA_PATH };

},"/modules/src/bridge/v1101.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 与 v11.01 现有战斗/规则代码的连接桥。
 *
 * “战斗的数值可以调用战斗方面的代码”：评级、派生值、魂技生成、控制结算、
 * 魂环年限分档都直接调用 v11.01 的 WitnessRules，而不是在本包里再写一套。
 * 主游戏拼接时也可以不经过本桥，直接把活着的 WitnessRules 作为 ratingFn/rules 注入。
 */

const fs = require('node:fs');
const path = require('node:path');
const { tagSkill } = require('../battle/skill-attributes');

const GAME_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// 交接文档指定的v12基线是“武魂精简版”（已移除魂性谱随机特性运行模块与数据）；
// 若不存在则退回v11.01开发。两者规则版本一致（计算11、评级2）。
const CANDIDATES = [
  path.resolve(__dirname, '..', '..', '..', '..', '..'),
  path.join(GAME_ROOT, 'v11.01武魂精简开发', '骰子系统'),
  path.join(GAME_ROOT, 'v11.01开发', '骰子系统')
];

let cached = null;

function resolveGameDir() {
  if (process.env.WITNESS_GAME_DIR) return process.env.WITNESS_GAME_DIR;
  const found = CANDIDATES.find((dir) => fs.existsSync(path.join(dir, 'v13-runtime.cjs')));
  return found || CANDIDATES[CANDIDATES.length - 1];
}

function loadRuntime() {
  if (cached) return cached;
  const dir = resolveGameDir();
  const entry = path.join(dir, 'v13-runtime.cjs');
  if (!fs.existsSync(entry)) {
    throw new Error('找不到 v11.01 战斗运行时：' + entry + '；可用 WITNESS_GAME_DIR 指定，或在拼接时直接注入 WitnessRules');
  }
  cached = require(entry);
  return cached;
}

function rules() {
  const runtime = loadRuntime();
  if (!runtime.WitnessRules) throw new Error('v11.01 运行时缺少 WitnessRules');
  return runtime.WitnessRules;
}

function rating(model) {
  return rules().rating(model);
}

function derive(stats) {
  return rules().derive(stats);
}

function makeSkill(args) {
  return tagSkill(rules().makeSkill(args), args.soul);
}

function pickCategory(style, roll) {
  return rules().pickCategory(style, roll);
}

function controlEffect(Q, attacker, defender) {
  return rules().controlEffect(Q, attacker, defender);
}

function benchmark(level) {
  return rules().benchmark(level);
}

function band(years) {
  return rules().band(years);
}

function constants() {
  const R = rules();
  return { CAPS: R.CAPS.slice(), BANDS: R.BANDS.slice(), QS: R.QS.slice(), CATEGORIES: R.CATEGORIES.slice() };
}

/**
 * 基线自检：确认接的是“已删除魂性谱随机特性”的精简版，而不是把旧随机特性带回游戏。
 * 同时保留会长/伤疤女等独立角色机制的入口（WitnessScarredChallenge）。
 */
function baseline() {
  const runtime = loadRuntime();
  return {
    dir: resolveGameDir(),
    rulesVersion: rules().calculationVersion,
    ratingRulesVersion: rules().ratingRulesVersion,
    hasRandomSoulTraitRuntime: !!(runtime.WitnessTraitRuntime || runtime.WitnessTraitData || runtime.WitnessTraits),
    hasBattle: !!runtime.WitnessBattle,
    hasRoleChallenge: !!runtime.WitnessScarredChallenge
  };
}

module.exports = { resolveGameDir, loadRuntime, rules, rating, derive, makeSkill, pickCategory, controlEffect, benchmark, band, constants, baseline };

},"/modules/src/hunt/allies.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 家境判定友方NPC（交接文档第五节）。
 *
 * 已定：高于5档才有概率；8—9档必有1位；10档必有2位。
 * 6、7档的50%／75%是交接文档标注的“建议值”，实现里单独带 suggested:true，
 * 方便确认后只改一条表，不改抽取与落盘逻辑。
 *
 * 落盘规则：援助概率、人数和抽中的角色都在第一次接受时固定；
 * 刷新、返回、保存再读取、展开人物说明都不能重抽。
 */

const { clone, requireInteger, uniqueIds } = require('../util');
const { VERSIONS } = require('../versions');
const { drawIndex } = require('../rng');

const ALLY_RULES = Object.freeze({
  1: { count: 0, roll: null },
  2: { count: 0, roll: null },
  3: { count: 0, roll: null },
  4: { count: 0, roll: null },
  5: { count: 0, roll: null },
  6: { count: 1, roll: 50, threshold: 50, suggested: true },
  7: { count: 1, roll: 75, threshold: 75, suggested: true },
  8: { count: 1, roll: null },
  9: { count: 1, roll: null },
  10: { count: 2, roll: null }
});

function ruleFor(originRank) {
  requireInteger(originRank, '家境档位', 1, 10);
  return { originRank, rulesVersion: VERSIONS.allyRules, ...ALLY_RULES[originRank] };
}

/** 只取角色建立时的家境／出身档位；不得用武魂潜力、成长天赋、魅力或气运代替。 */
function resolveOriginRank(character) {
  const rank = character && character.identity && character.identity.originRank;
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
    throw new Error('角色缺少建立时的家境／出身档位 identity.originRank；不得用武魂潜力、成长天赋、魅力或气运代替');
  }
  return rank;
}

function drawNpcIds(roster, count, rng) {  // 可出场集合：有定稿到场正文的角色；未来新增但未补正文的角色不进入抽取。
  const pool = roster.list().filter((character) => character.arrivalTextAvailable !== false).map((character) => character.id);
  if (count > pool.length) throw new Error('友方NPC可出场名录不足：需要' + count + '位，只有' + pool.length + '位');
  const picked = [];
  for (let i = 0; i < count; i++) {
    const draw = drawIndex(rng, pool.length, '友方NPC抽取·第' + (i + 1) + '位');
    picked.push(pool[draw.face - 1]);
    pool.splice(draw.face - 1, 1); // 不放回，别名不会构成第二位
  }
  uniqueIds(picked, '友方NPC抽签');
  return picked;
}

/**
 * 第一次接受时判定并落盘。existing 存在时原样返回，不重投任何骰。
 * @param {object} input { originRank, roster, rng, existing }
 */
function ensureAllies(input) {
  const { roster, rng, existing } = input;
  const originRank = requireInteger(input.originRank, '家境档位', 1, 10);
  if (existing !== undefined && existing !== null) return validateAllies(existing, roster, originRank);

  const rule = ruleFor(originRank);
  const rolls = [];
  let attended = rule.count;
  if (rule.roll !== null) {
    const face = rng.d100('家境' + originRank + '档援助概率');
    attended = face <= rule.threshold ? 1 : 0;
    rolls.push({ label: '援助概率', sides: 100, face, threshold: rule.threshold, success: attended === 1 });
  }
  const npcIds = attended ? drawNpcIds(roster, attended, rng) : [];
  return Object.freeze({
    rulesVersion: VERSIONS.allyRules,
    originRank,
    count: attended,
    npcIds,
    rolls,
    source: '家境判定',
    redrawable: false
  });
}

/**
 * 读档/刷新时的校验：不自作主张重抽，只核对版本、档位与阵容合法性。
 * 若旧存档里的规则版本不同，显式报错并要求迁移，而不是静默改队友。
 */
function validateAllies(allies, roster, originRank) {
  if (!allies || typeof allies !== 'object') throw new Error('友方阵容数据无效');
  if (allies.rulesVersion !== VERSIONS.allyRules) {
    throw new Error('友方阵容规则版本不一致：存档 ' + allies.rulesVersion + '，当前 ' + VERSIONS.allyRules + '；须显式迁移，不能重抽');
  }
  if (originRank !== undefined && allies.originRank !== originRank) throw new Error('友方阵容家境档位与当前存档不一致');
  if (!Array.isArray(allies.npcIds) || !Number.isInteger(allies.count) || allies.count !== allies.npcIds.length) {
    throw new Error('友方阵容人数与名单不一致');
  }
  if (allies.count < 0 || allies.count > 2) throw new Error('友方阵容人数须为0—2');
  if (allies.count === 2) {
    if (new Set(allies.npcIds).size !== 2) throw new Error('两位友方NPC不得重复（别名不算第二位）');
  }
  for (const id of allies.npcIds) {
    const record = roster.get(id);
    if (!record) throw new Error('友方NPC不存在：' + id);
  }
  const rule = ruleFor(allies.originRank);
  if (rule.roll === null && allies.count !== rule.count) throw new Error('必定到场的友方NPC人数不符合家境规则');
  if (allies.count > rule.count) throw new Error('家境' + allies.originRank + '档最多' + rule.count + '位友方NPC');
  if (allies.count === 1 && rule.count === 0) throw new Error('家境1—5档不应有友方NPC');
  if (allies.count === 2 && allies.originRank !== 10) throw new Error('只有家境10档必有两位友方NPC');
  return Object.freeze(clone(allies));
}

function describeAllies(allies, roster) {
  validateAllies(allies, roster);
  const names = allies.npcIds.map((id) => roster.get(id).name);
  if (!allies.count) return { text: '无友方NPC', names: [] };
  return { text: names.join('、') + '（' + allies.count + '位）', names };
}

module.exports = { ALLY_RULES, ruleFor, resolveOriginRank, ensureAllies, validateAllies, drawNpcIds, describeAllies };

},"/modules/src/hunt/battle.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 讨伐战模式（交接文档第七节）。
 *
 * 独立模式，不挪用转正考核或结局挑战的机会账本：
 *   0 位NPC → 1对1；1 位 → 2对1；2 位 → 3对1。
 * 不因徐太平是辅助系而自动补敌方考官、支援会员或补成2对2。
 * 本模块只产出“可交给现有行动条引擎”的队伍描述与胜负判定，不另写一套战斗循环，
 * 战斗数值仍由主游戏战斗代码结算。
 */

const { clone, uniqueIds } = require('../util');
const { EVENT_ID } = require('./conditions');
const { VERSIONS } = require('../versions');
const { tagUnitSkills } = require('../battle/skill-attributes');

const MAX_ALLIES = 2;

function buildHuntBattle(input) {
  let { player, enemy, allies = [], seed } = input;
  if (!player) throw new Error('讨伐战缺少玩家参战者');
  if (!enemy) throw new Error('讨伐战缺少十万年魂兽目标实例');
  if (!Array.isArray(allies) || allies.length > MAX_ALLIES) throw new Error('讨伐战友方NPC须为0—2位');
  if (typeof seed !== 'string' || !seed) throw new Error('讨伐战须带确定性种子');
  player = tagUnitSkills(player);
  enemy = tagUnitSkills(enemy);
  allies = allies.map(tagUnitSkills);

  const allyIds = uniqueIds(allies.map((ally) => ally.id), '讨伐战友方');
  if (allyIds.length !== allies.length) throw new Error('讨伐战友方ID重复');
  if (allyIds.includes(player.id)) throw new Error('友方NPC不能与玩家同ID');
  if (enemy.id === player.id || allyIds.includes(enemy.id)) throw new Error('魂兽目标ID与参战者冲突');

  const units = [player, ...allies, enemy];
  const plan = {
    mode: 'hunt',
    eventId: EVENT_ID,
    version: VERSIONS.huntBattle,
    seed,
    // 这些开关必须在拼接时真正限制引擎，不能只写在注释里。
    rules: {
      autoSupport: false,
      allySupport: false,
      enemySupport: false,
      supplementEnemyToTwo: false,
      allowAdmissionFighter: false,
      allowGuildmaster: false,
      consumePromotionAttempts: false,
      consumeChallengeLedger: false,
      actionBar: 'engine',
      timeLimitSeconds: 180
    },
    teams: { player: [player], allies: allies.map((ally) => ally), enemy: [enemy] },
    units,
    sizes: { player: 1, allies: allies.length, enemy: 1 }
  };
  validateHuntBattle(plan);
  return plan;
}

function validateHuntBattle(plan) {
  if (!plan || plan.mode !== 'hunt') throw new Error('不是讨伐战模式');
  const sizes = plan.sizes || {};
  if (sizes.player !== 1 || sizes.enemy !== 1 || ![0, 1, 2].includes(sizes.allies)) {
    throw new Error('讨伐战人数只能为1对1、2对1或3对1');
  }
  if ((plan.units || []).length !== 2 + sizes.allies) throw new Error('讨伐战单位数与人数不一致');
  const rules = plan.rules || {};
  for (const key of ['autoSupport', 'allySupport', 'enemySupport', 'supplementEnemyToTwo', 'allowAdmissionFighter', 'allowGuildmaster', 'consumePromotionAttempts', 'consumeChallengeLedger']) {
    if (rules[key] !== false) throw new Error('讨伐战不得开启 ' + key);
  }
  return true;
}

/**
 * 胜负判定。
 *
 * 胜利：魂兽按其明确退场规则被实际击败，且己方至少一名参战者存活。
 * 玩家先退场而队友最后获胜 → 团队胜利。
 * 超时、平局、逃离、认输、全灭 → 不得获得魂环与魂骨。
 */
function judgeHunt(input) {
  const outcome = input.outcome;
  const enemy = input.enemy || {};
  const survivors = Array.isArray(input.survivors) ? input.survivors.slice() : [];
  const allowed = ['victory', 'timeout', 'draw', 'escape', 'surrender', 'wipe', 'loss'];
  if (!allowed.includes(outcome)) throw new Error('讨伐结果类型无效：' + outcome);

  const defeated = enemy.defeated === true || enemy.exitRuleMet === true;
  const allyAlive = survivors.length > 0;

  if (outcome !== 'victory') {
    return { winner: ['loss', 'wipe'].includes(outcome) ? 'enemy' : 'none', loot: false, reason: 'outcome-' + outcome, defeated, allyAlive };
  }
  if (!defeated) {
    return { winner: 'none', loot: false, reason: 'beast-still-alive', defeated, allyAlive };
  }
  if (!allyAlive) {
    return { winner: 'enemy', loot: false, reason: 'team-wiped', defeated, allyAlive };
  }
  return { winner: 'team', loot: true, reason: 'beast-defeated-with-survivor', defeated, allyAlive };
}

/**
 * 战报骨架。胜败都能保存、查看、导出；记录类型必须区分为讨伐。
 * 具体战报内容由主游戏战斗快照填充，本模块只锁定“讨伐”类型与关键字段。
 */
function buildHuntReport(input) {
  const { plan, judge, target, traits, triggers, loot, preStoredRing } = input;
  if (!plan || plan.mode !== 'hunt') throw new Error('战报缺少讨伐战计划');
  if (!judge) throw new Error('战报缺少胜负判定');
  return {
    type: 'hunt',
    recordVersion: 1,
    rulesVersion: VERSIONS.huntBattle,
    targetId: target && target.id,
    targetVersion: target && target.version,
    seed: plan.seed,
    team: {
      player: plan.teams.player.map((unit) => ({ id: unit.id, name: unit.name, level: unit.level })),
      allies: plan.teams.allies.map((unit) => ({ id: unit.id, name: unit.name, level: unit.level })),
      enemy: plan.teams.enemy.map((unit) => ({ id: unit.id, name: unit.name, level: unit.level }))
    },
    traits: clone(traits || []),
    triggers: clone(triggers || []),
    result: { outcome: judge.winner, loot: judge.loot, reason: judge.reason },
    rewards: clone(loot || { rings: [], bones: [] }),
    preStoredRing: preStoredRing ? clone(preStoredRing) : null,
    savedAt: null
  };
}

/** 战报导出：与挑战战报一样可读，但格式标记为讨伐。 */
function exportHuntReport(report) {
  if (!report || report.type !== 'hunt') throw new Error('不是讨伐战报');
  return { format: 'witness-hunt-report', version: 1, report: clone(report) };
}

module.exports = { MAX_ALLIES, buildHuntBattle, validateHuntBattle, judgeHunt, buildHuntReport, exportHuntReport };

},"/modules/src/hunt/conditions.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 讨伐事件的固定触发条件（交接文档第三节）。
 *
 * 同时满足：
 *   1. 玩家等级 ≥ 80；
 *   2. 当前基础实力评级达到凶级或以上（凶／狂／神）；
 *   3. 本角色尚未处理过该邀请，也未处于该任务流程中。
 *
 * 评级必须由角色面板与战斗共用的现行接口现算，采用实际基础面板；
 * 因此本模块不接收“显示文字”“历史最高评级”“临时战斗增益”或旧晋升标记，
 * 只接收等级、实际基础六维与一个评级函数（默认接 v11.01 的 WitnessRules.rating）。
 */

const { RATING_ORDER, RATING_MIN_FOR_HUNT, requireInteger } = require('../util');

const REQUIRED_LEVEL = 80;
const EVENT_ID = 'hunt_hundred_thousand';

function ratingIndex(label) {
  const index = RATING_ORDER.indexOf(label);
  if (index < 0) throw new Error('评级名称无效：' + label + '；只接受现行接口返回的' + RATING_ORDER.join('/'));
  return index;
}

function ratingAtLeast(label, minimum) {
  return ratingIndex(label) >= ratingIndex(minimum);
}

/**
 * @param {object} input
 * @param {number} input.level 当前等级（不是历史最高等级）
 * @param {object} input.model 实际基础面板（含 level 与 stats 六维），由角色面板现算
 * @param {function} input.ratingFn 现行评级接口，返回 {label, score, thresholds}
 * @param {object} [input.ledger] 讨伐任务账本
 */
function evaluateCondition(input) {
  const level = requireInteger(input.level, '等级', 0, 99);
  if (typeof input.ratingFn !== 'function') throw new Error('必须注入角色面板与战斗共用的评级函数');
  if (!input.model || !input.model.stats) throw new Error('缺少实际基础面板，不能用显示文字或历史评级代替');
  if (input.model.level !== undefined && input.model.level !== level) {
    throw new Error('面板等级与当前等级不一致，须用当前实际面板重算');
  }

  const rating = input.ratingFn(input.model);
  if (!rating || typeof rating.label !== 'string') throw new Error('评级接口未返回现行评级');
  if (!rating.thresholds || typeof rating.thresholds !== 'object' || !Number.isInteger(rating.thresholds.version)) {
    throw new Error('评级接口未返回门槛版本，无法确认是现行计算接口');
  }
  // 只接受带门槛版本的现行结果；旧版晋升标记或手写评级没有 thresholds。
  const labelIndex = ratingIndex(rating.label);

  const checks = {
    level: level >= REQUIRED_LEVEL,
    rating: ratingAtLeast(rating.label, RATING_MIN_FOR_HUNT),
    notHandled: !isHandled(input.ledger)
  };
  const eligible = checks.level && checks.rating && checks.notHandled;

  let reason = 'eligible';
  if (!checks.level) reason = 'level-below-80';
  else if (!checks.rating) reason = 'rating-below-xiong';
  else if (!checks.notHandled) reason = 'already-handled';

  return {
    eventId: EVENT_ID,
    eligible,
    reason,
    level,
    requiredLevel: REQUIRED_LEVEL,
    rating: { label: rating.label, score: rating.score, thresholds: rating.thresholds, labelIndex },
    minimumRating: RATING_MIN_FOR_HUNT,
    checks,
    // 固定触发：不进入普通事件权重池，也不额外投“是否触发”骰。
    randomTriggerRoll: null,
    weightPool: null
  };
}

function isHandled(ledger) {
  if (!ledger) return false;
  if (ledger.handled === true) return true;
  return !['idle', 'pending'].includes(ledger.status);
}

/**
 * 首次满足条件时登记待办；已登记或已处理时返回原状态。
 * “固定触发”不替换当前普通事件：登记只写任务账本，不消费事件次数。
 */
function registerPending(ledger, detail) {
  if (isHandled(ledger)) return { changed: false, ledger };
  const next = {
    ...ledger,
    version: ledger.version,
    eventId: EVENT_ID,
    status: 'pending',
    handled: false,
    pendingSince: ledger.pendingSince || detail && detail.at || null,
    pendingLevel: ledger.pendingLevel === undefined ? detail && detail.level : ledger.pendingLevel,
    pendingRating: ledger.pendingRating || (detail && detail.rating && detail.rating.label) || null
  };
  return { changed: true, ledger: next };
}

module.exports = { EVENT_ID, REQUIRED_LEVEL, MINIMUM_RATING: RATING_MIN_FOR_HUNT, evaluateCondition, ratingAtLeast, ratingIndex, isHandled, registerPending };

},"/modules/src/hunt/controller.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 讨伐事件控制器（交接文档第三、四、五、六、七节）。
 *
 * 固定顺序：邀请正文 → 接受／拒绝 → 接受后的队友判定 → 到场正文 → 前进 →
 * 调用十万年魂兽 → 战斗 → 结果与奖励 → 恢复原流程。
 *
 * 边界：
 *   - 条件用现行评级接口现算，不看显示文字/历史最高/临时增益；
 *   - 固定触发，不投是否触发骰，不替换当前普通事件（保留恢复点）；
 *   - 接受与拒绝本身不发经验、属性、准备值、关系、气运；
 *   - 队友在第一次接受时落盘，读档/刷新不重抽；
 *   - 到场正文严格按已保存顺序整段显示，不合并、不改写、不省略；
 *   - 空魂兽库时停在“目标资料尚未开放”，保留接受与援军结果，可返回普通流程；
 *   - 讨伐战是独立模式，不挪用餐/结局挑战机会账本。
 */

const conditions = require('./conditions');
const ledgerApi = require('./ledger');
const texts = require('./texts');
const { snapshotFlow, restoreFlow } = require('./flow');
const { evaluateCondition } = conditions;
const { ensureAllies, validateAllies, resolveOriginRank } = require('./allies');
const { buildHuntBattle, judgeHunt, buildHuntReport } = require('./battle');
const { PENDING } = require('../versions');

const DEFAULT_CONFIG = Object.freeze({
  modes: { journey: true, trial: false },
  recordJourneyOnly: true,
  allowRerollAllies: false
});

function createHuntController(options) {
  const roster = options && options.roster;
  const ratingFn = options && options.ratingFn;
  const library = options && options.library;
  const config = {
    ...DEFAULT_CONFIG,
    ...(options && options.config),
    modes: { ...DEFAULT_CONFIG.modes, ...((options && options.config && options.config.modes) || {}) }
  };
  if (!roster) throw new Error('讨伐控制器缺少友方NPC名录');
  if (typeof ratingFn !== 'function') throw new Error('讨伐控制器缺少现行评级接口');
  if (!library) throw new Error('讨伐控制器缺少十万年魂兽库');

  function modeEnabled(mode) {
    return !!(config.modes && config.modes[mode]);
  }

  function evaluate(input) {
    const mode = input.mode || 'journey';
    if (!modeEnabled(mode)) {
      return { eventId: conditions.EVENT_ID, eligible: false, reason: 'mode-disabled', mode, level: input.level, randomTriggerRoll: null, weightPool: null };
    }
    const result = evaluateCondition({ level: input.level, model: input.model, ratingFn, ledger: input.ledger });
    return { ...result, mode, recordCompletion: mode === 'journey' || !config.recordJourneyOnly };
  }

  /**
   * 安全节点检查 + 登记待办 + 展示邀请。
   * presentationKey 用于幂等：同一安全节点重复调用不会第二次弹出。
   */
  function consider(input) {
    const mode = input.mode || 'journey';
    const condition = evaluate({ ...input, mode });
    if (!condition.eligible) {
      return { ledger: ledgerApi.normalize(input.ledger), condition, presentation: null, deduped: input.ledger && input.ledger.status === 'invitation' };
    }

    let ledger = ledgerApi.normalize(input.ledger);
    // 先确认安全节点，再登记待办：读档预览/面板刷新/战斗动画里不得留下任务痕迹。
    texts.assertSafeNode(input.safeNode);
    if (ledger.status === 'idle') {
      const restorePoint = input.flow ? snapshotFlow(input.flow) : null;
      ledger = ledgerApi.registerPending(ledger, {
        at: input.at === undefined ? null : input.at,
        level: condition.level,
        rating: condition.rating.label,
        mode,
        recordCompletion: condition.recordCompletion,
        restorePoint
      }).ledger;
    }
    if (ledger.status !== 'pending') {
      return { ledger, condition, presentation: null, deduped: ledger.status === 'invitation' };
    }
    const key = input.key || ('hunt:' + (input.at === undefined ? condition.level : input.at));
    if (ledger.presentations.includes(key)) return { ledger, condition, presentation: null, deduped: true };
    ledger = ledgerApi.presentInvitation(ledger, key);
    return {
      ledger,
      condition,
      presentation: { kind: 'invitation', ...texts.invitationView(), mode, recordCompletion: condition.recordCompletion }
    };
  }

  /**
   * 接受／拒绝。接受时先落盘友方阵容，再给出共同正文与到场正文。
   * option 只接受定稿的两个选项文字。
   */
  function choose(input) {
    const ledger = ledgerApi.normalize(input.ledger);
    if (ledger.status !== 'invitation') throw new Error('当前不在邀请阶段，不能选择接受或拒绝');
    const option = input.option;
    if (!texts.TEXTS.invitation.options.includes(option)) throw new Error('邀请选项无效：' + option);

    if (option === '拒绝') {
      const next = ledgerApi.refuse(ledger);
      return { ledger: next, accepted: false, texts: texts.refusalView(), restore: restoreFlowOrNull(next) };
    }

    const originRank = input.originRank === undefined ? resolveOriginRank(input.character) : input.originRank;
    if (!Number.isInteger(originRank) || originRank < 1 || originRank > 10) throw new Error('接受时须提供角色建立时的家境档位');
    const allies = ledger.allies
      ? validateAllies(ledger.allies, roster, originRank)
      : ensureAllies({ originRank, roster, rng: input.rng });
    let next = ledgerApi.accept(ledger, allies, { at: input.at });
    next = ledgerApi.arrive(next);
    return {
      ledger: next,
      accepted: true,
      allies,
      acceptedText: texts.acceptedView(),
      arrival: texts.arrivalView(roster, allies.npcIds),
      note: '接受本身不发经验、属性、准备值、关系或气运；到达场正文后必须点前进才进入狩猎。'
    };
  }

  /**
   * 前进：首次确定并立即冻结目标；空库则停在待办，不空战、不自动胜利、不发占位奖励。
   * 需要玩家单位与友方单位供拼接层构建队伍。
   */
  function forward(input) {
    const ledger = ledgerApi.normalize(input.ledger);
    if (!['arrival', 'forwarded', 'awaiting-library'].includes(ledger.status)) throw new Error('只有到场正文之后、或空库待办中才能前进');

    const picked = library.pick({ frozen: ledger.target, rng: input.rng });
    if (picked.empty) {
      const waiting = ledgerApi.setTarget(ledger, null);
      return { ledger: waiting, pending: true, reason: PENDING.EMPTY_BEAST_LIBRARY, message: '目标资料尚未开放', allies: waiting.allies };
    }
    const next = ledgerApi.setTarget(ledger, picked.target);
    const expected = ledger.allies.npcIds;
    const supplied = input.allyUnits || [];
    if (supplied.length !== expected.length || supplied.some((unit, i) => unit.npcId !== expected[i])) {
      throw new Error('参战友方NPC与已冻结的援军名单或顺序不一致');
    }
    const target = picked.target.snapshot;
    const enemyInstance = library.buildInstance({ snapshot: picked.target.snapshot, instanceId: 'beast:' + target.id });
    const plan = buildHuntBattle({
      player: input.playerUnit,
      allies: input.allyUnits || [],
      enemy: enemyInstance,
      seed: ledger.battleSeed || input.seed
    });
    return {
      ledger: { ...next, battleSeed: ledger.battleSeed || input.seed },
      pending: false,
      target: { id: target.id, version: target.version },
      encounter: { name: target.name, years: target.years, battleText: target.battleText, lifeType: target.lifeType, traitIds: target.traits.map((trait) => trait.id) },
      battlePlan: plan,
      roll: picked.roll
    };
  }

  function startBattle(ledger, sessionId) {
    return ledgerApi.startBattle(ledger, sessionId);
  }

  /** 结算：超时/平局/逃离/认输/全灭都不给环与骨。 */
  function resolve(input) {
    const ledger = ledgerApi.normalize(input.ledger);
    if (ledger.status !== 'battle') throw new Error('当前不在讨伐战斗中');
    if (!input.plan || input.plan.mode !== 'hunt') throw new Error('结算缺少讨伐战计划');
    if (input.plan.teams.enemy[0].definitionId !== ledger.target.id) throw new Error('结算目标与冻结魂兽不一致');
    const friendlyIds = [...input.plan.teams.player, ...input.plan.teams.allies].map((unit) => unit.id);
    if ((input.survivors || []).some((id) => !friendlyIds.includes(id))) throw new Error('存活者不属于本次讨伐友方');
    const judge = judgeHunt({ outcome: input.outcome, enemy: input.enemy, survivors: input.survivors });
    const next = ledgerApi.resolveBattle(ledger, judge);
    const report = buildHuntReport({ plan: input.plan, judge, target: ledger.target, traits: input.traits, triggers: input.triggers });
    return {
      ledger: next,
      judge,
      report,
      firstWin: judge.loot && ledger.status === 'battle',
      restore: restoreFlowOrNull(next)
    };
  }

  function restoreFlowOrNull(ledger) {
    return ledger.restorePoint ? restoreFlow(ledger.restorePoint) : null;
  }

  /** 读档/刷新时只校验，不重抽队友、不换目标。 */
  function validate(ledger) {
    ledgerApi.validate(ledger);
    if (ledger.allies) validateAllies(ledger.allies, roster, ledger.allies.originRank);
    return true;
  }

  return Object.freeze({ evaluate, consider, choose, forward, startBattle, resolve, validate, restoreFlow: restoreFlowOrNull, summary: ledgerApi.summary });
}

module.exports = { createHuntController, DEFAULT_CONFIG };

},"/modules/src/hunt/flow.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 原普通流程的恢复点（交接文档第三、四节）。
 *
 * “固定触发”不等于替换当前普通事件：触发前记录原流程恢复点；
 * 拒绝或讨伐流程结束后，恢复原先未完成的普通流程，
 * 不能吞掉一次事件、重复发放原事件奖励或推进额外培养阶段。
 *
 * 本模块不解释流程内部字段，只做三件事：
 *   1. 取快照（深拷贝 + 核心字段指纹）；
 *   2. 恢复快照（返回新对象，不改调用方对象）；
 *   3. 对比恢复前后的“已消费/已发放”计数，证明没有多吞或多发。
 */

const { clone, isPlainObject } = require('../util');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}

function fingerprint(value) {
  let h = 2166136261;
  for (const ch of stableStringify(value)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const COUNTER_FIELDS = Object.freeze(['completed', 'consumedEvents', 'eventCount', 'quarter', 'rewardsGranted', 'stage']);

/** 记录恢复点。flow 为当前普通流程的只读副本；不修改传入对象。 */
function snapshotFlow(flow) {
  if (!isPlainObject(flow)) throw new Error('恢复点须建立在普通流程对象上');
  const snapshot = clone(flow);
  return Object.freeze({
    version: 1,
    phase: snapshot.phase === undefined ? null : snapshot.phase,
    fingerprint: fingerprint(snapshot),
    counters: Object.fromEntries(
      COUNTER_FIELDS.filter((key) => snapshot[key] !== undefined).map((key) => [key, clone(snapshot[key])])
    ),
    snapshot
  });
}

/** 恢复原流程：返回深拷贝，不返回快照本体，避免后续被任务流程改写。 */
function restoreFlow(restorePoint) {
  if (!isPlainObject(restorePoint) || restorePoint.version !== 1 || !isPlainObject(restorePoint.snapshot)) {
    throw new Error('恢复点无效');
  }
  return clone(restorePoint.snapshot);
}

/**
 * 证明恢复前后没有多吞事件、多发奖励或多推进培养：
 * 只比较双方都存在的计数，缺字段不算差异（旧流程结构可能没有这些字段）。
 */
function compareFlow(before, after) {
  const diffs = [];
  for (const key of COUNTER_FIELDS) {
    if (before[key] === undefined || after[key] === undefined) continue;
    if (stableStringify(before[key]) !== stableStringify(after[key])) {
      diffs.push({ field: key, before: clone(before[key]), after: clone(after[key]) });
    }
  }
  return { equal: diffs.length === 0, diffs, comparedFields: COUNTER_FIELDS.filter((key) => before[key] !== undefined && after[key] !== undefined) };
}

/** 断言恢复点仍指向同一份流程（防止把 A 角色的恢复点用回 B 角色）。 */
function assertSameFlow(restorePoint, flow, label) {
  if (!isPlainObject(flow)) throw new Error((label || '流程') + '对象无效');
  if (fingerprint(flow) !== restorePoint.fingerprint) {
    throw new Error('恢复点与当前流程不一致：中间已推进或更换了流程，不能直接回滚');
  }
  return true;
}

module.exports = { snapshotFlow, restoreFlow, compareFlow, assertSameFlow, fingerprint, COUNTER_FIELDS };

},"/modules/src/hunt/ledger.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 讨伐任务账本（每角色一份）。
 *
 * 只记录本角色与这次固定邀请有关的状态：是否登记、是否展示、接受/拒绝、
 * 已落盘的队友、已冻结的目标、战斗场次、结果与奖励事务ID、恢复点。
 * 不加经验、不加属性、不发准备值、不改关系或气运——这些不属于邀请本身的收益。
 */

const { clone, isPlainObject } = require('../util');
const { EVENT_ID } = require('./conditions');
const { VERSIONS } = require('../versions');

const STATUSES = Object.freeze([
  'idle',
  'pending',
  'invitation',
  'refused',
  'accepted',
  'arrival',
  'forwarded',
  'awaiting-library',
  'battle',
  'won',
  'lost'
]);

const TERMINAL = Object.freeze(['refused', 'won', 'lost']);

const ALLOWED = Object.freeze({
  idle: ['pending'],
  pending: ['invitation'],
  invitation: ['refused', 'accepted'],
  refused: [],
  accepted: ['arrival'],
  arrival: ['forwarded', 'awaiting-library'],
  forwarded: ['battle', 'awaiting-library'],
  'awaiting-library': ['forwarded'],
  battle: ['won', 'lost'],
  won: [],
  lost: ['forwarded']
});

function createLedger() {
  return {
    version: VERSIONS.huntLedger,
    eventId: EVENT_ID,
    status: 'idle',
    handled: false,
    refused: false,
    pendingSince: null,
    pendingLevel: null,
    pendingRating: null,
    mode: 'journey',
    recordCompletion: true,
    acceptedAt: null,
    allies: null,
    target: null,
    battleSessionId: null,
    result: null,
    rewardTransactionId: null,
    restorePoint: null,
    presentations: [],
    history: []
  };
}

function normalize(raw) {
  if (raw === undefined || raw === null) return createLedger();
  if (!isPlainObject(raw)) throw new Error('讨伐任务账本无效');
  const ledger = { ...createLedger(), ...clone(raw) };
  if (ledger.version !== VERSIONS.huntLedger) {
    throw new Error('讨伐任务账本版本不一致：' + ledger.version + '，当前 ' + VERSIONS.huntLedger);
  }
  if (!STATUSES.includes(ledger.status)) throw new Error('讨伐任务状态无效：' + ledger.status);
  if (!Array.isArray(ledger.presentations)) throw new Error('讨伐展示记录无效');
  if (!Array.isArray(ledger.history)) throw new Error('讨伐历史记录无效');
  return ledger;
}

function validate(raw) {
  const ledger = normalize(raw);
  if (ledger.status === 'refused' && ledger.refused !== true) throw new Error('拒绝状态缺少拒绝标记');
  if (['accepted', 'arrival', 'forwarded', 'awaiting-library', 'battle', 'won', 'lost'].includes(ledger.status) && !ledger.allies) {
    throw new Error('已接受的讨伐缺少友方阵容结果');
  }
  if (ledger.allies && (!Array.isArray(ledger.allies.npcIds) || !Number.isInteger(ledger.allies.count))) {
    throw new Error('友方阵容结果无效');
  }
  if (ledger.target) {
    if (typeof ledger.target.id !== 'string' || !ledger.target.id) throw new Error('已冻结目标缺少稳定ID');
    if (!Number.isInteger(ledger.target.version)) throw new Error('已冻结目标缺少定义版本');
  }
  if (ledger.presentations.some((x) => typeof x !== 'string' || !x)) throw new Error('展示键无效');
  if (new Set(ledger.presentations).size !== ledger.presentations.length) throw new Error('展示键重复');
  return true;
}

function transition(ledger, to, patch, note) {
  const current = normalize(ledger);
  if (!ALLOWED[current.status].includes(to)) throw new Error('讨伐任务不能从 ' + current.status + ' 进入 ' + to);
  const next = {
    ...current,
    ...clone(patch || {}),
    version: VERSIONS.huntLedger,
    eventId: EVENT_ID,
    status: to,
    history: [...current.history, { from: current.status, to, note: note || null, index: current.history.length }]
  };
  if (['refused', 'won', 'lost'].includes(to)) next.handled = true;
  validate(next);
  return next;
}

function registerPending(ledger, detail = {}) {
  const current = normalize(ledger);
  if (current.status !== 'idle') return { changed: false, ledger: current };
  const next = transition(current, 'pending', {
    pendingSince: detail.at === undefined ? null : detail.at,
    pendingLevel: detail.level === undefined ? null : detail.level,
    pendingRating: detail.rating === undefined ? null : detail.rating,
    mode: detail.mode || 'journey',
    recordCompletion: detail.recordCompletion !== false,
    restorePoint: detail.restorePoint === undefined ? null : clone(detail.restorePoint)
  }, 'fixed-trigger');
  return { changed: true, ledger: next };
}

function presentInvitation(ledger, presentationKey) {
  const current = normalize(ledger);
  if (current.status !== 'pending') throw new Error('只有待办状态可以展示讨伐邀请');
  if (typeof presentationKey !== 'string' || !presentationKey) throw new Error('展示须带幂等键');
  if (current.presentations.includes(presentationKey)) throw new Error('同一安全节点不能重复弹出讨伐邀请');
  return transition(current, 'invitation', { presentations: [...current.presentations, presentationKey] }, 'present-invitation');
}

function refuse(ledger) {
  return transition(ledger, 'refused', { refused: true, allies: null, target: null }, 'refuse');
}

function accept(ledger, allies, detail = {}) {
  if (!allies) throw new Error('接受后必须落盘友方阵容结果');
  return transition(ledger, 'accepted', {
    acceptedAt: detail.at === undefined ? null : detail.at,
    allies: clone(allies)
  }, 'accept');
}

function arrive(ledger) {
  return transition(ledger, 'arrival', {}, 'arrival-text');
}

function setTarget(ledger, target) {
  const current = normalize(ledger);
  if (!['arrival', 'forwarded', 'awaiting-library'].includes(current.status)) {
    throw new Error('当前阶段不能确定魂兽目标：' + current.status);
  }
  if (!target) {
    if (current.status === 'awaiting-library') return current;
    return transition(current, 'awaiting-library', { target: null }, 'library-empty');
  }
  if (typeof target.id !== 'string' || !target.id) throw new Error('魂兽目标缺少稳定ID');
  if (!Number.isInteger(target.version)) throw new Error('魂兽目标缺少定义版本');
  if (current.status === 'forwarded') {
    // 目标已冻结：重开界面沿用原目标，不重抽。
    return { ...current, target: clone(target), history: [...current.history, { from: 'forwarded', to: 'forwarded', note: 'target-reused', index: current.history.length }] };
  }
  return transition(current, 'forwarded', { target: clone(target) }, 'target-frozen');
}

function startBattle(ledger, battleSessionId) {
  if (typeof battleSessionId !== 'string' || !battleSessionId) throw new Error('讨伐战斗缺少唯一场次ID');
  return transition(ledger, 'battle', { battleSessionId }, 'battle-start');
}

function resolveBattle(ledger, result) {
  const won = !!(result && result.loot === true);
  return transition(ledger, won ? 'won' : 'lost', { result: clone(result || {}) }, won ? 'win' : 'not-win');
}

function resumeFromPending(ledger) {
  const current = normalize(ledger);
  if (current.status !== 'awaiting-library') throw new Error('只有空库待办状态可以继续');
  return { ...current, status: 'forwarded', history: [...current.history, { from: 'awaiting-library', to: 'forwarded', note: 'library-ready', index: current.history.length }] };
}

function setReward(ledger, rewardTransactionId) {
  const current = normalize(ledger);
  return { ...current, rewardTransactionId };
}

function isTerminal(ledger) {
  const current = normalize(ledger);
  return TERMINAL.includes(current.status);
}

function summary(ledger) {
  const current = normalize(ledger);
  return {
    status: current.status,
    handled: current.handled,
    refused: current.refused,
    mode: current.mode,
    recordCompletion: current.recordCompletion,
    allyIds: current.allies ? current.allies.npcIds.slice() : [],
    target: current.target ? { id: current.target.id, version: current.target.version } : null,
    battleSessionId: current.battleSessionId,
    result: current.result,
    rewardTransactionId: current.rewardTransactionId,
    hasRestorePoint: !!current.restorePoint
  };
}

module.exports = {
  STATUSES,
  TERMINAL,
  ALLOWED,
  createLedger,
  normalize,
  validate,
  transition,
  registerPending,
  presentInvitation,
  refuse,
  accept,
  arrive,
  setTarget,
  startBattle,
  resolveBattle,
  resumeFromPending,
  setReward,
  isTerminal,
  summary
};

},"/modules/src/hunt/texts.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 定稿叙事文本查询。文本本体由 tools/extract-texts.cjs 从交接文档机械提取，
 * 本文件只负责按流程顺序取用，不改写、不合并、不省略。
 */

const TEXTS = require('../text/hunt-texts.generated');

const SAFE_NODES = Object.freeze(['growth-settled', 'hunt-settled', 'battle-settled']);
const UNSAFE_NODES = Object.freeze(['read-preview', 'panel-refresh', 'battle-animation', 'loading', 'battle']);
const ALL_SAFE = Object.freeze([...SAFE_NODES, ...UNSAFE_NODES]);

function assertSafeNode(node) {
  if (!ALL_SAFE.includes(node)) throw new Error('未知的剧情节点：' + node + '；不能把邀请塞进读档预览、面板刷新或战斗动画');
  if (!SAFE_NODES.includes(node)) throw new Error('当前节点不是安全节点：' + node + '；讨伐邀请只能在不可分割的结算完成之后展示');
  return node;
}

/** 邀请正文：标题单独给出（渲染为标题行），正文两段；正文下只给「接受」「拒绝」两个选项。 */
function invitationView() {
  return {
    eventId: TEXTS.eventId,
    title: TEXTS.title,
    paragraphs: TEXTS.invitation.paragraphs.slice(1),
    allParagraphs: TEXTS.invitation.paragraphs.slice(),
    options: TEXTS.invitation.options.slice(),
    noOptionRewards: true
  };
}

function refusalView() {
  return { paragraphs: TEXTS.refusal.slice(), options: [] };
}

function acceptedView() {
  return { paragraphs: TEXTS.accepted.slice() };
}

/** 到场正文。必须传入已保存的顺序；0位/1位/2位由名录决定。 */
function arrivalView(roster, npcIds) {
  if (!Array.isArray(npcIds) || npcIds.length > 2) throw new Error('到场阵容须为0—2位友方NPC');
  return {
    npcIds: npcIds.slice(),
    paragraphs: roster.arrivalParagraphs(npcIds),
    advanceOption: TEXTS.advance
  };
}

function advanceLabel() {
  return TEXTS.advance;
}

module.exports = { TEXTS, SAFE_NODES, UNSAFE_NODES, assertSafeNode, invitationView, refusalView, acceptedView, arrivalView, advanceLabel };

},"/modules/src/npc/combat.js":function(require,module,exports,__dirname){
'use strict';

/**
 * NPC战斗适配（交接文档第十八、十九节）。
 *
 * 交接文档明确：名录里的 skills[].operations 与 implementation 只是待实现规范，
 * 不能直接当旧引擎原生技能使用。本模块做两件事：
 *   1. buildUnit：把名录里的实际面板、八魂技、特性转成“可进入现有行动条”的单位描述；
 *      等级、面板不随玩家等级缩放；费用/读条/冷却/倍率都用名录已核算的值。
 *   2. runSkill / dispatch：把 operations 映射到宿主（主游戏战斗引擎）原语，
 *      特性则用状态机计算应发生的效果，再由拼接层交给同一组战斗事件。
 *
 * 本模块不实现伤害公式，不维护第二套基础数值；宿主缺少某个原语时显式抛错，
 * 而不是静默跳过（“界面展示完整特性却实际无效”是交接文档禁止的）。
 */

const chengliang = require('./traits/chengliang');
const xutaiping = require('./traits/xutaiping');
const sailiya = require('./traits/sailiya');
const { VERSIONS } = require('../versions');
const { clone } = require('../util');
const { tagSkill } = require('../battle/skill-attributes');

const TRAITS = Object.freeze({ chengliang, xutaiping, sailiya_fengzhi: sailiya });
const EXPECTED_TRAITS = Object.freeze({ chengliang: ['周天格阵', '六库仙贼', '易中日月'], xutaiping: ['深暗', '灯灭'], sailiya_fengzhi: ['承露符锋', '秘元归宿体'] });

/** 宿主需提供的战斗原语。每一项都对应现有引擎里真实存在的结算环节。 */
const PRIMITIVES = Object.freeze([
  'directAttack', 'partitionedAttack', 'channeledAttack', 'areaAttack', 'conditionalControl',
  'controlContest', 'debuffContest', 'numericDebuff', 'gaugeLoss', 'addShield', 'reduceOuterShield',
  'heal', 'statUp', 'battleStatUp', 'attackUp', 'hpCost', 'charge', 'evasion', 'phaseAvoid',
  'oneHitReduction', 'reserveEnergy', 'hitRelease', 'accuracyBuff', 'castMultiplier', 'lamps',
  'transferDebuff', 'hitContestOnce'
]);

const OPS = Object.freeze({
  next_attack_skill_accuracy: { primitive: 'accuracyBuff', build: (op) => ({ points: op.points, uses: op.uses, ttlSeconds: op.ttlSeconds }) },
  next_attack_skill_cast_multiplier: { primitive: 'castMultiplier', build: (op) => ({ value: op.value, sharedUse: !!op.sharedUse }) },
  one_hit_damage_reduction: { primitive: 'oneHitReduction', build: (op) => ({ value: op.value, channels: op.channels, ttlSeconds: op.ttlSeconds, directOnly: !!op.directOnly }) },
  control_contest: { primitive: 'controlContest', build: (op) => ({ baseSeconds: op.baseSeconds, ratio: op.ratio, interrupt: !!op.interrupt, gaugeCeiling: op.gaugeCeiling, immunitySeconds: op.immunitySeconds, deepDarkEligible: op.deepDarkEligible !== false }) },
  shield: { primitive: 'addShield', build: (op) => ({ coefficient: op.coefficient, power: op.power, ttlSeconds: op.ttlSeconds }) },
  reserve_absorbed_energy: { primitive: 'reserveEnergy', build: (op) => ({ rate: op.rate, capMaxHP: op.capMaxHP, ttlSeconds: op.ttlSeconds, slots: op.slots }) },
  next_attack_skill_hit_release: { primitive: 'hitRelease', build: (op) => ({ channel: op.channel, mitigated: !!op.mitigated }) },
  phase_avoid_once: { primitive: 'phaseAvoid', build: (op) => ({ channels: op.channels, ttlSeconds: op.ttlSeconds, directOnly: !!op.directOnly, breakOnOffense: !!op.breakOnOffense }) },
  direct_attack: { primitive: 'directAttack', build: (op) => ({ channel: op.channel, factor: op.factor, accuracyPoints: op.accuracyPoints || 0, reuseHit: !!op.reuseHit }) },
  temporary_stat_up: { primitive: 'statUp', build: (op) => ({ values: op.values, ttlSeconds: op.ttlSeconds, refreshOnly: !!op.refreshOnly, refillResources: !!op.refillResources }) },
  hit_contest_once: { primitive: 'hitContestOnce', build: () => ({}) },
  reduce_outer_life_shield: { primitive: 'reduceOuterShield', build: (op) => ({ coefficient: op.coefficient, power: op.power, layers: op.layers, damageIfNoShield: op.damageIfNoShield || 0 }) },
  debuff_contest: { primitive: 'debuffContest', build: (op) => ({ perTarget: !!op.perTarget, once: !!op.once }) },
  delayed_three_lamps: { primitive: 'lamps', build: (op) => ({ targetId: null, intervalSeconds: op.intervalSeconds, lamps: op.lamps, timeoutSeconds: op.timeoutSeconds, pauseOnOwnerControl: !!op.pauseOnOwnerControl, dispelEligible: !!op.dispelEligible, removeIncompleteOnOwnerDefeat: !!op.removeIncompleteOnOwnerDefeat, slotsPerTarget: op.slotsPerTarget }) },
  numeric_debuff: { primitive: 'numericDebuff', build: (op, ctx) => numericDebuffPayload(op, ctx) },
  transfer_one_dispellable_numeric_debuff: { primitive: 'transferDebuff', build: (op) => ({ exclude: op.exclude, receiver: op.receiver, magnitudeMultiplier: op.magnitudeMultiplier, keepSource: !!op.keepSource, keepRemainingTime: !!op.keepRemainingTime, lifetime: op.lifetime, keepStacks: !!op.keepStacks, capacity: op.capacity, reapplyAmplifier: !!op.reapplyAmplifier }) },
  battle_stat_up: { primitive: 'battleStatUp', build: (op) => ({ values: op.values, lifetime: op.lifetime, sameSourcePolicy: op.sameSourcePolicy, refillResources: !!op.refillResources }) },
  battle_attack_up: { primitive: 'attackUp', build: (op) => ({ channel: op.channel, value: op.value, lifetime: op.lifetime, sameSourcePolicy: op.sameSourcePolicy, extraActions: op.extraActions || 0 }) },
  partitioned_attack: { primitive: 'partitionedAttack', build: (op) => ({ channel: op.channel, factor: op.factor, parts: op.parts, hitPolicy: op.hitPolicy, sharedCast: !!op.sharedCast, sharedRuneActivation: !!op.sharedRuneActivation }) },
  conditional_control_contest: { primitive: 'conditionalControl', build: (op) => ({ condition: op.condition, baseSeconds: op.baseSeconds, immunitySeconds: op.immunitySeconds, interrupt: !!op.interrupt }) },
  hp_cost: { primitive: 'hpCost', build: (op) => ({ maxHPRate: op.maxHPRate, mustRemainAlive: !!op.mustRemainAlive, countsAsDamage: !!op.countsAsDamage }) },
  charged_attack_modifier: { primitive: 'charge', build: (op) => ({ rawMultiplier: op.rawMultiplier, charges: op.charges, maxCharges: op.maxCharges, lifetime: op.lifetime, recastPolicy: op.recastPolicy, consumePerCast: op.consumePerCast, applyToMainAttackOnly: !!op.applyToMainAttackOnly }) },
  channeled_partitioned_attack: { primitive: 'channeledAttack', build: (op) => ({ channel: op.channel, factor: op.factor, parts: op.parts, intervalSeconds: op.intervalSeconds, hitPolicy: op.hitPolicy, interruptible: !!op.interruptible, blockOtherActions: !!op.blockOtherActions, sharedRuneActivation: !!op.sharedRuneActivation, unexecutedParts: op.unexecutedParts }) },
  one_use_evasion: { primitive: 'evasion', build: (op) => ({ incomingHitPoints: op.incomingHitPoints, uses: op.uses, lifetime: op.lifetime, channels: op.channels, directOnly: !!op.directOnly, consumeOnHitAttempt: !!op.consumeOnHitAttempt, ignoreAgainst: op.ignoreAgainst, maxStoredUses: op.maxStoredUses }) },
  budgeted_area_attack: { primitive: 'areaAttack', build: (op) => ({ channel: op.channel, factor: op.factor, totalBudgetFixed: !!op.totalBudgetFixed, splitPolicy: op.splitPolicy, hitPolicy: op.hitPolicy, missedShares: op.missedShares, sharedRuneActivation: !!op.sharedRuneActivation }) }
});

function numericDebuffPayload(op, ctx) {
  const values = { ...op.values };
  const multipliers = {};
  if (ctx && ctx.npcId === 'xutaiping' && ctx.traitState) {
    for (const field of Object.keys(values)) {
      if (!Object.prototype.hasOwnProperty.call(xutaiping.constants.CAPS, field)) continue;
      if (op.amplifierSnapshot === 'none') continue;
      const amplified = xutaiping.amplify(ctx.traitState, {
        targetId: ctx.targetId,
        field,
        baseValue: values[field],
        snapshotAt: op.amplifierSnapshot === 'curse_resolution_before_group' ? ctx.at : ctx.castStartedAt
      });
      values[field] = amplified.value;
      multipliers[field] = amplified.multiplier;
    }
  }
  return {
    values,
    multipliers,
    lifetime: op.lifetime || 'battle',
    sameSourcePolicy: op.sameSourcePolicy,
    paidSoulSkillsOnly: !!op.paidSoulSkillsOnly,
    instant: !!op.instant,
    onlyBeforeCast: !!op.onlyBeforeCast,
    floor: op.floor,
    oncePerCast: !!op.oncePerCast,
    trigger: op.trigger,
    damageSources: op.damageSources,
    amplifierSnapshot: op.amplifierSnapshot
  };
}

/** 把名录技能转成宿主可读结构；不删 operations，另存为 npcOperations 以便逐步实现。 */
function toEngineSkill(definition, skill, index) {
  if (!skill || typeof skill.category !== 'string') throw new Error(definition.id + ' 的第' + (index + 1) + '技能缺少类别');
  for (const key of ['cost', 'cast', 'cooldown']) if (!Number.isFinite(skill[key])) throw new Error(definition.id + ' 技能「' + skill.name + '」缺少' + key);
  return tagSkill({
    id: skill.id || definition.id + '-skill-' + (index + 1),
    name: skill.name,
    ring: skill.ring || index + 1,
    years: skill.years,
    category: skill.category,
    channel: skill.channel,
    target: skill.target,
    Q: skill.Q,
    q: skill.q,
    K: skill.K,
    factor: skill.factor,
    budgetFactor: skill.budgetFactor,
    cost: skill.cost,
    costPercent: skill.costPercent,
    cast: skill.cast,
    cooldown: skill.cooldown,
    baseControl: skill.baseControl,
    role: skill.role,
    effect: skill.effect,
    npcOperations: clone(skill.operations || []),
    source: { registry: '友方npc', npcId: definition.id }
  }, definition.soul);
}

function buildUnit(input) {
  const { definition, id, team } = input;
  if (!definition || !definition.id) throw new Error('缺少友方NPC名录定义');
  if (typeof id !== 'string' || !id) throw new Error('NPC战斗单位缺少ID');
  if (!definition.model || !definition.model.derived) throw new Error('NPC缺少实际面板，不能参战');
  if (!Array.isArray(definition.skills) || definition.skills.length !== 8) throw new Error('NPC应有八个魂技');
  const skills = definition.skills.map((skill, index) => toEngineSkill(definition, skill, index));
  const progress = input.permanentProgress || definition.permanentProgress || {};
  const thiefQi = Math.max(0, Math.min(10, Number(progress.thiefQiStacks) || 0));
  return {
    id,
    npcId: definition.id,
    name: definition.name,
    team,
    level: definition.level,
    soul: clone(definition.soul),
    style: definition.style,
    release: definition.release,
    model: clone(definition.model),
    skills,
    traits: clone(definition.traits),
    // 永久盗气只在构建时给一次肉体强度倍率；不写回模型、不每次参战重复加算、不用于展示评级。
    permanentProgress: clone(progress),
    bodyMultiplier: 1 + 0.1 * thiefQi,
    bodyMultiplierApplied: false,
    source: '友方npc',
    levelScaling: 'fixed',
    adapterVersion: VERSIONS.npcCombatAdapter
  };
}

/**
 * 执行一次NPC技能：按 operations 顺序调用宿主原语。
 * ctx: { npcId, traitState, targetId, castStartedAt, at }
 */
function runSkill(input) {
  const { unit, skill, host } = input;
  if (!unit || !skill) throw new Error('执行NPC技能缺少单位或技能');
  if (!host) throw new Error('执行NPC技能缺少战斗宿主');
  // 先整体检查，避免前半招已经扣血，后半招才因缺处理器抛错。
  for (const op of skill.npcOperations || []) {
    const executor = OPS[op.type];
    if (!executor) throw new Error('未实现的技能操作：' + op.type);
    if (typeof host[executor.primitive] !== 'function') throw new Error('宿主缺少战斗原语 ' + executor.primitive);
  }
  const ctx = { npcId: unit.npcId, traitState: input.traitState, targetId: input.targetId, castStartedAt: input.castStartedAt, at: input.at };
  const calls = [];
  for (const op of skill.npcOperations || []) {
    const executor = OPS[op.type];
    if (!executor) throw new Error('未实现的技能操作：' + op.type + '（技能「' + skill.name + '」）');
    const primitive = executor.primitive;
    if (typeof host[primitive] !== 'function') throw new Error('宿主缺少战斗原语 ' + primitive + '，不能真正执行「' + skill.name + '」的 ' + op.type);
    const payload = executor.build(op, ctx);
    const tagged = tagSkill(skill, unit.soul);
    payload.attribute = tagged.attribute;
    payload.elements = tagged.elements;
    payload.attributeTags = tagged.attributeTags;
    if (payload.targetId === null) payload.targetId = ctx.targetId;
    const result = host[primitive](payload);
    calls.push({ type: op.type, primitive, payload, result: result === undefined ? null : result });
  }
  return { skill: skill.name, calls };
}

function coverage() {
  return Object.keys(OPS).map((type) => ({ type, primitive: OPS[type].primitive, implemented: true }));
}

/** 正式讨伐前的显式就绪报告；缺原语或技能操作缺失就返回 ready:false。 */
function assertCombatReady(definition) {
  const missing = [];
  if (!TRAITS[definition && definition.id]) missing.push('trait-adapter-missing');
  if (!definition || !definition.implementation) missing.push('implementation-missing');
  if (definition && definition.implementation && definition.implementation.integrated !== false) missing.push('source-status-mismatch');
  if (definition && (!Array.isArray(definition.skills) || definition.skills.length !== 8)) missing.push('skill-count-mismatch');
  const expected = EXPECTED_TRAITS[definition && definition.id] || [];
  const actual = (definition && definition.traits || []).map((trait) => trait.name);
  for (const name of expected) if (!actual.includes(name)) missing.push('trait-missing:' + name);
  const unimplemented = [];
  for (const skill of (definition && definition.skills) || []) {
    for (const op of skill.operations || []) if (!OPS[op.type]) unimplemented.push(skill.name + ':' + op.type);
  }
  return { ready: missing.length === 0 && unimplemented.length === 0, missing, unimplementedOperations: unimplemented, operationTypes: Object.keys(OPS).length, traits: expected };
}

/** 正式讨伐前检查宿主是否真的提供全部所需原语；缺一项就列出，不靠运行时逐个爆。 */
function assertHostReady(host, definition) {
  if (!host) throw new Error('缺少战斗宿主');
  const missing = new Set();
  if (!definition || !Array.isArray(definition.skills) || !definition.skills.length) missing.add('definition-or-skills-missing');
  for (const skill of (definition && definition.skills) || []) {
    for (const op of skill.operations || []) {
      const executor = OPS[op.type];
      if (!executor) missing.add('operation:' + op.type);
      else if (typeof host[executor.primitive] !== 'function') missing.add('primitive:' + executor.primitive);
    }
  }
  return { ready: missing.size === 0, missing: [...missing] };
}

/** 特性状态机分发：不同NPC的入口不同，这里统一成一个 dispatch。 */
function createTraitRuntime(definition) {
  const trait = TRAITS[definition.id];
  if (!trait) throw new Error('没有该友方NPC的特性适配：' + definition.id);
  let state = trait.createState({ maxHP: definition.model && definition.model.derived && definition.model.derived.HP, permanentProgress: definition.permanentProgress });
  return {
    traitId: trait.id,
    get state() {
      return state;
    },
    dispatch(event) {
      if (trait.id === 'chengliang') {
        const result = trait.handle(state, event);
        state = result.state;
        return result;
      }
      if (trait.id === 'xutaiping') {
        if (event.type === 'turn-start') {
          state = trait.beginTurn(state);
          return { state, effects: [] };
        }
        if (event.type === 'benefit') {
          const result = trait.applyBenefit(state, event);
          state = result.state;
          return result;
        }
        if (event.type === 'debuff-applied') {
          const result = trait.recordDebuff(state, event);
          state = result.state;
          return result;
        }
        if (event.type === 'debuff-removed') {
          state = trait.removeDebuff(state, event);
          return { state, effects: [] };
        }
        if (event.type === 'lamps') {
          const result = trait.applyLamps(state, event);
          state = result.state;
          return result;
        }
        if (event.type === 'tick') {
          const result = trait.tickLamps(state, event);
          state = result.state;
          return result;
        }
        if (event.type === 'defeat') {
          state = trait.onOwnerDefeat(state);
          return { state, effects: [{ op: 'log', text: '徐太平退场：未完成的三灯消散，灯灭层数清除' }] };
        }
        if (event.type === 'battle-end') {
          state = trait.battleEnd();
          return { state, effects: [] };
        }
        return { state, effects: [] };
      }
      if (trait.id === 'sailiya_fengzhi') {
        if (event.type === 'defeat') {
          const result = trait.recordDamage(state, { lethal: true });
          state = result.state;
          return { state, effects: [] };
        }
        if (event.type === 'attack-cast') {
          const result = trait.activateRune(state, event);
          state = result.state;
          return { state, effects: [], activated: result.activated, extraCost: result.extraCost, duplicate: result.duplicate === true };
        }
        if (event.type === 'damage-taken') {
          const result = trait.recordDamage(state, event);
          state = result.state;
          return { state, effects: [], pending: result.pending, sealed: result.sealed };
        }
        if (event.type === 'attack-hit') {
          const active = state.rune.active && (!event.castId || event.castId === state.rune.castId);
          // 这两个值由宿主继续用于本次攻击结算：符剑附伤与抵挡魂力倍耗。
          return {
            state,
            effects: [],
            addOn: active ? trait.runeAddOn(event.mainEffectiveDamage || 0) : 0,
            defenseCost: trait.defenseCostOnHit(event.actualPaidDefenseCost, active)
          };
        }
        if (event.type === 'charge-refill') {
          state = trait.refillCharge(state);
          return { state, effects: [] };
        }
        if (event.type === 'charge-consume') {
          const result = trait.consumeCharge(state, event.isMainAttack !== false);
          state = result.state;
          return { state, effects: [], multiplier: result.multiplier, consumed: result.consumed };
        }
        if (event.type === 'turn-end') {
          const result = trait.endTurn(state, event);
          state = result.state;
          return result;
        }
        if (event.type === 'battle-end') {
          state = trait.battleEnd();
          return { state, effects: [] };
        }
        return { state, effects: [] };
      }
      throw new Error('未支持的特性分发：' + trait.id);
    }
  };
}

/** 把特性算出的效果交给宿主；未知 op 显式报错。 */
function applyEffects(host, unitId, effects) {
  const calls = [];
  for (const effect of effects || []) {
    switch (effect.op) {
      case 'log': calls.push({ op: 'log', result: host.log({ unitId, text: effect.text }) }); break;
      case 'heal': calls.push({ op: 'heal', result: host.heal({ unitId, amount: effect.amount, reason: effect.reason }) }); break;
      case 'permanentProgress': calls.push({ op: 'permanentProgress', result: host.setPermanentProgress({ unitId, key: effect.key, value: effect.value }) }); break;
      case 'bodyBonus': calls.push({ op: 'bodyBonus', result: host.applyBodyBonus({ unitId, perStack: effect.perStack, stacks: effect.stacks }) }); break;
      case 'addStatus': calls.push({ op: 'addStatus', result: host.addStatus({ unitId, targetId: effect.targetId, type: effect.type, value: effect.value, duration: effect.duration, source: effect.source }) }); break;
      case 'halveDuration': calls.push({ op: 'halveDuration', result: host.halveDuration({ unitId, targetId: effect.targetId, factor: effect.factor }) }); break;
      case 'restoreMP': calls.push({ op: 'restoreMP', result: host.restoreMP({ unitId, amount: effect.amount, reason: effect.reason, eventId: effect.eventId }) }); break;
      case 'reject': calls.push({ op: 'reject', result: host.reject && host.reject({ unitId, reason: effect.reason }) }); break;
      default: throw new Error('未知特性效果：' + effect.op);
    }
  }
  return calls;
}

module.exports = { TRAITS, EXPECTED_TRAITS, PRIMITIVES, OPS, toEngineSkill, buildUnit, runSkill, coverage, assertCombatReady, assertHostReady, createTraitRuntime, applyEffects, numericDebuffPayload };

},"/modules/src/npc/roster.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 友方NPC名录（只读封装）。
 *
 * 交接文档第十八节：名录“负责角色定义、名称别名、定稿介绍文本、角色版本；
 * 不直接操作主线事件与玩家奖励”。本模块只读，返回深拷贝，改调用结果不会污染名录。
 * 绑定一律用稳定ID（chengliang / xutaiping / sailiya_fengzhi），显示名与别名只用于查询。
 */

const fs = require('node:fs');
const path = require('node:path');
const { clone, uniqueIds } = require('../util');
const TEXTS = require('../text/hunt-texts.generated');

const DEFAULT_DIR = path.resolve(__dirname, '..', '..', 'data', 'npc');
const REQUIRED_IDS = Object.freeze(['chengliang', 'xutaiping', 'sailiya_fengzhi']);

function createRoster(options = {}) {
  const dir = options.dir || DEFAULT_DIR;
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('名录快照缺少 manifest.json，请先运行 node tools/sync-npc.cjs');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.rosterVersion !== 1) throw new Error('不支持的名录快照版本：' + manifest.rosterVersion);

  const characters = manifest.files.map((entry) => {
    const full = path.join(dir, entry.file);
    if (!fs.existsSync(full)) throw new Error('名录快照缺少文件：' + full);
    const record = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (record.id !== entry.id) throw new Error('名录ID与清单不一致：' + entry.file);
    return record;
  });

  const ids = uniqueIds(characters, '友方NPC名录');
  for (const required of REQUIRED_IDS) {
    if (!ids.includes(required)) throw new Error('名录缺少交接文档列明的角色：' + required);
  }

  const records = new Map(characters.map((character) => [character.id, character]));
  const aliases = new Map();
  for (const character of characters) {
    for (const name of [character.name, ...(character.aliases || [])]) {
      if (aliases.has(name)) throw new Error('名录别名重复：' + name);
      aliases.set(name, character.id);
    }
  }

  function resolve(idOrName) {
    if (typeof idOrName !== 'string' || !idOrName) throw new Error('友方NPC查询须为稳定ID或名称');
    const id = aliases.get(idOrName) || idOrName;
    if (!records.has(id)) throw new Error('友方NPC不存在：' + idOrName);
    return id;
  }

  function get(idOrName) {
    return clone(records.get(resolve(idOrName)));
  }

  function list() {
    return characters.map((character) => ({
      id: character.id,
      name: character.name,
      aliases: [...(character.aliases || [])],
      nationality: character.nationality,
      level: character.level,
      rating: character.rating,
      soul: character.soul.name,
      role: character.role,
      integrated: character.implementation.integrated,
      arrivalTextAvailable: Array.isArray(TEXTS.arrivals[character.id])
    }));
  }

  function eventReference(idOrName) {
    const character = get(idOrName);
    return {
      registry: '友方npc',
      schemaVersion: character.schemaVersion,
      npcId: character.id,
      moduleVersion: manifest.rosterVersion
    };
  }

  function traitDisplay(idOrName) {
    // 交接文档：玩家显示只需要名称和效果，不显示来源、分类或子级标题。
    return get(idOrName).traits.map(({ name, effect }) => ({ name, effect }));
  }

  function arrivalText(idOrName) {
    const character = get(idOrName);
    const paragraphs = TEXTS.arrivals[character.id];
    if (!Array.isArray(paragraphs) || !paragraphs.length) throw new Error('角色缺少定稿到场正文：' + character.id);
    return paragraphs.slice();
  }

  /**
   * 按已保存的顺序拼接到场正文：
   *   0 位 → 无NPC段；1 位 → 该角色两段；2 位 → 依次两组，不合并、不改写、不省略。
   */
  function arrivalParagraphs(npcIds) {
    if (!Array.isArray(npcIds)) throw new Error('到场阵容须为稳定ID数组');
    if (npcIds.length < 0 || npcIds.length > 2) throw new Error('讨伐队伍最多两位友方NPC');
    const resolved = npcIds.map(resolve);
    if (new Set(resolved).size !== resolved.length) throw new Error('到场阵容出现重复角色，别名不构成第二位NPC');
    if (!resolved.length) return TEXTS.noNpc.slice();
    return resolved.flatMap((id) => arrivalText(id));
  }

  function combatSpec(idOrName) {
    const character = get(idOrName);
    return {
      id: character.id,
      name: character.name,
      aliases: character.aliases || [],
      level: character.level,
      rating: character.rating,
      ratingRatio: character.ratingRatio,
      style: character.style,
      role: character.role,
      soul: clone(character.soul),
      release: character.release,
      model: clone(character.model),
      stats: clone(character.model.stats),
      derived: clone(character.model.derived),
      permanentProgress: clone(character.permanentProgress || null),
      skills: clone(character.skills),
      traits: clone(character.traits),
      implementation: clone(character.implementation),
      source: { registry: '友方npc', npcId: character.id, schemaVersion: character.schemaVersion, snapshotVersion: manifest.rosterVersion }
    };
  }

  function aliasesOf(idOrName) {
    const character = get(idOrName);
    return [character.name, ...(character.aliases || [])];
  }

  function summary() {
    return {
      rosterVersion: manifest.rosterVersion,
      copiedFrom: manifest.copiedFrom,
      count: characters.length,
      ids: ids.slice(),
      characters: list()
    };
  }

  return Object.freeze({
    get,
    list,
    eventReference,
    traitDisplay,
    arrivalText,
    arrivalParagraphs,
    combatSpec,
    aliasesOf,
    resolve,
    summary,
    REQUIRED_IDS
  });
}

module.exports = { createRoster, DEFAULT_DIR, REQUIRED_IDS };

},"/modules/src/npc/traits/chengliang.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 程良 · 战斗特性适配（交接文档第十九节重点1）。
 *
 * 数据来自 data/npc/chengliang.json 的 traits / implementation：
 *   - 周天格阵：每有效个人回合开始，敌人各+1层困阵（敏捷−5%/层，上限6），
 *     程良+1层据阵（伤害+10%/层，上限6）；每累计3个有效回合，
 *     先完成本回合叠层，再将双方层数分别减半向下取整；被控时暂停叠层与计数，层数保留。
 *   - 六库仙贼：回合末回复最大生命5%；对“有生命的受击实体”造成实际生命伤害时
 *     吸取30%回血；每累计3次有效吞噬永久+1层盗气（肉体强度+10%/层，上限10，跨战斗保留）。
 *     免疫疲劳以及带衰老、腐坏标签的减益。
 *   - 易中日月：免疫幻象与伪装、锁定真实本体；不计纯敏捷差造成的负向命中修正；
 *     闪避修正后的基础命中下限60%；每回合锁定一名凝视对象，对其命中+8个百分点，
 *     该对象对程良造成的伤害+10%；正向命中合计最高97%，致盲等在保底之后结算，最终最低5%。
 *
 * 这里只维护状态与应发生的效果；真实伤害、护盾、控制仍由主游戏战斗引擎结算。
 * 旧版的每层3%／2%已不复用，本文件按当前定稿的10%／10%实现。
 */

const { clamp, hitChance } = require('./common');

const ID = 'chengliang';
const GRID = Object.freeze({ maxStacks: 6, agilityDownPerStack: 0.05, damageUpPerStack: 0.1, period: 3 });
const REGEN = Object.freeze({ endTurnMaxHPRate: 0.05, endTurnMaxMPRate: 0.05, lifestealRate: 0.3, eventsPerPermanentStack: 3, bodyUpPerPermanentStack: 0.1, maximumPermanentStacks: 10, immuneTags: ['fatigue', 'aging', 'decay'] });
const VISION = Object.freeze({ ignoreIllusion: true, ignoreDisguise: true, selectRealBody: true, ignoreNegativeAgilityDifference: true, preDebuffHitFloor: 0.6, gazeHitPoints: 8, gazeIncomingDamageMultiplier: 1.1, hitCap: 0.97, postDebuffHitFloor: 0.05 });

function createState(input = {}) {
  return {
    id: ID,
    grid: { self: 0, enemies: Object.create(null), turns: 0, paused: false, defeated: false, cleared: false },
    regen: {
      devourEvents: 0,
      thiefQi: clamp(input.permanentProgress && input.permanentProgress.thiefQiStacks || 0, 0, REGEN.maximumPermanentStacks)
    },
    vision: { gazeTargetId: null, gazePicked: false },
    maxHP: input.maxHP
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function halveGrid(state) {
  const next = cloneState(state);
  next.grid.self = Math.floor(next.grid.self / 2);
  for (const key of Object.keys(next.grid.enemies)) next.grid.enemies[key] = Math.floor(next.grid.enemies[key] / 2);
  return next;
}

function handle(state, event) {
  const next = cloneState(state);
  const effects = [];
  switch (event.type) {
    case 'turn-start': {
      next.vision.gazePicked = false;
      if (next.grid.defeated) break;
      if (event.controlled) {
        next.grid.paused = true;
        effects.push({ op: 'log', text: '周天格阵：程良被控制，暂停叠层与周期计数，已有层数保留' });
        break;
      }
      next.grid.paused = false;
      next.grid.self = Math.min(GRID.maxStacks, next.grid.self + 1);
      for (const enemyId of event.livingEnemyIds || []) {
        next.grid.enemies[enemyId] = Math.min(GRID.maxStacks, (next.grid.enemies[enemyId] || 0) + 1);
      }
      next.grid.turns++;
      if (next.grid.turns % GRID.period === 0) {
        const before = { self: next.grid.self, enemies: { ...next.grid.enemies } };
        const halved = halveGrid(next);
        next.grid.self = halved.grid.self;
        next.grid.enemies = halved.grid.enemies;
        effects.push({ op: 'log', text: '周天格阵第' + next.grid.turns + '回合：叠层后减半（据阵' + before.self + '→' + next.grid.self + '）' });
      }
      break;
    }
    case 'turn-end': {
      if (event.dead || next.grid.defeated) break;
      const missing = Math.max(0, (event.maxHP || next.maxHP || 0) - (event.hp || 0));
      const amount = Math.min(Math.round((event.maxHP || next.maxHP || 0) * REGEN.endTurnMaxHPRate), missing);
      if (amount > 0) effects.push({ op: 'heal', amount, reason: '六库仙贼·回合末' });
      const mana = Math.min(Math.round((event.maxMP || 0) * REGEN.endTurnMaxMPRate), Math.max(0, (event.maxMP || 0) - (event.mp || 0)));
      if (mana > 0) effects.push({ op: 'restoreMP', amount: mana, reason: '六库仙贼·回合末5%' });
      break;
    }
    case 'damage-dealt': {
      if (next.grid.defeated) break;
      const target = event.target || {};
      const living = target.lifeType === '生活' || target.lifeType === 'living';
      const actual = Number(event.actualHP) || 0;
      if (!living || actual <= 0) break;
      effects.push({ op: 'heal', amount: Math.round(actual * REGEN.lifestealRate), reason: '六库仙贼·吸血' });
      next.regen.devourEvents++;
      if (next.regen.devourEvents % REGEN.eventsPerPermanentStack === 0 && next.regen.thiefQi < REGEN.maximumPermanentStacks) {
        next.regen.thiefQi++;
        effects.push({ op: 'permanentProgress', key: 'thiefQiStacks', value: next.regen.thiefQi });
        effects.push({ op: 'bodyBonus', perStack: REGEN.bodyUpPerPermanentStack, stacks: next.regen.thiefQi });
      }
      break;
    }
    case 'gaze-select': {
      if (next.vision.gazePicked) {
        effects.push({ op: 'reject', reason: '凝视每回合至多选择一次' });
        break;
      }
      next.vision.gazeTargetId = event.targetId;
      next.vision.gazePicked = true;
      effects.push({ op: 'log', text: '易中日月：锁定凝视对象 ' + event.targetId + '，本回合对其命中+8个百分点' });
      break;
    }
    case 'defeat': {
      next.grid.defeated = true;
      next.grid.self = 0;
      next.grid.enemies = Object.create(null);
      effects.push({ op: 'log', text: '程良退场：清除周天格阵状态' });
      break;
    }
    case 'battle-end': {
      next.grid = { self: 0, enemies: Object.create(null), turns: 0, paused: false, defeated: false, cleared: true };
      next.vision.gazeTargetId = null;
      break;
    }
    default:
      break;
  }
  return { state: next, effects };
}

function modifiers(state) {
  const agilityMultipliers = {};
  for (const [enemyId, stacks] of Object.entries(state.grid.enemies)) agilityMultipliers[enemyId] = 1 - GRID.agilityDownPerStack * stacks;
  return {
    damageMultiplier: 1 + GRID.damageUpPerStack * state.grid.self,
    agilityMultipliers,
    bodyMultiplier: 1 + REGEN.bodyUpPerPermanentStack * state.regen.thiefQi,
    gazeTargetId: state.vision.gazeTargetId,
    gazeIncomingDamageMultiplier: state.vision.gazeTargetId ? VISION.gazeIncomingDamageMultiplier : 1,
    immuneTags: REGEN.immuneTags.slice()
  };
}

function hit(state, input) {
  return hitChance(state.vision, input, VISION);
}

const trait = Object.freeze({ id: ID, traits: ['周天格阵', '六库仙贼', '易中日月'], requiredEvents: ['turn-start', 'turn-end', 'damage-dealt', 'gaze-select', 'defeat', 'battle-end', 'hit-query'], createState, handle, modifiers, hit, constants: { GRID, REGEN, VISION } });

module.exports = trait;

},"/modules/src/npc/traits/common.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 友方NPC特性适配的共用小工具。
 *
 * 说明：这些处理器只计算“应该发生什么”，通过 effect 列表交给拼接层映射到
 * 现有战斗引擎的真实事件（受伤、护盾、控制、回魂、行动起止、个人回合）。
 * 不在这里另写伤害公式；数值基数由名录中的实际面板与技能给出。
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round3(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/**
 * 命中率换算。程良“易中日月”与赛利亚“秘元归宿体”的感知条款共用此函数，
 * 区别由 config 决定是否忽略敏捷差、是否可锁隐形/虚化。
 */
function hitChance(state, input, config) {
  if (!Number.isFinite(input.base)) throw new Error('命中率基数无效');
  let base = clamp(input.base, 0, 1);
  const agilityDiff = input.agilityDiff || 0;
  if (!(config.ignoreNegativeAgilityDifference && agilityDiff < 0)) base += agilityDiff;
  if (input.concealmentPenalty) {
    if (!config.ignoreConcealmentPenalty) base -= input.concealmentPenalty;
  }
  if (input.targetHidden && !config.canSelectHidden) base = 0;
  // 闪避修正后的基础命中下限先结算；凝视的+8个百分点加在保底之后。
  base = Math.max(base, config.preDebuffHitFloor || 0);
  if (state.gazeTargetId && input.targetId === state.gazeTargetId && config.gazeHitPoints) {
    base += config.gazeHitPoints / 100;
  }
  base = Math.min(base, config.hitCap || 0.97);
  if (input.debuffPenalty) base -= input.debuffPenalty;
  base = Math.max(base, config.postDebuffHitFloor || 0.05);
  return { chance: round3(base), cap: config.hitCap, floor: config.postDebuffHitFloor, gaze: input.targetId === state.gazeTargetId };
}

function immunityList(config) {
  return (config.immuneTags || []).slice();
}

module.exports = { clamp, round3, hitChance, immunityList };

},"/modules/src/npc/traits/sailiya.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 赛利亚·风织 · 战斗特性适配（交接文档第十九节重点3、4）。
 *
 * 数据来自 data/npc/sailiya_fengzhi.json 的 traits / implementation：
 *   - 承露符锋：每次普通攻击或攻击魂技，可在正常费用外再付“本次实际魂力费用的50%”
 *     （向上取整），为整次攻击附加一次符剑；附伤基数为各主攻击段进入护盾与承伤分配前的
 *     有效生命伤害的30%，自动选目标元素抗性最低的一项，再结算抗性/护盾/承伤；
 *     主攻击已结算的普通防御不重复扣。多段、群攻共享一次选择与费用。
 *     被该次攻击命中的目标若实际消耗魂力抵挡，本次抵挡魂力费用翻倍；
 *     预先付费护盾不追溯，免费护盾/纯肉体/绝对免伤不凭空产生费用。
 *   - 秘元归宿体：魂力上限+50%（只作用一次，baseMP仍为费用基数）；每人回合末回复
 *     有效最大魂力5%；自上次回合末以来真实受到的生命/精神护持伤害20%凝为秘元，
 *     本次回合末等量回魂；护盾损失、过量伤害、生命费用、自伤不计；
 *     被带封锁/禁绝标签的效果命中则本周期不凝结、待凝量清零；
 *     致命后退场，不再执行回合末回魂。5%与20%分别发出回复事件。
 *   - 感知：不受隐匿与目标高速造成的命中惩罚，可锁隐形/虚化目标，但仍受正常命中判定。
 */

const { clamp, round3, hitChance } = require('./common');

const ID = 'sailiya_fengzhi';
const RUNE = Object.freeze({ extraCostRate: 0.5, extraCostRounding: 'ceil', damageRate: 0.3, activationUnit: 'one_basic_or_one_skill_cast', defenseResourceCostMultiplier: 2, multiplyCostOnlyOnce: true, noRetroactiveShieldCastFees: true });
const SECRET = Object.freeze({ maxMPMultiplier: 1.5, endTurnMPRecoveryRate: 0.05, damageToMPRecoveryRate: 0.2, sealTags: ['resource_seal', 'resource_prohibition'], revives: false });
const CHARGE = Object.freeze({ multiplier: 1.15, maxCharges: 3, consumePerCast: 1, applyToMainAttackOnly: true });
const PERCEPTION = Object.freeze({ ignoreConcealmentPenalty: true, ignoreNegativeAgilityDifference: true, canSelectHidden: true, canSelectPhased: true, bypassHitRoll: false, hitCap: 0.97, postDebuffHitFloor: 0.05 });

function createState() {
  return {
    id: ID,
    rune: { active: false, castId: null, mainCost: 0, extraCost: 0 },
    secretOrigin: { pending: 0, sealed: false, lethal: false },
    charge: { charges: 0, multiplier: CHARGE.multiplier },
    maxMP: null,
    baseMP: null
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/** 符剑附加费：本次实际主攻击费用的50%，向上取整；0费攻击的附加费为0。 */
function runeExtraCost(paidMainCost) {
  const cost = Number(paidMainCost);
  if (!Number.isFinite(cost) || cost < 0) throw new Error('符剑附加费基数无效');
  return Math.ceil(cost * RUNE.extraCostRate);
}

/**
 * 开启一次符剑（整次施放只付一次）。魂力不足时不附加，但可只施放原攻击。
 * input: { castId, paidMainCost, mpAvailable }
 */
function activateRune(state, input) {
  const next = cloneState(state);
  if (input.castId && input.castId === next.rune.castId) return { state: next, activated: next.rune.active, extraCost: 0, duplicate: true };
  const extraCost = runeExtraCost(input.paidMainCost);
  if (input.enabled === false || extraCost > input.mpAvailable) {
    next.rune = { active: false, castId: input.castId || null, mainCost: input.paidMainCost, extraCost, reason: '魂力不足，未附加符剑' };
    return { state: next, activated: false, extraCost };
  }
  next.rune = { active: true, castId: input.castId || null, mainCost: input.paidMainCost, extraCost };
  return { state: next, activated: true, extraCost };
}

/** 附伤原始值：主攻击有效生命伤害的30%。削盾段不计入基数。 */
function runeAddOn(mainEffectiveDamage) {
  const damage = Number(mainEffectiveDamage);
  if (!Number.isFinite(damage) || damage < 0) throw new Error('符剑附伤基数无效');
  return Math.round(damage * RUNE.damageRate);
}

/** 实际抵挡魂力的倍耗：只在命中当时实际支付的防御魂力上翻倍，不追溯预先付费护盾。 */
function defenseCostOnHit(actualPaidDefenseCost, runeActive) {
  const cost = Number(actualPaidDefenseCost) || 0;
  if (cost <= 0) return 0;
  return runeActive ? cost * RUNE.defenseResourceCostMultiplier : cost;
}

/** 魂力上限提高50%。传入的是引擎已算出的上限（已含资源系数），只在其上再乘一次。 */
function effectiveMaxMP(engineMP) {
  return Math.round(engineMP * SECRET.maxMPMultiplier);
}

function onCast(state, input) {
  const next = cloneState(state);
  if (input.baseMP !== undefined) next.baseMP = input.baseMP;
  if (input.engineMP !== undefined) next.maxMP = effectiveMaxMP(input.engineMP);
  return next;
}

/** 受伤凝元：只累计真实生命/精神护持伤害；护盾损失、过量伤害、生命费用、自伤不计。 */
function recordDamage(state, input) {
  const next = cloneState(state);
  if (input.lethal) {
    next.secretOrigin.lethal = true;
    next.secretOrigin.pending = 0;
    return { state: next, pending: 0, sealed: next.secretOrigin.sealed };
  }
  const tags = input.tags || [];
  if (tags.some((tag) => SECRET.sealTags.includes(tag))) {
    next.secretOrigin.sealed = true;
    next.secretOrigin.pending = 0;
    return { state: next, pending: 0, sealed: true };
  }
  const realHP = Number(input.realHP) || 0;
  const realSH = Number(input.realSH) || 0;
  if (next.secretOrigin.sealed || next.secretOrigin.lethal || input.selfDamage === true || input.hpCost === true) return { state: next, pending: next.secretOrigin.pending, gained: 0, sealed: next.secretOrigin.sealed };
  const gained = (realHP + realSH) * SECRET.damageToMPRecoveryRate;
  next.secretOrigin.pending = next.secretOrigin.pending + gained;
  next.secretOrigin.sealed = false;
  return { state: next, pending: next.secretOrigin.pending, gained, sealed: false };
}

/**
 * 回合末：先回复有效最大魂力5%，再把本周期凝元等量回魂；两个独立回复事件。
 * 致死后退场，不执行任何回合末回魂。
 */
function endTurn(state, input) {
  const next = cloneState(state);
  const effects = [];
  if (input.lethal || next.secretOrigin.lethal) {
    next.secretOrigin.pending = 0;
    return { state: next, effects, recovered: 0, reason: 'lethal-no-recovery' };
  }
  const maxMP = input.maxMP === undefined ? next.maxMP : input.maxMP;
  if (!Number.isFinite(maxMP)) throw new Error('秘元归宿体缺少有效最大魂力');
  const baseRecovery = Math.round(maxMP * SECRET.endTurnMPRecoveryRate);
  effects.push({ op: 'restoreMP', amount: baseRecovery, reason: '秘元归宿体·回合末5%', eventId: 'secret-origin:5%' });
  const pending = Math.round(next.secretOrigin.pending);
  if (pending > 0) effects.push({ op: 'restoreMP', amount: pending, reason: '秘元归宿体·受伤凝元20%', eventId: 'secret-origin:pending' });
  next.secretOrigin.pending = 0;
  next.secretOrigin.sealed = false;
  return { state: next, effects, recovered: baseRecovery + pending, baseRecovery, pending };
}

/** 化羽华：三次主攻击+15%，每次施放消耗一枚，重复施放只补满不叠层。 */
function refillCharge(state) {
  const next = cloneState(state);
  next.charge.charges = CHARGE.maxCharges;
  return next;
}

function consumeCharge(state, isMainAttack) {
  const next = cloneState(state);
  if (!isMainAttack) return { state: next, multiplier: 1, consumed: false };
  if (next.charge.charges <= 0) return { state: next, multiplier: 1, consumed: false };
  next.charge.charges--;
  return { state: next, multiplier: CHARGE.multiplier, consumed: true };
}

function hit(state, input) {
  return hitChance(state, input, PERCEPTION);
}

function onHit(state, input) {
  return { defenseCost: defenseCostOnHit(input.actualPaidDefenseCost, state.rune.active), multiplier: RUNE.defenseResourceCostMultiplier };
}

function battleEnd() {
  return createState();
}

function modifiers(state) {
  return {
    runeActive: state.rune.active,
    runeExtraCostRate: RUNE.extraCostRate,
    runeDamageRate: RUNE.damageRate,
    defenseCostMultiplier: RUNE.defenseResourceCostMultiplier,
    maxMPMultiplier: SECRET.maxMPMultiplier,
    chargeCharges: state.charge.charges,
    chargeMultiplier: state.charge.multiplier,
    immuneTags: []
  };
}

const trait = Object.freeze({
  id: ID,
  traits: ['承露符锋', '秘元归宿体'],
  requiredEvents: ['attack-cast', 'attack-hit', 'damage-taken', 'turn-end', 'defeat', 'battle-end', 'hit-query'],
  createState,
  runeExtraCost,
  activateRune,
  runeAddOn,
  defenseCostOnHit,
  effectiveMaxMP,
  onCast,
  recordDamage,
  endTurn,
  refillCharge,
  consumeCharge,
  hit,
  onHit,
  battleEnd,
  modifiers,
  constants: { RUNE, SECRET, CHARGE, PERCEPTION }
});

module.exports = trait;

},"/modules/src/npc/traits/xutaiping.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 徐太平 · 战斗特性适配（交接文档第十九节重点2）。
 *
 * 数据来自 data/npc/xutaiping.json 的 traits / implementation：
 *   - 深暗：她施加的数值削弱幅度提高50%；同一目标已带有她一项生效削弱时改为80%。
 *     两档互相替代、不连续相乘；只加幅度，不加持续时间、层数上限、控制时长或成功率。
 *     三灯、灯灭计数与她自身承接的减益不用于升级增幅档。
 *   - 灯灭：每个个人回合，对每名敌方目标第一次真正获得的增益/治疗/护盾/回魂进行压制：
 *     数值幅度或回复量减半，并为该目标积1层；达到3层后，该目标下一次可被压制的正向效果
 *     完全失效，随后清空层数。每回合每目标最多压制一次；同一次施放的多项正向效果合并只计一次。
 *   - 黑蚀三灯：3盏，每2秒熄灭一盏，全部熄灭时诅咒落下：敏捷−20%、造成伤害−15%，
 *     持续至战斗结束；受控时暂停灌注；12秒未完成则散去；同一目标只保留一组。
 *
 * 数值削弱统一持续整场，不按秒自动到期；可净化的仍可解除，同来源重施不叠层。
 */

const { clamp, round3 } = require('./common');

const ID = 'xutaiping';
const DEEP_DARK = Object.freeze({ normalMultiplier: 1.5, coveredMultiplier: 1.8, stackMultipliers: false });
const CAPS = Object.freeze({ agilityDown: 0.9, damageDown: 0.9, defDown: 1, mindDown: 1, skillCostUp: 1, gaugeLoss: 0.9, allyVulnerability: 0.6 });
const IGNORE_MARKERS = Object.freeze(['black_erosion_lamps', 'lamp_out_stacks', 'transferred_debuff']);
const LAMP_OUT = Object.freeze({ maxStacks: 3, normalMultiplier: 0.5, fullStacksMultiplier: 0, usesPerTargetPerOwnerTurn: 1, ownerDefeatRemoves: true });
const BLACK_EROSION = Object.freeze({ lamps: 3, intervalSeconds: 2, timeoutSeconds: 12, pauseWhileControlled: true });

function createState(input = {}) {
  return {
    id: ID,
    deepDark: { debuffs: Object.create(null) },
    lampOut: { stacks: Object.create(null), budget: Object.create(null), defeated: false },
    blackErosion: { groups: Object.create(null), controlled: false }
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * 深暗增幅。input: { targetId, field, baseValue, snapshotAt }
 * snapshotAt 为本次施放开始时间；只有此前已生效、且属于她自己的数值削弱才升级到1.8倍。
 */
function amplify(state, input) {
  const field = input.field;
  if (!Object.prototype.hasOwnProperty.call(CAPS, field)) throw new Error('深暗不适用于该字段：' + field);
  const entries = state.deepDark.debuffs[input.targetId] || [];
  const snapshotAt = input.snapshotAt === undefined ? Infinity : input.snapshotAt;
  const covered = entries.some((entry) => entry && entry.active !== false && entry.field && !IGNORE_MARKERS.includes(entry.field) && (entry.appliedAt === undefined || entry.appliedAt < snapshotAt));
  const multiplier = covered ? DEEP_DARK.coveredMultiplier : DEEP_DARK.normalMultiplier;
  const raw = Number(input.baseValue) * multiplier;
  return { value: round3(Math.min(CAPS[field], raw)), multiplier, covered, cap: CAPS[field], raw: round3(raw) };
}

/** 记录一项由徐太平施加、已生效的数值削弱，供后续深暗判定。 */
function recordDebuff(state, input) {
  const next = cloneState(state);
  const list = next.deepDark.debuffs[input.targetId] || (next.deepDark.debuffs[input.targetId] = []);
  const existing = list.find((entry) => entry && entry.id === input.debuffId);
  if (existing) {
    existing.value = input.value;
    existing.active = true;
    return { state: next, effects: [{ op: 'log', text: '同来源重施只更新幅度，不叠层：' + input.field }] };
  }
  list.push({ id: input.debuffId, field: input.field, value: input.value, appliedAt: input.appliedAt === undefined ? null : input.appliedAt, active: true, source: 'xutaiping' });
  return { state: next, effects: [] };
}

function removeDebuff(state, input) {
  const next = cloneState(state);
  for (const entry of next.deepDark.debuffs[input.targetId] || []) if (entry.id === input.debuffId) entry.active = false;
  return next;
}

/**
 * 灯灭压制一次正向效果。input: { targetId, groupId, kind, value, actualBenefit, durationOnly }
 * 返回 outcome.value（实际生效值）与是否完全失效。
 */
function applyBenefit(state, input) {
  const next = cloneState(state);
  const effects = [];
  const budget = next.lampOut.budget[input.targetId];
  if (next.lampOut.defeated || input.eligible === false || (input.kind && !['buff', 'heal', 'shield', 'mp-restore', 'restoreMP'].includes(input.kind))) {
    return { state: next, effects, outcome: { value: input.value, counted: false, reason: 'ineligible-benefit' } };
  }
  // 同一次施放的多项收益同倍率、只计一层。重复回调不重复累计层数。
  if (budget && input.groupId && budget.groupId === input.groupId) {
    if (input.durationOnly && budget.factor === 0.5) effects.push({ op: 'halveDuration', targetId: input.targetId, factor: 0.5 });
    return { state: next, effects, outcome: { value: budget.factor === 0 ? 0 : input.durationOnly ? input.value : Math.min(input.value, input.actualBenefit === undefined ? input.value : input.actualBenefit) * budget.factor, counted: false, blocked: budget.factor === 0, grouped: true } };
  }
  const actual = Number(input.actualBenefit === undefined ? input.value : input.actualBenefit);
  if (!(actual > 0)) return { state: next, effects, outcome: { value: input.value, counted: false, reason: 'zero-actual-benefit' } };
  if (budget) {
    return { state: next, effects, outcome: { value: input.value, counted: false, reason: 'already-suppressed-this-turn' } };
  }
  const stacks = next.lampOut.stacks[input.targetId] || 0;
  next.lampOut.budget[input.targetId] = { groupId: input.groupId || null, factor: stacks >= LAMP_OUT.maxStacks ? 0 : LAMP_OUT.normalMultiplier };
  if (stacks >= LAMP_OUT.maxStacks) {
    next.lampOut.stacks[input.targetId] = 0;
    effects.push({ op: 'log', text: '灯灭：' + input.targetId + ' 三层封锁，本次正向效果完全失效并清层' });
    return { state: next, effects, outcome: { value: LAMP_OUT.fullStacksMultiplier * input.value, counted: true, blocked: true, stacksAfter: 0 } };
  }
  next.lampOut.stacks[input.targetId] = stacks + 1;
  if (input.durationOnly) effects.push({ op: 'halveDuration', targetId: input.targetId, factor: LAMP_OUT.normalMultiplier });
  effects.push({ op: 'log', text: '灯灭：' + input.targetId + ' 正向效果减半，累计' + (stacks + 1) + '层' });
  return {
    state: next,
    effects,
    outcome: { value: input.durationOnly ? input.value : Math.min(input.value, actual) * LAMP_OUT.normalMultiplier, counted: true, blocked: false, stacksAfter: stacks + 1 }
  };
}

function beginTurn(state) {
  const next = cloneState(state);
  next.lampOut.budget = Object.create(null);
  return next;
}

/** 挂上一组三灯；同一目标只保留一组，重复施放不叠组、不提前引爆。 */
function applyLamps(state, input) {
  const next = cloneState(state);
  const existing = next.blackErosion.groups[input.targetId];
  if (existing && !existing.resolved && !existing.dissipated) {
    return { state: next, effects: [{ op: 'log', text: '同一目标已有一组三灯，重复施放不叠组' }], group: existing };
  }
  const group = { targetId: input.targetId, lamps: BLACK_EROSION.lamps, elapsed: 0, age: 0, resolved: false, dissipated: false, startedAt: input.at === undefined ? null : input.at };
  next.blackErosion.groups[input.targetId] = group;
  return { state: next, effects: [{ op: 'log', text: '黑蚀三灯已布下：' + input.targetId }], group };
}

/**
 * 灌注推进。受控时暂停；每2秒熄一盏；三盏俱灭时按深暗结算诅咒；
 * 满12秒未完成则散去，不产生诅咒。
 */
function tickLamps(state, input) {
  const next = cloneState(state);
  const effects = [];
  const dt = Number(input.dt);
  if (!(dt > 0)) return { state: next, effects };
  next.blackErosion.controlled = input.controlled === true;
  for (const group of Object.values(next.blackErosion.groups)) {
    if (group.resolved || group.dissipated) continue;
    // 墙钟时间用于12秒散标；灌注进度 elapsed 才受“受控暂停”影响。
    const timeLeft = BLACK_EROSION.timeoutSeconds - (group.age || 0);
    const progressLeft = BLACK_EROSION.lamps * BLACK_EROSION.intervalSeconds - group.elapsed;
    const completesBeforeTimeout = !input.controlled && progressLeft <= dt && progressLeft < timeLeft;
    group.age = (group.age || 0) + dt;
    if (!completesBeforeTimeout && group.age >= BLACK_EROSION.timeoutSeconds) {
      group.dissipated = true;
      effects.push({ op: 'log', text: '黑蚀三灯超时散去：' + group.targetId });
      continue;
    }
    if (input.controlled) continue;
    group.elapsed += dt;
    const burned = Math.min(BLACK_EROSION.lamps, Math.floor(group.elapsed / BLACK_EROSION.intervalSeconds));
    group.lamps = Math.max(0, BLACK_EROSION.lamps - burned);
    if (group.lamps === 0 && !group.resolved) {
      group.resolved = true;
      // 同一次施放的多项削弱统一使用结算前的一次判定：先各自增幅，再一起记账。
      const agility = amplify(next, { targetId: group.targetId, field: 'agilityDown', baseValue: 0.2, snapshotAt: input.at });
      const damage = amplify(next, { targetId: group.targetId, field: 'damageDown', baseValue: 0.15, snapshotAt: input.at });
      next.deepDark = recordDebuff(next, { targetId: group.targetId, debuffId: 'black-erosion:' + group.targetId, field: 'agilityDown', value: agility.value, appliedAt: input.at }).state.deepDark;
      next.deepDark = recordDebuff(next, { targetId: group.targetId, debuffId: 'black-erosion-dmg:' + group.targetId, field: 'damageDown', value: damage.value, appliedAt: input.at }).state.deepDark;
      effects.push({ op: 'addStatus', targetId: group.targetId, type: 'agilityDown', value: agility.value, duration: 'battle', source: '徐太平·黑蚀三灯', amplifier: agility.multiplier });
      effects.push({ op: 'addStatus', targetId: group.targetId, type: 'damageDown', value: damage.value, duration: 'battle', source: '徐太平·黑蚀三灯', amplifier: damage.multiplier });
      effects.push({ op: 'log', text: '黑蚀三灯俱灭：' + group.targetId + ' 敏捷−' + Math.round(agility.value * 100) + '%、伤害−' + Math.round(damage.value * 100) + '%' });
    }
  }
  return { state: next, effects };
}

function onOwnerDefeat(state) {
  const next = cloneState(state);
  next.lampOut = { stacks: Object.create(null), budget: Object.create(null), defeated: true };
  for (const group of Object.values(next.blackErosion.groups)) if (!group.resolved) group.dissipated = true;
  return next;
}

function battleEnd(state) {
  return createState();
}

function modifiers(state) {
  return {
    deepDarkMultiplier: DEEP_DARK.normalMultiplier,
    lampOutStacks: { ...state.lampOut.stacks },
    lampOutCap: LAMP_OUT.maxStacks,
    immuneTags: [],
    numericDebuffLifetime: 'battle'
  };
}

const trait = Object.freeze({
  id: ID,
  traits: ['深暗', '灯灭'],
  requiredEvents: ['turn-start', 'benefit', 'tick', 'defeat', 'battle-end', 'debuff-applied', 'debuff-removed'],
  createState,
  amplify,
  recordDebuff,
  removeDebuff,
  applyBenefit,
  beginTurn,
  applyLamps,
  tickLamps,
  onOwnerDefeat,
  battleEnd,
  modifiers,
  constants: { DEEP_DARK, CAPS, LAMP_OUT, BLACK_EROSION, IGNORE_MARKERS }
});

module.exports = trait;

},"/modules/src/reward/inheritance.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 十万年魂骨的特性继承（交接文档第十三节）。
 *
 * 已定：魂兽至少有两个不同的可继承特性，奖励记录锁定这组定义与版本；
 * 继承规则必须同时支持“获得其中之一”和“全部获得”。
 * 初版建议（文档标注为待确认建议）：1d100 为 1—25 → 全部；26—100 → 等概率一条。
 * 若魂兽恰有两条，各单独继承结果概率为37.5%，全部为25%。
 *
 * 继承骰与具体选中项在首胜奖励事务中一次落盘；重开界面、换装备、保存重读不能改为另一条。
 */

const { clone, isPlainObject, requireInteger } = require('../util');
const { VERSIONS } = require('../versions');

const DEFAULT_CONFIG = Object.freeze({
  version: VERSIONS.tenThousandInheritance,
  sides: 100,
  allThreshold: 25,
  suggested: true,
  note: '25%全部、75%一条为交接文档建议值，确认后可改配置而不改存档结构。'
});

function validateTraits(traits) {
  if (!Array.isArray(traits) || traits.length < 2) throw new Error('十万年魂兽至少需要两个不同的可继承特性');
  const ids = traits.map((trait) => trait && trait.id);
  if (ids.some((id) => typeof id !== 'string' || !id)) throw new Error('可继承特性缺少稳定ID');
  if (new Set(ids).size !== ids.length) throw new Error('可继承特性ID重复');
  return ids;
}

function rollInheritance(input) {
  const config = { ...DEFAULT_CONFIG, ...(input.config || {}) };
  requireInteger(config.sides, '继承骰面数', 2, 100000);
  requireInteger(config.allThreshold, '全部继承阈值', 0, config.sides);
  const traits = input.traits;
  const ids = validateTraits(traits);
  if (!input.rng || typeof input.rng.die !== 'function') throw new Error('继承骰须使用游戏确定性投骰器');

  const face = input.rng.die(config.sides, '十万年魂骨特性继承', { beastId: input.beastId || null });
  if (face <= config.allThreshold) {
    return Object.freeze({
      version: config.version,
      configVersion: config.version,
      beastId: input.beastId || null,
      face,
      sides: config.sides,
      mode: 'all',
      selectedTraitIds: ids.slice(),
      probabilityAll: config.allThreshold / config.sides,
      probabilityOne: (config.sides - config.allThreshold) / config.sides,
      frozen: true,
      suggestedConfig: config.suggested
    });
  }
  const pickFace = input.rng.die(ids.length, '十万年魂骨特性继承·单条');
  return Object.freeze({
    version: config.version,
    configVersion: config.version,
    beastId: input.beastId || null,
    face,
    sides: config.sides,
    mode: 'one',
    selectedTraitIds: [ids[pickFace - 1]],
    pick: { sides: ids.length, face: pickFace },
    probabilityAll: config.allThreshold / config.sides,
    probabilityOne: (config.sides - config.allThreshold) / config.sides,
    frozen: true,
    suggestedConfig: config.suggested
  });
}

/** 已验证的继承结果（读档时只用它，不重投）。 */
function validateInheritance(result, traits) {
  if (!isPlainObject(result) || result.frozen !== true) throw new Error('魂骨继承结果未冻结');
  if (result.version !== VERSIONS.tenThousandInheritance) throw new Error('魂骨继承规则版本不一致');
  const ids = validateTraits(traits);
  if (!Array.isArray(result.selectedTraitIds) || !result.selectedTraitIds.length) throw new Error('继承结果缺少选中特性');
  if (!['all', 'one'].includes(result.mode)) throw new Error('继承模式无效');
  if (new Set(result.selectedTraitIds).size !== result.selectedTraitIds.length) throw new Error('继承结果含重复特性');
  if (result.selectedTraitIds.some((id) => !ids.includes(id))) throw new Error('继承结果含魂兽之外的特性');
  if (result.mode === 'all' && result.selectedTraitIds.length !== ids.length) throw new Error('“全部继承”结果不完整');
  if (result.mode === 'one' && result.selectedTraitIds.length !== 1) throw new Error('“获得一条”结果不合法');
  return true;
}

/** 供文档/测试使用的理论分布：每条特性单独被选中的概率。 */
function theoreticalDistribution(count) {
  if (!Number.isInteger(count) || count < 2) throw new Error('特性数量须为≥2的整数');
  const all = DEFAULT_CONFIG.allThreshold / DEFAULT_CONFIG.sides;
  const perOne = (1 - all) / count;
  return { all, perTrait: all + perOne, selectedOnlyPerTrait: perOne, count };
}

module.exports = { DEFAULT_CONFIG, rollInheritance, validateInheritance, validateTraits, theoreticalDistribution };

},"/modules/src/reward/ring.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 十万年魂环生成与第九环落地（交接文档第九、十三、十五节）。
 *
 * 已定：
 *   - 新获得十万年魂环／魂兽成果只开放两个合法入口：本次固定讨伐实际战胜库中魂兽；
 *     原有第九环极端出目，保留其现有生成规则和概率链，不额外放宽。
 *   - 100000年魂环沿用同环两技及共享冷却，且两个魂技都要能正常显示与参战。
 *   - 胜利时不足90级：保存并标记“预留第九环”，不提前装成第八环，也不丢弃；
 *     达到90级且第1—8环齐备、第九环空缺时自动吸收；
 *     中间缺环则保留在队列，不跳过缺环装到错误位置。
 *   - 90级已合法持有第九环时，不再生成第十个魂环。
 *
 * 魂技的实际威力、费用与准备时间由战斗侧 makeSkill 计算，本模块不自造第二套数值。
 */

const { clone, isPlainObject, requireInteger } = require('../util');
const { VERSIONS } = require('../versions');
const { tagSkill } = require('../battle/skill-attributes');

const RING_INDEX = 9;
const YEARS = 100000;
const CAP = 100000;
const CATEGORIES = Object.freeze(['攻击', '强化', '防御', '减益', '控制']);
const ALLOWED_ENTRANCES = Object.freeze(['fixed-hunt', 'legacy-ninth-extreme']);

function assertCharacter(character) {
  if (!isPlainObject(character)) throw new Error('角色数据无效');
  if (!Array.isArray(character.rings)) throw new Error('角色缺少魂环数组');
  if (!isPlainObject(character.stats)) throw new Error('角色缺少实际面板，无法生成魂技');
  if (!isPlainObject(character.soul)) throw new Error('角色缺少武魂数据，无法生成魂技');
  return character;
}

/**
 * @param {object} input {character, seed, rng, makeSkill, pickCategory, transactionId, category, acquiredAt}
 */
function createHundredThousandRing(input) {
  const character = assertCharacter(input.character);
  if (typeof input.seed !== 'string' || !input.seed) throw new Error('十万年魂环须带确定性种子');
  if (!input.rng || typeof input.rng.die !== 'function') throw new Error('十万年魂环须使用游戏确定性投骰器');
  if (typeof input.makeSkill !== 'function') throw new Error('十万年魂环须调用战斗侧 makeSkill，禁止另写一套数值');
  if (typeof input.transactionId !== 'string' || !input.transactionId) throw new Error('十万年魂环须记录奖励事务ID');

  let first = input.category;
  if (!first) {
    first = typeof input.pickCategory === 'function'
      ? input.pickCategory(character.style, input.rng.die(100, '十万年第一魂技类别'))
      : CATEGORIES[0];
  }
  if (!CATEGORIES.includes(first)) first = CATEGORIES[0];
  const remaining = CATEGORIES.filter((category) => category !== first);
  const second = remaining[input.rng.die(remaining.length, '十万年第二魂技类别') - 1];

  const make = (category, variant) => {
    const effectSeed = input.seed + '|event-ring|9|' + variant;
    const skill = input.makeSkill({
      soul: character.soul,
      style: character.style,
      stats: character.stats,
      index: RING_INDEX,
      years: YEARS,
      category,
      variant,
      effectSeed
    });
    return {
      ...tagSkill(skill, character.soul),
      category,
      variant,
      effectSeed,
      ring: RING_INDEX,
      years: YEARS,
      sharedCooldown: 'ring-9',
      guarantee: '同环两技共享冷却'
    };
  };

  const skills = [make(first, 0), make(second, 1)];
  if (skills.length !== 2 || skills[0].category === skills[1].category) throw new Error('十万年魂环必须生成两个不同类别的魂技');
  skills.forEach((skill) => {
    if (skill.sharedCooldown !== 'ring-9') throw new Error('同环两技必须共享冷却');
  });

  const entrance = input.entrance || 'fixed-hunt';
  if (!ALLOWED_ENTRANCES.includes(entrance)) throw new Error('非法十万年来源入口：' + entrance);
  const ring = {
    index: RING_INDEX,
    years: YEARS,
    cap: CAP,
    quality: 100,
    plan: 'hunt',
    band: '十万年',
    q: 4.5,
    skills,
    guarantee: '同环两技共享冷却',
    acquiredAt: input.acquiredAt === undefined ? null : clone(input.acquiredAt),
    source: {
      type: entrance === 'fixed-hunt' ? 'hunt' : 'legacy-ninth-extreme',
      transactionId: input.transactionId,
      generationVersion: VERSIONS.rewardTransaction,
      allowedEntrances: ALLOWED_ENTRANCES.slice(),
      entrance
    }
  };
  assertLegalTenThousandSource(ring);
  return ring;
}

/**
 * 新获得十万年魂环的合法来源校验：
 * 只允许本次固定讨伐，或原有第九环极端出目；普通八环及以前的猎魂、
 * 普通事件随机奖池、武魂特性、临时返还、魂骨生成池都不能混入。
 */
function assertLegalTenThousandSource(ring) {
  if (!isPlainObject(ring) || ring.index !== RING_INDEX || ring.years !== YEARS) throw new Error('不是十万年第九环');
  if (!isPlainObject(ring.source)) throw new Error('十万年魂环缺少来源记录');
  if (!ALLOWED_ENTRANCES.includes(ring.source.entrance)) throw new Error('十万年魂环来源入口非法：' + ring.source.entrance);
  if (!['hunt', 'legacy-ninth-extreme'].includes(ring.source.type)) throw new Error('十万年魂环来源类型非法：' + ring.source.type);
  if (ring.source.entrance === 'fixed-hunt' && (typeof ring.source.transactionId !== 'string' || !ring.source.transactionId)) {
    throw new Error('讨伐来源必须记录奖励事务ID');
  }
  return true;
}

/**
 * 吸收时重算魂技：预留阶段只锁定年限、来源、魂技类别与生成种子；
 * 实际威力、费用与准备预览必须按吸收后当前角色的统一接口重算，不能沿用旧面板的数值。
 */
function rehydrateHundredThousandRing(input) {
  const character = assertCharacter(input.character);
  if (typeof input.makeSkill !== 'function') throw new Error('重算预留魂环须调用战斗侧 makeSkill');
  const ring = input.ring;
  if (!isPlainObject(ring) || ring.index !== RING_INDEX || ring.years !== YEARS) throw new Error('不是十万年第九环');
  if (!Array.isArray(ring.skills) || ring.skills.length !== 2) throw new Error('十万年第九环必须有两个魂技');
  const skills = ring.skills.map((stored, index) => {
    const category = stored.category;
    if (!CATEGORIES.includes(category)) throw new Error('预留魂环的魂技类别无效：' + category);
    const variant = stored.variant === undefined ? index : stored.variant;
    const effectSeed = stored.effectSeed || (input.seed || '') + '|event-ring|9|' + variant;
    const fresh = input.makeSkill({
      soul: character.soul,
      style: character.style,
      stats: character.stats,
      index: RING_INDEX,
      years: YEARS,
      category,
      variant,
      effectSeed
    });
    return {
      ...tagSkill(fresh, character.soul),
      category,
      variant,
      effectSeed,
      ring: RING_INDEX,
      years: YEARS,
      sharedCooldown: 'ring-9',
      guarantee: '同环两技共享冷却'
    };
  });
  return { ...clone(ring), skills };
}

/** 第九环落地：不足90级预留；90级且八环齐备自动吸收；缺环或已九环保持队列。 */
function handleNinthRing(input) {
  const character = assertCharacter(input.character);
  const level = requireInteger(input.level, '等级', 1, 99);
  const ring = input.ring;
  if (!isPlainObject(ring) || ring.index !== RING_INDEX || ring.years !== YEARS) throw new Error('不是十万年第九环');

  assertLegalTenThousandSource(ring);
  if (character.rings.some((item) => item.index === 9) || character.rings.length >= 9) {
    return {
      action: 'already-nine',
      absorbed: false,
      reason: '已合法持有第九环：不覆盖、不生成第十环、不塞第三个技能',
      pendingRing: clone(ring)
    };
  }
  if (level < 90) {
    return { action: 'pre-stored', absorbed: false, reason: '不足90级：预留第九环，不提前装成第八环', pendingRing: clone(ring) };
  }
  const hasAllEight = Array.from({ length: 8 }, (_, i) => character.rings.some((item) => item.index === i + 1)).every(Boolean);
  if (!hasAllEight) {
    return { action: 'queued-gap', absorbed: false, reason: '第1—8环不齐备：保留在队列，不跳过缺环', pendingRing: clone(ring) };
  }
  // 真正吸收时按当前面板重算两技数值；类别与种子沿用预留时锁定的值。
  const finalRing = input.makeSkill ? rehydrateHundredThousandRing({ ring, character, makeSkill: input.makeSkill, seed: input.seed }) : ring;
  character.rings.push(clone(finalRing));
  for (const key of ['preStoredNinthRing', 'pendingNinthRing']) {
    const pending = character[key];
    if (pending && pending.source && ring.source && pending.source.transactionId === ring.source.transactionId) delete character[key];
  }
  return { action: 'absorbed', absorbed: true, reason: '90级且八环齐备、第九环空缺：自动吸收', pendingRing: null };
}

/** 面板/战斗/存档共用的一致性检查：第九环必须是真实已吸收的十万年环。 */
function assertNinthRingConsistency(character) {
  const rings = character.rings || [];
  if (rings.length > 9) throw new Error('出现第十个魂环，超出九环上限');
  if (new Set(rings.map((ring) => ring.index)).size !== rings.length) throw new Error('魂环位置重复');
  const ninth = rings.find((ring) => ring.index === RING_INDEX);
  if (!ninth) return { hasNinth: false, consistent: true };
  if (ninth.years !== YEARS) {
    if (ninth.source && ninth.source.type === 'hunt') throw new Error('第九环不是十万年，不能标记为事件奖励');
    return { hasNinth: true, consistent: true, skillCount: (ninth.skills || []).length, years: ninth.years };
  }
  if (!Array.isArray(ninth.skills) || ninth.skills.length !== 2) throw new Error('十万年第九环必须有两个魂技');
  if (!ninth.skills.every((skill) => skill.sharedCooldown === 'ring-9')) throw new Error('十万年第九环两技未共享冷却');
  if (rings.length > 9) throw new Error('出现第十个魂环，超出九环上限');
  return { hasNinth: true, consistent: true, skillCount: ninth.skills.length, years: ninth.years };
}

module.exports = { RING_INDEX, YEARS, CAP, CATEGORIES, ALLOWED_ENTRANCES, createHundredThousandRing, rehydrateHundredThousandRing, handleNinthRing, assertNinthRingConsistency, assertLegalTenThousandSource };

},"/modules/src/reward/runner.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 讨伐首胜奖励执行器（把交接文档第十四节的九步接到一起）。
 *
 * 只负责“玩家这一套”战利品：队伍胜利不会因为两位NPC而发三套，
 * 也不会因为最后一击由NPC完成而不给玩家。
 * 所有步骤在克隆后的角色/账本上进行，失败时由事务记录断点，重试不会重发已完成的奖励。
 */

const { clone, isPlainObject } = require('../util');
const { ensureTransaction, settleTransaction, freezeBeastReward } = require('./transaction');
const { rollInheritance } = require('./inheritance');
const { createHundredThousandRing, handleNinthRing } = require('./ring');
const { createBoneInstance } = require('../soulbone/instance');
const { absorbBone, applySource, validateLedger } = require('../soulbone/absorption');
const { SLOTS, rollBoneSlot } = require('../soulbone/instance');
const { validateBeast } = require('../beast/library');
const { RollLog } = require('../rng');

function createHuntRewardRunner(input) {
  const { library, store } = input;
  if (!library) throw new Error('奖励执行器缺少魂兽库');
  if (!isPlainObject(store)) throw new Error('奖励执行器缺少奖励账本');

  /**
   * @param {object} run { transactionId, beastSnapshot, character, equipmentLedger, ledger, level, rng, makeSkill, pickCategory, at }
   */
  function run(runInput) {
    let beast = runInput.beastSnapshot;
    if (!beast) throw new Error('奖励执行器缺少冻结魂兽定义');
    validateBeast(beast);
    const character = clone(runInput.character);
    const equipmentLedger = clone(runInput.equipmentLedger);
    if (!character || runInput.level !== character.level) throw new Error('奖励等级与角色当前等级不一致');
    validateLedger(equipmentLedger);
    const ensured = ensureTransaction(store, {
      transactionId: runInput.transactionId,
      sessionId: runInput.sessionId || null,
      target: { id: beast.id, version: beast.version },
      characterLevel: runInput.level,
      mode: 'hunt',
      firstWin: runInput.firstWin === true
    });
    const tx = ensured.transaction;
    if (!tx.beastSnapshot) tx.beastSnapshot = clone(beast);
    beast = tx.beastSnapshot;
    // 每一步使用同一份持久化骰序。失败步骤的骰序回滚；成功步骤随事务一起保存。
    if (!tx.rngSnapshot) {
      if (!runInput.rng || typeof runInput.rng.snapshot !== 'function') throw new Error('奖励骰须支持可存档快照');
      tx.rngSnapshot = runInput.rng.snapshot();
      tx.rewardSeed = runInput.seed || 'hunt-reward:' + runInput.transactionId;
    }
    const rewardRng = RollLog.restore(tx.rngSnapshot);

    // 断点续结：已完成的步骤不重掷，但要把它们的落地效果补到本次传入的角色/账本上。
    const resumedSteps = reconcile(ensured.transaction, character, equipmentLedger, runInput);
    const actions = {
      'win-record': () => ({ at: runInput.at === undefined ? null : runInput.at, transactionId: runInput.transactionId }),
      'freeze-reward': () => freezeBeastReward(beast),
      ring: () => {
        return createHundredThousandRing({
          character,
          seed: tx.rewardSeed,
          rng: rewardRng,
          makeSkill: runInput.makeSkill,
          pickCategory: runInput.pickCategory,
          transactionId: runInput.transactionId,
          acquiredAt: runInput.at
        });
      },
      bone: ({ results }) => {
        const frozen = results['freeze-reward'];
        const slotRoll = frozen.bone.slot === 'random' ? rollBoneSlot({ rng: rewardRng }) : null;
        const slot = slotRoll ? slotRoll.slot : frozen.bone.slot;
        if (!SLOTS.includes(slot)) throw new Error('魂兽魂骨部位规则无效：' + frozen.bone.slot);
        return createBoneInstance({
          boneId: 'bone:' + runInput.transactionId,
          definitionId: 'beast-bone:' + beast.id,
          source: { type: 'hunt', acquisitionId: runInput.transactionId, beastId: beast.id, beastVersion: beast.version, obtainedAt: runInput.at },
          base: { years: 100000, slot, name: beast.name + '·' + slot + '魂骨', affinity: (beast.elements || []).join('／') || beast.lifeType },
          budget: runInput.budget,
          traits: [],
          rolls: { drop: null, slot: slotRoll, assembly: null, inheritance: null }
        });
      },
      inheritance: ({ results }) => {
        const frozen = results['freeze-reward'];
        const inheritance = rollInheritance({ traits: frozen.traits, rng: rewardRng, beastId: beast.id, config: runInput.inheritanceConfig });
        const chosen = frozen.traits.filter((trait) => inheritance.selectedTraitIds.includes(trait.id));
        const bone = results.bone;
        const inherited = chosen.map((trait) => ({
          traitId: trait.id,
          name: trait.inherit.name || trait.name,
          effect: trait.inherit.effect || trait.effect,
          definitionVersion: frozen.beastVersion,
          implementationVersion: trait.inherit.implementationVersion,
          handler: trait.inherit.handler,
          params: trait.inherit.params || {},
          save: trait.inherit.save || { schemaVersion: 1, fields: [] },
          dependsOn: trait.inherit.dependsOn || [],
          stackGroup: trait.inherit.stackGroup || trait.id,
          maxStacks: trait.inherit.maxStacks || 1,
          assemblyVersion: 1
        }));
        const nextBone = createBoneInstance({
          boneId: bone.boneId,
          definitionId: bone.definitionId,
          source: bone.source,
          base: bone.base,
          attributes: bone.attributes,
          traits: inherited,
          rolls: { ...bone.rolls, inheritance: { face: inheritance.face, mode: inheritance.mode, selectedTraitIds: inheritance.selectedTraitIds, configVersion: inheritance.configVersion } }
        });
        return { inheritance, bone: nextBone, traits: inherited };
      },
      absorb: ({ results }) => {
        return absorbBone({ character, bone: results.inheritance.bone, ledger: equipmentLedger });
      },
      'ninth-ring': ({ results }) => {
        const result = handleNinthRing({
          character,
          ring: results.ring,
          level: runInput.level,
          makeSkill: runInput.makeSkill,
          seed: tx.rewardSeed
        });
        if (result.action === 'already-nine') {
          character.pendingNinthRing = result.pendingRing;
        } else if (result.pendingRing) {
          character.preStoredNinthRing = result.pendingRing;
        }
        return result;
      },
      report: ({ results }) => {
        const record = {
          ...clone(runInput.battleReport || {}),
          type: 'hunt',
          recordVersion: 1,
          transactionId: runInput.transactionId,
          targetId: beast.id,
          targetVersion: beast.version,
          level: runInput.level,
          ring: { index: results.ring.index, years: results.ring.years, categories: results.ring.skills.map((skill) => skill.category) },
          bone: { boneId: results['inheritance'].bone.boneId, slot: results['inheritance'].bone.base.slot, years: results['inheritance'].bone.base.years },
          inheritance: clone(results.inheritance.inheritance),
          absorption: { status: results.absorb.status },
          ninthRing: { action: results['ninth-ring'].action },
          preStoredRing: results['ninth-ring'].pendingRing || null,
          rewards: { rings: [clone(results.ring)], bones: [clone(results.inheritance.bone)] },
          at: runInput.at === undefined ? null : runInput.at
        };
        if (!Array.isArray(store.reports)) store.reports = [];
        store.reports = [...store.reports.filter((item) => item.transactionId !== runInput.transactionId), record];
        return record;
      },
      'restore-flow': () => ({ restored: !!runInput.restore && runInput.restore() })
    };
    const checkpointed = Object.fromEntries(Object.entries(actions).map(([key, action]) => [key, (context) => {
      const result = action(context);
      context.transaction.rngSnapshot = rewardRng.snapshot();
      return result;
    }]));
    const settled = settleTransaction(tx, checkpointed);

    store.transactions[runInput.transactionId] = clone(settled.transaction);
    return {
      transaction: settled.transaction,
      reused: ensured.reused,
      resumedSteps,
      failedStep: settled.failedStep,
      error: settled.error,
      character,
      equipmentLedger,
      result: settled.failedStep ? null : {
        ring: settled.transaction.steps.ring.result,
        bone: settled.transaction.steps['inheritance'].result.bone,
        inheritance: settled.transaction.steps['inheritance'].result.inheritance,
        absorption: settled.transaction.steps.absorb.result,
        ninthRing: settled.transaction.steps['ninth-ring'].result,
        report: settled.transaction.steps.report.result
      }
    };
  }

  return Object.freeze({ run });
}

/**
 * 断点续结的落地补偿：已完成步骤的骰果不再重掷，但如果调用方传入的角色/账本
 * 还没有这些成果（例如读到“已胜利未展示奖励”的存档），就把它们补上。
 * 以 boneId / 第九环索引去重，绝不重复发放。
 */
function reconcile(transaction, character, ledger, input) {
  const applied = [];
  const inheritanceStep = transaction.steps.inheritance;
  if (transaction.steps.absorb.status === 'done' && inheritanceStep.status === 'done') {
    const bone = inheritanceStep.result.bone;
    const equipped = character.bones.find((item) => item.boneId === bone.boneId);
    if (equipped) {
      applySource(equipped, ledger);
      applied.push('equipment-source');
    }
    const known = character.bones.some((item) => item.boneId === bone.boneId)
      || (character.inventory || []).some((item) => item.boneId === bone.boneId);
    if (!known && !ledger.removedBones[bone.boneId]) {
      // 账本已保存而角色未保存时也要恢复实物；曾主动拆下的骨不自动重新装备。
      delete ledger.absorbedBones[bone.boneId];
      absorbBone({ character, bone, ledger });
      applied.push('absorb');
    }
  }
  const ninth = transaction.steps['ninth-ring'];
  if (ninth.status === 'done' && transaction.steps.ring.status === 'done') {
    const ring = transaction.steps.ring.result;
    const action = ninth.result.action;
    if (action === 'absorbed' && !character.rings.some((item) => item.index === 9)) {
      handleNinthRing({ character, ring, level: input.level, makeSkill: input.makeSkill });
      applied.push('ninth-ring');
    } else if ((action === 'pre-stored' || action === 'queued-gap') && !character.rings.some((item) => item.index === 9 && item.source && item.source.transactionId === transaction.transactionId)) {
      if (!character.preStoredNinthRing) character.preStoredNinthRing = clone(ring);
    } else if (action === 'already-nine') {
      if (!character.pendingNinthRing) character.pendingNinthRing = clone(ring);
    }
  }
  return applied;
}

module.exports = { createHuntRewardRunner };

},"/modules/src/reward/transaction.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 首胜奖励事务（交接文档第十四节）。
 *
 * 首次真正胜利后按固定顺序完成：
 *   记录胜利凭证 → 冻结魂兽奖励 → 生成100000年魂环 → 生成100000年魂骨 →
 *   完成魂骨继承判定 → 自动吸收／冲突处理 → 处理立即或预存的第九环 →
 *   写入战报与领取账本 → 恢复原剧情。
 *
 * 同一场胜利只能创建一个奖励事务ID。重复回调、读到“已胜利未展示奖励”的存档
 * 或奖励页面重开时，只补完未完成步骤，不重发魂环、魂骨、属性或特性。
 */

const { clone, deepFreeze, isPlainObject } = require('../util');
const { VERSIONS } = require('../versions');

const STEP_KEYS = Object.freeze([
  'win-record',
  'freeze-reward',
  'ring',
  'bone',
  'inheritance',
  'absorb',
  'ninth-ring',
  'report',
  'restore-flow'
]);

function createTransaction(input) {
  if (!isPlainObject(input)) throw new Error('奖励事务参数无效');
  if (typeof input.transactionId !== 'string' || !input.transactionId) throw new Error('奖励事务缺少唯一ID');
  if (!isPlainObject(input.target) || typeof input.target.id !== 'string' || !Number.isInteger(input.target.version)) {
    throw new Error('奖励事务缺少冻结目标ID与版本');
  }
  if (input.firstWin !== true) throw new Error('只有首胜才能创建奖励事务');
  if (typeof input.sessionId !== 'string' || !input.sessionId) throw new Error('首胜奖励必须提供唯一战斗场次ID');
  const steps = {};
  for (const key of STEP_KEYS) steps[key] = { status: 'pending', result: null, error: null };
  return {
    version: VERSIONS.rewardTransaction,
    transactionId: input.transactionId,
    sessionId: input.sessionId || null,
    target: { id: input.target.id, version: input.target.version },
    characterLevel: input.characterLevel,
    mode: input.mode || 'hunt',
    status: 'pending',
    steps,
    createdAt: input.createdAt === undefined ? null : input.createdAt,
    completedAt: null
  };
}

/** 同一事务ID只创建一次；已有记录原样返回，不追加奖励。 */
function ensureTransaction(store, input) {
  if (!isPlainObject(store)) throw new Error('奖励账本无效');
  if (!store.transactions) store.transactions = Object.create(null);
  if (input.sessionId) {
    const clash = Object.values(store.transactions).find((item) => item.sessionId === input.sessionId && item.transactionId !== input.transactionId);
    if (clash) throw new Error('同一场胜利只能创建一个奖励事务ID：已有 ' + clash.transactionId);
  }
  const existing = store.transactions[input.transactionId];
  if (existing) {
    if (existing.target.id !== input.target.id || existing.target.version !== input.target.version) {
      throw new Error('同一奖励事务ID指向了不同目标，拒绝重发');
    }
    if (existing.sessionId !== input.sessionId) throw new Error('奖励事务的战斗场次ID不一致');
    return { transaction: clone(existing), reused: true };
  }
  const transaction = createTransaction(input);
  store.transactions[input.transactionId] = clone(transaction);
  return { transaction, reused: false };
}

/**
 * 断点续结。actions 每个步骤一个函数，参数为 {transaction, results}。
 * 已完成步骤直接跳过；失败步骤记录原因，下次从该步继续。
 */
function settleTransaction(transaction, actions) {
  if (!isPlainObject(transaction) || transaction.version !== VERSIONS.rewardTransaction) throw new Error('奖励事务无效');
  const next = clone(transaction);
  const results = {};
  for (const key of STEP_KEYS) if (next.steps[key].status === 'done') results[key] = next.steps[key].result;
  const events = [];

  for (const key of STEP_KEYS) {
    const step = next.steps[key];
    if (step.status === 'done') {
      events.push({ key, status: 'skipped-already-done' });
      continue;
    }
    const action = actions[key];
    if (typeof action !== 'function') {
      next.steps[key] = { ...step, status: 'blocked', error: '缺少步骤实现：' + key };
      next.status = 'blocked';
      return { transaction: next, events, blockedStep: key, error: next.steps[key].error };
    }
    try {
      const result = action({ transaction: next, results });
      next.steps[key] = { status: 'done', result: result === undefined ? null : clone(result), error: null };
      results[key] = next.steps[key].result;
      events.push({ key, status: 'done' });
    } catch (error) {
      next.steps[key] = { status: 'failed', result: null, error: error.message };
      next.status = 'failed';
      return { transaction: next, events, failedStep: key, error };
    }
  }
  next.status = 'done';
  next.completedAt = null;
  return { transaction: next, events, failedStep: null, error: null };
}

/** 冻结魂兽奖励：锁定该兽的魂环描述、魂骨部位规则与可继承特性定义／版本。 */
function freezeBeastReward(beast) {
  if (!isPlainObject(beast)) throw new Error('冻结奖励须有魂兽定义');
  if (!Array.isArray(beast.traits) || beast.traits.length < 2) throw new Error('冻结奖励要求至少两个可继承特性');
  for (const trait of beast.traits) {
    if (!trait.inherit || typeof trait.inherit.handler !== 'string' || !trait.inherit.handler) {
      throw new Error('魂兽特性「' + trait.id + '」没有玩家可执行的继承版本，不能进入奖励事务');
    }
    if (!Number.isInteger(trait.inherit.implementationVersion) || trait.inherit.implementationVersion < 1) {
      throw new Error('魂兽特性「' + trait.id + '」的继承版本号无效');
    }
  }
  return deepFreeze({
    version: VERSIONS.rewardTransaction,
    beastId: beast.id,
    beastVersion: beast.version,
    years: beast.years,
    ring: clone(beast.ringReward),
    bone: { slot: beast.bone.slot, description: beast.bone.description || null },
    traits: beast.traits.map((trait) => ({
      id: trait.id,
      name: trait.name,
      effect: trait.effect,
      inherit: clone(trait.inherit)
    })),
    traitInheritanceVersion: beast.traitInheritanceVersion
  });
}

function isComplete(transaction) {
  return transaction && transaction.status === 'done';
}

function pendingSteps(transaction) {
  return STEP_KEYS.filter((key) => transaction.steps[key].status !== 'done');
}

module.exports = { STEP_KEYS, createTransaction, ensureTransaction, settleTransaction, freezeBeastReward, isComplete, pendingSteps };

},"/modules/src/rng.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 与游戏 core.js 的 DiceEngine 同算法的确定性投骰。
 *
 * 交接文档要求：沿用游戏确定性种子与投骰日志，禁止读取浏览器当前时间另起随机数。
 * 因此这里不调用 Math.random，也不读 Date；种子由调用方传入，序列状态可存档续投。
 * 算法逐行对齐 v11.01 的 `骰子系统/core.js`：
 *   hashSeed = FNV-1a；nextUint = (state + 0x6D2B79F5) 再 xorshift-mix；die 用拒绝采样。
 */

function hashSeed(seed) {
  let h = 2166136261;
  for (const c of String(seed)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

class DiceEngine {
  constructor(seed, state) {
    this.seed = String(seed);
    this.state = state === undefined ? hashSeed(seed) : state >>> 0;
  }

  nextUint() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  die(sides) {
    if (!Number.isInteger(sides) || sides < 2 || sides > 100000) {
      throw new Error('骰子面数须为2—100000的整数');
    }
    const limit = Math.floor(4294967296 / sides) * sides;
    let u;
    do {
      u = this.nextUint();
    } while (u >= limit);
    return (u % sides) + 1;
  }

  roll(sides, count = 1, modifier = 0) {
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      throw new Error('同投数量须为1—100的整数');
    }
    if (!Number.isInteger(modifier) || modifier < -999 || modifier > 999) {
      throw new Error('总修正须为−999到999的整数');
    }
    const before = this.state;
    const faces = Array.from({ length: count }, () => this.die(sides));
    const subtotal = faces.reduce((a, b) => a + b, 0);
    return { sides, count, modifier, faces, subtotal, total: subtotal + modifier, before, after: this.state };
  }
}

/**
 * 带日志的投骰器。日志条目结构与游戏 state.rolls 接近，至少含：
 * label / sides / face / seq / seed / stateAfter / version。
 * 调用方可把 entries 原样落入存档，读档后用 restore 继续，序列不回卷。
 */
class RollLog {
  constructor(seed, entries, state) {
    this.engine = new DiceEngine(seed, state === undefined ? undefined : state);
    this.seed = String(seed);
    this.entries = Array.isArray(entries) ? entries.map((e) => ({ ...e })) : [];
    this.seq = this.entries.reduce((n, e) => Math.max(n, e.seq || 0), 0);
  }

  die(sides, label, context) {
    const before = this.engine.state;
    const face = this.engine.die(sides);
    const entry = {
      seq: ++this.seq,
      label: String(label || '投骰'),
      sides,
      face,
      seed: this.seed,
      stateBefore: before,
      stateAfter: this.engine.state,
      ...(context === undefined ? {} : { context })
    };
    this.entries.push(entry);
    return face;
  }

  d100(label, context) {
    return this.die(100, label, context);
  }

  d10000(label, context) {
    return this.die(10000, label, context);
  }

  get state() {
    return this.engine.state;
  }

  snapshot() {
    return { seed: this.seed, state: this.engine.state, seq: this.seq, entries: this.entries.map((e) => ({ ...e })) };
  }

  static restore(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('投骰日志快照无效');
    if (typeof snapshot.seed !== 'string' && typeof snapshot.seed !== 'number') throw new Error('投骰日志缺少种子');
    return new RollLog(snapshot.seed, snapshot.entries, snapshot.state);
  }
}

/** 统一入口：种子 + 可选日志快照。 */
function createRng(seed, snapshot) {
  if (snapshot !== undefined) return RollLog.restore(snapshot);
  return new RollLog(seed);
}

/**
 * 从 count 个等概率选项中取一个。count 为 1 时只有一种结果，不消耗随机序列，
 * 但仍返回一个可审计的退化记录（游戏骰子要求面数≥2，不能 die(1)）。
 */
function drawIndex(rng, count, label, context) {
  if (!Number.isInteger(count) || count < 1) throw new Error('抽取项数须为≥1的整数');
  if (count === 1) return { face: 1, sides: 1, degenerate: true, label };
  return { face: rng.die(count, label, context), sides: count, degenerate: false, label };
}

/** 大权重池仍只调用宿主支持的≤100000面骰，使用拒绝采样保持等概率。 */
function drawWeightedFace(rng, total, label, context) {
  if (!Number.isSafeInteger(total) || total < 1 || total > 281474976710656) throw new Error('权重总和超出可投骰范围');
  if (total === 1) return 1;
  if (total <= 100000) return rng.die(total, label, context);
  const range = 281474976710656; // 2^48，三枚1d65536组合，无浮点精度损失
  const limit = Math.floor(range / total) * total;
  let value;
  do {
    value = 0;
    for (let i = 0; i < 3; i++) value = value * 65536 + rng.die(65536, label, context) - 1;
  } while (value >= limit);
  return value % total + 1;
}

module.exports = { DiceEngine, RollLog, hashSeed, createRng, drawIndex, drawWeightedFace };

},"/modules/src/soulbone/absorption.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 魂骨吸收（交接文档第十六节）。
 *
 * 核心口径：
 *   - 得到可吸收魂骨后，在该次获得或战斗结算结束的安全节点直接处理；
 *     不消耗普通事件次数、不推进月份、不多给事件经验、不重投事件成功与否。
 *   - 剧情赠骨、万年掉骨、讨伐十万年掉骨共用同一入口。
 *   - 永久属性修正进入“装备来源账本”；特性进入“运行时来源注册”；
 *     保存、读取、刷新面板与进入战斗只构建同一份有效修正，
 *     不把属性反复加进成长，也不把同一特性注册两次。
 *   - 有合法空位时自动完成；有部位冲突时先保证新骨已获得，
 *     转入独立换骨处理窗口，不占事件；不悄悄丢骨，也不暗拆旧骨。
 */

const { clone, isPlainObject } = require('../util');
const { VERSIONS, PENDING } = require('../versions');
const { SLOTS, validateBoneInstance, markStatus } = require('./instance');

function createEquipmentLedger() {
  return {
    version: VERSIONS.equipmentSource,
    attributes: Object.create(null), // sourceBoneId -> {slot, years, stats, budgetVersion}
    runtimeTraits: Object.create(null), // `${boneId}::${traitId}` -> trait record
    absorbedBones: Object.create(null), // boneId -> {slot, years}
    removedBones: Object.create(null),
    pendingBudget: Object.create(null)
  };
}

function validateLedger(ledger) {
  if (!isPlainObject(ledger) || ledger.version !== VERSIONS.equipmentSource) throw new Error('装备来源账本无效');
  if (!isPlainObject(ledger.attributes) || !isPlainObject(ledger.runtimeTraits)) throw new Error('装备来源账本结构无效');
  for (const key of ['absorbedBones', 'removedBones', 'pendingBudget']) {
    if (!isPlainObject(ledger[key])) throw new Error('装备来源账本缺少 ' + key);
  }
  return true;
}

function attributeTotals(ledger) {
  validateLedger(ledger);
  const totals = {};
  for (const entry of Object.values(ledger.attributes)) {
    for (const [key, value] of Object.entries(entry.stats)) totals[key] = (totals[key] || 0) + value;
  }
  return totals;
}

function slotOf(bone) {
  return bone && bone.base && bone.base.slot ? bone.base.slot : bone && bone.slot;
}

function boneIdOf(bone) {
  return bone && (bone.boneId || bone.id);
}

function findSlotOwner(character, slot) {
  return (character.bones || []).find((bone) => slotOf(bone) === slot) || null;
}

/**
 * @param {object} input {character, bone, ledger, policy?, inventory?}
 * @returns {object} 吸收结果；绝不静默丢弃新骨或旧骨。
 */
function absorbBone(input) {
  const { character, bone, ledger } = input;
  if (!isPlainObject(character) || !Array.isArray(character.bones)) throw new Error('角色缺少魂骨槽');
  if (!Array.isArray(character.inventory)) character.inventory = [];
  validateBoneInstance(bone);
  validateLedger(ledger);

  if (ledger.absorbedBones[bone.boneId]) {
    return { status: 'already-absorbed', changed: false, duplicate: true, boneId: bone.boneId, eventConsumed: 0, monthsAdvanced: 0 };
  }
  if (character.bones.some((item) => boneIdOf(item) === bone.boneId)) {
    // 旧档已穿在身上但没有装备来源账本：补登记来源，不重复加属性。
    applySource(bone, ledger);
    return { status: 'already-equipped', changed: false, duplicate: true, boneId: bone.boneId, eventConsumed: 0, monthsAdvanced: 0 };
  }

  const owner = findSlotOwner(character, bone.base.slot);
  if (owner) {
    // 先保证新骨已获得：进入背包，开独立换骨窗口；不吞事件、不丢新骨。
    if (!character.inventory.some((item) => boneIdOf(item) === bone.boneId)) character.inventory = [...character.inventory, clone(bone)];
    return {
      status: 'slot-conflict',
      changed: true,
      conflict: { incomingBoneId: bone.boneId, existingBoneId: boneIdOf(owner), slot: bone.base.slot },
      session: createReplacementSession({ incoming: bone, existing: owner, policy: input.policy }),
      eventConsumed: 0,
      monthsAdvanced: 0
    };
  }

  const applied = applySource(bone, ledger);
  character.bones = [...character.bones, markStatus(bone, 'absorbed', 'safe-node-absorption')];
  character.inventory = character.inventory.filter((item) => boneIdOf(item) !== bone.boneId);
  return {
    status: applied.attributesPending ? 'absorbed-with-pending-budget' : 'absorbed',
    changed: true,
    applied,
    eventConsumed: 0,
    monthsAdvanced: 0,
    repeatedEventReward: false
  };
}

function applySource(bone, ledger) {
  // 进入运行时前核对叠加组。即使调用者漏传抽池排除表也不能无限叠加。
  for (const trait of bone.traits) {
    const group = trait.stackGroup || trait.traitId;
    const count = Object.values(ledger.runtimeTraits).filter((entry) => entry.ownerBoneId !== bone.boneId && (entry.stackGroup || entry.traitId) === group).length;
    const ownCount = bone.traits.filter((entry) => (entry.stackGroup || entry.traitId) === group).length;
    if (count + ownCount > (trait.maxStacks || 1)) throw new Error('魂骨特性叠加组超出上限：' + group);
  }
  const attributesPending = bone.attributes === null;
  if (!attributesPending) {
    ledger.attributes[bone.boneId] = {
      slot: bone.base.slot,
      years: bone.base.years,
      stats: clone(bone.attributes.stats),
      budgetVersion: bone.attributes.budgetVersion
    };
    delete ledger.pendingBudget[bone.boneId];
  } else {
    ledger.pendingBudget[bone.boneId] = { slot: bone.base.slot, years: bone.base.years, reason: PENDING.ATTRIBUTE_BUDGET_UNSET };
  }
  for (const trait of bone.traits) {
    const key = bone.boneId + '::' + trait.traitId;
    if (ledger.runtimeTraits[key]) continue; // 同一特性只注册一次
    ledger.runtimeTraits[key] = {
      ...clone(trait),
      source: 'soulbone',
      ownerBoneId: bone.boneId,
      registeredVersion: VERSIONS.battleHooks
    };
  }
  ledger.absorbedBones[bone.boneId] = { slot: bone.base.slot, years: bone.base.years };
  return { attributesPending, attributeKeys: attributesPending ? [] : Object.keys(bone.attributes.stats), traitKeys: bone.traits.map((trait) => bone.boneId + '::' + trait.traitId) };
}

/** 拆除来源效果：只移除该骨自己的属性与特性，不碰训练成长账本。 */
function removeBoneSource(ledger, boneId) {
  validateLedger(ledger);
  const removed = { boneId, attributes: false, traits: [] };
  if (ledger.attributes[boneId]) {
    delete ledger.attributes[boneId];
    removed.attributes = true;
  }
  for (const key of Object.keys(ledger.runtimeTraits)) {
    if (ledger.runtimeTraits[key].ownerBoneId === boneId) {
      delete ledger.runtimeTraits[key];
      removed.traits.push(key);
    }
  }
  if (ledger.absorbedBones[boneId]) {
    delete ledger.absorbedBones[boneId];
    ledger.removedBones[boneId] = true;
  }
  delete ledger.pendingBudget[boneId];
  return removed;
}

function createReplacementSession(input) {
  const policy = input.policy || {};
  return {
    version: VERSIONS.soulboneAbsorption,
    slot: slotOf(input.incoming),
    incomingBoneId: boneIdOf(input.incoming),
    existingBoneId: boneIdOf(input.existing),
    options: ['replace-existing', 'keep-in-inventory'],
    allowDisassembly: policy.allowDisassembly === true,
    requiresConfirmation: true,
    note: '同部位冲突：新骨已获得并留在背包；由玩家确认换骨，不占用事件，不暗拆旧骨。'
  };
}

/**
 * 玩家确认后的换骨。未确认前不执行任何移除。
 * replace-existing：旧骨转入背包（不销毁），执行新骨吸收与旧骨来源清理。
 * keep-in-inventory：新骨留在背包并说明待处理原因。
 */
function confirmReplacement(input) {
  const { session, choice, character, ledger } = input;
  if (!session || session.requiresConfirmation !== true) throw new Error('换骨须有独立处理会话');
  if (!session.options.includes(choice)) throw new Error('换骨选项无效：' + choice);
  if (!isPlainObject(character) || !Array.isArray(character.bones)) throw new Error('角色缺少魂骨槽');
  validateLedger(ledger);
  if (!Array.isArray(character.inventory)) character.inventory = [];
  const incoming = character.inventory.find((bone) => boneIdOf(bone) === session.incomingBoneId);
  if (!incoming) throw new Error('背包中找不到待换的新魂骨');
  const existingIndex = character.bones.findIndex((bone) => boneIdOf(bone) === session.existingBoneId);
  if (existingIndex < 0) throw new Error('槽位上的旧魂骨已不存在');
  validateBoneInstance(incoming);
  if (slotOf(incoming) !== session.slot || slotOf(character.bones[existingIndex]) !== session.slot) {
    throw new Error('换骨会话的部位已失效，请重新检查槽位');
  }

  if (choice === 'keep-in-inventory') {
    return {
      status: 'kept-in-inventory',
      changed: false,
      pendingReason: PENDING.SLOT_CONFLICT,
      message: '新魂骨保留在背包，待玩家另行处理；旧魂骨未被拆除。'
    };
  }

  const existing = character.bones[existingIndex];
  const draft = clone(ledger);
  const removed = removeBoneSource(draft, boneIdOf(existing));
  applySource(incoming, draft);
  character.bones = character.bones.filter((bone) => boneIdOf(bone) !== boneIdOf(existing));
  character.inventory = character.inventory.filter((bone) => boneIdOf(bone) !== incoming.boneId);
  character.bones.push(markStatus(incoming, 'absorbed', 'replacement-confirmed'));
  character.inventory.push(markStatus(existing, 'in-inventory', 'replaced-by-' + incoming.boneId));
  Object.assign(ledger, draft);
  return { status: 'replaced', changed: true, removed, replacedBoneId: boneIdOf(existing), absorbedBoneId: incoming.boneId };
}

/** 读档/进战斗时构建同一份有效修正（不写回成长）。 */
function effectiveModifiers(ledger) {
  validateLedger(ledger);
  return {
    attributes: attributeTotals(ledger),
    traits: Object.values(ledger.runtimeTraits).map((trait) => clone(trait)),
    sources: Object.keys(ledger.absorbedBones)
  };
}

/** 空池或预算补齐后，在安全节点刷新已装备实例；同一来源覆盖登记，不重复叠加。 */
function refreshAbsorbedBone({ character, bone, ledger }) {
  validateBoneInstance(bone);
  validateLedger(ledger);
  const index = (character.bones || []).findIndex((item) => boneIdOf(item) === bone.boneId);
  if (index < 0 || slotOf(character.bones[index]) !== bone.base.slot) throw new Error('待补齐魂骨当前未装备或部位不一致');
  const old = character.bones[index];
  if (old.attributes && JSON.stringify(old.attributes) !== JSON.stringify(bone.attributes)) throw new Error('补齐不能改写已确定的魂骨属性');
  if ((old.traits || []).some((trait) => !bone.traits.some((next) => JSON.stringify(next) === JSON.stringify(trait)))) throw new Error('补齐不能改写已确定的魂骨特性');
  const applied = applySource(bone, ledger);
  character.bones[index] = markStatus(bone, 'absorbed', 'pending-content-completed');
  return { status: 'refreshed', applied, eventConsumed: 0, monthsAdvanced: 0 };
}

module.exports = {
  createEquipmentLedger,
  validateLedger,
  attributeTotals,
  absorbBone,
  removeBoneSource,
  createReplacementSession,
  confirmReplacement,
  effectiveModifiers,
  refreshAbsorbedBone,
  applySource,
  SLOTS
};

},"/modules/src/soulbone/drop.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 普通猎魂的万年魂骨掉落骰（交接文档第十节）。
 *
 * 已定：
 *   - 只有本次最终确认获得的魂环，其魂兽年限在10000—99999年，才投骰；
 *     十年、百年、千年掉落概率为0；100000年走讨伐专门来源，不走这里。
 *   - 气运1约1%、气运10约15%；阈值曲线为可调建议：
 *       阈值 = 四舍五入〔100 + 1400 × (L−1) ÷ 9〕，1d10000 骰面 ≤ 阈值即掉落。
 *   - 每份最终成果有唯一 huntAcquisitionId，只结算一次；
 *     预览、重抽、放弃候选、看结果、开背包、读档都不额外投骰。
 *
 * 掉落只影响是否爆骨，不自动影响魂骨特性强度、部位、十万年传承数量或讨伐胜率。
 */

const { requireInteger } = require('../util');
const { VERSIONS } = require('../versions');
const { hashSeed } = require('../rng');

const SIDES = 10000;
const RULE = 'linear-1d10000-v1';

function isTenThousand(years) {
  return Number.isInteger(years) && years >= 10000 && years <= 99999;
}

/** 超出万年区间（含100000年）一律不投本骰。 */
function rollEligibility(years) {
  if (!Number.isInteger(years)) throw new Error('魂环年限须为整数');
  if (isTenThousand(years)) return { eligible: true, reason: 'ten-thousand-range' };
  if (years === 100000) return { eligible: false, reason: 'hundred-thousand-uses-hunt-source' };
  return { eligible: false, reason: 'not-ten-thousand' };
}

function thresholdForLuck(luck) {
  requireInteger(luck, '有效气运档位', 1, 10);
  return Math.round(100 + (1400 * (luck - 1)) / 9);
}

/** 逐点枚举用的表格：与交接文档10.2表逐行一致。 */
function probabilityTable() {
  const rows = [];
  for (let luck = 1; luck <= 10; luck++) {
    const threshold = thresholdForLuck(luck);
    rows.push({ luck, threshold, range: '1—' + threshold, rate: threshold / SIDES });
  }
  return rows;
}

/**
 * 结算一次掉落。调用点只能是“最终确认获得魂环”的唯一结算点。
 * @param {object} input { acquisitionId, years, luck, rng, at }
 */
function rollBoneDrop(input) {
  const acquisitionId = input.acquisitionId;
  if (typeof acquisitionId !== 'string' || !acquisitionId) throw new Error('魂骨掉落须带唯一 huntAcquisitionId');
  const years = requireInteger(input.years, '魂环年限', 10, 100000);
  const eligibility = rollEligibility(years);
  if (!eligibility.eligible) {
    return Object.freeze({
      version: VERSIONS.boneDropRules,
      rule: RULE,
      acquisitionId,
      years,
      luck: input.luck === undefined ? null : input.luck,
      eligible: false,
      skipped: true,
      reason: eligibility.reason,
      dropped: false,
      face: null,
      threshold: null,
      sides: SIDES
    });
  }
  const luck = requireInteger(input.luck, '有效气运档位', 1, 10);
  if (!input.rng || typeof input.rng.die !== 'function') throw new Error('掉落骰须使用游戏确定性投骰器');
  const threshold = thresholdForLuck(luck);
  const face = input.rng.die(SIDES, '万年魂骨掉落', { acquisitionId, luck, threshold });
  return Object.freeze({
    version: VERSIONS.boneDropRules,
    rule: RULE,
    acquisitionId,
    years,
    luck,
    eligible: true,
    skipped: false,
    sides: SIDES,
    face,
    threshold,
    dropped: face <= threshold,
    rollLabel: '万年魂骨掉落',
    at: input.at === undefined ? null : input.at
  });
}

/**
 * 一次成果一次结算：store 以 acquisitionId 为键。
 * 重复调用返回首次结果并标记 duplicate，不重投、不改写。
 */
function settleBoneDrop(store, input) {
  if (!store || typeof store !== 'object') throw new Error('结算存储无效');
  if (!store.settlements) store.settlements = Object.create(null);
  const existing = store.settlements[input.acquisitionId];
  if (existing) return Object.freeze({ ...existing, duplicate: true });
  const settlement = rollBoneDrop(input);
  store.settlements[input.acquisitionId] = settlement;
  return Object.freeze({ ...settlement, duplicate: false });
}

/** 预览用：只读当前配置，不投骰、不消耗序列。 */
function inspect(input) {
  const eligibility = rollEligibility(input.years);
  const luck = input.luck === undefined ? null : requireInteger(input.luck, '有效气运档位', 1, 10);
  return {
    years: input.years,
    eligible: eligibility.eligible,
    reason: eligibility.reason,
    luck,
    threshold: eligibility.eligible && luck !== null ? thresholdForLuck(luck) : null,
    sides: SIDES,
    rule: RULE,
    pendingReason: eligibility.eligible ? null : eligibility.reason
  };
}

/**
 * 为一次“最终确认获得的魂环”生成唯一成果ID。
 * 同一结果重复调用得到同一ID（只结算一次）；放弃候选后重新猎魂会递增 attempt，
 * 因此新成果不会复用旧ID，但也不会因为重开界面被当成两次成果。
 */
function huntAcquisitionId(input) {
  const ringIndex = requireInteger(input.ringIndex, '魂环位置', 1, 9);
  const years = requireInteger(input.years, '魂环年限', 10, 100000);
  const attempt = requireInteger(input.attempt === undefined ? 1 : input.attempt, '猎魂尝试次数', 1, 999);
  const seed = input.seed === undefined ? '' : String(input.seed);
  const owner = input.characterName === undefined ? '' : String(input.characterName);
  const hash = hashSeed([seed, owner, ringIndex, years, attempt].join('|')).toString(16).padStart(8, '0');
  return 'hunt:' + ringIndex + ':' + years + ':' + attempt + ':' + hash;
}

/**
 * 常规猎魂的唯一掉落结算点：只在“最终确认获得魂环”后调用。
 * ring 必须已经有魂技（即已确认成果），预览/候选/放弃阶段不得调用。
 */
function settleConfirmedHunt(input) {
  const ring = input.ring;
  if (!ring || !Number.isInteger(ring.index) || !Array.isArray(ring.skills) || !ring.skills.length) {
    throw new Error('掉骨骰只能在最终确认获得魂环后结算');
  }
  const acquisitionId = huntAcquisitionId({
    seed: input.seed,
    characterName: input.characterName,
    ringIndex: ring.index,
    years: ring.years,
    attempt: input.attempt
  });
  const settlement = settleBoneDrop(input.store, {
    acquisitionId,
    years: ring.years,
    luck: input.luck,
    rng: input.rng,
    at: input.at
  });
  return { ...settlement, acquisitionId };
}

module.exports = {
  SIDES,
  RULE,
  isTenThousand,
  rollEligibility,
  thresholdForLuck,
  probabilityTable,
  rollBoneDrop,
  settleBoneDrop,
  inspect,
  huntAcquisitionId,
  settleConfirmedHunt
};

},"/modules/src/soulbone/handlers.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 魂骨特性实现处理器登记表。
 *
 * 交接文档第十九节：任意需要的处理器未实现时，必须显式报告该定义不可用于正式讨伐，
 * 不能在界面展示完整特性却实际无效。所以池里每条特性的 handler 必须在这里有实现，
 * 否则该条不进入候选，只在 unavailable 中报告原因。
 *
 * 本包不预置任何正式魂骨特性处理器：特性效果由用户后续编写的池决定，
 * 参考实现不等于默认授予。拼接层可用 register() 注册真实处理器。
 */

function createHandlerRegistry(initial) {
  const handlers = new Map();
  function register(id, implementation) {
    if (typeof id !== 'string' || !id) throw new Error('处理器ID无效');
    if (typeof implementation !== 'function') throw new Error('处理器实现须为函数：' + id);
    if (handlers.has(id)) throw new Error('处理器重复注册：' + id);
    handlers.set(id, implementation);
    return api;
  }
  function has(id) {
    return handlers.has(id);
  }
  function get(id) {
    const handler = handlers.get(id);
    if (!handler) throw new Error('魂骨特性处理器未实现：' + id);
    return handler;
  }
  function list() {
    return [...handlers.keys()];
  }
  const api = Object.freeze({ register, has, get, list, size: () => handlers.size });
  if (initial) for (const [id, implementation] of Object.entries(initial)) register(id, implementation);
  return api;
}

module.exports = { createHandlerRegistry };

},"/modules/src/soulbone/instance.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 魂骨实例（交接文档第十一节）。
 *
 * 每块魂骨是独立实例，记录身份、来源、基础、数值、特性、骰序与状态。
 * 魂骨属性加持进入“装备来源账本”，不混进训练成长账本；特性绑定魂骨实例，
 * 吸收后由佩戴者执行；玩家武魂改变时不改名、不重抽。
 *
 * 属性预算尚未由用户给出（交接文档第十二节）。因此默认 budget.version === 0，
 * attributes 保持 null，实例进入待处理；本模块不会照抄Boss整张面板，也不会凭空写六维数字。
 */

const { clone, deepFreeze, isPlainObject, requireInteger } = require('../util');
const { VERSIONS, PENDING, assertVersion } = require('../versions');

const SLOTS = Object.freeze(['头部', '躯干', '左臂', '右臂', '左腿', '右腿']);
const STAT_KEYS = Object.freeze(['B', 'S', 'C', 'D', 'A', 'P', 'W']);
const SOURCE_TYPES = Object.freeze(['hunt', 'hunt-ring', 'event-gift', 'ten-thousand-drop', 'legacy']);
const STATUSES = Object.freeze(['pending', 'ready', 'absorbed', 'slot-conflict', 'replaced', 'in-inventory']);

const DEFAULT_ATTRIBUTE_BUDGET = Object.freeze({
  version: VERSIONS.soulboneAttributeBudget,
  note: '万年、十万年属性预算尚未确定；未确定前不写入任何六维数值。',
  values: null
});

function createAttributeBudget(input) {
  if (!isPlainObject(input)) throw new Error('属性预算配置无效');
  requireInteger(input.version, '属性预算版本', 0, 1000);
  if (input.version === 0) {
    if (input.values !== null && input.values !== undefined) throw new Error('属性预算未定版时不得携带数值');
    return Object.freeze({ version: 0, note: input.note || DEFAULT_ATTRIBUTE_BUDGET.note, values: null });
  }
  if (!isPlainObject(input.values)) throw new Error('已定版的属性预算须给出数值表');
  for (const [years, stats] of Object.entries(input.values)) {
    if (!['1000', '10000', '100000'].includes(years)) throw new Error('属性预算年份档无效：' + years);
    if (!isPlainObject(stats)) throw new Error('属性预算 ' + years + ' 年档须为对象');
    for (const [key, value] of Object.entries(stats)) {
      if (!STAT_KEYS.includes(key)) throw new Error('属性预算含未知属性：' + key);
      if (!Number.isFinite(value)) throw new Error('属性预算数值无效：' + key);
    }
  }
  return deepFreeze({ version: input.version, note: input.note || '', values: clone(input.values) });
}

/**
 * 预算未定版 → 返回 null，实例不得显示“已加持”。
 * 预算表按档位存：1000（千年）、10000（万年）、100000（十万年）；具体年限落到所属档。
 */
function resolveAttributes(years, budget) {
  const config = budget || DEFAULT_ATTRIBUTE_BUDGET;
  if (config.version === 0 || !config.values) return { attributes: null, reason: PENDING.ATTRIBUTE_BUDGET_UNSET, budgetVersion: 0 };
  const bandKey = years >= 100000 ? '100000' : years >= 10000 ? '10000' : years >= 1000 ? '1000' : null;
  const table = config.values[String(years)] || (bandKey ? config.values[bandKey] : null);
  if (!table) return { attributes: null, reason: PENDING.ATTRIBUTE_BUDGET_UNSET, budgetVersion: config.version };
  return { attributes: { stats: clone(table), budgetVersion: config.version, appliedTo: 'equipment-source' }, reason: null, budgetVersion: config.version };
}

function rollBoneSlot(input) {
  const pool = input.availableSlots ? input.availableSlots.slice() : SLOTS.slice();
  if (!pool.length) throw new Error('没有可用魂骨部位');
  if (!input.rng) throw new Error('魂骨部位须使用游戏确定性投骰器');
  const face = pool.length === 1 ? 1 : input.rng.die(pool.length, '魂骨部位抽取');
  const slot = pool[face - 1];
  return Object.freeze({ sides: pool.length, face, slot, pool: pool.slice(), label: '魂骨部位抽取', degenerate: pool.length === 1 });
}

/**
 * @param {object} input
 * @param {string} input.boneId 唯一魂骨ID
 * @param {string} input.definitionId 定义／模板ID
 * @param {object} input.source {type, acquisitionId?, beastId?, beastVersion?, obtainedAt?}
 * @param {object} input.base {years, slot, name, affinity}
 * @param {object|null} [input.attributes] 已确定的属性修正；不传则按预算解析
 * @param {Array} [input.traits] 已装配特性
 * @param {object} [input.rolls] 冻结骰序
 */
function createBoneInstance(input) {
  if (!isPlainObject(input)) throw new Error('魂骨实例参数无效');
  const base = input.base || {};
  const years = requireInteger(base.years, '魂骨年限', 1000, 100000);
  if (!SLOTS.includes(base.slot)) throw new Error('魂骨部位无效：' + base.slot);
  const source = input.source || {};
  if (!SOURCE_TYPES.includes(source.type)) throw new Error('魂骨来源类型无效：' + source.type);
  if (source.type !== 'legacy' && source.type !== 'event-gift') {
    if (typeof source.acquisitionId !== 'string' || !source.acquisitionId) throw new Error('魂骨来源缺少成果ID');
  }
  if (typeof input.boneId !== 'string' || !input.boneId) throw new Error('魂骨缺少唯一ID');
  if (typeof input.definitionId !== 'string' || !input.definitionId) throw new Error('魂骨缺少定义ID');

  const resolved = input.attributes === undefined
    ? resolveAttributes(years, input.budget)
    : { attributes: input.attributes === null ? null : clone(input.attributes), reason: input.attributes === null ? PENDING.ATTRIBUTE_BUDGET_UNSET : null, budgetVersion: input.attributes && input.attributes.budgetVersion };

  const traits = (input.traits || []).map((trait) => normalizeTrait(trait, input.boneId));
  const pendingReasons = [];
  if (!resolved.attributes && years >= 10000) pendingReasons.push(PENDING.ATTRIBUTE_BUDGET_UNSET);
  if (!traits.length && years >= 10000) pendingReasons.push(PENDING.EMPTY_TRAIT_POOL);

  const bone = {
    boneId: input.boneId,
    definitionId: input.definitionId,
    rulesVersion: VERSIONS.soulboneInstance,
    source: {
      type: source.type,
      acquisitionId: source.acquisitionId || null,
      beastId: source.beastId || null,
      beastVersion: source.beastVersion === undefined ? null : source.beastVersion,
      obtainedAt: source.obtainedAt === undefined ? null : clone(source.obtainedAt),
      eventId: source.eventId || null
    },
    base: {
      years,
      slot: base.slot,
      name: base.name || ('魂骨·' + base.slot),
      affinity: base.affinity || '通用'
    },
    attributes: resolved.attributes,
    attributeBudgetVersion: resolved.budgetVersion,
    traits,
    rolls: clone(input.rolls || { drop: null, slot: null, assembly: null, inheritance: null }),
    status: pendingReasons.length ? 'pending' : 'ready',
    pendingReasons,
    absorbed: false,
    history: [{ step: 'created', index: 0 }]
  };
  validateBoneInstance(bone);
  return bone;
}

function normalizeTrait(trait, boneId) {
  if (!isPlainObject(trait) || typeof trait.traitId !== 'string' || !trait.traitId) throw new Error('魂骨特性缺少 traitId');
  if (typeof trait.handler !== 'string' || !trait.handler) throw new Error('魂骨特性缺少实现处理器：' + trait.traitId);
  return {
    traitId: trait.traitId,
    name: trait.name || trait.traitId,
    effect: trait.effect || '',
    definitionVersion: trait.definitionVersion === undefined ? null : trait.definitionVersion,
    implementationVersion: trait.implementationVersion || 1,
    handler: trait.handler,
    params: clone(trait.params || {}),
    sourceBoneId: boneId,
    assemblyVersion: trait.assemblyVersion || VERSIONS.soulboneTraitAssembly,
    stackGroup: trait.stackGroup || trait.traitId,
    maxStacks: trait.maxStacks || 1,
    save: clone(trait.save || { schemaVersion: 1, fields: [] }),
    dependsOn: clone(trait.dependsOn || [])
  };
}

function validateBoneInstance(bone) {
  if (!isPlainObject(bone)) throw new Error('魂骨实例无效');
  if (typeof bone.boneId !== 'string' || !bone.boneId) throw new Error('魂骨实例缺少唯一ID');
  assertVersion(bone.rulesVersion, VERSIONS.soulboneInstance, '魂骨实例版本');
  if (!SLOTS.includes(bone.base && bone.base.slot)) throw new Error('魂骨部位无效');
  requireInteger(bone.base.years, '魂骨年限', 1000, 100000);
  if (!SOURCE_TYPES.includes(bone.source && bone.source.type)) throw new Error('魂骨来源类型无效');
  if (!Array.isArray(bone.traits)) throw new Error('魂骨特性须为数组');
  for (const trait of bone.traits) {
    if (!isPlainObject(trait) || typeof trait.traitId !== 'string' || !trait.traitId || typeof trait.handler !== 'string' || !trait.handler) throw new Error('魂骨特性缺少ID或处理器');
    requireInteger(trait.implementationVersion, '魂骨特性实现版本', 1, 1000);
  }
  if (bone.traits.some((trait) => trait.sourceBoneId !== bone.boneId)) throw new Error('特性来源魂骨ID不一致');
  if (bone.attributes !== null) {
    if (!isPlainObject(bone.attributes.stats)) throw new Error('魂骨属性修正无效');
    for (const [key, value] of Object.entries(bone.attributes.stats)) {
      if (!STAT_KEYS.includes(key)) throw new Error('魂骨属性含未知项：' + key);
      if (!Number.isFinite(value)) throw new Error('魂骨属性数值无效：' + key);
    }
    if (!(bone.attributes.budgetVersion >= 1)) throw new Error('魂骨属性缺少已定版预算版本');
  }
  const years = bone.base.years;
  const pendingReasons = bone.pendingReasons || [];
  const traitPending = pendingReasons.includes(PENDING.EMPTY_TRAIT_POOL) || pendingReasons.includes(PENDING.NO_LEGAL_TRAIT);
  if (years >= 10000 && years <= 99999) {
    if (bone.traits.length > 1) throw new Error('每块万年魂骨最多一条装配特性');
    if (bone.traits.length !== 1 && !traitPending) throw new Error('每块万年魂骨恰应有一条有效装配特性');
  }
  if (years === 100000 && bone.traits.length < 1 && !traitPending) {
    throw new Error('十万年魂骨至少继承一条特性');
  }
  if (!STATUSES.includes(bone.status)) throw new Error('魂骨状态无效：' + bone.status);
  if (new Set(bone.traits.map((trait) => trait.traitId)).size !== bone.traits.length) {
    throw new Error('同一块魂骨出现重复特性定义');
  }
  return true;
}

function markStatus(bone, status, note) {
  if (!STATUSES.includes(status)) throw new Error('魂骨状态无效：' + status);
  const next = clone(bone);
  next.status = status;
  next.absorbed = status === 'absorbed';
  next.history = [...(next.history || []), { step: status, note: note || null, index: (next.history || []).length }];
  return next;
}

function isHundredThousand(bone) {
  return bone.base.years === 100000;
}

/** 预览魂骨属性：只读，预算未定时明确返回原因，不显示数字。 */
function previewBoneAttributes(bone) {
  validateBoneInstance(bone);
  if (!bone.attributes) return { stats: null, budgetVersion: 0, reason: PENDING.ATTRIBUTE_BUDGET_UNSET };
  return { stats: clone(bone.attributes.stats), budgetVersion: bone.attributes.budgetVersion, reason: null };
}

/** 导出：只导出实例本身，带格式与版本，便于跨存档/跨模块传递。 */
function exportBone(bone) {
  validateBoneInstance(bone);
  return {
    format: 'witness-soulbone-instance',
    version: VERSIONS.soulboneInstance,
    exportedAt: null,
    bone: clone(bone)
  };
}

/** 导入：格式/版本/结构三层校验，不接受的旧版本显式报错而不是猜字段。 */
function importBone(payload) {
  if (!isPlainObject(payload) || payload.format !== 'witness-soulbone-instance') throw new Error('不是魂骨实例导出格式');
  assertVersion(payload.version, VERSIONS.soulboneInstance, '魂骨实例导出格式版本');
  const bone = clone(payload.bone);
  validateBoneInstance(bone);
  return bone;
}

module.exports = {
  SLOTS,
  STAT_KEYS,
  SOURCE_TYPES,
  STATUSES,
  DEFAULT_ATTRIBUTE_BUDGET,
  createAttributeBudget,
  resolveAttributes,
  rollBoneSlot,
  createBoneInstance,
  validateBoneInstance,
  markStatus,
  isHundredThousand,
  previewBoneAttributes,
  exportBone,
  importBone
};

},"/modules/src/soulbone/migrate.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 旧档迁移（交接文档第二、十七节）。
 *
 * 分清楚来源，不能见到“特性”二字就删：
 *   - 魂性谱随机武魂特性：删除定义、注册、随机生成、结算、储存与显示；
 *     已存旧随机特性的待用收益、层数和触发标记在导入时清理。
 *   - 会长、神秘伤疤女、友方NPC等直接手写的角色特性：保留。
 *   - 新魂骨特性：按魂骨实例保留，不因迁移被误删。
 *   - 过去已经结算进属性的成长：不回扣。
 *   - 旧千年赠骨仍是合法道具；是否补新特性未指定，不自动升级为万年骨。
 *   - 旧“非空魂骨技能”校验升级为按版本、类型和已实现处理器验证，不取消全部校验。
 */

const { clone, isPlainObject } = require('../util');
const { VERSIONS } = require('../versions');

const SOUL_RANDOM_SOURCES = Object.freeze(['魂性谱', 'soul-random', 'soul_random', 'random-soul-trait', 'soulTrait', 'soul-trait']);
const ROLE_SOURCES = Object.freeze(['role', 'character', 'innate', 'guildmaster', 'scarred', '角色固有']);
const NPC_SOURCES = Object.freeze(['npc', 'friendly-npc']);
const BONE_SOURCES = Object.freeze(['soulbone', 'bone', '魂骨']);

function classifyTraitSource(trait) {
  if (!isPlainObject(trait)) return 'unknown';
  const source = typeof trait.source === 'string' ? trait.source : '';
  if (SOUL_RANDOM_SOURCES.includes(source)) return 'soul-random';
  if (ROLE_SOURCES.includes(source)) return 'role';
  if (NPC_SOURCES.includes(source) || (typeof trait.npcId === 'string' && trait.npcId)) return 'npc';
  if (BONE_SOURCES.includes(source) || (typeof trait.sourceBoneId === 'string' && trait.sourceBoneId)) return 'soulbone';
  if (typeof trait.sourceBoneId === 'string' && trait.sourceBoneId) return 'soulbone';
  if (typeof trait.definitionId === 'string' && /^(soul-trait[-:]|trait:)/.test(trait.definitionId)) return 'soul-random';
  if (trait.bindsSoulId === true && !source) return 'soul-random';
  return 'unknown';
}

function scrubTraitList(list, label, report) {
  const kept = [];
  for (const trait of list) {
    const kind = classifyTraitSource(trait);
    if (kind === 'soul-random') {
      report.removed.push({ where: label, kind, trait: clone(trait) });
    } else {
      kept.push(trait);
      if (kind === 'unknown') report.needsReview.push({ where: label, trait: clone(trait) });
      else report.kept.push({ where: label, kind });
    }
  }
  return kept;
}

/**
 * 清理角色身上的旧随机武魂特性及其待用收益／层数／触发标记。
 * 只改特性相关容器；growth、stats、rings、bones、mutations 原样保留。
 */
function migrateCharacter(character) {
  if (!isPlainObject(character)) throw new Error('角色存档无效');
  const next = clone(character);
  const report = { version: VERSIONS.legacyMigration, removed: [], kept: [], needsReview: [], containers: [] };
  for (const key of ['soulTrait', 'passive']) {
    if (classifyTraitSource(next[key]) !== 'soul-random') continue;
    report.removed.push({ where: key, kind: 'soul-random', trait: clone(next[key]) });
    delete next[key];
    if (key === 'passive') delete next.passiveState;
  }

  for (const key of ['traits', 'passiveTraits', 'traitStates']) {
    if (!Array.isArray(next[key])) continue;
    report.containers.push(key);
    next[key] = scrubTraitList(next[key], key, report);
  }

  // 旧随机特性的待用收益/层数/触发标记。只清这些标记，不动已结算成长。
  for (const key of ['traitPending', 'traitStacks', 'traitStackTime', 'pendingTraitBenefits']) {
    if (next[key] === undefined) continue;
    report.removed.push({ where: key, kind: 'soul-random-marker', trait: clone(next[key]) });
    delete next[key];
  }

  report.growthUntouched = clone(character.growth || null);
  report.statsUntouched = clone(character.stats || null);
  return { character: next, report };
}

/** 清理旧战斗快照里残留的随机武魂特性待用状态；角色固有/NPC特性保留。 */
function migrateBattleSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error('战斗快照无效');
  const next = clone(snapshot);
  const report = { removed: [], kept: [] };
  for (const unit of next.units || []) {
    const passive = unit.passive;
    if (!passive) continue;
    const kind = classifyTraitSource(passive);
    if (kind === 'soul-random') {
      report.removed.push({ unitId: unit.id, definitionId: passive.definitionId || null });
      unit.passive = null;
      delete unit.passiveState;
    } else {
      report.kept.push({ unitId: unit.id, kind });
    }
  }
  return { snapshot: next, report };
}

/** 旧成长绑定实际在state.soulTrait，战斗绑定在units[].passive；处理整份存档。 */
function migrateSave(save) {
  if (!isPlainObject(save)) throw new Error('存档无效');
  const next = clone(save);
  const removed = [];
  function walk(value, path) {
    if (!value || typeof value !== 'object') return;
    for (const key of ['soulTrait', 'passive']) {
      if (classifyTraitSource(value[key]) !== 'soul-random') continue;
      removed.push({ where: path + '.' + key, definitionId: value[key].definitionId });
      delete value[key];
      if (key === 'passive') delete value.passiveState;
    }
    for (const [key, child] of Object.entries(value)) walk(child, path + '.' + key);
  }
  walk(next, 'save');
  return { save: next, report: { version: VERSIONS.legacyMigration, removed } };
}

/**
 * 旧存档的魂骨技能校验：不再“非空就整包拒绝”，而是逐条要求
 * 生成版本、类型与已实现处理器；缺一项就显式报错，交由迁移处理。
 */
function validateLegacyBoneSkills(bone, options = {}) {
  const implemented = new Set(options.implementedHandlers || []);
  if (!isPlainObject(bone)) throw new Error('魂骨数据无效');
  if (bone.skills === undefined || bone.skills === null) return true;
  if (!Array.isArray(bone.skills)) throw new Error('魂骨技能须为数组');
  if (!bone.skills.length) return true;
  bone.skills.forEach((skill, index) => {
    if (!isPlainObject(skill)) throw new Error('魂骨技能第' + (index + 1) + '项无效');
    if (!Number.isInteger(skill.generationVersion) || skill.generationVersion < 1) {
      throw new Error('魂骨技能第' + (index + 1) + '项缺少生成版本，不能进入正式流程');
    }
    if (typeof skill.type !== 'string' || !skill.type) throw new Error('魂骨技能第' + (index + 1) + '项缺少类型');
    if (typeof skill.handler !== 'string' || !implemented.has(skill.handler)) {
      throw new Error('魂骨技能第' + (index + 1) + '项的处理器未实现：' + skill.handler);
    }
  });
  return true;
}

/**
 * 旧E02“魂骨与武魂的共鸣”迁移：
 *   - 已经结算的旧事件保留应得成果，并标记防止重发；
 *   - 新流程不再要求为吸骨单开一次培养事件。
 */
function migrateLegacyBoneEvent(pending) {
  if (!isPlainObject(pending)) return { pending, report: { changed: false } };
  if (pending.eventId !== 'E02' && pending.eventId !== 2) return { pending: clone(pending), report: { changed: false } };
  const next = clone(pending);
  next.legacyBoneEvent = true;
  next.absorptionMovedToSafeNode = true;
  if (next.settled === true || next.reward !== undefined || next.rewards !== undefined) {
    next.rewardsAlreadyGranted = true;
    next.duplicateRewardPrevented = true;
  }
  return { pending: next, report: { changed: true, rewardsAlreadyGranted: next.rewardsAlreadyGranted === true } };
}

module.exports = {
  SOUL_RANDOM_SOURCES,
  classifyTraitSource,
  migrateCharacter,
  migrateSave,
  migrateBattleSnapshot,
  validateLegacyBoneSkills,
  migrateLegacyBoneEvent
};

},"/modules/src/soulbone/ten-thousand.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 万年魂骨的一次性装配入口（交接文档第十二节）。
 *
 * 把“部位骰 → 实例 → 属性预算 → 特性池筛选/抽取”接成一次调用，
 * 这是底层纯构造器；正式结算必须通过文件下方 settleTenThousandBone 持久化去重。
 * 每次构造的万年骨：
 *   - 属性能加就加；预算未定版则保持 null 并进入待处理；
 *   - 特性只抽一条并绑定该骨实例；
 *   - 池空、处理器缺失或无合法项时保留实例与待处理原因，不显示“特性已生效”。
 */

const { clone, requireInteger } = require('../util');
const { PENDING } = require('../versions');
const { SLOTS, rollBoneSlot, resolveAttributes, createBoneInstance, validateBoneInstance } = require('./instance');

function createTenThousandBone(input) {
  if (!input || !input.pool) throw new Error('万年魂骨装配缺少魂骨特性池');
  if (!input.rng || typeof input.rng.die !== 'function') throw new Error('万年魂骨装配须使用游戏确定性投骰器');
  const years = requireInteger(input.years, '万年魂骨年限', 10000, 99999);
  if (typeof input.boneId !== 'string' || !input.boneId) throw new Error('万年魂骨缺少唯一ID');
  if (typeof input.acquisitionId !== 'string' || !input.acquisitionId) throw new Error('万年魂骨缺少猎魂成果ID');

  const slotRoll = input.slot ? null : rollBoneSlot({ rng: input.rng, availableSlots: input.availableSlots });
  const slot = input.slot || slotRoll.slot;
  if (!SLOTS.includes(slot)) throw new Error('魂骨部位无效：' + slot);

  const assembly = input.pool.assemble({
    boneId: input.boneId,
    years,
    slot,
    rng: input.rng,
    excludeDefinitionIds: input.excludeDefinitionIds,
    stackCounts: input.stackCounts
  });
  const resolved = resolveAttributes(years, input.budget);

  const bone = createBoneInstance({
    boneId: input.boneId,
    definitionId: input.definitionId || 'ten-thousand:' + years,
    source: {
      type: 'ten-thousand-drop',
      acquisitionId: input.acquisitionId,
      beastId: input.beastId || null,
      beastVersion: input.beastVersion === undefined ? null : input.beastVersion,
      obtainedAt: input.obtainedAt
    },
    base: {
      years,
      slot,
      name: input.name || (input.affinity ? input.affinity + '万年' + slot + '骨' : '万年' + slot + '骨'),
      affinity: input.affinity || '通用'
    },
    attributes: resolved.attributes,
    traits: assembly.trait ? [assembly.trait] : [],
    rolls: { drop: input.drop || null, slot: slotRoll, assembly: assembly.roll, inheritance: null }
  });

  if (assembly.status !== 'assembled') {
    if (!bone.pendingReasons.includes(assembly.reason)) bone.pendingReasons.push(assembly.reason);
    bone.status = 'pending';
  }
  bone.assembly = {
    status: assembly.status,
    reason: assembly.reason,
    candidates: assembly.candidates,
    unavailable: clone(assembly.unavailable || [])
  };
  return bone;
}

/** 玩家可见的魂骨特性只有名称和效果，不暴露目录分类、内部来源或随机过程。 */
function displayBoneTrait(bone) {
  return (bone && bone.traits || []).map(({ name, effect }) => ({ name, effect }));
}

/** 成果结算入口：store 必须与角色一同存档，读档与重复回调不重抽部位/特性。 */
function settleTenThousandBone(store, input) {
  if (!store || typeof store !== 'object') throw new Error('万年骨装配缺少持久化账本');
  if (!input || typeof input.acquisitionId !== 'string' || !input.acquisitionId) throw new Error('万年骨装配缺少成果ID');
  if (!store.boneAssemblies) store.boneAssemblies = Object.create(null);
  const existing = Object.prototype.hasOwnProperty.call(store.boneAssemblies, input.acquisitionId) ? store.boneAssemblies[input.acquisitionId] : null;
  if (existing) {
    if (existing.boneId !== input.boneId || existing.base.years !== input.years) throw new Error('同一成果对应的魂骨身份不一致');
    validateBoneInstance(existing);
    return { bone: clone(existing), duplicate: true };
  }
  const bone = createTenThousandBone(input);
  store.boneAssemblies[input.acquisitionId] = clone(bone);
  return { bone: clone(bone), duplicate: false };
}

/** 补齐空池/预算待定的旧成果；已经抽出的特性、部位和属性绝不重抽。 */
function completePendingTenThousandBone(store, input) {
  const old = store && store.boneAssemblies && store.boneAssemblies[input.acquisitionId];
  if (!old) throw new Error('找不到待补齐的万年魂骨成果');
  validateBoneInstance(old);
  const next = clone(old);
  if (next.attributes === null) {
    const resolved = resolveAttributes(next.base.years, input.budget);
    if (resolved.attributes) {
      next.attributes = resolved.attributes;
      next.attributeBudgetVersion = resolved.budgetVersion;
      next.pendingReasons = next.pendingReasons.filter((reason) => reason !== PENDING.ATTRIBUTE_BUDGET_UNSET);
    }
  }
  if (!next.traits.length) {
    const assembly = input.pool.assemble({ ...input, boneId: next.boneId, years: next.base.years, slot: next.base.slot });
    if (assembly.trait) {
      const typed = createBoneInstance({ boneId: next.boneId, definitionId: next.definitionId, source: next.source, base: next.base, attributes: next.attributes, traits: [assembly.trait] });
      next.traits = typed.traits;
      next.rolls.assembly = assembly.roll;
      next.pendingReasons = next.pendingReasons.filter((reason) => ![PENDING.EMPTY_TRAIT_POOL, PENDING.NO_LEGAL_TRAIT].includes(reason));
    }
    next.assembly = { status: assembly.status, reason: assembly.reason, candidates: assembly.candidates, unavailable: clone(assembly.unavailable || []) };
  }
  if (!next.pendingReasons.length) next.status = next.absorbed ? 'absorbed' : 'ready';
  validateBoneInstance(next);
  store.boneAssemblies[input.acquisitionId] = clone(next);
  return { bone: next };
}

module.exports = { createTenThousandBone, settleTenThousandBone, completePendingTenThousandBone, displayBoneTrait };

},"/modules/src/soulbone/trait-pool.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 魂骨特性池与装配（交接文档第十二节）。
 *
 * 规则：
 *   - 每条定义带稳定ID、显示名称、效果说明、可用年限、允许部位、实现处理器、
 *     参数、触发与退出条件、叠加规则、存档结构、依赖机制；
 *   - 先筛选年限、部位和实现条件，再按池权重抽取；没有权重时等权；
 *   - 只抽一次并保存，不随面板刷新重组；
 *   - 重名不能作为重复的唯一判断，检查定义ID与叠加组；
 *   - 抽到不允许重复的特性时，从剩余合法集合无放回重选；无合法项返回待处理，
 *     不无限重抽，也不偷偷改成现金、经验或另一块骨。
 */

const fs = require('node:fs');
const path = require('node:path');
const { clone, deepFreeze, isPlainObject, requireInteger } = require('../util');
const { VERSIONS, PENDING } = require('../versions');
const { drawWeightedFace } = require('../rng');

const DATA_PATH = path.resolve(__dirname, '..', '..', 'data', 'soulbone', 'trait-pool.json');
const SLOTS = Object.freeze(['头部', '躯干', '左臂', '右臂', '左腿', '右腿']);

function emptyPool() {
  return { schemaVersion: 1, poolVersion: VERSIONS.soulboneTraitPool, note: '空池：等待用户编写魂骨特性。', traits: [] };
}

function loadPool(dataPath) {
  const target = dataPath || DATA_PATH;
  if (!fs.existsSync(target)) return emptyPool();
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function validateTraitDefinition(trait) {
  if (!isPlainObject(trait)) throw new Error('特性定义须为对象');
  if (typeof trait.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(trait.id)) throw new Error('特性稳定ID无效：' + trait.id);
  if (typeof trait.name !== 'string' || !trait.name) throw new Error(trait.id + ' 缺少显示名称');
  if (typeof trait.effect !== 'string' || !trait.effect) throw new Error(trait.id + ' 缺少效果说明');
  if (!Array.isArray(trait.years) || trait.years.length !== 2) throw new Error(trait.id + ' 缺少可用年限区间');
  requireInteger(trait.years[0], trait.id + ' 年限下限', 1000, 100000);
  requireInteger(trait.years[1], trait.id + ' 年限上限', trait.years[0], 100000);
  if (!Array.isArray(trait.slots) || !trait.slots.length) throw new Error(trait.id + ' 缺少允许部位');
  if (trait.slots.some((slot) => !SLOTS.includes(slot))) throw new Error(trait.id + ' 含未知部位');
  if (typeof trait.handler !== 'string' || !trait.handler) throw new Error(trait.id + ' 缺少实现处理器');
  if (trait.weight !== undefined) requireInteger(trait.weight, trait.id + ' 池权重', 1, 1000000);
  if (trait.stackGroup !== undefined && (typeof trait.stackGroup !== 'string' || !trait.stackGroup)) throw new Error(trait.id + ' 叠加组无效');
  if (trait.maxStacks !== undefined) requireInteger(trait.maxStacks, trait.id + ' 叠加上限', 1, 99);
  if (trait.implementationVersion !== undefined) requireInteger(trait.implementationVersion, trait.id + ' 实现版本', 1, 1000);
  if (trait.params !== undefined && !isPlainObject(trait.params)) throw new Error(trait.id + ' 参数须为对象');
  return true;
}

function createTraitPool(options = {}) {
  const raw = options.data || loadPool(options.dataPath);
  if (!raw || raw.schemaVersion !== 1) throw new Error('魂骨特性池版本不支持');
  if (!Array.isArray(raw.traits)) throw new Error('魂骨特性池 traits 须为数组');
  const registry = options.registry;
  if (!registry || typeof registry.has !== 'function') throw new Error('特性池须绑定已实现的处理器登记表');

  const errors = [];
  const traits = new Map();
  for (const trait of raw.traits) {
    try {
      validateTraitDefinition(trait);
      if (traits.has(trait.id)) throw new Error('特性ID重复：' + trait.id);
      traits.set(trait.id, deepFreeze(clone(trait)));
    } catch (error) {
      errors.push(error.message);
    }
  }

  function candidates(input) {
    const years = requireInteger(input.years, '魂骨年限', 1000, 100000);
    if (!SLOTS.includes(input.slot)) throw new Error('魂骨部位无效：' + input.slot);
    const excludeIds = new Set(input.excludeDefinitionIds || []);
    const stackCounts = input.stackCounts || {};
    const unavailable = [];
    const legal = [];
    for (const trait of traits.values()) {
      if (years < trait.years[0] || years > trait.years[1]) {
        unavailable.push({ id: trait.id, reason: 'years-not-eligible' });
        continue;
      }
      if (!trait.slots.includes(input.slot)) {
        unavailable.push({ id: trait.id, reason: 'slot-not-allowed' });
        continue;
      }
      if (!registry.has(trait.handler)) {
        unavailable.push({ id: trait.id, reason: 'handler-missing' });
        continue;
      }
      if (excludeIds.has(trait.id)) {
        unavailable.push({ id: trait.id, reason: 'already-equipped' });
        continue;
      }
      const group = trait.stackGroup || trait.id;
      const maxStacks = trait.maxStacks || 1;
      if ((stackCounts[group] || 0) >= maxStacks) {
        unavailable.push({ id: trait.id, reason: 'stack-limit' });
        continue;
      }
      legal.push(trait);
    }
    return { legal, unavailable };
  }

  /**
   * 装配一条特性到魂骨实例。只抽一次并返回冻结结果，不修改池。
   * @param {object} input { boneId, years, slot, rng, excludeDefinitionIds, stackCounts }
   */
  function assemble(input) {
    if (typeof input.boneId !== 'string' || !input.boneId) throw new Error('装配须绑定魂骨实例ID');
    if (!input.rng || typeof input.rng.die !== 'function') throw new Error('特性装配须使用游戏确定性投骰器');
    const { legal, unavailable } = candidates(input);
    if (!traits.size) {
      return { status: 'pending', reason: PENDING.EMPTY_TRAIT_POOL, trait: null, candidates: 0, unavailable, roll: null };
    }
    if (!legal.length) {
      return { status: 'pending', reason: PENDING.NO_LEGAL_TRAIT, trait: null, candidates: 0, unavailable, roll: null };
    }
    const weights = legal.map((trait) => trait.weight || 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const face = legal.length === 1 ? total : drawWeightedFace(input.rng, total, '魂骨特性装配', { boneId: input.boneId, years: input.years, slot: input.slot });
    let cursor = face;
    let index = 0;
    for (; index < legal.length; index++) {
      cursor -= weights[index];
      if (cursor <= 0) break;
    }
    const chosen = legal[index];
    const assembled = {
      traitId: chosen.id,
      name: chosen.name,
      effect: chosen.effect,
      definitionVersion: raw.poolVersion,
      implementationVersion: chosen.implementationVersion || 1,
      handler: chosen.handler,
      params: clone(chosen.params || {}),
      sourceBoneId: input.boneId,
      assemblyVersion: VERSIONS.soulboneTraitAssembly,
      stackGroup: chosen.stackGroup || chosen.id,
      maxStacks: chosen.maxStacks || 1,
      save: clone(chosen.save || { schemaVersion: 1, fields: [] }),
      dependsOn: clone(chosen.dependsOn || [])
    };
    return Object.freeze({
      status: 'assembled',
      reason: null,
      trait: deepFreeze(assembled),
      candidates: legal.length,
      unavailable,
      roll: { sides: total, face, label: '魂骨特性装配', weighted: true, degenerate: legal.length === 1 }
    });
  }

  function status() {
    return {
      empty: traits.size === 0,
      count: traits.size,
      pendingReason: traits.size === 0 ? PENDING.EMPTY_TRAIT_POOL : null,
      definitionErrors: errors,
      poolVersion: raw.poolVersion,
      handlers: registry.list()
    };
  }

  return Object.freeze({ assemble, candidates, status, list: () => [...traits.values()].map((trait) => clone(trait)), SLOTS });
}

module.exports = { createTraitPool, validateTraitDefinition, emptyPool, SLOTS, DATA_PATH };

},"/modules/src/splice/compose.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 拼接入口：把所有独立模块装成一个可直接调用的 API。
 *
 * 本文件不会修改主游戏、不会写主游戏存档、不会注册任何全局变量。
 * 主游戏接入方式见《拼接说明.md》：在现有 compose 一次性装配处创建本组合，
 * 把活着的 WitnessRules / 战斗引擎作为注入项传入即可。
 */

const { VERSIONS } = require('../versions');
const { createRng, RollLog, DiceEngine } = require('../rng');
const { createRoster } = require('../npc/roster');
const npcCombat = require('../npc/combat');
const huntConditions = require('../hunt/conditions');
const huntAllies = require('../hunt/allies');
const huntLedger = require('../hunt/ledger');
const huntBattle = require('../hunt/battle');
const huntTexts = require('../hunt/texts');
const huntFlow = require('../hunt/flow');
const { createHuntController } = require('../hunt/controller');
const { createBeastLibrary } = require('../beast/library');
const boneDrop = require('../soulbone/drop');
const { createTraitPool } = require('../soulbone/trait-pool');
const { createHandlerRegistry } = require('../soulbone/handlers');
const soulboneInstance = require('../soulbone/instance');
const soulboneAbsorption = require('../soulbone/absorption');
const soulboneMigrate = require('../soulbone/migrate');
const soulboneTenThousand = require('../soulbone/ten-thousand');
const inheritance = require('../reward/inheritance');
const rewardTransaction = require('../reward/transaction');
const { createHuntRewardRunner } = require('../reward/runner');
const battleHooks = require('../battle/hooks');
const battleEquipment = require('../battle/equipment');
const bridge = require('../bridge/v1101');
const skillAttributes = require('../battle/skill-attributes');

function createModules(options = {}) {
  const activeBridge = options.rules ? {
    rules: () => options.rules,
    baseline: () => ({ injected: true, rulesVersion: options.rules.calculationVersion, ratingRulesVersion: options.rules.ratingRulesVersion }),
    ...Object.fromEntries(['rating', 'derive', 'makeSkill', 'pickCategory', 'controlEffect', 'benchmark', 'band'].map((key) => [key, (...args) => {
      if (typeof options.rules[key] !== 'function') throw new Error('注入的战斗规则缺少 ' + key);
      const result = options.rules[key](...args);
      return key === 'makeSkill' ? skillAttributes.tagSkill(result, args[0].soul) : result;
    }]))
  } : bridge;
  const roster = options.roster || createRoster(options.rosterDir ? { dir: options.rosterDir } : undefined);
  const ratingFn = options.ratingFn || activeBridge.rating;
  const library = options.library || createBeastLibrary(options.libraryPath ? { dataPath: options.libraryPath } : undefined);
  const registry = options.registry || createHandlerRegistry(options.handlers || {});
  const traitPool = options.traitPool || createTraitPool({ dataPath: options.poolPath, registry });
  const controller = createHuntController({ roster, ratingFn, library, config: options.config });

  function makeRewardRunner(store) {
    return createHuntRewardRunner({ library, store });
  }

  function status() {
    return {
      versions: { ...VERSIONS },
      baseline: activeBridge.baseline(),
      roster: roster.summary(),
      library: library.status(),
      traitPool: traitPool.status(),
      npcCombat: {
        hostIntegrated: false,
        operationTypes: npcCombat.coverage().length,
        primitives: npcCombat.PRIMITIVES.length,
        readiness: ['chengliang', 'xutaiping', 'sailiya_fengzhi'].map((id) => ({ id, ...npcCombat.assertCombatReady(roster.combatSpec(id)) }))
      },
      emptyStates: { beastLibrary: library.status().empty, traitPool: traitPool.status().empty }
    };
  }

  return Object.freeze({
    versions: VERSIONS,
    rng: { createRng, RollLog, DiceEngine },
    roster,
    hunt: { conditions: huntConditions, allies: huntAllies, ledger: huntLedger, battle: huntBattle, texts: huntTexts, flow: huntFlow, controller },
    npc: npcCombat,
    beast: { library },
    soulbone: { drop: boneDrop, instance: soulboneInstance, tenThousand: soulboneTenThousand, traitPool, absorption: soulboneAbsorption, migrate: soulboneMigrate },
    reward: { ring: require('../reward/ring'), inheritance, transaction: rewardTransaction, createRunner: makeRewardRunner },
    battle: { hooks: battleHooks, equipment: battleEquipment, skillAttributes },
    bridge: activeBridge,
    status
  });
}

module.exports = { createModules };

},"/modules/src/text/hunt-texts.generated.js":function(require,module,exports,__dirname){
'use strict';

// 本文件由 tools/extract-texts.cjs 从《v12_重大更新交接文档.md》自动生成，请勿手改。
// 文本逐字来自交接文档，包含全角空格、引号与标点；校验见 tools/check-text.cjs。
const TEXTS = {
  "source": {
    "file": "v12_重大更新交接文档.md",
    "sha256": "163c3d373713a06274376de3651ef9b9b9721e9935bf809d1185705a5966070f",
    "docDate": "2026-10-17",
    "note": "由 tools/extract-texts.cjs 机械提取，禁止手改；校验见 tools/check-text.cjs。"
  },
  "textsVersion": 1,
  "eventId": "hunt_hundred_thousand",
  "title": "讨伐之战。",
  "invitation": {
    "paragraphs": [
      "讨伐之战。",
      "　　通过特殊的渠道，你的实力得到了认可，一系列的委托砸也似得传到你的耳中，可最引人瞩目的仍旧是一封委托——",
      "　　邀你共讨十万年魂兽的委托。这无疑令你心跳加速，但这需要你斟酌："
    ],
    "options": [
      "接受",
      "拒绝"
    ]
  },
  "refusal": [
    "　　你摇摇头，认为十万年并非是你能挑战的目标，一口回绝。"
  ],
  "accepted": [
    "　　你选择应允，时岁推移，终于到了约定的那天。"
  ],
  "noNpc": [
    "　　你承过了委托人的情报，独自前往猎杀魂兽的道路。"
  ],
  "arrivals": {
    "chengliang": [
      "　　你立于聚落前沿，踱步等待。兀然，空间似乎扭曲变形，翻转腾挪，转即，一名身着宽大衣袍，脚步随意的男子步入。他双手自然斜插入兜中，纯黑的衣袍凸显其皮肤的白皙，气度平凡，气息内敛，浑然看不出魂斗罗的派头。他向你颔首，在眨眼间跃然越过你的感知，随后像是安抚你的疑虑般，流露过如渊的魂力如磅礴近乎实质的气血，转瞬归入平常。他随后轻笑——",
      "　　“秘巫塔——程良”"
    ],
    "xutaiping": [
      "　　你立于聚落前沿，踱步等待。漆黑如墨的黑暗攀附上了天空，浓稠似胶的魂力滞于空气，你转头回望，仿佛连呼吸都因此阻塞，一抹昏黄的灯忽明忽灭，流动的黄黑擒于少女的手中，那是个绝美的少女，似向画中落入凡尘的美人，她一步步走来，惊呼道：“不好意思！”鲛人般的鳞片自其脖颈退散，连带这彻天动地的黑暗也纳入她的身躯，一抹灯光转瞬即逝，她伸出带着黑色胶皮手套的右手，轻轻向你伸来：",
      "　　“徐太平，请多指教了！”"
    ],
    "sailiya_fengzhi": [
      "　　你立于聚落前沿，踱步等待。轻盈的风传来讯息，比起更快的是似海般磅礴的魂力，背负双剑的女子自前沿的树木下盈盈落地，仿佛被拖举般自如，她右手缠绕绷带，白色齐肩短发夹带黛色挑染，她轻轻吹拂起落于目前的碎发，随风般流走环绕：",
      "　　“天枢宗——赛利亚”"
    ]
  },
  "advance": "前进"
};

(function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
})(TEXTS);

module.exports = TEXTS;

},"/modules/src/util.js":function(require,module,exports,__dirname){
'use strict';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requireInteger(value, label, min, max) {
  if (!Number.isInteger(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) {
    throw new Error((label || '数值') + '须为' + (min === undefined ? '整数' : min + '—' + max + '的整数') + '，实际 ' + value);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.length) throw new Error((label || '字段') + '须为非空字符串');
  return value;
}

function uniqueIds(list, label) {
  const ids = list.map((x) => (typeof x === 'string' ? x : x && x.id));
  if (new Set(ids).size !== ids.length) throw new Error((label || '名录') + '存在重复ID：' + ids.join(','));
  return ids;
}

const RATING_ORDER = Object.freeze(['纸级', '并级', '强级', '凶级', '狂级', '神级']);
const RATING_MIN_FOR_HUNT = '凶级';

module.exports = { clone, deepFreeze, isPlainObject, requireInteger, requireString, uniqueIds, RATING_ORDER, RATING_MIN_FOR_HUNT };

},"/modules/src/versions.js":function(require,module,exports,__dirname){
'use strict';

/**
 * 独立模块包的版本登记。
 *
 * 交接文档第十八节要求“所有池和定义带版本号；实例保存来源定义与必要的参数快照”。
 * 这里把每个封装的规则版本集中登记，实例/存档只引用这里的数字，避免散落魔法值。
 * 注意：这不是游戏版本号，本模块包不产出任何 v12 游戏构建。
 */
const VERSIONS = Object.freeze({
  modulePackage: 'split-2-beasts.1',
  skillAttributes: 1,
  // 讨伐事件控制器
  huntController: 1,
  huntTexts: 1,
  allyRules: 1,
  huntLedger: 1,
  huntBattle: 1,
  // 名录与战斗适配
  npcRoster: 1,
  npcArrivalTexts: 1,
  npcCombatAdapter: 1,
  // 十万年魂兽库
  beastLibrarySchema: 1,
  beastSelection: 1,
  // 魂骨
  soulboneInstance: 1,
  soulboneAttributeBudget: 0, // 0 = 预算未定，禁止写入具体数值
  boneDropRules: 1,
  soulboneTraitPool: 1,
  soulboneTraitAssembly: 1,
  soulboneAbsorption: 1,
  // 奖励
  rewardTransaction: 1,
  tenThousandInheritance: 1,
  // 战斗适配层
  battleHooks: 1,
  equipmentSource: 1,
  // 旧档迁移
  legacyMigration: 1
});

const PENDING = Object.freeze({
  EMPTY_BEAST_LIBRARY: 'beast-library-empty',
  EMPTY_TRAIT_POOL: 'trait-pool-empty',
  ATTRIBUTE_BUDGET_UNSET: 'attribute-budget-unset',
  SLOT_CONFLICT: 'slot-conflict',
  NO_LEGAL_TRAIT: 'no-legal-trait',
  PRE_STORED_RING: 'pre-stored-ninth-ring',
  OWNER_NOT_READY: 'owner-not-ready'
});

function versionOf(name) {
  if (!Object.prototype.hasOwnProperty.call(VERSIONS, name)) {
    throw new Error('未登记的版本项：' + name);
  }
  return VERSIONS[name];
}

function assertVersion(value, expected, label) {
  if (value !== expected) {
    throw new Error((label || '版本') + '不一致：期望 ' + expected + '，实际 ' + value);
  }
  return true;
}

module.exports = { VERSIONS, PENDING, versionOf, assertVersion };

}},files={"/modules/data/beast/catalog-source.json": "{\n  \"schemaVersion\": 1,\n  \"libraryVersion\": 2,\n  \"sourceFile\": \"魂兽资料_三例.txt\",\n  \"baselineLevel\": 91,\n  \"baselineNote\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\",\n  \"skillYears\": 10000,\n  \"skillPotencyMultiplier\": 1,\n  \"beasts\": [\n    {\n      \"id\": \"frost-moss-frog\", \"name\": \"霜苔巨蛙\", \"version\": 2, \"originalName\": \"霜苔巨螈\",\n      \"style\": \"防御\", \"elements\": [\"木\", \"冰\"],\n      \"statDice\": [3, 2, 1, 10, 9, 9], \"statRatios\": [1.30, 1.05, 0.85, 2.25, 2.05, 2.05],\n      \"bloodline\": {\"roll\": 3, \"name\": \"凡血\", \"modifiesStats\": false},\n      \"species\": \"两栖纲·蛙类\", \"size\": \"大（象鲸级）\", \"sociality\": \"成对\", \"actualAge\": \"约十四万年\",\n      \"habitat\": \"极北冻林最深处的活水沼——水面结壳，底下永远不冻。\",\n      \"appearance\": \"体形如伏地的巨蛙，背阔腹沉，通体覆一层会结霜的青苔。苔甲沿背脊木质化成脊板，板缝嵌冰壳；前肢短粗，后肢壮硕，趾间有蹼。头骨宽扁，口裂极大，双眼半埋苔层，只露出暗黄光点。它不动的时候，整只兽就是沼面上一块长苔的石头。\",\n      \"habits\": \"一年里大半时间伏在沼底不动，靠皮肤与苔甲缓慢吸取周围生机。它几乎不运使魂力，可被惊动时暴起极快。\",\n      \"role\": \"敌方——冻林守地兽。不主动离沼，但踏进它的沼面就别想走出来。\",\n      \"battleText\": \"沼面的青苔忽然隆起，冰壳沿着脊板接连崩裂。霜苔巨蛙睁开暗黄的眼，粗壮的后肢一撑，庞大的身躯便封住了退路。\",\n      \"defeatText\": \"苔甲层层剥落，巨蛙终于伏回冻沼。寒雾散去，一枚猩红魂环缓缓升起。\",\n      \"talents\": [{\"name\":\"苔甲覆霜\",\"effect\":\"体表苔层吸寒变硬，短时间几乎吃不下物理攻击。\"},{\"name\":\"霜沼拖拽\",\"effect\":\"四肢陷泥时不能移动，但周围寒气会把靠近者一并冻住。\"}],\n      \"skills\": [\n        {\"name\":\"苔甲覆霜\",\"category\":\"防御\",\"element\":\"冰\",\"description\":\"苔甲吸寒凝霜，在体表结成生命护盾。\"},\n        {\"name\":\"霜沼拖拽\",\"category\":\"控制\",\"element\":\"冰\",\"description\":\"寒泥攀住目标四肢；控制成功后短暂冻结并打断蓄力。\"},\n        {\"name\":\"冻沼撞击\",\"category\":\"攻击\",\"element\":\"木\",\"description\":\"以覆满苔甲的庞大身躯猛撞目标，造成单次物理伤害。\"},\n        {\"name\":\"生苔回息\",\"category\":\"治疗\",\"element\":\"木\",\"description\":\"苔层汲取沼中生机，回复自身生命。\"}\n      ],\n      \"traits\": [\n        {\"id\":\"frost-moss-immunity\",\"name\":\"霜苔不侵\",\"effect\":\"冰属性伤害完全免疫，并改为回复等量生命；免疫全部减速、冻结、迟缓类效果，不参与判定。受击时叠加封寒：冰属性攻击叠2层，非冰攻击叠1层；每层提供最大生命5%的护盾，上限10层。非冰属性越盾真伤不受减免。\",\"params\":{\"iceDamageImmunity\":true,\"iceDamageToHealing\":1,\"immuneTags\":[\"slow\",\"freeze\",\"sluggish\"],\"iceHitStacks\":2,\"otherHitStacks\":1,\"shieldPerStackMaxHP\":0.05,\"maxStacks\":10,\"shieldMode\":\"stack-capacity\"}},\n        {\"id\":\"moss-armor-accumulation\",\"name\":\"苔甲凝积\",\"effect\":\"每次实际受创叠1层苔凝，每层永久提高防御素质10%、肉体强度5%，上限12层；每满4层额外获得5%固定减伤，最多15%。持续伤害不叠层。\",\"params\":{\"trigger\":\"actual-damage-received\",\"excludeDamageTags\":[\"dot\"],\"defensePerStack\":0.10,\"bodyPerStack\":0.05,\"maxStacks\":12,\"reductionEveryStacks\":4,\"reductionPerStep\":0.05,\"maxReduction\":0.15,\"stackLifetime\":\"permanent\",\"saveFields\":[\"mossStacks\"]}}\n      ]\n    },\n    {\n      \"id\":\"frost-gnat\", \"name\":\"霜蚋\", \"version\": 1,\n      \"style\":\"敏攻\", \"elements\":[\"冰\"],\n      \"statDice\":[9,6,1,5,10,8], \"statRatios\":[2.05,1.63,0.85,1.55,2.25,1.82],\n      \"bloodline\":{\"roll\":2,\"name\":\"凡血\",\"modifiesStats\":false},\n      \"species\":\"虫类·蚋（双翅目）\", \"size\":\"微（指掌以下）\", \"sociality\":\"独居\", \"actualAge\":\"不可考，换过太多次壳\",\n      \"habitat\":\"冰原裂隙与积雪层下的暖缝，那一线不结冰的缝就是它的领地。\",\n      \"appearance\":\"体长不足三分，通体冰蓝半透，翅薄如霜且几乎不反光。飞行时肉眼只能看到一点雪屑似的浮动。口器细长如针，腹末两根短刺。\",\n      \"habits\":\"终生独居，不结群、不筑巢。以极高速度在雪面跳点，用口针吸取体温与少量魂力；极惧光，日间深藏隙中。\",\n      \"role\":\"异种·首领——体型最小、最难打的十万年魂兽。\",\n      \"battleText\":\"一粒雪屑停在你的感知边缘，下一瞬却已掠至近前。冰蓝的薄翅无声展开，脚下的雪地渐渐凝成霜域。\",\n      \"defeatText\":\"薄翅终于停止震颤，最后一层冰壳碎成细雪。霜域消退，猩红魂环在雪面上凝聚。\",\n      \"talents\":[{\"name\":\"霜针\",\"effect\":\"口器刺入时注入寒气，伤口不流血而是结霜。\"},{\"name\":\"雪屑掩形\",\"effect\":\"高速移动时翅膜散出细霜，短时间内难以锁定其位置。\"}],\n      \"skills\":[\n        {\"name\":\"霜针\",\"category\":\"攻击\",\"element\":\"冰\",\"description\":\"掠近目标，以冰针般的口器完成一次迅疾刺击。\"},\n        {\"name\":\"雪屑掩形\",\"category\":\"强化\",\"element\":\"冰\",\"buffField\":\"A\",\"description\":\"翅膜散霜，借细雪遮掩行迹，提高自身敏捷。\"},\n        {\"name\":\"寒痕入骨\",\"category\":\"持续伤害\",\"element\":\"冰\",\"description\":\"将寒气留在创口，分三次侵蚀目标，不重复叠加同一寒痕。\"},\n        {\"name\":\"掠影断脉\",\"category\":\"控制\",\"element\":\"冰\",\"description\":\"疾掠时刺向魂力流转的间隙；判定成功后短暂打断并控制目标。\"}\n      ],\n      \"traits\":[\n        {\"id\":\"ice-shell-preservation\",\"name\":\"冰壳护生\",\"effect\":\"受击时先生成最大生命80%的冰壳护盾，每回合自行重结一次；未破可叠加，最多两层。冰壳击破时，向攻击者反弹该层已吸收伤害的30%，冰屑穿透护盾；越盾真伤无视冰壳。\",\"params\":{\"preHitShieldMaxHP\":0.8,\"renewPerOwnerTurn\":1,\"maxLayers\":2,\"reflectionRate\":0.3,\"reflectionElement\":\"冰\",\"reflectionBypassShield\":true,\"bypassedByTags\":[\"shield-bypass-true-damage\"]}},\n        {\"id\":\"frost-domain\",\"name\":\"霜域\",\"effect\":\"展开不可驱散的霜域，持续整场。非冰属性单位读条速度降低20%、行动条速度降低15%；冰属性单位（含自身）每回合敏捷提高5%。每2回合加深一档，最多3档，最终读条速度降低35%、行动条速度降低25%。驱散技能可压住霜域一回合。\",\"params\":{\"lifetime\":\"battle\",\"dispellable\":false,\"suppressibleByDispelOwnerTurns\":1,\"tiers\":[{\"castSpeedDown\":0.20,\"gaugeSpeedDown\":0.15},{\"castSpeedDown\":0.275,\"gaugeSpeedDown\":0.20},{\"castSpeedDown\":0.35,\"gaugeSpeedDown\":0.25}],\"deepenEveryOwnerTurns\":2,\"iceUnitAgilityPerTurn\":0.05,\"iceAgilityStackLifetime\":\"battle\",\"tierInterpolation\":\"中间档按两端线性取值；待后续调数值\"}}\n      ]\n    },\n    {\n      \"id\":\"abyss-imperial-salamander\", \"name\":\"沧渊帝螈\", \"version\":1,\n      \"style\":\"控制\", \"elements\":[\"水\"],\n      \"statDice\":[8,10,2,4,8,7], \"statRatios\":[1.82,2.25,1.05,1.40,1.82,1.72],\n      \"bloodline\":{\"roll\":9,\"name\":\"帝血\",\"modifiesStats\":false},\n      \"species\":\"两栖纲·鲵\", \"size\":\"中（马牛级）\", \"sociality\":\"独居\", \"actualAge\":\"约十二万年\",\n      \"habitat\":\"地下暗河汇成的深潭，水面常年浮一层不散的白气。\",\n      \"appearance\":\"大小如牛犊的鲵，通体青灰近墨，皮肤湿滑。头部两侧生有鳍状冠，冠缘不断逸出淡蓝色光雾。\",\n      \"habits\":\"独居且极静，魂力庞大而难以收束。泄露的魂力驱动附近水流，自行形成压迫与吸取。\",\n      \"role\":\"首领——深潭区域的唯一强敌，擅长把战斗拖长到自己回满。\",\n      \"battleText\":\"潭底亮起两道幽光，逸散的魂力令四周水汽骤然下沉。沧渊帝螈浮出暗河，鳍冠间的蓝雾正牵动整片深潭。\",\n      \"defeatText\":\"鳍冠间的蓝雾渐渐熄灭，沉重的水压终于散去。沧渊帝螈伏入浅水，猩红魂环随涟漪升起。\",\n      \"talents\":[{\"name\":\"沧澜压\",\"effect\":\"潭水骤然加重，范围内所有单位的读条与行动被拖慢。\"},{\"name\":\"引潮\",\"effect\":\"外泄魂力自行抽取周围单位逸散的魂力，补回自身。\"}],\n      \"skills\":[\n        {\"name\":\"沧澜压\",\"category\":\"控制\",\"element\":\"水\",\"description\":\"将水压收束在一名敌人身上，控制成功后打断其行动。\"},\n        {\"name\":\"潭流冲击\",\"category\":\"攻击\",\"element\":\"水\",\"description\":\"释放一道沉重水流，造成单次能量伤害。\"},\n        {\"name\":\"滞水缠身\",\"category\":\"减益\",\"element\":\"水\",\"debuffField\":\"A\",\"description\":\"黏滞水流缠住目标，精神对抗成功后降低其敏捷。\"},\n        {\"name\":\"回潮护身\",\"category\":\"防御\",\"element\":\"水\",\"description\":\"以回旋水流包覆身体，生成生命护盾。\"}\n      ],\n      \"traits\":[\n        {\"id\":\"oppressive-tides\",\"name\":\"沧澜压境\",\"effect\":\"每次受到攻击后，对攻击者施加滞流：读条速度降低20%、行动条速度降低15%，持续6秒，可叠3层；同时该目标本回合魂力消耗提高30%。无魂力单位只受减速，不受费用惩罚。\",\"params\":{\"trigger\":\"attack-received\",\"castSpeedDownPerStack\":0.20,\"gaugeSpeedDownPerStack\":0.15,\"maxStacks\":3,\"durationSeconds\":6,\"costUp\":0.30,\"costDuration\":\"target-current-turn\",\"excludeResourceFreeUnits\":true}},\n        {\"id\":\"devouring-soul-recovery\",\"name\":\"吞噬回魂\",\"effect\":\"每回合结束回复最大魂力8%。场上任一单位消耗魂力时，吸收其实际消耗量的30%转为自身魂力。魂力满溢部分转为护盾，每回合最多生成最大生命10%的护盾。被封锁或禁绝效果命中时，该回合不吸收。\",\"params\":{\"endTurnMaxMPRate\":0.08,\"manaSpentSiphonRate\":0.30,\"manaSpentScope\":\"all-units-including-self\",\"overflowShieldRate\":1,\"overflowShieldPerTurnMaxHP\":0.10,\"sealTags\":[\"resource_seal\",\"resource_prohibition\"],\"siphonTransfersOpponentMana\":false,\"resourceRecoveryTriggersSiphon\":false}}\n      ]\n    }\n  ]\n}\n", "/modules/data/beast/library.json": "{\n  \"schemaVersion\": 1,\n  \"libraryVersion\": 2,\n  \"note\": \"三例正式魂兽资料已编目；四个主动技能统一最低万年档。available表示可选取定义，实际战斗与六条被动/继承处理器仍需宿主实现，不能将编目完成视作实战接入完成。\",\n  \"source\": {\n    \"file\": \"魂兽资料_三例.txt\",\n    \"sha256\": \"5f339647ac7859f6db9afa78ec43f0f8042a4f04e7b62fc4b773f51eeb6f603c\",\n    \"rulesVersion\": 11,\n    \"ratingRulesVersion\": 2,\n    \"skillYears\": 10000,\n    \"generatedBy\": \"tools/build-beasts.cjs\"\n  },\n  \"beasts\": [\n    {\n      \"id\": \"frost-moss-frog\",\n      \"name\": \"霜苔巨蛙\",\n      \"version\": 2,\n      \"originalName\": \"霜苔巨螈\",\n      \"style\": \"防御\",\n      \"elements\": [\n        \"木\",\n        \"冰\"\n      ],\n      \"statDice\": [\n        3,\n        2,\n        1,\n        10,\n        9,\n        9\n      ],\n      \"statRatios\": [\n        1.3,\n        1.05,\n        0.85,\n        2.25,\n        2.05,\n        2.05\n      ],\n      \"bloodline\": {\n        \"roll\": 3,\n        \"name\": \"凡血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"两栖纲·蛙类\",\n      \"size\": \"大（象鲸级）\",\n      \"sociality\": \"成对\",\n      \"actualAge\": \"约十四万年\",\n      \"habitat\": \"极北冻林最深处的活水沼——水面结壳，底下永远不冻。\",\n      \"appearance\": \"体形如伏地的巨蛙，背阔腹沉，通体覆一层会结霜的青苔。苔甲沿背脊木质化成脊板，板缝嵌冰壳；前肢短粗，后肢壮硕，趾间有蹼。头骨宽扁，口裂极大，双眼半埋苔层，只露出暗黄光点。它不动的时候，整只兽就是沼面上一块长苔的石头。\",\n      \"habits\": \"一年里大半时间伏在沼底不动，靠皮肤与苔甲缓慢吸取周围生机。它几乎不运使魂力，可被惊动时暴起极快。\",\n      \"role\": \"敌方——冻林守地兽。不主动离沼，但踏进它的沼面就别想走出来。\",\n      \"battleText\": \"沼面的青苔忽然隆起，冰壳沿着脊板接连崩裂。霜苔巨蛙睁开暗黄的眼，粗壮的后肢一撑，庞大的身躯便封住了退路。\",\n      \"defeatText\": \"苔甲层层剥落，巨蛙终于伏回冻沼。寒雾散去，一枚猩红魂环缓缓升起。\",\n      \"talents\": [\n        {\n          \"name\": \"苔甲覆霜\",\n          \"effect\": \"体表苔层吸寒变硬，短时间几乎吃不下物理攻击。\"\n        },\n        {\n          \"name\": \"霜沼拖拽\",\n          \"effect\": \"四肢陷泥时不能移动，但周围寒气会把靠近者一并冻住。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"苔甲覆霜\",\n          \"category\": \"防御\",\n          \"channel\": \"生命\",\n          \"target\": \"自己\",\n          \"effect\": \"生命护盾 575，持续8秒\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 145,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 8,\n          \"ring\": 1,\n          \"years\": 10000,\n          \"previewCost\": 145,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"frost-moss-frog-skill-1\",\n          \"skillIndex\": 1,\n          \"element\": \"木／冰\",\n          \"description\": \"苔甲吸寒凝霜，在体表结成生命护盾。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-moss-frog:skill:1\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"shield\",\n              \"channel\": \"生命\",\n              \"coefficient\": 0.45,\n              \"power\": \"Q*SA\",\n              \"ttlSeconds\": 8,\n              \"element\": \"木／冰\",\n              \"elements\": [\n                \"木\",\n                \"冰\"\n              ]\n            }\n          ],\n          \"attribute\": \"木／冰\",\n          \"elements\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1\n        },\n        {\n          \"name\": \"霜沼拖拽\",\n          \"category\": \"控制\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"基础控制 2.4秒；实际成功率与时长受双方精神力影响，结束后4秒免控\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 159,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 10,\n          \"ring\": 2,\n          \"years\": 10000,\n          \"previewCost\": 159,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"frost-moss-frog-skill-2\",\n          \"skillIndex\": 2,\n          \"element\": \"木／冰\",\n          \"description\": \"寒泥攀住目标四肢；控制成功后短暂冻结并打断蓄力。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-moss-frog:skill:2\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"control_contest\",\n              \"baseSeconds\": 2.4,\n              \"interrupt\": true,\n              \"immunitySeconds\": 4,\n              \"element\": \"木／冰\",\n              \"elements\": [\n                \"木\",\n                \"冰\"\n              ]\n            }\n          ],\n          \"baseControl\": 2.4,\n          \"attribute\": \"木／冰\",\n          \"elements\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1\n        },\n        {\n          \"name\": \"冻沼撞击\",\n          \"category\": \"攻击\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理原始伤害 1894；命中后按防御力减伤\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 234,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 8,\n          \"ring\": 3,\n          \"years\": 10000,\n          \"effectSeed\": \"|3|10000|0\",\n          \"damageMode\": \"direct\",\n          \"attackSubtype\": \"direct\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 234,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"frost-moss-frog-skill-3\",\n          \"skillIndex\": 3,\n          \"element\": \"木／冰\",\n          \"description\": \"以覆满苔甲的庞大身躯猛撞目标，造成单次物理伤害。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-moss-frog:skill:3\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"direct_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.2,\n              \"element\": \"木／冰\",\n              \"elements\": [\n                \"木\",\n                \"冰\"\n              ]\n            }\n          ],\n          \"attribute\": \"木／冰\",\n          \"elements\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1\n        },\n        {\n          \"name\": \"生苔回息\",\n          \"category\": \"治疗\",\n          \"channel\": \"生命\",\n          \"target\": \"自己\",\n          \"effect\": \"回复生命 511，不超过最大值\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 145,\n          \"costFraction\": 0.15,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 10,\n          \"ring\": 4,\n          \"years\": 10000,\n          \"previewCost\": 145,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"frost-moss-frog-skill-4\",\n          \"skillIndex\": 4,\n          \"element\": \"木／冰\",\n          \"description\": \"苔层汲取沼中生机，回复自身生命。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-moss-frog:skill:4\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"heal\",\n              \"channel\": \"生命\",\n              \"coefficient\": 0.4,\n              \"power\": \"Q*SA\",\n              \"target\": \"self\",\n              \"allowOverheal\": false,\n              \"element\": \"木／冰\",\n              \"elements\": [\n                \"木\",\n                \"冰\"\n              ]\n            }\n          ],\n          \"attribute\": \"木／冰\",\n          \"elements\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"木\",\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"frost-moss-immunity\",\n          \"name\": \"霜苔不侵\",\n          \"effect\": \"冰属性伤害完全免疫，并改为回复等量生命；免疫全部减速、冻结、迟缓类效果，不参与判定。受击时叠加封寒：冰属性攻击叠2层，非冰攻击叠1层；每层提供最大生命5%的护盾，上限10层。非冰属性越盾真伤不受减免。\",\n          \"params\": {\n            \"iceDamageImmunity\": true,\n            \"iceDamageToHealing\": 1,\n            \"immuneTags\": [\n              \"slow\",\n              \"freeze\",\n              \"sluggish\"\n            ],\n            \"iceHitStacks\": 2,\n            \"otherHitStacks\": 1,\n            \"shieldPerStackMaxHP\": 0.05,\n            \"maxStacks\": 10,\n            \"shieldMode\": \"stack-capacity\"\n          },\n          \"implementation\": {\n            \"status\": \"spec-only\",\n            \"handler\": \"beast:frost-moss-immunity\",\n            \"version\": 1,\n            \"requiresHostAdapter\": true\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:frost-moss-immunity\",\n            \"implementationVersion\": 1,\n            \"name\": \"霜苔不侵\",\n            \"effect\": \"冰属性伤害完全免疫，并改为回复等量生命；免疫全部减速、冻结、迟缓类效果，不参与判定。受击时叠加封寒：冰属性攻击叠2层，非冰攻击叠1层；每层提供最大生命5%的护盾，上限10层。非冰属性越盾真伤不受减免。\",\n            \"params\": {\n              \"iceDamageImmunity\": true,\n              \"iceDamageToHealing\": 1,\n              \"immuneTags\": [\n                \"slow\",\n                \"freeze\",\n                \"sluggish\"\n              ],\n              \"iceHitStacks\": 2,\n              \"otherHitStacks\": 1,\n              \"shieldPerStackMaxHP\": 0.05,\n              \"maxStacks\": 10,\n              \"shieldMode\": \"stack-capacity\",\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"spec-only\",\n            \"requiresHostAdapter\": true,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        },\n        {\n          \"id\": \"moss-armor-accumulation\",\n          \"name\": \"苔甲凝积\",\n          \"effect\": \"每次实际受创叠1层苔凝，每层永久提高防御素质10%、肉体强度5%，上限12层；每满4层额外获得5%固定减伤，最多15%。持续伤害不叠层。\",\n          \"params\": {\n            \"trigger\": \"actual-damage-received\",\n            \"excludeDamageTags\": [\n              \"dot\"\n            ],\n            \"defensePerStack\": 0.1,\n            \"bodyPerStack\": 0.05,\n            \"maxStacks\": 12,\n            \"reductionEveryStacks\": 4,\n            \"reductionPerStep\": 0.05,\n            \"maxReduction\": 0.15,\n            \"stackLifetime\": \"permanent\",\n            \"saveFields\": [\n              \"mossStacks\"\n            ]\n          },\n          \"implementation\": {\n            \"status\": \"spec-only\",\n            \"handler\": \"beast:moss-armor-accumulation\",\n            \"version\": 1,\n            \"requiresHostAdapter\": true\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:moss-armor-accumulation\",\n            \"implementationVersion\": 1,\n            \"name\": \"苔甲凝积\",\n            \"effect\": \"每次实际受创叠1层苔凝，每层永久提高防御素质10%、肉体强度5%，上限12层；每满4层额外获得5%固定减伤，最多15%。持续伤害不叠层。\",\n            \"params\": {\n              \"trigger\": \"actual-damage-received\",\n              \"excludeDamageTags\": [\n                \"dot\"\n              ],\n              \"defensePerStack\": 0.1,\n              \"bodyPerStack\": 0.05,\n              \"maxStacks\": 12,\n              \"reductionEveryStacks\": 4,\n              \"reductionPerStep\": 0.05,\n              \"maxReduction\": 0.15,\n              \"stackLifetime\": \"permanent\",\n              \"saveFields\": [\n                \"mossStacks\"\n              ],\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"spec-only\",\n            \"requiresHostAdapter\": true,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": [\n                \"mossStacks\"\n              ]\n            }\n          }\n        }\n      ],\n      \"years\": 100000,\n      \"available\": true,\n      \"battleTags\": [\n        \"hunt\"\n      ],\n      \"lifeType\": \"生活\",\n      \"level\": 91,\n      \"panel\": {\n        \"level\": 91,\n        \"rings\": 9,\n        \"benchmark\": 500,\n        \"ratingProfile\": \"npc\",\n        \"stats\": {\n          \"B\": 650,\n          \"S\": 525,\n          \"C\": 425,\n          \"D\": 1125,\n          \"A\": 1025,\n          \"P\": 1025,\n          \"W\": 77\n        },\n        \"derived\": {\n          \"HP\": 4770,\n          \"baseMP\": 2685,\n          \"MP\": 4028,\n          \"SH\": 8420,\n          \"PA\": 563.75,\n          \"SA\": 456.25,\n          \"MA\": 830,\n          \"DEF\": 702.5,\n          \"MDEF\": 545.6,\n          \"costReduction\": 32.5,\n          \"castReduction\": 30,\n          \"controlGrowth\": 2.5\n        },\n        \"rating\": \"强级\",\n        \"ratingScore\": 1.59\n      },\n      \"statBasis\": {\n        \"level\": 91,\n        \"benchmark\": 500,\n        \"W\": 77,\n        \"ratios\": [\n          1.3,\n          1.05,\n          0.85,\n          2.25,\n          2.05,\n          2.05\n        ],\n        \"bloodlineModifiesStats\": false,\n        \"note\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\"\n      },\n      \"traitInheritanceVersion\": 1,\n      \"ringReward\": {\n        \"years\": 100000,\n        \"description\": \"十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技\"\n      },\n      \"bone\": {\n        \"slot\": \"random\",\n        \"slotPolicy\": \"uniform-six\",\n        \"description\": \"胜利后从六个常规部位等概率抽取一次，不采用原表部位，不生成外附骨；抽中结果随奖励事务保存\"\n      },\n      \"exitRule\": \"hp-or-spirit-zero\",\n      \"implementation\": {\n        \"status\": \"catalogued\",\n        \"hostIntegrated\": false,\n        \"skills\": \"operations-spec\",\n        \"traits\": \"spec-only\",\n        \"inheritanceHandlers\": \"spec-only\"\n      }\n    },\n    {\n      \"id\": \"frost-gnat\",\n      \"name\": \"霜蚋\",\n      \"version\": 1,\n      \"style\": \"敏攻\",\n      \"elements\": [\n        \"冰\"\n      ],\n      \"statDice\": [\n        9,\n        6,\n        1,\n        5,\n        10,\n        8\n      ],\n      \"statRatios\": [\n        2.05,\n        1.63,\n        0.85,\n        1.55,\n        2.25,\n        1.82\n      ],\n      \"bloodline\": {\n        \"roll\": 2,\n        \"name\": \"凡血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"虫类·蚋（双翅目）\",\n      \"size\": \"微（指掌以下）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"不可考，换过太多次壳\",\n      \"habitat\": \"冰原裂隙与积雪层下的暖缝，那一线不结冰的缝就是它的领地。\",\n      \"appearance\": \"体长不足三分，通体冰蓝半透，翅薄如霜且几乎不反光。飞行时肉眼只能看到一点雪屑似的浮动。口器细长如针，腹末两根短刺。\",\n      \"habits\": \"终生独居，不结群、不筑巢。以极高速度在雪面跳点，用口针吸取体温与少量魂力；极惧光，日间深藏隙中。\",\n      \"role\": \"异种·首领——体型最小、最难打的十万年魂兽。\",\n      \"battleText\": \"一粒雪屑停在你的感知边缘，下一瞬却已掠至近前。冰蓝的薄翅无声展开，脚下的雪地渐渐凝成霜域。\",\n      \"defeatText\": \"薄翅终于停止震颤，最后一层冰壳碎成细雪。霜域消退，猩红魂环在雪面上凝聚。\",\n      \"talents\": [\n        {\n          \"name\": \"霜针\",\n          \"effect\": \"口器刺入时注入寒气，伤口不流血而是结霜。\"\n        },\n        {\n          \"name\": \"雪屑掩形\",\n          \"effect\": \"高速移动时翅膜散出细霜，短时间内难以锁定其位置。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"霜针\",\n          \"category\": \"攻击\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理原始伤害 2957；命中后按防御力减伤\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 361,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 8,\n          \"ring\": 1,\n          \"years\": 10000,\n          \"effectSeed\": \"|1|10000|0\",\n          \"damageMode\": \"direct\",\n          \"attackSubtype\": \"direct\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 361,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"frost-gnat-skill-1\",\n          \"skillIndex\": 1,\n          \"element\": \"冰\",\n          \"description\": \"掠近目标，以冰针般的口器完成一次迅疾刺击。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-gnat:skill:1\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"direct_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.2,\n              \"element\": \"冰\",\n              \"elements\": [\n                \"冰\"\n              ]\n            }\n          ],\n          \"attribute\": \"冰\",\n          \"elements\": [\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1\n        },\n        {\n          \"name\": \"雪屑掩形\",\n          \"category\": \"强化\",\n          \"channel\": \"物理\",\n          \"target\": \"自己\",\n          \"effect\": \"自身敏捷提高33.6%，持续整场，同技能不叠加\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 215,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 8,\n          \"ring\": 2,\n          \"years\": 10000,\n          \"previewCost\": 215,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"frost-gnat-skill-2\",\n          \"skillIndex\": 2,\n          \"element\": \"冰\",\n          \"description\": \"翅膜散霜，借细雪遮掩行迹，提高自身敏捷。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-gnat:skill:2\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"battle_stat_up\",\n              \"values\": {\n                \"A\": 0.336\n              },\n              \"lifetime\": \"battle\",\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"refillResources\": false,\n              \"element\": \"冰\",\n              \"elements\": [\n                \"冰\"\n              ]\n            }\n          ],\n          \"agility\": 0.336,\n          \"attribute\": \"冰\",\n          \"elements\": [\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1\n        },\n        {\n          \"name\": \"寒痕入骨\",\n          \"category\": \"持续伤害\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"物理总原始伤害 3450，分3次每3秒一跳，同技能不叠层\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 400,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 8,\n          \"ring\": 3,\n          \"years\": 10000,\n          \"damageNature\": \"residual\",\n          \"effectSeed\": \"|3|10000|0\",\n          \"damageMode\": \"periodic\",\n          \"attackSubtype\": \"periodic\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 400,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"frost-gnat-skill-3\",\n          \"skillIndex\": 3,\n          \"element\": \"冰\",\n          \"description\": \"将寒气留在创口，分三次侵蚀目标，不重复叠加同一寒痕。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-gnat:skill:3\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"periodic_attack\",\n              \"channel\": \"物理\",\n              \"factor\": 1.4,\n              \"parts\": 3,\n              \"intervalSeconds\": 3,\n              \"element\": \"冰\",\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"elements\": [\n                \"冰\"\n              ]\n            }\n          ],\n          \"attribute\": \"冰\",\n          \"elements\": [\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1\n        },\n        {\n          \"name\": \"掠影断脉\",\n          \"category\": \"控制\",\n          \"channel\": \"物理\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"基础控制 2.4秒；实际成功率与时长受双方精神力影响，结束后4秒免控\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 244,\n          \"costFraction\": 0.15,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 10,\n          \"ring\": 4,\n          \"years\": 10000,\n          \"previewCost\": 244,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"frost-gnat-skill-4\",\n          \"skillIndex\": 4,\n          \"element\": \"冰\",\n          \"description\": \"疾掠时刺向魂力流转的间隙；判定成功后短暂打断并控制目标。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"frost-gnat:skill:4\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"control_contest\",\n              \"baseSeconds\": 2.4,\n              \"interrupt\": true,\n              \"immunitySeconds\": 4,\n              \"element\": \"冰\",\n              \"elements\": [\n                \"冰\"\n              ]\n            }\n          ],\n          \"baseControl\": 2.4,\n          \"attribute\": \"冰\",\n          \"elements\": [\n            \"冰\"\n          ],\n          \"attributeTags\": [\n            \"冰\"\n          ],\n          \"attributeRulesVersion\": 1\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"ice-shell-preservation\",\n          \"name\": \"冰壳护生\",\n          \"effect\": \"受击时先生成最大生命80%的冰壳护盾，每回合自行重结一次；未破可叠加，最多两层。冰壳击破时，向攻击者反弹该层已吸收伤害的30%，冰屑穿透护盾；越盾真伤无视冰壳。\",\n          \"params\": {\n            \"preHitShieldMaxHP\": 0.8,\n            \"renewPerOwnerTurn\": 1,\n            \"maxLayers\": 2,\n            \"reflectionRate\": 0.3,\n            \"reflectionElement\": \"冰\",\n            \"reflectionBypassShield\": true,\n            \"bypassedByTags\": [\n              \"shield-bypass-true-damage\"\n            ]\n          },\n          \"implementation\": {\n            \"status\": \"spec-only\",\n            \"handler\": \"beast:ice-shell-preservation\",\n            \"version\": 1,\n            \"requiresHostAdapter\": true\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:ice-shell-preservation\",\n            \"implementationVersion\": 1,\n            \"name\": \"冰壳护生\",\n            \"effect\": \"受击时先生成最大生命80%的冰壳护盾，每回合自行重结一次；未破可叠加，最多两层。冰壳击破时，向攻击者反弹该层已吸收伤害的30%，冰屑穿透护盾；越盾真伤无视冰壳。\",\n            \"params\": {\n              \"preHitShieldMaxHP\": 0.8,\n              \"renewPerOwnerTurn\": 1,\n              \"maxLayers\": 2,\n              \"reflectionRate\": 0.3,\n              \"reflectionElement\": \"冰\",\n              \"reflectionBypassShield\": true,\n              \"bypassedByTags\": [\n                \"shield-bypass-true-damage\"\n              ],\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"spec-only\",\n            \"requiresHostAdapter\": true,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        },\n        {\n          \"id\": \"frost-domain\",\n          \"name\": \"霜域\",\n          \"effect\": \"展开不可驱散的霜域，持续整场。非冰属性单位读条速度降低20%、行动条速度降低15%；冰属性单位（含自身）每回合敏捷提高5%。每2回合加深一档，最多3档，最终读条速度降低35%、行动条速度降低25%。驱散技能可压住霜域一回合。\",\n          \"params\": {\n            \"lifetime\": \"battle\",\n            \"dispellable\": false,\n            \"suppressibleByDispelOwnerTurns\": 1,\n            \"tiers\": [\n              {\n                \"castSpeedDown\": 0.2,\n                \"gaugeSpeedDown\": 0.15\n              },\n              {\n                \"castSpeedDown\": 0.275,\n                \"gaugeSpeedDown\": 0.2\n              },\n              {\n                \"castSpeedDown\": 0.35,\n                \"gaugeSpeedDown\": 0.25\n              }\n            ],\n            \"deepenEveryOwnerTurns\": 2,\n            \"iceUnitAgilityPerTurn\": 0.05,\n            \"iceAgilityStackLifetime\": \"battle\",\n            \"tierInterpolation\": \"中间档按两端线性取值；待后续调数值\"\n          },\n          \"implementation\": {\n            \"status\": \"spec-only\",\n            \"handler\": \"beast:frost-domain\",\n            \"version\": 1,\n            \"requiresHostAdapter\": true\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:frost-domain\",\n            \"implementationVersion\": 1,\n            \"name\": \"霜域\",\n            \"effect\": \"展开不可驱散的霜域，持续整场。非冰属性单位读条速度降低20%、行动条速度降低15%；冰属性单位（含自身）每回合敏捷提高5%。每2回合加深一档，最多3档，最终读条速度降低35%、行动条速度降低25%。驱散技能可压住霜域一回合。\",\n            \"params\": {\n              \"lifetime\": \"battle\",\n              \"dispellable\": false,\n              \"suppressibleByDispelOwnerTurns\": 1,\n              \"tiers\": [\n                {\n                  \"castSpeedDown\": 0.2,\n                  \"gaugeSpeedDown\": 0.15\n                },\n                {\n                  \"castSpeedDown\": 0.275,\n                  \"gaugeSpeedDown\": 0.2\n                },\n                {\n                  \"castSpeedDown\": 0.35,\n                  \"gaugeSpeedDown\": 0.25\n                }\n              ],\n              \"deepenEveryOwnerTurns\": 2,\n              \"iceUnitAgilityPerTurn\": 0.05,\n              \"iceAgilityStackLifetime\": \"battle\",\n              \"tierInterpolation\": \"中间档按两端线性取值；待后续调数值\",\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"spec-only\",\n            \"requiresHostAdapter\": true,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        }\n      ],\n      \"years\": 100000,\n      \"available\": true,\n      \"battleTags\": [\n        \"hunt\"\n      ],\n      \"lifeType\": \"生活\",\n      \"level\": 91,\n      \"panel\": {\n        \"level\": 91,\n        \"rings\": 9,\n        \"benchmark\": 500,\n        \"ratingProfile\": \"npc\",\n        \"stats\": {\n          \"B\": 1025,\n          \"S\": 815,\n          \"C\": 425,\n          \"D\": 775,\n          \"A\": 1125,\n          \"P\": 910,\n          \"W\": 77\n        },\n        \"derived\": {\n          \"HP\": 7395,\n          \"baseMP\": 4135,\n          \"MP\": 6203,\n          \"SH\": 7500,\n          \"PA\": 880,\n          \"SA\": 702.75,\n          \"MA\": 738,\n          \"DEF\": 602.5,\n          \"MDEF\": 488.1,\n          \"costReduction\": 32.5,\n          \"castReduction\": 30,\n          \"controlGrowth\": 2.5\n        },\n        \"rating\": \"凶级\",\n        \"ratingScore\": 1.69\n      },\n      \"statBasis\": {\n        \"level\": 91,\n        \"benchmark\": 500,\n        \"W\": 77,\n        \"ratios\": [\n          2.05,\n          1.63,\n          0.85,\n          1.55,\n          2.25,\n          1.82\n        ],\n        \"bloodlineModifiesStats\": false,\n        \"note\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\"\n      },\n      \"traitInheritanceVersion\": 1,\n      \"ringReward\": {\n        \"years\": 100000,\n        \"description\": \"十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技\"\n      },\n      \"bone\": {\n        \"slot\": \"random\",\n        \"slotPolicy\": \"uniform-six\",\n        \"description\": \"胜利后从六个常规部位等概率抽取一次，不采用原表部位，不生成外附骨；抽中结果随奖励事务保存\"\n      },\n      \"exitRule\": \"hp-or-spirit-zero\",\n      \"implementation\": {\n        \"status\": \"catalogued\",\n        \"hostIntegrated\": false,\n        \"skills\": \"operations-spec\",\n        \"traits\": \"spec-only\",\n        \"inheritanceHandlers\": \"spec-only\"\n      }\n    },\n    {\n      \"id\": \"abyss-imperial-salamander\",\n      \"name\": \"沧渊帝螈\",\n      \"version\": 1,\n      \"style\": \"控制\",\n      \"elements\": [\n        \"水\"\n      ],\n      \"statDice\": [\n        8,\n        10,\n        2,\n        4,\n        8,\n        7\n      ],\n      \"statRatios\": [\n        1.82,\n        2.25,\n        1.05,\n        1.4,\n        1.82,\n        1.72\n      ],\n      \"bloodline\": {\n        \"roll\": 9,\n        \"name\": \"帝血\",\n        \"modifiesStats\": false\n      },\n      \"species\": \"两栖纲·鲵\",\n      \"size\": \"中（马牛级）\",\n      \"sociality\": \"独居\",\n      \"actualAge\": \"约十二万年\",\n      \"habitat\": \"地下暗河汇成的深潭，水面常年浮一层不散的白气。\",\n      \"appearance\": \"大小如牛犊的鲵，通体青灰近墨，皮肤湿滑。头部两侧生有鳍状冠，冠缘不断逸出淡蓝色光雾。\",\n      \"habits\": \"独居且极静，魂力庞大而难以收束。泄露的魂力驱动附近水流，自行形成压迫与吸取。\",\n      \"role\": \"首领——深潭区域的唯一强敌，擅长把战斗拖长到自己回满。\",\n      \"battleText\": \"潭底亮起两道幽光，逸散的魂力令四周水汽骤然下沉。沧渊帝螈浮出暗河，鳍冠间的蓝雾正牵动整片深潭。\",\n      \"defeatText\": \"鳍冠间的蓝雾渐渐熄灭，沉重的水压终于散去。沧渊帝螈伏入浅水，猩红魂环随涟漪升起。\",\n      \"talents\": [\n        {\n          \"name\": \"沧澜压\",\n          \"effect\": \"潭水骤然加重，范围内所有单位的读条与行动被拖慢。\"\n        },\n        {\n          \"name\": \"引潮\",\n          \"effect\": \"外泄魂力自行抽取周围单位逸散的魂力，补回自身。\"\n        }\n      ],\n      \"skills\": [\n        {\n          \"name\": \"沧澜压\",\n          \"category\": \"控制\",\n          \"channel\": \"能量\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"基础控制 2.4秒；实际成功率与时长受双方精神力影响，结束后4秒免控\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 299,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 10,\n          \"ring\": 1,\n          \"years\": 10000,\n          \"previewCost\": 299,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"abyss-imperial-salamander-skill-1\",\n          \"skillIndex\": 1,\n          \"element\": \"水\",\n          \"description\": \"将水压收束在一名敌人身上，控制成功后打断其行动。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"abyss-imperial-salamander:skill:1\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"control_contest\",\n              \"baseSeconds\": 2.4,\n              \"interrupt\": true,\n              \"immunitySeconds\": 4,\n              \"element\": \"水\",\n              \"elements\": [\n                \"水\"\n              ]\n            }\n          ],\n          \"baseControl\": 2.4,\n          \"attribute\": \"水\",\n          \"elements\": [\n            \"水\"\n          ],\n          \"attributeTags\": [\n            \"水\"\n          ],\n          \"attributeRulesVersion\": 1\n        },\n        {\n          \"name\": \"潭流冲击\",\n          \"category\": \"攻击\",\n          \"channel\": \"能量\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"能量原始伤害 3247；命中后按防御力减伤\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 441,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 8,\n          \"ring\": 2,\n          \"years\": 10000,\n          \"effectSeed\": \"|2|10000|0\",\n          \"damageMode\": \"direct\",\n          \"attackSubtype\": \"direct\",\n          \"generationVersion\": 1007,\n          \"previewCost\": 441,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"abyss-imperial-salamander-skill-2\",\n          \"skillIndex\": 2,\n          \"element\": \"水\",\n          \"description\": \"释放一道沉重水流，造成单次能量伤害。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"abyss-imperial-salamander:skill:2\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"direct_attack\",\n              \"channel\": \"能量\",\n              \"factor\": 1.2,\n              \"element\": \"水\",\n              \"elements\": [\n                \"水\"\n              ]\n            }\n          ],\n          \"attribute\": \"水\",\n          \"elements\": [\n            \"水\"\n          ],\n          \"attributeTags\": [\n            \"水\"\n          ],\n          \"attributeRulesVersion\": 1\n        },\n        {\n          \"name\": \"滞水缠身\",\n          \"category\": \"减益\",\n          \"channel\": \"能量\",\n          \"target\": \"一名敌人\",\n          \"effect\": \"目标敏捷降低28%，持续6秒；按双方精神力与稳定进行减益判定\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 262,\n          \"costFraction\": 0.1,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 8,\n          \"ring\": 3,\n          \"years\": 10000,\n          \"previewCost\": 262,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"abyss-imperial-salamander-skill-3\",\n          \"skillIndex\": 3,\n          \"element\": \"水\",\n          \"description\": \"黏滞水流缠住目标，精神对抗成功后降低其敏捷。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"abyss-imperial-salamander:skill:3\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"numeric_debuff\",\n              \"values\": {\n                \"A\": 0.28\n              },\n              \"ttlSeconds\": 6,\n              \"sameSourcePolicy\": \"refresh-not-stack\",\n              \"contest\": \"spirit-and-stability\",\n              \"element\": \"水\",\n              \"elements\": [\n                \"水\"\n              ]\n            }\n          ],\n          \"attribute\": \"水\",\n          \"elements\": [\n            \"水\"\n          ],\n          \"attributeTags\": [\n            \"水\"\n          ],\n          \"attributeRulesVersion\": 1\n        },\n        {\n          \"name\": \"回潮护身\",\n          \"category\": \"防御\",\n          \"channel\": \"生命\",\n          \"target\": \"自己\",\n          \"effect\": \"生命护盾 1217，持续8秒\",\n          \"q\": 2.8,\n          \"K\": 1,\n          \"Q\": 2.8,\n          \"cost\": 273,\n          \"costFraction\": 0.15,\n          \"highest\": false,\n          \"cast\": 1.23,\n          \"cooldown\": 8,\n          \"ring\": 4,\n          \"years\": 10000,\n          \"previewCost\": 273,\n          \"previewCast\": 1.23,\n          \"previewRulesVersion\": 17,\n          \"id\": \"abyss-imperial-salamander-skill-4\",\n          \"skillIndex\": 4,\n          \"element\": \"水\",\n          \"description\": \"以回旋水流包覆身体，生成生命护盾。\",\n          \"factor\": 1,\n          \"budgetFactor\": 1,\n          \"cooldownGroup\": \"abyss-imperial-salamander:skill:4\",\n          \"strengthReference\": {\n            \"years\": 10000,\n            \"band\": \"万年最低档\",\n            \"q\": 2.8,\n            \"K\": 1,\n            \"Q\": 2.8,\n            \"bloodlineMultiplier\": false\n          },\n          \"operations\": [\n            {\n              \"type\": \"shield\",\n              \"channel\": \"生命\",\n              \"coefficient\": 0.45,\n              \"power\": \"Q*SA\",\n              \"ttlSeconds\": 8,\n              \"element\": \"水\",\n              \"elements\": [\n                \"水\"\n              ]\n            }\n          ],\n          \"attribute\": \"水\",\n          \"elements\": [\n            \"水\"\n          ],\n          \"attributeTags\": [\n            \"水\"\n          ],\n          \"attributeRulesVersion\": 1\n        }\n      ],\n      \"traits\": [\n        {\n          \"id\": \"oppressive-tides\",\n          \"name\": \"沧澜压境\",\n          \"effect\": \"每次受到攻击后，对攻击者施加滞流：读条速度降低20%、行动条速度降低15%，持续6秒，可叠3层；同时该目标本回合魂力消耗提高30%。无魂力单位只受减速，不受费用惩罚。\",\n          \"params\": {\n            \"trigger\": \"attack-received\",\n            \"castSpeedDownPerStack\": 0.2,\n            \"gaugeSpeedDownPerStack\": 0.15,\n            \"maxStacks\": 3,\n            \"durationSeconds\": 6,\n            \"costUp\": 0.3,\n            \"costDuration\": \"target-current-turn\",\n            \"excludeResourceFreeUnits\": true\n          },\n          \"implementation\": {\n            \"status\": \"spec-only\",\n            \"handler\": \"beast:oppressive-tides\",\n            \"version\": 1,\n            \"requiresHostAdapter\": true\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:oppressive-tides\",\n            \"implementationVersion\": 1,\n            \"name\": \"沧澜压境\",\n            \"effect\": \"每次受到攻击后，对攻击者施加滞流：读条速度降低20%、行动条速度降低15%，持续6秒，可叠3层；同时该目标本回合魂力消耗提高30%。无魂力单位只受减速，不受费用惩罚。\",\n            \"params\": {\n              \"trigger\": \"attack-received\",\n              \"castSpeedDownPerStack\": 0.2,\n              \"gaugeSpeedDownPerStack\": 0.15,\n              \"maxStacks\": 3,\n              \"durationSeconds\": 6,\n              \"costUp\": 0.3,\n              \"costDuration\": \"target-current-turn\",\n              \"excludeResourceFreeUnits\": true,\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"spec-only\",\n            \"requiresHostAdapter\": true,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        },\n        {\n          \"id\": \"devouring-soul-recovery\",\n          \"name\": \"吞噬回魂\",\n          \"effect\": \"每回合结束回复最大魂力8%。场上任一单位消耗魂力时，吸收其实际消耗量的30%转为自身魂力。魂力满溢部分转为护盾，每回合最多生成最大生命10%的护盾。被封锁或禁绝效果命中时，该回合不吸收。\",\n          \"params\": {\n            \"endTurnMaxMPRate\": 0.08,\n            \"manaSpentSiphonRate\": 0.3,\n            \"manaSpentScope\": \"all-units-including-self\",\n            \"overflowShieldRate\": 1,\n            \"overflowShieldPerTurnMaxHP\": 0.1,\n            \"sealTags\": [\n              \"resource_seal\",\n              \"resource_prohibition\"\n            ],\n            \"siphonTransfersOpponentMana\": false,\n            \"resourceRecoveryTriggersSiphon\": false\n          },\n          \"implementation\": {\n            \"status\": \"spec-only\",\n            \"handler\": \"beast:devouring-soul-recovery\",\n            \"version\": 1,\n            \"requiresHostAdapter\": true\n          },\n          \"inherit\": {\n            \"handler\": \"inherit:devouring-soul-recovery\",\n            \"implementationVersion\": 1,\n            \"name\": \"吞噬回魂\",\n            \"effect\": \"每回合结束回复最大魂力8%。场上任一单位消耗魂力时，吸收其实际消耗量的30%转为自身魂力。魂力满溢部分转为护盾，每回合最多生成最大生命10%的护盾。被封锁或禁绝效果命中时，该回合不吸收。\",\n            \"params\": {\n              \"endTurnMaxMPRate\": 0.08,\n              \"manaSpentSiphonRate\": 0.3,\n              \"manaSpentScope\": \"all-units-including-self\",\n              \"overflowShieldRate\": 1,\n              \"overflowShieldPerTurnMaxHP\": 0.1,\n              \"sealTags\": [\n                \"resource_seal\",\n                \"resource_prohibition\"\n              ],\n              \"siphonTransfersOpponentMana\": false,\n              \"resourceRecoveryTriggersSiphon\": false,\n              \"sourceOwner\": \"equipped-bone-owner\"\n            },\n            \"implementationStatus\": \"spec-only\",\n            \"requiresHostAdapter\": true,\n            \"save\": {\n              \"schemaVersion\": 1,\n              \"fields\": []\n            }\n          }\n        }\n      ],\n      \"years\": 100000,\n      \"available\": true,\n      \"battleTags\": [\n        \"hunt\"\n      ],\n      \"lifeType\": \"生活\",\n      \"level\": 91,\n      \"panel\": {\n        \"level\": 91,\n        \"rings\": 9,\n        \"benchmark\": 500,\n        \"ratingProfile\": \"npc\",\n        \"stats\": {\n          \"B\": 910,\n          \"S\": 1125,\n          \"C\": 525,\n          \"D\": 700,\n          \"A\": 910,\n          \"P\": 860,\n          \"W\": 77\n        },\n        \"derived\": {\n          \"HP\": 6590,\n          \"baseMP\": 5685,\n          \"MP\": 8528,\n          \"SH\": 7100,\n          \"PA\": 882.75,\n          \"SA\": 966.25,\n          \"MA\": 698,\n          \"DEF\": 542,\n          \"MDEF\": 463.1,\n          \"costReduction\": 40,\n          \"castReduction\": 30,\n          \"controlGrowth\": 2.5\n        },\n        \"rating\": \"凶级\",\n        \"ratingScore\": 1.68\n      },\n      \"statBasis\": {\n        \"level\": 91,\n        \"benchmark\": 500,\n        \"W\": 77,\n        \"ratios\": [\n          1.82,\n          2.25,\n          1.05,\n          1.4,\n          1.82,\n          1.72\n        ],\n        \"bloodlineModifiesStats\": false,\n        \"note\": \"资料未指定战斗等级，暂以九环最低等级91级、基准500换算六维；不是把十万年当作100级。血脉不修正六维。\"\n      },\n      \"traitInheritanceVersion\": 1,\n      \"ringReward\": {\n        \"years\": 100000,\n        \"description\": \"十万年红色魂环，沿用现有第九环双技生成接口；魂兽四技不直接复制为魂环四技\"\n      },\n      \"bone\": {\n        \"slot\": \"random\",\n        \"slotPolicy\": \"uniform-six\",\n        \"description\": \"胜利后从六个常规部位等概率抽取一次，不采用原表部位，不生成外附骨；抽中结果随奖励事务保存\"\n      },\n      \"exitRule\": \"hp-or-spirit-zero\",\n      \"implementation\": {\n        \"status\": \"catalogued\",\n        \"hostIntegrated\": false,\n        \"skills\": \"operations-spec\",\n        \"traits\": \"spec-only\",\n        \"inheritanceHandlers\": \"spec-only\"\n      }\n    }\n  ]\n}", "/modules/data/npc/chengliang.json": "{\n  \"schemaVersion\": 1,\n  \"id\": \"chengliang\",\n  \"name\": \"程良\",\n  \"nationality\": \"斗灵\",\n  \"gender\": \"男\",\n  \"level\": 81,\n  \"style\": \"控制\",\n  \"role\": \"空间控制／友方护持\",\n  \"soul\": {\n    \"id\": \"friendly-soul-mofang\",\n    \"name\": \"魔方\",\n    \"tier\": 9,\n    \"main_kind\": \"器\",\n    \"subkind\": \"阵器\",\n    \"attribute\": \"空间\",\n    \"attribute_category\": \"无属性\",\n    \"elements\": [],\n    \"mechanisms\": [\n      \"空间\"\n    ],\n    \"spirit_specialist\": false,\n    \"release_options\": [\n      \"召出\"\n    ],\n    \"balance\": [\n      0,\n      0,\n      0,\n      0,\n      0,\n      0\n    ],\n    \"basicChannel\": \"物理\"\n  },\n  \"release\": \"召出\",\n  \"rating\": \"狂级\",\n  \"ratingRatio\": 1.9,\n  \"model\": {\n    \"level\": 81,\n    \"rings\": 8,\n    \"benchmark\": 390,\n    \"stats\": {\n      \"B\": 652.08,\n      \"S\": 681.72,\n      \"C\": 918.84,\n      \"D\": 548.34,\n      \"A\": 785.46,\n      \"P\": 859.56,\n      \"W\": 80\n    },\n    \"derived\": {\n      \"HP\": 4785,\n      \"baseMP\": 3469,\n      \"MP\": 5203,\n      \"SH\": 7096,\n      \"PA\": 604.28,\n      \"SA\": 589.46,\n      \"MA\": 697.65,\n      \"DEF\": 414.59,\n      \"MDEF\": 463.78,\n      \"costReduction\": 40,\n      \"castReduction\": 30,\n      \"controlGrowth\": 2.5\n    },\n    \"breakdown\": {\n      \"B\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -20,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 246.08,\n        \"generated\": 406\n      },\n      \"S\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 10,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 130.72,\n        \"generated\": 551\n      },\n      \"C\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 20,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 338.84,\n        \"generated\": 580\n      },\n      \"D\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -10,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 132.34,\n        \"generated\": 416\n      },\n      \"A\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -10,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 350.46,\n        \"generated\": 435\n      },\n      \"P\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 10,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 346.56,\n        \"generated\": 513\n      },\n      \"W\": {\n        \"base\": 74,\n        \"grade\": 1,\n        \"style\": 0,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"deviation\": 6,\n        \"growth\": 0,\n        \"generated\": 80\n      }\n    },\n    \"ratingProfile\": \"npc\"\n  },\n  \"permanentProgress\": {\n    \"thiefQiStacks\": 0,\n    \"devourRemainder\": 0,\n    \"maximumStacks\": 10,\n    \"maximumRemainder\": 2,\n    \"carryAcrossBattles\": true\n  },\n  \"matureModel\": {\n    \"level\": 81,\n    \"rings\": 8,\n    \"benchmark\": 390,\n    \"stats\": {\n      \"B\": 1304.16,\n      \"S\": 681.72,\n      \"C\": 918.84,\n      \"D\": 548.34,\n      \"A\": 785.46,\n      \"P\": 859.56,\n      \"W\": 80\n    },\n    \"derived\": {\n      \"HP\": 9349,\n      \"baseMP\": 3469,\n      \"MP\": 5203,\n      \"SH\": 7096,\n      \"PA\": 1028.13,\n      \"SA\": 589.46,\n      \"MA\": 697.65,\n      \"DEF\": 545,\n      \"MDEF\": 463.78,\n      \"costReduction\": 40,\n      \"castReduction\": 30,\n      \"controlGrowth\": 2.5\n    },\n    \"breakdown\": {\n      \"B\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -20,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 246.08,\n        \"generated\": 406\n      },\n      \"S\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 10,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 130.72,\n        \"generated\": 551\n      },\n      \"C\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 20,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 338.84,\n        \"generated\": 580\n      },\n      \"D\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -10,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 132.34,\n        \"generated\": 416\n      },\n      \"A\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -10,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 350.46,\n        \"generated\": 435\n      },\n      \"P\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 10,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 346.56,\n        \"generated\": 513\n      },\n      \"W\": {\n        \"base\": 74,\n        \"grade\": 1,\n        \"style\": 0,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"deviation\": 6,\n        \"growth\": 0,\n        \"generated\": 80\n      }\n    },\n    \"ratingProfile\": \"npc\"\n  },\n  \"skills\": [\n    {\n      \"q\": 1.35,\n      \"K\": 2.2,\n      \"Q\": 2.97,\n      \"name\": \"演\",\n      \"category\": \"强化\",\n      \"channel\": \"能量\",\n      \"years\": 420,\n      \"target\": \"自己或一名队友\",\n      \"castFixed\": 0.7,\n      \"cooldown\": 14,\n      \"effect\": \"魔方推演已知的攻防变化，标记自己或一名队友。8秒内，其下一次攻击魂技的命中提高12个百分点，且该次准备时间缩短20%；开始施放时耗用。不能预知未知情报，也不改变伤害、冷却或骰果。\",\n      \"operations\": [\n        {\n          \"type\": \"next_attack_skill_accuracy\",\n          \"points\": 12,\n          \"uses\": 1,\n          \"ttlSeconds\": 8\n        },\n        {\n          \"type\": \"next_attack_skill_cast_multiplier\",\n          \"value\": 0.8,\n          \"sharedUse\": true\n        }\n      ],\n      \"id\": \"chengliang-skill-1\",\n      \"ring\": 1,\n      \"costPercent\": 0.06,\n      \"cost\": 125,\n      \"cast\": 0.7,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.35,\n      \"K\": 2.2,\n      \"Q\": 2.97,\n      \"name\": \"门\",\n      \"category\": \"防御\",\n      \"channel\": \"生命\",\n      \"years\": 760,\n      \"target\": \"自己或一名队友\",\n      \"castFixed\": 0.5,\n      \"cooldown\": 12,\n      \"effect\": \"在友方身侧展开相连的方门，6秒内为其转移一次冲击。下一次非精神直接攻击命中时，最终生命伤害减少45%，随后门扉闭合；不会增加行动机会，也不处理精神伤害、持续伤害或已结算的攻击。\",\n      \"operations\": [\n        {\n          \"type\": \"one_hit_damage_reduction\",\n          \"value\": 0.45,\n          \"channels\": [\n            \"物理\",\n            \"能量\"\n          ],\n          \"ttlSeconds\": 6,\n          \"directOnly\": true\n        }\n      ],\n      \"id\": \"chengliang-skill-2\",\n      \"ring\": 2,\n      \"costPercent\": 0.08,\n      \"cost\": 167,\n      \"cast\": 0.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.8,\n      \"K\": 2.2,\n      \"Q\": 3.96,\n      \"name\": \"锁\",\n      \"category\": \"控制\",\n      \"channel\": \"精神\",\n      \"years\": 1700,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1.1,\n      \"cooldown\": 16,\n      \"baseControl\": 3,\n      \"effect\": \"将魔方投影合拢在目标周围，按双方精神力与精神稳定进行普通控制判定。成功后打断读条，并以3秒为基础、按双方精神力比例结算禁锢；行动条压至最多40%，结束后获得4秒免控。目标仍可受伤，不进入不可选中状态；不永久封印敌人或拆除魂环。\",\n      \"operations\": [\n        {\n          \"type\": \"control_contest\",\n          \"baseSeconds\": 3,\n          \"ratio\": \"(100+attacker.P)/(100+defender.P)\",\n          \"interrupt\": true,\n          \"gaugeCeiling\": 0.4,\n          \"immunitySeconds\": 4\n        }\n      ],\n      \"id\": \"chengliang-skill-3\",\n      \"ring\": 3,\n      \"costPercent\": 0.09,\n      \"cost\": 202,\n      \"cast\": 1.1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.05,\n      \"K\": 2.2,\n      \"Q\": 4.51,\n      \"name\": \"封\",\n      \"category\": \"防御\",\n      \"channel\": \"生命\",\n      \"years\": 4800,\n      \"target\": \"自己\",\n      \"castFixed\": 1,\n      \"cooldown\": 18,\n      \"effect\": \"展开一层封存壁，获得0.65×Q×魂力攻击值的生命护盾，持续8秒。护盾实际吸收的能量直接伤害有50%封存为一份余能，至多为最大生命的15%。10秒内下一次攻击魂技命中后，以原能量伤害追加释放并按目标防御结算；未命中不释放，到期消散，不重复蓄存。场外仍可封存普通物品；战斗不调用师父预存魂技，也不收取敌方魂技或魂环。\",\n      \"operations\": [\n        {\n          \"type\": \"shield\",\n          \"coefficient\": 0.65,\n          \"power\": \"SA\",\n          \"ttlSeconds\": 8\n        },\n        {\n          \"type\": \"reserve_absorbed_energy\",\n          \"rate\": 0.5,\n          \"capMaxHP\": 0.15,\n          \"ttlSeconds\": 10,\n          \"slots\": 1\n        },\n        {\n          \"type\": \"next_attack_skill_hit_release\",\n          \"channel\": \"能量\",\n          \"mitigated\": true\n        }\n      ],\n      \"id\": \"chengliang-skill-4\",\n      \"ring\": 4,\n      \"costPercent\": 0.11,\n      \"cost\": 229,\n      \"cast\": 1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.2,\n      \"Q\": 6.16,\n      \"name\": \"隐\",\n      \"category\": \"防御\",\n      \"channel\": \"生命\",\n      \"years\": 11500,\n      \"target\": \"自己\",\n      \"castFixed\": 0.8,\n      \"cooldown\": 20,\n      \"effect\": \"将本体藏入裂隙，最多维持5秒。期间避开下一次非精神直接攻击，并立即回到现实；主动攻击也会提前现身。精神攻击、既有持续伤害与场地持续伤害照常结算。本回合不重开、不附送行动，也不能携带敌人进入裂隙。\",\n      \"operations\": [\n        {\n          \"type\": \"phase_avoid_once\",\n          \"channels\": [\n            \"物理\",\n            \"能量\"\n          ],\n          \"ttlSeconds\": 5,\n          \"directOnly\": true,\n          \"breakOnOffense\": true\n        }\n      ],\n      \"id\": \"chengliang-skill-5\",\n      \"ring\": 5,\n      \"costPercent\": 0.1,\n      \"cost\": 209,\n      \"cast\": 0.8,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.2,\n      \"Q\": 6.16,\n      \"name\": \"游\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 19000,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1,\n      \"cooldown\": 14,\n      \"factor\": 1.1,\n      \"effect\": \"以预先记下的坐标折跃至可交战位置，接续一记刀斩。造成1.2×Q×物理攻击值×1.10的原始伤害，再按命中、防御与护盾正常结算。本次命中额外提高10个百分点；不必中、不越盾、不额外触发一次普攻，也不将目标坐标重叠判为即死。\",\n      \"operations\": [\n        {\n          \"type\": \"direct_attack\",\n          \"factor\": 1.1,\n          \"channel\": \"物理\",\n          \"accuracyPoints\": 10\n        }\n      ],\n      \"id\": \"chengliang-skill-6\",\n      \"ring\": 6,\n      \"costPercent\": 0.12,\n      \"cost\": 517,\n      \"cast\": 1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.15,\n      \"K\": 2.2,\n      \"Q\": 6.93,\n      \"name\": \"虚空真身\",\n      \"category\": \"强化\",\n      \"channel\": \"能量\",\n      \"years\": 48000,\n      \"target\": \"自己\",\n      \"castFixed\": 1.6,\n      \"cooldown\": 32,\n      \"effect\": \"魔方展开为环绕周身的空间格架。12秒内魂力操纵提高20%、精神力提高15%、敏捷提高12%；沿用当前游戏的六维增益换算，不额外回满资源或提高生命上限。再次施放只刷新持续时间。空间转动作为护持与步法表现，不强制搬动敌人，不额外叠阵，也不改变三回合转位周期。\",\n      \"operations\": [\n        {\n          \"type\": \"temporary_stat_up\",\n          \"values\": {\n            \"C\": 0.2,\n            \"P\": 0.15,\n            \"A\": 0.12\n          },\n          \"ttlSeconds\": 12,\n          \"refreshOnly\": true,\n          \"refillResources\": false\n        }\n      ],\n      \"id\": \"chengliang-skill-7\",\n      \"ring\": 7,\n      \"costPercent\": 0.12,\n      \"cost\": 250,\n      \"cast\": 1.6,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.8,\n      \"K\": 2.2,\n      \"Q\": 8.36,\n      \"name\": \"解\",\n      \"category\": \"攻击\",\n      \"channel\": \"能量\",\n      \"years\": 88000,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1.4,\n      \"cooldown\": 20,\n      \"factor\": 0.9,\n      \"effect\": \"逆转魔方的结构，拆开目标最外层的生命护盾。先进行一次普通命中判定；成功后仅削去该护盾至多0.50×Q×魂力攻击值的盾量，再结算1.2×Q×魂力攻击值×0.90的能量攻击。没有生命护盾时仅造成攻击伤害。不能清除精神盾、无限次防护、角色固有机制或直接拆解生命；不重复判定命中，不同时拆除全部护盾。\",\n      \"operations\": [\n        {\n          \"type\": \"hit_contest_once\"\n        },\n        {\n          \"type\": \"reduce_outer_life_shield\",\n          \"coefficient\": 0.5,\n          \"power\": \"SA\",\n          \"layers\": 1\n        },\n        {\n          \"type\": \"direct_attack\",\n          \"factor\": 0.9,\n          \"channel\": \"能量\",\n          \"reuseHit\": true\n        }\n      ],\n      \"id\": \"chengliang-skill-8\",\n      \"ring\": 8,\n      \"costPercent\": 0.14,\n      \"cost\": 564,\n      \"cast\": 1.4,\n      \"extensionRequired\": true\n    }\n  ],\n  \"traits\": [\n    {\n      \"name\": \"周天格阵\",\n      \"effect\": \"开场布阵，持续至程良退场。每个有效个人回合开始时，所有在场敌人各叠1层困阵，每层敏捷降低5%；程良叠1层据阵，每层造成的伤害提高10%，两者各上限6层。每累计3个有效回合，先完成本回合叠层，再将双方层数分别减半并向下取整，随后继续累积。程良被控制时，暂停叠层与周期计数，已有层数保留；退场后清除本阵法的状态。\"\n    },\n    {\n      \"name\": \"六库仙贼\",\n      \"effect\": \"每个个人回合结束时回复最大生命的5%与最大魂力的5%，分别不超过各自上限。对有生命的受击实体造成实际生命伤害时，吸取该伤害的30%回复自身生命；不计算护盾、精神槽损失、过量伤害或自伤。每累计3次有效吞噬永久获得1层盗气，每层肉体强度提高10%，上限10层，跨战斗保留；满血仍可计吞噬次数，溢出治疗不转为护盾。免疫疲劳以及带衰老、腐坏标签的减益。对元素、灵体、构装、亡灵等无生命目标，吸血与盗气均不生效。\"\n    },\n    {\n      \"name\": \"易中日月\",\n      \"effect\": \"免疫幻象与伪装，面对分身、替身、虚影始终锁定真实本体。对高敏捷目标不计纯敏捷差造成的负向命中修正，完成闪避修正后的基础命中下限提高到60%。每个个人回合开始时锁定一名凝视对象，本回合对其命中提高8个百分点；该对象对程良造成的伤害同时提高10%，至下次选择或任一方退场。正向命中加成合计后最高97%，致盲等命中降低在保底之后结算，最终最低5%。识破不等于穿越位面或无视伤害免疫。\"\n    }\n  ],\n  \"implementation\": {\n    \"status\": \"specification-only\",\n    \"integrated\": false,\n    \"turnClock\": \"个人回合：从获得一次正常行动机会到该次行动结束；普攻、魂技、防御等正常行动均计，附赠普攻、持续伤害跳数、连击分段和凝视选择不额外计回合。\",\n    \"grid\": {\n      \"maxStacks\": 6,\n      \"agilityDownPerStack\": 0.05,\n      \"damageUpPerStack\": 0.1,\n      \"period\": 3,\n      \"rounding\": \"floor\",\n      \"order\": \"add-then-halve-before-action\",\n      \"pauseCounterWhileControlled\": true,\n      \"removeOnOwnerDefeat\": true\n    },\n    \"regeneration\": {\n      \"endTurnMaxHPRate\": 0.05,\n      \"lifestealRate\": 0.3,\n      \"eventsPerPermanentStack\": 3,\n      \"bodyUpPerPermanentStack\": 0.1,\n      \"maximumPermanentStacks\": 10,\n      \"appliesToLivingOnly\": true,\n      \"actualHPOnly\": true,\n      \"countAtFullHP\": true,\n      \"unclassifiedLifeType\": \"ineligible-until-tagged\",\n      \"raiseHPMaximumWithoutRefill\": true,\n      \"endTurnMaxMPRate\": 0.05\n    },\n    \"vision\": {\n      \"ignoreIllusion\": true,\n      \"ignoreDisguise\": true,\n      \"selectRealBody\": true,\n      \"ignoreNegativeAgilityDifference\": true,\n      \"preDebuffHitFloor\": 0.6,\n      \"gazeHitPoints\": 8,\n      \"gazeIncomingDamageMultiplier\": 1.1,\n      \"hitCap\": 0.97,\n      \"postDebuffHitFloor\": 0.05\n    },\n    \"requiredAdapters\": [\n      \"personal-turn-events\",\n      \"life-type-tags\",\n      \"permanent-npc-progress\",\n      \"scoped-grid-states\",\n      \"real-body-targeting\",\n      \"gaze-target-selection\",\n      \"per-hit-skill-extensions\"\n    ],\n    \"notes\": [\n      \"本项目是事件可读取的角色规范，未向主游戏注册，不能把operations直接传入旧战斗引擎当成已经实现的技能。\",\n      \"行动机会开始和结束各触发一次回合钩子；控制期间跳过场地钩子，不借无效指令刷层；连击、追击和防御反击均不能另开回合。\",\n      \"阵法伤害倍率作用于程良自己造成的已结算伤害；盗气不是场内临时buff，读取永久层数时只应用一次。\",\n      \"生命实体判定依据实际受击者，不凭其武魂是否元素属性推断；阵法来源清除只移除程良自己的状态。\",\n      \"演与易中日月、游的命中加成可以相加，最高97%；控制技能另走精神对抗，不将攻击命中保底套到控制成功率。\",\n      \"凝视每回合至多选择一次，可沿用上一存活敌人；不产生独立行动。多个友方使用者的场地来源需分别记账，不共享层数。\"\n    ]\n  }\n}", "/modules/data/npc/manifest.json": "{\n  \"rosterVersion\": 1,\n  \"copiedFrom\": \"../../../../../友方npc/characters\",\n  \"sourceNote\": \"友方npc 名录为独立规范，尚未接入主游戏战斗；本目录只保存只读快照。\",\n  \"files\": [\n    {\n      \"id\": \"chengliang\",\n      \"name\": \"程良\",\n      \"file\": \"chengliang.json\",\n      \"sha256\": \"1fc780214649005e0af03dc6db7b99d5e4a387807e9426f98fd5e676dec87633\",\n      \"bytes\": 18313,\n      \"level\": 81,\n      \"rating\": \"狂级\",\n      \"traitCount\": 3,\n      \"skillCount\": 8\n    },\n    {\n      \"id\": \"sailiya_fengzhi\",\n      \"name\": \"赛利亚·风织\",\n      \"file\": \"sailiya_fengzhi.json\",\n      \"sha256\": \"6713b447ef674e01bff431bb3d5823144fc8e653f236e5d0f4fe2dfb5a1fad87\",\n      \"bytes\": 19834,\n      \"level\": 81,\n      \"rating\": \"强级\",\n      \"traitCount\": 2,\n      \"skillCount\": 8\n    },\n    {\n      \"id\": \"xutaiping\",\n      \"name\": \"徐太平\",\n      \"file\": \"xutaiping.json\",\n      \"sha256\": \"5717eae771ae4027f04291489cefd942a1c8c18868d4f8db8d30a093fcc2c850\",\n      \"bytes\": 17969,\n      \"level\": 81,\n      \"rating\": \"强级\",\n      \"traitCount\": 2,\n      \"skillCount\": 8\n    }\n  ]\n}\n", "/modules/data/npc/sailiya_fengzhi.json": "{\n  \"schemaVersion\": 1,\n  \"id\": \"sailiya_fengzhi\",\n  \"name\": \"赛利亚·风织\",\n  \"aliases\": [\n    \"赛丽亚·风织\",\n    \"赛利亚\",\n    \"赛丽亚\"\n  ],\n  \"nationality\": \"斗灵\",\n  \"gender\": \"女\",\n  \"level\": 81,\n  \"stage\": \"魂斗罗\",\n  \"sect\": \"天枢宗·承露门\",\n  \"style\": \"敏攻\",\n  \"role\": \"敏攻双剑／符剑消耗／受伤回魂\",\n  \"soul\": {\n    \"id\": \"friendly-soul-tianhuiyujian\",\n    \"name\": \"天廻羽剑\",\n    \"tier\": 9,\n    \"main_kind\": \"器\",\n    \"subkind\": \"战斗\",\n    \"attribute\": \"风\",\n    \"attribute_category\": \"单属性\",\n    \"elements\": [\n      \"风\"\n    ],\n    \"mechanisms\": [],\n    \"spirit_specialist\": false,\n    \"release_options\": [\n      \"召出\"\n    ],\n    \"balance\": [\n      0,\n      0,\n      0,\n      0,\n      0,\n      0\n    ],\n    \"basicChannel\": \"物理\"\n  },\n  \"release\": \"召出\",\n  \"rating\": \"强级\",\n  \"ratingRatio\": 1.5,\n  \"appearance\": \"白色齐肩短发夹带黛色挑染，右手缠绕绷带；双持细长弯钩剑，黑白羽翼覆剑，靛青刃锋近乎隐形。\",\n  \"model\": {\n    \"level\": 81,\n    \"rings\": 8,\n    \"benchmark\": 390,\n    \"stats\": {\n      \"B\": 643.5,\n      \"S\": 666.9,\n      \"C\": 526.5,\n      \"D\": 339.3,\n      \"A\": 854.1,\n      \"P\": 479.7,\n      \"W\": 78\n    },\n    \"derived\": {\n      \"HP\": 4725,\n      \"baseMP\": 3395,\n      \"MP\": 7638,\n      \"SH\": 4058,\n      \"PA\": 595,\n      \"SA\": 576.87,\n      \"MA\": 393.76,\n      \"DEF\": 308.35,\n      \"MDEF\": 273.25,\n      \"costReduction\": 40,\n      \"castReduction\": 30,\n      \"controlGrowth\": 2.5\n    },\n    \"breakdown\": {\n      \"B\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 0,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 140.5,\n        \"generated\": 503\n      },\n      \"S\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 0,\n        \"shape\": 4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 163.9,\n        \"generated\": 503\n      },\n      \"C\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 10,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": -5.5,\n        \"generated\": 532\n      },\n      \"D\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -20,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": -28.7,\n        \"generated\": 368\n      },\n      \"A\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": 30,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 225.1,\n        \"generated\": 629\n      },\n      \"P\": {\n        \"base\": 390,\n        \"grade\": 1.24,\n        \"style\": -20,\n        \"shape\": -4,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 111.7,\n        \"generated\": 368\n      },\n      \"W\": {\n        \"base\": 74,\n        \"grade\": 1,\n        \"style\": 0,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"deviation\": 4,\n        \"growth\": 0,\n        \"generated\": 78\n      }\n    },\n    \"ratingProfile\": \"npc\"\n  },\n  \"skills\": [\n    {\n      \"q\": 1.35,\n      \"K\": 2.2,\n      \"Q\": 2.97,\n      \"name\": \"回羽双刺\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 420,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 0.6,\n      \"cooldown\": 6,\n      \"factor\": 0.75,\n      \"role\": \"快速双剑试探\",\n      \"effect\": \"双持细剑先后刺出，钩旋收刃。总原始伤害为1.2×Q×物理攻击值×0.75，均分为两段，各自命中与正常减伤；两段共用一次施放、一次冷却与一次符剑选择。准备短，适合寻找破绽，不附送第三次普攻。\",\n      \"operations\": [\n        {\n          \"type\": \"partitioned_attack\",\n          \"channel\": \"物理\",\n          \"factor\": 0.75,\n          \"parts\": 2,\n          \"hitPolicy\": \"per_part\",\n          \"sharedCast\": true,\n          \"sharedRuneActivation\": true\n        }\n      ],\n      \"id\": \"sailiya-skill-1\",\n      \"ring\": 1,\n      \"costPercent\": 0.1,\n      \"cost\": 228,\n      \"cast\": 0.6,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.35,\n      \"K\": 2.2,\n      \"Q\": 2.97,\n      \"name\": \"星月静谧\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 760,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1.5,\n      \"cooldown\": 16,\n      \"factor\": 0.95,\n      \"role\": \"蓄势点刺与读条干扰\",\n      \"effect\": \"星与月的光辉在双剑之间蓄成，随一记即沾即走的刺探迸发。造成1.2×Q×物理攻击值×0.95的原始伤害，按普通命中、防御与护盾结算。命中时若目标正在准备魂技，另作一次普通精神对抗；成功则打断，并以1秒为基础按精神力比例结算短控，随后保留4秒免控窗。目标没有读条时只造成伤害；不直接封死魂力循环。\",\n      \"operations\": [\n        {\n          \"type\": \"direct_attack\",\n          \"channel\": \"物理\",\n          \"factor\": 0.95\n        },\n        {\n          \"type\": \"conditional_control_contest\",\n          \"condition\": \"target_casting_and_attack_hit\",\n          \"baseSeconds\": 1,\n          \"immunitySeconds\": 4,\n          \"interrupt\": true\n        }\n      ],\n      \"id\": \"sailiya-skill-2\",\n      \"ring\": 2,\n      \"costPercent\": 0.12,\n      \"cost\": 265,\n      \"cast\": 1.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.8,\n      \"K\": 2.2,\n      \"Q\": 3.96,\n      \"name\": \"化羽华\",\n      \"category\": \"强化\",\n      \"channel\": \"能量\",\n      \"years\": 1700,\n      \"target\": \"自己\",\n      \"castFixed\": 1,\n      \"cooldown\": 20,\n      \"role\": \"血敕蓄羽，强化有限次数攻击\",\n      \"effect\": \"支付最大生命6%的生命费用，令黑白羽织自剑上生长，血色法符托住三枚风羽。随后三次攻击魂技的主攻击原始伤害提高15%，每次施放只消耗一枚，整次连击共用；三枚风羽保留至耗尽或战斗结束。重复施放只将余数补至三枚，不叠加增幅。施放须保证支付后仍存活；这笔生命费用不产生秘元，不治疗也不生成护盾。符剑以增强后的主攻击为基数，但不会再被单独增幅一次。\",\n      \"operations\": [\n        {\n          \"type\": \"hp_cost\",\n          \"maxHPRate\": 0.06,\n          \"mustRemainAlive\": true,\n          \"countsAsDamage\": false\n        },\n        {\n          \"type\": \"charged_attack_modifier\",\n          \"rawMultiplier\": 1.15,\n          \"charges\": 3,\n          \"maxCharges\": 3,\n          \"lifetime\": \"battle\",\n          \"recastPolicy\": \"refill-not-stack\",\n          \"consumePerCast\": 1,\n          \"applyToMainAttackOnly\": true\n        }\n      ],\n      \"id\": \"sailiya-skill-3\",\n      \"ring\": 3,\n      \"costPercent\": 0.09,\n      \"cost\": 184,\n      \"cast\": 1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.05,\n      \"K\": 2.2,\n      \"Q\": 4.51,\n      \"name\": \"天阑舞\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 4800,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 0.8,\n      \"cooldown\": 18,\n      \"factor\": 1.6,\n      \"role\": \"可被打断的持续剑舞\",\n      \"effect\": \"法符连血色燃起，双剑牵动黑白羽翼，将风卷成连续六次斩击。进入剑舞后，每0.5秒结算一段，总原始伤害为1.2×Q×物理攻击值×1.60，均分六段，各段独立命中、正常减伤。剑舞期间不能另起正常行动；被控制、打断或退场时，尚未挥出的斩击终止。一次剑舞只支付一次符剑附加费，附伤预算随实际挥出并命中的分段结算，未完成部分不追加伤害，也不退还已经支付的费用。\",\n      \"operations\": [\n        {\n          \"type\": \"channeled_partitioned_attack\",\n          \"channel\": \"物理\",\n          \"factor\": 1.6,\n          \"parts\": 6,\n          \"intervalSeconds\": 0.5,\n          \"hitPolicy\": \"per_part\",\n          \"interruptible\": true,\n          \"blockOtherActions\": true,\n          \"sharedRuneActivation\": true,\n          \"unexecutedParts\": \"discard\"\n        }\n      ],\n      \"id\": \"sailiya-skill-4\",\n      \"ring\": 4,\n      \"costPercent\": 0.15,\n      \"cost\": 533,\n      \"cast\": 0.8,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.2,\n      \"Q\": 6.16,\n      \"name\": \"牵丝风\",\n      \"category\": \"防御\",\n      \"channel\": \"生命\",\n      \"years\": 11500,\n      \"target\": \"自己\",\n      \"castFixed\": 0.5,\n      \"cooldown\": 12,\n      \"role\": \"有限偏斜，避开一次直接攻势\",\n      \"effect\": \"千丝之风牵引身形偏倚，保留一次偏斜机会，直至遭受下一次非精神直接攻击或本场战斗结束。该次攻击的命中额外降低25个百分点，无论最终命中与否均消耗机会；同来源不能囤积。它不提供减伤或护盾，不规避已有持续伤害；明确无视闪避、强制命中或已锁定空间的攻击不受这次偏斜影响。\",\n      \"operations\": [\n        {\n          \"type\": \"one_use_evasion\",\n          \"incomingHitPoints\": -25,\n          \"uses\": 1,\n          \"lifetime\": \"battle\",\n          \"channels\": [\n            \"物理\",\n            \"能量\"\n          ],\n          \"directOnly\": true,\n          \"consumeOnHitAttempt\": true,\n          \"ignoreAgainst\": [\n            \"bypass_evasion\",\n            \"forced_hit\",\n            \"space_lock\"\n          ],\n          \"maxStoredUses\": 1\n        }\n      ],\n      \"id\": \"sailiya-skill-5\",\n      \"ring\": 5,\n      \"costPercent\": 0.08,\n      \"cost\": 163,\n      \"cast\": 0.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.2,\n      \"Q\": 6.16,\n      \"name\": \"青红敕剑\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 19000,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1.2,\n      \"cooldown\": 18,\n      \"factor\": 0.85,\n      \"budgetFactor\": 1.25,\n      \"role\": \"双符合敕，先削生命盾再斩击\",\n      \"effect\": \"以断肠之红、真实之青合敕双剑。作一次普通命中判定；命中后先以0.45×Q×魂力攻击值削减目标最外层生命护盾，再造成1.2×Q×物理攻击值×0.85的物理原始伤害。削盾部分不足以摧毁护盾时，后续攻击仍正常受剩余护盾阻挡；没有生命护盾时，该部分不转为生命伤害。整式只附加一次符剑，削盾段不重复生成附伤基数，不移除精神盾、免疫或角色固有机制。\",\n      \"operations\": [\n        {\n          \"type\": \"hit_contest_once\"\n        },\n        {\n          \"type\": \"reduce_outer_life_shield\",\n          \"coefficient\": 0.45,\n          \"power\": \"SA\",\n          \"layers\": 1,\n          \"damageIfNoShield\": 0,\n          \"runeBasis\": false\n        },\n        {\n          \"type\": \"direct_attack\",\n          \"channel\": \"物理\",\n          \"factor\": 0.85,\n          \"reuseHit\": true\n        }\n      ],\n      \"id\": \"sailiya-skill-6\",\n      \"ring\": 6,\n      \"costPercent\": 0.14,\n      \"cost\": 563,\n      \"cast\": 1.2,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.15,\n      \"K\": 2.2,\n      \"Q\": 6.93,\n      \"name\": \"天廻真身\",\n      \"category\": \"强化\",\n      \"channel\": \"能量\",\n      \"years\": 48000,\n      \"target\": \"自己\",\n      \"castFixed\": 1.5,\n      \"cooldown\": 32,\n      \"role\": \"双剑真身，强化持续攻伐\",\n      \"effect\": \"黑白羽翼自双剑展开，靛青刃锋如细线贯入风中。本场战斗内物理攻击值提高20%，同来源重施不叠层。该效果作用于攻击值，不赠送额外斩击或回合，不提供新的减伤、治疗或魂力上限加成。秘元归宿体与符剑仍按各自规则结算。\",\n      \"operations\": [\n        {\n          \"type\": \"battle_attack_up\",\n          \"channel\": \"物理\",\n          \"value\": 0.2,\n          \"lifetime\": \"battle\",\n          \"sameSourcePolicy\": \"replace-not-stack\",\n          \"extraActions\": 0\n        }\n      ],\n      \"id\": \"sailiya-skill-7\",\n      \"ring\": 7,\n      \"costPercent\": 0.12,\n      \"cost\": 245,\n      \"cast\": 1.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.8,\n      \"K\": 2.2,\n      \"Q\": 8.36,\n      \"name\": \"万羽归风\",\n      \"category\": \"攻击\",\n      \"channel\": \"物理\",\n      \"years\": 88000,\n      \"target\": \"敌方全体\",\n      \"castFixed\": 2,\n      \"cooldown\": 26,\n      \"factor\": 1.25,\n      \"role\": \"分配总威力的群体终式\",\n      \"effect\": \"万千羽翼卷向剑锋，将乱舞尽数压入一阵纵横的风。整次原始伤害预算为1.2×Q×物理攻击值×1.25，在施放完成时所有存活敌人之间均分，各目标独立命中并按防御与护盾结算；未命中份额不转移给其他目标。整式只选择一次符剑、支付一次附加费，附伤按各目标主攻击份额分别结算，不因敌人数增加总伤害预算。目标数于施放完成时固定，不追补后来入场者。\",\n      \"operations\": [\n        {\n          \"type\": \"budgeted_area_attack\",\n          \"channel\": \"物理\",\n          \"factor\": 1.25,\n          \"totalBudgetFixed\": true,\n          \"splitPolicy\": \"equal_living_targets_at_release\",\n          \"hitPolicy\": \"per_target\",\n          \"missedShares\": \"discard\",\n          \"sharedRuneActivation\": true\n        }\n      ],\n      \"id\": \"sailiya-skill-8\",\n      \"ring\": 8,\n      \"costPercent\": 0.18,\n      \"cost\": 571,\n      \"cast\": 2,\n      \"extensionRequired\": true\n    }\n  ],\n  \"traits\": [\n    {\n      \"name\": \"承露符锋\",\n      \"effect\": \"每次普通攻击或攻击魂技施放时，可在正常费用之外，再支付本次实际魂力费用的50%，为整次攻击附加一次符剑。符剑以各主攻击段进入生命护盾与承伤分配前的有效伤害为基数，取其30%作为附伤原始值，自动选择目标元素抗性最低的一项，再结算对应元素抗性、护盾与承伤机制；主攻击已结算的普通防御不重复扣除。连击和群攻共享一次附加选择与费用，不因附伤再次触发。魂力不足时不能附加，但可只施放原攻击。被该次攻击命中的目标，若在抵挡主攻击或附伤时实际消耗魂力，对应的本次抵挡魂力费用翻倍；预先付费护盾不追溯收费，免费护盾、纯肉体承伤或绝对免伤不凭空产生费用。\"\n    },\n    {\n      \"name\": \"秘元归宿体\",\n      \"effect\": \"魂力上限提高50%，每个个人回合结束回复有效最大魂力的5%。自上次个人回合结束以来，真实受到的生命或精神护持伤害有20%凝为秘元，在本次回合末等量回复魂力，不超过魂力上限；护盾损失、过量伤害、主动支付的生命费用与自伤不计。若本次结算周期被带有封锁或禁绝标签的效果命中，则该周期不凝结秘元，待凝结量清空，不留到下一回合；其他回魂是否受阻依封锁效果本身结算。她不受隐匿与目标高速造成的命中惩罚，能锁定隐形或虚化目标，但仍受正常命中判定与明确伤害免疫约束。\"\n    }\n  ],\n  \"implementation\": {\n    \"status\": \"specification-only\",\n    \"integrated\": false,\n    \"numericStatusLifetime\": \"battle_or_consumed\",\n    \"turnClock\": \"个人回合以一次正常行动机会至行动结束计；连击分段、符剑附伤、持续伤害跳数不额外计回合。受伤凝元从上次回合末累计至本次回合末，包含待机期间的真实受伤。\",\n    \"runeEdge\": {\n      \"optional\": true,\n      \"extraCostRate\": 0.5,\n      \"extraCostRounding\": \"ceil\",\n      \"basisCost\": \"actual_main_attack_cost_before_rune_surcharge\",\n      \"damageRate\": 0.3,\n      \"damageBasis\": \"main_damage_after_hit_and_ordinary_defense_before_shields_and_resource_routing\",\n      \"additionalDamageMitigated\": true,\n      \"ordinaryDefenseAlreadyAccounted\": true,\n      \"lifeDamageOnly\": true,\n      \"includeShieldedMainDamage\": true,\n      \"excludeShieldStrip\": true,\n      \"activationUnit\": \"one_basic_or_one_skill_cast\",\n      \"partPolicy\": \"allocate_to_executed_hit_parts\",\n      \"targetPolicy\": \"allocate_to_main_target_shares\",\n      \"recursive\": false,\n      \"defenseResourceCostMultiplier\": 2,\n      \"defenseCostScope\": \"actual_on_hit_resource_cost_only\",\n      \"noRetroactiveShieldCastFees\": true,\n      \"zeroCostDefenseSurcharge\": 0,\n      \"multiplyCostOnlyOnce\": true,\n      \"elementSelection\": {\n        \"eligible\": [\n          \"金\",\n          \"木\",\n          \"水\",\n          \"火\",\n          \"土\",\n          \"毒\",\n          \"风\",\n          \"雷\",\n          \"光\",\n          \"暗\",\n          \"冰\"\n        ],\n        \"minimum\": \"effective_target_element_resistance\",\n        \"tiePriority\": [\n          \"风\",\n          \"金\",\n          \"木\",\n          \"水\",\n          \"火\",\n          \"土\",\n          \"毒\",\n          \"雷\",\n          \"光\",\n          \"暗\",\n          \"冰\"\n        ],\n        \"missingTableFallback\": \"neutral_energy_no_repeat_base_defense\",\n        \"mentalSlotEligible\": false,\n        \"ignoreImmunity\": false\n      }\n    },\n    \"secretOrigin\": {\n      \"maxMPMultiplier\": 1.5,\n      \"costBaseMPUnchanged\": true,\n      \"normalMaxMP\": 5092,\n      \"effectiveMaxMP\": 7638,\n      \"endTurnMPRecoveryRate\": 0.05,\n      \"damageToMPRecoveryRate\": 0.2,\n      \"poolLosses\": [\n        \"HP\",\n        \"SH\"\n      ],\n      \"exclude\": [\n        \"shield_loss\",\n        \"overkill\",\n        \"hp_cost\",\n        \"self_damage\",\n        \"resource_cost\"\n      ],\n      \"pendingExpires\": \"owner_turn_end\",\n      \"sealTags\": [\n        \"resource_seal\",\n        \"resource_prohibition\"\n      ],\n      \"discardPendingOnSeal\": true,\n      \"revives\": false,\n      \"endTurnRecoveryOrder\": [\n        \"max_mp_5percent\",\n        \"damage_conversion_20percent\"\n      ],\n      \"separateRecoveryEventIDs\": true\n    },\n    \"perception\": {\n      \"ignoreConcealmentAccuracyPenalty\": true,\n      \"ignoreNegativeAgilityDifference\": true,\n      \"canSelectInvisible\": true,\n      \"canSelectPhased\": true,\n      \"bypassHitRoll\": false,\n      \"bypassDamageImmunity\": false,\n      \"positiveHitCap\": 0.97,\n      \"negativeHitFloor\": 0.05\n    },\n    \"requiredAdapters\": [\n      \"optional_rune_payment\",\n      \"grouped_attack_budget\",\n      \"element_resistance_table\",\n      \"on_hit_defense_resource_fee\",\n      \"turn_end_recovery\",\n      \"actual_damage_ledger\",\n      \"resource_seal_tags\",\n      \"real_target_perception\",\n      \"charged_attack_modifier\",\n      \"interruptible_sword_dance\",\n      \"budgeted_area_attack\"\n    ],\n    \"notes\": [\n      \"符剑追踪整次施放标识；一击多段、群体攻击及符剑本身均不能递归征费或附伤。\",\n      \"免费攻击的本次费用为0时，符剑的50%附加费也为0；正数附加费向上取整。\",\n      \"默认不逐元素猜测抗性。缺少完整元素抗性数据时，附伤按中性能量附伤处理，不重复扣除主攻击已结算的普通防御，不臆造最低抗性或转为真实伤害、精神槽伤害。\",\n      \"倍耗只改变抵挡魂力的单价，不把同一笔伤害再复制一份。若某承伤机制原拟用90魂力抵挡90伤害，倍耗后需180魂力；仅余100魂力时最多抵挡50伤害，其余按原承伤规则回落。\",\n      \"幽行在护盾后的非精神伤害中转魂力承伤时会产生实际费用，可受倍耗；祥光等入场免费盾不因命中补扣魂力。此处只规定交互，不宣称必胜或抽空对手全部魂力。\",\n      \"魂力上限增幅只施加一次，保留原始baseMP作为魂技和普攻费用基数，不因上限扩大而再次抬高同一技能的费用。\",\n      \"秘元不是护盾、减伤或生命治疗；致命伤害造成退场后，不再执行回合末回魂。5%回复与20%凝元分别发出回复事件，能被明确拦截回魂的规则处理。\",\n      \"仅带真实封锁／禁绝标签并实际命中的效果可阻止该周期凝元；不能只凭技能名称含封、锁就判定封锁魂力。\",\n      \"化羽华的生命费用不纳入受伤凝元；回魂与附伤都不产生额外行动。\"\n    ]\n  }\n}", "/modules/data/npc/xutaiping.json": "{\n  \"schemaVersion\": 1,\n  \"id\": \"xutaiping\",\n  \"name\": \"徐太平\",\n  \"nationality\": \"斗灵\",\n  \"gender\": \"女\",\n  \"level\": 81,\n  \"stage\": \"魂斗罗\",\n  \"style\": \"辅助\",\n  \"role\": \"减益特化／团队集火辅助\",\n  \"soul\": {\n    \"id\": \"friendly-soul-yemodengjiao\",\n    \"name\": \"夜魔灯鲛\",\n    \"tier\": 10,\n    \"main_kind\": \"兽\",\n    \"subkind\": \"水生\",\n    \"attribute\": \"暗\",\n    \"attribute_category\": \"单属性\",\n    \"elements\": [\n      \"暗\"\n    ],\n    \"mechanisms\": [],\n    \"spirit_specialist\": false,\n    \"release_options\": [\n      \"附体\",\n      \"召唤\"\n    ],\n    \"balance\": [\n      0,\n      0,\n      0,\n      0,\n      0,\n      0\n    ]\n  },\n  \"release\": \"附体\",\n  \"rating\": \"强级\",\n  \"ratingRatio\": 1.5,\n  \"model\": {\n    \"level\": 81,\n    \"rings\": 8,\n    \"benchmark\": 390,\n    \"stats\": {\n      \"B\": 386.1,\n      \"S\": 549.9,\n      \"C\": 748.8,\n      \"D\": 421.2,\n      \"A\": 514.8,\n      \"P\": 889.2,\n      \"W\": 76\n    },\n    \"derived\": {\n      \"HP\": 2923,\n      \"baseMP\": 2810,\n      \"MP\": 4214,\n      \"SH\": 7334,\n      \"PA\": 398.44,\n      \"SA\": 477.42,\n      \"MA\": 721.36,\n      \"DEF\": 297.82,\n      \"MDEF\": 477.4,\n      \"costReduction\": 40,\n      \"castReduction\": 30,\n      \"controlGrowth\": 2.5\n    },\n    \"breakdown\": {\n      \"B\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": -20,\n        \"shape\": 8,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": -59.9,\n        \"generated\": 446\n      },\n      \"S\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": 10,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": -8.1,\n        \"generated\": 558\n      },\n      \"C\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": 20,\n        \"shape\": -8,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 180.8,\n        \"generated\": 568\n      },\n      \"D\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": -10,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": -34.8,\n        \"generated\": 456\n      },\n      \"A\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": -10,\n        \"shape\": 6,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 27.8,\n        \"generated\": 487\n      },\n      \"P\": {\n        \"base\": 390,\n        \"grade\": 1.3,\n        \"style\": 10,\n        \"shape\": -6,\n        \"mental\": 0,\n        \"weapon\": 0,\n        \"deviation\": 0,\n        \"growth\": 362.2,\n        \"generated\": 527\n      },\n      \"W\": {\n        \"base\": 74,\n        \"grade\": 1,\n        \"style\": 0,\n        \"shape\": 0,\n        \"mental\": 0,\n        \"deviation\": 2,\n        \"growth\": 0,\n        \"generated\": 76\n      }\n    },\n    \"ratingProfile\": \"npc\"\n  },\n  \"skills\": [\n    {\n      \"q\": 1.35,\n      \"K\": 2.35,\n      \"Q\": 3.17,\n      \"name\": \"黑蚀\",\n      \"category\": \"减益\",\n      \"channel\": \"能量\",\n      \"years\": 420,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1,\n      \"cooldown\": 16,\n      \"role\": \"延迟复合诅咒\",\n      \"effect\": \"抬灯指向目标，按双方精神力与精神稳定作一次减益对抗。成功后，目标头顶浮现三盏亮黄魂灯；持续灌注，每2秒熄灭一盏，三灯俱灭时诅咒落下：敏捷降低20%，造成的伤害降低15%，持续至本场战斗结束，可被正常净化。灌注期间可作其他正常行动；徐太平受控时暂停灌注，解除后继续，布标满12秒尚未完成则散去。标记可被净化，徐太平退场时未完成的灯消散；不即时禁锢或清空行动条。同一目标只能保留她的一组三灯，重复施放不叠组、不提前引爆。\",\n      \"operations\": [\n        {\n          \"type\": \"debuff_contest\",\n          \"once\": true\n        },\n        {\n          \"type\": \"delayed_three_lamps\",\n          \"intervalSeconds\": 2,\n          \"lamps\": 3,\n          \"timeoutSeconds\": 12,\n          \"pauseOnOwnerControl\": true,\n          \"dispelEligible\": true,\n          \"removeIncompleteOnOwnerDefeat\": true,\n          \"slotsPerTarget\": 1\n        },\n        {\n          \"type\": \"numeric_debuff\",\n          \"values\": {\n            \"agilityDown\": 0.2,\n            \"damageDown\": 0.15\n          },\n          \"lifetime\": \"battle\",\n          \"trigger\": \"three_lamps_extinguished\",\n          \"amplifierSnapshot\": \"curse_resolution_before_group\"\n        }\n      ],\n      \"id\": \"xutaiping-skill-1\",\n      \"ring\": 1,\n      \"costPercent\": 0.08,\n      \"cost\": 135,\n      \"cast\": 1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.35,\n      \"K\": 2.35,\n      \"Q\": 3.17,\n      \"name\": \"沉鳞\",\n      \"category\": \"减益\",\n      \"channel\": \"能量\",\n      \"years\": 760,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 0.8,\n      \"cooldown\": 14,\n      \"role\": \"破除防御\",\n      \"effect\": \"银蓝鳞光落在目标护甲的接缝。通过普通减益对抗后，防御与精神抗御各降低15%，持续至本场战斗结束；同来源重施只更新幅度，不叠加层数，可被正常净化。不直接削去护盾，也不穿透角色固有伤害免疫。\",\n      \"operations\": [\n        {\n          \"type\": \"debuff_contest\"\n        },\n        {\n          \"type\": \"numeric_debuff\",\n          \"values\": {\n            \"defDown\": 0.15,\n            \"mindDown\": 0.15\n          },\n          \"lifetime\": \"battle\",\n          \"sameSourcePolicy\": \"replace-not-stack\",\n          \"amplifierSnapshot\": \"before_cast_group\"\n        }\n      ],\n      \"id\": \"xutaiping-skill-2\",\n      \"ring\": 2,\n      \"costPercent\": 0.08,\n      \"cost\": 135,\n      \"cast\": 0.8,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 1.8,\n      \"K\": 2.35,\n      \"Q\": 4.23,\n      \"name\": \"窒流\",\n      \"category\": \"减益\",\n      \"channel\": \"能量\",\n      \"years\": 1700,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1,\n      \"cooldown\": 16,\n      \"role\": \"抬高魂技消耗\",\n      \"effect\": \"暗潮堵塞目标的魂力流转。通过普通减益对抗后，其魂技消耗提高20%，持续至本场战斗结束；原本免费或无需支付魂力的效果不因此产生费用，不直接扣除现有魂力，也不改变普通攻击的费用。同来源重施只更新幅度，不叠加层数，可被正常净化。\",\n      \"operations\": [\n        {\n          \"type\": \"debuff_contest\"\n        },\n        {\n          \"type\": \"numeric_debuff\",\n          \"values\": {\n            \"skillCostUp\": 0.2\n          },\n          \"lifetime\": \"battle\",\n          \"paidSoulSkillsOnly\": true,\n          \"sameSourcePolicy\": \"replace-not-stack\",\n          \"amplifierSnapshot\": \"before_cast_group\"\n        }\n      ],\n      \"id\": \"xutaiping-skill-3\",\n      \"ring\": 3,\n      \"costPercent\": 0.09,\n      \"cost\": 152,\n      \"cast\": 1,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.05,\n      \"K\": 2.35,\n      \"Q\": 4.82,\n      \"name\": \"噤声\",\n      \"category\": \"控制\",\n      \"channel\": \"精神\",\n      \"years\": 4800,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 0.5,\n      \"cooldown\": 14,\n      \"baseControl\": 1.2,\n      \"role\": \"打断施法\",\n      \"effect\": \"灯芯骤暗，截断对手正在组织的魂力。按正常控制对抗结算；成功后打断读条，并以1.2秒为基础、按双方精神力比例结算短促控制，行动条压至最多40%，结束后获得4秒免控。不处于读条时仍只产生同样的短控，不额外附加长时间禁技。深暗不增加其控制时长或成功率。\",\n      \"operations\": [\n        {\n          \"type\": \"control_contest\",\n          \"baseSeconds\": 1.2,\n          \"ratio\": \"(100+attacker.P)/(100+defender.P)\",\n          \"interrupt\": true,\n          \"gaugeCeiling\": 0.4,\n          \"immunitySeconds\": 4,\n          \"deepDarkEligible\": false\n        }\n      ],\n      \"id\": \"xutaiping-skill-4\",\n      \"ring\": 4,\n      \"costPercent\": 0.09,\n      \"cost\": 175,\n      \"cast\": 0.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.35,\n      \"Q\": 6.58,\n      \"name\": \"替鳞\",\n      \"category\": \"防御\",\n      \"channel\": \"生命\",\n      \"years\": 11500,\n      \"target\": \"另一名队友\",\n      \"castFixed\": 0.8,\n      \"cooldown\": 18,\n      \"role\": \"代承友方减益\",\n      \"effect\": \"亮黄灯光照住队友，替其承接一项可净化的数值减益。该效果从队友身上移除，转至徐太平身上，保留原施加者与原层数，当前削弱幅度减半，承接后持续至本场战斗结束，可被正常净化。只转移一项，不转移硬控制、持续伤害、生命上限削减、角色固有机制或不可净化诅咒；自身没有承接位置时不能施放，不因转移再次触发深暗。转入效果尚未被净化或随战斗结束清除前，不能再承接第二项；不生成护盾或治疗。\",\n      \"operations\": [\n        {\n          \"type\": \"transfer_one_dispellable_numeric_debuff\",\n          \"exclude\": [\n            \"hard_control\",\n            \"damage_over_time\",\n            \"max_hp_reduction\",\n            \"innate_mechanic\",\n            \"undispellable\"\n          ],\n          \"receiver\": \"self\",\n          \"magnitudeMultiplier\": 0.5,\n          \"keepSource\": true,\n          \"keepRemainingTime\": false,\n          \"lifetime\": \"battle\",\n          \"keepStacks\": true,\n          \"capacity\": 1,\n          \"reapplyAmplifier\": false\n        }\n      ],\n      \"id\": \"xutaiping-skill-5\",\n      \"ring\": 5,\n      \"costPercent\": 0.1,\n      \"cost\": 169,\n      \"cast\": 0.8,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 2.8,\n      \"K\": 2.35,\n      \"Q\": 6.58,\n      \"name\": \"逆潮\",\n      \"category\": \"攻击\",\n      \"channel\": \"能量\",\n      \"years\": 19000,\n      \"target\": \"一名敌人\",\n      \"castFixed\": 1.2,\n      \"cooldown\": 15,\n      \"factor\": 0.75,\n      \"role\": \"有限伤害与行动条干扰\",\n      \"effect\": \"夜魔灯鲛的暗潮卷过目标，按普通命中、防御与护盾结算，造成1.2×Q×魂力攻击值×0.75的能量原始伤害。命中后，将目标尚未进入读条的行动条降低20个百分点，最低归零；这项瞬时削弱可受深暗增幅。已经开始准备的魂技不会因此取消或延长，不额外禁锢目标，也不为己方附送行动。单次施放只干扰一次。\",\n      \"operations\": [\n        {\n          \"type\": \"direct_attack\",\n          \"factor\": 0.75,\n          \"channel\": \"能量\"\n        },\n        {\n          \"type\": \"numeric_debuff\",\n          \"values\": {\n            \"gaugeLoss\": 0.2\n          },\n          \"instant\": true,\n          \"onlyBeforeCast\": true,\n          \"floor\": 0,\n          \"oncePerCast\": true,\n          \"trigger\": \"on_hit\",\n          \"amplifierSnapshot\": \"before_cast_group\"\n        }\n      ],\n      \"id\": \"xutaiping-skill-6\",\n      \"ring\": 6,\n      \"costPercent\": 0.12,\n      \"cost\": 326,\n      \"cast\": 1.2,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.15,\n      \"K\": 2.35,\n      \"Q\": 7.4,\n      \"name\": \"夜魔真身\",\n      \"category\": \"强化\",\n      \"channel\": \"能量\",\n      \"years\": 48000,\n      \"target\": \"自己\",\n      \"castFixed\": 1.5,\n      \"cooldown\": 32,\n      \"role\": \"维持辅助生存与对抗能力\",\n      \"effect\": \"银蓝鲛鳞覆体，明黄灯火沉入鳞隙。本场战斗内精神力提高20%、防御素质提高15%，按游戏六维增益规则换算；不增加当前资源，不另增生命上限。同来源重复施放不叠层；不再额外提高深暗倍率，也不额外积累灯灭层数。\",\n      \"operations\": [\n        {\n          \"type\": \"battle_stat_up\",\n          \"values\": {\n            \"P\": 0.2,\n            \"D\": 0.15\n          },\n          \"lifetime\": \"battle\",\n          \"sameSourcePolicy\": \"replace-not-stack\",\n          \"refillResources\": false\n        }\n      ],\n      \"id\": \"xutaiping-skill-7\",\n      \"ring\": 7,\n      \"costPercent\": 0.12,\n      \"cost\": 203,\n      \"cast\": 1.5,\n      \"extensionRequired\": true\n    },\n    {\n      \"q\": 3.8,\n      \"K\": 2.35,\n      \"Q\": 8.93,\n      \"name\": \"沉灯之海\",\n      \"category\": \"减益\",\n      \"channel\": \"能量\",\n      \"years\": 88000,\n      \"target\": \"敌方全体\",\n      \"castFixed\": 1.8,\n      \"cooldown\": 26,\n      \"role\": \"团队集火易伤\",\n      \"effect\": \"将灯影铺成一片无昼的海。逐个敌人独立进行普通减益对抗，成功者在本场战斗内，受到徐太平以外的友方角色造成的伤害提高15%；这项易伤受深暗增幅。同来源重施只更新幅度，不叠加层数，可被正常净化；不削双防，不降低敌方输出，不同时结算黑蚀三灯或灯灭封锁；没有其他友方输出时，不转化为徐太平自己的额外伤害。\",\n      \"operations\": [\n        {\n          \"type\": \"debuff_contest\",\n          \"perTarget\": true\n        },\n        {\n          \"type\": \"numeric_debuff\",\n          \"values\": {\n            \"allyVulnerability\": 0.15\n          },\n          \"lifetime\": \"battle\",\n          \"sameSourcePolicy\": \"replace-not-stack\",\n          \"damageSources\": \"allies_except_owner\",\n          \"amplifierSnapshot\": \"before_cast_group\"\n        }\n      ],\n      \"id\": \"xutaiping-skill-8\",\n      \"ring\": 8,\n      \"costPercent\": 0.16,\n      \"cost\": 270,\n      \"cast\": 1.8,\n      \"extensionRequired\": true\n    }\n  ],\n  \"traits\": [\n    {\n      \"name\": \"深暗\",\n      \"effect\": \"她施加的数值削弱幅度提高50%；同一目标已带有她的一项生效削弱时，改为提高80%。两档互相替代，不连续相乘；只增加幅度，不增加持续时间、层数上限、控制时长或成功率。同一次施放的多项削弱统一使用结算前的一次判定；尚未完成的三灯、灯灭计数和她自身承接的减益不用于升级增幅档。\"\n    },\n    {\n      \"name\": \"灯灭\",\n      \"effect\": \"每个个人回合，对每名敌方目标第一次真正获得的增益、治疗、护盾或回魂进行压制：数值幅度或回复量减半，并为该目标积1层灯灭。达到3层后，该目标下一次可被压制的正向效果完全失效，随后清空灯灭层数。每回合每目标最多压制一次，其余正向效果正常结算；同一次施放对同一目标产生的多项正向效果合并处理，只计一次。完全失效仍正常消耗施放者的资源与冷却。灯灭层数独立于黑蚀三灯，不受深暗放大，战斗结束或徐太平退场后清除。\"\n    }\n  ],\n  \"implementation\": {\n    \"status\": \"specification-only\",\n    \"integrated\": false,\n    \"numericStatusLifetime\": \"battle\",\n    \"numericStatusEndsOn\": \"battle_end_or_valid_dispel\",\n    \"turnClock\": \"徐太平个人回合：从获得一次正常行动机会至该次行动结束；普通攻击、魂技与正常防御均计，连击分段、追击和持续伤害跳数不额外计回合。每次有效回合开始重置一次灯灭的每目标触发名额。\",\n    \"deepDark\": {\n      \"normalMultiplier\": 1.5,\n      \"coveredMultiplier\": 1.8,\n      \"stackMultipliers\": false,\n      \"eligible\": \"enemy_numeric_debuffs_from_self\",\n      \"eligibilitySnapshot\": \"before_cast_group_or_delayed_curse_group\",\n      \"ignoreMarkers\": [\n        \"black_erosion_lamps\",\n        \"lamp_out_stacks\",\n        \"transferred_debuff\"\n      ],\n      \"excluded\": [\n        \"control_duration\",\n        \"debuff_duration\",\n        \"control_chance\",\n        \"stack_cap\",\n        \"buffs\",\n        \"damage\",\n        \"lamp_out\"\n      ],\n      \"caps\": {\n        \"agilityDown\": 0.9,\n        \"damageDown\": 0.9,\n        \"defDown\": 1,\n        \"mindDown\": 1,\n        \"skillCostUp\": 1,\n        \"gaugeLoss\": 0.9,\n        \"allyVulnerability\": 0.6\n      }\n    },\n    \"lampOut\": {\n      \"scope\": \"living_enemy_beneficiaries\",\n      \"eligibleEvents\": [\n        \"buff_received\",\n        \"healing_received\",\n        \"shield_received\",\n        \"mana_recovery_received\"\n      ],\n      \"normalMultiplier\": 0.5,\n      \"maxStacks\": 3,\n      \"fullStacksNextMultiplier\": 0,\n      \"consumeAllOnBlock\": true,\n      \"usesPerTargetPerOwnerTurn\": 1,\n      \"groupBy\": \"cast_or_tick_id+beneficiary_id\",\n      \"sameTurnAfterThird\": \"wait_for_next_eligible_turn\",\n      \"zeroActualBenefitCounts\": false,\n      \"affectsInitialResources\": false,\n      \"affectsInnatePassives\": false,\n      \"affectsCleanse\": false,\n      \"affectsRevive\": false,\n      \"durationOnlyBuffPolicy\": \"halve_duration\",\n      \"untimedBooleanBuffPolicy\": \"explicit_adapter_required\",\n      \"removeOnOwnerDefeat\": true,\n      \"persistAcrossBattles\": false\n    },\n    \"blackErosion\": {\n      \"lamps\": 3,\n      \"intervalSeconds\": 2,\n      \"timeoutSeconds\": 12,\n      \"pauseWhileControlled\": true,\n      \"progressIsNotLampOut\": true,\n      \"amplifyOnCurseResolution\": true\n    },\n    \"requiredAdapters\": [\n      \"personal-turn-events\",\n      \"delayed-lamp-channel\",\n      \"grouped-benefit-events\",\n      \"source-tagged-debuffs\",\n      \"debuff-amplification\",\n      \"debuff-transfer\",\n      \"precast-gauge-reduction\",\n      \"ally-source-vulnerability\"\n    ],\n    \"notes\": [\n      \"灯灭以获得正向效果的敌人为受益目标记账，而不是按施放者记账；群体治疗逐个受益者独立判断。\",\n      \"持续治疗每一跳是新的正向效果事件，但同一回合同一目标仍只压制一次；实际零治疗或零回复不计触发。\",\n      \"只有时长、没有数值幅度的主动增益减半时长；完全封锁时整项不生效。无幅度且无时限的二值增益必须另写适配，不能擅自减半概率。\",\n      \"控制结束后的系统免控窗不视为可封锁的主动增益。驱散、复活、入场初始资源和角色常驻固有机制不默认被灯灭拦截。\",\n      \"深暗只改变原有削弱字段，仍受该字段原上限约束；不会扩大目标数或把多项效果拆开，借同一次施放先挂弱项再吃80%。\",\n      \"无昼场景只作沉灯之海的视觉表现，不改变照明、命中、位移或事件骰。\",\n      \"原稿的早年受伤经历只作为背景资料；本次81级战斗稿不推定具体恢复经过，也不另乘未指定的伤残惩罚。\"\n    ]\n  }\n}", "/modules/data/soulbone/trait-pool.json": "{\n  \"schemaVersion\": 1,\n  \"poolVersion\": 1,\n  \"note\": \"空池。按《v12重大更新交接文档》第十二节，魂骨特性由用户后续编写；池为空或处理器缺失时，魂骨保留实例与待装配标记，不显示为“特性已生效”，也不为凑数发放旧武魂特性。字段说明见同目录 README.md。\",\n  \"traits\": []\n}\n"},cache={};
function normalize(p){const out=[];for(const x of p.replace(/\\/g,'/').split('/')){if(x==='..')out.pop();else if(x&&x!=='.')out.push(x);}return '/'+out.join('/');}
const paths={resolve:(...p)=>normalize(p.join('/')),join:(...p)=>normalize(p.join('/'))};
const fs={existsSync:p=>Object.hasOwn(files,normalize(p)),readFileSync:p=>{const key=normalize(p);if(!Object.hasOwn(files,key))throw Error('内置资料不存在：'+key);return files[key];}};
function load(id){if(cache[id])return cache[id].exports;if(!factories[id])throw Error('内置模块不存在：'+id);const module={exports:{}};cache[id]=module;const dir=id.slice(0,id.lastIndexOf('/'));const req=name=>{if(name==='node:fs')return fs;if(name==='node:path')return paths;let key=normalize(dir+'/'+name);if(!key.endsWith('.js'))key+='.js';return load(key);};factories[id](req,module,module.exports,dir);return module.exports;}
root.WitnessV12Factory=load('/modules/src/splice/compose.js');
root.WitnessV12=root.WitnessV12Factory.createModules({rules:root.WitnessRules});

})(globalThis);

// v12 encounter/trait adapter: uses the existing timeline, hit, damage and shield rules.
const V12Battle=(function(root){
'use strict';
const R=root.WitnessRules,API=root.WitnessV12,copy=x=>JSON.parse(JSON.stringify(x));
const has=(u,id)=>(u.v12Traits||[]).some(t=>t.id===id||t.traitId===id);
const state=u=>{if(!u.v12State||u.v12State.version!==1)u.v12State={turns:0,mossStacks:0,iceAgility:0,tides:{},shellFirst:false,shellSerial:0,shellAbsorbed:{},overflow:0,...(u.v12State||{}),version:1};return u.v12State;};
const elements=u=>API.battle.skillAttributes.attributeTags(u.soul||u);
const enemies=(b,u)=>b.units.filter(t=>t.team!==u.team&&b.alive(t));
const battleDuration=9007199254; // finite, JSON-safe lifetime beyond practical battle time
const battleEnd=Number.MAX_SAFE_INTEGER;
function runtime(unit){const u=copy(unit),d=u.model.derived;Object.assign(u,{progress:0,queuedAt:null,queueOrder:0,actions:0,hp:d.HP,mp:d.MP,sh:d.SH,cast:null,readyAt:0,cooldowns:{},uses:{},statuses:[],dots:[],shieldLayers:[],shieldHP:0,shieldSH:0,shieldUntil:0,oneHit:false,guard:0,immuneUntil:0,rage:0,tuneUses:0,calmUses:0,manaGiftUses:0,firstHit:false,fallen:false,modern:{sequence:0,overheat:[0,0]}});if(u.release==='召唤'){u.bodyHP=Math.round(d.HP*.45);u.petHP=d.HP-u.bodyHP;u.petMax=u.petHP;u.bodyMax=u.bodyHP;u.petAlive=true;}return u;}
function initializeBattle(b,{huntPlan,seed}){
 const units=huntPlan.units.map(runtime);Object.assign(b,{v12Battle:true,v12Session:huntPlan.sessionId,activeId:null,queueSequence:0,units,difficulty:'hunt',seed:String(seed||huntPlan.seed),rng:new root.WitnessDice.DiceEngine(seed||huntPlan.seed),now:0,result:null,log:[],events:[],turn:0,resourceConfig:R.getResourceConfig(),controlRules:{...root.WitnessControlV9.getConfig()}});
 for(const u of b.units)u.tiePriority=b.rng.die(100000);
 ShieldActions.initialize(b);b.initializeActorState();b.addLog('讨伐之战：'+(units.length-1)+'对1；只有魂兽真正退场且友方有人存活才获得环骨。无180秒限制；连续10秒无人能行动、平局、逃离与认输均无战利品。',{type:'huntStart'});b.scheduleAI();
}
function initTraits(b){
 for(const u of b.units){
  u.skills=u.skills.map(s=>API.battle.skillAttributes.tagSkill(s,u.soul));if(u.npcId==='chengliang'){const current=API.roster.combatSpec('chengliang').traits.find(t=>t.name==='六库仙贼');u.traits=(u.traits||[]).map(t=>t.name==='六库仙贼'?copy(current):t);}
  u.v12Traits||=[];if(has(u,'frost-moss-immunity'))u.statuses=u.statuses.filter(st=>!['slow','freeze','sluggish','agilityDown','statDownA','frostCastSlow'].includes(st.type));const fresh=!u.v12State;state(u);if(fresh&&u.beastId)state(u).mossStacks=u.v12InitialMossStacks||0;if(fresh){const moss=u.v12Traits.find(t=>(t.id||t.traitId)==='moss-armor-accumulation');if(moss?.ownerBoneId)state(u).mossStacks=u.v12Permanent?.[moss.ownerBoneId]?.mossStacks||0;}u.lifeType||='生活';
  if(u.npcId==='chengliang'&&!u.v12NPC)u.v12NPC=API.npc.TRAITS.chengliang.createState({maxHP:u.model.derived.HP,permanentProgress:u.permanentProgress});
  if(u.npcId==='xutaiping'&&!u.v12NPC)u.v12NPC=API.npc.TRAITS.xutaiping.createState();
  if(u.npcId==='sailiya_fengzhi'&&!u.v12NPC)u.v12NPC=API.npc.TRAITS.sailiya_fengzhi.createState();
  if(!u.v12BaseStats)u.v12BaseStats=copy(u.model.stats);
  if(u.npcId==='chengliang'&&!u.bodyMultiplierApplied&&u.permanentProgress?.thiefQiStacks)bodyProgress(b,u,u.permanentProgress.thiefQiStacks);
 }
}
function traitEffects(b,u,effects){for(const e of effects||[]){if(e.op==='heal')b.heal(u,e.amount,'生命');else if(e.op==='restoreMP')restoreMP(b,u,e.amount,e.reason);else if(e.op==='permanentProgress'){u.permanentProgress||={};u.permanentProgress[e.key]=e.value;}else if(e.op==='bodyBonus')bodyProgress(b,u,e.stacks);else if(e.op==='addStatus')b.setStatus(b.unit(e.targetId),e.type,e.value,e.duration==='battle'?battleDuration:e.duration,{source:u.id+':'+e.type,label:'黑蚀',v12Caster:u.id});else if(e.op==='log')b.addLog(e.text,{type:'trait',actor:u.id});}}
function bodyProgress(b,u,stacks){const priorHP=u.model.derived.HP,prior=u.model.stats.B;u.model.stats.B=u.v12BaseStats.B*(1+.1*stacks);const derived=R.derive(u.model.stats);for(const k of ['HP','PA','DEF'])u.model.derived[k]=derived[k];u.hp=Math.min(u.model.derived.HP,u.hp);u.bodyMultiplierApplied=true;if(prior!==u.model.stats.B)b.addLog(u.name+'盗气'+stacks+'层，肉体强度提升。',{type:'trait',actor:u.id});}
function benefit(b,t,kind,value,actual=value){let n=value;for(const owner of b.units.filter(u=>u.npcId==='xutaiping'&&u.team!==t.team&&b.alive(u))){state(owner).benefitSerial=(state(owner).benefitSerial||0)+1;const x=API.npc.TRAITS.xutaiping.applyBenefit(owner.v12NPC,{targetId:t.id,kind,value:n,actualBenefit:Math.min(actual,n),groupId:b._v12Group||b._effectKey||('resource:'+b.now+':'+state(owner).benefitSerial)});owner.v12NPC=x.state;n=x.outcome.value;traitEffects(b,owner,x.effects);}return Math.max(0,n);}
function restoreMP(b,u,amount,label){if(!b.alive(u)||!(amount>0))return;const gap=Math.max(0,u.model.derived.MP-u.mp),actual=benefit(b,u,'mp-restore',Math.min(gap,amount));u.mp=Math.min(u.model.derived.MP,u.mp+actual);if(actual)b.addLog(u.name+'回魂 '+Math.round(actual)+' · '+label,{type:'mpRestore',target:u.id,amount:actual});const overflow=Math.max(0,amount-gap);if(has(u,'devouring-soul-recovery')&&!b._v12Siphon){const shield=Math.min(overflow,u.model.derived.HP*.1-state(u).overflow);if(shield>0){state(u).overflow+=shield;b.addShieldLayer(u,{source:u.id+':overflow',label:'吞噬回魂·溢出',amount:(u.shieldLayers.find(s=>s.source===u.id+':overflow')?.amount||0)+shield,channel:'生命',until:battleEnd});}}return overflow;}
function absorbManaSpent(b,spender,amount){if(!(amount>0)||b._v12Siphon)return;b._v12Siphon=true;try{for(const u of b.units.filter(u=>has(u,'devouring-soul-recovery')&&b.alive(u)&&!state(u).sealed)){const gain=amount*.3,gap=u.model.derived.MP-u.mp;restoreMP(b,u,gain,'吞噬回魂');const overflow=Math.max(0,gain-gap),room=u.model.derived.HP*.1-state(u).overflow,shield=Math.min(room,overflow);if(shield>0){state(u).overflow+=shield;b.addShieldLayer(u,{source:u.id+':overflow',label:'吞噬回魂·溢出',amount:(u.shieldLayers.find(s=>s.source===u.id+':overflow')?.amount||0)+shield,channel:'生命',until:battleEnd});}}}finally{b._v12Siphon=false;}}
function shell(b,u){const layers=(u.shieldLayers||[]).filter(s=>s.label==='冰壳护生');if(layers.length>=2)return;const id=u.id+':shell:'+(++state(u).shellSerial);state(u).shellAbsorbed[id]=0;b.addShieldLayer(u,{source:id,label:'冰壳护生',amount:u.model.derived.HP*.8,channel:'生命',until:battleEnd});}
function beginTurn(b,u){if(u.bonusAttack||u.v12TurnOpen||!b.alive(u))return;u.v12TurnOpen=true;state(u).turns++;state(u).overflow=0;
 if(has(u,'ice-shell-preservation')){if(state(u).shellFirst)shell(b,u);else{shell(b,u);state(u).shellFirst=true;}}
 for(const owner of b.units.filter(o=>has(o,'frost-domain')&&b.alive(o))){if(owner===u&&!state(owner).domainSuppressed&&elements(u).includes('冰'))state(u).iceAgility++;else if(owner!==u&&!state(owner).domainSuppressed&&elements(u).includes('冰'))state(u).iceAgility++;}
 if(u.npcId==='chengliang'){const t=API.npc.TRAITS.chengliang;const out=t.handle(u.v12NPC,{type:'turn-start',controlled:!!b.value(u,'control'),livingEnemyIds:enemies(b,u).filter(v=>!has(v,'frost-moss-immunity')).map(v=>v.id)});u.v12NPC=out.state;traitEffects(b,u,out.effects);const target=enemies(b,u)[0];if(target)u.v12NPC=t.handle(u.v12NPC,{type:'gaze-select',targetId:target.id}).state;}
 if(u.npcId==='xutaiping')u.v12NPC=API.npc.TRAITS.xutaiping.beginTurn(u.v12NPC);
}
function endAction(b,u,cast){if(cast?.bonus||u.v12Channel)return;state(u).costPressure=false;
 if(!u.v12TurnOpen)return;u.v12TurnOpen=false;
 if(has(u,'devouring-soul-recovery')&&!state(u).sealed)restoreMP(b,u,u.model.derived.MP*.08,'吞噬回魂·回合末');
 if(u.npcId==='chengliang'){const out=API.npc.TRAITS.chengliang.handle(u.v12NPC,{type:'turn-end',dead:!b.alive(u),hp:u.hp,maxHP:u.model.derived.HP,mp:u.mp,maxMP:u.model.derived.MP});u.v12NPC=out.state;traitEffects(b,u,out.effects);}
 if(u.npcId==='sailiya_fengzhi'){const out=API.npc.TRAITS.sailiya_fengzhi.endTurn(u.v12NPC,{maxMP:u.model.derived.MP,lethal:!b.alive(u)});u.v12NPC=out.state;traitEffects(b,u,out.effects);}
 state(u).sealed=false;if(state(u).domainSuppressed)state(u).domainSuppressed=false;
}
function tideRates(b,u){if(has(u,'frost-moss-immunity'))return {cast:0,action:0};let cast=0,action=0;for(const t of Object.values(state(u).tides||{}))if(t.until>b.now){cast=Math.min(.9,cast+.2*t.stacks);action=Math.min(.9,action+.15*t.stacks);}for(const owner of b.units.filter(o=>has(o,'frost-domain')&&b.alive(o)&&!state(o).domainSuppressed)){if(elements(u).includes('冰'))continue;const tier=Math.min(2,Math.floor((state(owner).turns||0)/2));cast=Math.min(.9,cast+[.2,.275,.35][tier]);action=Math.min(.9,action+[.15,.2,.25][tier]);}return {cast,action};}
function pulse(b){
 for(const u of b.units){
  if(!b.alive(u))continue;
  if(u.npcId==='xutaiping'){const last=state(u).lastLampTime??0,dt=(b.now-last)/1000;state(u).lastLampTime=b.now;const out=API.npc.TRAITS.xutaiping.tickLamps(u.v12NPC,{dt,at:b.now/1000,controlled:!!b.value(u,'control')});u.v12NPC=out.state;traitEffects(b,u,out.effects);}
  const channel=u.v12Channel;if(channel&&channel.next<=b.now){if(b.value(u,'control')){u.v12Channel=null;b.addLog(u.name+'的剑舞被打断，未释放段数取消。');endAction(b,u,{});continue;}const target=b.unit(channel.target);if(target&&b.alive(target))attack(b,u,target,channel.skill,channel.factor,channel.channel,{rune:true});channel.left--;channel.next+=channel.interval;if(channel.left<=0){u.v12Channel=null;endAction(b,u,{});}}
 }
}
function attack(b,u,t,s,factor=1,channel=s.channel,context={}){
 if(!b.alive(t)||!b.alive(u))return false;let hit=context.hit;
 if(hit===undefined)hit=b.hit(u,t,channel,(context.accuracy||0)/100).success;
 if(!hit){b.addLog(u.name+'的'+s.name+'未命中。',{type:'miss',actor:u.id,target:t.id});return false;}
 const eff=b.effective(u),power=channel==='物理'?eff.PA:channel==='精神'?eff.MA:eff.SA;
 const pre=Object.fromEntries(b.units.map(x=>[x.id,b.effective(x)]));
 const damage=b.damageValue(u,t,1.2*s.Q*power*factor*(context.charge||1),channel,pre);
 const old=b._packetSkill;b._packetSkill=s;const double=b._v12DoubleDefense;b._v12DoubleDefense=!!u.v12NPC?.rune?.active;
 try{b.applyDamage(t,damage,channel,u,s.fx||'wave');
 if(u.npcId==='sailiya_fengzhi'&&u.v12NPC.rune.active&&b.alive(t)){
  const resist=t.elementResistances||t.resistances||{},keys=Object.keys(resist);const element=keys.length?keys.sort((a,z)=>resist[a]-resist[z])[0]:'无';
  const add=Math.round(damage*.3*(1-Math.max(-1,Math.min(1,resist[element]||0))));b._packetSkill={...s,elements:[element],attribute:element};b.applyDamage(t,add,'能量',u,'rune');
 }
 }finally{b._packetSkill=old;b._v12DoubleDefense=double;}
 if(state(u).storedEnergy&&state(u).storedUntil>b.now){const amount=state(u).storedEnergy;state(u).storedEnergy=0;b.applyDamage(t,b.damageValue(u,t,amount,'能量',pre),'能量',u,'wave');}
 return true;
}
function execute(b,u,t,s,ops){
 if(!b.alive(u)||!t)return;const previous=b._v12Group;b._v12Group=u.id+':'+s.id+':'+u.actions;
 const ctx={hit:undefined,passed:true,charge:1,accuracy:b.value(u,'v12Accuracy')*100};
 u.statuses=u.statuses.filter(st=>st.type!=='v12Accuracy');
 if(u.npcId==='sailiya_fengzhi'&&s.category==='攻击'){const charge=API.npc.TRAITS.sailiya_fengzhi.consumeCharge(u.v12NPC,true);u.v12NPC=charge.state;ctx.charge=charge.multiplier;}
 try{for(const op of ops){if(!ctx.passed)break;switch(op.type){
 case 'hit_contest_once':ctx.hit=b.hit(u,t,s.channel,ctx.accuracy/100).success;ctx.passed=ctx.hit;break;
 case 'debuff_contest':{const e=R.controlEffect(s.Q,b.effective(u),b.effective(t));ctx.passed=b.rng.die(100)<=Math.round(e.chance);b.addLog(s.name+'减益判定'+(ctx.passed?'成功':'被抵抗'),{type:'status',actor:u.id,target:t.id});break;}
 case 'direct_attack':ctx.lastHit=attack(b,u,t,s,(u.beastId?op.factor/1.2:op.factor)||1,op.channel||s.channel,{...ctx,accuracy:ctx.accuracy+(op.accuracyPoints||0)});break;
 case 'partitioned_attack':{const total=op.factor||1;for(let i=0;i<(op.parts||2);i++)attack(b,u,t,s,total/(op.parts||2),op.channel||s.channel,ctx);break;}
 case 'channeled_partitioned_attack':u.v12Channel={target:t.id,skill:copy(s),factor:(op.factor||1)/(op.parts||6),channel:op.channel||s.channel,left:op.parts||6,interval:Math.round((op.intervalSeconds||.5)*1000),next:b.now+Math.round((op.intervalSeconds||.5)*1000)};break;
 case 'budgeted_area_attack':{const targets=enemies(b,u);for(const target of targets)attack(b,u,target,s,(op.factor||1)/targets.length,op.channel||s.channel,ctx);break;}
 case 'periodic_attack':{const hit=b.hit(u,t,op.channel||s.channel);if(!hit.success)break;const eff=b.effective(u),channel=op.channel||s.channel,power=channel==='物理'?eff.PA:eff.SA,parts=op.parts||3;const pre=Object.fromEntries(b.units.map(x=>[x.id,b.effective(x)]));const raw=op.factor*s.Q*power/parts;const damage=b.damageValue(u,t,raw,channel,pre);const key=u.id+'-'+s.id;t.dots=t.dots.filter(d=>d.key!==key);t.dots.push({key,source:u.id,skill:copy(s),channel,baseDamage:damage,damage,next:b.now+3000,rawPerTick:raw,ticks:parts,fx:s.fx||'ice',damageNature:'residual'});break;}
 case 'shield':b.addShieldLayer(u,{source:u.id+':'+s.id,label:s.name,amount:(op.coefficient||.45)*s.Q*b.effective(u).SA,channel:op.channel||'生命',until:b.now+(op.ttlSeconds||8)*1000,casterId:u.id,skillId:s.id});break;
 case 'heal':b.heal(u,(op.coefficient||.4)*s.Q*b.effective(u).SA,'生命');break;
 case 'control_contest':b.tryControl(u,t,s,op.baseSeconds);break;
 case 'conditional_control_contest':if(t.cast&&ctx.lastHit)b.tryControl(u,t,s,op.baseSeconds);break;
 case 'numeric_debuff':{if(op.trigger==='three_lamps_extinguished'||op.trigger==='on_hit'&&!ctx.lastHit||op.onlyBeforeCast&&t.cast)break;const mapping={A:'agilityDown',D:'defDown',P:'mindDown',agilityDown:'agilityDown',damageDown:'damageDown',defDown:'defDown',mindDown:'mindDown',skillCostUp:'costUp',allyVulnerability:'v12Vulnerability'};const before=u.v12NPC?copy(u.v12NPC):null;
 if(u.beastId&&!op.instant){const e=R.controlEffect(s.Q,b.effective(u),b.effective(t));if(b.rng.die(100)>e.chance)break;}
 for(const [key,raw]of Object.entries(op.values||{})){const field=key==='skillCostUp'?'skillCostUp':key;let value=raw;if(u.npcId==='xutaiping'&&API.npc.TRAITS.xutaiping.constants.CAPS[field]!==undefined)value=API.npc.TRAITS.xutaiping.amplify(before,{targetId:t.id,field,baseValue:raw}).value;
 if(key==='gaugeLoss'){if(!t.cast)t.progress=Math.max(0,t.progress-value);continue;}
 const type=mapping[key]||key,duration=op.lifetime==='battle'?battleDuration:op.ttlSeconds||6;b.setStatus(t,type,value,duration,{source:u.id+':'+s.id+':'+key,label:s.name,from:u.name,v12Caster:u.id,cleansable:true});
 if(u.npcId==='xutaiping')u.v12NPC=API.npc.TRAITS.xutaiping.recordDebuff(u.v12NPC,{targetId:t.id,debuffId:s.id+':'+key,field,value,appliedAt:b.now/1000}).state;}
 break;}
 case 'delayed_three_lamps':if(u.npcId==='xutaiping'){u.v12NPC=API.npc.TRAITS.xutaiping.applyLamps(u.v12NPC,{targetId:t.id,at:b.now/1000}).state;b.addLog('三顶亮黄灯柱悬在'+t.name+'头顶。',{type:'trait',actor:u.id,target:t.id});}break;
 case 'battle_stat_up':case 'temporary_stat_up':b.setStatus(u,'v12Stats',1,op.lifetime==='battle'?battleDuration:op.ttlSeconds||12,{source:u.id+':'+s.id,label:s.name,values:copy(op.values||{})});break;
 case 'battle_attack_up':b.setStatus(u,'attackBoost',op.value,battleDuration,{source:u.id+':'+s.id,label:s.name});break;
 case 'hp_cost':{const fee=Math.ceil(u.model.derived.HP*op.maxHPRate);if(u.hp<=fee){ctx.passed=false;b.addLog(u.name+'生命不足，未能燃血。');break;}u.hp-=fee;break;}
 case 'charged_attack_modifier':u.v12NPC=API.npc.TRAITS.sailiya_fengzhi.refillCharge(u.v12NPC);break;
 case 'one_use_evasion':b.setStatus(u,'v12Evasion',Math.abs(op.incomingHitPoints)/100,battleDuration,{source:u.id+':'+s.id,label:s.name,uses:1});break;
 case 'phase_avoid_once':b.setStatus(u,'phaseSwap',1,op.ttlSeconds||5,{source:u.id+':'+s.id,label:s.name});break;
 case 'one_hit_damage_reduction':b.setStatus(u,'preDR',op.value,op.ttlSeconds||6,{source:u.id+':'+s.id,label:s.name,once:true,channels:op.channels});break;
 case 'reserve_absorbed_energy':state(u).reserve={rate:op.rate,cap:op.capMaxHP*u.model.derived.HP,until:b.now+(op.ttlSeconds||10)*1000};break;
 case 'next_attack_skill_hit_release':break; // reserve released by the next successful direct attack
 case 'next_attack_skill_accuracy':b.setStatus(u,'v12Accuracy',op.points/100,op.ttlSeconds||12,{source:u.id+':'+s.id,label:s.name});break;
 case 'next_attack_skill_cast_multiplier':b.setStatus(u,'v12Cast',op.value,battleDuration,{source:u.id+':'+s.id,label:s.name});break;
 case 'reduce_outer_life_shield':{const top=(t.shieldLayers||[]).filter(l=>l.channel==='生命').sort((a,z)=>z.order-a.order)[0];if(top){const loss=Math.min(top.amount,op.coefficient*s.Q*b.effective(u).SA);top.amount-=loss;b.expireShields(t);b.addLog(s.name+'削去外层护盾'+Math.round(loss),{type:'dispel',actor:u.id,target:t.id});}for(const owner of b.units.filter(x=>has(x,'frost-domain')&&b.alive(x)))state(owner).domainSuppressed=true;break;}
 case 'transfer_one_dispellable_numeric_debuff':{if(u.v12Transferred)break;const item=t.statuses.find(st=>st.cleansable&&st.value>0&&!['control'].includes(st.type));if(item){t.statuses=t.statuses.filter(st=>st!==item);b.setStatus(u,item.type,item.value*(op.magnitudeMultiplier||.5),battleDuration,{...item,until:battleEnd,source:item.source,transferred:true});u.v12Transferred=true;}break;}
 default:throw Error('未接入的v12技能操作：'+op.type);
 }} }finally{b._v12Group=previous;}
}
function wrap(original){const base={...original};
 return {
 initializeActorState(){base.initializeActorState.call(this);initTraits(this);if(this.v12Battle&&this.v12BattleVersion!==2){for(const u of this.units){for(const st of u.statuses)if(st.until===180001)st.until=battleEnd;for(const sh of u.shieldLayers||[])if(sh.until===180001)sh.until=battleEnd;}this.v12BattleVersion=2;}},
 forkProjectionState(){const fork=base.forkProjectionState.call(this);for(const u of fork.units)if(u.npcId||u.v12Traits?.length)u.model=copy(u.model);return fork;},
 snapshot(){return {...base.snapshot.call(this),v12Battle:!!this.v12Battle,v12Session:this.v12Session||null,v12BattleVersion:2,v12StalledSince:this.v12StalledSince??null};},
 selectActor(){const before=this.activeId;base.selectActor.call(this);const u=this.unit(this.activeId);if(u&&u.id!==before)beginTurn(this,u);},
 effective(u){let out=base.effective.call(this,u);const q={...out},s=state(u);let B=1,D=1,A=1;
  if(has(u,'moss-armor-accumulation')){B+=.05*s.mossStacks;D+=.1*s.mossStacks;}
  A+=.05*s.iceAgility;
  if(u.npcId==='chengliang')B=1; // permanent body is applied once to the source model
  for(const owner of this.units.filter(o=>o.npcId==='chengliang'&&this.alive(o))){const stacks=owner.v12NPC?.grid?.enemies?.[u.id]||0;if(!has(u,'frost-moss-immunity'))A*=1-.05*stacks;}
  for(const st of this.status(u,'v12Stats')){const scale=st.value??1;B*=1+(st.values?.B||0)*scale;D*=1+(st.values?.D||0)*scale;A*=1+(st.values?.A||0)*scale;for(const k of ['S','C','P'])q[k]*=1+(st.values?.[k]||0)*scale;}
  q.B*=B;q.D*=D;q.A*=A;const nd=R.derive(q),prior=R.derive(out);for(const k of ['PA','SA','MA','DEF','MDEF'])q[k]=out[k]*(nd[k]/Math.max(.01,prior[k]));return q;
 },
 castTime(u,s){return base.castTime.call(this,u,s)*(s.category==='攻击'?(this.value(u,'v12Cast')||1):1)/(1-tideRates(this,u).cast);},
 actionRate(u){return u.v12Channel?0:base.actionRate.call(this,u)*(1-tideRates(this,u).action);},
 cost(u,s){return Math.ceil(base.cost.call(this,u,s)*(state(u).costPressure?1.3:1));},
 basicCost(u){return Math.ceil(base.basicCost.call(this,u)*(state(u).costPressure?1.3:1));},
 targetOptions(u,action){const s=u.skills.find(s=>s.id===action);if(s?.target==='另一名队友')return this.units.filter(t=>t.team===u.team&&t.id!==u.id&&this.alive(t));return base.targetOptions.call(this,u,action);},
 hitChance(u,t,ch,bonus=0){let result=base.hitChance.call(this,u,t,ch,bonus);if(ch!=='精神'&&['chengliang','sailiya_fengzhi'].includes(u.npcId)){const a=this.effective(u),z=this.effective(t),controlled=!!this.value(t,'control'),c=this.dodgeConfig||{coefficient:.4,bonus:.35,cap:.9},active=!controlled&&this.value(t,'activeDodge'),diff=Math.max(0,a.A/Math.max(20,u.model.benchmark)-(controlled?0:z.A/Math.max(20,t.model.benchmark)));result=Math.max(.6,Math.min(.97,.9+diff*(active?c.coefficient:.12)));if(!controlled)result-=this.value(t,'evasion');if(active)result-=c.bonus;result=Math.max(active?1-c.cap:.4,result);if(u.npcId==='chengliang')result=Math.max(.6,result)+(u.v12NPC?.vision.gazeTargetId===t.id?.08:0);result=Math.min(.97,result+bonus)-this.value(u,'accuracyDown');}if(ch!=='精神'&&!this._packetSkill?.spaceLock)result-=this.value(t,'v12Evasion');return Math.max(.05,Math.min(.97,result));},
 hit(u,t,ch,bonus=0){const out=(u.npcId==='chengliang'?ControlActions.methods.hit:base.hit).call(this,u,t,ch,bonus);if(ch!=='精神')t.statuses=t.statuses.filter(st=>st.type!=='v12Evasion');return out;},
 tryControl(u,t,s,duration){if(has(t,'frost-moss-immunity')&&API.battle.skillAttributes.attributeTags(s).includes('冰')){this.addLog(t.name+'免疫冻结。');return;}return base.tryControl.call(this,u,t,s,duration);},
 actionReason(u,action){if(u.v12Channel)return '正在维持天阑舞';return base.actionReason.call(this,u,action);},
 command(id,action,target){const u=this.unit(id),before=u?.mp||0;const err=base.command.call(this,id,action,target);if(err)return err;const paid=Math.max(0,before-u.mp);absorbManaSpent(this,u,paid);if(u.cast?.skill?.category==='攻击')u.statuses=u.statuses.filter(st=>st.type!=='v12Cast');if(action==='attack'||u.cast?.skill?.category==='攻击')u.statuses=u.statuses.filter(st=>st.type!=='phaseSwap');if(u.npcId==='sailiya_fengzhi'&&(action==='attack'||['攻击','持续伤害'].includes(u.cast?.skill?.category))){const out=API.npc.TRAITS.sailiya_fengzhi.activateRune(u.v12NPC,{castId:u.cast?.eventId||id+':'+u.actions,paidMainCost:paid,mpAvailable:u.mp});u.v12NPC=out.state;if(out.activated){u.mp-=out.extraCost;absorbManaSpent(this,u,out.extraCost);this.addLog(u.name+'附上符剑，额外魂力消耗'+out.extraCost+'。',{type:'trait',actor:id});}}return '';},
 plan(u,cast,pre){const ops=cast.skill?.npcOperations||cast.skill?.v12Operations;if(ops){const t=this.unit(cast.target);return {u,t,cast,s:cast.skill,damage:0,heal:0,channel:cast.skill.channel,effects:[()=>{if(cast.skill.target==='敌方全体'&&!ops.some(op=>op.type==='budgeted_area_attack'))for(const target of enemies(this,u))execute(this,u,target,cast.skill,ops);else execute(this,u,t,cast.skill,ops);}]};}return base.plan.call(this,u,cast,pre);},
 onActionComplete(u,cast){base.onActionComplete.call(this,u,cast);endAction(this,u,cast);},
 nextTime(){let next=base.nextTime.call(this);if(this.v12Battle){next=Math.min(next,this.now+250);for(const u of this.units)if(u.v12Channel)next=Math.min(next,u.v12Channel.next);}return next;},
 v12Pulse(){pulse(this);},
 v12CanPerform(u){if(this.value(u,'control'))return false;const active=this.activeId,ready=u.readyAt,cast=u.cast;this.activeId=u.id;u.readyAt=this.now;u.cast=null;try{return ['attack',...u.skills.map(s=>s.id)].some(action=>!this.actionReason(u,action)&&this.targetOptions(u,action).length>0);}finally{this.activeId=active;u.readyAt=ready;u.cast=cast;}},
 heal(t,amount,ch){if(!(amount>0)||!this.alive(t))return;const max=ch==='精神'?t.model.derived.SH:t.model.derived.HP,gap=max-(ch==='精神'?t.sh:t.hp);return base.heal.call(this,t,benefit(this,t,'heal',Math.min(amount,gap)),ch);},
 addShieldLayer(t,spec){const amount=benefit(this,t,'shield',spec.amount||0);if(spec.amount>0&&amount===0)return null;return base.addShieldLayer.call(this,t,{...spec,amount,until:this.v12Battle&&spec.until===180001?battleEnd:spec.until});},
 setStatus(u,type,value,duration,extra={}){if(!u)return;
  if(has(u,'frost-moss-immunity')&&['slow','freeze','sluggish','agilityDown','statDownA','frostCastSlow'].includes(type))return;
  if(u.npcId==='chengliang'&&['fatigue','aging','decay','illusion','disguise'].includes(type))return;
  if(['resource_seal','resource_prohibition'].includes(type)||extra.tags?.some(t=>['resource_seal','resource_prohibition'].includes(t))){state(u).sealed=true;if(u.v12NPC?.secretOrigin){u.v12NPC.secretOrigin.sealed=true;u.v12NPC.secretOrigin.pending=0;}}
  if(duration===180.001&&this.v12Battle)duration=battleDuration;if(['agility','attackBoost','v12Stats','evasion'].includes(type)||type.startsWith('statUp')){value=benefit(this,u,'buff',value);if(!value)return;}
  return base.setStatus.call(this,u,type,value,duration,extra);
 },
 damageValue(u,t,raw,ch,pre){let amount=base.damageValue.call(this,u,t,raw,ch,pre);if(u.npcId==='chengliang')amount*=1+.1*(u.v12NPC?.grid.self||0);if(t.npcId==='chengliang'&&t.v12NPC?.vision.gazeTargetId===u.id)amount*=1.1;if(has(t,'moss-armor-accumulation')&&!u.scarred&&!this._packetSkill?.trueDamage)amount*=1-Math.min(.15,.05*Math.floor(state(t).mossStacks/4));for(const st of this.status(t,'v12Vulnerability'))if(u.id!==st.v12Caster)amount*=1+st.value;return Math.max(0,Math.round(amount));},
 previewProtection(t,damage,ch,source){let out=base.previewProtection.call(this,t,damage,ch,source);if(this._v12BypassShield){return {...out,nextLayers:copy(t.shieldLayers||[]),blocked:0,guardBlocked:0,absorbed:0,mpCost:0,healthDamage:damage};}if(this._v12DoubleDefense&&out.mpCost>0){const absorption=Math.min(out.absorbed||out.mpCost,Math.floor(t.mp/2));return {...out,absorbed:absorption,mpCost:absorption*2,healthDamage:out.afterShields-absorption};}return out;},
 applyDamage(t,amount,ch,source,fx){if(!this.alive(t)||amount<=0)return;
  const tags=API.battle.skillAttributes.attributeTags(this._packetSkill||source?.soul),ice=tags.includes('冰');
  if(has(t,'frost-moss-immunity')){const key=t.id+':cold',old=t.shieldLayers?.find(s=>s.source===key)?.amount||0;this.addShieldLayer(t,{source:key,label:'封寒',amount:Math.min(t.model.derived.HP*.5,old+t.model.derived.HP*.05*(ice?2:1)),channel:'生命',until:battleEnd});if(ice){this.heal(t,amount,'生命');this.addLog(t.name+'霜苔不侵：冰伤转为生命。',{type:'trait',target:t.id});return;}}
  if(has(t,'ice-shell-preservation')&&!state(t).shellFirst){shell(this,t);state(t).shellFirst=true;}
  const hp=t.hp,sh=t.sh,mp=t.mp,layers=copy(t.shieldLayers||[]);
  const basicRune=source?.npcId==='sailiya_fengzhi'&&source.v12NPC?.rune?.active&&!this._packetSkill&&!this._periodic&&!this._v12NoRune,priorDouble=this._v12DoubleDefense;if(basicRune)this._v12DoubleDefense=true;
  try{base.applyDamage.call(this,t,amount,ch,source,fx);}finally{this._v12DoubleDefense=priorDouble;}absorbManaSpent(this,t,Math.max(0,mp-t.mp));
  const hpLoss=Math.max(0,hp-t.hp),shLoss=Math.max(0,sh-t.sh);
  const blocked=Math.max(0,layers.reduce((n,l)=>n+l.amount,0)-(t.shieldLayers||[]).reduce((n,l)=>n+l.amount,0));if(state(t).reserve?.until>this.now&&blocked>0){state(t).storedEnergy=Math.min(state(t).reserve.cap,(state(t).storedEnergy||0)+blocked*state(t).reserve.rate);state(t).storedUntil=state(t).reserve.until;}
  if(has(t,'moss-armor-accumulation')&&(hpLoss+shLoss)>0&&!this._periodic)state(t).mossStacks=Math.min(12,state(t).mossStacks+1);
  if(has(t,'oppressive-tides')&&source&&!this._periodic){const old=state(source).tides[t.id];state(source).tides[t.id]={stacks:Math.min(3,(old&&old.until>this.now?old.stacks:0)+1),until:this.now+6000};state(source).costPressure=true;}
  if(t.npcId==='sailiya_fengzhi'){const out=API.npc.TRAITS.sailiya_fengzhi.recordDamage(t.v12NPC,{realHP:hpLoss,realSH:shLoss,lethal:!this.alive(t)});t.v12NPC=out.state;}
  if(source?.npcId==='chengliang'&&this.alive(source)&&hpLoss>0){const out=API.npc.TRAITS.chengliang.handle(source.v12NPC,{type:'damage-dealt',actualHP:hpLoss,target:{lifeType:t.lifeType||'生活'}});source.v12NPC=out.state;traitEffects(this,source,out.effects);}
  if(basicRune&&this.alive(t)){this._v12NoRune=true;try{this.applyDamage(t,Math.round(amount*.3),'能量',source,'rune');}finally{this._v12NoRune=false;}}
  if(has(t,'ice-shell-preservation')&&source&&!this._v12Reflection){for(const layer of layers.filter(l=>l.label==='冰壳护生')){const after=t.shieldLayers?.find(l=>l.source===layer.source);const absorbed=Math.max(0,layer.amount-(after?.amount||0));state(t).shellAbsorbed[layer.source]=(state(t).shellAbsorbed[layer.source]||0)+absorbed;if(!after&&absorbed>0){const reflected=Math.round(state(t).shellAbsorbed[layer.source]*.3);this._v12Reflection=true;this._v12BypassShield=true;try{this.applyDamage(source,reflected,'能量',t,'ice');}finally{this._v12Reflection=false;this._v12BypassShield=false;}}}}
 },
 aiChoice(u){if(!this.v12Battle&&!u.npcId&&!u.beastId)return base.aiChoice.call(this,u);const ts=enemies(this,u).sort((a,b)=>a.hp/a.model.derived.HP-b.hp/b.model.derived.HP),t=ts[0];if(!t)return null;if(u.bonusAttack)return {action:u.mp>=this.basicCost(u)?'attack':'skipBonus',target:t.id};const skills=u.skills.filter(s=>!this.actionReason(u,s.id));let best={action:!this.actionReason(u,'attack')?'attack':'wait',target:t.id,score:2};for(const s of skills){const self=['强化','防御','治疗'].includes(s.category),target=s.target==='另一名队友'?this.targetOptions(u,s.id)[0]:(self?u:t);if(!target)continue;let score=['攻击','持续伤害'].includes(s.category)?8:s.category==='控制'?(t.cast?11:5):s.category==='减益'?4:s.category==='防御'?(u.shieldHP<u.model.derived.HP*.15?6:-1):s.category==='治疗'?(u.hp<u.model.derived.HP*.7?10:-1):u.statuses.some(st=>st.source===u.id+':'+s.id||st.source===u.id+'-'+s.id||st.label===s.name)?-1:7;if((s.damageMode==='periodic'||s.category==='持续伤害')&&t.dots.some(d=>d.key===u.id+'-'+s.id))score=-1;if(score>best.score)best={action:s.id,target:target.id,score};}return best;},
 checkResult(){if(!this.v12Battle)return base.checkResult.call(this);for(const u of this.units){if(!u.fallen&&!this.alive(u)){u.fallen=true;u.cast=null;u.v12Channel=null;if(u.npcId==='chengliang')u.v12NPC=API.npc.TRAITS.chengliang.handle(u.v12NPC,{type:'defeat'}).state;if(u.npcId==='xutaiping')u.v12NPC=API.npc.TRAITS.xutaiping.onOwnerDefeat(u.v12NPC);this.addLog(u.name+'退场。',{type:'fall',target:u.id});}}const friend=this.units.some(u=>u.team===0&&this.alive(u)),enemy=this.units.some(u=>u.team===1&&this.alive(u));if(!enemy||!friend){this.result={winner:!friend&&!enemy?null:friend&&!enemy?0:1,reason:!friend&&!enemy?'双方同时退场':friend&&!enemy?'魂兽实际退场':'讨伐队伍全灭',time:this.now,huntOutcome:!friend&&!enemy?'draw':friend&&!enemy?'victory':'loss'};this.addLog(this.result.reason,{type:'huntResult'});return;}const capable=this.units.some(u=>this.alive(u)&&((u.cast&&u.cast.action!=='wait')||u.v12Channel||this.v12CanPerform(u)));if(capable)this.v12StalledSince=null;else this.v12StalledSince??=this.now;if(this.v12StalledSince!==null&&this.now-this.v12StalledSince>=10000){this.result={winner:null,reason:'连续10秒无人能行动，讨伐中止',time:this.now,huntOutcome:'draw'};this.addLog(this.result.reason,{type:'huntResult'});}},
 resolveDraw(reason){if(!this.v12Battle)return base.resolveDraw.call(this,reason);this.result={winner:null,reason:'讨伐平局：'+reason,time:this.now,huntOutcome:'draw'};},
 finishByTime(){if(!this.v12Battle)return base.finishByTime.call(this);this.checkResult();}
 };
}
return {wrap,initializeBattle,runtime,initTraits,restoreMP,has,state};
})(globalThis);

// The single public Battle API. Helpers retain lexical state without prototype patches.
(function(root){
  const methods={
    onActionComplete:ModernActions.methods.onActionComplete,
    onResourceChange:ScarredActions.methods.onResourceChange,
    initializeActorState:ActorState.initialize,
    initializeModern:ModernActions.initialize,
    aiScore:UnifiedDecision.methods.aiScore,
    aiCandidates:UnifiedDecision.methods.aiCandidates,
    forecastExistingDOT:BattleProjection.methods.forecastExistingDOT,
    forecastFutureDOT:BattleProjection.methods.forecastFutureDOT,
    forecastAdvance:BattleProjection.methods.forecastAdvance,
    forecastAction:BattleProjection.methods.forecastAction,
    forkProjectionState:BattleProjection.methods.forkProjectionState,
    dispelShieldLayers:ShieldActions.methods.dispelShieldLayers,
    previewProtection:ScarredActions.methods.previewProtection,
    previewShieldDamage:ShieldActions.methods.previewShieldDamage,
    addShieldLayer:ShieldActions.methods.addShieldLayer,
    expireShields:ShieldActions.methods.expireShields,
    shieldLayersFor:ShieldActions.methods.shieldLayersFor,
    snapshot:AttributeActions.methods.snapshot,
    unit:BattleCore.methods.unit,
    alive:BattleCore.methods.alive,
    status:BattleCore.methods.status,
    value:StatusActions.methods.value,
    effective:ScarredActions.methods.effective,
    basicCost:ScarredActions.methods.basicCost,
    refreshExhaustion:BattleCore.methods.refreshExhaustion,
    cost:ScarredActions.methods.cost,
    castTime:ModernActions.methods.castTime,
    targetOptions:ModernActions.methods.targetOptions,
    canAct:BattleCore.methods.canAct,
    actionRate:ModernActions.methods.actionRate,
    advanceGauge:BattleCore.methods.advanceGauge,
    selectActor:BattleCore.methods.selectActor,
    endTurn:BattleCore.methods.endTurn,
    cooldownKey:BattleCore.methods.cooldownKey,
    cooldownUntil:BattleCore.methods.cooldownUntil,
    actionReason:ScarredActions.methods.actionReason,
    command:ModernActions.methods.command,
    addLog:BattleCore.methods.addLog,
    setStatus:AttributeActions.methods.setStatus,
    setBuff:StatusActions.methods.setBuff,
    hit:MemberActions.methods.hit,
    damageValue:ScarredActions.methods.damageValue,
    plan:ScarredActions.methods.plan,
    tryControl:ModernActions.methods.tryControl,
    applyDamage:ScarredActions.methods.applyDamage,
    heal:BattleCore.methods.heal,
    scheduleAI:ScarredActions.methods.scheduleAI,
    aiChoice:ScarredActions.methods.aiChoice,
    nextTime:ScarredActions.methods.nextTime,
    tick:BattleCore.methods.tick,
    hasOffense:ScarredActions.methods.hasOffense,
    resolveDraw:BattleCore.methods.resolveDraw,
    checkResult:BattleCore.methods.checkResult,
    finishByTime:ScarredActions.methods.finishByTime,
    surrender:BattleCore.methods.surrender,
    hitChance:AttributeActions.methods.hitChance,
    controlNumbers:MemberActions.methods.controlNumbers,
    forecastDamage:BattleProjection.methods.forecastDamage,
    scoreControlVariant:UnifiedDecision.methods.scoreControlVariant,
    compactEnabled:UnifiedDecision.methods.compactEnabled,
    aiStrike:BattleProjection.methods.aiStrike,
    aiAvailable:ActionForecast.methods.aiAvailable,
    aiSequence:ActionForecast.methods.aiSequence,
    aiThreatValue:ActionForecast.methods.aiThreatValue,
    compactActionScore:UnifiedDecision.methods.compactActionScore,
    statusSource:StatusActions.methods.statusSource,
    stackCap:StatusActions.methods.stackCap,
    stackedNext:StatusActions.methods.stackedNext,
    statusGain:StatusActions.methods.statusGain,
    buffImprovement:StatusActions.methods.buffImprovement,
    dotDamage:StatusActions.methods.dotDamage,
    refreshDotDamage:StatusActions.methods.refreshDotDamage,
    darkActionScore:UnifiedDecision.methods.darkActionScore,
    dodgeCost:AttributeActions.methods.dodgeCost,
    dotNature:AttributeActions.methods.dotNature,
    dotLabel:AttributeActions.methods.dotLabel,
    applyDotDamage:ModernActions.methods.applyDotDamage,
    gainRage:MemberActions.methods.gainRage
  };
  Object.assign(methods,V12Battle.wrap(methods));
  Object.defineProperties(root.WitnessBattle.Battle.prototype,Object.fromEntries(Object.entries(methods).map(([key,value])=>[key,{value,writable:true,configurable:true}])));
  root.WitnessRules.makeSkill=function(args){const skill=AttributeActions.methods.makeSkill(args);const b=Object.create(root.WitnessBattle.Battle.prototype),u={id:'preview',model:args.stats,soul:args.soul,style:args.style,level:args.stats.level,statuses:[],modern:{sequence:0,overheat:[0,0]}};Object.assign(b,{now:0,units:[u],resourceConfig:root.WitnessRules.getResourceConfig(),log:[],events:[]});return {...skill,previewCost:b.cost(u,skill),previewCast:root.WitnessRules.round2(b.castTime(u,skill)*(skill.castMultiplier||1)),previewRulesVersion:17};};
})(globalThis);

// Panel projections call the exact same model/skill/cost methods as combat.
(function(root){
  const B=root.WitnessBattle,R=root.WitnessRules;
  R.characterView=function(character,soul){
    const c=JSON.parse(JSON.stringify(character));c.stats=R.buildStats({...c,soul});
    const u=B.playerUnit(c,soul),b=Object.create(B.Battle.prototype);
    Object.assign(u,{hp:u.model.derived.HP,mp:u.model.derived.MP,sh:u.model.derived.SH,statuses:[],dots:[],cooldowns:{},uses:{},actions:0,modern:{sequence:0,overheat:[0,0]}});
    Object.assign(b,{units:[u],now:0,seed:'panel-preview',resourceConfig:R.getResourceConfig(),events:[],log:[],dodgeConfig:root.WitnessTacticsV10.config});
    const skills=u.skills.map(s=>({...s,cost:b.cost(u,s),cast:b.castTime(u,s)*(s.castMultiplier||1),previewCost:b.cost(u,s),previewCast:b.castTime(u,s)*(s.castMultiplier||1),costResolved:true}));
    return {model:u.model,unit:{...u,skills},skills,basicCost:b.basicCost(u),calculationVersion:11};
  };
})(globalThis);

(function(root){
const R=root.WitnessRules,A=root.WitnessV12,copy=x=>JSON.parse(JSON.stringify(x)),baseBuild=R.buildStats,baseMake=R.makeSkill;
R.buildStats=function(args){const out=baseBuild(args),ledger=args.v12Equipment;if(ledger){const bonus=A.soulbone.absorption.attributeTotals(ledger);for(const [key,value]of Object.entries(bonus))out.stats[key]+=value;out.derived=R.derive(out.stats);if(R.isMental(args.soul)){out.derived.HP=Math.round(out.derived.HP*.78);out.derived.MA=R.round2(out.derived.MA*.72);out.derived.PA=R.round2(out.derived.PA*.85);out.derived.SA=R.round2(out.derived.SA*.85);}}out.rings=Math.max(out.rings,args.rings?.length||0);return out;};
R.makeSkill=args=>A.battle.skillAttributes.tagSkill(baseMake(args),args.soul);
const B=root.WitnessBattle,player=B.playerUnit;B.playerUnit=function(character,soul){const u=player(character,soul);u.v12Traits=Object.values(character.v12Equipment?.runtimeTraits||{}).map(t=>({...copy(t),id:t.traitId}));u.v12Permanent=copy(character.v12TraitProgress||{});return u;};
function persist(character,battle){const u=battle.unit('player');if(!u)return;character.v12TraitProgress||={};for(const trait of u.v12Traits||[])if((trait.id||trait.traitId)==='moss-armor-accumulation'&&trait.ownerBoneId)character.v12TraitProgress[trait.ownerBoneId]={mossStacks:Math.min(12,Math.max(0,u.v12State?.mossStacks||0))};}
root.WitnessV12Live={version:1,gameVersion:'v12.01',persist,traitHandlers:['frost-moss-immunity','moss-armor-accumulation','ice-shell-preservation','frost-domain','oppressive-tides','devouring-soul-recovery'],npcIds:['chengliang','xutaiping','sailiya_fengzhi']};
})(globalThis);

})();

  // END V13 PLAYER ENGINE
  host.WitnessRules=globalThis.WitnessRules;
  host.WitnessBattle=globalThis.WitnessBattle;
  host.WitnessTemplates=globalThis.WitnessTemplates;
  host.WitnessV13Rules=globalThis.WitnessRules;
  host.WitnessControlV9=globalThis.WitnessControlV9;
  host.WitnessStackRules=globalThis.WitnessStackRules;
  host.WitnessTacticsV10=globalThis.WitnessTacticsV10;
  host.WitnessMechanicsV14=globalThis.WitnessMechanicsV14;
  host.WitnessProjectionV14=globalThis.WitnessProjectionV14;
  host.WitnessAIV14=globalThis.WitnessAIV14;
  host.WitnessScarredChallenge=globalThis.WitnessScarredChallenge;
  host.WitnessV12=globalThis.WitnessV12;
  host.WitnessV12Live=globalThis.WitnessV12Live;
})(window);
