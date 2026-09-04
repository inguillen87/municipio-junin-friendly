import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttendanceIngestHandler } from '../api/attendance-ingest.js';
import { createInternalAttendanceHandler } from '../api/internal-attendance.js';
import { AttendanceGatewayError } from '../lib/internal-attendance-gateway.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const IDEMPOTENCY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RELEASE_SHA = 'a'.repeat(40);

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function access() {
  return {
    mode: 'managed',
    session: { id: SESSION_ID, email: 'actor@junin.gob.ar', version: 3 },
    principal: {
      user: { email: 'actor@junin.gob.ar' },
      tenant: {
        id: TENANT_ID,
        slug: 'junin-mendoza',
        membershipId: MEMBERSHIP_ID,
        source: 'membership',
        certifiedReleaseSha: RELEASE_SHA,
      },
    },
  };
}

function internalDependencies(overrides = {}) {
  const defaults = {
    env: { NODE_ENV: 'test', INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA, ATTENDANCE_IDENTITY_PEPPER: 'x'.repeat(40) },
    requireCompatibleInternalAccess: async () => access(),
    getInternalSql: async () => ({ fake: true }),
    getAttendanceBootstrap: async () => ({
      principal: { private: 'never' },
      contract: { version: 'attendance-device-gateway.v1' },
      capabilities: ['attendance.read'],
      summary: { siteCount: 13 },
      features: { hardwareConnected: false },
    }),
    listAttendanceResources: async (_sql, _principal, options) => ({
      resource: options.resource,
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0, pages: 0 },
    }),
    applyAttendanceCommand: async () => ({ data: { id: IDEMPOTENCY_ID }, replayed: false }),
  };
  return { ...defaults, ...overrides, env: { ...defaults.env, ...(overrides.env || {}) } };
}

