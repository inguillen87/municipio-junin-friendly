import assert from 'node:assert/strict';
import test from 'node:test';

import internalDataHandler, { budgetApproved, createInternalDataHandler } from '../api/internal-data.js';
import { JUNIN_BUDGET_2026 } from '../assets/junin-budget-2026.js';

function cloneSource() {
  return JSON.parse(JSON.stringify(JUNIN_BUDGET_2026));
}

function cents(value) {
  const match = /^(0|[1-9][0-9]*)\.([0-9]{2})$/.exec(value);
  assert.ok(match, `monto decimal no canónico: ${value}`);
  return (BigInt(match[1]) * 100n) + BigInt(match[2]);
}

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

test('budgetApproved publica montos oficiales y reconcilia en centavos enteros', () => {
  const result = budgetApproved();
  assert.equal(result.status, 200);
  const { approved, currency, source, execution } = result.payload.data;

  assert.deepEqual(currency, { code: 'ARS', basis: 'nominal', unit: 'pesos' });
  assert.equal(approved.expenditures, '31854092000.00');
  assert.equal(approved.resources, '27700964239.13');
  assert.equal(approved.financing, '4153127760.87');
  assert.equal(approved.fundingTotal, approved.expenditures);
  assert.equal(cents(approved.resources) + cents(approved.financing), cents(approved.expenditures));
  assert.equal(
    approved.breakdowns.expenditures.reduce((sum, row) => sum + cents(row.amount), 0n),
    cents(approved.expenditures),
  );
  assert.deepEqual(approved.breakdownCoverage, {
    expenditures: 'exhaustive',
    resources: 'not_available',
    financing: 'not_available',
  });
  assert.equal(source.legalInstrument.number, '1021/2025');
  assert.equal(source.cutoff, '2025-12-26');
  assert.equal(execution.status, 'source_not_loaded');
  assert.equal(result.payload.quality.monetaryArithmetic, 'integer_cents');
});

test('budgetApproved no inventa ejecución, porcentajes, desvíos ni granularidad ausente', () => {
  const result = budgetApproved();
  const { approved, execution } = result.payload.data;

  assert.deepEqual(execution, {
    status: 'source_not_loaded',
    available: false,
    modifiedBudget: null,
    committed: null,
    accrued: null,
    paid: null,
    executionRate: null,
    variance: null,
  });
  assert.deepEqual(approved.breakdowns.resources, []);
  assert.deepEqual(approved.breakdowns.financing, []);
  assert.match(result.payload.meta.methodology, /valores literales/i);
  assert.match(result.payload.meta.caveats.join(' '), /no ejecución presupuestaria/i);

  const serialized = JSON.stringify(result.payload);
  assert.doesNotMatch(serialized, /"(?:semaphore|trafficLight|trend|projection|forecast|share|deviation)"\s*:/i);
});

test('las partidas visibles reconcilian por artículo sin presentarse como clasificación exhaustiva', () => {
  const { approved } = budgetApproved().payload.data;
  const blocks = approved.explicitAppropriations;
  assert.deepEqual(Object.keys(blocks), [
    'capitalAppropriations',
    'capitalTransfers',
    'otherExplicitAppropriations',
  ]);
  assert.equal(blocks.capitalAppropriations.listedTotal, '4170000000.00');
  assert.equal(blocks.capitalTransfers.listedTotal, '1036000000.00');
  assert.equal(blocks.otherExplicitAppropriations.listedTotal, '40000000.00');
  for (const block of Object.values(blocks)) {
    assert.equal(block.coverage, 'non_exhaustive_budget_classification');
    assert.equal(
      block.items.reduce((sum, row) => sum + cents(row.amount), 0n),
      cents(block.listedTotal),
    );
    assert.notEqual(block.listedTotal, approved.expenditures);
    assert.equal(block.items.every((row) => typeof row.article === 'string'), true);
  }
});

