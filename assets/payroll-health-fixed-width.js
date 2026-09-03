export const PAYROLL_HEALTH_FIXED_WIDTH_CONTRACT_VERSION = 'payroll-health-fixed-width-validation.v1';
export const PAYROLL_HEALTH_FIXED_WIDTH_MAX_BYTES = 8 * 1024 * 1024;
export const PAYROLL_HEALTH_FIXED_WIDTH_MAX_RECORDS = 100000;
export const PAYROLL_HEALTH_FIXED_WIDTH_MAX_ISSUES = 256;

const MAX_INT64 = 9223372036854775807n;
const MIN_INT64 = -9223372036854775808n;
const EXACT_CENTS = /^(?:0|-?[1-9][0-9]{0,18})$/;
const WINDOWS_1252_UNDEFINED = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

const rawProfiles = {
  'osep-185-crlf.v1': {
    organization: 'OSEP',
    detailWidthBytes: 185,
    terminalRecord: null,
    observations: [{
      sourceRef: 'osep-185-observation-01',
      detailRecords: 759,
      totalBytes: 141933,
      sha256: 'sha256:f2817814359f6e3f49f80f97c51dc8a2f4d66f6edcf93135544f041dd09c8e2d',
    }],
  },
  'osep-206-crlf.v1': {
    organization: 'OSEP',
    detailWidthBytes: 206,
    terminalRecord: null,
    observations: [{
      sourceRef: 'osep-206-observation-01',
      detailRecords: 111,
      totalBytes: 23088,
      sha256: 'sha256:68f5c002e25a06f11c5b71bcccb93c01eb030fb3d11766e0c4a743ab0ebdb1ea',
    }],
  },
  'osep-206-tab-footer25.v1': {
    organization: 'OSEP',
    detailWidthBytes: 206,
    terminalRecord: {
      widthBytes: 25,
      terminatedByCrlf: false,
      byte: 0x09,
      count: 24,
      finalByte: 0x20,
      status: 'observed_not_semantically_identified',
    },
    observations: [{
      sourceRef: 'osep-206-observation-02',
      detailRecords: 731,
      terminalRecords: 1,
      totalBytes: 152073,
      sha256: 'sha256:b849e4ab0ca03ac1d56e071c8050ef6675834c7c43c1ef081304966146047c47',
    }],
  },
  'seguro-mutual-121-crlf.v1': {
    organization: 'SEGURO_MUTUAL',
    detailWidthBytes: 121,
    terminalRecord: null,
    observations: [
      {
        sourceRef: 'mutual-121-observation-01',
        detailRecords: 672,
        totalBytes: 82656,
        sha256: 'sha256:7d0659b7ce411b6ff1201490e178537e9f8823969d13f0753cadf62c4d1c66c7',
      },
      {
        sourceRef: 'mutual-121-observation-02',
        detailRecords: 107,
        totalBytes: 13161,
        sha256: 'sha256:9dcf67399bb2202706a0701d9a74fa7193f95e5169b24e13ce59317995583f20',
      },
    ],
  },
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function publicProfile(profileId, profile) {
  return {
    profileId,
    organization: profile.organization,
    version: 1,
    format: 'fixed_width',
    encoding: 'windows-1252',
    bom: 'forbidden',
    lineEnding: 'CRLF',
    evidenceLevel: 'physical_sample_only',
    semanticStatus: 'unmapped',
    detailWidthBytes: profile.detailWidthBytes,
    terminalRecord: profile.terminalRecord,
    fieldManifest: [{
      fieldId: 'unmapped_detail_record',
      startByte: 1,
      endByte: profile.detailWidthBytes,
      status: 'unknown',
    }],
    unknownFieldRequirements: [
      'field_boundaries',
      'field_meanings',
      'padding_and_alignment',
      'date_and_decimal_formats',
      'amount_field_positions',
      'jurisdiction_filter_contract',
      'official_file_naming',
    ],
    fieldMappingComplete: false,
    generationAllowed: false,
    officialSubmissionAllowed: false,
    homologated: false,
    evidence: profile.observations,
  };
}

export const PAYROLL_HEALTH_FIXED_WIDTH_PROFILES = deepFreeze(Object.fromEntries(
  Object.entries(rawProfiles).map(([profileId, profile]) => [
    profileId,
    publicProfile(profileId, profile),
  ]),
));

export class PayrollHealthFixedWidthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollHealthFixedWidthError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollHealthFixedWidthError(code, message);
}

