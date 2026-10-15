"""Portable source + test evidence bundle; excludes personal saves and old outputs."""
from pathlib import Path
import hashlib,json,zipfile
p=Path(__file__).resolve().parents[1];root=p.parent
files={}
def add(f):
 if f.is_file():files[str(f.relative_to(root)).replace('\\','/')]=f
def tree(folder):
 for f in folder.rglob('*'):
  if f.is_file() and not any(x in f.parts for x in ['__pycache__','.playwright-cli','node_modules']):add(f)
for folder in [p/'systems',p/'fixtures']:tree(folder)
for f in p.iterdir():
 if f.is_file() and (f.suffix in ['.js','.cjs','.css','.html','.svg'] or f.name in ['_full_package.py','_build_1006.py','_sync_systems.py','_sync_v13.py','_sync_story_data.py','verify-package-1006.py','story-source-1003.json']):add(f)
for f in (p/'tools').iterdir():
 if f.is_file() and (f.suffix=='.cjs' or f.name.startswith('browser-') or f.name=='verify-source-package-1006.py'):add(f)
add(Path(__file__))
for f in (p/'output').iterdir():
 if f.name.startswith('1006-source-rebuild'):continue
 if f.name.startswith('1006') or f.name=='10.06版封装核对.json':
  if f.is_dir():tree(f)
  else:add(f)
for f in (p/'output/playwright').glob('1006-*.png'):add(f)
tree(p/'output/playwright/fixtures')
for name in ['见证者公会战斗试玩.html','武魂十档候选库.json']:add(root/name)
tree(root/'晨曦城_朝阳前端组件')
for f in root.glob('10.06*.md'):add(f)
old=root/'见证者公会_V14_完整交接版_2026-10-15'
for sub in ['analysis_src','v14_work/src','v14_work/tests','audit_results']:tree(old/sub)
for sub in ['v14_work/load.cjs','v14_work/results/ai-loss-diagnostics.json','handover-state.json','build-manifest.json','README_先读我.txt']:add(old/sub)
manifest={name:{'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for name,f in sorted(files.items())}
out=root/'见证者公会_10.06版_模块化源码与验证.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for name,f in sorted(files.items()):z.write(f,'见证者公会10.06开发/'+name)
 z.writestr('见证者公会10.06开发/SOURCE_MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
 z.writestr('见证者公会10.06开发/开始阅读.txt','UTF-8源码。先读10.06版_交接文档.md。进入骰子系统运行python _full_package.py，随后node tools/check.cjs。需要Node.js与Python 3；无npm依赖。冻结V14参考为精简测试用目录，不是整份历史交接包。旧版脚本仅供历史参考，请以当前构建入口及systems/README.md为准。')
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 for name,m in manifest.items():assert hashlib.sha256(z.read('见证者公会10.06开发/'+name)).hexdigest()==m['sha256'],name
print(json.dumps({'files':len(files),'zipBytes':out.stat().st_size,'verified':True},ensure_ascii=False))
