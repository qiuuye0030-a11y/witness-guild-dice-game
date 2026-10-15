(() => {
  'use strict';
  const $=id=>document.getElementById(id),R=WitnessRules,B=WitnessBattle;
  const KEY='witness-battle-combined-v13',catalog=WITNESS_CATALOG;
  let battle=null,initial=null,speed=2,auto=false,paused=false,moving=false,timer=0,uiTime=0,seenLog=0;
  const cards=new Map(),actionButtons=new Map();
  const listeners=[];
  const basic={skipBonus:'放弃附赠普攻',attack:'普攻',dodge:'闪避',defend:'生命防守',defendSH:'精神防守',calm:'安神'};
  function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
  function hint(text){$('battleHint').textContent=text;}
  function save(){if(!battle)return;try{localStorage.setItem(KEY,JSON.stringify({version:1,snapshot:battle.snapshot(),initial,speed,auto:false}));}catch{}}
  function sample(type){
    const specs={strong:['烈火长戟','强攻',['攻击','强化','防御','攻击']],speed:['闪电隼','敏攻',['攻击','强化','控制','攻击']],control:['荆棘藤','控制',['控制','攻击','减益','持续伤害']],tank:['黄金鳄王','防御',['防御','攻击','强化','治疗']],mental:['灵眸','控制',['攻击','防御','控制','减益']],support:['三色琉璃塔','辅助',['治疗','强化','防御','回蓝']]};
    const [name,style,categories]=specs[type],soul=catalog.find(s=>s.name===name)||catalog.find(s=>type==='support'&&s.id==='T06-05'),rng=new WitnessDice.DiceEngine(WitnessCharacter.seed()+'-demo-'+type);
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
      const statuses=el('div',undefined,'actor-statuses');card.append(portrait,name,subtitle,bars,cast,statuses);
      (u.team===0?$('teamFriendly'):$('teamEnemy')).append(card);const rating=el('span',R.rating(u.model).label,'combat-rating');rating.title=R.rating(u.model).basis;card.append(rating);cards.set(u.id,{card,portrait,bars:barMap,castText,castFill,statuses});
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
    for(const [id,name]of Object.entries(basic)){const b=el('button',name,'quiet');b.type='button';b.onclick=()=>action(id);$('basicActions').append(b);actionButtons.set(id,b);}
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
    const active=!!battle&&!battle.result;$('autoBattle').disabled=!active;$('pauseBattle').disabled=!active||(!moving&&!paused);$('retryBattle').disabled=!initial||!!document.body.classList.contains('campaign-mode')&&(!battle?.result||!!window.WitnessFullGame?.get()?.state.exam?.badEnding||window.WitnessFullGame?.get()?.state.phase==='ending');$('surrenderBattle').disabled=!active;$('exportBattle').disabled=!battle;
    $('autoBattle').textContent=auto?'切回手动':'自动演示';$('pauseBattle').textContent=paused?'继续':'暂停';
  }
  function update(){
    if(!battle)return;$('battleClock').textContent=(battle.now/1000).toFixed(1)+' / 180.0 秒';
    for(const u of battle.units){const c=cards.get(u.id);if(!c)continue;c.card.classList.toggle('fallen',!battle.alive(u));
      for(const key of ['hp','mp','sh']){c.bars[key].v.textContent=Math.max(0,Math.round(u[key]))+' / '+c.bars[key].max;c.bars[key].fill.style.width=Math.max(0,u[key]/c.bars[key].max*100)+'%';const shield=key==='hp'?u.shieldHP:key==='sh'?u.shieldSH:0;c.bars[key].shield.style.left=Math.min(100,u[key]/c.bars[key].max*100)+'%';c.bars[key].shield.style.width=Math.min(100-u[key]/c.bars[key].max*100,shield/c.bars[key].max*100)+'%';c.bars[key].shield.style.transform=shield&&u[key]===c.bars[key].max?'translateX(-100%)':'';if(shield&&u[key]===c.bars[key].max)c.bars[key].shield.style.width=Math.min(100,shield/c.bars[key].max*100)+'%';c.bars[key].shield.title='额外护盾 '+shield;if(shield)c.bars[key].v.textContent+=' +盾'+shield;}
      if(u.cast){c.castText.textContent=(u.cast.skill?.name||basic[u.cast.action]||'行动')+' '+Math.max(0,(u.cast.end-battle.now)/1000).toFixed(1)+'s';c.castFill.style.width=Math.max(0,(battle.now-u.cast.start)/(u.cast.end-u.cast.start)*100)+'%';}
      else{c.castText.textContent=!battle.alive(u)?'已退场':battle.value(u,'control')?'受控':u.readyAt>battle.now?'回气中':'等待行动';c.castFill.style.width='0%';}
      const badges=[];const add=(key,name,tip,bad=false)=>badges.push({key,name,tip,bad});
      for(const [key,name]of [['attackBoost','攻击增幅'],['agility','敏捷提升'],['evasion','闪避'],['defDown','削防'],['mindDown','精神削弱'],['control','受控'],['fatigue','疲劳'],['dotBoost','毒素激化'],['slow','减速'],['costUp','消耗增加'],['agilityDown','敏捷降低'],['damageDown','伤害降低'],['accuracyDown','命中率降低']]){const statuses=battle.status(u,key);if(statuses.length){const st=statuses.reduce((a,b)=>b.value>a.value?b:a),percent=Math.round(Math.min(battle.stackCap(key),battle.value(u,key))*100),details=statuses.map(s=>(s.from?s.from+'·':'')+(s.label||name)+' '+Math.round(s.value*100)+'%／'+(s.actionsRemaining!==undefined?s.actionsRemaining+'动作':s.until>=180001?'整场':Math.max(0,(s.until-battle.now)/1000).toFixed(1)+'秒')+(s.hitsRemaining!==undefined?'／'+s.hitsRemaining+'次攻击':'')).join('；');add(key,name+(key==='control'?'':percent+'%'),`${name}：${key==='control'?'无法行动':percent+'%'}，剩余 ${st.until>=180001?'整场':Math.max(0,(st.until-battle.now)/1000).toFixed(1)+' 秒'}${st.hitsRemaining!==undefined?'；剩余'+st.hitsRemaining+'次攻击':''}；来源：${details}`,['defDown','mindDown','control','fatigue','slow','costUp','agilityDown','damageDown','accuracyDown'].includes(key));}}
      for(const badge of WitnessUIV14.shieldBadges(battle,u))add(badge.key,badge.name,badge.tip,badge.bad);
      // Each guard belongs to its own shield layer and is displayed above.
      if(u.immuneUntil>battle.now)add('immune','免控','免疫控制，剩余 '+((u.immuneUntil-battle.now)/1000).toFixed(1)+' 秒');
      if(u.rage)add('rage','霸气 '+u.rage,'霸刀斩消耗最多3层提高威力');
      if(battle.value(u,'activeDodge'))add('activeDodge','主动闪避',`消耗${battle.dodgeCost(u)}点魂力；仅回避直接生命攻击与持续伤害的施加，不清除已附着伤害。`);
      for(const key of R.KEYS)for(const [type,sign]of [['statUp','＋'],['statDown','−']]){const states=battle.status(u,type+key);if(states.length)add(type+key,R.LABELS[key]+sign+Math.round(Math.min(.65,states.reduce((n,s)=>n+s.value,0))*100)+'%',states.map(s=>s.from+'·'+s.label).join('；'),type==='statDown');}
      for(const dot of u.dots)add('dot-'+dot.key,(battle.dotLabel(dot))+' '+dot.damage+'×'+dot.ticks,`来源 ${battle.unit(dot.source)?.name}；每跳 ${dot.damage} ${dot.channel}伤害，余 ${dot.ticks} 跳，下一跳 ${Math.max(0,(dot.next-battle.now)/1000).toFixed(1)}秒`,true);
      if(u.release==='召唤')add('pet',u.petAlive?'召唤体 '+u.petHP:'召唤体败退','召唤体和本体共享行动机会');
      for(const node of Array.from(c.statuses.children))if(!badges.some(x=>x.key===node.dataset.key))node.remove();
      for(const badge of badges){let node=Array.from(c.statuses.children).find(n=>n.dataset.key===badge.key);if(!node){node=el('span');node.dataset.key=badge.key;node.tabIndex=0;c.statuses.append(node);}node.textContent=badge.name;node.title=badge.tip;node.dataset.tip=badge.tip;node.className=badge.bad?'status-negative':'status-positive';}

    }
    for(const u of battle.units){const ball=$('ball-'+u.id);ball.style.left=(8+u.progress*66)+'%';ball.style.top=(u.team?42:9)+'px';ball.classList.toggle('current',u.id===battle.activeId);ball.classList.toggle('fallen',!battle.alive(u));ball.title=u.name+' · 敏捷 '+Math.round(battle.effective(u).A)+' · '+(u.id===battle.activeId?'当前回合':u.progress>=1?'已准备':'积累行动');}
    const player=battle.unit('player');for(const [id,b]of actionButtons){const reason=battle.actionReason(player,id);b.disabled=!!reason||!!battle.result||paused||auto;if(id==='dodge'){b.textContent='闪避 · '+battle.dodgeCost(player)+'魂力';b.title=reason||'占用行动机会，提高生命攻击回避率；精神攻击和已附着持续伤害不受影响。受控时失效。';}if(b._cooldown){const skill=player.skills.find(s=>s.id===id);const selected=battle.targetOptions(player,skill.id).find(t=>t.id===$('battleTarget').value);b._summary.textContent=WitnessSkillText.describe(skill,{battle,unit:player,target:selected});const remain=Math.max(0,battle.cooldownUntil(player,skill)-battle.now)/1000;b._cooldown.textContent=remain?'冷却 '+remain.toFixed(1)+'s':reason||'';}}
    while(seenLog<battle.log.length){const l=battle.log[seenLog++],row=el('div',undefined,'battle-log-line');row.append(el('time',(l.time/1000).toFixed(1)+'s'),el('span',l.text));$('battleLog').append(row);displayFX(l);}
    $('battleLogCount').textContent=battle.log.length+' 条';$('battleLog').scrollTop=$('battleLog').scrollHeight;
    if(battle.result){moving=false;paused=false;auto=false;const result=battle.result;$('battleOutcome').hidden=false;$('battleOutcome').className='battle-outcome '+(result.winner===0?'victory':result.winner===1?'defeat':'draw');$('battleOutcome').replaceChildren(el('strong',document.body.classList.contains('battle-lab')?(result.winner===0?'切磋胜利':result.winner===1?'本场落败':'切磋平局'):(result.winner===0?'转正成功 · 领取会徽':result.winner===1?'本场未通过':'切磋平局')),el('p',`${(result.time/1000).toFixed(1)}秒 · ${result.reason}。${document.body.classList.contains('battle-lab')?'可原局重试，比较不同打法。':result.winner===0?'你已成为见证者公会正式会员。':'可以原局重试，改变释放顺序与目标。'}`));hint('本场已结束，可原局重试或导出战报。');save();}
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
  $('exportBattle').onclick=()=>{if(!battle)return;const payload={format:'witness-battle-report',version:1,initial,snapshot:battle.snapshot()},blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='见证者转正战报.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  try{const stored=document.body.classList.contains('campaign-mode')?null:JSON.parse(localStorage.getItem(KEY)||'null');if(stored?.version===1&&stored.snapshot?.version===10&&stored.snapshot?.units&&stored.initial){initial=stored.initial;speed=[0,1,2,4,8].includes(stored.speed)?stored.speed:2;battle=new B.Battle({snapshot:stored.snapshot});paused=!battle.result;moving=!battle.result;seenLog=0;makeCards();makeActions();update();hint(battle.result?'已恢复上次战报。':'已恢复上次战斗，点击继续或原局重试。');}}catch{battle=null;initial=null;}
  renderToolbar();
  window.addEventListener('pagehide',save);
  window.WitnessBattleUI={get:()=>battle,sample,start,update,subscribe:fn=>listeners.push(fn),halt:()=>{clearTimeout(timer);paused=true;moving=false;},restore:(snapshot,options)=>{clearTimeout(timer);initial=JSON.parse(JSON.stringify(options));battle=new B.Battle({snapshot});auto=false;paused=!battle.result;moving=!battle.result;seenLog=0;$('battleLog').replaceChildren();$('battleOutcome').hidden=true;makeCards();makeActions();update();hint(battle.result?'已恢复战报。':'战斗已恢复，点击继续推进。');}};
})();
