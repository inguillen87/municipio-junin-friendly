import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFinalSourceRevisionWithinTransaction,validateFinalSourceRevisionInput} from '../scripts/lib/grh-final-source-revision.mjs';
import {loaderQaPackage} from './fixtures/successor-loader-postgres.js';
import {finalRevisionPackage,finalRevisionClient,finalRevisionTarget as target} from './fixtures/final-source-revision-synthetic.js';
const pack=await finalRevisionPackage();
const prepare=(client,options={})=>prepareFinalSourceRevisionWithinTransaction({client,prepared:pack,target,
 expectedPackageSha256:pack.payloadSha256,installSchema:true,...options});

test('the final profile uses its reviewed predecessor and preserves the supplied package',()=>{
 const original=structuredClone(pack),validated=validateFinalSourceRevisionInput(pack,target,pack.payloadSha256);
 assert.equal(validated.pack.candidate.profileId,'grh-junin-2026-10-01');assert.equal(validated.pack.baseline.profileId,'grh-junin-2026-09-10');
 assert.deepEqual(pack,original);assert.ok(Object.isFrozen(validated.pack.changes));
});
test('the September staging package is rejected before any SQL',async()=>{
 const client=finalRevisionClient(pack),old=await loaderQaPackage();
 await assert.rejects(prepare(client,{prepared:old,expectedPackageSha256:old.payloadSha256}),{code:'GRH_FINAL_REVISION_PROFILE'});
 assert.equal(client.calls.length,0);
});
test('a changed package or a forged source attestation is rejected before SQL',async()=>{
 const client=finalRevisionClient(pack);
 await assert.rejects(prepare(client,{expectedPackageSha256:'0'.repeat(64)}),{code:'GRH_FINAL_REVISION_PACKAGE_CHANGED'});
 const forged=structuredClone(pack);forged.candidate.cutoff='2026-10-02T15:17:29';
 await assert.rejects(prepare(client,{prepared:forged}),{code:'SUCCESSOR_PACKAGE_INVALID'});assert.equal(client.calls.length,0);
});
test('preexisting cancellation has zero SQL effects',async()=>{
 const controller=new AbortController();controller.abort();const client=finalRevisionClient(pack);
 await assert.rejects(prepare(client,{signal:controller.signal}),{name:'AbortError'});assert.equal(client.calls.length,0);
});
for(const [field,value] of [['database','other_db'],['project','other-project'],['branch','br-other'],['owner',false],
 ['read_only','on'],['isolation','repeatable read']])test('the actual destination and owner transaction are checked: '+field,async()=>{
 const client=finalRevisionClient(pack,{state:{[field]:value}});
 await assert.rejects(prepare(client),{code:'GRH_FINAL_REVISION_TARGET_OR_TRANSACTION'});
 assert.equal(client.calls.length,1);assert.equal(client.stored,null);
});
test('a busy predecessor cannot produce a partial preparation',async()=>{
 const client=finalRevisionClient(pack,{lock:false});await assert.rejects(prepare(client),{code:'GRH_FINAL_REVISION_BUSY'});
 assert.equal(client.stored,null);assert.ok(client.calls.at(-1).text.startsWith('ROLLBACK TO SAVEPOINT'));
});
test('schema installation is an explicit option',async()=>{
 const client=finalRevisionClient(pack);await assert.rejects(prepare(client,{installSchema:false}),{code:'GRH_FINAL_REVISION_SCHEMA_REQUIRED'});
 assert.equal(client.state.installed,false);assert.equal(client.stored,null);
});
test('complete differences survive all chunks; sealing cannot select a source or adopt employees',async()=>{
 const client=finalRevisionClient(pack),receipt=await prepare(client);
 assert.equal(receipt.entities,10);assert.equal(client.deltaRows,410);assert.equal(client.chunks,3);assert.equal(receipt.deltaRows,410);
 assert.equal(receipt.operationalSourceChanged,false);assert.equal(receipt.adoptionPerformed,false);assert.equal(receipt.payrollCalculated,false);
 assert.equal(receipt.committed,false);assert.equal(receipt.callerOwnedTransaction,true);
 assert.ok(!client.calls.some(c=>/^(?:BEGIN|COMMIT|UPDATE|DELETE|TRUNCATE)\b/.test(c.text)));
 assert.ok(!client.calls.some(c=>/INSERT INTO public\.(?:grh_effective_source_binding|employment_contract|employment_adoption_proposal|source_import_batch)\b/.test(c.text)));
});
test('the same reviewed revision replays without another header, delta or seal',async()=>{
 const client=finalRevisionClient(pack);const first=await prepare(client),offset=client.calls.length;
 const second=await prepare(client);assert.equal(second.replayed,true);assert.equal(second.revisionId,first.revisionId);
 assert.equal(client.deltaRows,410);assert.equal(client.chunks,3);
 assert.ok(!client.calls.slice(offset).some(c=>/INSERT INTO public\./.test(c.text)));
});
test('an interrupted later chunk rolls back new schema and all partial rows',async()=>{
 let count=0;const client=finalRevisionClient(pack,{fail:text=>text.includes('final-revision:delta */')&&++count===2});
 await assert.rejects(prepare(client),/synthetic interrupted query/);
 assert.equal(client.stored,null);assert.equal(client.deltaRows,0);assert.equal(client.state.installed,false);
 assert.ok(client.calls.at(-1).text.startsWith('ROLLBACK TO SAVEPOINT'));
});
for(const change of ['previousMismatch','manifestMismatch','sameCountNativeChange'])test('predecessor and native records are revalidated: '+change,async()=>{
 const client=finalRevisionClient(pack,{observation:(rows,cursor)=>{
  if(change==='previousMismatch'&&rows[0]?.observation?.entity==='curated/grh_employees')rows[0].observation.previousMismatches=1;
  if(change==='manifestMismatch'&&rows[0]?.observation?.core_manifest)rows[0].observation.core_manifest='0'.repeat(64);
  if(change==='sameCountNativeChange'&&cursor>26&&rows[0]?.observation?.domain==='action_case')rows[0].observation.fingerprint='0'.repeat(32);
 }});
 await assert.rejects(prepare(client),{code:change==='sameCountNativeChange'?'GRH_FINAL_REVISION_PRESERVATION':'GRH_FINAL_REVISION_BASELINE_CHANGED'});
 assert.equal(client.stored,null);
});
test('a replay with an altered manifest is not accepted as an existing revision',async()=>{
 const client=finalRevisionClient(pack);await prepare(client);client.stored.curated_manifest_sha256='0'.repeat(64);
 await assert.rejects(prepare(client),{code:'GRH_FINAL_REVISION_REPLAY_CONFLICT'});
});
test('matching counts cannot conceal changed persisted differences',async()=>{
 const client=finalRevisionClient(pack,{mismatches:1});await assert.rejects(prepare(client),{code:'GRH_FINAL_REVISION_REPLAY_DRIFT'});
 assert.equal(client.stored,null);assert.equal(client.deltaRows,0);
});
test('failure to verify one reconstructed entity prevents a complete receipt',async()=>{
 const client=finalRevisionClient(pack,{fingerprint:entity=>entity==='curated/grh_family'?{rows:0,md5:'0'.repeat(32)}:null});
 await assert.rejects(prepare(client),{code:'GRH_FINAL_REVISION_REPLAY_DRIFT'});assert.equal(client.stored,null);
});
test('the final package retains closed September, open October M/O and exact source fields',()=>{
 const runs=pack.changes.filter(c=>c.entity==='core/payrollRuns').map(c=>c.record);
 assert.equal(runs.find(r=>r.source_month===9).closure_status,'closed');
 assert.deepEqual(runs.filter(r=>r.source_month===10).map(r=>[r.payroll_type,r.closure_status]).sort(),[['M','open'],['O','open']]);
 const monthly=pack.changes.find(c=>c.entity==='core/payrollMonthly').record;
 assert.equal(monthly.quantity_sum,'9007199254740993.0000001');assert.equal(monthly.net,'0');assert.equal(monthly.net_payable,null);
 assert.equal(monthly.total_subject_earnings,'12345678901234567890.0123456789');
 const payload=pack.changes.find(c=>c.entity==='curated/grh_employees').record.source_payload;
 assert.deepEqual(payload.department,{id:'1',name:'042'});assert.equal(payload.liquida,false);
 assert.equal(payload.seniority,'9007199254740993.0000001');assert.equal(payload.bank,null);assert.equal(payload.zero,'0.00');
});
test('insufficient cluster capacity rejects preparation before installing a schema',async()=>{
 const client=finalRevisionClient(pack,{capacity:()=>({database_bytes:'1000000',cluster_bytes:String(500*1024*1024)})});
 await assert.rejects(prepare(client),{code:'GRH_FINAL_REVISION_CAPACITY_REQUIRED'});
 assert.equal(client.state.installed,false);assert.equal(client.stored,null);
});
test('excessive measured growth rolls back the preparation',async()=>{
 const client=finalRevisionClient(pack,{capacity:n=>({database_bytes:String(n===1?1000000:30*1024*1024),cluster_bytes:String(40*1024*1024)})});
 await assert.rejects(prepare(client),{code:'GRH_FINAL_REVISION_CAPACITY_EXCEEDED'});
 assert.equal(client.state.installed,false);assert.equal(client.stored,null);
});
test('exact replay needs no second growth reservation',async()=>{
 let constrained=false;const client=finalRevisionClient(pack,{capacity:()=>({database_bytes:'1000000',cluster_bytes:String(constrained?480*1024*1024:4000000)})});
 await prepare(client);constrained=true;const receipt=await prepare(client);
 assert.equal(receipt.replayed,true);assert.equal(receipt.capacityBefore.requiredGrowthBytes,0);assert.equal(client.deltaRows,410);
});
for(const protection of [{tables:2,protected:true,runtime_access:false},{tables:3,protected:false,runtime_access:false},
 {tables:3,protected:true,runtime_access:true}])test('a missing, unprotected or exposed schema cannot accept source records: '+JSON.stringify(protection),async()=>{
 const client=finalRevisionClient(pack,{protection});await assert.rejects(prepare(client),{code:'GRH_FINAL_REVISION_SCHEMA_NOT_PRIVATE'});
 assert.equal(client.stored,null);assert.equal(client.state.installed,false);
});
