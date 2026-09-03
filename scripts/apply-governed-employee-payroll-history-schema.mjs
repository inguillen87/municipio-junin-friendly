import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const EMPLOYEE_PAYROLL_HISTORY_MIGRATION_VERSION =
  '031-governed-employee-payroll-history';
export const EMPLOYEE_PAYROLL_HISTORY_TABLE = 'employee_payroll_read_event';
export const EMPLOYEE_PAYROLL_HISTORY_SIGNATURES = Object.freeze({
  appendOnly: 'public.employee_payroll_read_reject_change_v1()',
  history: 'public.employee_payroll_history_v1(text,uuid,integer,text,uuid,uuid,uuid,integer,integer,integer)',
});
export const EMPLOYEE_PAYROLL_HISTORY_INDEXES = Object.freeze([
  'employee_payroll_read_event_actor_timeline_idx',
  'employee_payroll_read_event_tenant_timeline_idx',
]);
export const EMPLOYEE_PAYROLL_HISTORY_CONSTRAINTS = Object.freeze({
  employee_payroll_read_event_pkey: 'p',
  employee_payroll_read_event_tenant_fk: 'f',
  employee_payroll_read_event_binding_fk: 'f',
  employee_payroll_read_event_membership_fk: 'f',
  employee_payroll_read_event_session_fk: 'f',
  employee_payroll_read_event_contract_fk: 'f',
  employee_payroll_read_event_request_hash_ck: 'c',
  employee_payroll_read_event_event_hash_ck: 'c',
  employee_payroll_read_event_year_ck: 'c',
  employee_payroll_read_event_page_ck: 'c',
  employee_payroll_read_event_limit_ck: 'c',
  employee_payroll_read_event_count_ck: 'c',
  employee_payroll_read_event_outcome_ck: 'c',
});

const MIGRATION_URL = new URL(
  './migrations/031-governed-employee-payroll-history.sql', import.meta.url,
);
const PREREQUISITES = Object.freeze([
  ['002-canonical-integration', new URL(
    './migrations/002-canonical-integration.sql', import.meta.url,
  )],
  ['007-action-center-read-facades', new URL(
    './migrations/007-action-center-read-facades.sql', import.meta.url,
  )],
]);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const EXPECTED_COLUMNS = Object.freeze([
  ['actor_membership_id', 'uuid', true, null],
  ['actor_session_id', 'uuid', true, null],
  ['event_sha256', 'character', true, 64],
  ['id', 'uuid', true, null],
  ['occurred_at', 'timestamp with time zone', true, null],
  ['outcome', 'character varying', true, 16],
  ['query_limit', 'smallint', true, null],
  ['query_page', 'integer', true, null],
  ['query_year', 'smallint', false, null],
  ['request_sha256', 'character', true, 64],
  ['result_count', 'integer', true, null],
  ['source_binding_id', 'uuid', true, null],
  ['target_contract_id', 'uuid', false, null],
  ['tenant_id', 'uuid', true, null],
]);

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

function requireTokens(label, value, tokens) {
  const body = normalized(value);
  for (const token of tokens) {
    if (!body.includes(normalized(token))) {
      throw new Error(`${label} no contiene ${token}`);
    }
  }
}

