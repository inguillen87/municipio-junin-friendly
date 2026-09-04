import { createHash, createHmac } from 'node:crypto';

export const MONTHLY_CLOSE_CONTRACT_VERSION = 'monthly-close-inputs.v1';
export const MONTHLY_CLOSE_HMAC_KEY_VERSION = 'hmac-v1';
export const MONTHLY_CLOSE_MAX_BYTES = 256 * 1024;

const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40 = /^[a-f0-9]{40}$/;
const CODE = /^[0-9]{1,8}$/;
const INT64 = /^(?:0|-?[1-9][0-9]{0,18})$/;
const NON_NEGATIVE_INT64 = /^(?:0|[1-9][0-9]{0,18})$/;
const POSITIVE_INT32 = /^[1-9][0-9]{0,9}$/;
const MIN_INT64 = -9223372036854775808n;
const MAX_INT64 = 9223372036854775807n;
const MAX_INT32 = 2147483647n;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const JURISDICTIONS = Object.freeze(['42', '55']);
const PREPARED_SOURCE_CONTEXTS = new WeakMap();
const PREPARED_SOURCE_KEYS = new Set([
  'contractVersion', 'hmacKeyVersion', 'definitionKey', 'sourceKind',
  'provenanceState', 'periodMonth', 'jurisdiction', 'certifiedReleaseSha',
  'contentHmacSha256', 'byteLength', 'recordCount', 'rows', 'totals',
  'readiness', 'manifestSha256', 'includesPersonalRecords', 'rawContentStored',
  'provenanceVerified', 'persistencePerformed', 'payrollCalculated',
  'payrollPosted', 'closeApproved', 'fiscalArtifactGenerated',
]);
const INPUT_KEYS = new Set([
  'definitionKey', 'sourceKind', 'period', 'jurisdiction', 'bytes', 'context',
]);
const CONTEXT_KEYS = new Set([
  'tenantId', 'sourceBindingId', 'releaseSha', 'fingerprintKey',
]);

const CONCEPT_MONEY_FIELDS = Object.freeze([
  'haberesRemunerativosCents',
  'haberesNoRemunerativosCents',
  'asignacionesFamiliaresCents',
  'retencionesCents',
  'contribucionesCents',
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

function freezeDefinition(definition) {
  return Object.freeze({
    ...definition,
    fields: Object.freeze(definition.fields.map((field) => Object.freeze({ ...field }))),
    controls: Object.freeze([...definition.controls]),
  });
}

export const MONTHLY_CLOSE_SOURCE_CONTRACTS = Object.freeze({
  'grh-concept-statistics.v1': freezeDefinition({
    sourceKind: 'grh_observed',
    label: 'Estadística agregada de conceptos GRH',
    header: 'periodo;jurisdiccion;reparticion_codigo;concepto_codigo;ocurrencias;cantidad_centesimas;haberes_rem_centavos;haberes_no_rem_centavos;asignaciones_familiares_centavos;retenciones_centavos;contribuciones_centavos',
    maxRows: 5000,
    fields: [
      { name: 'periodo', type: 'year-month' },
      { name: 'jurisdiccion', type: 'enum:42|55' },
      { name: 'reparticion_codigo', type: 'numeric-code' },
      { name: 'concepto_codigo', type: 'numeric-code' },
      { name: 'ocurrencias', type: 'positive-int32' },
      { name: 'cantidad_centesimas', type: 'int64-string' },
      { name: 'haberes_rem_centavos', type: 'int64-string' },
      { name: 'haberes_no_rem_centavos', type: 'int64-string' },
      { name: 'asignaciones_familiares_centavos', type: 'int64-string' },
      { name: 'retenciones_centavos', type: 'int64-string' },
      { name: 'contribuciones_centavos', type: 'int64-string' },
    ],
    controls: [
      'period-and-jurisdiction-match',
      'unique-reparticion-and-concept',
      'exact-int64-cents-without-rounding',
      'aggregate-only-no-personal-columns',
    ],
  }),
  'bank-accreditation-summary.v1': freezeDefinition({
    sourceKind: 'bank_control',
    label: 'Resumen agregado de acreditación bancaria',
    header: 'periodo;jurisdiccion;reparticion_codigo;banco_codigo;tipo_cuenta;operaciones;importe_neto_centavos',
    maxRows: 1000,
    fields: [
      { name: 'periodo', type: 'year-month' },
      { name: 'jurisdiccion', type: 'enum:42|55' },
      { name: 'reparticion_codigo', type: 'numeric-code' },
      { name: 'banco_codigo', type: 'numeric-code' },
      { name: 'tipo_cuenta', type: 'enum:cuenta_corriente|caja_ahorro|transferencia_especial' },
      { name: 'operaciones', type: 'positive-int32' },
      { name: 'importe_neto_centavos', type: 'positive-int64-string' },
    ],
    controls: [
      'period-and-jurisdiction-match',
      'unique-reparticion-bank-and-account-type',
      'positive-operation-count-and-net-amount',
      'aggregate-only-no-account-or-personal-columns',
    ],
  }),
  'government-payroll-summary.v1': freezeDefinition({
    sourceKind: 'government_control',
    label: 'Planilla informativa agregada para Casa de Gobierno',
    header: 'periodo;jurisdiccion;metrica;unidad;estado;valor_entero',
    maxRows: Object.keys(GOVERNMENT_METRIC_UNITS).length,
    fields: [
      { name: 'periodo', type: 'year-month' },
      { name: 'jurisdiccion', type: 'enum:42|55' },
      { name: 'metrica', type: 'controlled-metric' },
      { name: 'unidad', type: 'controlled-unit' },
      { name: 'estado', type: 'enum:informado|no_informado' },
      { name: 'valor_entero', type: 'nullable-non-negative-int64-string' },
    ],
    controls: [
      'every-required-metric-present-once',
      'metric-unit-match',
      'missing-values-explicit-and-blocking',
      'aggregate-only-no-personal-columns',
    ],
  }),
});

export class MonthlyCloseContractError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'MonthlyCloseContractError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new MonthlyCloseContractError(code, status, message);
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
    'MONTHLY_CLOSE_CONTEXT_INVALID',
    'El contexto certificado del cierre no es válido',
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
      'MONTHLY_CLOSE_CONTEXT_INVALID',
      503,
      'El contexto certificado del cierre no está disponible',
    );
  }
  return { tenantId, sourceBindingId, releaseSha, fingerprintKey };
}

