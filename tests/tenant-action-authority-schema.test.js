import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  TENANT_ACTION_SCHEMA_CONTRACT,
  TENANT_ACTION_SEMANTIC_CONTRACT,
  validateTenantActionRuntimeAclEvidence,
  validateTenantActionEvidence,
} from '../scripts/apply-tenant-action-authority-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migrationUrl = new URL('../scripts/migrations/006-tenant-action-authority.sql', import.meta.url);
const applierUrl = new URL('../scripts/apply-tenant-action-authority-schema.mjs', import.meta.url);

function secureFunction(signature) {
  let definition = 'CREATE FUNCTION sample() SECURITY DEFINER SET search_path = public, pg_temp';
  if (signature === 'public.tenant_iam_effective_capabilities(uuid)') {
    definition += " membership.status = 'active' tenant.status = 'active' scope_kind = 'tenant'";
  }
  if (signature === 'public.tenant_action_validate_binding()') {
    definition += " row_payload := to_jsonb(NEW)"
      + " IF TG_TABLE_NAME = 'tenant_action_employment_link' THEN"
      + " row_payload->>'employment_contract_id'"
      + " ELSIF TG_TABLE_NAME = 'tenant_action_area_scope' THEN"
      + " row_payload->>'company_id' END IF";
  }
  if (signature.includes('action_center_apply_tenant_command')) {
    definition += " p_tenant_id p_membership_id source_binding_id"
      + " p_actor_session_id p_actor_session_version"
      + " session.source = 'membership' session.auth_level IN ('mfa', 'recovery')"
      + ' session.identity_version policy.certified_release_sha = lower(p_release_sha)'
      + ' FROM tenant_identity_session session'
      + ' SELECT * INTO membership FROM tenant_membership'
      + ' pg_advisory_xact_lock'
      + ' FROM tenant_action_authority authority FOR SHARE'
      + ' FROM tenant_action_employment_link link FOR SHARE'
      + ' PERFORM tenant_iam_assert_no_sod_conflict'
      + ' SELECT * INTO existing_event FROM action_case_event'
      + " metadata->>'actorSessionId' <> p_actor_session_id::text"
      + " metadata->>'actorSessionVersion' <> p_actor_session_version::text"
      + " metadata->>'releaseSha' <> lower(p_release_sha)";
  }
  if (signature.includes('tenant_action_apply_provisioning_command')) {
    definition += ' SELECT * INTO membership FROM tenant_membership'
      + ' pg_advisory_xact_lock'
      + ' SELECT * INTO existing_event FROM tenant_action_authority_event'
      + " RETURN existing_event.result || jsonb_build_object('replayed', true)"
      + ' SELECT * INTO authority FROM tenant_action_authority FOR UPDATE'
      + ' IF NOT FOUND OR authority.version <> p_expected_version'
      + ' INSERT INTO tenant_action_employment_link'
      + ' UPDATE tenant_action_employment_link'
      + ' UPDATE tenant_action_area_scope';
  }
  if (signature.includes('tenant_action_assert_exclusive_capability')) {
    definition += ' time.overtime.enter tenant_iam_effective_capabilities tenant_exclusive_capability membership_id = p_membership_id';
  }
  if (signature.includes('tenant_iam_assert_platform_session_v2')) {
    definition += " tenant_identity_session session.source = 'platform'"
      + " session.active_tenant_id IS NULL session.auth_level IN ('mfa', 'recovery')"
      + ' session.session_version = p_actor_session_version'
      + " users.identity_version = session.identity_version JOIN platform_user_role assignment"
      + " assignment.role_key = 'PLATFORM_OWNER' FOR SHARE OF session, users, assignment";
  }
  if (signature.includes('tenant_iam_apply_command_v2')) {
    definition += ' tenant_iam_assert_platform_session_v2 FROM tenant_membership membership'
      + ' FOR UPDATE FROM tenant_action_authority authority'
      + ' RETURN tenant_iam_apply_command(';
  }
  if (signature.includes('tenant_iam_admin_view_v2')) {
    definition += ' tenant_iam_assert_platform_session_v2 RETURN tenant_iam_admin_view(';
  }
  return {
    signature, securityDefiner: true, ownedByCurrentUser: true,
    publicExecuteRevoked: true, config: 'search_path=public, pg_temp', definition,
  };
}

