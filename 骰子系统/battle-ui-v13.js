(() => {
  'use strict';
  const $=id=>document.getElementById(id),R=WitnessRules,B=WitnessBattle;
  const KEY='witness-battle-combined-v1203',catalog=WITNESS_CATALOG;
  let battle=null,initial=null,speed=2,auto=false,paused=false,moving=false,timer=0,uiTime=0,seenLog=0;
  const cards=new Map(),actionButtons=new Map();
  const stageHeading=$('battleStage').querySelector('.section-title h2'),stageEyebrow=$('battleStage').querySelector('.section-title .eyebrow'),stageRules=$('battleStage').querySelector('.battle-help p:last-child'),baseStageLabels={heading:stageHeading.textContent,eyebrow:stageEyebrow.textContent,rules:stageRules.textContent};
  const listeners=[];
  const basic={skipBonus:'放弃附赠普攻',attack:'普攻',dodge:'闪避',defend:'生命防守',defendSH:'精神防守',calm:'安神',focus:'聚能'};
  function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
  function hint(text){$('battleHint').textContent=text;}
  // 讨伐战的状态由主存档保存；独立战斗页才使用本机战斗缓存，避免每次心跳都序列化整场日志。
  function save(){if(!battle||document.body.classList.contains('campaign-mode')||battle.v12Battle)return;try{localStorage.setItem(KEY,JSON.stringify({version:1,snapshot:battle.snapshot(),initial,speed,auto:false}));}catch{}}
  function sample(type){
    const specs={strong:['烈火长戟','强攻',['攻击','强化','防御','攻击']],speed:['闪电隼','敏攻',['攻击','强化','控制','攻击']],control:['荆棘藤','控制',['控制','攻击','减益','持续伤害']],tank:['黄金鳄王','防御',['防御','攻击','强化','治疗']],mental:['灵眸','控制',['攻击','防御','控制','减益']],support:['三色琉璃塔','辅助',['治疗','强化','防御','回蓝']]};
    const [name,style,categories]=specs[type],soul=catalog.find(s=>s.name===name)||catalog.find(s=>s.tier===5&&s.elements?.includes(({strong:'火',speed:'雷',control:'木',tank:'土',mental:'光',support:'水'})[type])),rng=new WitnessDice.DiceEngine(WitnessCharacter.seed()+'-demo-'+type);
    const c={name:{strong:'炎锋',speed:'羽行',control:'青藤',tank:'砥山',mental:'澄视',support:'和光'}[type]+' · 测试人设',level:41,time:{month:7,age:17,startAge:14,startYear:6099,span:3,quarters:12},soulId:soul.id,style,release:soul.release_options[0],deviations:R.KEYS.map(()=>rng.die(21)-11),wDeviation:rng.die(21)-11,rings:[]};
    c.stats=R.buildStats({...c,soul});
    c.rings=categories.map((category,i)=>{const years=Math.floor(R.CAPS[i]*.6);return {index:i+1,years,skills:[R.makeSkill({soul,style,stats:c.stats,index:i+1,years,category})]};});
    return {character:c,soul};
  }
  function enemyBrief(){
    const t=B.templates.find(t=>t.id===$('battleEnemy').value);if(!t)return;
    $('enemyBrief').replaceChildren(el('strong',`${t.name} · ${t.weapon} · ${t.tier}档`),el('p',t.note));
    $('enemySkillDetails').replaceChildren();const preview=B.templateUnit(t,41,'preview',1);for(const [i,s]of preview.skills.entries())$('enemySkillDetails').append(el('p',`${i+1}. ${s.name} · ${WitnessSkillText.describe(s,{unit:preview})}`));
  }
  for(const t of B.templates.filter(t=>!t.support))$('battleEnemy').append(new Option(t.name+' · '+t.weapon,t.id));$('battleEnemy').onchange=enemyBrief;enemyBrief();
  for(const n of [1,2,4,8,0]){const b=el('button',n?n+'×':'即时');b.type='button';b.dataset.speed=n;b.onclick=()=>{speed=n;renderToolbar();save();};$('battleSpeeds').append(b);}
  function makeCards(){
    cards.clear();$('teamFriendly').replaceChildren();$('teamEnemy').replaceChildren();$('fxLayer').replaceChildren();
    for(const u of battle.units){
      const card=el('article',undefined,'actor-card '+(u.id==='player'?'player-card':''));card.id='actor-'+u.id;card.classList.add(u.team?'hostile-card':'friendly-card');
      const portrait=el('div',undefined,'actor-portrait');
      if(u.portrait&&window.WitnessPortraits?.[u.portrait]){const img=el('img');img.src=WitnessPortraits[u.portrait];img.alt=u.name+'立绘';portrait.append(img);}
      else{portrait.append(el('span',u.templateId==='hash'?'⌬':u.soul.spirit_specialist?'◉':u.style==='辅助'?'❀':u.style==='防御'?'◇':'⚔','portrait-symbol'));}
      const name=el('strong',u.name,'actor-name'),subtitle=el('span',`${u.soul.name} · ${u.soul.tier}档 · ${u.level}级`,'actor-subtitle');
      const bars=el('div',undefined,'actor-bars'),barMap={};
      for(const [key,label,max]of [['hp','生命',u.model.derived.HP],['mp','魂力',u.model.derived.MP],['sh','精神',u.model.derived.SH]]){const wrap=el('div',undefined,'actor-bar '+key),line=el('div',undefined,'bar-label'),v=el('span');line.append(el('span',label),v);const track=el('div',undefined,'bar-track'),fill=el('i');const shield=el('b',undefined,'shield-overlay');track.append(fill,shield);wrap.append(line,track);bars.append(wrap);barMap[key]={v,fill,shield,max};}
      const cast=el('div',undefined,'actor-cast'),castFill=el('i'),castText=el('span');cast.append(castFill,castText);
      const statuses=el('div',undefined,'actor-statuses');card.append(portrait,name,subtitle,bars,cast,statuses);const stateDetail=el('details',undefined,'combat-state-detail'),passives=el('details',undefined,'combat-passives');stateDetail.append(el('summary','战斗状态 · 展开详情'),el('div'));passives.append(el('summary','被动与固有特性'),el('div'));card.append(stateDetail,passives);
      (u.team===0?$('teamFriendly'):$('teamEnemy')).append(card);const rating=el('span',u.displayRating||R.rating(u.model).label,'combat-rating');rating.title=R.rating(u.model).basis;card.append(rating);cards.set(u.id,{card,portrait,bars:barMap,castText,castFill,statuses,stateDetail,passives});
    }
    $('battleArena').classList.add('has-battle');let roller=$('actionRoller');if(!roller){roller=el('div',undefined,'action-roller');roller.id='actionRoller';$('battleArena').prepend(roller);}roller.replaceChildren(el('span','下一次行动 →','roller-label'));for(const u of battle.units){const ball=el('button',u.name.startsWith('欧阳')?'欧阳':u.name[0],'action-ball '+(u.team?'enemy-ball':'ally-ball'));ball.id='ball-'+u.id;ball.type='button';ball.title=u.name+' · 敏捷 '+u.model.stats.A;roller.append(ball);}
  }
  function action(action){
    if(!battle||battle.result||paused)return;const u=battle.unit('player');
    const options=battle.targetOptions(u,action),selected=$('battleTarget').value;
    const target=options.find(t=>t.id===selected)||options[0];if(!target){hint('没有合法目标');return;}
    $('battleTarget').value=target.id;
    const reason=battle.command('player',action,target.id);if(reason){hint(reason);return;}
    moving=true;hint('正在推进读条，等待下一次行动机会。');run();update();
  }
  function makeActions(){
    actionButtons.clear();$('basicActions').replaceChildren();$('battleSkillButtons').replaceChildren();
    for(const [id,name]of Object.entries(basic)){if(id==='focus'&&!battle.v12Battle)continue;const b=el('button',name,'quiet');b.type='button';b.onclick=()=>action(id);$('basicActions').append(b);actionButtons.set(id,b);}
    for(const s of battle.unit('player').skills){const b=el('button',undefined,'battle-skill');b.type='button';const summary=el('small',WitnessSkillText.describe(s,{battle,unit:battle.unit('player')}));b.append(el('strong',s.name),summary);b._summary=summary;b.onclick=()=>action(s.id);const cooldown=el('em');b.append(cooldown);b._cooldown=cooldown;$('battleSkillButtons').append(b);actionButtons.set(s.id,b);}
    $('battleTarget').replaceChildren();for(const u of battle.units)$('battleTarget').append(new Option((u.team?'敌方 · ':'我方 · ')+u.name,u.id));$('battleTarget').value='enemy';$('battleTarget').disabled=false;$('battleTarget').onchange=()=>update();
  }
  function displayFX(event){
    if(speed===0||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const target=cards.get(event.target),source=cards.get(event.actor),layer=$('fxLayer');if(!target)return;
    if(['damage','heal','control','miss','resist'].includes(event.type)){const n=el('span',event.type==='damage'?(event.periodic?(event.damageNature==='poison'?'毒伤 −':'残伤 −'):(event.fx==='poison'?'毒蚀 −':'−'))+event.amount:event.type==='heal'?'恢复':event.type==='control'?'受控':event.type==='resist'?'抵抗':'闪避','floating-number '+(event.channel==='精神'?'mental-number':''));const arena=$('battleArena').getBoundingClientRect(),r=target.portrait.getBoundingClientRect();n.style.left=(r.left-arena.left+r.width/2)+'px';n.style.top=(r.top-arena.top+40)+'px';layer.append(n);setTimeout(()=>n.remove(),1000);target.card.classList.add(event.type==='damage'?'taking-hit':'casting-glow');setTimeout(()=>target.card.classList.remove('taking-hit','casting-glow'),450);}
    if(event.type==='release'&&source){const arena=$('battleArena').getBoundingClientRect(),a=source.portrait.getBoundingClientRect(),b=target.portrait.getBoundingClientRect(),word=el('span',event.label||'攻击','attack-word fxword-'+(event.fx||'wave'));word.style.left=(a.left-arena.left+a.width/2)+'px';word.style.top=(a.top-arena.top+a.height/2)+'px';word.style.setProperty('--fly-x',(b.left-a.left)+'px');word.style.setProperty('--fly-y',(b.top-a.top)+'px');layer.append(word);setTimeout(()=>word.remove(),1000);}
    if(event.type==='release'&&source){const arena=$('battleArena').getBoundingClientRect(),a=source.portrait.getBoundingClientRect(),b=target.portrait.getBoundingClientRect(),x1=a.left-arena.left+a.width/2,y1=a.top-arena.top+a.height/2,x2=b.left-arena.left+b.width/2,y2=b.top-arena.top+b.height/2;const beam=el('div',undefined,'fx-beam fx-'+(event.fx||'wave'));beam.style.left=x1+'px';beam.style.top=y1+'px';beam.style.width=Math.max(45,Math.hypot(x2-x1,y2-y1))+'px';beam.style.transform=`rotate(${Math.atan2(y2-y1,x2-x1)}rad)`;layer.append(beam);setTimeout(()=>beam.remove(),1050);}
  }
  function renderToolbar(){
    for(const b of $('battleSpeeds').children){b.classList.toggle('active',+b.dataset.speed===speed);b.setAttribute('aria-pressed',String(+b.dataset.speed===speed));}
    const active=!!battle&&!battle.result;$('autoBattle').disabled=!active;$('pauseBattle').disabled=!active||(!moving&&!paused);$('retryBattle').disabled=!!battle?.v12Battle||!initial||!!document.body.classList.contains('campaign-mode')&&(!battle?.result||!!window.WitnessFullGame?.get()?.state.exam?.badEnding||window.WitnessFullGame?.get()?.state.phase==='ending');$('surrenderBattle').disabled=!active;$('exportBattle').disabled=!battle;
    $('autoBattle').textContent=auto?'切回手动':'自动演示';$('pauseBattle').textContent=paused?'继续':'暂停';
  }
  function update(){
    if(!battle)return;stageHeading.textContent=battle.v12Battle?'讨伐之战 · 十万年魂兽':baseStageLabels.heading;stageEyebrow.textContent=battle.v12Battle?'击败魂兽，方可获得魂环与魂骨':baseStageLabels.eyebrow;stageRules.textContent=battle.v12Battle?'讨伐没有180秒限制。任一方全体退场时结算；连续10秒无人能使用攻击或魂技则中止，未完成的长读条不会被误判。每次讨伐最多挑战3次，失败不发战利品，重试沿用同一魂兽与援军。':baseStageLabels.rules;$('battleClock').textContent=(battle.now/1000).toFixed(1)+(battle.v12Battle?' 秒 · 讨伐无时限':' / 180.0 秒');
    for(const u of battle.units){const c=cards.get(u.id);if(!c)continue;c.card.classList.toggle('fallen',!battle.alive(u));
      for(const key of ['hp','mp','sh']){c.bars[key].max=u.model.derived[{hp:'HP',mp:'MP',sh:'SH'}[key]];c.bars[key].v.textContent=Math.max(0,Math.round(u[key]))+' / '+c.bars[key].max;c.bars[key].fill.style.width=Math.max(0,u[key]/c.bars[key].max*100)+'%';const shield=key==='hp'?u.shieldHP:key==='sh'?u.shieldSH:0;c.bars[key].shield.style.left=Math.min(100,u[key]/c.bars[key].max*100)+'%';c.bars[key].shield.style.width=Math.min(100-u[key]/c.bars[key].max*100,shield/c.bars[key].max*100)+'%';c.bars[key].shield.style.transform=shield&&u[key]===c.bars[key].max?'translateX(-100%)':'';if(shield&&u[key]===c.bars[key].max)c.bars[key].shield.style.width=Math.min(100,shield/c.bars[key].max*100)+'%';c.bars[key].shield.title='额外护盾 '+shield;if(shield)c.bars[key].v.textContent+=' +盾'+shield;}
      if(u.cast){c.castText.textContent=(u.cast.skill?.name||basic[u.cast.action]||'行动')+' '+Math.max(0,(u.cast.end-battle.now)/1000).toFixed(1)+'s';c.castFill.style.width=Math.max(0,(battle.now-u.cast.start)/(u.cast.end-u.cast.start)*100)+'%';}
      else{c.castText.textContent=!battle.alive(u)?'已退场':battle.value(u,'control')?'受控':u.readyAt>battle.now?'回气中':'等待行动';c.castFill.style.width='0%';}
      const badges=[];const add=(key,name,tip,bad=false)=>badges.push({key,name,tip,bad});
      for(const [key,name]of [['attackBoost','攻击增幅'],['agility','敏捷提升'],['evasion','闪避'],['defDown','削防'],['mindDown','精神削弱'],['control','受控'],['fatigue','疲劳'],['dotBoost','毒素激化'],['slow','减速'],['costUp','消耗增加'],['agilityDown','敏捷降低'],['damageDown','伤害降低'],['accuracyDown','命中率降低']]){const statuses=battle.status(u,key);if(statuses.length){const st=statuses.reduce((a,b)=>b.value>a.value?b:a),percent=Math.round(Math.min(battle.stackCap(key),battle.value(u,key))*100),details=statuses.map(s=>(s.from?s.from+'·':'')+(s.label||name)+' '+Math.round(s.value*100)+'%／'+(s.actionsRemaining!==undefined?s.actionsRemaining+'动作':(battle.v12Battle?s.until>1e12:s.until>=180001)?'整场':Math.max(0,(s.until-battle.now)/1000).toFixed(1)+'秒')+(s.hitsRemaining!==undefined?'／'+s.hitsRemaining+'次攻击':'')).join('；');add(key,name+(key==='control'?'':percent+'%'),`${name}：${key==='control'?'无法行动':percent+'%'}，剩余 ${(battle.v12Battle?st.until>1e12:st.until>=180001)?'整场':Math.max(0,(st.until-battle.now)/1000).toFixed(1)+' 秒'}${st.hitsRemaining!==undefined?'；剩余'+st.hitsRemaining+'次攻击':''}；来源：${details}`,['defDown','mindDown','control','fatigue','slow','costUp','agilityDown','damageDown','accuracyDown'].includes(key));}}
      for(const badge of WitnessUIV14.shieldBadges(battle,u))add(badge.key,badge.name,badge.tip,badge.bad);
      // Each guard belongs to its own shield layer and is displayed above.
      if(u.immuneUntil>battle.now)add('immune','免控','免疫控制，剩余 '+((u.immuneUntil-battle.now)/1000).toFixed(1)+' 秒');
      if(u.rage)add('rage','霸气 '+u.rage,'霸刀斩消耗最多3层提高威力');
      if(battle.value(u,'activeDodge'))add('activeDodge','主动闪避',`消耗${battle.dodgeCost(u)}点魂力；仅回避直接生命攻击与持续伤害的施加，不清除已附着伤害。`);
      for(const key of R.KEYS)for(const [type,sign]of [['statUp','＋'],['statDown','−']]){const states=battle.status(u,type+key);if(states.length)add(type+key,R.LABELS[key]+sign+Math.round(Math.min(type==='statDown'?1:Infinity,states.reduce((n,s)=>n+s.value,0))*100)+'%',states.map(s=>s.from+'·'+s.label).join('；'),type==='statDown');}
      for(const dot of u.dots)add('dot-'+dot.key,(battle.dotLabel(dot))+' '+dot.damage+'×'+dot.ticks,`来源 ${battle.unit(dot.source)?.name}；每跳 ${dot.damage} ${dot.channel}伤害，余 ${dot.ticks} 跳，下一跳 ${Math.max(0,(dot.next-battle.now)/1000).toFixed(1)}秒`,true);
      if(u.release==='召唤')add('pet',u.petAlive?'召唤体 '+u.petHP:'召唤体败退','召唤体和本体共享行动机会');
      const modernLabels={goldBlade:'叶刃·物理攻击提升20%',goldBurn:'叶燃·能量攻击提升25%',goldHand:'黄金左手·叶势提升15%',pursuit:'追势·整体增速30%',frostCastSlow:'冰结·魂技读条迟缓',preDR:'防御前免伤',qinyanForm:'乌拉诺斯',mentalRecovery:'精神蓄养',phaseSwap:'置换保险',iceCrown:'冰棘王冠'};
      for(const [key,name]of Object.entries(modernLabels))if(battle.status(u,key).length)add('modern-'+key,name,battle.status(u,key).map(st=>(st.label||key)+' · '+Math.round(st.value*100)+'% · '+((battle.v12Battle?st.until>1e12:st.until>=180001)?'本场':Math.max(0,(st.until-battle.now)/1000).toFixed(1)+'秒')).join('；'),key==='frostCastSlow');
      const traitBadges=window.WitnessV12Effects?.badges(battle,u)||[];for(const row of traitBadges)add(row.key,row.name,row.tip,row.bad);const stateRows=traitBadges.map(row=>row.name+' · '+row.tip);for(const st of u.statuses){const source=st.from||st.source||'系统',remaining=st.actionsRemaining!==undefined?st.actionsRemaining+'次动作':(battle.v12Battle?st.until>1e12:st.until>=180001)?'本场':Math.max(0,(st.until-battle.now)/1000).toFixed(1)+'秒';stateRows.push((st.label||modernLabels[st.type]||st.type)+' · '+(Number.isFinite(st.value)&&(/^(statUp|statDown)/.test(st.type)||['pursuit','preDR','frostCastSlow','iceCrown',...(window.WitnessStackRules?.numeric||[])].includes(st.type))?Math.round(st.value*100)+'%':'')+(st.stacks?' · '+st.stacks+'层':'')+' · '+remaining+(st.levelLimit!==undefined?' · 超出'+st.levelLimit+'级的攻击按阶差衰减':'')+' · 来源 '+source);}
      for(const [i,until]of (u.modern?.overheat||[]).entries())if(until>battle.now)stateRows.push((i?'右':'左')+'臂过热 · '+((until-battle.now)/1000).toFixed(1)+'秒');
      c.stateDetail.lastElementChild.replaceChildren(...(stateRows.length?stateRows:['当前没有额外状态']).map(text=>el('p',text,'micro')));
      const passiveRows=[];const ownTraits=[...(u.traits||[]),...(u.v12Traits||[])],seenTraits=new Set();for(const trait of ownTraits){if(!trait.name||seenTraits.has(trait.name))continue;seenTraits.add(trait.name);passiveRows.push(trait.name+'：'+trait.effect);}
      if(u.scarred)passiveRows.push('事象洞穿：攻击魂技与普攻费用为正常两倍，无视目标防御、护盾与魂力护体；命中仍正常判定。','祥光：登台时获得等于最大生命的持久生命护盾。','多识：生命与精神双槽互相承伤，仅双槽清空退场；生命归零时魂技免费，普攻仍按两倍费用，魂力容量为同数值角色三倍。','幽行：非精神伤害穿过护盾后，九成转为魂力消耗、一成扣生命；魂力不足部分继续扣生命，生命空时转扣精神。','剑光蛰伏 '+u.scarred.swords.length+' / 3道；虚影之纱'+(u.scarred.veil?'潜行蓄能中':'未生效')+'。');
      if(u.guildmaster)passiveRows.push('霜棘蚀步：每次有效出手为敌方累计10%敏捷削弱，无命中或豁免判定。','冰结蚀脉：越盾扣除本体生命上限5%的生命；生命上限不变。','银岭遗御：剩余'+u.guildmaster.legendaryRemaining+'次控制免疫。','双重龙化：覆冰常驻；真身'+(u.guildmaster.transformed?'已启动':'尚未触发（抗性耗尽或生命低于60%）'));
      if(u.templateId==='qinyan')passiveRows.push('极光锚点：能量体特性不等于秦衍本人免疫物理伤害。','半能量化保留原生命上限；修补与刺斩抗性仅在形态内生效。');
      if(u.templateId==='hash')passiveRows.push('虚像没有攻击能力；虚能抵消仅作用于能量通道。');
      if(u.templateId==='linshi')passiveRows.push('光缚：控制成功后有限吸蓝，至多目标当前魂力8%且不超过基础魂力6%；有限转化次数 '+(u.modern?.lightConversions||0)+' / 2；不会增加魂力上限。');if(u.templateId==='anjingwen')passiveRows.push('叶刃与叶燃互斥，切换形态立即解除上一形态。','护臂吸附／推送：仅保留原设，不额外产生对人控制。');
      if(u.templateId==='anmu')passiveRows.push('毒效转化：部分精神攻击参与毒伤，毒仍扣生命。');
      c.passives.hidden=passiveRows.length===0;c.passives.lastElementChild.replaceChildren(...passiveRows.map(text=>el('p',text,'micro')));
      for(const node of Array.from(c.statuses.children))if(!badges.some(x=>x.key===node.dataset.key))node.remove();
      for(const badge of badges){let node=Array.from(c.statuses.children).find(n=>n.dataset.key===badge.key);if(!node){node=el('span');node.dataset.key=badge.key;node.tabIndex=0;c.statuses.append(node);}node.textContent=badge.name;node.title=badge.tip;node.dataset.tip=badge.tip;node.className=badge.bad?'status-negative':'status-positive';}

    }
    for(const u of battle.units){const ball=$('ball-'+u.id);ball.style.left=(8+u.progress*66)+'%';ball.style.top=(u.team?42:9)+'px';ball.classList.toggle('current',u.id===battle.activeId);ball.classList.toggle('fallen',!battle.alive(u));ball.title=u.name+' · 敏捷 '+Math.round(battle.effective(u).A)+' · '+(u.id===battle.activeId?'当前回合':u.progress>=1?'已准备':'积累行动');}
    const player=battle.unit('player');battle.settleManualExhaustion({manual:!auto&&!paused,campaignExam:!!initial?.campaignExam&&document.body.classList.contains('campaign-mode')});for(const [id,b]of actionButtons){const reason=battle.actionReason(player,id);b.disabled=!!reason||!!battle.result||paused||auto;if(id==='dodge'){b.textContent='闪避 · '+battle.dodgeCost(player)+'魂力';b.title=reason||'占用行动机会，提高生命攻击回避率；精神攻击和已附着持续伤害不受影响。受控时失效。';}if(id==='focus'){b.textContent='聚能 · +'+Math.round(player.model.derived.MP*.1)+'魂力';b.title=reason||'0耗蓝，占一次正常行动，读条3秒，回复最大魂力的10%；满蓝、受控、读条中或魂力被封锁时不可用。';}if(b._cooldown){const skill=player.skills.find(s=>s.id===id);const selected=battle.targetOptions(player,skill.id).find(t=>t.id===$('battleTarget').value);b._summary.textContent=WitnessSkillText.describe(skill,{battle,unit:player,target:selected});const remain=Math.max(0,battle.cooldownUntil(player,skill)-battle.now)/1000;b._cooldown.textContent=remain?'冷却 '+remain.toFixed(1)+'s':reason||'';}}
    while(seenLog<battle.log.length){const l=battle.log[seenLog++],row=el('div',undefined,'battle-log-line');row.append(el('time',(l.time/1000).toFixed(1)+'s'),el('span',l.text));$('battleLog').append(row);displayFX(l);}
    $('battleLogCount').textContent=battle.log.length+' 条';$('battleLog').scrollTop=$('battleLog').scrollHeight;
    if(battle.result){moving=false;paused=false;auto=false;const result=battle.result;$('battleOutcome').hidden=false;$('battleOutcome').className='battle-outcome '+(result.winner===0?'victory':result.winner===1?'defeat':'draw');$('battleOutcome').replaceChildren(el('strong',battle.v12Battle?(result.winner===0?'讨伐成功':result.winner===null?'讨伐中止':'讨伐失利'):(battle.postGameChallenge||document.body.classList.contains('battle-lab'))?(result.winner===0?'切磋胜利':result.winner===1?'本场落败':'切磋平局'):(result.winner===0?'转正成功 · 领取会徽':result.winner===1?'本场未通过':'切磋平局')),el('p',`${(result.time/1000).toFixed(1)}秒 · ${result.reason}。${battle.v12Battle?'返回讨伐页查看剩余挑战次数与战报。':battle.postGameChallenge?'追加挑战已结算，返回结局查看剩余机会。':document.body.classList.contains('battle-lab')?'可原局重试，比较不同打法。':result.winner===0?'你已成为见证者公会正式会员。':'可以原局重试，改变释放顺序与目标。'}`));hint(battle.v12Battle?'本场已结束，请在讨伐页选择再次挑战或导出战报。':'本场已结束，可原局重试或导出战报。');save();}
    renderToolbar();
    for(const fn of listeners)fn(battle);
  }
  function start(options){
    if(window.WitnessFullGame?.beforeBattleStart&&!window.WitnessFullGame.beforeBattleStart(options))return;
    clearTimeout(timer);initial=JSON.parse(JSON.stringify(options));battle=new B.Battle(options);auto=false;paused=false;moving=true;seenLog=0;cards.clear();$('battleLog').replaceChildren();$('battleOutcome').hidden=true;makeCards();makeActions();update();save();hint('斗魂台已开启。等待敏捷行动回合，选择技能和目标，或点击自动演示。');run();
  }
  function frame(){
    if(!battle||battle.result||paused||!moving)return;
    const player=battle.unit('player');
    let iterations=speed===0?220:1;
    while(iterations--&&battle&&!battle.result&&moving&&!paused){
      if(!auto&&battle.canAct(player)){moving=false;hint('轮到你选择下一步。');break;}
      let target=battle.now+(speed===0?1000:50*speed);
      // Battle.tick stops exactly when the player's action opportunity is ready.
      battle.tick(target,auto);
      if(!auto&&battle.canAct(player)){moving=false;hint('轮到你选择下一步。');}
    }
    update();if(++uiTime%5===0)save();if(moving&&!battle.result&&!paused)timer=setTimeout(frame,speed===0?0:50);
  }
  function run(){clearTimeout(timer);timer=setTimeout(frame,0);}
  $('startDemo').onclick=()=>{
    if(!WitnessCharacter.changeAllowed()){hint('请先等待骰子落定。');return;}
    const data=sample($('demoType').value);start({...data,enemyId:$('battleEnemy').value,withSupport:$('withSupport').checked,seed:WitnessCharacter.seed()+'-battle-'+$('demoType').value+'-'+$('battleEnemy').value});
  };
  $('startCharacter').onclick=()=>{
    if(!WitnessCharacter.changeAllowed()){hint('请先等待骰子落定。');return;}const character=WitnessCharacter.get(),soul=catalog.find(s=>s.id===character.soulId);
    if(!soul||!character.stats){hint('请先在人物区生成武魂和基础能力，或直接快速试玩。');return;}
    if(character.rings.length<character.stats.rings){hint('请先取得当前等级的全部魂环。');return;}
    start({character,soul,enemyId:$('battleEnemy').value,withSupport:$('withSupport').checked,seed:WitnessCharacter.seed()+'-battle-person-'+$('battleEnemy').value});
  };
  $('autoBattle').onclick=()=>{if(!battle||battle.result)return;auto=!auto;paused=false;moving=auto||!battle.canAct(battle.unit('player'));hint(auto?'自动演示进行中，可以随时暂停。':'已切回手动，当前读条完成后等待你的选择。');if(moving)run();update();save();};
  $('pauseBattle').onclick=()=>{if(!battle||battle.result)return;paused=!paused;hint(paused?'时间已暂停。':'继续推进读条。');if(!paused){moving=true;run();}update();save();};
  $('retryBattle').onclick=()=>{if(initial)start(initial);};
  $('surrenderBattle').onclick=()=>{if(battle&&!battle.result){battle.surrender();update();save();}};
  $('exportBattle').onclick=()=>{if(!battle)return;const payload={format:'witness-battle-report',version:1,initial,snapshot:battle.snapshot()},blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=battle.v12Battle?'见证者讨伐战报.json':battle.postGameChallenge?'见证者挑战战报.json':document.body.classList.contains('battle-lab')?'见证者切磋战报.json':'见证者转正战报.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  try{const stored=document.body.classList.contains('campaign-mode')?null:JSON.parse(localStorage.getItem(KEY)||'null');if(stored?.version===1&&stored.snapshot?.version===10&&stored.snapshot?.units&&stored.initial){initial=stored.initial;speed=[0,1,2,4,8].includes(stored.speed)?stored.speed:2;battle=new B.Battle({snapshot:stored.snapshot});paused=!battle.result;moving=!battle.result;seenLog=0;makeCards();makeActions();update();hint(battle.result?'已恢复上次战报。':'已恢复上次战斗，点击继续或原局重试。');}}catch{battle=null;initial=null;}
  function leave(){
    clearTimeout(timer);paused=true;moving=false;
    const clearingV12=!!battle?.v12Battle;
    battle=null;initial=null;seenLog=0;uiTime=0;cards.clear();actionButtons.clear();
    if(clearingV12){try{localStorage.removeItem(KEY);}catch{}}
    $('battleLog').replaceChildren();$('battleOutcome').hidden=true;$('battleOutcome').replaceChildren();
    $('teamFriendly').replaceChildren();$('teamEnemy').replaceChildren();$('fxLayer').replaceChildren();
    $('basicActions').replaceChildren();$('battleSkillButtons').replaceChildren();$('battleTarget').replaceChildren();
    document.getElementById('actionRoller')?.remove();
    $('battleArena').classList.remove('has-battle');
    stageHeading.textContent=baseStageLabels.heading;stageEyebrow.textContent=baseStageLabels.eyebrow;stageRules.textContent=baseStageLabels.rules;
    $('battleClock').textContent='0.0 / 180.0 秒';$('battleLogCount').textContent='0 条';
    hint('战斗已离场；战报、结算与剩余挑战次数仍保留。');
    renderToolbar();
  }
  renderToolbar();
  window.addEventListener('pagehide',save);
  window.WitnessBattleUI={get:()=>battle,sample,start,update,leave,subscribe:fn=>listeners.push(fn),halt:()=>{clearTimeout(timer);paused=true;moving=false;},restore:(snapshot,options)=>{clearTimeout(timer);initial=JSON.parse(JSON.stringify(options));battle=new B.Battle({snapshot});auto=false;paused=!battle.result;moving=!battle.result;seenLog=0;$('battleLog').replaceChildren();$('battleOutcome').hidden=true;makeCards();makeActions();update();hint(battle.result?'已恢复战报。':'战斗已恢复，点击继续推进。');}};
})();