function canonicalInput(input) {
  exactObject(
    input,
    INPUT_KEYS,
    'MONTHLY_CLOSE_INPUT_INVALID',
    'La preparación exige un contrato, una fuente y un contexto exactos',
  );
  const definition = typeof input.definitionKey === 'string'
    ? MONTHLY_CLOSE_SOURCE_CONTRACTS[input.definitionKey] : null;
  if (!definition) {
    fail(
      'MONTHLY_CLOSE_DEFINITION_INVALID',
      400,
      'La definición de cierre no pertenece al catálogo vigente',
    );
  }
  if (input.sourceKind !== definition.sourceKind) {
    fail(
      'MONTHLY_CLOSE_SOURCE_KIND_INVALID',
      400,
      'El tipo de fuente no coincide con la definición seleccionada',
    );
  }
  if (typeof input.period !== 'string' || !PERIOD.test(input.period)) {
    fail('MONTHLY_CLOSE_PERIOD_INVALID', 400, 'El período debe usar YYYY-MM');
  }
  if (typeof input.jurisdiction !== 'string'
      || !JURISDICTIONS.includes(input.jurisdiction)) {
    fail(
      'MONTHLY_CLOSE_JURISDICTION_INVALID',
      400,
      'La jurisdicción debe ser 42 o 55',
    );
  }
  let bytes;
  if (Buffer.isBuffer(input.bytes)) bytes = input.bytes;
  else if (input.bytes instanceof Uint8Array) {
    bytes = Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
  } else {
    fail('MONTHLY_CLOSE_SOURCE_INVALID', 400, 'La fuente debe aportar bytes');
  }
  if (bytes.byteLength === 0) {
    fail('MONTHLY_CLOSE_SOURCE_EMPTY', 422, 'La fuente está vacía');
  }
  if (bytes.byteLength > MONTHLY_CLOSE_MAX_BYTES) {
    fail(
      'MONTHLY_CLOSE_SOURCE_TOO_LARGE',
      413,
      'La fuente supera el límite privado de 256 KiB',
    );
  }
  return {
    definitionKey: input.definitionKey,
    sourceKind: input.sourceKind,
    period: input.period,
    jurisdiction: input.jurisdiction,
    bytes,
    definition,
    context: canonicalContext(input.context),
  };
}

