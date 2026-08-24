import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  encryptEmailMfaDestination,
  hashIdentitySecret,
  identitySecrets,
} from '../lib/internal-identity-crypto.js';
import {
  EMAIL_OTP_MFA_MIGRATION_VERSION,
  emailOtpMfaFingerprint,
  verifyEmailOtpMfaFinalAcl,
} from './apply-email-otp-mfa-schema.mjs';
import { directIsolatedDatabaseUrl, stableJson } from './lib/canonical-import.mjs';

const MIGRATION_URL = new URL('./migrations/015-email-otp-mfa.sql', import.meta.url);
const EMAIL = /^[^\s@]+@[^\s@]+$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_ARGUMENTS = new Set([
  '--user-email',
  '--destination-email',
  '--reason',
  '--idempotency-key',
]);

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`Falta ${label}`);
  return text;
}

function normalizeEmail(value, label) {
  const email = required(value, label).toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) throw new Error(`${label} es invalido`);
  return email;
}

function cliOptions(argv) {
  const options = new Map();
  const input = Array.isArray(argv) ? argv.slice(2) : [];
  for (let index = 0; index < input.length; index += 1) {
    const argument = String(input[index] ?? '');
    if (argument === '--confirm-isolated-branch') continue;
    const equalsAt = argument.indexOf('=');
    const name = equalsAt < 0 ? argument : argument.slice(0, equalsAt);
    if (!SUPPORTED_ARGUMENTS.has(name)) {
      throw new Error(`Argumento no admitido: ${name || '(vacio)'}`);
    }
    if (options.has(name)) throw new Error(`Argumento repetido: ${name}`);
    let value;
    if (equalsAt >= 0) {
      value = argument.slice(equalsAt + 1);
    } else {
      index += 1;
      value = input[index];
      if (value === undefined || String(value).startsWith('--')) {
        throw new Error(`Falta valor para ${name}`);
      }
    }
    options.set(name, String(value));
  }
  return options;
}

function deterministicUuidV4(hexDigest) {
  const bytes = Buffer.from(hexDigest, 'hex').subarray(0, 16);
  if (bytes.length !== 16) throw new Error('No se pudo derivar la clave idempotente');
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function emailMfaFactorProvisionConfiguration(
  argv = process.argv,
  env = process.env,
) {
  const options = cliOptions(argv);
  const userEmail = normalizeEmail(
    options.get('--user-email') ?? env.IDENTITY_EMAIL_MFA_USER_EMAIL,
    '--user-email o IDENTITY_EMAIL_MFA_USER_EMAIL',
  );
  const destinationEmail = normalizeEmail(
    options.get('--destination-email') ?? env.IDENTITY_EMAIL_MFA_DESTINATION_EMAIL,
    '--destination-email o IDENTITY_EMAIL_MFA_DESTINATION_EMAIL',
  );
  const reason = required(
    options.get('--reason') ?? env.IDENTITY_EMAIL_MFA_PROVISION_REASON,
    '--reason o IDENTITY_EMAIL_MFA_PROVISION_REASON',
  );
  if (reason.length < 3 || reason.length > 500) {
    throw new Error('La razon operativa debe tener entre 3 y 500 caracteres');
  }
  const suppliedIdempotencyKey = String(
    options.get('--idempotency-key') ?? env.IDENTITY_EMAIL_MFA_PROVISION_IDEMPOTENCY_KEY ?? '',
  ).trim().toLowerCase();
  if (suppliedIdempotencyKey && !UUID_V4.test(suppliedIdempotencyKey)) {
    throw new Error('La clave idempotente debe ser un UUID v4 canonico');
  }
  return Object.freeze({ userEmail, destinationEmail, reason, suppliedIdempotencyKey });
}

export function emailMfaFactorProvisionMaterial(configuration, secrets, options = {}) {
  const destinationHash = hashIdentitySecret(
    `email-mfa-destination|${configuration.destinationEmail}`,
    secrets.tokenPepper,
  );
  const reasonHash = hashIdentitySecret(
    `email-mfa-provision-reason|${configuration.reason}`,
    secrets.tokenPepper,
  );
  const commandMaterial = stableJson({
    contract: 'email-mfa-factor-provision-v1',
    userEmail: configuration.userEmail,
    destinationHash,
    reasonHash,
  });
  const idempotencyDigest = hashIdentitySecret(
    `email-mfa-factor-idempotency|${commandMaterial}`,
    secrets.tokenPepper,
  );
  const idempotencyKey = configuration.suppliedIdempotencyKey
    || deterministicUuidV4(idempotencyDigest);
  const destinationCiphertext = encryptEmailMfaDestination(
    configuration.destinationEmail,
    secrets.encryptionKey,
    options.random ? { random: options.random } : undefined,
  );
  return Object.freeze({
    userEmail: configuration.userEmail,
    destinationCiphertext,
    destinationHash,
    reasonHash,
    idempotencyKey,
  });
}

function validateProvisionResult(value) {
  const result = value && typeof value === 'object' ? value : null;
  const version = Number(result?.version);
  if (!result
      || !UUID_V4.test(String(result.id || ''))
      || !['pending', 'verified'].includes(result.status)
      || !Number.isSafeInteger(version) || version < 1
      || typeof result.replayed !== 'boolean') {
    throw new Error('La funcion owner-only no devolvio evidencia verificable');
  }
  return Object.freeze({ status: result.status, version, replayed: result.replayed });
}

export async function provisionEmailMfaFactor(options = {}) {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const databaseUrl = directIsolatedDatabaseUrl(argv, env);
  const configuration = emailMfaFactorProvisionConfiguration(argv, env);
  const secrets = identitySecrets(env);
  const material = emailMfaFactorProvisionMaterial(configuration, secrets);
  const migration = await (options.readMigration ?? readFile)(MIGRATION_URL, 'utf8');
  const expectedChecksum = emailOtpMfaFingerprint(migration);
  const client = options.clientFactory
    ? options.clientFactory(databaseUrl)
    : new Client({ connectionString: databaseUrl });
  const verifyAcl = options.verifyAcl ?? verifyEmailOtpMfaFinalAcl;

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:email-mfa-factor-provision'))",
    );
    const installed = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [EMAIL_OTP_MFA_MIGRATION_VERSION],
    );
    if (installed.rowCount !== 1
        || String(installed.rows[0]?.checksum_sha256 || '').trim() !== expectedChecksum) {
      throw new Error(`Migracion ausente o con drift: ${EMAIL_OTP_MFA_MIGRATION_VERSION}`);
    }
    await verifyAcl(client);
    const provisioned = await client.query(`
      SELECT tenant_identity_provision_email_factor_v1(
        $1, $2, $3, $4, $5::uuid
      ) AS result
    `, [
      material.userEmail,
      material.destinationCiphertext,
      material.destinationHash,
      material.reasonHash,
      material.idempotencyKey,
    ]);
    if (provisioned.rowCount !== 1) {
      throw new Error('La funcion owner-only no devolvio una fila');
    }
    const evidence = validateProvisionResult(provisioned.rows[0]?.result);
    await verifyAcl(client);
    await client.query('COMMIT');
    return evidence;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const result = await provisionEmailMfaFactor();
  console.log(
    `factor MFA email: OK (estado ${result.status}, version ${result.version}, replay ${result.replayed}; sin PII ni secretos emitidos)`,
  );
}

const invokedAsScript = Boolean(
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url,
);
if (invokedAsScript) await main();
