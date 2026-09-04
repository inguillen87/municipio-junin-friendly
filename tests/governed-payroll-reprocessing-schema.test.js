import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_REPROCESSING_MIGRATION_VERSION,
  PAYROLL_REPROCESSING_ROLE_MATRIX,
  PAYROLL_REPROCESSING_RUNTIME_SIGNATURES,
  PAYROLL_REPROCESSING_SIGNATURES,
  PAYROLL_REPROCESSING_TABLES,
  PAYROLL_REPROCESSING_TRIGGERS,
  payrollReprocessingFingerprint,
  resolvePayrollReprocessingTarget,
  validatePayrollReprocessingEvidence,
  validatePayrollReprocessingMigrationSql,
} from '../scripts/apply-governed-payroll-reprocessing-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/035-governed-payroll-reprocessing.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-governed-payroll-reprocessing-schema.mjs', import.meta.url,
), 'utf8');

test('035 es aditiva, segmentable y no ejecuta anulación ni reliquidación', () => {
  assert.equal(PAYROLL_REPROCESSING_MIGRATION_VERSION,
    '035-governed-payroll-reprocessing');
  assert.equal(validatePayrollReprocessingMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 61);
  assert.match(payrollReprocessingFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.match(migration, /external_execution_authorization_only/);
  assert.match(migration, /grh_mutation IS FALSE/);
  assert.match(migration, /payroll_voided IS FALSE/);
  assert.match(migration, /payroll_calculated IS FALSE/);
  assert.match(migration, /payroll_posted IS FALSE/);
  assert.doesNotMatch(migration,
    /\b(?:UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?payroll_run\b/i);
});

test('035 separa preparador y aprobador con motivo, versión e idempotencia', () => {
  assert.deepEqual(PAYROLL_REPROCESSING_ROLE_MATRIX, {
    CONSULTA_INTEGRAL: ['payroll.reprocessing.read'],
    HUGO_APROBADOR_INTEGRAL: [
      'payroll.reprocessing.approve',
      'payroll.reprocessing.audit.read',
      'payroll.reprocessing.read',
    ],
    PLATFORM_OWNER_OPERATIVO_INTEGRAL: [
      'payroll.reprocessing.audit.read',
      'payroll.reprocessing.prepare',
      'payroll.reprocessing.read',
    ],
  });
  for (const token of [
    'payroll_reprocessing_case_maker_checker_ck',
    'PAYROLL_REPROCESSING_MAKER_CHECKER_REQUIRED',
    'PAYROLL_REPROCESSING_IDEMPOTENCY_REUSE',
    'PAYROLL_REPROCESSING_VERSION_CONFLICT',
    'p_reason_reference',
    'p_expected_version',
    'p_idempotency',
  ]) assert.match(migration, new RegExp(token));
});

test('superficie instalada queda en dos tablas privadas y cinco fachadas runtime', () => {
  assert.deepEqual(PAYROLL_REPROCESSING_TABLES, [
    'payroll_reprocessing_case', 'payroll_reprocessing_event',
  ]);
  assert.equal(Object.keys(PAYROLL_REPROCESSING_SIGNATURES).length, 11);
  assert.equal(PAYROLL_REPROCESSING_RUNTIME_SIGNATURES.length, 5);
  assert.equal(Object.keys(PAYROLL_REPROCESSING_TRIGGERS).length, 3);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE[\s\S]*FROM municontrol_actions_runtime_app/);
  assert.throws(() => validatePayrollReprocessingEvidence({ tables: [] }),
    /tablas privadas 035 fuera de contrato/);
});

test('aplicador exige ledger, prerequisitos, transacción, lock y verificación final', () => {
  for (const pattern of [
    /002-canonical-integration\.sql/,
    /007-action-center-read-facades\.sql/,
    /019-institutional-access-profiles\.sql/,
    /021-platform-owner-operational-integral\.sql/,
    /034-payroll-control-import-binding-lock\.sql/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /verifyNoUnledgeredState\(client\)/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /verifyPayrollReprocessingFinalState\(client\)/,
  ]) assert.match(applier, pattern);
  assert.doesNotMatch(applier,
    /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
});

test('target 035 exige pines independientes para QA y Producción', () => {
  const host = 'ep-reprocessing.sa-east-1.aws.neon.tech';
  const base = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    PAYROLL_REPROCESSING_EXPECTED_NEON_BRANCH_ID: 'br-reprocessing',
    PAYROLL_REPROCESSING_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_REPROCESSING_EXPECTED_NEON_HOST: host,
    PAYROLL_REPROCESSING_EXPECTED_DATABASE: 'municontrol',
  };
  assert.equal(resolvePayrollReprocessingTarget(['--confirm-isolated-branch'], base).mode,
    'isolated');
  assert.equal(resolvePayrollReprocessingTarget(
    ['--confirm-production-branch=br-reprocessing'],
    {
      ...base,
      CANONICAL_PRODUCTION_BRANCH_ID: 'br-reprocessing',
      CANONICAL_PRODUCTION_HOST: host,
      CANONICAL_PRODUCTION_DATABASE: 'municontrol',
      VERCEL_ENV: 'production',
    },
  ).mode, 'production');
});

test('package, release y Vercel incluyen el aplicador y SQL 035', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:payroll:reprocessing:schema'],
    'node --env-file=.env.local scripts/apply-governed-payroll-reprocessing-schema.mjs --confirm-isolated-branch');
  const release = await readFile(new URL(
    '../scripts/apply-governed-payroll-operations-release-schema.mjs', import.meta.url,
  ), 'utf8');
  assert.match(release, /035-governed-payroll-reprocessing/);
  assert.match(release, /envPrefix: 'PAYROLL_REPROCESSING'/);
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/035-governed-payroll-reprocessing\.sql/);
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  assert.match(vercel, /"api\/internal-payroll-reprocessing\.js": \{ "maxDuration": 20 \}/);
});
