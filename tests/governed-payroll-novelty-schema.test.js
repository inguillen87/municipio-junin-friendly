import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/026-governed-payroll-novelties.sql', import.meta.url,
), 'utf8');

function tableDefinition(tableName) {
  const marker = `CREATE TABLE IF NOT EXISTS public.${tableName} (`;
  const start = migration.indexOf(marker);
  assert.ok(start >= 0, `tabla ausente: ${tableName}`);
  const end = migration.indexOf('\n);', start);
  assert.ok(end > start, `tabla sin cierre: ${tableName}`);
  return migration.slice(start, end + 3);
}

function between(startMarker, endMarker) {
  const start = migration.indexOf(startMarker);
  assert.ok(start >= 0, `inicio ausente: ${startMarker}`);
  const end = migration.indexOf(endMarker, start);
  assert.ok(end > start, `cierre ausente: ${endMarker}`);
  return migration.slice(start, end);
}

test('026 es segmentable y define el circuito acotado de novedades', () => {
  assert.ok(splitPostgresStatements(migration).length >= 65);
  assert.match(migration, /payroll-novelty-batch\.v1/);
  assert.match(migration, /source_mode IN \('individual','bulk'\)/);
  assert.match(migration,
    /payroll_type IN \('monthly','sac','vacation','supplementary','final','other'\)/);
  assert.match(migration, /status IN \('draft','submitted','approved','rejected','cancelled'\)/);
  assert.doesNotMatch(migration,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?(?:employment_movement|payroll_run|payroll_monthly_fact)\b/i);
});

test('batch, row, issue y event quedan tenant-scoped y binding-scoped', () => {
  const batch = tableDefinition('payroll_novelty_batch');
  const row = tableDefinition('payroll_novelty_row');
  const issue = tableDefinition('payroll_novelty_issue');
  const event = tableDefinition('payroll_novelty_event');
  assert.match(batch, /FOREIGN KEY \(tenant_id, certified_binding_id\)[\s\S]*platform_tenant_source_binding\(tenant_id, id\)/);
  assert.match(row, /FOREIGN KEY \(batch_id, tenant_id\)[\s\S]*payroll_novelty_batch\(id, tenant_id\)/);
  assert.match(issue, /FOREIGN KEY \(batch_id, tenant_id\)[\s\S]*payroll_novelty_batch\(id, tenant_id\)/);
  assert.match(issue, /FOREIGN KEY \(row_id, tenant_id, batch_id\)[\s\S]*payroll_novelty_row\(id, tenant_id, batch_id\)/);
  assert.match(event, /FOREIGN KEY \(batch_id, tenant_id\)[\s\S]*payroll_novelty_batch\(id, tenant_id\)/);
  assert.match(migration, /binding\.source_system = 'GRH'[\s\S]*binding\.verified IS TRUE/);
  assert.match(migration, /policy_row\.certified_source_binding_id/);
});

test('administrativo carga legajo y el servidor resuelve un contrato activo exacto', () => {
  const row = tableDefinition('payroll_novelty_row');
  assert.match(migration, /COALESCE\(row_value->>'legajo',''\) !~ '\^\(0\|\[1-9\]\[0-9\]\{0,19\}\)\$'/);
  assert.match(migration, /contract\.legacy_legajo = row_value->>'legajo'/);
  assert.match(migration, /contract\.legacy_company_id = \(context_value->>'sourceCompanyId'\)::bigint/);
  assert.match(migration, /source_batch\.source_database = context_value->>'sourceDatabase'/);
  assert.match(migration, /contract_matches <> 1/);
  assert.match(migration, /PAYROLL_NOVELTY_LEGAJO_NOT_FOUND/);
  assert.match(row, /employment_contract_id uuid NOT NULL/);
  assert.match(row, /legajo_snapshot varchar\(20\) NOT NULL/);
  assert.match(migration, /p_include_nominal[\s\S]*'legajo', row_value\.legajo_snapshot/);
});

