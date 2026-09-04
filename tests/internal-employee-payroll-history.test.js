import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInternalDataHandler,
  employeePayroll,
} from '../api/internal-data.js';
import {
  TENANT_DATA_CAPABILITIES,
  capabilitiesForInternalDataResource,
  principalHasCapabilities,
} from '../lib/internal-resource-access.js';

const CONTRACT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ACTOR_EMAIL = 'operador@junin.gob.ar';
const RELEASE_SHA = 'f'.repeat(40);

function response() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function payrollRow(overrides = {}) {
  return {
    payrollDate: '2026-08-31',
    sourcePeriod: 202608,
    sourceMonth: 8,
    payrollType: 'monthly',
    closureStatus: 'closed',
    itemCount: 25,
    distinctConcepts: 12,
    quantity: '30.5000',
    subjectEarnings: '1000.1',
    nonSubjectEarnings: '200',
    familyAllowance: '10.00',
    employeeWithholdings: '210.10',
    net: '1000',
    netPayable: '1000.00',
    employerContributions: '250.5',
    sourceCutoff: '2026-08-31T23:59:59.000Z',
    // If the database adapter ever returns extra columns, they must not leak.
    dni: '99999999',
    cuil: '20-99999999-9',
    nombre: 'NO PUBLICAR',
    email: 'no-publicar@example.test',
    rawFields: { secret: true },
    sourceId: 'GRH-RAW-1',
    sourceBatchId: '22222222-2222-4222-8222-222222222222',
    ...overrides,
  };
}

function managedAccess(overrides = {}) {
  return {
    mode: 'managed',
    session: { id: SESSION_ID, email: ACTOR_EMAIL, version: 3 },
    principal: {
      user: { email: ACTOR_EMAIL },
      tenant: {
        id: TENANT_ID,
        membershipId: MEMBERSHIP_ID,
        source: 'membership',
        certifiedReleaseSha: RELEASE_SHA,
        effectiveCapabilities: [
          TENANT_DATA_CAPABILITIES.WORKFORCE_EMPLOYEE_READ,
          TENANT_DATA_CAPABILITIES.PAYROLL_READ,
        ],
      },
    },
    ...overrides,
  };
}

function tenantSession(overrides = {}) {
  return {
    id: SESSION_ID,
    email: ACTOR_EMAIL,
    version: 3,
    releaseSha: RELEASE_SHA,
    ...overrides,
  };
}

function facadeEnvelope(rows = [payrollRow()], total = rows.length, overrides = {}) {
  return {
    found: true,
    items: rows,
    total,
    page: 1,
    limit: 12,
    year: null,
    ...overrides,
  };
}

function mockPayrollSql(rows = [payrollRow()], total = rows.length, overrides = {}) {
  const calls = [];
  const result = facadeEnvelope(rows, total, overrides);
  return {
    calls,
    async query(statement, values = []) {
      const sql = String(statement);
      calls.push({ sql, values });
      return [{ result }];
    },
  };
}

function ownKeysDeep(value, keys = []) {
  if (!value || typeof value !== 'object') return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    ownKeysDeep(child, keys);
  }
  return keys;
}

test('employeepayroll exige simultáneamente ficha nominal y lectura de nómina', async () => {
  assert.deepEqual(capabilitiesForInternalDataResource('employeepayroll'), [
    TENANT_DATA_CAPABILITIES.WORKFORCE_EMPLOYEE_READ,
    TENANT_DATA_CAPABILITIES.PAYROLL_READ,
  ]);
  const required = capabilitiesForInternalDataResource('employeepayroll');
  for (const capability of required) {
    assert.equal(principalHasCapabilities({ tenant: { effectiveCapabilities: [capability] } }, required), false);
  }
  assert.equal(principalHasCapabilities({ tenant: { effectiveCapabilities: required } }, required), true);

  const accessCalls = [];
  let ownerSqlRequested = false;
  let actionsSqlRequested = false;
  const handler = createInternalDataHandler({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      accessCalls.push(options);
      return null;
    },
    getInternalSql: async () => {
      ownerSqlRequested = true;
      return mockPayrollSql();
    },
    getActionCenterSql: async () => {
      actionsSqlRequested = true;
      return mockPayrollSql();
    },
    env: { NODE_ENV: 'test' },
  });
  await handler({ method: 'GET', query: { resource: 'employeepayroll', contractId: CONTRACT_ID } }, response());

  assert.equal(accessCalls.length, 1);
  assert.deepEqual(accessCalls[0].requiredCapabilities, [
    TENANT_DATA_CAPABILITIES.WORKFORCE_EMPLOYEE_READ,
    TENANT_DATA_CAPABILITIES.PAYROLL_READ,
  ]);
  assert.equal(accessCalls[0].requireDataPlaneReady, true);
  assert.equal(accessCalls[0].requireCertifiedDataBinding, true);
  assert.equal(accessCalls[0].allowLegacy, false);
  assert.equal(ownerSqlRequested, false);
  assert.equal(actionsSqlRequested, false);
});

