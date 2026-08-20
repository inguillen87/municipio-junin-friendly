import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ACTION_CENTER_SEMANTIC_CONTRACT,
  validateSemanticSchemaEvidence,
} from '../scripts/apply-action-center-schema.mjs';

const migrationUrl = new URL('../scripts/migrations/003-action-center.sql', import.meta.url);
const applyUrl = new URL('../scripts/apply-action-center-schema.mjs', import.meta.url);

function validSemanticEvidence() {
  const contract = ACTION_CENTER_SEMANTIC_CONTRACT;
  return {
    triggers: Object.entries(contract.triggers).map(([name, expected]) => ({
      name,
      tableName: expected.tableName,
      functionName: expected.functionName,
      functionSchema: 'public',
      enabled: 'O',
      definition: [expected.tableName, expected.functionName, ...expected.definitionTokens].join(' '),
    })),
    indexes: Object.entries(contract.indexes).map(([name, expected]) => ({
      name,
      tableName: expected.tableName,
      unique: expected.unique,
      valid: true,
      ready: true,
      definition: expected.definitionTokens.join(' '),
      predicate: expected.partial ? expected.predicateTokens.join(' ') : '',
      owner: 'neondb_owner',
      ownedByCurrentUser: true,
    })),
    constraints: Object.entries(contract.constraints).map(([name, expected]) => ({
      name,
      tableName: expected.tableName,
      type: expected.type,
      validated: true,
      definition: expected.definitionTokens.join(' '),
    })),
    functions: Object.entries(contract.functions).map(([name, expected]) => ({
      name,
      exists: true,
      securityDefiner: expected.securityDefiner,
      searchPathFixed: expected.securityDefiner,
      language: expected.language,
      owner: 'neondb_owner',
      ownedByCurrentUser: true,
    })),
    views: [{
      name: contract.view.name,
      definition: contract.view.definitionTokens.join(' '),
      owner: 'neondb_owner',
      ownedByCurrentUser: true,
    }],
  };
}

