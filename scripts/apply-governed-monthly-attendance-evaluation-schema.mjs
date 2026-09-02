import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const ATTENDANCE_EVALUATION_MIGRATION_VERSION =
  '024-governed-monthly-attendance-evaluation';
export const ATTENDANCE_EVALUATION_TABLES = Object.freeze([
  'attendance_evaluation_run',
  'attendance_evaluation_source',
  'attendance_evaluation_result',
  'attendance_evaluation_audit_event',
]);
export const ATTENDANCE_EVALUATION_PAYROLL_TABLES = Object.freeze([
  'attendance_evaluation_run',
  'attendance_evaluation_result',
  'attendance_evaluation_audit_event',
]);
export const ATTENDANCE_EVALUATION_FUNCTIONS = Object.freeze([
  'public.attendance_evaluation_reject_change_v1()',
  'public.attendance_evaluation_actor_valid_v1(uuid,uuid,uuid,uuid)',
  'public.attendance_evaluation_actor_has_capability_v1(uuid,uuid,text)',
  'public.attendance_evaluation_source_manifest_v1(uuid,uuid)',
  'public.attendance_evaluation_run_guard_v1()',
  'public.attendance_evaluation_child_guard_v1()',
  'public.attendance_evaluation_audit_run_v1()',
]);
export const ATTENDANCE_EVALUATION_EXPECTED_COLUMNS = Object.freeze({
  attendance_evaluation_run: [
    'id', 'tenant_id', 'certified_binding_id', 'period_month', 'timezone',
    'rule_profile_entry_id', 'rule_profile_kind', 'source_manifest_sha256',
    'evaluator_version', 'status', 'version', 'result_count',
    'creator_membership_id', 'creator_person_id', 'approver_membership_id',
    'approver_person_id', 'reason_code', 'reason_reference', 'payroll_posted',
    'created_at', 'updated_at', 'submitted_at', 'decided_at',
  ],
  attendance_evaluation_source: [
    'run_id', 'tenant_id', 'ingest_batch_id', 'batch_payload_sha256',
    'batch_event_count', 'recorded_event_count', 'recorded_event_set_sha256', 'created_at',
  ],
  attendance_evaluation_result: [
    'run_id', 'tenant_id', 'employment_contract_id', 'scheduled_minutes',
    'worked_minutes', 'tardy_minutes', 'early_departure_minutes',
    'unjustified_absence_minutes', 'justified_absence_minutes', 'tardy_occurrences',
    'unjustified_absence_days', 'source_event_count', 'calculation_sha256',
    'outcome_code', 'payroll_posted', 'created_at', 'updated_at',
  ],
  attendance_evaluation_audit_event: [
    'id', 'tenant_id', 'run_id', 'actor_membership_id', 'actor_person_id',
    'command', 'from_status', 'to_status', 'run_version', 'reason_code',
    'reason_reference', 'event_sha256', 'payroll_posted', 'occurred_at',
  ],
});

const ATTENDANCE_EVALUATION_NULLABLE_COLUMNS = new Set([
  'attendance_evaluation_run.approver_membership_id',
  'attendance_evaluation_run.approver_person_id',
  'attendance_evaluation_run.submitted_at',
  'attendance_evaluation_run.decided_at',
  'attendance_evaluation_audit_event.from_status',
]);
const ATTENDANCE_EVALUATION_CHARACTER_LENGTHS = Object.freeze({
  'attendance_evaluation_run.timezone': 64,
  'attendance_evaluation_run.rule_profile_kind': 24,
  'attendance_evaluation_run.source_manifest_sha256': 64,
  'attendance_evaluation_run.evaluator_version': 64,
  'attendance_evaluation_run.status': 16,
  'attendance_evaluation_run.reason_code': 64,
  'attendance_evaluation_run.reason_reference': 128,
  'attendance_evaluation_source.batch_payload_sha256': 64,
  'attendance_evaluation_source.recorded_event_set_sha256': 64,
  'attendance_evaluation_result.calculation_sha256': 64,
  'attendance_evaluation_result.outcome_code': 32,
  'attendance_evaluation_audit_event.command': 24,
  'attendance_evaluation_audit_event.from_status': 16,
  'attendance_evaluation_audit_event.to_status': 16,
  'attendance_evaluation_audit_event.reason_code': 64,
  'attendance_evaluation_audit_event.reason_reference': 128,
  'attendance_evaluation_audit_event.event_sha256': 64,
});

export function attendanceEvaluationExpectedColumnContract(tableName, columnName) {
  const qualified = `${tableName}.${columnName}`;
  let dataType = 'character varying';
  if (columnName === 'id' || columnName.endsWith('_id')) dataType = 'uuid';
  else if (columnName === 'period_month') dataType = 'date';
  else if (columnName.endsWith('_at')) dataType = 'timestamp with time zone';
  else if (columnName === 'payroll_posted') dataType = 'boolean';
  else if (columnName.endsWith('_sha256')) dataType = 'character';
  else if (columnName === 'version' || columnName === 'run_version'
      || columnName.endsWith('_count') || columnName.endsWith('_minutes')
      || columnName.endsWith('_occurrences') || columnName.endsWith('_days')) {
    dataType = 'integer';
  }
  return Object.freeze({
    dataType,
    notNull: !ATTENDANCE_EVALUATION_NULLABLE_COLUMNS.has(qualified),
    characterMaximumLength: ATTENDANCE_EVALUATION_CHARACTER_LENGTHS[qualified] ?? null,
  });
}

