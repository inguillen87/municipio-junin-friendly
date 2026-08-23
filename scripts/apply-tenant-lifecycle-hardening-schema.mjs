import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import { OVERTIME_RUNTIME_FUNCTION_ALLOWLIST } from './apply-governed-overtime-actions-schema.mjs';

export const TENANT_LIFECYCLE_MIGRATION_VERSION = '009-tenant-lifecycle-hardening';
const MIGRATION_URL = new URL('./migrations/009-tenant-lifecycle-hardening.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const PREREQUISITES = Object.freeze([
  ['003-action-center', new URL('./migrations/003-action-center.sql', import.meta.url)],
  ['004-tenant-iam-control-plane', new URL('./migrations/004-tenant-iam-control-plane.sql', import.meta.url)],
  ['005-tenant-identity-gateway', new URL('./migrations/005-tenant-identity-gateway.sql', import.meta.url)],
  ['006-tenant-action-authority', new URL('./migrations/006-tenant-action-authority.sql', import.meta.url)],
  ['007-action-center-read-facades', new URL('./migrations/007-action-center-read-facades.sql', import.meta.url)],
  ['008-governed-overtime-actions', new URL('./migrations/008-governed-overtime-actions.sql', import.meta.url)],
]);

export const TENANT_LIFECYCLE_SIGNATURES = Object.freeze({
  policyTrigger: 'public.tenant_lifecycle_initialize_identity_policy_v1()',
  createEventTrigger: 'public.tenant_lifecycle_enrich_create_tenant_event_v1()',
  employmentHistory: 'public.tenant_lifecycle_guard_employment_history_v1()',
  revokedSession: 'public.tenant_lifecycle_guard_revoked_session_v1()',
  platformCapability: 'public.tenant_lifecycle_assert_platform_capability_v2(text,uuid,integer,text)',
  identityLookupCore: 'public.tenant_identity_lookup_core_009(text,text,text,text)',
  identityReplayCore: 'public.tenant_identity_command_replay_core_009(text,uuid,text)',
  identityViewCore: 'public.tenant_identity_view_core_009(text,uuid,text,integer)',
  identityLookup: 'public.tenant_identity_lookup(text,text,text,text)',
  identityLegacyReplay: 'public.tenant_identity_command_replay(text,uuid,text)',
  identityView: 'public.tenant_identity_view(text,uuid,text,integer)',
  identityDeliveryLookup: 'public.tenant_identity_platform_invitation_delivery_v2(text,uuid,integer,text,uuid)',
  identityPlatformReplay: 'public.tenant_identity_platform_command_replay_v2(text,uuid,integer,text,uuid,text,integer,uuid)',
  identityInvitationsView: 'public.tenant_identity_platform_invitations_view_v2(text,uuid,integer,text,integer)',
  identityIssueReplayState: 'public.tenant_identity_assert_issue_replay_current_v1(uuid,jsonb,text)',
  identityCore: 'public.tenant_identity_apply_command_core_009(text,text,uuid,text,integer,jsonb)',
  identityRuntime: 'public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)',
  identityPlatform: 'public.tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb)',
  bindingGuard: 'public.tenant_action_validate_binding()',
  authoritySnapshot: 'public.tenant_action_authority_snapshot(uuid)',
  provisioning: 'public.tenant_action_apply_provisioning_command_v2(text,uuid,integer,text,uuid,text,uuid,text,integer,jsonb)',
  lookupEmployment: 'public.tenant_action_lookup_employment_v2(text,uuid,integer,text,uuid,text,integer)',
  adminView: 'public.tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)',
  iamApply: 'public.tenant_iam_apply_command_v2(text,uuid,integer,text,uuid,text,integer,jsonb)',
});

const REMOVED_RUNTIME_FUNCTIONS = new Set([
  'public.tenant_action_apply_provisioning_command(text,uuid,uuid,uuid,text,uuid,text,integer,jsonb)',
  'public.tenant_iam_admin_view_v2(text,uuid,integer,text,integer)',
  'public.tenant_identity_command_replay(text,uuid,text)',
]);
export const TENANT_LIFECYCLE_RUNTIME_FUNCTION_ALLOWLIST = Object.freeze([
  ...OVERTIME_RUNTIME_FUNCTION_ALLOWLIST.filter((signature) => !REMOVED_RUNTIME_FUNCTIONS.has(signature)),
  TENANT_LIFECYCLE_SIGNATURES.identityPlatform,
  TENANT_LIFECYCLE_SIGNATURES.identityDeliveryLookup,
  TENANT_LIFECYCLE_SIGNATURES.identityPlatformReplay,
  TENANT_LIFECYCLE_SIGNATURES.identityInvitationsView,
  TENANT_LIFECYCLE_SIGNATURES.provisioning,
  TENANT_LIFECYCLE_SIGNATURES.lookupEmployment,
  TENANT_LIFECYCLE_SIGNATURES.adminView,
]);
const EXPECTED_RUNTIME_FUNCTIONS = new Set(TENANT_LIFECYCLE_RUNTIME_FUNCTION_ALLOWLIST);
const SECURITY_FUNCTIONS = Object.freeze([...new Set([
  ...TENANT_LIFECYCLE_RUNTIME_FUNCTION_ALLOWLIST,
  ...Object.values(TENANT_LIFECYCLE_SIGNATURES),
  'public.tenant_action_apply_provisioning_command(text,uuid,uuid,uuid,text,uuid,text,integer,jsonb)',
  'public.tenant_iam_admin_view_v2(text,uuid,integer,text,integer)',
])]);

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function requireTokens(name, definition, tokens) {
  const body = normalized(definition);
  for (const token of tokens) {
    if (!body.includes(normalized(token))) throw new Error(`${name} no contiene contrato ${token}`);
  }
}

