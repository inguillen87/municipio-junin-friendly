export const PAYROLL_SCHOOLING_EVIDENCE_CONTRACT_VERSION = 'payroll-schooling-report-evidence.v1';
export const PAYROLL_SCHOOLING_PROFILE_ID = 'schooling-control-noelia-20260903.observed.v1';
export const PAYROLL_SCHOOLING_VALIDATION_VERSION = 'payroll-schooling-xlsx-structure-validation.v1';
export const PAYROLL_SCHOOLING_RECONCILIATION_VERSION = 'payroll-schooling-cents-reconciliation.v1';
export const PAYROLL_SCHOOLING_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const PAYROLL_SCHOOLING_MAX_ZIP_ENTRIES = 2048;
export const PAYROLL_SCHOOLING_MAX_ISSUES = 128;
export const PAYROLL_SCHOOLING_MAX_ROWS = 100000;

const MAX_INT64 = 9223372036854775807n;
const MIN_INT64 = -9223372036854775808n;
const EXACT_CENTS = /^(?:0|-?[1-9][0-9]{0,18})$/;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 22 + 65535;
const REQUIRED_PARTS = Object.freeze([
  '[Content_Types].xml',
  '_rels/.rels',
  'xl/workbook.xml',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const PAYROLL_SCHOOLING_OBSERVED_PROFILE = deepFreeze({
  contractVersion: PAYROLL_SCHOOLING_EVIDENCE_CONTRACT_VERSION,
  reportId: 'REP-08',
  profileId: PAYROLL_SCHOOLING_PROFILE_ID,
  requestedOutput: 'xlsx',
  evidenceLevel: 'explicit_output_only',
  sourceReferences: [
    {
      sourceRef: 'noelia-report-requirements-20260903',
      sourceKind: 'pdf',
      sourceSha256: 'sha256:4a9d1eea930808aea897524c109b3cef077f7014b848835a4edc7c08c6c11dc4',
      page: 2,
    },
    {
      sourceRef: 'agosto-working-files-20260902',
      sourceKind: 'zip_inventory',
      sourceSha256: 'sha256:20d3ab30c090bbe349de19b567b00d949f5a3ffed00094cd3261d4ca3604001f',
      xlsxEntries: 50,
      uniqueXlsxPayloads: 45,
      unambiguousSchoolingWorkbookCandidates: 0,
    },
  ],
  observedColumns: [],
  sampleWorkbookAvailable: false,
  semanticMappingComplete: false,
  generationAllowed: false,
  officialUseAllowed: false,
  unknownRequirements: [
    'source_population_and_cutoff',
    'column_order_names_and_types',
    'schooling_event_or_concept_mapping',
    'inclusion_and_exclusion_rules',
    'jurisdiction_and_department_scope',
    'amount_source_and_rounding',
    'duplicate_business_key',
    'control_totals',
    'approved_filename_and_sheet_names',
    'privacy_minimization_and_retention',
  ],
});

export class PayrollSchoolingReportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollSchoolingReportError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollSchoolingReportError(code, message);
}

function normalizeBytes(value) {
  if (!(value instanceof Uint8Array)) {
    fail('SCHOOLING_SOURCE_BYTES_INVALID', 'La fuente debe recibirse como bytes');
  }
  if (value.byteLength === 0) {
    fail('SCHOOLING_SOURCE_EMPTY', 'La fuente no contiene bytes');
  }
  if (value.byteLength > PAYROLL_SCHOOLING_MAX_SOURCE_BYTES) {
    fail('SCHOOLING_SOURCE_TOO_LARGE', 'La fuente supera el limite seguro de validacion');
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function normalizeProfileId(value) {
  if (value !== PAYROLL_SCHOOLING_PROFILE_ID) {
    fail('SCHOOLING_PROFILE_UNKNOWN', 'El perfil de escolaridades no pertenece al catalogo observado');
  }
  return value;
}

function readU16(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return (bytes[offset]
    + bytes[offset + 1] * 0x100
    + bytes[offset + 2] * 0x10000
    + bytes[offset + 3] * 0x1000000) >>> 0;
}

function findEocd(bytes) {
  const minimum = Math.max(0, bytes.byteLength - MAX_EOCD_SEARCH);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (readU32(bytes, offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function safeDecodeName(bytes, start, length) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, start + length));
  } catch {
    return null;
  }
}

function scanZipDirectory(bytes, appendIssue) {
  const eocd = findEocd(bytes);
  if (eocd < 0) {
    appendIssue('SCHOOLING_XLSX_EOCD_NOT_FOUND');
    return null;
  }

  const diskNumber = readU16(bytes, eocd + 4);
  const centralDisk = readU16(bytes, eocd + 6);
  const entriesOnDisk = readU16(bytes, eocd + 8);
  const entryCount = readU16(bytes, eocd + 10);
  const centralSize = readU32(bytes, eocd + 12);
  const centralOffset = readU32(bytes, eocd + 16);
  const commentLength = readU16(bytes, eocd + 20);

  if (eocd + 22 + commentLength !== bytes.byteLength) {
    appendIssue('SCHOOLING_XLSX_EOCD_LENGTH_INVALID');
  }
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    appendIssue('SCHOOLING_XLSX_MULTIDISK_NOT_ALLOWED');
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    appendIssue('SCHOOLING_XLSX_ZIP64_NOT_SUPPORTED');
    return null;
  }
  if (entryCount < 1) appendIssue('SCHOOLING_XLSX_NO_PARTS');
  if (entryCount > PAYROLL_SCHOOLING_MAX_ZIP_ENTRIES) {
    fail('SCHOOLING_XLSX_ENTRY_LIMIT_EXCEEDED', 'El libro supera el limite seguro de partes');
  }
  if (centralOffset + centralSize !== eocd || centralOffset >= bytes.byteLength) {
    appendIssue('SCHOOLING_XLSX_CENTRAL_DIRECTORY_INVALID');
    return null;
  }

  const names = new Set();
  const worksheetParts = [];
  let cursor = centralOffset;
  let compressedBytes = 0n;
  let uncompressedBytes = 0n;

  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(bytes, cursor) !== CENTRAL_FILE_HEADER_SIGNATURE) {
      appendIssue('SCHOOLING_XLSX_CENTRAL_ENTRY_INVALID');
      return null;
    }
    const flags = readU16(bytes, cursor + 8);
    const compression = readU16(bytes, cursor + 10);
    const compressedSize = readU32(bytes, cursor + 20);
    const uncompressedSize = readU32(bytes, cursor + 24);
    const nameLength = readU16(bytes, cursor + 28);
    const extraLength = readU16(bytes, cursor + 30);
    const fileCommentLength = readU16(bytes, cursor + 32);
    const startingDisk = readU16(bytes, cursor + 34);
    const localOffset = readU32(bytes, cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + fileCommentLength;

    if (next > eocd || nameLength < 1) {
      appendIssue('SCHOOLING_XLSX_CENTRAL_ENTRY_TRUNCATED');
      return null;
    }
    const name = safeDecodeName(bytes, cursor + 46, nameLength);
    if (!name || /[\u0000-\u001f\u007f]/.test(name)) {
      appendIssue('SCHOOLING_XLSX_PART_NAME_INVALID');
    } else {
      if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
        appendIssue('SCHOOLING_XLSX_PART_PATH_UNSAFE');
      }
      if (names.has(name)) appendIssue('SCHOOLING_XLSX_DUPLICATE_PART');
      names.add(name);
      if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) worksheetParts.push(name);
    }
    if ((flags & 0x0001) !== 0) appendIssue('SCHOOLING_XLSX_ENCRYPTED_PART_NOT_ALLOWED');
    if (![0, 8].includes(compression)) appendIssue('SCHOOLING_XLSX_COMPRESSION_UNSUPPORTED');
    if (startingDisk !== 0) appendIssue('SCHOOLING_XLSX_MULTIDISK_NOT_ALLOWED');
    if (readU32(bytes, localOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
      appendIssue('SCHOOLING_XLSX_LOCAL_HEADER_INVALID');
    } else {
      const localNameLength = readU16(bytes, localOffset + 26);
      const localExtraLength = readU16(bytes, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      if (dataStart + compressedSize > centralOffset) {
        appendIssue('SCHOOLING_XLSX_PART_DATA_OUT_OF_BOUNDS');
      }
      const localName = safeDecodeName(bytes, localOffset + 30, localNameLength);
      if (name && localName !== name) appendIssue('SCHOOLING_XLSX_LOCAL_NAME_MISMATCH');
    }
    compressedBytes += BigInt(compressedSize);
    uncompressedBytes += BigInt(uncompressedSize);
    cursor = next;
  }

  if (cursor !== eocd) appendIssue('SCHOOLING_XLSX_CENTRAL_SIZE_MISMATCH');
  for (const part of REQUIRED_PARTS) {
    if (!names.has(part)) appendIssue('SCHOOLING_XLSX_REQUIRED_PART_MISSING');
  }
  if (worksheetParts.length < 1) appendIssue('SCHOOLING_XLSX_WORKSHEET_PART_MISSING');

  return {
    zipEntryCount: entryCount,
    worksheetPartCount: worksheetParts.length,
    compressedPayloadBytes: compressedBytes.toString(),
    declaredUncompressedBytes: uncompressedBytes.toString(),
  };
}

