import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

export const MAX_LOGICAL_IMPORT_BYTES = 400 * 1024 * 1024;

const ISOLATED_BRANCH_FLAG = '--confirm-isolated-branch';
const PRODUCTION_BRANCH_FLAG_PREFIX = '--confirm-production-branch=';

function parseDirectPostgresUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL_UNPOOLED no es una URL PostgreSQL valida.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('DATABASE_URL_UNPOOLED no es una URL PostgreSQL valida.');
  }
  if (parsed.hostname.includes('-pooler.')) {
    throw new Error('DATABASE_URL_UNPOOLED apunta a un endpoint pooled; se requiere conexion directa.');
  }
  return parsed;
}

function requiredProductionIdentifier(value, variableName, pattern) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`Falta ${variableName}`);
  if (!pattern.test(text)) throw new Error(`${variableName} tiene un formato invalido.`);
  return text;
}

function requiredProductionHost(value) {
  const host = requiredProductionIdentifier(
    value,
    'CANONICAL_PRODUCTION_HOST',
    /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/,
  );
  if (host.includes('-pooler.')) {
    throw new Error('CANONICAL_PRODUCTION_HOST debe identificar el endpoint directo, no el pooled.');
  }
  return host;
}

function productionBranchConfirmation(argv) {
  const confirmations = argv.filter((argument) => argument.startsWith(PRODUCTION_BRANCH_FLAG_PREFIX));
  if (confirmations.length > 1) {
    throw new Error('La confirmacion de rama de produccion esta repetida.');
  }
  if (!confirmations.length) return null;
  return requiredProductionIdentifier(
    confirmations[0].slice(PRODUCTION_BRANCH_FLAG_PREFIX.length),
    '--confirm-production-branch',
    /^br-[a-z0-9-]+$/,
  );
}

/**
 * Resolve the only database URL canonical writers and acceptance checks may use.
 *
 * Isolated-branch mode intentionally preserves the original CLI contract. The
 * production mode is deliberately more verbose: the branch id is repeated in
 * the command and environment, while the direct endpoint host and database are
 * independently pinned in the environment. None of these checks logs or embeds
 * credentials.
 */
export function resolveCanonicalDatabaseTarget(argv = process.argv, env = process.env) {
  const isolatedConfirmed = argv.includes(ISOLATED_BRANCH_FLAG);
  const productionBranchId = productionBranchConfirmation(argv);
  if (isolatedConfirmed && productionBranchId) {
    throw new Error('Las confirmaciones de rama aislada y produccion son mutuamente excluyentes.');
  }
  if (!isolatedConfirmed && !productionBranchId) {
    throw new Error(
      `Falta ${ISOLATED_BRANCH_FLAG} o ${PRODUCTION_BRANCH_FLAG_PREFIX}<branch-id>.`,
    );
  }

  const databaseUrl = env.DATABASE_URL_UNPOOLED;
  if (!databaseUrl) throw new Error('Falta DATABASE_URL_UNPOOLED');
  const parsed = parseDirectPostgresUrl(databaseUrl);

  if (isolatedConfirmed) {
    if (env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') {
      throw new Error('El proceso canonico no puede usar el modo aislado desde un entorno marcado como produccion.');
    }
    const knownProductionHost = String(env.CANONICAL_PRODUCTION_HOST ?? '').trim();
    if (knownProductionHost && parsed.hostname === requiredProductionHost(knownProductionHost)) {
      throw new Error('El endpoint coincide con CANONICAL_PRODUCTION_HOST; use la confirmacion de produccion.');
    }
    return Object.freeze({ databaseUrl, mode: 'isolated', branchId: null });
  }

  const expectedBranchId = requiredProductionIdentifier(
    env.CANONICAL_PRODUCTION_BRANCH_ID,
    'CANONICAL_PRODUCTION_BRANCH_ID',
    /^br-[a-z0-9-]+$/,
  );
  if (productionBranchId !== expectedBranchId) {
    throw new Error('La rama confirmada no coincide con CANONICAL_PRODUCTION_BRANCH_ID.');
  }

  const expectedHost = requiredProductionHost(env.CANONICAL_PRODUCTION_HOST);
  if (parsed.hostname !== expectedHost) {
    throw new Error('El host de DATABASE_URL_UNPOOLED no coincide con CANONICAL_PRODUCTION_HOST.');
  }

  const expectedDatabase = requiredProductionIdentifier(
    env.CANONICAL_PRODUCTION_DATABASE,
    'CANONICAL_PRODUCTION_DATABASE',
    /^[A-Za-z_][A-Za-z0-9_$-]*$/,
  );
  let actualDatabase;
  try {
    actualDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('La base de DATABASE_URL_UNPOOLED no tiene un formato valido.');
  }
  if (actualDatabase !== expectedDatabase) {
    throw new Error('La base de DATABASE_URL_UNPOOLED no coincide con CANONICAL_PRODUCTION_DATABASE.');
  }

  return Object.freeze({ databaseUrl, mode: 'production', branchId: productionBranchId });
}

export function directCanonicalDatabaseUrl(argv = process.argv, env = process.env) {
  return resolveCanonicalDatabaseTarget(argv, env).databaseUrl;
}

