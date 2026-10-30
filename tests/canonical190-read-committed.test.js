// Proposed complete tests/canonical190-read-committed.test.js.
// Written as inert private text. Its author did not import or execute it.
// Uses recorders and one existing small synthetic snapshot; no SQL, server,
// browser, OS process or installation constructor is invoked by these tests.
// Recorder envelopes below are transport fixtures, never native roster proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {OWNER190_NATIVE301_NEW_SOURCE_PINS} from './fixtures/owner190-qa-source-reconciliation.js';
import {bindOwnFullCapacity190} from '../scripts/lib/own-payroll-full-capacity-190-continuation.mjs';
import {calculationPanelReads} from '../scripts/lib/own-payroll-canonical190-browser-host-qa.mjs';
import {internalNativeRoster,NATIVE_ROSTER_V2_SQL} from '../lib/internal-native-roster.js';
import {MAX_NATIVE_ROSTER_ROWS} from '../assets/native-roster-model.js';
import {principal,session,CONTRACT} from './fixtures/native-employee-synthetic.js';
import {currentSnapshot} from './fixtures/native-current-directory-synthetic.js';

const SCHEMA='mc_qa_fixed_092_'+'c'.repeat(32);
const ROLE='SET LOCAL ROLE municontrol_actions_runtime_app';
const BACKEND_START='2026-10-26T12:00:00.123456Z';
const DIRECTORY_SQL='SELECT public.native_employee_directory_snapshot_v1($1::jsonb) AS result';

test('the post209 browser and transaction focals retain their two admitted complete source files',()=>{
 assert.deepEqual(Object.keys(OWNER190_NATIVE301_NEW_SOURCE_PINS),['scripts/lib/own-payroll-post209-browser.mjs','tests/canonical190-read-committed.test.js']);
 const requirePin=(bytes,pin)=>{assert.equal(bytes.length,pin.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256);};
 for(const[file,pin]of Object.entries(OWNER190_NATIVE301_NEW_SOURCE_PINS)){
  const bytes=fs.readFileSync(new URL('../'+file,import.meta.url));requirePin(bytes,pin);
  assert.throws(()=>requirePin(Buffer.concat([bytes,Buffer.from('unreviewed')]),pin),assert.AssertionError);
  const changed=Buffer.from(bytes);changed[0]^=1;assert.throws(()=>requirePin(changed,pin),assert.AssertionError);
 }
});

function recordingHarness({failure=null}={}){
 const calls=[],result=Object.freeze({fixture:'opaque transport result; no native SQL executed'});
 const h={qa:{schema:SCHEMA},
  json(statements,options){
   calls.push({kind:'json',statements:[...statements],options:{...options}});
   if(failure)throw failure;
   return{connection:{pid:731,backendStart:BACKEND_START},result};
  },
  expectRollback(statements,code,options){
   calls.push({kind:'expected',statements:[...statements],code,options:{...options}});
   return{status:3,stderr:'ERROR: '+code+'\nCONTEXT: synthetic transport fixture\n'};
  }
 };
 return{h,calls,result,db:bindOwnFullCapacity190(h)};
}