async function sha256Bytes(bytes, cryptoImpl) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.subtle.digest !== 'function') {
    fail('SCHOOLING_CRYPTO_UNAVAILABLE', 'No hay un motor criptografico disponible');
  }
  let digest;
  try {
    digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  } catch {
    fail('SCHOOLING_CRYPTO_FAILED', 'No se pudo identificar la fuente');
  }
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function diagnosePayrollSchoolingProfile(profileId = PAYROLL_SCHOOLING_PROFILE_ID) {
  normalizeProfileId(profileId);
  return deepFreeze({
    contractVersion: PAYROLL_SCHOOLING_EVIDENCE_CONTRACT_VERSION,
    profileId,
    status: 'blocked',
    reasonCode: 'SCHOOLING_SAMPLE_AND_FIELDS_UNMAPPED',
    requestedOutput: 'xlsx',
    sampleWorkbookAvailable: false,
    semanticMappingComplete: false,
    generationAllowed: false,
    officialUseAllowed: false,
    observedColumns: [],
    missingRequirements: [...PAYROLL_SCHOOLING_OBSERVED_PROFILE.unknownRequirements],
  });
}

/**
 * Examina solamente el contenedor OOXML: no descomprime ni devuelve celdas,
 * nombres de hojas o valores personales. Una estructura valida no homologa
 * columnas, formulas, poblacion ni uso oficial.
 */
