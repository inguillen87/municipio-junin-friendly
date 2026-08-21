import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directIsolatedDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import {
  TIME_SOURCE_MIGRATION_VERSION,
  TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST,
  TIME_SOURCE_SIGNATURES,
  verifyTimeSourceFinalAcl,
} from './apply-governed-time-source-registry-schema.mjs';

export const VERSIONED_TIME_CATALOG_MIGRATION_VERSION = '011-versioned-time-catalog';
const MIGRATION_URL = new URL('./migrations/011-versioned-time-catalog.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const PREREQUISITES = Object.freeze([
  ['003-action-center', new URL('./migrations/003-action-center.sql', import.meta.url)],
  ['004-tenant-iam-control-plane', new URL('./migrations/004-tenant-iam-control-plane.sql', import.meta.url)],
  ['005-tenant-identity-gateway', new URL('./migrations/005-tenant-identity-gateway.sql', import.meta.url)],
  ['006-tenant-action-authority', new URL('./migrations/006-tenant-action-authority.sql', import.meta.url)],
  ['007-action-center-read-facades', new URL('./migrations/007-action-center-read-facades.sql', import.meta.url)],
  ['008-governed-overtime-actions', new URL('./migrations/008-governed-overtime-actions.sql', import.meta.url)],
  ['009-tenant-lifecycle-hardening', new URL('./migrations/009-tenant-lifecycle-hardening.sql', import.meta.url)],
  [TIME_SOURCE_MIGRATION_VERSION, new URL('./migrations/010-governed-time-source-registry.sql', import.meta.url)],
]);

export const VERSIONED_TIME_CATALOG_SIGNATURES = Object.freeze({
  sourceMetadataRow: TIME_SOURCE_SIGNATURES.metadataRow,
  reasonAllowed: 'public.time_catalog_reason_allowed_v1(text,text)',
  parameterValue: 'public.time_catalog_parameter_value_valid_v1(text,bigint,numeric,boolean,time without time zone,text,text)',
  normalizedWeekSegments: 'public.time_catalog_normalized_week_segments_v1(smallint,time without time zone,time without time zone,boolean)',
  payload: 'public.time_catalog_payload_valid_v1(text,jsonb)',
  snapshot: 'public.time_catalog_entry_snapshot_v1(uuid,uuid)',
  approvable: 'public.time_catalog_assert_approvable_v1(uuid,uuid,uuid)',
  entryGuard: 'public.time_catalog_guard_entry_v1()',
  approvedOverlapGuard: 'public.time_catalog_guard_approved_overlap_v1()',
  childGuard: 'public.time_catalog_guard_draft_child_v1()',
  intervalOverlapGuard: 'public.time_catalog_guard_shift_interval_overlap_v1()',
  personSod: 'public.time_catalog_assert_person_sod_v1(uuid,uuid,uuid)',
  authority: 'public.time_catalog_assert_actor_authority_v1(jsonb,text)',
  principal: 'public.time_catalog_principal_projection_v1(jsonb)',
  bootstrap: 'public.time_catalog_bootstrap_v1(text,uuid,integer,text,uuid,uuid)',
  list: 'public.time_catalog_list_v1(text,uuid,integer,text,uuid,uuid,text,text,integer,integer)',
  detail: 'public.time_catalog_detail_v1(text,uuid,integer,text,uuid,uuid,uuid)',
  apply: 'public.time_catalog_apply_command_v1(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,text,text)',
});

export const VERSIONED_TIME_CATALOG_RUNTIME_FUNCTION_ALLOWLIST = Object.freeze([
  ...TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST,
  VERSIONED_TIME_CATALOG_SIGNATURES.bootstrap,
  VERSIONED_TIME_CATALOG_SIGNATURES.list,
  VERSIONED_TIME_CATALOG_SIGNATURES.detail,
  VERSIONED_TIME_CATALOG_SIGNATURES.apply,
]);

export const VERSIONED_TIME_CATALOG_TABLE_COLUMNS = Object.freeze({
  time_catalog_entry: [
    'id','tenant_id','certified_binding_id','catalog_kind','logical_key_hash','revision',
    'effective_from','effective_to','timezone','source_contract_id',
    'source_contract_certified_binding_id','status','version','proposer_person_id',
    'proposer_membership_id','approver_person_id','approver_membership_id','reason_code',
    'reason_hash','created_at','updated_at','submitted_at','decided_at','retired_at',
  ],
  time_calendar_day: [
    'catalog_entry_id','tenant_id','catalog_kind','day_date','day_kind','day_code','evidence_sha256',
  ],
  time_shift_spec: [
    'catalog_entry_id','tenant_id','catalog_kind','entry_tolerance_seconds','exit_tolerance_seconds',
  ],
  time_shift_weekly_interval: [
    'catalog_entry_id','tenant_id','catalog_kind','weekday','interval_sequence',
    'interval_kind','starts_at','ends_at','crosses_midnight',
  ],
  time_rule_parameter: [
    'catalog_entry_id','tenant_id','catalog_kind','parameter_key','value_kind','integer_value',
    'decimal_value','boolean_value','time_value','code_value','unit_code',
  ],
  time_assignment_spec: [
    'catalog_entry_id','tenant_id','catalog_kind','employment_contract_id','shift_entry_id',
    'shift_kind','calendar_entry_id','calendar_kind','rule_profile_entry_id','rule_profile_kind',
  ],
  time_catalog_governance_event: [
    'id','tenant_id','catalog_entry_id','catalog_certified_binding_id',
    'actor_certified_binding_id','actor_membership_id','actor_person_id','actor_session_id',
    'actor_session_version','release_sha','command','idempotency_key','command_hash',
    'expected_version','resulting_version','reason_code','reason_hash','before_snapshot',
    'after_snapshot','result','occurred_at',
  ],
});

