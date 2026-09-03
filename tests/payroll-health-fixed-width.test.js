import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_HEALTH_FIXED_WIDTH_CONTRACT_VERSION,
  PAYROLL_HEALTH_FIXED_WIDTH_MAX_BYTES,
  PAYROLL_HEALTH_FIXED_WIDTH_MAX_ISSUES,
  PAYROLL_HEALTH_FIXED_WIDTH_PROFILES,
  PayrollHealthFixedWidthError,
  diagnosePayrollHealthProfile,
  generatePayrollHealthFixedWidth,
  reconcilePayrollHealthCents,
  validatePayrollHealthFixedWidth,
} from '../assets/payroll-health-fixed-width.js';

function detail(width, fill = 0x41) {
  return new Uint8Array(width).fill(fill);
}

function joinCrlf(records, { finalCrlf = true } = {}) {
  const size = records.reduce((total, row) => total + row.byteLength, 0)
    + Math.max(0, records.length - 1) * 2
    + (finalCrlf ? 2 : 0);
  const result = new Uint8Array(size);
  let offset = 0;
  records.forEach((row, index) => {
    result.set(row, offset);
    offset += row.byteLength;
    if (index < records.length - 1 || finalCrlf) {
      result[offset] = 0x0d;
      result[offset + 1] = 0x0a;
      offset += 2;
    }
  });
  return result;
}

function withFooter(details, footer) {
  const body = joinCrlf(details);
  const result = new Uint8Array(body.byteLength + footer.byteLength);
  result.set(body, 0);
  result.set(footer, body.byteLength);
  return result;
}

function hasCode(code) {
  return (error) => error instanceof PayrollHealthFixedWidthError && error.code === code;
}

test('catálogo expone sólo evidencia física y bloquea generación de OSEP/Mutual', () => {
  assert.deepEqual(Object.keys(PAYROLL_HEALTH_FIXED_WIDTH_PROFILES), [
    'osep-185-crlf.v1',
    'osep-206-crlf.v1',
    'osep-206-tab-footer25.v1',
    'seguro-mutual-121-crlf.v1',
  ]);
  for (const profile of Object.values(PAYROLL_HEALTH_FIXED_WIDTH_PROFILES)) {
    assert.equal(profile.encoding, 'windows-1252');
    assert.equal(profile.lineEnding, 'CRLF');
    assert.equal(profile.fieldMappingComplete, false);
    assert.equal(profile.generationAllowed, false);
    assert.equal(profile.officialSubmissionAllowed, false);
    assert.equal(profile.homologated, false);
    assert.equal(profile.evidenceLevel, 'physical_sample_only');
    assert.equal(profile.semanticStatus, 'unmapped');
    assert.ok(profile.unknownFieldRequirements.includes('amount_field_positions'));
    const diagnosis = diagnosePayrollHealthProfile(profile.profileId);
    assert.equal(diagnosis.status, 'blocked');
    assert.equal(diagnosis.reasonCode, 'HEALTH_FIELDS_UNMAPPED');
    assert.equal(diagnosis.generationAllowed, false);
    assert.equal(diagnosis.fieldManifest[0].status, 'unknown');
    assert.throws(
      () => generatePayrollHealthFixedWidth({ profileId: profile.profileId }),
      hasCode('HEALTH_GENERATION_BLOCKED_FIELDS_UNMAPPED'),
    );
  }
});

