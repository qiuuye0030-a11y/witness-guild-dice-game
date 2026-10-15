'use strict';

// Reproducible, paired evaluation only. This file never patches production AI.
// Default command plans the workload; running battles requires an explicit `run`.
//   node v14_work/tests/compare.cjs plan
//   node v14_work/tests/compare.cjs run --mode baseline --label smoke --limit 12
//   node v14_work/tests/compare.cjs run --mode fixed --label initial
//   node v14_work/tests/compare.cjs run --mode fixed --label release --workers 3 --per-style 5 --campaign-reps 1 --robin-reps 2 --team-reps 1
//   node v14_work/tests/compare.cjs summarize --label initial
//   node v14_work/tests/compare.cjs plan --partition holdout --per-style 40 --label holdout

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const {Worker, isMainThread, parentPort, workerData, threadId} = require('worker_threads');
const {performance} = require('perf_hooks');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'v14_work/results');
const SOURCE = path.join(ROOT, 'audit_results/mixed-characters.json');
const STYLES = ['强攻', '敏攻', '控制', '防御', '辅助'];
const LEVELS = [41, 51, 61];
const IDS = ['qinyan', 'xiaowen', 'yixing', 'anmu', 'hash', 'yixiaobei', 'xiaweiyu', 'quan', 'minghuan', 'linluoying', 'qingling', 'yanan', 'xuejidong', 'yiqiran'];
const SUPPORTS = ['yixiaobei', 'yiqiran'];
const TEAM_OPPONENTS = ['qinyan', 'xiaowen', 'anmu', 'xuejidong'];
const MODES = ['baseline', 'mechanics', 'fixed'];
const FOCUS = ['yixiaobei', 'yiqiran', 'xiaweiyu', 'anmu', 'hash', 'quan'];
const SCHEMA = 1;

