(() => {
  'use strict';
  if(!document.getElementById('campaignRoot'))return;
  const $=id=>document.getElementById(id),C=WitnessCampaign,R=WitnessRules,KEY='witness-complete-game-v1006',catalog=WITNESS_CATALOG;
  let achievementStorage=null;try{achievementStorage=window.localStorage;}catch{}
  const archive=new WitnessAchievements.Archive(achievementStorage);
  const examinerIds=()=>WitnessTemplates.map(t=>t.id);
  function collectAchievements(){if(!campaign?.state.character)return;campaign.ensurePromotionState();archive.check(campaign.state,examinerIds(),campaign.ratingSettled()?['纸级','并级','强级','凶级','狂级','神级'].indexOf(R.rating(campaign.state.character.stats).label):-1);if(archive.error)notice('成就档案暂不能自动保存，请导出备份。');}
  let welcomeMode='normal';
  let campaign=null,speed=2,busy=false,auto=false,timer=0,animation=0,boundBattle=null,lastBattleSave=0,training='C',saveOK=true,animRoll=null;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const freshSeed=()=>{const a=new Uint32Array(2);crypto.getRandomValues(a);return '见证-'+Array.from(a,x=>x.toString(36)).join('-');};
  function notice(text){$('campNotice').hidden=!text;$('campNotice').textContent=text||'';}
  const EXAM_KEY='witness-exam-records-1002';
  function reconcileExam(){
    if(!campaign)return;const s=campaign.state;campaign.ensure1002();let record;try{record=JSON.parse(localStorage.getItem(EXAM_KEY)||'{}')[s.characterId];}catch{return;}
    if(!record||!['normal','member'].includes(record.mode)||!Number.isInteger(record.starts)||record.starts<0||record.starts>(record.mode==='member'?11:6))return;
    if(record.starts>s.exam.starts){s.exam.starts=record.starts;s.exam.mode=record.mode;s.exam.opponent=record.opponent||s.exam.opponent;}
    if(record.exhausted&&s.result?.winner!==0){if(!s.character)throw Error('这段旅程的考核机会已用尽，请开始新旅程。');campaign.forceAdmission('这段旅程的考核机会已用尽，旧备份仍可查看。');s.exam.badEnding=true;s.phase='ending';s.result={winner:1,time:0,reason:'本次旅程机会已用尽'};s.resultHandled=true;}
  }
  function save(){if(!campaign)return;collectAchievements();try{const s=campaign.state,records=JSON.parse(localStorage.getItem(EXAM_KEY)||'{}'),old=records[s.characterId];if(!old||s.exam.starts>=old.starts)records[s.characterId]={mode:s.exam.mode,starts:s.exam.starts,opponent:s.exam.opponent,exhausted:!!s.exam.badEnding};localStorage.setItem(EXAM_KEY,JSON.stringify(records));localStorage.setItem(KEY,JSON.stringify({format:'witness-complete-game',version:9,gameVersion:'10.06',speed,training,state:campaign.snapshot()}));saveOK=true;}catch{saveOK=false;notice('本机存储暂不可用，请保存到文件保留旅程。');}}
  function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);}
  function button(text,fn,cls='primary'){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
  function paragraph(parent,text,cls){parent.append(el('p',text,cls));}
  function heading(parent,small,title,text){parent.append(el('p',small,'eyebrow'),el('h1',title));if(text)paragraph(parent,text,'camp-narrative');}
  function stopAuto(){auto=false;clearTimeout(timer);}
  function reveal(){
    cancelAnimationFrame(animation);animRoll=null;busy=false;$('campBusy').hidden=true;
    render();if(auto)scheduleAuto();
  }
  function perform(fn,animated=true){
    if(busy)return;
    try{
      const count=campaign?.state.rolls.length||0;
      const operation=fn();save();
      const roll=operation?.roll||campaign?.state.rolls.at(-1),hasRoll=campaign&&campaign.state.rolls.length>count;
      const die=$('campDie'),panel=$('campDicePanel');
      if(animated&&hasRoll&&die&&roll.sides>1&&speed!==0&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
        busy=true;stopIfCandidate();
        panel.classList.add('is-rolling');panel.setAttribute('aria-busy','true');
        panel.querySelectorAll('button').forEach(b=>b.disabled=true);
        $('campRollStatus').textContent='投掷中 · '+roll.label;
        $('campInlineReveal').hidden=false;$('campInlineReveal').disabled=false;
        animRoll={roll,elapsed:0,last:performance.now(),duration:2300,cell:-1};
        const tick=now=>{
          if(!animRoll)return;
          const a=animRoll;a.elapsed+=Math.min(80,now-a.last)*speed;a.last=now;
          const t=Math.min(1,a.elapsed/a.duration),ease=1-Math.pow(1-t,3);
          const cell=Math.floor(t*11+Math.sin(t*Math.PI)*1.2);
          const face=t>=.86?a.roll.face:1+((a.roll.face+cell)%a.roll.sides);
          if(cell!==a.cell||t>=.86){a.cell=cell;$('campDieNumber').textContent=face;
            $('campDiePrevious').textContent=face===1?a.roll.sides:face-1;
            $('campDieNext').textContent=face===a.roll.sides?1:face+1;
          }
          panel.querySelector('.journey-die-shell').style.transform=`rotate(${(1-ease)*540}deg) scale(${1+.07*Math.sin(t*20)*(1-t)})`;
          if(t>=.86){panel.classList.add('is-landed');$('campRollStatus').textContent=`D${a.roll.sides} = ${a.roll.face} · 已落定`;}
          if(t>=1){reveal();return;}animation=requestAnimationFrame(tick);
        };
        animation=requestAnimationFrame(tick);
      }else{render();if(auto)scheduleAuto();}
    }catch(e){cancelAnimationFrame(animation);animRoll=null;busy=false;notice(e.message);stopAuto();render();}
  }
  function stopIfCandidate(){if(campaign?.state.hunt?.result)stopAuto();}
  for(const value of [1,2,4,8,0]){const b=button(value?value+'×':'即时',()=>{speed=value;renderSpeeds();save();if(busy&&speed===0)reveal();},'');b.dataset.speed=value;$('campSpeeds').append(b);}
  function renderSpeeds(){for(const b of $('campSpeeds').children){b.classList.toggle('active',+b.dataset.speed===speed);b.setAttribute('aria-pressed',String(+b.dataset.speed===speed));}}
  function periodWord(){return campaign?.state.character?.time.timelineMode==='stages'?'成长阶段':'季度';}
  function formatDate(d){return `${d.year}年${d.month}月 · ${d.age}岁`;}
  function stateStep(){if(!campaign)return 0;return ({creation:0,initialHunt:0,review:0,prologue:0,growth:1,event:1,eventResult:1,hunt:1,arrival:2,battle:3,ending:4})[campaign.state.phase];}
  function renderDawn(){
    const s=campaign?.state;
    let progress=0;
    if(s){
      if(['growth','event','eventResult','hunt'].includes(s.phase))progress=.12+.5*s.completed/Math.max(1,s.character.time.quarters);
      else progress=({creation:.02,initialHunt:.07,review:.04,prologue:.1,arrival:.7,battle:.85,ending:1})[s.phase]||0;
    }
    const phase=progress<.25?0:progress<.65?1:progress<1?2:3;
    const names=['破晓前','破晓','日出','晨光'];
    $('campaignRoot').dataset.dawn=phase;document.body.dataset.dawn=phase;
    $('dawnPhase').textContent=names[phase];
    $('dawnPlace').textContent=({arrival:'晨曦城 · 公会门前',battle:'晨曦城 · 斗魂台',ending:'晨曦城 · 见证者公会',creation:'命运 · 一颗骰子的起点',initialHunt:'启程前 · 最初的魂环',hunt:'旅途 · 猎魂之地',growth:'旅途 · 季节更迭',event:'旅途 · 一次相遇',eventResult:'旅途 · 选择后的回响',prologue:'远行的起点',review:'命运的起点'})[s?.phase]||'远行的起点';
    $('dawnPercent').textContent=Math.round(progress*100)+'%';
    $('dawnBars').setAttribute('aria-label',`晨曦进度 ${Math.round(progress*100)}%，${names[phase]}`);
    [...$('dawnBars').children].forEach((bar,i)=>bar.classList.toggle('on',i<=phase));if(window.WitnessTheme)WitnessTheme.render({phase,place:$('dawnPlace').textContent,time:s?.date?formatDate(s.date):'6102年 · 远行之前'});
  }
  function renderProgress(){const step=stateStep();$('campSteps').replaceChildren();['人物','成长','公会','转正战','结局'].forEach((name,i)=>{const s=el('span',(i+1)+' '+name);s.className=i===step?'current':i<step?'done':'';$('campSteps').append(s);});}
  function renderSidebar(){
    const target=$('campSidebar');target.replaceChildren();target.hidden=!campaign;if(!campaign)return;
    const s=campaign.state,c=s.character;renderQuestStatus(target);
    if(s.rolls.length)target.append(rollCard(s.rolls.at(-1)));
    if(!c){target.append(el('p','人物正在落定','eyebrow'),el('h2',s.draft.generatedName||s.draft.options.name||'见证者'));for(const r of s.draft.rolls){if(['style','release','surname','given'].includes(r.key))continue;const row=el('div',undefined,'journey-result-row');row.append(el('span',r.label),el('strong',r.text));target.append(row);}const awakened=catalog.find(x=>x.id===s.draft.results.soulId);if(awakened)target.append(awakeningCard(awakened));return;}
    const soul=campaign.soul(),m=c.stats;
    target.append(el('p','人物档案','eyebrow'),el('h2',c.name),el('p',`${soul.name} · ${soul.tier}档`,'camp-soul'),el('p',`${soul.kind} · ${soul.attribute}`,'micro'),el('p',`${c.style}系${soul.spirit_specialist?' · 精神专长':''}`,'micro'));
    const gauge=el('div',undefined,'camp-level');gauge.append(el('strong',c.level),el('span','级魂力'),el('small',`${c.rings.length}环 · 修炼进度 ${R.round2(s.xp)} / 100`));target.append(gauge);fortuneCards(target,c);paragraph(target,(campaign.ratingSettled()?R.rating(m).label:'评级待修炼结算')+' · '+c.talent.label,'camp-soul');paragraph(target,`出身${c.identity.originRank}档 · 气运${c.luck}档 · 魅力${c.charm}档：${c.identity.family}`,'micro');paragraph(target,`天赋：修炼×${c.talent.xpMultiplier} · 能力训练×${c.talent.attributeMultiplier}`,'micro');
    const aptitude=el('details');aptitude.append(el('summary','六维先天天赋'));aptitudeGrid(aptitude,c);target.append(aptitude);
    const quests=campaign.questLog();if(quests.length){const log=el('details');log.append(el('summary','任务行记'));for(const q of quests){paragraph(log,q.title+' · '+({active:'进行中',waiting:'等待条件',completed:'已完成',closed:'提前收束',interrupted:'已中断'}[q.status]),'micro');if(q.memo)paragraph(log,'纪念：'+q.memo,'micro');if(q.reason)paragraph(log,q.reason,'micro');}target.append(log);}
    const stats=el('div',undefined,'camp-stat-list');for(const key of [...R.KEYS,'W']){const row=el('div');row.append(el('span',R.LABELS[key]),el('strong',m.stats[key]));stats.append(row);}target.append(stats);
    paragraph(target,`生命上限 ${m.derived.HP} · 魂力上限 ${m.derived.MP} · 精神护持上限 ${m.derived.SH}`,'micro');
    if(soul.combat_profile)paragraph(target,`${soul.combat_profile.trait_name}：${soul.combat_profile.description}`,'camp-trait');
    const identity=el('details');identity.append(el('summary','身世与能力明细'));const id=c.identity;paragraph(identity,`${id.gender} · ${id.nationality} · ${id.personality} · ${id.family}`,'micro');paragraph(identity,`出身${id.origin}，外形为${id.appearance}。希望${id.motivation}。随身带着${id.keepsake||'自己的记忆'}。`,'micro');
    paragraph(identity,`能力＝等级基准×档位系数×类别／形态／精神专长／武魂差分×个体偏差＋训练积累。蓝耗减免${m.derived.costReduction}%，读条缩短${m.derived.castReduction}%，操纵训练收益×${m.derived.controlGrowth}。`,'micro');target.append(identity);
    const bones=el('details');bones.append(el('summary',`魂骨与共鸣（${c.bones.length+c.boneInventory.length}）`));for(const bone of [...c.bones,...c.boneInventory]){paragraph(bones,`${bone.name} · ${bone.years}年 · ${bone.absorbed?'已融合':'待融合'}`,'journey-bone');paragraph(bones,'魂骨技：暂留空白','micro');}for(const mutation of c.mutations)paragraph(bones,`第${mutation.quarter}期 · 武魂潜力${mutation.before}→${mutation.after}档`,'journey-bone');if(!c.bones.length&&!c.boneInventory.length)paragraph(bones,'尚未获得魂骨。','micro');target.append(bones);
    const rings=el('details');rings.append(el('summary',`魂环与魂技（${c.rings.length}）`));if(!c.rings.length)paragraph(rings,'尚无魂环，可用普攻。','micro');
    c.rings.forEach(r=>{const block=el('div',undefined,'camp-ring');block.append(el('strong',`第${r.index}环 · ${r.years}年`));r.skills.forEach(skill=>{paragraph(block,skill.name,'micro');paragraph(block,WitnessSkillText.describe(skill),'micro');});rings.append(block);});target.append(rings);
  }
  function renderHistory(){
    $('campHistory').hidden=!campaign;if(!campaign)return;const s=campaign.state;$('campJournal').replaceChildren();
    for(const e of s.journal){const card=el('article',undefined,'camp-journal-entry');card.append(el('time',formatDate(e.date)),el('strong',e.title));if(e.questStage)paragraph(card,e.questStage.title+' · 第'+e.questStage.number+'环节','micro');if(e.castIntroductions)paragraph(card,Object.values(e.castIntroductions).join('；'),'micro');paragraph(card,e.text);renderTriggerTags(card,e.triggerTags);if(e.outcome)paragraph(card,e.outcome.text,'journey-outcome-text');if(e.choice)paragraph(card,`${e.training}训练 · ${e.choice} · ${e.rewards.join('，')} · 魂力 ${e.beforeLevel}→${e.afterLevel}`,'micro');if(e.receipts?.length)renderRewardCards(card,e.receipts.filter(r=>r.context!=='season'),true);if(e.newRings?.length)paragraph(card,e.newRings.map(r=>`第${r.index}环${r.years}年`).join('，'),'micro');$('campJournal').append(card);}
    $('campRolls').replaceChildren();for(const roll of s.rolls){const line=el('p',`${roll.label} · d${roll.sides}=${roll.face}${roll.text?' → '+roll.text:''}`,'micro');$('campRolls').append(line);}
  }
  function formField(parent,label,id,type='text',placeholder=''){const wrap=el('div');const l=el('label',label);l.htmlFor=id;const input=el('input');input.id=id;input.type=type;input.placeholder=placeholder;wrap.append(l,input);parent.append(wrap);return input;}
  function openSponsorship(){
    let dialog=$('campSponsorDialog');if(!dialog){dialog=el('dialog',undefined,'journey-sponsor-dialog');dialog.id='campSponsorDialog';dialog.setAttribute('aria-label','赞助');document.body.append(dialog);}
    dialog.replaceChildren();const form=el('form'),wrap=el('div',undefined,'camp-form'),code=formField(wrap,'口令','campSponsorCode','password');code.autocomplete='off';
    const row=el('div',undefined,'camp-action-row'),confirm=button('确认',()=>{}),exit=button('退出',()=>dialog.close(),'quiet');confirm.type='submit';
    code.oninput=()=>code.setCustomValidity('');form.onsubmit=e=>{e.preventDefault();if(code.value.trim()!=='witness'){code.setCustomValidity('口令不正确');code.reportValidity();return;}welcomeMode='member';dialog.close();};
    row.append(confirm,exit);form.append(wrap,row);dialog.append(form);dialog.showModal();code.focus();
  }
  function renderWelcome(body){
    paragraph(body,'10.06版 · '+(document.body.classList.contains('chenxi-mode')?'晨曦朝阳界面':'经典深靛界面'),'journey-version');heading(body,'斗罗大陆同人 · 单人文字游戏','在6102年，成为见证者。','骰子决定你的起点。从6岁武魂觉醒开始，走过自己的成长岁月。最后，带着自己的武魂走进晨曦城，赢得一枚见证者会徽。');
    const form=el('div',undefined,'camp-form'),name=formField(form,'姓名（留空则立即暗骰生成）','campName','text','你想叫什么？');name.maxLength=40;
    const genderWrap=el('div');genderWrap.append(el('label','性别'));const gender=el('select');gender.id='campGender';['随机','男','女','无性别'].forEach(v=>gender.append(new Option(v,v)));genderWrap.append(gender);form.append(genderWrap);
    const seed=formField(form,'旅程种子','campSeed','text');seed.value=freshSeed();seed.maxLength=120;body.append(form);
    const advanced=el('details');advanced.append(el('summary','自选开局（可选）'));const fields=el('div',undefined,'camp-form'),tierWrap=el('div');tierWrap.append(el('label','武魂档位'));const tier=el('select');tier.id='campTier';tier.append(new Option('随机',''));for(let i=1;i<=10;i++)tier.append(new Option(i+'档',i));tierWrap.append(tier);fields.append(tierWrap);const level=formField(fields,'自选初始等级（测试开局）','campLevel','number','0—99');level.min=0;level.max=99;level.step=1;advanced.append(fields,el('p','只显示数字档位，不限制武魂种类。普通开局从6岁、1—10级魂士起步，入会年龄可投16—40岁；自选等级用于测试，天赋影响成长。','micro'));body.append(advanced);
    body.append(button('开始逐项投骰',()=>{const lv=level.value.trim();if(lv&&(!Number.isInteger(Number(lv))||Number(lv)<0||Number(lv)>99)){notice('初始等级须为0—99的整数');return;}const seedValue=seed.value.trim();if(!seedValue){notice('请输入旅程种子');return;}perform(()=>{campaign=new C.Campaign(catalog,{seed:seedValue,name:name.value,gender:gender.value,tier:tier.value?Number(tier.value):null,level:lv?Number(lv):null});campaign.setPlayMode(welcomeMode);notice('');},true);}));
    body.append(button('赞助',openSponsorship,'quiet journey-sponsor-entry'));
    renderEventTrials(body);
    paragraph(body,'完整流程：人设 → 每季训练与事件 → 猎魂 → 公会登记 → 转正考核 → 会徽或遗憾结局。','camp-note');
  }
  function renderEventTrials(body){
    const details=el('details',undefined,'journey-trial-entry');details.append(el('summary','直接试玩事件 · 跳过开局投骰'));
    paragraph(details,'为检验培养事件准备了八种起点。进入后正常投骰和选择，可保存、猎魂并走完整段旅途。','micro');
    const profiles=[['平民与低潜力','低潜力平民',3,2,5,null,'控制'],['高门与朴素武魂','高门共鸣',10,1,5,null,'辅助'],['低气运的旅人','雨中热汤',2,3,1,null,'敏攻'],['火属性工坊学徒','炉火练习',4,5,5,'火','强攻'],['精神感知与短板','识海练习',5,5,4,'精神','控制'],['高潜力与高气运','晨光天资',8,9,10,null,'防御'],['不善言辞的来客','轻声介绍',3,4,5,null,'控制',2],['亲和力出众的旅人','新友来访',5,5,5,null,'辅助',9]];
    const row=el('div',undefined,'camp-choices');for(const [label,seed,origin,tier,luck,attribute,style,charm]of profiles){row.append(button(label,()=>perform(()=>{
      campaign=new C.Campaign(catalog,{seed,name:label,gender:'随机',tier,level:10});campaign.state.source='test';
      while(campaign.state.phase==='creation'){if(campaign.state.awakeningPending)campaign.acknowledgeAwakening();else campaign.rollCreation();}
      const c=campaign.state.character;
      const choices=catalog.filter(x=>attribute==='精神'?x.spirit_specialist:attribute?x.elements.includes(attribute):x.tier===tier);
      if(choices.length){const soul=choices.find(x=>x.tier===tier)||choices[0];c.soulId=soul.id;c.release=soul.release_options[0];}
      c.initialLuck=c.luck=luck;if(charm!==undefined)c.initialCharm=c.charm=charm;c.identity.originRank=origin;c.identity.family=C.Creation.ORIGINS[origin-1];c.identity.origin=attribute==='火'?'工坊':'地方学院';
      delete c.time.timelineMode;delete c.time.awakeningAge;c.time.span=6;c.time.quarters=24;c.time.age=18;c.time.startAge=12;c.time.startYear=6096;c.time.birthYear=6084;
      campaign.state.date={year:6096,month:c.time.month,age:12};delete campaign.state.growthPlan;
      if(attribute==='精神'){c.deviations[5]=8;c.wDeviation=-2;}
      if(tier>=8)c.deviations[2]=4;
      campaign.upgrade();campaign.review({name:label,style});campaign.refresh();campaign.begin();campaign.startGrowth();
      // 同一试玩固定起点，后续结果仍按正式骰序与成功率结算。
      if(charm===2)campaign.state.trialFirstEvent='E75';
      else if(charm===9)campaign.state.trialFirstEvent='E76';
      else if(origin===10)campaign.state.trialFirstEvent='E01';
      else if(luck===1)campaign.state.trialFirstEvent='E43';
      else if(attribute==='火')campaign.state.trialFirstEvent='E25';
      else if(attribute==='精神')campaign.state.trialFirstEvent='E49';
      else if(tier>=8)campaign.state.trialFirstEvent='E50';
      else campaign.state.trialFirstEvent='E04';
      notice('已进入事件试玩。起点已设定，后续骰序、训练与选择正常结算。');
    },false),'camp-choice'));}details.append(row);body.append(details);
  }
  function diceControls(body,label,sides,fn){
    const panel=el('div',undefined,'journey-roll-panel');panel.id='campDicePanel';
    panel.append(el('p',`本次 D${sides} · ${label}`,'journey-dice-type'));
    const die=button('',()=>perform(fn),'journey-die');die.id='campDie';
    die.setAttribute('aria-label','点击骰子投掷 · '+label);
    die.dataset.shape=[4,6,8,10,12,20].includes(sides)?sides:'many';
    const shell=el('span',undefined,'journey-die-shell');
    const wire=document.createElementNS('http://www.w3.org/2000/svg','svg');wire.setAttribute('viewBox','0 0 120 120');wire.setAttribute('aria-hidden','true');
    const paths={4:'M60 8 L112 106 L8 106 Z M60 8 L60 80 L8 106 M60 80 L112 106',6:'M20 20 L100 20 L100 100 L20 100 Z M20 20 L60 40 L100 20 M60 40 L60 82 L20 100 M60 82 L100 100',8:'M60 6 L112 60 L60 114 L8 60 Z M60 6 L60 114 M8 60 L112 60',10:'M60 5 L109 41 L90 102 L30 102 L11 41 Z M60 5 L60 77 L11 41 M60 77 L109 41 M60 77 L30 102 M60 77 L90 102',12:'M60 5 L111 42 L92 104 L28 104 L9 42 Z M60 5 L38 36 L9 42 M38 36 L82 36 L111 42 M38 36 L28 78 L28 104 M28 78 L60 99 L92 78 L82 36 M92 78 L92 104',20:'M60 4 L111 32 L111 88 L60 116 L9 88 L9 32 Z M60 4 L32 45 L9 32 M32 45 L88 45 L111 32 M88 45 L60 92 L32 45 M60 92 L9 88 M60 92 L111 88 M60 92 L60 116'};
    const path=document.createElementNS(wire.namespaceURI,'path');path.setAttribute('d',paths[sides]||'M60 4 A56 56 0 1 1 59.9 4 Z M20 25 L100 95 M20 95 L100 25 M4 60 L116 60 M60 4 L60 116');wire.append(path);shell.append(wire);
    const previous=el('span','', 'journey-face-neighbor previous');previous.id='campDiePrevious';
    const number=el('strong',sides===1?'1':'?', 'journey-face-number');number.id='campDieNumber';
    const next=el('span','', 'journey-face-neighbor next');next.id='campDieNext';
    die.append(shell,previous,number,next,el('small','D'+sides));panel.append(die);
    const action=button('投掷 · '+label,()=>perform(fn),'primary');action.id='campRollStep';panel.append(action);
    const status=el('p',sides===1?'唯一结果 · 点击确认':'点击骰子或按钮，均可投掷。','journey-roll-status');status.id='campRollStatus';status.setAttribute('role','status');panel.append(status);
    const skip=button('立即揭晓',reveal,'quiet');skip.id='campInlineReveal';skip.hidden=true;panel.append(skip);body.append(panel);
  }
  function rollCard(roll,label='最新落定'){
    const card=el('div',undefined,'journey-last-roll');
    card.append(el('small',label+' · '+roll.label),el('strong',roll.text||roll.face),el('span',`D${roll.sides} = ${roll.face}`));return card;
  }
  function awakeningCard(soul){
    const card=el('div',undefined,'journey-awakening-card');card.append(el('small','武魂已经觉醒'),el('strong',soul.name),el('span',`${soul.tier}档潜力 · ${soul.main_kind}武魂 · ${soul.attribute}`));return card;
  }
  function renderRewardCards(parent,receipts,compact=false){
    const groups=new Map();for(const r of receipts){const key=r.kind+'|'+r.key+'|'+r.context;
      if(r.amount!==null&&groups.has(key)){const old=groups.get(key);old.amount=R.round2(old.amount+r.amount);old.to=r.to;}else groups.set(key,{...r});}
    const grid=el('div',undefined,'journey-reward-grid'+(compact?' compact':''));
    const labels={attribute:['◆','能力成长'],xp:['✦','修为积累'],prep:['◎','猎魂准备'],relationship:['◈','关系进展'],clue:['⌖','新线索'],bone:['✧','珍贵魂骨'],mutation:['✶','武魂蜕变'],loss:['−','需要休整'],risk:['!','当前状态'],quest:['✦','任务收束']};
    for(const r of groups.values()){
      const card=el('article',undefined,'journey-reward-card');card.dataset.kind=r.kind;
      const [symbol,title]=labels[r.kind]||['◆','本次所得'];const head=el('div',undefined,'journey-reward-card-head');head.append(el('span',symbol,'journey-reward-symbol'),el('small',title));card.append(head,el('h3',r.label));
      if(r.amount!==null){
        const value=el('strong',`${r.amount>0?'+':''}${r.amount}`,'journey-reward-amount');value.append(el('small',' '+r.unit));card.append(value);
        if(r.from!==null&&r.to!==null)paragraph(card,`${r.from} → ${r.to}${r.unit}`,'journey-reward-change');
        if(r.kind==='mutation')paragraph(card,'潜力已提升，后续成长与魂技同步更新。','journey-reward-caption');
      }else{paragraph(card,r.unit||({relationship:'新的往来已记入档案',clue:'后续事件可循此展开',risk:'当前影响已记录'}[r.kind])||'已记入人物档案','journey-reward-caption');}
      grid.append(card);
    }
    if(!groups.size)paragraph(grid,'这次相遇没有额外数值变化，长期训练仍然保留。','camp-note');parent.append(grid);
  }
  function aptitudeGrid(parent,c){
    const grid=el('div',undefined,'journey-aptitudes');
    R.KEYS.forEach((key,i)=>{const value=c.deviations[i],row=el('div',undefined,'journey-aptitude');
      row.classList.toggle('exceptional',value>=8);row.append(el('span',R.LABELS[key]),el('strong',`${value>=0?'+':''}${value}%`),el('small',C.Creation.aptitude(value)));grid.append(row);});parent.append(grid);
    const summary=C.Creation.aptitudeSummary(c.deviations);if(summary)paragraph(parent,summary,'journey-talent-wow');
  }
  function fortuneCards(parent,c){
    const grid=el('div',undefined,'journey-fortunes');for(const [key,label,icon]of [['charm','魅力','◇'],['luck','气运','✦']]){const card=el('article',undefined,'journey-fortune');card.dataset.stat=key;card.append(el('span',icon+' '+label),el('strong',(c[key]??'待定')+(c[key]?' / 10档':'')));const bars=el('div',undefined,'journey-ten-bars');for(let i=0;i<10;i++)bars.append(el('i',undefined,i<(c[key]||0)?'on':''));card.append(el('small',C.Creation.fortuneDescription(key,c[key])||'等待这一骰落定','journey-fortune-word'),bars);grid.append(card);}parent.append(grid);
  }
  function renderCreation(body){
    if(campaign.state.awakeningPending){const draft=campaign.creation(),soul=draft.soul();heading(body,'武魂觉醒','你的武魂，终于显现。','觉醒的光落定了。这就是将陪伴你走过旅途的武魂。');const reveal=el('section',undefined,'journey-soul-reveal');reveal.append(awakeningCard(soul));paragraph(reveal,soul.combat_profile?.description||'它的力量正等待你亲手培养。','camp-narrative');body.append(reveal);fortuneCards(body,draft.state.results);body.append(button('记住这个武魂 · 继续完善人物',()=>perform(()=>campaign.acknowledgeAwakening(),false)));return;}

    const draft=campaign.creation(),step=draft.current(),last=campaign.state.rolls.at(-1);
    paragraph(body,draft.state.generatedName+'的旅途','journey-draft-name');fortuneCards(body,draft.state.results);
    heading(body,`开局投骰 · ${step.group}`,step.label+'，由这一骰来决定。',step.note);
    if(last){const result=el('div',undefined,'journey-last-roll');result.append(el('small','上一项 · '+last.label),el('strong',last.text),el('span',`d${last.sides} = ${last.face}`));body.append(result);}
    if(step.key==='originRank'||step.key==='talent'){const list=el('details');list.append(el('summary','查看本次候选表'));const rows=el('div',undefined,'journey-candidates');
      const values=step.key==='originRank'?C.Creation.ORIGINS:C.Creation.TALENTS.map(t=>`${t.label} · 修炼×${t.xpMultiplier} · 能力训练×${t.attributeMultiplier}`);
      values.forEach((text,i)=>rows.append(el('p',(i+1)+' · '+text,'micro')));list.append(rows);body.append(list);}
    if(draft.soul())body.append(awakeningCard(draft.soul()));
    diceControls(body,step.label,step.sides,()=>campaign.rollCreation());
    paragraph(body,'每次只投当前项目。结果与骰序会先保存，再播放揭晓动画；刷新后继续下一项。','camp-note');
  }
  function renderReview(body){
    const c=campaign.state.character,soul=campaign.soul();
    heading(body,'人设确认','让这个名字，走向自己的旅途。',`你来自${c.identity.origin}，有${c.identity.family}的经历。${c.identity.personality}的你想要${c.identity.motivation}。`);
    const soulCard=el('div',undefined,'journey-last-roll');soulCard.append(el('small','你的武魂'),el('strong',soul.name),el('span',`潜力 ${soul.tier}档 · ${soul.attribute}`));body.append(soulCard);
    fortuneCards(body,c);paragraph(body,'六维先天天赋','eyebrow');aptitudeGrid(body,c);
    paragraph(body,`${c.talent.label} · 魅力${c.charm}档 · 气运${c.luck}档 · 修炼×${c.talent.xpMultiplier} · 能力训练×${c.talent.attributeMultiplier}`,'camp-note');
    const form=el('div',undefined,'camp-form'),name=formField(form,'姓名','campReviewName');name.value=c.name;name.maxLength=40;
    const wrap=el('div'),label=el('label','培养系别 · 由你选择');label.htmlFor='campReviewStyle';const style=el('select');style.id='campReviewStyle';
    R.mainStyles(soul).forEach(v=>style.append(new Option(v+'系',v)));style.value=c.style;wrap.append(label,style);form.append(wrap);body.append(form);
    style.onchange=()=>{if(!C.Creation.allowedName(name.value)){notice('这个姓名暂不能使用，请换一个。');return;}campaign.review({name:name.value,style:style.value});save();renderSidebar();};
    paragraph(body,'武魂的特点由觉醒决定，培养方向由你决定。','micro');
    body.append(button('人设已定 · 开始旅途',()=>perform(()=>{campaign.review({name:name.value,style:style.value});campaign.begin();},false)));
    paragraph(body,`${formatDate(campaign.state.date)}出发。旅程${c.time.span}年、${c.time.quarters}个${periodWord()}，6102年${c.time.month}月、${c.time.age}岁时入会。确认后逐环猎取初始魂环，再进入成长经历。`,'camp-note');
  }
  function renderPrologue(body){
    const c=campaign.state.character;heading(body,'第一章 · 启程','先走过自己的岁月。',`${c.name}收拾好行囊。有人曾提起晨曦城的见证者公会：那里接纳行走、观察与记录的人，也接纳愿意并肩战斗的人。现在的你尚未站在门前，但已经有了方向。`);
    paragraph(body,`从${formatDate(campaign.state.date)}开始，${c.time.timelineMode==='stages'?'从6岁觉醒开始，24个成长阶段覆盖完整旅程，每阶段会标明经过的月份。':'每三个月选择一次训练与事件。'}当前${c.level}级，已有${c.rings.length}环。`,'camp-note');
    body.append(button('进入第一个'+periodWord(),()=>perform(()=>campaign.startGrowth(),false)));
  }
  function rewardLabel(option,trainingKey){
    const s=campaign.state,p=s.pending,P=p?.PStart||s.character.stats.stats.P,key=option[1],amount=option[2];
    if(key==='XP')return `额外${amount}点修炼进度`;if(key==='PREP')return '下次魂环年限质量骰＋5，累计最多10';if(key==='NONE')return '休养，保留长期训练收益';if(key==='CHANCE')return '70%敏捷基础＋12，否则＋3，另乘天赋训练系数';
    const actualKey=key==='TRAIN'?trainingKey:key;let actual=amount*(amount>0&&R.KEYS.includes(actualKey)?3:1)*(campaign.state.character.talent?.attributeMultiplier||1);if(actualKey==='C')actual*=1+Math.min(1.5,P/200);if(actualKey==='P'&&campaign.soul().spirit_specialist)actual*=1.25;return `${R.LABELS[actualKey]}训练积累＋${R.round2(actual)}`;
  }
  function renderGrowth(body){
    const s=campaign.state,c=s.character;heading(body,`成长 · 第${s.completed+1} / ${c.time.quarters}${periodWord()}`,'这一段岁月，想把什么练得更好？',`本阶段经过${campaign.periodMonths()}个月。长期训练先打下基础，随后发生的事件再让你作一次选择。`);
    const previous=[...s.journal].reverse().find(j=>j.type==='quarter');if(previous){const summary=el('div',undefined,'camp-recap');summary.append(el('strong',`上一期：${previous.title}`));paragraph(summary,previous.rewards.join('，'),'micro');if(previous.afterLevel!==previous.beforeLevel)paragraph(summary,`魂力 ${previous.beforeLevel}→${previous.afterLevel}`,'micro');body.append(summary);}
    if(c.boneInventory.length){body.append(button('融合待用魂骨 · 引导武魂共鸣',()=>perform(()=>campaign.fuseStoredBone()),'quiet'));}if(s.boneReport){renderRewardCards(body,s.boneReport.receipts);body.append(button('收好共鸣记录',()=>perform(()=>{delete s.boneReport;},false),'quiet'));}
    const select=el('select');select.id='campTraining';Object.entries(C.TRAINING).forEach(([key,label])=>select.append(new Option(label+' · '+R.LABELS[key],key)));select.value=training;select.onchange=()=>{training=select.value;save();};const label=el('label','长期训练方向');label.htmlFor=select.id;body.append(label,select);
    paragraph(body,`本期修炼进度＋${campaign.growthRates().xp}：旅程基准${campaign.growthRates().base} × 武魂成长${campaign.growthRates().weapon} × 天赋${campaign.growthRates().talent}。六维训练基础＋6，武魂开发基础＋2，另乘天赋${campaign.growthRates().attribute}；操纵另受精神力影响×${c.stats.derived.controlGrowth}。`,'micro');
    diceControls(body,'本期相遇',10000,()=>campaign.startQuarter(training));body.append(button(auto?'停止自动经历':'自动经历余下阶段',()=>{auto=!auto;if(auto)scheduleAuto();else stopAuto();render();},'quiet'));
  }
  function renderTriggerTags(parent,tags){if(!tags?.length)return;const row=el('div',undefined,'journey-trigger-tags');row.append(el('small','这次相遇缘于'));for(const t of tags)row.append(el('span',t));parent.append(row);}
  function renderPromotion(){
    const existing=document.getElementById('campPromotion'),p=campaign?.state.character?campaign.currentPromotion():null;if(existing&&p&&existing.dataset.promotionId===p.id)return;existing?.remove();if(!p){renderAchievementNotice();return;}document.getElementById('campAchievement')?.remove();stopAuto();
    const overlay=el('div',undefined,'journey-promotion-overlay');overlay.id='campPromotion';overlay.dataset.promotionId=p.id;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','成长突破');const card=el('section',undefined,'journey-promotion');
    card.append(el('div','✦','journey-promotion-star'),el('p',p.ratingUp?'实力晋升！':'魂力突破！','eyebrow'));
    if(p.toLevel>p.fromLevel)card.append(el('h1',p.fromLevel+' → '+p.toLevel+' 级'));
    if(p.ratingUp){card.append(el('h2',p.fromRating+' → '+p.toRating));const ladder=el('div',undefined,'journey-rating-ladder');for(const name of ['纸','并','强','凶','狂','神'])ladder.append(el('span',name,name+'级'===p.toRating?'active':''));card.append(ladder);paragraph(card,p.toRating==='并级'?'踏过合格线！你的努力有了新的分量。':'你的力量跨过了新的门槛！');}
    card.append(button('记下这次突破',()=>perform(()=>campaign.acknowledgePromotion(p.id),false)));overlay.append(card);document.body.append(overlay);card.querySelector('button').focus();
  }

  function previewCard(choice){
    const detail=el('details',undefined,'journey-preview');detail.append(el('summary','查看详细结果与收益'));let built=false;
    detail.addEventListener('toggle',()=>{if(!detail.isConnected||!detail.open||built)return;built=true;const data=campaign.previewEvent(choice);
      const value=r=>{const range=r.min===r.max?String(r.min):r.min+'～'+r.max;return (r.min>=0?'+':'')+range+(r.unit||'点');};
      const common=el('div',undefined,'journey-preview-common');common.append(el('strong','✦ 通用成长 · 两项选择都能获得'));for(const r of data.common)paragraph(common,r.label+' '+value(r),'micro');detail.append(common);
      const grid=el('div',undefined,'journey-preview-grid');for(const [key,title]of [['success','✓ 成功时'],['failure','↺ 未成功时']]){const branch=data[key],card=el('section');card.append(el('h3',title));paragraph(card,branch.text,'micro');
        for(const r of branch.gains){const tag=r.kind==='loss'?'− 可能消耗':r.context==='opportunity'?'✧ 条件加持':'＋ 成长收益';paragraph(card,tag+' · '+r.label+' '+value(r)+(r.min!==r.max?'（依境遇与条件变化）':''),'micro');}
        for(const r of branch.notes)paragraph(card,(r.kind==='risk'?'⚠ 可能代价':'✧ 满足条件时')+' · '+r.label+(r.unit?' · '+r.unit:''),'micro');grid.append(card);}
      detail.append(grid);const gain=data.rawGain;if(gain.PREP)paragraph(detail,'猎魂准备基础奖励 '+gain.PREP+'点；达到10点上限后实际收益减少，90级起转为精神训练。','micro');
      paragraph(detail,'数值为可发生的收益范围；额外加持与消耗取决于境遇、行动与现有资源。魂骨部位随机；共鸣需持有可融合魂骨，变异判定成功后才提升潜力。查看详情不会投骰。','micro');
    });
    const summary=el('div',undefined,'journey-option-summary'),data=campaign.previewEvent(choice),estimate=campaign.eventEstimate(choice);
    summary.append(el('strong',estimate===null?'原存档事件 · 固定收益':'预计约'+estimate+'%成功','journey-chance'));
    const reference=r=>{const common=data.common.find(x=>x.key===r.key);return common?.max||({XP:campaign.growthRates().xp,PREP:3,potential:1}[r.key])||2;};
    const token=r=>{const magnitude=Math.max(Math.abs(r.min),Math.abs(r.max)),n=Math.min(3,Math.max(1,Math.ceil(magnitude/reference(r))));const sign=r.max<=0?'−'.repeat(n):r.min<0?'可能增减':'+'.repeat(n);return r.label.replace('训练调整','').replace('训练','')+' '+sign+(r.min===0&&r.max>0?'（可能）':'');};
    for(const [key,label]of [['success','成功'],['failure','未成功']]){
      const b=data[key],base=b.gains.filter(r=>['event','quest'].includes(r.context)&&r.max>0).slice(0,2),cost=b.gains.filter(r=>r.min<0).slice(0,1),parts=[...base,...cost].map(token);
      if(!parts.length)parts.push('保留共同成长');const special=b.notes.find(r=>r.kind==='quest')||b.notes.find(r=>r.kind==='bone'||r.kind==='mutation'||r.kind==='clue')||b.notes.find(r=>r.kind==='relationship');if(special)parts.push(special.label+'：可能');
      if(b.notes.some(r=>/离开家门/.test(r.label)))parts.push('可能离开家门');if(b.notes.some(r=>r.kind==='risk'))parts.push('可能疲惫');summary.append(el('p',label+'：'+parts.join('　')));
    }
    const capped=data.rawGain.PREP&&campaign.state.prep>=10;if(capped)summary.append(el('small','部分奖励已达上限；实际变化见详情。'));
    const wrapper=el('div');wrapper.append(summary,detail);return wrapper;
  }
  function renderAchievementNotice(){
    const id=archive.queue[0],existing=$('campAchievement');
    if(existing&&existing.dataset.achievementId===id)return;
    existing?.close();existing?.remove();if(!id||campaign?.state.phase==='battle'&&!campaign.state.result)return;
    stopAuto();const previous=document.activeElement,item=archive.entries().find(x=>x.id===id);
    const dialog=el('dialog',undefined,'achievement-witness');dialog.id='campAchievement';dialog.dataset.achievementId=id;
    dialog.setAttribute('aria-labelledby','achievementTitle');dialog.setAttribute('aria-describedby','achievementStory');
    const card=el('section',undefined,'achievement-witness-card');
    const seal=el('span','见证','achievement-seal');seal.setAttribute('aria-hidden','true');
    const title=el('h2',item.title);title.id='achievementTitle';const story=el('p',item.witness,'achievement-story');story.id='achievementStory';
    card.append(el('p','公会行记 · 新的见证','eyebrow'),seal,title,story,el('p',item.description,'achievement-condition'));
    if(item.evidence)paragraph(card,item.evidence,'achievement-evidence');paragraph(card,'达成人物 · '+item.name,'achievement-person');paragraph(card,new Date(item.at).toLocaleString('zh-CN'),'micro');
    if(archive.queue.length>1)paragraph(card,'还有 '+(archive.queue.length-1)+' 份见证待收录','micro');
    const close=()=>{if(archive.queue[0]!==id)return;archive.queue.shift();dialog.close();dialog.remove();render();if(previous?.isConnected)previous.focus();};
    card.append(button('记下这份见证',close));dialog.oncancel=e=>{e.preventDefault();close();};dialog.append(card);document.body.append(dialog);dialog.showModal();card.querySelector('button').focus();
  }
  function openAchievements(){
    archive.reconcile(examinerIds());
    let dialog=$('campAchievements');if(!dialog){dialog=el('dialog');dialog.id='campAchievements';document.body.append(dialog);}dialog.replaceChildren(el('h2','已获成就'));
    const cards=el('div',undefined,'journey-achievement-cards');for(const item of archive.entries()){const card=el('section');card.append(el('h3',item.title));paragraph(card,item.witness,'achievement-story');paragraph(card,item.description);if(item.evidence)paragraph(card,item.evidence,'micro');paragraph(card,item.name+' · '+new Date(item.at).toLocaleString('zh-CN'),'micro');cards.append(card);}if(!cards.childElementCount)paragraph(cards,'旅途中留下的见证，会在获得后出现在这里。');dialog.append(cards);
    const progress=archive.examinerProgress(WitnessTemplates),records=el('section',undefined,'journey-examiner-records');records.setAttribute('aria-label','考官战胜记录');records.append(el('h2','考官战胜记录'));paragraph(records,'已击败 '+progress.filter(x=>x.defeated).length+' / '+progress.length+' 位会员考官');paragraph(records,'记录保存在当前浏览器，新旅程不会清空。换设备或换浏览器时，可导出并合并成就档案。','micro');const list=el('div',undefined,'journey-achievement-cards');for(const item of progress){const card=el('section');card.append(el('h3',(item.defeated?'✓ 已击败 · ':'○ 未击败 · ')+item.name));paragraph(card,item.style+'系 · 武魂：'+item.weapon,'micro');if(item.defeated)paragraph(card,'完成人物：'+item.characters.join('、'),'micro');list.append(card);}records.append(list);dialog.append(records);
    const input=el('input');input.type='file';input.accept='.json,application/json';input.hidden=true;input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>3*1024*1024)throw Error('档案文件过大');archive.merge(JSON.parse(await file.text()));collectAchievements();openAchievements();notice('成就档案已合并，原有记录已保留。');}catch(e){notice('无法合并：'+e.message);}};
    const row=el('div',undefined,'camp-action-row');row.append(button('导出成就档案',()=>download(archive.data,'见证者公会_成就档案.json'),'quiet'),button('导入并合并档案',()=>input.click(),'quiet'),button('返回旅程',()=>{dialog.close();render();}));dialog.append(row,input);if(!dialog.open)dialog.showModal();const title=dialog.querySelector('h2');title.tabIndex=-1;title.focus({preventScroll:true});dialog.scrollTop=0;
  }
  $('campAchievementsButton').onclick=openAchievements;

  function renderCast(parent){const cast=campaign?.state.pending?.castIntroductions;if(!cast||!Object.keys(cast).length)return;const box=el('aside',undefined,'journey-cast');box.setAttribute('aria-label','本幕人物');for(const identity of Object.values(cast))paragraph(box,identity,'micro');parent.append(box);}
  function renderQuestStatus(parent){const stage=campaign?.questStage();if(stage){const box=el('section',undefined,'journey-quest-status');box.append(el('strong',stage.title));paragraph(box,(campaign.state.pending.questStarted?'任务链已开启 · ':'')+'第'+stage.number+'环节 · '+stage.nodeTitle+(stage.status==='completed'?' · 已完成':''),'micro');parent.append(box);return;}const q=campaign?.questSummary();if(!q)return;const box=el('section',undefined,'journey-quest-status');box.append(el('strong',q.title));paragraph(box,(q.cadence==='same_period_episode'?'本期连续故事':'跨期故事')+' · 已经历'+q.finished+'幕'+(q.status==='waiting'?' · 等待后续条件':' · 线索进行中'),'micro');parent.append(box);}
  function renderEvent(body){
    const p=campaign.state.pending,e=campaign.event();
    renderCast(body);
    heading(body,`${periodWord()}相遇 · 第${campaign.state.completed+1}期`,p.legacyEvent?e[0]:e.title,campaign.eventText());
    renderQuestStatus(body);renderTriggerTags(body,p.triggerTags||campaign.eventConditions());paragraph(body,'你会怎样回应这一次相遇？','camp-note');
    if(p.choice!==null&&!p.legacyEvent){
      paragraph(body,'你的选择：'+e.options[p.choice].text,'journey-selected-option');
      diceControls(body,'行动判定',100,()=>campaign.chooseEvent());
      body.append(button('重新考虑',()=>perform(()=>{p.choice=null;},false),'quiet'));
    }else{
      const choices=el('div',undefined,'camp-choices');for(let i=0;i<2;i++){
        const option=p.legacyEvent?e[i+2]:e.options[i];const b=button('',()=>perform(()=>p.legacyEvent?campaign.chooseEvent(i):campaign.prepareEvent(i),false),'camp-choice');
        b.append(el('strong',p.legacyEvent?option[0]:option.text));const card=el('section',undefined,'journey-option-card');card.append(b,previewCard(i));choices.append(card);
      }body.append(choices);
    }
    const common=campaign.previewEvent(0).common;paragraph(body,common.length?'两项共同成长：'+common.map(r=>r.label+' +'+r.max+r.unit).join(' · '):'本期固定成长已在入口结算，本章不会重复发放。','journey-common-summary');
    paragraph(body,'预计成功率按公开条件估算；+越多表示收益越大，−越多表示消耗越大，最多三级；条件机缘不保证发生。','micro');
  }
  function renderEventResult(body){
    stopAuto();const p=campaign.state.pending,e=campaign.event(),outcome=p.outcome;
    renderCast(body);heading(body,'选择后的回响',p.legacyEvent?e[0]:e.title,outcome.text);renderQuestStatus(body);renderTriggerTags(body,p.triggerTags||[]);
    if(outcome.face){
      const card=el('div',undefined,'journey-last-roll');card.append(el('small','D100行动判定'),el('strong',outcome.face+' · '+(outcome.success?(outcome.excellent?'出色成功!':'成功'):'有所波折')),el('span',`成功线 ${outcome.chance.chance}%`));body.append(card);
      const details=el('details');details.append(el('summary','查看这次判定的依据'));const c=outcome.chance;
      paragraph(details,`基础${c.base}% · 能力${c.ability>=0?'+':''}${c.ability} · 身世+${c.origin} · 准备+${c.preparation} · 魅力${(c.charm||0)>=0?'+':''}${c.charm||0} · 气运${c.luck>=0?'+':''}${c.luck}；再结合当前局面与状态，成功线为${c.chance}%。`,'micro');body.append(details);
    }
    const gains=p.receipts.filter(x=>x.context!=='season');paragraph(body,'这次相遇带来的变化','journey-reward-heading');renderRewardCards(body,gains,true);
    const baseline=el('details',undefined,'journey-baseline');baseline.append(el('summary','本期长期训练与修炼'));renderRewardCards(baseline,p.receipts.filter(x=>x.context==='season'),true);body.append(baseline);
    const notes=el('details',undefined,'journey-reward-notes');notes.append(el('summary','查看完整结算记录'));p.reward.forEach(text=>paragraph(notes,text,'micro'));body.append(notes);
    if(p.questEnding){const ending=p.questEnding,card=el('section',undefined,'journey-quest-ending');card.append(el('h3',ending.title+' · '+(ending.status==='completed'?'已完成':'提前收束')));paragraph(card,ending.quality.perfect?'后续篇章全部成功，完美追加已结算。':ending.quality.multiplier===.5?'后续篇章历经波折，终章基础加持按一半结算。':'终章加持已结算。','micro');if(ending.memo)paragraph(card,'行记留念：'+ending.memo+'（仅纪念记录）','micro');body.append(card);}
    const episode=campaign.state.episodePeriod,continueEpisode=episode&&campaign.state.quests?.active===episode.chainId;
    body.append(button(continueEpisode?'继续本期故事':'记下这次相遇 · 继续旅途',()=>perform(()=>campaign.finishEvent(),false)));
    paragraph(body,'本次结果已保存。继续后结算升级，达到门槛时先进入猎魂。','micro');
  }
  function renderHunt(body){
    const s=campaign.state,h=s.hunt,initial=s.phase==='initialHunt',cap=R.CAPS[h.index-1];
    heading(body,initial?'启程前 · 猎魂':'成长 · 猎魂突破',`第${h.index}环，寻找适合自己的力量。`,h.absorbed?'这枚魂环已在旧旅程中吸收。':`当前${s.character.level}级 · 本环年限 ${R.ringFloor(cap)}—${cap}年。不会猎到比上限低两个大档的魂环。`);
    const round=campaign.huntRound(),counter=el('section',undefined,'journey-hunt-counter');counter.setAttribute('aria-label','猎魂回合');counter.append(el('strong','猎魂回合 '+round+'/4'),el('span','累计寻找 '+(h.attempt||1)+' 次 · 距考核 '+campaign.monthsToAdmission()+' 个月'));body.append(counter);
    paragraph(body,'每取得一枚候选魂环算一回合。放弃后继续计数；第4回合仍不吸收，将耗时一个月再找。若因此抵达考核日期，立即结束猎魂，魂环不齐也须登台。后续事件不足三个月则跳过。','camp-note');
    const locations={forest:['林缘兽径','顺着足迹辨认魂兽，向导与你保持联系。'],valley:['山谷石径','沿岩壁与泉眼搜寻，队伍为你标出返回路线。'],wetland:['浅滩水泽','在芦苇和水岸寻找踪迹，确认脚下安全后再前进。']};
    if(h.result){
      const ring=h.result;stopAuto();
      const card=el('div',undefined,'journey-ring-candidate');card.append(el('p',h.absorbed?'已吸收魂环':'候选魂环 · 尚未吸收','eyebrow'),el('h2',`${ring.years}年 · ${ring.band}`));
      paragraph(card,ring.skills.map(x=>x.category+'型').join(' / '),'journey-category');
      if(ring.guarantee)paragraph(card,ring.guarantee,'micro');
      ring.skills.forEach(skill=>{paragraph(card,skill.name);paragraph(card,WitnessSkillText.describe(skill),'micro');});body.append(card);
      const row=el('div',undefined,'camp-action-row');row.append(button(h.absorbed?'继续原旅程':'吸收此魂环',()=>perform(()=>campaign.finishHunt(),false)));
      if(!h.absorbed)row.append(button(round===4?'放弃 · 耗时一个月后继续':'放弃 · 继续猎魂',()=>perform(()=>campaign.abandonHunt(),false),'quiet'));body.append(row);
      paragraph(body,h.absorbed?'已吸收的魂环不会重复入档。':'放弃不占环位；每四次未吸收耗时一个月，下一次搜寻使用新的骰序。','camp-note');
    }else if(h.stage==='plan'){
      paragraph(body,`第${h.attempt||1}次搜寻 · 猎魂准备＋${initial?0:s.prep}。选择想要的魂技类别，再出发寻找年限合适的魂兽。`,'camp-note');
      const form=el('div',undefined,'camp-form');
      const selectField=(label,id,items,value)=>{const wrap=el('div'),l=el('label',label),select=el('select');l.htmlFor=id;select.id=id;items.forEach(([key,text])=>select.append(new Option(text,key)));select.value=value;wrap.append(l,select);form.append(wrap);return select;};
      const category=selectField(h.index===7?'武魂真身表现':'想要的魂技类别','campHuntCategory',[...campaign.huntCategories().map(x=>[x,x+'型']),['random','随缘寻找']],h.selectedCategory||'random');
      const location=selectField('搜寻路线','campHuntLocation',Object.entries(locations).map(([k,v])=>[k,v[0]]),h.location||'forest');body.append(form);
      const note=el('p',locations[location.value][1],'camp-narrative');location.onchange=()=>note.textContent=locations[location.value][1];body.append(note);
      if(h.index===7)paragraph(body,'第七环形成武魂真身，选择强化或防御表现。','micro');
      body.append(button('沿这条路线寻找',()=>perform(()=>campaign.huntPlan('balanced',category.value,location.value),false)));
      paragraph(body,'三条路线提供不同的旅途景象，采用相同年限规则；本阶段不进入战斗。','micro');
    }else if(h.stage==='second'){
      paragraph(body,`${h.years}年 · 第一魂技：${h.category}型。请选择第二魂技类别。`,'camp-note');
      const row=el('div',undefined,'camp-choices');campaign.huntCategories().filter(x=>x!==h.category).forEach(category=>row.append(button(category+'型',()=>perform(()=>campaign.chooseSecond(category),false),'camp-choice')));body.append(row);
    }else{
      const route=locations[h.location]||locations.forest;paragraph(body,route[0]+' · '+route[1],'camp-narrative');
      if(h.selectedCategory&&h.selectedCategory!=='random')paragraph(body,'寻找 '+h.selectedCategory+'型魂技','journey-category');
      if(h.quality!==undefined)paragraph(body,`质量 ${h.quality} · 候选年限 ${h.low}—${h.high}年`,'camp-note');
      if(h.years)paragraph(body,'已找到 '+h.years+'年候选魂环','camp-soul');
      const label={quality:'魂环年限质量',years:'魂环具体年限',category:'魂技类别'}[h.stage],sides=h.stage==='years'?h.high-h.low+1:h.stage==='category'?campaign.huntCategories().length:100;
      diceControls(body,label,sides,()=>campaign.huntStep());
    }
    if(auto)body.append(button('停止自动经历',()=>{stopAuto();render();},'quiet'));
  }
  function renderArrival(body){
    stopAuto();const s=campaign.state,c=s.character,exam=campaign.examStatus(),member=exam.mode==='member';
    if(!member)campaign.assignExaminer();
    heading(body,'第二章 · 晨曦城','斗魂台上的空位，留给了你。',`你随登记人员穿过前殿，脚步声从长廊一路送进斗魂厅。台沿的石面修补过，深浅不同的纹路在光下接成一道道旧痕；有人靠在栏边谈论方才的交手，手指只比了半寸，旁边的人便收住笑，低头重看自己的落脚。这里不缺赢过的人，也不缺知道自己为什么会输的人。`);
    paragraph(body,'台上的正式会员收起练习用的武魂，转身时没带出半点多余的声响。你看着那一步，才发觉一路练熟的起手，此刻竟还想再核对一次。登记人员把考核单压在台边：“伤势有裁判照看。上台之后，拿出你自己的办法。”','camp-narrative');
    paragraph(body,`${s.date.year}年${s.date.month}月 · ${c.name} · ${c.level}级 · ${c.rings.length}环。${exam.starts===0?'首次挑战尚未开始，另有'+exam.limit+'次重战。':'还可重战'+exam.remaining+'次。'}`,'camp-note');
    if(c.rings.length<R.benchmark(c.level).rings)paragraph(body,'考核日期已经到了。未补齐的魂环仍为空缺，你将以当前实际能力登台。','camp-note');
    const form=el('div',undefined,'camp-form');const make=(label,id,items)=>{const wrap=el('div'),labelEl=el('label',label),select=el('select');labelEl.htmlFor=id;select.id=id;items.forEach(([value,text])=>select.append(new Option(text,value)));wrap.append(labelEl,select);form.append(wrap);return select;};
    let enemy,mode,support;
    if(member){enemy=make('转正对手','campEnemy',WitnessTemplates.filter(t=>!t.support).map(t=>[t.id,t.name+' · '+t.weapon]));enemy.value=exam.opponent||'xiaowen';mode=make('考核模式','campDifficulty',[['admission','入会考核'],['standard','同级切磋']]);body.append(form);}
    const brief=el('section',undefined,'camp-recap');
    const update=()=>{const t=WitnessTemplates.find(t=>t.id===(member?enemy.value:campaign.assignExaminer()));const level=member&&mode?.value==='standard'?c.level:WitnessCombatV13.admissionLevel(c.level);brief.replaceChildren(el('strong',t.name+' · 见证者公会正式会员'),el('p','武魂：'+t.weapon));paragraph(brief,`本场考官${level}级 · ${R.benchmark(level).rings}环 · 使用${WitnessCombatV13.skillCount(level)}项魂技`,'micro');paragraph(brief,t.style+'系魂师。考核单上列着本场使用的魂技：'+t.skills.slice(0,WitnessCombatV13.skillCount(member&&mode?.value==='standard'?c.level:WitnessCombatV13.admissionLevel(c.level))).map(skill=>skill.name).join('、')+'。','micro');};
    if(member){enemy.onchange=update;mode.onchange=update;}update();body.append(brief);
    paragraph(body,member?'登记后仍可重新安排考核，已用机会会保留。':'本次旅程重战仍由这位会员考核。','micro');
    paragraph(body,'你使用实际武魂潜力与全部已获魂技。入会考核中考官通常低5级，但不会降出你所在的魂环阶段；伤害为标准的90%，双方行动后均回气0.3秒。考官按实际环数开放魂技，最多六技，常态六维以强级为准。','micro');
    if(member){const label=el('label',undefined,'support-check');support=el('input');support.id='campSupport';support.type='checkbox';label.append(support,el('span','邀请伊筱蓓作为辅助友军，双方都配辅助'));body.append(label);if(c.style==='辅助')label.hidden=true;}
    if(c.style==='辅助')paragraph(body,'李一行是公会安排的输出友军，伊筱蓓是敌方辅助会员；你将与他们进行同一场2v2考核。','camp-note');
    body.append(button('踏上斗魂台 · 开始考核',()=>perform(()=>{const options=campaign.battleOptions(member?enemy.value:null,member?mode.value:'admission',member&&support.checked);boundBattle=null;save();render();WitnessBattleUI.start(options);$('battleStage').scrollIntoView({behavior:'smooth',block:'start'});},false)));
  }
  function renderBattle(body){
    const s=campaign.state,exam=campaign.examStatus();heading(body,'第三章 · 转正战',s.result?'这场切磋结束了。':'把一路所学，交给这一场。',s.result?'你可以重新登台，把这一场没能做成的事再试一次。':'在下方选择行动。控制会打断读条，生命与精神护持都需要照看。');
    paragraph(body,`已开始${exam.starts}场 · 剩余重战${exam.remaining}次。刷新会恢复同一场，重新开战会使用一次机会。`,'camp-note');
    if(s.result){body.append(button('再战一次 · 剩余'+exam.remaining+'次',()=>{WitnessBattleUI.start(s.battleOptions);},'primary'));if(exam.mode==='member')body.append(button('返回登记 · 更换对手',()=>perform(()=>{WitnessBattleUI.halt();campaign.returnArrival();boundBattle=null;},false),'quiet'));}
  }
  function quickRestart(){stopAuto();cancelAnimationFrame(animation);animRoll=null;WitnessBattleUI.halt();welcomeMode=campaign?.state.exam?.mode||welcomeMode;campaign=null;boundBattle=null;busy=false;try{localStorage.setItem(KEY,JSON.stringify({cleared:true}));}catch{}notice('');render();window.scrollTo({top:0,behavior:'smooth'});}
  function renderBadEnding(body){
    heading(body,'遗憾结局 · 未能扣上的会徽','这一次，先走到这里。','台边的考核单合上了。你伸手接回自己的行装，会徽还留在登记台上。几次交手留下的破绽，如今都看得比来时清楚；只是这一趟，还没能把它们一一补上。');
    const badge=el('div',undefined,'camp-badge journey-bad-badge');badge.innerHTML='<svg viewBox="0 0 100 100" role="img" aria-label="遗憾的未完成会徽"><path d="M50 8 82 22 82 57 66 78 50 92 18 72 18 22Z" fill="none" stroke="currentColor" stroke-width="5"/><path d="m56 12-13 27 16 10-19 38" fill="none" stroke="currentColor" stroke-width="5"/></svg>';badge.append(el('strong','未获会徽 · 考核机会已用尽'));body.append(badge);
    paragraph(body,'正式会员把考核记录递给你：“下次再来，记得试试今天没来得及用的办法。”愿你带着这份遗憾，再战一段新的旅程。','camp-narrative');
    body.append(button('快速重启 · 开始新旅程',quickRestart),button('保存这段旅程',exportSave,'quiet'));
  }
  function renderEnding(body){
    if(campaign.state.exam?.badEnding){renderBadEnding(body);return;}
    const s=campaign.state,c=s.character;heading(body,'终章 · 见证者会徽','欢迎回家，'+c.name+'。','正式会员收起武魂，向你点头。人事部完成登记，把会徽和终端交给你。漫长的修炼与旅行在这一刻有了落点，而所见所闻，将从这里继续。');
    const badge=el('div',undefined,'camp-badge');badge.append(el('span','见'),el('strong','正式会员'),el('small',`6102年${c.time.month}月 · ${c.name}`));body.append(badge);
    paragraph(body,`从${c.time.startYear}年走到6102年，你实际经历${s.completed-(s.skippedPeriods||0)}个${periodWord()}，魂力从${c.initialLevel}级成长到${c.level}级，拥有${c.rings.length}个魂环。转正战用时${(s.result.time/1000).toFixed(1)}秒。`,'camp-note');
    paragraph(body,`你曾希望${c.identity.motivation}。现在，这个愿望多了一个可以开始实现的地方。`);
    const row=el('div',undefined,'camp-action-row');row.append(button('保存完整人物与旅程',()=>exportSave()),button('再开一段旅程',()=>$('campNewDialog').showModal(),'quiet'));body.append(row);
    const report=el('details');report.append(el('summary','翻阅这一场战报'));for(const line of s.battleSnapshot?.log||[])paragraph(report,`${(line.time/1000).toFixed(1)}秒 · ${line.text}`,'micro');body.append(report);
  }
  function render(){
    if($('retryBattle'))$('retryBattle').disabled=!campaign||campaign.state.phase!=='battle'||!campaign.state.result||campaign.examStatus().remaining<=0;
    renderSpeeds();renderProgress();renderDawn();if(busy)return;$('campBody').hidden=false;$('campBusy').hidden=true;$('campExport').disabled=!campaign;$('campDate').textContent=campaign?.state.date?formatDate(campaign.state.date):'6102年 · 一枚会徽之前';
    $('campBody').replaceChildren();document.body.classList.toggle('campaign-battle',campaign?.state.phase==='battle');
    if(!campaign)renderWelcome($('campBody'));else ({creation:renderCreation,initialHunt:renderHunt,review:renderReview,prologue:renderPrologue,growth:renderGrowth,event:renderEvent,eventResult:renderEventResult,hunt:renderHunt,arrival:renderArrival,battle:renderBattle,ending:renderEnding})[campaign.state.phase]($('campBody'));
    collectAchievements();renderSidebar();renderHistory();renderPromotion();if(campaign&&!saveOK)notice('自动存档不可用，请保存到文件。');
  }
  function scheduleAuto(){clearTimeout(timer);if(!auto||busy||!campaign)return;timer=setTimeout(()=>{
    if(!auto)return;const s=campaign.state;
    if(s.phase==='growth')perform(()=>campaign.startQuarter(training),false);
    else if(s.phase==='event'){stopAuto();render();}
    else if(s.phase==='hunt'){if(s.hunt.result||s.hunt.stage==='second'){stopAuto();render();}else perform(()=>s.hunt.stage==='plan'?campaign.huntPlan('balanced'):campaign.huntStep(),false);}
    else{stopAuto();render();}
  },speed===0?0:600/speed);}
  function exportSave(){if(!campaign)return;if(campaign.state.phase==='battle'&&WitnessBattleUI.get())campaign.observeBattle(WitnessBattleUI.get());download({format:'witness-complete-game',version:9,gameVersion:'10.06',speed,training,state:campaign.snapshot()},'见证者_'+(campaign.state.character?.name||campaign.state.draft?.options.name||'开局')+'_完整存档.json');}
  $('campExport').onclick=exportSave;$('campReveal').onclick=reveal;
  $('campNew').onclick=()=>{stopAuto();if(busy)reveal();if(campaign){if(campaign.state.phase==='battle'){WitnessBattleUI.halt();WitnessBattleUI.update();}$('campNewDialog').showModal();}else render();};
  $('campConfirmNew').onclick=()=>{stopAuto();cancelAnimationFrame(animation);animRoll=null;WitnessBattleUI.halt();campaign=null;boundBattle=null;busy=false;try{localStorage.setItem(KEY,JSON.stringify({cleared:true}));}catch{}$('campNewDialog').close();notice('');render();window.scrollTo({top:0,behavior:'smooth'});};
  $('campImportButton').onclick=()=>{$('campImport').click();};
  $('campImport').onchange=async()=>{const file=$('campImport').files[0];if(!file)return;try{if(file.size>3*1024*1024)throw Error('存档文件过大');const parsed=JSON.parse(await file.text());if(parsed.format!=='witness-complete-game'||![1,2,3,4,5,6,7,8,9].includes(parsed.version))throw Error('请选择完整游戏导出的JSON存档');const restored=new C.Campaign(catalog,{snapshot:parsed.state});stopAuto();cancelAnimationFrame(animation);animRoll=null;WitnessBattleUI.halt();campaign=restored;reconcileExam();busy=false;speed=[0,1,2,4,8].includes(parsed.speed)?parsed.speed:2;training=C.TRAINING[parsed.training]?parsed.training:'C';boundBattle=null;save();render();if(campaign.state.phase==='battle'&&campaign.state.battleSnapshot)WitnessBattleUI.restore(campaign.state.battleSnapshot,campaign.state.battleOptions);notice('存档已恢复。');}catch(e){notice('无法读入：'+e.message);}$('campImport').value='';};
  WitnessBattleUI.subscribe(b=>{
    if(!campaign||campaign.state.phase!=='battle')return;
    boundBattle=b;
    const now=performance.now();if(b.result||now-lastBattleSave>350){lastBattleSave=now;const changed=campaign.observeBattle(b);save();if(changed){stopAuto();render();if(campaign.state.phase==='ending')document.getElementById('campaignRoot').scrollIntoView({behavior:'smooth',block:'start'});}}
  });
  try{const data=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('witness-complete-game-v1005')||localStorage.getItem('witness-complete-game-v1004')||localStorage.getItem('witness-complete-game-v1003')||localStorage.getItem('witness-complete-game-v1002')||localStorage.getItem('witness-complete-game-v1001')||localStorage.getItem('witness-complete-game-v3')||localStorage.getItem('witness-complete-game-v1')||'null');if(data?.format==='witness-complete-game'&&[1,2,3,4,5,6,7,8,9].includes(data.version)){campaign=new C.Campaign(catalog,{snapshot:data.state});reconcileExam();speed=[0,1,2,4,8].includes(data.speed)?data.speed:2;training=C.TRAINING[data.training]?data.training:'C';}}catch{notice('旧存档无法读取，可以开始新旅程或读入备份。');}
  document.addEventListener('keydown',e=>{if(e.repeat||!['Enter',' '].includes(e.key)||e.target.closest('input,select,textarea,button,summary,dialog'))return;if($('campPromotion')||$('campAchievement')){e.preventDefault();return;}if(busy){e.preventDefault();reveal();}else if($('campRollStep')){e.preventDefault();$('campRollStep').click();}});
  render();if(campaign?.state.phase==='battle'&&campaign.state.battleSnapshot)WitnessBattleUI.restore(campaign.state.battleSnapshot,campaign.state.battleOptions);
  window.addEventListener('pagehide',()=>{if(campaign?.state.phase==='battle'&&WitnessBattleUI.get())campaign.observeBattle(WitnessBattleUI.get());save();});
  window.WitnessFullGame={get:()=>campaign,render,save,stopAuto,beforeBattleStart:options=>{
    if(!campaign)return true;
    if(!campaign||campaign.state.phase!=='battle'){notice('本次考核已结束，请开始新旅程。');return false;}
    if(boundBattle){try{Object.assign(options,campaign.retry());boundBattle=null;save();render();}catch(e){notice(e.message);return false;}}
    return true;
  }};
})();
