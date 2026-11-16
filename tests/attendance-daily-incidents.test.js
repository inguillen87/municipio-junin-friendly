import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAttendanceDailyIncidents as evaluate, projectAttendanceDailyNoticeSource, attendanceDailyDigest} from '../lib/attendance-daily-incidents.js';
import {dailyFixture, rebindDaily, id, evidence, V3_DAY, V3_CONTRACT} from './fixtures/attendance-daily-incidents-synthetic.js';
import {v3Events, hash, V3_OTHER_CONTRACT} from './fixtures/continuous-workdays-v3-api-synthetic.js';
const invalid = e => e.code === 'ATTENDANCE_DAILY_SOURCE_INVALID' && e.message === 'ATTENDANCE_DAILY_SOURCE_INVALID';
const has = (result, code) => assert.ok(result.blockerCodes.includes(code), code);
const run = source => evaluate(rebindDaily(source));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('approved explicit schedule and complete supplied cut yield observed counts, never authority or payroll', () => {
  const source = freeze(dailyFixture()), result = evaluate(source);
  assert.equal(result.status, 'observed');
  assert.deepEqual(result.counts, {population:1, observedContracts:1, expectedContracts:1, lateArrivals:0,
    missingMarks:0, incompleteWorkdays:0, extraTimeObservedContracts:0, blockedContracts:0});
  assert.equal(result.rows[0].observedOrdinarySeconds, 21600);
  assert.equal(result.rows[0].contractId, V3_CONTRACT);
  assert.equal(result.rows[0].quantity107, null);
  assert.equal(result.rows[0].absence101Days, null);
  for (const key of ['coverageCertified','payrollEligible','payrollCalculated','payrollPosted','notificationsSent','authorizationVerified','productionReady']) assert.equal(result[key], false);
  assert.equal(result.approvalStatus, 'not_approved');
  assert.deepEqual(result, evaluate(source));
});

test('each component is bound before evaluation; display filtering and unbound metadata are rejected', () => {
  for (const key of ['workdays','population','catalog','coverage','justifications']) {
    const source = dailyFixture(); source.cut.componentSha256[key] = 'f'.repeat(64);
    assert.throws(() => evaluate(source), invalid, key);
  }
  for (const mutate of [s => { s.page = 1; }, s => { s.workdays.filters.search = '9001'; },
    s => { s.workdays.context.recordCount++; }, s => { s.cut.generatedAt = '2026-11-15T04:01:00Z'; },
    s => { s.workdays.events.at(-1).contractId = undefined; }, s => { s.coverage.sourceRevision = id(999); }]) {
    const source = dailyFixture(); mutate(source); assert.throws(() => run(source), invalid);
  }
});

test('separate reads, partial population and missing evidence remain blocked instead of confirming zeros', () => {
  for (const mutate of [s => { s.cut.consistency = 'unconfirmed'; }, s => { s.cut.evidence = null; },
    s => { s.population.complete = false; }, s => { s.population.evidence = null; }]) {
    const source = dailyFixture(); mutate(source); const result = run(source);
    assert.equal(result.status, 'blocked'); assert.equal(result.counts.population, null);
    assert.equal(result.counts.lateArrivals, null); assert.equal(result.counts.missingMarks, null);
  }
});

test('a complete v3 source with no marks is not evidence of collection coverage', () => {
  const source = dailyFixture({events:[]}); source.coverage.status = 'a_confirmar'; source.coverage.evidence = null;
  const result = run(source); has(result, 'COVERAGE_UNCONFIRMED');
  assert.equal(result.rows[0].missingMarks, null); assert.equal(result.counts.missingMarks, null);
  assert.equal(result.rows[0].absence101Days, null);
  source.coverage.status = 'confirmed'; source.coverage.evidence = evidence(7);
  const complete = run(source); assert.equal(complete.rows[0].missingMarks, true);
  assert.equal(complete.counts.missingMarks, 1); assert.equal(complete.rows[0].absence101Days, null);
});

test('absence of events cannot make expected-device coverage vacuously complete', () => {
  for (const mutate of [s => { s.coverage.deviceKeys = []; }, s => { s.coverage.deviceKeys = [hash('different-device')]; },
    s => { s.population.members[0].expectedDeviceKeys = []; }, s => { s.population.members[0].expectedDeviceKeys = null; }]) {
    const source = dailyFixture({events:[]}); mutate(source); const result = run(source);
    has(result, 'COVERAGE_UNCONFIRMED'); assert.equal(result.rows[0].missingMarks, null); assert.equal(result.counts.missingMarks, null);
  }
});

