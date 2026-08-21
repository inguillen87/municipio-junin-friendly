import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const OVERTIME_MIGRATION_VERSION = '008-governed-overtime-actions';
const MIGRATION_URL = new URL('./migrations/008-governed-overtime-actions.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const PREREQUISITES = Object.freeze([
  ['003-action-center', new URL('./migrations/003-action-center.sql', import.meta.url)],
  ['004-tenant-iam-control-plane', new URL('./migrations/004-tenant-iam-control-plane.sql', import.meta.url)],
  ['005-tenant-identity-gateway', new URL('./migrations/005-tenant-identity-gateway.sql', import.meta.url)],
  ['006-tenant-action-authority', new URL('./migrations/006-tenant-action-authority.sql', import.meta.url)],
  ['007-action-center-read-facades', new URL('./migrations/007-action-center-read-facades.sql', import.meta.url)],
]);

export const OVERTIME_SIGNATURES = Object.freeze({
  payload: 'public.action_center_valid_overtime_payload(jsonb)',
  decisionReason: 'public.action_center_valid_overtime_decision_reason_v1(text,text)',
  decider: 'public.action_center_overtime_decider_separated_v1(uuid,uuid,uuid,text,uuid)',
  mutationContext: 'public.action_center_overtime_mutation_context_v1(text,uuid,integer,text,uuid,uuid,uuid)',
  apply: 'public.action_center_apply_overtime_command_v1(text,uuid,integer,text,uuid,uuid,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,boolean)',
  readContext: 'public.action_center_overtime_read_context_v1(text,uuid,integer,text,uuid,uuid)',
  exclusive: 'public.action_center_overtime_has_exclusive_entry_v1(jsonb)',
  bootstrap: 'public.action_center_overtime_bootstrap_v1(text,uuid,integer,text,uuid,uuid,text)',
  list: 'public.action_center_overtime_list_v1(text,uuid,integer,text,uuid,uuid,text,integer,integer)',
  detail: 'public.action_center_overtime_detail_v1(text,uuid,integer,text,uuid,uuid,uuid)',
  routing: 'public.action_center_overtime_routing_v1(text,uuid,integer,text,uuid,uuid,uuid)',
});

const OVERTIME_RUNTIME_FUNCTIONS = Object.freeze([
  OVERTIME_SIGNATURES.apply,
  OVERTIME_SIGNATURES.bootstrap,
  OVERTIME_SIGNATURES.list,
  OVERTIME_SIGNATURES.detail,
  OVERTIME_SIGNATURES.routing,
]);
// Snapshot explícito del contrato runtime 007. No importar el aplicador 007:
// ese aplicador delega dinámicamente a este gate cuando 008 está registrada y
// una dependencia ESM circular con top-level await bloquearía el reverify.
const ACTION_READ_RUNTIME_FUNCTION_ALLOWLIST = Object.freeze([
  'public.action_center_context_v2(text,uuid,integer,text,uuid,uuid)',
  'public.action_center_tenant_bootstrap_v2(text,uuid,integer,text,uuid,uuid,text)',
  'public.action_center_tenant_list_v2(text,uuid,integer,text,uuid,uuid,text,text,text,integer,integer)',
  'public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)',
  'public.action_center_tenant_routing_v2(text,uuid,integer,text,uuid,uuid,uuid)',
  'public.action_center_apply_tenant_command(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)',
  'public.tenant_action_apply_provisioning_command(text,uuid,uuid,uuid,text,uuid,text,integer,jsonb)',
  'public.tenant_iam_admin_view_v2(text,uuid,integer,text,integer)',
  'public.tenant_iam_apply_command_v2(text,uuid,integer,text,uuid,text,integer,jsonb)',
  'public.tenant_identity_resolve_access(text,uuid,integer,integer,text[],text)',
  'public.tenant_identity_take_rate_limit(text,text,integer,integer,integer)',
  'public.tenant_identity_record_attempt(text,boolean,bigint)',
  'public.tenant_identity_lookup(text,text,text,text)',
  'public.tenant_identity_command_replay(text,uuid,text)',
  'public.tenant_identity_view(text,uuid,text,integer)',
  'public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)',
  'public.tenant_identity_legacy_session_policy(text)',
]);
const EXPECTED_RUNTIME_FUNCTIONS = new Set([
  ...ACTION_READ_RUNTIME_FUNCTION_ALLOWLIST,
  ...OVERTIME_RUNTIME_FUNCTIONS,
]);
export const OVERTIME_RUNTIME_FUNCTION_ALLOWLIST = Object.freeze([...EXPECTED_RUNTIME_FUNCTIONS]);
const DEPENDENCIES = Object.freeze([
  'public.tenant_iam_effective_capabilities(uuid)',
  'public.tenant_iam_assert_no_sod_conflict(uuid)',
  'public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)',
  'public.action_center_context_has_capability(jsonb,text)',
  'public.action_center_context_has_area_scope(jsonb,text,bigint,text,text)',
  'public.action_center_context_nominal_read(jsonb,uuid,bigint,text,text,text)',
  'public.action_center_tenant_actor_authorized(text,uuid,uuid,text,uuid,bigint,text,text,text,text)',
  'public.action_center_set_tenant_command_context(text,text,uuid,uuid,uuid,uuid,uuid,text,uuid,text,jsonb)',
]);
const SECURITY_FUNCTIONS = Object.freeze([...new Set([
  ...Object.values(OVERTIME_SIGNATURES),
  ...EXPECTED_RUNTIME_FUNCTIONS,
  ...DEPENDENCIES,
])]);
export const OVERTIME_SECURITY_FUNCTION_SIGNATURES = SECURITY_FUNCTIONS;
const CONSTRAINTS = Object.freeze([
  'action_case_type_ck', 'action_case_status_ck', 'action_case_policy_version_ck',
  'action_case_submission_ck', 'action_case_decision_ck', 'action_case_approval_human_ck',
  'action_case_overtime_payload_ck', 'action_case_overtime_confidentiality_ck',
  'action_case_event_type_ck', 'action_case_event_status_ck',
]);
const SENSITIVE_PAYROLL_RELATIONS = Object.freeze([
  'payroll_run', 'payroll_snapshot_assignment', 'payroll_monthly_fact',
]);
const STATUS_COLUMN_TYPES = Object.freeze(new Map([
  ['action_case.status', 'character varying(24)'],
  ['action_case_event.from_status', 'character varying(24)'],
  ['action_case_event.to_status', 'character varying(24)'],
]));
const LEAVE_VIEW_COLUMNS = Object.freeze([
  ['id', 'uuid'], ['case_number', 'bigint'], ['beneficiary_contract_id', 'uuid'],
  ['source_batch_id', 'uuid'], ['company_id', 'bigint'],
  ['organization_unit_source_id', 'character varying(128)'],
  ['sector_source_id', 'character varying(128)'], ['status', 'character varying(24)'],
  ['confidentiality', 'character varying(16)'],
  ['policy_version_id', 'character varying(128)'], ['reason_code', 'text'],
  ['policy_rule_id', 'text'], ['starts_on', 'date'], ['ends_on', 'date'],
  ['starts_at_local', 'time without time zone'], ['ends_at_local', 'time without time zone'],
  ['duration_unit', 'text'], ['duration_value', 'integer'], ['time_zone', 'text'],
  ['evidence_status', 'character varying(16)'], ['created_by_user_email', 'text'],
  ['submitted_by_user_email', 'text'], ['submitted_at', 'timestamp with time zone'],
  ['decided_by_user_email', 'text'], ['decided_at', 'timestamp with time zone'],
  ['cancelled_by_user_email', 'text'], ['cancelled_at', 'timestamp with time zone'],
  ['version', 'integer'], ['created_at', 'timestamp with time zone'],
  ['updated_at', 'timestamp with time zone'],
]);
const LEAVE_VIEW_EXCLUSIVE_FILTERS = Object.freeze(new Set([
  "case_type='leave_request'",
  "action.case_type='leave_request'",
]));

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

