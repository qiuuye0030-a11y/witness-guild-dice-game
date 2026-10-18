(function(root){
'use strict';
const REPORT_PAGE=200,summaries=new WeakMap();
const reportStore=()=>root.WitnessV12Reports;
function reportSummary(record){if(record.summary)return record.summary;if(summaries.has(record))return summaries.get(record);const api=reportStore();const out=record.snapshot&&api&&api.summarize?api.summarize(record):record;summaries.set(record,out);return out;}
function baseResultOf(record){return record.snapshot?.result||null;}
function reportName(record){const summary=reportSummary(record);if(summary.targetName)return summary.targetName;const beast=record.snapshot?.units?.find(u=>u.beastId);return beast?.name||'十万年魂兽';}
function reportReason(record){const summary=reportSummary(record);return summary.reason||baseResultOf(record)?.reason||'讨伐结束';}
function reportSeconds(record){const summary=reportSummary(record);if(summary.seconds!==undefined&&summary.seconds!==null)return summary.seconds;const time=baseResultOf(record)?.time??record.snapshot?.now??0;return Math.round(time/100)/10;}
function reports({campaign,body,el,paragraph,button,download,perform}){
 const entries=campaign?.state.v12?.reports||[];
 if(campaign?.state.v12?.hunt.status==='lost'&&campaign.state.v12.attemptsUsed<3&&campaign.state.phase!=='v12Hunt')body.append(button('继续讨伐 · 剩余'+(3-campaign.state.v12.attemptsUsed)+'次',()=>perform(()=>campaign.v12Reopen(),false)));
 if(!entries.length)return;
 const wrap=el('details',undefined,'v12-reports');wrap.append(el('summary','讨伐战报（'+entries.length+'）'));
 paragraph(wrap,'完整日志单独归档；这里只显示摘要。打开一场战报时才读取正文，每页'+REPORT_PAGE+'条。','camp-note');
 for(const record of entries){
  const item=el('details');item.append(el('summary',reportName(record)+' · '+reportReason(record)+' · '+reportSeconds(record).toFixed(1)+'秒'));
  let built=false;
  const build=full=>{
   const logs=(full&&full.snapshot&&full.snapshot.log)||[];
   const box=el('div',undefined,'v12-report-log');
   let shown=0;
   const exportButton=button('导出这场讨伐战报',()=>download({format:'witness-hunt-report',version:1,report:full||record},'讨伐战报_'+String(record.id).replace(/[:/]/g,'_')+'.json'),'quiet');
   const more=el('button','显示更多','quiet');more.type='button';more.hidden=true;
   const addPage=()=>{const next=logs.slice(shown,shown+REPORT_PAGE);for(const line of next)paragraph(box,(line.time/1000).toFixed(1)+'秒 · '+line.text,'camp-note');shown+=next.length;more.textContent='显示更多（剩余'+(logs.length-shown)+'条）';more.hidden=shown>=logs.length;};
   addPage();
   more.onclick=()=>addPage();
   item.append(box);
   if(logs.length>REPORT_PAGE){item.append(more);paragraph(item,'已加载'+shown+' / '+logs.length+'条；完整日志在导出文件中。','micro');}
   item.append(exportButton);
  };
  item.ontoggle=()=>{
   if(!item.open||built)return;built=true;
   if(record.snapshot){build(record);return;}
   const api=reportStore();
   if(!api||typeof api.get!=='function'){paragraph(item,'战报正文未归档，只能查看摘要。','camp-note');return;}
   const loading=el('p','正在读取归档战报…','camp-note');item.append(loading);
   Promise.resolve(api.get(record.id)).then(full=>{loading.remove();if(full)build(full);else paragraph(item,'没有找到这份归档战报。请先导出完整存档，再尝试从备份恢复。','camp-note');}).catch(error=>{loading.remove();paragraph(item,'读取归档战报失败：'+error.message,'camp-note');});
  };
  wrap.append(item);
 }
 const footer=el('div',undefined,'camp-action-row');
 footer.append(button('导出全部战报',async()=>{const api=reportStore(),all=new Map();for(const record of entries)all.set(record.id,record);if(api&&typeof api.exportAll==='function'){try{const archived=await api.exportAll();for(const full of archived)if(full&&full.id&&full.snapshot)all.set(full.id,full);}catch{}}download({format:'witness-hunt-reports',version:1,reports:[...all.values()]},'讨伐战报全集_'+entries.length+'场.json');},'quiet'));
 wrap.append(footer);
 body.append(wrap);
}
function bones({campaign,body,el,paragraph,button,perform}){const c=campaign.state.character,v=campaign.state.v12;if(!c||!v)return;const box=el('details',undefined,'v12-bones');box.append(el('summary','魂骨与特性（'+(c.bones.length+c.boneInventory.length)+'）'));for(const bone of [...c.bones,...c.boneInventory]){const base=bone.base||bone,card=el('article',undefined,'v12-trait-card');card.append(el('strong',(base.name||bone.name)+' · '+(base.years||bone.years)+'年'));paragraph(card,bone.absorbed?'已吸收':bone.awaitingRingAbsorption?'已携带，吸收魂环后统一融合':'保留于行囊，等待处理','v12-bone-copy');if(bone.attributes)paragraph(card,'属性加持：'+Object.entries(bone.attributes.stats).map(([key,n])=>root.WitnessRules.LABELS[key]+'＋'+n).join('、'),'v12-bone-copy');for(const trait of bone.traits||[]){const inner=el('div',undefined,'v12-trait-card');inner.append(el('strong',trait.name));paragraph(inner,trait.effect,'v12-bone-copy');card.append(inner);}if(bone.pendingReasons?.some(x=>x==='trait-pool-empty'||x==='no-legal-trait'))paragraph(card,'特性待装配：此骨已保留，等待特性池补齐。','v12-bone-copy');box.append(card);}
 for(const session of v.replacements||[]){const row=el('div',undefined,'v12-trait-card');paragraph(row,session.slot+'已有魂骨，新骨保留在行囊。');row.append(button('替换该部位魂骨',()=>perform(()=>campaign.v12Replace(session.incomingBoneId,'replace-existing'),false)),button('保留新骨于行囊',()=>perform(()=>campaign.v12Replace(session.incomingBoneId,'keep-in-inventory'),false),'quiet'));box.append(row);}body.append(box);}
function sponsor(ctx){const {body,el,paragraph,button,startTest}=ctx;const box=el('details',undefined,'v12-sponsor');box.open=true;box.append(el('summary','赞助版 · 讨伐事件测试'));paragraph(box,'直接建立独立测试角色，体验邀请、援军、实战与战利品；不占正式考核次数。','camp-note');const target=el('select');target.id='v12TestTarget';for(const beast of root.WitnessV12.beast.library.list())target.append(new Option(beast.name,beast.id));const rank=el('select');rank.id='v12TestOrigin';for(let i=1;i<=10;i++)rank.append(new Option('家境'+i+'档'+(i<=2?' · 独行':i<=5?' · '+(i-2)*25+'%一位援军':i===10?' · 三位援军':i>=8?' · 两位援军':' · 一位援军'),i));rank.value='10';const level=el('select');level.id='v12TestLevel';for(const i of [80,81,90,91,99])level.append(new Option(i+'级测试角色',i));level.value='81';box.append(target,rank,level,button('直接体验 · 讨伐之战',()=>startTest({target:target.value,originRank:Number(rank.value),level:Number(level.value)})));body.append(box);}
function targetChoice(ctx){const {campaign,body,el,paragraph,perform}=ctx,v=campaign.state.v12,h=v.hunt;
 if(h.target){paragraph(body,'本次讨伐目标：'+h.target.snapshot.name+'（已锁定）','hunt-target-label');return null;}
 const entries=root.WitnessV12.beast.library.list().filter(b=>b.available);if(!entries.length)return null;
 const box=el('div',undefined,'hunt-target-choice'),label=el('label','选择讨伐目标'),select=el('select');select.id='v12HuntTarget';label.htmlFor=select.id;for(const beast of entries)select.append(new Option(beast.name,beast.id));select.value=v.selectedTarget||v.testTarget||entries[0].id;
 select.onchange=()=>perform(()=>campaign.v12SelectTarget(select.value),false);box.append(label,select);paragraph(box,'前进后锁定本次目标，后续挑战保持同一头魂兽。','hunt-target-help');body.append(box);return select;
}
function renderHunt(ctx){const {campaign,body,el,paragraph,button,perform,startBattle,halt,download}=ctx,v=campaign.state.v12,h=v.hunt,T=root.WitnessV12.hunt.texts;body.append(el('p',v.test?'赞助版 · 独立讨伐测试':'固定委托 · 十万年魂兽','eyebrow'),el('h1','讨伐之战。'));paragraph(body,'本次讨伐最多挑战3次，已挑战'+v.attemptsUsed+'次，剩余'+Math.max(0,3-v.attemptsUsed)+'次。无180秒限制，连续10秒无人能行动则中止。','camp-note');
 if(h.status==='invitation'){for(const text of T.invitationView().paragraphs)paragraph(body,text,'camp-narrative');const target=targetChoice(ctx);body.append(button('接受',()=>perform(()=>{if(target)campaign.v12SelectTarget(target.value);campaign.v12Choose('接受');},false)),button('拒绝',()=>perform(()=>{campaign.v12Choose('拒绝');ctx.notice(T.refusalView().paragraphs.join('\n'));},false),'quiet'));return;}
 if(['arrival','awaiting-library','forwarded'].includes(h.status)){for(const text of T.acceptedView().paragraphs)paragraph(body,text,'camp-narrative');for(const text of root.WitnessV12.roster.arrivalParagraphs(h.allies.npcIds))paragraph(body,text,'camp-narrative');const target=targetChoice(ctx);body.append(button('前进',()=>perform(()=>{if(target)campaign.v12SelectTarget(target.value);const options=campaign.v12StartBattle();if(options.pending)return;ctx.save();ctx.render();startBattle(options);},false)));return;}
 if(h.status==='battle'){paragraph(body,'魂兽已在前方。请在下方选择行动，或开启自动战斗。连续10秒无人能行动则中止，不会获得战利品。','camp-narrative');if(!root.WitnessBattleUI.get()?.v12Battle)body.append(button('恢复讨伐战斗',()=>root.WitnessBattleUI.restore(v.battleSnapshot,v.options)));}
 else{paragraph(body,v.result?.reason||'这次讨伐已经结束。','camp-narrative');if(v.reward){const card=el('article',undefined,'v12-trait-card');card.append(el('strong','讨伐战利品'));const bone=v.reward.bone;paragraph(card,'十万年红色魂环：'+(campaign.state.character.rings.some(r=>r.index===9&&r.source?.type==='hunt')?'已吸收为第九环':campaign.state.character.preStoredNinthRing?'已预留，到90级且八环齐备时自动吸收':'保留为待处理战利品'));paragraph(card,'十万年魂骨：'+bone.base.slot+'；'+(v.reward.absorption.status==='slot-conflict'?'新骨已收入行囊':'已自动吸收'));if(v.reward.inheritance?.reason==='attribute-match')paragraph(card,'属性适配：'+v.reward.inheritance.matchedAttributes.join('／')+'，已继承魂兽全部特性。','camp-note');for(const t of bone.traits)paragraph(card,t.name+'：'+t.effect);body.append(card);}else if(h.status==='won')body.append(button('继续结算战利品',()=>perform(()=>campaign.v12Claim(),false)));else paragraph(body,'本次未获得魂环与魂骨。','camp-note');if(v.archiveWarning)paragraph(body,v.archiveWarning,'camp-note');if(h.status==='lost'&&v.attemptsUsed<3&&!v.reward)body.append(button('再次挑战 · 剩余'+(3-v.attemptsUsed)+'次',()=>perform(()=>{halt();const options=campaign.v12Retry();ctx.save();ctx.render();startBattle(options);},false)));body.append(button('返回原旅程',()=>perform(()=>{halt();campaign.v12Resume();if(ctx.leaveBattle)ctx.leaveBattle();},false)));}
 bones(ctx);reports(ctx);
}
root.WitnessV12UI={reports,bones,sponsor,renderHunt};
})(window);
