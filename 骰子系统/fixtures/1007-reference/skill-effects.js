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
