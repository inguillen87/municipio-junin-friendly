export const PAYROLL_F931_PREVALIDATION_VERSION = 'payroll-f931-prevalidation.v1';
export const PAYROLL_F931_PROFILE_ID = 'f931-grh-463-crlf.observed-2026-08.v1';
export const PAYROLL_F931_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const PAYROLL_F931_MAX_RECORDS = 100000;
export const PAYROLL_F931_MAX_ISSUES = 256;

const WINDOWS_1252_UNDEFINED = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const PERIOD = /^(\d{4})-(\d{2})$/;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const observedArtifacts = {
  general: {
    sourceRef: 'f931-general-2026-08-observation-01',
    physicalRecordCount: 790,
    byteLength: 367350,
    sha256: 'sha256:e8e4815b62f489893f288e9ab944d79ef5d713844c9e49fbf397258e2f325f0f',
    nonAsciiByteCount: 51,
  },
  jurisdiction_42: {
    sourceRef: 'f931-j42-2026-08-observation-01',
    physicalRecordCount: 742,
    byteLength: 345030,
    sha256: 'sha256:6db75073ba8c7120e8fcd1f9d9db9ca30d0156f3c06f0e14c80c6d6eef00003e',
    nonAsciiByteCount: 45,
  },
  jurisdiction_55: {
    sourceRef: 'f931-j55-2026-08-observation-01',
    physicalRecordCount: 112,
    byteLength: 52080,
    sha256: 'sha256:7adde230bbefad1155fd3168611245dc5e0815e358ee66a2e333ac071fbf7246',
    nonAsciiByteCount: 9,
  },
};

export const PAYROLL_F931_OBSERVED_PROFILE = deepFreeze({
  contractVersion: PAYROLL_F931_PREVALIDATION_VERSION,
  reportId: 'REP-09',
  profileId: PAYROLL_F931_PROFILE_ID,
  format: 'fixed_width',
  recordWidthBytes: 463,
  lineEnding: 'CRLF',
  trailingLineEnding: 'required',
  bom: 'forbidden',
  encodingEvidence: 'windows-1252-compatible-bytes',
  evidenceLevel: 'physical_samples_only',
  requiredScopes: ['general', 'jurisdiction_42', 'jurisdiction_55'],
  observedPeriod: '2026-08',
  observedArtifacts,
  observedExactRowIntersections: [
    { left: 'general', right: 'jurisdiction_42', count: 679 },
    { left: 'general', right: 'jurisdiction_55', count: 48 },
    { left: 'jurisdiction_42', right: 'jurisdiction_55', count: 0 },
  ],
  fieldManifest: [{
    fieldId: 'unmapped_f931_record',
    startByte: 1,
    endByte: 463,
    status: 'unknown',
  }],
  semanticMappingComplete: false,
  populationFiltersVerified: false,
  homologated: false,
  generationAllowed: false,
  officialSubmissionAllowed: false,
  unknownRequirements: [
    'current_official_layout_and_effective_date',
    'field_boundaries_meanings_padding_and_alignment',
    'person_and_liquidation_business_keys',
    'monthly_and_supplementary_inclusion_rules',
    'three_output_population_semantics',
    'jurisdiction_42_and_55_filter_contract',
    'amount_fields_rounding_and_control_totals',
    'approved_file_naming_and_transport',
    'accounting_owner_and_maker_checker_roles',
    'human_submission_and_acknowledgement_procedure',
    'retention_privacy_and_access_policy',
  ],
});

export class PayrollF931PrevalidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollF931PrevalidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollF931PrevalidationError(code, message);
}

