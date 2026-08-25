import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ATTENDANCE_INGEST_CONTRACT_VERSION,
  createDefaultAttendanceDriverRegistry,
} from '../lib/internal-attendance-gateway.js';

export const ATTENDANCE_AGENT_CONTRACT_VERSION = 'attendance-gateway-agent.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BATCH_KEY = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;
const DRIVER = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const CONNECTOR_KEY = /^[a-z0-9][a-z0-9._-]{7,127}$/;
const SITE_DEVICE_KEY = /^[a-z0-9][a-z0-9._-]{1,95}$/;
const RECEIPT_FIELDS = new Set([
  'ok', 'batchId', 'status', 'acceptedCount', 'duplicateCount',
  'unmappedCount', 'ambiguousCount', 'replayed',
]);
const MAX_INPUT_BYTES = 4 * 1024 * 1024;

function fail(message, code = 'ATTENDANCE_AGENT_INVALID') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function exactObject(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} debe ser un objeto`);
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) fail(`${label} contiene ${extra}`);
}

function safeBatchKey(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!BATCH_KEY.test(text)) fail('batchKey es inválido');
  return text;
}

function databaseKey(value, field, min, max, pattern) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (text.length < min || text.length > max || !pattern.test(text)) fail(`${field} es inválido`);
  return text;
}

function connectorKey(value) {
  return databaseKey(value, 'connectorKey', 8, 128, CONNECTOR_KEY);
}

function siteDeviceKey(value, field) {
  return databaseKey(value, field, 2, 96, SITE_DEVICE_KEY);
}

function safeDriverKey(value) {
  const valueKey = databaseKey(value, 'driverKey', 3, 64, DRIVER);
  if (!DRIVER.test(valueKey)) fail('driverKey es inválido');
  return valueKey;
}

function safeTimezone(value) {
  const timezone = typeof value === 'string' ? value.trim() : '';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
    return timezone;
  } catch {
    fail('timezone no es una zona IANA válida');
  }
  return '';
}

export function validateAttendanceAgentConfig(input, { allowLocalhost = false } = {}) {
  const fields = new Set([
    'contractVersion', 'endpoint', 'tenantId', 'connectorKey', 'driverKey', 'transport',
    'deviceExternalKey', 'siteExternalKey', 'timezone', 'utcOffsetMinutes',
  ]);
  exactObject(input, fields, 'config');
  for (const field of fields) if (!Object.hasOwn(input, field)) fail(`Falta config.${field}`);
  if (input.contractVersion !== ATTENDANCE_AGENT_CONTRACT_VERSION) fail('contractVersion no soportada');
  let endpoint;
  try { endpoint = new URL(input.endpoint); } catch { fail('endpoint es inválido'); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !(allowLocalhost && local && endpoint.protocol === 'http:')) {
    fail('endpoint debe usar HTTPS');
  }
  if (!UUID.test(String(input.tenantId || ''))) fail('tenantId es inválido');
  const driverKey = safeDriverKey(input.driverKey);
  if (!['pull', 'push'].includes(input.transport)) fail('transport debe ser pull o push');
  if (!Number.isSafeInteger(input.utcOffsetMinutes)
      || input.utcOffsetMinutes < -840 || input.utcOffsetMinutes > 840) {
    fail('utcOffsetMinutes es inválido');
  }
  return Object.freeze({
    contractVersion: input.contractVersion,
    endpoint: endpoint.toString(),
    tenantId: String(input.tenantId).toLowerCase(),
    connectorKey: connectorKey(input.connectorKey),
    driverKey,
    transport: input.transport,
    deviceExternalKey: siteDeviceKey(input.deviceExternalKey, 'deviceExternalKey'),
    siteExternalKey: siteDeviceKey(input.siteExternalKey, 'siteExternalKey'),
    timezone: safeTimezone(input.timezone),
    utcOffsetMinutes: input.utcOffsetMinutes,
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function attendanceAgentBatchRequest(config, inputText, options = {}) {
  const safe = validateAttendanceAgentConfig(config, options);
  if (typeof inputText !== 'string' || Buffer.byteLength(inputText, 'utf8') > MAX_INPUT_BYTES) {
    fail('El archivo debe ser texto y no superar 4 MiB');
  }
  const inputSha256 = sha256(inputText);
  const batchKey = options.batchKey
    ? safeBatchKey(options.batchKey)
    : `file-${inputSha256}`;
  const request = Object.freeze({
    contractVersion: ATTENDANCE_INGEST_CONTRACT_VERSION,
    tenantId: safe.tenantId,
    connectorKey: safe.connectorKey,
    driverKey: safe.driverKey,
    transport: safe.transport,
    deviceExternalKey: safe.deviceExternalKey,
    siteExternalKey: safe.siteExternalKey,
    timezone: safe.timezone,
    utcOffsetMinutes: safe.utcOffsetMinutes,
    batchKey,
    payload: safe.driverKey === 'csv-generic' ? { text: inputText }
      : safe.driverKey === 'legacy-rel000-fixed-width' ? { text: inputText }
        : JSON.parse(inputText),
  });
  return Object.freeze({ request, inputSha256 });
}

function safeToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (token.length < 32 || token.length > 512 || /\s/.test(token)) {
    fail('ATTENDANCE_CONNECTOR_TOKEN no está configurado correctamente');
  }
  return token;
}

function validateReceipt(payload) {
  const invalid = (message) => fail(message, 'ATTENDANCE_AGENT_RESPONSE_INVALID');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    invalid('El recibo del backend no es un objeto');
  }
  const keys = Object.keys(payload);
  if (keys.length !== RECEIPT_FIELDS.size || keys.some((key) => !RECEIPT_FIELDS.has(key))) {
    invalid('El recibo del backend contiene campos fuera de contrato');
  }
  if (payload.ok !== true || !UUID.test(String(payload.batchId || ''))
      || payload.status !== 'accepted' || typeof payload.replayed !== 'boolean') {
    invalid('El recibo del backend no cumple el contrato');
  }
  for (const field of ['acceptedCount', 'duplicateCount', 'unmappedCount', 'ambiguousCount']) {
    if (!Number.isSafeInteger(payload[field]) || payload[field] < 0) {
      invalid(`${field} del recibo está fuera de contrato`);
    }
  }
  if (payload.unmappedCount + payload.ambiguousCount > payload.acceptedCount) {
    invalid('Los contadores del recibo son inconsistentes');
  }
  return Object.freeze({
    batchId: String(payload.batchId).toLowerCase(),
    status: payload.status,
    acceptedCount: payload.acceptedCount,
    duplicateCount: payload.duplicateCount,
    unmappedCount: payload.unmappedCount,
    ambiguousCount: payload.ambiguousCount,
    replayed: payload.replayed,
  });
}

export async function inspectAttendanceAgentBatch(config, inputText, options = {}) {
  const { request, inputSha256 } = attendanceAgentBatchRequest(config, inputText, options);
  const registry = options.registry ?? createDefaultAttendanceDriverRegistry();
  const normalized = registry.ingest({
    driverId: request.driverKey,
    transport: request.transport,
    payload: request.payload,
    context: {
      tenantId: request.tenantId,
      sourceId: request.connectorKey,
      deviceId: request.deviceExternalKey,
      pointId: request.siteExternalKey,
      timezone: request.timezone,
      utcOffsetMinutes: request.utcOffsetMinutes,
    },
  });
  return Object.freeze({
    inputSha256,
    batchKey: request.batchKey,
    driver: normalized.driver.id,
    receivedCount: normalized.receivedCount,
    acceptedForSendCount: normalized.eventCount,
    duplicateInFileCount: normalized.duplicateCount,
  });
}

export async function sendAttendanceAgentBatch(config, inputText, options = {}) {
  const safe = validateAttendanceAgentConfig(config, options);
  const { request, inputSha256 } = attendanceAgentBatchRequest(safe, inputText, options);
  const token = safeToken(options.token);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') fail('fetch no está disponible');
  const response = await fetchImpl(safe.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'MuniControl-Attendance-Gateway/1',
      'X-Request-ID': randomUUID(),
    },
    body: JSON.stringify(request),
  });
  let payload = null;
  try { payload = await response.json(); } catch { fail(`El backend respondió HTTP ${response.status} sin JSON válido`); }
  if (!response.ok || payload?.ok !== true) {
    const error = new Error(`El backend rechazó el lote: ${payload?.code || `HTTP_${response.status}`}`);
    error.code = payload?.code || 'ATTENDANCE_AGENT_SEND_FAILED';
    throw error;
  }
  const receipt = validateReceipt(payload);
  const expectedStatus = receipt.replayed ? 200 : 202;
  if (response.status !== expectedStatus) {
    fail('El estado HTTP no coincide con el recibo', 'ATTENDANCE_AGENT_RESPONSE_INVALID');
  }
  return Object.freeze({
    inputSha256,
    batchKey: request.batchKey,
    ...receipt,
  });
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!['--config', '--input', '--batch-key'].includes(token)) fail(`Argumento no permitido: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Falta valor para ${token}`);
    values.set(token, value);
    index += 1;
  }
  if (!values.has('--config') || !values.has('--input')) {
    fail('Uso: node scripts/attendance-gateway-agent.mjs --config config.json --input archivo [--batch-key clave]');
  }
  return values;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(args.get('--config'));
  const inputPath = path.resolve(args.get('--input'));
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const inputText = await readFile(inputPath, 'utf8');
  const confirmSend = String(process.env.ATTENDANCE_GATEWAY_CONFIRM_SEND || '').toLowerCase() === 'true';
  const batchKey = args.get('--batch-key');
  const result = confirmSend
    ? await sendAttendanceAgentBatch(config, inputText, {
      token: process.env.ATTENDANCE_CONNECTOR_TOKEN,
      batchKey,
    })
    : await inspectAttendanceAgentBatch(config, inputText, { batchKey });
  console.log(JSON.stringify({
    mode: confirmSend ? 'sent' : 'dry-run',
    ...result,
    note: confirmSend
      ? 'El archivo original no fue eliminado; conservarlo hasta conciliar el recibo.'
      : 'No hubo conexión ni escritura remota. Definí ATTENDANCE_GATEWAY_CONFIRM_SEND=true para enviar.',
  }, null, 2));
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
