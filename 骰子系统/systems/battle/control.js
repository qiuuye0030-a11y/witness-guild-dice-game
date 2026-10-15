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
