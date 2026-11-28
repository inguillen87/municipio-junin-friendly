import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reconstructContinuousWorkdays} from '../lib/attendance-workdays.js';
import {CLOCK_WORKDAY_SOURCE_V3_VERSION, CLOCK_WORKDAYS_V3_VERSION,
  assertContinuousWorkdayIdentitiesV3, reconstructContinuousWorkdaysV3} from '../lib/attendance-workdays-v3.js';

// Synthetic identities only. These tests neither query nor validate installed SQL.
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const day = '2026-09-09', timezone = 'America/Argentina/Mendoza';
const contractA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const contractB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const history = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const receipt = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const revision = 'dddddddd-dddd-5ddd-8ddd-dddddddddddd';
function event(seed, code, time, patch = {}) {
  return {eventRef:hash(seed), deviceKey:hash('device'), source:{kind:'historical', id:history, ordinal:1},
    model:'K20/ID', personKey:hash('person'), streamKey:hash('stream'), personLabel:'Agente sintético', legajo:'9001',
    identityState:'mapped', contractId:contractA, code, issues:[],
    occurredAt:`${day}T${time}-03:00`, localTimestamp:`${day} ${time}`, ...patch};
}
const pair = () => [event('entry', 0, '07:00:00'), event('exit', 1, '13:00:00', {source:{kind:'receipt', id:receipt, ordinal:1}})];
function observation(patch = {}) {
  return {eventRef:hash('unplaced'), deviceKey:hash('device'), source:{kind:'receipt', id:receipt, ordinal:2},
    occurredAt:null, localTimestamp:null, issues:['timestamp_unusable'], ...patch};
}
function fixture(events = pair(), patch = {}) {
  const observations = patch.observations ?? [];
  return {version:CLOCK_WORKDAY_SOURCE_V3_VERSION, generatedAt:'2026-09-15T10:00:00Z', sourceMode:'continuous',
    revision, rulesVersion:'declared-intervals.v2', site:{key:'pm-10', label:'Sitio sintético'}, timezone, nominalReadAllowed:true,
    filters:{from:day, to:day, anchoredToLatest:false}, context:{from:'2026-09-08', to:'2026-09-10',
      recordCount:events.length + observations.length, eventCount:events.length, observationCount:observations.length},
    collection:{status:'continuous_receipts', sourceComplete:true, captureCount:1, receiptCount:1, batchCount:1,
      lastReceiptAt:'2026-09-15T09:59:00Z', periodCoverageCertified:false, automaticCollectorVerified:false},
    events, observations, ...patch};
}
const invalidIdentity = error => error.code === 'ATTENDANCE_WORKDAY_IDENTITY_INVALID' &&
  error.message === 'ATTENDANCE_WORKDAY_IDENTITY_INVALID';