test('la migración crea casos, contexto transaccional y bitácora append-only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  for (const table of [
    'internal_user_employment_link',
    'internal_user_area_scope',
    'action_case',
    'action_case_event',
    'action_command_context',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS internal_users_email_lower_uk\s+ON internal_users \(lower\(email\)\)/);
  assert.match(sql, /CREATE TRIGGER action_case_event_append_only\s+BEFORE UPDATE OR DELETE ON action_case_event/);
  assert.match(sql, /CREATE TRIGGER action_case_event_require_context\s+BEFORE INSERT ON action_case_event/);
  assert.match(sql, /CREATE TRIGGER action_case_require_context\s+BEFORE INSERT OR UPDATE ON action_case/);
  assert.match(sql, /ACTION_DIRECT_DML_FORBIDDEN/);
  assert.match(sql, /INSERT INTO action_case_event[\s\S]+DELETE FROM action_command_context/);
  assert.match(sql, /UNIQUE \(case_id, case_version\)/);
  assert.match(sql, /UNIQUE \(actor_user_email, idempotency_key\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS action_case_leave_active_request_uk[\s\S]+status IN \('draft', 'submitted', 'approved'\)/);
  assert.match(sql, /actor_employment_contract_id uuid REFERENCES employment_contract/);
  assert.match(sql, /actor_person_id uuid REFERENCES person_identity/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS action_case_event_maker_person_idx[\s\S]+actor_person_id/);
  assert.match(sql, /NEW\.actor_person_id IS DISTINCT FROM context\.actor_person_id/);
  assert.match(sql, /context\.actor_employment_contract_id,[\s\S]+context\.actor_person_id/);
  assert.match(sql, /REVOKE ALL ON TABLE[\s\S]+action_case, action_case_event, action_command_context[\s\S]+FROM PUBLIC/);
  assert.match(sql, /rolname = 'municontrol_actions_runtime_app'/);
  assert.match(sql, /runtime_role\.rolinherit/);
  assert.match(sql, /pg_auth_members membership/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON SCHEMA public FROM municontrol_actions_runtime_app/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE[\s\S]+vw_action_leave_request[\s\S]+FROM municontrol_actions_runtime_app/);
  assert.match(sql, /REVOKE SELECT \(%1\$s\), INSERT \(%1\$s\), UPDATE \(%1\$s\), REFERENCES \(%1\$s\)/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON SEQUENCE[\s\S]+FROM municontrol_actions_runtime_app/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON FUNCTION action_center_apply_command\([\s\S]+FROM municontrol_actions_runtime_app/);
  assert.match(sql, /GRANT SELECT \(email, display_name, role, active\)[\s\S]+ON TABLE internal_users TO municontrol_actions_runtime_app/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION action_center_apply_command\([\s\S]+TO municontrol_actions_runtime_app/);
  assert.match(sql, /GRANT SELECT \(id, source_system, source_cutoff, validation_state, recorded_at\)[\s\S]+ON TABLE source_import_batch TO municontrol_actions_runtime_app/);
  const eventGrant = sql.match(/GRANT SELECT \(\s*id, case_id, case_version,[\s\S]+?\) ON TABLE action_case_event TO municontrol_actions_runtime_app/)?.[0] || '';
  assert.ok(eventGrant);
  assert.doesNotMatch(eventGrant, /actor_person_id|actor_employment_contract_id/);
  assert.doesNotMatch(sql, /GRANT (?:INSERT|UPDATE|DELETE|ALL)[\s\S]+TO municontrol_actions_runtime_app/);
});

test('la función de comando autoriza en DB y hace replay antes del estado actual', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION action_center_apply_command');
  const body = sql.slice(start, sql.indexOf('CREATE OR REPLACE VIEW', start));
  const authorizationStart = sql.indexOf('CREATE OR REPLACE FUNCTION action_center_actor_authorized');
  const authorizationBody = sql.slice(
    authorizationStart,
    sql.indexOf('CREATE TABLE IF NOT EXISTS action_case', authorizationStart),
  );

  assert.match(body, /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/);
  assert.match(body, /action_center_actor_authorized\(/);
  assert.match(authorizationBody, /internal_user_area_scope/);
  assert.match(authorizationBody, /scope\.scope_level = 'sector'/);
  assert.match(authorizationBody, /actor_contract\.status = 'active'/);
  assert.match(authorizationBody, /link\.employment_contract_id = p_beneficiary_contract_id/);
  assert.doesNotMatch(authorizationBody, /actor_contract\.person_id = beneficiary_contract\.person_id/);
  assert.match(body, /internal_user_employment_link/);
  assert.match(body, /SELECT link\.employment_contract_id, actor_contract\.person_id[\s\S]+FOR SHARE OF link, actor_contract/);
  assert.match(body, /FROM internal_users[\s\S]+LIMIT 1\s+FOR SHARE/);
  assert.match(body, /p_command IN \('create', 'update_draft', 'submit'\)[\s\S]+actor_person_snapshot_id IS NULL[\s\S]+ACTION_CASE_NOT_FOUND/);
  assert.match(body, /p_command IN \('approve', 'reject'\)[\s\S]+actor_person_snapshot_id IS NULL/);
  assert.ok(body.indexOf('FROM action_case_event') < body.indexOf('FOR UPDATE'));
  assert.match(body, /current_status := existing_event\.to_status/);
  assert.match(body, /current_version := existing_event\.case_version/);
  assert.match(body, /COALESCE\(existing_event\.from_status, 'draft'\)/);
  assert.match(body, /beneficiary_contract\.person_id = actor_person_snapshot_id/);
  assert.match(body, /p_command = 'cancel' AND existing_event\.from_status = 'approved'/);
  assert.match(body, /current_case\.status = 'approved'[\s\S]+ACTION_SEPARATION_OF_DUTIES/);
  assert.match(sql, /REVOKE ALL ON FUNCTION action_center_apply_command\([\s\S]+\) FROM PUBLIC/);
});

test('maker-checker usa snapshot natural y bloquea otra cuenta de la misma persona', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION action_center_apply_command');
  const body = sql.slice(start, sql.indexOf('CREATE OR REPLACE VIEW', start));
  const participation = /FROM action_case_event preparation_event[\s\S]+?preparation_event\.case_id = current_case\.id[\s\S]+?preparation_event\.event_type IN \('created', 'draft_updated', 'submitted'\)[\s\S]+?preparation_event\.actor_person_id IS NULL[\s\S]+?preparation_event\.actor_person_id = actor_person_snapshot_id/g;
  const checks = body.match(participation) || [];

  assert.equal(checks.length, 3, 'debe validar participación previa en replay, decisión y cancelación aprobada');
  assert.match(body, /existing_event\.actor_person_id IS DISTINCT FROM actor_person_snapshot_id/);
  assert.doesNotMatch(checks.join('\n'), /actor_user_email/);
  assert.match(body, /p_command = 'cancel' AND existing_event\.from_status = 'approved'[\s\S]+preparation_event\.event_type IN \('created', 'draft_updated', 'submitted'\)[\s\S]+ACTION_CASE_NOT_FOUND/);
  assert.match(body, /p_command IN \('approve', 'reject'\)[\s\S]+preparation_event\.event_type IN \('created', 'draft_updated', 'submitted'\)[\s\S]+ACTION_SEPARATION_OF_DUTIES/);
  assert.match(body, /current_case\.status = 'approved'[\s\S]+preparation_event\.event_type IN \('created', 'draft_updated', 'submitted'\)[\s\S]+ACTION_SEPARATION_OF_DUTIES/);
});

