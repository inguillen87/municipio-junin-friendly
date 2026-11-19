import test from 'node:test';
import assert from 'node:assert/strict';
import { entityExportResponse, entityDiscountFile, entityFileBytes, ENTITY_EXPORT_LAYOUT } from '../assets/entity-discount-export.js';

const base = { version: 'payroll-entity-export.v1', found: true, datasetId: '3fbf3df3-2bad-4d92-ab96-f16fcdd253ac', date: '2026-10-31', period: 2026, month: 10, type: 'M', concept: '638', description: null, concepts: [], rows: [] };
const row = (legajo, amount = '1.00', extra = {}) => ({ legajo, amount, sector: '12', contractMatches: 1, dni: '20111222', name: 'PRUEBA, PERSONA', jurisdiction: '42', ...extra });
const build = (rows, overrides = {}) => entityDiscountFile({ ...base, ...overrides, rows });
const invalid = fn => assert.throws(fn, { code: 'PAYROLL_ENTITY_EXPORT_INVALID' });

test('the last representable cent is exact and the next one is reviewed without changing the amount', () => {
  const file = build([row('1', '99999999.99'), row('2', '100000000.00'), row('3', '0.01')]);
  assert.equal(file.lines.length, 2);
  assert.equal(file.lines[0].slice(42, 52), '9999999999');
  assert.equal(file.lines[1].slice(42, 52), '0000000001');
  assert.equal(file.totalCents, '10000000000');
  assert.deepEqual(file.review, [{ legajo: '2', amount: '100000000.00', reasons: ['importe excede 10 posiciones'] }]);
});

test('large or negative money is not clipped; zero remains an exact valid line', () => {
  const file = build([row('1', '999999999999999999.99'), row('2', '-0.01'), row('3', '0.00')]);
  assert.equal(file.lines.length, 1);
  assert.equal(file.lines[0].slice(42, 52), '0000000000');
  assert.equal(file.totalCents, '0');
  assert.deepEqual(file.review.map(r => r.reasons), [['importe excede 10 posiciones'], ['importe negativo']]);
});

test('repartición is present, decimal and at most four positions; an oversized code is never shortened', () => {
  const values = [null, '', '12345', '1234567', '-12', '12.3', 'A12', ' 12', '12 '];
  const file = build(values.map((sector, i) => row(String(i + 1), '1.00', { sector })));
  assert.equal(file.lines.length, 0);
  assert.equal(file.totalCents, '0');
  assert.deepEqual(file.review.map(r => r.reasons), values.map(v => [v ? 'repartición inválida para 4 posiciones' : 'sin repartición']));
});

test('jurisdicción is not derived by slicing a different numeric code', () => {
  const values = [null, '', '123', '0042', 'a2', '42 '];
  const file = build(values.map((jurisdiction, i) => row(String(i + 1), '1.00', { jurisdiction })));
  assert.equal(file.lines.length, 0);
  assert.deepEqual(file.review.map(r => r.reasons), values.map(v => [v ? 'jurisdicción inválida para 2 posiciones' : 'sin jurisdicción']));
});

test('valid numeric codes preserve leading zeroes and the documented right padding', () => {
  const file = build([row('1', '12.05', { jurisdiction: '5', sector: '1', dni: '000001234567' }), row('2', '1.00', { jurisdiction: '01', sector: '0012' })]);
  assert.equal(file.lines[0].slice(0, 18), '5 ' + '1000' + '000001234567');
  assert.equal(file.lines[1].slice(0, 6), '01' + '0012');
  assert.equal(file.lines[0].slice(52, 76), '000000000000000638' + '202610');
  assert.equal(file.review.length, 0);
});

test('DNI permits canonical digits or complete dotted thousands groups and surrounding ASCII spaces', () => {
  const values = ['12345', '123456789012', '20.111.222', '5.123.456', '123.456.789.012', ' 20.111.222 '];
  const expected = ['000000012345', '123456789012', '000020111222', '000005123456', '123456789012', '000020111222'];
  const file = build(values.map((dni, i) => row(String(i + 1), '1.00', { dni })));
  assert.deepEqual(file.lines.map(l => l.slice(6, 18)), expected);
  assert.equal(file.review.length, 0);
});

