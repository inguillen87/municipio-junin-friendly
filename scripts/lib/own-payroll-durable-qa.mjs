// Committed synthetic foundation, independent from the rollback regressions.
// Reuse the original published writers and their prerequisite checks. This is
// never an installation batch for a municipal database.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildNativeEmploymentCatalogQa } from '../verify-native-employment-catalog-sql.mjs';
import { nativeMonthlyQaInstallation } from './native-monthly-qa-installation.mjs';
import { splitPostgresStatements } from './sql-statements.mjs';
import { definitions, command } from '../../tests/fixtures/own-payroll-program-synthetic.js';
export const qaLiteral = v => "'" + String(v).replaceAll("'", "''") + "'";
const q = qaLiteral, j = v => q(JSON.stringify(v)) + '::jsonb';
export function buildOwnPayrollDurableQa(serverMajor,{seedProgram=true}={}) {
  assert.equal(typeof seedProgram,'boolean');
  const base = buildNativeEmploymentCatalogQa({ serverMajor }), { schema, ids, qaFoundation } = base;
  assert.match(schema, /^mc_qa_fixed_092_[a-f0-9]{32}$/);
  const read = file => fs.readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const relocate = s => s.replaceAll('public.', schema + '.').replaceAll(schema + '.digest(', 'public.digest(')
    .replaceAll("'public'::regnamespace", q(schema) + '::regnamespace')
    .replaceAll("ARRAY['search_path=public, pg_temp']", `ARRAY['search_path=pg_catalog, ${schema}, public, pg_temp']`)
    .replaceAll("ARRAY['search_path=pg_catalog, public, pg_temp']", `ARRAY['search_path=pg_catalog, ${schema}, public, pg_temp']`)
    .replaceAll("'search_path=public, pg_temp'", q(`search_path=pg_catalog, ${schema}, public, pg_temp`))
    .replaceAll("'search_path=pg_catalog, public, pg_temp'", q(`search_path=pg_catalog, ${schema}, public, pg_temp`))
    .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi, `SET search_path=pg_catalog,${schema},public,pg_temp`)
    .replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')", `replace(replace(p.prosrc,E'\\r\\n',E'\\n'),${q(schema + '.')},'public'||'.')`)
    .replaceAll("replace(prosrc,E'\\r\\n',E'\\n')", `replace(replace(prosrc,E'\\r\\n',E'\\n'),${q(schema + '.')},'public'||'.')`);
  const original = (file, name) => { const s = splitPostgresStatements(read(file)).find(s => new RegExp('CREATE (?:OR REPLACE )?FUNCTION public\\.' + name + '\\(').test(s)); assert.ok(s, name); return relocate(s) + ';'; };
  const pins = qaFoundation.pins.replace("current_database()<>'fixed_novelties_qa'", "current_database()<>'own_payroll_run_qa'");
  assert.ok(pins.includes("current_setting('neon.project_id',true)"));
  const install = file => 'EXECUTE ' + q(relocate(read(file))) + ';';
  const setup = `${qaFoundation.setup}
    GRANT USAGE ON SCHEMA ${schema} TO municontrol_actions_runtime_app;
    ${nativeMonthlyQaInstallation(schema)}
    ALTER TABLE employment_contract ADD COLUMN position_source_id text, ADD COLUMN status_explanation text, ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp(), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
    ${original('102-native-family-schooling.sql', 'employee_family_subject_v2')}
    CREATE TABLE grh_core_source_version(id uuid PRIMARY KEY,source_company_id bigint NOT NULL);
    ALTER TABLE grh_effective_source_binding ADD COLUMN source_version_id uuid, ADD COLUMN baseline_batch_id uuid, ADD COLUMN source_batch_id uuid;
    INSERT INTO grh_core_source_version VALUES(${q(ids.sourceBatch)},101);
    INSERT INTO grh_effective_source_binding(id,source_version_id,baseline_batch_id,source_batch_id) VALUES(104,${q(ids.sourceBatch)},${q(ids.sourceBatch)},${q(ids.sourceBatch)});
    ${original('096-grh-effective-source.sql', 'grh_effective_baseline_guard_v1')}
    REVOKE ALL ON FUNCTION grh_effective_baseline_guard_v1() FROM PUBLIC,municontrol_actions_runtime_app;
    CREATE TRIGGER grh_effective_baseline_rows BEFORE INSERT OR UPDATE OR DELETE ON employment_contract FOR EACH ROW EXECUTE FUNCTION grh_effective_baseline_guard_v1();
    CREATE TRIGGER grh_effective_baseline_truncate BEFORE TRUNCATE ON employment_contract FOR EACH STATEMENT EXECUTE FUNCTION grh_effective_baseline_guard_v1();
    ${install('104-native-employment-changes.sql')}
    CREATE TABLE employee_family_member(id uuid PRIMARY KEY,contract_id uuid,employee_person_id uuid,tenant_id uuid,source_binding_id uuid,native_registration_id uuid,family_name text,birth_date date,valid_to date,identity_token text,identity_snapshot jsonb,valid_from date,recorded_at timestamptz,contract_identity_token text);
    ${original('102-native-family-schooling.sql', 'school_certificate_native_family_v5')}
    REVOKE ALL ON FUNCTION school_certificate_native_family_v5(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
    ${install('110-native-employment-lifecycle.sql')}
    ${install('112-native-salary-definitions.sql')}
    ${install('122-own-payroll-programs.sql')}
    ${install('123-own-payroll-runs.sql')}
    INSERT INTO capabilities SELECT ${q(ids.maker)}::uuid,c FROM unnest(ARRAY['payroll.parameter.read','payroll.parameter.prepare','payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.prepare']) c;
    INSERT INTO capabilities SELECT ${q(ids.checker)}::uuid,c FROM unnest(ARRAY['payroll.parameter.read','payroll.parameter.approve']) c;
    boot:=native_employment_catalog_bootstrap_v1(maker);
    receipt:=native_employment_catalog_propose_v1(maker,jsonb_build_object('baseVersion',boot#>>'{catalog,version}','scopeVersion',boot->>'scopeVersion','reason','Independent synthetic own classifications','items',boot#>'{catalog,items}'),gen_random_uuid());
    PERFORM native_employment_catalog_review_v1(checker,jsonb_build_object('proposalId',receipt->>'proposalId','scopeVersion',native_employment_catalog_bootstrap_v1(checker)->>'scopeVersion','decision','approve','reason','Independent synthetic classification review'),gen_random_uuid());
    boot:=native_salary_bootstrap_v1(maker);
    body:=jsonb_build_object('command','propose','scopeVersion',boot->>'scopeVersion','baseVersion',boot#>>'{catalog,version}','classificationVersion',boot#>>'{classification,version}','proposalId',NULL,'proposalSha256',NULL,'items',${j(definitions())},'reason','Synthetic salary definitions; no municipal rules','reviewConfirmed',false);
    receipt:=native_salary_command_v1(maker,body,gen_random_uuid());
    PERFORM native_salary_command_v1(checker,body||jsonb_build_object('command','approve','scopeVersion',native_salary_bootstrap_v1(checker)->>'scopeVersion','items',NULL,'proposalId',receipt->>'proposalId','proposalSha256',receipt->>'requestSha256','reviewConfirmed',true),gen_random_uuid());
    ${seedProgram?`boot:=own_program_bootstrap_v1(maker);
    body:=${j(command())}||jsonb_build_object('scopeVersion',boot->>'scopeVersion','baseVersion',boot#>>'{program,version}','salaryVersion',boot#>>'{salaryCatalog,version}');
    receipt:=own_program_command_v1(maker,body,gen_random_uuid());
    PERFORM own_program_command_v1(checker,body||jsonb_build_object('command','approve','scopeVersion',own_program_bootstrap_v1(checker)->>'scopeVersion','program',NULL,'proposalId',receipt->>'proposalId','proposalSha256',receipt->>'requestSha256','reviewConfirmed',true),gen_random_uuid());`:''}
    hire:=native_employee_create_v1(maker,'{"agreementCode":"1","birthDate":"1990-01-01","categoryCode":"1","cuil":"20990000418","dni":"99000041","fullName":"Corrida durable sintética propia","jobTitle":"Administración QA","legajo":"19041","legalReference":"Resolución sintética QA","organizationId":"10","sectorCode":"20","sexCode":"X","startDate":"2026-10-01","jurisdictionCode":"42"}'::jsonb,native_employee_catalog_v1(native_employee_context_v1(maker))->>'version',gen_random_uuid());
    subject:=payroll_fixed_registry_employee_by_contract_v1(maker,(hire->>'contractId')::uuid)->'subject';
    FOR cents IN SELECT unnest(ARRAY['2000','25']) LOOP
      receipt:=payroll_novelty_prepare_v2(maker,'individual',date_trunc('month',greatest(DATE '2026-10-01',clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza'))::date,'monthly',jsonb_build_array(jsonb_build_object('rowOrdinal',1,'legajo','19041','contractId',hire->>'contractId','identityToken',subject->>'identityToken','conceptSourceId','120','costCenterSourceId',NULL,'adjustmentMonth',NULL,'quantityDecimal',NULL,'amountCents',cents,'movementType',NULL,'legalInstrument','Instrumento mensual sintético QA','observation',NULL,'forced',false)),gen_random_uuid(),repeat('a',64));
      PERFORM payroll_novelty_transition_v2(maker,(receipt#>>'{data,id}')::uuid,'submit',1,'ready_for_review',NULL,gen_random_uuid(),repeat('b',64));
      PERFORM payroll_novelty_transition_v2(checker,(receipt#>>'{data,id}')::uuid,'approve',2,'validated_for_export',NULL,gen_random_uuid(),repeat('b',64));
    END LOOP;
    PERFORM qa_assert(NOT EXISTS(SELECT 1 FROM employment_movement WHERE employment_contract_id=(hire->>'contractId')::uuid) AND NOT EXISTS(SELECT 1 FROM grh_employees WHERE legajo='19041'),'synthetic own employee has no GRH predecessor');
    PERFORM qa_assert((SELECT count(*)=2 FROM payroll_novelty_batch WHERE status='approved') AND (SELECT count(*)=0 FROM own_payroll_run_capture),'fixture seeds approved sources but never precomputes a capture/result');`;
  const sql = `BEGIN ISOLATION LEVEL READ COMMITTED;
    SET LOCAL statement_timeout='90s'; SET LOCAL lock_timeout='2s';
    DO $seed$ DECLARE maker jsonb:=${j(qaFoundation.actors.maker)};checker jsonb:=${j(qaFoundation.actors.checker)};boot jsonb;body jsonb;receipt jsonb;hire jsonb;subject jsonb;cents text;BEGIN
      ${pins}
      IF to_regnamespace(${q(schema)}) IS NOT NULL OR to_regclass('public.own_payroll_run_capture') IS NOT NULL THEN RAISE EXCEPTION 'OWN_DURABLE_QA_NOT_EMPTY';END IF;
      ${setup}
    END $seed$; COMMIT;`;
  assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql));
  return { schema, ids, actors: qaFoundation.actors, pins, sql, seedSha256: createHash('sha256').update(sql).digest('hex'), inheritedRegressionChecks: base.report.checksPassed };
}
