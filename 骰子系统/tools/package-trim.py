from pathlib import Path
import json,zipfile,shutil,hashlib
p=Path(__file__).resolve().parents[1];root=p.parent
reg=json.loads((p/'output/catalog/最终回归.json').read_text(encoding='utf-8'));assert reg['passed']
audit=json.loads((p/'output/catalog/精简核对.json').read_text(encoding='utf-8'));assert audit['current']==555
share=root/'见证者公会_v11.01_武魂精简版_双前端分享包.zip'
shutil.copy2(root/'见证者公会_v11.01版_双前端分享包.zip',share)
with zipfile.ZipFile(share) as z:
    assert z.testzip() is None
    assert not any('魂性谱' in n or '特性命名' in n for n in z.namelist())
    for label in ['经典深靛版','晨曦朝阳版']:
        content=z.read('见证者公会v11.01/'+label+'.html')
        assert content==(root/f'见证者公会_v11.01版_{label}.html').read_bytes()
        for text in ['WitnessTraitRegistry','WitnessTraitData','SoulTraitActions','CampaignTraits','武魂特性']:assert text.encode() not in content
files=[root/name for name in ['精简武魂总表.csv','精简武魂阅读清单.md','武魂十档候选库.json','武魂删留映射.csv','武魂精简版_更新说明.md']]
files.extend(p/'output/catalog'/name for name in ['精简核对.json','命名调整.json','精简专项回归.json','最终回归.json'])
catalog=root/'武魂库_555种_精简清单.zip'
with zipfile.ZipFile(catalog,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in files:z.write(f,'武魂库精简清单/'+f.name)
with zipfile.ZipFile(catalog) as z:assert z.testzip() is None
checks={'catalogCount':555,'renamed':audit['renamed'],'regularPerTier':3,'specialPerTier':1,'retiredSoulTraits':True,'testsPassed':True,'browserVisualQA':False,'packages':[{'file':str(f),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in [share,catalog]]}
(p/'output/catalog/发布核对.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(checks,ensure_ascii=False))
