import { createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';

import {
  createCsvGenericTimeDeviceDriver,
  createLegacyRel000FixedWidthDriver,
  createSimulatorTimeDeviceDriver,
  createTimeDeviceDriverRegistry,
} from './internal-time-device-drivers.js';

export const ATTENDANCE_GATEWAY_CONTRACT_VERSION = 'attendance-device-gateway.v1';
export const ATTENDANCE_INGEST_CONTRACT_VERSION = 'attendance-ingest.v1';

export const ATTENDANCE_RESOURCES = Object.freeze([
  'site', 'device', 'connector', 'punch', 'batch', 'audit',
]);

export const ATTENDANCE_COMMAND_CAPABILITY = Object.freeze({
  'site.create': 'attendance.site.manage',
  'site.update': 'attendance.site.manage',
  'device.create': 'attendance.device.manage',
  'device.update': 'attendance.device.manage',
  'connector.create': 'attendance.connector.manage',
  'connector.rotate_token': 'attendance.connector.manage',
  'connector.update': 'attendance.connector.manage',
  'identity.create': 'attendance.identity.manage',
  'identity.revoke': 'attendance.identity.manage',
  'punch.link_identity': 'attendance.identity.manage',
  'punch.accept': 'attendance.review',
  'punch.reject': 'attendance.review',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA64 = /^[a-f0-9]{64}$/;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const BATCH_KEY = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;
const DRIVER_KEY = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const SITE_DEVICE_EXTERNAL_KEY = /^[a-z0-9][a-z0-9._-]{1,95}$/;
const CONNECTOR_EXTERNAL_KEY = /^[a-z0-9][a-z0-9._-]{7,127}$/;
const VENDOR_KEY = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const SQL_DRIVER_KEY = /^[a-z0-9][a-z0-9._-]{2,95}$/;
const REVIEW_REASON = /^[a-z][a-z0-9_]{2,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMANDS = new Set(Object.keys(ATTENDANCE_COMMAND_CAPABILITY));
const RESOURCES = new Set(ATTENDANCE_RESOURCES);
const TRANSPORTS = new Set(['pull', 'push']);
const DEVICE_TRANSPORTS = new Set([
  'network_pull', 'network_push', 'removable_media', 'hybrid',
]);
const STATUS = /^[a-z][a-z0-9_]{1,47}$/;
const SITE_STATUSES = new Set(['draft', 'active', 'suspended', 'retired']);
const DEVICE_STATUSES = new Set(['draft', 'active', 'offline', 'suspended', 'retired']);
const CONNECTOR_STATUSES = new Set(['active', 'suspended', 'retired']);
const AUDIT_ITEM_FIELDS = new Set([
  'id', 'targetKind', 'targetId', 'actorKind', 'actorRole', 'command', 'occurredAt',
]);
const AUDIT_TARGET_KINDS = new Set(['site', 'device', 'connector', 'identity', 'punch', 'batch']);
const AUDIT_ACTOR_KINDS = new Set(['membership', 'connector']);
const AUDIT_COMMAND = /^[a-z][a-z0-9_.]{1,63}$/;
const ROLE_KEY = /^[A-Z][A-Z0-9_]{2,63}$/;
const PROTOCOL_KEY = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const FORBIDDEN_RESPONSE_KEY = /(?:password|secret|token|credentialhash|tokensha|hmac|employeeid|sourceuser|biometrictemplate|rawpayload)/i;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MIN_ATTENDANCE_EVENT_MS = Date.parse('2000-01-01T00:00:00.000Z');
const MAX_FUTURE_EVENT_MS = 5 * 60 * 1000;

export class AttendanceGatewayError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'AttendanceGatewayError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new AttendanceGatewayError(code, status, message);
}

function exactObject(value, allowed, code = 'ATTENDANCE_INPUT_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, 400, 'Se esperaba un objeto JSON exacto');
  }
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) fail(code, 400, `Campo no permitido: ${extra}`);
}

function boundedText(value, field, min = 1, max = 255) {
  if (typeof value !== 'string') fail('ATTENDANCE_FIELD_INVALID', 422, `${field} debe ser texto`);
  const text = value.trim();
  if (text.length < min || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    fail('ATTENDANCE_FIELD_INVALID', 422, `${field} es inválido`);
  }
  return text;
}

function safeKey(value, field) {
  const key = boundedText(value, field, 1, 128);
  if (!SAFE_KEY.test(key)) fail('ATTENDANCE_KEY_INVALID', 422, `${field} es inválido`);
  return key;
}

function safeBatchKey(value) {
  const key = boundedText(value, 'batchKey', 1, 160);
  if (!BATCH_KEY.test(key)) fail('ATTENDANCE_KEY_INVALID', 422, 'batchKey es inválido');
  return key;
}

function databaseKey(value, field, min, max, pattern) {
  const key = boundedText(value, field, min, max).toLowerCase();
  if (!pattern.test(key)) fail('ATTENDANCE_KEY_INVALID', 422, `${field} es inválido`);
  return key;
}

function siteDeviceExternalKey(value, field = 'externalKey') {
  return databaseKey(value, field, 2, 96, SITE_DEVICE_EXTERNAL_KEY);
}

function connectorExternalKey(value, field = 'externalKey') {
  return databaseKey(value, field, 8, 128, CONNECTOR_EXTERNAL_KEY);
}

function driverKey(value, field = 'driverKey') {
  const key = databaseKey(value, field, 3, 64, SQL_DRIVER_KEY);
  if (!DRIVER_KEY.test(key)) fail('ATTENDANCE_FIELD_INVALID', 422, `${field} es inválido`);
  return key;
}

function uuid(value, field) {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID.test(id)) fail('ATTENDANCE_IDENTIFIER_INVALID', 422, `${field} es inválido`);
  return id;
}

function sha64(value, field) {
  const hash = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SHA64.test(hash)) fail('ATTENDANCE_HASH_INVALID', 422, `${field} es inválido`);
  return hash;
}

function exactVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail('ATTENDANCE_VERSION_REQUIRED', 428, 'expectedVersion es obligatorio');
  }
  return value;
}

