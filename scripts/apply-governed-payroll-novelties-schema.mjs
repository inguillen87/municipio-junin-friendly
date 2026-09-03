import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const PAYROLL_NOVELTY_MIGRATION_VERSION = '026-governed-payroll-novelties';
export const PAYROLL_NOVELTY_TABLES = Object.freeze([
  'payroll_novelty_batch',
  'payroll_novelty_event',
  'payroll_novelty_issue',
  'payroll_novelty_row',
]);
export const PAYROLL_NOVELTY_CAPABILITIES = Object.freeze([
  'payroll.novelty.approve',
  'payroll.novelty.audit.read',
  'payroll.novelty.export',
  'payroll.novelty.nominal.read',
  'payroll.novelty.prepare',
  'payroll.novelty.read',
]);
export const PAYROLL_NOVELTY_FUNCTIONS = Object.freeze([
  'public.payroll_novelty_assert_context_v1(jsonb,text)',
  'public.payroll_novelty_batch_guard_v1()',
  'public.payroll_novelty_bootstrap_v1(jsonb)',
  'public.payroll_novelty_detail_v1(jsonb,uuid)',
  'public.payroll_novelty_event_guard_v1()',
  'public.payroll_novelty_event_snapshot_v1(bigint,uuid,boolean)',
  'public.payroll_novelty_export_v1(jsonb,uuid)',
  'public.payroll_novelty_issue_guard_v1()',
  'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)',
  'public.payroll_novelty_reject_change_v1()',
  'public.payroll_novelty_require_audit_v1()',
  'public.payroll_novelty_row_guard_v1()',
  'public.payroll_novelty_rows_valid_v1(jsonb,text)',
  'public.payroll_novelty_snapshot_v1(uuid,uuid,boolean)',
  'public.payroll_novelty_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text)',
]);
export const PAYROLL_NOVELTY_RUNTIME_FUNCTIONS = Object.freeze([
  'public.payroll_novelty_bootstrap_v1(jsonb)',
  'public.payroll_novelty_detail_v1(jsonb,uuid)',
  'public.payroll_novelty_export_v1(jsonb,uuid)',
  'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)',
  'public.payroll_novelty_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text)',
]);
export const PAYROLL_NOVELTY_TRIGGERS = Object.freeze([
  'payroll_novelty_batch_audit_required_v1',
  'payroll_novelty_batch_guard_v1',
  'payroll_novelty_batch_no_delete_v1',
  'payroll_novelty_event_append_only_v1',
  'payroll_novelty_event_guard_v1',
  'payroll_novelty_issue_guard_v1',
  'payroll_novelty_row_guard_v1',
]);

