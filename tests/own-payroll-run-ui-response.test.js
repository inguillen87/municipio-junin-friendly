// Real local HTTP only; no database/provider and no claim about CDP eviction.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {qaPassiveJsonHttpResponse,qaCorrelatedPostJsonResponse} from '../scripts/lib/qa-passive-json-http-response.mjs';
const pathname='/api/internal-own-payroll-run',key='synthetic-http-attempt-19041',capture={key,body:{period:'2026-10',liquidationType:'monthly',selection:{kind:'all',values:[]}}};
const command=JSON.stringify({operation:'calculate',payload:capture.body}),errorBody={ok:false,code:'OWN_RUN_SOURCE_AMBIGUOUS',error:"Fuente única: niño / apostrophe ' / public.$1"};
const encode=value=>Buffer.from(JSON.stringify(value),'utf8');
async function exchange(handler,{method='POST',path=pathname,requestBody=command,maxBytes,timeoutMs,clientAbort=false}={}){
 let observation,ownedResponse,originalWrite,originalEnd,resolveStarted,rejectHandler;
 const started=new Promise(resolve=>{resolveStarted=resolve;}),handlerFailure=new Promise((_,reject)=>{rejectHandler=reject;});handlerFailure.catch(()=>{});
 const observedCalls=[],server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff');
  const write=res.write,end=res.end;
  originalWrite=function(...args){const returned=Reflect.apply(write,this,args);observedCalls.push({kind:'write',args,returned});return returned;};
  originalEnd=function(...args){const returned=Reflect.apply(end,this,args);observedCalls.push({kind:'end',args,returned});return returned;};
  res.write=originalWrite;res.end=originalEnd;ownedResponse=res;
  observation=qaPassiveJsonHttpResponse(req,res,{...(maxBytes===undefined?{}:{maxBytes}),...(timeoutMs===undefined?{}:{timeoutMs})});resolveStarted();
  Promise.resolve().then(()=>handler(req,res,observation)).catch(error=>{rejectHandler(error);res.destroy(error);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const client=new Promise((resolve,reject)=>{
  const req=http.request(origin+path,{method,agent:false,headers:{'Content-Type':'application/json','Idempotency-Key':key}},res=>{
   const chunks=[];let ended=false;
   res.on('data',chunk=>{chunks.push(Buffer.from(chunk));if(clientAbort)res.destroy();});
   res.on('end',()=>{ended=true;resolve({status:res.statusCode,headers:res.headers,buffer:Buffer.concat(chunks),ended});});
   res.on('error',error=>{if(clientAbort)resolve({status:res.statusCode,headers:res.headers,buffer:Buffer.concat(chunks),ended,error});else reject(error);});
   res.on('close',()=>{if(clientAbort&&!ended)resolve({status:res.statusCode,headers:res.headers,buffer:Buffer.concat(chunks),ended});});
  });req.on('error',reject);req.end(requestBody);
 });
 try{
  await started;
  const [wire,record]=await Promise.race([Promise.all([client,observation.result.then(packet=>({packet}),error=>({error}))]),handlerFailure]);
  assert.strictEqual(ownedResponse.write,originalWrite,'original write restored');assert.strictEqual(ownedResponse.end,originalEnd,'original end restored');
  return{wire,...record,observation,observedCalls,origin};
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
function browserPair(actual,{status=actual.wire.status,headers=actual.wire.headers,requestKey=key,body=JSON.parse(command),url=actual.origin+pathname,method='POST'}={}){
 const request={url:()=>url,method:()=>method,allHeaders:async()=>({'idempotency-key':requestKey}),postDataJSON:()=>body};
 const response={request:()=>request,status:()=>status,allHeaders:async()=>headers,json(){throw Error('CDP_JSON_MUST_NOT_BE_USED');},text(){throw Error('CDP_TEXT_MUST_NOT_BE_USED');},body(){throw Error('CDP_BODY_MUST_NOT_BE_USED');}};
 return{request,response,args:{response,requests:[request],observations:[actual.observation],origin:actual.origin,pathname,capture}};
}

test('real 422 JSON end preserves request stream, bytes, status, headers, end callback and return',async()=>{
 let endCallback=0;const expected=encode(errorBody),actual=await exchange(async(req,res)=>{
  const parts=[];for await(const chunk of req)parts.push(chunk);assert.equal(Buffer.concat(parts).toString(),command);
  res.statusCode=422;res.setHeader('Content-Length',String(expected.length));
  const callback=()=>{endCallback++;};assert.strictEqual(res.end(expected,'utf8',callback),res);
 });
 assert.deepEqual(actual.wire.buffer,expected);assert.deepEqual(actual.packet.buffer,expected);assert.deepEqual(actual.packet.body,errorBody);assert.equal(actual.packet.bytes,expected.length);assert.equal(actual.packet.status,422);assert.equal(endCallback,1);assert.equal(actual.packet.serverFinished,true);assert.equal(actual.packet.clientReceiptProven,false);
 assert.equal(actual.observedCalls.length,1);assert.equal(actual.observedCalls[0].kind,'end');assert.strictEqual(actual.observedCalls[0].args[0],expected);assert.equal(actual.observedCalls[0].args[1],'utf8');assert.equal(typeof actual.observedCalls[0].args[2],'function');
 const pair=browserPair(actual);assert.strictEqual(await qaCorrelatedPostJsonResponse(pair.args),actual.packet);
});

test('receipt fixes status and array headers when native writeHead emits them, not later mutable fields',async()=>{
 const values=['first'],expected=encode(errorBody);
 const actual=await exchange((_req,res)=>{
  res.setHeader('X-QA-Values',values);assert.strictEqual(res.writeHead(422,{'X-QA-Emitted':'yes'}),res);
  // Neither assignment changes the header block already given to native HTTP.
  res.statusCode=503;values.push('later');res.end(expected);
 });
 assert.equal(actual.wire.status,422);assert.equal(actual.wire.headers['x-qa-values'],'first');assert.equal(actual.packet.status,422);assert.deepEqual(actual.packet.headers['x-qa-values'],['first']);assert.equal(actual.packet.headers['x-qa-emitted'],'yes');
 const pair=browserPair(actual);await qaCorrelatedPostJsonResponse(pair.args);
});

test('actual multi-write response preserves every buffer, callback, native false return and drain',async()=>{
 const expectedBody={...errorBody,large:'é😀'.repeat(180000)},expected=encode(expectedBody);let callbacks=0,drains=0,writes=0;
 const actual=await exchange(async(_req,res)=>{
  res.statusCode=422;res.setHeader('Content-Type','application/vnd.municontrol.payroll-full.v1+json; charset=utf-8');res.setHeader('X-MuniControl-JSON-Bytes',String(expected.length));
  // Split inside multibyte UTF-8 as well as beyond native writableHighWaterMark.
  const cuts=[1,2,3,131075,524291,expected.length];let previous=0;
  for(const next of cuts){const chunk=expected.subarray(previous,next);previous=next;const callback=()=>{callbacks++;};writes++;if(!res.write(chunk,callback)){drains++;await once(res,'drain');}}
  assert.strictEqual(res.end(),res);
 },{maxBytes:2*1024*1024});
 assert.deepEqual(actual.wire.buffer,expected);assert.deepEqual(actual.packet.buffer,expected);assert.deepEqual(actual.packet.body,expectedBody);assert.equal(callbacks,writes);assert.ok(drains>0,'real ServerResponse reports backpressure');
 assert.equal(actual.observedCalls.filter(call=>call.kind==='write').length,writes);assert.ok(actual.observedCalls.some(call=>call.kind==='write'&&call.returned===false));
 for(const call of actual.observedCalls.filter(call=>call.kind==='write'))assert.equal(typeof call.args[1],'function','callback overload passed unchanged');
 assert.equal(actual.observedCalls.at(-1).kind,'end');assert.equal(actual.observedCalls.at(-1).args.length,0);
 const pair=browserPair(actual);await qaCorrelatedPostJsonResponse(pair.args);
});

for(const scenario of [
 {label:'fatal UTF-8',bytes:Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xc3,0x28,0x22,0x7d]),match:/encoded data|encoding/i},
 {label:'incomplete JSON',bytes:Buffer.from('{"ok":false'),match:/JSON|Unexpected/i},
 {label:'configured byte bound',bytes:encode(errorBody),maxBytes:8,match:/QA_PASSIVE_RESPONSE_LIMIT/},
 {label:'announced byte mismatch',bytes:encode(errorBody),announced:'1',match:/QA_PASSIVE_BYTE_HEADER_MISMATCH/},
 {label:'invalid announced byte header',bytes:encode(errorBody),announced:'01',match:/QA_PASSIVE_BYTE_HEADER_INVALID/}
])test('observation rejects '+scenario.label+' while native HTTP bytes remain unchanged',async()=>{
 const actual=await exchange((_req,res)=>{res.statusCode=422;if(scenario.announced)res.setHeader('X-MuniControl-JSON-Bytes',scenario.announced);res.end(scenario.bytes);},{maxBytes:scenario.maxBytes});
 assert.match(actual.error.message,scenario.match);assert.deepEqual(actual.wire.buffer,scenario.bytes);assert.equal(actual.wire.status,422);assert.equal(actual.packet,undefined);
});

test('real client disconnect rejects a response which never reached native finish',async()=>{
 const actual=await exchange((_req,res)=>{res.statusCode=422;res.write('{"ok":false,');},{clientAbort:true});
 assert.match(actual.error.message,/QA_PASSIVE_RESPONSE_PREMATURE_CLOSE/);assert.equal(actual.wire.ended,false);assert.equal(actual.packet,undefined);
});

test('native response error is preserved without ending, replacing or retrying its response',async()=>{
 const error=Error('owned synthetic response error');
 const actual=await exchange((_req,res)=>{res.statusCode=503;res.write('{"ok":');res.emit('error',error);res.end('false}');});
 assert.strictEqual(actual.error,error);assert.equal(actual.wire.buffer.toString(),'{"ok":false}');assert.equal(actual.wire.status,503);assert.equal(actual.observedCalls.length,2);
});

test('correlation refuses foreign request object, key, payload, scope and duplicated posts',async()=>{
 const actual=await exchange((_req,res)=>{res.statusCode=422;res.end(encode(errorBody));});
 const cases=[
  {change:pair=>({...pair.args,requests:[{...pair.request}]}),match:/RESPONSE_REQUEST_MISMATCH/},
  {change:pair=>({...pair.args,requests:[pair.request,pair.request]}),match:/ONE_BROWSER_POST_REQUIRED/},
  {change:pair=>({...pair.args,observations:[actual.observation,actual.observation]}),match:/ONE_SERVER_POST_REQUIRED/},
  {options:{requestKey:'another-key'},match:/REQUEST_KEY_MISMATCH/},
  {options:{body:{operation:'calculate',payload:{...capture.body,period:'2026-11'}}},match:/CAPTURE_PAYLOAD_MISMATCH/},
  {options:{body:{operation:'calculate',payload:capture.body,extra:true}},match:/CAPTURE_PAYLOAD_MISMATCH/},
  {options:{url:'http://other.invalid'+pathname},match:/ORIGIN_MISMATCH/},
  {options:{url:actual.origin+'/api/other'},match:/PATH_MISMATCH/},
  {options:{url:actual.origin+pathname+'?other=1'},match:/QUERY_FORBIDDEN/},
  {options:{method:'GET'},match:/POST_REQUIRED/},
  {change:pair=>({...pair.args,observations:[{...actual.observation,key:'other'}]}),match:/SERVER_KEY_MISMATCH/}
 ];
 for(const item of cases){const pair=browserPair(actual,item.options);await assert.rejects(qaCorrelatedPostJsonResponse(item.change?item.change(pair):pair.args),item.match);}
});

test('correlation preserves actual HTTP status, required no-store and exact announced byte count',async()=>{
 const actual=await exchange((_req,res)=>{res.statusCode=503;res.end(encode({ok:false,code:'OWN_RUN_UNAVAILABLE'}));});
 const pair=browserPair(actual),packet=await qaCorrelatedPostJsonResponse(pair.args);assert.equal(packet.status,503);assert.equal(packet.body.code,'OWN_RUN_UNAVAILABLE');assert.equal(packet.status===422&&packet.body.code==='OWN_RUN_SOURCE_AMBIGUOUS',false,'the runner original guard must reject this actual packet');
 await assert.rejects(qaCorrelatedPostJsonResponse(browserPair(actual,{status:422}).args),/STATUS_MISMATCH/);
 await assert.rejects(qaCorrelatedPostJsonResponse(browserPair(actual,{headers:{...actual.wire.headers,'content-type':'text/html'}}).args),/HEADER_MISMATCH/);
 await assert.rejects(qaCorrelatedPostJsonResponse(browserPair(actual,{headers:{...actual.wire.headers,'cache-control':'public'}}).args),/HEADER_MISMATCH/);
 await assert.rejects(qaCorrelatedPostJsonResponse(browserPair(actual,{headers:{...actual.wire.headers,'content-length':'1'}}).args),/BROWSER_BYTE_HEADER_MISMATCH/);
});

test('GET and another route remain distinct actual server observations',async()=>{
 const other=await exchange((_req,res)=>{res.statusCode=200;res.end(encode({ok:true}));},{method:'GET',path:'/api/other'});
 assert.equal(other.observation.method,'GET');assert.equal(other.observation.pathname,'/api/other');
 const pair=browserPair(other);await assert.rejects(qaCorrelatedPostJsonResponse(pair.args));
});

test('own deadline rejects actual headers plus partial body with no native finish, without touching transport',async()=>{
 let response,observation,resolveStarted,resolveFragment,nativeWrite,nativeEnd,nativeWriteHead,nativeListeners;
 const started=new Promise(resolve=>{resolveStarted=resolve;}),fragment=new Promise(resolve=>{resolveFragment=resolve;});
 const server=http.createServer((req,res)=>{
  response=res;res.statusCode=422;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  nativeWrite=res.write;nativeEnd=res.end;nativeWriteHead=res.writeHead;nativeListeners={finish:res.listenerCount('finish'),error:res.listenerCount('error')};
  observation=qaPassiveJsonHttpResponse(req,res,{timeoutMs:50});
  res.write('{"ok":false,');resolveStarted();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const client=new Promise((resolve,reject)=>{
  const req=http.request(origin+pathname,{method:'POST',agent:false,headers:{'Idempotency-Key':key}},res=>{
   const parts=[];res.on('data',chunk=>{parts.push(Buffer.from(chunk));resolveFragment();});res.on('end',()=>resolve({status:res.statusCode,buffer:Buffer.concat(parts)}));res.on('error',reject);
  });req.on('error',reject);req.end(command);
 });
 try{
  await started;await fragment;const before=performance.now();
  await assert.rejects(observation.result,error=>error.code==='QA_PASSIVE_RESPONSE_FINISH_TIMEOUT'&&error.message==='QA_PASSIVE_RESPONSE_FINISH_TIMEOUT');
  assert.ok(performance.now()-before<1000,'the observer owns an independent bounded deadline');
  assert.equal(response.destroyed,false);assert.equal(response.writableEnded,false);assert.equal(response.writableFinished,false);assert.equal(response.socket.destroyed,false);
  assert.strictEqual(response.write,nativeWrite);assert.strictEqual(response.end,nativeEnd);assert.strictEqual(response.writeHead,nativeWriteHead);
  assert.equal(response.listenerCount('finish'),nativeListeners.finish);assert.equal(response.listenerCount('error'),nativeListeners.error);
  // Only the test, AFTER rejection, completes the still-open native response.
  // The observer neither ends/destroys/resumes nor reemits anything on timeout.
  response.end('"code":"OWN_RUN_SOURCE_AMBIGUOUS"}');const wire=await client;
  assert.equal(wire.status,422);assert.deepEqual(JSON.parse(wire.buffer.toString()),{ok:false,code:'OWN_RUN_SOURCE_AMBIGUOUS'});
  await assert.rejects(observation.result,{code:'QA_PASSIVE_RESPONSE_FINISH_TIMEOUT'});
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('native finish, error and premature close clear their own deadline before expiry',async()=>{
 const timerCount=()=>process.getActiveResourcesInfo().filter(type=>type==='Timeout').length;
 const beforeFinish=timerCount(),finished=await exchange((_req,res)=>{res.statusCode=422;res.end(encode(errorBody));},{timeoutMs:1000});assert.equal(finished.packet.status,422);assert.ok(timerCount()<=beforeFinish,'finish releases the deadline timer');
 const beforeError=timerCount(),owned=Error('owned pre-deadline error'),failed=await exchange((_req,res)=>{res.write('{"ok":');res.emit('error',owned);res.end('false}');},{timeoutMs:1000});assert.strictEqual(failed.error,owned);assert.ok(timerCount()<=beforeError,'error releases the deadline timer');
 const beforeClose=timerCount(),closed=await exchange((_req,res)=>res.write('{"ok":false,'),{timeoutMs:1000,clientAbort:true});assert.match(closed.error.message,/PREMATURE_CLOSE/);assert.ok(timerCount()<=beforeClose,'premature close releases the deadline timer');
});

test('deadline arguments reject invalid or increased values before wrapping real HTTP',async()=>{
 const server=http.createServer((req,res)=>{
  const write=res.write,end=res.end,writeHead=res.writeHead;
  for(const timeoutMs of [0,-1,1.5,NaN,Infinity,30001,'30000',null])assert.throws(()=>qaPassiveJsonHttpResponse(req,res,{timeoutMs}),/QA_PASSIVE_FINISH_DEADLINE_REQUIRED/);
  assert.strictEqual(res.write,write);assert.strictEqual(res.end,end);assert.strictEqual(res.writeHead,writeHead);
  res.setHeader('Content-Type','application/json');res.end('{"ok":true}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await new Promise((resolve,reject)=>{http.get('http://127.0.0.1:'+server.address().port,{agent:false},res=>{res.resume();res.on('end',resolve);res.on('error',reject);}).on('error',reject);});}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 const source=fs.readFileSync(new URL('../scripts/lib/qa-passive-json-http-response.mjs',import.meta.url),'utf8');assert.ok(source.includes('timeoutMs=30000'));assert.ok(source.includes('timeoutMs<=30000'));assert.ok(source.includes('clearTimeout(timer)'));
});

test('runner keeps every original assertion after the failed POST and retires the CDP body waiter',()=>{
 const source=fs.readFileSync(new URL('../scripts/verify-own-payroll-run-ui.mjs',import.meta.url),'utf8');
 assert.equal(source.includes('qaPostJsonResponseWaiter'),false);assert.equal(source.includes('response.json()'),false);
 assert.ok(source.includes("if(observedRunPosts&&url.pathname==='/api/internal-own-payroll-run'&&req.method==='POST')observedRunPosts.push(qaPassiveJsonHttpResponse(req,res));"));
 assert.ok(source.includes('qaCorrelatedPostJsonResponse({response:failedResponse,requests:failedRequests,observations:reviewObservations,origin,'));
 const tail=source.slice(source.indexOf('  check(failedResponse.status()===422'));
 assert.equal(createHash('sha256').update(tail).digest('hex'),'bc7efdf29d82ddf40c5785b2f9786f1f2a95fd38d83264197bbf9a811ec3c83b','all following source-review, recovery, mobile, revocation and SQL-count checks remain byte-identical');
});