export const VERSIONED_TIME_CATALOG_TABLES = Object.freeze(
  Object.keys(VERSIONED_TIME_CATALOG_TABLE_COLUMNS),
);

const EXPECTED_TRIGGERS = Object.freeze({
  time_catalog_entry_transition_guard_v1: ['time_catalog_entry','time_catalog_guard_entry_v1'],
  time_catalog_entry_approved_overlap_guard_v1: ['time_catalog_entry','time_catalog_guard_approved_overlap_v1'],
  time_calendar_day_draft_guard_v1: ['time_calendar_day','time_catalog_guard_draft_child_v1'],
  time_shift_spec_draft_guard_v1: ['time_shift_spec','time_catalog_guard_draft_child_v1'],
  time_shift_interval_draft_guard_v1: ['time_shift_weekly_interval','time_catalog_guard_draft_child_v1'],
  time_shift_interval_overlap_guard_v1: ['time_shift_weekly_interval','time_catalog_guard_shift_interval_overlap_v1'],
  time_rule_parameter_draft_guard_v1: ['time_rule_parameter','time_catalog_guard_draft_child_v1'],
  time_assignment_spec_draft_guard_v1: ['time_assignment_spec','time_catalog_guard_draft_child_v1'],
  time_catalog_event_append_only_v1: ['time_catalog_governance_event','tenant_iam_reject_change'],
});

const EXPECTED_INDEXES = Object.freeze({
  time_catalog_entry_tenant_list_idx: 'time_catalog_entry',
  time_catalog_entry_effective_idx: 'time_catalog_entry',
  time_calendar_day_date_idx: 'time_calendar_day',
  time_shift_interval_day_idx: 'time_shift_weekly_interval',
  time_assignment_contract_idx: 'time_assignment_spec',
  time_catalog_event_timeline_idx: 'time_catalog_governance_event',
});

const REQUIRED_CONSTRAINTS = Object.freeze([
  'time_catalog_entry_id_tenant_uk','time_catalog_entry_id_tenant_kind_uk',
  'time_catalog_entry_id_tenant_binding_uk','time_catalog_entry_logical_revision_uk',
  'time_catalog_entry_binding_fk','time_catalog_entry_source_contract_fk',
  'time_catalog_entry_proposer_membership_fk','time_catalog_entry_approver_membership_fk',
  'time_catalog_entry_effective_ck','time_catalog_entry_source_pair_ck',
  'time_catalog_entry_maker_checker_ck','time_catalog_entry_state_ck',
  'time_calendar_day_entry_fk','time_calendar_day_tenant_date_uk',
  'time_shift_spec_entry_fk','time_shift_spec_tolerance_ck',
  'time_shift_weekly_interval_entry_fk','time_shift_weekly_interval_shape_ck',
  'time_rule_parameter_entry_fk','time_rule_parameter_value_ck',
  'time_assignment_spec_entry_fk','time_assignment_spec_shift_fk',
  'time_assignment_spec_calendar_fk','time_assignment_spec_rule_fk',
  'time_catalog_governance_event_entry_fk','time_catalog_governance_event_catalog_binding_fk',
  'time_catalog_governance_event_actor_binding_fk','time_catalog_governance_event_membership_fk',
  'time_catalog_governance_event_idempotency_uk','time_catalog_governance_event_context_ck',
]);

const EXPECTED_RUNTIME_FUNCTIONS = new Set(VERSIONED_TIME_CATALOG_RUNTIME_FUNCTION_ALLOWLIST);
const SECURITY_FUNCTIONS = Object.freeze([...new Set([
  ...Object.values(VERSIONED_TIME_CATALOG_SIGNATURES),
])]);

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

export function versionedTimeCatalogFingerprint(sql) {
  return createHash('sha256').update(String(sql)).digest('hex');
}

