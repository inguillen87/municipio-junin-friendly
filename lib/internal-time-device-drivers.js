import { createHash } from 'node:crypto';

export const TIME_DEVICE_DRIVER_CONTRACT_VERSION = 'time-device-driver.v1';
export const TIME_DEVICE_EVENT_SCHEMA_VERSION = 'time-device-event.v1';
export const TIME_DEVICE_BATCH_SCHEMA_VERSION = 'time-device-batch.v1';
export const TIME_DEVICE_HEALTH_SCHEMA_VERSION = 'time-device-health.v1';

export const TIME_DEVICE_CAPABILITY_KEYS = Object.freeze([
  'pull', 'push', 'biometric', 'card', 'pin',
]);

export const TIME_DEVICE_HEALTH_STATUSES = Object.freeze([
  'healthy', 'degraded', 'offline', 'unknown',
]);

const CAPABILITY_SET = new Set(TIME_DEVICE_CAPABILITY_KEYS);
const HEALTH_STATUS_SET = new Set(TIME_DEVICE_HEALTH_STATUSES);
const TRANSPORTS = new Set(['pull', 'push']);
const PUNCH_TYPES = new Set(['check_in', 'check_out', 'break_start', 'break_end', 'unspecified']);
const CREDENTIAL_TYPES = new Set(['biometric', 'card', 'pin', 'unknown']);
const VERIFICATION_RESULTS = new Set(['accepted', 'rejected', 'unknown']);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const DRIVER_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const VERSION = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i;
const LOCAL_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/;
const MAX_BATCH_EVENTS = 10_000;
const MAX_CSV_BYTES = 5 * 1024 * 1024;

const CANONICAL_HEALTH_MAP = Object.freeze({
  healthy: 'healthy',
  degraded: 'degraded',
  offline: 'offline',
  unknown: 'unknown',
});

const RAW_EVENT_FIELDS = new Set([
  'deviceId', 'pointId', 'employeeId', 'sourceEventId', 'occurredAtLocal',
  'timezone', 'utcOffsetMinutes', 'punchType', 'credentialType',
  'verificationResult', 'sequence',
]);

const EVENT_CONTEXT_FIELDS = new Set([
  'tenantId', 'sourceId', 'deviceId', 'pointId', 'timezone', 'utcOffsetMinutes',
]);

const FULL_EVENT_FIELDS = new Set([
  'tenantId', 'sourceId', 'driverId', ...RAW_EVENT_FIELDS,
]);

const RAW_HEALTH_FIELDS = new Set([
  'deviceId', 'pointId', 'status', 'observedAtUtc', 'clockOffsetSeconds',
  'pendingEventCount', 'detailCode',
]);

export class TimeDeviceDriverError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TimeDeviceDriverError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new TimeDeviceDriverError(code, message);
}

