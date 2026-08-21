import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl, stableJson } from './lib/canonical-import.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;
const CONFIRMATION = 'BOOTSTRAP_SECOND_PLATFORM_OWNER';

function required(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`Falta ${name}`);
  return normalized;
}

function deterministicUuidV4(value) {
  const bytes = Buffer.from(createHash('sha256').update(value).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function secondaryOwnerBootstrapConfiguration(env = process.env) {
  const existingOwnerEmail = required(
    env.PLATFORM_OWNER_EXISTING_EMAIL, 'PLATFORM_OWNER_EXISTING_EMAIL',
  ).toLowerCase();
  const targetEmail = required(
    env.PLATFORM_OWNER_SECONDARY_EMAIL, 'PLATFORM_OWNER_SECONDARY_EMAIL',
  ).toLowerCase();
  const authorizationHash = required(
    env.PLATFORM_OWNER_AUTHORIZATION_SHA256, 'PLATFORM_OWNER_AUTHORIZATION_SHA256',
  ).toLowerCase();
  const operatorApprovalHash = required(
    env.PLATFORM_OWNER_OPERATOR_APPROVAL_SHA256, 'PLATFORM_OWNER_OPERATOR_APPROVAL_SHA256',
  ).toLowerCase();
  const changeTicket = required(
    env.PLATFORM_OWNER_CHANGE_TICKET, 'PLATFORM_OWNER_CHANGE_TICKET',
  );
  const confirmation = required(
    env.PLATFORM_OWNER_SECONDARY_CONFIRM, 'PLATFORM_OWNER_SECONDARY_CONFIRM',
  );
  if (!EMAIL.test(existingOwnerEmail) || existingOwnerEmail.length > 254
      || !EMAIL.test(targetEmail) || targetEmail.length > 254
      || existingOwnerEmail === targetEmail) {
    throw new Error('Los emails del bootstrap secundario son invalidos o no son distintos');
  }
  if (!SHA256.test(authorizationHash) || !SHA256.test(operatorApprovalHash)
      || authorizationHash === operatorApprovalHash) {
    throw new Error('Las dos evidencias deben ser hashes SHA-256 hexadecimales distintos');
  }
  if (changeTicket.length < 3 || changeTicket.length > 120) {
    throw new Error('PLATFORM_OWNER_CHANGE_TICKET debe tener entre 3 y 120 caracteres');
  }
  if (confirmation !== CONFIRMATION) {
    throw new Error(`PLATFORM_OWNER_SECONDARY_CONFIRM debe ser ${CONFIRMATION}`);
  }
  return Object.freeze({
    existingOwnerEmail, targetEmail, authorizationHash, operatorApprovalHash, changeTicket,
  });
}

async function main() {
  const config = secondaryOwnerBootstrapConfiguration();
  const commandMaterial = stableJson({ version: 1, ...config });
  const commandHash = createHash('sha256').update(commandMaterial).digest('hex');
  const idempotencyKey = deterministicUuidV4(`platform-owner-secondary:${commandMaterial}`);
  const client = new Client({ connectionString: directCanonicalDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT platform_owner_bootstrap_secondary_v1(
        $1, $2, $3, $4, $5, $6::uuid, $7
      ) AS result
    `, [
      config.existingOwnerEmail, config.targetEmail,
      config.authorizationHash, config.operatorApprovalHash, config.changeTicket,
      idempotencyKey, commandHash,
    ]);
    if (result.rowCount !== 1 || result.rows[0]?.result?.assignment?.active !== true) {
      throw new Error('El bootstrap secundario no devolvio una asignacion activa verificable');
    }
    await client.query('COMMIT');
    console.log('bootstrap secundario PLATFORM_OWNER: OK (sin credenciales ni secretos emitidos)');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url,
);
if (invokedAsScript) await main();
