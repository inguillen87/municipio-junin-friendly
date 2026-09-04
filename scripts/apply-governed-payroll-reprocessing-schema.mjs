import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const PAYROLL_REPROCESSING_MIGRATION_VERSION =
  '035-governed-payroll-reprocessing';
export const PAYROLL_REPROCESSING_TABLES = Object.freeze([
  'payroll_reprocessing_case',
  'payroll_reprocessing_event',
]);
export const PAYROLL_REPROCESSING_INDEXES = Object.freeze([
  'payroll_reprocessing_case_active_target_uk',
  'payroll_reprocessing_case_tenant_status_idx',
  'payroll_reprocessing_event_timeline_idx',
]);
export const PAYROLL_REPROCESSING_SIGNATURES = Object.freeze({
  rejectEventChange: 'public.payroll_reprocessing_reject_event_change_v1()',
  hashEvent: 'public.payroll_reprocessing_hash_event_v1()',
  guardCase: 'public.payroll_reprocessing_guard_case_v1()',
  assertContext: 'public.payroll_reprocessing_assert_context_v1(jsonb,text)',
  snapshot: 'public.payroll_reprocessing_snapshot_v1(uuid,uuid,boolean)',
  eventResult: 'public.payroll_reprocessing_event_result_v1(bigint,uuid)',
  bootstrap: 'public.payroll_reprocessing_bootstrap_v1(jsonb)',
  list: 'public.payroll_reprocessing_list_v1(jsonb,text,integer,integer)',
  detail: 'public.payroll_reprocessing_detail_v1(jsonb,uuid)',
  prepare:
    'public.payroll_reprocessing_prepare_v1(jsonb,uuid,text,text,text,uuid,text)',
  transition:
    'public.payroll_reprocessing_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text)',
});
export const PAYROLL_REPROCESSING_RUNTIME_SIGNATURES = Object.freeze([
  PAYROLL_REPROCESSING_SIGNATURES.bootstrap,
  PAYROLL_REPROCESSING_SIGNATURES.list,
  PAYROLL_REPROCESSING_SIGNATURES.detail,
  PAYROLL_REPROCESSING_SIGNATURES.prepare,
  PAYROLL_REPROCESSING_SIGNATURES.transition,
]);
export const PAYROLL_REPROCESSING_TRIGGERS = Object.freeze({
  payroll_reprocessing_case_guard_v1: Object.freeze({
    table: 'payroll_reprocessing_case',
    functionSignature: PAYROLL_REPROCESSING_SIGNATURES.guardCase,
    tokens: ['BEFORE', 'UPDATE', 'DELETE', 'FOR EACH ROW'],
  }),
  payroll_reprocessing_event_append_only_v1: Object.freeze({
    table: 'payroll_reprocessing_event',
    functionSignature: PAYROLL_REPROCESSING_SIGNATURES.rejectEventChange,
    tokens: ['BEFORE', 'UPDATE', 'DELETE', 'FOR EACH ROW'],
  }),
  payroll_reprocessing_event_hash_v1: Object.freeze({
    table: 'payroll_reprocessing_event',
    functionSignature: PAYROLL_REPROCESSING_SIGNATURES.hashEvent,
    tokens: ['BEFORE', 'INSERT', 'FOR EACH ROW'],
  }),
});
export const PAYROLL_REPROCESSING_ROLE_MATRIX = Object.freeze({
  CONSULTA_INTEGRAL: Object.freeze([
    'payroll.reprocessing.read',
  ]),
  HUGO_APROBADOR_INTEGRAL: Object.freeze([
    'payroll.reprocessing.approve',
    'payroll.reprocessing.audit.read',
    'payroll.reprocessing.read',
  ]),
  PLATFORM_OWNER_OPERATIVO_INTEGRAL: Object.freeze([
    'payroll.reprocessing.audit.read',
    'payroll.reprocessing.prepare',
    'payroll.reprocessing.read',
  ]),
});

const MIGRATION_URL = new URL(
  './migrations/035-governed-payroll-reprocessing.sql', import.meta.url,
);
const PREREQUISITES = Object.freeze([
  ['002-canonical-integration', new URL(
    './migrations/002-canonical-integration.sql', import.meta.url,
  )],
  ['007-action-center-read-facades', new URL(
    './migrations/007-action-center-read-facades.sql', import.meta.url,
  )],
  ['019-institutional-access-profiles', new URL(
    './migrations/019-institutional-access-profiles.sql', import.meta.url,
  )],
  ['021-platform-owner-operational-integral', new URL(
    './migrations/021-platform-owner-operational-integral.sql', import.meta.url,
  )],
  ['034-payroll-control-import-binding-lock', new URL(
    './migrations/034-payroll-control-import-binding-lock.sql', import.meta.url,
  )],
]);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

const EXPECTED_CAPABILITIES = Object.freeze({
  'payroll.reprocessing.approve': ['tenant', 'restricted'],
  'payroll.reprocessing.audit.read': ['tenant', 'restricted'],
  'payroll.reprocessing.prepare': ['tenant', 'privileged'],
  'payroll.reprocessing.read': ['tenant', 'standard'],
});

