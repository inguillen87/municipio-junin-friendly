import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
import {buildFinalGrhSourceReviewAdmissionInstallation,assertFinalGrhSourceReviewAdmissionDurability,finalReviewAdmissionSnapshot,FINAL_REVIEW_ADMISSION_FILE,FINAL_REVIEW_ADMISSION_SQL_SHA256,FINAL_REVIEW_ADMISSION_PROFILES} from '../scripts/lib/final-grh-source-review-admission-installation.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),sourceCommit='a'.repeat(40),build=major=>buildFinalGrhSourceReviewAdmissionInstallation({read,sourceCommit,major}),hash=s=>createHash('sha256').update(s.replace(/\r\n?/g,'\n')).digest('hex'),source=read(FINAL_REVIEW_ADMISSION_FILE),batch=build(17);

test('review construction admits only the two existing destinations and cannot execute SQL',()=>{
 for(const major of[17,18]){const b=build(major);assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.sourcePrerequisite.pins.length,9);assert.equal(b.migration.length,1);assert.equal(b.target.major,major);assert.ok(b.destination.includes(b.target.projectId)&&b.destination.includes(b.target.branchId)&&b.destination.includes(b.target.endpointId)&&b.destination.includes(b.target.guardOid));assert.ok(b.destination.includes(major===17?'16395':'16396'));assert.deepEqual(Object.keys(b.transactions).sort(),['durable','install','rehearsal','repeat']);assert.equal(b.transactions.rehearsal.completion,'ROLLBACK');assert.equal(b.transactions.install.completion,'COMMIT');assert.equal(b.transactions.durable.readOnly,true);assert.equal(b.transactions.repeat.completion,'COMMIT');}
 assert.throws(()=>build(16));assert.throws(()=>buildFinalGrhSourceReviewAdmissionInstallation({read,sourceCommit:'not-a-commit',major:17}));
});

