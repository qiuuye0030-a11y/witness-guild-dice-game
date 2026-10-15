const fs=require('fs');
const path=require('path');
const vm=require('vm');
function load(fast=false){
 const box={console,structuredClone,crypto:require('crypto').webcrypto,Date,performance};
 box.window=box;box.globalThis=box;
 const saved=new Map();box.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)};
 if(!fast)vm.createContext(box);
 for(const id of [0,1,2,3,4,6,7,11,12,13,14,15,16,17,18]){
  const source=fs.readFileSync(path.join(__dirname,`script_${id}.js`),'utf8');
  if(fast)new Function('window','globalThis','module','exports','require','localStorage','crypto',source)(box,box,undefined,undefined,undefined,box.localStorage,box.crypto);
  else vm.runInContext(source,box,{filename:`script_${id}.js`});
 }
 return box;
}
module.exports={load};
if(require.main===module){const b=load();for(const [k,v]of Object.entries(b))if(k.startsWith('Witness')&&k!=='WitnessPortraits')console.log(k,typeof v,Object.keys(v));console.log('Battle methods',Object.getOwnPropertyNames(b.WitnessBattle.Battle.prototype));console.log('Campaign methods',Object.getOwnPropertyNames(b.WitnessCampaign.Campaign.prototype));console.log('Draft methods',Object.getOwnPropertyNames(b.WitnessCreation.Draft.prototype));console.log('examiners',JSON.stringify(b.WitnessBattle.EXAMINERS));}
