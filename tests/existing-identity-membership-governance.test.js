import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { createInternalAdminHandler } from '../api/internal-admin.js';
import {
  InternalAdminError,
  applyInternalAdminCommand,
  internalAdminDatabaseError,
  normalizeInternalAdminCommand,
} from '../lib/internal-admin.js';
import {
  EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
  EXISTING_IDENTITY_MEMBERSHIP_FUNCTION_SOURCE_HASHES,
  EXISTING_IDENTITY_MEMBERSHIP_RUNTIME_FUNCTION_ALLOWLIST,
  EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES,
  TENANT_MEMBERSHIP_CHANGE_REQUEST_COLUMN_SHAPES,
  TENANT_MEMBERSHIP_GOVERNANCE_CONTEXT_COLUMN_SHAPES,
  TENANT_MEMBERSHIP_PROTECTED_RELATIONS,
  TENANT_MEMBERSHIP_TRIGGER_CONTRACTS,
  TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES,
  existingIdentityMembershipFingerprint,
  validateExistingIdentityMembershipEvidence,
  validateExistingIdentityMembershipMigrationSql,
} from '../scripts/apply-existing-identity-membership-governance-schema.mjs';

const migrationUrl = new URL(
  '../scripts/migrations/013-existing-identity-membership-governance.sql', import.meta.url,
);
const applicatorUrl = new URL(
  '../scripts/apply-existing-identity-membership-governance-schema.mjs', import.meta.url,
);
const adminHtmlUrl = new URL('../administracion-plataforma.html', import.meta.url);
const membershipDocUrl = new URL('../docs/GOVERNED_TENANT_MEMBERSHIP_20260821.md', import.meta.url);
const membershipQaDocUrl = new URL('../docs/QA_IDENTITY_MEMBERSHIP_20260821.md', import.meta.url);
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const RELEASE_SHA = 'a'.repeat(40);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const TARGET_EMAIL = 'operador.rrhh@junin.test';

function functionDefinition(sql, name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, `funcion ${name} ausente`);
  const end = sql.indexOf('\n$$;', start);
  assert.ok(end > start, `cierre ${name} ausente`);
  return sql.slice(start, end + 4);
}

function noDmlRelation(name) {
  return {
    schemaName: 'public', name,
    canSelect: false, canInsert: false, canUpdate: false, canReferences: false,
    canDelete: false, canTruncate: false, canTrigger: false,
  };
}

function triggerEvidence(contract) {
  const eventSql = contract.events.map((event) => event.toUpperCase()).join(' OR ');
  return {
    ...contract,
    tableSchema: 'public', functionSchema: 'public',
    rowLevel: true, timing: 'before', enabledMode: 'O', internal: false,
    unconditional: true,
    argumentCount: 0, argumentsRaw: '', arguments: [], updateColumns: [],
    events: [...contract.events],
    definition: `CREATE TRIGGER ${contract.name} BEFORE ${eventSql} ON public.${contract.tableName} FOR EACH ROW EXECUTE FUNCTION public.${contract.functionName}()`,
  };
}

function columnEvidence(contract, defaults = {}) {
  return Object.entries(contract).map(([name, shape]) => ({
    name, ...shape, defaultExpression: defaults[name] ?? null,
  }));
}