function requireOrder(name, definition, tokens) {
  const body = normalized(definition);
  let cursor = -1;
  for (const token of tokens) {
    const position = body.indexOf(normalized(token), cursor + 1);
    if (position < 0) throw new Error(`${name} no conserva orden ${tokens.join(' -> ')}`);
    cursor = position;
  }
}

function requireContextNominalReadContract(definition) {
  const body = normalized(definition);
  requireTokens('context nominal read', body, [
    "self_case boolean := COALESCE(p_context->>'employmentContractId', '') = p_beneficiary_contract_id::text",
    "IF p_company_id <> (p_context->>'sourceCompanyId')::bigint THEN RETURN false; END IF",
    "confidentiality_allowed := p_confidentiality = 'standard' OR self_case OR action_center_context_has_capability(p_context, 'leave.request.restricted.read')",
    'IF NOT confidentiality_allowed THEN RETURN false; END IF',
    "RETURN (self_case AND action_center_context_has_capability(p_context, 'leave.request.self.read')) OR action_center_context_has_capability(p_context, 'leave.request.all.manage') OR action_center_context_has_capability(p_context, 'leave.request.all.read') OR action_center_context_has_area_scope( p_context, 'leave.request.area.read', p_company_id, p_organization_unit_source_id, p_sector_source_id )",
  ]);
  requireOrder('context nominal read', body, [
    "COALESCE(p_context->>'employmentContractId', '') = p_beneficiary_contract_id::text",
    "p_company_id <> (p_context->>'sourceCompanyId')::bigint",
    "confidentiality_allowed := p_confidentiality = 'standard'",
    "action_center_context_has_capability(p_context, 'leave.request.restricted.read')",
    'IF NOT confidentiality_allowed THEN RETURN false',
    "action_center_context_has_capability(p_context, 'leave.request.self.read')",
    "action_center_context_has_capability(p_context, 'leave.request.all.manage')",
    "action_center_context_has_capability(p_context, 'leave.request.all.read')",
    "action_center_context_has_area_scope( p_context, 'leave.request.area.read', p_company_id, p_organization_unit_source_id, p_sector_source_id )",
  ]);
  if (body.includes('action_center_tenant_actor_authorized')) {
    throw new Error('context nominal read mezcla autorización mutante ajena al contrato 007');
  }
}

function requireTransitionTriggerBinding(definition) {
  const canonical = normalized(definition)
    .replaceAll('public.', '')
    .replace(/;$/, '');
  const expected = 'create trigger action_case_validate_update before update on action_case for each row execute function action_center_validate_case_update()';
  if (canonical !== expected) {
    throw new Error('trigger binding overtime no conserva nombre, evento, tabla, granularidad y función exactos');
  }
}

function functionBlock(sql, name) {
  const start = String(sql).indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  const end = start < 0 ? -1 : String(sql).indexOf('\n$$;', start);
  if (start < 0 || end < 0) throw new Error(`migracion 008 no contiene funcion completa ${name}`);
  return String(sql).slice(start, end + 4);
}

function between(definition, startToken, endToken) {
  const body = normalized(definition);
  const start = body.indexOf(normalized(startToken));
  const end = body.indexOf(normalized(endToken), start + 1);
  if (start < 0 || end < 0 || end <= start) throw new Error(`bloque ausente ${startToken}`);
  return body.slice(start, end);
}

function requireSingleDeclare(name, definition) {
  const start = definition.indexOf('AS $$');
  const begin = definition.indexOf('\nBEGIN', start + 5);
  if (start < 0 || begin < 0) throw new Error(`${name} no conserva bloque PL/pgSQL compilable`);
  const declarations = definition.slice(start + 5, begin).match(/\bDECLARE\b/gi) || [];
  if (declarations.length !== 1) throw new Error(`${name} debe contener un unico DECLARE`);
}

function requireCaseBoundDefinition(name, definition, {
  leaveRequired, leaveForbidden, overtimeRequired, overtimeForbidden,
}) {
  const body = normalized(definition);
  const leave = body.indexOf("'leave_request'");
  const overtime = body.indexOf("'overtime_entry'", leave + 1);
  if (leave < 0 || overtime < 0 || overtime <= leave) {
    throw new Error(`${name} no discrimina ramas por case_type`);
  }
  const leaveBranch = body.slice(leave, overtime);
  const overtimeBranch = body.slice(overtime);
  for (const token of leaveRequired) {
    if (!leaveBranch.includes(normalized(token))) throw new Error(`${name} no liga leave con ${token}`);
  }
  for (const token of leaveForbidden) {
    if (leaveBranch.includes(normalized(token))) throw new Error(`${name} permite ${token} en leave`);
  }
  for (const token of overtimeRequired) {
    if (!overtimeBranch.includes(normalized(token))) throw new Error(`${name} no liga overtime con ${token}`);
  }
  for (const token of overtimeForbidden) {
    if (overtimeBranch.includes(normalized(token))) throw new Error(`${name} permite ${token} en overtime`);
  }
}

function requireNoSensitivePayrollMutation(sql) {
  for (const statement of splitPostgresStatements(String(sql || ''))) {
    const body = normalized(String(statement)
      .replace(/--[^\r\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' '));
    if (!/\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?|merge\s+into)\b/.test(body)) {
      continue;
    }
    for (const relation of SENSITIVE_PAYROLL_RELATIONS) {
      if (new RegExp(`\\b${relation}\\b`).test(body)) {
        throw new Error(`migracion 008 intenta mutar nómina: ${relation}`);
      }
    }
  }
}