function safeBoolean(value, field) {
  if (typeof value !== 'boolean') fail('ATTENDANCE_FIELD_INVALID', 422, `${field} debe ser booleano`);
  return value;
}

function optionalNumber(value, field, min, max) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail('ATTENDANCE_FIELD_INVALID', 422, `${field} está fuera de rango`);
  }
  return value;
}

function optionalInteger(value, field, min, max) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail('ATTENDANCE_FIELD_INVALID', 422, `${field} está fuera de rango`);
  }
  return value;
}

function optionalText(value, field, min, max) {
  return value == null ? null : boundedText(value, field, min, max);
}

function optionalProtocolKey(value) {
  if (value == null) return null;
  return databaseKey(value, 'protocolKey', 2, 64, PROTOCOL_KEY);
}

function optionalNetworkHost(value) {
  if (value == null) return null;
  const host = boundedText(value, 'networkHost', 2, 49);
  const slashIndex = host.lastIndexOf('/');
  const address = slashIndex > 0 ? host.slice(0, slashIndex) : host;
  const prefix = slashIndex > 0 ? host.slice(slashIndex + 1) : null;
  const family = isIP(address);
  if (family === 0 || (prefix != null && prefix !== (family === 4 ? '32' : '128'))) {
    fail('ATTENDANCE_FIELD_INVALID', 422, 'networkHost debe identificar una IP de host');
  }
  return host;
}

function safeTimezone(value) {
  const timezone = boundedText(value, 'timezone', 3, 64);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
    return timezone;
  } catch {
    fail('ATTENDANCE_TIMEZONE_INVALID', 422, 'timezone no es una zona IANA válida');
  }
}

function safeDate(value, field) {
  if (typeof value !== 'string' || !DATE.test(value)) {
    fail('ATTENDANCE_FIELD_INVALID', 422, `${field} debe ser una fecha ISO`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day) {
    fail('ATTENDANCE_FIELD_INVALID', 422, `${field} no es una fecha válida`);
  }
  return value;
}

function safeStatus(value) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!STATUS.test(status)) fail('ATTENDANCE_FIELD_INVALID', 422, 'status es inválido');
  return status;
}

function allowedStatus(value, allowed, field = 'status') {
  const status = safeStatus(value);
  if (!allowed.has(status)) fail('ATTENDANCE_FIELD_INVALID', 422, `${field} no pertenece al contrato`);
  return status;
}

