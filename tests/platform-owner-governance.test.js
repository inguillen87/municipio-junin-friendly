import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { createInternalAdminHandler } from '../api/internal-admin.js';
import {
  applyInternalAdminCommand,
  getInternalAdminView,
  normalizeInternalAdminCommand,
} from '../lib/internal-admin.js';
import {
  PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION,
  PLATFORM_OWNER_GOVERNANCE_RUNTIME_FUNCTION_ALLOWLIST,
  PLATFORM_OWNER_GOVERNANCE_SIGNATURES,
  PLATFORM_ROLE_CHANGE_REQUEST_COLUMNS,
  platformOwnerGovernanceFingerprint,
  validatePlatformOwnerGovernanceEvidence,
  validatePlatformOwnerGovernanceMigrationSql,
  validatePlatformOwnerGovernanceRuntimeAclEvidence,
} from '../scripts/apply-platform-owner-governance-schema.mjs';
import { VERSIONED_TIME_CATALOG_RUNTIME_FUNCTION_ALLOWLIST } from '../scripts/apply-versioned-time-catalog-schema.mjs';
import { secondaryOwnerBootstrapConfiguration } from '../scripts/bootstrap-secondary-platform-owner.mjs';

const migrationUrl = new URL('../scripts/migrations/012-platform-owner-governance.sql', import.meta.url);
const bootstrapUrl = new URL('../scripts/bootstrap-tenant-iam.mjs', import.meta.url);
const adminHtmlUrl = new URL('../administracion-plataforma.html', import.meta.url);
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const RELEASE_SHA = 'a'.repeat(40);

function functionDefinition(sql, signature) {
  const name = signature.slice('public.'.length, signature.indexOf('('));
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, `funcion ${name} ausente`);
  const end = sql.indexOf('\n$$;', start);
  assert.ok(end > start, `cierre ${name} ausente`);
  return sql.slice(start, end + 4);
}

