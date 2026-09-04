import { createHash } from 'node:crypto';

import {
  MONTHLY_CLOSE_MAX_BYTES,
  MONTHLY_CLOSE_SOURCE_CONTRACTS,
  buildMonthlyClosePrecheck,
  prepareMonthlyCloseSource,
} from './internal-monthly-close-contracts.js';

export const PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION =
  'payroll-monthly-close-run.v1';
export const PAYROLL_MONTHLY_CLOSE_MAX_SOURCE_BYTES = MONTHLY_CLOSE_MAX_BYTES;
export const PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT = 3;
export const PAYROLL_MONTHLY_CLOSE_JURISDICTIONS = Object.freeze(['42', '55']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const CODE = /^[0-9]{1,8}$/;
const INT64 = /^(?:0|-?[1-9][0-9]{0,18})$/;
const POSITIVE_INT32 = /^[1-9][0-9]{0,9}$/;
const MIN_INT64 = -9223372036854775808n;
const MAX_INT64 = 9223372036854775807n;
const MAX_INT32 = 2147483647n;
const REFERENCE = /^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PREPARE_KEYS = new Set(['period', 'jurisdiction', 'sources']);
const SOURCE_KEYS = new Set(['definitionKey', 'sourceKind', 'bytes']);
const TRANSITION_KEYS = new Set([
  'runId', 'expectedVersion', 'reasonCode', 'reasonReference',
]);
const SOURCE_PAIRS = Object.freeze({
  'grh-concept-statistics.v1': 'grh_observed',
  'bank-accreditation-summary.v1': 'bank_control',
  'government-payroll-summary.v1': 'government_control',
});
const REASONS = Object.freeze({
  submit: new Set(['ready_for_review']),
  approve: new Set(['approved_by_checker']),
  reject: new Set(['source_mismatch', 'evidence_insufficient', 'period_not_ready']),
  cancel: new Set(['cancelled_by_preparer']),
});
const STATUSES = new Set(['prepared', 'submitted', 'approved', 'rejected', 'cancelled']);
const COMMANDS = new Set(['submit', 'approve', 'reject', 'cancel']);
const CAPABILITIES = new Set([
  'payroll.monthly_close.read',
  'payroll.monthly_close.prepare',
  'payroll.monthly_close.approve',
  'payroll.monthly_close.audit.read',
]);
const REASON_CODES = new Set([
  'sources_prepared', 'ready_for_review', 'approved_by_checker',
  'source_mismatch', 'evidence_insufficient', 'period_not_ready',
  'cancelled_by_preparer',
]);
const SAFE_FALSE_FLAGS = Object.freeze([
  'includesPersonalRecords',
  'rawContentStored',
  'grhMutation',
  'payrollCalculated',
  'payrollPosted',
  'bankArtifactGenerated',
  'governmentArtifactGenerated',
  'fiscalArtifactGenerated',
]);
const FLAGS_KEYS = new Set(['closeApproved', ...SAFE_FALSE_FLAGS]);
const RUN_KEYS = new Set([
  'id', 'contractVersion', 'period', 'jurisdiction', 'status', 'version',
  'sourceSetSha256', 'sourceCount', 'mismatchCount', 'blockingIssueCount',
  'reasonCode', 'reasonReference', 'closeApproved', 'totals', 'sources',
  'reconciliation', 'blockingIssues', 'createdAt', 'updatedAt', 'submittedAt',
  'decidedAt', 'timeline',
]);
const PREPARED_OUTPUT_KEYS = new Set([
  'contractVersion', 'periodMonth', 'jurisdiction', 'sourceSetSha256', 'sources',
  'reconciliation', 'blockingIssues', 'sourceCount', 'readyForReview',
  'includesPersonalRecords', 'rawContentStored', 'grhMutation',
  'payrollCalculated', 'payrollPosted', 'closeApproved',
  'bankArtifactGenerated', 'governmentArtifactGenerated',
  'fiscalArtifactGenerated',
]);
const SOURCE_OUTPUT_KEYS = new Set([
  'definitionKey', 'sourceKind', 'contentHmacSha256', 'manifestSha256',
  'byteLength', 'recordCount', 'aggregates',
]);
const CONCEPT_MONEY_FIELDS = Object.freeze([
  'haberesRemunerativosCents', 'haberesNoRemunerativosCents',
  'asignacionesFamiliaresCents', 'retencionesCents', 'contribucionesCents',
]);
const GOVERNMENT_METRIC_UNITS = Object.freeze({
  cantidad_agentes: 'personas',
  haberes_rem_no_docentes: 'centavos',
  haberes_rem_docentes: 'centavos',
  haberes_no_rem: 'centavos',
  aportes_jubilatorios_no_docentes: 'centavos',
  aportes_jubilatorios_docentes: 'centavos',
  aportes_jubilatorios_docentes_2: 'centavos',
  aportes_osep: 'centavos',
  aportes_osep_no_rem: 'centavos',
  seguro_mutual: 'centavos',
  contribuciones_jubilatorias: 'centavos',
  contribuciones_osep: 'centavos',
  contribuciones_osep_no_rem: 'centavos',
  art: 'centavos',
});
const NET_ISSUE_CODES = Object.freeze([
  'MONTHLY_CLOSE_REPARTITION_MISSING_IN_CONCEPT_STATISTICS',
  'MONTHLY_CLOSE_REPARTITION_MISSING_IN_BANK_SUMMARY',
  'MONTHLY_CLOSE_REPARTITION_NET_MISMATCH',
]);
const SENSITIVE_OUTPUT_KEYS = new Set([
  'dni', 'cuil', 'cbu', 'email', 'employeeid', 'legajo', 'name', 'filename',
  'originalname', 'rawbytes', 'rawcontent', 'accountnumber',
]);

export class PayrollMonthlyCloseError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'PayrollMonthlyCloseError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new PayrollMonthlyCloseError(code, status, message);
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

function canonicalUuid(value, code, message) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID.test(normalized)) fail(code, 422, message);
  return normalized;
}

