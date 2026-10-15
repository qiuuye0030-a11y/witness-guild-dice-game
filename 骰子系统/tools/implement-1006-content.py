from pathlib import Path
import re
p=Path(__file__).resolve().parents[1]
def edit(name,a,b):
 f=p/name;s=f.read_text(encoding='utf-8');assert a in s,(name,a[:80]);f.write_text(s.replace(a,b),encoding='utf-8')
edit('campaign-creation.js','initialLevel:v.level,soulId:','initialLevel:v.level,initialPotential:v.tier,soulId:')
edit('systems/battle/core.js','if(!this.result&&this.now>=180000)this.finishByTime();','if(!this.result&&this.now>=180000)this.finishByTime();this.expireShields();')
edit('systems/campaign/core.js','if(battle.result&&!s.resultHandled){s.resultHandled=true;', '''if(battle.result&&!s.resultHandled){
        if(battle.result.winner!==0){s.examDefeats||=[];const attempt=s.battleOptions?.examAttempt||s.attempts;if(!s.examDefeats.includes(attempt))s.examDefeats.push(attempt);}
        s.resultHandled=true;''')
edit('achievements.js',"const empty=()=>",'''Object.assign(definitions,{
    spark_clear:['微芒成炬','以初始武魂潜力为1的角色赢得转正考核，取得会徽。'],
    spotless_clear:['衣角微脏','转正考核获胜时，剩余生命达到最大生命的95%。'],
    intact_team:['并肩无缺','辅助角色赢得双人转正考核，己方两人全程未退场。'],
    persevering_clear:['百折成章','同一角色实际经历至少两次转正考核失利，最终取得会徽。']
  });
  const witnessText={spark_clear:'最初只有一点微光，后来也照见了自己的名字。',spotless_clear:'掸去衣角的微尘，你从容接过了会徽。',intact_team:'会徽属于你，这场胜利也属于并肩的人。',persevering_clear:'失败留在前页，名字写在最后。',rating_crazy:'一路行来的脚印，终于抵达了新的境界。',rating_divine:'此后的行记，会记得今天的你。',all_styles_clear:'五条不同的道路，都留下了你的见证。',all_examiners_defeated:'每一次交锋，都成为了公会中的一段故事。'};
  const empty=()=>''')
edit('achievements.js','examiners:{},participants:{}}','examiners:{},participants:{},defeats:{}}')
edit('achievements.js','this.data=next;if(persist)this.save();', '''for(const [id,attempts]of Object.entries(raw.defeats||{})){
        if(!/^(character|legacy)-[a-z0-9-]+$/i.test(id)||!Array.isArray(attempts))throw Error('考核经历无效');
        const valid=attempts.filter(n=>Number.isInteger(n)&&n>=1&&n<=11);
        next.defeats[id]=[...new Set([...(next.defeats[id]||[]),...valid])];
      }
      this.data=next;if(persist)this.save();''')
edit('achievements.js',"const highest=Math.max",'''const defeats=(s.examDefeats||[]).filter(n=>Number.isInteger(n)&&n>=1&&n<=11);
      if(defeats.length)this.data.defeats[s.characterId]=[...new Set([...(this.data.defeats[s.characterId]||[]),...defeats])];
      const highest=Math.max''')
edit('achievements.js',"this.data.participants[s.characterId] ||=",'''const initial=s.character.initialPotential??s.draft?.results?.tier;
        if(initial===1)this.unlock('spark_clear',s);
        const units=s.battleSnapshot?.units||[],player=units.find(u=>u.id==='player'),allies=units.filter(u=>u.team===0);
        if(player&&!player.fallen&&player.hp>0&&player.sh>0&&player.model?.derived?.HP>0&&player.hp>=player.model.derived.HP*.95)this.unlock('spotless_clear',s);
        if(s.character.style==='辅助'&&units.length===4&&allies.length===2&&allies.every(u=>!u.fallen&&u.hp>0&&u.sh>0))this.unlock('intact_team',s);
        if((this.data.defeats[s.characterId]||[]).length>=2)this.unlock('persevering_clear',s);
        this.data.participants[s.characterId] ||=''')
