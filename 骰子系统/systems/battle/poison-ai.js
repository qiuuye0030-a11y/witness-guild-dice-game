// PoisonStrategy: live V13 behavior; composed once by systems/battle/compose.js.
const PoisonStrategy=(function(root){
'use strict';

  const darkActionScore=function(u,t,action,score){
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

  return {methods:{darkActionScore}};
})(globalThis);