function sqlWithoutComments(value) {
  return normalized(String(value || '')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' '));
}

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requireReapplySafeDdl(sql) {
  const statements = splitPostgresStatements(String(sql || '')).map(sqlWithoutComments);
  for (const [index, body] of statements.entries()) {
    const constraint = body.match(/\balter table ([a-z0-9_.]+) add constraint ([a-z0-9_]+)/);
    if (constraint) {
      const [, tableName, constraintName] = constraint;
      const priorDrop = new RegExp(
        `\\balter table ${escapedRegex(tableName)} drop constraint if exists ${escapedRegex(constraintName)}\\b`,
      );
      if (!statements.slice(0, index).some((statement) => priorDrop.test(statement))) {
        throw new Error(`DDL 008 no es reapply-safe: constraint ${constraintName} sin DROP previo`);
      }
    }
    if (!body.startsWith('create ')) continue;
    if (/^create table if not exists [a-z0-9_.]+\b/.test(body)) continue;
    if (/^create (?:unique )?index if not exists [a-z0-9_.]+\b/.test(body)) continue;
    if (/^create or replace function [a-z0-9_.]+\b/.test(body)) continue;
    const view = body.match(/^create view ([a-z0-9_.]+) as\b/);
    if (view) {
      const priorDrop = new RegExp(`^drop view ${escapedRegex(view[1])}$`);
      if (statements.slice(0, index).some((statement) => priorDrop.test(statement))) continue;
      throw new Error(`DDL 008 no es reapply-safe: vista ${view[1]} sin DROP previo`);
    }
    const trigger = body.match(/^create trigger ([a-z0-9_]+)[\s\S]*?\bon ([a-z0-9_.]+)\b/);
    if (trigger) {
      const priorDrop = new RegExp(
        `^drop trigger if exists ${escapedRegex(trigger[1])} on ${escapedRegex(trigger[2])}$`,
      );
      if (statements.slice(0, index).some((statement) => priorDrop.test(statement))) continue;
      throw new Error(`DDL 008 no es reapply-safe: trigger ${trigger[1]} sin DROP previo`);
    }
    throw new Error(`DDL 008 contiene CREATE no gobernado para reapply: ${body.slice(0, 80)}`);
  }
}

function canonicalOvertimeIndexPredicate(value) {
  return normalized(value)
    .replace(/::character varying(?:\(\d+\))?/g, '')
    .replace(/::varchar(?:\(\d+\))?/g, '')
    .replace(/::text\[\]/g, '')
    .replace(/::text/g, '')
    .replace(/[();\s]/g, '');
}

export function validateOvertimeStatusUpgradeSourceEvidence(statusColumns) {
  if (!Array.isArray(statusColumns) || statusColumns.length !== STATUS_COLUMN_TYPES.size) {
    throw new Error('preflight status 008 no contiene las tres columnas exactas');
  }
  const actual = new Map(statusColumns.map((item) => [
    `${item.tableName}.${item.columnName}`, normalized(item.type),
  ]));
  if (actual.size !== STATUS_COLUMN_TYPES.size
      || [...STATUS_COLUMN_TYPES.keys()].some((column) => !actual.has(column))) {
    throw new Error('preflight status 008 tiene columnas faltantes o duplicadas');
  }
  const types = new Set(actual.values());
  if (types.size !== 1) throw new Error('preflight status 008 mezcla anchos incompatibles');
  const [type] = types;
  if (type === 'character varying(16)') return 'upgrade';
  if (type === 'character varying(24)') return 'reapply';
  throw new Error(`preflight status 008 conserva tipo no homologado: ${type}`);
}

const OVERTIME_ACTIVE_INDEX_PREDICATES = new Set([
  "case_type='overtime_entry'andstatus=anyarray['draft','submitted','pending_time_rules']",
  "status=anyarray['draft','submitted','pending_time_rules']andcase_type='overtime_entry'",
]);

