// Service transport contract only: injected callbacks, no SQL execution or atomicity claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ownAnnulOperation} from '../lib/internal-own-payroll-annulment.js';
import {annulReviewScenario} from './fixtures/own-payroll-annulment-review-synthetic.js';
const principal={user:{email:'annul-v2-synthetic@example.invalid'},tenant:{source:'membership',id:'a2000000-0000-4000-8000-000000000001',membershipId:'a2000000-0000-4000-8000-000000000002'}};
const session={email:principal.user.email,id:'a2000000-0000-4000-8000-000000000003',version:1,releaseSha:'d'.repeat(40)};
function callback(value){const calls=[];return{calls,sql:{query:async(q,values)=>{calls.push({q,values});return[{result:structuredClone(value)}];}}};}
for(const fullJson of [false,true]){
 const suffix=fullJson?'full32':'normal4';
 test('annul v2 '+suffix+' reads one exhaustive index without embedded captures',async()=>{
  const {index}=annulReviewScenario(),c=callback(index);
  const value=await ownAnnulOperation(c.sql,principal,session,'review',{period:index.period,liquidationType:index.liquidationType},{fullJson});
  assert.deepEqual(value,index);assert.equal(c.calls.length,1);
  assert.equal(c.calls[0].q,fullJson?'SELECT public.own_annul_review_full_v2($1::jsonb,$2::text,$3::text) AS result':'SELECT public.own_annul_review_v2($1::jsonb,$2::text,$3::text) AS result');
  assert.deepEqual(c.calls[0].values.slice(1),[index.period,index.liquidationType]);
  const ctx=JSON.parse(c.calls[0].values[0]);assert.equal(ctx.membershipId,principal.tenant.membershipId);assert.equal(ctx.actorSessionId,session.id);
  assert.equal(Object.hasOwn(value,'runs'),false);assert.ok(value.index.length>value.index.filter(r=>r.states.confirmed>0).length);
 });
 test('annul v2 '+suffix+' sends the exact reviewed body once and preserves explicit v2 receipt',async()=>{
  const {receipt}=annulReviewScenario(),c=callback(receipt);
  const value=await ownAnnulOperation(c.sql,principal,session,'command-v2',{key:receipt.key,body:receipt.body},{fullJson});
  assert.deepEqual(value,receipt);assert.equal(value.version,'own-annul-receipt.v2');assert.equal(c.calls.length,1);
  assert.equal(c.calls[0].q,fullJson?'SELECT public.own_annul_command_full_v2($1::jsonb,$2::jsonb,$3::uuid) AS result':'SELECT public.own_annul_command_v2($1::jsonb,$2::jsonb,$3::uuid) AS result');
  assert.deepEqual(JSON.parse(c.calls[0].values[1]),receipt.body);assert.equal(c.calls[0].values[2],receipt.key);
 });
 test('annul v2 '+suffix+' recovers original ledger receipt without requiring a fresh index',async()=>{
  const {receipt}=annulReviewScenario();receipt.replayed=true;const c=callback(receipt);
  const value=await ownAnnulOperation(c.sql,principal,session,'attempt',{key:receipt.key},{fullJson});
  assert.deepEqual(value,receipt);assert.equal(c.calls.length,1);assert.match(c.calls[0].q,fullJson?/own_annul_attempt_full_v1/:/own_annul_attempt_v1/);assert.deepEqual(c.calls[0].values.slice(1),[receipt.key]);
 });
 test('annul v2 '+suffix+' refuses implicit review before sending a command',async()=>{
  const {receipt}=annulReviewScenario(),c=callback(receipt);
  await assert.rejects(ownAnnulOperation(c.sql,principal,session,'command-v2',{key:receipt.key,body:{...receipt.body,reviewConfirmed:false}},{fullJson}),e=>e.code==='OWN_LIQ_INPUT_INVALID'&&e.status===422);assert.equal(c.calls.length,0);
 });
}
for(const [name,mutate]of[['wrong period',v=>{}],['changed global hash',v=>{v.stateVersion='0'.repeat(64);}]] )test('annul v2 rejects '+name+' without a second callback or fallback',async()=>{
 const {index}=annulReviewScenario();mutate(index);const c=callback(index);
 await assert.rejects(ownAnnulOperation(c.sql,principal,session,'review',{period:name==='wrong period'?'2026-11':index.period,liquidationType:index.liquidationType},{fullJson:true}),e=>e.status===503);assert.equal(c.calls.length,1);
});
test('annul v2 refuses a receipt for another key and keeps the original retry key',async()=>{
 const {receipt}=annulReviewScenario(),key=receipt.key;receipt.key='a2000000-0000-4000-8000-000000000099';const c=callback(receipt);
 await assert.rejects(ownAnnulOperation(c.sql,principal,session,'command-v2',{key,body:receipt.body},{fullJson:true}),e=>e.code==='OWN_LIQ_CONTRACT_INVALID'&&e.status===503);assert.equal(c.calls.length,1);assert.equal(c.calls[0].values[2],key);
});
test('annul v2 keeps state-change rejection from its single atomic RPC',async()=>{
 const {receipt}=annulReviewScenario();let calls=0;
 await assert.rejects(ownAnnulOperation({query:async()=>{calls++;throw Error('OWN_LIQ_STATE_CHANGED');}},principal,session,'command-v2',{key:receipt.key,body:receipt.body},{fullJson:true}),e=>e.code==='OWN_LIQ_STATE_CHANGED'&&e.status===409);assert.equal(calls,1);
});

for(const fullJson of [false,true])test('annul v2 dispatcher preserves a legacy v1 ledger receipt as v1',async()=>{
 const {legacyReceipt}=annulReviewScenario(),c=callback(legacyReceipt);const value=await ownAnnulOperation(c.sql,principal,session,'attempt',{key:legacyReceipt.key},{fullJson});assert.deepEqual(value,legacyReceipt);assert.equal(value.version,'own-annul-receipt.v1');assert.equal(c.calls.length,1);
});
test('command-v2 cannot accept a v1 response even when the key and affected contracts match',async()=>{
 const {receipt,legacyReceipt}=annulReviewScenario(),c=callback(legacyReceipt);await assert.rejects(ownAnnulOperation(c.sql,principal,session,'command-v2',{key:receipt.key,body:receipt.body},{fullJson:true}),e=>e.code==='OWN_LIQ_CONTRACT_INVALID'&&e.status===503);assert.equal(c.calls.length,1);
});
