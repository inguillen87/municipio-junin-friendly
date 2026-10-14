// A real loopback HTTP stream into actual handlers; every actor and row is
// provided by the disposable QA foundation. No operational session or host.
import http from 'node:http';
import assert from 'node:assert/strict';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES,readOwnPayrollResponse} from '../../assets/own-payroll-response.js';

export async function withOwnPayrollFullHttp({handler,env},work){
 const original=env.INTERNAL_APP_ORIGIN,stats={requests:0,bytes:0,chunks:0};
 const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');if(u.pathname!=='/api/internal-own-payroll-run'){res.writeHead(404).end();return;}
  let body=Buffer.alloc(0);for await(const part of req){body=Buffer.concat([body,part]);if(body.length>512*1024){res.writeHead(413).end();return;}}
  res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
  const write=res.write.bind(res);res.write=(part,...args)=>{stats.chunks++;stats.bytes+=Buffer.byteLength(part);return write(part,...args);};
  try{await handler({method:req.method,url:req.url,query:Object.fromEntries(u.searchParams),headers:req.headers,...(body.length?{body:body.toString('utf8')}:{})},res);}
  catch{if(res.headersSent)res.destroy();else res.status(503).json({ok:false,error:'Fallo exclusivamente sintético de HTTP QA.'});}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;env.INTERNAL_APP_ORIGIN=origin;
 try{
  const api=async({body,key,expected=200})=>{
   stats.requests++;const url=origin+'/api/internal-own-payroll-run'+(body?'':'?resource=attempt&key='+encodeURIComponent(key));
   const response=await fetch(url,{method:body?'POST':'GET',headers:{Accept:OWN_RUN_FULL_JSON,...(body?{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key}:{})},...(body?{body:JSON.stringify({operation:'calculate',payload:body})}:{})});
   const value=await readOwnPayrollResponse(response,{maxBytes:OWN_RUN_FULL_MAX_BYTES});assert.equal(response.status,expected,JSON.stringify(value?.error));
   assert.equal(response.headers.get('content-type'),OWN_RUN_FULL_JSON+'; charset=utf-8');assert.equal(value.ok,true);return value.data;
  };
  return await work({api,stats});
 }finally{env.INTERNAL_APP_ORIGIN=original;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