export const ATTENDANCE_EVALUATION_EXPECTED_CONSTRAINTS = Object.freeze([
  'attendance_evaluation_run_pkey', 'attendance_evaluation_run_tenant_fk',
  'attendance_evaluation_run_creator_person_fk',
  'attendance_evaluation_run_approver_person_fk',
  'attendance_evaluation_run_id_tenant_uk', 'attendance_evaluation_run_period_uk',
  'attendance_evaluation_run_binding_fk', 'attendance_evaluation_run_rule_fk',
  'attendance_evaluation_run_creator_fk', 'attendance_evaluation_run_approver_fk',
  'attendance_evaluation_run_month_ck', 'attendance_evaluation_run_rule_kind_ck',
  'attendance_evaluation_run_hash_ck', 'attendance_evaluation_run_evaluator_ck',
  'attendance_evaluation_run_reason_reference_ck',
  'attendance_evaluation_run_status_ck', 'attendance_evaluation_run_reason_ck',
  'attendance_evaluation_run_version_ck', 'attendance_evaluation_run_checker_pair_ck',
  'attendance_evaluation_run_maker_checker_ck', 'attendance_evaluation_run_state_ck',
  'attendance_evaluation_run_payroll_block_ck', 'attendance_evaluation_run_timezone_ck',
  'attendance_evaluation_source_pkey', 'attendance_evaluation_source_run_fk',
  'attendance_evaluation_source_batch_fk', 'attendance_evaluation_source_hash_ck',
  'attendance_evaluation_source_count_ck',
  'attendance_evaluation_result_pkey', 'attendance_evaluation_result_contract_fk',
  'attendance_evaluation_result_run_fk', 'attendance_evaluation_result_minutes_ck',
  'attendance_evaluation_result_hash_ck', 'attendance_evaluation_result_outcome_ck',
  'attendance_evaluation_result_outcome_consistency_ck',
  'attendance_evaluation_result_payroll_block_ck',
  'attendance_evaluation_audit_pkey', 'attendance_evaluation_audit_tenant_fk',
  'attendance_evaluation_audit_actor_person_fk',
  'attendance_evaluation_audit_run_version_uk', 'attendance_evaluation_audit_run_fk',
  'attendance_evaluation_audit_membership_fk', 'attendance_evaluation_audit_command_ck',
  'attendance_evaluation_audit_hash_ck', 'attendance_evaluation_audit_version_ck',
  'attendance_evaluation_audit_reason_reference_ck',
  'attendance_evaluation_audit_payroll_block_ck',
]);

export const ATTENDANCE_EVALUATION_EXPECTED_INDEXES = Object.freeze([
  'attendance_evaluation_run_pkey', 'attendance_evaluation_run_id_tenant_uk',
  'attendance_evaluation_run_period_uk', 'attendance_evaluation_run_tenant_period_idx',
  'attendance_evaluation_source_pkey',
  'attendance_evaluation_result_pkey', 'attendance_evaluation_result_tenant_run_idx',
  'attendance_evaluation_audit_pkey', 'attendance_evaluation_audit_run_version_uk',
  'attendance_evaluation_audit_timeline_idx',
]);

export const ATTENDANCE_EVALUATION_FOREIGN_KEY_TOKENS = Object.freeze({
  attendance_evaluation_run_tenant_fk:
    ['foreign key (tenant_id)', 'references platform_tenant(id)', 'on delete restrict'],
  attendance_evaluation_run_creator_person_fk:
    ['foreign key (creator_person_id)', 'references person_identity(id)', 'on delete restrict'],
  attendance_evaluation_run_approver_person_fk:
    ['foreign key (approver_person_id)', 'references person_identity(id)', 'on delete restrict'],
  attendance_evaluation_run_binding_fk:
    ['foreign key (tenant_id, certified_binding_id)',
      'references platform_tenant_source_binding(tenant_id, id)', 'on delete restrict'],
  attendance_evaluation_run_rule_fk:
    ['foreign key (rule_profile_entry_id, tenant_id, rule_profile_kind)',
      'references time_catalog_entry(id, tenant_id, catalog_kind)', 'on delete restrict'],
  attendance_evaluation_run_creator_fk:
    ['foreign key (creator_membership_id, tenant_id)',
      'references tenant_membership(id, tenant_id)', 'on delete restrict'],
  attendance_evaluation_run_approver_fk:
    ['foreign key (approver_membership_id, tenant_id)',
      'references tenant_membership(id, tenant_id)', 'on delete restrict'],
  attendance_evaluation_source_run_fk:
    ['foreign key (run_id, tenant_id)',
      'references attendance_evaluation_run(id, tenant_id)', 'on delete restrict'],
  attendance_evaluation_source_batch_fk:
    ['foreign key (ingest_batch_id, tenant_id)',
      'references attendance_ingest_batch(id, tenant_id)', 'on delete restrict'],
  attendance_evaluation_result_contract_fk:
    ['foreign key (employment_contract_id)',
      'references employment_contract(id)', 'on delete restrict'],
  attendance_evaluation_result_run_fk:
    ['foreign key (run_id, tenant_id)',
      'references attendance_evaluation_run(id, tenant_id)', 'on delete restrict'],
  attendance_evaluation_audit_tenant_fk:
    ['foreign key (tenant_id)', 'references platform_tenant(id)', 'on delete restrict'],
  attendance_evaluation_audit_actor_person_fk:
    ['foreign key (actor_person_id)', 'references person_identity(id)', 'on delete restrict'],
  attendance_evaluation_audit_run_fk:
    ['foreign key (run_id, tenant_id)',
      'references attendance_evaluation_run(id, tenant_id)', 'on delete restrict'],
  attendance_evaluation_audit_membership_fk:
    ['foreign key (actor_membership_id, tenant_id)',
      'references tenant_membership(id, tenant_id)', 'on delete restrict'],
});