function validateRevokedSessionGuard(definition) {
  const body = normalized(definition);
  const allowedTransitionFields = "array['status','revoked_at','revoked_by_user_email','version']";
  requireTokens('sesion terminal', body, [
    "tg_op = 'delete'", 'identity_session_delete_forbidden',
    'new.id is distinct from old.id', 'identity_session_id_immutable',
    "old.status = 'revoked'", 'to_jsonb(new) is distinct from to_jsonb(old)',
    "old.status = 'active' and new.status = 'revoked'",
    `(to_jsonb(new) - ${allowedTransitionFields}) is distinct from (to_jsonb(old) - ${allowedTransitionFields})`,
    'new.version is distinct from old.version + 1', 'new.revoked_at is null',
    'identity_session_revoke_transition_invalid',
  ]);
  const deleteAt = body.indexOf("if tg_op = 'delete' then");
  const immutableIdAt = body.indexOf('if new.id is distinct from old.id then');
  const terminalAt = body.indexOf("if old.status = 'revoked' and to_jsonb(new) is distinct from to_jsonb(old) then");
  const transitionAt = body.indexOf("if old.status = 'active' and new.status = 'revoked' and (");
  const returnAt = body.lastIndexOf('return new;');
  if (!(deleteAt >= 0 && deleteAt < immutableIdAt && immutableIdAt < terminalAt
      && terminalAt < transitionAt && transitionAt < returnAt)) {
    throw new Error('sesion terminal no conserva orden fail-closed');
  }
}

function exactSet(actual, expected, label) {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  if (JSON.stringify(a) !== JSON.stringify(e)) {
    throw new Error(`${label} fuera de allowlist: actual=${a.join(',')} esperado=${e.join(',')}`);
  }
}

const PLATFORM_CONTEXT_COLUMNS = Object.freeze([
  ['event_id', 'bigint', true, null],
  ['actor_session_id', 'uuid', true, null],
  ['actor_session_version', 'integer', true, null],
  ['release_sha', 'character(40)', true, null],
  ['expected_version', 'integer', true, null],
  ['command', 'character varying(64)', true, null],
  ['command_hash', 'character(64)', true, null],
  ['reason_code', 'character varying(64)', false, null],
  ['reason_hash', 'character(64)', false, null],
  ['created_at', 'timestamp with time zone', true, 'now()'],
]);

function canonicalConstraint(value) {
  return normalized(value)
    .replaceAll('public.', '')
    .replace(/::(?:character varying|character|bpchar|text)(?:\[\])?/g, '')
    .replace(/[()\s]/g, '');
}

