import assert from 'node:assert/strict';
import test from 'node:test';

import { createInternalAssistantHandler } from '../api/internal-assistant.js';

const USER_EMAIL = 'quota-user@example.invalid';
const TENANT_ID = '00000000-0000-4000-8000-000000000205';
const BASE_ENV = Object.freeze({
  OPENAI_API_KEY: 'openai_test',
  AI_ASSISTANT_EXTERNAL_ENRICHMENT_ENABLED: 'true',
  AI_ASSISTANT_DURABLE_QUOTA_CERTIFIED: 'true',
  AI_ASSISTANT_QUOTA_PEPPER: 'durable-assistant-quota-test-pepper-32-bytes',
});

function recorder() {
  return {
    headers: {},
    statusCode: null,
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return value; },
  };
}

function managedAccess() {
  return {
    mode: 'managed',
    session: { id: '00000000-0000-4000-8000-000000000206', email: USER_EMAIL },
    principal: {
      user: { email: USER_EMAIL },
      tenant: {
        id: TENANT_ID,
        effectiveCapabilities: ['assistant.use', 'workforce.summary.read'],
      },
    },
  };
}

function endpoint(overrides = {}) {
  const dependencies = {
    requireCompatibleInternalAccess: overrides.requireCompatibleInternalAccess
      || (async () => managedAccess()),
    getInternalSql: async () => ({ query: async () => [] }),
    integrationQuality: async () => ({
      source: { cutoff: '2026-08-06T15:15:21.000Z' },
      workforceControl: {
        administrative: { value: 882 },
        administrativePeople: 814,
        liquidable: { value: 854 },
        difference: { value: 28 },
        stateBreakdown: { rows: [] },
      },
      identityEnrichment: {
        crosswalk: { status: 'available', matched: 1699, ambiguous: 157, unmatched: 493, total: 2349, coveragePct: 72.3 },
      },
    }),
    canonicalScope: async () => ({
      totalContracts: 2450,
      totalPeople: 2349,
      asOf: '2026-08-06T15:15:21.000Z',
    }),
    getTenantIdentitySql: overrides.getTenantIdentitySql
      || (async () => ({ query: async () => [{ result: { allowed: true, remaining: 5 } }] })),
    fetch: overrides.fetch || (async () => ({
      ok: true,
      status: 200,
      async json() { return { output_text: 'Lectura agregada segura.' }; },
    })),
    env: { ...BASE_ENV, ...(overrides.env || {}) },
    quotaStore: overrides.quotaStore || new Map(),
    logger: overrides.logger || { info() {} },
    requestIdFactory: () => 'durable-quota-test',
    now: () => Date.parse('2026-08-20T12:00:00.000Z'),
  };
  if (Object.hasOwn(overrides, 'takeIdentityRateLimit')) {
    dependencies.takeIdentityRateLimit = overrides.takeIdentityRateLimit;
  }
  return createInternalAssistantHandler(dependencies);
}

async function request(overrides = {}) {
  const res = recorder();
  await endpoint(overrides)({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { intent: 'workforce_summary', enhance: true },
  }, res);
  return res;
}

test('v2 consume cuotas SQL hash-only de tenant+usuario y tenant antes de OpenAI', async () => {
  const sqlCalls = [];
  let fetchCalls = 0;
  const logs = [];
  const res = await request({
    getTenantIdentitySql: async () => ({
      async query(sql, params) {
        sqlCalls.push({ sql, params });
        return [{ result: { allowed: true, remaining: 5 } }];
      },
    }),
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, status: 200, async json() { return { output_text: 'Lectura agregada segura.' }; } };
    },
    logger: { info(entry) { logs.push(entry); } },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.provider.status, 'used');
  assert.equal(fetchCalls, 1);
  assert.equal(sqlCalls.length, 2);
  assert.deepEqual(sqlCalls.map((call) => call.params[0]), [
    'assistant_external_user',
    'assistant_external_tenant',
  ]);
  for (const call of sqlCalls) {
    assert.match(call.sql, /tenant_identity_take_rate_limit/);
    assert.match(call.params[1], /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(call.params), new RegExp(`${USER_EMAIL}|${TENANT_ID}`, 'i'));
  }
  assert.notEqual(sqlCalls[0].params[1], sqlCalls[1].params[1]);
  const serializedLogs = logs.join('\n');
  assert.doesNotMatch(serializedLogs, new RegExp(`${USER_EMAIL}|${TENANT_ID}`, 'i'));
  assert.doesNotMatch(serializedLogs, new RegExp(sqlCalls[0].params[1], 'i'));
  assert.doesNotMatch(serializedLogs, new RegExp(sqlCalls[1].params[1], 'i'));
});

