import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as qa from '../scripts/lib/qa-json-response-observer.mjs';

const origin='https://qa.example.invalid',endpoint='/api/internal-own-payroll-run',key='8c5a8140-8864-4f29-a4e8-f5f659432041';
const relevant=request=>{const u=new URL(request.url());return u.origin===origin&&u.pathname===endpoint;};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function request({method='GET',url=origin+endpoint+'?resource=attempt&key='+key}={}){
 return {method:()=>method,url:()=>url,headers:()=>method==='POST'?{'idempotency-key':key}:{}};
}
function response(req,read,{status=200}={}){let reads=0;return {request:()=>req,status:()=>status,json:()=>{reads++;return read();},reads:()=>reads};}
const lifecycle=()=>{let tick=0;return qa.qaJsonResponseLifecycle({now:()=>tick++,documentUrl:origin+'/nomina-control.html#calculo'});};

test('causal: the same rejected body promise is bound to exact response read start and settlement',async()=>{
 const finished=deferred(),body=deferred(),cause=Error('original CDP cause'),error=Error('Protocol error (Network.getResponseBody): No data found for resource with given identifier',{cause});
 const req=request(),promise=finished.promise.then(()=>body.promise),reply=response(req,()=>promise),events=[],responses=[],bodies=new WeakMap();
 const trace={response:(event,observed,reason)=>events.push({event,observed,reason})};qa.qaJsonResponseObserver(relevant,responses,bodies,trace)(reply);
 assert.equal(bodies.get(reply),promise);assert.equal(reply.reads(),1);assert.deepEqual(events.map(row=>row.event),['response','body-read-started']);finished.resolve();body.reject(error);
 await assert.rejects(()=>bodies.get(reply),value=>value===error&&value.cause===cause);assert.deepEqual(events.map(row=>row.event),['response','body-read-started','body-read-rejected']);assert.ok(events.every(row=>row.observed===reply));assert.equal(events.at(-1).reason,error);assert.equal(reply.reads(),1);assert.deepEqual(responses,[reply]);
});

test('a delayed CDP rejection after requestfinished records no navigation and preserves the live error and cause',async()=>{
 const trace=lifecycle(),req=request(),finished=deferred(),cdp=deferred(),cause=Error('private cause'),error=Error('private error',{cause}),promise=finished.promise.then(()=>cdp.promise),reply=response(req,()=>promise),responses=[],bodies=new WeakMap();
 trace.request(req);qa.qaJsonResponseObserver(relevant,responses,bodies,trace)(reply);trace.requestFinished(req);finished.resolve();await Promise.resolve();cdp.reject(error);
 await assert.rejects(()=>bodies.get(reply),value=>value===error&&value.cause===cause);trace.failure(error);trace.stop();const events=trace.snapshot().events;
 assert.deepEqual(events.map(row=>row.event),['observation-started','request','response','body-read-started','request-finished','body-read-rejected','command-rejected','observation-stopped']);assert.ok(events.every(row=>row.mainFrameNavigationEpoch===0));assert.deepEqual(events.filter(row=>row.request).map(row=>row.request.id),[1,1,1,1,1]);assert.equal(events.find(row=>row.event==='body-read-rejected').failureCode,'UNCLASSIFIED_FAILURE');assert.equal(reply.reads(),1);assert.equal(bodies.get(reply),promise);assert.equal(error.cause,cause);
});

