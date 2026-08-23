import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import { TENANT_LIFECYCLE_RUNTIME_FUNCTION_ALLOWLIST } from './apply-tenant-lifecycle-hardening-schema.mjs';

export const TIME_SOURCE_MIGRATION_VERSION = '010-governed-time-source-registry';
const MIGRATION_URL = new URL('./migrations/010-governed-time-source-registry.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const PREREQUISITES = Object.freeze([
  ['003-action-center', new URL('./migrations/003-action-center.sql', import.meta.url)],
  ['004-tenant-iam-control-plane', new URL('./migrations/004-tenant-iam-control-plane.sql', import.meta.url)],
  ['005-tenant-identity-gateway', new URL('./migrations/005-tenant-identity-gateway.sql', import.meta.url)],
  ['006-tenant-action-authority', new URL('./migrations/006-tenant-action-authority.sql', import.meta.url)],
  ['007-action-center-read-facades', new URL('./migrations/007-action-center-read-facades.sql', import.meta.url)],
  ['008-governed-overtime-actions', new URL('./migrations/008-governed-overtime-actions.sql', import.meta.url)],
  ['009-tenant-lifecycle-hardening', new URL('./migrations/009-tenant-lifecycle-hardening.sql', import.meta.url)],
]);

export const TIME_SOURCE_SIGNATURES = Object.freeze({
  reasonAllowed: 'public.time_source_reason_allowed_v1(text,text)',
  metadataRow: 'public.time_source_metadata_row_valid_v1(text,text,text,text,text,text,text,timestamp with time zone,date,date,text,text,text,bigint)',
  metadataJson: 'public.time_source_metadata_json_valid_v1(jsonb)',
  snapshot: 'public.time_source_contract_snapshot_v1(uuid,uuid)',
  contractGuard: 'public.time_source_guard_contract_v1()',
  overlapGuard: 'public.time_source_guard_approved_overlap_v1()',
  session: 'public.time_source_assert_tenant_session_v1(text,uuid,integer,text,uuid,uuid)',
  personSod: 'public.time_source_assert_person_sod_v1(uuid,uuid,uuid)',
  authority: 'public.time_source_assert_actor_authority_v1(jsonb,text)',
  readiness: 'public.time_source_readiness_v1(jsonb)',
  bootstrap: 'public.time_source_registry_bootstrap_v1(text,uuid,integer,text,uuid,uuid)',
  list: 'public.time_source_registry_list_v1(text,uuid,integer,text,uuid,uuid,text,text,integer,integer)',
  detail: 'public.time_source_registry_detail_v1(text,uuid,integer,text,uuid,uuid,uuid)',
  apply: 'public.time_source_registry_apply_command_v1(text,uuid,integer,text,uuid,uuid,text,uuid,integer,uuid,text,jsonb,text,text)',
});

export const TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST = Object.freeze([
  ...TENANT_LIFECYCLE_RUNTIME_FUNCTION_ALLOWLIST,
  TIME_SOURCE_SIGNATURES.bootstrap,
  TIME_SOURCE_SIGNATURES.list,
  TIME_SOURCE_SIGNATURES.detail,
  TIME_SOURCE_SIGNATURES.apply,
]);

const EXPECTED_RUNTIME_FUNCTIONS = new Set(TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST);
const SECURITY_FUNCTIONS = Object.freeze([...new Set([
  ...TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST,
  ...Object.values(TIME_SOURCE_SIGNATURES),
])]);

const CONTRACT_COLUMNS = Object.freeze([
  ['id', 'uuid', true],
  ['tenant_id', 'uuid', true],
  ['certified_binding_id', 'uuid', true],
  ['domain', 'character varying(40)', true],
  ['owner_authority', 'character varying(40)', true],
  ['owner_code', 'character varying(64)', true],
  ['system_locator', 'character varying(96)', true],
  ['source_format', 'character varying(32)', true],
  ['schema_version', 'character varying(32)', true],
  ['artifact_sha256', 'character(64)', true],
  ['cut_at', 'timestamp with time zone', true],
  ['coverage_from', 'date', true],
  ['coverage_to', 'date', true],
  ['timezone', 'character varying(64)', true],
  ['grain', 'character varying(48)', true],
  ['identity_key_kind', 'character varying(40)', true],
  ['record_count', 'bigint', false],
  ['status', 'character varying(16)', true],
  ['version', 'integer', true],
  ['proposer_person_id', 'uuid', true],
  ['proposer_membership_id', 'uuid', true],
  ['approver_person_id', 'uuid', false],
  ['approver_membership_id', 'uuid', false],
  ['reason_code', 'character varying(64)', true],
  ['reason_hash', 'character(64)', true],
  ['created_at', 'timestamp with time zone', true],
  ['updated_at', 'timestamp with time zone', true],
  ['submitted_at', 'timestamp with time zone', false],
  ['decided_at', 'timestamp with time zone', false],
  ['retired_at', 'timestamp with time zone', false],
  ['cancelled_at', 'timestamp with time zone', false],
]);

const EVENT_COLUMNS = Object.freeze([
  ['id', 'uuid', true],
  ['tenant_id', 'uuid', true],
  ['contract_id', 'uuid', true],
  ['contract_certified_binding_id', 'uuid', true],
  ['actor_certified_binding_id', 'uuid', true],
  ['actor_membership_id', 'uuid', true],
  ['actor_person_id', 'uuid', true],
  ['actor_session_id', 'uuid', true],
  ['actor_session_version', 'integer', true],
  ['release_sha', 'character(40)', true],
  ['command', 'character varying(32)', true],
  ['idempotency_key', 'uuid', true],
  ['command_hash', 'character(64)', true],
  ['expected_version', 'integer', true],
  ['resulting_version', 'integer', true],
  ['reason_code', 'character varying(64)', true],
  ['reason_hash', 'character(64)', true],
  ['before_snapshot', 'jsonb', true],
  ['after_snapshot', 'jsonb', true],
  ['result', 'jsonb', true],
  ['occurred_at', 'timestamp with time zone', true],
]);

