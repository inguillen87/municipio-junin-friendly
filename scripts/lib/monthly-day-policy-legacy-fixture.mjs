// Reuse the existing synthetic092 compatibility supports. No legacy functions,
// authority substitutes, role assignments or reconstruction of migration044.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
export const MONTHLY_DAY_LEGACY_FIXTURE_SOURCE='scripts/verify-payroll-fixed-novelties-sql.mjs';
const pinned='323f97779c6e63439e9048c737223835a5a2ffeec11b71d5b63b4a436001a775';
export function monthlyDayLegacyCompatibilityFixture(read){
 const source=read(MONTHLY_DAY_LEGACY_FIXTURE_SOURCE).replace(/\r\n?/g,'\n');
 const sourceSha256=createHash('sha256').update(source).digest('hex');
 assert.equal(sourceSha256,pinned,'MONTHLY192_LEGACY_FIXTURE_SOURCE_CHANGED');
 const matches=[...source.matchAll(/const legacyFixtures=`([\s\S]*?)`;/g)];
 assert.equal(matches.length,1,'MONTHLY192_LEGACY_FIXTURE_REQUIRED');
 const selected=splitPostgresStatements(matches[0][1]).filter(s=>/^(?:CREATE TABLE payroll_fixed_(?:assignment|change|event)\(|REVOKE ALL ON payroll_fixed_assignment,|INSERT INTO iam_capability(?:_conflict)? VALUES\('payroll\.fixed\.)/.test(s.trim())).map(s=>s.trim());
 assert.equal(selected.length,6,'MONTHLY192_COMPLETE_LEGACY_SUPPORT_REQUIRED');
 const statements=selected.map(s=>s
  .replace(/^CREATE TABLE /,'CREATE TABLE public.')
  .replace(/^REVOKE ALL ON payroll_fixed_assignment,payroll_fixed_change,payroll_fixed_event /,'REVOKE ALL ON public.payroll_fixed_assignment,public.payroll_fixed_change,public.payroll_fixed_event ')
  .replace(/^INSERT INTO iam_capability VALUES/,'INSERT INTO public.iam_capability(capability_key,label,description,scope_kind,sensitivity) VALUES')
  .replace(/^INSERT INTO iam_capability_conflict VALUES/,'INSERT INTO public.iam_capability_conflict(capability_key,conflicts_with_key,reason) VALUES'));
 return {sourceSha256,statements};
}
