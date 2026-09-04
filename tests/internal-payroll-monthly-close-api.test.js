import assert from 'node:assert/strict';
import test from 'node:test';

import { createInternalPayrollMonthlyCloseHandler } from
  '../api/internal-payroll-monthly-close.js';
import { PayrollMonthlyCloseError } from '../lib/internal-payroll-monthly-close.js';
import { MonthlyCloseContractError } from '../lib/internal-monthly-close-contracts.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BINDING_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const IDEMPOTENCY = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const REFERENCE = 'ref:11111111-1111-4111-8111-111111111111';
const RELEASE_SHA = 'a'.repeat(40);
const CAPABILITIES = [
  'payroll.monthly_close.read',
  'payroll.monthly_close.prepare',
  'payroll.monthly_close.audit.read',
];

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

function bootstrap(capabilities = CAPABILITIES) {
  return {
    principal: {
      tenantId: TENANT_ID,
      membershipId: MEMBERSHIP_ID,
      certifiedBindingId: BINDING_ID,
      roleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
      employmentLinked: true,
      capabilities,
    },
    limits: {
      contractVersion: 'payroll-monthly-close-run.v1',
      sourceContracts: [], maxSourceBytes: 262144, sourceCount: 3,
      jurisdictions: ['42', '55'], toleranceCents: '0',
    },
    runs: [], recentEvents: [],
    flags: safeFlags(),
  };
}

function safeFlags(closeApproved = false) {
  return {
    closeApproved,
    includesPersonalRecords: false,
    rawContentStored: false,
    grhMutation: false,
    payrollCalculated: false,
    payrollPosted: false,
    bankArtifactGenerated: false,
    governmentArtifactGenerated: false,
    fiscalArtifactGenerated: false,
  };
}

function prepareRequest() {
  const encoded = Buffer.from('aggregate-only', 'utf8').toString('base64');
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
        period: '2026-08',
        jurisdiction: '42',
        sources: [
          {
            definitionKey: 'grh-concept-statistics.v1',
            sourceKind: 'grh_observed', contentBase64: encoded,
          },
          {
            definitionKey: 'bank-accreditation-summary.v1',
            sourceKind: 'bank_control', contentBase64: encoded,
          },
          {
            definitionKey: 'government-payroll-summary.v1',
            sourceKind: 'government_control', contentBase64: encoded,
          },
        ],
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
      PAYROLL_MONTHLY_CLOSE_HMAC_SECRET: 'monthly-close-api-test-secret-32-bytes',
    },
    requireCompatibleInternalAccess: async () => access(),
    getInternalSql: async () => ({ runtime: true }),
    getPayrollMonthlyCloseBootstrap: async () => bootstrap(),
    listPayrollMonthlyCloseRuns: async () => ({
      runs: [], page: 1, limit: 20, total: 0, flags: safeFlags(),
    }),
    readPayrollMonthlyCloseRun: async (_sql, _principal, _session, id) => ({
      run: { id, status: 'prepared' }, flags: safeFlags(),
    }),
    readPayrollMonthlyCloseAttempt: async () => ({
      replayed: true, eventId: 1, eventSha256: 'a'.repeat(64),
      run: { id: RUN_ID, status: 'prepared', version: 1 }, flags: safeFlags(),
    }),
    normalizePayrollMonthlyCloseDraft: () => ({
      contractVersion: 'payroll-monthly-close-run.v1', sourceCount: 3,
      sourceSetSha256: 'b'.repeat(64),
    }),
    persistPayrollMonthlyCloseRun: async () => ({
      replayed: false, eventId: 1, eventSha256: 'c'.repeat(64),
      run: { id: RUN_ID, status: 'prepared', version: 1 }, flags: safeFlags(),
    }),
    transitionPayrollMonthlyCloseRun: async () => ({
      replayed: false, eventId: 2, eventSha256: 'd'.repeat(64),
      run: { id: RUN_ID, status: 'submitted', version: 2 }, flags: safeFlags(),
    }),
  };
  return { ...defaults, ...overrides, env: { ...defaults.env, ...(overrides.env || {}) } };
}

