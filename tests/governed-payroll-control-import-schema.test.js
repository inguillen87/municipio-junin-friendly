import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/025-governed-payroll-control-import.sql', import.meta.url,
), 'utf8');

function tableDefinition(tableName) {
  const marker = `CREATE TABLE IF NOT EXISTS public.${tableName} (`;
  const start = migration.indexOf(marker);
  assert.ok(start >= 0, `tabla ausente: ${tableName}`);
  const end = migration.indexOf('\n);', start);
  assert.ok(end > start, `tabla sin cierre: ${tableName}`);
  return migration.slice(start, end + 3);
}

test('025 es segmentable y define solo el agregado poscierre gobernado', () => {
  assert.ok(splitPostgresStatements(migration).length >= 60);
  assert.match(migration, /payroll-post-close-701-703\.v1/);
  assert.match(migration, /source_kind IN \('grh_observed','operator_control'\)/);
  assert.match(migration, /provenance_state varchar\(32\) NOT NULL DEFAULT 'operator_declared'/);
  assert.match(migration, /CHECK \(provenance_state = 'operator_declared'\)/);
  assert.match(migration, /contract_version varchar\(64\) NOT NULL DEFAULT 'payroll-control-import\.v1'/);
  assert.match(migration, /hmac_key_version varchar\(32\) NOT NULL DEFAULT 'hmac-v1'/);
  assert.doesNotMatch(migration,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?(?:payroll|nomina|action_case|source_import_batch)\b/i);
});

test('batch, rows y eventos quedan tenant-bound y ligados al binding certificado', () => {
  const batch = tableDefinition('payroll_control_import_batch');
  const row = tableDefinition('payroll_control_import_row');
  const event = tableDefinition('payroll_control_import_event');
  assert.match(batch, /FOREIGN KEY \(tenant_id, certified_binding_id\)[\s\S]*REFERENCES public\.platform_tenant_source_binding\(tenant_id, id\)/);
  assert.match(row, /FOREIGN KEY \(batch_id, tenant_id\)[\s\S]*REFERENCES public\.payroll_control_import_batch\(id, tenant_id\)/);
  assert.match(event, /FOREIGN KEY \(batch_id, tenant_id\)[\s\S]*REFERENCES public\.payroll_control_import_batch\(id, tenant_id\)/);
  assert.match(event, /certified_binding_id uuid NOT NULL/);
  assert.match(event, /actor_role_key varchar\(64\) NOT NULL/);
  assert.match(event, /authority_capability_key varchar\(96\) NOT NULL/);
  assert.match(event, /FOREIGN KEY \(tenant_id, certified_binding_id\)[\s\S]*REFERENCES public\.platform_tenant_source_binding\(tenant_id, id\)/);
  assert.match(migration, /binding\.source_system = 'GRH'[\s\S]*binding\.verified IS TRUE/);
  assert.match(migration, /policy_row\.certified_source_binding_id/);
  assert.match(migration, /'provenanceState', batch\.provenance_state/);
  assert.match(migration, /'contractVersion', batch\.contract_version/);
  assert.match(migration, /'hmacKeyVersion', batch\.hmac_key_version/);
});

test('contrato 701/703 usa centavos int64 y devuelve montos como texto', () => {
  const row = tableDefinition('payroll_control_import_row');
  assert.match(row, /concept_code smallint NOT NULL/);
  assert.match(row, /amount_cents bigint NOT NULL/);
  assert.match(row, /concept_code IN \(701,703\)/);
  assert.match(migration, /amount_value := amount_text::bigint/);
  assert.match(migration, /'amountCents', row_value\.amount_cents::text/);
  assert.match(migration, /period_month BETWEEN DATE '1900-01-01' AND DATE '2099-12-01'/);
});

