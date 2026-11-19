import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createOwnQaCaptureSql,QA_RUN_CAPTURE_QUERY} from '../scripts/lib/qa-run-capture-lock.mjs';
import {ownQaLockQuery} from '../scripts/lib/qa-lock-observation.mjs';
import {buildOwnPeriodParticipationSql} from '../scripts/lib/own-period-participation-installation.mjs';
import {createOwnRunHandler} from '../api/internal-own-payroll-run.js';
import {RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
import {runCommand} from './fixtures/own-payroll-run-synthetic.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const schema='mc_qa_fixed_092_'+'a'.repeat(32);
// Keep the independent expected lock statement explicit; a changed production
// source must make this classifier test fail rather than widen its retry scope.
const relations=['person_identity','employment_contract','native_employee_registration','native_employment_change_review','native_employment_lifecycle_review','employment_adoption_application','employment_adoption_decision','employment_adoption_proposal','native_salary_event','own_payroll_program_event','payroll_novelty_batch','payroll_novelty_row','payroll_novelty_issue','payroll_novelty_event','payroll_fixed_novelty','payroll_fixed_novelty_event'];
const lock='LOCK TABLE '+relations.map(name=>schema+'.'+name).join(',')+' IN SHARE MODE NOWAIT';
const args=()=>[JSON.stringify({actorEmail:'qa@example.invalid',actorSessionId:uid(3),actorSessionVersion:1,releaseSha:'d'.repeat(40),tenantId:uid(1),membershipId:uid(2)}),JSON.stringify(runCommand()),uid(9),hash('c')];
const failure=(overrides={})=>new Error('psql: synthetic capture lock refusal',{cause:{
 code:3,killed:false,signal:null,stdout:'{"qaConnectionPid": 345}\n',
 stderr:'psql:<stdin>:3: ERROR:  55P03: could not obtain lock on relation "'+schema+'.native_employee_registration"\nCONTEXT:  SQL statement "'+lock+'"\nPL/pgSQL function own_run_capture_v1(jsonb,jsonb,uuid,text) line 21 at SQL statement\nLOCATION:  RangeVarGetRelidExtended, namespace.c:435\n',...overrides
}});
const metadata=()=>({observedAt:'2026-11-11T22:34:02.482Z',observer:{pid:346,applicationName:'mc-noelia:'+schema,state:'active'},locks:[{relation:'native_employee_registration',pid:12,mode:'ShareUpdateExclusiveLock',granted:true,backendType:'autovacuum worker',applicationName:'',state:'active'}],vacuum:[]});
function setup({execute,observe=async()=>metadata(),pause,record,query=async()=>assert.fail('unexpected RPC passthrough')}={}){
 const calls=[],records=[],pauses=[];
 const adapter=createOwnQaCaptureSql({read,schema,db:{query,run:async(sql,runtime)=>{
  if(runtime){calls.push(sql);return execute?execute(sql,calls.length):{captured:true};}
  assert.equal(sql,ownQaLockQuery(schema,{activity:true}));return observe();
 }},record:async value=>{records.push(value);if(record)await record(value);},pause:async ms=>{pauses.push(ms);if(pause)await pause(ms);}});
 return {adapter,calls,records,pauses};
}

test('first capture succeeds once; its result and arguments are preserved',async()=>{
 const result={captured:true},a=setup({execute:async()=>result});
 assert.deepEqual(await a.adapter.query(QA_RUN_CAPTURE_QUERY,args()),[{result}]);
 assert.equal(a.calls.length,1);assert.deepEqual(a.records,[]);assert.deepEqual(a.pauses,[]);
 assert.ok(a.calls[0].startsWith('\n\\set VERBOSITY verbose\nSELECT '+schema+'.own_run_capture_v1('));
 assert.deepEqual(a.adapter.captureLockProof(),{requests:1,attempts:1,retries:0,refusals:0,maxAttempts:3,maxObservedAttempts:1});
});

test('only proved aborted capture refusals retry, with identical actor, body, key and algorithm bytes',async()=>{
 const values=args(),original=values.slice(),result={captured:true};
 const a=setup({execute:async(_,attempt)=>{if(attempt<3)throw failure();return result;},pause:async()=>{values[0]='{}';values[1]='{}';values[2]=uid(99);values[3]=hash('f');}});
 assert.deepEqual(await a.adapter.query(QA_RUN_CAPTURE_QUERY,values),[{result}]);
 assert.equal(a.calls.length,3);assert.equal(new Set(a.calls).size,1);assert.deepEqual(a.pauses,[100,250]);
 for(const value of original)assert.ok(a.calls[0].includes("'"+value.replaceAll("'","''")+"'"));
 assert.equal(a.records.length,2);assert.equal(new Set(a.records.map(row=>row.sqlSha256)).size,1);
 assert.ok(a.records.every(row=>row.phase==='capture_lock_refused'&&row.willRetry&&row.sqlstate==='55P03'&&row.operationPid===345&&row.transaction==='aborted_psql_exit'));
 assert.equal(a.records[0].observation.locks[0].backendType,'autovacuum worker');
 assert.ok(!JSON.stringify(a.records).includes('qa@example.invalid'));assert.ok(!JSON.stringify(a.records).includes(values[2]));
 assert.deepEqual(a.adapter.captureLockProof(),{requests:1,attempts:3,retries:2,refusals:2,maxAttempts:3,maxObservedAttempts:3});
});

test('a lock that ended before metadata sampling still has the original abort proof',async()=>{
 const a=setup({execute:async(_,attempt)=>{if(attempt===1)throw failure();return null;},observe:async()=>({...metadata(),locks:[]})});
 assert.deepEqual(await a.adapter.query(QA_RUN_CAPTURE_QUERY,args()),[{result:null}]);assert.equal(a.calls.length,2);assert.deepEqual(a.records[0].observation.locks,[]);
});

const alteredStderr=change=>{const e=failure();e.cause.stderr=change(e.cause.stderr);return e;};
const unsafeFailures=[
 ['generic HTTP503',()=>new Error('OWN_RUN_UNAVAILABLE 503')],
 ['mapped BUSY',()=>new Error('OWN_RUN_BUSY')],
 ['transport exit2',()=>failure({code:2})],
 ['untyped exit',()=>failure({code:'3'})],
 ['timeout',()=>failure({killed:true})],
 ['signal',()=>failure({signal:'SIGTERM'})],
 ['missing stdout',()=>failure({stdout:undefined})],
 ['missing PID',()=>failure({stdout:''})],
 ['invalid PID',()=>failure({stdout:'{"qaConnectionPid":0}\n'})],
 ['additional stdout field',()=>failure({stdout:'{"qaConnectionPid":345,"result":{}}\n'})],
 ['capture returned before failure',()=>failure({stdout:'{"qaConnectionPid":345}\n{"id":"'+uid(9)+'"}\n'})],
 ['commit output',()=>failure({stdout:'{"qaConnectionPid":345}\nCOMMIT\n'})],
 ['business SQLSTATE',()=>alteredStderr(s=>s.replace('55P03','P0001'))],
 ['missing SQLSTATE',()=>alteredStderr(s=>s.replace('55P03: ',''))],
 ['unqualified relation',()=>alteredStderr(s=>s.replace('relation "'+schema+'.','relation "'))],
 ['foreign schema',()=>alteredStderr(s=>s.replaceAll(schema,'mc_qa_fixed_092_'+'f'.repeat(32)))],
 ['unobserved relation',()=>alteredStderr(s=>s.replace('relation "'+schema+'.native_employee_registration','relation "'+schema+'.own_payroll_run_capture'))],
 ['different RPC',()=>alteredStderr(s=>s.replace('function own_run_capture_v1','function own_run_complete_v1'))],
 ['nested function',()=>alteredStderr(s=>s+'PL/pgSQL function another_writer_v1(jsonb) line 4 at SQL statement\n')],
 ['missing context',()=>alteredStderr(s=>s.replace('CONTEXT:  SQL statement "'+lock+'"\n',''))],
 ['other lock mode',()=>alteredStderr(s=>s.replace('IN SHARE MODE NOWAIT','IN SHARE ROW EXCLUSIVE MODE NOWAIT'))],
 ['lock without NOWAIT',()=>alteredStderr(s=>s.replace(' MODE NOWAIT',' MODE'))],
 ['lock relation removed',()=>alteredStderr(s=>s.replace(schema+'.person_identity,',''))],
 ['uncertain later error',()=>alteredStderr(s=>s+'psql:<stdin>:4: FATAL:  connection lost\n')],
 ['commit context',()=>alteredStderr(s=>s.replace('CONTEXT:  SQL statement "'+lock+'"','CONTEXT:  SQL statement "COMMIT"'))]
];
for(const [label,make] of unsafeFailures)test('no retry for '+label,async()=>{
 const error=make(),a=setup({execute:async()=>{throw error;}});
 await assert.rejects(a.adapter.query(QA_RUN_CAPTURE_QUERY,args()),value=>value===error);
 assert.equal(a.calls.length,1);assert.equal(a.records.length,0);assert.equal(a.pauses.length,0);
});

test('exhaustion keeps the third refusal and never makes a fourth attempt',async()=>{
 const errors=[failure(),failure(),failure()],a=setup({execute:async(_,attempt)=>{throw errors[attempt-1];}});
 await assert.rejects(a.adapter.query(QA_RUN_CAPTURE_QUERY,args()),error=>error===errors[2]);
 assert.equal(a.calls.length,3);assert.deepEqual(a.pauses,[100,250]);assert.deepEqual(a.records.map(row=>row.willRetry),[true,true,false]);
});

test('diagnostic or recorder failure cannot turn a failed capture into a retry/success',async()=>{
 for(const extra of [{observe:async()=>{throw Error('observation unavailable');}},{observe:async()=>({...metadata(),query:'must not be recorded'})},{record:async()=>{throw Error('disk unavailable');}}]){
  const error=failure(),a=setup({...extra,execute:async()=>{throw error;}});
  await assert.rejects(a.adapter.query(QA_RUN_CAPTURE_QUERY,args()),value=>value===error);assert.equal(a.calls.length,1);assert.equal(a.pauses.length,0);
  assert.equal(a.records.at(-1).phase,'observation_failed');assert.equal(a.records.at(-1).willRetry,false);
 }
});

test('complete, business commands, attempt reads and non-exact SQL remain unchanged and single-attempt',async()=>{
 for(const query of [
  'SELECT public.own_run_complete_v1($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::text) AS result',
  'SELECT public.own_receipt_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',
  'SELECT public.own_run_attempt_v1($1::jsonb,$2::uuid) AS result',
  QA_RUN_CAPTURE_QUERY+';'
 ]){
  const values=args(),error=failure();let passed=0;
  const a=setup({query:async(q,v)=>{passed++;assert.equal(q,query);assert.equal(v,values);throw error;}});
  await assert.rejects(a.adapter.query(query,values),e=>e===error);assert.equal(passed,1);assert.equal(a.calls.length,0);assert.equal(a.pauses.length,0);
 }
});

test('source changes to transaction, psql ON_ERROR_STOP or result handling fail before execution',()=>{
 const options={read,schema,db:{run:async()=>assert.fail(),query:async()=>assert.fail()},record:()=>{}};
 for(const change of [source=>source.replace('BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN ISOLATION LEVEL REPEATABLE READ'),source=>source.replace('ON_ERROR_STOP=1','ON_ERROR_STOP=0'),source=>source.replace('; COMMIT;','; ROLLBACK;'),source=>source+'\n// changed transport\n'])assert.throws(()=>createOwnQaCaptureSql({...options,read:file=>change(read(file))}),/QA_CAPTURE_TRANSACTION_TRANSPORT_CHANGED/);
 for(const invalid of ['public','another_schema',schema+';COMMIT'])assert.throws(()=>createOwnQaCaptureSql({...options,schema:invalid}),/QA_CAPTURE_SCHEMA_INVALID/);
});

test('reviewed canonical participation capture retains the exact lock classified by QA',()=>{
 const batch=buildOwnPeriodParticipationSql({read,sourceCommit:'89d75705b368280aa8ec9ce134c81ef16ae1f4b9'});
 const capture=batch.changed.find(source=>/^CREATE (?:OR REPLACE )?FUNCTION public\.own_run_capture_v1\(/.test(source));
 assert.ok(capture);assert.equal(capture.split(lock.replaceAll(schema,'public')+';').length,2);
 assert.ok(capture.indexOf(lock.replaceAll(schema,'public'))<capture.indexOf('INSERT INTO public.own_payroll_run_capture'));
});

test('actual HTTP handler still requires the stale participation409 after a proved lock refusal',async()=>{
 const stale=new Error('psql:<stdin>:4: ERROR: P0001: PARTICIPATION_SOURCE_CHANGED');
 const a=setup({execute:async(_,attempt)=>{if(attempt===1)throw failure();throw stale;}});
 const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:RUN_CALCULATE}};
 const handler=createOwnRunHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>({email:'qa@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)}),getSql:()=>a.adapter,algorithmHash:()=>hash('c')});
 const res={setHeader(){},status(value){this.statusCode=value;return this;},json(value){this.value=value;return this;}};
 await handler({method:'POST',url:'/api/internal-own-payroll-run',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':uid(9)},body:JSON.stringify({operation:'calculate',payload:runCommand()})},res);
 assert.equal(res.statusCode,409);assert.equal(res.value.code,'OWN_RUN_SOURCE_IDENTITY_CHANGED');assert.equal(a.calls.length,2);assert.equal(a.calls[0],a.calls[1]);assert.equal(a.records.length,1);
 const source=read('scripts/verify-own-period-participation.mjs');
 assert.match(source,/staleCapture=await api\('run',\{body:[^\n]+expected:409\}\);assert\.equal\(staleCapture\.code,'OWN_RUN_SOURCE_IDENTITY_CHANGED'\)/);
});
