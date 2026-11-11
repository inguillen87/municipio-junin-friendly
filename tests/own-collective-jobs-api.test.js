import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnCollectiveJobsHandler } from '../api/internal-own-collective-jobs.js';
import { COLLECTIVE_JOB_MAX_BYTES, ownCollectiveJobOperation, ownCollectiveJobStep, ownCollectiveJobPending } from '../lib/own-collective-jobs.js';
import { collectiveFixture } from './fixtures/own-contract-working-time-collective-synthetic.js';

const id = n => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
const capabilities = ['workforce.employee.read', 'payroll.parameter.read', 'payroll.parameter.prepare', 'payroll.parameter.approve'];
const principal = { user: { email: 'collective-qa@example.invalid' }, tenant: { source: 'membership', id: id(1), membershipId: id(2), effectiveCapabilities: capabilities } };
const session = { email: principal.user.email, id: id(3), version: 1, releaseSha: 'd'.repeat(40) };
const file = collectiveFixture(3).file;
const payload = () => ({ family: 'working-time', file: structuredClone(file), command: 'approve', reason: 'Revisión sintética del conjunto completo.' });
const snapshot = (patch = {}) => ({ version: 'own-collective-job.v1', id: id(4), family: 'working-time', period: '2026-10', command: 'approve', phase: 'preparing', total: 3, prepared: 0, confirmed: 0, unchanged: 0, completed: 0, reviewHash: null, pauseCode: null, createdAt: '2026-10-16T12:00:00Z', updatedAt: '2026-10-16T12:00:00Z', dispatchGeneration: 1, ...patch });
const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.value = value; return this; } });
const request = (operation = 'create', input = payload()) => ({ method: 'POST', url: '/api/internal-own-collective-jobs', query: {}, headers: { origin: 'https://municipio.example', 'content-type': 'application/json', 'idempotency-key': id(5) }, body: JSON.stringify({ operation, payload: input }) });
function setup(overrides = {}) {
  const calls = [], publications = [], stats = { connections: 0 };
  const handler = createOwnCollectiveJobsHandler({ env: { INTERNAL_APP_ORIGIN: 'https://municipio.example' }, requireAccess: async () => ({ mode: 'managed', principal }), sessionFor: () => session,
    getSql: async () => { stats.connections++; return { query: async (query, values) => { calls.push({ query, values }); return [{ result: snapshot() }]; } }; },
    publish: async value => { publications.push(value); }, ...overrides });
  return { handler, calls, publications, stats };
}
function readRequest(resource, query = {}) {
  const q = { resource, ...query };
  return { method: 'GET', query: q, url: '/api/internal-own-collective-jobs?' + new URLSearchParams(q), headers: {} };
}

test('creation stores the complete immutable file with the real session and only then queues the durable job', async () => {
  const a = setup(), res = response();
  await a.handler(request(), res);
  assert.equal(res.statusCode, 202);
  assert.equal(a.calls.length, 1);
  assert.match(a.calls[0].query, /own_collective_job_create_v1/);
  assert.equal(JSON.parse(a.calls[0].values[0]).actorSessionId, session.id);
  assert.equal(JSON.parse(a.calls[0].values[0]).actorEmail, principal.user.email);
  assert.deepEqual(JSON.parse(a.calls[0].values[2]), file);
  assert.equal(a.calls[0].values[5], id(5));
  assert.equal(a.publications.length, 1);
  assert.equal(res.value.dispatch, 'queued');
  assert.match(res.headers['Cache-Control'], /no-store/);
});

test('publish failure returns the stored job pending instead of pretending the upload failed', async () => {
  const a = setup({ publish: async () => { throw Error('private transport failure'); } }), res = response();
  await a.handler(request(), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.value.dispatch, 'pending');
  assert.equal(res.value.data.id, id(4));
  assert.equal(a.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(res.value), /private transport/);
});

test('seniority keeps unknown years and months distinct from explicit zero through the authenticated upload', async () => {
  const input = payload(); input.family = 'seniority'; input.file.version = 'own-salary-seniority-collective.v1';
  input.file.records = input.file.records.map((row, i) => ({ ...row, definition: { years: i === 0 ? null : '0', months: null, asOfDate: row.definition.asOfDate, documentReference: row.definition.documentReference } }));
  const a = setup({ getSql: async () => ({ query: async (_query, values) => {
    assert.equal(values[1], 'seniority');
    const stored = JSON.parse(values[2]);
    assert.equal(stored.records[0].definition.years, null);
    assert.equal(stored.records[1].definition.years, '0');
    assert.ok(stored.records.every(row => row.definition.months === null));
    return [{ result: snapshot({ family: 'seniority' }) }];
  } }) }), res = response();
  await a.handler(request('create', input), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.value.data.family, 'seniority');
});

