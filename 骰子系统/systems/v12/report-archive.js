// v12.03 讨伐战报归档：完整战报按 reportId 单独存放，主存档只保留摘要与引用。
// 完整导出/导入时合并正文；归档不可用时调用方保留内嵌副本，绝不静默删除。
(function(root){
'use strict';
const DB_NAME='witness-v12-reports',STORE='reports',DB_VERSION=1,SUMMARY_VERSION=2;
const memory=new Map(),failures=[];
let backend=null,idbPromise=null,onFailure=null;

function idbFactory(){return root.indexedDB||null;}

function openIdb(){
  if(idbPromise)return idbPromise;
  const factory=idbFactory();
  if(!factory)return Promise.resolve(null);
  idbPromise=new Promise(resolve=>{
    let request;
    try{request=factory.open(DB_NAME,DB_VERSION);}catch{resolve(null);return;}
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>resolve(null);
    request.onblocked=()=>resolve(null);
  });
  return idbPromise;
}

function idbBackend(){
  const run=(mode,work)=>openIdb().then(db=>{
    if(!db)throw Error('本机数据库不可用');
    return new Promise((resolve,reject)=>{
      let transaction;
      try{transaction=db.transaction(STORE,mode);}catch(error){reject(error);return;}
      const store=transaction.objectStore(STORE);
      let request;
      try{request=work(store);}catch(error){reject(error);return;}
      transaction.oncomplete=()=>resolve(request&&request.result);
      transaction.onerror=()=>reject(transaction.error||Error('归档事务失败'));
      transaction.onabort=()=>reject(transaction.error||Error('归档事务中止'));
    });
  });
  return {
    put:record=>run('readwrite',store=>store.put(record)),
    get:id=>run('readonly',store=>store.get(id)).then(row=>row&&row.report||null),
    remove:id=>run('readwrite',store=>store.delete(id)),
    all:()=>run('readonly',store=>store.getAll()).then(rows=>(rows||[]).map(row=>row&&row.report).filter(Boolean))
  };
}

function detectBackend(){if(backend)return backend;if(idbFactory())backend=idbBackend();return backend;}
function __setBackend(custom){backend=custom||null;return api;}
function __backendStatus(){return backend?'ready':idbFactory()?'lazy':'none';}
function __failures(){return failures.slice();}

function summarize(report){
  const snap=report&&report.snapshot||{},result=snap.result||{};
  const units=(snap.units||[]).map(u=>({id:u.id,name:u.name,team:u.team,beastId:u.beastId||null,npcId:u.npcId||null,hp:Math.round(u.hp||0),maxHP:u.model&&u.model.derived?u.model.derived.HP:0,alive:!u.fallen&&(u.hp||0)>0}));
  const beast=units.find(u=>u.beastId);
  return {
    id:report.id,type:'hunt',recordVersion:SUMMARY_VERSION,
    targetId:report.targetId||result.targetId||(beast&&beast.beastId)||null,
    targetName:beast?beast.name:'十万年魂兽',
    outcome:result.huntOutcome||report.outcome||null,
    winner:result.winner===undefined?null:result.winner,
    reason:result.reason||report.reason||'讨伐结束',
    time:result.time!==undefined?result.time:(snap.now||0),
    seconds:Math.round((result.time!==undefined?result.time:snap.now||0)/100)/10,
    logCount:(snap.log||[]).length,
    units,date:report.date||null,
    sessionId:report.sessionId||report.id,
    archivedAt:new Date().toISOString(),archiveVersion:SUMMARY_VERSION
  };
}

function archiveReport(report){
  if(!report||!report.id)return {ok:false,persisted:'none',id:null,summary:null,reason:'invalid-report'};
  const full={...report,id:report.id};
  memory.set(report.id,full);
  const summary=summarize(full);
  const store=detectBackend();
  if(!store)return {ok:false,persisted:'memory',id:report.id,summary,reason:'no-backend'};
  const promise=Promise.resolve().then(()=>store.put({id:report.id,version:1,summary,report:full})).catch(error=>{
    failures.push({id:report.id,error:String(error&&error.message||error)});
    if(typeof onFailure==='function'){try{onFailure(report.id,error);}catch{}}
    return 'memory';
  });
  return {ok:true,persisted:'archive',id:report.id,summary,promise};
}

function peek(id){const full=memory.get(id);return full||null;}
function has(id){return memory.has(id)||!!detectBackend();}
function get(id){
  const full=memory.get(id);
  if(full)return Promise.resolve(full);
  const store=detectBackend();
  if(!store)return Promise.resolve(null);
  return Promise.resolve().then(()=>store.get(id)).then(full=>{if(full)memory.set(id,full);return full||null;}).catch(()=>null);
}
function remove(id){memory.delete(id);const store=detectBackend();if(store)return Promise.resolve().then(()=>store.remove(id)).catch(()=>false);return Promise.resolve(false);}
async function exportAll(ids){
  const store=detectBackend();
  if(store){try{const rows=await store.all();for(const full of rows)if(full&&full.id&&!memory.has(full.id))memory.set(full.id,full);}catch{}}
  const list=ids?ids.map(id=>memory.get(id)).filter(Boolean):[...memory.values()];
  return list.map(full=>JSON.parse(JSON.stringify(full)));
}
async function importAll(list){
  const reports=Array.isArray(list)?list:[];
  let imported=0,skipped=0;
  for(const report of reports){
    if(!report||!report.id||!report.snapshot){skipped++;continue;}
    const full={...report,id:report.id};
    memory.set(report.id,full);
    const store=detectBackend();
    if(store){try{await store.put({id:report.id,version:1,summary:summarize(full),report:full});}catch{}}
    imported++;
  }
  return {imported,skipped};
}

function migrate(state){
  const reports=state&&state.v12&&state.v12.reports;if(!Array.isArray(reports))return {moved:0,kept:0};
  let moved=0;
  for(let i=0;i<reports.length;i++){
    const record=reports[i];
    if(record&&record.snapshot&&record.id){archiveReport(record);reports[i]=summarize(record);moved++;}
  }
  return {moved,kept:reports.length-moved};
}

const api={
  version:1,summaryVersion:SUMMARY_VERSION,summarize,archiveReport,peek,has,get,remove,
  exportAll,importAll,migrate,
  onFailure(fn){onFailure=typeof fn==='function'?fn:null;return api;},
  memorySize(){return memory.size;},
  clearMemory(){memory.clear();},
  __setBackend,__backendStatus,__failures
};
root.WitnessV12Reports=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
