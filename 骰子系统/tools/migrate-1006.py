"""One-time, guarded migration of frozen V14 behavior into canonical modules."""
from pathlib import Path
import json,re,zipfile
p=Path(__file__).resolve().parents[1]
handover=p.parent/'见证者公会_V14_完整交接版_2026-10-15'
src=handover/'v14_work/src'
backup=p.parent/'历史完整游戏/10.05模块化源码_10.06开发前.zip'
if backup.exists(): raise SystemExit('Migration already backed up; do not rerun.')
with zipfile.ZipFile(backup,'w',zipfile.ZIP_DEFLATED) as z:
    for f in p.rglob('*'):
        if f.is_file() and not any(x in f.relative_to(p).parts for x in ['output','node_modules','__pycache__']): z.write(f,f.relative_to(p))
def read(f): return f.read_text(encoding='utf-8')
def write(f,s): f.write_text(s,encoding='utf-8')
def edit(f,a,b):
    s=read(f)
    assert a in s,(f,a[:90])
    write(f,s.replace(a,b))

# Shield actions are explicit module functions. Public methods are installed once.
s=read(src/'battle-v14-mechanics.js')
start=s.index('  const copy =')
end=s.index('  const oldNextTime =')
s=s[start:end]
s=s.replace('  const oldTargets = p.targetOptions;', '  const oldTargets = MemberActions.methods.targetOptions;').replace('  const oldCommand = p.command;', '  const oldCommand = MemberActions.methods.command;').replace('  const oldPlan = p.plan;', '  const oldPlan = MemberActions.methods.plan;')
s=re.sub(r'  p\.(\w+) = function',r'  const \1 = function',s)
names=re.findall(r'  const (\w+) = function',s)
init='''
  function initialize(battle) {
    battle.combatRulesVersion=14; battle.v14ShieldVersion=1;
    battle.expireShields();
    battle.shieldLayerSequence=Math.max(number(battle.shieldLayerSequence),0,...battle.units.flatMap(u=>u.shieldLayers.map(l=>number(l.order))));
    for(const unit of battle.units){
      if(selfOnly(unit.cast?.skill))unit.cast.target=unit.id;
      for(const skill of unit.skills)if(selfOnly(skill))skill.target='仅自身';
    }
  }
  root.WitnessMechanicsV14={version:14,shieldVersion:1,rules:'outer-first; same-caster-skill-refresh; independent-channels; legacy-layer-expires',channelName,selfOnly};
  root.WitnessBattle.mechanicsVersion=14;
'''
write(p/'systems/battle/shields.js', 'const ShieldActions=(function(root){\n'+s+init+'return {initialize,methods:{'+','.join(names)+'}};\n})(globalThis);\n')

# Constructor owns migration; no replacement class or prototype patch chain.
f=p/'systems/battle/core.js'
edit(f,"snapshot.combatRulesVersion!==13", "![13,14].includes(snapshot.combatRulesVersion)")
edit(f,"if(snapshot){if(","if(snapshot){if(snapshot.combatRulesVersion===14&&snapshot.v14ShieldVersion!==1)throw Error('不支持的V14护盾存档版本');if(")
edit(f,'this.controlRules={...(snapshot.controlRules||root.WitnessControlV9.getConfig())};return;', 'this.controlRules={...(snapshot.controlRules||root.WitnessControlV9.getConfig())};ShieldActions.initialize(this);return;')
edit(f,'this.scheduleAI();this.controlRules=', 'ShieldActions.initialize(this);this.scheduleAI();this.controlRules=')
# Expiration is called at the original scheduling and time boundaries.
for name in ['nextTime','scheduleAI','tick']:
    text=read(f); pattern=r'(const '+name+r'=function\([^)]*\)\{)'
    text,n=re.subn(pattern,r'\1this.expireShields();',text);assert n==1,(name,n);write(f,text)
f=p/'systems/battle/attributes.js'
edit(f,'const snapshot=function(){return {version:10,','const snapshot=function(){this.expireShields();return {v14ShieldVersion:1,shieldLayerSequence:this.shieldLayerSequence||0,version:10,')
edit(f,'combatRulesVersion:13','combatRulesVersion:14')

