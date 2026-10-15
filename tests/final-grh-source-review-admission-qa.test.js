import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildFinalGrhSourceReviewAdmissionInstallation} from '../scripts/lib/final-grh-source-review-admission-installation.mjs';
import {finalReviewAdmissionQaFoundation,relocateFinalReviewAdmissionInstallation,finalReviewAdmissionQaGlobalSnapshot,finalReviewAdmissionQaOptions,finalReviewAdmissionQaTransaction,finalReviewAdmissionQaSeed,finalReviewAdmissionQaDirectory,finalReviewAdmissionQaDirectoryPredicate,finalReviewAdmissionQaCleanup} from '../scripts/lib/final-grh-source-review-admission-qa.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');

test('183 QA relocates all nine canonical144 bodies without replacing metadata or source tuples',()=>{
 for(const major of[17,18]){
  const qa=finalReviewAdmissionQaFoundation(major),b=buildFinalGrhSourceReviewAdmissionInstallation({read,major,sourceCommit:'a'.repeat(40)}),r=relocateFinalReviewAdmissionInstallation(b,qa,{read,databaseOid:12345});
  assert.equal(r.productionCompatible,false);assert.equal(r.transport,'existing-loopback-only');assert.equal(r.connects,false);assert.equal(r.executesSql,false);
  assert.equal(r.relocation.originalPins.length,9);assert.equal(r.relocation.relocatedPins.length,9);assert.equal(r.relocation.metadataChecksRemoved,0);assert.equal(r.relocation.sourceTuplesChanged,false);
  for(const p of r.sourcePrerequisite.pins){assert.ok(p.signature.startsWith(qa.schema+'.'));assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.ok(r.sourcePrerequisite.check.includes(p.sha256));}
  assert.ok(r.sourcePrerequisite.check.includes('FINAL_ADOPTION_SOURCE_METADATA'));assert.ok(r.sourcePrerequisite.check.includes('FINAL_ADOPTION_SOURCE_PROTECTION'));assert.ok(!r.sourcePrerequisite.check.includes("'public'||'.'"));
  assert.ok(r.destination.includes("host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'"));assert.ok(r.destination.includes('inet_server_port()<>'+String(55400+major)));assert.ok(r.destination.includes('<>12345::oid'));assert.ok(r.destination.includes("current_user<>'postgres'"));
  for(const[name,t]of Object.entries(r.transactions)){
   assert.equal(t.completion,b.transactions[name].completion);assert.equal(t.readOnly,b.transactions[name].readOnly);assert.equal(t.statements.length,b.transactions[name].statements.length);assert.ok(t.statements.includes(r.destination));assert.ok(t.statements.includes(r.sourcePrerequisite.check));
   const sql=t.statements.join('\n');assert.ok(!sql.includes('neondb_owner'));assert.ok(!sql.includes(b.target.endpointId));assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|DATABASE)\b/i);
   const proof=t.statements.at(-1);assert.ok(proof.includes("value->>'schema'='"+qa.schema+"'"));assert.ok(!proof.includes("value->>'schema'='public'"));for(const table of['grh_final_source_revision','grh_final_source_delta','grh_final_source_seal'])assert.ok(proof.includes("'"+table+"'"));
  }
  const migration=qa.normalized(b.migration[0]);assert.equal(hash(migration),r.relocation.relocatedMigrationSha256);
  for(const literal of['grh-junin-2026-10-01','grh-junin-2026-10-14','2026-10-01 15:17:29','2026-10-14 15:18:17'])assert.ok(migration.includes(literal));
 }
});

