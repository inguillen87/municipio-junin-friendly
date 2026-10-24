// Proposed synthetic unit cases only: importing this file never executes psql.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwner190NativeOutcomeLatch} from '../scripts/lib/owner190-native-outcome.mjs';

const token='01234567-89ab-4cde-8fab-0123456789ab',sql="BEGIN;SELECT '{\"ok\":true}';COMMIT;";
function scenario(options={}){
 const latch=createOwner190NativeOutcomeLatch(),attempt=latch.begin({sql,end:'COMMIT',token,...options});latch.markInvoked(attempt);
 const result={status:0,signal:null,error:undefined,stdout:Buffer.from(attempt.marker+':BEGIN\nBEGIN\n{"ok":true}\nCOMMIT\n'+attempt.marker+':END\n'),stderr:Buffer.alloc(0)};
 return{latch,attempt,result};
}
function read(s){s.latch.recordReturn(s.attempt,s.result);return s.latch.evaluate(s.attempt,s.result,{stdout:true,stderr:true,capture:true});}
function uncertain(s,pattern){let error;try{read(s);}catch(cause){error=cause;}assert.ok(error);assert.match(error.message,pattern);s.latch.fail(s.attempt,error,'synthetic-interpretation');assert.equal(s.latch.stopped,true);assert.throws(()=>s.latch.begin({sql,end:'COMMIT',token}),/SQL_LATCHED/);return s.latch.snapshot();}

