(function(root){
'use strict';
  function describeBase(skill,{battle=null,unit=null,target=null}={}){
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
  const cache=new WeakMap();
  const number=n=>Number.isFinite(Number(n))?Math.max(0,Number(n)):0;
  const rounded=n=>Math.round(number(n));
  const percent=n=>(number(n)*100).toFixed(1).replace(/\.0$/,'')+'%';
  const ownOnly=s=>!!(s?.phantomDance||s?.iceArmor||['凤舞六幻','寒锋龙躯'].includes(s?.name));
  function correctedText(text,skill){
    text=String(text||'');
    if(ownOnly(skill))text=text.replace(/自己或一名队友|自身或一名队友|自己或队友|自身或队友/g,'仅限自身');
    if(skill?.manaReturn)text=text.replace(/2%最大魂力/g,'2%基础魂力');
    return text;
  }
  function costDetails(battle,unit,skill){
    const cost=battle&&unit?battle.cost(unit,skill):skill.cost;
    let text='魂力消耗 '+Math.max(0,Math.ceil(cost||0))+' 点';
    if(unit?.model?.derived&&skill.manaReturn){
      const base=unit.model.derived.baseMP||unit.model.derived.MP;
      const gain=Math.round(base*Math.min(.02,skill.manaReturn));
      text+=' · 每次反哺至多 '+gain+' 点（基础魂力的2%，每战至多2次）';
    }
    return text;
  }
  function cardDescription(skill,unit){
    let text=(ownOnly(skill)?'仅限自身 · ':'')+correctedText(skill.description||skill.effect,skill);
    if(skill.manaReturn&&unit?.model?.derived){
      const base=unit.model.derived.baseMP||unit.model.derived.MP;
      text+=' 本等级每次反哺至多 '+Math.round(base*Math.min(.02,skill.manaReturn))+' 点。';
    }
    return text;
  }
  function signature(battle){
    // Decision-time cache only. The signature intentionally uses public state;
    // no random draws or calls to status-pruning helpers occur here.
    return JSON.stringify([battle.now,battle.activeId,battle.log?.length,battle.units.map(u=>[
      u.id,u.hp,u.sh,u.mp,u.petHP,u.petAlive,u.cast,u.statuses,u.dots,u.shieldLayers,
      u.shieldHP,u.shieldSH,u.guard,u.phantoms,u.bloodDomainUsed,u.cooldowns,u.uses
    ])]);
  }
  function forecast(battle,unit,target,skill){
    if(typeof battle.forecastAction!=='function'||!target||!battle.canAct(unit))return null;
    const sig=signature(battle);
    let entry=cache.get(battle);
    if(!entry||entry.signature!==sig){entry={signature:sig,items:new Map()};cache.set(battle,entry);}
    const key=unit.id+'|'+target.id+'|'+skill.id;
    if(!entry.items.has(key))entry.items.set(key,battle.forecastAction(unit,target,skill));
    return entry.items.get(key);
  }
  function describe(skill,{battle=null,unit=null,target=null}={}){
    const cost=costDetails(battle,unit,skill);
    const self=ownOnly(skill)?'仅限自身 · ':'';
    const attack=['攻击','持续伤害'].includes(skill.category);
    if(!battle||!unit){
      const original=correctedText(describeBase(skill,{unit}),skill);
      // The original skill card has no live target; retain its raw-damage label.
      return self+original.replace(/魂力消耗\s*\d+(?:\.\d+)?/,cost);
    }
    if(!attack){
      const cast=battle.castTime(unit,skill);
      return self+correctedText(skill.effect||skill.description||skill.category+'魂技',skill)+
        ' · '+cost+(Number.isFinite(cast)?' · 读条 '+Math.round(cast*100)/100+'秒':'')+
        (Number.isFinite(skill.cooldown)?' · 冷却 '+skill.cooldown+'秒':'');
    }
    target=target||battle.targetOptions(unit,skill.id)[0];
    const p=forecast(battle,unit,target,skill);
    if(!p)return cost+' · 轮到行动时显示命中与实际损失预测';
    if(!p.valid)return cost+' · 当前无法对该目标施放';
    const channel=skill.channel==='精神'?'sh':'hp',label=channel==='sh'?'精神':'生命';
    const conditional=p.conditional||{},expected=p.immediate||{};
    const pieces=['命中 '+percent(p.hitProbability),
      '命中后'+label+'损失约 '+rounded(conditional[channel]),
      '期望'+label+'损失约 '+rounded(expected[channel])];
    if(number(conditional.petHP)>0||number(expected.petHP)>0){
      pieces[1]='命中后召唤体损失约 '+rounded(conditional.petHP)+'／本体损失约 '+rounded(conditional.bodyHP);
      pieces[2]='期望召唤体损失约 '+rounded(expected.petHP)+'／本体损失约 '+rounded(expected.bodyHP);
    }
    if(number(conditional.shieldHP)+number(conditional.shieldSH)>0)
      pieces.push('命中后消耗护盾约 '+rounded(number(conditional.shieldHP)+number(conditional.shieldSH)));
    if(number(expected.mp)>0)pieces.push('目标期望魂力损失约 '+rounded(expected.mp));
    if(number(p.futureDOT?.damage)>0)pieces.push('预计后续持续伤害 '+rounded(p.futureDOT.damage)+'（已计命中率，未扣未来防护，不计入即时损失）');
    pieces.push(cost);
    return pieces.join(' · ');
  }
  function shieldBadges(battle,unit){
    if(typeof battle.shieldLayersFor!=='function')return [];
    const badges=[];
    for(const channel of ['生命','精神']){
      const layers=battle.shieldLayersFor(unit,channel);
      for(const [index,layer]of layers.entries()){
        const label=layer.label||layer.name||layer.skillName||layer.source||'护盾';
        const amount=rounded(layer.amount??layer.value??layer.remaining);
        const life=channel==='生命',name=life?'生命盾':'精神盾';
        const until=layer.until??layer.expiresAt;
        const duration=until>=180001||until===Infinity?'整场':Number.isFinite(until)?Math.max(0,(until-battle.now)/1000).toFixed(1)+'秒':'独立期限';
        const source=layer.from||layer.sourceName||battle.unit(layer.casterId)?.name||'';
        const order=index===0?'最先承伤':'第'+(index+1)+'层承伤';
        const once=layer.oneHit?'；本层首次承伤后消失，外层挡住全部伤害时保留':'';
        const guard=number(layer.guard)?'；本层减伤 '+percent(layer.guard):'';
        badges.push({key:'shield-layer-'+channel+'-'+(layer.id??index),
          name:name+' '+label+' '+amount+'（'+(index+1)+'）',
          tip:name+' · '+label+(source?'；施放者 '+source:'')+'；剩余 '+amount+' 点；'+order+'；剩余 '+duration+once+guard,
          bad:false});
      }
    }
    return badges;
  }

root.WitnessSkillText={describe};
root.WitnessUIV14={version:14,describe,shieldBadges,costDetails,correctedText,cardDescription,clearPreviewCache:battle=>cache.delete(battle)};
})(typeof globalThis==='undefined'?this:globalThis);
