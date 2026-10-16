from pathlib import Path
import hashlib,json,zipfile
p=Path(__file__).resolve().parents[1];root=p.parent
share=root/'见证者公会_v11版_双前端分享包.zip'
source=root/'见证者公会_v11版_开发源码与验算.zip'
selected=['特性配对战斗对比.json','特性战斗逐场.csv','特性配对成长对比.json','特性成长覆盖补充.json','会员调整对比.json','会员调整逐场.json','最终回归.json','功能验证.json','边界与界面回归.json','修订包机制回归.json','旅程接口回归.json','命名与矩阵迁移回归.json','任务链验证.json','修订包合并冲突.json']
selected.append('特性卡与存储回归.json')
files={}
def add(f):
    if f.is_file():files[f.relative_to(root).as_posix()]=f
for f in p.rglob('*'):
    if not f.is_file():continue
    parts=f.relative_to(p).parts
    if any(x in parts for x in ['output','__pycache__','node_modules','.git']):continue
    add(f)
for name in selected:add(p/'output/v11'/name)
for f in (p/'output/1008').glob('*.json'):
    if any(s in f.name for s in ['培养与读档','成就','修炼','成长','天赋']):add(f)
for f in (p/'output').glob('*封装核对.json'):add(f)
for name in ['见证者公会战斗试玩.html','武魂十档候选库.json','v11版_更新说明.md','v11版_数值与验收报告.md','特性命名程序使用说明.md','开发与复测说明.md','v11基线核对.json']:add(root/name)
add(root/'v11版_特性卡修订说明.md')
for folder in ['晨曦城_朝阳前端组件','10.08交接资料','基线说明']:
    for f in (root/folder).rglob('*'):add(f)
for f in (root/'修订包参考').rglob('*'):
    if f.is_file() and (f.suffix.lower() in ['.txt','.md'] or f.parent.name=='脚本差异' and f.name in ['new-0.js','new-1.js','new-2.js','new-3.js','new-4.js','new-6.js']):add(f)
reg=json.loads((p/'output/v11/最终回归.json').read_text(encoding='utf-8'))
assert reg['passed'],'最终回归尚未全部通过'
def digest(f):return hashlib.sha256(f.read_bytes()).hexdigest()
checks={'gameVersion':'v11','traitBudgetVersion':3,'namingVersion':2,'regressionsPassed':True,'visualBrowserQA':False,'sourceFiles':len(files),'sourceFileHashes':{k:digest(v) for k,v in sorted(files.items())}}
with zipfile.ZipFile(share) as z:
    assert z.testzip() is None
    checks['shareEntries']=z.namelist()
    for label in ['经典深靛版','晨曦朝阳版']:
        assert z.read('见证者公会v11/'+label+'.html')==(root/f'见证者公会_v11版_{label}.html').read_bytes()
with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name,f in sorted(files.items()):z.write(f,'见证者公会v11开发/'+name)
    z.writestr('见证者公会v11开发/源码文件核对.json',json.dumps(checks,ensure_ascii=False,indent=2))
with zipfile.ZipFile(source) as z:
    assert z.testzip() is None
    assert z.read('见证者公会v11开发/骰子系统/systems/traits/naming.js')==(p/'systems/traits/naming.js').read_bytes()
checks['packages']=[{'file':str(f),'bytes':f.stat().st_size,'sha256':digest(f)} for f in [share,source]]
(p/'output/v11/发布核对.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'packages':checks['packages'],'sourceFiles':len(files),'archiveIntegrity':True},ensure_ascii=False))