function canonicalReference(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!REFERENCE.test(normalized)) {
    fail(
      'PAYROLL_MONTHLY_CLOSE_REASON_REFERENCE_REQUIRED',
      422,
      'La decisión exige una referencia opaca de expediente o respaldo',
    );
  }
  return normalized;
}

function sourceBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  fail(
    'PAYROLL_MONTHLY_CLOSE_SOURCE_INVALID',
    400,
    'Cada fuente debe aportar bytes transitorios',
  );
}

export function normalizePayrollMonthlyCloseDraft(rawDraft, context) {
  exactObject(
    rawDraft,
    PREPARE_KEYS,
    'PAYROLL_MONTHLY_CLOSE_DRAFT_INVALID',
    'El cierre mensual no coincide con el contrato vigente',
  );
  if (typeof rawDraft.period !== 'string' || !PERIOD.test(rawDraft.period)) {
    fail('PAYROLL_MONTHLY_CLOSE_PERIOD_INVALID', 422, 'El período debe usar YYYY-MM');
  }
  if (typeof rawDraft.jurisdiction !== 'string'
      || !PAYROLL_MONTHLY_CLOSE_JURISDICTIONS.includes(rawDraft.jurisdiction)) {
    fail('PAYROLL_MONTHLY_CLOSE_JURISDICTION_INVALID', 422, 'La jurisdicción debe ser 42 o 55');
  }
  if (!Array.isArray(rawDraft.sources)
      || rawDraft.sources.length !== PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT) {
    fail(
      'PAYROLL_MONTHLY_CLOSE_SOURCE_SET_INVALID',
      422,
      'El cierre exige exactamente las tres fuentes agregadas',
    );
  }

  const seen = new Set();
  const prepared = rawDraft.sources.map((source) => {
    exactObject(
      source,
      SOURCE_KEYS,
      'PAYROLL_MONTHLY_CLOSE_SOURCE_INVALID',
      'Una fuente no coincide con el contrato vigente',
    );
    const expectedKind = SOURCE_PAIRS[source.definitionKey];
    if (!expectedKind || source.sourceKind !== expectedKind || seen.has(source.definitionKey)) {
      fail(
        'PAYROLL_MONTHLY_CLOSE_SOURCE_SET_INVALID',
        422,
        'Las tres fuentes deben ser únicas y usar su tipo canónico',
      );
    }
    seen.add(source.definitionKey);
    return prepareMonthlyCloseSource({
      definitionKey: source.definitionKey,
      sourceKind: source.sourceKind,
      period: rawDraft.period,
      jurisdiction: rawDraft.jurisdiction,
      bytes: sourceBytes(source.bytes),
      context,
    });
  });
  if (seen.size !== Object.keys(SOURCE_PAIRS).length) {
    fail(
      'PAYROLL_MONTHLY_CLOSE_SOURCE_SET_INVALID',
      422,
      'Falta una fuente agregada obligatoria',
    );
  }

  const precheck = buildMonthlyClosePrecheck(prepared);
  const sources = Object.freeze(prepared
    .map((source) => Object.freeze({
      definitionKey: source.definitionKey,
      sourceKind: source.sourceKind,
      contentHmacSha256: source.contentHmacSha256,
      manifestSha256: source.manifestSha256,
      byteLength: source.byteLength,
      recordCount: source.recordCount,
      aggregates: Object.freeze({
        rows: source.rows,
        totals: source.totals,
        readiness: source.readiness,
      }),
    }))
    .sort((left, right) => left.definitionKey.localeCompare(right.definitionKey)));
  const sourceSetSha256 = createHash('sha256').update(stableJson({
    contractVersion: PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION,
    period: rawDraft.period,
    jurisdiction: rawDraft.jurisdiction,
    manifests: sources.map(({ definitionKey, manifestSha256 }) => ({
      definitionKey, manifestSha256,
    })),
  })).digest('hex');

  return Object.freeze({
    contractVersion: PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION,
    periodMonth: `${rawDraft.period}-01`,
    jurisdiction: rawDraft.jurisdiction,
    sourceSetSha256,
    sources,
    reconciliation: precheck.reconciliation,
    blockingIssues: precheck.blockingIssues,
    sourceCount: PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT,
    readyForReview: precheck.readyForReview,
    includesPersonalRecords: false,
    rawContentStored: false,
    grhMutation: false,
    payrollCalculated: false,
    payrollPosted: false,
    closeApproved: false,
    bankArtifactGenerated: false,
    governmentArtifactGenerated: false,
    fiscalArtifactGenerated: false,
  });
}

export function normalizePayrollMonthlyCloseTransition(command, rawTransition) {
  if (!Object.hasOwn(REASONS, command)) {
    fail('PAYROLL_MONTHLY_CLOSE_COMMAND_INVALID', 400, 'Comando no permitido');
  }
  exactObject(
    rawTransition,
    TRANSITION_KEYS,
    'PAYROLL_MONTHLY_CLOSE_TRANSITION_INVALID',
    'La transición no coincide con el contrato vigente',
  );
  const runId = canonicalUuid(
    rawTransition.runId,
    'PAYROLL_MONTHLY_CLOSE_RUN_ID_INVALID',
    'La corrida de cierre no es válida',
  );
  if (!Number.isSafeInteger(rawTransition.expectedVersion)
      || rawTransition.expectedVersion < 1) {
    fail(
      'PAYROLL_MONTHLY_CLOSE_VERSION_REQUIRED',
      428,
      'expectedVersion es obligatorio',
    );
  }
  if (typeof rawTransition.reasonCode !== 'string'
      || !REASONS[command].has(rawTransition.reasonCode)) {
    fail(
      'PAYROLL_MONTHLY_CLOSE_REASON_INVALID',
      422,
      'El motivo no corresponde al comando',
    );
  }
  return Object.freeze({
    runId,
    expectedVersion: rawTransition.expectedVersion,
    reasonCode: rawTransition.reasonCode,
    reasonReference: canonicalReference(rawTransition.reasonReference),
  });
}

