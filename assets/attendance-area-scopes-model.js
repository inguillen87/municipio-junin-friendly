// Administration of attendance areas per account. An area is exact: one organization unit and one sector,
// or that unit without a sector. There is no wildcard and nothing here assigns a permission to an account.
import {
  EXPECTED_DEVICES_CAPABILITIES, expectedDevicesExact as exact, expectedDevicesUuid as uuid,
  expectedDevicesSha as sha, expectedDevicesAreaKey,
} from './attendance-expected-devices-model.js';

export const AREA_SCOPE_ADMIN_VERSION = 'attendance-area-scope-admin.v1';
export const AREA_SCOPE_ADMIN_MAX_BYTES = 8192;
export const AREA_SCOPE_CAPABILITIES = EXPECTED_DEVICES_CAPABILITIES;
// The labels of the capability catalogue, so this screen and «Usuarios y roles» name each permission alike.
export const AREA_SCOPE_CAPABILITY_LABELS = Object.freeze({
  'attendance.area.read': 'Consultar asistencia por área',
  'attendance.area.devices.propose': 'Preparar dispositivos esperados',
  'attendance.area.devices.approve': 'Revisar dispositivos esperados',
  'attendance.area.devices.audit.read': 'Consultar historial de dispositivos',
});
// The administration authority that already assigns capabilities (update_access) and area scopes
// (replace_action_scopes) to the accounts of a municipality. PostgreSQL decides again on every call.
export const AREA_SCOPE_ADMIN_READ_AUTHORITY = Object.freeze(['platform.users.manage']);
export const AREA_SCOPE_ADMIN_WRITE_AUTHORITY = Object.freeze(['platform.users.manage', 'platform.roles.manage']);
export const AREA_SCOPE_OPERATIONS = Object.freeze(['grant', 'withdraw']);

export class AreaScopeAdminError extends Error {
  constructor(code, message, status = 422) {
    super(message); this.name = 'AreaScopeAdminError'; this.code = 'ATTENDANCE_AREA_SCOPE_' + code; this.status = status;
  }
}
const need = (ok, message = 'Revisá la cuenta, el permiso, el área y la referencia de autorización.', code = 'INPUT_INVALID', status = 422) => {
  if (!ok) throw new AreaScopeAdminError(code, message, status);
};
const fullMatch = (pattern, v) => typeof v === 'string' && pattern.exec(v)?.[0] === v;
const points = v => [...v].length;
// The characters migration 243 refuses in an authorization reference, as code point ranges: angle brackets,
// control characters and the invisible format characters the area labels already exclude. Kept as data so a
// test can prove the browser, the server and PostgreSQL refuse the same set.
export const AREA_SCOPE_REFERENCE_FORBIDDEN = Object.freeze([
  [0x00, 0x1f], [0x3c, 0x3c], [0x3e, 0x3e], [0x7f, 0x9f], [0xad, 0xad], [0x600, 0x605], [0x61c, 0x61c], [0x6dd, 0x6dd],
  [0x70f, 0x70f], [0x890, 0x891], [0x8e2, 0x8e2], [0x180e, 0x180e], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064],
  [0x2066, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb], [0x110bd, 0x110bd], [0x110cd, 0x110cd], [0x13430, 0x1343f],
  [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a], [0xe0001, 0xe0001], [0xe0020, 0xe007f],
].map(Object.freeze));
const forbidden = v => [...v].some(character => {
  const point = character.codePointAt(0);
  // A lone surrogate cannot be stored as text at all.
  return point >= 0xd800 && point <= 0xdfff || AREA_SCOPE_REFERENCE_FORBIDDEN.some(([first, last]) => point >= first && point <= last);
});
// Canonical exactly as PostgreSQL stores it: btrim() removes spaces only, then NFC.
const canonical = v => typeof v === 'string' && v === v.replace(/^ +| +$/g, '') && v === v.normalize('NFC');
// A catalogue label is shown as text and was already filtered in SQL; here it only has to be a bounded line.
const labelText = v => typeof v === 'string' && v.trim().length >= 1 && points(v) <= 240 && !/[<>\u0000-\u001f\u007f]/.test(v);
const unique = (values, key = x => x) => Array.isArray(values) && Reflect.ownKeys(values).length === values.length + 1
  && new Set(values.map(key)).size === values.length;
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const instant = v => fullMatch(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/, v)
  && Number.isFinite(Date.parse(v));
export const areaScopeKeyV4 = v => fullMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/, v);

