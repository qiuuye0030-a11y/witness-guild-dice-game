from pathlib import Path
import hashlib,json
p=Path(__file__).parent
(p/'output').mkdir(exist_ok=True)
f=p/'battle-engine-v13-player.js'
manifest=json.loads((p/'systems/battle/manifest.json').read_text(encoding='utf-8'))
engine='// Generated from systems/battle/manifest.json; do not edit this bundle.\n(function(){\n'+'\n'.join((p/'systems/battle'/name).read_text(encoding='utf-8') for name in manifest['modules'])+'\n})();\n'
f.write_text(engine,encoding='utf-8')
wrapper='''(function(host){
  const globalThis={WitnessRules:host.WitnessRules};
  const WitnessControlV9={setConfig:(...args)=>globalThis.WitnessControlV9.setConfig(...args)};
  // BEGIN V13 PLAYER ENGINE
'''+engine+'''
  // END V13 PLAYER ENGINE
  host.WitnessRules=globalThis.WitnessRules;
  host.WitnessTraits=globalThis.WitnessTraits;
  host.WitnessTraitBalance=globalThis.WitnessTraitBalance;
  host.WitnessTraitRegistry=globalThis.WitnessTraitRegistry;
  host.WitnessTraitRuntime=globalThis.WitnessTraitRuntime;
  host.WitnessBattle=globalThis.WitnessBattle;
  host.WitnessTemplates=globalThis.WitnessTemplates;
  host.WitnessV13Rules=globalThis.WitnessRules;
  host.WitnessControlV9=globalThis.WitnessControlV9;
  host.WitnessStackRules=globalThis.WitnessStackRules;
  host.WitnessTacticsV10=globalThis.WitnessTacticsV10;
  host.WitnessMechanicsV14=globalThis.WitnessMechanicsV14;
  host.WitnessProjectionV14=globalThis.WitnessProjectionV14;
  host.WitnessAIV14=globalThis.WitnessAIV14;
})(window);
'''
(p/'battle-v13-browser.js').write_text(wrapper,encoding='utf-8')
(p/'battle.js').write_text("if(typeof module!=='undefined'&&module.exports){module.exports=require('./v13-runtime.cjs').WitnessBattle;}else{\n"+wrapper+'\n}\n',encoding='utf-8')
meta={'combatRulesVersion':17,'playerRulesVersion':2,'tacticsRulesVersion':1007,'snapshotVersion':10,'baseV12Sha256':hashlib.sha256((p/'fixtures/v12-player-baseline.js').read_bytes()).hexdigest(),'adaptedSha256':hashlib.sha256(f.read_bytes()).hexdigest(),'source':'canonical systems/battle modules; V14 canonical modular implementation','modules':manifest['modules']}
(p/'output/v13接入版本核对.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
print('v13 shared engine synchronized')
