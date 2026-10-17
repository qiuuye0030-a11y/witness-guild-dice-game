'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{load}=require('./runtime-1008.cjs'),{run,grade,summarize}=require('./calibrate-rating-curve.cjs');
const x=load(),R=x.WitnessRules,labels=['纸级','并级','强级','凶级','狂级','神级'],out=path.join(__dirname,'../output/v11');
const model=(level,score)=>({level,stats:Object.fromEntries(R.KEYS.map(k=>[k,R.benchmark(level).base*score]))});
for(let level=0;level<=99;level++){
 const t=R.ratingThresholds(level);assert(Number.isFinite(t.crazy));assert(t.divine>t.crazy);
 if(level>1)assert(t.crazy<=R.ratingThresholds(level-1).crazy);
 if(level<=40)assert.equal(R.rating(model(level,2.48)).label,'凶级');
 if(level>=61){assert.equal(t.crazy,1.75);assert.equal(t.divine,2.1);}
 for(const [score,label]of [[.9,'纸级'],[1.1,'并级'],[1.5,'强级'],[1.65,'凶级']])assert.equal(R.rating(model(level,score)).label,label);
 assert.equal(R.rating({...model(level,2.2),ratingProfile:'npc'}).label,'神级');
}
// 四环内逐级降幅逐渐缩小，五环末已接近旧标准。
for(let level=42;level<=60;level++)assert(R.ratingThresholds(level-1).crazy-R.ratingThresholds(level).crazy<R.ratingThresholds(level-2).crazy-R.ratingThresholds(level-1).crazy);
assert(R.ratingThresholds(60).crazy-1.75<.003);
const file='D:/QQ/见证者_邵絮泓_完整存档.json',raw=fs.readFileSync(file),hash=crypto.createHash('sha256').update(raw).digest('hex'),save=JSON.parse(raw),s=save.state;
const once=new x.WitnessCampaign.Campaign(x.WITNESS_CATALOG,{snapshot:structuredClone(s)}),twice=new x.WitnessCampaign.Campaign(x.WITNESS_CATALOG,{snapshot:once.snapshot()});
for(const c of [once,twice]){assert.deepEqual(c.state.character.growth,s.character.growth);assert.deepEqual(c.state.character.stats.stats,s.character.stats.stats);assert.equal(c.state.character.level,s.character.level);assert.equal(c.state.xp,s.xp);assert.equal(R.rating(c.state.character.stats).score,2.48);assert.equal(R.rating(c.state.character.stats).label,'凶级');assert.equal(c.state.promotionState.ratingRulesVersion,2);assert.equal(c.state.promotionState.highestRatingIndex,3);assert(!c.state.promotions.some(p=>p.ratingUp&&['狂级','神级'].includes(p.toRating)));}
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash);
const legacyState={...structuredClone(once.state),source:'formal',phase:'arrival',promotionState:{version:1,highestRatingIndex:5}},archive=new x.WitnessAchievements.Archive();
archive.check(legacyState,[],3);assert(!archive.data.unlocked.rating_crazy);assert(!archive.data.unlocked.rating_divine);
const earned=new x.WitnessAchievements.Archive();earned.unlock('rating_divine',legacyState);const restored=new x.WitnessAchievements.Archive();restored.merge(earned.data);restored.check(legacyState,[],3);assert(restored.data.unlocked.rating_divine,'已得成就须保留');
const sample=JSON.parse(fs.readFileSync(path.join(out,'评级曲线_样本.json'))),holdout=JSON.parse(fs.readFileSync(path.join(out,'评级曲线_独立验证.json'))),rows=[...sample.rows,...holdout.rows];
let evaluations=0;for(const r of rows)for(const p of [r,...r.series]){assert.equal(R.rating(p).label,labels[grade(p,1.8).index]);evaluations++;}
const pairs=[];
for(const config of [sample.rows[0].config,sample.rows[30].config,sample.rows[99].config,sample.rows[198].config,sample.rows[399].config,...holdout.rows.slice(0,3).map(r=>r.config)]){
 const old=load(),modern=load(),oldR=old.WitnessRules;
 oldR.rating=m=>{const score=Math.round(oldR.KEYS.reduce((n,k)=>n+m.stats[k],0)/6/oldR.benchmark(m.level).base*10000)/10000,index=score<1?0:score<1.35?1:score<1.6?2:score<1.75?3:score<2.1?4:5;return {score:Math.round(score*100)/100,label:labels[index],basis:'旧评级对照'};};
 const before=run(config,old),after=run(config,modern);assert.deepEqual(after,before,'评级不得影响成长、等级、随机数或旅程');pairs.push({seed:config.seed,level:after.level,unchanged:true});
}
const report={passed:true,ratingRulesVersion:2,amplitude:1.8,thresholds:[1,11,21,30,31,40,41,45,50,51,55,60,61].map(level=>({level,...R.ratingThresholds(level)})),save:{name:s.character.name,level:s.character.level,score:2.48,rating:'凶级',growthAndLevelUnchanged:true,highestRatingIndex:once.state.promotionState.highestRatingIndex,fileSHA256:hash,originalUnchanged:true},evaluations,pairedJourneys:pairs,before:summarize(rows,0),after:summarize(rows,1.8),holdout:{before:holdout.before,after:holdout.after}};
fs.writeFileSync(path.join(out,'评级曲线专项回归.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
