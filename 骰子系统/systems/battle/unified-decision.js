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