test('an observed frame event is ordered without being promoted to the cause of the same rejection',async()=>{
 const trace=lifecycle(),req=request(),pending=deferred(),error=Error('original private body failure'),reply=response(req,()=>pending.promise),responses=[],bodies=new WeakMap();trace.request(req);qa.qaJsonResponseObserver(relevant,responses,bodies,trace)(reply);trace.navigation(origin+'/nomina-control.html#calculo');trace.requestFinished(req);pending.reject(error);await assert.rejects(()=>bodies.get(reply),value=>value===error);trace.stop();const events=trace.snapshot().events,started=events.find(row=>row.event==='body-read-started'),navigation=events.find(row=>row.event==='main-frame-navigated'),settled=events.find(row=>row.event==='body-read-rejected');
 assert.equal(started.mainFrameNavigationEpoch,0);assert.equal(navigation.mainFrameNavigationEpoch,1);assert.equal(settled.mainFrameNavigationEpoch,1);assert.ok(started.elapsedMs<navigation.elapsedMs&&navigation.elapsedMs<settled.elapsedMs);assert.deepEqual(navigation.document,{page:'payroll',phase:'calculate'});assert.equal(Object.hasOwn(settled,'navigationCausedFailure'),false);assert.equal(reply.reads(),1);
});

test('one POST and one GET retain distinct local handles and a shared opaque key ID without persisting the key',async()=>{
 const trace=lifecycle(),post=request({method:'POST',url:origin+endpoint}),get=request(),posted=response(post,()=>assert.fail('POST body must not be read'),{status:503}),payload={ok:true,data:{key,amount:'1.000000000000000001',value:null}},read=response(get,()=>Promise.resolve(payload)),requests=[post,get],responses=[],bodies=new WeakMap(),observe=qa.qaJsonResponseObserver(relevant,responses,bodies,trace);for(const req of requests)trace.request(req);observe(posted);observe(read);trace.requestFinished(post);trace.requestFinished(get);assert.deepEqual(await bodies.get(read),payload);trace.stop();const saved=trace.snapshot({kind:'run',command:'calculate'}),events=saved.events,seen=events.filter(row=>row.event==='request');
 assert.deepEqual(seen.map(row=>[row.request.id,row.request.method]),[[1,'POST'],[2,'GET']]);assert.equal(seen[0].request.keyId,seen[1].request.keyId);assert.equal(seen[0].request.keyId,1);assert.equal(JSON.stringify(saved).includes(key),false);assert.equal(saved.kind,'run');assert.equal(saved.command,'calculate');assert.deepEqual(events.filter(row=>row.event==='response').map(row=>[row.request.id,row.response.id,row.response.status]),[[1,1,503],[2,2,200]]);assert.equal(posted.reads(),0);assert.equal(read.reads(),1);assert.equal(bodies.has(posted),false);assert.deepEqual(responses,[posted,read]);assert.deepEqual(requests,[post,get]);
});

test('identical URL values cannot conflate distinct handles, and distinct keys receive local IDs only',()=>{
 const trace=lifecycle(),first=request(),second=request(),third=request({url:origin+endpoint+'?resource=attempt&key=other-private-key'});trace.request(first);trace.request(second);trace.request(third);trace.requestFailed(first);trace.requestFinished(second);trace.stop();const rows=trace.snapshot().events.filter(row=>row.request);assert.deepEqual(rows.map(row=>row.request.id),[1,2,3,1,2]);assert.deepEqual(rows.map(row=>row.request.keyId),[1,1,2,1,1]);
});

test('request failure, page close and synchronous body throw preserve the exact exception without reading failure text',()=>{
 const trace=lifecycle(),req=request(),cause=Error('private cause'),error=Error('private synchronous failure',{cause}),reply=response(req,()=>{throw error;}),responses=[],bodies=new WeakMap();let failureReads=0;req.failure=()=>{failureReads++;throw Error('PRIVATE_FAILURE_TEXT');};trace.request(req);assert.throws(()=>qa.qaJsonResponseObserver(relevant,responses,bodies,trace)(reply),value=>value===error&&value.cause===cause);trace.requestFailed(req);trace.pageClosed();trace.failure(error);trace.stop();const events=trace.snapshot().events;assert.ok(events.some(row=>row.event==='body-read-threw'&&row.failureCode==='UNCLASSIFIED_FAILURE'));assert.ok(events.some(row=>row.event==='request-failed'&&row.failureCode==='REQUEST_FAILED'));assert.ok(events.some(row=>row.event==='page-closed'));assert.equal(failureReads,0);assert.equal(reply.reads(),1);assert.equal(bodies.has(reply),false);assert.deepEqual(responses,[reply]);
});