export const ATTENDANCE_EVALUATION_CHECK_TOKENS = Object.freeze({
  attendance_evaluation_run_month_ck: ['period_month', '2000-01-01', '2100-12-01'],
  attendance_evaluation_run_rule_kind_ck: ['rule_profile_kind', 'rule_profile'],
  attendance_evaluation_run_hash_ck: ['source_manifest_sha256', '[a-f0-9]{64}'],
  attendance_evaluation_run_reason_reference_ck: ['reason_reference', '{0,127}'],
  attendance_evaluation_run_evaluator_ck: ['evaluator_version', '[1-9]', '{0,2}'],
  attendance_evaluation_run_status_ck:
    ['status', 'draft', 'prepared', 'submitted', 'approved', 'rejected', 'cancelled'],
  attendance_evaluation_run_reason_ck:
    ['reason_code', 'monthly_close', 'source_corrected', 'ready_for_review',
      'attendance_verified', 'calculation_invalid', 'evidence_insufficient',
      'source_not_authoritative', 'cancelled_by_creator'],
  attendance_evaluation_run_version_ck: ['version', 'result_count'],
  attendance_evaluation_run_checker_pair_ck:
    ['approver_membership_id', 'approver_person_id', 'is null', 'is not null'],
  attendance_evaluation_run_maker_checker_ck:
    ['approver_person_id', 'creator_person_id', 'approver_membership_id',
      'creator_membership_id'],
  attendance_evaluation_run_state_ck:
    ['status', 'submitted_at', 'decided_at', 'approver_membership_id',
      'approver_person_id', 'draft', 'submitted', 'approved', 'rejected', 'cancelled'],
  attendance_evaluation_run_payroll_block_ck: ['payroll_posted', 'false'],
  attendance_evaluation_run_timezone_ck: ['timezone', 'america/argentina/mendoza'],
  attendance_evaluation_source_hash_ck:
    ['batch_payload_sha256', 'recorded_event_set_sha256', '[a-f0-9]{64}'],
  attendance_evaluation_source_count_ck:
    ['batch_event_count', 'recorded_event_count'],
  attendance_evaluation_result_minutes_ck:
    ['scheduled_minutes', 'worked_minutes', 'tardy_minutes', 'early_departure_minutes',
      'unjustified_absence_minutes', 'justified_absence_minutes', 'tardy_occurrences',
      'unjustified_absence_days', 'source_event_count'],
  attendance_evaluation_result_hash_ck: ['calculation_sha256', '[a-f0-9]{64}'],
  attendance_evaluation_result_outcome_ck:
    ['outcome_code', 'compliant', 'tardy', 'partial_absence', 'unjustified_absence',
      'justified_absence', 'insufficient_evidence', 'no_schedule'],
  attendance_evaluation_result_outcome_consistency_ck:
    ['outcome_code', 'compliant', 'scheduled_minutes', 'worked_minutes',
      'tardy_minutes', 'tardy_occurrences', 'partial_absence', 'early_departure_minutes',
      'unjustified_absence', 'unjustified_absence_minutes', 'unjustified_absence_days',
      'justified_absence', 'justified_absence_minutes', 'insufficient_evidence',
      'no_schedule'],
  attendance_evaluation_result_payroll_block_ck: ['payroll_posted', 'false'],
  attendance_evaluation_audit_command_ck:
    ['command', 'create', 'prepare', 'revise', 'submit', 'approve', 'reject', 'cancel'],
  attendance_evaluation_audit_hash_ck: ['event_sha256', '[a-f0-9]{64}'],
  attendance_evaluation_audit_reason_reference_ck: ['reason_reference', '{0,127}'],
  attendance_evaluation_audit_version_ck: ['run_version'],
  attendance_evaluation_audit_payroll_block_ck: ['payroll_posted', 'false'],
});

export const ATTENDANCE_EVALUATION_INDEX_TOKENS = Object.freeze({
  attendance_evaluation_run_pkey: ['attendance_evaluation_run', '(id)'],
  attendance_evaluation_run_id_tenant_uk:
    ['attendance_evaluation_run', '(id, tenant_id)'],
  attendance_evaluation_run_period_uk:
    ['attendance_evaluation_run',
      '(tenant_id, period_month, rule_profile_entry_id, source_manifest_sha256)'],
  attendance_evaluation_run_tenant_period_idx:
    ['attendance_evaluation_run', '(tenant_id, period_month desc, status, id)'],
  attendance_evaluation_source_pkey:
    ['attendance_evaluation_source', '(run_id, ingest_batch_id)'],
  attendance_evaluation_result_pkey:
    ['attendance_evaluation_result', '(run_id, employment_contract_id)'],
  attendance_evaluation_result_tenant_run_idx:
    ['attendance_evaluation_result', '(tenant_id, run_id, outcome_code)'],
  attendance_evaluation_audit_pkey: ['attendance_evaluation_audit_event', '(id)'],
  attendance_evaluation_audit_run_version_uk:
    ['attendance_evaluation_audit_event', '(run_id, run_version)'],
  attendance_evaluation_audit_timeline_idx:
    ['attendance_evaluation_audit_event', '(tenant_id, run_id, occurred_at, id)'],
});
export const ATTENDANCE_EVALUATION_ROLE_MATRIX = Object.freeze({
  JUNIN_ASISTENCIA_EVALUADOR: [
    'attendance.evaluation.prepare', 'attendance.evaluation.read',
  ],
  JUNIN_ASISTENCIA_APROBADOR: [
    'attendance.evaluation.approve', 'attendance.evaluation.audit.read',
    'attendance.evaluation.read',
  ],
});
export const ATTENDANCE_EVALUATION_REQUIRED_CONFLICTS = Object.freeze([
  'attendance.evaluation.approve|attendance.evaluation.prepare',
  'attendance.evaluation.approve|time.overtime.post',
]);

