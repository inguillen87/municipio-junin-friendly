import test from 'node:test';
import assert from 'node:assert/strict';
import {readPayrollBatch,PAYROLL_BATCH_READ_POLICY} from '../assets/payroll-document-batch-panel.js';
import {collectPayrollDocuments,collectionErrorMessage} from '../assets/payroll-document-collection.js';
import {collectionFixture} from './fixtures/payroll-collection-synthetic.js';

const url='/api/internal-data?resource=employeepayrolldetail&contractId=11111111-1111-4111-8111-111111111111&date=2026-09-30&type=M&period=2026&month=9';
const requestId='22222222-2222-4222-8222-222222222222';
const busy={ok:false,code:'ACTION_SESSION_BUSY',retryable:true,requestId,error:'PRIVATE_SQL_MUST_NOT_BE_EXPOSED'};
const response=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store, max-age=0',...headers}});
async function withFetch(fetchImpl,run){const original=globalThis.fetch;globalThis.fetch=fetchImpl;try{return await run();}finally{globalThis.fetch=original;}}

test('session contention retries only the exact GET and keeps one signal, headers and complete response',async()=>{
 const calls=[],expected={ok:true,data:{synthetic:true,amount:'123.45'}};
 await withFetch(async(...args)=>{calls.push(args);return response(calls.length<3?busy:expected,calls.length<3?409:200);},async()=>{
  const parent=new AbortController(),actual=await readPayrollBatch(url,{signal:parent.signal});
  assert.deepEqual(actual,expected);assert.equal(calls.length,3);
  for(const [target,options]of calls){assert.equal(target,url);assert.equal(options,calls[0][1]);assert.equal(options.method,'GET');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.deepEqual(options.headers,{Accept:'application/json'});assert.equal(Object.hasOwn(options,'body'),false);assert.equal(options.signal,calls[0][1].signal);assert.notEqual(options.signal,parent.signal);}
 });
 assert.deepEqual(PAYROLL_BATCH_READ_POLICY,{deadlineMs:25000,retryDelaysMs:[150,450,900]});assert.ok(Object.isFrozen(PAYROLL_BATCH_READ_POLICY.retryDelaysMs));
});

test('persistent contention stops at four GETs and retains only safe actionable diagnostics',async()=>{
 let calls=0;
 await withFetch(async()=>{calls++;return response(busy,409);},async()=>{
  await assert.rejects(readPayrollBatch(url),error=>{
   assert.equal(error.status,409);assert.equal(error.code,'ACTION_SESSION_BUSY');assert.equal(error.retryable,true);assert.equal(error.requestId,requestId);assert.doesNotMatch(error.message,/PRIVATE|SQL/);assert.match(collectionErrorMessage(error),/ocupada.*no se descargaron/);return true;
  });
 });assert.equal(calls,4);
});

test('a mutable URL cannot replace the original selection while a GET is being retried',async()=>{
 const selection=new URL(url,'https://qa.invalid'),original=selection.href,calls=[];
 await withFetch(async(target)=>{calls.push(target);selection.searchParams.set('month','10');return response(calls.length===1?busy:{ok:true,data:{complete:true}},calls.length===1?409:200);},async()=>{
  assert.deepEqual(await readPayrollBatch(selection),{ok:true,data:{complete:true}});
 });assert.deepEqual(calls,[original,original]);
});

test('cancelling during backoff prevents the next GET and preserves the original cancellation',async()=>{
 const controller=new AbortController(),reason=new DOMException('Selection retired','AbortError');let calls=0,timer;
 await withFetch(async()=>{calls++;timer=setTimeout(()=>controller.abort(reason),20);return response(busy,409);},async()=>{
  await assert.rejects(readPayrollBatch(url,{signal:controller.signal}),error=>error===reason);
 });clearTimeout(timer);assert.equal(calls,1);
});

test('the caller deadline includes retry waits and is never reset for a new attempt',async()=>{
 let calls=0;
 await withFetch(async()=>{calls++;return response(busy,409);},async()=>{
  await assert.rejects(readPayrollBatch(url,{signal:AbortSignal.timeout(30)}),{name:'TimeoutError'});
 });assert.equal(calls,1);
});

