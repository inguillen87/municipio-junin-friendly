import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directIsolatedDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import {
  VERSIONED_TIME_CATALOG_MIGRATION_VERSION,
  VERSIONED_TIME_CATALOG_RUNTIME_FUNCTION_ALLOWLIST,
  verifyVersionedTimeCatalogFinalAcl,
} from './apply-versioned-time-catalog-schema.mjs';

export const PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION = '012-platform-owner-governance';
const MIGRATION_URL = new URL('./migrations/012-platform-owner-governance.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const PREREQUISITES = Object.freeze([
  ['003-action-center', new URL('./migrations/003-action-center.sql', import.meta.url)],
  ['004-tenant-iam-control-plane', new URL('./migrations/004-tenant-iam-control-plane.sql', import.meta.url)],
  ['005-tenant-identity-gateway', new URL('./migrations/005-tenant-identity-gateway.sql', import.meta.url)],
  ['006-tenant-action-authority', new URL('./migrations/006-tenant-action-authority.sql', import.meta.url)],
  ['007-action-center-read-facades', new URL('./migrations/007-action-center-read-facades.sql', import.meta.url)],
  ['008-governed-overtime-actions', new URL('./migrations/008-governed-overtime-actions.sql', import.meta.url)],
  ['009-tenant-lifecycle-hardening', new URL('./migrations/009-tenant-lifecycle-hardening.sql', import.meta.url)],
  ['010-governed-time-source-registry', new URL('./migrations/010-governed-time-source-registry.sql', import.meta.url)],
  [VERSIONED_TIME_CATALOG_MIGRATION_VERSION,
    new URL('./migrations/011-versioned-time-catalog.sql', import.meta.url)],
]);

export const PLATFORM_OWNER_GOVERNANCE_SIGNATURES = Object.freeze({
  governanceLock: 'public.platform_owner_governance_lock_v1()',
  lastOwnerGuard: 'public.platform_owner_last_active_guard_v1()',
  view: 'public.platform_owner_governance_view_v1(text,uuid,integer,text,integer)',
  apply: 'public.platform_owner_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)',
  bootstrapSecondary: 'public.platform_owner_bootstrap_secondary_v1(text,text,text,text,text,uuid,text)',
});

export const PLATFORM_OWNER_GOVERNANCE_RUNTIME_FUNCTION_ALLOWLIST = Object.freeze([
  ...VERSIONED_TIME_CATALOG_RUNTIME_FUNCTION_ALLOWLIST,
  PLATFORM_OWNER_GOVERNANCE_SIGNATURES.view,
  PLATFORM_OWNER_GOVERNANCE_SIGNATURES.apply,
]);

export const PLATFORM_ROLE_CHANGE_REQUEST_COLUMNS = Object.freeze([
  'id', 'target_user_email', 'role_key', 'requested_action', 'status',
  'expected_assignment_version', 'reason', 'requested_by_user_email', 'requested_at',
  'decided_by_user_email', 'decision_reason', 'decided_at', 'version',
]);

const SECURITY_FUNCTIONS = Object.freeze(Object.values(PLATFORM_OWNER_GOVERNANCE_SIGNATURES));
const REQUEST_CONSTRAINTS = Object.freeze([
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
]);
const OWNER_CONSTRAINTS = Object.freeze({
  platform_user_role_version_ck: true,
  platform_user_role_revocation_actor_ck: false,
});
const EXPECTED_INDEXES = Object.freeze({
  platform_role_change_request_pending_uk: {
    tableName: 'platform_role_change_request', unique: true, predicateTokens: ['status', 'pending'],
  },
  platform_role_change_request_recent_idx: {
    tableName: 'platform_role_change_request', unique: false, predicateTokens: null,
  },
  platform_user_role_active_owner_idx: {
    tableName: 'platform_user_role', unique: false, predicateTokens: ['active', 'true'],
  },
});
const EXPECTED_TRIGGERS = Object.freeze({
  platform_owner_governance_lock: {
    tableName: 'platform_user_role', functionName: 'platform_owner_governance_lock_v1',
    rowLevel: false, timing: 'before', events: ['insert', 'delete', 'update'],
  },
  platform_owner_last_active_guard: {
    tableName: 'platform_user_role', functionName: 'platform_owner_last_active_guard_v1',
    rowLevel: true, timing: 'before', events: ['delete', 'update'],
  },
  tenant_iam_event_append_only: {
    tableName: 'tenant_iam_event', functionName: 'tenant_iam_reject_change',
    rowLevel: true, timing: 'before', events: ['delete', 'update'],
  },
});

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function exactSet(actual, expected, label) {
  const shapedActual = [...new Set(actual)].sort();
  const shapedExpected = [...new Set(expected)].sort();
  if (JSON.stringify(shapedActual) !== JSON.stringify(shapedExpected)) {
    throw new Error(`${label} fuera de contrato: actual=${shapedActual.join(',')} esperado=${shapedExpected.join(',')}`);
  }
}

