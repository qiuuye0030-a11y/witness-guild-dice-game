const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname;
for(const system of ['battle','campaign']){
 const dir=path.join(root,'systems',system),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
 for(const f of manifest.modules){assert.ok(fs.existsSync(path.join(dir,f)),f);const text=fs.readFileSync(path.join(dir,f),'utf8');assert.doesNotMatch(text,/\b(?:proto|P|p)\.[A-Za-z_$][\w$]*\s*=\s*function\b/,system+'/'+f+' prototype patch');assert.doesNotMatch(text,/\bconst\s+old[A-Z]\w*\s*=\s*(?:proto|P|p|R)\.\w+\s*;/,system+'/'+f+' captured replacement');}
 const compose=fs.readFileSync(path.join(dir,'compose.js'),'utf8'),body=compose.match(/const methods=\{([\s\S]*?)\n\s*\};/)[1],names=[...body.matchAll(/\b(\w+)\s*:/g)].map(x=>x[1]);assert.equal(new Set(names).size,names.length,'Duplicate public methods');
}
const build=fs.readFileSync(path.join(root,'_build_1005.py'),'utf8');assert.doesNotMatch(build,/script\(['"](?:quest-runtime|journey-1002|combat-v13-extension|combat-v13-members)\.js/);
assert.equal(require('./systems/battle/manifest.json').combatRulesVersion,13);
console.log('PASS: canonical modules exist, unique public methods, no prototype replacement chain.');