/** Null is the exact unsectored area of that unit, never the whole unit. */
export function areaScopeAreaKey(area) {
  try { return expectedDevicesAreaKey(area); }
  catch { return need(false, 'Elegí una repartición y un sector del catálogo, o «Sin sector».'); }
}
export const areaScopeIdentity = scope => JSON.stringify([scope.membershipId, scope.capability,
  areaScopeAreaKey({organizationUnitSourceId: scope.organizationUnitSourceId, sectorSourceId: scope.sectorSourceId})]);

/** What a person typed becomes one canonical line; the server refuses anything that is not already canonical. */
export function normalizeAreaScopeReference(value) {
  return typeof value === 'string' ? value.normalize('NFC').replace(/\s+/gu, ' ').trim() : '';
}
export const areaScopeReferenceValid = value => canonical(value) && points(value) >= 10 && points(value) <= 500 && !forbidden(value);

export function validateAreaScopeQuery(q) {
  need(exact(q, ['resource', 'tenantId']) && q.resource === 'scopes' && uuid(q.tenantId),
    'La consulta necesita un municipio seleccionado.', 'QUERY_INVALID', 400);
  return q;
}
export function validateAreaScopeCommand(b) {
  need(exact(b, ['operation', 'membershipId', 'capability', 'area', 'authorizationReference', 'scopeSetVersion'])
    && AREA_SCOPE_OPERATIONS.includes(b.operation) && uuid(b.membershipId) && sha(b.scopeSetVersion));
  need(typeof b.capability === 'string' && AREA_SCOPE_CAPABILITIES.includes(b.capability), 'Elegí uno de los permisos de asistencia por área.');
  areaScopeAreaKey(b.area);
  need(areaScopeReferenceValid(b.authorizationReference),
    'La referencia de autorización debe tener entre 10 y 500 caracteres, en una sola línea y sin símbolos de control.');
  return b;
}
export function buildAreaScopeCommand(input) {
  need(exact(input, ['operation', 'membershipId', 'capability', 'area', 'authorizationReference', 'scopeSetVersion'])
    && exact(input.area, ['organizationUnitSourceId', 'sectorSourceId']));
  return validateAreaScopeCommand({
    operation: input.operation, membershipId: input.membershipId, capability: input.capability,
    area: {organizationUnitSourceId: input.area.organizationUnitSourceId, sectorSourceId: input.area.sectorSourceId},
    authorizationReference: normalizeAreaScopeReference(input.authorizationReference), scopeSetVersion: input.scopeSetVersion,
  });
}

const invalid = () => need(false, 'La respuesta no coincide con el municipio o la operación consultados. No se mostraron datos sin verificar.', 'RESPONSE_INVALID', 503);
const check = ok => { if (!ok) invalid(); };
const SCOPE_FACTS = ['scopeId', 'membershipId', 'capability', 'organizationUnitSourceId', 'sectorSourceId', 'active', 'version',
  'authorizationReference', 'updatedByEmail', 'updatedAt'];
function scopeFacts(scope, keys) {
  check(exact(scope, keys) && uuid(scope.scopeId) && uuid(scope.membershipId) && AREA_SCOPE_CAPABILITIES.includes(scope.capability)
    && typeof scope.active === 'boolean' && integer(scope.version, 1, 2147483647)
    && typeof scope.authorizationReference === 'string' && points(scope.authorizationReference.trim()) >= 10 && points(scope.authorizationReference.trim()) <= 500
    && typeof scope.updatedByEmail === 'string' && scope.updatedByEmail === scope.updatedByEmail.trim().toLowerCase()
    && scope.updatedByEmail.length >= 3 && scope.updatedByEmail.length <= 320 && instant(scope.updatedAt));
  try { expectedDevicesAreaKey({organizationUnitSourceId: scope.organizationUnitSourceId, sectorSourceId: scope.sectorSourceId}); } catch { invalid(); }
}