function normalizeBytes(value) {
  if (!(value instanceof Uint8Array)) {
    fail('F931_SOURCE_BYTES_INVALID', 'La salida F.931 debe recibirse como bytes');
  }
  if (value.byteLength === 0) fail('F931_SOURCE_EMPTY', 'La salida F.931 está vacía');
  if (value.byteLength > PAYROLL_F931_MAX_SOURCE_BYTES) {
    fail('F931_SOURCE_TOO_LARGE', 'La salida F.931 supera el límite seguro de validación');
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function normalizeProfileId(value) {
  if (value !== PAYROLL_F931_PROFILE_ID) {
    fail('F931_PROFILE_UNKNOWN', 'El perfil F.931 no pertenece al catálogo observado');
  }
  return value;
}

function normalizeScope(value) {
  if (!PAYROLL_F931_OBSERVED_PROFILE.requiredScopes.includes(value)) {
    fail('F931_SCOPE_UNKNOWN', 'El ámbito F.931 no pertenece al paquete observado');
  }
  return value;
}

function normalizeExpectedRecordCount(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > PAYROLL_F931_MAX_RECORDS) {
    fail('F931_EXPECTED_RECORD_COUNT_INVALID', 'La cantidad esperada no cumple el contrato');
  }
  return value;
}

function normalizeExpectedSha256(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail('F931_EXPECTED_SHA256_INVALID', 'La huella esperada no cumple el contrato SHA-256');
  }
  return value;
}

function normalizePeriod(value) {
  if (typeof value !== 'string') fail('F931_PERIOD_INVALID', 'El período debe expresarse como AAAA-MM');
  const match = PERIOD.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    fail('F931_PERIOD_INVALID', 'El período debe expresarse como AAAA-MM');
  }
  return value;
}

function appendIssue(state, line, code) {
  state.issueCount += 1;
  if (state.issues.length < PAYROLL_F931_MAX_ISSUES) state.issues.push({ line, code });
}

function splitPhysicalRecords(bytes, state) {
  const records = [];
  let start = 0;
  let line = 1;

  for (let index = 0; index < bytes.byteLength; index += 1) {
    const byte = bytes[index];
    if (byte === 0x0d) {
      if (bytes[index + 1] !== 0x0a) {
        appendIssue(state, line, 'F931_BARE_CR');
        continue;
      }
      records.push({ line, start, end: index, terminatedByCrlf: true });
      if (records.length > PAYROLL_F931_MAX_RECORDS) {
        fail('F931_TOO_MANY_RECORDS', 'La salida F.931 supera el límite seguro de registros');
      }
      index += 1;
      start = index + 1;
      line += 1;
      continue;
    }
    if (byte === 0x0a) {
      appendIssue(state, line, 'F931_BARE_LF');
      records.push({ line, start, end: index, terminatedByCrlf: false });
      if (records.length > PAYROLL_F931_MAX_RECORDS) {
        fail('F931_TOO_MANY_RECORDS', 'La salida F.931 supera el límite seguro de registros');
      }
      start = index + 1;
      line += 1;
    }
  }

  if (start < bytes.byteLength) records.push({ line, start, end: bytes.byteLength, terminatedByCrlf: false });
  if (records.length === 0) fail('F931_SOURCE_EMPTY', 'La salida F.931 no contiene registros');
  return records;
}

function validateRecordBytes(bytes, record, state) {
  let controlReported = false;
  let undefinedReported = false;
  for (let index = record.start; index < record.end; index += 1) {
    const byte = bytes[index];
    if (!undefinedReported && WINDOWS_1252_UNDEFINED.has(byte)) {
      appendIssue(state, record.line, 'F931_WINDOWS_1252_UNDEFINED_BYTE');
      undefinedReported = true;
    }
    if (!controlReported && (byte < 0x20 || byte === 0x7f)) {
      appendIssue(state, record.line, 'F931_CONTROL_BYTE_NOT_ALLOWED');
      controlReported = true;
    }
  }
}

