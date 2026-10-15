const BattleProjection=(function(root){
  'use strict';
  const B=root.WitnessBattle, R=root.WitnessRules;
  const base={plan:ShieldActions.methods.plan,hit:MemberActions.methods.hit,tryControl:MemberActions.methods.tryControl,applyDamage:ShieldActions.methods.applyDamage,heal:BattleCore.methods.heal};
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
    const effectiveCache=new WeakMap(),effective=AttributeActions.methods.effective;
    b.effective=function(unit){
      const previous=effectiveCache.get(unit);
      if(previous&&previous.now===this.now&&previous.statuses===unit.statuses&&previous.model===unit.model)return previous.value;
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
