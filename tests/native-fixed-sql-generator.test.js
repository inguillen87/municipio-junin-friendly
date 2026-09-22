import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeFixedQa} from '../scripts/verify-native-fixed-novelties-sql.mjs';

for(const serverMajor of [17,18])test(`native fixed SQL QA targets only disposable PostgreSQL ${serverMajor}`,()=>{
 const t=buildNativeFixedQa({serverMajor,requireConcurrency:true});
 assert.equal(t.report.serverMajor,serverMajor);
 assert.equal(t.report.nativeChecksPassed,57);
 assert.equal(t.report.checksPassed,209);
 assert.equal(t.report.syntheticSchemaRolledBack,true);
 assert.equal(t.report.municipalRowsWritten,0);
 assert.match(t.sql,/current_database\(\)<>'fixed_novelties_qa'/);
 assert.match(t.sql,/neon\.project_id/);
 assert.match(t.sql,/BEGIN ISOLATION LEVEL READ COMMITTED/);
 assert.match(t.sql,/checks<>209/);
 assert.match(t.sql,/ROLLBACK;\s*$/);
 assert.doesNotMatch(t.sql,/INSERT\s+INTO\s+public\./i);
 assert.match(t.sql,/originalHelpers/);
 assert.match(t.sql,/CREATE OR REPLACE FUNCTION native_employee_create_v1/);
 assert.match(t.sql,/CREATE OR REPLACE FUNCTION action_center_assert_tenant_read_session_v2/);
 assert.match(t.sql,/another login for the same person cannot approve native proposal/);
 assert.match(t.sql,/093 rejects altered employee_by_contract even when its migration marker is retained/);
 assert.match(t.sql,/pre-093 GRH proposal replay retains its original receipt after 093/);
 assert.match(t.lockSql,/FIXED_NOVELTIES_QA_LOCK_READY/);
 assert.match(t.lockSql,/pg_advisory_xact_lock/);
 assert.equal(t.report.concurrentConnectionCheck,true);
});
test('native SQL fixture schemas and identities are isolated per generation',()=>{
 const a=buildNativeFixedQa({serverMajor:17}),b=buildNativeFixedQa({serverMajor:17});
 assert.notEqual(a.schema,b.schema);assert.notEqual(a.ids.tenant,b.ids.tenant);
 assert.equal(a.report.migration093Sha256,b.report.migration093Sha256);
 assert.equal(a.report.authorizationMigration,'026-governed-payroll-novelties.sql');
 assert.equal(a.report.nativeWriterMigration,'067-native-employee-registration.sql');
});
test('unsupported PostgreSQL versions fail before emitting SQL',()=>{
 for(const serverMajor of [undefined,16,19,'17 OR true'])assert.throws(()=>buildNativeFixedQa({serverMajor}));
});