export function normalizePayrollMonthlyCloseIdempotencyKey(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID_V4.test(normalized)) {
    fail(
      'PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_KEY_INVALID',
      428,
      'Idempotency-Key debe ser un UUID v4',
    );
  }
  return normalized;
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
      'PAYROLL_MONTHLY_CLOSE_SESSION_INVALID',
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
    ['PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_REUSE', 409, 'La clave de idempotencia ya fue usada'],
    ['PAYROLL_MONTHLY_CLOSE_DUPLICATE_RUN', 409, 'Ya existe un cierre activo para ese período y jurisdicción'],
    ['PAYROLL_MONTHLY_CLOSE_VERSION_CONFLICT', 409, 'La corrida fue modificada por otra persona'],
    ['PAYROLL_MONTHLY_CLOSE_MAKER_CHECKER_REQUIRED', 409, 'La persona que preparó el cierre no puede decidirlo'],
    ['PAYROLL_MONTHLY_CLOSE_DIFFERENCE_BLOCKS_APPROVAL', 409, 'Una diferencia de uno o más centavos bloquea la aprobación'],
    ['PAYROLL_MONTHLY_CLOSE_BLOCKING_ISSUES', 409, 'El cierre conserva controles bloqueantes'],
    ['PAYROLL_MONTHLY_CLOSE_TRANSITION_INVALID', 409, 'La transición no está permitida'],
    ['PAYROLL_MONTHLY_CLOSE_PREPARER_REQUIRED', 403, 'Sólo quien preparó el cierre puede enviarlo o cancelarlo'],
    ['PAYROLL_MONTHLY_CLOSE_CAPABILITY_REQUIRED', 403, 'No posee la capacidad requerida'],
    ['PAYROLL_MONTHLY_CLOSE_EMPLOYMENT_REQUIRED', 403, 'La decisión exige un vínculo laboral vigente'],
    ['PAYROLL_MONTHLY_CLOSE_ATTEMPT_NOT_FOUND', 404, 'No se encontró un resultado para este intento'],
    ['PAYROLL_MONTHLY_CLOSE_ATTEMPT_CONTEXT_CHANGED', 409, 'La autoridad del intento cambió; no se puede confirmar su resultado'],
    ['PAYROLL_MONTHLY_CLOSE_NOT_FOUND', 404, 'Cierre mensual no encontrado'],
    ['PAYROLL_MONTHLY_CLOSE_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
    ['PAYROLL_MONTHLY_CLOSE_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ['PAYROLL_MONTHLY_CLOSE_RELEASE_NOT_CERTIFIED', 503, 'El contrato de datos activo no está certificado'],
    ['PAYROLL_MONTHLY_CLOSE_BINDING_REQUIRED', 503, 'El binding GRH certificado no está disponible'],
    ['PAYROLL_MONTHLY_CLOSE_BINDING_CHANGED', 409, 'El binding GRH cambió durante la preparación'],
    ['PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID', 422, 'Las fuentes no cumplen el contrato de cierre'],
    ['ACTION_SOURCE_BINDING_REQUIRED', 503, 'El binding GRH certificado no está disponible'],
    ['ACTION_TENANT_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad operativa'],
    ['ACTION_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
    ['ACTION_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ['ACTION_RELEASE_NOT_CERTIFIED', 503, 'El contrato de datos activo no está certificado'],
    ['TENANT_IAM_SOD_CONFLICT', 403, 'La membresía combina capacidades incompatibles'],
  ];
  for (const [code, status, safeMessage] of definitions) {
    if (message.includes(code)) return new PayrollMonthlyCloseError(code, status, safeMessage);
  }
  return error;
}

async function facade(sql, functionName, values, casts, envelopeKind, expectedCommand = null) {
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
        'PAYROLL_MONTHLY_CLOSE_UNAVAILABLE',
        503,
        'Cierre mensual temporalmente no disponible',
      );
    }
    return assertSafeEnvelope(envelope, envelopeKind, expectedCommand);
  } catch (error) {
    throw mappedSqlError(error);
  }
}

function commandHash(context, command, payload, certifiedBindingId) {
  return createHash('sha256').update(stableJson({
    contractVersion: PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION,
    tenantId: context.tenantId,
    membershipId: context.membershipId,
    actorSessionId: context.actorSessionId,
    actorSessionVersion: context.actorSessionVersion,
    releaseSha: context.releaseSha,
    certifiedBindingId,
    command,
    payload,
  })).digest('hex');
}

function contractDrift() {
  fail(
    'PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT',
    503,
    'El contrato de cierre mensual no es seguro',
  );
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function exactContractObject(value, keys) {
  return isRecord(value)
    && Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}

function assertNoSensitiveOutput(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveOutput);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_OUTPUT_KEYS.has(key.toLowerCase())) contractDrift();
    assertNoSensitiveOutput(nested);
  }
}

function assertFlags(flags) {
  if (!exactContractObject(flags, FLAGS_KEYS)
      || SAFE_FALSE_FLAGS.some((flag) => flags[flag] !== false)
      || typeof flags.closeApproved !== 'boolean') contractDrift();
}

function int64Value(value, { nonNegative = false, positive = false } = {}) {
  if (typeof value !== 'string' || !INT64.test(value)) return null;
  const parsed = BigInt(value);
  if (parsed < MIN_INT64 || parsed > MAX_INT64
      || (nonNegative && parsed < 0n) || (positive && parsed <= 0n)) return null;
  return parsed;
}

function checkedInt64Value(value) {
  if (value < MIN_INT64 || value > MAX_INT64) contractDrift();
  return value;
}

function positiveInt32Value(value) {
  if (typeof value !== 'string' || !POSITIVE_INT32.test(value)) return null;
  const parsed = BigInt(value);
  return parsed <= MAX_INT32 ? parsed : null;
}

function exactJson(left, right) {
  return stableJson(left) === stableJson(right);
}

function assertReadiness(readiness, expectedIssues) {
  if (!exactContractObject(
    readiness,
    new Set(['structurallyValid', 'readyForReview', 'blockingIssues']),
  ) || readiness.structurallyValid !== true
      || readiness.readyForReview !== (expectedIssues.length === 0)
      || !Array.isArray(readiness.blockingIssues)
      || !exactJson(readiness.blockingIssues, expectedIssues)) contractDrift();
}