test('la huella durable no es SHA crudo y deduplica los mismos bytes entre releases', () => {
  const batch = tableDefinition('payroll_control_import_batch');
  assert.match(batch, /content_hmac_sha256 char\(64\) NOT NULL/);
  assert.match(batch, /UNIQUE \([\s\S]*tenant_id, certified_binding_id, content_hmac_sha256[\s\S]*\)/);
  assert.doesNotMatch(batch, /content_sha256|file_name|filename|raw_bytes|payload_bytes/i);
  assert.match(migration, /versiones de contrato y clave, tenant, binding y bytes/);
  assert.match(migration, /el release se audita por separado/);
  assert.doesNotMatch(migration, /HMAC[^\n]*(?:tenant|binding)[^\n]*release[^\n]*bytes/i);
});

test('flujo es idempotente, serializado y optimista', () => {
  assert.match(migration, /idempotency_key::text ~[\s\S]*-4\[0-9a-f\]\{3\}-\[89ab\]/);
  assert.match(migration, /UNIQUE \(tenant_id, actor_membership_id, idempotency_key\)/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(migration, /PAYROLL_CONTROL_IMPORT_IDEMPOTENCY_REUSE/);
  assert.match(migration, /PAYROLL_CONTROL_IMPORT_VERSION_CONFLICT/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /existing_event_found := FOUND/);
  assert.match(migration, /payroll_control_import_event_snapshot_v1\(\s*existing_event\.id, existing_event\.tenant_id/);
  assert.ok((migration.match(/RETURNING id INTO event_id_value/g) || []).length >= 2);
  assert.ok((migration.match(/payroll_control_import_event_snapshot_v1\(\s*event_id_value/g) || []).length >= 2);
  assert.doesNotMatch(migration, /'replayed', true,[\s\S]{0,160}payroll_control_import_snapshot_v1/);
});

test('maker-checker compara membresia y persona canonica', () => {
  const batch = tableDefinition('payroll_control_import_batch');
  assert.match(batch, /validated_by_person_id <> prepared_by_person_id/);
  assert.match(batch, /validated_by_membership_id <> prepared_by_membership_id/);
  assert.match(migration, /prepared_by_membership_id = \(context_value->>'membershipId'\)::uuid/);
  assert.match(migration, /prepared_by_person_id = \(context_value->>'actorPersonId'\)::uuid/);
  assert.match(migration, /PAYROLL_CONTROL_IMPORT_MAKER_CHECKER_REQUIRED/);
});

test('estados y motivos forman un circuito cerrado que nunca contabiliza nomina', () => {
  assert.match(migration, /status IN \('quarantined','submitted','validated','rejected','cancelled'\)/);
  assert.match(migration, /OLD\.status = 'quarantined' AND NEW\.status IN \('submitted','cancelled'\)/);
  assert.match(migration, /OLD\.status = 'submitted' AND NEW\.status IN \('validated','rejected','cancelled'\)/);
  assert.match(migration, /source_uploaded[\s\S]*ready_for_validation[\s\S]*source_validated/);
  assert.equal((migration.match(/payroll_posted boolean NOT NULL DEFAULT false/g) || []).length, 2);
  assert.ok((migration.match(/payroll_posted IS FALSE/g) || []).length >= 2);
  assert.equal((migration.match(/fiscal_artifact_generated boolean NOT NULL DEFAULT false/g) || []).length, 2);
  assert.ok((migration.match(/fiscal_artifact_generated IS FALSE/g) || []).length >= 2);
  const opaqueReferencePattern =
    "^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
  assert.ok(migration.split(opaqueReferencePattern).length - 1 >= 3);
  assert.doesNotMatch(migration, /reason_reference\s+~\s+'\^\[A-Za-z0-9\]/);
});

test('auditoria es append-only y obligatoria para cada version', () => {
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.payroll_control_import_event/);
  assert.match(migration, /CREATE CONSTRAINT TRIGGER payroll_control_import_batch_audit_required_v1/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /event\.resulting_version = NEW\.version/);
  assert.match(migration, /event_sha256 := encode\(digest/);
  assert.match(migration, /'certifiedBindingId', NEW\.certified_binding_id/);
  assert.match(migration, /'actorRoleKey', NEW\.actor_role_key/);
  assert.match(migration, /'authorityCapabilityKey', NEW\.authority_capability_key/);
  assert.match(migration, /membership\.role_key = NEW\.actor_role_key/);
  assert.match(migration, /effective\.capability_key = NEW\.authority_capability_key/);
  assert.match(migration, /NEW\.command = 'prepare'[\s\S]*NEW\.from_status IS NULL[\s\S]*NEW\.expected_version = 0/);
  assert.match(migration, /previous_event\.resulting_version = NEW\.expected_version/);
  assert.match(migration, /previous_event\.to_status = NEW\.from_status/);
  assert.match(migration, /JOIN public\.payroll_control_import_batch audit_batch[\s\S]*audit_batch\.certified_binding_id =[\s\S]*context_value->>'certifiedBindingId'/);
  assert.match(migration, /replay_batch\.certified_binding_id =[\s\S]*context_value->>'certifiedBindingId'/);
});

test('runtime solo ejecuta las tres facades security definer', () => {
  const grants = [...migration.matchAll(
    /GRANT EXECUTE ON FUNCTION public\.(payroll_control_import_[a-z0-9_]+)\(/g,
  )].map((match) => match[1]).sort();
  assert.deepEqual(grants, [
    'payroll_control_import_bootstrap_v1',
    'payroll_control_import_prepare_v1',
    'payroll_control_import_transition_v1',
  ]);
  assert.match(migration, /SECURITY DEFINER SET search_path = public, pg_temp/g);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE\s+public\.payroll_control_import_batch,[\s\S]*FROM municontrol_actions_runtime_app/);
  assert.doesNotMatch(migration, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]*payroll_control_import_/i);
});

test('IAM institucional separa Marcelo, Hugo y consulta', () => {
  assert.match(migration, /'payroll\.control_import\.prepare',[\s\S]*'payroll\.control_import\.validate'/);
  assert.match(migration, /\('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll\.control_import\.prepare'\)/);
  assert.match(migration, /\('HUGO_APROBADOR_INTEGRAL', 'payroll\.control_import\.validate'\)/);
  assert.match(migration, /\('CONSULTA_INTEGRAL', 'payroll\.control_import\.read'\)/);
  assert.doesNotMatch(migration, /\('CONSULTA_INTEGRAL', 'payroll\.control_import\.(?:prepare|validate)'\)/);
  assert.match(migration, /tenant_iam_assert_no_sod_conflict/);
  assert.match(migration, /PAYROLL_CONTROL_IMPORT_ROLE_ALLOWLIST_DRIFT/);
  assert.doesNotMatch(migration, /\('PLATFORM_OWNER', 'payroll\.control_import\./);
});

test('las firmas publicas coinciden con el contrato API B2 y fijan el binding del HMAC', () => {
  assert.match(migration, /payroll_control_import_bootstrap_v1\(p_context jsonb\)/);
  assert.match(migration, /payroll_control_import_prepare_v1\([\s\S]*p_context jsonb,[\s\S]*p_expected_binding_id uuid,[\s\S]*p_source_kind text,[\s\S]*p_period_month date,[\s\S]*p_jurisdiction text,[\s\S]*p_definition_key text,[\s\S]*p_content_hmac_sha256 text,[\s\S]*p_byte_length integer,[\s\S]*p_rows jsonb,[\s\S]*p_idempotency uuid,[\s\S]*p_command_hash text/);
  assert.match(migration, /p_expected_binding_id <> \(context_value->>'certifiedBindingId'\)::uuid[\s\S]*PAYROLL_CONTROL_IMPORT_BINDING_CHANGED/);
  assert.match(migration, /payroll_control_import_transition_v1\([\s\S]*p_context jsonb,[\s\S]*p_batch_id uuid,[\s\S]*p_command text,[\s\S]*p_expected_version integer,[\s\S]*p_reason_code text,[\s\S]*p_reason_reference text,[\s\S]*p_idempotency uuid,[\s\S]*p_command_hash text/);
});
