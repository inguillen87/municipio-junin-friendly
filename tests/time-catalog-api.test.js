import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createTimeCatalogHandler} from '../api/internal-time-catalog.js';
import {timeCatalogWrite, timeCatalogRead, TIME_CATALOG_MAX_BYTES} from '../lib/internal-time-catalog.js';
import {timeCatalogCommand, timeCatalogPayload, timeCatalogMatches, timeCatalogNumeric} from '../assets/time-catalog-contract.js';
import {parseTimeCatalogSqlJson, normalizeTimeCatalogSqlJson, timeCatalogSqlPayload} from '../lib/time-catalog-json.js';
import {ID, principal, session, scopeVersion, command, payload, receipt, record, sqlPrincipal, sqlText, bootstrap} from './fixtures/time-catalog-synthetic.js';
const response = () => ({headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.payload = v; return this; }});
const request = (body = command()) => ({method: 'POST', url: '/api/internal-time-catalog', query: {}, headers: {origin: 'https://municipio.example', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'idempotency-key': ID}, body: JSON.stringify({operation: 'command', payload: body})});
const get = q => ({method: 'GET', url: '/api/internal-time-catalog?' + new URLSearchParams(q), query: q, headers: {}});
function setup(options = {}) {
  const stats = {connections: 0}, sql = {calls: [], async query(query, values) { this.calls.push({query, values}); if (options.error) throw options.error; return options.rows ?? [{result: sqlText(options.result ?? receipt())}]; }};
  const handler = createTimeCatalogHandler({env: {INTERNAL_APP_ORIGIN: 'https://municipio.example'}, sessionFor: () => options.session ?? session,
    requireAccess: async (_req, res, gates) => { stats.gates = gates; if (options.anonymous) { res.status(401).json({ok: false}); return null; } return options.access ?? {mode: 'managed', principal}; }, getSql: async () => { stats.connections++; return sql; }});
  return {handler, sql, stats};
}
test('authenticated command uses a single locked scope check and existing writer; exact values never round', async () => {
  const {handler, sql, stats} = setup(), res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 201); assert.match(res.headers['Cache-Control'], /no-store/); assert.deepEqual(stats.gates.requiredCapabilities, ['time.catalog.read']); assert.equal(stats.gates.allowLegacy, false); assert.equal(stats.gates.requireCertifiedDataBinding, true);
  assert.equal(sql.calls.length, 1); const {query, values} = sql.calls[0]; assert.match(query, /WITH checked AS MATERIALIZED/); assert.match(query, /WHERE checked.bootstrap#>>'\{principal,scopeVersion\}'=\$16::text/);
  assert.match(query, /time_catalog_apply_command_v1/); assert.match(query, /::text AS result/); assert.equal(values[0], principal.user.email); assert.equal(values[4], principal.tenant.id); assert.equal(values[5], principal.tenant.membershipId);
  assert.match(values[12], /"value":99999999999999\.123456/); assert.match(values[12], /"value":999999999999999999/); assert.doesNotMatch(values[12], /e\+|"value":"/);
  assert.equal(res.payload.data.data.configuration.parameters.find(p => p.valueKind === 'decimal').decimalValue, '99999999999999.123456'); assert.equal(res.payload.data.data.configuration.parameters.find(p => p.valueKind === 'integer').integerValue, '999999999999999999');
  assert.doesNotMatch(JSON.stringify(res.payload), /qa@example|membershipId|tenantId|actorEmail|employmentContractId|reason":/);
});
test('manual same-body replay remains200 and historical receipt is not rewritten', async () => {
  const {handler, sql} = setup({result: receipt(command(), {replayed: true, historical: true})}), res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 200); assert.equal(res.headers['Idempotency-Replayed'], 'true'); assert.equal(res.payload.data.data.version, 1); assert.equal(res.payload.data.historical, true); assert.equal(sql.calls[0].values[10], ID);
});
for (const [label, mutate] of [
  ['foreign origin', r => r.headers.origin = 'https://otro.invalid'], ['wrong content type', r => r.headers['content-type'] = 'text/plain'],
  ['declared overflow', r => r.headers['content-length'] = String(TIME_CATALOG_MAX_BYTES + 1)], ['missing key', r => delete r.headers['idempotency-key']],
  ['duplicate query', r => { r.method = 'GET'; r.query = {resource: 'bootstrap'}; r.url += '?resource=bootstrap&resource=bootstrap'; }],
  ['extra municipality', r => { r.query = {tenantId: ID}; r.url += '?tenantId=' + ID; }], ['method', r => r.method = 'PUT'],
  ['duplicate JSON name', r => r.body = '{"operation":"command","operati\\u006fn":"command","payload":{}}'],
  ['UTF8 invalid', r => r.body = Buffer.from([0xff])], ['stream overflow', r => r.body = ' '.repeat(TIME_CATALOG_MAX_BYTES) + r.body],
  ['client identity', r => r.body = JSON.stringify({operation: 'command', payload: command({membershipId: ID})})],
  ['rounded numeric input', r => { const body = command(); body.payload.spec.parameters[0].value = 99999999999999.123456; r.body = JSON.stringify({operation: 'command', payload: body}); }],
]) test('rejects ' + label + ' without SQL', async () => {
  const {handler, sql} = setup(), req = request(), res = response(); mutate(req); await handler(req, res); assert.ok(res.statusCode >= 400); assert.equal(sql.calls.length, 0);
});
test('anonymous and invalid session do not consume body bytes or open a connection', async () => {
  for (const options of [{anonymous: true}, {session: {...session, email: 'different@example.invalid'}}]) {
    const {handler, stats} = setup(options), req = request(), res = response(); Object.defineProperty(req, 'body', {get() { throw Error('must not read'); }});
    await handler(req, res); assert.ok([401, 403].includes(res.statusCode)); assert.equal(stats.connections, 0);
  }
});
test('read-only and employee-create capabilities cannot submit a catalog command', async () => {
  for (const caps of [['time.catalog.read'], ['workforce.employee.read', 'employee.record.create']]) {
    const {handler, stats} = setup({access: {mode: 'managed', principal: {...principal, tenant: {...principal.tenant, effectiveCapabilities: caps}}}}), res = response();
    await handler(request(), res); assert.equal(res.statusCode, 403); assert.equal(stats.connections, 0);
  }
});
test('session/tenant/member change stops before SQL, binding/actor change returns no writer result', async () => {
  for (const [identity, s] of [[principal, {...session, version: 2}], [{...principal, tenant: {...principal.tenant, id: ID}}, session], [{...principal, tenant: {...principal.tenant, membershipId: ID}}, session]]) {
    let calls = 0; await assert.rejects(timeCatalogWrite({query: () => { calls++; }}, identity, s, command(), ID), e => e.code === 'TIME_CATALOG_SCOPE_CHANGED'); assert.equal(calls, 0);
  }
  const {handler, sql} = setup({rows: []}), res = response(); await handler(request(), res); assert.equal(res.statusCode, 409); assert.equal(res.payload.code, 'TIME_CATALOG_SCOPE_CHANGED'); assert.equal(sql.calls.length, 1);
});
test('partial streams and declared lengths are rejected; duplicate nested names remain visible', async () => {
  for (const bytes of ['{"operation":"command","payload":{"payload":{},"payload":{}}}', JSON.stringify({operation: 'command', payload: command()})]) {
    const req = new PassThrough(), original = request(), {handler, sql} = setup(), res = response(); Object.assign(req, original); delete req.body;
    if (bytes.startsWith('{"operation":"command","payload":{"payload"')) req.headers['content-length'] = String(Buffer.byteLength(bytes)); else req.headers['content-length'] = String(Buffer.byteLength(bytes) + 1);
    const pending = handler(req, res); req.end(bytes); await pending; assert.ok(res.statusCode >= 400); assert.equal(sql.calls.length, 0);
  }
});
test('bootstrap returns scoped permissions and truthful readiness, without authority identities', async () => {
  const {handler, sql} = setup({result: bootstrap()}), res = response(); await handler(get({resource: 'bootstrap'}), res);
  assert.equal(res.statusCode, 200); assert.equal(res.payload.data.scopeVersion, scopeVersion); assert.deepEqual(res.payload.data.permissions, {canPropose: true, canApprove: false, canAudit: false}); assert.equal(res.payload.data.minutesCalculated, false); assert.match(sql.calls[0].query, /time_catalog_bootstrap_v1/); assert.equal(res.payload.data.summary.ruleProfile, 1);
});
test('list preserves full count beyond the page; filters cannot return another kind or shorten a page', async () => {
  const input = {kind: 'rule_profile', status: 'draft', limit: 1, offset: 1}, valid = {principal: sqlPrincipal, records: [record()], page: {limit: 1, offset: 1, total: 3, hasMore: true}};
  const data = await timeCatalogRead({query: async () => [{result: sqlText(valid)}]}, principal, session, 'list', input); assert.equal(data.page.total, 3); assert.equal(data.page.hasMore, true);
  for (const mutate of [r => r.records = [], r => r.page.total = 1, r => r.records[0].kind = 'shift', r => r.records[0].employeeName = 'NOMINAL FORBIDDEN']) {
    const r = structuredClone(valid); mutate(r); await assert.rejects(timeCatalogRead({query: async () => [{result: sqlText(r)}]}, principal, session, 'list', input), e => e.status === 503);
  }
});
test('detail validates selected id and audit scope; a capped timeline is explicitly possibly incomplete', async () => {
  const p = {...sqlPrincipal, capabilities: [...sqlPrincipal.capabilities, 'time.catalog.audit.read']};
  const r = record(); r.version = 100;
  const detail = {principal: p, record: r, timeline: Array.from({length: 100}, (_, i) => ({command: i ? 'update_draft' : 'create_draft', expectedVersion: i, resultingVersion: i + 1, reasonCode: i ? 'draft_corrected' : 'catalog_onboarding', occurredAt: '2026-10-02T12:00:00+00:00'})), auditAvailable: true, timelineLimit: 100};
  const data = await timeCatalogRead({query: async () => [{result: sqlText(detail)}]}, principal, session, 'detail', {id: ID}); assert.equal(data.timelineMayBeIncomplete, true);
  detail.auditAvailable = false; await assert.rejects(timeCatalogRead({query: async () => [{result: sqlText(detail)}]}, principal, session, 'detail', {id: ID}), e => e.status === 503);
});
for (const [label, mutate] of [
  ['wrong hash', r => r.requestSha256 = 'e'.repeat(64)], ['wrong key', r => r.attemptKey = '22222222-2222-4222-8222-222222222222'],
  ['wrong version', r => r.data.version = 2], ['computed minutes', r => r.minutesCalculated = true], ['nominal field', r => r.data.dni = '99999999'],
  ['numeric string in SQL', r => {}], ['wrong decimal', r => r.data.configuration.parameters.find(p => p.valueKind === 'decimal').decimalValue = '1.125'],
]) test('uncertain/wrong receipt rejects ' + label + ' with safe503', async () => {
  const r = receipt(); mutate(r); const {handler} = setup({rows: [{result: label === 'numeric string in SQL' ? JSON.stringify(r) : sqlText(r)}]}), res = response();
  await handler(request(), res); assert.equal(res.statusCode, 503); assert.doesNotMatch(JSON.stringify(res.payload), /99999999|qa@example|SELECT|tenantId/);
});
test('database revocation/conflict messages are actionable but never expose SQL or nominal data', async () => {
  for (const [code, status] of [['TIME_SOURCE_SESSION_INVALID', 401], ['TIME_CATALOG_PERSON_SOD_CONFLICT', 403], ['TIME_CATALOG_VERSION_CONFLICT', 409], ['TIME_CATALOG_NATIVE_PERIOD_INVALID', 422], ['TIME_CATALOG_SESSION_BUSY', 409]]) {
    const {handler} = setup({error: Error(code + ' SQL secret nominal fixture')}), res = response(); await handler(request(), res); assert.equal(res.statusCode, status); assert.doesNotMatch(JSON.stringify(res.payload), /SQL secret|nominal fixture/);
  }
});
test('all four exact payloads match SQL snapshots without projecting assignment identities', () => {
  for (const kind of ['calendar', 'shift', 'rule_profile', 'assignment']) { const body = command({kind, payload: payload(kind)}); assert.deepEqual(timeCatalogCommand(body), body); timeCatalogMatches(record(body), body); }
});
test('shift geometry catches Sunday-to-Monday overlap and retains explicit zero tolerance', () => {
  const p = payload('shift'); p.spec.intervals.push({day: 1, sequence: 1, kind: 'break', start: '01:00:00', end: '03:00:00', crossesMidnight: false}); assert.throws(() => timeCatalogPayload('shift', p), /superponen/);
  p.spec.intervals[1].start = '02:00:00'; assert.equal(timeCatalogPayload('shift', p).spec.entryToleranceSeconds, 0);
});
test('rule types, units, duplicates and manual approval cannot be inferred or coerced', () => {
  for (const mutate of [p => p.spec.parameters[0].value = null, p => p.spec.parameters[0].unitCode = '', p => p.spec.parameters[0].value = '1e3', p => p.spec.parameters[0].value = '1.1234567', p => p.spec.parameters.push(p.spec.parameters[0])]) { const p = payload(); mutate(p); assert.throws(() => timeCatalogPayload('rule_profile', p)); }
  const b = command({command: 'approve', kind: null, payload: null, id: ID, expectedVersion: 2, reasonCode: 'configuration_verified'}); assert.throws(() => timeCatalogCommand(b)); assert.equal(timeCatalogCommand({...b, manualValidationConfirmed: true}).command, 'approve');
});
test('lossless SQL JSON parser rejects duplicates, trailing input and malformed numerics', () => {
  for (const s of ['{"decimalValue":01}', '{"a":1,"a":2}', '{"a":1} garbage', '{"a":[1,]}', '{"decimalValue":"1.25"}', '{"integerValue":1e3}', '{"offset":9007199254740993}']) assert.throws(() => normalizeTimeCatalogSqlJson(parseTimeCatalogSqlJson(s)));
  assert.deepEqual(normalizeTimeCatalogSqlJson(parseTimeCatalogSqlJson('{"decimalValue":99999999999999.123456,"integerValue":999999999999999999}')), {decimalValue: '99999999999999.123456', integerValue: '999999999999999999'});
  assert.equal(timeCatalogNumeric('-0.000000', 'decimal'), '0'); assert.throws(() => timeCatalogSqlPayload({spec: {parameters: [{valueKind: 'decimal', value: '0,"tenantId":"inject"'}]}}));
});
