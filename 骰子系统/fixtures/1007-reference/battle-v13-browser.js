(function(host){
  const globalThis={};
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
  function mainStyles(soul){return [...new Set(soul.style.split('/').map(s=>s.includes('辅助')?'辅助':s))].filter(s=>STYLE[s]);}
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
  function rating(model){
    const ring=Math.max(1,model.rings),standard=BASE[ring],score=KEYS.reduce((sum,k)=>sum+model.stats[k],0)/6/standard;
    const title=score<.90?'弱标准':score<1.15?'标准':score<1.40?'强标准':'特级标准';
    return {score:round2(score),label:title+['零','一','二','三','四','五','六','七','八','九'][ring]+'环',basis:'六项能力均值 / '+standard+'；同环起点标准，不含临时增益'};
  }
  const api={soulControl,setResourceConfig,getResourceConfig:()=>({...resourceConfig}),skillBudget,rating,KEYS,LABELS,BASE,GRADE,STYLE,CAPS,BANDS,QS,WEIGHTS,CATEGORIES,benchmark,shapeMods,mainStyles,isMental,derive,buildStats,controlEffect,band,pickCategory,makeSkill,round2};
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
    "trait": "thunder",
    "source": "用户2026-10-16新版一至五技；第六为10.07候选",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "极速",
        "category": "强化",
        "modernEffect": "qinyanSpeed",
        "selfOnly": true,
        "costPercent": 0.06,
        "castFixed": 0.65,
        "cd": 12,
        "description": "以身体潜能提高肉体强度25%、敏捷20%，最多三个动作或18秒；普通形态结束后疲劳，半能量形态内无身体负荷。"
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
        "factor": 1.15,
        "castFixed": 1.0,
        "cd": 8,
        "fx": "lightning",
        "sharedCooldown": "qinyan-spear",
        "description": "冲击爆炸型雷矢，命中后直接爆炸；与操控型共用冷却。",
        "subActions": [
          {
            "name": "雷化·操控雷矢",
            "category": "持续伤害",
            "channel": "能量",
            "factor": 0.9857142857142857,
            "castFixed": 1,
            "cd": 8,
            "fx": "lightning",
            "dotFirstMs": 2000,
            "dotTicks": 1,
            "sharedCooldown": "qinyan-spear",
            "description": "操控爆炸型雷矢：命中部署，两秒后爆炸；不单独模拟距离，与冲击型共用冷却。"
          }
        ]
      },
      {
        "name": "重炮",
        "category": "攻击",
        "channel": "物理",
        "factor": 1.6,
        "castFixed": 2,
        "cd": 9,
        "hitKind": "blunt",
        "modernEffect": "railgun",
        "description": "蓄力两秒的电磁动能炮，造成物理伤害；普通形态发射手臂过热10秒，任一臂过热时不可置换。"
      },
      {
        "name": "乌拉诺斯",
        "category": "强化",
        "modernEffect": "uranus",
        "selfOnly": true,
        "costPercent": 0.1,
        "castFixed": 1,
        "cd": 28,
        "description": "支付6%最大精神护持，半能量化8秒；肉体强度提高15%，刺斩减伤20%，其他技费用降低15%；无身体负荷极速和无新增过热重炮。结束后需精神蓄养。"
      },
      {
        "name": "极光·天极贯流",
        "category": "攻击",
        "channel": "能量",
        "attackSubtype": "multi",
        "factor": 1.3,
        "modernEffect": "qinyanSix",
        "castFixed": 1.8,
        "cd": 18,
        "fx": "lightning",
        "description": "三段极光贯流，共用命中；乌拉诺斯内读条1.3秒。不附带必中、控制或永久破甲。"
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
    "trait": "pierce",
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
    "trait": "heavy",
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
    "trait": "poison",
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
    "trait": "ghost",
    "source": "当前登记 哈什用户补充完整原文",
    "note": "六招式考核库，按实际环数开放，最多六技。",
    "skills": [
      {
        "name": "虚像投影",
        "category": "强化",
        "channel": "能量",
        "evasion": 0.15,
        "costPercent": 0.08,
        "fx": "ghost",
        "description": "无攻击幻像扰乱瞄准，闪避提高15个百分点，持续整场。",
        "burstActions": 0,
        "buffMode": "battle",
        "castFixed": 0.5,
        "costMultiplier": 0.8
      },
      {
        "name": "虚空匿行",
        "category": "强化",
        "channel": "能量",
        "evasion": 0.3,
        "buff": 0.18,
        "burstActions": 3,
        "costPercent": 0.12,
        "castFixed": 0.75,
        "cd": 14,
        "fx": "ghost",
        "description": "隐匿准备0.75秒，攻击提高18%、闪避提高30个百分点；持续随后三个已完成动作（含附赠普攻），不能变为全通道必中回避。",
        "buffMode": "actions"
      },
      {
        "name": "虚能爆裂",
        "category": "控制",
        "channel": "能量",
        "baseControl": 1.6,
        "dispel": 0.6,
        "chipFactor": 0.35,
        "costPercent": 0.1,
        "cd": 12,
        "castFixed": 0.65,
        "fx": "wave",
        "description": "铭符爆裂造成能量伤害，削去60%生命盾，并尝试控制及打断。 完成后获得下一次能量攻击30%免伤，最多保留4秒。",
        "castMultiplier": 1,
        "costMultiplier": 1,
        "energyWard": true
      },
      {
        "name": "虚实刻印",
        "category": "攻击",
        "channel": "能量",
        "mindPower": true,
        "factor": 2.2,
        "cd": 8,
        "fx": "ghost",
        "description": "以精神力驱动实体铭符，造成能量伤害；不赋予投影攻击能力。 读条0.8秒，消耗较原预算降低20%，保留原伤害倍率。",
        "costMultiplier": 0.8,
        "castFixed": 0.8
      },
      {
        "name": "铭符折护",
        "category": "防御",
        "fx": "ghost",
        "description": "实体铭符卸散来袭能量，形成生命护盾，持续8秒；投影本身仍无攻击能力。"
      },
      {
        "name": "晦光滞流",
        "category": "减益",
        "effects": [
          {
            "key": "C",
            "value": 0.18
          },
          {
            "key": "A",
            "value": 0.12
          }
        ],
        "effectSeed": "proposal-晦光滞流",
        "description": "实体铭符扰乱魂力，魂力操纵降低18%、敏捷降低12%；一次精神判定，持续整场。"
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
    "trait": "frugal",
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
        "description": "将玫瑰牵制拆出缠枝，短时削防并减速18%。",
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
    "trait": "swift",
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
    "trait": "pierce",
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
    "trait": "pierce",
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
    "trait": "poison",
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
    "trait": "pierce",
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
    "trait": "focus",
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
    "trait": "ice",
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
    "trait": "focus",
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
function normalizeSkill(skill){if(skill.category==='持续伤害')skill={...skill,category:'攻击',damageMode:'periodic'};if(skill.category==='减益')skill={...skill,effect:String(skill.effect||'').replace(/持续\d+(?:\.\d+)?秒/g,'持续整场')};return {...copy(skill),damageNature:skill.damageNature||(skill.fx==='poison'||/毒/.test(skill.name+' '+(skill.description||''))?'poison':'residual'),id:skill.id||`${skill.ring}-${skill.name}`,fx:skill.fx||'wave'};}
function playerUnit(character,soul){soul=copy(soul);
    if(!character.stats)throw Error('先生成角色基础能力');
    const model=R.buildStats({...character,soul});
    const skills=(character.rings||[]).flatMap(r=>r.skills.map(s=>({...R.makeSkill({soul,style:character.style,stats:model,index:r.index,years:r.years,category:s.category,damageMode:s.damageMode||((s.category==='持续伤害'||s?.damageMode==='periodic')?'periodic':'direct'),attackSubtype:s.attackSubtype,generationVersion:s.generationVersion,effectVariant:s.effectVariant,effects:s.effects,effectSeed:s.effectSeed}),...(!['控制','减益'].includes(s.category)?{name:s.name}:{})}))).map(s=>normalizeSkill({...s,fx:fxFor(soul)}));
    return {id:'player',name:character.name||'你的见证者',team:0,soul:copy(soul),style:character.style,release:character.release,level:character.level,model,skills,portrait:null,source:'玩家人设'};
  }
function templateUnit(template,level,id,team){
    const soul={id:'npc-'+template.id,name:template.weapon,tier:7,main_kind:template.kind,subkind:template.subkind,style:template.style,attribute:template.attribute,elements:[],spirit_specialist:!!template.mental,combat_profile:{trait:template.trait,trait_name:'模板特征',description:''}};
    const release=template.kind==='兽'?'附体':'召出';
    const raw=R.buildStats({level,soul,style:template.style,release}),average=R.KEYS.reduce((n,k)=>n+raw.stats[k],0)/6;
    const growth=Object.fromEntries(R.KEYS.map(k=>[k,R.round2(raw.stats[k]*((template.statRatio||1.28)*raw.benchmark/average-1))]));
    const model=R.buildStats({level,soul,style:template.style,release,growth});
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

  class Battle { constructor({character,soul,playerTemplateId=null,testLevel=41,duel=false,enemyId='qinyan',withSupport=false,seed='battle',snapshot=null,difficulty='standard',challengeId=null,postGameChallenge=false,challengeSessionId=null,enemyLevelOverride=null}){
      if(snapshot){if(![13,14,15].includes(snapshot.combatRulesVersion))throw Error('不支持的战斗规则');if(snapshot.combatRulesVersion===14&&snapshot.v14ShieldVersion!==1)throw Error('不支持的V14护盾存档版本');if(snapshot.playerRulesVersion!==2||snapshot.soulControlVersion!==11||![13,14,15].includes(snapshot.combatRulesVersion))throw Error('此战报使用旧版战斗规则，请保留人物并重新开战');if(snapshot.version!==10)throw Error('旧版即时战斗战报不能用于行动滚轴，请返回登记重开本场');Object.assign(this,copy(snapshot));this.rng=new D.DiceEngine(this.seed,this.rngState);this.events=[];if(this.result&&(this.result.winner===null||this.result.tieBreak&&snapshot.drawRulesVersion!==2))this.resolveDraw(this.result.reason.split(' · ')[0]);this.controlRules={...(snapshot.controlRules||root.WitnessControlV9.getConfig())};ShieldActions.initialize(this);ChallengeBattle.restore(this);return;}
      const t=templates.find(t=>t.id===enemyId)||templates[0];
      if(playerTemplateId){const chosen=templates.find(t=>t.id===playerTemplateId);if(!chosen)throw Error('角色卡不存在');const l=Math.max(41,Math.min(99,Math.round(testLevel)));soul={name:chosen.weapon};character={level:l,style:chosen.style,rings:[]};}
      soul=copy(soul);character=copy(character);const level=Math.max(1,character.level),enemyLevel=enemyLevelOverride??(difficulty==='admission'?Math.max(1,Math.floor(Math.max(0,level-1)/10)*10+1,level-5):level);character.level=level;if(!playerTemplateId)character.stats=R.buildStats({...character,soul});
      const count=R.benchmark(level).rings;
      // 玩家使用已经获得的全部魂环与魂技；考官按实际环数开放，最多六技。
      const units=[playerTemplateId?templateUnit(templates.find(t=>t.id===playerTemplateId),level,'player',0):playerUnit(character,soul),templateUnit(t,enemyLevel,'enemy',1)];
      const support=templates.find(t=>t.support),fighter=templates.find(t=>t.id==='yixing');
      if(character.style==='辅助'&&!duel)units.push(templateUnit(fighter,level,'ally',0),templateUnit(support,enemyLevel,'enemySupport',1));
      else if(withSupport)units.push(templateUnit(support,level,'ally',0),templateUnit(support,enemyLevel,'enemySupport',1));
      this.resourceConfig=R.getResourceConfig();this.activeId=null;this.queueSequence=0;this.units=units.map(runtime);this.difficulty=difficulty;this.postGameChallenge=postGameChallenge;this.challengeSessionId=challengeSessionId;this.seed=String(seed);this.rng=new D.DiceEngine(this.seed);this.now=0;this.result=null;this.log=[];this.events=[];this.turn=0;
      for(const u of this.units)u.tiePriority=this.rng.die(100000);
      this.addLog('斗魂台开启。对手按当前等级切磋；HP或精神护持归零即退场；魂力耗尽不自动失败。同速同时准备时按种子投骰决定顺序。');
      if(difficulty==='admission')this.addLog('入会考核：考官通常低5级但保留所在魂环阶段，伤害为标准的90%，双方行动后均回气0.3秒；按环数开放，最多六技。');
      this.addLog('行动滚轴：敏捷积累行动机会，完成后依次获得回合；实际等级参战，考核降级不会跨越魂环阶段。');
      ShieldActions.initialize(this);if(challengeId)ChallengeBattle.initialize(this,challengeId);this.scheduleAI();this.controlRules={...root.WitnessControlV9.getConfig()};
    } }
  root.WitnessBattle={Battle,templateUnit,playerUnit,fxFor,templates};


  const unit=function(id){return this.units.find(u=>u.id===id);};

  const alive=function(u){return !!u&&!u.fallen&&u.hp>0&&u.sh>0;};

  const status=function(u,type){return u.statuses.filter(s=>s.type===type&&s.until>this.now);};



  const trait=function(u){return u.soul.combat_profile?.trait||'focus';};

  const basicCost=function(u){return Math.max(1,Math.ceil(u.model.derived.baseMP*this.resourceConfig.basicFraction));};

  const refreshExhaustion=function(){};

  const cost=function(u,s){
      let cost=s.costPercent?Math.max(s.cost,Math.ceil(u.model.derived.baseMP*s.costPercent*(1-u.model.derived.costReduction/100))):s.cost;
      cost*=1+this.value(u,'costUp');
      const trait=this.trait(u);
      if(trait==='frugal'&&['强化','防御','治疗','回蓝'].includes(s.category))cost*=.88;
      if(trait==='focus'&&['控制','减益'].includes(s.category))cost*=.9;
      if(trait==='water'&&s.category==='减益')cost*=.92;
      if(trait==='fire'&&s.category==='攻击'&&s.channel==='能量')cost*=1.08;
      if(trait==='thunder'&&s.category==='攻击')cost*=1.05;
      return Math.max(1,Math.ceil(cost));
    };

  const castTime=function(u,s){
      let time=s.castFixed??(s.cast+(s.castExtra||0));
      if(this.trait(u)==='thunder'&&s.category==='攻击')time*=.9;
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
      for(const s of expired.filter(s=>s.fatigue))this.setStatus(u,'fatigue',.1,6,{source:s.source,label:(s.label||'强化')+'后疲劳',from:s.from});
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
      else if(action==='attack'){u.mp-=this.basicCost(u);duration=1.5;if(this.trait(u)==='heavy')duration+=.15;if(this.trait(u)==='swift')duration*=.88;}
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

  const addLog=function(text,event={}){const line={time:this.now,text,...event};this.log.push(line);if(this.log.length>1500)this.log.shift();this.events.push(line);};



  const plan=function(u,cast,pre){
      const t=this.unit(cast.target),s=cast.skill,a=pre[u.id],p={u,t,cast,s,damage:0,heal:0,channel:'物理',effects:[]};
      if(cast.action==='wait')return p;
      if(!t||!this.alive(t))return p;
      if(['defend','defendSH'].includes(cast.action)){p.effects.push(()=>this.setStatus(u,cast.action==='defendSH'?'defendSH':'defendHP',1,3));return p;}
      if(cast.action==='tune'){p.effects.push(()=>{u.mp=Math.min(u.model.derived.MP,u.mp+Math.round(u.model.derived.baseMP*.08));this.addLog(u.name+'调息恢复魂力',{type:'restore',actor:u.id,target:u.id,fx:'restore'});});return p;}
      if(cast.action==='calm'){p.heal=Math.round(u.model.derived.SH*.08);p.channel='精神';return p;}
      const cat=s?.damageMode==='periodic'?'持续伤害':s?.category||'攻击',channel=s?.channel||(u.soul.spirit_specialist?'精神':'物理');p.channel=channel;
      const power=s?.attackSubtype==='pursuit'?a.A*s.agilityCoefficient:s?.mindPower?a.MA:channel==='精神'?a.MA:channel==='物理'?a.PA:a.SA+(s?.poisonScaling||0)*a.MA,Q=s?.Q||1;
      if(cat==='攻击'||cat==='持续伤害'){
        const hit=this.hit(u,t,channel);p.hit=hit;
        if(!hit.success){this.addLog(`${u.name}的${s?.name||'普攻'}未命中（d100=${hit.roll}，阈值${hit.chance}）`,{type:'miss',actor:u.id,target:t.id,fx:'miss'});return p;}
        let raw=s?(cat==='持续伤害'?1:1.2)*Q*power*(s.factor??1):.45*power;
        const trait=this.trait(u);if(!s&&trait==='heavy')raw*=1.12;if(!s&&trait==='swift')raw*=.96;if(!s&&['guard','ghost'].includes(trait))raw*=.94;
        if(s&&cat==='攻击'&&trait==='fire'&&channel==='能量')raw*=1.1;
        if(cat==='持续伤害'&&trait==='poison')raw*=1.14;if(cat==='攻击'&&trait==='poison')raw*=.95;
        if(cat==='持续伤害')raw*=1.4;
        if(cast.rage)raw*=1+.15*cast.rage;
        if(cat==='持续伤害'){
          const tick=this.damageValue(u,t,raw/(s.dotTicks||3),channel,pre),key=u.id+'-'+s.id;
          p.effects.push(()=>{t.dots=t.dots.filter(d=>d.key!==key);t.dots.push({key,source:u.id,channel,baseDamage:tick,damage:Math.round(tick*(1+this.value(u,'dotBoost'))),next:this.now+(s.dotFirstMs||3000),rawPerTick:raw/(s.dotTicks||3),ticks:s.dotTicks||3,fx:s.fx,damageNature:this.dotNature(u,s)});this.addLog(t.name+'受到持续伤害状态',{type:'status',actor:u.id,target:t.id,fx:s.fx});});
        }else if(s?.attackSubtype!=='multi')p.damage=this.damageValue(u,t,raw,channel,s?.penetration?{...pre,[t.id]:{...pre[t.id],DEF:pre[t.id].DEF*(1-s.penetration)}}:pre);
        p.extraDamage=[];
        if(s?.attackSubtype==='multi'){const eachRaw=raw/3;p.damage=0;for(let n=0;n<3;n++)p.extraDamage.push({amount:this.damageValue(u,t,eachRaw,channel,pre),channel});}
        if(s?.secondaryFactor)p.extraDamage.push({amount:this.damageValue(u,t,1.2*Q*power*s.secondaryFactor,s.secondaryChannel||channel,pre),channel:s.secondaryChannel||channel});
        const cold=this.value(u,'coldAura');
        if(cold){const hits=s?.secondaryFactor?2:1;p.extraDamage.push({amount:this.damageValue(u,t,a.SA*cold*hits,'能量',pre),channel:'能量'});}
        if(s?.detonate){const dots=t.dots.filter(d=>d.source===u.id);p.damage+=dots.reduce((sum,d)=>sum+d.damage*d.ticks,0);p.effects.push(()=>t.dots=t.dots.filter(d=>d.source!==u.id));}
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
        if(this.trait(u)==='guard'&&!mental)shield=Math.round(shield*1.16);if(this.trait(u)==='water'&&!mental)shield=Math.round(shield*1.12);if(this.trait(u)==='ghost'&&mental)shield=Math.round(shield*1.16);
        if(mental)t.shieldSH=Math.max(t.shieldSH,shield);else t.shieldHP=Math.max(t.shieldHP,shield);
        t.shieldUntil=this.now+8000;t.oneHit=!!s.oneHit;t.guard=s.guard||0;t.rageOnBreak=!!s.rageOnBreak;
      });
      if(cat==='治疗'){p.channel=channel==='精神'?'精神':'生命';p.heal=Math.round(.4*Q*(p.channel==='精神'?a.MA:a.SA));if(this.trait(u)==='healing')p.heal=Math.round(p.heal*1.15);if(this.trait(u)==='life'&&p.channel!=='精神')p.heal=Math.round(p.heal*1.12);}
      if(cat==='回蓝')p.effects.push(()=>t.mp=Math.min(t.model.derived.MP,t.mp+Math.round(25+10*Q)));
      if(cat==='控制'&&s.chipFactor){p.damage=this.damageValue(u,t,1.2*Q*a.MA*s.chipFactor,channel,pre);}
      if(cat==='控制')p.effects.push(()=>{if(s.dispel)t.shieldHP=Math.round(t.shieldHP*(1-s.dispel));this.tryControl(u,t,s,s.baseControl);});
      if(s?.fieldEvasion)p.effects.push(()=>this.setStatus(u,'evasion',s.fieldEvasion,s.duration||9,{source:this.statusSource(u,s),label:s.name,from:u.name}));
      if(cat==='减益'&&s.slow)p.effects.push(()=>this.setStatus(t,'slow',s.slow,s.duration||8,{source:this.statusSource(u,s),label:s.name,from:u.name}));
      if(cat==='减益'&&s.costUp)p.effects.push(()=>this.setStatus(t,'costUp',s.costUp,s.duration||8,{source:this.statusSource(u,s),label:s.name,from:u.name}));
      if(cat==='减益')p.effects.push(()=>{const effect=R.controlEffect(Q,pre[u.id],pre[t.id]),roll=this.rng.die(100);if(roll<=Math.round(effect.chance))this.setStatus(t,channel==='精神'?'mindDown':'defDown',.1*Q,6,{source:this.statusSource(u,s),label:s.name,from:u.name});this.addLog(`${u.name}减益判定${roll} / ${effect.chance}%`,{type:'status',actor:u.id,target:t.id,fx:s.fx});});
      return p;
    };

  const tryControl=function(u,t,s,baseControl){
      if(!this.alive(t))return;if(t.immuneUntil>this.now||this.value(t,'controlWard')){this.addLog(t.name+'处于控制免疫期');return;}
      const effect=R.controlEffect(s.Q,this.effective(u),this.effective(t));
      if(baseControl!==undefined)effect.duration=R.round2(Math.max(.01,baseControl*effect.ratio));
      if(this.trait(u)==='binding')effect.duration=effect.duration+.2;
      if(this.trait(u)==='ice')effect.chance=Math.min(85,effect.chance+6);
      const roll=this.rng.die(100);
      if(roll>Math.round(effect.chance)){this.addLog(`${t.name}抵抗控制（d100=${roll}，阈值${effect.chance}%）`,{type:'resist',actor:u.id,target:t.id,fx:'mind'});return;}
      t.progress=Math.min(t.progress,.4);t.queuedAt=null;const ms=Math.round(effect.duration*1000);this.setStatus(t,'control',1,effect.duration);t.immuneUntil=this.now+ms+4000;
      if(t.cast){this.addLog(`${t.name}的读条被打断，已扣魂力不返还`);t.cast=null;this.endTurn(t,false);}t.readyAt=Math.max(t.readyAt,this.now+ms);
      this.addLog(`${t.name}受控${effect.duration}秒（精神力P ${u.model.stats.P} 对 ${t.model.stats.P}）`,{type:'control',actor:u.id,target:t.id,fx:s.fx});
    };

  const applyDamage=function(t,damage,channel,source,fx){
      if(!damage||!this.alive(t))return;
      const mind=channel==='精神',trait=source?this.trait(source):'';
      const shieldKey=mind?'shieldSH':'shieldHP';let incoming=damage;
      if(trait==='annihilation'&&t[shieldKey]>0)incoming=Math.round(incoming*1.3);
      if(!mind&&t.guard){incoming=Math.round(incoming*(1-t.guard));t.guard=0;}
      const blocked=Math.min(t[shieldKey],incoming);t[shieldKey]-=blocked;incoming-=blocked;
      const special=!mind&&this.value(t,'soulArmor')>0;
      const fraction=Math.min(.70,this.resourceConfig.absorb+(special?.15:0));
      const unitCost=this.resourceConfig.mpPerDamage*(special?.75:1);
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
      if(!mind&&t.style==='辅助'&&!t.firstHit&&this.trait(t)==='life'&&t.hp>0){t.firstHit=true;this.heal(t,Math.round(t.model.derived.HP*.03),'生命');}
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
      this.refreshExhaustion();const times=[180000];
      for(const u of this.units)if(this.alive(u)&&u.exhaustTick>this.now)times.push(u.exhaustTick);
      for(const u of this.units){if(this.alive(u)&&!u.cast&&u.id!==this.activeId&&u.progress<1&&!this.value(u,'control')&&u.readyAt<=this.now)times.push(this.now+Math.max(1,Math.ceil((1-u.progress)/this.actionRate(u)*1000)));if(u.cast)times.push(u.cast.end);if(u.readyAt>this.now)times.push(u.readyAt);for(const s of u.statuses)if(s.until>this.now)times.push(s.until);for(const d of u.dots)if(d.next>this.now)times.push(d.next);if(u.shieldUntil>this.now)times.push(u.shieldUntil);}
      return Math.min(...times.filter(t=>t>this.now));
    };

  const tick=function(targetTime,autoPlayer=false){this.expireShields();
      if(this.result)return;this.scheduleAI(autoPlayer);const until=Math.min(targetTime,180000);
      let safety=0;
      while(!this.result&&this.now<until&&safety++<5000){
        if(!autoPlayer&&this.canAct(this.unit('player')))break;
        const next=this.nextTime();if(next>until){this.advanceGauge(until-this.now);this.now=until;break;}this.advanceGauge(next-this.now);this.now=next;
        for(const u of this.units){
          for(const s of u.statuses)if(s.until<=this.now&&s.fatigue)this.setStatus(u,'fatigue',.1,6,{source:s.source,label:(s.label||'强化')+'后疲劳',from:s.from});
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
      if(!this.result&&this.now>=180000)this.finishByTime();this.expireShields();
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
      for(const u of this.units)if(!u.fallen&&(u.sh<=0||(u.release==='召唤'?u.bodyHP<=0:u.hp<=0))){u.fallen=true;u.cast=null;this.addLog(u.name+'失去战斗能力，保护阵接住了他／她。',{type:'fall',target:u.id,fx:'wave'});}
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

  return {methods:{unit,alive,status,trait,basicCost,refreshExhaustion,cost,castTime,targetOptions,canAct,actionRate,advanceGauge,selectActor,endTurn,cooldownKey,cooldownUntil,actionReason,command,addLog,plan,tryControl,applyDamage,heal,scheduleAI,nextTime,tick,hasOffense,resolveDraw,checkResult,finishByTime,surrender}};
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
      if(s.effectVariant==='corrosion')this.status(t,type).find(x=>x.source===this.statusSource(u,s)).until=180001;
    });
    return p;
  };

  const forecastDamage=function(u,t,s){
    const a=this.effective(u),channel=s?.channel||(u.soul.spirit_specialist?'精神':'物理');
    const power=s?.mindPower?a.MA:channel==='精神'?a.MA:channel==='物理'?a.PA:a.SA+(s?.poisonScaling||0)*a.MA;
    let raw=s?((s.category==='持续伤害'||s?.damageMode==='periodic')?1.4:1.2)*s.Q*power*(s.factor??1):.45*power;
    if(s?.secondaryFactor)raw+=1.2*s.Q*power*s.secondaryFactor;
    if((s?.category==='持续伤害'||s?.damageMode==='periodic'))raw*=1+this.value(u,'dotBoost');
    if((s?.category==='持续伤害'||s?.damageMode==='periodic')&&this.trait(u)==='poison')raw*=1.14;
    if(s?.category==='攻击'&&this.trait(u)==='poison')raw*=.95;
    if(s?.category==='攻击'&&this.trait(u)==='fire'&&channel==='能量')raw*=1.1;
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
      const dotValue=t.dots.filter(d=>d.source===u.id).reduce((n,d)=>n+d.damage*Math.min(d.ticks,e.duration/3),0);
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
    u.statuses.push({type,value,until:180001,actionsRemaining,...extra,source});
  };

  const dotDamage=function(dot){
    const owner=this.unit(dot.source);
    return dot.baseDamage===undefined?dot.damage:Math.max(1,Math.round(dot.baseDamage*(1+(owner?this.value(owner,'dotBoost'):0))));
  };
root.WitnessStackRules={version:13,numeric:[...numeric],caps};
  return {methods:{statusSource,stackCap,value,stackedNext,statusGain,buffImprovement,setStatus,setBuff,dotDamage}};
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
    let subtype=args.attackSubtype;
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

  const snapshot=function(){this.expireShields();return {v14ShieldVersion:1,shieldLayerSequence:this.shieldLayerSequence||0,version:10,soulControlVersion:11,combatRulesVersion:15,modernVersion:1007,challengeId:this.challengeId||null,postGameChallenge:!!this.postGameChallenge,challengeSessionId:this.challengeSessionId||null,playerRulesVersion:2,drawRulesVersion:2,resourceConfig:this.resourceConfig,doubleEmptySince:this.doubleEmptySince??null,activeId:this.activeId,queueSequence:this.queueSequence,units:copy(this.units),seed:this.seed,rngState:this.rng.state,now:this.now,result:copy(this.result),log:copy(this.log),turn:this.turn,difficulty:this.difficulty||'standard',controlRules:{...(this.controlRules||root.WitnessControlV9.getConfig())},tacticsRulesVersion:1007,dodgeConfig:{...config,...this.dodgeConfig}};};

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
      if(!controlled){chance-=this.value(t,'evasion');if(this.trait(t)==='evasion')chance-=.08;}
      if(active){const advantage=Math.max(0,-diff);chance-=c.bonus+advantage*c.coefficient;}
      chance=clamp(chance,active?1-c.cap:.4,.97);
    }
    if(this.trait(u)==='sense')chance+=.05;
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
    plan.effects=plan.effects.map(apply=>()=>{const before=new Set(this.units.flatMap(t=>t.statuses));apply();for(const t of this.units)for(const status of t.statuses)if(!before.has(status)){status.until=180001;delete status.hitsRemaining;delete status.actionsRemaining;}});
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
    if(this.trait(u)==='binding')effect.duration=R.round2(effect.duration+.2);
    if(this.trait(u)==='ice')effect.chance=Math.min(85,effect.chance+6);
    if(s.controlChance!==undefined)effect.chance=s.controlChance;
    return effect;
  };

  const gainRage=function(u,amount){const gain=Math.max(0,Math.min(amount,5-(u.rageTotal||0)));u.rage=Math.min(5,u.rage+gain);u.rageTotal=(u.rageTotal||0)+gain;};

  const damageValue=function(u,t,raw,channel,pre){
      const penetration=this.value(u,'phantomPierce');
      if(channel!=='精神'&&penetration)pre={...pre,[t.id]:{...pre[t.id],DEF:pre[t.id].DEF*Math.max(0,1-penetration)}};
      const target=pre[t.id],trait=this.trait(u);let def=channel==='精神'?target.MDEF:target.DEF;def*=130/Math.max(20,t.model.benchmark);
      if(trait==='pierce'&&channel!=='精神')def*=.88;if(trait==='mind'&&channel==='精神')def*=.88;
      let damage=Math.max(1,Math.round(raw*100/(100+def)));
      if(this.difficulty==='admission'&&u.team===1)damage=Math.max(1,Math.round(damage*.9));
      if(channel!=='精神'&&this.trait(t)==='body')damage=Math.round(damage*.92);
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
      plan.effects.push(()=>{for(const dot of t.dots)if(!beforeDots.has(dot)&&dot.source===u.id){dot.baseDamage=Math.round(dot.baseDamage*1.35);dot.damage=this.dotDamage(dot);}u.statuses=u.statuses.filter(x=>x.type!=='bloodFirstStrike');this.tryControl(u,t,{...s,Q:s?.Q||1,controlChance:50},1);});
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
    if (source && this.trait(source) === 'annihilation' && layers.some(layer => layer.amount > 0)) {
      incoming = Math.round(incoming * 1.3);
    }
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
    const fraction = Math.min(.70, this.resourceConfig.absorb + (special ? .15 : 0));
    const unitCost = this.resourceConfig.mpPerDamage * (special ? .75 : 1);
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
      const trait = this.trait(unit);
      if (trait === 'guard' && !mental) amount = Math.round(amount * 1.16);
      if (trait === 'water' && !mental) amount = Math.round(amount * 1.12);
      if (trait === 'ghost' && mental) amount = Math.round(amount * 1.16);
      result.effects.push(() => this.addShieldLayer(target, {
        source: this.statusSource(unit, skill), casterId: unit.id, skillId: skill.id,
        label: skill.name, channel: mental ? '精神' : '生命', amount,
        guard: skill.guard || 0, oneHit: !!skill.oneHit,
        rageOnBreak: !!skill.rageOnBreak, until: this.now + 8000
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
    if (!mind && target.style === '辅助' && !target.firstHit &&
        this.trait(target) === 'life' && target.hp > 0) {
      target.firstHit = true;
      this.heal(target, Math.round(target.model.derived.HP * .03), '生命');
    }
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
  if(this.value(u,'qinyanForm')){q.B*=1.15;const after=R.derive(q);for(const k of ['PA','SA','DEF','MDEF'])q[k]=out[k]*after[k]/before[k];}
  return ChallengeBattle.effective(this,u,q);
}
function cost(u,s){let n=AttributeActions.methods.cost.call(this,u,s);if(this.value(u,'qinyanForm')&&s.modernEffect!=='uranus')n*=.85;return Math.max(1,Math.ceil(n));}
function castTime(u,s){let t=AttributeActions.methods.castTime.call(this,u,s);if(s.modernEffect==='qinyanSix'&&this.value(u,'qinyanForm'))t=1.3;return t*(1+this.value(u,'frostCastSlow'))/(this.value(u,'pursuit')?1.30:1);}
function actionRate(u){return BattleCore.methods.actionRate.call(this,u)*(this.value(u,'pursuit')?1.30:1);}
function targetOptions(u,action){const s=u.skills.find(x=>x.id===action);if(s?.selfOnly||s?.modernEffect&&['uranus','qinyanSpeed','qinyanSwap','iceCrown','yananGuard'].includes(s.modernEffect))return [u];return ShieldActions.methods.targetOptions.call(this,u,action);}
function actionReason(u,action){
  const s=u.skills.find(x=>x.id===action);if(s?.autoOnly)return '满足条件时自动发动';if(s?.category==='回蓝')return '该类魂技已移除';
  if(s?.modernEffect){const m=state(u),hot=m.overheat.filter(x=>x>this.now).length;
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
  if(remain<1)this.addLog(t.name+'防御前免伤：原伤'+Math.round(raw)+' → '+Math.round(reduced)+'，防御后'+n+'。',{type:'preReduction',actor:u.id,target:t.id,raw,reduced,damage:n});
  return n;
}
function tryControl(u,t,s,duration){
  if(!t||!this.alive(t))return;if(t.immuneUntil>this.now||this.value(t,'controlWard'))return;
  const key=this._effectKey||this._planKey||`${this.now}:${u.id}:${s.id}:${u.actions}`;
  if(ChallengeBattle.blockControl(this,u,t,s,key))return;
  return MemberActions.methods.tryControl.call(this,u,t,s,duration);
}
function plan(u,cast,pre){
  const s=cast.skill,t=this.unit(cast.target),key=cast.eventId||`${this.now}:${u.id}:${s?.id||cast.action}:${u.actions}`;
  if(s?.category==='控制'&&t?.guildmaster&&!(t.immuneUntil>this.now||this.value(t,'controlWard'))&&(t.guildmaster.legendaryRemaining>0||t.guildmaster.blocked.includes(key))){ChallengeBattle.blockControl(this,u,t,s,key);return {u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};}
  const previous=this._damageSpec,oldKey=this._planKey;this._damageSpec=s;this._planKey=key;
  let p;try{p=ShieldActions.methods.plan.call(this,u,cast,pre);}finally{this._damageSpec=previous;this._planKey=oldKey;}
  p._preDamage=t?.hp;
  // Custom active effects are ordinary actions; resource payment stays in command.
  if(s?.modernEffect&&['qinyanSpeed','qinyanSwap','uranus','iceCrown','yananGuard'].includes(s.modernEffect))p.effects=[];
  if(s?.modernEffect==='qinyanSpeed')p.effects.push(()=>{for(const [k,value]of [['B',.25],['A',.20]])this.setStatus(u,'statUp'+k,value,this.value(u,'qinyanForm')?8:18,{source:u.id+':speed'+k,label:'极速',from:u.name,actionsRemaining:3,fatigue:!this.value(u,'qinyanForm')});this.addLog(u.name+'极速：肉体强度提高25%、敏捷提高20%。',{type:'status',actor:u.id,target:u.id});});
  if(s?.modernEffect==='qinyanSwap')p.effects.push(()=>this.setStatus(u,'phaseSwap',1,4,{source:u.id+':swap',label:'置换保险'}));
  if(s?.modernEffect==='uranus')p.effects.push(()=>{u.sh-=Math.ceil(u.model.derived.SH*.06);this.setStatus(u,'qinyanForm',1,8,{source:u.id+':uranus',label:'乌拉诺斯'});this.setStatus(u,'mentalRecovery',1,28,{source:u.id+':recovery',label:'精神蓄养'});this.addLog(u.name+'融合极光：支付精神护持，进入8秒半能量形态；结束后需蓄养。',{type:'status',actor:u.id,target:u.id});});
  if(s?.modernEffect==='iceCrown')p.effects.push(()=>this.setStatus(u,'iceCrown',.10,10,{source:u.id+':crown',label:'冰棘王冠'}));
  if(s?.modernEffect==='yananGuard')p.effects.push(()=>this.setStatus(u,'preDR',.30,4,{source:u.id+':windGuard',label:'风铭回锋',once:true,channels:['物理','能量']}));
  if(s?.energyWard)p.effects.push(()=>this.setStatus(u,'preDR',.30,4,{source:u.id+':energyWard',label:'虚能抵消',once:true,channels:['能量'],levelLimit:u.level}));
  if(s?.attackSubtype==='pursuit'&&p.hit?.success)p.effects.push(()=>{this.setStatus(u,'pursuit',.30,8,{source:u.id+':pursuit',label:'追势'});u.readyAt=Math.min(u.readyAt,this.now+Math.round(300/1.30));this.addLog(u.name+'获得追势：下一轮整体出手速度提高30%，伤害采用敏捷强化系数。',{type:'pursuitGain',actor:u.id,target:u.id});});
  if(s?.modernEffect==='railgun')p.effects.push(()=>{if(!this.value(u,'qinyanForm')){const heat=state(u).overheat,arm=heat[0]<=this.now?0:1;heat[arm]=this.now+10000;this.addLog(u.name+(arm?'右':'左')+'臂重炮过热10秒。',{type:'overheat',actor:u.id});}});
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
  if(channel!=='精神'&&!this._periodic&&this.value(t,'phaseSwap')){t.statuses=t.statuses.filter(s=>s.type!=='phaseSwap');this.addLog(t.name+'以极光置换避开一次直接生命伤害。',{type:'phaseSwap',target:t.id});return;}
  const hp=t.hp;ShieldActions.methods.applyDamage.call(this,t,amount,channel,source,fx);
  if(t.hp<hp&&t.cast?.skill?.modernEffect==='qinyanSwap'){t.cast=null;this.endTurn(t,false);this.addLog(t.name+'的置换准备被伤害打断。',{type:'interrupt',target:t.id});}
  this.onResourceChange(t);
}
function applyDotDamage(t,d){
  if(!d.rawPerTick)return AttributeActions.methods.applyDotDamage.call(this,t,d);
  const u=this.unit(d.source);if(!u)return;
  const pre=Object.fromEntries(this.units.map(v=>[v.id,this.effective(v)]));this._periodic=true;
  const previous=this._damageSpec;this._damageSpec={fx:d.fx,damageMode:'direct'};
  try{const amount=this.damageValue(u,t,d.rawPerTick*(1+this.value(u,'dotBoost')),d.channel,pre);this.applyDamage(t,amount,d.channel,u,d.fx);this.addLog(t.name+'受到'+(d.damageNature==='poison'?'毒伤':'冻伤/残伤')+'一跳。',{type:'dotTick',actor:u.id,target:t.id,amount});}finally{this._periodic=false;this._damageSpec=previous;}
}
function onActionComplete(u,cast){
  if(!cast.eventId)cast.eventId=u.id+':'+(++state(u).sequence);
  ChallengeBattle.completed(this,u,cast);
}
function onResourceChange(u){ChallengeBattle.resourceChange(this,u);}
return {initialize,methods:{effective,cost,castTime,actionRate,targetOptions,actionReason,command,damageValue,tryControl,plan,applyDamage,applyDotDamage,onActionComplete,onResourceChange}};
})(globalThis);

const BattleProjection=(function(root){
  'use strict';
  const B=root.WitnessBattle, R=root.WitnessRules;
  const base={plan:ModernActions.methods.plan,hit:MemberActions.methods.hit,tryControl:ModernActions.methods.tryControl,applyDamage:ModernActions.methods.applyDamage,heal:BattleCore.methods.heal};
  const fields=['hp','sh','mp','petHP','bodyHP','shieldHP','shieldSH'];
  const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
  const empty=()=>Object.fromEntries(fields.map(k=>[k,0]));
  const totals=u=>Object.fromEntries(fields.map(k=>[k,Number(u?.[k])||0]));
  const difference=(a,b)=>Object.fromEntries(fields.map(k=>[k,(a[k]||0)-(b[k]||0)]));
  const add=(a,b,w=1)=>{for(const k of fields)a[k]+=(b[k]||0)*w;return a;};
  const threshold=n=>Math.max(0,Math.min(100,Math.round(n)));
  const isAttack=s=>!s||s.category==='攻击'||s.category==='持续伤害'||s.damageMode==='periodic';
  const periodic=s=>!!s&&(s.category==='持续伤害'||s.damageMode==='periodic');
  const channel=(u,s)=>s?.channel||(u.soul.spirit_specialist?'精神':'物理');

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
    out.events=[];out.log=[];out.seed='public-projection';out._valuingAI=false;
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
    const effectiveCache=new WeakMap(),effective=ModernActions.methods.effective;
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
        for(const s of u.statuses)if(s.until<=b.now&&s.fatigue)b.setStatus(u,'fatigue',.1,6,{source:s.source,label:(s.label||'强化')+'后疲劳',from:s.from});
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
  const statusSignature=u=>JSON.stringify([u.statuses,u.shieldLayers,u.shieldHP,u.shieldSH,u.guard,u.oneHit,u.immuneUntil,u.phantoms,u.phantomSwapped,u.petAlive,u.rage,u.rageTotal,u.mp,u.bonusAttack,u.guildmaster,u.modern]);
  function directionSignature(b,u,offense){
    const e=b.effective(u),excluded=offense?new Set(['evasion','iceArmor','soulArmor','phantomSwapReady','statUpD','statDownD']):new Set(['coldAura','dotBoost','damageDown','accuracyDown','phantomPierce','bloodFirstStrike','buff','slow','costUp','statUpB','statDownB','statUpS','statDownS','statUpC','statDownC']);
    const statuses=u.statuses.filter(s=>!excluded.has(s.type));
    return JSON.stringify(offense?[e.PA,e.SA,e.MA,e.A,e.C,e.P,e.costReduction,e.castReduction,statuses,u.mp,u.rage,u.rageTotal,u.bonusAttack,u.cast,u.petAlive]:[e.DEF,e.MDEF,e.A,e.P,statuses,u.hp,u.sh,u.mp,u.shieldLayers,u.shieldHP,u.shieldSH,u.guard,u.oneHit,u.immuneUntil,u.phantoms,u.phantomSwapped,u.petAlive,u.petHP,u.bodyHP]);
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
    const a=b.effective(u),ch=s?.channel||(u.soul.spirit_specialist?'精神':'物理');
    const power=s?.mindPower?a.MA:ch==='精神'?a.MA:ch==='物理'?a.PA:a.SA+(s?.poisonScaling||0)*a.MA;
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

// The single public Battle API. Helpers retain lexical state without prototype patches.
(function(root){
  const methods={
    onActionComplete:ModernActions.methods.onActionComplete,
    onResourceChange:ModernActions.methods.onResourceChange,
    initializeModern:ModernActions.initialize,
    aiScore:UnifiedDecision.methods.aiScore,
    aiCandidates:UnifiedDecision.methods.aiCandidates,
    forecastExistingDOT:BattleProjection.methods.forecastExistingDOT,
    forecastFutureDOT:BattleProjection.methods.forecastFutureDOT,
    forecastAdvance:BattleProjection.methods.forecastAdvance,
    forecastAction:BattleProjection.methods.forecastAction,
    forkProjectionState:BattleProjection.methods.forkProjectionState,
    dispelShieldLayers:ShieldActions.methods.dispelShieldLayers,
    previewProtection:ShieldActions.methods.previewProtection,
    previewShieldDamage:ShieldActions.methods.previewShieldDamage,
    addShieldLayer:ShieldActions.methods.addShieldLayer,
    expireShields:ShieldActions.methods.expireShields,
    shieldLayersFor:ShieldActions.methods.shieldLayersFor,
    snapshot:AttributeActions.methods.snapshot,
    unit:BattleCore.methods.unit,
    alive:BattleCore.methods.alive,
    status:BattleCore.methods.status,
    value:StatusActions.methods.value,
    effective:ModernActions.methods.effective,
    trait:BattleCore.methods.trait,
    basicCost:BattleCore.methods.basicCost,
    refreshExhaustion:BattleCore.methods.refreshExhaustion,
    cost:ModernActions.methods.cost,
    castTime:ModernActions.methods.castTime,
    targetOptions:ModernActions.methods.targetOptions,
    canAct:BattleCore.methods.canAct,
    actionRate:ModernActions.methods.actionRate,
    advanceGauge:BattleCore.methods.advanceGauge,
    selectActor:BattleCore.methods.selectActor,
    endTurn:BattleCore.methods.endTurn,
    cooldownKey:BattleCore.methods.cooldownKey,
    cooldownUntil:BattleCore.methods.cooldownUntil,
    actionReason:ModernActions.methods.actionReason,
    command:ModernActions.methods.command,
    addLog:BattleCore.methods.addLog,
    setStatus:AttributeActions.methods.setStatus,
    setBuff:StatusActions.methods.setBuff,
    hit:MemberActions.methods.hit,
    damageValue:ModernActions.methods.damageValue,
    plan:ModernActions.methods.plan,
    tryControl:ModernActions.methods.tryControl,
    applyDamage:ModernActions.methods.applyDamage,
    heal:BattleCore.methods.heal,
    scheduleAI:BattleCore.methods.scheduleAI,
    aiChoice:UnifiedDecision.methods.aiChoice,
    nextTime:BattleCore.methods.nextTime,
    tick:BattleCore.methods.tick,
    hasOffense:BattleCore.methods.hasOffense,
    resolveDraw:BattleCore.methods.resolveDraw,
    checkResult:BattleCore.methods.checkResult,
    finishByTime:BattleCore.methods.finishByTime,
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
    darkActionScore:UnifiedDecision.methods.darkActionScore,
    dodgeCost:AttributeActions.methods.dodgeCost,
    dotNature:AttributeActions.methods.dotNature,
    dotLabel:AttributeActions.methods.dotLabel,
    applyDotDamage:ModernActions.methods.applyDotDamage,
    gainRage:MemberActions.methods.gainRage
  };
  Object.defineProperties(root.WitnessBattle.Battle.prototype,Object.fromEntries(Object.entries(methods).map(([key,value])=>[key,{value,writable:true,configurable:true}])));
  root.WitnessRules.makeSkill=AttributeActions.methods.makeSkill;
})(globalThis);

})();

  // END V13 PLAYER ENGINE
  host.WitnessBattle=globalThis.WitnessBattle;
  host.WitnessTemplates=globalThis.WitnessTemplates;
  host.WitnessV13Rules=globalThis.WitnessRules;
  host.WitnessControlV9=globalThis.WitnessControlV9;
  host.WitnessStackRules=globalThis.WitnessStackRules;
  host.WitnessTacticsV10=globalThis.WitnessTacticsV10;
  host.WitnessMechanicsV14=globalThis.WitnessMechanicsV14;
  host.WitnessProjectionV14=globalThis.WitnessProjectionV14;
  host.WitnessAIV14=globalThis.WitnessAIV14;
})(window);
