// PROPOSED by Claude (source only; never imported or run by Claude).
// Target: scripts/lib/final-grh-source-review-admission-october28-installation.mjs
// Review-only construction of the ADDITIVE 218 admission. No connections, environment reads or SQL execution.
// It composes on top of the unchanged 183 constructor (post-C metadata e45a…, parent 5046…) and never edits,
// regenerates or re-runs 144/183. A documentary admission is not a revision, activation, adoption or payroll.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {buildFinalGrhSourceReviewAdmissionInstallation,FINAL_REVIEW_ADMISSION_FILE,FINAL_REVIEW_ADMISSION_SQL_SHA256,FINAL_REVIEW_ADMISSION_PROFILES,FINAL_REVIEW_ADMISSION_REGISTRY_PARENT_SHA256} from './final-grh-source-review-admission-installation.mjs';
import {projectOctober28RegistryParent} from './grh-october28-candidate-registry-source.mjs';

export const OCT28_REVIEW_ADMISSION_FILE='scripts/migrations/218-final-grh-source-review-admission-october28.sql';
export const OCT28_REVIEW_ADMISSION_SQL_SHA256='4b952c79d0d36dc04294f11f4ed9c824a86daf1e8d266f77e204d90b29545fcc';
// Values come from the reviewed registry profile (B, fe04…), never from a database or an observation.
export const OCT28_REVIEW_ADMISSION_PROFILE=Object.freeze({profile:'grh-junin-2026-10-28',sha256:'fef5aada3142e475d0519f7647377465d95ee55b4038aff035ff7d41d5748cc1',cutoff:'2026-10-28T15:16:35'});
// Exactly one finite succession per source. Parents stay authoritative and are not regenerated from metadata:
// 183 module e45a… -> parent 5046… (C finite inverse fixture f3b9…); registry fe04… -> parent cd121… (B helper 690a…).
export const OCT28_SOURCE_PINS=Object.freeze({
 'scripts/migrations/144-final-grh-source-revision.sql':'818e53c560da8ec3cad55073071d0a56669c6581f51c20d910600ea58b9697d5',
 'scripts/migrations/183-final-grh-source-review-admission.sql':'a85c01c1bf2ae620b1af32a2e1564c52544562f39235557ee5e5549717f47e94',
 'scripts/lib/final-grh-source-review-admission-installation.mjs':'e45a31bfc85ea3436a627aab2173a2dd21545304075cfb10a38777316946367d',
 'scripts/lib/grh-source-profiles.json':'fe04d0a5fc96d38ca2e6839556f63ea51a73626b3d1685c1f8ec3f6dfaf42a77',
 'scripts/lib/grh-october28-candidate-registry-source.mjs':'690af52ab26bec7ee02ddf5e9e2ccc6987491716ec939a126cac47d49d6ece1e',
});
// R2: the revision writer is a SEPARATE portion (E) and is not pinned here; this admission writes nothing either way.
export const OCT28_PARENT_PINS=Object.freeze({module183:'5046da75f482b0a63d1acfdcfc0b63502276351549248a2196f1e63ef4c859f2',registry:'cd121a9a5fff31c9784f250cc410adfeb65cf6284288deddbfec3634b3be3dc6'});
// 144's selected-predecessor guard: the September 10 baseline is preserved verbatim.
export const SEPTEMBER10_BASELINE=Object.freeze({sha256:'5a604acfe5ea32832b630d8aab29e494038d4c8940b231e283a53d14112665c7',cutoff:"timestamp '2026-09-10 15:17:30'"});
const managed='grh_final_source_revision_source_tuple_check',prefix='municontrol_final_review.';
const names=['grh_final_source_revision','grh_final_source_delta','grh_final_source_seal'];
const q=v=>"'"+String(v).replaceAll("'","''")+"'",lf=v=>v.replace(/\r\n?/g,'\n'),hash=v=>createHash('sha256').update(v).digest('hex');
const once=(text,needle,label)=>{assert.equal(text.split(needle).length,2,label);return text;};
// R2: the admitted profiles reported by a proof are those of the CHECK actually present at that point.
export const OCT28_ADMITTED_PROFILES=Object.freeze({
 '183':Object.freeze(['grh-junin-2026-10-01','grh-junin-2026-10-14']),
 '218':Object.freeze(['grh-junin-2026-10-01','grh-junin-2026-10-14','grh-junin-2026-10-28'])});
