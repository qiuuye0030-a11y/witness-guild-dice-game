"""Build compatibility entry files from canonical systems; no save migration."""
from pathlib import Path
import json

p=Path(__file__).resolve().parent
header='// Generated from systems/. Edit the corresponding module, then run _sync_systems.py.\n'
(p/'core.js').write_text(header+(p/'systems/dice/engine.js').read_text(encoding='utf-8'),encoding='utf-8')
manifest=json.loads((p/'systems/campaign/manifest.json').read_text(encoding='utf-8'))
campaign='\n'.join((p/'systems/campaign'/name).read_text(encoding='utf-8') for name in manifest['modules'])
(p/'campaign.js').write_text(header+'(function(){\n'+campaign+'\n})();\n',encoding='utf-8')
legacy=json.loads((p/'systems/events/legacy-events.json').read_text(encoding='utf-8'))
literal=json.dumps(legacy,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
legacyjs="// Generated compatibility data for old saves.\n(function(root){const events="+literal+";if(typeof module!=='undefined'&&module.exports)module.exports=events;else root.WitnessLegacyEvents=events;})(typeof globalThis==='undefined'?this:globalThis);\n"
(p/'systems/events/legacy-data.js').write_text(legacyjs,encoding='utf-8')
(p/'campaign-events.js').write_text(header+legacyjs+'\n'+(p/'systems/events/scenes.js').read_text(encoding='utf-8'),encoding='utf-8')
print('Dice, event catalog and campaign entry files synchronized.')
