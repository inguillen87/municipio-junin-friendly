import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolveAttendanceAreaHistory as resolve} from '../lib/attendance-area-history.js';
import {areaHistoryFixture as fixture, historyQuery as query, historyId as id,
  unchangedAreaChange as change, historyTermination as terminate, historyReentry as reenter} from './fixtures/attendance-area-history-synthetic.js';
const has = (result, reason) => { assert.equal(result.status, 'blocked'); assert.ok(result.reasons.includes(reason), reason); assert.equal(result.area, null); assert.equal(result.evidence, null); };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const sourceInvalid = error => error.code === 'ATTENDANCE_AREA_HISTORY_SOURCE_INVALID';
const inputInvalid = error => error.code === 'ATTENDANCE_AREA_HISTORY_INPUT_INVALID';

test('unaltered native registration proves its explicit start date, with immutable source and readable labels', () => {
  const source = freeze(fixture()), result = resolve(source, query({validFrom:'2026-10-01', validUntil:null}));
  assert.equal(result.status, 'resolved');
  assert.equal(result.area.areaLabel, 'Área sintética / Sector de ensayo');
  assert.equal(result.evidence.registrationId, id(4));
  assert.equal(result.evidence.registrationCatalogSha256, 'c'.repeat(64));
  assert.equal(result.evidence.registeredAt, '2026-11-01T14:00:00.123456+00:00');
  assert.deepEqual(result, resolve(source, query({validFrom:'2026-10-01', validUntil:null})));
});

test('recorded or approved timestamps never replace explicit employment dates', () => {
  const source = fixture(); source.changes.approved.push(change());
  const before = resolve(source, query({validFrom:'2026-10-02', validUntil:'2026-10-02'}));
  assert.equal(before.status, 'resolved');
  source.registration.registeredAt = '2026-11-15T23:59:59Z';
  source.changes.approved[0].approvedAt = '2026-11-16T23:59:59Z';
  assert.equal(resolve(source, query({validFrom:'2026-10-02', validUntil:'2026-10-02'})).status, 'resolved');
  has(resolve(source, query({validFrom:'2026-09-30', validUntil:'2026-09-30'})), 'AREA_HISTORY_RANGE_NOT_ACTIVE');
});

test('same contract UUID in another tenant/binding and another contract UUID never resolves', () => {
  for (const key of ['tenantId', 'sourceBindingId', 'contractId']) has(resolve(fixture(), query({[key]:id(99)})), 'AREA_HISTORY_SCOPE_MISMATCH');
  const source = fixture(); source.legajo = '9001';
  assert.throws(() => resolve(source, query()), sourceInvalid);
});

test('current area alone and unproven registration/guards cannot establish a historical population', () => {
  for (const mutate of [s => { s.registration = null; }, s => { s.currentArea = null; },
    s => { s.provenance.registrationMatches = false; }, s => { s.provenance.guardConfirmed = false; }]) {
    const source = fixture(); mutate(source); has(resolve(source, query()), 'AREA_HISTORY_REGISTRATION_UNPROVEN');
  }
});

test('GRH, adoption and unknown origin require a separately defined daily source', () => {
  for (const origin of ['grh', 'adopted_grh', 'unconfirmed']) {
    const source = fixture(); source.provenance.origin = origin;
    has(resolve(source, query()), 'AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED');
  }
});

test('incomplete reads block even with an empty list of approved changes', () => {
  for (const field of ['provenance', 'changes', 'lifecycle', 'withdrawal']) {
    const source = fixture(); source[field].complete = false;
    has(resolve(source, query()), 'AREA_HISTORY_INCOMPLETE');
  }
});

test('approved withdrawal is not a dated employment termination and blocks all requested dates', () => {
  const source = fixture(); source.withdrawal = {complete:true, withdrawn:true, approvalId:id(900)};
  for (const day of ['2026-10-01', '2026-11-16']) has(resolve(source, query({validFrom:day, validUntil:day})), 'AREA_HISTORY_WITHDRAWN');
});

test('a complete chain changing only other employment fields keeps its unchanged area', () => {
  const source = fixture(); source.changes.approved = [change(2), change(1)];
  const result = resolve(source, query()); assert.equal(result.status, 'resolved');
  assert.deepEqual(result.evidence.changeApprovalIds, [id(201), id(202)]);
});

test('any changed area without declared effectivity blocks dates before and after the approval', () => {
  for (const key of ['organizationUnitSourceId', 'sectorSourceId', 'organizationName', 'sectorName']) {
    const source = fixture(), row = change(); row.afterArea[key] = key.endsWith('SourceId') ? '999' : 'Otra etiqueta';
    source.changes.approved = [row]; source.currentArea = {...row.afterArea};
    for (const day of ['2026-10-02', '2026-11-16']) has(resolve(source, query({validFrom:day, validUntil:day})), 'AREA_HISTORY_EFFECTIVITY_REQUIRED');
  }
});

test('changing area away and back cannot erase the historical uncertainty', () => {
  const source = fixture(), first = change(), second = change(2);
  first.afterArea.organizationUnitSourceId = '92'; second.beforeArea = {...first.afterArea};
  source.changes.approved = [first, second];
  has(resolve(source, query()), 'AREA_HISTORY_EFFECTIVITY_REQUIRED');
});

