from pathlib import Path
p=Path(__file__).resolve().parents[1]
s=(p/'_build_1005.py').read_text(encoding='utf-8')
s=s[:s.index("readme='''")].replace('10.05','10.06')
s=s.replace("base=re.sub(r'<script>(.*?)</script>',replace_shared,base,flags=re.S)","base=re.sub(r'<script>(.*?)</script>',replace_shared,base,flags=re.S)\nbase=base.replace('${s.description||s.effect}','${WitnessUIV14.cardDescription(s,u)}')")
s+='''
readme="""见证者公会 · 10.06

解压后用浏览器打开任一主题HTML；全部资源内置，支持离线游玩。
两主题采用相同规则。可通过保存到文件、读取存档交换完整旅程。
新增隐藏见证，达成后才展示；已获成就支持导出与合并导入。
10.06使用独立自动存档槽，旧版旅程请保存到文件后导入。
旧V13及V14的兼容战斗存档可继续；原有更早规则迁移保持。
"""
(folder/'请先阅读.txt').write_text(readme,encoding='utf-8-sig')
for name in ['10.06版_更新说明.md','10.06版_接入与验收记录.md','10.06版_交接文档.md']:
    if (root/name).exists():shutil.copyfile(root/name,folder/name)
manifest={'gameVersion':'10.06','combatRulesVersion':14,'editions':outputs,'sources':{}}
for f in sorted((p/'systems').rglob('*')):
    if f.is_file():manifest['sources'][str(f.relative_to(p))]=hashlib.sha256(f.read_bytes()).hexdigest()
for name in ['achievements.js','campaign-ui.js','skill-text.js','battle-ui-v13.js','campaign-creation.js','journey.css','_build_1006.py']:
    manifest['sources'][name]=hashlib.sha256((p/name).read_bytes()).hexdigest()
(folder/'构建清单.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(root/'见证者公会_10.06版_双前端分享包.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in folder.iterdir():
        if f.is_file():z.write(f,'见证者公会10.06/'+f.name)
with zipfile.ZipFile(root/'见证者公会_10.06版_双前端分享包.zip') as z:assert z.testzip() is None
(p/'output/10.06版封装核对.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(outputs,ensure_ascii=False))
'''
(p/'_build_1006.py').write_text(s,encoding='utf-8')
(p/'_full_package.py').write_text("from pathlib import Path\nimport runpy\nrunpy.run_path(str(Path(__file__).with_name('_build_1006.py')),run_name='__main__')\n",encoding='utf-8')
