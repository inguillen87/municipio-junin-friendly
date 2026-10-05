import test from 'node:test';
import assert from 'node:assert/strict';
import { ownProgramDefinition, ownProgramStructure, ownProgramCommand, ownProgramBootstrap, ownProgramHistory } from '../assets/own-payroll-program-model.js';
import { program, definitions, command, bootstrap } from './fixtures/own-payroll-program-synthetic.js';
import { fact, rule, ref, lit } from './fixtures/own-payroll-synthetic.js';
test('regla monetaria no confunde unidad y precisión de entrada con valoración final', () => {
  const p = ownProgramDefinition(program(), definitions()); assert.equal(p.rules.length, 6); assert.equal(p.rules[0].unit, 'money'); assert.equal(p.rules[0].rounding.precision, 2);
  assert.equal(definitions().find(x => x.code === '100').unit, 'units'); assert.equal(definitions().find(x => x.code === '100').precision, 6);
});
for (const [label, change, code] of [
  ['parámetro ausente', (_, d) => d.find(x => x.code === '8800').value = null, 'SOURCE_DEFINITION_MISSING'],
  ['unidad incompatible', p => p.bindings.find(b => b.key === 'base').unit = 'hours', 'BINDING_MISSING'],
  ['falta definición de salida', (_, d) => d.splice(d.findIndex(x => x.code === '100'), 1), 'DEFINITION_MISSING'],
  ['vigencia incompleta', (_, d) => d.find(x => x.code === '8800').validUntil = '2026-10', 'SOURCE_DEFINITION_MISSING'],
  ['sumar parámetro', p => p.bindings.find(b => b.key === 'base').combine = 'sum', 'BINDING_INVALID'],
  ['suponer parámetro cero', p => p.bindings.find(b => b.key === 'base').onMissing = 'zero', 'BINDING_INVALID'],
  ['entrada sin uso', p => p.bindings.push({ ...p.bindings[0], key: 'unused' }), 'BINDING_UNUSED'],
  ['entrada repetida', p => p.bindings.push({ ...p.bindings[0] }), 'BINDING_DUPLICATE'],
  ['dependencia faltante futura', p => p.rules[0].validUntil = '2026-10', 'RULE_MISSING'],
  ['ciclo', p => p.rules[0].expression = ref('110'), 'RULE_CYCLE'],
  ['sin redondeo', p => delete p.rules[0].rounding, 'CONTRACT_INVALID'],
  ['texto ejecutable', p => p.rules[0].expression = { op: 'eval', text: 'GRH()' }, 'OPERATION_UNSUPPORTED'],
]) test('bloquea ' + label + ' sin perder filas', () => { const p = program(), d = definitions(); change(p, d); assert.throws(() => ownProgramDefinition(p, d), e => e.code === code); });
test('tipos y convenios se revisan por separado, con orden canónico', () => {
  const p = { rules: [rule('1', lit('1', 'money'), { agreementCode: '10', liquidationTypes: ['sac', 'monthly'] }), rule('1', fact('base'))], bindings: [program().bindings.find(b => b.key === 'base')], totalsPrecision: 2 };
  assert.deepEqual(ownProgramStructure(p), ownProgramStructure({ ...p, rules: [...p.rules].reverse() }));
});
test('cerrar vigencia conserva antecedentes; retirarlos se rechaza', () => { const before = program(), after = program(); after.rules[0].validUntil = '2026-10'; ownProgramHistory(before, after); after.rules.splice(0, 1); assert.throws(() => ownProgramHistory(before, after), /Conservá/); });
test('proponer no aprueba, calcula ni contabiliza; rechaza atributos municipales agregados', () => {
  ownProgramCommand(command(), definitions()); ownProgramBootstrap(bootstrap());
  assert.throws(() => ownProgramCommand(command({ tenantId: 'ignored' })), /Revisá/);
  assert.throws(() => ownProgramBootstrap(bootstrap({ payrollCalculated: true })), /verificar/);
});
test('capacidad de vigencias es una incidencia global y no omite reglas', () => {
  const rules = Array.from({ length: 400 }, (_, n) => rule(String(10000 + n), lit('1', 'money'), { validFrom: String(2008 + Math.floor(n / 12)) + '-' + String(n % 12 + 1).padStart(2, '0') }));
  assert.throws(() => ownProgramStructure({ rules, bindings: [], totalsPrecision: 2 }), e => e.code === 'EXPRESSION_LIMIT'); assert.equal(rules.length, 400);
});