function parse(argv) {
  const o = {command: argv[0] || 'plan', mode: 'baseline', label: 'initial', partition: 'development', perStyle: 10,
    campaignReps: 3, robinReps: 5, teamReps: 3, levels: LEVELS, suites: ['campaign', 'robin', 'team'], limit: 0, progress: 100, forecastMethods: [], workers: 1};
  const flags = {'mode':'mode','label':'label','partition':'partition','per-style':'perStyle','campaign-reps':'campaignReps','robin-reps':'robinReps','team-reps':'teamReps','limit':'limit','progress':'progress','workers':'workers'};
  for (let i=1; i<argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (key==='levels') o.levels=argv[++i].split(',').map(Number);
    else if (key==='suite') o.suites=argv[++i]==='all'?['campaign','robin','team']:argv[i].split(',');
    else if (key==='forecast-methods') o.forecastMethods=argv[++i].split(',').filter(Boolean);
    else if (flags[key]) o[flags[key]]=argv[++i];
    else throw Error('Unknown flag: '+argv[i]);
  }
  for (const k of ['perStyle','campaignReps','robinReps','teamReps','limit','progress','workers']) o[k]=Number(o[k]);
  if (!['plan','run','summarize'].includes(o.command)) throw Error('Command must be plan, run, or summarize');
  if (!MODES.includes(o.mode)) throw Error('Mode must be baseline, mechanics, or fixed');
  if (!/^[a-zA-Z0-9_-]+$/.test(o.label)) throw Error('Label must contain only letters, numbers, _ and -');
  if (!['development','holdout'].includes(o.partition)) throw Error('Unknown partition');
  if (!Number.isInteger(o.perStyle)||o.perStyle<1||o.perStyle>(o.partition==='development'?10:70)) throw Error('Development is reserved to the first 10 characters/style; holdout contains the remaining 70/style');
  for(const k of ['campaignReps','robinReps','teamReps','progress']) if(!Number.isInteger(o[k])||o[k]<1) throw Error(k+' must be a positive integer');
  if(!Number.isInteger(o.limit)||o.limit<0) throw Error('limit must be a nonnegative integer');
  if(!Number.isInteger(o.workers)||o.workers<1||o.workers>3) throw Error('workers must be 1, 2, or 3');
  if(o.levels.some(n=>!LEVELS.includes(n))||o.suites.some(s=>!['campaign','robin','team'].includes(s))) throw Error('Invalid levels or suite');
  return o;
}
function hash(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function readJson(p) { return JSON.parse(fs.readFileSync(p,'utf8')); }
function save(p,v) { fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n'); }
function readRows(p) { return fs.existsSync(p)?fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)):[]; }
function clone(v) { return structuredClone(v); }
function filesFor(label,mode) {const p=path.join(OUT,`compare-${label}-${mode}`);return {manifest:p+'.manifest.json',rows:p+'.jsonl',summary:p+'.summary.json',failure:p+'.failure.json'};}
function sourceStamp(mode) {
  const {modes}=require('../load.cjs');
  const optional=mode==='baseline'?[]:['campaign-v14-compat.js','battle-v14-ui.js'].map(f=>'v14_work/src/'+f).filter(f=>fs.existsSync(path.join(ROOT,f)));
  const files=['analysis_src/load.cjs','v14_work/load.cjs',...[0,1,2,3,4,6,7,11,12,13,14,15,16,17,18].map(n=>`analysis_src/script_${n}.js`),...modes[mode].map(f=>'v14_work/src/'+f),...optional];
  const hashes=Object.fromEntries(files.map(p=>[p,hash(fs.readFileSync(path.join(ROOT,p)))]));
  return {hash:hash(JSON.stringify(hashes)),files:hashes};
}
function cohort(o) {
  const all=readJson(SOURCE),offset=o.partition==='development'?0:10;
  const selected=STYLES.flatMap(style=>all.filter(x=>x.character.style===style).sort((a,b)=>a.index-b.index).slice(offset,offset+o.perStyle));
  if(selected.length!==5*o.perStyle) throw Error('Source cohort does not contain the requested balanced partition');
  return {all,selected,byId:new Map(all.map(x=>[x.index,x]))};
}
function plan(o) {
  const c=cohort(o),cases=[];
  if(o.suites.includes('campaign'))for(const x of c.selected)for(const id of IDS)for(let rep=0;rep<o.campaignReps;rep++)cases.push({
    key:`campaign:${x.index}:${id}:${rep}`,cluster:`character:${x.index}`,suite:'campaign',layout:x.character.style==='辅助'?'exam-2v2':'exam-1v1',
    index:x.index,member:id,rep,seed:`audit-1005-campaign-${x.index}-${rep}`,style:x.character.style,characterLevel:x.character.level});
  if(o.suites.includes('robin'))for(const level of o.levels)for(let i=0;i<IDS.length;i++)for(let j=i+1;j<IDS.length;j++)for(let rep=0;rep<o.robinReps;rep++)for(let side=0;side<2;side++)cases.push({
    key:`robin:${level}:${i}:${j}:${rep}:${side}`,cluster:`robin:${level}:${i}:${j}:${rep}`,suite:'robin',layout:'robin-1v1',level,rep,side,
    a:IDS[side?j:i],b:IDS[side?i:j],pair:[IDS[i],IDS[j]],seed:`audit-1005-robin-${level}-${i}-${j}-${rep}`});
  if(o.suites.includes('team'))for(const level of o.levels)for(const member of SUPPORTS)for(const opponent of TEAM_OPPONENTS)for(let rep=0;rep<o.teamReps;rep++)for(let side=0;side<2;side++)cases.push({
    key:`team:${level}:${member}:${opponent}:${rep}:${side}`,cluster:`team:${level}:${member}:${opponent}:${rep}`,suite:'team',layout:'support-2v2',level,member,opponent,rep,side,
    a:side?opponent:member,b:side?member:opponent,partner:'yixing',seed:`audit-team-${level}-${member}-${opponent}-${rep}`});
  // A smoke limit takes representatives from every enabled suite, then from its
  // full ordered list; it never silently changes the member or level protocol.
  let selected=cases;
  if(o.limit&&o.limit<cases.length) {
    const groups=o.suites.map(s=>cases.filter(c=>c.suite===s));selected=[];
    for(let n=0;selected.length<o.limit;n++)for(const g of groups)if(n<g.length&&selected.length<o.limit)selected.push(g[Math.min(g.length-1,Math.floor(n*g.length/Math.ceil(o.limit/groups.length)))]);
    selected=[...new Map(selected.map(c=>[c.key,c])).values()];
  }
  const counts=Object.fromEntries(o.suites.map(s=>[s,selected.filter(c=>c.suite===s).length]));
  return {cases:selected,cohort:c,metadata:{schema:SCHEMA,label:o.label,partition:o.partition,source:'audit_results/mixed-characters.json',sourceHash:hash(fs.readFileSync(SOURCE)),
    characterIndices:c.selected.map(x=>x.index),styles:Object.fromEntries(STYLES.map(s=>[s,c.selected.filter(x=>x.character.style===s).length])),
    levels:o.levels,counts,totalPerMode:selected.length,threeModeTotal:selected.length*3,smoke:!!o.limit,fullPlanCount:cases.length,
    seeds:{campaign:'audit-1005-campaign-{character index}-{rep}',robin:'audit-1005-robin-{level}-{template i}-{template j}-{rep}',team:'audit-team-{level}-{support}-{opponent}-{rep}'},
    protocol:[
      'Campaign reuses complete stored growth outcomes and original levels; no rings, training, or attributes are regenerated or normalized.',
      'Campaign admission uses engine-native level and damage advantages. Auxiliary player style triggers native 2v2. These rates are separate from ordinary campaign 1v1.',
      'All 14 template members are tested in standard 41/51/61 round robins. Both sides of a pair use the same seed and are paired observations, not independent trials.',
      'Campaign repeats and opponents share each character. The character is the cohort sampling cluster; battle counts do not equal independent character counts.',
      'The team panel tests each support plus Li Yixing versus each listed opponent plus Li Yixing. It is a small representative panel, not a general ranking of supports.',
      'Matched scenario keys and seeds are preserved across modes. RNG consumption can diverge after decisions differ; equal seeds are not identical per-action dice streams.',
      'Reported final win rates retain native adjudication. Knockout-only, adjudicated, equal-ratio adjudicated, true draws, and 180-second outcomes are also counted separately.',
      'No independent-binomial 95% confidence intervals are calculated. Development and held-out character partitions are disjoint.',
      'Targeted mechanic regression fixtures are separate from these battle cohorts. The held-out partition must not be used for policy tuning.'
    ],config:{perStyle:o.perStyle,campaignReps:o.campaignReps,robinReps:o.robinReps,teamReps:o.teamReps,suites:o.suites,limit:o.limit}}};
}
function nativeOptions(c,cohort) {
  if(c.suite==='campaign'){const x=cohort.byId.get(c.index);return {character:clone(x.character),soul:clone(x.soul),enemyId:c.member,difficulty:'admission',seed:c.seed};}
  return {playerTemplateId:c.a,enemyId:c.b,testLevel:c.level,duel:true,difficulty:'standard',seed:c.seed};
}
function packUnit(u) {
  return {id:u.id,team:u.team,templateId:u.templateId||null,name:u.name,style:u.style,level:u.level,release:u.release,skills:u.skills.map(s=>({id:s.id,name:s.name,category:s.category,damageMode:s.damageMode||null})),
    hp:u.hp,maxHP:u.model.derived.HP,mp:u.mp,maxMP:u.model.derived.MP,sh:u.sh,maxSH:u.model.derived.SH,
    bodyHP:u.bodyHP,petHP:u.petHP,petAlive:u.petAlive,actions:u.actions,uses:clone(u.uses),fallen:!!u.fallen};
}
function instrumentForecasts(B,o) {
  const proto=B.Battle.prototype,names=[...new Set(['forecastAction','aiStrike','aiSequence',...o.forecastMethods])];
  const state={current:null,names:[]};
  for(const name of names){if(typeof proto[name]!=='function')continue;const original=proto[name];state.names.push(name);proto[name]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{if(state.current){const x=state.current[name]??={calls:0,ms:0};x.calls++;x.ms+=performance.now()-t;}}};}
  return state;
}
function fight(B,c,cohort,meters) {
  const start=performance.now(),forecast={};meters.current=forecast;
  const b=new B.Battle(nativeOptions(c,cohort));
  if(c.suite==='team'){
    const p=new B.Battle({playerTemplateId:'yixing',enemyId:'yixing',testLevel:c.level,duel:true,difficulty:'standard',seed:c.seed+'-partners'});
    for(const [i,u]of p.units.entries()){const v=clone(u);v.id=i?'enemySupport':'ally';b.units.push(v);}
  }
  const initial=b.units.map(packUnit),expected=c.layout.endsWith('2v2')?4:2;
  if(b.units.length!==expected||b.units.filter(u=>u.team===0).length!==expected/2||b.units.filter(u=>u.team===1).length!==expected/2)throw Error('Unexpected team construction: '+c.key);
  let choices=0,choiceMs=0;const commands={},defenseTargets={},choose=b.aiChoice,command=b.command;
  b.aiChoice=function(...args){const t=performance.now();try{return choose.apply(this,args);}finally{choices++;choiceMs+=performance.now()-t;}};
  b.command=function(id,action,target){const u=this.unit(id),s=u?.skills.find(s=>s.id===action);const result=command.call(this,id,action,target);if(!result){const key=[id,action,target].join('|');commands[key]=(commands[key]||0)+1;if(s?.category==='防御'){const k=[id,target,id===target?'self':'ally',s.id].join('|');defenseTargets[k]=(defenseTargets[k]||0)+1;}}return result;};
  b.tick(180000,true);meters.current=null;
  for(const u of b.units)for(const [key,max]of [['hp','HP'],['mp','MP'],['sh','SH']])if(!Number.isFinite(u[key])||u[key]<-1e-9||u[key]>u.model.derived[max]+1e-9)throw Error(`Invalid resource ${c.key} ${u.id} ${key}=${u[key]}/${u.model.derived[max]}`);
  if(!b.result)throw Error('Unfinished battle: '+c.key);
  if(![0,1,null].includes(b.result.winner))throw Error('Unknown winner: '+c.key);
  const eventTypes={},armor={},shieldText={};
  for(const e of b.events||[]){eventTypes[e.type||'untyped']=(eventTypes[e.type||'untyped']||0)+1;if(e.type==='armor'){const a=armor[e.target]??={mpSpent:0,absorbed:0};a.mpSpent+=e.paid||0;a.absorbed+=e.absorbed||0;}if(e.type==='damage'){const m=String(e.text).match(/盾挡([\d.]+)/);if(m)shieldText[e.target]=(shieldText[e.target]||0)+Number(m[1]);}}
  return {...c,result:clone(b.result),winner:b.result.winner,reason:b.result.reason,time:b.now,adjudicated:!!b.result.tieBreak,timeout:b.now>=180000||String(b.result.reason).includes('180秒'),
    trueDraw:b.result.winner===null,equalRatioAdjudication:!!b.result.tieBreak?.equal,initial,units:b.units.map(packUnit),
    telemetry:{wallMs:performance.now()-start,aiChoices:choices,aiChoiceMs:choiceMs,forecasts:forecast,acceptedCommands:commands,defenseTargets,eventTypes,armor,
      shieldBlockedFromLog:shieldText,shieldMetricNote:'Only explicit damage-event 盾挡 amounts are summed. Layered-shield events may use another schema; absent amounts are not evidence of zero shielding.'}};
}
function observations(row) {
  let focal;
  if(row.suite==='campaign')focal=row.units.filter(u=>u.id==='enemy');
  else if(row.suite==='team')focal=row.units.filter(u=>u.id===(row.side?'enemy':'player'));
  else focal=row.units.filter(u=>u.id==='player'||u.id==='enemy');
  return focal.map(u=>({key:row.key+'@'+u.templateId,caseKey:row.key,cluster:row.cluster,suite:row.suite,layout:row.layout,member:u.templateId,name:u.name,
    level:u.level,layer:row.suite==='campaign'?'ring-'+Math.floor((u.level-1)/10):'level-'+u.level,style:row.style||null,partition:row.partition,
    won:row.winner===u.team,lost:row.winner!==null&&row.winner!==u.team,draw:row.winner===null,score:row.winner===null?.5:row.winner===u.team?1:0,
    adjudicated:row.adjudicated,timeout:row.timeout,equalRatioAdjudication:row.equalRatioAdjudication,unit:u,telemetry:row.telemetry}));
}
function emptyGroup(o) {return {member:o.member,name:o.name,suite:o.suite,layout:o.layout,layer:o.layer,n:0,wins:0,losses:0,draws:0,adjudicated:0,adjudicatedWins:0,timeouts:0,equalRatioAdjudications:0,decisiveN:0,decisiveWins:0,mpRemaining:0,maxMP:0,remainingMPOnLoss:0,lossMaxMP:0,levels:new Set(),clusters:new Set(),skills:{},focus:FOCUS.includes(o.member)};}
function groups(rows) {
  const map=new Map();
  for(const row of rows)for(const o of observations(row)){const key=[o.suite,o.layout,o.layer,o.member].join('|');if(!map.has(key))map.set(key,emptyGroup(o));const g=map.get(key);g.n++;g.wins+=o.won;g.losses+=o.lost;g.draws+=o.draw;g.adjudicated+=o.adjudicated;g.adjudicatedWins+=o.adjudicated&&o.won;g.timeouts+=o.timeout;g.equalRatioAdjudications+=o.equalRatioAdjudication;if(!o.adjudicated&&!o.timeout){g.decisiveN++;g.decisiveWins+=o.won;}g.mpRemaining+=o.unit.mp;g.maxMP+=o.unit.maxMP;if(o.lost){g.remainingMPOnLoss+=o.unit.mp;g.lossMaxMP+=o.unit.maxMP;}g.levels.add(o.level);g.clusters.add(o.cluster);
    for(const s of o.unit.skills){const p=g.skills[s.id]??={name:s.name,uses:0,gamesUsed:0};const n=o.unit.uses[s.id]||0;p.uses+=n;p.gamesUsed+=n>0;}
  }
  return [...map.values()].map(g=>({...g,winRate:g.wins/g.n,decisiveWinRate:g.decisiveN?g.decisiveWins/g.decisiveN:null,meanRemainingMP:g.mpRemaining/g.n,remainingMPRatio:g.maxMP?g.mpRemaining/g.maxMP:null,meanRemainingMPOnLoss:g.losses?g.remainingMPOnLoss/g.losses:null,remainingMPRatioOnLoss:g.lossMaxMP?g.remainingMPOnLoss/g.lossMaxMP:null,levels:[...g.levels].sort((a,b)=>a-b),clusterCount:g.clusters.size,clusters:undefined,skills:Object.fromEntries(Object.entries(g.skills).map(([k,v])=>[k,{...v,usesPerGame:v.uses/g.n,gamesUsedRate:v.gamesUsed/g.n}]))}));
}
function summarizeMode(rows,manifest) {
  const suites={};for(const r of rows){const x=suites[r.layout]??={games:0,side0Wins:0,side1Wins:0,trueDraws:0,adjudicated:0,timeouts:0,equalRatioAdjudications:0,wallMs:0,aiChoices:0,aiChoiceMs:0,forecasts:{}};x.games++;x.side0Wins+=r.winner===0;x.side1Wins+=r.winner===1;x.trueDraws+=r.trueDraw;x.adjudicated+=r.adjudicated;x.timeouts+=r.timeout;x.equalRatioAdjudications+=r.equalRatioAdjudication;x.wallMs+=r.telemetry.wallMs;x.aiChoices+=r.telemetry.aiChoices;x.aiChoiceMs+=r.telemetry.aiChoiceMs;for(const [n,v]of Object.entries(r.telemetry.forecasts)){const t=x.forecasts[n]??={calls:0,ms:0};t.calls+=v.calls;t.ms+=v.ms;}}
  for(const x of Object.values(suites)){x.meanBattleMs=x.wallMs/x.games;x.meanChoiceMs=x.aiChoices?x.aiChoiceMs/x.aiChoices:0;for(const v of Object.values(x.forecasts)){v.callsPerBattle=v.calls/x.games;v.meanMs=v.calls?v.ms/v.calls:0;}}
  return {schema:SCHEMA,mode:manifest.mode,label:manifest.plan.label,partition:manifest.plan.partition,status:manifest.status|| (rows.length===manifest.plan.totalPerMode?'completed':'incomplete'),stopReason:manifest.stopReason||null,notForFinalWinRateConclusions:!!manifest.status?.startsWith('stopped')||rows.length!==manifest.plan.totalPerMode,completed:rows.length,planned:manifest.plan.totalPerMode,source:manifest.source,execution:manifest.execution||{workersStarted:1,kind:'single-thread'},performanceNote:'Battle and decision timings include instrumentation; parallel rows also include CPU/memory contention. Summed battle time is not elapsed batch time. Use the AI owner single-process microbenchmark for isolated latency.',protocol:manifest.plan.protocol,suites,members:groups(rows)};
}
function compareRows(before,after) {
  const left=new Map(before.flatMap(observations).map(o=>[o.key,o])),right=after.flatMap(observations),g=new Map();let unmatched=0;
  for(const b of right){const a=left.get(b.key);if(!a){unmatched++;continue;}if(a.unit.templateId!==b.unit.templateId)throw Error('Member mismatch '+b.key);const key=[b.suite,b.layout,b.layer,b.member].join('|');const x=g.get(key)||{suite:b.suite,layout:b.layout,layer:b.layer,member:b.member,name:b.name,n:0,beforeWins:0,afterWins:0,gains:0,losses:0,unchangedWins:0,unchangedNonWins:0,drawTransitions:0,clusters:new Set(),focus:FOCUS.includes(b.member)};
    x.n++;x.beforeWins+=a.won;x.afterWins+=b.won;x.gains+=!a.won&&b.won;x.losses+=a.won&&!b.won;x.unchangedWins+=a.won&&b.won;x.unchangedNonWins+=!a.won&&!b.won;x.drawTransitions+=a.draw!==b.draw;x.clusters.add(b.cluster);g.set(key,x);
  }
  return {unmatchedAfterObservations:unmatched,unmatchedBeforeObservations:left.size-right.filter(o=>left.has(o.key)).length,
    members:[...g.values()].map(x=>({...x,beforeWinRate:x.beforeWins/x.n,afterWinRate:x.afterWins/x.n,deltaPercentagePoints:100*(x.afterWins-x.beforeWins)/x.n,clusterCount:x.clusters.size,clusters:undefined})).sort((a,b)=>a.deltaPercentagePoints-b.deltaPercentagePoints),
    note:'Paired fixed-scenario differences, not independent Bernoulli samples. Gains/losses count matched battle observations; side-swapped observations share a cluster. No confidence interval or causal claim about a particular policy component.'};
}
function summarize(o) {
  const found={};for(const mode of MODES){const f=filesFor(o.label,mode);if(!fs.existsSync(f.manifest))continue;const m=readJson(f.manifest),r=readRows(f.rows);found[mode]={manifest:m,rows:r,eligible:r.length===m.plan.totalPerMode&&!m.status?.startsWith('stopped')&&!fs.existsSync(f.failure)};save(f.summary,summarizeMode(r,m));}
  const comparisons={};for(const [a,b,label]of [['baseline','mechanics','ruleChange'],['mechanics','fixed','aiChange'],['baseline','fixed','combinedChange']])if(found[a]?.eligible&&found[b]?.eligible){
    if(found[a].manifest.planHash!==found[b].manifest.planHash)throw Error('Cannot compare different sampling plans '+a+' / '+b);
    comparisons[label]={before:a,after:b,...compareRows(found[a].rows,found[b].rows)};
  }
  const result={schema:SCHEMA,label:o.label,generatedAt:new Date().toISOString(),modeCounts:Object.fromEntries(Object.entries(found).map(([k,v])=>[k,v.rows.length])),excludedModes:Object.keys(found).filter(k=>!found[k].eligible),comparisons};
  save(path.join(OUT,`compare-${o.label}-paired.json`),result);console.log(JSON.stringify({summary:result.label,modeCounts:result.modeCounts,comparisons:Object.keys(comparisons)}));return result;
}
function prepareRun(o,p,source,forecastMethods=[]) {
  const f=filesFor(o.label,o.mode),planHash=hash(JSON.stringify(p.metadata));
  let manifest={schema:SCHEMA,mode:o.mode,createdAt:new Date().toISOString(),source,planHash,harnessHash:hash(fs.readFileSync(__filename)),plan:p.metadata,forecastMethods};
  if(fs.existsSync(f.manifest)){const old=readJson(f.manifest);if(old.status?.startsWith('stopped'))throw Error('Stopped diagnostic run must be preserved; use a new label.');if(old.planHash!==planHash||old.source.hash!==source.hash||old.harnessHash!==manifest.harnessHash)throw Error('Resume rejected: source, harness, or plan changed. Use a new label; never mix builds.');manifest=old;}
  else save(f.manifest,manifest);
  const rows=readRows(f.rows),seen=new Set(rows.map(r=>r.key));if(seen.size!==rows.length)throw Error('Duplicate completed keys');
  const allowed=new Set(p.cases.map(c=>c.key));if(rows.some(r=>!allowed.has(r.key)))throw Error('Results contain an unplanned case');
  return {f,manifest,rows,seen};
}
function validateTemplates(B) {if(IDS.some((id,i)=>B.templates[i]?.id!==id))throw Error('Template order changed; original robin seeds need explicit review');}
function finishRun(o,p,state,source) {
  const {f,manifest,rows}=state,endingSource=sourceStamp(o.mode);
  if(endingSource.hash!==source.hash){save(f.failure,{mode:o.mode,error:'Source changed while running; results must not be used without reviewing which loaded code was evaluated.',source,endingSource});save(f.manifest,manifest);save(f.summary,summarizeMode(rows,manifest));throw Error('Source changed during run');}
  save(f.manifest,manifest);save(f.summary,summarizeMode(rows,manifest));console.log(JSON.stringify({mode:o.mode,completed:rows.length,summary:path.relative(ROOT,f.summary),execution:manifest.execution}));
}
function run(o,p) {
  if(o.workers>1)return runParallel(o,p);
  const {load}=require('../load.cjs'),source=sourceStamp(o.mode),box=load(o.mode),B=box.WitnessBattle;validateTemplates(B);
  if(sourceStamp(o.mode).hash!==source.hash)throw Error('Source changed while loading');
  const meters=instrumentForecasts(B,o),state=prepareRun(o,p,source,meters.names),{f,manifest,rows,seen}=state;
  const started=performance.now();manifest.execution={kind:'single-thread',workersRequested:1,workersStarted:1,resumedRows:rows.length,startedAt:new Date().toISOString(),maxRssBytes:process.memoryUsage().rss};
  let done=rows.length,last=performance.now();
  for(const c of p.cases){if(seen.has(c.key))continue;try{const r={mode:o.mode,partition:o.partition,...fight(B,c,p.cohort,meters),execution:{kind:'single-thread',workers:1}};fs.appendFileSync(f.rows,JSON.stringify(r)+'\n');rows.push(r);done++;manifest.execution.maxRssBytes=Math.max(manifest.execution.maxRssBytes,process.memoryUsage().rss);if(done%o.progress===0||performance.now()-last>15000){console.log(JSON.stringify({mode:o.mode,done,total:p.cases.length,lastCase:c.key,lastMs:Math.round(r.telemetry.wallMs)}));last=performance.now();}}
    catch(error){meters.current=null;save(f.failure,{schema:SCHEMA,mode:o.mode,source,case:c,completed:done,error:String(error),stack:error.stack});save(f.summary,summarizeMode(rows,manifest));throw error;}}
  manifest.execution.elapsedMs=performance.now()-started;manifest.execution.completedAt=new Date().toISOString();finishRun(o,p,state,source);
}

