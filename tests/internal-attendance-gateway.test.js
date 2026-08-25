import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ATTENDANCE_GATEWAY_CONTRACT_VERSION,
  ATTENDANCE_INGEST_CONTRACT_VERSION,
  AttendanceGatewayError,
  applyAttendanceCommand,
  attendanceBearerTokenSha256,
  attendanceIdentityHmac,
  createDefaultAttendanceDriverRegistry,
  getAttendanceBootstrap,
  ingestAttendanceBatch,
  listAttendanceResources,
  normalizeAttendanceCommand,
  normalizeAttendanceIngestRequest,
} from '../lib/internal-attendance-gateway.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const IDEMPOTENCY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RELEASE_SHA = 'a'.repeat(40);
const PEPPER = 'attendance-identity-pepper-for-tests-only-2026';

function identity() {
  return {
    user: { email: 'actor@junin.gob.ar' },
    tenant: { id: TENANT_ID, membershipId: MEMBERSHIP_ID, source: 'membership' },
  };
}

function session() {
  return { id: SESSION_ID, email: 'actor@junin.gob.ar', version: 3, releaseSha: RELEASE_SHA };
}

function fakeSql(result) {
  const calls = [];
  return {
    calls,
    async query(statement, values) {
      calls.push({ statement, values });
      return { rows: [{ result }] };
    },
  };
}

function simulatorBody(overrides = {}) {
  return {
    contractVersion: ATTENDANCE_INGEST_CONTRACT_VERSION,
    tenantId: TENANT_ID,
    connectorKey: 'simulator-junin-01',
    driverKey: 'simulator',
    transport: 'pull',
    deviceExternalKey: 'SIM-DEVICE-01',
    siteExternalKey: 'PM-10',
    timezone: 'America/Argentina/Mendoza',
    utcOffsetMinutes: -180,
    batchKey: 'showcase-20260825-01',
    payload: { events: [{
      employeeId: '000000571',
      sourceEventId: 'showcase-event-001',
      occurredAtLocal: '2026-08-25T07:00:00',
      punchType: 'check_in',
      credentialType: 'biometric',
      verificationResult: 'accepted',
      sequence: '1',
    }] },
    ...overrides,
  };
}

function hasCode(code) {
  return (error) => error instanceof AttendanceGatewayError && error.code === code;
}

function ingestOptions(overrides = {}) {
  return {
    identityPepper: PEPPER,
    now: Date.parse('2026-08-25T12:00:00.000Z'),
    registry: createDefaultAttendanceDriverRegistry({ includeSimulatorForTests: true }),
    ...overrides,
  };
}

test('HMAC de identidad es determinista, tenant-bound y no es SHA-256 directo', () => {
  const first = attendanceIdentityHmac(TENANT_ID, '000000571', PEPPER);
  const replay = attendanceIdentityHmac(TENANT_ID, '000000571', PEPPER);
  const otherTenant = attendanceIdentityHmac(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '000000571', PEPPER,
  );
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, replay);
  assert.notEqual(first, otherTenant);
  assert.notEqual(first, attendanceBearerTokenSha256('000000571'.padEnd(32, 'x')));
});

test('registro operativo excluye simulador y sólo lo habilita con opt-in de tests', () => {
  const productionRegistry = createDefaultAttendanceDriverRegistry();
  assert.deepEqual(productionRegistry.list().map((driver) => driver.id), [
    'csv-generic', 'legacy-rel000-fixed-width',
  ]);
  assert.throws(
    () => productionRegistry.describe('simulator'),
    (error) => error.code === 'TIME_DEVICE_DRIVER_NOT_REGISTERED',
  );
  assert.deepEqual(
    createDefaultAttendanceDriverRegistry({ includeSimulatorForTests: true })
      .list().map((driver) => driver.id),
    ['csv-generic', 'legacy-rel000-fixed-width', 'simulator'],
  );
});

