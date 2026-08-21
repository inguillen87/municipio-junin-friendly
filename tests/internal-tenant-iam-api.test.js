import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InternalAdminError,
  applyInternalAdminCommand,
  getInternalAdminView,
  internalAdminDatabaseError,
  normalizeInternalAdminCommand,
} from '../lib/internal-admin.js';
import {
  assertInternalAdminRuntimeIdentity,
  createInternalAdminHandler,
  getInternalAdminSql,
} from '../api/internal-admin.js';

const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function dependencies(overrides = {}) {
  return {
    env: { NODE_ENV: 'test' },
    requireCompatibleInternalAccess: async () => ({
      mode: 'managed',
      session: { id: SESSION_ID, email: 'owner@example.test', version: 4 },
      principal: { user: { email: 'owner@example.test' }, tenant: null },
    }),
    getInternalAdminSql: async () => ({ query: async () => [] }),
    getInternalAdminView: async () => ({
      user: { email: 'owner@example.test', platformRole: 'PLATFORM_OWNER' },
      context: { mode: 'platform', tenantAwareGateway: false },
      tenants: [], roles: [], allowedCommands: ['invite_user'],
      controls: { sodReady: true, auditReady: true }, exclusiveAssignments: [],
    }),
    applyInternalAdminCommand: async (_sql, _session, command) => ({
      membership: { id: MEMBERSHIP_ID, status: 'invited', version: 1 },
      invitation: { status: 'prepared', gatewayReady: false },
      credentialsCreated: false, replayed: false, command: command.command,
    }),
    ...overrides,
  };
}

test('normalizador acepta invitación sin secretos y exige versiones en cambios', () => {
  const invite = normalizeInternalAdminCommand({
    command: 'invite_user',
    payload: {
      tenantId: TENANT_ID, email: 'Demo@Example.test', displayName: 'Demo Tesorería',
      roleKey: 'JUNIN_TESORERIA_CARGA',
    },
  }, KEY);
  assert.equal(invite.payload.email, 'demo@example.test');
  assert.equal(invite.expectedVersion, null);
  assert.match(invite.commandHash, /^[a-f0-9]{64}$/);

  assert.throws(() => normalizeInternalAdminCommand({
    command: 'suspend_membership', payload: { membershipId: MEMBERSHIP_ID },
  }, KEY), (error) => error instanceof InternalAdminError && error.code === 'INTERNAL_ADMIN_VERSION_REQUIRED');
});

test('overrides son allow/deny mutuamente excluyentes y bloquean secretos', () => {
  assert.throws(() => normalizeInternalAdminCommand({
    command: 'update_access', expectedVersion: 1,
    payload: {
      membershipId: MEMBERSHIP_ID, roleKey: 'TENANT_ADMIN',
      allowCapabilities: ['absence.enter'], denyCapabilities: ['absence.enter'], reason: 'prueba',
    },
  }, KEY), (error) => error.code === 'INTERNAL_ADMIN_OVERRIDE_AMBIGUOUS');

  assert.throws(() => normalizeInternalAdminCommand({
    command: 'invite_user',
    payload: {
      tenantId: TENANT_ID, email: 'demo@example.test', displayName: 'Demo',
      roleKey: 'TENANT_ADMIN', password: 'no-debe-existir',
    },
  }, KEY), (error) => ['INTERNAL_ADMIN_FIELD_UNSUPPORTED', 'INTERNAL_ADMIN_SECRET_FORBIDDEN'].includes(error.code));
});

test('responsabilidad exclusiva admite únicamente time.overtime.enter', () => {
  assert.throws(() => normalizeInternalAdminCommand({
    command: 'assign_exclusive_capability', expectedVersion: 1,
    payload: { membershipId: MEMBERSHIP_ID, capabilityKey: 'time.overtime.approve' },
  }, KEY), (error) => error.code === 'INTERNAL_ADMIN_CAPABILITY_INVALID');
  assert.doesNotThrow(() => normalizeInternalAdminCommand({
    command: 'assign_exclusive_capability', expectedVersion: 1,
    payload: { membershipId: MEMBERSHIP_ID, capabilityKey: 'time.overtime.enter' },
  }, KEY));
});

test('colisiones concurrentes se traducen a conflictos estables', () => {
  assert.equal(
    internalAdminDatabaseError(new Error('duplicate key tenant_exclusive_capability_active_uk')).code,
    'INTERNAL_ADMIN_EXCLUSIVE_CONFLICT',
  );
  assert.equal(
    internalAdminDatabaseError(new Error('duplicate key internal_users_email_lower_uk')).code,
    'INTERNAL_ADMIN_USER_EXISTS',
  );
});

