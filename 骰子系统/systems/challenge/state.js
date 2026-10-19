(function(root){
'use strict';
const runtime=typeof module!=='undefined'&&module.exports?require('../../v13-runtime.cjs'):root;
const copy=x=>JSON.parse(JSON.stringify(x)),KEY='witness-postgame-challenges-v1',REPORT_LIMIT=30;
// 主存档键随版本变化；挑战进度读取时按新到旧依次查找，避免把当前存档当成不存在。
const SAVE_KEYS=['witness-complete-game-v1204','witness-complete-game-v1203','witness-complete-game-v1202','witness-complete-game-v1201','witness-complete-game-v12'];
function identity(s){let h=2166136261;for(const c of [s.seed,s.character?.name,s.character?.soulId,s.character?.initialLevel,s.character?.time?.month].join('|'))h=Math.imul(h^c.charCodeAt(0),16777619);return 'journey-'+(h>>>0).toString(16);}
function ledger(storage){const x=JSON.parse(storage?.getItem(KEY)||'{}');if(!x||typeof x!=='object'||Array.isArray(x))throw Error('挑战账本无效');return x;}
function eligible(c){const s=c?.state;return !!(s?.phase==='ending'&&s.result?.winner===0&&!s.exam?.badEnding&&s.character&&s.journal?.some(x=>x.type==='ending'));}
function serialOf(r){return Number(String(r?.id||'').split(':').at(-1))||0;}
function summary(r){const {snapshot,initial,...meta}=r;return copy(meta);}
function mergeReports(...lists){
 const records=new Map();
 for(const list of lists)for(const r of list||[]){
  if(!r?.id||!r.result)continue;
  const old=records.get(r.id);
  records.set(r.id,{...old,...r,snapshot:r.snapshot||old?.snapshot,initial:r.initial||old?.initial});
 }
 return [...records.values()].sort((a,b)=>serialOf(a)-serialOf(b)).slice(-REPORT_LIMIT).map(copy);
}
function reportEntries(q){return q?mergeReports(q.reports,q.last?[q.last]:[]):[];}
function normalize(q){
 q.reports=reportEntries(q);q.reportVersion=1;
 q.completed=[...new Set([...(q.completed||[]),...q.reports.filter(r=>r.result?.winner===0).map(r=>r.mode+':'+(['guildmaster','mysterious'].includes(r.mode)?'xuejidong':r.snapshot?.units?.find(u=>u.id==='enemy')?.templateId||r.enemy))])];
 if(q.reports.length)q.last=summary(q.reports.at(-1));
 q.resolved=[...new Set(q.resolved||[])].slice(-200);
 return q;
}
function validate(q){
 if(!q)return true;
 if(q.reports!==undefined&&(!Array.isArray(q.reports)||q.reports.length>REPORT_LIMIT))throw Error('挑战战报数量无效');
 const seen=new Set();
 for(const r of q.reports||[]){
  if(typeof r.id!=='string'||r.id.length>160||!r.id.startsWith(q.identity+':')||!Number.isSafeInteger(serialOf(r))||serialOf(r)<1||seen.has(r.id))throw Error('挑战战报场次无效');
  seen.add(r.id);
  if(!['member','advanced','guildmaster','mysterious'].includes(r.mode)||typeof r.enemy!=='string'||![0,1,null].includes(r.result?.winner)||!Number.isFinite(r.result?.time)||r.result.time<0||r.result.time>180000)throw Error('挑战战报结果无效');
  if(r.snapshot){const b=r.snapshot;if(b.challengeSessionId!==r.id||!b.postGameChallenge||!Array.isArray(b.log)||b.log.length>1500||!Array.isArray(b.units)||b.units.length<2||b.units.length>4||b.result?.winner!==r.result.winner||b.result?.time!==r.result.time)throw Error('挑战战报内容无效');}
  if(r.initial&&(r.initial.challengeSessionId!==r.id||!r.initial.postGameChallenge))throw Error('挑战战报初始参数无效');
 }
 return true;
}
function ensure(c,storage){
 if(!eligible(c))return null;
 const s=c.state,key=identity(s),records=ledger(storage),saved=records[key];
 let local;for(const saveKey of SAVE_KEYS)try{const previous=JSON.parse(storage?.getItem(saveKey)||'null');if(previous?.state?.challenge?.identity===key){local=previous.state.challenge;break;}}catch{}
 s.challenge||={version:1,identity:key,failures:0,serial:0,completed:[],resolved:[],active:null,snapshot:null,options:null,reports:[]};
 let q=s.challenge;if(q.identity&&q.identity!==key)throw Error('挑战人物身份不一致');q.identity=key;
 const sources=[q,saved,local].filter(Boolean),reports=mergeReports(...sources.map(reportEntries));
 for(const candidate of sources)if(!Number.isInteger(candidate.failures)||candidate.failures<0||candidate.failures>5)throw Error('本机挑战进度无效');
 const latest=[...sources].sort((a,b)=>(b.serial||0)-(a.serial||0)||b.failures-a.failures||serialOf(b.last)-serialOf(a.last))[0];
 const activeSnapshot=sources.filter(x=>x.active&&x.active===latest.active&&x.snapshot).sort((a,b)=>(b.snapshot.now||0)-(a.snapshot.now||0))[0]?.snapshot;
 if(latest!==q)q=s.challenge=copy(latest);
 if(activeSnapshot)q.snapshot=copy(activeSnapshot);
 q.completed=[...new Set(sources.flatMap(x=>x.completed||[]))];q.resolved=[...new Set(sources.flatMap(x=>x.resolved||[]))].sort((a,b)=>serialOf({id:a})-serialOf({id:b})).slice(-200);
 q.failures=Math.max(...sources.map(x=>x.failures));q.serial=Math.max(...sources.map(x=>x.serial||0));
 q.reports=reports;normalize(q);
 if(q.active&&q.resolved.includes(q.active)){q.active=null;q.snapshot=null;q.options=null;}
 q.exhausted=q.failures>=5;if(q.exhausted){q.active=null;q.snapshot=null;q.options=null;}
 validate(q);return q;
}
function persist(c,storage){
 const q=c.state.challenge;if(!q)return;
 const records=ledger(storage);
 // Counters and session identity live in the ledger; the complete campaign save
 // owns full historical logs, avoiding a second copy of all 30 reports.
 records[q.identity]={...q,snapshot:null,reports:(q.reports||[]).map(summary),last:q.last?summary(q.last):undefined};
 storage?.setItem(KEY,JSON.stringify(records));
}
function start(c,{mode='member',enemyId='qinyan'}={},storage){
 const q=ensure(c,storage);if(!q||q.failures>=5)throw Error('挑战机会已用尽');if(q.active)throw Error('请先完成当前挑战');
 if(!['member','advanced','guildmaster','mysterious'].includes(mode))throw Error('挑战目录无效');
 if(!['guildmaster','mysterious'].includes(mode)&&!runtime.WitnessTemplates?.some(t=>t.id===enemyId))throw Error('挑战对手无效');
 const serial=(q.serial||0)+1,session=q.identity+':'+serial;
 const character=copy(c.state.character),targetLevel=mode==='mysterious'?character.level:mode==='guildmaster'?95:Math.min(99,character.level+(mode==='advanced'?10:5));
 const options={character,soul:copy(c.soul()),enemyId:['guildmaster','mysterious'].includes(mode)?'xuejidong':enemyId,difficulty:'standard',seed:c.state.seed+'-追加挑战-'+serial,enemyLevelOverride:targetLevel,traitsEnabled:c.state.features?.traitsEnabled!==false,postGameChallenge:true,challengeSessionId:session,challengeId:mode==='mysterious'?'mysterious_scarred_woman':mode==='guildmaster'?'guildmaster_xuejidong':null};
 q.serial=serial;q.active=session;q.mode=mode;q.options=copy(options);q.snapshot=null;
 try{persist(c,storage);}catch(e){q.active=null;q.options=null;throw Error('不能保存挑战场次，请先保存旅程或释放本机存储：'+e.message);}
 return options;
}
function observe(c,b,storage){runtime.WitnessV12Live?.persist(c.state.character,b);
 const q=c.state.challenge;if(!q?.active||b.challengeSessionId!==q.active)return false;
 q.snapshot=b.snapshot();
 if(b.result&&!q.resolved.includes(q.active)){
  const id=q.active;q.resolved=[...q.resolved,id].slice(-200);
  const actualEnemy=['guildmaster','mysterious'].includes(q.mode)?q.options.enemyId:b.unit('enemy')?.templateId||q.options.enemyId;
  if(b.result.winner===0)q.completed=[...new Set([...q.completed,q.mode+':'+(actualEnemy||'')])];else q.failures=Math.min(5,q.failures+1);
  const record={id,mode:q.mode,enemy:actualEnemy,result:copy(b.result),initial:copy(q.options),snapshot:copy(q.snapshot)};
  q.reports=mergeReports(reportEntries(q),[record]);q.last=summary(record);q.reportVersion=1;
  q.active=null;q.snapshot=null;q.options=null;q.exhausted=q.failures>=5;persist(c,storage);return true;
 }
 persist(c,storage);return false;
}
function exportReport(record){
 if(!record?.snapshot)throw Error('这场旧版挑战没有保存完整战报');
 return {format:'witness-battle-report',version:1,initial:copy(record.initial||null),snapshot:copy(record.snapshot),challenge:summary(record)};
}
function report(c,id){const q=c.state.challenge;return copy(reportEntries(q).find(r=>r.id===(id||q.last?.id))||null);}
const api={report,KEY,REPORT_LIMIT,identity,eligible,ensure,persist,start,observe,validate,reportEntries,exportReport};
root.WitnessChallenge=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis==='undefined'?this:globalThis);
