import assert from 'node:assert/strict';
import test from 'node:test';

import { JUNIN_BUDGET_2026 } from '../assets/junin-budget-2026.js';

function decimalToCents(value) {
  assert.match(value, /^\d+\.\d{2}$/);
  const [whole, decimal] = value.split('.');
  return BigInt(whole) * 100n + BigInt(decimal);
}

function sumAmounts(items) {
  return items.reduce((total, item) => total + decimalToCents(item.amount), 0n);
}

test('presupuesto 2026 conserva identidad, grano y limites de la fuente oficial', () => {
  const budget = JUNIN_BUDGET_2026;
  assert.equal(budget.version, 'junin-approved-budget-2026.ordinance-1021-2025.v1');
  assert.equal(budget.source.normalizedInstrumentNumber, '1021/2025');
  assert.equal(budget.source.approvalDate, '2025-12-26');
  assert.equal(budget.source.fiscalYear, 2026);
  assert.equal(budget.source.file.pageCount, 9);
  assert.equal(budget.source.file.sha256, 'd362c07aefae0b0834e90d758f53073b507649de8cbd931e14f6b4e6c580ceaf');
  assert.equal(budget.source.file.annexSheetsPresent, false);
  assert.equal(budget.measurement.currency, 'ARS');
  assert.equal(budget.measurement.priceBasis, 'nominal');
  assert.equal(budget.measurement.status, 'approved_budget_only');
  assert.equal(budget.measurement.executionStatus, 'source_not_loaded');
  assert.ok(budget.limits.some((limit) => /planillas anexas.*no estan incluidas/i.test(limit)));
  assert.ok(budget.limits.some((limit) => /no contiene ejecucion/i.test(limit)));
});

test('recursos y financiamiento reconcilian exactamente con el gasto aprobado', () => {
  const { totals } = JUNIN_BUDGET_2026;
  const approved = decimalToCents(totals.approvedExpenditures);
  const funded = decimalToCents(totals.estimatedResources)
    + decimalToCents(totals.estimatedFinancing);
  assert.equal(approved, 3185409200000n);
  assert.equal(funded, approved);
});

test('las jurisdicciones 01 y 02 reconcilian exactamente con el gasto aprobado', () => {
  const budget = JUNIN_BUDGET_2026;
  assert.deepEqual(budget.expenseByJurisdiction.items.map((item) => item.code), ['01', '02']);
  assert.equal(
    sumAmounts(budget.expenseByJurisdiction.items),
    decimalToCents(budget.totals.approvedExpenditures),
  );
  assert.equal(
    decimalToCents(budget.expenseByJurisdiction.listedTotal),
    decimalToCents(budget.totals.approvedExpenditures),
  );
});

test('los importes explicitamente listados en los articulos 15, 17 y 21 reconcilian', () => {
  const budget = JUNIN_BUDGET_2026;
  assert.equal(
    sumAmounts(budget.capitalAppropriations.items),
    decimalToCents(budget.capitalAppropriations.listedTotal),
  );
  assert.equal(decimalToCents(budget.capitalAppropriations.listedTotal), 417000000000n);

  assert.equal(budget.capitalTransfers.items.length, 9);
  assert.equal(
    sumAmounts(budget.capitalTransfers.items),
    decimalToCents(budget.capitalTransfers.listedTotal),
  );
  assert.equal(decimalToCents(budget.capitalTransfers.listedTotal), 103600000000n);

  assert.equal(
    sumAmounts(budget.otherExplicitAppropriations.items),
    decimalToCents(budget.otherExplicitAppropriations.listedTotal),
  );
  assert.equal(decimalToCents(budget.otherExplicitAppropriations.listedTotal), 4000000000n);
});

test('los montos son decimales canonicos y el contrato completo es inmutable', () => {
  const budget = JUNIN_BUDGET_2026;
  const amounts = [
    ...Object.values(budget.totals),
    budget.expenseByJurisdiction.listedTotal,
    ...budget.expenseByJurisdiction.items.map((item) => item.amount),
    budget.capitalAppropriations.listedTotal,
    ...budget.capitalAppropriations.items.map((item) => item.amount),
    budget.capitalTransfers.listedTotal,
    ...budget.capitalTransfers.items.map((item) => item.amount),
    budget.otherExplicitAppropriations.listedTotal,
    ...budget.otherExplicitAppropriations.items.map((item) => item.amount),
  ];
  for (const amount of amounts) assert.match(amount, /^\d+\.\d{2}$/);

  assert.equal(Object.isFrozen(budget), true);
  assert.equal(Object.isFrozen(budget.source.file), true);
  assert.equal(Object.isFrozen(budget.capitalTransfers.items), true);
  assert.equal(Object.isFrozen(budget.capitalTransfers.items[0]), true);
  assert.throws(() => {
    budget.totals.approvedExpenditures = '0.00';
  }, TypeError);
  assert.throws(() => {
    budget.capitalTransfers.items.push({ amount: '0.00' });
  }, TypeError);
});

test('la planta visible preserva unidades heterogeneas sin fabricar un total de empleados', () => {
  const establishment = JUNIN_BUDGET_2026.staffingEstablishment;
  assert.equal(establishment.additive, false);
  assert.equal(establishment.departmentExecutive.find((item) => item.code === 'permanent_staff').quantity, 385);
  assert.equal(establishment.departmentExecutive.find((item) => item.code === 'sports_temporary_teaching_hours').unit, 'teaching_hour');
  assert.equal(establishment.departmentExecutive.find((item) => item.code === 'seos_contract_teachers').quantity, 101);
  assert.equal(establishment.deliberativeCouncil.find((item) => item.code === 'superior_authorities').quantity, 12);
  assert.equal('totalEmployees' in establishment, false);
});
