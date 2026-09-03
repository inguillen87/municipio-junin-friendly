import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_CONTROL_IMPORT_FUNCTIONS,
  PAYROLL_CONTROL_IMPORT_ROLE_MATRIX,
  PAYROLL_CONTROL_IMPORT_RUNTIME_FUNCTIONS,
  PAYROLL_CONTROL_IMPORT_TABLES,
  PAYROLL_CONTROL_IMPORT_TRIGGERS,
  payrollControlImportFingerprint,
  resolvePayrollControlImportTarget,
  validatePayrollControlImportEvidence,
  validatePayrollControlImportMigrationSql,
  verifyPayrollControlImportConnectedTarget,
} from '../scripts/apply-governed-payroll-control-import-schema.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/025-governed-payroll-control-import.sql', import.meta.url,
), 'utf8');

function targetEnv(overrides = {}) {
  return {
    DATABASE_URL_UNPOOLED:
      'postgresql://user:secret@ep-b2-control.us-east-2.aws.neon.tech/branchdb?sslmode=require',
    PAYROLL_CONTROL_IMPORT_EXPECTED_NEON_BRANCH_ID: 'br-b2-control',
    PAYROLL_CONTROL_IMPORT_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_CONTROL_IMPORT_EXPECTED_NEON_HOST:
      'ep-b2-control.us-east-2.aws.neon.tech',
    PAYROLL_CONTROL_IMPORT_EXPECTED_DATABASE: 'branchdb',
    ...overrides,
  };
}

function evidence(overrides = {}) {
  const owner = 'schema_owner';
  return {
    currentUser: owner,
    tables: PAYROLL_CONTROL_IMPORT_TABLES.map((tableName) => ({
      tableName, ownerName: owner, publicPrivileges: false,
      runtimePrivileges: false, tenantIdNotNull: true,
    })),
    columns: [
      {
        tableName: 'payroll_control_import_row', columnName: 'amount_cents',
        dataType: 'bigint', notNull: true, characterMaximumLength: null,
      },
      {
        tableName: 'payroll_control_import_batch', columnName: 'content_hmac_sha256',
        dataType: 'character', notNull: true, characterMaximumLength: 64,
      },
      {
        tableName: 'payroll_control_import_batch', columnName: 'provenance_state',
        dataType: 'character varying', notNull: true, characterMaximumLength: 32,
      },
      {
        tableName: 'payroll_control_import_batch', columnName: 'contract_version',
        dataType: 'character varying', notNull: true, characterMaximumLength: 64,
      },
      {
        tableName: 'payroll_control_import_batch', columnName: 'hmac_key_version',
        dataType: 'character varying', notNull: true, characterMaximumLength: 32,
      },
    ],
    functions: PAYROLL_CONTROL_IMPORT_FUNCTIONS.map((signature) => ({
      signature, ownerName: owner, securityDefiner: true, publicExecuteRevoked: true,
      fixedSearchPath: true,
      runtimeExecute: PAYROLL_CONTROL_IMPORT_RUNTIME_FUNCTIONS.includes(signature),
    })),
    triggers: PAYROLL_CONTROL_IMPORT_TRIGGERS.map((name) => ({ name })),
    roles: Object.entries(PAYROLL_CONTROL_IMPORT_ROLE_MATRIX).map(
      ([roleKey, capabilities]) => ({ roleKey, capabilities: [...capabilities] }),
    ),
    requiredConflict: true,
    roleConflicts: [],
    ...overrides,
  };
}

