import test from 'node:test';import assert from 'node:assert/strict';
import {createFirmarHttpClient} from '../assets/firmar-http-client.js';
import {createFirmarReturn} from '../assets/firmar-return.js';
const requestId='11111111-1111-4111-8111-111111111111',attemptId='22222222-2222-4222-8222-222222222222';
test('persisted contention reaches return controller intact; same token reused for lookup only',async()=>{
 const seen=[],states=[];let calls=0;const client=createFirmarHttpClient({fetchImpl:async(url,options)=>{
  seen.push(JSON.parse(options.body).state);assert.equal(url,'/api/internal-firmar');
  if(!calls++)return new Response(JSON.stringify({ok:false,code:'FIRMAR_BUSY',error:'private SQL content'}),{status:409,headers:{'Content-Type':'application/json'}});
  return new Response(JSON.stringify({ok:true,data:{requestId,attemptId,state:'return_bound',officialEmissionEnabled:false}}),{headers:{'Content-Type':'application/json'}});
 }});
 const c=createFirmarReturn({resolveReturn:({returnState,signal})=>client.resolveReturn({state:returnState,signal}),onChange:s=>states.push(s),notifyHost:()=>{},location:{hash:'#'+'A'.repeat(43),pathname:'/firmas/retorno'},history:{replaceState(){}}});
 await c.resume();assert.equal(states.at(-1).state,'return_retry');assert.equal(states.at(-1).retryAvailable,true);
 await c.resume();assert.equal(states.at(-1).state,'return_bound');assert.deepEqual(seen,['A'.repeat(43),'A'.repeat(43)]);assert.equal(calls,2);c.dispose();
});