test('valida los anchos observados 185, 206 y 121 por bytes con CRLF', async () => {
  const cases = [
    ['osep-185-crlf.v1', 185],
    ['osep-206-crlf.v1', 206],
    ['seguro-mutual-121-crlf.v1', 121],
  ];
  for (const [profileId, width] of cases) {
    const result = await validatePayrollHealthFixedWidth(
      joinCrlf([detail(width), detail(width, 0xd1)]),
      { profileId, expectedRecordCount: 2, cryptoImpl: webcrypto },
    );
    assert.equal(result.contractVersion, PAYROLL_HEALTH_FIXED_WIDTH_CONTRACT_VERSION);
    assert.equal(result.status, 'valid_structure');
    assert.equal(result.detailRecordCount, 2);
    assert.equal(result.issueCount, 0);
    assert.match(result.rawSha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(result.sourceValuesIncluded, false);
    assert.equal(result.amountReconciliation.status, 'not_computed');
    assert.equal(result.generationAllowed, false);
  }
});

test('reconoce la variante observada OSEP 206 con cierre de 25 bytes tabulados', async () => {
  const footer = new Uint8Array(25).fill(0x09);
  footer[24] = 0x20;
  const result = await validatePayrollHealthFixedWidth(
    withFooter([detail(206), detail(206)], footer),
    {
      profileId: 'osep-206-tab-footer25.v1',
      expectedRecordCount: 2,
      cryptoImpl: webcrypto,
    },
  );
  assert.equal(result.status, 'valid_structure');
  assert.equal(result.detailRecordCount, 2);
  assert.equal(result.terminalRecordCount, 1);
});

test('rechaza ancho, final, BOM, controles y cantidad sin devolver contenido', async () => {
  const marker = 'PERSONA-SECRETA-778899';
  const row = detail(184);
  row.set(new TextEncoder().encode(marker).subarray(0, 20), 0);
  row[20] = 0x00;
  const source = new Uint8Array(3 + row.byteLength);
  source.set([0xef, 0xbb, 0xbf], 0);
  source.set(row, 3);
  const result = await validatePayrollHealthFixedWidth(source, {
    profileId: 'osep-185-crlf.v1',
    expectedRecordCount: 2,
    cryptoImpl: webcrypto,
  });

  assert.equal(result.status, 'invalid_structure');
  assert.deepEqual(result.issues, [
    { line: 1, code: 'HEALTH_BOM_NOT_ALLOWED' },
    { line: 1, code: 'HEALTH_DETAIL_WIDTH_MISMATCH' },
    { line: 1, code: 'HEALTH_CRLF_REQUIRED' },
    { line: 1, code: 'HEALTH_CONTROL_BYTE_NOT_ALLOWED' },
    { line: null, code: 'HEALTH_RECORD_COUNT_MISMATCH' },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /PERSONA-SECRETA|778899/);
});

test('footer OSEP no se interpreta: sólo acepta el patrón físico exacto observado', async () => {
  const footer = new Uint8Array(25).fill(0x09);
  footer[24] = 0x20;
  footer[4] = 0x41;
  const result = await validatePayrollHealthFixedWidth(
    withFooter([detail(206)], footer),
    { profileId: 'osep-206-tab-footer25.v1', cryptoImpl: webcrypto },
  );
  assert.equal(result.status, 'invalid_structure');
  assert.deepEqual(result.issues, [{ line: 2, code: 'HEALTH_TERMINAL_PATTERN_MISMATCH' }]);
});

test('centavos se concilian con BigInt exacto y overflow falla cerrado', () => {
  assert.deepEqual(reconcilePayrollHealthCents({
    expectedCents: '9007199254740993',
    artifactCents: '9007199254740994',
  }), {
    expectedCents: '9007199254740993',
    artifactCents: '9007199254740994',
    differenceCents: '1',
    reconciled: false,
  });
  assert.equal(reconcilePayrollHealthCents({
    expectedCents: '100', artifactCents: '100',
  }).reconciled, true);
  assert.throws(
    () => reconcilePayrollHealthCents({ expectedCents: '1.00', artifactCents: '100' }),
    hasCode('HEALTH_CENTS_INVALID'),
  );
  assert.throws(
    () => reconcilePayrollHealthCents({
      expectedCents: '-9223372036854775808', artifactCents: '9223372036854775807',
    }),
    hasCode('HEALTH_CENTS_OUT_OF_RANGE'),
  );
});

test('limita memoria, cantidad de errores y entradas ambiguas', async () => {
  await assert.rejects(
    validatePayrollHealthFixedWidth(
      new Uint8Array(PAYROLL_HEALTH_FIXED_WIDTH_MAX_BYTES + 1),
      { profileId: 'osep-185-crlf.v1', cryptoImpl: webcrypto },
    ),
    hasCode('HEALTH_SOURCE_TOO_LARGE'),
  );
  await assert.rejects(
    validatePayrollHealthFixedWidth(new Uint8Array([0x41]), {
      profileId: 'perfil-inventado', cryptoImpl: webcrypto,
    }),
    hasCode('HEALTH_PROFILE_UNKNOWN'),
  );
  const invalidRows = Array.from(
    { length: PAYROLL_HEALTH_FIXED_WIDTH_MAX_ISSUES + 20 },
    () => detail(1),
  );
  const result = await validatePayrollHealthFixedWidth(joinCrlf(invalidRows), {
    profileId: 'seguro-mutual-121-crlf.v1', cryptoImpl: webcrypto,
  });
  assert.equal(result.issueCount, invalidRows.length);
  assert.equal(result.issues.length, PAYROLL_HEALTH_FIXED_WIDTH_MAX_ISSUES);
  assert.equal(result.issuesTruncated, true);
});

test('el motor es offline y no toca DOM, storage, red ni logs', () => {
  const source = fs.readFileSync(
    new URL('../assets/payroll-health-fixed-width.js', import.meta.url), 'utf8',
  );
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(source, /console\.|innerHTML|outerHTML|document\./);
  assert.doesNotMatch(source, /from ['"]node:/);
  assert.match(source, /BigInt\(/);
  assert.match(source, /subtle\.digest\('SHA-256'/);
});