function assertConceptAggregates(source) {
  const { rows, totals, readiness } = source.aggregates;
  const rowKeys = new Set([
    'repartitionCode', 'conceptCode', 'occurrences', 'quantityHundredths',
    ...CONCEPT_MONEY_FIELDS,
  ]);
  if (rows.length < 1 || rows.length > 5000
      || !exactContractObject(totals, new Set(CONCEPT_MONEY_FIELDS))) contractDrift();
  const seen = new Set();
  for (const row of rows) {
    if (!exactContractObject(row, rowKeys) || !CODE.test(row.repartitionCode)
        || !CODE.test(row.conceptCode) || positiveInt32Value(row.occurrences) === null
        || int64Value(row.quantityHundredths) === null
        || CONCEPT_MONEY_FIELDS.some((field) => int64Value(row[field]) === null)
        || (row.quantityHundredths === '0'
          && CONCEPT_MONEY_FIELDS.every((field) => row[field] === '0'))) contractDrift();
    const key = `${row.repartitionCode}:${row.conceptCode}`;
    if (seen.has(key)) contractDrift();
    seen.add(key);
  }
  for (const field of CONCEPT_MONEY_FIELDS) {
    const total = rows.reduce(
      (sum, row) => checkedInt64Value(sum + BigInt(row[field])), 0n,
    );
    if (int64Value(totals[field]) === null || totals[field] !== total.toString()) contractDrift();
  }
  assertReadiness(readiness, []);
}

function assertBankAggregates(source) {
  const { rows, totals, readiness } = source.aggregates;
  const rowKeys = new Set([
    'repartitionCode', 'bankCode', 'accountType', 'operations', 'netAmountCents',
  ]);
  if (rows.length < 1 || rows.length > 1000
      || !exactContractObject(totals, new Set(['operations', 'netAmountCents']))) {
    contractDrift();
  }
  const seen = new Set();
  let operations = 0n;
  let net = 0n;
  for (const row of rows) {
    if (!exactContractObject(row, rowKeys) || !CODE.test(row.repartitionCode)
        || !CODE.test(row.bankCode)
        || !['cuenta_corriente', 'caja_ahorro', 'transferencia_especial']
          .includes(row.accountType)
        || positiveInt32Value(row.operations) === null
        || int64Value(row.netAmountCents, { positive: true }) === null) contractDrift();
    const key = `${row.repartitionCode}:${row.bankCode}:${row.accountType}`;
    if (seen.has(key)) contractDrift();
    seen.add(key);
    operations = checkedInt64Value(operations + BigInt(row.operations));
    net = checkedInt64Value(net + BigInt(row.netAmountCents));
  }
  if (int64Value(totals.operations, { positive: true }) === null
      || int64Value(totals.netAmountCents, { positive: true }) === null
      || totals.operations !== operations.toString()
      || totals.netAmountCents !== net.toString()) contractDrift();
  assertReadiness(readiness, []);
}

function assertGovernmentAggregates(source) {
  const { rows, totals, readiness } = source.aggregates;
  const rowKeys = new Set(['metric', 'unit', 'state', 'valueInteger']);
  if (totals !== null || rows.length !== Object.keys(GOVERNMENT_METRIC_UNITS).length) {
    contractDrift();
  }
  const seen = new Set();
  const expectedIssues = [];
  for (const row of rows) {
    const unit = GOVERNMENT_METRIC_UNITS[row?.metric];
    if (!exactContractObject(row, rowKeys) || !unit || seen.has(row.metric)
        || row.unit !== unit || !['informado', 'no_informado'].includes(row.state)
        || (row.state === 'informado'
          ? int64Value(row.valueInteger, { nonNegative: true }) === null
          : row.valueInteger !== null)) contractDrift();
    seen.add(row.metric);
    if (row.state === 'no_informado') expectedIssues.push({
      code: 'MONTHLY_CLOSE_METRIC_NOT_INFORMED', metric: row.metric,
    });
  }
  if (Object.keys(GOVERNMENT_METRIC_UNITS).some((metric) => !seen.has(metric))) contractDrift();
  assertReadiness(readiness, expectedIssues);
}

function assertSource(source) {
  if (!exactContractObject(source, SOURCE_OUTPUT_KEYS)
      || SOURCE_PAIRS[source.definitionKey] !== source.sourceKind
      || !SHA256.test(String(source.contentHmacSha256 || ''))
      || !SHA256.test(String(source.manifestSha256 || ''))
      || !Number.isSafeInteger(source.byteLength) || source.byteLength < 1
      || source.byteLength > PAYROLL_MONTHLY_CLOSE_MAX_SOURCE_BYTES
      || !Number.isSafeInteger(source.recordCount) || source.recordCount < 1
      || !exactContractObject(source.aggregates, new Set(['rows', 'totals', 'readiness']))
      || !Array.isArray(source.aggregates.rows)
      || source.recordCount !== source.aggregates.rows.length) contractDrift();
  if (source.definitionKey === 'grh-concept-statistics.v1') assertConceptAggregates(source);
  else if (source.definitionKey === 'bank-accreditation-summary.v1') assertBankAggregates(source);
  else assertGovernmentAggregates(source);
  assertNoSensitiveOutput(source);
}

function groupedNet(rows, fieldFactory) {
  const totals = new Map();
  for (const row of rows) {
    totals.set(row.repartitionCode, checkedInt64Value(
      (totals.get(row.repartitionCode) || 0n) + fieldFactory(row),
    ));
  }
  return totals;
}

function sumGovernmentMetrics(rows, metrics) {
  const byMetric = new Map(rows.map((row) => [row.metric, row]));
  if (metrics.some((metric) => byMetric.get(metric)?.state !== 'informado')) return null;
  return metrics.reduce((sum, metric) => checkedInt64Value(
    sum + BigInt(byMetric.get(metric).valueInteger),
  ), 0n);
}