test('fractional SQL timestamps stay valid; impossible dates and canonical terminators do not', () => {
  const source = dailyFixture(); source.workdays.generatedAt = source.cut.generatedAt = '2026-11-15T04:00:00.123456Z';
  const item = source.catalog.assignments[0];
  for (const record of [item.record,item.assignment.shift,item.assignment.calendar,item.assignment.ruleProfile]) {
    record.timestamps.decidedAt = record.timestamps.updatedAt = '2026-10-22T12:00:00.123456+00:00';
  }
  assert.equal(run(source).status, 'observed');
  for (const mutate of [s => { s.cut.generatedAt = s.workdays.generatedAt = '2026-11-31T04:00:00Z'; },
    s => { s.scope.tenantId += '\n'; }, s => { s.cut.evidence.sha256 += '\n'; },
    s => { s.scope.area.organizationUnitSourceId += '\n'; }, s => { s.scope.site += '\n'; }]) {
    const bad = dailyFixture(); mutate(bad); assert.throws(() => run(bad), invalid);
  }
});

test('a day still open, a gap in coverage and missing contract/device coverage each block comparison', () => {
  for (const mutate of [s => { s.workdays.generatedAt = s.cut.generatedAt = '2026-11-15T02:59:00Z'; s.coverage.throughAt = s.cut.generatedAt; },
    s => { s.coverage.fromAt = V3_DAY+'T01:00:00-03:00'; }, s => { s.coverage.contractIds = []; },
    s => { s.coverage.deviceKeys = []; }, s => { s.coverage.throughAt = '2026-11-15T02:59:59Z'; }]) {
    const source = dailyFixture(); mutate(source); const result = run(source);
    assert.equal(result.status, 'blocked'); assert.equal(result.counts.lateArrivals, null); assert.equal(result.counts.missingMarks, null);
  }
});

test('unconfirmed parameters have no median, tolerance, closing delay or factor fallback', () => {
  for (const mutate of [s => { s.catalog.assignments[0].assignment.ruleProfile.configuration.parameters.pop(); },
    s => { s.catalog.assignments[0].assignment.ruleProfile.configuration.parameters[0].codeValue = 'a_confirmar'; },
    s => { s.catalog.assignments[0].assignment.ruleProfile.configuration.parameters[1].integerValue = '172801'; }]) {
    const source = dailyFixture(); mutate(source); const result = run(source);
    has(result, 'OBSERVATION_POLICY_UNCONFIRMED'); has(result, 'DAY_NOT_CLOSED');
    assert.equal(result.rows[0].lateSeconds, null); assert.equal(result.counts.lateArrivals, null);
  }
});

test('lateness uses only the explicit approved tolerance and never converts to 101 or 107', () => {
  const source = dailyFixture(); source.workdays.events[0].occurredAt = V3_DAY+'T07:08:00-03:00';
  source.workdays.events[0].localTimestamp = V3_DAY+' 07:08:00';
  source.catalog.assignments[0].assignment.shift.configuration.entryToleranceSeconds = 300;
  const result = run(source); assert.equal(result.rows[0].lateSeconds, 180); assert.equal(result.counts.lateArrivals, 1);
  has(result, 'TARDINESS_CONVERSION_UNCONFIRMED'); assert.equal(result.rows[0].absence101Days, null); assert.equal(result.rows[0].quantity107, null);
  source.catalog.assignments[0].assignment.shift.configuration.entryToleranceSeconds = 480;
  assert.equal(run(source).rows[0].lateSeconds, 0);
});

test('extra intervals stay observed; no inference of 44/95 from the aggregate GRH history', () => {
  const source = dailyFixture();
  const extras = v3Events().map((e, i) => ({...e, eventRef:hash('extra-'+i), source:{...e.source, ordinal:3+i},
    code:i ? 5 : 4, occurredAt:V3_DAY+'T'+(i ? '15:00:00' : '14:00:00')+'-03:00', localTimestamp:V3_DAY+' '+(i ? '15:00:00' : '14:00:00')}));
  source.workdays.events.push(...extras); source.workdays.context.eventCount += 2; source.workdays.context.recordCount += 2;
  const result = run(source); assert.equal(result.rows[0].observedExtraSeconds, 3600); has(result, 'EXTRA_CONVERSION_UNCONFIRMED');
  assert.equal(result.counts.extraTimeObservedContracts, 1); assert.equal(result.rows[0].payableSeconds, null); assert.equal(result.rows[0].amountArs, null);
});