const stripRowIdentity = result => ({...result, rows:result.rows.map(({contractId, ...row}) => row)});
function v2Result(source) {
  return reconstructContinuousWorkdays({events:source.events.map(({contractId, ...event}) => event),
    observations:source.observations, from:source.filters.from, to:source.filters.to, timezone:source.timezone});
}
function freezeTree(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

test('v3 carries the exact historical contract and preserves declared-intervals.v2 without payroll approval', () => {
  const source = fixture();
  assert.equal(assertContinuousWorkdayIdentitiesV3(source), source);
  const result = reconstructContinuousWorkdaysV3(source), row = result.rows[0];
  assert.equal(CLOCK_WORKDAYS_V3_VERSION, 'clock-workdays.v3');
  assert.equal(row.contractId, contractA);
  assert.equal(row.ordinarySeconds, 21600);
  assert.equal(result.version, 'declared-intervals.v2');
  assert.equal(result.rules.homologationStatus, 'unverified');
  assert.equal(result.rules.approvalStatus, 'not_approved');
  assert.equal(result.rules.payrollEligible, false);
  assert.equal(result.coverageCertified, false);
  assert.equal(row.payrollEligible, false);
  assert.equal(row.payableSeconds, null);
  assert.equal(row.amountArs, null);
  assert.deepEqual(stripRowIdentity(result), v2Result(source));
});

test('opaque lowercase UUIDs are not limited to one UUID version or variant', () => {
  const opaque = '12345678-1234-8234-7234-123456789abc';
  const result = reconstructContinuousWorkdaysV3(fixture(pair().map(e => ({...e, contractId:opaque}))));
  assert.equal(result.rows[0].contractId, opaque);
});

test('mapped nominal events require their own canonical non-nil UUID on every event', () => {
  for (const value of [null, undefined, 0, '', contractA.toUpperCase(), ' ' + contractA,
    '00000000-0000-0000-0000-000000000000', contractA.replaceAll('-', '')]) {
    const source = fixture(); source.events.at(-1).contractId = value;
    assert.throws(() => reconstructContinuousWorkdaysV3(source), invalidIdentity, String(value));
  }
  const missing = fixture(); delete missing.events.at(-1).contractId;
  assert.throws(() => reconstructContinuousWorkdaysV3(missing), invalidIdentity);
  const inherited = fixture(); inherited.events[1] = Object.create(inherited.events[1]);
  assert.throws(() => reconstructContinuousWorkdaysV3(inherited), invalidIdentity);
});

test('ambiguous and unmapped events retain null and cannot contribute a contract UUID', () => {
  for (const identityState of ['ambiguous', 'unmapped']) {
    const source = fixture(pair().map(e => ({...e, identityState, contractId:null, legajo:null})));
    const row = reconstructContinuousWorkdaysV3(source).rows[0];
    assert.equal(row.contractId, null);
    assert.ok(row.issues.some(issue => issue.code === 'identity_unlinked'));
    source.events.at(-1).contractId = contractA;
    assert.throws(() => reconstructContinuousWorkdaysV3(source), invalidIdentity);
  }
});

test('non-nominal sources require explicit null even when the identity is mapped', () => {
  for (const identityState of ['mapped', 'ambiguous', 'unmapped']) {
    const source = fixture(pair().map(e => ({...e, identityState, contractId:null,
      personLabel:'Persona AABBCCDD', legajo:null})), {nominalReadAllowed:false});
    assert.equal(reconstructContinuousWorkdaysV3(source).rows[0].contractId, null);
    source.events.at(-1).contractId = contractA;
    assert.throws(() => reconstructContinuousWorkdaysV3(source), invalidIdentity);
    source.events.at(-1).contractId = undefined;
    assert.throws(() => reconstructContinuousWorkdaysV3(source), invalidIdentity);
  }
});

test('one stream cannot change its contract even when person and legajo stay identical', () => {
  const source = fixture(); source.events.at(-1).contractId = contractB;
  assert.throws(() => reconstructContinuousWorkdaysV3(source), invalidIdentity);
  assert.throws(() => assertContinuousWorkdayIdentitiesV3(source), invalidIdentity);
});

test('different contracts with identical person and legajo never provide each other a boundary', () => {
  const source = fixture([pair()[0], {...pair()[1], streamKey:hash('contract-b-stream'), contractId:contractB}]);
  const result = reconstructContinuousWorkdaysV3(source);
  assert.equal(result.summary.intervalCount, 0);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(new Set(result.rows.map(row => row.contractId)), new Set([contractA, contractB]));
  assert.ok(result.rows.find(row => row.contractId === contractA).issues.some(issue => issue.code === 'missing_exit'));
  assert.ok(result.rows.find(row => row.contractId === contractB).issues.some(issue => issue.code === 'missing_entry'));
  assert.deepEqual(stripRowIdentity(result), v2Result(source));
});

test('the same contract on two devices stays in distinct streams and does not pair across clocks', () => {
  const source = fixture([pair()[0], {...pair()[1], deviceKey:hash('device-b'), streamKey:hash('device-b-stream')}]);
  const result = reconstructContinuousWorkdaysV3(source);
  assert.equal(result.summary.intervalCount, 0);
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every(row => row.contractId === contractA));
  source.events[1].streamKey = source.events[0].streamKey;
  assert.throws(() => reconstructContinuousWorkdaysV3(source), /WORKDAY_INPUT_INVALID/);
});

test('a contract change in overnight context stays unpaired instead of bridging the two contracts', () => {
  const source = fixture([event('night-a', 0, '22:00:00'), event('morning-b', 1, '06:00:00', {
    occurredAt:'2026-09-10T06:00:00-03:00', localTimestamp:'2026-09-10 06:00:00',
    streamKey:hash('contract-b-stream'), contractId:contractB})]);
  const firstDay = reconstructContinuousWorkdaysV3(source);
  assert.equal(firstDay.summary.intervalCount, 0);
  assert.equal(firstDay.rows.length, 1);
  assert.equal(firstDay.rows[0].contractId, contractA);
  assert.ok(firstDay.rows[0].issues.some(issue => issue.code === 'missing_exit'));
  const nextDay = reconstructContinuousWorkdaysV3({...source, filters:{from:'2026-09-10', to:'2026-09-10'}});
  assert.equal(nextDay.summary.intervalCount, 0);
  assert.equal(nextDay.rows.length, 1);
  assert.equal(nextDay.rows[0].contractId, contractB);
  assert.ok(nextDay.rows[0].issues.some(issue => issue.code === 'missing_entry'));
});

test('one contract across midnight preserves entry-day allocation and the existing review warning', () => {
  const source = fixture([event('night', 0, '22:00:00'), event('morning', 1, '06:00:00', {
    occurredAt:'2026-09-10T06:00:00-03:00', localTimestamp:'2026-09-10 06:00:00'})]);
  const result = reconstructContinuousWorkdaysV3(source);
  assert.equal(result.rows[0].contractId, contractA);
  assert.equal(result.rows[0].day, day);
  assert.equal(result.rows[0].ordinarySeconds, 28800);
  assert.ok(result.rows[0].issues.some(issue => issue.code === 'overnight_review'));
  assert.deepEqual(stripRowIdentity(result), v2Result(source));
});

