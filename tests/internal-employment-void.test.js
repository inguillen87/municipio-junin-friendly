import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';

const {createEmploymentVoidHandler} = await import('../api/internal-employment-void.js');
const {employmentVoidOperation, employmentVoidError} = await import('../lib/internal-employment-void.js');
const {VOID_VERSION, VOID_ACKNOWLEDGEMENT} = await import('../assets/native-employment-void-model.js');
const uid = n => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const CONTRACT = uid(1), PROPOSAL = uid(2), ATTEMPT = uid(3);
const SCOPE = 'a'.repeat(64), BASE = 'b'.repeat(64), VERSION = 'c'.repeat(64);
const session = {id: uid(4), email: 'administrador@example.invalid', version: 2, releaseSha: 'd'.repeat(40)};
const principal = {
  user: {email: session.email},
  tenant: {id: uid(5), source: 'membership', membershipId: uid(6),
    effectiveCapabilities: ['workforce.employee.read', 'employee.record.propose', 'employee.record.approve']},
};
const body = () => ({operation: 'propose', payload: {
  contractId: CONTRACT, scopeVersion: SCOPE, baseVersion: BASE,
  reason: 'Alta histórica sintética sin relación vigente', acknowledgement: VOID_ACKNOWLEDGEMENT,
}});
const review = decision => ({operation: 'review', payload: {
  contractId: CONTRACT, proposalId: PROPOSAL, scopeVersion: SCOPE, proposalVersion: VERSION,
  decision, reason: 'Decisión independiente sobre el alta histórica sintética',
}});
const receipt = (operation = 'propose', decision = 'approve') => ({
  version: VOID_VERSION, operation, contractId: CONTRACT, proposalId: PROPOSAL,
  status: operation === 'propose' ? 'pending' : decision === 'approve' ? 'approved' : 'rejected',
  proposalVersion: VERSION, approvalId: operation === 'review' ? uid(7) : null,
  reviewVersion: operation === 'review' ? 'e'.repeat(64) : null,
  replayed: false, payrollModified: false, datesModified: false, supersededProposals: [],
});
const bootstrap = () => ({
  version: VOID_VERSION, scopeVersion: SCOPE, baseVersion: BASE,
  subject: {contractId: CONTRACT, registrationId: uid(8), legajo: '1001',
    employeeName: 'Persona de prueba', status: 'active', startDate: '1990-01-01', endDate: null},
  state: {voided: false, version: null, approvalId: null, approvedAt: null},
  dependencies: [], pendingOperations: [], proposals: [],
  permissions: {canPropose: true, canReview: true}, complete: true,
});
function request(method = 'POST', value = body(), headers = {}, query = {}, url) {
  const payload = typeof value === 'string' ? value : JSON.stringify(value);
  const req = Readable.from(method === 'POST' ? [Buffer.from(payload)] : []);
  Object.assign(req, {method, query, url: url ?? '/api/internal-employment-void' + (Object.keys(query).length ? '?' + new URLSearchParams(query) : ''),
    headers: {'origin': 'https://municontrol.com', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'idempotency-key': ATTEMPT, ...headers}});
  return req;
}
function response() {
  return {headers: {}, statusCode: 0, body: null,
    setHeader(n, v) { this.headers[n.toLowerCase()] = v; },
    status(s) { this.statusCode = s; return this; },
    json(b) { this.body = b; return this; },
  };
}
async function run(req, options = {}) {
  const calls = [], authorizations = [], res = response();
  const access = options.access ?? {mode: 'managed', principal};
  const handler = createEmploymentVoidHandler({
    env: {INTERNAL_APP_ORIGIN: 'https://municontrol.com'},
    requireAccess: options.authorize ?? (async (r, s, requirements) => {authorizations.push(requirements); return access;}),
    sessionFor: () => options.session ?? session,
    getSql: async () => ({query: async (sql, params) => {
      calls.push({sql, params});
      if (options.sqlError) throw options.sqlError;
      return [{result: options.result ?? receipt()}];
    }}),
  });
  await handler(req, res);
  return {calls, authorizations, res};
}
test('bootstrap requires certified managed binding and does not expose a mutable cache', async () => {
  const {calls, authorizations, res} = await run(request('GET', null, {}, {resource: 'bootstrap', contractId: CONTRACT}), {result: bootstrap()});
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.subject.endDate, null);
  assert.match(calls[0].sql, /native_employment_void_bootstrap_v1/);
  assert.deepEqual(authorizations[0].requiredCapabilities, ['workforce.employee.read']);
  assert.equal(authorizations[0].allowLegacy, false);
  assert.equal(authorizations[0].requireCertifiedDataBinding, true);
  assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.vary, 'Cookie, Origin');
});
test('anonymous request stops before body consumption or database connection', async () => {
  const {res, calls} = await run(request(), {authorize: async (_, res) => {res.status(401).json({ok: false}); return null;}});
  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 0);
});
for (const [label, access] of [
  ['legacy mode', {mode: 'legacy', principal}],
  ['no membership', {mode: 'managed', principal: {...principal, tenant: {...principal.tenant, source: 'legacy'}}}],
  ['no read capability', {mode: 'managed', principal: {...principal, tenant: {...principal.tenant, effectiveCapabilities: ['employee.record.propose']}}}],
]) test('rejects ' + label + ' before SQL', async () => {
  const {res, calls} = await run(request(), {access});
  assert.equal(res.statusCode, 403); assert.equal(calls.length, 0);
});
test('a read-only operator cannot propose or review', async () => {
  const access = {mode: 'managed', principal: {...principal, tenant: {...principal.tenant, effectiveCapabilities: ['workforce.employee.read']}}};
  for (const b of [body(), review('approve')]) {
    const {res, calls} = await run(request('POST', b), {access});
    assert.equal(res.statusCode, 403); assert.equal(calls.length, 0);
  }
});
for (const [label, req] of [
  ['cross origin', () => request('POST', body(), {origin: 'https://other.invalid'})],
  ['cross-site fetch', () => request('POST', body(), {'sec-fetch-site': 'cross-site'})],
  ['missing origin', () => request('POST', body(), {origin: ''})],
  ['wrong content type', () => request('POST', body(), {'content-type': 'text/plain'})],
  ['repeated query', () => request('GET', null, {}, {resource: 'bootstrap', contractId: CONTRACT}, '/api/internal-employment-void?resource=bootstrap&resource=bootstrap&contractId=' + CONTRACT)],
  ['query on mutation', () => request('POST', body(), {}, {resource: 'propose'})],
  ['unsupported method', () => request('DELETE')],
]) test('rejects ' + label + ' without authorizing or touching SQL', async () => {
  const {res, calls, authorizations} = await run(req());
  assert.ok(res.statusCode >= 400 && res.statusCode < 500);
  assert.equal(calls.length, 0); assert.equal(authorizations.length, 0);
});
for (const [label, b] of [
  ['unexpected tenant', {...body(), payload: {...body().payload, tenantId: uid(9)}}],
  ['date edit', {...body(), payload: {...body().payload, endDate: '2026-11-09'}}],
  ['unsupported operation', {...body(), operation: 'approveEverything'}],
  ['caller identity', {...body(), actorPersonId: uid(9)}],
  ['absent acknowledgement', {...body(), payload: {...body().payload, acknowledgement: ''}}],
  ['duplicate JSON keys', '{"operation":"propose","operation":"review","payload":{}}'],
]) test('rejects ' + label + ' without a write', async () => {
  const {res, calls} = await run(request('POST', b));
  assert.ok([400, 422].includes(res.statusCode));
  assert.equal(calls.length, 0);
});
test('requires idempotency key and a matching application session', async () => {
  for (const options of [{headers: {'idempotency-key': ''}}, {session: {...session, email: 'someone-else@example.invalid'}}]) {
    const {res, calls} = await run(request('POST', body(), options.headers), options);
    assert.equal(res.statusCode, options.session ? 401 : 428); assert.equal(calls.length, 0);
  }
});
test('oversized streamed JSON without Content-Length returns 413 before SQL', async () => {
  const b = body(); b.payload.reason = 'x'.repeat(17000);
  const req = request('POST', b);
  assert.equal(req.headers['content-length'], undefined);
  const {res, calls} = await run(req);
  assert.equal(res.statusCode, 413);
  assert.equal(res.body.code, 'NATIVE_EMPLOYMENT_VOID_INPUT_INVALID');
  assert.equal(calls.length, 0);
});
test('installed reader missing or out-of-scope contract returns 404', async () => {
  const {res} = await run(request('GET', null, {}, {resource: 'bootstrap', contractId: CONTRACT}),
    {sqlError: Error('NATIVE_EMPLOYEE_READ_NOT_FOUND')});
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NATIVE_EMPLOYMENT_VOID_NOT_FOUND');
});
test('proposal uses parameterized SQL, audited server identity and preserved dates', async () => {
  const {res, calls} = await run(request());
  assert.equal(res.statusCode, 201); assert.equal(calls.length, 1);
  assert.equal(calls[0].sql, 'SELECT public.native_employment_void_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result');
  assert.deepEqual(JSON.parse(calls[0].params[0]), {
    actorEmail: session.email, actorSessionId: session.id, actorSessionVersion: session.version,
    releaseSha: session.releaseSha, tenantId: principal.tenant.id, membershipId: principal.tenant.membershipId,
  });
  assert.equal(calls[0].params[2], ATTEMPT);
  assert.equal(res.body.data.datesModified, false);
});
for (const decision of ['approve', 'reject']) test('independent ' + decision + ' binds exact proposal version', async () => {
  const {res, calls} = await run(request('POST', review(decision)), {result: receipt('review', decision)});
  assert.equal(res.statusCode, 201); assert.match(calls[0].sql, /native_employment_void_review_v1/);
  assert.equal(res.body.data.proposalVersion, VERSION);
});
test('replayed mutation and lookup return the same stored outcome as 200', async () => {
  const r = {...receipt(), replayed: true};
  for (const req of [request(), request('GET', null, {}, {resource: 'attempt', contractId: CONTRACT, key: ATTEMPT})]) {
    const {res} = await run(req, {result: r});
    assert.equal(res.statusCode, 200); assert.equal(res.headers['idempotency-replayed'], 'true');
  }
});
for (const [label, patch] of [
  ['wrong target', {contractId: uid(99)}],
  ['changed dates', {datesModified: true}],
  ['changed payroll', {payrollModified: true}],
  ['wrong operation', {operation: 'review'}],
  ['extra nominal data', {dni: '11111111'}],
]) test('does not acknowledge a response with ' + label, async () => {
  const {res} = await run(request(), {result: {...receipt(), ...patch}});
  assert.equal(res.statusCode, 503); assert.equal(res.body.ok, false);
});
test('does not acknowledge a decision for another proposal version', async () => {
  const {res} = await run(request('POST', review('approve')), {result: {...receipt('review'), proposalVersion: 'f'.repeat(64)}});
  assert.equal(res.statusCode, 503);
});
for (const [code, status] of [['MAKER_CHECKER_REQUIRED', 403], ['BASE_CHANGED', 409], ['IN_USE', 409], ['ORIGIN_NOT_SUPPORTED', 409], ['WITHDRAWN', 409], ['BUSY', 409]]) {
  test('preserves server ' + code + ' without reporting success', async () => {
    const {res} = await run(request(), {sqlError: Error('NATIVE_EMPLOYMENT_VOID_' + code)});
    assert.equal(res.statusCode, status); assert.equal(res.body.ok, false);
    if (code === 'BUSY') assert.equal(res.headers['retry-after'], '1');
  });
}
test('unknown SQL failure reveals no query, credential or person', async () => {
  const {res} = await run(request(), {sqlError: Error('password=private SELECT nombre FROM employee')});
  assert.equal(res.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(res.body), /password|private|SELECT|nombre/);
});
test('adapter rejects malformed lookup and validates query result instead of trusting SQL shape', async () => {
  let count = 0;
  const sql = {query: async () => {count++; return [];}};
  await assert.rejects(employmentVoidOperation(sql, principal, session, 'bootstrap', {contractId: '792'}), {status: 400});
  assert.equal(count, 0);
  await assert.rejects(employmentVoidOperation(sql, principal, session, 'bootstrap', {contractId: CONTRACT}), {status: 503});
  assert.equal(count, 1);
  assert.equal(employmentVoidError({code: '40001'}).status, 409);
});