export const ATTENDANCE_EVALUATION_EXPECTED_TRIGGERS = Object.freeze({
  attendance_evaluation_run_guard_v1: {
    tableName: 'attendance_evaluation_run',
    functionName: 'attendance_evaluation_run_guard_v1',
    beforeTiming: true, insertEvent: true, updateEvent: true, deleteEvent: false,
  },
  attendance_evaluation_run_no_delete_v1: {
    tableName: 'attendance_evaluation_run',
    functionName: 'attendance_evaluation_reject_change_v1',
    beforeTiming: true, insertEvent: false, updateEvent: false, deleteEvent: true,
  },
  attendance_evaluation_source_guard_v1: {
    tableName: 'attendance_evaluation_source',
    functionName: 'attendance_evaluation_child_guard_v1',
    beforeTiming: true, insertEvent: true, updateEvent: true, deleteEvent: true,
  },
  attendance_evaluation_result_guard_v1: {
    tableName: 'attendance_evaluation_result',
    functionName: 'attendance_evaluation_child_guard_v1',
    beforeTiming: true, insertEvent: true, updateEvent: true, deleteEvent: true,
  },
  attendance_evaluation_audit_append_only_v1: {
    tableName: 'attendance_evaluation_audit_event',
    functionName: 'attendance_evaluation_reject_change_v1',
    beforeTiming: true, insertEvent: false, updateEvent: true, deleteEvent: true,
  },
  attendance_evaluation_run_audit_v1: {
    tableName: 'attendance_evaluation_run',
    functionName: 'attendance_evaluation_audit_run_v1',
    beforeTiming: false, insertEvent: true, updateEvent: true, deleteEvent: false,
  },
});