function validEvidence() {
  const semantic = TENANT_ACTION_SEMANTIC_CONTRACT;
  return {
    tables: [...TENANT_ACTION_SCHEMA_CONTRACT.tables],
    functions: TENANT_ACTION_SCHEMA_CONTRACT.functions.map(secureFunction),
    indexes: Object.entries(semantic.indexes).map(([name, expected]) => ({
      name, tableName: expected.tableName, unique: expected.unique,
      valid: true, ready: true,
      definition: expected.definitionTokens.join(' '),
      predicate: expected.partial ? expected.predicateTokens.join(' ') : '',
      owner: 'neondb_owner', ownedByCurrentUser: true,
    })),
    triggers: Object.entries(semantic.triggers).map(([name, expected]) => ({
      name, tableName: expected.tableName, functionName: expected.functionName,
      functionSchema: 'public', enabled: 'O',
      definition: [expected.tableName, expected.functionName, ...expected.definitionTokens].join(' '),
    })),
    columns: [
      ['action_case', 'tenant_id'], ['action_case', 'source_binding_id'],
      ['action_case_event', 'tenant_id'], ['action_case_event', 'source_binding_id'],
      ['action_case_event', 'actor_membership_id'],
    ].map(([tableName, columnName]) => ({ tableName, columnName, nullable: false })),
    constraints: Object.entries(semantic.constraints).map(([name, expected]) => ({
      name, tableName: expected.tableName, type: expected.type,
      validated: true, definition: expected.definitionTokens.join(' '),
    })),
  };
}

function validRuntimeAclEvidence() {
  const contract = TENANT_ACTION_SCHEMA_CONTRACT;
  return {
    functions: [...new Set([...contract.runtimeFunctions, ...contract.forbiddenRuntimeFunctions])]
      .map((name) => ({ name, execute: contract.runtimeFunctions.includes(name) })),
    relations: [
      'tenant_action_authority', 'tenant_action_employment_link',
      'tenant_action_area_scope', 'tenant_action_authority_event',
      'action_case', 'action_case_event', 'action_command_context',
    ].map((name) => ({
      name, canSelect: ['action_case', 'action_case_event'].includes(name),
      canInsert: false, canUpdate: false, canDelete: false,
    })),
    sequence: { exists: true, canUsage: false, canSelect: false, canUpdate: false },
    globalColumns: [
      { resource: 'internal_users', columnName: 'role', canSelect: false },
      { resource: 'internal_user_employment_link', columnName: 'user_email', canSelect: false },
      { resource: 'internal_user_area_scope', columnName: 'user_email', canSelect: false },
    ],
    requiredColumns: [
      ['action_case', 'tenant_id'], ['action_case', 'source_binding_id'],
      ['action_case_event', 'tenant_id'], ['action_case_event', 'source_binding_id'],
      ['employment_contract', 'source_system'], ['employment_contract', 'source_batch_id'],
      ['source_import_batch', 'source_database'],
    ].map(([resource, columnName]) => ({ resource, columnName, canSelect: true })),
  };
}

test('006 es nueva, checksummed y no reescribe migraciones anteriores', async () => {
  const [sql, applier] = await Promise.all([
    readFile(migrationUrl, 'utf8'), readFile(applierUrl, 'utf8'),
  ]);
  assert.match(applier, /006-tenant-action-authority/);
  assert.match(applier, /createHash\('sha256'\)/);
  assert.match(applier, /Drift detectado/);
  assert.match(applier, /003-action-center[\s\S]+004-tenant-iam-control-plane[\s\S]+005-tenant-identity-gateway/);
  assert.equal(splitPostgresStatements(sql).length > 40, true);
  assert.doesNotMatch(sql, /UPDATE\s+internal_users\s+SET\s+role/i);
});

