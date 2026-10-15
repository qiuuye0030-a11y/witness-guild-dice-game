(function(root){
  'use strict';
  function describe(skill,{battle=null,unit=null,target=null}={}){
    const cost=battle&&unit?battle.cost(unit,skill):skill.cost;
    if(!['攻击','持续伤害'].includes(skill.category)){
      const cast=battle&&unit?battle.castTime(unit,skill):skill.cast;
      return String(skill.effect||skill.category+'魂技')+' · 魂力消耗 '+Math.max(0,Math.ceil(cost||0))+(Number.isFinite(cast)?' · 读条 '+Math.round(cast*100)/100+'秒':'')+(Number.isFinite(skill.cooldown)?' · 冷却 '+skill.cooldown+'秒':'');
    }
    let damage='伤害：无';
    if(['攻击','持续伤害'].includes(skill.category)){
      let amount=null;
      if(battle&&unit){target=target||battle.targetOptions(unit,skill.id)[0];if(target)amount=Math.round(battle.aiStrike(unit,target,skill).damage);}
      if(amount!==null)damage=((skill.category==='持续伤害'||skill.damageMode==='periodic')?'预计总伤害约':'预计伤害约')+amount;
      else{
        const match=String(skill.effect||'').match(/(?:总)?原始伤害\s*(\d+(?:\.\d+)?)/);
        if(match)amount=Number(match[1]);
        else if(unit?.model){const d=unit.model.derived,power=skill.mindPower?d.MA:skill.channel==='精神'?d.MA:skill.channel==='物理'?d.PA:d.SA;amount=Math.round(((skill.category==='持续伤害'||skill.damageMode==='periodic')?1.4:1.2)*(skill.Q||1)*power*(skill.factor??1));}
        damage=((skill.category==='持续伤害'||skill.damageMode==='periodic')?'总原始伤害 ':'原始伤害 ')+(amount??'随能力变化');
      }
    }
    if((skill.category==='持续伤害'||skill.damageMode==='periodic'))damage=(skill.damageNature==='poison'||skill.fx==='poison'||/毒/.test(skill.description||skill.name||'')?'毒伤 · ':'残伤 · ')+damage;
    return damage+' · 魂力消耗 '+Math.max(0,Math.ceil(cost||0));
  }
  const api={describe};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WitnessSkillText=api;
})(typeof globalThis==='undefined'?this:globalThis);