function normalizeBytes(value) {
  if (!(value instanceof Uint8Array)) {
    fail('HEALTH_SOURCE_BYTES_INVALID', 'La salida debe recibirse como Uint8Array');
  }
  if (value.byteLength === 0) fail('HEALTH_SOURCE_EMPTY', 'La salida está vacía');
  if (value.byteLength > PAYROLL_HEALTH_FIXED_WIDTH_MAX_BYTES) {
    fail('HEALTH_SOURCE_TOO_LARGE', 'La salida supera el límite seguro de validación');
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function resolveProfile(profileId) {
  if (typeof profileId !== 'string' || !Object.hasOwn(rawProfiles, profileId)) {
    fail('HEALTH_PROFILE_UNKNOWN', 'El perfil no pertenece al catálogo observado');
  }
  return { internal: rawProfiles[profileId], public: PAYROLL_HEALTH_FIXED_WIDTH_PROFILES[profileId] };
}

function normalizeExpectedRecordCount(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > PAYROLL_HEALTH_FIXED_WIDTH_MAX_RECORDS) {
    fail('HEALTH_EXPECTED_RECORD_COUNT_INVALID', 'La cantidad esperada no cumple el contrato');
  }
  return value;
}

function appendIssue(state, line, code) {
  state.issueCount += 1;
  if (state.issues.length < PAYROLL_HEALTH_FIXED_WIDTH_MAX_ISSUES) {
    state.issues.push({ line, code });
  }
}

function splitPhysicalRecords(bytes, state) {
  const records = [];
  let start = 0;
  let line = 1;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0x0d) {
      if (bytes[index + 1] !== 0x0a) {
        appendIssue(state, line, 'HEALTH_BARE_CR');
        continue;
      }
      records.push({ line, start, end: index, terminatedByCrlf: true });
      if (records.length > PAYROLL_HEALTH_FIXED_WIDTH_MAX_RECORDS + 1) {
        fail('HEALTH_TOO_MANY_RECORDS', 'La salida supera el límite seguro de registros');
      }
      index += 1;
      start = index + 1;
      line += 1;
    } else if (bytes[index] === 0x0a) {
      appendIssue(state, line, 'HEALTH_BARE_LF');
      records.push({ line, start, end: index, terminatedByCrlf: false });
      if (records.length > PAYROLL_HEALTH_FIXED_WIDTH_MAX_RECORDS + 1) {
        fail('HEALTH_TOO_MANY_RECORDS', 'La salida supera el límite seguro de registros');
      }
      start = index + 1;
      line += 1;
    }
  }
  if (start < bytes.length) {
    records.push({ line, start, end: bytes.length, terminatedByCrlf: false });
  }
  if (records.length === 0) fail('HEALTH_SOURCE_EMPTY', 'La salida no contiene registros');
  return records;
}

function validateWindows1252(bytes, record, state, { allowTabs = false } = {}) {
  for (let index = record.start; index < record.end; index += 1) {
    const byte = bytes[index];
    if (WINDOWS_1252_UNDEFINED.has(byte)) {
      appendIssue(state, record.line, 'HEALTH_WINDOWS_1252_UNDEFINED_BYTE');
      return;
    }
    if (byte === 0x7f || byte < 0x20) {
      if (allowTabs && byte === 0x09) continue;
      appendIssue(state, record.line, 'HEALTH_CONTROL_BYTE_NOT_ALLOWED');
      return;
    }
  }
}

function validateTerminalRecord(bytes, record, terminal, state) {
  const width = record.end - record.start;
  if (width !== terminal.widthBytes) {
    appendIssue(state, record.line, 'HEALTH_TERMINAL_WIDTH_MISMATCH');
    return;
  }
  if (record.terminatedByCrlf !== terminal.terminatedByCrlf) {
    appendIssue(state, record.line, 'HEALTH_TERMINAL_ENDING_MISMATCH');
  }
  let matchingBytes = 0;
  for (let index = record.start; index < record.end; index += 1) {
    if (bytes[index] === terminal.byte) matchingBytes += 1;
  }
  if (matchingBytes !== terminal.count || bytes[record.end - 1] !== terminal.finalByte) {
    appendIssue(state, record.line, 'HEALTH_TERMINAL_PATTERN_MISMATCH');
  }
  validateWindows1252(bytes, record, state, { allowTabs: true });
}

async function sha256Bytes(bytes, cryptoImpl) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.subtle.digest !== 'function') {
    fail('HEALTH_CRYPTO_UNAVAILABLE', 'No hay un motor criptográfico disponible');
  }
  let digest;
  try {
    digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  } catch {
    fail('HEALTH_CRYPTO_FAILED', 'No se pudo calcular la huella de la salida');
  }
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function reconcilePayrollHealthCents({ expectedCents, artifactCents }) {
  const parse = (value) => {
    if (typeof value !== 'string' || !EXACT_CENTS.test(value)) {
      fail('HEALTH_CENTS_INVALID', 'Los importes deben expresarse como centavos enteros canónicos');
    }
    const parsed = BigInt(value);
    if (parsed < MIN_INT64 || parsed > MAX_INT64) {
      fail('HEALTH_CENTS_OUT_OF_RANGE', 'El importe excede el rango exacto admitido');
    }
    return parsed;
  };
  const expected = parse(expectedCents);
  const artifact = parse(artifactCents);
  const difference = artifact - expected;
  if (difference < MIN_INT64 || difference > MAX_INT64) {
    fail('HEALTH_CENTS_OUT_OF_RANGE', 'La diferencia excede el rango exacto admitido');
  }
  return deepFreeze({
    expectedCents: expected.toString(),
    artifactCents: artifact.toString(),
    differenceCents: difference.toString(),
    reconciled: difference === 0n,
  });
}

