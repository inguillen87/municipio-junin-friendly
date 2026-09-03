import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  PAYROLL_NOVELTY_MIGRATION_VERSION,
  payrollNoveltyFingerprint,
} from './apply-governed-payroll-novelties-schema.mjs';
import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION =
  '029-payroll-novelty-first-fortnight';
export const PAYROLL_NOVELTY_FIRST_FORTNIGHT_TYPES = Object.freeze([
  'monthly',
  'first_fortnight',
  'sac',
  'vacation',
  'supplementary',
  'final',
  'other',
]);
export const PAYROLL_NOVELTY_FIRST_FORTNIGHT_FUNCTIONS = Object.freeze([
  'public.payroll_novelty_bootstrap_v1(jsonb)',
  'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)',
]);

const PREVIOUS_TYPES = Object.freeze([
  'monthly', 'sac', 'vacation', 'supplementary', 'final', 'other',
]);
const OLD_FRAGMENT = "'monthly','sac','vacation','supplementary','final','other'";
const NEW_FRAGMENT =
  "'monthly','first_fortnight','sac','vacation','supplementary','final','other'";
const MIGRATION_URL = new URL(
  './migrations/029-payroll-novelty-first-fortnight.sql', import.meta.url,
);
const PREREQUISITE_URL = new URL(
  './migrations/026-governed-payroll-novelties.sql', import.meta.url,
);
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

function constraintTypes(definition) {
  return [...String(definition || '').matchAll(/'([a-z][a-z0-9_]*)'/g)]
    .map((match) => match[1]);
}

export function payrollNoveltyFirstFortnightFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validatePayrollNoveltyFirstFortnightMigrationSql(sql) {
  const source = String(sql || '');
  for (const token of [
    'DROP CONSTRAINT payroll_novelty_batch_payroll_type_ck',
    'ADD CONSTRAINT payroll_novelty_batch_payroll_type_ck CHECK',
    NEW_FRAGMENT,
    'pg_get_functiondef(function_signature)',
    'occurrence_count <> 1',
    'EXECUTE patched_definition',
    'public.payroll_novelty_bootstrap_v1(jsonb)',
    'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)',
    'PAYROLL_NOVELTY_FIRST_FORTNIGHT_FUNCTION_DRIFT',
  ]) {
    if (!source.includes(token)) throw new Error(`migracion 029 no contiene ${token}`);
  }
  if (!source.includes(OLD_FRAGMENT.replaceAll("'", "''"))) {
    throw new Error('migracion 029 no fija el contrato previo de tipos');
  }
  if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\b/i.test(source)
      || /\b(?:GRANT|REVOKE)\b/i.test(source)
      || /\bCREATE\s+TABLE\b/i.test(source)) {
    throw new Error('migracion 029 amplia mutaciones, objetos o privilegios');
  }
  if (splitPostgresStatements(source).length !== 7) {
    throw new Error('migracion 029 incompleta o no segmentable');
  }
  return true;
}

export function validatePayrollNoveltyFirstFortnightEvidence(evidence) {
  const constraint = evidence?.constraint || {};
  if (constraint.name !== 'payroll_novelty_batch_payroll_type_ck'
      || constraint.validated !== true
      || !String(constraint.definition || '').includes('payroll_type')) {
    throw new Error('CHECK de tipos 029 fuera de contrato');
  }
  exactSet(
    constraintTypes(constraint.definition),
    PAYROLL_NOVELTY_FIRST_FORTNIGHT_TYPES,
    'tipos de liquidacion 029',
  );

  exactSet(
    (evidence?.functions || []).map((item) => item.signature),
    PAYROLL_NOVELTY_FIRST_FORTNIGHT_FUNCTIONS,
    'funciones actualizadas 029',
  );
  for (const fn of evidence?.functions || []) {
    if (fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
        || fn.ownerIsRuntime !== false || fn.publicExecuteRevoked !== true
        || fn.runtimeCanExecute !== true
        || JSON.stringify(fn.config || []) !== JSON.stringify(['search_path=public, pg_temp'])
        || !String(fn.definition || '').includes(NEW_FRAGMENT)
        || String(fn.definition || '').includes(OLD_FRAGMENT)) {
      throw new Error(`funcion 029 insegura o fuera de contrato: ${fn.signature || 'desconocida'}`);
    }
  }
  return true;
}

export function resolvePayrollNoveltyFirstFortnightTarget(
  argv = process.argv,
  env = process.env,
) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_NOVELTY_FIRST_FORTNIGHT',
    targetLabel: '029',
  });
}

export async function verifyPayrollNoveltyFirstFortnightConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '029');
}

async function collectEvidence(client) {
  const constraint = await client.query(`
    SELECT constraint_row.conname AS name,
      pg_get_constraintdef(constraint_row.oid) AS definition,
      constraint_row.convalidated AS validated
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.payroll_novelty_batch'::regclass
      AND constraint_row.conname = 'payroll_novelty_batch_payroll_type_ck'
  `);
  const functions = await client.query(`
    SELECT format('%I.%I(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      pg_get_functiondef(function_row.oid) AS definition,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner_row.rolname = $1 AS "ownerIsRuntime",
      COALESCE(function_row.proconfig, ARRAY[]::text[]) AS config,
      NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS "publicExecuteRevoked",
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS "runtimeCanExecute"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner_row ON owner_row.oid = function_row.proowner
    WHERE function_row.oid IN ($2::regprocedure, $3::regprocedure)
    ORDER BY signature
  `, [RUNTIME_ROLE, ...PAYROLL_NOVELTY_FIRST_FORTNIGHT_FUNCTIONS]);
  return {
    constraint: rows(constraint)[0],
    functions: rows(functions),
  };
}

export async function verifyPayrollNoveltyFirstFortnightFinalState(client) {
  return validatePayrollNoveltyFirstFortnightEvidence(await collectEvidence(client));
}

async function verifyPrerequisite(client) {
  const source = await readFile(PREREQUISITE_URL, 'utf8');
  const expected = payrollNoveltyFingerprint(source);
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [PAYROLL_NOVELTY_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${PAYROLL_NOVELTY_MIGRATION_VERSION}`);
  }
}

async function verifyNoUnledgeredState(client) {
  const evidence = await collectEvidence(client);
  if (!evidence.constraint
      || (evidence.functions || []).length
        !== PAYROLL_NOVELTY_FIRST_FORTNIGHT_FUNCTIONS.length) {
    throw new Error('prerequisito 026 incompleto para 029');
  }
  const definitions = (evidence.functions || []).map((fn) => String(fn.definition || ''));
  const types = constraintTypes(evidence.constraint.definition);
  if (types.includes('first_fortnight')
      || definitions.some((definition) => definition.includes('first_fortnight'))) {
    throw new Error('estado 029 presente sin ledger');
  }
  exactSet(types, PREVIOUS_TYPES, 'tipos previos 026');
  if (definitions.some((definition) => !definition.includes(OLD_FRAGMENT))) {
    throw new Error('funciones 026 con drift antes de 029');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validatePayrollNoveltyFirstFortnightMigrationSql(migration);
  const checksum = payrollNoveltyFirstFortnightFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolvePayrollNoveltyFirstFortnightTarget(
    process.argv.slice(2), process.env,
  );
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyPayrollNoveltyFirstFortnightConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:payroll-novelty-first-fortnight-029'))",
    );
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredState(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION, checksum],
      );
    }
    await verifyPayrollNoveltyFirstFortnightFinalState(client);
    await client.query('COMMIT');
    console.log(`${PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION}: ${existing.rowCount
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
