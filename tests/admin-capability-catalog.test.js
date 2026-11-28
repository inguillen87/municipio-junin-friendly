import assert from 'node:assert/strict';
import test from 'node:test';

import { createInternalAdminHandler } from '../api/internal-admin.js';

const RELEASE = '3d59c5278151de0df4cd08aa73a0c8e833ab5d35';
const SESSION = '10000000-0000-4000-8000-000000000001';
const TENANT = '20000000-0000-4000-8000-000000000001';
const CATALOG = [{
  key: 'payroll.calculation.close',
  label: 'Cerrar liquidación propia',
  description: 'Catálogo sintético sin asignación a rol',
  scopeKind: 'tenant',
  sensitivity: 'privileged',
  conflictsWith: [],
}];

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function access(principal = {}) {
  return {
    mode: 'managed',
    session: { id: SESSION, email: 'catalog-owner@qa.invalid', version: 1, mfa: true },
    principal: {
      authorized: true,
      tenant: null,
      platform: {
        roles: ['PLATFORM_OWNER'],
        capabilities: ['platform.users.manage', 'platform.roles.manage'],
      },
      ...principal,
    },
  };
}

for (const resource of ['bootstrap', 'roles']) {
  for (const tenantId of ['', TENANT]) {
    test(`API y biblioteca conservan capabilityCatalog en ${resource}, tenant=${Boolean(tenantId)}`, async () => {
      const expected = {
        resource, tenantId: tenantId || null,
        roles: [{ key: 'QA_TENANT_MEMBER', capabilities: [] }],
        allowedCommands: ['update_access'], capabilityCatalog: CATALOG,
      };
      const calls = [];
      const handler = createInternalAdminHandler({
        env: { NODE_ENV: 'test', INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE },
        requireCompatibleInternalAccess: async () => access(),
        getInternalAdminSql: async () => ({
          query: async (statement, parameters) => {
            calls.push({ statement, parameters });
            return tenantId ? { rows: [{ result: expected }] } : [{ result: expected }];
          },
        }),
      });
      const res = response();
      await handler({ method: 'GET', query: { resource, tenantId } }, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.payload, { ok: true, ...expected });
      assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
      assert.equal(calls.length, 1);
      assert.match(calls[0].statement, /SELECT tenant_iam_admin_view_v4\(/);
      assert.deepEqual(calls[0].parameters,
        ['catalog-owner@qa.invalid', SESSION, 1, RELEASE, resource, tenantId || null, 100]);
      assert.equal(res.payload.roles[0].capabilities.length, 0);
      assert.equal(res.payload.capabilityCatalog[0].key, 'payroll.calculation.close');
    });
  }
}

for (const [name, principal, code] of [
  ['contexto municipal', { tenant: { id: TENANT } }, 'IDENTITY_PLATFORM_CONTEXT_REQUIRED'],
  ['sin propietario vigente', { platform: { roles: [], capabilities: ['platform.roles.manage'] } },
    'INTERNAL_ADMIN_PLATFORM_OWNER_REQUIRED'],
]) {
  test(`catálogo conserva rechazo API: ${name}`, async () => {
    let reads = 0;
    const handler = createInternalAdminHandler({
      env: { NODE_ENV: 'test', INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE },
      requireCompatibleInternalAccess: async () => access(principal),
      getInternalAdminSql: async () => { reads += 1; throw new Error('unexpected database access'); },
    });
    const res = response();
    await handler({ method: 'GET', query: { resource: 'roles', tenantId: TENANT } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.code, code);
    assert.equal(reads, 0);
  });
}
