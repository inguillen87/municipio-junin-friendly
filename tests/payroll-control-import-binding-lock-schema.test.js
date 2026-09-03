import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { payrollControlImportFingerprint } from
  '../scripts/apply-governed-payroll-control-import-schema.mjs';
import {
  PAYROLL_CONTROL_IMPORT_BINDING_MIGRATION_VERSION,
  PAYROLL_CONTROL_IMPORT_BOUND_PREPARE_SIGNATURE,
  PAYROLL_CONTROL_IMPORT_LOCKED_PREPARE_SIGNATURE,
  payrollControlImportBindingFingerprint,
  resolvePayrollControlImportBindingTarget,
  validatePayrollControlImportBindingEvidence,
  validatePayrollControlImportBindingMigrationSql,
} from '../scripts/apply-payroll-control-import-binding-lock-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const legacyMigration = await readFile(new URL(
  '../scripts/migrations/025-governed-payroll-control-import.sql', import.meta.url,
), 'utf8');
const migration = await readFile(new URL(
  '../scripts/migrations/034-payroll-control-import-binding-lock.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-payroll-control-import-binding-lock-schema.mjs', import.meta.url,
), 'utf8');

function functionEvidence(signature, sourceBody, runtimeCanExecute, grantees) {
  return {
    signature,
    securityDefiner: true,
    ownedByCurrentUser: true,
    ownerIsRuntime: false,
    volatility: 'v',
    config: ['search_path=public, pg_temp'],
    sourceBody,
    publicExecuteRevoked: true,
    runtimeCanExecute,
    runtimeExecuteGrantable: false,
    nonOwnerExecuteGrantees: grantees,
  };
}

function evidence() {
  return {
    oldSignatureExists: false,
    functions: [
      functionEvidence(
        PAYROLL_CONTROL_IMPORT_LOCKED_PREPARE_SIGNATURE,
        `payroll_control_import_assert_context_v1 pg_advisory_xact_lock
          payroll_control_import_batch payroll_control_import_event
          PAYROLL_CONTROL_IMPORT_IDEMPOTENCY_REUSE`,
        false,
        [],
      ),
      functionEvidence(
        PAYROLL_CONTROL_IMPORT_BOUND_PREPARE_SIGNATURE,
        `p_expected_binding_id payroll_control_import_assert_context_v1
          certifiedBindingId PAYROLL_CONTROL_IMPORT_BINDING_CHANGED
          payroll_control_import_prepare_locked_v1`,
        true,
        ['municontrol_actions_runtime_app'],
      ),
    ],
  };
}

