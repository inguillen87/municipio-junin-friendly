import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';
import { EMAIL_OTP_MFA_SIGNATURES } from '../scripts/apply-email-otp-mfa-schema.mjs';
import {
  EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION,
  emailMfaRetryFunctionSourceFingerprint,
  emailMfaRetryIdempotencyFingerprint,
  validateEmailMfaRetryIdempotencyEvidence,
  validateEmailMfaRetryIdempotencyMigrationSql,
  validateEmailMfaRetryPrepareDefinition,
} from '../scripts/apply-email-mfa-retry-idempotency-schema.mjs';

const migrationUrl = new URL(
  '../scripts/migrations/016-email-mfa-retry-idempotency.sql', import.meta.url,
);
const applierUrl = new URL(
  '../scripts/apply-email-mfa-retry-idempotency-schema.mjs', import.meta.url,
);
const migration = await readFile(migrationUrl, 'utf8');
const applier = await readFile(applierUrl, 'utf8');

function installedEvidence(definition = migration) {
  return {
    prepare: {
      signature: EMAIL_OTP_MFA_SIGNATURES.prepare,
      definition,
      securityDefiner: true,
      ownerMatches: true,
      safeSearchPath: true,
      language: 'plpgsql',
      volatility: 'v',
      returnType: 'jsonb',
      owner: 'neondb_owner',
      grants: ['municontrol_actions_runtime_app:EXECUTE', 'neondb_owner:EXECUTE'],
    },
  };
}

test('016 es una migracion separada, parseable y fingerprintable sin tocar 015', () => {
  assert.equal(
    EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION,
    '016-email-mfa-retry-idempotency',
  );
  assert.equal(validateEmailMfaRetryIdempotencyMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 4);
  assert.match(emailMfaRetryIdempotencyFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.equal(
    emailMfaRetryIdempotencyFingerprint(migration),
    emailMfaRetryIdempotencyFingerprint(migration),
  );
  assert.doesNotMatch(migration, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|ROLE|SCHEMA|DATABASE)\b/i);
});

test('preflight compara igual el cuerpo SQL con finales Windows o Linux', () => {
  const linuxBody = 'BEGIN\n  RETURN true;\nEND';
  const windowsBody = linuxBody.replaceAll('\n', '\r\n');
  assert.equal(
    emailMfaRetryFunctionSourceFingerprint(windowsBody),
    emailMfaRetryFunctionSourceFingerprint(linuxBody),
  );
});

test('retry exacto ignora expires_at recalculado y devuelve el vencimiento persistido', () => {
  assert.equal(validateEmailMfaRetryPrepareDefinition(migration), true);
  const replayAt = migration.indexOf(
    'WHERE prepare_idempotency_key = p_idempotency_key FOR UPDATE',
  );
  const replayReturnAt = migration.indexOf("'replayed', true", replayAt);
  const ttlAt = migration.indexOf("p_expires_at <= now_value + interval '1 minute'");
  assert.ok(replayAt >= 0 && replayReturnAt > replayAt && ttlAt > replayReturnAt);
  const replayContract = migration.slice(replayAt, ttlAt);
  assert.match(replayContract, /'expiresAt', replay\.expires_at/);
  assert.doesNotMatch(
    replayContract,
    /replay\.expires_at\s+IS\s+DISTINCT\s+FROM\s+p_expires_at/i,
  );
  assert.doesNotMatch(replayContract, /expires_at\s*=\s*p_expires_at/i);
});

test('idempotencia sigue ligando flow, version, factor, destino, delivery y code', () => {
  const replayAt = migration.indexOf(
    'WHERE prepare_idempotency_key = p_idempotency_key FOR UPDATE',
  );
  const ttlAt = migration.indexOf("p_expires_at <= now_value + interval '1 minute'");
  const replayContract = migration.slice(replayAt, ttlAt);
  for (const binding of [
    'replay.auth_challenge_id IS DISTINCT FROM auth_row.id',
    'replay.auth_challenge_version IS DISTINCT FROM p_expected_version',
    'replay.factor_id IS DISTINCT FROM factor_row.id',
    'replay.factor_version IS DISTINCT FROM factor_row.version',
    'replay.destination_hash IS DISTINCT FROM factor_row.destination_hash',
    'replay.delivery_attempt_id IS DISTINCT FROM p_delivery_attempt_id',
    'replay.code_hash IS DISTINCT FROM p_code_hash',
  ]) assert.match(replayContract, new RegExp(binding.replaceAll('.', '\\.')));
  assert.match(replayContract, /IDENTITY_EMAIL_MFA_IDEMPOTENCY_REUSED/);
});

