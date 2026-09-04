import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_MONTHLY_CLOSE_MIGRATION_VERSION,
  PAYROLL_MONTHLY_CLOSE_ROLE_MATRIX,
  PAYROLL_MONTHLY_CLOSE_RUNTIME_SIGNATURES,
  PAYROLL_MONTHLY_CLOSE_SIGNATURES,
  PAYROLL_MONTHLY_CLOSE_TABLES,
  PAYROLL_MONTHLY_CLOSE_TRIGGERS,
  payrollMonthlyCloseFingerprint,
  validatePayrollMonthlyCloseMigrationSql,
} from '../scripts/apply-governed-monthly-close-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/038-governed-monthly-close-run.sql', import.meta.url,
), 'utf8');

test('038 es aditiva, segmentable y sólo persiste agregados, hashes y centavos', () => {
  assert.equal(PAYROLL_MONTHLY_CLOSE_MIGRATION_VERSION,
    '038-governed-monthly-close-run');
  assert.equal(validatePayrollMonthlyCloseMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 68);
  assert.match(payrollMonthlyCloseFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.match(migration, /source_aggregates jsonb NOT NULL/);
  assert.match(migration, /source_set_sha256 char\(64\) NOT NULL/);
  assert.match(migration, /difference_cents bigint NOT NULL/);
  assert.match(migration, /raw_content_stored IS FALSE/);
  assert.doesNotMatch(migration,
    /\b(?:dni|cuil|cbu|employee_id|account_number|original_name|raw_bytes)\s+(?:text|varchar|jsonb|bytea)\b/i);
});

test('038 exige las tres fuentes canónicas y conciliación exacta también con Gobierno', () => {
  for (const token of [
    'grh-concept-statistics.v1',
    'bank-accreditation-summary.v1',
    'government-payroll-summary.v1',
    'three_source_exact_aggregate_reconciliation',
    'governmentComparisons',
    'computed_government_earnings',
    'computed_government_contributions',
    'comparison_mismatch <> bank_mismatch',
    'mismatch_value := bank_mismatch + government_mismatch',
  ]) assert.ok(migration.includes(token), `falta el contrato SQL: ${token}`);
  assert.match(migration,
    /computed_grh_contributions\s*-\s*computed_government_contributions/);
  assert.match(migration, /MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_MISMATCH/);
  assert.match(migration, /jsonb_array_length\(p_blocking_issues\)\s*<>\s*mismatch_value \+ government_missing/);
});

test('una diferencia de cualquier centavo y todo control bloqueante impiden aprobar', () => {
  assert.match(migration,
    /p_command = 'approve' AND run_row\.difference_cents <> 0/);
  assert.match(migration,
    /run_row\.mismatch_count <> 0 OR run_row\.blocking_issue_count <> 0/);
  assert.match(migration, /PAYROLL_MONTHLY_CLOSE_DIFFERENCE_BLOCKS_APPROVAL/);
  assert.match(migration, /PAYROLL_MONTHLY_CLOSE_BLOCKING_ISSUES/);
  assert.match(migration,
    /status = 'approved'[\s\S]*difference_cents = 0[\s\S]*mismatch_count = 0[\s\S]*blocking_issue_count = 0/);
});

test('estados y maker-checker son obligatorios en tabla y transición', () => {
  for (const status of ['prepared', 'submitted', 'approved', 'rejected', 'cancelled']) {
    assert.match(migration, new RegExp(`'${status}'`));
  }
  assert.match(migration, /payroll_monthly_close_run_maker_checker_ck/);
  assert.match(migration, /PAYROLL_MONTHLY_CLOSE_MAKER_CHECKER_REQUIRED/);
  assert.match(migration, /prepared_by_person_id uuid,/);
  assert.match(migration,
    /decided_by_membership_id <> prepared_by_membership_id[\s\S]*prepared_by_person_id IS NULL OR decided_by_person_id <> prepared_by_person_id/);
  assert.match(migration,
    /command NOT IN \('approve','reject'\) OR actor_person_id IS NOT NULL/);
  assert.match(migration,
    /IF NOT \(context_value->>'employmentLinked'\)::boolean THEN[\s\S]*PAYROLL_MONTHLY_CLOSE_EMPLOYMENT_REQUIRED/);
  assert.match(migration,
    /prepared_by_membership_id = \(context_value->>'membershipId'\)::uuid/);
  const transitionSource = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.payroll_monthly_close_transition_v1'),
    migration.indexOf('COMMENT ON TABLE public.payroll_monthly_close_run'),
  );
  assert.match(transitionSource,
    /p_command IN \('submit','cancel'\)[\s\S]*prepared_by_membership_id <> \(context_value->>'membershipId'\)::uuid/);
  assert.doesNotMatch(transitionSource,
    /p_command IN \('submit','cancel'\)[\s\S]*prepared_by_person_id IS DISTINCT FROM[\s\S]*PAYROLL_MONTHLY_CLOSE_PREPARER_REQUIRED/);
  assert.match(migration, /p_expected_version/);
  assert.match(migration, /PAYROLL_MONTHLY_CLOSE_VERSION_CONFLICT/);
  assert.match(migration, /PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_REUSE/);
});