test('GET bootstrap expone el contrato esperado sin confiar en el rol del cookie', async () => {
  const res = response();
  const handler = createInternalAdminHandler(dependencies());
  await handler({ method: 'GET', headers: {}, query: { resource: 'bootstrap' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.user.platformRole, 'PLATFORM_OWNER');
  assert.equal(res.payload.context.tenantAwareGateway, false);
  assert.deepEqual(res.payload.controls, { sodReady: true, auditReady: true });
  assert.match(res.headers['Cache-Control'], /no-store/);
  assert.equal(res.headers.Vary, 'Cookie');
});

test('administración global exige contexto Plataforma aunque el usuario conserve capabilities globales', async () => {
  let sqlCalls = 0;
  const handler = createInternalAdminHandler(dependencies({
    requireCompatibleInternalAccess: async () => ({
      mode: 'managed',
      session: { email: 'owner@example.test' },
      principal: {
        tenant: { id: TENANT_ID, slug: 'junin-mendoza' },
        platform: { capabilities: ['platform.users.manage'] },
      },
    }),
    getInternalAdminSql: async () => { sqlCalls += 1; return {}; },
  }));
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { resource: 'bootstrap' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'IDENTITY_PLATFORM_CONTEXT_REQUIRED');
  assert.equal(sqlCalls, 0);
});

test('contexto legacy no puede enumerar ni mutar aunque alegue el email del owner', async () => {
  let sqlCalls = 0;
  const handler = createInternalAdminHandler(dependencies({
    requireCompatibleInternalAccess: async () => ({
      mode: 'legacy', session: { email: 'owner@example.test', role: 'ADMIN_INTERNO' }, principal: null,
    }),
    getInternalAdminSql: async () => { sqlCalls += 1; return {}; },
  }));
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { resource: 'bootstrap' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'IDENTITY_PLATFORM_CONTEXT_REQUIRED');
  assert.equal(sqlCalls, 0);
});

test('librería de administración invoca exclusivamente facades v2 ligadas a SID/version', async () => {
  const calls = [];
  const sql = {
    async query(statement, values) {
      calls.push({ statement, values });
      return [{ result: { ok: true } }];
    },
  };
  const session = { id: SESSION_ID, email: 'owner@example.test', version: 4 };
  await getInternalAdminView(sql, session, 'users', 20);
  const command = normalizeInternalAdminCommand({
    command: 'suspend_membership', expectedVersion: 2,
    payload: { membershipId: MEMBERSHIP_ID },
  }, KEY);
  await applyInternalAdminCommand(sql, session, command);
  assert.match(calls[0].statement, /tenant_iam_admin_view_v2/);
  assert.deepEqual(calls[0].values.slice(0, 3), ['owner@example.test', SESSION_ID, 4]);
  assert.match(calls[1].statement, /tenant_iam_apply_command_v2/);
  assert.deepEqual(calls[1].values.slice(0, 4), [
    'owner@example.test', SESSION_ID, 4, 'suspend_membership',
  ]);
  assert.doesNotMatch(calls.map((call) => call.statement).join('\n'), /tenant_iam_admin_view\(\$|tenant_iam_apply_command\(\$/);
  await assert.rejects(
    getInternalAdminView(sql, { id: 'not-a-sid', email: 'owner@example.test', version: 4 }),
    (error) => error.code === 'INTERNAL_ADMIN_SESSION_INVALID' && error.status === 401,
  );
});

test('POST prepara invitación inactiva y aplica same-origin, JSON e idempotencia', async () => {
  const handler = createInternalAdminHandler(dependencies({
    env: { VERCEL_ENV: 'production', IDENTITY_APP_ORIGIN: 'https://municipio.example' },
  }));
  const noOrigin = response();
  await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {} }, noOrigin);
  assert.equal(noOrigin.statusCode, 403);

  const reflectedHostAttack = response();
  await handler({
    method: 'POST',
    headers: {
      origin: 'https://evil.example', host: 'evil.example',
      'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'idempotency-key': KEY,
    },
    body: {},
  }, reflectedHostAttack);
  assert.equal(reflectedHostAttack.statusCode, 403);
  assert.equal(reflectedHostAttack.payload.code, 'INTERNAL_ADMIN_ORIGIN_INVALID');

  const crossSite = response();
  await handler({
    method: 'POST',
    headers: {
      origin: 'https://municipio.example', host: 'municipio.example',
      'sec-fetch-site': 'cross-site', 'content-type': 'application/json', 'idempotency-key': KEY,
    },
    body: {},
  }, crossSite);
  assert.equal(crossSite.statusCode, 403);
  assert.equal(crossSite.payload.code, 'INTERNAL_ADMIN_ORIGIN_INVALID');

  const res = response();
  await handler({
    method: 'POST',
    headers: {
      origin: 'https://municipio.example', host: 'municipio.example',
      'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'idempotency-key': KEY,
    },
    body: {
      command: 'invite_user',
      payload: {
        tenantId: TENANT_ID, email: 'demo@example.test', displayName: 'Demo',
        roleKey: 'JUNIN_TESORERIA_CARGA',
      },
    },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.credentialsCreated, false);
  assert.equal(res.payload.invitation.gatewayReady, false);
});

test('Production exige runtime aislado y rechaza owner o SET ROLE', async () => {
  await assert.rejects(
    getInternalAdminSql({ VERCEL_ENV: 'production', DATABASE_URL: 'postgresql://owner/db' }),
    (error) => error.code === 'INTERNAL_ADMIN_DATABASE_ROLE_REQUIRED',
  );
  assert.doesNotThrow(() => assertInternalAdminRuntimeIdentity({
    currentUser: 'municontrol_actions_runtime_app', sessionUser: 'municontrol_actions_runtime_app',
  }));
  assert.throws(() => assertInternalAdminRuntimeIdentity({
    currentUser: 'municontrol_actions_runtime_app', sessionUser: 'neondb_owner',
  }), (error) => error.code === 'INTERNAL_ADMIN_DATABASE_ROLE_REQUIRED');
});
