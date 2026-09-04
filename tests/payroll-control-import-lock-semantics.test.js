import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_CONTROL_IMPORT_CONTEXT_SIGNATURE,
  PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION,
  payrollControlImportLockSemanticsFingerprint,
  resolvePayrollControlImportLockSemanticsTarget,
  validatePayrollControlImportLockSemanticsEvidence,
  validatePayrollControlImportLockSemanticsMigrationSql,
} from '../scripts/apply-payroll-control-import-lock-semantics-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migrationsUrl = new URL('../scripts/migrations/', import.meta.url);
const migration = await readFile(new URL(
  '../scripts/migrations/037-payroll-control-import-lock-semantics.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-payroll-control-import-lock-semantics-schema.mjs', import.meta.url,
), 'utf8');

async function latestAssertContextDefinition() {
  const filenames = (await readdir(migrationsUrl))
    .filter((name) => /^\d{3}-.+\.sql$/.test(name))
    .sort();
  let latest;
  for (const filename of filenames) {
    const source = await readFile(new URL(filename, migrationsUrl), 'utf8');
    const matches = [...source.matchAll(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.payroll_control_import_assert_context_v1\s*\([\s\S]*?\)\s*RETURNS\s+jsonb[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$\s*;/gi,
    )];
    if (matches.length) latest = { filename, body: matches.at(-1)[1] };
  }
  return latest;
}

test('la ultima version del contexto de importacion conserva el contrato de sesion ocupada', async () => {
  const latest = await latestAssertContextDefinition();
  assert.ok(latest, 'falta payroll_control_import_assert_context_v1 en las migraciones');
  assert.match(latest.body,
    /EXCEPTION\s+WHEN\s+lock_not_available\s+THEN\s+RAISE\s+EXCEPTION\s+'PAYROLL_CONTROL_IMPORT_SESSION_BUSY'\s+USING\s+ERRCODE\s*=\s*'P0001'/i,
    `${latest.filename} reemplaza assert_context sin traducir lock_not_available`);
});

test('la capa HTTP mantiene 409, Retry-After y mensaje seguro para la sesion ocupada', async () => {
  const library = await readFile(new URL(
    '../lib/internal-payroll-control-import.js', import.meta.url,
  ), 'utf8');
  const api = await readFile(new URL(
    '../api/internal-payroll-control-import.js', import.meta.url,
  ), 'utf8');

  assert.match(library,
    /\['PAYROLL_CONTROL_IMPORT_SESSION_BUSY',\s*409,\s*'El acceso se está actualizando; reintentá en un momento'\]/);
  assert.match(api,
    /safe\.code\s*===\s*'PAYROLL_CONTROL_IMPORT_SESSION_BUSY'[\s\S]*?setHeader\('Retry-After',\s*'1'\)/);
});

test('037 restaura lock_not_available sin mezclar el canal ART', () => {
  assert.equal(PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION,
    '037-payroll-control-import-lock-semantics');
  assert.equal(validatePayrollControlImportLockSemanticsMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 6);
  assert.match(payrollControlImportLockSemanticsFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.match(migration,
    /EXCEPTION WHEN lock_not_available THEN\s+RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_BUSY'/);
  assert.match(migration,
    /WHERE effective\.capability_key = 'payroll\.art_report\.generate'/);
  assert.doesNotMatch(migration,
    /WHERE effective\.capability_key LIKE 'payroll\.%'/);

  const broken = migration.replace(
    "EXCEPTION WHEN lock_not_available THEN\n  RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_BUSY' USING ERRCODE = 'P0001';\n",
    '',
  );
  assert.throws(() => validatePayrollControlImportLockSemanticsMigrationSql(broken),
    /lock_not_available/);
});

test('evidencia 037 exige ACL privada y cuerpo final completo', () => {
  const evidence = {
    function: {
      signature: PAYROLL_CONTROL_IMPORT_CONTEXT_SIGNATURE,
      securityDefiner: true,
      ownedByCurrentUser: true,
      ownerIsRuntime: false,
      volatility: 'v',
      config: ['search_path=public, pg_temp'],
      sourceBody: `FOR SHARE NOWAIT
        WHERE effective.capability_key LIKE 'payroll.control_import.%'
        WHERE effective.capability_key = 'payroll.art_report.generate'
        'capabilities', capabilities, 'reportCapabilities', report_capabilities
        EXCEPTION WHEN lock_not_available THEN
        RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_BUSY' USING ERRCODE = 'P0001'`,
      publicExecuteRevoked: true,
      runtimeCanExecute: false,
      runtimeExecuteGrantable: false,
      nonOwnerExecuteGrantees: [],
    },
  };
  assert.equal(validatePayrollControlImportLockSemanticsEvidence(evidence), true);
  evidence.function.runtimeCanExecute = true;
  assert.throws(() => validatePayrollControlImportLockSemanticsEvidence(evidence), /ACL/);
});

test('aplicador 037 es ledgerado, transaccional, pineado e idempotente', () => {
  for (const pattern of [
    /036-owner-tenant-operational-authority/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /verifyNoUnledgeredState/,
    /resolvePinnedNeonTarget/,
    /verifyPinnedNeonConnectedTarget/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /existing\.rowCount[\s\S]*ledger y estado final verificados/,
  ]) assert.match(applier, pattern);

  const host = 'ep-lock-semantics.sa-east-1.aws.neon.tech';
  const env = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_EXPECTED_NEON_BRANCH_ID: 'br-lock',
    PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_EXPECTED_NEON_HOST: host,
    PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_EXPECTED_DATABASE: 'municontrol',
  };
  assert.equal(resolvePayrollControlImportLockSemanticsTarget(
    ['--confirm-isolated-branch'], env,
  ).mode, 'isolated');
});

test('package y despliegue incluyen el hotfix 037', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:payroll:control-import-lock-semantics:schema'],
    'node --env-file=.env.local scripts/apply-payroll-control-import-lock-semantics-schema.mjs --confirm-isolated-branch');
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/037-payroll-control-import-lock-semantics\.sql/);
});
