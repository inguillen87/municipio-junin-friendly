import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PassThrough} from 'node:stream';
import {createExpectedDevicesHandler} from '../api/internal-attendance-expected-devices.js';
import {expectedDevicesRead, expectedDevicesWrite} from '../lib/internal-attendance-expected-devices.js';
import {
  EXPECTED_DEVICES_MAX_BYTES, validateExpectedDevicesCommand, validateExpectedDevicesQuery, validateExpectedDevicesResponse,
} from '../assets/attendance-expected-devices-model.js';
import {id, area, principal, session, base, command, receipt, choices, listing} from './fixtures/attendance-expected-devices-synthetic.js';
const response = () => ({headers: {}, setHeader(k, v) {this.headers[k] = v;}, status(n) {this.statusCode = n; return this;}, json(v) {this.payload = v; return this;}});
const request = b => ({method: 'POST', url: '/api/internal-attendance-expected-devices', query: {}, headers: {origin: 'https://municipio.example', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'idempotency-key': id(10)}, body: JSON.stringify({operation: 'command', payload: b ?? command()})});
const get = q => ({method: 'GET', url: '/api/internal-attendance-expected-devices?' + new URLSearchParams(q), query: q, headers: {}});
function setup(options = {}) {
  const stats = {connections: 0}, sql = {calls: [], async query(text, values) {this.calls.push({text, values}); if (options.error) throw options.error; return options.rows ?? [{result: JSON.stringify(options.result ?? receipt())}];}};
  const handler = createExpectedDevicesHandler({env: {INTERNAL_APP_ORIGIN: 'https://municipio.example'}, sessionFor: () => options.session ?? session,
    requireAccess: async (_req, res, gates) => {stats.gates = gates; if (options.anonymous) {res.status(401).json({ok: false}); return null;} return options.access ?? {mode: 'managed', principal};}, getSql: async () => {stats.connections++; return sql;}});
  return {handler, sql, stats};
}
test('area-only authority creates a single server-scoped command and validates its receipt', async () => {
  const {handler, sql, stats} = setup(), res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 201); assert.deepEqual(stats.gates.requiredCapabilities, ['attendance.area.read']);
  assert.equal(stats.gates.requireDataPlaneReady, true); assert.equal(stats.gates.requireCertifiedDataBinding, true); assert.equal(stats.gates.allowLegacy, false);
  assert.equal(sql.calls.length, 1); assert.match(sql.calls[0].text, /attendance_expected_devices_command_v1/); assert.equal(sql.calls[0].values[2], id(10));
  assert.deepEqual(JSON.parse(sql.calls[0].values[1]), command()); assert.equal(JSON.parse(sql.calls[0].values[0]).membershipId, principal.tenant.membershipId);
  assert.match(res.headers['Cache-Control'], /private, no-store/); assert.equal(res.payload.data.coverageCertified, false);
});
test('bootstrap does not require global attendance or workforce permissions; an empty scope stays empty', async () => {
  const data = base(); data.principal.capabilities = ['attendance.area.read']; data.principal.areaScopes = []; data.principal.actorPersonId = null;
  const {handler, sql} = setup({result: data, access: {mode: 'managed', principal: {...principal, tenant: {...principal.tenant, effectiveCapabilities: ['attendance.area.read']}}}}), res = response();
  await handler(get({resource: 'bootstrap'}), res); assert.equal(res.statusCode, 200); assert.deepEqual(res.payload.data.principal.areaScopes, []); assert.equal(sql.calls.length, 1);
});
test('area and null-sector are exact; server returning another area or label fails closed', async () => {
  const q = {resource: 'choices', area, validFrom: '2026-11-01', validUntil: '2026-11-30'};
  for (const mutate of [d => d.area.sectorSourceId = null, d => d.area.organizationUnitSourceId = '999', d => d.contracts[0].areaLabel = 'Otra área', d => d.principal.areaScopes = []]) {
    const data = choices(); mutate(data); await assert.rejects(expectedDevicesRead({query: async () => [{result: JSON.stringify(data)}]}, principal, session, q), e => e.status === 503);
  }
});
test('a demonstrated contract remains selectable while population completeness stays false', () => {
  const data = choices(); data.complete = false; data.blockerCodes = ['AREA_HISTORY_UNRESOLVED'];
  assert.equal(validateExpectedDevicesResponse(data, {resource: 'choices'}).contracts[0].id, id(7));
  assert.equal(data.complete, false); data.blockerCodes = []; assert.throws(() => validateExpectedDevicesResponse(data, {resource: 'choices'}));
});
test('every query and command requires explicit canonical dates, area and nonempty devices', () => {
  const q = {resource: 'choices', area, validFrom: '2026-11-01', validUntil: '2026-11-30'};
  assert.deepEqual(validateExpectedDevicesQuery(q), q);
  for (const mutate of [b => b.payload.validUntil = null, b => b.payload.validFrom = '2026-02-30', b => b.payload.validUntil = '2028-01-01',
    b => b.payload.deviceIds = [], b => b.payload.deviceIds.push(b.payload.deviceIds[0]), b => b.payload.area.sectorSourceId = '',
    b => b.payload.subjectVersion = null, b => b.payload.complete = false, b => b.payload.contractId = 7, b => b.reason += '\u200b',
    b => b.payload.derivedFromPunches = true]) {
    const b = command(); mutate(b); assert.throws(() => validateExpectedDevicesCommand(b));
  }
  const retire = command({command: 'retire', proposalId: id(9), expectedVersion: 2, payload: {effectiveFrom: '2026-11-17'}, reasonCode: 'declaration_retired'});
  assert.deepEqual(validateExpectedDevicesCommand(retire), retire); retire.payload = null; assert.throws(() => validateExpectedDevicesCommand(retire));
});
for (const [label, mutate] of [
  ['foreign origin', r => r.headers.origin = 'https://other.invalid'], ['wrong content type', r => r.headers['content-type'] = 'text/plain'],
  ['duplicate content-type header', r => r.rawHeaders = ['Content-Type', 'application/json', 'content-type', 'application/json']],
  ['missing idempotency', r => delete r.headers['idempotency-key']], ['duplicate JSON name', r => r.body = '{"operation":"command","operati\\u006fn":"command","payload":{}}'],
  ['extra client tenant', r => r.body = JSON.stringify({operation: 'command', payload: {...command(), tenantId: id(20)}})],
  ['invalid UTF8', r => r.body = Buffer.from([0xff])], ['oversized body', r => r.body = ' '.repeat(EXPECTED_DEVICES_MAX_BYTES + 1)],
  ['declared length too large', r => r.headers['content-length'] = String(EXPECTED_DEVICES_MAX_BYTES + 1)],
  ['duplicate query', r => {r.method = 'GET'; r.query = {resource: 'bootstrap'}; r.url += '?resource=bootstrap&resource=bootstrap';}],
  ['ambiguous area JSON', r => {r.method = 'GET'; r.query = {resource: 'list', area: '{"organizationUnitSourceId":"900","sectorSourceId":null,"sectorSourceId":"901"}', status: 'all', limit: '20', offset: '0'}; r.url += '?' + new URLSearchParams(r.query);}],
  ['method', r => r.method = 'PUT'],
]) test('rejects ' + label + ' before opening SQL', async () => {
  const {handler, stats} = setup(), req = request(), res = response(); mutate(req); await handler(req, res); assert.ok(res.statusCode >= 400, JSON.stringify(res.payload)); assert.equal(stats.connections, 0);
});
test('anonymous, wrong actor and global-only accounts cannot use area facade or consume body', async () => {
  for (const options of [{anonymous: true}, {session: {...session, email: 'other@example.invalid'}},
    {access: {mode: 'managed', principal: {...principal, tenant: {...principal.tenant, effectiveCapabilities: ['attendance.read', 'workforce.employee.read']}}}},
    {access: {mode: 'legacy', principal}}]) {
    const {handler, stats} = setup(options), req = request(), res = response(); Object.defineProperty(req, 'body', {get() {throw Error('private body must remain unread');}});
    await handler(req, res); assert.ok([401, 403].includes(res.statusCode)); assert.equal(stats.connections, 0);
  }
});
test('read-only area authority cannot write even with a valid session and body', async () => {
  const {handler, stats} = setup({access: {mode: 'managed', principal: {...principal, tenant: {...principal.tenant, effectiveCapabilities: ['attendance.area.read']}}}}), res = response();
  await handler(request(), res); assert.equal(res.statusCode, 403); assert.equal(stats.connections, 0);
});
test('uncertain or foreign receipts never masquerade as successful writes', async () => {
  for (const mutate of [d => d.principal.tenantId = id(44), d => d.principal.membershipId = id(45), d => d.principal.sessionVersion++,
    d => d.receipt.body.reason = 'Otro fundamento sintético diferente.', d => d.receipt.recordVersion++, d => d.record.devices[0].id = id(50),
    d => d.receipt.attemptKey = id(51), d => d.coverageCertified = true, d => d.record.dni = 'FORBIDDEN_SYNTHETIC', d => d.principal.sourceDatabase = 'FORBIDDEN_SYNTHETIC']) {
    const data = receipt(); mutate(data); const {handler} = setup({result: data}), res = response(); await handler(request(), res);
    assert.equal(res.statusCode, 503); assert.doesNotMatch(JSON.stringify(res.payload), /FORBIDDEN_SYNTHETIC|SELECT|sourceDatabase/);
  }
});
test('attempt lookup preserves original body and immutable result while reauthorizing current principal', async () => {
  const data = receipt(command(), {found: true, replayed: true}), q = {resource: 'attempt', key: id(10)};
  const result = await expectedDevicesRead({query: async () => [{result: JSON.stringify(data)}]}, principal, session, q);
  assert.deepEqual(result.receipt.body, command()); assert.equal(result.record.version, 1);
  const empty = {...base(), found: false, receipt: null, record: null, replayed: false, attemptKey: q.key, requestSha256: null};
  assert.equal(validateExpectedDevicesResponse(empty, {resource: 'attempt', query: q}).found, false);
});
test('pagination is verified rather than silently truncating the authorized list', async () => {
  const q = {resource: 'list', area, status: 'all', limit: 20, offset: 0};
  assert.equal(validateExpectedDevicesResponse(listing(), {resource: 'list', query: q}).total, 1);
  const short = listing(); short.total = 21; assert.throws(() => validateExpectedDevicesResponse(short, {resource: 'list', query: q}));
});
test('partial raw streams fail before SQL; a declared valid JSON body length cannot hide truncation', async () => {
  const {handler, stats} = setup(), original = request(), req = new PassThrough(), res = response(); Object.assign(req, original); delete req.body;
  req.headers['content-length'] = String(Buffer.byteLength(original.body) + 1); const pending = handler(req, res); req.end(original.body); await pending;
  assert.equal(res.statusCode, 400); assert.equal(stats.connections, 0);
});
test('known atomic rejections are actionable; an unavailable candidate stays 503 without leaking SQL', async () => {
  for (const [message, status, code] of [
    ['ATTENDANCE_EXPECTED_DEVICES_MAKER_CHECKER_REQUIRED', 403, 'INDEPENDENT_REQUIRED'], ['ATTENDANCE_AREA_DENIED', 403, 'FORBIDDEN'],
    ['ATTENDANCE_EXPECTED_DEVICES_IDEMPOTENCY_REUSE', 409, 'ATTEMPT_CONFLICT'], ['ATTENDANCE_EXPECTED_DEVICES_HISTORY_UNRESOLVED', 409, 'SOURCE_BLOCKED'],
    ['ATTENDANCE_EXPECTED_DEVICES_PROPOSAL_CHANGED', 409, 'VERSION_CONFLICT'], ['ATTENDANCE_EXPECTED_DEVICES_OVERLAP', 409, 'OVERLAP'],
    ['TIME_CATALOG_EMPLOYMENT_REQUIRED', 403, 'ACTOR_REQUIRED'], ['function attendance_expected_devices_read_v1 does not exist', 503, 'UNAVAILABLE'],
  ]) {
    const {handler} = setup({error: new Error(message + ' private SQL details')}), res = response(); await handler(request(), res);
    assert.equal(res.statusCode, status); assert.equal(res.payload.code, 'ATTENDANCE_EXPECTED_DEVICES_' + code); assert.doesNotMatch(res.payload.error, /SQL|does not exist/);
  }
});
test('authority source is inert and separates area permissions from global/leave grants', () => {
  const sql = readFileSync(new URL('../scripts/candidates/attendance-area-authority-v1.source.sql.txt', import.meta.url), 'utf8');
  assert.match(sql, /RAISE EXCEPTION 'ATTENDANCE_AREA_AUTHORITY_SOURCE_REQUIRES_REVIEWED_COMPOSITION'/);
  assert.match(sql, /ROLLBACK;\s*$/); assert.doesNotMatch(sql, /INSERT INTO public\.iam_role_capability|UPDATE.*tenant_action_area_scope|GRANT .* TO PUBLIC/);
  assert.match(sql, /attendance_gateway_assert_session_v1/); assert.match(sql, /tenant_iam_effective_capabilities/);
  assert.match(sql, /s->'sectorSourceId'=area->'sectorSourceId'/); assert.match(sql, /native_employee_catalog_v1/);
  assert.match(sql, /'TIME_CATALOG_EMPLOYMENT_REQUIRED','TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID','TIME_CATALOG_NATIVE_PERIOD_INVALID'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*attendance_area_context_v1\(jsonb,text\)[\s\S]*FROM PUBLIC,municontrol_actions_runtime_app/);
});
