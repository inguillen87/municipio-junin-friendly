// Adversarial source/response contracts. All identities and labels are generated.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expectedDevicesUuid, expectedDevicesSha, expectedDevicesAreaKey,
  validateExpectedDevicesPrincipal, validateExpectedDevicesRecord, validateExpectedDevicesResponse,
  validateExpectedDevicesCommand, validateExpectedDevicesQuery,
} from '../assets/attendance-expected-devices-model.js';
import { id, area, sqlPrincipal, base, command, record, receipt, choices, listing } from './fixtures/attendance-expected-devices-synthetic.js';

const times = ['2026-11-16T18:00:00Z', '2026-11-16T18:01:00Z', '2026-11-16T18:02:00Z'];
function detail(status = 'proposed') {
  const version = ({ proposed: 1, approved: 2, rejected: 2, retired: 3 })[status];
  const row = record({ status, version, proposedAt: times[0], decidedAt: version >= 2 ? times[1] : null,
    retiredAt: version === 3 ? times[2] : null, retiredEffectiveFrom: version === 3 ? '2026-11-20' : null });
  const commands = ['propose', status === 'rejected' ? 'reject' : 'approve', 'retire'];
  const reasons = { propose: 'initial_declaration', approve: 'declaration_verified', reject: 'wrong_devices', retire: 'declaration_retired' };
  return { ...base(), record: row, history: commands.slice(0, version).map((name, index) => ({ command: name,
    expectedVersion: index, resultingVersion: index + 1, reasonCode: reasons[name], occurredAt: times[index] })), auditAvailable: true, historyComplete: true };
}
const readDetail = value => validateExpectedDevicesResponse(value, { resource: 'detail', query: { resource: 'detail', id: value.record.id } });
const invalidResponse = fn => assert.throws(fn, error => error.code === 'ATTENDANCE_EXPECTED_DEVICES_RESPONSE_INVALID' && error.status === 503);