const MIGRATION_URL = new URL(
  './migrations/026-governed-payroll-novelties.sql', import.meta.url,
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
  ['024-governed-monthly-attendance-evaluation', new URL(
    './migrations/024-governed-monthly-attendance-evaluation.sql', import.meta.url,
  )],
  ['025-governed-payroll-control-import', new URL(
    './migrations/025-governed-payroll-control-import.sql', import.meta.url,
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

export function payrollNoveltyFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validatePayrollNoveltyMigrationSql(sql) {
  const source = String(sql || '');
  const required = [
    ...PAYROLL_NOVELTY_TABLES.map((table) => `CREATE TABLE IF NOT EXISTS public.${table}`),
    'payroll_novelty_bootstrap_v1',
    'payroll_novelty_prepare_v1',
    'payroll_novelty_transition_v1',
    'payroll_novelty_detail_v1',
    'payroll_novelty_export_v1',
    "source_mode IN ('individual','bulk')",
    "payroll_type IN ('monthly','sac','vacation','supplementary','final','other')",
    "contract_version = 'payroll-novelty-batch.v1'",
    "status IN ('draft','submitted','approved','rejected','cancelled')",
    'amount_cents bigint',
    'quantity numeric(20,6)',
    'approved_by_person_id <> prepared_by_person_id',
    'approved_by_membership_id <> prepared_by_membership_id',
    'PAYROLL_NOVELTY_LEGAJO_NOT_FOUND',
    'PAYROLL_NOVELTY_IDEMPOTENCY_REUSE',
    'PAYROLL_NOVELTY_VERSION_CONFLICT',
    'PAYROLL_NOVELTY_AUDIT_REQUIRED',
    'DEFERRABLE INITIALLY DEFERRED',
    'grh_mutation IS FALSE',
    'payroll_calculated IS FALSE',
    'payroll_posted IS FALSE',
    'REVOKE ALL PRIVILEGES ON TABLE',
  ];
  for (const token of required) {
    if (!source.includes(token)) throw new Error(`migracion 026 no contiene ${token}`);
  }
  const grants = [...source.matchAll(
    /GRANT EXECUTE ON FUNCTION public\.(payroll_novelty_[a-z0-9_]+)\(/g,
  )].map((match) => match[1]).sort();
  exactSet(grants, [
    'payroll_novelty_bootstrap_v1',
    'payroll_novelty_detail_v1',
    'payroll_novelty_export_v1',
    'payroll_novelty_prepare_v1',
    'payroll_novelty_transition_v1',
  ], 'facades runtime 026');
  if (/INSERT INTO public\.iam_role_capability/i.test(source)
      || /\b(?:marcelo|hugo|admin)@/i.test(source)) {
    throw new Error('migracion 026 hardcodea usuarios o roles');
  }
  if (/\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:public\.)?(?:employment_movement|payroll_run|payroll_monthly_fact)\b/i
    .test(source)) {
    throw new Error('migracion 026 intenta mutar GRH, calculo o nomina');
  }
  if (splitPostgresStatements(source).length < 65) {
    throw new Error('migracion 026 incompleta o no segmentable');
  }
  return true;
}

export function validatePayrollNoveltyEvidence(evidence) {
  const owner = String(evidence?.currentUser || '');
  if (!owner || owner === RUNTIME_ROLE) throw new Error('owner 026 invalido');
  exactSet((evidence?.tables || []).map((row) => row.tableName),
    PAYROLL_NOVELTY_TABLES, 'tablas 026');
  for (const table of evidence?.tables || []) {
    if (table.ownerName !== owner || table.runtimePrivileges === true
        || table.publicPrivileges === true || table.tenantIdNotNull !== true) {
      throw new Error(`ACL o tenant inseguro en ${table.tableName}`);
    }
  }
  const columnMap = new Map((evidence?.columns || []).map((column) => [
    `${column.tableName}.${column.columnName}`, column,
  ]));
  const expectedColumns = [
    ['payroll_novelty_row.amount_cents', 'bigint', false],
    ['payroll_novelty_row.quantity', 'numeric', false],
    ['payroll_novelty_batch.grh_mutation', 'boolean', true],
    ['payroll_novelty_batch.payroll_calculated', 'boolean', true],
    ['payroll_novelty_batch.payroll_posted', 'boolean', true],
    ['payroll_novelty_event.grh_mutation', 'boolean', true],
    ['payroll_novelty_event.payroll_calculated', 'boolean', true],
    ['payroll_novelty_event.payroll_posted', 'boolean', true],
  ];
  for (const [key, dataType, notNull] of expectedColumns) {
    const column = columnMap.get(key);
    if (!column || column.dataType !== dataType || column.notNull !== notNull) {
      throw new Error(`columna critica 026 fuera de contrato: ${key}`);
    }
  }
  exactSet((evidence?.functions || []).map((fn) => fn.signature),
    PAYROLL_NOVELTY_FUNCTIONS, 'funciones 026');
  for (const fn of evidence?.functions || []) {
    const runtimeExpected = PAYROLL_NOVELTY_RUNTIME_FUNCTIONS.includes(fn.signature);
    if (fn.ownerName !== owner || fn.securityDefiner !== true
        || fn.publicExecuteRevoked !== true || fn.fixedSearchPath !== true
        || fn.runtimeExecute !== runtimeExpected) {
      throw new Error(`funcion insegura 026 ${fn.signature}`);
    }
  }
  exactSet((evidence?.triggers || []).map((row) => row.name),
    PAYROLL_NOVELTY_TRIGGERS, 'triggers 026');
  exactSet((evidence?.capabilities || []).map((row) => row.capabilityKey),
    PAYROLL_NOVELTY_CAPABILITIES, 'capacidades 026');
  if (evidence?.requiredConflict !== true || (evidence?.roleConflicts || []).length) {
    throw new Error('separacion de funciones 026 incumplida');
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
  `, [PAYROLL_NOVELTY_TABLES, RUNTIME_ROLE]);
  const columns = await client.query(`
    SELECT table_name AS "tableName", column_name AS "columnName",
      data_type AS "dataType", is_nullable = 'NO' AS "notNull"
    FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
  `, [PAYROLL_NOVELTY_TABLES]);
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
      AND function_row.proname LIKE 'payroll_novelty_%_v1'
    ORDER BY signature
  `, [RUNTIME_ROLE]);
  const triggers = await client.query(`
    SELECT trigger.tgname AS name FROM pg_trigger trigger
    JOIN pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND NOT trigger.tgisinternal
      AND relation.relname = ANY($1::text[]) ORDER BY trigger.tgname
  `, [PAYROLL_NOVELTY_TABLES]);
  const capabilities = await client.query(`
    SELECT capability_key AS "capabilityKey" FROM public.iam_capability
    WHERE capability_key = ANY($1::varchar[]) ORDER BY capability_key
  `, [PAYROLL_NOVELTY_CAPABILITIES]);
  const requiredConflict = await client.query(`
    SELECT EXISTS (SELECT 1 FROM public.iam_capability_conflict
      WHERE capability_key = 'payroll.novelty.approve'
        AND conflicts_with_key = 'payroll.novelty.prepare') AS present
  `);
  const roleConflicts = await client.query(`
    SELECT left_grant.role_key AS "roleKey" FROM public.iam_capability_conflict conflict
    JOIN public.iam_role_capability left_grant
      ON left_grant.capability_key = conflict.capability_key
    JOIN public.iam_role_capability right_grant ON right_grant.role_key = left_grant.role_key
      AND right_grant.capability_key = conflict.conflicts_with_key
    WHERE conflict.capability_key = 'payroll.novelty.approve'
      AND conflict.conflicts_with_key = 'payroll.novelty.prepare'
  `);
  return {
    currentUser,
    tables: rows(tables),
    columns: rows(columns),
    functions: rows(functions),
    triggers: rows(triggers),
    capabilities: rows(capabilities),
    requiredConflict: rows(requiredConflict)[0]?.present === true,
    roleConflicts: rows(roleConflicts),
  };
}

export async function verifyPayrollNoveltyFinalState(client) {
  validatePayrollNoveltyEvidence(await collectEvidence(client));
  return true;
}

export function resolvePayrollNoveltyTarget(argv = process.argv, env = process.env) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_NOVELTY',
    targetLabel: '026',
  });
}

export async function verifyPayrollNoveltyConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '026');
}

async function verifyPrerequisites(client) {
  for (const [version, url] of PREREQUISITES) {
    const checksum = payrollNoveltyFingerprint(await readFile(url, 'utf8'));
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
        AND function_row.proname LIKE 'payroll_novelty_%_v1') AS present
  `, [PAYROLL_NOVELTY_TABLES]);
  if (rows(result)[0]?.present === true) throw new Error('objetos 026 presentes sin ledger');
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validatePayrollNoveltyMigrationSql(migration);
  const checksum = payrollNoveltyFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolvePayrollNoveltyTarget(process.argv.slice(2), process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyPayrollNoveltyConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:payroll-novelty-026'))",
    );
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PAYROLL_NOVELTY_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${PAYROLL_NOVELTY_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredObjects(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PAYROLL_NOVELTY_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PAYROLL_NOVELTY_MIGRATION_VERSION, checksum],
      );
    }
    await verifyPayrollNoveltyFinalState(client);
    await client.query('COMMIT');
    console.log(`${PAYROLL_NOVELTY_MIGRATION_VERSION}: ${existing.rowCount
      ? 'reapply con ledger y evidencia verificados'
      : 'fresh apply'} (${target.mode}, SHA-256 ${checksum})`);
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