export function validateOvertimeMigrationSql(sql) {
  requireTokens('migracion 008', sql, [
    "'time.overtime.read'", "('JUNIN_TESORERIA_CARGA', 'actions.read')",
    "'JUNIN_CONTADURIA_APROBADOR'", "'time.overtime.approve'",
    "policy_version_id = 'junin-mayor-esfuerzo-intake.v1'",
    "governance_status = 'operational_provisional'",
    "case_type = 'leave_request' AND status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled')",
    "case_type = 'overtime_entry' AND status IN ('draft', 'submitted', 'pending_time_rules', 'rejected', 'cancelled')",
    "case_type = 'overtime_entry' AND evidence_status = 'verified'",
    'action_case_overtime_active_entry_uk', "payload->>'workDate'",
    "assignment.capability_key = 'time.overtime.enter'",
    'assignment.membership_id = p_membership_id', 'assignment.active IS TRUE',
    "effective.capability_key = 'time.overtime.enter'",
    "effective.capability_key = 'time.overtime.approve'",
    'tenant_iam_assert_no_sod_conflict', 'action_center_overtime_decider_separated_v1',
    "p_command = 'approve'", "p_evidence_status <> 'verified'",
    "next_status := CASE WHEN p_command = 'approve' THEN 'pending_time_rules' ELSE 'rejected' END",
    'FROM action_overtime_reason_catalog reason', 'FOR SHARE',
    "p_manual_validation_confirmed IS DISTINCT FROM false",
    "p_manual_validation_confirmed IS DISTINCT FROM true",
    "'payrollCalculated', false", "'payrollPosted', false",
    'employee.import_run_id = batch.legacy_import_run_id',
    'employee.import_run_id = page.legacy_import_run_id',
    'employee.import_run_id = batch_row.legacy_import_run_id',
    'REVOKE ALL PRIVILEGES ON FUNCTION action_center_overtime_mutation_context_v1',
  ]);
  requireOrder('preflight de status 008', sql, [
    "format_type(attribute.atttypid, attribute.atttypmod) = 'character varying(16)'",
    "format_type(attribute.atttypid, attribute.atttypmod) = 'character varying(24)'",
    'source_status_v16_count = 3 AND source_status_v24_count = 0',
    'source_status_v16_count = 0 AND source_status_v24_count = 3',
    "RAISE EXCEPTION 'ACTION_STATUS_SOURCE_TYPE_DRIFT'",
    "view_row.relname = 'vw_action_leave_request'",
    "RAISE EXCEPTION 'ACTION_STATUS_SOURCE_VIEW_DRIFT'",
    'FROM pg_depend dependency', "dependency.classid = 'pg_rewrite'::regclass",
    "dependent_relation.oid <> 'public.vw_action_leave_request'::regclass",
    "RAISE EXCEPTION 'ACTION_STATUS_DEPENDENCY_DRIFT'",
    'DROP VIEW public.vw_action_leave_request',
  ]);
  requireOrder('upgrade de status 008', sql, [
    'DROP VIEW public.vw_action_leave_request',
    'ALTER TABLE action_case ALTER COLUMN status TYPE varchar(24)',
    'ALTER TABLE action_case_event ALTER COLUMN from_status TYPE varchar(24)',
    'ALTER TABLE action_case_event ALTER COLUMN to_status TYPE varchar(24)',
    'CREATE VIEW public.vw_action_leave_request AS',
    'REVOKE ALL PRIVILEGES ON TABLE public.vw_action_leave_request FROM PUBLIC',
    'REVOKE ALL PRIVILEGES ON TABLE public.vw_action_leave_request FROM municontrol_actions_runtime_app',
    'ALTER TABLE action_case ADD CONSTRAINT action_case_type_ck',
  ]);
  const normalizedSql = normalized(sql);
  const dropViewStart = normalizedSql.indexOf('drop view public.vw_action_leave_request');
  const dropViewEnd = normalizedSql.indexOf(';', dropViewStart);
  const dropView = normalizedSql.slice(dropViewStart, dropViewEnd);
  if (dropViewStart < 0 || dropViewEnd < 0 || dropView.includes('cascade')) {
    throw new Error('upgrade de status 008 debe quitar la vista conocida sin CASCADE');
  }
  const createViewStart = normalizedSql.indexOf('create view public.vw_action_leave_request as');
  const createViewEnd = normalizedSql.indexOf(';', createViewStart);
  const leaveView = normalizedSql.slice(createViewStart, createViewEnd);
  requireTokens('vista leave reconstruida', leaveView, [
    'action.id', 'action.case_number', 'action.beneficiary_contract_id',
    'action.source_batch_id', 'action.company_id', 'action.organization_unit_source_id',
    'action.sector_source_id', 'action.status', 'action.confidentiality',
    'action.policy_version_id', "action.payload->>'reasonCode' AS reason_code",
    "NULLIF(action.payload->>'policyRuleId', '') AS policy_rule_id",
    "action.payload->>'durationUnit' AS duration_unit", 'END AS duration_value',
    "'America/Argentina/Mendoza'::text AS time_zone", 'action.evidence_status',
    'action.version', 'action.created_at', 'action.updated_at',
    'FROM public.action_case action', "WHERE action.case_type = 'leave_request'",
  ]);
  if (leaveView.includes('overtime_entry')) {
    throw new Error('vista leave reconstruida incluye mayor esfuerzo');
  }
  requireReapplySafeDdl(sql);
  for (const forbidden of [
    'ALTER ROLE municontrol_actions_runtime_app',
    "SET status = 'approved'", "next_status := 'approved'",
    'time.overtime.post', 'INSERT INTO grh_', 'UPDATE grh_', 'DELETE FROM grh_',
    "metadata', event.metadata", 'to_jsonb(event.metadata)', "event.metadata - '",
    "p_payload->>'reason'", "p_payload->>'amount'", "p_payload->>'rate'",
  ]) {
    if (normalized(sql).includes(normalized(forbidden))) {
      throw new Error(`migracion 008 reintroduce contrato inseguro: ${forbidden}`);
    }
  }
  requireNoSensitivePayrollMutation(sql);
  const payload = functionBlock(sql, 'action_center_valid_overtime_payload');
  requireTokens('payload estructural', payload, ['IMMUTABLE', 'jsonb_object_keys', 'declared_minutes > 1440']);
  for (const forbidden of ['action_overtime_reason_catalog', 'SELECT reason']) {
    if (normalized(payload).includes(normalized(forbidden))) {
      throw new Error('CHECK overtime depende de un catálogo mutable');
    }
  }
  const mutationContext = functionBlock(sql, 'action_center_overtime_mutation_context_v1');
  requireOrder('contexto overtime', mutationContext, [
    'FROM internal_users users', 'FROM tenant_membership membership',
    'FROM tenant_identity_session identity_session', 'FROM platform_tenant tenant',
    'FROM tenant_identity_policy policy', 'FROM platform_tenant_source_binding binding',
    'pg_advisory_xact_lock', 'FROM tenant_action_authority authority',
    'FROM tenant_action_employment_link link', 'tenant_iam_assert_no_sod_conflict',
  ]);
  requireTokens('contexto overtime', mutationContext, [
    "identity_session.source = 'membership'", "identity_session.auth_level IN ('mfa', 'recovery')",
    'identity_session.identity_version = user_row.identity_version',
    'lower(policy.certified_release_sha) = lower(p_release_sha)',
    'policy.tenant_data_plane_ready IS TRUE', "binding.source_system = 'GRH'",
    'binding.verified IS TRUE', "batch.validation_state = 'published'",
    'batch.source_database = binding_row.source_database', 'FOR SHARE NOWAIT',
    "WHEN lock_not_available", "RAISE EXCEPTION 'ACTION_SESSION_BUSY'",
  ]);
  requireTokens('lock authority overtime', between(
    mutationContext, 'FROM tenant_action_authority authority', 'IF NOT FOUND THEN',
  ), ['FOR SHARE NOWAIT']);
  requireTokens('lock link overtime', between(
    mutationContext, 'FROM tenant_action_employment_link link',
    'IF actor_contract_id IS NULL OR actor_person_id IS NULL THEN',
  ), ['FOR SHARE OF link, contract, batch NOWAIT']);
  const transitionTrigger = functionBlock(sql, 'action_center_validate_case_update');
  requireTokens('trigger transición por tipo', transitionTrigger, [
    "OLD.case_type = 'leave_request'", "NEW.status IN ('approved', 'rejected', 'cancelled')",
    "OLD.case_type = 'overtime_entry'", "NEW.status IN ('pending_time_rules', 'rejected', 'cancelled')",
    'ACTION_CASE_IMMUTABLE_FIELDS', 'ACTION_CASE_PAYLOAD_LOCKED',
    'ACTION_VERSION_INCREMENT_REQUIRED',
  ]);
  const apply = functionBlock(sql, 'action_center_apply_overtime_command_v1');
  requireOrder('apply overtime', apply, [
    'IF p_command NOT IN', 'action_center_overtime_mutation_context_v1',
    'FROM action_overtime_reason_catalog reason', 'FOR SHARE',
    'FROM tenant_exclusive_capability assignment', 'FOR SHARE',
    'FROM action_case_event event', 'SELECT * INTO current_case',
  ]);
  for (const ambiguous of [
    /\bsource_database\s+text\s*;/i,
    /batch\.source_database\s*=\s*source_database\b/i,
  ]) {
    if (ambiguous.test(apply)) {
      throw new Error('apply overtime conserva variable source_database ambigua');
    }
  }
  requireTokens('apply overtime', apply, [
    "p_command = 'create'", "p_command = 'update_draft'", "p_command = 'submit'",
    "p_command = 'approve'", "p_command IN ('reject', 'cancel')",
    'p_beneficiary_contract_id IS NULL', 'p_payload IS NOT NULL',
    'p_decision_reason_code IS NULL', 'p_evidence_status IS NOT NULL',
    "p_decision_reason_code <> 'validated_documentation'", "p_evidence_status <> 'verified'",
    'action_center_valid_overtime_decision_reason_v1',
    'existing_event.command_hash <> p_command_hash',
    "existing_event.case_type <> 'overtime_entry'", 'existing_event.tenant_id <> p_tenant_id',
    'existing_event.source_binding_id <> binding_id',
    'existing_event.actor_membership_id <> p_membership_id',
    "existing_event.metadata->>'actorSessionId' <> p_actor_session_id::text",
    "existing_event.metadata->>'releaseSha' <> lower(p_release_sha)",
    'FOR SHARE OF contract_row, batch',
    "'decisionReasonCode', CASE WHEN p_command IN ('approve', 'reject', 'cancel')",
    "'evidenceStatus', CASE WHEN p_command = 'approve' THEN 'verified' END",
    "'manualValidationConfirmed', CASE WHEN p_command = 'approve' THEN true END",
    'binding_source_database text',
    "binding_source_database := context_value->>'sourceDatabase'",
    'batch.source_database = binding_source_database',
  ]);
  const createEventMetadata = between(
    apply, 'event_metadata := jsonb_strip_nulls(jsonb_build_object(',
    'PERFORM action_center_set_tenant_command_context(',
  ).trim();
  if (!createEventMetadata.endsWith("'payrollposted', false ));")) {
    throw new Error('metadata create overtime no conserva cierre doble compilable');
  }
  const eventMetadata = between(
    apply, 'event_metadata := jsonb_build_object(', "IF p_command = 'update_draft' THEN",
  ).trim();
  if (!eventMetadata.endsWith("'payrollposted', false );")
      || eventMetadata.includes("'payrollposted', false ));")) {
    throw new Error('metadata overtime no conserva cierre compilable de jsonb_build_object');
  }
  const createShape = between(apply, "IF p_command = 'create' THEN", "ELSIF p_command = 'update_draft' THEN");
  requireTokens('shape create overtime', createShape, [
    'p_case_id IS NOT NULL', 'p_expected_version IS NOT NULL',
    'p_beneficiary_contract_id IS NULL', 'action_center_valid_overtime_payload',
    'p_decision_reason_code IS NOT NULL', 'p_evidence_status IS NOT NULL',
    'p_manual_validation_confirmed IS DISTINCT FROM false',
  ]);
  const updateShape = between(apply, "ELSIF p_command = 'update_draft' THEN", "ELSIF p_command = 'submit' THEN");
  requireTokens('shape update overtime', updateShape, [
    'p_case_id IS NULL', 'p_expected_version IS NULL', 'p_beneficiary_contract_id IS NOT NULL',
    'action_center_valid_overtime_payload', 'p_decision_reason_code IS NOT NULL',
    'p_evidence_status IS NOT NULL', 'p_manual_validation_confirmed IS DISTINCT FROM false',
  ]);
  const submitShape = between(apply, "ELSIF p_command = 'submit' THEN", "ELSIF p_command = 'approve' THEN");
  requireTokens('shape submit overtime', submitShape, [
    'p_payload IS NOT NULL', 'p_beneficiary_contract_id IS NOT NULL',
    'p_policy_version_id IS NOT NULL', 'p_decision_reason_code IS NOT NULL',
    'p_evidence_status IS NOT NULL', 'p_manual_validation_confirmed IS DISTINCT FROM false',
  ]);
  const approveShape = between(apply, "ELSIF p_command = 'approve' THEN", "ELSIF p_command IN ('reject', 'cancel') THEN");
  requireTokens('shape approve overtime', approveShape, [
    'p_payload IS NOT NULL', 'p_beneficiary_contract_id IS NOT NULL',
    'p_policy_version_id IS NOT NULL', "p_decision_reason_code <> 'validated_documentation'",
    "p_evidence_status <> 'verified'", 'p_manual_validation_confirmed IS DISTINCT FROM true',
  ]);
  const rejectCancelStart = normalized(apply).indexOf("elsif p_command in ('reject', 'cancel') then");
  const shapeEnd = normalized(apply).indexOf('end if;', rejectCancelStart);
  const rejectCancelShape = normalized(apply).slice(rejectCancelStart, shapeEnd);
  requireTokens('shape reject/cancel overtime', rejectCancelShape, [
    'p_payload IS NOT NULL', 'p_beneficiary_contract_id IS NOT NULL',
    'p_policy_version_id IS NOT NULL', 'p_decision_reason_code IS NULL',
    'p_evidence_status IS NOT NULL', 'p_manual_validation_confirmed IS DISTINCT FROM false',
  ]);
  const decision = functionBlock(sql, 'action_center_valid_overtime_decision_reason_v1');
  requireTokens('catalogo decisión overtime', decision, ['VOLATILE', 'action_overtime_decision_reason_catalog', 'FOR SHARE']);
  const indexBlock = normalized(sql).slice(normalized(sql).indexOf('create unique index if not exists action_case_overtime_active_entry_uk'));
  const indexEnd = indexBlock.indexOf(';');
  const index = indexBlock.slice(0, indexEnd);
  requireTokens('índice diario overtime', index, [
    "WHERE case_type = 'overtime_entry'",
    "AND status IN ('draft', 'submitted', 'pending_time_rules')",
  ]);
  if (index.includes('declaredminutes') || index.includes('reasoncode')) {
    throw new Error('índice diario permite duplicados variando minutos o motivo');
  }
  for (const name of ['action_center_overtime_bootstrap_v1', 'action_center_overtime_list_v1',
    'action_center_overtime_detail_v1', 'action_center_overtime_routing_v1']) {
    requireSingleDeclare(name, functionBlock(sql, name));
  }
}

