import test from 'node:test';import assert from 'node:assert/strict';
import {planSuccessorOperationalRead,evaluateSuccessorOperationalRead,validateSuccessorTarget,NATIVE_READ_DOMAINS} from '../scripts/lib/grh-successor-operational-read.mjs';
import {target,syntheticOperationalPackage,syntheticOperationalResults} from './fixtures/successor-operational-synthetic.js';
const setup=async()=>{const pack=await syntheticOperationalPackage();return {pack,plan:planSuccessorOperationalRead(pack,target),result:syntheticOperationalResults(pack)};};
test('la comparación completa produce evidencia agregada sin autorizar la publicación',async()=>{
 const {plan,result}=await setup(),r=evaluateSuccessorOperationalRead(plan,result);assert.equal(r.baselineCompatible,true);assert.equal(Object.keys(r.entities).length,10);
 assert.equal(Object.keys(r.native).length,13);assert.equal(r.nativeReviewRequired,false);assert.equal(r.publicationAuthorized,false);assert.equal(r.stagingLoadAuthorized,false);
 assert.equal(r.nativeConflictsResolved,false);assert.equal(r.capacityCertified,false);assert.equal(r.restorationTested,false);assert.equal(r.containsPersonalRecords,false);
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE_SYNTHETIC|PRIVATE_REVISED|9876|previousRecord|nombre|source_payload/);assert.ok(Object.isFrozen(r));
});
test('plan de una sola transacción explícitamente read-only sin DDL, DML ni bloqueos de publicación',async()=>{
 const {plan}=await setup();assert.deepEqual(plan.options,{readOnly:true,isolationLevel:'RepeatableRead'});assert.equal(plan.queries.length,26);
 for(const q of plan.queries){assert.match(q.text,/^(?:\/\*[\s\S]*?\*\/\s*)?WITH /);assert.doesNotMatch(q.text,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|COMMIT|FOR\s+UPDATE|FOR\s+SHARE)\b/i);
  assert.ok(q.text.includes('$1::uuid'));assert.equal(q.values[0],target.tenantId);assert.equal(q.values[1],target.bindingId);assert.ok(Object.isFrozen(q.values));}
 assert.doesNotMatch(plan.queries.map(q=>q.text).join('\n'),/PRIVATE_SYNTHETIC|9876/);
});
for(const key of ['tenantId','bindingId','coreVersionId','curatedVersionId','publicationSha256','projectId','branchId','databaseName'])test('un destino inválido falla antes de planificar: '+key,async()=>{
 const pack=await syntheticOperationalPackage();assert.throws(()=>planSuccessorOperationalRead(pack,{...target,[key]:"'; DROP TABLE x;--"}),{code:'SUCCESSOR_TARGET_INVALID'});
});
for(const [field,value]of [['readOnly','off'],['isolation','read committed'],['project','otro-proyecto'],['branch','br-otra'],['database','other']])test('rechaza una lectura de otro entorno o aislamiento: '+field,async()=>{
 const {plan,result}=await setup();result[0][0].observation[field]=value;assert.throws(()=>evaluateSuccessorOperationalRead(plan,result),{code:'SUCCESSOR_READ_TARGET_MISMATCH'});
});
for(const field of ['curated_version_id','publication_sha256','curated_batch','curated_import'])test('una selección mezclada no certifica el sucesor: '+field,async()=>{
 const {plan,result}=await setup();result[0][0].observation[field]='different';assert.throws(()=>evaluateSuccessorOperationalRead(plan,result),{code:'SUCCESSOR_READ_SELECTION_MISMATCH'});
});
test('una proyección o sello diferente hace incompatible la base aunque coincidan los conteos',async()=>{
 for(const change of [m=>m.core_evidence.payrollRuns.candidateProjectionSha256='0'.repeat(64),m=>m.core_seals.payrollRuns.md5='0'.repeat(32)]){
  const {plan,result}=await setup();for(const i of [0,result.length-1])change(result[i][0].observation);
  const report=evaluateSuccessorOperationalRead(plan,result);assert.equal(report.baselineCompatible,false);assert.equal(report.publicationAuthorized,false);
 }
});
test('el informe distingue una huella de manifiesto distinta de un contenido proyectado equivalente',async()=>{
 const {plan,result}=await setup();result[0][0].observation.core_manifest=result.at(-1)[0].observation.core_manifest='0'.repeat(64);
 const r=evaluateSuccessorOperationalRead(plan,result);assert.equal(r.manifests.coreExact,false);assert.equal(r.baselineCompatible,true);
});
for(const field of ['duplicateBaseKeys','duplicateCandidateKeys','unexpectedExistingAdds','previousMismatches'])test('la revisión señala '+field+' sin habilitar la carga',async()=>{
 const {plan,result}=await setup();result[1][0].observation[field]=1;const r=evaluateSuccessorOperationalRead(plan,result);
 assert.equal(r.baselineCompatible,false);assert.equal(r.findings[0].domain,'core/payrollRuns');assert.equal(r.stagingLoadAuthorized,false);
});
test('los registros nativos afectados quedan pendientes de revisión, no resueltos automáticamente',async()=>{
 for(const [index,withContract]of [[0,true],[7,false]]){
  const {plan,result}=await setup(),native=result[12+index][0].observation;native.rows=2;native.afterPublication=1;native.affectedContractRows=withContract?1:null;
  const r=evaluateSuccessorOperationalRead(plan,result);assert.equal(r.nativeReviewRequired,true);assert.equal(r.native[NATIVE_READ_DOMAINS[index][0]].reviewRequired,true);assert.equal(r.nativeConflictsResolved,false);
 }
});
test('lecturas incompletas o pertenecientes a otro plan se rechazan',async()=>{
 const {plan,result}=await setup();assert.throws(()=>evaluateSuccessorOperationalRead({...plan},result),{code:'SUCCESSOR_READ_RESULT_INVALID'});
 assert.throws(()=>evaluateSuccessorOperationalRead(plan,result.slice(1)),{code:'SUCCESSOR_READ_RESULT_INVALID'});
 result[3]=[];assert.throws(()=>evaluateSuccessorOperationalRead(plan,result),{code:'SUCCESSOR_READ_INCOMPLETE'});
});
test('cambio del snapshot cancela la aceptación completa',async()=>{
 const {plan,result}=await setup();result.at(-1)[0].observation.snapshot='2:3:';assert.throws(()=>evaluateSuccessorOperationalRead(plan,result),{code:'SUCCESSOR_READ_SNAPSHOT_CHANGED'});
});
for(const field of ['source_sha256','curated_source_sha256','source_cutoff','curated_cutoff','source_company_id','source_database'])test('la fuente debe coincidir en '+field,async()=>{
 const {plan,result}=await setup();result[0][0].observation[field]='OTHER_SOURCE';assert.throws(()=>evaluateSuccessorOperationalRead(plan,result),{code:'SUCCESSOR_READ_SOURCE_MISMATCH'});
});
test('una entidad sin cambios no puede recibir una huella candidata distinta',async()=>{
 const {plan,result}=await setup();result[1][0].observation.candidateFingerprint.md5='0'.repeat(32);
 assert.equal(evaluateSuccessorOperationalRead(plan,result).baselineCompatible,false);
});
test('dos claves diferentes no habilitan la misma asignación salarial dos veces',async()=>{
 const {plan,result}=await setup();const r=result.find(rows=>rows[0].observation.entity==='core/payrollSnapshot');r[0].observation.semanticDuplicates=1;
 const report=evaluateSuccessorOperationalRead(plan,result);assert.equal(report.baselineCompatible,false);assert.equal(report.entities['core/payrollSnapshot'].semanticDuplicates,1);
});
import {parseSuccessorOperationalArgs,runSuccessorOperationalRead} from '../scripts/verify-grh-successor-operational.mjs';
import path from 'node:path';
const args=['--target',path.resolve('synthetic-target.json'),'--baseline-core',path.resolve('synthetic-core-a'),'--candidate-core',path.resolve('synthetic-core-b'),'--baseline-curated',path.resolve('synthetic-curated-a'),'--candidate-curated',path.resolve('synthetic-curated-b'),'--read-only'];
test('la herramienta requiere explícitamente lectura y no acepta opciones de carga',()=>{
 assert.equal(parseSuccessorOperationalArgs(args)['read-only'],true);assert.throws(()=>parseSuccessorOperationalArgs(args.slice(0,-1)));
 assert.throws(()=>parseSuccessorOperationalArgs([...args,'--apply']));assert.throws(()=>parseSuccessorOperationalArgs([...args,'--connection-string','PRIVATE']));
});
test('la cancelación impide iniciar una transacción de inspección',async()=>{
 const {pack}=await setup();const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(runSuccessorOperationalRead({prepared:pack,target,signal:controller.signal,transaction:()=>{calls++;}}));assert.equal(calls,0);
});
test('un resultado que llega después de cancelar no genera certificado de lectura',async()=>{
 const {pack,result}=await setup(),controller=new AbortController();
 await assert.rejects(runSuccessorOperationalRead({prepared:pack,target,signal:controller.signal,transaction:async(queries,options)=>{assert.equal(options.readOnly,true);assert.equal(queries.length,26);controller.abort();return result;}}));
});