test('ingesta normaliza hora, método e identidad y elimina el identificador crudo', () => {
  const result = normalizeAttendanceIngestRequest(
    simulatorBody({ batchKey: `b${'x'.repeat(159)}` }), ingestOptions(),
  );
  assert.equal(result.connectorKey, 'simulator-junin-01');
  assert.equal(result.batchKey.length, 160);
  assert.equal(result.envelope.deviceExternalKey, 'sim-device-01');
  assert.equal(result.envelope.siteExternalKey, 'pm-10');
  assert.equal(result.envelope.events.length, 1);
  assert.equal(result.envelope.events[0].occurredAt, '2026-08-25T10:00:00.000Z');
  assert.equal(result.envelope.events[0].method, 'fingerprint');
  assert.equal(result.envelope.events[0].direction, 'in');
  assert.equal(result.envelope.events[0].verificationResult, 'accepted');
  assert.match(result.envelope.events[0].identityHmacSha256, /^[a-f0-9]{64}$/);
  assert.match(result.envelope.events[0].eventSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes('000000571'), false);
  assert.equal(JSON.stringify(result).includes('employeeId'), false);
});

test('ingesta conserva rechazo y desconocido para que SQL los ponga en revision', () => {
  for (const verificationResult of ['rejected', 'unknown']) {
    const event = simulatorBody().payload.events[0];
    const result = normalizeAttendanceIngestRequest(simulatorBody({
      payload: { events: [{ ...event, verificationResult }] },
    }), ingestOptions());
    assert.equal(result.envelope.events[0].verificationResult, verificationResult);
    assert.match(result.envelope.events[0].eventSha256, /^[a-f0-9]{64}$/);
  }
});

test('driver, offset, eventos vacíos y campos extra fallan cerrados', () => {
  assert.throws(() => normalizeAttendanceIngestRequest(
    simulatorBody({ driverKey: 'zkteco-assumed' }), ingestOptions(),
  ), (error) => error.code === 'TIME_DEVICE_DRIVER_NOT_REGISTERED');
  assert.throws(() => normalizeAttendanceIngestRequest(
    simulatorBody({ utcOffsetMinutes: -120 }), ingestOptions(),
  ), (error) => error.code === 'TIME_DEVICE_OFFSET_MISMATCH');
  assert.throws(() => normalizeAttendanceIngestRequest(
    simulatorBody({ payload: { events: [] } }), ingestOptions(),
  ), hasCode('ATTENDANCE_INGEST_EVENT_COUNT_INVALID'));
  assert.throws(() => normalizeAttendanceIngestRequest(
    { ...simulatorBody(), biometricTemplate: 'never' }, ingestOptions(),
  ), hasCode('ATTENDANCE_INGEST_INVALID'));
  const oldEvent = simulatorBody().payload.events[0];
  assert.throws(() => normalizeAttendanceIngestRequest(simulatorBody({
    payload: { events: [{ ...oldEvent, occurredAtLocal: '1999-12-31T20:00:00' }] },
  }), ingestOptions()),
  hasCode('ATTENDANCE_EVENT_INVALID'));
  assert.throws(() => normalizeAttendanceIngestRequest(simulatorBody({
    payload: { events: [{ ...oldEvent, occurredAtLocal: '2026-08-25T09:10:01' }] },
  }), ingestOptions()),
  hasCode('ATTENDANCE_EVENT_INVALID'));
});

test('identity.create transforma sourceUserKey antes de producir el comando SQL', () => {
  const normalized = normalizeAttendanceCommand({
    command: 'identity.create',
    payload: {
      deviceId: '11111111-1111-4111-8111-111111111111',
      sourceUserKey: '000000571',
      employmentContractId: '22222222-2222-4222-8222-222222222222',
      validFrom: '2026-08-25',
    },
  }, { tenantId: TENANT_ID, identityPepper: PEPPER });
  assert.equal(Object.hasOwn(normalized.payload, 'sourceUserKey'), false);
  assert.match(normalized.payload.identityHmacSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(normalized).includes('000000571'), false);
});