function sourceLines(bytes, definition) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('MONTHLY_CLOSE_ENCODING_INVALID', 422, 'La fuente debe usar UTF-8 válido');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\u0000') || /\r(?!\n)/.test(text)
      || /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    fail(
      'MONTHLY_CLOSE_SOURCE_INVALID',
      422,
      'La fuente contiene caracteres no permitidos',
    );
  }
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length < 2 || lines.length > definition.maxRows + 1
      || lines.some((line) => line.length === 0 || line.length > 4096)) {
    fail(
      'MONTHLY_CLOSE_ROW_COUNT_INVALID',
      422,
      'La cantidad o longitud de filas no coincide con el contrato',
    );
  }
  if (lines[0] !== definition.header) {
    fail(
      'MONTHLY_CLOSE_HEADER_INVALID',
      422,
      'El encabezado no coincide con la definición seleccionada',
    );
  }
  return lines.slice(1);
}

function exactCells(line, expected) {
  const cells = line.split(';');
  if (cells.length !== expected || cells.some((cell) => cell.trim() !== cell)) {
    fail('MONTHLY_CLOSE_ROW_INVALID', 422, 'Una fila no coincide con el contrato canónico');
  }
  return cells;
}

function assertRowContext(period, jurisdiction, context) {
  if (period !== context.period) {
    fail(
      'MONTHLY_CLOSE_PERIOD_MISMATCH',
      422,
      'La fuente no pertenece al período seleccionado',
    );
  }
  if (jurisdiction !== context.jurisdiction) {
    fail(
      'MONTHLY_CLOSE_JURISDICTION_MISMATCH',
      422,
      'La fuente no pertenece a la jurisdicción seleccionada',
    );
  }
}

function canonicalCode(value, label) {
  if (!CODE.test(value)) {
    fail('MONTHLY_CLOSE_CODE_INVALID', 422, `${label} debe ser un código numérico`);
  }
  return value;
}

function canonicalInt64(value, { nonNegative = false, positive = false } = {}) {
  const pattern = nonNegative || positive ? NON_NEGATIVE_INT64 : INT64;
  if (!pattern.test(value)) {
    fail('MONTHLY_CLOSE_INTEGER_INVALID', 422, 'Un entero no usa el formato canónico');
  }
  const parsed = BigInt(value);
  if (parsed < MIN_INT64 || parsed > MAX_INT64 || (positive && parsed === 0n)) {
    fail('MONTHLY_CLOSE_INTEGER_OUT_OF_RANGE', 422, 'Un entero excede el rango admitido');
  }
  return parsed;
}

function checkedInt64(value) {
  if (value < MIN_INT64 || value > MAX_INT64) {
    fail(
      'MONTHLY_CLOSE_INTEGER_OVERFLOW',
      422,
      'Una suma o diferencia excede el rango entero admitido',
    );
  }
  return value;
}

function checkedAddInt64(left, right) {
  return checkedInt64(left + right);
}

function canonicalPositiveInt32(value) {
  if (!POSITIVE_INT32.test(value)) {
    fail('MONTHLY_CLOSE_COUNT_INVALID', 422, 'Una cantidad debe ser un entero positivo');
  }
  const parsed = BigInt(value);
  if (parsed > MAX_INT32) {
    fail('MONTHLY_CLOSE_COUNT_INVALID', 422, 'Una cantidad excede el rango admitido');
  }
  return parsed;
}