test('a diagnostic callback failure cannot replace body success or its original failure',async()=>{
 const trace={response(){throw Error('diagnostic itself failed');}},goodBody={ok:true,data:{zero:'0',empty:null}},good=response(request(),()=>Promise.resolve(goodBody)),error=Error('original body error'),bad=response(request(),()=>Promise.reject(error)),responses=[],bodies=new WeakMap(),observe=qa.qaJsonResponseObserver(relevant,responses,bodies,trace);observe(good);observe(bad);assert.deepEqual(await bodies.get(good),goodBody);await assert.rejects(()=>bodies.get(bad),value=>value===error);assert.equal(good.reads(),1);assert.equal(bad.reads(),1);
});

test('causal: persisted lifecycle never contains AssertionError bodies, secrets, causes, URLs or arbitrary event values',async()=>{
 const secret='PRIVATE_BODY_SECRET_DO_NOT_PERSIST',privateCause='PRIVATE_CAUSE_SECRET_DO_NOT_PERSIST';let error;try{assert.deepEqual({body:secret},{body:'different'});}catch(value){error=value;}assert.ok(error);const cause=Error(privateCause);cause.code=secret;error.cause=cause;error.code=secret;error.name=secret;error.stack=privateCause;
 let tick=0;const trace=qa.qaJsonResponseLifecycle({now:()=>tick++,documentUrl:'https://'+secret+'.invalid/'+secret+'?token='+secret+'#'+secret}),req=request({url:origin+endpoint+'?resource=attempt&key='+secret+'&token='+secret}),reply=response(req,()=>Promise.reject(error)),responses=[],bodies=new WeakMap();req.headers=()=>({'idempotency-key':secret});req.failure=()=>({errorText:secret});trace.request(req);qa.qaJsonResponseObserver(relevant,responses,bodies,trace)(reply);await assert.rejects(()=>bodies.get(reply),value=>value===error&&value.cause===cause);trace.response(secret,reply,error);trace.navigation('https://'+secret+'.invalid/'+secret+'?token='+secret+'#'+secret);trace.requestFailed(req);trace.failure(error);trace.stop();const saved=trace.snapshot({kind:secret,command:secret,body:{secret}}),bytes=JSON.stringify(saved);
 assert.equal(bytes.includes(secret),false);assert.equal(bytes.includes(privateCause),false);assert.equal(bytes.includes('AssertionError'),false);assert.equal(bytes.includes('https://'),false);assert.equal(saved.kind,'other');assert.equal(saved.command,'other');assert.ok(saved.events.some(row=>row.event==='unsupported-event'));assert.equal(reply.reads(),1);assert.equal(error.cause,cause);
});

test('only the demonstrated CDP message signature becomes a fixed category and original errors remain unchanged',async()=>{
 const secret='PRIVATE_SUFFIX_NEVER_PERSIST',actual=Error('response.json: Protocol error (Network.getResponseBody): No data found for resource with given identifier\n'+secret),embedded=Error('Assertion body mentions response.json: Protocol error (Network.getResponseBody): No data found for resource with given identifier\n'+secret);
 for(const [error,expected]of [[actual,'GET_RESPONSE_BODY_UNAVAILABLE'],[embedded,'UNCLASSIFIED_FAILURE']]){
  const trace=lifecycle(),req=request(),reply=response(req,()=>Promise.reject(error)),responses=[],bodies=new WeakMap();qa.qaJsonResponseObserver(relevant,responses,bodies,trace)(reply);await assert.rejects(()=>bodies.get(reply),value=>value===error);trace.failure(error);trace.stop();const saved=trace.snapshot();assert.equal(saved.events.find(row=>row.event==='body-read-rejected').failureCode,expected);assert.equal(JSON.stringify(saved).includes(secret),false);assert.equal(JSON.stringify(saved).includes(error.message),false);
 }
});

