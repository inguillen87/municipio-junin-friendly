import assert from 'node:assert/strict';
import test from 'node:test';

import { createInternalIdentityHandler } from '../api/internal-identity.js';
import {
  IdentityGatewayError,
  identityGatewayDatabaseError,
  normalizeIdentityDatabaseCommand,
} from '../lib/internal-identity-access.js';
import {
  IDENTITY_SESSION_COOKIE,
  issueIdentitySessionToken,
} from '../lib/internal-identity-crypto.js';

const ORIGIN = 'https://municipio.example';
const NOW = Date.parse('2026-08-24T12:00:00.000Z');
const RELEASE_SHA = 'a'.repeat(40);
const CLIENT_RELEASE_SHA = 'b'.repeat(40);
const SESSION_SECRET = 's'.repeat(48);
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_BINDING_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_BATCH_ID = '44444444-4444-4444-8444-444444444444';
const IDEMPOTENCY_KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_EMAIL = 'marcelo@example.test';
const SECRETS = Object.freeze({
  tokenPepper: 'p'.repeat(48),
  sessionSecret: SESSION_SECRET,
  encryptionKey: Buffer.alloc(32, 7),
});
const PAYLOAD = Object.freeze({
  tenantId: TENANT_ID,
  sourceSystem: 'GRH',
  sourceDatabase: 'grh_junin',
  sourceCompanyId: 101,
  reason: 'Acreditacion del backup municipal publicado',
});

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function sessionCookie() {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: ACTOR_EMAIL, version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  return `${IDENTITY_SESSION_COOKIE}=${token}`;
}

function request(payload = PAYLOAD, options = {}) {
  const headers = {
    origin: options.origin ?? ORIGIN,
    'content-type': options.contentType ?? 'application/json',
    'x-vercel-forwarded-for': '203.0.113.44',
    ...(options.cookie === false ? {} : { cookie: options.cookie || sessionCookie() }),
    ...(options.idempotencyKey === null ? {} : {
      'idempotency-key': options.idempotencyKey || IDEMPOTENCY_KEY,
    }),
  };
  return {
    method: 'POST', headers,
    body: {
      command: 'bind_source', payload,
      ...(options.expectedVersion === null ? {} : {
        expectedVersion: options.expectedVersion ?? 1,
      }),
    },
  };
}

function certificationRequest(options = {}) {
  const req = request({}, options);
  req.body = {
    command: 'certify_data_plane',
    payload: {
      tenantId: TENANT_ID,
      sourceBindingId: SOURCE_BINDING_ID,
      reason: 'Revision humana de evidencia canonica agregada',
    },
    expectedVersion: options.expectedVersion ?? 2,
  };
  return req;
}

function getRequest(query, options = {}) {
  return {
    method: 'GET', query,
    headers: options.cookie === false ? {} : { cookie: options.cookie || sessionCookie() },
  };
}

function handlerWithQuery(query, overrides = {}) {
  return createInternalIdentityHandler({
    env: {
      IDENTITY_APP_ORIGIN: ORIGIN,
      INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA,
      NODE_ENV: 'test',
    },
    identitySecrets: SECRETS,
    now: () => NOW,
    getTenantIdentitySql: async () => ({ query }),
    ...overrides,
  });
}

function platformPrincipal(overrides = {}) {
  return {
    authorized: true,
    user: { email: ACTOR_EMAIL },
    session: { id: SESSION_ID, version: 1, authLevel: 'mfa', mfa: true },
    platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.tenants.manage'] },
    tenant: null,
    ...overrides,
  };
}