function governanceEvidence(sql) {
  const runtime = new Set([
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.view,
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.apply,
  ]);
  const requestConstraints = [
    'platform_role_change_request_pkey',
    'platform_role_change_request_target_user_email_fkey',
    'platform_role_change_request_role_key_fkey',
    'platform_role_change_request_requested_by_user_email_fkey',
    'platform_role_change_request_decided_by_user_email_fkey',
    'platform_role_change_request_role_ck',
    'platform_role_change_request_action_ck',
    'platform_role_change_request_status_ck',
    'platform_role_change_request_assignment_version_ck',
    'platform_role_change_request_reason_ck',
    'platform_role_change_request_decision_reason_ck',
    'platform_role_change_request_version_ck',
    'platform_role_change_request_state_ck',
  ];
  return {
    requestColumns: PLATFORM_ROLE_CHANGE_REQUEST_COLUMNS.map((name) => ({ name })),
    ownerColumns: [{ name: 'revoked_by_user_email' }, { name: 'version' }],
    constraints: [
      ...requestConstraints.map((name) => ({
        name, tableName: 'platform_role_change_request', validated: true,
      })),
      { name: 'platform_user_role_version_ck', tableName: 'platform_user_role', validated: true },
      { name: 'platform_user_role_revocation_actor_ck', tableName: 'platform_user_role', validated: false },
    ],
    indexes: [
      { name: 'platform_role_change_request_pending_uk', tableName: 'platform_role_change_request', unique: true, valid: true, ready: true, predicate: "((status)::text = 'pending'::text)" },
      { name: 'platform_role_change_request_recent_idx', tableName: 'platform_role_change_request', unique: false, valid: true, ready: true, predicate: null },
      { name: 'platform_user_role_active_owner_idx', tableName: 'platform_user_role', unique: false, valid: true, ready: true, predicate: '(active IS TRUE)' },
    ],
    triggers: [
      { name: 'platform_owner_governance_lock', tableName: 'platform_user_role', functionName: 'platform_owner_governance_lock_v1', functionSchema: 'public', enabled: 'O', noArguments: true, notConstraint: true, allColumns: true, rowLevel: false, timing: 'before', events: ['insert', 'delete', 'update'], definition: 'CREATE TRIGGER platform_owner_governance_lock BEFORE INSERT OR DELETE OR UPDATE ON public.platform_user_role FOR EACH STATEMENT EXECUTE FUNCTION public.platform_owner_governance_lock_v1()' },
      { name: 'platform_owner_last_active_guard', tableName: 'platform_user_role', functionName: 'platform_owner_last_active_guard_v1', functionSchema: 'public', enabled: 'O', noArguments: true, notConstraint: true, allColumns: true, rowLevel: true, timing: 'before', events: ['delete', 'update'], definition: 'CREATE TRIGGER platform_owner_last_active_guard BEFORE DELETE OR UPDATE ON public.platform_user_role FOR EACH ROW EXECUTE FUNCTION public.platform_owner_last_active_guard_v1()' },
      { name: 'tenant_iam_event_append_only', tableName: 'tenant_iam_event', functionName: 'tenant_iam_reject_change', functionSchema: 'public', enabled: 'O', noArguments: true, notConstraint: true, allColumns: true, rowLevel: true, timing: 'before', events: ['delete', 'update'], definition: 'CREATE TRIGGER tenant_iam_event_append_only BEFORE DELETE OR UPDATE ON public.tenant_iam_event FOR EACH ROW EXECUTE FUNCTION public.tenant_iam_reject_change()' },
    ],
    functions: Object.values(PLATFORM_OWNER_GOVERNANCE_SIGNATURES).map((signature) => ({
      signature, securityDefiner: true, ownedByCurrentUser: true, ownerIsRuntime: false,
      config: ['search_path=public, pg_temp'], publicExecuteRevoked: true,
      runtimeCanExecute: runtime.has(signature),
      nonOwnerExecuteGrantees: runtime.has(signature) ? ['municontrol_actions_runtime_app'] : [],
      definition: functionDefinition(sql, signature),
    })),
    tableAcl: ['platform_role_change_request', 'platform_user_role', 'tenant_iam_event']
      .map((name) => ({
        name, ownedByCurrentUser: true, ownerIsRuntime: false,
        publicPrivilegesRevoked: true, runtimePrivilegesRevoked: true,
        nonOwnerPrivilegeGrantees: [],
      })),
    sequenceAcl: [],
    activeOwnerCount: 1,
    pendingDuplicateGroups: 0,
    requestStateViolations: 0,
    requestVersionViolations: 0,
    activeOwnerWithoutActiveUser: 0,
    activeOwnerWithoutActiveMfa: 0,
  };
}

function runtimeEvidence() {
  return {
    runtimeRole: {
      canLogin: true, inherit: false, superuser: false, bypassRls: false,
      createDb: false, createRole: false, replication: false, membershipCount: 0,
      schemaUsage: true, schemaCreate: false,
    },
    roleMemberships: [],
    runtimeFunctions: PLATFORM_OWNER_GOVERNANCE_RUNTIME_FUNCTION_ALLOWLIST
      .map((signature) => ({ signature })),
    unexpectedSecurityDefiners: [],
    relations: [{
      name: 'platform_role_change_request', canSelect: false, canInsert: false,
      canUpdate: false, canReferences: false, canDelete: false, canTruncate: false,
      canTrigger: false,
    }],
    sequences: [],
  };
}

function apiResponse() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

