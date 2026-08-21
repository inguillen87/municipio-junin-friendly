import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actionMutationSession,
  assertActionCenterRuntimeIdentity,
  createInternalActionsHandler,
  getActionCenterSql,
} from '../api/internal-actions.js';
import { capabilitiesForRole } from '../lib/internal-rbac.js';

const IDEMPOTENCY_KEY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = '99999999-9999-4999-8999-999999999999';
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

function principal(overrides = {}) {
  const capabilities = capabilitiesForRole('EMPLEADO');
  capabilities.add('actions.read');
  return {
    id: 'user-1',
    email: 'actor@junin.gob.ar',
    displayName: 'Actor',
    role: 'EMPLEADO',
    capabilities,
    employmentContractId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    sourceBindingId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    sourceCompanyId: 101,
    sourceDatabase: 'grh_junin',
    areaScopes: [],
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  const defaults = {
    env: { NODE_ENV: 'test', VERCEL_GIT_COMMIT_SHA: RELEASE_SHA },
    requireCompatibleInternalAccess: async () => ({
      mode: 'managed',
      session: { id: SESSION_ID, email: 'actor@junin.gob.ar', version: 3 },
      principal: {
        user: { email: 'actor@junin.gob.ar' },
        tenant: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          source: 'membership',
          certifiedReleaseSha: RELEASE_SHA,
        },
      },
    }),
    getInternalSql: async () => ({ fake: true }),
    loadTenantActionPrincipal: async () => principal(),
    getActionBootstrap: async () => ({
      contract: { caseTypes: ['leave_request'] },
      source: { label: 'GRH canónica', cutoff: '2026-08-19T23:00:00Z', version: 'snapshot publicado' },
      options: { subjects: [], reasons: [] },
    }),
    listLeaveCases: async () => ({ data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } }),
    readLeaveCase: async () => ({ data: { id: 'case-1' }, timeline: [], allowedCommands: [] }),
    createLeaveCase: async () => ({ data: { id: 'case-1', status: 'draft', version: 1 }, replayed: false }),
    updateLeaveDraft: async () => ({ data: { id: 'case-1', status: 'draft', version: 2 }, replayed: false }),
    transitionLeaveCase: async () => ({ data: { id: 'case-1', status: 'submitted', version: 2 }, replayed: true }),
  };
  return {
    ...defaults,
    ...overrides,
    env: { ...defaults.env, ...(overrides.env || {}) },
  };
}

test('bootstrap publica capabilities canónicas y opciones sin depender del rol de cookie', async () => {
  const res = response();
  const handler = createInternalActionsHandler(dependencies());
  await handler({ method: 'GET', query: { resource: 'bootstrap', caseType: 'leave_request' }, headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.principal.role, 'EMPLEADO');
  assert.equal(res.payload.principal.capabilities.includes('leave.request.self.create'), true);
  assert.deepEqual(res.payload.options, { subjects: [], reasons: [] });
  assert.equal(res.payload.source.label, 'GRH canónica');
  assert.match(res.headers['Cache-Control'], /no-store/);
  assert.equal(res.headers.Vary, 'Cookie');
});

test('membresía sin autoridad tenant falla 403 aunque la sesión siga vigente', async () => {
  const res = response();
  const handler = createInternalActionsHandler(dependencies({ loadTenantActionPrincipal: async () => null }));
  await handler({ method: 'GET', query: {}, headers: {} }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'ACTION_TENANT_AUTHORITY_REQUIRED');
});

test('contexto platform y binding legacy nunca ingresan al Centro de Acciones', async () => {
  for (const tenant of [null, {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    membershipId: null,
    source: 'legacy_explicit',
  }]) {
    const res = response();
    const handler = createInternalActionsHandler(dependencies({
      requireCompatibleInternalAccess: async () => ({
        mode: 'managed', session: { id: 'session-1' },
        principal: { user: { email: 'marcelo@example.test' }, tenant },
      }),
    }));
    await handler({ method: 'GET', query: {}, headers: {} }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.code, 'ACTION_TENANT_MEMBERSHIP_REQUIRED');
  }
});

test('mutaciones exigen same-origin, JSON e Idempotency-Key en Preview/Production', async () => {
  const handler = createInternalActionsHandler(dependencies({
    env: { VERCEL_ENV: 'production', IDENTITY_APP_ORIGIN: 'https://municipio.example' },
  }));

  const noOrigin = response();
  await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {} }, noOrigin);
  assert.equal(noOrigin.statusCode, 403);
  assert.equal(noOrigin.payload.code, 'ACTION_ORIGIN_REQUIRED');

  const foreign = response();
  await handler({
    method: 'POST',
    headers: {
      origin: 'https://evil.example', host: 'municipio.example',
      'x-forwarded-proto': 'https', 'content-type': 'application/json',
    },
    body: {},
  }, foreign);
  assert.equal(foreign.statusCode, 403);
  assert.equal(foreign.payload.code, 'ACTION_ORIGIN_INVALID');

  const spoofedForwardedHost = response();
  await handler({
    method: 'POST',
    headers: {
      origin: 'https://evil.example', host: 'municipio.example',
      'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https',
      'content-type': 'application/json',
    },
    body: {},
  }, spoofedForwardedHost);
  assert.equal(spoofedForwardedHost.statusCode, 403);
  assert.equal(spoofedForwardedHost.payload.code, 'ACTION_ORIGIN_INVALID');

  const reflectedHostAttack = response();
  await handler({
    method: 'POST',
    headers: {
      origin: 'https://evil.example', host: 'evil.example',
      'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
    },
    body: {},
  }, reflectedHostAttack);
  assert.equal(reflectedHostAttack.statusCode, 403);
  assert.equal(reflectedHostAttack.payload.code, 'ACTION_ORIGIN_INVALID');

  const crossSite = response();
  await handler({
    method: 'POST',
    headers: {
      origin: 'https://municipio.example', host: 'municipio.example',
      'sec-fetch-site': 'cross-site', 'content-type': 'application/json',
    },
    body: {},
  }, crossSite);
  assert.equal(crossSite.statusCode, 403);
  assert.equal(crossSite.payload.code, 'ACTION_ORIGIN_INVALID');

  const noKey = response();
  await handler({
    method: 'POST',
    headers: {
      origin: 'https://municipio.example', host: 'municipio.example',
      'x-forwarded-proto': 'https', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
    },
    body: { caseType: 'leave_request', command: 'create', payload: {} },
  }, noKey);
  assert.equal(noKey.statusCode, 428);
  assert.equal(noKey.payload.code, 'ACTION_IDEMPOTENCY_KEY_REQUIRED');

  const fakeJson = response();
  await handler({
    method: 'POST',
    headers: {
      origin: 'https://municipio.example', host: 'municipio.example',
      'x-forwarded-proto': 'https', 'content-type': 'application/json-evil',
    },
    body: {},
  }, fakeJson);
  assert.equal(fakeJson.statusCode, 415);
  assert.equal(fakeJson.payload.code, 'ACTION_CONTENT_TYPE_REQUIRED');
});