test('preserva SQL original íntegro, 20/40MiB y latch desde antes de la invocación',()=>{
 const latch=createOwner190NativeOutcomeLatch(),a=latch.begin({sql,end:'COMMIT',token});assert.ok(a.framedSql.includes('\n'+sql+'\n'));assert.equal(a.maxBuffer,20*1024*1024);assert.equal(latch.snapshot().attempted,false);assert.equal(latch.stopped,true);assert.throws(()=>latch.begin({sql,end:'COMMIT',token}),/SQL_LATCHED/);
 latch.fail(a,Error('sql file write failed'),'before-spawn');assert.equal(latch.snapshot().returned,false);assert.equal(latch.snapshot().state,'UNCERTAIN');
 const b=createOwner190NativeOutcomeLatch().begin({sql,end:'ROLLBACK',token,fullJson:true});assert.equal(b.maxBuffer,40*1024*1024);
});
test('frame COMMIT completo precede interpretación JSON; recibo no inventa cierre OS',()=>{const s=scenario(),o=read(s);assert.deepEqual(o.value,{ok:true});assert.equal(o.receipt.observedEnd,'COMMIT');assert.equal(s.latch.stopped,true);s.latch.complete(s.attempt,o);assert.equal(s.latch.stopped,false);assert.equal(s.latch.snapshot().descriptorClosureEstablished,false);assert.equal(s.latch.snapshot().protocolEmpiricallyVerified,false);});
test('frame ROLLBACK explícito se distingue del error SQL esperado',()=>{const s=scenario({end:'ROLLBACK'});s.result.stdout=Buffer.from(s.attempt.marker+':BEGIN\nBEGIN\n[]\nROLLBACK\n'+s.attempt.marker+':END\n');const o=read(s);assert.equal(o.receipt.rollbackObserved,true);assert.deepEqual(o.value,[]);});
test('status3 esperado no afirma ROLLBACK observado',()=>{const s=scenario({expectedCode:'EXPECTED_REJECTION'});s.result.status=3;s.result.stdout=Buffer.from(s.attempt.marker+':BEGIN\nBEGIN\n');s.result.stderr=Buffer.from('psql:case.sql:1: ERROR: EXPECTED_REJECTION\nCONTEXT: synthetic case\n');const o=read(s);assert.equal(o.receipt.state,'EXPECTED_SQL_ERROR');assert.equal(o.receipt.rollbackObserved,false);assert.equal(o.receipt.transactionTerminalObserved,false);assert.equal(o.value.status,3);});
test('último JSON con status0 sin terminal/frame no acredita la transacción',()=>{const s=scenario();s.result.stdout=Buffer.from('{"ok":true}\n');uncertain(s,/FRAME_BEGIN/);});
test('frame truncado después de JSON o del terminal conserva incertidumbre',()=>{for(const suffix of['{"ok":true}\n','{"ok":true}\nCOMMIT\n']){const s=scenario();s.result.stdout=Buffer.from(s.attempt.marker+':BEGIN\nBEGIN\n'+suffix);uncertain(s,/FRAME_END/);}});
test('terminal inesperado, doble terminal o salida posterior no se acepta',()=>{for(const body of['ROLLBACK\n','COMMIT\nCOMMIT\n','COMMIT\nextra\n']){const s=scenario();s.result.stdout=Buffer.from(s.attempt.marker+':BEGIN\nBEGIN\n{}\n'+body+s.attempt.marker+':END\n');uncertain(s,/TERMINAL/);}});
test('warning con exit0 conserva RAW y envenena el runner',()=>{const s=scenario();s.result.stderr=Buffer.from('WARNING: synthetic warning\n');uncertain(s,/STDERR_NONEMPTY/);});
test('status3 con error o señal sigue incierto aunque coincida el código SQL',()=>{for(const change of[{error:Object.assign(Error('timed out'),{code:'ETIMEDOUT'})},{error:Object.assign(Error('capture overflow'),{code:'ENOBUFS'})},{signal:'SIGTERM'}]){const s=scenario({expectedCode:'EXPECTED_REJECTION'});Object.assign(s.result,{status:3,stdout:Buffer.from(s.attempt.marker+':BEGIN\nBEGIN\n'),stderr:Buffer.from('ERROR: EXPECTED_REJECTION\n')},change);uncertain(s,/timed out|capture overflow|SIGNAL/);}});
test('status3 con COMMIT o ROLLBACK anterior no se disfraza de error esperado',()=>{for(const tag of['COMMIT','ROLLBACK']){const s=scenario({expectedCode:'EXPECTED_REJECTION'});Object.assign(s.result,{status:3,stdout:Buffer.from(s.attempt.marker+':BEGIN\nBEGIN\n'+tag+'\n'),stderr:Buffer.from('ERROR: EXPECTED_REJECTION\n')});uncertain(s,/ERROR_AFTER_TERMINAL/);}});
test('status3 inesperado, diagnóstico ajeno o warning no permiten continuar',()=>{for(const diagnostic of['ERROR: OTHER_REJECTION\n','ERROR: EXPECTED_REJECTION\nWARNING: warning\n','ERROR: EXPECTED_REJECTION\nERROR: second\n']){const s=scenario({expectedCode:'EXPECTED_REJECTION'});Object.assign(s.result,{status:3,stdout:Buffer.from(s.attempt.marker+':BEGIN\nBEGIN\n'),stderr:Buffer.from(diagnostic)});uncertain(s,/EXPECTED_ERROR_MISSING|UNEXPECTED_DIAGNOSTIC|EXPECTED_ERROR_COUNT/);}const s=scenario();s.result.status=3;uncertain(s,/EXIT_INVALID/);});
test('canal ausente nunca se convierte en Buffer vacío',()=>{const s=scenario();s.result.stderr=null;const r=uncertain(s,/CHANNEL_MISSING/);assert.deepEqual(r.stderr,{available:false,bytes:null,sha256:null});});
test('fallo de persistencia RAW bloquea antes de interpretar o completar',()=>{const s=scenario();s.latch.recordReturn(s.attempt,s.result);assert.throws(()=>s.latch.evaluate(s.attempt,s.result,{stdout:true,stderr:false,capture:true}),/RAW_NOT_PERSISTED/);s.latch.fail(s.attempt,Error('write failed'),'raw-persistence');assert.equal(s.latch.stopped,true);assert.equal(s.latch.snapshot().rawPersisted,false);});
test('JSON inválido, UTF8 inválido y salto terminal incompleto quedan inciertos',()=>{for(const text of['{bad}\nCOMMIT\n',null]){const s=scenario();s.result.stdout=text===null?Buffer.from([0xff,0x0a]):Buffer.from(s.attempt.marker+':BEGIN\nBEGIN\n'+text+s.attempt.marker+':END\n');uncertain(s,/JSON|Unexpected|position|UTF|encoded/i);}const s=scenario();s.result.stdout=s.result.stdout.subarray(0,-1);uncertain(s,/UNTERMINATED/);});
test('canales modificados tras el recibo y frame duplicado se rechazan',()=>{const s=scenario();s.latch.recordReturn(s.attempt,s.result);s.result.stdout[0]=0;assert.throws(()=>s.latch.evaluate(s.attempt,s.result,{stdout:true,stderr:true,capture:true}),/STDOUT_CHANGED/);s.latch.fail(s.attempt,Error('changed'),'capture');const t=scenario();t.result.stdout=Buffer.from(t.attempt.marker+':BEGIN\n'+t.result.stdout);uncertain(t,/FRAME_DUPLICATE/);});
test('latch permanece pendiente si falla persistir el recibo final',()=>{const s=scenario(),o=read(s);assert.equal(s.latch.stopped,true);s.latch.fail(s.attempt,Error('outcome receipt write failed'),'outcome-persistence');assert.equal(s.latch.snapshot().state,'UNCERTAIN');assert.throws(()=>s.latch.begin({sql,end:'COMMIT',token}),/SQL_LATCHED/);assert.equal(o.receipt.transactionTerminalObserved,true);});

