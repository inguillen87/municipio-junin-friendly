import { createHash, createHmac } from 'node:crypto';

export const PAYROLL_CONTROL_IMPORT_CONTRACT_VERSION = 'payroll-control-import.v1';
export const PAYROLL_CONTROL_IMPORT_HMAC_KEY_VERSION = 'hmac-v1';
export const PAYROLL_CONTROL_IMPORT_DEFINITION =
  'payroll-post-close-701-703.v1';
export const PAYROLL_CONTROL_IMPORT_MAX_BYTES = 16 * 1024;

const HEADER = 'periodo;jurisdiccion;concepto;importe_ars';
const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40 = /^[a-f0-9]{40}$/;
const AMOUNT = /^-?(?:0|[1-9][0-9]{0,17}),[0-9]{2}$/;
const MIN_INT64 = -9223372036854775808n;
const MAX_INT64 = 9223372036854775807n;
const SOURCE_KINDS = Object.freeze(['grh_observed', 'operator_control']);
const JURISDICTIONS = Object.freeze(['42', '55']);
const CONCEPTS = Object.freeze(['701', '703']);
const INPUT_KEYS = new Set([
  'sourceKind', 'period', 'jurisdiction', 'definitionKey', 'bytes', 'context',
]);
const CONTEXT_KEYS = new Set([
  'tenantId', 'sourceBindingId', 'releaseSha', 'fingerprintKey',
]);

export class PayrollControlImportError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'PayrollControlImportError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new PayrollControlImportError(code, status, message);
}

function exactObject(value, allowed, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((key) => !allowed.has(key))) {
    fail(code, 400, message);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalContext(value) {
  exactObject(
    value,
    CONTEXT_KEYS,
    'PAYROLL_CONTROL_IMPORT_CONTEXT_INVALID',
    'El contexto certificado de la fuente no es válido',
  );
  const tenantId = typeof value.tenantId === 'string'
    ? value.tenantId.trim().toLowerCase() : '';
  const sourceBindingId = typeof value.sourceBindingId === 'string'
    ? value.sourceBindingId.trim().toLowerCase() : '';
  const releaseSha = typeof value.releaseSha === 'string'
    ? value.releaseSha.trim().toLowerCase() : '';
  const fingerprintKey = Buffer.isBuffer(value.fingerprintKey)
    ? value.fingerprintKey
    : typeof value.fingerprintKey === 'string'
      ? Buffer.from(value.fingerprintKey, 'utf8') : null;
  if (!UUID.test(tenantId) || !UUID.test(sourceBindingId) || !SHA40.test(releaseSha)
      || !fingerprintKey || fingerprintKey.byteLength < 32
      || fingerprintKey.byteLength > 1024) {
    fail(
      'PAYROLL_CONTROL_IMPORT_CONTEXT_INVALID',
      503,
      'El contexto certificado de la fuente no está disponible',
    );
  }
  return { tenantId, sourceBindingId, releaseSha, fingerprintKey };
}

function canonicalInput(input) {
  exactObject(
    input,
    INPUT_KEYS,
    'PAYROLL_CONTROL_IMPORT_INPUT_INVALID',
    'La recepción exige una fuente y un contexto exactos',
  );
  if (typeof input.sourceKind !== 'string' || !SOURCE_KINDS.includes(input.sourceKind)) {
    fail('PAYROLL_CONTROL_IMPORT_SOURCE_KIND_INVALID', 400, 'El tipo de fuente no está permitido');
  }
  if (typeof input.period !== 'string' || !PERIOD.test(input.period)) {
    fail('PAYROLL_CONTROL_IMPORT_PERIOD_INVALID', 400, 'El período debe usar YYYY-MM');
  }
  if (typeof input.jurisdiction !== 'string'
      || !JURISDICTIONS.includes(input.jurisdiction)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_JURISDICTION_INVALID',
      400,
      'La jurisdicción debe ser 42 o 55',
    );
  }
  if (input.definitionKey !== PAYROLL_CONTROL_IMPORT_DEFINITION) {
    fail(
      'PAYROLL_CONTROL_IMPORT_DEFINITION_INVALID',
      400,
      'La definición de fuente no pertenece al contrato vigente',
    );
  }
  let bytes;
  if (Buffer.isBuffer(input.bytes)) bytes = input.bytes;
  else if (input.bytes instanceof Uint8Array) {
    bytes = Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
  } else {
    fail('PAYROLL_CONTROL_IMPORT_SOURCE_INVALID', 400, 'La fuente debe aportar bytes');
  }
  if (bytes.byteLength === 0) {
    fail('PAYROLL_CONTROL_IMPORT_SOURCE_EMPTY', 422, 'La fuente está vacía');
  }
  if (bytes.byteLength > PAYROLL_CONTROL_IMPORT_MAX_BYTES) {
    fail(
      'PAYROLL_CONTROL_IMPORT_SOURCE_TOO_LARGE',
      413,
      'La fuente supera el límite privado de 16 KiB',
    );
  }
  return {
    sourceKind: input.sourceKind,
    period: input.period,
    jurisdiction: input.jurisdiction,
    definitionKey: input.definitionKey,
    bytes,
    context: canonicalContext(input.context),
  };
}

