import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  PAYROLL_OSEP_206_FIELDS, PAYROLL_OSEP_206_PROFILE, PAYROLL_OSEP_206_RECORD_BYTES, PAYROLL_OSEP_206_MAX_ROWS,
  PAYROLL_OSEP_206_BASE_PROFILE, PAYROLL_OSEP_206_TERMINAL_PROFILE,
  renderPayrollOsep206, parsePayrollOsep206, payrollOsepDocumentTypeFromGrh, PayrollOsep206Error,
} from '../assets/payroll-osep-206-generator.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const throwsCode = (fn, code) => {
  try { fn(); } catch (e) { assert.ok(e instanceof PayrollOsep206Error, `error class for ${code}`); assert.equal(e.code, code); return; }
  assert.fail(`expected ${code}`);
};
// Sólo datos inventados: ningún legajo, documento ni nombre real.
const row = (over = {}) => ({
  period: '202608', documentTypeCode: '3', dni: '10000001', legajo: '7', fullName: 'SINTETICO, UNO',
  employerContributionCents: '12345', subjectSalaryCents: '7700000', netPayCents: '6500000', quotaCents: '385000',
  voluntaryPureCents: '0', voluntaryStudentCents: '0', catastrophicCents: '19250', catastrophicIndirectCents: '0',
  catastrophicVoluntaryCents: '0', catastrophicStudentCents: '0', currentAccountCents: '0', bankrupt: false,
  disabilityDirectCents: '57750', ...over,
});

test('el manifiesto cubre exactamente los 206 bytes: siete ceros + TipoDoc, legajo de doce dígitos y 683/684 como campos', () => {
  let cursor = 1;
  for (const f of PAYROLL_OSEP_206_FIELDS) { assert.equal(f.start, cursor); assert.ok(f.end >= f.start); cursor = f.end + 1; }
  assert.equal(cursor - 1, PAYROLL_OSEP_206_RECORD_BYTES);
  const byId = Object.fromEntries(PAYROLL_OSEP_206_FIELDS.map(f => [f.fieldId, f]));
  assert.deepEqual([byId.reservedPrefix.start, byId.reservedPrefix.end, byId.reservedPrefix.value], [7, 13, '0000000']);
  assert.deepEqual([byId.documentTypeCode.start, byId.documentTypeCode.end, byId.documentTypeCode.kind], [14, 14, 'documentType']);
  assert.deepEqual([byId.legajo.start, byId.legajo.end], [23, 34]);
  assert.deepEqual([byId.catastrophicVoluntaryCents.start, byId.catastrophicStudentCents.end], [165, 184]);
  assert.deepEqual(byId.subjectSalaryCents.sourceConceptCodes, ['993', '994']);
  assert.deepEqual(byId.voluntaryPureCents.sourceConceptCodes, ['602', '608']);
  assert.equal(PAYROLL_OSEP_206_PROFILE.officialSubmissionAllowed, false);
  assert.equal(PAYROLL_OSEP_206_PROFILE.activation, 'PREPARATION_ONLY');
  assert.ok(Object.isFrozen(PAYROLL_OSEP_206_FIELDS) && Object.isFrozen(PAYROLL_OSEP_206_FIELDS[0]));
});

test('genera 206 bytes + CRLF en windows-1252 y relee sin pérdida; los bytes de agosto se conservan (0000000+3, legajo corto)', () => {
  const out = renderPayrollOsep206([row(), row({ dni: '10000002', legajo: '123456789012', fullName: 'Ñandú, José €', catastrophicVoluntaryCents: '1', catastrophicStudentCents: '2', bankrupt: true })]);
  assert.equal(out.byteLength, 2 * 208); assert.equal(out.bytes.length, out.byteLength); assert.equal(out.terminalRecordCount, 0);
  const text = Buffer.from(out.bytes).toString('latin1');
  assert.equal(text.slice(0, 14), '20260800000003'); // AAAAMM + siete ceros + TipoDoc 3 (DNI): mismos bytes que el constante observado en agosto
  assert.equal(text.slice(22, 34), '000000000007'); // legajo 7 → doce dígitos
  assert.equal(text.slice(208 + 22, 208 + 34), '123456789012');
  assert.equal(out.bytes[208 + 34 + 12], 0x80); // € (posición 13 del nombre) → 0x80
  assert.ok(text.slice(208 + 194, 208 + 196) === 'SI');
  const back = parsePayrollOsep206(out.bytes);
  assert.equal(back.profileId, PAYROLL_OSEP_206_BASE_PROFILE); assert.equal(back.recordCount, 2);
  assert.equal(back.rows[1].fullName, 'Ñandú, José €'); assert.equal(back.rows[1].legajo, '123456789012'); assert.equal(back.rows[0].legajo, '7');
  assert.equal(back.rows[1].catastrophicVoluntaryCents, '1'); assert.equal(back.rows[1].catastrophicStudentCents, '2'); assert.equal(back.rows[1].bankrupt, true);
  assert.deepEqual(renderPayrollOsep206(back.rows).bytes, out.bytes);
  assert.equal(out.totalsCents.subjectSalaryCents, '15400000');
});