function validatePlatformEventContext(evidence) {
  const columns = (evidence.platformContextColumns || []).map((row) => [
    row.name, normalized(row.type), row.notNull === true,
    row.defaultExpression == null ? null : normalized(row.defaultExpression),
  ]);
  if (JSON.stringify(columns) !== JSON.stringify(PLATFORM_CONTEXT_COLUMNS)) {
    throw new Error('columnas de platform event context con drift');
  }

  const constraints = new Map((evidence.platformContextConstraints || [])
    .map((row) => [row.name, row]));
  exactSet(constraints.keys(), [
    'tenant_identity_platform_event_context_pkey',
    'tenant_identity_platform_event_context_event_id_fkey',
    'tenant_identity_platform_event_context_actor_session_id_fkey',
    'tenant_identity_platform_event_context_session_version_ck',
    'tenant_identity_platform_event_context_expected_version_ck',
    'tenant_identity_platform_event_context_release_ck',
    'tenant_identity_platform_event_context_hash_ck',
    'tenant_identity_platform_event_context_reason_ck',
  ], 'constraints platform event context');
  for (const constraint of constraints.values()) {
    if (constraint.validated !== true) throw new Error(`constraint sin validar ${constraint.name}`);
  }
  const exact = (name, type, definition) => {
    const constraint = constraints.get(name);
    if (!constraint || constraint.type !== type
        || normalized(constraint.definition).replaceAll('public.', '') !== definition) {
      throw new Error(`constraint platform event context invalida ${name}`);
    }
  };
  exact('tenant_identity_platform_event_context_pkey', 'p', 'primary key (event_id)');
  exact('tenant_identity_platform_event_context_event_id_fkey', 'f',
    'foreign key (event_id) references tenant_iam_event(id) on delete restrict');
  exact('tenant_identity_platform_event_context_actor_session_id_fkey', 'f',
    'foreign key (actor_session_id) references tenant_identity_session(id) on delete restrict');

  const checks = new Map([
    ['tenant_identity_platform_event_context_session_version_ck', 'checkactor_session_version>0'],
    ['tenant_identity_platform_event_context_expected_version_ck', 'checkexpected_version>0'],
    ['tenant_identity_platform_event_context_release_ck', "checkrelease_sha~'^[a-f0-9]{40}$'"],
    ['tenant_identity_platform_event_context_hash_ck', "checkcommand_hash~'^[a-f0-9]{64}$'"],
  ]);
  for (const [name, definition] of checks) {
    const constraint = constraints.get(name);
    if (!constraint || constraint.type !== 'c'
        || canonicalConstraint(constraint.definition) !== definition) {
      throw new Error(`CHECK platform event context invalido ${name}`);
    }
  }
  const reason = constraints.get('tenant_identity_platform_event_context_reason_ck');
  const reasonDefinition = canonicalConstraint(reason?.definition);
  const expectedReasonDefinitions = new Set([
    "checkreason_codeisnullandreason_hashisnullorreason_codein'certify_data_plane','delivery_kill_switch'andreason_hash~'^[a-f0-9]{64}$'",
    "checkreason_codeisnullandreason_hashisnullorreason_code=anyarray['certify_data_plane','delivery_kill_switch']andreason_hash~'^[a-f0-9]{64}$'",
  ]);
  if (!reason || reason.type !== 'c' || !expectedReasonDefinitions.has(reasonDefinition)) {
    throw new Error('CHECK platform event context invalido tenant_identity_platform_event_context_reason_ck');
  }
}

export function validateTenantLifecycleMigrationSql(sql) {
  const body = normalized(sql);
  requireTokens('migracion 009', body, [
    'tenant_lifecycle_initialize_identity_policy_v1',
    'after insert on platform_tenant',
    'tenant_iam_event_enrich_create_tenant_v1',
    'identitypolicy',
    'tenant_exclusive_capability_membership_tenant_fk',
    'foreign key (membership_id, tenant_id)',
    'tenant_action_employment_active_membership_uk',
    'where active is true',
    'tenant_action_employment_active_contract_uk',
    'tenant_lifecycle_guard_revoked_session_v1',
    'before update or delete on tenant_identity_session',
    "if tg_op = 'delete' then",
    'identity_session_delete_forbidden',
    'new.id is distinct from old.id',
    'identity_session_id_immutable',
    "old.status = 'active' and new.status = 'revoked'",
    "array['status','revoked_at','revoked_by_user_email','version']",
    'new.version is distinct from old.version + 1',
    'new.revoked_at is null',
    'identity_session_revoke_transition_invalid',
    'to_jsonb(new) is distinct from to_jsonb(old)',
    'identity_platform_command_requires_v2',
    'tenant_identity_platform_event_context',
    'tenant_identity_platform_event_context_reason_ck',
    'tenant_identity_lookup_core_009',
    'tenant_identity_command_replay_core_009',
    'tenant_identity_view_core_009',
    'tenant_identity_platform_invitation_delivery_v2',
    'tenant_identity_platform_command_replay_v2',
    'tenant_identity_platform_invitations_view_v2',
    'tenant_identity_apply_platform_command_v2',
    'tenant_action_apply_provisioning_command_v2',
    'tenant_action_lookup_employment_v2',
    'p_limit is null or p_limit not between 1 and 20',
    'tenant_iam_admin_view_v3',
    "jsonb_build_array('revoke_employment_link')",
    'revoke all privileges on all sequences in schema public',
  ]);
  for (const forbidden of [
    /ALTER\s+ROLE\b/i,
    /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b/i,
    /GRANT\s+EXECUTE[\s\S]+tenant_identity_apply_command_core_009[\s\S]+TO\s+municontrol_actions_runtime_app/i,
    /GRANT\s+EXECUTE[\s\S]+tenant_identity_(?:lookup|command_replay|view)_core_009[\s\S]+TO\s+municontrol_actions_runtime_app/i,
    /GRANT\s+EXECUTE[\s\S]+tenant_action_apply_provisioning_command\(text,uuid,uuid,uuid/i,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE\s+(?:TABLE\s+)?)\s+(?:public\.)?(?:payroll_run|payroll_snapshot_assignment|payroll_monthly_fact)\b/i,
  ]) {
    if (forbidden.test(sql)) throw new Error(`migracion 009 contiene operacion prohibida ${forbidden}`);
  }
  const genericStart = body.indexOf('create or replace function tenant_identity_apply_command(');
  const platformStart = body.indexOf('create or replace function tenant_identity_apply_platform_command_v2', genericStart);
  const generic = body.slice(genericStart, platformStart);
  requireTokens('wrapper identity runtime', generic, [
    "p_command is null or p_command not in ( 'begin_activation'",
    'p_idempotency_key is null', "p_command_hash !~ '^[a-f0-9]{64}$'",
    'replay.command is distinct from p_command',
    'tenant_identity_apply_command_core_009',
  ]);
  for (const forbidden of [
    'issue_invitation','confirm_delivery','delivery_failed','bind_legacy_access',
    'bind_source','certify_data_plane','set_delivery_ready',
  ]) {
    if (!generic.includes(`'${forbidden}'`)) throw new Error(`wrapper identity no cierra ${forbidden}`);
  }
  const invitationsStart = body.indexOf('create or replace function tenant_identity_platform_invitations_view_v2');
  const invitationsEnd = body.indexOf('create or replace function tenant_identity_apply_command(', invitationsStart);
  const invitations = body.slice(invitationsStart, invitationsEnd);
  if (invitationsStart < 0 || invitationsEnd < 0 || /\bdeclare\b[\s\S]*\bdeclare\b/.test(invitations)) {
    throw new Error('view de invitaciones v2 no compila por bloque DECLARE invalido');
  }
  requireTokens('lookup identity cerrado', body, [
    "p_operation not in ('invitation','login','flow')",
    'tenant_identity_lookup_core_009',
    'identity_platform_replay_requires_v2',
  ]);
  requireTokens('replay platform v2', body, [
    'tenant_identity_platform_event_context',
    'replay_context.actor_session_id is distinct from p_actor_session_id',
    'replay_context.actor_session_version is distinct from p_actor_session_version',
    'replay_context.release_sha is distinct from p_release_sha',
    "replay.result->'invitation'->>'id'",
  ]);
  return true;
}