function evidence(sql) {
  const runtime = new Set([
    EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.adminView,
    EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.apply,
  ]);
  const definitions = {
    actionBindingGuard: functionDefinition(sql, 'tenant_action_validate_binding'),
    appendOnlyGuard: "CREATE FUNCTION tenant_iam_reject_change() SECURITY DEFINER BEGIN RAISE EXCEPTION 'TENANT_IAM_AUDIT_IMMUTABLE' USING ERRCODE = 'P0001'; END",
    employmentHistoryGuard: "CREATE FUNCTION tenant_lifecycle_guard_employment_history_v1() SECURITY DEFINER BEGIN IF TG_OP = 'DELETE' OR OLD.active IS FALSE THEN RAISE EXCEPTION 'TENANT_ACTION_EMPLOYMENT_HISTORY_IMMUTABLE' USING ERRCODE = 'P0001'; END IF; END",
    requestGuard: functionDefinition(sql, 'tenant_membership_change_request_guard_v1'),
    adminView: functionDefinition(sql, 'tenant_iam_admin_view_v3'),
    adminViewCore: 'CREATE FUNCTION tenant_iam_admin_view_core_013() SECURITY DEFINER',
    apply: functionDefinition(sql, 'tenant_membership_governance_apply_v1'),
  };
  return {
    requestColumns: columnEvidence(TENANT_MEMBERSHIP_CHANGE_REQUEST_COLUMN_SHAPES, {
      id: 'gen_random_uuid()', status: "'pending'::character varying",
      requested_at: 'now()', expires_at: "now() + '24:00:00'::interval", version: '1',
    }),
    contextColumns: columnEvidence(TENANT_MEMBERSHIP_GOVERNANCE_CONTEXT_COLUMN_SHAPES, {
      created_at: 'now()',
    }),
    role: { scopeKind: 'tenant', systemManaged: true },
    roleCapabilities: TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES
      .map((capabilityKey) => ({ capabilityKey })),
    sodConflictCount: 0,
    invalidRequestCount: 0,
    pendingDuplicateCount: 0,
    invalidContextCount: 0,
    constraints: [
      ['tenant_membership_change_request_action_ck', "CHECK (requested_action IN ('add','reactivate'))"],
      ['tenant_membership_change_request_role_ck', "CHECK (role_key = 'TENANT_RRHH_ADMIN_OPERATIVO')"],
      ['tenant_membership_change_request_status_ck', "CHECK (status IN ('pending','approved','rejected','expired'))"],
      ['tenant_membership_change_request_membership_fk', 'FOREIGN KEY (membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT'],
      ['tenant_membership_change_request_shape_ck', 'CHECK (expected_membership_version = 0 OR expected_membership_version > 0)'],
      ['tenant_membership_change_request_reason_ck', 'CHECK (((length(btrim(reason)) >= 3) AND (length(btrim(reason)) <= 500)))'],
      ['tenant_membership_change_request_decision_reason_ck', 'CHECK (((decision_reason IS NULL) OR ((length(btrim(decision_reason)) >= 3) AND (length(btrim(decision_reason)) <= 500))))'],
      ['tenant_membership_change_request_version_ck', 'CHECK (version > 0)'],
      ['tenant_membership_change_request_expiry_ck', "CHECK (expires_at = (requested_at + '24:00:00'::interval))"],
      ['tenant_membership_change_request_state_ck', 'CHECK (decided_at <= expires_at AND decided_at >= expires_at AND lower(decided_by_user_email) <> lower(requested_by_user_email) AND lower(decided_by_user_email) <> lower(target_user_email))'],
      ['tenant_membership_change_request_target_user_email_fkey', 'FOREIGN KEY (target_user_email) REFERENCES internal_users(email) ON UPDATE RESTRICT ON DELETE RESTRICT'],
      ['tenant_membership_change_request_requested_by_user_email_fkey', 'FOREIGN KEY (requested_by_user_email) REFERENCES internal_users(email) ON UPDATE RESTRICT ON DELETE RESTRICT'],
      ['tenant_membership_change_request_decided_by_user_email_fkey', 'FOREIGN KEY (decided_by_user_email) REFERENCES internal_users(email) ON UPDATE RESTRICT ON DELETE RESTRICT'],
      ['tenant_membership_change_request_tenant_id_fkey', 'FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id) ON DELETE RESTRICT'],
      ['tenant_membership_change_request_role_key_fkey', 'FOREIGN KEY (role_key) REFERENCES iam_role(role_key) ON DELETE RESTRICT'],
      ['tenant_membership_governance_context_session_version_ck', 'CHECK (actor_session_version > 0)'],
      ['tenant_membership_governance_context_release_ck', "CHECK (release_sha ~ '^[a-f0-9]{40}$')"],
      ['tenant_membership_governance_context_expected_version_ck', 'CHECK (expected_version >= 0)'],
      ['tenant_membership_governance_context_reason_hash_ck', "CHECK (reason_hash ~ '^[a-f0-9]{64}$')"],
      ['tenant_membership_governance_context_event_id_fkey', 'FOREIGN KEY (event_id) REFERENCES tenant_iam_event(id) ON DELETE RESTRICT'],
      ['tenant_membership_governance_context_request_id_fkey', 'FOREIGN KEY (request_id) REFERENCES tenant_membership_change_request(id) ON DELETE RESTRICT'],
      ['tenant_membership_governance_context_actor_session_id_fkey', 'FOREIGN KEY (actor_session_id) REFERENCES tenant_identity_session(id) ON DELETE RESTRICT'],
    ].map(([name, definition]) => ({
      name, definition, validated: true,
      tableName: name.startsWith('tenant_membership_governance_context_')
        ? 'tenant_membership_governance_event_context'
        : 'tenant_membership_change_request',
    })),
    indexes: [
      { name: 'tenant_membership_change_request_pkey', unique: true, primary: true, valid: true, ready: true, definition: 'CREATE UNIQUE INDEX tenant_membership_change_request_pkey ON tenant_membership_change_request (id)' },
      { name: 'tenant_membership_governance_event_context_pkey', unique: true, primary: true, valid: true, ready: true, definition: 'CREATE UNIQUE INDEX tenant_membership_governance_event_context_pkey ON tenant_membership_governance_event_context (event_id)' },
      { name: 'tenant_membership_change_request_pending_uk', unique: true, primary: false, valid: true, ready: true, definition: "CREATE UNIQUE INDEX tenant_membership_change_request_pending_uk ON tenant_membership_change_request (tenant_id, lower(target_user_email)) WHERE status = 'pending'" },
      { name: 'tenant_membership_change_request_recent_idx', unique: false, primary: false, valid: true, ready: true, definition: 'CREATE INDEX tenant_membership_change_request_recent_idx ON tenant_membership_change_request (requested_at DESC, id)' },
    ],
    functions: Object.entries(EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES)
      .map(([key, signature]) => ({
        signature, securityDefiner: true, ownedByCurrentUser: true,
        ownerIsRuntime: false, publicExecuteRevoked: true,
        runtimeCanExecute: runtime.has(signature), runtimeExecuteGrantable: false,
        nonOwnerExecuteGrantees: runtime.has(signature) ? [RUNTIME_ROLE] : [],
        language: 'plpgsql', kind: 'f', volatility: 'v',
        returnType: signature.includes('admin_view') || signature.includes('governance_apply')
          ? 'jsonb' : 'trigger',
        config: ['search_path=public, pg_temp'], definition: definitions[key],
        sourceHash: EXISTING_IDENTITY_MEMBERSHIP_FUNCTION_SOURCE_HASHES[signature],
      })),
    triggers: Object.values(TENANT_MEMBERSHIP_TRIGGER_CONTRACTS).map(triggerEvidence),
    protectedRelations: TENANT_MEMBERSHIP_PROTECTED_RELATIONS.map((name) => ({
      schemaName: 'public', name, ownerIsRuntime: false, ownedByCurrentUser: true,
      publicTablePrivilegesRevoked: true, publicColumnPrivilegesRevoked: true,
      runtimeTablePrivilegesRevoked: true, runtimeColumnPrivilegesRevoked: true,
      nonOwnerTablePrivilegeGrantees: [], nonOwnerColumnPrivileges: [],
    })),
    runtimeRole: {
      canLogin: true, inherit: false, superuser: false, bypassRls: false,
      createDb: false, createRole: false, replication: false, membershipCount: 0,
      schemaUsage: true, schemaCreate: false,
    },
    roleMemberships: [],
    runtimeFunctions: EXISTING_IDENTITY_MEMBERSHIP_RUNTIME_FUNCTION_ALLOWLIST
      .map((signature) => ({ signature })),
    unexpectedSecurityDefiners: [],
    relations: [
      ...TENANT_MEMBERSHIP_PROTECTED_RELATIONS.map(noDmlRelation),
      noDmlRelation('internal_users'),
    ],
    sequences: [],
  };
}

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

