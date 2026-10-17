(function(root){
'use strict';
const pct=n=>Math.round(n*10000)/100+'%',has=(u,id)=>(u.v12Traits||[]).some(t=>(t.id||t.traitId)===id);
// Read the actual runtime state. These rows never add a status or apply a modifier.
function badges(b,u){
 const ice=(root.WitnessV12.battle.skillAttributes.attributeTags(u.soul)).includes('冰'),rows=[],s=u.v12State||{},add=(key,name,tip,bad=false)=>rows.push({key:'v1201:'+key,name,tip,bad}),time=until=>Math.max(0,(until-b.now)/1000).toFixed(1)+'秒';
 if(!b.alive(u))return rows;
 if(has(u,'frost-moss-immunity'))add('mossImmune','霜苔不侵','冰属性伤害转为生命；免疫迟缓与冻结。');
 if(has(u,'moss-armor-accumulation')&&s.mossStacks)add('moss','苔凝 '+s.mossStacks+'层','苔甲凝积：肉体＋'+pct(.05*s.mossStacks)+'，防御＋'+pct(.1*s.mossStacks)+'，额外减伤'+pct(Math.min(.15,.05*Math.floor(s.mossStacks/4)))+'；层数跨战斗保留。');
 for(const layer of u.shieldLayers||[])if(layer.label==='冰壳护生'&&(s.shellAbsorbed?.[layer.source]||0)>0)add('shell:'+layer.source,'冰壳·蓄反'+Math.round(s.shellAbsorbed[layer.source]*.3),'此层已吸收'+Math.round(s.shellAbsorbed[layer.source])+'伤害；破碎时反伤'+Math.round(s.shellAbsorbed[layer.source]*.3)+'，无视护盾。');
 if(s.iceAgility)add('iceSpeed','霜域·冰敏＋'+pct(s.iceAgility*.05),'本单位在霜域中累计'+s.iceAgility+'次个人回合，敏捷提高'+pct(s.iceAgility*.05)+'，持续本场。');
 if(has(u,'frost-domain'))add('domain',s.domainSuppressed?'霜域·暂止':'霜域',s.domainSuppressed?'霜域被驱散，暂停至本次个人回合结束。':'场地持续生效：冰属性积累敏捷；非冰属性承受行动与读条减速。',!!s.domainSuppressed);
 for(const owner of b.units.filter(o=>b.alive(o))){
  if(has(owner,'frost-domain')&&!owner.v12State?.domainSuppressed&&!ice&&!has(u,'frost-moss-immunity')){const tier=Math.min(2,Math.floor((owner.v12State?.turns||0)/2));add('domain:'+owner.id,'霜域·迟滞','来源 '+owner.name+'；读条速度降低'+pct([.2,.275,.35][tier])+'，行动速度降低'+pct([.15,.2,.25][tier])+'；随其个人回合增强。',true);}
  if(owner.npcId==='chengliang'){
   const n=owner.v12NPC?.grid?.enemies?.[u.id]||0;if(n&&!has(u,'frost-moss-immunity'))add('grid:'+owner.id,'困阵 '+n+'层','来源 '+owner.name+'·周天格阵；敏捷降低'+pct(.05*n)+'；每3个有效个人回合随阵法转位折半。',true);
   if(owner.v12NPC?.vision?.gazeTargetId===u.id)add('gaze:'+owner.id,'日月凝视','来源 '+owner.name+'；其对你命中＋8个百分点，你对其伤害＋10%。',true);
  }
  if(owner.npcId==='xutaiping'&&owner.team!==u.team){const n=owner.v12NPC?.lampOut?.stacks?.[u.id]||0;if(n)add('lamp:'+owner.id,'灯灭 '+n+'/3','来源 '+owner.name+'；每个人回合首次增益、治疗、护盾、回魂减半；满3层后下一次失效并清层。',true);const group=owner.v12NPC?.blackErosion?.groups?.[u.id];if(group&&!group.resolved&&!group.dissipated)add('black:'+owner.id,'黑蚀·余灯'+group.lamps,'来源 '+owner.name+'；剩余'+group.lamps+'盏，灌注'+group.elapsed.toFixed(1)+'秒；三灯俱灭后施加整场迟缓与虚弱。',true);}
 }
 for(const [id,t]of Object.entries(s.tides||{}))if(t.until>b.now&&!has(u,'frost-moss-immunity'))add('tide:'+id,'沧澜压境 '+t.stacks+'层','来源 '+(b.unit(id)?.name||id)+'；读条速度降低'+pct(Math.min(.9,.2*t.stacks))+'，行动速度降低'+pct(Math.min(.9,.15*t.stacks))+'；剩余'+time(t.until)+'。',true);
 if(s.costPressure)add('cost','沧澜·耗魂＋30%','本次个人回合魂力消耗提高30%，行动结算后消退。',true);
 if(has(u,'devouring-soul-recovery'))add('siphon',s.sealed?'吞噬回魂·封锁':'吞噬回魂',s.sealed?'本周期吞噬与周期回魂被封锁。':'吸收场内实际魂力消耗的30%，回合末回魂8%；溢出转盾，本回合已转'+Math.round(s.overflow||0)+'。',!!s.sealed);
 if(u.npcId==='chengliang'){const n=u.v12NPC?.grid?.self||0,q=u.v12NPC?.regen?.thiefQi||0;if(n)add('stand','据阵 '+n+'层','周天格阵：伤害提高'+pct(n*.1)+'；每3个有效回合转位折半。');if(q)add('qi','盗气 '+q+'层','六库仙贼：肉体强度提高'+pct(q*.1)+'，跨战斗保留。');add('regen','六库仙贼·生息','每个人回合结束回复最大生命5%、最大魂力5%；对有生命目标造成实际生命伤害时吸血30%。');if(u.v12NPC?.vision?.gazeTargetId)add('gazeRisk','凝视·承伤＋10%','易中日月：凝视对象对程良伤害提高10%；其对该对象命中提高8个百分点。',true);}
 if(u.npcId==='sailiya_fengzhi'){const p=u.v12NPC;if(p?.rune?.active&&(u.cast||u.v12Channel))add('rune','承露符锋·符剑','本次攻击已额外付费'+p.rune.extraCost+'魂力；附伤30%，目标实际魂力抵挡费用翻倍。');add('secret',p?.secretOrigin?.sealed?'秘元·封锁':'秘元归宿体','每个人回合结束回魂5%；本周期已凝待回魂'+Math.round(p?.secretOrigin?.pending||0)+'。',!!p?.secretOrigin?.sealed);if(p?.charge?.charges)add('charge','化羽华 '+p.charge.charges+'枚','后续攻击魂技每次消耗1枚，主攻击伤害提高15%。');}
 if(u.npcId==='xutaiping')add('deepDark','深暗','施加的数值削弱幅度提高50%；目标已有她的有效削弱时提高80%，不延长时长。');
 if(u.v12Channel)add('dance','天阑舞·余'+u.v12Channel.left+'段','维持剑舞，每段独立结算，受控则中断。');
 if(s.reserve?.until>b.now)add('reserve','蓄势 '+Math.round(s.storedEnergy||0),'下一次攻击魂技命中时释放已储能量；剩余'+time(s.reserve.until)+'。');
 const labels={v12Accuracy:'后续攻击命中',v12Cast:'后续攻击读条倍率',v12Evasion:'一次闪避',v12Vulnerability:'队友追击易伤'};
 for(const st of b.status(u,'v12Stats'))add('stats:'+st.source,st.label||'属性增幅',Object.entries(st.values||{}).map(([key,n])=>(root.WitnessRules.LABELS[key]||key)+'＋'+pct(n*(st.value??1))).join('、')+'；来源 '+(st.from||st.source)+'。');
 for(const [type,label]of Object.entries(labels))for(const st of b.status(u,type))add(type+':'+st.source,label+(type==='v12Cast'?'×'+st.value:' '+pct(st.value)),(st.label||label)+'；来源 '+(st.from||st.source)+'；'+(st.until>1e12?'本场有效':'剩余'+time(st.until)),type==='v12Vulnerability');
 return rows;
}
root.WitnessV12Effects={badges};
})(globalThis);