function expectedReconciliation(sources) {
  const byDefinition = new Map(sources.map((source) => [source.definitionKey, source]));
  const concepts = byDefinition.get('grh-concept-statistics.v1').aggregates;
  const banks = byDefinition.get('bank-accreditation-summary.v1').aggregates;
  const government = byDefinition.get('government-payroll-summary.v1').aggregates;
  const conceptNet = groupedNet(concepts.rows, (row) => checkedInt64Value(
    BigInt(row.haberesRemunerativosCents) + BigInt(row.haberesNoRemunerativosCents)
      + BigInt(row.asignacionesFamiliaresCents) - BigInt(row.retencionesCents),
  ));
  const bankNet = groupedNet(banks.rows, (row) => BigInt(row.netAmountCents));
  const repartitions = [...new Set([...conceptNet.keys(), ...bankNet.keys()])]
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
  const blockingIssues = [];
  const comparisons = repartitions.map((repartitionCode) => {
    const reported = conceptNet.get(repartitionCode);
    const bank = bankNet.get(repartitionCode);
    const issueCodes = [];
    if (reported === undefined) issueCodes.push(NET_ISSUE_CODES[0]);
    if (bank === undefined) issueCodes.push(NET_ISSUE_CODES[1]);
    const difference = reported === undefined || bank === undefined
      ? null : checkedInt64Value(reported - bank);
    if (difference !== null && difference !== 0n) issueCodes.push(NET_ISSUE_CODES[2]);
    issueCodes.forEach((code) => blockingIssues.push({ code, repartitionCode }));
    return {
      repartitionCode,
      reportedEarningsLessRetentionsCents: reported?.toString() ?? null,
      reportedBankNetCents: bank?.toString() ?? null,
      differenceCents: difference?.toString() ?? null,
      matches: difference === 0n,
      issueCodes,
    };
  });
  const grhEarnings = checkedInt64Value(
    BigInt(concepts.totals.haberesRemunerativosCents)
      + BigInt(concepts.totals.haberesNoRemunerativosCents),
  );
  const governmentDefinitions = [
    ['earnings', grhEarnings,
      ['haberes_rem_no_docentes', 'haberes_rem_docentes', 'haberes_no_rem'],
      'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_MISMATCH',
      'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_NOT_COMPARABLE'],
    ['employer_contributions', BigInt(concepts.totals.contribucionesCents),
      ['contribuciones_jubilatorias', 'contribuciones_osep',
        'contribuciones_osep_no_rem', 'art'],
      'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_MISMATCH',
      'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_NOT_COMPARABLE'],
  ];
  const governmentComparisons = governmentDefinitions.map(([
    comparisonKey, grh, metrics, mismatchCode, unavailableCode,
  ]) => {
    const reportedGovernment = sumGovernmentMetrics(government.rows, metrics);
    const difference = reportedGovernment === null
      ? null : checkedInt64Value(grh - reportedGovernment);
    const issueCode = difference === 0n ? null
      : difference === null ? unavailableCode : mismatchCode;
    if (issueCode) blockingIssues.push({ code: issueCode, comparisonKey });
    return {
      comparisonKey,
      reportedGrhCents: grh.toString(),
      reportedGovernmentCents: reportedGovernment?.toString() ?? null,
      differenceCents: difference?.toString() ?? null,
      matches: difference === 0n,
      issueCode,
    };
  });
  const reported = [...conceptNet.values()].reduce(
    (sum, value) => checkedInt64Value(sum + value), 0n,
  );
  const bank = [...bankNet.values()].reduce(
    (sum, value) => checkedInt64Value(sum + value), 0n,
  );
  return {
    comparisons,
    governmentComparisons,
    totals: {
      reportedEarningsLessRetentionsCents: reported.toString(),
      reportedBankNetCents: bank.toString(),
      differenceCents: checkedInt64Value(reported - bank).toString(),
    },
    blockingIssues,
  };
}

function assertReconciliation(reconciliation, sources) {
  const keys = new Set([
    'basis', 'formula', 'toleranceCents', 'status', 'matched', 'comparisons',
    'governmentComparisons', 'totals', 'blockingIssues', 'rulesInferred',
    'governmentSummaryCompared', 'payrollNetCertified',
  ]);
  if (!exactContractObject(reconciliation, keys)
      || reconciliation.basis !== 'three_source_exact_aggregate_reconciliation'
      || reconciliation.formula !== 'haberes_rem + haberes_no_rem + asignaciones_familiares - retenciones'
      || reconciliation.toleranceCents !== '0'
      || !['matched', 'blocked'].includes(reconciliation.status)
      || typeof reconciliation.matched !== 'boolean'
      || reconciliation.matched !== (reconciliation.status === 'matched')
      || !Array.isArray(reconciliation.comparisons)
      || !Array.isArray(reconciliation.governmentComparisons)
      || reconciliation.governmentComparisons.length !== 2
      || !Array.isArray(reconciliation.blockingIssues)
      || reconciliation.rulesInferred !== false
      || reconciliation.governmentSummaryCompared !== true
      || reconciliation.payrollNetCertified !== false
      || !exactContractObject(reconciliation.totals, new Set([
        'reportedEarningsLessRetentionsCents', 'reportedBankNetCents',
        'differenceCents',
      ]))
      || Object.values(reconciliation.totals).some((value) => int64Value(value) === null)) {
    contractDrift();
  }
  const expected = expectedReconciliation(sources);
  if (!exactJson(reconciliation.comparisons, expected.comparisons)
      || !exactJson(reconciliation.governmentComparisons, expected.governmentComparisons)
      || !exactJson(reconciliation.totals, expected.totals)
      || !exactJson(reconciliation.blockingIssues, expected.blockingIssues)
      || reconciliation.matched !== (expected.blockingIssues.length === 0)
      || reconciliation.status !== (expected.blockingIssues.length === 0 ? 'matched' : 'blocked')) {
    contractDrift();
  }
  assertNoSensitiveOutput(reconciliation);
}

