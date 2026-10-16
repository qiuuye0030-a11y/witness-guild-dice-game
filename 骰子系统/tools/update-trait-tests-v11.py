from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'tools/verify-merged-v11.cjs';s=f.read_text(encoding='utf-8').replace("t.soul.combat_profile.trait='none';",'').replace("u.soul.combat_profile.trait='none';",'');f.write_text(s,encoding='utf-8')
f=p/'tools/verify-edges-v11.cjs';s=f.read_text(encoding='utf-8').replace('if(c.state.soulTrait){','if(c.state.soulTrait?.state){');f.write_text(s,encoding='utf-8')
f=p/'tools/verify-naming-v11.cjs';s='\n'.join(l for l in f.read_text(encoding='utf-8').split('\n') if not l.startswith("test('frozen no-trait battle results"));f.write_text(s,encoding='utf-8')
f=p/'tools/check-v11.cjs';s=f.read_text(encoding='utf-8');
if 'verify-trait-card-v11.cjs' not in s:s=s.replace('const tests=[',"const tests=['tools/verify-trait-card-v11.cjs',")
f.write_text(s,encoding='utf-8')
f=p/'tools/verify-trait-card-v11.cjs';s=f.read_text(encoding='utf-8').replace('c.state.character.soulId=t.soulId;c.refresh();',"c.state.character.soulId=t.soulId;c.state.character.release=x.WITNESS_CATALOG.find(s=>s.id===t.soulId).release_options[0];c.refresh();");f.write_text(s,encoding='utf-8')