test('DNI letters, signs, exponents, punctuation, malformed separators and excessive width are not discarded', () => {
  const values = ['20A111222', 'DNI 20111222', '-20111222', '+20111222', '2e7', '0x123456', '20-111222-2', '20 111 222', '20,111,222', '20.11.1222', '20..111.222', '.20111222', '20111222.', '20111222/', '1234', '1234567890123', '\u00a020111222\u00a0', '２０１１１２２２'];
  const file = build(values.map((dni, i) => row(String(i + 1), '1.00', { dni })));
  assert.equal(file.lines.length, 0);
  assert.equal(file.review.length, values.length);
  assert.ok(file.review.every(r => r.reasons.includes('documento inválido')));
});

test('missing or ambiguous identity stays in review, including a blank name', () => {
  const file = build([row('1', '1.00', { contractMatches: 2 }), row('2', '1.00', { dni: null }), row('3', '1.00', { name: '   ' })]);
  assert.deepEqual(file.review.map(r => r.reasons), [['más de una persona para el legajo'], ['sin identidad'], ['sin identidad']]);
  assert.equal(file.lines.length, 0);
});

test('Latin-1 letters and accents keep their exact Windows-1252 bytes', () => {
  const file = build([row('1', '1.00', { name: 'ÑñÁáÉéÍíÓóÚúÜüÇç£' })]);
  const bytes = entityFileBytes(file);
  assert.deepEqual([...bytes.slice(18, 35)], [0xd1, 0xf1, 0xc1, 0xe1, 0xc9, 0xe9, 0xcd, 0xed, 0xd3, 0xf3, 0xda, 0xfa, 0xdc, 0xfc, 0xc7, 0xe7, 0xa3]);
  assert.equal(bytes.length, 78);
  assert.deepEqual([...bytes.slice(76)], [13, 10]);
});

test('all printable Windows-1252 extension characters encode to the designated bytes', () => {
  const glyphs = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const expected = [0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8e, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9e, 0x9f];
  const file = build([...glyphs].map((name, i) => row(String(i + 1), '1.00', { name })));
  assert.equal(file.review.length, 0);
  const bytes = entityFileBytes(file);
  assert.deepEqual(expected.map((_, i) => bytes[i * 78 + 18]), expected);
  for (let i = 0; i < expected.length; i++) assert.deepEqual([...bytes.slice(i * 78 + 76, i * 78 + 78)], [13, 10]);
});

test('euro and typographic quotes in a name are represented without Latin-1 substitution', () => {
  const file = build([row('1', '1.00', { name: 'D’ÁVILA “ANA” €' })]);
  const bytes = entityFileBytes(file);
  assert.equal(file.lines[0].slice(18, 41), 'D’ÁVILA “ANA” €'.padEnd(23));
  assert.deepEqual([...bytes.slice(18, 32)], [0x44, 0x92, 0xc1, 0x56, 0x49, 0x4c, 0x41, 0x20, 0x93, 0x41, 0x4e, 0x41, 0x94, 0x20]);
  assert.equal(bytes[32], 0x80);
});

test('Unicode C1 controls never turn into punctuation or undefined Windows-1252 bytes', () => {
  const rows = Array.from({ length: 32 }, (_, i) => row(String(i + 1), '1.00', { name: 'A' + String.fromCharCode(0x80 + i) }));
  const file = build(rows);
  assert.equal(file.lines.length, 0);
  assert.equal(file.review.length, 32);
  assert.ok(file.review.every(r => r.reasons.includes('nombre con caracteres fuera de Windows-1252')));
});

test('unencodable BMP letters, combining marks, astral characters and lone surrogates require review', () => {
  const names = ['ŁUKASZ', 'A\u0301', 'PRUEBA 😀', 'PRUEBA\ud800', 'PRUEBA\udc00'];
  const file = build(names.map((name, i) => row(String(i + 1), '1.00', { name })));
  assert.equal(file.lines.length, 0);
  assert.equal(file.review.length, names.length);
});

test('name is the only data field truncated; a long encodable name retains the first 23 positions', () => {
  const file = build([row('1', '1.00', { name: 'Á'.repeat(24) })]);
  assert.equal(file.lines[0].slice(18, 41), 'Á'.repeat(23));
  assert.deepEqual([...entityFileBytes(file).slice(18, 41)], Array(23).fill(0xc1));
});