test('API interna exige attendance.read y no publica el principal SQL', async () => {
  const calls = [];
  const res = response();
  const handler = createInternalAttendanceHandler(internalDependencies({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      calls.push(options);
      return access();
    },
  }));
  await handler({ method: 'GET', query: { resource: 'bootstrap' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(Object.hasOwn(res.payload, 'principal'), false);
  assert.equal(JSON.stringify(res.payload).includes('never'), false);
  assert.deepEqual(calls[0].requiredCapabilities, ['attendance.read']);
  assert.equal(calls[0].requireDataPlaneReady, true);
  assert.equal(calls[0].requireCertifiedDataBinding, true);
  assert.equal(calls[0].allowLegacy, false);
});

test('listado sólo admite recurso y paginación exactos', async () => {
  const handler = createInternalAttendanceHandler(internalDependencies());
  const ok = response();
  await handler({ method: 'GET', query: { resource: 'site', page: '1', pageSize: '25' }, headers: {} }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.payload.resource, 'site');

  const extra = response();
  await handler({ method: 'GET', query: { resource: 'site', tenantId: TENANT_ID }, headers: {} }, extra);
  assert.equal(extra.statusCode, 400);
  assert.equal(extra.payload.code, 'ATTENDANCE_QUERY_INVALID');

  const duplicate = response();
  await handler({ method: 'GET', query: { resource: ['site', 'device'] }, headers: {} }, duplicate);
  assert.equal(duplicate.statusCode, 400);
  assert.equal(duplicate.payload.code, 'ATTENDANCE_QUERY_AMBIGUOUS');
});

test('auditoría exige capacidad dedicada y conserva el recurso hasta la fachada SQL', async () => {
  const accessCalls = [];
  const listCalls = [];
  const handler = createInternalAttendanceHandler(internalDependencies({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      accessCalls.push(options);
      return access();
    },
    listAttendanceResources: async (...args) => {
      listCalls.push(args);
      return {
        resource: 'audit', data: [],
        pagination: { page: 1, pageSize: 25, total: 0, pages: 0 },
      };
    },
  }));
  const res = response();
  await handler({
    method: 'GET', query: { resource: 'audit', page: '1', pageSize: '25' }, headers: {},
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.resource, 'audit');
  assert.deepEqual(accessCalls[0].requiredCapabilities, ['attendance.audit.read']);
  assert.equal(listCalls[0][2].resource, 'audit');
});

test('inventario reportado exige el gate completo y expone sólo el contrato geográfico mínimo', async () => {
  const accessCalls = [];
  let sqlCalls = 0;
  const handler = createInternalAttendanceHandler(internalDependencies({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      accessCalls.push(options);
      return access();
    },
    getInternalSql: async () => {
      sqlCalls += 1;
      return { fake: true };
    },
  }));
  const res = response();
  await handler({
    method: 'GET', query: { resource: 'reported-inventory' }, headers: {},
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.resource, 'reported-inventory');
  assert.equal(res.payload.contract.version, 'attendance-reported-inventory.v1');
  assert.equal(res.payload.tenantSlug, 'junin-mendoza');
  assert.deepEqual(res.payload.source, {
    kind: 'municipal_workbook',
    status: 'reported_inventory',
    recordCount: 13,
    mappingVersion: 'junin-attendance-workbook-a4-k17.v1',
  });
  assert.equal(res.payload.physicalConnectionConfirmed, false);
  assert.equal(res.payload.heatMetric, 'reported_site_density');
  assert.equal(res.payload.data.length, 13);
  assert.deepEqual(res.payload.data.map((site) => site.code),
    Array.from({ length: 13 }, (_, index) => `PM-${String(index + 1).padStart(2, '0')}`));
  for (const site of res.payload.data) {
    assert.deepEqual(Object.keys(site), [
      'code', 'name', 'address', 'latitude', 'longitude', 'model', 'channel',
    ]);
    assert.equal(typeof site.latitude, 'number');
    assert.equal(typeof site.longitude, 'number');
    assert.ok(['network_pull', 'removable_media'].includes(site.channel));
  }
  assert.deepEqual(accessCalls[0].requiredCapabilities, ['attendance.read']);
  assert.equal(accessCalls[0].requireDataPlaneReady, true);
  assert.equal(accessCalls[0].requireCertifiedDataBinding, true);
  assert.equal(accessCalls[0].allowLegacy, false);
  assert.equal(sqlCalls, 0);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.Vary, 'Cookie');

  const serialized = JSON.stringify(res.payload);
  assert.doesNotMatch(serialized, /fileName|sha256|sheet|range|unresolvedRequiredFields/);
  assert.doesNotMatch(serialized, /email|document|dni|cuil|principal/i);
});

test('inventario reportado no cruza tenants ni admite parámetros de listado', async () => {
  let sqlCalls = 0;
  const foreignAccess = access();
  foreignAccess.principal.tenant.slug = 'otro-municipio';
  const handler = createInternalAttendanceHandler(internalDependencies({
    requireCompatibleInternalAccess: async () => foreignAccess,
    getInternalSql: async () => {
      sqlCalls += 1;
      return { fake: true };
    },
  }));

  const foreign = response();
  await handler({
    method: 'GET', query: { resource: 'reported-inventory' }, headers: {},
  }, foreign);
  assert.equal(foreign.statusCode, 404);
  assert.equal(foreign.payload.code, 'ATTENDANCE_REPORTED_INVENTORY_NOT_AVAILABLE');

  const extra = response();
  await handler({
    method: 'GET', query: { resource: 'reported-inventory', page: '1' }, headers: {},
  }, extra);
  assert.equal(extra.statusCode, 400);
  assert.equal(extra.payload.code, 'ATTENDANCE_QUERY_INVALID');
  assert.equal(sqlCalls, 0);
});

test('inventario reportado rechaza identidades sin membresía antes de leer la fuente', async () => {
  const withoutMembership = access();
  delete withoutMembership.principal.tenant.membershipId;
  let inventoryCalls = 0;
  const handler = createInternalAttendanceHandler(internalDependencies({
    requireCompatibleInternalAccess: async () => withoutMembership,
    getReportedAttendanceInventory: () => {
      inventoryCalls += 1;
      return {};
    },
  }));
  const res = response();
  await handler({
    method: 'GET', query: { resource: 'reported-inventory' }, headers: {},
  }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'ATTENDANCE_TENANT_MEMBERSHIP_REQUIRED');
  assert.equal(inventoryCalls, 0);
});

test('mutaciones requieren mismo origen, JSON e idempotencia', async () => {
  const handler = createInternalAttendanceHandler(internalDependencies({
    env: { VERCEL_ENV: 'production', IDENTITY_APP_ORIGIN: 'https://municipio.example' },
  }));
  const noOrigin = response();
  await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {} }, noOrigin);
  assert.equal(noOrigin.statusCode, 403);
  assert.equal(noOrigin.payload.code, 'ATTENDANCE_ORIGIN_REQUIRED');

  const noKey = response();
  await handler({
    method: 'POST',
    query: {},
    headers: { origin: 'https://municipio.example', 'content-type': 'application/json' },
    body: { command: 'site.create', payload: {} },
  }, noKey);
  assert.equal(noKey.statusCode, 428);
  assert.equal(noKey.payload.code, 'ATTENDANCE_IDEMPOTENCY_KEY_REQUIRED');

  const wrongType = response();
  await handler({
    method: 'POST',
    headers: { origin: 'https://municipio.example', 'content-type': 'text/plain' },
    body: {},
  }, wrongType);
  assert.equal(wrongType.statusCode, 415);
});

