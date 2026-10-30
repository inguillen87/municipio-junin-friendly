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

const seedSchema='mc_qa_fixed_092_'+'a'.repeat(32);
const seedFile='C:/synthetic/verification/notice-profile/003.sql';
const seedSource=[
 'BEGIN;',
 'CREATE SCHEMA '+seedSchema+';',
 'SET LOCAL search_path='+seedSchema+',pg_catalog,public,pg_temp;',
 'CREATE TABLE internal_users(id integer);',
 'ALTER TABLE internal_users DROP CONSTRAINT IF EXISTS internal_users_active_password_ck;',
 'CREATE TABLE '+seedSchema+'.native_employment_catalog_proposal(id integer);',
 'DROP TRIGGER IF EXISTS native_employment_catalog_proposal_immutable ON '+seedSchema+'.native_employment_catalog_proposal;',
 'CREATE TABLE '+seedSchema+'.native_employment_catalog_review(id integer);',
 'DROP TRIGGER IF EXISTS native_employment_catalog_review_immutable ON '+seedSchema+'.native_employment_catalog_review;',
 'COMMIT;'
].join('\n');
// Hard-coded expected lines7/9/11 observe the real two-line frame offset;
// these tests deliberately do not call the implementation's line calculator.
const seedMessages=[
 'psql:'+seedFile+':7: NOTICE:  constraint "internal_users_active_password_ck" of relation "internal_users" does not exist, skipping',
 'psql:'+seedFile+':9: NOTICE:  trigger "native_employment_catalog_proposal_immutable" for relation "'+seedSchema+'.native_employment_catalog_proposal" does not exist, skipping',
 'psql:'+seedFile+':11: NOTICE:  trigger "native_employment_catalog_review_immutable" for relation "'+seedSchema+'.native_employment_catalog_review" does not exist, skipping'
];
function profiledSeed(eol='\n',extra={}){
 const s=scenario({sql:seedSource,noticeProfile:{version:'canonical-seed-drop-if-exists.v1',schema:seedSchema,sqlFile:seedFile},...extra});
 s.result.stderr=Buffer.from(seedMessages.join(eol)+eol);
 return s;
}

test('seed NOTICE exactos pasan con LF o CRLF; mantiene RAW, SQL y latch hasta complete',()=>{
 for(const eol of ['\n','\r\n']){
  const s=profiledSeed(eol),before=Buffer.from(s.result.stderr),o=read(s);
  assert.deepEqual(s.result.stderr,before);
  assert.equal(s.attempt.framedSql,'\\set QUIET off\n\\echo '+s.attempt.marker+':BEGIN\n'+seedSource+'\n\\echo '+s.attempt.marker+':END\n');
  assert.equal(o.receipt.state,'TERMINAL_FRAME');assert.equal(o.receipt.observedEnd,'COMMIT');
  assert.deepEqual(o.receipt.noticeProfile,{version:'canonical-seed-drop-if-exists.v1',schema:seedSchema,sqlFile:seedFile,expectedCount:3,sourceLines:[7,9,11]});
  assert.equal(o.receipt.noticeDiagnostics.count,3);
  assert.deepEqual(o.receipt.noticeDiagnostics.sourceLines,[7,9,11]);
  assert.equal(o.receipt.noticeDiagnostics.sqlSha256,o.receipt.sqlSha256);
  assert.equal(o.receipt.noticeDiagnostics.stderrSha256,o.receipt.stderr.sha256);
  assert.equal(o.receipt.stderr.bytes,before.length);assert.equal(o.receipt.rawPersisted,true);
  assert.equal(o.receipt.descriptorClosureEstablished,false);assert.equal(o.receipt.protocolEmpiricallyVerified,false);
  assert.equal(s.latch.stopped,true);s.latch.complete(s.attempt,o);assert.equal(s.latch.stopped,false);
 }
});

test('sin perfil los mismos NOTICE siguen rechazados; stderr vacío normal no cambia',()=>{
 const s=scenario({sql:seedSource});s.result.stderr=Buffer.from(seedMessages.join('\n')+'\n');uncertain(s,/STDERR_NONEMPTY/);
 const ordinary=scenario(),o=read(ordinary);assert.equal(o.receipt.observedEnd,'COMMIT');assert.equal(Object.hasOwn(o.receipt,'noticeDiagnostics'),false);
});

test('seed rechaza NOTICE desconocidos, objeto distinto, duplicados, ruta/línea/schema/orden y WARNING',()=>{
 const exact=seedMessages.join('\n')+'\n';
 const variants=[
  'NOTICE: unknown\n',
  exact.replace('internal_users_active_password_ck','other_constraint'),
  exact+seedMessages[2]+'\n',
  exact.replace(seedFile,seedFile.replace('003.sql','004.sql')),
  exact.replace(':7: NOTICE:',':8: NOTICE:'),
  exact.replace(seedSchema,'mc_qa_fixed_092_'+'b'.repeat(32)),
  [seedMessages[1],seedMessages[0],seedMessages[2]].join('\n')+'\n',
  exact+'WARNING: synthetic warning\n',
  exact+'ERROR: unexpected failure\n',
  exact+'FATAL: unexpected failure\n',
  exact+'PANIC: unexpected failure\n'
 ];
 for(const stderr of variants){const s=profiledSeed();s.result.stderr=Buffer.from(stderr);uncertain(s,/NOTICE_STDERR_MISMATCH/);}
});

