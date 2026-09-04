import assert from 'node:assert/strict';
import test from 'node:test';

import { createInternalActionsHandler } from '../api/internal-actions.js';
import { ActionCenterError } from '../lib/internal-leave-workflow.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONTRACT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const IDEMPOTENCY_KEY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const RELEASE_SHA = 'a'.repeat(40);

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

function access() {
  return {
    mode: 'managed',
    session: { id: SESSION_ID, email: 'actor@junin.gob.ar', version: 5 },
    principal: {
      user: { email: 'actor@junin.gob.ar' },
      tenant: {
        id: TENANT_ID,
        membershipId: MEMBERSHIP_ID,
        source: 'membership',
        certifiedReleaseSha: RELEASE_SHA,
      },
    },
  };
}

function internalPrincipal() {
  return {
    email: 'actor@junin.gob.ar',
    tenantId: TENANT_ID,
    membershipId: MEMBERSHIP_ID,
    certifiedBindingId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    actorPersonId: '11111111-1111-4111-8111-111111111111',
    capabilities: new Set(['time.source.read']),
  };
}

function dependencies(overrides = {}) {
  const defaults = {
    env: { NODE_ENV: 'test', INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA },
    requireCompatibleInternalAccess: async () => access(),
    getInternalSql: async () => ({ fake: true }),
    getTimeSourceBootstrap: async () => ({
      principal: internalPrincipal(),
      contract: { caseType: 'time_source_contract' },
      feature: { governanceStatus: 'metadata_intake', evaluationReady: false },
      readiness: [],
      options: { domains: [] },
      allowedCommands: [],
    }),
    listTimeSources: async () => ({
      principal: internalPrincipal(),
      data: [],
      pagination: { mode: 'page', page: 1, limit: 20, total: 0, pages: 0 },
    }),
    readTimeSource: async () => ({
      principal: internalPrincipal(),
      data: { id: CONTRACT_ID, status: 'draft', version: 1 },
      timeline: [],
      auditAvailable: false,
      allowedCommands: [],
    }),
    applyTimeSourceCommand: async () => ({
      data: { id: CONTRACT_ID, status: 'draft', version: 1 },
      replayed: false,
      historical: false,
    }),
  };
  return {
    ...defaults,
    ...overrides,
    env: { ...defaults.env, ...(overrides.env || {}) },
  };
}

function mutationRequest(method, body, headers = {}) {
  return {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': IDEMPOTENCY_KEY,
      ...headers,
    },
    body,
  };
}

function createBody() {
  return {
    caseType: 'time_source_contract',
    command: 'create_draft',
    expectedVersion: 0,
    payload: {
      domain: 'shift_assignment',
      ownerAuthority: 'municipal_human_resources',
      format: 'postgres_relation',
      schemaVersion: 'v1',
      artifactSha256: 'b'.repeat(64),
      cutAt: '2026-08-20T23:00:00Z',
      coverageFrom: '2026-08-01',
      coverageTo: '2026-08-31',
      timezone: 'America/Argentina/Mendoza',
      grain: 'employee_shift_day',
      identityKeyKind: 'employment_contract_id',
      reasonCode: 'source_onboarding',
      reason: 'Alta documentada',
    },
  };
}

test('gateway exige exactamente time.source.read para toda la superficie temporal', async () => {
  const requests = [];
  const deps = dependencies({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      requests.push(options);
      return access();
    },
  });
  const handler = createInternalActionsHandler(deps);

  const get = response();
  await handler({
    method: 'GET', query: { caseType: 'time_source_contract', resource: 'bootstrap' }, headers: {},
  }, get);
  const post = response();
  await handler(mutationRequest('POST', createBody()), post);

  assert.equal(get.statusCode, 200);
  assert.equal(post.statusCode, 201);
  assert.equal(requests.length, 2);
  for (const options of requests) {
    assert.deepEqual(options.requiredCapabilities, ['time.source.read']);
    assert.equal(options.requiredCapabilities.includes('actions.read'), false);
    assert.equal(options.requiredCapabilities.includes('time.source.propose'), false);
    assert.equal(options.requireCertifiedDataBinding, true);
    assert.equal(options.allowLegacy, false);
  }
});

