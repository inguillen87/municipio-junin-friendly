// Synthetic rollback QA for SQL137 on the existing loopback PostgreSQL servers.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildAdoptedLifecycleQa } from './verify-adopted-employment-lifecycle-sql.mjs';
import { adoptionQaOutputPath } from './verify-employment-adoption-preparation-sql.mjs';

const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const j = value => q(JSON.stringify(value)) + '::jsonb';
const once = (source, oldValue, nextValue) => {
  assert.equal(source.split(oldValue).length, 2, 'QA anchor changed');
  return source.replace(oldValue, () => nextValue);
};

export async function buildAdoptedOperatorContextQa(options) {
  const base = await buildAdoptedLifecycleQa(options);
  const schema = base.schema;
  const migration = fs.readFileSync(new URL('./migrations/137-adopted-operator-context.sql', import.meta.url), 'utf8');
  const relocated = migration.replaceAll('public.', schema + '.')
    .replace("replace(original.prosrc,E'\\r\\n',E'\\n')",
      "replace(replace(original.prosrc,E'\\r\\n',E'\\n')," + q(schema + '.') + ",'public'||'.')")
    .replace("ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']",
      "ARRAY['search_path=pg_catalog, " + schema + ", public, pg_temp','TimeZone=UTC']");
  assert.notEqual(relocated, migration);
  const maker = base.qaFoundation.actors.maker;
  const outsiderTenantId = base.qaFoundation.actors.outsider.tenantId;
  const feature = `
 PERFORM qa_assert((native_employment_change_context_v1(maker)->>'actorPersonId') IS NULL,'SQL137 baseline: adopted operator is unresolved by original employment-change context');checks:=checks+1;
 CREATE TEMP TABLE qa137_original ON COMMIT DROP AS SELECT oid,proacl,proconfig,proowner,prosecdef FROM pg_proc WHERE oid=to_regprocedure(${q(schema + '.native_employment_change_context_v1(jsonb,text)')});
 EXECUTE ${q(relocated)};
 PERFORM qa_assert(native_employment_change_context_v1(maker)=native_employment_lifecycle_adopted_context_v2(maker),'SQL137 resolves only a verified active adopted operator through the approved ownership reader');checks:=checks+1;
 PERFORM qa_assert(native_employment_change_context_v1(maker,'employee.record.propose')->>'actorPersonId' IS NOT NULL,'SQL137 existing proposal capability remains usable by the adopted operator');checks:=checks+1;
 PERFORM qa_assert(native_employment_change_context_v1(checker,'employee.record.approve')->>'actorPersonId' IS NOT NULL,'SQL137 independent approval capability remains usable by the adopted checker');checks:=checks+1;
 PERFORM qa_assert((SELECT row(oid,proacl,proconfig,proowner,prosecdef) FROM qa137_original) IS NOT DISTINCT FROM
  (SELECT row(p.oid,p.proacl,p.proconfig,p.proowner,p.prosecdef) FROM pg_proc p WHERE p.oid=to_regprocedure(${q(schema + '.native_employment_change_context_v1(jsonb,text)')})),
  'SQL137 preserves function identity, ownership, security mode, settings and ACL');checks:=checks+1;
 PERFORM qa_assert(NOT has_function_privilege('municontrol_actions_runtime_app',${q(schema + '.native_employment_change_context_v1(jsonb,text)')},'EXECUTE'),
  'SQL137 does not expose its private context to the runtime role');checks:=checks+1;
 BEGIN
  DELETE FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key='employee.record.propose';
  PERFORM qa_assert(qa_rejects(format('SELECT native_employment_change_context_v1(%L::jsonb,%L)',maker,'employee.record.propose'),'NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN'),
   'SQL137 capability revocation still denies proposal');checks:=checks+1;
  RAISE EXCEPTION USING ERRCODE='P1371';
 EXCEPTION WHEN SQLSTATE 'P1371' THEN NULL;END;
 PERFORM qa_assert(qa_rejects(format('SELECT native_employment_change_context_v1(%L::jsonb,%L)',jsonb_set(maker,'{actorSessionVersion}','999999'::jsonb),'employee.record.propose'),'ACTION_SESSION_INVALID'),
  'SQL137 rejects a stale MFA session');checks:=checks+1;
 PERFORM qa_assert(qa_rejects(format('SELECT native_employment_change_context_v1(%L::jsonb,%L)',jsonb_set(maker,'{tenantId}',to_jsonb(${q(outsiderTenantId)}::text)),'employee.record.propose'),'ACTION_SESSION_INVALID'),
  'SQL137 rejects a valid operator session forged into a foreign tenant');checks:=checks+1;
 BEGIN
  UPDATE tenant_action_employment_link SET active=false WHERE membership_id=(maker->>'membershipId')::uuid
   AND tenant_id=(maker->>'tenantId')::uuid AND source_binding_id=(native_employment_change_context_v1(maker)->>'sourceBindingId')::uuid;
  PERFORM qa_assert(qa_rejects(format('SELECT native_employment_change_context_v1(%L::jsonb,%L)',maker,'employee.record.propose'),'NATIVE_EMPLOYMENT_CHANGE_EMPLOYMENT_REQUIRED'),
   'SQL137 revoked employment link cannot retain employment authority');checks:=checks+1;
  RAISE EXCEPTION USING ERRCODE='P1372';
 EXCEPTION WHEN SQLSTATE 'P1372' THEN NULL;END;
 `;
  const anchor = "RAISE EXCEPTION USING ERRCODE='P1361';EXCEPTION WHEN SQLSTATE 'P1361' THEN NULL;END;";
  const checks = 10;
  const report = { ...base.report, checksPassed: base.report.checksPassed + checks,
    adoptedOperatorContextChecksPassed: checks,
    limitations: [...base.report.limitations, 'SQL137 is verified only in synthetic QA; municipal installation and downstream payroll end-to-end tests are pending.'] };
  let sql = once(base.sql, anchor, feature + '\n' + anchor);
  sql = once(sql, 'checks<>' + base.report.checksPassed, 'checks<>' + report.checksPassed);
  sql = once(sql, j(base.report), j(report));
  return { ...base, sql, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--(expected-major|write-sql)=(.+)$/.exec(arg);
    assert.ok(match); assert.equal(args[match[1]], undefined); args[match[1]] = match[2];
  }
  const file = adoptionQaOutputPath(args['write-sql']);
  const qa = await buildAdoptedOperatorContextQa({ serverMajor: Number(args['expected-major']) });
  fs.writeFileSync(file, qa.sql, { flag: 'wx' });
  console.log(JSON.stringify({ generated: true, databaseExecuted: false, checksPlanned: qa.report.checksPassed,
    adoptedOperatorContextChecksPlanned: qa.report.adoptedOperatorContextChecksPassed }));
}