test('012 gobierna PLATFORM_OWNER con solicitud, doble aprobación y último owner', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS platform_role_change_request/);
  assert.match(sql, /platform_role_change_request_pending_uk[\s\S]+WHERE status = 'pending'/);
  assert.match(sql, /CREATE TRIGGER platform_owner_governance_lock[\s\S]+BEFORE INSERT OR UPDATE OR DELETE ON platform_user_role[\s\S]+FOR EACH STATEMENT/);
  assert.match(sql, /CREATE TRIGGER platform_owner_last_active_guard[\s\S]+BEFORE UPDATE OR DELETE ON platform_user_role/);
  assert.match(sql, /remaining < 1[\s\S]+PLATFORM_OWNER_LAST_ACTIVE/);
  for (const command of [
    'request_platform_owner_grant', 'request_platform_owner_revoke',
    'approve_platform_owner_change', 'reject_platform_owner_change',
  ]) assert.match(sql, new RegExp(command));
  assert.match(sql, /lower\(request_row\.requested_by_user_email\) = actor_email[\s\S]+PLATFORM_OWNER_MAKER_CHECKER_REQUIRED/);
  assert.match(sql, /requested_action = 'revoke'[\s\S]+target_email = actor_email[\s\S]+PLATFORM_OWNER_SELF_REVOKE_FORBIDDEN/);
  assert.match(sql, /tenant_identity_mfa_factor[\s\S]+PLATFORM_OWNER_TARGET_MFA_REQUIRED/);
  assert.match(sql, /owner_count <= 1[\s\S]+PLATFORM_OWNER_LAST_ACTIVE/);
  assert.match(sql, /owner_count = 2 AND target_email <> actor_email[\s\S]+PLATFORM_OWNER_TARGET_REQUEST_REQUIRED/);
  assert.match(sql, /UPDATE tenant_identity_session SET[\s\S]+source = 'platform'[\s\S]+status = 'active'/);
  assert.doesNotMatch(sql, /UPDATE tenant_identity_session SET[\s\S]{0,240}?session_version\s*=\s*session_version\s*\+\s*1/);
  assert.match(sql, /INSERT INTO tenant_iam_event[\s\S]+'platform_role_request'/);
  assert.match(sql, /VOLATILE SECURITY DEFINER SET search_path = public, pg_temp/);
  const applyDefinition = functionDefinition(
    sql,
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.apply,
  );
  const globalLockAt = applyDefinition.indexOf("'PLATFORM_OWNER:GOVERNANCE'");
  const sessionAssertionAt = applyDefinition.indexOf(
    'tenant_lifecycle_assert_platform_capability_v2',
  );
  const idempotencyLockAt = applyDefinition.indexOf(
    "actor_email || ':' || p_idempotency_key::text",
  );
  const replayLookupAt = applyDefinition.indexOf('SELECT * INTO replay FROM tenant_iam_event');
  assert.ok(globalLockAt >= 0 && globalLockAt < sessionAssertionAt);
  assert.ok(sessionAssertionAt < idempotencyLockAt && idempotencyLockAt < replayLookupAt);
  assert.match(applyDefinition, /actor_email \|\| ':' \|\| p_idempotency_key::text, 0/);
  assert.match(sql, /REVOKE ALL ON TABLE platform_role_change_request FROM municontrol_actions_runtime_app/);
  assert.match(sql, /platform_owner_acl_hardening[\s\S]+aclexplode/);
  assert.match(sql, /platform_owner_function_acl_hardening[\s\S]+pg_get_function_identity_arguments[\s\S]+REVOKE ALL PRIVILEGES ON FUNCTION/);
  assert.match(sql, /aclexplode\(attribute\.attacl\)/);
  assert.doesNotMatch(sql, /aclexplode\(COALESCE\(attribute\.attacl, '\{\}'::aclitem\[\]\)\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION platform_owner_governance_apply_v1/);
});

