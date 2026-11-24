// «Preparar el mes siguiente»: lo que vencía en el mes cerrado sigue por sucesión explícita, sin tocar fórmulas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rollProgramToNextMonth} from '../assets/own-payroll-program-month-roll.js';
import {policySha256} from '../assets/own-payroll-policy-validity.js';

const def = () => ({
  rules: [{code: '1', agreementCode: '1', validFrom: '2026-10', validUntil: '2026-10', liquidationTypes: ['monthly'], expression: {op: 'literal'}},
    {code: '2', agreementCode: '1', validFrom: '2026-09', validUntil: '2026-09', liquidationTypes: ['monthly'], expression: {op: 'literal'}}],
  quantityPhases: [{code: '1', validFrom: '2026-10', validUntil: '2026-10'}],
  quantityOnlyInputPolicies: [{policyId: 'q1', supersedes: null, agreementCode: '1', validFrom: '2026-10', validUntil: '2026-10', liquidationType: 'monthly'}],
  officialTotalsVersion: 'own-payroll-official-totals.v1',
  officialTotalsPolicies: [{version: 'own-payroll-official-totals.v1', agreementCode: '1', period: '2026-10', liquidationType: 'monthly', totalCodes: []}]
});

test('abre reglas y fases que vencían, sin tocar las anteriores ni las fórmulas', () => {
  const before = def(), {program, summary} = rollProgramToNextMonth(before, '2026-10');
  assert.equal(program.rules[0].validUntil, null); assert.equal(program.rules[1].validUntil, '2026-09');
  assert.deepEqual(program.rules[0].expression, before.rules[0].expression);
  assert.equal(program.quantityPhases[0].validUntil, null);
  assert.equal(summary.next, '2026-11'); assert.equal(before.rules[0].validUntil, '2026-10', 'no modifica la entrada');
});

test('las políticas con vigencia declaran sucesora y las de un solo período pasan a la versión con vigencia', () => {
  const before = def(), {program} = rollProgramToNextMonth(before, '2026-10');
  const [old, next] = program.quantityOnlyInputPolicies;
  assert.deepEqual(old, before.quantityOnlyInputPolicies[0]);
  assert.equal(next.validFrom, '2026-11'); assert.equal(next.validUntil, null);
  assert.deepEqual(next.supersedes, {policyId: 'q1', policySha256: policySha256(old)});
  assert.equal(program.officialTotalsVersion, 'own-payroll-official-totals.v2');
  const t = program.officialTotalsPolicies[1];
  assert.equal(t.version, 'own-payroll-official-totals.v2'); assert.equal(t.validFrom, '2026-11'); assert.ok(!('period' in t));
  assert.deepEqual(program.officialTotalsPolicies[0], before.officialTotalsPolicies[0]);
  // Repetirlo no duplica sucesoras.
  assert.equal(rollProgramToNextMonth(program, '2026-10').program.quantityOnlyInputPolicies.length, 2);
});

test('es idempotente, no pisa vigencias posteriores y deja forzados y cobertura por un mes', () => {
  const base = def();
  base.rules.push({code: '3', agreementCode: '1', validFrom: '2026-10', validUntil: '2026-10', liquidationTypes: ['monthly'], expression: {op: 'literal'}},
    {code: '3', agreementCode: '1', validFrom: '2026-11', validUntil: null, liquidationTypes: ['monthly'], expression: {op: 'literal', v: 2}});
  base.monthlyForcedAmountPolicies = [{agreementCode: '1', period: '2026-10', liquidationType: 'monthly', sourceCode: '1'}];
  const once = rollProgramToNextMonth(base, '2026-10').program, twice = rollProgramToNextMonth(once, '2026-10').program;
  assert.deepEqual(twice, once);
  assert.equal(once.rules.find(r => r.code === '3' && r.validFrom === '2026-10').validUntil, '2026-10', 'ya tenía sucesora declarada');
  assert.equal(once.rules.filter(r => r.code === '1').length, 2, 'regla de un forzado: se copia, no se extiende');
  assert.equal(once.monthlyForcedAmountPolicies.at(-1).validUntil, '2026-11');
  assert.equal(once.monthlyForcedAmountsVersion, 'own-monthly-forced-passthrough.v2');
});
