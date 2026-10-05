import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOwnPayroll, normalizeOwnPayrollInput } from '../assets/own-payroll-engine.js';
import { OwnPayrollError } from '../assets/own-payroll-exact.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
import { payrollInput, employee, payrollId, rule, fact, ref, lit, binary, policy } from './fixtures/own-payroll-synthetic.js';
const error = code => e => e instanceof OwnPayrollError && e.code === code;
const rowAmount = (result, employee, code) => result.rows.find(r => r.contractId === payrollId(employee) && r.conceptCode === code).amount;

test('dos contratos propios calculan haberes, retenciones, contribuciones y auxiliares con casos esperados independientes', () => {
  const result = calculateOwnPayroll(payrollInput());
  assert.equal(rowAmount(result, 1, '100'), '100.10'); assert.equal(rowAmount(result, 1, '110'), '12.51');
  assert.equal(rowAmount(result, 1, '210'), '3.98'); assert.equal(rowAmount(result, 1, '310'), '15.02'); assert.equal(rowAmount(result, 1, '900'), '33.36666667');
  assert.deepEqual(result.employeeTotals[0], { contractId: payrollId(1), remuneration: '112.61', non_remuneration: '20.00', deduction: '3.98', employer_contribution: '15.02', gross: '132.61', net: '128.63' });
  assert.deepEqual(result.employeeTotals[1], { contractId: payrollId(2), remuneration: '393.92', non_remuneration: '0.00', deduction: '11.82', employer_contribution: '52.52', gross: '393.92', net: '382.10' });
  assert.equal(result.payrollCalculated, true); assert.equal(result.payrollPosted, false); assert.equal(result.municipalApprovalVerified, false); assert.equal(result.paymentExecuted, false);
  assert.equal(result.rows.length, 12); assert.deepEqual(result.rows.find(r => r.conceptCode === '210').dependencies, ['100', '110', '120']);
});
test('contrato propio inexistente en GRH se calcula sin lector, API, binding o referencia GRH', () => {
  const input = payrollInput({ employees: [employee(99)] });
  assert.equal(calculateOwnPayroll(input).employeeTotals[0].net, '382.10');
  assert.equal(JSON.stringify(input).includes('GRH'), false);
});
test('población completa de más de una página, por contratos, convenio y repartición, conserva los alcances exactos', () => {
  const input = payrollInput({ employees: Array.from({ length: 37 }, (_, i) => employee(i + 1)) });
  assert.equal(calculateOwnPayroll(input).employeeCount, 37); assert.equal(calculateOwnPayroll(input).rowCount, 222);
  assert.equal(calculateOwnPayroll({ ...input, selection: { kind: 'contracts', values: [payrollId(37), payrollId(1)] } }).employeeCount, 2);
  assert.equal(calculateOwnPayroll({ ...input, selection: { kind: 'departments', values: ['1'] } }).employeeCount, 19);
  assert.equal(calculateOwnPayroll({ ...input, selection: { kind: 'agreements', values: ['1'] } }).employeeCount, 37);
  assert.throws(() => calculateOwnPayroll({ ...input, selection: { kind: 'contracts', values: [payrollId(1), payrollId(80)] } }), error('POPULATION_MISSING'));
});
test('ausencia y cero son distintos; el último contrato inválido aborta el conjunto entero', () => {
  const input = payrollInput(); input.employees[1].inputs[1].value = null;
  assert.throws(() => calculateOwnPayroll(input), error('INPUT_MISSING'));
  input.employees[1].inputs[1].value = '0.00'; assert.equal(rowAmount(calculateOwnPayroll(input), 2, '120'), '0.00');
});
test('vigencias y tipo seleccionan la definición explícita, sin reutilizar la fórmula de otro período o convenio', () => {
  const input = payrollInput({ rules: [rule('100', lit('10', 'money'), { validUntil: '2026-10' }), rule('100', lit('20', 'money'), { validFrom: '2026-11' }), rule('100', lit('30', 'money'), { liquidationTypes: ['sac'] })] });
  assert.equal(rowAmount(calculateOwnPayroll(input), 1, '100'), '10.00');
  assert.equal(rowAmount(calculateOwnPayroll({ ...input, period: '2026-11' }), 1, '100'), '20.00');
  assert.equal(rowAmount(calculateOwnPayroll({ ...input, liquidationType: 'sac' }), 1, '100'), '30.00');
  assert.throws(() => calculateOwnPayroll({ ...input, liquidationType: 'final' }), error('PAY_RULE_MISSING'));
  input.employees[1].agreementCode = '2'; assert.throws(() => calculateOwnPayroll(input), error('PAY_RULE_MISSING'));
});
test('ciclos, dependencias ausentes y vigencias superpuestas bloquean incluso referencias en alternativas no elegidas', () => {
  assert.throws(() => calculateOwnPayroll(payrollInput({ rules: [rule('100', ref('200')), rule('200', ref('100'))] })), error('RULE_CYCLE'));
  assert.throws(() => calculateOwnPayroll(payrollInput({ rules: [rule('100', ref('999'))] })), error('RULE_MISSING'));
  assert.throws(() => calculateOwnPayroll(payrollInput({ rules: [rule('100', lit('1', 'money')), rule('100', lit('2', 'money'))] })), error('RULE_OVERLAP'));
  assert.throws(() => calculateOwnPayroll(payrollInput({ rules: [rule('100', { op: 'choose', condition: { op: 'compare', operator: 'eq', left: lit('1'), right: lit('1') }, then: lit('3', 'money'), else: ref('999') })] })), error('RULE_MISSING'));
});
test('condiciones, mínimos/máximos y redondeo intermedio conservan su etapa declarada', () => {
  const chosen = { op: 'choose', condition: { op: 'compare', operator: 'gt', left: fact('base'), right: lit('200', 'money') }, then: binary('min', fact('base'), lit('300', 'money')), else: binary('max', fact('base'), lit('120', 'money')) };
  assert.equal(rowAmount(calculateOwnPayroll(payrollInput({ rules: [rule('100', chosen)] })), 1, '100'), '120.00');
  assert.equal(rowAmount(calculateOwnPayroll(payrollInput({ rules: [rule('100', chosen)] })), 2, '100'), '300.00');
  const precise = binary('multiply', binary('divide', lit('1'), lit('3')), lit('3', 'money'));
  const staged = binary('multiply', { op: 'round', value: binary('divide', lit('1'), lit('3')), rounding: policy('half_up', 2) }, lit('3', 'money'));
  assert.equal(rowAmount(calculateOwnPayroll(payrollInput({ rules: [rule('100', precise)] })), 1, '100'), '1.00');
  assert.equal(rowAmount(calculateOwnPayroll(payrollInput({ rules: [rule('100', staged)] })), 1, '100'), '0.99');
});
test('no convierte horas ni porcentajes a coeficientes sin factor y respaldo expresos', () => {
  assert.throws(() => calculateOwnPayroll(payrollInput({ rules: [rule('100', binary('multiply', lit('10', 'hours'), lit('12', 'money')))] })), error('CONVERSION_REQUIRED'));
  const converted = { op: 'convert', value: lit('12.5', 'percent'), factor: '0.01', unit: 'coefficient', conversionReference: 'Conversión inventada QA del porcentaje declarado' };
  assert.equal(rowAmount(calculateOwnPayroll(payrollInput({ rules: [rule('100', binary('multiply', lit('100', 'money'), converted))] })), 1, '100'), '12.50');
  assert.throws(() => calculateOwnPayroll(payrollInput({ rules: [rule('100', binary('add', lit('10', 'hours'), lit('12', 'money')))] })), error('UNIT_MISMATCH'));
  const input = payrollInput(); input.employees[0].inputs[0].unit = 'hours'; assert.throws(() => calculateOwnPayroll(input), error('UNIT_MISMATCH'));
});
test('instantáneas y resultados son inmutables y sus hashes reproducibles independientemente del orden de consulta', () => {
  const input = payrollInput(), original = structuredClone(input), a = createOwnPayrollSnapshot(input);
  input.employees.reverse(); input.employees.forEach(e => e.inputs.reverse()); input.rules.reverse();
  const b = createOwnPayrollSnapshot(input); assert.equal(a.inputSha256, b.inputSha256); assert.equal(a.resultSha256, b.resultSha256);
  assert.deepEqual(a.input, normalizeOwnPayrollInput(original)); assert.equal(Object.isFrozen(a.result.rows[0].trace), true);
  input.employees[0].inputs.find(i => i.key === 'base').value = '400.00';
  assert.notEqual(createOwnPayrollSnapshot(input).inputSha256, a.inputSha256); assert.equal(a.result.employeeTotals[1].net, '382.10');
  assert.throws(() => { a.result.employeeTotals[0].net = '0.00'; }, TypeError);
  assert.throws(() => { a.input.employees[0].inputs[0].value = '0.00'; }, TypeError);
});
const invalid = [
  ['población incompleta', 'SCOPE_INVALID', i => { i.populationComplete = false; }],
  ['período inferido', 'SCOPE_INVALID', i => { i.period = 'octubre'; }],
  ['tipo desconocido', 'SCOPE_INVALID', i => { i.liquidationType = 'auto'; }],
  ['fuente sin versión', 'SOURCE_VERSION_REQUIRED', i => { i.sourceVersions.rules = null; }],
  ['contrato repetido', 'DUPLICATE', i => { i.employees.push(i.employees[0]); }],
  ['entrada repetida', 'DUPLICATE', i => { i.employees[0].inputs.push(i.employees[0].inputs[0]); }],
  ['redondeo omitido', 'ROUNDING_REQUIRED', i => { i.rules[0].rounding = {}; }],
  ['texto ejecutable', 'OPERATION_UNSUPPORTED', i => { i.rules[0].expression = { op: 'eval', text: 'globalThis.sideEffect=true' }; }],
  ['rutina externa', 'OPERATION_UNSUPPORTED', i => { i.rules[0].expression = { op: 'specialRoutine', name: 'municipal' }; }],
  ['campos IAM', 'CONTRACT_INVALID', i => { i.principalId = payrollId(1); }],
  ['búsqueda como población', 'CONTRACT_INVALID', i => { i.search = 'filtrar'; }],
  ['reglas omitidas', 'QUANTITY_LIMIT', i => { i.rules = []; }],
  ['importe como Number', 'DECIMAL_INVALID', i => { i.employees[0].inputs[0].value = 100.1; }],
  ['huecos en filas', 'CONTRACT_INVALID', i => { delete i.employees[0]; }],
  ['propiedad extra en filas', 'CONTRACT_INVALID', i => { i.employees.search = 'ocultar'; }],
];
for (const [name, code, change] of invalid) test(`rechaza ${name} sin entregar un cálculo parcial`, () => { const input = payrollInput(); change(input); assert.throws(() => calculateOwnPayroll(input), error(code)); });
test('no ejecuta accesores ni permite convertir/redondear condiciones', () => {
  const input = payrollInput(); Object.defineProperty(input, 'employees', { enumerable: true, get() { throw Error('no ejecutar'); } });
  assert.throws(() => calculateOwnPayroll(input), error('CONTRACT_INVALID'));
  const condition = { op: 'compare', operator: 'eq', left: lit('1'), right: lit('1') };
  assert.throws(() => calculateOwnPayroll(payrollInput({ rules: [rule('100', { op: 'choose', condition: { op: 'round', value: condition, rounding: policy() }, then: lit('1', 'money'), else: lit('2', 'money') })] })), error('UNIT_MISMATCH'));
});
test('límites de población, árbol y profundidad son incidencias globales; no generan filas omitidas', () => {
  assert.throws(() => calculateOwnPayroll(payrollInput({ employees: Array.from({ length: 10001 }, (_, i) => employee(i + 1)) })), error('QUANTITY_LIMIT'));
  let tree = lit('1', 'money'); for (let i = 0; i < 34; i++) tree = binary('add', tree, lit('0', 'money'));
  assert.throws(() => calculateOwnPayroll(payrollInput({ rules: [rule('100', tree)] })), error('EXPRESSION_LIMIT'));
  const wide = n => n ? binary('add', wide(n - 1), wide(n - 1)) : lit('1', 'money');
  assert.throws(() => calculateOwnPayroll(payrollInput({ rules: [rule('100', wide(8))] })), error('EXPRESSION_LIMIT'));
});
test('totales no aplican un redondeo implícito ni incluyen contribuciones o auxiliares como neto', () => {
  const input = payrollInput({ rules: [rule('100', lit('1.001', 'money'), { rounding: policy('exact', 3) })] });
  assert.throws(() => calculateOwnPayroll(input), error('ROUNDING_NEEDED'));
  input.totalsPrecision = 3; assert.equal(calculateOwnPayroll(input).employeeTotals[0].net, '1.001');
});
test('cadena excesiva de conceptos es una incidencia global, no un desborde del stack', () => {
  const rules = Array.from({ length: 66 }, (_, i) => rule(String(100 + i), i === 65 ? lit('1', 'money') : ref(String(101 + i))));
  assert.throws(() => calculateOwnPayroll(payrollInput({ rules })), error('DEPENDENCY_LIMIT'));
});
test('campos ocultos no se pierden al normalizar ni pueden alterar la entrada identificada por hash', () => {
  const input = payrollInput(); Object.defineProperty(input, 'secretExtra', { value: true });
  assert.throws(() => calculateOwnPayroll(input), error('CONTRACT_INVALID'));
});
test('la regla declara si consume el concepto exacto o su valor ya redondeado', () => {
  const rules = [rule('100', lit('1.005', 'money')), rule('110', ref('100', 'rounded')), rule('120', ref('100', 'exact'), { rounding: policy('half_even') })];
  const result = calculateOwnPayroll(payrollInput({ rules }));
  assert.equal(rowAmount(result, 1, '110'), '1.01'); assert.equal(rowAmount(result, 1, '120'), '1.00');
  rules[1].expression = { op: 'concept', code: '100' };
  assert.throws(() => calculateOwnPayroll(payrollInput({ rules })), error('CONTRACT_INVALID'));
});
