import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION,
  payrollControlImportLockSemanticsFingerprint,
} from './apply-payroll-control-import-lock-semantics-schema.mjs';
import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const PAYROLL_MONTHLY_CLOSE_MIGRATION_VERSION =
  '038-governed-monthly-close-run';
export const PAYROLL_MONTHLY_CLOSE_TABLES = Object.freeze([
  'payroll_monthly_close_event',
  'payroll_monthly_close_run',
]);
export const PAYROLL_MONTHLY_CLOSE_INDEXES = Object.freeze([
  'payroll_monthly_close_event_timeline_idx',
  'payroll_monthly_close_run_active_period_uk',
  'payroll_monthly_close_run_tenant_status_idx',
]);
export const PAYROLL_MONTHLY_CLOSE_SIGNATURES = Object.freeze({
  flags: 'public.payroll_monthly_close_flags_v1(boolean)',
  rejectEventChange: 'public.payroll_monthly_close_reject_event_change_v1()',
  hashEvent: 'public.payroll_monthly_close_hash_event_v1()',
  guardRun: 'public.payroll_monthly_close_guard_run_v1()',
  assertContext: 'public.payroll_monthly_close_assert_context_v1(jsonb,text)',
  snapshot: 'public.payroll_monthly_close_snapshot_v1(uuid,uuid,boolean,boolean)',
  eventResult: 'public.payroll_monthly_close_event_result_v1(bigint,uuid)',
  attempt: 'public.payroll_monthly_close_attempt_v1(jsonb,uuid,text)',
  bootstrap: 'public.payroll_monthly_close_bootstrap_v1(jsonb)',
  list: 'public.payroll_monthly_close_list_v1(jsonb,text,integer,integer)',
  detail: 'public.payroll_monthly_close_detail_v1(jsonb,uuid)',
  prepare:
    'public.payroll_monthly_close_prepare_v1(jsonb,uuid,date,text,text,jsonb,jsonb,jsonb,uuid,text)',
  transition:
    'public.payroll_monthly_close_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text)',
});
export const PAYROLL_MONTHLY_CLOSE_RUNTIME_SIGNATURES = Object.freeze([
  PAYROLL_MONTHLY_CLOSE_SIGNATURES.bootstrap,
  PAYROLL_MONTHLY_CLOSE_SIGNATURES.list,
  PAYROLL_MONTHLY_CLOSE_SIGNATURES.detail,
  PAYROLL_MONTHLY_CLOSE_SIGNATURES.attempt,
  PAYROLL_MONTHLY_CLOSE_SIGNATURES.prepare,
  PAYROLL_MONTHLY_CLOSE_SIGNATURES.transition,
]);
export const PAYROLL_MONTHLY_CLOSE_TRIGGERS = Object.freeze({
  payroll_monthly_close_event_append_only_v1: Object.freeze({
    table: 'payroll_monthly_close_event',
    functionSignature: PAYROLL_MONTHLY_CLOSE_SIGNATURES.rejectEventChange,
    tokens: ['BEFORE', 'UPDATE', 'DELETE', 'FOR EACH ROW'],
  }),
  payroll_monthly_close_event_hash_v1: Object.freeze({
    table: 'payroll_monthly_close_event',
    functionSignature: PAYROLL_MONTHLY_CLOSE_SIGNATURES.hashEvent,
    tokens: ['BEFORE', 'INSERT', 'FOR EACH ROW'],
  }),
  payroll_monthly_close_run_guard_v1: Object.freeze({
    table: 'payroll_monthly_close_run',
    functionSignature: PAYROLL_MONTHLY_CLOSE_SIGNATURES.guardRun,
    tokens: ['BEFORE', 'UPDATE', 'DELETE', 'FOR EACH ROW'],
  }),
});
export const PAYROLL_MONTHLY_CLOSE_ROLE_MATRIX = Object.freeze({
  CONSULTA_INTEGRAL: Object.freeze(['payroll.monthly_close.read']),
  HUGO_APROBADOR_INTEGRAL: Object.freeze([
    'payroll.monthly_close.approve',
    'payroll.monthly_close.audit.read',
    'payroll.monthly_close.read',
  ]),
  PLATFORM_OWNER_OPERATIVO_INTEGRAL: Object.freeze([
    'payroll.monthly_close.audit.read',
    'payroll.monthly_close.prepare',
    'payroll.monthly_close.read',
  ]),
});

