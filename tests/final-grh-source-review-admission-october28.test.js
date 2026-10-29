// PROPOSED by Claude (source only; not run by Claude). Target: tests/final-grh-source-review-admission-october28.test.js
// Pure source regressions for the ADDITIVE 218 admission. Network and child processes are blocked;
// nothing connects, executes SQL, reads a backup or nominal rows.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const denied=()=>{throw Error('OCT28_ADMISSION_TEST_IO_FORBIDDEN');};
for(const[module,names]of[[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['get','request','createServer']],[https,['get','request','createServer']],[child,['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']]])for(const name of names)module[name]=denied;
globalThis.fetch=denied;syncBuiltinESMExports();
const {buildFinalGrhSourceReviewAdmissionOctober28,assertOctober28AdmissionProof,OCT28_ADMITTED_PROFILES,OCT28_EXPECTED_TUPLE_STATE,OCT28_EXPECTED_MODE,OCT28_PROOF_VERSION,october28Tuple,OCT28_REVIEW_ADMISSION_FILE,OCT28_REVIEW_ADMISSION_SQL_SHA256,OCT28_REVIEW_ADMISSION_PROFILE,OCT28_SOURCE_PINS,OCT28_PARENT_PINS,SEPTEMBER10_BASELINE}=await import('../scripts/lib/final-grh-source-review-admission-october28-installation.mjs');
const {FINAL_REVIEW_ADMISSION_PROFILES,FINAL_REVIEW_ADMISSION_SQL_SHA256}=await import('../scripts/lib/final-grh-source-review-admission-installation.mjs');
const {projectOctober28RegistryParent}=await import('../scripts/lib/grh-october28-candidate-registry-source.mjs');
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
const sourceCommit='a'.repeat(40),SQL183='scripts/migrations/183-final-grh-source-review-admission.sql',SQL144='scripts/migrations/144-final-grh-source-revision.sql',REGISTRY='scripts/lib/grh-source-profiles.json';
const tuple183=()=>/\$tuple183\$([^]*?)\$tuple183\$/.exec(read(SQL183))[1];
const OCT01="((source_profile = 'grh-junin-2026-10-01'::text) AND (source_sha256 = '50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f'::text) AND (source_cutoff = '2026-10-01 15:17:29'::timestamp without time zone))";
const OCT14="((source_profile = 'grh-junin-2026-10-14'::text) AND (source_sha256 = '3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4'::text) AND (source_cutoff = '2026-10-14 15:18:17'::timestamp without time zone))";
const override=(path,change)=>file=>file===path?change(read(file)):read(file);

test('historial intacto: 144/183 y padres finitos de registry y compositor 183 (el escritor es la porción E)',()=>{
 for(const [file,digest] of Object.entries(OCT28_SOURCE_PINS))assert.equal(hash(read(file)),digest,file);
 assert.equal(OCT28_SOURCE_PINS[SQL183],FINAL_REVIEW_ADMISSION_SQL_SHA256);
 assert.deepEqual(FINAL_REVIEW_ADMISSION_PROFILES.map(p=>p.profile),['grh-junin-2026-10-01','grh-junin-2026-10-14']);
 assert.equal(tuple183(),'('+OCT01+' OR '+OCT14+')','183 keeps exactly its two tuples');
 const fixture=JSON.parse(read('tests/fixtures/grh-october28-registry-custody-inverses.json'));
 assert.equal(fixture.files[0].beforeSha256,OCT28_PARENT_PINS.module183);assert.equal(fixture.files[0].afterSha256,OCT28_SOURCE_PINS['scripts/lib/final-grh-source-review-admission-installation.mjs']);
 const custody=projectOctober28RegistryParent(read(REGISTRY));assert.equal(custody.parentRegistrySha256,OCT28_PARENT_PINS.registry);assert.equal(custody.sqlValidityGranted,false);
});

