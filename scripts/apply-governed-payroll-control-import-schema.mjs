import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const PAYROLL_CONTROL_IMPORT_MIGRATION_VERSION =
  '025-governed-payroll-control-import';
export const PAYROLL_CONTROL_IMPORT_TABLES = Object.freeze([
  'payroll_control_import_batch',
  'payroll_control_import_event',
  'payroll_control_import_row',
]);
export const PAYROLL_CONTROL_IMPORT_FUNCTIONS = Object.freeze([
  'public.payroll_control_import_assert_context_v1(jsonb,text)',
  'public.payroll_control_import_batch_guard_v1()',
  'public.payroll_control_import_bootstrap_v1(jsonb)',
  'public.payroll_control_import_event_guard_v1()',
  'public.payroll_control_import_event_snapshot_v1(bigint,uuid)',
  'public.payroll_control_import_prepare_v1(jsonb,text,date,text,text,text,integer,jsonb,uuid,text)',
  'public.payroll_control_import_reject_change_v1()',
  'public.payroll_control_import_require_audit_v1()',
  'public.payroll_control_import_row_guard_v1()',
  'public.payroll_control_import_rows_valid_v1(jsonb)',
  'public.payroll_control_import_snapshot_v1(uuid,uuid)',
  'public.payroll_control_import_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text)',
]);
export const PAYROLL_CONTROL_IMPORT_RUNTIME_FUNCTIONS = Object.freeze([
  'public.payroll_control_import_bootstrap_v1(jsonb)',
  'public.payroll_control_import_prepare_v1(jsonb,text,date,text,text,text,integer,jsonb,uuid,text)',
  'public.payroll_control_import_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text)',
]);
export const PAYROLL_CONTROL_IMPORT_TRIGGERS = Object.freeze([
  'payroll_control_import_batch_audit_required_v1',
  'payroll_control_import_batch_guard_v1',
  'payroll_control_import_batch_no_delete_v1',
  'payroll_control_import_event_append_only_v1',
  'payroll_control_import_event_guard_v1',
  'payroll_control_import_row_guard_v1',
]);
export const PAYROLL_CONTROL_IMPORT_ROLE_MATRIX = Object.freeze({
  CONSULTA_INTEGRAL: ['payroll.control_import.read'],
  HUGO_APROBADOR_INTEGRAL: [
    'payroll.control_import.audit.read',
    'payroll.control_import.read',
    'payroll.control_import.validate',
  ],
  PLATFORM_OWNER_OPERATIVO_INTEGRAL: [
    'payroll.control_import.audit.read',
    'payroll.control_import.prepare',
    'payroll.control_import.read',
  ],
});

const MIGRATION_URL = new URL(
  './migrations/025-governed-payroll-control-import.sql', import.meta.url,
);
const PREREQUISITES = Object.freeze([
  ['014-governed-source-binding-provisioning', new URL(
    './migrations/014-governed-source-binding-provisioning.sql', import.meta.url,
  )],
  ['019-institutional-access-profiles', new URL(
    './migrations/019-institutional-access-profiles.sql', import.meta.url,
  )],
  ['021-platform-owner-operational-integral', new URL(
    './migrations/021-platform-owner-operational-integral.sql', import.meta.url,
  )],
]);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

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