export async function inspectPayrollSchoolingWorkbook(
  { profileId, bytes },
  { cryptoImpl } = {},
) {
  normalizeProfileId(profileId);
  const source = normalizeBytes(bytes);
  const issues = [];
  let issueCount = 0;
  const appendIssue = (code) => {
    issueCount += 1;
    if (issues.length < PAYROLL_SCHOOLING_MAX_ISSUES && !issues.includes(code)) issues.push(code);
  };

  const structure = scanZipDirectory(source, appendIssue);
  const sha256 = await sha256Bytes(source, cryptoImpl);
  const structureValid = issueCount === 0 && structure !== null;

  return deepFreeze({
    contractVersion: PAYROLL_SCHOOLING_VALIDATION_VERSION,
    profileId,
    status: structureValid ? 'valid_xlsx_container_unmapped' : 'invalid_xlsx_structure',
    structureValid,
    sourceByteLength: source.byteLength,
    sourceSha256: sha256,
    sourceValuesIncluded: false,
    structure: structure || {
      zipEntryCount: 0,
      worksheetPartCount: 0,
      compressedPayloadBytes: '0',
      declaredUncompressedBytes: '0',
    },
    diagnostics: {
      issueCount,
      issues,
      issuesTruncated: issueCount > issues.length,
    },
    semanticMappingComplete: false,
    generationAllowed: false,
    officialUseAllowed: false,
    limitations: [
      'container_validation_does_not_read_cell_values',
      'valid_xlsx_container_does_not_homologate_columns',
      'no_schooling_sample_workbook_identified',
    ],
  });
}

function parseCents(value) {
  if (typeof value !== 'string' || !EXACT_CENTS.test(value)) {
    fail('SCHOOLING_CENTS_INVALID', 'Los importes deben expresarse como centavos enteros canonicos');
  }
  const parsed = BigInt(value);
  if (parsed < MIN_INT64 || parsed > MAX_INT64) {
    fail('SCHOOLING_CENTS_OUT_OF_RANGE', 'El importe excede el rango exacto admitido');
  }
  return parsed;
}

export function reconcilePayrollSchoolingCents({ expectedCents, observedCents }) {
  const expected = parseCents(expectedCents);
  const observed = parseCents(observedCents);
  const difference = observed - expected;
  if (difference < MIN_INT64 || difference > MAX_INT64) {
    fail('SCHOOLING_CENTS_OUT_OF_RANGE', 'La diferencia excede el rango exacto admitido');
  }
  return deepFreeze({
    contractVersion: PAYROLL_SCHOOLING_RECONCILIATION_VERSION,
    expectedCents: expected.toString(),
    observedCents: observed.toString(),
    differenceCents: difference.toString(),
    reconciled: difference === 0n,
    generationAllowed: false,
  });
}

export function summarizePayrollSchoolingBatch({
  inputRowCount,
  acceptedRowCount,
  rejectedRowCount,
  expectedTotalCents,
  observedTotalCents,
}) {
  for (const value of [inputRowCount, acceptedRowCount, rejectedRowCount]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > PAYROLL_SCHOOLING_MAX_ROWS) {
      fail('SCHOOLING_ROW_COUNT_INVALID', 'Las cantidades de filas no cumplen el contrato');
    }
  }
  if (acceptedRowCount + rejectedRowCount !== inputRowCount) {
    fail('SCHOOLING_ROW_COUNT_MISMATCH', 'Las filas aceptadas y rechazadas no concilian');
  }
  const cents = reconcilePayrollSchoolingCents({ expectedCents: expectedTotalCents, observedCents: observedTotalCents });
  return deepFreeze({
    contractVersion: 'payroll-schooling-safe-batch-summary.v1',
    inputRowCount,
    acceptedRowCount,
    rejectedRowCount,
    cents,
    containsSourceValues: false,
    status: rejectedRowCount === 0 && cents.reconciled ? 'structurally_reconciled' : 'requires_review',
    semanticMappingComplete: false,
    generationAllowed: false,
    officialUseAllowed: false,
  });
}

export function generatePayrollSchoolingWorkbook(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail('SCHOOLING_GENERATION_INPUT_INVALID', 'La solicitud de generacion no cumple el contrato');
  }
  fail(
    'SCHOOLING_GENERATION_BLOCKED_PROFILE_UNMAPPED',
    'La planilla no puede generarse hasta homologar muestra, columnas, poblacion y controles',
  );
}
