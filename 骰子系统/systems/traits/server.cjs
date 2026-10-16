/* 可选本地HTTP端口：只读查询和无副作用查重，不启动游戏引擎。 */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const api=require('./index.js');
function createServer(data=JSON.parse(fs.readFileSync(path.join(__dirname,'traits.json'),'utf8'))){
  const registry=api.createRegistry(data),html=fs.readFileSync(path.join(__dirname,'魂性谱.html'));
  function reply(res,status,value,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(value):value);}
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1'),p=url.pathname;
      if(req.method==='GET'&&p==='/')return reply(res,200,html,'text/html; charset=utf-8');
      if(req.method==='GET'&&p==='/api/health')return reply(res,200,{name:'魂性谱',version:api.version,bindings:registry.size,runtimeEnabled:false,gameIntegrationEnabled:!!data.integration?.enabled,budgetVersion:api.balance.budgetVersion,namingVersion:api.naming.version});
      if(req.method==='GET'&&p==='/api/attributes')return reply(res,200,api.tables.attributes);
      if(req.method==='GET'&&p==='/api/balance')return reply(res,200,api.balance.RATES.map((_,i)=>api.balance.profile({tier:i+1,spec:{settlement:'window',event:'paid_action'}})));
      if(req.method==='GET'&&p==='/api/check-name')return reply(res,200,registry.checkName(url.searchParams.get('name')||'',{replaceSoulId:url.searchParams.get('replaceSoulId')||undefined}));
      if(req.method==='GET'&&p==='/api/audit')return reply(res,200,registry.audit());
      if(req.method==='GET'&&p==='/api/traits'){
        const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||50);
        return reply(res,200,registry.list({query:url.searchParams.get('query')||'',attribute:url.searchParams.get('attribute')||undefined,kind:url.searchParams.get('kind')||undefined,tier:url.searchParams.has('tier')?Number(url.searchParams.get('tier')):undefined,offset,limit}));
      }
      if(req.method==='GET'&&p.startsWith('/api/traits/')){
        const id=decodeURIComponent(p.slice('/api/traits/'.length)),trait=registry.getBySoulId(id);
        return reply(res,trait?200:404,trait||{error:'未知武魂ID',soulId:id});
      }
      if(req.method==='POST'&&['/api/check','/api/name','/api/state','/api/observe','/api/evaluate'].includes(p)){
        if(!String(req.headers['content-type']||'').startsWith('application/json'))return reply(res,415,{error:'请使用application/json'});
        let chunks=[],size=0,tooLarge=false;for await(const chunk of req){size+=chunk.length;if(size>1024*1024){tooLarge=true;chunks=[];}else if(!tooLarge)chunks.push(chunk);}
        if(tooLarge)return reply(res,413,{error:'单个候选请求超过1MB'});
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(!body||typeof body!=='object')return reply(res,400,{error:'缺少JSON对象'});
        if(p==='/api/state')return reply(res,200,registry.createState(body.soulId,body.scopeId,{effectiveTier:body.effectiveTier}));
        if(p==='/api/observe')return reply(res,200,registry.recordEvent(body.soulId,body.state,body.event));
        if(p==='/api/evaluate')return reply(res,200,registry.applyToChoice(body.soulId,body.state,body.choice));
        if(!body||!body.candidate)return reply(res,400,{error:'缺少candidate对象'});
        if(p==='/api/name')return reply(res,200,{names:registry.suggestNames(body.candidate,{replaceSoulId:body.replaceSoulId})});
        const result=registry.checkCandidate(body.candidate,{replaceSoulId:body.replaceSoulId});
        return reply(res,200,result);
      }
      return reply(res,404,{error:'接口不存在'});
    }catch(error){if(!res.headersSent)reply(res,400,{error:error.message});else res.end();}
  });
  return server;
}
module.exports={createServer};
if(require.main===module){
  const requested=process.argv[2]===undefined?18768:Number(process.argv[2]);
  if(!Number.isInteger(requested)||requested<1||requested>65535)throw Error('端口须为1—65535整数');
  const server=createServer();server.on('error',error=>{console.error('魂性谱启动失败：'+error.message);process.exitCode=1;});
  server.listen(requested,'127.0.0.1',()=>console.log('魂性谱本地端口：http://127.0.0.1:'+requested+'\n仅查询与查重，尚未启用游戏效果。按Ctrl+C关闭。'));
}