function assertPreparedRun(prepared) {
  if (!exactContractObject(prepared, PREPARED_OUTPUT_KEYS)
      || prepared.contractVersion !== PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION
      || !/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(String(prepared.periodMonth || ''))
      || !PAYROLL_MONTHLY_CLOSE_JURISDICTIONS.includes(prepared.jurisdiction)
      || !SHA256.test(String(prepared.sourceSetSha256 || ''))
      || prepared.sourceCount !== PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT
      || !Array.isArray(prepared.sources)
      || prepared.sources.length !== PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT
      || !Array.isArray(prepared.blockingIssues)
      || typeof prepared.readyForReview !== 'boolean'
      || SAFE_FALSE_FLAGS.some((flag) => prepared[flag] !== false)
      || prepared.closeApproved !== false) contractDrift();
  prepared.sources.forEach(assertSource);
  const definitions = prepared.sources.map((source) => source.definitionKey);
  if (new Set(definitions).size !== PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT
      || Object.keys(SOURCE_PAIRS).some((key) => !definitions.includes(key))) contractDrift();
  assertReconciliation(prepared.reconciliation, prepared.sources);
  const expectedBlockingIssues = [
    ...prepared.sources.flatMap((source) => source.aggregates.readiness.blockingIssues
      .map((issue) => ({ definitionKey: source.definitionKey, ...issue }))),
    ...prepared.reconciliation.blockingIssues.map((issue) => ({
      definitionKey: Object.hasOwn(issue, 'comparisonKey')
        ? 'monthly-close-government-reconciliation.v1'
        : 'monthly-close-net-reconciliation.v1',
      ...issue,
    })),
  ];
  const expectedSourceSetSha256 = createHash('sha256').update(stableJson({
    contractVersion: PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION,
    period: prepared.periodMonth.slice(0, 7),
    jurisdiction: prepared.jurisdiction,
    manifests: prepared.sources.map(({ definitionKey, manifestSha256 }) => ({
      definitionKey, manifestSha256,
    })).sort((left, right) => left.definitionKey.localeCompare(
      right.definitionKey, 'en', { numeric: true },
    )),
  })).digest('hex');
  if (!exactJson(prepared.blockingIssues, expectedBlockingIssues)
      || prepared.readyForReview !== (expectedBlockingIssues.length === 0)
      || prepared.sourceSetSha256 !== expectedSourceSetSha256) contractDrift();
  assertNoSensitiveOutput(prepared);
}

function assertTimeline(timeline, { required, runStatus, runVersion }) {
  if (!Array.isArray(timeline)) contractDrift();
  const keys = new Set([
    'id', 'command', 'fromStatus', 'toStatus', 'expectedVersion',
    'resultingVersion', 'reasonCode', 'reasonReference', 'actorRoleKey',
    'eventSha256', 'occurredAt',
  ]);
  if (required && timeline.length === 0) contractDrift();
  let previous = null;
  for (const event of timeline) {
    const isPrepare = event.command === 'prepare';
    if (!exactContractObject(event, keys)
        || !Number.isSafeInteger(event.id) || event.id < 1
        || !['prepare', ...COMMANDS].includes(event.command)
        || (isPrepare ? event.fromStatus !== null : !STATUSES.has(event.fromStatus))
        || !STATUSES.has(event.toStatus)
        || (isPrepare
          ? event.expectedVersion !== 0 || event.resultingVersion !== 1
            || event.toStatus !== 'prepared' || event.reasonCode !== 'sources_prepared'
            || event.reasonReference !== null
          : !Number.isSafeInteger(event.expectedVersion) || event.expectedVersion < 1)
        || !Number.isSafeInteger(event.resultingVersion) || event.resultingVersion < 1
        || event.resultingVersion !== event.expectedVersion + 1
        || !REASON_CODES.has(event.reasonCode)
        || !(event.reasonReference === null || REFERENCE.test(event.reasonReference))
        || typeof event.actorRoleKey !== 'string' || event.actorRoleKey.length < 1
        || !SHA256.test(String(event.eventSha256 || ''))
        || typeof event.occurredAt !== 'string') contractDrift();
    if (previous && (event.fromStatus !== previous.toStatus
        || event.expectedVersion !== previous.resultingVersion
        || event.id <= previous.id)) contractDrift();
    if (!previous && !isPrepare) contractDrift();
    previous = event;
  }
  if (previous && (previous.toStatus !== runStatus
      || previous.resultingVersion !== runVersion)) contractDrift();
}

function assertRun(run, { includeSources, includeAllowedCommands }) {
  const expectedKeys = new Set(RUN_KEYS);
  if (includeAllowedCommands) expectedKeys.add('allowedCommands');
  if (!exactContractObject(run, expectedKeys)
      || !UUID.test(String(run.id || ''))
      || run.contractVersion !== PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION
      || !STATUSES.has(run.status)
      || !PERIOD.test(String(run.period || ''))
      || !PAYROLL_MONTHLY_CLOSE_JURISDICTIONS.includes(run.jurisdiction)
      || !SHA256.test(String(run.sourceSetSha256 || ''))
      || !Number.isSafeInteger(run.version) || run.version < 1 || run.version > Number(MAX_INT32)
      || run.sourceCount !== PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT
      || !Number.isSafeInteger(run.mismatchCount) || run.mismatchCount < 0
      || run.mismatchCount > Number(MAX_INT32)
      || !Number.isSafeInteger(run.blockingIssueCount) || run.blockingIssueCount < 0
      || run.blockingIssueCount > Number(MAX_INT32)
      || !run.totals || int64Value(run.totals.differenceCents) === null
      || int64Value(run.totals.reportedEarningsLessRetentionsCents) === null
      || int64Value(run.totals.reportedBankNetCents) === null
      || !exactContractObject(run.totals, new Set([
        'reportedEarningsLessRetentionsCents', 'reportedBankNetCents',
        'differenceCents',
      ]))
      || typeof run.closeApproved !== 'boolean'
      || run.closeApproved !== (run.status === 'approved')
      || !REASON_CODES.has(run.reasonCode)
      || !(run.reasonReference === null || REFERENCE.test(run.reasonReference))
      || !Array.isArray(run.sources) || !Array.isArray(run.blockingIssues)
      || !Array.isArray(run.timeline)
      || typeof run.createdAt !== 'string' || typeof run.updatedAt !== 'string'
      || !(run.submittedAt === null || typeof run.submittedAt === 'string')
      || !(run.decidedAt === null || typeof run.decidedAt === 'string')) contractDrift();
  if (includeSources) {
    if (run.sources.length !== PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT
        || !isRecord(run.reconciliation)) contractDrift();
    const definitions = run.sources.map((source) => source?.definitionKey);
    run.sources.forEach(assertSource);
    if (new Set(definitions).size !== PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT
        || Object.keys(SOURCE_PAIRS).some((key) => !definitions.includes(key))) contractDrift();
    assertReconciliation(run.reconciliation, run.sources);
    const expectedBlockingIssues = [
      ...run.sources.flatMap((source) => source.aggregates.readiness.blockingIssues
        .map((issue) => ({ definitionKey: source.definitionKey, ...issue }))),
      ...run.reconciliation.blockingIssues.map((issue) => ({
        definitionKey: Object.hasOwn(issue, 'comparisonKey')
          ? 'monthly-close-government-reconciliation.v1'
          : 'monthly-close-net-reconciliation.v1',
        ...issue,
      })),
    ];
    if (!exactJson(run.blockingIssues, expectedBlockingIssues)
        || run.blockingIssueCount !== expectedBlockingIssues.length
        || run.mismatchCount !== run.reconciliation.blockingIssues.length
        || !exactJson(run.totals, run.reconciliation.totals)) contractDrift();
    assertTimeline(run.timeline, {
      required: false, runStatus: run.status, runVersion: run.version,
    });
  } else if (run.sources.length !== 0 || run.reconciliation !== null
      || run.blockingIssues.length !== 0 || run.timeline.length !== 0) {
    contractDrift();
  }
  if (includeAllowedCommands) {
    if (!Array.isArray(run.allowedCommands)
        || new Set(run.allowedCommands).size !== run.allowedCommands.length
        || run.allowedCommands.some((command) => !COMMANDS.has(command))) contractDrift();
  }
  assertNoSensitiveOutput(run);
  return run;
}