const MIGRATION_URL = new URL(
  './migrations/038-governed-monthly-close-run.sql', import.meta.url,
);
const PREREQUISITE_URL = new URL(
  './migrations/037-payroll-control-import-lock-semantics.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const EXPECTED_CAPABILITIES = Object.freeze({
  'payroll.monthly_close.approve': ['tenant', 'restricted'],
  'payroll.monthly_close.audit.read': ['tenant', 'restricted'],
  'payroll.monthly_close.prepare': ['tenant', 'privileged'],
  'payroll.monthly_close.read': ['tenant', 'standard'],
});
export const PAYROLL_MONTHLY_CLOSE_REQUIRED_COLUMNS = Object.freeze({
  payroll_monthly_close_run: Object.freeze({
    tenant_id: ['uuid', true],
    certified_binding_id: ['uuid', true],
    period_month: ['date', true],
    jurisdiction: ['character varying', true],
    release_sha: ['character', true],
    source_set_sha256: ['character', true],
    source_aggregates: ['jsonb', true],
    reconciliation: ['jsonb', true],
    reported_earnings_less_retentions_cents: ['bigint', true],
    reported_bank_net_cents: ['bigint', true],
    difference_cents: ['bigint', true],
    status: ['character varying', true],
    version: ['integer', true],
    close_approved: ['boolean', true],
    includes_personal_records: ['boolean', true],
    raw_content_stored: ['boolean', true],
    grh_mutation: ['boolean', true],
    payroll_calculated: ['boolean', true],
    payroll_posted: ['boolean', true],
    bank_artifact_generated: ['boolean', true],
    government_artifact_generated: ['boolean', true],
    fiscal_artifact_generated: ['boolean', true],
  }),
  payroll_monthly_close_event: Object.freeze({
    tenant_id: ['uuid', true],
    run_id: ['uuid', true],
    certified_binding_id: ['uuid', true],
    actor_membership_id: ['uuid', true],
    actor_session_id: ['uuid', true],
    actor_session_version: ['integer', true],
    release_sha: ['character', true],
    command: ['character varying', true],
    idempotency_key: ['uuid', true],
    command_hash: ['character', true],
    event_sha256: ['character', true],
    close_approved: ['boolean', true],
    raw_content_stored: ['boolean', true],
  }),
});
const FORBIDDEN_PERSISTED_COLUMNS = new Set([
  'dni', 'cuil', 'cbu', 'email', 'employee_id', 'legajo', 'name', 'filename',
  'original_name', 'raw_bytes', 'raw_content', 'account_number',
]);

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function requireTokens(label, value, tokens) {
  const source = normalized(value);
  for (const token of tokens) {
    if (!source.includes(normalized(token))) {
      throw new Error(`${label} no contiene ${token}`);
    }
  }
}

