// Enteramente sintético. Ninguna identidad, legajo ni área municipal real.
import {AREA_EFFECTIVITY_VERSION, AREA_EFFECTIVITY_RECEIPT_VERSION} from '../../assets/attendance-area-effectivity-model.js';
export const id = n => 'e0000000-0000-4000-8000-' + String(n).padStart(12, '0');
export const session = {id: id(3), version: 1, releaseSha: 'a'.repeat(40), email: 'vigencia@example.invalid'};
export const principal = (capabilities = ['employee.record.propose', 'employee.record.approve']) => ({user: {email: session.email},
  tenant: {source: 'membership', id: id(1), membershipId: id(2), certifiedReleaseSha: session.releaseSha, effectiveCapabilities: capabilities}});
export const sqlPrincipal = () => ({tenantId: id(1), membershipId: id(2), sessionId: session.id, sessionVersion: session.version});
export const excluded = (patch = {}) => ({areaIncomplete: 2, nativeRegistration: 0, notActive: 0, unproven: 0, withdrawn: 1, ...patch});
export const areas = () => [
  {organizationUnitSourceId: '900', sectorSourceId: '901', areaLabel: 'Repartición sintética / Sector de prueba', contracts: 3},
  {organizationUnitSourceId: '900', sectorSourceId: null, areaLabel: 'Repartición sintética', contracts: 2},
];
export const record = (patch = {}) => ({id: id(9), version: 'c'.repeat(64), status: 'proposed', effectiveFrom: '2026-11-01', scope: 'missing',
  authorizationReference: 'Nota sintética 12/2026 de prueba', itemCount: 5, excluded: excluded(), proposedBy: 'prepara@example.invalid',
  proposedAt: '2026-11-19T04:00:00.123456+00:00', ownProposal: false, reviewedBy: null, reviewedAt: null, reviewReason: null, contractsInForce: 0, ...patch});
export const decided = (status = 'approved', patch = {}) => record({status, reviewedBy: 'aprueba@example.invalid', reviewedAt: '2026-11-19T05:00:00+00:00',
  reviewReason: 'Decisión sintética de prueba', contractsInForce: status === 'approved' ? 5 : 0, ...patch});
export const state = (patch = {}) => ({version: AREA_EFFECTIVITY_VERSION, principal: sqlPrincipal(), today: '2026-11-19',
  permissions: {canPropose: true, canReview: true}, preview: {excluded: excluded(), scopes: {all: {eligible: 5, areas: areas(), version: 'd'.repeat(64)}, missing: {eligible: 5, areas: areas(), version: 'b'.repeat(64)}}},
  pending: null, history: [], declaredContracts: 0, ...patch});
export const pending = (patch = {}) => ({...record(), areas: areas(), stale: false, ...patch});
export const propose = (patch = {}) => ({action: 'propose', authorizationReference: 'Nota sintética 12/2026 de prueba', effectiveFrom: '2026-11-01', previewVersion: 'b'.repeat(64), scope: 'missing', ...patch});
export const review = (patch = {}) => ({action: 'review', decision: 'approve', proposalId: id(9), proposalVersion: 'c'.repeat(64), reason: 'Decisión sintética de prueba', ...patch});
export const receipt = (command = propose(), patch = {}) => ({version: AREA_EFFECTIVITY_RECEIPT_VERSION, principal: sqlPrincipal(), action: command.action, replayed: false,
  declaration: command.action === 'propose' ? record({effectiveFrom: command.effectiveFrom, scope: command.scope, authorizationReference: command.authorizationReference, ownProposal: true})
    : decided(command.decision === 'approve' ? 'approved' : 'rejected', {id: command.proposalId, version: command.proposalVersion}), ...patch});
// Con tres contratos ya declarados: faltan dos (los de la segunda área).
export const partial = (patch = {}) => state({declaredContracts: 3, history: [decided('approved', {contractsInForce: 3, itemCount: 3})],
  preview: {excluded: excluded(), scopes: {all: {eligible: 5, areas: areas(), version: 'd'.repeat(64)}, missing: {eligible: 2, areas: [areas()[1]], version: 'b'.repeat(64)}}}, ...patch});
