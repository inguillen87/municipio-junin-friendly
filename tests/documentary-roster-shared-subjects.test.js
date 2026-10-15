import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import{splitPostgresStatements}from'../scripts/lib/sql-statements.mjs';
import{buildDocumentarySharedSubjectsInstallation,assertDocumentarySharedSubjectsDurability,DOCUMENTARY_SHARED_FILE,DOCUMENTARY_SHARED_SQL_SHA256,DOCUMENTARY_SHARED_AFTER_SHA256,DOCUMENTARY_SHARED_BEFORE_SHA256}from'../scripts/lib/documentary-roster-shared-subjects-installation.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8'),lf=s=>s.replace(/\r\n?/g,'\n'),hash=s=>createHash('sha256').update(s).digest('hex'),sourceCommit='a'.repeat(40);
const sql=lf(read(DOCUMENTARY_SHARED_FILE)),after=/\$body181\$([\s\S]*?)\$body181\$/.exec(sql)[1];
const source178=lf(read('scripts/migrations/178-adopted-documentary-read.sql'));
const changes=JSON.parse(/\$pins178\$([\s\S]*?)\$pins178\$/.exec(source178)[1]).find(p=>p.signature.startsWith('public.payroll_export_roster_v1('));
let prior=splitPostgresStatements(lf(read('scripts/migrations/054-payroll-export-roster.sql'))).find(s=>s.startsWith('CREATE OR REPLACE FUNCTION payroll_export_roster_v1('));
for(const[from,to]of changes.changes){assert.equal(prior.split(from).length,2);prior=prior.replace(from,()=>to);}
const before=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(prior)[2];
const batch=buildDocumentarySharedSubjectsInstallation({read,sourceCommit,major:17});

test('181 pins the exact178 roster and refuses source changes before generating any batch',()=>{
 assert.equal(hash(before),DOCUMENTARY_SHARED_BEFORE_SHA256);assert.equal(hash(after),DOCUMENTARY_SHARED_AFTER_SHA256);assert.equal(hash(sql),DOCUMENTARY_SHARED_SQL_SHA256);
 assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);assert.equal(batch.migration.length,1);
 for(const file of[DOCUMENTARY_SHARED_FILE,'scripts/migrations/178-adopted-documentary-read.sql'])assert.throws(()=>buildDocumentarySharedSubjectsInstallation({sourceCommit,major:17,read:p=>read(p)+(p===file?'\n-- unreviewed':'')}));
 assert.throws(()=>buildDocumentarySharedSubjectsInstallation({read,sourceCommit,major:16}));
});

test('authentication, dataset bounds, complete report hash, private envelope and immutable audit stay byte identical',()=>{
 const prefix=before.slice(0,before.indexOf(' SELECT coalesce(jsonb_agg(jsonb_build_object('));assert.ok(after.startsWith(prefix));
 const answer=before.slice(before.indexOf(' answer:=jsonb_build_object('),before.indexOf(' -- This projection is private'));assert.ok(after.includes(answer));
 const suffix=before.slice(before.indexOf(" directory_value:=jsonb_build_object("));assert.ok(after.endsWith(suffix));
 const audit=before.slice(before.indexOf(' INSERT INTO payroll_export_roster_read_event('));assert.ok(after.endsWith(audit));
 assert.equal(after.split('action_center_assert_tenant_read_session_v2(').length,2);
 assert.equal(after.split('INSERT INTO ').length,2);assert.doesNotMatch(after,/\b(?:UPDATE|DELETE|TRUNCATE|GRANT)\b/);
});

test('one compact shared subject per candidate keeps nulls and ambiguity without filtering a UI selection',()=>{
 assert.equal(before.split('payroll_document_subject_v1(ctx,').length,3);assert.equal(after.split('payroll_document_subject_v1(ctx,').length,2);
 assert.match(after,/documentary_candidates AS MATERIALIZED/);assert.match(after,/documentary_subjects AS MATERIALIZED/);
 assert.match(after,/subject\.value IS NOT NULL AS present/);assert.match(after,/count\(\*\) FILTER\(WHERE resolved\.present\)::integer AS n/);
 assert.match(after,/min\(resolved\.cutoff\) AS cutoff/);assert.match(after,/::timestamptz AS cutoff/);
 assert.match(after,/source_person_id IS NOT NULL AND employee\.person_id::text=resolved\.source_person_id/);
 assert.match(after,/ORDER BY resolved\.contract_id/);assert.doesNotMatch(after,/\bDISTINCT\b|\bLIMIT\b|fromSector|toSector|fromNumber|toNumber/);
 assert.equal(after.split('grh_effective_employees_v1').length,2);assert.match(after,/effective_directory AS MATERIALIZED/);
 assert.ok(!after.includes('jsonb_agg(subject.value)'));assert.ok(!after.includes('jsonb_agg(to_jsonb(candidate))'));
});