function safeCapabilities(value) {
  exactObject(value, new Set(['pull', 'push', 'biometric', 'card', 'pin']),
    'ATTENDANCE_CAPABILITIES_INVALID');
  return {
    pull: safeBoolean(value.pull, 'capabilities.pull'),
    push: safeBoolean(value.push, 'capabilities.push'),
    biometric: safeBoolean(value.biometric, 'capabilities.biometric'),
    card: safeBoolean(value.card, 'capabilities.card'),
    pin: safeBoolean(value.pin, 'capabilities.pin'),
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function identityPepper(value) {
  const pepper = typeof value === 'string' ? value : '';
  if (Buffer.byteLength(pepper, 'utf8') < 32) {
    fail('ATTENDANCE_IDENTITY_PEPPER_REQUIRED', 503, 'Protección de identificadores no configurada');
  }
  return pepper;
}

export function attendanceIdentityHmac(tenantId, externalIdentity, pepper) {
  const normalizedTenant = uuid(tenantId, 'tenantId');
  const identity = safeKey(externalIdentity, 'sourceUserKey');
  return createHmac('sha256', identityPepper(pepper))
    .update(stableJson({ tenantId: normalizedTenant, identity }))
    .digest('hex');
}

function requireFields(value, fields) {
  const missing = fields.find((field) => !Object.hasOwn(value, field));
  if (missing) fail('ATTENDANCE_FIELD_REQUIRED', 422, `Falta ${missing}`);
}

function normalizedSiteCreate(payload) {
  exactObject(payload, new Set([
    'externalKey', 'label', 'addressText', 'timezone', 'latitude', 'longitude', 'geofenceRadiusM',
    'networkEnabled', 'removableMediaEnabled',
  ]));
  requireFields(payload, ['externalKey', 'label', 'timezone', 'networkEnabled', 'removableMediaEnabled']);
  const latitude = optionalNumber(payload.latitude, 'latitude', -90, 90);
  const longitude = optionalNumber(payload.longitude, 'longitude', -180, 180);
  if ((latitude == null) !== (longitude == null)) {
    fail('ATTENDANCE_COORDINATES_INVALID', 422, 'latitude y longitude deben informarse juntas');
  }
  const geofenceRadiusM = optionalInteger(payload.geofenceRadiusM, 'geofenceRadiusM', 10, 2000);
  if (latitude == null && geofenceRadiusM != null) {
    fail('ATTENDANCE_COORDINATES_INVALID', 422, 'La geocerca requiere latitude y longitude');
  }
  const networkEnabled = safeBoolean(payload.networkEnabled, 'networkEnabled');
  const removableMediaEnabled = safeBoolean(payload.removableMediaEnabled, 'removableMediaEnabled');
  if (!networkEnabled && !removableMediaEnabled) {
    fail('ATTENDANCE_FIELD_INVALID', 422, 'El punto requiere al menos un transporte habilitado');
  }
  return {
    externalKey: siteDeviceExternalKey(payload.externalKey),
    label: boundedText(payload.label, 'label', 2, 180),
    addressText: optionalText(payload.addressText, 'addressText', 3, 300),
    timezone: safeTimezone(payload.timezone),
    latitude,
    longitude,
    geofenceRadiusM,
    networkEnabled,
    removableMediaEnabled,
  };
}

function normalizedSiteUpdate(payload) {
  const allowed = new Set([
    'id', 'expectedVersion', 'label', 'addressText', 'timezone', 'latitude', 'longitude',
    'geofenceRadiusM', 'networkEnabled', 'removableMediaEnabled', 'status',
  ]);
  exactObject(payload, allowed);
  requireFields(payload, ['id', 'expectedVersion']);
  if (Object.keys(payload).length === 2) fail('ATTENDANCE_FIELD_REQUIRED', 422, 'No hay cambios');
  const result = { id: uuid(payload.id, 'id'), expectedVersion: exactVersion(payload.expectedVersion) };
  if (Object.hasOwn(payload, 'label')) result.label = boundedText(payload.label, 'label', 2, 180);
  if (Object.hasOwn(payload, 'addressText')) {
    result.addressText = optionalText(payload.addressText, 'addressText', 3, 300);
  }
  if (Object.hasOwn(payload, 'timezone')) result.timezone = safeTimezone(payload.timezone);
  if (Object.hasOwn(payload, 'latitude')) result.latitude = optionalNumber(payload.latitude, 'latitude', -90, 90);
  if (Object.hasOwn(payload, 'longitude')) result.longitude = optionalNumber(payload.longitude, 'longitude', -180, 180);
  if (Object.hasOwn(payload, 'latitude') !== Object.hasOwn(payload, 'longitude')) {
    fail('ATTENDANCE_COORDINATES_INVALID', 422, 'latitude y longitude deben cambiar juntas');
  }
  if (Object.hasOwn(payload, 'geofenceRadiusM')) {
    result.geofenceRadiusM = optionalInteger(payload.geofenceRadiusM, 'geofenceRadiusM', 10, 2000);
  }
  if (result.latitude == null && Object.hasOwn(result, 'latitude')
      && (!Object.hasOwn(result, 'geofenceRadiusM') || result.geofenceRadiusM != null)) {
    fail('ATTENDANCE_COORDINATES_INVALID', 422, 'Al quitar coordenadas también debe quitarse la geocerca');
  }
  for (const key of ['networkEnabled', 'removableMediaEnabled']) {
    if (Object.hasOwn(payload, key)) result[key] = safeBoolean(payload[key], key);
  }
  if (result.networkEnabled === false && result.removableMediaEnabled === false) {
    fail('ATTENDANCE_FIELD_INVALID', 422, 'El punto requiere al menos un transporte habilitado');
  }
  if (Object.hasOwn(payload, 'status')) result.status = allowedStatus(payload.status, SITE_STATUSES);
  return result;
}

function normalizedDeviceCreate(payload) {
  exactObject(payload, new Set([
    'siteId', 'externalKey', 'vendorKey', 'model', 'transport', 'driverKey',
    'timezone', 'capabilities', 'serialNumber', 'firmwareVersion', 'protocolKey',
    'networkHost', 'networkPort',
  ]));
  requireFields(payload, [
    'siteId', 'externalKey', 'vendorKey', 'model', 'transport', 'driverKey',
    'timezone', 'capabilities',
  ]);
  const transport = safeStatus(payload.transport);
  if (!DEVICE_TRANSPORTS.has(transport)) {
    if (transport === 'simulator') {
      fail('ATTENDANCE_SIMULATOR_FORBIDDEN', 422, 'El simulador no puede persistirse como reloj');
    }
    fail('ATTENDANCE_FIELD_INVALID', 422, 'transport no pertenece al contrato');
  }
  const normalizedDriverKey = driverKey(payload.driverKey);
  if (normalizedDriverKey === 'simulator') {
    fail('ATTENDANCE_SIMULATOR_FORBIDDEN', 422, 'El simulador no puede persistirse como driver');
  }
  return {
    siteId: uuid(payload.siteId, 'siteId'),
    externalKey: siteDeviceExternalKey(payload.externalKey),
    vendorKey: databaseKey(payload.vendorKey, 'vendorKey', 2, 64, VENDOR_KEY),
    model: boundedText(payload.model, 'model', 1, 120),
    transport,
    driverKey: normalizedDriverKey,
    timezone: safeTimezone(payload.timezone),
    capabilities: safeCapabilities(payload.capabilities),
    serialNumber: optionalText(payload.serialNumber, 'serialNumber', 1, 128),
    firmwareVersion: optionalText(payload.firmwareVersion, 'firmwareVersion', 1, 120),
    protocolKey: optionalProtocolKey(payload.protocolKey),
    networkHost: optionalNetworkHost(payload.networkHost),
    networkPort: optionalInteger(payload.networkPort, 'networkPort', 1, 65535),
  };
}

function normalizedDeviceUpdate(payload) {
  exactObject(payload, new Set([
    'id', 'expectedVersion', 'siteId', 'vendorKey', 'model', 'transport', 'driverKey',
    'timezone', 'capabilities', 'status', 'serialNumber', 'firmwareVersion',
    'protocolKey', 'networkHost', 'networkPort',
  ]));
  requireFields(payload, ['id', 'expectedVersion']);
  if (Object.keys(payload).length === 2) fail('ATTENDANCE_FIELD_REQUIRED', 422, 'No hay cambios');
  const result = { id: uuid(payload.id, 'id'), expectedVersion: exactVersion(payload.expectedVersion) };
  if (Object.hasOwn(payload, 'siteId')) result.siteId = uuid(payload.siteId, 'siteId');
  if (Object.hasOwn(payload, 'vendorKey')) {
    result.vendorKey = databaseKey(payload.vendorKey, 'vendorKey', 2, 64, VENDOR_KEY);
  }
  if (Object.hasOwn(payload, 'model')) result.model = boundedText(payload.model, 'model', 1, 120);
  if (Object.hasOwn(payload, 'transport')) {
    result.transport = safeStatus(payload.transport);
    if (!DEVICE_TRANSPORTS.has(result.transport)) {
      if (result.transport === 'simulator') {
        fail('ATTENDANCE_SIMULATOR_FORBIDDEN', 422, 'El simulador no puede persistirse como reloj');
      }
      fail('ATTENDANCE_FIELD_INVALID', 422, 'transport no pertenece al contrato');
    }
  }
  if (Object.hasOwn(payload, 'driverKey')) {
    result.driverKey = driverKey(payload.driverKey);
    if (result.driverKey === 'simulator') {
      fail('ATTENDANCE_SIMULATOR_FORBIDDEN', 422, 'El simulador no puede persistirse como driver');
    }
  }
  if (Object.hasOwn(payload, 'timezone')) result.timezone = safeTimezone(payload.timezone);
  if (Object.hasOwn(payload, 'capabilities')) result.capabilities = safeCapabilities(payload.capabilities);
  if (Object.hasOwn(payload, 'status')) result.status = allowedStatus(payload.status, DEVICE_STATUSES);
  if (Object.hasOwn(payload, 'serialNumber')) {
    result.serialNumber = optionalText(payload.serialNumber, 'serialNumber', 1, 128);
  }
  if (Object.hasOwn(payload, 'firmwareVersion')) {
    result.firmwareVersion = optionalText(payload.firmwareVersion, 'firmwareVersion', 1, 120);
  }
  if (Object.hasOwn(payload, 'protocolKey')) result.protocolKey = optionalProtocolKey(payload.protocolKey);
  if (Object.hasOwn(payload, 'networkHost')) result.networkHost = optionalNetworkHost(payload.networkHost);
  if (Object.hasOwn(payload, 'networkPort')) {
    result.networkPort = optionalInteger(payload.networkPort, 'networkPort', 1, 65535);
  }
  return result;
}

function normalizedConnector(command, payload) {
  if (command === 'connector.create') {
    exactObject(payload, new Set(['deviceId', 'externalKey', 'driverKey', 'tokenSha256']));
    requireFields(payload, ['deviceId', 'externalKey', 'driverKey', 'tokenSha256']);
    const normalizedDriverKey = driverKey(payload.driverKey);
    if (normalizedDriverKey === 'simulator') {
      fail('ATTENDANCE_SIMULATOR_FORBIDDEN', 422, 'El simulador no puede persistirse como driver');
    }
    return {
      deviceId: uuid(payload.deviceId, 'deviceId'),
      externalKey: connectorExternalKey(payload.externalKey),
      driverKey: normalizedDriverKey,
      tokenSha256: sha64(payload.tokenSha256, 'tokenSha256'),
    };
  }
  const allowed = command === 'connector.rotate_token'
    ? new Set(['id', 'expectedVersion', 'tokenSha256'])
    : new Set(['id', 'expectedVersion', 'status']);
  exactObject(payload, allowed);
  requireFields(payload, [...allowed]);
  return command === 'connector.rotate_token'
    ? { id: uuid(payload.id, 'id'), expectedVersion: exactVersion(payload.expectedVersion), tokenSha256: sha64(payload.tokenSha256, 'tokenSha256') }
    : { id: uuid(payload.id, 'id'), expectedVersion: exactVersion(payload.expectedVersion), status: allowedStatus(payload.status, CONNECTOR_STATUSES) };
}

function normalizedIdentity(command, payload, context) {
  if (command === 'identity.create') {
    exactObject(payload, new Set([
      'deviceId', 'sourceUserKey', 'employmentContractId', 'validFrom', 'validTo',
    ]));
    requireFields(payload, ['deviceId', 'sourceUserKey', 'employmentContractId', 'validFrom']);
    const validFrom = safeDate(payload.validFrom, 'validFrom');
    const validTo = payload.validTo == null ? null : safeDate(payload.validTo, 'validTo');
    if (validTo && validTo < validFrom) fail('ATTENDANCE_FIELD_INVALID', 422, 'validTo precede a validFrom');
    return {
      deviceId: uuid(payload.deviceId, 'deviceId'),
      identityHmacSha256: attendanceIdentityHmac(
        context.tenantId, payload.sourceUserKey, context.identityPepper,
      ),
      employmentContractId: uuid(payload.employmentContractId, 'employmentContractId'),
      validFrom,
      validTo,
    };
  }
  exactObject(payload, new Set(['id', 'expectedVersion']));
  requireFields(payload, ['id', 'expectedVersion']);
  return { id: uuid(payload.id, 'id'), expectedVersion: exactVersion(payload.expectedVersion) };
}

function normalizedPunch(command, payload) {
  const fields = command === 'punch.link_identity'
    ? new Set(['id', 'expectedVersion', 'identityMapId'])
    : new Set(['id', 'expectedVersion', 'reasonCode']);
  exactObject(payload, fields);
  requireFields(payload, [...fields]);
  const result = { id: uuid(payload.id, 'id'), expectedVersion: exactVersion(payload.expectedVersion) };
  if (command === 'punch.link_identity') result.identityMapId = uuid(payload.identityMapId, 'identityMapId');
  else {
    const reasonCode = boundedText(payload.reasonCode, 'reasonCode', 3, 64).toLowerCase();
    if (!REVIEW_REASON.test(reasonCode)) {
      fail('ATTENDANCE_FIELD_INVALID', 422, 'reasonCode no pertenece al contrato');
    }
    result.reasonCode = reasonCode;
  }
  return result;
}

export function normalizeAttendanceCommand(body, context = {}) {
  exactObject(body, new Set(['command', 'payload']), 'ATTENDANCE_COMMAND_INVALID');
  const command = typeof body.command === 'string' ? body.command.trim().toLowerCase() : '';
  if (!COMMANDS.has(command)) fail('ATTENDANCE_COMMAND_INVALID', 400, 'Comando no permitido');
  let payload;
  if (command === 'site.create') payload = normalizedSiteCreate(body.payload);
  else if (command === 'site.update') payload = normalizedSiteUpdate(body.payload);
  else if (command === 'device.create') payload = normalizedDeviceCreate(body.payload);
  else if (command === 'device.update') payload = normalizedDeviceUpdate(body.payload);
  else if (command.startsWith('connector.')) payload = normalizedConnector(command, body.payload);
  else if (command.startsWith('identity.')) payload = normalizedIdentity(command, body.payload, context);
  else payload = normalizedPunch(command, body.payload);
  return Object.freeze({ command, payload: Object.freeze(payload) });
}

function rows(result) {
  return Array.isArray(result) ? result : (Array.isArray(result?.rows) ? result.rows : []);
}

async function query(sql, statement, values) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  return rows(await sql.query(statement, values));
}

function mappedSqlError(error) {
  const text = String(error?.message || '');
  const definitions = [
    ['ATTENDANCE_SIMULATOR_FORBIDDEN', 422, 'El simulador está limitado a pruebas locales'],
    ['ATTENDANCE_BATCH_IDEMPOTENCY_REUSED', 409, 'La clave del lote ya fue utilizada con otro contenido'],
    ['ATTENDANCE_IDEMPOTENCY_REUSED', 409, 'La clave de idempotencia ya fue utilizada'],
    ['ATTENDANCE_VERSION_CONFLICT', 409, 'El registro fue modificado por otra persona'],
    ['ATTENDANCE_EVENT_IDEMPOTENCY_CONFLICT', 409, 'Un evento de origen reapareció con contenido diferente'],
    ['ATTENDANCE_EVENT_DUPLICATED_IN_BATCH', 409, 'El lote repite una identidad de evento'],
    ['ATTENDANCE_INGEST_CONTEXT_MISMATCH', 409, 'El lote no coincide con el conector registrado'],
    ['ATTENDANCE_SEPARATION_OF_DUTIES', 409, 'La operación viola la separación de responsabilidades'],
    ['ATTENDANCE_ROLE_SOD_CONFLICT', 409, 'El perfil combina responsabilidades incompatibles'],
    ['ATTENDANCE_SOD_CONFLICT', 409, 'La operación combina responsabilidades incompatibles'],
    ['ATTENDANCE_CONNECTOR_AUTH_INVALID', 401, 'Conector no autorizado'],
    ['ATTENDANCE_CONNECTOR_CONTEXT_MISMATCH', 409, 'El lote no coincide con el conector registrado'],
    ['ATTENDANCE_EVENT_CONFLICT', 409, 'Un evento de origen reapareció con contenido diferente'],
    ['ATTENDANCE_CONNECTOR_BUSY', 409, 'El conector está procesando otro lote'],
    ['ATTENDANCE_DEVICE_INACTIVE', 409, 'El reloj no está activo para recibir marcaciones'],
    ['ATTENDANCE_SITE_INACTIVE', 409, 'El punto de marcación no está activo'],
    ['ATTENDANCE_CONNECTOR_DEVICE_INVALID', 409, 'El conector no coincide con el reloj configurado'],
    ['ATTENDANCE_CONNECTOR_TOKEN_INVALID', 422, 'El nuevo token del conector no es válido'],
    ['ATTENDANCE_IDENTITY_CONTRACT_INVALID', 409, 'El vínculo laboral no pertenece a la fuente municipal certificada'],
    ['ATTENDANCE_PUNCH_STATE_INVALID', 409, 'La marcación no admite esa transición en su estado actual'],
    ['ATTENDANCE_PUNCH_MAPPING_TRANSITION_INVALID', 409, 'La reconciliación de la marcación no admite esa transición'],
    ['ATTENDANCE_PUNCH_MAPPING_IMMUTABLE', 409, 'La vinculación de la marcación ya no puede modificarse'],
    ['ATTENDANCE_REVIEW_REASON_INVALID', 422, 'El motivo de revisión no cumple el contrato'],
    ['TENANT_IAM_SOD_CONFLICT', 409, 'La membresía combina responsabilidades incompatibles'],
    ['ATTENDANCE_CAPABILITY_REQUIRED', 403, 'No posee la capacidad requerida'],
    ['ATTENDANCE_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad operativa'],
    ['ATTENDANCE_EMPLOYMENT_REQUIRED', 403, 'La membresía no posee vínculo laboral vigente'],
    ['ATTENDANCE_PUNCH_MAPPING_REQUIRED', 409, 'La marcación debe estar vinculada antes de aceptarse'],
    ['ATTENDANCE_PUNCH_REVIEW_TERMINAL', 409, 'La marcación ya tiene una decisión final'],
    ['ATTENDANCE_IDENTITY_OVERLAP', 409, 'La vigencia de la identidad se superpone con otra vinculación'],
    ['ATTENDANCE_NOT_FOUND', 404, 'Registro de asistencia no encontrado'],
    ['ATTENDANCE_SITE_NOT_FOUND', 404, 'Punto de marcación no encontrado'],
    ['ATTENDANCE_DEVICE_NOT_FOUND', 404, 'Reloj no encontrado'],
    ['ATTENDANCE_CONNECTOR_NOT_FOUND', 404, 'Conector no encontrado'],
    ['ATTENDANCE_IDENTITY_NOT_FOUND', 404, 'Vinculación de identidad no encontrada'],
    ['ATTENDANCE_PUNCH_NOT_FOUND', 404, 'Marcación no encontrada'],
    ['ATTENDANCE_TARGET_NOT_FOUND', 404, 'El registro objetivo ya no existe'],
    ['ATTENDANCE_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
    ['ATTENDANCE_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ['TIME_SOURCE_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
    ['TIME_SOURCE_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ['ATTENDANCE_RELEASE_NOT_CERTIFIED', 503, 'La versión desplegada no está certificada'],
    ['ATTENDANCE_BINDING_REQUIRED', 503, 'El binding municipal certificado no está disponible'],
    ['TIME_SOURCE_RELEASE_NOT_CERTIFIED', 503, 'La versión desplegada no está certificada'],
    ['TIME_SOURCE_BINDING_REQUIRED', 503, 'El binding municipal certificado no está disponible'],
    ['ATTENDANCE_INGEST_INVALID', 400, 'El lote no cumple el contrato de ingesta'],
    ['ATTENDANCE_EVENT_INVALID', 422, 'El lote contiene una marcación inválida'],
    ['ATTENDANCE_SOURCE_VERIFICATION_REJECTED', 409,
      'El reloj rechazó la autenticación; el evento sólo puede quedar en revisión'],
    ['ATTENDANCE_SITE_PAYLOAD_INVALID', 422, 'Los datos del punto son inválidos'],
    ['ATTENDANCE_DEVICE_PAYLOAD_INVALID', 422, 'Los datos del reloj son inválidos'],
    ['ATTENDANCE_CONNECTOR_PAYLOAD_INVALID', 422, 'Los datos del conector son inválidos'],
    ['ATTENDANCE_IDENTITY_PAYLOAD_INVALID', 422, 'Los datos de vinculación son inválidos'],
    ['ATTENDANCE_PUNCH_PAYLOAD_INVALID', 422, 'Los datos de revisión son inválidos'],
    ['ATTENDANCE_TARGET_INVALID', 400, 'El tipo de registro de asistencia es inválido'],
    ['ATTENDANCE_LIST_INVALID', 400, 'El listado solicitado es inválido'],
    ['ATTENDANCE_COMMAND_INVALID', 400, 'La operación de asistencia es inválida'],
    ['ATTENDANCE_APPEND_ONLY', 409, 'La auditoría de asistencia es inmutable'],
    ['ATTENDANCE_IDENTITY_IMMUTABLE', 409, 'La vinculación de identidad no admite esa modificación'],
    ['ATTENDANCE_PUNCH_FACT_IMMUTABLE', 409, 'El hecho de marcación es inmutable'],
    ['ATTENDANCE_PUNCH_DELETE_FORBIDDEN', 409, 'La marcación no puede eliminarse'],
    ['ATTENDANCE_PUNCH_VERSION_INVALID', 409, 'La versión de la marcación es inválida'],
    ['ATTENDANCE_ROLE_CONTRACT_DRIFT', 503, 'El contrato de roles de asistencia no está certificado'],
    ['ATTENDANCE_INPUT_INVALID', 400, 'La operación de asistencia es inválida'],
  ];
  for (const [code, status, message] of definitions) {
    if (text.includes(code)) return new AttendanceGatewayError(code, status, message);
  }
  return error;
}

function identityCoordinates(identityPrincipal, session) {
  const email = String(identityPrincipal?.user?.email || '').trim().toLowerCase();
  const tenantId = String(identityPrincipal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(identityPrincipal?.tenant?.membershipId || '').trim().toLowerCase();
  const sessionId = String(session?.id || '').trim().toLowerCase();
  const sessionVersion = Number(session?.version);
  const releaseSha = String(session?.releaseSha || '').trim().toLowerCase();
  if (!email || identityPrincipal?.tenant?.source !== 'membership'
      || !UUID.test(tenantId) || !UUID.test(membershipId) || !UUID.test(sessionId)
      || !Number.isSafeInteger(sessionVersion) || sessionVersion < 1
      || !/^[a-f0-9]{40}$/.test(releaseSha)
      || String(session?.email || '').trim().toLowerCase() !== email) {
    fail('ATTENDANCE_SESSION_INVALID', 401, 'La sesión operativa ya no es válida');
  }
  return Object.freeze({ email, tenantId, membershipId, sessionId, sessionVersion, releaseSha });
}

async function facade(sql, functionName, values, casts) {
  try {
    const placeholders = casts.map((cast, index) => `$${index + 1}${cast ? `::${cast}` : ''}`).join(', ');
    const result = await query(sql, `SELECT ${functionName}(${placeholders}) AS result`, values);
    const envelope = result[0]?.result;
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      fail('ATTENDANCE_UNAVAILABLE', 503, 'Gateway de asistencia no disponible');
    }
    return envelope;
  } catch (error) {
    throw mappedSqlError(error);
  }
}

function assertNoSensitiveResponse(value, path = 'response') {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_RESPONSE_BYTES) {
    fail('ATTENDANCE_CONTRACT_DRIFT', 503, 'Respuesta de asistencia fuera de límite');
  }
  const visit = (node, current) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_RESPONSE_KEY.test(key)) {
        fail('ATTENDANCE_CONTRACT_DRIFT', 503, `Respuesta contiene un campo privado en ${current}`);
      }
      visit(child, `${current}.${key}`);
    }
  };
  visit(value, path);
}