function requireTokens(label, definition, tokens) {
  const body = normalized(definition);
  for (const token of tokens) {
    if (!body.includes(normalized(token))) throw new Error(`${label} no contiene ${token}`);
  }
}

export function platformOwnerGovernanceFingerprint(sql) {
  return createHash('sha256').update(String(sql)).digest('hex');
}

export function validatePlatformOwnerGovernanceMigrationSql(sql) {
  const body = normalized(sql);
  requireTokens('migracion 012', body, [
    'add column if not exists version integer not null default 1',
    'add column if not exists revoked_by_user_email text',
    'create table if not exists platform_role_change_request',
    'platform_role_change_request_pending_uk', "where status = 'pending'",
    'platform_owner_governance_lock_v1',
    'before insert or update or delete on platform_user_role',
    'platform_owner_last_active_guard_v1', 'before update or delete on platform_user_role',
    'platform_owner_governance_view_v1', 'platform_owner_governance_apply_v1',
    'platform_owner_bootstrap_secondary_v1',
    'platform_owner_function_acl_hardening',
    'pg_get_function_identity_arguments',
    'revoke all privileges on function',
    'tenant_lifecycle_assert_platform_capability_v2', "'platform.roles.manage'",
    'platform_owner_last_active', 'platform_owner_maker_checker_required',
    'platform_owner_self_revoke_forbidden', 'platform_owner_target_request_required',
    'platform_owner_version_conflict', 'platform_owner_target_mfa_required',
    'platform_owner_bootstrap_existing_mfa_required',
    'p_authorization_hash = p_operator_approval_hash',
    'actor_user.email', 'existing_owner_user.email',
    "source = 'platform'", "status = 'active'",
    'insert into tenant_iam_event', "'platform_role_request'",
    "'releasesha', p_release_sha", "'actorsessionversion', p_actor_session_version",
    'revoke all on table platform_role_change_request, platform_user_role, tenant_iam_event from public',
    'revoke all on table platform_role_change_request from municontrol_actions_runtime_app',
    'platform_owner_acl_hardening', 'aclexplode',
  ]);
  for (const command of [
    'request_platform_owner_grant', 'request_platform_owner_revoke',
    'approve_platform_owner_change', 'reject_platform_owner_change',
  ]) {
    if (!body.includes(`'${command}'`)) throw new Error(`falta comando ${command}`);
  }
  if (/grant\s+execute\s+on\s+function\s+platform_owner_bootstrap_secondary_v1[\s\S]+?to\s+municontrol_actions_runtime_app/i.test(sql)) {
    throw new Error('012 concede break-glass al runtime');
  }
  if (/\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:public\.)?(?:grh_[a-z0-9_]*|payroll_[a-z0-9_]*|action_case(?:_event|_context)?|employment_contract|source_import_batch|time_source_contract|time_catalog_[a-z0-9_]*)\b/i.test(sql)) {
    throw new Error('012 intenta DML fuera del control plane de identidad');
  }
  if (/\b(?:create|alter|drop)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?(?:public\.)?(?:grh_|payroll_|action_case|employment_contract|source_import_batch|time_source_contract|time_catalog_)/i.test(sql)
      || /\balter\s+role\b/i.test(sql)
      || (sql.match(/\bexecute\s+format\s*\(/gi) || []).length !== 4
      || /\binsert\s+into\s+(?:iam_capability|iam_role|iam_role_capability)\b/i.test(sql)) {
    throw new Error('012 contiene expansion de alcance o SQL dinamico prohibido');
  }
  return true;
}

