from pathlib import Path
import json
p=Path(__file__).resolve().parents[1]
def edit(f,fn):
    path=p/f;path.write_text(fn(path.read_text(encoding='utf-8')),encoding='utf-8')
edit('tools/verify-v11.cjs',lambda s:s.replace("assert(x.WitnessTraitRegistry.getBySoulId('npc-'+t.id))","assert.equal(x.WitnessTraitRegistry.getBySoulId('npc-'+t.id),null)"))
edit('systems/traits/test.cjs',lambda s:s.replace('assert.equal(source.npcs.length,17)','assert.equal(source.npcs.length,0)').replace("assert.equal(registry.getForCharacter({soul:{id:'npc-qinyan'}}).soulName,'极光')","assert.equal(registry.getForCharacter({soul:{id:'npc-qinyan'}}),null)").replace('),2464)', '),2447)'))
edit('tools/verify-edges-v11.cjs',lambda s:s.replace("v11 · 魂性谱版","v11.01 · 魂性谱版").replace('/^见证者公会_v11版_', '/^见证者公会_v11\\.01版_'))
edit('tools/verify-naming-v11.cjs',lambda s:s.replace('.size,2464)', '.size,2447)').replace('expanded.uniqueNames,2465)', 'expanded.uniqueNames,2448)').replace('assert.deepEqual(t.spec,a.spec);',"assert.deepEqual(t.spec,{...a.spec,event:({basic_action:'attack_skill',basic_skill_switch:'attack_skill_switch'})[a.spec.event]||a.spec.event});"))
edit('tools/verify-quests-v11.cjs',lambda s:s.replace("gameVersion,'v11'","gameVersion,'v11.01'").replace("gameVersion, 'v11'","gameVersion, 'v11.01'"))
edit('tools/check-v11.cjs',lambda s:s.replace("const tests=[","const tests=['tools/verify-v1101.cjs',").replace("gameVersion:'v11'","gameVersion:'v11.01'"))
data=json.loads((p/'systems/traits/traits.json').read_text(encoding='utf-8'))
changes=data.get('nameMigration',{}).get('changes',[])
if changes:
    import csv
    with (p/'systems/traits/命名映射.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(['武魂ID','主属性','关键词','旧名','新名']);w.writerows([[r[k] for k in ['soulId','attribute','keyword','oldName','newName']] for r in changes])
edit('chenxi-game.css',lambda s:s+'\n/* Necessary guidance must remain readable against the dawn paper. */\n.chenxi-mode :is(#campBody,#campSidebar) :is(.micro,.camp-note){color:#365c58;opacity:1;}\n')
print('v11.01 verification and display metadata prepared')