test('alta de punto conserva coordenadas sin inventar geocerca y equipo distingue transporte físico', () => {
  const site = normalizeAttendanceCommand({
    command: 'site.create',
    payload: {
      externalKey: 'PM-01', label: 'Desarrollo Social',
      timezone: 'America/Argentina/Mendoza', latitude: -33.1443994,
      longitude: -68.4861441, geofenceRadiusM: null,
      networkEnabled: true, removableMediaEnabled: false,
      addressText: 'Calle San Martín 123, Junín',
    },
  });
  assert.equal(site.payload.geofenceRadiusM, null);
  assert.equal(site.payload.latitude, -33.1443994);
  assert.equal(site.payload.externalKey, 'pm-01');
  assert.equal(site.payload.addressText, 'Calle San Martín 123, Junín');

  for (const transport of [
    'network_pull', 'network_push', 'removable_media', 'hybrid',
  ]) {
    const device = normalizeAttendanceCommand({
      command: 'device.create',
      payload: {
        siteId: '11111111-1111-4111-8111-111111111111',
        externalKey: 'PM-01-CLOCK', vendorKey: 'zkteco', model: 'K20',
        transport, driverKey: 'pending-homologation',
        timezone: 'America/Argentina/Mendoza',
        capabilities: { pull: false, push: false, biometric: false, card: false, pin: false },
      },
    });
    assert.equal(device.payload.transport, transport);
    assert.equal(device.payload.externalKey, 'pm-01-clock');
    assert.equal(device.payload.serialNumber, null);
  }
  for (const payload of [
    { transport: 'simulator', driverKey: 'pending-homologation' },
    { transport: 'network_pull', driverKey: 'simulator' },
  ]) {
    assert.throws(() => normalizeAttendanceCommand({
      command: 'device.create',
      payload: {
        siteId: '11111111-1111-4111-8111-111111111111',
        externalKey: 'PM-01-CLOCK', vendorKey: 'zkteco', model: 'K20',
        timezone: 'America/Argentina/Mendoza',
        capabilities: { pull: false, push: false, biometric: false, card: false, pin: false },
        ...payload,
      },
    }), hasCode('ATTENDANCE_SIMULATOR_FORBIDDEN'));
  }
  assert.throws(() => normalizeAttendanceCommand({
    command: 'device.update',
    payload: { id: IDEMPOTENCY_ID, expectedVersion: 1, driverKey: 'simulator' },
  }), hasCode('ATTENDANCE_SIMULATOR_FORBIDDEN'));
  assert.throws(() => normalizeAttendanceCommand({
    command: 'connector.create',
    payload: {
      deviceId: '11111111-1111-4111-8111-111111111111',
      externalKey: 'simulator-junin-01', driverKey: 'simulator', tokenSha256: 'b'.repeat(64),
    },
  }), hasCode('ATTENDANCE_SIMULATOR_FORBIDDEN'));
  assert.throws(() => normalizeAttendanceCommand({
    command: 'device.create',
    payload: {
      siteId: '11111111-1111-4111-8111-111111111111',
      externalKey: 'PM-01-CLOCK', vendorKey: 'zkteco', model: 'K20',
      transport: 'push', driverKey: 'pending-homologation',
      timezone: 'America/Argentina/Mendoza',
      capabilities: { pull: false, push: false, biometric: false, card: false, pin: false },
    },
  }), hasCode('ATTENDANCE_FIELD_INVALID'));
});