edit('achievements.js','description:definitions[id][1],...item','description:definitions[id][1],witness:witnessText[id],...item')
edit('campaign-ui.js',"code.value.trim()!=='见证者公会'","code.value.trim()!=='witness'")
edit('campaign-ui.js',"KEY='witness-complete-game-v1005'","KEY='witness-complete-game-v1006'")
edit('campaign-ui.js',"gameVersion:'10.05'","gameVersion:'10.06'")
f=p/'campaign-ui.js';s=f.read_text(encoding='utf-8');a=s.index('  function renderAchievementNotice(){');b=s.index('  function openAchievements(){',a)
s=s[:a]+'''  function renderAchievementNotice(){
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
    paragraph(card,'达成人物 · '+item.name,'achievement-person');paragraph(card,new Date(item.at).toLocaleString('zh-CN'),'micro');
    if(archive.queue.length>1)paragraph(card,'还有 '+(archive.queue.length-1)+' 份见证待收录','micro');
    const close=()=>{if(archive.queue[0]!==id)return;archive.queue.shift();dialog.close();dialog.remove();render();if(previous?.isConnected)previous.focus();};
    card.append(button('记下这份见证',close));dialog.oncancel=e=>{e.preventDefault();close();};dialog.append(card);document.body.append(dialog);dialog.showModal();card.querySelector('button').focus();
  }
'''+s[b:]
s=s.replace("paragraph(card,item.description);paragraph(card,item.name+", "paragraph(card,item.witness,'achievement-story');paragraph(card,item.description);paragraph(card,item.name+")
f.write_text(s,encoding='utf-8')
edit('campaign.html','10.05版','10.06版')
with (p/'journey.css').open('a',encoding='utf-8') as f:f.write('''
/* 10.06: a quiet, text-first guild commendation. Hidden until earned. */
.achievement-witness{padding:0;width:min(500px,calc(100vw - 32px));max-height:calc(100dvh - 36px);overflow:auto;border:1px solid #b49b61;border-radius:14px;background:#171b31;color:#f4eddb;box-shadow:0 24px 90px #0008}
.achievement-witness::backdrop{background:#080b18bd;backdrop-filter:blur(4px)}
.achievement-witness-card{padding:34px 28px;text-align:center;border:1px solid #b49b614a;margin:8px;border-radius:8px;animation:witness-arrive .35s ease-out}
.achievement-witness .eyebrow{letter-spacing:.16em;color:#d6be83;font-size:12px}
.achievement-seal{display:inline-grid;place-items:center;width:64px;height:64px;margin:12px 0;border:1px solid #c9ab68;border-radius:50%;font-family:serif;letter-spacing:.2em;color:#efdcae;background:#c9ab6810}
.achievement-witness h2{font-family:serif;font-size:32px;letter-spacing:.14em;line-height:1.5;margin:10px 0 18px}
.achievement-story{font-family:serif;line-height:1.95;color:inherit;opacity:.9}
.achievement-condition{border-top:1px solid #b49b6140;padding-top:20px;font-size:14px;line-height:1.85;opacity:.8}
.achievement-person{margin-top:24px;font-size:14px}.achievement-witness button{margin-top:20px;min-height:44px;width:100%}
.chenxi-mode .achievement-witness{background:#fff8e9;color:#423d30;border-color:#ad8b49}.chenxi-mode .achievement-witness .eyebrow,.chenxi-mode .achievement-seal{color:#896529}
@keyframes witness-arrive{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.achievement-witness-card{animation:none}}
@media(max-width:420px){.achievement-witness-card{padding:24px 18px}.achievement-witness h2{font-size:28px}}
''')
print('10.06 hidden achievements, witness dialog and sponsor password implemented.')
