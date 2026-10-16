from pathlib import Path
import zipfile,subprocess,sys,json,hashlib
p=Path(__file__).resolve().parents[1];root=p.parent
dest=p/'output/1008-rollback-clean-rebuild'
assert not dest.exists(),'Use a fresh clean rebuild directory'
dest.mkdir(parents=True)
with zipfile.ZipFile(root/'见证者公会_10.08版_模块化源码与验证.zip') as z:
 for name in z.namelist():
  target=(dest/name).resolve();assert target.is_relative_to(dest.resolve())
 z.extractall(dest)
clean=dest/'见证者公会10.08开发';cwd=clean/'骰子系统'
for command in [[sys.executable,'_full_package.py'],['node','tools/check.cjs'],[sys.executable,'verify-package-1008.py']]:subprocess.run(command,cwd=cwd,check=True)
hashes={}
for label in ['经典深靛版','晨曦朝阳版']:
 name=f'见证者公会_10.08版_{label}.html';assert (clean/name).read_bytes()==(root/name).read_bytes(),name
 hashes[label]=hashlib.sha256((root/name).read_bytes()).hexdigest()
report={'passed':True,'cleanRebuild':True,'byteIdenticalThemes':hashes,'checks':'mechanisms, journeys, achievements, quests and package'}
(p/'output/1008/源码清洁重建.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS: clean source package rebuilds byte-identical 10.08 themes and all checks pass.')