test('both observed database variants keep their existing detail/library guard and helper owner-only contract',()=>{
 const other=buildDocumentarySharedSubjectsInstallation({read,sourceCommit,major:18});
 assert.deepEqual(batch.beforePins.map(p=>p.name),other.beforePins.map(p=>p.name));
 assert.notEqual(batch.beforePins[0].sha256,other.beforePins[0].sha256);assert.notEqual(batch.beforePins[1].sha256,other.beforePins[1].sha256);
 for(const b of[batch,other]){
  assert.equal(b.beforePins.length,4);assert.equal(b.afterPins.length,4);
  assert.deepEqual(b.beforePins.filter(p=>p.name!=='payroll_export_roster_v1'),b.afterPins.filter(p=>p.name!=='payroll_export_roster_v1'));
  const helper=b.afterPins.find(p=>p.name==='payroll_document_subject_v1');assert.equal(helper.runtime,false);assert.equal(helper.sha256,'b92e8220de522a9644bca8ccc5261c1a345101f88ae046e4519d36b42c48c7dd');
  assert.equal(b.beforePins.find(p=>p.name==='payroll_export_roster_v1').sha256,DOCUMENTARY_SHARED_BEFORE_SHA256);
  assert.equal(b.afterPins.find(p=>p.name==='payroll_export_roster_v1').sha256,DOCUMENTARY_SHARED_AFTER_SHA256);
 }
 assert.match(sql,/grantee<>helper\.proowner/);assert.match(sql,/to_jsonb\(updated\)-'prosrc' IS DISTINCT FROM to_jsonb\(prior\)-'prosrc'/);
 assert.match(sql,/proargnames/);assert.match(sql,/proparallel/);assert.match(sql,/is_grantable/);
});

test('conservation includes the private helper and all other bodies, leave data, sequences, roles and metadata',()=>{
 assert.match(batch.before,/CASE WHEN p\.oid=to_regprocedure\('public\.payroll_export_roster_v1/);
 assert.ok(!batch.before.includes("AND p.oid IS DISTINCT FROM to_regprocedure('public.payroll_document_subject_v1(jsonb,uuid)')"));
 assert.ok(!batch.before.includes("LIKE 'native_leave_%'"));assert.ok(!batch.before.includes("to_regclass('public.native_leave_event')"));
 for(const key of["'tables'","'sequences'","'roles'","'memberships'","'triggers'","'defaultAcl'","'views'","'types'","'attributes'","'indexes'","'eventTriggers'"])assert.ok(batch.before.includes(key));
 assert.match(batch.audit,/IS DISTINCT FROM/);assert.equal(batch.transactions.rehearsal.completion,'ROLLBACK');assert.equal(batch.transactions.install.completion,'COMMIT');assert.equal(batch.transactions.repeat.completion,'COMMIT');assert.equal(batch.transactions.durable.readOnly,true);
 assert.ok(batch.durableVerification.includes('SET TRANSACTION READ ONLY'));
});

test('durability requires own transaction equality and unchanged objects but does not claim later rows are static',()=>{
 const proof={version:'documentary-shared-subjects-installation.v1',sourceCommit,sqlSha256:DOCUMENTARY_SHARED_SQL_SHA256,baselineSqlSha256:hash(source178),targetMajor:17,allChecksPassed:true,mode:'install',newTables:0,newFunctions:0,adaptedReaders:1,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,priorTableCount:225,transactionDataPreserved:true,beforeFingerprint:'a'.repeat(64),priorFingerprint:'a'.repeat(64),priorMetadataSha256:'b'.repeat(64),objectsFingerprint:'c'.repeat(64)};
 const{beforeFingerprint,...withoutBefore}=proof,durable={...withoutBefore,mode:'verify',transactionDataPreserved:false,priorFingerprint:'d'.repeat(64)},repeated={...proof,mode:'repeat',beforeFingerprint:'e'.repeat(64),priorFingerprint:'e'.repeat(64)};
 assert.equal(assertDocumentarySharedSubjectsDurability({installed:proof,durable,repeated,sourceCommit,major:17}).wholeDatabaseStaticAcrossConnections,false);
 for(const patch of[{existingAclChanges:1},{businessWrites:1},{allChecksPassed:false},{priorMetadataSha256:'f'.repeat(64)},{objectsFingerprint:'f'.repeat(64)},{targetMajor:18},{transactionDataPreserved:true},{mode:'install'},{sqlSha256:'e'.repeat(64)}])assert.throws(()=>assertDocumentarySharedSubjectsDurability({installed:proof,durable:{...durable,...patch},repeated,sourceCommit,major:17}));
 assert.throws(()=>assertDocumentarySharedSubjectsDurability({installed:proof,durable,repeated:{...repeated,beforeFingerprint:'f'.repeat(64)},sourceCommit,major:17}));
});
