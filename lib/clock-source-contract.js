import { createHash } from 'node:crypto';
import { validateZk40Payload } from './internal-zk40-reception.js';

export const CLOCK_SOURCE_ORIGIN = 'https://municipio-junin-friendly.vercel.app';
export const CLOCK_SOURCE_MAX_BODY = 40000;
export const sourceHash = value => createHash('sha256').update(value).digest('hex');
export const sourceUuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value) && value !== '00000000-0000-0000-0000-000000000000';
export const sourceHex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const exactSourceKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join();
export function sourceTimestamp(value) {
  if (typeof value !== 'string' || !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(value)) return false;
  const millis = value.replace(/(\.\d{3})\d*Z$/, '$1Z');
  return Number.isFinite(Date.parse(millis)) && new Date(millis).toISOString() === millis;
}
const errors = {
  CLOCK_SOURCE_NOT_CONFIGURED: [503, 'La consulta de los relojes todavía no está habilitada.'],
  CLOCK_SOURCE_UNAVAILABLE: [503, 'No se pudo comprobar el almacenamiento de los relojes. Volvé a intentar.'],
  CLOCK_SOURCE_AUTH_DENIED: [401, 'La credencial del reloj no está habilitada.'],
  CLOCK_SOURCE_FORBIDDEN: [403, 'No tenés acceso a esta consulta.'],
  CLOCK_SOURCE_ORIGIN_DENIED: [403, 'La solicitud no proviene de una ubicación permitida.'],
  CLOCK_SOURCE_PAYLOAD_INVALID: [400, 'El envío no cumple el formato de recepción.'],
  CLOCK_SOURCE_QUERY_INVALID: [400, 'La consulta no es válida.'],
  CLOCK_SOURCE_BODY_TOO_LARGE: [413, 'El envío supera el tamaño permitido.'],
  CLOCK_SOURCE_IDEMPOTENCY_CONFLICT: [409, 'El envío requiere revisión. Se conserva la copia local.'],
  CLOCK_SOURCE_BATCH_INTEGRITY_INVALID: [409, 'No se pudo verificar el lote completo. Se conserva la copia local.'],
  CLOCK_SOURCE_BUSY: [409, 'La recepción está ocupada. Se conserva la copia local.'],
  CLOCK_SOURCE_CAPACITY_LIMIT: [503, 'El almacenamiento necesita revisión antes de recibir más marcaciones.'],
  CLOCK_SOURCE_BINDING_CHANGED: [409, 'Cambió la fuente autorizada. Actualizá la consulta.'],
  CLOCK_SOURCE_SNAPSHOT_CHANGED: [409, 'Cambió la información consultada. Volvé a actualizar.'],
  CLOCK_SOURCE_RECEIPT_INVALID: [502, 'No se pudo verificar la confirmación del envío.'],
  CLOCK_SOURCE_RESPONSE_INVALID: [502, 'No se pudo verificar la información de los relojes.'],
  METHOD_NOT_ALLOWED: [405, 'La operación solicitada no está permitida.'],
};
export class ClockSourceError extends Error {
  constructor(code) { super((errors[code] || errors.CLOCK_SOURCE_UNAVAILABLE)[1]); this.code = code; this.status = (errors[code] || errors.CLOCK_SOURCE_UNAVAILABLE)[0]; }
}
export function sourceFail(code) { throw new ClockSourceError(code); }
export function safeSourceError(error) {
  if (error instanceof ClockSourceError) return error;
  // Never copy provider messages (which can contain SQL or connection details).
  for (const code of Object.keys(errors)) if (new RegExp(`\\b${code}\\b`).test(String(error?.message || ''))) return new ClockSourceError(code);
  return new ClockSourceError('CLOCK_SOURCE_UNAVAILABLE');
}
export function validateSourcePayload(value) {
  try { validateZk40Payload(value); } catch { sourceFail('CLOCK_SOURCE_PAYLOAD_INVALID'); }
  if (Date.parse(value.capturedAt) > Date.now() + 300000) sourceFail('CLOCK_SOURCE_PAYLOAD_INVALID');
  return value;
}
export function assertSourceReceipt(value, payload) {
  if (!exactSourceKeys(value, ['version','receiptId','tenantId','serial','batchId','partStart','partSha256','snapshotSha256','recordsSha256','count','receivedAt','persisted','scope','payrollModified','replayed'])
    || value.version !== 'clock-source-receipt.v1' || !sourceUuid(value.receiptId) || !sourceUuid(value.tenantId)
    || value.persisted !== true || value.scope !== 'source_only' || value.payrollModified !== false || typeof value.replayed !== 'boolean'
    || !sourceTimestamp(value.receivedAt) || value.count !== payload.ordinals.length
    || ['serial','batchId','partStart','partSha256','snapshotSha256','recordsSha256'].some(key => value[key] !== payload[key])) sourceFail('CLOCK_SOURCE_RECEIPT_INVALID');
  return value;
}
export function sourceBindingCoordinates(principal) {
  const tenantId = principal?.tenant?.id;
  const bindings = principal?.tenant?.sourceBindings;
  if (!sourceUuid(tenantId) || !Array.isArray(bindings)) sourceFail('CLOCK_SOURCE_BINDING_CHANGED');
  const grh = bindings.filter(value => value?.system === 'GRH' && value.verified === true);
  if (grh.length !== 1) sourceFail('CLOCK_SOURCE_BINDING_CHANGED');
  const source = grh[0], companyId = typeof source.companyId === 'string' && /^[1-9][0-9]*$/.test(source.companyId) ? Number(source.companyId) : source.companyId;
  if (!Number.isSafeInteger(companyId) || companyId < 1 || typeof source.database !== 'string' || !source.database.length || source.database.length > 255 || /[\u0000-\u001f\u007f]/.test(source.database)) sourceFail('CLOCK_SOURCE_BINDING_CHANGED');
  const binding = { version: 'clock-source-binding.v1', tenantId, system: 'GRH', database: source.database.normalize('NFC'), companyId };
  return { tenantId, sourceBindingSha256: sourceHash(JSON.stringify(binding)) };
}
export function assertSourceFleet(value, coordinates, deviceIds) {
  if (!exactSourceKeys(value, ['version','checkedAt','tenantId','sourceBindingSha256','revision','devices','scope','reconciliationState','payrollModified'])
    || value.version !== 'clock-source-fleet.v1' || value.tenantId !== coordinates.tenantId || value.sourceBindingSha256 !== coordinates.sourceBindingSha256
    || !sourceHex(value.revision) || !sourceTimestamp(value.checkedAt) || value.scope !== 'source_only' || value.reconciliationState !== 'pending' || value.payrollModified !== false
    || !Array.isArray(value.devices) || value.devices.length !== deviceIds.length || value.devices.length > 200) sourceFail('CLOCK_SOURCE_RESPONSE_INVALID');
  const seen = new Set();
  for (const device of value.devices) {
    if (!exactSourceKeys(device, ['deviceId','siteId','enrolled','enabled','receipts','recordsPersisted','completedBatches','pendingBatches','lastReceivedAt','lastCapturedAt'])
      || !sourceUuid(device.deviceId) || !deviceIds.includes(device.deviceId) || seen.has(device.deviceId) || typeof device.enrolled !== 'boolean' || typeof device.enabled !== 'boolean'
      || (device.enrolled ? !sourceUuid(device.siteId) : device.siteId !== null || device.enabled)
      || ['receipts','recordsPersisted','completedBatches','pendingBatches'].some(key => !Number.isSafeInteger(device[key]) || device[key] < 0 || !device.enrolled && device[key] !== 0)
      || ['lastReceivedAt','lastCapturedAt'].some(key => device[key] !== null && (!sourceTimestamp(device[key]) || !device.enrolled))) sourceFail('CLOCK_SOURCE_RESPONSE_INVALID');
    if ((device.receipts === 0) !== (device.lastReceivedAt === null) || (device.receipts === 0) !== (device.lastCapturedAt === null)
      || device.recordsPersisted < device.receipts || device.completedBatches + device.pendingBatches > device.receipts
      || device.receipts === 0 && device.recordsPersisted !== 0 || device.receipts > 0 && device.completedBatches + device.pendingBatches < 1) sourceFail('CLOCK_SOURCE_RESPONSE_INVALID');
    seen.add(device.deviceId);
  }
  return value;
}
