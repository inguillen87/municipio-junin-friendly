// Synthetic catalog payloads only. No municipal employee or source bytes.
import {ID, TENANT, MEMBER, session, principal as original} from './native-employee-synthetic.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {timeCatalogHash} from '../../lib/internal-time-catalog.js';
export {ID, TENANT, MEMBER, session};
export const principal = {...original, tenant: {...original.tenant, effectiveCapabilities: ['time.catalog.read', 'time.catalog.propose']}};
export const sqlPrincipal = {roleKey: 'QA_PROPOSER', authorityVersion: 1, capabilities: ['time.catalog.read', 'time.catalog.propose'], areaScopes: [], scopeVersion: 'b'.repeat(64)};
export const scopeVersion = timeCatalogHash(employeeContext(principal, session)) + '.' + sqlPrincipal.scopeVersion;
export const payload = (kind = 'rule_profile') => ({effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31', logicalKeyHash: 'c'.repeat(64), revision: 1, timezone: 'America/Argentina/Mendoza', spec: {
  calendar: {days: [{date: '2026-10-12', kind: 'holiday', code: 'qa_holiday', evidenceSha256: 'd'.repeat(64)}]},
  shift: {entryToleranceSeconds: 0, exitToleranceSeconds: 0, intervals: [{day: 7, sequence: 1, kind: 'work', start: '22:00:00', end: '02:00:00', crossesMidnight: true}]},
  rule_profile: {parameters: [{key: 'qa_large_decimal', valueKind: 'decimal', unitCode: 'qa_units', value: '99999999999999.123456'}, {key: 'qa_large_integer', valueKind: 'integer', unitCode: 'qa_units', value: '999999999999999999'}, {key: 'qa_boolean', valueKind: 'boolean', unitCode: 'qa_flag', value: false}]},
  assignment: {employmentContractId: ID, shiftEntryId: ID, calendarEntryId: ID, ruleProfileEntryId: ID},
}[kind]});
export const command = (patch = {}) => ({command: 'create_draft', kind: 'rule_profile', id: null, expectedVersion: 0, payload: payload(), reasonCode: 'catalog_onboarding', reason: 'Declaración sintética para pruebas de catálogo.', manualValidationConfirmed: false, scopeVersion, ...patch});
export function record(body = command()) {
  const p = body.payload ?? payload(body.kind || 'rule_profile'), kind = body.kind || 'rule_profile';
  let configuration = structuredClone(p.spec);
  if (kind === 'calendar') configuration.days = configuration.days.map(({evidenceSha256, ...r}) => ({...r, evidencePresent: evidenceSha256 !== undefined}));
  if (kind === 'rule_profile') configuration.parameters = configuration.parameters.map(p => ({key: p.key, valueKind: p.valueKind, unitCode: p.unitCode, [({integer: 'integerValue', decimal: 'decimalValue', boolean: 'booleanValue'})[p.valueKind]]: p.value})).sort((a, b) => a.key.localeCompare(b.key));
  if (kind === 'assignment') configuration = {targetType: 'canonical_employment_contract', targetProjected: false, shiftRevision: 1, calendarRevision: 1, ruleProfileRevision: 1};
  return {id: body.id ?? ID, kind, revision: p.revision, effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo, timezone: p.timezone, sourceLinked: false,
    status: ({create_draft: 'draft', update_draft: 'draft', submit: 'submitted', approve: 'approved', reject: 'rejected', retire: 'retired'})[body.command],
    version: body.expectedVersion + 1, reasonCode: body.reasonCode, configuration, timestamps: {createdAt: '2026-10-02T12:00:00+00:00', updatedAt: '2026-10-02T12:00:00+00:00'}};
}
export const flags = {catalogReady: false, attendanceEvaluationReady: false, punchesLoaded: false, minutesCalculated: false, payrollPosted: false, grhMutation: false};
export const bootstrap = () => ({principal: sqlPrincipal, summary: {calendar: 1, shift: 1, ruleProfile: 1, assignment: 0, submitted: 0}, ...flags});
export const receipt = (body = command(), patch = {}) => ({data: record(body), replayed: false, requestSha256: timeCatalogHash({version: 'time-catalog.v1', context: employeeContext(principal, session), body}), attemptKey: ID, ...flags, ...patch});
// Emulates PostgreSQL ::text, including exact JSON numeric tokens. Deliberately
// never obtains decimal/integer values by coercing them to a JS Number.
export function sqlText(value) {
  return JSON.stringify(value).replace(/"(decimalValue|integerValue)":"(-?\d+(?:\.\d+)?)"/g, '"$1":$2');
}