test('TipoDoc viene del mapeo explícito GRH y cualquier otro valor se rechaza', () => {
  assert.deepEqual(['1', '2', '3', '4', '5', '6'].map(payrollOsepDocumentTypeFromGrh), ['3', '1', '2', '5', '4', '6']);
  throwsCode(() => payrollOsepDocumentTypeFromGrh('7'), 'OSEP_206_DOCUMENT_TYPE_INVALID');
  throwsCode(() => payrollOsepDocumentTypeFromGrh(3), 'OSEP_206_DOCUMENT_TYPE_INVALID');
  for (const code of ['1', '2', '4', '5', '6']) {
    const back = parsePayrollOsep206(renderPayrollOsep206([row({ documentTypeCode: code })]).bytes);
    assert.equal(back.rows[0].documentTypeCode, code);
  }
  throwsCode(() => renderPayrollOsep206([row({ documentTypeCode: undefined })]), 'OSEP_206_DOCUMENT_TYPE_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ documentTypeCode: '0' })]), 'OSEP_206_DOCUMENT_TYPE_INVALID');
});

test('la salida es determinista y verificable por hash', () => {
  const rows = [row(), row({ dni: '10000002', legajo: '8' })];
  const a = renderPayrollOsep206(rows), b = renderPayrollOsep206(rows.map(r => ({ ...r })));
  assert.equal(sha256(a.bytes), sha256(b.bytes));
  assert.notEqual(sha256(a.bytes), sha256(renderPayrollOsep206([rows[1], rows[0]]).bytes));
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.totalsCents));
});

test('falla cerrado: importes ausentes no se convierten en cero, nombres y dígitos se rechazan sin truncar', () => {
  throwsCode(() => renderPayrollOsep206([]), 'OSEP_206_ROWS_REQUIRED');
  throwsCode(() => renderPayrollOsep206([row({ quotaCents: undefined })]), 'OSEP_206_CENTS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ quotaCents: null })]), 'OSEP_206_CENTS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ quotaCents: 385000 })]), 'OSEP_206_CENTS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ quotaCents: '-1' })]), 'OSEP_206_CENTS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ quotaCents: '01' })]), 'OSEP_206_CENTS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ quotaCents: '12345678901' })]), 'OSEP_206_CENTS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ period: '202613' })]), 'OSEP_206_PERIOD_INVALID');
  throwsCode(() => renderPayrollOsep206([row(), row({ dni: '10000002', legajo: '8', period: '202607' })]), 'OSEP_206_PERIOD_MIXED');
  throwsCode(() => renderPayrollOsep206([row(), row({ dni: '10000002' })]), 'OSEP_206_DUPLICATE');
  throwsCode(() => renderPayrollOsep206([row({ legajo: '1234567890123' })]), 'OSEP_206_DIGITS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ legajo: 'LEGAJO-QA' })]), 'OSEP_206_DIGITS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ dni: '1234X678' })]), 'OSEP_206_DIGITS_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ fullName: 'A'.repeat(41) })]), 'OSEP_206_NAME_TOO_LONG');
  throwsCode(() => renderPayrollOsep206([row({ fullName: '' })]), 'OSEP_206_NAME_REQUIRED');
  throwsCode(() => renderPayrollOsep206([row({ fullName: 'Persona 😀' })]), 'OSEP_206_CHARACTER_UNSUPPORTED');
  throwsCode(() => renderPayrollOsep206([row({ fullName: 'Persona\u0000' })]), 'OSEP_206_CHARACTER_UNSUPPORTED');
  throwsCode(() => renderPayrollOsep206([row({ fullName: 'Persona\nDos' })]), 'OSEP_206_CHARACTER_UNSUPPORTED');
  throwsCode(() => renderPayrollOsep206([row({ bankrupt: 'NO' })]), 'OSEP_206_FLAG_INVALID');
  throwsCode(() => renderPayrollOsep206([row({ extra: 1 })]), 'OSEP_206_FIELD_UNKNOWN');
  throwsCode(() => renderPayrollOsep206([row()], { profileId: 'otro' }), 'OSEP_206_PROFILE_UNKNOWN');
  throwsCode(() => renderPayrollOsep206([row()], { verbose: true }), 'OSEP_206_OPTIONS_INVALID');
  throwsCode(() => renderPayrollOsep206(Array.from({ length: PAYROLL_OSEP_206_MAX_ROWS + 1 }, () => row())), 'OSEP_206_TOO_MANY_ROWS');
});

