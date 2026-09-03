import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_NOVELTY_FIRST_FORTNIGHT_FUNCTIONS,
  PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION,
  PAYROLL_NOVELTY_FIRST_FORTNIGHT_TYPES,
  payrollNoveltyFirstFortnightFingerprint,
  resolvePayrollNoveltyFirstFortnightTarget,
  validatePayrollNoveltyFirstFortnightEvidence,
  validatePayrollNoveltyFirstFortnightMigrationSql,
} from '../scripts/apply-payroll-novelty-first-fortnight-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration026 = await readFile(new URL(
  '../scripts/migrations/026-governed-payroll-novelties.sql', import.meta.url,
), 'utf8');
const migration029 = await readFile(new URL(
  '../scripts/migrations/029-payroll-novelty-first-fortnight.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-payroll-novelty-first-fortnight-schema.mjs', import.meta.url,
), 'utf8');

const NEW_TYPES =
  "'monthly','first_fortnight','sac','vacation','supplementary','final','other'";

function evidence(overrides = {}) {
  return {
    constraint: {
      name: 'payroll_novelty_batch_payroll_type_ck',
      definition: `CHECK (payroll_type IN (${PAYROLL_NOVELTY_FIRST_FORTNIGHT_TYPES
        .map((value) => `'${value}'`).join(',')}))`,
      validated: true,
    },
    functions: PAYROLL_NOVELTY_FIRST_FORTNIGHT_FUNCTIONS.map((signature) => ({
      signature,
      definition: `CREATE OR REPLACE FUNCTION ${signature} RETURNS jsonb AS `
        + `$$ BEGIN PERFORM ${NEW_TYPES}; RETURN '{}'::jsonb; END $$ LANGUAGE plpgsql`,
      securityDefiner: true,
      ownedByCurrentUser: true,
      ownerIsRuntime: false,
      publicExecuteRevoked: true,
      runtimeCanExecute: true,
      config: ['search_path=public, pg_temp'],
    })),
    ...overrides,
  };
}

test('026 conserva su contrato aplicado y 029 agrega primera quincena incrementalmente', () => {
  assert.match(migration026,
    /payroll_type IN \('monthly','sac','vacation','supplementary','final','other'\)/);
  assert.doesNotMatch(migration026, /first_fortnight/);
  assert.equal(
    PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION,
    '029-payroll-novelty-first-fortnight',
  );
  assert.equal(validatePayrollNoveltyFirstFortnightMigrationSql(migration029), true);
  assert.equal(splitPostgresStatements(migration029).length, 7);
  assert.match(payrollNoveltyFirstFortnightFingerprint(migration029), /^[a-f0-9]{64}$/);
  assert.match(migration029, new RegExp(NEW_TYPES));
  assert.match(migration029, /pg_get_functiondef\(function_signature\)/);
  assert.match(migration029, /occurrence_count <> 1/);
  assert.match(migration029, /EXECUTE patched_definition/);
});

test('validador 029 rechaza drift, DML o ampliación de privilegios', () => {
  assert.throws(() => validatePayrollNoveltyFirstFortnightMigrationSql(
    migration029.replace('first_fortnight', 'first_half'),
  ), /migracion 029/);
  assert.throws(() => validatePayrollNoveltyFirstFortnightMigrationSql(
    `${migration029}\nUPDATE public.payroll_novelty_batch SET payroll_type = 'monthly';`,
  ), /amplia mutaciones/);
  assert.throws(() => validatePayrollNoveltyFirstFortnightMigrationSql(
    `${migration029}\nGRANT SELECT ON public.payroll_novelty_batch TO PUBLIC;`,
  ), /amplia mutaciones/);
});

test('evidencia 029 exige CHECK exacto y conserva las dos fachadas seguras', () => {
  assert.equal(validatePayrollNoveltyFirstFortnightEvidence(evidence()), true);
  const missingType = evidence();
  missingType.constraint.definition = missingType.constraint.definition
    .replace("'first_fortnight',", '');
  assert.throws(
    () => validatePayrollNoveltyFirstFortnightEvidence(missingType),
    /tipos de liquidacion/,
  );
  const unsafeFunction = evidence();
  unsafeFunction.functions[0].publicExecuteRevoked = false;
  assert.throws(
    () => validatePayrollNoveltyFirstFortnightEvidence(unsafeFunction),
    /funcion 029 insegura/,
  );
});

test('applier 029 es ledgered, transaccional, pinned y depende del checksum 026', () => {
  for (const pattern of [
    /026-governed-payroll-novelties\.sql/,
    /payrollNoveltyFingerprint/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /verifyNoUnledgeredState\(client\)/,
    /resolvePinnedNeonTarget/,
    /verifyPinnedNeonConnectedTarget/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /verifyPayrollNoveltyFirstFortnightFinalState\(client\)/,
  ]) assert.match(applier, pattern);
  assert.doesNotMatch(applier,
    /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
});

test('target 029 requiere pines propios y distingue QA de Producción', () => {
  const host = 'ep-fortnight.sa-east-1.aws.neon.tech';
  const base = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    PAYROLL_NOVELTY_FIRST_FORTNIGHT_EXPECTED_NEON_BRANCH_ID: 'br-fortnight',
    PAYROLL_NOVELTY_FIRST_FORTNIGHT_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_NOVELTY_FIRST_FORTNIGHT_EXPECTED_NEON_HOST: host,
    PAYROLL_NOVELTY_FIRST_FORTNIGHT_EXPECTED_DATABASE: 'municontrol',
  };
  assert.equal(resolvePayrollNoveltyFirstFortnightTarget(
    ['--confirm-isolated-branch'], base,
  ).mode, 'isolated');
  assert.equal(resolvePayrollNoveltyFirstFortnightTarget(
    ['--confirm-production-branch=br-fortnight'], {
      ...base,
      CANONICAL_PRODUCTION_BRANCH_ID: 'br-fortnight',
      CANONICAL_PRODUCTION_HOST: host,
      CANONICAL_PRODUCTION_DATABASE: 'municontrol',
      VERCEL_ENV: 'production',
    },
  ).mode, 'production');
});

test('package y despliegue incluyen el aplicador y SQL 029', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:payroll:novelty:first-fortnight:schema'],
    'node --env-file=.env.local scripts/apply-payroll-novelty-first-fortnight-schema.mjs --confirm-isolated-branch');
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/029-payroll-novelty-first-fortnight\.sql/);
});
