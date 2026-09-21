import test from 'node:test';
import assert from 'node:assert/strict';
import { createInternalPayrollFixedNoveltiesHandler } from '../api/internal-payroll-fixed-novelties.js';
import { prepareFixedCommand, validateFixedResponse, fixedCall, fixedDate, fixedPeriod } from '../lib/internal-payroll-fixed-novelties.js';
import { fixedFixture, fixedSubject, fixedValues, fixedUuid as uuid } from './fixtures/payroll-fixed-novelties-synthetic.js';
import { fixedBootstrap, fixedEmployee, fixedList, fixedDetail, fixedReceipt, fixedExportData } from '../assets/payroll-fixed-novelties-model.js';

// Synthetic in-memory contract responses. SQL transitions are independently
// exercised by the real migration verifier, never mocked as production evidence.
const fixture = () => fixedFixture();
const session = { id: uuid(900), email: 'preparer@example.invalid', version: 1, releaseSha: 'a'.repeat(40) };
const principal = (caps = ['payroll.novelty.read', 'payroll.novelty.nominal.read', 'payroll.novelty.prepare', 'payroll.novelty.approve', 'payroll.novelty.export']) => ({
  user: { email: session.email }, tenant: { source: 'membership', id: uuid(1), membershipId: uuid(2), certifiedReleaseSha: session.releaseSha, effectiveCapabilities: caps },
});
const propose = patch => ({ recordId: null, expectedVersion: 0, contractId: fixedSubject().contractId, legajo: '1001', identityToken: fixedSubject().identityToken,
  operation: 'set', values: fixedValues(), reason: 'Alta administrativa de ensayo', ...patch });
const review = patch => ({ recordId: uuid(40), proposalId: uuid(50), expectedVersion: 1, decision: 'approve', reason: 'Cotejo independiente de ensayo', ...patch });
const receipt = (command = 'propose', patch = {}) => ({ version: 'payroll-fixed-receipt.v1', command, recordId: uuid(40), proposalId: uuid(50), recordVersion: command === 'propose' ? 1 : 2, duplicate: false, ...patch });
const code = suffix => ({ code: 'PAYROLL_FIXED_' + suffix });
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } });
const request = (command = 'propose', payload = propose()) => ({ method: 'POST', query: {}, headers: { origin: 'https://municipio.example', 'content-type': 'application/json', 'idempotency-key': uuid(777) }, body: { command, payload } });
function setup(result = receipt(), caps, overrides = {}) {
  const calls = { auth: [], sql: [], session: 0 };
  const handler = createInternalPayrollFixedNoveltiesHandler({ env: { INTERNAL_APP_ORIGIN: 'https://municipio.example' },
    requireCompatibleInternalAccess: async (_req, _res, opts) => { calls.auth.push(opts); return { mode: 'managed', principal: principal(caps) }; },
    actionMutationSession: () => { calls.session++; return session; }, getInternalSql: async () => ({ query: async (statement, values) => {
      calls.sql.push({ statement, values }); if (result instanceof Error) throw result; return [{ result }];
    } }), ...overrides });
  return { handler, calls };
}