test('bootstrap exige membresía, plano/binding certificados y capacidad exacta', async () => {
  const accessCalls = [];
  const handler = createInternalPayrollMonthlyCloseHandler(dependencies({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      accessCalls.push(options);
      return access();
    },
  }));
  const res = response();
  await handler({ method: 'GET', query: { resource: 'bootstrap' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.deepEqual(accessCalls[0].requiredCapabilities, ['payroll.monthly_close.read']);
  assert.equal(accessCalls[0].requireDataPlaneReady, true);
  assert.equal(accessCalls[0].requireCertifiedDataBinding, true);
  assert.equal(accessCalls[0].allowLegacy, false);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
});

test('autentica antes del body, prepara una vez y borra los bytes transitorios', async () => {
  const req = prepareRequest();
  const body = req.body;
  let bodyReads = 0;
  let capturedSources;
  Object.defineProperty(req, 'body', { get() { bodyReads += 1; return body; } });
  const handler = createInternalPayrollMonthlyCloseHandler(dependencies({
    normalizePayrollMonthlyCloseDraft: (value) => {
      capturedSources = value.sources;
      assert.equal(value.sources.every((source) => Buffer.isBuffer(source.bytes)), true);
      return {
        contractVersion: 'payroll-monthly-close-run.v1', sourceCount: 3,
        sourceSetSha256: 'b'.repeat(64),
      };
    },
    persistPayrollMonthlyCloseRun: async (...args) => ({
      replayed: true, argsLength: args.length, run: { id: RUN_ID, status: 'prepared' },
      flags: safeFlags(),
    }),
  }));
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.replayed, true);
  assert.equal(res.headers['Idempotency-Replayed'], 'true');
  assert.equal(bodyReads, 1);
  assert.equal(capturedSources.length, 3);
  assert.equal(capturedSources.every((source) => source.bytes.every((byte) => byte === 0)), true);
});

test('sesión ausente corta antes de body, SQL y parser', async () => {
  const req = prepareRequest();
  let bodyReads = 0;
  let sqlCalls = 0;
  let parseCalls = 0;
  Object.defineProperty(req, 'body', { get() { bodyReads += 1; return prepareRequest().body; } });
  const handler = createInternalPayrollMonthlyCloseHandler(dependencies({
    requireCompatibleInternalAccess: async (_req, res) => {
      res.status(401).json({ ok: false, code: 'IDENTITY_SESSION_REQUIRED' });
      return null;
    },
    getInternalSql: async () => { sqlCalls += 1; return {}; },
    normalizePayrollMonthlyCloseDraft: () => { parseCalls += 1; return {}; },
  }));
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(bodyReads, 0);
  assert.equal(sqlCalls, 0);
  assert.equal(parseCalls, 0);
});

test('mutación rechaza origen, content-type, idempotencia y base64 no canónico', async () => {
  const cross = prepareRequest();
  cross.headers.origin = 'https://attacker.example';
  cross.headers['sec-fetch-site'] = 'cross-site';
  const crossRes = response();
  await createInternalPayrollMonthlyCloseHandler(dependencies())(cross, crossRes);
  assert.equal(crossRes.statusCode, 403);
  assert.equal(crossRes.payload.code, 'PAYROLL_MONTHLY_CLOSE_ORIGIN_INVALID');

  const noJson = prepareRequest();
  noJson.headers['content-type'] = 'text/plain';
  const noJsonRes = response();
  await createInternalPayrollMonthlyCloseHandler(dependencies())(noJson, noJsonRes);
  assert.equal(noJsonRes.statusCode, 415);

  const noKey = prepareRequest();
  delete noKey.headers['idempotency-key'];
  const noKeyRes = response();
  await createInternalPayrollMonthlyCloseHandler(dependencies())(noKey, noKeyRes);
  assert.equal(noKeyRes.statusCode, 428);

  const badBase64 = prepareRequest();
  badBase64.body.payload.sources[0].contentBase64 = 'not base64';
  const badRes = response();
  await createInternalPayrollMonthlyCloseHandler(dependencies())(badBase64, badRes);
  assert.equal(badRes.statusCode, 400);
  assert.equal(badRes.payload.code, 'PAYROLL_MONTHLY_CLOSE_CONTENT_INVALID');
});

test('perfil administrativo de consulta no puede preparar ni decidir', async () => {
  let parseCalls = 0;
  const handler = createInternalPayrollMonthlyCloseHandler(dependencies({
    getPayrollMonthlyCloseBootstrap: async () => bootstrap(['payroll.monthly_close.read']),
    normalizePayrollMonthlyCloseDraft: () => { parseCalls += 1; return {}; },
  }));
  const res = response();
  await handler(prepareRequest(), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'PAYROLL_MONTHLY_CLOSE_CAPABILITY_REQUIRED');
  assert.equal(parseCalls, 0);
});

test('submit/approve usan payload cerrado y capacidad del checker', async () => {
  const req = prepareRequest();
  req.body = {
    command: 'approve',
    payload: {
      runId: RUN_ID,
      expectedVersion: 2,
      reasonCode: 'approved_by_checker',
      reasonReference: REFERENCE,
    },
  };
  const calls = [];
  const handler = createInternalPayrollMonthlyCloseHandler(dependencies({
    getPayrollMonthlyCloseBootstrap: async () => bootstrap([
      'payroll.monthly_close.read', 'payroll.monthly_close.approve',
    ]),
    transitionPayrollMonthlyCloseRun: async (...args) => {
      calls.push(args);
      return { replayed: false, run: { id: RUN_ID, status: 'approved' }, flags: safeFlags(true) };
    },
  }));
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls[0][3], 'approve');
  assert.deepEqual(calls[0][4], req.body.payload);
  assert.equal(calls[0][5], IDEMPOTENCY);
  assert.equal(calls[0][6], BINDING_ID);

  req.body.payload.comment = 'campo libre';
  const extra = response();
  await handler(req, extra);
  assert.equal(extra.statusCode, 400);
  assert.equal(extra.payload.code, 'PAYROLL_MONTHLY_CLOSE_PAYLOAD_INVALID');
});