function validateFunctions(functionRows) {
  const functions = new Map((functionRows || []).map((row) => [row.signature, row]));
  exactSet(functions.keys(), SECURITY_FUNCTIONS, 'funciones seguridad 012');
  for (const signature of SECURITY_FUNCTIONS) {
    const fn = functions.get(signature);
    if (!fn || fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
        || fn.ownerIsRuntime === true || fn.publicExecuteRevoked !== true
        || !Array.isArray(fn.config)
        || !fn.config.map(normalized).includes('search_path=public, pg_temp')) {
      throw new Error(`funcion insegura ${signature}`);
    }
  }
  for (const signature of [
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.governanceLock,
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.lastOwnerGuard,
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.bootstrapSecondary,
  ]) {
    const fn = functions.get(signature);
    if (fn.runtimeCanExecute !== false || (fn.nonOwnerExecuteGrantees || []).length) {
      throw new Error(`funcion interna 012 ejecutable fuera del owner ${signature}`);
    }
  }
  for (const signature of [
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.view,
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.apply,
  ]) {
    const fn = functions.get(signature);
    if (fn.runtimeCanExecute !== true
        || JSON.stringify(fn.nonOwnerExecuteGrantees || []) !== JSON.stringify([RUNTIME_ROLE])) {
      throw new Error(`fachada 012 sin ACL exacta ${signature}`);
    }
  }
  requireTokens('lock global owner 012', functions.get(
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.governanceLock,
  )?.definition, ["'platform_owner:governance'", 'pg_advisory_xact_lock']);
  requireTokens('guard ultimo owner 012', functions.get(
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.lastOwnerGuard,
  )?.definition, ['platform_owner_last_active', 'remaining < 1', "tg_op = 'delete'"]);
  requireTokens('view 012', functions.get(PLATFORM_OWNER_GOVERNANCE_SIGNATURES.view)?.definition, [
    'tenant_lifecycle_assert_platform_capability_v2', "'platform.roles.manage'",
    "'makercheckerready', owner_count >= 2", "'lastownerprotected', true",
  ]);
  requireTokens('apply 012', functions.get(PLATFORM_OWNER_GOVERNANCE_SIGNATURES.apply)?.definition, [
    'tenant_lifecycle_assert_platform_capability_v2', 'p_expected_version',
    "'platform_owner:governance'", "actor_email || ':' || p_idempotency_key::text, 0",
    'tenant_iam_idempotency_key_reused', 'platform_owner_maker_checker_required',
    'platform_owner_self_revoke_forbidden', 'platform_owner_last_active',
    "source = 'platform'", 'insert into tenant_iam_event', 'actor_user.email',
  ]);
  requireTokens('break-glass 012', functions.get(
    PLATFORM_OWNER_GOVERNANCE_SIGNATURES.bootstrapSecondary,
  )?.definition, [
    'active_owner_count is distinct from 1', 'platform_owner_bootstrap_closed',
    "'platform_owner:governance'",
    'platform_owner_bootstrap_existing_mfa_required',
    'p_authorization_hash = p_operator_approval_hash',
    'bootstrap_secondary_platform_owner', 'insert into tenant_iam_event',
  ]);
}