function workerMain() {
  try {
    const o=workerData.options,source=sourceStamp(o.mode);
    if(source.hash!==workerData.sourceHash)throw Error('Worker source differs before loading');
    const box=require('../load.cjs').load(o.mode),B=box.WitnessBattle;validateTemplates(B);
    if(sourceStamp(o.mode).hash!==source.hash)throw Error('Worker source changed while loading');
    const c=cohort(o),meters=instrumentForecasts(B,o);
    parentPort.on('message',message=>{
      if(message.type!=='case')return;
      try{const row={mode:o.mode,partition:o.partition,...fight(B,message.case,c,meters)};parentPort.postMessage({type:'result',row,memory:process.memoryUsage()});}
      catch(error){meters.current=null;parentPort.postMessage({type:'failure',case:message.case,error:String(error),stack:error.stack});}
    });
    parentPort.postMessage({type:'ready',sourceHash:source.hash,forecastMethods:meters.names,threadId,memory:process.memoryUsage()});
  }catch(error){parentPort.postMessage({type:'failure',error:String(error),stack:error.stack});}
}
async function runParallel(o,p) {
  const source=sourceStamp(o.mode),state=prepareRun(o,p,source),{f,manifest,rows,seen}=state;
  const pending=p.cases.filter(c=>!seen.has(c.key)),started=performance.now(),freeAtStart=os.freemem();
  // Worker threads share the process RSS counter, but have separate JS heaps.
  // Only the main thread writes files. Every worker loads one immutable runtime.
  const count=Math.min(pending.length,o.workers===3&&freeAtStart<512*1024*1024?2:o.workers);
  const ex=manifest.execution={kind:'worker-threads',workersRequested:o.workers,workersStarted:count,resumedRows:rows.length,startedAt:new Date().toISOString(),freeMemoryAtStart:freeAtStart,maxRssBytes:process.memoryUsage().rss,workerHeapPeaks:{},reductions:[],timingIncludesContention:true};
  if(count!==o.workers&&pending.length>=o.workers)ex.reductions.push({reason:'less than 512 MiB free RAM before worker startup',from:o.workers,to:count});
  save(f.manifest,manifest);
  if(!pending.length){ex.elapsedMs=performance.now()-started;finishRun(o,p,state,source);return;}
  await new Promise((resolve,reject)=>{
    const entries=[];let cursor=0,ended=false,last=performance.now();
    const active=()=>entries.filter(e=>!e.retired).length;
    const rememberMemory=(entry,memory)=>{ex.maxRssBytes=Math.max(ex.maxRssBytes,memory.rss,process.memoryUsage().rss);ex.workerHeapPeaks[entry.id]=Math.max(ex.workerHeapPeaks[entry.id]||0,memory.heapUsed);};
    const stopAll=()=>Promise.allSettled(entries.map(e=>{e.intentionalExit=true;return e.worker.terminate();}));
    const fail=async(error,detail={})=>{if(ended)return;ended=true;save(f.failure,{schema:SCHEMA,mode:o.mode,source,completed:rows.length,error:String(error),stack:error.stack,...detail});await stopAll();ex.elapsedMs=performance.now()-started;ex.failed=true;save(f.manifest,manifest);save(f.summary,summarizeMode(rows,manifest));reject(error);};
    const complete=async()=>{if(ended||rows.length!==p.cases.length)return;ended=true;await stopAll();ex.elapsedMs=performance.now()-started;ex.completedAt=new Date().toISOString();resolve();};
    const dispatch=entry=>{if(ended||entry.retired)return;if(cursor>=pending.length){entry.case=null;void complete();return;}entry.case=pending[cursor++];entry.dispatchedWorkers=active();entry.worker.postMessage({type:'case',case:entry.case});};
    for(let i=0;i<count;i++){
      const entry={id:i,retired:false,intentionalExit:false,case:null,worker:new Worker(__filename,{workerData:{options:o,sourceHash:source.hash}})};entries.push(entry);
      entry.worker.on('error',error=>{void fail(error,{case:entry.case,worker:i});});
      entry.worker.on('exit',code=>{if(!entry.intentionalExit&&!ended)void fail(Error('Worker exited unexpectedly: '+code),{case:entry.case,worker:i});});
      entry.worker.on('message',message=>{
        if(ended)return;
        try{
          if(message.type==='failure'){const error=Error(message.error);error.stack=message.stack||error.stack;void fail(error,{case:message.case||entry.case,worker:i});return;}
          if(message.type==='ready'){
            if(message.sourceHash!==source.hash)throw Error('Worker loaded a different source');
            if(manifest.forecastMethods.length&&JSON.stringify(manifest.forecastMethods)!==JSON.stringify(message.forecastMethods))throw Error('Worker instrumentation differs');
            manifest.forecastMethods=message.forecastMethods;rememberMemory(entry,message.memory);dispatch(entry);return;
          }
          if(message.type!=='result')throw Error('Unknown worker message');
          if(!entry.case||message.row.key!==entry.case.key||seen.has(message.row.key))throw Error('Duplicate or mismatched worker result');
          const row=message.row;row.execution={kind:'worker-thread',workerId:i,workers:entry.dispatchedWorkers,timingIncludesContention:true};
          fs.appendFileSync(f.rows,JSON.stringify(row)+'\n');rows.push(row);seen.add(row.key);entry.case=null;rememberMemory(entry,message.memory);
          if(rows.length%o.progress===0||performance.now()-last>15000){console.log(JSON.stringify({mode:o.mode,done:rows.length,total:p.cases.length,workers:active(),lastCase:row.key,lastMs:Math.round(row.telemetry.wallMs),rssMiB:Math.round(ex.maxRssBytes/1048576)}));last=performance.now();save(f.manifest,manifest);}
          // Retire only between battles: no result is interrupted or resampled.
          if(active()>2&&(process.memoryUsage().rss>512*1024*1024||os.freemem()<192*1024*1024)){
            ex.reductions.push({reason:'memory pressure after completed battle',from:active(),to:active()-1,case:row.key,rssBytes:process.memoryUsage().rss,freeBytes:os.freemem()});entry.retired=true;entry.intentionalExit=true;void entry.worker.terminate();
          }else dispatch(entry);
          void complete();
        }catch(error){void fail(error,{case:entry.case,worker:i});}
      });
    }
  });
  finishRun(o,p,state,source);
}
async function main(){const o=parse(process.argv.slice(2));if(o.command==='summarize')return summarize(o);const p=plan(o);if(o.command==='plan'){save(path.join(OUT,`compare-${o.label}-plan.json`),{...p.metadata,cases:p.cases});console.log(JSON.stringify({partition:o.partition,characters:p.cohort.selected.length,counts:p.metadata.counts,totalPerMode:p.metadata.totalPerMode,threeModeTotal:p.metadata.threeModeTotal,plan:`v14_work/results/compare-${o.label}-plan.json`},null,2));return;}return run(o,p);}
if(!isMainThread)workerMain();
else if(require.main===module)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
module.exports={parse,plan,cohort,nativeOptions,fight,observations,groups,compareRows,summarizeMode};
