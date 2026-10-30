import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ownCapacityLiteralAdditions} from '../scripts/lib/own-payroll-capacity-literal-additions.mjs';
import {rule, lit, fact, payrollId} from './fixtures/own-payroll-synthetic.js';
import {requireExactProgramChanges} from '../assets/own-payroll-program-precision.js';
import {ownProgramStructure, ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {calculateOwnPayroll} from '../assets/own-payroll-engine.js';

const period = '2026-10';
function originalProgramme() {
  return ownProgramStructure({namespaceVersion: 'own-payroll-namespaces.v2',
    periodContextVersion: 'own-payroll-period-context.v1', totalsPrecision: 2,
    rules: [
      rule('1', lit('100.20', 'money'), {validUntil: period, rounding: {mode: 'exact', precision: 2}, ruleReference: 'Regla inventada QA190, sin norma municipal'}),
      rule('101', fact('month', 'units'), {nature: 'auxiliary', unit: 'units', validUntil: period, rounding: {mode: 'exact', precision: 0}, ruleReference: 'Mes declarado ficticio QA190'})
    ],
    bindings: [{agreementCode: '1', key: 'month', unit: 'units', sourceKind: 'period_context_fact', sourceField: 'monthNumber', onMissing: 'error', combine: 'single', ruleReference: 'Fuente propia declarada ficticia QA190'}]
  });
}
function previousAdditions() {
  // Reproduce the exact oldinline call: fixture rule() supplied half_up2.
  return ownCapacityLiteralAdditions().map(value => rule(value.code, structuredClone(value.expression), {ruleReference: value.ruleReference}));
}
function extended(before, additions) {
  return ownProgramStructure({...structuredClone(before), rules: [...structuredClone(before.rules), ...additions]});
}
function input(programme, employeeCount = 855) {
  return {version: 'own-payroll-input.v2', period, liquidationType: 'monthly',
    selection: {kind: 'all', values: []}, populationComplete: true, totalsPrecision: 2,
    sourceVersions: {population: 'a'.repeat(64), rules: createHash('sha256').update(JSON.stringify(programme.rules)).digest('hex'), novelties: 'c'.repeat(64)},
    employees: Array.from({length: employeeCount}, (_, n) => ({contractId: payrollId(31000 + n), employeeNumber: String(31000 + n), agreementCode: '1', departmentCode: '1', inputs: [{key: 'month', unit: 'units', value: '10', sourceReference: 'Período exclusivamente sintético QA190'}]})),
    rules: programme.rules};
}

test('the actual precision preflight rejects the previous18 half_up additions and admits their explicit exact literal replacements', () => {
  const before = originalProgramme(), saved = structuredClone(before);
  const oldCandidate = extended(before, previousAdditions());
  const candidate = extended(before, ownCapacityLiteralAdditions());
  assert.throws(() => requireExactProgramChanges(before, oldCandidate), error => error.code === 'PROGRAM_PRECISION_REQUIRED' && /700/.test(error.message));
  assert.strictEqual(requireExactProgramChanges(before, candidate), candidate);
  ownProgramHistory(before, candidate);
  assert.deepEqual(before, saved); assert.equal(candidate.rules.length, 20);
  for (const oldRule of before.rules) assert.deepEqual(candidate.rules.find(value => value.code === oldRule.code && value.nature === oldRule.nature), oldRule);
  assert.deepEqual(candidate.bindings, before.bindings);
});

test('all18 additions retain code, dates, literal, reference and every field except the explicit rounding mode', () => {
  const old = previousAdditions(), next = ownCapacityLiteralAdditions();
  assert.equal(next.length, 18); assert.deepEqual(next.map(value => value.code), Array.from({length: 18}, (_, n) => String(700 + n)));
  assert.equal(new Set(next.map(value => value.code)).size, 18);
  for (let n = 0; n < 18; n++) {
    assert.deepEqual(next[n], {...old[n], rounding: {precision: 2, mode: 'exact'}});
    assert.deepEqual(next[n].expression, {op: 'literal', value: '1.00', unit: 'money'});
    assert.equal(next[n].validFrom, period); assert.equal(next[n].validUntil, null);
    assert.deepEqual(next[n].liquidationTypes, ['monthly']); assert.ok(next[n].ruleReference.length <= 180);
  }
  const again = ownCapacityLiteralAdditions(); next[0].expression.value = '999';
  assert.equal(again[0].expression.value, '1.00');
});

test('the real pure engine preserves all17100 financial rows and every118.20 employee total for855 synthetic inputs', () => {
  const before = originalProgramme(), legacy = calculateOwnPayroll(input(extended(before, previousAdditions())));
  const exact = calculateOwnPayroll(input(extended(before, ownCapacityLiteralAdditions())));
  assert.equal(exact.employeeCount, 855); assert.equal(exact.rowCount, 17100);
  assert.deepEqual(exact.employeeTotals, legacy.employeeTotals);
  const financial = row => {const {rounding: _policy, ...rest} = row; return rest;};
  assert.deepEqual(exact.rows.map(financial), legacy.rows.map(financial));
  for (const employee of exact.employeeTotals) {
    assert.equal(employee.remuneration, '118.20'); assert.equal(employee.gross, '118.20'); assert.equal(employee.net, '118.20');
    for (const key of ['non_remuneration', 'deduction', 'employer_contribution']) assert.equal(employee[key], '0.00');
    const rows = exact.rows.filter(row => row.contractId === employee.contractId);
    assert.equal(rows.length, 20); assert.equal(rows.filter(row => row.nature === 'auxiliary').length, 1);
    assert.equal(rows.find(row => row.conceptCode === '101' && row.nature === 'auxiliary').amount, '10');
  }
  assert.equal(exact.employeeTotals.reduce((sum, row) => sum + BigInt(row.net.replace('.', '')), 0n), 11820n * 855n);
  assert.equal(exact.payrollPosted, false); assert.equal(exact.paymentExecuted, false);
});

test('the explicit exact literal correction still rejects an unapproved16-over30 rounding result', () => {
  const before = originalProgramme(), changed = extended(before, ownCapacityLiteralAdditions());
  changed.rules = changed.rules.map(value => value.nature === 'auxiliary' ? value : ({...value, expression: {op: 'multiply', left: value.expression, right: {op: 'divide', left: lit('16', 'days'), right: lit('30', 'days')}}}));
  // This negative arithmetic witness does not fabricate an approved193 capture.
  assert.throws(() => calculateOwnPayroll(input(changed, 1)), error => error.code === 'ROUNDING_NEEDED');
});
