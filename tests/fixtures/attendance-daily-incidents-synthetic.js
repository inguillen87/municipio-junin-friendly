// Synthetic supplied source, not a database attestation or municipal policy.
import {attendanceDailyDigest} from '../../lib/attendance-daily-incidents.js';
import {v3Source, V3_DAY, V3_CONTRACT, V3_PRINCIPAL, hash} from './continuous-workdays-v3-api-synthetic.js';
export {V3_DAY, V3_CONTRACT};
export const id = n => 'a0000000-0000-4000-8000-' + String(n).padStart(12, '0');
export const evidence = n => ({id:id(n), sha256:hash('synthetic-proof-' + n)});
export function rebindDaily(input) {
  input.cut.componentSha256 = Object.fromEntries(['workdays','population','catalog','coverage','justifications'].map(k => [k,attendanceDailyDigest(input[k])]));
  return input;
}
export function catalogRecord(kind, n, configuration) {
  return {id:id(n), kind, revision:1, effectiveFrom:'2026-11-01', effectiveTo:'2026-11-30',
    timezone:'America/Argentina/Mendoza', sourceLinked:true, status:'approved', version:3, reasonCode:'configuration_verified',
    configuration, timestamps:{createdAt:'2026-10-20T12:00:00Z', submittedAt:'2026-10-21T12:00:00Z',
      decidedAt:'2026-10-22T12:00:00Z', updatedAt:'2026-10-22T12:00:00Z'}};
}
export function dailyFixture({events} = {}) {
  const workdays = v3Source(events === undefined ? {} : {events});
  workdays.generatedAt = '2026-11-15T04:00:00Z';
  const area = {organizationUnitSourceId:'900', sectorSourceId:'901'};
  const shift = catalogRecord('shift', 11, {entryToleranceSeconds:0, exitToleranceSeconds:0,
    intervals:[{day:6, sequence:1, kind:'work', start:'07:00:00', end:'13:00:00', crossesMidnight:false}]});
  const calendar = catalogRecord('calendar', 12, {days:[{date:V3_DAY, kind:'working', code:'qa_workday', evidencePresent:true}]});
  const ruleProfile = catalogRecord('rule_profile', 13, {parameters:[
    {key:'attendance.daily_observation_rule', valueKind:'code', unitCode:'rule', codeValue:'single_work_interval.v1'},
    {key:'attendance.daily_close_delay_seconds', valueKind:'integer', unitCode:'seconds', integerValue:'0'},
  ]});
  const record = catalogRecord('assignment', 14, {targetType:'canonical_employment_contract', targetProjected:false,
    shiftRevision:1, calendarRevision:1, ruleProfileRevision:1});
  const sourceBindingId = id(2);
  return rebindDaily({version:'attendance-daily-source.v1',
    scope:{tenantId:V3_PRINCIPAL.tenant.id, sourceBindingId, area, site:'qa-site', day:V3_DAY, timezone:workdays.timezone},
    cut:{id:id(3), generatedAt:workdays.generatedAt, consistency:'single_snapshot', evidence:evidence(4), componentSha256:{}},
    workdays,
    population:{complete:true, evidence:evidence(5), members:[{contractId:V3_CONTRACT, area:structuredClone(area), expectedDeviceKeys:[hash('device-one')],
      identityBinding:{status:'confirmed', sourceBindingId, historicalContractId:V3_CONTRACT, catalogContractId:V3_CONTRACT,
        validFrom:'2026-11-01', validUntil:'2026-11-30', evidence:evidence(6)}}]},
    catalog:{complete:true, assignments:[{record, assignment:{target:{contractId:V3_CONTRACT, legajo:'9001', name:'Agente sintético'}, shift, calendar, ruleProfile}}]},
    coverage:{status:'confirmed', evidence:evidence(7), sourceRevision:workdays.revision,
      fromAt:V3_DAY+'T00:00:00-03:00', throughAt:'2026-11-15T00:00:00-03:00', contractIds:[V3_CONTRACT], deviceKeys:[hash('device-one')]},
    justifications:{complete:true, evidence:evidence(8), entries:[]},
  });
}
