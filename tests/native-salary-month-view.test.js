// Vista simple del maestro salarial («Valores del mes»): datos ficticios con la forma del maestro real.
import test from 'node:test';
import assert from 'node:assert/strict';
import {salaryExactText, salaryValueText, salaryMonthChoices, salaryMonthView, salaryMonthLabel, salaryMonthTitle, salaryPreviousMonth} from '../assets/native-salary-month-view-model.js';

const def = (kind, code, agreementCode, value, validFrom, extra = {}) => ({kind, code, agreementCode, categoryCode: kind === 'scale' ? code : null, label: kind === 'scale' ? 'Escala ' + code + '-X' : 'DEFINICION ' + code, nature: kind === 'concept' ? 'remuneration' : kind === 'auxiliary' ? 'auxiliary' : null,
  unit: 'money', precision: 5, value, validFrom, validUntil: validFrom, active: true, ruleReference: 'Documento de prueba ' + code, dependencies: [], ...extra, ...(kind === 'scale' ? {code: '1'} : {})});
const items = [
  def('scale', '3', '1', '375188.930', '2026-09'), def('scale', '3', '1', '382692.71000', '2026-10'), def('scale', '13', '1', '654404.53000', '2026-10'), def('scale', '6', '1', '463058.18000', '2026-10'),
  def('scale', '3', '8', '100000.00000', '2026-10'),
  def('concept', '52', '1', null, '2026-10', {label: 'TITULO SECUNDARIO (5 AÑOS)'}), def('concept', '7', '1', '10.00000000', '2026-05', {unit: 'percent', validUntil: null, nature: 'deduction', dependencies: ['auxiliary:88']}),
  def('auxiliary', '900000607', '1', '1733.40', '2026-10'), def('auxiliary', '88', '1', '962359.6050', '2026-09'), def('auxiliary', '88', '1', '962359.6050', '2026-10'),
  def('auxiliary', '18', '1', '1.50000000', '2026-10', {unit: 'coefficient'}), def('auxiliary', '30', '1', '30', '2026-10', {unit: 'days'}), def('auxiliary', '31', '1', '1', '2026-10', {unit: 'days'}),
  def('concept', '99', '1', '5.00', '2026-10', {active: false}),
];

test('los importes se escriben como se leen, sin coma flotante y sin inventar decimales', () => {
  assert.equal(salaryExactText('382692.71000', 2), '382.692,71');
  assert.equal(salaryExactText('962359.6050', 2), '962.359,605', 'los decimales que dicen algo se conservan');
  assert.equal(salaryExactText('1733.4', 2), '1.733,40');
  assert.equal(salaryExactText('1000000', 2), '1.000.000,00');
  assert.equal(salaryExactText('0.5'), '0,5'); assert.equal(salaryExactText('10.00000000'), '10'); assert.equal(salaryExactText('-12.30'), '-12,3');
  assert.equal(salaryExactText('123456789012345678901234567890.12', 2), '123.456.789.012.345.678.901.234.567.890,12', 'exacto aun con más cifras que un número de máquina');
  for (const bad of [null, undefined, '', '1,5', 'abc', 12.5, '1e3']) assert.equal(salaryExactText(bad), null);
});

test('cada unidad se dice en palabras y un valor no informado no se convierte en cero', () => {
  assert.equal(salaryValueText(items[1]), '$ 382.692,71');
  assert.equal(salaryValueText(items[6]), '10 %');
  assert.equal(salaryValueText(items[10]), '1,5 (coeficiente)');
  assert.equal(salaryValueText(items[11]), '30 días'); assert.equal(salaryValueText(items[12]), '1 día');
  assert.equal(salaryValueText(items[5]), null); assert.equal(salaryValueText(null), null);
});

