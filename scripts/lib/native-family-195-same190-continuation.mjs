// SOURCE CANDIDATE (texto). Negocio familiar195 sobre el MISMO QA190 ya instalado:
// cuatro actores sintéticos, baselines después de los actores, navegador real,
// readback y deltas. Reutiliza h/db/qa/contratos de runOwnFullCapacity190Continuation;
// no crea seed, base, fundación, identidad, permiso ni reparación de ACL. Sólo lo
// invoca el hook fijo family195Business del continuation; nunca un callback de CLI.
import assert from 'node:assert/strict';
import {validateSchoolCertificatePdf} from '../../lib/internal-family-certificates.js';
import {syntheticSchoolPdf,syntheticSchoolHash} from '../../tests/fixtures/family-schooling-synthetic.js';
import {
 NATIVE_FAMILY195_ACTORS_VERSION,NATIVE_FAMILY195_ACTOR_NAMES,NATIVE_FAMILY195_TABLES,
 buildNativeFamily195ActorsFixture,assertNativeFamily195ActorsProof,
 readNativeFamily195ActorsDurable,readNativeFamily195ActorsContexts,
 assertNativeFamily195ActorsRollback,readNativeFamily195BrowserActors,
 nativeFamily195NonFamilySnapshot as actorsNonFamilySnapshot,
 nativeFamily195FamilyRowsSnapshot
} from './native-family195-same190-actors.mjs';
import {
 verifyNativeFamily195On190,FAMILY_TABLES,
 nativeFamily195NonFamilySnapshot as browserNonFamilySnapshot,
 nativeFamily195FamilySnapshot
} from './native-family-195-native-browser.mjs';

export const FAMILY195_BUSINESS_VERSION='native-family195-live190-business.v1';
export const FAMILY195_BUSINESS_CONTEXT_VERSION='native-family195-live190-context.v1';
const TECHNICAL_VERSION='native-family195-same190-technical-proof.v1';
const BROWSER_VERSION='native-family195-live190-native-browser.v1';
const STAGES=Object.freeze(['prerequisites','self195']);
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,SHA256=/^[a-f0-9]{64}$/;
const sorted=v=>[...v].sort();
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),sorted(keys),code);};
// Etiquetas sintéticas del navegador: cinco textos con «sintétic» y una fecha ISO.
export const FAMILY195_SYNTHETIC_INPUTS=Object.freeze({
 childName:'Hijo sintético QA195',institution:'Escuela sintética QA195',
 reason:'Alta familiar sintética QA195, sin efecto municipal',
 decisionReason:'Decisión sintética QA195, sin efecto municipal',
 correctionReason:'Corrección sintética QA195, sin efecto municipal',
 presentedOn:'2026-10-01'
});

// Las pruebas técnicas se producen en continueMonthlyWithFamily195, antes del
// continuation; el hook fijo las recibe por este enlace explícito y no por h.
const technicalByH=new WeakMap();
export function bindNativeFamily195Technical(h,technical){
 assert.ok(h&&typeof h==='object'&&typeof h.json==='function'&&typeof h.qa?.normalized==='function','FAMILY195_BUSINESS_H_REQUIRED');
 assert.equal(technical?.version,TECHNICAL_VERSION,'FAMILY195_BUSINESS_TECHNICAL_VERSION');
 assert.equal(technical.passed,true);assert.equal(technical.schema,h.qa.schema);
 assert.equal(technical.sourceCommit,h.sourceCommit);assert.equal(technical.major,h.major);
 assert.equal(technical.prerequisiteClosure,'native');assert.equal(technical.nativeFamilyV5Source,'110');
 assert.equal(technical.actorsCreated,0);assert.equal(technical.businessOperations,0);
 for(const id of STAGES){
  const p=technical.proofs?.[id];assert.ok(p,'FAMILY195_BUSINESS_TECHNICAL_PROOF:'+id);
  assert.equal(p.durability?.passed,true);assert.equal(p.rehearsalSnapshotEqual,true);
  assert.equal(p.lateFailureSnapshotEqual,true);assert.equal(p.repetitionRejected,true);
  for(const key of ['objectFingerprint','prerequisiteFingerprint'])assert.match(p.durable?.[key]??'',SHA256,'FAMILY195_BUSINESS_TECHNICAL_FINGERPRINT:'+id+':'+key);
 }
 assert.ok(!technicalByH.has(h),'FAMILY195_BUSINESS_TECHNICAL_ALREADY_BOUND');
 technicalByH.set(h,technical);return technical;
}