function exactObject(value, allowed, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} debe ser un objeto exacto`);
  }
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) fail(code, `${label} contiene un campo no permitido: ${extra}`);
}

function boundedText(value, field, { min = 1, max = 128 } = {}) {
  if (typeof value !== 'string') fail('TIME_DEVICE_FIELD_INVALID', `${field} debe ser texto`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    fail('TIME_DEVICE_FIELD_INVALID', `${field} es inválido`);
  }
  return normalized;
}

function identifier(value, field) {
  const normalized = boundedText(value, field);
  if (!IDENTIFIER.test(normalized)) fail('TIME_DEVICE_IDENTIFIER_INVALID', `${field} es inválido`);
  return normalized;
}

function optionalIdentifier(value, field) {
  if (value == null || value === '') return null;
  return identifier(value, field);
}

function safeEnum(value, allowed, field, code = 'TIME_DEVICE_EVENT_INVALID') {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!allowed.has(normalized)) fail(code, `${field} no pertenece al contrato`);
  return normalized;
}

function integerInRange(value, field, min, max, code = 'TIME_DEVICE_EVENT_INVALID') {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail(code, `${field} debe ser un entero entre ${min} y ${max}`);
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeDriverId(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!DRIVER_ID.test(normalized)) fail('TIME_DEVICE_DRIVER_ID_INVALID', 'driverId es inválido');
  return normalized;
}

function normalizeVersion(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!VERSION.test(normalized)) fail('TIME_DEVICE_DRIVER_VERSION_INVALID', 'version es inválida');
  return normalized;
}

export function normalizeTimeDeviceCapabilities(input) {
  exactObject(input, CAPABILITY_SET, 'TIME_DEVICE_CAPABILITIES_INVALID', 'capabilities');
  const capabilities = {};
  for (const key of TIME_DEVICE_CAPABILITY_KEYS) {
    if (typeof input[key] !== 'boolean') {
      fail('TIME_DEVICE_CAPABILITIES_INVALID', `capabilities.${key} debe ser booleano`);
    }
    capabilities[key] = input[key];
  }
  if (!capabilities.pull && !capabilities.push) {
    fail('TIME_DEVICE_CAPABILITIES_INVALID', 'El driver debe declarar pull o push');
  }
  return Object.freeze(capabilities);
}

function canonicalTimezone(value) {
  const timezone = boundedText(value, 'timezone', { max: 100 });
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
    return timezone;
  } catch {
    fail('TIME_DEVICE_TIMEZONE_INVALID', 'timezone no es una zona IANA válida');
  }
}

function parseLocalTimestamp(value) {
  const match = typeof value === 'string' ? LOCAL_TIMESTAMP.exec(value.trim()) : null;
  if (!match) {
    fail('TIME_DEVICE_LOCAL_TIMESTAMP_INVALID', 'occurredAtLocal debe ser una fecha local ISO sin offset');
  }
  const parts = match.slice(1, 7).map(Number);
  const millisecond = Number((match[7] || '').padEnd(3, '0'));
  const [year, month, day, hour, minute, second] = parts;
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1
      || candidate.getUTCDate() !== day || candidate.getUTCHours() !== hour
      || candidate.getUTCMinutes() !== minute || candidate.getUTCSeconds() !== second) {
    fail('TIME_DEVICE_LOCAL_TIMESTAMP_INVALID', 'occurredAtLocal no representa una fecha civil válida');
  }
  const localTimestamp = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
    + `-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}`
    + `:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
    + `.${String(millisecond).padStart(3, '0')}`;
  return Object.freeze({ year, month, day, hour, minute, second, millisecond, localTimestamp });
}

function zonedParts(instant, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const result = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
  }
  return result;
}

function offsetText(offsetMinutes) {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function normalizeLocalInstant(localValue, timezoneValue, offsetValue) {
  const local = parseLocalTimestamp(localValue);
  const timezone = canonicalTimezone(timezoneValue);
  const utcOffsetMinutes = integerInRange(
    offsetValue, 'utcOffsetMinutes', -14 * 60, 14 * 60, 'TIME_DEVICE_OFFSET_INVALID',
  );
  const instantMs = Date.UTC(
    local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond,
  ) - (utcOffsetMinutes * 60_000);
  const instant = new Date(instantMs);
  const projected = zonedParts(instant, timezone);
  const expected = ['year', 'month', 'day', 'hour', 'minute', 'second'];
  if (expected.some((field) => projected[field] !== local[field])) {
    fail('TIME_DEVICE_OFFSET_MISMATCH', 'timezone, offset y hora local no representan el mismo instante');
  }
  return Object.freeze({
    occurredAtLocal: local.localTimestamp,
    occurredAtUtc: instant.toISOString(),
    timezone,
    utcOffsetMinutes,
    utcOffset: offsetText(utcOffsetMinutes),
  });
}

function normalizeUtcInstant(value, field = 'observedAtUtc') {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!UTC_TIMESTAMP.test(normalized)) fail('TIME_DEVICE_HEALTH_INVALID', `${field} debe ser UTC ISO`);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) fail('TIME_DEVICE_HEALTH_INVALID', `${field} es inválido`);
  return parsed.toISOString();
}