function validateFunction(row, signature) {
  if (!row) throw new Error(`funcion ausente ${signature}`);
  if (row.securityDefiner !== true || row.ownedByCurrentUser !== true || row.ownerIsRuntime === true
      || row.publicExecuteRevoked !== true) {
    throw new Error(`funcion insegura ${signature}`);
  }
  const searchPath = Array.isArray(row.config) ? row.config.join(',') : String(row.config || '');
  if (!searchPath.includes('search_path=public, pg_temp')) {
    throw new Error(`search_path inseguro ${signature}`);
  }
}

export function validateTenantLifecycleEvidence(evidence) {
  const functions = new Map((evidence.functions || []).map((row) => [row.signature, row]));
  for (const signature of SECURITY_FUNCTIONS) validateFunction(functions.get(signature), signature);
  const definition = (signature) => functions.get(signature)?.definition || '';
  requireTokens('policy trigger', definition(TENANT_LIFECYCLE_SIGNATURES.policyTrigger), [
    'insert into tenant_identity_policy', 'false, false, null, null, null, null, 1',
  ]);
  requireTokens('create event trigger', definition(TENANT_LIFECYCLE_SIGNATURES.createEventTrigger), [
    "new.command = 'create_tenant'", 'tenant_lifecycle_policy_not_closed',
    "new.result := new.result || jsonb_build_object('identitypolicy'",
  ]);
  validateRevokedSessionGuard(definition(TENANT_LIFECYCLE_SIGNATURES.revokedSession));
  requireTokens('binding revoke historico', definition(TENANT_LIFECYCLE_SIGNATURES.bindingGuard), [
    "tg_op = 'update' and old.active is true and new.active is false",
    'return new', 'tenant_action_source_binding_required',
  ]);
  requireTokens('lookup identity runtime', definition(TENANT_LIFECYCLE_SIGNATURES.identityLookup), [
    "p_operation not in ('invitation','login','flow')", 'tenant_identity_lookup_core_009',
  ]);
  requireTokens('replay identity legacy cerrado', definition(TENANT_LIFECYCLE_SIGNATURES.identityLegacyReplay), [
    'identity_platform_replay_requires_v2',
  ]);
  requireTokens('view identity runtime', definition(TENANT_LIFECYCLE_SIGNATURES.identityView), [
    "p_resource not in ('bootstrap','sessions')", 'tenant_identity_view_core_009',
  ]);
  requireTokens('lookup delivery platform', definition(TENANT_LIFECYCLE_SIGNATURES.identityDeliveryLookup), [
    'tenant_lifecycle_assert_platform_capability_v2', "'platform.users.invite'",
    "'invitation_delivery'", 'tenant_identity_lookup_core_009',
  ]);
  requireTokens('replay platform', definition(TENANT_LIFECYCLE_SIGNATURES.identityPlatformReplay), [
    'tenant_lifecycle_assert_platform_capability_v2', 'tenant_identity_platform_event_context',
    'replay_context.actor_session_id is distinct from p_actor_session_id',
    'replay_context.actor_session_version is distinct from p_actor_session_version',
    'replay_context.release_sha is distinct from p_release_sha',
    "replay.result->'invitation'->>'id'", 'tenant_identity_assert_issue_replay_current_v1',
    'tenant_identity_command_replay_core_009',
  ]);
  requireTokens('estado replay issue', definition(TENANT_LIFECYCLE_SIGNATURES.identityIssueReplayState), [
    "membership.status <> 'invited'", 'policy_row.certified_release_sha = p_release_sha',
    "secret.status = 'pending'", 'policy.invitation_delivery_ready is true',
    "secret.status = 'active'", "invitation.status = 'issued'",
    'secret.delivery_attempt_id is distinct from expected_attempt', 'for share',
  ]);
  requireTokens('invitations platform', definition(TENANT_LIFECYCLE_SIGNATURES.identityInvitationsView), [
    "'platform.users.read'", "assignment.role_key = 'platform_owner'",
    'policy.certified_release_sha = p_release_sha', "mapping.capability_key = 'platform.users.invite'",
  ]);
  requireTokens('identity platform apply', definition(TENANT_LIFECYCLE_SIGNATURES.identityPlatform), [
    'tenant_identity_platform_event_context',
    'replay_context.actor_session_id is distinct from p_actor_session_id',
    'insert into tenant_identity_platform_event_context',
    'tenant_identity_assert_issue_replay_current_v1',
    "'delivery_kill_switch'", "convert_to(btrim(p_payload->>'reason'), 'utf8')",
  ]);
  requireTokens('provisioning v2', definition(TENANT_LIFECYCLE_SIGNATURES.provisioning), [
    'tenant_lifecycle_assert_platform_capability_v2',
    "membership.status not in ('active','suspended')",
    'tenant_action_employment_already_linked',
    'update tenant_action_employment_link set active = false',
    'insert into tenant_action_employment_link',
    'existing_event.command_hash is distinct from p_command_hash',
    'existing_event.actor_session_id is distinct from p_actor_session_id',
    'existing_event.actor_session_version is distinct from p_actor_session_version',
    'existing_event.release_sha is distinct from p_release_sha',
    'authority.version is distinct from existing_event.resulting_version',
    'tenant_action_authority_snapshot(membership.id) is distinct from existing_event.after_snapshot',
    'policy.certified_release_sha = p_release_sha',
    "p_command = 'link_employment'",
    "existing_event.after_snapshot->'employmentlink'->>'sourcebindingid'",
    "p_command = 'replace_action_scopes' and exists",
    "existing_event.after_snapshot->'scopes'",
  ]);
  requireTokens('lookup gobernado', definition(TENANT_LIFECYCLE_SIGNATURES.lookupEmployment), [
    'p_limit is null', 'limit p_limit', "'tenantid', membership.tenant_id",
    'batch.legacy_import_run_id', 'employee.import_run_id = batch.legacy_import_run_id',
  ]);
  requireTokens('view v3', definition(TENANT_LIFECYCLE_SIGNATURES.adminView), [
    'tenant_ready is not true', "'status', 'stale'", 'active_link.source_binding_id = binding_row.id',
    "jsonb_build_array('revoke_employment_link')",
    "'lookup_employment','link_employment','replace_action_scopes'",
    "'scopes', case when tenant_ready is true then",
    'scope.source_binding_id = binding_row.id',
  ]);
  if (evidence.missingPolicies !== 0) throw new Error('existen tenants sin identity policy');
  if (evidence.crossTenantExclusive !== 0) throw new Error('exclusividad cross-tenant');
  if (evidence.duplicateActiveMembership !== 0 || evidence.duplicateActiveContract !== 0) {
    throw new Error('vinculos laborales activos duplicados');
  }
  const fk = evidence.exclusiveForeignKey;
  if (!fk || fk.validated !== true || normalized(fk.definition)
    !== 'foreign key (membership_id, tenant_id) references tenant_membership(id, tenant_id) on delete restrict') {
    throw new Error('FK compuesta de exclusividad invalida');
  }
  if (evidence.employmentPrimaryKey !== 'id') throw new Error('PK historica de vinculo invalida');
  for (const index of [evidence.activeMembershipIndex, evidence.activeContractIndex]) {
    const predicate = normalized(index?.predicate);
    if (!index || index.unique !== true || index.valid !== true || index.ready !== true
      || !new Set(['active is true', '(active is true)']).has(predicate)) {
      throw new Error('indice parcial activo invalido');
    }
  }
  if (JSON.stringify(evidence.activeMembershipIndex?.columns) !== JSON.stringify(['membership_id'])
      || JSON.stringify(evidence.activeContractIndex?.columns)
        !== JSON.stringify(['tenant_id', 'employment_contract_id'])) {
    throw new Error('columnas de indices parciales activas invalidas');
  }
  if (evidence.platformContextDrift !== 0) throw new Error('contexto platform event con drift');
  validatePlatformEventContext(evidence);
  const expectedTriggers = new Map([
    ['platform_tenant_initialize_identity_policy_v1', ['platform_tenant','tenant_lifecycle_initialize_identity_policy_v1','after',['insert']]],
    ['tenant_iam_event_enrich_create_tenant_v1', ['tenant_iam_event','tenant_lifecycle_enrich_create_tenant_event_v1','before',['insert']]],
    ['tenant_action_employment_history_guard_v1', ['tenant_action_employment_link','tenant_lifecycle_guard_employment_history_v1','before',['delete','update']]],
    ['tenant_identity_session_revoked_terminal_v1', ['tenant_identity_session','tenant_lifecycle_guard_revoked_session_v1','before',['delete','update']]],
    ['tenant_identity_platform_event_context_append_only', ['tenant_identity_platform_event_context','tenant_iam_reject_change','before',['delete','update']]],
    ['tenant_action_employment_binding_guard', ['tenant_action_employment_link','tenant_action_validate_binding','before',['insert','update']]],
  ]);
  const triggers = evidence.triggers || [];
  for (const [name, [tableName, functionName, timing, events]] of expectedTriggers) {
    const matching = triggers.filter((row) => row.name === name);
    const trigger = matching[0];
    if (matching.length !== 1 || !['O','A'].includes(trigger?.enabled)) {
      throw new Error(`trigger ausente/inactivo ${name}`);
    }
    if (trigger.tableName !== tableName || trigger.functionSchema !== 'public'
        || trigger.functionName !== functionName || trigger.noArguments !== true
        || trigger.notConstraint !== true || trigger.timing !== timing || trigger.rowLevel !== true
        || JSON.stringify(trigger.events) !== JSON.stringify(events)) {
      throw new Error(`trigger ${name} no conserva binding semantico exacto`);
    }
  }
  return true;
}

