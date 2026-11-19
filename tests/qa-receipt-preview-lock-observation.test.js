import test from 'node:test';
import assert from 'node:assert/strict';
import {ownQaLockQuery,verifiedOwnQaLocks,observeOwnQaCommand} from '../scripts/lib/qa-lock-observation.mjs';
const schema='mc_qa_fixed_092_'+'a'.repeat(32),application='mc-noelia:'+schema;
const fixture=(pid=101)=>({observedAt:'2026-11-03T01:19:27.652Z',observer:{pid,applicationName:application,state:'active'},locks:[{relation:'employment_contract',pid:2507,mode:'ShareUpdateExclusiveLock',granted:true,backendType:'autovacuum worker',applicationName:'other',state:'active'}],vacuum:[]});
function source({failRead=0}={}){
 const connections=[];let reads=0;
 return {connections,get reads(){return reads;},run:async(query,runtime)=>{assert.equal(query,ownQaLockQuery(schema,{activity:true}));assert.equal(runtime,false);reads++;if(reads===failRead)throw Error('unrecorded metadata failure');const pid=100+reads;connections.push(pid);return fixture(pid);}};
}
test('LP1 detailed metadata is one read-only SELECT with scoped PID/application/state and no query, identity or credentials',()=>{
 const query=ownQaLockQuery(schema,{activity:true});assert.match(query,/^SELECT /);
 assert.ok(query.includes("'observer',jsonb_build_object('pid',pg_backend_pid()"));assert.ok(query.includes('a.application_name'));assert.ok(query.includes('a.state'));
 assert.ok(query.includes("ELSE 'other' END"));assert.ok(query.includes("n.nspname='"+schema+"'"));
 assert.doesNotMatch(query,/\b(?:UPDATE|DELETE|INSERT|ALTER|LOCK TABLE|pg_cancel_backend|pg_terminate_backend|pg_sleep)\b/i);
 assert.doesNotMatch(query,/a\.query|usename|client_addr|actor_email|body|request_key|password|DATABASE_URL/);
 assert.equal(ownQaLockQuery(schema).includes("'observer'"),false);
});
test('LP2 detailed traces reject arbitrary fields/application names/states and preserve null prepared-transaction PID without dropping rows',()=>{
 const input=fixture(),copy=verifiedOwnQaLocks(input,{activity:true});input.locks[0].state='changed';assert.equal(copy.locks[0].state,'active');
 for(const value of[{...fixture(),query:'private'},{...fixture(),observer:{...fixture().observer,pid:0}},{...fixture(),locks:[{...fixture().locks[0],applicationName:'private application text'}]},{...fixture(),locks:[{...fixture().locks[0],state:'private state text'}]},{...fixture(),locks:Array.from({length:201},()=>fixture().locks[0])}])assert.throws(()=>verifiedOwnQaLocks(value,{activity:true}));
 const prepared=fixture();prepared.locks[0].pid=null;assert.equal(verifiedOwnQaLocks(prepared,{activity:true}).locks[0].pid,null);
});
test('LP3 successful preview executes once and returns the same value between two snapshots with its real recorded connection PID',async()=>{
 const db=source(),records=[],result={ok:true};let calls=0;
 const actual=await observeOwnQaCommand({db,schema,activity:true,record:v=>records.push(v),execute:async()=>{calls++;db.connections.push(2506);return result;}});
 assert.equal(actual,result);assert.equal(calls,1);assert.equal(db.reads,2);
 assert.deepEqual(records.map(r=>r.phase),['before_command','after_success']);assert.deepEqual(records.map(r=>r.operationPid),[null,2506]);
 assert.deepEqual(records.map(r=>r.observer.pid),[101,102]);assert.equal(records[1].observer.applicationName,application);
 assert.notEqual(records[1].operationPid,records[0].observer.pid);assert.notEqual(records[1].operationPid,records[1].observer.pid);
});
test('LP4 the original 503 assertion is rethrown by identity with zero retries and no sensitive error text in its traces',async()=>{
 const db=source(),records=[],error=Object.assign(Error('private original payload'),{code:'ERR_ASSERTION',actual:503,expected:200});let calls=0;
 await assert.rejects(observeOwnQaCommand({db,schema,activity:true,record:v=>records.push(v),execute:async()=>{calls++;db.connections.push(2506);throw error;}}),e=>e===error&&e.actual===503&&e.expected===200);
 assert.equal(calls,1);assert.equal(db.reads,2);assert.deepEqual(records.map(r=>r.phase),['before_command','after_failure']);assert.equal(records[1].operationPid,2506);
 assert.equal(JSON.stringify(records).includes('private'),false);assert.equal(Object.hasOwn(records[1],'error'),false);
 assert.notEqual(records[1].operationPid,records[0].observer.pid);assert.notEqual(records[1].operationPid,records[1].observer.pid);
});
test('LP5 a failed after-snapshot preserves the original preview error and operation PID',async()=>{
 const db=source({failRead:2}),records=[],error=Error('original failure');let calls=0;
 await assert.rejects(observeOwnQaCommand({db,schema,activity:true,record:v=>records.push(v),execute:async()=>{calls++;db.connections.push(2506);throw error;}}),e=>e===error);
 assert.equal(calls,1);assert.deepEqual(records.map(r=>r.phase),['before_command','observation_failed']);assert.equal(records[1].operationPid,2506);
});
test('LP6 failure of the before-snapshot prevents the preview instead of running without the required observation',async()=>{
 const db=source({failRead:1});let calls=0;
 await assert.rejects(observeOwnQaCommand({db,schema,activity:true,record:()=>{},execute:async()=>{calls++;}}),/unrecorded metadata failure/);
 assert.equal(calls,0);assert.equal(db.reads,1);
});
test('LP7 recorder failure cannot replace an already failed preview or cause another preview',async()=>{
 const db=source(),error=Error('original failure');let calls=0,records=0;
 await assert.rejects(observeOwnQaCommand({db,schema,activity:true,record:()=>{if(++records>1)throw Error('recorder failure');},execute:async()=>{calls++;db.connections.push(2506);throw error;}}),e=>e===error);
 assert.equal(calls,1);assert.equal(db.reads,2);
});
test('LP8 a failed success-bookend fails observation after one preview and never fabricates a passing result',async()=>{
 const db=source({failRead:2});let calls=0;
 await assert.rejects(observeOwnQaCommand({db,schema,activity:true,record:()=>{},execute:async()=>{calls++;db.connections.push(2506);return {ok:true};}}),/unrecorded metadata failure/);
 assert.equal(calls,1);assert.equal(db.reads,2);
});