test('transición usa siempre el binding certificado retornado por bootstrap', async () => {
  const rotatedBindingId = '99999999-9999-4999-8999-999999999999';
  const req = prepareRequest();
  req.body = {
    command: 'submit',
    payload: {
      runId: RUN_ID,
      expectedVersion: 1,
      reasonCode: 'ready_for_review',
      reasonReference: REFERENCE,
    },
  };
  let receivedBindingId;
  const rotatedBootstrap = bootstrap();
  rotatedBootstrap.principal.certifiedBindingId = rotatedBindingId;
  const handler = createInternalPayrollMonthlyCloseHandler(dependencies({
    getPayrollMonthlyCloseBootstrap: async () => rotatedBootstrap,
    transitionPayrollMonthlyCloseRun: async (...args) => {
      receivedBindingId = args[6];
      return {
        replayed: false,
        run: { id: RUN_ID, status: 'submitted', version: 2 },
        flags: safeFlags(),
      };
    },
  }));
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(receivedBindingId, rotatedBindingId);
});

test('list/detail son cerrados y no aceptan tenant inyectado', async () => {
  const listCalls = [];
  const handler = createInternalPayrollMonthlyCloseHandler(dependencies({
    listPayrollMonthlyCloseRuns: async (...args) => {
      listCalls.push(args);
      return { runs: [], page: 2, limit: 10, total: 0, flags: safeFlags() };
    },
  }));
  const listed = response();
  await handler({
    method: 'GET', query: { resource: 'list', status: 'submitted', page: '2', limit: '10' },
    headers: {},
  }, listed);
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listCalls[0][3], { status: 'submitted', page: '2', limit: '10' });

  const extra = response();
  await handler({
    method: 'GET', query: { resource: 'detail', id: RUN_ID, tenantId: TENANT_ID }, headers: {},
  }, extra);
  assert.equal(extra.statusCode, 400);
  assert.equal(extra.payload.code, 'PAYROLL_MONTHLY_CLOSE_QUERY_INVALID');
});

test('recupera sólo el intento autenticado por headers y no lee body ni URL sensible', async () => {
  const calls = [];
  let bodyReads = 0;
  const req = {
    method: 'GET',
    query: { resource: 'attempt' },
    headers: {
      'idempotency-key': IDEMPOTENCY,
      'x-municontrol-command': 'prepare',
    },
  };
  Object.defineProperty(req, 'body', { get() { bodyReads += 1; return null; } });
  const handler = createInternalPayrollMonthlyCloseHandler(dependencies({
    readPayrollMonthlyCloseAttempt: async (...args) => {
      calls.push(args);
      return {
        replayed: true, eventId: 1, eventSha256: 'a'.repeat(64),
        run: { id: RUN_ID, status: 'approved', version: 3 },
        flags: safeFlags(true),
      };
    },
  }));
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.replayed, true);
  assert.equal(res.payload.data.replayed, true);
  assert.equal(res.headers['Idempotency-Replayed'], 'true');
  assert.equal(bodyReads, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][3], IDEMPOTENCY);
  assert.equal(calls[0][4], 'prepare');
  assert.equal(JSON.stringify(req.query).includes(IDEMPOTENCY), false);
});

