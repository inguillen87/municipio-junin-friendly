import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  PAYROLL_OSEP_206_FIELDS,
  PAYROLL_OSEP_206_PROFILE,
  PAYROLL_OSEP_206_RECORD_BYTES,
  parsePayrollOsep206,
  renderPayrollOsep206,
} from '../assets/payroll-osep-206-generator.js';

const row = (overrides = {}) => ({
  period: '202611', dni: '12345678', legajo: '42', fullName: 'Pérez Ñandú, José María',
  employerContributionCents: '13806920', subjectSalaryCents: '197241700', netPayCents: '160000000', quotaCents: '9862085',
  voluntaryPureCents: '0', voluntaryStudentCents: '0', catastrophicCents: '493104', catastrophicIndirectCents: '1479313',
  currentAccountCents: '0', bankrupt: false, disabilityDirectCents: '1479313', ...overrides,
});
const throwsCode = (fn, code) => assert.throws(fn, error => error.code === code);

test('el manifiesto cubre exactamente los 206 bytes sin huecos ni solapes', () => {
  let next = 1;
  for (const field of PAYROLL_OSEP_206_FIELDS) { assert.equal(field.start, next); next = field.end + 1; }
  assert.equal(next - 1, PAYROLL_OSEP_206_RECORD_BYTES);
  assert.equal(PAYROLL_OSEP_206_PROFILE.fieldMappingComplete, true);
  assert.equal(PAYROLL_OSEP_206_PROFILE.generationAllowed, true);
  assert.equal(PAYROLL_OSEP_206_PROFILE.officialSubmissionAllowed, false);
});

test('genera registros de 206 bytes, CRLF, windows-1252 y vuelve a leerlos sin pérdida', () => {
  const out = renderPayrollOsep206([row(), row({ dni: '87654321', legajo: '7', fullName: 'ÁLVAREZ, ÚRSULA', bankrupt: true, quotaCents: '0' })]);
  assert.equal(out.recordCount, 2);
  assert.equal(out.byteLength, 2 * (PAYROLL_OSEP_206_RECORD_BYTES + 2));
  assert.equal(out.bytes[PAYROLL_OSEP_206_RECORD_BYTES], 0x0d);
  assert.equal(out.bytes[PAYROLL_OSEP_206_RECORD_BYTES + 1], 0x0a);
  const first = Buffer.from(out.bytes.subarray(0, PAYROLL_OSEP_206_RECORD_BYTES)).toString('latin1');
  assert.equal(first.slice(0, 6), '202611');
  assert.equal(first.slice(6, 14), '00000003');
  assert.equal(first.slice(14, 22), '12345678');
  assert.equal(first.slice(30, 34), '0042');
  assert.equal(first.slice(34, 74), 'PÉREZ ÑANDÚ, JOSÉ MARÍA'.padEnd(40, ' '));
  assert.equal(first.slice(74, 84), '0013806920');
  assert.equal(first.slice(194, 196), 'NO');
  assert.equal(first.slice(196, 206), '0001479313');
  assert.equal(out.bytes[34 + 1], 0xc9, 'É se escribe como un solo byte 0xC9');
  assert.deepEqual(out.totalsCents.quotaCents, '9862085');
  assert.deepEqual(out.totalsCents.disabilityDirectCents, '2958626');
  const back = parsePayrollOsep206(out.bytes);
  assert.equal(back.rows.length, 2);
  assert.equal(back.rows[0].fullName, 'PÉREZ ÑANDÚ, JOSÉ MARÍA');
  assert.equal(back.rows[0].dni, '12345678');
  assert.equal(back.rows[0].legajo, '42');
  assert.equal(back.rows[0].quotaCents, '9862085');
  assert.equal(back.rows[1].bankrupt, true);
  assert.equal(back.rows[1].legajo, '7');
  assert.equal(back.baseProfileKnown, true);
});

test('la salida es determinista y verificable por hash', () => {
  const a = renderPayrollOsep206([row()]), b = renderPayrollOsep206([row()]);
  assert.equal(createHash('sha256').update(a.bytes).digest('hex'), createHash('sha256').update(b.bytes).digest('hex'));
});

test('falla cerrado ante entradas inválidas', () => {
  throwsCode(() => renderPayrollOsep206([]), 'OSEP_206_ROWS_REQUIRED');
  throwsCode(() => renderPayrollOsep206([row({ period: '2026-11' })]), 'OSEP_206_PERIOD_INVALID');
  throwsCode(() => renderPayrollOsep206([row(), row({ period: '202612' })]), 'OSEP_206_PERIOD_MIXED');
  throwsCode(() => renderPayrollOsep206([row(), row()]), 'OSEP_206_DUPLICATE');
  throwsCode(() => renderPayrollOsep206([row({ dni: '123456789' })]), 'OSEP_206_DIGITS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ legajo: '12345' })]), 'OSEP_206_DIGITS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ fullName: 'X'.repeat(41) })]), 'OSEP_206_NAME_TOO_LONG');
  throwsCode(() => renderPayrollOsep206([row({ fullName: '   ' })]), 'OSEP_206_NAME_REQUIRED');
  throwsCode(() => renderPayrollOsep206([row({ fullName: 'Zoë €' })]), 'OSEP_206_CHARACTER_UNSUPPORTED');
  throwsCode(() => renderPayrollOsep206([row({ quotaCents: '-1' })]), 'OSEP_206_CENTS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ quotaCents: '12.50' })]), 'OSEP_206_CENTS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ quotaCents: '12345678901' })]), 'OSEP_206_CENTS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ bankrupt: 'no' })]), 'OSEP_206_FLAG_INVALID');
});

test('el lector rechaza anchos, constantes y terminadores distintos de los observados', () => {
  const good = renderPayrollOsep206([row()]).bytes;
  throwsCode(() => parsePayrollOsep206(good.subarray(0, good.length - 2)), 'OSEP_206_TRAILING_CRLF');
  const shorter = new Uint8Array([...good.subarray(0, 100), 0x0d, 0x0a]);
  throwsCode(() => parsePayrollOsep206(shorter), 'OSEP_206_RECORD_WIDTH');
  const altered = Uint8Array.from(good); altered[6] = 0x31;
  throwsCode(() => parsePayrollOsep206(altered), 'OSEP_206_CONSTANT_MISMATCH');
  const terminal = new Uint8Array([...good, ...Array(24).fill(0x09), 0x20]);
  const parsed = parsePayrollOsep206(terminal);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[1].terminalRecord, true);
  const terminalCrlf = new Uint8Array([...good, ...Array(24).fill(0x09), 0x20, 0x0d, 0x0a]);
  assert.equal(parsePayrollOsep206(terminalCrlf).rows.length, 2);
});