test('bind_source se normaliza como comando versionado con payload exacto', () => {
  const normalized = normalizeIdentityDatabaseCommand('bind_source', {
    ...PAYLOAD, sourceSystem: 'grh', reason: `  ${PAYLOAD.reason}  `,
  }, { idempotencyKey: IDEMPOTENCY_KEY, expectedVersion: 7 });

  assert.equal(normalized.command, 'bind_source');
  assert.equal(normalized.expectedVersion, 7);
  assert.equal(normalized.idempotencyKey, IDEMPOTENCY_KEY);
  assert.deepEqual(normalized.payload, PAYLOAD);
  assert.match(normalized.commandHash, /^[a-f0-9]{64}$/);

  assert.throws(() => normalizeIdentityDatabaseCommand('bind_source', PAYLOAD, {
    idempotencyKey: IDEMPOTENCY_KEY,
  }), (error) => error instanceof IdentityGatewayError && error.code === 'IDENTITY_VERSION_REQUIRED');
  assert.throws(() => normalizeIdentityDatabaseCommand('bind_source', {
    ...PAYLOAD, reason: 'no',
  }, { idempotencyKey: IDEMPOTENCY_KEY, expectedVersion: 1 }),
  (error) => error instanceof IdentityGatewayError && error.code === 'IDENTITY_PAYLOAD_INVALID');
  assert.throws(() => normalizeIdentityDatabaseCommand('bind_source', {
    ...PAYLOAD, sourceDatabase: 'grh junin',
  }, { idempotencyKey: IDEMPOTENCY_KEY, expectedVersion: 1 }),
  (error) => error instanceof IdentityGatewayError && error.code === 'IDENTITY_PAYLOAD_INVALID');
  assert.throws(() => normalizeIdentityDatabaseCommand('bind_source', {
    ...PAYLOAD, releaseSha: CLIENT_RELEASE_SHA,
  }, { idempotencyKey: IDEMPOTENCY_KEY, expectedVersion: 1 }),
  (error) => error instanceof IdentityGatewayError && error.code === 'IDENTITY_FIELD_UNSUPPORTED');
});

test('bind_source usa identidad plataforma MFA, SHA server-side y fachada v2 session-bound', async () => {
  const calls = [];
  const handler = handlerWithQuery(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('tenant_identity_resolve_access')) {
      assert.deepEqual(params, [ACTOR_EMAIL, SESSION_ID, 1, 2, ['platform.tenants.manage'], 'all']);
      return [{ result: platformPrincipal() }];
    }
    if (sql.includes('tenant_identity_apply_platform_command_v2')) {
      assert.equal(params.length, 9);
      assert.deepEqual(params.slice(0, 6), [
        ACTOR_EMAIL, SESSION_ID, 1, RELEASE_SHA, 'bind_source', IDEMPOTENCY_KEY,
      ]);
      assert.match(params[6], /^[a-f0-9]{64}$/);
      assert.equal(params[7], 1);
      assert.deepEqual(JSON.parse(params[8]), PAYLOAD);
      assert.doesNotMatch(params[8], new RegExp(CLIENT_RELEASE_SHA));
      return [{ result: {
        sourceBinding: {
          id: SOURCE_BINDING_ID, tenantId: TENANT_ID, sourceSystem: 'GRH',
          sourceDatabase: 'grh_junin', sourceCompanyId: 101, verified: true,
          privateCredential: 'never-return-this',
        },
        canonicalEvidence: {
          sourceBatchId: SOURCE_BATCH_ID, sourceCutoff: '2026-08-19T15:00:00.000Z',
          validationState: 'published', contractCount: 2450,
          employeeEmail: 'persona@example.test',
        },
        policyVersion: 2, releaseSha: RELEASE_SHA, actorSessionVersion: 1,
        actorEmail: ACTOR_EMAIL, reason: PAYLOAD.reason, commandHash: 'c'.repeat(64),
        replayed: false,
      } }];
    }
    throw new Error('consulta no esperada');
  });
  const res = response();

  await handler(request(), res);

  assert.equal(calls.length, 2);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.payload, {
    ok: true,
    sourceBinding: {
      id: SOURCE_BINDING_ID, tenantId: TENANT_ID, sourceSystem: 'GRH',
      verified: true,
    },
    canonicalEvidence: {
      sourceCutoff: '2026-08-19T15:00:00.000Z',
      validationState: 'published', contractCount: 2450,
    },
    policyVersion: 2,
    replayed: false,
  });
  assert.match(res.headers['Cache-Control'], /private, no-store/);
  assert.equal(res.headers['Vary'], 'Cookie, Origin');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.doesNotMatch(JSON.stringify(res.payload), /actorEmail|actorSession|releaseSha|commandHash|reason|credential|persona@example|sourceDatabase|sourceCompanyId|sourceBatchId|grh_junin/i);
});

