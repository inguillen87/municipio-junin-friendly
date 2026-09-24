import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildSuccessorStagingQa} from '../scripts/verify-grh-successor-staging-postgres.mjs';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8').replaceAll('\r\n','\n');
const ddl=read('scripts/migrations/106-grh-successor-staging.sql');
test('staging schema is additive and cannot select an operational successor',()=>{
 const tables=[...ddl.matchAll(/CREATE TABLE public\.(\w+)/g)].map(m=>m[1]);
 assert.deepEqual(tables,['grh_successor_stage','grh_successor_stage_delta','grh_successor_stage_seal']);
 assert.doesNotMatch(ddl,/\b(?:UPDATE|DELETE FROM|INSERT INTO|DROP TABLE|DISABLE TRIGGER|ALTER ROLE) public\.(?:employment_contract|person_identity|grh_effective_source_binding|payroll_run|data_import_runs)/i);
 assert.match(ddl,/false AS operational,false AS publication_authorized/);
 assert.doesNotMatch(ddl,/GRANT ALL|GRANT SELECT|CREATE OR REPLACE VIEW public\.grh_effective/);
});
test('all ten domains must be present and stage cannot commit unsealed',()=>{
 for(const domain of ['payrollRuns','payrollSnapshot','payrollMonthly','movements','employmentReconciliation','grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'])assert.ok(ddl.includes(domain));
 assert.match(ddl,/DEFERRABLE INITIALLY DEFERRED/);assert.match(ddl,/GRH_SUCCESSOR_STAGE_INCOMPLETE/);assert.match(ddl,/GRH_SUCCESSOR_STAGE_SEAL_REQUIRED/);
});
test('source and predecessor are explicit; date ordering alone never selects a candidate',()=>{
 assert.match(ddl,/parent_publication_sha256/);assert.match(ddl,/p\.source_version_id=c\.id/);assert.match(ddl,/p\.publication_sha256=s\.parent_publication_sha256/);
 assert.match(ddl,/GRH_SUCCESSOR_STAGE_PROFILE_INVALID/);assert.match(ddl,/FOR SHARE OF p,b,policy NOWAIT/);assert.doesNotMatch(ddl,/ORDER BY.*DESC.*LIMIT 1/);
});
test('sealing validates previous rows, both fingerprints and duplicate semantic assignments',()=>{
 assert.match(ddl,/b\.record IS DISTINCT FROM d\.previous_record/);assert.match(ddl,/GRH_SUCCESSOR_STAGE_BASELINE_DRIFT/);assert.match(ddl,/GRH_SUCCESSOR_STAGE_CANDIDATE_DRIFT/);
 assert.match(ddl,/GRH_SUCCESSOR_STAGE_SNAPSHOT_DUPLICATE/);assert.match(ddl,/GRH_SUCCESSOR_STAGE_COMPANY_MISMATCH/);
});
test('staging tables and functions grant no access to the application role',()=>{
 assert.equal((ddl.match(/ENABLE ROW LEVEL SECURITY/g)??[]).length,3);
 assert.match(ddl,/REVOKE ALL ON public\.grh_successor_stage,public\.grh_successor_stage_delta,public\.grh_successor_stage_seal FROM PUBLIC,municontrol_actions_runtime_app/);
 assert.match(ddl,/REVOKE ALL ON FUNCTION public\.grh_successor_entities_v1/);
 assert.match(ddl,/GRH_SUCCESSOR_STAGE_OWNER_REQUIRED/);assert.match(ddl,/GRH_SUCCESSOR_STAGE_IMMUTABLE/);
});
for(const major of [17,18])test('PostgreSQL '+major+' test is isolated, complete and rollback-only',()=>{
 const sql=buildSuccessorStagingQa({expectedMajor:major});
 assert.match(sql,/current_database\(\)<>'successor_stage_qa'/);assert.match(sql,/EMPTY_DISPOSABLE_DATABASE_REQUIRED/);assert.match(sql,/127\.0\.0\.1/);
 assert.match(sql,/106 operational personnel source unchanged/);assert.match(sql,/106 source selection and canonical records preserved/);
 assert.match(sql,/ROLLBACK;/);assert.match(sql,/schema_rollback_confirmed/);assert.doesNotMatch(sql,/neon\.tech|noelia@|SCERCA/);
});
test('unsupported PostgreSQL versions are rejected before SQL generation',()=>{
 assert.throws(()=>buildSuccessorStagingQa({expectedMajor:16}),/SUCCESSOR_QA_MAJOR_INVALID/);
});
