import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/024-governed-monthly-attendance-evaluation.sql', import.meta.url,
), 'utf8');

function tableDefinition(tableName) {
  const start = migration.indexOf(`CREATE TABLE IF NOT EXISTS ${tableName} (`);
  assert.ok(start >= 0, `tabla ausente: ${tableName}`);
  const end = migration.indexOf('\n);', start);
  assert.ok(end > start, `tabla sin cierre: ${tableName}`);
  return migration.slice(start, end + 3);
}

test('024 se puede segmentar y permanece posterior a los contratos 011/022', () => {
  const statements = splitPostgresStatements(migration);
  assert.ok(statements.length >= 40);
  assert.match(migration, /REFERENCES time_catalog_entry\(id, tenant_id, catalog_kind\)/);
  assert.match(migration, /REFERENCES attendance_ingest_batch\(id, tenant_id\)/);
  assert.match(migration, /rule_profile_kind varchar\(24\) NOT NULL DEFAULT 'rule_profile'/);
  assert.match(migration, /rule_row\.status <> 'approved'/);
  assert.match(migration, /rule_row\.effective_from > NEW\.period_month/);
});

test('la corrida queda enlazada al tenant, binding, membresias y maker-checker', () => {
  const run = tableDefinition('attendance_evaluation_run');
  assert.match(run, /REFERENCES platform_tenant\(id\) ON DELETE RESTRICT/);
  assert.match(run, /REFERENCES platform_tenant_source_binding\(tenant_id, id\)/);
  assert.match(run, /REFERENCES tenant_membership\(id, tenant_id\)/);
  assert.match(run, /approver_person_id <> creator_person_id/);
  assert.match(run, /approver_membership_id <> creator_membership_id/);
  assert.match(migration, /attendance_evaluation_actor_valid_v1/);
  assert.match(migration, /binding\.source_company_id = contract\.legacy_company_id/);
});

test('los resultados no duplican PII ni biometria', () => {
  const result = tableDefinition('attendance_evaluation_result');
  assert.match(result, /employment_contract_id uuid NOT NULL/);
  assert.doesNotMatch(result, /\b(?:name|nombre|apellido|dni|cuil|legajo|email|phone|address|fingerprint|face_template|identity_hmac)\b/i);
  assert.match(result, /calculation_sha256 char\(64\) NOT NULL/);
  assert.match(result, /outcome_code IN \('compliant','tardy','partial_absence'/);
  assert.match(result, /outcome_code = 'compliant'[\s\S]*tardy_minutes = 0/);
  assert.match(result, /outcome_code = 'tardy'[\s\S]*scheduled_minutes > 0 AND tardy_minutes > 0 AND tardy_occurrences > 0/);
  assert.match(result, /outcome_code = 'partial_absence'[\s\S]*scheduled_minutes > 0 AND early_departure_minutes > 0/);
  assert.match(result, /outcome_code = 'unjustified_absence'[\s\S]*scheduled_minutes > 0[\s\S]*unjustified_absence_minutes > 0 OR unjustified_absence_days > 0/);
  assert.match(result, /outcome_code = 'justified_absence'[\s\S]*scheduled_minutes > 0 AND justified_absence_minutes > 0/);
  assert.match(result, /outcome_code = 'no_schedule'[\s\S]*scheduled_minutes = 0[\s\S]*tardy_minutes = 0 AND early_departure_minutes = 0[\s\S]*unjustified_absence_minutes = 0 AND justified_absence_minutes = 0[\s\S]*tardy_occurrences = 0 AND unjustified_absence_days = 0/);
});

test('fuentes y fingerprints son verificables sin copiar eventos crudos', () => {
  const source = tableDefinition('attendance_evaluation_source');
  assert.match(source, /ingest_batch_id uuid NOT NULL/);
  assert.match(source, /batch_payload_sha256 char\(64\) NOT NULL/);
  assert.match(source, /recorded_event_set_sha256 char\(64\) NOT NULL/);
  assert.doesNotMatch(source, /occurred_at|identity_hmac|event_key|biometric/i);
  assert.match(migration, /batch_row\.payload_sha256 <> NEW\.batch_payload_sha256/);
  assert.match(migration, /batch_row\.accepted_count <> NEW\.recorded_event_count/);
  assert.match(migration, /attendance_evaluation_source_manifest_v1/);
  assert.match(migration, /ATTENDANCE_EVALUATION_CALCULATION_HASH_MISMATCH/);
  assert.match(migration, /policy\.certified_source_binding_id = run_row\.certified_binding_id/);
  assert.match(migration, /lower\(policy\.certified_release_sha\) = lower\(batch_row\.release_sha\)/);
  assert.match(migration, /ATTENDANCE_EVALUATION_SOURCE_BINDING_MISMATCH/);
  assert.match(migration, /reason_reference varchar\(128\) NOT NULL/);
  assert.doesNotMatch(migration, /reason_(?:evidence_)?sha256/);
});

test('estados terminales bloquean resultados y toda salida payroll permanece falsa', () => {
  assert.match(migration, /status IN \('draft','prepared','submitted','approved','rejected','cancelled'\)/);
  assert.match(migration, /run_row\.status NOT IN \('draft','prepared'\)/);
  assert.match(migration, /OLD\.status = 'submitted' AND NEW\.status IN \('approved','rejected'\)/);
  assert.match(migration, /ATTENDANCE_EVALUATION_INSERT_MUST_BE_DRAFT/);
  assert.match(migration, /NEW\.status <> 'draft' OR NEW\.version <> 1 OR NEW\.result_count <> 0/);
  assert.match(migration, /command IN \('create','prepare','revise','submit','approve','reject','cancel'\)/);
  assert.match(migration, /WHEN 'draft' THEN 'revise'/);
  assert.match(migration, /stored_results = 0 OR NEW\.result_count <> stored_results/);
  const payrollColumns = migration.match(/payroll_posted boolean NOT NULL DEFAULT false/g) || [];
  const payrollChecks = migration.match(/payroll_posted IS FALSE/g) || [];
  assert.equal(payrollColumns.length, 3);
  assert.ok(payrollChecks.length >= payrollColumns.length);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE)\s+(?:INTO\s+)?(?:payroll|nomina|action_case)\b/i);
});

