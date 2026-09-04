import assert from 'node:assert/strict';
import test from 'node:test';

import { createInternalPayrollReprocessingHandler } from
  '../api/internal-payroll-reprocessing.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RUN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CASE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const IDEMPOTENCY = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const REFERENCE = 'ref:11111111-1111-4111-8111-111111111111';
const RELEASE_SHA = 'a'.repeat(40);

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function access(overrides = {}) {
  return {
    mode: 'managed',
    session: { id: SESSION_ID, email: 'operator@junin.gob.ar', version: 3 },
    principal: {
      user: { email: 'operator@junin.gob.ar' },
      tenant: {
        id: TENANT_ID,
        membershipId: MEMBERSHIP_ID,
        source: 'membership',
        certifiedReleaseSha: RELEASE_SHA,
      },
    },
    ...overrides,
  };
}

function prepareRequest() {
  return {
    method: 'POST',
    query: {},
    headers: {
      origin: 'https://municipio.example',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'idempotency-key': IDEMPOTENCY,
    },
    body: {
      command: 'prepare',
      payload: {
        payrollRunId: RUN_ID,
        requestKind: 'reliquidate',
        reasonCode: 'source_correction',
        reasonReference: REFERENCE,
      },
    },
  };
}

function dependencies(overrides = {}) {
  const defaults = {
    env: {
      NODE_ENV: 'test',
      INTERNAL_APP_ORIGIN: 'https://municipio.example',
      VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
    },
    requireCompatibleInternalAccess: async () => access(),
    getInternalSql: async () => ({ runtime: true }),
    getPayrollReprocessingBootstrap: async () => ({
      feature: {
        grhMutation: false,
        payrollVoided: false,
        payrollCalculated: false,
        payrollPosted: false,
      },
    }),
    listPayrollReprocessingCases: async () => ({
      data: { items: [], total: 0, page: 1, limit: 20 },
    }),
    readPayrollReprocessingCase: async (_sql, _principal, _session, id) => ({
      data: { id, status: 'draft' },
    }),
    preparePayrollReprocessingCase: async () => ({
      replayed: false,
      data: { id: CASE_ID, status: 'draft', version: 1 },
    }),
    transitionPayrollReprocessingCase: async () => ({
      replayed: false,
      data: { id: CASE_ID, status: 'submitted', version: 2 },
    }),
  };
  return { ...defaults, ...overrides, env: { ...defaults.env, ...(overrides.env || {}) } };
}

test('bootstrap exige membresía, plano certificado y capacidad exacta', async () => {
  const accessCalls = [];
  const handler = createInternalPayrollReprocessingHandler(dependencies({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      accessCalls.push(options);
      return access();
    },
  }));
  const res = response();
  await handler({ method: 'GET', query: { resource: 'bootstrap' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.deepEqual(accessCalls[0].requiredCapabilities, ['payroll.reprocessing.read']);
  assert.equal(accessCalls[0].requireDataPlaneReady, true);
  assert.equal(accessCalls[0].requireCertifiedDataBinding, true);
  assert.equal(accessCalls[0].allowLegacy, false);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.Vary, 'Cookie, Origin');
});

test('autentica antes de leer cuerpo y prepara con recibo idempotente', async () => {
  const req = prepareRequest();
  const body = req.body;
  let bodyReads = 0;
  Object.defineProperty(req, 'body', { get() { bodyReads += 1; return body; } });
  const calls = [];
  const handler = createInternalPayrollReprocessingHandler(dependencies({
    preparePayrollReprocessingCase: async (...args) => {
      calls.push(args);
      return { replayed: true, data: { id: CASE_ID, status: 'draft', version: 1 } };
    },
  }));
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.replayed, true);
  assert.equal(res.headers['Idempotency-Replayed'], 'true');
  assert.equal(bodyReads, 1);
  assert.equal(calls[0][3], body.payload);
  assert.equal(calls[0][4], IDEMPOTENCY);
});

test('sesión ausente corta antes de cuerpo, SQL y operación', async () => {
  const req = prepareRequest();
  let bodyReads = 0;
  let sqlCalls = 0;
  let prepareCalls = 0;
  Object.defineProperty(req, 'body', { get() { bodyReads += 1; return prepareRequest().body; } });
  const handler = createInternalPayrollReprocessingHandler(dependencies({
    requireCompatibleInternalAccess: async (_req, res) => {
      res.status(401).json({ ok: false, code: 'IDENTITY_SESSION_REQUIRED' });
      return null;
    },
    getInternalSql: async () => { sqlCalls += 1; return {}; },
    preparePayrollReprocessingCase: async () => { prepareCalls += 1; return {}; },
  }));
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(bodyReads, 0);
  assert.equal(sqlCalls, 0);
  assert.equal(prepareCalls, 0);
});

test('mutación rechaza origen cruzado, content-type e idempotencia ausente', async () => {
  const cross = prepareRequest();
  cross.headers.origin = 'https://attacker.example';
  cross.headers['sec-fetch-site'] = 'cross-site';
  const crossRes = response();
  await createInternalPayrollReprocessingHandler(dependencies())(cross, crossRes);
  assert.equal(crossRes.statusCode, 403);
  assert.equal(crossRes.payload.code, 'PAYROLL_REPROCESSING_ORIGIN_INVALID');

  const noJson = prepareRequest();
  noJson.headers['content-type'] = 'text/plain';
  const noJsonRes = response();
  await createInternalPayrollReprocessingHandler(dependencies())(noJson, noJsonRes);
  assert.equal(noJsonRes.statusCode, 415);

  const noKey = prepareRequest();
  delete noKey.headers['idempotency-key'];
  const noKeyRes = response();
  await createInternalPayrollReprocessingHandler(dependencies())(noKey, noKeyRes);
  assert.equal(noKeyRes.statusCode, 428);
  assert.equal(noKeyRes.payload.code, 'PAYROLL_REPROCESSING_IDEMPOTENCY_KEY_REQUIRED');
});

test('list y detail usan consultas cerradas sin aceptar tenant inyectado', async () => {
  const listCalls = [];
  const handler = createInternalPayrollReprocessingHandler(dependencies({
    listPayrollReprocessingCases: async (...args) => {
      listCalls.push(args);
      return { data: { items: [], total: 0, page: 2, limit: 10 } };
    },
  }));
  const listed = response();
  await handler({
    method: 'GET',
    query: { resource: 'list', status: 'submitted', page: '2', limit: '10' },
    headers: {},
  }, listed);
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listCalls[0][3], { status: 'submitted', page: '2', limit: '10' });

  const extra = response();
  await handler({
    method: 'GET',
    query: { resource: 'detail', id: CASE_ID, tenantId: TENANT_ID },
    headers: {},
  }, extra);
  assert.equal(extra.statusCode, 400);
  assert.equal(extra.payload.code, 'PAYROLL_REPROCESSING_QUERY_INVALID');
});

test('error conocido no filtra texto SQL ni identificadores nominales', async () => {
  const handler = createInternalPayrollReprocessingHandler(dependencies({
    preparePayrollReprocessingCase: async () => {
      const error = new Error('corrida secreta legajo 571');
      error.name = 'PayrollReprocessingError';
      error.code = 'PAYROLL_REPROCESSING_RUN_NOT_ELIGIBLE';
      error.status = 422;
      throw error;
    },
  }));
  const res = response();
  await handler(prepareRequest(), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.payload.code, 'PAYROLL_REPROCESSING_RUN_NOT_ELIGIBLE');
  assert.doesNotMatch(JSON.stringify(res.payload), /secreta|571/);
});