test('aplicador 012 fija fingerprint, preflight 011 y allowlist final exacta', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const applier = await readFile(new URL(
    '../scripts/apply-platform-owner-governance-schema.mjs', import.meta.url,
  ), 'utf8');
  assert.equal(PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION, '012-platform-owner-governance');
  assert.equal(validatePlatformOwnerGovernanceMigrationSql(sql), true);
  assert.match(platformOwnerGovernanceFingerprint(sql), /^[a-f0-9]{64}$/);
  assert.deepEqual(PLATFORM_OWNER_GOVERNANCE_RUNTIME_FUNCTION_ALLOWLIST, [
    ...VERSIONED_TIME_CATALOG_RUNTIME_FUNCTION_ALLOWLIST,
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.view,
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.apply,
  ]);
  assert.equal(PLATFORM_OWNER_GOVERNANCE_RUNTIME_FUNCTION_ALLOWLIST.includes(
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.bootstrapSecondary,
  ), false);
  assert.match(applier, /directIsolatedDatabaseUrl\(\)/);
  assert.match(applier, /aclexplode\(attribute\.attacl\)/);
  assert.doesNotMatch(applier, /aclexplode\(COALESCE\(attribute\.attacl, '\{\}'::aclitem\[\]\)\)/);
  assert.ok((applier.match(/to_json\(ARRAY\(SELECT DISTINCT COALESCE\(role_row\.rolname/g) || []).length >= 2);
  assert.match(applier, /to_json\(ARRAY\(SELECT role_row\.rolname/);
  assert.equal((sql.match(/\bEXECUTE\s+format\s*\(/gi) || []).length, 4);
  assert.match(applier, /SELECT checksum_sha256 FROM schema_migrations/);
  assert.match(applier, /if \(!existing\.rowCount\) \{[\s\S]+verifyVersionedTimeCatalogFinalAcl\(client\)/);
  assert.match(applier, /verifyPlatformOwnerGovernanceFinalAcl\(client\)[\s\S]+COMMIT/);
  assert.throws(() => validatePlatformOwnerGovernanceMigrationSql(sql.replace(
    'REVOKE ALL ON FUNCTION platform_owner_bootstrap_secondary_v1(text,text,text,text,text,uuid,text)\n      FROM municontrol_actions_runtime_app;',
    'GRANT EXECUTE ON FUNCTION platform_owner_bootstrap_secondary_v1(text,text,text,text,text,uuid,text)\n      TO municontrol_actions_runtime_app;',
  )), /break-glass al runtime/);
});

test('evidencia 012 exige maker-checker, auditoría inmutable y MFA de owners', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const evidence = governanceEvidence(sql);
  assert.equal(validatePlatformOwnerGovernanceEvidence(evidence), true);
  assert.equal(validatePlatformOwnerGovernanceRuntimeAclEvidence(runtimeEvidence()), true);

  const rowLevelGlobalLock = structuredClone(evidence);
  rowLevelGlobalLock.triggers.find((row) => (
    row.name === 'platform_owner_governance_lock'
  )).rowLevel = true;
  assert.throws(() => validatePlatformOwnerGovernanceEvidence(rowLevelGlobalLock), /trigger 012/);

  const afterLastOwnerGuard = structuredClone(evidence);
  afterLastOwnerGuard.triggers.find((row) => (
    row.name === 'platform_owner_last_active_guard'
  )).timing = 'after';
  assert.throws(() => validatePlatformOwnerGovernanceEvidence(afterLastOwnerGuard), /trigger 012/);

  const partialUpdateGuard = structuredClone(evidence);
  partialUpdateGuard.triggers.find((row) => (
    row.name === 'platform_owner_last_active_guard'
  )).allColumns = false;
  assert.throws(() => validatePlatformOwnerGovernanceEvidence(partialUpdateGuard), /trigger 012/);

  const exposedBootstrap = structuredClone(evidence);
  exposedBootstrap.functions.find((row) => (
    row.signature === PLATFORM_OWNER_GOVERNANCE_SIGNATURES.bootstrapSecondary
  )).runtimeCanExecute = true;
  assert.throws(() => validatePlatformOwnerGovernanceEvidence(exposedBootstrap), /fuera del owner/);

  const ownerWithoutMfa = structuredClone(evidence);
  ownerWithoutMfa.activeOwnerWithoutActiveMfa = 1;
  assert.throws(() => validatePlatformOwnerGovernanceEvidence(ownerWithoutMfa), /activeOwnerWithoutActiveMfa/);

  const extraRuntimeFunction = runtimeEvidence();
  extraRuntimeFunction.runtimeFunctions.push({ signature: 'public.backdoor_v1()' });
  extraRuntimeFunction.unexpectedSecurityDefiners.push({ signature: 'public.backdoor_v1()' });
  assert.throws(() => validatePlatformOwnerGovernanceRuntimeAclEvidence(extraRuntimeFunction), /SECDEF inesperadas/);

  const inheritedRelationGrant = governanceEvidence(sql);
  inheritedRelationGrant.tableAcl.find((row) => (
    row.name === 'platform_user_role'
  )).nonOwnerPrivilegeGrantees = ['legacy_identity_admin'];
  assert.throws(() => validatePlatformOwnerGovernanceEvidence(inheritedRelationGrant), /ACL relacion 012/);

  const inheritedAuditGrant = governanceEvidence(sql);
  inheritedAuditGrant.tableAcl.find((row) => (
    row.name === 'tenant_iam_event'
  )).nonOwnerPrivilegeGrantees = ['legacy_auditor'];
  assert.throws(() => validatePlatformOwnerGovernanceEvidence(inheritedAuditGrant), /ACL relacion 012/);

  const namedSequenceGrant = governanceEvidence(sql);
  namedSequenceGrant.sequenceAcl.push({
    name: 'tenant_iam_event_id_seq', ownedByCurrentUser: true,
    ownerIsRuntime: false, publicPrivilegesRevoked: true,
    runtimePrivilegesRevoked: true, nonOwnerPrivilegeGrantees: ['legacy_writer'],
  });
  assert.throws(() => validatePlatformOwnerGovernanceEvidence(namedSequenceGrant), /ACL secuencia 012/);

  const neonAdminEdge = runtimeEvidence();
  neonAdminEdge.roleMemberships.push({
    direction: 'member_of_runtime', memberIsCurrentUser: true,
    adminOption: true, inheritOption: false, setOption: false,
    memberOwnsApprovedFunctions: true,
  });
  assert.doesNotThrow(() => validatePlatformOwnerGovernanceRuntimeAclEvidence(neonAdminEdge));
});

test('bootstrap break-glass del segundo owner es único, con MFA y doble evidencia hash', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION platform_owner_bootstrap_secondary_v1');
  const end = sql.indexOf('COMMENT ON TABLE platform_role_change_request', start);
  const bootstrap = sql.slice(start, end);
  assert.match(bootstrap, /active_owner_count IS DISTINCT FROM 1/);
  assert.match(bootstrap, /existing_owner_key = target_email/);
  assert.match(bootstrap, /p_authorization_hash !~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(bootstrap, /p_operator_approval_hash !~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(bootstrap, /p_authorization_hash = p_operator_approval_hash/);
  assert.match(bootstrap, /PLATFORM_OWNER_BOOTSTRAP_EXISTING_MFA_REQUIRED/);
  assert.match(bootstrap, /tenant_identity_mfa_factor/);
  assert.match(bootstrap, /bootstrap_secondary_platform_owner/);
  assert.match(bootstrap, /INSERT INTO tenant_iam_event/);
  assert.match(bootstrap, /'PLATFORM_OWNER:GOVERNANCE'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION platform_owner_bootstrap_secondary_v1[\s\S]+FROM municontrol_actions_runtime_app/);

  const evidenceA = 'a'.repeat(64);
  const evidenceB = 'b'.repeat(64);
  const config = secondaryOwnerBootstrapConfiguration({
    PLATFORM_OWNER_EXISTING_EMAIL: 'owner-a@example.test',
    PLATFORM_OWNER_SECONDARY_EMAIL: 'owner-b@example.test',
    PLATFORM_OWNER_AUTHORIZATION_SHA256: evidenceA,
    PLATFORM_OWNER_OPERATOR_APPROVAL_SHA256: evidenceB,
    PLATFORM_OWNER_CHANGE_TICKET: 'IAM-2026-001',
    PLATFORM_OWNER_SECONDARY_CONFIRM: 'BOOTSTRAP_SECOND_PLATFORM_OWNER',
  });
  assert.equal(config.existingOwnerEmail, 'owner-a@example.test');
  assert.equal(config.targetEmail, 'owner-b@example.test');
  assert.throws(() => secondaryOwnerBootstrapConfiguration({
    PLATFORM_OWNER_EXISTING_EMAIL: 'same@example.test',
    PLATFORM_OWNER_SECONDARY_EMAIL: 'same@example.test',
    PLATFORM_OWNER_AUTHORIZATION_SHA256: evidenceA,
    PLATFORM_OWNER_OPERATOR_APPROVAL_SHA256: evidenceB,
    PLATFORM_OWNER_CHANGE_TICKET: 'IAM-1',
    PLATFORM_OWNER_SECONDARY_CONFIRM: 'BOOTSTRAP_SECOND_PLATFORM_OWNER',
  }), /invalidos o no son distintos/);
  assert.throws(() => secondaryOwnerBootstrapConfiguration({
    PLATFORM_OWNER_EXISTING_EMAIL: 'owner-a@example.test',
    PLATFORM_OWNER_SECONDARY_EMAIL: 'owner-b@example.test',
    PLATFORM_OWNER_AUTHORIZATION_SHA256: evidenceA,
    PLATFORM_OWNER_OPERATOR_APPROVAL_SHA256: evidenceB,
    PLATFORM_OWNER_CHANGE_TICKET: 'IAM-1',
    PLATFORM_OWNER_SECONDARY_CONFIRM: 'SI',
  }), /BOOTSTRAP_SECOND_PLATFORM_OWNER/);
  assert.throws(() => secondaryOwnerBootstrapConfiguration({
    PLATFORM_OWNER_EXISTING_EMAIL: 'owner-a@example.test',
    PLATFORM_OWNER_SECONDARY_EMAIL: 'owner-b@example.test',
    PLATFORM_OWNER_AUTHORIZATION_SHA256: evidenceA,
    PLATFORM_OWNER_OPERATOR_APPROVAL_SHA256: evidenceA,
    PLATFORM_OWNER_CHANGE_TICKET: 'IAM-1',
    PLATFORM_OWNER_SECONDARY_CONFIRM: 'BOOTSTRAP_SECOND_PLATFORM_OWNER',
  }), /distintos/);
});

test('bootstrap 004 ya no puede agregar silenciosamente propietarios posteriores', async () => {
  const source = await readFile(bootstrapUrl, 'utf8');
  assert.match(source, /activePlatformOwners/);
  assert.match(source, /bootstrap inicial no puede agregar otro PLATFORM_OWNER/);
  assert.match(source, /bootstrap secundario 012/);
  const globalLockAt = source.indexOf("'PLATFORM_OWNER:GOVERNANCE'");
  const ownerReadAt = source.indexOf('FROM platform_user_role');
  assert.ok(globalLockAt >= 0 && globalLockAt < ownerReadAt);
});

test('normalizador exige versión e idempotencia para gobierno global sin secretos', () => {
  const grant = normalizeInternalAdminCommand({
    command: 'request_platform_owner_grant', expectedVersion: 0,
    payload: { targetEmail: 'Owner-B@Example.test', reason: 'Ampliación de guardia' },
  }, KEY);
  assert.equal(grant.payload.targetEmail, 'owner-b@example.test');
  assert.equal(grant.expectedVersion, 0);
  assert.match(grant.commandHash, /^[a-f0-9]{64}$/);

  assert.throws(() => normalizeInternalAdminCommand({
    command: 'request_platform_owner_revoke', expectedVersion: 0,
    payload: { targetEmail: 'owner-b@example.test', reason: 'Cambio de responsabilidad' },
  }, KEY), (error) => error.code === 'INTERNAL_ADMIN_VERSION_REQUIRED');
  assert.doesNotThrow(() => normalizeInternalAdminCommand({
    command: 'approve_platform_owner_change', expectedVersion: 1,
    payload: { requestId: REQUEST_ID, reason: 'Evidencia verificada' },
  }, KEY));
  assert.throws(() => normalizeInternalAdminCommand({
    command: 'approve_platform_owner_change', expectedVersion: 1,
    payload: { requestId: REQUEST_ID, reason: 'Evidencia verificada', token: 'prohibido' },
  }, KEY), (error) => ['INTERNAL_ADMIN_FIELD_UNSUPPORTED', 'INTERNAL_ADMIN_SECRET_FORBIDDEN'].includes(error.code));
});

test('librería usa fachadas 012 ligadas a SID, versión y release', async () => {
  const calls = [];
  const sql = { async query(statement, values) {
    calls.push({ statement, values });
    return [{ result: { ok: true } }];
  } };
  const session = { id: SESSION_ID, email: 'owner-a@example.test', version: 7 };
  await getInternalAdminView(sql, session, 'platform_owners', 50, { releaseSha: RELEASE_SHA });
  const command = normalizeInternalAdminCommand({
    command: 'approve_platform_owner_change', expectedVersion: 2,
    payload: { requestId: REQUEST_ID, reason: 'Control cruzado completo' },
  }, KEY);
  await applyInternalAdminCommand(sql, session, command, { releaseSha: RELEASE_SHA });
  assert.match(calls[0].statement, /platform_owner_governance_view_v1/);
  assert.deepEqual(calls[0].values, ['owner-a@example.test', SESSION_ID, 7, RELEASE_SHA, 50]);
  assert.match(calls[1].statement, /platform_owner_governance_apply_v1/);
  assert.deepEqual(calls[1].values.slice(0, 5), [
    'owner-a@example.test', SESSION_ID, 7, RELEASE_SHA, 'approve_platform_owner_change',
  ]);
  assert.equal(calls[1].values[7], 2);
  assert.match(calls[1].values[6], /^[a-f0-9]{64}$/);
  assert.notEqual(calls[1].values[6], command.commandHash);

  await applyInternalAdminCommand(sql, { ...session, version: 8 }, command, { releaseSha: RELEASE_SHA });
  assert.notEqual(calls[1].values[6], calls[2].values[6]);
});

test('API expone vista global y procesa solicitudes sólo en contexto Plataforma', async () => {
  const calls = [];
  const handler = createInternalAdminHandler({
    env: { NODE_ENV: 'test', INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA },
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      calls.push({ kind: 'access', options });
      return {
        mode: 'managed',
        session: { id: SESSION_ID, email: 'owner-a@example.test', version: 7, mfa: true },
        principal: {
          authorized: true,
          tenant: null,
          platform: {
            roles: ['PLATFORM_OWNER'],
            capabilities: ['platform.roles.manage'],
          },
        },
      };
    },
    getInternalAdminSql: async () => ({ query: async () => [] }),
    getInternalAdminView: async (_sql, _session, resource) => {
      calls.push({ kind: 'view', resource });
      return { owners: [], allowedCommands: ['request_platform_owner_grant'] };
    },
    applyInternalAdminCommand: async (_sql, _session, command, options) => {
      calls.push({ kind: 'apply', command, options });
      return { request: { status: 'pending' }, assignmentChanged: false };
    },
  });

  const getResponse = apiResponse();
  await handler({ method: 'GET', headers: {}, query: { resource: 'platform_owners' } }, getResponse);
  assert.equal(getResponse.statusCode, 200);
  assert.deepEqual(getResponse.payload.allowedCommands, ['request_platform_owner_grant']);
  assert.equal(calls.find((call) => call.kind === 'view').resource, 'platform_owners');
  assert.ok(calls[0].options.requiredCapabilities.includes('platform.roles.manage'));

  const postResponse = apiResponse();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': KEY },
    body: {
      command: 'request_platform_owner_grant', expectedVersion: 0,
      payload: { targetEmail: 'Owner-B@Example.test', reason: 'Cobertura operativa' },
    },
  }, postResponse);
  assert.equal(postResponse.statusCode, 202);
  assert.equal(postResponse.payload.request.status, 'pending');
  const apply = calls.find((call) => call.kind === 'apply');
  assert.equal(apply.command.payload.targetEmail, 'owner-b@example.test');
  assert.equal(apply.command.expectedVersion, 0);
  assert.equal(apply.options.releaseSha, RELEASE_SHA);
});

test('UI expone propietarios, solicitudes y decisiones sin edición directa del rol', async () => {
  const html = await readFile(adminHtmlUrl, 'utf8');
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: 'administracion-plataforma.html' });
  }
  for (const contract of [
    "contextQuery('platform_owners'", 'platformOwnerCandidate', 'platformOwnerRows',
    'platformOwnerRequestRows', 'request_platform_owner_grant',
    'request_platform_owner_revoke', 'approve_platform_owner_change',
    'reject_platform_owner_change', 'makerCheckerReady', 'lastOwnerProtected',
    'No podés aprobar tu propia baja', 'Cuenta objetivo:', 'Cambio solicitado:',
    'Solicitante:', 'Motivo original:', 'Fundamento de la decisión:',
    '¿Confirmar esta decisión global auditada?',
  ]) assert.match(html, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /state\.platformGovernance\.requests\.find\(function \(item\) \{ return item\.id === requestId; \}\)/);
  assert.match(html, /if \(!window\.confirm\(confirmation\)\) return;/);
  assert.doesNotMatch(html, /command:\s*['"](?:insert|update|delete)_platform_user_role/);
  assert.match(html, /El alta o la baja de un propietario requiere una solicitud y la decisión de otra persona propietaria/);
});
