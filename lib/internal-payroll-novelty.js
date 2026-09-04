import { createHash } from 'node:crypto';

export const PAYROLL_NOVELTY_CONTRACT_VERSION = 'payroll-novelty-batch.v1';
export const PAYROLL_NOVELTY_MAX_ROWS = 500;
export const PAYROLL_NOVELTY_MAX_BODY_BYTES = 512 * 1024;
export const PAYROLL_NOVELTY_PAYROLL_TYPES = Object.freeze([
  'monthly',
  'first_fortnight',
  'sac',
  'vacation',
  'supplementary',
  'final',
  'other',
]);
export const PAYROLL_NOVELTY_SOURCE_MODES = Object.freeze(['individual', 'bulk']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40 = /^[a-f0-9]{40}$/;
const PERIOD_MONTH = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])-01$/;
const DIGITS = /^(?:0|[1-9][0-9]{0,19})$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/;
const CENTS = /^-?(?:0|[1-9][0-9]{0,17})$/;
const SAFE_CODE = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const MIN_INT64 = -9223372036854775808n;
const MAX_INT64 = 9223372036854775807n;
const SOURCE_MODES = new Set(PAYROLL_NOVELTY_SOURCE_MODES);
const PAYROLL_TYPES = new Set(PAYROLL_NOVELTY_PAYROLL_TYPES);
const DRAFT_KEYS = new Set(['sourceMode', 'periodMonth', 'payrollType', 'rows']);
const ROW_KEYS = new Set([
  'rowOrdinal',
  'legajo',
  'conceptSourceId',
  'costCenterSourceId',
  'adjustmentMonth',
  'quantityDecimal',
  'amountCents',
  'movementType',
  'legalInstrument',
  'observation',
  'forced',
]);
const TRANSITION_KEYS = new Set([
  'batchId', 'expectedVersion', 'reasonCode', 'reasonReference',
]);
const REASONS = Object.freeze({
  submit: new Set(['ready_for_review']),
  approve: new Set(['validated_for_export']),
  reject: new Set(['invalid_rows', 'unsupported_concept', 'duplicate_or_conflict']),
  cancel: new Set(['cancelled_by_preparer']),
});
const TRANSITIONS = new Set(Object.keys(REASONS));

