import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

import {
  PAYROLL_BANK_BLOCKED_NOTICE,
  PAYROLL_BANK_WORKBENCH_PROFILES,
  buildPayrollBankDiagnostic,
  createPayrollBankReportWorkbench,
} from '../assets/payroll-bank-report-workbench.js';
import { PayrollBankProfileError } from '../assets/payroll-bank-fixed-width-profiles.js';

const source = fs.readFileSync(new URL('../assets/payroll-bank-report-workbench.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../nomina-control.html', import.meta.url), 'utf8');
const build = fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');

function bytes(width, count = 1, fill = 0x41) {
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    rows.push(new Uint8Array([...new Uint8Array(width).fill(fill), 0x0d, 0x0a]));
  }
  const result = new Uint8Array(rows.reduce((total, row) => total + row.byteLength, 0));
  let offset = 0;
  rows.forEach((row) => { result.set(row, offset); offset += row.byteLength; });
  return result;
}

test('expone los cuatro perfiles observados sin habilitar generación ni acreditación', () => {
  assert.deepEqual(PAYROLL_BANK_WORKBENCH_PROFILES.map(({ profileId }) => profileId), [
    'credicoop-accreditation-30.observed.v1',
    'credicoop-control-66.observed.v1',
    'gt-pagos-200.observed.v1',
    'transferencias-varias-167.observed.v1',
  ]);
  assert.match(PAYROLL_BANK_BLOCKED_NOTICE, /Generación y acreditación bloqueadas/);
});

test('produce un diagnóstico estructural sin retener bytes, nombre ni contenido', async () => {
  const sourceBytes = bytes(30, 2);
  const diagnostic = await buildPayrollBankDiagnostic({
    profileId: 'credicoop-accreditation-30.observed.v1',
    scope: '42',
    bytes: sourceBytes,
    reconciliation: null,
  }, { cryptoImpl: webcrypto });

  assert.equal(diagnostic.structureMatches, true);
  assert.equal(diagnostic.recordCount, 2);
  assert.equal(diagnostic.byteLength, 64);
  assert.match(diagnostic.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(diagnostic.generationAllowed, false);
  assert.equal(diagnostic.officialSubmissionAllowed, false);
  assert.equal(diagnostic.blockedReason, 'field_layout_not_homologated');
  assert.equal(Object.hasOwn(diagnostic, 'bytes'), false);
  assert.equal(Object.hasOwn(diagnostic, 'fileName'), false);
  assert.equal(JSON.stringify(diagnostic).includes('AAAA'), false);
});

test('resume diferencias por código y concilia sólo totales externos exactos', async () => {
  const diagnostic = await buildPayrollBankDiagnostic({
    profileId: 'gt-pagos-200.observed.v1',
    scope: '55',
    bytes: bytes(199),
    reconciliation: {
      payrollRecordCount: '2',
      approvedPayrollNetCents: '10000',
      declaredBankNetCents: '9900',
    },
  }, { cryptoImpl: webcrypto });

  assert.equal(diagnostic.structureMatches, false);
  assert.deepEqual(diagnostic.diagnostics.byCode, [
    { code: 'BANK_RECORD_WIDTH_MISMATCH', count: 1 },
  ]);
  assert.equal(diagnostic.reconciliation.reconciled, false);
  assert.equal(diagnostic.reconciliation.bankMinusPayrollCents, '-100');
  assert.equal(diagnostic.reconciliation.bankMinusPayrollRecords, -1);
  assert.equal(diagnostic.reconciliation.generationAllowed, false);
});

test('rechaza conciliación parcial y nunca infiere importes desde posiciones no homologadas', async () => {
  await assert.rejects(
    buildPayrollBankDiagnostic({
      profileId: 'transferencias-varias-167.observed.v1',
      scope: 'unsegmented',
      bytes: bytes(167),
      reconciliation: {
        payrollRecordCount: '1',
        approvedPayrollNetCents: '100',
        declaredBankNetCents: '',
      },
    }, { cryptoImpl: webcrypto }),
    (error) => error instanceof PayrollBankProfileError
      && error.code === 'BANK_RECONCILIATION_FIELDS_INCOMPLETE',
  );
});

test('la factory es fail-closed con una raíz incompleta', () => {
  const root = { querySelector: () => null };
  assert.equal(createPayrollBankReportWorkbench(root, { cryptoImpl: webcrypto }), null);
});

test('el módulo browser queda offline, sin persistencia, logs ni exposición de nombre', () => {
  assert.match(source, /data-payroll-bank-report-workbench/);
  assert.match(source, /validateObservedBankFile/);
  assert.match(source, /reconcileBankControlTotals/);
  assert.match(source, /PAYROLL_BANK_MAX_FILE_BYTES/);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|caches\./);
  assert.doesNotMatch(source, /console\.|\.name\b|fileName/);
  assert.doesNotMatch(source, /generateBankMonthlyArtifact/);
  assert.match(html, /08 · ARCHIVOS BANCARIOS/);
  assert.match(html, /data-payroll-bank-report-workbench/);
  assert.equal((html.match(/assets\/payroll-bank-report-workbench\.js/g) || []).length, 1);
  assert.match(build, /'assets\/payroll-bank-fixed-width-profiles\.js'/);
  assert.match(build, /'assets\/payroll-bank-report-workbench\.js'/);
});
