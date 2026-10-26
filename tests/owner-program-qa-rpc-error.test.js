// Synthetic transport outcomes only. Never invokes psql or an application server.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerProgramQaMissingAttemptProbe} from '../scripts/verify-municipal-owner-program.mjs';
import {createOwner190NativeOutcomeLatch} from '../scripts/lib/owner190-native-outcome.mjs';
import {createMunicipalOwnerProgramHandler} from '../api/internal-municipal-owner-program.js';
import {ownerAdoptionFixture} from './fixtures/municipal-owner-adoption-synthetic.js';

const key='abcdefab-cdef-4abc-8abc-abcdefabcdef',other='abcdefab-cdef-4abc-8abc-abcdefabcdee';
const text='SELECT public.municipal_owner_program_attempt_v1($1::jsonb,$2::uuid) AS result';
const request={phase:'http-negatives',kind:'owner',text,values:['{}',key]};
const token='01234567-89ab-4cde-8fab-0123456789ab';
function nativeResult(expected,change={},persisted={stdout:true,stderr:true,capture:true}){
 const latch=createOwner190NativeOutcomeLatch(),attempt=latch.begin({sql:'BEGIN;SELECT missing_attempt();ROLLBACK;',end:expected?.end??'COMMIT',expectedCode:expected?.code??null,token});
 latch.markInvoked(attempt);
 const result={status:3,signal:null,error:undefined,stdout:Buffer.from(attempt.marker+':BEGIN\nBEGIN\n'),stderr:Buffer.from('psql:synthetic.sql:1: ERROR: OWN_PROGRAM_NOT_FOUND\nCONTEXT: PRIVATE_SYNTHETIC_DETAIL\n'),...change};
 latch.recordReturn(attempt,result);
 try{const outcome=latch.evaluate(attempt,result,persisted);latch.complete(attempt,outcome);return{latch,value:outcome.value};}
 catch(error){latch.fail(attempt,error,'synthetic-capture');error.latch=latch;throw error;}
}