export function validateOvertimeEvidence(evidence) {
  const functions = new Map((evidence?.functions || []).map((item) => [item.signature, item]));
  for (const signature of SECURITY_FUNCTIONS) {
    const item = functions.get(signature);
    if (!item || item.securityDefiner !== true || item.publicExecuteRevoked !== true
        || item.ownedByCurrentUser !== true || item.owner === RUNTIME_ROLE
        || !String(item.config || '').includes('search_path=public, pg_temp')) {
      throw new Error(`fachada/dependencia 008 ausente o insegura: ${signature}`);
    }
  }
  const definitions = new Map([...functions].map(([signature, item]) => [signature, item.definition]));
  requireTokens('effective capabilities', definitions.get(DEPENDENCIES[0]), [
    "membership.status = 'active'", "tenant.status = 'active'", "role_row.scope_kind = 'tenant'",
  ]);
  requireTokens('SoD', definitions.get(DEPENDENCIES[1]), [
    'iam_capability_conflict', 'tenant_iam_effective_capabilities', 'TENANT_IAM_SOD_CONFLICT',
  ]);
  requireTokens('read session v2', definitions.get(DEPENDENCIES[2]), [
    "identity_session.auth_level IN ('mfa', 'recovery')", 'certified_release_sha',
    'certified_source_binding_id', 'ACTION_SESSION_BUSY',
  ]);
  requireTokens('context capability', definitions.get(DEPENDENCIES[3]), [
    "COALESCE(p_context->'capabilities'", '? p_capability',
  ]);
  requireTokens('context area scope', definitions.get(DEPENDENCIES[4]), [
    'tenant_iam_effective_capabilities', 'scope.capability_key = p_capability',
    'scope.tenant_id = (p_context->>\'tenantId\')::uuid',
    'scope.source_binding_id = (p_context->>\'sourceBindingId\')::uuid',
  ]);
  requireContextNominalReadContract(definitions.get(DEPENDENCIES[5]));
  requireTokens('actor authorization', definitions.get(DEPENDENCIES[6]), [
    'membership.id = p_membership_id', 'membership.tenant_id = p_tenant_id',
    "effective.capability_key = 'actions.read'", 'scope.capability_key = required_capability',
  ]);
  requireTokens('event context setter', definitions.get(DEPENDENCIES[7]), [
    'actor_membership_id', 'tenant_id', 'source_binding_id', 'idempotency_key',
    'command_hash', 'metadata', 'ON CONFLICT (backend_pid, transaction_id) DO UPDATE',
  ]);
  requireTokens('overtime apply instalada', definitions.get(OVERTIME_SIGNATURES.apply), [
    'tenant_exclusive_capability', "pending_time_rules", "evidence_status = CASE WHEN p_command = 'approve' THEN 'verified'",
  ]);
  const statusColumns = new Map((evidence?.statusColumns || []).map((item) => [
    `${item.tableName}.${item.columnName}`, normalized(item.type),
  ]));
  if (statusColumns.size !== STATUS_COLUMN_TYPES.size) {
    throw new Error('columnas status 008 ausentes o con inventario inesperado');
  }
  for (const [column, expectedType] of STATUS_COLUMN_TYPES) {
    if (statusColumns.get(column) !== normalized(expectedType)) {
      throw new Error(`columna status 008 no ampliada exactamente: ${column}`);
    }
  }
  const leaveViewEvidence = evidence?.leaveView;
  if (!leaveViewEvidence || leaveViewEvidence.name !== 'vw_action_leave_request'
      || leaveViewEvidence.kind !== 'v' || leaveViewEvidence.ownedByCurrentUser !== true
      || leaveViewEvidence.owner === RUNTIME_ROLE || leaveViewEvidence.publicPrivilegesRevoked !== true
      || leaveViewEvidence.runtimePrivilegesRevoked !== true) {
    throw new Error('vista leave 008 ausente o insegura');
  }
  const actualLeaveColumns = evidence?.leaveViewColumns || [];
  if (actualLeaveColumns.length !== LEAVE_VIEW_COLUMNS.length
      || actualLeaveColumns.some((item, index) => item.name !== LEAVE_VIEW_COLUMNS[index][0]
        || normalized(item.type) !== normalized(LEAVE_VIEW_COLUMNS[index][1]))) {
    throw new Error('vista leave 008 no conserva proyeccion y tipos exactos');
  }
  requireTokens('vista leave 008 instalada', leaveViewEvidence.definition, [
    'action_case', 'leave_request', 'duration_value', 'reason_code', 'policy_rule_id',
    'America/Argentina/Mendoza',
  ]);
  if (normalized(leaveViewEvidence.definition).includes('overtime_entry')) {
    throw new Error('vista leave 008 instalada expone mayor esfuerzo');
  }
  const viewDefinition = normalized(leaveViewEvidence.definition);
  const whereStart = viewDefinition.lastIndexOf(' where ');
  const canonicalWhere = viewDefinition.slice(whereStart + 7)
    .replaceAll('::text', '').replace(/[();\s]/g, '');
  if (whereStart < 0 || !LEAVE_VIEW_EXCLUSIVE_FILTERS.has(canonicalWhere)) {
    throw new Error('vista leave 008 no conserva filtro exclusivo leave_request');
  }
  const constraints = new Map((evidence?.constraints || []).map((item) => [item.name, item]));
  for (const name of CONSTRAINTS) {
    const item = constraints.get(name);
    if (!item || item.validated !== true || item.type !== 'c') {
      throw new Error(`constraint 008 ausente/no validado: ${name}`);
    }
  }
  requireCaseBoundDefinition('status constraint', constraints.get('action_case_status_ck')?.definition, {
    leaveRequired: ['draft', 'submitted', 'approved', 'rejected', 'cancelled'],
    leaveForbidden: ['pending_time_rules'],
    overtimeRequired: ['draft', 'submitted', 'pending_time_rules', 'rejected', 'cancelled'],
    overtimeForbidden: ['approved'],
  });
  requireCaseBoundDefinition('event type constraint', constraints.get('action_case_event_type_ck')?.definition, {
    leaveRequired: ['created', 'draft_updated', 'submitted', 'approved', 'rejected', 'cancelled'],
    leaveForbidden: ['pending_time_rules'],
    overtimeRequired: ['created', 'draft_updated', 'submitted', 'pending_time_rules', 'rejected', 'cancelled'],
    overtimeForbidden: ['approved'],
  });
  requireCaseBoundDefinition('event status constraint', constraints.get('action_case_event_status_ck')?.definition, {
    leaveRequired: ['draft', 'submitted', 'approved', 'rejected', 'cancelled'],
    leaveForbidden: ['pending_time_rules'],
    overtimeRequired: ['draft', 'submitted', 'pending_time_rules', 'rejected', 'cancelled'],
    overtimeForbidden: ['approved'],
  });
  const index = evidence?.index;
  if (!index || index.valid !== true || index.ready !== true || index.unique !== true
      || index.tableName !== 'action_case') throw new Error('índice diario overtime ausente o inseguro');
  requireTokens('índice diario overtime', index.definition, [
    'tenant_id', 'source_binding_id', 'beneficiary_contract_id', 'workDate', 'overtime_entry',
  ]);
  if (!OVERTIME_ACTIVE_INDEX_PREDICATES.has(canonicalOvertimeIndexPredicate(index.predicate))) {
    throw new Error('índice diario overtime no conserva predicado activo exacto');
  }
  for (const forbidden of ['declaredMinutes', 'reasonCode']) {
    if (String(index.definition || '').includes(forbidden)) throw new Error('índice diario overtime tiene clave ampliable');
  }
  const grants = new Set((evidence?.roleCapabilities || []).map((row) => `${row.roleKey}:${row.capabilityKey}`));
  for (const required of [
    'JUNIN_TESORERIA_CARGA:actions.read', 'JUNIN_TESORERIA_CARGA:time.overtime.read',
    'JUNIN_TESORERIA_CARGA:time.overtime.enter',
    'JUNIN_CONTADURIA_APROBADOR:actions.read', 'JUNIN_CONTADURIA_APROBADOR:time.overtime.read',
    'JUNIN_CONTADURIA_APROBADOR:time.overtime.approve',
  ]) if (!grants.has(required)) throw new Error(`capability overtime ausente: ${required}`);
  for (const forbidden of [
    'JUNIN_TESORERIA_CARGA:time.overtime.approve', 'JUNIN_TESORERIA_CARGA:time.overtime.post',
    'JUNIN_CONTADURIA_APROBADOR:time.overtime.enter', 'JUNIN_CONTADURIA_APROBADOR:time.overtime.post',
  ]) if (grants.has(forbidden)) throw new Error(`SoD/grant overtime inseguro: ${forbidden}`);
  if (Number(evidence?.reasonCount) < 1 || Number(evidence?.decisionReasonCount) !== 4) {
    throw new Error('catálogo overtime incompleto');
  }
  const trigger = evidence?.transitionTrigger;
  if (!trigger || trigger.name !== 'action_case_validate_update'
      || trigger.tableName !== 'action_case' || trigger.enabled !== 'O'
      || trigger.functionSignature !== 'public.action_center_validate_case_update()'
      || trigger.ownedByCurrentUser !== true || trigger.publicExecuteRevoked !== true) {
    throw new Error('trigger de transición overtime ausente o inseguro');
  }
  requireTransitionTriggerBinding(trigger.triggerDefinition);
  requireTokens('trigger body overtime', trigger.functionDefinition, [
    "OLD.case_type = 'leave_request'", "OLD.case_type = 'overtime_entry'",
    'pending_time_rules', 'ACTION_VERSION_INCREMENT_REQUIRED',
  ]);
}

