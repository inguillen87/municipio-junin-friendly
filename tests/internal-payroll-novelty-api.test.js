import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInternalPayrollNoveltiesHandler,
} from '../api/internal-payroll-novelties.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const IDEMPOTENCY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const RELEASE_SHA = 'f'.repeat(40);

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

function validRow() {
  return {
    rowOrdinal: 1,
    legajo: '571',
    conceptSourceId: '120',
    costCenterSourceId: null,
    adjustmentMonth: null,
    quantityDecimal: '1',
    amountCents: null,
    movementType: 'standard',
    legalInstrument: null,
    observation: 'Solicitud revisada por el área.',
    forced: false,
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
        sourceMode: 'individual',
        periodMonth: '2026-08-01',
        payrollType: 'monthly',
        rows: [validRow()],
      },
    },
  };
}

function dependencies(overrides = {}) {
  const defaults = {
    env: {
      NODE_ENV: 'test',
      INTERNAL_APP_ORIGIN: 'https://municipio.example',
      INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA,
    },
    requireCompatibleInternalAccess: async () => access(),
    getInternalSql: async () => ({ runtime: true }),
    getPayrollNoveltyBootstrap: async () => ({
      feature: { grhMutation: false, payrollCalculated: false, payrollPosted: false },
      batches: [],
    }),
    readPayrollNovelty: async (_sql, _principal, _session, id) => ({
      data: { id, status: 'draft' },
      grhMutation: false,
      payrollCalculated: false,
      payrollPosted: false,
    }),
    preparePayrollNovelty: async () => ({
      replayed: false,
      data: {
        id: BATCH_ID,
        status: 'draft',
        version: 1,
        grhMutation: false,
        payrollCalculated: false,
        payrollPosted: false,
      },
    }),
    transitionPayrollNovelty: async () => ({
      replayed: false,
      data: { id: BATCH_ID, status: 'submitted', version: 2 },
    }),
    exportPayrollNovelty: async () => ({
      contractVersion: 'payroll-novelty-export.v1',
      approvalEffect: 'export_only',
      data: {
        id: BATCH_ID,
        status: 'approved',
        exportable: true,
        rows: [validRow()],
        grhMutation: false,
        payrollCalculated: false,
        payrollPosted: false,
      },
    }),
  };
  return { ...defaults, ...overrides, env: { ...defaults.env, ...(overrides.env || {}) } };
}

test('bootstrap exige membresía, binding certificado y capacidad explícita', async () => {
  const accessCalls = [];
  const bootstrapCalls = [];
  const handler = createInternalPayrollNoveltiesHandler(dependencies({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      accessCalls.push(options);
      return access();
    },
    getPayrollNoveltyBootstrap: async (...args) => {
      bootstrapCalls.push(args);
      return { feature: { grhMutation: false, payrollCalculated: false, payrollPosted: false } };
    },
  }));
  const res = response();
  await handler({ method: 'GET', query: { resource: 'bootstrap' }, headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.deepEqual(accessCalls[0].requiredCapabilities, ['payroll.novelty.read']);
  assert.equal(accessCalls[0].requireDataPlaneReady, true);
  assert.equal(accessCalls[0].requireCertifiedDataBinding, true);
  assert.equal(accessCalls[0].allowLegacy, false);
  assert.equal(bootstrapCalls[0][1].tenant.id, TENANT_ID);
  assert.equal(bootstrapCalls[0][2].releaseSha, RELEASE_SHA);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.Vary, 'Cookie, Origin');
});

test('prepare autentica antes de leer PII y devuelve recibo idempotente', async () => {
  let bodyReads = 0;
  const req = prepareRequest();
  const body = req.body;
  Object.defineProperty(req, 'body', { get() { bodyReads += 1; return body; } });
  const calls = [];
  const handler = createInternalPayrollNoveltiesHandler(dependencies({
    preparePayrollNovelty: async (...args) => {
      calls.push(args);
      return {
        replayed: true,
        data: { id: BATCH_ID, status: 'draft', version: 1 },
      };
    },
  }));
  const res = response();
  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.replayed, true);
  assert.equal(res.headers['Idempotency-Replayed'], 'true');
  assert.equal(bodyReads, 1);
  assert.equal(calls[0][3], body.payload);
  assert.equal(calls[0][4], IDEMPOTENCY);
});