const TIME_SOURCE_STATUS_CONSTRAINT = `CHECK (
  status IN ('draft','submitted','approved','rejected','retired','cancelled')
)`;

const TIME_SOURCE_STATE_CONSTRAINT = `CHECK (
  (status = 'draft' AND submitted_at IS NULL AND decided_at IS NULL
    AND retired_at IS NULL AND cancelled_at IS NULL
    AND approver_person_id IS NULL AND approver_membership_id IS NULL)
  OR (status = 'submitted' AND submitted_at IS NOT NULL AND decided_at IS NULL
    AND retired_at IS NULL AND cancelled_at IS NULL
    AND approver_person_id IS NULL AND approver_membership_id IS NULL)
  OR (status IN ('approved','rejected') AND submitted_at IS NOT NULL
    AND decided_at IS NOT NULL AND retired_at IS NULL AND cancelled_at IS NULL
    AND approver_person_id IS NOT NULL AND approver_membership_id IS NOT NULL)
  OR (status = 'retired' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL
    AND retired_at IS NOT NULL AND cancelled_at IS NULL
    AND approver_person_id IS NOT NULL AND approver_membership_id IS NOT NULL)
  OR (status = 'cancelled' AND decided_at IS NULL AND retired_at IS NULL
    AND cancelled_at IS NOT NULL
    AND approver_person_id IS NULL AND approver_membership_id IS NULL)
)`;

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function canonicalConstraint(value) {
  return normalized(value)
    .replaceAll('public.', '')
    .replace(/::(?:character varying|character|bpchar|text)(?:\[\])?/g, '')
    .replace(/[()\s]/g, '')
    // PostgreSQL deparsea `IN (...)` como `= ANY (ARRAY[...])` para varchar/text.
    // Ambas formas expresan el mismo conjunto cerrado; se normalizan antes de
    // comparar el contrato completo, no mediante coincidencias parciales.
    .replace(/([a-z_][a-z0-9_.]*)=anyarray\[([^\]]+)\]/g, '$1in$2')
    .replace(/([a-z_][a-z0-9_.]*)in((?:'[^']*')(?:,'[^']*')*)/g,
      (_match, column, values) => `${column}in${values.split(',').sort().join(',')}`);
}

function requireTokens(name, definition, tokens) {
  const body = normalized(definition);
  for (const token of tokens) {
    if (!body.includes(normalized(token))) throw new Error(`${name} no contiene contrato ${token}`);
  }
}

function requireConstraintTokens(name, definition, tokens) {
  const body = canonicalConstraint(definition);
  for (const token of tokens) {
    if (!body.includes(canonicalConstraint(token))) {
      throw new Error(`${name} no contiene contrato ${token}`);
    }
  }
}

function exactSet(actual, expected, label) {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  if (JSON.stringify(a) !== JSON.stringify(e)) {
    throw new Error(`${label} fuera de allowlist: actual=${a.join(',')} esperado=${e.join(',')}`);
  }
}

function validateFunction(definition, name, required, forbidden = []) {
  requireTokens(name, definition, required);
  const body = normalized(definition);
  for (const token of forbidden) {
    if (body.includes(normalized(token))) throw new Error(`${name} contiene token prohibido ${token}`);
  }
}

