import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';
import {
  EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION,
  EMAIL_FIRST_FACTOR_SIGNATURES,
  canonicalizeHistoricalPrepareDefinition,
  emailFirstFactorFunctionSourceFingerprint,
  emailFirstFactorLoginFingerprint,
  emailFirstFactorPolicyDecision,
  validateEmailFirstFactorEvidence,
  validateEmailFirstFactorFacadeDefinition,
  validateEmailFirstFactorMigrationSql,
  validateEmailFirstFactorSelectorDefinition,
} from '../scripts/apply-email-first-factor-login-schema.mjs';
import {
  validateEmailMfaRetryPrepareDefinition,
} from '../scripts/apply-email-mfa-retry-idempotency-schema.mjs';

const migrationUrl = new URL(
  '../scripts/migrations/020-email-first-factor-login.sql', import.meta.url,
);
const applierUrl = new URL(
  '../scripts/apply-email-first-factor-login-schema.mjs', import.meta.url,
);
const verifierUrl = new URL(
  '../scripts/verify-email-first-factor-login-live.mjs', import.meta.url,
);
const retryMigrationUrl = new URL(
  '../scripts/migrations/016-email-mfa-retry-idempotency.sql', import.meta.url,
);
const migration = await readFile(migrationUrl, 'utf8');
const applier = await readFile(applierUrl, 'utf8');
const verifier = await readFile(verifierUrl, 'utf8');
const retryMigration = await readFile(retryMigrationUrl, 'utf8');