test('183 relocation rejects arbitrary source, schemas, database OIDs and metadata omissions',()=>{
 const qa=finalReviewAdmissionQaFoundation(18),b=buildFinalGrhSourceReviewAdmissionInstallation({read,major:18,sourceCommit:'a'.repeat(40)});
 for(const databaseOid of[0,-1,1.5,4294967296,NaN])assert.throws(()=>relocateFinalReviewAdmissionInstallation(b,qa,{read,databaseOid}));
 assert.throws(()=>relocateFinalReviewAdmissionInstallation(b,{...qa,schema:'public'},{read,databaseOid:1}));
 assert.throws(()=>relocateFinalReviewAdmissionInstallation(b,qa,{read:p=>read(p).replace(' SELECT ARRAY[',' SELECT  ARRAY['),databaseOid:1}));
 assert.throws(()=>relocateFinalReviewAdmissionInstallation({...b,sourcePrerequisite:{...b.sourcePrerequisite,check:b.sourcePrerequisite.check.replace(b.sourcePrerequisite.pins[0].sha256,'b'.repeat(64))}},qa,{read,databaseOid:1}));
 const definitions=splitPostgresStatements(read('scripts/migrations/144-final-grh-source-revision.sql')).filter(s=>s.startsWith('CREATE FUNCTION public.grh_final_source_'));
 assert.equal(definitions.length,9);for(const definition of definitions){const changed=read('scripts/migrations/144-final-grh-source-revision.sql').replace(definition,definition.replace('AS $$','AS $$\n-- unreviewed body'));assert.throws(()=>relocateFinalReviewAdmissionInstallation(b,qa,{read:p=>p.endsWith('144-final-grh-source-revision.sql')?changed:read(p),databaseOid:1}));}
});

test('cleanup footprint includes every constraint and native leave instead of a nonexistent public fixture',()=>{
 const sql=finalReviewAdmissionQaGlobalSnapshot();assert.ok(!sql.includes("'public.grh_final_source_revision'::regclass"));assert.ok(!sql.includes("to_regclass('public.native_leave_event')"));assert.ok(!sql.includes("LIKE 'native_leave_%'"));assert.ok(sql.includes('FROM pg_constraint k WHERE k.conrelid=c.oid)'));assert.ok(sql.includes("'eventTriggers'"));assert.ok(sql.includes("'defaultAcl'"));
});

test('183 QA accepts only existing local17/18 destinations and a bounded evidence path',()=>{
 assert.deepEqual(finalReviewAdmissionQaOptions(['--major=18','--source-commit='+'f'.repeat(40),'--output=verification/review183-r1']),{major:18,sourceCommit:'f'.repeat(40),output:'verification/review183-r1'});
 for(const extra of['--host=127.0.0.1','--transport=ci','--database=other','--port=5432','--major=17'])assert.throws(()=>finalReviewAdmissionQaOptions(['--major=18','--source-commit='+'f'.repeat(40),'--output=verification/review183-r1',extra]));
 for(const output of['.handoff/other','verification/../outside','C:/temp/other','verification/a/b'])assert.throws(()=>finalReviewAdmissionQaOptions(['--major=18','--source-commit='+'f'.repeat(40),'--output='+output]));
});

