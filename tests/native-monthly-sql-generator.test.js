import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildNativeMonthlyQa} from '../scripts/verify-native-monthly-novelties-sql.mjs';

test('native monthly generator emits actual pinned SQL and rollback-only fixtures for both supported majors',()=>{
 const migration=fs.readFileSync(new URL('../scripts/migrations/101-native-monthly-novelties.sql',import.meta.url),'utf8').replaceAll('\r\n','\n');
 for(const serverMajor of [17,18]){
  const qa=buildNativeMonthlyQa({serverMajor});
  assert.equal(qa.report.serverMajor,serverMajor);
  assert.equal(qa.report.migration101Sha256,createHash('sha256').update(migration).digest('hex'));
  assert.match(qa.sql,/current_database\(\)<>'native_monthly_qa'/);
  assert.match(qa.sql,/BEGIN ISOLATION LEVEL READ COMMITTED/);
  assert.match(qa.sql,/ROLLBACK;\s*$/);
  assert.doesNotMatch(qa.sql,/\bCOMMIT\b|INSERT\s+INTO\s+public\./i);
  assert.ok(qa.report.nativeMonthlyChecksPassed>=90);
  assert.match(qa.sql,/pre-101 GRH replay preserves the historical receipt/);
  assert.match(qa.sql,/all native replays retain exact original receipts after later transitions/);
  assert.match(qa.sql,/101 rejects altered provenance pair constraint/);
  assert.match(qa.sql,/ALTER ROLE municontrol_actions_runtime_app LOGIN/);
  assert.match(qa.sql,/ALTER ROLE municontrol_actions_runtime_app NOLOGIN/);
  assert.match(qa.sql,/101 rejects runtime SUPERUSER regardless of LOGIN/);
  assert.match(qa.sql,/101 rejects runtime BYPASSRLS regardless of LOGIN/);
 }
});

test('native concurrency is an actual second-connection lock, with honest race coverage boundaries',()=>{
 const qa=buildNativeMonthlyQa({serverMajor:17,requireConcurrency:true});
 assert.equal(qa.report.nativeMonthlyConcurrentLockChecked,true);
 assert.match(qa.lockSql,/pg_advisory_xact_lock/);
 assert.match(qa.lockSql,/FIXED_NOVELTIES_QA_LOCK_READY/);
 assert.match(qa.sql,/pid<>pg_backend_pid\(\)/);
 assert.match(qa.sql,/native prepare waits for the independent actor lock/);
 assert.match(qa.sql,/native transition cannot bypass another actor command lock/);
 assert.ok(qa.report.limitations.some(x=>x.includes('not represented as simultaneous committed writers')));
});

test('only 17 and 18 may generate this disposable PostgreSQL fixture',()=>{
 for(const serverMajor of [undefined,0,16,19,'17;DROP DATABASE anything'])assert.throws(()=>buildNativeMonthlyQa({serverMajor}));
});

test('101 preserves historical prepare and every native source migration',()=>{
 const sql=fs.readFileSync(new URL('../scripts/migrations/101-native-monthly-novelties.sql',import.meta.url),'utf8');
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.(?:native_employee_|payroll_fixed_registry_|payroll_novelty_prepare_v1|payroll_novelty_assert_context_v1)/);
 assert.match(sql,/ab280b073c4b5ee3cb1c2e7c3f52349e83d26d987ab25da9177e031a164ef613/);
 assert.doesNotMatch(sql,/INSERT INTO public\.(?:iam_|employment_contract|employment_movement|source_import_batch|native_employee_registration)/);
 assert.match(sql,/public\.grh_effective_employment_movement_v1/);
 assert.match(sql,/payroll_type_canonical_v1/);
 assert.match(sql,/legacy_payroll_type_unclassified/);
 assert.match(sql,/period>date_trunc\('month',c.end_date\)/);
});