export function payrollControlImportFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validatePayrollControlImportMigrationSql(sql) {
  const source = String(sql || '');
  const required = [
    ...PAYROLL_CONTROL_IMPORT_TABLES.map((table) =>
      `CREATE TABLE IF NOT EXISTS public.${table}`),
    'payroll_control_import_bootstrap_v1',
    'payroll_control_import_prepare_v1',
    'payroll_control_import_transition_v1',
    "source_kind IN ('grh_observed','operator_control')",
    "provenance_state = 'operator_declared'",
    "contract_version = 'payroll-control-import.v1'",
    "hmac_key_version = 'hmac-v1'",
    'amount_cents bigint NOT NULL',
    'content_hmac_sha256 char(64) NOT NULL',
    "period_month BETWEEN DATE '1900-01-01' AND DATE '2099-12-01'",
    'validated_by_person_id <> prepared_by_person_id',
    'validated_by_membership_id <> prepared_by_membership_id',
    'PAYROLL_CONTROL_IMPORT_IDEMPOTENCY_REUSE',
    'PAYROLL_CONTROL_IMPORT_AUDIT_REQUIRED',
    'DEFERRABLE INITIALLY DEFERRED',
    'REVOKE ALL PRIVILEGES ON TABLE',
  ];
  for (const token of required) {
    if (!source.includes(token)) throw new Error(`migracion 025 no contiene ${token}`);
  }
  const grants = [...source.matchAll(
    /GRANT EXECUTE ON FUNCTION public\.(payroll_control_import_[a-z0-9_]+)\(/g,
  )].map((match) => match[1]).sort();
  exactSet(grants, [
    'payroll_control_import_bootstrap_v1',
    'payroll_control_import_prepare_v1',
    'payroll_control_import_transition_v1',
  ], 'facades runtime 025');
  if (/\b(?:file_?name|filename|raw_?bytes|payload_?bytes|dni|cuil|apellido)\b/i.test(source)) {
    throw new Error('migracion 025 contiene bytes, nombre de archivo o PII');
  }
  if (/\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:public\.)?(?:payroll|nomina|action_case|source_import_batch)\b/i
    .test(source)) {
    throw new Error('migracion 025 intenta mutar una salida o fuente gobernada');
  }
  if (splitPostgresStatements(source).length < 60) {
    throw new Error('migracion 025 incompleta o no segmentable');
  }
  return true;
}

export function validatePayrollControlImportEvidence(evidence) {
  const owner = String(evidence?.currentUser || '');
  if (!owner || owner === RUNTIME_ROLE) throw new Error('owner 025 invalido');
  exactSet((evidence?.tables || []).map((row) => row.tableName),
    PAYROLL_CONTROL_IMPORT_TABLES, 'tablas 025');
  for (const table of evidence?.tables || []) {
    if (table.ownerName !== owner || table.runtimePrivileges === true
        || table.publicPrivileges === true || table.tenantIdNotNull !== true) {
      throw new Error(`ACL o tenant inseguro en ${table.tableName}`);
    }
  }
  const amount = (evidence?.columns || []).find((column) =>
    column.tableName === 'payroll_control_import_row' && column.columnName === 'amount_cents');
  const hmac = (evidence?.columns || []).find((column) =>
    column.tableName === 'payroll_control_import_batch'
      && column.columnName === 'content_hmac_sha256');
  const provenance = (evidence?.columns || []).find((column) =>
    column.tableName === 'payroll_control_import_batch'
      && column.columnName === 'provenance_state');
  const contractVersion = (evidence?.columns || []).find((column) =>
    column.tableName === 'payroll_control_import_batch'
      && column.columnName === 'contract_version');
  const hmacKeyVersion = (evidence?.columns || []).find((column) =>
    column.tableName === 'payroll_control_import_batch'
      && column.columnName === 'hmac_key_version');
  if (amount?.dataType !== 'bigint' || amount?.notNull !== true
      || hmac?.dataType !== 'character' || hmac?.notNull !== true
      || Number(hmac?.characterMaximumLength) !== 64
      || provenance?.dataType !== 'character varying' || provenance?.notNull !== true
      || Number(provenance?.characterMaximumLength) !== 32
      || contractVersion?.dataType !== 'character varying'
      || contractVersion?.notNull !== true
      || Number(contractVersion?.characterMaximumLength) !== 64
      || hmacKeyVersion?.dataType !== 'character varying'
      || hmacKeyVersion?.notNull !== true
      || Number(hmacKeyVersion?.characterMaximumLength) !== 32) {
    throw new Error('columnas criticas 025 fuera de contrato');
  }
  exactSet((evidence?.functions || []).map((fn) => fn.signature),
    PAYROLL_CONTROL_IMPORT_FUNCTIONS, 'funciones 025');
  for (const fn of evidence?.functions || []) {
    const runtimeExpected = PAYROLL_CONTROL_IMPORT_RUNTIME_FUNCTIONS.includes(fn.signature);
    if (fn.ownerName !== owner || fn.securityDefiner !== true
        || fn.publicExecuteRevoked !== true || fn.fixedSearchPath !== true
        || fn.runtimeExecute !== runtimeExpected) {
      throw new Error(`funcion insegura 025 ${fn.signature}`);
    }
  }
  exactSet((evidence?.triggers || []).map((row) => row.name),
    PAYROLL_CONTROL_IMPORT_TRIGGERS, 'triggers 025');
  const roleMap = Object.fromEntries(
    (evidence?.roles || []).map((row) => [row.roleKey, row.capabilities]),
  );
  exactSet(Object.keys(roleMap), Object.keys(PAYROLL_CONTROL_IMPORT_ROLE_MATRIX), 'roles 025');
  for (const [role, capabilities] of Object.entries(PAYROLL_CONTROL_IMPORT_ROLE_MATRIX)) {
    exactSet(roleMap[role], capabilities, `capacidades 025 ${role}`);
  }
  if (evidence?.requiredConflict !== true || (evidence?.roleConflicts || []).length) {
    throw new Error('separacion de funciones 025 incumplida');
  }
  return true;
}