test('revoked access or invalid session fails before file/body access and SQL connection', async () => {
  for (const overrides of [
    { requireAccess: async () => ({ mode: 'managed', principal: { ...principal, tenant: { ...principal.tenant, effectiveCapabilities: [] } } }) },
    { sessionFor: () => ({ ...session, id: null }) },
  ]) {
    const a = setup(overrides), req = request(), res = response(); let reads = 0;
    Object.defineProperty(req, 'body', { get() { reads++; throw Error('body must remain unread'); } });
    await a.handler(req, res);
    assert.ok([401, 403].includes(res.statusCode));
    assert.equal(reads, 0);
    assert.equal(a.stats.connections, 0);
  }
});

for (const [label, change] of [
  ['foreign origin', req => req.headers.origin = 'https://other.invalid'],
  ['wrong MIME', req => req.headers['content-type'] = 'text/plain'],
  ['missing attempt key', req => delete req.headers['idempotency-key']],
  ['forged actor context', req => { const p = payload(); p.actorContext = { actorEmail: 'forged@example.invalid' }; req.body = JSON.stringify({ operation: 'create', payload: p }); }],
  ['partial population', req => { const p = payload(); p.file.records.pop(); req.body = JSON.stringify({ operation: 'create', payload: p }); }],
  ['duplicate contract', req => { const p = payload(); p.file.records[1] = p.file.records[0]; req.body = JSON.stringify({ operation: 'create', payload: p }); }],
  ['ambiguous JSON key', req => req.body = '{"operation":"create","operati\\u006fn":"confirm","payload":{}}'],
  ['invalid UTF8', req => req.body = Buffer.from([0xff])],
  ['declared truncated body', req => req.headers['content-length'] = String(Buffer.byteLength(req.body) + 1)],
  ['oversized declared body', req => req.headers['content-length'] = String(COLLECTIVE_JOB_MAX_BYTES + 1)],
  ['unsupported method', req => req.method = 'DELETE'],
  ['query on write', req => { req.query = { operation: 'confirm' }; req.url += '?operation=confirm'; }],
  ['numeric hours lose original precision', req => { const p = payload(); p.file.records[0].definition.dailyHours = 7.5; req.body = JSON.stringify({ operation: 'create', payload: p }); }],
  ['empty review hash', req => { req.body = JSON.stringify({ operation: 'confirm', payload: { id: id(4), reviewHash: '', confirmed: true } }); }],
  ['unchecked review', req => { req.body = JSON.stringify({ operation: 'confirm', payload: { id: id(4), reviewHash: 'e'.repeat(64), confirmed: false } }); }],
]) test(`rejects ${label} before any SQL or enqueue`, async () => {
  const a = setup(), req = request(), res = response(); change(req);
  await a.handler(req, res);
  assert.ok(res.statusCode >= 400, `${label}: ${res.statusCode}`);
  assert.equal(a.calls.length, 0);
  assert.equal(a.publications.length, 0);
});

test('read permission cannot authorize creation, confirmation, resumption or cancellation', async () => {
  const readOnly = { ...principal, tenant: { ...principal.tenant, effectiveCapabilities: capabilities.slice(0, 2) } };
  for (const [operation, input] of [['create', payload()], ['confirm', { id: id(4), reviewHash: 'e'.repeat(64), confirmed: true }], ['resume', { id: id(4) }], ['cancel', { id: id(4) }]]) {
    const a = setup({ requireAccess: async () => ({ mode: 'managed', principal: readOnly }) }), res = response();
    await a.handler(request(operation, input), res);
    assert.equal(res.statusCode, 403);
    assert.equal(a.calls.length, 0);
  }
});