export function validateTenantLifecycleRuntimeAclEvidence(evidence) {
  const role = evidence.runtimeRole;
  if (!role || role.canLogin !== true || role.inherit === true || role.superuser === true
      || role.bypassRls === true || role.createDb === true || role.createRole === true
      || role.replication === true || role.membershipCount !== 0
      || role.schemaUsage !== true || role.schemaCreate === true) {
    throw new Error('rol runtime no conserva aislamiento LOGIN NOINHERIT');
  }
  const incoming = (evidence.roleMemberships || []).filter((row) => row.direction === 'member_of_runtime');
  const outgoing = (evidence.roleMemberships || []).filter((row) => row.direction === 'granted_to_runtime');
  if (outgoing.length || incoming.length > 1 || incoming.some((row) => (
    row.memberIsCurrentUser !== true || row.adminOption !== true
      || row.inheritOption !== false || row.setOption !== false
      || row.memberOwnsApprovedFunctions !== true
  ))) throw new Error('membresias del rol runtime permiten escalamiento');
  const executable = (evidence.runtimeFunctions || [])
    .filter((row) => row.securityDefiner === true && row.execute === true)
    .map((row) => row.signature);
  exactSet(executable, EXPECTED_RUNTIME_FUNCTIONS, 'EXECUTE runtime 009');
  if ((evidence.unexpectedSecurityDefiners || []).length) {
    throw new Error('runtime ejecuta SECURITY DEFINER fuera de allowlist');
  }
  for (const relation of evidence.relations || []) {
    if (relation.canSelect || relation.canInsert || relation.canUpdate || relation.canReferences
      || relation.canDelete || relation.canTruncate || relation.canTrigger) {
      throw new Error(`runtime conserva privilegio directo en ${relation.name}`);
    }
  }
  for (const sequence of evidence.sequences || []) {
    if (sequence.canUsage || sequence.canSelect || sequence.canUpdate) {
      throw new Error(`runtime conserva privilegio de secuencia ${sequence.name}`);
    }
  }
  return true;
}