test('lookup de intento cierra headers, query, capacidad y errores de aislamiento', async () => {
  const handler = createInternalPayrollMonthlyCloseHandler(dependencies());

  const missingCommand = response();
  await handler({
    method: 'GET', query: { resource: 'attempt' },
    headers: { 'idempotency-key': IDEMPOTENCY },
  }, missingCommand);
  assert.equal(missingCommand.statusCode, 428);
  assert.equal(missingCommand.payload.code,
    'PAYROLL_MONTHLY_CLOSE_ATTEMPT_COMMAND_REQUIRED');

  const invalidCommand = response();
  await handler({
    method: 'GET', query: { resource: 'attempt' },
    headers: { 'idempotency-key': IDEMPOTENCY, 'x-municontrol-command': 'delete' },
  }, invalidCommand);
  assert.equal(invalidCommand.statusCode, 422);
  assert.equal(invalidCommand.payload.code,
    'PAYROLL_MONTHLY_CLOSE_ATTEMPT_COMMAND_INVALID');

  const missingKey = response();
  await handler({
    method: 'GET', query: { resource: 'attempt' },
    headers: { 'x-municontrol-command': 'prepare' },
  }, missingKey);
  assert.equal(missingKey.statusCode, 428);
  assert.equal(missingKey.payload.code,
    'PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_KEY_REQUIRED');

  const extraQuery = response();
  await handler({
    method: 'GET', query: { resource: 'attempt', idempotencyKey: IDEMPOTENCY },
    headers: { 'idempotency-key': IDEMPOTENCY, 'x-municontrol-command': 'prepare' },
  }, extraQuery);
  assert.equal(extraQuery.statusCode, 400);
  assert.equal(extraQuery.payload.code, 'PAYROLL_MONTHLY_CLOSE_QUERY_INVALID');

  let attemptCalls = 0;
  const noApprove = createInternalPayrollMonthlyCloseHandler(dependencies({
    readPayrollMonthlyCloseAttempt: async () => { attemptCalls += 1; return {}; },
  }));
  const forbidden = response();
  await noApprove({
    method: 'GET', query: { resource: 'attempt' },
    headers: { 'idempotency-key': IDEMPOTENCY, 'x-municontrol-command': 'approve' },
  }, forbidden);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.payload.code, 'PAYROLL_MONTHLY_CLOSE_CAPABILITY_REQUIRED');
  assert.equal(attemptCalls, 0);

  for (const [code, status] of [
    ['PAYROLL_MONTHLY_CLOSE_ATTEMPT_NOT_FOUND', 404],
    ['PAYROLL_MONTHLY_CLOSE_ATTEMPT_CONTEXT_CHANGED', 409],
  ]) {
    const isolated = createInternalPayrollMonthlyCloseHandler(dependencies({
      readPayrollMonthlyCloseAttempt: async () => {
        throw new PayrollMonthlyCloseError(code, status, `${code} detalle privado`);
      },
    }));
    const isolatedRes = response();
    await isolated({
      method: 'GET', query: { resource: 'attempt' },
      headers: { 'idempotency-key': IDEMPOTENCY, 'x-municontrol-command': 'prepare' },
    }, isolatedRes);
    assert.equal(isolatedRes.statusCode, status);
    assert.equal(isolatedRes.payload.code, code);
    assert.doesNotMatch(JSON.stringify(isolatedRes.payload), /detalle privado/i);
  }
});

test('errores de contrato conservan código seguro y no filtran SQL ni contenido', async () => {
  const handler = createInternalPayrollMonthlyCloseHandler(dependencies({
    normalizePayrollMonthlyCloseDraft: () => {
      throw new MonthlyCloseContractError(
        'MONTHLY_CLOSE_HEADER_INVALID', 422, 'El encabezado no coincide con la definición seleccionada',
      );
    },
  }));
  const res = response();
  await handler(prepareRequest(), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.payload.code, 'MONTHLY_CLOSE_HEADER_INVALID');
  assert.doesNotMatch(JSON.stringify(res.payload), /aggregate-only|postgres|select /i);
});
