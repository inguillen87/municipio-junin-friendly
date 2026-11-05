import test from 'node:test';
import assert from 'node:assert/strict';
import { createInternalFamilyCertificatesHandler } from '../api/internal-family-certificates.js';
import { SCHOOLING_READ_V6_PREFLIGHT_SQL, SCHOOLING_READ_V6_PREFLIGHT_PINS } from '../lib/schooling-read-v6-admission.js';
import { nativeSchoolingFixture } from './fixtures/native-family-schooling-synthetic.js';
import { schoolingFixture, schoolingFixtureV2, schoolingFixtureV3, schoolingFixtureV4, syntheticUuid as uuid } from './fixtures/family-schooling-synthetic.js';

// Synthetic reports; access/session/SQL are injected. No database connection.
const session = { id: uuid(9001), email: 'read-v6@example.invalid', version: 7, releaseSha: 'a'.repeat(40) };
const authority = [session.email, session.id, 7, session.releaseSha, uuid(9002), uuid(9003)];
const ready = () => ({ version: 'schooling-read-v6-admission.v1', implementation: 'v6', payloadVersion: 'family-schooling.v5', ready: true });
function setup({ flag, data = nativeSchoolingFixture().data, admission = ready(), errorAt = 0,
  sqlError = Object.assign(new Error('private catalog detail'), { code: '42883' }), caps = ['workforce.employee.read', 'employee.record.propose'] } = {}) {
  const calls = { auth: 0, sql: [] };
  const handler = createInternalFamilyCertificatesHandler({ env: { SCHOOL_CERTIFICATE_READ_IMPLEMENTATION: flag },
    requireCompatibleInternalAccess: async () => { calls.auth++; return { mode: 'managed', principal: { user: { email: session.email },
      tenant: { source: 'membership', id: uuid(9002), membershipId: uuid(9003), certifiedReleaseSha: session.releaseSha, effectiveCapabilities: caps } } }; },
    actionMutationSession: () => session,
    getInternalSql: async () => ({ query: async (statement, values) => {
      calls.sql.push({ statement, values });
      if (calls.sql.length === errorAt) throw sqlError;
      return [{ result: structuredClone(statement === SCHOOLING_READ_V6_PREFLIGHT_SQL ? admission : data) }];
    } }),
  });
  return { calls, async request(query = { resource: 'report', version: '5' }) {
    const res = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.statusCode=n; return this; }, json(v) { this.body=v; return this; } };
    await handler({ method: 'GET', query, url: '/?'+new URLSearchParams(query), headers: {} }, res); return res;
  } };
}

test('v6 reader requires successful admission and preserves version5 payload and all authority arguments', async () => {
  const data = nativeSchoolingFixture().data, h = setup({ flag: 'v6', data }), res = await h.request();
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { ok: true, data });
  assert.equal(h.calls.sql.length, 2);
  assert.deepEqual(h.calls.sql[0], { statement: SCHOOLING_READ_V6_PREFLIGHT_SQL, values: [SCHOOLING_READ_V6_PREFLIGHT_PINS] });
  assert.match(h.calls.sql[1].statement, /^SELECT public\.school_certificate_read_v6\(/);
  assert.deepEqual(h.calls.sql[1].values, [...authority, null]);
});

