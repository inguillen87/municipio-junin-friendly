import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TIME_DEVICE_BATCH_SCHEMA_VERSION,
  TIME_DEVICE_DRIVER_CONTRACT_VERSION,
  TIME_DEVICE_EVENT_SCHEMA_VERSION,
  TIME_DEVICE_HEALTH_SCHEMA_VERSION,
  TimeDeviceDriverError,
  createCsvGenericTimeDeviceDriver,
  createLegacyRel000FixedWidthDriver,
  createSimulatorTimeDeviceDriver,
  createTimeDeviceDriverRegistry,
  defineTimeDeviceDriver,
  normalizeTimeDeviceCapabilities,
  normalizeTimeDeviceEvent,
  normalizeTimeDeviceHealth,
  timeDeviceEventIdempotencyKey,
} from '../lib/internal-time-device-drivers.js';

const CONTEXT = Object.freeze({
  tenantId: 'tenant-junin',
  sourceId: 'source-reloj-piloto',
  deviceId: 'device-local-01',
  pointId: 'point-edificio-01',
  timezone: 'America/Argentina/Mendoza',
  utcOffsetMinutes: -180,
});

function rawEvent(overrides = {}) {
  return {
    employeeId: 'legajo-571',
    sourceEventId: 'event-000001',
    occurredAtLocal: '2026-08-25T07:00:00',
    punchType: 'check_in',
    credentialType: 'biometric',
    verificationResult: 'accepted',
    sequence: '1',
    ...overrides,
  };
}

function fullEvent(overrides = {}) {
  return {
    ...CONTEXT,
    driverId: 'simulator',
    employeeId: 'legajo-571',
    sourceEventId: 'event-000001',
    occurredAtLocal: '2026-08-25T07:00:00',
    punchType: 'check_in',
    credentialType: 'biometric',
    verificationResult: 'accepted',
    sequence: '1',
    ...overrides,
  };
}

function hasCode(code) {
  return (error) => error instanceof TimeDeviceDriverError && error.code === code;
}

test('capabilities exige contrato exacto y al menos un transporte', () => {
  const capabilities = normalizeTimeDeviceCapabilities({
    pull: true, push: false, biometric: true, card: false, pin: false,
  });
  assert.deepEqual(capabilities, {
    pull: true, push: false, biometric: true, card: false, pin: false,
  });
  assert.equal(Object.isFrozen(capabilities), true);
  assert.throws(() => normalizeTimeDeviceCapabilities({
    pull: false, push: false, biometric: true, card: false, pin: false,
  }), hasCode('TIME_DEVICE_CAPABILITIES_INVALID'));
  assert.throws(() => normalizeTimeDeviceCapabilities({
    pull: true, push: false, biometric: true, card: false, pin: false, vendorSecret: true,
  }), hasCode('TIME_DEVICE_CAPABILITIES_INVALID'));
  assert.throws(() => normalizeTimeDeviceCapabilities({
    pull: true, push: false, biometric: true, card: false,
  }), hasCode('TIME_DEVICE_CAPABILITIES_INVALID'));
});

test('evento canónico conserva tiempo civil, prueba offset IANA y deriva UTC', () => {
  const event = normalizeTimeDeviceEvent(fullEvent());
  assert.equal(event.schemaVersion, TIME_DEVICE_EVENT_SCHEMA_VERSION);
  assert.equal(event.occurredAtLocal, '2026-08-25T07:00:00.000');
  assert.equal(event.occurredAtUtc, '2026-08-25T10:00:00.000Z');
  assert.equal(event.timezone, 'America/Argentina/Mendoza');
  assert.equal(event.utcOffsetMinutes, -180);
  assert.equal(event.utcOffset, '-03:00');
  assert.equal(event.sourceEventId, 'event-000001');
  assert.match(event.idempotencyKey, /^time-device-event:v1:[a-f0-9]{64}$/);
  assert.equal(event.idempotencyKey, timeDeviceEventIdempotencyKey({
    tenantId: event.tenantId,
    sourceId: event.sourceId,
    deviceId: event.deviceId,
    sourceEventId: event.sourceEventId,
  }));
  assert.equal(Object.isFrozen(event), true);
});

test('sourceEventId derivado e idempotencia son deterministas sin inventar secuencias', () => {
  const first = normalizeTimeDeviceEvent(fullEvent({ sourceEventId: undefined }));
  const replay = normalizeTimeDeviceEvent(fullEvent({ sourceEventId: undefined }));
  const next = normalizeTimeDeviceEvent(fullEvent({ sourceEventId: undefined, sequence: '2' }));
  assert.match(first.sourceEventId, /^derived:[a-f0-9]{64}$/);
  assert.equal(first.sourceEventId, replay.sourceEventId);
  assert.equal(first.idempotencyKey, replay.idempotencyKey);
  assert.notEqual(first.sourceEventId, next.sourceEventId);
  assert.notEqual(first.idempotencyKey, next.idempotencyKey);
});