export function employeePayrollHistoryFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validateEmployeePayrollHistoryMigrationSql(sql) {
  const source = String(sql || '');
  for (const token of [
    'CREATE TABLE IF NOT EXISTS employee_payroll_read_event',
    'employee_payroll_read_event_binding_fk',
    'employee_payroll_read_event_membership_fk',
    'employee_payroll_read_event_session_fk',
    'employee_payroll_read_event_contract_fk',
    'employee_payroll_read_event_request_hash_ck',
    'employee_payroll_read_event_event_hash_ck',
    'employee_payroll_read_event_outcome_ck',
    'CREATE INDEX IF NOT EXISTS employee_payroll_read_event_tenant_timeline_idx',
    'CREATE INDEX IF NOT EXISTS employee_payroll_read_event_actor_timeline_idx',
    'CREATE OR REPLACE FUNCTION employee_payroll_read_reject_change_v1()',
    'CREATE TRIGGER employee_payroll_read_append_only_v1',
    'BEFORE UPDATE OR DELETE ON employee_payroll_read_event',
    'CREATE OR REPLACE FUNCTION employee_payroll_history_v1(',
    'SECURITY DEFINER SET search_path = public, pg_temp',
    'action_center_assert_tenant_read_session_v2(',
    "action_center_context_has_capability(context_value, 'workforce.employee.read')",
    "action_center_context_has_capability(context_value, 'payroll.read')",
    "batch.source_system = 'GRH'",
    "batch.source_database = context_value->>'sourceDatabase'",
    "contract.legacy_company_id = (context_value->>'sourceCompanyId')::bigint",
    "batch.validation_state = 'published'",
    'INSERT INTO employee_payroll_read_event',
    'REVOKE ALL PRIVILEGES ON TABLE employee_payroll_read_event FROM PUBLIC',
    'REVOKE ALL PRIVILEGES ON TABLE employee_payroll_read_event',
    'FROM municontrol_actions_runtime_app',
    'REVOKE ALL ON FUNCTION employee_payroll_read_reject_change_v1() FROM PUBLIC',
    'REVOKE ALL PRIVILEGES ON FUNCTION employee_payroll_read_reject_change_v1()',
    'GRANT EXECUTE ON FUNCTION employee_payroll_history_v1(',
    'TO municontrol_actions_runtime_app',
  ]) {
    if (!source.includes(token)) throw new Error(`migracion 031 no contiene ${token}`);
  }

  const tableStart = source.indexOf('CREATE TABLE IF NOT EXISTS employee_payroll_read_event');
  const tableEnd = source.indexOf('\n);', tableStart);
  if (tableStart < 0 || tableEnd < 0) throw new Error('tabla de auditoria 031 incompleta');
  const auditTable = source.slice(tableStart, tableEnd + 3);
  if (/\b(?:email|legajo|dni|cuil|documento|importe|amount|salary|earnings|net_payable)\b/i
    .test(auditTable)) {
    throw new Error('tabla de auditoria 031 conserva PII o importes');
  }

  const grants = [...source.matchAll(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)\(/gi,
  )].map((match) => match[1]);
  exactSet(grants, ['employee_payroll_history_v1'], 'grants runtime 031');
  if (/\bGRANT\b[\s\S]{0,120}\b(?:TABLE\s+)?employee_payroll_read_event\b/i.test(source)) {
    throw new Error('migracion 031 otorga acceso directo a la auditoria');
  }
  if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?(?:employment_contract|payroll_run|payroll_monthly_fact|source_import_batch)\b/i
    .test(source)) {
    throw new Error('migracion 031 intenta mutar la fuente salarial');
  }
  if (splitPostgresStatements(source).length !== 15) {
    throw new Error('migracion 031 incompleta o no segmentable');
  }
  return true;
}

