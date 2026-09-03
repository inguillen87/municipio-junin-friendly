export const PAYROLL_ART_INPUT_CONTRACT_VERSION = 'payroll-art-canonical-input.v1';
export const PAYROLL_ART_REPORT_CONTRACT_VERSION = 'payroll-art-report.v1';
export const PAYROLL_ART_FORMULA_VERSION = 'art-province-salary-993-plus-995.v1';
export const PAYROLL_ART_EXPORT_PROFILE_VERSION = 'art-province-review-csv.v1';
export const PAYROLL_ART_CSV_BUNDLE_VERSION = 'payroll-art-csv-bundle.v1';
export const PAYROLL_ART_MAX_ROWS = 10000;

const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SNAPSHOT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const LIQUIDATION_ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const LEGAJO = /^(?!0+$)[0-9]{1,20}$/;
const DNI = /^[1-9][0-9]{6,8}$/;
const CUIL = /^(?:20|23|24|27)[0-9]{9}$/;
const NON_NEGATIVE_INT64 = /^(?:0|[1-9][0-9]{0,18})$/;
const WORKED_DAYS = /^(?:0|[1-9]|[12][0-9]|3[01])$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_INT64 = 9223372036854775807n;
const SCOPES = new Set(['all', '42', '55']);
const JURISDICTIONS = new Set(['42', '55']);
const SEX_CODES = new Set(['F', 'M', 'X']);
const INPUT_KEYS = new Set([
  'contractVersion', 'tenantId', 'actorId', 'requestedAt', 'period', 'scope',
  'source', 'rows',
]);
const SOURCE_KEYS = new Set([
  'snapshotId', 'sha256', 'cutoffAt', 'rowCount', 'includesPersonalRecords',
]);
const ROW_KEYS = new Set([
  'rowNumber', 'liquidationId', 'jurisdiction', 'legajo', 'dni', 'cuil', 'sex',
  'workedDays', 'concept993Cents', 'concept995Cents',
]);
const REPORT_CONTEXTS = new WeakSet();

export class PayrollArtReportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollArtReportError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollArtReportError(code, message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}

function exactInstant(value) {
  if (typeof value !== 'string' || !INSTANT.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256Text(value, cryptoImpl) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.subtle.digest !== 'function') {
    fail('ART_CRYPTO_UNAVAILABLE', 'No hay un motor criptográfico disponible para identificar la ejecución');
  }
  let digest;
  try {
    digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(value));
  } catch {
    fail('ART_CRYPTO_FAILED', 'No se pudo identificar de forma segura la ejecución');
  }
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function checkedAdd(left, right, code) {
  const result = left + right;
  if (result > MAX_INT64) fail(code, 'Los importes exceden el rango exacto admitido');
  return result;
}

function canonicalInt64(value, missingCode, invalidCode) {
  if (value === null || value === undefined || value === '') {
    return { value: null, error: missingCode };
  }
  if (typeof value !== 'string' || !NON_NEGATIVE_INT64.test(value)) {
    return { value: null, error: invalidCode };
  }
  try {
    const parsed = BigInt(value);
    if (parsed > MAX_INT64) return { value: null, error: invalidCode };
    return { value: parsed, error: null };
  } catch {
    return { value: null, error: invalidCode };
  }
}