test('006 fija tenant, binding y membership como snapshots inmutables', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /ALTER TABLE action_case ADD COLUMN IF NOT EXISTS tenant_id uuid/);
  assert.match(sql, /ALTER TABLE action_case ADD COLUMN IF NOT EXISTS source_binding_id uuid/);
  assert.match(sql, /TENANT_ACTION_BACKFILL_AMBIGUOUS/);
  assert.match(sql, /action_case_source_binding_fk[\s\S]+FOREIGN KEY \(tenant_id, source_binding_id\)/);
  assert.match(sql, /action_case_event ADD COLUMN IF NOT EXISTS actor_membership_id uuid/);
  assert.match(sql, /NEW\.tenant_id <> OLD\.tenant_id[\s\S]+NEW\.source_binding_id <> OLD\.source_binding_id/);
});

test('autoridad operativa usa membership, capability y scope exacto sin rol global', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const apply = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION action_center_apply_tenant_command'));
  assert.match(apply, /tenant_action_employment_link/);
  assert.match(apply, /action_center_tenant_actor_authorized/);
  assert.match(apply, /existing_event\.tenant_id <> p_tenant_id/);
  assert.match(apply, /existing_event\.source_binding_id <> binding\.id/);
  assert.match(apply, /existing_event\.actor_membership_id <> membership\.id/);
  assert.doesNotMatch(apply, /actor\.role/);
  assert.match(sql, /effective\.capability_key = 'actions\.read'/);
  assert.match(sql, /scope\.capability_key = required_capability/);
  assert.doesNotMatch(sql, /\('JUNIN_RRHH_OPERADOR', 'leave\.request\.restricted\.read'\)/);
});

test('binding guard permite INSERT employment_link sin resolver campos exclusivos de area_scope', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION tenant_action_validate_binding');
  const end = sql.indexOf('DROP TRIGGER IF EXISTS tenant_action_employment_binding_guard', start);
  const guard = sql.slice(start, end);
  assert.match(guard, /row_payload := to_jsonb\(NEW\)/);
  assert.match(guard, /IF TG_TABLE_NAME = 'tenant_action_employment_link' THEN/);
  assert.match(guard, /ELSIF TG_TABLE_NAME = 'tenant_action_area_scope' THEN/);
  assert.match(guard, /row_payload->>'employment_contract_id'/);
  assert.match(guard, /row_payload->>'company_id'/);
  assert.doesNotMatch(guard, /NEW\.(?:employment_contract_id|company_id)/);
  assert.ok(guard.indexOf("IF TG_TABLE_NAME = 'tenant_action_employment_link' THEN")
    < guard.indexOf("row_payload->>'employment_contract_id'"));
  assert.ok(guard.indexOf("ELSIF TG_TABLE_NAME = 'tenant_action_area_scope' THEN")
    < guard.indexOf("row_payload->>'company_id'"));
});

test('apply Actions queda ligado a sesión v2, release certificado y lock de autoridad', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION action_center_apply_tenant_command');
  const end = sql.indexOf('CREATE OR REPLACE FUNCTION tenant_action_authority_snapshot', start);
  const apply = sql.slice(start, end);
  for (const pattern of [
    /p_actor_session_id uuid/,
    /p_actor_session_version integer/,
    /p_release_sha text/,
    /session\.id = p_actor_session_id/,
    /session\.session_version = p_actor_session_version/,
    /session\.source = 'membership'/,
    /session\.active_tenant_id = p_tenant_id/,
    /session\.auth_level IN \('mfa', 'recovery'\)/,
    /actor_row\.identity_version = session\.identity_version/,
    /policy\.certified_release_sha = lower\(p_release_sha\)/,
    /existing_event\.metadata->>'actorSessionId' <> p_actor_session_id::text/,
    /existing_event\.metadata->>'actorSessionVersion' <> p_actor_session_version::text/,
    /existing_event\.metadata->>'releaseSha' <> lower\(p_release_sha\)/,
  ]) assert.match(apply, pattern);
  const membership = apply.indexOf('SELECT * INTO membership FROM tenant_membership');
  const advisory = apply.indexOf('pg_advisory_xact_lock');
  const authority = apply.indexOf('FROM tenant_action_authority authority');
  const employmentLink = apply.indexOf('FROM tenant_action_employment_link link');
  const authorization = apply.indexOf('PERFORM tenant_iam_assert_no_sod_conflict');
  const replay = apply.indexOf('SELECT * INTO existing_event FROM action_case_event');
  assert.equal(membership > 0 && advisory > membership && authority > advisory
    && employmentLink > authority && authorization > employmentLink && replay > authorization, true);
});