test('mutación reenvía pepper sólo al normalizador server-side y marca replay', async () => {
  const calls = [];
  const res = response();
  const handler = createInternalAttendanceHandler(internalDependencies({
    applyAttendanceCommand: async (...args) => {
      calls.push(args);
      return { data: { id: IDEMPOTENCY_ID }, replayed: true };
    },
  }));
  await handler({
    method: 'POST', query: {},
    headers: { 'content-type': 'application/json', 'idempotency-key': IDEMPOTENCY_ID },
    body: { command: 'site.create', payload: {} },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.replayed, true);
  assert.equal(res.headers['Idempotency-Replayed'], 'true');
  assert.equal(calls[0][4], IDEMPOTENCY_ID);
  assert.equal(calls[0][5].identityPepper, 'x'.repeat(40));
});

function ingestDependencies(overrides = {}) {
  const defaults = {
    env: { INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA, ATTENDANCE_IDENTITY_PEPPER: 'y'.repeat(40) },
    registry: { fake: true },
    getInternalSql: async () => ({ fake: true }),
    normalizeAttendanceIngestRequest: (value) => ({
      connectorKey: value.connectorKey,
      batchKey: value.batchKey,
      payloadSha256: 'b'.repeat(64),
      envelope: { events: [] },
    }),
    ingestAttendanceBatch: async () => ({
      batchId: IDEMPOTENCY_ID,
      status: 'accepted',
      acceptedCount: 1,
      duplicateCount: 0,
      unmappedCount: 1,
      ambiguousCount: 0,
      replayed: false,
    }),
  };
  return { ...defaults, ...overrides, env: { ...defaults.env, ...(overrides.env || {}) } };
}

test('endpoint de gateway exige bearer y no usa cookie humana', async () => {
  const handler = createAttendanceIngestHandler(ingestDependencies());
  const res = response();
  await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.code, 'ATTENDANCE_CONNECTOR_AUTH_INVALID');
  assert.match(res.headers['WWW-Authenticate'], /attendance-connector/);
  assert.equal(res.headers.Vary, 'Authorization');
});