test('feature gate apagado impide SQL de cuota y fetch', async () => {
  let sqlCalls = 0;
  let fetchCalls = 0;
  const res = await request({
    env: { AI_ASSISTANT_EXTERNAL_ENRICHMENT_ENABLED: 'false' },
    getTenantIdentitySql: async () => { sqlCalls += 1; throw new Error('no debe abrir SQL'); },
    fetch: async () => { fetchCalls += 1; throw new Error('no debe llamar proveedor'); },
  });
  assert.equal(res.payload.provider.status, 'external_enrichment_disabled');
  assert.equal(res.payload.mode, 'deterministic');
  assert.equal(sqlCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('certificación o pepper ausentes degradan local sin SQL ni fetch', async () => {
  for (const [env, expected] of [
    [{ AI_ASSISTANT_DURABLE_QUOTA_CERTIFIED: 'false' }, 'durable_quota_not_certified'],
    [{ AI_ASSISTANT_QUOTA_PEPPER: '' }, 'durable_quota_not_configured'],
    [{ AI_ASSISTANT_QUOTA_PEPPER: ' '.repeat(64) }, 'durable_quota_not_configured'],
    [{ AI_ASSISTANT_QUOTA_PEPPER: 'demasiado-corto' }, 'durable_quota_not_configured'],
  ]) {
    let sqlCalls = 0;
    let fetchCalls = 0;
    const res = await request({
      env,
      getTenantIdentitySql: async () => { sqlCalls += 1; throw new Error('no debe abrir SQL'); },
      fetch: async () => { fetchCalls += 1; throw new Error('no debe llamar proveedor'); },
    });
    assert.equal(res.payload.provider.status, expected);
    assert.equal(sqlCalls, 0);
    assert.equal(fetchCalls, 0);
  }
});

test('falla de la base durable es fail-closed y conserva la respuesta local', async () => {
  let fetchCalls = 0;
  const res = await request({
    getTenantIdentitySql: async () => { throw new Error('quota database unavailable'); },
    fetch: async () => { fetchCalls += 1; throw new Error('no debe llamar proveedor'); },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.provider.status, 'durable_quota_unavailable');
  assert.equal(res.payload.data.gap, 28);
  assert.equal(fetchCalls, 0);
});

test('límite durable de usuario bloquea antes del bucket tenant y del proveedor', async () => {
  const calls = [];
  let fetchCalls = 0;
  const res = await request({
    takeIdentityRateLimit: async (_sql, scope, hash, options) => {
      calls.push({ scope, hash, options });
      return { allowed: false, retryAfterSeconds: 37 };
    },
    fetch: async () => { fetchCalls += 1; throw new Error('no debe llamar proveedor'); },
  });
  assert.equal(res.payload.provider.status, 'durable_user_rate_limited');
  assert.equal(res.payload.provider.retryAfterSeconds, 37);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scope, 'assistant_external_user');
  assert.equal(fetchCalls, 0);
});

test('límite durable de tenant bloquea después del bucket usuario y antes del proveedor', async () => {
  const calls = [];
  let fetchCalls = 0;
  const res = await request({
    takeIdentityRateLimit: async (_sql, scope, hash, options) => {
      calls.push({ scope, hash, options });
      return scope === 'assistant_external_user'
        ? { allowed: true, remaining: 2 }
        : { allowed: false, retryAfterSeconds: 49 };
    },
    fetch: async () => { fetchCalls += 1; throw new Error('no debe llamar proveedor'); },
  });
  assert.equal(res.payload.provider.status, 'durable_tenant_rate_limited');
  assert.equal(res.payload.provider.retryAfterSeconds, 49);
  assert.deepEqual(calls.map((call) => call.scope), ['assistant_external_user', 'assistant_external_tenant']);
  assert.equal(fetchCalls, 0);
});

test('límites configurables quedan acotados y el Map actúa sólo tras la cuota durable', async () => {
  const durableCalls = [];
  let fetchCalls = 0;
  const quotaStore = new Map();
  const overrides = {
    env: {
      AI_ASSISTANT_USER_CALLS_PER_WINDOW: '999',
      AI_ASSISTANT_TENANT_CALLS_PER_WINDOW: '999',
      AI_ASSISTANT_QUOTA_WINDOW_SECONDS: '1',
      AI_ASSISTANT_QUOTA_BLOCK_SECONDS: '999999',
      AI_ASSISTANT_CALLS_PER_WINDOW: '1',
    },
    quotaStore,
    takeIdentityRateLimit: async (_sql, scope, _hash, options) => {
      durableCalls.push({ scope, options });
      return { allowed: true, remaining: 1 };
    },
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, status: 200, async json() { return { output_text: 'ok' }; } };
    },
  };
  const first = await request(overrides);
  const second = await request(overrides);

  assert.equal(first.payload.provider.status, 'used');
  assert.equal(second.payload.provider.status, 'runtime_rate_limited');
  assert.equal(fetchCalls, 1);
  assert.equal(durableCalls.length, 4, 'cada request atraviesa primero ambos buckets durables');
  assert.deepEqual(durableCalls[0].options, { limit: 20, windowSeconds: 10, blockSeconds: 3600 });
  assert.deepEqual(durableCalls[1].options, { limit: 100, windowSeconds: 10, blockSeconds: 3600 });
});

test('una sesión legacy nunca habilita enriquecimiento aunque los gates estén activos', async () => {
  let sqlCalls = 0;
  let fetchCalls = 0;
  const res = await request({
    requireCompatibleInternalAccess: async () => ({
      mode: 'legacy',
      session: { id: 'legacy-session', email: USER_EMAIL },
      principal: null,
    }),
    getTenantIdentitySql: async () => { sqlCalls += 1; return { query: async () => [] }; },
    fetch: async () => { fetchCalls += 1; throw new Error('no debe llamar proveedor'); },
  });
  assert.equal(res.payload.provider.status, 'managed_identity_required');
  assert.equal(sqlCalls, 0);
  assert.equal(fetchCalls, 0);
});