function normalizedEventIdentity(event) {
  return Object.freeze({
    tenantId: event.tenantId,
    sourceId: event.sourceId,
    deviceId: event.deviceId,
    sourceEventId: event.sourceEventId,
  });
}

export function timeDeviceEventIdempotencyKey(event) {
  exactObject(event, new Set(['tenantId', 'sourceId', 'deviceId', 'sourceEventId']),
    'TIME_DEVICE_IDEMPOTENCY_INPUT_INVALID', 'identidad del evento');
  const identity = {
    tenantId: identifier(event.tenantId, 'tenantId'),
    sourceId: identifier(event.sourceId, 'sourceId'),
    deviceId: identifier(event.deviceId, 'deviceId'),
    sourceEventId: identifier(event.sourceEventId, 'sourceEventId'),
  };
  return `time-device-event:v1:${sha256(stableJson(identity))}`;
}

function derivedSourceEventId(event) {
  const identity = {
    tenantId: event.tenantId,
    sourceId: event.sourceId,
    deviceId: event.deviceId,
    pointId: event.pointId,
    employeeId: event.employeeId,
    occurredAtUtc: event.occurredAtUtc,
    punchType: event.punchType,
    credentialType: event.credentialType,
    verificationResult: event.verificationResult,
    sequence: event.sequence,
  };
  return `derived:${sha256(stableJson(identity))}`;
}

export function normalizeTimeDeviceEvent(input) {
  exactObject(input, FULL_EVENT_FIELDS, 'TIME_DEVICE_EVENT_INVALID', 'evento');
  const tenantId = identifier(input.tenantId, 'tenantId');
  const sourceId = identifier(input.sourceId, 'sourceId');
  const driverId = normalizeDriverId(input.driverId);
  const deviceId = identifier(input.deviceId, 'deviceId');
  const pointId = identifier(input.pointId, 'pointId');
  const employeeId = identifier(input.employeeId, 'employeeId');
  const instant = normalizeLocalInstant(input.occurredAtLocal, input.timezone, input.utcOffsetMinutes);
  const punchType = safeEnum(input.punchType, PUNCH_TYPES, 'punchType');
  const credentialType = safeEnum(input.credentialType, CREDENTIAL_TYPES, 'credentialType');
  const verificationResult = safeEnum(
    input.verificationResult, VERIFICATION_RESULTS, 'verificationResult',
  );
  const sequence = optionalIdentifier(input.sequence, 'sequence');
  const base = {
    schemaVersion: TIME_DEVICE_EVENT_SCHEMA_VERSION,
    tenantId,
    sourceId,
    driverId,
    deviceId,
    pointId,
    employeeId,
    sourceEventId: null,
    occurredAtLocal: instant.occurredAtLocal,
    occurredAtUtc: instant.occurredAtUtc,
    timezone: instant.timezone,
    utcOffsetMinutes: instant.utcOffsetMinutes,
    utcOffset: instant.utcOffset,
    punchType,
    credentialType,
    verificationResult,
    sequence,
  };
  base.sourceEventId = optionalIdentifier(input.sourceEventId, 'sourceEventId') || derivedSourceEventId(base);
  return Object.freeze({
    ...base,
    idempotencyKey: timeDeviceEventIdempotencyKey(normalizedEventIdentity(base)),
  });
}

function normalizeHealthMap(value = CANONICAL_HEALTH_MAP) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('TIME_DEVICE_HEALTH_MAP_INVALID', 'healthMap debe ser un objeto');
  }
  const normalized = {};
  for (const [rawKey, canonicalValue] of Object.entries(value)) {
    const key = boundedText(rawKey, 'healthMap key', { max: 64 }).toLowerCase();
    if (Object.hasOwn(normalized, key)) {
      fail('TIME_DEVICE_HEALTH_MAP_INVALID', 'healthMap contiene claves equivalentes');
    }
    normalized[key] = safeEnum(
      canonicalValue, HEALTH_STATUS_SET, 'healthMap value', 'TIME_DEVICE_HEALTH_MAP_INVALID',
    );
  }
  if (Object.keys(normalized).length === 0) {
    fail('TIME_DEVICE_HEALTH_MAP_INVALID', 'healthMap no puede estar vacío');
  }
  return Object.freeze(normalized);
}