function exactSet(actual, expected, label) {
  const left = [...new Set(actual)].sort();
  const right = [...new Set(expected)].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label} fuera de contrato`);
  }
}

function expectedRoleMappings() {
  return Object.entries(PAYROLL_MONTHLY_CLOSE_ROLE_MATRIX).flatMap(([role, capabilities]) => (
    capabilities.map((capability) => `${role}|${capability}`)
  ));
}

export function payrollMonthlyCloseFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validatePayrollMonthlyCloseMigrationSql(sql) {
  const source = String(sql || '');
  const required = [
    'payroll-monthly-close-run.v1',
    'grh-concept-statistics.v1',
    'bank-accreditation-summary.v1',
    'government-payroll-summary.v1',
    'payroll.monthly_close.read',
    'payroll.monthly_close.prepare',
    'payroll.monthly_close.approve',
    'payroll.monthly_close.audit.read',
    'CREATE TABLE IF NOT EXISTS public.payroll_monthly_close_run',
    'CREATE TABLE IF NOT EXISTS public.payroll_monthly_close_event',
    'PAYROLL_MONTHLY_CLOSE_DIFFERENCE_BLOCKS_APPROVAL',
    'PAYROLL_MONTHLY_CLOSE_MAKER_CHECKER_REQUIRED',
    'PAYROLL_MONTHLY_CLOSE_BINDING_CHANGED',
    'PAYROLL_MONTHLY_CLOSE_ATTEMPT_NOT_FOUND',
    'PAYROLL_MONTHLY_CLOSE_ATTEMPT_CONTEXT_CHANGED',
    "'bindingId', NEW.certified_binding_id::text",
    "'personId', NEW.actor_person_id::text",
    "'authorityCapabilityKey', NEW.authority_capability_key",
    'difference_cents <> 0',
    'prepared_by_membership_id',
    'decided_by_membership_id',
    'includes_personal_records IS FALSE',
    'raw_content_stored IS FALSE',
    'grh_mutation IS FALSE',
    'payroll_calculated IS FALSE',
    'payroll_posted IS FALSE',
    'bank_artifact_generated IS FALSE',
    'government_artifact_generated IS FALSE',
    'fiscal_artifact_generated IS FALSE',
    'REVOKE ALL PRIVILEGES ON TABLE',
    'FROM municontrol_actions_runtime_app',
    'GRANT EXECUTE ON FUNCTION public.payroll_monthly_close_prepare_v1',
    'GRANT EXECUTE ON FUNCTION public.payroll_monthly_close_transition_v1',
    'PAYROLL_MONTHLY_CLOSE_PROFILE_DRIFT',
    'PAYROLL_MONTHLY_CLOSE_PROFILE_SOD_CONFLICT',
    'PAYROLL_MONTHLY_CLOSE_OVERRIDE_DRIFT',
  ];
  requireTokens('migracion 038', source, required);
  for (const functionName of Object.values(PAYROLL_MONTHLY_CLOSE_SIGNATURES)) {
    requireTokens('migracion 038', source, [
      `FUNCTION ${functionName.replace(/\([^)]*\)$/, '')}`,
    ]);
  }
  if (/(?:password_hash|mfa_secret|otp_code|recovery_code|gmail\.com|marcelo@|hugo@|admin@)/i
    .test(source)) {
    throw new Error('migracion 038 contiene secretos o identidades concretas');
  }
  if (/\b(?:GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)|ALTER\s+TABLE\s+[^;]+ENABLE\s+ROW\s+LEVEL)\b/i
    .test(source)) {
    throw new Error('migracion 038 amplia acceso directo a tablas');
  }
  if (splitPostgresStatements(source).length !== 68) {
    throw new Error('migracion 038 incompleta o no segmentable');
  }
  return true;
}

export function validatePayrollMonthlyCloseEvidence(evidence) {
  const tables = Object.fromEntries((evidence?.tables || []).map((item) => [item.name, item]));
  exactSet(Object.keys(tables), PAYROLL_MONTHLY_CLOSE_TABLES, 'tablas 038');
  for (const [name, table] of Object.entries(tables)) {
    if (table.ownedByCurrentUser !== true || table.ownerIsRuntime !== false
        || table.publicPrivileges !== false || table.runtimeAnyPrivileges !== false
        || JSON.stringify(table.nonOwnerPrivilegeGrantees || []) !== JSON.stringify([])) {
      throw new Error(`tabla 038 insegura: ${name}`);
    }
  }

  const columns = evidence?.columns || [];
  for (const [table, contracts] of Object.entries(PAYROLL_MONTHLY_CLOSE_REQUIRED_COLUMNS)) {
    const tableColumns = columns.filter((item) => item.tableName === table);
    const byName = Object.fromEntries(tableColumns.map((item) => [item.name, item]));
    for (const [name, [dataType, notNull]] of Object.entries(contracts)) {
      if (byName[name]?.dataType !== dataType || byName[name]?.notNull !== notNull) {
        throw new Error(`columna 038 invalida: ${table}.${name}`);
      }
    }
    if (tableColumns.some((item) => FORBIDDEN_PERSISTED_COLUMNS.has(item.name))) {
      throw new Error(`tabla 038 persiste datos prohibidos: ${table}`);
    }
  }

  const constraints = Object.fromEntries((evidence?.constraints || []).map((item) => [
    `${item.tableName}.${item.name}`, item,
  ]));
  const requiredConstraints = [
    ['payroll_monthly_close_run.payroll_monthly_close_run_binding_fk', ['platform_tenant_source_binding', 'ON DELETE RESTRICT']],
    ['payroll_monthly_close_run.payroll_monthly_close_run_maker_checker_ck', ['decided_by_membership_id', 'prepared_by_membership_id', 'decided_by_person_id']],
    ['payroll_monthly_close_run.payroll_monthly_close_run_no_side_effect_ck', ['includes_personal_records', 'raw_content_stored', 'payroll_posted', 'fiscal_artifact_generated']],
    ['payroll_monthly_close_run.payroll_monthly_close_run_state_ck', ["status = 'approved'", 'difference_cents = 0', 'mismatch_count = 0', 'blocking_issue_count = 0']],
    ['payroll_monthly_close_event.payroll_monthly_close_event_actor_idempotency_uk', ['tenant_id', 'actor_membership_id', 'idempotency_key']],
    ['payroll_monthly_close_event.payroll_monthly_close_event_no_side_effect_ck', ['raw_content_stored', 'grh_mutation', 'payroll_posted']],
  ];
  for (const [key, tokens] of requiredConstraints) {
    const constraint = constraints[key];
    if (!constraint || constraint.validated !== true) {
      throw new Error(`constraint 038 ausente: ${key}`);
    }
    requireTokens(`constraint ${key}`, constraint.definition, tokens);
  }

  const indexes = Object.fromEntries((evidence?.indexes || []).map((item) => [item.name, item]));
  exactSet(Object.keys(indexes), PAYROLL_MONTHLY_CLOSE_INDEXES, 'indices 038');
  const indexContracts = {
    payroll_monthly_close_event_timeline_idx: [false, false, ['tenant_id', 'run_id', 'occurred_at', 'id']],
    payroll_monthly_close_run_active_period_uk: [true, true, ['tenant_id', 'certified_binding_id', 'period_month', 'jurisdiction', 'prepared', 'submitted', 'approved']],
    payroll_monthly_close_run_tenant_status_idx: [false, false, ['tenant_id', 'status', 'period_month DESC', 'id']],
  };
  for (const [name, [unique, predicate, tokens]] of Object.entries(indexContracts)) {
    const index = indexes[name];
    if (index.valid !== true || index.ready !== true || index.unique !== unique
        || index.hasPredicate !== predicate) {
      throw new Error(`indice 038 invalido: ${name}`);
    }
    requireTokens(`indice ${name}`, index.definition, tokens);
  }

  const functions = Object.fromEntries((evidence?.functions || []).map((item) => [
    item.signature, item,
  ]));
  exactSet(Object.keys(functions), Object.values(PAYROLL_MONTHLY_CLOSE_SIGNATURES),
    'funciones 038');
  const runtimeSignatures = new Set(PAYROLL_MONTHLY_CLOSE_RUNTIME_SIGNATURES);
  const stableSignatures = new Set([
    PAYROLL_MONTHLY_CLOSE_SIGNATURES.snapshot,
    PAYROLL_MONTHLY_CLOSE_SIGNATURES.eventResult,
  ]);
  for (const [key, signature] of Object.entries(PAYROLL_MONTHLY_CLOSE_SIGNATURES)) {
    const fn = functions[signature] || {};
    const expectedVolatility = key === 'flags' ? 'i' : stableSignatures.has(signature) ? 's' : 'v';
    const shouldExecute = runtimeSignatures.has(signature);
    if (fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
        || fn.ownerIsRuntime !== false || fn.publicExecuteRevoked !== true
        || fn.runtimeExecuteGrantable !== false || fn.volatility !== expectedVolatility
        || JSON.stringify(fn.config || []) !== JSON.stringify(['search_path=public, pg_temp'])
        || fn.runtimeCanExecute !== shouldExecute
        || JSON.stringify(fn.nonOwnerExecuteGrantees || [])
          !== JSON.stringify(shouldExecute ? [RUNTIME_ROLE] : [])) {
      throw new Error(`funcion 038 insegura: ${signature}`);
    }
  }
  requireTokens('contexto 038', functions[PAYROLL_MONTHLY_CLOSE_SIGNATURES.assertContext].sourceBody, [
    'action_center_assert_tenant_read_session_v2', 'action_center_context_has_capability',
    'sourceBindingId', 'actorPersonId', 'PAYROLL_MONTHLY_CLOSE_SESSION_BUSY',
  ]);
  requireTokens('preparacion 038', functions[PAYROLL_MONTHLY_CLOSE_SIGNATURES.prepare].sourceBody, [
    'jsonb_array_length(p_sources) <> 3', 'grh-concept-statistics.v1',
    'bank-accreditation-summary.v1', 'government-payroll-summary.v1',
    'three_source_exact_aggregate_reconciliation', 'governmentComparisons',
    'computed_government_earnings', 'computed_government_contributions',
    'comparison_mismatch <> bank_mismatch', 'PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_REUSE',
    'payroll_monthly_close_run', 'payroll_monthly_close_event',
  ]);
  requireTokens('transicion 038', functions[PAYROLL_MONTHLY_CLOSE_SIGNATURES.transition].sourceBody, [
    'PAYROLL_MONTHLY_CLOSE_VERSION_CONFLICT', 'PAYROLL_MONTHLY_CLOSE_MAKER_CHECKER_REQUIRED',
    'PAYROLL_MONTHLY_CLOSE_DIFFERENCE_BLOCKS_APPROVAL', 'run_row.difference_cents <> 0',
    'run_row.mismatch_count <> 0', 'run_row.blocking_issue_count <> 0',
  ]);
  requireTokens('intento 038', functions[PAYROLL_MONTHLY_CLOSE_SIGNATURES.attempt].sourceBody, [
    'actor_membership_id', 'idempotency_key', 'actor_session_id',
    'actor_session_version', 'certified_binding_id', 'release_sha', 'actor_person_id',
    'actor_role_key', 'authority_capability_key', 'ATTEMPT_NOT_FOUND',
    'ATTEMPT_CONTEXT_CHANGED', 'event_result',
  ]);
  requireTokens('huella 038', functions[PAYROLL_MONTHLY_CLOSE_SIGNATURES.hashEvent].sourceBody, [
    "'bindingId', NEW.certified_binding_id::text",
    "'personId', NEW.actor_person_id::text",
    "'roleKey', NEW.actor_role_key",
    "'authorityCapabilityKey', NEW.authority_capability_key",
    "'occurredAt'", "NEW.occurred_at AT TIME ZONE 'UTC'",
  ]);
  requireTokens('snapshot 038', functions[PAYROLL_MONTHLY_CLOSE_SIGNATURES.snapshot].sourceBody, [
    'differenceCents', 'sourceSetSha256', 'timeline', 'payroll_monthly_close_event',
  ]);
  requireTokens('flags 038', functions[PAYROLL_MONTHLY_CLOSE_SIGNATURES.flags].sourceBody, [
    "'includesPersonalRecords', false", "'rawContentStored', false",
    "'grhMutation', false", "'payrollCalculated', false", "'payrollPosted', false",
    "'bankArtifactGenerated', false", "'governmentArtifactGenerated', false",
    "'fiscalArtifactGenerated', false",
  ]);

  const triggers = Object.fromEntries((evidence?.triggers || []).map((item) => [item.name, item]));
  exactSet(Object.keys(triggers), Object.keys(PAYROLL_MONTHLY_CLOSE_TRIGGERS), 'triggers 038');
  for (const [name, contract] of Object.entries(PAYROLL_MONTHLY_CLOSE_TRIGGERS)) {
    const trigger = triggers[name] || {};
    if (trigger.tableName !== contract.table || trigger.enabled !== 'O'
        || trigger.functionSignature !== contract.functionSignature) {
      throw new Error(`trigger 038 invalido: ${name}`);
    }
    requireTokens(`trigger ${name}`, trigger.definition, [
      ...contract.tokens, `ON public.${contract.table}`,
    ]);
  }

  const capabilities = Object.fromEntries((evidence?.capabilities || []).map((item) => [
    item.key, item,
  ]));
  exactSet(Object.keys(capabilities), Object.keys(EXPECTED_CAPABILITIES), 'capacidades 038');
  for (const [key, [scopeKind, sensitivity]] of Object.entries(EXPECTED_CAPABILITIES)) {
    if (capabilities[key]?.scopeKind !== scopeKind
        || capabilities[key]?.sensitivity !== sensitivity) {
      throw new Error(`capacidad 038 fuera de contrato: ${key}`);
    }
  }
  exactSet((evidence?.roles || []).map((item) => item.key),
    Object.keys(PAYROLL_MONTHLY_CLOSE_ROLE_MATRIX), 'roles institucionales 038');
  if ((evidence?.roles || []).some((item) => (
    item.scopeKind !== 'tenant' || item.systemManaged !== true
  ))) throw new Error('roles institucionales 038 tienen metadata insegura');
  exactSet((evidence?.roleMappings || []).map((item) => `${item.role}|${item.capability}`),
    expectedRoleMappings(), 'matriz de roles 038');
  exactSet((evidence?.conflicts || []).map((item) => (
    `${item.capability}|${item.conflictsWith}`
  )), ['payroll.monthly_close.approve|payroll.monthly_close.prepare'], 'conflictos SoD 038');
  if (Number(evidence?.overrideCount) !== 0) {
    throw new Error('overrides 038 deben permanecer vacios');
  }
  return true;
}

export function resolvePayrollMonthlyCloseTarget(argv = process.argv, env = process.env) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_MONTHLY_CLOSE',
    targetLabel: '038',
  });
}

export async function verifyPayrollMonthlyCloseConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '038');
}

async function collectEvidence(client) {
  const tableResult = await client.query(`
    SELECT relation.relname AS name,
      relation.relowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner_role.rolname = $1 AS "ownerIsRuntime",
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(
        relation.relacl, acldefault('r', relation.relowner)
      )) acl WHERE acl.grantee = 0) AS "publicPrivileges",
      (has_table_privilege($1, relation.oid, 'SELECT')
        OR has_table_privilege($1, relation.oid, 'INSERT')
        OR has_table_privilege($1, relation.oid, 'UPDATE')
        OR has_table_privilege($1, relation.oid, 'DELETE')
        OR has_table_privilege($1, relation.oid, 'TRUNCATE')
        OR has_table_privilege($1, relation.oid, 'REFERENCES')
        OR has_table_privilege($1, relation.oid, 'TRIGGER')) AS "runtimeAnyPrivileges",
      to_jsonb(ARRAY(
        SELECT DISTINCT grantee.rolname
        FROM aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE grantee.oid <> relation.relowner ORDER BY grantee.rolname
      )) AS "nonOwnerPrivilegeGrantees"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner_role ON owner_role.oid = relation.relowner
    WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
      AND relation.relname = ANY($2::text[]) ORDER BY relation.relname
  `, [RUNTIME_ROLE, PAYROLL_MONTHLY_CLOSE_TABLES]);
  const columnResult = await client.query(`
    SELECT table_name AS "tableName", column_name AS name,
      data_type AS "dataType", is_nullable = 'NO' AS "notNull"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ORDER BY table_name, column_name
  `, [PAYROLL_MONTHLY_CLOSE_TABLES]);
  const constraintResult = await client.query(`
    SELECT relation.relname AS "tableName", constraint_row.conname AS name,
      constraint_row.contype AS type, constraint_row.convalidated AS validated,
      pg_get_constraintdef(constraint_row.oid) AS definition
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname, constraint_row.conname
  `, [PAYROLL_MONTHLY_CLOSE_TABLES]);
  const indexResult = await client.query(`
    SELECT index_relation.relname AS name,
      pg_get_indexdef(index_row.indexrelid) AS definition,
      index_row.indisvalid AS valid, index_row.indisready AS ready,
      index_row.indisunique AS unique, index_row.indpred IS NOT NULL AS "hasPredicate"
    FROM pg_index index_row
    JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
    JOIN pg_namespace namespace ON namespace.oid = index_relation.relnamespace
    WHERE namespace.nspname = 'public' AND index_relation.relname = ANY($1::text[])
    ORDER BY index_relation.relname
  `, [PAYROLL_MONTHLY_CLOSE_INDEXES]);
  const functionResult = await client.query(`
    SELECT format('%I.%I(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner_role.rolname = $1 AS "ownerIsRuntime", function_row.provolatile AS volatility,
      COALESCE(function_row.proconfig, ARRAY[]::text[]) AS config,
      function_row.prosrc AS "sourceBody",
      NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(
        function_row.proacl, acldefault('f', function_row.proowner)
      )) acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS "publicExecuteRevoked",
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS "runtimeCanExecute",
      COALESCE((SELECT bool_or(acl.is_grantable)
        FROM aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE grantee.rolname = $1 AND acl.privilege_type = 'EXECUTE'), false)
        AS "runtimeExecuteGrantable",
      to_jsonb(ARRAY(SELECT grantee.rolname
        FROM aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE acl.privilege_type = 'EXECUTE' AND grantee.oid <> function_row.proowner
        ORDER BY grantee.rolname)) AS "nonOwnerExecuteGrantees"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid = function_row.proowner
    WHERE namespace.nspname = 'public'
      AND function_row.proname LIKE 'payroll_monthly_close_%'
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
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
      AND trigger_row.tgisinternal IS FALSE ORDER BY trigger_row.tgname
  `, [PAYROLL_MONTHLY_CLOSE_TABLES]);
  const capabilityResult = await client.query(`
    SELECT capability_key AS key, scope_kind AS "scopeKind", sensitivity
    FROM public.iam_capability WHERE capability_key LIKE 'payroll.monthly_close.%'
    ORDER BY capability_key
  `);
  const roleResult = await client.query(`
    SELECT role_key AS key, scope_kind AS "scopeKind", system_managed AS "systemManaged"
    FROM public.iam_role WHERE role_key = ANY($1::text[]) ORDER BY role_key
  `, [Object.keys(PAYROLL_MONTHLY_CLOSE_ROLE_MATRIX)]);
  const mappingResult = await client.query(`
    SELECT role_key AS role, capability_key AS capability
    FROM public.iam_role_capability WHERE capability_key LIKE 'payroll.monthly_close.%'
    ORDER BY role_key, capability_key
  `);
  const conflictResult = await client.query(`
    SELECT capability_key AS capability, conflicts_with_key AS "conflictsWith"
    FROM public.iam_capability_conflict
    WHERE capability_key LIKE 'payroll.monthly_close.%'
       OR conflicts_with_key LIKE 'payroll.monthly_close.%'
    ORDER BY capability_key, conflicts_with_key
  `);
  const overrideResult = await client.query(`
    SELECT count(*)::integer AS count
    FROM public.tenant_membership_capability_override
    WHERE capability_key LIKE 'payroll.monthly_close.%'
  `);
  return {
    tables: rows(tableResult), columns: rows(columnResult),
    constraints: rows(constraintResult), indexes: rows(indexResult),
    functions: rows(functionResult), triggers: rows(triggerResult),
    capabilities: rows(capabilityResult), roles: rows(roleResult),
    roleMappings: rows(mappingResult), conflicts: rows(conflictResult),
    overrideCount: rows(overrideResult)[0]?.count,
  };
}

export async function verifyPayrollMonthlyCloseFinalState(client) {
  return validatePayrollMonthlyCloseEvidence(await collectEvidence(client));
}

async function verifyPrerequisite(client) {
  const expected = payrollControlImportLockSemanticsFingerprint(
    await readFile(PREREQUISITE_URL, 'utf8'),
  );
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(
      `prerequisito ausente o con drift ${PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION}`,
    );
  }
}

async function verifyNoUnledgeredState(client) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_class relation JOIN pg_namespace namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname LIKE 'payroll_monthly_close_%'
    ) OR EXISTS (
      SELECT 1 FROM pg_proc function_row JOIN pg_namespace namespace
        ON namespace.oid = function_row.pronamespace
      WHERE namespace.nspname = 'public'
        AND function_row.proname LIKE 'payroll_monthly_close_%'
    ) OR EXISTS (
      SELECT 1 FROM public.iam_capability
      WHERE capability_key LIKE 'payroll.monthly_close.%'
    ) OR EXISTS (
      SELECT 1 FROM public.iam_role_capability
      WHERE capability_key LIKE 'payroll.monthly_close.%'
    ) AS present
  `);
  if (rows(result)[0]?.present === true) {
    throw new Error('estado 038 presente sin ledger');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validatePayrollMonthlyCloseMigrationSql(migration);
  const checksum = payrollMonthlyCloseFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolvePayrollMonthlyCloseTarget(process.argv.slice(2), process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyPayrollMonthlyCloseConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:payroll-monthly-close-038'))",
    );
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PAYROLL_MONTHLY_CLOSE_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${PAYROLL_MONTHLY_CLOSE_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredState(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PAYROLL_MONTHLY_CLOSE_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PAYROLL_MONTHLY_CLOSE_MIGRATION_VERSION, checksum],
      );
    }
    await verifyPayrollMonthlyCloseFinalState(client);
    await client.query('COMMIT');
    console.log(`${PAYROLL_MONTHLY_CLOSE_MIGRATION_VERSION}: ${existing.rowCount
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