export function validatePlatformOwnerGovernanceEvidence(evidence) {
  exactSet((evidence?.requestColumns || []).map((row) => row.name),
    PLATFORM_ROLE_CHANGE_REQUEST_COLUMNS, 'columnas solicitud 012');
  const orderedColumns = (evidence?.requestColumns || []).map((row) => row.name);
  if (JSON.stringify(orderedColumns) !== JSON.stringify(PLATFORM_ROLE_CHANGE_REQUEST_COLUMNS)) {
    throw new Error('orden/forma de columnas solicitud 012 con drift');
  }
  exactSet((evidence?.ownerColumns || []).map((row) => row.name),
    ['version', 'revoked_by_user_email'], 'columnas owner 012');

  const requestConstraints = (evidence?.constraints || [])
    .filter((row) => row.tableName === 'platform_role_change_request');
  exactSet(requestConstraints.map((row) => row.name), REQUEST_CONSTRAINTS,
    'constraints solicitud 012');
  if (requestConstraints.some((row) => row.validated !== true)) {
    throw new Error('constraint solicitud 012 no validada');
  }
  const ownerConstraints = (evidence?.constraints || [])
    .filter((row) => row.tableName === 'platform_user_role');
  exactSet(ownerConstraints.map((row) => row.name), Object.keys(OWNER_CONSTRAINTS),
    'constraints owner 012');
  for (const constraint of ownerConstraints) {
    if (constraint.validated !== OWNER_CONSTRAINTS[constraint.name]) {
      throw new Error(`estado constraint owner 012 invalido ${constraint.name}`);
    }
  }

  exactSet((evidence?.indexes || []).map((row) => row.name), Object.keys(EXPECTED_INDEXES),
    'indices 012');
  for (const index of evidence?.indexes || []) {
    const expected = EXPECTED_INDEXES[index.name];
    if (!expected || index.tableName !== expected.tableName || index.unique !== expected.unique
        || index.valid !== true || index.ready !== true
        || (expected.predicateTokens == null && index.predicate != null)
        || (expected.predicateTokens != null
          && (index.predicate == null || expected.predicateTokens.some(
            (token) => !normalized(index.predicate).includes(token),
          )))) {
      throw new Error(`indice 012 invalido ${index.name}`);
    }
  }

  exactSet((evidence?.triggers || []).map((row) => row.name), Object.keys(EXPECTED_TRIGGERS),
    'triggers 012/auditoria');
  for (const trigger of evidence?.triggers || []) {
    const expected = EXPECTED_TRIGGERS[trigger.name];
    if (!expected || trigger.tableName !== expected.tableName
        || trigger.functionName !== expected.functionName
        || trigger.functionSchema !== 'public' || trigger.enabled !== 'O'
        || trigger.noArguments !== true || trigger.notConstraint !== true
        || trigger.allColumns !== true
        || trigger.rowLevel !== expected.rowLevel || trigger.timing !== expected.timing) {
      throw new Error(`trigger 012 invalido ${trigger.name}`);
    }
    exactSet(trigger.events || [], expected.events, `eventos trigger 012 ${trigger.name}`);
    if (!normalized(trigger.definition).includes(`create trigger ${trigger.name}`)
        || normalized(trigger.definition).includes(' when ')) {
      throw new Error(`definicion trigger 012 invalida ${trigger.name}`);
    }
  }
  validateFunctions(evidence?.functions);

  if (!Array.isArray(evidence?.tableAcl) || !Array.isArray(evidence?.sequenceAcl)) {
    throw new Error('inventario ACL datos 012 incompleto');
  }
  exactSet(evidence.tableAcl.map((row) => row.name), [
    'platform_role_change_request', 'platform_user_role', 'tenant_iam_event',
  ], 'ACL relaciones 012');
  for (const relation of evidence.tableAcl) {
    if (relation.ownerIsRuntime === true || relation.publicPrivilegesRevoked !== true
        || relation.runtimePrivilegesRevoked !== true || relation.ownedByCurrentUser !== true
        || !Array.isArray(relation.nonOwnerPrivilegeGrantees)
        || relation.nonOwnerPrivilegeGrantees.length !== 0) {
      throw new Error(`ACL relacion 012 insegura ${relation.name}`);
    }
  }
  for (const sequence of evidence.sequenceAcl) {
    if (sequence.ownerIsRuntime === true || sequence.publicPrivilegesRevoked !== true
        || sequence.runtimePrivilegesRevoked !== true || sequence.ownedByCurrentUser !== true
        || !Array.isArray(sequence.nonOwnerPrivilegeGrantees)
        || sequence.nonOwnerPrivilegeGrantees.length !== 0) {
      throw new Error(`ACL secuencia 012 insegura ${sequence.name}`);
    }
  }
  for (const key of [
    'pendingDuplicateGroups', 'requestStateViolations', 'requestVersionViolations',
    'activeOwnerWithoutActiveUser', 'activeOwnerWithoutActiveMfa',
  ]) {
    if (evidence?.[key] !== 0) throw new Error(`invariante 012 violada ${key}`);
  }
  if (!Number.isInteger(evidence?.activeOwnerCount) || evidence.activeOwnerCount < 1) {
    throw new Error('012 requiere al menos un PLATFORM_OWNER utilizable');
  }
  return true;
}

