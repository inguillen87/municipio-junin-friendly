export const PAYROLL_BANK_PROFILE_CATALOG_VERSION = 'payroll-bank-observed-structure-catalog.v1';
export const PAYROLL_BANK_VALIDATION_RESULT_VERSION = 'payroll-bank-structure-validation.v1';
export const PAYROLL_BANK_RECONCILIATION_VERSION = 'payroll-bank-control-reconciliation.v1';
export const PAYROLL_BANK_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const PAYROLL_BANK_MAX_RECORDS = 10000;
export const PAYROLL_BANK_MAX_ROW_DIAGNOSTICS = 200;

const MAX_INT64 = 9223372036854775807n;
const NON_NEGATIVE_INT64 = /^(?:0|[1-9][0-9]{0,18})$/;
const VALID_CP1252_HIGH_BYTES = new Set([
  0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c,
  0x8e, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b,
  0x9c, 0x9e, 0x9f,
]);

const CATALOG = {
  'credicoop-accreditation-30.observed.v1': {
    profileId: 'credicoop-accreditation-30.observed.v1',
    institution: 'Credicoop',
    artifactKind: 'accreditation',
    recordWidthBytes: 30,
    encodingConstraint: 'ascii-printable',
    lineEnding: 'CRLF',
    bom: 'forbidden',
    supportedScopes: ['42', '55'],
    fieldLayoutStatus: 'not_homologated',
    generationStatus: 'blocked_pending_field_layout',
    officialSubmissionAllowed: false,
    referenceSamples: [
      {
        scope: '42',
        observedRecordCount: 165,
        sha256: 'sha256:7bc6dc55412f9c517bc63b91964f8c8c6ee2fd986fdcd52fa499b010c064e359',
      },
      {
        scope: '55',
        observedRecordCount: 8,
        sha256: 'sha256:88372dfe71a5a8507d7fdc456c37b3e04069774c1fdee87253242f7c27f02e8e',
      },
    ],
  },
  'credicoop-control-66.observed.v1': {
    profileId: 'credicoop-control-66.observed.v1',
    institution: 'Credicoop',
    artifactKind: 'operator_control',
    recordWidthBytes: 66,
    encodingConstraint: 'windows-1252-printable',
    lineEnding: 'CRLF',
    bom: 'forbidden',
    supportedScopes: ['42', '55'],
    fieldLayoutStatus: 'not_homologated',
    generationStatus: 'blocked_pending_field_layout',
    officialSubmissionAllowed: false,
    referenceSamples: [
      {
        scope: '42',
        observedRecordCount: 165,
        sha256: 'sha256:8fb360d43e62d9cc65cd9af0cd3cb523c82b170ca7765b7af3c9d6f0a9489621',
      },
      {
        scope: '55',
        observedRecordCount: 8,
        sha256: 'sha256:707a6d2073b0c61ec32c80ccab9f073a103d93532832e06992a780d6492679a5',
      },
    ],
  },
  'gt-pagos-200.observed.v1': {
    profileId: 'gt-pagos-200.observed.v1',
    institution: 'Santander/Nacion',
    artifactKind: 'gt_pagos',
    recordWidthBytes: 200,
    encodingConstraint: 'ascii-printable',
    lineEnding: 'CRLF',
    bom: 'forbidden',
    supportedScopes: ['42', '55'],
    fieldLayoutStatus: 'not_homologated',
    generationStatus: 'blocked_pending_field_layout',
    officialSubmissionAllowed: false,
    referenceSamples: [
      {
        scope: '42',
        observedRecordCount: 394,
        sha256: 'sha256:b8ef96d3c5bbd983a8623b3bd8b63b8680c35ec234ec8b594a8b7832ca35722e',
      },
      {
        scope: '55',
        observedRecordCount: 85,
        sha256: 'sha256:c7c9701daf04c48db1fc962d0eecb9dc8c6c3f06cbc20cb0ee7eb79b09022dea',
      },
    ],
  },
  'transferencias-varias-167.observed.v1': {
    profileId: 'transferencias-varias-167.observed.v1',
    institution: 'Multiple destinations',
    artifactKind: 'transferencias_varias',
    recordWidthBytes: 167,
    encodingConstraint: 'windows-1252-printable',
    lineEnding: 'CRLF',
    bom: 'forbidden',
    supportedScopes: ['unsegmented'],
    fieldLayoutStatus: 'not_homologated',
    generationStatus: 'blocked_pending_field_layout',
    officialSubmissionAllowed: false,
    referenceSamples: [
      {
        scope: 'unsegmented',
        observedRecordCount: 47,
        sha256: 'sha256:8c6061a344fb05b3258679307499c6937985475952fee333eae122aa6bce1a9b',
      },
    ],
  },
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const PAYROLL_BANK_OBSERVED_PROFILES = deepFreeze(CATALOG);

export class PayrollBankProfileError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollBankProfileError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollBankProfileError(code, message);
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

function profileFor(profileId) {
  if (typeof profileId !== 'string' || !Object.hasOwn(PAYROLL_BANK_OBSERVED_PROFILES, profileId)) {
    fail('BANK_PROFILE_UNKNOWN', 'El perfil estructural solicitado no esta registrado');
  }
  return PAYROLL_BANK_OBSERVED_PROFILES[profileId];
}

function canonicalBytes(value) {
  if (!(value instanceof Uint8Array) || value.byteLength < 1) {
    fail('BANK_FILE_BYTES_INVALID', 'La fuente debe contener bytes no vacios');
  }
  if (value.byteLength > PAYROLL_BANK_MAX_FILE_BYTES) {
    fail('BANK_FILE_TOO_LARGE', 'La fuente excede el limite estructural admitido');
  }
  return value;
}

async function sha256Bytes(bytes, cryptoImpl) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.subtle.digest !== 'function') {
    fail('BANK_CRYPTO_UNAVAILABLE', 'No hay un motor criptografico disponible');
  }
  let digest;
  try {
    digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  } catch {
    fail('BANK_CRYPTO_FAILED', 'No se pudo identificar la fuente');
  }
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function isPrintableByte(byte, encodingConstraint) {
  if (byte >= 0x20 && byte <= 0x7e) return true;
  if (encodingConstraint === 'windows-1252-printable') {
    return byte >= 0xa0 || VALID_CP1252_HIGH_BYTES.has(byte);
  }
  return false;
}