test('read-only starts in BEGIN before any identity query and canonical fixture is guarded before its first DDL',()=>{
 const qa=finalReviewAdmissionQaFoundation(18),guard="DO $qa183$ BEGIN PERFORM current_setting('data_directory');END $qa183$",sql=finalReviewAdmissionQaTransaction({statements:['SET TRANSACTION READ ONLY','SELECT 1'],schema:qa.schema,guard}),statements=splitPostgresStatements(sql);
 assert.equal(statements[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.ok(!statements.slice(1).some(s=>s.startsWith('SET TRANSACTION ')));assert.ok(statements.indexOf(guard)<statements.indexOf('SELECT 1'));
 assert.throws(()=>finalReviewAdmissionQaTransaction({statements:['SET TRANSACTION READ WRITE'],schema:qa.schema,guard}));assert.throws(()=>finalReviewAdmissionQaTransaction({statements:['SET TRANSACTION READ ONLY','SET TRANSACTION READ ONLY'],schema:qa.schema,guard}));
 const original=splitPostgresStatements(qa.sql),seed=splitPostgresStatements(finalReviewAdmissionQaSeed(qa,guard));assert.equal(seed.length,original.length+1);assert.equal(seed[3],guard);assert.deepEqual(seed.filter(s=>s!==guard),original);assert.ok(seed[4].indexOf(qa.pins)<seed[4].search(/\bCREATE\s+SCHEMA\b/i));
 assert.throws(()=>finalReviewAdmissionQaSeed({...qa,pins:'not present'},guard));
});

test('local directory guard normalizes separators only and still refuses another directory or case',()=>{
 const windows=String.raw`C:\Users\guill\Documents\Codex\MuniControl\verification\postgresql-qa-20261004\pg18-data`,forward=windows.replaceAll('\\','/');
 assert.equal(finalReviewAdmissionQaDirectory(windows),forward);assert.equal(finalReviewAdmissionQaDirectory(forward),forward);
 for(const wrong of[forward+'-other',forward.replace('pg18-data','pg17-data'),forward.toLowerCase(),forward+'/../pg18-data'])assert.notEqual(finalReviewAdmissionQaDirectory(wrong),forward);
 assert.equal(finalReviewAdmissionQaDirectoryPredicate(windows),`replace(current_setting('data_directory'),chr(92),'/') IS DISTINCT FROM '${forward}'`);
 for(const invalid of['/tmp/pg18','relative',forward+'\0'])assert.throws(()=>finalReviewAdmissionQaDirectoryPredicate(invalid));
});

test('fixed psql transport suppresses command tags and projects OID as a JSON-safe integer without parser coercion',()=>{
 const runner=read('scripts/verify-final-grh-source-review-admission.mjs');
 assert.ok(runner.includes("args=['-X','--quiet','--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port',String(55400+major),'--username','postgres','--dbname','own_payroll_run_qa','--no-password','--tuples-only','--no-align']"));
 assert.ok(runner.includes("'databaseOid',(SELECT oid::bigint FROM pg_database WHERE datname=current_database())"));
 assert.ok(runner.includes('Number.isSafeInteger(identity.databaseOid)'));assert.ok(runner.includes('databaseOid:identity.databaseOid'));assert.ok(!runner.includes('Number(identity.databaseOid)'));
 assert.ok(Number.isSafeInteger(JSON.parse('{"databaseOid":4294967295}').databaseOid));assert.equal(Number.isSafeInteger(JSON.parse('{"databaseOid":"23117"}').databaseOid),false);assert.throws(()=>JSON.parse('{"databaseOid":23117}\nCOMMIT'));
 assert.ok(runner.includes('run(protocol(local.transactions.rehearsal,mutation),error)'));assert.ok(!runner.includes('local.preflight.filter'));
});

test('cleanup permits only internally linked owner TOAST objects while retaining external-dependency rejection',()=>{
 const schema='mc_qa_fixed_092_'+'a'.repeat(32),parts=finalReviewAdmissionQaCleanup(schema);assert.equal(parts.length,2);assert.equal(parts[1],'DROP SCHEMA '+schema+' CASCADE');
 for(const literal of["object.schema='pg_toast'","d.classid='pg_class'::regclass",'d.objsubid=0','owner_table.relnamespace=\''+schema+"'::regnamespace",'owner_table.relowner=current_user::regrole','owner_table.reltoastrelid=d.objid','toast_index.indrelid=owner_table.reltoastrelid','toast_index.indexrelid=d.objid','FINAL_REVIEW_QA_EXTERNAL_DEPENDENCY','pg_event_trigger','pg_extension'])assert.ok(parts[0].includes(literal),literal);
 assert.throws(()=>finalReviewAdmissionQaCleanup('public'));assert.throws(()=>finalReviewAdmissionQaCleanup(schema+';DROP SCHEMA public'));
});