test('arbitrary metadata is reduced to allowlisted categories, local IDs and valid numeric values',()=>{
 const secret='UNTRUSTED_ARBITRARY_SECRET',req=request({method:secret,url:'https://'+secret+'.invalid/'+secret+'?resource='+secret+'&key='+secret}),reply=response(req,()=>assert.fail('no body read'),{status:secret});let ticks=0;const trace=qa.qaJsonResponseLifecycle({now:()=>ticks++===0?0:secret,documentUrl:'https://secret.invalid/'+secret+'#'+secret});trace.request(req);trace.response(secret,reply,{name:secret,message:secret,cause:secret});trace.requestFailed(req);trace.navigation('https://secret.invalid/'+secret+'#'+secret);trace.stop();const saved=trace.snapshot({kind:secret,command:secret}),bytes=JSON.stringify(saved);assert.equal(bytes.includes(secret),false);assert.equal(bytes.includes('https://'),false);assert.ok(saved.events.every(row=>row.elapsedMs===null));assert.ok(saved.events.filter(row=>row.request).every(row=>row.request.method==='OTHER'&&row.request.endpoint==='other'&&row.request.resource==='other'&&row.request.keyId===null));assert.equal(saved.events.find(row=>row.response).response.status,null);
 const eventKeys=new Set(['sequence','elapsedMs','mainFrameNavigationEpoch','event','request','response','failureCode','document']);for(const row of saved.events)assert.ok(Object.keys(row).every(k=>eventKeys.has(k)));assert.equal(reply.reads(),0);
});

test('error name, code, cause and stack accessors are never copied or evaluated by diagnostic persistence',()=>{
 const secret='POISONED_ERROR_PROPERTY',error=Error('not a recognized protocol signature'),reads={name:0,code:0,cause:0,stack:0};for(const key of Object.keys(reads))Object.defineProperty(error,key,{configurable:true,get(){reads[key]++;return secret;}});for(const key of Object.keys(reads))reads[key]=0;const trace=lifecycle();trace.failure(error);trace.stop();const bytes=JSON.stringify(trace.snapshot());assert.deepEqual(reads,{name:0,code:0,cause:0,stack:0});assert.equal(bytes.includes(secret),false);
});

test('host keeps exact traffic controls, removes all listeners and persists only the validated snapshot',()=>{
 const source=fs.readFileSync(new URL('../scripts/lib/noelia-payroll-circuit-browser.mjs',import.meta.url),'utf8'),start=source.indexOf('  async function observeNativeCommand('),end=source.indexOf('  async function nativePayrollCommand(',start),segment=source.slice(start,end);assert.ok(start>=0&&end>start);assert.match(source,/JSON\.stringify\(\{errors,diagnostics,responseLifecycles,writes:/);assert.match(segment,/assert\.equal\(posts\.length,1,'QA_NATIVE_UI_ONE_COMMAND_POST'\)/);assert.match(segment,/assert\.equal\(gets\.length,1,'QA_NATIVE_UI_ONE_RECOVERY_GET'\)/);assert.match(segment,/const recoveredEnvelope=await responseBodies\.get\(recoveredResponse\)/);assert.match(segment,/catch\(error\)\{lifecycle\.failure\(error\);throw error;\}/);
 for(const [event,handler]of [['request','onRequest'],['response','onResponse'],['requestfinished','onFinished'],['requestfailed','onFailed'],['framenavigated','onNavigation'],['close','onClosed']]){assert.ok(segment.includes(`page.on('${event}',${handler})`));assert.ok(segment.includes(`page.off('${event}',${handler})`));}
 assert.match(segment,/frame===page\.mainFrame\(\)/);assert.match(segment,/responseLifecycles\.push\(lifecycle\.snapshot\(\{kind,command:body\.command\?\?'calculate'\}\)\)/);assert.doesNotMatch(segment,/response\.body\(|request\.fetch\(|page\.reload\(|retry|fallback/);assert.doesNotMatch(segment,/responseLifecycles\.push\(\{kind/);
});