function assertRecentEvents(events) {
  if (!Array.isArray(events)) contractDrift();
  const keys = new Set(['id', 'runId', 'command', 'toStatus', 'eventSha256', 'occurredAt']);
  for (const event of events) {
    if (!exactContractObject(event, keys)
        || !Number.isSafeInteger(event.id) || event.id < 1
        || !UUID.test(String(event.runId || ''))
        || !['prepare', ...COMMANDS].includes(event.command)
        || !STATUSES.has(event.toStatus)
        || !SHA256.test(String(event.eventSha256 || ''))
        || typeof event.occurredAt !== 'string') contractDrift();
  }
}

function assertBootstrap(envelope) {
  if (!exactContractObject(envelope,
    new Set(['principal', 'limits', 'runs', 'recentEvents', 'flags']))) contractDrift();
  const principalKeys = new Set([
    'tenantId', 'membershipId', 'certifiedBindingId', 'roleKey',
    'employmentLinked', 'capabilities',
  ]);
  if (!exactContractObject(envelope.principal, principalKeys)
      || !UUID.test(String(envelope.principal.tenantId || ''))
      || !UUID.test(String(envelope.principal.membershipId || ''))
      || !UUID.test(String(envelope.principal.certifiedBindingId || ''))
      || typeof envelope.principal.roleKey !== 'string'
      || typeof envelope.principal.employmentLinked !== 'boolean'
      || !Array.isArray(envelope.principal.capabilities)
      || !envelope.principal.capabilities.includes('payroll.monthly_close.read')
      || new Set(envelope.principal.capabilities).size
        !== envelope.principal.capabilities.length
      || envelope.principal.capabilities.some((capability) => !CAPABILITIES.has(capability))) {
    contractDrift();
  }
  const limitsKeys = new Set([
    'contractVersion', 'sourceContracts', 'maxSourceBytes', 'sourceCount',
    'jurisdictions', 'toleranceCents',
  ]);
  if (!exactContractObject(envelope.limits, limitsKeys)
      || envelope.limits.contractVersion !== PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION
      || envelope.limits.maxSourceBytes !== PAYROLL_MONTHLY_CLOSE_MAX_SOURCE_BYTES
      || envelope.limits.sourceCount !== PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT
      || JSON.stringify(envelope.limits.jurisdictions)
        !== JSON.stringify(PAYROLL_MONTHLY_CLOSE_JURISDICTIONS)
      || envelope.limits.toleranceCents !== '0'
      || !Array.isArray(envelope.limits.sourceContracts)
      || envelope.limits.sourceContracts.length !== PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT) {
    contractDrift();
  }
  const contractKeys = new Set(['definitionKey', 'sourceKind']);
  const definitions = envelope.limits.sourceContracts.map((contract) => {
    if (!exactContractObject(contract, contractKeys)
        || SOURCE_PAIRS[contract.definitionKey] !== contract.sourceKind) contractDrift();
    return contract.definitionKey;
  });
  if (new Set(definitions).size !== PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT) contractDrift();
  if (!Array.isArray(envelope.runs)) contractDrift();
  envelope.runs.forEach((run) => assertRun(run, {
    includeSources: false, includeAllowedCommands: false,
  }));
  assertRecentEvents(envelope.recentEvents);
}

function assertSafeEnvelope(envelope, kind, expectedCommand = null) {
  assertFlags(envelope.flags);
  if (kind === 'bootstrap') assertBootstrap(envelope);
  else if (kind === 'list') {
    if (!exactContractObject(envelope,
      new Set(['runs', 'total', 'page', 'limit', 'flags']))
        || !Array.isArray(envelope.runs)
        || !Number.isSafeInteger(envelope.total) || envelope.total < 0
        || !Number.isSafeInteger(envelope.page) || envelope.page < 1
        || !Number.isSafeInteger(envelope.limit) || envelope.limit < 1
        || envelope.limit > 50) contractDrift();
    envelope.runs.forEach((run) => assertRun(run, {
      includeSources: false, includeAllowedCommands: false,
    }));
  } else if (kind === 'detail') {
    if (!exactContractObject(envelope, new Set(['run', 'flags']))) contractDrift();
    assertRun(envelope.run, { includeSources: true, includeAllowedCommands: true });
  } else if (kind === 'mutation' || kind === 'attempt') {
    if (!exactContractObject(envelope,
      new Set(['replayed', 'eventId', 'eventSha256', 'run', 'flags']))
        || typeof envelope.replayed !== 'boolean'
        || (kind === 'attempt' && envelope.replayed !== true)
        || !Number.isSafeInteger(envelope.eventId) || envelope.eventId < 1
        || !SHA256.test(String(envelope.eventSha256 || ''))) contractDrift();
    assertRun(envelope.run, { includeSources: true, includeAllowedCommands: false });
    assertTimeline(envelope.run.timeline, {
      required: true, runStatus: envelope.run.status, runVersion: envelope.run.version,
    });
    const receiptEvents = envelope.run.timeline.filter((event) => (
      event.id === envelope.eventId && event.eventSha256 === envelope.eventSha256
    ));
    if (receiptEvents.length !== 1 || receiptEvents[0].command !== expectedCommand) {
      contractDrift();
    }
  } else contractDrift();
  if (Object.hasOwn(envelope, 'run')
      && envelope.flags.closeApproved !== envelope.run.closeApproved) contractDrift();
  assertNoSensitiveOutput(envelope);
  return envelope;
}

