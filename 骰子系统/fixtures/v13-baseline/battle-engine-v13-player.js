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


(function(root){
  const templates=[
    {id:'qinyan',name:'秦衍',weapon:'极光',tier:7,style:'强攻',kind:'特殊',subkind:'元素',attribute:'雷',portrait:'秦衍',trait:'thunder',source:'秦衍最终版 2017年3769楼',note:'保留雷光、极速、雷矢和晶化；本场按玩家等级压制，数值与时长为试玩改编。',skills:[
      {name:'雷光',category:'攻击',channel:'能量',fx:'lightning',factor:.85,slow:.10,duration:2,description:'电流攻击，并使目标读条速度降低10%，持续2秒。'},
      {name:'极速',category:'强化',fx:'lightning',buff:.22,agility:.15,duration:7,description:'提升攻击与敏捷，持续7秒。'},
      {name:'雷化·雷矢',category:'攻击',channel:'能量',fx:'lightning',factor:1.25,castExtra:.8,cd:9,description:'较长读条的高威力雷矢。'},
      {name:'晶化',category:'防御',fx:'crystal',description:'塑成晶化屏障，保护生命通道。'}]},
    {id:'xiaowen',name:'晓雯',weapon:'红拂尘刃',tier:5,style:'敏攻',kind:'器',subkind:'战斗',attribute:'无属性·斩切',portrait:'晓雯',trait:'pierce',source:'晓雯 2017年17楼',note:'锐与身体增幅保留；尘镜仍是一次性护盾，虹影改为有精神力对抗的牵制。',skills:[
      {name:'尘刃·锐',category:'强化',fx:'slash',buff:.26,duration:8,description:'刃缘锋锐，攻击值提高26%，持续8秒。'},
      {name:'尘刃·体振',category:'强化',fx:'slash',buff:.15,agility:.24,duration:7,description:'身体增幅，攻击提高15%、敏捷提高24%。'},
      {name:'尘刃·尘镜',category:'防御',fx:'crystal',oneHit:true,description:'一次性护盾，接住一次攻击后无论余量都消散。'},
      {name:'拂刃·虹影',category:'控制',fx:'ribbon',baseControl:1.6,description:'暗红魂力牵制，打断读条；持续时间受到双方精神力影响。'}]},
    {id:'yixing',name:'李一行',weapon:'霸王绝刀',tier:7,style:'强攻',kind:'器',subkind:'战斗',attribute:'无属性·力量',portrait:'李一行',trait:'heavy',source:'李一行 2016年23992楼',note:'保留命中积攒霸气、玄罡一次格挡与消耗霸气；霸气最多5层，霸刀斩每战最多3次。',skills:[
      {name:'苍龙破',category:'攻击',channel:'物理',fx:'slash',rageGain:1,factor:.95,description:'刀气命中积攒1层霸气。'},
      {name:'怒风旋',category:'攻击',channel:'物理',fx:'wind',rageGain:1,factor:.85,castExtra:-.25,description:'短读条刀风，命中积攒1层霸气。'},
      {name:'玄重罡',category:'防御',fx:'crystal',guard:.7,oneHit:true,rageOnBreak:true,description:'下一次生命伤害降低70%，消散时积攒1层霸气。'},
      {name:'霸刀斩',category:'攻击',channel:'物理',fx:'slash',rageSpend:true,maxUses:3,factor:1.10,controlOnHit:.5,cd:12,description:'消耗最多3层霸气提高伤害；3层时追加短眩晕。最多使用3次。'}]},
    {id:'anmu',name:'暗牧',weapon:'噬魂毒蝎',tier:6,style:'控制',kind:'兽',subkind:'虫',attribute:'毒',portrait:'暗牧',trait:'poison',source:'当前登记 用户补充的五类毒素；演绎2017年1883楼',note:'采用当前补充的麻痹、腐蚀、激化、亢奋、引发毒素；不使用旧片段中的冲突毒素分类。',skills:[
      {name:'麻痹毒素',category:'控制',fx:'poison',baseControl:1.6,description:'麻痹牵制，控制成功后打断读条。'},
      {name:'腐蚀毒素',category:'持续伤害',channel:'能量',fx:'poison',factor:.80,corrode:.12,description:'三跳毒伤，并降低12%防御，持续6秒。'},
      {name:'激化毒素',category:'强化',fx:'poison',dotBuff:.30,duration:8,description:'持续毒伤提高30%，持续8秒。'},
      {name:'亢奋毒素',category:'强化',fx:'poison',buff:.15,agility:.18,duration:6,description:'攻击与敏捷增幅，持续6秒。'},
      {name:'引发毒素',category:'攻击',channel:'能量',fx:'poison',detonate:true,factor:.55,cd:10,description:'引爆该目标身上自己尚未结算的毒伤，消耗对应毒状态。'}]},
    {id:'hash',name:'哈什',weapon:'晦光铭符',tier:6,style:'控制',kind:'本体',subkind:'皮肤',attribute:'无属性·幻象',portrait:null,trait:'ghost',source:'当前登记 哈什用户补充完整原文',note:'虚像没有攻击能力；隐匿不再无限不可命中，能量爆裂转为削盾与短控制。资料目录未找到哈什立绘，使用符文标记。',skills:[
      {name:'虚像投影',category:'强化',fx:'ghost',evasion:.15,duration:8,costPercent:.10,description:'无攻击投影降低受到的攻击命中率15个百分点，持续8秒。'},
      {name:'虚空匿行',category:'强化',fx:'ghost',evasion:.25,duration:4,costPercent:.20,castFixed:.75,cd:11,description:'隐匿降低受到的攻击命中率25个百分点，持续4秒；消耗20%最大MP。'},
      {name:'虚能爆裂',category:'控制',fx:'wave',baseControl:1,dispel:.60,costPercent:.10,description:'削去目标60%的当前生命护盾，控制成功时打断未完成读条。'}]},
    {id:'yixiaobei',name:'伊筱蓓',weapon:'花露',tier:5,style:'辅助',kind:'器',subkind:'辅助植物',attribute:'复合·木/毒',portrait:'伊筱蓓',trait:'frugal',support:true,source:'伊筱蓓 2016年6043楼',note:'改编为花露支援：曼陀罗施毒、玫瑰牵制、罂粟短时增幅。未添加原表没有的生命治疗；增幅后有短时疲劳。',skills:[
      {name:'曼陀罗花露',category:'持续伤害',channel:'能量',fx:'poison',factor:.90,description:'向敌方施加三跳毒伤。'},
      {name:'玫瑰花露',category:'控制',fx:'petal',baseControl:1.5,description:'魅惑牵制，成功率与持续时间受精神力对抗影响。'},
      {name:'罂粟花露',category:'强化',fx:'petal',buff:.20,agility:.15,duration:8,fatigue:true,description:'队友攻击提高20%、敏捷提高15%，持续8秒；结束后6秒输出降低10%。'}]}
  ];
  if(typeof module!=='undefined'&&module.exports)module.exports=templates;else root.WitnessTemplates=templates;
})(typeof globalThis==='undefined'?this:globalThis);

