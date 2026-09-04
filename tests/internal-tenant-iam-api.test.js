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
const RELEASE_SHA = 'a'.repeat(40);
const BINDING_ID = '44444444-4444-4444-8444-444444444444';
const CONTRACT_ID = 'd30a43b1-b002-fbc9-d287-0ca0b816dcd7';

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
    env: { NODE_ENV: 'test', INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA },
    requireCompatibleInternalAccess: async () => ({
      mode: 'managed',
      session: { id: SESSION_ID, email: 'owner@example.test', version: 4 },
      principal: {
        authorized: true,
        user: { email: 'owner@example.test' },
        platform: {
          roles: ['PLATFORM_OWNER'],
          capabilities: [
            'platform.tenants.manage', 'platform.crm.manage',
            'platform.users.invite', 'platform.users.manage', 'platform.roles.manage',
          ],
        },
        session: { mfa: true },
        tenant: null,
      },
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

  for (const email of ['persona@localhost', 'persona@dominio', 'persona..doble@example.test']) {
    assert.throws(() => normalizeInternalAdminCommand({
      command: 'invite_user',
      payload: {
        tenantId: TENANT_ID, email, displayName: 'No entregable', roleKey: 'TENANT_ADMIN',
      },
    }, KEY), (error) => error instanceof InternalAdminError
      && error.code === 'INTERNAL_ADMIN_PAYLOAD_INVALID');
  }

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

test('administración usa el contrato explícito aunque cambie el SHA del deployment', async () => {
  let receivedRelease = null;
  const handler = createInternalAdminHandler(dependencies({
    env: {
      NODE_ENV: 'test',
      INTERNAL_CERTIFIED_RELEASE_SHA: RELEASE_SHA.toUpperCase(),
      VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40),
    },
    getInternalAdminView: async (_sql, _session, _resource, _limit, options) => {
      receivedRelease = options.releaseSha;
      return { tenants: [], roles: [], allowedCommands: [], controls: {} };
    },
  }));
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { resource: 'bootstrap' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(receivedRelease, RELEASE_SHA);

  const invalid = createInternalAdminHandler(dependencies({
    env: {
      NODE_ENV: 'test',
      INTERNAL_CERTIFIED_RELEASE_SHA: 'manual-sin-sha',
      VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
    },
  }));
  const invalidRes = response();
  await invalid({ method: 'GET', headers: {}, query: { resource: 'bootstrap' } }, invalidRes);
  assert.equal(invalidRes.statusCode, 503);
  assert.equal(invalidRes.payload.code, 'INTERNAL_ADMIN_RELEASE_NOT_CERTIFIED');
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

test('Hugo y consulta no enumeran ni mutan administración aunque aleguen capacidades platform', async () => {
  for (const roleKey of ['HUGO_APROBADOR_INTEGRAL', 'CONSULTA_INTEGRAL']) {
    let sqlCalls = 0;
    let commandCalls = 0;
    const handler = createInternalAdminHandler(dependencies({
      requireCompatibleInternalAccess: async () => ({
        mode: 'managed',
        session: { id: SESSION_ID, email: 'actor@example.test', version: 4 },
        principal: {
          authorized: true,
          user: { email: 'actor@example.test' },
          platform: { roles: [], capabilities: ['platform.users.invite'] },
          session: { mfa: true },
          tenant: null,
          tenantRoleKey: roleKey,
        },
      }),
      getInternalAdminSql: async () => { sqlCalls += 1; return {}; },
      applyInternalAdminCommand: async () => { commandCalls += 1; return {}; },
    }));
    const getRes = response();
    await handler({ method: 'GET', headers: {}, query: { resource: 'bootstrap' } }, getRes);
    assert.equal(getRes.statusCode, 403, roleKey);
    assert.equal(getRes.payload.code, 'INTERNAL_ADMIN_PLATFORM_OWNER_REQUIRED');

    const postRes = response();
    await handler({
      method: 'POST', query: {},
      headers: { 'content-type': 'application/json', 'idempotency-key': KEY },
      body: {
        command: 'invite_user',
        payload: {
          tenantId: TENANT_ID, email: 'new@example.test',
          displayName: 'Cuenta nueva', roleKey: 'CONSULTA_INTEGRAL',
        },
      },
    }, postRes);
    assert.equal(postRes.statusCode, 403, roleKey);
    assert.equal(postRes.payload.code, 'INTERNAL_ADMIN_PLATFORM_OWNER_REQUIRED');
    assert.equal(sqlCalls, 0);
    assert.equal(commandCalls, 0);
  }
});

test('propietario sin capacidad exacta no puede invitar', async () => {
  let sqlCalls = 0;
  const handler = createInternalAdminHandler(dependencies({
    requireCompatibleInternalAccess: async () => ({
      mode: 'managed',
      session: { id: SESSION_ID, email: 'owner@example.test', version: 4 },
      principal: {
        authorized: true,
        user: { email: 'owner@example.test' },
        platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.tenants.manage'] },
        session: { mfa: true }, tenant: null,
      },
    }),
    getInternalAdminSql: async () => { sqlCalls += 1; return {}; },
  }));
  const res = response();
  await handler({
    method: 'POST', query: {},
    headers: { 'content-type': 'application/json', 'idempotency-key': KEY },
    body: {
      command: 'invite_user',
      payload: {
        tenantId: TENANT_ID, email: 'new@example.test',
        displayName: 'Cuenta nueva', roleKey: 'CONSULTA_INTEGRAL',
      },
    },
  }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'INTERNAL_ADMIN_PLATFORM_OWNER_REQUIRED');
  assert.equal(sqlCalls, 0);
});

test('librería de administración invoca exclusivamente facades versionadas ligadas a SID/version', async () => {
  const calls = [];
  const sql = {
    async query(statement, values) {
      calls.push({ statement, values });
      return [{ result: { ok: true } }];
    },
  };
  const session = { id: SESSION_ID, email: 'owner@example.test', version: 4 };
  await getInternalAdminView(sql, session, 'users', 20, { releaseSha: RELEASE_SHA });
  const command = normalizeInternalAdminCommand({
    command: 'suspend_membership', expectedVersion: 2,
    payload: { membershipId: MEMBERSHIP_ID },
  }, KEY);
  await applyInternalAdminCommand(sql, session, command);
  assert.match(calls[0].statement, /tenant_iam_admin_view_v4/);
  assert.deepEqual(calls[0].values.slice(0, 5), [
    'owner@example.test', SESSION_ID, 4, RELEASE_SHA, 'users',
  ]);
  assert.match(calls[1].statement, /tenant_iam_apply_command_v2/);
  assert.deepEqual(calls[1].values.slice(0, 4), [
    'owner@example.test', SESSION_ID, 4, 'suspend_membership',
  ]);
  assert.doesNotMatch(calls.map((call) => call.statement).join('\n'), /tenant_iam_admin_view\(\$|tenant_iam_apply_command\(\$/);
  await assert.rejects(
    getInternalAdminView(sql, { id: 'not-a-sid', email: 'owner@example.test', version: 4 },
      'bootstrap', 100, { releaseSha: RELEASE_SHA }),
    (error) => error.code === 'INTERNAL_ADMIN_SESSION_INVALID' && error.status === 401,
  );
});

test('provisioning laboral deriva tenant y liga replay a SID/version/release', async () => {
  const calls = [];
  const sql = { async query(statement, values) {
    calls.push({ statement, values });
    if (statement.includes('tenant_action_lookup_employment_v2')) return [{ result: {
      tenantId: TENANT_ID, membershipId: MEMBERSHIP_ID, candidates: [], ephemeral: true, limit: 20,
    } }];
    return [{ result: { ok: true, version: 4 } }];
  } };
  const session = { id: SESSION_ID, email: 'owner@example.test', version: 4 };
  const lookup = normalizeInternalAdminCommand({
    command: 'lookup_employment',
    payload: { tenantId: TENANT_ID, membershipId: MEMBERSHIP_ID, query: 'tes', limit: 20 },
  }, KEY);
  await applyInternalAdminCommand(sql, session, lookup, { releaseSha: RELEASE_SHA });
  assert.match(calls[0].statement, /tenant_action_lookup_employment_v2/);
  assert.deepEqual(calls[0].values.slice(0, 5), [
    'owner@example.test', SESSION_ID, 4, RELEASE_SHA, MEMBERSHIP_ID,
  ]);

  const link = normalizeInternalAdminCommand({
    command: 'link_employment', expectedVersion: 3,
    payload: {
      membershipId: MEMBERSHIP_ID, employmentContractId: CONTRACT_ID,
      sourceBindingId: BINDING_ID, reasonCode: 'onboarding', reason: 'Alta validada',
    },
  }, KEY);
  await applyInternalAdminCommand(sql, session, link, { releaseSha: RELEASE_SHA });
  await applyInternalAdminCommand(sql, {
    ...session, id: '66666666-6666-4666-8666-666666666666', version: 1,
  }, link, { releaseSha: RELEASE_SHA });
  assert.match(calls[1].statement, /tenant_action_apply_provisioning_command_v2/);
  assert.equal(calls[1].values[4], MEMBERSHIP_ID);
  assert.equal(calls[1].values[7].length, 64);
  assert.notEqual(calls[1].values[7], calls[2].values[7], 'hash debe cambiar al rotar SID/version');
  assert.equal(Object.hasOwn(JSON.parse(calls[1].values[9]), 'membershipId'), false);
});

test('link_employment acepta UUID canónico de PostgreSQL sin relajar otros identificadores', () => {
  const body = {
    command: 'link_employment', expectedVersion: 3,
    payload: {
      membershipId: MEMBERSHIP_ID,
      employmentContractId: CONTRACT_ID.toUpperCase(),
      sourceBindingId: BINDING_ID,
      reasonCode: 'correction',
      reason: 'Corrección auditada',
    },
  };
  const normalized = normalizeInternalAdminCommand(body, KEY);
  assert.equal(normalized.payload.employmentContractId, CONTRACT_ID);

  for (const malformed of [
    'd30a43b1-b002-fbc9-d287-0ca0b816dcd',
    'd30a43b1-b002-fbc9-d287-0ca0b816dcdz',
    'd30a43b1b002fbc9d2870ca0b816dcd7',
  ]) {
    assert.throws(() => normalizeInternalAdminCommand({
      ...body,
      payload: { ...body.payload, employmentContractId: malformed },
    }, KEY), (error) => error instanceof InternalAdminError
      && error.code === 'INTERNAL_ADMIN_PAYLOAD_INVALID'
      && error.status === 422);
  }

  assert.throws(() => normalizeInternalAdminCommand({
    ...body,
    payload: { ...body.payload, membershipId: CONTRACT_ID },
  }, KEY), (error) => error instanceof InternalAdminError
    && error.code === 'INTERNAL_ADMIN_PAYLOAD_INVALID'
    && error.status === 422);
  assert.throws(() => normalizeInternalAdminCommand({
    ...body,
    payload: { ...body.payload, sourceBindingId: CONTRACT_ID },
  }, KEY), (error) => error instanceof InternalAdminError
    && error.code === 'INTERNAL_ADMIN_PAYLOAD_INVALID'
    && error.status === 422);
});

test('provisioning valida motivo igual que la facade SQL y mapea formas invalidas a 422', () => {
  assert.throws(() => normalizeInternalAdminCommand({
    command: 'revoke_employment_link', expectedVersion: 2,
    payload: { membershipId: MEMBERSHIP_ID, reasonCode: 'offboarding', reason: 'x' },
  }, KEY), (error) => error.code === 'INTERNAL_ADMIN_REASON_INVALID' && error.status === 422);
  for (const code of [
    'TENANT_ACTION_PROVISIONING_INVALID', 'TENANT_ACTION_LOOKUP_INVALID',
    'TENANT_ACTION_SCOPE_INVALID', 'TENANT_ACTION_REASON_REQUIRED',
  ]) {
    assert.equal(internalAdminDatabaseError(new Error(code)).status, 422);
  }
});

test('POST prepara invitación inactiva y aplica same-origin, JSON e idempotencia', async () => {
  const handler = createInternalAdminHandler(dependencies({
    env: { VERCEL_ENV: 'production', IDENTITY_APP_ORIGIN: 'https://municipio.example',
      INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA },
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