export async function getPayrollMonthlyCloseBootstrap(sql, principal, session) {
  const context = identityContext(principal, session);
  return facade(sql, 'payroll_monthly_close_bootstrap_v1',
    [JSON.stringify(context)], ['jsonb'], 'bootstrap');
}

export async function listPayrollMonthlyCloseRuns(sql, principal, session, options = {}) {
  const context = identityContext(principal, session);
  const status = String(options.status || 'all').trim().toLowerCase();
  const page = Number(options.page || 1);
  const limit = Number(options.limit || 20);
  if (!['all', ...STATUSES].includes(status)
      || !Number.isSafeInteger(page) || page < 1 || page > 10000
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    fail('PAYROLL_MONTHLY_CLOSE_LIST_INVALID', 422, 'Filtros de cierres inválidos');
  }
  return facade(
    sql,
    'payroll_monthly_close_list_v1',
    [JSON.stringify(context), status, page, limit],
    ['jsonb', '', 'integer', 'integer'],
    'list',
  );
}

export async function readPayrollMonthlyCloseRun(sql, principal, session, runId) {
  const context = identityContext(principal, session);
  const id = canonicalUuid(
    runId,
    'PAYROLL_MONTHLY_CLOSE_RUN_ID_INVALID',
    'La corrida de cierre no es válida',
  );
  return facade(
    sql,
    'payroll_monthly_close_detail_v1',
    [JSON.stringify(context), id],
    ['jsonb', 'uuid'],
    'detail',
  );
}

export async function readPayrollMonthlyCloseAttempt(
  sql, principal, session, idempotencyKey, command,
) {
  const context = identityContext(principal, session);
  const key = normalizePayrollMonthlyCloseIdempotencyKey(idempotencyKey);
  const normalizedCommand = String(command || '').trim().toLowerCase();
  if (!['prepare', ...COMMANDS].includes(normalizedCommand)) {
    fail(
      'PAYROLL_MONTHLY_CLOSE_ATTEMPT_COMMAND_INVALID',
      422,
      'El comando del intento no es válido',
    );
  }
  return facade(
    sql,
    'payroll_monthly_close_attempt_v1',
    [JSON.stringify(context), key, normalizedCommand],
    ['jsonb', 'uuid', ''],
    'attempt',
    normalizedCommand,
  );
}

export async function persistPayrollMonthlyCloseRun(
  sql, principal, session, prepared, idempotencyKey, certifiedBindingId,
) {
  const context = identityContext(principal, session);
  const bindingId = canonicalUuid(
    certifiedBindingId,
    'PAYROLL_MONTHLY_CLOSE_BINDING_REQUIRED',
    'El binding GRH certificado no está disponible',
  );
  const key = normalizePayrollMonthlyCloseIdempotencyKey(idempotencyKey);
  if (!prepared || prepared.contractVersion !== PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION
      || prepared.sourceCount !== PAYROLL_MONTHLY_CLOSE_SOURCE_COUNT
      || !SHA256.test(String(prepared.sourceSetSha256 || ''))
      || !Array.isArray(prepared.sources) || prepared.sources.length !== 3) {
    fail(
      'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID',
      422,
      'Las fuentes no cumplen el contrato de cierre',
    );
  }
  assertPreparedRun(prepared);
  const payload = Object.freeze({
    periodMonth: prepared.periodMonth,
    jurisdiction: prepared.jurisdiction,
    sourceSetSha256: prepared.sourceSetSha256,
    sources: prepared.sources,
    reconciliation: prepared.reconciliation,
    blockingIssues: prepared.blockingIssues,
  });
  return facade(sql, 'payroll_monthly_close_prepare_v1', [
    JSON.stringify(context), bindingId, payload.periodMonth,
    payload.jurisdiction, payload.sourceSetSha256,
    JSON.stringify(payload.sources), JSON.stringify(payload.reconciliation),
    JSON.stringify(payload.blockingIssues), key,
    commandHash(context, 'prepare', payload, bindingId),
  ], ['jsonb', 'uuid', 'date', '', '', 'jsonb', 'jsonb', 'jsonb', 'uuid', ''],
  'mutation', 'prepare');
}

export async function transitionPayrollMonthlyCloseRun(
  sql, principal, session, command, rawTransition, idempotencyKey,
  certifiedBindingId,
) {
  const context = identityContext(principal, session);
  const transition = normalizePayrollMonthlyCloseTransition(command, rawTransition);
  const key = normalizePayrollMonthlyCloseIdempotencyKey(idempotencyKey);
  const bindingId = canonicalUuid(
    certifiedBindingId,
    'PAYROLL_MONTHLY_CLOSE_BINDING_REQUIRED',
    'El binding GRH certificado no está disponible',
  );
  return facade(sql, 'payroll_monthly_close_transition_v1', [
    JSON.stringify(context), transition.runId, command,
    transition.expectedVersion, transition.reasonCode,
    transition.reasonReference, key,
    commandHash(context, command, transition, bindingId),
  ], ['jsonb', 'uuid', '', 'integer', '', '', 'uuid', ''], 'mutation', command);
}

export { MONTHLY_CLOSE_SOURCE_CONTRACTS };
