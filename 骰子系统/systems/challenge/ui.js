(function(root){
'use strict';
let storage;try{storage=root.localStorage;}catch{}
const C=root.WitnessChallenge;
function authorize(c,options){const q=C.ensure(c,storage);return !!(q?.active&&q.active===options.challengeSessionId&&JSON.stringify(q.options)===JSON.stringify(options));}
function observe(c,b){return C.observe(c,b,storage);}
function memberPicker({parent,el,categoryId='challengeCategory',enemyId='challengeEnemy',selected='qinyan',onchange=()=>{},completed=()=>false}){
 const category=el('select'),enemy=el('select'),group=el('div',undefined,'member-picker');category.id=categoryId;enemy.id=enemyId;category.setAttribute('aria-label','会员系别');enemy.setAttribute('aria-label','选择会员');
 const styles=['强攻','敏攻','控制','防御','辅助'].filter(style=>root.WitnessTemplates.some(t=>t.style===style));for(const style of styles)category.append(new Option(style+'系',style));category.value=root.WitnessTemplates.find(t=>t.id===selected)?.style||styles[0];
 const refresh=()=>{const old=enemy.value||selected,list=root.WitnessTemplates.filter(t=>t.style===category.value).sort((a,b)=>Number(completed(a.id))-Number(completed(b.id)));enemy.replaceChildren();for(const t of list)enemy.append(new Option((completed(t.id)?'✓ ':'')+t.name+' · '+t.weapon,t.id));enemy.value=list.some(t=>t.id===old)?old:list[0]?.id||'';};
 category.onchange=()=>{refresh();onchange();};enemy.onchange=onchange;const label=el('label','先选择系别，再选择会员');label.htmlFor=category.id;group.append(label,category,enemy);parent.append(group);refresh();return {category,enemy,group,refresh};
}
function render({campaign:c,body,el,button,paragraph,save,render:rerender,start,progress=[]}){
 let q;try{q=C.ensure(c,storage);}catch(e){paragraph(body,e.message,'camp-note');return;}if(!q||q.exhausted)return;
 const box=el('section',undefined,'challenge-zone');box.dataset.challengeZone='true';box.append(el('h3','继续挑战'));
 paragraph(box,'会徽已经属于你。若还意犹未尽，可以继续向公会会员请教。','camp-narrative');
 paragraph(box,'高难度追加挑战 · 全部目录共享剩余'+(5-q.failures)+'次失败机会；保留原结局与属性；特殊挑战可留下新的见证。','camp-note');
 if(q.last)paragraph(box,'上一场：'+(q.last.result.winner===0?'挑战胜利':'挑战落败')+'，用时'+(q.last.result.time/1000).toFixed(1)+'秒。','micro');
 if(q.active){paragraph(box,'当前挑战尚未结束，刷新会继续同一场。请在下方斗魂台继续或认输。');body.append(box);return;}
 const tree=el('details');tree.append(el('summary','展开挑战目录'));
 const mode=el('select');mode.setAttribute('aria-label','挑战目录');mode.id='challengeMode';
 for(const [value,label]of [['member','会员切磋 · 对手高5级'],['advanced','进阶试炼 · 对手高10级'],['high','高难挑战']])mode.append(new Option(label,value));
 const special=el('select');special.id='challengeSpecial';special.setAttribute('aria-label','高难挑战对手');const specialDone=id=>q.completed.includes(id+':xuejidong')||progress.some(r=>r.mode===id&&r.completed);for(const [id,name]of [['guildmaster','会长雪寂冬 · 95级凶级'],['mysterious','神秘伤疤女 · 与你同级神级']].sort((a,b)=>Number(specialDone(a[0]))-Number(specialDone(b[0]))))special.append(new Option((specialDone(id)?'✓ ':'')+name,id));
 const selectedMode=()=>mode.value==='high'?special.value:mode.value;
 const picker=memberPicker({parent:tree,el,completed:id=>q.completed.includes(selectedMode()+':'+id)||progress.some(r=>r.mode===selectedMode()&&r.id===id&&r.completed)}),enemy=picker.enemy;
 const brief=el('p');const refresh=()=>{const selected=selectedMode();picker.group.hidden=mode.value==='high';special.hidden=mode.value!=='high';picker.refresh();brief.textContent=selected==='mysterious'?'神秘伤疤女：'+c.state.character.level+'级·神级，仅两项万年最高档魂技。事象洞穿、祥光、多识、幽行常驻；需在时限内清空生命与精神双槽。':selected==='guildmaster'?'独立会长档案：九魂技、头部魂骨与四个专属被动，不属于普通转正考核。':'使用标准斗魂规则，对手实际等级'+Math.min(99,c.state.character.level+(selected==='advanced'?10:5))+'级，不使用入会降级与伤害优惠。';};mode.onchange=refresh;special.onchange=refresh;refresh();
 const launch=button('接受挑战',()=>{
  const d=el('dialog');d.className='challenge-confirm';d.append(el('h3','高难度挑战提醒'));paragraph(d,brief.textContent);paragraph(d,'剩余'+(5-q.failures)+'次失败机会。累计五次失败后挑战入口隐藏，只能保留结局或重开旅程。取消不会消耗机会。');
  d.append(button('确认登台',()=>{try{const options=C.start(c,{mode:selectedMode(),enemyId:enemy.value},storage);d.close();d.remove();save();start(options);}catch(e){paragraph(d,e.message,'camp-note');}}),button('暂不挑战',()=>{d.close();d.remove();},'quiet'));d.addEventListener('cancel',()=>d.remove());document.body.append(d);d.showModal();
 });tree.prepend(mode,special);tree.append(brief,launch);box.append(tree);body.append(box);
}
function renderReports({state:s,body,el,paragraph,button,download}){
 const reports=C.reportEntries(s.challenge).reverse();
 if(reports.length){
  const section=el('section');section.dataset.battleReport='history';
  section.append(el('h3','挑战战报（'+reports.length+' / '+C.REPORT_LIMIT+'）'));
  paragraph(section,'保留最近'+C.REPORT_LIMIT+'场挑战。超过上限时自动移出最早一场，可提前导出保存。','micro');
  const select=el('select');select.setAttribute('aria-label','选择挑战战报');select.style.maxWidth='100%';
  const modes={member:'会员切磋',advanced:'进阶试炼',guildmaster:'会长挑战',mysterious:'神秘伤疤女'};
  const enemyName=r=>r.snapshot?.units?.find(u=>u.id==='enemy')?.name||root.WitnessTemplates?.find(t=>t.id===r.enemy)?.name||r.enemy;
  const outcome=r=>r.result.winner===0?'胜利':r.result.winner===1?'落败':'平局';
  for(const r of reports){const option=el('option','第'+r.id.split(':').at(-1)+'场 · '+modes[r.mode]+' · '+enemyName(r)+' · '+outcome(r)+' · '+(r.result.time/1000).toFixed(1)+'秒');option.value=r.id;select.append(option);}
  select.value=reports[0].id;section.append(select);
  const content=el('div');section.append(content);
  const show=()=>{
   const r=reports.find(x=>x.id===select.value)||reports[0];content.replaceChildren();
   paragraph(content,modes[r.mode]+' · '+enemyName(r)+' · '+outcome(r)+' · '+(r.result.time/1000).toFixed(1)+'秒 · '+r.result.reason,'micro');
   const details=el('details');details.dataset.battleReport='challenge';details.append(el('summary','展开本场完整战报'));
   let populated=false;
   details.ontoggle=()=>{if(!details.open||populated)return;populated=true;
    if(r.snapshot?.log?.length)for(const line of r.snapshot.log)paragraph(details,`${(line.time/1000).toFixed(1)}秒 · ${line.text}`,'micro');
    else paragraph(details,'这场旧版挑战未保存完整战报。之后完成的挑战会保留详细记录。','micro');
   };
   const controls=el('div',undefined,'camp-action-row');
   const single=button('导出本场战报',()=>download(C.exportReport(r),'见证者挑战战报_第'+r.id.split(':').at(-1)+'场.json'),'quiet');single.disabled=!r.snapshot;
   controls.append(button('查看本场战报',()=>{details.open=true;details.ontoggle();details.scrollIntoView?.({block:'nearest'});} ),single);content.append(controls,details);
  };
  select.onchange=show;show();
  section.append(button('导出全部挑战战报',()=>download({format:'witness-challenge-report-archive',version:1,identity:s.challenge.identity,reports:reports.map(r=>JSON.parse(JSON.stringify(r)))},'见证者挑战战报合集.json'),'quiet'));
  body.append(section);
 }
 const report=el('details');report.dataset.battleReport='admission';report.append(el('summary','转正战报'));
 let populated=false;report.ontoggle=()=>{if(!report.open||populated)return;populated=true;for(const line of s.battleSnapshot?.log||[])paragraph(report,`${(line.time/1000).toFixed(1)}秒 · ${line.text}`,'micro');};
 body.append(report);
}
root.WitnessChallengeUI={memberPicker,render,renderReports,observe,authorize};
})(window);
