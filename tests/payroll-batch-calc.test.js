import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BATCH_CALC_SIZE, batchCalcAgreements, batchCalcLegajos, batchCalcLiquidationDate, batchCalcMoney, batchCalcPlan, batchCalcSum, batchCalcTotals } from '../assets/payroll-batch-calc-model.js';

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const roster = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ contractId: id(i + 1), legajo: String(1000 + i), agreement: 'PERSONAL INTERINO', status: 'active', startDate: '2020-01-01', ...extra }));

test('reads typed or pasted legajos and reports what is not a legajo', () => {
  assert.deepEqual(batchCalcLegajos(' 1177, 1188;1256\n1335  01177 x12 '), { valid: ['1177', '1188', '1256', '1335'], invalid: ['x12'] });
  assert.deepEqual(batchCalcLegajos(''), { valid: [], invalid: [] });
});

test('lists agreements with their active contracts only', () => {
  const rows = [...roster(3), { contractId: id(90), legajo: '9', agreement: 'JARDINES', status: 'active' }, { contractId: id(91), legajo: '8', agreement: 'JARDINES', status: 'inactive' }, { contractId: null, legajo: '7', agreement: 'JARDINES', status: 'active' }];
  assert.deepEqual(batchCalcAgreements(rows), [{ agreement: 'JARDINES', people: 1 }, { agreement: 'PERSONAL INTERINO', people: 3 }]);
});

test('a large agreement is split into even batches that fit one run', () => {
  const plan = batchCalcPlan(roster(292), { agreement: 'PERSONAL INTERINO', period: '2026-11' });
  assert.equal(plan.people, 292);
  assert.deepEqual(plan.batches.map(b => b.people), [73, 73, 73, 73]);
  assert.ok(plan.batches.every(b => b.people <= BATCH_CALC_SIZE));
  assert.equal(new Set(plan.batches.flatMap(b => b.contractIds)).size, 292);
  assert.equal(plan.batches[0].firstLegajo, '1000');
  assert.equal(plan.batches.at(-1).lastLegajo, '1291');
  assert.equal(plan.liquidationDate, '2026-11-30');
  assert.equal(batchCalcLiquidationDate('2028-02'), '2028-02-29');
});

test('people left out this month never enter a batch, and unknown legajos are reported', () => {
  const plan = batchCalcPlan(roster(100), { agreement: 'PERSONAL INTERINO', period: '2026-11', excluded: ['1001', '01005', '7777'] });
  assert.equal(plan.people, 98);
  assert.deepEqual(plan.excluded, ['1001', '1005']);
  assert.deepEqual(plan.excludedNotFound, ['7777']);
  assert.ok(!plan.batches.flatMap(b => b.contractIds).includes(id(2)));
});

test('contracts of another agreement, inactive or starting after the month are not calculated', () => {
  const rows = [...roster(2), { contractId: id(50), legajo: '2500', agreement: 'PERSONAL INTERINO', status: 'active', startDate: '2026-12-01' }, { contractId: id(51), legajo: '1957', agreement: 'PERSONAL INTERINO', status: 'inactive' }, { contractId: id(52), legajo: '3', agreement: 'OTRO', status: 'active' }];
  const plan = batchCalcPlan(rows, { agreement: 'PERSONAL INTERINO', period: '2026-11' });
  assert.equal(plan.people, 2);
  assert.deepEqual(plan.notStarted, ['2500']);
  assert.equal(batchCalcPlan(rows, { agreement: 'SIN GENTE', period: '2026-11' }).batches.length, 0);
});

test('requires month and agreement', () => {
  assert.throws(() => batchCalcPlan(roster(1), { agreement: 'PERSONAL INTERINO', period: '2026-13' }), /mes/);
  assert.throws(() => batchCalcPlan(roster(1), { agreement: '', period: '2026-11' }), /convenio/);
});

test('totals add exactly in cents', () => {
  const a = batchCalcTotals([{ gross: '863813.96', deduction: '149975.68', net: '713838.28' }, { gross: '0.10', deduction: '0.2', net: '-0.10' }]);
  assert.deepEqual(a, { people: 2, gross: '863814.06', deduction: '149975.88', net: '713838.18' });
  assert.deepEqual(batchCalcSum([a, { people: 1, gross: '0.94', deduction: '0.12', net: '0.82' }]), { people: 3, gross: '863815.00', deduction: '149976.00', net: '713839.00' });
  assert.equal(batchCalcMoney('1234567.80'), '$\u00a01.234.567,80');
  assert.throws(() => batchCalcTotals([{ gross: 'x', deduction: '0', net: '0' }]), /importe/);
});

test('batch calculation files are part of the published build', () => {
  const build = fs.readFileSync('scripts/build-friendly.mjs', 'utf8');
  for (const file of ['assets/payroll-batch-calc-model.js', 'assets/payroll-batch-calc.js', 'assets/payroll-batch-calc.css']) assert.ok(build.includes("'" + file + "'"), file);
});