function amountToCents(value) {
  if (!AMOUNT.test(value)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_AMOUNT_INVALID',
      422,
      'El importe debe usar coma y exactamente dos decimales, sin separadores de miles',
    );
  }
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer, decimals] = unsigned.split(',');
  const cents = (BigInt(integer) * 100n) + BigInt(decimals);
  if (negative && cents === 0n) {
    fail('PAYROLL_CONTROL_IMPORT_AMOUNT_INVALID', 422, 'El importe negativo cero no es válido');
  }
  const signed = negative ? -cents : cents;
  if (signed < MIN_INT64 || signed > MAX_INT64) {
    fail(
      'PAYROLL_CONTROL_IMPORT_AMOUNT_OUT_OF_RANGE',
      422,
      'El importe excede el rango exacto admitido por el registro institucional',
    );
  }
  return signed;
}

function sourceLines(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('PAYROLL_CONTROL_IMPORT_ENCODING_INVALID', 422, 'La fuente debe usar UTF-8 válido');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\u0000') || /\r(?!\n)/.test(text)
      || /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_SOURCE_INVALID',
      422,
      'La fuente contiene caracteres no permitidos',
    );
  }
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length !== 3 || lines.some((line) => line.length === 0)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_ROW_COUNT_INVALID',
      422,
      'La fuente debe contener el encabezado y los conceptos 701 y 703',
    );
  }
  if (lines[0] !== HEADER) {
    fail(
      'PAYROLL_CONTROL_IMPORT_HEADER_INVALID',
      422,
      'El encabezado no coincide con la definición seleccionada',
    );
  }
  return lines.slice(1);
}

function parseRows(bytes, context) {
  const rows = new Map();
  for (const line of sourceLines(bytes)) {
    const cells = line.split(';');
    if (cells.length !== 4 || cells.some((cell) => cell.trim() !== cell)) {
      fail(
        'PAYROLL_CONTROL_IMPORT_ROW_INVALID',
        422,
        'Una fila no coincide con el contrato canónico',
      );
    }
    const [period, jurisdiction, concept, amount] = cells;
    if (period !== context.period) {
      fail(
        'PAYROLL_CONTROL_IMPORT_PERIOD_MISMATCH',
        422,
        'La fuente no pertenece al período seleccionado',
      );
    }
    if (jurisdiction !== context.jurisdiction) {
      fail(
        'PAYROLL_CONTROL_IMPORT_JURISDICTION_MISMATCH',
        422,
        'La fuente no pertenece a la jurisdicción seleccionada',
      );
    }
    if (!CONCEPTS.includes(concept)) {
      fail(
        'PAYROLL_CONTROL_IMPORT_CONCEPT_INVALID',
        422,
        'La recepción inicial sólo admite los conceptos 701 y 703',
      );
    }
    if (rows.has(concept)) {
      fail('PAYROLL_CONTROL_IMPORT_CONCEPT_DUPLICATED', 422, 'La fuente repite un concepto');
    }
    rows.set(concept, amountToCents(amount));
  }
  if (CONCEPTS.some((concept) => !rows.has(concept))) {
    fail(
      'PAYROLL_CONTROL_IMPORT_CONCEPT_MISSING',
      422,
      'La fuente debe informar los conceptos 701 y 703',
    );
  }
  return Object.freeze(CONCEPTS.map((concept) => Object.freeze({
    concept,
    amountCents: rows.get(concept).toString(),
  })));
}

function contentFingerprint(bytes, context) {
  return createHmac('sha256', context.fingerprintKey)
    .update(PAYROLL_CONTROL_IMPORT_CONTRACT_VERSION, 'utf8')
    .update('\0', 'utf8')
    .update(PAYROLL_CONTROL_IMPORT_HMAC_KEY_VERSION, 'utf8')
    .update('\0', 'utf8')
    .update(context.tenantId, 'utf8')
    .update('\0', 'utf8')
    .update(context.sourceBindingId, 'utf8')
    .update('\0', 'utf8')
    .update(bytes)
    .digest('hex');
}

/**
 * Parses one aggregate 701/703 source entirely on the server. The returned
 * rows contain no employee records and the raw bytes are never retained.
 */
export function preparePayrollControlImport(input) {
  const normalized = canonicalInput(input);
  const rows = parseRows(normalized.bytes, normalized);
  const contentHmacSha256 = contentFingerprint(normalized.bytes, normalized.context);
  const manifest = {
    contractVersion: PAYROLL_CONTROL_IMPORT_CONTRACT_VERSION,
    hmacKeyVersion: PAYROLL_CONTROL_IMPORT_HMAC_KEY_VERSION,
    sourceKind: normalized.sourceKind,
    provenanceState: 'operator_declared',
    periodMonth: `${normalized.period}-01`,
    jurisdiction: normalized.jurisdiction,
    definitionKey: normalized.definitionKey,
    certifiedReleaseSha: normalized.context.releaseSha,
    contentHmacSha256,
    byteLength: normalized.bytes.byteLength,
    rows,
  };
  const manifestSha256 = createHash('sha256').update(stableJson(manifest)).digest('hex');
  return Object.freeze({
    ...manifest,
    manifestSha256,
    recordCount: rows.length,
    status: 'prepared',
    includesPersonalRecords: false,
    rawContentStored: false,
    persistencePerformed: false,
    payrollCalculated: false,
    payrollPosted: false,
    fiscalArtifactGenerated: false,
  });
}
