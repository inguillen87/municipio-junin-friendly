// Entirely synthetic. No municipal identity, device address or backup content.
import {EXPECTED_DEVICES_VERSION, EXPECTED_DEVICES_COMMAND_VERSION} from '../../assets/attendance-expected-devices-model.js';
export const id = n => 'd0000000-0000-4000-8000-' + String(n).padStart(12, '0');
export const area = {organizationUnitSourceId: '900', sectorSourceId: '901'};
export const areaLabel = 'Repartición sintética / Sector de prueba';
export const capabilities = ['attendance.area.read', 'attendance.area.devices.propose', 'attendance.area.devices.approve', 'attendance.area.devices.audit.read'];
export const session = {id: id(3), version: 1, releaseSha: 'a'.repeat(40), email: 'expected-devices@example.invalid'};
export const principal = {user: {email: session.email}, tenant: {source: 'membership', id: id(1), membershipId: id(2), certifiedReleaseSha: session.releaseSha, effectiveCapabilities: capabilities}};
export const sqlPrincipal = () => ({tenantId: id(1), membershipId: id(2), actorPersonId: id(4), sessionId: session.id, sessionVersion: session.version,
  sourceBindingId: id(5), scopeVersion: 'b'.repeat(64), capabilities: [...capabilities],
  areaScopes: [{scopeId: id(6), ...area, areaLabel, version: 1}]});
export const base = () => ({version: EXPECTED_DEVICES_VERSION, principal: sqlPrincipal(), payrollPosted: false, coverageCertified: false, installationReady: false});
export const device = () => ({id: id(8), label: 'Dispositivo sintético · Modelo de prueba', siteLabel: 'Sede sintética'});
export const command = (patch = {}) => ({version: EXPECTED_DEVICES_COMMAND_VERSION, command: 'propose', scopeVersion: 'b'.repeat(64), proposalId: null, expectedVersion: 0,
  payload: {contractId: id(7), area: {...area}, validFrom: '2026-11-01', validUntil: '2026-11-30', deviceIds: [id(8)], subjectVersion: 'c'.repeat(64), deviceCatalogVersion: 'd'.repeat(64), complete: true},
  reasonCode: 'initial_declaration', reason: 'Declaración sintética para revisar por otra persona.', ...patch});
export function record(patch = {}) {
  const b = command();
  return {id: id(9), version: 1, status: 'proposed', contractId: b.payload.contractId, contractLabel: 'Legajo 9001 · Persona sintética',
    area: {...area}, areaLabel, validFrom: b.payload.validFrom, validUntil: b.payload.validUntil, devices: [device()], complete: true,
    subjectVersion: b.payload.subjectVersion, deviceCatalogVersion: b.payload.deviceCatalogVersion, proposalSha256: 'e'.repeat(64), proposedAt: '2026-11-16T18:00:00Z',
    decidedAt: null, retiredAt: null, retiredEffectiveFrom: null, canReview: false, canRetire: false, ...patch};
}
export function receipt(body = command(), patch = {}) {
  const state = {propose: 'proposed', approve: 'approved', reject: 'rejected', retire: 'retired'}[body.command];
  const r = record({id: body.proposalId ?? id(9), version: body.expectedVersion + 1, status: state,
    decidedAt: state === 'proposed' ? null : '2026-11-16T18:02:00Z', retiredAt: state === 'retired' ? '2026-11-16T18:03:00Z' : null,
    retiredEffectiveFrom: state === 'retired' ? body.payload.effectiveFrom : null});
  const proof = {attemptKey: id(10), requestSha256: 'f'.repeat(64), body, recordId: r.id, recordVersion: r.version, status: r.status, scopeVersion: body.scopeVersion, recordedAt: '2026-11-16T18:03:00Z'};
  return {...base(), record: r, receipt: proof, replayed: false, attemptKey: proof.attemptKey, requestSha256: proof.requestSha256, ...patch};
}
export const choices = () => ({...base(), area: {...area}, areaLabel, validFrom: '2026-11-01', validUntil: '2026-11-30',
  contracts: [{id: id(7), label: 'Legajo 9001 · Persona sintética', subjectVersion: 'c'.repeat(64), areaLabel}], devices: [device()], deviceCatalogVersion: 'd'.repeat(64), complete: true, blockerCodes: []});
export const listing = () => ({...base(), area: {...area}, areaLabel, status: 'all', limit: 20, offset: 0, total: 1, records: [record()], complete: true});
