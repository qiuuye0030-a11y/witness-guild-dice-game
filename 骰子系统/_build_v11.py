from pathlib import Path
import re,json,zipfile,hashlib,shutil,runpy
p=Path(__file__).parent;(p/'output').mkdir(exist_ok=True);root=p.parent;component=root/'晨曦城_朝阳前端组件'
for entry in ['_sync_systems.py','_sync_v13.py']:
    runpy.run_path(str(p/entry),run_name='__main__')
base=(root/'见证者公会战斗试玩.html').read_text(encoding='utf-8')
def script(name):return '<script>'+(p/name).read_text(encoding='utf-8').replace('</script','<\\/script')+'</script>'
def replace_shared(m):
    s=m.group(1)
    if 'class DiceEngine' in s:return script('core.js')
    if s.lstrip().startswith('window.WITNESS_CATALOG='):return script('catalog.js')
    if 'const KEYS=' in s[:500]:return script('combat-rules-v13.js')+script('skill-effects.js')+script('rules.js')
    if 'class Battle' in s:return script('battle-v13-browser.js')+script('skill-text.js')
    if 'window.WitnessBattleUI=' in s:return script('battle-ui-v13.js')
    if 'root.WitnessTemplates=templates' in s or 'root.WitnessTemplates=known' in s or 'const extra=[' in s[:200]:return ''
    return m.group(0)
base=re.sub(r'<script>(.*?)</script>',replace_shared,base,flags=re.S)
base=base.replace('${s.description||s.effect}','${WitnessUIV14.cardDescription(s,u)}')
markup=(p/'campaign.html').read_text(encoding='utf-8')
styles='\n'.join((p/name).read_text(encoding='utf-8') for name in ['campaign.css','dawn.css','journey.css','systems/challenge/challenge.css'])+'\n.journey-fortune-word{grid-column:1/-1;display:block;font-weight:700;margin:5px 0 9px;line-height:1.7;color:inherit}\n'
shared=''.join(script(name) for name in ['achievements.js','campaign-creation.js','story-data.js','campaign-events.js','campaign.js','systems/challenge/state.js','systems/challenge/ui.js'])
outputs={}
for theme,label in [('classic','经典深靛版'),('chenxi','晨曦朝阳版')]:
    html=base.replace('<title>见证者公会 · 转正战试玩</title>',f'<title>见证者公会 v11.01武魂精简版 · {label}</title>',1)
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
    file=root/f'见证者公会_v11.01版_{label}.html';file.write_text(html,encoding='utf-8');outputs[label]={'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
folder=root/'v11.01版双前端分享';folder.mkdir(exist_ok=True)
for label,meta in outputs.items():shutil.copyfile(meta['file'],folder/(label+'.html'))

readme="""见证者公会 · v11.01武魂精简版（成长规则10081）

解压后用浏览器打开任一主题HTML；全部资源内置，支持离线游玩。
两主题采用相同规则。可通过保存到文件、读取存档交换完整旅程。
新增隐藏见证，达成后才展示；已获成就支持导出与合并导入。
旧版旅程可保存到文件后导入。已获得等级不回扣，后续成长采用回调曲线；完整体验新曲线请开启新旅程。
旧V13及V14的兼容战斗存档可继续；原有更早规则迁移保持。
"""
(folder/'请先阅读.txt').write_text(readme,encoding='utf-8-sig')
for name in ['武魂精简版_更新说明.md','精简武魂阅读清单.md','精简武魂总表.csv','武魂删留映射.csv']:
    shutil.copyfile(root/name,folder/name)
manifest={'gameVersion':'v11.01','cultivationRulesVersion':10081,'combatRulesVersion':17,'soulTraits':False,'catalogRulesVersion':1,'baselineSHA256':'644d2829b99a0e52140b235e159d1738ff7a1fd35855016dddcdb4a01b40145b','editions':outputs,'sources':{}}
manifest.update({'ratingRulesVersion':2,'ratingCurveAmplitude':1.8,'scarredChallengeVersion':1,'soulTraits':False})
for f in sorted((p/'systems').rglob('*')):
    if f.is_file():manifest['sources'][str(f.relative_to(p))]=hashlib.sha256(f.read_bytes()).hexdigest()
for name in ['achievements.js','campaign-ui.js','skill-text.js','battle-ui-v13.js','campaign-creation.js','journey.css','_build_v11.py']:
    manifest['sources'][name]=hashlib.sha256((p/name).read_bytes()).hexdigest()
(folder/'构建清单.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(root/'见证者公会_v11.01版_双前端分享包.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in folder.iterdir():
        if f.is_file():z.write(f,'见证者公会v11.01/'+f.name)
with zipfile.ZipFile(root/'见证者公会_v11.01版_双前端分享包.zip') as z:assert z.testzip() is None
(p/'output/v11.01版封装核对.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(outputs,ensure_ascii=False))
