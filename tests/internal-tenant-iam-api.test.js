import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InternalAdminError,
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
    requireInternalSession: () => ({ email: 'owner@example.test', role: 'ADMIN_INTERNO' }),
    getInternalAdminSql: async () => ({ query: async () => [] }),
    getInternalAdminView: async () => ({
      user: { email: 'owner@example.test', platformRole: 'PLATFORM_OWNER' },
      context: { mode: 'platform', tenantAwareGateway: false },
      tenants: [], roles: [], allowedCommands: ['invite_user'],
      controls: { sodReady: true, auditReady: true }, exclusiveAssignments: [],
    }),
    applyInternalAdminCommand: async (_sql, _email, command) => ({
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

test('POST prepara invitación inactiva y aplica same-origin, JSON e idempotencia', async () => {
  const handler = createInternalAdminHandler(dependencies({ env: { VERCEL_ENV: 'production' } }));
  const noOrigin = response();
  await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {} }, noOrigin);
  assert.equal(noOrigin.statusCode, 403);

  const res = response();
  await handler({
    method: 'POST',
    headers: {
      origin: 'https://municipio.example', host: 'municipio.example',
      'content-type': 'application/json', 'idempotency-key': KEY,
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
