// Panel projections call the exact same model/skill/cost methods as combat.
(function(root){
  const B=root.WitnessBattle,R=root.WitnessRules;
  R.characterView=function(character,soul){
    const c=JSON.parse(JSON.stringify(character));c.stats=R.buildStats({...c,soul});
    const u=B.playerUnit(c,soul),b=Object.create(B.Battle.prototype);
    Object.assign(u,{hp:u.model.derived.HP,mp:u.model.derived.MP,sh:u.model.derived.SH,statuses:[],dots:[],cooldowns:{},uses:{},actions:0,modern:{sequence:0,overheat:[0,0]}});
    Object.assign(b,{units:[u],now:0,seed:'panel-preview',resourceConfig:R.getResourceConfig(),traitsEnabled:false,events:[],log:[],dodgeConfig:root.WitnessTacticsV10.config});
    const skills=u.skills.map(s=>({...s,cost:b.cost(u,s),cast:b.castTime(u,s)*(s.castMultiplier||1),previewCost:b.cost(u,s),previewCast:b.castTime(u,s)*(s.castMultiplier||1),costResolved:true}));
    return {model:u.model,unit:{...u,skills},skills,basicCost:b.basicCost(u),calculationVersion:11};
  };
})(globalThis);