export class PayrollNoveltyError extends Error {
  constructor(code, status, message, details) {
    super(message);
    this.name = 'PayrollNoveltyError';
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, status, message, details) {
  throw new PayrollNoveltyError(code, status, message, details);
}

function exactObject(value, keys, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.size
      || Object.keys(value).some((key) => !keys.has(key))) {
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

function canonicalNullableText(value, name, maximum, { minimum = 1 } = {}) {
  if (value === null) return null;
  if (typeof value !== 'string') {
    fail('PAYROLL_NOVELTY_ROW_INVALID', 422, `${name} debe ser texto o null`);
  }
  const normalized = value.replace(/\r\n?/g, '\n');
  if (normalized !== normalized.trim()
      || normalized.length < minimum
      || normalized.length > maximum
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    fail('PAYROLL_NOVELTY_ROW_INVALID', 422, `${name} no cumple el contrato de texto`);
  }
  return normalized;
}

function nullableCanonical(value, pattern, name, { lowercase = false } = {}) {
  if (value === null) return null;
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail('PAYROLL_NOVELTY_ROW_INVALID', 422, `${name} no cumple el formato canónico`);
  }
  return lowercase ? value.toLowerCase() : value;
}

function int64Text(value, name) {
  const normalized = nullableCanonical(value, CENTS, name);
  if (normalized === null) return null;
  const integer = BigInt(normalized);
  if (normalized.startsWith('-') && integer === 0n) {
    fail('PAYROLL_NOVELTY_ROW_INVALID', 422, `${name} no admite cero negativo`);
  }
  if (integer < MIN_INT64 || integer > MAX_INT64) {
    fail('PAYROLL_NOVELTY_AMOUNT_OUT_OF_RANGE', 422, `${name} excede el rango int64`);
  }
  return integer.toString();
}

function validateMonth(value, name) {
  if (typeof value !== 'string' || !PERIOD_MONTH.test(value)
      || value < '2008-01-01' || value > '2099-12-01') {
    fail('PAYROLL_NOVELTY_PERIOD_INVALID', 422, `${name} debe usar YYYY-MM-01`);
  }
  return value;
}

function rowError(error, ordinal) {
  if (!(error instanceof PayrollNoveltyError)) return error;
  if (error.details?.rowOrdinal === ordinal) return error;
  return new PayrollNoveltyError(error.code, error.status, error.message, {
    ...(error.details || {}),
    rowOrdinal: ordinal,
  });
}

function canonicalRow(value, index, periodMonth) {
  const ordinal = index + 1;
  try {
    exactObject(
      value,
      ROW_KEYS,
      'PAYROLL_NOVELTY_ROW_INVALID',
      'Cada fila debe contener exactamente los campos del contrato de novedades',
    );
    if (!Number.isSafeInteger(value.rowOrdinal) || value.rowOrdinal !== ordinal) {
      fail('PAYROLL_NOVELTY_ROW_ORDINAL_INVALID', 422, 'La numeración de filas debe ser consecutiva');
    }
    if (typeof value.legajo !== 'string' || !DIGITS.test(value.legajo)) {
      fail('PAYROLL_NOVELTY_LEGAJO_INVALID', 422, 'El legajo debe contener entre 1 y 20 dígitos');
    }
    if (typeof value.conceptSourceId !== 'string' || !DIGITS.test(value.conceptSourceId)) {
      fail('PAYROLL_NOVELTY_CONCEPT_INVALID', 422, 'El concepto debe contener entre 1 y 20 dígitos');
    }
    const costCenterSourceId = nullableCanonical(
      value.costCenterSourceId, DIGITS, 'costCenterSourceId',
    );
    const adjustmentMonth = value.adjustmentMonth === null
      ? null : validateMonth(value.adjustmentMonth, 'adjustmentMonth');
    if (adjustmentMonth && adjustmentMonth > periodMonth) {
      fail(
        'PAYROLL_NOVELTY_ADJUSTMENT_MONTH_INVALID',
        422,
        'El mes de ajuste no puede ser posterior al período de liquidación',
      );
    }
    const quantityDecimal = nullableCanonical(
      value.quantityDecimal, DECIMAL, 'quantityDecimal',
    );
    if (quantityDecimal === '-0' || /^-0\.0+$/.test(quantityDecimal || '')) {
      fail('PAYROLL_NOVELTY_QUANTITY_INVALID', 422, 'La cantidad negativa cero no es válida');
    }
    const amountCents = int64Text(value.amountCents, 'amountCents');
    if (quantityDecimal === null && amountCents === null) {
      fail(
        'PAYROLL_NOVELTY_VALUE_REQUIRED',
        422,
        'Cada fila debe informar cantidad o importe',
      );
    }
    const movementType = nullableCanonical(
      value.movementType, SAFE_CODE, 'movementType', { lowercase: true },
    );
    const legalInstrument = canonicalNullableText(
      value.legalInstrument, 'legalInstrument', 160,
    );
    const observation = canonicalNullableText(value.observation, 'observation', 500);
    if (typeof value.forced !== 'boolean') {
      fail('PAYROLL_NOVELTY_FORCED_INVALID', 422, 'forced debe ser booleano');
    }
    if (value.forced && (amountCents === null || !observation || observation.length < 10)) {
      fail(
        'PAYROLL_NOVELTY_FORCED_JUSTIFICATION_REQUIRED',
        422,
        'Una novedad forzada exige importe y una observación de al menos 10 caracteres',
      );
    }
    return Object.freeze({
      rowOrdinal: ordinal,
      legajo: value.legajo,
      conceptSourceId: value.conceptSourceId,
      costCenterSourceId,
      adjustmentMonth,
      quantityDecimal,
      amountCents,
      movementType,
      legalInstrument,
      observation,
      forced: value.forced,
    });
  } catch (error) {
    throw rowError(error, ordinal);
  }
}

function duplicateKey(row) {
  return [
    row.legajo,
    row.conceptSourceId,
    row.costCenterSourceId || '',
    row.adjustmentMonth || '',
    row.movementType || '',
  ].join('\u001f');
}

export function normalizePayrollNoveltyDraft(input) {
  exactObject(
    input,
    DRAFT_KEYS,
    'PAYROLL_NOVELTY_DRAFT_INVALID',
    'El borrador no coincide con el contrato de novedades',
  );
  if (typeof input.sourceMode !== 'string' || !SOURCE_MODES.has(input.sourceMode)) {
    fail('PAYROLL_NOVELTY_SOURCE_MODE_INVALID', 422, 'El modo debe ser individual o masivo');
  }
  const periodMonth = validateMonth(input.periodMonth, 'periodMonth');
  if (typeof input.payrollType !== 'string' || !PAYROLL_TYPES.has(input.payrollType)) {
    fail('PAYROLL_NOVELTY_PAYROLL_TYPE_INVALID', 422, 'El tipo de liquidación no está permitido');
  }
  if (!Array.isArray(input.rows) || input.rows.length < 1
      || input.rows.length > PAYROLL_NOVELTY_MAX_ROWS) {
    fail(
      'PAYROLL_NOVELTY_ROW_COUNT_INVALID',
      422,
      `El lote debe contener entre 1 y ${PAYROLL_NOVELTY_MAX_ROWS} filas`,
    );
  }
  if (input.sourceMode === 'individual' && input.rows.length !== 1) {
    fail(
      'PAYROLL_NOVELTY_INDIVIDUAL_ROW_COUNT_INVALID',
      422,
      'La carga individual debe contener exactamente una fila',
    );
  }
  const seen = new Map();
  const rows = input.rows.map((row, index) => canonicalRow(row, index, periodMonth));
  for (const row of rows) {
    const key = duplicateKey(row);
    if (seen.has(key)) {
      fail(
        'PAYROLL_NOVELTY_DUPLICATE_ROW',
        422,
        'El lote contiene una novedad duplicada',
        { rowOrdinal: row.rowOrdinal, duplicateOf: seen.get(key) },
      );
    }
    seen.set(key, row.rowOrdinal);
  }
  let totalAmount = 0n;
  for (const row of rows) if (row.amountCents !== null) totalAmount += BigInt(row.amountCents);
  if (totalAmount < MIN_INT64 || totalAmount > MAX_INT64) {
    fail(
      'PAYROLL_NOVELTY_TOTAL_OUT_OF_RANGE',
      422,
      'La suma de importes excede el rango institucional admitido',
    );
  }
  return Object.freeze({
    contractVersion: PAYROLL_NOVELTY_CONTRACT_VERSION,
    sourceMode: input.sourceMode,
    periodMonth,
    payrollType: input.payrollType,
    rows: Object.freeze(rows),
    summary: Object.freeze({
      rowCount: rows.length,
      forcedCount: rows.filter((row) => row.forced).length,
      totalAmountCents: totalAmount.toString(),
    }),
    validation: Object.freeze({ valid: true, issueCount: 0 }),
    grhMutation: false,
    payrollCalculated: false,
    payrollPosted: false,
    persistencePerformed: false,
  });
}

export function normalizePayrollNoveltyTransition(command, value) {
  if (!TRANSITIONS.has(command)) {
    fail('PAYROLL_NOVELTY_COMMAND_INVALID', 400, 'Comando no permitido');
  }
  exactObject(
    value,
    TRANSITION_KEYS,
    'PAYROLL_NOVELTY_TRANSITION_INVALID',
    'La transición no coincide con el contrato',
  );
  const batchId = typeof value.batchId === 'string' ? value.batchId.toLowerCase() : '';
  if (!UUID.test(batchId)) {
    fail('PAYROLL_NOVELTY_BATCH_ID_INVALID', 422, 'El identificador de lote no es válido');
  }
  if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1) {
    fail('PAYROLL_NOVELTY_VERSION_REQUIRED', 428, 'expectedVersion es obligatorio');
  }
  if (typeof value.reasonCode !== 'string' || !REASONS[command].has(value.reasonCode)) {
    fail('PAYROLL_NOVELTY_REASON_INVALID', 422, 'El motivo no corresponde al comando');
  }
  const reasonReference = value.reasonReference === null
    ? null : String(value.reasonReference || '').trim().toLowerCase();
  if (['reject', 'cancel'].includes(command)) {
    if (!reasonReference || !/^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(reasonReference)) {
      fail(
        'PAYROLL_NOVELTY_REASON_REFERENCE_REQUIRED',
        422,
        'El rechazo o la cancelación exige una referencia opaca',
      );
    }
  } else if (reasonReference !== null) {
    fail('PAYROLL_NOVELTY_REASON_REFERENCE_INVALID', 422, 'Este comando no admite referencia');
  }
  return Object.freeze({
    batchId,
    expectedVersion: value.expectedVersion,
    reasonCode: value.reasonCode,
    reasonReference,
  });
}

