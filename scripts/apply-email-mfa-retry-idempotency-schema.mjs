import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directIsolatedDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import {
  EMAIL_OTP_MFA_MIGRATION_VERSION,
  EMAIL_OTP_MFA_SIGNATURES,
  emailOtpMfaFingerprint,
  verifyEmailOtpMfaFinalAcl,
} from './apply-email-otp-mfa-schema.mjs';

export const EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION =
  '016-email-mfa-retry-idempotency';
const MIGRATION_URL = new URL(
  './migrations/016-email-mfa-retry-idempotency.sql', import.meta.url,
);
const PREREQUISITE_URL = new URL('./migrations/015-email-otp-mfa.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const PREPARE_SIGNATURE = EMAIL_OTP_MFA_SIGNATURES.prepare;

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function exactSet(actual, expected, label) {
  const got = [...new Set(actual || [])].map(String).sort();
  const wanted = [...new Set(expected || [])].map(String).sort();
  if (JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

function functionBodyFromMigration(sql, functionName) {
  const source = String(sql || '');
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${functionName}(`);
  if (start < 0) throw new Error(`fuente SQL ausente para ${functionName}`);
  const bodyMarker = source.indexOf('AS $$', start);
  const bodyStart = bodyMarker < 0 ? -1 : bodyMarker + 'AS $$'.length;
  const bodyEnd = bodyStart < 0 ? -1 : source.indexOf('$$;', bodyStart);
  if (bodyStart < 0 || bodyEnd < bodyStart) {
    throw new Error(`cuerpo SQL incompleto para ${functionName}`);
  }
  return source.slice(bodyStart, bodyEnd);
}

export function emailMfaRetryIdempotencyFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function emailMfaRetryFunctionSourceFingerprint(value) {
  const canonical = String(value || '').replace(/\r\n?/g, '\n').trim();
  return createHash('sha256').update(canonical).digest('hex');
}

export function validateEmailMfaRetryPrepareDefinition(definition) {
  const body = normalized(definition);
  for (const token of [
    'tenant_identity_prepare_email_mfa(',
    'security definer',
    'set search_path = pg_catalog, public, pg_temp',
    "p_expires_at is null",
    "where flow_hash = p_flow_hash for update",
    "auth_row.purpose <> 'login_mfa'",
    "auth_row.status <> 'pending'",
    'auth_row.expires_at <= now_value',
    'auth_row.version is distinct from p_expected_version',
    "status in ('pending', 'verified') for update",
    'where prepare_idempotency_key = p_idempotency_key for update',
    'replay.auth_challenge_id is distinct from auth_row.id',
    'replay.auth_challenge_version is distinct from p_expected_version',
    'replay.factor_id is distinct from factor_row.id',
    'replay.factor_version is distinct from factor_row.version',
    'replay.destination_hash is distinct from factor_row.destination_hash',
    'replay.delivery_attempt_id is distinct from p_delivery_attempt_id',
    'replay.code_hash is distinct from p_code_hash',
    "raise exception 'identity_email_mfa_idempotency_reused'",
    "'expiresat', replay.expires_at",
    "'replayed', true",
    "p_expires_at <= now_value + interval '1 minute'",
    "p_expires_at > now_value + interval '5 minutes'",
    "recent.issued_at > now_value - interval '45 seconds'",
    "raise exception 'identity_email_mfa_cooldown'",
    "set status = 'superseded'",
    "'expiresat', created.expires_at",
    "'replayed', false",
  ]) {
    if (!body.includes(normalized(token))) {
      throw new Error(`funcion 016 incompleta: ${token}`);
    }
  }

  const replayLookupAt = body.indexOf('where prepare_idempotency_key = p_idempotency_key for update');
  const replayReturnAt = body.indexOf("'replayed', true", replayLookupAt);
  const ttlAt = body.indexOf("p_expires_at <= now_value + interval '1 minute'");
  const cooldownAt = body.indexOf("recent.issued_at > now_value - interval '45 seconds'");
  if (!(replayLookupAt >= 0 && replayReturnAt > replayLookupAt
      && ttlAt > replayReturnAt && cooldownAt > ttlAt)) {
    throw new Error('funcion 016 altera el orden replay -> TTL nuevo -> cooldown');
  }

  const replayContract = body.slice(replayLookupAt, ttlAt);
  if (/replay\.expires_at\s+is\s+distinct\s+from\s+p_expires_at/i.test(replayContract)
      || /(?:update|set)\s+[\s\S]*?expires_at\s*=\s*p_expires_at/i.test(replayContract)) {
    throw new Error('funcion 016 trata expires_at recalculado como material en replay');
  }
  if (body.indexOf('p_expires_at is null') > replayLookupAt) {
    throw new Error('funcion 016 permite expires_at nulo en replay');
  }
  return true;
}

export function validateEmailMfaRetryIdempotencyMigrationSql(sql) {
  const source = String(sql || '');
  if ((source.match(/CREATE OR REPLACE FUNCTION/gi) || []).length !== 1) {
    throw new Error('migracion 016 debe reemplazar una sola funcion');
  }
  validateEmailMfaRetryPrepareDefinition(source);
  for (const token of [
    'COMMENT ON FUNCTION tenant_identity_prepare_email_mfa',
    'REVOKE ALL ON FUNCTION tenant_identity_prepare_email_mfa',
    'FROM PUBLIC CASCADE',
    'aclexplode(COALESCE(',
    'acl.grantee <> function_row.proowner',
    'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s CASCADE',
    'GRANT EXECUTE ON FUNCTION tenant_identity_prepare_email_mfa',
    'TO municontrol_actions_runtime_app',
  ]) {
    if (!normalized(source).includes(normalized(token))) {
      throw new Error(`migracion 016 incompleta: ${token}`);
    }
  }
  if (/\b(?:create|alter|drop)\s+(?:table|role|schema|database)\b/i.test(source)
      || /\bgrant\s+(?!execute\b)/i.test(source)
      || /guillen|gmail\.com|marcelo@|\b(?:raw_code|plain_code|otp_code)\b/i.test(source)) {
    throw new Error('migracion 016 amplia alcance, ACL o material sensible');
  }
  return true;
}

export function validateEmailMfaRetryIdempotencyEvidence(evidence) {
  const entry = evidence?.prepare;
  if (!entry || entry.signature !== PREPARE_SIGNATURE
      || entry.securityDefiner !== true || entry.ownerMatches !== true
      || entry.safeSearchPath !== true || entry.language !== 'plpgsql'
      || entry.volatility !== 'v' || entry.returnType !== 'jsonb') {
    throw new Error('funcion 016 instalada fuera de contrato');
  }
  validateEmailMfaRetryPrepareDefinition(entry.definition);
  exactSet(entry.grants, [
    `${entry.owner}:EXECUTE`, `${RUNTIME_ROLE}:EXECUTE`,
  ], 'ACL funcion 016');
  return true;
}

async function collectEvidence(client) {
  const result = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      pg_get_functiondef(function_row.oid) AS definition,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownerMatches",
      function_row.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
        AS "safeSearchPath",
      language.lanname AS language,
      function_row.provolatile AS volatility,
      pg_get_function_result(function_row.oid) AS "returnType",
      owner.rolname AS owner,
      COALESCE((SELECT array_agg(COALESCE(grantee.rolname, 'PUBLIC') || ':' || acl.privilege_type
          ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type)
        FROM aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee), ARRAY[]::text[]) AS grants
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_language language ON language.oid = function_row.prolang
    JOIN pg_roles owner ON owner.oid = function_row.proowner
    WHERE function_row.oid = $1::regprocedure
  `, [PREPARE_SIGNATURE]);
  return { prepare: result.rows?.[0] || null };
}

export async function verifyEmailMfaRetryIdempotencyFinalState(client) {
  validateEmailMfaRetryIdempotencyEvidence(await collectEvidence(client));
  await verifyEmailOtpMfaFinalAcl(client);
  return true;
}

async function verifyPrerequisite(client) {
  const expected = emailOtpMfaFingerprint(await readFile(PREREQUISITE_URL, 'utf8'));
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [EMAIL_OTP_MFA_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${EMAIL_OTP_MFA_MIGRATION_VERSION}`);
  }
}

async function verifyBaselineFunction(client) {
  const baselineMigration = await readFile(PREREQUISITE_URL, 'utf8');
  const expectedSource = functionBodyFromMigration(
    baselineMigration, 'tenant_identity_prepare_email_mfa',
  );
  const installed = await client.query(
    'SELECT prosrc FROM pg_proc WHERE oid = $1::regprocedure',
    [PREPARE_SIGNATURE],
  );
  if (installed.rowCount !== 1
      || emailMfaRetryFunctionSourceFingerprint(installed.rows[0].prosrc)
        !== emailMfaRetryFunctionSourceFingerprint(expectedSource)) {
    throw new Error('drift previo no ledgerado en tenant_identity_prepare_email_mfa');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateEmailMfaRetryIdempotencyMigrationSql(migration);
  const fingerprint = emailMfaRetryIdempotencyFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directIsolatedDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:email-mfa-retry-016'))",
    );
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyEmailOtpMfaFinalAcl(client);
      await verifyBaselineFunction(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyEmailMfaRetryIdempotencyFinalState(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION}: reapply verificado (SHA-256 ${fingerprint})`
      : `${EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION}: fresh apply (${statements.length} sentencias, SHA-256 ${fingerprint})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
