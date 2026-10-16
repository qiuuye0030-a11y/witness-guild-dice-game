const fs=require('fs'),path=require('path'),x=require('./runtime-1008.cjs').load(),{create}=require('./calibrate-growth-1008.cjs');
const dir=path.resolve(__dirname,'../fixtures/1008-rollback');fs.mkdirSync(dir,{recursive:true});
function write(name,c){fs.writeFileSync(path.join(dir,name),JSON.stringify({format:'witness-complete-game',version:9,gameVersion:'10.08',speed:0,state:c.snapshot()},null,2));}
for(const [rank,tier,name]of [[10,10,'double-ten-growth'],[5,5,'qualified-growth'],[4,10,'low-talent-growth']]){const c=create(x,rank,'rollback-browser-'+name,{level:5,tier,luck:5,charm:5,origin:5,region:'集镇',fixedTier:false});c.startGrowth();while(c.currentPromotion())c.acknowledgePromotion();write(name+'.json',c);}
console.log('Created canonical growth-page UI fixtures');
