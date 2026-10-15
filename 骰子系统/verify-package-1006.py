from pathlib import Path
import hashlib,json,re,zipfile
p=Path(__file__).resolve().parent;root=p.parent
manifest=json.loads((p/'output/10.06版封装核对.json').read_text(encoding='utf-8'))
sha=lambda b:hashlib.sha256(b).hexdigest()
engine=(p/'battle-v13-browser.js').read_text(encoding='utf-8')
frozen=json.loads((p/'output/1006-final/final.manifest.json').read_text(encoding='utf-8'))
assert sha((p/'battle-v13-browser.js').read_bytes())==frozen['source'],'Engine changed since frozen final validation'
archive=root/'见证者公会_10.06版_双前端分享包.zip'
checks=[]
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert not any('成就规则' in n for n in z.namelist()),'Hidden achievement spoiler included in player archive'
 for theme,meta in manifest['editions'].items():
  f=root/f'见证者公会_10.06版_{theme}.html';data=f.read_bytes();html=data.decode('utf-8').replace('\r\n','\n')
  assert sha(data)==meta['sha256']
  assert z.read('见证者公会10.06/'+theme+'.html')==data
  assert (root/'10.06版双前端分享'/f'{theme}.html').read_bytes()==data
  assert engine.replace('</script','<\\/script') in html
  assert "code.value.trim()!=='witness'" in html
  assert '衣角微脏' in html and '微芒成炬' in html
  assert '<title>见证者公会 10.06版' in html
  assert not re.search(r'<(?:script|link)[^>]+(?:src|href)=["\'](?:https?:|\./)',html)
  checks.append({'theme':theme,'bytes':len(data),'sha256':sha(data),'selfContained':True,'archiveMatches':True})
for name,digest in manifest['sources'].items():assert sha((p/name).read_bytes())==digest,name
(p/'output/1006-package-validation.json').write_text(json.dumps({'passed':True,'editions':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS: two offline editions, same frozen engine, source hashes and ZIP contents verified.')