test('218 es aditiva: conserva literal las dos tuplas 183 y agrega sólo Oct28 del perfil fuente',()=>{
 const source=read(OCT28_REVIEW_ADMISSION_FILE);assert.equal(hash(source),OCT28_REVIEW_ADMISSION_SQL_SHA256);
 assert.equal(/\$tuple183\$([^]*?)\$tuple183\$/.exec(source)[1],tuple183());
 const t218=/\$tuple218\$([^]*?)\$tuple218\$/.exec(source)[1];
 assert.equal(t218,'('+OCT01+' OR '+OCT14+" OR ((source_profile = 'grh-junin-2026-10-28'::text) AND (source_sha256 = 'fef5aada3142e475d0519f7647377465d95ee55b4038aff035ff7d41d5748cc1'::text) AND (source_cutoff = '2026-10-28 15:16:35'::timestamp without time zone)))");
 assert.equal(t218,october28Tuple(tuple183()));for(const part of [OCT01,OCT14])assert.equal(t218.split(part).length,2);
 const candidate=projectOctober28RegistryParent(read(REGISTRY)).candidateProfile;
 assert.equal(candidate.source.sha256.toLowerCase(),OCT28_REVIEW_ADMISSION_PROFILE.sha256);assert.equal(candidate.source.cutoff,OCT28_REVIEW_ADMISSION_PROFILE.cutoff);assert.equal(candidate.publicationMode,'candidate_only');
 assert.equal(source.split('ALTER TABLE').length,2);assert.equal(source.split('DROP CONSTRAINT').length,2);assert.equal(source.split('ADD CONSTRAINT grh_final_source_revision_source_tuple_check').length,2);
 assert.doesNotMatch(source,/\b(GRANT|REVOKE|CREATE|INSERT|UPDATE|DELETE|TRUNCATE|SECURITY\s+DEFINER|OWNER\s+TO|DROP\s+(TABLE|FUNCTION|TRIGGER|POLICY))\b/i);
 assert.doesNotMatch(source,/2026-09-10|5a604acf/,'218 never touches the September 10 baseline');
 assert.throws(()=>october28Tuple('('+OCT01+')'),/FINAL_REVIEW218_TUPLE183/);assert.throws(()=>october28Tuple(undefined),/FINAL_REVIEW218_TUPLE183/);
});

test('constructor: rehearsal/instalación/repetición/verificación/inversa con formas 183→218 exactas',()=>{
 for(const major of [17,18]){
  const b=buildFinalGrhSourceReviewAdmissionOctober28({read,sourceCommit,major});
  assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.revisionWritten,false);assert.equal(b.activationOrAdoption,false);
  assert.equal(b.migration.length,1);assert.equal(b.tuple218,october28Tuple(tuple183()));
  assert.ok(b.shape183.includes(JSON.stringify(tuple183()).replaceAll("'","''")));assert.ok(!b.shape218.includes(JSON.stringify(tuple183()).replaceAll("'","''")));
  assert.ok(b.shape218.includes(JSON.stringify(b.tuple218).replaceAll("'","''")));
  const ins=b.transactions.install.statements;assert.equal(ins.filter(s=>s===b.migration[0]).length,1);
  assert.ok(ins.indexOf(b.shape183)<ins.indexOf(b.migration[0])&&ins.indexOf(b.migration[0])<ins.indexOf(b.shape218));
  assert.equal(b.transactions.rehearsal.completion,'ROLLBACK');assert.equal(b.transactions.install.completion,'COMMIT');
  const durable=b.transactions.durable;assert.equal(durable.readOnly,true);assert.equal(durable.statements[0],'SET TRANSACTION READ ONLY');assert.ok(!durable.statements.includes(b.migration[0]));
  assert.ok(b.transactions.repeat.statements.indexOf(b.shape218)<b.transactions.repeat.statements.indexOf(b.migration[0]));
  const rollback=b.guardedRollback.statements.join('\n');
  assert.match(rollback,/FINAL_REVIEW218_ROLLBACK_OCT28_EXISTS/);assert.ok(rollback.includes("source_profile='grh-junin-2026-10-28'"));
  assert.ok(b.guardedRollback.statements.indexOf(b.shape183)>b.guardedRollback.statements.findIndex(s=>s.includes('final_review218_rollback')),'the inverse ends verified at the exact 183 shape');
  assert.deepEqual(b.historical.profiles183,['grh-junin-2026-10-01','grh-junin-2026-10-14']);assert.equal(b.registryCustody.sqlValidityGranted,false);
  assert.deepEqual(b.september10Baseline,SEPTEMBER10_BASELINE);
  assert.doesNotMatch(b.migration[0],/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i,'the admission writes no revision or business row');
 }
});