test('both complete source tuples match committed candidate profiles, with no default or mixed pair',()=>{
 const profiles=JSON.parse(read('scripts/lib/grh-source-profiles.json'));
 assert.equal(FINAL_REVIEW_ADMISSION_PROFILES.length,2);
 for(const p of FINAL_REVIEW_ADMISSION_PROFILES){const found=profiles.profiles.find(v=>v.id===p.profile);assert.equal(found.source.sha256.toLowerCase(),p.sha256);assert.equal(found.source.cutoff,p.cutoff);assert.equal(found.publicationMode,'candidate_only');assert.ok(source.includes("source_profile='"+p.profile+"'\n     AND source_sha256='"+p.sha256+"'\n     AND source_cutoff=timestamp '"+p.cutoff.replace('T',' ')+"'"));}
 assert.equal((source.match(/ADD CONSTRAINT grh_final_source_revision_source_tuple_check CHECK/g)||[]).length,1);assert.equal((source.match(/DROP CONSTRAINT grh_final_source_revision_source_/g)||[]).length,3);assert.doesNotMatch(source,/source_(?:profile|sha256|cutoff)\s+IN\s*\(/i);
});

test('reviewed source hashes include unchanged144 and reject arbitrary SQL or profile drift',()=>{
 assert.equal(hash(source),FINAL_REVIEW_ADMISSION_SQL_SHA256);assert.equal(splitPostgresStatements(source).length,1);
 for(const file of Object.keys(batch.sourceHashes))assert.throws(()=>buildFinalGrhSourceReviewAdmissionInstallation({sourceCommit,major:17,read:p=>read(p)+(p===file?'\n-- unreviewed':'')}));
 assert.equal(batch.sourcePrerequisite.pins.filter(p=>p.result.startsWith('TABLE(')).length,3);assert.ok(batch.sourcePrerequisite.pins.some(p=>p.result==='text[]'));
});

test('baseline and final constraint expressions, flags and names are checked under bounded locks',()=>{
 assert.match(source,/pg_get_expr\(conbin,conrelid,false\)=item\.expression/);assert.match(source,/pg_get_expr\(conbin,conrelid,false\)=tuple_expression/);
 for(const text of['convalidated','conislocal','coninhcount=0','conparentid=0','NOT condeferrable','NOT condeferred','NOT connoinherit','conenforced'])assert.ok(source.includes(text));
 assert.ok(batch.initial.includes('FINAL_REVIEW_CHECK_SHAPE'));assert.ok(batch.initial.includes('pg_get_expr(c.conbin,c.conrelid,false)'));
 assert.match(batch.installation.join('\n'),/pg_try_advisory_xact_lock\(183\)/);assert.match(source,/ACCESS EXCLUSIVE MODE NOWAIT/);assert.match(batch.installation.join('\n'),/managed_before/);
 assert.ok(batch.installation.findIndex(s=>s.includes('ACCESS SHARE MODE NOWAIT'))<batch.installation.indexOf(batch.before));
});

test('all three private tables keep their columns, defaults, FK, keys, indexes and eight triggers',()=>{
 const shape=batch.final;
 for(const text of['FINAL_REVIEW_COLUMN_SHAPE','FINAL_REVIEW_FOREIGN_SHAPE','FINAL_REVIEW_KEY_SHAPE','FINAL_REVIEW_CHECK_SHAPE','FINAL_REVIEW_INDEX_SHAPE','FINAL_REVIEW_TRIGGER_SHAPE','FINAL_REVIEW_TABLE_PROTECTION','FINAL_REVIEW_CONSTRAINT_FLAGS'])assert.ok(shape.includes(text));
 for(const text of['gen_random_uuid()','txid_current()','clock_timestamp()','parent_core_version_id','parent_curated_version_id','platform_tenant_source_binding','previous_record','fingerprints','tgtype','tgenabled','tginitdeferred','tgparentid','pg_policy','attisdropped','attidentity','attgenerated','attacl','conenforced','RI_FKey_check_ins','RI_FKey_noaction_del','indisvalid','indimmediate'])assert.ok(shape.includes(text),text);
 assert.match(shape,/current_setting\('server_version_num'\)::int>=180000/);assert.match(shape,/a\.grantee<>r\.relowner/);
 assert.ok(shape.includes("contype='t')<>(CASE WHEN item->>'name'='grh_final_source_revision' THEN 1 ELSE 0 END)"));assert.ok(shape.includes("contype='n')<>(CASE WHEN current_setting('server_version_num')::int>=180000 THEN(SELECT count(*) FROM pg_attribute WHERE attrelid=relation AND attnum>0 AND attnotnull) ELSE 0 END)"));assert.doesNotMatch(shape,/<>CASE WHEN/);
 assert.equal(batch.sourcePrerequisite.pins.length,9);assert.ok(batch.sourcePrerequisite.check.includes('FINAL_ADOPTION_SOURCE_METADATA'));
});

test('conservation excludes only four managed constraints, retaining native leave and every old row',()=>{
 const snapshot=finalReviewAdmissionSnapshot('before');
 assert.ok(!snapshot.includes("to_regclass('public.native_leave_event')"));assert.ok(!snapshot.includes("LIKE 'native_leave_%'"));assert.ok(!snapshot.includes("-'prosrc'"));
 for(const name of batch.managedCheckNames)assert.ok(snapshot.includes(name));assert.ok(snapshot.includes("k.conrelid='public.grh_final_source_revision'::regclass"));
 for(const text of["'tables'","'sequences'","'functions'","'triggers'","'roles'","'memberships'","'defaultAcl'","'types'","'attributes'","'indexes'","'eventTriggers'","'ownership'","'policies'","'r','p','m'"])assert.ok(snapshot.includes(text),text);
 assert.match(snapshot,/SELECT count\(\*\),encode/);assert.match(batch.audit,/before'\)::jsonb IS DISTINCT FROM current_setting\('municontrol_final_review.after/);
});

test('durable verification has no DDL or writes, while repeat refuses the before state',()=>{
 const durable=batch.durableVerification.join('\n'),code=durable.replace(/'(?:[^']|'')*'/g,"''");assert.equal(batch.durableVerification[0],'SET TRANSACTION READ ONLY');assert.doesNotMatch(code,/\b(?:ALTER|CREATE|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/);
 assert.ok(batch.repetition.includes(batch.migration[0]));assert.ok(batch.repetition.some(s=>s.includes('old_count=3 AND new_count=0 AND false')));
 assert.doesNotMatch(source,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|CREATE\s+FUNCTION|CREATE\s+TABLE)\b/);
});

