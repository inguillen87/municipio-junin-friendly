// Entirely synthetic identities and catalogue labels; no municipal records.
export const historyId = n => '31000000-0000-4000-8000-' + String(n).padStart(12, '0');
export const historyScope = {tenantId:historyId(1), sourceBindingId:historyId(2), contractId:historyId(3)};
export const historyArea = {organizationUnitSourceId:'91', sectorSourceId:'4', organizationName:'Área sintética', sectorName:'Sector de ensayo'};
export const historyQuery = (values = {}) => ({...historyScope, validFrom:'2026-11-16', validUntil:'2026-11-16', ...values});
export function areaHistoryFixture() {
  return {version:'attendance-area-history-source.v1', scope:{...historyScope},
    provenance:{origin:'native_registration', sourceVersion:'a'.repeat(64), complete:true, registrationMatches:true, guardConfirmed:true},
    registration:{id:historyId(4), registeredAt:'2026-11-01T14:00:00.123456+00:00', requestSha256:'b'.repeat(64), catalogSha256:'c'.repeat(64),
      startDate:'2026-10-01', endDate:null, area:{...historyArea}},
    currentArea:{...historyArea}, changes:{complete:true, approved:[]}, lifecycle:{complete:true, approved:[]},
    withdrawal:{complete:true, withdrawn:false, approvalId:null}};
}
export function unchangedAreaChange(revision = 1) {
  return {proposalId:historyId(100 + revision), approvalId:historyId(200 + revision), revision,
    approvedAt:'2026-11-12T14:00:00Z', effectiveFrom:null, beforeArea:{...historyArea}, afterArea:{...historyArea},
    sourceMatches:true, makerChecker:true};
}
export function historyTermination() {
  return {proposalId:historyId(301), approvalId:historyId(401), revision:1, approvedAt:'2026-11-12T14:00:00Z',
    movement:'terminate', movementDate:'2026-10-31', beforeIntervals:[{startDate:'2026-10-01', endDate:null}],
    afterIntervals:[{startDate:'2026-10-01', endDate:'2026-10-31'}], sourceMatches:true, makerChecker:true};
}
export function historyReentry() {
  return {proposalId:historyId(302), approvalId:historyId(402), revision:2, approvedAt:'2026-11-13T14:00:00Z',
    movement:'reenter', movementDate:'2026-11-15', beforeIntervals:[{startDate:'2026-10-01', endDate:'2026-10-31'}],
    afterIntervals:[{startDate:'2026-10-01', endDate:'2026-10-31'}, {startDate:'2026-11-15', endDate:null}],
    sourceMatches:true, makerChecker:true};
}