test('013 modela RRHH operativo tenant sin SUPERUSER ni capacidades incompatibles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.equal(
    EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
    '013-existing-identity-membership-governance',
  );
  assert.equal(validateExistingIdentityMembershipMigrationSql(sql), true);
  assert.match(existingIdentityMembershipFingerprint(sql), /^[a-f0-9]{64}$/);
  assert.match(sql, /'TENANT_RRHH_ADMIN_OPERATIVO', 'workforce\.employee\.read'/);
  assert.match(sql, /'TENANT_RRHH_ADMIN_OPERATIVO', 'employee\.record\.propose'/);
  assert.doesNotMatch(sql, /COMMENT ON ROLE|CREATE ROLE|ALTER ROLE/i);
  for (const forbidden of [
    'payroll.read', 'budget.approved.read', 'leave.request.restricted.read',
    'employee.record.approve', 'absence.validate', 'leave.approve',
    'time.overtime.approve', 'time.overtime.post',
  ]) {
    assert.doesNotMatch(sql, new RegExp(
      `'TENANT_RRHH_ADMIN_OPERATIVO', '${forbidden.replaceAll('.', '\\.')}\'`, 'i',
    ));
  }
});

test('013 implementa maker-checker y expectedVersion=0 exacto para el alta', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const apply = functionDefinition(sql, 'tenant_membership_governance_apply_v1');
  const guard = functionDefinition(sql, 'tenant_membership_change_request_guard_v1');
  for (const command of [
    'request_existing_membership', 'request_membership_reactivation',
    'approve_membership_change', 'reject_membership_change',
  ]) assert.match(apply, new RegExp(`'${command}'`));
  assert.match(apply, /p_expected_version <> 0/);
  assert.match(apply, /lower\(request_row\.requested_by_user_email\) = actor_email[\s\S]+lower\(request_row\.target_user_email\) = actor_email/);
  assert.match(apply, /TENANT_MEMBERSHIP_MAKER_CHECKER_REQUIRED/);
  assert.match(sql, /tenant_membership_change_request_shape_ck[\s\S]+requested_action = 'add'[\s\S]+expected_membership_version = 0/);
  assert.match(sql, /FOREIGN KEY \(membership_id, tenant_id\)[\s\S]+REFERENCES tenant_membership\(id, tenant_id\)[\s\S]+ON UPDATE RESTRICT/);
  assert.match(sql, /tenant_membership_change_request_state_ck[\s\S]+lower\(decided_by_user_email\) <> lower\(requested_by_user_email\)[\s\S]+lower\(decided_by_user_email\) <> lower\(target_user_email\)/);
  assert.match(guard, /TG_OP = 'INSERT'[\s\S]+NEW\.status <> 'pending'[\s\S]+NEW\.version <> 1/);
  assert.match(guard, /NEW\.expires_at IS DISTINCT FROM \(NEW\.requested_at \+ interval '24 hours'\)/);
  assert.doesNotMatch(guard, /NEW\.requested_at IS DISTINCT FROM now\(\)/);
  assert.match(guard, /membership\.tenant_id = NEW\.tenant_id[\s\S]+lower\(membership\.user_email\) = lower\(NEW\.target_user_email\)/);
  assert.match(guard, /OLD\.status <> 'pending'/);
  assert.match(guard, /NEW\.status NOT IN \('approved', 'rejected', 'expired'\)/);
  assert.match(guard, /NEW\.version IS DISTINCT FROM OLD\.version \+ 1/);
  assert.doesNotMatch(sql, /ON UPDATE CASCADE/i);
  const weakenedVersion = sql.replace('p_expected_version <> 0', 'p_expected_version < 0');
  assert.throws(() => validateExistingIdentityMembershipMigrationSql(weakenedVersion), /p_expected_version <> 0/);
  const weakenedChecker = sql.replace(
    'lower(request_row.target_user_email) = actor_email', 'FALSE',
  );
  assert.throws(() => validateExistingIdentityMembershipMigrationSql(weakenedChecker), /target_user_email/);
});