export const PAYROLL_REPROCESSING_COLUMNS = Object.freeze({
  payroll_reprocessing_case: Object.freeze([
    ['business_reason_code', 'character varying', true, 64],
    ['business_reason_reference', 'character varying', true, 128],
    ['certified_binding_id', 'uuid', true, null],
    ['contract_version', 'character varying', true, 64],
    ['created_at', 'timestamp with time zone', true, null],
    ['decided_at', 'timestamp with time zone', false, null],
    ['decided_by_membership_id', 'uuid', false, null],
    ['decided_by_person_id', 'uuid', false, null],
    ['decision_reason_code', 'character varying', false, 64],
    ['decision_reason_reference', 'character varying', false, 128],
    ['execution_authorized', 'boolean', true, null],
    ['grh_mutation', 'boolean', true, null],
    ['id', 'uuid', true, null],
    ['payroll_calculated', 'boolean', true, null],
    ['payroll_posted', 'boolean', true, null],
    ['payroll_run_id', 'uuid', true, null],
    ['payroll_voided', 'boolean', true, null],
    ['prepared_by_membership_id', 'uuid', true, null],
    ['prepared_by_person_id', 'uuid', false, null],
    ['release_sha', 'character', true, 40],
    ['request_kind', 'character varying', true, 16],
    ['status', 'character varying', true, 16],
    ['submitted_at', 'timestamp with time zone', false, null],
    ['target_run_sha256', 'character', true, 64],
    ['tenant_id', 'uuid', true, null],
    ['updated_at', 'timestamp with time zone', true, null],
    ['version', 'integer', true, null],
  ]),
  payroll_reprocessing_event: Object.freeze([
    ['actor_membership_id', 'uuid', true, null],
    ['actor_person_id', 'uuid', false, null],
    ['actor_role_key', 'character varying', true, 64],
    ['actor_session_id', 'uuid', true, null],
    ['actor_session_version', 'integer', true, null],
    ['authority_capability_key', 'character varying', true, 96],
    ['case_id', 'uuid', true, null],
    ['certified_binding_id', 'uuid', true, null],
    ['command', 'character varying', true, 16],
    ['command_hash', 'character', true, 64],
    ['event_sha256', 'character', true, 64],
    ['execution_authorized', 'boolean', true, null],
    ['expected_version', 'integer', true, null],
    ['from_status', 'character varying', false, 16],
    ['grh_mutation', 'boolean', true, null],
    ['id', 'bigint', true, null],
    ['idempotency_key', 'uuid', true, null],
    ['occurred_at', 'timestamp with time zone', true, null],
    ['payroll_calculated', 'boolean', true, null],
    ['payroll_posted', 'boolean', true, null],
    ['payroll_run_id', 'uuid', true, null],
    ['payroll_voided', 'boolean', true, null],
    ['reason_code', 'character varying', true, 64],
    ['reason_reference', 'character varying', true, 128],
    ['release_sha', 'character', true, 40],
    ['resulting_version', 'integer', true, null],
    ['tenant_id', 'uuid', true, null],
    ['to_status', 'character varying', true, 16],
  ]),
});