test('desafios nuevos conservan TTL estricto, cooldown y supersession de 015', () => {
  const replayReturnAt = migration.indexOf("'replayed', true");
  const ttlAt = migration.indexOf("p_expires_at <= now_value + interval '1 minute'");
  const cooldownAt = migration.indexOf(
    "recent.issued_at > now_value - interval '45 seconds'",
  );
  const insertAt = migration.indexOf('INSERT INTO tenant_identity_email_otp_challenge');
  assert.ok(replayReturnAt < ttlAt && ttlAt < cooldownAt && cooldownAt < insertAt);
  assert.match(migration, /p_expires_at > now_value \+ interval '5 minutes'/);
  assert.match(migration, /IDENTITY_EMAIL_MFA_COOLDOWN/);
  assert.match(migration, /SET status = 'superseded'/);
  assert.match(migration, /factor_row\.destination_hash, p_delivery_attempt_id, p_code_hash, p_expires_at/);
});

test('ACL de 016 sigue fail-closed: SECDEF endurecido y solo EXECUTE runtime', () => {
  assert.equal(validateEmailMfaRetryIdempotencyEvidence(installedEvidence()), true);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(migration, /FROM PUBLIC CASCADE/);
  assert.match(migration, /aclexplode\(COALESCE\(/);
  assert.match(migration, /acl\.grantee <> function_row\.proowner/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION tenant_identity_prepare_email_mfa/);
  assert.doesNotMatch(migration, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)/i);

  const unsafe = installedEvidence();
  unsafe.prepare.grants.push('legacy_role:EXECUTE');
  assert.throws(
    () => validateEmailMfaRetryIdempotencyEvidence(unsafe),
    /ACL funcion 016 fuera de contrato/,
  );
});

test('validator adversarial rechaza expiracion material, binding incompleto y expansion ACL', () => {
  assert.throws(
    () => validateEmailMfaRetryIdempotencyMigrationSql(migration.replace(
      'OR replay.code_hash IS DISTINCT FROM p_code_hash THEN',
      'OR replay.code_hash IS DISTINCT FROM p_code_hash\n'
        + '       OR replay.expires_at IS DISTINCT FROM p_expires_at THEN',
    )),
    /expires_at recalculado como material/,
  );
  assert.throws(
    () => validateEmailMfaRetryIdempotencyMigrationSql(migration.replace(
      'OR replay.delivery_attempt_id IS DISTINCT FROM p_delivery_attempt_id',
      'OR false',
    )),
    /delivery_attempt_id/,
  );
  assert.throws(
    () => validateEmailMfaRetryIdempotencyMigrationSql(
      `${migration}\nGRANT SELECT ON tenant_identity_email_otp_challenge TO municontrol_actions_runtime_app;`,
    ),
    /amplia alcance/,
  );
});

test('aplicador exige 015, rama aislada, baseline, ledger y verificacion final', () => {
  assert.match(applier, /015-email-otp-mfa\.sql/);
  assert.match(applier, /EMAIL_OTP_MFA_MIGRATION_VERSION/);
  assert.match(applier, /directIsolatedDatabaseUrl\(\)/);
  assert.match(applier, /verifyBaselineFunction\(client\)/);
  assert.match(applier, /SELECT checksum_sha256 FROM schema_migrations/);
  assert.match(applier, /await client\.query\('BEGIN'\)/);
  assert.match(applier, /pg_advisory_xact_lock/);
  assert.match(applier, /verifyEmailMfaRetryIdempotencyFinalState\(client\)/);
  assert.match(applier, /verifyEmailOtpMfaFinalAcl\(client\)/);
  assert.match(applier, /await client\.query\('COMMIT'\)/);
  assert.match(applier, /await client\.query\('ROLLBACK'\)/);
  assert.match(applier, /reapply verificado/);
  assert.match(applier, /fresh apply/);
});