export function validateOvertimeRuntimeAclEvidence(evidence) {
  const role = evidence?.runtimeRole;
  if (!role || role.canLogin !== true || role.inherit !== false || role.superuser
      || role.bypassRls || role.createDb || role.createRole || role.replication
      || Number(role.membershipCount) !== 0 || role.schemaUsage !== true || role.schemaCreate !== false) {
    throw new Error('rol runtime 008 no es LOGIN NOINHERIT aislado');
  }
  const memberships = Array.isArray(evidence?.roleMemberships) ? evidence.roleMemberships : [];
  if (Number(role.memberCount) !== memberships.length || memberships.length > 1) {
    throw new Error('rol runtime 008 conserva miembros no inventariados');
  }
  for (const membership of memberships) {
    if (membership.direction !== 'member_of_runtime' || membership.grantedRole !== RUNTIME_ROLE
        || membership.memberIsCurrentUser !== true || membership.memberOwnsApprovedFunctions !== true
        || membership.adminOption !== true || membership.inheritOption !== false
        || membership.setOption !== false) {
      throw new Error('rol runtime 008 conserva arista escalable');
    }
  }
  const functions = evidence?.runtimeFunctions || [];
  for (const item of functions) {
    if (item.execute !== EXPECTED_RUNTIME_FUNCTIONS.has(item.signature)) {
      throw new Error(`ACL runtime incorrecta: ${item.signature}`);
    }
  }
  for (const signature of EXPECTED_RUNTIME_FUNCTIONS) {
    if (!functions.some((item) => item.signature === signature)) {
      throw new Error(`ACL runtime sin evidencia: ${signature}`);
    }
  }
  const unexpectedSecurityDefiners = evidence?.unexpectedSecurityDefiners;
  if (!Array.isArray(unexpectedSecurityDefiners)) {
    throw new Error('ACL runtime sin inventario global de SECURITY DEFINER');
  }
  if (unexpectedSecurityDefiners.length > 0) {
    throw new Error(`runtime ejecuta SECURITY DEFINER fuera de allowlist: ${unexpectedSecurityDefiners[0].signature}`);
  }
  for (const relation of evidence?.relations || []) {
    if (relation.canSelect || relation.canInsert || relation.canUpdate || relation.canReferences
        || relation.canDelete || relation.canTruncate || relation.canTrigger) {
      throw new Error(`runtime conserva relación directa: ${relation.name}`);
    }
  }
  for (const sequence of evidence?.sequences || []) {
    if (sequence.canUsage || sequence.canSelect || sequence.canUpdate) {
      throw new Error(`runtime conserva secuencia directa: ${sequence.name}`);
    }
  }
}

