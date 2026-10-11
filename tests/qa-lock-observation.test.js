import test from 'node:test';import assert from 'node:assert/strict';
import {ownQaLockQuery,verifiedOwnQaLocks,observeOwnQaCommand} from '../scripts/lib/qa-lock-observation.mjs';
const schema='mc_qa_fixed_092_'+'a'.repeat(32),fixture=()=>({observedAt:'2026-10-11T14:00:00Z',locks:[{relation:'employment_contract',pid:123,mode:'ShareUpdateExclusiveLock',granted:true,backendType:'autovacuum worker'}],vacuum:[{relation:'employment_contract',pid:123,phase:'scanning heap'}]});
test('observer rejects another schema or SQL injection and reads only permitted relation metadata',()=>{
 for(const invalid of ['public','other_project',schema+"';DELETE",schema+'x'])assert.throws(()=>ownQaLockQuery(invalid));
 const query=ownQaLockQuery(schema);assert.match(query,/^SELECT /);assert.doesNotMatch(query,/\b(?:UPDATE|DELETE|INSERT|ALTER|LOCK TABLE|pg_cancel_backend|pg_terminate_backend|pg_sleep)\b/i);assert.doesNotMatch(query,/a\.query|usename|client_addr|actor_email|body|request_key/);
});
test('snapshot rejects arbitrary fields and payloads; output is detached from mutable input',()=>{
 const f=fixture(),v=verifiedOwnQaLocks(f);f.locks[0].mode='changed';assert.equal(v.locks[0].mode,'ShareUpdateExclusiveLock');
 for(const altered of [{...fixture(),query:'private text'},{...fixture(),observedAt:'invalid'},{...fixture(),locks:[{...fixture().locks[0],relation:'person_identity;SELECT'}]},{...fixture(),locks:[{...fixture().locks[0],query:'private text'}]},{...fixture(),vacuum:[{...fixture().vacuum[0],phase:'private text'}]}])assert.throws(()=>verifiedOwnQaLocks(altered));
});
test('oversized metadata is rejected as a whole, without trimming rows',()=>{assert.throws(()=>verifiedOwnQaLocks({...fixture(),locks:Array.from({length:201},()=>fixture().locks[0])}),/QA_LOCK_CAPACITY/);});
test('a prepared transaction PID remains null instead of inventing zero',()=>{const f=fixture();f.locks[0].pid=null;assert.equal(verifiedOwnQaLocks(f).locks[0].pid,null);f.locks[0].pid=0;assert.throws(()=>verifiedOwnQaLocks(f));});
test('successful original command executes exactly once and returns its same result',async()=>{
 const result={},records=[];let commands=0,reads=0;
 const value=await observeOwnQaCommand({schema,db:{run:async q=>{assert.equal(q,ownQaLockQuery(schema));reads++;return fixture();}},record:r=>records.push(r),execute:async()=>{commands++;return result;}});
 assert.equal(value,result);assert.equal(commands,1);assert.equal(reads,1);assert.equal(records[0].phase,'before_command');
});
test('BUSY keeps the original error and command count; no retry or free error text is recorded',async()=>{
 const error=Error('SENIORITY_BUSY arbitrary sensitive text'),records=[];let commands=0;
 await assert.rejects(observeOwnQaCommand({schema,db:{run:async()=>fixture()},record:r=>records.push(r),execute:async()=>{commands++;throw error;}}),e=>e===error);
 assert.equal(commands,1);assert.deepEqual(records.map(r=>r.phase),['before_command','after_busy']);assert.equal(JSON.stringify(records).includes('sensitive'),false);
});
test('observation failure after a command never replaces the original failed command',async()=>{
 const error=Error('original failure'),records=[];let reads=0,commands=0;
 await assert.rejects(observeOwnQaCommand({schema,db:{run:async()=>{if(++reads===2)throw Error('metadata failure');return fixture();}},record:r=>records.push(r),execute:async()=>{commands++;throw error;}}),e=>e===error);
 assert.equal(commands,1);assert.deepEqual(records.map(r=>r.phase),['before_command','observation_failed']);
});
test('a failed diagnostic recorder cannot replace an already failed command',async()=>{
 const error=Error('original failure');let records=0,commands=0;
 await assert.rejects(observeOwnQaCommand({schema,db:{run:async()=>fixture()},record:()=>{if(++records>1)throw Error('recorder failure');},execute:async()=>{commands++;throw error;}}),e=>e===error);assert.equal(commands,1);
});