# Prediction refers directly to the canonical action functions.
s=read(src/'battle-v14-projection.js')
s=s.replace('(function(root){','const BattleProjection=(function(root){',1)
s=s.replace('const B=root.WitnessBattle, R=root.WitnessV13Rules, p=B.Battle.prototype;', 'const B=root.WitnessBattle, R=root.WitnessRules;')
s=s.replace('const base={plan:p.plan,hit:p.hit,tryControl:p.tryControl,applyDamage:p.applyDamage,heal:p.heal};','const base={plan:ShieldActions.methods.plan,hit:MemberActions.methods.hit,tryControl:MemberActions.methods.tryControl,applyDamage:ShieldActions.methods.applyDamage,heal:BattleCore.methods.heal};')
s=s.replace('effective=p.effective','effective=AttributeActions.methods.effective')
names=re.findall(r'p\.(\w+)=function',s)
s=re.sub(r'p\.(\w+)=function',r'const \1=function',s)
s=s.replace('})(window);','return {methods:{'+','.join(names)+'}};\n})(globalThis);').replace('})(globalThis);','})(globalThis);')
if 'return {methods:' not in s:s=s.replace('})(globalThis);','return {methods:{'+','.join(names)+'}};\n})(globalThis);')
write(p/'systems/battle/projection.js',s)
s=read(src/'battle-v14-ai.js').replace('(function(root){','const UnifiedDecision=(function(root){',1).replace('const B=root.WitnessBattle,p=B.Battle.prototype;','const B=root.WitnessBattle;')
names=re.findall(r'p\.(\w+)=function',s);s=re.sub(r'p\.(\w+)=function',r'const \1=function',s)
s=s.replace('})(window);','return {methods:{'+','.join(names)+'}};\n})(globalThis);')
write(p/'systems/battle/unified-decision.js',s)
f=p/'systems/battle/compose.js';s=read(f)
for module in ['ShieldActions','BattleProjection','UnifiedDecision']:
    file={'ShieldActions':'shields','BattleProjection':'projection','UnifiedDecision':'unified-decision'}[module]
    code=read(p/f'systems/battle/{file}.js')
    names=re.search(r'return \{(?:initialize,)?methods:\{([^}]+)\}',code).group(1).split(',')
    for name in names:
        pattern=r'    '+name+r':[^,\n]+'
        if re.search(pattern,s):s=re.sub(pattern,'    '+name+':'+module+'.methods.'+name,s)
        else:s=s.replace('  const methods={','  const methods={\n    '+name+':'+module+'.methods.'+name+',')
write(f,s)
f=p/'systems/battle/manifest.json';m=json.loads(read(f));m['modules'][-1:-1]=['shields.js','projection.js','unified-decision.js'];m.update(version='10.06',combatRulesVersion=14);m['publicMethods']=len(re.findall(r'^    \w+:',s,re.M));write(f,json.dumps(m,ensure_ascii=False,indent=2))
f=p/'systems/campaign/core.js';edit(f,'s.battleSnapshot.combatRulesVersion!==13','![13,14].includes(s.battleSnapshot.combatRulesVersion)')
f=p/'systems/campaign/journey.js';edit(f,"gameVersion:'10.05'","gameVersion:'10.06'")
f=p/'_sync_v13.py';edit(f,'  host.WitnessTacticsV10=globalThis.WitnessTacticsV10;', '  host.WitnessTacticsV10=globalThis.WitnessTacticsV10;\n  host.WitnessMechanicsV14=globalThis.WitnessMechanicsV14;\n  host.WitnessProjectionV14=globalThis.WitnessProjectionV14;\n  host.WitnessAIV14=globalThis.WitnessAIV14;')
edit(f,"'combatRulesVersion':13","'combatRulesVersion':14")
edit(f,'V13 behavior unchanged','V14 canonical modular implementation')

# Merge text helpers into the original module; one export, no describe override.
old=read(p/'skill-text.js');body=old[old.index('  function describe'):old.index('  const api=')] if '  const api=' in old else old[old.index('  function describe'):old.index('  root.WitnessSkillText')]
body=body.replace('function describe(', 'function describeBase(',1)
s=read(src/'battle-v14-ui.js');s=s[s.index('  const cache='):s.index('  root.WitnessSkillText.describe=')].replace('originalDescribe(','describeBase(')
write(p/'skill-text.js',"(function(root){\n'use strict';\n"+body+s+"\nroot.WitnessSkillText={describe};\nroot.WitnessUIV14={version:14,describe,shieldBadges,costDetails,correctedText,cardDescription,clearPreviewCache:battle=>cache.delete(battle)};\n})(typeof globalThis==='undefined'?this:globalThis);\n")
import importlib.util
spec=importlib.util.spec_from_file_location('v14build',handover/'v14_work/build_package.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
write(p/'battle-ui-v13.js',mod.patch_battle_ui(read(p/'battle-ui-v13.js')))
print('V14 behavior migrated into canonical modules; backup:',backup)