test('013 soporta el mínimo real de dos owners: el objetivo solicita y el otro decide', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const apply = functionDefinition(sql, 'tenant_membership_governance_apply_v1');
  const requestStart = apply.indexOf("IF p_command IN ('request_existing_membership', 'request_membership_reactivation')");
  const firstVersionGuard = apply.indexOf('IF p_expected_version < 1', requestStart);
  const decisionStart = apply.indexOf('IF p_expected_version < 1', firstVersionGuard + 1);
  assert.ok(requestStart >= 0 && firstVersionGuard > requestStart && decisionStart > firstVersionGuard);
  const requestFlow = apply.slice(requestStart, decisionStart);

  assert.match(requestFlow, /lower\(assignment\.user_email\) <> actor_email/);
  assert.match(requestFlow, /lower\(assignment\.user_email\) <> target_email/);
  assert.doesNotMatch(requestFlow, /(?:target_email\s*<>\s*actor_email|actor_email\s*<>\s*target_email)/);
  assert.match(requestFlow, /target_user\.email, membership_id_value, role_row\.role_key,[\s\S]+actor_user\.email/);

  const ownerA = 'owner-a@example.test';
  const ownerB = 'owner-b@example.test';
  const actorEmail = ownerA;
  const targetEmail = ownerA;
  const eligibleCheckers = [ownerA, ownerB].filter((email) => (
    email !== actorEmail && email !== targetEmail
  ));
  assert.deepEqual(eligibleCheckers, [ownerB]);

  const [membershipDoc, qaDoc] = await Promise.all([
    readFile(membershipDocUrl, 'utf8'), readFile(membershipQaDocUrl, 'utf8'),
  ]);
  assert.doesNotMatch(membershipDoc, /solicitante, decisor y cuenta objetivo deben ser distintos/);
  assert.doesNotMatch(qaDoc, /solicitante, decisor y cuenta objetivo deben ser personas distintas/);
  assert.match(membershipDoc, /La cuenta objetivo sí puede solicitar su propia membresía/);
  assert.match(qaDoc, /solicitante y objetivo pueden ser la misma persona/);
});

test('013 revalida identidad y reactiva con limpieza revocatoria atómica y auditable', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const apply = functionDefinition(sql, 'tenant_membership_governance_apply_v1');
  const bindingGuard = functionDefinition(sql, 'tenant_action_validate_binding');
  assert.match(apply, /tenant_lifecycle_assert_platform_capability_v2[\s\S]+'platform\.users\.manage'/);
  assert.match(apply, /users\.auth_mode = 'managed'/);
  assert.match(apply, /tenant_identity_mfa_factor[\s\S]+factor\.status = 'active'[\s\S]+FOR SHARE/);
  assert.match(apply, /tenant\.status = 'active'/);
  assert.match(apply, /binding\.source_system = 'GRH'[\s\S]+binding\.verified IS TRUE/);
  assert.match(apply, /policy\.certified_release_sha = p_release_sha/);
  assert.match(apply, /DELETE FROM tenant_membership_capability_override override_row[\s\S]+override_row\.allow_override IS TRUE/);
  assert.match(apply, /preserved_deny_overrides[\s\S]+deny_override IS TRUE/);
  assert.match(apply, /UPDATE tenant_action_employment_link link SET[\s\S]+active = false/);
  assert.match(apply, /UPDATE tenant_action_area_scope scope SET[\s\S]+active = false/);
  assert.match(apply, /UPDATE tenant_exclusive_capability exclusive SET[\s\S]+active = false/);
  assert.match(apply, /'snapshot', authority_snapshot[\s\S]+'snapshotSha256', authority_snapshot_hash/);
  assert.match(apply, /SELECT \* INTO authority_row FROM tenant_action_authority[\s\S]+FOR UPDATE/);
  assert.match(apply, /UPDATE tenant_action_authority SET[\s\S]+version = version \+ 1/);
  assert.match(apply, /'allowOverrideRowsDeleted', revoked_overrides/);
  assert.match(apply, /'denyOverrideRowsPreserved', preserved_deny_overrides/);
  const cleanupAt = apply.indexOf('DELETE FROM tenant_membership_capability_override');
  const activateAt = apply.indexOf("status = 'active', activated_at");
  assert.ok(cleanupAt >= 0 && activateAt > cleanupAt,
    'la autoridad residual debe revocarse antes de reactivar la membresía');
  assert.match(apply, /TENANT_MEMBERSHIP_STALE_AUTHORITY_REVIEW_REQUIRED/g);
  assert.match(bindingGuard, /OLD\.active IS TRUE AND NEW\.active IS FALSE/);
  assert.match(bindingGuard, /batch\.legacy_import_run_id IS NOT NULL/);
  assert.match(apply, /'futureTenantAccess', false/);
  assert.match(apply, /'credentialsCreated', false/);
});

