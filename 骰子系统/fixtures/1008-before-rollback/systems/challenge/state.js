(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x)),KEY='witness-postgame-challenges-v1';
function identity(s){let h=2166136261;for(const c of [s.seed,s.character?.name,s.character?.soulId,s.character?.initialLevel,s.character?.time?.month].join('|'))h=Math.imul(h^c.charCodeAt(0),16777619);return 'journey-'+(h>>>0).toString(16);}
function ledger(storage){const x=JSON.parse(storage?.getItem(KEY)||'{}');if(!x||typeof x!=='object'||Array.isArray(x))throw Error('挑战账本无效');return x;}
function eligible(c){const s=c?.state;return !!(s?.phase==='ending'&&s.result?.winner===0&&!s.exam?.badEnding&&s.character&&s.journal?.some(x=>x.type==='ending'));}
function ensure(c,storage){
 if(!eligible(c))return null;const s=c.state,key=identity(s),records=ledger(storage),saved=records[key];
 s.challenge||={version:1,identity:key,failures:0,serial:0,completed:[],resolved:[],active:null,snapshot:null,options:null};
 let q=s.challenge;if(q.identity&&q.identity!==key)throw Error('挑战人物身份不一致');q.identity=key;
 if(saved){if(!Number.isInteger(saved.failures)||saved.failures<0||saved.failures>5)throw Error('本机挑战进度无效');
  if((saved.serial||0)>(q.serial||0)||saved.failures>q.failures)q=s.challenge=copy(saved);
  else {q.failures=Math.max(saved.failures,q.failures);q.completed=[...new Set([...q.completed,...(saved.completed||[])])];q.resolved=[...new Set([...q.resolved,...(saved.resolved||[])])];}
 }
 q.exhausted=q.failures>=5;if(q.failures>=5){q.active=null;q.snapshot=null;q.options=null;q.exhausted=true;}return q;
}
function persist(c,storage){const q=c.state.challenge;if(!q)return;const records=ledger(storage);records[q.identity]=copy(q);storage?.setItem(KEY,JSON.stringify(records));}
function start(c,{mode='member',enemyId='qinyan'}={},storage){
 const q=ensure(c,storage);if(!q||q.failures>=5)throw Error('挑战机会已用尽');if(q.active)throw Error('请先完成当前挑战');
 if(!['member','advanced','guildmaster'].includes(mode))throw Error('挑战目录无效');
 if(mode!=='guildmaster'&&!root.WitnessTemplates?.some(t=>t.id===enemyId))throw Error('挑战对手无效');
 const serial=(q.serial||0)+1,session=q.identity+':'+serial;
 const character=copy(c.state.character),targetLevel=mode==='guildmaster'?95:Math.min(99,character.level+(mode==='advanced'?10:5));
 const options={character,soul:copy(c.soul()),enemyId:mode==='guildmaster'?'xuejidong':enemyId,difficulty:'standard',seed:c.state.seed+'-追加挑战-'+serial,enemyLevelOverride:targetLevel,postGameChallenge:true,challengeSessionId:session,challengeId:mode==='guildmaster'?'guildmaster_xuejidong':null};
 q.serial=serial;q.active=session;q.mode=mode;q.options=copy(options);q.snapshot=null;
 try{persist(c,storage);}catch(e){q.active=null;q.options=null;throw Error('不能保存挑战场次，请先保存旅程或释放本机存储：'+e.message);}
 return options;
}
function observe(c,b,storage){const q=c.state.challenge;if(!q?.active||b.challengeSessionId!==q.active)return false;q.snapshot=b.snapshot();
 if(b.result&&!q.resolved.includes(q.active)){const id=q.active;q.resolved.push(id);if(b.result.winner===0)q.completed=[...new Set([...q.completed,q.mode+':'+(q.options.enemyId||'')])];else q.failures=Math.min(5,q.failures+1);q.last={id,mode:q.mode,enemy:q.options.enemyId,result:copy(b.result)};q.active=null;q.snapshot=null;q.options=null;q.exhausted=q.failures>=5;persist(c,storage);return true;}
 persist(c,storage);return false;
}
const api={KEY,identity,eligible,ensure,persist,start,observe};root.WitnessChallenge=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis==='undefined'?this:globalThis);