test('validación temporal y estructural cierra ante drift, DST, enums y campos extra', () => {
  assert.throws(() => normalizeTimeDeviceEvent(fullEvent({ utcOffsetMinutes: -120 })),
    hasCode('TIME_DEVICE_OFFSET_MISMATCH'));
  assert.throws(() => normalizeTimeDeviceEvent(fullEvent({
    timezone: 'America/New_York',
    occurredAtLocal: '2026-03-08T02:30:00',
    utcOffsetMinutes: -300,
  })), hasCode('TIME_DEVICE_OFFSET_MISMATCH'));
  assert.throws(() => normalizeTimeDeviceEvent(fullEvent({ timezone: 'Municipio/Junin' })),
    hasCode('TIME_DEVICE_TIMEZONE_INVALID'));
  assert.throws(() => normalizeTimeDeviceEvent(fullEvent({ punchType: 'entrada_vendor' })),
    hasCode('TIME_DEVICE_EVENT_INVALID'));
  assert.throws(() => normalizeTimeDeviceEvent({ ...fullEvent(), template: 'huella' }),
    hasCode('TIME_DEVICE_EVENT_INVALID'));
  assert.throws(() => normalizeTimeDeviceEvent(fullEvent({ employeeId: 'persona con espacios' })),
    hasCode('TIME_DEVICE_IDENTIFIER_INVALID'));
});

test('registro empieza vacío, no reemplaza drivers y sólo publica metadatos', () => {
  const registry = createTimeDeviceDriverRegistry();
  assert.deepEqual(registry.list(), []);
  assert.throws(() => registry.describe('simulator'), hasCode('TIME_DEVICE_DRIVER_NOT_REGISTERED'));
  const descriptor = registry.register(createSimulatorTimeDeviceDriver());
  assert.deepEqual(descriptor, {
    id: 'simulator',
    version: '1.0.0',
    label: 'Simulador explícito sin hardware',
    contractVersion: TIME_DEVICE_DRIVER_CONTRACT_VERSION,
    capabilities: { pull: true, push: true, biometric: true, card: true, pin: true },
  });
  assert.equal(Object.hasOwn(descriptor, 'decode'), false);
  assert.throws(() => registry.register(createSimulatorTimeDeviceDriver()),
    hasCode('TIME_DEVICE_DRIVER_ALREADY_REGISTERED'));
});

test('simulador normaliza lotes, colapsa replay exacto y crea clave de lote estable', () => {
  const registry = createTimeDeviceDriverRegistry([createSimulatorTimeDeviceDriver()]);
  const payload = { events: [rawEvent(), rawEvent(), rawEvent({
    sourceEventId: 'event-000002',
    occurredAtLocal: '2026-08-25T13:00:00',
    punchType: 'check_out',
    sequence: '2',
  })] };
  const result = registry.ingest({
    driverId: 'simulator', transport: 'pull', payload, context: CONTEXT,
  });
  assert.equal(result.schemaVersion, TIME_DEVICE_BATCH_SCHEMA_VERSION);
  assert.equal(result.receivedCount, 3);
  assert.equal(result.eventCount, 2);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.events[1].occurredAtUtc, '2026-08-25T16:00:00.000Z');
  assert.match(result.batchIdempotencyKey, /^time-device-batch:v1:[a-f0-9]{64}$/);

  const reversed = registry.ingest({
    driverId: 'simulator', transport: 'pull', payload: { events: [...payload.events].reverse() },
    context: CONTEXT,
  });
  assert.equal(reversed.batchIdempotencyKey, result.batchIdempotencyKey);

  const emptyJunin = registry.ingest({
    driverId: 'simulator', transport: 'pull', payload: { events: [] }, context: CONTEXT,
  });
  const emptyOtherTenant = registry.ingest({
    driverId: 'simulator', transport: 'pull', payload: { events: [] },
    context: { ...CONTEXT, tenantId: 'tenant-other' },
  });
  assert.notEqual(emptyJunin.batchIdempotencyKey, emptyOtherTenant.batchIdempotencyKey);
});

test('misma identidad de origen con contenido distinto aborta todo el lote', () => {
  const registry = createTimeDeviceDriverRegistry([createSimulatorTimeDeviceDriver()]);
  assert.throws(() => registry.ingest({
    driverId: 'simulator',
    transport: 'push',
    payload: { events: [rawEvent(), rawEvent({ employeeId: 'legajo-999' })] },
    context: CONTEXT,
  }), hasCode('TIME_DEVICE_EVENT_IDEMPOTENCY_CONFLICT'));
});

