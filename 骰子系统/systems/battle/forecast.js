// ActionForecast: live V13 behavior; composed once by systems/battle/compose.js.
const ActionForecast=(function(root){
'use strict';
const B=root.WitnessBattle;
const R=root.WitnessRules;
const attack=s=>!s||['攻击','持续伤害'].includes(s.category);
const channel=(u,s)=>s?.channel||(u.soul.spirit_specialist?'精神':'物理');
const pool=(u,ch)=>ch==='精神'?'sh':'hp';
const maximum=(u,ch)=>u.model.derived[ch==='精神'?'SH':'HP'];
  const scoreUnderlyingControl=ControlActions.methods.scoreControlVariant;
  const compactEnabled=function(u){
    return u.style==='控制'&&u.skills.some(s=>s.effectVariant)&&['timing','budget','compact'].includes(this.controlRules?.ai);
  };

  const aiStrike=function(u,t,s,at=0,defense=null){
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

  const scoreControlVariant=function(u,t,s){
    if(!this.compactEnabled(u))return scoreUnderlyingControl.call(this,u,t,s);
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

  const compactActionScore=function(u,t,action,score){
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
  return {methods:{compactEnabled,aiStrike,aiAvailable,aiSequence,aiThreatValue,scoreControlVariant,compactActionScore}};
})(globalThis);