test('draft, expired or missing catalog dependencies never authorize a schedule', () => {
  for (const key of ['record','shift','calendar','ruleProfile']) {
    const source = dailyFixture(); const item = source.catalog.assignments[0]; const record = key === 'record' ? item.record : item.assignment[key];
    record.status = 'draft'; record.reasonCode = 'catalog_onboarding';
    const result = run(source); has(result, 'CATALOG_UNAPPROVED'); assert.equal(result.rows[0].expected, null);
  }
  const expired = dailyFixture(); expired.catalog.assignments[0].assignment.shift.effectiveTo = '2026-11-13';
  has(run(expired), 'CATALOG_OUT_OF_VALIDITY');
  const absent = dailyFixture(); absent.catalog.assignments = []; has(run(absent), 'ASSIGNMENT_MISSING');
  const incomplete = dailyFixture(); incomplete.catalog.complete = false; has(run(incomplete), 'ASSIGNMENT_MISSING');
});

test('calendar omissions, special days and unsupported split shifts stay explicit', () => {
  const missing = dailyFixture(); missing.catalog.assignments[0].assignment.calendar.configuration.days[0].date = '2026-11-13';
  has(run(missing), 'CALENDAR_DAY_MISSING');
  const special = dailyFixture(); special.catalog.assignments[0].assignment.calendar.configuration.days[0].kind = 'special';
  has(run(special), 'SPECIAL_DAY_UNRESOLVED');
  const split = dailyFixture(); split.catalog.assignments[0].assignment.shift.configuration.intervals.push(
    {day:6, sequence:2, kind:'work', start:'15:00:00', end:'17:00:00', crossesMidnight:false});
  has(run(split), 'SCHEDULE_UNSUPPORTED');
  const holiday = dailyFixture({events:[]}); holiday.catalog.assignments[0].assignment.calendar.configuration.days[0].kind = 'holiday';
  const result = run(holiday); assert.equal(result.counts.expectedContracts, 0); assert.equal(result.counts.missingMarks, 0);
});

test('a historical UUID needs an explicit matching binding; matching legajo or a different UUID is insufficient', () => {
  for (const mutate of [s => { s.population.members[0].identityBinding = null; },
    s => { s.population.members[0].identityBinding.catalogContractId = V3_OTHER_CONTRACT; },
    s => { s.population.members[0].identityBinding.sourceBindingId = id(999); },
    s => { s.population.members[0].identityBinding.validUntil = '2026-11-13'; }]) {
    const source = dailyFixture(); mutate(source); const result = run(source);
    has(result, 'IDENTITY_BINDING_UNCONFIRMED'); assert.equal(result.counts.lateArrivals, null); assert.equal(result.counts.missingMarks, null);
  }
  const wrong = dailyFixture(); wrong.catalog.assignments[0].assignment.target.contractId = V3_OTHER_CONTRACT;
  assert.throws(() => run(wrong), invalid);
});

test('overlapping assignments and multiple streams cannot be merged by contract or legajo', () => {
  const ambiguous = dailyFixture(); const copy = structuredClone(ambiguous.catalog.assignments[0]); copy.record.id = id(100);
  ambiguous.catalog.assignments.push(copy); has(run(ambiguous), 'ASSIGNMENT_AMBIGUOUS');
  const events = [...v3Events(), ...v3Events({stream:'second', device:'second-device', ordinal:3})];
  const multiple = dailyFixture({events}); multiple.coverage.deviceKeys.push(hash('second-device'));
  const result = run(multiple); has(result, 'MULTIPLE_STREAMS_UNRESOLVED'); assert.equal(result.counts.observedContracts, 1);
  assert.equal(result.rows[0].lateSeconds, null); assert.equal(result.rows[0].missingMarks, null);
  assert.equal(result.rows[0].observedOrdinarySeconds, null); assert.equal(result.rows[0].observations.length, 2);
});