test('valores monetarios y cantidades no dependen de floats JavaScript', () => {
  const row = tableDefinition('payroll_novelty_row');
  assert.match(row, /quantity numeric\(20,6\)/);
  assert.match(row, /amount_cents bigint/);
  assert.match(migration, /quantity_text !~ '\^-\?\(0\|\[1-9\]\[0-9\]\{0,11\}\)/);
  assert.match(migration, /amount_text !~ '\^-\?\(0\|\[1-9\]\[0-9\]\{0,17\}\)\$'/);
  assert.match(migration, /'quantityDecimal',[\s\S]*trim_scale\(row_value\.quantity\)::text/);
  assert.match(migration, /'amountCents',[\s\S]*row_value\.amount_cents::text/);
  assert.match(row,
    /forced IS FALSE OR \([\s\S]*amount_cents IS NOT NULL[\s\S]*length\(observation\) >= 10/);
});

test('validacion es explicita, determinista y no descarta filas silenciosamente', () => {
  assert.match(migration, /jsonb_array_length\(p_rows\) NOT BETWEEN 1 AND 500/);
  assert.match(migration, /duplicate_business_key/);
  assert.match(migration, /concept_not_observed/);
  assert.match(migration, /cost_center_not_observed/);
  assert.match(migration, /movement_type_not_observed/);
  assert.match(migration, /already_observed/);
  assert.match(migration, /existing_movement_conflict/);
  assert.match(migration, /PAYROLL_NOVELTY_BLOCKING_ISSUES/);
  assert.match(migration, /jsonb_build_object\('basis', 'published_grh_observation'\)/);
  assert.match(migration, /jsonb_build_object\('basis', 'published_grh_same_period'\)/);
});

test('flujo es idempotente, serializado y optimista', () => {
  assert.match(migration, /idempotency_key::text ~[\s\S]*-4\[0-9a-f\]\{3\}-\[89ab\]/);
  assert.match(migration, /UNIQUE \(tenant_id, actor_membership_id, idempotency_key\)/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(migration, /PAYROLL_NOVELTY_IDEMPOTENCY_REUSE/);
  assert.match(migration, /PAYROLL_NOVELTY_VERSION_CONFLICT/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /existing_event_found := FOUND/);
  assert.ok((migration.match(/RETURNING id INTO event_id_value/g) || []).length >= 2);
});

test('lotes equivalentes usan huella canonica y no pueden quedar activos en paralelo', () => {
  const batch = tableDefinition('payroll_novelty_batch');
  assert.match(batch, /content_sha256 char\(64\) NOT NULL/);
  assert.match(batch, /CHECK \(content_sha256 ~ '\^\[a-f0-9\]\{64\}\$'\)/);

  const fingerprint = between(
    '-- La huella omite orden/ordinal y modo de carga',
    'SELECT * INTO existing_event',
  );
  for (const field of [
    'legajo', 'conceptSourceId', 'costCenterSourceId', 'adjustmentMonth',
    'quantityDecimal', 'amountCents', 'movementType', 'legalInstrument',
    'observation', 'forced',
  ]) {
    assert.match(fingerprint, new RegExp(`'${field}'`));
  }
  assert.match(fingerprint,
    /ORDER BY fingerprint_row\.business_key, fingerprint_row\.row_payload::text/);
  assert.match(fingerprint, /trim_scale\(\(item->>'quantityDecimal'\)::numeric\(20,6\)\)::text/);
  assert.match(fingerprint, /\(\(item->>'amountCents'\)::bigint\)::text/);
  assert.match(fingerprint, /'tenantId', \(\(context_value->>'tenantId'\)::uuid\)::text/);
  assert.match(fingerprint,
    /'certifiedBindingId', \(\(context_value->>'certifiedBindingId'\)::uuid\)::text/);
  assert.match(fingerprint, /'periodMonth', to_char\(p_period_month, 'YYYY-MM-DD'\)/);
  assert.match(fingerprint, /'payrollType', p_payroll_type/);
  assert.match(fingerprint, /encode\(digest\(convert_to\(jsonb_build_object\(/);
  assert.doesNotMatch(fingerprint, /'rowOrdinal'|p_source_mode|'sourceMode'/);

  const activeIndex = migration.match(
    /CREATE UNIQUE INDEX IF NOT EXISTS payroll_novelty_batch_active_content_uk[\s\S]*?;/,
  )?.[0];
  assert.ok(activeIndex, 'indice unico parcial de lotes activos ausente');
  assert.match(activeIndex,
    /tenant_id, certified_binding_id, period_month, payroll_type, content_sha256/);
  assert.match(activeIndex, /WHERE status IN \('draft','submitted','approved'\)/);
  assert.doesNotMatch(activeIndex, /rejected|cancelled/);

  const duplicateGuard = between(
    '-- Serializa por contenido canonico',
    'FOR row_value IN SELECT value FROM jsonb_array_elements(p_rows)',
  );
  assert.match(duplicateGuard, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(duplicateGuard, /batch\.tenant_id = \(context_value->>'tenantId'\)::uuid/);
  assert.match(duplicateGuard,
    /batch\.certified_binding_id = \(context_value->>'certifiedBindingId'\)::uuid/);
  assert.match(duplicateGuard, /batch\.period_month = p_period_month/);
  assert.match(duplicateGuard, /batch\.payroll_type = p_payroll_type/);
  assert.match(duplicateGuard, /batch\.status IN \('draft','submitted','approved'\)/);
  assert.match(duplicateGuard, /PAYROLL_NOVELTY_DUPLICATE_BATCH/);
  assert.doesNotMatch(duplicateGuard, /rejected|cancelled/);

  assert.ok(
    migration.indexOf('IF existing_event_found THEN')
      < migration.indexOf("'payroll-novelty-active:' || content_sha256_value"),
    'el replay idempotente debe resolverse antes del bloqueo por contenido',
  );
  assert.match(migration,
    /NEW\.period_month, NEW\.payroll_type, NEW\.content_sha256, NEW\.contract_version/);
  assert.match(migration,
    /tenant_id, certified_binding_id, source_mode, period_month, payroll_type,[\s\S]*content_sha256, contract_version/);
});

test('maker-checker compara persona y membresia canonica', () => {
  const batch = tableDefinition('payroll_novelty_batch');
  assert.match(batch,
    /prepared_by_person_id IS NULL[\s\S]*approved_by_person_id <> prepared_by_person_id/);
  assert.match(batch, /approved_by_membership_id <> prepared_by_membership_id/);
  assert.match(migration, /prepared_by_membership_id = \(context_value->>'membershipId'\)::uuid/);
  assert.match(migration,
    /prepared_by_person_id IS NOT DISTINCT FROM[\s\S]*\(context_value->>'actorPersonId'\)::uuid/);
  assert.match(migration, /PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED/);
  assert.match(migration,
    /p_command IN \('approve','reject'\) AND NOT include_nominal[\s\S]*PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED/);
  assert.match(migration, /item\.status = 'submitted' AND has_approve AND has_nominal/);
  assert.match(migration,
    /payroll_novelty_detail_v1[\s\S]*'allowedCommands',[\s\S]*jsonb_build_array\('approve','reject'\)/);
  assert.match(migration,
    /payroll_novelty_detail_v1[\s\S]*'canExport',[\s\S]*'payroll\.novelty\.export'/);
});

test('owner puede preparar sin inventar legajo y toda decision exige persona GRH', () => {
  const batch = tableDefinition('payroll_novelty_batch');
  const event = tableDefinition('payroll_novelty_event');
  assert.match(batch, /prepared_by_person_id uuid,/);
  assert.doesNotMatch(batch, /prepared_by_person_id uuid NOT NULL/);
  assert.match(event, /actor_person_id uuid,/);
  assert.match(event,
    /command NOT IN \('approve','reject'\) OR actor_person_id IS NOT NULL/);
  assert.match(migration,
    /IF NOT employment_linked[\s\S]*p_required_capability = 'payroll\.novelty\.approve'/);
  assert.match(migration,
    /NEW\.actor_person_id IS DISTINCT FROM batch_row\.prepared_by_person_id/);
  assert.match(migration,
    /item\.status = 'submitted' AND has_approve AND has_nominal[\s\S]*employmentLinked/);
  assert.match(migration,
    /batch\.status = 'submitted'[\s\S]*'payroll\.novelty\.approve'[\s\S]*employmentLinked/);
});

test('aprobar solo habilita export y conserva los tres side effects en false', () => {
  const batch = tableDefinition('payroll_novelty_batch');
  const event = tableDefinition('payroll_novelty_event');
  assert.match(batch, /\(status = 'approved' AND exportable IS TRUE\)/);
  assert.match(batch, /grh_mutation IS FALSE[\s\S]*payroll_calculated IS FALSE[\s\S]*payroll_posted IS FALSE/);
  assert.match(event, /exportable = \(to_status = 'approved'\)/);
  assert.match(event, /grh_mutation IS FALSE[\s\S]*payroll_calculated IS FALSE[\s\S]*payroll_posted IS FALSE/);
  assert.match(migration, /approvalEffect', 'export_only'/);
  assert.match(migration, /batch\.status = 'approved'[\s\S]*batch\.exportable IS TRUE/);
  assert.match(migration, /PAYROLL_NOVELTY_NOT_EXPORTABLE/);
});

test('auditoria es append-only y obligatoria para cada version', () => {
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.payroll_novelty_event/);
  assert.match(migration, /CREATE CONSTRAINT TRIGGER payroll_novelty_batch_audit_required_v1/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /event\.resulting_version = NEW\.version/);
  assert.match(migration, /NEW\.event_sha256 := encode\(digest/);
  assert.match(migration, /'certifiedBindingId', NEW\.certified_binding_id/);
  assert.match(migration, /membership\.role_key = NEW\.actor_role_key/);
  assert.match(migration, /effective\.capability_key = NEW\.authority_capability_key/);
  assert.match(migration, /previous_event\.resulting_version = NEW\.expected_version/);
});

test('runtime ejecuta solo cinco facades security definer', () => {
  const grants = [...migration.matchAll(
    /GRANT EXECUTE ON FUNCTION public\.(payroll_novelty_[a-z0-9_]+)\(/g,
  )].map((match) => match[1]).sort();
  assert.deepEqual(grants, [
    'payroll_novelty_bootstrap_v1',
    'payroll_novelty_detail_v1',
    'payroll_novelty_export_v1',
    'payroll_novelty_prepare_v1',
    'payroll_novelty_transition_v1',
  ]);
  assert.match(migration, /SECURITY DEFINER SET search_path = public, pg_temp/g);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE\s+public\.payroll_novelty_batch,[\s\S]*FROM municontrol_actions_runtime_app/);
  assert.doesNotMatch(migration,
    /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]*payroll_novelty_/i);
});

test('IAM declara capacidades y SoD sin hardcodear usuarios ni roles visibles', () => {
  for (const capability of [
    'read','nominal.read','prepare','approve','export','audit.read',
  ]) {
    const escapedCapability = capability.replace('.', '\\.');
    assert.match(migration, new RegExp(`'payroll\\.novelty\\.${escapedCapability}'`));
  }
  assert.match(migration,
    /'payroll\.novelty\.approve',[\s\S]*'payroll\.novelty\.prepare'/);
  assert.doesNotMatch(migration, /INSERT INTO public\.iam_role_capability/i);
  assert.doesNotMatch(migration, /\b(?:marcelo|hugo|admin)@/i);
  assert.match(migration, /tenant_iam_assert_no_sod_conflict/);
});

test('firmas publicas coinciden con el contrato de la API', () => {
  assert.match(migration, /payroll_novelty_bootstrap_v1\(p_context jsonb\)/);
  assert.match(migration, /payroll_novelty_prepare_v1\([\s\S]*p_context jsonb,[\s\S]*p_source_mode text,[\s\S]*p_period_month date,[\s\S]*p_payroll_type text,[\s\S]*p_rows jsonb,[\s\S]*p_idempotency uuid,[\s\S]*p_command_hash text/);
  assert.match(migration, /payroll_novelty_transition_v1\([\s\S]*p_context jsonb,[\s\S]*p_batch_id uuid,[\s\S]*p_command text,[\s\S]*p_expected_version integer,[\s\S]*p_reason_code text,[\s\S]*p_reason_reference text,[\s\S]*p_idempotency uuid,[\s\S]*p_command_hash text/);
  assert.match(migration, /payroll_novelty_detail_v1\([\s\S]*p_context jsonb,[\s\S]*p_batch_id uuid/);
  assert.match(migration, /payroll_novelty_export_v1\([\s\S]*p_context jsonb,[\s\S]*p_batch_id uuid/);
});
