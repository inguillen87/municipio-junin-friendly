// Generated contracts and technical identities only. No municipal records.
import { attendanceAreaDeviceKey, ATTENDANCE_AREA_SOURCE_VERSION } from '../../lib/internal-attendance-area.js';
import { v3Source, v3Events, V3_DAY, V3_REVISION } from './continuous-workdays-v3-api-synthetic.js';
import { id, area, areaLabel, sqlPrincipal, principal, session } from './attendance-expected-devices-synthetic.js';

export { id, area, areaLabel, principal, session };
export const AREA_DAY = V3_DAY;
export const AREA_SNAPSHOT = V3_REVISION;
export const areaQuery = (changes = {}) => ({ resource: 'day', area: { ...area }, day: AREA_DAY, site: 'qa-site', snapshot: AREA_SNAPSHOT, ...changes });
export const areaSubject = () => ({ id: id(7), label: 'Legajo 9001 · Persona sintética', subjectVersion: 'c'.repeat(64), areaLabel });
export const areaEvents = () => v3Events({ contractId: id(7), legajo: '9001' }).map(event => ({ ...event,
  personLabel: 'Persona sintética', deviceKey: attendanceAreaDeviceKey(principal.tenant.id, id(8)) }));
export function areaExpected({ blocked = false } = {}) {
  return { version: 'attendance-expected-devices-effective.v1', contractId: id(7), date: AREA_DAY,
    status: blocked ? 'blocked' : 'resolved', complete: !blocked,
    expectedDeviceIds: blocked ? [] : [id(8)], expectedDeviceKeys: blocked ? [] : [attendanceAreaDeviceKey(principal.tenant.id, id(8))],
    deviceKeyNamespace: 'clock-device-v2', proposalId: blocked ? null : id(9), proposalSha256: blocked ? null : 'e'.repeat(64),
    approvalId: blocked ? null : id(11), validFrom: blocked ? null : '2026-11-01', validUntil: blocked ? null : '2026-11-30',
    retiredEffectiveFrom: null, sourceVersion: blocked ? null : 'f'.repeat(64),
    blockerCodes: blocked ? ['EXPECTED_DEVICES_DECLARATION_REQUIRED'] : [], coverageCertified: false };
}
export function areaSource({ populationComplete = true, declarationBlocked = false, empty = false } = {}) {
  const workdays = v3Source({ events: empty ? [] : areaEvents() });
  const expectedComplete = populationComplete && !declarationBlocked;
  return { version: ATTENDANCE_AREA_SOURCE_VERSION, principal: sqlPrincipal(), area: { ...area }, areaLabel,
    day: AREA_DAY, site: 'qa-site', population: { version: 'attendance-area-population.v1', area: { ...area }, areaLabel,
      validFrom: AREA_DAY, validUntil: AREA_DAY, complete: populationComplete,
      blockerCodes: populationComplete ? [] : ['AREA_HISTORY_UNRESOLVED'], contracts: empty ? [] : [areaSubject()] },
    expectedDevices: { version: 'attendance-area-expected-devices.v1', complete: empty ? populationComplete : expectedComplete,
      records: empty ? [] : [areaExpected({ blocked: declarationBlocked })] },
    workdays, sourceCut: { id: workdays.revision, consistency: 'single_snapshot', generatedAt: workdays.generatedAt },
    blockerCodes: [...new Set([...(populationComplete ? [] : ['AREA_HISTORY_UNRESOLVED']),
      'PERIOD_COVERAGE_UNCONFIRMED', ...((empty ? populationComplete : expectedComplete) ? [] : ['EXPECTED_DEVICES_UNRESOLVED'])])].sort(),
    coverageCertified: false, installationReady: false, payrollPosted: false, NoeliaReady: false };
}