test('replay de bind_source devuelve 200 y conserva la respuesta publica allowlist', async () => {
  const handler = handlerWithQuery(async (sql) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: platformPrincipal() }];
    if (sql.includes('tenant_identity_apply_platform_command_v2')) return [{ result: {
      sourceBinding: {
        id: SOURCE_BINDING_ID, tenantId: TENANT_ID, sourceSystem: 'GRH',
        sourceDatabase: 'grh_junin', sourceCompanyId: 101, verified: true,
      },
      canonicalEvidence: {
        sourceBatchId: SOURCE_BATCH_ID, sourceCutoff: '2026-08-19T15:00:00.000Z',
        validationState: 'published', contractCount: 2450,
      },
      policyVersion: 2, replayed: true,
    } }];
    throw new Error('consulta no esperada');
  });
  const res = response();

  await handler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.replayed, true);
});

test('bind_source rechaza una respuesta DB cruzada o incompleta antes de publicarla', async () => {
  const handler = handlerWithQuery(async (sql) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: platformPrincipal() }];
    if (sql.includes('tenant_identity_apply_platform_command_v2')) return [{ result: {
      sourceBinding: {
        id: SOURCE_BINDING_ID,
        tenantId: '55555555-5555-4555-8555-555555555555',
        sourceSystem: 'GRH', sourceDatabase: 'grh_junin', sourceCompanyId: 101, verified: true,
      },
      canonicalEvidence: {
        sourceBatchId: SOURCE_BATCH_ID, sourceCutoff: '2026-08-19T15:00:00.000Z',
        validationState: 'published', contractCount: 2450,
      },
      policyVersion: 2,
    } }];
    throw new Error('consulta no esperada');
  });
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'IDENTITY_GATEWAY_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(res.payload), /55555555|grh_junin|2450/);
});