/** The whole reading is verified against itself and against the requested municipality; nothing is filtered into shape. */
export function validateAreaScopeReadResponse(data, {tenantId} = {}) {
  try {
    check(exact(data, ['version', 'resource', 'tenantId', 'scopeSetVersion', 'catalogVersion', 'memberships', 'organizationUnits', 'sectors', 'scopes'])
      && data.version === AREA_SCOPE_ADMIN_VERSION && data.resource === 'scopes' && uuid(data.tenantId) && data.tenantId === tenantId
      && sha(data.scopeSetVersion) && sha(data.catalogVersion)
      && unique(data.memberships, m => m?.membershipId) && data.memberships.length <= 1000
      && unique(data.organizationUnits, a => a?.id) && data.organizationUnits.length <= 2000
      && unique(data.sectors, a => a?.id) && data.sectors.length <= 2000
      && unique(data.scopes, s => s?.scopeId) && data.scopes.length <= 5000);
    const members = new Map();
    for (const m of data.memberships) {
      check(exact(m, ['membershipId', 'roleKey', 'displayName', 'email', 'status', 'self', 'grantable', 'areaCapabilities'])
        && uuid(m.membershipId) && fullMatch(/^[A-Z][A-Z0-9_]{2,63}$/, m.roleKey)
        && typeof m.displayName === 'string' && m.displayName.trim().length >= 1 && m.displayName.length <= 320
        && typeof m.email === 'string' && m.email === m.email.trim().toLowerCase() && m.email.length >= 3 && m.email.length <= 320
        && ['invited', 'active', 'suspended'].includes(m.status) && typeof m.self === 'boolean'
        && m.grantable === (m.status === 'active' && !m.self)
        && unique(m.areaCapabilities) && m.areaCapabilities.every(key => AREA_SCOPE_CAPABILITIES.includes(key))
        && (m.status === 'active' || m.areaCapabilities.length === 0));
      members.set(m.membershipId, m);
    }
    check(data.memberships.filter(m => m.self).length <= 1);
    const labels = list => {
      const map = new Map();
      for (const entry of list) {
        check(exact(entry, ['id', 'label']) && fullMatch(/^(0|[1-9][0-9]{0,18})$/, entry.id) && labelText(entry.label));
        map.set(entry.id, entry.label);
      }
      return map;
    };
    const units = labels(data.organizationUnits), sectors = labels(data.sectors), identities = new Set();
    for (const scope of data.scopes) {
      scopeFacts(scope, [...SCOPE_FACTS, 'organizationUnitLabel', 'sectorLabel', 'areaInCatalog', 'capabilityHeld']);
      const member = members.get(scope.membershipId);
      // Every row belongs to a listed account, names its area only from the catalogue of this same reading and
      // reports the permission exactly as that account holds it.
      check(member && typeof scope.areaInCatalog === 'boolean' && typeof scope.capabilityHeld === 'boolean'
        && scope.capabilityHeld === member.areaCapabilities.includes(scope.capability)
        && (scope.organizationUnitLabel === null ? !units.has(scope.organizationUnitSourceId) : units.get(scope.organizationUnitSourceId) === scope.organizationUnitLabel)
        && (scope.sectorSourceId === null ? scope.sectorLabel === null
          : scope.sectorLabel === null ? !sectors.has(scope.sectorSourceId) : sectors.get(scope.sectorSourceId) === scope.sectorLabel)
        && scope.areaInCatalog === (scope.organizationUnitLabel !== null && (scope.sectorSourceId === null || scope.sectorLabel !== null)));
      const identity = areaScopeIdentity(scope);
      check(!identities.has(identity)); identities.add(identity);
    }
    for (const m of data.memberships) check(m.status === 'active' || data.scopes.some(scope => scope.membershipId === m.membershipId));
    return data;
  } catch (e) {
    if (e instanceof AreaScopeAdminError && e.code === 'ATTENDANCE_AREA_SCOPE_RESPONSE_INVALID') throw e;
    return invalid();
  }
}

/** A confirmation is accepted only for the very scope that was sent. */
export function validateAreaScopeCommandResponse(data, {tenantId, command} = {}) {
  try {
    check(exact(data, ['version', 'resource', 'tenantId', 'operation', 'changed', 'replayed', 'scope'])
      && data.version === AREA_SCOPE_ADMIN_VERSION && data.resource === 'command' && uuid(data.tenantId) && data.tenantId === tenantId
      && typeof data.changed === 'boolean' && typeof data.replayed === 'boolean' && !(data.changed && data.replayed));
    validateAreaScopeCommand(command);
    scopeFacts(data.scope, SCOPE_FACTS);
    check(data.operation === command.operation && areaScopeIdentity(data.scope) === areaScopeIdentity({
      membershipId: command.membershipId, capability: command.capability, ...command.area,
    }));
    // A repeated key answers with the row as it is now; a fresh answer must show the requested state.
    check(data.replayed || data.scope.active === (command.operation === 'grant'));
    check(!data.changed || data.scope.authorizationReference === command.authorizationReference);
    return data;
  } catch (e) {
    if (e instanceof AreaScopeAdminError && e.code === 'ATTENDANCE_AREA_SCOPE_RESPONSE_INVALID') throw e;
    return invalid();
  }
}