export function validateVersionedTimeCatalogMigrationSql(sql) {
  const body = normalized(sql);
  requireTokens('migracion 011', body, [
    'create table if not exists time_catalog_entry',
    'create table if not exists time_calendar_day',
    'create table if not exists time_shift_spec',
    'create table if not exists time_shift_weekly_interval',
    'create table if not exists time_rule_parameter',
    'create table if not exists time_assignment_spec',
    'create table if not exists time_catalog_governance_event',
    "status in ('draft','submitted','approved','rejected','retired')",
    'logical_key_hash char(64)', 'revision integer not null',
    'effective_from date not null', 'effective_to date',
    'entry_tolerance_seconds', 'exit_tolerance_seconds',
    'crosses_midnight boolean not null default false', "'crossesmidnight'",
    'time_catalog_normalized_week_segments_v1', '604800::numeric',
    'employment_contract_id uuid not null references employment_contract',
    'time_catalog_approved_overlap', 'time_catalog_assignment_overlap',
    'time_catalog_shift_interval_overlap', 'time_catalog_separation_of_duties',
    'time-catalog-idempotency:', 'for update nowait',
    'expected_version', 'idempotency_key', 'before_snapshot', 'after_snapshot',
    "'catalogready', false", "'attendanceevaluationready', false",
    "'punchesloaded', false", "'minutescalculated', false",
    "'payrollposted', false", "'grhmutation', false",
    "'mariadb_dump','mysql_dump'",
    'revoke all privileges on table time_catalog_entry',
    'time_catalog_acl_hardening', 'aclexplode',
  ]);
  for (const command of ['create_draft','update_draft','submit','approve','reject','retire']) {
    if (!body.includes(`'${command}'`)) throw new Error(`falta comando ${command}`);
  }
  for (const state of ['draft','submitted','approved','rejected','retired']) {
    if (!body.includes(`'${state}'`)) throw new Error(`falta estado ${state}`);
  }
  if (/\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:public\.)?(?:grh_[a-z0-9_]*|payroll_[a-z0-9_]*|action_case(?:_event|_context)?|employment_contract|source_import_batch|time_source_contract)\b/i.test(sql)) {
    throw new Error('011 intenta DML sobre GRH/payroll/action_case/canonico/010A');
  }
  if (/\b(?:create|alter|drop)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?(?:public\.)?(?:grh_|payroll_|action_case|employment_contract|source_import_batch|time_source_contract)/i.test(sql)
      || /\balter\s+role\b/i.test(sql)
      || (sql.match(/\bexecute\s+format\s*\(/gi) || []).length !== 3) {
    throw new Error('011 contiene expansion de alcance o SQL dinamico prohibido');
  }
  if (/iam_role_capability[^;]+\('(?:platform_owner|tenant_admin|junin_tesoreria_carga|junin_rrhh_)/is.test(sql)) {
    throw new Error('011 amplia un rol preexistente');
  }
  if (/\b(?:calculated_minutes|worked_minutes|payroll_amount|gross_amount|net_amount)\b/i.test(sql)) {
    throw new Error('011 incorpora resultados de calculo o nomina');
  }
  const snapshotStart = body.indexOf('create or replace function time_catalog_entry_snapshot_v1');
  const approvableStart = body.indexOf('create or replace function time_catalog_assert_approvable_v1');
  if (!(snapshotStart >= 0 && approvableStart > snapshotStart)) throw new Error('snapshot 011 ausente');
  const snapshot = body.slice(snapshotStart, approvableStart);
  requireTokens('snapshot seguro 011', snapshot, [
    "'targettype', 'canonical_employment_contract'", "'targetprojected', false",
    "'sourcelinked'", "'configuration'", "'crossesmidnight'", 'interval.crosses_midnight',
  ]);
  for (const forbidden of [
    "'legajo'", "'employmentcontractid'", "'logicalkeyhash'", "'sourcecontractid'",
    "'certifiedbindingid'", "'proposerpersonid'", "'approverpersonid'", "'evidencesha256'",
  ]) {
    if (snapshot.includes(forbidden)) throw new Error(`snapshot 011 proyecta ${forbidden}`);
  }
  const principalStart = body.indexOf('create or replace function time_catalog_principal_projection_v1');
  const bootstrapStart = body.indexOf('create or replace function time_catalog_bootstrap_v1');
  if (!(principalStart >= 0 && bootstrapStart > principalStart)) throw new Error('principal seguro 011 ausente');
  requireTokens('principal seguro 011', body.slice(principalStart, bootstrapStart), [
    "'actorpersonid'", "'sourcedatabase'", "'sourcecompanyid'", "'certifiedbindingid'",
    "'employmentcontractid'", "'membershipid'", "'tenantid'", "'sessionid'",
  ]);
  const applyStart = body.indexOf('create or replace function time_catalog_apply_command_v1');
  const commentsStart = body.indexOf('comment on table time_catalog_entry', applyStart);
  if (!(applyStart >= 0 && commentsStart > applyStart)) throw new Error('apply/ACL 011 fuera de orden');
  const applyBody = body.slice(applyStart, commentsStart);
  const replayAt = applyBody.indexOf('select * into existing_event');
  const versionLockAt = applyBody.indexOf('for update nowait');
  if (!(replayAt >= 0 && versionLockAt > replayAt)) throw new Error('replay 011 ocurre despues del lock de version');
  requireTokens('apply 011', applyBody, [
    'time_source_assert_tenant_session_v1', 'time_catalog_assert_actor_authority_v1',
    'time_catalog_version_conflict', 'time_catalog_idempotency_reused',
    'insert into time_catalog_governance_event', "'historical'", "'replayed', true",
  ]);
  return true;
}

function validateColumns(tableColumns) {
  const grouped = new Map(VERSIONED_TIME_CATALOG_TABLES.map((table) => [table, []]));
  for (const column of tableColumns || []) {
    if (!grouped.has(column.tableName)) throw new Error(`columna 011 en tabla inesperada ${column.tableName}`);
    grouped.get(column.tableName).push(column.name);
  }
  for (const [table, expected] of Object.entries(VERSIONED_TIME_CATALOG_TABLE_COLUMNS)) {
    if (JSON.stringify(grouped.get(table) || []) !== JSON.stringify(expected)) {
      throw new Error(`columnas 011 con drift en ${table}`);
    }
  }
}

function validateFunctions(functionRows) {
  const functions = new Map((functionRows || []).map((row) => [row.signature, row]));
  exactSet(functions.keys(), SECURITY_FUNCTIONS, 'funciones seguridad 011');
  for (const signature of SECURITY_FUNCTIONS) {
    const fn = functions.get(signature);
    if (!fn || fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
        || fn.ownerIsRuntime === true || fn.publicExecuteRevoked !== true
        || !Array.isArray(fn.config)
        || !fn.config.map(normalized).includes('search_path=public, pg_temp')) {
      throw new Error(`funcion insegura ${signature}`);
    }
  }
  requireTokens('source format 011', functions.get(VERSIONED_TIME_CATALOG_SIGNATURES.sourceMetadataRow)?.definition, [
    "'mariadb_dump'", "'mysql_dump'", "'postgres_relation'",
  ]);
  requireTokens('SoD persona 011', functions.get(VERSIONED_TIME_CATALOG_SIGNATURES.personSod)?.definition, [
    'contract.person_id = p_actor_person_id', 'tenant_iam_assert_no_sod_conflict',
    "'time.catalog.propose'", "'time.catalog.approve'", "'time.overtime.post'",
    'time_catalog_person_sod_conflict',
  ]);
  requireTokens('authority 011', functions.get(VERSIONED_TIME_CATALOG_SIGNATURES.authority)?.definition, [
    'time_catalog_assert_person_sod_v1', 'tenant_iam_effective_capabilities',
    'time_catalog_capability_required',
  ]);
  requireTokens('approvable 011', functions.get(VERSIONED_TIME_CATALOG_SIGNATURES.approvable)?.definition, [
    "source.status = 'approved'", "'holiday_calendar'", "'municipal_rule_profile'",
    "else 'shift_assignment'", 'time_catalog_assignment_contract_invalid',
    'time_catalog_assignment_dependency_invalid',
  ]);
  requireTokens('guard entry 011', functions.get(VERSIONED_TIME_CATALOG_SIGNATURES.entryGuard)?.definition, [
    "tg_op = 'delete'", 'time_catalog_delete_forbidden',
    'new.version is distinct from old.version + 1',
    "old.status = 'draft' and new.status = 'submitted'",
    "old.status = 'submitted' and new.status in ('approved','rejected')",
    "old.status = 'approved' and new.status = 'retired'",
    'time_catalog_assert_approvable_v1',
  ]);
  requireTokens('overlap aprobado 011', functions.get(VERSIONED_TIME_CATALOG_SIGNATURES.approvedOverlapGuard)?.definition, [
    'time-catalog-coverage:', 'time-catalog-assignment:',
    'time_catalog_approved_overlap', 'time_catalog_assignment_overlap',
  ]);
  requireTokens('payload 011', functions.get(VERSIONED_TIME_CATALOG_SIGNATURES.payload)?.definition, [
    "p_catalog_kind = 'calendar'", "p_catalog_kind = 'shift'",
    "p_catalog_kind = 'rule_profile'", "else", 'jsonb_object_keys',
    'time_catalog_parameter_value_valid_v1', "'crossesmidnight'",
    'time_catalog_normalized_week_segments_v1',
    'left_segment.segment_start < right_segment.segment_end',
  ]);
  requireTokens('normalizacion semanal 011', functions.get(
    VERSIONED_TIME_CATALOG_SIGNATURES.normalizedWeekSegments
  )?.definition, [
    'p_crosses_midnight', 'normalized_start', 'normalized_end',
    '604800::numeric', 'union all', 'p_starts_at > p_ends_at',
  ]);
  requireTokens('overlap intervalos 011', functions.get(
    VERSIONED_TIME_CATALOG_SIGNATURES.intervalOverlapGuard
  )?.definition, [
    'time_catalog_normalized_week_segments_v1', 'existing.crosses_midnight',
    'new.crosses_midnight',
    'existing_segment.segment_start < new_segment.segment_end',
    'new_segment.segment_start < existing_segment.segment_end',
    'time_catalog_shift_interval_overlap',
  ]);
  requireTokens('apply 011 instalado', functions.get(VERSIONED_TIME_CATALOG_SIGNATURES.apply)?.definition, [
    'time-catalog-idempotency:', 'for update nowait', 'time_catalog_version_conflict',
    'time_catalog_separation_of_duties', 'insert into time_catalog_governance_event',
    'crosses_midnight', "item->>'crossesmidnight'",
  ]);
}

export function validateVersionedTimeCatalogEvidence(evidence) {
  validateColumns(evidence?.tableColumns);
  const constraintNames = new Set((evidence?.constraints || []).map((row) => row.name));
  for (const name of REQUIRED_CONSTRAINTS) {
    const row = (evidence?.constraints || []).find((candidate) => candidate.name === name);
    if (!constraintNames.has(name) || row?.validated !== true) {
      throw new Error(`constraint 011 ausente o invalida ${name}`);
    }
  }
  exactSet((evidence?.triggers || []).map((row) => row.name), Object.keys(EXPECTED_TRIGGERS), 'triggers 011');
  for (const trigger of evidence?.triggers || []) {
    const expected = EXPECTED_TRIGGERS[trigger.name];
    if (!expected || trigger.tableName !== expected[0] || trigger.functionName !== expected[1]
        || trigger.enabled !== 'O' || trigger.functionSchema !== 'public') {
      throw new Error(`trigger 011 invalido ${trigger.name}`);
    }
  }
  exactSet((evidence?.indexes || []).map((row) => row.name), Object.keys(EXPECTED_INDEXES), 'indices 011');
  for (const index of evidence?.indexes || []) {
    if (index.tableName !== EXPECTED_INDEXES[index.name] || index.unique === true
        || index.valid !== true || index.ready !== true || index.predicate != null) {
      throw new Error(`indice 011 invalido ${index.name}`);
    }
  }
  validateFunctions(evidence?.functions);
  exactSet((evidence?.capabilities || []).map((row) => row.key), [
    'time.catalog.read','time.catalog.propose','time.catalog.approve','time.catalog.audit.read',
  ], 'capacidades 011');
  for (const capability of evidence?.capabilities || []) {
    const sensitivity = capability.key === 'time.catalog.read' ? 'standard'
      : capability.key === 'time.catalog.propose' ? 'privileged' : 'restricted';
    if (capability.scopeKind !== 'tenant' || capability.sensitivity !== sensitivity) {
      throw new Error(`metadata capacidad 011 invalida ${capability.key}`);
    }
  }
  exactSet((evidence?.roles || []).map((row) => row.key), [
    'JUNIN_TIEMPO_CATALOGO_PROPONENTE','JUNIN_TIEMPO_CATALOGO_APROBADOR',
  ], 'roles 011');
  if ((evidence?.roles || []).some((row) => row.scopeKind !== 'tenant' || row.systemManaged !== true)) {
    throw new Error('metadata roles 011 invalida');
  }
  exactSet((evidence?.roleCapabilities || []).map((row) => `${row.roleKey}:${row.capabilityKey}`), [
    'JUNIN_TIEMPO_CATALOGO_PROPONENTE:time.catalog.read',
    'JUNIN_TIEMPO_CATALOGO_PROPONENTE:time.catalog.propose',
    'JUNIN_TIEMPO_CATALOGO_APROBADOR:time.catalog.read',
    'JUNIN_TIEMPO_CATALOGO_APROBADOR:time.catalog.approve',
    'JUNIN_TIEMPO_CATALOGO_APROBADOR:time.catalog.audit.read',
  ], 'grants roles 011');
  exactSet((evidence?.conflicts || []).map((row) => `${row.left}:${row.right}`), [
    'time.catalog.approve:time.catalog.propose',
    'time.overtime.post:time.catalog.approve',
  ], 'conflictos SoD 011');
  for (const key of [
    'crossTenantEntries','crossTenantChildren','crossTenantEvents','makerCheckerViolations',
    'approvedOverlaps','assignmentOverlaps','approvedIncomplete','personSodViolations',
  ]) {
    if (evidence?.[key] !== 0) throw new Error(`invariantes 011 violadas ${key}`);
  }
  if (!Array.isArray(evidence?.tableAcl) || !Array.isArray(evidence?.sequenceAcl)) {
    throw new Error('inventario ACL datos 011 incompleto');
  }
  exactSet(evidence.tableAcl.map((row) => row.name), VERSIONED_TIME_CATALOG_TABLES, 'ACL tablas 011');
  if (evidence.tableAcl.some((row) => row.ownedByCurrentUser !== true
      || row.ownerIsRuntime === true || row.publicPrivilegesRevoked !== true
      || row.runtimePrivilegesRevoked !== true
      || !Array.isArray(row.nonOwnerPrivilegeGrantees)
      || row.nonOwnerPrivilegeGrantees.length !== 0)) {
    throw new Error('ACL tablas 011 conserva grantee no-owner');
  }
  if (evidence.sequenceAcl.some((row) => row.ownedByCurrentUser !== true
      || row.ownerIsRuntime === true || row.publicPrivilegesRevoked !== true
      || row.runtimePrivilegesRevoked !== true
      || !Array.isArray(row.nonOwnerPrivilegeGrantees)
      || row.nonOwnerPrivilegeGrantees.length !== 0)) {
    throw new Error('ACL secuencias 011 conserva grantee no-owner');
  }
  return true;
}

export function validateVersionedTimeCatalogRuntimeAclEvidence(evidence) {
  const role = evidence?.runtimeRole;
  if (!role || role.canLogin !== true || role.inherit !== false || role.superuser !== false
      || role.bypassRls !== false || role.createDb !== false || role.createRole !== false
      || role.replication !== false || role.membershipCount !== 0
      || role.schemaUsage !== true || role.schemaCreate !== false) {
    throw new Error('runtime 011 debe conservar LOGIN NOINHERIT sin atributos elevados');
  }
  if (!Array.isArray(evidence?.unexpectedSecurityDefiners)
      || !Array.isArray(evidence?.relations) || !Array.isArray(evidence?.sequences)
      || !Array.isArray(evidence?.runtimeFunctions) || !Array.isArray(evidence?.roleMemberships)) {
    throw new Error('inventario ACL runtime 011 incompleto');
  }
  const incoming = evidence.roleMemberships.filter((row) => row.direction === 'member_of_runtime');
  const outgoing = evidence.roleMemberships.filter((row) => row.direction === 'granted_to_runtime');
  if (outgoing.length || incoming.length > 1 || incoming.some((row) => (
    row.memberIsCurrentUser !== true || row.adminOption !== true
      || row.inheritOption !== false || row.setOption !== false
      || row.memberOwnsApprovedFunctions !== true
  ))) {
    throw new Error('membresias runtime 011 permiten escalamiento fuera de la arista Neon');
  }
  if (evidence.unexpectedSecurityDefiners.length) {
    throw new Error('runtime 011 conserva SECDEF inesperadas');
  }
  exactSet(evidence.runtimeFunctions.map((row) => row.signature), EXPECTED_RUNTIME_FUNCTIONS, 'EXECUTE runtime 011');
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
    version,
    createHash('sha256').update(await readFile(url, 'utf8')).digest('hex'),
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
      pg_get_functiondef(function_row.oid) AS definition
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE namespace.nspname = 'public'
      AND format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[])
  `, [RUNTIME_ROLE, SECURITY_FUNCTIONS]);
  const tableColumns = await client.query(`
    SELECT relation.relname AS "tableName", attribute.attname AS name,
      format_type(attribute.atttypid, attribute.atttypmod) AS type,
      attribute.attnotnull AS "notNull"
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY($1::text[])
      AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE
    ORDER BY relation.relname, attribute.attnum
  `, [VERSIONED_TIME_CATALOG_TABLES]);
  const constraints = await client.query(`
    SELECT constraint_row.conname AS name, constraint_row.convalidated AS validated,
      relation.relname AS "tableName", constraint_row.contype AS type,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname, constraint_row.conname
  `, [VERSIONED_TIME_CATALOG_TABLES]);
  const triggers = await client.query(`
    SELECT trigger_row.tgname AS name, trigger_row.tgenabled AS enabled,
      relation.relname AS "tableName", function_namespace.nspname AS "functionSchema",
      function_row.proname AS "functionName"
    FROM pg_trigger trigger_row
    JOIN pg_class relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace function_namespace ON function_namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND trigger_row.tgisinternal IS FALSE
      AND trigger_row.tgname = ANY($1::text[])
  `, [Object.keys(EXPECTED_TRIGGERS)]);
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
  const capabilities = await client.query(`
    SELECT capability.capability_key AS key, capability.scope_kind AS "scopeKind",
      capability.sensitivity
    FROM iam_capability capability
    WHERE capability.capability_key LIKE 'time.catalog.%'
    ORDER BY capability.capability_key
  `);
  const roles = await client.query(`
    SELECT role_row.role_key AS key, role_row.scope_kind AS "scopeKind",
      role_row.system_managed AS "systemManaged"
    FROM iam_role role_row
    WHERE role_row.role_key IN (
      'JUNIN_TIEMPO_CATALOGO_PROPONENTE','JUNIN_TIEMPO_CATALOGO_APROBADOR'
    ) ORDER BY role_row.role_key
  `);
  const roleCapabilities = await client.query(`
    SELECT grant_row.role_key AS "roleKey", grant_row.capability_key AS "capabilityKey"
    FROM iam_role_capability grant_row
    WHERE grant_row.capability_key LIKE 'time.catalog.%'
    ORDER BY grant_row.role_key, grant_row.capability_key
  `);
  const conflicts = await client.query(`
    SELECT conflict.capability_key AS "left", conflict.conflicts_with_key AS "right"
    FROM iam_capability_conflict conflict
    WHERE conflict.capability_key LIKE 'time.catalog.%'
       OR conflict.conflicts_with_key LIKE 'time.catalog.%'
    ORDER BY conflict.capability_key, conflict.conflicts_with_key
  `);
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::integer
       FROM time_catalog_entry entry
       LEFT JOIN platform_tenant_source_binding binding
         ON binding.id = entry.certified_binding_id AND binding.tenant_id = entry.tenant_id
       LEFT JOIN tenant_membership proposer
         ON proposer.id = entry.proposer_membership_id AND proposer.tenant_id = entry.tenant_id
       LEFT JOIN tenant_membership approver
         ON approver.id = entry.approver_membership_id AND approver.tenant_id = entry.tenant_id
       LEFT JOIN time_source_contract source
         ON source.id = entry.source_contract_id AND source.tenant_id = entry.tenant_id
        AND source.certified_binding_id = entry.source_contract_certified_binding_id
       WHERE binding.id IS NULL OR proposer.id IS NULL
          OR (entry.approver_membership_id IS NOT NULL AND approver.id IS NULL)
          OR (entry.source_contract_id IS NOT NULL AND source.id IS NULL)
      ) AS "crossTenantEntries",
      (SELECT count(*)::integer FROM (
        SELECT day.catalog_entry_id FROM time_calendar_day day
        LEFT JOIN time_catalog_entry entry
          ON entry.id = day.catalog_entry_id AND entry.tenant_id = day.tenant_id
         AND entry.catalog_kind = day.catalog_kind WHERE entry.id IS NULL
        UNION ALL
        SELECT spec.catalog_entry_id FROM time_shift_spec spec
        LEFT JOIN time_catalog_entry entry
          ON entry.id = spec.catalog_entry_id AND entry.tenant_id = spec.tenant_id
         AND entry.catalog_kind = spec.catalog_kind WHERE entry.id IS NULL
        UNION ALL
        SELECT interval.catalog_entry_id FROM time_shift_weekly_interval interval
        LEFT JOIN time_catalog_entry entry
          ON entry.id = interval.catalog_entry_id AND entry.tenant_id = interval.tenant_id
         AND entry.catalog_kind = interval.catalog_kind WHERE entry.id IS NULL
        UNION ALL
        SELECT parameter.catalog_entry_id FROM time_rule_parameter parameter
        LEFT JOIN time_catalog_entry entry
          ON entry.id = parameter.catalog_entry_id AND entry.tenant_id = parameter.tenant_id
         AND entry.catalog_kind = parameter.catalog_kind WHERE entry.id IS NULL
        UNION ALL
        SELECT assignment.catalog_entry_id FROM time_assignment_spec assignment
        LEFT JOIN time_catalog_entry entry
          ON entry.id = assignment.catalog_entry_id AND entry.tenant_id = assignment.tenant_id
         AND entry.catalog_kind = assignment.catalog_kind WHERE entry.id IS NULL
      ) invalid_child) AS "crossTenantChildren",
      (SELECT count(*)::integer
       FROM time_catalog_governance_event event
       LEFT JOIN time_catalog_entry entry
         ON entry.id = event.catalog_entry_id AND entry.tenant_id = event.tenant_id
        AND entry.certified_binding_id = event.catalog_certified_binding_id
       LEFT JOIN platform_tenant_source_binding actor_binding
         ON actor_binding.id = event.actor_certified_binding_id
        AND actor_binding.tenant_id = event.tenant_id
       LEFT JOIN tenant_membership membership
         ON membership.id = event.actor_membership_id AND membership.tenant_id = event.tenant_id
       WHERE entry.id IS NULL OR actor_binding.id IS NULL OR membership.id IS NULL
      ) AS "crossTenantEvents",
      (SELECT count(*)::integer FROM time_catalog_entry entry
       WHERE entry.approver_person_id IS NOT NULL
         AND (entry.approver_person_id = entry.proposer_person_id
           OR entry.approver_membership_id = entry.proposer_membership_id)
      ) AS "makerCheckerViolations",
      (SELECT count(*)::integer FROM time_catalog_entry left_entry
       JOIN time_catalog_entry right_entry
         ON right_entry.id > left_entry.id
        AND right_entry.tenant_id = left_entry.tenant_id
        AND right_entry.catalog_kind = left_entry.catalog_kind
        AND right_entry.logical_key_hash = left_entry.logical_key_hash
        AND right_entry.status = 'approved'
        AND right_entry.effective_from <= COALESCE(left_entry.effective_to, DATE 'infinity')
        AND left_entry.effective_from <= COALESCE(right_entry.effective_to, DATE 'infinity')
       WHERE left_entry.status = 'approved'
      ) AS "approvedOverlaps",
      (SELECT count(*)::integer FROM time_catalog_entry left_entry
       JOIN time_assignment_spec left_assignment
         ON left_assignment.catalog_entry_id = left_entry.id
        AND left_assignment.tenant_id = left_entry.tenant_id
       JOIN time_assignment_spec right_assignment
         ON right_assignment.tenant_id = left_assignment.tenant_id
        AND right_assignment.employment_contract_id = left_assignment.employment_contract_id
        AND right_assignment.catalog_entry_id > left_assignment.catalog_entry_id
       JOIN time_catalog_entry right_entry
         ON right_entry.id = right_assignment.catalog_entry_id
        AND right_entry.tenant_id = right_assignment.tenant_id
        AND right_entry.status = 'approved'
        AND right_entry.effective_from <= COALESCE(left_entry.effective_to, DATE 'infinity')
        AND left_entry.effective_from <= COALESCE(right_entry.effective_to, DATE 'infinity')
       WHERE left_entry.status = 'approved'
      ) AS "assignmentOverlaps",
      (SELECT count(*)::integer FROM time_catalog_entry entry
       WHERE entry.status = 'approved' AND (
         (entry.catalog_kind = 'calendar' AND NOT EXISTS (
           SELECT 1 FROM time_calendar_day day WHERE day.catalog_entry_id = entry.id
         )) OR (entry.catalog_kind = 'shift' AND NOT EXISTS (
           SELECT 1 FROM time_shift_spec spec
           JOIN time_shift_weekly_interval interval
             ON interval.catalog_entry_id = spec.catalog_entry_id
            AND interval.interval_kind = 'work'
           WHERE spec.catalog_entry_id = entry.id
         )) OR (entry.catalog_kind = 'rule_profile' AND NOT EXISTS (
           SELECT 1 FROM time_rule_parameter parameter
           WHERE parameter.catalog_entry_id = entry.id
         )) OR (entry.catalog_kind = 'assignment' AND NOT EXISTS (
           SELECT 1 FROM time_assignment_spec assignment
           WHERE assignment.catalog_entry_id = entry.id
         ))
       )) AS "approvedIncomplete",
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
            'time.catalog.propose','time.catalog.approve','time.overtime.post'
          )
        GROUP BY membership.tenant_id, contract.person_id
        HAVING (bool_or(effective.capability_key = 'time.catalog.propose')
              AND bool_or(effective.capability_key = 'time.catalog.approve'))
           OR (bool_or(effective.capability_key = 'time.catalog.approve')
              AND bool_or(effective.capability_key = 'time.overtime.post'))
      ) conflict) AS "personSodViolations"
  `);
  const tableAcl = await client.query(`
    SELECT relation.relname AS name,
      relation.relowner = current_user::regrole::oid AS "ownedByCurrentUser",
      relation.relowner = runtime_role.oid AS "ownerIsRuntime",
      NOT EXISTS (SELECT 1 FROM (
        SELECT acl.grantee
        FROM aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) acl
        UNION ALL
        SELECT acl.grantee FROM pg_attribute attribute
        CROSS JOIN LATERAL aclexplode(COALESCE(attribute.attacl, '{}'::aclitem[])) acl
        WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0
          AND attribute.attisdropped IS FALSE
      ) grants WHERE grants.grantee = 0) AS "publicPrivilegesRevoked",
      NOT (has_any_column_privilege($1, relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
        OR has_table_privilege($1, relation.oid, 'DELETE,TRUNCATE,TRIGGER'))
        AS "runtimePrivilegesRevoked",
      ARRAY(SELECT DISTINCT COALESCE(grantee_role.rolname, 'PUBLIC')
        FROM (
          SELECT acl.grantee
          FROM aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) acl
          UNION ALL
          SELECT acl.grantee FROM pg_attribute attribute
          CROSS JOIN LATERAL aclexplode(COALESCE(attribute.attacl, '{}'::aclitem[])) acl
          WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0
            AND attribute.attisdropped IS FALSE
        ) grants
        LEFT JOIN pg_roles grantee_role ON grantee_role.oid = grants.grantee
        WHERE grants.grantee <> relation.relowner
        ORDER BY COALESCE(grantee_role.rolname, 'PUBLIC'))
        AS "nonOwnerPrivilegeGrantees"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($2::text[])
  `, [RUNTIME_ROLE, VERSIONED_TIME_CATALOG_TABLES]);
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
      ARRAY(SELECT DISTINCT COALESCE(grantee_role.rolname, 'PUBLIC')
        FROM aclexplode(COALESCE(
          sequence_row.relacl, acldefault('S', sequence_row.relowner)
        )) acl
        LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
        WHERE acl.grantee <> sequence_row.relowner
        ORDER BY COALESCE(grantee_role.rolname, 'PUBLIC'))
        AS "nonOwnerPrivilegeGrantees"
    FROM sensitive_sequences sequence_row
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    ORDER BY sequence_row.relname
  `, [RUNTIME_ROLE, VERSIONED_TIME_CATALOG_TABLES]);
  return {
    functions: rows(functions), tableColumns: rows(tableColumns), constraints: rows(constraints),
    triggers: rows(triggers), indexes: rows(indexes), capabilities: rows(capabilities),
    roles: rows(roles), roleCapabilities: rows(roleCapabilities), conflicts: rows(conflicts),
    tableAcl: rows(tableAcl), sequenceAcl: rows(sequenceAcl),
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

export async function verifyVersionedTimeCatalogFinalAcl(client) {
  validateVersionedTimeCatalogEvidence(await collectEvidence(client));
  validateVersionedTimeCatalogRuntimeAclEvidence(await collectRuntimeAclEvidence(client));
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateVersionedTimeCatalogMigrationSql(migration);
  const fingerprint = versionedTimeCatalogFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directIsolatedDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:time-catalog-011'))");
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [VERSIONED_TIME_CATALOG_MIGRATION_VERSION],
    );
    if (existing.rowCount && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${VERSIONED_TIME_CATALOG_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyTimeSourceFinalAcl(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${VERSIONED_TIME_CATALOG_MIGRATION_VERSION} sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [VERSIONED_TIME_CATALOG_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyVersionedTimeCatalogFinalAcl(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${VERSIONED_TIME_CATALOG_MIGRATION_VERSION}: reapply verificado (fingerprint SHA-256 ${fingerprint})`
      : `${VERSIONED_TIME_CATALOG_MIGRATION_VERSION}: fresh apply (${statements.length} sentencias, fingerprint SHA-256 ${fingerprint})`);
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
