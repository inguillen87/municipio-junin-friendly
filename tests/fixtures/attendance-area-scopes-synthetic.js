// Generated accounts, areas and references only. No municipal records, real people or infrastructure names.
import { AREA_SCOPE_ADMIN_VERSION } from '../../assets/attendance-area-scopes-model.js';

export const id = number => 'cccccccc-0000-4000-8000-' + String(number).padStart(12, '0');
export const TENANT = id(1);
export const OTHER_TENANT = id(2);
export const RELEASE = 'a'.repeat(40);
export const KEY = 'dddddddd-0000-4000-8000-000000000001';
export const ADMIN_EMAIL = 'administracion.qa@example.invalid';
export const session = Object.freeze({ id: id(4), email: ADMIN_EMAIL, version: 3 });
/** A platform administrator in platform context, as the identity gateway describes it. */
export const owner = (changes = {}) => ({
  authorized: true, user: { email: ADMIN_EMAIL }, tenant: null, session: { mfa: true },
  platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.manage', 'platform.roles.manage'] }, ...changes,
});
export const unit = { id: '701', label: 'Repartición sintética QA' };
export const otherUnit = { id: '702', label: 'Otra repartición ficticia' };
export const sector = { id: '5', label: 'Sector exclusivamente ficticio' };
export const member = (number, changes = {}) => ({
  membershipId: id(number), roleKey: 'QA_ROL_SINTETICO', displayName: 'Cuenta sintética ' + number, email: 'cuenta' + number + '@example.invalid',
  status: 'active', self: false, grantable: true, areaCapabilities: ['attendance.area.read'], ...changes,
});
export const scope = (number, changes = {}) => ({
  scopeId: id(number), membershipId: id(10), capability: 'attendance.area.read',
  organizationUnitSourceId: unit.id, sectorSourceId: sector.id, organizationUnitLabel: unit.label, sectorLabel: sector.label,
  areaInCatalog: true, active: true, version: 1, authorizationReference: 'Nota sintética QA 001/2026',
  updatedByEmail: ADMIN_EMAIL, updatedAt: '2026-11-19T12:00:00.000000+00:00', capabilityHeld: true, ...changes,
});
export const reading = (changes = {}) => ({
  version: AREA_SCOPE_ADMIN_VERSION, resource: 'scopes', tenantId: TENANT, scopeSetVersion: 'b'.repeat(64), catalogVersion: 'c'.repeat(64),
  memberships: [member(10), member(11, { areaCapabilities: [] }), member(12, { self: true, grantable: false, email: ADMIN_EMAIL, displayName: 'Administración sintética QA' })],
  organizationUnits: [{ ...unit }, { ...otherUnit }], sectors: [{ ...sector }], scopes: [scope(20)], ...changes,
});
export const command = (changes = {}) => ({
  operation: 'grant', membershipId: id(10), capability: 'attendance.area.read',
  area: { organizationUnitSourceId: otherUnit.id, sectorSourceId: null },
  authorizationReference: 'Resolución sintética QA 12/2026', scopeSetVersion: 'b'.repeat(64), ...changes,
});
export const receipt = (sent = command(), changes = {}) => ({
  version: AREA_SCOPE_ADMIN_VERSION, resource: 'command', tenantId: TENANT, operation: sent.operation, changed: true, replayed: false,
  scope: {
    scopeId: id(30), membershipId: sent.membershipId, capability: sent.capability,
    organizationUnitSourceId: sent.area.organizationUnitSourceId, sectorSourceId: sent.area.sectorSourceId,
    active: sent.operation === 'grant', version: 1, authorizationReference: sent.authorizationReference,
    updatedByEmail: ADMIN_EMAIL, updatedAt: '2026-11-19T12:00:05+00:00',
  }, ...changes,
});