test('Production exige ACTIONS_DATABASE_URL separado y nunca cae al owner general', async () => {
  await assert.rejects(
    getActionCenterSql({ VERCEL_ENV: 'production', DATABASE_URL: 'postgresql://owner/db' }),
    (error) => error.code === 'ACTION_DATABASE_ROLE_REQUIRED',
  );
  await assert.rejects(
    getActionCenterSql({
      VERCEL_ENV: 'production',
      DATABASE_URL: 'postgresql://owner/db',
      ACTIONS_DATABASE_URL: 'postgresql://owner/db',
    }),
    (error) => error.code === 'ACTION_DATABASE_ROLE_REQUIRED',
  );
});

test('runtime exige current_user y session_user aislados; SET ROLE desde owner falla cerrado', async () => {
  assert.doesNotThrow(() => assertActionCenterRuntimeIdentity({
    currentUser: 'municontrol_actions_runtime_app',
    sessionUser: 'municontrol_actions_runtime_app',
  }));
  assert.throws(
    () => assertActionCenterRuntimeIdentity({
      currentUser: 'municontrol_actions_runtime_app',
      sessionUser: 'neondb_owner',
    }),
    (error) => error.code === 'ACTION_DATABASE_ROLE_REQUIRED',
  );

  const res = response();
  const handler = createInternalActionsHandler(dependencies({
    getInternalSql: async () => assertActionCenterRuntimeIdentity({
      currentUser: 'municontrol_actions_runtime_app',
      sessionUser: 'neondb_owner',
    }),
  }));
  await handler({ method: 'GET', query: {}, headers: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'ACTION_DATABASE_ROLE_REQUIRED');
});

test('parámetros duplicados sensibles fallan cerrado', async () => {
  const res = response();
  const handler = createInternalActionsHandler(dependencies());
  await handler({
    method: 'GET',
    query: { resource: ['detail', 'list'], caseType: 'leave_request', id: 'case-1' },
    headers: {},
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, 'ACTION_QUERY_AMBIGUOUS');
});

test('GET list transmite view, type, status y paginación page/limit sin ignorar filtros', async () => {
  const calls = [];
  const handler = createInternalActionsHandler(dependencies({
    listLeaveCases: async (...args) => {
      calls.push(args);
      return {
        data: [],
        pagination: { mode: 'page', page: 2, limit: 25, total: 0, pages: 0 },
        capabilities: { pagination: { mode: 'page', cursor: false } },
        facets: { view: { selected: 'area' } },
      };
    },
  }));
  const res = response();
  await handler({
    method: 'GET',
    query: {
      resource: 'list', caseType: 'leave_request', type: 'leave_request',
      view: 'area', status: 'submitted', page: '2', limit: '25',
    },
    headers: {},
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2], {
    page: '2', limit: '25', status: 'submitted', view: 'area',
    caseType: 'leave_request', due: '', cursor: '',
  });
  assert.equal(res.payload.pagination.mode, 'page');
  assert.equal(res.payload.facets.view.selected, 'area');
});

test('GET list rechaza type distinto y filtros due/cursor sin semántica real', async () => {
  const handler = createInternalActionsHandler(dependencies());
  for (const [query, code] of [
    [{ resource: 'list', type: 'payroll_change' }, 'ACTION_CASE_TYPE_INVALID'],
    [{ resource: 'list', due: 'today' }, 'ACTION_DUE_FILTER_UNSUPPORTED'],
    [{ resource: 'list', cursor: 'opaque' }, 'ACTION_CURSOR_UNSUPPORTED'],
  ]) {
    const res = response();
    await handler({ method: 'GET', query, headers: {} }, res);
    assert.equal(res.statusCode, 400, code);
    assert.equal(res.payload.code, code);
  }
});

test('POST create usa el único endpoint y responde 201 con recibo mínimo', async () => {
  const calls = [];
  const handler = createInternalActionsHandler(dependencies({
    createLeaveCase: async (...args) => {
      calls.push(args);
      return { data: { id: 'case-1', status: 'draft', version: 1 }, replayed: false };
    },
  }));
  const res = response();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': IDEMPOTENCY_KEY },
    body: { caseType: 'leave_request', command: 'create', payload: { reasonCode: '19' } },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.data.status, 'draft');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][3], IDEMPOTENCY_KEY);
});

