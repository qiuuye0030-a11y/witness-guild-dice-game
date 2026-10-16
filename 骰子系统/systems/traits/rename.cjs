/* Run without flags to preview; --apply persists names and rebuilds portable data. */
'use strict';
const fs=require('fs'),path=require('path'),api=require('./index.js'),N=require('./naming.js'),dir=__dirname,file=path.join(dir,'traits.json');
function rename({apply=false,seed='属性命名-v11',force=false}={}){
 const previous=JSON.parse(fs.readFileSync(file,'utf8')),upgraded=api.upgrade(previous),before=new Map(upgraded.items.map(t=>[t.soulId,api.fingerprint(t)]));
 for(let i=0;i<previous.items.length;i++)if(JSON.stringify(previous.items[i].spec)!==JSON.stringify(upgraded.items[i].spec))throw Error('预算迁移改变了被动结构');
 const named=N.renameTraits(upgraded.items,{seed,preserveExisting:!force});upgraded.items=named.items;
 for(const t of upgraded.items)if(api.fingerprint(t)!==before.get(t.soulId))throw Error('重命名改变了被动机制：'+t.soulId);
 const audit=api.audit(upgraded.items);if(!audit.ok)throw Error('命名后校验失败');
 const report={version:N.version,mode:apply?'applied':'preview',seed,total:named.items.length,changed:named.changes.length,uniqueNames:audit.total,duplicateNames:audit.duplicateNames.length,mechanicsChanged:0,basis:'只使用主属性、属性关键词、武魂ID；不读取触发/条件/兑现方式/用途/类别',changes:named.changes};
 if(apply){
  const backup=path.join(dir,'traits.before-naming-v11.json');if(!fs.existsSync(backup))fs.copyFileSync(file,backup);
  if(named.changes.length){upgraded.nameMigration={version:N.version,seed,mechanicsChanged:0,changes:named.changes.map(r=>({...r,oldName:previous.nameMigration?.changes?.find(x=>x.soulId===r.soulId)?.oldName||r.oldName}))};fs.writeFileSync(path.join(dir,'命名映射.csv'),'\ufeff武魂ID,主属性,关键词,旧名,新名\n'+upgraded.nameMigration.changes.map(r=>[r.soulId,r.attribute,r.keyword,r.oldName,r.newName].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n'));}
  upgraded.report=audit;fs.writeFileSync(file,JSON.stringify(upgraded,null,2)+'\n');
  require('./build.cjs').build();
  if(named.changes.length)fs.writeFileSync(path.join(dir,'命名迁移报告.json'),JSON.stringify({...report,changes:upgraded.nameMigration.changes},null,2));
 }
 console.log(JSON.stringify({...report,changes:report.changes.slice(0,12)},null,2));return report;
}
module.exports={rename};
if(require.main===module)rename({apply:process.argv.includes('--apply'),force:process.argv.includes('--force'),seed:process.argv.find(a=>a.startsWith('--seed='))?.slice(7)||'属性命名-v11'});