export function normalizeTimeDeviceHealth(input, { healthMap = CANONICAL_HEALTH_MAP } = {}) {
  const fields = new Set([
    'tenantId', 'sourceId', 'driverId', ...RAW_HEALTH_FIELDS,
  ]);
  exactObject(input, fields, 'TIME_DEVICE_HEALTH_INVALID', 'health');
  const map = normalizeHealthMap(healthMap);
  const rawStatus = boundedText(input.status, 'status', { max: 64 }).toLowerCase();
  const status = map[rawStatus];
  if (!status) fail('TIME_DEVICE_HEALTH_STATUS_UNKNOWN', 'El estado no tiene un mapeo explícito');
  const clockOffsetSeconds = input.clockOffsetSeconds == null
    ? null
    : integerInRange(
      input.clockOffsetSeconds, 'clockOffsetSeconds', -86_400, 86_400, 'TIME_DEVICE_HEALTH_INVALID',
    );
  const pendingEventCount = input.pendingEventCount == null
    ? null
    : integerInRange(
      input.pendingEventCount, 'pendingEventCount', 0, 100_000_000, 'TIME_DEVICE_HEALTH_INVALID',
    );
  return Object.freeze({
    schemaVersion: TIME_DEVICE_HEALTH_SCHEMA_VERSION,
    tenantId: identifier(input.tenantId, 'tenantId'),
    sourceId: identifier(input.sourceId, 'sourceId'),
    driverId: normalizeDriverId(input.driverId),
    deviceId: identifier(input.deviceId, 'deviceId'),
    pointId: identifier(input.pointId, 'pointId'),
    status,
    rawStatus,
    observedAtUtc: normalizeUtcInstant(input.observedAtUtc),
    clockOffsetSeconds,
    pendingEventCount,
    detailCode: optionalIdentifier(input.detailCode, 'detailCode'),
  });
}

function publicDriverDescriptor(driver) {
  return Object.freeze({
    id: driver.id,
    version: driver.version,
    label: driver.label,
    contractVersion: TIME_DEVICE_DRIVER_CONTRACT_VERSION,
    capabilities: driver.capabilities,
  });
}

export function defineTimeDeviceDriver(input) {
  exactObject(input, new Set(['id', 'version', 'label', 'capabilities', 'decode', 'healthMap']),
    'TIME_DEVICE_DRIVER_INVALID', 'driver');
  if (typeof input.decode !== 'function') {
    fail('TIME_DEVICE_DRIVER_INVALID', 'decode debe ser una función');
  }
  const driver = {
    id: normalizeDriverId(input.id),
    version: normalizeVersion(input.version),
    label: boundedText(input.label, 'label', { min: 3, max: 120 }),
    capabilities: normalizeTimeDeviceCapabilities(input.capabilities),
    decode: input.decode,
    healthMap: normalizeHealthMap(input.healthMap),
  };
  return Object.freeze(driver);
}

function normalizeEventContext(value) {
  exactObject(value, EVENT_CONTEXT_FIELDS, 'TIME_DEVICE_CONTEXT_INVALID', 'context');
  return Object.freeze({
    tenantId: identifier(value.tenantId, 'tenantId'),
    sourceId: identifier(value.sourceId, 'sourceId'),
    deviceId: optionalIdentifier(value.deviceId, 'deviceId'),
    pointId: optionalIdentifier(value.pointId, 'pointId'),
    timezone: value.timezone == null ? null : canonicalTimezone(value.timezone),
    utcOffsetMinutes: value.utcOffsetMinutes == null
      ? null
      : integerInRange(
        value.utcOffsetMinutes, 'utcOffsetMinutes', -14 * 60, 14 * 60, 'TIME_DEVICE_OFFSET_INVALID',
      ),
  });
}

