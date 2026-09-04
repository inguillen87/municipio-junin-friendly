import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CertifiedDataContractBuildAssertionError,
  assertCertifiedDataContract,
  evaluateCertifiedDataContractIdentity,
  resolveDataContractBuildEnvironment,
} from '../scripts/assert-certified-data-contract.mjs';
import packageJson from '../package.json' with { type: 'json' };

const CONTRACT_ID = 'a'.repeat(40);
const DIFFERENT_CONTRACT_ID = 'b'.repeat(40);

function expectAssertion(code) {
  return (error) => {
    assert.ok(error instanceof CertifiedDataContractBuildAssertionError);
    assert.equal(error.code, code);
    return true;
  };
}

test('el ciclo normal de build ejecuta el assert antes de construir', () => {
  assert.equal(packageJson.scripts.prebuild, 'node scripts/assert-certified-data-contract.mjs');
  assert.equal(packageJson.scripts['release:assert'], 'node scripts/assert-certified-data-contract.mjs');
});

test('Producción verifica únicamente el pin canónico que coincide con el checkout', () => {
  const result = evaluateCertifiedDataContractIdentity({
    dataContractId: CONTRACT_ID,
    environment: 'production',
    env: { INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: CONTRACT_ID.toUpperCase() },
  });

  assert.deepEqual(result, {
    environment: 'production',
    dataContractId: CONTRACT_ID,
    comparisonPerformed: true,
    status: 'verified',
  });
});

test('Producción falla cerrado cuando falta la variable canónica aunque exista el alias', () => {
  assert.throws(() => evaluateCertifiedDataContractIdentity({
    dataContractId: CONTRACT_ID,
    environment: 'production',
    env: { INTERNAL_CERTIFIED_RELEASE_SHA: CONTRACT_ID },
  }), expectAssertion('INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_MISSING'));
});

test('Producción falla cerrado ante formato inválido, conflicto de alias o desigualdad', () => {
  assert.throws(() => evaluateCertifiedDataContractIdentity({
    dataContractId: CONTRACT_ID,
    environment: 'production',
    env: { INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: 'no-es-un-sha' },
  }), expectAssertion('INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_INVALID'));

  assert.throws(() => evaluateCertifiedDataContractIdentity({
    dataContractId: CONTRACT_ID,
    environment: 'production',
    env: {
      INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: CONTRACT_ID,
      INTERNAL_CERTIFIED_RELEASE_SHA: DIFFERENT_CONTRACT_ID,
    },
  }), expectAssertion('INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_MISMATCH'));

  assert.throws(() => evaluateCertifiedDataContractIdentity({
    dataContractId: CONTRACT_ID,
    environment: 'production',
    env: { INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: DIFFERENT_CONTRACT_ID },
  }), expectAssertion('INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_MISMATCH'));
});

test('Preview y local calculan identidad pero no afirman una verificación de Producción', () => {
  for (const environment of ['preview', 'development', 'local']) {
    const result = evaluateCertifiedDataContractIdentity({
      dataContractId: CONTRACT_ID,
      environment,
      env: {},
    });
    assert.deepEqual(result, {
      environment,
      dataContractId: CONTRACT_ID,
      comparisonPerformed: false,
      status: 'not_applicable',
    });
  }
});

test('un contexto Vercel incompleto o desconocido no se degrada a local', () => {
  assert.throws(
    () => resolveDataContractBuildEnvironment({ VERCEL: '1' }),
    expectAssertion('VERCEL_ENV_MISSING'),
  );
  assert.throws(
    () => resolveDataContractBuildEnvironment({ VERCEL: '1', VERCEL_ENV: 'staging' }),
    expectAssertion('VERCEL_ENV_INVALID'),
  );
  assert.equal(resolveDataContractBuildEnvironment({}), 'local');
  assert.equal(resolveDataContractBuildEnvironment({ VERCEL_ENV: 'preview' }), 'preview');
  assert.throws(() => evaluateCertifiedDataContractIdentity({
    dataContractId: CONTRACT_ID,
    environment: 'staging',
    env: {},
  }), expectAssertion('BUILD_ENVIRONMENT_INVALID'));
});

test('el assert local recorre el manifiesto real sin producir evidencia de Producción', async () => {
  const result = await assertCertifiedDataContract({ env: {} });

  assert.equal(result.status, 'not_applicable');
  assert.equal(result.comparisonPerformed, false);
  assert.equal(result.environment, 'local');
  assert.match(result.dataContractId, /^[a-f0-9]{40}$/);
  assert.match(result.fullDigestSha256, /^[a-f0-9]{64}$/);
  assert.ok(result.files.includes('package.json'));
  assert.ok(result.files.includes('scripts/assert-certified-data-contract.mjs'));
  assert.ok(result.files.includes('scripts/classify-data-contract-release.mjs'));
  assert.ok(result.files.includes('scripts/lib/pinned-neon-target.mjs'));
});
