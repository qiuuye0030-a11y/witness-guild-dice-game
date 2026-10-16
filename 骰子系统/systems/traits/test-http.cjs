'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createServer}=require('./server.cjs');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'traits.json'),'utf8'));
async function main(){
  const server=createServer(data);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;let passed=0;
  const get=(p,options)=>fetch(origin+p,{...options,signal:AbortSignal.timeout(15000)});
  async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
  try{
    await test('端口只监听本机，健康接口显示草案状态',async()=>{assert.equal(server.address().address,'127.0.0.1');const r=await get('/api/health');const b=await r.json();assert.equal(b.bindings,2464);assert.equal(b.runtimeEnabled,false);});
    await test('按玩家武魂ID和会员武魂ID读取',async()=>{for(const id of ['T08-08','npc-linshi']){const r=await get('/api/traits/'+encodeURIComponent(id));assert.equal(r.status,200);assert.equal((await r.json()).soulId,id);}});
    await test('中文ID经编码可读',async()=>{const t=data.items.find(t=>t.soulId.includes('兽'));const r=await get('/api/traits/'+encodeURIComponent(t.soulId));assert.equal((await r.json()).soulId,t.soulId);});
    await test('未知武魂和未知接口返回404',async()=>{assert.equal((await get('/api/traits/not-found')).status,404);assert.equal((await get('/not-found')).status,404);});
    await test('筛选和分页生效',async()=>{const r=await get('/api/traits?attribute='+encodeURIComponent('土')+'&kind=battle&limit=3&offset=1');const b=await r.json();assert.equal(b.items.length,3);assert(b.items.every(t=>t.kind==='battle'&&t.sourceAttributes.includes('土')));});
    await test('非法分页参数返回400',async()=>{assert.equal((await get('/api/traits?limit=-1')).status,400);assert.equal((await get('/api/traits?offset=abc')).status,400);});
    await test('关键词表和查重报告可调用',async()=>{const table=await(await get('/api/attributes')).json();assert.deepEqual(table['土'],['积聚','塑形']);const r=await(await get('/api/audit')).json();assert.equal(r.ok,true);assert.equal(r.duplicateMechanics.length,0);assert(r.similarFamilies.length>0);});
    await test('十档预算与按潜力筛选可调用',async()=>{const rows=await(await get('/api/balance')).json();assert.equal(rows.length,10);assert.equal(rows[9].growth.rate,.135);const r=await(await get('/api/traits?tier=8&limit=5')).json();assert(r.items.every(t=>t.tier===8));assert.equal((await get('/api/traits?tier=11')).status,400);});
    await test('通过端口触发并自动结算玩家已选训练，没有分支选择请求',async()=>{const t=data.items.find(t=>t.kind==='growth'&&t.spec.condition==='always'&&t.spec.settlement==='reserve'&&t.spec.benefit==='progress');const post=async(p,b)=>{const r=await get(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});assert.equal(r.status,200);return r.json();};let s=await post('/api/state',{soulId:t.soulId,scopeId:'http-training'});s=(await post('/api/observe',{soulId:t.soulId,state:s,event:{id:'training-trigger',type:t.spec.event}})).state;const result=await post('/api/evaluate',{soulId:t.soulId,state:s,choice:{id:'training-result',trainingKey:'A',amount:10}});assert(result.applied);assert(result.choice.amount>10);assert.equal(result.choice.trainingKey,'A');});
    await test('可单独取名并检查名称重复',async()=>{const candidate=data.items[0];const check=await(await get('/api/check-name?name='+encodeURIComponent(candidate.name))).json();assert.equal(check.ok,false);const names=await(await get('/api/name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate})})).json();assert(names.names.length>0);assert(!names.names.includes(candidate.name));});
    await test('POST查重可检出重复并支持替换预检',async()=>{const candidate=data.items[0],options={method:'POST',headers:{'Content-Type':'application/json'}};const bad=await(await get('/api/check',{...options,body:JSON.stringify({candidate})})).json();assert.equal(bad.ok,false);assert.equal(bad.duplicateMechanics.length,1);const good=await(await get('/api/check',{...options,body:JSON.stringify({candidate,replaceSoulId:candidate.soulId})})).json();assert.equal(good.ok,true);});
    await test('非法JSON、内容类型和超大请求不会中断服务',async()=>{assert.equal((await get('/api/check',{method:'POST',body:'x'})).status,415);assert.equal((await get('/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);assert.equal((await get('/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(1024*1024+1)})).status,413);assert.equal((await get('/api/health')).status,200);});
    await test('审阅页面可读取，无文件遍历和写入接口',async()=>{const r=await get('/');assert.equal(r.status,200);assert((await r.text()).includes('魂性谱'));assert.equal((await get('/index.js')).status,404);assert.equal((await get('/api/traits',{method:'POST'})).status,404);});
    const result={passed,total:passed,scope:'本机临时端口HTTP接口验证；验证后服务关闭，不运行对战或旅程'};fs.writeFileSync(path.join(__dirname,'verification-http.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
