import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {monthlyDayLegacyCompatibilityFixture,MONTHLY_DAY_LEGACY_FIXTURE_SOURCE} from '../scripts/lib/monthly-day-policy-legacy-fixture.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('192 restores the six exact pre-existing synthetic092 compatibility supports, preserving the real legacy guard',()=>{
 const {statements,sourceSha256}=monthlyDayLegacyCompatibilityFixture(read),sql=statements.join(';\n');
 assert.equal(sourceSha256,'323f97779c6e63439e9048c737223835a5a2ffeec11b71d5b63b4a436001a775');assert.equal(statements.length,6);
 for(const name of ['assignment','change','event'])assert.equal(statements.filter(s=>s.startsWith('CREATE TABLE public.payroll_fixed_'+name+'(')).length,1);
 assert.match(sql,/REVOKE ALL ON public\.payroll_fixed_assignment,public\.payroll_fixed_change,public\.payroll_fixed_event FROM PUBLIC,municontrol_actions_runtime_app/);
 assert.match(sql,/iam_capability\(capability_key,label,description,scope_kind,sensitivity\)/);
 assert.match(sql,/iam_capability_conflict\(capability_key,conflicts_with_key,reason\)/);
 assert.doesNotMatch(sql,/CREATE(?: OR REPLACE)? FUNCTION|GRANT|INSERT INTO public\.payroll_fixed_|iam_role|UPDATE|DELETE|DROP|IF NOT EXISTS/);
 const runner=read('scripts/verify-own-monthly-day-policy.mjs');assert.ok(runner.includes('qa.legacyCompatibilitySeed'));
 assert.ok(read('scripts/migrations/092-payroll-fixed-novelties.sql').includes("RAISE EXCEPTION 'PAYROLL_FIXED_LEGACY_RECONCILIATION_REQUIRED'"));
});
test('unknown compatibility sources reject before fixture construction instead of substituting an empty legacy state',()=>{
 assert.throws(()=>monthlyDayLegacyCompatibilityFixture(file=>{assert.equal(file,MONTHLY_DAY_LEGACY_FIXTURE_SOURCE);return read(file)+'\n';}),/MONTHLY192_LEGACY_FIXTURE_SOURCE_CHANGED/);
});