async function sha256Bytes(bytes, cryptoImpl) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.subtle.digest !== 'function') {
    fail('F931_CRYPTO_UNAVAILABLE', 'No hay un motor criptográfico disponible');
  }
  let digest;
  try {
    digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  } catch {
    fail('F931_CRYPTO_FAILED', 'No se pudo identificar la salida F.931');
  }
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function prevalidatePayrollF931Artifact(
  { profileId = PAYROLL_F931_PROFILE_ID, scope, bytes, expectedRecordCount, expectedSha256 } = {},
  { cryptoImpl = globalThis.crypto } = {},
) {
  normalizeProfileId(profileId);
  const normalizedScope = normalizeScope(scope);
  const source = normalizeBytes(bytes);
  const expectedCount = normalizeExpectedRecordCount(expectedRecordCount);
  const expectedHash = normalizeExpectedSha256(expectedSha256);
  const state = { issueCount: 0, issues: [] };

  if (source.byteLength >= 3 && source[0] === 0xef && source[1] === 0xbb && source[2] === 0xbf) {
    appendIssue(state, 1, 'F931_BOM_NOT_ALLOWED');
  }

  const records = splitPhysicalRecords(source, state);
  for (const record of records) {
    if (record.end - record.start !== PAYROLL_F931_OBSERVED_PROFILE.recordWidthBytes) {
      appendIssue(state, record.line, 'F931_RECORD_WIDTH_MISMATCH');
    }
    if (!record.terminatedByCrlf) appendIssue(state, record.line, 'F931_CRLF_REQUIRED');
    validateRecordBytes(source, record, state);
  }
  if (expectedCount !== null && records.length !== expectedCount) {
    appendIssue(state, null, 'F931_RECORD_COUNT_MISMATCH');
  }

  const rawSha256 = await sha256Bytes(source, cryptoImpl);
  if (expectedHash !== null && rawSha256 !== expectedHash) {
    appendIssue(state, null, 'F931_SHA256_MISMATCH');
  }
  const observed = PAYROLL_F931_OBSERVED_PROFILE.observedArtifacts[normalizedScope];

  return deepFreeze({
    contractVersion: PAYROLL_F931_PREVALIDATION_VERSION,
    profileId,
    scope: normalizedScope,
    status: state.issueCount === 0
      ? 'valid_observed_structure_unmapped'
      : 'invalid_structure',
    byteLength: source.byteLength,
    rawSha256,
    physicalRecordCount: records.length,
    expectedRecordCount: expectedCount,
    expectedSha256: expectedHash,
    recordWidthBytes: PAYROLL_F931_OBSERVED_PROFILE.recordWidthBytes,
    lineEnding: 'CRLF',
    trailingLineEnding: 'required',
    bom: 'forbidden',
    encodingEvidence: 'windows-1252-compatible-bytes',
    issueCount: state.issueCount,
    issuesTruncated: state.issueCount > state.issues.length,
    issues: state.issues,
    observedSampleMatch: rawSha256 === observed.sha256,
    semanticMappingComplete: false,
    populationFilterVerified: false,
    reconciliation: {
      status: 'not_computed',
      reasonCode: 'F931_FIELDS_AND_TOTALS_UNMAPPED',
    },
    generationAllowed: false,
    officialSubmissionAllowed: false,
    homologated: false,
    sourceValuesIncluded: false,
    persistencePerformed: false,
    networkPerformed: false,
  });
}