test('concurrencia autoriza lectura antes de versión y comando después del 409 stale', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const authorizationStart = sql.indexOf('CREATE OR REPLACE FUNCTION action_center_actor_authorized');
  const authorizationBody = sql.slice(
    authorizationStart,
    sql.indexOf('CREATE TABLE IF NOT EXISTS action_case', authorizationStart),
  );
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION action_center_apply_command');
  const body = sql.slice(start, sql.indexOf('CREATE OR REPLACE VIEW', start));
  const nonCreate = body.slice(body.indexOf('SELECT * INTO current_case FROM action_case WHERE id = p_case_id FOR UPDATE'));
  const readAuthorization = nonCreate.indexOf("actor.email, actor.role, 'read'");
  const versionConflict = nonCreate.indexOf("RAISE EXCEPTION 'ACTION_VERSION_CONFLICT'");
  const commandAuthorization = nonCreate.indexOf('actor.email, actor.role, p_command', readAuthorization + 1);
  const transitionValidation = nonCreate.indexOf("IF current_case.status <> 'submitted'", commandAuthorization);

  assert.ok(readAuthorization >= 0, 'debe ocultar el objeto antes de revelar conflicto');
  assert.ok(readAuthorization < versionConflict, 'scope/read precede expectedVersion');
  assert.ok(versionConflict < commandAuthorization, 'stale autorizado recibe 409 antes del estado del comando');
  assert.ok(commandAuthorization < transitionValidation, 'comando y transición se validan con la versión vigente');
  assert.match(authorizationBody, /IF p_command = 'read'[\s\S]+role_name = 'RRHH_APROBADOR'/);
});

test('motivos desconocidos, reglas cruzadas y confidencialidad ambigua fallan cerrado también en SQL', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /value->>'reasonCode' NOT IN \(/);
  assert.match(sql, /FROM jsonb_object_keys\(value\)[\s\S]+field\.name NOT IN/);
  assert.match(sql, /value \?& ARRAY\['reasonCode', 'startsOn', 'endsOn', 'durationUnit'\]/);
  assert.match(sql, /jsonb_typeof\(value->'reasonCode'\) IS DISTINCT FROM 'string'/);
  assert.match(sql, /jsonb_typeof\(value->'startsOn'\) IS DISTINCT FROM 'string'/);
  assert.match(sql, /action_center_valid_leave_payload\(payload\) IS TRUE/);
  assert.match(sql, /'annual-ordinary', 'annual-window', 'annual-carryover'/);
  assert.match(sql, /'health', 'health-under-5-no-family'/);
  assert.match(sql, /payload->>'reasonCode' = '19' OR confidentiality = 'restricted'/);
  assert.match(sql, /confidentiality <> 'restricted' OR NOT \(payload \? 'employeeNote'\)/);
  assert.match(sql, /duration_unit <> 'minute'[\s\S]+value->>'reasonCode' <> '13'/);
  assert.match(sql, /current_case\.confidentiality = 'restricted'[\s\S]+p_evidence_status <> 'verified'/);
  assert.match(sql, /scope_level = 'sector'[\s\S]+organization_unit_source_id IS NOT NULL[\s\S]+sector_source_id IS NOT NULL/);
});

