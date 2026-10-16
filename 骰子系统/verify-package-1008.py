from pathlib import Path
import json,hashlib,zipfile,re
p=Path(__file__).resolve().parent;root=p.parent
folder=root/'10.08版双前端分享'
manifest=json.loads((folder/'构建清单.json').read_text(encoding='utf-8'))
assert manifest['gameVersion']=='10.08' and manifest['combatRulesVersion']==16 and manifest['cultivationRulesVersion']==10081
for name,h in manifest['sources'].items():assert hashlib.sha256((p/name).read_bytes()).hexdigest()==h,name
with zipfile.ZipFile(root/'见证者公会_10.08版_双前端分享包.zip') as z:
 assert z.testzip() is None
 for label,meta in manifest['editions'].items():
  f=root/f'见证者公会_10.08版_{label}.html';data=f.read_bytes();assert hashlib.sha256(data).hexdigest()==meta['sha256']
  assert data==(folder/(label+'.html')).read_bytes()==z.read('见证者公会10.08/'+label+'.html')
  text=data.decode('utf-8');assert len(re.findall(r'class\s+Battle\s*\{',text))==1
  assert not re.search(r'<(?:script|link)[^>]+(?:src|href)=["\']https?://',text)
  assert '公会会长——雪寂冬' in text and '80%' in text and 'WitnessChallengeUI' in text
  assert not any('成就规则' in n for n in z.namelist())
unchanged=[]
if (root/'10.06基线哈希.json').exists():
 for name,h in json.loads((root/'10.06基线哈希.json').read_text(encoding='utf-8')).items():
  f=Path(name)
  if f.exists():assert hashlib.sha256(f.read_bytes()).hexdigest()==h,name;unchanged.append(name)
for name,h in json.loads((root/'10.07基线哈希.json').read_text(encoding='utf-8')).items():
 f=root.parent/name
 if f.exists():assert hashlib.sha256(f.read_bytes()).hexdigest()==h,name;unchanged.append(name)
report={'gameVersion':'10.08','cultivationRulesVersion':10081,'passed':True,'themes':2,'oldFilesUnchanged':len(unchanged),'challengeIsolated':True,'engineSha256':hashlib.sha256((p/'battle-v13-browser.js').read_bytes()).hexdigest()}
(p/'output/1008/封装核对.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