function scanObservedRecords(bytes, profile) {
  const issueCounts = new Map();
  const rowIssues = new Map();
  let diagnosticsTruncated = false;
  let recordCount = 0;

  const addIssue = (rowNumber, code) => {
    issueCounts.set(code, (issueCounts.get(code) || 0) + 1);
    if (rowNumber === null) return;
    if (!rowIssues.has(rowNumber)) {
      if (rowIssues.size >= PAYROLL_BANK_MAX_ROW_DIAGNOSTICS) {
        diagnosticsTruncated = true;
        return;
      }
      rowIssues.set(rowNumber, new Set());
    }
    rowIssues.get(rowNumber).add(code);
  };

  let cursor = 0;
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    addIssue(1, 'BANK_BOM_FORBIDDEN');
    cursor = 3;
  }

  const inspectRecord = (start, end, endingIsCrlf) => {
    recordCount += 1;
    if (recordCount > PAYROLL_BANK_MAX_RECORDS) {
      fail('BANK_RECORD_LIMIT_EXCEEDED', 'La fuente excede la cantidad maxima de registros');
    }
    if (!endingIsCrlf) addIssue(recordCount, 'BANK_LINE_ENDING_INVALID');
    if (end - start !== profile.recordWidthBytes) {
      addIssue(recordCount, 'BANK_RECORD_WIDTH_MISMATCH');
    }
    let printable = true;
    for (let index = start; index < end; index += 1) {
      if (!isPrintableByte(bytes[index], profile.encodingConstraint)) {
        printable = false;
        break;
      }
    }
    if (!printable) addIssue(recordCount, 'BANK_ENCODING_CONSTRAINT_FAILED');
  };

  let start = cursor;
  while (cursor < bytes.byteLength) {
    if (bytes[cursor] === 0x0d) {
      if (cursor + 1 < bytes.byteLength && bytes[cursor + 1] === 0x0a) {
        inspectRecord(start, cursor, true);
        cursor += 2;
        start = cursor;
        continue;
      }
      inspectRecord(start, cursor, false);
      cursor += 1;
      start = cursor;
      continue;
    }
    if (bytes[cursor] === 0x0a) {
      inspectRecord(start, cursor, false);
      cursor += 1;
      start = cursor;
      continue;
    }
    cursor += 1;
  }

  if (start < bytes.byteLength) {
    inspectRecord(start, bytes.byteLength, false);
    addIssue(recordCount, 'BANK_FINAL_CRLF_REQUIRED');
  } else if (recordCount === 0) {
    addIssue(null, 'BANK_NO_RECORDS');
  }

  const rowDiagnostics = [...rowIssues.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rowNumber, codes]) => Object.freeze({
      rowNumber,
      errorCodes: Object.freeze([...codes].sort()),
    }));
  const byCode = [...issueCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => Object.freeze({ code, count }));

  return {
    recordCount,
    issueCount: byCode.reduce((total, issue) => total + issue.count, 0),
    byCode,
    rowDiagnostics,
    diagnosticsTruncated,
  };
}

/**
 * Validates only properties proven from byte-level samples. A structural match is
 * not proof of account ownership, monetary totals, bank acceptance or submission.
 */