test('baseline Sept10 conservado en 144 y en el registry padre/actual',()=>{
 const sql=read(SQL144);assert.equal(sql.split(`c.source_sha256='${SEPTEMBER10_BASELINE.sha256}'`).length,2);assert.equal(sql.split(`c.source_cutoff=${SEPTEMBER10_BASELINE.cutoff}`).length,2);
 const custody=projectOctober28RegistryParent(read(REGISTRY)),current=JSON.parse(read(REGISTRY));
 assert.deepEqual(JSON.parse(custody.parentRegistryRaw).profiles.find(p=>p.id==='grh-junin-2026-09-10'),current.profiles.find(p=>p.id==='grh-junin-2026-09-10'));
});

test('negativos: cualquier byte ajeno en 218/183/144/registry o perfil Oct28 alterado detiene la composición',()=>{
 const build=r=>buildFinalGrhSourceReviewAdmissionOctober28({read:r,sourceCommit,major:17});
 assert.throws(()=>build(override(OCT28_REVIEW_ADMISSION_FILE,s=>s.replace('2026-10-28 15:16:35','2026-10-28 15:16:36'))),/FINAL_REVIEW218_SQL_CHANGED|FINAL_REVIEW218_PREREQUISITE/);
 assert.throws(()=>build(override(OCT28_REVIEW_ADMISSION_FILE,s=>s+' ')),/FINAL_REVIEW218_SQL_CHANGED/);
 assert.throws(()=>build(override(SQL183,s=>s.replace('2026-10-14 15:18:17','2026-10-14 15:18:18'))),/FINAL_REVIEW218_PREREQUISITE_SOURCE_CHANGED/);
 assert.throws(()=>build(override(SQL144,s=>s.replace("2026-09-10 15:17:30","2026-10-28 15:16:35"))),/FINAL_REVIEW218_PREREQUISITE_SOURCE_CHANGED/);
 assert.throws(()=>build(override(REGISTRY,s=>s.replace('"cutoff": "2026-10-28T15:16:35"','"cutoff": "2026-10-28T15:16:36"'))),/FINAL_REVIEW218_PREREQUISITE_SOURCE_CHANGED/);
 assert.throws(()=>build(override('scripts/lib/final-grh-source-review-admission-installation.mjs',s=>s+'\n')),/FINAL_REVIEW218_PREREQUISITE_SOURCE_CHANGED/);
 assert.throws(()=>buildFinalGrhSourceReviewAdmissionOctober28({read,sourceCommit:'x',major:17}));assert.throws(()=>buildFinalGrhSourceReviewAdmissionOctober28({read,sourceCommit,major:16}));
});

const LABELS=Object.keys(OCT28_EXPECTED_TUPLE_STATE),RO=['durable','preflight'];
const statementsOf=(b,label)=>({install:b.transactions.install.statements,repeat:b.transactions.repeat.statements,durable:b.transactions.durable.statements,preflight:b.preflight,rollback:b.guardedRollback.statements})[label];
const proofFor=(b,label,over={})=>{const state=OCT28_EXPECTED_TUPLE_STATE[label];return{version:OCT28_PROOF_VERSION,sourceCommit,targetMajor:17,sqlSha256:OCT28_REVIEW_ADMISSION_SQL_SHA256,
 historicalSqlSha256:b.historical.sql183Sha256,baselineSqlSha256:b.historical.sql144Sha256,mode:OCT28_EXPECTED_MODE[label],allChecksPassed:true,expectedTupleState:state,tupleState:state,
 admittedProfiles:[...OCT28_ADMITTED_PROFILES[state]],newTables:0,newFunctions:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,revisionWritten:false,activationOrAdoption:false,
 priorTableCount:215,transactionDataPreserved:!RO.includes(label),priorFingerprint:'a'.repeat(64),managedConstraintSha256:'b'.repeat(64),...(RO.includes(label)?{}:{beforeFingerprint:'a'.repeat(64)}),...over};};