function publicPrincipal(value, identityPrincipal) {
  const tenantId = String(value?.tenantId || '').toLowerCase();
  const membershipId = String(value?.membershipId || '').toLowerCase();
  if (!UUID.test(tenantId) || !UUID.test(membershipId)
      || tenantId !== String(identityPrincipal?.tenant?.id || '').toLowerCase()
      || membershipId !== String(identityPrincipal?.tenant?.membershipId || '').toLowerCase()) {
    fail('ATTENDANCE_CONTRACT_DRIFT', 503, 'Principal de asistencia fuera de contrato');
  }
  return { tenantId, membershipId, roleKey: String(value?.roleKey || '') };
}

function nonNegativeCount(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('ATTENDANCE_CONTRACT_DRIFT', 503, `${field} fuera de contrato`);
  }
  return value;
}

function assertExactResponseObject(value, fields, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ATTENDANCE_CONTRACT_DRIFT', 503, `${path} no es un objeto de contrato`);
  }
  const keys = Object.keys(value);
  if (keys.length !== fields.size || keys.some((key) => !fields.has(key))) {
    fail('ATTENDANCE_CONTRACT_DRIFT', 503, `${path} contiene campos fuera de contrato`);
  }
}

function assertAuditItems(items) {
  for (const [index, item] of items.entries()) {
    const path = `list.audit[${index}]`;
    assertExactResponseObject(item, AUDIT_ITEM_FIELDS, path);
    if (!UUID.test(String(item.id || '')) || !UUID.test(String(item.targetId || ''))
        || !AUDIT_TARGET_KINDS.has(item.targetKind)
        || !AUDIT_ACTOR_KINDS.has(item.actorKind)
        || typeof item.command !== 'string' || !AUDIT_COMMAND.test(item.command)
        || typeof item.occurredAt !== 'string' || !Number.isFinite(Date.parse(item.occurredAt))) {
      fail('ATTENDANCE_CONTRACT_DRIFT', 503, `${path} no cumple el contrato`);
    }
    if (item.actorKind === 'connector') {
      if (item.actorRole !== null) {
        fail('ATTENDANCE_CONTRACT_DRIFT', 503, `${path}.actorRole debe ser nulo`);
      }
    } else if (typeof item.actorRole !== 'string' || !ROLE_KEY.test(item.actorRole)) {
      fail('ATTENDANCE_CONTRACT_DRIFT', 503, `${path}.actorRole no cumple el contrato`);
    }
  }
}