test('bootstrap/list/detail despachan sólo a fachadas temporales y nunca publican principal', async () => {
  const calls = [];
  const deps = dependencies({
    getTimeSourceBootstrap: async (...args) => {
      calls.push(['bootstrap', args]);
      return {
        principal: { ...internalPrincipal(), privateSecret: 'never' },
        feature: { governanceStatus: 'metadata_intake', evaluationReady: false },
        options: { domains: [] }, readiness: [], allowedCommands: [],
      };
    },
    listTimeSources: async (...args) => {
      calls.push(['list', args]);
      return {
        principal: { ...internalPrincipal(), privateSecret: 'never' },
        data: [], pagination: { mode: 'page', page: 2, limit: 25, total: 0, pages: 0 },
      };
    },
    readTimeSource: async (...args) => {
      calls.push(['detail', args]);
      return {
        principal: { ...internalPrincipal(), privateSecret: 'never' },
        data: { id: CONTRACT_ID }, timeline: [], allowedCommands: [],
      };
    },
  });
  const handler = createInternalActionsHandler(deps);
  for (const query of [
    { caseType: 'time_source_contract', resource: 'bootstrap' },
    {
      caseType: 'time_source_contract', resource: 'list', domain: 'time_punch',
      status: 'approved', page: '2', limit: '25',
    },
    { caseType: 'time_source_contract', resource: 'detail', id: CONTRACT_ID },
  ]) {
    const res = response();
    await handler({ method: 'GET', query, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.caseType, 'time_source_contract');
    assert.equal(Object.hasOwn(res.payload, 'principal'), false);
    assert.equal(JSON.stringify(res.payload).includes('never'), false);
  }
  assert.deepEqual(calls.map(([name]) => name), ['bootstrap', 'list', 'detail']);
  assert.deepEqual(calls[1][1][2], {
    domain: 'time_punch', status: 'approved', page: '2', limit: '25',
  });
  assert.equal(calls[2][1][2], CONTRACT_ID);
  assert.equal(calls[0][1][2].releaseSha, RELEASE_SHA);
});

test('consultas temporales rechazan parámetros extra, duplicados y recursos ajenos', async () => {
  const handler = createInternalActionsHandler(dependencies());
  for (const [query, code] of [
    [
      { caseType: 'time_source_contract', resource: 'bootstrap', view: 'mine' },
      'ACTION_QUERY_INVALID',
    ],
    [
      { caseType: 'time_source_contract', resource: 'list', due: 'today' },
      'ACTION_QUERY_INVALID',
    ],
    [
      { caseType: 'time_source_contract', resource: 'detail', id: CONTRACT_ID, tenantId: TENANT_ID },
      'ACTION_QUERY_INVALID',
    ],
    [
      { caseType: ['time_source_contract', 'leave_request'], resource: 'bootstrap' },
      'ACTION_QUERY_AMBIGUOUS',
    ],
    [
      { caseType: 'time_source_contract', resource: 'timeline' },
      'ACTION_RESOURCE_INVALID',
    ],
  ]) {
    const res = response();
    await handler({ method: 'GET', query, headers: {} }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
    assert.equal(res.payload.code, code);
  }
});

test('create/update/transiciones usan método exacto y conservan el body sin reinterpretarlo', async () => {
  const calls = [];
  const handler = createInternalActionsHandler(dependencies({
    applyTimeSourceCommand: async (...args) => {
      calls.push(args);
      return {
        data: { id: CONTRACT_ID, status: args[3].command === 'create_draft' ? 'draft' : 'submitted' },
        replayed: false,
        historical: false,
      };
    },
  }));
  const updateBody = {
    ...createBody(), command: 'update_draft', contractId: CONTRACT_ID, expectedVersion: 1,
  };
  updateBody.payload.reasonCode = 'metadata_correction';
  const submitBody = {
    caseType: 'time_source_contract', command: 'submit', contractId: CONTRACT_ID,
    expectedVersion: 1, payload: { reasonCode: 'ready_for_review', reason: 'Lista para control' },
  };
  for (const [method, body, expectedStatus] of [
    ['POST', createBody(), 201], ['PATCH', updateBody, 200], ['POST', submitBody, 200],
  ]) {
    const res = response();
    await handler(mutationRequest(method, body), res);
    assert.equal(res.statusCode, expectedStatus);
  }
  assert.equal(calls.length, 3);
  assert.equal(calls[0][3].command, 'create_draft');
  assert.equal(calls[1][3].command, 'update_draft');
  assert.equal(calls[2][3].command, 'submit');
  assert.equal(calls[0][4], IDEMPOTENCY_KEY);
  assert.deepEqual(calls[0][2], {
    id: SESSION_ID, email: 'actor@junin.gob.ar', version: 5, releaseSha: RELEASE_SHA,
  });

  for (const [method, body] of [
    ['POST', updateBody],
    ['PATCH', createBody()],
    ['PATCH', submitBody],
  ]) {
    const res = response();
    await handler(mutationRequest(method, body), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.code, 'ACTION_COMMAND_INVALID');
  }
  assert.equal(calls.length, 3);
});

test('Idempotency-Key es obligatorio y replay histórico se publica como recibo mínimo', async () => {
  const handler = createInternalActionsHandler(dependencies({
    applyTimeSourceCommand: async () => ({
      data: { id: CONTRACT_ID, status: 'draft', version: 1 },
      replayed: true,
      historical: true,
      principal: { privateSecret: 'never' },
      debug: 'never',
    }),
  }));
  const missing = response();
  await handler(mutationRequest('POST', createBody(), { 'idempotency-key': '' }), missing);
  assert.equal(missing.statusCode, 428);
  assert.equal(missing.payload.code, 'ACTION_IDEMPOTENCY_KEY_REQUIRED');

  const replay = response();
  await handler(mutationRequest('POST', createBody()), replay);
  assert.equal(replay.statusCode, 201);
  assert.equal(replay.payload.replayed, true);
  assert.equal(replay.payload.historical, true);
  assert.equal(replay.headers['Idempotency-Replayed'], 'true');
  assert.deepEqual(Object.keys(replay.payload).sort(), [
    'caseType', 'data', 'historical', 'ok', 'replayed',
  ]);
  assert.equal(JSON.stringify(replay.payload).includes('never'), false);
});

test('límite de 16 KiB se aplica antes de autenticación y sin confiar en Content-Length', async () => {
  let accessCalls = 0;
  const handler = createInternalActionsHandler(dependencies({
    requireCompatibleInternalAccess: async () => { accessCalls += 1; return access(); },
  }));

  const declared = response();
  await handler(mutationRequest('POST', createBody(), { 'content-length': '16385' }), declared);
  assert.equal(declared.statusCode, 413);
  assert.equal(declared.payload.code, 'ACTION_BODY_TOO_LARGE');
  assert.equal(accessCalls, 0);

  const actual = response();
  await handler(mutationRequest('POST', {
    ...createBody(), padding: 'x'.repeat(17_000),
  }), actual);
  assert.equal(actual.statusCode, 413);
  assert.equal(actual.payload.code, 'ACTION_BODY_TOO_LARGE');
  assert.equal(accessCalls, 0);
});

test('mutación temporal conserva defensas same-origin y JSON en Preview', async () => {
  const handler = createInternalActionsHandler(dependencies({
    env: {
      VERCEL_ENV: 'preview',
      IDENTITY_APP_ORIGIN: 'https://municipio.example',
    },
  }));
  const noOrigin = response();
  await handler(mutationRequest('POST', createBody()), noOrigin);
  assert.equal(noOrigin.statusCode, 403);
  assert.equal(noOrigin.payload.code, 'ACTION_ORIGIN_REQUIRED');

  const crossSite = response();
  await handler(mutationRequest('POST', createBody(), {
    origin: 'https://municipio.example', 'sec-fetch-site': 'cross-site',
  }), crossSite);
  assert.equal(crossSite.statusCode, 403);
  assert.equal(crossSite.payload.code, 'ACTION_ORIGIN_INVALID');

  const fakeJson = response();
  await handler(mutationRequest('POST', createBody(), {
    origin: 'https://municipio.example',
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json-evil',
  }), fakeJson);
  assert.equal(fakeJson.statusCode, 415);
  assert.equal(fakeJson.payload.code, 'ACTION_CONTENT_TYPE_REQUIRED');
});

test('contención de sesión temporal responde 409 reintentable sin cerrar sesión', async () => {
  const handler = createInternalActionsHandler(dependencies({
    getTimeSourceBootstrap: async () => {
      throw new ActionCenterError(
        'TIME_SOURCE_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá',
      );
    },
  }));
  const res = response();
  await handler({ method: 'GET', query: {
    caseType: 'time_source_contract', resource: 'bootstrap',
  }, headers: {} }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.code, 'TIME_SOURCE_SESSION_BUSY');
  assert.equal(res.headers['Retry-After'], '1');
});
