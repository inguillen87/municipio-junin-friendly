import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {monthlyNativeSafeRead} from '../scripts/lib/monthly-native-safe-read.mjs';

const reset=()=>new TypeError('fetch failed',{cause:Object.assign(new Error('read ECONNRESET'),{errno:-104,code:'ECONNRESET',syscall:'read'})});

test('one causal reset retries the exact GET once, then uses real loopback HTTP',async()=>{
 const received=[],server=http.createServer((req,res)=>{received.push({method:req.method,url:req.url,marker:req.headers['x-synthetic-read']});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({complete:true,synthetic:true}));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const url=new URL('/api/synthetic-read?resource=bootstrap','http://127.0.0.1:'+server.address().port),options=Object.freeze({method:'GET',headers:Object.freeze({'x-synthetic-read':'same-options'})}),first=reset(),calls=[],events=[];
  const injected=async(u,o)=>{calls.push({url:u,options:o});if(calls.length===1)throw first;return fetch(u,o);};
  const response=await monthlyNativeSafeRead(injected,url,options,event=>events.push(event));
  assert.deepEqual(await response.json(),{complete:true,synthetic:true});assert.equal(calls.length,2);for(const call of calls){assert.equal(call.url,url);assert.equal(call.options,options);}assert.deepEqual(received,[{method:'GET',url:'/api/synthetic-read?resource=bootstrap',marker:'same-options'}]);assert.equal(events.length,1);assert.equal(events[0].firstError,first);assert.equal(events[0].attempt,2);assert.equal(events[0].causeCode,'ECONNRESET');assert.equal(events[0].retryFailed,false);assert.equal(events[0].retryError,null);
 }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test('a successful first GET returns the original Response without retry',async()=>{
 const response=new Response('{"synthetic":true}',{status:200}),url=new URL('http://127.0.0.1/synthetic'),options={method:'GET'};let calls=0,events=0;
 const actual=await monthlyNativeSafeRead(async(u,o)=>{calls++;assert.equal(u,url);assert.equal(o,options);return response;},url,options,()=>events++);
 assert.equal(actual,response);assert.equal(calls,1);assert.equal(events,0);
});

test('a second reset stops at two attempts and preserves both original errors',async()=>{
 const first=reset(),second=reset(),events=[];let calls=0;
 await assert.rejects(()=>monthlyNativeSafeRead(async()=>{throw ++calls===1?first:second;},new URL('http://127.0.0.1/synthetic'),{method:'GET'},event=>events.push(event)),error=>error instanceof AggregateError&&error.cause===first&&error.errors.length===2&&error.errors[0]===first&&error.errors[1]===second);
 assert.equal(calls,2);assert.equal(events.length,1);assert.equal(events[0].firstError,first);assert.equal(events[0].retryFailed,true);assert.equal(events[0].retryError,second);
});

test('POST, implicit or lowercase GET, GET body and other causal errors never retry',async()=>{
 for(const scenario of[
  {options:{method:'POST',body:'{"command":"synthetic"}'},error:reset()},
  {options:undefined,error:reset()},
  {options:{method:'get'},error:reset()},
  {options:{method:'GET',body:'synthetic'},error:reset()},
  {options:{method:'GET'},error:new TypeError('fetch failed',{cause:Object.assign(new Error('refused'),{code:'ECONNREFUSED'})})},
  {options:{method:'GET'},error:Object.assign(new Error('not a causal reset'),{code:'ECONNRESET'})}
 ]){let calls=0,events=0;await assert.rejects(()=>monthlyNativeSafeRead(async()=>{calls++;throw scenario.error;},new URL('http://127.0.0.1/synthetic'),scenario.options,()=>events++),error=>error===scenario.error);assert.equal(calls,1);assert.equal(events,0);}
});

test('HTTP 4xx/5xx and JSON decoding errors are outside fetch retry',async()=>{
 for(const status of[400,403,409,422,500,503]){let calls=0,events=0;const expected=new Response('{"ok":false}',{status}),actual=await monthlyNativeSafeRead(async()=>{calls++;return expected;},new URL('http://127.0.0.1/synthetic'),{method:'GET'},()=>events++);assert.equal(actual,expected);assert.equal(actual.status,status);assert.equal(calls,1);assert.equal(events,0);}
 let calls=0,events=0;const invalid=new Response('invalid-json',{status:200});await assert.rejects(async()=>{const response=await monthlyNativeSafeRead(async()=>{calls++;return invalid;},new URL('http://127.0.0.1/synthetic'),{method:'GET'},()=>events++);await response.json();},SyntaxError);assert.equal(calls,1);assert.equal(events,0);
});

test('abort errors or an already-aborted signal never retry even with reset cause',async()=>{
 for(const name of['AbortError','TimeoutError']){const original=reset();original.name=name;let calls=0;await assert.rejects(()=>monthlyNativeSafeRead(async()=>{calls++;throw original;},new URL('http://127.0.0.1/synthetic'),{method:'GET'}),error=>error===original);assert.equal(calls,1);}
 const controller=new AbortController();let calls=0;const original=reset();await assert.rejects(()=>monthlyNativeSafeRead(async()=>{calls++;controller.abort();throw original;},new URL('http://127.0.0.1/synthetic'),{method:'GET',signal:controller.signal}),error=>error===original);assert.equal(calls,1);
});

test('recording failure retains the first reset and any second-attempt failure',async()=>{
 for(const failSecond of[false,true]){const first=reset(),second=new Error('synthetic second failure'),recordFailure=new Error('synthetic proof unavailable');let calls=0;await assert.rejects(()=>monthlyNativeSafeRead(async()=>{calls++;if(calls===1)throw first;if(failSecond)throw second;return new Response('{}');},new URL('http://127.0.0.1/synthetic'),{method:'GET'},()=>{throw recordFailure;}),error=>{assert.ok(error instanceof AggregateError);assert.equal(error.cause,first);assert.deepEqual(error.errors,[first,...(failSecond?[second]:[]),recordFailure]);return true;});assert.equal(calls,2);}
});