test('revision gaps, duplicate decisions, broken continuity, mismatched snapshots and maker/checker failures block', () => {
  for (const mutate of [s => { s.changes.approved[0].revision = 2; },
    s => { s.changes.approved[0].makerChecker = false; }, s => { s.changes.approved[0].sourceMatches = false; },
    s => { s.currentArea.sectorSourceId = '99'; }, s => { s.changes.approved[0].beforeArea.sectorSourceId = '99'; },
    s => { const next = change(2); next.approvalId = s.changes.approved[0].approvalId; s.changes.approved.push(next); }]) {
    const source = fixture(); source.changes.approved = [change()]; mutate(source);
    has(resolve(source, query()), 'AREA_HISTORY_CHAIN_INVALID');
  }
});

test('retroactive termination uses movement_date inclusively, never reviewed_at', () => {
  const source = fixture(); source.lifecycle.approved = [terminate()];
  assert.equal(resolve(source, query({validFrom:'2026-10-31', validUntil:'2026-10-31'})).status, 'resolved');
  has(resolve(source, query({validFrom:'2026-11-01', validUntil:'2026-11-01'})), 'AREA_HISTORY_RANGE_NOT_ACTIVE');
  has(resolve(source, query({validFrom:'2026-10-31', validUntil:null})), 'AREA_HISTORY_RANGE_NOT_ACTIVE');
});

test('reentry proves only its explicit new interval and never bridges a gap', () => {
  const source = fixture(); source.lifecycle.approved = [terminate(), reenter()];
  assert.equal(resolve(source, query({validFrom:'2026-11-15', validUntil:null})).status, 'resolved');
  assert.equal(resolve(source, query({validFrom:'2026-10-01', validUntil:'2026-10-31'})).status, 'resolved');
  has(resolve(source, query({validFrom:'2026-10-31', validUntil:'2026-11-15'})), 'AREA_HISTORY_RANGE_NOT_ACTIVE');
  has(resolve(source, query({validFrom:'2026-11-14', validUntil:'2026-11-14'})), 'AREA_HISTORY_RANGE_NOT_ACTIVE');
});

test('missing lifecycle revisions and forged after intervals cannot broaden population', () => {
  for (const mutate of [s => { s.lifecycle.approved[0].revision = 2; }, s => { s.lifecycle.approved[0].makerChecker = false; },
    s => { s.lifecycle.approved[0].sourceMatches = false; }, s => { s.lifecycle.approved[0].afterIntervals[0].endDate = '2026-11-30'; },
    s => { s.lifecycle.approved[0].movementDate = '2026-10-30'; }, s => { s.lifecycle.approved[0].beforeIntervals[0].startDate = '2026-09-01'; }]) {
    const source = fixture(); source.lifecycle.approved = [terminate()]; mutate(source);
    has(resolve(source, query()), 'AREA_HISTORY_LIFECYCLE_INVALID');
  }
});

test('closed input rejects fabricated effective dates, impossible dates, extra identity fields and nondata properties', () => {
  for (const mutate of [s => { s.changes.approved = [change()]; s.changes.approved[0].effectiveFrom = '2026-11-12'; },
    s => { s.registration.startDate = '2026-02-30'; }, s => { s.registration.id += '\n'; },
    s => { s.registration.area.organizationName = 'Área\u200b'; }, s => { s.provenance.legajo = '9001'; },
    s => { Object.defineProperty(s.registration, 'area', {get() { throw new Error('getter ran'); }, enumerable:true}); }]) {
    const source = fixture(); mutate(source); assert.throws(() => resolve(source, query()), sourceInvalid);
  }
  for (const q of [query({validFrom:'2026-02-30'}), query({validUntil:'2026-11-15'}), {...query(), legajo:'9001'}]) assert.throws(() => resolve(fixture(), q), inputInvalid);
});

test('candidate remains a private, guarded review source and contains no public runtime grant', () => {
  const sql = readFileSync(new URL('../scripts/candidates/attendance-area-history-v1.source.sql.txt', import.meta.url), 'utf8');
  assert.match(sql, /BEGIN;\s*DO \$not_an_installer\$ BEGIN\s*RAISE EXCEPTION 'ATTENDANCE_AREA_HISTORY_SOURCE_ONLY'/);
  assert.match(sql, /ROLLBACK;\s*$/);
  assert.match(sql, /FUNCTION public\.attendance_area_history_v1\(ctx jsonb,target uuid,first_date date,last_date date DEFAULT NULL\)/);
  assert.match(sql, /STABLE SECURITY DEFINER/);
  assert.match(sql, /FROM PUBLIC,municontrol_actions_runtime_app/);
  assert.doesNotMatch(sql, /\bGRANT\s+(?:ALL|EXECUTE)\b/i);
  assert.doesNotMatch(sql, /legacy_legajo\s*=|JOIN[^;]+\blegajo\b/);
  assert.match(sql, /AREA_HISTORY_EFFECTIVITY_REQUIRED/);
  assert.match(sql, /AREA_HISTORY_WITHDRAWN/);
});

test('candidate provenance pins preserve the original source files and exact guard bodies', () => {
  const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const digest = text => createHash('sha256').update(text).digest('hex');
  const manifest = JSON.parse(read('scripts/candidates/attendance-area-history-v1.source.manifest.json'));
  const sql = read(manifest.candidate.path);
  assert.equal(digest(sql), manifest.candidate.sha256);
  assert.equal(manifest.runtimeSqlExecuted, false); assert.equal(manifest.installed, false);
  for (const source of manifest.originalSources) assert.equal(digest(read(source.path)), source.sha256, source.path);
  for (const pin of manifest.originalBodyPins) {
    const original = read(pin.path), start = original.indexOf(pin.anchor);
    assert.ok(start >= 0, pin.function);
    const body = original.slice(start).split(pin.delimiter)[1];
    assert.equal(digest(body), pin.prosrcSha256, pin.function);
    assert.ok(sql.includes(pin.prosrcSha256), pin.function);
  }
});