export async function prevalidatePayrollF931Package(
  { profileId = PAYROLL_F931_PROFILE_ID, period, artifacts } = {},
  { cryptoImpl = globalThis.crypto } = {},
) {
  normalizeProfileId(profileId);
  const normalizedPeriod = normalizePeriod(period);
  if (!Array.isArray(artifacts) || artifacts.length < 1 || artifacts.length > 6) {
    fail('F931_PACKAGE_ARTIFACTS_INVALID', 'El paquete F.931 debe contener entre uno y seis artefactos declarados');
  }

  const results = await Promise.all(artifacts.map((artifact) => prevalidatePayrollF931Artifact(
    { profileId, ...artifact },
    { cryptoImpl },
  )));
  const issues = [];
  if (artifacts.length !== PAYROLL_F931_OBSERVED_PROFILE.requiredScopes.length) {
    issues.push({ code: 'F931_PACKAGE_ARTIFACT_COUNT_MISMATCH' });
  }

  for (const scope of PAYROLL_F931_OBSERVED_PROFILE.requiredScopes) {
    const matches = results.filter((result) => result.scope === scope);
    if (matches.length === 0) issues.push({ code: 'F931_PACKAGE_SCOPE_MISSING', scope });
    if (matches.length > 1) issues.push({ code: 'F931_PACKAGE_SCOPE_DUPLICATED', scope });
  }

  const scopesByHash = new Map();
  for (const result of results) {
    const seen = scopesByHash.get(result.rawSha256) ?? [];
    seen.push(result.scope);
    scopesByHash.set(result.rawSha256, seen);
  }
  for (const scopes of scopesByHash.values()) {
    if (new Set(scopes).size > 1) {
      issues.push({ code: 'F931_PACKAGE_ARTIFACT_REUSED_ACROSS_SCOPES', scopes: [...new Set(scopes)].sort() });
    }
  }

  const artifactInvalid = results.some((result) => result.status === 'invalid_structure');
  const packageInvalid = artifactInvalid || issues.some((issue) => (
    issue.code !== 'F931_PACKAGE_ARTIFACT_REUSED_ACROSS_SCOPES'
  ));
  const packageRequiresReview = !packageInvalid && issues.length > 0;
  const summaries = results.map((result) => ({
    scope: result.scope,
    status: result.status,
    byteLength: result.byteLength,
    physicalRecordCount: result.physicalRecordCount,
    rawSha256: result.rawSha256,
    issueCount: result.issueCount,
    issuesTruncated: result.issuesTruncated,
    issues: result.issues,
    observedSampleMatch: result.observedSampleMatch,
  }));

  return deepFreeze({
    contractVersion: PAYROLL_F931_PREVALIDATION_VERSION,
    profileId,
    period: normalizedPeriod,
    status: packageInvalid
      ? 'invalid_package_structure'
      : packageRequiresReview
        ? 'requires_review'
        : 'structurally_valid_unmapped',
    artifactCount: results.length,
    physicalRecordCountSum: results.reduce((sum, result) => sum + result.physicalRecordCount, 0),
    physicalRecordCountSumIsDistinctPopulation: false,
    artifacts: summaries,
    issues,
    referenceSampleSetMatch: normalizedPeriod === PAYROLL_F931_OBSERVED_PROFILE.observedPeriod
      && results.length === PAYROLL_F931_OBSERVED_PROFILE.requiredScopes.length
      && results.every((result) => result.observedSampleMatch)
      && issues.length === 0,
    populationRelationship: {
      status: 'unmapped_not_reconciled',
      partitionAssumed: false,
      exactRowOverlapCalculatedForInput: false,
      reasonCode: 'F931_THREE_OUTPUT_SEMANTICS_UNMAPPED',
    },
    semanticMappingComplete: false,
    reconciliationComplete: false,
    readyForGeneration: false,
    readyForOfficialSubmission: false,
    homologated: false,
    sourceValuesIncluded: false,
    persistencePerformed: false,
    networkPerformed: false,
  });
}

export function diagnosePayrollF931Profile(profileId = PAYROLL_F931_PROFILE_ID) {
  normalizeProfileId(profileId);
  return deepFreeze({
    contractVersion: PAYROLL_F931_PREVALIDATION_VERSION,
    profileId,
    status: 'blocked',
    reasonCode: 'F931_LAYOUT_AND_POPULATIONS_UNMAPPED',
    verifiedPhysicalProperties: {
      recordWidthBytes: PAYROLL_F931_OBSERVED_PROFILE.recordWidthBytes,
      lineEnding: PAYROLL_F931_OBSERVED_PROFILE.lineEnding,
      trailingLineEnding: PAYROLL_F931_OBSERVED_PROFILE.trailingLineEnding,
      bom: PAYROLL_F931_OBSERVED_PROFILE.bom,
      requiredScopes: PAYROLL_F931_OBSERVED_PROFILE.requiredScopes,
    },
    fieldManifest: PAYROLL_F931_OBSERVED_PROFILE.fieldManifest,
    missingEvidence: PAYROLL_F931_OBSERVED_PROFILE.unknownRequirements,
    generationAllowed: false,
    officialSubmissionAllowed: false,
    homologated: false,
  });
}

export function generatePayrollF931Artifacts({ profileId = PAYROLL_F931_PROFILE_ID } = {}) {
  normalizeProfileId(profileId);
  fail(
    'F931_GENERATION_BLOCKED_LAYOUT_UNMAPPED',
    'La evidencia permite prevalidar la estructura, pero no generar campos F.931',
  );
}

export function submitPayrollF931Package({ profileId = PAYROLL_F931_PROFILE_ID } = {}) {
  normalizeProfileId(profileId);
  fail(
    'F931_SUBMISSION_BLOCKED_NO_AUTHORIZED_CHANNEL',
    'No existe un canal de presentación automática autorizado y homologado',
  );
}
