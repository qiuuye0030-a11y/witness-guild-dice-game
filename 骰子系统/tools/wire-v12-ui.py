from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'campaign-ui.js';s=f.read_text(encoding='utf-8')
s=s.replace("KEY='witness-complete-game-v1008'","KEY='witness-complete-game-v12'").replace("gameVersion:'v11.01'","gameVersion:'v12'").replace("'v11.01 · '","'v12 · '")
s=s.replace("welcomeMode='member';dialog.close();","welcomeMode='member';dialog.close();render();")
s=s.replace("body.append(button('赞助',openSponsorship,'quiet journey-sponsor-entry'));","body.append(button('赞助',openSponsorship,'quiet journey-sponsor-entry'));if(welcomeMode==='member')WitnessV12UI.sponsor({...v12Context(),body});")
marker='  function render(){'
helpers="""  function v12Context(){return {campaign,el,paragraph,button,perform,notice,save,render,download,halt:()=>WitnessBattleUI.halt(),startBattle:options=>{boundBattle=null;WitnessBattleUI.start(options);$('battleStage').scrollIntoView({block:'start'});},startTest:options=>{stopAuto();WitnessBattleUI.halt();campaign=C.V12.testCharacter(catalog,{...options,seed:freshSeed()});boundBattle=null;save();render();}};}
  function restoreV12(){const v=campaign?.state.v12;if(campaign?.state.phase==='v12Hunt'&&v?.hunt.status==='battle'&&v.battleSnapshot)WitnessBattleUI.restore(v.battleSnapshot,v.options);}
"""
assert marker in s;s=s.replace(marker,helpers+marker)
s=s.replace("campaign?.state.phase==='battle'||!!campaign?.state.challenge?.active","campaign?.state.phase==='battle'||campaign?.state.phase==='v12Hunt'&&!!campaign?.state.v12?.battleSnapshot||!!campaign?.state.challenge?.active")
s=s.replace('ending:renderEnding})','ending:renderEnding,v12Hunt:body=>WitnessV12UI.renderHunt({...v12Context(),body})})')
s=s.replace('    collectAchievements();renderSidebar();',"    if(campaign?.state.character&&campaign.state.phase!=='v12Hunt'){WitnessV12UI.bones({...v12Context(),body:$('campBody')});WitnessV12UI.reports({...v12Context(),body:$('campBody')});}collectAchievements();renderSidebar();")
s=s.replace("localStorage.getItem(KEY)||localStorage.getItem('witness-complete-game-v1007')","localStorage.getItem(KEY)||localStorage.getItem('witness-complete-game-v1008')||localStorage.getItem('witness-complete-game-v1007')")
s=s.replace('  WitnessBattleUI.subscribe(b=>{',"  WitnessBattleUI.subscribe(b=>{\n    if(campaign?.state.phase==='v12Hunt'&&b.v12Battle){const now=performance.now();if(b.result||now-lastBattleSave>350){lastBattleSave=now;const changed=campaign.v12Observe(b);save();if(changed)render();}return;}\n")
s=s.replace("function exportSave(){if(!campaign)return;","function exportSave(){if(!campaign)return;if(campaign.state.phase==='v12Hunt'&&WitnessBattleUI.get()?.v12Battle)campaign.v12Observe(WitnessBattleUI.get());")
s=s.replace("if(options.postGameChallenge)return", "if(options.huntPlan)return campaign.state.phase==='v12Hunt'&&campaign.state.v12.hunt.status==='battle';\n    if(options.postGameChallenge)return")
s=s.replace("notice('存档已恢复，人物面板", "restoreV12();campaign.v12Check();notice('存档已恢复，人物面板")
s=s.replace("window.addEventListener('pagehide',()=>{","window.addEventListener('pagehide',()=>{if(campaign?.state.phase==='v12Hunt'&&WitnessBattleUI.get()?.v12Battle)campaign.v12Observe(WitnessBattleUI.get());")
s=s.replace('    return true;\n  }};','    return true;\n  },startHuntTest:options=>{if(welcomeMode!==\'member\'&&campaign?.state.exam?.mode!==\'member\')throw Error(\'请先进入赞助版\');v12Context().startTest(options||{});}};restoreV12();')
# Remove obsolete event-consuming absorption shortcut; replacement lives in the independent panel.
lines=s.splitlines();lines=[line for line in lines if 'fuseStoredBone' not in line] # one standalone optional button line
s='\n'.join(lines)+'\n'
# Replace the old sidebar bone teaser as a whole, retaining the complete new panel below.
lines=s.splitlines();lines=[line.replace("paragraph(bones,'魂骨技：暂留空白','micro');","for(const t of bone.traits||[])paragraph(bones,t.name+'：'+t.effect,'camp-note');") for line in lines]
f.write_text('\n'.join(lines)+'\n',encoding='utf-8')
f=p/'campaign.html';f.write_text(f.read_text(encoding='utf-8').replace('v11.01 · 魂性谱版','v12 · 讨伐与魂骨'),encoding='utf-8')
f=p/'_build_v12.py';s=f.read_text(encoding='utf-8');s=s.replace("'systems/challenge/ui.js']","'systems/challenge/ui.js','systems/v12/ui.js']");s=s.replace("p/'_build_v11.py'","p/'_build_v12.py'");f.write_text(s,encoding='utf-8')
f=p/'systems/challenge/state.js';f.write_text(f.read_text(encoding='utf-8').replace("SAVE_KEY='witness-complete-game-v1008'","SAVE_KEY='witness-complete-game-v12'"),encoding='utf-8')
f=p/'battle-ui-v13.js';s=f.read_text(encoding='utf-8').replace("KEY='witness-battle-combined-v13'","KEY='witness-battle-combined-v12'")
s=s.replace("a.download=battle.postGameChallenge?","a.download=battle.v12Battle?'见证者讨伐战报.json':battle.postGameChallenge?")
f.write_text(s,encoding='utf-8')
f=p/'skill-text.js';s=f.read_text(encoding='utf-8');s=s.replace('root.WitnessSkillText={describe};',"const taggedDescribe=(skill,ctx)=>'属性：'+(skill.attribute||ctx?.unit?.soul?.attribute||'无')+' · '+describe(skill,ctx);\nroot.WitnessSkillText={describe:taggedDescribe};");s=s.replace('version:14,describe,shieldBadges','version:14,describe:taggedDescribe,shieldBadges');f.write_text(s,encoding='utf-8')
print('v12 UI wired')