function parseConceptStatistics(lines, context) {
  const seen = new Set();
  const rows = [];
  for (const line of lines) {
    const cells = exactCells(line, 11);
    assertRowContext(cells[0], cells[1], context);
    const repartitionCode = canonicalCode(cells[2], 'La repartición');
    const conceptCode = canonicalCode(cells[3], 'El concepto');
    const key = `${repartitionCode}:${conceptCode}`;
    if (seen.has(key)) {
      fail(
        'MONTHLY_CLOSE_ROW_DUPLICATED',
        422,
        'La fuente repite una repartición y concepto',
      );
    }
    seen.add(key);
    const occurrences = canonicalPositiveInt32(cells[4]);
    const quantityHundredths = canonicalInt64(cells[5]);
    const money = cells.slice(6).map((value) => canonicalInt64(value));
    if (quantityHundredths === 0n && money.every((value) => value === 0n)) {
      fail('MONTHLY_CLOSE_EMPTY_AGGREGATE', 422, 'Una fila agregada no informa cantidades');
    }
    rows.push(Object.freeze({
      repartitionCode,
      conceptCode,
      occurrences: occurrences.toString(),
      quantityHundredths: quantityHundredths.toString(),
      haberesRemunerativosCents: money[0].toString(),
      haberesNoRemunerativosCents: money[1].toString(),
      asignacionesFamiliaresCents: money[2].toString(),
      retencionesCents: money[3].toString(),
      contribucionesCents: money[4].toString(),
    }));
  }
  const totals = Object.fromEntries(CONCEPT_MONEY_FIELDS.map((field) => [
    field,
    rows.reduce(
      (total, row) => checkedAddInt64(total, BigInt(row[field])),
      0n,
    ).toString(),
  ]));
  return { rows: Object.freeze(rows), totals: Object.freeze(totals), blockingIssues: [] };
}

function parseBankSummary(lines, context) {
  const accountTypes = new Set(['cuenta_corriente', 'caja_ahorro', 'transferencia_especial']);
  const seen = new Set();
  const rows = [];
  for (const line of lines) {
    const cells = exactCells(line, 7);
    assertRowContext(cells[0], cells[1], context);
    const repartitionCode = canonicalCode(cells[2], 'La repartición');
    const bankCode = canonicalCode(cells[3], 'El banco');
    const accountType = cells[4];
    if (!accountTypes.has(accountType)) {
      fail('MONTHLY_CLOSE_ACCOUNT_TYPE_INVALID', 422, 'El tipo de cuenta no está permitido');
    }
    const key = `${repartitionCode}:${bankCode}:${accountType}`;
    if (seen.has(key)) {
      fail('MONTHLY_CLOSE_ROW_DUPLICATED', 422, 'La fuente repite un grupo de acreditación');
    }
    seen.add(key);
    const operations = canonicalPositiveInt32(cells[5]);
    const netAmountCents = canonicalInt64(cells[6], { positive: true });
    rows.push(Object.freeze({
      repartitionCode,
      bankCode,
      accountType,
      operations: operations.toString(),
      netAmountCents: netAmountCents.toString(),
    }));
  }
  const totals = Object.freeze({
    operations: rows.reduce(
      (total, row) => checkedAddInt64(total, BigInt(row.operations)),
      0n,
    ).toString(),
    netAmountCents: rows.reduce(
      (total, row) => checkedAddInt64(total, BigInt(row.netAmountCents)), 0n,
    ).toString(),
  });
  return { rows: Object.freeze(rows), totals, blockingIssues: [] };
}

function parseGovernmentSummary(lines, context) {
  const seen = new Set();
  const rows = [];
  const blockingIssues = [];
  for (const line of lines) {
    const cells = exactCells(line, 6);
    assertRowContext(cells[0], cells[1], context);
    const metric = cells[2];
    const expectedUnit = GOVERNMENT_METRIC_UNITS[metric];
    if (!expectedUnit) {
      fail('MONTHLY_CLOSE_METRIC_INVALID', 422, 'La métrica no pertenece al contrato');
    }
    if (seen.has(metric)) {
      fail('MONTHLY_CLOSE_ROW_DUPLICATED', 422, 'La fuente repite una métrica');
    }
    seen.add(metric);
    if (cells[3] !== expectedUnit) {
      fail('MONTHLY_CLOSE_UNIT_INVALID', 422, 'La unidad no coincide con la métrica');
    }
    const state = cells[4];
    if (!['informado', 'no_informado'].includes(state)) {
      fail('MONTHLY_CLOSE_METRIC_STATE_INVALID', 422, 'El estado de la métrica no es válido');
    }
    let valueInteger = null;
    if (state === 'informado') {
      if (cells[5] === '') {
        fail('MONTHLY_CLOSE_VALUE_MISSING', 422, 'Una métrica informada exige un valor');
      }
      valueInteger = canonicalInt64(cells[5], { nonNegative: true }).toString();
    } else {
      if (cells[5] !== '') {
        fail(
          'MONTHLY_CLOSE_UNINFORMED_VALUE_PRESENT',
          422,
          'Una métrica no informada no puede declarar un valor',
        );
      }
      blockingIssues.push(Object.freeze({
        code: 'MONTHLY_CLOSE_METRIC_NOT_INFORMED',
        metric,
      }));
    }
    rows.push(Object.freeze({ metric, unit: expectedUnit, state, valueInteger }));
  }
  const missing = Object.keys(GOVERNMENT_METRIC_UNITS).filter((metric) => !seen.has(metric));
  if (missing.length > 0) {
    fail(
      'MONTHLY_CLOSE_METRIC_MISSING',
      422,
      'La planilla no contiene todas las métricas obligatorias',
    );
  }
  return {
    rows: Object.freeze(rows),
    totals: null,
    blockingIssues: Object.freeze(blockingIssues),
  };
}