test('facades IAM v2 exigen sesión platform y serializan revocación con Actions', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const assertStart = sql.indexOf('CREATE OR REPLACE FUNCTION tenant_iam_assert_platform_session_v2');
  const viewStart = sql.indexOf('CREATE OR REPLACE FUNCTION tenant_iam_admin_view_v2');
  const applyStart = sql.indexOf('CREATE OR REPLACE FUNCTION tenant_iam_apply_command_v2');
  const helper = sql.slice(assertStart, viewStart);
  const wrapper = sql.slice(applyStart, sql.indexOf('COMMENT ON TABLE', applyStart));
  assert.match(helper, /session\.source = 'platform'/);
  assert.match(helper, /session\.active_tenant_id IS NULL/);
  assert.match(helper, /session\.session_version = p_actor_session_version/);
  assert.match(helper, /session\.auth_level IN \('mfa', 'recovery'\)/);
  assert.match(helper, /JOIN platform_user_role assignment/);
  assert.match(helper, /assignment\.role_key = 'PLATFORM_OWNER'/);
  assert.match(wrapper, /RETURN tenant_iam_apply_command\(/);
  assert.ok(wrapper.indexOf('FROM tenant_membership membership')
    < wrapper.indexOf('FROM tenant_action_authority authority'));
  assert.match(sql, /REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_admin_view\(text, text, integer\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION tenant_iam_admin_view_v2/);
});

test('provisioning exige PLATFORM_OWNER en contexto platform MFA y audita sin razón libre', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /session\.active_tenant_id IS NULL/);
  assert.match(sql, /session\.auth_level IN \('mfa', 'recovery'\)/);
  assert.match(sql, /tenant_iam_is_platform_owner\(actor_email\)/);
  assert.match(sql, /link_employment[\s\S]+revoke_employment_link[\s\S]+replace_action_scopes/);
  assert.match(sql, /reason_hash_value := encode\(digest/);
  assert.doesNotMatch(sql, /INSERT INTO tenant_action_authority_event[\s\S]{0,600}reason_value/);
  const provisioning = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION tenant_action_apply_provisioning_command'));
  const advisory = provisioning.indexOf('pg_advisory_xact_lock');
  const replay = provisioning.indexOf('SELECT * INTO existing_event');
  const replayReturn = provisioning.indexOf('RETURN existing_event.result');
  const versionLock = provisioning.indexOf('SELECT * INTO authority');
  const versionCheck = provisioning.indexOf('authority.version <> p_expected_version');
  const linkInsert = provisioning.indexOf('INSERT INTO tenant_action_employment_link');
  const linkUpdate = provisioning.indexOf('UPDATE tenant_action_employment_link');
  const scopeUpdate = provisioning.indexOf('UPDATE tenant_action_area_scope');
  assert.equal(advisory > 0 && replay > advisory && replayReturn > replay
    && versionLock > replayReturn && versionCheck > versionLock, true,
    'replay same-key debe resolverse antes de validar la versión ya incrementada');
  assert.equal(linkInsert > versionCheck && linkUpdate > versionCheck && scopeUpdate > versionCheck, true,
    'provisioning debe bloquear y validar authority antes de mutar recursos tenant');
});

test('toda mutación de caso exige vínculo natural del actor, incluso cancel', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const apply = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION action_center_apply_tenant_command'));
  assert.match(apply, /IF actor_person_snapshot_id IS NULL THEN[\s\S]+ACTION_CASE_NOT_FOUND/);
  assert.doesNotMatch(apply, /p_command IN \('create', 'update_draft', 'submit', 'approve', 'reject'\)[\s\S]{0,80}actor_person_snapshot_id IS NULL/);
});