test('se elige entre los convenios y los meses que el maestro cubre; se propone el último mes cerrado', () => {
  const c = salaryMonthChoices(items, {agreementLabels: [{code: '1', label: 'Municipales'}], today: new Date(2026, 10, 11)});
  assert.deepEqual(c.agreements, [{code: '1', label: 'Municipales'}, {code: '8', label: ''}]);
  assert.deepEqual(c.months, ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
  assert.equal(c.agreement, '1'); assert.equal(c.month, '2026-10');
  assert.equal(salaryMonthChoices(items, {today: new Date(2027, 5, 1)}).month, '2026-10', 'si el último mes cerrado no está cubierto, el más reciente');
  assert.deepEqual(salaryMonthChoices([], {}), {agreements: [], months: [], agreement: '', month: ''});
});

test('la vista de un mes trae sólo lo habilitado de ese convenio que vale ese mes, en tres listas ordenadas', () => {
  const v = salaryMonthView(items, {agreement: '1', month: '2026-10'});
  assert.deepEqual(v.scale.map(r => [r.code, r.name, r.value]), [['3-X', 'Escala 1', '$ 382.692,71'], ['6-X', 'Escala 1', '$ 463.058,18'], ['13-X', 'Escala 1', '$ 654.404,53']]);
  assert.deepEqual(v.concepts.map(r => [r.code, r.value, r.nature]), [['7', '10 %', 'Retención'], ['52', null, 'Haber remunerativo']], 'la definición desactivada no aparece; la que rige desde mayo sin fin, sí');
  assert.deepEqual(v.auxiliaries.map(r => r.code), ['18', '30', '31', '88', '900000607']);
  assert.equal(v.total, 10);
  assert.equal(salaryMonthView(items, {agreement: '8', month: '2026-10'}).scale.length, 1);
  assert.equal(salaryMonthView(items, {agreement: '1', month: '2026-11'}).total, 1, 'en noviembre sólo vale lo que no tiene fecha de fin');
});

test('el detalle dice desde cuándo vale, cómo era el mes anterior y qué documento lo respalda', () => {
  const v = salaryMonthView(items, {agreement: '1', month: '2026-10'});
  const clase3 = v.scale[0], aux88 = v.auxiliaries.find(r => r.code === '88'), nuevo = v.auxiliaries.find(r => r.code === '900000607'), pct = v.concepts[0];
  assert.equal(clase3.validity, 'Vale sólo para octubre de 2026.'); assert.equal(clase3.previous, 'En septiembre de 2026 era $ 375.188,93.'); assert.equal(clase3.reference, 'Documento de prueba 3');
  assert.equal(aux88.previous, 'Igual que en septiembre de 2026.');
  assert.equal(nuevo.previous, 'No estaba definido en septiembre de 2026.');
  assert.equal(pct.validity, 'Vale desde mayo de 2026, sin fecha de fin.'); assert.equal(pct.dependencies, 1);
});

test('buscar acota por código o nombre, sin distinguir mayúsculas ni acentos', () => {
  assert.deepEqual(salaryMonthView(items, {agreement: '1', month: '2026-10', query: 'titulo'}).concepts.map(r => r.code), ['52']);
  assert.deepEqual(salaryMonthView(items, {agreement: '1', month: '2026-10', query: 'AÑOS'}).concepts.map(r => r.code), ['52']);
  assert.equal(salaryMonthView(items, {agreement: '1', month: '2026-10', query: '900000607'}).total, 1);
  assert.equal(salaryMonthView(items, {agreement: '1', month: '2026-10', query: 'no existe'}).total, 0);
});

test('sin convenio, sin mes o con datos que no son una lista no se muestra nada', () => {
  for (const args of [{agreement: '', month: '2026-10'}, {agreement: '1', month: 'octubre'}, {}]) assert.equal(salaryMonthView(items, args).total, 0);
  assert.equal(salaryMonthView(null, {agreement: '1', month: '2026-10'}).total, 0);
  assert.equal(salaryMonthLabel('2026-10'), 'octubre de 2026'); assert.equal(salaryMonthTitle('2026-01'), 'Enero de 2026'); assert.equal(salaryPreviousMonth('2026-01'), '2025-12'); assert.equal(salaryMonthLabel('x'), '');
});
