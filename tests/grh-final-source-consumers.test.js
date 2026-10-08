import test from 'node:test';import assert from 'node:assert/strict';
import {bindFinalSourceConsumersWithinTransaction,FINAL_CONSUMER_CONTEXT_SQL,FINAL_CONSUMER_ROWS_SQL} from '../scripts/lib/grh-final-source-consumers.mjs';
import {SUCCESSOR_ENTITIES} from '../scripts/lib/grh-successor-package.mjs';
import {finalConsumerFixture} from './fixtures/final-source-consumer-synthetic.js';
const consume=async(reader,e)=>{const rows=[];for await(const r of reader.readRows(e,{pageSize:2}))rows.push(r);return rows;};
test('all ten consumer sets must be exhausted, including empty sets and more than two pages',async()=>{
 const fixture=finalConsumerFixture(),reader=await bindFinalSourceConsumersWithinTransaction(fixture.input);
 await assert.rejects(reader.assertComplete(),{code:'GRH_FINAL_CONSUMER_INCOMPLETE'});
 for(const e of SUCCESSOR_ENTITIES){const rows=await consume(reader,e);assert.equal(rows.length,fixture.data[e].length);assert.ok(rows.every(r=>r.entity===e&&r.contextSha256===reader.context.contextSha256));}
 const receipt=await reader.assertComplete();assert.equal(receipt.entities,10);assert.equal(receipt.counts['core/payrollMonthly'],1105);assert.equal(receipt.counts['curated/grh_leaves'],0);
 assert.equal(receipt.sourceSelected,false);assert.equal(receipt.municipalWrites,0);assert.ok(Object.isFrozen(reader.context.fingerprints));
 assert.ok(fixture.calls.every(c=>c.text===FINAL_CONSUMER_CONTEXT_SQL||c.text.startsWith('DECLARE ')&&c.text.endsWith(FINAL_CONSUMER_ROWS_SQL)||/^FETCH FORWARD [0-9]+ FROM mc_final_consumer_[a-f0-9]{32}$/.test(c.text)||/^CLOSE mc_final_consumer_[a-f0-9]{32}$/.test(c.text)));
 assert.equal(fixture.calls.filter(c=>c.text.startsWith('DECLARE ')).length,10);assert.equal(fixture.cursors.size,0);
});
test('raw PostgreSQL JSON is never coerced through a JavaScript number',async()=>{
 const f=finalConsumerFixture(),r=await bindFinalSourceConsumersWithinTransaction(f.input),rows=await consume(r,'core/payrollMonthly');
 assert.equal(rows[0].recordJson,f.data['core/payrollMonthly'][0].record_json);assert.match(rows[0].recordJson,/9007199254740993\.0000001/);assert.match(rows[0].recordJson,/"missing": null/);assert.match(rows[0].recordJson,/"zero": 0/);
});
for(const field of ['project_id','branch_id','database_name','isolation','owner'])test('rejects incorrect transaction/destination '+field,async()=>{
 const f=finalConsumerFixture({editContext:r=>{r[field]=field==='owner'?false:'incorrect';}});await assert.rejects(bindFinalSourceConsumersWithinTransaction(f.input),{code:'GRH_FINAL_CONSUMER_TARGET_OR_TRANSACTION'});
});
for(const field of ['revision_id','tenant_id','source_binding_id','parent_core_version_id','parent_curated_version_id','parent_publication_sha256','source_sha256','package_sha256','source_cutoff','source_database','verified','tenant_data_plane_ready'])test('rejects changed scope or provenance '+field,async()=>{
 const f=finalConsumerFixture({editContext:r=>{r[field]=['verified','tenant_data_plane_ready'].includes(field)?false:'incorrect';}});await assert.rejects(bindFinalSourceConsumersWithinTransaction(f.input),{code:'GRH_FINAL_CONSUMER_CONTEXT'});
});
test('rejects a partial, unsealed or malformed ten-set receipt',async()=>{
 for(const edit of [r=>delete r.fingerprints['curated/grh_family'],r=>r.fingerprints['core/payrollRuns'].rows='3',r=>r.fingerprints['core/payrollRuns'].rows=2000001,r=>r.fingerprints['core/payrollRuns'].md5='broken']){
  await assert.rejects(bindFinalSourceConsumersWithinTransaction(finalConsumerFixture({editContext:edit}).input),{code:'GRH_FINAL_CONSUMER_SEAL'});
 }
 const f=finalConsumerFixture();f.input.client={query:async()=>({rows:[]})};await assert.rejects(bindFinalSourceConsumersWithinTransaction(f.input),{code:'GRH_FINAL_CONSUMER_REVISION'});
});
test('one client cannot continue after COMMIT/reconnect, role change or source revocation',async()=>{
 for(const field of ['transaction_id','reader_role','read_only']){const f=finalConsumerFixture({editContext:(r,n)=>{if(n>1)r[field]=field==='read_only'?'on':'changed';}}),r=await bindFinalSourceConsumersWithinTransaction(f.input);await assert.rejects(consume(r,'core/payrollRuns'),e=>e.code==='GRH_FINAL_CONSUMER_CHANGED'||e.code==='GRH_FINAL_CONSUMER_TARGET_OR_TRANSACTION');}
 const f=finalConsumerFixture({editContext:(r,n)=>{if(n>1)r.verified=false;}}),r=await bindFinalSourceConsumersWithinTransaction(f.input);await assert.rejects(consume(r,'core/payrollRuns'),{code:'GRH_FINAL_CONSUMER_CONTEXT'});
});
test('interrupted consumption cannot certify completeness and can restart without an omitted row',async()=>{
 const f=finalConsumerFixture(),r=await bindFinalSourceConsumersWithinTransaction(f.input);for await(const row of r.readRows('core/payrollRuns',{pageSize:1})){assert.ok(row);break;}
 await assert.rejects(r.assertComplete(),{code:'GRH_FINAL_CONSUMER_INCOMPLETE'});assert.equal(f.cursors.size,0);assert.equal((await consume(r,'core/payrollRuns')).length,3);
});
test('same-count changed content, fewer rows and extra rows never produce a complete receipt',async()=>{
 for(const mode of ['mutate','remove','add']){let edited=false;const f=finalConsumerFixture({editPage:(rows,values)=>{if(values[1]!=='core/payrollRuns'||edited)return;edited=true;if(mode==='mutate')rows[0].record_json='{"changed": true}';if(mode==='remove')rows.splice(0,1);if(mode==='add')rows.splice(1,0,{row_key:'f'.repeat(64),record_json:'{}'});}}),r=await bindFinalSourceConsumersWithinTransaction(f.input);
  await assert.rejects(consume(r,'core/payrollRuns'));await assert.rejects(r.assertComplete(),{code:'GRH_FINAL_CONSUMER_INCOMPLETE'});
 }
});
test('cancellation and concurrent consumption do not silently certify a partial stream',async()=>{
 const f=finalConsumerFixture(),signal=new AbortController(),r=await bindFinalSourceConsumersWithinTransaction({...f.input,signal:signal.signal});
 const stream=r.readRows('core/payrollRuns',{pageSize:1});await stream.next();await assert.rejects(consume(r,'core/movements'),{code:'GRH_FINAL_CONSUMER_READ_ACTIVE'});signal.abort();await assert.rejects(stream.next());await stream.return();await assert.rejects(r.assertComplete());
});
test('consumer cannot provide a page cursor or select an arbitrary entity, package or revision',async()=>{
 const f=finalConsumerFixture(),r=await bindFinalSourceConsumersWithinTransaction(f.input);await assert.rejects(consume(r,'other/table'),{code:'GRH_FINAL_CONSUMER_ARGUMENT'});
 await assert.rejects((async()=>{for await(const row of r.readRows('core/payrollRuns',{after:'f'.repeat(64)}))assert.ok(row);})(),{code:'GRH_FINAL_CONSUMER_ARGUMENT'});
 await assert.rejects(bindFinalSourceConsumersWithinTransaction({...f.input,revisionId:'latest'}),{code:'GRH_FINAL_CONSUMER_ARGUMENT'});
 await assert.rejects(bindFinalSourceConsumersWithinTransaction({...f.input,expectedPackageSha256:'x'.repeat(64)}),{code:'GRH_FINAL_CONSUMER_ARGUMENT'});
 for(const pageSize of [0,1001,null,undefined,'500',1.5])await assert.rejects((async()=>{for await(const row of r.readRows('core/payrollRuns',{pageSize}))assert.ok(row);})(),{code:'GRH_FINAL_CONSUMER_ARGUMENT'});
});
test('an unsuccessful CLOSE prevents completion even after every content digest matches',async()=>{
 const f=finalConsumerFixture(),query=f.client.query;let fail=false;f.client.query=async(text,values)=>{if(fail&&text.startsWith('CLOSE '))throw Error('synthetic failed CLOSE');return query(text,values);};
 const r=await bindFinalSourceConsumersWithinTransaction(f.input);for(const e of SUCCESSOR_ENTITIES.filter(e=>e!=='core/payrollRuns'))await consume(r,e);
 fail=true;await assert.rejects(consume(r,'core/payrollRuns'),/synthetic failed CLOSE/);await assert.rejects(r.assertComplete(),{code:'GRH_FINAL_CONSUMER_INCOMPLETE'});
});
test('a fresh transaction has the same source token but requires its own complete read',async()=>{
 const a=finalConsumerFixture(),b=finalConsumerFixture({editContext:r=>{r.transaction_id='9876';r.read_only='on';r.isolation='repeatable read';}});
 const first=await bindFinalSourceConsumersWithinTransaction(a.input),second=await bindFinalSourceConsumersWithinTransaction(b.input);assert.equal(first.context.contextSha256,second.context.contextSha256);
 await consume(first,'core/payrollRuns');await assert.rejects(second.assertComplete(),{code:'GRH_FINAL_CONSUMER_INCOMPLETE'});
});