test('LP9 the default legacy observer still uses runtime metadata and keeps its prior one-snapshot trace contract',async()=>{
 const records=[],reads=[],result={ok:true};let calls=0;
 const legacy={observedAt:'2026-11-03T01:19:27Z',locks:[],vacuum:[]};
 const db={run:async(query,runtime)=>{reads.push({query,runtime});return structuredClone(legacy);}};
 const value=await observeOwnQaCommand({db,schema,record:v=>records.push(v),execute:async()=>{calls++;return result;}});
 assert.equal(value,result);assert.equal(calls,1);assert.deepEqual(reads,[{query:ownQaLockQuery(schema),runtime:true}]);
 assert.deepEqual(records,[{phase:'before_command',...legacy}]);assert.equal(Object.hasOwn(records[0],'operationPid'),false);
});
test('LP10 a preview that fails before recording its backend keeps operationPid null instead of borrowing an owner observer PID',async()=>{
 const db=source(),records=[],error=Object.assign(Error('original unrecorded preview failure'),{actual:503,expected:200});let calls=0;
 await assert.rejects(observeOwnQaCommand({db,schema,activity:true,record:v=>records.push(v),execute:async()=>{calls++;throw error;}}),e=>e===error);
 assert.equal(calls,1);assert.equal(db.reads,2);assert.deepEqual(db.connections,[101,102]);
 assert.deepEqual(records.map(r=>r.phase),['before_command','after_failure']);
 assert.deepEqual(records.map(r=>r.operationPid),[null,null]);assert.deepEqual(records.map(r=>r.observer.pid),[101,102]);
});
