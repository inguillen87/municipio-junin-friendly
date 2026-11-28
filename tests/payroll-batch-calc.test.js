import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BATCH_CALC_SIZE, batchCalcAgreements, batchCalcLegajos, batchCalcLiquidationDate, batchCalcMoney, batchCalcPlan, batchCalcSum, batchCalcTotals, batchCalcType, batchCalcUndoRuns, batchCalcUndoScan } from '../assets/payroll-batch-calc-model.js';

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

test('only the listed legajos are planned when a short list is given', () => {
  const plan = batchCalcPlan(roster(200), { agreement: 'PERSONAL INTERINO', period: '2026-11', only: ['1003', '1001', '9999'], excluded: ['1001'] });
  assert.equal(plan.people, 1); assert.deepEqual(plan.only, ['1001', '1003']); assert.deepEqual(plan.onlyNotFound, ['9999']);
  assert.deepEqual(plan.excluded, ['1001']); assert.deepEqual(plan.excludedNotFound, []); assert.deepEqual(plan.batches[0].contractIds, [id(4)]);
  assert.equal(batchCalcPlan(roster(200), { agreement: 'PERSONAL INTERINO', period: '2026-11' }).people, 200);
});

test('the newest run that holds a person decides what can be done with them', () => {
  const runs = batchCalcUndoRuns([
    { id: 'a', period: '2026-11', liquidationType: 'monthly', createdAt: '2026-11-27T10:00:00Z' },
    { id: 'b', period: '2026-11', liquidationType: 'monthly', createdAt: '2026-11-27T12:00:00Z' },
    { id: 'c', period: '2026-10', liquidationType: 'monthly', createdAt: '2026-11-27T13:00:00Z' },
    { id: 'd', period: '2026-11', liquidationType: 'sac', createdAt: '2026-11-27T14:00:00Z' },
  ], '2026-11');
  assert.deepEqual(runs.map(r => r.id), ['b', 'a']);
  const wanted = new Set([id(1), id(2), id(3), id(4), id(5)]), seen = new Set();
  const newest = batchCalcUndoScan([
    { contractId: id(1), state: 'confirmed', allowedCommands: ['annul'] },
    { contractId: id(2), state: 'calculated', allowedCommands: ['confirm'] },
    { contractId: id(3), state: 'calculated', allowedCommands: ['cancel'] },
    { contractId: id(4), state: 'annulled', allowedCommands: [] },
    { contractId: id(9), state: 'confirmed', allowedCommands: ['annul'] },
  ], wanted, seen);
  assert.deepEqual(newest, { confirm: [id(2)], annul: [id(1)], cancel: [id(3)], blocked: [], confirmed: 1, calculated: 2 });
  const older = batchCalcUndoScan([
    { contractId: id(1), state: 'calculated', allowedCommands: ['confirm'] },
    { contractId: id(4), state: 'calculated', allowedCommands: ['confirm'] },
    { contractId: id(5), state: 'confirmed', allowedCommands: [] },
  ], wanted, seen);
  assert.deepEqual(older, { confirm: [], annul: [], cancel: [], blocked: [id(5)], confirmed: 1, calculated: 0 });
  assert.equal(seen.size, 5);
});

test('the liquidation type travels with the plan and only known types are offered', () => {
  assert.equal(batchCalcPlan(roster(5), { agreement: 'PERSONAL INTERINO', period: '2026-11' }).liquidationType, 'monthly');
  assert.equal(batchCalcPlan(roster(5), { agreement: 'PERSONAL INTERINO', period: '2026-11', liquidationType: 'vacation' }).liquidationType, 'vacation');
  assert.throws(() => batchCalcPlan(roster(5), { agreement: 'PERSONAL INTERINO', period: '2026-11', liquidationType: 'bonus' }), /tipo de liquidación/);
  assert.equal(batchCalcType('vacation').reason, 'Segunda liquidación'); assert.equal(batchCalcType('x').value, 'monthly');
  const runs = [{ id: 'm', period: '2026-11', liquidationType: 'monthly', createdAt: '2026-11-27T10:00:00Z' }, { id: 'v', period: '2026-11', liquidationType: 'vacation', createdAt: '2026-11-27T11:00:00Z' }];
  assert.deepEqual(batchCalcUndoRuns(runs, '2026-11', 'vacation').map(r => r.id), ['v']); assert.deepEqual(batchCalcUndoRuns(runs, '2026-11').map(r => r.id), ['m']);
});

test('the legajo finder lists the active people of the agreement and searches by legajo or name without accents', async () => {
  const { batchCalcPeople, batchCalcSearch } = await import('../assets/payroll-batch-calc-model.js');
  const rows = [
    { contractId: 'a', legajo: '1344', name: 'PÉREZ JUAN', agreement: 'PERSONAL TEMPORARIO', status: 'active' },
    { contractId: 'b', legajo: '134', name: 'GÓMEZ ANA MARÍA', agreement: 'PERSONAL TEMPORARIO', status: 'active' },
    { contractId: 'c', legajo: '200', name: 'BAJA', agreement: 'PERSONAL TEMPORARIO', status: 'inactive' },
    { contractId: 'd', legajo: '1', name: 'OTRO', agreement: 'OTRO CONVENIO', status: 'active' },
  ];
  const people = batchCalcPeople(rows, 'PERSONAL TEMPORARIO');
  assert.deepEqual(people, [{ legajo: '134', name: 'GÓMEZ ANA MARÍA' }, { legajo: '1344', name: 'PÉREZ JUAN' }]);
  assert.deepEqual(batchCalcSearch(people, '134').map(p => p.legajo), ['134', '1344']);
  assert.deepEqual(batchCalcSearch(people, 'perez').map(p => p.legajo), ['1344']);
  assert.deepEqual(batchCalcSearch(people, 'maria gom').map(p => p.legajo), ['134']);
  assert.deepEqual(batchCalcSearch(people, '134', { skip: ['134'] }).map(p => p.legajo), ['1344']);
  assert.deepEqual(batchCalcSearch(people, ''), []);
  assert.equal(batchCalcSearch(people, 'zz').length, 0);
});