function installedEvidence(definition = migration) {
  return {
    selector: {
      signature: EMAIL_FIRST_FACTOR_SIGNATURES.selector,
      definition,
      securityDefiner: true,
      ownerMatches: true,
      safeSearchPath: true,
      language: 'plpgsql',
      volatility: 'v',
      returnType: 'jsonb',
      owner: 'neondb_owner',
      grants: ['neondb_owner:EXECUTE'],
    },
    facade: {
      signature: EMAIL_FIRST_FACTOR_SIGNATURES.facade,
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

test('020 es separada, parseable, fingerprintable y no modifica 019 ni tablas', () => {
  assert.equal(
    EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION,
    '020-email-first-factor-login',
  );
  assert.equal(validateEmailFirstFactorMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 7);
  assert.match(emailFirstFactorLoginFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.doesNotMatch(migration, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|ROLE|SCHEMA|DATABASE)\b/i);
  assert.doesNotMatch(migration, /019-institutional-access-profiles\.sql/i);
});

test('factor email pending o verified lleva login privilegiado a login_mfa sin TOTP', () => {
  assert.equal(emailFirstFactorPolicyDecision({
    totpActive: false, emailLive: true, privilegedContext: true,
  }), 'login_mfa');
  assert.match(migration, /tenant_identity_email_factor[\s\S]+status IN \('pending', 'verified'\)/);
  assert.match(migration, /IF totp_factor_active OR email_factor_live THEN[\s\S]+SET purpose = 'login_mfa'/);
  assert.match(migration, /'emailMfaAvailable', email_factor_live/);
});

test('sin ningun factor el contexto privilegiado sigue exigiendo enrollment', () => {
  assert.equal(emailFirstFactorPolicyDecision({
    totpActive: false, emailLive: false, privilegedContext: true,
  }), 'login_enrollment');
  const factorAt = migration.indexOf('IF totp_factor_active OR email_factor_live THEN');
  const privilegedAt = migration.indexOf('ELSIF privileged_context THEN');
  const enrollmentAt = migration.indexOf("SET purpose = 'login_enrollment'", privilegedAt);
  assert.ok(factorAt >= 0 && privilegedAt > factorAt && enrollmentAt > privilegedAt);
  assert.match(migration.slice(privilegedAt, enrollmentAt), /IDENTITY_MFA_REQUIRED/);
});

test('admin read-only no sensible y sin factores conserva sesion password', () => {
  assert.equal(emailFirstFactorPolicyDecision({
    totpActive: false, emailLive: false, privilegedContext: false,
  }), 'password_session');
  const privilegedAt = migration.indexOf('ELSIF privileged_context THEN');
  const passwordAt = migration.indexOf("'password'", privilegedAt);
  assert.ok(passwordAt > privilegedAt);
  assert.match(migration.slice(privilegedAt, passwordAt + 40), /tenant_identity_create_session/);
});

test('TOTP activo conserva exactamente el flujo MFA existente', () => {
  assert.equal(emailFirstFactorPolicyDecision({
    totpActive: true, emailLive: false, privilegedContext: false,
  }), 'login_mfa');
  assert.match(migration, /tenant_identity_mfa_factor[\s\S]+factor\.status = 'active'/);
  assert.doesNotMatch(
    migration,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+tenant_identity_(?:email_factor|mfa_factor)\b/i,
  );
});

test('selector mantiene contexto, version, expiracion, idempotencia y auditoria', () => {
  assert.equal(validateEmailFirstFactorSelectorDefinition(migration), true);
  for (const token of [
    "challenge.status <> 'pending'",
    'challenge.version IS DISTINCT FROM p_expected_version',
    'lower(challenge.user_email) <> actor_email',
    "p_payload->>'sessionExpiresAt' IS NULL",
    'invalid_datetime_format',
    'tenant_identity_access_payload(challenge.user_email, tenant_id_value)',
    'tenant_identity_create_session(',
    'INSERT INTO tenant_iam_event',
    'p_idempotency_key, p_command_hash',
  ]) assert.ok(migration.includes(token), `falta contrato selector: ${token}`);
});

test('facade solo intercepta select_login_context y conserva el core 009', () => {
  assert.equal(validateEmailFirstFactorFacadeDefinition(migration), true);
  assert.match(migration, /IF p_command = 'select_login_context' THEN[\s\S]+tenant_identity_select_login_context_email_v1/);
  assert.match(migration, /RETURN tenant_identity_apply_command_core_009/);
  assert.doesNotMatch(migration, /ALTER FUNCTION tenant_identity_apply_command_core_009/i);
});

test('ACL 020 deja selector owner-only y facade owner mas runtime', () => {
  assert.equal(validateEmailFirstFactorEvidence(installedEvidence()), true);
  assert.match(migration, /FROM PUBLIC CASCADE/);
  assert.match(migration, /acl\.grantee <> function_row\.proowner/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION tenant_identity_apply_command/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION tenant_identity_select_login_context_email_v1[\s\S]+TO municontrol_actions_runtime_app/i);

  const unsafe = installedEvidence();
  unsafe.selector.grants.push('municontrol_actions_runtime_app:EXECUTE');
  assert.throws(
    () => validateEmailFirstFactorEvidence(unsafe),
    /ACL selector 020 fuera de contrato/,
  );
});

test('validadores adversariales rechazan bypass sin factor y mutacion de factores', () => {
  assert.throws(
    () => validateEmailFirstFactorMigrationSql(migration.replace(
      'ELSIF privileged_context THEN',
      'ELSIF false THEN',
    )),
    /privileged_context/,
  );
  assert.throws(
    () => validateEmailFirstFactorMigrationSql(migration.replace(
      'SELECT EXISTS (\n    SELECT 1 FROM tenant_identity_email_factor factor',
      'UPDATE tenant_identity_email_factor SET status = status;\n'
        + '  SELECT EXISTS (\n    SELECT 1 FROM tenant_identity_email_factor factor',
    )),
    /modifica factores|amplia esquema/,
  );
  assert.throws(
    () => validateEmailFirstFactorEvidence({
      ...installedEvidence(),
      facade: { ...installedEvidence().facade, safeSearchPath: false },
    }),
    /facade 020 instalada fuera de contrato/,
  );
});

test('aplicador exige 016 y 019, rama aislada, baseline, ledger y estado final', () => {
  assert.match(applier, /016-email-mfa-retry-idempotency\.sql/);
  assert.match(applier, /019-institutional-access-profiles\.sql/);
  assert.match(applier, /directIsolatedDatabaseUrl\(\)/);
  assert.match(applier, /verifyBaselineFacade\(client\)/);
  assert.match(applier, /verifyScopedEmailMfaPrerequisite\(client\)/);
  assert.match(applier, /validateEmailMfaRetryIdempotencyEvidence/);
  assert.match(applier, /validateEmailOtpMfaEvidence/);
  assert.doesNotMatch(applier, /verifyEmailMfaRetryIdempotencyFinalState/);
  assert.match(applier, /SELECT checksum_sha256 FROM schema_migrations/);
  assert.match(applier, /await client\.query\('BEGIN'\)/);
  assert.match(applier, /pg_advisory_xact_lock/);
  assert.match(applier, /verifyEmailFirstFactorFinalState\(client\)/);
  assert.match(applier, /await client\.query\('COMMIT'\)/);
  assert.match(applier, /await client\.query\('ROLLBACK'\)/);
});

test('verificador 020 tolera el deparser SET search_path TO sin relajar 016', () => {
  const deparsed = retryMigration.replace(
    'SET search_path = pg_catalog, public, pg_temp',
    "SET search_path TO 'pg_catalog', 'public', 'pg_temp'",
  );
  assert.throws(
    () => validateEmailMfaRetryPrepareDefinition(deparsed),
    /set search_path/,
  );
  assert.equal(validateEmailMfaRetryPrepareDefinition(
    canonicalizeHistoricalPrepareDefinition(deparsed),
  ), true);
  assert.match(applier, /safeSearchPath/);
  assert.match(applier, /validateEmailMfaRetryIdempotencyEvidence/);
  const unsafePath = deparsed.replace("'pg_temp'", "'attacker'");
  assert.equal(canonicalizeHistoricalPrepareDefinition(unsafePath), unsafePath);
});

test('evidencia instalada 020 tolera SET search_path TO en selector y facade', () => {
  const deparsed = migration.replaceAll(
    'SET search_path = pg_catalog, public, pg_temp',
    "SET search_path TO 'pg_catalog', 'public', 'pg_temp'",
  );
  assert.throws(
    () => validateEmailFirstFactorSelectorDefinition(deparsed),
    /set search_path/,
  );
  assert.equal(validateEmailFirstFactorEvidence(installedEvidence(deparsed)), true);

  const unsafePath = deparsed.replaceAll("'pg_temp'", "'attacker'");
  assert.throws(
    () => validateEmailFirstFactorEvidence(installedEvidence(unsafePath)),
    /set search_path/,
  );
});

test('verificador live es read-only y tambien exige rama aislada', () => {
  assert.match(verifier, /directIsolatedDatabaseUrl\(\)/);
  assert.match(verifier, /BEGIN READ ONLY/);
  assert.match(verifier, /emailFirstFactorLoginFingerprint/);
  assert.match(verifier, /checksum_sha256[\s\S]+expectedChecksum/);
  assert.match(verifier, /verifyEmailFirstFactorFinalState\(client\)/);
  assert.doesNotMatch(verifier, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
});

test('fingerprint de funcion tolera finales Windows y Linux', () => {
  const linuxBody = 'BEGIN\n  RETURN true;\nEND';
  assert.equal(
    emailFirstFactorFunctionSourceFingerprint(linuxBody.replaceAll('\n', '\r\n')),
    emailFirstFactorFunctionSourceFingerprint(linuxBody),
  );
});