export function validatePlatformOwnerGovernanceRuntimeAclEvidence(evidence) {
  const role = evidence?.runtimeRole;
  if (!role || role.canLogin !== true || role.inherit !== false || role.superuser !== false
      || role.bypassRls !== false || role.createDb !== false || role.createRole !== false
      || role.replication !== false || role.membershipCount !== 0
      || role.schemaUsage !== true || role.schemaCreate !== false) {
    throw new Error('runtime 012 debe conservar LOGIN NOINHERIT sin atributos elevados');
  }
  if (!Array.isArray(evidence?.unexpectedSecurityDefiners)
      || !Array.isArray(evidence?.relations) || !Array.isArray(evidence?.sequences)
      || !Array.isArray(evidence?.runtimeFunctions) || !Array.isArray(evidence?.roleMemberships)) {
    throw new Error('inventario ACL runtime 012 incompleto');
  }
  const incoming = evidence.roleMemberships.filter((row) => row.direction === 'member_of_runtime');
  const outgoing = evidence.roleMemberships.filter((row) => row.direction === 'granted_to_runtime');
  if (outgoing.length || incoming.length > 1 || incoming.some((row) => (
    row.memberIsCurrentUser !== true || row.adminOption !== true
      || row.inheritOption !== false || row.setOption !== false
      || row.memberOwnsApprovedFunctions !== true
  ))) {
    throw new Error('membresias runtime 012 permiten escalamiento fuera de la arista Neon');
  }
  if (evidence.unexpectedSecurityDefiners.length) {
    throw new Error('runtime 012 conserva SECDEF inesperadas');
  }
  exactSet(evidence.runtimeFunctions.map((row) => row.signature),
    PLATFORM_OWNER_GOVERNANCE_RUNTIME_FUNCTION_ALLOWLIST, 'EXECUTE runtime 012');
  for (const relation of evidence.relations) {
    if (relation.canSelect || relation.canInsert || relation.canUpdate || relation.canReferences
        || relation.canDelete || relation.canTruncate || relation.canTrigger) {
      throw new Error(`runtime conserva privilegio directo en ${relation.name}`);
    }
  }
  for (const sequence of evidence.sequences) {
    if (sequence.canUsage || sequence.canSelect || sequence.canUpdate) {
      throw new Error(`runtime conserva privilegio de secuencia en ${sequence.name}`);
    }
  }
  return true;
}

async function expectedPrerequisiteChecksums() {
  return new Map(await Promise.all(PREREQUISITES.map(async ([version, url]) => [
    version, platformOwnerGovernanceFingerprint(await readFile(url, 'utf8')),
  ])));
}

async function verifyPrerequisites(client) {
  const expected = await expectedPrerequisiteChecksums();
  const installedResult = await client.query(
    'SELECT version, checksum_sha256 FROM schema_migrations WHERE version = ANY($1::text[])',
    [[...expected.keys()]],
  );
  const installed = new Map(rows(installedResult).map((row) => [
    row.version, String(row.checksum_sha256 || '').trim(),
  ]));
  for (const [version, checksum] of expected) {
    if (installed.get(version) !== checksum) {
      throw new Error(`prerequisito ausente o con drift ${version}`);
    }
  }
}

