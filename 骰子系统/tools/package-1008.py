from pathlib import Path
import zipfile,hashlib,json,shutil
p=Path(__file__).resolve().parents[1];root=p.parent
files={}
def add(f):
 if f.is_file():files[f.relative_to(root).as_posix()]=f
def tree(folder):
 for f in folder.rglob('*'):
  if f.is_file() and '__pycache__' not in f.parts:add(f)
for folder in [p/'systems',p/'fixtures']:tree(folder)
for name in ['core.js','catalog.js','combat-rules-v13.js','skill-effects.js','rules.js','battle-engine-v13-player.js','battle-v13-browser.js','battle.js','v13-runtime.cjs','skill-text.js','battle-ui-v13.js','achievements.js','campaign-creation.js','story-data.js','story-source-1003.json','campaign-events.js','campaign.js','campaign-ui.js','campaign.css','dawn.css','journey.css','campaign.html','chenxi-game.css','chenxi-dice-art.css','chenxi-dice.css','chenxi-adapter.js','chenxi-dice-defs.svg','_full_package.py','_build_1008.py','_sync_systems.py','_sync_v13.py','_sync_story_data.py','verify-package-1008.py','verify-quests-1005.cjs']:add(p/name)
for f in (p/'tools').iterdir():
 if f.is_file() and f.name!='analyze-talent-before-rollback-1008.cjs' and ('1008' in f.name or f.name in ['check.cjs','verify-achievements-1006.cjs']):add(f)
tree(p/'output/1008')
for f in (p/'output/playwright').glob('1008-rollback-*'):add(f)
for name in ['见证者公会战斗试玩.html','武魂十档候选库.json','10.06基线哈希.json','10.08版_更新说明.md','10.08版_交接与验收.md','10.08版_平衡对照.md','10.08版_数值回调_100格验算报告.md','10.08版_当前开发入口.md']:
 assert (root/name).is_file(),name
 add(root/name)
tree(root/'晨曦城_朝阳前端组件')
tree(root/'10.08交接资料')
add(root/'10.07基线哈希.json')
manifest={name:hashlib.sha256(f.read_bytes()).hexdigest() for name,f in sorted(files.items())}
dest=root/'见证者公会_10.08版_模块化源码与验证.zip'
with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for name,f in sorted(files.items()):z.write(f,'见证者公会10.08开发/'+name)
 z.writestr('见证者公会10.08开发/SOURCE_MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
 z.writestr('见证者公会10.08开发/先读我.txt','先读10.08版_交接与验收.md。进入骰子系统运行python _full_package.py，再node tools/check.cjs和python verify-package-1008.py。仅需Node.js和Python标准库。挑战代码在systems/challenge；普通考官池不含会长。')
with zipfile.ZipFile(dest) as z:
 assert z.testzip() is None
 for name,h in manifest.items():assert hashlib.sha256(z.read('见证者公会10.08开发/'+name)).hexdigest()==h
module=root/'见证者公会_10.08版_独立挑战模块.zip'
with zipfile.ZipFile(module,'w',zipfile.ZIP_DEFLATED) as z:
 for f in (p/'systems/challenge').rglob('*'):
  if f.is_file():z.write(f,f.relative_to(p).as_posix())
 z.write(root/'10.08版_交接与验收.md','10.08版_交接与验收.md')
 z.writestr('接入说明.txt','独立挑战源在systems/challenge。依赖10.08共享引擎modern.js、Battle/Campaign单次装配及campaign-ui的显式接入点。此包不单独包含完整游戏或普通考官数据；以完整10.08源码包为运行环境，不直接混入旧10.06成品。')
print(json.dumps({'sourceFiles':len(files),'sourceBytes':dest.stat().st_size,'challengeModuleBytes':module.stat().st_size,'verified':True},ensure_ascii=False))
