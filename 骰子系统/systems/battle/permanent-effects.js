// PermanentEffects: live V13 behavior; composed once by systems/battle/compose.js.
const PermanentEffects=(function(root){

  const planUnderlyingAction=AttributeActions.methods.plan;
  const plan=function(u,cast,pre){
    const plan=planUnderlyingAction.call(this,u,cast,pre);if(cast.skill?.category!=='减益')return plan;
    if(cast.skill.statusLifetime==='timed'){
      plan.effects=plan.effects.map(apply=>()=>{const before=new Set(this.units.flatMap(t=>t.statuses));apply();for(const t of this.units)for(const status of t.statuses)if(!before.has(status)){status.appliedAt=this.now;status.until=this.now+Math.round(cast.skill.duration*1000);delete status.hitsRemaining;delete status.actionsRemaining;}});
      return plan;
    }
    plan.effects=plan.effects.map(apply=>()=>{const before=new Set(this.units.flatMap(t=>t.statuses));apply();for(const t of this.units)for(const status of t.statuses)if(!before.has(status)){status.until=180001;delete status.hitsRemaining;delete status.actionsRemaining;}});
    return plan;
  };

  return {methods:{plan}};
})(globalThis);