test('sesión ausente corta antes de body, SQL y validación nominal', async () => {
  let bodyReads = 0;
  let sqlCalls = 0;
  let prepareCalls = 0;
  const req = prepareRequest();
  Object.defineProperty(req, 'body', { get() { bodyReads += 1; return prepareRequest().body; } });
  const handler = createInternalPayrollNoveltiesHandler(dependencies({
    requireCompatibleInternalAccess: async (_req, res) => {
      res.status(401).json({ ok: false, code: 'IDENTITY_SESSION_REQUIRED' });
      return null;
    },
    getInternalSql: async () => { sqlCalls += 1; return {}; },
    preparePayrollNovelty: async () => { prepareCalls += 1; return {}; },
  }));
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(bodyReads, 0);
  assert.equal(sqlCalls, 0);
  assert.equal(prepareCalls, 0);
});

test('mutaciones rechazan origen cruzado, content-type e idempotencia faltante', async () => {
  const crossOrigin = prepareRequest();
  crossOrigin.headers.origin = 'https://attacker.example';
  crossOrigin.headers['sec-fetch-site'] = 'cross-site';
  const crossResponse = response();
  await createInternalPayrollNoveltiesHandler(dependencies())(crossOrigin, crossResponse);
  assert.equal(crossResponse.statusCode, 403);
  assert.equal(crossResponse.payload.code, 'PAYROLL_NOVELTY_ORIGIN_INVALID');

  const noJson = prepareRequest();
  noJson.headers['content-type'] = 'text/plain';
  const noJsonResponse = response();
  await createInternalPayrollNoveltiesHandler(dependencies())(noJson, noJsonResponse);
  assert.equal(noJsonResponse.statusCode, 415);

  const noKey = prepareRequest();
  delete noKey.headers['idempotency-key'];
  const noKeyResponse = response();
  await createInternalPayrollNoveltiesHandler(dependencies())(noKey, noKeyResponse);
  assert.equal(noKeyResponse.statusCode, 428);
  assert.equal(noKeyResponse.payload.code, 'PAYROLL_NOVELTY_IDEMPOTENCY_KEY_REQUIRED');
});

test('detail y export sólo aceptan id explícito y sin parámetros extra', async () => {
  const exportCalls = [];
  const handler = createInternalPayrollNoveltiesHandler(dependencies({
    exportPayrollNovelty: async (...args) => {
      exportCalls.push(args);
      return {
        contractVersion: 'payroll-novelty-export.v1',
        approvalEffect: 'export_only',
        data: {
          id: BATCH_ID, status: 'approved', exportable: true, rows: [],
          grhMutation: false, payrollCalculated: false, payrollPosted: false,
        },
      };
    },
  }));
  const exported = response();
  await handler({
    method: 'GET', query: { resource: 'export', id: BATCH_ID }, headers: {},
  }, exported);
  assert.equal(exported.statusCode, 200);
  assert.equal(exported.payload.data.exportable, true);
  assert.equal(exportCalls[0][3], BATCH_ID);

  const extra = response();
  await handler({
    method: 'GET', query: { resource: 'detail', id: BATCH_ID, tenantId: TENANT_ID }, headers: {},
  }, extra);
  assert.equal(extra.statusCode, 400);
  assert.equal(extra.payload.code, 'PAYROLL_NOVELTY_QUERY_INVALID');
});

test('errores determinísticos conservan sólo código, mensaje y ordinal seguro', async () => {
  const handler = createInternalPayrollNoveltiesHandler(dependencies({
    preparePayrollNovelty: async () => {
      const error = new Error('contenido confidencial del legajo 571');
      error.name = 'PayrollNoveltyError';
      error.code = 'PAYROLL_NOVELTY_LEGAJO_NOT_FOUND';
      error.status = 422;
      error.details = { rowOrdinal: 1 };
      throw error;
    },
  }));
  const res = response();
  await handler(prepareRequest(), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.payload.code, 'PAYROLL_NOVELTY_LEGAJO_NOT_FOUND');
  assert.doesNotMatch(JSON.stringify(res.payload), /confidencial|571/);
});
