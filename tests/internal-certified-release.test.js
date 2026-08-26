import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  INTERNAL_CERTIFIED_RELEASE_SHA_ENV,
  InternalCertifiedReleaseError,
  VERCEL_GIT_COMMIT_SHA_ENV,
  resolveInternalCertifiedReleaseSha,
} from '../lib/internal-certified-release.js';

const EXPLICIT_SHA = 'a'.repeat(40);
const VERCEL_SHA = 'b'.repeat(40);

test('release explícito gobierna deployments manuales y se normaliza', () => {
  assert.equal(resolveInternalCertifiedReleaseSha({
    [INTERNAL_CERTIFIED_RELEASE_SHA_ENV]: `  ${EXPLICIT_SHA.toUpperCase()}  `,
  }), EXPLICIT_SHA);
  assert.equal(resolveInternalCertifiedReleaseSha({
    [INTERNAL_CERTIFIED_RELEASE_SHA_ENV]: EXPLICIT_SHA,
    [VERCEL_GIT_COMMIT_SHA_ENV]: EXPLICIT_SHA,
  }), EXPLICIT_SHA);
});

test('release Git de Vercel permanece como fallback compatible', () => {
  assert.equal(resolveInternalCertifiedReleaseSha({
    [VERCEL_GIT_COMMIT_SHA_ENV]: VERCEL_SHA,
  }), VERCEL_SHA);
});

test('release explícito inválido falla cerrado aunque el fallback sea válido', () => {
  assert.throws(() => resolveInternalCertifiedReleaseSha({
    [INTERNAL_CERTIFIED_RELEASE_SHA_ENV]: '',
    [VERCEL_GIT_COMMIT_SHA_ENV]: VERCEL_SHA,
  }), (error) => error instanceof InternalCertifiedReleaseError
    && error.code === 'INTERNAL_CERTIFIED_RELEASE_SHA_INVALID'
    && error.source === INTERNAL_CERTIFIED_RELEASE_SHA_ENV);

  for (const value of ['a'.repeat(39), 'a'.repeat(41), 'g'.repeat(40), 'deploy-manual']) {
    assert.throws(() => resolveInternalCertifiedReleaseSha({
      [INTERNAL_CERTIFIED_RELEASE_SHA_ENV]: value,
    }), (error) => error instanceof InternalCertifiedReleaseError);
  }
});

test('metadata Git presente debe identificar el mismo artefacto que el pin explícito', () => {
  assert.throws(() => resolveInternalCertifiedReleaseSha({
    [INTERNAL_CERTIFIED_RELEASE_SHA_ENV]: EXPLICIT_SHA,
    [VERCEL_GIT_COMMIT_SHA_ENV]: VERCEL_SHA,
  }), (error) => error instanceof InternalCertifiedReleaseError
    && error.code === 'INTERNAL_CERTIFIED_RELEASE_SHA_MISMATCH'
    && error.source === `${INTERNAL_CERTIFIED_RELEASE_SHA_ENV}:${VERCEL_GIT_COMMIT_SHA_ENV}`);
});

test('fallback ausente o inválido nunca produce una identidad de release', () => {
  for (const env of [{}, { [VERCEL_GIT_COMMIT_SHA_ENV]: 'not-a-sha' }]) {
    assert.throws(() => resolveInternalCertifiedReleaseSha(env), (error) => (
      error instanceof InternalCertifiedReleaseError
      && error.source === VERCEL_GIT_COMMIT_SHA_ENV
    ));
  }
});

test('los gateways operativos consumen el resolver único y no leen metadata Git directamente', () => {
  for (const file of [
    'api/internal-admin.js',
    'api/internal-identity.js',
    'api/internal-actions.js',
    'api/attendance-ingest.js',
    'lib/internal-access-gateway.js',
  ]) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /resolveInternalCertifiedReleaseSha/);
    assert.doesNotMatch(source, /env\?\.VERCEL_GIT_COMMIT_SHA|env\.VERCEL_GIT_COMMIT_SHA/);
  }
});