async function expectedPrerequisiteChecksums() {
  return new Map(await Promise.all(PREREQUISITES.map(async ([version, url]) => {
    const contents = await readFile(url, 'utf8');
    return [version, createHash('sha256').update(contents).digest('hex')];
  })));
}

async function verifyPrerequisites(client) {
  const expected = await expectedPrerequisiteChecksums();
  const result = await client.query(
    'SELECT version, checksum_sha256 FROM schema_migrations WHERE version = ANY($1::text[])',
    [[...expected.keys()]],
  );
  const actual = new Map(rows(result).map((row) => [row.version, String(row.checksum_sha256 || '').trim()]));
  for (const [version, checksum] of expected) {
    if (!actual.has(version)) throw new Error(`prerrequisito 008 ausente: ${version}`);
    if (actual.get(version) !== checksum) throw new Error(`drift checksum prerrequisito 008: ${version}`);
  }
}

async function collectStatusUpgradeSourceEvidence(client) {
  const result = await client.query(`
    SELECT table_row.relname AS "tableName", attribute.attname AS "columnName",
      format_type(attribute.atttypid, attribute.atttypmod) AS type
    FROM pg_attribute attribute
    JOIN pg_class table_row ON table_row.oid = attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid = table_row.relnamespace
    WHERE namespace.nspname = 'public' AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND ((table_row.relname = 'action_case' AND attribute.attname = 'status')
        OR (table_row.relname = 'action_case_event'
          AND attribute.attname IN ('from_status', 'to_status')))
    ORDER BY "tableName", attribute.attnum
  `);
  return rows(result);
}

