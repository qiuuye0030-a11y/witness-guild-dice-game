from pathlib import Path
import zipfile,json,hashlib,subprocess,sys
p=Path(__file__).resolve().parents[1];root=p.parent
archive=root/'见证者公会_10.06版_模块化源码与验证.zip'
dest=p/'output/1006-source-rebuild'
if dest.exists():raise SystemExit('Use a new empty verification directory; existing evidence is preserved.')
dest.mkdir()
with zipfile.ZipFile(archive) as z:
 for item in z.infolist():
  target=(dest/item.filename).resolve();target.relative_to(dest.resolve())
 z.extractall(dest)
checkout=dest/'见证者公会10.06开发/骰子系统'
for args in [[sys.executable,'_full_package.py'],['node','tools/verify-integration-1006.cjs'],['node','tools/verify-achievements-1006.cjs'],[sys.executable,'verify-package-1006.py']]:
 subprocess.run(args,cwd=checkout,check=True)
for theme in ['经典深靛版','晨曦朝阳版']:
 name=f'见证者公会_10.06版_{theme}.html'
 assert (checkout.parent/name).read_bytes()==(root/name).read_bytes(),theme
(p/'output/1006-source-portability.json').write_text(json.dumps({'passed':True,'cleanExtraction':True,'rebuildByteIdentical':True,'integrationPassed':True,'achievementsPassed':True},indent=2),encoding='utf-8')
print('PASS: portable source archive rebuilds byte-identical games in a fresh directory.')