export async function getAttendanceBootstrap(sql, identityPrincipal, session) {
  const coordinates = identityCoordinates(identityPrincipal, session);
  const envelope = await facade(sql, 'attendance_gateway_bootstrap_v1', [
    coordinates.email, coordinates.sessionId, coordinates.sessionVersion,
    coordinates.releaseSha, coordinates.tenantId, coordinates.membershipId,
  ], ['', 'uuid', 'integer', '', 'uuid', 'uuid']);
  const principal = publicPrincipal(envelope.principal, identityPrincipal);
  const capabilities = Array.isArray(envelope.capabilities)
    ? [...new Set(envelope.capabilities.map(String).filter((item) => item.startsWith('attendance.')))].sort()
    : [];
  const summary = Object.fromEntries([
    'siteCount', 'deviceCount', 'connectorCount', 'activeConnectorCount',
    'rawEventCount', 'punchCount', 'unmatchedPunchCount', 'pendingReviewCount',
  ].map((key) => [key, nonNegativeCount(envelope.summary?.[key], key)]));
  const features = {
    hardwareConnected: envelope.features?.hardwareConnected === true,
    hoursCalculated: false,
    payrollPosted: false,
    biometricTemplatesStored: false,
  };
  if (!Array.isArray(envelope.timezones)) {
    fail('ATTENDANCE_CONTRACT_DRIFT', 503, 'Zonas horarias de asistencia fuera de contrato');
  }
  const timezones = [...new Set(envelope.timezones.map((value) => safeTimezone(value)))].sort();
  return {
    principal,
    contract: {
      version: ATTENDANCE_GATEWAY_CONTRACT_VERSION,
      timezones,
      resources: ATTENDANCE_RESOURCES,
      biometricTemplatesStored: false,
    },
    capabilities,
    summary,
    features,
  };
}