test('normalizadores replican restricciones SQL de claves, geocerca, transportes y estados', () => {
  const baseSite = {
    externalKey: 'PM-01', label: 'Sede', timezone: 'America/Argentina/Mendoza',
    latitude: null, longitude: null, geofenceRadiusM: null,
    networkEnabled: true, removableMediaEnabled: false,
  };
  const otherGovernment = normalizeAttendanceCommand({
    command: 'site.create', payload: { ...baseSite, timezone: 'America/Montevideo' },
  });
  assert.equal(otherGovernment.payload.timezone, 'America/Montevideo');
  assert.throws(() => normalizeAttendanceCommand({
    command: 'site.create', payload: { ...baseSite, externalKey: 'PM/01' },
  }), hasCode('ATTENDANCE_KEY_INVALID'));
  assert.throws(() => normalizeAttendanceCommand({
    command: 'site.create', payload: { ...baseSite, geofenceRadiusM: 50 },
  }), hasCode('ATTENDANCE_COORDINATES_INVALID'));
  assert.throws(() => normalizeAttendanceCommand({
    command: 'site.create',
    payload: { ...baseSite, networkEnabled: false, removableMediaEnabled: false },
  }), hasCode('ATTENDANCE_FIELD_INVALID'));
  assert.throws(() => normalizeAttendanceCommand({
    command: 'site.update',
    payload: { id: IDEMPOTENCY_ID, expectedVersion: 1, status: 'unknown' },
  }), hasCode('ATTENDANCE_FIELD_INVALID'));
  assert.throws(() => normalizeAttendanceCommand({
    command: 'punch.reject',
    payload: { id: IDEMPOTENCY_ID, expectedVersion: 1, reasonCode: 'no' },
  }), hasCode('ATTENDANCE_FIELD_INVALID'));
});

test('commissioning de reloj acepta sólo metadatos reales con rangos exactos', () => {
  const base = {
    siteId: '11111111-1111-4111-8111-111111111111',
    externalKey: 'PM-01-CLOCK', vendorKey: 'ZKTECO', model: 'K20',
    transport: 'network_pull', driverKey: 'pending-homologation',
    timezone: 'America/Argentina/Mendoza',
    capabilities: { pull: true, push: false, biometric: true, card: true, pin: true },
  };
  const normalized = normalizeAttendanceCommand({
    command: 'device.create',
    payload: {
      ...base, serialNumber: 'SN-001', firmwareVersion: '1.2.3',
      protocolKey: 'ZK-TCP', networkHost: '192.0.2.10', networkPort: 4370,
    },
  });
  assert.equal(normalized.payload.vendorKey, 'zkteco');
  assert.equal(normalized.payload.protocolKey, 'zk-tcp');
  assert.equal(normalized.payload.networkHost, '192.0.2.10');
  assert.equal(normalized.payload.networkPort, 4370);
  const hostWithExactMask = normalizeAttendanceCommand({
    command: 'device.update',
    payload: { id: IDEMPOTENCY_ID, expectedVersion: 1, networkHost: '192.0.2.10/32' },
  });
  assert.equal(hostWithExactMask.payload.networkHost, '192.0.2.10/32');
  assert.throws(() => normalizeAttendanceCommand({
    command: 'device.create', payload: { ...base, networkHost: 'clock.local' },
  }), hasCode('ATTENDANCE_FIELD_INVALID'));
  assert.throws(() => normalizeAttendanceCommand({
    command: 'device.update',
    payload: { id: IDEMPOTENCY_ID, expectedVersion: 1, networkHost: '192.0.2.0/24' },
  }), hasCode('ATTENDANCE_FIELD_INVALID'));
  assert.throws(() => normalizeAttendanceCommand({
    command: 'device.update',
    payload: { id: IDEMPOTENCY_ID, expectedVersion: 1, networkPort: 65536 },
  }), hasCode('ATTENDANCE_FIELD_INVALID'));
});

