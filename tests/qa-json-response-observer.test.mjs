import test from 'node:test';
import assert from 'node:assert/strict';
import {qaJsonResponseObserver} from '../scripts/lib/qa-json-response-observer.mjs';

const origin='https://qa.example.invalid',endpoint='/api/internal-own-payroll-run',key='8c5a8140-8864-4f29-a4e8-f5f659432041';
const relevant=request=>{const u=new URL(request.url());return u.origin===origin&&u.pathname===endpoint;};
const unavailable=()=>Error('response.json: Protocol error (Network.getResponseBody): No data found for resource with given identifier. Response body is not available for a response that was navigated away from.');
function response({url=origin+endpoint+'?resource=attempt&key='+key,method='GET',status=200,payload={ok:true,data:{key,amountCents:'0',quantity:null,label:'Área cátedra'}},failure=null,raw=null}={}){
 let alive=true,reads=0;const order=[],request={url:()=>url,method:()=>method,headers:()=>({'idempotency-key':key})};
 const result={request:()=>request,status:()=>status,reads:()=>reads,order,invalidate(){order.push('document-invalidated');alive=false;},json(){
  reads++;order.push('body-read-started');if(!alive)return Promise.reject(unavailable());
  // Model a CDP handle whose bytes are retained only if a read starts while live.
  // This is a pure lifecycle fixture, not Playwright or network evidence.
  const bytes=raw??JSON.stringify(payload);return Promise.resolve().then(()=>{if(failure)throw failure;return JSON.parse(bytes);});
 }};return result;
}
test('late metadata-only read reproduces lifetime RED; eager observed body stays exact after the same invalidation GREEN',async()=>{
 const prior=response(),oldResponses=[];oldResponses.push(prior);await Promise.resolve();prior.invalidate();
 await assert.rejects(()=>oldResponses[0].json(),/Network\.getResponseBody/);assert.deepEqual(prior.order,['document-invalidated','body-read-started']);assert.equal(prior.reads(),1);
 const next=response(),responses=[],bodies=new WeakMap(),observe=qaJsonResponseObserver(relevant,responses,bodies);
 observe(next);assert.equal(next.reads(),1);assert.equal(responses[0],next);const originalRequest=next.request();
 await Promise.resolve();next.invalidate();const body=await bodies.get(next);
 assert.equal(next.status(),200);assert.equal(next.request(),originalRequest);assert.equal(new URL(originalRequest.url()).searchParams.get('key'),key);
 assert.deepEqual(body,{ok:true,data:{key,amountCents:'0',quantity:null,label:'Área cátedra'}});assert.deepEqual(next.order,['body-read-started','document-invalidated']);assert.equal(next.reads(),1);
});
test('the observer retains every relevant response but starts JSON only for GET attempt',async()=>{
 const responses=[],bodies=new WeakMap(),observe=qaJsonResponseObserver(relevant,responses,bodies),matching=response(),post=response({method:'POST',url:origin+endpoint,status:503,payload:{ok:false,error:'lost acknowledgement'}}),bootstrap=response({url:origin+endpoint+'?resource=bootstrap'}),external=response({url:'https://other.invalid'+endpoint+'?resource=attempt'}),other=response({url:origin+'/api/other?resource=attempt'});
 for(const r of [post,bootstrap,external,other,matching])observe(r);
 assert.deepEqual(responses,[post,bootstrap,matching]);assert.deepEqual([post.reads(),bootstrap.reads(),external.reads(),other.reads(),matching.reads()],[0,0,0,0,1]);assert.equal(bodies.has(post),false);assert.equal(bodies.has(bootstrap),false);assert.equal(bodies.has(external),false);assert.equal(bodies.has(other),false);assert.equal((await bodies.get(matching)).data.key,key);assert.equal(post.status(),503);
});
test('a non-success GET status and error body remain unchanged instead of becoming an accepted receipt',async()=>{
 const r=response({status:503,payload:{ok:false,code:'OWN_RUN_UNAVAILABLE',error:'Consultar el mismo intento'}}),responses=[],bodies=new WeakMap();qaJsonResponseObserver(relevant,responses,bodies)(r);
 assert.equal(r.status(),503);assert.deepEqual(await bodies.get(r),{ok:false,code:'OWN_RUN_UNAVAILABLE',error:'Consultar el mismo intento'});assert.equal(r.reads(),1);
});
test('malformed JSON remains a rejected observed body with no fallback or second read',async()=>{
 const r=response({raw:'{"ok":true,'}),responses=[],bodies=new WeakMap();qaJsonResponseObserver(relevant,responses,bodies)(r);await Promise.resolve();
 await assert.rejects(()=>bodies.get(r),SyntaxError);assert.equal(r.reads(),1);assert.equal(responses[0],r);
});
test('an asynchronous body transport rejection preserves the exact error and never retries',async()=>{
 const error=unavailable(),r=response({failure:error}),responses=[],bodies=new WeakMap();qaJsonResponseObserver(relevant,responses,bodies)(r);await Promise.resolve();r.invalidate();
 await assert.rejects(()=>bodies.get(r),e=>e===error);assert.equal(r.reads(),1);assert.equal(responses[0],r);
});
