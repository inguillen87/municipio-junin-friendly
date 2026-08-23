import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directIsolatedDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import {
  PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION,
  PLATFORM_OWNER_GOVERNANCE_RUNTIME_FUNCTION_ALLOWLIST,
  verifyPlatformOwnerGovernanceFinalAcl,
} from './apply-platform-owner-governance-schema.mjs';

export const EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION =
  '013-existing-identity-membership-governance';
const MIGRATION_URL = new URL(
  './migrations/013-existing-identity-membership-governance.sql', import.meta.url,
);
const PREREQUISITE_URL = new URL(
  './migrations/012-platform-owner-governance.sql', import.meta.url,
);
const CORE_SOURCE_URL = new URL(
  './migrations/009-tenant-lifecycle-hardening.sql', import.meta.url,
);
const IAM_BASE_SOURCE_URL = new URL(
  './migrations/004-tenant-iam-control-plane.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

export const EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES = Object.freeze({
  actionBindingGuard: 'public.tenant_action_validate_binding()',
  appendOnlyGuard: 'public.tenant_iam_reject_change()',
  employmentHistoryGuard: 'public.tenant_lifecycle_guard_employment_history_v1()',
  requestGuard: 'public.tenant_membership_change_request_guard_v1()',
  adminView: 'public.tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)',
  adminViewCore: 'public.tenant_iam_admin_view_core_013(text,uuid,integer,text,text,uuid,integer)',
  apply: 'public.tenant_membership_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)',
});

export const EXISTING_IDENTITY_MEMBERSHIP_RUNTIME_FUNCTION_ALLOWLIST = Object.freeze([
  ...new Set([
    ...PLATFORM_OWNER_GOVERNANCE_RUNTIME_FUNCTION_ALLOWLIST,
    EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.apply,
  ]),
]);

export const TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES = Object.freeze([
  'workforce.summary.read', 'workforce.structure.read', 'workforce.employee.read',
  'absence.analytics.read', 'absence.nominal.read', 'leave.policy.read',
  'leave.preview.read', 'management.analytics.read', 'quality.read', 'lineage.read',
  'assistant.use', 'actions.read', 'employee.record.propose', 'absence.enter',
  'leave.enter', 'leave.request.aggregate.read', 'leave.request.all.read',
  'leave.request.area.create', 'leave.request.area.read', 'leave.request.area.update',
  'leave.request.area.submit', 'leave.request.area.cancel_pending',
  'leave.request.audit.read', 'time.overtime.read', 'time.source.read',
  'time.source.propose', 'time.catalog.read', 'time.catalog.propose',
]);

export const TENANT_MEMBERSHIP_CHANGE_REQUEST_COLUMNS = Object.freeze([
  'id', 'requested_action', 'tenant_id', 'target_user_email', 'membership_id',
  'role_key', 'expected_membership_version', 'status', 'reason',
  'requested_by_user_email', 'requested_at', 'expires_at', 'decided_by_user_email',
  'decision_reason', 'decided_at', 'version',
]);

export const TENANT_MEMBERSHIP_GOVERNANCE_CONTEXT_COLUMNS = Object.freeze([
  'event_id', 'request_id', 'actor_session_id', 'actor_session_version',
  'release_sha', 'expected_version', 'reason_hash', 'created_at',
]);

export const TENANT_MEMBERSHIP_CHANGE_REQUEST_COLUMN_SHAPES = Object.freeze({
  id: Object.freeze({ udtName: 'uuid', nullable: false }),
  requested_action: Object.freeze({ udtName: 'varchar', nullable: false }),
  tenant_id: Object.freeze({ udtName: 'uuid', nullable: false }),
  target_user_email: Object.freeze({ udtName: 'text', nullable: false }),
  membership_id: Object.freeze({ udtName: 'uuid', nullable: true }),
  role_key: Object.freeze({ udtName: 'varchar', nullable: false }),
  expected_membership_version: Object.freeze({ udtName: 'int4', nullable: false }),
  status: Object.freeze({ udtName: 'varchar', nullable: false }),
  reason: Object.freeze({ udtName: 'text', nullable: false }),
  requested_by_user_email: Object.freeze({ udtName: 'text', nullable: false }),
  requested_at: Object.freeze({ udtName: 'timestamptz', nullable: false }),
  expires_at: Object.freeze({ udtName: 'timestamptz', nullable: false }),
  decided_by_user_email: Object.freeze({ udtName: 'text', nullable: true }),
  decision_reason: Object.freeze({ udtName: 'text', nullable: true }),
  decided_at: Object.freeze({ udtName: 'timestamptz', nullable: true }),
  version: Object.freeze({ udtName: 'int4', nullable: false }),
});

export const TENANT_MEMBERSHIP_GOVERNANCE_CONTEXT_COLUMN_SHAPES = Object.freeze({
  event_id: Object.freeze({ udtName: 'int8', nullable: false }),
  request_id: Object.freeze({ udtName: 'uuid', nullable: false }),
  actor_session_id: Object.freeze({ udtName: 'uuid', nullable: false }),
  actor_session_version: Object.freeze({ udtName: 'int4', nullable: false }),
  release_sha: Object.freeze({ udtName: 'bpchar', nullable: false }),
  expected_version: Object.freeze({ udtName: 'int4', nullable: false }),
  reason_hash: Object.freeze({ udtName: 'bpchar', nullable: false }),
  created_at: Object.freeze({ udtName: 'timestamptz', nullable: false }),
});

export const TENANT_MEMBERSHIP_PROTECTED_RELATIONS = Object.freeze([
  'tenant_membership_change_request',
  'tenant_membership_governance_event_context',
]);

export const TENANT_MEMBERSHIP_TRIGGER_RELATIONS = Object.freeze([
  ...TENANT_MEMBERSHIP_PROTECTED_RELATIONS,
  'tenant_action_employment_link',
  'tenant_action_area_scope',
]);

export const TENANT_MEMBERSHIP_TRIGGER_CONTRACTS = Object.freeze({
  requestGuard: Object.freeze({
    name: 'tenant_membership_change_request_guard',
    tableName: 'tenant_membership_change_request',
    functionName: 'tenant_membership_change_request_guard_v1',
    events: Object.freeze(['delete', 'insert', 'update']),
  }),
  contextAppendOnly: Object.freeze({
    name: 'tenant_membership_governance_event_context_append_only',
    tableName: 'tenant_membership_governance_event_context',
    functionName: 'tenant_iam_reject_change',
    events: Object.freeze(['delete', 'update']),
  }),
  employmentBinding: Object.freeze({
    name: 'tenant_action_employment_binding_guard',
    tableName: 'tenant_action_employment_link',
    functionName: 'tenant_action_validate_binding',
    events: Object.freeze(['insert', 'update']),
  }),
  areaScopeBinding: Object.freeze({
    name: 'tenant_action_scope_binding_guard',
    tableName: 'tenant_action_area_scope',
    functionName: 'tenant_action_validate_binding',
    events: Object.freeze(['insert', 'update']),
  }),
  employmentHistory: Object.freeze({
    name: 'tenant_action_employment_history_guard_v1',
    tableName: 'tenant_action_employment_link',
    functionName: 'tenant_lifecycle_guard_employment_history_v1',
    events: Object.freeze(['delete', 'update']),
  }),
});

const SECURITY_FUNCTIONS = Object.freeze(
  Object.values(EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES),
);

const SECURITY_FUNCTION_CONTRACTS = Object.freeze(Object.fromEntries(
  SECURITY_FUNCTIONS.map((signature) => [signature, Object.freeze({
    language: 'plpgsql', kind: 'f',
    returnType: signature.includes('admin_view') || signature.includes('governance_apply')
      ? 'jsonb' : 'trigger',
    volatility: 'v',
  })]),
));

function functionSourceFromMigration(sql, functionName) {
  const start = String(sql).indexOf(`CREATE OR REPLACE FUNCTION ${functionName}(`);
  if (start < 0) throw new Error(`fuente SQL ausente para ${functionName}`);
  const bodyStartMarker = String(sql).indexOf('AS $$', start);
  if (bodyStartMarker < 0) throw new Error(`cuerpo SQL ausente para ${functionName}`);
  const bodyStart = bodyStartMarker + 'AS $$'.length;
  const bodyEnd = String(sql).indexOf('$$;', bodyStart);
  if (bodyEnd < 0) throw new Error(`cierre SQL ausente para ${functionName}`);
  return String(sql).slice(bodyStart, bodyEnd);
}

export function existingIdentityMembershipFunctionSourceFingerprint(source) {
  const canonical = String(source || '').replace(/\r\n?/g, '\n').trim();
  return createHash('sha256').update(canonical).digest('hex');
}

const [membershipMigrationSource, adminViewCoreSource, iamBaseSource] = await Promise.all([
  readFile(MIGRATION_URL, 'utf8'),
  readFile(CORE_SOURCE_URL, 'utf8'),
  readFile(IAM_BASE_SOURCE_URL, 'utf8'),
]);

export const EXISTING_IDENTITY_MEMBERSHIP_FUNCTION_SOURCE_HASHES = Object.freeze({
  [EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.actionBindingGuard]:
    existingIdentityMembershipFunctionSourceFingerprint(
      functionSourceFromMigration(membershipMigrationSource, 'tenant_action_validate_binding'),
    ),
  [EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.appendOnlyGuard]:
    existingIdentityMembershipFunctionSourceFingerprint(
      functionSourceFromMigration(iamBaseSource, 'tenant_iam_reject_change'),
    ),
  [EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.employmentHistoryGuard]:
    existingIdentityMembershipFunctionSourceFingerprint(
      functionSourceFromMigration(
        adminViewCoreSource, 'tenant_lifecycle_guard_employment_history_v1',
      ),
    ),
  [EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.requestGuard]:
    existingIdentityMembershipFunctionSourceFingerprint(
      functionSourceFromMigration(membershipMigrationSource, 'tenant_membership_change_request_guard_v1'),
    ),
  [EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.adminView]:
    existingIdentityMembershipFunctionSourceFingerprint(
      functionSourceFromMigration(membershipMigrationSource, 'tenant_iam_admin_view_v3'),
    ),
  [EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.adminViewCore]:
    existingIdentityMembershipFunctionSourceFingerprint(
      functionSourceFromMigration(adminViewCoreSource, 'tenant_iam_admin_view_v3'),
    ),
  [EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.apply]:
    existingIdentityMembershipFunctionSourceFingerprint(
      functionSourceFromMigration(membershipMigrationSource, 'tenant_membership_governance_apply_v1'),
    ),
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

function requireLengthRangeConstraint(label, definition, column, nullable) {
  // PostgreSQL stores BETWEEN as an AND pair in the expression tree, so
  // pg_get_constraintdef() canonically emits >= / <= on supported versions.
  // Accept the source spelling too, but require the complete, anchored shape:
  // the exact expression, exact bounds, AND between bounds and (when nullable)
  // only an IS NULL OR wrapper.
  const body = normalized(definition).replace(/\s+/g, '');
  const escapedColumn = String(column).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lengthExpression = `length\\(btrim\\(${escapedColumn}\\)\\)`;
  const nullablePrefix = nullable ? `${escapedColumn}isnull\\)*or\\(*` : '';
  const acceptedShapes = [
    new RegExp(`^check\\(\\(*${nullablePrefix}${lengthExpression}between3and500\\)*\\)$`),
    new RegExp(`^check\\(\\(*${nullablePrefix}${lengthExpression}>=3\\)*and\\(*${lengthExpression}<=500\\)*\\)$`),
  ];
  if (!acceptedShapes.some((shape) => shape.test(body))) {
    throw new Error(`${label} no conserva el rango exacto 3..500`);
  }
}

function requireExactExpiryConstraint(label, definition) {
  const body = normalized(definition).replace(/\s+/g, '');
  // pg_get_constraintdef() groups the timestamp addition, while the migration
  // source need not. Both spellings must still be exactly requested_at + 24h.
  if (!/^check\(expires_at=\(*requested_at\+'24:00:00'::interval\)*\)$/.test(body)) {
    throw new Error(`${label} no conserva requested_at + 24 horas exactas`);
  }
}

function validateColumnShapes(rowsValue, contract, label) {
  const byName = new Map((rowsValue || []).map((row) => [row.name, row]));
  exactSet(byName.keys(), Object.keys(contract), label);
  for (const [name, expected] of Object.entries(contract)) {
    const actual = byName.get(name);
    if (actual?.udtName !== expected.udtName || actual?.nullable !== expected.nullable) {
      throw new Error(`${label} con tipo/nullability invalido en ${name}`);
    }
  }
  return byName;
}

export function existingIdentityMembershipFingerprint(sql) {
  return createHash('sha256').update(String(sql)).digest('hex');
}

export function validateExistingIdentityMembershipMigrationSql(sql) {
  const body = normalized(sql);
  requireTokens('migracion 013', body, [
    "'tenant_rrhh_admin_operativo'", "'workforce.employee.read'",
    "'employee.record.propose'", 'tenant_membership_change_request',
    'tenant_membership_change_request_guard_v1',
    'tenant_membership_change_request_guard',
    "before insert or update or delete on tenant_membership_change_request",
    "new.status <> 'pending' or new.version <> 1",
    "new.expires_at is distinct from (new.requested_at + interval '24 hours')",
    'references tenant_membership(id, tenant_id) on update restrict on delete restrict',
    "and lower(membership.user_email) = lower(new.target_user_email)",
    "status in ('pending', 'approved', 'rejected', 'expired')",
    "default (now() + interval '24 hours')",
    'decided_at <= expires_at', 'decided_at >= expires_at',
    'tenant_membership_governance_event_context',
    'tenant_action_validate_binding',
    "tg_op = 'update' and old.active is true and new.active is false",
    "to_jsonb(new) - array['active','revoked_at','updated_at']",
    'batch.legacy_import_run_id is not null',
    'tenant_membership_governance_apply_v1', 'tenant_iam_admin_view_core_013',
    "p_command not in ( 'request_existing_membership', 'request_membership_reactivation', 'approve_membership_change', 'reject_membership_change' )",
    "p_command in ('request_existing_membership', 'request_membership_reactivation')",
    "p_command = 'request_existing_membership'", 'p_expected_version <> 0',
    "p_command = 'reject_membership_change'",
    "lower(request_row.requested_by_user_email) = actor_email",
    "lower(request_row.target_user_email) = actor_email",
    "raise exception 'tenant_membership_maker_checker_required'",
    "'platform_owner:governance', 12012",
    "lower(assignment.user_email) <> actor_email",
    "lower(assignment.user_email) <> target_email",
    "raise exception 'tenant_membership_request_pending'",
    "get stacked diagnostics conflict_constraint_name = constraint_name",
    "raise exception 'tenant_membership_unledgered_core'",
    "raise exception 'tenant_membership_admin_view_core_missing'",
    "users.auth_mode = 'managed'", "factor.status = 'active'",
    "tenant.status = 'active'", 'policy.tenant_data_plane_ready is true',
    'policy.certified_release_sha = p_release_sha', "binding.source_system = 'grh'",
    'binding.verified is true', 'tenant_lifecycle_assert_platform_capability_v2',
    "'platform.users.manage'", 'tenant_iam_assert_no_sod_conflict',
    "membership_row.status <> 'suspended'", 'version = version + 1',
    'delete from tenant_membership_capability_override',
    'override_row.allow_override is true', 'preserved_deny_overrides',
    'update tenant_action_employment_link link set active = false',
    'update tenant_action_area_scope scope set active = false',
    'update tenant_exclusive_capability exclusive set active = false',
    "'snapshotsha256', authority_snapshot_hash",
    "'snapshot', authority_snapshot",
    "'authorityversion', authority_row.version",
    "'resultingauthorityversion', authority_row.version",
    'update tenant_action_authority set version = version + 1',
    'command_hash_value := encode(digest(convert_to(jsonb_build_object(',
    'replay.command_hash is distinct from command_hash_value',
    'p_idempotency_key, command_hash_value, result_value',
    'decision_time_value := clock_timestamp()',
    'request_time_value := clock_timestamp()',
    "'staleauthorityrevokedbeforereactivation', true",
    "'request_existing_membership', 'request_membership_reactivation'",
    "'approve_membership_change', 'reject_membership_change'",
    "'membershiprequests', requests_value",
    "'actorgovernanceready', actor_governance_ready",
    "'actionablerequestcount', actionable_request_count",
    "'eligibletenantids', eligible_tenant_ids",
    'jsonb_array_length(eligible_tenant_ids) > 0',
    "'futuretenantaccess', false", "'credentialscreated', false",
    "'databasesuperuser', false", 'tenant_membership_governance_event_context_append_only',
    'insert into tenant_iam_event', 'reason_hash_value', 'request_id',
    'tenant_membership_change_request_pending_uk',
    'revoke all on function tenant_iam_admin_view_core_013',
    'revoke all on function tenant_membership_change_request_guard_v1',
    'revoke all on function tenant_iam_reject_change',
    'revoke all on function tenant_lifecycle_guard_employment_history_v1',
    'tenant_membership_function_acl_hardening',
    "'public.tenant_action_validate_binding()'::regprocedure",
    "'public.tenant_iam_reject_change()'::regprocedure",
    "'public.tenant_lifecycle_guard_employment_history_v1()'::regprocedure",
    'grant execute on function tenant_membership_governance_apply_v1',
    "select 'column', relation.relname, attribute.attname, acl.privilege_type",
    'aclexplode(attribute.attacl)',
    'from public cascade', 'from municontrol_actions_runtime_app cascade',
  ]);
  if (body.includes('on update cascade')) {
    throw new Error('013 conserva FK email incompatible con el guard inmutable');
  }
  for (const capability of TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES) {
    if (!body.includes(`'tenant_rrhh_admin_operativo', '${capability}'`)) {
      throw new Error(`013 no declara capability base ${capability}`);
    }
  }
  for (const forbidden of [
    'payroll.read', 'budget.approved.read', 'leave.request.restricted.read',
    'leave.request.payroll.read', 'employee.record.approve', 'absence.validate',
    'leave.approve', 'time.overtime.approve', 'time.overtime.post',
  ]) {
    if (body.includes(`'tenant_rrhh_admin_operativo', '${forbidden}'`)) {
      throw new Error(`013 mezcla responsabilidad sensible ${forbidden}`);
    }
  }
  if (/\b(?:create|alter|drop)\s+role\b/i.test(sql)
      || /\bcomment\s+on\s+role\b/i.test(sql)
      || /\b(?:password|passwd|credential|api[_-]?key|authorization\s*:)\b/i.test(sql)
      || /\b(?:rolsuper|rolcreaterole|rolcreatedb|rolbypassrls)\s*=\s*true\b/i.test(sql)) {
    throw new Error('013 intenta crear credenciales o privilegios PostgreSQL');
  }
  if (/aclexplode\s*\(\s*coalesce\s*\(\s*attribute\.attacl/i.test(sql)) {
    throw new Error('013 fabrica un ACL de columna vacío incompatible con aclexplode');
  }
  if (/actor_email\s*\|\|\s*':'\s*\|\|\s*p_idempotency_key::text\s*,\s*(?!0\b)\d+/i.test(sql)
      || /update\s+tenant_identity_session\s+set[\s\S]{0,240}?session_version\s*=\s*session_version\s*\+\s*1/i.test(sql)) {
    throw new Error('013 rompe serializacion global o la transicion terminal de sesiones');
  }
  if (/select\s+\*\s+into\s+membership_row\s+from\s+tenant_membership\s+membership\s+where\s+membership\.id\s*=\s*membership_id_value\s+for\s+share/i.test(sql)) {
    throw new Error('013 toma row lock antes del advisory de membresia');
  }
  const membershipAdvisory = body.indexOf("tenant_id_value::text || ':' || target_email || ':membership'");
  const membershipWriteLock = body.indexOf(
    'where membership.id = membership_id_value for update', membershipAdvisory,
  );
  if (membershipAdvisory < 0 || membershipWriteLock <= membershipAdvisory) {
    throw new Error('013 no respeta orden advisory a row lock de membresia');
  }
  const decisionStart = body.indexOf("request_id_value := (p_payload->>'requestid')::uuid");
  const decisionAdvisory = body.indexOf(
    "tenant_id_value::text || ':' || target_email || ':membership'", decisionStart,
  );
  const requestWriteLock = body.indexOf(
    'where request.id = request_id_value for update', decisionStart,
  );
  if (decisionStart < 0 || decisionAdvisory <= decisionStart
      || requestWriteLock <= decisionAdvisory) {
    throw new Error('013 no respeta orden advisory a row lock de solicitud');
  }
  if (/delete from tenant_membership_capability_override override_row\s+where override_row\.membership_id = membership_row\.id\s*;/i.test(normalized(sql))) {
    throw new Error('013 elimina denies y puede ampliar privilegios al reactivar');
  }
  const actorCheck = body.indexOf('tenant_lifecycle_assert_platform_capability_v2');
  const replayCheck = body.indexOf('select * into replay from tenant_iam_event');
  const mutableCheckerCheck = body.indexOf('lower(assignment.user_email) <> actor_email');
  if (actorCheck < 0 || replayCheck <= actorCheck || mutableCheckerCheck <= replayCheck) {
    throw new Error('013 no ubica replay entre revalidacion del actor y condiciones mutables');
  }
  for (const facade of [
    'tenant_membership_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)',
    'tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)',
  ]) {
    const revoke = body.lastIndexOf(`revoke all on function ${facade}`);
    const grant = body.lastIndexOf(`grant execute on function ${facade}`);
    if (revoke < 0 || grant <= revoke) {
      throw new Error(`013 no reconcilia ACL runtime antes de conceder ${facade}`);
    }
  }
  for (const hiddenFunction of [
    'tenant_action_validate_binding()',
    'tenant_iam_reject_change()',
    'tenant_lifecycle_guard_employment_history_v1()',
    'tenant_membership_change_request_guard_v1()',
    'tenant_iam_admin_view_core_013(text,uuid,integer,text,text,uuid,integer)',
  ]) {
    if (body.lastIndexOf(`revoke all on function ${hiddenFunction}`) < 0) {
      throw new Error(`013 no revoca la funcion interna ${hiddenFunction} del runtime`);
    }
  }
  if (/\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:public\.)?(?:grh_[a-z0-9_]*|payroll_[a-z0-9_]*|action_case(?:_event|_context)?|employment_contract|source_import_batch|time_catalog_[a-z0-9_]*)\b/i.test(sql)) {
    throw new Error('013 intenta DML fuera del control plane de identidad');
  }
  return true;
}

export function validateExistingIdentityMembershipEvidence(evidence) {
  const requestColumns = validateColumnShapes(
    evidence?.requestColumns,
    TENANT_MEMBERSHIP_CHANGE_REQUEST_COLUMN_SHAPES,
    'columnas solicitud 013',
  );
  const contextColumns = validateColumnShapes(
    evidence?.contextColumns,
    TENANT_MEMBERSHIP_GOVERNANCE_CONTEXT_COLUMN_SHAPES,
    'columnas contexto 013',
  );
  for (const [column, tokens] of Object.entries({
    id: ['gen_random_uuid'], status: ["'pending'"],
    requested_at: ['now()'], expires_at: ['now()', "'24:00:00'::interval"], version: ['1'],
  })) requireTokens(`default solicitud 013 ${column}`, requestColumns.get(column)?.defaultExpression, tokens);
  requireTokens('default contexto 013 created_at',
    contextColumns.get('created_at')?.defaultExpression, ['now()']);
  exactSet((evidence?.roleCapabilities || []).map((row) => row.capabilityKey),
    TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES, 'perfil operativo 013');
  if (evidence?.role?.scopeKind !== 'tenant' || evidence.role.systemManaged !== true) {
    throw new Error('rol operativo 013 no es tenant/system-managed');
  }
  if (evidence?.sodConflictCount !== 0 || evidence?.invalidRequestCount !== 0
      || evidence?.pendingDuplicateCount !== 0 || evidence?.invalidContextCount !== 0) {
    throw new Error('invariantes 013 violadas');
  }
  if (!Array.isArray(evidence?.constraints) || !Array.isArray(evidence?.indexes)) {
    throw new Error('estructura 013 incompleta');
  }
  if (evidence.constraints.some((row) => row.validated !== true)) {
    throw new Error('constraint 013 no validada');
  }
  const constraints = new Map(evidence.constraints.map((row) => [row.name, row]));
  const requiredConstraints = {
    tenant_membership_change_request_action_ck: ["requested_action", "'add'", "'reactivate'"],
    tenant_membership_change_request_role_ck: ['tenant_rrhh_admin_operativo'],
    tenant_membership_change_request_status_ck: ["'pending'", "'approved'", "'rejected'", "'expired'"],
    tenant_membership_change_request_membership_fk: [
      'foreign key (membership_id, tenant_id)',
      'references tenant_membership(id, tenant_id)', 'on update restrict', 'on delete restrict',
    ],
    tenant_membership_change_request_shape_ck: ['expected_membership_version = 0', 'expected_membership_version > 0'],
    tenant_membership_change_request_reason_ck: [],
    tenant_membership_change_request_decision_reason_ck: [],
    tenant_membership_change_request_version_ck: ['version > 0'],
    tenant_membership_change_request_expiry_ck: [],
    tenant_membership_change_request_state_ck: [
      'decided_at <= expires_at', 'decided_at >= expires_at',
      'lower(decided_by_user_email) <> lower(requested_by_user_email)',
      'lower(decided_by_user_email) <> lower(target_user_email)',
    ],
    tenant_membership_governance_context_session_version_ck: ['actor_session_version > 0'],
    tenant_membership_governance_context_release_ck: ["release_sha ~ '^[a-f0-9]{40}$'"],
    tenant_membership_governance_context_expected_version_ck: ['expected_version >= 0'],
    tenant_membership_governance_context_reason_hash_ck: ["reason_hash ~ '^[a-f0-9]{64}$'"],
  };
  for (const [name, tokens] of Object.entries(requiredConstraints)) {
    const constraint = constraints.get(name);
    if (!constraint) throw new Error(`constraint 013 ausente ${name}`);
    requireTokens(`constraint 013 ${name}`, constraint.definition, tokens);
  }
  requireLengthRangeConstraint(
    'constraint 013 tenant_membership_change_request_reason_ck',
    constraints.get('tenant_membership_change_request_reason_ck').definition,
    'reason', false,
  );
  requireLengthRangeConstraint(
    'constraint 013 tenant_membership_change_request_decision_reason_ck',
    constraints.get('tenant_membership_change_request_decision_reason_ck').definition,
    'decision_reason', true,
  );
  requireExactExpiryConstraint(
    'constraint 013 tenant_membership_change_request_expiry_ck',
    constraints.get('tenant_membership_change_request_expiry_ck').definition,
  );
  for (const [column, reference] of [
    ['target_user_email', 'internal_users(email)'],
    ['requested_by_user_email', 'internal_users(email)'],
    ['decided_by_user_email', 'internal_users(email)'],
  ]) {
    const matching = evidence.constraints.find((row) => {
      const definition = normalized(row.definition);
      return definition.includes(`foreign key (${column})`)
        && definition.includes(`references ${reference}`)
        && definition.includes('on update restrict')
        && definition.includes('on delete restrict');
    });
    if (!matching) throw new Error(`FK email 013 insegura ${column}`);
  }
  for (const [tableName, columns, reference] of [
    ['tenant_membership_change_request', 'tenant_id', 'platform_tenant(id)'],
    ['tenant_membership_change_request', 'role_key', 'iam_role(role_key)'],
    ['tenant_membership_governance_event_context', 'event_id', 'tenant_iam_event(id)'],
    ['tenant_membership_governance_event_context', 'request_id', 'tenant_membership_change_request(id)'],
    ['tenant_membership_governance_event_context', 'actor_session_id', 'tenant_identity_session(id)'],
  ]) {
    const matching = evidence.constraints.find((row) => {
      const definition = normalized(row.definition);
      return row.tableName === tableName
        && definition.includes(`foreign key (${columns})`)
        && definition.includes(`references ${reference}`)
        && definition.includes('on delete restrict');
    });
    if (!matching) throw new Error(`FK 013 insegura ${tableName}.${columns}`);
  }
  const indexes = new Map(evidence.indexes.map((row) => [row.name, row]));
  for (const name of [
    'tenant_membership_change_request_pkey',
    'tenant_membership_governance_event_context_pkey',
    'tenant_membership_change_request_pending_uk',
    'tenant_membership_change_request_recent_idx',
  ]) {
    const index = indexes.get(name);
    if (!index || index.valid !== true || index.ready !== true) {
      throw new Error(`indice 013 ausente o invalido ${name}`);
    }
    if (name.endsWith('_pkey') && (index.unique !== true || index.primary !== true)) {
      throw new Error(`primary key 013 degradada ${name}`);
    }
  }
  const pendingIndex = indexes.get('tenant_membership_change_request_pending_uk');
  if (pendingIndex.unique !== true || pendingIndex.primary !== false) {
    throw new Error('indice pending 013 no es unique parcial');
  }
  requireTokens('indice pending 013', pendingIndex.definition, [
    'tenant_id', 'lower(target_user_email)', 'where', "status", "'pending'",
  ]);
  const recentIndex = indexes.get('tenant_membership_change_request_recent_idx');
  if (recentIndex.unique !== false || recentIndex.primary !== false) {
    throw new Error('indice recent 013 degradado');
  }
  requireTokens('indice recent 013', recentIndex.definition, ['requested_at desc', 'id']);
  const functions = new Map((evidence?.functions || []).map((row) => [row.signature, row]));
  exactSet(functions.keys(), SECURITY_FUNCTIONS, 'funciones 013');
  for (const signature of SECURITY_FUNCTIONS) {
    const fn = functions.get(signature);
    const contract = SECURITY_FUNCTION_CONTRACTS[signature];
    if (!fn || fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
        || fn.ownerIsRuntime === true || fn.publicExecuteRevoked !== true
        || fn.runtimeExecuteGrantable !== false
        || fn.language !== contract.language || fn.kind !== contract.kind
        || fn.returnType !== contract.returnType || fn.volatility !== contract.volatility
        || !Array.isArray(fn.config)
        || !fn.config.map(normalized).includes('search_path=public, pg_temp')) {
      throw new Error(`funcion insegura 013 ${signature}`);
    }
    if (fn.sourceHash !== EXISTING_IDENTITY_MEMBERSHIP_FUNCTION_SOURCE_HASHES[signature]) {
      throw new Error(`definicion de funcion 013 con drift ${signature}`);
    }
  }
  for (const signature of [
    EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.adminView,
    EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.apply,
  ]) {
    const fn = functions.get(signature);
    if (fn.runtimeCanExecute !== true
        || JSON.stringify(fn.nonOwnerExecuteGrantees || []) !== JSON.stringify([RUNTIME_ROLE])) {
      throw new Error(`fachada 013 sin ACL exacta ${signature}`);
    }
  }
  const core = functions.get(EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.adminViewCore);
  if (core.runtimeCanExecute !== false || (core.nonOwnerExecuteGrantees || []).length) {
    throw new Error('core administrativo 013 expuesto al runtime');
  }
  const guard = functions.get(EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.requestGuard);
  if (guard.runtimeCanExecute !== false || (guard.nonOwnerExecuteGrantees || []).length) {
    throw new Error('guard de solicitudes 013 expuesto al runtime');
  }
  const actionBinding = functions.get(EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.actionBindingGuard);
  if (actionBinding.runtimeCanExecute !== false
      || (actionBinding.nonOwnerExecuteGrantees || []).length) {
    throw new Error('guard de binding 013 expuesto al runtime');
  }
  const appendOnly = functions.get(EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.appendOnlyGuard);
  if (appendOnly.runtimeCanExecute !== false
      || (appendOnly.nonOwnerExecuteGrantees || []).length) {
    throw new Error('guard append-only 013 expuesto al runtime');
  }
  requireTokens('guard append-only 013', appendOnly?.definition, [
    "raise exception 'tenant_iam_audit_immutable'", "errcode = 'p0001'",
  ]);
  const employmentHistory = functions.get(
    EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.employmentHistoryGuard,
  );
  if (employmentHistory.runtimeCanExecute !== false
      || (employmentHistory.nonOwnerExecuteGrantees || []).length) {
    throw new Error('guard de historia laboral 013 expuesto al runtime');
  }
  requireTokens('guard de historia laboral 013', employmentHistory?.definition, [
    "tg_op = 'delete' or old.active is false",
    "raise exception 'tenant_action_employment_history_immutable'",
  ]);
  requireTokens('guard 013', guard?.definition, [
    "tg_op = 'insert'", "new.status <> 'pending'", 'new.version <> 1',
    'new.expires_at is distinct from (new.requested_at +', 'interval',
    "and lower(membership.user_email) = lower(new.target_user_email)",
    "tg_op = 'delete'", "old.status <> 'pending'",
    "new.status not in ('approved', 'rejected', 'expired')",
    'new.decided_at > old.expires_at', 'new.decided_at < old.expires_at',
    'lower(new.decided_by_user_email) = lower(old.requested_by_user_email)',
    'lower(new.decided_by_user_email) = lower(old.target_user_email)',
    'new.version is distinct from old.version + 1',
    "raise exception 'tenant_membership_request_immutable'",
  ]);
  requireTokens('binding guard 013', actionBinding?.definition, [
    "tg_table_name not in ('tenant_action_employment_link', 'tenant_action_area_scope')",
    "tg_op = 'update' and old.active is true and new.active is false",
    "to_jsonb(new) - array['active','revoked_at','updated_at']",
    "binding.source_system = 'grh'", 'binding.verified is true',
    'batch.legacy_import_run_id is not null',
  ]);
  requireTokens('apply 013', functions.get(
    EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.apply,
  )?.definition, [
    'tenant_lifecycle_assert_platform_capability_v2', "'platform.users.manage'",
    "users.auth_mode = 'managed'", "factor.status = 'active'",
    "binding.source_system = 'grh'", 'binding.verified is true',
    'tenant_iam_assert_no_sod_conflict', 'tenant_iam_event',
    "'request_existing_membership'", "'request_membership_reactivation'",
    "'approve_membership_change'", "'reject_membership_change'",
    'p_expected_version <> 0',
    "'platform_owner:governance', 12012",
    'lower(assignment.user_email) <> actor_email',
    'lower(assignment.user_email) <> target_email',
    "raise exception 'tenant_membership_request_pending'",
    "get stacked diagnostics conflict_constraint_name = constraint_name",
    'lower(request_row.requested_by_user_email) = actor_email',
    'lower(request_row.target_user_email) = actor_email',
    'tenant_membership_capability_override', 'tenant_action_employment_link',
    'tenant_action_area_scope', 'tenant_exclusive_capability',
    'delete from tenant_membership_capability_override',
    'override_row.allow_override is true', 'preserved_deny_overrides',
    'update tenant_action_employment_link link set active = false',
    'update tenant_action_area_scope scope set active = false',
    'update tenant_exclusive_capability exclusive set active = false',
    "'snapshot', authority_snapshot", "'snapshotsha256', authority_snapshot_hash",
    'command_hash_value := encode(digest(convert_to(jsonb_build_object(',
    'replay.command_hash is distinct from command_hash_value',
    'decision_time_value := clock_timestamp()', 'request_time_value := clock_timestamp()',
    'update tenant_action_authority set version = version + 1',
    "'futuretenantaccess', false", "'credentialscreated', false",
  ]);
  requireTokens('view 013', functions.get(
    EXISTING_IDENTITY_MEMBERSHIP_SIGNATURES.adminView,
  )?.definition, [
    'tenant_iam_admin_view_core_013', "'request_existing_membership'",
    "'request_membership_reactivation'", "'approve_membership_change'",
    "'reject_membership_change'", "'membershiprequests', requests_value",
    "'explicittenantonly', true", "'makercheckerrequired', true",
    'actor_governance_ready', 'actionable_request_count',
    'eligible_tenant_ids', 'policy.certified_release_sha = p_release_sha',
    'jsonb_array_length(eligible_tenant_ids) > 0',
    "'requestttlhours', 24", "'staleauthorityrevokedbeforereactivation', true",
    "'databasesuperuser', false",
  ]);
  if ((evidence?.triggers || []).length !== Object.keys(TENANT_MEMBERSHIP_TRIGGER_CONTRACTS).length) {
    throw new Error('inventario de triggers 013 duplicado o incompleto');
  }
  const triggers = new Map((evidence?.triggers || []).map((row) => [row.name, row]));
  exactSet(triggers.keys(), Object.values(TENANT_MEMBERSHIP_TRIGGER_CONTRACTS)
    .map((contract) => contract.name), 'triggers 013');
  for (const contract of Object.values(TENANT_MEMBERSHIP_TRIGGER_CONTRACTS)) {
    const trigger = triggers.get(contract.name);
    if (!trigger || trigger.tableSchema !== 'public' || trigger.tableName !== contract.tableName
        || trigger.functionSchema !== 'public' || trigger.functionName !== contract.functionName
        || trigger.rowLevel !== true || trigger.timing !== 'before'
        || trigger.enabledMode !== 'O' || trigger.internal !== false
        || trigger.unconditional !== true
        || trigger.argumentCount !== 0 || String(trigger.argumentsRaw || '') !== ''
        || JSON.stringify(trigger.arguments || []) !== JSON.stringify([])
        || JSON.stringify(trigger.updateColumns || []) !== JSON.stringify([])
        || JSON.stringify([...(trigger.events || [])].sort())
          !== JSON.stringify([...contract.events].sort())) {
      throw new Error(`trigger 013 incompleto o degradado ${contract.name}`);
    }
    requireTokens(`trigger ${contract.name}`, trigger.definition, [
      `trigger ${contract.name}`, contract.tableName, contract.functionName,
    ]);
  }
  const protectedRelations = new Map(
    (evidence?.protectedRelations || []).map((row) => [row.name, row]),
  );
  exactSet(protectedRelations.keys(), TENANT_MEMBERSHIP_PROTECTED_RELATIONS,
    'relaciones protegidas 013');
  for (const name of TENANT_MEMBERSHIP_PROTECTED_RELATIONS) {
    const relation = protectedRelations.get(name);
    if (!relation || relation.schemaName !== 'public'
        || relation.ownerIsRuntime === true || relation.ownedByCurrentUser !== true
        || relation.publicTablePrivilegesRevoked !== true
        || relation.publicColumnPrivilegesRevoked !== true
        || relation.runtimeTablePrivilegesRevoked !== true
        || relation.runtimeColumnPrivilegesRevoked !== true
        || (relation.nonOwnerTablePrivilegeGrantees || []).length
        || (relation.nonOwnerColumnPrivileges || []).length) {
      throw new Error(`ACL de tabla/columnas 013 insegura ${name}`);
    }
  }
  const runtime = evidence?.runtimeRole;
  if (!runtime || runtime.canLogin !== true || runtime.inherit !== false
      || runtime.superuser !== false || runtime.bypassRls !== false
      || runtime.createDb !== false || runtime.createRole !== false
      || runtime.replication !== false || runtime.membershipCount !== 0
      || runtime.schemaUsage !== true
      || runtime.schemaCreate !== false) {
    throw new Error('runtime 013 conserva privilegios elevados');
  }
  if (!Array.isArray(evidence?.roleMemberships)
      || !Array.isArray(evidence?.relations) || !Array.isArray(evidence?.sequences)
      || !Array.isArray(evidence?.runtimeFunctions)
      || !Array.isArray(evidence?.unexpectedSecurityDefiners)) {
    throw new Error('inventario ACL runtime 013 incompleto');
  }
  const membershipsIntoRuntime = evidence.roleMemberships
    .filter((row) => row.direction === 'member_of_runtime');
  const membershipsOfRuntime = evidence.roleMemberships
    .filter((row) => row.direction === 'granted_to_runtime');
  if (membershipsOfRuntime.length || membershipsIntoRuntime.length > 1
      || membershipsIntoRuntime.some((row) => (
        row.memberIsCurrentUser !== true || row.adminOption !== true
          || row.inheritOption !== false || row.setOption !== false
          || row.memberOwnsApprovedFunctions !== true
      ))) {
    throw new Error('membresias runtime 013 permiten escalamiento fuera de la arista Neon');
  }
  exactSet((evidence?.runtimeFunctions || []).map((row) => row.signature),
    EXISTING_IDENTITY_MEMBERSHIP_RUNTIME_FUNCTION_ALLOWLIST, 'EXECUTE runtime 013');
  if ((evidence?.unexpectedSecurityDefiners || []).length) {
    throw new Error('runtime 013 puede ejecutar SECDEF inesperadas');
  }
  const runtimeRelationNames = new Set();
  for (const relation of evidence.relations) {
    const relationKey = `${relation.schemaName}.${relation.name}`;
    if (runtimeRelationNames.has(relationKey)) {
      throw new Error(`inventario runtime 013 duplica ${relationKey}`);
    }
    runtimeRelationNames.add(relationKey);
    if (relation.canSelect || relation.canInsert || relation.canUpdate || relation.canReferences
        || relation.canDelete || relation.canTruncate || relation.canTrigger) {
      throw new Error(`runtime conserva DML directo en ${relationKey}`);
    }
  }
  for (const name of TENANT_MEMBERSHIP_PROTECTED_RELATIONS) {
    if (!runtimeRelationNames.has(`public.${name}`)) {
      throw new Error(`inventario runtime 013 omite public.${name}`);
    }
  }
  for (const sequence of evidence.sequences) {
    if (sequence.canUsage || sequence.canSelect || sequence.canUpdate) {
      throw new Error(`runtime conserva privilegio de secuencia en ${sequence.schemaName}.${sequence.name}`);
    }
  }
  return true;
}

async function collectEvidence(client) {
  const requestColumns = await client.query(`
    SELECT column_name AS name, udt_name AS "udtName",
      is_nullable = 'YES' AS nullable, column_default AS "defaultExpression"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenant_membership_change_request'
    ORDER BY ordinal_position
  `);
  const contextColumns = await client.query(`
    SELECT column_name AS name, udt_name AS "udtName",
      is_nullable = 'YES' AS nullable, column_default AS "defaultExpression"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenant_membership_governance_event_context'
    ORDER BY ordinal_position
  `);
  const role = await client.query(`
    SELECT scope_kind AS "scopeKind", system_managed AS "systemManaged"
    FROM iam_role WHERE role_key = 'TENANT_RRHH_ADMIN_OPERATIVO'
  `);
  const roleCapabilities = await client.query(`
    SELECT capability_key AS "capabilityKey" FROM iam_role_capability
    WHERE role_key = 'TENANT_RRHH_ADMIN_OPERATIVO' ORDER BY capability_key
  `);
  const constraints = await client.query(`
    SELECT relation.relname AS "tableName", constraint_row.conname AS name,
      constraint_row.contype::text AS "type",
      constraint_row.convalidated AS validated,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname, constraint_row.conname
  `, [TENANT_MEMBERSHIP_PROTECTED_RELATIONS]);
  const indexes = await client.query(`
    SELECT relation.relname AS "tableName", index_relation.relname AS name,
      index_row.indisunique AS "unique", index_row.indisprimary AS "primary",
      index_row.indisvalid AS "valid", index_row.indisready AS "ready",
      pg_get_indexdef(index_row.indexrelid) AS definition
    FROM pg_index index_row
    JOIN pg_class relation ON relation.oid = index_row.indrelid
    JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname, index_relation.relname
  `, [TENANT_MEMBERSHIP_PROTECTED_RELATIONS]);
  const functions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      function_row.proowner = runtime_role.oid AS "ownerIsRuntime",
      NOT has_function_privilege('public', function_row.oid, 'EXECUTE') AS "publicExecuteRevoked",
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS "runtimeCanExecute",
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(
        function_row.proacl, acldefault('f', function_row.proowner)
      )) acl WHERE acl.grantee = runtime_role.oid
        AND acl.privilege_type = 'EXECUTE' AND acl.is_grantable IS TRUE)
        AS "runtimeExecuteGrantable",
      function_row.proconfig AS config,
      language_row.lanname AS language,
      function_row.prokind::text AS kind,
      function_row.provolatile::text AS volatility,
      function_row.prorettype::regtype::text AS "returnType",
      pg_get_functiondef(function_row.oid) AS definition,
      function_row.prosrc AS "sourceBody",
      to_jsonb(ARRAY(SELECT role_row.rolname
        FROM aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) acl
        JOIN pg_roles role_row ON role_row.oid = acl.grantee
        WHERE acl.privilege_type = 'EXECUTE' AND acl.grantee <> function_row.proowner
        ORDER BY role_row.rolname)) AS "nonOwnerExecuteGrantees"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_language language_row ON language_row.oid = function_row.prolang
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE namespace.nspname = 'public'
      AND function_row.proname = ANY($2::text[])
  `, [RUNTIME_ROLE, [
    'tenant_action_validate_binding',
    'tenant_iam_reject_change',
    'tenant_lifecycle_guard_employment_history_v1',
    'tenant_membership_change_request_guard_v1',
    'tenant_iam_admin_view_v3', 'tenant_iam_admin_view_core_013',
    'tenant_membership_governance_apply_v1',
  ]]);
  const triggers = await client.query(`
    SELECT trigger_row.tgname AS name, namespace.nspname AS "tableSchema",
      relation.relname AS "tableName", function_namespace.nspname AS "functionSchema",
      function_row.proname AS "functionName",
      (trigger_row.tgtype::integer & 1) <> 0 AS "rowLevel",
      CASE WHEN (trigger_row.tgtype::integer & 2) <> 0 THEN 'before'
        WHEN (trigger_row.tgtype::integer & 64) <> 0 THEN 'instead'
        ELSE 'after' END AS timing,
      trigger_row.tgenabled::text AS "enabledMode",
      trigger_row.tgisinternal AS internal,
      trigger_row.tgqual IS NULL AS unconditional,
      trigger_row.tgnargs::integer AS "argumentCount",
      encode(trigger_row.tgargs, 'escape') AS "argumentsRaw",
      CASE WHEN trigger_row.tgnargs = 0 THEN '[]'::jsonb
        ELSE jsonb_build_array(encode(trigger_row.tgargs, 'escape')) END AS arguments,
      COALESCE((
        SELECT jsonb_agg(attribute.attname ORDER BY update_attribute.position)
        FROM unnest(trigger_row.tgattr::smallint[]) WITH ORDINALITY
          update_attribute(attnum, position)
        JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
          AND attribute.attnum = update_attribute.attnum
      ), '[]'::jsonb) AS "updateColumns",
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
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY($1::text[])
      AND trigger_row.tgisinternal IS FALSE
  `, [TENANT_MEMBERSHIP_TRIGGER_RELATIONS]);
  const protectedRelations = await client.query(`
    SELECT namespace.nspname AS "schemaName", relation.relname AS name,
      relation.relowner = current_user::regrole::oid AS "ownedByCurrentUser",
      relation.relowner = runtime_role.oid AS "ownerIsRuntime",
      NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(
        relation.relacl, acldefault('r', relation.relowner)
      )) acl WHERE acl.grantee = 0) AS "publicTablePrivilegesRevoked",
      NOT EXISTS (
        SELECT 1 FROM pg_attribute attribute
        CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
        WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0
          AND attribute.attisdropped IS FALSE AND acl.grantee = 0
      ) AS "publicColumnPrivilegesRevoked",
      NOT has_any_column_privilege($1, relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
        AS "runtimeColumnPrivilegesRevoked",
      NOT has_table_privilege($1, relation.oid, 'DELETE,TRUNCATE,TRIGGER')
        AS "runtimeTablePrivilegesRevoked",
      to_jsonb(ARRAY(SELECT DISTINCT COALESCE(role_row.rolname, 'PUBLIC')
        FROM aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) acl
        LEFT JOIN pg_roles role_row ON role_row.oid = acl.grantee
        WHERE acl.grantee <> relation.relowner
        ORDER BY COALESCE(role_row.rolname, 'PUBLIC'))) AS "nonOwnerTablePrivilegeGrantees",
      to_jsonb(ARRAY(
        SELECT DISTINCT concat(
          COALESCE(role_row.rolname, 'PUBLIC'), ':', attribute.attname, ':', acl.privilege_type
        ) AS privilege
        FROM pg_attribute attribute
        CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
        LEFT JOIN pg_roles role_row ON role_row.oid = acl.grantee
        WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0
          AND attribute.attisdropped IS FALSE AND acl.grantee <> relation.relowner
        ORDER BY privilege
      )) AS "nonOwnerColumnPrivileges"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY($2::text[])
  `, [RUNTIME_ROLE, TENANT_MEMBERSHIP_PROTECTED_RELATIONS]);
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
  `, [RUNTIME_ROLE, EXISTING_IDENTITY_MEMBERSHIP_RUNTIME_FUNCTION_ALLOWLIST]);
  const relations = await client.query(`
    SELECT namespace.nspname AS "schemaName", relation.relname AS name,
      has_any_column_privilege($1, relation.oid, 'SELECT') AS "canSelect",
      has_any_column_privilege($1, relation.oid, 'INSERT') AS "canInsert",
      has_any_column_privilege($1, relation.oid, 'UPDATE') AS "canUpdate",
      has_any_column_privilege($1, relation.oid, 'REFERENCES') AS "canReferences",
      has_table_privilege($1, relation.oid, 'DELETE') AS "canDelete",
      has_table_privilege($1, relation.oid, 'TRUNCATE') AS "canTruncate",
      has_table_privilege($1, relation.oid, 'TRIGGER') AS "canTrigger"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r','p','v','m','f')
  `, [RUNTIME_ROLE]);
  const sequences = await client.query(`
    SELECT namespace.nspname AS "schemaName", relation.relname AS name,
      has_sequence_privilege($1, relation.oid, 'USAGE') AS "canUsage",
      has_sequence_privilege($1, relation.oid, 'SELECT') AS "canSelect",
      has_sequence_privilege($1, relation.oid, 'UPDATE') AS "canUpdate"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'S'
  `, [RUNTIME_ROLE]);
  const invariants = await client.query(`
    SELECT
      (SELECT count(*)::integer FROM iam_role_capability left_mapping
       JOIN iam_capability_conflict conflict
         ON conflict.capability_key = left_mapping.capability_key
       JOIN iam_role_capability right_mapping
         ON right_mapping.role_key = left_mapping.role_key
        AND right_mapping.capability_key = conflict.conflicts_with_key
       WHERE left_mapping.role_key = 'TENANT_RRHH_ADMIN_OPERATIVO') AS "sodConflictCount",
      (SELECT count(*)::integer FROM tenant_membership_change_request request
       WHERE request.version < 1
          OR length(btrim(request.reason)) NOT BETWEEN 3 AND 500
          OR request.expires_at IS DISTINCT FROM request.requested_at + interval '24 hours'
          OR (request.requested_action = 'add'
           AND (request.membership_id IS NOT NULL OR request.expected_membership_version <> 0))
         OR (request.requested_action = 'reactivate'
           AND (request.membership_id IS NULL OR request.expected_membership_version < 1))
         OR (request.status = 'pending' AND (request.decided_by_user_email IS NOT NULL
           OR request.decision_reason IS NOT NULL OR request.decided_at IS NOT NULL))
          OR (request.status IN ('approved','rejected')
            AND (request.decided_by_user_email IS NULL OR request.decision_reason IS NULL
              OR request.decided_at IS NULL
              OR request.decided_at > request.expires_at
              OR lower(request.decided_by_user_email) = lower(request.requested_by_user_email)
              OR lower(request.decided_by_user_email) = lower(request.target_user_email)))
          OR (request.status = 'expired'
            AND (request.decided_by_user_email IS NOT NULL
              OR request.decision_reason IS NOT NULL OR request.decided_at IS NULL
              OR request.decided_at < request.expires_at)))
        AS "invalidRequestCount",
      (SELECT count(*)::integer FROM (
         SELECT request.tenant_id, lower(request.target_user_email)
         FROM tenant_membership_change_request request
         WHERE request.status = 'pending'
         GROUP BY request.tenant_id, lower(request.target_user_email)
         HAVING count(*) > 1
       ) duplicate) AS "pendingDuplicateCount",
      (SELECT count(*)::integer FROM tenant_membership_governance_event_context context
       WHERE context.actor_session_version < 1 OR context.expected_version < 0
         OR context.release_sha !~ '^[a-f0-9]{40}$'
         OR context.reason_hash !~ '^[a-f0-9]{64}$') AS "invalidContextCount"
  `);
  const functionEvidence = rows(functions).map((functionRow) => ({
    ...functionRow,
    sourceHash: existingIdentityMembershipFunctionSourceFingerprint(functionRow.sourceBody),
  }));
  return {
    requestColumns: rows(requestColumns), contextColumns: rows(contextColumns),
    role: rows(role)[0],
    roleCapabilities: rows(roleCapabilities), constraints: rows(constraints),
    indexes: rows(indexes), functions: functionEvidence,
    triggers: rows(triggers), protectedRelations: rows(protectedRelations),
    runtimeRole: rows(runtimeRole)[0], roleMemberships: rows(roleMemberships),
    runtimeFunctions: rows(runtimeFunctions),
    unexpectedSecurityDefiners: rows(unexpectedSecurityDefiners),
    relations: rows(relations), sequences: rows(sequences),
    ...(rows(invariants)[0] || {}),
  };
}