// Re-verificación durable INMEDIATAMENTE antes de los actores: ambos lotes
// durables (pines, objetos, ACL, filas vacías, sin asignaciones a las tres caps)
// deben seguir pasando con sus conteos fijos. Las huellas de datos previos
// cambiaron legítimamente con el negocio 855/208/209 y, como pide la composición,
// las huellas de prerrequisitos no se comparan después de añadir 195; las de 195
// sí, porque su IAM (los actores) todavía no fue sembrada.
function reverifyDurable(h,family,technical){
 const batches={prerequisites:[family.prerequisites,family.localPrerequisites,false],self195:[family.self,family.localSelf,true]},out={};
 for(const id of STAGES){
  const [batch,local,compareFingerprints]=batches[id],then=technical.proofs[id].durable;
  h.setPhase('family195-business-'+id+'-durable-recheck');
  const now=h.json(local.durable,{readOnly:true,fullJson:true});
  for(const key of ['version','sourceCommit'])assert.equal(now[key],then[key],'FAMILY195_BUSINESS_DURABLE_DRIFT:'+id+':'+key);
  assert.deepEqual(now.sourceHashes,then.sourceHashes,'FAMILY195_BUSINESS_DURABLE_SOURCES:'+id);
  for(const [key,value] of Object.entries(batch.fixed))assert.equal(now[key],value,'FAMILY195_BUSINESS_DURABLE_FIXED:'+id+':'+key);
  for(const key of ['objectFingerprint','prerequisiteFingerprint']){assert.match(now[key],SHA256,'FAMILY195_BUSINESS_DURABLE_FINGERPRINT:'+id+':'+key);if(compareFingerprints)assert.equal(now[key],then[key],'FAMILY195_BUSINESS_DURABLE_DRIFT:'+id+':'+key);}
  out[id]={objectFingerprint:now.objectFingerprint,prerequisiteFingerprint:now.prerequisiteFingerprint,fingerprintsComparedWithTechnical:compareFingerprints,recheckedBeforeActors:true};
 }
 return Object.freeze(out);
}

// Actores: plan único; ensayo ROLLBACK con proof devuelto; fallo tardío con la
// SELECT final sustituida; COMMIT; readback durable (READ ONLY), contextos y
// reader del navegador. Ningún borrado ni reintento fabrica un baseline.
function installActors(h,qa,contracts){
 const plan=buildNativeFamily195ActorsFixture({qa,contracts,read:h.read});
 assert.equal(plan.version,NATIVE_FAMILY195_ACTORS_VERSION);assert.equal(plan.schema,h.qa.schema);
 const n=s=>h.qa.normalized(s),statements=plan.statements.map(n),absence=plan.absenceReadStatements.map(n);
 h.setPhase('family195-business-actors-rehearsal');
 const before=h.readFullSnapshot();
 const trial=h.json(statements,{end:'ROLLBACK'});
 assertNativeFamily195ActorsProof(plan,trial);
 const rollback=assertNativeFamily195ActorsRollback(plan,trial,h.json(absence,{readOnly:true}));
 assert.deepEqual(h.readFullSnapshot(),before,'FAMILY195_ACTORS_REHEARSAL_SNAPSHOT');
 h.setPhase('family195-business-actors-late-fault');
 h.expectRollback([...statements.slice(0,-1),n(plan.lateFaultStatement)],'QA_FAMILY195_ACTORS_LATE_FAULT');
 assertNativeFamily195ActorsRollback(plan,trial,h.json(absence,{readOnly:true}));
 assert.deepEqual(h.readFullSnapshot(),before,'FAMILY195_ACTORS_LATE_FAULT_SNAPSHOT');
 h.setPhase('family195-business-actors-commit');
 const proof=h.json(statements);
 const summary=assertNativeFamily195ActorsProof(plan,proof);
 h.setPhase('family195-business-actors-readback');
 const durable=readNativeFamily195ActorsDurable(h,plan,proof);
 const contexts=readNativeFamily195ActorsContexts(h,plan,proof);
 const actors=readNativeFamily195BrowserActors(h,plan,proof,durable,contexts);
 exact(actors,NATIVE_FAMILY195_ACTOR_NAMES,'FAMILY195_BUSINESS_FOUR_ACTORS');
 const memberships=new Set(Object.values(actors).map(a=>a.raw.membershipId));assert.equal(memberships.size,4);
 h.check('family195 actors: rehearsal and late fault leave no identity, one commit adds exactly 4 roles/16 capabilities/4 accounts/4 memberships/4 sessions/2 links and the readback matches the proof');
 return Object.freeze({plan,proof,summary,rollback,actors,durable,contexts,memberships});
}

