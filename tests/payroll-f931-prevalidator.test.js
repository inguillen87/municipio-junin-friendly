import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_F931_MAX_ISSUES,
  PAYROLL_F931_MAX_SOURCE_BYTES,
  PAYROLL_F931_OBSERVED_PROFILE,
  PAYROLL_F931_PREVALIDATION_VERSION,
  PAYROLL_F931_PROFILE_ID,
  PayrollF931PrevalidationError,
  diagnosePayrollF931Profile,
  generatePayrollF931Artifacts,
  prevalidatePayrollF931Artifact,
  prevalidatePayrollF931Package,
  submitPayrollF931Package,
} from '../assets/payroll-f931-prevalidator.js';

function row(fill = 0x41) {
  return new Uint8Array(463).fill(fill);
}

function crlf(records, { finalCrlf = true } = {}) {
  const total = records.reduce((sum, record) => sum + record.byteLength, 0)
    + Math.max(0, records.length - 1) * 2
    + (finalCrlf ? 2 : 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (let index = 0; index < records.length; index += 1) {
    result.set(records[index], offset);
    offset += records[index].byteLength;
    if (index < records.length - 1 || finalCrlf) {
      result[offset] = 0x0d;
      result[offset + 1] = 0x0a;
      offset += 2;
    }
  }
  return result;
}

function withBom(bytes) {
  const result = new Uint8Array(bytes.byteLength + 3);
  result.set([0xef, 0xbb, 0xbf]);
  result.set(bytes, 3);
  return result;
}

function hasCode(code) {
  return (error) => error instanceof PayrollF931PrevalidationError && error.code === code;
}

test('publica sólo la evidencia física observada y mantiene F.931 cerrado', () => {
  assert.equal(PAYROLL_F931_OBSERVED_PROFILE.contractVersion, PAYROLL_F931_PREVALIDATION_VERSION);
  assert.equal(PAYROLL_F931_OBSERVED_PROFILE.reportId, 'REP-09');
  assert.equal(PAYROLL_F931_OBSERVED_PROFILE.profileId, PAYROLL_F931_PROFILE_ID);
  assert.equal(PAYROLL_F931_OBSERVED_PROFILE.recordWidthBytes, 463);
  assert.equal(PAYROLL_F931_OBSERVED_PROFILE.lineEnding, 'CRLF');
  assert.deepEqual(PAYROLL_F931_OBSERVED_PROFILE.requiredScopes, [
    'general', 'jurisdiction_42', 'jurisdiction_55',
  ]);
  assert.deepEqual(
    Object.values(PAYROLL_F931_OBSERVED_PROFILE.observedArtifacts)
      .map((artifact) => artifact.physicalRecordCount),
    [790, 742, 112],
  );
  assert.deepEqual(
    PAYROLL_F931_OBSERVED_PROFILE.observedExactRowIntersections.map((item) => item.count),
    [679, 48, 0],
  );
  assert.equal(PAYROLL_F931_OBSERVED_PROFILE.semanticMappingComplete, false);
  assert.equal(PAYROLL_F931_OBSERVED_PROFILE.populationFiltersVerified, false);
  assert.equal(PAYROLL_F931_OBSERVED_PROFILE.homologated, false);
  assert.equal(PAYROLL_F931_OBSERVED_PROFILE.generationAllowed, false);
  assert.equal(PAYROLL_F931_OBSERVED_PROFILE.officialSubmissionAllowed, false);
  assert.equal(Object.isFrozen(PAYROLL_F931_OBSERVED_PROFILE), true);
  assert.equal(Object.isFrozen(PAYROLL_F931_OBSERVED_PROFILE.observedArtifacts.general), true);
});

test('contrato JSON conserva hashes, anchos y frontera de homologación sin valores fuente', () => {
  const contract = JSON.parse(fs.readFileSync(
    new URL('../contracts/payroll-f931-evidence.v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(contract.contractVersion, PAYROLL_F931_PREVALIDATION_VERSION);
  assert.equal(contract.profileId, PAYROLL_F931_PROFILE_ID);
  assert.equal(contract.physicalLayout.recordWidthBytes, 463);
  assert.equal(contract.physicalLayout.lineEnding, 'CRLF');
  assert.equal(contract.observedArtifacts.general.physicalRecordCount, 790);
  assert.equal(contract.observedArtifacts.jurisdiction_42.physicalRecordCount, 742);
  assert.equal(contract.observedArtifacts.jurisdiction_55.physicalRecordCount, 112);
  assert.equal(contract.populationRelationship.partitionAssumed, false);
  assert.equal(contract.semanticMappingComplete, false);
  assert.equal(contract.generationAllowed, false);
  assert.equal(contract.officialSubmissionAllowed, false);
  assert.doesNotMatch(JSON.stringify(contract), /@[a-z]|(?:\b\d{11}\b)|cbu|apellido|legajo/i);
});

test('prevalida 463 bytes, CRLF final y Windows-1252 compatible sin devolver registros', async () => {
  const second = row(0x20);
  second[15] = 0xd1;
  const bytes = crlf([row(), second]);
  const result = await prevalidatePayrollF931Artifact({
    scope: 'general',
    bytes,
    expectedRecordCount: 2,
    expectedSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  }, { cryptoImpl: webcrypto });

  assert.equal(result.status, 'valid_observed_structure_unmapped');
  assert.equal(result.physicalRecordCount, 2);
  assert.equal(result.recordWidthBytes, 463);
  assert.equal(result.issueCount, 0);
  assert.equal(result.rawSha256, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
  assert.equal(result.observedSampleMatch, false);
  assert.equal(result.reconciliation.status, 'not_computed');
  assert.equal(result.reconciliation.reasonCode, 'F931_FIELDS_AND_TOTALS_UNMAPPED');
  assert.equal(result.sourceValuesIncluded, false);
  assert.equal(result.generationAllowed, false);
  assert.equal(result.officialSubmissionAllowed, false);
  assert.doesNotMatch(JSON.stringify(result), /A{20}|Ñ/);
  assert.equal(Object.isFrozen(result), true);
});

test('detecta BOM, LF, ancho, controles, byte indefinido, conteo y hash sin filtrar contenido', async () => {
  const secret = new TextEncoder().encode('PERSONA-PRIVADA-998877');
  const invalid = row();
  invalid.set(secret, 0);
  invalid[30] = 0x00;
  invalid[31] = 0x81;
  const lfOnly = invalid.subarray(0, 462);
  const body = new Uint8Array(lfOnly.byteLength + 1);
  body.set(lfOnly);
  body[body.byteLength - 1] = 0x0a;

  const result = await prevalidatePayrollF931Artifact({
    scope: 'jurisdiction_42',
    bytes: withBom(body),
    expectedRecordCount: 2,
    expectedSha256: `sha256:${'0'.repeat(64)}`,
  }, { cryptoImpl: webcrypto });

  assert.equal(result.status, 'invalid_structure');
  assert.deepEqual(result.issues, [
    { line: 1, code: 'F931_BOM_NOT_ALLOWED' },
    { line: 1, code: 'F931_BARE_LF' },
    { line: 1, code: 'F931_RECORD_WIDTH_MISMATCH' },
    { line: 1, code: 'F931_CRLF_REQUIRED' },
    { line: 1, code: 'F931_CONTROL_BYTE_NOT_ALLOWED' },
    { line: 1, code: 'F931_WINDOWS_1252_UNDEFINED_BYTE' },
    { line: null, code: 'F931_RECORD_COUNT_MISMATCH' },
    { line: null, code: 'F931_SHA256_MISMATCH' },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /PERSONA-PRIVADA|998877/);
});

test('arma el paquete de tres ámbitos sin sumar poblaciones como personas ni habilitar salida', async () => {
  const packageResult = await prevalidatePayrollF931Package({
    period: '2026-09',
    artifacts: [
      { scope: 'general', bytes: crlf([row(0x41), row(0x42)]) },
      { scope: 'jurisdiction_42', bytes: crlf([row(0x43)]) },
      { scope: 'jurisdiction_55', bytes: crlf([row(0x44)]) },
    ],
  }, { cryptoImpl: webcrypto });

  assert.equal(packageResult.status, 'structurally_valid_unmapped');
  assert.equal(packageResult.artifactCount, 3);
  assert.equal(packageResult.physicalRecordCountSum, 4);
  assert.equal(packageResult.physicalRecordCountSumIsDistinctPopulation, false);
  assert.equal(packageResult.populationRelationship.partitionAssumed, false);
  assert.equal(packageResult.populationRelationship.exactRowOverlapCalculatedForInput, false);
  assert.equal(packageResult.referenceSampleSetMatch, false);
  assert.equal(packageResult.semanticMappingComplete, false);
  assert.equal(packageResult.reconciliationComplete, false);
  assert.equal(packageResult.readyForGeneration, false);
  assert.equal(packageResult.readyForOfficialSubmission, false);
  assert.equal(packageResult.sourceValuesIncluded, false);
  assert.deepEqual(packageResult.issues, []);
});

test('informa ámbitos faltantes, duplicados y reutilización de bytes entre salidas', async () => {
  const reused = crlf([row(0x41)]);
  const result = await prevalidatePayrollF931Package({
    period: '2026-08',
    artifacts: [
      { scope: 'general', bytes: reused },
      { scope: 'general', bytes: crlf([row(0x42)]) },
      { scope: 'jurisdiction_42', bytes: reused },
    ],
  }, { cryptoImpl: webcrypto });

  assert.equal(result.status, 'invalid_package_structure');
  assert.deepEqual(result.issues, [
    { code: 'F931_PACKAGE_SCOPE_DUPLICATED', scope: 'general' },
    { code: 'F931_PACKAGE_SCOPE_MISSING', scope: 'jurisdiction_55' },
    {
      code: 'F931_PACKAGE_ARTIFACT_REUSED_ACROSS_SCOPES',
      scopes: ['general', 'jurisdiction_42'],
    },
  ]);
});

test('límites y entradas ambiguas fallan cerrados', async () => {
  await assert.rejects(
    prevalidatePayrollF931Artifact({
      scope: 'general',
      bytes: new Uint8Array(PAYROLL_F931_MAX_SOURCE_BYTES + 1),
    }, { cryptoImpl: webcrypto }),
    hasCode('F931_SOURCE_TOO_LARGE'),
  );
  await assert.rejects(
    prevalidatePayrollF931Artifact({ scope: 'inventado', bytes: row() }, { cryptoImpl: webcrypto }),
    hasCode('F931_SCOPE_UNKNOWN'),
  );
  await assert.rejects(
    prevalidatePayrollF931Package({ period: '2026-13', artifacts: [] }, { cryptoImpl: webcrypto }),
    hasCode('F931_PERIOD_INVALID'),
  );
  const invalidRows = Array.from({ length: PAYROLL_F931_MAX_ISSUES + 10 }, () => row(0x00));
  const result = await prevalidatePayrollF931Artifact({
    scope: 'general',
    bytes: crlf(invalidRows),
  }, { cryptoImpl: webcrypto });
  assert.equal(result.issueCount, invalidRows.length);
  assert.equal(result.issues.length, PAYROLL_F931_MAX_ISSUES);
  assert.equal(result.issuesTruncated, true);
});

test('diagnóstico, generación y presentación quedan bloqueados explícitamente', () => {
  const diagnosis = diagnosePayrollF931Profile();
  assert.equal(diagnosis.status, 'blocked');
  assert.equal(diagnosis.reasonCode, 'F931_LAYOUT_AND_POPULATIONS_UNMAPPED');
  assert.equal(diagnosis.verifiedPhysicalProperties.recordWidthBytes, 463);
  assert.ok(diagnosis.missingEvidence.includes('current_official_layout_and_effective_date'));
  assert.ok(diagnosis.missingEvidence.includes('three_output_population_semantics'));
  assert.equal(diagnosis.generationAllowed, false);
  assert.equal(diagnosis.officialSubmissionAllowed, false);
  assert.throws(() => generatePayrollF931Artifacts(), hasCode('F931_GENERATION_BLOCKED_LAYOUT_UNMAPPED'));
  assert.throws(() => submitPayrollF931Package(), hasCode('F931_SUBMISSION_BLOCKED_NO_AUTHORIZED_CHANNEL'));
});

test('el prevalidador es local: no usa DOM, storage, red, logs ni endpoints fiscales', () => {
  const source = fs.readFileSync(
    new URL('../assets/payroll-f931-prevalidator.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(source, /console\.|innerHTML|outerHTML|document\./);
  assert.doesNotMatch(source, /arca\.gob\.ar|afip\.gob\.ar|from ['"]node:/i);
  assert.match(source, /subtle\.digest\('SHA-256'/);
});