test('seed rechaza avisos faltantes, bloque vacío, truncamiento y saltos mezclados',()=>{
 const exact=seedMessages.join('\n')+'\n';
 for(const stderr of ['',seedMessages.slice(0,2).join('\n')+'\n',exact.slice(0,-1),exact.replace('\n','\r\n'),exact+'\n']){
  const s=profiledSeed();s.result.stderr=Buffer.from(stderr);uncertain(s,/NOTICE_STDERR_MISMATCH/);
 }
});

test('NOTICE exactos no compensan frame truncado, terminal distinto, señal ni timeout',()=>{
 const missing=profiledSeed();missing.result.stdout=Buffer.from(missing.attempt.marker+':BEGIN\nBEGIN\n{}\nCOMMIT\n');uncertain(missing,/FRAME_END/);
 const wrong=profiledSeed();wrong.result.stdout=Buffer.from(wrong.attempt.marker+':BEGIN\nBEGIN\n{}\nROLLBACK\n'+wrong.attempt.marker+':END\n');uncertain(wrong,/TERMINAL/);
 const signaled=profiledSeed();signaled.result.signal='SIGTERM';uncertain(signaled,/SIGNAL/);
 const timed=profiledSeed();timed.result.error=Object.assign(Error('timed out'),{code:'ETIMEDOUT'});uncertain(timed,/timed out/);
});

test('tamper del stderr perfilado después de recordReturn se detecta antes de clasificar',()=>{
 const s=profiledSeed();s.latch.recordReturn(s.attempt,s.result);s.result.stderr[0]^=1;
 assert.throws(()=>s.latch.evaluate(s.attempt,s.result,{stdout:true,stderr:true,capture:true}),/STDERR_CHANGED/);
 s.latch.fail(s.attempt,Error('tampered diagnostic bytes'),'capture');assert.equal(s.latch.stopped,true);
 assert.throws(()=>s.latch.begin({sql,end:'COMMIT',token}),/SQL_LATCHED/);
});

test('perfil no permite completar una evaluación vieja tras envenenar el latch',()=>{
 const s=profiledSeed(),o=read(s);s.latch.fail(s.attempt,Error('receipt write failed'),'outcome-persistence');const first=s.latch.snapshot();
 assert.throws(()=>s.latch.complete(s.attempt,o),/SQL_LATCHED/);
 assert.throws(()=>s.latch.evaluate(s.attempt,s.result,{stdout:true,stderr:true,capture:true}),/SQL_LATCHED/);
 assert.deepEqual(s.latch.snapshot(),first);assert.equal(s.latch.stopped,true);
});

test('perfil exige anchors únicos, schema coherente, archivo absoluto y campos finitos antes de invocar',()=>{
 const profile={version:'canonical-seed-drop-if-exists.v1',schema:seedSchema,sqlFile:seedFile};
 const cases=[
  {sql:seedSource,noticeProfile:{...profile,version:'generic-notice.v1'}},
  {sql:seedSource,noticeProfile:{...profile,sqlFile:'003.sql'}},
  {sql:seedSource,noticeProfile:{...profile,sqlFile:seedFile.replace('/003.sql','/../003.sql')}},
  {sql:seedSource,noticeProfile:{...profile,schema:'public'}},
  {sql:seedSource,noticeProfile:{...profile,schema:'mc_qa_fixed_092_'+'b'.repeat(32)}},
  {sql:seedSource,noticeProfile:{...profile,messages:seedMessages}},
  {sql:seedSource+'\nALTER TABLE internal_users DROP CONSTRAINT IF EXISTS internal_users_active_password_ck;',noticeProfile:profile},
  {sql:seedSource.replace('DROP TRIGGER IF EXISTS native_employment_catalog_review_immutable','DROP TRIGGER IF EXISTS other_trigger'),noticeProfile:profile},
  {sql:seedSource,noticeProfile:profile,end:'ROLLBACK'},
  {sql:seedSource,noticeProfile:profile,expectedCode:'EXPECTED_REJECTION'},
  {sql:seedSource,noticeProfile:profile,fullJson:true}
 ];
 for(const value of cases){
  const latch=createOwner190NativeOutcomeLatch();
  assert.throws(()=>latch.begin({end:'COMMIT',token,...value}),/NOTICE_/);
  assert.equal(latch.stopped,false);assert.deepEqual(latch.snapshot(),{state:'IDLE',attempted:false,returned:false});
 }
});

test('el perfil finito sólo se activa en la única llamada del seed, antes de escribir su archivo',async()=>{
 const {readFileSync}=await import('node:fs'),source=readFileSync(new URL('../scripts/verify-municipal-owner-program.mjs',import.meta.url),'utf8');
 assert.equal((source.match(/seedNotices:true/g)||[]).length,1);
 assert.match(source,/phase='seed';run\(tx\(\[qa.seed\]\),undefined,\{seedNotices:true\}\)/);
 const start=source.indexOf(' const run='),prefix=source.slice(start,source.indexOf('  try{',start));
 assert.match(prefix,/seedNotices=false/);assert.ok(prefix.indexOf('const file=')<prefix.indexOf('nativeOutcome.begin('));assert.equal(prefix.includes('fs.writeFileSync'),false);
});
