import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

const MIGRATION_VERSION = '006-tenant-action-authority';
const READ_FACADE_MIGRATION_VERSION = '007-action-center-read-facades';
const MIGRATION_URL = new URL('./migrations/006-tenant-action-authority.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

const APPLY_SIGNATURE = 'public.action_center_apply_tenant_command(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)';
const RESOLVE_SIGNATURE = 'public.action_center_resolve_tenant_principal(text,uuid,uuid)';
const PROVISION_SIGNATURE = 'public.tenant_action_apply_provisioning_command(text,uuid,uuid,uuid,text,uuid,text,integer,jsonb)';
const EXCLUSIVE_SIGNATURE = 'public.tenant_action_assert_exclusive_capability(text,uuid,uuid,text)';
const LEGACY_APPLY_SIGNATURE = 'public.action_center_apply_command(text,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)';
const IAM_SESSION_ASSERT_SIGNATURE = 'public.tenant_iam_assert_platform_session_v2(text,uuid,integer)';
const IAM_ADMIN_VIEW_V2_SIGNATURE = 'public.tenant_iam_admin_view_v2(text,uuid,integer,text,integer)';
const IAM_ADMIN_APPLY_V2_SIGNATURE = 'public.tenant_iam_apply_command_v2(text,uuid,integer,text,uuid,text,integer,jsonb)';
const IAM_ADMIN_VIEW_LEGACY_SIGNATURE = 'public.tenant_iam_admin_view(text,text,integer)';
const IAM_ADMIN_APPLY_LEGACY_SIGNATURE = 'public.tenant_iam_apply_command(text,text,uuid,text,integer,jsonb)';
const READ_FACADE_SIGNATURES = Object.freeze([
  'public.action_center_context_v2(text,uuid,integer,text,uuid,uuid)',
  'public.action_center_tenant_bootstrap_v2(text,uuid,integer,text,uuid,uuid,text)',
  'public.action_center_tenant_list_v2(text,uuid,integer,text,uuid,uuid,text,text,text,integer,integer)',
  'public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)',
  'public.action_center_tenant_routing_v2(text,uuid,integer,text,uuid,uuid,uuid)',
]);

const TRIGGER_CONTRACT = Object.freeze({
  tenant_action_authority_event_append_only: Object.freeze({
    tableName: 'tenant_action_authority_event', functionName: 'tenant_action_reject_audit_change',
    definitionTokens: Object.freeze(['before', 'update', 'delete', 'for each row']),
  }),
  tenant_action_membership_initialize: Object.freeze({
    tableName: 'tenant_membership', functionName: 'tenant_action_initialize_authority',
    definitionTokens: Object.freeze(['after insert', 'for each row']),
  }),
  tenant_action_employment_binding_guard: Object.freeze({
    tableName: 'tenant_action_employment_link', functionName: 'tenant_action_validate_binding',
    definitionTokens: Object.freeze(['before', 'insert', 'update', 'for each row']),
  }),
  tenant_action_scope_binding_guard: Object.freeze({
    tableName: 'tenant_action_area_scope', functionName: 'tenant_action_validate_binding',
    definitionTokens: Object.freeze(['before', 'insert', 'update', 'for each row']),
  }),
});

const INDEX_CONTRACT = Object.freeze({
  tenant_membership_id_tenant_id_uk: Object.freeze({
    tableName: 'tenant_membership', unique: true, partial: false,
    definitionTokens: Object.freeze(['using btree', 'id', 'tenant_id']), predicateTokens: Object.freeze([]),
  }),
  tenant_action_area_scope_identity_uk: Object.freeze({
    tableName: 'tenant_action_area_scope', unique: true, partial: false,
    definitionTokens: Object.freeze([
      'using btree', 'membership_id', 'capability_key', 'source_binding_id', 'scope_level',
      'coalesce', 'organization_unit_source_id', 'sector_source_id',
    ]),
    predicateTokens: Object.freeze([]),
  }),
  tenant_action_area_scope_active_idx: Object.freeze({
    tableName: 'tenant_action_area_scope', unique: false, partial: true,
    definitionTokens: Object.freeze(['using btree', 'membership_id', 'capability_key']),
    predicateTokens: Object.freeze(['active', 'true']),
  }),
  action_case_tenant_queue_idx: Object.freeze({
    tableName: 'action_case', unique: false, partial: false,
    definitionTokens: Object.freeze([
      'using btree', 'tenant_id', 'source_binding_id', 'case_type', 'status', 'updated_at desc',
    ]),
    predicateTokens: Object.freeze([]),
  }),
});

const CONSTRAINT_CONTRACT = Object.freeze({
  action_case_tenant_fk: Object.freeze({
    tableName: 'action_case', type: 'f',
    definitionTokens: Object.freeze(['foreign key', 'tenant_id', 'references platform_tenant', 'id', 'on delete restrict']),
  }),
  action_case_source_binding_fk: Object.freeze({
    tableName: 'action_case', type: 'f',
    definitionTokens: Object.freeze([
      'foreign key', 'tenant_id', 'source_binding_id', 'references platform_tenant_source_binding',
      'on delete restrict',
    ]),
  }),
  action_case_event_binding_fk: Object.freeze({
    tableName: 'action_case_event', type: 'f',
    definitionTokens: Object.freeze([
      'foreign key', 'tenant_id', 'source_binding_id', 'references platform_tenant_source_binding',
      'on delete restrict',
    ]),
  }),
  action_case_event_membership_fk: Object.freeze({
    tableName: 'action_case_event', type: 'f',
    definitionTokens: Object.freeze([
      'foreign key', 'actor_membership_id', 'tenant_id', 'references tenant_membership',
      'on delete restrict',
    ]),
  }),
});

const FORBIDDEN_RUNTIME_FUNCTIONS = Object.freeze([
  LEGACY_APPLY_SIGNATURE,
  EXCLUSIVE_SIGNATURE,
  'public.action_center_reject_change()',
  'public.action_center_reject_delete()',
  'public.action_center_valid_leave_payload(jsonb)',
  'public.action_center_actor_authorized(text,text,text,uuid,bigint,text,text,text,text)',
  'public.action_center_set_command_context(text,text,uuid,uuid,text,uuid,text,jsonb)',
  'public.action_center_require_case_context()',
  'public.action_center_require_event_context()',
  'public.action_center_log_case_event()',
  'public.action_center_validate_case_update()',
  'public.tenant_iam_is_platform_owner(text)',
  'public.tenant_iam_effective_capabilities(uuid)',
  'public.tenant_iam_assert_no_sod_conflict(uuid)',
  'public.tenant_action_reject_audit_change()',
  'public.tenant_action_initialize_authority()',
  'public.tenant_action_validate_binding()',
  'public.action_center_set_tenant_command_context(text,text,uuid,uuid,uuid,uuid,uuid,text,uuid,text,jsonb)',
  'public.action_center_tenant_actor_authorized(text,uuid,uuid,text,uuid,bigint,text,text,text,text)',
  'public.tenant_action_authority_snapshot(uuid)',
  'public.tenant_action_membership_configured_capabilities(uuid)',
  IAM_SESSION_ASSERT_SIGNATURE,
  IAM_ADMIN_VIEW_LEGACY_SIGNATURE,
  IAM_ADMIN_APPLY_LEGACY_SIGNATURE,
]);

const DIRECT_RUNTIME_RELATIONS = Object.freeze([
  'tenant_action_authority', 'tenant_action_employment_link',
  'tenant_action_area_scope', 'tenant_action_authority_event',
  'action_case', 'action_case_event', 'action_command_context',
]);

const REQUIRED_RUNTIME_COLUMNS = Object.freeze([
  'action_case.tenant_id', 'action_case.source_binding_id',
  'action_case_event.tenant_id', 'action_case_event.source_binding_id',
  'employment_contract.source_system', 'employment_contract.source_batch_id',
  'source_import_batch.source_database',
]);

export const TENANT_ACTION_SCHEMA_CONTRACT = Object.freeze({
  tables: Object.freeze([
    'tenant_action_authority', 'tenant_action_employment_link',
    'tenant_action_area_scope', 'tenant_action_authority_event',
  ]),
  functions: Object.freeze([
    'public.tenant_iam_effective_capabilities(uuid)',
    'public.tenant_action_reject_audit_change()',
    'public.tenant_action_initialize_authority()',
    'public.tenant_action_validate_binding()',
    'public.action_center_set_tenant_command_context(text,text,uuid,uuid,uuid,uuid,uuid,text,uuid,text,jsonb)',
    'public.action_center_resolve_tenant_principal(text,uuid,uuid)',
    'public.action_center_tenant_actor_authorized(text,uuid,uuid,text,uuid,bigint,text,text,text,text)',
    APPLY_SIGNATURE,
    'public.tenant_action_authority_snapshot(uuid)',
    'public.tenant_action_membership_configured_capabilities(uuid)',
    PROVISION_SIGNATURE,
    EXCLUSIVE_SIGNATURE,
    IAM_SESSION_ASSERT_SIGNATURE,
    IAM_ADMIN_VIEW_V2_SIGNATURE,
    IAM_ADMIN_APPLY_V2_SIGNATURE,
    IAM_ADMIN_VIEW_LEGACY_SIGNATURE,
    IAM_ADMIN_APPLY_LEGACY_SIGNATURE,
  ]),
  runtimeFunctions: Object.freeze([
    RESOLVE_SIGNATURE, APPLY_SIGNATURE, PROVISION_SIGNATURE,
    IAM_ADMIN_VIEW_V2_SIGNATURE, IAM_ADMIN_APPLY_V2_SIGNATURE,
  ]),
  forbiddenRuntimeFunctions: FORBIDDEN_RUNTIME_FUNCTIONS,
  indexes: Object.freeze(Object.keys(INDEX_CONTRACT)),
  triggers: Object.freeze(Object.keys(TRIGGER_CONTRACT)),
});

export const TENANT_ACTION_SEMANTIC_CONTRACT = Object.freeze({
  triggers: TRIGGER_CONTRACT,
  indexes: INDEX_CONTRACT,
  constraints: CONSTRAINT_CONTRACT,
});

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function definition(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function requireTokens(resourceType, resourceName, value, tokens) {
  const normalized = definition(value);
  for (const token of tokens) {
    if (!normalized.includes(definition(token))) {
      throw new Error(`semántica inválida: ${resourceType} ${resourceName} no contiene ${token}`);
    }
  }
}

function exactlyOneByName(values, name, resourceType) {
  const matches = values.filter((row) => row.name === name);
  if (matches.length !== 1) {
    throw new Error(`semántica inválida: ${resourceType} ${name} tiene ${matches.length} definiciones`);
  }
  return matches[0];
}

export function validateTenantActionEvidence(evidence) {
  const contract = TENANT_ACTION_SCHEMA_CONTRACT;
  const tables = new Set(evidence.tables || []);
  for (const table of contract.tables) if (!tables.has(table)) throw new Error(`tabla action tenant ausente: ${table}`);

  const functions = new Map((evidence.functions || []).map((row) => [row.signature, row]));
  for (const signature of contract.functions) {
    const row = functions.get(signature);
    if (!row || row.securityDefiner !== true || row.ownedByCurrentUser !== true
        || row.publicExecuteRevoked !== true
        || !String(row.config || '').includes('search_path=public, pg_temp')) {
      throw new Error(`funcion action tenant insegura o ausente: ${signature}`);
    }
  }
  const effective = definition(functions.get('public.tenant_iam_effective_capabilities(uuid)')?.definition);
  for (const token of ["membership.status = 'active'", "tenant.status = 'active'", "scope_kind = 'tenant'"]) {
    if (!effective.includes(token)) throw new Error(`effective capabilities no falla cerrado: ${token}`);
  }
  const bindingGuard = definition(functions.get('public.tenant_action_validate_binding()')?.definition);
  for (const token of [
    'row_payload := to_jsonb(new)',
    "if tg_table_name = 'tenant_action_employment_link' then",
    "elsif tg_table_name = 'tenant_action_area_scope' then",
    "row_payload->>'employment_contract_id'",
    "row_payload->>'company_id'",
  ]) {
    if (!bindingGuard.includes(token)) throw new Error(`binding guard tenant no separa records: ${token}`);
  }
  for (const forbiddenField of ['new.employment_contract_id', 'new.company_id']) {
    if (bindingGuard.includes(forbiddenField)) {
      throw new Error(`binding guard tenant referencia campo NEW polimorfico: ${forbiddenField}`);
    }
  }
  if (bindingGuard.indexOf("if tg_table_name = 'tenant_action_employment_link' then")
      > bindingGuard.indexOf("row_payload->>'employment_contract_id'")
      || bindingGuard.indexOf("elsif tg_table_name = 'tenant_action_area_scope' then")
      > bindingGuard.indexOf("row_payload->>'company_id'")) {
    throw new Error('binding guard tenant evalua campo especifico fuera de su rama');
  }
  const apply = definition(functions.get(APPLY_SIGNATURE)?.definition);
  for (const token of [
    'p_tenant_id', 'p_membership_id', 'source_binding_id', 'from tenant_action_employment_link link',
    'tenant_identity_session', 'p_actor_session_id', 'p_actor_session_version',
    "session.source = 'membership'", "session.auth_level in ('mfa', 'recovery')",
    'session.identity_version', 'policy.certified_release_sha = lower(p_release_sha)',
    'from tenant_action_authority authority', 'for share',
  ]) {
    if (!apply.includes(token)) throw new Error(`apply tenant sin frontera ${token}`);
  }
  if (apply.includes('actor.role')) throw new Error('apply tenant recarga autoridad desde internal_users.role');
  const sessionLock = apply.indexOf('from tenant_identity_session session');
  const membershipLock = apply.indexOf('select * into membership from tenant_membership');
  const advisoryLock = apply.indexOf('pg_advisory_xact_lock');
  const authorityLock = apply.indexOf('from tenant_action_authority authority');
  const employmentLinkLock = apply.indexOf('from tenant_action_employment_link link');
  const authorization = apply.indexOf('perform tenant_iam_assert_no_sod_conflict');
  const replay = apply.indexOf('select * into existing_event from action_case_event');
  if (!(sessionLock >= 0 && membershipLock > sessionLock && advisoryLock > membershipLock
      && authorityLock > advisoryLock && employmentLinkLock > authorityLock
      && authorization > employmentLinkLock && replay > authorization)) {
    throw new Error('apply tenant no serializa sesión, membresía, autoridad, vínculo y replay en orden seguro');
  }
  for (const token of [
    "metadata->>'actorsessionid' <> p_actor_session_id::text",
    "metadata->>'actorsessionversion' <> p_actor_session_version::text",
    "metadata->>'releasesha' <> lower(p_release_sha)",
  ]) {
    if (!apply.includes(token)) throw new Error(`replay tenant sin snapshot de sesión: ${token}`);
  }
  const provisioning = definition(functions.get(PROVISION_SIGNATURE)?.definition);
  const provisionMembershipLock = provisioning.indexOf('select * into membership from tenant_membership');
  const provisionAdvisoryLock = provisioning.indexOf('pg_advisory_xact_lock');
  const provisionReplay = provisioning.indexOf('select * into existing_event from tenant_action_authority_event');
  const provisionReplayReturn = provisioning.indexOf("return existing_event.result || jsonb_build_object('replayed', true)");
  const provisionAuthorityLock = provisioning.indexOf('select * into authority from tenant_action_authority');
  const provisionVersionCheck = provisioning.indexOf('authority.version <> p_expected_version');
  const provisionLinkInsert = provisioning.indexOf('insert into tenant_action_employment_link');
  const provisionLinkUpdate = provisioning.indexOf('update tenant_action_employment_link');
  const provisionScopeUpdate = provisioning.indexOf('update tenant_action_area_scope');
  if (!(provisionMembershipLock >= 0 && provisionAdvisoryLock > provisionMembershipLock
      && provisionReplay > provisionAdvisoryLock && provisionReplayReturn > provisionReplay
      && provisionAuthorityLock > provisionReplayReturn && provisionVersionCheck > provisionAuthorityLock
      && provisionLinkInsert > provisionVersionCheck && provisionLinkUpdate > provisionVersionCheck
      && provisionScopeUpdate > provisionVersionCheck)) {
    throw new Error('provisioning no conserva replay ni orden membership, authority y recursos tenant');
  }
  const exclusive = definition(functions.get(EXCLUSIVE_SIGNATURE)?.definition);
  for (const token of ['time.overtime.enter', 'tenant_iam_effective_capabilities', 'tenant_exclusive_capability', 'membership_id = p_membership_id']) {
    if (!exclusive.includes(token)) throw new Error(`gate exclusivo incompleto: ${token}`);
  }
  const sessionAssert = definition(functions.get(IAM_SESSION_ASSERT_SIGNATURE)?.definition);
  for (const token of [
    'tenant_identity_session', "session.source = 'platform'", 'session.active_tenant_id is null',
    "session.auth_level in ('mfa', 'recovery')", 'session.session_version = p_actor_session_version',
    'users.identity_version = session.identity_version', 'join platform_user_role assignment',
    "assignment.role_key = 'platform_owner'", 'for share of session, users, assignment',
  ]) {
    if (!sessionAssert.includes(token)) throw new Error(`facade IAM v2 sin sesion fuerte: ${token}`);
  }
  const adminApply = definition(functions.get(IAM_ADMIN_APPLY_V2_SIGNATURE)?.definition);
  for (const token of [
    'tenant_iam_assert_platform_session_v2', 'from tenant_membership membership',
    'for update', 'from tenant_action_authority authority',
  ]) {
    if (!adminApply.includes(token)) throw new Error(`facade IAM v2 sin serializacion: ${token}`);
  }
  if (adminApply.indexOf('from tenant_membership membership')
      > adminApply.indexOf('from tenant_action_authority authority')) {
    throw new Error('facade IAM v2 invierte lock membership/authority');
  }
  if (!adminApply.includes('return tenant_iam_apply_command(')) {
    throw new Error('facade IAM v2 no delega en el motor 004 interno');
  }
  const adminView = definition(functions.get(IAM_ADMIN_VIEW_V2_SIGNATURE)?.definition);
  if (!adminView.includes('tenant_iam_assert_platform_session_v2')
      || !adminView.includes('return tenant_iam_admin_view(')) {
    throw new Error('facade IAM view v2 no valida sesión o no delega internamente');
  }

  const indexes = Array.isArray(evidence.indexes) ? evidence.indexes : [];
  for (const [name, expected] of Object.entries(INDEX_CONTRACT)) {
    const row = exactlyOneByName(indexes, name, 'índice');
    const predicate = definition(row.predicate);
    if (row.tableName !== expected.tableName
        || row.unique !== expected.unique
        || row.valid !== true
        || row.ready !== true
        || row.ownedByCurrentUser !== true
        || row.owner === RUNTIME_ROLE
        || (predicate.length > 0) !== expected.partial) {
      throw new Error(`semántica inválida: índice ${name} homónimo, inválido o incompleto`);
    }
    requireTokens('índice', name, row.definition, expected.definitionTokens);
    requireTokens('predicado de índice', name, predicate, expected.predicateTokens);
  }
  const triggers = Array.isArray(evidence.triggers) ? evidence.triggers : [];
  for (const [name, expected] of Object.entries(TRIGGER_CONTRACT)) {
    const row = exactlyOneByName(triggers, name, 'trigger');
    if (row.tableName !== expected.tableName
        || row.functionName !== expected.functionName
        || row.functionSchema !== 'public'
        || row.enabled !== 'O') {
      throw new Error(`semántica inválida: trigger ${name} deshabilitado o mal vinculado`);
    }
    requireTokens('trigger', name, row.definition, expected.definitionTokens);
  }
  const columns = new Map((evidence.columns || []).map((row) => [`${row.tableName}.${row.columnName}`, row]));
  for (const key of [
    'action_case.tenant_id', 'action_case.source_binding_id',
    'action_case_event.tenant_id', 'action_case_event.source_binding_id',
    'action_case_event.actor_membership_id',
  ]) {
    if (columns.get(key)?.nullable !== false) throw new Error(`snapshot tenant nullable: ${key}`);
  }
  const constraints = Array.isArray(evidence.constraints) ? evidence.constraints : [];
  for (const [name, expected] of Object.entries(CONSTRAINT_CONTRACT)) {
    const row = exactlyOneByName(constraints, name, 'constraint');
    if (row.tableName !== expected.tableName || row.type !== expected.type || row.validated !== true) {
      throw new Error(`semántica inválida: constraint ${name} ausente, homónimo o NOT VALID`);
    }
    requireTokens('constraint', name, row.definition, expected.definitionTokens);
  }
}

async function verifyPrerequisites(client) {
  const migrations = await client.query(`
    SELECT version FROM schema_migrations
    WHERE version = ANY($1::text[])
  `, [[
    '003-action-center', '004-tenant-iam-control-plane', '005-tenant-identity-gateway',
  ]]);
  if (migrations.rowCount !== 3) throw new Error('006 requiere migraciones 003, 004 y 005 registradas');
  const roleResult = await client.query(`
    SELECT rolcanlogin, rolinherit, rolsuper, rolcreaterole, rolcreatedb,
      rolreplication, rolbypassrls,
      EXISTS (SELECT 1 FROM pg_auth_members member WHERE member.member = role.oid) AS inherits_role
    FROM pg_roles role WHERE rolname = $1
  `, [RUNTIME_ROLE]);
  const role = roleResult.rows[0];
  if (!role || !role.rolcanlogin || role.rolinherit || role.rolsuper || role.rolcreaterole
      || role.rolcreatedb || role.rolreplication || role.rolbypassrls || role.inherits_role) {
    throw new Error(`${RUNTIME_ROLE} no es LOGIN NOINHERIT aislado`);
  }
}

async function collectEvidence(client) {
  const contract = TENANT_ACTION_SCHEMA_CONTRACT;
  const [tables, functions, indexes, triggers, columns, constraints] = await Promise.all([
    client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `, [contract.tables]),
    client.query(`
      SELECT requested.signature, proc.prosecdef AS "securityDefiner",
        array_to_string(proc.proconfig, ',') AS config,
        owner.rolname = current_user AS "ownedByCurrentUser",
        NOT EXISTS (
          SELECT 1 FROM aclexplode(COALESCE(proc.proacl, acldefault('f', proc.proowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        ) AS "publicExecuteRevoked",
        pg_get_functiondef(proc.oid) AS definition
      FROM unnest($1::text[]) requested(signature)
      JOIN pg_proc proc ON proc.oid = to_regprocedure(requested.signature)
      JOIN pg_roles owner ON owner.oid = proc.proowner
    `, [contract.functions]),
    client.query(`
      SELECT index_class.relname AS name,
        table_class.relname AS "tableName",
        meta.indisunique AS "unique",
        meta.indisvalid AS valid,
        meta.indisready AS ready,
        pg_get_indexdef(index_class.oid) AS definition,
        COALESCE(pg_get_expr(meta.indpred, meta.indrelid, true), '') AS predicate,
        owner.rolname AS owner,
        owner.rolname = current_user AS "ownedByCurrentUser"
      FROM pg_index meta
      JOIN pg_class index_class ON index_class.oid = meta.indexrelid
      JOIN pg_class table_class ON table_class.oid = meta.indrelid
      JOIN pg_namespace namespace ON namespace.oid = index_class.relnamespace
      JOIN pg_roles owner ON owner.oid = index_class.relowner
      WHERE namespace.nspname = 'public' AND index_class.relname = ANY($1::text[])
      ORDER BY index_class.relname
    `, [contract.indexes]),
    client.query(`
      SELECT trigger.tgname AS name,
        table_class.relname AS "tableName",
        trigger_function.proname AS "functionName",
        function_namespace.nspname AS "functionSchema",
        trigger.tgenabled AS enabled,
        pg_get_triggerdef(trigger.oid, true) AS definition
      FROM pg_trigger trigger
      JOIN pg_class table_class ON table_class.oid = trigger.tgrelid
      JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
      JOIN pg_proc trigger_function ON trigger_function.oid = trigger.tgfoid
      JOIN pg_namespace function_namespace ON function_namespace.oid = trigger_function.pronamespace
      WHERE table_namespace.nspname = 'public' AND NOT trigger.tgisinternal
        AND trigger.tgname = ANY($1::text[])
      ORDER BY trigger.tgname, table_class.relname
    `, [contract.triggers]),
    client.query(`
      SELECT table_name AS "tableName", column_name AS "columnName",
        is_nullable = 'YES' AS nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND (table_name, column_name) IN (
        ('action_case', 'tenant_id'), ('action_case', 'source_binding_id'),
        ('action_case_event', 'tenant_id'), ('action_case_event', 'source_binding_id'),
        ('action_case_event', 'actor_membership_id')
      )
    `),
    client.query(`
      SELECT constraint_row.conname AS name,
        table_class.relname AS "tableName",
        constraint_row.contype::text AS type,
        constraint_row.convalidated AS validated,
        pg_get_constraintdef(constraint_row.oid, true) AS definition
      FROM pg_constraint constraint_row
      JOIN pg_class table_class ON table_class.oid = constraint_row.conrelid
      JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
      WHERE namespace.nspname = 'public' AND constraint_row.conname = ANY($1::text[])
      ORDER BY constraint_row.conname, table_class.relname
    `, [Object.keys(CONSTRAINT_CONTRACT)]),
  ]);
  return {
    tables: rows(tables).map((row) => row.table_name), functions: rows(functions),
    indexes: rows(indexes), triggers: rows(triggers), columns: rows(columns), constraints: rows(constraints),
  };
}

export function validateTenantActionRuntimeAclEvidence(evidence, readFacadesApplied = false) {
  const contract = TENANT_ACTION_SCHEMA_CONTRACT;
  const runtimeFunctions = readFacadesApplied
    ? [...contract.runtimeFunctions.filter((signature) => signature !== RESOLVE_SIGNATURE), ...READ_FACADE_SIGNATURES]
    : contract.runtimeFunctions;
  const functions = Array.isArray(evidence?.functions) ? evidence.functions : [];
  const expectedFunctions = [...new Set([
    ...runtimeFunctions, ...contract.forbiddenRuntimeFunctions, RESOLVE_SIGNATURE,
  ])];
  for (const signature of expectedFunctions) {
    const row = exactlyOneByName(functions, signature, 'ACL función');
    const expected = runtimeFunctions.includes(signature);
    if (row.execute !== expected) throw new Error(`ACL function action tenant incorrecta: ${signature}`);
  }

  const relations = Array.isArray(evidence?.relations) ? evidence.relations : [];
  for (const resource of DIRECT_RUNTIME_RELATIONS) {
    const row = exactlyOneByName(relations, resource, 'ACL relación');
    const expectedSelect = !readFacadesApplied && ['action_case', 'action_case_event'].includes(resource);
    if (row.canSelect !== expectedSelect || row.canInsert || row.canUpdate || row.canDelete) {
      throw new Error(`ACL directa insegura action tenant: ${resource}`);
    }
  }

  const sequence = evidence?.sequence;
  if (!sequence?.exists || sequence.canUsage || sequence.canSelect || sequence.canUpdate) {
    throw new Error('ACL secuencia action tenant insegura: tenant_action_authority_event_id_seq');
  }

  const globalColumns = Array.isArray(evidence?.globalColumns) ? evidence.globalColumns : [];
  for (const resource of ['internal_users', 'internal_user_employment_link', 'internal_user_area_scope']) {
    if (!globalColumns.some((row) => row.resource === resource)) {
      throw new Error(`ACL autoridad global sin evidencia: ${resource}`);
    }
  }
  if (globalColumns.some((row) => row.canSelect)) {
    throw new Error('runtime conserva autoridad global por email');
  }

  const requiredColumns = new Map((evidence?.requiredColumns || [])
    .map((row) => [`${row.resource}.${row.columnName}`, row.canSelect]));
  for (const key of REQUIRED_RUNTIME_COLUMNS) {
    if (requiredColumns.get(key) !== !readFacadesApplied) {
      throw new Error(readFacadesApplied
        ? `runtime conserva columna tenant directa después de 007: ${key}`
        : `runtime no puede leer columna tenant requerida: ${key}`);
    }
  }
}

async function verifyRuntimeAcl(client, readFacadesApplied = false) {
  const contract = TENANT_ACTION_SCHEMA_CONTRACT;
  const aclFunctions = [...new Set([
    ...contract.runtimeFunctions, ...contract.forbiddenRuntimeFunctions,
    ...(readFacadesApplied ? READ_FACADE_SIGNATURES : []),
  ])];
  const functions = await client.query(`
    SELECT signature AS name,
      has_function_privilege($1, to_regprocedure(signature), 'EXECUTE') AS execute
    FROM unnest($2::text[]) requested(signature)
  `, [RUNTIME_ROLE, aclFunctions]);
  const relations = await client.query(`
    SELECT relation.relname AS name,
      has_any_column_privilege($1, relation.oid, 'SELECT') AS "canSelect",
      has_any_column_privilege($1, relation.oid, 'INSERT') AS "canInsert",
      has_any_column_privilege($1, relation.oid, 'UPDATE') AS "canUpdate",
      has_table_privilege($1, relation.oid, 'DELETE') AS "canDelete"
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($2::text[])
  `, [RUNTIME_ROLE, DIRECT_RUNTIME_RELATIONS]);
  const sequence = await client.query(`
    SELECT to_regclass('public.tenant_action_authority_event_id_seq') IS NOT NULL AS "exists",
      has_sequence_privilege($1, 'public.tenant_action_authority_event_id_seq', 'USAGE') AS "canUsage",
      has_sequence_privilege($1, 'public.tenant_action_authority_event_id_seq', 'SELECT') AS "canSelect",
      has_sequence_privilege($1, 'public.tenant_action_authority_event_id_seq', 'UPDATE') AS "canUpdate"
  `, [RUNTIME_ROLE]);
  const globalColumns = await client.query(`
    SELECT columns.table_name AS resource, columns.column_name AS "columnName",
      has_column_privilege(
        $1, format('public.%I', columns.table_name), columns.column_name, 'SELECT'
      ) AS "canSelect"
    FROM information_schema.columns columns
    WHERE columns.table_schema = 'public'
      AND columns.table_name = ANY($2::text[])
    ORDER BY columns.table_name, columns.ordinal_position
  `, [RUNTIME_ROLE, [
    'internal_users', 'internal_user_employment_link', 'internal_user_area_scope',
  ]]);
  const requiredColumns = await client.query(`
    SELECT columns.table_name AS resource, columns.column_name AS "columnName",
      has_column_privilege(
        $1, format('public.%I', columns.table_name), columns.column_name, 'SELECT'
      ) AS "canSelect"
    FROM information_schema.columns columns
    WHERE columns.table_schema = 'public'
      AND format('%s.%s', columns.table_name, columns.column_name) = ANY($2::text[])
    ORDER BY columns.table_name, columns.ordinal_position
  `, [RUNTIME_ROLE, REQUIRED_RUNTIME_COLUMNS]);
  validateTenantActionRuntimeAclEvidence({
    functions: rows(functions), relations: rows(relations),
    sequence: rows(sequence)[0], globalColumns: rows(globalColumns),
    requiredColumns: rows(requiredColumns),
  }, readFacadesApplied);
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  const checksum = createHash('sha256').update(migration).digest('hex');
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directCanonicalDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:tenant-action-006'))`);
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1', [MIGRATION_VERSION],
    );
    const readFacades = await client.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1', [READ_FACADE_MIGRATION_VERSION],
    );
    const readFacadesApplied = readFacades.rowCount > 0;
    if (readFacadesApplied && !existing.rowCount) {
      throw new Error(`${MIGRATION_VERSION} no puede aplicarse después de ${READ_FACADE_MIGRATION_VERSION}`);
    }
    if (existing.rowCount && existing.rows[0].checksum_sha256.trim() !== checksum) {
      throw new Error(`Drift detectado: ${MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${MIGRATION_VERSION} sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [MIGRATION_VERSION, checksum],
      );
    }
    validateTenantActionEvidence(await collectEvidence(client));
    await verifyRuntimeAcl(client, readFacadesApplied);
    if (readFacadesApplied) {
      const { verifyActionReadFinalAcl } = await import('./apply-action-center-read-facades-schema.mjs');
      await verifyActionReadFinalAcl(client);
    }
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${MIGRATION_VERSION}: ya aplicada y verificada`
      : `${MIGRATION_VERSION}: aplicada (${statements.length} sentencias, SHA-256 ${checksum})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
