import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import { CATALOG_VERSION, catalogItems, catalogProposalInput, catalogReviewInput, catalogDiff, validateCatalogBootstrap, validateCatalogProposal, validateCatalogReceipt } from '../assets/native-employment-catalog-model.js';
import { employmentCatalogOperation, employmentCatalogError, EMPLOYMENT_CATALOG_MAX_BYTES } from '../lib/internal-employment-catalog.js';
import { createEmploymentCatalogHandler, parseCatalogJson, readCatalogBody } from '../api/internal-employment-catalog.js';
import { nativeEmployeeError } from '../lib/internal-native-employees.js';
import { ID, TENANT, principal as employeePrincipal, session, catalog as employeeCatalog } from './fixtures/native-employee-synthetic.js';

const items = () => employeeCatalog.items.map((row, i) => ({...row, key: `source-${i}`, agreementCode: row.agreementCode ?? null}));
const baseVersion = 'b'.repeat(64), scopeVersion = 'd'.repeat(64), proposalId = ID;
const proposalInput = () => ({scopeVersion, baseVersion, reason: 'Referencia administrativa sintética QA', items: items()});
const reviewInput = () => ({scopeVersion, proposalId, decision: 'approve', reason: 'Revisión independiente sintética QA'});
const summary = (patch = {}) => ({id: proposalId, status: 'pending', reason: 'Motivo sintético QA', createdAt: '2026-09-23T12:00:00+00:00', authorLabel: 'preparador@example.invalid', baseVersion, canReview: true, ...patch});
const bootstrap = () => ({version: CATALOG_VERSION, scopeVersion, catalog: {items: items(), version: baseVersion, origin: 'GRH', revision: 0, publishedAt: null}, permissions: {canPropose: true, canReview: true}, proposals: [summary()], historyTruncated: false});
const proposal = () => ({version: CATALOG_VERSION, proposal: {...summary(), items: items(), baseItems: items(), review: null}});
const receipt = (patch = {}) => ({version: CATALOG_VERSION, operation: 'propose', proposalId, status: 'pending', catalogVersion: baseVersion, revision: 0, replayed: false, ...patch});
const principal = {...employeePrincipal, tenant: {...employeePrincipal.tenant, effectiveCapabilities: ['workforce.employee.read', 'employee.catalog.propose', 'employee.catalog.approve']}};
const mockSql = result => ({calls: [], async query(query, values) { this.calls.push({query, values}); return [{result}]; }});

