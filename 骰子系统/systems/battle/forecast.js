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
