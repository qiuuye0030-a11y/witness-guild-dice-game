from pathlib import Path
import hashlib,json,shutil
p=Path(__file__).parent
base=(p/'battle-engine-v12-player.js').read_text(encoding='utf-8').split('// BEGIN V10 SHARED EXTENSION')[0]
engine=base+'// BEGIN V10 SHARED EXTENSION\n'+(p/'skill-effects.js').read_text(encoding='utf-8')+'\n'+(p/'combat-v10-extension.js').read_text(encoding='utf-8')
(p/'battle-engine-v12-player.js').write_text(engine,encoding='utf-8')
wrapper="""(function(host){
  const globalThis={};
  const WitnessControlV9={setConfig:(...args)=>globalThis.WitnessControlV9.setConfig(...args)};
  // BEGIN V12 PLAYER ENGINE
"""+engine+"""
  // END V12 PLAYER ENGINE
  host.WitnessBattle=globalThis.WitnessBattle;
  host.WitnessTemplates=globalThis.WitnessTemplates;
  host.WitnessV12Rules=globalThis.WitnessRules;
  host.WitnessControlV9=globalThis.WitnessControlV9;
  host.WitnessStackRules=globalThis.WitnessStackRules;
  host.WitnessTacticsV10=globalThis.WitnessTacticsV10;
})(window);
"""
(p/'battle-v12-browser.js').write_text(wrapper,encoding='utf-8')
(p/'battle.js').write_text("if(typeof module!=='undefined'&&module.exports){module.exports=require('./v12-runtime.cjs').WitnessBattle;}else{\n"+wrapper+'\n}\n',encoding='utf-8')
shutil.copyfile(p/'battle-ui-v12.js',p/'battle-ui.js')
f=p/'output/v12接入版本核对.json';meta=json.loads(f.read_text(encoding='utf-8'));meta['adaptedSha256']=hashlib.sha256((p/'battle-engine-v12-player.js').read_bytes()).hexdigest();meta['tacticsRulesVersion']=10;f.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