test('013 liga replay a solicitud, sesión, release y versión con dos guards activos', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const apply = functionDefinition(sql, 'tenant_membership_governance_apply_v1');
  assert.match(apply, /replay_context\.actor_session_id IS DISTINCT FROM p_actor_session_id/);
  assert.match(apply, /replay_context\.actor_session_version IS DISTINCT FROM p_actor_session_version/);
  assert.match(apply, /replay_context\.release_sha IS DISTINCT FROM p_release_sha/);
  assert.match(apply, /replay_context\.expected_version IS DISTINCT FROM p_expected_version/);
  assert.match(apply, /command_hash_value := encode\(digest\(convert_to\(jsonb_build_object\(/);
  assert.match(apply, /replay\.command_hash IS DISTINCT FROM command_hash_value/);
  assert.match(apply, /p_idempotency_key, command_hash_value, result_value/);
  assert.match(sql, /CREATE TRIGGER tenant_membership_change_request_guard[\s\S]+BEFORE INSERT OR UPDATE OR DELETE/);
  assert.match(sql, /CREATE TRIGGER tenant_membership_governance_event_context_append_only[\s\S]+BEFORE UPDATE OR DELETE/);
  assert.match(apply, /UPDATE tenant_identity_session SET[\s\S]+status = 'revoked'/);
  assert.match(apply, /actor_email \|\| ':' \|\| p_idempotency_key::text, 0/);
  assert.doesNotMatch(apply, /session_version\s*=\s*session_version\s*\+\s*1/);
  assert.match(apply, /INSERT INTO tenant_membership_governance_event_context \([\s\S]+request_id/);
  const actorCheckAt = apply.indexOf('tenant_lifecycle_assert_platform_capability_v2');
  const replayAt = apply.indexOf('SELECT * INTO replay FROM tenant_iam_event');
  const checkerAt = apply.indexOf('lower(assignment.user_email) <> actor_email');
  assert.ok(actorCheckAt >= 0 && replayAt > actorCheckAt && checkerAt > replayAt);
  assert.match(apply, /TENANT_MEMBERSHIP_REQUEST_PENDING/);
  assert.match(apply, /GET STACKED DIAGNOSTICS conflict_constraint_name = CONSTRAINT_NAME/);
  assert.match(apply, /request_time_value := clock_timestamp\(\)/);
  assert.match(apply, /decision_time_value := clock_timestamp\(\)/);
  assert.doesNotMatch(apply, /request_row\.expires_at <= now\(\)/);
  const firstMembershipLookup = apply.indexOf('WHERE membership.id = membership_id_value;');
  const membershipAdvisory = apply.indexOf("tenant_id_value::text || ':' || target_email || ':membership'");
  const membershipWriteLock = apply.indexOf(
    'WHERE membership.id = membership_id_value FOR UPDATE', membershipAdvisory,
  );
  assert.ok(firstMembershipLookup >= 0 && membershipAdvisory > firstMembershipLookup
    && membershipWriteLock > membershipAdvisory);
  const decisionStart = apply.indexOf("request_id_value := (p_payload->>'requestId')::uuid");
  const decisionAdvisory = apply.indexOf(
    "tenant_id_value::text || ':' || target_email || ':membership'", decisionStart,
  );
  const requestWriteLock = apply.indexOf(
    'WHERE request.id = request_id_value FOR UPDATE', decisionStart,
  );
  assert.ok(decisionStart >= 0 && decisionAdvisory > decisionStart
    && requestWriteLock > decisionAdvisory);
});

test('bootstrap 013 sólo anuncia gobierno cuando el actor y el checker son elegibles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const view = functionDefinition(sql, 'tenant_iam_admin_view_v3');
  assert.match(view, /actor_governance_ready boolean := false/);
  assert.match(view, /lower\(actor_assignment\.user_email\) = lower\(btrim\(p_actor_email\)\)[\s\S]+actor_factor\.status = 'active'/);
  assert.match(view, /IF actor_governance_ready AND jsonb_array_length\(eligible_tenant_ids\) > 0 AND EXISTS[\s\S]+lower\(checker_assignment\.user_email\) <> lower\(btrim\(p_actor_email\)\)/);
  assert.match(view, /IF actionable_request_count > 0[\s\S]+'approve_membership_change'[\s\S]+'reject_membership_change'/);
  assert.match(view, /view_time_value timestamptz := clock_timestamp\(\)/);
  assert.match(view, /'canCurrentActorDecide', actor_governance_ready[\s\S]+request\.expires_at > view_time_value/);
  assert.match(view, /'requestTtlHours', 24/);
  assert.match(view, /'actorGovernanceReady', actor_governance_ready/);
  assert.match(view, /policy\.tenant_data_plane_ready IS TRUE[\s\S]+policy\.certified_release_sha = p_release_sha/);
  assert.match(view, /binding\.source_system = 'GRH' AND binding\.verified IS TRUE/);
  assert.match(view, /'eligibleTenantIds', eligible_tenant_ids/);
  assert.match(view, /IF actor_governance_ready AND usable_owner_count >= 2 THEN[\s\S]+INTO eligible_tenant_ids/);
  assert.match(view, /jsonb_array_length\(eligible_tenant_ids\) > 0/);
});

test('aplicador recolecta ACL de columnas, triggers completos y DML cero global', async () => {
  const source = await readFile(applicatorUrl, 'utf8');
  assert.match(source, /attribute\.attacl/);
  assert.doesNotMatch(source, /aclexplode\(COALESCE\(attribute\.attacl/);
  assert.match(source, /to_jsonb\(ARRAY\(SELECT role_row\.rolname/);
  assert.match(source, /acl\.is_grantable IS TRUE/);
  assert.match(source, /to_jsonb\(ARRAY\(SELECT DISTINCT COALESCE\(role_row\.rolname/);
  assert.match(source, /to_jsonb\(ARRAY\([\s\S]+nonOwnerColumnPrivileges/);
  assert.match(source, /publicColumnPrivilegesRevoked/);
  assert.match(source, /runtimeColumnPrivilegesRevoked/);
  assert.match(source, /pg_get_constraintdef\(constraint_row\.oid, true\)/);
  assert.match(source, /pg_get_indexdef\(index_row\.indexrelid\)/);
  assert.match(source, /function_row\.prosrc AS "sourceBody"/);
  assert.match(source, /function_row\.provolatile/);
  assert.match(source, /function_row\.prokind/);
  assert.match(source, /function_row\.prorettype::regtype/);
  assert.match(source, /existingIdentityMembershipFunctionSourceFingerprint/);
  assert.match(source, /trigger_row\.tgenabled/);
  assert.match(source, /trigger_row\.tgnargs/);
  assert.match(source, /trigger_row\.tgattr/);
  assert.match(source, /trigger_row\.tgtype/);
  assert.match(source, /trigger_row\.tgqual IS NULL AS unconditional/);
  assert.match(source, /membership\.member = role_row\.oid/);
  assert.match(source, /relation\.relkind IN \('r','p','v','m','f'\)/);
  assert.match(source, /relation\.relkind = 'S'/);
  assert.match(source, /exactSet\(\(evidence\?\.runtimeFunctions/);
  assert.match(source, /async function verifyNoUnledgeredObjects/);
  assert.match(source, /to_regprocedure\('public\.tenant_iam_admin_view_core_013/);
  assert.match(source, /objetos 013 sin ledger/);
  assert.match(source, /if \(!existing\.rowCount\) \{[\s\S]+await verifyNoUnledgeredObjects\(client\)/);
  assert.match(source, /await verifyExistingIdentityMembershipFinalAcl\(client\);[\s\S]+await client\.query\('COMMIT'\)/);
  assert.match(source, /'tenant_action_validate_binding'/);
  assert.match(source, /tenant_action_employment_binding_guard/);
  assert.match(source, /tenant_action_scope_binding_guard/);
});

test('validador 013 exige ACL exacta también en reaplicación', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const valid = evidence(sql);
  assert.equal(validateExistingIdentityMembershipEvidence(valid), true);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    contextColumns: valid.contextColumns.filter((row) => row.name !== 'request_id'),
  }), /columnas contexto/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    requestColumns: valid.requestColumns.map((row) => row.name === 'status'
      ? { ...row, nullable: true } : row),
  }), /tipo\/nullability invalido/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    constraints: valid.constraints.filter((row) => row.name !== 'tenant_membership_change_request_state_ck'),
  }), /constraint 013 ausente/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    constraints: valid.constraints.map((row) => row.name === 'tenant_membership_change_request_expiry_ck'
      ? { ...row, definition: "CHECK (expires_at = (requested_at + '48:00:00'::interval))" }
      : row),
  }), /24 horas exactas/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    constraints: valid.constraints.map((row) => row.name === 'tenant_membership_change_request_reason_ck'
      ? { ...row, definition: 'CHECK ((length(btrim(reason)) >= 2) AND (length(btrim(reason)) <= 500))' }
      : row),
  }), /rango exacto 3\.\.500/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    constraints: valid.constraints.map((row) => row.name === 'tenant_membership_change_request_reason_ck'
      ? { ...row, definition: 'CHECK ((length(btrim(reason)) >= 3) OR (length(btrim(reason)) <= 500))' }
      : row),
  }), /rango exacto 3\.\.500/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    constraints: valid.constraints.map((row) => row.name === 'tenant_membership_change_request_decision_reason_ck'
      ? { ...row, definition: 'CHECK ((decision_reason IS NULL) AND ((length(btrim(decision_reason)) >= 3) AND (length(btrim(decision_reason)) <= 500)))' }
      : row),
  }), /rango exacto 3\.\.500/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    indexes: valid.indexes.map((row) => row.name === 'tenant_membership_change_request_pending_uk'
      ? { ...row, unique: false } : row),
  }), /indice pending 013/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid, invalidRequestCount: 1,
  }), /invariantes 013/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    triggers: valid.triggers.map((row) => row.name === TENANT_MEMBERSHIP_TRIGGER_CONTRACTS.requestGuard.name
      ? { ...row, enabledMode: 'D' } : row),
  }), /trigger 013/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    triggers: valid.triggers.map((row) => row.name === TENANT_MEMBERSHIP_TRIGGER_CONTRACTS.requestGuard.name
      ? { ...row, unconditional: false } : row),
  }), /trigger 013/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    triggers: [...valid.triggers, {
      ...triggerEvidence(TENANT_MEMBERSHIP_TRIGGER_CONTRACTS.requestGuard),
      name: 'rogue_request_trigger',
    }],
  }), /inventario de triggers/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    protectedRelations: valid.protectedRelations.map((row) => row.name === 'tenant_membership_change_request'
      ? { ...row, nonOwnerColumnPrivileges: ['PUBLIC:reason:SELECT'] } : row),
  }), /ACL de tabla\/columnas/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    functions: valid.functions.map((row) => row.signature === EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.apply
      ? { ...row, runtimeExecuteGrantable: true } : row),
  }), /funcion insegura 013/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    functions: valid.functions.map((row) => row.signature === EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.apply
      ? { ...row, sourceHash: '0'.repeat(64) } : row),
  }), /definicion de funcion 013 con drift/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    functions: valid.functions.map((row) => row.signature === EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.apply
      ? { ...row, volatility: 'i' } : row),
  }), /funcion insegura 013/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    functions: valid.functions.map((row) => row.signature === EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.actionBindingGuard
      ? { ...row, runtimeCanExecute: true, nonOwnerExecuteGrantees: [RUNTIME_ROLE] } : row),
  }), /guard de binding 013 expuesto/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    functions: valid.functions.map((row) => row.signature === EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.appendOnlyGuard
      ? { ...row, runtimeCanExecute: true, nonOwnerExecuteGrantees: [RUNTIME_ROLE] } : row),
  }), /guard append-only 013 expuesto/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid, runtimeRole: { ...valid.runtimeRole, membershipCount: 1 },
  }), /privilegios elevados/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid, roleMemberships: [{ direction: 'granted_to_runtime' }],
  }), /membresias runtime/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    relations: valid.relations.map((row, index) => index === 0
      ? { ...row, canUpdate: true } : row),
  }), /DML directo/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    sequences: [{ schemaName: 'public', name: 'rogue_seq', canUsage: true, canSelect: false, canUpdate: false }],
  }), /privilegio de secuencia/);
  assert.throws(() => validateExistingIdentityMembershipEvidence({
    ...valid,
    runtimeFunctions: [...valid.runtimeFunctions, { signature: 'public.rogue_secdef()' }],
  }), /EXECUTE runtime 013/);
});

