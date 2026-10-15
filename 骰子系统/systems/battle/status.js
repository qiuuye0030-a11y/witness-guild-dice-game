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
