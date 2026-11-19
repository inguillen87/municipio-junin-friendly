// Declared expectations only. A punch, an empty set or a successful transfer
// never proves which devices should have been present for a contract.
export const EXPECTED_DEVICES_VERSION = 'attendance-expected-devices.v1';
export const EXPECTED_DEVICES_COMMAND_VERSION = 'attendance-expected-devices-command.v1';
export const EXPECTED_DEVICES_READ = 'attendance.area.read';
export const EXPECTED_DEVICES_MAX_BYTES = 32768;
export const EXPECTED_DEVICES_CAPABILITIES = Object.freeze([
  EXPECTED_DEVICES_READ, 'attendance.area.devices.propose', 'attendance.area.devices.approve', 'attendance.area.devices.audit.read',
]);
export class ExpectedDevicesError extends Error {
  constructor(code, message, status = 422) {
    super(message); this.name = 'ExpectedDevicesError'; this.code = 'ATTENDANCE_EXPECTED_DEVICES_' + code; this.status = status;
  }
}
export const expectedDevicesExact = (v, keys, optional = []) => !!v && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v)) && keys.every(k => Object.hasOwn(v, k))
  && Reflect.ownKeys(v).every(k => typeof k === 'string' && [...keys, ...optional].includes(k));
const fullMatch = (pattern, v) => typeof v === 'string' && pattern.exec(v)?.[0] === v;
export const expectedDevicesUuid = v => fullMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, v) && v !== '00000000-0000-0000-0000-000000000000';
export const expectedDevicesSha = v => fullMatch(/^[a-f0-9]{64}$/, v);
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const sourceId = v => fullMatch(/^(0|[1-9][0-9]{0,18})$/, v);
const safeText = (v, min, max) => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC')
  && v.length >= min && v.length <= max && !/[<>\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
const instant = v => fullMatch(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/, v) && expectedDevicesDay(v.slice(0, 10)) && Number.isFinite(Date.parse(v));
const need = (ok, message = 'Revisá la consulta, las fechas y los datos declarados.', code = 'INPUT_INVALID', status = 422) => {
  if (!ok) throw new ExpectedDevicesError(code, message, status);
};
export function expectedDevicesDay(v) {
  if (typeof v !== 'string' || !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00.000Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function expectedDevicesAreaKey(v) {
  need(expectedDevicesExact(v, ['organizationUnitSourceId', 'sectorSourceId']) && sourceId(v.organizationUnitSourceId)
    && (v.sectorSourceId === null || sourceId(v.sectorSourceId)), 'Seleccioná una repartición y un sector autorizados.');
  // Null is an exact area without a sector, never an organization-wide wildcard.
  return JSON.stringify([v.organizationUnitSourceId, v.sectorSourceId]);
}
export function expectedDevicesStable(v) {
  return Array.isArray(v) ? '[' + v.map(expectedDevicesStable).join(',') + ']'
    : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + expectedDevicesStable(v[k])).join(',') + '}' : JSON.stringify(v);
}
const unique = (values, key = x => x) => Array.isArray(values) && Reflect.ownKeys(values).length === values.length + 1 && new Set(values.map(key)).size === values.length;
const range = (from, until) => expectedDevicesDay(from) && expectedDevicesDay(until) && until >= from && (Date.parse(until) - Date.parse(from)) / 86400000 <= 366;
const reasons = Object.freeze({
  propose: [{value: 'initial_declaration', label: 'Declaración inicial'}, {value: 'replacement', label: 'Nueva declaración de dispositivos'}],
  approve: [{value: 'declaration_verified', label: 'Declaración verificada'}],
  reject: [{value: 'insufficient_evidence', label: 'Falta respaldo'}, {value: 'wrong_devices', label: 'Dispositivos incorrectos'}, {value: 'wrong_scope', label: 'Área incorrecta'}],
  retire: [{value: 'declaration_retired', label: 'Retiro de la declaración'}],
});
export const expectedDevicesReasonOptions = command => (reasons[command] ?? []).map(x => ({...x}));
export function expectedDevicesCommandCapability(command) {
  need(Object.hasOwn(reasons, command)); return command === 'propose' ? 'attendance.area.devices.propose' : 'attendance.area.devices.approve';
}
export function validateExpectedDevicesQuery(q) {
  const fail = () => need(false, 'La lectura requiere un área y un rango explícitos, o un identificador válido.', 'QUERY_INVALID', 400);
  if (expectedDevicesExact(q, ['resource']) && q.resource === 'bootstrap') return q;
  if (expectedDevicesExact(q, ['resource', 'id']) && q.resource === 'detail' && expectedDevicesUuid(q.id)) return q;
  if (expectedDevicesExact(q, ['resource', 'key']) && q.resource === 'attempt' && expectedDevicesUuid(q.key)) return q;
  if (q?.resource === 'choices' && expectedDevicesExact(q, ['resource', 'area', 'validFrom', 'validUntil']) && range(q.validFrom, q.validUntil)) {
    expectedDevicesAreaKey(q.area); return q;
  }
  if (q?.resource === 'list' && expectedDevicesExact(q, ['resource', 'area', 'status', 'limit', 'offset'])
    && ['all', 'proposed', 'approved', 'rejected', 'retired'].includes(q.status) && integer(q.limit, 1, 100) && integer(q.offset, 0, 100000)) {
    expectedDevicesAreaKey(q.area); return q;
  }
  return fail();
}
export function validateExpectedDevicesCommand(b) {
  need(expectedDevicesExact(b, ['version', 'command', 'scopeVersion', 'proposalId', 'expectedVersion', 'payload', 'reasonCode', 'reason'])
    && b.version === EXPECTED_DEVICES_COMMAND_VERSION && Object.hasOwn(reasons, b.command) && expectedDevicesSha(b.scopeVersion)
    && integer(b.expectedVersion, 0, 2147483646) && reasons[b.command].some(r => r.value === b.reasonCode) && safeText(b.reason, 10, 500),
  'Informá la versión, la operación y un fundamento de 10 a 500 caracteres.');
  if (b.command === 'propose') {
    const p = b.payload;
    need(b.proposalId === null && b.expectedVersion === 0 && expectedDevicesExact(p, ['contractId', 'area', 'validFrom', 'validUntil', 'deviceIds', 'subjectVersion', 'deviceCatalogVersion', 'complete'])
      && expectedDevicesUuid(p.contractId) && range(p.validFrom, p.validUntil) && p.complete === true
      && expectedDevicesSha(p.subjectVersion) && expectedDevicesSha(p.deviceCatalogVersion)
      && unique(p.deviceIds) && p.deviceIds.length >= 1 && p.deviceIds.length <= 100 && p.deviceIds.every(expectedDevicesUuid),
    'Elegí un contrato y entre 1 y 100 dispositivos de la fuente vigente, con inicio y fin explícitos.');
    expectedDevicesAreaKey(p.area);
  } else {
    need(expectedDevicesUuid(b.proposalId) && b.expectedVersion > 0, 'La decisión requiere la propuesta y su versión actual.');
    need(b.command === 'retire' ? expectedDevicesExact(b.payload, ['effectiveFrom']) && expectedDevicesDay(b.payload.effectiveFrom) : b.payload === null,
      'El retiro requiere una fecha efectiva explícita; las decisiones conservan la propuesta original.');
  }
  return b;
}
export function buildExpectedDevicesCommand(input) {
  return validateExpectedDevicesCommand({version: EXPECTED_DEVICES_COMMAND_VERSION, payload: null, ...input});
}
export function validateExpectedDevicesPrincipal(p) {
  const check = ok => need(ok, 'El acceso por área cambió o no pudo verificarse.', 'RESPONSE_INVALID', 503);
  check(expectedDevicesExact(p, ['tenantId', 'membershipId', 'actorPersonId', 'sessionId', 'sessionVersion', 'sourceBindingId', 'scopeVersion', 'capabilities', 'areaScopes'])
    && [p.tenantId, p.membershipId, p.sessionId, p.sourceBindingId].every(expectedDevicesUuid) && (p.actorPersonId === null || expectedDevicesUuid(p.actorPersonId))
    && integer(p.sessionVersion, 1, 2147483647) && expectedDevicesSha(p.scopeVersion)
    && unique(p.capabilities) && p.capabilities.includes(EXPECTED_DEVICES_READ) && p.capabilities.every(c => EXPECTED_DEVICES_CAPABILITIES.includes(c))
    && unique(p.areaScopes, a => expectedDevicesAreaKey({organizationUnitSourceId: a.organizationUnitSourceId, sectorSourceId: a.sectorSourceId}))
    && unique(p.areaScopes, a => a.scopeId) && p.areaScopes.length <= 500);
  for (const s of p.areaScopes) check(expectedDevicesExact(s, ['scopeId', 'organizationUnitSourceId', 'sectorSourceId', 'areaLabel', 'version'])
    && expectedDevicesUuid(s.scopeId) && safeText(s.areaLabel, 1, 500) && integer(s.version, 1, 2147483647));
  return p;
}
export function validateExpectedDevicesRecord(r) {
  const check = ok => need(ok, 'La declaración recibida no pudo verificarse.', 'RESPONSE_INVALID', 503);
  check(expectedDevicesExact(r, ['id', 'version', 'status', 'contractId', 'contractLabel', 'area', 'areaLabel', 'validFrom', 'validUntil', 'devices', 'complete', 'subjectVersion', 'deviceCatalogVersion', 'proposalSha256', 'proposedAt', 'decidedAt', 'retiredAt', 'retiredEffectiveFrom', 'canReview', 'canRetire'])
    && expectedDevicesUuid(r.id) && expectedDevicesUuid(r.contractId) && integer(r.version, 1, 3) && safeText(r.contractLabel, 1, 500) && safeText(r.areaLabel, 1, 500)
    && ['proposed', 'approved', 'rejected', 'retired'].includes(r.status) && range(r.validFrom, r.validUntil) && r.complete === true
    && [r.subjectVersion, r.deviceCatalogVersion, r.proposalSha256].every(expectedDevicesSha) && instant(r.proposedAt)
    && typeof r.canReview === 'boolean' && typeof r.canRetire === 'boolean' && unique(r.devices, d => d.id) && r.devices.length >= 1 && r.devices.length <= 100);
  expectedDevicesAreaKey(r.area);
  for (const d of r.devices) check(expectedDevicesExact(d, ['id', 'label', 'siteLabel']) && expectedDevicesUuid(d.id) && safeText(d.label, 1, 240) && safeText(d.siteLabel, 1, 180));
  check(r.status === 'proposed' ? r.version === 1 && r.decidedAt === null : r.version === (r.status === 'retired' ? 3 : 2) && instant(r.decidedAt) && Date.parse(r.decidedAt) >= Date.parse(r.proposedAt));
  check(r.status === 'retired' ? r.version === 3 && instant(r.retiredAt) && Date.parse(r.retiredAt) >= Date.parse(r.decidedAt) && expectedDevicesDay(r.retiredEffectiveFrom) && r.retiredEffectiveFrom >= r.validFrom
    && Date.parse(r.retiredEffectiveFrom) <= Date.parse(r.validUntil) + 86400000 : r.retiredAt === null && r.retiredEffectiveFrom === null);
  check((r.status === 'proposed' || !r.canReview) && (r.status === 'approved' || !r.canRetire));
  return r;
}
function receipt(v, record, options, check) {
  check(expectedDevicesExact(v, ['attemptKey', 'requestSha256', 'body', 'recordId', 'recordVersion', 'status', 'scopeVersion', 'recordedAt'])
    && expectedDevicesUuid(v.attemptKey) && expectedDevicesSha(v.requestSha256) && expectedDevicesSha(v.scopeVersion) && instant(v.recordedAt));
  validateExpectedDevicesCommand(v.body);
  check(v.recordId === record.id && v.recordVersion === record.version && v.status === record.status && v.scopeVersion === v.body.scopeVersion
    && v.status === ({propose: 'proposed', approve: 'approved', reject: 'rejected', retire: 'retired'})[v.body.command]
    && record.version === v.body.expectedVersion + 1);
  if (v.body.command === 'propose') {
    const p = v.body.payload;
    check(record.contractId === p.contractId && expectedDevicesAreaKey(record.area) === expectedDevicesAreaKey(p.area)
      && record.validFrom === p.validFrom && record.validUntil === p.validUntil && record.subjectVersion === p.subjectVersion && record.deviceCatalogVersion === p.deviceCatalogVersion
      && expectedDevicesStable(record.devices.map(d => d.id).sort()) === expectedDevicesStable([...p.deviceIds].sort()));
  } else check(record.id === v.body.proposalId);
  if (v.body.command === 'retire') check(record.retiredEffectiveFrom === v.body.payload.effectiveFrom);
  if (options.command) check(expectedDevicesStable(v.body) === expectedDevicesStable(options.command));
  if (options.attemptKey) check(v.attemptKey === options.attemptKey);
}
export function validateExpectedDevicesResponse(data, options = {}) {
  const check = ok => need(ok, 'La respuesta no coincide con la lectura o el intento original. Conservá el contenido y la clave.', 'RESPONSE_INVALID', 503);
  try {
    check(data?.version === EXPECTED_DEVICES_VERSION && data.payrollPosted === false && data.coverageCertified === false && data.installationReady === false);
    validateExpectedDevicesPrincipal(data.principal);
    const base = ['version', 'principal', 'payrollPosted', 'coverageCertified', 'installationReady'];
    const resource = options.resource ?? (options.command ? 'command' : 'bootstrap'), q = options.query;
    const scope = (area, label) => {
      const key = expectedDevicesAreaKey(area), s = data.principal.areaScopes.find(s => expectedDevicesAreaKey({organizationUnitSourceId: s.organizationUnitSourceId, sectorSourceId: s.sectorSourceId}) === key);
      check(s && s.areaLabel === label);
      if (q?.area) check(expectedDevicesAreaKey(q.area) === key);
    };
    const checkedRecord = r => {
      validateExpectedDevicesRecord(r); scope(r.area, r.areaLabel);
      check(!(r.canReview || r.canRetire) || data.principal.actorPersonId !== null && data.principal.capabilities.includes('attendance.area.devices.approve'));
    };
    if (resource === 'bootstrap') { check(expectedDevicesExact(data, base)); return data; }
    if (resource === 'choices') {
      check(expectedDevicesExact(data, [...base, 'area', 'areaLabel', 'validFrom', 'validUntil', 'contracts', 'devices', 'deviceCatalogVersion', 'complete', 'blockerCodes'])
        && range(data.validFrom, data.validUntil) && (!q || q.validFrom === data.validFrom && q.validUntil === data.validUntil)
        && unique(data.contracts, c => c.id) && data.contracts.length <= 2000 && unique(data.devices, d => d.id) && data.devices.length <= 1000
        && expectedDevicesSha(data.deviceCatalogVersion) && typeof data.complete === 'boolean' && unique(data.blockerCodes)
        && data.blockerCodes.every(c => /^[A-Z][A-Z0-9_]{2,95}$/.test(c)) && (data.complete ? data.blockerCodes.length === 0 : data.blockerCodes.length > 0));
      scope(data.area, data.areaLabel);
      for (const c of data.contracts) check(expectedDevicesExact(c, ['id', 'label', 'subjectVersion', 'areaLabel']) && expectedDevicesUuid(c.id)
        && safeText(c.label, 1, 500) && expectedDevicesSha(c.subjectVersion) && c.areaLabel === data.areaLabel);
      for (const d of data.devices) check(expectedDevicesExact(d, ['id', 'label', 'siteLabel']) && expectedDevicesUuid(d.id) && safeText(d.label, 1, 240) && safeText(d.siteLabel, 1, 180));
      return data;
    }
    if (resource === 'list') {
      check(expectedDevicesExact(data, [...base, 'area', 'areaLabel', 'status', 'limit', 'offset', 'total', 'records', 'complete']) && data.complete === true
        && integer(data.limit, 1, 100) && integer(data.offset, 0, 100000) && integer(data.total, 0, 2147483647)
        && ['all', 'proposed', 'approved', 'rejected', 'retired'].includes(data.status) && unique(data.records, r => r.id)
        && data.records.length === Math.min(data.limit, Math.max(0, data.total - data.offset))
        && (!q || data.status === q.status && data.limit === q.limit && data.offset === q.offset));
      scope(data.area, data.areaLabel);
      for (const r of data.records) { checkedRecord(r); check(data.status === 'all' || r.status === data.status); }
      return data;
    }
    if (resource === 'detail') {
      check(expectedDevicesExact(data, [...base, 'record', 'history', 'auditAvailable', 'historyComplete']) && typeof data.auditAvailable === 'boolean' && typeof data.historyComplete === 'boolean'
        && unique(data.history, h => h.resultingVersion) && data.history.length <= 3);
      checkedRecord(data.record);
      check(!q?.id || data.record.id === q.id);
      check(data.auditAvailable ? data.principal.capabilities.includes('attendance.area.devices.audit.read') && data.historyComplete && data.history.length === data.record.version : !data.historyComplete && data.history.length === 0);
      const sequence = ['propose', data.record.status === 'rejected' ? 'reject' : 'approve', 'retire'];
      const timestamps = [data.record.proposedAt, data.record.decidedAt, data.record.retiredAt];
      for (const [i, h] of data.history.entries()) check(expectedDevicesExact(h, ['command', 'expectedVersion', 'resultingVersion', 'reasonCode', 'occurredAt'])
        && Object.hasOwn(reasons, h.command) && reasons[h.command].some(r => r.value === h.reasonCode) && instant(h.occurredAt)
        && h.expectedVersion === i && h.resultingVersion === i + 1 && h.command === sequence[i] && Date.parse(h.occurredAt) === Date.parse(timestamps[i]));
      return data;
    }
    check(['command', 'attempt'].includes(resource));
    check(expectedDevicesExact(data, [...base, 'receipt', 'record', 'replayed', 'attemptKey', 'requestSha256', ...(resource === 'attempt' ? ['found'] : [])])
      && typeof data.replayed === 'boolean' && expectedDevicesUuid(data.attemptKey));
    if (resource === 'attempt') {
      check(typeof data.found === 'boolean' && (!q?.key || data.attemptKey === q.key));
      if (!data.found) { check(data.receipt === null && data.record === null && data.replayed === false && data.requestSha256 === null); return data; }
      check(data.replayed === true);
    }
    checkedRecord(data.record);
    receipt(data.receipt, data.record, options, check);
    check(data.attemptKey === data.receipt.attemptKey && data.requestSha256 === data.receipt.requestSha256);
    return data;
  } catch (error) {
    if (error instanceof ExpectedDevicesError && error.status === 503) throw error;
    throw new ExpectedDevicesError('RESPONSE_INVALID', 'La respuesta del padrón no pudo verificarse. Conservá el intento original.', 503);
  }
}