test('transporte y credencial requieren capacidades declaradas', () => {
  const restricted = createSimulatorTimeDeviceDriver({
    id: 'restricted',
    capabilities: { pull: true, push: false, biometric: false, card: true, pin: false },
  });
  const registry = createTimeDeviceDriverRegistry([restricted]);
  assert.throws(() => registry.ingest({
    driverId: 'restricted', transport: 'push', payload: { events: [] }, context: CONTEXT,
  }), hasCode('TIME_DEVICE_TRANSPORT_UNSUPPORTED'));
  assert.throws(() => registry.ingest({
    driverId: 'restricted', transport: 'pull', payload: { events: [rawEvent()] }, context: CONTEXT,
  }), hasCode('TIME_DEVICE_CREDENTIAL_UNSUPPORTED'));
  const accepted = registry.ingest({
    driverId: 'restricted', transport: 'pull',
    payload: { events: [rawEvent({ credentialType: 'card' })] }, context: CONTEXT,
  });
  assert.equal(accepted.eventCount, 1);
});

test('csv-generic usa mapeo explícito, RFC4180 básico y defaults de contexto', () => {
  const driver = createCsvGenericTimeDeviceDriver({
    delimiter: ',',
    capabilities: { pull: true, push: false, biometric: true, card: true, pin: true },
    mapping: {
      sourceEventId: 'evento',
      employeeId: 'legajo',
      occurredAtLocal: 'hora_local',
      punchType: 'tipo',
      credentialType: 'credencial',
      verificationResult: 'resultado',
      sequence: 'secuencia',
    },
  });
  const registry = createTimeDeviceDriverRegistry([driver]);
  const text = '\uFEFFevento,legajo,hora_local,tipo,credencial,resultado,secuencia,nota\r\n'
    + 'csv-1,571,2026-08-25T07:01:02,check_in,pin,accepted,91,"texto, ignorado"\r\n';
  const result = registry.ingest({
    driverId: 'csv-generic', transport: 'pull', payload: { text }, context: CONTEXT,
  });
  assert.equal(result.eventCount, 1);
  assert.equal(result.events[0].employeeId, '571');
  assert.equal(result.events[0].sourceEventId, 'csv-1');
  assert.equal(result.events[0].occurredAtUtc, '2026-08-25T10:01:02.000Z');
  assert.equal(result.events[0].credentialType, 'pin');
  assert.throws(() => registry.ingest({
    driverId: 'csv-generic', transport: 'push', payload: { text }, context: CONTEXT,
  }), hasCode('TIME_DEVICE_TRANSPORT_UNSUPPORTED'));
});

function rel000Line({ employee = '000000571', year = '2012', month = '01', day = '03',
  hour = '07', minute = '01', direction = '1' } = {}) {
  const row = Array(35).fill(' ');
  const put = (start, value) => [...value].forEach((character, offset) => { row[start + offset] = character; });
  put(0, employee); put(9, year); put(14, month); put(17, day);
  put(20, hour); put(23, minute); put(29, direction);
  return row.join('');
}

test('rel000 parsea el layout histórico exacto sin inventar entrada/salida', () => {
  const registry = createTimeDeviceDriverRegistry([createLegacyRel000FixedWidthDriver()]);
  const first = rel000Line();
  const second = rel000Line({ minute: '02', direction: '0' });
  const batch = registry.ingest({
    driverId: 'legacy-rel000-fixed-width', transport: 'pull',
    payload: { text: `${first}\r\n${second}\r\n` }, context: CONTEXT,
  });
  assert.equal(batch.eventCount, 2);
  assert.equal(batch.events[0].employeeId, '000000571');
  assert.equal(batch.events[0].occurredAtUtc, '2012-01-03T10:01:00.000Z');
  assert.equal(batch.events[0].punchType, 'unspecified');
  assert.equal(batch.events[0].verificationResult, 'unknown');
  assert.match(batch.events[0].sourceEventId, /^rel000:[a-f0-9]{64}$/);
  assert.notEqual(batch.events[0].sourceEventId, batch.events[1].sourceEventId);
});

test('rel000 rechaza longitud, fecha y flag fuera del contrato loadubi', () => {
  const registry = createTimeDeviceDriverRegistry([createLegacyRel000FixedWidthDriver()]);
  for (const text of [
    'corto',
    rel000Line({ month: '13' }),
    rel000Line({ direction: 'E' }),
  ]) assert.throws(() => registry.ingest({
    driverId: 'legacy-rel000-fixed-width', transport: 'pull', payload: { text }, context: CONTEXT,
  }), (error) => [
    'TIME_DEVICE_REL000_INVALID', 'TIME_DEVICE_LOCAL_TIMESTAMP_INVALID',
  ].includes(error.code));
});

