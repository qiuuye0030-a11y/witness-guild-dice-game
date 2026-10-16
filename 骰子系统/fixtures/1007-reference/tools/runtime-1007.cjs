const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
function load({candidate=false}={}){
 const box={console,structuredClone,crypto:require('crypto').webcrypto,Date,performance};box.window=box;box.globalThis=box;
 const saved=new Map();box.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)};
 for(const file of ['core.js','catalog.js','combat-rules-v13.js','skill-effects.js','rules.js','battle-v13-browser.js','skill-text.js','achievements.js','campaign-creation.js','story-data.js','campaign-events.js','campaign.js','systems/challenge/state.js']){
  let source=fs.readFileSync(path.join(root,file),'utf8');
  if(candidate&&file==='battle-v13-browser.js')source=source.replace('horizon:Math.min(18,','horizon:Math.min(24,').replace('n<2&&normalActions<1','n<4&&normalActions<2');
  new Function('window','globalThis','module','exports','require','localStorage','crypto',source)(box,box,undefined,undefined,undefined,box.localStorage,box.crypto);
 }
 return box;
}
module.exports={load};