// Filas familiares antes/después del navegador: cada fila previa conserva su PK y
// su sha256 (append-only); las nuevas se cuentan por tabla y se devuelven con su
// procedencia para contrastarlas con los cinco requests del navegador.
export function familyRowsDelta(before,after){
 for(const value of [before,after]){exact(value,['tables','schoolPolicy','nativePolicy'],'FAMILY195_BUSINESS_ROWS_SHAPE');assert.equal(value.tables.length,11,'FAMILY195_BUSINESS_ELEVEN_TABLES');}
 // The policy row's source057 generation advances twice in this circuit.
 // Preserve every other field/PK; all other prior rows keep their full SHA.
 assert.deepEqual(after.nativePolicy,before.nativePolicy,'FAMILY195_BUSINESS_NATIVE_POLICY');
 const {generation:oldGeneration,...oldPolicy}=before.schoolPolicy;
 const {generation:newGeneration,...newPolicy}=after.schoolPolicy;
 assert.deepEqual(newPolicy,oldPolicy,'FAMILY195_BUSINESS_SCHOOL_POLICY_EXCEPT_GENERATION');
 const byTable=value=>new Map(value.tables.map(t=>[t.table,t.state]));
 const b=byTable(before),a=byTable(after);assert.deepEqual(sorted(a.keys()),sorted(b.keys()),'FAMILY195_BUSINESS_TABLE_SET');
 assert.deepEqual(sorted(a.keys()),sorted(NATIVE_FAMILY195_TABLES),'FAMILY195_BUSINESS_TABLE_SET');
 const keyOf=row=>JSON.stringify(row.key),added={},counts={};let preserved=0;
 for(const [table,stateBefore] of b){
  const stateAfter=a.get(table),seen=new Map(stateAfter.rows.map(row=>[keyOf(row),row]));
  assert.equal(stateAfter.count,stateAfter.rows.length,'FAMILY195_BUSINESS_COUNT_CONSISTENT:'+table);assert.equal(stateBefore.count,stateBefore.rows.length,'FAMILY195_BUSINESS_COUNT_CONSISTENT:'+table);
  for(const row of stateBefore.rows){const now=seen.get(keyOf(row));assert.ok(now,'FAMILY195_BUSINESS_PRIOR_ROW_REMOVED:'+table);if(table!=='school_certificate_storage_policy')assert.equal(now.sha256,row.sha256,'FAMILY195_BUSINESS_PRIOR_ROW_MUTATED:'+table);preserved++;}
  const previous=new Set(stateBefore.rows.map(keyOf)),news=stateAfter.rows.filter(row=>!previous.has(keyOf(row)));
  assert.equal(stateAfter.count-stateBefore.count,news.length,'FAMILY195_BUSINESS_COUNT_CONSISTENT:'+table);
  if(news.length){added[table]=news;counts[table]=news.length;}
 }
 return Object.freeze({added,counts,preserved});
}
function assertProvenance(delta,browser,bound){
 const ids=sorted(browser.scenarioRequestIds),idSet=new Set(ids),employeeContract=bound.plan.nativeIdentityContracts.employee;
 const requestRows=delta.added.native_family_request??[];
 assert.deepEqual(sorted(requestRows.map(row=>row.key.id)),ids,'FAMILY195_BUSINESS_FIVE_REQUEST_ROWS');
 for(const row of delta.added.native_family_request_event??[]){
  assert.ok(idSet.has(row.provenance.requestId),'FAMILY195_BUSINESS_EVENT_PROVENANCE');
  assert.ok(bound.memberships.has(row.provenance.actorMembershipId),'FAMILY195_BUSINESS_EVENT_ACTOR');
 }
 for(const table of ['employee_family_member','employee_family_member_event','school_certificate_record','school_certificate_record_event','school_certificate_blob']){
  for(const row of delta.added[table]??[]){
   if(row.provenance.contractId!==null)assert.equal(row.provenance.contractId,employeeContract,'FAMILY195_BUSINESS_SUBJECT_CONTRACT:'+table);
   if(row.provenance.requestId!==null)assert.ok(idSet.has(row.provenance.requestId),'FAMILY195_BUSINESS_ROW_REQUEST:'+table);
   if(row.provenance.blobSha256!==null)assert.equal(row.provenance.blobSha256,syntheticSchoolHash,'FAMILY195_BUSINESS_BLOB_SHA:'+table);
   if(table==='school_certificate_blob'&&Object.hasOwn(row.key,'sha256'))assert.equal(row.key.sha256,syntheticSchoolHash,'FAMILY195_BUSINESS_BLOB_KEY');
  }
 }
 for(const table of ['native_family_storage_policy','school_certificate_storage_policy'])assert.equal(delta.added[table],undefined,'FAMILY195_BUSINESS_POLICY_ROWS_FIXED:'+table);
}