function contentFingerprint(bytes, input) {
  return createHmac('sha256', input.context.fingerprintKey)
    .update(MONTHLY_CLOSE_CONTRACT_VERSION, 'utf8')
    .update('\0', 'utf8')
    .update(MONTHLY_CLOSE_HMAC_KEY_VERSION, 'utf8')
    .update('\0', 'utf8')
    .update(input.context.tenantId, 'utf8')
    .update('\0', 'utf8')
    .update(input.context.sourceBindingId, 'utf8')
    .update('\0', 'utf8')
    .update(input.definitionKey, 'utf8')
    .update('\0', 'utf8')
    .update(bytes)
    .digest('hex');
}

function addCents(target, key, cents) {
  target.set(key, checkedAddInt64(target.get(key) || 0n, BigInt(cents)));
}

function conceptTechnicalNetByRepartition(source) {
  const totals = new Map();
  for (const row of source.rows) {
    const technicalNet = checkedInt64(BigInt(row.haberesRemunerativosCents)
      + BigInt(row.haberesNoRemunerativosCents)
      + BigInt(row.asignacionesFamiliaresCents)
      - BigInt(row.retencionesCents));
    addCents(totals, row.repartitionCode, technicalNet);
  }
  return totals;
}

function bankNetByRepartition(source) {
  const totals = new Map();
  for (const row of source.rows) {
    addCents(totals, row.repartitionCode, row.netAmountCents);
  }
  return totals;
}

function governmentValueByMetric(governmentSource) {
  return new Map(governmentSource.rows.map((row) => [
    row.metric,
    row.state === 'informado' ? BigInt(row.valueInteger) : null,
  ]));
}

function sumComparableGovernmentValues(values, metrics) {
  const selected = metrics.map((metric) => values.get(metric));
  if (selected.some((value) => value === null || value === undefined)) return null;
  return selected.reduce((total, value) => checkedAddInt64(total, value), 0n);
}

