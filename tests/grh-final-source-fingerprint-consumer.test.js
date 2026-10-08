import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {bindFinalSourceConsumersWithinTransaction as bind} from '../scripts/lib/grh-final-source-consumers.mjs';
import {SUCCESSOR_ENTITIES} from '../scripts/lib/grh-successor-package.mjs';
import {finalConsumerFixture} from './fixtures/final-source-consumer-synthetic.js';
const sql='/* final-consumer:fingerprint */ SELECT public.grh_final_source_fingerprint_v1($1::uuid,$2::text,false) AS fingerprint';
const md5=v=>createHash('md5').update(v).digest('hex');
function fixture(edit){const f=finalConsumerFixture(),query=f.client.query;f.client.query=async(text,values)=>{
 if(text!==sql)return query(text,values);f.calls.push({text,values});
 const data=f.data[values[1]],fingerprint={rows:data.length,md5:md5(data.map(r=>md5(r.row_key+r.record_json)).join(''))};
 const result={rows:[{fingerprint}]};await edit?.(result,f,values[1]);return result;
};return f;}
test('server fingerprint verifies every complete set including empty and multiple pages without nominal transport',async()=>{
 const f=fixture(),r=await bind(f.input);for(const e of SUCCESSOR_ENTITIES)await r.verifyEntity(e);
 const receipt=await r.assertComplete();assert.equal(receipt.entities,10);assert.equal(receipt.complete,true);
 assert.equal(receipt.counts['core/payrollMonthly'],1105);assert.equal(receipt.counts['curated/grh_leaves'],0);
 assert.equal(f.calls.filter(c=>c.text===sql).length,10);assert.equal(f.calls.filter(c=>/^DECLARE|^FETCH|^CLOSE/.test(c.text)).length,0);
 assert.doesNotMatch(JSON.stringify(receipt),/9007199254740993|record_json|missing|zero/);
});
test('streamed rows and server verified sets produce the same complete receipt',async()=>{
 const f=fixture(),r=await bind(f.input);for(const e of SUCCESSOR_ENTITIES){if(e==='curated/grh_employees')for await(const row of r.readRows(e))assert.match(row.recordJson,/9007199254740993\.0000001/);else await r.verifyEntity(e);}
 assert.deepEqual((await r.assertComplete()).counts,Object.fromEntries(Object.entries(f.data).map(([e,rows])=>[e,rows.length])));
});
for(const mode of ['count','digest','unsafe-count','negative-count','extra-key','wrong-type','missing-row','extra-row','null-row'])test('incomplete or malformed server proof never completes a set: '+mode,async()=>{
 const f=fixture(result=>{const v=result.rows[0].fingerprint;
  if(mode==='count')v.rows++;if(mode==='digest')v.md5='0'.repeat(32);if(mode==='unsafe-count')v.rows=Number.MAX_SAFE_INTEGER+1;
  if(mode==='negative-count')v.rows=-1;if(mode==='extra-key')v.private='PRIVATE';if(mode==='wrong-type')v.rows=String(v.rows);
  if(mode==='missing-row')result.rows=[];if(mode==='extra-row')result.rows.push(result.rows[0]);
  if(mode==='null-row')result.rows[0]=null;
 });const r=await bind(f.input);await assert.rejects(r.verifyEntity('core/payrollMonthly'),{code:'GRH_FINAL_CONSUMER_FINGERPRINT'});
 await assert.rejects(r.assertComplete(),{code:'GRH_FINAL_CONSUMER_INCOMPLETE'});
});
test('content changed with the same number of rows fails against the sealed digest',async()=>{
 const f=fixture(),r=await bind(f.input);f.data['core/payrollMonthly'][0].record_json='{"changed": true}';
 await assert.rejects(r.verifyEntity('core/payrollMonthly'),{code:'GRH_FINAL_CONSUMER_FINGERPRINT'});
});
test('an in-flight server verification excludes both another verification and a row stream',async()=>{
 let finish,entered;const waiting=new Promise(resolve=>finish=resolve),started=new Promise(resolve=>entered=resolve);
 const f=fixture(async()=>{entered();await waiting}),r=await bind(f.input),work=r.verifyEntity('core/payrollMonthly');
 await started;await assert.rejects(r.verifyEntity('curated/grh_employees'),{code:'GRH_FINAL_CONSUMER_READ_ACTIVE'});
 await assert.rejects(r.readRows('curated/grh_employees').next(),{code:'GRH_FINAL_CONSUMER_READ_ACTIVE'});finish();await work;
});
test('revocation during server verification invalidates completion',async()=>{
 const f=fixture((_,f)=>f.context.verified=false),r=await bind(f.input);
 await assert.rejects(r.verifyEntity('core/payrollMonthly'),{code:'GRH_FINAL_CONSUMER_CONTEXT'});
});
test('failure after a previous successful verification removes that completion',async()=>{
 let fail=false;const f=fixture(()=>{if(fail)throw Error('synthetic query failure')}),r=await bind(f.input);
 for(const e of SUCCESSOR_ENTITIES)await r.verifyEntity(e);assert.equal((await r.assertComplete()).complete,true);
 fail=true;await assert.rejects(r.verifyEntity('core/payrollMonthly'),/synthetic query failure/);
 await assert.rejects(r.assertComplete(),{code:'GRH_FINAL_CONSUMER_INCOMPLETE'});
});
test('server verification excludes external filters and simultaneous open row streams',async()=>{
 const f=fixture(),r=await bind(f.input);
 for(const args of [['unknown'],['core/payrollMonthly',{limit:1}],['core/payrollMonthly',undefined]])await assert.rejects(r.verifyEntity(...args),{code:'GRH_FINAL_CONSUMER_ARGUMENT'});
 const iterator=r.readRows('curated/grh_employees');await iterator.next();
 await assert.rejects(r.verifyEntity('core/payrollMonthly'),{code:'GRH_FINAL_CONSUMER_READ_ACTIVE'});await iterator.return();assert.equal(f.cursors.size,0);
});
test('cancellation after server fingerprint cannot emit a complete receipt',async()=>{
 const abort=new AbortController(),f=fixture(()=>abort.abort()),r=await bind({...f.input,signal:abort.signal});
 await assert.rejects(r.verifyEntity('core/payrollMonthly'),{name:'AbortError'});
});