test('UUID and SHA validators match the entire string and reject zero or decorated identities', () => {
  assert.equal(expectedDevicesUuid(id(1)), true); assert.equal(expectedDevicesSha('a'.repeat(64)), true);
  for (const suffix of ['\n', '\r', '\r\n', '\u2028', '\u2029', ' ', '\t']) {
    assert.equal(expectedDevicesUuid(id(1) + suffix), false, JSON.stringify(suffix));
    assert.equal(expectedDevicesSha('a'.repeat(64) + suffix), false, JSON.stringify(suffix));
    const body = command(); body.payload.contractId += suffix; assert.throws(() => validateExpectedDevicesCommand(body));
    const shaBody = command(); shaBody.scopeVersion += suffix; assert.throws(() => validateExpectedDevicesCommand(shaBody));
    assert.throws(() => validateExpectedDevicesQuery({ resource: 'detail', id: id(9) + suffix }));
  }
  for (const bad of ['00000000-0000-0000-0000-000000000000', id(1).toUpperCase(), ' ' + id(1), null, 1]) assert.equal(expectedDevicesUuid(bad), false);
  for (const bad of ['A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), null, 64]) assert.equal(expectedDevicesSha(bad), false);
});

test('source IDs stay exact strings and a null sector remains distinct from any numbered sector', () => {
  assert.notEqual(expectedDevicesAreaKey({ ...area, sectorSourceId: null }), expectedDevicesAreaKey(area));
  assert.equal(expectedDevicesAreaKey({ organizationUnitSourceId: '0', sectorSourceId: null }), '["0",null]');
  for (const value of ['900\n', '900\r\n', '900\u2028', '0900', '+900', '9e2', '900 ', '', 900, null, '1'.repeat(20)]) {
    assert.throws(() => expectedDevicesAreaKey({ ...area, organizationUnitSourceId: value }));
    if (value !== null) assert.throws(() => expectedDevicesAreaKey({ ...area, sectorSourceId: value }));
  }
  assert.throws(() => expectedDevicesAreaKey({ ...area, wildcard: true }));
});

test('each record status has one exact revision and retirement cannot masquerade as another decision', () => {
  for (const status of ['proposed', 'approved', 'rejected', 'retired']) {
    const value = detail(status).record; assert.equal(validateExpectedDevicesRecord(value), value);
    for (const version of [0, 1, 2, 3, 4]) if (version !== value.version) invalidResponse(() => validateExpectedDevicesRecord({ ...value, version }));
  }
  for (const mutate of [r => { r.retiredAt = times[2]; }, r => { r.retiredEffectiveFrom = '2026-11-20'; }, r => { r.canRetire = true; }]) {
    const proposed = detail().record; mutate(proposed); invalidResponse(() => validateExpectedDevicesRecord(proposed));
  }
  const retired = detail('retired').record; retired.canReview = true; invalidResponse(() => validateExpectedDevicesRecord(retired));
});

test('record timestamps are real calendar instants and cannot precede the prior event', () => {
  for (const value of ['2026-02-30T18:00:00Z', '2026-11-16T24:00:00Z', '2026-11-16T18:60:00Z', '2026-11-16T18:00:60Z', times[0] + '\n']) {
    invalidResponse(() => validateExpectedDevicesRecord(record({ proposedAt: value })));
  }
  const approved = detail('approved').record; approved.decidedAt = '2026-11-16T17:59:59Z'; invalidResponse(() => validateExpectedDevicesRecord(approved));
  const retired = detail('retired').record; retired.retiredAt = times[0]; invalidResponse(() => validateExpectedDevicesRecord(retired));
  for (const day of ['2026-10-31', '2026-12-02', null]) invalidResponse(() => validateExpectedDevicesRecord({ ...detail('retired').record, retiredEffectiveFrom: day }));
  assert.equal(validateExpectedDevicesRecord({ ...detail('retired').record, retiredEffectiveFrom: '2026-12-01' }).retiredEffectiveFrom, '2026-12-01', 'retirement may start exactly the day after the inclusive end');
});

test('history is a contiguous ordered proposal/decision/retirement chain tied to record timestamps', () => {
  for (const status of ['proposed', 'approved', 'rejected', 'retired']) assert.equal(readDetail(detail(status)).record.status, status);
  const changes = [
    d => d.history.reverse(), d => d.history.splice(1, 1), d => d.history.push({ ...d.history[0] }),
    d => { d.history[0].command = 'retire'; d.history[0].reasonCode = 'declaration_retired'; },
    d => { d.history[1].command = 'propose'; d.history[1].reasonCode = 'initial_declaration'; },
    d => { d.history[1].command = 'reject'; d.history[1].reasonCode = 'wrong_devices'; },
    d => { d.history[2].expectedVersion = 1; }, d => { d.history[1].resultingVersion = 3; },
    d => { d.history[1].occurredAt = times[0]; }, d => { d.history[2].reasonCode = 'initial_declaration'; },
    d => { d.history[0].actorEmail = 'not-projected@example.invalid'; },
  ];
  for (const mutate of changes) { const value = detail('retired'); mutate(value); invalidResponse(() => readDetail(value)); }
  const rejected = detail('rejected'); rejected.history[1].command = 'approve'; rejected.history[1].reasonCode = 'declaration_verified'; invalidResponse(() => readDetail(rejected));
  const equivalentInstant = detail('approved'); equivalentInstant.history[1].occurredAt = '2026-11-16T15:01:00-03:00';
  assert.equal(readDetail(equivalentInstant).record.status, 'approved', 'timezone notation may differ while the actual instant is identical');
});

test('audit availability is tied to its capability and a withheld history cannot assert completeness', () => {
  const denied = detail(); denied.principal.capabilities = denied.principal.capabilities.filter(cap => cap !== 'attendance.area.devices.audit.read');
  invalidResponse(() => readDetail(denied));
  denied.auditAvailable = false; denied.historyComplete = false; denied.history = [];
  assert.equal(readDetail(denied).auditAvailable, false);
  for (const mutate of [d => { d.historyComplete = true; }, d => { d.history = detail().history; }]) {
    const changed = structuredClone(denied); mutate(changed); invalidResponse(() => readDetail(changed));
  }
});

test('review and retirement flags require a verified person and approval capability across all projections', () => {
  const factories = [
    () => ({ value: detail(), resource: 'detail', target: value => value.record }),
    () => ({ value: listing(), resource: 'list', target: value => value.records[0] }),
    () => ({ value: receipt(), resource: 'command', target: value => value.record }),
  ];
  for (const make of factories) for (const mutate of [p => { p.actorPersonId = null; }, p => { p.capabilities = p.capabilities.filter(cap => cap !== 'attendance.area.devices.approve'); }]) {
    const { value, resource, target } = make(); target(value).canReview = true; mutate(value.principal);
    invalidResponse(() => validateExpectedDevicesResponse(value, { resource }));
    target(value).canReview = false; assert.equal(validateExpectedDevicesResponse(value, { resource }), value);
  }
  const approved = detail('approved'); approved.record.canRetire = true; approved.principal.actorPersonId = null;
  invalidResponse(() => readDetail(approved));
});

test('scope IDs and exact areas must both be unique; labels cannot bypass their authorized source', () => {
  const p = sqlPrincipal(); assert.equal(validateExpectedDevicesPrincipal(p), p);
  const repeatedId = sqlPrincipal(); repeatedId.areaScopes.push({ ...p.areaScopes[0], organizationUnitSourceId: '902', areaLabel: 'Otra área sintética' });
  invalidResponse(() => validateExpectedDevicesPrincipal(repeatedId));
  const repeatedArea = sqlPrincipal(); repeatedArea.areaScopes.push({ ...p.areaScopes[0], scopeId: id(99) });
  invalidResponse(() => validateExpectedDevicesPrincipal(repeatedArea));
  const valid = sqlPrincipal(); valid.areaScopes.push({ ...p.areaScopes[0], scopeId: id(99), sectorSourceId: null, areaLabel: 'Repartición sintética / Sin sector' });
  assert.equal(validateExpectedDevicesPrincipal(valid).areaScopes.length, 2);
  const wrongLabel = choices(); wrongLabel.contracts[0].areaLabel = 'Etiqueta no autorizada'; invalidResponse(() => validateExpectedDevicesResponse(wrongLabel, { resource: 'choices' }));
});

test('new source guards validate without rewriting the caller inputs or granting inferred authority', () => {
  for (const make of [() => detail('retired'), choices, listing, receipt]) {
    const value = make(), before = structuredClone(value);
    const resource = Object.hasOwn(value, 'history') ? 'detail' : Object.hasOwn(value, 'contracts') ? 'choices' : Object.hasOwn(value, 'records') ? 'list' : 'command';
    validateExpectedDevicesResponse(value, { resource }); assert.deepEqual(value, before);
    assert.deepEqual([value.installationReady, value.coverageCertified, value.payrollPosted], [false, false, false]);
  }
});