test('el lector aplica las mismas invariantes que el generador y el terminal sólo vale al final y según perfil', () => {
  const one = renderPayrollOsep206([row()]).bytes, two = renderPayrollOsep206([row(), row({ dni: '10000002', legajo: '8' })]).bytes;
  const withTerminal = renderPayrollOsep206([row()], { profileId: PAYROLL_OSEP_206_TERMINAL_PROFILE });
  assert.equal(withTerminal.byteLength, 208 + 25); assert.equal(withTerminal.terminalRecordCount, 1);
  assert.deepEqual([...withTerminal.bytes.slice(-25)], [...Array(24).fill(9), 32]);
  const parsedTerminal = parsePayrollOsep206(withTerminal.bytes);
  assert.equal(parsedTerminal.profileId, PAYROLL_OSEP_206_TERMINAL_PROFILE); assert.equal(parsedTerminal.terminalRecordCount, 1); assert.equal(parsedTerminal.rows.length, 1);
  assert.ok(parsedTerminal.rows.every(r => !('terminalRecord' in r)));
  throwsCode(() => parsePayrollOsep206(withTerminal.bytes, { profileId: PAYROLL_OSEP_206_BASE_PROFILE }), 'OSEP_206_PROFILE_MISMATCH');
  throwsCode(() => parsePayrollOsep206(one, { profileId: PAYROLL_OSEP_206_TERMINAL_PROFILE }), 'OSEP_206_PROFILE_MISMATCH');
  const terminalOnly = withTerminal.bytes.slice(208);
  throwsCode(() => parsePayrollOsep206(terminalOnly), 'OSEP_206_ROWS_REQUIRED');
  const terminalMiddle = new Uint8Array([...withTerminal.bytes, ...one]);
  throwsCode(() => parsePayrollOsep206(terminalMiddle), 'OSEP_206_RECORD_WIDTH');
  const edit = (bytes, at, value) => { const copy = new Uint8Array(bytes); copy.set(Buffer.from(value, 'latin1'), at); return copy; };
  throwsCode(() => parsePayrollOsep206(edit(one, 6, '1')), 'OSEP_206_CONSTANT_MISMATCH');
  throwsCode(() => parsePayrollOsep206(edit(one, 114, '1')), 'OSEP_206_CONSTANT_MISMATCH');
  throwsCode(() => parsePayrollOsep206(edit(one, 4, '13')), 'OSEP_206_PERIOD_INVALID');
  throwsCode(() => parsePayrollOsep206(edit(one, 194, 'XX')), 'OSEP_206_FLAG_UNKNOWN');
  throwsCode(() => parsePayrollOsep206(edit(one, 80, 'A')), 'OSEP_206_FIELD_NOT_NUMERIC');
  throwsCode(() => parsePayrollOsep206(edit(two, 208 + 22, '000000000007')), 'OSEP_206_DUPLICATE');
  throwsCode(() => parsePayrollOsep206(edit(two, 208 + 4, '07')), 'OSEP_206_PERIOD_MIXED');
  throwsCode(() => parsePayrollOsep206(edit(one, 34, ' '.repeat(40))), 'OSEP_206_NAME_REQUIRED');
  throwsCode(() => parsePayrollOsep206(new Uint8Array([0xef, 0xbb, 0xbf, ...one])), 'OSEP_206_BOM_FORBIDDEN');
  throwsCode(() => parsePayrollOsep206(new Uint8Array([...one.slice(0, 40), 0x00, ...one.slice(41)])), 'OSEP_206_BYTE_UNSUPPORTED');
  throwsCode(() => parsePayrollOsep206(new Uint8Array([...one.slice(0, 40), 0x81, ...one.slice(41)])), 'OSEP_206_BYTE_UNSUPPORTED');
  throwsCode(() => parsePayrollOsep206(one.slice(0, 207)), 'OSEP_206_TRAILING_CRLF');
  throwsCode(() => parsePayrollOsep206(one.map((b, i) => (i === 206 ? 10 : b))), 'OSEP_206_TRAILING_CRLF'); // LF LF no es CRLF
  throwsCode(() => parsePayrollOsep206(new Uint8Array([...one.slice(0, 100), 0x41, ...one.slice(100)])), 'OSEP_206_RECORD_WIDTH');
  throwsCode(() => parsePayrollOsep206(new Uint8Array(0)), 'OSEP_206_SOURCE_INVALID');
  throwsCode(() => parsePayrollOsep206(new Uint8Array(8 * 1024 * 1024 + 1)), 'OSEP_206_SOURCE_TOO_LARGE');
  assert.equal(parsePayrollOsep206(two).officialSubmissionAllowed, false);
});