export async function validatePayrollHealthFixedWidth(
  source,
  { profileId, expectedRecordCount, cryptoImpl = globalThis.crypto } = {},
) {
  const bytes = normalizeBytes(source);
  const expected = normalizeExpectedRecordCount(expectedRecordCount);
  const profile = resolveProfile(profileId);
  const state = { issues: [], issueCount: 0 };

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    appendIssue(state, 1, 'HEALTH_BOM_NOT_ALLOWED');
  }
  const records = splitPhysicalRecords(bytes, state);
  let detailRecords = records;
  let terminalRecordCount = 0;
  if (profile.internal.terminalRecord) {
    const terminal = records.at(-1);
    terminalRecordCount = 1;
    detailRecords = records.slice(0, -1);
    validateTerminalRecord(bytes, terminal, profile.internal.terminalRecord, state);
  }

  if (detailRecords.length > PAYROLL_HEALTH_FIXED_WIDTH_MAX_RECORDS) {
    fail('HEALTH_TOO_MANY_RECORDS', 'La salida supera el límite seguro de registros');
  }

  if (detailRecords.length === 0) appendIssue(state, 1, 'HEALTH_DETAIL_RECORD_REQUIRED');
  for (const record of detailRecords) {
    if (record.end - record.start !== profile.internal.detailWidthBytes) {
      appendIssue(state, record.line, 'HEALTH_DETAIL_WIDTH_MISMATCH');
    }
    if (!record.terminatedByCrlf) appendIssue(state, record.line, 'HEALTH_CRLF_REQUIRED');
    validateWindows1252(bytes, record, state);
  }
  if (expected !== null && expected !== detailRecords.length) {
    appendIssue(state, null, 'HEALTH_RECORD_COUNT_MISMATCH');
  }

  const rawSha256 = await sha256Bytes(bytes, cryptoImpl);
  return deepFreeze({
    contractVersion: PAYROLL_HEALTH_FIXED_WIDTH_CONTRACT_VERSION,
    profileId,
    organization: profile.public.organization,
    status: state.issueCount === 0 ? 'valid_structure' : 'invalid_structure',
    byteLength: bytes.byteLength,
    rawSha256,
    lineEnding: 'CRLF',
    encoding: 'windows-1252',
    detailWidthBytes: profile.public.detailWidthBytes,
    detailRecordCount: detailRecords.length,
    terminalRecordCount,
    expectedRecordCount: expected,
    issueCount: state.issueCount,
    issuesTruncated: state.issueCount > state.issues.length,
    issues: state.issues,
    fieldMappingComplete: false,
    amountReconciliation: {
      status: 'not_computed',
      reasonCode: 'HEALTH_AMOUNT_FIELDS_UNMAPPED',
    },
    generationAllowed: false,
    officialSubmissionAllowed: false,
    homologated: false,
    sourceValuesIncluded: false,
    persistencePerformed: false,
  });
}

export function diagnosePayrollHealthProfile(profileId) {
  const profile = resolveProfile(profileId).public;
  return deepFreeze({
    contractVersion: PAYROLL_HEALTH_FIXED_WIDTH_CONTRACT_VERSION,
    profileId,
    status: 'blocked',
    reasonCode: 'HEALTH_FIELDS_UNMAPPED',
    evidenceLevel: profile.evidenceLevel,
    detailWidthBytes: profile.detailWidthBytes,
    terminalRecord: profile.terminalRecord,
    fieldManifest: profile.fieldManifest,
    missingEvidence: profile.unknownFieldRequirements,
    generationAllowed: false,
    officialSubmissionAllowed: false,
    homologated: false,
  });
}

export function generatePayrollHealthFixedWidth({ profileId } = {}) {
  const profile = resolveProfile(profileId).public;
  if (!profile.fieldMappingComplete || !profile.generationAllowed) {
    fail(
      'HEALTH_GENERATION_BLOCKED_FIELDS_UNMAPPED',
      'La evidencia confirma la estructura física, pero no la semántica completa de campos',
    );
  }
  fail('HEALTH_GENERATION_NOT_IMPLEMENTED', 'No existe un perfil generador homologado');
}