test('bootstrap conserva sólo resumen y flags honestos', async () => {
  const sql = fakeSql({
    principal: { tenantId: TENANT_ID, membershipId: MEMBERSHIP_ID, roleKey: 'CONSULTA_INTEGRAL' },
    capabilities: ['attendance.read'],
    timezones: ['America/Argentina/Mendoza'],
    summary: {
      siteCount: 13, deviceCount: 13, connectorCount: 0, activeConnectorCount: 0,
      rawEventCount: 0, punchCount: 0, unmatchedPunchCount: 0, pendingReviewCount: 0,
    },
    features: {
      hardwareConnected: false, hoursCalculated: true,
      payrollPosted: true, biometricTemplatesStored: true,
    },
  });
  const result = await getAttendanceBootstrap(sql, identity(), session());
  assert.equal(result.contract.version, ATTENDANCE_GATEWAY_CONTRACT_VERSION);
  assert.deepEqual(result.contract.timezones, ['America/Argentina/Mendoza']);
  assert.equal(result.summary.siteCount, 13);
  assert.equal(result.features.hardwareConnected, false);
  assert.equal(result.features.hoursCalculated, false);
  assert.equal(result.features.payrollPosted, false);
  assert.equal(result.features.biometricTemplatesStored, false);
  assert.equal(result.contract.resources.includes('audit'), true);
  assert.match(sql.calls[0].statement, /attendance_gateway_bootstrap_v1/);
});

test('listado pagina por recurso y rechaza proyecciones con secretos', async () => {
  const sql = fakeSql({ resource: 'site', page: 1, pageSize: 25, total: 1,
    items: [{ id: IDEMPOTENCY_ID, externalKey: 'PM-01', label: 'Sede' }] });
  const result = await listAttendanceResources(
    sql, identity(), { resource: 'site', page: '1', pageSize: '25' }, session(),
  );
  assert.equal(result.data[0].externalKey, 'PM-01');
  assert.equal(result.pagination.pages, 1);
  const leaking = fakeSql({ resource: 'connector', page: 1, pageSize: 25, total: 1,
    items: [{ id: IDEMPOTENCY_ID, tokenSha256: 'b'.repeat(64) }] });
  await assert.rejects(
    listAttendanceResources(
      leaking, identity(), { resource: 'connector', page: 1, pageSize: 25 }, session(),
    ),
    hasCode('ATTENDANCE_CONTRACT_DRIFT'),
  );
});

test('auditoría acepta sólo la proyección mínima y exacta acordada con la UI', async () => {
  const item = {
    id: IDEMPOTENCY_ID,
    targetKind: 'punch',
    targetId: '11111111-1111-4111-8111-111111111111',
    actorKind: 'membership',
    actorRole: 'HUGO_APROBADOR_INTEGRAL',
    command: 'punch.accept',
    occurredAt: '2026-08-25T12:00:00.000Z',
  };
  const sql = fakeSql({ resource: 'audit', page: 1, pageSize: 25, total: 1, items: [item] });
  const result = await listAttendanceResources(
    sql, identity(), { resource: 'audit', page: 1, pageSize: 25 }, session(),
  );
  assert.deepEqual(result.data[0], item);
  assert.match(sql.calls[0].statement, /attendance_gateway_list_v1/);

  const drifting = fakeSql({
    resource: 'audit', page: 1, pageSize: 25, total: 1,
    items: [{ ...item, before: { private: true } }],
  });
  await assert.rejects(
    listAttendanceResources(
      drifting, identity(), { resource: 'audit', page: 1, pageSize: 25 }, session(),
    ),
    hasCode('ATTENDANCE_CONTRACT_DRIFT'),
  );
});

test('apply usa UUID idempotente, hash de comando y nunca envía identidad cruda', async () => {
  const sql = fakeSql({ data: { id: IDEMPOTENCY_ID, status: 'proposed', version: 1 }, replayed: false });
  const result = await applyAttendanceCommand(sql, identity(), session(), {
    command: 'identity.create',
    payload: {
      deviceId: '11111111-1111-4111-8111-111111111111',
      sourceUserKey: '000000571',
      employmentContractId: '22222222-2222-4222-8222-222222222222',
      validFrom: '2026-08-25',
    },
  }, IDEMPOTENCY_ID, { identityPepper: PEPPER });
  assert.equal(result.data.status, 'proposed');
  const values = sql.calls[0].values;
  assert.equal(values[7], IDEMPOTENCY_ID);
  assert.match(values[8], /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(values).includes('000000571'), false);
});

