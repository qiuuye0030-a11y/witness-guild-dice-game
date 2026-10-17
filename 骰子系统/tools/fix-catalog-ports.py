from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'tools/curate-catalog.cjs';s=f.read_text(encoding='utf-8')
s=s.replace('migrate(input,catalog){','migrate(input,catalog,creation=root.WitnessCreation){').replace('root.WitnessCreation.attributeKey(t)','creation.attributeKey(t)')
needle="fs.writeFileSync(path.join(p,'catalog.js'),'window.WITNESS_CATALOG='+JSON.stringify(kept)+';'+migration);"
s=s.replace(needle,needle+"\nfs.mkdirSync(path.join(p,'systems/catalog'),{recursive:true});fs.writeFileSync(path.join(p,'systems/catalog/revision.js'),migration+'\\nif(typeof module!==\\\"undefined\\\"&&module.exports)module.exports=globalThis.WitnessCatalogRevision;');")
f.write_text(s,encoding='utf-8')
f=p/'systems/campaign/core.js';s=f.read_text(encoding='utf-8')
if 'const CatalogRevision=' not in s:s=s.replace("const EVENTS=EventData.EVENTS;","const CatalogRevision=typeof module!=='undefined'&&module.exports?require('./systems/catalog/revision.js'):root.WitnessCatalogRevision;\nconst EVENTS=EventData.EVENTS;")
s=s.replace('globalThis.WitnessCatalogRevision?.migrate(snapshot,catalog)','CatalogRevision?.migrate(snapshot,catalog,Creation)')
f.write_text(s,encoding='utf-8')
print('浏览器与CJS迁移接口已统一')