export function validateTimeSourceMigrationSql(sql) {
  const body = normalized(sql);
  requireTokens('migracion 010', body, [
    'create table if not exists time_source_contract',
    'create table if not exists time_source_governance_event',
    "'shift_assignment', 'time_punch', 'holiday_calendar'",
    "'municipal_rule_profile', 'administrative_event', 'employment_master_reference'",
    "p_timezone = 'america/argentina/mendoza'",
    "'time.source.read'", "'time.source.propose'", "'time.source.approve'",
    "'time.source.audit.read'", "'junin_tiempo_fuentes_proponente'",
    "'junin_tiempo_fuentes_aprobador'",
    "'time.source.approve', 'time.source.propose'",
    "'time.overtime.post', 'time.source.approve'",
    "'municipal_human_resources', 'municipal_it', 'municipal_payroll'",
    "'provincial_authority', 'national_authority', 'certified_external_provider'",
    'time-source-coverage:', 'time_source_approved_overlap',
    'actor_session_version', 'release_sha', 'idempotency_key', 'command_hash',
    'before_snapshot', 'after_snapshot', 'reason_hash',
    'contract_certified_binding_id', 'actor_certified_binding_id',
    "'evaluationready', false", "'attendancereconciled', false",
    "'payrollcalculated', false", "'payrollposted', false", "'grhmutation', false",
    'revoke all privileges on table time_source_contract, time_source_governance_event',
  ]);
  const contractTableAt = body.indexOf('create table if not exists time_source_contract');
  const eventTableAt = body.indexOf('create table if not exists time_source_governance_event');
  const firstIndexAt = body.indexOf('create index', eventTableAt);
  if (!(contractTableAt >= 0 && eventTableAt > contractTableAt && firstIndexAt > eventTableAt)) {
    throw new Error('tablas 010 no tienen orden verificable');
  }
  const contractTable = body.slice(contractTableAt, eventTableAt);
  const eventTable = body.slice(eventTableAt, firstIndexAt);
  requireTokens('tabla contract 010', contractTable, [
    'certified_binding_id uuid not null',
    'unique (id, tenant_id, certified_binding_id)',
  ]);
  if (contractTable.includes('contract_certified_binding_id')
      || contractTable.includes('actor_certified_binding_id')) {
    throw new Error('tabla contract 010 contiene binding de evento');
  }
  requireTokens('tabla event 010', eventTable, [
    'contract_certified_binding_id uuid not null',
    'actor_certified_binding_id uuid not null',
    'foreign key (contract_id, tenant_id, contract_certified_binding_id)',
    'references time_source_contract(id, tenant_id, certified_binding_id)',
  ]);
  if (/\bcertified_binding_id\s+uuid\b/i.test(eventTable)) {
    throw new Error('tabla event 010 contiene binding ambiguo');
  }
  for (const command of ['create_draft','update_draft','submit','approve','reject','retire','cancel']) {
    if (!body.includes(`'${command}'`)) throw new Error(`falta comando gobernado ${command}`);
  }
  const sensitiveDml = /\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:public\.)?(?:grh_[a-z0-9_]*|payroll_[a-z0-9_]*|action_case(?:_event|_context)?|employment_contract|source_import_batch)\b/i;
  if (sensitiveDml.test(sql)) throw new Error('010 intenta DML sobre GRH/payroll/action_case/canonico');
  if (/\balter\s+table\s+(?:public\.)?action_case\b/i.test(sql)
      || /\balter\s+role\b/i.test(sql)
      || /\bexecute\s+format\s*\(/i.test(sql)) {
    throw new Error('010 contiene expansion o SQL dinamico prohibido');
  }
  if (/iam_role_capability[^;]+\('(?:platform_owner|tenant_admin|junin_tesoreria_carga|junin_rrhh_)/is.test(sql)) {
    throw new Error('010 amplia un rol existente');
  }
  if (/\b(?:amount|rate|calculated_minutes|payroll_amount)\b/i.test(sql)) {
    throw new Error('010 incorpora calculo temporal o monetario');
  }
  if (/\bcurrent_date\b/i.test(sql)
      || !body.includes("now() at time zone 'america/argentina/mendoza'")) {
    throw new Error('010 no fija la fecha civil de Mendoza');
  }
  validateFunction(sql, 'identificadores internos derivados', [
    'p_owner_code = p_owner_authority',
    "p_system_locator ~ '^registry\\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'",
    "p_schema_version ~ '^v[1-9][0-9]{0,3}(?:\\.[0-9]{1,4}){0,2}$'",
    "'registry.' || target_id::text",
    "owner_code = p_payload->>'ownerauthority'",
  ], ["p_payload->>'ownercode'", "p_payload->>'systemlocator'", 'http://', 'https://']);
  const applyStart = body.indexOf('create or replace function time_source_registry_apply_command_v1');
  const aclStart = body.indexOf('comment on table time_source_contract', applyStart);
  if (!(applyStart >= 0 && aclStart > applyStart)) throw new Error('fachada apply 010 ausente');
  const applyBody = body.slice(applyStart, aclStart);
  requireTokens('apply 010', applyBody, [
    "then 'time.source.propose'", "else 'time.source.approve'",
    'time_source_assert_tenant_session_v1', 'time_source_assert_actor_authority_v1',
    'time-source-idempotency:', 'for update nowait', 'time_source_separation_of_duties',
    'insert into time_source_governance_event', "'historical'",
    'actor_certified_binding_id', 'contract_certified_binding_id',
  ]);
  return true;
}

function validateColumns(actual, expected, label) {
  const shaped = (actual || []).map((row) => [row.name, normalized(row.type), row.notNull === true]);
  if (JSON.stringify(shaped) !== JSON.stringify(expected)) {
    throw new Error(`columnas ${label} con drift`);
  }
}

function constraintMap(rowsValue) {
  return new Map((rowsValue || []).map((row) => [row.name, row]));
}

function exactConstraint(map, name, type, expected) {
  const row = map.get(name);
  if (!row || row.type !== type || row.validated !== true
      || canonicalConstraint(row.definition) !== canonicalConstraint(expected)) {
    throw new Error(`constraint invalida ${name}`);
  }
}

function validateTriggers(triggers) {
  const expected = new Map([
    ['time_source_contract_transition_guard_v1', {
      table: 'time_source_contract', fn: 'time_source_guard_contract_v1', events: ['insert','delete','update'],
    }],
    ['time_source_contract_approved_overlap_guard_v1', {
      table: 'time_source_contract', fn: 'time_source_guard_approved_overlap_v1', events: ['insert','update'],
    }],
    ['time_source_governance_event_append_only_v1', {
      table: 'time_source_governance_event', fn: 'tenant_iam_reject_change', events: ['delete','update'],
    }],
  ]);
  exactSet((triggers || []).map((row) => row.name), expected.keys(), 'triggers 010');
  for (const row of triggers || []) {
    const contract = expected.get(row.name);
    if (!contract || row.enabled !== 'O' || row.tableName !== contract.table
        || row.functionSchema !== 'public' || row.functionName !== contract.fn
        || row.noArguments !== true || row.notConstraint !== true
        || row.rowLevel !== true || row.timing !== 'before') {
      throw new Error(`binding trigger invalido ${row.name}`);
    }
    exactSet(row.events || [], contract.events, `eventos trigger ${row.name}`);
  }
}

function validateIndexes(indexes) {
  const expected = new Map([
    ['time_source_contract_tenant_list_idx', {
      table: 'time_source_contract', columns: ['tenant_id','status','domain','updated_at','id'],
      requiredDefinition: '(tenant_id, status, domain, updated_at desc, id)',
    }],
    ['time_source_contract_readiness_idx', {
      table: 'time_source_contract',
      columns: ['tenant_id','domain','status','coverage_from','coverage_to','updated_at'],
      requiredDefinition: '(tenant_id, domain, status, coverage_from, coverage_to, updated_at desc)',
    }],
    ['time_source_governance_event_timeline_idx', {
      table: 'time_source_governance_event', columns: ['tenant_id','contract_id','occurred_at','id'],
      requiredDefinition: '(tenant_id, contract_id, occurred_at, id)',
    }],
  ]);
  exactSet((indexes || []).map((row) => row.name), expected.keys(), 'indices 010');
  for (const row of indexes || []) {
    const contract = expected.get(row.name);
    if (!contract || row.tableName !== contract.table || row.unique === true
        || row.valid !== true || row.ready !== true || row.predicate != null
        || JSON.stringify(row.columns) !== JSON.stringify(contract.columns)
        || !normalized(row.definition).includes(contract.requiredDefinition)) {
      throw new Error(`indice invalido ${row.name}`);
    }
  }
}

export function validateTimeSourceEvidence(evidence) {
  validateColumns(evidence.contractColumns, CONTRACT_COLUMNS, 'time_source_contract');
  validateColumns(evidence.eventColumns, EVENT_COLUMNS, 'time_source_governance_event');

  const contractConstraints = constraintMap(evidence.contractConstraints);
  exactSet(contractConstraints.keys(), [
    'time_source_contract_pkey', 'time_source_contract_tenant_id_fkey',
    'time_source_contract_proposer_person_id_fkey', 'time_source_contract_approver_person_id_fkey',
    'time_source_contract_id_tenant_uk', 'time_source_contract_id_tenant_binding_uk',
    'time_source_contract_binding_fk',
    'time_source_contract_proposer_membership_fk', 'time_source_contract_approver_membership_fk',
    'time_source_contract_metadata_ck', 'time_source_contract_status_ck',
    'time_source_contract_version_ck', 'time_source_contract_reason_ck',
    'time_source_contract_approver_pair_ck', 'time_source_contract_maker_checker_ck',
    'time_source_contract_state_ck',
  ], 'constraints contract 010');
  exactConstraint(contractConstraints, 'time_source_contract_pkey', 'p', 'PRIMARY KEY (id)');
  exactConstraint(contractConstraints, 'time_source_contract_id_tenant_uk', 'u', 'UNIQUE (id, tenant_id)');
  exactConstraint(contractConstraints, 'time_source_contract_id_tenant_binding_uk', 'u',
    'UNIQUE (id, tenant_id, certified_binding_id)');
  exactConstraint(contractConstraints, 'time_source_contract_binding_fk', 'f',
    'FOREIGN KEY (tenant_id, certified_binding_id) REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT');
  exactConstraint(contractConstraints, 'time_source_contract_proposer_membership_fk', 'f',
    'FOREIGN KEY (proposer_membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT');
  exactConstraint(contractConstraints, 'time_source_contract_approver_membership_fk', 'f',
    'FOREIGN KEY (approver_membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT');
  requireConstraintTokens('check metadata contract', contractConstraints.get('time_source_contract_metadata_ck')?.definition, [
    'time_source_metadata_row_valid_v1', 'record_count',
  ]);
  exactConstraint(contractConstraints, 'time_source_contract_status_ck', 'c',
    TIME_SOURCE_STATUS_CONSTRAINT);
  requireConstraintTokens('check maker checker', contractConstraints.get('time_source_contract_maker_checker_ck')?.definition, [
    'approver_person_id <> proposer_person_id', 'approver_membership_id <> proposer_membership_id',
  ]);
  exactConstraint(contractConstraints, 'time_source_contract_state_ck', 'c',
    TIME_SOURCE_STATE_CONSTRAINT);

  const eventConstraints = constraintMap(evidence.eventConstraints);
  exactSet(eventConstraints.keys(), [
    'time_source_governance_event_pkey', 'time_source_governance_event_tenant_id_fkey',
    'time_source_governance_event_actor_person_id_fkey',
    'time_source_governance_event_actor_session_id_fkey',
    'time_source_governance_event_contract_fk',
    'time_source_governance_event_contract_binding_fk',
    'time_source_governance_event_actor_binding_fk',
    'time_source_governance_event_membership_fk',
    'time_source_governance_event_idempotency_uk',
    'time_source_governance_event_command_ck',
    'time_source_governance_event_context_ck',
    'time_source_governance_event_json_ck',
  ], 'constraints event 010');
  exactConstraint(eventConstraints, 'time_source_governance_event_pkey', 'p', 'PRIMARY KEY (id)');
  exactConstraint(eventConstraints, 'time_source_governance_event_contract_fk', 'f',
    'FOREIGN KEY (contract_id, tenant_id, contract_certified_binding_id) REFERENCES time_source_contract(id, tenant_id, certified_binding_id) ON DELETE RESTRICT');
  exactConstraint(eventConstraints, 'time_source_governance_event_contract_binding_fk', 'f',
    'FOREIGN KEY (tenant_id, contract_certified_binding_id) REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT');
  exactConstraint(eventConstraints, 'time_source_governance_event_actor_binding_fk', 'f',
    'FOREIGN KEY (tenant_id, actor_certified_binding_id) REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT');
  exactConstraint(eventConstraints, 'time_source_governance_event_membership_fk', 'f',
    'FOREIGN KEY (actor_membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT');
  exactConstraint(eventConstraints, 'time_source_governance_event_idempotency_uk', 'u',
    'UNIQUE (tenant_id, actor_membership_id, idempotency_key)');
  requireConstraintTokens('check contexto event', eventConstraints.get('time_source_governance_event_context_ck')?.definition, [
    'actor_session_version > 0', "release_sha ~ '^[a-f0-9]{40}$'",
    "command_hash ~ '^[a-f0-9]{64}$'", 'resulting_version = expected_version + 1',
    'time_source_reason_allowed_v1',
  ]);
  requireConstraintTokens('check json event', eventConstraints.get('time_source_governance_event_json_ck')?.definition, [
    "jsonb_typeof(before_snapshot) = 'object'", "jsonb_typeof(after_snapshot) = 'object'",
    "jsonb_typeof(result) = 'object'",
  ]);

  validateIndexes(evidence.indexes);
  validateTriggers(evidence.triggers);

  const functions = new Map((evidence.functions || []).map((row) => [row.signature, row]));
  exactSet(functions.keys(), SECURITY_FUNCTIONS, 'funciones de seguridad 010');
  for (const signature of SECURITY_FUNCTIONS) {
    const row = functions.get(signature);
    if (!row || row.securityDefiner !== true || row.ownedByCurrentUser !== true
        || row.ownerIsRuntime === true || row.publicExecuteRevoked !== true
        || normalized((row.config || []).join(', ')) !== 'search_path=public, pg_temp') {
      throw new Error(`funcion insegura ${signature}`);
    }
  }
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.session)?.definition, 'sesion 010', [
    'internal_users users', 'tenant_membership membership', 'tenant_identity_session identity_session',
    "identity_session.source = 'membership'", "identity_session.auth_level in ('mfa','recovery')",
    'policy.tenant_data_plane_ready is true', 'lower(policy.certified_release_sha) = lower(p_release_sha)',
    "binding.source_system = 'grh'", 'binding.verified is true', 'for share nowait',
  ]);
  const sessionBody = normalized(functions.get(TIME_SOURCE_SIGNATURES.session)?.definition);
  const userAt = sessionBody.indexOf('from internal_users users');
  const membershipAt = sessionBody.indexOf('from tenant_membership membership');
  const sessionAt = sessionBody.indexOf('from tenant_identity_session identity_session');
  const tenantAt = sessionBody.indexOf('from platform_tenant tenant');
  const policyAt = sessionBody.indexOf('from tenant_identity_policy policy');
  const bindingAt = sessionBody.indexOf('from platform_tenant_source_binding binding');
  if (!(userAt >= 0 && userAt < membershipAt && membershipAt < sessionAt
      && sessionAt < tenantAt && tenantAt < policyAt && policyAt < bindingAt)) {
    throw new Error('orden de locks session 010 invalido');
  }
  const policyLockAt = sessionBody.indexOf('for share nowait', policyAt);
  const bindingLockAt = sessionBody.indexOf('for share nowait', bindingAt);
  if (sessionBody.split('for share nowait').length - 1 < 5
      || policyLockAt < policyAt || policyLockAt > bindingAt
      || bindingLockAt < bindingAt) {
    throw new Error('locks tenant/policy/binding 010 no fallan rapido');
  }
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.authority)?.definition, 'authority 010', [
    'tenant_action_authority authority', 'tenant_iam_assert_no_sod_conflict',
    'tenant_iam_effective_capabilities', 'tenant_action_employment_link link',
    'employment_contract contract', 'source_import_batch batch', 'for share of link, contract, batch nowait',
    'time_source_assert_person_sod_v1',
  ]);
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.personSod)?.definition, 'SoD por persona 010', [
    'tenant_membership membership', 'tenant_action_employment_link link',
    'employment_contract contract', 'tenant_iam_effective_capabilities',
    "contract.person_id = p_actor_person_id", "membership.status = 'active'",
    'order by membership.id', 'for share of membership, link, contract, batch nowait',
    "'time.source.propose','time.source.approve','time.overtime.post'",
    'time_source_person_sod_conflict',
  ]);
  const personSodBody = normalized(functions.get(TIME_SOURCE_SIGNATURES.personSod)?.definition);
  if (personSodBody.split('contract.person_id = p_actor_person_id').length - 1 !== 2
      || personSodBody.indexOf('for share of membership, link, contract, batch nowait')
        > personSodBody.indexOf('coalesce(bool_or(effective.capability_key')) {
    throw new Error('SoD por persona 010 no bloquea antes de agregar capacidades');
  }
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.overlapGuard)?.definition, 'overlap 010', [
    'time-source-coverage:', "existing.status = 'approved'",
    'existing.coverage_from <= new.coverage_to', 'existing.coverage_to >= new.coverage_from',
    'time_source_approved_overlap',
  ]);
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.contractGuard)?.definition, 'guard contract 010', [
    "tg_op = 'delete'", 'time_source_delete_forbidden',
    'new.version is distinct from old.version + 1',
    "transition_command in ('approve','reject')", 'time_source_approver_invalid',
    "transition_command = 'approve'", "current_timestamp + interval '5 minutes'",
    'time_source_cut_at_future',
  ]);
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.reasonAllowed)?.definition, 'motivos 010', [
    "when 'create_draft'", "when 'approve'", "when 'retire'", 'end, false',
  ]);
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.metadataRow)?.definition, 'metadata row 010', [
    "p_owner_authority in ( 'municipal_human_resources', 'municipal_it', 'municipal_payroll'",
    "'certified_external_provider'", "p_timezone = 'america/argentina/mendoza'",
    'p_owner_code = p_owner_authority',
    "p_system_locator ~ '^registry\\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'",
    "p_schema_version ~ '^v[1-9][0-9]{0,3}(?:\\.[0-9]{1,4}){0,2}$'",
    'p_coverage_from <= p_coverage_to',
  ]);
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.metadataJson)?.definition, 'metadata JSON 010', [
    'jsonb_object_keys(p_payload)', "p_payload->>'cutat' !~",
    "(p_payload->>'cutat')::timestamptz", 'time_source_metadata_row_valid_v1',
    "p_payload->>'ownerauthority', p_payload->>'ownerauthority'",
    "'registry.00000000-0000-4000-8000-000000000000'",
  ], ["p_payload->>'ownercode'", "p_payload->>'systemlocator'"]);
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.snapshot)?.definition, 'snapshot 010', [
    'source.id = p_contract_id', 'source.tenant_id = p_tenant_id',
    "'ownerauthority', source.owner_authority",
    "'reasoncode', source.reason_code",
  ], ['ownercode', 'systemlocator', 'tenantid', 'certifiedbindingid', 'proposerpersonid', 'approverpersonid', 'actor']);
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.readiness)?.definition, 'readiness 010', [
    "'shiftassignment'", "'timepunches'", "'holidaycalendar'",
    "'municipalruleprofile'", "'administrativeevents'", "'partial_reference'",
    "'catalogapproved'", "'evaluationready', false", "'grhmutation', false",
    "now() at time zone 'america/argentina/mendoza'",
  ], ['ownercode', 'systemlocator']);
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.bootstrap)?.definition, 'bootstrap 010', [
    'time_source_assert_tenant_session_v1',
    "time_source_assert_actor_authority_v1(context_value, 'time.source.read')",
    'time_source_readiness_v1', "jsonb_build_array('create_draft')",
  ]);
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.list)?.definition, 'list 010', [
    'p_page not between 1 and 200', 'p_limit not between 1 and 50',
    'time_source_assert_tenant_session_v1',
    "time_source_assert_actor_authority_v1(context_value, 'time.source.read')",
    "source.tenant_id = (context_value->>'tenantid')::uuid",
    'with filtered as materialized', 'count(*)::bigint as total',
    'limit p_limit offset (p_page - 1) * p_limit',
  ], ["'proposerpersonid',", "'approverpersonid',", "'actorsessionid',"]);
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.detail)?.definition, 'detail 010', [
    'time_source_assert_tenant_session_v1',
    "time_source_assert_actor_authority_v1(context_value, 'time.source.read')",
    "source.tenant_id = (context_value->>'tenantid')::uuid",
    "context_value->'capabilities'", "? 'time.source.audit.read'",
    'order by event.occurred_at desc, event.id desc', 'limit 101',
    'filter (where event.position <= 100)', "'timelinetruncated'", "'timelinelimit', 100",
  ], [
    "'id', event.id", "'reasonhash',",
    "'actorsessionid',", "'actorpersonid',", "'actormembershipid',",
  ]);
  validateFunction(functions.get(TIME_SOURCE_SIGNATURES.apply)?.definition, 'apply 010', [
    "p_command in ('create_draft','update_draft','submit','cancel')",
    "then 'time.source.propose'", "else 'time.source.approve'",
    'time-source-idempotency:', 'time_source_idempotency_reused',
    'actor_certified_binding_id', 'contract_certified_binding_id',
    "'historical'", 'insert into time_source_governance_event',
    "p_command = 'approve'", "current_timestamp + interval '5 minutes'",
  ], ['insert into grh_', 'update grh_', 'insert into payroll_', 'update payroll_', 'update action_case']);

  exactSet((evidence.roleCapabilities || []).map((row) => `${row.roleKey}:${row.capabilityKey}`), [
    'JUNIN_TIEMPO_FUENTES_PROPONENTE:time.source.propose',
    'JUNIN_TIEMPO_FUENTES_PROPONENTE:time.source.read',
    'JUNIN_TIEMPO_FUENTES_APROBADOR:time.source.approve',
    'JUNIN_TIEMPO_FUENTES_APROBADOR:time.source.audit.read',
    'JUNIN_TIEMPO_FUENTES_APROBADOR:time.source.read',
  ], 'grants roles 010');
  exactSet((evidence.conflicts || []).map((row) => `${row.left}:${row.right}`), [
    'time.overtime.post:time.source.approve',
    'time.source.approve:time.source.propose',
  ], 'conflictos SoD 010');
  exactSet((evidence.capabilities || []).map((row) => row.key), [
    'time.source.read','time.source.propose','time.source.approve','time.source.audit.read',
  ], 'capacidades 010');
  const capabilitySensitivity = new Map([
    ['time.source.read','standard'], ['time.source.propose','privileged'],
    ['time.source.approve','restricted'], ['time.source.audit.read','restricted'],
  ]);
  if ((evidence.capabilities || []).some((row) => row.scopeKind !== 'tenant'
      || capabilitySensitivity.get(row.key) !== row.sensitivity)) {
    throw new Error('metadata capacidades 010 invalida');
  }
  exactSet((evidence.roles || []).map((row) => row.key), [
    'JUNIN_TIEMPO_FUENTES_PROPONENTE','JUNIN_TIEMPO_FUENTES_APROBADOR',
  ], 'roles 010');
  if ((evidence.roles || []).some((row) => row.scopeKind !== 'tenant'
      || row.systemManaged !== true)) {
    throw new Error('metadata roles 010 invalida');
  }
  if (Number(evidence.crossTenantContracts) !== 0 || Number(evidence.crossTenantEvents) !== 0
      || Number(evidence.makerCheckerViolations) !== 0
      || Number(evidence.personSodViolations) !== 0 || Number(evidence.approvedOverlaps) !== 0) {
    throw new Error('invariantes tenant/maker-checker/overlap 010 incumplidas');
  }
  if (!Array.isArray(evidence.tableAcl)) throw new Error('inventario ACL tablas 010 ausente');
  exactSet(evidence.tableAcl.map((row) => row.name),
    ['time_source_contract','time_source_governance_event'], 'ACL tablas 010');
  for (const relation of evidence.tableAcl) {
    if (relation.ownerIsRuntime || relation.ownedByCurrentUser !== true
        || relation.publicPrivilegesRevoked !== true || relation.runtimePrivilegesRevoked !== true) {
      throw new Error(`ACL tabla 010 invalida ${relation.name}`);
    }
  }
  return true;
}