function reconcileReportedSources(conceptSource, bankSource, governmentSource) {
  const conceptTotals = conceptTechnicalNetByRepartition(conceptSource);
  const bankTotals = bankNetByRepartition(bankSource);
  const repartitions = [...new Set([...conceptTotals.keys(), ...bankTotals.keys()])]
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
  const bankBlockingIssues = [];
  const comparisons = repartitions.map((repartitionCode) => {
    const conceptValue = conceptTotals.get(repartitionCode);
    const bankValue = bankTotals.get(repartitionCode);
    const issueCodes = [];
    if (conceptValue === undefined) {
      issueCodes.push('MONTHLY_CLOSE_REPARTITION_MISSING_IN_CONCEPT_STATISTICS');
    }
    if (bankValue === undefined) {
      issueCodes.push('MONTHLY_CLOSE_REPARTITION_MISSING_IN_BANK_SUMMARY');
    }
    const difference = conceptValue === undefined || bankValue === undefined
      ? null : checkedInt64(conceptValue - bankValue);
    if (difference !== null && difference !== 0n) {
      issueCodes.push('MONTHLY_CLOSE_REPARTITION_NET_MISMATCH');
    }
    for (const code of issueCodes) {
      bankBlockingIssues.push(Object.freeze({ code, repartitionCode }));
    }
    return Object.freeze({
      repartitionCode,
      reportedEarningsLessRetentionsCents: conceptValue?.toString() ?? null,
      reportedBankNetCents: bankValue?.toString() ?? null,
      differenceCents: difference?.toString() ?? null,
      matches: difference === 0n,
      issueCodes: Object.freeze(issueCodes),
    });
  });
  const reportedNetCents = [...conceptTotals.values()]
    .reduce((total, value) => checkedAddInt64(total, value), 0n);
  const bankNetCents = [...bankTotals.values()]
    .reduce((total, value) => checkedAddInt64(total, value), 0n);
  const totalDifference = checkedInt64(reportedNetCents - bankNetCents);
  const governmentValues = governmentValueByMetric(governmentSource);
  const governmentComparisons = [
    {
      comparisonKey: 'earnings',
      grhCents: checkedInt64(
        BigInt(conceptSource.totals.haberesRemunerativosCents)
          + BigInt(conceptSource.totals.haberesNoRemunerativosCents),
      ),
      governmentCents: sumComparableGovernmentValues(governmentValues, [
        'haberes_rem_no_docentes', 'haberes_rem_docentes', 'haberes_no_rem',
      ]),
      mismatchCode: 'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_MISMATCH',
      unavailableCode: 'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_NOT_COMPARABLE',
    },
    {
      comparisonKey: 'employer_contributions',
      grhCents: BigInt(conceptSource.totals.contribucionesCents),
      governmentCents: sumComparableGovernmentValues(governmentValues, [
        'contribuciones_jubilatorias', 'contribuciones_osep',
        'contribuciones_osep_no_rem', 'art',
      ]),
      mismatchCode: 'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_MISMATCH',
      unavailableCode: 'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_NOT_COMPARABLE',
    },
  ].map((comparison) => {
    const difference = comparison.governmentCents === null
      ? null : checkedInt64(comparison.grhCents - comparison.governmentCents);
    return Object.freeze({
      comparisonKey: comparison.comparisonKey,
      reportedGrhCents: comparison.grhCents.toString(),
      reportedGovernmentCents: comparison.governmentCents?.toString() ?? null,
      differenceCents: difference?.toString() ?? null,
      matches: difference === 0n,
      issueCode: difference === 0n ? null
        : difference === null ? comparison.unavailableCode : comparison.mismatchCode,
    });
  });
  const governmentBlockingIssues = governmentComparisons
    .filter((comparison) => !comparison.matches)
    .map((comparison) => Object.freeze({
      code: comparison.issueCode,
      comparisonKey: comparison.comparisonKey,
    }));
  const blockingIssues = Object.freeze([
    ...bankBlockingIssues,
    ...governmentBlockingIssues,
  ]);
  return Object.freeze({
    basis: 'three_source_exact_aggregate_reconciliation',
    formula: 'haberes_rem + haberes_no_rem + asignaciones_familiares - retenciones',
    toleranceCents: '0',
    status: blockingIssues.length === 0 ? 'matched' : 'blocked',
    matched: blockingIssues.length === 0,
    comparisons: Object.freeze(comparisons),
    governmentComparisons: Object.freeze(governmentComparisons),
    totals: Object.freeze({
      reportedEarningsLessRetentionsCents: reportedNetCents.toString(),
      reportedBankNetCents: bankNetCents.toString(),
      differenceCents: totalDifference.toString(),
    }),
    blockingIssues,
    rulesInferred: false,
    governmentSummaryCompared: true,
    payrollNetCertified: false,
  });
}

/**
 * Prepares one aggregate-only monthly close source. This parser does not store
 * raw bytes, calculate salaries, approve a close, generate a fiscal filing or
 * mutate GRH. Provenance remains operator-declared until the governed server
 * persists and verifies the resulting manifest.
 */