test('replay queda ligado al binding/sesión y la huella cubre identidad y autoridad', () => {
  for (const token of [
    "'bindingId', NEW.certified_binding_id::text",
    "'personId', NEW.actor_person_id::text",
    "'roleKey', NEW.actor_role_key",
    "'authorityCapabilityKey', NEW.authority_capability_key",
    "NEW.occurred_at AT TIME ZONE 'UTC'",
  ]) assert.ok(migration.includes(token), `falta en huella: ${token}`);
  const bindingReplayGuard = /IF existing_event\.certified_binding_id <>[\s\S]*?PAYROLL_MONTHLY_CLOSE_BINDING_CHANGED/g;
  assert.equal([...migration.matchAll(bindingReplayGuard)].length, 2,
    'prepare y transition deben rechazar replay de otro binding');
  assert.equal((migration.match(/existing_event\.actor_session_id <>/g) || []).length, 2);
  assert.equal((migration.match(/existing_event\.actor_session_version <>/g) || []).length, 2);
  assert.equal((migration.match(/existing_event\.release_sha <>/g) || []).length, 2);
  assert.equal((migration.match(/existing_event\.actor_person_id IS DISTINCT FROM/g) || []).length, 2);
  assert.match(migration,
    /payroll_monthly_close_attempt_v1[\s\S]*actor_membership_id[\s\S]*idempotency_key[\s\S]*event\.command = p_command/);
  assert.match(migration,
    /event_row\.certified_binding_id <>[\s\S]*event_row\.actor_session_id <>[\s\S]*event_row\.actor_session_version <>[\s\S]*event_row\.release_sha <>[\s\S]*event_row\.actor_role_key <>/);
  assert.match(migration,
    /payroll_monthly_close_event_result_v1[\s\S]*flags'[\s\S]*run\.close_approved/);
});

test('fachada SQL valida rangos y detalle exacto antes de persistir agregados', () => {
  for (const token of [
    'value::numeric NOT BETWEEN -9223372036854775808 AND 9223372036854775807',
    "(row_value->>'valueInteger')::numeric > 9223372036854775807",
    'expected_issue_codes',
    'expected_reconciliation_issues',
    'expected_blocking_issues',
    'expected_source_set_sha256',
    "comparison_value->'issueCodes' IS DISTINCT FROM expected_issue_codes",
    "p_reconciliation->'blockingIssues'",
    'p_blocking_issues IS DISTINCT FROM expected_blocking_issues',
  ]) assert.ok(migration.includes(token), `falta defensa SQL profunda: ${token}`);
  assert.doesNotMatch(migration, /\b(?:OR|AND)\s+CASE\s+WHEN/i,
    'los CASE booleanos deben quedar parentizados para compilar en PL/pgSQL');
  assert.doesNotMatch(migration, /(?:IS DISTINCT FROM|<>)\s+CASE\s+WHEN/i,
    'los CASE comparados deben quedar parentizados para compilar en PL/pgSQL');
  assert.doesNotMatch(migration, /\|\|\s+[A-Za-z_][A-Za-z0-9_]*->>/,
    'la extracción JSON debe parentizarse antes de concatenar texto');
});

test('admin queda read-only, Hugo decide y owner prepara sin combinar capacidades', () => {
  assert.deepEqual(PAYROLL_MONTHLY_CLOSE_ROLE_MATRIX, {
    CONSULTA_INTEGRAL: ['payroll.monthly_close.read'],
    HUGO_APROBADOR_INTEGRAL: [
      'payroll.monthly_close.approve',
      'payroll.monthly_close.audit.read',
      'payroll.monthly_close.read',
    ],
    PLATFORM_OWNER_OPERATIVO_INTEGRAL: [
      'payroll.monthly_close.audit.read',
      'payroll.monthly_close.prepare',
      'payroll.monthly_close.read',
    ],
  });
  assert.match(migration,
    /payroll\.monthly_close\.approve'[\s\S]*payroll\.monthly_close\.prepare'/);
  assert.match(migration, /PAYROLL_MONTHLY_CLOSE_PROFILE_SOD_CONFLICT/);
  assert.match(migration,
    /conflict\.capability_key LIKE 'payroll\.monthly_close\.%'[\s\S]*conflict\.conflicts_with_key LIKE 'payroll\.monthly_close\.%'/);
  assert.match(migration, /PAYROLL_MONTHLY_CLOSE_OVERRIDE_DRIFT/);
});

test('superficie SQL queda en dos tablas privadas y seis fachadas runtime', () => {
  assert.deepEqual(PAYROLL_MONTHLY_CLOSE_TABLES, [
    'payroll_monthly_close_event', 'payroll_monthly_close_run',
  ]);
  assert.equal(Object.keys(PAYROLL_MONTHLY_CLOSE_SIGNATURES).length, 13);
  assert.equal(PAYROLL_MONTHLY_CLOSE_RUNTIME_SIGNATURES.length, 6);
  assert.equal(Object.keys(PAYROLL_MONTHLY_CLOSE_TRIGGERS).length, 3);
  assert.match(migration,
    /REVOKE ALL PRIVILEGES ON TABLE[\s\S]*FROM municontrol_actions_runtime_app/);
  assert.doesNotMatch(migration,
    /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)\s+ON\s+(?:TABLE\s+)?public\.payroll_monthly_close_/i);
  const compactMigration = migration.replace(/\s+/g, '');
  for (const signature of PAYROLL_MONTHLY_CLOSE_RUNTIME_SIGNATURES) {
    assert.ok(
      compactMigration.includes(`GRANTEXECUTEONFUNCTION${signature}`),
      `falta GRANT EXECUTE para ${signature}`,
    );
  }
});

test('aprobar no calcula, postea, acredita ni genera artefactos externos', () => {
  for (const token of [
    'includes_personal_records IS FALSE',
    'raw_content_stored IS FALSE',
    'grh_mutation IS FALSE',
    'payroll_calculated IS FALSE',
    'payroll_posted IS FALSE',
    'bank_artifact_generated IS FALSE',
    'government_artifact_generated IS FALSE',
    'fiscal_artifact_generated IS FALSE',
  ]) assert.match(migration, new RegExp(token));
  assert.doesNotMatch(migration,
    /\b(?:UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?(?:payroll_run|employment_contract|payroll_monthly_fact)\b/i);
});