test('aplicador usa URL directa, checksum y verifica el contrato completo sin tocar el pool', async () => {
  const source = await readFile(applyUrl, 'utf8');

  assert.match(source, /directCanonicalDatabaseUrl\(\)/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /action_command_context/);
  assert.match(source, /action_center_require_event_context/);
  assert.match(source, /action_case_event_require_context/);
  assert.match(source, /action_case_event_maker_person_idx/);
  assert.match(source, /person_identity/);
  assert.match(source, /grh_catalog_rows/);
  assert.match(source, /municontrol_actions_runtime_app/);
  assert.match(source, /role\.rolinherit/);
  assert.match(source, /rolbypassrls/);
  assert.match(source, /async function verifyRuntimeAcl/);
  assert.match(source, /has_schema_privilege/);
  assert.match(source, /has_table_privilege/);
  assert.match(source, /has_column_privilege/);
  assert.match(source, /has_any_column_privilege/);
  assert.match(source, /has_sequence_privilege/);
  assert.match(source, /has_function_privilege/);
  assert.match(source, /FROM pg_trigger trg/);
  assert.match(source, /trg\.tgenabled AS enabled/);
  assert.match(source, /FROM pg_index index_meta/);
  assert.match(source, /index_meta\.indisvalid AS valid/);
  assert.match(source, /FROM pg_constraint con/);
  assert.match(source, /con\.convalidated AS validated/);
  assert.match(source, /proc\.prosecdef/);
  assert.match(source, /search_path=public, pg_temp/);
  assert.match(source, /owner\.rolname = current_user/);
  assert.match(source, /verifyRuntimeAcl\(client\)/);
});

test('verificador semántico acepta únicamente la evidencia canónica completa', () => {
  assert.doesNotThrow(() => validateSemanticSchemaEvidence(validSemanticEvidence()));
});

test('verificador semántico rechaza trigger deshabilitado o mal vinculado', () => {
  const disabled = validSemanticEvidence();
  disabled.triggers.find((row) => row.name === 'action_case_log_event').enabled = 'D';
  assert.throws(
    () => validateSemanticSchemaEvidence(disabled),
    /trigger action_case_log_event deshabilitado o mal vinculado/,
  );

  const misbound = validSemanticEvidence();
  misbound.triggers.find((row) => row.name === 'action_case_log_event').functionName = 'action_center_reject_change';
  assert.throws(
    () => validateSemanticSchemaEvidence(misbound),
    /trigger action_case_log_event deshabilitado o mal vinculado/,
  );
});

test('verificador semántico rechaza índice homónimo inválido y constraint NOT VALID', () => {
  const wrongIndex = validSemanticEvidence();
  const index = wrongIndex.indexes.find((row) => row.name === 'action_case_event_maker_person_idx');
  index.tableName = 'action_case';
  index.valid = false;
  assert.throws(
    () => validateSemanticSchemaEvidence(wrongIndex),
    /índice action_case_event_maker_person_idx homónimo, inválido o incompleto/,
  );

  const notValidated = validSemanticEvidence();
  notValidated.constraints.find((row) => row.name === 'action_case_leave_payload_ck').validated = false;
  assert.throws(
    () => validateSemanticSchemaEvidence(notValidated),
    /constraint action_case_leave_payload_ck ausente, homónimo o NOT VALID/,
  );
});

test('verificador semántico rechaza SECURITY DEFINER sin search_path fijo o owner permitido', () => {
  const evidence = validSemanticEvidence();
  const applyCommand = evidence.functions.find((row) => row.name.includes('action_center_apply_command'));
  applyCommand.searchPathFixed = false;
  applyCommand.ownedByCurrentUser = false;
  assert.throws(
    () => validateSemanticSchemaEvidence(evidence),
    /función .* tiene seguridad, owner o search_path incorrectos/,
  );
});
