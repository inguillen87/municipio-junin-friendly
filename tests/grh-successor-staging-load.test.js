import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {syntheticOperationalPackage,syntheticOperationalResults,target} from './fixtures/successor-operational-synthetic.js';
import {planSuccessorOperationalRead,evaluateSuccessorOperationalRead,planSuccessorStagingRead,evaluateSuccessorStagingRead} from '../scripts/lib/grh-successor-operational-read.mjs';
import {stageSuccessorWithinTransaction} from '../scripts/lib/grh-successor-staging-load.mjs';
import {executeSuccessorStage,parseSuccessorStageArgs} from '../scripts/stage-grh-successor.mjs';
const pack=await syntheticOperationalPackage();
function stagingResults(){const r=syntheticOperationalResults(pack);for(const n of [0,r.length-1])Object.assign(r[n][0].observation,{readOnly:'off',isolation:'serializable'});return r;}
test('la revalidación de carga es otro contrato, no una conversión del informe read-only',()=>{
 const read=planSuccessorOperationalRead(pack,target),write=planSuccessorStagingRead(pack,target);
 assert.deepEqual(write.options,{readOnly:false,isolationLevel:'Serializable'});
 assert.throws(()=>evaluateSuccessorOperationalRead(write,stagingResults()),{code:'SUCCESSOR_READ_RESULT_INVALID'});
 assert.throws(()=>evaluateSuccessorStagingRead(read,syntheticOperationalResults(pack)),{code:'SUCCESSOR_READ_RESULT_INVALID'});
 const result=evaluateSuccessorStagingRead(write,stagingResults());assert.equal(result.version,'grh-successor-staging-revalidation.v1');assert.equal(result.readOnly,false);assert.equal(result.writeStatements,0);assert.equal(result.publicationAuthorized,false);
});
for(const [readOnly,isolation]of [['on','serializable'],['off','read committed'],['off','repeatable read']])test('la carga rechaza la sesión '+readOnly+' / '+isolation,()=>{
 const result=stagingResults();result[0][0].observation.readOnly=readOnly;result[0][0].observation.isolation=isolation;
 assert.throws(()=>evaluateSuccessorStagingRead(planSuccessorStagingRead(pack,target),result),{code:'SUCCESSOR_READ_TARGET_MISMATCH'});
});
test('un hash diferente falla antes de abrir conexión o transacción',async()=>{
 let connected=false;await assert.rejects(executeSuccessorStage({prepared:pack,target,expectedPackageSha256:'0'.repeat(64),connect:async()=>{connected=true;}}),{code:'SUCCESSOR_STAGE_PACKAGE_CHANGED'});assert.equal(connected,false);
});
test('cancelar antes de iniciar no emite consultas ni abre conexión',async()=>{
 const abort=new AbortController();abort.abort();let called=false;await assert.rejects(executeSuccessorStage({prepared:pack,target,expectedPackageSha256:pack.payloadSha256,signal:abort.signal,connect:async()=>{called=true;}}),e=>e.name==='AbortError');assert.equal(called,false);
});
const args=['--target',path.resolve('target.json'),'--baseline-core',path.resolve('core-before'),'--candidate-core',path.resolve('core-after'),'--baseline-curated',path.resolve('curated-before'),'--candidate-curated',path.resolve('curated-after'),'--expect-package',pack.payloadSha256];
test('el comando exige elegir ensayo o carga y conserva instalación como opción explícita',()=>{
 assert.equal(parseSuccessorStageArgs([...args,'--rehearse']).rehearse,true);
 assert.equal(parseSuccessorStageArgs([...args,'--commit-staging','--install-schema'])['install-schema'],true);
});
for(const extra of [[],['--rehearse','--commit-staging'],['--apply'],['--publish'],['--read-only'],['--rehearse','--force'],['--rehearse','unexpected']])test('argumentos inseguros o ambiguos se rechazan: '+extra.join(' '),()=>assert.throws(()=>parseSuccessorStageArgs([...args,...extra]),{code:'SUCCESSOR_STAGE_ARGUMENT_INVALID'}));
test('la primitiva rechaza un cliente inválido sin efectuar consultas',async()=>{
 await assert.rejects(stageSuccessorWithinTransaction({prepared:pack,target,expectedPackageSha256:pack.payloadSha256}),{code:'SUCCESSOR_STAGE_ARGUMENT_INVALID'});
});
test('el código de carga sólo inserta en las tres tablas privadas y no puede seleccionar la fuente',()=>{
 const code=fs.readFileSync(new URL('../scripts/lib/grh-successor-staging-load.mjs',import.meta.url),'utf8');
 const insertTargets=[...code.matchAll(/INSERT INTO public\.([a-z_]+)/g)].map(m=>m[1]);
 assert.deepEqual([...new Set(insertTargets)].sort(),['grh_successor_stage','grh_successor_stage_delta','grh_successor_stage_seal']);
 assert.doesNotMatch(code,/\b(?:UPDATE|DELETE FROM|TRUNCATE|DROP TABLE) public\./);
 assert.match(code,/committed:false,callerOwnedTransaction:true/);assert.match(code,/nativeConflictsResolved:false/);
});
function rejectedClient(override={},capacity=false){
 const calls=[];const state={database:target.databaseName,project:target.projectId,branch:target.branchId,read_only:'off',isolation:'serializable',owner:true,installed:false,...override};
 return {calls,release(){},async query(text){calls.push(text);
  if(text.includes('successor-load:state'))return {rows:[state]};
  if(text.includes('pg_try_advisory'))return {rows:[{acquired:true}]};
  if(capacity&&text.includes('AS cluster_bytes'))return {rows:[{database_bytes:'1000000',cluster_bytes:String(512*1024*1024)}]};
  if(/^(BEGIN|SET LOCAL|SAVEPOINT|ROLLBACK)/.test(text))return {rows:[]};
  throw Error('Unexpected data query');
 }};
}
for(const [key,value]of [['project','wrong-project'],['branch','br-wrong'],['database','other'],['owner',false],['read_only','on'],['isolation','read committed']])test('el cargador rechaza '+key+' antes de modificar tablas',async()=>{
 const client=rejectedClient({[key]:value});await assert.rejects(executeSuccessorStage({prepared:pack,target,expectedPackageSha256:pack.payloadSha256,connect:async()=>client}),{code:'SUCCESSOR_STAGE_TARGET_OR_TRANSACTION'});
 assert.equal(client.calls.at(-1),'ROLLBACK');assert.equal(client.calls.some(q=>q.startsWith('INSERT')||q.startsWith('CREATE')),false);
});
test('sin capacidad la carga se detiene antes de reconstruir dominios o instalar',async()=>{
 const client=rejectedClient({},true);await assert.rejects(executeSuccessorStage({prepared:pack,target,expectedPackageSha256:pack.payloadSha256,installSchema:true,connect:async()=>client}),{code:'SUCCESSOR_STAGE_CAPACITY_REQUIRED'});
 assert.equal(client.calls.at(-1),'ROLLBACK');assert.equal(client.calls.some(q=>q.includes('successor-preflight:entity:')),false);
});
