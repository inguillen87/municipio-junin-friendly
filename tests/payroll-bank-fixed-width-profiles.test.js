import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  PAYROLL_BANK_MAX_FILE_BYTES,
  PAYROLL_BANK_MAX_RECORDS,
  PAYROLL_BANK_OBSERVED_PROFILES,
  PAYROLL_BANK_PROFILE_CATALOG_VERSION,
  PAYROLL_BANK_RECONCILIATION_VERSION,
  PAYROLL_BANK_VALIDATION_RESULT_VERSION,
  PayrollBankProfileError,
  generateBankMonthlyArtifact,
  reconcileBankControlTotals,
  validateObservedBankFile,
} from '../assets/payroll-bank-fixed-width-profiles.js';

function profile(profileId) {
  return PAYROLL_BANK_OBSERVED_PROFILES[profileId];
}

function line(width, byte = 0x41) {
  return Uint8Array.from({ length: width }, () => byte);
}

function crlfFile(lines) {
  const length = lines.reduce((total, item) => total + item.byteLength + 2, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const item of lines) {
    bytes.set(item, offset);
    offset += item.byteLength;
    bytes[offset] = 0x0d;
    bytes[offset + 1] = 0x0a;
    offset += 2;
  }
  return bytes;
}

function hasCode(code) {
  return (error) => error instanceof PayrollBankProfileError && error.code === code;
}

test('publica cuatro perfiles observados con evidencia y generación bloqueada', () => {
  assert.equal(PAYROLL_BANK_PROFILE_CATALOG_VERSION, 'payroll-bank-observed-structure-catalog.v1');
  assert.deepEqual(Object.keys(PAYROLL_BANK_OBSERVED_PROFILES), [
    'credicoop-accreditation-30.observed.v1',
    'credicoop-control-66.observed.v1',
    'gt-pagos-200.observed.v1',
    'transferencias-varias-167.observed.v1',
  ]);
  assert.deepEqual(Object.values(PAYROLL_BANK_OBSERVED_PROFILES)
    .map((item) => item.recordWidthBytes), [30, 66, 200, 167]);
  for (const item of Object.values(PAYROLL_BANK_OBSERVED_PROFILES)) {
    assert.equal(item.fieldLayoutStatus, 'not_homologated');
    assert.equal(item.generationStatus, 'blocked_pending_field_layout');
    assert.equal(item.officialSubmissionAllowed, false);
    assert.ok(item.referenceSamples.length >= 1);
    assert.equal(Object.isFrozen(item), true);
    for (const sample of item.referenceSamples) {
      assert.match(sample.sha256, /^sha256:[a-f0-9]{64}$/);
      assert.ok(sample.observedRecordCount > 0);
    }
  }
});

test('acepta sólo la estructura byte-level observada y devuelve una huella determinista', async () => {
  for (const [profileId, item] of Object.entries(PAYROLL_BANK_OBSERVED_PROFILES)) {
    const record = line(item.recordWidthBytes);
    if (item.encodingConstraint === 'windows-1252-printable') record[3] = 0xd1;
    const bytes = crlfFile([record, line(item.recordWidthBytes, 0x39)]);
    const scope = item.supportedScopes[0];
    const result = await validateObservedBankFile(
      { profileId, scope, bytes },
      { cryptoImpl: webcrypto },
    );

    assert.equal(result.contractVersion, PAYROLL_BANK_VALIDATION_RESULT_VERSION);
    assert.equal(result.profileId, profileId);
    assert.equal(result.status, 'matches_observed_structure');
    assert.equal(result.structureMatches, true);
    assert.equal(result.generationAllowed, false);
    assert.equal(result.officialSubmissionAllowed, false);
    assert.equal(result.recordCount, 2);
    assert.equal(result.diagnostics.issueCount, 0);
    assert.deepEqual(result.diagnostics.rows, []);
    assert.equal(result.sha256, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.limitations), true);
  }
});