test('normalizador expone cuatro comandos y fija expectedVersion=0 para alta', () => {
  const add = normalizeInternalAdminCommand({
    command: 'request_existing_membership', expectedVersion: 0,
    payload: {
      tenantId: TENANT_ID, email: 'Operador.RRHH@Junin.test',
      roleKey: 'TENANT_RRHH_ADMIN_OPERATIVO', reason: 'Autorización de dirección',
    },
  }, KEY);
  assert.equal(add.payload.email, TARGET_EMAIL);
  assert.equal(add.expectedVersion, 0);
  for (const expectedVersion of [1, 2]) {
    assert.throws(() => normalizeInternalAdminCommand({
      command: 'request_existing_membership', expectedVersion,
      payload: {
        tenantId: TENANT_ID, email: TARGET_EMAIL,
        roleKey: 'TENANT_RRHH_ADMIN_OPERATIVO', reason: 'Autorización válida',
      },
    }, KEY), (error) => error instanceof InternalAdminError
      && error.code === 'INTERNAL_ADMIN_VERSION_REQUIRED');
  }
  assert.throws(() => normalizeInternalAdminCommand({
    command: 'request_existing_membership', expectedVersion: 0,
    payload: {
      tenantId: TENANT_ID, email: TARGET_EMAIL,
      roleKey: 'TENANT_RRHH_ADMIN_OPERATIVO', reason: 'Autorizado', password: 'x',
    },
  }, KEY), (error) => error instanceof InternalAdminError
    && ['INTERNAL_ADMIN_FIELD_UNSUPPORTED', 'INTERNAL_ADMIN_SECRET_FORBIDDEN'].includes(error.code));
  assert.doesNotThrow(() => normalizeInternalAdminCommand({
    command: 'request_membership_reactivation', expectedVersion: 3,
    payload: { membershipId: MEMBERSHIP_ID, reason: 'Reingreso aprobado' },
  }, KEY));
  for (const command of ['approve_membership_change', 'reject_membership_change']) {
    assert.doesNotThrow(() => normalizeInternalAdminCommand({
      command, expectedVersion: 1,
      payload: { requestId: REQUEST_ID, reason: 'Decisión independiente documentada' },
    }, KEY));
  }
});

