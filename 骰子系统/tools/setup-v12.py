"""One-time canonical wiring for the isolated v12 checkout."""
from pathlib import Path
import json
p=Path(__file__).resolve().parents[1]
def edit(name,a,b):
 f=p/name;t=f.read_text(encoding='utf-8');assert a in t,(name,a[:90]);f.write_text(t.replace(a,b),encoding='utf-8')
for name,extras in [('systems/battle/manifest.json',None),('systems/campaign/manifest.json',None)]:
 f=p/name;m=json.loads(f.read_text(encoding='utf-8'));m['version']='v12'
 if 'battle' in name:
  i=m['modules'].index('compose.js');m['modules'][i:i]=['../v12/modules-bundle.js','../v12/battle.js'];m['modules'].append('../v12/models.js')
 else:m['modules'].insert(m['modules'].index('compose.js'),'v12.js')
 f.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
edit('systems/battle/compose.js','  Object.defineProperties(root.WitnessBattle.Battle.prototype','  Object.assign(methods,V12Battle.wrap(methods));\n  Object.defineProperties(root.WitnessBattle.Battle.prototype')
edit('systems/battle/core.js',"enemyLevelOverride=null}){","enemyLevelOverride=null,huntPlan=null}){\n      if(huntPlan&&!snapshot){V12Battle.initializeBattle(this,{huntPlan,seed});return;}")
edit('systems/battle/core.js','this.advanceGauge(next-this.now);this.now=next;','this.advanceGauge(next-this.now);this.now=next;if(this.v12Pulse)this.v12Pulse();')
edit('systems/campaign/compose.js','Object.defineProperties(Campaign.prototype','CampaignV12.install(methods);\nObject.defineProperties(Campaign.prototype')
edit('systems/campaign/compose.js','Campaign.validate=CampaignModern.methods.static_validate;','Campaign.validate=CampaignV12.validate;')
edit('systems/campaign/compose.js','CHAINS:EventData.CHAINS','V12:CampaignV12,CHAINS:EventData.CHAINS')
edit('systems/campaign/core.js',"'battle','ending'].includes(s.phase))throw Error('不是可兼容", "'battle','ending','v12Hunt'].includes(s.phase))throw Error('不是可兼容")
edit('systems/campaign/core.js',"c.bones.length+c.boneInventory.length>6", "c.bones.length>6||c.boneInventory.length>100")
edit('systems/campaign/core.js',"new Set(bones.map(x=>x.slot)).size!==bones.length", "new Set(c.bones.map(x=>x.slot)).size!==c.bones.length")
edit('systems/campaign/core.js',"const reserved=this.questReserved(),eligible=event=>!event.chainOnly", "const reserved=this.questReserved(),eligible=event=>event.id!=='E02'&&!event.chainOnly")
edit('systems/campaign/core.js',"if(s.character.boneInventory.length){const resonance=choices.find(x=>x.event.id==='E02');if(resonance)selected=resonance;}","// v12: bone absorption/replacement never reserves a cultivation event.")
edit('_sync_v13.py',"  host.WitnessScarredChallenge=globalThis.WitnessScarredChallenge;","  host.WitnessScarredChallenge=globalThis.WitnessScarredChallenge;\n  host.WitnessV12=globalThis.WitnessV12;\n  host.WitnessV12Live=globalThis.WitnessV12Live;")
edit('systems/v12/modules/src/splice/compose.js',"reward: { inheritance, transaction: rewardTransaction,", "reward: { ring: require('../reward/ring'), inheritance, transaction: rewardTransaction,")
edit('systems/campaign/v12.js',"RT().WitnessV12Ring.handleNinthRing", "A.reward.ring.handleNinthRing")
edit('systems/v12/modules/tools/build-beasts.cjs',"exitRule: 'hp-zero'", "exitRule: 'hp-or-spirit-zero'")
lib=p/'systems/v12/modules/data/beast/library.json';data=json.loads(lib.read_text(encoding='utf-8'))
for beast in data['beasts']:beast['exitRule']='hp-or-spirit-zero'
lib.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
src=p/'_build_v11.py';t=src.read_text(encoding='utf-8').replace('v11.01','v12').replace('武魂精简版','讨伐与魂骨版')
t=t.replace("for entry in ['_sync_systems.py','_sync_v13.py']:","for entry in ['_build_v12_modules.py','_sync_systems.py','_sync_v13.py']:")
t=t.replace("for name in ['讨伐与魂骨版_更新说明.md',","for name in ['v12_更新说明.md',")
t=t.replace("p/'_build_v11.py'","p/'_build_v12.py'")
(p/'_build_v12.py').write_text(t,encoding='utf-8')
print('v12 manifests, source and packager wired')