export function validateTimeSourceRuntimeAclEvidence(evidence) {
  const role = evidence.runtimeRole;
  if (!role || role.canLogin !== true || role.inherit === true || role.superuser === true
      || role.bypassRls === true || role.createDb === true || role.createRole === true
      || role.replication === true || role.membershipCount !== 0
      || role.schemaUsage !== true || role.schemaCreate === true) {
    throw new Error('rol runtime 010 no conserva LOGIN NOINHERIT');
  }
  const incoming = (evidence.roleMemberships || []).filter((row) => row.direction === 'member_of_runtime');
  const outgoing = (evidence.roleMemberships || []).filter((row) => row.direction === 'granted_to_runtime');
  if (outgoing.length || incoming.length > 1 || incoming.some((row) => (
    row.memberIsCurrentUser !== true || row.adminOption !== true
      || row.inheritOption !== false || row.setOption !== false
      || row.memberOwnsApprovedFunctions !== true
  ))) throw new Error('membresias runtime 010 permiten escalamiento');
  if (!Array.isArray(evidence.runtimeFunctions)
      || !Array.isArray(evidence.unexpectedSecurityDefiners)
      || !Array.isArray(evidence.relations) || !Array.isArray(evidence.sequences)) {
    throw new Error('inventario ACL runtime 010 incompleto');
  }
  exactSet(evidence.runtimeFunctions.map((row) => row.signature),
    EXPECTED_RUNTIME_FUNCTIONS, 'EXECUTE runtime 010');
  if (evidence.unexpectedSecurityDefiners.length) {
    throw new Error('runtime ejecuta SECURITY DEFINER fuera de allowlist 010');
  }
  const relationNames = new Set(evidence.relations.map((row) => row.name));
  if (!relationNames.has('time_source_contract')
      || !relationNames.has('time_source_governance_event')) {
    throw new Error('inventario relaciones runtime 010 incompleto');
  }
  for (const relation of evidence.relations) {
    if (relation.canSelect || relation.canInsert || relation.canUpdate || relation.canReferences
        || relation.canDelete || relation.canTruncate || relation.canTrigger) {
      throw new Error(`runtime conserva privilegio directo en ${relation.name}`);
    }
  }
  for (const sequence of evidence.sequences) {
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
      pg_get_functiondef(function_row.oid) AS definition
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE namespace.nspname = 'public'
      AND format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[])
  `, [RUNTIME_ROLE, SECURITY_FUNCTIONS]);
  const columns = await client.query(`
    SELECT table_row.relname AS table_name, attribute.attname AS name,
      format_type(attribute.atttypid, attribute.atttypmod) AS type,
      attribute.attnotnull AS "notNull",
      pg_get_expr(attribute_default.adbin, attribute_default.adrelid, true) AS "defaultExpression"
    FROM pg_attribute attribute
    JOIN pg_class table_row ON table_row.oid = attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid = table_row.relnamespace
    LEFT JOIN pg_attrdef attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    WHERE namespace.nspname = 'public'
      AND table_row.relname = ANY($1::text[])
      AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE
    ORDER BY table_row.relname, attribute.attnum
  `, [['time_source_contract','time_source_governance_event']]);
  const constraints = await client.query(`
    SELECT table_row.relname AS table_name, constraint_row.conname AS name,
      constraint_row.contype AS type, constraint_row.convalidated AS validated,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint constraint_row
    JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = table_row.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_row.relname = ANY($1::text[])
    ORDER BY table_row.relname, constraint_row.conname
  `, [['time_source_contract','time_source_governance_event']]);
  const indexes = await client.query(`
    SELECT index_row.relname AS name, table_row.relname AS "tableName",
      index_meta.indisunique AS unique, index_meta.indisvalid AS valid,
      index_meta.indisready AS ready,
      pg_get_expr(index_meta.indpred, index_meta.indrelid, true) AS predicate,
      pg_get_indexdef(index_meta.indexrelid) AS definition,
      to_jsonb(ARRAY(SELECT attribute.attname
        FROM unnest(index_meta.indkey) WITH ORDINALITY key_column(attnum, ordinality)
        JOIN pg_attribute attribute ON attribute.attrelid = index_meta.indrelid
          AND attribute.attnum = key_column.attnum
        WHERE key_column.ordinality <= index_meta.indnkeyatts
        ORDER BY key_column.ordinality)) AS columns
    FROM pg_index index_meta
    JOIN pg_class index_row ON index_row.oid = index_meta.indexrelid
    JOIN pg_class table_row ON table_row.oid = index_meta.indrelid
    JOIN pg_namespace namespace ON namespace.oid = index_row.relnamespace
    WHERE namespace.nspname = 'public' AND index_row.relname = ANY($1::text[])
  `, [[
    'time_source_contract_tenant_list_idx', 'time_source_contract_readiness_idx',
    'time_source_governance_event_timeline_idx',
  ]]);
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
      ], NULL)) AS events
    FROM pg_trigger trigger_row
    JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = table_row.relnamespace
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace function_namespace ON function_namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND trigger_row.tgisinternal IS FALSE
      AND trigger_row.tgname = ANY($1::text[])
  `, [[
    'time_source_contract_transition_guard_v1',
    'time_source_contract_approved_overlap_guard_v1',
    'time_source_governance_event_append_only_v1',
  ]]);
  const roleCapabilities = await client.query(`
    SELECT grant_row.role_key AS "roleKey", grant_row.capability_key AS "capabilityKey"
    FROM iam_role_capability grant_row
    WHERE grant_row.capability_key LIKE 'time.source.%'
    ORDER BY grant_row.role_key, grant_row.capability_key
  `);
  const conflicts = await client.query(`
    SELECT conflict.capability_key AS "left", conflict.conflicts_with_key AS "right"
    FROM iam_capability_conflict conflict
    WHERE conflict.capability_key LIKE 'time.source.%'
       OR conflict.conflicts_with_key LIKE 'time.source.%'
    ORDER BY conflict.capability_key, conflict.conflicts_with_key
  `);
  const capabilities = await client.query(`
    SELECT capability.capability_key AS key, capability.scope_kind AS "scopeKind",
      capability.sensitivity
    FROM iam_capability capability
    WHERE capability.capability_key LIKE 'time.source.%'
    ORDER BY capability.capability_key
  `);
  const roles = await client.query(`
    SELECT role_row.role_key AS key, role_row.scope_kind AS "scopeKind",
      role_row.system_managed AS "systemManaged"
    FROM iam_role role_row
    WHERE role_row.role_key IN (
      'JUNIN_TIEMPO_FUENTES_PROPONENTE','JUNIN_TIEMPO_FUENTES_APROBADOR'
    )
    ORDER BY role_row.role_key
  `);
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::integer FROM time_source_contract source
        LEFT JOIN platform_tenant_source_binding binding
          ON binding.tenant_id = source.tenant_id AND binding.id = source.certified_binding_id
        LEFT JOIN tenant_membership proposer
          ON proposer.id = source.proposer_membership_id AND proposer.tenant_id = source.tenant_id
        LEFT JOIN tenant_membership approver
          ON approver.id = source.approver_membership_id AND approver.tenant_id = source.tenant_id
        WHERE binding.id IS NULL OR proposer.id IS NULL
          OR (source.approver_membership_id IS NOT NULL AND approver.id IS NULL)
      ) AS "crossTenantContracts",
      (SELECT count(*)::integer FROM time_source_governance_event event
        LEFT JOIN time_source_contract source
          ON source.id = event.contract_id AND source.tenant_id = event.tenant_id
         AND source.certified_binding_id = event.contract_certified_binding_id
        LEFT JOIN platform_tenant_source_binding contract_binding
          ON contract_binding.tenant_id = event.tenant_id
         AND contract_binding.id = event.contract_certified_binding_id
        LEFT JOIN platform_tenant_source_binding actor_binding
          ON actor_binding.tenant_id = event.tenant_id
         AND actor_binding.id = event.actor_certified_binding_id
        LEFT JOIN tenant_membership membership
          ON membership.id = event.actor_membership_id AND membership.tenant_id = event.tenant_id
        WHERE source.id IS NULL OR contract_binding.id IS NULL
          OR actor_binding.id IS NULL OR membership.id IS NULL
      ) AS "crossTenantEvents",
      (SELECT count(*)::integer FROM time_source_contract source
        WHERE source.approver_person_id IS NOT NULL
          AND (source.approver_person_id = source.proposer_person_id
            OR source.approver_membership_id = source.proposer_membership_id)
      ) AS "makerCheckerViolations",
      (SELECT count(*)::integer FROM (
        SELECT membership.tenant_id, contract.person_id
        FROM tenant_membership membership
        JOIN tenant_action_employment_link link
          ON link.membership_id = membership.id AND link.tenant_id = membership.tenant_id
         AND link.active IS TRUE
        JOIN employment_contract contract
          ON contract.id = link.employment_contract_id AND contract.status = 'active'
        CROSS JOIN LATERAL tenant_iam_effective_capabilities(membership.id) effective
        WHERE membership.status = 'active'
          AND effective.capability_key IN (
            'time.source.propose','time.source.approve','time.overtime.post'
          )
        GROUP BY membership.tenant_id, contract.person_id
        HAVING (bool_or(effective.capability_key = 'time.source.propose')
              AND bool_or(effective.capability_key = 'time.source.approve'))
           OR (bool_or(effective.capability_key = 'time.source.approve')
              AND bool_or(effective.capability_key = 'time.overtime.post'))
      ) conflict) AS "personSodViolations",
      (SELECT count(*)::integer FROM time_source_contract left_source
        JOIN time_source_contract right_source
          ON right_source.id > left_source.id
         AND right_source.tenant_id = left_source.tenant_id
         AND right_source.domain = left_source.domain
         AND right_source.status = 'approved'
         AND right_source.coverage_from <= left_source.coverage_to
         AND right_source.coverage_to >= left_source.coverage_from
        WHERE left_source.status = 'approved'
      ) AS "approvedOverlaps"
  `);
  const tableAcl = await client.query(`
    SELECT relation.relname AS name,
      relation.relowner = current_user::regrole::oid AS "ownedByCurrentUser",
      relation.relowner = runtime_role.oid AS "ownerIsRuntime",
      NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(
        relation.relacl, acldefault('r', relation.relowner)
      )) acl WHERE acl.grantee = 0) AS "publicPrivilegesRevoked",
      NOT (has_any_column_privilege($1, relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
        OR has_table_privilege($1, relation.oid, 'DELETE,TRUNCATE,TRIGGER'))
        AS "runtimePrivilegesRevoked"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY($2::text[])
  `, [RUNTIME_ROLE, ['time_source_contract','time_source_governance_event']]);
  const columnRows = rows(columns);
  const constraintRows = rows(constraints);
  return {
    functions: rows(functions),
    contractColumns: columnRows.filter((row) => row.table_name === 'time_source_contract'),
    eventColumns: columnRows.filter((row) => row.table_name === 'time_source_governance_event'),
    contractConstraints: constraintRows.filter((row) => row.table_name === 'time_source_contract'),
    eventConstraints: constraintRows.filter((row) => row.table_name === 'time_source_governance_event'),
    indexes: rows(indexes), triggers: rows(triggers), roleCapabilities: rows(roleCapabilities),
    conflicts: rows(conflicts), capabilities: rows(capabilities), roles: rows(roles),
    tableAcl: rows(tableAcl),
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
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND function_row.prosecdef IS TRUE
      AND has_function_privilege($1, function_row.oid, 'EXECUTE')
  `, [RUNTIME_ROLE]);
  const unexpectedSecurityDefiners = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
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
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r','p','v','m','f')
  `, [RUNTIME_ROLE]);
  const sequences = await client.query(`
    SELECT relation.relname AS name,
      has_sequence_privilege($1, relation.oid, 'USAGE') AS "canUsage",
      has_sequence_privilege($1, relation.oid, 'SELECT') AS "canSelect",
      has_sequence_privilege($1, relation.oid, 'UPDATE') AS "canUpdate"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'S'
  `, [RUNTIME_ROLE]);
  return {
    runtimeRole: rows(runtimeRole)[0], roleMemberships: rows(roleMemberships),
    runtimeFunctions: rows(runtimeFunctions),
    unexpectedSecurityDefiners: rows(unexpectedSecurityDefiners),
    relations: rows(relations), sequences: rows(sequences),
  };
}

export async function verifyTimeSourceFinalAcl(client) {
  const lifecycle = await import('./apply-tenant-lifecycle-hardening-schema.mjs');
  if (typeof lifecycle.verifyTenantLifecycleBaseEvidence === 'function') {
    await lifecycle.verifyTenantLifecycleBaseEvidence(client);
  }
  validateTimeSourceEvidence(await collectEvidence(client));
  validateTimeSourceRuntimeAclEvidence(await collectRuntimeAclEvidence(client));
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateTimeSourceMigrationSql(migration);
  const checksum = createHash('sha256').update(migration).digest('hex');
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directCanonicalDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:time-source-010'))");
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [TIME_SOURCE_MIGRATION_VERSION],
    );
    if (existing.rowCount && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${TIME_SOURCE_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      const lifecycle = await import('./apply-tenant-lifecycle-hardening-schema.mjs');
      if (typeof lifecycle.verifyTenantLifecycleBaseEvidence === 'function') {
        await lifecycle.verifyTenantLifecycleBaseEvidence(client);
      } else {
        await lifecycle.verifyTenantLifecycleFinalAcl(client);
      }
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${TIME_SOURCE_MIGRATION_VERSION} sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [TIME_SOURCE_MIGRATION_VERSION, checksum],
      );
    }
    await verifyTimeSourceFinalAcl(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${TIME_SOURCE_MIGRATION_VERSION}: ya aplicada y verificada (SHA-256 ${checksum})`
      : `${TIME_SOURCE_MIGRATION_VERSION}: aplicada (${statements.length} sentencias, SHA-256 ${checksum})`);
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
