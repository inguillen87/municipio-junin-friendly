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
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSITION_KEYS = new Set([
  'batchId', 'expectedVersion', 'reasonCode', 'reasonReference',
]);
const TRANSITION_REASONS = Object.freeze({
  submit: new Set(['ready_for_validation']),
  approve: new Set(['source_validated']),
  reject: new Set(['contract_invalid', 'amounts_inconsistent', 'source_unverifiable']),
  cancel: new Set(['cancelled_by_preparer']),
});
const DB_TRANSITION_COMMAND = Object.freeze({
  submit: 'submit',
  approve: 'validate',
  reject: 'reject',
  cancel: 'cancel',
});
const REFERENCE = /^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HMAC_SHA256 = /^[a-f0-9]{64}$/;
const INT64_TEXT = /^-?(?:0|[1-9][0-9]{0,18})$/;
const PERSISTED_STATUSES = new Set([
  'quarantined', 'submitted', 'validated', 'rejected', 'cancelled',
]);
const PERSISTED_COMMANDS = new Set(['submit', 'cancel', 'validate', 'reject']);
const PERSISTED_REASONS = new Set([
  'source_uploaded', 'ready_for_validation', 'source_validated',
  'contract_invalid', 'amounts_inconsistent', 'source_unverifiable',
  'cancelled_by_preparer',
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

function identityContext(identityPrincipal, session) {
  const actorEmail = String(identityPrincipal?.user?.email || '').trim().toLowerCase();
  const tenantId = String(identityPrincipal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(identityPrincipal?.tenant?.membershipId || '').trim().toLowerCase();
  const actorSessionId = String(session?.id || '').trim().toLowerCase();
  const actorSessionVersion = Number(session?.version);
  const releaseSha = String(session?.releaseSha || '').trim().toLowerCase();
  if (!actorEmail || identityPrincipal?.tenant?.source !== 'membership'
      || !UUID.test(tenantId) || !UUID.test(membershipId) || !UUID.test(actorSessionId)
      || !Number.isSafeInteger(actorSessionVersion) || actorSessionVersion < 1
      || !SHA40.test(releaseSha)
      || String(session?.email || '').trim().toLowerCase() !== actorEmail) {
    fail(
      'PAYROLL_CONTROL_IMPORT_SESSION_INVALID',
      401,
      'La sesión operativa ya no es válida',
    );
  }
  return Object.freeze({
    actorEmail,
    actorSessionId,
    actorSessionVersion,
    membershipId,
    releaseSha,
    tenantId,
  });
}

function sqlRows(result) {
  return Array.isArray(result) ? result : (Array.isArray(result?.rows) ? result.rows : []);
}

function mappedSqlError(error) {
  const message = String(error?.message || '');
  const definitions = [
    ['PAYROLL_CONTROL_IMPORT_IDEMPOTENCY_REUSE', 409, 'La clave de idempotencia ya fue usada'],
    ['PAYROLL_CONTROL_IMPORT_DUPLICATE_SOURCE', 409, 'La fuente ya fue registrada para este origen certificado'],
    ['PAYROLL_CONTROL_IMPORT_VERSION_CONFLICT', 409, 'La corrida fue modificada por otra persona'],
    ['PAYROLL_CONTROL_IMPORT_MAKER_CHECKER_REQUIRED', 409, 'La persona que preparó la corrida no puede aprobarla'],
    ['PAYROLL_CONTROL_IMPORT_TRANSITION_INVALID', 409, 'La transición no está permitida'],
    ['PAYROLL_CONTROL_IMPORT_PREPARER_REQUIRED', 403, 'Sólo quien preparó la corrida puede enviarla o cancelarla'],
    ['PAYROLL_CONTROL_IMPORT_CAPABILITY_REQUIRED', 403, 'No posee la capacidad requerida'],
    ['PAYROLL_CONTROL_IMPORT_EMPLOYMENT_REQUIRED', 403, 'La operación exige un vínculo laboral vigente'],
    ['PAYROLL_CONTROL_IMPORT_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad operativa'],
    ['PAYROLL_CONTROL_IMPORT_NOT_FOUND', 404, 'Corrida de control no encontrada'],
    ['PAYROLL_CONTROL_IMPORT_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
    ['PAYROLL_CONTROL_IMPORT_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ['PAYROLL_CONTROL_IMPORT_RELEASE_NOT_CERTIFIED', 503, 'La versión desplegada no está certificada'],
    ['PAYROLL_CONTROL_IMPORT_BINDING_REQUIRED', 503, 'El binding GRH certificado no está disponible'],
    ['PAYROLL_CONTROL_IMPORT_BINDING_CHANGED', 409, 'El binding GRH cambió durante la preparación'],
    ['PAYROLL_CONTROL_IMPORT_PREPARE_INVALID', 422, 'La fuente no cumple el contrato de control'],
    ['TENANT_IAM_SOD_CONFLICT', 403, 'La membresía combina capacidades incompatibles'],
  ];
  for (const [code, status, safeMessage] of definitions) {
    if (message.includes(code)) return new PayrollControlImportError(code, status, safeMessage);
  }
  return error;
}

async function facade(sql, functionName, values, casts) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  try {
    const placeholders = casts.map((cast, index) => (
      `$${index + 1}${cast ? `::${cast}` : ''}`
    )).join(', ');
    const result = await sql.query(
      `SELECT ${functionName}(${placeholders}) AS result`,
      values,
    );
    const envelope = sqlRows(result)[0]?.result;
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      fail(
        'PAYROLL_CONTROL_IMPORT_UNAVAILABLE',
        503,
        'Controles de cierre temporalmente no disponibles',
      );
    }
    return envelope;
  } catch (error) {
    throw mappedSqlError(error);
  }
}

function commandHash(context, command, payload) {
  return createHash('sha256').update(stableJson({
    contractVersion: PAYROLL_CONTROL_IMPORT_CONTRACT_VERSION,
    tenantId: context.tenantId,
    membershipId: context.membershipId,
    actorSessionId: context.actorSessionId,
    actorSessionVersion: context.actorSessionVersion,
    releaseSha: context.releaseSha,
    command,
    payload,
  })).digest('hex');
}

function assertSafeBatch(batch) {
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)
      || !UUID.test(String(batch.id || ''))
      || !SOURCE_KINDS.includes(batch.sourceKind)
      || batch.provenanceState !== 'operator_declared'
      || typeof batch.period !== 'string' || !PERIOD.test(batch.period)
      || !JURISDICTIONS.includes(batch.jurisdiction)
      || batch.payrollPosted !== false
      || batch.fiscalArtifactGenerated !== false
      || batch.contractVersion !== PAYROLL_CONTROL_IMPORT_CONTRACT_VERSION
      || batch.hmacKeyVersion !== PAYROLL_CONTROL_IMPORT_HMAC_KEY_VERSION
      || batch.definitionKey !== PAYROLL_CONTROL_IMPORT_DEFINITION
      || !HMAC_SHA256.test(String(batch.contentFingerprint || ''))
      || !Number.isSafeInteger(batch.byteLength)
      || batch.byteLength < 1 || batch.byteLength > PAYROLL_CONTROL_IMPORT_MAX_BYTES
      || batch.rowCount !== 2
      || !SHA40.test(String(batch.releaseSha || ''))
      || !PERSISTED_STATUSES.has(batch.status)
      || !Number.isSafeInteger(batch.version) || batch.version < 1
      || !PERSISTED_REASONS.has(batch.reasonCode)
      || !(batch.reasonReference === null || REFERENCE.test(batch.reasonReference))
      || !Array.isArray(batch.rows)
      || batch.rows.length !== 2
      || batch.rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row)
        || Object.keys(row).length !== 2
        || !Object.hasOwn(row, 'concept') || !Object.hasOwn(row, 'amountCents')
        || !CONCEPTS.includes(row.concept)
        || !INT64_TEXT.test(row.amountCents)
        || row.amountCents === '-0'
        || BigInt(row.amountCents) < MIN_INT64
        || BigInt(row.amountCents) > MAX_INT64)
      || new Set(batch.rows.map((row) => row.concept)).size !== 2
      || (Object.hasOwn(batch, 'allowedCommands')
        && (!Array.isArray(batch.allowedCommands)
          || batch.allowedCommands.some((command) => !PERSISTED_COMMANDS.has(command))
          || new Set(batch.allowedCommands).size !== batch.allowedCommands.length))) {
    fail(
      'PAYROLL_CONTROL_IMPORT_CONTRACT_DRIFT',
      503,
      'El contrato de control de cierre no es seguro',
    );
  }
  return batch;
}