async function expectedPrerequisiteChecksums() {
  return new Map(await Promise.all(PREREQUISITES.map(async ([version, url]) => [
    version, createHash('sha256').update(await readFile(url, 'utf8')).digest('hex'),
  ])));
}

async function verifyPrerequisites(client) {
  const expected = await expectedPrerequisiteChecksums();
  const result = await client.query(
    'SELECT version, checksum_sha256 FROM schema_migrations WHERE version = ANY($1::text[])',
    [[...expected.keys()]],
  );
  const installed = new Map(rows(result).map((row) => [row.version, row.checksum_sha256]));
  for (const [version, checksum] of expected) {
    if (installed.get(version) !== checksum) throw new Error(`prerequisito ausente o con drift ${version}`);
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
      pg_get_functiondef(function_row.oid) AS definition
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE namespace.nspname = 'public'
      AND format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[])
  `, [RUNTIME_ROLE, SECURITY_FUNCTIONS]);
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::integer FROM platform_tenant tenant LEFT JOIN tenant_identity_policy policy
        ON policy.tenant_id = tenant.id WHERE policy.tenant_id IS NULL) AS "missingPolicies",
      (SELECT count(*)::integer FROM tenant_exclusive_capability assignment
        JOIN tenant_membership membership ON membership.id = assignment.membership_id
        WHERE assignment.tenant_id <> membership.tenant_id) AS "crossTenantExclusive",
      (SELECT count(*)::integer FROM (SELECT membership_id FROM tenant_action_employment_link
        WHERE active IS TRUE GROUP BY membership_id HAVING count(*) > 1) duplicate) AS "duplicateActiveMembership",
      (SELECT count(*)::integer FROM (SELECT tenant_id, employment_contract_id
        FROM tenant_action_employment_link WHERE active IS TRUE
        GROUP BY tenant_id, employment_contract_id HAVING count(*) > 1) duplicate) AS "duplicateActiveContract",
      (SELECT count(*)::integer FROM tenant_identity_platform_event_context context
        JOIN tenant_iam_event event ON event.id = context.event_id
        WHERE event.command IS DISTINCT FROM context.command
          OR event.command_hash IS DISTINCT FROM context.command_hash) AS "platformContextDrift"
  `);
  const foreignKey = await client.query(`
    SELECT constraint_row.convalidated AS validated,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.tenant_exclusive_capability'::regclass
      AND constraint_row.conname = 'tenant_exclusive_capability_membership_tenant_fk'
  `);
  const primaryKey = await client.query(`
    SELECT string_agg(attribute.attname, ',' ORDER BY key_column.ordinality) AS columns
    FROM pg_constraint constraint_row
    JOIN unnest(constraint_row.conkey) WITH ORDINALITY key_column(attnum, ordinality) ON true
    JOIN pg_attribute attribute ON attribute.attrelid = constraint_row.conrelid
      AND attribute.attnum = key_column.attnum
    WHERE constraint_row.conrelid = 'public.tenant_action_employment_link'::regclass
      AND constraint_row.contype = 'p'
  `);
  const indexes = await client.query(`
    SELECT index_row.relname AS name, index_meta.indisunique AS unique,
      index_meta.indisvalid AS valid, index_meta.indisready AS ready,
      pg_get_expr(index_meta.indpred, index_meta.indrelid, true) AS predicate,
      to_jsonb(ARRAY(SELECT attribute.attname
        FROM unnest(index_meta.indkey) WITH ORDINALITY key_column(attnum, ordinality)
        JOIN pg_attribute attribute ON attribute.attrelid = index_meta.indrelid
          AND attribute.attnum = key_column.attnum
        WHERE key_column.ordinality <= index_meta.indnkeyatts
        ORDER BY key_column.ordinality)) AS columns
    FROM pg_index index_meta
    JOIN pg_class index_row ON index_row.oid = index_meta.indexrelid
    JOIN pg_namespace namespace ON namespace.oid = index_row.relnamespace
    WHERE namespace.nspname = 'public' AND index_row.relname = ANY($1::text[])
  `, [['tenant_action_employment_active_membership_uk','tenant_action_employment_active_contract_uk']]);
  const platformContextColumns = await client.query(`
    SELECT attribute.attname AS name,
      format_type(attribute.atttypid, attribute.atttypmod) AS type,
      attribute.attnotnull AS "notNull",
      pg_get_expr(attribute_default.adbin, attribute_default.adrelid, true) AS "defaultExpression"
    FROM pg_attribute attribute
    LEFT JOIN pg_attrdef attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    WHERE attribute.attrelid = 'public.tenant_identity_platform_event_context'::regclass
      AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE
    ORDER BY attribute.attnum
  `);
  const platformContextConstraints = await client.query(`
    SELECT constraint_row.conname AS name, constraint_row.contype AS type,
      constraint_row.convalidated AS validated,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.tenant_identity_platform_event_context'::regclass
    ORDER BY constraint_row.conname
  `);
  const triggers = await client.query(`
    SELECT trigger_row.tgname AS name, trigger_row.tgenabled AS enabled,
      table_row.relname AS "tableName", function_namespace.nspname AS "functionSchema",
      function_row.proname AS "functionName", trigger_row.tgnargs = 0 AS "noArguments",
      trigger_row.tgconstraint = 0 AS "notConstraint",
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
    JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = table_row.relnamespace
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace function_namespace ON function_namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND trigger_row.tgisinternal IS FALSE
      AND trigger_row.tgname = ANY($1::text[])
  `, [[
    'platform_tenant_initialize_identity_policy_v1','tenant_iam_event_enrich_create_tenant_v1',
    'tenant_action_employment_history_guard_v1','tenant_identity_session_revoked_terminal_v1',
    'tenant_identity_platform_event_context_append_only',
    'tenant_action_employment_binding_guard',
  ]]);
  const countRow = rows(counts)[0] || {};
  const indexMap = new Map(rows(indexes).map((row) => [row.name, row]));
  return {
    functions: rows(functions), ...countRow,
    exclusiveForeignKey: rows(foreignKey)[0],
    employmentPrimaryKey: rows(primaryKey)[0]?.columns,
    activeMembershipIndex: indexMap.get('tenant_action_employment_active_membership_uk'),
    activeContractIndex: indexMap.get('tenant_action_employment_active_contract_uk'),
    platformContextColumns: rows(platformContextColumns),
    platformContextConstraints: rows(platformContextConstraints),
    triggers: rows(triggers),
  };
}