test('applier valida el SQL 025 y produce fingerprint estable', () => {
  assert.equal(validatePayrollControlImportMigrationSql(migration), true);
  assert.match(payrollControlImportFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.equal(
    payrollControlImportFingerprint(migration),
    payrollControlImportFingerprint(migration),
  );
  assert.throws(
    () => validatePayrollControlImportMigrationSql(migration.replace(
      'amount_cents bigint NOT NULL', 'amount_cents numeric NOT NULL',
    )),
    /amount_cents bigint/,
  );
});

test('preflight exige conexión directa, rama aislada y cuatro pines independientes', () => {
  const resolved = resolvePayrollControlImportTarget(
    ['--confirm-isolated-branch'], targetEnv(),
  );
  assert.equal(resolved.mode, 'isolated');
  assert.equal(resolved.branchId, 'br-b2-control');
  assert.equal(resolved.projectId, 'junin-friendly');
  assert.equal(resolved.endpointId, 'ep-b2-control');
  assert.equal(resolved.expectedDatabase, 'branchdb');
  assert.throws(() => resolvePayrollControlImportTarget([], targetEnv()),
    /confirm-isolated-branch/);
  assert.throws(() => resolvePayrollControlImportTarget(
    ['--confirm-isolated-branch'],
    targetEnv({ DATABASE_URL_UNPOOLED:
      'postgresql://u:p@ep-b2-control-pooler.us-east-2.aws.neon.tech/branchdb' }),
  ), /pooled/);
  assert.throws(() => resolvePayrollControlImportTarget(
    ['--confirm-isolated-branch'],
    targetEnv({ PAYROLL_CONTROL_IMPORT_EXPECTED_NEON_BRANCH_ID: '' }),
  ), /EXPECTED_NEON_BRANCH_ID/);
});

test('verificación efectiva rechaza una conexión a otra rama o base', async () => {
  const target = resolvePayrollControlImportTarget(
    ['--confirm-isolated-branch'], targetEnv(),
  );
  const validClient = { query: async () => ({ rows: [{
    branchId: 'br-b2-control', projectId: 'junin-friendly',
    endpointId: 'ep-b2-control', database: 'branchdb',
  }] }) };
  assert.equal(await verifyPayrollControlImportConnectedTarget(validClient, target), true);
  const driftedClient = { query: async () => ({ rows: [{
    branchId: 'br-other', projectId: 'junin-friendly',
    endpointId: 'ep-b2-control', database: 'branchdb',
  }] }) };
  await assert.rejects(
    verifyPayrollControlImportConnectedTarget(driftedClient, target), /rama Neon aislada/,
  );
});

test('evidencia final admite solo tablas privadas y tres facades runtime', () => {
  assert.equal(validatePayrollControlImportEvidence(evidence()), true);
  const withTableGrant = evidence();
  withTableGrant.tables[0].runtimePrivileges = true;
  assert.throws(() => validatePayrollControlImportEvidence(withTableGrant), /ACL o tenant/);

  const withHelperGrant = evidence();
  withHelperGrant.functions.find((fn) =>
    fn.signature.includes('rows_valid_v1')).runtimeExecute = true;
  assert.throws(() => validatePayrollControlImportEvidence(withHelperGrant), /funcion insegura/);

  const withNumericAmount = evidence();
  withNumericAmount.columns[0].dataType = 'numeric';
  assert.throws(() => validatePayrollControlImportEvidence(withNumericAmount), /columnas criticas/);
});

test('evidencia final detecta trigger, rol o SoD faltante', () => {
  assert.throws(() => validatePayrollControlImportEvidence(evidence({ triggers: [] })),
    /triggers 025/);
  const roleDrift = evidence();
  roleDrift.roles.find((role) => role.roleKey === 'CONSULTA_INTEGRAL')
    .capabilities.push('payroll.control_import.validate');
  assert.throws(() => validatePayrollControlImportEvidence(roleDrift), /capacidades 025/);
  assert.throws(() => validatePayrollControlImportEvidence(evidence({
    requiredConflict: false,
  })), /separacion de funciones/);
});

test('package y Vercel conservan el aplicador y la migración', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:payroll:control-import:schema'],
    'node --env-file=.env.local scripts/apply-governed-payroll-control-import-schema.mjs --confirm-isolated-branch');
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/025-governed-payroll-control-import\.sql/);
});

test('applier contiene ledger, prerequisitos, lock transaccional y rollback', async () => {
  const source = await readFile(new URL(
    '../scripts/apply-governed-payroll-control-import-schema.mjs', import.meta.url,
  ), 'utf8');
  assert.match(source, /014-governed-source-binding-provisioning/);
  assert.match(source, /019-institutional-access-profiles/);
  assert.match(source, /021-platform-owner-operational-integral/);
  assert.match(source, /schema_migrations/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /verifyNoUnledgeredObjects/);
  assert.match(source, /await client\.query\('BEGIN'\)/);
  assert.match(source, /await client\.query\('COMMIT'\)/);
  assert.match(source, /await client\.query\('ROLLBACK'\)/);
  assert.doesNotMatch(source, /DATABASE_URL(?!_UNPOOLED)/);
});