async function collectEvidence(client) {
  const functions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner.rolname AS owner,
      NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS "publicExecuteRevoked",
      array_to_string(function_row.proconfig, ',') AS config,
      pg_get_functiondef(function_row.oid) AS definition
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner ON owner.oid = function_row.proowner
    WHERE format('%s.%s(%s)', namespace.nspname, function_row.proname,
      replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($1::text[])
    ORDER BY signature
  `, [SECURITY_FUNCTIONS]);
  const constraints = await client.query(`
    SELECT constraint_row.conname AS name, constraint_row.contype AS type,
      constraint_row.convalidated AS validated,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid IN ('public.action_case'::regclass, 'public.action_case_event'::regclass)
      AND constraint_row.conname = ANY($1::text[])
    ORDER BY name
  `, [CONSTRAINTS]);
  const statusColumns = await collectStatusUpgradeSourceEvidence(client);
  const leaveView = await client.query(`
    SELECT view_class.relname AS name, view_class.relkind AS kind,
      owner.rolname AS owner,
      view_class.relowner = current_user::regrole::oid AS "ownedByCurrentUser",
      NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          view_class.relacl, acldefault('r', view_class.relowner)
        )) acl WHERE acl.grantee = 0
      ) AS "publicPrivilegesRevoked",
      NOT (
        has_any_column_privilege($1, view_class.oid, 'SELECT')
        OR has_any_column_privilege($1, view_class.oid, 'INSERT')
        OR has_any_column_privilege($1, view_class.oid, 'UPDATE')
        OR has_any_column_privilege($1, view_class.oid, 'REFERENCES')
        OR has_table_privilege($1, view_class.oid, 'DELETE')
        OR has_table_privilege($1, view_class.oid, 'TRUNCATE')
        OR has_table_privilege($1, view_class.oid, 'TRIGGER')
      ) AS "runtimePrivilegesRevoked",
      pg_get_viewdef(view_class.oid, true) AS definition
    FROM pg_class view_class
    JOIN pg_namespace namespace ON namespace.oid = view_class.relnamespace
    JOIN pg_roles owner ON owner.oid = view_class.relowner
    WHERE namespace.nspname = 'public' AND view_class.relname = 'vw_action_leave_request'
  `, [RUNTIME_ROLE]);
  const leaveViewColumns = await client.query(`
    SELECT attribute.attname AS name,
      format_type(attribute.atttypid, attribute.atttypmod) AS type
    FROM pg_attribute attribute
    WHERE attribute.attrelid = 'public.vw_action_leave_request'::regclass
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
    ORDER BY attribute.attnum
  `);
  const index = await client.query(`
    SELECT table_row.relname AS "tableName", index_row.indisunique AS unique,
      index_row.indisvalid AS valid, index_row.indisready AS ready,
      pg_get_indexdef(index_row.indexrelid) AS definition,
      pg_get_expr(index_row.indpred, index_row.indrelid, true) AS predicate
    FROM pg_index index_row
    JOIN pg_class index_class ON index_class.oid = index_row.indexrelid
    JOIN pg_class table_row ON table_row.oid = index_row.indrelid
    JOIN pg_namespace namespace ON namespace.oid = index_class.relnamespace
    WHERE namespace.nspname = 'public' AND index_class.relname = 'action_case_overtime_active_entry_uk'
  `);
  const roleCapabilities = await client.query(`
    SELECT role_key AS "roleKey", capability_key AS "capabilityKey"
    FROM iam_role_capability
    WHERE role_key IN ('JUNIN_TESORERIA_CARGA', 'JUNIN_CONTADURIA_APROBADOR')
    ORDER BY role_key, capability_key
  `);
  const catalogs = await client.query(`
    SELECT
      (SELECT count(*)::integer FROM action_overtime_reason_catalog
        WHERE policy_version_id = 'junin-mayor-esfuerzo-intake.v1'
          AND governance_status = 'operational_provisional' AND active IS TRUE) AS "reasonCount",
      (SELECT count(*)::integer FROM action_overtime_decision_reason_catalog
        WHERE governance_status = 'operational_provisional' AND active IS TRUE) AS "decisionReasonCount"
  `);
  const transitionTrigger = await client.query(`
    SELECT trigger_row.tgname AS name, trigger_row.tgenabled AS enabled,
      table_row.relname AS "tableName",
      format('%s.%s(%s)', function_namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS "functionSignature",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS "publicExecuteRevoked",
      pg_get_triggerdef(trigger_row.oid, true) AS "triggerDefinition",
      pg_get_functiondef(function_row.oid) AS "functionDefinition"
    FROM pg_trigger trigger_row
    JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_row.relnamespace
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace function_namespace ON function_namespace.oid = function_row.pronamespace
    WHERE table_namespace.nspname = 'public' AND table_row.relname = 'action_case'
      AND trigger_row.tgname = 'action_case_validate_update'
      AND trigger_row.tgisinternal IS FALSE
  `);
  return {
    functions: rows(functions), constraints: rows(constraints), index: rows(index)[0],
    roleCapabilities: rows(roleCapabilities), transitionTrigger: rows(transitionTrigger)[0],
    statusColumns, leaveView: rows(leaveView)[0],
    leaveViewColumns: rows(leaveViewColumns),
    ...rows(catalogs)[0],
  };
}

async function collectRuntimeAclEvidence(client) {
  const runtimeRole = await client.query(`
    SELECT role_row.rolcanlogin AS "canLogin", role_row.rolinherit AS inherit,
      role_row.rolsuper AS superuser, role_row.rolbypassrls AS "bypassRls",
      role_row.rolcreatedb AS "createDb", role_row.rolcreaterole AS "createRole",
      role_row.rolreplication AS replication,
      (SELECT count(*)::integer FROM pg_auth_members membership WHERE membership.member = role_row.oid) AS "membershipCount",
      (SELECT count(*)::integer FROM pg_auth_members membership WHERE membership.roleid = role_row.oid) AS "memberCount",
      has_schema_privilege(role_row.oid, 'public', 'USAGE') AS "schemaUsage",
      has_schema_privilege(role_row.oid, 'public', 'CREATE') AS "schemaCreate"
    FROM pg_roles role_row WHERE role_row.rolname = $1
  `, [RUNTIME_ROLE]);
  const roleMemberships = await client.query(`
    SELECT CASE WHEN membership.member = runtime_role.oid THEN 'granted_to_runtime'
        ELSE 'member_of_runtime' END AS direction,
      granted_role.rolname AS "grantedRole", member_role.rolname AS "memberRole",
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
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE membership.member = runtime_role.oid OR membership.roleid = runtime_role.oid
    ORDER BY direction, "grantedRole", "memberRole"
  `, [RUNTIME_ROLE, SECURITY_FUNCTIONS]);
  const runtimeFunctions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS execute
    FROM pg_proc function_row JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND (
      function_row.proname LIKE 'action_center%' OR function_row.proname LIKE 'tenant_action%'
      OR function_row.proname LIKE 'tenant_iam%' OR function_row.proname LIKE 'tenant_identity%')
    ORDER BY signature
  `, [RUNTIME_ROLE]);
  const unexpectedSecurityDefiners = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public'
      AND function_row.prosecdef IS TRUE
      AND has_function_privilege($1, function_row.oid, 'EXECUTE')
      AND NOT (format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[]))
    ORDER BY signature
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
    ORDER BY relation.relname
  `, [RUNTIME_ROLE]);
  const sequences = await client.query(`
    SELECT relation.relname AS name,
      has_sequence_privilege($1, relation.oid, 'USAGE') AS "canUsage",
      has_sequence_privilege($1, relation.oid, 'SELECT') AS "canSelect",
      has_sequence_privilege($1, relation.oid, 'UPDATE') AS "canUpdate"
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'S'
    ORDER BY relation.relname
  `, [RUNTIME_ROLE]);
  return { runtimeRole: rows(runtimeRole)[0], roleMemberships: rows(roleMemberships),
    runtimeFunctions: rows(runtimeFunctions),
    unexpectedSecurityDefiners: rows(unexpectedSecurityDefiners),
    relations: rows(relations), sequences: rows(sequences) };
}

export async function verifyOvertimeFinalAcl(client) {
  validateOvertimeEvidence(await collectEvidence(client));
  validateOvertimeRuntimeAclEvidence(await collectRuntimeAclEvidence(client));
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateOvertimeMigrationSql(migration);
  const checksum = createHash('sha256').update(migration).digest('hex');
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directCanonicalDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:overtime-008'))");
    await verifyPrerequisites(client);
    validateOvertimeStatusUpgradeSourceEvidence(await collectStatusUpgradeSourceEvidence(client));
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1', [OVERTIME_MIGRATION_VERSION],
    );
    if (existing.rowCount && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${OVERTIME_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      for (const [index, statement] of statements.entries()) {
        try { await client.query(statement); } catch (error) {
          throw new Error(
            `migracion ${OVERTIME_MIGRATION_VERSION} sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [OVERTIME_MIGRATION_VERSION, checksum],
      );
    }
    await verifyOvertimeFinalAcl(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${OVERTIME_MIGRATION_VERSION}: ya aplicada y verificada (SHA-256 ${checksum})`
      : `${OVERTIME_MIGRATION_VERSION}: aplicada (${statements.length} sentencias, SHA-256 ${checksum})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