test('la planta autorizada conserva unidades heterogéneas y bloquea un total ficticio de empleados', () => {
  const staffing = budgetApproved().payload.data.approved.staffingEstablishment;
  assert.equal(staffing.additive, false);
  assert.match(staffing.reasonNotAdditive, /unidades distintas/i);
  assert.equal(Object.hasOwn(staffing, 'total'), false);
  assert.equal(Object.hasOwn(staffing, 'employees'), false);

  const rows = [...staffing.departmentExecutive, ...staffing.deliberativeCouncil];
  assert.deepEqual([...new Set(rows.map((row) => row.unit))].sort(), [
    'contracted_staff', 'position', 'teaching_hour',
  ]);
  assert.equal(rows.some((row) => row.unit === 'teaching_hour'), true);
  assert.equal(rows.some((row) => row.unit === 'contracted_staff'), true);
});

test('budgetApproved falla cerrado si un centavo o una jurisdicción no reconcilia', () => {
  const fundingMismatch = cloneSource();
  fundingMismatch.totals.estimatedFinancing = '4153127760.88';
  assert.deepEqual(budgetApproved(fundingMismatch), {
    status: 503,
    payload: {
      ok: false,
      code: 'BUDGET_SOURCE_INVALID',
      error: 'La fuente oficial del presupuesto aprobado no superó la validación de integridad.',
    },
  });

  const jurisdictionMismatch = cloneSource();
  jurisdictionMismatch.expenseByJurisdiction.items[0].amount = '30879342000.01';
  assert.equal(budgetApproved(jurisdictionMismatch).status, 503);

  const explicitAppropriationMismatch = cloneSource();
  explicitAppropriationMismatch.capitalTransfers.items[0].amount = '3000000.01';
  assert.equal(budgetApproved(explicitAppropriationMismatch).status, 503);

  const unsafeNumericMoney = cloneSource();
  unsafeNumericMoney.totals.estimatedResources = 27700964239.13;
  assert.equal(budgetApproved(unsafeNumericMoney).status, 503);
});

test('budgetApproved expone sólo agregados institucionales y ninguna PII', () => {
  const result = budgetApproved();
  assert.equal(result.payload.meta.containsPersonalData, false);
  const serialized = JSON.stringify(result.payload).toLowerCase();
  for (const forbidden of [
    '"dni"', '"cuil"', '"legajo"', '"email"', '"phone"', '"domicile"',
    '"address"', '"personid"', '"contractid"',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `no debe publicar ${forbidden}`);
  }
});

test('el handler exige sesión v2, responde no-store y no abre Neon para budgetapproved', async () => {
  const unauthenticated = mockResponse();
  await internalDataHandler({ method: 'GET', query: { resource: 'budgetapproved' }, headers: {} }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(unauthenticated.payload.code, 'IDENTITY_SESSION_REQUIRED');
  assert.match(unauthenticated.headers['Cache-Control'], /private, no-store/);

  let accessOptions;
  const managedHandler = createInternalDataHandler({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      accessOptions = options;
      return {
        mode: 'managed',
        session: { email: 'budget@example.test' },
        principal: { tenant: { effectiveCapabilities: ['budget.approved.read'] } },
      };
    },
    getInternalSql: async () => { throw new Error('budgetapproved no debe abrir Neon'); },
  });
  const authenticated = mockResponse();
  await managedHandler({
    method: 'GET',
    query: { resource: 'budgetapproved' },
    headers: {},
  }, authenticated);

  assert.equal(authenticated.statusCode, 200);
  assert.equal(authenticated.payload.ok, true);
  assert.match(authenticated.headers['Cache-Control'], /private, no-store/);
  assert.equal(authenticated.headers.Vary, 'Cookie');
  assert.deepEqual(accessOptions.requiredCapabilities, ['budget.approved.read']);
  assert.equal(accessOptions.allowLegacy, false);
});