export function normalizePayrollNoveltyIdempotencyKey(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID_V4.test(key)) {
    fail(
      'PAYROLL_NOVELTY_IDEMPOTENCY_KEY_INVALID',
      428,
      'Idempotency-Key debe ser un UUID v4',
    );
  }
  return key;
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
    fail('PAYROLL_NOVELTY_SESSION_INVALID', 401, 'La sesión operativa ya no es válida');
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
    ['PAYROLL_NOVELTY_IDEMPOTENCY_REUSE', 409, 'La clave de idempotencia ya fue usada'],
    ['PAYROLL_NOVELTY_DUPLICATE_BATCH', 409, 'Ya existe un lote equivalente'],
    ['PAYROLL_NOVELTY_VERSION_CONFLICT', 409, 'El lote fue modificado por otra persona'],
    ['PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED', 409, 'La persona que preparó el lote no puede aprobarlo'],
    ['PAYROLL_NOVELTY_LEGAJO_NOT_FOUND', 422, 'Un legajo no tiene un contrato GRH activo y único'],
    ['PAYROLL_NOVELTY_CONCEPT_INVALID', 422, 'Un concepto no pertenece al contrato de nómina vigente'],
    ['PAYROLL_NOVELTY_DUPLICATE_ROW', 422, 'El lote contiene novedades duplicadas'],
    ['PAYROLL_NOVELTY_VALIDATION_REQUIRED', 422, 'El lote contiene observaciones que impiden enviarlo'],
    ['PAYROLL_NOVELTY_BLOCKING_ISSUES', 422, 'El lote contiene validaciones bloqueantes'],
    ['PAYROLL_NOVELTY_PREPARE_INVALID', 422, 'El lote no cumple el contrato de novedades'],
    ['PAYROLL_NOVELTY_CONTRACT_OUT_OF_BINDING', 422, 'Un legajo no pertenece al binding GRH certificado'],
    ['PAYROLL_NOVELTY_ADJUSTMENT_AFTER_PERIOD', 422, 'El mes de ajuste supera el período de liquidación'],
    ['PAYROLL_NOVELTY_TRANSITION_INVALID', 409, 'La transición no está permitida'],
    ['PAYROLL_NOVELTY_PREPARER_REQUIRED', 403, 'Sólo quien preparó el lote puede enviarlo o cancelarlo'],
    ['PAYROLL_NOVELTY_CAPABILITY_REQUIRED', 403, 'No posee la capacidad requerida'],
    ['PAYROLL_NOVELTY_EMPLOYMENT_REQUIRED', 403, 'La operación exige un vínculo laboral vigente'],
    ['PAYROLL_NOVELTY_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad operativa'],
    ['PAYROLL_NOVELTY_NOT_FOUND', 404, 'Lote de novedades no encontrado'],
    ['PAYROLL_NOVELTY_NOT_EXPORTABLE', 409, 'El lote todavía no está aprobado para exportar'],
    ['PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED', 403, 'La exportación exige acceso nominal explícito'],
    ['PAYROLL_NOVELTY_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
    ['PAYROLL_NOVELTY_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ['PAYROLL_NOVELTY_RELEASE_NOT_CERTIFIED', 503, 'El contrato de datos activo no está certificado'],
    ['PAYROLL_NOVELTY_BINDING_REQUIRED', 503, 'El binding GRH certificado no está disponible'],
    ['PAYROLL_NOVELTY_EXPORT_NOT_ALLOWED', 409, 'El lote todavía no está aprobado para exportar'],
    ['TENANT_IAM_SOD_CONFLICT', 403, 'La membresía combina capacidades incompatibles'],
  ];
  for (const [code, status, safeMessage] of definitions) {
    if (message.includes(code)) return new PayrollNoveltyError(code, status, safeMessage);
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
      fail('PAYROLL_NOVELTY_UNAVAILABLE', 503, 'Novedades de nómina no disponibles');
    }
    return envelope;
  } catch (error) {
    throw mappedSqlError(error);
  }
}