async function collectEvidence(client) {
  const functions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      function_row.proowner = runtime_role.oid AS "ownerIsRuntime",
      function_row.proconfig AS config,
      NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(
        function_row.proacl, acldefault('f', function_row.proowner)
      )) acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS "publicExecuteRevoked",
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS "runtimeCanExecute",
      to_json(ARRAY(SELECT role_row.rolname
        FROM aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) acl
        JOIN pg_roles role_row ON role_row.oid = acl.grantee
        WHERE acl.privilege_type = 'EXECUTE' AND acl.grantee <> function_row.proowner
        ORDER BY role_row.rolname)) AS "nonOwnerExecuteGrantees",
      pg_get_functiondef(function_row.oid) AS definition
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE namespace.nspname = 'public'
      AND format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[])
  `, [RUNTIME_ROLE, SECURITY_FUNCTIONS]);
  const requestColumns = await client.query(`
    SELECT attribute.attname AS name, format_type(attribute.atttypid, attribute.atttypmod) AS type,
      attribute.attnotnull AS "notNull"
    FROM pg_attribute attribute
    WHERE attribute.attrelid = 'public.platform_role_change_request'::regclass
      AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE
    ORDER BY attribute.attnum
  `);
  const ownerColumns = await client.query(`
    SELECT attribute.attname AS name, format_type(attribute.atttypid, attribute.atttypmod) AS type,
      attribute.attnotnull AS "notNull"
    FROM pg_attribute attribute
    WHERE attribute.attrelid = 'public.platform_user_role'::regclass
      AND attribute.attname = ANY($1::text[])
    ORDER BY attribute.attname
  `, [['revoked_by_user_email', 'version']]);
  const constraints = await client.query(`
    SELECT constraint_row.conname AS name, constraint_row.convalidated AS validated,
      relation.relname AS "tableName", constraint_row.contype AS type,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND (
      relation.relname = 'platform_role_change_request'
      OR (relation.relname = 'platform_user_role'
        AND constraint_row.conname = ANY($1::text[]))
    ) ORDER BY relation.relname, constraint_row.conname
  `, [Object.keys(OWNER_CONSTRAINTS)]);
  const indexes = await client.query(`
    SELECT index_relation.relname AS name, table_relation.relname AS "tableName",
      index_meta.indisunique AS unique, index_meta.indisvalid AS valid,
      index_meta.indisready AS ready,
      pg_get_expr(index_meta.indpred, index_meta.indrelid, true) AS predicate,
      pg_get_indexdef(index_meta.indexrelid) AS definition
    FROM pg_index index_meta
    JOIN pg_class index_relation ON index_relation.oid = index_meta.indexrelid
    JOIN pg_class table_relation ON table_relation.oid = index_meta.indrelid
    JOIN pg_namespace namespace ON namespace.oid = index_relation.relnamespace
    WHERE namespace.nspname = 'public' AND index_relation.relname = ANY($1::text[])
  `, [Object.keys(EXPECTED_INDEXES)]);
  const triggers = await client.query(`
    SELECT trigger_row.tgname AS name, trigger_row.tgenabled AS enabled,
      relation.relname AS "tableName", function_namespace.nspname AS "functionSchema",
      function_row.proname AS "functionName", trigger_row.tgnargs = 0 AS "noArguments",
      trigger_row.tgconstraint = 0 AS "notConstraint",
      trigger_row.tgattr::text = '' AS "allColumns",
      (trigger_row.tgtype::integer & 1) <> 0 AS "rowLevel",
      CASE WHEN (trigger_row.tgtype::integer & 64) <> 0 THEN 'instead'
        WHEN (trigger_row.tgtype::integer & 2) <> 0 THEN 'before' ELSE 'after' END AS timing,
      to_jsonb(array_remove(ARRAY[
        CASE WHEN (trigger_row.tgtype::integer & 4) <> 0 THEN 'insert' END,
        CASE WHEN (trigger_row.tgtype::integer & 8) <> 0 THEN 'delete' END,
        CASE WHEN (trigger_row.tgtype::integer & 16) <> 0 THEN 'update' END,
        CASE WHEN (trigger_row.tgtype::integer & 32) <> 0 THEN 'truncate' END
      ], NULL)) AS events,
      pg_get_triggerdef(trigger_row.oid, true) AS definition
    FROM pg_trigger trigger_row
    JOIN pg_class relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace function_namespace ON function_namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND trigger_row.tgisinternal IS FALSE
      AND trigger_row.tgname = ANY($1::text[])
  `, [Object.keys(EXPECTED_TRIGGERS)]);
  const tableAcl = await client.query(`
    SELECT relation.relname AS name,
      relation.relowner = current_user::regrole::oid AS "ownedByCurrentUser",
      relation.relowner = runtime_role.oid AS "ownerIsRuntime",
      NOT EXISTS (SELECT 1 FROM (
        SELECT acl.grantee
        FROM aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) acl
        UNION ALL
        SELECT acl.grantee FROM pg_attribute attribute
        CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
        WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0
          AND attribute.attisdropped IS FALSE
      ) grants WHERE grants.grantee = 0) AS "publicPrivilegesRevoked",
      NOT (has_any_column_privilege($1, relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
        OR has_table_privilege($1, relation.oid, 'DELETE,TRUNCATE,TRIGGER'))
        AS "runtimePrivilegesRevoked",
      to_json(ARRAY(SELECT DISTINCT COALESCE(role_row.rolname, 'PUBLIC')
        FROM (
          SELECT acl.grantee
          FROM aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) acl
          UNION ALL
          SELECT acl.grantee FROM pg_attribute attribute
          CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
          WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0
            AND attribute.attisdropped IS FALSE
        ) grants
        LEFT JOIN pg_roles role_row ON role_row.oid = grants.grantee
        WHERE grants.grantee <> relation.relowner
        ORDER BY COALESCE(role_row.rolname, 'PUBLIC')))
        AS "nonOwnerPrivilegeGrantees"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($2::text[])
  `, [RUNTIME_ROLE, ['platform_role_change_request', 'platform_user_role', 'tenant_iam_event']]);
  const sequenceAcl = await client.query(`
    WITH sensitive_relations AS (
      SELECT relation.oid FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = ANY($2::text[])
    ), sensitive_sequences AS (
      SELECT DISTINCT sequence_row.oid, sequence_row.relname, sequence_row.relowner,
        sequence_row.relacl
      FROM pg_class sequence_row
      JOIN pg_namespace namespace ON namespace.oid = sequence_row.relnamespace
      JOIN pg_depend dependency
        ON dependency.classid = 'pg_class'::regclass
       AND dependency.objid = sequence_row.oid
       AND dependency.refclassid = 'pg_class'::regclass
       AND dependency.deptype IN ('a','i')
      JOIN sensitive_relations relation ON relation.oid = dependency.refobjid
      WHERE namespace.nspname = 'public' AND sequence_row.relkind = 'S'
    )
    SELECT sequence_row.relname AS name,
      sequence_row.relowner = current_user::regrole::oid AS "ownedByCurrentUser",
      sequence_row.relowner = runtime_role.oid AS "ownerIsRuntime",
      NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(
        sequence_row.relacl, acldefault('S', sequence_row.relowner)
      )) acl WHERE acl.grantee = 0) AS "publicPrivilegesRevoked",
      NOT (has_sequence_privilege($1, sequence_row.oid, 'USAGE')
        OR has_sequence_privilege($1, sequence_row.oid, 'SELECT')
        OR has_sequence_privilege($1, sequence_row.oid, 'UPDATE'))
        AS "runtimePrivilegesRevoked",
      to_json(ARRAY(SELECT DISTINCT COALESCE(role_row.rolname, 'PUBLIC')
        FROM aclexplode(COALESCE(
          sequence_row.relacl, acldefault('S', sequence_row.relowner)
        )) acl
        LEFT JOIN pg_roles role_row ON role_row.oid = acl.grantee
        WHERE acl.grantee <> sequence_row.relowner
        ORDER BY COALESCE(role_row.rolname, 'PUBLIC')))
        AS "nonOwnerPrivilegeGrantees"
    FROM sensitive_sequences sequence_row
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    ORDER BY sequence_row.relname
  `, [RUNTIME_ROLE, ['platform_role_change_request', 'platform_user_role', 'tenant_iam_event']]);
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::integer FROM platform_user_role assignment
       WHERE assignment.role_key = 'PLATFORM_OWNER' AND assignment.active IS TRUE)
        AS "activeOwnerCount",
      (SELECT count(*)::integer FROM (
        SELECT lower(request.target_user_email), request.role_key
        FROM platform_role_change_request request WHERE request.status = 'pending'
        GROUP BY lower(request.target_user_email), request.role_key HAVING count(*) > 1
      ) duplicate) AS "pendingDuplicateGroups",
      (SELECT count(*)::integer FROM platform_role_change_request request WHERE NOT (
        (request.status = 'pending' AND request.decided_by_user_email IS NULL
          AND request.decision_reason IS NULL AND request.decided_at IS NULL)
        OR (request.status IN ('approved','rejected')
          AND request.decided_by_user_email IS NOT NULL
          AND request.decision_reason IS NOT NULL AND request.decided_at IS NOT NULL)
      )) AS "requestStateViolations",
      (SELECT count(*)::integer FROM platform_role_change_request request
       WHERE request.version < 1 OR request.expected_assignment_version < 0)
        AS "requestVersionViolations",
      (SELECT count(*)::integer FROM platform_user_role assignment
       LEFT JOIN internal_users users ON lower(users.email) = lower(assignment.user_email)
        AND users.active IS TRUE
       WHERE assignment.role_key = 'PLATFORM_OWNER' AND assignment.active IS TRUE
         AND users.email IS NULL) AS "activeOwnerWithoutActiveUser",
      (SELECT count(*)::integer FROM platform_user_role assignment
       WHERE assignment.role_key = 'PLATFORM_OWNER' AND assignment.active IS TRUE
         AND NOT EXISTS (SELECT 1 FROM tenant_identity_mfa_factor factor
           WHERE lower(factor.user_email) = lower(assignment.user_email)
             AND factor.status = 'active')) AS "activeOwnerWithoutActiveMfa"
  `);
  return {
    functions: rows(functions), requestColumns: rows(requestColumns),
    ownerColumns: rows(ownerColumns), constraints: rows(constraints), indexes: rows(indexes),
    triggers: rows(triggers), tableAcl: rows(tableAcl), sequenceAcl: rows(sequenceAcl),
    ...(rows(counts)[0] || {}),
  };
}

