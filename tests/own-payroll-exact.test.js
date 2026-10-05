import test from 'node:test';
import assert from 'node:assert/strict';
import { decimal, rational, exactAdd, exactSubtract, exactMultiply, exactDivide, exactEvidence, quantize, OwnPayrollError, roundingPolicy } from '../assets/own-payroll-exact.js';

const error = code => e => e instanceof OwnPayrollError && e.code === code;
test('aritmética preserva decimales grandes y fracciones sin Number', () => {
  assert.deepEqual(exactEvidence(exactAdd(decimal('9007199254740993.01'), decimal('0.02'))), { numerator: '900719925474099303', denominator: '100' });
  assert.deepEqual(exactEvidence(exactMultiply(exactDivide(decimal('1'), decimal('3')), decimal('3'))), { numerator: '1', denominator: '1' });
  assert.equal(quantize(exactSubtract(decimal('0.3'), decimal('0.1')), { precision: 2, mode: 'exact' }).amount, '0.20');
  assert.deepEqual(exactEvidence(rational(6n, -12n)), { numerator: '-1', denominator: '2' });
});
for (const mode of ['half_up', 'half_even', 'toward_zero', 'floor', 'ceiling']) {
  const cases = { half_up: ['1.01', '1.02', '-1.01', '-1.02'], half_even: ['1.00', '1.02', '-1.00', '-1.02'], toward_zero: ['1.00', '1.01', '-1.00', '-1.01'], floor: ['1.00', '1.01', '-1.01', '-1.02'], ceiling: ['1.01', '1.02', '-1.00', '-1.01'] }[mode];
  test(`redondeo ${mode}: empates positivos y negativos`, () => {
    ['1.005', '1.015', '-1.005', '-1.015'].forEach((v, i) => assert.equal(quantize(decimal(v), { precision: 2, mode }).amount, cases[i]));
  });
}
test('el cociente recurrente no se redondea hasta una etapa declarada', () => {
  const third = exactDivide(decimal('1'), decimal('3'));
  assert.equal(quantize(third, { precision: 8, mode: 'half_even' }).amount, '0.33333333');
  assert.throws(() => quantize(third, { precision: 8, mode: 'exact' }), error('ROUNDING_NEEDED'));
  assert.throws(() => exactDivide(decimal('1'), decimal('0')), error('DIVISION_BY_ZERO'));
  assert.equal(quantize(decimal('-0.0001'), { precision: 2, mode: 'toward_zero' }).amount, '0.00');
});
for (const value of [1.2, null, undefined, '1e3', '1,20', ' 1', '+1', '01', '-0', '-0.00', '1.123456789', 'NaN', 'Infinity', '1;select']) {
  test(`rechaza valor no exacto ${String(value)}`, () => assert.throws(() => decimal(value), error('DECIMAL_INVALID')));
}
test('precisión y política omitidas, ampliadas o con accesores se rechazan', () => {
  for (const p of [null, {}, { precision: 2 }, { precision: 2, mode: 'auto' }, { precision: 9, mode: 'half_up' }, { precision: 2, mode: 'half_up', fallback: true }, { get precision() { throw Error('no ejecutar'); }, mode: 'half_up' }, { precision: 2, mode: 'half_up', [Symbol('extra')]: 1 }]) assert.throws(() => roundingPolicy(p), error('ROUNDING_REQUIRED'));
  assert.throws(() => rational(10n ** 512n), error('ARITHMETIC_LIMIT'));
});