function fullEventFromRaw(raw, context, driverId) {
  exactObject(raw, RAW_EVENT_FIELDS, 'TIME_DEVICE_EVENT_INVALID', 'evento decodificado');
  return {
    tenantId: context.tenantId,
    sourceId: context.sourceId,
    driverId,
    deviceId: raw.deviceId ?? context.deviceId,
    pointId: raw.pointId ?? context.pointId,
    employeeId: raw.employeeId,
    sourceEventId: raw.sourceEventId,
    occurredAtLocal: raw.occurredAtLocal,
    timezone: raw.timezone ?? context.timezone,
    utcOffsetMinutes: raw.utcOffsetMinutes ?? context.utcOffsetMinutes,
    punchType: raw.punchType,
    credentialType: raw.credentialType,
    verificationResult: raw.verificationResult,
    sequence: raw.sequence,
  };
}

function enforceCredentialCapability(driver, event) {
  if (event.credentialType !== 'unknown' && !driver.capabilities[event.credentialType]) {
    fail('TIME_DEVICE_CREDENTIAL_UNSUPPORTED',
      `El driver ${driver.id} no declaró la capacidad ${event.credentialType}`);
  }
}

function eventFingerprint(event) {
  const copy = { ...event };
  delete copy.idempotencyKey;
  return sha256(stableJson(copy));
}