test('recibo de ingesta se reduce a contadores no sensibles', async () => {
  const sql = fakeSql({
    batchId: IDEMPOTENCY_ID,
    status: 'accepted',
    acceptedCount: 1,
    duplicateCount: 0,
    unmappedCount: 1,
    ambiguousCount: 0,
    replayed: false,
  });
  const normalized = normalizeAttendanceIngestRequest(simulatorBody(), ingestOptions());
  const result = await ingestAttendanceBatch(
    sql, normalized, 'b'.repeat(64), RELEASE_SHA,
  );
  assert.deepEqual(result, {
    batchId: IDEMPOTENCY_ID,
    status: 'accepted',
    acceptedCount: 1,
    duplicateCount: 0,
    unmappedCount: 1,
    ambiguousCount: 0,
    replayed: false,
  });
  assert.equal(JSON.stringify(result).includes('identity'), false);
  assert.match(sql.calls[0].statement, /attendance_gateway_ingest_v1/);
});

test('recibo SQL de ingesta falla cerrado ante tipos, campos o contadores inconsistentes', async () => {
  const normalized = normalizeAttendanceIngestRequest(simulatorBody(), ingestOptions());
  for (const receipt of [
    {
      batchId: IDEMPOTENCY_ID, status: 'accepted', acceptedCount: '1', duplicateCount: 0,
      unmappedCount: 1, ambiguousCount: 0, replayed: false,
    },
    {
      batchId: IDEMPOTENCY_ID, status: 'accepted', acceptedCount: 1, duplicateCount: 0,
      unmappedCount: 1, ambiguousCount: 1, replayed: false,
    },
    {
      batchId: IDEMPOTENCY_ID, status: 'accepted', acceptedCount: 1, duplicateCount: 0,
      unmappedCount: 1, ambiguousCount: 0, replayed: false, tokenSha256: 'b'.repeat(64),
    },
  ]) {
    await assert.rejects(
      ingestAttendanceBatch(fakeSql(receipt), normalized, 'b'.repeat(64), RELEASE_SHA),
      hasCode('ATTENDANCE_CONTRACT_DRIFT'),
    );
  }
});

test('errores SQL operativos se traducen a códigos HTTP seguros y accionables', async () => {
  const body = {
    command: 'site.create',
    payload: {
      externalKey: 'pm-01', label: 'Sede', timezone: 'America/Argentina/Mendoza',
      latitude: null, longitude: null, geofenceRadiusM: null,
      networkEnabled: true, removableMediaEnabled: false,
    },
  };
  const cases = new Map([
    ['ATTENDANCE_SIMULATOR_FORBIDDEN', 422],
    ['ATTENDANCE_DEVICE_INACTIVE', 409],
    ['ATTENDANCE_SITE_INACTIVE', 409],
    ['ATTENDANCE_CONNECTOR_DEVICE_INVALID', 409],
    ['ATTENDANCE_CONNECTOR_TOKEN_INVALID', 422],
    ['ATTENDANCE_IDENTITY_CONTRACT_INVALID', 409],
    ['ATTENDANCE_PUNCH_STATE_INVALID', 409],
    ['ATTENDANCE_REVIEW_REASON_INVALID', 422],
    ['ATTENDANCE_SOURCE_VERIFICATION_REJECTED', 409],
    ['ATTENDANCE_TARGET_NOT_FOUND', 404],
    ['ATTENDANCE_LIST_INVALID', 400],
    ['TENANT_IAM_SOD_CONFLICT', 409],
  ]);
  for (const [code, status] of cases) {
    const sql = { async query() { throw new Error(code); } };
    await assert.rejects(
      applyAttendanceCommand(sql, identity(), session(), body, IDEMPOTENCY_ID),
      (error) => hasCode(code)(error) && error.status === status,
    );
  }
});