function assertSafeEnvelope(envelope) {
  const principal = envelope?.principal;
  const capabilities = principal?.capabilities;
  const reportCapabilities = principal?.reportCapabilities;
  if (!principal || typeof principal !== 'object' || Array.isArray(principal)
      || !UUID.test(String(principal.tenantId || ''))
      || !UUID.test(String(principal.membershipId || ''))
      || !UUID.test(String(principal.certifiedBindingId || ''))
      || typeof principal.roleKey !== 'string' || principal.roleKey.length < 1
      || typeof principal.employmentLinked !== 'boolean'
      || !Array.isArray(capabilities)
      || capabilities.some((capability) => (
        typeof capability !== 'string'
        || !capability.startsWith('payroll.control_import.')
      ))
      || new Set(capabilities).size !== capabilities.length
      || !capabilities.includes('payroll.control_import.read')
      || !Array.isArray(reportCapabilities)
      || reportCapabilities.some((capability) => (
        capability !== 'payroll.art_report.generate'
      ))
      || new Set(reportCapabilities).size !== reportCapabilities.length
      || !Array.isArray(envelope?.batches)
      || !Array.isArray(envelope?.recentEvents)
      || !envelope?.limits || typeof envelope.limits !== 'object'
      || envelope.limits.maxSourceBytes !== PAYROLL_CONTROL_IMPORT_MAX_BYTES
      || envelope.limits.contractVersion !== PAYROLL_CONTROL_IMPORT_CONTRACT_VERSION
      || envelope.limits.hmacKeyVersion !== PAYROLL_CONTROL_IMPORT_HMAC_KEY_VERSION
      || envelope.limits.definitionKey !== PAYROLL_CONTROL_IMPORT_DEFINITION
      || JSON.stringify(envelope.limits.sourceKinds) !== JSON.stringify(SOURCE_KINDS)
      || JSON.stringify(envelope.limits.concepts) !== JSON.stringify(CONCEPTS)
      || envelope.recentEvents.some((event) => !event || typeof event !== 'object'
        || Array.isArray(event) || !UUID.test(String(event.batchId || '')))) {
    fail(
      'PAYROLL_CONTROL_IMPORT_CONTRACT_DRIFT',
      503,
      'El contrato de control de cierre no es seguro',
    );
  }
  envelope.batches.forEach(assertSafeBatch);
  return envelope;
}