export function createTimeDeviceDriverRegistry(initialDrivers = []) {
  if (!Array.isArray(initialDrivers)) {
    fail('TIME_DEVICE_DRIVER_REGISTRY_INVALID', 'initialDrivers debe ser un arreglo');
  }
  const drivers = new Map();

  function register(candidate) {
    const driver = defineTimeDeviceDriver(candidate);
    if (drivers.has(driver.id)) {
      fail('TIME_DEVICE_DRIVER_ALREADY_REGISTERED', `El driver ${driver.id} ya está registrado`);
    }
    drivers.set(driver.id, driver);
    return publicDriverDescriptor(driver);
  }

  function resolve(driverId) {
    const id = normalizeDriverId(driverId);
    const driver = drivers.get(id);
    if (!driver) fail('TIME_DEVICE_DRIVER_NOT_REGISTERED', `El driver ${id} no está registrado`);
    return driver;
  }

  function list() {
    return Object.freeze([...drivers.values()]
      .map(publicDriverDescriptor)
      .sort((left, right) => left.id.localeCompare(right.id)));
  }

  function describe(driverId) {
    return publicDriverDescriptor(resolve(driverId));
  }

  function ingest(request) {
    exactObject(request, new Set(['driverId', 'transport', 'payload', 'context']),
      'TIME_DEVICE_INGEST_INVALID', 'solicitud de ingesta');
    const driver = resolve(request.driverId);
    const transport = safeEnum(
      request.transport, TRANSPORTS, 'transport', 'TIME_DEVICE_TRANSPORT_INVALID',
    );
    if (!driver.capabilities[transport]) {
      fail('TIME_DEVICE_TRANSPORT_UNSUPPORTED', `El driver ${driver.id} no soporta ${transport}`);
    }
    const context = normalizeEventContext(request.context);
    let decoded;
    try {
      decoded = driver.decode(request.payload, Object.freeze({ transport }));
    } catch (error) {
      if (error instanceof TimeDeviceDriverError) throw error;
      fail('TIME_DEVICE_DRIVER_DECODE_FAILED', `El driver ${driver.id} no pudo decodificar el lote`);
    }
    if (!Array.isArray(decoded) || decoded.length > MAX_BATCH_EVENTS) {
      fail('TIME_DEVICE_DRIVER_OUTPUT_INVALID', `El driver ${driver.id} devolvió un lote inválido`);
    }
    const byIdempotency = new Map();
    let duplicateCount = 0;
    for (const raw of decoded) {
      const event = normalizeTimeDeviceEvent(fullEventFromRaw(raw, context, driver.id));
      enforceCredentialCapability(driver, event);
      const fingerprint = eventFingerprint(event);
      const prior = byIdempotency.get(event.idempotencyKey);
      if (prior) {
        if (prior.fingerprint !== fingerprint) {
          fail('TIME_DEVICE_EVENT_IDEMPOTENCY_CONFLICT',
            'Dos eventos distintos comparten la misma identidad de origen');
        }
        duplicateCount += 1;
      } else {
        byIdempotency.set(event.idempotencyKey, { event, fingerprint });
      }
    }
    const events = Object.freeze([...byIdempotency.values()].map(({ event }) => event));
    const batchIdentity = {
      tenantId: context.tenantId,
      sourceId: context.sourceId,
      driverId: driver.id,
      transport,
      eventIdempotencyKeys: [...byIdempotency.keys()].sort(),
    };
    return Object.freeze({
      schemaVersion: TIME_DEVICE_BATCH_SCHEMA_VERSION,
      driver: publicDriverDescriptor(driver),
      transport,
      receivedCount: decoded.length,
      eventCount: events.length,
      duplicateCount,
      batchIdempotencyKey: `time-device-batch:v1:${sha256(stableJson(batchIdentity))}`,
      events,
    });
  }

  function mapHealth(request) {
    exactObject(request, new Set(['driverId', 'health', 'context']),
      'TIME_DEVICE_HEALTH_INVALID', 'solicitud de health');
    const driver = resolve(request.driverId);
    const context = normalizeEventContext(request.context);
    exactObject(request.health, RAW_HEALTH_FIELDS, 'TIME_DEVICE_HEALTH_INVALID', 'health decodificado');
    return normalizeTimeDeviceHealth({
      tenantId: context.tenantId,
      sourceId: context.sourceId,
      driverId: driver.id,
      deviceId: request.health.deviceId ?? context.deviceId,
      pointId: request.health.pointId ?? context.pointId,
      status: request.health.status,
      observedAtUtc: request.health.observedAtUtc,
      clockOffsetSeconds: request.health.clockOffsetSeconds,
      pendingEventCount: request.health.pendingEventCount,
      detailCode: request.health.detailCode,
    }, { healthMap: driver.healthMap });
  }

  for (const driver of initialDrivers) register(driver);
  return Object.freeze({ register, list, describe, ingest, mapHealth });
}

function cloneRawEvent(value) {
  exactObject(value, RAW_EVENT_FIELDS, 'TIME_DEVICE_SIMULATOR_INVALID', 'evento simulado');
  return { ...value };
}

export function createSimulatorTimeDeviceDriver(options = {}) {
  exactObject(options, new Set(['id', 'version', 'label', 'capabilities', 'healthMap']),
    'TIME_DEVICE_SIMULATOR_INVALID', 'opciones del simulador');
  return defineTimeDeviceDriver({
    id: options.id ?? 'simulator',
    version: options.version ?? '1.0.0',
    label: options.label ?? 'Simulador explícito sin hardware',
    capabilities: options.capabilities ?? {
      pull: true, push: true, biometric: true, card: true, pin: true,
    },
    healthMap: options.healthMap ?? CANONICAL_HEALTH_MAP,
    decode(payload) {
      exactObject(payload, new Set(['events']), 'TIME_DEVICE_SIMULATOR_INVALID', 'payload simulado');
      if (!Array.isArray(payload.events)) {
        fail('TIME_DEVICE_SIMULATOR_INVALID', 'events debe ser un arreglo');
      }
      return payload.events.map(cloneRawEvent);
    },
  });
}