const rejectsProof=(b,label,over,code)=>assert.throws(()=>assertOctober28AdmissionProof(proofFor(b,label,over),{label,sourceCommit,major:17}),new RegExp(code),label+' '+code);

test('R3 modos: cada transacción fija exactamente el modo del mapa y su proof lo informa; ningún modo se cruza',()=>{
 assert.deepEqual(OCT28_EXPECTED_MODE,{install:'oct28_install',repeat:'oct28_repeat',durable:'oct28_verify',preflight:'oct28_preflight_before',rollback:'oct28_rollback'});
 assert.deepEqual(OCT28_EXPECTED_TUPLE_STATE,{install:'218',repeat:'218',durable:'218',preflight:'183',rollback:'183'});
 const b=buildFinalGrhSourceReviewAdmissionOctober28({read,sourceCommit,major:17});
 for(const label of LABELS){
  const statements=statementsOf(b,label),state=statements.find(s=>s.includes('final_review218_state')),proof=statements.at(-1);
  const sets=[...state.matchAll(/set_config\('municontrol_final_review\.mode','([a-z_0-9]+)',true\)/g)].map(m=>m[1]);
  // From 183 the state sets install/preflight; from 218 it sets repeat/verify/rollback. The expected mode of the label is among them.
  assert.ok(sets.includes(OCT28_EXPECTED_MODE[label]),label+' '+sets.join());
  assert.ok(sets.every(m=>Object.values(OCT28_EXPECTED_MODE).includes(m)),label+' unknown mode '+sets.join());
  assert.match(proof,/^SELECT jsonb_build_object\('version','final-grh-source-review-admission-october28\.v3'/,label);
  assert.ok(proof.includes("'mode',current_setting('municontrol_final_review.mode')"),label+' proof carries the live mode');
  assert.ok(proof.includes("'baselineSqlSha256','"+b.historical.sql144Sha256+"'"),label+' proof carries the 144 pin');
  assert.ok(proof.includes(`'expectedTupleState','${OCT28_EXPECTED_TUPLE_STATE[label]}'`),label);
  assert.doesNotMatch(proof,/'admittedProfiles','\[/,label);
  for(const state218 of ['183','218'])assert.ok(proof.includes(JSON.stringify(OCT28_ADMITTED_PROFILES[state218])),label+' maps '+state218);
 }
 // The install transaction, when 218 is already present, runs as oct28_repeat: it must NOT set oct28_install there.
 const installState=statementsOf(b,'install').find(s=>s.includes('final_review218_state'));
 assert.ok(installState.includes("'oct28_install'")&&installState.includes("'oct28_repeat'")&&!installState.includes("'oct28_verify'"));
 const durableState=statementsOf(b,'durable').find(s=>s.includes('final_review218_state'));assert.ok(!durableState.includes("'oct28_install'")&&!durableState.includes("'oct28_repeat'"));
});

test('R3 proof: válida sólo completa, con modo exacto, pin 144 y estado observado = esperado',()=>{
 const b=buildFinalGrhSourceReviewAdmissionOctober28({read,sourceCommit,major:17});
 for(const label of LABELS)assert.equal(assertOctober28AdmissionProof(proofFor(b,label),{label,sourceCommit,major:17}),true,label);
 // Crossed modes: a repeat218 proof presented as install, a verify as repeat, a preflight_after as preflight, an install as rollback.
 rejectsProof(b,'install',{mode:'oct28_repeat'},'FINAL_REVIEW218_PROOF_MODE');
 rejectsProof(b,'repeat',{mode:'oct28_verify'},'FINAL_REVIEW218_PROOF_MODE');
 rejectsProof(b,'durable',{mode:'oct28_repeat'},'FINAL_REVIEW218_PROOF_MODE');
 rejectsProof(b,'preflight',{mode:'oct28_preflight_after'},'FINAL_REVIEW218_PROOF_MODE');
 rejectsProof(b,'rollback',{mode:'oct28_install'},'FINAL_REVIEW218_PROOF_MODE');
 for(const label of LABELS){
  rejectsProof(b,label,{mode:'install'},'FINAL_REVIEW218_PROOF_MODE');
  rejectsProof(b,label,{baselineSqlSha256:'0'.repeat(64)},'FINAL_REVIEW218_PROOF_BASELINE_SQL');
  rejectsProof(b,label,{baselineSqlSha256:b.historical.sql183Sha256},'FINAL_REVIEW218_PROOF_BASELINE_SQL');
  // Omitted fields are rejected before any value is compared.
  for(const omitted of ['mode','baselineSqlSha256','tupleState','admittedProfiles','historicalSqlSha256']){
   const p=proofFor(b,label);delete p[omitted];
   assert.throws(()=>assertOctober28AdmissionProof(p,{label,sourceCommit,major:17}),/FINAL_REVIEW218_PROOF_FIELDS/,label+' without '+omitted);
  }
  rejectsProof(b,label,{extra:true},'FINAL_REVIEW218_PROOF_FIELDS');
  rejectsProof(b,label,{version:'final-grh-source-review-admission-october28.v2'},'FINAL_REVIEW218_PROOF_VERSION');
  rejectsProof(b,label,{sqlSha256:b.historical.sql183Sha256},'FINAL_REVIEW218_PROOF_SQL');
  rejectsProof(b,label,{priorTableCount:2},'FINAL_REVIEW218_PROOF_TABLE_COUNT');
 }
 // R2 defect kept covered: three profiles claimed while the CHECK is the two-tuple 183 one.
 for(const label of ['preflight','rollback']){
  rejectsProof(b,label,{admittedProfiles:[...OCT28_ADMITTED_PROFILES['218']]},'FINAL_REVIEW218_PROOF_ADMITTED_PROFILES');
  rejectsProof(b,label,{tupleState:'218'},'FINAL_REVIEW218_PROOF_TUPLE_STATE');
 }
 for(const label of ['install','repeat','durable']){
  rejectsProof(b,label,{tupleState:'183'},'FINAL_REVIEW218_PROOF_TUPLE_STATE');
  rejectsProof(b,label,{tupleState:null,admittedProfiles:null},'FINAL_REVIEW218_PROOF_TUPLE_STATE');
  rejectsProof(b,label,{expectedTupleState:'183'},'FINAL_REVIEW218_PROOF_EXPECTATION');
 }
 // beforeFingerprint belongs to transactional proofs only.
 const durableWithBefore=proofFor(b,'durable');durableWithBefore.beforeFingerprint='a'.repeat(64);
 assert.throws(()=>assertOctober28AdmissionProof(durableWithBefore,{label:'durable',sourceCommit,major:17}),/FINAL_REVIEW218_PROOF_FIELDS/);
 const installWithoutBefore=proofFor(b,'install');delete installWithoutBefore.beforeFingerprint;
 assert.throws(()=>assertOctober28AdmissionProof(installWithoutBefore,{label:'install',sourceCommit,major:17}),/FINAL_REVIEW218_PROOF_FIELDS/);
 assert.throws(()=>assertOctober28AdmissionProof(proofFor(b,'install'),{label:'other',sourceCommit,major:17}),/FINAL_REVIEW218_PROOF_LABEL/);
 assert.throws(()=>assertOctober28AdmissionProof(null,{label:'install',sourceCommit,major:17}),/FINAL_REVIEW218_PROOF_SHAPE/);
});