test('025 recupera exactamente los bytes ledgered previos y 034 agrega la firma nueva', () => {
  assert.equal(payrollControlImportFingerprint(legacyMigration),
    '6cfd9f5fb29e3d4929a2c21ef557d306291fe2219a8ad0c824a7da2242b83aad');
  assert.doesNotMatch(legacyMigration, /p_expected_binding_id|PAYROLL_CONTROL_IMPORT_BINDING_CHANGED/);
  assert.match(legacyMigration,
    /payroll_control_import_prepare_v1\(\s*p_context jsonb,\s*p_source_kind text/);

  assert.equal(PAYROLL_CONTROL_IMPORT_BINDING_MIGRATION_VERSION,
    '034-payroll-control-import-binding-lock');
  assert.equal(validatePayrollControlImportBindingMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 10);
  assert.match(payrollControlImportBindingFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.match(migration,
    /payroll_control_import_prepare_v1\(\s*p_context jsonb,\s*p_expected_binding_id uuid/);
});

test('034 retira la fachada vieja y fija el binding con los locks del contexto', () => {
  const assertIndex = migration.indexOf(
    'context_value := public.payroll_control_import_assert_context_v1(',
  );
  const compareIndex = migration.indexOf(
    "p_expected_binding_id <> (context_value->>'certifiedBindingId')::uuid",
  );
  const delegateIndex = migration.indexOf(
    'RETURN public.payroll_control_import_prepare_locked_v1(',
  );
  assert.ok(assertIndex >= 0 && assertIndex < compareIndex && compareIndex < delegateIndex);
  assert.match(legacyMigration,
    /SELECT \* INTO policy_row[\s\S]*FOR SHARE NOWAIT;[\s\S]*SELECT \* INTO binding_row[\s\S]*FOR SHARE NOWAIT;/);
  assert.match(migration, /FOR SHARE NOWAIT/);
  assert.match(migration, /locks hasta finalizar la transaccion/);
  assert.match(migration, /PAYROLL_CONTROL_IMPORT_034_OLD_FACADE_REMAINS/);
  assert.doesNotMatch(migration,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?payroll_control_import_(?:batch|row|event)\b/i);
});

test('estado final exige wrapper execute-only y helper interno inaccesible', () => {
  assert.equal(validatePayrollControlImportBindingEvidence(evidence()), true);

  const oldFacade = evidence();
  oldFacade.oldSignatureExists = true;
  assert.throws(() => validatePayrollControlImportBindingEvidence(oldFacade),
    /anterior todavia es invocable/);

  const helperExposed = evidence();
  helperExposed.functions[0].runtimeCanExecute = true;
  assert.throws(() => validatePayrollControlImportBindingEvidence(helperExposed),
    /interna 025 expuesta/);

  const publicFacade = evidence();
  publicFacade.functions[1].publicExecuteRevoked = false;
  assert.throws(() => validatePayrollControlImportBindingEvidence(publicFacade),
    /funcion 034 insegura/);

  const outsider = evidence();
  outsider.functions[1].nonOwnerExecuteGrantees.push('report_reader');
  assert.throws(() => validatePayrollControlImportBindingEvidence(outsider),
    /allowlist execute-only/);
});

test('aplicador 034 exige checksums de 025 y 033, ledger, transaccion y pins', () => {
  for (const pattern of [
    /025-governed-payroll-control-import\.sql/,
    /payrollControlImportFingerprint/,
    /033-payroll-art-report-capability\.sql/,
    /payrollArtReportCapabilityFingerprint/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /verifyNoUnledgeredState\(client\)/,
    /resolvePinnedNeonTarget/,
    /verifyPinnedNeonConnectedTarget/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /verifyPayrollControlImportBindingFinalState\(client\)/,
    /aclexplode/,
  ]) assert.match(applier, pattern);
  assert.doesNotMatch(applier,
    /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
});

test('target 034 exige pines propios y separa QA de Produccion', () => {
  const host = 'ep-control-binding.sa-east-1.aws.neon.tech';
  const base = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    PAYROLL_CONTROL_IMPORT_BINDING_EXPECTED_NEON_BRANCH_ID: 'br-control-binding',
    PAYROLL_CONTROL_IMPORT_BINDING_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_CONTROL_IMPORT_BINDING_EXPECTED_NEON_HOST: host,
    PAYROLL_CONTROL_IMPORT_BINDING_EXPECTED_DATABASE: 'municontrol',
  };
  assert.equal(resolvePayrollControlImportBindingTarget(
    ['--confirm-isolated-branch'], base,
  ).mode, 'isolated');
  assert.equal(resolvePayrollControlImportBindingTarget(
    ['--confirm-production-branch=br-control-binding'], {
      ...base,
      CANONICAL_PRODUCTION_BRANCH_ID: 'br-control-binding',
      CANONICAL_PRODUCTION_HOST: host,
      CANONICAL_PRODUCTION_DATABASE: 'municontrol',
      VERCEL_ENV: 'production',
    },
  ).mode, 'production');
});

test('package y despliegue incluyen aplicador y SQL 034', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:payroll:control-import-binding:schema'],
    'node --env-file=.env.local scripts/apply-payroll-control-import-binding-lock-schema.mjs --confirm-isolated-branch');
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/034-payroll-control-import-binding-lock\.sql/);
});