export const PAYROLL_REPROCESSING_CONSTRAINTS = Object.freeze({
  payroll_reprocessing_case: Object.freeze({
    payroll_reprocessing_case_binding_fk: ['f', [
      'FOREIGN KEY (tenant_id, certified_binding_id)',
      'REFERENCES platform_tenant_source_binding(tenant_id, id)', 'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_case_business_reason_ck: ['c', [
      'business_reason_code', 'duplicate_run', 'incorrect_personnel', 'incorrect_concept',
      'incorrect_amount', 'source_correction', 'legal_adjustment', 'other_controlled',
    ]],
    payroll_reprocessing_case_contract_ck: ['c', [
      'contract_version', 'payroll-reprocessing-case.v1',
    ]],
    payroll_reprocessing_case_decider_membership_fk: ['f', [
      'FOREIGN KEY (decided_by_membership_id, tenant_id)',
      'REFERENCES tenant_membership(id, tenant_id)', 'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_case_decider_pair_ck: ['c', [
      'decided_by_membership_id IS NULL', 'decided_by_person_id IS NULL',
      'decided_by_membership_id IS NOT NULL', 'decided_by_person_id IS NOT NULL',
    ]],
    payroll_reprocessing_case_decider_person_fk: ['f', [
      'FOREIGN KEY (decided_by_person_id)', 'REFERENCES person_identity(id)',
      'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_case_decision_reason_ck: ['c', [
      'decision_reason_code', 'ready_for_review', 'approved_for_external_execution',
      'insufficient_evidence', 'run_not_eligible', 'request_not_authorized',
      'cancelled_by_preparer',
    ]],
    payroll_reprocessing_case_id_tenant_uk: ['u', ['UNIQUE (id, tenant_id)']],
    payroll_reprocessing_case_kind_ck: ['c', [
      'request_kind', 'void', 'reliquidate',
    ]],
    payroll_reprocessing_case_maker_checker_ck: ['c', [
      'decided_by_membership_id <> prepared_by_membership_id',
      'decided_by_person_id <> prepared_by_person_id',
    ]],
    payroll_reprocessing_case_no_side_effect_ck: ['c', [
      'grh_mutation IS FALSE', 'payroll_voided IS FALSE',
      'payroll_calculated IS FALSE', 'payroll_posted IS FALSE',
    ]],
    payroll_reprocessing_case_pkey: ['p', ['PRIMARY KEY (id)']],
    payroll_reprocessing_case_preparer_membership_fk: ['f', [
      'FOREIGN KEY (prepared_by_membership_id, tenant_id)',
      'REFERENCES tenant_membership(id, tenant_id)', 'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_case_preparer_person_fk: ['f', [
      'FOREIGN KEY (prepared_by_person_id)', 'REFERENCES person_identity(id)',
      'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_case_reference_ck: ['c', [
      'business_reason_reference', 'decision_reason_reference',
      '[0-9a-f]{8}', '-4[0-9a-f]{3}',
    ]],
    payroll_reprocessing_case_release_ck: ['c', ['release_sha', '[a-f0-9]{40}']],
    payroll_reprocessing_case_run_fk: ['f', [
      'FOREIGN KEY (payroll_run_id)', 'REFERENCES payroll_run(id)', 'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_case_state_ck: ['c', [
      "status = 'draft'", "status = 'submitted'", "status = 'approved'",
      "status = 'rejected'", "status = 'cancelled'", 'execution_authorized IS TRUE',
    ]],
    payroll_reprocessing_case_status_ck: ['c', [
      'status', 'draft', 'submitted', 'approved', 'rejected', 'cancelled',
    ]],
    payroll_reprocessing_case_target_hash_ck: ['c', [
      'target_run_sha256', '[a-f0-9]{64}',
    ]],
    payroll_reprocessing_case_tenant_fk: ['f', [
      'FOREIGN KEY (tenant_id)', 'REFERENCES platform_tenant(id)', 'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_case_version_ck: ['c', ['version > 0']],
  }),
  payroll_reprocessing_event: Object.freeze({
    payroll_reprocessing_event_actor_idempotency_uk: ['u', [
      'UNIQUE (tenant_id, actor_membership_id, idempotency_key)',
    ]],
    payroll_reprocessing_event_authority_ck: ['c', [
      'payroll.reprocessing.prepare', 'payroll.reprocessing.approve',
      'prepare', 'submit', 'cancel', 'approve', 'reject',
    ]],
    payroll_reprocessing_event_authorization_ck: ['c', [
      "execution_authorized = (to_status = 'approved'", 
    ]],
    payroll_reprocessing_event_binding_fk: ['f', [
      'FOREIGN KEY (tenant_id, certified_binding_id)',
      'REFERENCES platform_tenant_source_binding(tenant_id, id)', 'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_event_capability_fk: ['f', [
      'FOREIGN KEY (authority_capability_key)', 'REFERENCES iam_capability(capability_key)',
      'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_event_case_fk: ['f', [
      'FOREIGN KEY (case_id, tenant_id)',
      'REFERENCES payroll_reprocessing_case(id, tenant_id)', 'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_event_case_version_uk: ['u', [
      'UNIQUE (case_id, resulting_version)',
    ]],
    payroll_reprocessing_event_command_ck: ['c', [
      'command', 'prepare', 'submit', 'approve', 'reject', 'cancel',
    ]],
    payroll_reprocessing_event_decider_person_ck: ['c', [
      "command <> ALL (ARRAY['approve'", "'reject'", 'actor_person_id IS NOT NULL',
    ]],
    payroll_reprocessing_event_hash_ck: ['c', [
      'command_hash', '[a-f0-9]{64}', 'event_sha256',
    ]],
    payroll_reprocessing_event_idempotency_v4_ck: ['c', [
      'idempotency_key', '[0-9a-f]{8}', '-4[0-9a-f]{3}',
    ]],
    payroll_reprocessing_event_membership_fk: ['f', [
      'FOREIGN KEY (actor_membership_id, tenant_id)',
      'REFERENCES tenant_membership(id, tenant_id)', 'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_event_no_side_effect_ck: ['c', [
      'grh_mutation IS FALSE', 'payroll_voided IS FALSE',
      'payroll_calculated IS FALSE', 'payroll_posted IS FALSE',
    ]],
    payroll_reprocessing_event_person_fk: ['f', [
      'FOREIGN KEY (actor_person_id)', 'REFERENCES person_identity(id)',
      'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_event_pkey: ['p', ['PRIMARY KEY (id)']],
    payroll_reprocessing_event_reference_ck: ['c', [
      'reason_reference', '[0-9a-f]{8}', '-4[0-9a-f]{3}',
    ]],
    payroll_reprocessing_event_release_ck: ['c', ['release_sha', '[a-f0-9]{40}']],
    payroll_reprocessing_event_role_fk: ['f', [
      'FOREIGN KEY (actor_role_key)', 'REFERENCES iam_role(role_key)',
      'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_event_run_fk: ['f', [
      'FOREIGN KEY (payroll_run_id)', 'REFERENCES payroll_run(id)', 'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_event_session_fk: ['f', [
      'FOREIGN KEY (actor_session_id)', 'REFERENCES tenant_identity_session(id)',
      'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_event_session_version_ck: ['c', [
      'actor_session_version > 0',
    ]],
    payroll_reprocessing_event_status_ck: ['c', [
      'from_status', 'to_status', 'draft', 'submitted', 'approved', 'rejected',
      'cancelled',
    ]],
    payroll_reprocessing_event_tenant_fk: ['f', [
      'FOREIGN KEY (tenant_id)', 'REFERENCES platform_tenant(id)', 'ON DELETE RESTRICT',
    ]],
    payroll_reprocessing_event_version_ck: ['c', [
      'expected_version >= 0', 'resulting_version = (expected_version + 1)',
    ]],
  }),
});

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function exactSet(actual, expected, label) {
  const got = [...new Set(actual || [])].map(String).sort();
  const wanted = [...new Set(expected || [])].map(String).sort();
  if (got.length !== (actual || []).length
      || JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizedDeparser(value) {
  return normalized(value)
    .replace(/::character varying(?:\(\d+\))?/g, '')
    .replace(/::varchar(?:\(\d+\))?/g, '')
    .replace(/::text\[\]/g, '')
    .replace(/::text/g, '')
    .replace(/\(([a-z_][a-z0-9_]*)\)/g, '$1')
    .replace(/\(\((?=array\[)/g, '(');
}

function requireTokens(label, value, tokens) {
  const source = normalizedDeparser(value);
  for (const token of tokens) {
    if (!source.includes(normalizedDeparser(token))) {
      throw new Error(`${label} no contiene ${token}`);
    }
  }
}

function expectedRoleMappings() {
  return Object.entries(PAYROLL_REPROCESSING_ROLE_MATRIX).flatMap(
    ([role, capabilities]) => capabilities.map((capability) => `${role}|${capability}`),
  );
}

export function payrollReprocessingFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validatePayrollReprocessingMigrationSql(sql) {
  const source = String(sql || '');
  for (const token of [
    ...PAYROLL_REPROCESSING_TABLES.map((table) =>
      `CREATE TABLE IF NOT EXISTS public.${table}`),
    ...Object.keys(PAYROLL_REPROCESSING_TRIGGERS).map((trigger) =>
      `CREATE TRIGGER ${trigger}`),
    ...Object.values(PAYROLL_REPROCESSING_SIGNATURES).map((signature) =>
      `FUNCTION ${signature.slice(0, signature.indexOf('('))}(`),
    "request_kind IN ('void','reliquidate')",
    "status IN ('draft','submitted','approved','rejected','cancelled')",
    'payroll_reprocessing_case_maker_checker_ck',
    'payroll_reprocessing_case_no_side_effect_ck',
    'payroll_reprocessing_event_no_side_effect_ck',
    'PAYROLL_REPROCESSING_IDEMPOTENCY_REUSE',
    'PAYROLL_REPROCESSING_VERSION_CONFLICT',
    'PAYROLL_REPROCESSING_MAKER_CHECKER_REQUIRED',
    'PAYROLL_REPROCESSING_PROFILE_DRIFT',
    'PAYROLL_REPROCESSING_PROFILE_SOD_CONFLICT',
    "run.closure_status = 'closed'",
    "batch.validation_state = 'published'",
    'approvalEffect',
    'external_execution_authorization_only',
    'REVOKE ALL PRIVILEGES ON TABLE',
  ]) {
    if (!source.includes(token)) throw new Error(`migracion 035 no contiene ${token}`);
  }

  const grants = [...source.matchAll(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)\(/gi,
  )].map((match) => match[1]);
  exactSet(grants, PAYROLL_REPROCESSING_RUNTIME_SIGNATURES.map((signature) => (
    signature.slice('public.'.length).split('(')[0]
  )), 'fachadas runtime 035');

  for (const table of PAYROLL_REPROCESSING_TABLES) {
    const start = source.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
    const end = source.indexOf('\n);', start);
    if (start < 0 || end < 0) throw new Error(`tabla 035 incompleta: ${table}`);
    const definition = source.slice(start, end + 3);
    if (/\b(?:email|dni|cuil|documento|apellido|file_?name|filename|raw_?bytes)\b/i
      .test(definition)) {
      throw new Error(`tabla 035 conserva PII o bytes crudos: ${table}`);
    }
  }
  if (/\bGRANT\s+(?:ALL(?:\s+PRIVILEGES)?|SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\s+ON\s+(?:TABLE\s+)?(?:public\.)?payroll_reprocessing_/i
    .test(source)) {
    throw new Error('migracion 035 otorga acceso directo a tablas privadas');
  }
  if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?(?:employment_contract|payroll_run|payroll_monthly_fact|payroll_snapshot_assignment|source_import_batch)\b/i
    .test(source)) {
    throw new Error('migracion 035 intenta mutar una fuente o salida salarial');
  }
  if ((source.match(/SECURITY DEFINER SET search_path = public, pg_temp/g) || []).length
      !== Object.keys(PAYROLL_REPROCESSING_SIGNATURES).length) {
    throw new Error('migracion 035 no fija search_path en todas sus funciones');
  }
  if (splitPostgresStatements(source).length !== 61) {
    throw new Error('migracion 035 incompleta o no segmentable');
  }
  return true;
}

export function validatePayrollReprocessingEvidence(evidence) {
  const tables = Object.fromEntries((evidence?.tables || []).map((item) => [item.name, item]));
  exactSet(Object.keys(tables), PAYROLL_REPROCESSING_TABLES, 'tablas privadas 035');
  for (const name of PAYROLL_REPROCESSING_TABLES) {
    const table = tables[name] || {};
    if (table.ownedByCurrentUser !== true || table.ownerIsRuntime !== false
        || table.publicPrivileges !== false || table.runtimeAnyPrivileges !== false
        || JSON.stringify(table.nonOwnerPrivilegeGrantees || []) !== JSON.stringify([])) {
      throw new Error(`tabla privada 035 tiene owner o ACL inseguros: ${name}`);
    }
    const actualColumns = (evidence?.columns || []).filter((item) => (
      item.tableName === name
    )).map((item) => [
      item.name,
      item.dataType,
      item.notNull,
      item.characterMaximumLength == null ? null : Number(item.characterMaximumLength),
    ]).sort((left, right) => left[0].localeCompare(right[0]));
    if (JSON.stringify(actualColumns) !== JSON.stringify(PAYROLL_REPROCESSING_COLUMNS[name])) {
      throw new Error(`columnas 035 fuera de contrato: ${name}`);
    }
  }

  for (const table of PAYROLL_REPROCESSING_TABLES) {
    const expected = PAYROLL_REPROCESSING_CONSTRAINTS[table];
    const constraintRows = (evidence?.constraints || []).filter((item) => (
      item.tableName === table
    ));
    exactSet(constraintRows.map((item) => item.name), Object.keys(expected),
      `constraints 035 ${table}`);
    const actual = Object.fromEntries(constraintRows.map((item) => [item.name, item]));
    for (const [name, [type, tokens]] of Object.entries(expected)) {
      if (actual[name]?.type !== type || actual[name]?.validated !== true) {
        throw new Error(`constraint 035 invalido: ${name}`);
      }
      requireTokens(`constraint ${name}`, actual[name]?.definition, tokens);
    }
  }

  const indexes = Object.fromEntries((evidence?.indexes || []).map((item) => [item.name, item]));
  exactSet(Object.keys(indexes), PAYROLL_REPROCESSING_INDEXES, 'indices 035');
  const indexContracts = {
    payroll_reprocessing_case_active_target_uk: {
      unique: true,
      predicate: true,
      tokens: [
        'payroll_reprocessing_case', 'tenant_id', 'certified_binding_id',
        'payroll_run_id', 'request_kind', "status = ANY", 'draft', 'submitted', 'approved',
      ],
    },
    payroll_reprocessing_case_tenant_status_idx: {
      unique: false,
      predicate: false,
      tokens: ['payroll_reprocessing_case', 'tenant_id', 'status', 'created_at DESC', 'id'],
    },
    payroll_reprocessing_event_timeline_idx: {
      unique: false,
      predicate: false,
      tokens: ['payroll_reprocessing_event', 'tenant_id', 'case_id', 'occurred_at', 'id'],
    },
  };
  for (const [name, contract] of Object.entries(indexContracts)) {
    const index = indexes[name] || {};
    if (index.valid !== true || index.ready !== true || index.unique !== contract.unique
        || index.hasPredicate !== contract.predicate) {
      throw new Error(`indice 035 invalido: ${name}`);
    }
    requireTokens(`indice ${name}`, index.definition, contract.tokens);
  }

  const functions = Object.fromEntries(
    (evidence?.functions || []).map((item) => [item.signature, item]),
  );
  exactSet(Object.keys(functions), Object.values(PAYROLL_REPROCESSING_SIGNATURES),
    'funciones 035');
  const stableSignatures = new Set([
    PAYROLL_REPROCESSING_SIGNATURES.snapshot,
    PAYROLL_REPROCESSING_SIGNATURES.eventResult,
  ]);
  const runtimeSignatures = new Set(PAYROLL_REPROCESSING_RUNTIME_SIGNATURES);
  for (const signature of Object.values(PAYROLL_REPROCESSING_SIGNATURES)) {
    const fn = functions[signature] || {};
    if (fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
        || fn.ownerIsRuntime !== false || fn.publicExecuteRevoked !== true
        || fn.runtimeExecuteGrantable !== false
        || JSON.stringify(fn.config || []) !== JSON.stringify(['search_path=public, pg_temp'])
        || fn.volatility !== (stableSignatures.has(signature) ? 's' : 'v')) {
      throw new Error(`funcion 035 insegura: ${signature}`);
    }
    const shouldExecute = runtimeSignatures.has(signature);
    const grantees = shouldExecute ? [RUNTIME_ROLE] : [];
    if (fn.runtimeCanExecute !== shouldExecute
        || JSON.stringify(fn.nonOwnerExecuteGrantees || []) !== JSON.stringify(grantees)) {
      throw new Error(`allowlist execute-only 035 fuera de contrato: ${signature}`);
    }
  }

  requireTokens('contexto 035', functions[PAYROLL_REPROCESSING_SIGNATURES.assertContext].sourceBody, [
    'action_center_assert_tenant_read_session_v2', 'action_center_context_has_capability',
    'sourceBindingId', 'actorPersonId', 'PAYROLL_REPROCESSING_SESSION_BUSY',
  ]);
  requireTokens('snapshot 035', functions[PAYROLL_REPROCESSING_SIGNATURES.snapshot].sourceBody, [
    'payroll_reprocessing_case', 'payroll_run', 'p_include_audit',
    'payroll_reprocessing_event', 'external_execution_authorization_only',
    "'grhMutation', false", "'payrollVoided', false", "'payrollCalculated', false",
    "'payrollPosted', false",
  ]);
  requireTokens('resultado de evento 035',
    functions[PAYROLL_REPROCESSING_SIGNATURES.eventResult].sourceBody, [
      'payroll_reprocessing_event', 'payroll_reprocessing_snapshot_v1',
      'external_execution_authorization_only', "'grhMutation', false",
      "'payrollVoided', false", "'payrollCalculated', false", "'payrollPosted', false",
    ]);
  requireTokens('bootstrap 035', functions[PAYROLL_REPROCESSING_SIGNATURES.bootstrap].sourceBody, [
    'payroll.reprocessing.read', 'certifiedBindingId', 'payroll.reprocessing.prepare',
    'payroll.reprocessing.approve', 'employmentLinked',
  ]);
  requireTokens('listado 035', functions[PAYROLL_REPROCESSING_SIGNATURES.list].sourceBody, [
    'p_page', '10000', 'p_limit', '50', 'tenantId', 'certifiedBindingId',
  ]);
  requireTokens('detalle 035', functions[PAYROLL_REPROCESSING_SIGNATURES.detail].sourceBody, [
    'allowedCommands', 'submit', 'cancel', 'approve', 'reject',
    'payroll.reprocessing.audit.read', 'prepared_by_membership_id', 'prepared_by_person_id',
  ]);
  requireTokens('preparacion 035', functions[PAYROLL_REPROCESSING_SIGNATURES.prepare].sourceBody, [
    'payroll.reprocessing.prepare', 'pg_advisory_xact_lock',
    'PAYROLL_REPROCESSING_IDEMPOTENCY_REUSE', "run.source_system = 'GRH'",
    "run.closure_status = 'closed'", "batch.validation_state = 'published'",
    'payroll_reprocessing_case', 'payroll_reprocessing_event',
  ]);
  requireTokens('transicion 035', functions[PAYROLL_REPROCESSING_SIGNATURES.transition].sourceBody, [
    'payroll.reprocessing.prepare', 'payroll.reprocessing.approve',
    'pg_advisory_xact_lock', 'FOR UPDATE', 'PAYROLL_REPROCESSING_VERSION_CONFLICT',
    'PAYROLL_REPROCESSING_MAKER_CHECKER_REQUIRED', 'execution_authorized',
  ]);
  requireTokens('guard caso 035', functions[PAYROLL_REPROCESSING_SIGNATURES.guardCase].sourceBody, [
    'PAYROLL_REPROCESSING_CASE_DELETE_FORBIDDEN',
    'PAYROLL_REPROCESSING_CASE_CHANGE_FORBIDDEN', 'NEW.version <> OLD.version + 1',
  ]);
  requireTokens('guard evento 035',
    functions[PAYROLL_REPROCESSING_SIGNATURES.rejectEventChange].sourceBody,
    ['PAYROLL_REPROCESSING_EVENT_APPEND_ONLY']);
  requireTokens('hash evento 035', functions[PAYROLL_REPROCESSING_SIGNATURES.hashEvent].sourceBody, [
    'event_sha256', 'digest', 'commandHash', 'executionAuthorized',
    "'grhMutation', false", "'payrollPosted', false",
  ]);

  const triggers = Object.fromEntries((evidence?.triggers || []).map((item) => [item.name, item]));
  exactSet(Object.keys(triggers), Object.keys(PAYROLL_REPROCESSING_TRIGGERS),
    'triggers 035');
  for (const [name, contract] of Object.entries(PAYROLL_REPROCESSING_TRIGGERS)) {
    const trigger = triggers[name] || {};
    if (trigger.tableName !== contract.table || trigger.enabled !== 'O'
        || trigger.functionSignature !== contract.functionSignature) {
      throw new Error(`trigger 035 invalido: ${name}`);
    }
    requireTokens(`trigger ${name}`, trigger.definition, [
      ...contract.tokens, `ON public.${contract.table}`, contract.functionSignature,
    ]);
  }

  const capabilities = Object.fromEntries(
    (evidence?.capabilities || []).map((item) => [item.key, item]),
  );
  exactSet(Object.keys(capabilities), Object.keys(EXPECTED_CAPABILITIES),
    'capacidades 035');
  for (const [key, [scopeKind, sensitivity]] of Object.entries(EXPECTED_CAPABILITIES)) {
    if (capabilities[key]?.scopeKind !== scopeKind
        || capabilities[key]?.sensitivity !== sensitivity) {
      throw new Error(`capacidad 035 fuera de contrato: ${key}`);
    }
  }
  exactSet((evidence?.roles || []).filter((item) => (
    item.scopeKind === 'tenant' && item.systemManaged === true
  )).map((item) => item.key), Object.keys(PAYROLL_REPROCESSING_ROLE_MATRIX),
  'roles institucionales 035');
  if ((evidence?.roles || []).length !== Object.keys(PAYROLL_REPROCESSING_ROLE_MATRIX).length) {
    throw new Error('roles institucionales 035 tienen metadata insegura');
  }
  exactSet((evidence?.roleMappings || []).map((item) => `${item.role}|${item.capability}`),
    expectedRoleMappings(), 'matriz de roles 035');
  exactSet((evidence?.conflicts || []).map((item) => (
    `${item.capability}|${item.conflictsWith}`
  )), ['payroll.reprocessing.approve|payroll.reprocessing.prepare'],
  'conflictos SoD 035');
  if (Number(evidence?.overrideCount) !== 0) {
    throw new Error('overrides 035 deben permanecer vacios');
  }
  return true;
}

export function resolvePayrollReprocessingTarget(argv = process.argv, env = process.env) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_REPROCESSING',
    targetLabel: '035',
  });
}

export async function verifyPayrollReprocessingConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '035');
}

async function collectEvidence(client) {
  const tableResult = await client.query(`
    SELECT relation.relname AS name,
      relation.relowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner_role.rolname = $1 AS "ownerIsRuntime",
      EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          relation.relacl, acldefault('r', relation.relowner)
        )) acl WHERE acl.grantee = 0
      ) AS "publicPrivileges",
      (has_table_privilege($1, relation.oid, 'SELECT')
        OR has_table_privilege($1, relation.oid, 'INSERT')
        OR has_table_privilege($1, relation.oid, 'UPDATE')
        OR has_table_privilege($1, relation.oid, 'DELETE')
        OR has_table_privilege($1, relation.oid, 'TRUNCATE')
        OR has_table_privilege($1, relation.oid, 'REFERENCES')
        OR has_table_privilege($1, relation.oid, 'TRIGGER')) AS "runtimeAnyPrivileges",
      to_jsonb(ARRAY(
        SELECT DISTINCT grantee.rolname
        FROM aclexplode(COALESCE(
          relation.relacl, acldefault('r', relation.relowner)
        )) acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE grantee.oid <> relation.relowner
        ORDER BY grantee.rolname
      )) AS "nonOwnerPrivilegeGrantees"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner_role ON owner_role.oid = relation.relowner
    WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
      AND relation.relname LIKE 'payroll_reprocessing_%'
    ORDER BY relation.relname
  `, [RUNTIME_ROLE]);
  const columnResult = await client.query(`
    SELECT table_name AS "tableName", column_name AS name,
      data_type AS "dataType", is_nullable = 'NO' AS "notNull",
      character_maximum_length AS "characterMaximumLength"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ORDER BY table_name, column_name
  `, [PAYROLL_REPROCESSING_TABLES]);
  const constraintResult = await client.query(`
    SELECT relation.relname AS "tableName", constraint_row.conname AS name,
      constraint_row.contype AS type, constraint_row.convalidated AS validated,
      pg_get_constraintdef(constraint_row.oid) AS definition
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname, constraint_row.conname
  `, [PAYROLL_REPROCESSING_TABLES]);
  const indexResult = await client.query(`
    SELECT index_relation.relname AS name,
      pg_get_indexdef(index_row.indexrelid) AS definition,
      index_row.indisvalid AS valid, index_row.indisready AS ready,
      index_row.indisunique AS unique, index_row.indpred IS NOT NULL AS "hasPredicate"
    FROM pg_index index_row
    JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
    JOIN pg_namespace namespace ON namespace.oid = index_relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND index_relation.relname = ANY($1::text[])
    ORDER BY index_relation.relname
  `, [PAYROLL_REPROCESSING_INDEXES]);
  const functionResult = await client.query(`
    SELECT format('%I.%I(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner_role.rolname = $1 AS "ownerIsRuntime",
      function_row.provolatile AS volatility,
      COALESCE(function_row.proconfig, ARRAY[]::text[]) AS config,
      function_row.prosrc AS "sourceBody",
      NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS "publicExecuteRevoked",
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS "runtimeCanExecute",
      COALESCE((
        SELECT bool_or(acl.is_grantable)
        FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE grantee.rolname = $1 AND acl.privilege_type = 'EXECUTE'
      ), false) AS "runtimeExecuteGrantable",
      to_jsonb(ARRAY(
        SELECT grantee.rolname
        FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE acl.privilege_type = 'EXECUTE'
          AND grantee.oid <> function_row.proowner
        ORDER BY grantee.rolname
      )) AS "nonOwnerExecuteGrantees"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid = function_row.proowner
    WHERE namespace.nspname = 'public'
      AND function_row.proname LIKE 'payroll_reprocessing_%'
    ORDER BY signature
  `, [RUNTIME_ROLE]);
  const triggerResult = await client.query(`
    SELECT trigger_row.tgname AS name, relation.relname AS "tableName",
      trigger_row.tgenabled AS enabled, pg_get_triggerdef(trigger_row.oid) AS definition,
      format('%I.%I(%s)', function_namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS "functionSignature"
    FROM pg_trigger trigger_row
    JOIN pg_class relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace function_namespace ON function_namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY($1::text[])
      AND trigger_row.tgisinternal IS FALSE
    ORDER BY trigger_row.tgname
  `, [PAYROLL_REPROCESSING_TABLES]);
  const capabilityResult = await client.query(`
    SELECT capability_key AS key, scope_kind AS "scopeKind", sensitivity
    FROM public.iam_capability
    WHERE capability_key LIKE 'payroll.reprocessing.%'
    ORDER BY capability_key
  `);
  const roleResult = await client.query(`
    SELECT role_key AS key, scope_kind AS "scopeKind", system_managed AS "systemManaged"
    FROM public.iam_role
    WHERE role_key = ANY($1::text[])
    ORDER BY role_key
  `, [Object.keys(PAYROLL_REPROCESSING_ROLE_MATRIX)]);
  const mappingResult = await client.query(`
    SELECT role_key AS role, capability_key AS capability
    FROM public.iam_role_capability
    WHERE capability_key LIKE 'payroll.reprocessing.%'
    ORDER BY role_key, capability_key
  `);
  const conflictResult = await client.query(`
    SELECT capability_key AS capability, conflicts_with_key AS "conflictsWith"
    FROM public.iam_capability_conflict
    WHERE capability_key LIKE 'payroll.reprocessing.%'
       OR conflicts_with_key LIKE 'payroll.reprocessing.%'
    ORDER BY capability_key, conflicts_with_key
  `);
  const overrideResult = await client.query(`
    SELECT count(*)::integer AS count
    FROM public.tenant_membership_capability_override
    WHERE capability_key LIKE 'payroll.reprocessing.%'
  `);
  return {
    tables: rows(tableResult),
    columns: rows(columnResult),
    constraints: rows(constraintResult),
    indexes: rows(indexResult),
    functions: rows(functionResult),
    triggers: rows(triggerResult),
    capabilities: rows(capabilityResult),
    roles: rows(roleResult),
    roleMappings: rows(mappingResult),
    conflicts: rows(conflictResult),
    overrideCount: rows(overrideResult)[0]?.count,
  };
}

export async function verifyPayrollReprocessingFinalState(client) {
  return validatePayrollReprocessingEvidence(await collectEvidence(client));
}

async function verifyPrerequisites(client) {
  for (const [version, url] of PREREQUISITES) {
    const checksum = payrollReprocessingFingerprint(await readFile(url, 'utf8'));
    const installed = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1', [version],
    );
    if (installed.rowCount !== 1
        || String(installed.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`prerequisito ausente o con drift ${version}`);
    }
  }
}

async function verifyNoUnledgeredState(client) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname LIKE 'payroll_reprocessing_%'
    ) OR EXISTS (
      SELECT 1 FROM pg_proc function_row
      JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
      WHERE namespace.nspname = 'public'
        AND function_row.proname LIKE 'payroll_reprocessing_%'
    ) OR EXISTS (
      SELECT 1 FROM public.iam_capability
      WHERE capability_key LIKE 'payroll.reprocessing.%'
    ) OR EXISTS (
      SELECT 1 FROM public.iam_role_capability
      WHERE capability_key LIKE 'payroll.reprocessing.%'
    ) OR EXISTS (
      SELECT 1 FROM public.iam_capability_conflict
      WHERE capability_key LIKE 'payroll.reprocessing.%'
         OR conflicts_with_key LIKE 'payroll.reprocessing.%'
    ) AS present
  `);
  if (rows(result)[0]?.present === true) {
    throw new Error('estado 035 presente sin ledger');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validatePayrollReprocessingMigrationSql(migration);
  const checksum = payrollReprocessingFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolvePayrollReprocessingTarget(process.argv.slice(2), process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyPayrollReprocessingConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:payroll-reprocessing-035'))",
    );
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PAYROLL_REPROCESSING_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${PAYROLL_REPROCESSING_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredState(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PAYROLL_REPROCESSING_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PAYROLL_REPROCESSING_MIGRATION_VERSION, checksum],
      );
    }
    await verifyPayrollReprocessingFinalState(client);
    await client.query('COMMIT');
    console.log(`${PAYROLL_REPROCESSING_MIGRATION_VERSION}: ${existing.rowCount
      ? 'ledger y estado final verificados' : 'fresh apply'} `
      + `(${target.mode}, SHA-256 ${checksum})`);
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
