import {createHash} from 'node:crypto';
import {timeCatalogRecord, timeCatalogAssignment} from '../assets/time-catalog-contract.js';
import {ATTENDANCE_DAILY_BLOCKER_CODES, attendanceDailyNotice} from '../assets/attendance-daily-notice.js';
import {validateContinuousWorkdaySourceV3} from './internal-attendance-workdays.js';
import {reconstructContinuousWorkdaysV3} from './attendance-workdays-v3.js';

export const ATTENDANCE_DAILY_SOURCE_VERSION = 'attendance-daily-source.v1';
export const ATTENDANCE_DAILY_INCIDENTS_VERSION = 'attendance-daily-incidents.v2';
export const DAILY_OBSERVATION_RULE = 'single_work_interval.v1';
const COMPONENTS = ['workdays', 'population', 'catalog', 'coverage', 'justifications'];
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const NIL = '00000000-0000-0000-0000-000000000000';
const matches = (pattern, value) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const uuid = v => matches(UUID, v) && v !== NIL;
const hash = v => matches(HASH, v);
const exact = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  [Object.prototype,null].includes(Object.getPrototypeOf(v)) && keys.length === Reflect.ownKeys(v).length &&
  keys.every(k => { const d = Object.getOwnPropertyDescriptor(v,k); return d && d.enumerable && Object.hasOwn(d,'value'); });
const date = v => matches(/^20\d\d-\d\d-\d\d$/, v) &&
  Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const timestamp = v => matches(/^20\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/, v) &&
  date(v.slice(0,10)) && Number.isFinite(Date.parse(v));
const list = (v, max = 5000) => Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= max &&
  Reflect.ownKeys(v).length === v.length + 1 && Array.from({length:v.length}, (_, i) => Object.hasOwn(v,i)).every(Boolean);
const unique = (rows, key = v => v) => new Set(rows.map(key)).size === rows.length;
const sourceId = v => matches(/^(?:0|[1-9]\d{0,18})$/, v);
const evidence = v => exact(v, ['id', 'sha256']) && uuid(v.id) && hash(v.sha256);
const optionalEvidence = v => v === null || evidence(v);
const area = v => exact(v, ['organizationUnitSourceId', 'sectorSourceId']) &&
  sourceId(v.organizationUnitSourceId) && (v.sectorSourceId === null || sourceId(v.sectorSourceId));
const sameArea = (a, b) => a.organizationUnitSourceId === b.organizationUnitSourceId && a.sectorSourceId === b.sectorSourceId;
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object'
  ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
export const attendanceDailyDigest = v => createHash('sha256').update(canonical(v)).digest('hex');
function requireDaily(ok) {
  if (!ok) throw Object.assign(new Error('ATTENDANCE_DAILY_SOURCE_INVALID'), {code:'ATTENDANCE_DAILY_SOURCE_INVALID'});
}
const shiftDay = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const validOn = (record, day) => record.effectiveFrom <= day && (!record.effectiveTo || record.effectiveTo >= day);