export async function runNativeFamily195Business(context){
 exact(context,['version','h','db','qa','maker','reviewer','contracts','definition','query','readSnapshot'],'FAMILY195_BUSINESS_CONTEXT');
 assert.equal(context.version,FAMILY195_BUSINESS_CONTEXT_VERSION);
 const {h,db,qa,contracts}=context;assert.strictEqual(h.qa,qa);assert.equal(typeof qa.normalized,'function');
 assert.ok([17,18].includes(h.major));assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(typeof db.query,'function');assert.equal(typeof db.expectQueryError,'function');assert.equal(typeof db.assertNoExpectedRpc,'function');
 assert.equal(contracts.length,855);assert.equal(new Set(contracts).size,855);for(const c of contracts)assert.match(c,UUID);
 assert.equal(context.maker.session.id,qa.actor.actorSessionId);assert.equal(context.reviewer.session.id,qa.checker.actorSessionId);
 const technical=technicalByH.get(h);assert.ok(technical,'FAMILY195_BUSINESS_TECHNICAL_PROOF_REQUIRED');
 const family=h.prepared?.family195;assert.equal(family?.version,'native-family195-same190-composition.v1');
 assert.strictEqual(family.foundation,h.qa);assert.equal(family.schema,h.qa.schema);assert.equal(family.sourceCommit,h.sourceCommit);
 db.assertNoExpectedRpc();
 const durableRecheck=reverifyDurable(h,family,technical);
 const bound=installActors(h,qa,contracts);
 // Baselines DESPUÉS de los actores (B): el snapshot rico del fixture (metadatos,
 // conjuntos efectivos, 855 exacto, cuatro filas IAM) para la conservación final,
 // y las filas familiares completas con su PK/sha256/procedencia.
 h.setPhase('family195-business-baselines');
 const richBefore=actorsNonFamilySnapshot(h,bound.plan);
 assert.equal(richBefore.actors.length,4);assert.deepEqual(richBefore.native855,contracts);
 const rowsBefore=nativeFamily195FamilyRowsSnapshot(h),familyBefore=nativeFamily195FamilySnapshot(h);
 assert.deepEqual(sorted(FAMILY_TABLES),sorted(NATIVE_FAMILY195_TABLES),'FAMILY195_BUSINESS_SAME_ELEVEN_TABLES');
 for(const table of ['native_family_request','native_family_request_event','school_certificate_blob','employee_family_member'])assert.equal(familyBefore[table],0,'FAMILY195_BUSINESS_EMPTY_BASELINE:'+table);
 const pdfPages=(await validateSchoolCertificatePdf(syntheticSchoolPdf)).pages;
 assert.ok(Number.isInteger(pdfPages)&&pdfPages>=1,'FAMILY195_BUSINESS_REAL_VALIDATOR_PAGES');
 // Navegador real sobre el mismo h/db/qa. readSnapshot es el del navegador (tres
 // claves, síncrono); readFamilySnapshot lo ejecuta el custodio dueño de las tablas.
 h.setPhase('family195-business-browser');
 const browser=await verifyNativeFamily195On190(
  Object.freeze({h,db,qa,readSnapshot:()=>browserNonFamilySnapshot(h),synthetic:true}),
  Object.freeze({actors:bound.actors,nativeIdentityContracts:bound.plan.nativeIdentityContracts,readFamilySnapshot:()=>nativeFamily195FamilySnapshot(h),synthetic:FAMILY195_SYNTHETIC_INPUTS,pdfPages})
 );
 assert.equal(browser.version,BROWSER_VERSION);assert.equal(browser.passed,true);
 assert.equal(browser.actualSql,true);assert.equal(browser.actualHttp,true);assert.equal(browser.actualBrowser,true);
 assert.equal(browser.replayPostProven,true);assert.equal(browser.attemptGetRecoveryProven,true);assert.equal(browser.iamRevocationProven,false);
 assert.equal(browser.mutations,browser.expectedMutations);assert.deepEqual(browser.familyDelta,browser.expectedFamilyDelta);
 assert.equal(browser.scenarioRequestIds.length,5);assert.equal(browser.pdfPages,pdfPages);
 assert.equal(browser.productionWrites,0);assert.equal(browser.municipalAcceptance,false);assert.equal(browser.nominalRowsReturned,0);
 db.assertNoExpectedRpc();
 // Readback final: filas familiares append-only y nuevas con procedencia exacta,
 // quince números coherentes con el navegador, policies y estado no familiar.
 h.setPhase('family195-business-readback');
 const rowsAfter=nativeFamily195FamilyRowsSnapshot(h),familyAfter=nativeFamily195FamilySnapshot(h),delta=familyRowsDelta(rowsBefore,rowsAfter);
 const {storage_policy_generation:generationDelta,...tableDelta}=browser.familyDelta;
 assert.deepEqual(delta.counts,tableDelta,'FAMILY195_BUSINESS_ROW_COUNTS_MATCH_BROWSER');
 assert.equal(familyAfter.storage_policy_generation-familyBefore.storage_policy_generation,generationDelta,'FAMILY195_BUSINESS_GENERATION');
 for(const key of Object.keys(familyAfter)){const expected=(familyBefore[key]??0)+(browser.familyDelta[key]??0);assert.equal(familyAfter[key],expected,'FAMILY195_BUSINESS_FAMILY_NUMBER:'+key);}
 assertProvenance(delta,browser,bound);
 assert.deepEqual(rowsAfter.nativePolicy,rowsBefore.nativePolicy,'FAMILY195_BUSINESS_NATIVE_POLICY');
 assert.equal(rowsAfter.schoolPolicy.generation,rowsBefore.schoolPolicy.generation+generationDelta,'FAMILY195_BUSINESS_SCHOOL_GENERATION');
 assert.deepEqual({...rowsAfter.schoolPolicy,generation:rowsBefore.schoolPolicy.generation},rowsBefore.schoolPolicy,'FAMILY195_BUSINESS_SCHOOL_POLICY_EXCEPT_GENERATION');
 const richAfter=actorsNonFamilySnapshot(h,bound.plan);
 assert.deepEqual(richAfter,richBefore,'FAMILY195_BUSINESS_NON_FAMILY_IAM_855_METADATA_PRESERVED');
 h.check('family195 business: the real browser circuit added exactly the five scenario requests with their events, member, blob and record on the same QA190; every prior family row, both policies except generation, the IAM rows, effective sets, 855 contracts and metadata are preserved');
 return Object.freeze({
  version:FAMILY195_BUSINESS_VERSION,passed:true,schema:h.qa.schema,sourceCommit:h.sourceCommit,major:h.major,
  technicalProofVersion:technical.version,durableRecheck,
  actors:{version:bound.plan.version,names:[...NATIVE_FAMILY195_ACTOR_NAMES],summary:bound.summary,rollback:bound.rollback,deltas:bound.proof.deltas,contexts:bound.proof.contexts.length,bootstraps:bound.proof.bootstraps.length,nativeIdentityContracts:bound.plan.nativeIdentityContracts},
  browser,familyRows:{preserved:delta.preserved,added:delta.counts,generationDelta},
  scenarioRequestIds:[...browser.scenarioRequestIds],provenanceMatched:true,
  nativePolicyPreserved:true,schoolPolicyPreservedExceptGeneration:true,nonFamilyStatePreserved:true,
  actualSql:true,actualHttp:true,actualBrowser:true,authenticationFixture:true,completeAuthenticationHandler:false,
  iamRevocationProven:false,familyCircuitSynthetic:true,pdfSynthetic:true,pdfPages,
  synthetic:true,productionWrites:0,paymentExecuted:false,payrollModified:false,municipalAcceptance:false,nominalRowsReturned:0
 });
}