export function validateEmployeePayrollHistoryEvidence(evidence) {
  const table = evidence?.table || {};
  if (table.name !== EMPLOYEE_PAYROLL_HISTORY_TABLE
      || table.ownedByCurrentUser !== true || table.ownerIsRuntime !== false
      || table.publicPrivileges !== false || table.runtimeCanSelect !== false
      || table.runtimeCanInsert !== false || table.runtimeAnyPrivileges !== false
      || JSON.stringify(table.nonOwnerPrivilegeGrantees || []) !== JSON.stringify([])) {
    throw new Error('tabla de auditoria 031 tiene owner o ACL inseguros');
  }

  const columns = (evidence?.columns || []).map((column) => [
    column.name,
    column.dataType,
    column.notNull,
    column.characterMaximumLength == null ? null : Number(column.characterMaximumLength),
  ]).sort((left, right) => left[0].localeCompare(right[0]));
  if (JSON.stringify(columns) !== JSON.stringify(EXPECTED_COLUMNS)) {
    throw new Error('columnas de auditoria 031 fuera de contrato');
  }

  const constraintRows = evidence?.constraints || [];
  exactSet(constraintRows.map((item) => item.name),
    Object.keys(EMPLOYEE_PAYROLL_HISTORY_CONSTRAINTS), 'constraints 031');
  const constraints = Object.fromEntries(constraintRows.map((item) => [item.name, item]));
  for (const [name, type] of Object.entries(EMPLOYEE_PAYROLL_HISTORY_CONSTRAINTS)) {
    if (constraints[name]?.type !== type || constraints[name]?.validated !== true) {
      throw new Error(`constraint 031 invalido: ${name}`);
    }
  }
  const constraintTokens = {
    employee_payroll_read_event_pkey: ['PRIMARY KEY', '(id)'],
    employee_payroll_read_event_tenant_fk: [
      'FOREIGN KEY (tenant_id)', 'REFERENCES platform_tenant(id)', 'ON DELETE RESTRICT',
    ],
    employee_payroll_read_event_binding_fk: [
      'FOREIGN KEY (tenant_id, source_binding_id)',
      'REFERENCES platform_tenant_source_binding(tenant_id, id)', 'ON DELETE RESTRICT',
    ],
    employee_payroll_read_event_membership_fk: [
      'FOREIGN KEY (actor_membership_id, tenant_id)',
      'REFERENCES tenant_membership(id, tenant_id)', 'ON DELETE RESTRICT',
    ],
    employee_payroll_read_event_session_fk: [
      'FOREIGN KEY (actor_session_id)', 'REFERENCES tenant_identity_session(id)',
      'ON DELETE RESTRICT',
    ],
    employee_payroll_read_event_contract_fk: [
      'FOREIGN KEY (target_contract_id)', 'REFERENCES employment_contract(id)',
      'ON DELETE RESTRICT',
    ],
    employee_payroll_read_event_request_hash_ck: ['request_sha256', '64'],
    employee_payroll_read_event_event_hash_ck: ['event_sha256', '64'],
    employee_payroll_read_event_year_ck: ['query_year', '1900', '2100'],
    employee_payroll_read_event_page_ck: ['query_page', '1', '10000'],
    employee_payroll_read_event_limit_ck: ['query_limit', '1', '24'],
    employee_payroll_read_event_count_ck: ['result_count', '0', '24'],
    employee_payroll_read_event_outcome_ck: ['outcome', 'success', 'not_found'],
  };
  for (const [name, tokens] of Object.entries(constraintTokens)) {
    requireTokens(`constraint ${name}`, constraints[name]?.definition, tokens);
  }

  const indexRows = evidence?.indexes || [];
  exactSet(indexRows.map((item) => item.name), EMPLOYEE_PAYROLL_HISTORY_INDEXES, 'indices 031');
  for (const index of indexRows) {
    if (index.valid !== true || index.ready !== true || index.unique !== false
        || index.hasPredicate !== false) {
      throw new Error(`indice 031 invalido: ${index.name}`);
    }
    requireTokens(`indice ${index.name}`, index.definition,
      index.name.includes('actor')
        ? ['employee_payroll_read_event', 'tenant_id', 'actor_membership_id', 'occurred_at DESC', 'id']
        : ['employee_payroll_read_event', 'tenant_id', 'occurred_at DESC', 'id']);
  }

  const functions = Object.fromEntries(
    (evidence?.functions || []).map((item) => [item.signature, item]),
  );
  exactSet(Object.keys(functions), Object.values(EMPLOYEE_PAYROLL_HISTORY_SIGNATURES),
    'funciones 031');
  for (const signature of Object.values(EMPLOYEE_PAYROLL_HISTORY_SIGNATURES)) {
    const fn = functions[signature] || {};
    if (fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
        || fn.ownerIsRuntime !== false || fn.publicExecuteRevoked !== true
        || fn.runtimeExecuteGrantable !== false
        || JSON.stringify(fn.config || []) !== JSON.stringify(['search_path=public, pg_temp'])
        || fn.volatility !== 'v') {
      throw new Error(`funcion 031 insegura: ${signature}`);
    }
  }
  const history = functions[EMPLOYEE_PAYROLL_HISTORY_SIGNATURES.history];
  const appendOnly = functions[EMPLOYEE_PAYROLL_HISTORY_SIGNATURES.appendOnly];
  if (history.runtimeCanExecute !== true
      || JSON.stringify(history.nonOwnerExecuteGrantees || [])
        !== JSON.stringify([RUNTIME_ROLE])
      || appendOnly.runtimeCanExecute !== false
      || JSON.stringify(appendOnly.nonOwnerExecuteGrantees || []) !== JSON.stringify([])) {
    throw new Error('allowlist execute-only 031 fuera de contrato');
  }
  requireTokens('fachada 031', history.sourceBody, [
    'action_center_assert_tenant_read_session_v2',
    "action_center_context_has_capability(context_value, 'workforce.employee.read')",
    "action_center_context_has_capability(context_value, 'payroll.read')",
    "batch.source_database = context_value->>'sourceDatabase'",
    "contract.legacy_company_id = (context_value->>'sourceCompanyId')::bigint",
    'INSERT INTO employee_payroll_read_event',
  ]);
  requireTokens('guard append-only 031', appendOnly.sourceBody, [
    'EMPLOYEE_PAYROLL_READ_APPEND_ONLY',
  ]);

  const trigger = evidence?.trigger || {};
  if (trigger.name !== 'employee_payroll_read_append_only_v1'
      || trigger.enabled !== 'O'
      || trigger.functionSignature !== EMPLOYEE_PAYROLL_HISTORY_SIGNATURES.appendOnly) {
    throw new Error('trigger append-only 031 fuera de contrato');
  }
  requireTokens('trigger append-only 031', trigger.definition, [
    'BEFORE', 'UPDATE', 'DELETE', 'ON public.employee_payroll_read_event',
    'FOR EACH ROW', 'employee_payroll_read_reject_change_v1()',
  ]);
  return true;
}

export function resolveEmployeePayrollHistoryTarget(argv = process.argv, env = process.env) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'EMPLOYEE_PAYROLL_HISTORY',
    targetLabel: '031',
  });
}

export async function verifyEmployeePayrollHistoryConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '031');
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
      has_table_privilege($1, relation.oid, 'SELECT') AS "runtimeCanSelect",
      has_table_privilege($1, relation.oid, 'INSERT') AS "runtimeCanInsert",
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
      AND relation.relname = $2
  `, [RUNTIME_ROLE, EMPLOYEE_PAYROLL_HISTORY_TABLE]);
  const columnResult = await client.query(`
    SELECT column_name AS name, data_type AS "dataType",
      is_nullable = 'NO' AS "notNull",
      character_maximum_length AS "characterMaximumLength"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY column_name
  `, [EMPLOYEE_PAYROLL_HISTORY_TABLE]);
  const constraintResult = await client.query(`
    SELECT constraint_row.conname AS name, constraint_row.contype AS type,
      constraint_row.convalidated AS validated,
      pg_get_constraintdef(constraint_row.oid) AS definition
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = $1::regclass
    ORDER BY constraint_row.conname
  `, [`public.${EMPLOYEE_PAYROLL_HISTORY_TABLE}`]);
  const indexResult = await client.query(`
    SELECT index_relation.relname AS name,
      pg_get_indexdef(index_row.indexrelid) AS definition,
      index_row.indisvalid AS valid, index_row.indisready AS ready,
      index_row.indisunique AS unique, index_row.indpred IS NOT NULL AS "hasPredicate"
    FROM pg_index index_row
    JOIN pg_class table_relation ON table_relation.oid = index_row.indrelid
    JOIN pg_namespace namespace ON namespace.oid = table_relation.relnamespace
    JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
    WHERE namespace.nspname = 'public' AND table_relation.relname = $1
      AND index_relation.relname = ANY($2::text[])
    ORDER BY index_relation.relname
  `, [EMPLOYEE_PAYROLL_HISTORY_TABLE, EMPLOYEE_PAYROLL_HISTORY_INDEXES]);
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
    WHERE function_row.oid IN ($2::regprocedure, $3::regprocedure)
    ORDER BY signature
  `, [RUNTIME_ROLE, EMPLOYEE_PAYROLL_HISTORY_SIGNATURES.appendOnly,
    EMPLOYEE_PAYROLL_HISTORY_SIGNATURES.history]);
  const triggerResult = await client.query(`
    SELECT trigger_row.tgname AS name, trigger_row.tgenabled AS enabled,
      pg_get_triggerdef(trigger_row.oid) AS definition,
      format('%I.%I(%s)', function_namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS "functionSignature"
    FROM pg_trigger trigger_row
    JOIN pg_class relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace function_namespace ON function_namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND relation.relname = $1
      AND trigger_row.tgname = 'employee_payroll_read_append_only_v1'
      AND trigger_row.tgisinternal IS FALSE
  `, [EMPLOYEE_PAYROLL_HISTORY_TABLE]);
  return {
    table: rows(tableResult)[0],
    columns: rows(columnResult),
    constraints: rows(constraintResult),
    indexes: rows(indexResult),
    functions: rows(functionResult),
    trigger: rows(triggerResult)[0],
  };
}

export async function verifyEmployeePayrollHistoryFinalState(client) {
  return validateEmployeePayrollHistoryEvidence(await collectEvidence(client));
}

async function verifyPrerequisites(client) {
  for (const [version, url] of PREREQUISITES) {
    const checksum = employeePayrollHistoryFingerprint(await readFile(url, 'utf8'));
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
  const reserved = await client.query(`
    SELECT to_regclass('public.employee_payroll_read_event') IS NOT NULL
      OR to_regclass('public.employee_payroll_read_event_actor_timeline_idx') IS NOT NULL
      OR to_regclass('public.employee_payroll_read_event_tenant_timeline_idx') IS NOT NULL
      OR to_regprocedure($1) IS NOT NULL
      OR to_regprocedure($2) IS NOT NULL AS present
  `, [EMPLOYEE_PAYROLL_HISTORY_SIGNATURES.appendOnly,
    EMPLOYEE_PAYROLL_HISTORY_SIGNATURES.history]);
  if (rows(reserved)[0]?.present === true) {
    throw new Error('estado 031 presente sin ledger');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateEmployeePayrollHistoryMigrationSql(migration);
  const checksum = employeePayrollHistoryFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolveEmployeePayrollHistoryTarget(process.argv.slice(2), process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyEmployeePayrollHistoryConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:employee-payroll-history-031'))",
    );
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [EMPLOYEE_PAYROLL_HISTORY_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${EMPLOYEE_PAYROLL_HISTORY_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredState(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${EMPLOYEE_PAYROLL_HISTORY_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [EMPLOYEE_PAYROLL_HISTORY_MIGRATION_VERSION, checksum],
      );
    }
    await verifyEmployeePayrollHistoryFinalState(client);
    await client.query('COMMIT');
    console.log(`${EMPLOYEE_PAYROLL_HISTORY_MIGRATION_VERSION}: ${existing.rowCount
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