// Expected end state of each transaction: preflight and guarded rollback end in the exact 183 CHECK.
export const OCT28_EXPECTED_TUPLE_STATE=Object.freeze({install:'218',repeat:'218',durable:'218',preflight:'183',rollback:'183'});
// R3: the exact `municontrol_final_review.mode` each transaction sets (state()) and its proof must report.
// An install transaction found already in 218 runs as oct28_repeat and its proof is NOT an install proof.
export const OCT28_EXPECTED_MODE=Object.freeze({install:'oct28_install',repeat:'oct28_repeat',durable:'oct28_verify',preflight:'oct28_preflight_before',rollback:'oct28_rollback'});
export const OCT28_PROOF_VERSION='final-grh-source-review-admission-october28.v3';
const PROOF_KEYS=Object.freeze(['version','sourceCommit','sqlSha256','historicalSqlSha256','baselineSqlSha256','targetMajor','mode','allChecksPassed','newTables','newFunctions','existingAclChanges','businessWrites','nominalRowsReturned','revisionWritten','activationOrAdoption','expectedTupleState','tupleState','admittedProfiles','priorTableCount','transactionDataPreserved','priorFingerprint','managedConstraintSha256']);

/** The 218 tuple is the 183 tuple with exactly one disjunct appended inside the same outer OR. */
export function october28Tuple(tuple183,p=OCT28_REVIEW_ADMISSION_PROFILE){
 assert.equal(typeof tuple183,'string','FINAL_REVIEW218_TUPLE183');
 assert.ok(tuple183.startsWith('(((source_profile = ')&&tuple183.endsWith('::timestamp without time zone)))'),'FINAL_REVIEW218_TUPLE183');
 assert.equal(tuple183.split(') OR (').length,2,'FINAL_REVIEW218_TUPLE183');
 assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.match(p.cutoff,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
 const clause=`((source_profile = '${p.profile}'::text) AND (source_sha256 = '${p.sha256}'::text) AND (source_cutoff = '${p.cutoff.replace('T',' ')}'::timestamp without time zone))`;
 return tuple183.slice(0,-1)+' OR '+clause+')';
}

export function buildFinalGrhSourceReviewAdmissionOctober28({read,sourceCommit,major}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok([17,18].includes(major));
 const sourceHashes={};
 for(const [file,digest] of Object.entries(OCT28_SOURCE_PINS)){assert.equal(hash(lf(read(file))),digest,'FINAL_REVIEW218_PREREQUISITE_SOURCE_CHANGED: '+file);sourceHashes[file]=digest;}
 // The unchanged 183 constructor re-checks 144, its prerequisites, registry custody and the two historical tuples.
 const base=buildFinalGrhSourceReviewAdmissionInstallation({read,sourceCommit,major});
 assert.equal(FINAL_REVIEW_ADMISSION_SQL_SHA256,OCT28_SOURCE_PINS[FINAL_REVIEW_ADMISSION_FILE],'FINAL_REVIEW218_HISTORICAL_183_CHANGED');
 assert.deepEqual(FINAL_REVIEW_ADMISSION_PROFILES.map(p=>p.profile),['grh-junin-2026-10-01','grh-junin-2026-10-14'],'FINAL_REVIEW218_HISTORICAL_PROFILES_CHANGED');
 assert.equal(FINAL_REVIEW_ADMISSION_REGISTRY_PARENT_SHA256,OCT28_PARENT_PINS.registry);
 assert.equal(base.registryCustody?.parentRegistrySha256,OCT28_PARENT_PINS.registry);assert.equal(base.registryCustody?.sqlValidityGranted,false);
 // Oct28 tuple values from the reviewed registry candidate only.
 const registry=projectOctober28RegistryParent(read('scripts/lib/grh-source-profiles.json')),candidate=registry.candidateProfile;
 assert.equal(candidate.id,OCT28_REVIEW_ADMISSION_PROFILE.profile);assert.equal(candidate.publicationMode,'candidate_only');
 assert.equal(candidate.source.sha256.toLowerCase(),OCT28_REVIEW_ADMISSION_PROFILE.sha256,'FINAL_REVIEW218_PROFILE_SHA');
 assert.equal(candidate.source.cutoff,OCT28_REVIEW_ADMISSION_PROFILE.cutoff,'FINAL_REVIEW218_PROFILE_CUTOFF');
 assert.deepEqual(JSON.parse(registry.parentRegistryRaw).profiles.find(p=>p.id==='grh-junin-2026-09-10'),JSON.parse(lf(read('scripts/lib/grh-source-profiles.json'))).profiles.find(p=>p.id==='grh-junin-2026-09-10'),'FINAL_REVIEW218_SEPTEMBER10_PROFILE_CHANGED');
 const sql144=lf(read('scripts/migrations/144-final-grh-source-revision.sql'));
 once(sql144,`c.source_sha256='${SEPTEMBER10_BASELINE.sha256}'`,'FINAL_REVIEW218_SEPTEMBER10_BASELINE');once(sql144,`c.source_cutoff=${SEPTEMBER10_BASELINE.cutoff}`,'FINAL_REVIEW218_SEPTEMBER10_BASELINE');
 const tuple183=/\$tuple183\$([^]*?)\$tuple183\$/.exec(lf(read(FINAL_REVIEW_ADMISSION_FILE)))?.[1];assert.ok(tuple183,'FINAL_REVIEW218_TUPLE183');
 const source=lf(read(OCT28_REVIEW_ADMISSION_FILE));assert.equal(hash(source),OCT28_REVIEW_ADMISSION_SQL_SHA256,'FINAL_REVIEW218_SQL_CHANGED');sourceHashes[OCT28_REVIEW_ADMISSION_FILE]=OCT28_REVIEW_ADMISSION_SQL_SHA256;
 const migration=splitPostgresStatements(source);assert.equal(migration.length,1);assert.match(migration[0],/\bDO \$final_review218\$/);
 assert.equal(/\$tuple183\$([^]*?)\$tuple183\$/.exec(source)?.[1],tuple183,'FINAL_REVIEW218_EMBEDDED_TUPLE183');
 const tuple218=/\$tuple218\$([^]*?)\$tuple218\$/.exec(source)?.[1];assert.equal(tuple218,october28Tuple(tuple183),'FINAL_REVIEW218_TUPLE218');
 assert.equal(source.split('ALTER TABLE').length,2);assert.doesNotMatch(source,/\b(GRANT|REVOKE|CREATE|INSERT|UPDATE|DELETE|TRUNCATE|SECURITY\s+DEFINER|OWNER\s+TO|DROP\s+(TABLE|FUNCTION|TRIGGER|POLICY))\b/i);
 // Shapes: the 183 constructor's exact after-shape for tuple183, and the same shape with only that tuple replaced.
 const encoded=tuple=>q(JSON.stringify([[managed,tuple]]));
 const shape183=base.final;once(shape183,encoded(tuple183),'FINAL_REVIEW218_SHAPE_ANCHOR');
 const shape218=shape183.replace(encoded(tuple183),()=>encoded(tuple218));once(shape218,encoded(tuple218),'FINAL_REVIEW218_SHAPE_ANCHOR');
 const state=purpose=>{
  assert.ok(['install','repeat','verify','preflight','rollback'].includes(purpose));
  const readOnly=['verify','preflight'].includes(purpose),from183=['install','preflight'].includes(purpose);
  // R3: modes come from OCT28_EXPECTED_MODE. From 183: install/preflight. From 218: an install becomes a repeat,
  // verify is reported as oct28_verify, rollback as oct28_rollback. The proof assertion requires the same map.
  const M=OCT28_EXPECTED_MODE,from183Mode=purpose==='install'?M.install:M.preflight;
  const from218Mode=purpose==='install'||purpose==='repeat'?M.repeat:purpose==='verify'?M.durable:purpose==='rollback'?M.rollback:from183Mode;
  return `DO $final_review218_state$ DECLARE old_count integer;tuple_count integer;expression text; BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} THEN RAISE EXCEPTION 'FINAL_REVIEW218_TRANSACTION_MODE';END IF;
 IF NOT pg_try_advisory_xact_lock(183) THEN RAISE EXCEPTION 'FINAL_REVIEW218_BUSY';END IF;
 LOCK TABLE ${names.map(n=>'public.'+n).join(',')} IN ACCESS SHARE MODE NOWAIT;
 SELECT count(*) INTO old_count FROM pg_constraint WHERE conrelid='public.grh_final_source_revision'::regclass AND conname IN('grh_final_source_revision_source_profile_check','grh_final_source_revision_source_sha256_check','grh_final_source_revision_source_cutoff_check');
 SELECT count(*),min(pg_get_expr(conbin,conrelid,false)) INTO tuple_count,expression FROM pg_constraint WHERE conrelid='public.grh_final_source_revision'::regclass AND conname=${q(managed)};
 IF old_count<>0 OR tuple_count<>1 THEN RAISE EXCEPTION 'FINAL_REVIEW218_UNREVIEWED_STATE';END IF;
 IF expression=${q(tuple183)} AND ${from183} THEN
 ${purpose==='install'?'LOCK TABLE public.grh_final_source_revision IN ACCESS EXCLUSIVE MODE NOWAIT;':''}
 PERFORM set_config('${prefix}mode',${q(from183Mode)},true);
 ELSIF expression=${q(tuple218)} AND ${purpose!=='preflight'} THEN PERFORM set_config('${prefix}mode',${q(from218Mode)},true);
 ELSE RAISE EXCEPTION 'FINAL_REVIEW218_UNREVIEWED_STATE';END IF;
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'FINAL_REVIEW218_BUSY';END $final_review218_state$`;
 };
 const fingerprint=slot=>`encode(public.digest(current_setting('${prefix}${slot}')::jsonb::text,'sha256'),'hex')`;
 const constraintFingerprint=`(SELECT encode(public.digest(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]')::text,'sha256'),'hex') FROM pg_constraint c WHERE c.conrelid='public.grh_final_source_revision'::regclass AND c.conname=${q(managed)})`;
 // R2: admittedProfiles/tupleState are read from the CHECK present when the proof runs (183 -> 2, 218 -> 3, else null);
 // expectedTupleState is the reviewed expectation of that transaction. assertOctober28AdmissionProof compares both.
 const observed=(when218,when183)=>`(SELECT CASE pg_get_expr(c.conbin,c.conrelid,false) WHEN ${q(tuple218)} THEN ${when218} WHEN ${q(tuple183)} THEN ${when183} END FROM pg_constraint c WHERE c.conrelid='public.grh_final_source_revision'::regclass AND c.conname=${q(managed)} AND c.contype='c')`;
 const observedState=observed("'218'","'183'"),observedProfiles=observed(q(JSON.stringify(OCT28_ADMITTED_PROFILES['218']))+'::jsonb',q(JSON.stringify(OCT28_ADMITTED_PROFILES['183']))+'::jsonb');
 const proof=(transactional,expectedTupleState)=>{assert.ok(['183','218'].includes(expectedTupleState));return `SELECT jsonb_build_object('version',${q(OCT28_PROOF_VERSION)},'sourceCommit',${q(sourceCommit)},'sqlSha256','${OCT28_REVIEW_ADMISSION_SQL_SHA256}','historicalSqlSha256','${FINAL_REVIEW_ADMISSION_SQL_SHA256}','baselineSqlSha256','${OCT28_SOURCE_PINS['scripts/migrations/144-final-grh-source-revision.sql']}','targetMajor',${major},'mode',current_setting('${prefix}mode'),'allChecksPassed',true,'newTables',0,'newFunctions',0,'existingAclChanges',0,'businessWrites',0,'nominalRowsReturned',0,'revisionWritten',false,'activationOrAdoption',false,'expectedTupleState',${q(expectedTupleState)},'tupleState',${observedState},'admittedProfiles',${observedProfiles},'priorTableCount',jsonb_array_length(current_setting('${prefix}after')::jsonb->'tables'),'transactionDataPreserved',${transactional},${transactional?"'beforeFingerprint',"+fingerprint('before')+",":''}'priorFingerprint',${fingerprint('after')},'managedConstraintSha256',${constraintFingerprint}) AS proof`;};
 // Inverse: back to the exact 183 state, refused while any row could depend on the Oct28 tuple.
 const rollbackSql=`DO $final_review218_rollback$ BEGIN
 LOCK TABLE public.grh_final_source_revision IN ACCESS EXCLUSIVE MODE NOWAIT;
 IF EXISTS(SELECT 1 FROM public.grh_final_source_revision WHERE source_profile=${q(OCT28_REVIEW_ADMISSION_PROFILE.profile)} OR source_sha256=${q(OCT28_REVIEW_ADMISSION_PROFILE.sha256)} OR source_cutoff=timestamp ${q(OCT28_REVIEW_ADMISSION_PROFILE.cutoff.replace('T',' '))}) THEN RAISE EXCEPTION 'FINAL_REVIEW218_ROLLBACK_OCT28_EXISTS';END IF;
 ALTER TABLE public.grh_final_source_revision DROP CONSTRAINT ${managed},
 ADD CONSTRAINT ${managed} CHECK((source_profile='grh-junin-2026-10-01' AND source_sha256='50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f' AND source_cutoff=timestamp '2026-10-01 15:17:29') OR (source_profile='grh-junin-2026-10-14' AND source_sha256='3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4' AND source_cutoff=timestamp '2026-10-14 15:18:17'));
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'FINAL_REVIEW218_BUSY';END $final_review218_rollback$`;
 const {settings,destination,before,after,audit,sourcePrerequisite}=base;
 const installation=[...settings,destination,state('install'),sourcePrerequisite.check,shape183,before,...migration,sourcePrerequisite.check,shape218,after,audit,proof(true,OCT28_EXPECTED_TUPLE_STATE.install)];
 const repetition=[...settings,destination,state('repeat'),sourcePrerequisite.check,shape218,before,...migration,sourcePrerequisite.check,shape218,after,audit,proof(true,OCT28_EXPECTED_TUPLE_STATE.repeat)];
 const durableVerification=['SET TRANSACTION READ ONLY',...settings,destination,state('verify'),sourcePrerequisite.check,shape218,after,proof(false,OCT28_EXPECTED_TUPLE_STATE.durable)];
 const preflight=['SET TRANSACTION READ ONLY',...settings,destination,state('preflight'),sourcePrerequisite.check,shape183,after,proof(false,OCT28_EXPECTED_TUPLE_STATE.preflight)];
 const rollback=[...settings,destination,state('rollback'),sourcePrerequisite.check,shape218,before,rollbackSql,sourcePrerequisite.check,shape183,after,audit,proof(true,OCT28_EXPECTED_TUPLE_STATE.rollback)];
 const transaction=(statements,completion,readOnly=false)=>({begin:'BEGIN',statements,completion,readOnly});
 return{version:'final-grh-source-review-admission-october28.v1',sourceCommit,major,target:base.target,sourceHashes,registryCustody:base.registryCustody,
  historical:{sql183Sha256:FINAL_REVIEW_ADMISSION_SQL_SHA256,sql144Sha256:OCT28_SOURCE_PINS['scripts/migrations/144-final-grh-source-revision.sql'],tuple183,profiles183:FINAL_REVIEW_ADMISSION_PROFILES.map(p=>p.profile),parentPins:OCT28_PARENT_PINS,
   note:'183 durable/repeat/rollback no longer pass after 218 by design: they compare the exact two-tuple expression and fail closed.'},
  september10Baseline:SEPTEMBER10_BASELINE,tuple218,managedCheckName:managed,migration,shape183,shape218,preflight,installation,repetition,durableVerification,
  guardedRollback:transaction(rollback,'COMMIT'),transactions:{rehearsal:transaction(installation,'ROLLBACK'),install:transaction(installation,'COMMIT'),durable:transaction(durableVerification,'COMMIT',true),repeat:transaction(repetition,'COMMIT')},
  revisionWritten:false,activationOrAdoption:false,connects:false,executesSql:false};
}

/**
 * R3: a proof is accepted only if it is complete, carries the exact mode its transaction sets, the 144 baseline pin,
 * and the CHECK state it observed is the reviewed end state of that transaction. Crossed modes (a repeat reported
 * as install, a verify reported as repeat), a foreign baseline or any omitted/extra field are rejected.
 */
export function assertOctober28AdmissionProof(proof,{label,sourceCommit,major}){
 assert.ok(Object.hasOwn(OCT28_EXPECTED_TUPLE_STATE,label),'FINAL_REVIEW218_PROOF_LABEL');
 const expected=OCT28_EXPECTED_TUPLE_STATE[label],readOnly=['durable','preflight'].includes(label);
 assert.ok(proof!==null&&typeof proof==='object'&&!Array.isArray(proof),'FINAL_REVIEW218_PROOF_SHAPE');
 assert.deepEqual(Object.keys(proof).sort(),[...PROOF_KEYS,...(readOnly?[]:['beforeFingerprint'])].sort(),'FINAL_REVIEW218_PROOF_FIELDS');
 assert.equal(proof.version,OCT28_PROOF_VERSION,'FINAL_REVIEW218_PROOF_VERSION');assert.equal(proof.sourceCommit,sourceCommit,'FINAL_REVIEW218_PROOF_SOURCE_COMMIT');assert.equal(proof.targetMajor,major,'FINAL_REVIEW218_PROOF_MAJOR');
 assert.equal(proof.sqlSha256,OCT28_REVIEW_ADMISSION_SQL_SHA256,'FINAL_REVIEW218_PROOF_SQL');assert.equal(proof.historicalSqlSha256,FINAL_REVIEW_ADMISSION_SQL_SHA256,'FINAL_REVIEW218_PROOF_HISTORICAL_SQL');
 assert.equal(proof.baselineSqlSha256,OCT28_SOURCE_PINS['scripts/migrations/144-final-grh-source-revision.sql'],'FINAL_REVIEW218_PROOF_BASELINE_SQL');
 assert.equal(proof.mode,OCT28_EXPECTED_MODE[label],'FINAL_REVIEW218_PROOF_MODE');
 assert.equal(proof.allChecksPassed,true,'FINAL_REVIEW218_PROOF_CHECKS');
 assert.equal(proof.expectedTupleState,expected,'FINAL_REVIEW218_PROOF_EXPECTATION');
 assert.equal(proof.tupleState,expected,'FINAL_REVIEW218_PROOF_TUPLE_STATE');
 assert.deepEqual(proof.admittedProfiles,[...OCT28_ADMITTED_PROFILES[expected]],'FINAL_REVIEW218_PROOF_ADMITTED_PROFILES');
 for(const k of ['newTables','newFunctions','existingAclChanges','businessWrites','nominalRowsReturned'])assert.equal(proof[k],0,'FINAL_REVIEW218_PROOF_COUNTS');
 assert.equal(proof.revisionWritten,false,'FINAL_REVIEW218_PROOF_WRITE');assert.equal(proof.activationOrAdoption,false,'FINAL_REVIEW218_PROOF_WRITE');
 assert.equal(proof.transactionDataPreserved,!readOnly,'FINAL_REVIEW218_PROOF_TRANSACTIONAL');
 assert.ok(Number.isSafeInteger(proof.priorTableCount)&&proof.priorTableCount>=3,'FINAL_REVIEW218_PROOF_TABLE_COUNT');
 for(const k of ['priorFingerprint','managedConstraintSha256'])assert.match(proof[k],/^[a-f0-9]{64}$/,'FINAL_REVIEW218_PROOF_FINGERPRINT');
 if(!readOnly)assert.match(proof.beforeFingerprint,/^[a-f0-9]{64}$/,'FINAL_REVIEW218_PROOF_FINGERPRINT');
 return true;
}