test('handler real recibe el error nativo esperado y responde404 sin publicar diagnósticos',async()=>{
 const probe=createOwnerProgramQaMissingAttemptProbe(),fixture=await ownerAdoptionFixture(),calls=[];let captured;
 fixture.access.principal.tenant.effectiveCapabilities.push('payroll.parameter.read','payroll.parameter.prepare');
 const handler=createMunicipalOwnerProgramHandler({requireAccess:()=>fixture.access,sessionFor:()=>fixture.session,getSql:()=>({query:async(sql,values)=>probe.query({...request,text:sql,values},expected=>{calls.push(expected);captured=nativeResult(expected);return captured.value;})})});
 const response={setHeader(){},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
 await probe.withMissingAttempt(key,async()=>{await handler({method:'GET',query:{resource:'attempt',key}},response);assert.equal(response.statusCode,404);assert.equal(response.body.ok,false);assert.equal(response.body.code,'OWN_PROGRAM_NOT_FOUND');});
 assert.equal(calls.length,1);assert.equal(calls[0].code,'OWN_PROGRAM_NOT_FOUND');assert.equal(calls[0].end,'ROLLBACK');assert.equal(Object.isFrozen(calls[0]),true);
 assert.equal(JSON.stringify(response.body).includes('PRIVATE_SYNTHETIC_DETAIL'),false);
 assert.equal(captured.latch.stopped,false);assert.equal(captured.latch.snapshot().state,'EXPECTED_SQL_ERROR');assert.equal(captured.latch.snapshot().rollbackObserved,false);assert.equal(captured.latch.snapshot().transactionTerminalObserved,false);
});

test('fase, tipo, RPC, aridad y clave diferentes nunca heredan la expectativa',async()=>{
 const probe=createOwnerProgramQaMissingAttemptProbe(),seen=[];
 assert.deepEqual(probe.query(request,expected=>{seen.push(expected);return'normal';}),[{result:'normal'}]);
 await probe.withMissingAttempt(key,async()=>{
  for(const change of [{phase:'recovery'},{kind:'program'},{text:'SELECT public.municipal_owner_program_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'},{values:['{}',other]},{values:['{}',key,'extra']},{values:null}]){
   assert.deepEqual(probe.query({...request,...change},expected=>{seen.push(expected);return'normal';}),[{result:'normal'}]);
  }
  assert.throws(()=>probe.query(request,expected=>nativeResult(expected).value),/OWN_PROGRAM_NOT_FOUND/);
 });
 assert.ok(seen.every(value=>value===null));
 assert.deepEqual(probe.query(request,expected=>{assert.equal(expected,null);return'recovered';}),[{result:'recovered'}]);
});

test('segunda coincidencia y armado reentrante fallan antes de otra invocación',async()=>{
 const probe=createOwnerProgramQaMissingAttemptProbe();let calls=0;
 await probe.withMissingAttempt(key,async()=>{
  await assert.rejects(probe.withMissingAttempt(other,async()=>{}),/NEGATIVE_REENTRANT/);
  assert.throws(()=>probe.query(request,expected=>{calls++;return nativeResult(expected).value;}),/OWN_PROGRAM_NOT_FOUND/);
  assert.throws(()=>probe.query(request,()=>{calls++;}),/ALREADY_CONSUMED/);
 });assert.equal(calls,1);
});

test('un404 anterior al RPC no acredita el negativo y el contexto se retira también al fallar',async()=>{
 const probe=createOwnerProgramQaMissingAttemptProbe();
 await assert.rejects(probe.withMissingAttempt(key,async()=>({status:404})),/NEGATIVE_NOT_OBSERVED/);
 const failure=Error('raw persistence failed');await assert.rejects(probe.withMissingAttempt(key,async()=>{throw failure;}),error=>error===failure);
 assert.deepEqual(probe.query(request,expected=>{assert.equal(expected,null);return'ok';}),[{result:'ok'}]);
});

test('éxito inesperado, otro error, timeout y captura incompleta conservan UNCERTAIN',async()=>{
 for(const [change,persisted,pattern] of [
  [{status:0,stdout:Buffer.from('MC_OWNER190_'+token.replaceAll('-','')+':BEGIN\nBEGIN\n{}\nROLLBACK\nMC_OWNER190_'+token.replaceAll('-','')+':END\n'),stderr:Buffer.alloc(0)},undefined,/EXPECTED_ERROR_NOT_SEEN/],
  [{stderr:Buffer.from('ERROR: OWN_PROGRAM_FORBIDDEN\n')},undefined,/EXPECTED_ERROR_MISSING/],
  [{error:Object.assign(Error('timeout'),{code:'ETIMEDOUT'})},undefined,/timeout/],
  [{}, {stdout:true,stderr:false,capture:true},/RAW_NOT_PERSISTED/]
 ]){
  const probe=createOwnerProgramQaMissingAttemptProbe();let failure;
  await assert.rejects(probe.withMissingAttempt(key,async()=>{try{probe.query(request,expected=>nativeResult(expected,change,persisted).value);}catch(error){failure=error;throw error;}}));
  assert.match(failure.message,pattern);assert.equal(failure.latch.stopped,true);assert.equal(failure.latch.snapshot().state,'UNCERTAIN');
  assert.throws(()=>failure.latch.begin({sql:'BEGIN;SELECT 1;COMMIT;',end:'COMMIT',token}),/SQL_LATCHED/);
 }
});

test('UUID mayúsculo se rechaza en el handler sin RPC ni descriptor activo',async()=>{
 const fixture=await ownerAdoptionFixture();fixture.access.principal.tenant.effectiveCapabilities.push('payroll.parameter.read','payroll.parameter.prepare');let queries=0;
 const handler=createMunicipalOwnerProgramHandler({requireAccess:()=>fixture.access,sessionFor:()=>fixture.session,getSql:()=>({query:()=>{queries++;throw Error('must not run');}})});
 const response={setHeader(){},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
 await handler({method:'GET',query:{resource:'attempt',key:key.toUpperCase()}},response);assert.equal(response.statusCode,400);assert.equal(queries,0);
});