test('permanent proposal preserves explicit zero, null and open civil end without 2050 or concept rules', () => {
  for (const values of [fixedValues({ quantityDecimal: '0', amountCents: null, validTo: null }), fixedValues({ quantityDecimal: null, amountCents: '0', forced: true, forcedReason: 'Importe explícito según acto' }), fixedValues({ conceptSourceId: '80', quantityDecimal: '-1.250000', amountCents: '-12345' })]) {
    const input = propose({ values }); assert.deepEqual(prepareFixedCommand('propose', input), input);
  }
  assert.equal(fixedDate('2024-02-29'), true); assert.equal(fixedDate('2026-02-29'), false);
  assert.equal(fixedPeriod('2026-09-01'), true); assert.equal(fixedPeriod('2026-09-02'), false);
});
test('proposal rejects impossible dates, empty evidence, unknown keys and numeric coercion', () => {
  const invalidValues = [{ quantityDecimal: null, amountCents: null }, { quantityDecimal: '-0.000' }, { amountCents: '-0' }, { quantityDecimal: 1 }, { amountCents: 0 },
    { quantityDecimal: '1.1234567' }, { amountCents: '1000000000000000000' }, { conceptSourceId: '080' }, { costCenterSourceId: '' }, { payrollType: 'automatic' },
    { forced: true, forcedReason: 'Fundamento explícito', amountCents: null }, { forced: true, forcedReason: null, amountCents: '0' }, { forced: false, forcedReason: 'No aplica' },
    { legalInstrument: '' }, { legalInstrument: '<acta>' }, { validFrom: '2026-02-30' }, { validTo: '2026-01-01' }, { validTo: '2101-01-01' }, { validFrom: null }];
  for (const patch of invalidValues) assert.throws(() => prepareFixedCommand('propose', propose({ values: fixedValues(patch) })), undefined, JSON.stringify(patch));
  for (const patch of [{ recordId: null, expectedVersion: 1 }, { recordId: uuid(4), expectedVersion: 0 }, { identityToken: '' }, { contractId: '1001' },
    { legajo: '01001' }, { operation: 'annul', values: null }, { reason: null }, { reason: 'line\nbreak' }, { actorEmail: 'forged@example.invalid' }]) assert.throws(() => prepareFixedCommand('propose', propose(patch)));
});
test('annulment and review demand exact version and explicit reason without removing original values', () => {
  const annul = propose({ recordId: uuid(4), expectedVersion: 2, operation: 'annul', values: null });
  assert.deepEqual(prepareFixedCommand('propose', annul), annul);
  assert.throws(() => prepareFixedCommand('propose', { ...annul, values: fixedValues() }), code('INVALID_PAYLOAD'));
  for (const decision of ['approve', 'reject']) assert.equal(prepareFixedCommand('review', review({ decision })).decision, decision);
  for (const patch of [{ decision: 'paid' }, { proposalId: null }, { expectedVersion: 0 }, { reason: 'ok' }, { approvedBy: 'forged' }]) assert.throws(() => prepareFixedCommand('review', review(patch)), code('INVALID_PAYLOAD'));
});
test('API authenticates nominal authority before parsing even an empty or malformed POST', async () => {
  let sqlCalls = 0;
  const { handler } = setup(null, undefined, { requireCompatibleInternalAccess: async (_req, res) => { res.status(401).json({ ok: false }); return null; }, getInternalSql: () => { sqlCalls++; } });
  for (const body of [{}, '{invalid', undefined]) {
    const res = response(); await handler({ method: 'POST', query: {}, headers: {}, body }, res); assert.equal(res.statusCode, 401);
  }
  assert.equal(sqlCalls, 0);
});
test('API requires command capability after nominal auth and before any SQL call', async () => {
  for (const command of ['propose', 'review']) {
    const { handler, calls } = setup(receipt(command), ['payroll.novelty.read', 'payroll.novelty.nominal.read']), res = response();
    await handler(request(command, command === 'propose' ? propose() : review()), res);
    assert.equal(res.statusCode, 403); assert.equal(calls.sql.length, 0);
  }
  const denied = setup(receipt(), ['payroll.novelty.read']), res = response(); await denied.handler(request(), res);
  assert.equal(res.statusCode, 403); assert.equal(denied.calls.sql.length, 0);
});
test('POST binds context server-side and preserves one exact attempt on receipt replay', async () => {
  for (const duplicate of [false, true]) {
    const { handler, calls } = setup(receipt('propose', { duplicate })), res = response(); await handler(request(), res);
    assert.equal(res.statusCode, duplicate ? 200 : 201); assert.match(calls.sql[0].statement, /payroll_fixed_propose_v1/);
    assert.deepEqual(JSON.parse(calls.sql[0].values[0]), { actorEmail: session.email, actorSessionId: session.id, actorSessionVersion: 1,
      membershipId: uuid(2), releaseSha: session.releaseSha, tenantId: uuid(1) });
    assert.deepEqual(JSON.parse(calls.sql[0].values[1]), propose()); assert.equal(calls.sql[0].values[2], uuid(777));
    assert.doesNotThrow(() => fixedReceipt(res.body, 'propose'));
    if (duplicate) assert.equal(res.headers['Idempotency-Replayed'], 'true');
    assert.match(res.headers['Cache-Control'], /private, no-store/);
  }
});
test('private transport rejects duplicate keys, cross origin, invalid body and oversized payload', async () => {
  for (const patch of [{ headers: { ...request().headers, origin: 'https://foreign.example' } }, { headers: { ...request().headers, 'idempotency-key': 'not-a-key' } },
    { body: '{"command":"propose","command":"review","payload":{}}' }, { body: { command: 'propose', payload: propose(), salary: true } },
    { body: 'x'.repeat(17000) }, { headers: { ...request().headers, 'content-type': 'text/plain' } }]) {
    const { handler, calls } = setup(), res = response(); await handler({ ...request(), ...patch }, res);
    assert.ok(res.statusCode >= 400 && res.statusCode < 500); assert.equal(calls.sql.length, 0);
  }
});
test('queries are exact, reject ambiguity and never interpolate identifiers into SQL', async () => {
  for (const query of [{ resource: 'employee', legajo: '01001' }, { resource: 'detail', recordId: uuid(4), extra: 'x' }, { resource: 'list', periodMonth: '2026-09-15' },
    { resource: 'attempt', key: uuid(7) }, { resource: 'attempt', key: uuid(7), command: 'cancel' }, { resource: 'export', periodMonth: '2026-09-01', snapshotToken: '' }]) {
    const { handler, calls } = setup(), res = response(); await handler({ method: 'GET', query }, res); assert.equal(res.statusCode, 400); assert.equal(calls.sql.length, 0);
  }
  const { handler, calls } = setup(), res = response();
  await handler({ method: 'GET', query: { resource: 'employee', legajo: '1001' }, url: '/api/internal-payroll-fixed-novelties?resource=employee&legajo=1001&legajo=1001' }, res);
  assert.equal(res.statusCode, 400); assert.equal(calls.sql.length, 0);
});
test('bootstrap and employee responses match independent frontend contracts without invented authority', async () => {
  const f = fixture();
  for (const [query, result, validator] of [[{}, f.bootstrap(), fixedBootstrap], [{ resource: 'employee', legajo: '1001' }, { version: 'payroll-fixed-employee.v1', subject: fixedSubject() }, p => fixedEmployee(p, '1001')]]) {
    const { handler } = setup(result), res = response(); await handler({ method: 'GET', query }, res); assert.equal(res.statusCode, 200); assert.doesNotThrow(() => validator(res.body));
  }
  const data = f.bootstrap(); data.principal.tenantId = uuid(9);
  assert.throws(() => validateFixedResponse(data, 'bootstrap', { tenantId: uuid(1), membershipId: uuid(2) }), code('CONTRACT_DRIFT'));
});
test('approved snapshot remains exportable during pending/rejected correction and retained in detail', async () => {
  const f = fixture(), initial = f.mutate('propose', propose(), uuid(701));
  f.state.role = 'reviewer'; f.mutate('review', review({ recordId: initial.data.recordId, proposalId: initial.data.proposalId }), uuid(702));
  f.state.role = 'preparer'; f.mutate('propose', propose({ recordId: initial.data.recordId, expectedVersion: 2, values: fixedValues({ amountCents: '0' }) }), uuid(703));
  for (const action of ['pending', 'rejected']) {
    if (action === 'rejected') { f.state.role = 'reviewer'; const r = f.state.records[0]; f.mutate('review', review({ recordId: r.id, proposalId: r.pending.id, expectedVersion: 3, decision: 'reject' }), uuid(704)); }
    const list = f.list('2026-09-01'); assert.equal(list.rows[0].approved.values.amountCents, null);
    assert.doesNotThrow(() => validateFixedResponse(list, 'list', { periodMonth: '2026-09-01' }));
    assert.doesNotThrow(() => fixedList({ ok: true, data: list }, '2026-09-01'));
    const detail = f.detail(initial.data.recordId); assert.doesNotThrow(() => validateFixedResponse(detail, 'detail', { recordId: initial.data.recordId }));
    assert.doesNotThrow(() => fixedDetail({ ok: true, data: detail }, initial.data.recordId));
    const exported = f.exporter('2026-09-01'); assert.equal(exported.rows[0].values.amountCents, null);
    assert.doesNotThrow(() => validateFixedResponse(exported, 'export', { periodMonth: '2026-09-01', snapshotToken: list.snapshotToken }));
    assert.doesNotThrow(() => fixedExportData({ ok: true, data: exported }, fixedList({ ok: true, data: list }, '2026-09-01')));
  }
});
test('response validators reject drift, foreign identity, wrong version and fabricated salary effects', () => {
  for (const patch of [{ recordVersion: 8 }, { recordId: uuid(999) }, { command: 'review' }, { duplicate: 'true' }, { salaryApproved: true }]) {
    assert.throws(() => validateFixedResponse(receipt('propose', patch), 'propose', { command: 'propose', recordId: uuid(40), expectedVersion: 0 }), code('CONTRACT_DRIFT'));
  }
  for (const mutate of [d => { d.total = 1; }, d => { d.effects.payrollPosted = true; }, d => { d.snapshotToken = ''; }, d => { d.periodMonth = '2026-10-01'; }]) {
    const data = structuredClone(fixture().list('2026-09-01')); mutate(data); assert.throws(() => validateFixedResponse(data, 'list', { periodMonth: '2026-09-01' }), code('CONTRACT_DRIFT'));
  }
  const pending = fixture(); pending.mutate('propose', propose(), uuid(701));
  const inconsistent = JSON.parse(JSON.stringify(pending.list(null))); inconsistent.rows[0].pending.values.quantityDecimal = '99';
  assert.throws(() => validateFixedResponse(inconsistent, 'list'), code('CONTRACT_DRIFT'));
  pending.state.role = 'reviewer'; const item = pending.state.records[0]; pending.mutate('review', review({ recordId: item.id, proposalId: item.pending.id }), uuid(702));
  const changedApproval = JSON.parse(JSON.stringify(pending.list(null))); changedApproval.rows[0].approved.values.amountCents = '0';
  assert.throws(() => validateFixedResponse(changedApproval, 'list'), code('CONTRACT_DRIFT'));
});
test('attempt recovery rechecks command permission and confirms only a matching duplicate receipt', async () => {
  const { handler, calls } = setup(receipt('review', { duplicate: true })), res = response();
  await handler({ method: 'GET', query: { resource: 'attempt', command: 'review', key: uuid(777) } }, res);
  assert.equal(res.statusCode, 200); assert.ok(calls.auth[0].requiredCapabilities.includes('payroll.novelty.approve'));
  assert.deepEqual(calls.sql[0].values.slice(1), ['review', uuid(777)]);
  const denied = setup(receipt(), ['payroll.novelty.read', 'payroll.novelty.nominal.read']), no = response();
  await denied.handler({ method: 'GET', query: { resource: 'attempt', command: 'propose', key: uuid(777) } }, no); assert.equal(no.statusCode, 403); assert.equal(denied.calls.sql.length, 0);
  await assert.rejects(fixedCall({ query: async () => [{ result: receipt() }] }, principal(), session, 'attempt', { command: 'propose', key: uuid(777) }), code('CONTRACT_DRIFT'));
});
test('safe errors expose only actionable codes and preserve auth failure mapping', async () => {
  for (const [raw, status, expected] of [['PAYROLL_FIXED_OVERLAP', 409, 'OVERLAP'], ['PAYROLL_FIXED_CAPACITY_LIMIT', 503, 'CAPACITY_LIMIT'],
    ['PAYROLL_NOVELTY_EMPLOYMENT_REQUIRED', 403, 'EMPLOYMENT_REQUIRED'], ['ACTION_SESSION_INVALID', 401, 'SESSION_INVALID'], ['raw db name with credentials', 503, 'UNAVAILABLE']]) {
    const { handler } = setup(new Error(raw)), res = response(); await handler(request(), res); assert.equal(res.statusCode, status); assert.equal(res.body.code, 'PAYROLL_FIXED_' + expected);
    if (expected === 'UNAVAILABLE') assert.ok(!JSON.stringify(res.body).includes('credentials'));
  }
});
