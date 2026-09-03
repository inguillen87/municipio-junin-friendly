import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from '../scripts/lib/pinned-neon-target.mjs';

const host = 'ep-payroll-release.sa-east-1.aws.neon.tech';
const databaseUrl = `postgresql://user:secret@${host}/municontrol?sslmode=require`;

function pins(overrides = {}) {
  return {
    DATABASE_URL_UNPOOLED: databaseUrl,
    FEATURE_EXPECTED_NEON_BRANCH_ID: 'br-payroll-release',
    FEATURE_EXPECTED_NEON_PROJECT_ID: 'municipio-junin',
    FEATURE_EXPECTED_NEON_HOST: host,
    FEATURE_EXPECTED_DATABASE: 'municontrol',
    ...overrides,
  };
}

test('target Neon fijado admite rama aislada con cuatro pines independientes', () => {
  const target = resolvePinnedNeonTarget({
    argv: ['--confirm-isolated-branch'], env: pins(),
    envPrefix: 'FEATURE', targetLabel: 'prueba',
  });
  assert.equal(target.mode, 'isolated');
  assert.equal(target.branchId, 'br-payroll-release');
  assert.equal(target.projectId, 'municipio-junin');
  assert.equal(target.endpointId, 'ep-payroll-release');
  assert.equal(target.expectedDatabase, 'municontrol');
});

test('target productivo exige coincidencia comando, canonico y pin de migracion', () => {
  const env = pins({
    CANONICAL_PRODUCTION_BRANCH_ID: 'br-payroll-release',
    CANONICAL_PRODUCTION_HOST: host,
    CANONICAL_PRODUCTION_DATABASE: 'municontrol',
    VERCEL_ENV: 'production',
  });
  const target = resolvePinnedNeonTarget({
    argv: ['--confirm-production-branch=br-payroll-release'], env,
    envPrefix: 'FEATURE', targetLabel: 'prueba',
  });
  assert.equal(target.mode, 'production');
  assert.equal(target.branchId, 'br-payroll-release');
  assert.throws(() => resolvePinnedNeonTarget({
    argv: ['--confirm-production-branch=br-payroll-release'],
    env: { ...env, FEATURE_EXPECTED_NEON_BRANCH_ID: 'br-other' },
    envPrefix: 'FEATURE', targetLabel: 'prueba',
  }), /no coincide con la rama de produccion/);
});

test('rama aislada no puede reutilizar el branch id productivo conocido', () => {
  assert.throws(() => resolvePinnedNeonTarget({
    argv: ['--confirm-isolated-branch'],
    env: pins({ CANONICAL_PRODUCTION_BRANCH_ID: 'br-payroll-release' }),
    envPrefix: 'FEATURE', targetLabel: 'prueba',
  }), /coincide con la rama de produccion/);
});

test('post-connect compara branch, project, endpoint y database', async () => {
  const target = resolvePinnedNeonTarget({
    argv: ['--confirm-isolated-branch'], env: pins(),
    envPrefix: 'FEATURE', targetLabel: 'prueba',
  });
  const valid = { query: async () => ({ rows: [{
    branchId: target.branchId,
    projectId: target.projectId,
    endpointId: target.endpointId,
    database: target.expectedDatabase,
  }] }) };
  assert.equal(await verifyPinnedNeonConnectedTarget(valid, target, 'prueba'), true);
  await assert.rejects(verifyPinnedNeonConnectedTarget({
    query: async () => ({ rows: [{
      branchId: 'br-other', projectId: target.projectId,
      endpointId: target.endpointId, database: target.expectedDatabase,
    }] }),
  }, target, 'prueba'), /target Neon prueba/);
});