export async function validateObservedBankFile(input, { cryptoImpl = globalThis.crypto } = {}) {
  if (!hasExactKeys(input, new Set(['profileId', 'scope', 'bytes']))) {
    fail('BANK_VALIDATION_INPUT_INVALID', 'La solicitud de validacion no cumple el contrato');
  }
  const profile = profileFor(input.profileId);
  if (typeof input.scope !== 'string' || !profile.supportedScopes.includes(input.scope)) {
    fail('BANK_SCOPE_NOT_OBSERVED', 'El ambito solicitado no esta cubierto por la evidencia');
  }
  const bytes = canonicalBytes(input.bytes);
  const [sha256, inspection] = await Promise.all([
    sha256Bytes(bytes, cryptoImpl),
    Promise.resolve(scanObservedRecords(bytes, profile)),
  ]);
  const structureMatches = inspection.issueCount === 0;

  return deepFreeze({
    contractVersion: PAYROLL_BANK_VALIDATION_RESULT_VERSION,
    catalogVersion: PAYROLL_BANK_PROFILE_CATALOG_VERSION,
    profileId: profile.profileId,
    scope: input.scope,
    status: structureMatches ? 'matches_observed_structure' : 'blocked_by_structure',
    structureMatches,
    generationAllowed: false,
    officialSubmissionAllowed: false,
    fieldLayoutStatus: profile.fieldLayoutStatus,
    byteLength: bytes.byteLength,
    recordCount: inspection.recordCount,
    sha256,
    diagnostics: {
      issueCount: inspection.issueCount,
      byCode: inspection.byCode,
      rows: inspection.rowDiagnostics,
      truncated: inspection.diagnosticsTruncated,
    },
    limitations: [
      'field_layout_not_homologated',
      'amount_positions_not_homologated',
      'bank_acceptance_not_proven',
      'no_transmission_performed',
    ],
  });
}

function exactInt64(value, code) {
  if (typeof value !== 'string' || !NON_NEGATIVE_INT64.test(value)) {
    fail(code, 'El importe debe expresarse como centavos enteros exactos');
  }
  let parsed;
  try {
    parsed = BigInt(value);
  } catch {
    fail(code, 'El importe debe expresarse como centavos enteros exactos');
  }
  if (parsed > MAX_INT64) fail(code, 'El importe excede el rango exacto admitido');
  return parsed;
}

/** Reconciles externally supplied control totals without parsing unapproved byte positions. */
export function reconcileBankControlTotals(input) {
  if (!hasExactKeys(input, new Set([
    'payrollRecordCount', 'bankRecordCount', 'approvedPayrollNetCents',
    'declaredBankNetCents',
  ]))
      || !Number.isSafeInteger(input.payrollRecordCount)
      || input.payrollRecordCount < 0
      || input.payrollRecordCount > PAYROLL_BANK_MAX_RECORDS
      || !Number.isSafeInteger(input.bankRecordCount)
      || input.bankRecordCount < 0
      || input.bankRecordCount > PAYROLL_BANK_MAX_RECORDS) {
    fail('BANK_RECONCILIATION_INPUT_INVALID', 'El control bancario no cumple el contrato');
  }
  const payroll = exactInt64(input.approvedPayrollNetCents, 'BANK_PAYROLL_TOTAL_INVALID');
  const bank = exactInt64(input.declaredBankNetCents, 'BANK_DECLARED_TOTAL_INVALID');
  const netDifference = bank - payroll;
  const recordDifference = input.bankRecordCount - input.payrollRecordCount;

  return deepFreeze({
    contractVersion: PAYROLL_BANK_RECONCILIATION_VERSION,
    status: netDifference === 0n && recordDifference === 0 ? 'reconciled' : 'difference_detected',
    reconciled: netDifference === 0n && recordDifference === 0,
    approvedPayrollNetCents: payroll.toString(),
    declaredBankNetCents: bank.toString(),
    bankMinusPayrollCents: netDifference.toString(),
    payrollRecordCount: input.payrollRecordCount,
    bankRecordCount: input.bankRecordCount,
    bankMinusPayrollRecords: recordDifference,
    generationAllowed: false,
    officialSubmissionAllowed: false,
  });
}

/** Intentionally fail-closed until every field and a conformity sample are approved. */
export function generateBankMonthlyArtifact(input) {
  if (!isPlainObject(input) || typeof input.profileId !== 'string') {
    fail('BANK_GENERATION_INPUT_INVALID', 'La solicitud de generacion no cumple el contrato');
  }
  profileFor(input.profileId);
  fail(
    'BANK_PROFILE_FIELD_LAYOUT_NOT_HOMOLOGATED',
    'La generacion permanece bloqueada hasta homologar el layout campo por campo',
  );
}