async function collectRuntimeAclEvidence(client) {
  const runtimeRole = await client.query(`
    SELECT role_row.rolcanlogin AS "canLogin", role_row.rolinherit AS inherit,
      role_row.rolsuper AS superuser, role_row.rolbypassrls AS "bypassRls",
      role_row.rolcreatedb AS "createDb", role_row.rolcreaterole AS "createRole",
      role_row.rolreplication AS replication,
      (SELECT count(*)::integer FROM pg_auth_members membership WHERE membership.member = role_row.oid) AS "membershipCount",
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
       FROM pg_proc function_row JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
       WHERE format('%s.%s(%s)', namespace.nspname, function_row.proname,
         replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[])
      ) AS "memberOwnsApprovedFunctions"
    FROM pg_auth_members membership
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE membership.member = runtime_role.oid OR membership.roleid = runtime_role.oid
  `, [RUNTIME_ROLE, SECURITY_FUNCTIONS]);
  const runtimeFunctions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS execute
    FROM pg_proc function_row JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND function_row.prosecdef IS TRUE
  `, [RUNTIME_ROLE]);
  const unexpectedSecurityDefiners = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature
    FROM pg_proc function_row JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND function_row.prosecdef IS TRUE
      AND has_function_privilege($1, function_row.oid, 'EXECUTE')
      AND NOT (format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[]))
  `, [RUNTIME_ROLE, [...EXPECTED_RUNTIME_FUNCTIONS]]);
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
    runtimeFunctions: rows(runtimeFunctions),
    unexpectedSecurityDefiners: rows(unexpectedSecurityDefiners),
    relations: rows(relations), sequences: rows(sequences),
  };
}