test('catalog is a complete normalized copy and preserves codes as text', () => {
  const rows = items(), before = structuredClone(rows); rows[0].label = '  Convenio propio QA  ';
  const result = catalogItems(rows);
  assert.equal(result.find(row => row.kind === 'agreements' && row.code === '1').label, 'Convenio propio QA');
  assert.equal(result.find(row => row.kind === 'categories').key, 'categories:1:6');
  assert.equal(rows[0].key, before[0].key); assert.equal(typeof result[0].code, 'string');
});
for (const [label, mutate] of [
  ['unknown fields', rows => { rows[0].tenantId = TENANT; }], ['missing keys', rows => { delete rows[0].key; }],
  ['duplicate code', rows => rows.push({...rows[0], key: 'another'})], ['no sectors', rows => rows.splice(8)],
  ['wrong agreement', rows => { rows[2].agreementCode = '999'; }], ['number code', rows => { rows[0].code = 1; }],
  ['forbidden agreement', rows => { rows[0].code = '9'; }], ['label control', rows => { rows[0].label = 'bad\nname'; }],
  ['markup', rows => { rows[0].label = '<img>'; }], ['wrong relationship', rows => { rows[0].agreementCode = '1'; }],
  ['long label', rows => { rows[0].label = 'a'.repeat(161); }], ['empty label', rows => { rows[0].label = ' '; }],
]) test('catalog rejects ' + label, () => { const rows = items(); mutate(rows); assert.throws(() => catalogItems(rows)); });
test('a category code may be reused by another agreement but not twice in the same agreement', () => {
  const rows = items(); rows.push({kind: 'categories', key: 'custom', code: '6', agreementCode: '2', label: 'Otra clase QA'});
  assert.equal(catalogItems(rows).length, rows.length); rows.at(-1).agreementCode = '1'; assert.throws(() => catalogItems(rows));
});
test('proposal and review are closed contracts with an explicit reference', () => {
  assert.equal(catalogProposalInput(proposalInput()).baseVersion, baseVersion);
  assert.equal(catalogReviewInput(reviewInput()).decision, 'approve');
  for (const bad of [{...proposalInput(), actor: 'owner'}, {...proposalInput(), baseVersion: 'stale'}, {...proposalInput(), reason: 'short'}]) assert.throws(() => catalogProposalInput(bad));
  for (const bad of [{...reviewInput(), decision: 'publish'}, {...reviewInput(), reason: ''}, {...reviewInput(), proposalId: 5}]) assert.throws(() => catalogReviewInput(bad));
});
test('scope token is required for both operations and padded excluded agreements cannot bypass the rule', () => {
  const p = proposalInput(), r = reviewInput(); delete p.scopeVersion; delete r.scopeVersion;
  assert.throws(() => catalogProposalInput(p)); assert.throws(() => catalogReviewInput(r));
  for (const code of ['09', '00010']) { const rows = items(); rows[0].code = code; assert.throws(() => catalogItems(rows)); }
});
test('Unicode length limits count characters consistently with PostgreSQL', () => {
  const p = proposalInput(); p.items[0].label = '😀'.repeat(160); p.reason = '😀'.repeat(1000);
  assert.equal([...catalogProposalInput(p).reason].length, 1000);
  const b = bootstrap(); b.proposals[0].reason = p.reason; validateCatalogBootstrap(b);
});
test('diff groups actual additions, removals and renamed options; source keys alone are irrelevant', () => {
  const a = catalogItems(items()), b = structuredClone(a);
  b[0].key = 'different'; assert.deepEqual(catalogDiff(a, b), []);
  b[0].label = 'Renombrado QA'; const removed = b.splice(1, 1)[0]; b.push({...removed, code: '99', key: 'agreements::99'});
  assert.deepEqual(catalogDiff(a, b).map(row => row.change).sort(), ['added', 'changed', 'removed']);
});
test('response contracts reject false provenance, decision mismatch and excessive history', () => {
  validateCatalogBootstrap(bootstrap()); validateCatalogProposal(proposal()); validateCatalogReceipt(receipt());
  for (const mutate of [r => {r.catalog.origin = 'MUNICONTROL';}, r => {r.catalog.publishedAt = '2026-09-23';}, r => {r.permissions.canReview = 'yes';}, r => {r.proposals = Array(21).fill(summary());}, r => {r.proposals[0].status = 'approved';}]) {
    const r = bootstrap(); mutate(r); assert.throws(() => validateCatalogBootstrap(r));
  }
  assert.throws(() => validateCatalogProposal({...proposal(), proposal: {...proposal().proposal, status: 'approved', canReview: false, review: null}}));
  assert.throws(() => validateCatalogReceipt(receipt({operation: 'review', status: 'approved'})));
});
test('SQL facade parameterizes all input and derives identity only from the managed session', async () => {
  const sql = mockSql(receipt()), input = proposalInput(); input.reason = "Resolución QA O'Connor";
  await employmentCatalogOperation(sql, principal, session, 'propose', {key: ID, body: input});
  assert.match(sql.calls[0].query, /native_employment_catalog_propose_v1\(\$1::jsonb,\$2::jsonb,\$3::uuid\)/);
  assert.doesNotMatch(sql.calls[0].query, /Connor/); assert.equal(JSON.parse(sql.calls[0].values[0]).tenantId, TENANT);
  assert.equal(JSON.parse(sql.calls[0].values[1]).reason, input.reason);
});
test('all facade operations have explicit contracts including lost-response recovery', async () => {
  for (const [operation, input, result] of [['bootstrap', {}, bootstrap()], ['proposal', {id: ID}, proposal()], ['attempt', {key: ID}, receipt({replayed: true})], ['review', {key: ID, body: reviewInput()}, receipt({operation: 'review', status: 'approved', revision: 1, catalogVersion: 'c'.repeat(64)})]]) {
    const sql = mockSql(result); assert.equal(await employmentCatalogOperation(sql, principal, session, operation, input), result); assert.equal(sql.calls.length, 1);
  }
});
test('invalid session, UUID or unknown operation do not query SQL', async () => {
  for (const [actor, operation, input] of [[{...session, email: 'wrong@example.invalid'}, 'bootstrap', {}], [session, 'proposal', {id: 'x'}], [session, 'propose', {key: 'x', body: proposalInput()}], [session, 'erase', {key: ID}]]) {
    const sql = mockSql(receipt()); await assert.rejects(employmentCatalogOperation(sql, principal, actor, operation, input)); assert.equal(sql.calls.length, 0);
  }
});
test('review receipt mismatch cannot be reported as successful', async () => {
  for (const bad of [receipt(), receipt({operation: 'review', status: 'rejected'}), receipt({operation: 'review', status: 'approved', revision: 1, proposalId: TENANT})]) await assert.rejects(employmentCatalogOperation(mockSql(bad), principal, session, 'review', {key: ID, body: reviewInput()}), {status: 503});
});
test('proposal confirmation must retain the exact reviewed base', async () => {
  await assert.rejects(employmentCatalogOperation(mockSql(receipt({catalogVersion: 'f'.repeat(64)})), principal, session, 'propose', {key: ID, body: proposalInput()}), {status: 503});
});
test('safe errors never expose database content', () => {
  for (const [message, status] of [['secret NATIVE_EMPLOYMENT_CATALOG_BASE_CHANGED SELECT', 409], ['NATIVE_EMPLOYEE_BINDING_INVALID', 409], ['NATIVE_EMPLOYEE_SESSION_INVALID', 401], ['password=secret', 503]]) { const e = employmentCatalogError(Error(message)); assert.equal(e.status, status); assert.doesNotMatch(e.message, /secret|SELECT|password/); }
});
test('a concurrent catalog publication tells the employee registration to retry its same attempt', () => {
  const error = nativeEmployeeError(Error('NATIVE_EMPLOYMENT_CATALOG_BUSY'));
  assert.equal(error.status, 409); assert.equal(error.code, 'NATIVE_EMPLOYEE_BUSY');
});
test('scoped JSON parser accepts row fields and rejects repeated, escaped or deeply nested names', () => {
  const input = proposalInput(); assert.deepEqual(parseCatalogJson(JSON.stringify(input)), input);
  for (const source of ['{"a":1,"a":2}', '{"payload":{"reason":"a","re\\u0061son":"b"}}', '{"a":' + '['.repeat(9) + '1' + ']'.repeat(9) + '}', '{invalid}']) assert.throws(() => parseCatalogJson(source));
});
const response = () => ({headers: {}, setHeader(k, v) {this.headers[k] = v;}, status(c) {this.statusCode = c; return this;}, json(v) {this.payload = v; return this;}});
const request = () => ({method: 'POST', url: '/api/internal-employment-catalog', query: {}, headers: {origin: 'https://municipio.example', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'idempotency-key': ID}, body: JSON.stringify({operation: 'propose', payload: proposalInput()})});
const get = query => ({method: 'GET', url: '/api/internal-employment-catalog?' + new URLSearchParams(query), query, headers: {}});
function setup(options = {}) {
  const sql = mockSql(options.result ?? receipt()), stats = {connections: 0};
  const handler = createEmploymentCatalogHandler({env: {INTERNAL_APP_ORIGIN: 'https://municipio.example'}, sessionFor: () => session,
    requireAccess: async (_req, res, gates) => {stats.gates = gates; if (options.anonymous) {res.status(401).json({ok: false}); return null;} return options.access ?? {mode: 'managed', principal};},
    getSql: async () => {stats.connections++; return sql;}});
  return {handler, sql, stats};
}
test('API sends private receipt with certified managed authority and dedicated capability', async () => {
  const {handler, stats} = setup(), res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 201); assert.match(res.headers['Cache-Control'], /no-store/);
  assert.equal(stats.gates.requireCertifiedDataBinding, true); assert.equal(stats.gates.allowLegacy, false);
});
test('anonymous request cannot read business body or connect SQL', async () => {
  const {handler, stats} = setup({anonymous: true}), res = response(), req = request(); Object.defineProperty(req, 'body', {get() {throw Error('must not read');}});
  await handler(req, res); assert.equal(res.statusCode, 401); assert.equal(stats.connections, 0);
});
test('employee creation permission does not imply catalog preparation or review', async () => {
  const {handler, stats} = setup({access: {mode: 'managed', principal: employeePrincipal}}), res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 403); assert.equal(stats.connections, 0);
});
for (const [label, mutate] of [
  ['cross-origin', req => {req.headers.origin = 'https://evil.invalid';}], ['cross-site', req => {req.headers['sec-fetch-site'] = 'cross-site';}],
  ['type', req => {req.headers['content-type'] = 'text/plain';}], ['large declared body', req => {req.headers['content-length'] = String(EMPLOYMENT_CATALOG_MAX_BYTES + 1);}],
  ['ambiguous query', req => {req.url += '?resource=bootstrap&resource=bootstrap'; req.query = {resource: 'bootstrap'}; req.method = 'GET';}],
  ['unbound tenant', req => {req.query = {tenantId: TENANT}; req.url += '?tenantId=' + TENANT;}], ['method', req => {req.method = 'DELETE';}],
  ['duplicate body name', req => {req.body = '{"operation":"propose","operation":"review","payload":{}}';}],
  ['invalid utf8', req => {req.body = Buffer.from([0xff]);}], ['unknown command', req => {const body = JSON.parse(req.body); body.operation = 'erase'; req.body = JSON.stringify(body);}],
]) test('API rejects ' + label, async () => {const {handler, sql} = setup(), req = request(), res = response(); mutate(req); await handler(req, res); assert.ok(res.statusCode >= 400); assert.equal(sql.calls.length, 0);});
test('streamed JSON rows and replayed receipt use the same original key', async () => {
  const req = request(), source = req.body; delete req.body;
  req[Symbol.asyncIterator] = async function* () {yield Buffer.from(source.slice(0, 31)); yield Buffer.from(source.slice(31));};
  const {handler, sql} = setup({result: receipt({replayed: true})}), res = response(); await handler(req, res);
  assert.equal(res.statusCode, 200); assert.equal(res.headers['Idempotency-Replayed'], 'true'); assert.equal(sql.calls[0].values[2], ID);
});
test('Vercel restored raw stream bypasses a parser getter and rejects escaped duplicate names', async () => {
  const req = request(), stream = new PassThrough(); let getterReads = 0;
  Object.defineProperty(req, 'body', {get() {getterReads++; throw Error('must never read parser getter');}});
  req.on = (name, listener) => stream.on(name, listener); req.read = () => null; req.complete = true;
  const {handler, sql} = setup(), res = response(), done = handler(req, res);
  stream.end(Buffer.from('{"operation":"propose","operati\\u006fn":"review","payload":{}}'));
  await done; assert.equal(getterReads, 0); assert.equal(res.statusCode, 400); assert.equal(sql.calls.length, 0);
});
test('raw body reader rejects parsed objects, decoded streams and mismatched lengths', async () => {
  await assert.rejects(readCatalogBody({headers: {}, body: JSON.parse(request().body)}), {status: 400});
  await assert.rejects(readCatalogBody({headers: {'content-length': '1'}, body: request().body}), {status: 400});
  await assert.rejects(readCatalogBody({headers: {}, async *[Symbol.asyncIterator]() { yield request().body; }}), {status: 400});
});
test('stalled raw stream is bounded and releases its listeners', async () => {
  const stream = new PassThrough(); stream.headers = {};
  await assert.rejects(readCatalogBody(stream, {timeoutMs: 5}), {status: 503});
  for (const name of ['data', 'end', 'error', 'aborted', 'close']) assert.equal(stream.listenerCount(name), 0);
  stream.destroy();
});
test('GET routes reject extraneous fields and use bounded detail lookup', async () => {
  const a = setup({result: proposal()}), res = response(); await a.handler(get({resource: 'proposal', id: ID}), res); assert.equal(res.statusCode, 200);
  const b = setup(), denied = response(); await b.handler(get({resource: 'proposal', id: ID, raw: '1'}), denied); assert.equal(denied.statusCode, 400); assert.equal(b.stats.connections, 0);
});
