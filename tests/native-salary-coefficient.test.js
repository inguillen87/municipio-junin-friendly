// «Aumento por porcentaje» también acepta el aumento dicho como coeficiente (1,02). Es la misma operación exacta:
// el porcentaje equivalente se obtiene corriendo la coma, sin redondear, y el plan resultante es idéntico.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {salaryCoefficientPercentage,salaryEffectivePercentagePlan} from '../assets/native-salary-percentage-model.js';
import {salaryItems,salaryRowKey} from '../assets/native-salary-catalog-model.js';

test('el coeficiente se convierte en su porcentaje exacto', () => {
  for (const [coefficient, percentage] of [['1.02', '2'], ['1.026', '2.6'], ['1.07', '7'], ['1.0005', '0.05'], ['2', '100'], ['1.5', '50'], ['1.00000001', '0.000001'], ['10.25', '925'], ['1.10', '10']])
    assert.equal(salaryCoefficientPercentage(coefficient), percentage, coefficient);
});

test('no es un aumento: se rechaza sin convertir nada', () => {
  for (const value of ['1', '1.0', '0.98', '0', '', ' 1.02', '1,02', '1.02.3', '1e2', '-1.02', '1.000000001', '1000', 'abc', null, undefined, 1.02])
    assert.throws(() => salaryCoefficientPercentage(value), {name: 'SalaryInputError'}, String(value));
});

test('1,02 y 2 % preparan exactamente las mismas escalas', () => {
  const scale = {kind: 'scale', agreementCode: '1', categoryCode: '3', code: '1', label: 'Escala 3-A', nature: null, unit: 'money', precision: 2, value: '375188.93', validFrom: '2026-09', validUntil: null, ruleReference: 'Escala sintética de prueba', dependencies: [], active: true};
  const items = salaryItems([scale]), selection = items.map(row => ({key: salaryRowKey(row), before: row}));
  const change = percentage => ({sourceMonth: '2026-09', percentage, precision: 4, ruleReference: 'Aumento sintético de prueba'});
  const byPercentage = salaryEffectivePercentagePlan(items, selection, change('2'), '2026-10');
  const byCoefficient = salaryEffectivePercentagePlan(items, selection, change(salaryCoefficientPercentage('1.02')), '2026-10');
  assert.deepEqual(byCoefficient, byPercentage);
  assert.equal(byCoefficient.items.find(row => row.validFrom === '2026-10').value, '382692.7086');
});

test('la pantalla ofrece las dos formas y conserva el campo de porcentaje de siempre', () => {
  const source = fs.readFileSync(new URL('../src/islands/NativeSalaryPercentage.jsx', import.meta.url), 'utf8');
  assert.match(source, /<option value="percentage">Porcentaje \(2 es un 2 %\)<\/option><option value="coefficient">Coeficiente \(1,02 es un 2 %\)<\/option>/);
  assert.match(source, /aria-label="Porcentaje de aumento"/);
  assert.match(source, /aria-label="Coeficiente de aumento"/);
  assert.match(source, /percentage:increaseForm==='coefficient'\?salaryCoefficientPercentage\(typed\):percentage\.replace\(',','\.'\)/);
});