async function collectEvidence(client) {
  const identity = await client.query('SELECT current_user AS "currentUser"');
  const currentUser = rows(identity)[0]?.currentUser;
  const tables = await client.query(`
    SELECT relation.relname AS "tableName", owner_role.rolname AS "ownerName",
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(relation.relacl,
        acldefault('r', relation.relowner))) acl WHERE acl.grantee = 0)
        AS "publicPrivileges",
      has_table_privilege($2, relation.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS "runtimePrivileges",
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
  `, [PAYROLL_CONTROL_IMPORT_TABLES, RUNTIME_ROLE]);
  const columns = await client.query(`
    SELECT table_name AS "tableName", column_name AS "columnName",
      data_type AS "dataType", is_nullable = 'NO' AS "notNull",
      character_maximum_length AS "characterMaximumLength"
    FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
  `, [PAYROLL_CONTROL_IMPORT_TABLES]);
  const functions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
      replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      owner_role.rolname AS "ownerName", function_row.prosecdef AS "securityDefiner",
      NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(function_row.proacl,
        acldefault('f', function_row.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS "publicExecuteRevoked",
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS "runtimeExecute",
      'search_path=public, pg_temp' = ANY(COALESCE(function_row.proconfig, ARRAY[]::text[]))
        AS "fixedSearchPath"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid = function_row.proowner
    WHERE namespace.nspname = 'public'
      AND function_row.proname LIKE 'payroll_control_import_%_v1'
    ORDER BY signature
  `, [RUNTIME_ROLE]);
  const triggers = await client.query(`
    SELECT trigger.tgname AS name FROM pg_trigger trigger
    JOIN pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND NOT trigger.tgisinternal
      AND relation.relname = ANY($1::text[]) ORDER BY trigger.tgname
  `, [PAYROLL_CONTROL_IMPORT_TABLES]);
  const roles = await client.query(`
    SELECT role.role_key AS "roleKey",
      COALESCE(array_agg(mapping.capability_key ORDER BY mapping.capability_key)
        FILTER (WHERE mapping.capability_key LIKE 'payroll.control_import.%'),
        ARRAY[]::varchar[]) AS capabilities
    FROM iam_role role JOIN iam_role_capability mapping
      ON mapping.role_key = role.role_key
    WHERE mapping.capability_key LIKE 'payroll.control_import.%'
    GROUP BY role.role_key ORDER BY role.role_key
  `);
  const requiredConflict = await client.query(`
    SELECT EXISTS (SELECT 1 FROM iam_capability_conflict
      WHERE capability_key = 'payroll.control_import.prepare'
        AND conflicts_with_key = 'payroll.control_import.validate') AS present
  `);
  const roleConflicts = await client.query(`
    SELECT left_grant.role_key AS "roleKey" FROM iam_capability_conflict conflict
    JOIN iam_role_capability left_grant
      ON left_grant.capability_key = conflict.capability_key
    JOIN iam_role_capability right_grant ON right_grant.role_key = left_grant.role_key
      AND right_grant.capability_key = conflict.conflicts_with_key
    WHERE left_grant.role_key = ANY($1::varchar[])
  `, [Object.keys(PAYROLL_CONTROL_IMPORT_ROLE_MATRIX)]);
  return {
    currentUser,
    tables: rows(tables),
    columns: rows(columns),
    functions: rows(functions),
    triggers: rows(triggers),
    roles: rows(roles),
    requiredConflict: rows(requiredConflict)[0]?.present === true,
    roleConflicts: rows(roleConflicts),
  };
}

export async function verifyPayrollControlImportFinalState(client) {
  validatePayrollControlImportEvidence(await collectEvidence(client));
  return true;
}

function pinnedValue(argv, prefix, envValue, label, pattern) {
  const matches = argv.filter((argument) => argument.startsWith(prefix));
  if (matches.length > 1) throw new Error(`${label} repetido`);
  const cli = matches[0]?.slice(prefix.length).trim();
  const env = String(envValue || '').trim();
  if (cli && env && cli !== env) throw new Error(`${label} no coincide entre CLI y entorno`);
  const value = cli || env;
  if (!value) throw new Error(`Falta ${label}`);
  if (!pattern.test(value)) throw new Error(`${label} tiene formato invalido`);
  return value;
}

export function resolvePayrollControlImportTarget(argv = process.argv, env = process.env) {
  if (!argv.includes('--confirm-isolated-branch')) {
    throw new Error('Falta --confirm-isolated-branch');
  }
  const target = resolveCanonicalDatabaseTarget(argv, env);
  if (target.mode !== 'isolated') throw new Error('025 solo admite una rama aislada');
  const databaseUrl = directCanonicalDatabaseUrl(argv, env);
  if (databaseUrl !== target.databaseUrl) throw new Error('target 025 cambio en preflight');
  const parsed = new URL(databaseUrl);
  const branchId = pinnedValue(argv, '--expected-neon-branch-id=',
    env.PAYROLL_CONTROL_IMPORT_EXPECTED_NEON_BRANCH_ID,
    'PAYROLL_CONTROL_IMPORT_EXPECTED_NEON_BRANCH_ID', /^br-[a-z0-9-]+$/);
  const projectId = pinnedValue(argv, '--expected-neon-project-id=',
    env.PAYROLL_CONTROL_IMPORT_EXPECTED_NEON_PROJECT_ID,
    'PAYROLL_CONTROL_IMPORT_EXPECTED_NEON_PROJECT_ID', /^[a-z][a-z0-9-]{2,95}$/);
  const expectedHost = pinnedValue(argv, '--expected-neon-host=',
    env.PAYROLL_CONTROL_IMPORT_EXPECTED_NEON_HOST,
    'PAYROLL_CONTROL_IMPORT_EXPECTED_NEON_HOST',
    /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/);
  const expectedDatabase = pinnedValue(argv, '--expected-database=',
    env.PAYROLL_CONTROL_IMPORT_EXPECTED_DATABASE,
    'PAYROLL_CONTROL_IMPORT_EXPECTED_DATABASE', /^[A-Za-z_][A-Za-z0-9_$-]*$/);
  const actualDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (parsed.hostname !== expectedHost || actualDatabase !== expectedDatabase) {
    throw new Error('DATABASE_URL_UNPOOLED no coincide con target 025 fijado');
  }
  return Object.freeze({
    ...target, branchId, projectId, expectedHost, expectedDatabase,
    endpointId: expectedHost.split('.')[0],
  });
}

export async function verifyPayrollControlImportConnectedTarget(client, target) {
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
    throw new Error('conexion efectiva no coincide con rama Neon aislada fijada');
  }
  return true;
}

async function verifyPrerequisites(client) {
  for (const [version, url] of PREREQUISITES) {
    const checksum = payrollControlImportFingerprint(await readFile(url, 'utf8'));
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
        AND function_row.proname LIKE 'payroll_control_import_%_v1') AS present
  `, [PAYROLL_CONTROL_IMPORT_TABLES]);
  if (rows(result)[0]?.present === true) throw new Error('objetos 025 presentes sin ledger');
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validatePayrollControlImportMigrationSql(migration);
  const checksum = payrollControlImportFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolvePayrollControlImportTarget(process.argv.slice(2), process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyPayrollControlImportConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:payroll-control-import-025'))",
    );
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PAYROLL_CONTROL_IMPORT_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${PAYROLL_CONTROL_IMPORT_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredObjects(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PAYROLL_CONTROL_IMPORT_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PAYROLL_CONTROL_IMPORT_MIGRATION_VERSION, checksum],
      );
    }
    await verifyPayrollControlImportFinalState(client);
    await client.query('COMMIT');
    console.log(`${PAYROLL_CONTROL_IMPORT_MIGRATION_VERSION}: ${existing.rowCount
      ? 'reapply con ledger y evidencia parcial verificados' : 'fresh apply'} (isolated, SHA-256 ${checksum})`);
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