test('el handler autorizado usa sesión administrada y sólo la conexión ACTIONS', async () => {
  const sql = mockPayrollSql([payrollRow()], 1);
  let ownerSqlCalls = 0;
  let actionsSqlCalls = 0;
  const handler = createInternalDataHandler({
    requireCompatibleInternalAccess: async () => managedAccess(),
    getInternalSql: async () => {
      ownerSqlCalls += 1;
      throw new Error('La lectura nominal no debe abrir la conexión propietaria');
    },
    getActionCenterSql: async () => {
      actionsSqlCalls += 1;
      return sql;
    },
    env: {
      NODE_ENV: 'test',
      INTERNAL_CERTIFIED_RELEASE_SHA: RELEASE_SHA,
      INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA,
    },
  });
  const res = response();
  await handler({
    method: 'GET',
    query: { resource: 'employeepayroll', contractId: CONTRACT_ID },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.data.items.length, 1);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.Vary, 'Cookie');
  assert.equal(ownerSqlCalls, 0);
  assert.equal(actionsSqlCalls, 1);
  assert.equal(sql.calls.length, 1);
  assert.match(sql.calls[0].sql, /^\s*SELECT\s+employee_payroll_history_v1\s*\(/i);
  assert.deepEqual(sql.calls[0].values, [
    ACTOR_EMAIL, SESSION_ID, 3, RELEASE_SHA, TENANT_ID, MEMBERSHIP_ID,
    CONTRACT_ID, null, 1, 12,
  ]);
});

test('employeePayroll rechaza identificador, año y paginación inseguros antes de consultar', async () => {
  const invalidQueries = [
    {},
    { contractId: '42' },
    { contractId: CONTRACT_ID, year: '1899' },
    { contractId: CONTRACT_ID, year: '2101' },
    { contractId: CONTRACT_ID, year: '20x6' },
    { contractId: CONTRACT_ID, page: '0' },
    { contractId: CONTRACT_ID, page: '1.5' },
    { contractId: CONTRACT_ID, page: '10001' },
    { contractId: CONTRACT_ID, limit: '0' },
    { contractId: CONTRACT_ID, limit: '25' },
    { contractId: CONTRACT_ID, limit: '12junk' },
  ];

  for (const query of invalidQueries) {
    let queried = false;
    const result = await employeePayroll({ async query() { queried = true; return []; } }, { query });
    assert.equal(result.status, 400, JSON.stringify(query));
    assert.equal(result.payload.ok, false, JSON.stringify(query));
    assert.equal(queried, false, JSON.stringify(query));
  }

  for (const year of ['1900', '2100']) {
    const validBoundary = await employeePayroll(
      mockPayrollSql([], 0, { year: Number(year), limit: 24 }),
      { query: { contractId: CONTRACT_ID, year, page: '1', limit: '24' } },
      managedAccess().principal,
      tenantSession(),
    );
    assert.equal(validBoundary.status, 200, `año límite ${year}`);
    assert.equal(validBoundary.payload.meta.year, Number(year));
    assert.equal(validBoundary.payload.meta.pagination.limit, 24);
  }
});

test('employeePayroll rechaza sesión o membresía inconsistente antes de consultar', async () => {
  const invalidContexts = [
    [undefined, undefined],
    [managedAccess().principal, tenantSession({ email: 'otro@junin.gob.ar' })],
    [{ ...managedAccess().principal, tenant: { ...managedAccess().principal.tenant, source: 'legacy' } }, tenantSession()],
    [{ ...managedAccess().principal, tenant: { ...managedAccess().principal.tenant, membershipId: 'no-uuid' } }, tenantSession()],
    [managedAccess().principal, tenantSession({ releaseSha: 'preview' })],
  ];
  for (const [principal, session] of invalidContexts) {
    const sql = mockPayrollSql();
    const result = await employeePayroll(
      sql,
      { query: { contractId: CONTRACT_ID } },
      principal,
      session,
    );
    assert.equal(result.status, 401);
    assert.equal(result.payload.code, 'EMPLOYEE_PAYROLL_SESSION_INVALID');
    assert.equal(sql.calls.length, 0);
  }
});

test('employeePayroll pagina y filtra por año con una única llamada parametrizada a la fachada', async () => {
  const sql = mockPayrollSql([payrollRow()], 25, { page: 2, limit: 3, year: 2026 });
  const result = await employeePayroll(sql, {
    query: { contractId: CONTRACT_ID, year: '2026', page: '2', limit: '3' },
  }, managedAccess().principal, tenantSession());

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload.meta.pagination, { page: 2, limit: 3, total: 25, pages: 9 });
  assert.equal(result.payload.meta.year, 2026);

  assert.equal(sql.calls.length, 1);
  const [facadeCall] = sql.calls;
  assert.match(facadeCall.sql, /^\s*SELECT\s+employee_payroll_history_v1\s*\(/i);
  assert.deepEqual(facadeCall.values, [
    ACTOR_EMAIL, SESSION_ID, 3, RELEASE_SHA, TENANT_ID, MEMBERSHIP_ID,
    CONTRACT_ID, 2026, 2, 3,
  ]);
  assert.doesNotMatch(facadeCall.sql, new RegExp(CONTRACT_ID, 'i'));
  assert.doesNotMatch(facadeCall.sql, /employment_contract|payroll_monthly_fact|source_payload|person_identity|grh_employees/i);
});

test('employeePayroll publica importes exactos y explicita el control aritmético derivado', async () => {
  const rows = [
    payrollRow(),
    payrollRow({
      payrollDate: '2026-07-31',
      closureStatus: 'closed',
      netPayable: '999.98',
    }),
    payrollRow({ payrollDate: '2026-06-30', closureStatus: 'open' }),
    payrollRow({ payrollDate: '2026-05-31', closureStatus: 'unknown' }),
    payrollRow({
      payrollDate: '2026-04-30',
      subjectEarnings: '90071992547409930.12',
      nonSubjectEarnings: '0',
      familyAllowance: '0',
      employeeWithholdings: '0',
      net: '90071992547409930.12',
      netPayable: '90071992547409930.12',
      employerContributions: '18014398509481986.02',
    }),
    payrollRow({
      payrollDate: '2026-03-31',
      closureStatus: 'closed',
      subjectEarnings: 'dato-corrupto',
      nonSubjectEarnings: null,
      familyAllowance: null,
      employeeWithholdings: null,
      net: null,
      netPayable: null,
      employerContributions: null,
    }),
  ];
  const result = await employeePayroll(
    mockPayrollSql(rows, rows.length, { limit: 6 }),
    { query: { contractId: CONTRACT_ID, limit: '6' } },
    managedAccess().principal,
    tenantSession(),
  );

  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.payload.data), ['items']);
  assert.equal(result.payload.meta.authority, 'GRH');
  assert.equal(result.payload.meta.grain, 'employment_contract_payroll_month');
  assert.equal(result.payload.meta.monetaryValuesRepresentation, 'decimal_string_2_places');
  assert.equal(result.payload.meta.containsDirectIdentifiers, false);
  assert.equal(result.payload.meta.isOfficialReceipt, false);
  assert.deepEqual(result.payload.meta.reconciliation, {
    kind: 'derived_arithmetic_control',
    formula: '993 + 994 + 995 - 996 - 999',
    toleranceAmount: '0.01',
    currency: 'ARS',
    sourceReported: false,
  });

  const [reconciled, mismatch, open, unknown, large, unavailable] = result.payload.data.items;
  assert.equal(reconciled.presentationStatus, 'closed_reconciled');
  assert.deepEqual(reconciled.reconciliation, { status: 'matched', difference: '0.00' });
  assert.equal(mismatch.presentationStatus, 'closed_mismatch');
  assert.deepEqual(mismatch.reconciliation, { status: 'mismatch', difference: '0.02' });
  assert.equal(open.presentationStatus, 'open');
  assert.equal(unknown.presentationStatus, 'uncertified');
  assert.equal(large.subjectEarnings, '90071992547409930.12');
  assert.equal(large.netPayable, '90071992547409930.12');
  assert.deepEqual(large.reconciliation, { status: 'matched', difference: '0.00' });
  assert.equal(unavailable.subjectEarnings, null);
  assert.equal(unavailable.presentationStatus, 'closed_not_reconciled');
  assert.deepEqual(unavailable.reconciliation, { status: 'not_available', difference: null });

  const moneyKeys = [
    'subjectEarnings', 'nonSubjectEarnings', 'familyAllowance',
    'employeeWithholdings', 'net', 'netPayable', 'employerContributions',
  ];
  assert.deepEqual(moneyKeys.map((key) => reconciled[key]), [
    '1000.10', '200.00', '10.00', '210.10', '1000.00', '1000.00', '250.50',
  ]);
  for (const item of result.payload.data.items) {
    for (const key of moneyKeys) assert.ok(item[key] === null || typeof item[key] === 'string', key);
    assert.ok(item.reconciliation.difference === null || typeof item.reconciliation.difference === 'string');
  }

  assert.deepEqual(Object.keys(reconciled).sort(), [
    'canonicalPayrollType', 'closureStatus', 'distinctConcepts', 'employeeWithholdings', 'employerContributions',
    'familyAllowance', 'itemCount', 'net', 'netPayable', 'nonSubjectEarnings',
    'payrollDate', 'payrollType', 'presentationStatus', 'quantity', 'reconciliation',
    'sourceCutoff', 'sourceMonth', 'sourcePeriod', 'subjectEarnings',
  ].sort());
  assert.deepEqual(Object.keys(reconciled.reconciliation).sort(), ['difference', 'status']);
  assert.deepEqual(Object.keys(result.payload.meta).sort(), [
    'authority', 'containsDirectIdentifiers', 'grain', 'isOfficialReceipt', 'monetaryBasis',
    'monetaryValuesRepresentation', 'nominalContext', 'pagination', 'reconciliation', 'year',
  ].sort());
  assert.deepEqual(Object.keys(result.payload.meta.pagination).sort(), ['limit', 'page', 'pages', 'total']);

  const keys = ownKeysDeep(result.payload).map((key) => key.toLowerCase());
  for (const forbidden of [
    'dni', 'cuil', 'nombre', 'email', 'telefono', 'domicilio', 'legajo',
    'rawfields', 'sourceid', 'sourcebatchid', 'contractid', 'personid',
  ]) assert.equal(keys.includes(forbidden), false, forbidden);
  const serialized = JSON.stringify(result.payload);
  assert.doesNotMatch(serialized, new RegExp([
    'NO PUBLICAR', 'no-publicar@example', 'GRH-RAW-1', '99999999',
    CONTRACT_ID, '20-99999999-9', '22222222-2222-4222-8222-222222222222',
  ].join('|'), 'i'));
});

test('employeePayroll aplica el mapping GRH v2 completo y deja desconocidos fail-closed', async () => {
  const sourceCodes = ['M', 'P', 'S', 'V', 'O', 'F', 'X'];
  const rows = sourceCodes.map((payrollType, index) => payrollRow({
    payrollDate: `2026-0${8 - index}-28`,
    payrollType,
  }));
  const result = await employeePayroll(
    mockPayrollSql(rows, rows.length, { limit: 7 }),
    { query: { contractId: CONTRACT_ID, limit: '7' } },
    managedAccess().principal,
    tenantSession(),
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload.data.items.map((item) => item.payrollType), sourceCodes);
  assert.deepEqual(result.payload.data.items.map((item) => item.canonicalPayrollType), [
    'monthly', 'first_fortnight', 'sac', 'vacation', 'other', 'final', null,
  ]);
});