test('bind_source rechaza SHA cliente y exige headers de concurrencia antes de mutar', async (t) => {
  await t.test('releaseSha cliente', async () => {
    let queried = false;
    const handler = handlerWithQuery(async () => { queried = true; return []; });
    const res = response();
    await handler(request({ ...PAYLOAD, releaseSha: CLIENT_RELEASE_SHA }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.code, 'IDENTITY_FIELD_UNSUPPORTED');
    assert.equal(queried, false);
  });

  for (const [label, options, code] of [
    ['Idempotency-Key', { idempotencyKey: null }, 'IDENTITY_IDEMPOTENCY_REQUIRED'],
    ['expectedVersion', { expectedVersion: null }, 'IDENTITY_VERSION_REQUIRED'],
  ]) {
    await t.test(label, async () => {
      let mutated = false;
      const handler = handlerWithQuery(async (sql) => {
        if (sql.includes('tenant_identity_resolve_access')) return [{ result: platformPrincipal() }];
        if (sql.includes('tenant_identity_apply_platform_command_v2')) mutated = true;
        return [];
      });
      const res = response();
      await handler(request(PAYLOAD, options), res);
      assert.equal(res.statusCode, 428);
      assert.equal(res.payload.code, code);
      assert.equal(mutated, false);
    });
  }
});

test('bind_source exige origen, sesion v2, contexto plataforma, MFA y capability', async (t) => {
  await t.test('origen same-origin', async () => {
    let opened = false;
    const handler = handlerWithQuery(async () => [], {
      getTenantIdentitySql: async () => { opened = true; return { query: async () => [] }; },
    });
    const res = response();
    await handler(request(PAYLOAD, { origin: 'https://evil.example' }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.code, 'IDENTITY_ORIGIN_FORBIDDEN');
    assert.equal(opened, false);
  });

  await t.test('sesion v2', async () => {
    let queried = false;
    const handler = handlerWithQuery(async () => { queried = true; return []; });
    const res = response();
    await handler(request(PAYLOAD, { cookie: false }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.payload.code, 'IDENTITY_SESSION_REQUIRED');
    assert.equal(queried, false);
  });

  for (const [label, principal] of [
    ['contexto tenant', platformPrincipal({ tenant: { id: TENANT_ID } })],
    ['sin capability', platformPrincipal({
      authorized: false,
      platform: { roles: ['PLATFORM_OWNER'], capabilities: [] },
    })],
    ['sin MFA', platformPrincipal({
      authorized: false,
      session: { id: SESSION_ID, version: 1, authLevel: 'password', mfa: false },
    })],
  ]) {
    await t.test(label, async () => {
      let mutated = false;
      const handler = handlerWithQuery(async (sql) => {
        if (sql.includes('tenant_identity_resolve_access')) return [{ result: principal }];
        if (sql.includes('tenant_identity_apply_platform_command_v2')) mutated = true;
        return [];
      });
      const res = response();
      await handler(request(), res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.payload.code, 'IDENTITY_FORBIDDEN');
      assert.equal(mutated, false);
    });
  }
});

test('certify_data_plane exige capability y MFA, y proyecta una respuesta publica minima', async (t) => {
  const calls = [];
  const handler = handlerWithQuery(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('tenant_identity_resolve_access')) {
      assert.deepEqual(params, [ACTOR_EMAIL, SESSION_ID, 1, 2, ['platform.tenants.manage'], 'all']);
      return [{ result: platformPrincipal() }];
    }
    if (sql.includes('tenant_identity_apply_platform_command_v2')) {
      assert.equal(params[4], 'certify_data_plane');
      return [{ result: {
        policy: {
          tenantId: TENANT_ID,
          dataPlaneReady: true,
          deliveryReady: false,
          version: 3,
          sourceBindingId: SOURCE_BINDING_ID,
          releaseSha: RELEASE_SHA,
          certifiedBy: ACTOR_EMAIL,
        },
        replayed: false,
        privateReasonHash: 'f'.repeat(64),
      } }];
    }
    throw new Error('consulta no esperada');
  });
  const res = response();
  await handler(certificationRequest(), res);

  assert.equal(calls.length, 2);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, {
    ok: true,
    policy: {
      tenantId: TENANT_ID,
      dataPlaneReady: true,
      deliveryReady: false,
      version: 3,
      sourceBindingId: SOURCE_BINDING_ID,
    },
    replayed: false,
  });
  assert.doesNotMatch(JSON.stringify(res.payload), /releaseSha|certifiedBy|privateReasonHash|marcelo@example/i);

  await t.test('MFA ausente no alcanza la fachada de mutacion', async () => {
    let mutated = false;
    const denied = handlerWithQuery(async (sql) => {
      if (sql.includes('tenant_identity_resolve_access')) return [{ result: platformPrincipal({
        authorized: false,
        session: { id: SESSION_ID, version: 1, authLevel: 'password', mfa: false },
      }) }];
      if (sql.includes('tenant_identity_apply_platform_command_v2')) mutated = true;
      return [];
    });
    const deniedResponse = response();
    await denied(certificationRequest(), deniedResponse);
    assert.equal(deniedResponse.statusCode, 403);
    assert.equal(deniedResponse.payload.code, 'IDENTITY_FORBIDDEN');
    assert.equal(mutated, false);
  });

  await t.test('delivery activo en la respuesta DB falla cerrado', async () => {
    const drifted = handlerWithQuery(async (sql) => {
      if (sql.includes('tenant_identity_resolve_access')) return [{ result: platformPrincipal() }];
      if (sql.includes('tenant_identity_apply_platform_command_v2')) return [{ result: {
        policy: {
          tenantId: TENANT_ID, dataPlaneReady: true, deliveryReady: true,
          version: 3, sourceBindingId: SOURCE_BINDING_ID,
        },
      } }];
      throw new Error('consulta no esperada');
    });
    const driftedResponse = response();
    await drifted(certificationRequest(), driftedResponse);
    assert.equal(driftedResponse.statusCode, 503);
    assert.equal(driftedResponse.payload.code, 'IDENTITY_GATEWAY_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(driftedResponse.payload), /deliveryReady/);
  });
});

test('errores SOURCE_BINDING tienen contratos HTTP explicitos y seguros', () => {
  const contracts = [
    ['SOURCE_BINDING_COMMAND_INVALID', 422, 'IDENTITY_PAYLOAD_INVALID'],
    ['SOURCE_BINDING_IDEMPOTENCY_KEY_REUSED', 409, 'IDENTITY_IDEMPOTENCY_REUSED'],
    ['SOURCE_BINDING_VERSION_CONFLICT', 409, 'IDENTITY_VERSION_CONFLICT'],
    ['SOURCE_BINDING_DATA_PLANE_ALREADY_CERTIFIED', 409, 'IDENTITY_DATA_PLANE_ALREADY_CERTIFIED'],
    ['SOURCE_BINDING_TENANT_NOT_ELIGIBLE', 409, 'IDENTITY_TENANT_NOT_ELIGIBLE'],
    ['SOURCE_BINDING_ALREADY_EXISTS', 409, 'IDENTITY_SOURCE_BINDING_EXISTS'],
    ['SOURCE_BINDING_COORDINATE_IN_USE', 409, 'IDENTITY_SOURCE_COORDINATE_IN_USE'],
    ['SOURCE_BINDING_CANONICAL_EVIDENCE_AMBIGUOUS', 503, 'IDENTITY_SOURCE_EVIDENCE_UNAVAILABLE'],
    ['SOURCE_BINDING_CANONICAL_EVIDENCE_REQUIRED', 409, 'IDENTITY_SOURCE_EVIDENCE_REQUIRED'],
  ];
  for (const [databaseCode, status, publicCode] of contracts) {
    const mapped = identityGatewayDatabaseError(new Error(`${databaseCode}: private database detail`));
    assert.ok(mapped instanceof IdentityGatewayError);
    assert.equal(mapped.status, status);
    assert.equal(mapped.code, publicCode);
    assert.doesNotMatch(mapped.message, /private database detail|SOURCE_BINDING/);
  }
});

test('errores SOURCE_ONBOARDING tienen contratos HTTP estables y no filtran detalle SQL', () => {
  const contracts = [
    ['SOURCE_ONBOARDING_TENANT_NOT_ELIGIBLE', 404, 'IDENTITY_SOURCE_ONBOARDING_NOT_FOUND'],
    ['SOURCE_ONBOARDING_VIEW_INVALID', 503, 'IDENTITY_SOURCE_ONBOARDING_UNAVAILABLE'],
    ['SOURCE_ONBOARDING_POLICY_DRIFT', 503, 'IDENTITY_SOURCE_RELEASE_RECERTIFICATION_REQUIRED'],
    ['SOURCE_ONBOARDING_BINDING_DRIFT', 503, 'IDENTITY_SOURCE_ONBOARDING_UNAVAILABLE'],
    ['SOURCE_ONBOARDING_CANONICAL_EVIDENCE_REQUIRED', 503, 'IDENTITY_SOURCE_ONBOARDING_UNAVAILABLE'],
    ['SOURCE_ONBOARDING_CANONICAL_EVIDENCE_AMBIGUOUS', 503, 'IDENTITY_SOURCE_ONBOARDING_UNAVAILABLE'],
  ];
  for (const [databaseCode, status, publicCode] of contracts) {
    const mapped = identityGatewayDatabaseError(new Error(`${databaseCode}: private database detail`));
    assert.ok(mapped instanceof IdentityGatewayError);
    assert.equal(mapped.status, status);
    assert.equal(mapped.code, publicCode);
    assert.doesNotMatch(mapped.message, /private database detail|SOURCE_ONBOARDING/);
  }
});

test('GET source_onboarding usa capability MFA, SHA server-side y fachada de lectura exacta', async () => {
  const calls = [];
  const handler = handlerWithQuery(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('tenant_identity_resolve_access')) {
      assert.deepEqual(params, [ACTOR_EMAIL, SESSION_ID, 1, 2, ['platform.tenants.manage'], 'all']);
      return [{ result: platformPrincipal() }];
    }
    if (sql.includes('tenant_identity_source_onboarding_view_v1')) {
      assert.deepEqual(params, [ACTOR_EMAIL, SESSION_ID, 1, RELEASE_SHA, TENANT_ID]);
      return [{ result: {
        identityPolicy: {
          version: 2, dataPlaneReady: false,
          releaseSha: RELEASE_SHA, reasonHash: 'd'.repeat(64),
        },
        allowedCommands: ['certify_data_plane'],
        sourceBinding: {
          id: SOURCE_BINDING_ID, tenantId: TENANT_ID, sourceSystem: 'GRH', verified: true,
          sourceDatabase: 'grh_junin', sourceCompanyId: 101, actorEmail: ACTOR_EMAIL,
        },
        canonicalEvidence: {
          sourceCutoff: '2026-08-19T15:00:00.000Z', validationState: 'published', contractCount: 2450,
          sourceBatchId: SOURCE_BATCH_ID, employeeEmail: 'persona@example.test',
        },
        actorSessionVersion: 1,
      } }];
    }
    throw new Error('consulta no esperada');
  });
  const res = response();

  await handler(getRequest({ resource: 'source_onboarding', tenantId: TENANT_ID }), res);

  assert.equal(calls.length, 2);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, {
    ok: true,
    identityPolicy: { version: 2, dataPlaneReady: false },
    allowedCommands: ['certify_data_plane'],
    sourceBinding: {
      id: SOURCE_BINDING_ID, tenantId: TENANT_ID, sourceSystem: 'GRH', verified: true,
    },
    canonicalEvidence: {
      sourceCutoff: '2026-08-19T15:00:00.000Z', validationState: 'published', contractCount: 2450,
    },
  });
  assert.match(res.headers['Cache-Control'], /private, no-store/);
  assert.equal(res.headers['Vary'], 'Cookie, Origin');
  assert.doesNotMatch(JSON.stringify(res.payload), /sourceDatabase|sourceCompanyId|sourceBatchId|actor|reason|release|persona@example/i);
});

