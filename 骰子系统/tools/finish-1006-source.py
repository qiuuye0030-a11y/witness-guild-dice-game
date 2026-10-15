from pathlib import Path
import json,re
p=Path(__file__).resolve().parents[1]
f=p/'campaign-ui.js';s=f.read_text(encoding='utf-8').replace('10.05版','10.06版').replace("localStorage.getItem(KEY)||", "localStorage.getItem(KEY)||localStorage.getItem('witness-complete-game-v1005')||");f.write_text(s,encoding='utf-8')
f=p/'systems/battle/manifest.json';m=json.loads(f.read_text(encoding='utf-8'));m['modules']=[x for x in m['modules'] if x not in ['decision.js','poison-ai.js']];f.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
f=p/'systems/battle/core.js';s=f.read_text(encoding='utf-8');start=s.index('  const aiChoice=function');end=s.index('  const nextTime=',start);s=s[:start]+s[end:];s=s.replace(',scheduleAI,aiChoice,nextTime',',scheduleAI,nextTime');f.write_text(s,encoding='utf-8')
f=p/'systems/battle/forecast.js';s=f.read_text(encoding='utf-8');
# Preserve the three public sequence utilities for compatibility, remove unused scoring policies.
for name in ['compactEnabled','aiStrike','scoreControlVariant','compactActionScore']:
 match=re.search(r'^  const '+name+r'=function',s,re.M)
 if match:
  end=re.search(r'^  (?:const \w+=function|return \{methods:)',s[match.end():],re.M);assert end,name
  s=s[:match.start()]+s[match.end()+end.start():]
s=s.replace('  const scoreUnderlyingControl=ControlActions.methods.scoreControlVariant;','').replace('methods:{compactEnabled,aiStrike,aiAvailable,aiSequence,aiThreatValue,scoreControlVariant,compactActionScore}','methods:{aiAvailable,aiSequence,aiThreatValue}')
f.write_text(s,encoding='utf-8')
f=p/'verify-structure.cjs';s=f.read_text(encoding='utf-8').replace('_build_1005.py','_build_1006.py').replace('combatRulesVersion,13','combatRulesVersion,14');f.write_text(s,encoding='utf-8')
f=p/'systems/campaign/manifest.json';m=json.loads(f.read_text(encoding='utf-8'));m['version']='10.06';f.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