function assertPersistedEnvelope(envelope) {
  const data = assertSafeBatch(envelope?.data);
  if (typeof envelope.replayed !== 'boolean') {
    fail(
      'PAYROLL_CONTROL_IMPORT_CONTRACT_DRIFT',
      503,
      'El recibo del control de cierre no es seguro',
    );
  }
  return { replayed: envelope.replayed, data };
}

export function normalizePayrollControlImportIdempotencyKey(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID_V4.test(key)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_IDEMPOTENCY_KEY_INVALID',
      428,
      'Idempotency-Key debe ser un UUID v4',
    );
  }
  return key;
}

export function normalizePayrollControlImportTransition(command, value) {
  if (!Object.hasOwn(TRANSITION_REASONS, command)) {
    fail('PAYROLL_CONTROL_IMPORT_COMMAND_INVALID', 400, 'Comando no permitido');
  }
  exactObject(
    value,
    TRANSITION_KEYS,
    'PAYROLL_CONTROL_IMPORT_TRANSITION_INVALID',
    'La transición no coincide con el contrato',
  );
  const batchId = typeof value.batchId === 'string' ? value.batchId.trim().toLowerCase() : '';
  if (!UUID.test(batchId)) {
    fail('PAYROLL_CONTROL_IMPORT_BATCH_ID_INVALID', 422, 'Identificador de corrida inválido');
  }
  if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1) {
    fail(
      'PAYROLL_CONTROL_IMPORT_VERSION_REQUIRED',
      428,
      'expectedVersion es obligatorio',
    );
  }
  if (typeof value.reasonCode !== 'string'
      || !TRANSITION_REASONS[command].has(value.reasonCode)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_REASON_INVALID',
      422,
      'El motivo no corresponde al comando',
    );
  }
  const reasonReference = value.reasonReference === null
    ? null : String(value.reasonReference || '').trim().toLowerCase();
  if (['reject', 'cancel'].includes(command)) {
    if (!reasonReference || !REFERENCE.test(reasonReference)) {
      fail(
        'PAYROLL_CONTROL_IMPORT_REASON_REFERENCE_REQUIRED',
        422,
        'El rechazo o la cancelación exige una referencia opaca',
      );
    }
  } else if (reasonReference !== null) {
    fail(
      'PAYROLL_CONTROL_IMPORT_REASON_REFERENCE_INVALID',
      422,
      'Este comando no admite referencia',
    );
  }
  return Object.freeze({
    batchId,
    expectedVersion: value.expectedVersion,
    reasonCode: value.reasonCode,
    reasonReference,
  });
}