/**
 * Parser del formato histórico GRH `Reloj A.C.` / `rel000.reg` acreditado por
 * el dump municipal. El flag 0/1 de la posición 30 se valida y participa del
 * hash de origen, pero no se interpreta como entrada o salida porque esa
 * semántica no está homologada en la fuente.
 */
export function createLegacyRel000FixedWidthDriver(options = {}) {
  exactObject(options, new Set(['id', 'version', 'label']),
    'TIME_DEVICE_REL000_CONFIG_INVALID', 'opciones de rel000');
  return defineTimeDeviceDriver({
    id: options.id ?? 'legacy-rel000-fixed-width',
    version: options.version ?? '1.0.0',
    label: options.label ?? 'GRH Reloj A.C. rel000 (dirección no homologada)',
    capabilities: {
      pull: true, push: false, biometric: false, card: false, pin: false,
    },
    healthMap: CANONICAL_HEALTH_MAP,
    decode(payload) {
      exactObject(payload, new Set(['text']), 'TIME_DEVICE_REL000_INVALID', 'payload rel000');
      if (typeof payload.text !== 'string'
          || Buffer.byteLength(payload.text, 'utf8') > MAX_CSV_BYTES) {
        fail('TIME_DEVICE_REL000_INVALID', 'rel000 debe ser texto y respetar el límite de tamaño');
      }
      const physicalLines = payload.text.replace(/^\uFEFF/, '').split(/\r?\n/);
      while (physicalLines.length && physicalLines.at(-1) === '') physicalLines.pop();
      if (physicalLines.length === 0) {
        fail('TIME_DEVICE_REL000_INVALID', 'rel000 no contiene registros');
      }
      return physicalLines.map((line, index) => {
        if (line.length !== 35) {
          fail('TIME_DEVICE_REL000_INVALID', `La fila ${index + 1} no mide 35 caracteres`);
        }
        const employeeId = line.slice(0, 9).trim();
        const year = line.slice(9, 13);
        const month = line.slice(14, 16);
        const day = line.slice(17, 19);
        const hour = line.slice(20, 22);
        const minute = line.slice(23, 25);
        const legacyDirectionFlag = line.slice(29, 30);
        if (!/^\d{1,9}$/.test(employeeId)
            || !/^\d{4}$/.test(year)
            || !/^\d{2}$/.test(month)
            || !/^\d{2}$/.test(day)
            || !/^\d{2}$/.test(hour)
            || !/^\d{2}$/.test(minute)
            || !/^[01]$/.test(legacyDirectionFlag)) {
          fail('TIME_DEVICE_REL000_INVALID', `La fila ${index + 1} no respeta loadubi`);
        }
        return {
          employeeId,
          sourceEventId: `rel000:${sha256(line)}`,
          occurredAtLocal: `${year}-${month}-${day}T${hour}:${minute}:00`,
          punchType: 'unspecified',
          credentialType: 'unknown',
          verificationResult: 'unknown',
          sequence: null,
        };
      });
    },
  });
}

function parseCsv(text, delimiter) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) {
    fail('TIME_DEVICE_CSV_INVALID', 'El CSV debe ser texto y respetar el límite de tamaño');
  }
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let quoteClosed = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        field += character;
      }
    } else if (character === '"') {
      if (field.length > 0 || quoteClosed) fail('TIME_DEVICE_CSV_INVALID', 'Comilla inesperada en CSV');
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = '';
      quoteClosed = false;
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      quoteClosed = false;
    } else if (quoteClosed) {
      fail('TIME_DEVICE_CSV_INVALID', 'Texto inesperado después de cerrar un campo entrecomillado');
    } else {
      field += character;
    }
  }
  if (quoted) fail('TIME_DEVICE_CSV_INVALID', 'CSV termina dentro de un campo entrecomillado');
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length && rows.at(-1).every((value) => value === '')) rows.pop();
  if (rows.length === 0) fail('TIME_DEVICE_CSV_INVALID', 'CSV no contiene encabezado');
  return rows;
}