// Resolve a civil boundary in the explicitly supplied IANA zone. A repeated or
// nonexistent local time is not repaired. No fixed UTC offset or host zone.
function civilInstant(day, time, timezone, cache) {
  const key = day + ' ' + time;
  if (cache.has(key)) return cache.get(key);
  const civil = Date.parse(day + 'T' + time + 'Z');
  const format = new Intl.DateTimeFormat('sv-SE', {timeZone:timezone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'});
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = civil + hours * 3600000;
    const local = format.format(new Date(probe)).replace(',', '').replace(' ', 'T');
    offsets.add(Date.parse(local + 'Z') - probe);
  }
  const candidates = [...offsets].map(offset => civil - offset)
    .filter(ms => format.format(new Date(ms)).replace(',', '') === key);
  const result = candidates.length === 1 ? candidates[0] : null;
  cache.set(key, result);
  return result;
}

/**
 * Validate supplied bytes and bindings, not database authority. A future scoped
 * producer must authenticate the reader, prove the joint snapshot and restrict
 * all five components before calling this pure evaluator. No caller-supplied
 * approval flag is a substitute for that producer. There is no HTTP endpoint.
 */
function validateSource(input) {
  requireDaily(exact(input, ['version', 'scope', 'cut', ...COMPONENTS]) && input.version === ATTENDANCE_DAILY_SOURCE_VERSION);
  requireDaily(Buffer.byteLength(JSON.stringify(input)) <= 25 * 1024 * 1024);
  const {scope, cut, workdays, population, catalog, coverage, justifications} = input;
  requireDaily(exact(scope, ['tenantId', 'sourceBindingId', 'area', 'site', 'day', 'timezone']) &&
    uuid(scope.tenantId) && uuid(scope.sourceBindingId) && area(scope.area) && date(scope.day) &&
    matches(/^[a-z0-9][a-z0-9_-]{0,79}$/, scope.site) && scope.timezone === 'America/Argentina/Mendoza');
  requireDaily(exact(cut, ['id', 'generatedAt', 'consistency', 'evidence', 'componentSha256']) && uuid(cut.id) && timestamp(cut.generatedAt) &&
    ['single_snapshot', 'unconfirmed'].includes(cut.consistency) && optionalEvidence(cut.evidence) && exact(cut.componentSha256, COMPONENTS));
  for (const name of COMPONENTS) requireDaily(hash(cut.componentSha256[name]) && cut.componentSha256[name] === attendanceDailyDigest(input[name]));
  try { validateContinuousWorkdaySourceV3(workdays, {source:'continuous', site:scope.site, day:scope.day, snapshot:workdays?.revision}); }
  catch { requireDaily(false); }
  requireDaily(workdays.timezone === scope.timezone && workdays.generatedAt === cut.generatedAt &&
    workdays.events.every(e => Date.parse(e.occurredAt) <= Date.parse(cut.generatedAt)) &&
    workdays.observations.every(e => e.occurredAt === null || Date.parse(e.occurredAt) <= Date.parse(cut.generatedAt)));

  requireDaily(exact(population, ['complete', 'evidence', 'members']) && typeof population.complete === 'boolean' &&
    optionalEvidence(population.evidence) && list(population.members) && unique(population.members, m => m.contractId));
  for (const member of population.members) {
    requireDaily(exact(member, ['contractId', 'area', 'identityBinding', 'expectedDeviceKeys']) && uuid(member.contractId) && area(member.area) && sameArea(member.area, scope.area) &&
      (member.expectedDeviceKeys === null || list(member.expectedDeviceKeys,10000) && unique(member.expectedDeviceKeys) && member.expectedDeviceKeys.every(hash)));
    const binding = member.identityBinding;
    if (binding === null) continue;
    requireDaily(exact(binding, ['status', 'sourceBindingId', 'historicalContractId', 'catalogContractId', 'validFrom', 'validUntil', 'evidence']) &&
      ['confirmed', 'a_confirmar'].includes(binding.status) && uuid(binding.sourceBindingId) && uuid(binding.historicalContractId) && uuid(binding.catalogContractId) &&
      date(binding.validFrom) && (binding.validUntil === null || date(binding.validUntil) && binding.validUntil >= binding.validFrom) && optionalEvidence(binding.evidence));
  }
  const ids = new Set(population.members.map(m => m.contractId));
  requireDaily(exact(catalog, ['complete', 'assignments']) && typeof catalog.complete === 'boolean' &&
    list(catalog.assignments, 10000) && unique(catalog.assignments, a => a.record?.id));
  const records = new Map();
  for (const item of catalog.assignments) {
    requireDaily(exact(item, ['record', 'assignment']));
    try { timeCatalogRecord(item.record); timeCatalogAssignment(item.assignment, item.record); } catch { requireDaily(false); }
    requireDaily(uuid(item.assignment.target.contractId) && ids.has(item.assignment.target.contractId));
    for (const record of [item.record, item.assignment.shift, item.assignment.calendar, item.assignment.ruleProfile]) {
      requireDaily(uuid(record.id) && record.timezone === scope.timezone &&
        Object.values(record.timestamps).every(t => timestamp(t) && Date.parse(t) <= Date.parse(cut.generatedAt)));
      const digest = attendanceDailyDigest(record);
      requireDaily(!records.has(record.id) || records.get(record.id) === digest);
      records.set(record.id, digest);
    }
  }
  requireDaily(exact(coverage, ['status', 'evidence', 'sourceRevision', 'fromAt', 'throughAt', 'contractIds', 'deviceKeys']) &&
    ['confirmed', 'a_confirmar'].includes(coverage.status) && optionalEvidence(coverage.evidence) && coverage.sourceRevision === workdays.revision &&
    timestamp(coverage.fromAt) && timestamp(coverage.throughAt) && Date.parse(coverage.throughAt) >= Date.parse(coverage.fromAt) &&
    Date.parse(coverage.throughAt) <= Date.parse(cut.generatedAt) && list(coverage.contractIds) && unique(coverage.contractIds) &&
    coverage.contractIds.every(id => uuid(id) && ids.has(id)) && list(coverage.deviceKeys, 10000) && unique(coverage.deviceKeys) && coverage.deviceKeys.every(hash));
  requireDaily(exact(justifications, ['complete', 'evidence', 'entries']) && typeof justifications.complete === 'boolean' &&
    optionalEvidence(justifications.evidence) && list(justifications.entries, 10000) && unique(justifications.entries, e => e.id));
  for (const entry of justifications.entries) requireDaily(exact(entry, ['id', 'contractId', 'status', 'fromAt', 'throughAt', 'evidence']) &&
    uuid(entry.id) && ids.has(entry.contractId) && ['approved', 'pending', 'rejected'].includes(entry.status) &&
    timestamp(entry.fromAt) && timestamp(entry.throughAt) && Date.parse(entry.throughAt) > Date.parse(entry.fromAt) && evidence(entry.evidence));
  return input;
}

function approved(record) {
  return record.status === 'approved' && record.reasonCode === 'configuration_verified' &&
    timestamp(record.timestamps.decidedAt) && Date.parse(record.timestamps.decidedAt) <= Date.parse(record.timestamps.updatedAt);
}
function observationParameters(profile) {
  const parameters = new Map(profile.configuration.parameters.map(p => [p.key, p]));
  const rule = parameters.get('attendance.daily_observation_rule');
  const delay = parameters.get('attendance.daily_close_delay_seconds');
  if (rule?.valueKind !== 'code' || rule.unitCode !== 'rule' || rule.codeValue !== DAILY_OBSERVATION_RULE ||
    delay?.valueKind !== 'integer' || delay.unitCode !== 'seconds' || typeof delay.integerValue !== 'string' ||
    !matches(/^(?:0|[1-9]\d{0,5})$/, delay.integerValue) || Number(delay.integerValue) > 172800) return null;
  return {closeDelaySeconds:Number(delay.integerValue)};
}

/** One complete, explicit civil day. No pagination, legajo join or inferred shift. */
export function evaluateAttendanceDailyIncidents(input) {
  try { validateSource(input); } catch { requireDaily(false); }
  const {scope, cut, workdays, population, catalog, coverage, justifications} = input;
  let reconstructed;
  try { reconstructed = reconstructContinuousWorkdaysV3(workdays); } catch { requireDaily(false); }
  const globalBlockers = new Set(), rows = [], civilCache = new Map();
  const add = (set, code) => { requireDaily(ATTENDANCE_DAILY_BLOCKER_CODES.includes(code)); set.add(code); };
  if (!workdays.nominalReadAllowed) add(globalBlockers, 'SOURCE_NOMINAL_REQUIRED');
  if (cut.consistency !== 'single_snapshot' || cut.evidence === null) add(globalBlockers, 'JOINT_CUT_UNCONFIRMED');
  if (!population.complete || population.evidence === null) add(globalBlockers, 'POPULATION_INCOMPLETE');
  if (!catalog.complete) add(globalBlockers, 'ASSIGNMENT_MISSING');
  if (!population.members.length) {
    // There is no assignment profile from which to obtain a closing delay.
    // An empty scope must not silently supply zero as a municipal parameter.
    add(globalBlockers, 'OBSERVATION_POLICY_UNCONFIRMED');
    add(globalBlockers, 'DAY_NOT_CLOSED');
  }
  if (!justifications.complete || justifications.evidence === null) add(globalBlockers, 'JUSTIFICATIONS_UNCONFIRMED');
  const populationIds = new Set(population.members.map(m => m.contractId));
  if (workdays.events.some(e => e.contractId === null || !populationIds.has(e.contractId))) add(globalBlockers, 'OUT_OF_SCOPE_EVENTS');
  if (workdays.observations.length) add(globalBlockers, 'WORKDAY_REVIEW_REQUIRED');
  if (coverage.status !== 'confirmed' || coverage.evidence === null) add(globalBlockers, 'COVERAGE_UNCONFIRMED');
  const startOfDay = civilInstant(scope.day, '00:00:00', scope.timezone, civilCache);
  const endOfDay = civilInstant(shiftDay(scope.day, 1), '00:00:00', scope.timezone, civilCache);
  const byContract = new Map(), assignmentsByContract = new Map();
  for (const row of reconstructed.rows) {
    if (!byContract.has(row.contractId)) byContract.set(row.contractId, []);
    byContract.get(row.contractId).push(row);
  }
  for (const item of catalog.assignments) {
    const id = item.assignment.target.contractId;
    if (!assignmentsByContract.has(id)) assignmentsByContract.set(id, []);
    assignmentsByContract.get(id).push(item);
  }
  const coveredIds = new Set(coverage.contractIds), coveredDevices = new Set(coverage.deviceKeys);
  for (const member of [...population.members].sort((a, b) => a.contractId.localeCompare(b.contractId))) {
    const blockers = new Set(globalBlockers), observed = byContract.get(member.contractId) ?? [];
    const binding = member.identityBinding;
    const bindingValid = !!binding && !(binding.status !== 'confirmed' || binding.sourceBindingId !== scope.sourceBindingId ||
      binding.historicalContractId !== member.contractId || binding.catalogContractId !== member.contractId || binding.evidence === null ||
      binding.validFrom > scope.day || binding.validUntil !== null && binding.validUntil < scope.day);
    if (!bindingValid) add(blockers, 'IDENTITY_BINDING_UNCONFIRMED');
    const candidates = (assignmentsByContract.get(member.contractId) ?? []).filter(item => validOn(item.record, scope.day) && item.record.status !== 'retired' && item.record.status !== 'rejected');
    if (!candidates.length) add(blockers, 'ASSIGNMENT_MISSING');
    if (candidates.length > 1) add(blockers, 'ASSIGNMENT_AMBIGUOUS');
    const selection = candidates.length === 1 ? candidates[0] : null;
    let schedule = null, expected = null, parameters = null, lateSeconds = null, rawLateSeconds = null,
      tardinessThresholdExceeded = null, missingMarks = null, justificationStatus = 'unconfirmed';
    if (selection) {
      const {record, assignment:{shift, calendar, ruleProfile}} = selection;
      const dependencies = [record, shift, calendar, ruleProfile];
      if (!dependencies.every(approved)) add(blockers, 'CATALOG_UNAPPROVED');
      if (!dependencies.every(r => validOn(r, scope.day))) add(blockers, 'CATALOG_OUT_OF_VALIDITY');
      parameters = approved(ruleProfile) && validOn(ruleProfile, scope.day) ? observationParameters(ruleProfile) : null;
      if (!parameters) add(blockers, 'OBSERVATION_POLICY_UNCONFIRMED');
      const day = calendar.configuration.days.find(d => d.date === scope.day);
      if (!day) add(blockers, 'CALENDAR_DAY_MISSING');
      else if (day.kind === 'special') add(blockers, 'SPECIAL_DAY_UNRESOLVED');
      else if (bindingValid && dependencies.every(approved) && dependencies.every(r => validOn(r, scope.day))) {
        expected = day.kind === 'working';
        if (expected) {
          const weekday = new Date(scope.day + 'T00:00:00Z').getUTCDay() || 7;
          const intervals = shift.configuration.intervals.filter(i => i.day === weekday);
          // Multiple work intervals, pauses and on-call periods need a separately
          // approved matching rule. Never infer a first/last pair for them.
          if (intervals.length !== 1 || intervals[0].kind !== 'work') add(blockers, 'SCHEDULE_UNSUPPORTED');
          else {
            const interval = intervals[0];
            const from = civilInstant(scope.day, interval.start, scope.timezone, civilCache);
            const through = civilInstant(shiftDay(scope.day, interval.crossesMidnight ? 1 : 0), interval.end, scope.timezone, civilCache);
            if (from === null || through === null || through <= from) add(blockers, 'SCHEDULE_UNSUPPORTED');
            else schedule = {from, through, entryToleranceSeconds:shift.configuration.entryToleranceSeconds};
          }
        }
      }
    }
    if (observed.length > 1) add(blockers, 'MULTIPLE_STREAMS_UNRESOLVED');
    if (observed.some(row => row.status !== 'closed' || row.issues.length)) add(blockers, 'WORKDAY_REVIEW_REQUIRED');
    if (observed.some(row => row.intervals.some(i => i.pauseSeconds > 0 || i.pauseEventRefs.length > 0))) add(blockers, 'SCHEDULE_UNSUPPORTED');
    if (startOfDay === null || endOfDay === null) add(blockers, 'SCHEDULE_UNSUPPORTED');
    const closure = endOfDay === null || parameters === null ? null : Math.max(endOfDay, schedule?.through ?? endOfDay) + parameters.closeDelaySeconds * 1000;
    const dayClosed = closure !== null && Date.parse(cut.generatedAt) >= closure && expected !== null && (expected === false || schedule !== null);
    if (!dayClosed) add(blockers, 'DAY_NOT_CLOSED');
    const expectedDevices = member.expectedDeviceKeys;
    if (!expectedDevices?.length || !coveredIds.has(member.contractId) || expectedDevices?.some(key => !coveredDevices.has(key)) ||
      observed.some(row => !coveredDevices.has(row.deviceKey) || !expectedDevices?.includes(row.deviceKey)) || startOfDay === null ||
      Date.parse(coverage.fromAt) > startOfDay || closure === null || Date.parse(coverage.throughAt) < closure) add(blockers, 'COVERAGE_UNCONFIRMED');
    const entries = justifications.entries.filter(e => e.contractId === member.contractId);
    if (justifications.complete && justifications.evidence !== null && schedule) {
      const overlapping = entries.filter(e => Date.parse(e.fromAt) < schedule.through && Date.parse(e.throughAt) > schedule.from);
      if (overlapping.some(e => e.status === 'pending')) add(blockers, 'JUSTIFICATIONS_UNCONFIRMED');
      justificationStatus = overlapping.some(e => e.status === 'approved' && Date.parse(e.fromAt) <= schedule.from && Date.parse(e.throughAt) >= schedule.through)
        ? 'approved_covering_shift' : overlapping.some(e => e.status !== 'rejected') ? 'partial_or_pending' : 'none';
    }
    // Source/cut/scope/coverage must be complete even for an apparent zero. Raw
    // reconstructed seconds remain observations when this comparison is blocked.
    if (blockers.size === 0) {
      if (expected === false) { lateSeconds = 0; tardinessThresholdExceeded = false; missingMarks = false; }
      else if (expected === true && schedule) {
        const ordinary = observed.flatMap(row => row.intervals.filter(i => i.kind === 'ordinary'));
        if (ordinary.length > 1) add(blockers, 'SCHEDULE_UNSUPPORTED');
        else if (ordinary.length === 1) {
          const interval = ordinary[0];
          if (Date.parse(interval.startAt) >= schedule.through || Date.parse(interval.endAt) <= schedule.from) add(blockers, 'SCHEDULE_UNSUPPORTED');
          else {
            rawLateSeconds = Math.max(0, (Date.parse(interval.startAt) - schedule.from) / 1000);
            tardinessThresholdExceeded = rawLateSeconds > schedule.entryToleranceSeconds;
            // Retain the original excess observation, but do not choose whether
            // payroll should use raw delay or excess after the threshold.
            lateSeconds = Math.max(0, rawLateSeconds - schedule.entryToleranceSeconds);
            missingMarks = false;
          }
        } else if (observed.length === 0) { missingMarks = true; }
        else add(blockers, 'WORKDAY_REVIEW_REQUIRED');
      }
    }
    // Multiple clocks may describe the same time. Keep their observations
    // separate; do not publish their sum as one contract's elapsed time.
    const observedOrdinarySeconds = observed.length > 1 ? null : observed.reduce((sum, row) => sum + row.ordinarySeconds, 0);
    const observedExtraSeconds = observed.length > 1 ? null : observed.reduce((sum, row) => sum + row.extraSeconds, 0);
    const extraTimeObserved = observed.some(row => row.extraSeconds > 0);
    if (lateSeconds !== null && lateSeconds > 0) add(blockers, 'TARDINESS_CONVERSION_UNCONFIRMED');
    if (extraTimeObserved) add(blockers, 'EXTRA_CONVERSION_UNCONFIRMED');
    rows.push({contractId:member.contractId, expected, observedWorkdays:observed.length,
      observedOrdinarySeconds, observedExtraSeconds, extraTimeObserved, rawLateSeconds,
      entryToleranceSeconds:schedule?.entryToleranceSeconds ?? null, tardinessThresholdExceeded,
      lateSeconds, payrollTardinessSeconds:null, missingMarks, justificationStatus, dayClosed,
      blockerCodes:[...blockers].sort(), assignmentId:selection?.record.id ?? null,
      observations:observed.map(row => ({deviceKey:row.deviceKey, ordinarySeconds:row.ordinarySeconds, extraSeconds:row.extraSeconds})),
      eventRefs:observed.flatMap(row => row.events.map(e => e.eventRef)).sort(),
      absence101Days:null, quantity107:null, payableSeconds:null, amountArs:null});
  }
  const allCodes = new Set([...globalBlockers, ...rows.flatMap(row => row.blockerCodes)]);
  const populationKnown = population.complete && population.evidence !== null && cut.consistency === 'single_snapshot' && cut.evidence !== null;
  const countIfKnown = (known, match) => populationKnown && globalBlockers.size === 0 && rows.every(known) ? rows.filter(match).length : null;
  const counts = {
    population:populationKnown ? rows.length : null,
    observedContracts:rows.filter(row => row.observedWorkdays > 0).length,
    expectedContracts:countIfKnown(row => row.expected !== null, row => row.expected === true),
    lateArrivals:countIfKnown(row => row.lateSeconds !== null || row.missingMarks === true, row => row.lateSeconds !== null && row.lateSeconds > 0),
    missingMarks:countIfKnown(row => row.missingMarks !== null, row => row.missingMarks === true),
    missingMarksToReview:countIfKnown(row => row.missingMarks !== null, row => row.missingMarks === true && row.justificationStatus !== 'approved_covering_shift'),
    justifiedMissingMarks:countIfKnown(row => row.missingMarks !== null, row => row.missingMarks === true && row.justificationStatus === 'approved_covering_shift'),
    incompleteWorkdays:reconstructed.rows.filter(row => populationIds.has(row.contractId) && row.status !== 'closed').length,
    extraTimeObservedContracts:rows.filter(row => row.extraTimeObserved).length,
    blockedContracts:rows.filter(row => row.blockerCodes.length > 0).length,
  };
  const {day, ...noticeScope} = scope;
  const dayClosed = populationKnown && catalog.complete && rows.length > 0 && rows.every(row => row.dayClosed);
  return {version:ATTENDANCE_DAILY_INCIDENTS_VERSION, key:attendanceDailyDigest(input), scopeKey:attendanceDailyDigest(noticeScope),
    dayClosed, scope:structuredClone(scope),
    day:scope.day, generatedAt:cut.generatedAt, sourceRevision:workdays.revision, cutId:cut.id,
    status:allCodes.size ? 'blocked' : 'observed', counts, blockerCodes:[...allCodes].sort(), rows,
    coverageCertified:false, approvalStatus:'not_approved', payrollEligible:false, payrollCalculated:false,
    payrollPosted:false, notificationsSent:false, authorizationVerified:false, productionReady:false};
}

/** Explicit minimization before any future authorized bell reader. No names/IDs. */
export function projectAttendanceDailyNoticeSource(result) {
  requireDaily(result?.version === ATTENDANCE_DAILY_INCIDENTS_VERSION && result.authorizationVerified === false && result.productionReady === false);
  const source = {version:'attendance-daily-notice-source.v2', key:result.key, scopeKey:result.scopeKey, dayClosed:result.dayClosed,
    day:result.day, status:result.status,
    counts:structuredClone(result.counts), blockerCodes:[...result.blockerCodes], coverageCertified:result.coverageCertified,
    approvalStatus:result.approvalStatus, payrollEligible:result.payrollEligible};
  attendanceDailyNotice(source);
  return source;
}