test('reporta ancho, fin de línea y CRLF final por fila sin devolver contenido', async () => {
  const marker = 'SECRETO-NO-EXPONER-998877';
  const wrongWidth = new TextEncoder().encode(marker.padEnd(31, 'X'));
  const second = line(30, 0x42);
  const bytes = new Uint8Array(wrongWidth.byteLength + 1 + second.byteLength);
  bytes.set(wrongWidth, 0);
  bytes[wrongWidth.byteLength] = 0x0a;
  bytes.set(second, wrongWidth.byteLength + 1);

  const result = await validateObservedBankFile({
    profileId: 'credicoop-accreditation-30.observed.v1',
    scope: '42',
    bytes,
  }, { cryptoImpl: webcrypto });

  assert.equal(result.status, 'blocked_by_structure');
  assert.equal(result.recordCount, 2);
  assert.deepEqual(result.diagnostics.byCode, [
    { code: 'BANK_FINAL_CRLF_REQUIRED', count: 1 },
    { code: 'BANK_LINE_ENDING_INVALID', count: 2 },
    { code: 'BANK_RECORD_WIDTH_MISMATCH', count: 1 },
  ]);
  assert.deepEqual(result.diagnostics.rows, [
    {
      rowNumber: 1,
      errorCodes: ['BANK_LINE_ENDING_INVALID', 'BANK_RECORD_WIDTH_MISMATCH'],
    },
    {
      rowNumber: 2,
      errorCodes: ['BANK_FINAL_CRLF_REQUIRED', 'BANK_LINE_ENDING_INVALID'],
    },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /SECRETO|998877/);
});

test('distingue ASCII de Windows-1252 sin desplazar posiciones', async () => {
  const asciiWidth = profile('credicoop-accreditation-30.observed.v1').recordWidthBytes;
  const asciiRecord = line(asciiWidth);
  asciiRecord[10] = 0xd1;
  const asciiResult = await validateObservedBankFile({
    profileId: 'credicoop-accreditation-30.observed.v1',
    scope: '55',
    bytes: crlfFile([asciiRecord]),
  }, { cryptoImpl: webcrypto });
  assert.deepEqual(asciiResult.diagnostics.byCode, [
    { code: 'BANK_ENCODING_CONSTRAINT_FAILED', count: 1 },
  ]);

  const cpRecord = line(profile('credicoop-control-66.observed.v1').recordWidthBytes);
  cpRecord[10] = 0xd1;
  const cpResult = await validateObservedBankFile({
    profileId: 'credicoop-control-66.observed.v1',
    scope: '42',
    bytes: crlfFile([cpRecord]),
  }, { cryptoImpl: webcrypto });
  assert.equal(cpResult.structureMatches, true);

  cpRecord[10] = 0x81;
  const undefinedCpResult = await validateObservedBankFile({
    profileId: 'credicoop-control-66.observed.v1',
    scope: '42',
    bytes: crlfFile([cpRecord]),
  }, { cryptoImpl: webcrypto });
  assert.deepEqual(undefinedCpResult.diagnostics.byCode, [
    { code: 'BANK_ENCODING_CONSTRAINT_FAILED', count: 1 },
  ]);
});

test('rechaza BOM y ámbitos no observados en vez de normalizarlos', async () => {
  const record = line(167);
  const body = crlfFile([record]);
  const bytes = new Uint8Array(body.byteLength + 3);
  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(body, 3);
  const result = await validateObservedBankFile({
    profileId: 'transferencias-varias-167.observed.v1',
    scope: 'unsegmented',
    bytes,
  }, { cryptoImpl: webcrypto });
  assert.deepEqual(result.diagnostics.byCode, [{ code: 'BANK_BOM_FORBIDDEN', count: 1 }]);

  await assert.rejects(
    validateObservedBankFile({
      profileId: 'transferencias-varias-167.observed.v1',
      scope: '42',
      bytes: body,
    }, { cryptoImpl: webcrypto }),
    hasCode('BANK_SCOPE_NOT_OBSERVED'),
  );
});

test('aplica límites duros de bytes y registros antes de aceptar una fuente', async () => {
  await assert.rejects(
    validateObservedBankFile({
      profileId: 'credicoop-accreditation-30.observed.v1',
      scope: '42',
      bytes: new Uint8Array(PAYROLL_BANK_MAX_FILE_BYTES + 1),
    }, { cryptoImpl: webcrypto }),
    hasCode('BANK_FILE_TOO_LARGE'),
  );

  const repeated = Array.from({ length: PAYROLL_BANK_MAX_RECORDS + 1 }, () => line(30));
  await assert.rejects(
    validateObservedBankFile({
      profileId: 'credicoop-accreditation-30.observed.v1',
      scope: '42',
      bytes: crlfFile(repeated),
    }, { cryptoImpl: webcrypto }),
    hasCode('BANK_RECORD_LIMIT_EXCEEDED'),
  );
});

test('concilia cantidades e importes con BigInt sin redondeos Number', () => {
  const same = reconcileBankControlTotals({
    payrollRecordCount: 173,
    bankRecordCount: 173,
    approvedPayrollNetCents: '9007199254740993123',
    declaredBankNetCents: '9007199254740993123',
  });
  assert.equal(same.contractVersion, PAYROLL_BANK_RECONCILIATION_VERSION);
  assert.equal(same.status, 'reconciled');
  assert.equal(same.reconciled, true);
  assert.equal(same.bankMinusPayrollCents, '0');
  assert.equal(same.generationAllowed, false);

  const difference = reconcileBankControlTotals({
    payrollRecordCount: 173,
    bankRecordCount: 172,
    approvedPayrollNetCents: '9007199254740993123',
    declaredBankNetCents: '9007199254740993001',
  });
  assert.equal(difference.status, 'difference_detected');
  assert.equal(difference.bankMinusPayrollCents, '-122');
  assert.equal(difference.bankMinusPayrollRecords, -1);
});

test('bloquea generación para todos los perfiles hasta homologar campos', () => {
  const marker = 'CUENTA-SECRETA-112233';
  for (const profileId of Object.keys(PAYROLL_BANK_OBSERVED_PROFILES)) {
    assert.throws(
      () => generateBankMonthlyArtifact({ profileId, rows: [marker] }),
      (error) => {
        assert.ok(hasCode('BANK_PROFILE_FIELD_LAYOUT_NOT_HOMOLOGATED')(error));
        assert.doesNotMatch(error.message, /CUENTA-SECRETA|112233/);
        return true;
      },
    );
  }
});

test('rechaza contratos ambiguos y criptografía ausente con errores no sensibles', async () => {
  await assert.rejects(
    validateObservedBankFile({
      profileId: 'credicoop-accreditation-30.observed.v1',
      scope: '42',
      bytes: crlfFile([line(30)]),
      filename: 'NOMBRE-PERSONAL.txt',
    }, { cryptoImpl: webcrypto }),
    hasCode('BANK_VALIDATION_INPUT_INVALID'),
  );
  await assert.rejects(
    validateObservedBankFile({
      profileId: 'gt-pagos-200.observed.v1',
      scope: '42',
      bytes: crlfFile([line(200)]),
    }, { cryptoImpl: null }),
    hasCode('BANK_CRYPTO_UNAVAILABLE'),
  );
});