function normalizeMapping(mapping) {
  exactObject(mapping, RAW_EVENT_FIELDS, 'TIME_DEVICE_CSV_MAPPING_INVALID', 'mapping');
  const normalized = {};
  for (const [field, header] of Object.entries(mapping)) {
    normalized[field] = boundedText(header, `mapping.${field}`, { max: 128 });
  }
  return Object.freeze(normalized);
}

function normalizeLiterals(literals) {
  exactObject(literals, RAW_EVENT_FIELDS, 'TIME_DEVICE_CSV_MAPPING_INVALID', 'literals');
  return Object.freeze({ ...literals });
}

function csvScalar(field, value) {
  if (value == null || value === '') return undefined;
  if (field === 'utcOffsetMinutes') {
    if (!/^-?\d+$/.test(value.trim())) {
      fail('TIME_DEVICE_CSV_INVALID', 'utcOffsetMinutes debe ser entero en CSV');
    }
    return Number(value.trim());
  }
  return value.trim();
}

const DEFAULT_CSV_MAPPING = Object.freeze(Object.fromEntries(
  [...RAW_EVENT_FIELDS].map((field) => [field, field]),
));

export function createCsvGenericTimeDeviceDriver(options = {}) {
  exactObject(options, new Set([
    'id', 'version', 'label', 'delimiter', 'mapping', 'literals', 'capabilities', 'healthMap',
  ]), 'TIME_DEVICE_CSV_CONFIG_INVALID', 'opciones de csv-generic');
  const delimiter = options.delimiter ?? ',';
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || /[\r\n"]/.test(delimiter)) {
    fail('TIME_DEVICE_CSV_CONFIG_INVALID', 'delimiter debe ser un único carácter seguro');
  }
  const mapping = normalizeMapping(options.mapping ?? DEFAULT_CSV_MAPPING);
  const literals = normalizeLiterals(options.literals ?? {});
  const overlap = Object.keys(mapping).find((field) => Object.hasOwn(literals, field));
  if (overlap) fail('TIME_DEVICE_CSV_MAPPING_INVALID', `${overlap} no puede estar en mapping y literals`);
  return defineTimeDeviceDriver({
    id: options.id ?? 'csv-generic',
    version: options.version ?? '1.0.0',
    label: options.label ?? 'CSV genérico configurable',
    capabilities: options.capabilities ?? {
      pull: true, push: false, biometric: false, card: false, pin: false,
    },
    healthMap: options.healthMap ?? CANONICAL_HEALTH_MAP,
    decode(payload) {
      exactObject(payload, new Set(['text']), 'TIME_DEVICE_CSV_INVALID', 'payload CSV');
      const rows = parseCsv(payload.text.replace(/^\uFEFF/, ''), delimiter);
      const headers = rows[0].map((header) => header.trim());
      if (headers.some((header) => !header)) fail('TIME_DEVICE_CSV_INVALID', 'CSV contiene encabezados vacíos');
      if (new Set(headers).size !== headers.length) fail('TIME_DEVICE_CSV_INVALID', 'CSV contiene encabezados duplicados');
      const indexes = {};
      for (const [field, header] of Object.entries(mapping)) {
        const index = headers.indexOf(header);
        if (index < 0) fail('TIME_DEVICE_CSV_INVALID', `Falta la columna configurada ${header}`);
        indexes[field] = index;
      }
      const events = [];
      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const values = rows[rowIndex];
        if (values.length !== headers.length) {
          fail('TIME_DEVICE_CSV_INVALID', `La fila ${rowIndex + 1} no coincide con el encabezado`);
        }
        if (values.every((value) => value.trim() === '')) {
          fail('TIME_DEVICE_CSV_INVALID', `La fila ${rowIndex + 1} está vacía`);
        }
        const event = { ...literals };
        for (const [field, index] of Object.entries(indexes)) {
          const scalar = csvScalar(field, values[index]);
          if (scalar !== undefined) event[field] = scalar;
        }
        events.push(event);
      }
      return events;
    },
  });
}