test('endpoint de gateway entrega recibo mínimo y sólo hash del bearer a la DB', async () => {
  const calls = [];
  const handler = createAttendanceIngestHandler(ingestDependencies({
    ingestAttendanceBatch: async (...args) => {
      calls.push(args);
      return {
        batchId: IDEMPOTENCY_ID, status: 'accepted', acceptedCount: 1,
        duplicateCount: 0, unmappedCount: 1, ambiguousCount: 0, replayed: false,
      };
    },
  }));
  const token = 'connector-token-that-is-long-enough-2026';
  const res = response();
  await handler({
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: { connectorKey: 'gateway-1', batchKey: 'batch-1' },
  }, res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.acceptedCount, 1);
  assert.equal(JSON.stringify(res.payload).includes(token), false);
  assert.match(calls[0][2], /^[a-f0-9]{64}$/);
  assert.notEqual(calls[0][2], token);
  assert.equal(calls[0][3], RELEASE_SHA);
});

test('gateway usa el contrato certificado explícito y tolera otro SHA de deployment', async () => {
  const calls = [];
  const handler = createAttendanceIngestHandler(ingestDependencies({
    env: {
      INTERNAL_CERTIFIED_RELEASE_SHA: RELEASE_SHA,
      VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40),
    },
    ingestAttendanceBatch: async (...args) => {
      calls.push(args);
      return {
        batchId: IDEMPOTENCY_ID, status: 'accepted', acceptedCount: 1,
        duplicateCount: 0, unmappedCount: 1, ambiguousCount: 0, replayed: false,
      };
    },
  }));
  const res = response();
  await handler({
    method: 'POST',
    headers: { authorization: `Bearer ${'m'.repeat(40)}`, 'content-type': 'application/json' },
    body: { connectorKey: 'gateway-manual', batchKey: 'batch-manual' },
  }, res);
  assert.equal(res.statusCode, 202);
  assert.equal(calls[0][3], RELEASE_SHA);
});

test('gateway falla cerrado antes de abrir SQL si el contrato no está certificado', async () => {
  const cases = [
    {},
    { INTERNAL_CERTIFIED_RELEASE_SHA: 'invalido', VERCEL_GIT_COMMIT_SHA: RELEASE_SHA },
    {
      INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA,
      INTERNAL_CERTIFIED_RELEASE_SHA: 'b'.repeat(40),
    },
  ];
  for (const env of cases) {
    let sqlCalls = 0;
    let ingestCalls = 0;
    const dependencies = ingestDependencies({
      getInternalSql: async () => { sqlCalls += 1; return { fake: true }; },
      ingestAttendanceBatch: async () => { ingestCalls += 1; return {}; },
    });
    dependencies.env = { ...env, ATTENDANCE_IDENTITY_PEPPER: 'y'.repeat(40) };
    const handler = createAttendanceIngestHandler(dependencies);
    const res = response();
    await handler({
      method: 'POST',
      headers: { authorization: `Bearer ${'r'.repeat(40)}`, 'content-type': 'application/json' },
      body: { connectorKey: 'gateway-release', batchKey: 'batch-release' },
    }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.payload.code, 'ATTENDANCE_RELEASE_NOT_CERTIFIED');
    assert.equal(sqlCalls, 0);
    assert.equal(ingestCalls, 0);
    assert.equal(JSON.stringify(res.payload).includes('INTERNAL_CERTIFIED_RELEASE_SHA'), false);
  }
});

test('endpoint de gateway no filtra errores internos del driver', async () => {
  const handler = createAttendanceIngestHandler(ingestDependencies({
    normalizeAttendanceIngestRequest: () => {
      throw new AttendanceGatewayError('ATTENDANCE_INGEST_VERSION_INVALID', 400, 'Versión no soportada');
    },
  }));
  const res = response();
  await handler({
    method: 'POST',
    headers: { authorization: `Bearer ${'z'.repeat(40)}`, 'content-type': 'application/json' },
    body: {},
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, 'ATTENDANCE_INGEST_VERSION_INVALID');
  assert.equal(JSON.stringify(res.payload).includes('z'.repeat(40)), false);
});