test('foreign and unlinked events are validated and block the entire supplied cut before projection', () => {
  for (const events of [v3Events({contractId:V3_OTHER_CONTRACT}), v3Events({identityState:'unmapped'})]) {
    const source = dailyFixture({events}); const result = run(source); has(result, 'OUT_OF_SCOPE_EVENTS');
    assert.equal(result.counts.missingMarks, null); assert.equal(result.counts.observedContracts, 0);
  }
  const malformed = dailyFixture(); malformed.workdays.events[1].localTimestamp = '2026-11-14 99:00:00';
  assert.throws(() => run(malformed), invalid);
});

test('missing boundaries and unplaced observations never become absence or elapsed payable time', () => {
  const missing = dailyFixture({events:v3Events().slice(0,1)}); const result = run(missing);
  has(result, 'WORKDAY_REVIEW_REQUIRED'); assert.equal(result.counts.incompleteWorkdays, 1); assert.equal(result.counts.missingMarks, null);
  const unplaced = dailyFixture(); unplaced.workdays.observations.push({eventRef:hash('unplaced'), deviceKey:hash('device-one'),
    source:{kind:'receipt', id:id(300), ordinal:3}, occurredAt:null, localTimestamp:null, issues:['timestamp_unusable']});
  unplaced.workdays.context.recordCount++; unplaced.workdays.context.observationCount++;
  has(run(unplaced), 'WORKDAY_REVIEW_REQUIRED');
});

test('observed pauses also require a reviewed matching rule, even when v3 closes the interval', () => {
  const source = dailyFixture();
  const pauses = [[2,'09:00:00'],[3,'09:15:00']].map(([code,time], i) => ({...structuredClone(source.workdays.events[0]),
    eventRef:hash('pause-'+i), source:{kind:'receipt',id:id(303),ordinal:i+1}, code,
    occurredAt:V3_DAY+'T'+time+'-03:00', localTimestamp:V3_DAY+' '+time}));
  source.workdays.events.push(...pauses); source.workdays.context.recordCount += 2; source.workdays.context.eventCount += 2;
  const result = run(source); has(result, 'SCHEDULE_UNSUPPORTED'); assert.equal(result.rows[0].lateSeconds, null);
});

test('an empty population cannot mask an unknown global cut with vacuous zero counts', () => {
  const source = dailyFixture({events:[]}); source.population.members = []; source.catalog.assignments = [];
  source.coverage.contractIds = []; source.coverage.status = 'a_confirmar'; source.coverage.evidence = null;
  const result = run(source); assert.equal(result.counts.population, 0); assert.equal(result.counts.missingMarks, null);
  assert.equal(result.counts.expectedContracts, null); assert.equal(result.counts.lateArrivals, null);
});

test('justifications are independently required; approved leave does not silently become an unjustified 101 day', () => {
  const source = dailyFixture({events:[]}); source.justifications.complete = false;
  has(run(source), 'JUSTIFICATIONS_UNCONFIRMED'); assert.equal(run(source).counts.missingMarks, null);
  source.justifications.complete = true;
  source.justifications.entries = [{id:id(301), contractId:V3_CONTRACT, status:'approved',
    fromAt:V3_DAY+'T07:00:00-03:00', throughAt:V3_DAY+'T13:00:00-03:00', evidence:evidence(302)}];
  const approved = run(source); assert.equal(approved.rows[0].justificationStatus, 'approved_covering_shift');
  assert.equal(approved.rows[0].missingMarks, true); assert.equal(approved.rows[0].absence101Days, null);
  source.justifications.entries[0].status = 'pending'; has(run(source), 'JUSTIFICATIONS_UNCONFIRMED');
});

test('notice projection carries only fixed aggregate fields and changes key with the supplied cut', () => {
  const source = dailyFixture(), result = run(source), notice = projectAttendanceDailyNoticeSource(result);
  assert.deepEqual(Object.keys(notice).sort(), ['version','key','day','status','counts','blockerCodes','coverageCertified','approvalStatus','payrollEligible'].sort());
  const text = JSON.stringify(notice);
  for (const value of [V3_CONTRACT, '9001', 'Agente sintético', source.scope.tenantId, source.workdays.events[0].eventRef]) assert.ok(!text.includes(value));
  source.catalog.assignments[0].assignment.shift.configuration.entryToleranceSeconds = 60;
  assert.notEqual(run(source).key, result.key);
  assert.equal(attendanceDailyDigest({b:2,a:1}), attendanceDailyDigest({a:1,b:2}));
});