test('csv-generic rechaza configuración ambigua y archivos estructuralmente corruptos', () => {
  assert.throws(() => createCsvGenericTimeDeviceDriver({
    mapping: { employeeId: 'legajo' }, literals: { employeeId: '571' },
  }), hasCode('TIME_DEVICE_CSV_MAPPING_INVALID'));

  const driver = createCsvGenericTimeDeviceDriver({
    mapping: {
      employeeId: 'legajo', occurredAtLocal: 'hora', punchType: 'tipo',
      credentialType: 'credencial', verificationResult: 'resultado',
    },
    capabilities: { pull: true, push: false, biometric: false, card: false, pin: false },
  });
  const registry = createTimeDeviceDriverRegistry([driver]);
  assert.throws(() => registry.ingest({
    driverId: 'csv-generic', transport: 'pull',
    payload: { text: 'legajo,legajo,hora,tipo,credencial,resultado\n1,1,2026-08-25T07:00:00,check_in,unknown,accepted' },
    context: CONTEXT,
  }), hasCode('TIME_DEVICE_CSV_INVALID'));
  assert.throws(() => registry.ingest({
    driverId: 'csv-generic', transport: 'pull',
    payload: { text: 'legajo,hora,tipo,credencial,resultado\n1,2026-08-25T07:00:00,check_in,unknown' },
    context: CONTEXT,
  }), hasCode('TIME_DEVICE_CSV_INVALID'));
  assert.throws(() => registry.ingest({
    driverId: 'csv-generic', transport: 'pull',
    payload: { text: 'legajo,hora,tipo,credencial,resultado\n"1"x,2026-08-25T07:00:00,check_in,unknown,accepted' },
    context: CONTEXT,
  }), hasCode('TIME_DEVICE_CSV_INVALID'));
});

test('health sólo interpreta estados mapeados explícitamente y conserva drift bruto', () => {
  const driver = createSimulatorTimeDeviceDriver({
    healthMap: { online: 'healthy', warning: 'degraded', down: 'offline' },
  });
  const registry = createTimeDeviceDriverRegistry([driver]);
  const health = registry.mapHealth({
    driverId: 'simulator',
    context: CONTEXT,
    health: {
      status: 'ONLINE',
      observedAtUtc: '2026-08-25T10:02:03Z',
      clockOffsetSeconds: 37,
      pendingEventCount: 4,
      detailCode: 'gateway-poll',
    },
  });
  assert.equal(health.schemaVersion, TIME_DEVICE_HEALTH_SCHEMA_VERSION);
  assert.equal(health.status, 'healthy');
  assert.equal(health.rawStatus, 'online');
  assert.equal(health.observedAtUtc, '2026-08-25T10:02:03.000Z');
  assert.equal(health.clockOffsetSeconds, 37);
  assert.equal(health.pendingEventCount, 4);
  assert.throws(() => registry.mapHealth({
    driverId: 'simulator', context: CONTEXT,
    health: { status: 'connected', observedAtUtc: '2026-08-25T10:02:03Z' },
  }), hasCode('TIME_DEVICE_HEALTH_STATUS_UNKNOWN'));
});

test('normalizador de health directo valida límites y campos exactos', () => {
  const base = {
    tenantId: 'tenant-junin', sourceId: 'source-1', driverId: 'driver-1',
    deviceId: 'device-1', pointId: 'point-1', status: 'unknown',
    observedAtUtc: '2026-08-25T10:00:00Z', clockOffsetSeconds: null,
    pendingEventCount: null, detailCode: null,
  };
  assert.equal(normalizeTimeDeviceHealth(base).status, 'unknown');
  assert.throws(() => normalizeTimeDeviceHealth({ ...base, pendingEventCount: -1 }),
    hasCode('TIME_DEVICE_HEALTH_INVALID'));
  assert.throws(() => normalizeTimeDeviceHealth({ ...base, battery: 90 }),
    hasCode('TIME_DEVICE_HEALTH_INVALID'));
});

test('errores internos del decoder se encapsulan sin filtrar detalle', () => {
  const driver = defineTimeDeviceDriver({
    id: 'faulty', version: '1.0.0', label: 'Driver deliberadamente fallido',
    capabilities: { pull: true, push: false, biometric: false, card: false, pin: false },
    healthMap: { unknown: 'unknown' },
    decode() { throw new Error('token-secreto-del-gateway'); },
  });
  const registry = createTimeDeviceDriverRegistry([driver]);
  assert.throws(() => registry.ingest({
    driverId: 'faulty', transport: 'pull', payload: {}, context: CONTEXT,
  }), (error) => {
    assert.equal(error.code, 'TIME_DEVICE_DRIVER_DECODE_FAILED');
    assert.doesNotMatch(error.message, /secreto|token/i);
    return true;
  });
});