test('an unencodable character beyond the name cutoff is still diagnosed', () => {
  const file = build([row('1', '1.00', { name: 'A'.repeat(23) + '😀' })]);
  assert.equal(file.lines.length, 0);
  assert.deepEqual(file.review[0].reasons, ['nombre con caracteres fuera de Windows-1252']);
});

test('byte encoder rejects control injection independently of response validation', () => {
  for (const ch of ['\u0000', '\r', '\n', '\t', '\u007f', '\u0080', '\u0081', '\u0092', '\ud800', 'Ł', '😀']) {
    invalid(() => entityFileBytes({ lines: [(ch + 'A'.repeat(76)).slice(0, 76)] }));
  }
});

test('byte encoder accepts only complete 76-position lines and always appends CRLF', () => {
  for (const file of [null, {}, { lines: 'A'.repeat(76) }, { lines: [null] }, { lines: ['A'.repeat(75)] }, { lines: ['A'.repeat(77)] }]) invalid(() => entityFileBytes(file));
  const bytes = entityFileBytes({ lines: ['A'.repeat(76), 'B'.repeat(76)] });
  assert.equal(bytes.length, 156);
  assert.deepEqual([...bytes.slice(76, 78)], [13, 10]);
  assert.deepEqual([...bytes.slice(-2)], [13, 10]);
  assert.deepEqual(entityFileBytes({ lines: [] }), new Uint8Array(0));
  assert.equal(ENTITY_EXPORT_LAYOUT.encoding, 'windows-1252');
});

test('money values are exact two-decimal strings, never coerced or rounded from JS numbers', () => {
  for (const amount of [1.25, 0.01, '1', '1.0', '1.001', '1e2', 'NaN', '+1.00', '1,00', '', null]) invalid(() => build([row('1', amount)]));
  const file = build([row('1', '0001.01')]);
  assert.equal(file.totalCents, '101');
  assert.equal(file.lines[0].slice(42, 52), '0000000101');
});

test('period must fit YYYYMM and concept cannot overflow the numeric contract', () => {
  for (const period of [-1, 0, 10000, 2026.5, '2026']) invalid(() => build([row('1')], { period }));
  for (const month of [0, 13, 1.5, '10']) invalid(() => build([row('1')], { month }));
  for (const concept of [638, '0638', '-638', '638X', '1000000000']) invalid(() => build([row('1')], { concept }));
  const file = build([row('1')], { period: 9999, month: 12, concept: '999999999' });
  assert.equal(file.lines[0].slice(52), '000000000999999999' + '999912');
});

test('source counts cannot be negative or imprecise, and control characters fail validation', () => {
  for (const contractMatches of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) invalid(() => build([row('1', '1.00', { contractMatches })]));
  for (const name of ['A\0B', 'A\nB', 'A\rB', 'A\tB', 'A\u007fB']) invalid(() => build([row('1', '1.00', { name })]));
  invalid(() => entityExportResponse({ ...base, concepts: [{ code: '638', lines: -1, people: 1, total: '1.00' }] }));
});

test('all reviewed rows produce no numeric total or fabricated file lines, retaining the public response shape', () => {
  const file = build([row('1', '100000000.00'), row('2', '1.00', { sector: null })]);
  assert.deepEqual(Object.keys(file), ['name', 'lines', 'review', 'totalCents', 'rows']);
  assert.deepEqual(Object.keys(file.review[0]), ['legajo', 'amount', 'reasons']);
  assert.equal(file.name, '638 102026.txt');
  assert.equal(file.totalCents, '0');
  assert.equal(file.rows, 2);
  assert.deepEqual(file.lines, []);
  assert.equal(entityFileBytes(file).length, 0);
  assert.ok(Object.isFrozen(file) && Object.isFrozen(file.lines) && Object.isFrozen(file.review) && Object.isFrozen(file.review[0].reasons));
});

test('read-only inputs and not-found responses retain their contract', () => {
  const rawRow = Object.freeze(row('1'));
  const raw = Object.freeze({ ...base, concepts: Object.freeze([]), rows: Object.freeze([rawRow]) });
  assert.equal(entityDiscountFile(raw).lines.length, 1);
  assert.equal(raw.rows[0], rawRow);
  assert.deepEqual(entityExportResponse({ version: base.version, found: false }), { version: base.version, found: false });
});