export async function getPayrollControlImportBootstrap(
  sql, identityPrincipal, session,
) {
  const context = identityContext(identityPrincipal, session);
  const envelope = await facade(
    sql,
    'payroll_control_import_bootstrap_v1',
    [JSON.stringify(context)],
    ['jsonb'],
  );
  return assertSafeEnvelope(envelope);
}

export function listPayrollControlImports(bootstrap) {
  const safe = assertSafeEnvelope(bootstrap);
  return Object.freeze({
    batches: safe.batches,
    limits: safe.limits,
  });
}

export function readPayrollControlImport(bootstrap, batchId) {
  const safe = assertSafeEnvelope(bootstrap);
  const id = typeof batchId === 'string' ? batchId.trim().toLowerCase() : '';
  if (!UUID.test(id)) {
    fail('PAYROLL_CONTROL_IMPORT_BATCH_ID_INVALID', 422, 'Identificador de corrida inválido');
  }
  const batch = safe.batches.find((item) => String(item.id).toLowerCase() === id);
  if (!batch) fail('PAYROLL_CONTROL_IMPORT_NOT_FOUND', 404, 'Corrida de control no encontrada');
  return Object.freeze({
    ...batch,
    events: safe.recentEvents.filter((event) => String(event?.batchId).toLowerCase() === id),
  });
}

export async function persistPayrollControlImport(
  sql, identityPrincipal, session, prepared, idempotencyKey, expectedBindingId,
) {
  const context = identityContext(identityPrincipal, session);
  const bindingId = typeof expectedBindingId === 'string'
    ? expectedBindingId.trim().toLowerCase() : '';
  if (!prepared || typeof prepared !== 'object'
      || prepared.contractVersion !== PAYROLL_CONTROL_IMPORT_CONTRACT_VERSION
      || prepared.hmacKeyVersion !== PAYROLL_CONTROL_IMPORT_HMAC_KEY_VERSION
      || prepared.definitionKey !== PAYROLL_CONTROL_IMPORT_DEFINITION
      || prepared.certifiedReleaseSha !== context.releaseSha
      || !Array.isArray(prepared.rows) || prepared.rows.length !== 2
      || !/^[a-f0-9]{64}$/.test(prepared.contentHmacSha256)
      || !Number.isSafeInteger(prepared.byteLength)
      || prepared.byteLength < 1 || prepared.byteLength > PAYROLL_CONTROL_IMPORT_MAX_BYTES
      || prepared.rawContentStored !== false
      || prepared.includesPersonalRecords !== false
      || prepared.payrollPosted !== false
      || prepared.fiscalArtifactGenerated !== false
      || !UUID.test(bindingId)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_PREPARE_INVALID',
      422,
      'La fuente no cumple el contrato de control',
    );
  }
  const key = normalizePayrollControlImportIdempotencyKey(idempotencyKey);
  const payload = Object.freeze({
    sourceKind: prepared.sourceKind,
    periodMonth: prepared.periodMonth,
    jurisdiction: prepared.jurisdiction,
    definitionKey: prepared.definitionKey,
    contentHmacSha256: prepared.contentHmacSha256,
    byteLength: prepared.byteLength,
    rows: prepared.rows,
  });
  const hash = commandHash(context, 'prepare', payload);
  const envelope = await facade(sql, 'payroll_control_import_prepare_v1', [
    JSON.stringify(context),
    bindingId,
    payload.sourceKind,
    payload.periodMonth,
    payload.jurisdiction,
    payload.definitionKey,
    payload.contentHmacSha256,
    payload.byteLength,
    JSON.stringify(payload.rows),
    key,
    hash,
  ], ['jsonb', 'uuid', '', 'date', '', '', '', 'integer', 'jsonb', 'uuid', '']);
  return assertPersistedEnvelope(envelope);
}

export async function transitionPayrollControlImport(
  sql, identityPrincipal, session, command, rawTransition, idempotencyKey,
) {
  const context = identityContext(identityPrincipal, session);
  const transition = normalizePayrollControlImportTransition(command, rawTransition);
  const key = normalizePayrollControlImportIdempotencyKey(idempotencyKey);
  const databaseCommand = DB_TRANSITION_COMMAND[command];
  const hash = commandHash(context, command, transition);
  const envelope = await facade(sql, 'payroll_control_import_transition_v1', [
    JSON.stringify(context),
    transition.batchId,
    databaseCommand,
    transition.expectedVersion,
    transition.reasonCode,
    transition.reasonReference,
    key,
    hash,
  ], ['jsonb', 'uuid', '', 'integer', '', '', 'uuid', '']);
  return assertPersistedEnvelope(envelope);
}
