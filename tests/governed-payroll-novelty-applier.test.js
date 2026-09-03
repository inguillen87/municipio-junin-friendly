import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_NOVELTY_CAPABILITIES,
  PAYROLL_NOVELTY_FUNCTIONS,
  PAYROLL_NOVELTY_RUNTIME_FUNCTIONS,
  PAYROLL_NOVELTY_TABLES,
  PAYROLL_NOVELTY_TRIGGERS,
  payrollNoveltyFingerprint,
  resolvePayrollNoveltyTarget,
  validatePayrollNoveltyEvidence,
  validatePayrollNoveltyMigrationSql,
  verifyPayrollNoveltyConnectedTarget,
} from '../scripts/apply-governed-payroll-novelties-schema.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/026-governed-payroll-novelties.sql', import.meta.url,
), 'utf8');

function targetEnv(overrides = {}) {
  return {
    DATABASE_URL_UNPOOLED:
      'postgresql://user:secret@ep-c3-novelty.us-east-2.aws.neon.tech/branchdb?sslmode=require',
    PAYROLL_NOVELTY_EXPECTED_NEON_BRANCH_ID: 'br-c3-novelty',
    PAYROLL_NOVELTY_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_NOVELTY_EXPECTED_NEON_HOST:
      'ep-c3-novelty.us-east-2.aws.neon.tech',
    PAYROLL_NOVELTY_EXPECTED_DATABASE: 'branchdb',
    ...overrides,
  };
}

function evidence(overrides = {}) {
  const owner = 'schema_owner';
  const columns = [
    ['payroll_novelty_row', 'amount_cents', 'bigint', false],
    ['payroll_novelty_row', 'quantity', 'numeric', false],
    ['payroll_novelty_batch', 'grh_mutation', 'boolean', true],
    ['payroll_novelty_batch', 'payroll_calculated', 'boolean', true],
    ['payroll_novelty_batch', 'payroll_posted', 'boolean', true],
    ['payroll_novelty_event', 'grh_mutation', 'boolean', true],
    ['payroll_novelty_event', 'payroll_calculated', 'boolean', true],
    ['payroll_novelty_event', 'payroll_posted', 'boolean', true],
  ].map(([tableName, columnName, dataType, notNull]) => ({
    tableName, columnName, dataType, notNull,
  }));
  return {
    currentUser: owner,
    tables: PAYROLL_NOVELTY_TABLES.map((tableName) => ({
      tableName, ownerName: owner, publicPrivileges: false,
      runtimePrivileges: false, tenantIdNotNull: true,
    })),
    columns,
    functions: PAYROLL_NOVELTY_FUNCTIONS.map((signature) => ({
      signature, ownerName: owner, securityDefiner: true,
      publicExecuteRevoked: true, fixedSearchPath: true,
      runtimeExecute: PAYROLL_NOVELTY_RUNTIME_FUNCTIONS.includes(signature),
    })),
    triggers: PAYROLL_NOVELTY_TRIGGERS.map((name) => ({ name })),
    capabilities: PAYROLL_NOVELTY_CAPABILITIES.map((capabilityKey) => ({ capabilityKey })),
    requiredConflict: true,
    roleConflicts: [],
    ...overrides,
  };
}

