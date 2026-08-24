import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { decryptEmailMfaDestination } from '../lib/internal-identity-crypto.js';
import {
  emailMfaFactorProvisionConfiguration,
  emailMfaFactorProvisionMaterial,
  provisionEmailMfaFactor,
} from '../scripts/provision-email-mfa-factor.mjs';
import {
  EMAIL_OTP_MFA_MIGRATION_VERSION,
  emailOtpMfaFingerprint,
} from '../scripts/apply-email-otp-mfa-schema.mjs';

const USER_EMAIL = 'owner@example.invalid';
const DESTINATION_EMAIL = 'security@example.invalid';
const PEPPER = 'p'.repeat(64);
const ENCRYPTION_KEY = Buffer.alloc(32, 19);
const ENV = Object.freeze({
  DATABASE_URL_UNPOOLED: 'postgresql://owner:password@ep-isolated.example.invalid/neondb?sslmode=require',
  IDENTITY_TOKEN_PEPPER: PEPPER,
  INTERNAL_SESSION_SECRET: 's'.repeat(64),
  IDENTITY_MFA_ENCRYPTION_KEY: ENCRYPTION_KEY.toString('base64url'),
  IDENTITY_EMAIL_MFA_PROVISION_REASON: 'Demostracion autorizada en rama QA aislada',
});
const ARGV = Object.freeze([
  'node', 'script', '--confirm-isolated-branch',
  '--user-email', USER_EMAIL,
  `--destination-email=${DESTINATION_EMAIL}`,
]);

test('config acepta CLI o env, exige razon y confirmacion se valida antes de conectar', async () => {
  assert.deepEqual(emailMfaFactorProvisionConfiguration(ARGV, ENV), {
    userEmail: USER_EMAIL,
    destinationEmail: DESTINATION_EMAIL,
    reason: ENV.IDENTITY_EMAIL_MFA_PROVISION_REASON,
    suppliedIdempotencyKey: '',
  });
  assert.throws(
    () => emailMfaFactorProvisionConfiguration(
      ['node', 'script', '--user-email', USER_EMAIL, '--destination-email', DESTINATION_EMAIL],
      { ...ENV, IDENTITY_EMAIL_MFA_PROVISION_REASON: '' },
    ),
    /PROVISION_REASON/,
  );
  let factoryCalled = false;
  await assert.rejects(
    provisionEmailMfaFactor({
      argv: ['node', 'script', '--user-email', USER_EMAIL, '--destination-email', DESTINATION_EMAIL],
      env: ENV,
      clientFactory: () => { factoryCalled = true; return {}; },
    }),
    /confirm-isolated-branch/,
  );
  assert.equal(factoryCalled, false);
});

test('coordenadas son idempotentes y cada cifrado usa un nonce independiente', () => {
  const configuration = emailMfaFactorProvisionConfiguration(ARGV, ENV);
  const secrets = { tokenPepper: PEPPER, encryptionKey: ENCRYPTION_KEY };
  const first = emailMfaFactorProvisionMaterial(configuration, secrets, {
    random: (size) => Buffer.alloc(size, 1),
  });
  const second = emailMfaFactorProvisionMaterial(configuration, secrets, {
    random: (size) => Buffer.alloc(size, 2),
  });
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.destinationHash, second.destinationHash);
  assert.equal(first.reasonHash, second.reasonHash);
  assert.notEqual(first.destinationCiphertext, second.destinationCiphertext);
  assert.match(first.idempotencyKey, /^[0-9a-f-]{36}$/);
  assert.match(first.destinationHash, /^[a-f0-9]{64}$/);
  assert.match(first.reasonHash, /^[a-f0-9]{64}$/);
  assert.ok(!first.destinationCiphertext.includes(DESTINATION_EMAIL));
  assert.equal(
    decryptEmailMfaDestination(first.destinationCiphertext, ENCRYPTION_KEY),
    DESTINATION_EMAIL,
  );
  assert.equal(
    decryptEmailMfaDestination(second.destinationCiphertext, ENCRYPTION_KEY),
    DESTINATION_EMAIL,
  );
  assert.notEqual(first.destinationHash, DESTINATION_EMAIL);
  assert.notEqual(first.reasonHash, configuration.reason);
});

