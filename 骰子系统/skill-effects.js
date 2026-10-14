(function(root){
  'use strict';
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
    const scale=[0,1,.72,.55][count],base=category==='强化'?Math.min(.5,.12*Q):Math.min(.4,.10*Q);
    return chosen.map(key=>({key,value:Math.round(base*scale*10000)/10000}));
  }
  function decorate(skill,args){
    if(args.category==='持续伤害')return {...skill,damageNature:skill.damageNature||(/毒/.test([args.soul.name,args.soul.attribute,(args.soul.elements||[]).join('')].join(''))?'poison':'residual')};
    if(!['强化','减益'].includes(args.category)||args.npcTemplate)return skill;
    const seed=args.effectSeed||[args.soul.id,args.index,args.years,args.category,args.variant||0,args.style].join('|');
    const effects=args.effects?.length?args.effects.map(e=>({...e})):generate({seed,style:args.style,channel:skill.channel,category:args.category,Q:skill.Q});
    const s={...skill,category:args.category,effects,effectCount:effects.length,effectSeed:seed,effectRulesVersion:10,buff:0};delete s.effectVariant;
    s.name=args.soul.name+(args.category==='强化'?'·多维加持':'·多维削弱');
    s.effect=effects.map(e=>labels[e.key]+(s.category==='强化'?'提高':'降低')+(e.value*100).toFixed(2).replace(/\.?0+$/,'')+'%').join('、')+(s.category==='强化'?'；持续整场，同源不叠加':'；共享一次精神判定，持续12秒，同源不叠加');
    return s;
  }
  const api={generate,decorate,weights,labels};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessSkillEffects=api;
})(typeof globalThis==='undefined'?this:globalThis);
