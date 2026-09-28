import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolCertificateSafeError } from '../lib/internal-family-certificates.js';
import { employeeFamilySafeError } from '../lib/internal-family-members.js';
import { createInternalFamilyCertificatesHandler } from '../api/internal-family-certificates.js';

// Synthetic errors only. No account, session, credential or municipal data is read.
const cases = [
  ['TENANT_IAM_SOD_CONFLICT', 'PROFILE_CONFLICT', 409],
  ['SCHOOL_CERTIFICATE_PROFILE_CONFLICT', 'PROFILE_CONFLICT', 409],
  ['ACTION_SESSION_INVALID', 'SESSION_INVALID', 401],
  ['SCHOOL_CERTIFICATE_SESSION_INVALID', 'SESSION_INVALID', 401],
  ['SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED', 'CAPABILITY_REQUIRED', 403],
  ['ACTION_TENANT_AUTHORITY_REQUIRED', 'TENANT_MEMBERSHIP_REQUIRED', 403],
  ['ACTION_SESSION_BUSY', 'SESSION_BUSY', 409],
  ['ACTION_RELEASE_NOT_CERTIFIED', 'RELEASE_NOT_CERTIFIED', 503],
  ['ACTION_SOURCE_BINDING_REQUIRED', 'SOURCE_BINDING_REQUIRED', 503],
  ['private query detail operator@qa.invalid', 'SERVICE_UNAVAILABLE', 503],
];
for (const [raw, suffix, status] of cases) for (const field of ['code', 'message']) {
  test(`family access preserves ${suffix} from ${field}: ${raw}`, () => {
    const error = { [field]: raw, detail: 'private detail operator@qa.invalid' };
    for (const [safe, prefix] of [[schoolCertificateSafeError(error), 'SCHOOL_CERTIFICATE'], [employeeFamilySafeError(error), 'EMPLOYEE_FAMILY']]) {
      assert.equal(safe.code, `${prefix}_${suffix}`); assert.equal(safe.status, status);
      assert.doesNotMatch(safe.message, /operator@qa\.invalid|private detail|SELECT|postgresql/i);
      if (suffix === 'PROFILE_CONFLICT') assert.match(safe.message, /sesión no está vencida/);
    }
  });
}
const ID = '11111111-1111-4111-8111-111111111111';
const TENANT = '22222222-2222-4222-8222-222222222222';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333333';
const RELEASE = 'a'.repeat(40), EMAIL = 'operator@qa.invalid';
for (const [raw, suffix, status] of cases) {
  test(`certificate HTTP keeps ${suffix} private and distinguishes access from availability`, async () => {
    let queries = 0;
    const handler = createInternalFamilyCertificatesHandler({ env: {},
      requireCompatibleInternalAccess: async (_req, _res, options) => {
        assert.equal(options.allowLegacy, false); assert.equal(options.requireCertifiedDataBinding, true);
        assert.deepEqual(options.requiredCapabilities, ['workforce.employee.read']);
        return { mode: 'managed', principal: { user: { email: EMAIL }, tenant: {
          id: TENANT, membershipId: MEMBERSHIP, source: 'membership',
          effectiveCapabilities: ['workforce.employee.read'], certifiedReleaseSha: RELEASE,
        } } };
      },
      actionMutationSession: () => ({ id: ID, email: EMAIL, version: 1, releaseSha: RELEASE }),
      getInternalSql: async () => ({ query: async () => { queries++; throw new Error(raw); } }),
    });
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(value) { this.statusCode = value; return this; }, json(value) { this.payload = value; return this; } };
    await handler({ method: 'GET', query: { resource: 'report' }, headers: {} }, res);
    assert.equal(queries, 1); assert.equal(res.statusCode, status);
    assert.equal(res.payload.code, `SCHOOL_CERTIFICATE_${suffix}`); assert.equal(res.payload.ok, false);
    assert.match(res.headers['Cache-Control'], /private, no-store/);
    assert.equal(res.headers['Retry-After'], suffix === 'SESSION_BUSY' ? '1' : undefined);
    assert.doesNotMatch(JSON.stringify(res.payload), /operator@qa\.invalid|private query/);
    assert.equal(res.headers['Set-Cookie'], undefined);
  });
}

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
function uiMessage() {
  const source = readFileSync(new URL('../assets/family-schooling.js', import.meta.url), 'utf8');
  const start = source.indexOf('function profileConflict(error)');
  const end = source.indexOf('async function request(', start);
  assert.ok(start >= 0 && end > start, 'Expected pure error-formatting functions');
  return runInNewContext(source.slice(start, end) + '\nmessage;');
}
for (const prefix of ['EMPLOYEE_FAMILY', 'SCHOOL_CERTIFICATE']) {
  test(`family UI explains ${prefix} profile conflicts without inventing session expiry`, () => {
    const text = uiMessage()({ status: 409, code: `${prefix}_PROFILE_CONFLICT` });
    assert.match(text, /perfil/); assert.match(text, /sesión sigue activa/);
    assert.match(text, /se conservan/); assert.doesNotMatch(text, /datos cambiaron|sesión venció/);
  });
}
test('family UI still distinguishes expired sessions from changed identities', () => {
  const message = uiMessage();
  assert.match(message({ status: 401 }), /sesión venció/);
  assert.match(message({ status: 409, code: 'EMPLOYEE_FAMILY_IDENTITY_CHANGED' }), /identidad del legajo/);
  assert.match(message({ status: 409 }), /datos cambiaron/);
});