test('GET source_onboarding publica solamente las tres transiciones coherentes', async (t) => {
  const states = [
    ['sin binding', {
      identityPolicy: { version: 1, dataPlaneReady: false }, allowedCommands: ['bind_source'],
    }, ['bind_source'], false],
    ['binding pendiente de certificacion', {
      identityPolicy: { version: 2, dataPlaneReady: false }, allowedCommands: ['certify_data_plane'],
      sourceBinding: { id: SOURCE_BINDING_ID, sourceSystem: 'GRH', verified: true },
      canonicalEvidence: { sourceCutoff: '2026-08-19T15:00:00Z', validationState: 'published', contractCount: 2450 },
    }, ['certify_data_plane'], true],
    ['plano certificado', {
      identityPolicy: { version: 3, dataPlaneReady: true }, allowedCommands: [],
      sourceBinding: { id: SOURCE_BINDING_ID, sourceSystem: 'GRH', verified: true },
      canonicalEvidence: { sourceCutoff: '2026-08-19T15:00:00Z', validationState: 'published', contractCount: 2450 },
    }, [], true],
  ];
  for (const [label, view, commands, hasBinding] of states) {
    await t.test(label, async () => {
      const handler = handlerWithQuery(async (sql) => {
        if (sql.includes('tenant_identity_resolve_access')) return [{ result: platformPrincipal() }];
        if (sql.includes('tenant_identity_source_onboarding_view_v1')) return [{ result: view }];
        throw new Error('consulta no esperada');
      });
      const res = response();
      await handler(getRequest({ resource: 'source_onboarding', tenantId: TENANT_ID }), res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.payload.allowedCommands, commands);
      assert.equal(Object.hasOwn(res.payload, 'sourceBinding'), hasBinding);
    });
  }
});