test('observations cannot carry identity and still block intervals only for their own device', () => {
  const other = pair().map(e => ({...e, eventRef:hash(e.eventRef + 'other'), deviceKey:hash('other-device'),
    streamKey:hash('other-stream'), contractId:contractB}));
  const source = fixture([...pair(), ...other], {observations:[observation()]});
  const result = reconstructContinuousWorkdaysV3(source);
  assert.equal(result.rows.find(row => row.contractId === contractA).intervals.length, 0);
  assert.equal(result.rows.find(row => row.contractId === contractB).ordinarySeconds, 21600);
  assert.deepEqual(stripRowIdentity(result), v2Result(source));
  for (const value of [null, undefined, contractA]) {
    source.observations[0].contractId = value;
    assert.throws(() => reconstructContinuousWorkdaysV3(source), invalidIdentity);
  }
});

test('v3 requires its own source namespace, continuous mode, declared rules and boolean permission', () => {
  for (const patch of [{version:'clock-workday-source.v2'}, {version:CLOCK_WORKDAYS_V3_VERSION},
    {sourceMode:'historical'}, {rulesVersion:'authorized-hours.v1'}, {nominalReadAllowed:'true'}, {nominalReadAllowed:undefined}]) {
    assert.throws(() => reconstructContinuousWorkdaysV3(fixture(pair(), patch)), invalidIdentity);
  }
});

test('all context identities are validated before filtering, including the last row after typical page bounds', () => {
  const events = Array.from({length:101}, (_,index) => pair().map(e => ({...e,
    eventRef:hash(`${index}:${e.eventRef}`), streamKey:hash(`stream:${index}`),
    contractId:`00000000-0000-0000-0000-${(index + 1).toString(16).padStart(12, '0')}`}))).flat();
  const source = fixture(events);
  const result = reconstructContinuousWorkdaysV3(source);
  assert.equal(result.rows.length, 101);
  assert.equal(new Set(result.rows.map(row => row.contractId)).size, 101);
  source.events.at(-1).contractId = contractB;
  assert.throws(() => reconstructContinuousWorkdaysV3(source), invalidIdentity);
  const context = fixture([...pair(), event('prior-day', 0, '06:00:00', {
    occurredAt:'2026-09-08T06:00:00-03:00', localTimestamp:'2026-09-08 06:00:00',
    streamKey:hash('prior-stream'), contractId:null})]);
  assert.throws(() => reconstructContinuousWorkdaysV3(context), invalidIdentity);
});

test('v3 does not bypass v2 event, provenance, timestamp, model or stream consistency checks', () => {
  for (const patch of [{eventRef:hash('entry')}, {identityState:'unknown'}, {code:'1'}, {code:256},
    {model:'OTHER'}, {personKey:hash('other-person')}, {legajo:'9002'}, {personLabel:'x'.repeat(501)},
    {localTimestamp:day + ' 14:00:00'}, {occurredAt:day + 'T13:00:00.001-03:00'},
    {source:{kind:'historical', id:'invalid', ordinal:1}}]) {
    const source = fixture(); Object.assign(source.events.at(-1), patch);
    assert.throws(() => reconstructContinuousWorkdaysV3(source));
  }
});

test('v3 enforces the 25000-record context ceiling including observations', () => {
  const source = fixture(Array(25000).fill(pair()[0]), {observations:[observation()]});
  assert.throws(() => assertContinuousWorkdayIdentitiesV3(source), invalidIdentity);
});

test('identity projection preserves frozen input and v2 output across source order, pauses and extra intervals', () => {
  const events = [...pair(), event('pause', 2, '10:00:00'), event('return', 3, '10:15:00'),
    event('extra-entry', 4, '15:00:00'), event('extra-exit', 5, '17:00:00')];
  const source = freezeTree(fixture(events));
  const before = JSON.stringify(source);
  const result = reconstructContinuousWorkdaysV3(source);
  assert.equal(result.rows[0].ordinarySeconds, 20700);
  assert.equal(result.rows[0].pauseSeconds, 900);
  assert.equal(result.rows[0].extraSeconds, 7200);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(stripRowIdentity(result), v2Result(source));
  assert.deepEqual(reconstructContinuousWorkdaysV3(fixture([...events].reverse())), result);
});

test('an empty v3 source retains the existing no-coverage result without inventing identities', () => {
  const source = fixture([]), result = reconstructContinuousWorkdaysV3(source);
  assert.deepEqual(result.rows, []);
  assert.equal(result.coverageCertified, false);
  assert.equal(result.rules.profileSupported, false);
  assert.deepEqual(result, v2Result(source));
});
