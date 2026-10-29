// Causal regression of the actual browser verifier sequence; no browser, SQL or provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../scripts/verify-own-payroll-run-ui.mjs',import.meta.url),'utf8'),start=source.indexOf('const failedResponsePromise='),end=source.indexOf('const failed=structuredClone(writes.at(-1))',start);
assert.ok(start>=0&&end>start&&source.indexOf('const failedResponsePromise=',start+1)<0);
const fragment=source.slice(start,end),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const execute=new AsyncFunction('reviewPage','rs','idle',fragment+'\nreturn {status:failedResponse.status(),body:failedBody};');
function scenario(options={}){
 const {status=422,delayedHeaders=false}=options;const hasJsonError=Object.hasOwn(options,'jsonError'),jsonError=options.jsonError;
 let navigated=false,clicks=0,reads=0,idles=0,settled=false;const order=[],body={ok:false,code:'OWN_RUN_SOURCE_AMBIGUOUS'};
 const gone=Object.assign(new Error('Response body is not available after navigation'),{code:'SYNTHETIC_BODY_GONE'});
 const response={status:()=>status,request:()=>({method:()=> 'POST'}),url:()=> 'http://synthetic.invalid/api/internal-own-payroll-run',json:async()=>{
  reads++;order.push('body-start');if(navigated)throw gone;if(hasJsonError)throw jsonError;await Promise.resolve();order.push('body-ready');return body;
 }};
 const page={waitForResponse:predicate=>{assert.equal(predicate(response),true);order.push('wait-registered');return delayedHeaders?new Promise(resolve=>setImmediate(()=>resolve(response))):Promise.resolve(response);}};
 const rs=key=>{assert.equal(key,'send');return {click:async()=>{clicks++;order.push('click-start');await Promise.resolve();navigated=true;order.push('navigation');settled=true;}};};
 const idle=async()=>{idles++;order.push('idle');};
 return {run:()=>execute(page,rs,idle),body,gone,stats:()=>({clicks,reads,idles,settled,order})};
}
test('real verifier sequence starts JSON consumption before click navigation can discard its body',async()=>{
 const f=scenario();assert.deepEqual(await f.run(),{status:422,body:f.body});const s=f.stats();assert.equal(s.clicks,1);assert.equal(s.reads,1);assert.equal(s.idles,1);assert.ok(s.order.indexOf('body-start')<s.order.indexOf('navigation'));
});
test('JSON failure propagates unchanged after the click settles; no retry or manufactured body',async()=>{
 const failure=Object.assign(new Error('synthetic incomplete JSON'),{code:'SYNTHETIC_JSON_FAILURE'}),f=scenario({jsonError:failure});await assert.rejects(f.run(),error=>error===failure);const s=f.stats();assert.equal(s.settled,true);assert.equal(s.clicks,1);assert.equal(s.reads,1);assert.equal(s.idles,0);
});
test('nonexpected HTTP status is preserved for the original outer assertion',async()=>{
 const f=scenario({status:500});assert.deepEqual(await f.run(),{status:500,body:f.body});assert.equal(f.stats().clicks,1);assert.equal(f.stats().reads,1);
});
test('a body already lost before headers arrive still stops, without substituting SQL or fixture content',async()=>{
 const f=scenario({delayedHeaders:true});await assert.rejects(f.run(),error=>error===f.gone);assert.equal(f.stats().clicks,1);assert.equal(f.stats().reads,1);assert.equal(f.stats().idles,0);
});
for(const rejection of [undefined,null,0,''])test('falsy JSON rejection is preserved exactly: '+String(rejection),async()=>{
 const marker={},f=scenario({jsonError:rejection});let caught=marker;try{await f.run();}catch(error){caught=error;}
 assert.equal(caught,rejection);assert.equal(f.stats().clicks,1);assert.equal(f.stats().reads,1);assert.equal(f.stats().idles,0);
});