test('mayor esfuerzo exige capability y titular exclusivo, pero runtime no puede invocarlo', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const gate = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION tenant_action_assert_exclusive_capability'));
  assert.match(gate, /p_capability_key <> 'time\.overtime\.enter'/);
  assert.match(gate, /tenant_iam_effective_capabilities\(p_membership_id\)/);
  assert.match(gate, /exclusive_row\.membership_id = p_membership_id/);
  assert.match(gate, /exclusive_row\.active IS TRUE/);
  assert.match(gate, /REVOKE ALL PRIVILEGES ON FUNCTION tenant_action_assert_exclusive_capability/);
  assert.doesNotMatch(gate, /GRANT EXECUTE ON FUNCTION tenant_action_assert_exclusive_capability/);
});

test('validador de evidencia acepta contrato canónico y rechaza drift de frontera', () => {
  assert.doesNotThrow(() => validateTenantActionEvidence(validEvidence()));
  const nullable = validEvidence();
  nullable.columns[0] = { ...nullable.columns[0], nullable: true };
  assert.throws(() => validateTenantActionEvidence(nullable), /snapshot tenant nullable/);
  const roleReload = validEvidence();
  const apply = roleReload.functions.find((row) => row.signature.includes('apply_tenant_command'));
  apply.definition += ' actor.role';
  assert.throws(() => validateTenantActionEvidence(roleReload), /internal_users\.role/);

  const polymorphicFieldLeak = validEvidence();
  const bindingGuard = polymorphicFieldLeak.functions
    .find((row) => row.signature === 'public.tenant_action_validate_binding()');
  bindingGuard.definition += " ELSIF TG_TABLE_NAME = 'tenant_action_area_scope' AND NEW.company_id > 0";
  assert.throws(() => validateTenantActionEvidence(polymorphicFieldLeak), /campo NEW polimorfico/);

  const actionLockInversion = validEvidence();
  const actionApply = actionLockInversion.functions.find((row) => row.signature.includes('apply_tenant_command'));
  actionApply.definition = actionApply.definition.replace(
    ' FROM tenant_action_authority authority FOR SHARE FROM tenant_action_employment_link link FOR SHARE',
    ' FROM tenant_action_employment_link link FOR SHARE FROM tenant_action_authority authority FOR SHARE',
  );
  assert.throws(() => validateTenantActionEvidence(actionLockInversion), /vínculo y replay en orden seguro/);

  for (const writeToken of [
    'INSERT INTO tenant_action_employment_link',
    'UPDATE tenant_action_employment_link',
    'UPDATE tenant_action_area_scope',
  ]) {
    const provisioningLockInversion = validEvidence();
    const provisioningApply = provisioningLockInversion.functions
      .find((row) => row.signature.includes('tenant_action_apply_provisioning_command'));
    provisioningApply.definition = provisioningApply.definition.replace(` ${writeToken}`, '');
    provisioningApply.definition = provisioningApply.definition.replace(
      ' SELECT * INTO authority FROM tenant_action_authority FOR UPDATE',
      ` ${writeToken} SELECT * INTO authority FROM tenant_action_authority FOR UPDATE`,
    );
    assert.throws(() => validateTenantActionEvidence(provisioningLockInversion), /provisioning no conserva replay/);
  }
});

test('aplicador inspecciona relación, función y definición exactas de cada trigger', async () => {
  const source = await readFile(applierUrl, 'utf8');
  assert.match(source, /trigger\.tgrelid/);
  assert.match(source, /trigger\.tgfoid/);
  assert.match(source, /pg_get_triggerdef\(trigger\.oid, true\)/);

  const misbound = validEvidence();
  misbound.triggers[0].functionName = 'tenant_action_initialize_authority';
  assert.throws(() => validateTenantActionEvidence(misbound), /trigger .*mal vinculado/);

  const homonym = validEvidence();
  homonym.triggers.push({ ...homonym.triggers[0], tableName: 'action_case' });
  assert.throws(() => validateTenantActionEvidence(homonym), /tiene 2 definiciones/);

  const wrongDefinition = validEvidence();
  wrongDefinition.triggers[0].definition = 'before update for each row';
  assert.throws(() => validateTenantActionEvidence(wrongDefinition), /trigger .*no contiene delete/);
});