function commandHash(context, command, payload) {
  return createHash('sha256').update(stableJson({
    contractVersion: PAYROLL_NOVELTY_CONTRACT_VERSION,
    tenantId: context.tenantId,
    membershipId: context.membershipId,
    actorSessionId: context.actorSessionId,
    actorSessionVersion: context.actorSessionVersion,
    releaseSha: context.releaseSha,
    command,
    payload,
  })).digest('hex');
}

function assertEnvelopeFlags(envelope) {
  const flagSources = [envelope, envelope?.data, envelope?.feature].filter(Boolean);
  for (const source of flagSources) {
    for (const [name, expected] of [
      ['grhMutation', false],
      ['payrollCalculated', false],
      ['payrollPosted', false],
    ]) {
      if (Object.hasOwn(source, name) && source[name] !== expected) {
        fail('PAYROLL_NOVELTY_CONTRACT_DRIFT', 503, 'El contrato de novedades no es seguro');
      }
    }
  }
  return envelope;
}

export async function getPayrollNoveltyBootstrap(sql, identityPrincipal, session) {
  const context = identityContext(identityPrincipal, session);
  const envelope = await facade(
    sql,
    'payroll_novelty_bootstrap_v1',
    [JSON.stringify(context)],
    ['jsonb'],
  );
  return assertEnvelopeFlags(envelope);
}

