import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildNativeFamilySchoolingQa} from '../scripts/verify-native-family-schooling-sql.mjs';

test('102 emits actual migration with rollback-only fixtures for PostgreSQL17 and18',()=>{
 const sql=fs.readFileSync(new URL('../scripts/migrations/102-native-family-schooling.sql',import.meta.url),'utf8').replaceAll('\r\n','\n');
 for(const serverMajor of [17,18]){
  const qa=buildNativeFamilySchoolingQa({serverMajor});
  assert.equal(qa.report.serverMajor,serverMajor);
  assert.equal(qa.report.migration102Sha256,createHash('sha256').update(sql).digest('hex'));
  assert.ok(qa.report.nativeFamilyChecksPassed>=100);
  assert.match(qa.sql,/current_database\(\)<>'native_family_schooling_qa'/);
  assert.match(qa.sql,/BEGIN ISOLATION LEVEL READ COMMITTED/);
  assert.match(qa.sql,/ROLLBACK;\s*$/);
  assert.doesNotMatch(qa.sql,/^\s*COMMIT\s*;|INSERT\s+INTO\s+public\./im);
  assert.match(qa.sql,/native family context preserves exact093 eight-key subject/);
  assert.match(qa.sql,/later identity drift cannot hide original declaration receipt/);
  assert.match(qa.sql,/TABLE output type drift with identical body/);
  assert.match(qa.sql,/effective runtime role can read native evidence/);
 }
});

test('native family concurrency uses a real independent lock and release handshake',()=>{
 const qa=buildNativeFamilySchoolingQa({serverMajor:17,requireConcurrency:true});
 assert.equal(qa.report.nativeFamilyConcurrentLockChecked,true);
 assert.match(qa.sql,/pid<>pg_backend_pid\(\)/);
 assert.match(qa.sql,/family declaration cannot race another delivery/);
 assert.match(qa.sql,/lost acknowledgement lookup waits for the same delivery boundary/);
 assert.match(qa.lockSql,/FIXED_NOVELTIES_QA_LOCK_READY/);
 assert.match(qa.lockSql,/native-family-qa-finished:/);
 assert.match(qa.lockSql,/NATIVE_FAMILY_QA_MAIN_TIMEOUT/);
 assert.doesNotMatch(qa.lockSql,/pg_sleep\(45\)/);
 assert.ok(qa.report.limitations.some(x=>x.includes('not represented as simultaneous committed writers')));
});

test('unsupported PostgreSQL versions cannot generate the local SQL harness',()=>{
 for(const serverMajor of [undefined,0,16,19,'17;DROP DATABASE anything'])assert.throws(()=>buildNativeFamilySchoolingQa({serverMajor}));
});

test('102 preserves GRH sources and original facades while pinning actual099 bodies',()=>{
 const sql=fs.readFileSync(new URL('../scripts/migrations/102-native-family-schooling.sql',import.meta.url),'utf8');
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION (?:public\.)?(?:native_employee_|payroll_fixed_registry_|employee_family_declare_v1|employee_family_subject_v1|school_certificate_read_v[1-4])\(/);
 assert.doesNotMatch(sql,/INSERT INTO (?:public\.)?(?:iam_|employment_contract|person_identity|source_import_batch|native_employee_registration|grh_)/);
 assert.match(sql,/7399536671de9f89d8e6f9b41ff576e85ba5492635328b96dc945663bd1a95df/);
 assert.match(sql,/005d2b345096096e42741cfd5c627796f79d45a77ead65527bdd3a8f3dd71845/);
 assert.match(sql,/f35312befb20cf0479a5d028806688f1469abb8e25bbd7c677c8c77970cfc724/);
 assert.match(sql,/p\.proallargtypes/);
 assert.match(sql,/pg_get_expr\(p\.proargdefaults,0\)/);
 assert.match(sql,/employee_family_native_pair_ck/);
 assert.match(sql,/school_certificate_native_registration_fk/);
 assert.match(sql,/PERFORM public\.grh_curated_source_read_lock_v1\(\)/);
});
