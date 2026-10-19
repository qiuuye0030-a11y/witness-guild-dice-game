from pathlib import Path
import re,json,zipfile,hashlib,shutil,runpy,sys
sys.stdout.reconfigure(encoding="utf-8")
p=Path(__file__).parent;(p/'output').mkdir(exist_ok=True);root=p.parent;component=root/'晨曦城_朝阳前端组件'
for entry in ['_build_v12_modules.py','_sync_systems.py','_sync_v13.py']:
    runpy.run_path(str(p/entry),run_name='__main__')
base=(root/'见证者公会战斗试玩.html').read_text(encoding='utf-8')
def script(name):return '<script>'+(p/name).read_text(encoding='utf-8').replace('</script','<\\/script')+'</script>'
def replace_shared(m):
    s=m.group(1)
    if 'class DiceEngine' in s:return script('core.js')
    if s.lstrip().startswith('window.WITNESS_CATALOG='):return script('catalog.js')
    if 'const KEYS=' in s[:500]:return script('combat-rules-v13.js')+script('skill-effects.js')+script('rules.js')
    if 'class Battle' in s:return script('battle-v13-browser.js')+script('skill-text.js')
    if 'window.WitnessBattleUI=' in s:return script('systems/v12/effect-view.js')+script('battle-ui-v13.js')
    if 'root.WitnessTemplates=templates' in s or 'root.WitnessTemplates=known' in s or 'const extra=[' in s[:200]:return ''
    return m.group(0)