export async function readPayrollNovelty(sql, identityPrincipal, session, batchId) {
  const context = identityContext(identityPrincipal, session);
  const id = typeof batchId === 'string' ? batchId.trim().toLowerCase() : '';
  if (!UUID.test(id)) fail('PAYROLL_NOVELTY_BATCH_ID_INVALID', 422, 'Identificador inválido');
  const envelope = await facade(
    sql,
    'payroll_novelty_detail_v1',
    [JSON.stringify(context), id],
    ['jsonb', 'uuid'],
  );
  return assertEnvelopeFlags(envelope);
}

export async function preparePayrollNovelty(
  sql, identityPrincipal, session, rawDraft, idempotencyKey,
) {
  const context = identityContext(identityPrincipal, session);
  const draft = normalizePayrollNoveltyDraft(rawDraft);
  const key = normalizePayrollNoveltyIdempotencyKey(idempotencyKey);
  const hash = commandHash(context, 'prepare', draft);
  const envelope = await facade(sql, 'payroll_novelty_prepare_v1', [
    JSON.stringify(context),
    draft.sourceMode,
    draft.periodMonth,
    draft.payrollType,
    JSON.stringify(draft.rows),
    key,
    hash,
  ], ['jsonb', '', 'date', '', 'jsonb', 'uuid', '']);
  return assertEnvelopeFlags(envelope);
}

export async function transitionPayrollNovelty(
  sql, identityPrincipal, session, command, rawTransition, idempotencyKey,
) {
  const context = identityContext(identityPrincipal, session);
  const transition = normalizePayrollNoveltyTransition(command, rawTransition);
  const key = normalizePayrollNoveltyIdempotencyKey(idempotencyKey);
  const hash = commandHash(context, command, transition);
  const envelope = await facade(sql, 'payroll_novelty_transition_v1', [
    JSON.stringify(context), transition.batchId, command, transition.expectedVersion,
    transition.reasonCode, transition.reasonReference, key, hash,
  ], ['jsonb', 'uuid', '', 'integer', '', '', 'uuid', '']);
  return assertEnvelopeFlags(envelope);
}

export async function exportPayrollNovelty(sql, identityPrincipal, session, batchId) {
  const context = identityContext(identityPrincipal, session);
  const id = typeof batchId === 'string' ? batchId.trim().toLowerCase() : '';
  if (!UUID.test(id)) fail('PAYROLL_NOVELTY_BATCH_ID_INVALID', 422, 'Identificador inválido');
  const envelope = await facade(
    sql,
    'payroll_novelty_export_v1',
    [JSON.stringify(context), id],
    ['jsonb', 'uuid'],
  );
  const safe = assertEnvelopeFlags(envelope);
  if (safe.contractVersion !== 'payroll-novelty-export.v1'
      || safe.approvalEffect !== 'export_only'
      || safe.data?.exportable !== true
      || safe.data?.status !== 'approved'
      || safe.data?.contractVersion !== PAYROLL_NOVELTY_CONTRACT_VERSION
      || !Array.isArray(safe.data?.rows)) {
    fail('PAYROLL_NOVELTY_CONTRACT_DRIFT', 503, 'La exportación aprobada no es válida');
  }
  return safe;
}
