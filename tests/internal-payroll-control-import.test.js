import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_CONTROL_IMPORT_CONTRACT_VERSION,
  PAYROLL_CONTROL_IMPORT_DEFINITION,
  PAYROLL_CONTROL_IMPORT_HMAC_KEY_VERSION,
  PAYROLL_CONTROL_IMPORT_MAX_BYTES,
  PayrollControlImportError,
  preparePayrollControlImport,
} from '../lib/internal-payroll-control-import.js';

const encoder = new TextEncoder();
const fingerprintKey = Buffer.from('unit-test-payroll-control-import-hmac-secret-32-bytes');
const baseContext = Object.freeze({
  tenantId: '11111111-1111-4111-8111-111111111111',
  sourceBindingId: '22222222-2222-4222-8222-222222222222',
  releaseSha: 'a'.repeat(40),
  fingerprintKey,
});

function source({
  period = '2026-07', jurisdiction = '42', amount701 = '82882370,98',
  amount703 = '106546119,35', newline = '\n',
  header = 'periodo;jurisdiccion;concepto;importe_ars', rows,
} = {}) {
  return encoder.encode([
    header,
    ...(rows || [
      `${period};${jurisdiction};701;${amount701}`,
      `${period};${jurisdiction};703;${amount703}`,
    ]),
  ].join(newline));
}

function prepare(overrides = {}) {
  return preparePayrollControlImport({
    sourceKind: 'grh_observed',
    period: '2026-07',
    jurisdiction: '42',
    definitionKey: PAYROLL_CONTROL_IMPORT_DEFINITION,
    bytes: source(),
    context: baseContext,
    ...overrides,
  });
}

test('prepara una fuente 701/703 exacta con centavos BigInt y sin PII', () => {
  const result = prepare();
  assert.equal(result.contractVersion, PAYROLL_CONTROL_IMPORT_CONTRACT_VERSION);
  assert.equal(result.hmacKeyVersion, PAYROLL_CONTROL_IMPORT_HMAC_KEY_VERSION);
  assert.equal(result.sourceKind, 'grh_observed');
  assert.equal(result.provenanceState, 'operator_declared');
  assert.equal(result.periodMonth, '2026-07-01');
  assert.equal(result.jurisdiction, '42');
  assert.equal(result.certifiedReleaseSha, 'a'.repeat(40));
  assert.deepEqual(result.rows, [
    { concept: '701', amountCents: '8288237098' },
    { concept: '703', amountCents: '10654611935' },
  ]);
  assert.match(result.contentHmacSha256, /^[a-f0-9]{64}$/);
  assert.match(result.manifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.recordCount, 2);
  assert.equal(result.rawContentStored, false);
  assert.equal(result.includesPersonalRecords, false);
  assert.equal(result.persistencePerformed, false);
  assert.equal(result.payrollCalculated, false);
  assert.equal(result.payrollPosted, false);
  assert.equal(result.fiscalArtifactGenerated, false);
  assert.doesNotMatch(JSON.stringify(result), /tenantId|sourceBindingId|fingerprintKey/);
});

test('la huella HMAC queda ligada a tenant, binding y bytes, pero detecta duplicados entre releases', () => {
  const baseline = prepare();
  const changedTenant = prepare({ context: {
    ...baseContext, tenantId: '33333333-3333-4333-8333-333333333333',
  } });
  const changedBinding = prepare({ context: {
    ...baseContext, sourceBindingId: '44444444-4444-4444-8444-444444444444',
  } });
  const changedRelease = prepare({ context: { ...baseContext, releaseSha: 'b'.repeat(40) } });
  const changedBytes = prepare({ bytes: source({ newline: '\r\n' }) });
  assert.equal(new Set([
    baseline.contentHmacSha256,
    changedTenant.contentHmacSha256,
    changedBinding.contentHmacSha256,
    changedBytes.contentHmacSha256,
  ]).size, 4);
  assert.equal(changedRelease.contentHmacSha256, baseline.contentHmacSha256);
  assert.notEqual(changedRelease.manifestSha256, baseline.manifestSha256);

  const expected = createHmac('sha256', fingerprintKey)
    .update(PAYROLL_CONTROL_IMPORT_CONTRACT_VERSION, 'utf8')
    .update('\0', 'utf8').update(PAYROLL_CONTROL_IMPORT_HMAC_KEY_VERSION, 'utf8')
    .update('\0', 'utf8').update(baseContext.tenantId, 'utf8')
    .update('\0', 'utf8').update(baseContext.sourceBindingId, 'utf8')
    .update('\0', 'utf8').update(source())
    .digest('hex');
  assert.equal(baseline.contentHmacSha256, expected);
});

test('acepta las dos fuentes y jurisdicciones, pero no amplía el contrato', () => {
  assert.equal(prepare({ sourceKind: 'operator_control' }).sourceKind, 'operator_control');
  assert.equal(prepare({
    jurisdiction: '55', bytes: source({ jurisdiction: '55' }),
  }).jurisdiction, '55');
  assert.throws(() => prepare({ sourceKind: 'bank_file' }), (error) => (
    error.code === 'PAYROLL_CONTROL_IMPORT_SOURCE_KIND_INVALID'
  ));
  assert.throws(() => prepare({ jurisdiction: '43' }), (error) => (
    error.code === 'PAYROLL_CONTROL_IMPORT_JURISDICTION_INVALID'
  ));
  assert.throws(() => prepare({ definitionKey: 'user-defined.v1' }), (error) => (
    error.code === 'PAYROLL_CONTROL_IMPORT_DEFINITION_INVALID'
  ));
});