test('auditoria es append-only y las tablas no quedan expuestas al runtime', () => {
  const audit = tableDefinition('attendance_evaluation_audit_event');
  assert.match(audit, /actor_membership_id uuid NOT NULL/);
  assert.match(audit, /actor_person_id uuid NOT NULL/);
  assert.match(audit, /event_sha256 char\(64\) NOT NULL/);
  assert.match(migration, /BEFORE UPDATE OR DELETE\s+ON attendance_evaluation_audit_event/);
  assert.match(migration, /AFTER INSERT OR UPDATE\s+ON attendance_evaluation_run/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE attendance_evaluation_run,[\s\S]*FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE attendance_evaluation_run,[\s\S]*FROM municontrol_actions_runtime_app/);
  assert.doesNotMatch(migration, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]*attendance_evaluation_/i);
});

test('la matriz IAM separa preparar, aprobar y publicar mayor esfuerzo', () => {
  assert.match(migration, /'attendance\.evaluation\.approve', 'attendance\.evaluation\.prepare'/);
  assert.match(migration, /'attendance\.evaluation\.approve', 'time\.overtime\.post'/);
  assert.match(migration, /'JUNIN_ASISTENCIA_EVALUADOR', 'attendance\.evaluation\.prepare'/);
  assert.match(migration, /'JUNIN_ASISTENCIA_APROBADOR', 'attendance\.evaluation\.approve'/);
  assert.doesNotMatch(migration, /\('JUNIN_ASISTENCIA_EVALUADOR', 'attendance\.evaluation\.approve'\)/);
  assert.match(migration, /tenant_iam_effective_capabilities/);
  assert.match(migration, /ATTENDANCE_EVALUATION_PREPARE_CAPABILITY_REQUIRED/);
  assert.match(migration, /ATTENDANCE_EVALUATION_APPROVE_CAPABILITY_REQUIRED/);
});

test('no permite mover resultados y serializa cambios con la corrida padre', () => {
  assert.match(migration, /ATTENDANCE_EVALUATION_RESULT_IDENTITY_IMMUTABLE/);
  assert.match(migration,
    /ROW\(NEW\.run_id, NEW\.tenant_id, NEW\.employment_contract_id, NEW\.created_at\)/);
  assert.match(migration, /WHERE run\.id = parent_run_id AND run\.tenant_id = parent_tenant_id FOR UPDATE/);
});

test('cada comando tiene motivos propios y los conteos se reconcilian con punches incluidos', () => {
  assert.match(migration, /NEW\.status = 'submitted'[\s\S]*NEW\.reason_code = 'ready_for_review'/);
  assert.match(migration, /NEW\.status = 'approved'[\s\S]*NEW\.reason_code = 'attendance_verified'/);
  assert.match(migration, /NEW\.status = 'rejected'[\s\S]*'calculation_invalid'/);
  assert.match(migration, /ATTENDANCE_EVALUATION_REASON_INVALID/);
  assert.match(migration, /JOIN attendance_canonical_punch punch/);
  assert.match(migration, /FULL JOIN declared_counts declared USING \(employment_contract_id\)/);
  assert.match(migration, /ATTENDANCE_EVALUATION_RESULT_EVENT_MISMATCH/);
});

test('rechazar una corrida presentada no revalida al creador ni la regla vencida', () => {
  assert.match(migration,
    /require_current_rule := OLD\.status IN \('draft','prepared'\) OR NEW\.status = 'approved'/);
  assert.match(migration, /require_creator_authority := OLD\.status IN \('draft','prepared'\)/);
  assert.match(migration, /NEW\.status IN \('approved','rejected'\)[\s\S]*attendance_evaluation_actor_valid_v1/);
  assert.match(migration, /NEW\.status IN \('submitted','approved'\)/);
  assert.doesNotMatch(migration, /NEW\.status IN \('submitted','approved','rejected'\)/);
});