function pageNumber(value, field, fallback, max) {
  if (value == null || value === '') return fallback;
  const text = String(value).trim();
  if (!/^[1-9]\d*$/.test(text)) fail('ATTENDANCE_PAGINATION_INVALID', 400, `${field} es inválido`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number > max) {
    fail('ATTENDANCE_PAGINATION_INVALID', 400, `${field} fuera de rango`);
  }
  return number;
}

export async function listAttendanceResources(sql, identityPrincipal, options, session) {
  const resource = typeof options?.resource === 'string' ? options.resource.trim().toLowerCase() : '';
  if (!RESOURCES.has(resource)) fail('ATTENDANCE_RESOURCE_INVALID', 400, 'resource no soportado');
  const page = pageNumber(options?.page, 'page', 1, 500);
  const pageSize = pageNumber(options?.pageSize, 'pageSize', 25, 100);
  const coordinates = identityCoordinates(identityPrincipal, session);
  const envelope = await facade(sql, 'attendance_gateway_list_v1', [
    coordinates.email, coordinates.sessionId, coordinates.sessionVersion,
    coordinates.releaseSha, coordinates.tenantId, coordinates.membershipId,
    resource, page, pageSize,
  ], ['', 'uuid', 'integer', '', 'uuid', 'uuid', '', 'integer', 'integer']);
  if (envelope.resource !== resource || envelope.page !== page
      || envelope.pageSize !== pageSize || !Array.isArray(envelope.items)) {
    fail('ATTENDANCE_CONTRACT_DRIFT', 503, 'Listado de asistencia fuera de contrato');
  }
  assertNoSensitiveResponse(envelope.items, `list.${resource}`);
  if (resource === 'audit') assertAuditItems(envelope.items);
  const total = nonNegativeCount(envelope.total, 'total');
  return {
    resource,
    data: envelope.items,
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
  };
}

