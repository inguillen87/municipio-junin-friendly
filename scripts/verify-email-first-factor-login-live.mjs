import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directIsolatedDatabaseUrl } from './lib/canonical-import.mjs';
import {
  EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION,
  emailFirstFactorLoginFingerprint,
  verifyEmailFirstFactorFinalState,
} from './apply-email-first-factor-login-schema.mjs';

const MIGRATION_URL = new URL(
  './migrations/020-email-first-factor-login.sql', import.meta.url,
);

export async function verifyEmailFirstFactorLive(options = {}) {
  const client = options.client || new Client({
    connectionString: options.connectionString || directIsolatedDatabaseUrl(),
  });
  const ownsClient = !options.client;
  if (ownsClient) await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const expectedChecksum = emailFirstFactorLoginFingerprint(
      await readFile(MIGRATION_URL, 'utf8'),
    );
    const ledger = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION],
    );
    if (ledger.rowCount !== 1
        || String(ledger.rows[0].checksum_sha256 || '').trim() !== expectedChecksum) {
      throw new Error(`${EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION} no esta ledgerada o tiene drift`);
    }
    await verifyEmailFirstFactorFinalState(client);
    await client.query('ROLLBACK');
    return Object.freeze({
      migration: EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION,
      verified: true,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    if (ownsClient) await client.end().catch(() => undefined);
  }
}

async function main() {
  const result = await verifyEmailFirstFactorLive();
  console.log(`${result.migration}: verificacion read-only OK`);
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