function assertQueryWire(call,{runtime,command,expected=false}){
 assert.equal(call.kind,expected?'expected':'json');
 assert.deepEqual(call.options,expected?{command}:{command,fullJson:true});
 assert.equal(call.statements.length,runtime?4:3);
 assert.match(call.statements[0],/^DO \$connection_capture\$/);
 if(runtime)assert.equal(call.statements[1],ROLE);
 assert.equal(call.statements.filter(statement=>statement===ROLE).length,runtime?1:0);
 assert.match(call.statements[runtime?2:1],/^DO \$connection_guard\$/);
 assert.match(call.statements.at(-1),/^SELECT jsonb_build_object\('connection',/);
 assert.ok(call.statements.at(-1).includes("current_setting('municontrol_capacity190.native_connection')::jsonb"));
 assert.doesNotMatch(call.statements.at(-1),/pg_stat_activity/);
}

// Obtain the actual second SQL emission of the v2 reader. The first call
// receives an existing, validated synthetic directory-snapshot fixture. The
// technical sentinel stops the real reader before any roster result exists.
async function captureRealRosterEmission(){
 const calls=[],stop=new Error('CANONICAL190_ROSTER_SQL_CAPTURE_ONLY');
 const sql={query:async(statement,values)=>{
  calls.push({statement,values:[...values]});
  if(calls.length===1){
   assert.equal(statement,DIRECTORY_SQL);
   return[{result:currentSnapshot()}];
  }
  assert.equal(calls.length,2);
  assert.equal(statement,NATIVE_ROSTER_V2_SQL);
  throw stop;
 }};
 await assert.rejects(internalNativeRoster(sql,{query:{resource:'nativeroster',schema:'2'}},principal,session),error=>error===stop);
 assert.equal(calls.length,2,'the sentinel prevents a fabricated roster or a post-roster snapshot');
 const emission=calls[1];
 assert.equal(emission.statement,NATIVE_ROSTER_V2_SQL);
 assert.equal(emission.values.length,8);
 assert.ok(emission.values.slice(0,7).every(value=>typeof value==='string'));
 assert.equal(emission.values[7],MAX_NATIVE_ROSTER_ROWS+1);
 const context=JSON.parse(emission.values[0]);
 assert.equal(context.actorEmail,principal.user.email);
 assert.equal(context.actorSessionId,session.id);
 assert.equal(context.tenantId,principal.tenant.id);
 assert.equal(context.membershipId,principal.tenant.membershipId);
 return emission;
}

test('owner default retains RR while runtime and explicit owner RC keep the same connection wire',async()=>{
 const wire=recordingHarness(),statement='SELECT 42';
 assert.strictEqual(await wire.db.run(statement,false),wire.result);
 assert.strictEqual(await wire.db.run(statement,true),wire.result);
 assert.strictEqual(await wire.db.run(statement,false,{readCommitted:true}),wire.result);
 assert.equal(wire.calls.length,3);
 assertQueryWire(wire.calls[0],{runtime:false,command:false});
 assertQueryWire(wire.calls[1],{runtime:true,command:true});
 assertQueryWire(wire.calls[2],{runtime:false,command:true});
 assert.deepEqual(wire.calls[2].statements,wire.calls[0].statements,'owner RC changes the transaction option, not the SQL envelope or role');
 assert.deepEqual(wire.calls[1].statements,[wire.calls[0].statements[0],ROLE,...wire.calls[0].statements.slice(1)]);
 assert.deepEqual(wire.db.connections,Array(3).fill('731:'+BACKEND_START));
 assert.deepEqual(wire.db.trace,[]);
 wire.db.assertNoExpectedRpc();
});

test('the real parameterized RPC query remains a reduced-role command with its connection envelope',async()=>{
 const wire=recordingHarness(),emission=await captureRealRosterEmission();
 const text='SELECT public.own_liquidation_detail_v1($1::jsonb,$2::uuid) AS result';
 const rows=await wire.db.query(text,[emission.values[0],CONTRACT]);
 assert.deepEqual(rows,[{result:wire.result}]);
 assert.equal(wire.calls.length,1);
 assertQueryWire(wire.calls[0],{runtime:true,command:true});
 assert.deepEqual(wire.db.trace,[{sql:text}]);
 assert.equal(wire.db.connections.length,1);
 wire.db.assertNoExpectedRpc();
});

test('the real roster emission crosses calculationPanelReads with three explicit arguments and preserves owner role',async()=>{
 const emission=await captureRealRosterEmission(),wire=recordingHarness(),runCalls=[];
 const db={run(...args){runCalls.push(args);return wire.db.run(...args);}};
 const reader=calculationPanelReads(db,SCHEMA);
 assert.strictEqual(await reader.query(emission.statement,emission.values),wire.result);
 assert.equal(runCalls.length,1);
 const [statement,runtime,options]=runCalls[0];
 assert.equal(runCalls[0].length,3);
 assert.equal(runtime,false);
 assert.deepEqual(options,{readCommitted:true});
 assert.match(statement,/^SELECT \(/);
 assert.ok(statement.includes(SCHEMA+'.native_employee_context_v1('),'private context stays in its owner-role read');
 assert.ok(statement.includes(SCHEMA+'.native_employee_read_projection_v1('));
 assert.doesNotMatch(statement,/public\.native_employee_|;|\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
 assert.equal(wire.calls.length,1);
 assertQueryWire(wire.calls[0],{runtime:false,command:true});
 assert.equal(wire.db.connections.length,1);
 assert.deepEqual(wire.db.trace,[]);
 wire.db.assertNoExpectedRpc();
});

test('the three preexisting calculation-read facades retain their two-argument runtime transport',async()=>{
 const emission=await captureRealRosterEmission(),calls=[],opaque=Object.freeze({facade:'transport only'});
 const db={run:async(...args)=>{calls.push(args);return opaque;}};
 const reader=calculationPanelReads(db,SCHEMA);
 for(const name of ['native_employment_catalog_bootstrap_v1','native_employee_directory_snapshot_v1','own_program_bootstrap_v1']){
  const rows=await reader.query('SELECT public.'+name+'($1::jsonb) AS result',[emission.values[0]]);
  assert.deepEqual(rows,[{result:opaque}]);
 }
 assert.equal(calls.length,3);
 for(const args of calls){assert.equal(args.length,2);assert.equal(args[1],true);}
});

test('unsupported SQL and roster arity cannot use the new isolation option',async()=>{
 const emission=await captureRealRosterEmission(),calls=[];
 const reader=calculationPanelReads({run:async(...args)=>{calls.push(args);assert.fail('SQL outside the finite read selection');}},SCHEMA);
 await assert.rejects(reader.query(emission.statement+' ',emission.values),/CANONICAL190_BROWSER_READ_NOT_ALLOWED/);
 await assert.rejects(reader.query(emission.statement,emission.values.slice(0,-1)),assert.AssertionError);
 const wrongLimit=[...emission.values];wrongLimit[7]--;
 await assert.rejects(reader.query(emission.statement,wrongLimit),assert.AssertionError);
 assert.deepEqual(calls,[]);
});

test('maltyped readCommitted is rejected before h.json or a native expectation can emit',async()=>{
 for(const value of [null,'true',1,0,{},[]]){
  const wire=recordingHarness();
  await assert.rejects(wire.db.run('SELECT 42',false,{readCommitted:value}),/M7_190_READ_COMMITTED_INVALID/);
  assert.deepEqual(wire.calls,[]);assert.deepEqual(wire.db.connections,[]);
  wire.db.assertNoExpectedRpc();
 }
});

test('explicit RC is confined to one owner SELECT and never overrides a runtime or command batch',async()=>{
 for(const [statement,runtime]of[
  ['SELECT 42',true],
  ['DO $not_a_read$ BEGIN NULL;END $not_a_read$',false],
  ['SELECT 1;SELECT 2',false]
 ]){
  const wire=recordingHarness();
  await assert.rejects(wire.db.run(statement,runtime,{readCommitted:true}),/M7_190_READ_COMMITTED_OWNER_QUERY_REQUIRED/);
  assert.deepEqual(wire.calls,[]);assert.deepEqual(wire.db.connections,[]);
  wire.db.assertNoExpectedRpc();
 }
});

test('previous third-argument keys stay inert and cannot spread options or widen the role',async()=>{
 const wire=recordingHarness(),statement='SELECT 42';
 for(const readOnly of [true,false]){
  assert.strictEqual(await wire.db.run(statement,false,{readOnly,command:true,end:'ROLLBACK',fullJson:false,role:'foreign'}),wire.result);
 }
 assert.strictEqual(await wire.db.run(statement,false,{readCommitted:true,readOnly:true,command:false,end:'ROLLBACK',fullJson:false,role:'foreign'}),wire.result);
 assert.equal(wire.calls.length,3);
 for(const call of wire.calls.slice(0,2))assertQueryWire(call,{runtime:false,command:false});
 assertQueryWire(wire.calls[2],{runtime:false,command:true});
 assert.deepEqual(wire.calls[0].statements,wire.calls[1].statements);
 assert.deepEqual(wire.calls[0].statements,wire.calls[2].statements);
 wire.db.assertNoExpectedRpc();
});

test('an existing expected native error retains its rollback channel, code and reduced role',async()=>{
 const wire=recordingHarness(),statement='SELECT 42',nativeCode='NATIVE_EMPLOYMENT_LIFECYCLE_BUSY';
 await wire.db.expectRunError({caseId:'301-existing-runtime-error',nativeCode,statement,runtime:true},()=>
  assert.rejects(wire.db.run(statement,true),error=>error.message==='ERROR: '+nativeCode+'\nCONTEXT: synthetic transport fixture\n'));
 assert.equal(wire.calls.length,1);
 assertQueryWire(wire.calls[0],{runtime:true,command:true,expected:true});
 assert.equal(wire.calls[0].code,nativeCode);
 assert.deepEqual(wire.db.connections,[],'an expected-error return has no invented connection envelope');
 wire.db.assertNoExpectedRpc();
});

test('an unexpected transport failure is propagated unchanged and never becomes an expected SQL result',async()=>{
 const failure=new Error('SYNTHETIC_CAPTURE_FAILURE'),wire=recordingHarness({failure});
 await assert.rejects(wire.db.run('SELECT 42',false,{readCommitted:true}),error=>error===failure);
 assert.equal(wire.calls.length,1);
 assertQueryWire(wire.calls[0],{runtime:false,command:true});
 assert.deepEqual(wire.db.connections,[]);
 wire.db.assertNoExpectedRpc();
});
