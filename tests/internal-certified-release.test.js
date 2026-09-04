import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV,
  INTERNAL_CERTIFIED_RELEASE_SHA_ENV,
  InternalCertifiedDataContractError,
  VERCEL_GIT_COMMIT_SHA_ENV,
  resolveInternalCertifiedDataContractSha,
  resolveInternalCertifiedReleaseSha,
} from '../lib/internal-certified-release.js';

const CONTRACT_SHA = 'a'.repeat(40);
const DEPLOYMENT_SHA = 'b'.repeat(40);

test('la identidad canónica del contrato se normaliza y no depende del deployment', () => {
  for (const deploymentSha of [DEPLOYMENT_SHA, 'c'.repeat(40)]) {
    assert.equal(resolveInternalCertifiedDataContractSha({
      [INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV]: `  ${CONTRACT_SHA.toUpperCase()}  `,
      [VERCEL_GIT_COMMIT_SHA_ENV]: deploymentSha,
    }), CONTRACT_SHA);
  }
});

test('el nombre release queda como alias explícito de transición, no como SHA Git', () => {
  assert.equal(resolveInternalCertifiedDataContractSha({
    [INTERNAL_CERTIFIED_RELEASE_SHA_ENV]: CONTRACT_SHA,
    [VERCEL_GIT_COMMIT_SHA_ENV]: DEPLOYMENT_SHA,
  }), CONTRACT_SHA);
  assert.equal(resolveInternalCertifiedReleaseSha({
    [INTERNAL_CERTIFIED_RELEASE_SHA_ENV]: CONTRACT_SHA,
  }), CONTRACT_SHA);
});

test('las variables canónica y legacy pueden convivir solamente si representan el mismo contrato', () => {
  assert.equal(resolveInternalCertifiedDataContractSha({
    [INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV]: CONTRACT_SHA,
    [INTERNAL_CERTIFIED_RELEASE_SHA_ENV]: CONTRACT_SHA.toUpperCase(),
  }), CONTRACT_SHA);

  assert.throws(() => resolveInternalCertifiedDataContractSha({
    [INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV]: CONTRACT_SHA,
    [INTERNAL_CERTIFIED_RELEASE_SHA_ENV]: DEPLOYMENT_SHA,
  }), (error) => error instanceof InternalCertifiedDataContractError
    && error.code === 'INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_MISMATCH'
    && error.source === `${INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV}:${INTERNAL_CERTIFIED_RELEASE_SHA_ENV}`);
});

test('configuración ausente o inválida falla cerrada sin usar metadata de Vercel', () => {
  for (const env of [{}, { [VERCEL_GIT_COMMIT_SHA_ENV]: CONTRACT_SHA }]) {
    assert.throws(() => resolveInternalCertifiedDataContractSha(env), (error) => (
      error instanceof InternalCertifiedDataContractError
      && error.code === 'INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_MISSING'
      && error.source === INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV
    ));
  }

  for (const [source, value] of [
    [INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV, ''],
    [INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV, 'a'.repeat(39)],
    [INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV, 'g'.repeat(40)],
    [INTERNAL_CERTIFIED_RELEASE_SHA_ENV, 'deploy-manual'],
  ]) {
    assert.throws(() => resolveInternalCertifiedDataContractSha({
      [source]: value,
      [VERCEL_GIT_COMMIT_SHA_ENV]: CONTRACT_SHA,
    }), (error) => error instanceof InternalCertifiedDataContractError
      && error.code === 'INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_INVALID'
      && error.source === source);
  }
});

test('los gateways operativos consumen el resolver de contrato y no leen metadata Git directamente', () => {
  for (const file of [
    'api/internal-admin.js',
    'api/internal-identity.js',
    'api/internal-actions.js',
    'api/attendance-ingest.js',
    'lib/internal-access-gateway.js',
  ]) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /resolveInternalCertifiedDataContractSha/);
    assert.doesNotMatch(source, /env\?\.VERCEL_GIT_COMMIT_SHA|env\.VERCEL_GIT_COMMIT_SHA/);
  }
});