test('default and explicit v5 never run the v6 preflight or reader', async () => {
  for (const flag of [undefined, 'v5']) {
    const h = setup({ flag }), res = await h.request();
    assert.equal(res.statusCode, 200); assert.equal(h.calls.sql.length, 1);
    assert.match(h.calls.sql[0].statement, /^SELECT public\.school_certificate_read_v5\(/);
    assert.deepEqual(h.calls.sql[0].values, [...authority, null]);
  }
});

test('HTTP6 and client-controlled implementation names are rejected before access or SQL', async () => {
  for (const query of [{ resource: 'report', version: '6' }, { resource: 'report', version: '5', implementation: 'v6' },
    { resource: 'family', version: '6', contractId: uuid(1) }]) {
    const h = setup({ flag: 'v6' }), res = await h.request(query);
    assert.equal(res.statusCode, 400); assert.equal(h.calls.auth, 0); assert.equal(h.calls.sql.length, 0);
  }
});

test('false/malformed admission and catalog failure never fall back to v5', async () => {
  for (const options of [{ admission: { ...ready(), ready: false } }, { admission: { ...ready(), ready: 'true' } },
    { admission: { ...ready(), payloadVersion: 'family-schooling.v6' } }, { admission: { ...ready(), extra: true } }, { errorAt: 1 }]) {
    const h = setup({ flag: 'v6', ...options }), res = await h.request();
    assert.equal(res.statusCode, 503); assert.equal(h.calls.sql.length, 1);
    assert.equal(h.calls.sql[0].statement, SCHOOLING_READ_V6_PREFLIGHT_SQL);
    assert.doesNotMatch(JSON.stringify(res.body), /private catalog detail/);
  }
});

test('v6 facade errors and incompatible payloads retain closed historical validation', async () => {
  for (const version of ['family-schooling.v4', 'family-schooling.v6']) {
    const data = nativeSchoolingFixture().data; data.version = version;
    const h = setup({ flag: 'v6', data }), res = await h.request();
    assert.equal(res.statusCode, 503); assert.equal(res.body.code, 'SCHOOL_CERTIFICATE_CONTRACT_DRIFT'); assert.equal(h.calls.sql.length, 2);
  }
  const h = setup({ flag: 'v6', errorAt: 2, sqlError: new Error('SCHOOL_CERTIFICATE_ROW_LIMIT') }), res = await h.request();
  assert.equal(res.statusCode, 422); assert.equal(res.body.code, 'SCHOOL_CERTIFICATE_ROW_LIMIT'); assert.equal(h.calls.sql.length, 2);
});

test('versions1–4 ignore the v5 implementation selector and retain their own readers', async () => {
  const fixtures = [schoolingFixture, schoolingFixtureV2, schoolingFixtureV3, schoolingFixtureV4];
  for (let version = 1; version <= 4; version++) {
    const data = fixtures[version-1](2).data, h = setup({ flag: 'invalid-value', data });
    const res = await h.request({ resource: 'report', ...(version === 1 ? {} : { version: String(version) }) });
    assert.equal(res.statusCode, 200); assert.deepEqual(res.body.data, data); assert.equal(h.calls.sql.length, 1);
    assert.match(h.calls.sql[0].statement, new RegExp(`^SELECT public\\.school_certificate_read_v${version}\\(`));
  }
});

test('activation accepts exact v5/v6 only and never grants missing read/write authority', async () => {
  for (const flag of ['', 'V6', ' v6', null, true, 6]) {
    const h = setup({ flag }), res = await h.request(); assert.equal(res.statusCode, 503); assert.equal(h.calls.sql.length, 0);
  }
  const denied = setup({ flag: 'v6', caps: [] }); assert.equal((await denied.request()).statusCode, 403); assert.equal(denied.calls.sql.length, 0);
  const reader = setup({ flag: 'v6', caps: ['workforce.employee.read'] }), res = await reader.request();
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.canRegister, false);
});

test('family reads preserve target and unknown manual expiry after v6 admission', async () => {
  const data = nativeSchoolingFixture({ mixed: false }).data, contractId = data.rows[0].contractId;
  data.rows = data.rows.filter(row => row.contractId === contractId); data.scope.cohort = 'contract_children';
  const h = setup({ flag: 'v6', data }), res = await h.request({ resource: 'family', version: '5', contractId });
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body.data, data);
  assert.equal(res.body.data.rows[0].effectiveDates.expiresOn, null);
  assert.deepEqual(h.calls.sql[1].values, [...authority, contractId]);
});