export function directIsolatedDatabaseUrl(argv = process.argv, env = process.env) {
  const target = resolveCanonicalDatabaseTarget(argv, env);
  if (target.mode !== 'isolated') {
    throw new Error('directIsolatedDatabaseUrl solo admite una rama aislada.');
  }
  return target.databaseUrl;
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Text(value, { uppercase = false } = {}) {
  const digest = createHash('sha256').update(String(value)).digest('hex');
  return uppercase ? digest.toUpperCase() : digest;
}

export async function sha256File(path, { uppercase = true } = {}) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  const value = digest.digest('hex');
  return uppercase ? value.toUpperCase() : value;
}

export function requiredText(value, fieldName) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`Falta ${fieldName}`);
  return text;
}

export function requiredInteger(value, fieldName) {
  const text = requiredText(value, fieldName);
  if (!/^-?\d+$/.test(text)) throw new Error(`${fieldName} no es entero: ${text}`);
  const parsed = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${fieldName} excede el rango entero seguro: ${text}`);
  return parsed;
}

export function nullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export function postgresJson(value) {
  return JSON.stringify(value, (_key, nestedValue) =>
    typeof nestedValue === 'string' ? nestedValue.replaceAll('\u0000', '\\u0000') : nestedValue,
  );
}

export async function readVerifiedJson(path, descriptor, label) {
  const buffer = await readFile(path);
  const actualHash = createHash('sha256').update(buffer).digest('hex').toUpperCase();
  const expectedHash = requiredText(descriptor?.sha256, `${label}.sha256`).toUpperCase();
  if (actualHash !== expectedHash) {
    throw new Error(`SHA-256 invalido en ${label}: ${actualHash} != ${expectedHash}`);
  }
  if (descriptor?.bytes !== undefined && buffer.length !== Number(descriptor.bytes)) {
    throw new Error(`Tamano invalido en ${label}: ${buffer.length} != ${descriptor.bytes}`);
  }
  let value;
  try {
    value = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new Error(`JSON invalido en ${label}: ${error.message}`);
  }
  if (Array.isArray(value) && descriptor?.records !== undefined && value.length !== Number(descriptor.records)) {
    throw new Error(`Conteo invalido en ${label}: ${value.length} != ${descriptor.records}`);
  }
  return { value, bytes: buffer.length, sha256: actualHash };
}

/**
 * Iterate the deterministic JSON-array format emitted by extract_grh_core.py.
 * It deliberately rejects minified/multiline records so a changed producer
 * cannot be imported under an accidentally weaker parser contract.
 */
export async function* streamDeterministicJsonArray(path) {
  const input = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let opened = false;
  let closed = false;
  let rowNumber = 0;

  for await (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    if (!opened) {
      if (line !== '[') throw new Error(`${path}: se esperaba '[' en la primera linea`);
      opened = true;
      continue;
    }
    if (line === ']') {
      closed = true;
      continue;
    }
    if (closed) throw new Error(`${path}: contenido despues del cierre del array`);
    if (line.endsWith(',')) line = line.slice(0, -1);
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`${path}: registro JSON invalido en fila ${rowNumber + 1}: ${error.message}`);
    }
    if (!record || Array.isArray(record) || typeof record !== 'object') {
      throw new Error(`${path}: la fila ${rowNumber + 1} no es un objeto JSON`);
    }
    rowNumber += 1;
    yield record;
  }
  if (!opened || !closed) throw new Error(`${path}: array JSON incompleto`);
}

export async function verifyStreamArtifact(path, descriptor, label) {
  const fileStat = await stat(path);
  const expectedBytes = Number(descriptor?.bytes);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0) {
    throw new Error(`Falta un tamano valido en ${label}`);
  }
  if (fileStat.size !== expectedBytes) {
    throw new Error(`Tamano invalido en ${label}: ${fileStat.size} != ${expectedBytes}`);
  }
  const actualHash = await sha256File(path);
  const expectedHash = requiredText(descriptor?.sha256, `${label}.sha256`).toUpperCase();
  if (actualHash !== expectedHash) {
    throw new Error(`SHA-256 invalido en ${label}: ${actualHash} != ${expectedHash}`);
  }
  let records = 0;
  for await (const _record of streamDeterministicJsonArray(path)) records += 1;
  if (records !== Number(descriptor?.records)) {
    throw new Error(`Conteo invalido en ${label}: ${records} != ${descriptor?.records}`);
  }
  return { bytes: fileStat.size, records, sha256: actualHash };
}

export function enforceLogicalSizeGate(artifacts, maximumBytes = MAX_LOGICAL_IMPORT_BYTES) {
  const bytes = artifacts.reduce((total, artifact) => total + Number(artifact.bytes ?? 0), 0);
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Estimacion logica de importacion invalida.');
  if (bytes > maximumBytes) {
    throw new Error(
      `Importacion detenida por costo: ${bytes} bytes logicos exceden el limite de ${maximumBytes} bytes.`,
    );
  }
  return bytes;
}

export async function forEachBatch(iterable, batchSize, callback) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize debe ser positivo.');
  let batch = [];
  let total = 0;
  for await (const value of iterable) {
    batch.push(value);
    if (batch.length === batchSize) {
      await callback(batch, total);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await callback(batch, total);
    total += batch.length;
  }
  return total;
}