test('GET source_onboarding exige tenantId unico, exacto y sin query extra', async (t) => {
  const cases = [
    ['faltante', { resource: 'source_onboarding' }],
    ['repetido', { resource: 'source_onboarding', tenantId: [TENANT_ID, TENANT_ID] }],
    ['con espacios', { resource: 'source_onboarding', tenantId: ` ${TENANT_ID}` }],
    ['no UUID', { resource: 'source_onboarding', tenantId: 'junin' }],
    ['campo extra', { resource: 'source_onboarding', tenantId: TENANT_ID, include: 'personas' }],
    ['recurso no canonico', { resource: 'SOURCE_ONBOARDING', tenantId: TENANT_ID }],
    ['recurso ambiguo', { resource: ['source_onboarding', 'bootstrap'], tenantId: TENANT_ID }],
    ['recurso desconocido', { resource: 'source_onboarding_private', tenantId: TENANT_ID }],
  ];
  for (const [label, query] of cases) {
    await t.test(label, async () => {
      let queried = false;
      const handler = handlerWithQuery(async () => { queried = true; return []; });
      const res = response();
      await handler(getRequest(query), res);
      assert.equal(res.statusCode, 400);
      assert.ok(['IDENTITY_QUERY_INVALID', 'IDENTITY_RESOURCE_INVALID'].includes(res.payload.code));
      assert.equal(queried, false);
    });
  }
});