test('fachada release-bound enruta solicitud, reactivación, aprobación y rechazo', async () => {
  const calls = [];
  const sql = { query: async (statement, parameters) => {
    calls.push({ statement, parameters });
    return [{ result: { request: { id: REQUEST_ID }, futureTenantAccess: false } }];
  } };
  const session = { id: SESSION_ID, email: 'owner@example.test', version: 4 };
  const bodies = [
    {
      command: 'request_existing_membership', expectedVersion: 0,
      payload: { tenantId: TENANT_ID, email: TARGET_EMAIL, roleKey: 'TENANT_RRHH_ADMIN_OPERATIVO', reason: 'Alta solicitada' },
    },
    {
      command: 'request_membership_reactivation', expectedVersion: 2,
      payload: { membershipId: MEMBERSHIP_ID, reason: 'Reactivación solicitada' },
    },
    ...['approve_membership_change', 'reject_membership_change'].map((command) => ({
      command, expectedVersion: 1,
      payload: { requestId: REQUEST_ID, reason: 'Decisión independiente' },
    })),
  ];
  for (const body of bodies) {
    const command = normalizeInternalAdminCommand(body, KEY);
    const result = await applyInternalAdminCommand(sql, session, command, { releaseSha: RELEASE_SHA });
    assert.equal(result.futureTenantAccess, false);
  }
  assert.equal(calls.length, 4);
  for (const [index, call] of calls.entries()) {
    assert.match(call.statement, /tenant_membership_governance_apply_v1/);
    assert.match(call.parameters[6], /^[a-f0-9]{64}$/);
    assert.equal(call.parameters[3], RELEASE_SHA);
    assert.equal(call.parameters[4], bodies[index].command);
    assert.equal(call.parameters[7], bodies[index].expectedVersion);
  }
});

