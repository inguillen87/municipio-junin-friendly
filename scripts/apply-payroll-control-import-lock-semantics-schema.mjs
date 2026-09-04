import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  OWNER_TENANT_AUTHORITY_MIGRATION_VERSION,
  ownerTenantAuthorityFingerprint,
} from './apply-owner-tenant-operational-authority-schema.mjs';
import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION =
  '037-payroll-control-import-lock-semantics';
export const PAYROLL_CONTROL_IMPORT_CONTEXT_SIGNATURE =
  'public.payroll_control_import_assert_context_v1(jsonb,text)';

const MIGRATION_URL = new URL(
  './migrations/037-payroll-control-import-lock-semantics.sql', import.meta.url,
);
const PREREQUISITE_URL = new URL(
  './migrations/036-owner-tenant-operational-authority.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

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

function assertContextContract(sourceBody, label) {
  requireTokens(label, sourceBody, [
    'FOR SHARE NOWAIT',
    'EXCEPTION WHEN lock_not_available THEN',
    "RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_BUSY' USING ERRCODE = 'P0001'",
    "WHERE effective.capability_key LIKE 'payroll.control_import.%'",
    "WHERE effective.capability_key = 'payroll.art_report.generate'",
    "'capabilities', capabilities",
    "'reportCapabilities', report_capabilities",
  ]);
  if (/WHERE\s+effective\.capability_key\s+LIKE\s+'payroll\.%'/i.test(sourceBody)
      || /'reportCapabilities'\s*,\s*capabilities/i.test(sourceBody)) {
    throw new Error(`${label} mezcla capacidades de importacion y reportes`);
  }
}

export function payrollControlImportLockSemanticsFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validatePayrollControlImportLockSemanticsMigrationSql(sql) {
  const source = String(sql || '');
  for (const token of [
    'PAYROLL_CONTROL_IMPORT_LOCK_037_PREREQUISITE_DRIFT',
    'PAYROLL_CONTROL_IMPORT_LOCK_037_REPORT_CHANNEL_DRIFT',
    'PAYROLL_CONTROL_IMPORT_LOCK_037_FINAL_DRIFT',
    'CREATE OR REPLACE FUNCTION public.payroll_control_import_assert_context_v1',
    'REVOKE ALL ON FUNCTION public.payroll_control_import_assert_context_v1(jsonb,text) FROM PUBLIC',
    'REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_assert_context_v1(jsonb,text)',
    'FROM municontrol_actions_runtime_app',
  ]) {
    if (!source.includes(token)) throw new Error(`migracion 037 no contiene ${token}`);
  }
  const functionBody = source.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.payroll_control_import_assert_context_v1[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$\s*;/i,
  )?.[1];
  if (!functionBody) throw new Error('migracion 037 no contiene la funcion objetivo');
  assertContextContract(functionBody, 'funcion 037');
  if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?(?:employment_contract|payroll_run|payroll_monthly_fact|payroll_control_import_batch|payroll_control_import_row|payroll_control_import_event|source_import_batch)\b/i
    .test(source)) {
    throw new Error('migracion 037 intenta mutar datos laborales o lotes');
  }
  if (/\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|SCHEMA|DATABASE|TABLE)\b/i.test(source)
      || /\b(?:password_hash|mfa_secret|otp_code|recovery_code)\b/i.test(source)
      || /(?:guillen|gmail\.com|marcelo@|hugo@|admin@)/i.test(source)) {
    throw new Error('migracion 037 amplia infraestructura, identidades o secretos');
  }
  if (splitPostgresStatements(source).length !== 6) {
    throw new Error('migracion 037 incompleta o no segmentable');
  }
  return true;
}

export function validatePayrollControlImportLockSemanticsEvidence(evidence) {
  const fn = evidence?.function;
  if (!fn || fn.signature !== PAYROLL_CONTROL_IMPORT_CONTEXT_SIGNATURE
      || fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
      || fn.ownerIsRuntime !== false || fn.publicExecuteRevoked !== true
      || fn.runtimeCanExecute !== false || fn.runtimeExecuteGrantable !== false
      || JSON.stringify(fn.config || []) !== JSON.stringify(['search_path=public, pg_temp'])
      || fn.volatility !== 'v'
      || JSON.stringify(fn.nonOwnerExecuteGrantees || []) !== JSON.stringify([])) {
    throw new Error('funcion 037 insegura o fuera de ACL');
  }
  assertContextContract(fn.sourceBody, 'evidencia 037');
  return true;
}

export function resolvePayrollControlImportLockSemanticsTarget(
  argv = process.argv, env = process.env,
) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS',
    targetLabel: '037',
  });
}

export async function verifyPayrollControlImportLockSemanticsConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '037');
}

async function collectEvidence(client) {
  const result = await client.query(`
    SELECT format('%I.%I(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner_row.rolname = $1 AS "ownerIsRuntime",
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
        SELECT role_row.rolname
        FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl
        JOIN pg_roles role_row ON role_row.oid = acl.grantee
        WHERE acl.privilege_type = 'EXECUTE'
          AND role_row.rolname <> owner_row.rolname
        ORDER BY role_row.rolname
      )) AS "nonOwnerExecuteGrantees"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner_row ON owner_row.oid = function_row.proowner
    WHERE function_row.oid = $2::regprocedure
  `, [RUNTIME_ROLE, PAYROLL_CONTROL_IMPORT_CONTEXT_SIGNATURE]);
  return { function: rows(result)[0] };
}

export async function verifyPayrollControlImportLockSemanticsFinalState(client) {
  return validatePayrollControlImportLockSemanticsEvidence(await collectEvidence(client));
}

async function verifyPrerequisite(client) {
  const expected = ownerTenantAuthorityFingerprint(await readFile(PREREQUISITE_URL, 'utf8'));
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [OWNER_TENANT_AUTHORITY_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${OWNER_TENANT_AUTHORITY_MIGRATION_VERSION}`);
  }
}

async function verifyNoUnledgeredState(client) {
  const result = await client.query(
    'SELECT pg_get_functiondef($1::regprocedure) AS source',
    [PAYROLL_CONTROL_IMPORT_CONTEXT_SIGNATURE],
  );
  const source = String(rows(result)[0]?.source || '');
  if (!source.includes('reportCapabilities')) {
    throw new Error('estado 036 requerido no esta presente');
  }
  if (normalized(source).includes(normalized(
    "EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_BUSY'",
  ))) {
    throw new Error('estado 037 presente sin ledger');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validatePayrollControlImportLockSemanticsMigrationSql(migration);
  const checksum = payrollControlImportLockSemanticsFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolvePayrollControlImportLockSemanticsTarget(
    process.argv.slice(2), process.env,
  );
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyPayrollControlImportLockSemanticsConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:payroll-control-import-lock-semantics-037'))",
    );
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredState(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION, checksum],
      );
    }
    await verifyPayrollControlImportLockSemanticsFinalState(client);
    await client.query('COMMIT');
    console.log(`${PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION}: ${existing.rowCount
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
