import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {registryQaLockQuery,verifiedRegistryQaLocks,observeRegistryQaCommand} from '../scripts/lib/registry-qa-lock-observation.mjs';
const schema='mc_qa_fixed_092_'+'b'.repeat(32),fixture=()=>({observedAt:'2026-10-11T22:00:00Z',locks:[{relation:'source_import_batch',pid:123,mode:'ShareUpdateExclusiveLock',granted:true,backendType:'autovacuum worker'}],vacuum:[{relation:'employment_contract',pid:123,phase:'scanning heap'}]});
test('registry observer reads the original proposal and source prerequisite relations only in a synthetic schema',()=>{
 for(const invalid of ['public','other_project',schema+"';DELETE",schema+'x'])assert.throws(()=>registryQaLockQuery(invalid));
 const query=registryQaLockQuery(schema);assert.match(query,/^SELECT /);assert.doesNotMatch(query,/\b(?:UPDATE|DELETE|INSERT|ALTER|LOCK TABLE|pg_cancel_backend|pg_terminate_backend|pg_sleep)\b/i);assert.doesNotMatch(query,/a\.query|usename|client_addr|actor_email|body|request_key/);
 for(const relation of ['employment_contract','person_identity','source_import_batch','grh_effective_source_binding','grh_core_source_version','grh_curated_source_version','grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows','source_staging_row','grh_curated_source_delta','grh_curated_source_version_seal'])assert.ok(query.includes("'"+relation+"'"));assert.ok(!query.includes('native_employee_registration'));
});
test('registry snapshots reject unrecognized fields, relations, backend labels and free text',()=>{
 for(const bad of [{...fixture(),query:'private'},{...fixture(),observedAt:'invalid'},{...fixture(),locks:[{...fixture().locks[0],relation:'employment_contract;SELECT'}]},{...fixture(),locks:[{...fixture().locks[0],backendType:'private name'}]},{...fixture(),vacuum:[{...fixture().vacuum[0],phase:'private text'}]}])assert.throws(()=>verifiedRegistryQaLocks(bad));
 const f=fixture(),copy=verifiedRegistryQaLocks(f);f.locks[0].mode='changed';assert.equal(copy.locks[0].mode,'ShareUpdateExclusiveLock');
});
test('registry metadata bounds reject the full oversized response and keep a null prepared-transaction PID',()=>{
 assert.throws(()=>verifiedRegistryQaLocks({...fixture(),locks:Array.from({length:201},()=>fixture().locks[0])}),/REGISTRY_QA_LOCK_CAPACITY/);
 assert.throws(()=>verifiedRegistryQaLocks({...fixture(),vacuum:Array.from({length:21},()=>fixture().vacuum[0])}),/REGISTRY_QA_LOCK_CAPACITY/);
 const f=fixture();f.locks[0].pid=null;assert.equal(verifiedRegistryQaLocks(f).locks[0].pid,null);f.locks[0].pid=0;assert.throws(()=>verifiedRegistryQaLocks(f));
});
test('registry success returns the original value with one original command',async()=>{
 const value={},records=[];let reads=0,calls=0;assert.equal(await observeRegistryQaCommand({schema,db:{run:async query=>{assert.equal(query,registryQaLockQuery(schema));reads++;return fixture();}},record:v=>records.push(v),execute:async()=>{calls++;return value;}}),value);assert.equal(reads,1);assert.equal(calls,1);assert.equal(records[0].phase,'before_command');
});
test('registry BUSY retains the original error, one command and no private error text',async()=>{
 const error=Error('EMPLOYMENT_ADOPTION_BUSY private payload'),records=[];let calls=0;await assert.rejects(observeRegistryQaCommand({schema,db:{run:async()=>fixture()},record:v=>records.push(v),execute:async()=>{calls++;throw error;}}),e=>e===error);assert.equal(calls,1);assert.deepEqual(records.map(v=>v.phase),['before_command','after_busy']);assert.ok(!JSON.stringify(records).includes('private payload'));
});
test('registry metadata or recorder failure after the command does not replace its error',async()=>{
 for(const fail of ['read','record']){let reads=0,records=0,calls=0;const error=Error('original failure');await assert.rejects(observeRegistryQaCommand({schema,db:{run:async()=>{if(++reads===2&&fail==='read')throw Error('observation failed');return fixture();}},record:()=>{if(++records===2&&fail==='record')throw Error('recorder failed');},execute:async()=>{calls++;throw error;}}),e=>e===error);assert.equal(calls,1);}
});
test('registry observation failure before execution fails instead of executing an unobserved command',async()=>{
 let calls=0;await assert.rejects(observeRegistryQaCommand({schema,db:{run:async()=>{throw Error('read failed');}},record:()=>{},execute:async()=>{calls++;}}),/read failed/);assert.equal(calls,0);
});
test('Noelia CI retains original proposal transport error and lock observations without retries or ignored failure',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/noelia-payroll-circuit.yml',import.meta.url),'utf8');const at=workflow.indexOf('name: Preserve original pending facts');assert.ok(at>0);const step=workflow.slice(at,workflow.indexOf('\n      - name:',at));assert.match(step,/MC_QA_LOCK_OBSERVATION: '1'/);assert.doesNotMatch(step,/continue-on-error|retry|sleep|\|\| true/i);
 for(const file of ['adapter-failure.txt','registry-lock-observations.ndjson'])assert.ok(workflow.includes('verification/registry-original-facts-ci/'+file));
});