base=re.sub(r'<script>(.*?)</script>',replace_shared,base,flags=re.S)
base=base.replace('${s.description||s.effect}','${WitnessUIV14.cardDescription(s,u)}')
markup=(p/'campaign.html').read_text(encoding='utf-8')
styles='\n'.join((p/name).read_text(encoding='utf-8') for name in ['campaign.css','dawn.css','journey.css','systems/challenge/challenge.css','systems/v12/v12.css'])+'\n.journey-fortune-word{grid-column:1/-1;display:block;font-weight:700;margin:5px 0 9px;line-height:1.7;color:inherit}\n'
shared=''.join(script(name) for name in ['achievements.js','campaign-creation.js','story-data.js','campaign-events.js','campaign.js','systems/v12/report-archive.js','systems/challenge/state.js','systems/challenge/ui.js','systems/v12/ui.js'])
outputs={}
for theme,label in [('classic','经典深靛版'),('chenxi','晨曦朝阳版')]:
    html=base.replace('<title>见证者公会 · 转正战试玩</title>',f'<title>见证者公会 v12.05.03讨伐与魂骨版 · {label}</title>',1)
    html=html.replace('<body>',f'<body class="campaign-mode {"chenxi-mode" if theme=="chenxi" else "classic-mode"}">',1)
    part=markup;extraStyles='';adapter=''
    if theme=='chenxi':
        structure=(component/'02_界面结构.html').read_text(encoding='utf-8')
        layers=structure[structure.index('  <div class="cx-layer'):structure.index('  <header')]
        hud=structure[structure.index('  <header'):structure.index('  <div class="cx-stage')]
        foot=structure[structure.index('  <footer'):structure.index('</section>')]
        part=part[:part.index('<div class="dawn-scenery"')]+layers+part[part.index('<div class="campaign-heading"'):]
        part=part.replace('class="campaign-root"','class="campaign-root cx-root cx-game" data-cx-root',1)
        part=part.replace(layers,(p/'chenxi-dice-defs.svg').read_text(encoding='utf-8')+layers,1)
        part=part.replace('<div class="dawn-hud">',hud+'<div class="dawn-hud">',1)
        part=part.replace('class="camp-story"','class="camp-story cx-panel"',1)
        part=part.replace('<div id="campBody"></div>','<div id="campBody" data-cx="narr"></div><ul data-cx="choices" hidden></ul>',1)
        part=part.replace('</section>',foot+'</section>',1)
        extraStyles=(component/'01_界面样式.css').read_text(encoding='utf-8')+'\n'+(p/'chenxi-game.css').read_text(encoding='utf-8')+'\n'+(p/'chenxi-dice-art.css').read_text(encoding='utf-8')+'\n'+(p/'chenxi-dice.css').read_text(encoding='utf-8')
        adapter='<script>'+(component/'03_界面接口.js').read_text(encoding='utf-8')+'</script>'+script('chenxi-adapter.js')
    html=html.replace('</head>','<style>'+styles+'\n'+extraStyles+'</style></head>',1)
    gameUI=script('campaign-ui.js')
    if theme=='chenxi':
        gameUI=gameUI.replace('wire.append(path);shell.append(wire);',"const surface=path.cloneNode(false);surface.setAttribute('d',path.getAttribute('d').split(' Z ')[0]+' Z');surface.classList.add('cx-dice-surface');wire.append(surface,path);shell.append(wire);")
    html=html.replace('<main>','<main>'+part,1).replace('</body>',shared+adapter+gameUI+'</body>',1)
    assert not re.search(r'<(?:script|link)[^>]+(?:src|href)=["\']https?://',html)
    assert len(re.findall(r'class\s+Battle\s*\{',html))==1
    file=root/f'见证者公会_v12.05.03版_{label}.html';file.write_text(html,encoding='utf-8');outputs[label]={'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
folder=root/'v12.05.03版双前端分享'
folder.mkdir(exist_ok=True)
reference=folder/'资料与校验';reference.mkdir(exist_ok=True)
reports=reference/'测试报告';reports.mkdir(exist_ok=True)
docs=reference/'参考资料';docs.mkdir(exist_ok=True)
for label,meta in outputs.items():shutil.copyfile(meta['file'],folder/(label+'.html'))
docs_dir=root/'资料与校验'/'参考资料'  # repository layout keeps the package documents here
shutil.copyfile(docs_dir/'v12.05.03_更新说明.md',folder/'v12.05.03_更新说明.md')
for name in ['v12.05.03_参数对照.json','v12.05.02_成就清单.md','v12.05.02_更新说明.md','v12.05.01_十万年魂兽库.md','DeepSeek_友方NPC与十万年魂兽接入指南_v12.03.md','精简武魂阅读清单.md','精简武魂总表.csv','武魂删留映射.csv']:
    if (docs_dir/name).exists():shutil.copyfile(docs_dir/name,docs/name)
for name in ['v12.05.03专项回归.json','v12.05.02专项回归.json','v12.05.01专项回归.json','v12.05专项回归.json','v12.05.02成就弹窗组件回归.json','发布回归汇总.json','核心回归.json','界面组件回归.json','v12.01专项回归.json','v12.03专项回归.json','v12.03.01专项回归.json']:
    if (p/'output/v12'/name).exists():shutil.copyfile(p/'output/v12'/name,reports/name)
manifest={'gameVersion':'v12.05.03','cultivationRulesVersion':10082,'combatRulesVersion':17,'soulTraits':False,'catalogRulesVersion':1,'baselineSHA256':'644d2829b99a0e52140b235e159d1738ff7a1fd35855016dddcdb4a01b40145b','editions':outputs,'sources':{}}
manifest.update({'initialPotentialProbabilities':[.1]*10,'separateChallengeRecordsVersion':1,'beastCatalogUI':True,'manualExhaustionVerdictVersion':1,'packageLayoutVersion':2,'boneCopyStyleVersion':2,'huntTargetSelectionVersion':1,'inheritedDamageScopeVersion':120501,'beastLibraryCount':7,'beastSkillTierBy':'S','huntMinimumLevel':80,'huntMinimumRating':'强级','innateTalentBindingVersion':1,'huntDropBeforeAbsorption':True,'boneSlotPreference':'not-equipped-or-carried','huntHealthVersion':1,'huntHealthMultipliers':{'solo':1.5,'withAllies':2},'huntShieldBasis':'original-panel-hp','iceShellRate':0.4,'iceShellBasis':'own-max-hp','iceShellGrant':'battle-start','iceShellReflection':0.3,'frostMossColdRate':0.05,'frostMossColdCap':0.5,'frostDomainVersion':2,'frostDomainMaxTier':3,'frostDomainDeepenEveryOwnerTurns':1,'frostDomainEnemyAgilityDown':0.02,'frostDomainEnemyGaugeDown':0.04,'frostDomainAllyAgilityUp':0.04,'frostDomainTierThreeAllyShield':0.02,'frostDomainTierThreeEnemyDamage':0.02,'achievementNotifiedVersion':1,'guildmasterAchievementPriority':True,'huntFocusVersion':1,'huntFocusMPRate':0.1,'huntFocusSeconds':3,'reportArchiveVersion':1,'reportSummaryVersion':2,'huntVersion':2,'huntAttemptLimit':3,'huntTimeLimit':None,'huntStalemateSeconds':10,'traitEffectViewVersion':1,'boneEquipmentVersion':1,'skillAttributesVersion':1,'ordinaryBoneTraitPoolReady':True,'ordinaryBoneTraitPoolVersion':3,'ordinaryBoneTraitCount':20,'ordinaryBoneTraitBenefitMultiplier':2,'ordinaryBoneTraitImplementationVersion':2,'allyRulesVersion':2,'familyAllyChance':{'3':.25,'4':.5,'5':.75},'familyAllyFixed':{'1':0,'2':0,'6':1,'7':1,'8':2,'9':2,'10':3},'scarredAttackMultiplier':.3,'attributeMatchInheritanceVersion':2,'achievementCount':14,'platinumAchievement':'platinum_all','platinumPrerequisiteCount':13,'advancedAchievements':['guildmaster_clear','hunt_hundred_thousand','scarred_clear','platinum_all'],'visualReview':False,'ratingRulesVersion':2,'ratingCurveAmplitude':1.8,'scarredChallengeVersion':1,'soulTraits':False})
for f in sorted((p/'systems').rglob('*')):
    if f.is_file():manifest['sources'][str(f.relative_to(p))]=hashlib.sha256(f.read_bytes()).hexdigest()
for name in ['achievements.js','campaign-ui.js','skill-text.js','battle-ui-v13.js','campaign-creation.js','journey.css','dawn.css','campaign.css','chenxi-game.css','_build_v12.py']:
    manifest['sources'][name]=hashlib.sha256((p/name).read_bytes()).hexdigest()
(reference/'构建清单.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(root/'见证者公会_v12.05.03版_双前端分享包.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in sorted(folder.rglob('*')):
        if f.is_file():z.write(f,f.relative_to(folder).as_posix())
with zipfile.ZipFile(root/'见证者公会_v12.05.03版_双前端分享包.zip') as z:assert z.testzip() is None
(p/'output/v12.05.03版封装核对.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(outputs,ensure_ascii=False))
