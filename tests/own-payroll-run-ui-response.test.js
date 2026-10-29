import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EventEmitter} from 'node:events';
import {qaPostJsonResponseWaiter} from '../scripts/lib/qa-post-json-response-waiter.mjs';
const source=fs.readFileSync(new URL('../scripts/verify-own-payroll-run-ui.mjs',import.meta.url),'utf8');
const start=source.indexOf('const failedWait='),end=source.indexOf('const failed=structuredClone(writes.at(-1))',start);
assert.ok(start>=0&&end>start);assert.equal(source.indexOf('const failedWait=',start+1),-1);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const execute=new AsyncFunction('reviewPage','rs','idle','qaPostJsonResponseWaiter','origin',source.slice(start,end)+'\nreturn {status:failedResponse.status(),body:failedBody};');
const origin='http://synthetic.invalid',endpoint=origin+'/api/internal-own-payroll-run';
function scenario(options={}){
 const page=new EventEmitter(),stats={clicks:0,reads:0,idles:0,bodyBeforeNavigation:false},body={ok:false,code:'OWN_RUN_SOURCE_AMBIGUOUS'};let alive=true;
 const gone=Object.assign(new Error('Body discarded by document navigation'),{code:'SYNTHETIC_BODY_GONE'});
 const response={status:()=>options.status??422,url:()=>endpoint,request:()=>({method:()=> 'POST'}),json:()=>{stats.reads++;stats.bodyBeforeNavigation=alive;if(!alive)return Promise.reject(gone);if(Object.hasOwn(options,'jsonError'))return Promise.reject(options.jsonError);const captured=structuredClone(body);return Promise.resolve().then(()=>captured);}};
 page.waitForResponse=predicate=>new Promise(resolve=>page.once('response',r=>{assert.equal(predicate(r),true);resolve(r);}));
 const rs=key=>{assert.equal(key,'send');return {click:async()=>{stats.clicks++;if(options.clickError)throw options.clickError;page.emit('response',response);alive=false;}};};
 const idle=async()=>{stats.idles++;};
 return {page,response,body,gone,stats,rs,idle,run:()=>execute(page,rs,idle,qaPostJsonResponseWaiter,origin)};
}
const clean=page=>{for(const name of ['response','close','crash'])assert.equal(page.listenerCount(name),0,name);};
test('event-body capture fixes the exact microtask race in the previous verifier',async()=>{
 const old=scenario(),pending=old.page.waitForResponse(()=>true).then(async response=>({response,body:await response.json()})).then(value=>({value}),error=>({error}));
 await old.rs('send').click();assert.equal((await pending).error,old.gone);assert.equal(old.stats.reads,1);
 const next=scenario();assert.deepEqual(await next.run(),{status:422,body:next.body});assert.equal(next.stats.bodyBeforeNavigation,true);assert.deepEqual({...next.stats},{clicks:1,reads:1,idles:1,bodyBeforeNavigation:true});clean(next.page);
});
test('actual verifier keeps the real HTTP status rather than replacing it with the expected status',async()=>{const f=scenario({status:500});assert.deepEqual(await f.run(),{status:500,body:f.body});clean(f.page);});
for(const jsonError of [new Error('synthetic JSON failure'),undefined,null,0,''])test('actual verifier preserves original JSON rejection: '+String(jsonError),async()=>{
 const f=scenario({jsonError}),marker={};let caught=marker;try{await f.run();}catch(e){caught=e;}assert.equal(caught,jsonError);assert.equal(f.stats.clicks,1);assert.equal(f.stats.reads,1);assert.equal(f.stats.idles,0);clean(f.page);
});
test('failed click cleans up the observer and preserves the click failure',async()=>{const clickError=Error('synthetic click failed'),f=scenario({clickError});await assert.rejects(f.run(),e=>e===clickError);assert.equal(f.stats.reads,0);clean(f.page);});
test('unrelated responses and GETs are ignored, and only the first matching POST is consumed',async()=>{
 const f=scenario(),wait=qaPostJsonResponseWaiter(f.page,r=>r.url()===endpoint),other={...f.response,url:()=>origin+'/api/other'},get={...f.response,request:()=>({method:()=> 'GET'})};f.page.emit('response',other);f.page.emit('response',get);assert.equal(f.stats.reads,0);f.page.emit('response',f.response);f.page.emit('response',f.response);assert.deepEqual((await wait.result).body,f.body);assert.equal(f.stats.reads,1);clean(f.page);wait.cancel();
});
for(const event of ['close','crash'])test('page '+event+' rejects and removes all listeners',async()=>{const f=scenario(),wait=qaPostJsonResponseWaiter(f.page,()=>true);f.page.emit(event);await assert.rejects(wait.result,{code:event==='close'?'QA_RESPONSE_PAGE_CLOSED':'QA_RESPONSE_PAGE_CRASHED'});clean(f.page);});
for(const afterHeaders of [false,true])test('deadline includes '+(afterHeaders?'the unresolved body':'the absent response'),async()=>{
 const f=scenario(),wait=qaPostJsonResponseWaiter(f.page,()=>true,{timeoutMs:10});if(afterHeaders)f.page.emit('response',{...f.response,json:()=>{f.stats.reads++;return new Promise(()=>{});}});await assert.rejects(wait.result,{code:'QA_RESPONSE_BODY_TIMEOUT'});clean(f.page);f.page.emit('response',f.response);assert.equal(f.stats.reads,afterHeaders?1:0);
});
test('explicit cancellation is terminal and has no later response consumption',async()=>{const f=scenario(),wait=qaPostJsonResponseWaiter(f.page,()=>true);wait.cancel();wait.cancel();await assert.rejects(wait.result,{code:'QA_RESPONSE_OBSERVER_CANCELLED'});f.page.emit('response',f.response);assert.equal(f.stats.reads,0);clean(f.page);});
for(const step of ['predicate','json'])test('synchronous '+step+' failure propagates unchanged and cleans up',async()=>{const f=scenario(),error=Error('synthetic sync failure'),wait=qaPostJsonResponseWaiter(f.page,()=>{if(step==='predicate')throw error;return true;});f.page.emit('response',{...f.response,json:()=>{throw error;}});await assert.rejects(wait.result,e=>e===error);clean(f.page);});
test('invalid deadlines are rejected before registering any listener',()=>{const f=scenario();for(const timeoutMs of [0,-1,1.5,NaN,Infinity,120001,'30'])assert.throws(()=>qaPostJsonResponseWaiter(f.page,()=>true,{timeoutMs}),/QA_RESPONSE_OBSERVER_ARGUMENT/);clean(f.page);});