test('GET source_onboarding rechaza sesion ausente, contexto tenant, MFA o capability faltante', async (t) => {
  await t.test('sesion v2 ausente', async () => {
    let queried = false;
    const handler = handlerWithQuery(async () => { queried = true; return []; });
    const res = response();
    await handler(getRequest({ resource: 'source_onboarding', tenantId: TENANT_ID }, { cookie: false }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.payload.code, 'IDENTITY_SESSION_REQUIRED');
    assert.equal(queried, false);
  });

  for (const [label, principal] of [
    ['contexto tenant', platformPrincipal({ tenant: { id: TENANT_ID } })],
    ['sin capability', platformPrincipal({
      authorized: false,
      platform: { roles: ['PLATFORM_OWNER'], capabilities: [] },
    })],
    ['sin MFA', platformPrincipal({
      authorized: false,
      session: { id: SESSION_ID, version: 1, authLevel: 'password', mfa: false },
    })],
  ]) {
    await t.test(label, async () => {
      let viewed = false;
      const handler = handlerWithQuery(async (sql) => {
        if (sql.includes('tenant_identity_resolve_access')) return [{ result: principal }];
        if (sql.includes('tenant_identity_source_onboarding_view_v1')) viewed = true;
        return [];
      });
      const res = response();
      await handler(getRequest({ resource: 'source_onboarding', tenantId: TENANT_ID }), res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.payload.code, 'IDENTITY_FORBIDDEN');
      assert.equal(viewed, false);
    });
  }
});

test('GET source_onboarding rechaza mismatch tenant y respuesta DB parcial', async (t) => {
  const OTHER_TENANT_ID = '55555555-5555-4555-8555-555555555555';
  for (const [label, view] of [
    ['tenant distinto', {
      identityPolicy: { version: 2, dataPlaneReady: false }, allowedCommands: ['certify_data_plane'],
      sourceBinding: { id: SOURCE_BINDING_ID, tenantId: OTHER_TENANT_ID, sourceSystem: 'GRH', verified: true },
      canonicalEvidence: { sourceCutoff: '2026-08-19T15:00:00Z', validationState: 'published', contractCount: 2450 },
    }],
    ['binding sin evidencia', {
      identityPolicy: { version: 2, dataPlaneReady: false }, allowedCommands: ['certify_data_plane'],
      sourceBinding: { id: SOURCE_BINDING_ID, sourceSystem: 'GRH', verified: true },
    }],
    ['comando incoherente', {
      identityPolicy: { version: 2, dataPlaneReady: false }, allowedCommands: ['bind_source'],
      sourceBinding: { id: SOURCE_BINDING_ID, sourceSystem: 'GRH', verified: true },
      canonicalEvidence: { sourceCutoff: '2026-08-19T15:00:00Z', validationState: 'published', contractCount: 2450 },
    }],
    ['comando desconocido', {
      identityPolicy: { version: 2, dataPlaneReady: false }, allowedCommands: ['unknown_command'],
    }],
    ['ready sin binding', {
      identityPolicy: { version: 2, dataPlaneReady: true }, allowedCommands: [],
    }],
  ]) {
    await t.test(label, async () => {
      const handler = handlerWithQuery(async (sql) => {
        if (sql.includes('tenant_identity_resolve_access')) return [{ result: platformPrincipal() }];
        if (sql.includes('tenant_identity_source_onboarding_view_v1')) return [{ result: view }];
        throw new Error('consulta no esperada');
      });
      const res = response();
      await handler(getRequest({ resource: 'source_onboarding', tenantId: TENANT_ID }), res);
      assert.equal(res.statusCode, 503);
      assert.deepEqual(res.payload, {
        ok: false, code: 'IDENTITY_GATEWAY_UNAVAILABLE', error: 'Gateway de identidad no disponible',
      });
      assert.doesNotMatch(JSON.stringify(res.payload), new RegExp(OTHER_TENANT_ID));
    });
  }
});