test('applier valida SQL 026 y produce fingerprint estable', () => {
  assert.equal(validatePayrollNoveltyMigrationSql(migration), true);
  assert.match(payrollNoveltyFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.equal(payrollNoveltyFingerprint(migration), payrollNoveltyFingerprint(migration));
  assert.throws(() => validatePayrollNoveltyMigrationSql(migration.replace(
    'amount_cents bigint', 'amount_cents numeric',
  )), /amount_cents bigint/);
  assert.throws(() => validatePayrollNoveltyMigrationSql(`${migration}\n`
    + "INSERT INTO public.iam_role_capability VALUES ('X','payroll.novelty.read');"),
  /hardcodea usuarios o roles/);
  assert.throws(() => validatePayrollNoveltyMigrationSql(`${migration}\n`
    + 'UPDATE public.employment_movement SET movement_status = NULL;'),
  /mutar GRH/);
});

test('preflight exige conexión directa, rama aislada y cuatro pines', () => {
  const resolved = resolvePayrollNoveltyTarget(['--confirm-isolated-branch'], targetEnv());
  assert.equal(resolved.mode, 'isolated');
  assert.equal(resolved.branchId, 'br-c3-novelty');
  assert.equal(resolved.projectId, 'junin-friendly');
  assert.equal(resolved.endpointId, 'ep-c3-novelty');
  assert.equal(resolved.expectedDatabase, 'branchdb');
  assert.throws(() => resolvePayrollNoveltyTarget([], targetEnv()),
    /confirm-isolated-branch/);
  assert.throws(() => resolvePayrollNoveltyTarget(
    ['--confirm-isolated-branch'],
    targetEnv({ DATABASE_URL_UNPOOLED:
      'postgresql://u:p@ep-c3-novelty-pooler.us-east-2.aws.neon.tech/branchdb' }),
  ), /pooled/);
  assert.throws(() => resolvePayrollNoveltyTarget(
    ['--confirm-isolated-branch'],
    targetEnv({ PAYROLL_NOVELTY_EXPECTED_NEON_BRANCH_ID: '' }),
  ), /EXPECTED_NEON_BRANCH_ID/);
});

test('verificación efectiva rechaza otra rama o base', async () => {
  const target = resolvePayrollNoveltyTarget(
    ['--confirm-isolated-branch'], targetEnv(),
  );
  const validClient = { query: async () => ({ rows: [{
    branchId: 'br-c3-novelty', projectId: 'junin-friendly',
    endpointId: 'ep-c3-novelty', database: 'branchdb',
  }] }) };
  assert.equal(await verifyPayrollNoveltyConnectedTarget(validClient, target), true);
  const driftedClient = { query: async () => ({ rows: [{
    branchId: 'br-other', projectId: 'junin-friendly',
    endpointId: 'ep-c3-novelty', database: 'branchdb',
  }] }) };
  await assert.rejects(
    verifyPayrollNoveltyConnectedTarget(driftedClient, target), /target Neon/,
  );
});

test('evidencia final admite tablas privadas y solo cinco facades runtime', () => {
  assert.equal(validatePayrollNoveltyEvidence(evidence()), true);
  const withTableGrant = evidence();
  withTableGrant.tables[0].runtimePrivileges = true;
  assert.throws(() => validatePayrollNoveltyEvidence(withTableGrant), /ACL o tenant/);

  const withHelperGrant = evidence();
  withHelperGrant.functions.find((fn) =>
    fn.signature.includes('rows_valid_v1')).runtimeExecute = true;
  assert.throws(() => validatePayrollNoveltyEvidence(withHelperGrant), /funcion insegura/);

  const withNumericAmount = evidence();
  withNumericAmount.columns.find((column) =>
    column.columnName === 'amount_cents').dataType = 'numeric';
  assert.throws(() => validatePayrollNoveltyEvidence(withNumericAmount), /columna critica/);

  const withRequiredAmount = evidence();
  withRequiredAmount.columns.find((column) =>
    column.columnName === 'amount_cents').notNull = true;
  assert.throws(() => validatePayrollNoveltyEvidence(withRequiredAmount), /columna critica/);
});

test('evidencia detecta trigger, capacidad o SoD faltante', () => {
  assert.throws(() => validatePayrollNoveltyEvidence(evidence({ triggers: [] })),
    /triggers 026/);
  assert.throws(() => validatePayrollNoveltyEvidence(evidence({ capabilities: [] })),
    /capacidades 026/);
  assert.throws(() => validatePayrollNoveltyEvidence(evidence({ requiredConflict: false })),
    /separacion de funciones/);
  assert.throws(() => validatePayrollNoveltyEvidence(evidence({
    roleConflicts: [{ roleKey: 'conflicted' }],
  })), /separacion de funciones/);
});

test('applier conserva ledger, prerequisitos, lock y rollback', async () => {
  const source = await readFile(new URL(
    '../scripts/apply-governed-payroll-novelties-schema.mjs', import.meta.url,
  ), 'utf8');
  assert.match(source, /014-governed-source-binding-provisioning/);
  assert.match(source, /019-institutional-access-profiles/);
  assert.match(source, /021-platform-owner-operational-integral/);
  assert.match(source, /024-governed-monthly-attendance-evaluation/);
  assert.match(source, /025-governed-payroll-control-import/);
  assert.match(source, /schema_migrations/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /verifyNoUnledgeredObjects/);
  assert.match(source, /await client\.query\('BEGIN'\)/);
  assert.match(source, /await client\.query\('COMMIT'\)/);
  assert.match(source, /await client\.query\('ROLLBACK'\)/);
  assert.doesNotMatch(source, /DATABASE_URL(?!_UNPOOLED)/);
});