test('provision valida ledger 015 y ACL antes/despues; la salida omite correos y secretos', async () => {
  const migration = await readFile(
    new URL('../scripts/migrations/015-email-otp-mfa.sql', import.meta.url),
    'utf8',
  );
  const checksum = emailOtpMfaFingerprint(migration);
  const queries = [];
  const aclChecks = [];
  const client = {
    async connect() {},
    async end() {},
    async query(text, params = []) {
      queries.push({ text: String(text), params });
      if (String(text).includes('SELECT checksum_sha256 FROM schema_migrations')) {
        return { rowCount: 1, rows: [{ checksum_sha256: checksum }] };
      }
      if (String(text).includes('tenant_identity_provision_email_factor_v1')) {
        return {
          rowCount: 1,
          rows: [{ result: {
            id: '7a56fa65-bc0d-4fc3-9fd5-d51a06d7f74b',
            status: 'pending', version: 1, replayed: false,
          } }],
        };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  const evidence = await provisionEmailMfaFactor({
    argv: ARGV,
    env: ENV,
    clientFactory: () => client,
    readMigration: async () => migration,
    verifyAcl: async (value) => { aclChecks.push(value); return true; },
  });
  assert.deepEqual(evidence, { status: 'pending', version: 1, replayed: false });
  assert.equal(aclChecks.length, 2);
  assert.ok(queries.some(({ text, params }) => (
    text.includes('schema_migrations') && params[0] === EMAIL_OTP_MFA_MIGRATION_VERSION
  )));
  const call = queries.find(({ text }) => text.includes('tenant_identity_provision_email_factor_v1'));
  assert.ok(call);
  assert.equal(call.params[0], USER_EMAIL);
  assert.notEqual(call.params[1], DESTINATION_EMAIL);
  assert.ok(!call.params.slice(1).some((value) => String(value).includes(DESTINATION_EMAIL)));
  assert.ok(queries.some(({ text }) => text === 'COMMIT'));
});

test('drift de checksum aborta y revierte sin invocar la funcion owner-only', async () => {
  const queries = [];
  const client = {
    async connect() {},
    async end() {},
    async query(text, params = []) {
      queries.push({ text: String(text), params });
      if (String(text).includes('SELECT checksum_sha256 FROM schema_migrations')) {
        return { rowCount: 1, rows: [{ checksum_sha256: '0'.repeat(64) }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  await assert.rejects(
    provisionEmailMfaFactor({
      argv: ARGV,
      env: ENV,
      clientFactory: () => client,
      readMigration: async () => 'local migration bytes',
      verifyAcl: async () => true,
    }),
    /ausente o con drift/,
  );
  assert.ok(queries.some(({ text }) => text === 'ROLLBACK'));
  assert.ok(!queries.some(({ text }) => text.includes('tenant_identity_provision_email_factor_v1')));
});

test('script y package conservan el gate aislado y no hardcodean destinatarios reales', async () => {
  const [source, packageSource] = await Promise.all([
    readFile(new URL('../scripts/provision-email-mfa-factor.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /directIsolatedDatabaseUrl\(argv, env\)/);
  assert.match(source, /identitySecrets\(env\)/);
  assert.match(source, /encryptEmailMfaDestination/);
  assert.match(source, /hashIdentitySecret/);
  assert.match(source, /verifyEmailOtpMfaFinalAcl/);
  assert.doesNotMatch(source, /['"`][^'"`\s@]+@[^'"`\s@]+['"`]/);
  assert.match(
    packageSource,
    /scripts\/provision-email-mfa-factor\.mjs --confirm-isolated-branch/,
  );
});