test('owner190 regression: missing SQL BEGIN, duplicado o fuera de posición se rechaza en éxito y error3',()=>{
 for(const expectedCode of[null,'EXPECTED_REJECTION'])for(const prefix of['','BEGIN\nBEGIN\n','SET\nBEGIN\n']){
  const s=scenario({expectedCode});s.result.stdout=Buffer.from(s.attempt.marker+':BEGIN\n'+prefix+(expectedCode===null?'{}\nCOMMIT\n'+s.attempt.marker+':END\n':''));
  if(expectedCode!==null){s.result.status=3;s.result.stderr=Buffer.from('ERROR: EXPECTED_REJECTION\n');}
  uncertain(s,/SQL_BEGIN_POSITION|SQL_BEGIN_COUNT/);
 }
});
test('owner190 regression: stale complete after fail y demás transiciones no reemplazan UNCERTAIN',()=>{
 const s=scenario(),outcome=read(s);s.latch.fail(s.attempt,Error('primary persistence failure'),'outcome-persistence');const first=s.latch.snapshot();
 for(const transition of[()=>s.latch.complete(s.attempt,outcome),()=>s.latch.evaluate(s.attempt,s.result,{stdout:true,stderr:true,capture:true}),()=>s.latch.markInvoked(s.attempt),()=>s.latch.recordReturn(s.attempt,s.result)]){assert.throws(transition,/SQL_LATCHED/);assert.deepEqual(s.latch.snapshot(),first);}
 assert.equal(s.latch.stopped,true);assert.throws(()=>s.latch.begin({sql,end:'COMMIT',token}),/SQL_LATCHED/);
});
test('owner190 regression: first failure preservation con causas secundarias separadas',()=>{
 const s=scenario();s.latch.fail(s.attempt,Object.assign(Error('primary capture failure'),{code:'ENOBUFS'}),'capture');const first=s.latch.snapshot();
 const second=s.latch.fail(s.attempt,Error('secondary journal failure'),'journal');assert.deepEqual(second.failure,first.failure);assert.equal(second.failurePhase,first.failurePhase);assert.equal(second.state,'UNCERTAIN');assert.deepEqual(second.secondaryFailures,[{phase:'journal',failure:{name:'Error',message:'secondary journal failure'}}]);assert.equal(s.latch.stopped,true);
});
