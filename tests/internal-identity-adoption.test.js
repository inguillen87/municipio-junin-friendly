import assert from 'node:assert/strict';
import test from 'node:test';

import { createInternalActionsHandler } from '../api/internal-actions.js';
import { createInternalAdminHandler } from '../api/internal-admin.js';
import { createInternalAssistantHandler } from '../api/internal-assistant.js';
import { createInternalDataHandler } from '../api/internal-data.js';

function response() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('internal-data exige capability, data plane, binding y bloquea legacy antes de SQL', async () => {
  let options;
  let sqlCalls = 0;
  const handler = createInternalDataHandler({
    requireCompatibleInternalAccess: async (_req, _res, received) => { options = received; return null; },
    getInternalSql: async () => { sqlCalls += 1; return {}; },
    env: { VERCEL_ENV: 'production' },
  });
  await handler({ method: 'GET', query: { resource: 'employees' }, headers: {} }, response());
  assert.deepEqual(options.requiredCapabilities, ['workforce.employee.read']);
  assert.equal(options.requireDataPlaneReady, true);
  assert.equal(options.requireCertifiedDataBinding, true);
  assert.equal(options.allowLegacy, false);
  assert.equal(sqlCalls, 0);
});

test('assistant exige assistant.use y luego la capability específica antes de consultar datos', async () => {
  let accessOptions;
  let sqlCalls = 0;
  let fetchCalls = 0;
  const handler = createInternalAssistantHandler({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      accessOptions = options;
      return {
        mode: 'managed',
        session: { id: 'session', email: 'reader@example.invalid' },
        principal: { tenant: { effectiveCapabilities: ['assistant.use'] } },
      };
    },
    getInternalSql: async () => { sqlCalls += 1; return {}; },
    fetch: async () => { fetchCalls += 1; return {}; },
    requestIdFactory: () => 'identity-adoption-test',
    logger: { log() {}, error() {} },
  });
  const res = response();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { message: 'Buscá a Mauricio Alonso' },
  }, res);
  assert.deepEqual(accessOptions.requiredCapabilities, ['assistant.use']);
  assert.equal(accessOptions.requireDataPlaneReady, true);
  assert.equal(accessOptions.requireCertifiedDataBinding, true);
  assert.equal(accessOptions.allowLegacy, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'IDENTITY_CAPABILITY_REQUIRED');
  assert.equal(sqlCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('acciones y administración declaran sus gates antes de abrir el runtime', async () => {
  let actionOptions;
  let adminOptions;
  let actionSqlCalls = 0;
  let adminSqlCalls = 0;
  const actions = createInternalActionsHandler({
    requireCompatibleInternalAccess: async (_req, _res, options) => { actionOptions = options; return null; },
    getInternalSql: async () => { actionSqlCalls += 1; return {}; },
  });
  const admin = createInternalAdminHandler({
    requireCompatibleInternalAccess: async (_req, _res, options) => { adminOptions = options; return null; },
    getInternalAdminSql: async () => { adminSqlCalls += 1; return {}; },
  });
  await actions({ method: 'GET', query: { resource: 'bootstrap' }, headers: {} }, response());
  await admin({ method: 'GET', query: { resource: 'bootstrap' }, headers: {} }, response());

  assert.deepEqual(actionOptions.requiredCapabilities, ['actions.read']);
  assert.equal(actionOptions.requireDataPlaneReady, true);
  assert.equal(actionOptions.requireCertifiedDataBinding, true);
  assert.equal(actionOptions.allowLegacy, false);
  assert.equal(actionSqlCalls, 0);

  assert.equal(adminOptions.capabilityMode, 'any');
  assert.ok(adminOptions.requiredCapabilities.includes('platform.tenants.manage'));
  assert.equal(adminOptions.allowLegacy, false);
  assert.equal(adminSqlCalls, 0);
});