export async function verifyTenantLifecycleBaseEvidence(client) {
  validateTenantLifecycleEvidence(await collectEvidence(client));
}

export async function verifyTenantLifecycleFinalAcl(client) {
  const future = await client.query(
    'SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1) AS installed',
    ['010-governed-time-source-registry'],
  );
  if (rows(future)[0]?.installed === true) {
    const { verifyTimeSourceFinalAcl } = await import('./apply-governed-time-source-registry-schema.mjs');
    await verifyTimeSourceFinalAcl(client);
    return;
  }
  await verifyTenantLifecycleBaseEvidence(client);
  validateTenantLifecycleRuntimeAclEvidence(await collectRuntimeAclEvidence(client));
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateTenantLifecycleMigrationSql(migration);
  const checksum = createHash('sha256').update(migration).digest('hex');
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directCanonicalDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:lifecycle-009'))");
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [TENANT_LIFECYCLE_MIGRATION_VERSION],
    );
    if (existing.rowCount && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${TENANT_LIFECYCLE_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      for (const [index, statement] of statements.entries()) {
        try { await client.query(statement); } catch (error) {
          throw new Error(
            `migracion ${TENANT_LIFECYCLE_MIGRATION_VERSION} sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [TENANT_LIFECYCLE_MIGRATION_VERSION, checksum],
      );
    }
    await verifyTenantLifecycleFinalAcl(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${TENANT_LIFECYCLE_MIGRATION_VERSION}: ya aplicada y verificada (SHA-256 ${checksum})`
      : `${TENANT_LIFECYCLE_MIGRATION_VERSION}: aplicada (${statements.length} sentencias, SHA-256 ${checksum})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
