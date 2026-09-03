import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  PAYROLL_CONTROL_IMPORT_MIGRATION_VERSION,
  payrollControlImportFingerprint,
} from './apply-governed-payroll-control-import-schema.mjs';
import {
  PAYROLL_ART_REPORT_CAPABILITY_MIGRATION_VERSION,
  payrollArtReportCapabilityFingerprint,
} from './apply-payroll-art-report-capability-schema.mjs';
import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const PAYROLL_CONTROL_IMPORT_BINDING_MIGRATION_VERSION =
  '034-payroll-control-import-binding-lock';
export const PAYROLL_CONTROL_IMPORT_OLD_PREPARE_SIGNATURE =
  'public.payroll_control_import_prepare_v1(jsonb,text,date,text,text,text,integer,jsonb,uuid,text)';
export const PAYROLL_CONTROL_IMPORT_LOCKED_PREPARE_SIGNATURE =
  'public.payroll_control_import_prepare_locked_v1(jsonb,text,date,text,text,text,integer,jsonb,uuid,text)';
export const PAYROLL_CONTROL_IMPORT_BOUND_PREPARE_SIGNATURE =
  'public.payroll_control_import_prepare_v1(jsonb,uuid,text,date,text,text,text,integer,jsonb,uuid,text)';

const MIGRATION_URL = new URL(
  './migrations/034-payroll-control-import-binding-lock.sql', import.meta.url,
);
const PREREQUISITES = Object.freeze([
  Object.freeze({
    version: PAYROLL_CONTROL_IMPORT_MIGRATION_VERSION,
    url: new URL('./migrations/025-governed-payroll-control-import.sql', import.meta.url),
    fingerprint: payrollControlImportFingerprint,
  }),
  Object.freeze({
    version: PAYROLL_ART_REPORT_CAPABILITY_MIGRATION_VERSION,
    url: new URL('./migrations/033-payroll-art-report-capability.sql', import.meta.url),
    fingerprint: payrollArtReportCapabilityFingerprint,
  }),
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

export function payrollControlImportBindingFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validatePayrollControlImportBindingMigrationSql(sql) {
  const source = String(sql || '');
  for (const token of [
    'ALTER FUNCTION public.payroll_control_import_prepare_v1(',
    'RENAME TO payroll_control_import_prepare_locked_v1',
    'CREATE OR REPLACE FUNCTION public.payroll_control_import_prepare_v1(',
    'p_expected_binding_id uuid',
    "context_value := public.payroll_control_import_assert_context_v1(",
    "p_expected_binding_id <> (context_value->>'certifiedBindingId')::uuid",
    'PAYROLL_CONTROL_IMPORT_BINDING_CHANGED',
    'RETURN public.payroll_control_import_prepare_locked_v1(',
    'REVOKE ALL ON FUNCTION public.payroll_control_import_prepare_locked_v1(',
    'REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_prepare_locked_v1(',
    'REVOKE ALL ON FUNCTION public.payroll_control_import_prepare_v1(',
    'GRANT EXECUTE ON FUNCTION public.payroll_control_import_prepare_v1(',
    'TO municontrol_actions_runtime_app',
    'PAYROLL_CONTROL_IMPORT_034_OLD_FACADE_REMAINS',
  ]) {
    if (!source.includes(token)) throw new Error(`migracion 034 no contiene ${token}`);
  }
  if (source.indexOf('context_value := public.payroll_control_import_assert_context_v1(')
      > source.indexOf("p_expected_binding_id <> (context_value->>'certifiedBindingId')::uuid")) {
    throw new Error('migracion 034 compara el binding antes de tomar locks de contexto');
  }
  const grants = [...source.matchAll(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)\(/gi,
  )].map((match) => match[1]);
  exactSet(grants, ['payroll_control_import_prepare_v1'], 'grants runtime 034');
  if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?(?:employment_contract|payroll_run|payroll_monthly_fact|payroll_control_import_batch|payroll_control_import_row|payroll_control_import_event|source_import_batch)\b/i
    .test(source)) {
    throw new Error('migracion 034 intenta mutar datos laborales o lotes fuera de la fachada');
  }
  if (splitPostgresStatements(source).length !== 10) {
    throw new Error('migracion 034 incompleta o no segmentable');
  }
  return true;
}

export function validatePayrollControlImportBindingEvidence(evidence) {
  if (evidence?.oldSignatureExists !== false) {
    throw new Error('fachada 025 anterior todavia es invocable');
  }
  const functions = Object.fromEntries(
    (evidence?.functions || []).map((item) => [item.signature, item]),
  );
  exactSet(Object.keys(functions), [
    PAYROLL_CONTROL_IMPORT_LOCKED_PREPARE_SIGNATURE,
    PAYROLL_CONTROL_IMPORT_BOUND_PREPARE_SIGNATURE,
  ], 'funciones prepare 034');

  for (const signature of Object.keys(functions)) {
    const fn = functions[signature];
    if (fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
        || fn.ownerIsRuntime !== false || fn.publicExecuteRevoked !== true
        || fn.runtimeExecuteGrantable !== false
        || JSON.stringify(fn.config || []) !== JSON.stringify(['search_path=public, pg_temp'])
        || fn.volatility !== 'v') {
      throw new Error(`funcion 034 insegura: ${signature}`);
    }
  }

  const locked = functions[PAYROLL_CONTROL_IMPORT_LOCKED_PREPARE_SIGNATURE];
  const bound = functions[PAYROLL_CONTROL_IMPORT_BOUND_PREPARE_SIGNATURE];
  if (locked.runtimeCanExecute !== false
      || JSON.stringify(locked.nonOwnerExecuteGrantees || []) !== JSON.stringify([])) {
    throw new Error('implementacion interna 025 expuesta fuera del owner');
  }
  if (bound.runtimeCanExecute !== true
      || JSON.stringify(bound.nonOwnerExecuteGrantees || [])
        !== JSON.stringify([RUNTIME_ROLE])) {
    throw new Error('fachada bound 034 fuera del allowlist execute-only');
  }
  requireTokens('implementacion interna 025', locked.sourceBody, [
    'payroll_control_import_assert_context_v1',
    'pg_advisory_xact_lock',
    'payroll_control_import_batch',
    'payroll_control_import_event',
    'PAYROLL_CONTROL_IMPORT_IDEMPOTENCY_REUSE',
  ]);
  requireTokens('fachada bound 034', bound.sourceBody, [
    'p_expected_binding_id',
    'payroll_control_import_assert_context_v1',
    "certifiedBindingId",
    'PAYROLL_CONTROL_IMPORT_BINDING_CHANGED',
    'payroll_control_import_prepare_locked_v1',
  ]);
  const body = normalized(bound.sourceBody);
  if (body.indexOf('payroll_control_import_assert_context_v1')
      > body.indexOf('payroll_control_import_binding_changed')) {
    throw new Error('fachada bound 034 no fija el contexto antes de comparar');
  }
  return true;
}

export function resolvePayrollControlImportBindingTarget(
  argv = process.argv, env = process.env,
) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_CONTROL_IMPORT_BINDING',
    targetLabel: '034',
  });
}

export async function verifyPayrollControlImportBindingConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '034');
}

async function collectEvidence(client) {
  const existence = await client.query(
    'SELECT to_regprocedure($1) IS NOT NULL AS "oldSignatureExists"',
    [PAYROLL_CONTROL_IMPORT_OLD_PREPARE_SIGNATURE],
  );
  const functionResult = await client.query(`
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
    WHERE function_row.oid IN ($2::regprocedure, $3::regprocedure)
  `, [
    RUNTIME_ROLE,
    PAYROLL_CONTROL_IMPORT_LOCKED_PREPARE_SIGNATURE,
    PAYROLL_CONTROL_IMPORT_BOUND_PREPARE_SIGNATURE,
  ]);
  return {
    oldSignatureExists: rows(existence)[0]?.oldSignatureExists,
    functions: rows(functionResult),
  };
}

export async function verifyPayrollControlImportBindingFinalState(client) {
  return validatePayrollControlImportBindingEvidence(await collectEvidence(client));
}

async function verifyPrerequisites(client) {
  for (const prerequisite of PREREQUISITES) {
    const source = await readFile(prerequisite.url, 'utf8');
    const expected = prerequisite.fingerprint(source);
    const installed = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [prerequisite.version],
    );
    if (installed.rowCount !== 1
        || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
      throw new Error(`prerequisito ausente o con drift ${prerequisite.version}`);
    }
  }
}

async function verifyNoUnledgeredState(client) {
  const result = await client.query(`
    SELECT
      to_regprocedure($1) IS NOT NULL AS "oldExists",
      to_regprocedure($2) IS NOT NULL AS "lockedExists",
      to_regprocedure($3) IS NOT NULL AS "boundExists"
  `, [
    PAYROLL_CONTROL_IMPORT_OLD_PREPARE_SIGNATURE,
    PAYROLL_CONTROL_IMPORT_LOCKED_PREPARE_SIGNATURE,
    PAYROLL_CONTROL_IMPORT_BOUND_PREPARE_SIGNATURE,
  ]);
  const state = rows(result)[0] || {};
  if (state.oldExists !== true || state.lockedExists !== false || state.boundExists !== false) {
    throw new Error('estado 034 presente o prerrequisito 025 alterado sin ledger');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validatePayrollControlImportBindingMigrationSql(migration);
  const checksum = payrollControlImportBindingFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolvePayrollControlImportBindingTarget(
    process.argv.slice(2), process.env,
  );
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyPayrollControlImportBindingConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:payroll-control-import-binding-034'))",
    );
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PAYROLL_CONTROL_IMPORT_BINDING_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${PAYROLL_CONTROL_IMPORT_BINDING_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredState(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PAYROLL_CONTROL_IMPORT_BINDING_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PAYROLL_CONTROL_IMPORT_BINDING_MIGRATION_VERSION, checksum],
      );
    }
    await verifyPayrollControlImportBindingFinalState(client);
    await client.query('COMMIT');
    console.log(`${PAYROLL_CONTROL_IMPORT_BINDING_MIGRATION_VERSION}: ${existing.rowCount
      ? 'ledger y fachada final verificados' : 'fresh apply'} `
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