function cuilChecksumValid(value) {
  if (!CUIL.test(value)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => (
    total + Number(value[index]) * weight
  ), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return check === Number(value[10]);
}

function cuilMatchesDni(cuil, dni) {
  return cuil.slice(2, 10) === dni.padStart(8, '0');
}

function normalizeRow(raw, index, scope) {
  const errors = new Set();
  const fallbackRowNumber = index + 1;
  const rowNumber = Number.isSafeInteger(raw?.rowNumber)
    && raw.rowNumber > 0 && raw.rowNumber <= 1000000
    ? raw.rowNumber : fallbackRowNumber;
  if (!hasExactKeys(raw, ROW_KEYS)) errors.add('ART_ROW_CONTRACT_INVALID');
  if (!Number.isSafeInteger(raw?.rowNumber) || raw.rowNumber <= 0 || raw.rowNumber > 1000000) {
    errors.add('ART_ROW_NUMBER_INVALID');
  }

  const jurisdiction = typeof raw?.jurisdiction === 'string' ? raw.jurisdiction : '';
  if (!JURISDICTIONS.has(jurisdiction)) errors.add('ART_JURISDICTION_INVALID');
  const included = !JURISDICTIONS.has(jurisdiction) || scope === 'all' || scope === jurisdiction;
  if (!included) return { included: false, rowNumber };

  const liquidationId = typeof raw?.liquidationId === 'string' ? raw.liquidationId : '';
  const legajo = typeof raw?.legajo === 'string' ? raw.legajo : '';
  const dni = typeof raw?.dni === 'string' ? raw.dni : '';
  const cuil = typeof raw?.cuil === 'string' ? raw.cuil : '';
  const sex = typeof raw?.sex === 'string' ? raw.sex : '';
  const workedDays = typeof raw?.workedDays === 'string' ? raw.workedDays : '';
  if (!LIQUIDATION_ID.test(liquidationId)) errors.add('ART_LIQUIDATION_ID_INVALID');
  if (!LEGAJO.test(legajo)) errors.add('ART_LEGAJO_INVALID');
  if (!DNI.test(dni)) errors.add('ART_DNI_INVALID');
  if (!CUIL.test(cuil)) errors.add('ART_CUIL_INVALID');
  else if (!cuilChecksumValid(cuil)) errors.add('ART_CUIL_CHECKSUM_INVALID');
  if (DNI.test(dni) && CUIL.test(cuil) && !cuilMatchesDni(cuil, dni)) {
    errors.add('ART_DOCUMENT_MISMATCH');
  }
  if (!SEX_CODES.has(sex)) errors.add('ART_SEX_INVALID');
  if (!WORKED_DAYS.test(workedDays)) errors.add('ART_WORKED_DAYS_INVALID');

  const concept993 = canonicalInt64(
    raw?.concept993Cents,
    'ART_CONCEPT_993_MISSING',
    'ART_CONCEPT_993_INVALID',
  );
  const concept995 = canonicalInt64(
    raw?.concept995Cents,
    'ART_CONCEPT_995_MISSING',
    'ART_CONCEPT_995_INVALID',
  );
  if (concept993.error) errors.add(concept993.error);
  if (concept995.error) errors.add(concept995.error);
  let salary = null;
  if (concept993.value !== null && concept995.value !== null) {
    const sum = concept993.value + concept995.value;
    if (sum > MAX_INT64) errors.add('ART_SALARY_OUT_OF_RANGE');
    else salary = sum;
  }

  return {
    included: true,
    rowNumber,
    liquidationId,
    jurisdiction,
    legajo,
    dni,
    cuil,
    sex,
    workedDays,
    concept993: concept993.value,
    concept995: concept995.value,
    salary,
    errors,
  };
}

function compareCanonicalRows(left, right) {
  if (left.jurisdiction !== right.jurisdiction) {
    return left.jurisdiction.localeCompare(right.jurisdiction);
  }
  if (LEGAJO.test(left.legajo) && LEGAJO.test(right.legajo)) {
    const leftNumber = BigInt(left.legajo);
    const rightNumber = BigInt(right.legajo);
    if (leftNumber < rightNumber) return -1;
    if (leftNumber > rightNumber) return 1;
  }
  const legajoOrder = left.legajo.localeCompare(right.legajo);
  if (legajoOrder) return legajoOrder;
  const liquidationOrder = left.liquidationId.localeCompare(right.liquidationId);
  return liquidationOrder || left.rowNumber - right.rowNumber;
}

function validateInput(input) {
  if (!hasExactKeys(input, INPUT_KEYS)
      || input.contractVersion !== PAYROLL_ART_INPUT_CONTRACT_VERSION
      || !UUID.test(String(input.tenantId || ''))
      || !UUID.test(String(input.actorId || ''))
      || !exactInstant(input.requestedAt)
      || !PERIOD.test(String(input.period || ''))
      || !SCOPES.has(input.scope)
      || !hasExactKeys(input.source, SOURCE_KEYS)
      || !SNAPSHOT_ID.test(String(input.source?.snapshotId || ''))
      || !SHA256.test(String(input.source?.sha256 || ''))
      || !exactInstant(input.source?.cutoffAt)
      || input.source?.includesPersonalRecords !== true
      || !Array.isArray(input.rows)
      || input.rows.length < 1
      || input.rows.length > PAYROLL_ART_MAX_ROWS
      || !Number.isSafeInteger(input.source?.rowCount)
      || input.source.rowCount !== input.rows.length) {
    fail('ART_INPUT_CONTRACT_INVALID', 'La fuente canónica no cumple el contrato ART');
  }
}

function reportFingerprintPayload(input, acceptedRows, rejectedRows, summary) {
  return {
    actorId: input.actorId.toLowerCase(),
    contractVersion: PAYROLL_ART_REPORT_CONTRACT_VERSION,
    exportProfileVersion: PAYROLL_ART_EXPORT_PROFILE_VERSION,
    formulaVersion: PAYROLL_ART_FORMULA_VERSION,
    period: input.period,
    requestedAt: input.requestedAt,
    rows: acceptedRows,
    rejectedRows,
    scope: input.scope,
    source: input.source,
    summary,
    tenantId: input.tenantId.toLowerCase(),
  };
}

export async function buildPayrollArtReport(input, { cryptoImpl = globalThis.crypto } = {}) {
  validateInput(input);
  const normalized = input.rows.map((row, index) => normalizeRow(row, index, input.scope));
  const includedRows = normalized.filter((row) => row.included);
  const rowNumbers = new Map();
  const duplicateKeys = new Map();
  for (const row of includedRows) {
    const rowNumberGroup = rowNumbers.get(row.rowNumber) || [];
    rowNumberGroup.push(row);
    rowNumbers.set(row.rowNumber, rowNumberGroup);
    if (CUIL.test(row.cuil) && LIQUIDATION_ID.test(row.liquidationId)) {
      const key = `${input.period}\u0000${row.liquidationId}\u0000${row.cuil}`;
      const duplicateGroup = duplicateKeys.get(key) || [];
      duplicateGroup.push(row);
      duplicateKeys.set(key, duplicateGroup);
    }
  }
  for (const rows of rowNumbers.values()) {
    if (rows.length > 1) rows.forEach((row) => row.errors.add('ART_ROW_NUMBER_DUPLICATED'));
  }
  let duplicateGroups = 0;
  for (const rows of duplicateKeys.values()) {
    if (rows.length > 1) {
      duplicateGroups += 1;
      rows.forEach((row) => row.errors.add('ART_DUPLICATE_PERSON_LIQUIDATION_PERIOD'));
    }
  }

  const acceptedRows = includedRows
    .filter((row) => row.errors.size === 0)
    .sort(compareCanonicalRows)
    .map((row) => ({
      rowNumber: row.rowNumber,
      liquidationId: row.liquidationId,
      jurisdiction: row.jurisdiction,
      legajo: row.legajo,
      dni: row.dni,
      cuil: row.cuil,
      sex: row.sex,
      workedDays: row.workedDays,
      concept993Cents: row.concept993.toString(),
      concept995Cents: row.concept995.toString(),
      salaryCents: row.salary.toString(),
    }));
  const rejectedRows = includedRows
    .filter((row) => row.errors.size > 0)
    .sort((left, right) => left.rowNumber - right.rowNumber)
    .map((row) => ({
      rowNumber: row.rowNumber,
      errorCodes: [...row.errors].sort(),
    }));

  let concept993Total = 0n;
  let concept995Total = 0n;
  let salaryTotal = 0n;
  for (const row of acceptedRows) {
    concept993Total = checkedAdd(
      concept993Total, BigInt(row.concept993Cents), 'ART_TOTAL_OUT_OF_RANGE',
    );
    concept995Total = checkedAdd(
      concept995Total, BigInt(row.concept995Cents), 'ART_TOTAL_OUT_OF_RANGE',
    );
    salaryTotal = checkedAdd(salaryTotal, BigInt(row.salaryCents), 'ART_TOTAL_OUT_OF_RANGE');
  }
  const summary = {
    sourceRows: input.rows.length,
    scopedRows: includedRows.length,
    excludedByScope: normalized.length - includedRows.length,
    acceptedRows: acceptedRows.length,
    rejectedRows: rejectedRows.length,
    duplicateGroups,
    concept993TotalCents: concept993Total.toString(),
    concept995TotalCents: concept995Total.toString(),
    salaryTotalCents: salaryTotal.toString(),
  };
  const reportSha256 = await sha256Text(
    stableJson(reportFingerprintPayload(input, acceptedRows, rejectedRows, summary)),
    cryptoImpl,
  );
  const readyForReview = acceptedRows.length > 0 && rejectedRows.length === 0;
  const report = deepFreeze({
    contractVersion: PAYROLL_ART_REPORT_CONTRACT_VERSION,
    sourceContractVersion: PAYROLL_ART_INPUT_CONTRACT_VERSION,
    formulaVersion: PAYROLL_ART_FORMULA_VERSION,
    exportProfileVersion: PAYROLL_ART_EXPORT_PROFILE_VERSION,
    tenantId: input.tenantId.toLowerCase(),
    actorId: input.actorId.toLowerCase(),
    requestedAt: input.requestedAt,
    period: input.period,
    scope: input.scope,
    status: readyForReview ? 'ready_for_authorized_review' : 'blocked_by_validation',
    readyForReview,
    officialSubmissionAllowed: false,
    acceptedRows,
    rejectedRows,
    summary,
    source: {
      snapshotId: input.source.snapshotId,
      sha256: input.source.sha256,
      cutoffAt: input.source.cutoffAt,
      rowCount: input.source.rowCount,
      includesPersonalRecords: true,
    },
    traceability: {
      reportSha256,
      formula: 'concepto 993 + concepto 995',
      formulaVersion: PAYROLL_ART_FORMULA_VERSION,
      exportProfileVersion: PAYROLL_ART_EXPORT_PROFILE_VERSION,
      rulesInferred: false,
      persistencePerformed: false,
      networkPerformed: false,
      payrollModified: false,
      officialArtifactGenerated: false,
    },
  });
  REPORT_CONTEXTS.add(report);
  return report;
}

export function requireTrustedPayrollArtReport(report) {
  if (!REPORT_CONTEXTS.has(report)) {
    fail('ART_REPORT_NOT_TRUSTED', 'El reporte debe provenir del motor ART de esta sesión');
  }
  return report;
}

function neutralizeSpreadsheetFormula(value) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value) {
  const raw = neutralizeSpreadsheetFormula(String(value ?? ''));
  return /[;"\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function csv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

function arsFromCents(value) {
  const cents = BigInt(value);
  const digits = cents.toString().padStart(3, '0');
  return `${digits.slice(0, -2)},${digits.slice(-2)}`;
}

function scopeLabel(scope) {
  return scope === 'all' ? 'todos' : `j${scope}`;
}

function baseFileName(report) {
  const fingerprint = report.traceability.reportSha256.slice(7, 19);
  return `municontrol_art-provincia_${report.period}_${scopeLabel(report.scope)}_${fingerprint}`;
}

function detailCsv(report) {
  const rows = [[
    'periodo', 'ambito', 'fila_fuente', 'liquidacion', 'jurisdiccion', 'legajo',
    'dni', 'cuil', 'sexo', 'dias_trabajados', 'concepto_993_ars',
    'concepto_995_ars', 'sueldo_art_ars', 'version_formula',
  ]];
  for (const row of report.acceptedRows) {
    rows.push([
      report.period, report.scope, row.rowNumber, row.liquidationId, row.jurisdiction,
      row.legajo, row.dni, row.cuil, row.sex, row.workedDays,
      arsFromCents(row.concept993Cents), arsFromCents(row.concept995Cents),
      arsFromCents(row.salaryCents), report.formulaVersion,
    ]);
  }
  return csv(rows);
}

function rejectedCsv(report) {
  const rows = [['periodo', 'ambito', 'fila_fuente', 'codigos_error']];
  for (const row of report.rejectedRows) {
    rows.push([report.period, report.scope, row.rowNumber, row.errorCodes.join('|')]);
  }
  return csv(rows);
}

function summaryCsv(report) {
  const entries = [
    ['estado', report.status],
    ['periodo', report.period],
    ['ambito', report.scope],
    ['filas_fuente', report.summary.sourceRows],
    ['filas_ambito', report.summary.scopedRows],
    ['filas_excluidas_ambito', report.summary.excludedByScope],
    ['filas_aceptadas', report.summary.acceptedRows],
    ['filas_rechazadas', report.summary.rejectedRows],
    ['grupos_duplicados', report.summary.duplicateGroups],
    ['total_concepto_993_ars', arsFromCents(report.summary.concept993TotalCents)],
    ['total_concepto_995_ars', arsFromCents(report.summary.concept995TotalCents)],
    ['masa_salarial_art_ars', arsFromCents(report.summary.salaryTotalCents)],
    ['formula', report.traceability.formula],
    ['version_formula', report.formulaVersion],
    ['listo_revision_autorizada', report.readyForReview ? 'SI' : 'NO'],
    ['presentacion_oficial_habilitada', 'NO'],
  ];
  return csv([['indicador', 'valor'], ...entries]);
}

async function fileArtifact(kind, fileName, content, containsPersonalRecords, cryptoImpl) {
  const encoded = new TextEncoder().encode(content);
  return {
    kind,
    fileName,
    mimeType: 'text/csv;charset=utf-8',
    byteLength: encoded.byteLength,
    sha256: await sha256Text(content, cryptoImpl),
    containsPersonalRecords,
    content,
  };
}

function traceabilityCsv(report, artifacts) {
  const entries = [
    ['contrato_reporte', report.contractVersion],
    ['contrato_fuente', report.sourceContractVersion],
    ['perfil_exportacion', report.exportProfileVersion],
    ['version_formula', report.formulaVersion],
    ['tenant_id', report.tenantId],
    ['actor_id', report.actorId],
    ['solicitado_en', report.requestedAt],
    ['periodo', report.period],
    ['ambito', report.scope],
    ['snapshot_id', report.source.snapshotId],
    ['corte_fuente', report.source.cutoffAt],
    ['sha256_fuente', report.source.sha256],
    ['filas_fuente', report.source.rowCount],
    ['sha256_reporte', report.traceability.reportSha256],
    ['reglas_inferidas', 'NO'],
    ['persistencia_realizada', 'NO'],
    ['red_utilizada', 'NO'],
    ['nomina_modificada', 'NO'],
    ['artefacto_oficial_generado', 'NO'],
  ];
  for (const artifact of artifacts) {
    entries.push([`sha256_${artifact.kind}`, artifact.sha256]);
    entries.push([`bytes_${artifact.kind}`, artifact.byteLength]);
  }
  return csv([['campo', 'valor'], ...entries]);
}

export async function createPayrollArtCsvBundle(
  report,
  { cryptoImpl = globalThis.crypto } = {},
) {
  requireTrustedPayrollArtReport(report);
  const base = baseFileName(report);
  const artifacts = [];
  artifacts.push(await fileArtifact(
    'detalle', `${base}_detalle.csv`, detailCsv(report), report.acceptedRows.length > 0, cryptoImpl,
  ));
  artifacts.push(await fileArtifact(
    'rechazados', `${base}_rechazados.csv`, rejectedCsv(report), false, cryptoImpl,
  ));
  artifacts.push(await fileArtifact(
    'resumen', `${base}_resumen.csv`, summaryCsv(report), false, cryptoImpl,
  ));
  artifacts.push(await fileArtifact(
    'trazabilidad', `${base}_trazabilidad.csv`, traceabilityCsv(report, artifacts), false, cryptoImpl,
  ));
  const manifest = artifacts.map((artifact) => ({
    byteLength: artifact.byteLength,
    containsPersonalRecords: artifact.containsPersonalRecords,
    fileName: artifact.fileName,
    kind: artifact.kind,
    sha256: artifact.sha256,
  }));
  const bundleSha256 = await sha256Text(stableJson(manifest), cryptoImpl);
  return deepFreeze({
    contractVersion: PAYROLL_ART_CSV_BUNDLE_VERSION,
    reportSha256: report.traceability.reportSha256,
    bundleSha256,
    period: report.period,
    scope: report.scope,
    status: report.status,
    readyForReview: report.readyForReview,
    officialSubmissionAllowed: false,
    persistencePerformed: false,
    files: artifacts,
  });
}
