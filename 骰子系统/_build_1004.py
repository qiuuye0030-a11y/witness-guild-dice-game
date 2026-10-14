from pathlib import Path
import re,json,zipfile,hashlib,shutil
p=Path(__file__).parent;root=p.parent;component=root/'晨曦城_朝阳前端组件'
base=(root/'见证者公会战斗试玩.html').read_text(encoding='utf-8')
def script(name):return '<script>'+(p/name).read_text(encoding='utf-8').replace('</script','<\\/script')+'</script>'
def replace_shared(m):
    s=m.group(1)
    if 'class DiceEngine' in s:return script('core.js')
    if s.lstrip().startswith('window.WITNESS_CATALOG='):return script('catalog.js')
    if 'const KEYS=' in s[:500]:return script('skill-effects.js')+script('rules.js')
    if 'class Battle' in s:return script('battle-v12-browser.js')+script('skill-text.js')
    if 'window.WitnessBattleUI=' in s:return script('battle-ui-v12.js')
    if 'root.WitnessTemplates=templates' in s or 'root.WitnessTemplates=known' in s or 'const extra=[' in s[:200]:return ''
    return m.group(0)
base=re.sub(r'<script>(.*?)</script>',replace_shared,base,flags=re.S)
markup=(p/'campaign.html').read_text(encoding='utf-8')
styles='\n'.join((p/name).read_text(encoding='utf-8') for name in ['campaign.css','dawn.css','journey.css'])+'\n.journey-fortune-word{grid-column:1/-1;display:block;font-weight:700;margin:5px 0 9px;line-height:1.7;color:inherit}\n'
shared=''.join(script(name) for name in ['achievements.js','campaign-creation.js','campaign-events-extra.js','story-data.js','campaign-events.js','quest-runtime.js','journey-1002.js','campaign.js'])
outputs={}
for theme,label in [('classic','经典深靛版'),('chenxi','晨曦朝阳版')]:
    html=base.replace('<title>见证者公会 · 转正战试玩</title>',f'<title>见证者公会 10.04版 · {label}</title>',1)
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
    assert html.count('class Battle{')==1
    file=root/f'见证者公会_10.04版_{label}.html';file.write_text(html,encoding='utf-8');outputs[label]={'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
folder=root/'10.04版双前端分享';folder.mkdir(exist_ok=True)
for label,meta in outputs.items():shutil.copyfile(meta['file'],folder/(label+'.html'))
readme='''见证者公会 · 10.04版双前端对比

先解压，然后用浏览器打开“经典深靛版.html”或“晨曦朝阳版.html”，均可离线游玩。
两版采用相同人物、168则事件、10条任务链和同一份v12战斗代码，区别为界面。请输入相同骰子种子，或保存人物后在另一版读入，便于比较。
玩家按真实武魂潜力作战，使用已获得的全部魂环与魂技；考官保留四魂技限制。魂骨共鸣提升的潜力也会进入战斗。
魅力、气运均有十档四字评价，高档附加感叹号。
普通开局6岁觉醒、先天魂力1—10级；6102年入会年龄16—40岁，10—34年经历由24个成长阶段呈现。
原规则平局时按队伍剩余生命百分比加判；仍相同则主角获胜。
攻击及持续伤害类魂技只显示伤害与魂力消耗；控制、减益、强化、防御、治疗、回蓝类保留完整功能说明。预计伤害会受目标及当前状态影响。
晨曦版采用朝阳、雾层、城楼、水光与纸色面板，行记、行囊、设置按钮已连接游戏功能。
隐藏成就跨角色保存，可在“已获成就”中导出与合并导入档案；事件选项可展开成功与未成功收益预览。
存档只自动保存在当前浏览器；两版可以互读“保存到文件”导出的完整存档。
旧规则的进行中战报会保留人物并返回登记，可按新规则重新开战；已完成旅程仍可查看结局。
手机请用可执行HTML的浏览器打开。不要用聊天软件的文件预览器检验交互。
'''
(folder/'请先阅读.txt').write_text(readme,encoding='utf-8-sig')
notes=(p/'output/v12接入版本核对.json').read_text(encoding='utf-8');(folder/'战斗接入核对.json').write_text(notes,encoding='utf-8')
shutil.copyfile(root/'10.04版_更新说明.md',folder/'10.04版更新说明.md')
shutil.copyfile(root/'10.04版_接入与验收记录.md',folder/'接入与验收记录.md')
with zipfile.ZipFile(root/'见证者公会_10.04版_双前端分享包.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in folder.iterdir():
        if f.is_file():z.write(f,'见证者公会双前端/'+f.name)
with zipfile.ZipFile(root/'见证者公会_10.04版_双前端分享包.zip') as z:assert z.testzip() is None
for label,meta in outputs.items():
    archive=root/f'见证者公会_10.04版_{label}_分享包.zip'
    guide=f'''见证者公会 · 10.04版 · {label}

先解压，用浏览器打开“{label}.html”即可离线游玩。全部代码、立绘与骰子外观已内置。
玩家保留真实武魂潜力与全部已有魂技；考官采用四技限制。
原规则平局时，剩余生命百分比更高的一方获胜；仍相同则主角获胜。
普通开局从6岁、1—10级魂士起步；6102年抵达年龄16—40岁，24个成长阶段覆盖10—34年经历。
保存到文件可以备份旅程，两个界面版本的完整存档可以互相读取。
10.04接入168则重写与新增事件及10条任务链。短篇在同一期连续推进，固定成长只发一次；终章奖励去重，任务进度可保存。
首页“赞助”入口提供口令输入，确认后回到起始界面。魅力和气运由初始骰确定，不再从事件或任务获得增长。
本版使用独立本机旅程存档槽，可导入旧完整存档；10.04的新任务存档请在两个10.04主题之间互读。旧存档正在阅读的原文会保留。
魅力、气运、武魂暗骰揭晓、事件去重、线索标注与醒目收益均已接入。
战斗新增主动闪避：占用行动机会，消耗2%基础最大魂力，持续4秒；受控时闪避失效。精神攻击和已附着持续伤害按独立规则结算。
强化与减益支持一至三项六维效果，按系别倾向生成并写入魂技；明确的毒伤保留，其余持续伤害显示残伤。
事件选项默认显示预计成功率与加减号摘要，可展开“查看详细结果与收益”；查看预览不会投骰。
隐藏成就跨角色保存；“已获成就”支持档案导出、导入合并。新旅程保留成就，测试开局与事件试玩不参与统计。
只有攻击和持续伤害类魂技精简说明，其他类别保留功能说明。
'''
    if label=='晨曦朝阳版':guide+='\n骰子采用日轮青玉外观，保留原多面骰轮廓、数字与原投掷动画。\n'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        z.write(meta['file'],f'见证者公会{label}/{label}.html')
        z.writestr(f'见证者公会{label}/请先阅读.txt','\ufeff'+guide)
        z.write(root/'10.04版_更新说明.md',f'见证者公会{label}/更新说明.md')
        z.write(root/'10.04版_接入与验收记录.md',f'见证者公会{label}/接入与验收记录.md')
    with zipfile.ZipFile(archive) as z:assert z.testzip() is None
(p/'output/10.04版封装核对.json').write_text(json.dumps(outputs,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(outputs,ensure_ascii=False))
# 常用入口也更新为同一份经典版；第六版独立文件继续留档。
shutil.copyfile(outputs['经典深靛版']['file'],root/'见证者公会_完整游戏.html')
legacyShare=root/'完整版分享';legacyShare.mkdir(exist_ok=True)
shutil.copyfile(outputs['经典深靛版']['file'],legacyShare/'双击开始游戏.html')
shutil.copyfile(root/'见证者公会_10.04版_双前端分享包.zip',root/'见证者公会_完整游戏分享包.zip')