export function prepareMonthlyCloseSource(input) {
  const normalized = canonicalInput(input);
  const lines = sourceLines(normalized.bytes, normalized.definition);
  let parsed;
  if (normalized.definitionKey === 'grh-concept-statistics.v1') {
    parsed = parseConceptStatistics(lines, normalized);
  } else if (normalized.definitionKey === 'bank-accreditation-summary.v1') {
    parsed = parseBankSummary(lines, normalized);
  } else {
    parsed = parseGovernmentSummary(lines, normalized);
  }
  const contentHmacSha256 = contentFingerprint(normalized.bytes, normalized);
  const readiness = Object.freeze({
    structurallyValid: true,
    readyForReview: parsed.blockingIssues.length === 0,
    blockingIssues: Object.freeze([...parsed.blockingIssues]),
  });
  const manifest = {
    contractVersion: MONTHLY_CLOSE_CONTRACT_VERSION,
    hmacKeyVersion: MONTHLY_CLOSE_HMAC_KEY_VERSION,
    definitionKey: normalized.definitionKey,
    sourceKind: normalized.sourceKind,
    provenanceState: 'operator_declared',
    periodMonth: `${normalized.period}-01`,
    jurisdiction: normalized.jurisdiction,
    certifiedReleaseSha: normalized.context.releaseSha,
    contentHmacSha256,
    byteLength: normalized.bytes.byteLength,
    recordCount: parsed.rows.length,
    rows: parsed.rows,
    totals: parsed.totals,
    readiness,
  };
  const manifestSha256 = createHash('sha256').update(stableJson(manifest)).digest('hex');
  const prepared = Object.freeze({
    ...manifest,
    manifestSha256,
    includesPersonalRecords: false,
    rawContentStored: false,
    provenanceVerified: false,
    persistencePerformed: false,
    payrollCalculated: false,
    payrollPosted: false,
    closeApproved: false,
    fiscalArtifactGenerated: false,
  });
  PREPARED_SOURCE_CONTEXTS.set(prepared, Object.freeze({
    tenantId: normalized.context.tenantId,
    sourceBindingId: normalized.context.sourceBindingId,
    definitionKey: normalized.definitionKey,
    contentHmacSha256,
    manifestSha256,
  }));
  return prepared;
}

function manifestShape(source) {
  return {
    contractVersion: source.contractVersion,
    hmacKeyVersion: source.hmacKeyVersion,
    definitionKey: source.definitionKey,
    sourceKind: source.sourceKind,
    provenanceState: source.provenanceState,
    periodMonth: source.periodMonth,
    jurisdiction: source.jurisdiction,
    certifiedReleaseSha: source.certifiedReleaseSha,
    contentHmacSha256: source.contentHmacSha256,
    byteLength: source.byteLength,
    recordCount: source.recordCount,
    rows: source.rows,
    totals: source.totals,
    readiness: source.readiness,
  };
}

function privatePreparedSourceContext(source) {
  const privateContext = PREPARED_SOURCE_CONTEXTS.get(source);
  const definition = source && typeof source === 'object'
    ? MONTHLY_CLOSE_SOURCE_CONTRACTS[source.definitionKey] : null;
  const keysAreExact = source && typeof source === 'object'
    && Object.keys(source).length === PREPARED_SOURCE_KEYS.size
    && Object.keys(source).every((key) => PREPARED_SOURCE_KEYS.has(key));
  const readinessIsComplete = source?.readiness
    && Object.keys(source.readiness).length === 3
    && source.readiness.structurallyValid === true
    && source.readiness.readyForReview
      === (source.readiness.blockingIssues?.length === 0)
    && Array.isArray(source.readiness.blockingIssues)
    && Object.isFrozen(source.readiness.blockingIssues);
  const manifestSha256 = keysAreExact
    ? createHash('sha256').update(stableJson(manifestShape(source))).digest('hex')
    : '';
  if (!privateContext || !definition || !keysAreExact || !readinessIsComplete
      || !Object.isFrozen(source) || !Object.isFrozen(source.rows)
      || !source.rows.every((row) => row && typeof row === 'object' && Object.isFrozen(row))
      || source.sourceKind !== definition.sourceKind
      || source.hmacKeyVersion !== MONTHLY_CLOSE_HMAC_KEY_VERSION
      || source.provenanceState !== 'operator_declared'
      || !SHA256_HEX.test(source.contentHmacSha256)
      || !SHA256_HEX.test(source.manifestSha256)
      || source.manifestSha256 !== manifestSha256
      || source.manifestSha256 !== privateContext.manifestSha256
      || source.contentHmacSha256 !== privateContext.contentHmacSha256
      || source.definitionKey !== privateContext.definitionKey
      || !Number.isInteger(source.byteLength) || source.byteLength < 1
      || source.byteLength > MONTHLY_CLOSE_MAX_BYTES
      || !Number.isInteger(source.recordCount) || source.recordCount !== source.rows.length
      || source.includesPersonalRecords !== false || source.rawContentStored !== false
      || source.provenanceVerified !== false || source.persistencePerformed !== false
      || source.payrollCalculated !== false || source.payrollPosted !== false
      || source.closeApproved !== false || source.fiscalArtifactGenerated !== false) {
    fail(
      'MONTHLY_CLOSE_PRECHECK_SOURCE_INVALID',
      422,
      'Una fuente preparada no conserva su autenticidad y estructura completas',
    );
  }
  return privateContext;
}