test('API responde 202 a solicitudes y 200 a decisiones maker-checker', async () => {
  const captured = [];
  const handler = createInternalAdminHandler({
    env: { NODE_ENV: 'test', INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA },
    requireCompatibleInternalAccess: async () => ({
      mode: 'managed',
      session: { id: SESSION_ID, email: 'owner@example.test', version: 4, mfa: true },
      principal: {
        authorized: true,
        tenant: null,
        platform: {
          roles: ['PLATFORM_OWNER'],
          capabilities: ['platform.users.manage'],
        },
      },
    }),
    getInternalAdminSql: async () => ({ query: async () => [] }),
    applyInternalAdminCommand: async (_sql, _session, command) => {
      captured.push(command);
      return { request: { id: REQUEST_ID }, credentialsCreated: false };
    },
  });
  const cases = [
    [{
      command: 'request_existing_membership', expectedVersion: 0,
      payload: { tenantId: TENANT_ID, email: TARGET_EMAIL, roleKey: 'TENANT_RRHH_ADMIN_OPERATIVO', reason: 'Alta solicitada' },
    }, 202],
    [{
      command: 'request_membership_reactivation', expectedVersion: 2,
      payload: { membershipId: MEMBERSHIP_ID, reason: 'Reactivación solicitada' },
    }, 202],
    [{
      command: 'approve_membership_change', expectedVersion: 1,
      payload: { requestId: REQUEST_ID, reason: 'Aprobación independiente' },
    }, 200],
  ];
  for (const [body, expectedStatus] of cases) {
    const res = response();
    await handler({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': KEY }, body,
    }, res);
    assert.equal(res.statusCode, expectedStatus);
    assert.equal(res.payload.credentialsCreated, false);
  }
  assert.deepEqual(captured.map((command) => command.command), cases.map(([body]) => body.command));
});

test('errores de constraints conservan mapeos seguros de fallback', () => {
  const cases = [
    ['tenant_membership_identity_uk', 'INTERNAL_ADMIN_MEMBERSHIP_EXISTS'],
    ['tenant_membership_change_request_pending_uk', 'INTERNAL_ADMIN_MEMBERSHIP_REQUEST_PENDING'],
    ['tenant_iam_event_actor_idempotency_uk', 'INTERNAL_ADMIN_IDEMPOTENCY_REUSED'],
  ];
  for (const [constraint, expectedCode] of cases) {
    const mapped = internalAdminDatabaseError({
      message: `duplicate key value violates unique constraint "${constraint}"`,
    });
    assert.ok(mapped instanceof InternalAdminError);
    assert.equal(mapped.status, 409);
    assert.equal(mapped.code, expectedCode);
  }
});

test('UI expone solicitudes y decisiones sólo desde allowedCommands', async () => {
  const html = await readFile(adminHtmlUrl, 'utf8');
  assert.match(html, /id="attachExistingButton"/);
  assert.match(html, /id="attachExistingDialog"/);
  assert.match(html, /id="reactivateMembershipButton"/);
  assert.match(html, /runCommand\('request_existing_membership'/);
  assert.match(html, /runCommand\('request_membership_reactivation'/);
  assert.match(html, /'approve_membership_change'/);
  assert.match(html, /'reject_membership_change'/);
  assert.match(html, /membershipRequests/);
  assert.match(html, /canCommand\('approve_membership_change'\)/);
  const attachDialog = html.slice(
    html.indexOf('<dialog id="attachExistingDialog"'),
    html.indexOf('<dialog id="userDetailDialog"'),
  );
  assert.doesNotMatch(attachDialog, /type="password"|name="password"/i);
  assert.match(attachDialog, /No crea contraseñas ni habilita tenants futuros/);
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) {
      new vm.Script(match[2], { filename: 'administracion-plataforma.html' });
    }
  }
});