export async function applyAttendanceCommand(
  sql, identityPrincipal, session, body, idempotencyKey, options = {},
) {
  const coordinates = identityCoordinates(identityPrincipal, session);
  const normalized = normalizeAttendanceCommand(body, {
    tenantId: coordinates.tenantId,
    identityPepper: options.identityPepper,
  });
  const key = uuid(idempotencyKey, 'Idempotency-Key');
  const commandHash = sha256(stableJson({
    tenantId: coordinates.tenantId,
    membershipId: coordinates.membershipId,
    command: normalized.command,
    payload: normalized.payload,
  }));
  const envelope = await facade(sql, 'attendance_gateway_apply_command_v1', [
    coordinates.email, coordinates.sessionId, coordinates.sessionVersion,
    coordinates.releaseSha, coordinates.tenantId, coordinates.membershipId,
    normalized.command, key, commandHash, JSON.stringify(normalized.payload),
  ], ['', 'uuid', 'integer', '', 'uuid', 'uuid', '', 'uuid', '', 'jsonb']);
  const result = envelope.data && typeof envelope.data === 'object' ? envelope.data : envelope;
  assertNoSensitiveResponse(result, 'command.result');
  return { data: result, replayed: envelope.replayed === true };
}

export function createDefaultAttendanceDriverRegistry(options = {}) {
  const drivers = [
    createCsvGenericTimeDeviceDriver(),
    createLegacyRel000FixedWidthDriver(),
  ];
  if (options.includeSimulatorForTests === true) {
    drivers.unshift(createSimulatorTimeDeviceDriver());
  }
  return createTimeDeviceDriverRegistry(drivers);
}

function mappedMethod(credentialType) {
  if (credentialType === 'biometric') return 'fingerprint';
  if (['card', 'pin'].includes(credentialType)) return credentialType;
  return 'unknown';
}

function mappedDirection(punchType) {
  if (punchType === 'check_in') return 'in';
  if (punchType === 'check_out') return 'out';
  return 'unknown';
}

function attendanceIngestNow(options) {
  if (options.now == null) return Date.now();
  const instant = options.now instanceof Date ? options.now.getTime() : options.now;
  if (!Number.isFinite(instant)) fail('ATTENDANCE_INGEST_INVALID', 400, 'Reloj de ingesta inválido');
  return instant;
}