const MIGRATION_URL = new URL(
  './migrations/024-governed-monthly-attendance-evaluation.sql', import.meta.url,
);
const PREREQUISITES = Object.freeze([
  ['011-versioned-time-catalog', new URL(
    './migrations/011-versioned-time-catalog.sql', import.meta.url,
  )],
  ['022-attendance-device-gateway', new URL(
    './migrations/022-attendance-device-gateway.sql', import.meta.url,
  )],
  ['023-time-source-unlinked-reader', new URL(
    './migrations/023-time-source-unlinked-reader.sql', import.meta.url,
  )],
]);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function exactSet(actual, expected, label) {
  const got = [...new Set(actual || [])].map(String).sort();
  const wanted = [...new Set(expected || [])].map(String).sort();
  if (got.length !== (actual || []).length
      || JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

function requireTokens(label, value, tokens) {
  const body = normalized(value);
  for (const token of tokens) {
    if (!body.includes(normalized(token))) throw new Error(`${label} no contiene ${token}`);
  }
}

function functionBodyFromMigration(sql, signature) {
  const name = signature.match(/^public\.([a-z0-9_]+)\(/)?.[1];
  const start = String(sql).indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  const bodyMarker = start < 0 ? -1 : String(sql).indexOf('AS $$', start);
  const bodyStart = bodyMarker < 0 ? -1 : bodyMarker + 'AS $$'.length;
  const bodyEnd = bodyStart < 0 ? -1 : String(sql).indexOf('$$;', bodyStart);
  if (start < 0 || bodyStart < 0 || bodyEnd < bodyStart) {
    throw new Error(`funcion 024 no parseable: ${signature}`);
  }
  return String(sql).slice(bodyStart, bodyEnd);
}

export function attendanceEvaluationFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function attendanceEvaluationFunctionFingerprint(value) {
  const canonical = String(value || '').replace(/\r\n?/g, '\n').trim();
  return attendanceEvaluationFingerprint(canonical);
}

const migrationContractSource = await readFile(MIGRATION_URL, 'utf8');
export const ATTENDANCE_EVALUATION_FUNCTION_SOURCE_HASHES = Object.freeze(
  Object.fromEntries(ATTENDANCE_EVALUATION_FUNCTIONS.map((signature) => [
    signature,
    attendanceEvaluationFunctionFingerprint(
      functionBodyFromMigration(migrationContractSource, signature),
    ),
  ])),
);

export function validateAttendanceEvaluationMigrationSql(sql) {
  const source = String(sql || '');
  requireTokens('migracion 024', source, [
    ...ATTENDANCE_EVALUATION_TABLES.map((table) => `CREATE TABLE IF NOT EXISTS ${table}`),
    ...ATTENDANCE_EVALUATION_FUNCTIONS.map((signature) =>
      `CREATE OR REPLACE FUNCTION ${signature.match(/^public\.([a-z0-9_]+)\(/)?.[1]}(`),
    "'attendance.evaluation.read'", "'attendance.evaluation.prepare'",
    "'attendance.evaluation.approve'", "'attendance.evaluation.audit.read'",
    "'attendance.evaluation.approve', 'attendance.evaluation.prepare'",
    "'attendance.evaluation.approve', 'time.overtime.post'",
    'REFERENCES time_catalog_entry(id, tenant_id, catalog_kind)',
    'REFERENCES attendance_ingest_batch(id, tenant_id)',
    "rule_row.status <> 'approved'", 'attendance_evaluation_actor_valid_v1',
    'tenant_iam_effective_capabilities',
    "'attendance.evaluation.prepare'", "'attendance.evaluation.approve'",
    'ATTENDANCE_EVALUATION_PREPARE_CAPABILITY_REQUIRED',
    'ATTENDANCE_EVALUATION_APPROVE_CAPABILITY_REQUIRED',
    'approver_person_id <> creator_person_id',
    'ATTENDANCE_EVALUATION_INSERT_MUST_BE_DRAFT',
    "OLD.status = 'submitted' AND NEW.status IN ('approved','rejected')",
    "WHEN 'draft' THEN 'revise'",
    'ATTENDANCE_EVALUATION_SOURCE_APPEND_ONLY',
    'ATTENDANCE_EVALUATION_RESULT_IDENTITY_IMMUTABLE',
    'ATTENDANCE_EVALUATION_CALCULATION_HASH_MISMATCH',
    'ATTENDANCE_EVALUATION_RESULT_EVENT_MISMATCH',
    'attendance_evaluation_source_manifest_v1',
    "NEW.status IN ('submitted','approved')",
    'ATTENDANCE_EVALUATION_SOURCE_BINDING_MISMATCH',
    'policy.certified_source_binding_id = run_row.certified_binding_id',
    'lower(policy.certified_release_sha) = lower(batch_row.release_sha)',
    'ATTENDANCE_EVALUATION_RESULTS_LOCKED',
    'BEFORE UPDATE OR DELETE ON attendance_evaluation_audit_event',
    'AFTER INSERT OR UPDATE ON attendance_evaluation_run',
    'payroll_posted boolean NOT NULL DEFAULT false',
    'CHECK (payroll_posted IS FALSE)',
    'REVOKE ALL PRIVILEGES ON TABLE attendance_evaluation_run',
  ]);

  const payrollColumns = source.match(/payroll_posted boolean NOT NULL DEFAULT false/gi) || [];
  const payrollChecks = source.match(/payroll_posted IS FALSE/gi) || [];
  if (payrollColumns.length !== ATTENDANCE_EVALUATION_PAYROLL_TABLES.length
      || payrollChecks.length < ATTENDANCE_EVALUATION_PAYROLL_TABLES.length) {
    throw new Error('024 no bloquea payroll en todas las relaciones aplicables');
  }
  exactSet(
    [...source.matchAll(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(attendance_evaluation_[a-z0-9_]+)/gi)]
      .map((match) => match[1]),
    [],
    'grants runtime 024',
  );
  if (/guillen|gmail\.com|marcelo@|hugo@|admin@|\b(?:password|raw_code|plain_code|otp_code)\b/i
    .test(source)) {
    throw new Error('024 contiene identidad concreta, credenciales o secretos');
  }
  if (/\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:public\.)?(?:payroll|nomina|action_case|time_catalog_entry|attendance_ingest_batch|attendance_raw_event|attendance_canonical_punch)\b/i
    .test(source)) {
    throw new Error('024 intenta mutar nomina, action center o fuentes gobernadas');
  }
  return true;
}

export function validateAttendanceEvaluationEvidence(evidence) {
  const expectedOwner = String(evidence?.currentUser || '');
  if (!expectedOwner || expectedOwner === RUNTIME_ROLE) {
    throw new Error('owner de esquema 024 invalido');
  }
  exactSet((evidence?.tables || []).map((row) => row.tableName),
    ATTENDANCE_EVALUATION_TABLES, 'tablas 024');
  for (const table of evidence?.tables || []) {
    if (table.ownerIsRuntime === true || table.publicPrivileges === true
        || table.runtimePrivileges === true || table.hasTenantId !== true
        || table.tenantIdNotNull !== true || table.ownerName !== expectedOwner) {
      throw new Error(`tabla insegura 024 ${table.tableName}`);
    }
  }

  for (const [tableName, expectedColumns] of
    Object.entries(ATTENDANCE_EVALUATION_EXPECTED_COLUMNS)) {
    exactSet((evidence?.columns || [])
      .filter((row) => row.tableName === tableName)
      .map((row) => row.columnName), expectedColumns, `columnas 024 ${tableName}`);
  }
  for (const column of evidence?.columns || []) {
    const expected = attendanceEvaluationExpectedColumnContract(
      column.tableName, column.columnName,
    );
    if (column.notNull !== expected.notNull || column.dataType !== expected.dataType
        || (column.characterMaximumLength ?? null) !== expected.characterMaximumLength) {
      throw new Error(`columna con drift 024 ${column.tableName}.${column.columnName}`);
    }
  }

  exactSet((evidence?.constraints || []).map((row) => row.name),
    ATTENDANCE_EVALUATION_EXPECTED_CONSTRAINTS, 'constraints 024');
  for (const constraint of evidence?.constraints || []) {
    const expectedType = constraint.name.endsWith('_pkey') ? 'p'
      : constraint.name.endsWith('_uk') ? 'u'
        : constraint.name.endsWith('_fk') ? 'f' : 'c';
    if (constraint.validated !== true || constraint.deferrable === true
        || constraint.type !== expectedType || !String(constraint.definition || '').trim()
        || (constraint.type === 'c'
          && normalized(constraint.definition) === 'check (true)')) {
      throw new Error(`constraint invalido 024 ${constraint.name}`);
    }
  }
  const constraintDefinitions = Object.fromEntries(
    (evidence?.constraints || []).map((row) => [row.name, normalized(row.definition)]),
  );
  for (const [name, tokens] of Object.entries(ATTENDANCE_EVALUATION_FOREIGN_KEY_TOKENS)) {
    requireTokens(`FK ${name} 024`, constraintDefinitions[name], tokens);
  }
  for (const [name, tokens] of Object.entries(ATTENDANCE_EVALUATION_CHECK_TOKENS)) {
    requireTokens(`CHECK ${name} 024`, constraintDefinitions[name], tokens);
  }

  exactSet((evidence?.indexes || []).map((row) => row.name),
    ATTENDANCE_EVALUATION_EXPECTED_INDEXES, 'indices 024');
  for (const index of evidence?.indexes || []) {
    if (index.valid !== true || index.ready !== true || !String(index.definition || '').trim()) {
      throw new Error(`indice invalido 024 ${index.name}`);
    }
    requireTokens(`indice ${index.name} 024`, index.definition,
      ATTENDANCE_EVALUATION_INDEX_TOKENS[index.name] || []);
  }

  const payroll = new Map((evidence?.payroll || []).map((row) => [row.tableName, row]));
  exactSet([...payroll.keys()], ATTENDANCE_EVALUATION_PAYROLL_TABLES, 'payroll 024');
  for (const [tableName, column] of payroll) {
    if (column.notNull !== true || normalized(column.defaultValue) !== 'false'
        || column.blockedByCheck !== true) {
      throw new Error(`payroll no bloqueado 024 ${tableName}`);
    }
  }

  const resultColumns = (evidence?.columns || [])
    .filter((row) => row.tableName === 'attendance_evaluation_result')
    .map((row) => row.columnName);
  if (!resultColumns.includes('employment_contract_id')
      || resultColumns.some((column) =>
        /(?:name|nombre|apellido|dni|cuil|legajo|email|phone|address|fingerprint|template|identity_hmac)/i
          .test(column))) {
    throw new Error('resultado 024 duplica PII o carece de contrato canonico');
  }

  exactSet((evidence?.functions || []).map((fn) => fn.signature),
    ATTENDANCE_EVALUATION_FUNCTIONS, 'funciones 024');
  for (const fn of evidence?.functions || []) {
    if (fn.securityDefiner !== true || fn.ownerIsRuntime === true
        || fn.ownerName !== expectedOwner
        || fn.publicExecuteRevoked !== true || fn.runtimeExecuteRevoked !== true
        || !(fn.config || []).map(normalized).includes('search_path=public, pg_temp')
        || fn.sourceHash !== ATTENDANCE_EVALUATION_FUNCTION_SOURCE_HASHES[fn.signature]) {
      throw new Error(`funcion insegura o con drift 024 ${fn.signature}`);
    }
  }

  exactSet((evidence?.triggers || []).map((row) => row.name),
    Object.keys(ATTENDANCE_EVALUATION_EXPECTED_TRIGGERS), 'triggers 024');
  for (const trigger of evidence?.triggers || []) {
    const expected = ATTENDANCE_EVALUATION_EXPECTED_TRIGGERS[trigger.name];
    if (!expected || trigger.tableName !== expected.tableName
        || trigger.functionName !== expected.functionName
        || trigger.enabled !== 'O' || trigger.rowLevel !== true
        || trigger.unconditional !== true || trigger.beforeTiming !== expected.beforeTiming
        || trigger.insertEvent !== expected.insertEvent
        || trigger.updateEvent !== expected.updateEvent
        || trigger.deleteEvent !== expected.deleteEvent) {
      throw new Error(`trigger invalido 024 ${trigger.name}`);
    }
  }
  if ((evidence?.nonOwnerAcl || []).length) {
    throw new Error('ACL directa detectada en tablas 024');
  }

  const roleMap = Object.fromEntries(
    (evidence?.roles || []).map((role) => [role.roleKey, role.capabilities]),
  );
  exactSet(Object.keys(roleMap), Object.keys(ATTENDANCE_EVALUATION_ROLE_MATRIX), 'roles 024');
  for (const [role, expected] of Object.entries(ATTENDANCE_EVALUATION_ROLE_MATRIX)) {
    exactSet(roleMap[role], expected, `capacidades 024 ${role}`);
  }
  exactSet((evidence?.requiredConflicts || []).map((row) => row.key),
    ATTENDANCE_EVALUATION_REQUIRED_CONFLICTS, 'conflictos SoD requeridos 024');
  if ((evidence?.conflicts || []).length) throw new Error('SoD 024 incumplida');
  return true;
}

async function collectEvidence(client) {
  const identityResult = await client.query('SELECT current_user AS "currentUser"');
  const currentUser = rows(identityResult)[0]?.currentUser;
  const tablesResult = await client.query(`
    SELECT relation.relname AS "tableName",
      owner_role.rolname AS "ownerName",
      relation.relowner = (SELECT oid FROM pg_roles WHERE rolname = $2) AS "ownerIsRuntime",
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(relation.relacl,
        acldefault('r', relation.relowner))) acl WHERE acl.grantee = 0) AS "publicPrivileges",
      has_table_privilege($2, relation.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS "runtimePrivileges",
      EXISTS (SELECT 1 FROM pg_attribute attribute WHERE attribute.attrelid = relation.oid
        AND attribute.attname = 'tenant_id' AND attribute.attnum > 0
        AND attribute.attisdropped IS FALSE) AS "hasTenantId",
      COALESCE((SELECT attribute.attnotnull FROM pg_attribute attribute
        WHERE attribute.attrelid = relation.oid AND attribute.attname = 'tenant_id'
          AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE), false)
        AS "tenantIdNotNull"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner_role ON owner_role.oid = relation.relowner
    WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
      AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname
  `, [ATTENDANCE_EVALUATION_TABLES, RUNTIME_ROLE]);
  const columnsResult = await client.query(`
    SELECT table_name AS "tableName", column_name AS "columnName",
      is_nullable = 'NO' AS "notNull", data_type AS "dataType",
      character_maximum_length AS "characterMaximumLength",
      column_default AS "defaultValue"
    FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = ANY($1::text[]) ORDER BY table_name, ordinal_position
  `, [ATTENDANCE_EVALUATION_TABLES]);
  const constraintsResult = await client.query(`
    SELECT constraint_row.conname AS name, relation.relname AS "tableName",
      constraint_row.contype AS type, constraint_row.convalidated AS validated,
      constraint_row.condeferrable AS deferrable,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
    ORDER BY constraint_row.conname
  `, [ATTENDANCE_EVALUATION_TABLES]);
  const indexesResult = await client.query(`
    SELECT index_row.relname AS name, table_row.relname AS "tableName",
      index_meta.indisvalid AS valid, index_meta.indisready AS ready,
      pg_get_indexdef(index_row.oid) AS definition
    FROM pg_index index_meta
    JOIN pg_class index_row ON index_row.oid = index_meta.indexrelid
    JOIN pg_class table_row ON table_row.oid = index_meta.indrelid
    JOIN pg_namespace namespace ON namespace.oid = table_row.relnamespace
    WHERE namespace.nspname = 'public' AND table_row.relname = ANY($1::text[])
    ORDER BY index_row.relname
  `, [ATTENDANCE_EVALUATION_TABLES]);
  const payrollResult = await client.query(`
    SELECT relation.relname AS "tableName", attribute.attnotnull AS "notNull",
      pg_get_expr(default_row.adbin, default_row.adrelid) AS "defaultValue",
      EXISTS (SELECT 1 FROM pg_constraint constraint_row
        WHERE constraint_row.conrelid = relation.oid AND constraint_row.contype = 'c'
          AND constraint_row.convalidated IS TRUE
          AND lower(pg_get_constraintdef(constraint_row.oid, true))
            LIKE '%payroll_posted is false%') AS "blockedByCheck"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      AND attribute.attname = 'payroll_posted' AND attribute.attnum > 0
      AND attribute.attisdropped IS FALSE
    LEFT JOIN pg_attrdef default_row ON default_row.adrelid = relation.oid
      AND default_row.adnum = attribute.attnum
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname
  `, [ATTENDANCE_EVALUATION_PAYROLL_TABLES]);
  const functionsResult = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
      replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      owner_role.rolname AS "ownerName",
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = (SELECT oid FROM pg_roles WHERE rolname = $1) AS "ownerIsRuntime",
      NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(function_row.proacl,
        acldefault('f', function_row.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS "publicExecuteRevoked",
      NOT has_function_privilege($1, function_row.oid, 'EXECUTE') AS "runtimeExecuteRevoked",
      COALESCE(function_row.proconfig, ARRAY[]::text[]) AS config,
      function_row.prosrc AS "sourceBody"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid = function_row.proowner
    WHERE namespace.nspname = 'public'
      AND function_row.proname LIKE 'attendance_evaluation_%_v1'
    ORDER BY signature
  `, [RUNTIME_ROLE]);
  const triggersResult = await client.query(`
    SELECT trigger.tgname AS name, relation.relname AS "tableName",
      function_row.proname AS "functionName", trigger.tgenabled AS enabled,
      (trigger.tgtype::integer & 1) <> 0 AS "rowLevel",
      (trigger.tgtype::integer & 2) <> 0 AS "beforeTiming",
      (trigger.tgtype::integer & 4) <> 0 AS "insertEvent",
      (trigger.tgtype::integer & 8) <> 0 AS "deleteEvent",
      (trigger.tgtype::integer & 16) <> 0 AS "updateEvent",
      trigger.tgqual IS NULL AS unconditional
    FROM pg_trigger trigger
    JOIN pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_proc function_row ON function_row.oid = trigger.tgfoid
    WHERE namespace.nspname = 'public' AND NOT trigger.tgisinternal
      AND relation.relname = ANY($1::text[]) ORDER BY trigger.tgname
  `, [ATTENDANCE_EVALUATION_TABLES]);
  const aclResult = await client.query(`
    SELECT relation.relname AS "tableName", acl.grantee
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl,
      acldefault('r', relation.relowner))) acl
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
      AND acl.grantee <> relation.relowner
  `, [ATTENDANCE_EVALUATION_TABLES]);
  const rolesResult = await client.query(`
    SELECT role.role_key AS "roleKey",
      COALESCE(array_agg(mapping.capability_key ORDER BY mapping.capability_key)
        FILTER (WHERE mapping.capability_key LIKE 'attendance.evaluation.%'),
        ARRAY[]::varchar[]) AS capabilities
    FROM iam_role role LEFT JOIN iam_role_capability mapping
      ON mapping.role_key = role.role_key
    WHERE role.role_key = ANY($1::varchar[])
    GROUP BY role.role_key ORDER BY role.role_key
  `, [Object.keys(ATTENDANCE_EVALUATION_ROLE_MATRIX)]);
  const conflictsResult = await client.query(`
    SELECT left_grant.role_key AS "roleKey"
    FROM iam_capability_conflict conflict
    JOIN iam_role_capability left_grant ON left_grant.capability_key = conflict.capability_key
    JOIN iam_role_capability right_grant ON right_grant.role_key = left_grant.role_key
      AND right_grant.capability_key = conflict.conflicts_with_key
    WHERE left_grant.role_key = ANY($1::varchar[])
  `, [Object.keys(ATTENDANCE_EVALUATION_ROLE_MATRIX)]);
  const requiredConflictsResult = await client.query(`
    SELECT conflict.capability_key || '|' || conflict.conflicts_with_key AS key
    FROM iam_capability_conflict conflict
    WHERE conflict.capability_key || '|' || conflict.conflicts_with_key
      = ANY($1::text[])
    ORDER BY key
  `, [ATTENDANCE_EVALUATION_REQUIRED_CONFLICTS]);
  return {
    currentUser, tables: rows(tablesResult), columns: rows(columnsResult),
    constraints: rows(constraintsResult), indexes: rows(indexesResult),
    payroll: rows(payrollResult),
    functions: rows(functionsResult).map(({ sourceBody, ...fn }) => ({
      ...fn, sourceHash: attendanceEvaluationFunctionFingerprint(sourceBody),
    })),
    triggers: rows(triggersResult), nonOwnerAcl: rows(aclResult),
    roles: rows(rolesResult), requiredConflicts: rows(requiredConflictsResult),
    conflicts: rows(conflictsResult),
  };
}

export async function verifyAttendanceEvaluationFinalState(client) {
  validateAttendanceEvaluationEvidence(await collectEvidence(client));
  return true;
}

async function verifyPrerequisiteLedger(client) {
  for (const [version, url] of PREREQUISITES) {
    const checksum = attendanceEvaluationFingerprint(await readFile(url, 'utf8'));
    const installed = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1', [version],
    );
    if (installed.rowCount !== 1
        || String(installed.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`prerequisito ausente o con drift ${version}`);
    }
  }
}

async function verifyNoUnledgeredObjects(client) {
  const result = await client.query(`
    SELECT EXISTS (SELECT 1 FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[]))
    OR EXISTS (SELECT 1 FROM pg_proc function_row
      JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
      WHERE namespace.nspname = 'public'
        AND function_row.proname LIKE 'attendance_evaluation_%_v1') AS present
  `, [ATTENDANCE_EVALUATION_TABLES]);
  if (rows(result)[0]?.present === true) {
    throw new Error('objetos 024 presentes sin ledger');
  }
}

function pinnedTargetValue(argv, prefix, envValue, label, pattern) {
  const matches = argv.filter((argument) => argument.startsWith(prefix));
  if (matches.length > 1) throw new Error(`${label} repetido`);
  const fromArgument = matches[0]?.slice(prefix.length).trim();
  const fromEnvironment = String(envValue || '').trim();
  if (fromArgument && fromEnvironment && fromArgument !== fromEnvironment) {
    throw new Error(`${label} no coincide entre CLI y entorno`);
  }
  const value = fromArgument || fromEnvironment;
  if (!value) throw new Error(`Falta ${label}`);
  if (!pattern.test(value)) throw new Error(`${label} tiene formato invalido`);
  return value;
}

export function resolveAttendanceEvaluationTarget(argv = process.argv, env = process.env) {
  if (!argv.includes('--confirm-isolated-branch')) {
    throw new Error('Falta --confirm-isolated-branch');
  }
  const target = resolveCanonicalDatabaseTarget(argv, env);
  if (target.mode !== 'isolated') {
    throw new Error('el esquema 024 solo admite una rama aislada');
  }
  const databaseUrl = directCanonicalDatabaseUrl(argv, env);
  if (databaseUrl !== target.databaseUrl) {
    throw new Error('el target 024 cambio durante el preflight');
  }
  const parsed = new URL(databaseUrl);
  const branchId = pinnedTargetValue(argv, '--expected-neon-branch-id=',
    env.ATTENDANCE_EVALUATION_EXPECTED_NEON_BRANCH_ID,
    'ATTENDANCE_EVALUATION_EXPECTED_NEON_BRANCH_ID', /^br-[a-z0-9-]+$/);
  const projectId = pinnedTargetValue(argv, '--expected-neon-project-id=',
    env.ATTENDANCE_EVALUATION_EXPECTED_NEON_PROJECT_ID,
    'ATTENDANCE_EVALUATION_EXPECTED_NEON_PROJECT_ID', /^[a-z][a-z0-9-]{2,95}$/);
  const expectedHost = pinnedTargetValue(argv, '--expected-neon-host=',
    env.ATTENDANCE_EVALUATION_EXPECTED_NEON_HOST,
    'ATTENDANCE_EVALUATION_EXPECTED_NEON_HOST',
    /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/);
  const expectedDatabase = pinnedTargetValue(argv, '--expected-database=',
    env.ATTENDANCE_EVALUATION_EXPECTED_DATABASE,
    'ATTENDANCE_EVALUATION_EXPECTED_DATABASE', /^[A-Za-z_][A-Za-z0-9_$-]*$/);
  let actualDatabase;
  try {
    actualDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('DATABASE_URL_UNPOOLED contiene una base invalida');
  }
  if (parsed.hostname !== expectedHost || actualDatabase !== expectedDatabase) {
    throw new Error('DATABASE_URL_UNPOOLED no coincide con el target 024 fijado');
  }
  return Object.freeze({
    ...target, branchId, projectId, expectedHost, expectedDatabase,
    endpointId: expectedHost.split('.')[0],
  });
}

export async function verifyAttendanceEvaluationConnectedTarget(client, target) {
  const result = await client.query(`
    SELECT current_setting('neon.branch_id', true) AS "branchId",
      current_setting('neon.project_id', true) AS "projectId",
      current_setting('neon.endpoint_id', true) AS "endpointId",
      current_database() AS database
  `);
  const actual = rows(result)[0] || {};
  if (actual.branchId !== target.branchId || actual.projectId !== target.projectId
      || actual.endpointId !== target.endpointId
      || actual.database !== target.expectedDatabase) {
    throw new Error('la conexion efectiva no coincide con la rama Neon aislada fijada');
  }
  return true;
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateAttendanceEvaluationMigrationSql(migration);
  const fingerprint = attendanceEvaluationFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolveAttendanceEvaluationTarget(process.argv.slice(2), process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyAttendanceEvaluationConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:attendance-evaluation-024'))",
    );
    await verifyPrerequisiteLedger(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [ATTENDANCE_EVALUATION_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${ATTENDANCE_EVALUATION_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredObjects(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${ATTENDANCE_EVALUATION_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: `
              + `${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [ATTENDANCE_EVALUATION_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyAttendanceEvaluationFinalState(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${ATTENDANCE_EVALUATION_MIGRATION_VERSION}: reapply verificado `
        + `(isolated, SHA-256 ${fingerprint})`
      : `${ATTENDANCE_EVALUATION_MIGRATION_VERSION}: fresh apply `
        + `(isolated, ${statements.length} sentencias, SHA-256 ${fingerprint})`);
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