for(const [label,status,patch]of [
 ['401 even with a misleading busy body',401,{}],['403 even with a misleading busy body',403,{}],
 ['source drift',409,{code:'PAYROLL_BATCH_SELECTION_CHANGED'}],['page drift',409,{code:'PAYROLL_BATCH_PAGE_CHANGED'}],
 ['effective source drift',503,{code:'GRH_SOURCE_CHANGED'}],['service unavailable',503,{}],['rate limit',429,{}],
 ['missing retry permission',409,{retryable:undefined}],['explicit nonretryable conflict',409,{retryable:false}],
 ['unrecognized code',409,{code:'OTHER_BUSY'}],['unsafe code',409,{code:'PRIVATE sql://host'}],
])test(label+' is not retried',async()=>{
 let calls=0;
 await withFetch(async()=>{calls++;return response({...busy,...patch},status);},async()=>{
  await assert.rejects(readPayrollBatch(url),error=>{assert.equal(error.status,status);assert.doesNotMatch(error.message,/PRIVATE|SQL|host/);return true;});
 });assert.equal(calls,1);
});

test('malformed, oversized and unverified error bodies cannot authorize retries',async()=>{
 for(const make of [()=>new Response('not-json',{status:409,headers:{'content-type':'application/json','cache-control':'no-store'}}),()=>response({...busy,padding:'x'.repeat(8192)},409),()=>response(busy,409,{'cache-control':'private'}),()=>response({...busy,ok:true},409)]){
  let calls=0;await withFetch(async()=>{calls++;return make();},async()=>{await assert.rejects(readPayrollBatch(url),{status:409});});assert.equal(calls,1);
 }
});

test('network errors and unconfirmed success are not replayed',async()=>{
 for(const make of [()=>{throw Error('synthetic transport unavailable');},()=>response({ok:false},200)]){
  let calls=0;await withFetch(async()=>{calls++;return make();},async()=>{await assert.rejects(readPayrollBatch(url));});assert.equal(calls,1);
 }
});

test('a busy detail can recover without truncating the collection or relaxing its final reread',async()=>{
 const fixture=collectionFixture(3),preview=await fixture.preview(),attempts=new Map();
 await withFetch(async(target,options)=>{
  const count=(attempts.get(target)??0)+1;attempts.set(target,count);
  if(new URL(target,'https://qa.invalid').searchParams.get('resource')==='employeepayrolldetail'&&count===1)return response(busy,409);
  return response(await fixture.request(target,options));
 },async()=>{
  const collection=await collectPayrollDocuments({preview,request:readPayrollBatch,signal:new AbortController().signal});
  assert.equal(collection.models.length,3);assert.equal(collection.concepts,33);assert.equal(collection.officialReceipt,false);assert.equal(collection.signatureApplied,false);assert.equal(collection.paymentDate,null);
 });
 assert.equal(fixture.perPerson.size,3);assert.ok([...fixture.perPerson.values()].every(count=>count===2));
 assert.equal([...attempts.entries()].filter(([target])=>target.includes('resource=employeepayrolldetail')).length,3);
});

test('contention exhaustion rejects the whole collection and produces no partial models',async()=>{
 const fixture=collectionFixture(3),preview=await fixture.preview();let busyCalls=0,returned=false;
 await withFetch(async(target,options)=>{
  if(target.includes('resource=employeepayrolldetail')){busyCalls++;return response(busy,409);}
  return response(await fixture.request(target,options));
 },async()=>{
  await assert.rejects(collectPayrollDocuments({preview,request:readPayrollBatch,signal:new AbortController().signal}).then(value=>{returned=true;return value;}),{status:409,code:'ACTION_SESSION_BUSY'});
 });assert.equal(returned,false);assert.equal(fixture.perPerson.size,0);assert.ok(busyCalls>=4&&busyCalls<=12);
});

test('busy and source-change guidance is safe and keeps the complete-package requirement',()=>{
 for(const error of [{status:409,code:'ACTION_SESSION_BUSY'},...['PAYROLL_BATCH_SELECTION_CHANGED','PAYROLL_BATCH_PAGE_CHANGED','GRH_SOURCE_CHANGED'].map(code=>({code}))]){
  const message=collectionErrorMessage({...error,message:'PRIVATE_SQL',error:'PRIVATE_DATA'});assert.match(message,/parciales/);assert.doesNotMatch(message,/PRIVATE|SQL/);
 }
});