test('guarded rollback rejects every14October component before restoring old checks, without deletion',()=>{
 const statements=batch.guardedRollback.statements,rollback=statements.find(s=>s.includes('DO $final_review_rollback$'));assert.ok(rollback);assert.equal(batch.guardedRollback.completion,'COMMIT');assert.equal(batch.guardedRollback.readOnly,false);
 assert.ok(rollback.indexOf('FINAL_REVIEW_ROLLBACK_NEW_SOURCE_EXISTS')<rollback.indexOf('ALTER TABLE'));
 assert.match(rollback,/IF EXISTS\(SELECT 1 FROM public\.grh_final_source_revision WHERE source_profile='grh-junin-2026-10-14' OR source_sha256='3efa61a7[0-9a-f]+' OR source_cutoff=timestamp '2026-10-14 15:18:17'\)/);
 assert.equal((rollback.match(/ADD CONSTRAINT /g)||[]).length,3);assert.equal((rollback.match(/DROP CONSTRAINT /g)||[]).length,1);assert.doesNotMatch(rollback,/\b(?:DELETE|TRUNCATE|UPDATE|INSERT|CASCADE)\b/);
 assert.ok(statements.includes(batch.before)&&statements.includes(batch.after)&&statements.includes(batch.audit));
});

function proofs(major=17){const installed={version:batch.version,sourceCommit,sqlSha256:FINAL_REVIEW_ADMISSION_SQL_SHA256,baselineSqlSha256:batch.sourceHashes['scripts/migrations/144-final-grh-source-revision.sql'],targetMajor:major,mode:'install',allChecksPassed:true,newTables:0,newFunctions:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,managedCheckNames:batch.managedCheckNames,priorTableCount:225,transactionDataPreserved:true,beforeFingerprint:'a'.repeat(64),priorFingerprint:'a'.repeat(64),priorMetadataSha256:'b'.repeat(64),managedConstraintsSha256:'c'.repeat(64),sourceRowsSha256:'d'.repeat(64)}, {beforeFingerprint,...rest}=installed;return{installed,durable:{...rest,mode:'verify',transactionDataPreserved:false,priorFingerprint:'e'.repeat(64),sourceRowsSha256:'f'.repeat(64)},repeated:{...installed,mode:'repeat',beforeFingerprint:'9'.repeat(64),priorFingerprint:'9'.repeat(64)}};}
test('proofs preserve each transaction without claiming unrelated live rows are static across connections',()=>{
 for(const major of[17,18]){const p=proofs(major),result=assertFinalGrhSourceReviewAdmissionDurability({...p,sourceCommit,major});assert.equal(result.passed,true);assert.equal(result.wholeDatabaseStaticAcrossConnections,false);assert.equal(result.sourceActivated,false);}
});
test('proof validation rejects widened scope, partial modes, metadata drift and hidden fields',()=>{
 for(const patch of[{businessWrites:1},{newTables:1},{newFunctions:1},{existingAclChanges:1},{nominalRowsReturned:1},{mode:'install'},{transactionDataPreserved:true},{targetMajor:18},{sourceCommit:'b'.repeat(40)},{allChecksPassed:false},{managedConstraintsSha256:'d'.repeat(64)},{priorMetadataSha256:'e'.repeat(64)},{managedCheckNames:[]},{hidden:true}]){const p=proofs();assert.throws(()=>assertFinalGrhSourceReviewAdmissionDurability({...p,durable:{...p.durable,...patch},sourceCommit,major:17}));}
 const p=proofs();assert.throws(()=>assertFinalGrhSourceReviewAdmissionDurability({...p,repeated:{...p.repeated,beforeFingerprint:'d'.repeat(64)},sourceCommit,major:17}));
});