async function collectRuntimeAclEvidence(client) {
  const runtimeRole = await client.query(`
    SELECT role_row.rolcanlogin AS "canLogin", role_row.rolinherit AS inherit,
      role_row.rolsuper AS superuser, role_row.rolbypassrls AS "bypassRls",
      role_row.rolcreatedb AS "createDb", role_row.rolcreaterole AS "createRole",
      role_row.rolreplication AS replication,
      (SELECT count(*)::integer FROM pg_auth_members membership
        WHERE membership.member = role_row.oid) AS "membershipCount",
      has_schema_privilege(role_row.oid, 'public', 'USAGE') AS "schemaUsage",
      has_schema_privilege(role_row.oid, 'public', 'CREATE') AS "schemaCreate"
    FROM pg_roles role_row WHERE role_row.rolname = $1
  `, [RUNTIME_ROLE]);
  const roleMemberships = await client.query(`
    SELECT CASE WHEN membership.member = runtime_role.oid THEN 'granted_to_runtime'
        ELSE 'member_of_runtime' END AS direction,
      membership.admin_option AS "adminOption", membership.inherit_option AS "inheritOption",
      membership.set_option AS "setOption",
      membership.member = current_user::regrole::oid AS "memberIsCurrentUser",
      (SELECT count(*)::integer = cardinality($2::text[])
          AND COALESCE(bool_and(function_row.proowner = membership.member), false)
       FROM pg_proc function_row
       JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
       WHERE format('%s.%s(%s)', namespace.nspname, function_row.proname,
         replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[])
      ) AS "memberOwnsApprovedFunctions"
    FROM pg_auth_members membership
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE membership.member = runtime_role.oid OR membership.roleid = runtime_role.oid
  `, [RUNTIME_ROLE, SECURITY_FUNCTIONS]);
  const runtimeFunctions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature
    FROM pg_proc function_row JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND function_row.prosecdef IS TRUE
      AND has_function_privilege($1, function_row.oid, 'EXECUTE')
  `, [RUNTIME_ROLE]);
  const unexpectedSecurityDefiners = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature
    FROM pg_proc function_row JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND function_row.prosecdef IS TRUE
      AND has_function_privilege($1, function_row.oid, 'EXECUTE')
      AND NOT (format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[]))
  `, [RUNTIME_ROLE, PLATFORM_OWNER_GOVERNANCE_RUNTIME_FUNCTION_ALLOWLIST]);
  const relations = await client.query(`
    SELECT relation.relname AS name,
      has_any_column_privilege($1, relation.oid, 'SELECT') AS "canSelect",
      has_any_column_privilege($1, relation.oid, 'INSERT') AS "canInsert",
      has_any_column_privilege($1, relation.oid, 'UPDATE') AS "canUpdate",
      has_any_column_privilege($1, relation.oid, 'REFERENCES') AS "canReferences",
      has_table_privilege($1, relation.oid, 'DELETE') AS "canDelete",
      has_table_privilege($1, relation.oid, 'TRUNCATE') AS "canTruncate",
      has_table_privilege($1, relation.oid, 'TRIGGER') AS "canTrigger"
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r','p','v','m','f')
  `, [RUNTIME_ROLE]);
  const sequences = await client.query(`
    SELECT relation.relname AS name,
      has_sequence_privilege($1, relation.oid, 'USAGE') AS "canUsage",
      has_sequence_privilege($1, relation.oid, 'SELECT') AS "canSelect",
      has_sequence_privilege($1, relation.oid, 'UPDATE') AS "canUpdate"
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'S'
  `, [RUNTIME_ROLE]);
  return {
    runtimeRole: rows(runtimeRole)[0], roleMemberships: rows(roleMemberships),
    runtimeFunctions: rows(runtimeFunctions), unexpectedSecurityDefiners: rows(unexpectedSecurityDefiners),
    relations: rows(relations), sequences: rows(sequences),
  };
}

export async function verifyPlatformOwnerGovernanceFinalAcl(client) {
  validatePlatformOwnerGovernanceEvidence(await collectEvidence(client));
  validatePlatformOwnerGovernanceRuntimeAclEvidence(await collectRuntimeAclEvidence(client));
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validatePlatformOwnerGovernanceMigrationSql(migration);
  const fingerprint = platformOwnerGovernanceFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directIsolatedDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:platform-owner-012'))");
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION],
    );
    if (existing.rowCount && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      // 011 conserva su allowlist exacta. Se verifica antes de que 012 agregue sus dos fachadas.
      await verifyVersionedTimeCatalogFinalAcl(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION} sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION, fingerprint],
      );
    }
    // En reapply no se ejecuta el verificador final 011: rechazaria correctamente las dos fachadas 012.
    // Este verificador exige exactamente allowlist 011 + view/apply 012 y excluye el break-glass.
    await verifyPlatformOwnerGovernanceFinalAcl(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION}: reapply verificado (fingerprint SHA-256 ${fingerprint})`
      : `${PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION}: fresh apply (${statements.length} sentencias, fingerprint SHA-256 ${fingerprint})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
