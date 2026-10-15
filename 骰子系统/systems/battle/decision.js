// One AI decision entry: member actions, legal actions, then multi-stat value.
const BattleDecision=(function(root){
const R=root.WitnessRules;
const aiChoice=function(u){
    if(u.phantoms&&!u.bonusAttack){const foes=this.units.filter(x=>x.team!==u.team&&this.alive(x));if(!this.actionReason(u,'phantomSwap')&&u.hp/u.model.derived.HP<.35&&foes.some(x=>x.cast?.target===u.id))return {action:'phantomSwap',target:u.id,score:100};if(u.phantoms>1&&u.actions<6&&!this.actionReason(u,'phantomSacrifice'))return {action:'phantomSacrifice',target:u.id,score:30};}

    const original=u.skills;let choice;try{u.skills=original.filter(s=>!s.effects?.length);this._valuingAI=true;try{choice=BattleCore.methods.aiChoice.call(this,u);}finally{this._valuingAI=false;}}finally{u.skills=original;}if(u.bonusAttack)return choice;
    let best=choice,bestScore=Number.isFinite(choice?.score)?choice.score:0;
    for(const s of u.skills.filter(s=>s.effects?.length&&!this.actionReason(u,s.id))){for(const t of this.targetOptions(u,s.id)){
      let gain=0;for(const e of s.effects){const type=(s.category==='强化'?'statUp':'statDown')+e.key,source=this.statusSource(u,s),current=this.status(t,type).filter(x=>x.source!==source).reduce((n,x)=>n+x.value,0),own=this.status(t,type).find(x=>x.source===source)?.value||0;gain+=Math.max(0,current+e.value-(current+own))*(e.key==='A'?65:e.key==='C'?45:70);}
      let score=gain*(s.category==='减益'?.65:1)-this.cost(u,s)/u.model.derived.baseMP*12;if(s.category==='减益')score*=R.controlEffect(s.Q,this.effective(u),this.effective(t)).chance/100;
      if(score>bestScore){best={action:s.id,target:t.id,score};bestScore=score;}
    }}return best;
  };
return {methods:{aiChoice}};
})(globalThis);