test('aplicador rechaza índice homónimo, no unique, predicado o owner alterado', async () => {
  const source = await readFile(applierUrl, 'utf8');
  assert.match(source, /meta\.indisunique AS "unique"/);
  assert.match(source, /pg_get_indexdef\(index_class\.oid\)/);
  assert.match(source, /pg_get_expr\(meta\.indpred, meta\.indrelid, true\)/);
  assert.match(source, /owner\.rolname = current_user AS "ownedByCurrentUser"/);

  for (const mutate of [
    (row) => { row.tableName = 'action_case'; },
    (row) => { row.unique = false; },
    (row) => { row.owner = 'municontrol_actions_runtime_app'; },
  ]) {
    const evidence = validEvidence();
    mutate(evidence.indexes.find((row) => row.name === 'tenant_action_area_scope_identity_uk'));
    assert.throws(() => validateTenantActionEvidence(evidence), /índice .*homónimo, inválido o incompleto/);
  }

  const predicate = validEvidence();
  predicate.indexes.find((row) => row.name === 'tenant_action_area_scope_active_idx').predicate = '';
  assert.throws(() => validateTenantActionEvidence(predicate), /índice .*incompleto/);
});

test('aplicador liga cada FK a tabla, tipo y definición canónicos', async () => {
  const source = await readFile(applierUrl, 'utf8');
  assert.match(source, /constraint_row\.conrelid/);
  assert.match(source, /constraint_row\.contype::text AS type/);
  assert.match(source, /pg_get_constraintdef\(constraint_row\.oid, true\)/);

  for (const mutate of [
    (row) => { row.tableName = 'tenant_action_authority'; },
    (row) => { row.type = 'c'; },
    (row) => { row.definition = 'foreign key tenant_id references platform_tenant'; },
  ]) {
    const evidence = validEvidence();
    mutate(evidence.constraints.find((row) => row.name === 'action_case_source_binding_fk'));
    assert.throws(() => validateTenantActionEvidence(evidence), /constraint|no contiene/);
  }
});

test('ACL efectiva cierra secuencia, DML, helpers y autoridad global por email', () => {
  assert.doesNotThrow(() => validateTenantActionRuntimeAclEvidence(validRuntimeAclEvidence()));

  const sequence = validRuntimeAclEvidence();
  sequence.sequence.canUsage = true;
  assert.throws(() => validateTenantActionRuntimeAclEvidence(sequence), /ACL secuencia/);

  const dml = validRuntimeAclEvidence();
  dml.relations.find((row) => row.name === 'action_case_event').canInsert = true;
  assert.throws(() => validateTenantActionRuntimeAclEvidence(dml), /ACL directa insegura/);

  const helper = validRuntimeAclEvidence();
  helper.functions.find((row) => row.name === 'public.action_center_validate_case_update()').execute = true;
  assert.throws(() => validateTenantActionRuntimeAclEvidence(helper), /ACL function/);

  const legacyIam = validRuntimeAclEvidence();
  legacyIam.functions.find((row) => row.name === 'public.tenant_iam_admin_view(text,text,integer)').execute = true;
  assert.throws(() => validateTenantActionRuntimeAclEvidence(legacyIam), /ACL function/);

  const missingV2 = validRuntimeAclEvidence();
  missingV2.functions.find((row) => row.name === 'public.tenant_iam_admin_view_v2(text,uuid,integer,text,integer)').execute = false;
  assert.throws(() => validateTenantActionRuntimeAclEvidence(missingV2), /ACL function/);

  const globalRole = validRuntimeAclEvidence();
  globalRole.globalColumns.find((row) => row.resource === 'internal_users').canSelect = true;
  assert.throws(() => validateTenantActionRuntimeAclEvidence(globalRole), /autoridad global por email/);

  const missingSource = validRuntimeAclEvidence();
  missingSource.requiredColumns.find((row) => (
    row.resource === 'employment_contract' && row.columnName === 'source_batch_id'
  )).canSelect = false;
  assert.throws(() => validateTenantActionRuntimeAclEvidence(missingSource), /columna tenant requerida/);
});