test('mutación toma SID/version sólo de access.session y SHA sólo del release certificado', async () => {
  let receivedSession;
  const handler = createInternalActionsHandler(dependencies({
    createLeaveCase: async (_sql, _principal, _payload, _key, session) => {
      receivedSession = session;
      return { data: { id: 'case-1', status: 'draft', version: 1 }, replayed: false };
    },
  }));
  const res = response();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': IDEMPOTENCY_KEY },
    body: {
      caseType: 'leave_request', command: 'create', payload: {},
      actorSessionId: '11111111-1111-4111-8111-111111111111',
      releaseSha: 'f'.repeat(40),
    },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(receivedSession, {
    id: SESSION_ID, email: 'actor@junin.gob.ar', version: 3, releaseSha: RELEASE_SHA,
  });

  const baseAccess = {
    mode: 'managed',
    session: { id: SESSION_ID, email: 'actor@junin.gob.ar', version: 3 },
    principal: {
      user: { email: 'actor@junin.gob.ar' },
      tenant: { certifiedReleaseSha: RELEASE_SHA },
    },
  };
  assert.throws(
    () => actionMutationSession({
      ...baseAccess, session: { ...baseAccess.session, email: 'otro@junin.gob.ar' },
    }, { VERCEL_GIT_COMMIT_SHA: RELEASE_SHA }),
    (error) => error.code === 'ACTION_SESSION_INVALID' && error.status === 401,
  );
  assert.throws(
    () => actionMutationSession(baseAccess, { VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40) }),
    (error) => error.code === 'ACTION_RELEASE_NOT_CERTIFIED' && error.status === 503,
  );
});

test('replay de transición conserva éxito y marca la respuesta', async () => {
  const calls = [];
  const handler = createInternalActionsHandler(dependencies({
    transitionLeaveCase: async (...args) => {
      calls.push(args);
      return { data: { id: 'case-1', status: 'approved', version: 3 }, replayed: true };
    },
  }));
  const res = response();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': IDEMPOTENCY_KEY },
    body: {
      caseType: 'leave_request', command: 'approve', caseId: 'case-1', expectedVersion: 2,
      reason: 'Control humano completo', evidenceStatus: 'verified', manualValidationConfirmed: true,
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.replayed, true);
  assert.equal(res.headers['Idempotency-Replayed'], 'true');
  assert.equal(calls[0][2], 'approve');
});

test('PATCH sólo admite update_draft y limita cuerpos a 16 KiB', async () => {
  const handler = createInternalActionsHandler(dependencies());
  const invalidCommand = response();
  await handler({
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'idempotency-key': IDEMPOTENCY_KEY },
    body: { caseType: 'leave_request', command: 'approve' },
  }, invalidCommand);
  assert.equal(invalidCommand.statusCode, 400);
  assert.equal(invalidCommand.payload.code, 'ACTION_COMMAND_INVALID');

  const tooLarge = response();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '20000' },
    body: {},
  }, tooLarge);
  assert.equal(tooLarge.statusCode, 413);
  assert.equal(tooLarge.payload.code, 'ACTION_BODY_TOO_LARGE');
});
