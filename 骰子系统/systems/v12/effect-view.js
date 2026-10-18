(function(root){
'use strict';
const tuning=root.WitnessV12Tuning||{domainAllyAgility:.04,domainEnemyAgility:.02,domainEnemyGauge:.04};
const pct=n=>Math.round(n*10000)/100+'%',has=(u,id)=>(u.v12Traits||[]).some(t=>(t.id||t.traitId)===id);
// Read the actual runtime state. These rows never add a status or apply a modifier.
function badges(b,u){
 const rows=[],s=u.v12State||{},add=(key,name,tip,bad=false)=>rows.push({key:'v1201:'+key,name,tip,bad}),time=until=>Math.max(0,(until-b.now)/1000).toFixed(1)+'秒';
 if(!b.alive(u))return rows;
 if(has(u,'frost-moss-immunity'))add('mossImmune','霜苔不侵','冰属性伤害转为生命；免疫迟缓与冻结。');
 if(has(u,'moss-armor-accumulation')&&s.mossStacks)add('moss','苔凝 '+s.mossStacks+'层','苔甲凝积：肉体＋'+pct(.05*s.mossStacks)+'，防御＋'+pct(.1*s.mossStacks)+'，额外减伤'+pct(Math.min(.15,.05*Math.floor(s.mossStacks/4)))+'；层数跨战斗保留。');
 for(const layer of u.shieldLayers||[])if(layer.label==='冰壳护生'&&(s.shellAbsorbed?.[layer.source]||0)>0)add('shell:'+layer.source,'冰壳·蓄反'+Math.round(s.shellAbsorbed[layer.source]*.3),'开战时凝成的冰壳已吸收'+Math.round(s.shellAbsorbed[layer.source])+'伤害；击破时反伤'+Math.round(s.shellAbsorbed[layer.source]*.3)+'，无视护盾。');
 const tierOf=owner=>Math.max(0,Math.min(3,(owner.v12State?.domainTier||0)));
 if(has(u,'frost-domain')){const tier=tierOf(u);add('domain',s.domainSuppressed?'霜域·暂止':'霜域 '+tier+'/3档',s.domainSuppressed?'霜域被驱散压住，暂停至本次个人回合结束。':tier?'当前三档数值：敌方敏捷−'+pct(tuning.domainEnemyAgility*tier)+'、行动条速度−'+pct(tuning.domainEnemyGauge*tier)+'，友方敏捷＋'+pct(tuning.domainAllyAgility*tier)+'；'+(tier>=3?'已达三档，每次加深改为友方2%生命上限寒冰护盾、敌方2%生命上限伤害。':'再加深'+(3-tier)+'档到达上限。'):'霜域已展开：每个自身回合加深一档（敌方敏捷−2%、行动条速度−4%，友方敏捷＋4%）；三档后每次加深改为友方2%生命上限寒冰护盾、敌方2%生命上限伤害。',!!s.domainSuppressed);}
 for(const owner of b.units.filter(o=>b.alive(o))){
  if(has(owner,'frost-domain')&&!owner.v12State?.domainSuppressed&&owner!==u){const tier=tierOf(owner);if(tier){if(owner.team===u.team)add('domain:'+owner.id,'霜域·疾行＋'+pct(tuning.domainAllyAgility*tier),'来源 '+owner.name+'；友方敏捷提高'+pct(tuning.domainAllyAgility*tier)+'（每档4%），三档后每次加深提供2%生命上限寒冰护盾。');else add('domain:'+owner.id,'霜域·迟滞','来源 '+owner.name+'；敏捷降低'+pct(tuning.domainEnemyAgility*tier)+'，行动条速度降低'+pct(tuning.domainEnemyGauge*tier)+'（每档敏捷2%、行动条4%，最多三档）；三档后每次加深额外承受2%生命上限伤害。',true);}}
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
 const ordinary=(u.v12Traits||[]).filter(t=>(t.traitId||t.id||'').startsWith('tt-'));
 for(const raw of ordinary){const trait=root.WitnessV12.soulbone.effects.upgrade(raw);const id=trait.traitId||trait.id,ts=u.ttState||{};let name=trait.name;
  if(id==='tt-thorn')name+=' '+(ts.stacks||0)+'/3';
  if(id==='tt-dragon')name+=u.hp<=u.model.derived.HP*.5?'·生效':'·潜伏';
  if(id==='tt-reserve')name+=ts.reserveUsed?'·已消耗':'·待命';
  if(id==='tt-shell')continue; // Actual shield layer already has its own displayed value.
  add(id,name,trait.effect);
 }
 const fieldOwners=b.units.filter(o=>b.alive(o)&&has(o,'tt-field'));for(const team of [u.team,1-u.team]){const owner=fieldOwners.find(o=>o.team===team);if(owner&&owner!==u)add('tt-field:'+team,team===u.team?'薄霜·疾行':'薄霜·迟滞','来源 '+owner.name+'；'+(team===u.team?'敏捷提高6%。':'敏捷降低3%，行动速度降低6%。'),team!==u.team);}
 for(const st of b.status(u,'ttGaugeDown'))add('tt-shadow:'+st.source,'影缠·迟行','行动速度降低5%；剩余'+time(st.until)+'。',true);
 rows.push(...(root.WitnessV125Beasts?.badges(b,u)||[]));
 return rows;
}
root.WitnessV12Effects={badges};
})(globalThis);