export async function verifyExistingIdentityMembershipFinalAcl(client) {
  validateExistingIdentityMembershipEvidence(await collectEvidence(client));
}

async function verifyPrerequisite(client) {
  const expected = existingIdentityMembershipFingerprint(await readFile(PREREQUISITE_URL, 'utf8'));
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${PLATFORM_OWNER_GOVERNANCE_MIGRATION_VERSION}`);
  }
}

async function verifyNoUnledgeredObjects(client) {
  const reserved = await client.query(`
    SELECT
      to_regclass('public.tenant_membership_change_request') IS NOT NULL
        AS "requestTableExists",
      to_regclass('public.tenant_membership_governance_event_context') IS NOT NULL
        AS "contextTableExists",
      to_regprocedure('public.tenant_membership_change_request_guard_v1()') IS NOT NULL
        AS "requestGuardExists",
      to_regprocedure('public.tenant_membership_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)') IS NOT NULL
        AS "applyFunctionExists",
      to_regprocedure('public.tenant_iam_admin_view_core_013(text,uuid,integer,text,text,uuid,integer)') IS NOT NULL
        AS "adminViewCoreExists"
  `);
  const present = Object.entries(rows(reserved)[0] || {})
    .filter(([, exists]) => exists === true)
    .map(([name]) => name);
  if (present.length) {
    throw new Error(`objetos 013 sin ledger: ${present.join(',')}`);
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateExistingIdentityMembershipMigrationSql(migration);
  const fingerprint = existingIdentityMembershipFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directIsolatedDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:membership-013'))");
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredObjects(client);
      await verifyPlatformOwnerGovernanceFinalAcl(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION} sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyExistingIdentityMembershipFinalAcl(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION}: reapply verificado (fingerprint SHA-256 ${fingerprint})`
      : `${EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION}: fresh apply (${statements.length} sentencias, fingerprint SHA-256 ${fingerprint})`);
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
