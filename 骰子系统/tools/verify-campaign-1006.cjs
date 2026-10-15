// Compare full journeys, permitting only the declared version metadata and
// immutable initial-potential field added for the new achievement.
const fs=require('fs'),path=require('path'),{createRequire}=require('module');
const root=path.resolve(__dirname,'..'),file=path.join(root,'verify-refactor-campaign.cjs');
let s=fs.readFileSync(file,'utf8');
s=s.replace('const plain=x=>JSON.parse(JSON.stringify(x));',`const plain=x=>{
 const v=JSON.parse(JSON.stringify(x));if(!v)return v;if(v.gameVersion)v.gameVersion='10.05';
 if(v.character?.initialPotential!==undefined){assert.equal(v.character.initialPotential,v.draft?.results?.tier??v.character.initialPotential);delete v.character.initialPotential;}
 return v;
};`);
s=s.replace("'output/10.05重构_培养逐步对照.json'","'output/1006-campaign-paired.json'").replace('allSnapshotsExactlyEqual:true','equalExceptDeclaredVersionAndInitialPotential:true');
new Function('require','__dirname',s)(createRequire(file),root);