export function buildMonthlyClosePrecheck(sources) {
  if (!Array.isArray(sources) || sources.length !== 3) {
    fail(
      'MONTHLY_CLOSE_PRECHECK_INPUT_INVALID',
      400,
      'El precontrol exige exactamente las tres fuentes agregadas',
    );
  }
  const byDefinition = new Map();
  const privateContexts = [];
  for (const source of sources) {
    const privateContext = privatePreparedSourceContext(source);
    if (byDefinition.has(source.definitionKey)
        || source.contractVersion !== MONTHLY_CLOSE_CONTRACT_VERSION) {
      fail(
        'MONTHLY_CLOSE_PRECHECK_SOURCE_INVALID',
        422,
        'Una fuente preparada no cumple el contrato del precontrol',
      );
    }
    privateContexts.push(privateContext);
    byDefinition.set(source.definitionKey, source);
  }
  if (byDefinition.size !== Object.keys(MONTHLY_CLOSE_SOURCE_CONTRACTS).length) {
    fail(
      'MONTHLY_CLOSE_PRECHECK_SOURCE_MISSING',
      422,
      'El precontrol no contiene las tres definiciones requeridas',
    );
  }
  const [first] = sources;
  const [firstPrivateContext] = privateContexts;
  if (sources.some((source) => source.periodMonth !== first.periodMonth
      || source.jurisdiction !== first.jurisdiction
      || source.certifiedReleaseSha !== first.certifiedReleaseSha)
      || privateContexts.some((context) => (
        context.tenantId !== firstPrivateContext.tenantId
        || context.sourceBindingId !== firstPrivateContext.sourceBindingId
      ))) {
    fail(
      'MONTHLY_CLOSE_PRECHECK_CONTEXT_MISMATCH',
      422,
      'Las fuentes preparadas no comparten período, jurisdicción y versión',
    );
  }
  const reconciliation = reconcileReportedSources(
    byDefinition.get('grh-concept-statistics.v1'),
    byDefinition.get('bank-accreditation-summary.v1'),
    byDefinition.get('government-payroll-summary.v1'),
  );
  const blockingIssues = Object.freeze([
    ...sources.flatMap((source) => (
    source.readiness.blockingIssues.map((issue) => Object.freeze({
      definitionKey: source.definitionKey,
      ...issue,
    }))
    )),
    ...reconciliation.blockingIssues.map((issue) => Object.freeze({
      definitionKey: Object.hasOwn(issue, 'comparisonKey')
        ? 'monthly-close-government-reconciliation.v1'
        : 'monthly-close-net-reconciliation.v1',
      ...issue,
    })),
  ]);
  return Object.freeze({
    contractVersion: MONTHLY_CLOSE_CONTRACT_VERSION,
    periodMonth: first.periodMonth,
    jurisdiction: first.jurisdiction,
    certifiedReleaseSha: first.certifiedReleaseSha,
    status: blockingIssues.length === 0 ? 'ready_for_review' : 'blocked',
    readyForReview: blockingIssues.length === 0,
    blockingIssues,
    reconciliation,
    sourceCount: sources.length,
    includesPersonalRecords: false,
    provenanceVerified: false,
    persistencePerformed: false,
    payrollCalculated: false,
    payrollPosted: false,
    closeApproved: false,
    fiscalArtifactGenerated: false,
    bankArtifactGenerated: false,
    tribunalArtifactGenerated: false,
  });
}
