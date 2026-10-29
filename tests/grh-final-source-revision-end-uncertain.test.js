// PROPOSED by Claude (source only; not run by Claude). Target: tests/grh-final-source-revision-end-uncertain.test.js
// E-R2: an END (COMMIT/ROLLBACK) without answer is UNCERTAIN. Synthetic client only; no database, no backup.
import test from 'node:test';
import assert from 'node:assert/strict';
import {finalRevisionPackage,finalRevisionClient,finalRevisionTarget as target} from './fixtures/final-source-revision-synthetic.js';
import {executeFinalSourceRevision,uncertainEndError,FINAL_REVISION_UNCERTAIN_EVIDENCE_VERSION} from '../scripts/prepare-grh-final-source-revision.mjs';

const pack=await finalRevisionPackage();
const lease=options=>{const client=finalRevisionClient(pack,options),releases=[];client.release=e=>releases.push(e);return{client,releases};};
const run=(client,options={})=>executeFinalSourceRevision({connect:async()=>client,prepared:pack,target,expectedPackageSha256:pack.payloadSha256,installSchema:true,...options});
const sqlAfter=(client,statement)=>client.calls.slice(client.calls.findIndex(c=>c.text===statement)+1);

test('COMMIT sin respuesta: UNCERTAIN con evidencia, cero SQL posterior, conexión descartada, sin reintento',async()=>{
 const {client,releases}=lease({state:{installed:true},fail:sql=>sql==='COMMIT'});let connections=0;
 const error=await run(client,{commit:true,connect:async()=>{connections++;return client;}}).then(()=>null,e=>e);
 assert.equal(error.code,'GRH_FINAL_REVISION_COMMIT_UNCONFIRMED');assert.equal(error.outcomeUnknown,true);assert.equal(error.noFurtherSql,true);assert.equal(error.retried,false);assert.equal(error.connectionDiscarded,true);
 assert.deepEqual(sqlAfter(client,'COMMIT'),[],'nothing after the ambiguous END');assert.equal(connections,1);
 assert.equal(releases.length,1);assert.match(releases[0].message,/CONNECTION_DISCARDED/);
 const e=error.evidence;assert.ok(Object.isFrozen(e));assert.equal(e.version,FINAL_REVISION_UNCERTAIN_EVIDENCE_VERSION);
 assert.equal(e.statement,'COMMIT');assert.equal(e.phase,'end');assert.equal(e.commitRequested,true);assert.equal(e.packageSha256,pack.payloadSha256);
 assert.equal(e.sourceProfile,pack.candidate.profileId);assert.match(e.revisionId,/^[0-9a-f-]{36}$/);assert.match(e.endSentAt,/^\d{4}-\d{2}-\d{2}T/);assert.match(e.beganAt,/^\d{4}-\d{2}-\d{2}T/);
 assert.equal(e.cause,'Error');
 for(const key of Object.keys(e))assert.ok(!['lines','statements','rows','legajo','amount'].includes(key),'no rows in evidence');
 assert.equal(JSON.stringify(e).includes('"lines"'),false);
});
test('ROLLBACK de ensayo sin respuesta: UNCERTAIN, un solo ROLLBACK enviado, conexión descartada, no se declara ensayo revertido',async()=>{
 const {client,releases}=lease({state:{installed:true},fail:sql=>sql==='ROLLBACK'});
 const error=await run(client).then(()=>null,e=>e);
 assert.equal(error.code,'GRH_FINAL_REVISION_END_UNCONFIRMED');assert.equal(error.outcomeUnknown,true);assert.equal(error.noFurtherSql,true);
 assert.equal(client.calls.filter(c=>c.text==='ROLLBACK').length,1);assert.deepEqual(sqlAfter(client,'ROLLBACK'),[]);
 assert.equal(error.evidence.statement,'ROLLBACK');assert.equal(error.evidence.commitRequested,false);
 assert.equal(releases.length,1);assert.match(releases[0].message,/CONNECTION_DISCARDED/);
});
test('fallo ANTES del END: un ROLLBACK, conexión reutilizable, recibos y códigos históricos sin reclasificar',async()=>{
 const {client,releases}=lease({state:{installed:true},fail:sql=>sql.includes('final-revision:delta */')});
 await assert.rejects(run(client,{commit:true}),/synthetic interrupted query/);
 assert.equal(client.calls.at(-1).text,'ROLLBACK');assert.equal(client.calls.filter(c=>c.text==='ROLLBACK').length,1);assert.deepEqual(releases,[undefined]);
// An ambiguous cleanup END has its own causal case below; confirmed cleanup preserves the original error.
 // Successful paths keep their receipts exactly.
 const ok=lease({state:{installed:true}});const saved=await run(ok.client,{commit:true});assert.equal(saved.maintenanceOutcome,'revision_saved');assert.equal(saved.committed,true);
 const rehearsal=lease({state:{installed:true}});const rolled=await run(rehearsal.client);assert.equal(rolled.maintenanceOutcome,'rehearsal_rolled_back');assert.equal(rolled.rolledBack,true);
});
test('fallo antes del END y ROLLBACK de limpieza sin respuesta: UNCERTAIN cleanup-end, cero SQL posterior y sin reintento',async()=>{
 const {client,releases}=lease({state:{installed:true},fail:sql=>sql.includes('final-revision:delta */')||sql==='ROLLBACK'});let connections=0;
 const error=await run(client,{commit:true,connect:async()=>{connections++;return client;}}).then(()=>null,e=>e);
 assert.equal(error.code,'GRH_FINAL_REVISION_END_UNCONFIRMED');assert.equal(error.outcomeUnknown,true);assert.equal(error.noFurtherSql,true);
 assert.equal(error.retried,false);assert.equal(error.connectionDiscarded,true);assert.equal(connections,1);
 assert.equal(client.calls.filter(c=>c.text==='ROLLBACK').length,1);assert.equal(client.calls.filter(c=>c.text==='COMMIT').length,0);
 assert.equal(client.calls.at(-1).text,'ROLLBACK');assert.deepEqual(sqlAfter(client,'ROLLBACK'),[]);
 assert.equal(releases.length,1);assert.match(releases[0].message,/CONNECTION_DISCARDED/);
 const e=error.evidence;assert.ok(Object.isFrozen(e));assert.equal(e.phase,'cleanup-end');assert.equal(e.statement,'ROLLBACK');
 assert.equal(e.commitRequested,true);assert.equal(e.originalErrorCodeOrName,'Error');assert.equal(e.cause,'Error');
 assert.equal(e.packageSha256,pack.payloadSha256);assert.equal(e.sourceProfile,pack.candidate.profileId);
 assert.match(e.beganAt,/^\d{4}-\d{2}-\d{2}T/);assert.match(e.endSentAt,/^\d{4}-\d{2}-\d{2}T/);
 assert.equal(JSON.stringify(e).includes('synthetic interrupted query'),false);
});
test('uncertainEndError: códigos por sentencia, evidencia congelada y causa acotada sin mensaje nominal',()=>{
 const commit=uncertainEndError('COMMIT',{phase:'end'},Object.assign(new Error('socket hang up'),{code:'ECONNRESET'}));
 assert.equal(commit.code,'GRH_FINAL_REVISION_COMMIT_UNCONFIRMED');assert.equal(commit.evidence.cause,'ECONNRESET');assert.ok(Object.isFrozen(commit.evidence));
 const rollback=uncertainEndError('ROLLBACK',{phase:'end'},new Error('x'.repeat(500)));
 assert.equal(rollback.code,'GRH_FINAL_REVISION_END_UNCONFIRMED');assert.equal(rollback.evidence.cause,'Error');
 assert.equal(uncertainEndError('COMMIT',{},undefined).evidence.cause,'');
});

test('uncertainEndError nunca escribe message y rechaza code/name libres o fuera del límite de 64 caracteres',()=>{
 const sentinel='PRIVATE_MESSAGE_ONLY_SENTINEL / source row';
 for(const cause of [{message:sentinel},{code:'CODE WITH SPACES',name:'name\nwith newline',message:sentinel},
  {code:'X'.repeat(65),name:'N'.repeat(65),message:sentinel}]){
  const error=uncertainEndError('ROLLBACK',{phase:'cleanup-end'},cause);
  assert.equal(error.evidence.cause,'');assert.equal(JSON.stringify(error.evidence).includes(sentinel),false);
 }
 for(const [cause,expected]of[[{code:'23505',message:sentinel},'23505'],[{code:'ECONNRESET',message:sentinel},'ECONNRESET'],
  [{code:'bad code',name:'AbortError',message:sentinel},'AbortError'],[{name:'TypeError',message:sentinel},'TypeError']]){
  const error=uncertainEndError('COMMIT',{phase:'end'},cause);assert.equal(error.evidence.cause,expected);
  assert.equal(JSON.stringify(error.evidence).includes(sentinel),false);
 }
});