export function normalizeAttendanceIngestRequest(body, options = {}) {
  exactObject(body, new Set([
    'contractVersion', 'tenantId', 'connectorKey', 'driverKey', 'transport',
    'deviceExternalKey', 'siteExternalKey', 'timezone', 'utcOffsetMinutes',
    'batchKey', 'payload',
  ]), 'ATTENDANCE_INGEST_INVALID');
  requireFields(body, [
    'contractVersion', 'tenantId', 'connectorKey', 'driverKey', 'transport',
    'deviceExternalKey', 'siteExternalKey', 'timezone', 'utcOffsetMinutes',
    'batchKey', 'payload',
  ]);
  if (body.contractVersion !== ATTENDANCE_INGEST_CONTRACT_VERSION) {
    fail('ATTENDANCE_INGEST_VERSION_INVALID', 400, 'Versión de ingesta no soportada');
  }
  const tenantId = uuid(body.tenantId, 'tenantId');
  const connectorKey = connectorExternalKey(body.connectorKey, 'connectorKey');
  const normalizedDriverKey = driverKey(body.driverKey);
  const transport = String(body.transport || '').trim().toLowerCase();
  if (!TRANSPORTS.has(transport)) fail('ATTENDANCE_FIELD_INVALID', 422, 'transport debe ser pull o push');
  const deviceExternalKey = siteDeviceExternalKey(body.deviceExternalKey, 'deviceExternalKey');
  const siteExternalKey = siteDeviceExternalKey(body.siteExternalKey, 'siteExternalKey');
  const timezone = safeTimezone(body.timezone);
  if (!Number.isSafeInteger(body.utcOffsetMinutes)
      || body.utcOffsetMinutes < -840 || body.utcOffsetMinutes > 840) {
    fail('ATTENDANCE_FIELD_INVALID', 422, 'utcOffsetMinutes está fuera de rango');
  }
  const batchKey = safeBatchKey(body.batchKey);
  const registry = options.registry ?? createDefaultAttendanceDriverRegistry();
  const normalized = registry.ingest({
    driverId: normalizedDriverKey,
    transport,
    payload: body.payload,
    context: {
      tenantId,
      sourceId: connectorKey,
      deviceId: deviceExternalKey,
      pointId: siteExternalKey,
      timezone,
      utcOffsetMinutes: body.utcOffsetMinutes,
    },
  });
  if (normalized.events.length < 1 || normalized.events.length > 5000) {
    fail('ATTENDANCE_INGEST_EVENT_COUNT_INVALID', 422, 'El lote debe contener entre 1 y 5000 eventos');
  }
  const pepper = identityPepper(options.identityPepper);
  const latestAllowedEventMs = attendanceIngestNow(options) + MAX_FUTURE_EVENT_MS;
  const events = normalized.events.map((event) => {
    const eventMs = Date.parse(event.occurredAtUtc);
    if (!Number.isFinite(eventMs) || eventMs < MIN_ATTENDANCE_EVENT_MS
        || eventMs > latestAllowedEventMs) {
      fail('ATTENDANCE_EVENT_INVALID', 422, 'El lote contiene una marcación fuera del período admitido');
    }
    const projected = {
      eventKey: event.idempotencyKey,
      identityHmacSha256: attendanceIdentityHmac(tenantId, event.employeeId, pepper),
      occurredAt: event.occurredAtUtc,
      method: mappedMethod(event.credentialType),
      direction: mappedDirection(event.punchType),
      verificationResult: event.verificationResult,
    };
    return Object.freeze({ ...projected, eventSha256: sha256(stableJson(projected)) });
  });
  const envelope = Object.freeze({
    tenantId,
    driverKey: normalizedDriverKey,
    transport,
    deviceExternalKey,
    siteExternalKey,
    timezone,
    events: Object.freeze(events),
  });
  return Object.freeze({
    connectorKey,
    batchKey,
    payloadSha256: sha256(stableJson(envelope)),
    envelope,
    driver: normalized.driver,
    receivedCount: normalized.receivedCount,
    duplicateCount: normalized.duplicateCount,
  });
}

export async function ingestAttendanceBatch(sql, normalized, tokenSha256, releaseSha) {
  const connectorKey = connectorExternalKey(normalized?.connectorKey, 'connectorKey');
  const tokenHash = sha64(tokenSha256, 'tokenSha256');
  const batchKey = safeBatchKey(normalized?.batchKey);
  const payloadHash = sha64(normalized?.payloadSha256, 'payloadSha256');
  const sha = typeof releaseSha === 'string' ? releaseSha.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    fail('ATTENDANCE_RELEASE_NOT_CERTIFIED', 503, 'La versión desplegada no está certificada');
  }
  const envelope = await facade(sql, 'attendance_gateway_ingest_v1', [
    connectorKey, tokenHash, batchKey, payloadHash,
    JSON.stringify(normalized.envelope), sha,
  ], ['', '', '', '', 'jsonb', '']);
  assertExactResponseObject(envelope, new Set([
    'batchId', 'status', 'acceptedCount', 'duplicateCount', 'unmappedCount',
    'ambiguousCount', 'replayed',
  ]), 'ingest.receipt');
  if (!UUID.test(String(envelope.batchId || '')) || envelope.status !== 'accepted') {
    fail('ATTENDANCE_CONTRACT_DRIFT', 503, 'Recibo de ingesta fuera de contrato');
  }
  const result = {
    batchId: String(envelope.batchId).toLowerCase(),
    status: envelope.status,
    acceptedCount: nonNegativeCount(envelope.acceptedCount, 'acceptedCount'),
    duplicateCount: nonNegativeCount(envelope.duplicateCount, 'duplicateCount'),
    unmappedCount: nonNegativeCount(envelope.unmappedCount, 'unmappedCount'),
    ambiguousCount: nonNegativeCount(envelope.ambiguousCount, 'ambiguousCount'),
    replayed: envelope.replayed,
  };
  if (typeof result.replayed !== 'boolean'
      || result.unmappedCount + result.ambiguousCount > result.acceptedCount) {
    fail('ATTENDANCE_CONTRACT_DRIFT', 503, 'Recibo de ingesta fuera de contrato');
  }
  return Object.freeze(result);
}

export function attendanceBearerTokenSha256(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (token.length < 32 || token.length > 512 || /\s/.test(token)) {
    fail('ATTENDANCE_CONNECTOR_AUTH_INVALID', 401, 'Conector no autorizado');
  }
  return sha256(token);
}