(function(root){
  const extra=[
    {id:'xiaweiyu',name:'夏维宇',weapon:'血君',tier:8,style:'敏攻',kind:'兽',subkind:'超自然兽',attribute:'复合·血/暗',portrait:'夏维宇',trait:'swift',registeredLevel:74,source:'登记文件·搬运帖17楼',note:'血噬的生命反哺按新版规则移除，保留魂力反哺与减速；第七魂技原表未完成，不补写。',skills:[
      {name:'血涌',category:'强化',buff:.25,agility:.25,duration:12,fx:'blood',description:'血流加速，攻击与敏捷提高25%。'},
      {name:'血噬',category:'攻击',channel:'物理',factor:.8,slow:.20,duration:7,manaDrain:.06,manaReturn:.04,fx:'blood',description:'击伤后汲取少量魂力，目标减速20%；不回复生命。'},
      {name:'血烟',category:'强化',evasion:.18,agility:.18,controlWard:true,duration:7,fx:'blood',description:'位移避让，获得闪避增幅与5秒免控。'},
      {name:'血蝠',category:'持续伤害',channel:'物理',factor:1.05,fx:'blood',description:'蝠群连续撕咬，三跳持续伤害。'},
      {name:'血锢',category:'控制',baseControl:1.4,fx:'blood',description:'血印禁锢，精神对抗后打断行动。'},
      {name:'血夜',category:'减益',slow:.25,costUp:.15,duration:10,fx:'blood',description:'血夜领域压低敌方防御与行动速度，提高其消耗。'}]},
    {id:'quan',name:'瑔',weapon:'冥邪剑',tier:7,style:'强攻',kind:'器',subkind:'战斗',attribute:'暗',portrait:'瑔',trait:'pierce',registeredLevel:53,source:'登记文件·搬运帖18楼',note:'原表仅三项魂技。半生浮屠的恢复体力改为力量与敏捷增幅；七式剑法合并成连续剑击。',skills:[
      {name:'冥邪斩',category:'攻击',channel:'物理',factor:1,fx:'dark',description:'暗属性斩击。'},
      {name:'半生浮屠',category:'强化',buff:.18,agility:.10,duration:10,fx:'dark',description:'提高攻击18%、敏捷10%，不回复生命。'},
      {name:'冥邪剑法·七式',category:'持续伤害',channel:'物理',factor:1.15,fx:'dark',description:'七式连剑改编为三次延迟剑伤。'}]},
    {id:'minghuan',name:'明缓',weapon:'风龙枪',tier:6,style:'强攻',kind:'器',subkind:'战斗',attribute:'风',portrait:'明缓',trait:'pierce',registeredLevel:40,source:'登记文件·搬运帖14楼',note:'采用当前登记“风龙枪”，原表写“凤龙枪”。原表三技，测试修为至少41级，不虚构第四魂技。',skills:[
      {name:'风炮',category:'攻击',channel:'能量',factor:1,fx:'wind',description:'凝聚风元素的炮击。'},
      {name:'风罩',category:'防御',oneHit:true,fx:'wind',description:'局部风罩，抵挡一次攻击后消散。'},
      {name:'凤龙诀',category:'攻击',channel:'能量',factor:1.2,castExtra:.4,fx:'wind',description:'图腾风箭齐射，增加准备时间与伤害。'}]},
    {id:'linluoying',name:'林洛樱',weapon:'夹竹桃',tier:6,style:'控制',kind:'器',subkind:'辅助植物',attribute:'复合·木/毒',portrait:'林洛樱',trait:'poison',registeredLevel:50,source:'登记文件·搬运帖10楼',note:'保留原表姓名；原表未命名的技能以下用游戏名称表示。第三技选用20%增幅。',skills:[
      {name:'毒瓣飞刃〔游戏名〕',category:'持续伤害',channel:'能量',factor:1,corrode:.10,fx:'petal',description:'锋锐毒瓣造成持续毒伤并轻度削防。'},
      {name:'重力花场〔游戏名〕',category:'减益',slow:.25,costUp:.20,duration:9,fx:'petal',description:'重力压制，行动速度下降、魂技消耗提高20%。'},
      {name:'花息增幅〔游戏名〕',category:'强化',buff:.20,agility:.20,duration:10,fx:'petal',description:'攻击与敏捷提高20%。'},
      {name:'夹竹桃缚〔游戏名〕',category:'控制',baseControl:2,fx:'petal',description:'脚下花瓣合拢，精神对抗后控制目标。'}]},
    {id:'qingling',name:'清凌',weapon:'骷髅鬼剑',tier:8,style:'强攻',kind:'器',subkind:'战斗',attribute:'复合·光/暗',portrait:'清凌',trait:'pierce',registeredLevel:72,source:'登记文件·搬运帖11楼',note:'原表只列五技，第六、第七技不补写。残留损伤与吸取魂力采用有限数值。',skills:[
      {name:'鬼之领域',category:'减益',slow:.10,duration:10,fx:'dark',description:'领域削防并压低目标行动速度。'},
      {name:'死神沾染',category:'强化',buff:.18,manaRestore:.04,duration:10,fx:'dark',description:'提高攻击18%，释放时回复4%魂力。'},
      {name:'大千剑阵',category:'攻击',channel:'物理',factor:1.1,fx:'slash',description:'剑阵集中打击，数量整合为一次结算。'},
      {name:'绝望审判',category:'持续伤害',channel:'能量',factor:1.25,corrode:.12,fx:'dark',description:'生亡碾压留下持续侵蚀。'},
      {name:'凤舞六幻',category:'强化',buff:.22,agility:.30,evasion:.10,duration:10,fx:'ghost',description:'幻身强化攻击与敏捷，提供有限闪避。'}]},
    {id:'yanan',name:'莫言安',weapon:'逸仙剑',tier:7,style:'强攻',kind:'器',subkind:'战斗',attribute:'光',portrait:'莫言安',trait:'focus',provisional:true,source:'登记文件·用户补充：加持与光炮剑气',note:'缺完整魂技表。以下名称和数值均为游戏原创改编，仅按现有战斗核心设计。',skills:[
      {name:'剑气〔游戏原创〕',category:'攻击',channel:'能量',factor:.9,fx:'light',description:'凝聚光属性剑气。'},
      {name:'剑身加持〔游戏原创〕',category:'强化',buff:.22,duration:10,fx:'light',description:'加持逸仙剑，攻击提高22%。'},
      {name:'聚光〔游戏原创〕',category:'强化',buff:.30,duration:7,fx:'light',description:'蓄积光能，短时提高输出。'},
      {name:'逸仙光炮〔游戏原创〕',category:'攻击',channel:'能量',factor:1.25,castExtra:.7,fx:'light',description:'长读条的光炮状剑气。'}]},
    {id:'xuejidong',name:'雪寂冬',weapon:'银岭冰刃龙',tier:8,style:'防御',kind:'兽',subkind:'爬行',attribute:'冰',portrait:'雪寂冬',trait:'ice',provisional:true,source:'登记文件·用户补充武魂名称',note:'缺魂技原文；以下技能全部是以冰刃龙为依据的游戏原创改编。',skills:[
      {name:'冰刃吐息〔游戏原创〕',category:'攻击',channel:'能量',factor:1,slow:.15,duration:6,fx:'ice',description:'冰刃吐息与短时减速。'},
      {name:'银岭龙鳞〔游戏原创〕',category:'防御',fx:'ice',description:'龙鳞护盾，受新版盾量上限约束。'},
      {name:'霜牙〔游戏原创〕',category:'持续伤害',channel:'物理',factor:.95,fx:'ice',description:'霜牙裂伤，三次延迟伤害。'},
      {name:'冰岭禁足〔游戏原创〕',category:'控制',baseControl:2,fx:'ice',description:'寒冰禁足，依精神对抗决定控制效果。'}]},
    {id:'yiqiran',name:'伊其然',weapon:'魔导书',tier:6,style:'辅助',kind:'器',subkind:'辅助',attribute:'无属性·魂力塑形',portrait:'伊其然',trait:'focus',support:true,registeredLevel:41,source:'登记文件·搬运帖8楼，41级上限版',note:'采用本次登记文件重新收录的41级版本；不推定更晚设定，也不添加原表不存在的治疗。',skills:[
      {name:'魂力之手',category:'控制',baseControl:1.2,fx:'wave',description:'魂力波动推拉，成功后打断行动。'},
      {name:'魂力护甲',category:'防御',fx:'crystal',description:'魂力薄膜防护，受盾量上限约束。'},
      {name:'魂力飞弹',category:'攻击',channel:'能量',factor:.95,fx:'wave',description:'多枚飞弹合并结算。'},
      {name:'羽落术',category:'强化',evasion:.12,duration:9,fx:'wind',description:'减缓坠落改编为位移避让，降低受到攻击的命中率。'}]}
  ];
  const known=typeof module!=='undefined'&&module.exports?require('./templates.js'):root.WitnessTemplates;
  for(const t of extra)if(!known.some(x=>x.id===t.id))known.push(t);
  known.find(t=>t.id==='anmu').skills[1].factor=1.25;
  known.find(t=>t.id==='anmu').skills[1].description='强化腐蚀：三跳毒伤，降低12%防御，激化可增幅正在生效的毒伤。';
  known.find(t=>t.id==='anmu').skills[2].dotBuff=.45;
  known.find(t=>t.id==='anmu').skills[2].description='持续毒伤提高45%，持续10秒；同时增强当前已施加毒素。';
  known.find(t=>t.id==='anmu').skills[2].duration=10;

  // Equal potential; differences now come from style, form and skills.
  for(const t of known){t.originalTier=t.tier;t.tier=7;}
  const hash=known.find(t=>t.id==='hash');
  hash.note='本轮实验重构：投影不直接攻击；隐匿为爆发，铭符提供主动反击。';
  hash.skills=[
    {name:'虚像投影',category:'强化',channel:'能量',evasion:.15,costPercent:.08,fx:'ghost',description:'无攻击幻像扰乱瞄准，闪避提高15个百分点，持续整场。'},
    {name:'虚空匿行',category:'强化',channel:'能量',evasion:.30,buff:.18,burstActions:2,costPercent:.12,castFixed:.75,cd:14,fx:'ghost',description:'爆发隐匿：闪避提高30个百分点、攻击提高18%，持续自己2个动作。'},
    {name:'虚能爆裂',category:'控制',channel:'能量',baseControl:1.6,dispel:.60,chipFactor:.35,costPercent:.10,cd:12,castFixed:.65,fx:'wave',description:'铭符爆裂造成能量伤害，削去60%生命盾，并尝试控制及打断。'},
    {name:'虚实刻印〔实验新增〕',category:'攻击',channel:'能量',mindPower:true,factor:2.2,cd:8,fx:'ghost',description:'以精神力驱动实体铭符，造成能量伤害；不赋予投影攻击能力。'}
  ];
  const bursts={'血烟':3,'亢奋毒素':3,'罂粟花露':3,'聚光〔游戏原创〕':2,'凤舞六幻':3};
  for(const t of known)for(const s of t.skills){
    if(s.category!=='强化')continue;
    s.burstActions=s.burstActions||bursts[s.name]||0;
    s.buffMode=s.burstActions?'actions':'battle';
    s.description=(s.description||'').replace(/持续\d+秒/g,s.burstActions?'持续自己'+s.burstActions+'个动作':'持续整场');
    if(s.controlWard)s.description=s.description.replace('5秒免控','效果存续期间免控');
    if(s.buffMode==='battle'&&!s.description.includes('持续整场'))s.description+=' 持续整场。';
  }

  const sword=known.find(t=>t.id==='quan');
  sword.skills[0].factor=.95;sword.skills[0].budgetFactor=1;
  sword.skills[2].factor=.90;sword.skills[2].budgetFactor=1.15;
  sword.note+=' 本轮数值校准：普通斩击系数0.95、七式总伤系数0.90，技能费用不随此次降伤同步打折。';
  for(const t of known)for(const s of t.skills){
    if(s.manaReturn)s.description+=' 吸魂反哺每战至多2次，每次最多2%最大魂力。';
    if(s.manaRestore)s.description=s.description.replace('4%魂力','2%魂力');
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=known;
})(typeof globalThis==='undefined'?this:globalThis);

(function(root){
  const known=typeof module!=='undefined'&&module.exports?require('./extra-templates.js'):root.WitnessTemplates;
  const get=id=>known.find(t=>t.id===id);
  const sword=get('yanan');
  Object.assign(sword,{attribute:'风',registeredLevel:59,provisional:false,source:'D:/QQ/【人设】.md',note:'采用断空、回风叠絮、逸仙剑体、不尘；裂穹暂时移除。防护按实际承受伤害扣魂力。'});
  sword.skills=[
    {name:'断空',category:'攻击',channel:'能量',factor:1,penetration:.25,castExtra:-.2,fx:'wind',description:'凝聚剑尖风刃斩出或突刺，穿透25%常规防御。'},
    {name:'回风叠絮',category:'持续伤害',channel:'能量',factor:1.15,fx:'wind',description:'共鸣风卷夹杂细小风刃，连续剑击叠加为三次延迟风刃伤害。'},
    {name:'逸仙剑体',category:'强化',buff:.12,soulArmor:.3,fx:'wind',description:'铭文浮现，攻击提高12%；抵御生命攻击时消耗魂力，每抵挡1点伤害消耗0.3点魂力，至多抵挡该次伤害30%。持续整场，可主动关闭防护。'},
    {name:'不尘',category:'减益',slow:.18,costUp:0,duration:9,fieldEvasion:.12,fx:'wind',description:'张开无尘领域，近身斥退和飞行道具阻力改编为9秒减速18%，自身感知获得12个百分点闪避，持续9秒；范围与距离在当前斗魂模型中不单独计算。'}
  ];
  const an=get('anmu');
  an.skills=[an.skills[0],an.skills[1],{...an.skills[2],agility:.12,description:'激化现有与后续毒伤45%，并使自身敏捷提高12%，持续整场。'},an.skills[4]];
  an.note='四技：麻痹、腐蚀、激化、引发；亢奋作为独立魂技暂时移除，轻度敏捷效果并入激化。保留毒素激化与引爆循环。';
  const lin=get('linluoying');
  lin.note='夹竹桃的毒瓣、重力花场、自身增幅与花缚；毒伤、牵制和增幅保持植物控制特色。';
  const quan=get('quan');
  quan.skills.push({...quan.skills[2],name:'冥邪剑法·终式',category:'攻击',factor:.95,budgetFactor:1.15,description:'从七式剑法拆出最后一式，凝聚暗属性剑锋作收束斩击。'});
  quan.note='四技编排将已有七式剑法分为连剑与终式；半生浮屠保留攻击和敏捷增幅，不回复生命。';
  const ming=get('minghuan');
  ming.skills.push({...ming.skills[2],name:'凤龙诀·风箭',factor:.9,castExtra:0,description:'从凤龙诀图腾风箭齐射拆出短读条风箭。'});
  ming.note='四技编排将已有凤龙诀分为齐射与短读条风箭。';
  const yi=get('yixiaobei');
  yi.skills.push({...yi.skills[1],name:'玫瑰花露·缠枝',category:'减益',slow:.18,duration:8,description:'将玫瑰牵制拆出缠枝，短时削防并减速18%。'});
  yi.note='四技编排将已有玫瑰牵制拆为魅惑与缠枝，保留花露施毒和短时增幅。';
  for(const t of known){
    t.skills=t.skills.slice(0,4);
    for(const s of t.skills)s.name=s.name.replace(/〔(?:游戏名|游戏原创|实验新增)〕/g,'');
  }

  for(const t of known)for(const s of t.skills){
    if(t.id==='linluoying'&&s.name==='重力花场'){Object.assign(s,{category:'持续伤害',channel:'能量',factor:1.0,slow:.25,costUp:.2,duration:9,description:'夹竹桃毒压随重力花场持续侵蚀，三跳毒伤；目标减速25%、魂技消耗提高20%，持续9秒。'});}
    if(t.style==='控制'&&['攻击','持续伤害'].includes(s.category)&&t.trait==='poison'){s.poisonScaling=t.id==='linluoying'?0.85:0.35;s.description+=' 精神力转化为毒效，额外采用'+Math.round(s.poisonScaling*100)+'%精神攻击值，仍结算生命通道。';}
    if(s.category==='控制'){s.castMultiplier=1.0;s.costMultiplier=1.0;}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=known;
})(typeof globalThis==='undefined'?this:globalThis);

(function(root){
  const known=typeof module!=='undefined'&&module.exports?require('./四技平衡模板.js'):root.WitnessTemplates;
  const snow=known.find(t=>t.id==='xuejidong');
  Object.assign(snow,{name:'雪寂冬',weapon:'银岭冰刃龙',style:'强攻',kind:'兽',subkind:'爬行',attribute:'冰',trait:'ice',registeredLevel:97,age:47,gender:'男',nationality:'星罗',provisional:false,source:'用户提供的雪寂冬正式人设与魂技原文',note:'97级、冰属性龙类兽武魂，附体强攻，擅长近身格斗。采用正式前四技，其余魂技与魂骨仅存档；对照模拟仍按双方相同测试等级。'});
  snow.skills=[
    {name:'寒龙之身',category:'强化',buff:0,coldOnHit:.18,fx:'ice',description:'身周冰雾持续整场，每次命中的攻击附带低温能量伤害；不额外创造攻击动作。'},
    {name:'寒影奔袭',category:'攻击',channel:'物理',factor:.65,secondaryFactor:.35,secondaryChannel:'物理',budgetFactor:1,slow:.15,duration:3,controlOnHit:.8,controlAlways:true,castExtra:-.2,fx:'ice',description:'直线奔袭撞击与翼刃割裂分两段结算，附带3秒15%减速，命中后尝试短眩晕；受精神判定与全局免控限制。'},
    {name:'银翼刃锋',category:'强化',buff:.18,agility:.20,evasion:.06,fx:'ice',description:'强化翼刃锋锐与操控，攻击提高18%、敏捷提高20%、闪避提高6个百分点，持续整场；飞行优势在无距离模型中转为敏捷与闪避。'},
    {name:'冰极之怒',category:'攻击',channel:'能量',factor:.85,secondaryFactor:.35,secondaryChannel:'能量',budgetFactor:1.2,penetration:.15,castExtra:.3,fx:'ice',description:'掌心寒气命中后爆开并侵入体内再次爆炸，两段冰属性伤害；主段穿透15%常规防御。按近身切磋数值建模，尚不单独计算距离。'}
  ];
  if(typeof module!=='undefined'&&module.exports)module.exports=known;
})(typeof globalThis==='undefined'?this:globalThis);

(function(root){
const known=typeof module!=='undefined'&&module.exports?require('./正版雪寂冬.js'):root.WitnessTemplates;
function apply(B,config){
  const get=id=>B.templates.find(t=>t.id===id);
  if(config.xiao){
    const t=get('xiaowen'),old=t.skills[0];t.skills[0]={name:'尘刃·锐',category:'攻击',channel:'物理',factor:config.xiao,penetration:.2,castFixed:.8,cd:6,fx:'slash',description:'锋锐斩击，穿透20%常规防御，短读条，可重复的付费物理攻击。'};
    if(config.ribbon)Object.assign(t.skills[3],{category:'攻击',channel:'物理',factor:config.ribbon,baseControl:undefined,controlOnHit:.8,controlAlways:true,cd:10,castFixed:.9,description:'虹影拂刃击，暗红魂力随斩击牵制；命中后尝试短控制，仍受全局免控限制。'});
    t.note='保留锋锐斩切、体振、一次性尘镜与虹影牵制，补足主动付费输出，仍为四技。';
  }
  for(const [id,scale]of [['quan',config.quan],['qingling',config.qing],['xuejidong',config.snow]]){
    if(!scale)continue;
    for(const s of get(id).skills){
      if(['攻击','持续伤害'].includes(s.category)){s.budgetFactor??=s.factor??1;s.factor=(s.factor??1)*scale;if(s.secondaryFactor)s.secondaryFactor*=scale;}
      if(id==='xuejidong'&&s.coldOnHit){s.budgetColdOnHit??=s.coldOnHit;s.coldOnHit*=scale;}
    }
  }
  const yan=get('yanan');
  if(config.yanArmorOff)yan.skills[2].soulArmor=0;
  if(config.yanDomainOff)yan.skills[3].aiDisabled=true;
  if(config.yanReverse)yan.skills=[yan.skills[2],yan.skills[3],yan.skills[0],yan.skills[1]];
  if(config.yanEfficient){Object.assign(yan.skills[0],{factor:1.4,budgetFactor:1,castFixed:.75,cd:6});Object.assign(yan.skills[1],{factor:1.45,budgetFactor:1.15});}
}
apply({templates:known},{"id": "final-15", "xiao": 1.5, "quan": 0.9, "snow": 0.85, "qing": 0.8, "domainAI": true});
if(typeof module!=='undefined'&&module.exports)module.exports=known;
})(typeof globalThis==='undefined'?this:globalThis);

// BEGIN V13 EXAMINER DATA
(function(root){
const data={
  "qinyan": [
    {
      "name": "雷光",
      "category": "攻击",
      "channel": "能量",
      "fx": "lightning",
      "factor": 0.85,
      "slow": 0.1,
      "duration": 2,
      "description": "电流攻击，并使目标读条速度降低10%，持续2秒。"
    },
    {
      "name": "极速",
      "category": "强化",
      "fx": "lightning",
      "buff": 0.22,
      "agility": 0.15,
      "duration": 7,
      "description": "提升攻击与敏捷，持续整场。",
      "burstActions": 0,
      "buffMode": "battle"
    },
    {
      "name": "雷化·雷矢",
      "category": "攻击",
      "channel": "能量",
      "fx": "lightning",
      "factor": 1.25,
      "castExtra": 0.8,
      "cd": 9,
      "description": "较长读条的高威力雷矢。"
    },
    {
      "name": "晶化",
      "category": "防御",
      "fx": "crystal",
      "description": "塑成晶化屏障，保护生命通道。"
    },
    {
      "name": "雷矢·并爆",
      "category": "攻击",
      "factor": 1.35,
      "channel": "能量",
      "cd": 12,
      "castExtra": 0.5,
      "description": "多枚雷矢并爆，造成雷属性伤害；需要较长准备。"
    },
    {
      "name": "晶棱雷阵",
      "category": "减益",
      "effects": [
        {
          "key": "D",
          "value": 0.18
        },
        {
          "key": "A",
          "value": 0.12
        }
      ],
      "effectSeed": "proposal-晶棱雷阵",
      "description": "晶棱导引雷流，防御素质降低18%、敏捷降低12%；一次精神判定，持续整场。"
    }
  ],
  "xiaowen": [
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
  "yixing": [
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
  "anmu": [
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
      "description": "强化腐蚀：三跳毒伤，降低12%防御，激化可增幅正在生效的毒伤。 精神力转化为毒效，额外采用35%精神攻击值，仍结算生命通道。",
      "poisonScaling": 0.35
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
  "hash": [
    {
      "name": "虚像投影",
      "category": "强化",
      "channel": "能量",
      "evasion": 0.15,
      "costPercent": 0.08,
      "fx": "ghost",
      "description": "无攻击幻像扰乱瞄准，闪避提高15个百分点，持续整场。",
      "burstActions": 0,
      "buffMode": "battle"
    },
    {
      "name": "虚空匿行",
      "category": "强化",
      "channel": "能量",
      "evasion": 0.3,
      "buff": 0.18,
      "burstActions": 2,
      "costPercent": 0.12,
      "castFixed": 0.75,
      "cd": 14,
      "fx": "ghost",
      "description": "爆发隐匿：闪避提高30个百分点、攻击提高18%，持续自己2个动作。",
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
      "description": "铭符爆裂造成能量伤害，削去60%生命盾，并尝试控制及打断。",
      "castMultiplier": 1,
      "costMultiplier": 1
    },
    {
      "name": "虚实刻印",
      "category": "攻击",
      "channel": "能量",
      "mindPower": true,
      "factor": 2.2,
      "cd": 8,
      "fx": "ghost",
      "description": "以精神力驱动实体铭符，造成能量伤害；不赋予投影攻击能力。"
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
  "yixiaobei": [
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
  "xiaweiyu": [
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
  "quan": [
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
  "minghuan": [
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
  "linluoying": [
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
  "qingling": [
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
  "yanan": [
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
      "costPercent": 0.12,
      "cd": 14,
      "fx": "wind",
      "description": "回收外放风压形成生命护盾，持续8秒，须额外支付魂力。"
    }
  ],
  "xuejidong": [
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
  "yiqiran": [
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
  ]
};
for(const t of root.WitnessTemplates){t.skills=data[t.id];t.note='六招式考核库，按实际环数开放，最多六技。';}
})(globalThis);
// END V13 EXAMINER DATA

(function(root){
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
    const skills=(character.rings||[]).flatMap(r=>r.skills.map(s=>({...R.makeSkill({soul,style:character.style,stats:model,index:r.index,years:r.years,category:s.category,damageMode:s.damageMode||((s.category==='持续伤害'||s?.damageMode==='periodic')?'periodic':'direct'),effectVariant:s.effectVariant,effects:s.effects,effectSeed:s.effectSeed}),...(!['控制','减益'].includes(s.category)?{name:s.name}:{})}))).map(s=>normalizeSkill({...s,fx:fxFor(soul)}));
    return {id:'player',name:character.name||'你的见证者',team:0,soul:copy(soul),style:character.style,release:character.release,level:character.level,model,skills,portrait:null,source:'玩家人设'};
  }
  function templateUnit(template,level,id,team){
    const soul={id:'npc-'+template.id,name:template.weapon,tier:7,main_kind:template.kind,subkind:template.subkind,style:template.style,attribute:template.attribute,elements:[],spirit_specialist:!!template.mental,combat_profile:{trait:template.trait,trait_name:'模板特征',description:''}};
    const release=template.kind==='兽'?'附体':'召出';
    const raw=R.buildStats({level,soul,style:template.style,release}),average=R.KEYS.reduce((n,k)=>n+raw.stats[k],0)/6;
    const growth=Object.fromEntries(R.KEYS.map(k=>[k,R.round2(raw.stats[k]*(1.28*raw.benchmark/average-1))]));
    const model=R.buildStats({level,soul,style:template.style,release,growth});
    const count=R.benchmark(level).rings;
    const skills=template.skills.slice(0,Math.min(6,R.benchmark(level).rings)).map((t,i)=>{
      const years=Math.max(10,Math.floor(R.CAPS[i]*.6));
      const base=R.makeSkill({soul,style:template.style,stats:model,index:i+1,years,category:t.category,npcTemplate:true});
      const skill=normalizeSkill({...base,...t,id:template.id+'-'+(i+1),effect:t.description});skill.cost=R.skillBudget(model,skill);skill.cooldown=skill.cd??skill.cooldown;delete skill.cd;return skill;
    });
    return {id,name:template.name,team,soul,style:template.style,release,level,model,skills,portrait:template.portrait,source:template.source,note:template.note,templateId:template.id};
  }
  function runtime(unit){
    const u=copy(unit),m=u.model.derived;
    Object.assign(u,{progress:0,queuedAt:null,queueOrder:0,actions:0,hp:m.HP,mp:m.MP,sh:m.SH,cast:null,readyAt:0,cooldowns:{},uses:{},statuses:[],dots:[],shieldHP:0,shieldSH:0,shieldUntil:0,oneHit:false,guard:0,immuneUntil:0,rage:0,tuneUses:0,calmUses:0,manaGiftUses:0,firstHit:false,fallen:false});
    if(u.release==='召唤'){u.bodyHP=Math.round(m.HP*.45);u.petHP=m.HP-u.bodyHP;u.petMax=u.petHP;u.bodyMax=u.bodyHP;u.petAlive=true;}
    return u;
  }
  class Battle{
    constructor({character,soul,playerTemplateId=null,testLevel=41,duel=false,enemyId='qinyan',withSupport=false,seed='battle',snapshot=null,difficulty='standard'}){
      if(snapshot){if(snapshot.playerRulesVersion!==2||snapshot.soulControlVersion!==11||snapshot.combatRulesVersion!==13)throw Error('此战报使用旧版战斗规则，请保留人物并重新开战');if(snapshot.version!==10)throw Error('旧版即时战斗战报不能用于行动滚轴，请返回登记重开本场');Object.assign(this,copy(snapshot));this.rng=new D.DiceEngine(this.seed,this.rngState);this.events=[];if(this.result&&(this.result.winner===null||this.result.tieBreak&&snapshot.drawRulesVersion!==2))this.resolveDraw(this.result.reason.split(' · ')[0]);return;}
      const t=templates.find(t=>t.id===enemyId)||templates[0];
      if(playerTemplateId){const chosen=templates.find(t=>t.id===playerTemplateId);if(!chosen)throw Error('角色卡不存在');const l=Math.max(41,Math.min(99,Math.round(testLevel)));soul={name:chosen.weapon};character={level:l,style:chosen.style,rings:[]};}
      soul=copy(soul);character=copy(character);const level=Math.max(1,character.level),enemyLevel=difficulty==='admission'?Math.max(1,Math.floor(Math.max(0,level-1)/10)*10+1,level-5):level;character.level=level;if(!playerTemplateId)character.stats=R.buildStats({...character,soul});
      const count=R.benchmark(level).rings;
      // 玩家使用已经获得的全部魂环与魂技；考官按实际环数开放，最多六技。
      const units=[playerTemplateId?templateUnit(templates.find(t=>t.id===playerTemplateId),level,'player',0):playerUnit(character,soul),templateUnit(t,enemyLevel,'enemy',1)];
      const support=templates.find(t=>t.support),fighter=templates.find(t=>t.id==='yixing');
      if(character.style==='辅助'&&!duel)units.push(templateUnit(fighter,level,'ally',0),templateUnit(support,enemyLevel,'enemySupport',1));
      else if(withSupport)units.push(templateUnit(support,level,'ally',0),templateUnit(support,enemyLevel,'enemySupport',1));
      this.resourceConfig=R.getResourceConfig();this.activeId=null;this.queueSequence=0;this.units=units.map(runtime);this.difficulty=difficulty;this.seed=String(seed);this.rng=new D.DiceEngine(this.seed);this.now=0;this.result=null;this.log=[];this.events=[];this.turn=0;
      for(const u of this.units)u.tiePriority=this.rng.die(100000);
      this.addLog('斗魂台开启。对手按当前等级切磋；HP或精神护持归零即退场；魂力耗尽不自动失败。同速同时准备时按种子投骰决定顺序。');
      if(difficulty==='admission')this.addLog('入会考核：考官通常低5级但保留所在魂环阶段，伤害为标准的90%，双方行动后均回气0.3秒；按环数开放，最多六技。');
      this.addLog('行动滚轴：敏捷积累行动机会，完成后依次获得回合；实际等级参战，考核降级不会跨越魂环阶段。');
      this.scheduleAI();
    }
    snapshot(){return {version:10,soulControlVersion:11,combatRulesVersion:13,playerRulesVersion:2,drawRulesVersion:2,resourceConfig:this.resourceConfig,doubleEmptySince:this.doubleEmptySince??null,activeId:this.activeId,queueSequence:this.queueSequence,units:copy(this.units),seed:this.seed,rngState:this.rng.state,now:this.now,result:copy(this.result),log:copy(this.log),turn:this.turn,difficulty:this.difficulty||'standard'};}
    unit(id){return this.units.find(u=>u.id===id);}
    alive(u){return !!u&&!u.fallen&&u.hp>0&&u.sh>0;}
    status(u,type){return u.statuses.filter(s=>s.type===type&&s.until>this.now);}
    value(u,type){return Math.max(0,...this.status(u,type).map(s=>s.value));}
    effective(u){
      const s={...u.model.stats},d={...u.model.derived};
      const boost=this.value(u,'attackBoost'),weak=this.value(u,'fatigue');
      d.PA*=1+boost;d.SA*=1+boost;d.MA*=1+boost;
      d.PA*=Math.max(0,1-weak);d.SA*=Math.max(0,1-weak);d.MA*=Math.max(0,1-weak);
      d.DEF*=1-Math.min(.5,this.value(u,'defDown'));d.MDEF*=1-Math.min(.5,this.value(u,'mindDown'));
      s.A*=1+this.value(u,'agility');
      return {...s,...d};
    }
    trait(u){return u.soul.combat_profile?.trait||'focus';}
    basicCost(u){return Math.max(1,Math.ceil(u.model.derived.baseMP*this.resourceConfig.basicFraction));}
    refreshExhaustion(){}
    cost(u,s){
      let cost=s.costPercent?Math.max(s.cost,Math.ceil(u.model.derived.baseMP*s.costPercent*(1-u.model.derived.costReduction/100))):s.cost;
      cost*=1+this.value(u,'costUp');
      const trait=this.trait(u);
      if(trait==='frugal'&&['强化','防御','治疗','回蓝'].includes(s.category))cost*=.88;
      if(trait==='focus'&&['控制','减益'].includes(s.category))cost*=.9;
      if(trait==='water'&&s.category==='减益')cost*=.92;
      if(trait==='fire'&&s.category==='攻击'&&s.channel==='能量')cost*=1.08;
      if(trait==='thunder'&&s.category==='攻击')cost*=1.05;
      return Math.max(1,Math.ceil(cost));
    }
    castTime(u,s){
      let time=s.castFixed??(s.cast+(s.castExtra||0));
      if(this.trait(u)==='thunder'&&s.category==='攻击')time*=.9;
      time*=1+this.value(u,'slow');return Math.max(.5,time);
    }
    targetOptions(u,action){
      const s=['attack','defend','defendSH','tune','calm'].includes(action)?null:u.skills.find(s=>s.id===action);
      const friendly=s&&['强化','防御','治疗','回蓝'].includes(s.category);
      if(['defend','defendSH','tune','calm','wait','armorOff','skipBonus'].includes(action))return [u];
      return this.units.filter(t=>this.alive(t)&&(friendly?t.team===u.team:t.team!==u.team)&&(s?.category!=='回蓝'||t.id!==u.id));
    }
    canAct(u){return this.alive(u)&&this.activeId===u.id&&!u.cast&&u.readyAt<=this.now&&this.value(u,'control')===0;}
    actionRate(u){return Math.max(.06,.20*Math.sqrt(Math.max(0,this.effective(u).A)/Math.max(20,u.model.benchmark))/(1+this.value(u,'slow')));}
    advanceGauge(dt){for(const u of this.units){if(!this.alive(u)||u.id===this.activeId||u.cast||u.progress>=1||this.value(u,'control')||u.readyAt>this.now)continue;u.progress=Math.min(1,u.progress+dt/1000*this.actionRate(u));if(u.progress>=1-1e-9){u.progress=1;u.queuedAt=this.now+dt;u.queueOrder=++this.queueSequence;}}}
    selectActor(){if(this.activeId){const a=this.unit(this.activeId);if(this.alive(a)&&(!this.value(a,'control')||a.cast))return;this.activeId=null;}const next=this.units.filter(u=>this.alive(u)&&!u.cast&&u.progress>=1&&!this.value(u,'control')&&u.readyAt<=this.now).sort((a,b)=>a.queuedAt-b.queuedAt||a.tiePriority-b.tiePriority||a.queueOrder-b.queueOrder)[0];if(next){this.activeId=next.id;this.addLog(next.name+'获得行动回合',{type:'turn',actor:next.id,target:next.id});}}
    endTurn(u,completed=true){
      for(const s of u.statuses)if(completed&&s.actionsRemaining!==undefined)s.actionsRemaining--;
      const expired=u.statuses.filter(s=>s.actionsRemaining!==undefined&&s.actionsRemaining<=0);
      u.statuses=u.statuses.filter(s=>s.actionsRemaining===undefined||s.actionsRemaining>0);
      for(const s of expired.filter(s=>s.fatigue))this.setStatus(u,'fatigue',.1,6,{source:s.source,label:(s.label||'强化')+'后疲劳',from:s.from});
      u.progress=0;u.queuedAt=null;if(completed)u.actions++;u.readyAt=this.now+300;if(this.activeId===u.id)this.activeId=null;}
    cooldownKey(u,s){return u.soul.name==='九心海棠'?'海棠治疗':s.years===100000?'ring-'+s.ring:s.id;}
    cooldownUntil(u,s){return u.cooldowns[this.cooldownKey(u,s)]||0;}
    actionReason(u,action){
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
    }
    command(id,action,targetId){
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
    }
    addLog(text,event={}){const line={time:this.now,text,...event};this.log.push(line);if(this.log.length>1500)this.log.shift();this.events.push(line);}
    setStatus(u,type,value,duration,extra={}){
      u.statuses=u.statuses.filter(s=>s.type!==type||s.value!==value);u.statuses.push({type,value,until:this.now+Math.round(duration*1000),...extra});
    }
    setBuff(u,type,value,skill,extra={}){
      const source=skill.id,actionsRemaining=skill.burstActions||undefined;
      u.statuses=u.statuses.filter(s=>!(s.type===type&&s.source===source));
      u.statuses.push({type,value,source,until:180001,actionsRemaining,...extra});
    }
    hit(u,t,channel,bonus=0){
      const a=this.effective(u),b=this.effective(t),mind=channel==='精神';
      let chance=mind?clamp(.85+(a.P-b.P)/600,.55,.97):clamp(.9+(a.A/Math.max(20,u.model.benchmark)-b.A/Math.max(20,t.model.benchmark))*.12,.6,.97);
      if(this.trait(u)==='sense')chance+=.05;
      if(!mind){chance-=this.value(t,'evasion');if(this.trait(t)==='evasion')chance-=.08;}
      chance=clamp(chance+bonus,mind?.55:.40,.97);
      const roll=this.rng.die(100);return {success:roll<=Math.round(chance*100),roll,chance:Math.round(chance*100)};
    }
    damageValue(u,t,raw,channel,pre){
      const target=pre[t.id],trait=this.trait(u);let def=channel==='精神'?target.MDEF:target.DEF;def*=130/Math.max(20,t.model.benchmark);
      if(trait==='pierce'&&channel!=='精神')def*=.88;if(trait==='mind'&&channel==='精神')def*=.88;
      let damage=Math.max(1,Math.round(raw*100/(100+def)));
      if(this.difficulty==='admission'&&u.team===1)damage=Math.max(1,Math.round(damage*.9));
      if(channel!=='精神'&&this.trait(t)==='body')damage=Math.round(damage*.92);
      if(this.status(t,channel==='精神'?'defendSH':'defendHP').length)damage=Math.round(damage*.70);
      return Math.max(1,damage);
    }
    plan(u,cast,pre){
      const t=this.unit(cast.target),s=cast.skill,a=pre[u.id],p={u,t,cast,s,damage:0,heal:0,channel:'物理',effects:[]};
      if(cast.action==='wait')return p;
      if(!t||!this.alive(t))return p;
      if(['defend','defendSH'].includes(cast.action)){p.effects.push(()=>this.setStatus(u,cast.action==='defendSH'?'defendSH':'defendHP',1,3));return p;}
      if(cast.action==='tune'){p.effects.push(()=>{u.mp=Math.min(u.model.derived.MP,u.mp+Math.round(u.model.derived.baseMP*.08));this.addLog(u.name+'调息恢复魂力',{type:'restore',actor:u.id,target:u.id,fx:'restore'});});return p;}
      if(cast.action==='calm'){p.heal=Math.round(u.model.derived.SH*.08);p.channel='精神';return p;}
      const cat=s?.damageMode==='periodic'?'持续伤害':s?.category||'攻击',channel=s?.channel||(u.soul.spirit_specialist?'精神':'物理');p.channel=channel;
      const power=s?.mindPower?a.MA:channel==='精神'?a.MA:channel==='物理'?a.PA:a.SA+(s?.poisonScaling||0)*a.MA,Q=s?.Q||1;
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
          const tick=this.damageValue(u,t,raw/3,channel,pre),key=u.id+'-'+s.id;
          p.effects.push(()=>{t.dots=t.dots.filter(d=>d.key!==key);t.dots.push({key,source:u.id,channel,baseDamage:tick,damage:Math.round(tick*(1+this.value(u,'dotBoost'))),next:this.now+3000,ticks:3,fx:s.fx,damageNature:this.dotNature(u,s)});this.addLog(t.name+'受到持续伤害状态',{type:'status',actor:u.id,target:t.id,fx:s.fx});});
        }else p.damage=this.damageValue(u,t,raw,channel,s?.penetration?{...pre,[t.id]:{...pre[t.id],DEF:pre[t.id].DEF*(1-s.penetration)}}:pre);
        p.extraDamage=[];
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
    }
    tryControl(u,t,s,baseControl){
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
    }
    applyDamage(t,damage,channel,source,fx){
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
    }
    heal(t,amount,channel){
      if(t.fallen)return;const mind=channel==='精神',max=mind?t.model.derived.SH:t.model.derived.HP;
      const before=mind?t.sh:t.hp;
      if(mind)t.sh=Math.min(max,t.sh+amount);
      else if(t.release==='召唤'){if(t.petAlive)t.petHP=Math.min(t.petMax,t.petHP+amount);else t.bodyHP=Math.min(t.bodyMax,t.bodyHP+amount);t.hp=t.petHP+t.bodyHP;}
      else t.hp=Math.min(max,t.hp+amount);
      this.addLog(`${t.name}${mind?'精神护持':'生命'} +${(mind?t.sh:t.hp)-before}`,{type:'heal',target:t.id,fx:'restore'});
    }
    scheduleAI(autoPlayer=false){
      if(this.result)return;
      for(let i=0;i<this.units.length;i++){
        this.selectActor();const u=this.unit(this.activeId);
        if(!u||u.id==='player'&&!autoPlayer||!this.canAct(u))break;
        const choice=this.aiChoice(u);if(!choice)break;
        if(this.command(u.id,choice.action,choice.target))break;
      }
    }
    aiChoice(u){
      const allies=this.units.filter(t=>t.team===u.team&&this.alive(t));
      const foes=this.units.filter(t=>t.team!==u.team&&this.alive(t));if(!foes.length)return null;
      if(u.bonusAttack){const target=foes.slice().sort((a,b)=>a.hp/a.model.derived.HP-b.hp/b.model.derived.HP||a.id.localeCompare(b.id))[0];return this.actionReason(u,'attack')?{action:'skipBonus',target:u.id}:{action:'attack',target:target.id};}
      const valid=u.skills.filter(s=>!s.aiDisabled&&!s.effects?.length&&!this.actionReason(u,s.id));
      const a=this.effective(u),choices=[];
      const add=(action,target,score)=>{score=this.compactActionScore?this.compactActionScore(u,target,action,score):score;choices.push({action,target:target.id,score:this.darkActionScore?this.darkActionScore(u,target,action,score):score});};
      const ratio=(t,channel)=>channel==='精神'?t.sh/t.model.derived.SH:t.hp/t.model.derived.HP;
      const damage=(s,t)=>{
        const channel=s?.channel||(u.soul.spirit_specialist?'精神':'物理');
        const power=s?.mindPower?a.MA:channel==='精神'?a.MA:channel==='物理'?a.PA:a.SA+(s?.poisonScaling||0)*a.MA;
        let raw=s?((s.category==='持续伤害'||s?.damageMode==='periodic')?1.4:1.2)*s.Q*power*(s.factor??1):.45*power;
        if(s?.secondaryFactor)raw+=1.2*s.Q*power*s.secondaryFactor;
        if(this.value(u,'coldAura'))raw+=a.SA*this.value(u,'coldAura')*(s?.secondaryFactor?2:1);
        if((s?.category==='持续伤害'||s?.damageMode==='periodic'))raw*=1+this.value(u,'dotBoost');
        if(s?.rageSpend)raw*=1+.15*Math.min(3,u.rage);
        if(s?.detonate)raw+=t.dots.filter(d=>d.source===u.id).reduce((n,d)=>n+d.damage*d.ticks,0)*(100+this.effective(t).DEF)/100;
        return this.damageValue(u,t,raw,channel,Object.fromEntries(this.units.map(x=>[x.id,this.effective(x)])));
      };
      const horizon=3; // Value over a few future actions, with a resource opportunity cost.
      if(!this.actionReason(u,'attack'))for(const t of foes)add('attack',t,damage(null,t)*.90/(u.model.derived.HP)*100-this.basicCost(u)/u.model.derived.baseMP*12+8*(1-ratio(t,'生命')));
      for(const s of valid){
        const friendly=['强化','防御','治疗','回蓝'].includes(s.category);
        for(const t of friendly?allies:foes){
          if(!this.targetOptions(u,s.id).some(x=>x.id===t.id))continue;
          const cost=this.cost(u,s)/u.model.derived.baseMP*12;
          let score=-Infinity;
          if(['攻击','持续伤害'].includes(s.category)){
            if(s.detonate&&!t.dots.some(d=>d.source===u.id))continue;
            if((s.category==='持续伤害'||s?.damageMode==='periodic')&&t.dots.some(d=>d.key===u.id+'-'+s.id))continue;
            score=damage(s,t)/u.model.derived.HP*100-cost;
            if(s.detonate)score+=12;
            if((s.category==='持续伤害'||s?.damageMode==='periodic'))score*=.85;
            if(damage(s,t)>=t[s.channel==='精神'?'sh':'hp']+(s.channel==='精神'?t.shieldSH:t.shieldHP))score+=60;
          }
          if(s.category==='强化'){
            const fields={attackBoost:s.buff??0,agility:s.agility||0,evasion:s.evasion||0,dotBoost:s.dotBuff||0,controlWard:s.controlWard?1:0,coldAura:s.coldOnHit||0};
            if(!s.evasion&&!s.dotBuff&&s.buff===undefined)fields.attackBoost=.12*s.Q;
            let improvement=0;
            for(const [type,v]of Object.entries(fields))improvement+=this.buffImprovement(t,type,v,s,u)*(type==='evasion'?100:type==='agility'?40:type==='controlWard'?5:60);
            if(!improvement)continue;
            if(s.dotBuff&&!foes.some(f=>f.dots.some(d=>d.source===u.id))&&!valid.some(x=>(x.category==='持续伤害'||x?.damageMode==='periodic')))continue;
            if(s.burstActions){improvement*=.55;if(s.evasion&&ratio(t,'生命')>.65)improvement*=.55;}
            score=improvement*(s.burstActions?1:horizon*.65)-cost;
            if(this.resourceConfig.selfBuffBonus&&t.id===u.id&&u.mp>=this.cost(u,s)+this.basicCost(u))score+=Math.max(...foes.map(f=>damage(null,f)))*.9/u.model.derived.HP*100-this.basicCost(u)/u.model.derived.baseMP*12;
            if(s.burstActions&&s.evasion&&ratio(t,'生命')<.65&&foes.some(f=>f.cast?.target===t.id||f.progress>.7))score+=40;
            // Poison activation when a poison is already present must precede another setup.
            if(s.dotBuff&&foes.some(f=>f.dots.some(d=>d.source===u.id)))score+=18;
          }
          if(s.category==='控制'&&(!s.effectVariant||this.controlRules?.ai==='legacy')){
            if(t.immuneUntil>this.now||this.value(t,'controlWard'))continue;
            const willInterrupt=t.cast&&t.cast.end>this.now+this.castTime(u,s)*(s.castMultiplier||1)*1000;
            const effect=R.controlEffect(s.Q,a,this.effective(t));
            const duration=Math.min(4,(s.baseControl||effect.duration)*effect.ratio);
            const enemyHit=t.skills.filter(x=>['攻击','持续伤害'].includes(x.category));
            const enemyPower=this.effective(t);
            const estimate=x=>this.damageValue(t,u,((x.category==='持续伤害'||x?.damageMode==='periodic')?1.4:1.2)*x.Q*(x.channel==='物理'?enemyPower.PA:x.mindPower?enemyPower.MA:enemyPower.SA)*(x.factor??1),x.channel,Object.fromEntries(this.units.map(x=>[x.id,this.effective(x)])));
            const blocked=willInterrupt&&t.cast.skill?estimate(t.cast.skill):0;
            const typical=enemyHit.length?Math.max(...enemyHit.map(estimate)):0;
            const window=(duration+t.progress/Math.max(.06,this.actionRate(t)))/(1/this.actionRate(t)+1.5);
            score=effect.chance/100*(blocked+typical*Math.min(.65,window))/u.model.derived.HP*100-cost;
            if(s.chipFactor)score+=s.chipFactor*s.Q*a.MA/u.model.derived.HP*100;
            if(s.dispel&&t.shieldHP)score+=20;
          }
          if(s.category==='减益'&&(!s.effectVariant||this.controlRules?.ai==='legacy')){
            const type=s.channel==='精神'?'mindDown':'defDown';
            const source=this.statusSource(u,s),defGain=this.statusGain(t,type,.1*s.Q,source),slowGain=this.statusGain(t,'slow',s.slow||0,source),costGain=this.statusGain(t,'costUp',s.costUp||0,source);
            if(!defGain&&!slowGain&&!costGain)continue;
            const remaining=Math.min(3,Math.max(0,t.hp/t.model.derived.HP*3));
            score=(slowGain*22+costGain*18+defGain*15)*remaining-cost;
            if(this.resourceConfig.domainAI&&s.fieldEvasion){
              const ownAttack=Math.max(0,...u.skills.filter(x=>['攻击','持续伤害'].includes(x.category)&&!x.detonate).map(x=>damage(x,t)));
              const ta=this.effective(t),pre=Object.fromEntries(this.units.map(x=>[x.id,this.effective(x)]));
              const enemyAttack=Math.max(0,...t.skills.filter(x=>['攻击','持续伤害'].includes(x.category)).map(x=>this.damageValue(t,u,((x.category==='持续伤害'||x?.damageMode==='periodic')?1.4:1.2)*x.Q*(x.channel==='物理'?ta.PA:x.mindPower?ta.MA:ta.SA)*(x.factor??1),x.channel,pre)));
              const horizon=Math.min(2,(s.duration||6)/(1/this.actionRate(u)+1.2));
              const defense=ta.DEF*130/Math.max(20,t.model.benchmark);
              const offenseGain=ownAttack*defGain*defense/(100+defense)*Math.min(1,horizon);
              const defenseGain=enemyAttack*((s.fieldEvasion||0)+(s.slow||0)*.5)*horizon;
              score=(offenseGain+defenseGain)/u.model.derived.HP*100-cost;
            }

          }
          if(s.effectVariant&&this.controlRules?.ai!=='legacy')score=this.scoreControlVariant(u,t,s);
          if(s.category==='防御'){
            if((s.channel==='精神'?t.shieldSH:t.shieldHP)>0||t.guard>0)continue;
            // A shield on the wrong damage channel has no immediate survival value.
            const threatened=foes.some(f=>f.skills.some(x=>['攻击','持续伤害'].includes(x.category)&&(x.channel==='精神')===(s.channel==='精神'))||(!f.soul.spirit_specialist&&s.channel!=='精神'));
            if(!threatened)continue;
            score=(ratio(t,s.channel)<.45?36:ratio(t,s.channel)<.8?18:5)-cost;
            if(t.cast)score+=4;
          }
          if(s.category==='治疗'){
            const missing=1-ratio(t,s.channel);if(missing<.12)continue;
            score=missing*65-cost;
          }
          if(s.category==='回蓝'&&t.mp<t.model.derived.MP*.3)score=20-cost;
          if(Number.isFinite(score))add(s.id,t,score);
        }
      }
      if(u.sh<u.model.derived.SH*.35&&u.calmUses<1&&u.mp>=Math.ceil(u.model.derived.baseMP*.08))add('calm',u,35);
      choices.sort((x,y)=>y.score-x.score||x.action.localeCompare(y.action)||x.target.localeCompare(y.target));
      return choices[0]||{action:'wait',target:u.id};
    }
    nextTime(){
      this.refreshExhaustion();const times=[180000];
      for(const u of this.units)if(this.alive(u)&&u.exhaustTick>this.now)times.push(u.exhaustTick);
      for(const u of this.units){if(this.alive(u)&&!u.cast&&u.id!==this.activeId&&u.progress<1&&!this.value(u,'control')&&u.readyAt<=this.now)times.push(this.now+Math.max(1,Math.ceil((1-u.progress)/this.actionRate(u)*1000)));if(u.cast)times.push(u.cast.end);if(u.readyAt>this.now)times.push(u.readyAt);for(const s of u.statuses)if(s.until>this.now)times.push(s.until);for(const d of u.dots)if(d.next>this.now)times.push(d.next);if(u.shieldUntil>this.now)times.push(u.shieldUntil);}
      return Math.min(...times.filter(t=>t>this.now));
    }
    tick(targetTime,autoPlayer=false){
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
        for(const p of plans)if(p.damage&&p.t)this.applyDamage(p.t,p.damage,p.channel,p.u,p.s?.fx||fxFor(p.u.soul));
        for(const p of plans)for(const d of p.extraDamage||[])if(p.t)this.applyDamage(p.t,d.amount,d.channel,p.u,p.s?.fx||fxFor(p.u.soul));
        for(const p of plans)if(p.heal&&p.t)this.heal(p.t,p.heal,p.channel);
        for(const p of plans)for(const effect of p.effects)effect();
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
      if(!this.result&&this.now>=180000)this.finishByTime();
    }
    hasOffense(u){
      return this.alive(u)&&(u.mp>=this.basicCost(u)||u.skills.some(s=>['攻击','持续伤害'].includes(s.category)&&u.mp>=this.cost(u,s)&&(!s.maxUses||(u.uses[s.id]||0)<s.maxUses)&&(!s.rageSpend||u.rage>=1)&&(!s.detonate||this.units.some(t=>t.team!==u.team&&t.dots.some(d=>d.source===u.id)))));
    }
    resolveDraw(originalReason){
      const totals=[0,1].map(team=>this.units.filter(u=>u.team===team).reduce((total,u)=>{
        const maximum=Math.max(0,u.model.derived.HP);total.maxHP+=maximum;total.hp+=Math.max(0,Math.min(maximum,u.hp));return total;
      },{hp:0,maxHP:0}));
      const hp=totals.map(t=>t.hp),maxHP=totals.map(t=>t.maxHP),ratios=totals.map(t=>t.maxHP>0?t.hp/t.maxHP:0);
      const equal=Math.abs(ratios[0]-ratios[1])<1e-9,winner=equal?0:ratios[0]>ratios[1]?0:1;
      this.result={winner,reason:originalReason+' · '+(equal?'生命比例相同，主角胜':winner===0?'生命比例领先，主角胜':'生命比例落后，主角负'),time:this.now,tieBreak:{hp,maxHP,ratios,equal,rule:'remainingHPPercentage'}};
      this.addLog(`平局加判：我方剩余生命${(ratios[0]*100).toFixed(2)}%（${hp[0]}/${maxHP[0]}），对方${(ratios[1]*100).toFixed(2)}%（${hp[1]}/${maxHP[1]}）。`+(equal?'比例相同，判主角获胜。':winner===0?'我方比例更高，判主角获胜。':'对方比例更高，判主角落败，可原局重试。'));
    }
    checkResult(){
      for(const u of this.units)if(!u.fallen&&(u.sh<=0||(u.release==='召唤'?u.bodyHP<=0:u.hp<=0))){u.fallen=true;u.cast=null;this.addLog(u.name+'失去战斗能力，保护阵接住了他／她。',{type:'fall',target:u.id,fx:'wave'});}
      if(this.units.filter(u=>this.alive(u)).length>=2&&!this.units.some(u=>this.hasOffense(u))&&!this.units.some(u=>u.dots.length||u.cast&&u.cast.action!=='wait')){
        this.doubleEmptySince??=this.now;
        if(this.now-this.doubleEmptySince>=5000){this.resolveDraw('双方无攻击资源');return;}
      }else this.doubleEmptySince=null;
      const a=this.units.some(u=>u.team===0&&this.alive(u)),b=this.units.some(u=>u.team===1&&this.alive(u));
      if(!a&&!b){this.resolveDraw('双方同时退场');return;}
      if(!a||!b){this.result={winner:a?0:b?1:null,reason:'退场',time:this.now};this.addLog(a?'转正战胜利。人事部为你登记，交付会徽与终端。':b?'本次切磋未通过，可以重试同一场转正战。':'双方同时退场，平局。');}
    }
    finishByTime(){
      const teams=[0,1].map(team=>{const us=this.units.filter(u=>u.team===team&&this.alive(u));return {count:us.length,score:us.reduce((sum,u)=>sum+Math.min(u.hp/u.model.derived.HP,u.sh/u.model.derived.SH),0)};});
      const delta=teams[0].count-teams[1].count||teams[0].score-teams[1].score;
      if(Math.abs(delta)<1e-9){this.resolveDraw('180秒裁判');return;}
      this.result={winner:delta>0?0:1,reason:'180秒裁判',time:this.now};this.addLog('180秒结束，按存活人数与生命／精神剩余比例裁判。');
    }
    surrender(){this.result={winner:1,reason:'认输',time:this.now};this.addLog('你选择结束这场切磋。');}
  }
  const api={Battle,templateUnit,playerUnit,fxFor,templates};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessBattle=api;
})(typeof globalThis==='undefined'?this:globalThis);


(function(root){
  'use strict';
  const R=root.WitnessRules,B=root.WitnessBattle,D=root.WitnessDice;
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
  const oldMake=R.makeSkill;
  R.makeSkill=function(args){
    const s=oldMake(args);
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
  const proto=B.Battle.prototype,oldSnapshot=proto.snapshot;
  proto.snapshot=function(){return {...oldSnapshot.call(this),controlRules:{...(this.controlRules||config)}};};
  const BaseBattle=B.Battle;
  B.Battle=class extends BaseBattle{
    constructor(options){super(options);this.controlRules={...(options.snapshot?.controlRules||config)};}
  };
  const oldEffective=proto.effective;
  proto.effective=function(u){
    const out=oldEffective.call(this,u);
    // The original routine applies at most 50% reduction. Recompute from the same base for v9.
    out.DEF=u.model.derived.DEF*(1-clamp(this.value(u,'defDown'),0,1));
    out.MDEF=u.model.derived.MDEF*(1-clamp(this.value(u,'mindDown'),0,1));
    out.A*=1-clamp(this.value(u,'agilityDown'),0,.9);return out;
  };
  proto.hitChance=function(u,t,channel,bonus=0){
    const a=this.effective(u),b=this.effective(t),mind=channel==='精神';
    let p=mind?clamp(.85+(a.P-b.P)/600,.55,.97):clamp(.9+(a.A/Math.max(20,u.model.benchmark)-b.A/Math.max(20,t.model.benchmark))*.12,.6,.97);
    if(this.trait(u)==='sense')p+=.05;
    if(!mind){p-=this.value(t,'evasion');if(this.trait(t)==='evasion')p-=.08;}
    p=clamp(p+bonus,mind?.55:.40,.97);
    const blind=this.value(u,'accuracyDown');if(blind)p=clamp(p-blind,.05,.97);
    return Math.round(p*100)/100;
  };
  proto.hit=function(u,t,channel,bonus=0){
    const chance=Math.round(this.hitChance(u,t,channel,bonus)*100),roll=this.rng.die(100);
    for(const s of this.status(u,'accuracyDown'))if(s.hitsRemaining!==undefined)s.hitsRemaining--;
    u.statuses=u.statuses.filter(s=>s.type!=='accuracyDown'||s.hitsRemaining===undefined||s.hitsRemaining>0);
    return {success:roll<=chance,roll,chance};
  };
  const oldDamage=proto.applyDamage;
  proto.applyDamage=function(t,damage,channel,source,fx){
    const reduction=source?this.value(source,'damageDown'):0;
    if(reduction&&damage>0)damage=Math.max(1,Math.round(damage*(1-reduction)));
    return oldDamage.call(this,t,damage,channel,source,fx);
  };
  const oldDamageValue=proto.damageValue;
  proto.damageValue=function(u,t,raw,channel,pre){
    let damage=oldDamageValue.call(this,u,t,raw,channel,pre);
    if(this._valuingAI&&this.value(u,'damageDown'))damage=Math.max(1,Math.round(damage*(1-this.value(u,'damageDown'))));
    return damage;
  };
  const oldControl=proto.tryControl;
  proto.controlNumbers=function(u,t,s){
    const e=R.controlEffect(s.Q,this.effective(u),this.effective(t));
    const ratio=clamp((100+this.effective(u).P)/(100+this.effective(t).P),.5,1.5);
    e.duration=R.round2(clamp(s.baseControl*ratio,s.controlFloor,s.controlCap));
    if(this.trait(u)==='binding')e.duration=Math.min(s.controlCap,e.duration+.2);
    if(this.trait(u)==='ice')e.chance=Math.min(85,e.chance+6);
    return e;
  };
  proto.tryControl=function(u,t,s,base){
    if(!s.effectVariant)return oldControl.call(this,u,t,s,base);
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
  const oldPlan=proto.plan;
  proto.plan=function(u,cast,pre){
    const s=cast.skill;
    if(!s?.effectVariant||s.category!=='减益')return oldPlan.call(this,u,cast,pre);
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
  proto.forecastDamage=function(u,t,s){
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
  proto.scoreControlVariant=function(u,t,s){
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
  const oldAI=proto.aiChoice;
  proto.aiChoice=function(u){this._valuingAI=true;try{return oldAI.call(this,u);}finally{this._valuingAI=false;}};
  root.WitnessControlV9={variants,describe:text,select,setConfig(next){config={...config,...next};if(![8,10,12].includes(config.burstSeconds))throw Error('破甲时长只接受8、10、12秒');},getConfig:()=>({...config})};
})(globalThis);

(function(root){
  'use strict';
  const B=root.WitnessBattle, R=root.WitnessRules, proto=B.Battle.prototype;
  const attack=s=>!s||['攻击','持续伤害'].includes(s.category);
  const channel=(u,s)=>s?.channel||(u.soul.spirit_specialist?'精神':'物理');
  const pool=(u,ch)=>ch==='精神'?'sh':'hp';
  const maximum=(u,ch)=>u.model.derived[ch==='精神'?'SH':'HP'];
  const previousScore=proto.scoreControlVariant;
  proto.compactEnabled=function(u){
    return u.style==='控制'&&u.skills.some(s=>s.effectVariant)&&['timing','budget','compact'].includes(this.controlRules?.ai);
  };
  // A forecast reads public combat state; it never rolls dice or changes units.
  proto.aiStrike=function(u,t,s,at=0,defense=null){
    const ch=channel(u,s),a=this.effective(u),pre=Object.fromEntries(this.units.map(x=>[x.id,this.effective(x)]));
    const power=s?.mindPower?a.MA:ch==='精神'?a.MA:ch==='物理'?a.PA:a.SA+(s?.poisonScaling||0)*a.MA;
    let raw=s?((s.category==='持续伤害'||s?.damageMode==='periodic')?1.4:1.2)*s.Q*power*(s.factor??1):.45*power;
    const trait=this.trait(u),dot=(s?.category==='持续伤害'||s?.damageMode==='periodic');
    if(!s)raw*=trait==='heavy'?1.12:trait==='swift'?.96:['guard','ghost'].includes(trait)?.94:1;
    if(dot)raw*=(1+this.value(u,'dotBoost'))*(trait==='poison'?1.14:1);
    if(s?.category==='攻击')raw*=trait==='poison'?.95:trait==='fire'&&ch==='能量'?1.1:1;
    if(s?.rageSpend)raw*=1+.15*Math.min(3,u.rage);
    if(defense)pre[t.id][defense.type]=t.model.derived[defense.type]*(1-defense.value);
    if(s?.penetration)pre[t.id].DEF*=1-s.penetration;
    let damage=this.damageValue(u,t,raw,ch,pre);
    if(s?.secondaryFactor)damage+=this.damageValue(u,t,1.2*s.Q*power*s.secondaryFactor,s.secondaryChannel||ch,pre);
    if(s?.detonate)damage+=t.dots.filter(d=>d.source===u.id).reduce((n,d)=>n+d.damage*d.ticks,0);
    const hit=this.hitChance(u,t,ch),cost=s?this.cost(u,s):this.basicCost(u);
    const cast=s?this.castTime(u,s)*(s.castMultiplier||1):(1.5+(trait==='heavy'?.15:0))*(trait==='swift'?.88:1)*(1+this.value(u,'slow'));
    const shield=ch==='精神'?t.shieldSH:t.shieldHP,special=ch!=='精神'&&this.value(t,'soulArmor')>0;
    const incoming=Math.max(0,damage*(ch!=='精神'&&t.guard?1-t.guard:1)-shield);
    const absorbed=Math.min(incoming*Math.min(.7,this.resourceConfig.absorb+(special?.15:0)),t.mp/(this.resourceConfig.mpPerDamage*(special?.75:1)));
    return {s,ch,cost,cast,hit,damage:damage*hit,health:(incoming-absorbed)*hit,at,dot};
  };
  proto.aiAvailable=function(u,s,at,mp){
    return attack(s)&&(!s||!s.aiDisabled&&this.cooldownUntil(u,s)<=this.now+at*1000&&(!s.maxUses||(u.uses[s.id]||0)<s.maxUses)&&(!s.rageSpend||u.rage>0))&&mp>=(s?this.cost(u,s):this.basicCost(u));
  };
  // At most three future attacks. Paid casts are included even when MP is now empty.
  proto.aiSequence=function(u,t,horizon,delay=0,mp=u.mp,defense=null,reserved=null){
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
  proto.aiThreatValue=function(u,t,hit){
    const damage=hit.health,hp=t[pool(t,hit.ch)];
    return damage/maximum(t,hit.ch)*100*(damage>=hp?3:hp<maximum(t,hit.ch)*.35?1.6:1);
  };
  proto.scoreControlVariant=function(u,t,s){
    if(!this.compactEnabled(u))return previousScore.call(this,u,t,s);
    const kind=s.effectVariant,v=root.WitnessControlV9.variants[kind];
    const cast=this.castTime(u,s)*(s.castMultiplier||1),cost=this.cost(u,s),mode=this.controlRules.ai;
    const reserve=mode==='timing'?1:1+2*Math.pow(1-u.mp/u.model.derived.MP,2);
    const penalty=cost/u.model.derived.baseMP*12*reserve;
    const chance=Math.round(R.controlEffect(s.Q,this.effective(u),this.effective(t)).chance)/100;
    const cycle=.3+1/this.actionRate(u),after=cast+cycle;
    const target=t.cast?this.unit(t.cast.target)||u:u;
    const incoming=this.aiSequence(t,target,cast+20),danger=incoming.filter(x=>x.at>=cast);
    let value=0;
    if(s.category==='控制'){
      if(t.immuneUntil>this.now||this.value(t,'controlWard'))return -Infinity;
      const e=this.controlNumbers(u,t,s),interrupt=t.cast&&t.cast.end>this.now+cast*1000;
      if(kind==='interrupt'&&!interrupt&&t.progress<.8)return -Infinity;
      if(interrupt){
        const paid=incoming.find(x=>x.paid);
        value=paid?this.aiThreatValue(t,target,paid):4;
      }
      const window=e.duration+Math.max(0,t.progress-.4)/this.actionRate(t);
      const threatened=danger.filter(x=>x.at<cast+window&&!x.paid);
      const follow=this.aiSequence(u,t,cast+window,after,u.mp-cost);
      const dots=t.dots.filter(d=>d.source===u.id&&d.next<this.now+(cast+window)*1000);
      const canFinish=['物理','精神'].some(ch=>follow.filter(x=>(x.ch==='精神')===(ch==='精神')).reduce((n,x)=>n+x.health,0)>=t[pool(t,ch)])||dots.some(d=>d.damage*d.ticks>=t[pool(t,d.channel)]);
      // A delay matters most when it prevents imminent defeat or enables a finish.
      const urgent=threatened.some(x=>this.aiThreatValue(t,target,x)>35);
      value+=threatened.reduce((n,x)=>n+this.aiThreatValue(t,target,x),0)*(canFinish||urgent?.65:.12);
      return e.chance/100*value-penalty;
    }
    const type=v.status||(s.channel==='精神'?'mindDown':'defDown');
    const current=this.value(t,type),next=this.stackedNext(t,type,v.value,this.statusSource(u,s));
    if(next<=current+1e-9)return -Infinity;
    if(kind==='breach'||kind==='corrosion'){
      const duration=kind==='breach'?this.controlRules.burstSeconds:35;
      const defense={type:s.channel==='精神'?'MDEF':'DEF',value:next};
      const follow=this.aiSequence(u,t,cast+duration,after,u.mp-cost);
      for(const hit of follow){
        if((hit.ch==='精神')!==(s.channel==='精神'))continue;
        const enhanced=this.aiStrike(u,t,hit.s,hit.at,defense);
        value+=Math.max(0,enhanced.damage-hit.damage)/u.model.derived.HP*100;
      }
    }else{
      const covered=danger.filter(x=>x.at<cast+(v.duration||20));
      for(const [i,hit] of covered.entries()){
        const reduction=kind==='weaken'?(next-current)/(1-current):kind==='slow'?1-Math.sqrt((1-next)/(1-current)):i<2?Math.min(next-current,Math.max(0,hit.hit-.05))/Math.max(.05,hit.hit):0;
        value+=this.aiThreatValue(t,target,hit)*reduction;
      }
      if(kind==='weaken')for(const ally of this.units.filter(x=>x.team===u.team&&this.alive(x)))for(const dot of ally.dots.filter(d=>d.source===t.id))value+=dot.damage*dot.ticks*(next-current)/maximum(ally,dot.channel)*100;
    }
    if(mode!=='timing'&&u.mp-cost<this.basicCost(u)&&!t.dots.some(d=>d.source===u.id)&&!this.units.some(x=>x.team===u.team&&x.id!==u.id&&this.hasOffense(x)))value*=.15;
    return chance*value-penalty;
  };
  proto.compactActionScore=function(u,t,action,score){
    if(!this.compactEnabled(u)||this.controlRules.ai==='timing')return score;
    const s=u.skills.find(x=>x.id===action);
    if(this.controlRules.ai==='compact'&&s?.category==='防御'&&!t.dots.length&&!this.units.some(x=>x.team!==u.team&&this.alive(x)&&(this.hasOffense(x)||x.cast&&attack(x.cast.skill)&&x.cast.action!=='wait')))return -Infinity;
    if(action!=='attack'&&(!s||!attack(s)))return score;
    const hit=this.aiStrike(u,t,s),hp=t[pool(t,hit.ch)];
    const remaining=Math.max(0,u.mp-hit.cost),efficiency=hit.damage/Math.max(1,hit.cost);
    const budget=1+2*Math.pow(1-u.mp/u.model.derived.MP,2);
    let value=hit.damage/u.model.derived.HP*100-hit.cost/u.model.derived.baseMP*12*budget;
    value+=efficiency*4*(1-u.mp/u.model.derived.MP);
    if(!hit.dot&&hit.health>=hp)value+=60;
    if(hit.dot)value*=.85;
    if(this.controlRules.ai==='compact'){
      const next=this.aiSequence(u,t,20,hit.cast+.3+1/this.actionRate(u),remaining,null,s);
      const same=next.filter(x=>(x.ch==='精神')===(hit.ch==='精神')).slice(0,2);
      const followDamage=same.reduce((n,x)=>n+x.health,0);
      if(hit.health+followDamage>=hp)value+=12;
    }
    return value;
  };
  root.WitnessCompactAI={version:10};
})(globalThis);

WitnessControlV9.setConfig({ai:"compact"});

(function(root){
  'use strict';
  const proto=root.WitnessBattle.Battle.prototype;
  const numeric=new Set(['attackBoost','agility','evasion','dotBoost','coldAura','defDown','mindDown','slow','costUp','agilityDown','damageDown','accuracyDown','fatigue']);
  const caps={};
  proto.statusSource=function(u,s){return u.id+'-'+s.id;};
  proto.stackCap=function(type){return caps[type]??Infinity;};
  proto.value=function(u,type){
    const values=this.status(u,type).map(s=>Math.max(0,s.value));
    const value=numeric.has(type)?values.reduce((a,b)=>a+b,0):Math.max(0,...values);
    return ['attackBoost','agility'].includes(type)?value:Math.min(this.stackCap(type),value);
  };
  proto.stackedNext=function(t,type,value,source){
    const others=this.status(t,type).filter(s=>s.source!==source).map(s=>Math.max(0,s.value));
    const next=numeric.has(type)?others.reduce((a,b)=>a+b,0)+value:Math.max(value,0,...others);
    return Math.min(this.stackCap(type),next);
  };
  proto.statusGain=function(t,type,value,source){
    return Math.max(0,this.stackedNext(t,type,value,source)-Math.min(this.stackCap(type),this.value(t,type)));
  };
  proto.buffImprovement=function(t,type,value,skill,caster){
    return this.statusGain(t,type,value,caster?this.statusSource(caster,skill):skill.id);
  };
  proto.setStatus=function(u,type,value,duration,extra={}){
    const source=extra.source||'system:'+type;
    u.statuses=u.statuses.filter(s=>!(s.type===type&&(numeric.has(type)?s.source===source:true)));
    u.statuses.push({type,value,until:this.now+Math.round(duration*1000),...extra,source});
  };
  proto.setBuff=function(u,type,value,skill,extra={}){
    const source=extra.source||skill.id,actionsRemaining=skill.burstActions||undefined;
    u.statuses=u.statuses.filter(s=>!(s.type===type&&s.source===source));
    u.statuses.push({type,value,until:180001,actionsRemaining,...extra,source});
  };
  proto.dotDamage=function(dot){
    const owner=this.unit(dot.source);
    return dot.baseDamage===undefined?dot.damage:Math.max(1,Math.round(dot.baseDamage*(1+(owner?this.value(owner,'dotBoost'):0))));
  };
  root.WitnessStackRules={version:13,numeric:[...numeric],caps};
})(globalThis);

(function(root){
  'use strict';
  const proto=root.WitnessBattle.Battle.prototype;
  // One score adjustment for the four-skill poison template; no search or extra turns.
  proto.darkActionScore=function(u,t,action,score){
    if(u.templateId!=='anmu')return score;
    const s=u.skills.find(x=>x.id===action),foes=this.units.filter(x=>x.team!==u.team&&this.alive(x));
    const poison=u.skills.find(x=>(x.category==='持续伤害'||x?.damageMode==='periodic'));
    const readyPoison=poison&&!this.actionReason(u,poison.id);
    const dots=foes.flatMap(f=>f.dots.filter(d=>d.source===u.id).map(d=>({f,d})));
    const penalty=cost=>cost/u.model.derived.baseMP*12;
    if(action==='attack'||s?.category==='攻击'){
      const hit=this.aiStrike(u,t,s);
      if(s?.detonate){
        const land=this.now+hit.cast*1000,own=t.dots.filter(d=>d.source===u.id);
        const stored=own.reduce((n,d)=>n+this.dotDamage(d)*d.ticks,0);
        const later=own.reduce((n,d)=>n+Array.from({length:d.ticks},(_,i)=>d.next+i*3000).filter(at=>at>land).length*this.dotDamage(d),0);
        const damage=Math.max(0,hit.damage-(stored-later)*hit.hit),health=hit.health*damage/Math.max(1,hit.damage);
        return health>=t.hp?80:(damage-later*hit.hit*.75)/u.model.derived.HP*100-penalty(hit.cost);
      }
      return hit.health>=t[hit.ch==='精神'?'sh':'hp']?Math.max(score,80):score;
    }
    if((s?.category==='持续伤害'||s?.damageMode==='periodic')){
      const hit=this.aiStrike(u,t,s),basic=this.aiStrike(u,t,null),cycle=basic.cast+.3+1/this.actionRate(u);
      const existing=t.dots.reduce((n,d)=>n+this.dotDamage(d)/3,0);
      const life=t.hp/Math.max(1,basic.health/cycle+existing),ticks=Math.max(1,Math.min(3,Math.floor(life/3)));
      return hit.damage*(ticks/3)*.85/u.model.derived.HP*100-penalty(hit.cost);
    }
    if(s?.category!=='强化')return score;
    if(s.dotBuff&&t.id!==u.id)return -Infinity;
    if(!dots.length&&readyPoison)return -Infinity;
    if(s.dotBuff){
      const cast=this.castTime(u,s)*(s.castMultiplier||1),land=this.now+cast*1000;
      const remaining=dots.reduce((n,{d})=>n+Array.from({length:d.ticks},(_,i)=>d.next+i*3000).filter(at=>at>land).length*this.dotDamage(d),0);
      const future=poison&&u.mp>=this.cost(u,s)+this.cost(u,poison);
      if(!remaining&&!future)return -Infinity;
    }
    return score;
  };
})(globalThis);

// BEGIN V13 SHARED EXTENSION
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
  function make(base,args){
    let mode=args.damageMode;
    if(args.category==='持续伤害')mode='periodic';
    if(args.category==='攻击'&&!mode&&!args.npcTemplate){const seed=args.effectSeed||[args.soul.id,args.index,args.years,args.variant||0].join('|');mode=random(seed+'|attack-mode')()<.25?'periodic':'direct';}
    const resolved={...args,category:mode==='periodic'?'持续伤害':args.category};
    const skill=decorate(base(resolved),resolved);
    return resolved.category==='持续伤害'?{...skill,category:'攻击',damageMode:'periodic'}:args.category==='攻击'?{...skill,damageMode:'direct'}:skill;
  }
  const api={generate,decorate,make,weights,labels};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessSkillEffects=api;
})(typeof globalThis==='undefined'?this:globalThis);

(function(root){
  'use strict';
  const R=root.WitnessRules,B=root.WitnessBattle,SE=root.WitnessSkillEffects,p=B.Battle.prototype,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const config={coefficient:.40,bonus:.35,cap:.90,costFraction:.02,duration:4};
  const oldMake=R.makeSkill;R.makeSkill=args=>SE.make(oldMake,args);
  const oldSnapshot=p.snapshot;p.snapshot=function(){return {...oldSnapshot.call(this),tacticsRulesVersion:1005,dodgeConfig:{...config,...this.dodgeConfig}};};
  p.dodgeCost=function(u){return Math.max(1,Math.ceil(u.model.derived.baseMP*(this.dodgeConfig||config).costFraction));};
  const oldReason=p.actionReason;p.actionReason=function(u,action){
    if(action!=='dodge')return oldReason.call(this,u,action);
    if(this.value(u,'control'))return '受控中，无法闪避';if(!this.alive(u))return '已退场';if(u.cast)return '正在读条';if(!this.canAct(u))return '等待敏捷行动回合';if(u.bonusAttack)return '附赠普攻机会不能用于闪避';return u.mp<this.dodgeCost(u)?'魂力不足以闪避':'';
  };
  const oldTargets=p.targetOptions;p.targetOptions=function(u,action){return action==='dodge'?[u]:oldTargets.call(this,u,action);};
  const oldCommand=p.command;p.command=function(id,action,target){
    if(action!=='dodge')return oldCommand.call(this,id,action,target);if(this.result)return '战斗已结束';const u=this.unit(id),reason=this.actionReason(u,action);if(reason)return reason;
    const c=this.dodgeConfig||config,cost=this.dodgeCost(u);u.mp-=cost;u.dodgeCount=(u.dodgeCount||0)+1;u.dodgeSpent=(u.dodgeSpent||0)+cost;this.setStatus(u,'activeDodge',1,c.duration,{source:'active-dodge',label:'主动闪避'});this.endTurn(u);
    this.addLog(u.name+'主动闪避，消耗'+cost+'点魂力，持续'+c.duration+'秒',{type:'dodge',actor:id,target:id,cost});return '';
  };
  const oldSetStatus=p.setStatus;p.setStatus=function(u,type,value,duration,extra={}){if(type==='control')u.statuses=u.statuses.filter(s=>s.type!=='activeDodge');if(type.startsWith('statDown')||type.startsWith('statUp')){const source=extra.source||'system:'+type;u.statuses=u.statuses.filter(s=>s.type!==type||s.source!==source);u.statuses.push({type,value,until:this.now+duration*1000,...extra,source});return;}return oldSetStatus.call(this,u,type,value,duration,extra);};
  p.hitChance=function(u,t,channel,bonus=0){
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
  const oldEffective=p.effective;p.effective=function(u){
    const out=oldEffective.call(this,u),base={...u.model.stats},next={...base};
    for(const key of R.KEYS){const up=this.status(u,'statUp'+key).reduce((n,s)=>n+s.value,0),down=this.status(u,'statDown'+key).reduce((n,s)=>n+s.value,0);next[key]=base[key]*(1+up)*Math.max(0,1-down);out[key]*=next[key]/base[key];}
    const before=R.derive(base),after=R.derive(next);for(const key of ['PA','SA','MA','DEF','MDEF'])out[key]*=after[key]/before[key];
    out.costReduction=after.costReduction;out.castReduction=after.castReduction;return out;
  };
  const oldCost=p.cost;p.cost=function(u,s){const factor=(1-this.effective(u).costReduction/100)/(1-u.model.derived.costReduction/100);return Math.max(1,Math.ceil(oldCost.call(this,u,s)*factor));};
  const oldCast=p.castTime;p.castTime=function(u,s){const factor=(1-this.effective(u).castReduction/100)/(1-u.model.derived.castReduction/100);return Math.max(.5,oldCast.call(this,u,s)*factor);};
  const oldPlan=p.plan;p.plan=function(u,cast,pre){
    const s=cast.skill;if(!s?.effects?.length)return oldPlan.call(this,u,cast,pre);
    const t=this.unit(cast.target),plan={u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};if(!t||!this.alive(t))return plan;
    plan.effects.push(()=>{if(s.category==='减益'){const chance=R.controlEffect(s.Q,pre[u.id],pre[t.id]).chance,roll=this.rng.die(100);this.addLog(s.name+'判定 '+roll+' / '+Math.round(chance)+'%',{type:roll<=Math.round(chance)?'status':'resist',actor:u.id,target:t.id});if(roll>Math.round(chance))return;}
      for(const effect of s.effects){const type=(s.category==='强化'?'statUp':'statDown')+effect.key,extra={source:this.statusSource(u,s),label:s.name,from:u.name};if(s.category==='强化')this.setBuff(t,type,effect.value,s,extra);else this.setStatus(t,type,effect.value,180.001,extra);}
    });return plan;
  };
  const oldAI=p.aiChoice;p.aiChoice=function(u){
    const original=u.skills;let choice;try{u.skills=original.filter(s=>!s.effects?.length);choice=oldAI.call(this,u);}finally{u.skills=original;}if(u.bonusAttack)return choice;
    let best=choice,bestScore=Number.isFinite(choice?.score)?choice.score:0;
    for(const s of u.skills.filter(s=>s.effects?.length&&!this.actionReason(u,s.id))){for(const t of this.targetOptions(u,s.id)){
      let gain=0;for(const e of s.effects){const type=(s.category==='强化'?'statUp':'statDown')+e.key,source=this.statusSource(u,s),current=this.status(t,type).filter(x=>x.source!==source).reduce((n,x)=>n+x.value,0),own=this.status(t,type).find(x=>x.source===source)?.value||0;gain+=Math.max(0,current+e.value-(current+own))*(e.key==='A'?65:e.key==='C'?45:70);}
      let score=gain*(s.category==='减益'?.65:1)-this.cost(u,s)/u.model.derived.baseMP*12;if(s.category==='减益')score*=R.controlEffect(s.Q,this.effective(u),this.effective(t)).chance/100;
      if(score>bestScore){best={action:s.id,target:t.id,score};bestScore=score;}
    }}return best;
  };
  p.dotNature=function(u,s){return s?.damageNature||(s?.fx==='poison'||/毒/.test([s?.name,s?.description,s?.effect,(u?.soul.elements||[]).join('')].join(''))?'poison':'residual');};
  p.dotLabel=function(dot){const owner=this.unit(dot.source),s=owner?.skills.find(s=>dot.key===owner.id+'-'+s.id);return (dot.damageNature||this.dotNature(owner,s))==='poison'?'毒伤':'残伤';};
  p.applyDotDamage=function(t,dot){const nature=this.dotLabel(dot)==='毒伤'?'poison':'residual',start=this.events.length;this.applyDamage(t,dot.damage,dot.channel,this.unit(dot.source),dot.fx);for(const event of this.events.slice(start))if(event.type==='damage'){event.periodic=true;event.damageNature=nature;event.text=(nature==='poison'?'毒伤：':'残伤：')+event.text;}};
  root.WitnessTacticsV10={config};
})(globalThis);

(function(root){
  const p=root.WitnessBattle.Battle.prototype,oldPlan=p.plan;
  p.plan=function(u,cast,pre){
    const plan=oldPlan.call(this,u,cast,pre);if(cast.skill?.category!=='减益')return plan;
    plan.effects=plan.effects.map(apply=>()=>{const before=new Set(this.units.flatMap(t=>t.statuses));apply();for(const t of this.units)for(const status of t.statuses)if(!before.has(status)){status.until=180001;delete status.hitsRemaining;delete status.actionsRemaining;}});
    return plan;
  };
})(globalThis);


(function(root){
  'use strict';
  const B=root.WitnessBattle,R=root.WitnessRules,p=B.Battle.prototype;
  p.controlNumbers=function(u,t,s){
    const a=this.effective(u),b=this.effective(t),effect=R.controlEffect(s.Q,a,b),ratio=(100+a.P)/(100+b.P);
    effect.duration=R.round2(Math.max(.01,(s.baseControl??(1+.5*s.Q))*ratio));
    if(this.trait(u)==='binding')effect.duration=R.round2(effect.duration+.2);
    if(this.trait(u)==='ice')effect.chance=Math.min(85,effect.chance+6);
    if(s.controlChance!==undefined)effect.chance=s.controlChance;
    return effect;
  };
  p.gainRage=function(u,amount){const gain=Math.max(0,Math.min(amount,5-(u.rageTotal||0)));u.rage=Math.min(5,u.rage+gain);u.rageTotal=(u.rageTotal||0)+gain;};
  const oldDamageValue=p.damageValue;p.damageValue=function(u,t,raw,channel,pre){const penetration=this.value(u,'phantomPierce');if(channel!=='精神'&&penetration)pre={...pre,[t.id]:{...pre[t.id],DEF:pre[t.id].DEF*Math.max(0,1-penetration)}};const damage=oldDamageValue.call(this,u,t,raw,channel,pre);return channel==='精神'?damage:Math.max(1,Math.round(damage*Math.max(0,1-this.value(t,'iceArmor'))));};
  const oldDamage=p.applyDamage;p.applyDamage=function(t,damage,channel,source,fx){
    const before=t.hp;oldDamage.call(this,t,damage,channel,source,fx);
    if(source?.soul.name==='血君'&&t.hp<before){t.bloodMarks||=[];if(!t.bloodMarks.includes(source.id))t.bloodMarks.push(source.id);}
  };
  const oldTargets=p.targetOptions;p.targetOptions=function(u,action){
    if(['phantomSacrifice','phantomSwap'].includes(action))return [u];
    const targets=oldTargets.call(this,u,action),s=u.skills.find(s=>s.id===action);
    return s?.requireBlood?targets.filter(t=>t.bloodMarks?.includes(u.id)&&t.cast):targets;
  };
  const oldReason=p.actionReason;p.actionReason=function(u,action){
    if(!['phantomSacrifice','phantomSwap'].includes(action))return oldReason.call(this,u,action);
    if(!this.alive(u))return '已退场';if(!u.phantoms)return '没有可用分身';if(u.cast||!this.canAct(u)||u.bonusAttack)return '等待完整行动回合';if(action==='phantomSwap'&&u.phantomSwapped)return '本场换位机会已用尽';return '';
  };
  const oldCommand=p.command;p.command=function(id,action,target){
    if(!['phantomSacrifice','phantomSwap'].includes(action))return oldCommand.call(this,id,action,target);
    const u=this.unit(id),reason=this.actionReason(u,action);if(reason)return reason;if(this.result)return '战斗已结束';u.phantoms--;
    if(action==='phantomSwap'){u.phantomSwapped=true;this.setStatus(u,'phantomSwapReady',1,4,{source:u.id+'-phantom-swap',label:'分身换位'});this.addLog(u.name+'以分身准备换位，下一次直接生命攻击可被避开；此分身不提供泯灭增幅。',{type:'status',actor:id,target:id});}
    else {u.phantomSacrificed=(u.phantomSacrificed||0)+1;for(const type of ['attackBoost','agility'])this.setBuff(u,type,.06*u.phantomSacrificed,{}, {source:u.id+'-phantom-sacrifice',label:'分身泯灭',from:u.name});this.addLog(u.name+'泯灭一道分身，累计额外攻击与敏捷增幅'+(u.phantomSacrificed*6)+'%。',{type:'status',actor:id,target:id});}
    this.endTurn(u);return '';
  };
  const oldHit=p.hit;p.hit=function(u,t,channel,bonus=0){
    const result=oldHit.call(this,u,t,channel,bonus);
    if(channel!=='精神'&&this.value(t,'phantomSwapReady')&&!this.value(t,'control')){t.statuses=t.statuses.filter(s=>s.type!=='phantomSwapReady');this.addLog(t.name+'与分身换位，避开这次直接攻击。',{type:'miss',actor:u.id,target:t.id});return {...result,success:false};}
    return this.value(u,'bloodFirstStrike')?{...result,success:true,chance:100}:result;
  };
  const oldPlan=p.plan;p.plan=function(u,cast,pre){
    const s=cast.skill,t=this.unit(cast.target);
    if(s?.bloodInterrupt&&(!t?.bloodMarks?.includes(u.id)||!t.cast))return {u,t,cast,s,damage:0,heal:0,channel:s.channel,effects:[]};
    const isAttack=s?['攻击','持续伤害'].includes(s.category):cast.action==='attack',first=isAttack&&this.value(u,'bloodFirstStrike'),plan=oldPlan.call(this,u,cast,pre);
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
  // The common NPC path also respects the explicit blood-night first-hit chance.
  const oldControl=p.tryControl;p.tryControl=function(u,t,s,base){
    if(s?.controlChance===undefined)return oldControl.call(this,u,t,s,base);
    if(!this.alive(t)||t.immuneUntil>this.now||this.value(t,'controlWard'))return;
    if(this.rng.die(100)>s.controlChance)return;
    const seconds=R.controlEffect(s.Q,this.effective(u),this.effective(t)).ratio*(base||1);
    this.setStatus(t,'control',1,seconds);t.progress=Math.min(t.progress,.4);t.queuedAt=null;t.immuneUntil=this.now+Math.round(seconds*1000)+4000;
    if(t.cast){t.cast=null;this.endTurn(t,false);}t.readyAt=Math.max(t.readyAt,this.now+seconds*1000);this.addLog(t.name+'受到血夜首击禁锢'+R.round2(seconds)+'秒。',{type:'control',actor:u.id,target:t.id});
  };
  const oldAI=p.aiChoice;p.aiChoice=function(u){
    if(u.phantoms&&!u.bonusAttack){const foes=this.units.filter(x=>x.team!==u.team&&this.alive(x));if(!this.actionReason(u,'phantomSwap')&&u.hp/u.model.derived.HP<.35&&foes.some(x=>x.cast?.target===u.id))return {action:'phantomSwap',target:u.id,score:100};if(u.phantoms>1&&u.actions<6&&!this.actionReason(u,'phantomSacrifice'))return {action:'phantomSacrifice',target:u.id,score:30};}
    return oldAI.call(this,u);
  };
  root.WitnessCombatV13.specialMembers=true;
})(globalThis);