test('list recovers jobs without an already selected period and exposes explicit pagination', async () => {
  const a = setup({ getSql: async () => ({ query: async (query, values) => {
    assert.match(query, /own_collective_job_list_v1/); assert.deepEqual(values.slice(1), ['working-time', null, id(9)]);
    return [{ result: { jobs: [snapshot()], hasMore: true, nextCursor: id(4) } }];
  } }) }), res = response();
  await a.handler(readRequest('list', { family: 'working-time', cursor: id(9) }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.value.data.hasMore, true);
  assert.equal(res.value.data.nextCursor, id(4));
  assert.equal(a.publications.length, 0);
});

test('detail preserves exact definitions and is explicitly paginated without leaking stored actor state', async () => {
  const item = { contractId: file.records[0].contractId, legajo: file.records[0].legajo, before: null, after: file.records[0].definition, action: 'approve', confirmed: false };
  const a = setup({ getSql: async () => ({ query: async (query, values) => {
    assert.match(query, /own_collective_job_inspect_v1/); assert.deepEqual(values.slice(1), [id(4), true, 0, 1]);
    return [{ result: snapshot({ phase: 'prepared', prepared: 3, reviewHash: 'e'.repeat(64), comparisons: [item], comparisonTotal: 3, nextOffset: 1, actorContext: { actorEmail: 'private@example.invalid' } }) }];
  } }) }), res = response();
  await a.handler(readRequest('detail', { id: id(4), offset: '0', limit: '1' }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.value.data.comparisons[0], item);
  assert.equal(res.value.data.nextOffset, 1);
  assert.ok(!Object.hasOwn(res.value.data, 'actorContext'));
  assert.doesNotMatch(JSON.stringify(res.value), /private@example/);
});

test('ambiguous queries and invalid page sizes do not reach SQL', async () => {
  for (const req of [readRequest('detail', { id: id(4), offset: '-1' }), readRequest('detail', { id: id(4), limit: '201' }), readRequest('status', { id: id(4), secret: 'no' })]) {
    const a = setup(), res = response(); await a.handler(req, res); assert.equal(res.statusCode, 400); assert.equal(a.calls.length, 0);
  }
  const req = readRequest('status', { id: id(4) }); req.url += '&id=' + id(4);
  const a = setup(), res = response(); await a.handler(req, res); assert.equal(res.statusCode, 400); assert.equal(a.calls.length, 0);
});

test('SQL errors are safely mapped and corrupt result identities are rejected', async () => {
  for (const [message, status] of [['COLLECTIVE_JOB_INDEPENDENT_REQUIRED secret@example.invalid', 403], ['ACTION_SESSION_INVALID', 401], ['COLLECTIVE_JOB_POPULATION_CHANGED', 409], ['password secret unexpected', 503]]) {
    const a = setup({ getSql: async () => ({ query: async () => { throw Error(message); } }) }), res = response();
    await a.handler(request(), res);
    assert.equal(res.statusCode, status); assert.doesNotMatch(JSON.stringify(res.value), /secret|password|@/);
  }
  const a = setup({ getSql: async () => ({ query: async () => [{ result: snapshot({ id: id(88) }) }] }) }), res = response();
  await a.handler(readRequest('status', { id: id(4) }), res); assert.equal(res.statusCode, 503);
});

test('canonical worker SQL receives only job ID, expected generation and a bounded chunk', async () => {
  const calls = [], sql = { query: async (query, values) => { calls.push({ query, values }); return [{ result: snapshot({ dispatchGeneration: 2 }) }]; } };
  const r = await ownCollectiveJobStep(sql, id(4), 1, 8);
  assert.equal(r.dispatchGeneration, 2); assert.deepEqual(calls[0].values, [id(4), 1, 8]);
  assert.match(calls[0].query, /own_collective_job_step_v1/);
  await assert.rejects(() => ownCollectiveJobStep(sql, id(4), 2, 1000), /permitidos|Revisá/);
  assert.equal(calls.length, 1);
});

test('pending rows reveal no actor or personnel to the dispatcher and enforce result cardinality', async () => {
  const jobs = await ownCollectiveJobPending({ query: async () => [{ result: [{ id: id(4), dispatchGeneration: 2, actorContext: { secret: true } }] }] }, 20);
  assert.deepEqual(jobs, [{ id: id(4), dispatchGeneration: 2 }]);
  await assert.rejects(() => ownCollectiveJobPending({ query: async () => [{ result: [snapshot(), snapshot()] }] }, 1), /verificar/);
});

test('mutations preserve the requested hash and delegate atomic checks to the canonical SQL entrypoint', async () => {
  for (const operation of ['confirm', 'resume', 'cancel']) {
    const calls = [], input = operation === 'confirm' ? { id: id(4), reviewHash: 'e'.repeat(64), confirmed: true } : { id: id(4) };
    await ownCollectiveJobOperation({ query: async (query, values) => { calls.push({ query, values }); return [{ result: snapshot() }]; } }, principal, session, operation, input);
    assert.match(calls[0].query, new RegExp(`own_collective_job_${operation}_v1`));
    assert.equal(calls[0].values[1], id(4));
    if (operation === 'confirm') assert.equal(calls[0].values[2], input.reviewHash);
  }
});