test('período, encabezado, conceptos y filas coinciden con el contexto', () => {
  const cases = [
    [{ period: '2026-13' }, 'PAYROLL_CONTROL_IMPORT_PERIOD_INVALID'],
    [{ bytes: source({ period: '2026-08' }) }, 'PAYROLL_CONTROL_IMPORT_PERIOD_MISMATCH'],
    [{ bytes: source({ jurisdiction: '55' }) }, 'PAYROLL_CONTROL_IMPORT_JURISDICTION_MISMATCH'],
    [{ bytes: source({ header: 'concepto;importe' }) }, 'PAYROLL_CONTROL_IMPORT_HEADER_INVALID'],
    [{ bytes: source({ rows: ['2026-07;42;701;1,00'] }) }, 'PAYROLL_CONTROL_IMPORT_ROW_COUNT_INVALID'],
    [{ bytes: source({ rows: [
      '2026-07;42;701;1,00', '2026-07;42;701;2,00',
    ] }) }, 'PAYROLL_CONTROL_IMPORT_CONCEPT_DUPLICATED'],
    [{ bytes: source({ rows: [
      '2026-07;42;701;1,00', '2026-07;42;704;2,00',
    ] }) }, 'PAYROLL_CONTROL_IMPORT_CONCEPT_INVALID'],
  ];
  for (const [overrides, code] of cases) {
    assert.throws(() => prepare(overrides), (error) => error.code === code, code);
  }
});

test('rechaza importes ambiguos sin Number ni redondeos', () => {
  for (const amount701 of ['1', '1,0', '1,001', '1.000,00', '1.00', '+1,00', '01,00', '-0,00']) {
    assert.throws(
      () => prepare({ bytes: source({ amount701 }) }),
      (error) => error.code === 'PAYROLL_CONTROL_IMPORT_AMOUNT_INVALID',
      amount701,
    );
  }
  const large = prepare({ bytes: source({ amount701: '90071992547409,93' }) });
  assert.equal(large.rows[0].amountCents, '9007199254740993');
  assert.equal(prepare({ bytes: source({ amount701: '92233720368547758,07' }) })
    .rows[0].amountCents, '9223372036854775807');
  assert.throws(
    () => prepare({ bytes: source({ amount701: '92233720368547758,08' }) }),
    (error) => error.code === 'PAYROLL_CONTROL_IMPORT_AMOUNT_OUT_OF_RANGE',
  );
  assert.equal(prepare({ bytes: source({ amount701: '-92233720368547758,08' }) })
    .rows[0].amountCents, '-9223372036854775808');
  assert.throws(
    () => prepare({ bytes: source({ amount701: '-92233720368547758,09' }) }),
    (error) => error.code === 'PAYROLL_CONTROL_IMPORT_AMOUNT_OUT_OF_RANGE',
  );
});

test('aplica UTF-8 fatal, límite duro y contexto certificado exacto', () => {
  const cases = [
    [{ bytes: new Uint8Array(PAYROLL_CONTROL_IMPORT_MAX_BYTES + 1) }, 'PAYROLL_CONTROL_IMPORT_SOURCE_TOO_LARGE'],
    [{ bytes: Uint8Array.from([0xc3, 0x28]) }, 'PAYROLL_CONTROL_IMPORT_ENCODING_INVALID'],
    [{ context: { ...baseContext, releaseSha: 'preview' } }, 'PAYROLL_CONTROL_IMPORT_CONTEXT_INVALID'],
    [{ context: { ...baseContext, fingerprintKey: 'short' } }, 'PAYROLL_CONTROL_IMPORT_CONTEXT_INVALID'],
    [{ context: { ...baseContext, email: 'persona@example.com' } }, 'PAYROLL_CONTROL_IMPORT_CONTEXT_INVALID'],
    [{ fileName: 'personal.csv' }, 'PAYROLL_CONTROL_IMPORT_INPUT_INVALID'],
  ];
  for (const [overrides, code] of cases) {
    assert.throws(() => prepare(overrides), (error) => {
      assert.equal(error instanceof PayrollControlImportError, true);
      return error.code === code;
    }, code);
  }
});

test('el módulo no registra ni persiste bytes, nombres o secretos', () => {
  const sourceCode = fs.readFileSync(
    new URL('../lib/internal-payroll-control-import.js', import.meta.url), 'utf8',
  );
  assert.doesNotMatch(sourceCode, /console\.|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(sourceCode, /file\.name|filename|original_name/i);
  assert.doesNotMatch(sourceCode, /INSERT\s+INTO|UPDATE\s+payroll|fetch\s*\(/i);
  assert.match(sourceCode, /createHmac\('sha256'/);
  assert.match(sourceCode, /BigInt\(integer\)/);
});
