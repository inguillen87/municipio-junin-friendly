import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createInternalFamilyCertificatesHandler } from '../api/internal-family-certificates.js';
import {
  SCHOOL_CERTIFICATE_MAX_BODY_BYTES, SCHOOL_CERTIFICATE_MAX_BYTES, SCHOOL_CERTIFICATE_STORAGE_CAPACITY_BYTES,
  prepareSchoolCertificate, validateSchoolCertificatePdf, validateSchoolCertificateReport,
  readSchoolCertificates, registerSchoolCertificate, downloadSchoolCertificate,
} from '../lib/internal-family-certificates.js';

// All PDF bytes and identities in this suite are generated synthetic fixtures.
// No source files, municipal records or credentials are read by these tests.
const ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT = '22222222-2222-4222-8222-222222222222';
const IMPORTED_CONTRACT = 'fedcba98-7654-0321-0123-456789abcdef';
const TENANT = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP = '44444444-4444-4444-8444-444444444444';
const SESSION = '55555555-5555-4555-8555-555555555555';
const RELEASE = 'a'.repeat(40), EMAIL = 'fixture@example.invalid';
const digest = value => createHash('sha256').update(value).digest('hex');
const md5 = value => createHash('md5').update(value).digest();
function rc4(key, bytes) {
  const s = Array.from({ length: 256 }, (_, i) => i); let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) % 256; [s[i], s[j]] = [s[j], s[i]]; }
  let i = 0; j = 0;
  return Buffer.from(bytes.map(byte => { i = (i + 1) % 256; j = (j + s[i]) % 256; [s[i], s[j]] = [s[j], s[i]]; return byte ^ s[(s[i] + s[j]) % 256]; }));
}
function syntheticPdf(pages = 1, password = null) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${pages} >>`];
  for (let i = 0; i < pages; i++) objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> >>');
  let trailerExtra = '';
  if (password !== null) {
    const pad = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex');
    const padded = value => { const p = Buffer.from(value).subarray(0, 32); return Buffer.concat([p, pad.subarray(0, 32 - p.length)]); };
    const o = rc4(md5(padded('owner-synthetic')).subarray(0, 5), padded(password));
    const permissions = Buffer.alloc(4); permissions.writeInt32LE(-4);
    const fileId = md5(Buffer.from('school-certificate-synthetic'));
    const key = md5(Buffer.concat([padded(password), o, permissions, fileId])).subarray(0, 5);
    const u = rc4(key, pad);
    objects.push(`<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${o.toString('hex')}> /U <${u.toString('hex')}> /P -4 >>`);
    trailerExtra = ` /Encrypt ${objects.length} 0 R /ID [<${fileId.toString('hex')}> <${fileId.toString('hex')}>]`;
  }
  let pdf = '%PDF-1.4\n'; const offsets = [];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${trailerExtra} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
const payload = (patch = {}) => {
  const bytes = syntheticPdf();
  return { contractId: CONTRACT, familyId: '7', identityToken: 'f'.repeat(64), filename: 'certificado-sintetico.pdf', contentBase64: bytes.toString('base64'), sha256: digest(bytes), presentedOn: '2026-09-14', expiresOn: null, ...patch };
};
const access = (capabilities = ['workforce.employee.read', 'employee.record.propose']) => ({
  mode: 'managed', session: { id: SESSION, email: EMAIL, version: 3 },
  principal: { user: { email: EMAIL }, tenant: { id: TENANT, membershipId: MEMBERSHIP, source: 'membership', certifiedReleaseSha: RELEASE, effectiveCapabilities: capabilities } },
});
const session = { id: SESSION, email: EMAIL, version: 3, releaseSha: RELEASE };
const registered = (duplicate = false) => ({ version: 'family-schooling-register.v1', certificateId: ID, duplicate });
function report(contractId = null) {
  return { version: 'family-schooling.v1', rows: [{ contractId: CONTRACT, legajo: 'SYN-1', employeeName: null, familyId: '7', familyName: null, birthDate: null, familyEndDate: null, identityToken: 'f'.repeat(64), sourceCutoff: '2026-09-01T00:00:00Z', administrativeActive: true, certificate: null, historyCount: 0 }],
    scope: { cohort: contractId ? 'contract_children' : 'administrative_active_with_children', sourceCutoffFrom: '2026-09-01T00:00:00Z', sourceCutoffTo: '2026-09-01T00:00:00Z', currentCensusCertified: false, payrollEligibilityCertified: false }, canRegister: true,
    storage: { mode: 'database_pilot', usedBytes: 0, remainingBytes: SCHOOL_CERTIFICATE_STORAGE_CAPACITY_BYTES, capacityBytes: SCHOOL_CERTIFICATE_STORAGE_CAPACITY_BYTES } };
}
function response() {
  return { headers: {}, statusCode: null, payload: null, bytes: null,
    setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; }, end(value) { this.bytes = value; return this; } };
}
function request(body = payload()) {
  return { method: 'POST', query: {}, headers: { origin: 'https://municipio.example', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'idempotency-key': ID }, body };
}
function setup(overrides = {}) {
  const calls = { auth: 0, sql: [], parsed: 0 };
  const sql = { query: async (statement, values) => { calls.sql.push({ statement, values }); return [{ result: registered() }]; } };
  const handler = createInternalFamilyCertificatesHandler({ env: { INTERNAL_APP_ORIGIN: 'https://municipio.example', INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE },
    requireCompatibleInternalAccess: async (_req, _res, options) => { calls.auth++; calls.options = options; return access(); },
    getInternalSql: async () => sql, validatePdf: async () => { calls.parsed++; }, ...overrides });
  return { handler, calls };
}
const expectCode = suffix => ({ code: `SCHOOL_CERTIFICATE_${suffix}` });

test('real isolated PDF parser accepts generated 1/30-page documents and leaves caller bytes intact', async () => {
  for (const pages of [1, 30]) {
    const bytes = syntheticPdf(pages), before = digest(bytes);
    assert.deepEqual(await validateSchoolCertificatePdf(bytes), { pages }); assert.equal(digest(bytes), before);
  }
});
test('real isolated PDF parser rejects invalid, 31-page and encrypted PDFs including empty user passwords', async () => {
  await assert.rejects(validateSchoolCertificatePdf(Buffer.from('%PDF-1.4\ninvalid\n%%EOF')), expectCode('PDF_INVALID'));
  await assert.rejects(validateSchoolCertificatePdf(syntheticPdf(31)), expectCode('PDF_TOO_MANY_PAGES'));
  for (const password of ['synthetic-password', '']) await assert.rejects(validateSchoolCertificatePdf(syntheticPdf(1, password)), expectCode('PDF_ENCRYPTED'));
});
test('PDF worker deadline terminates validation with a safe error', async () => {
  await assert.rejects(validateSchoolCertificatePdf(syntheticPdf(), { timeoutMs: 1 }), expectCode('PDF_TIMEOUT'));
});
test('payload preserves civil dates without deriving a cycle or rejecting an earlier expiration', async () => {
  const input = payload({ presentedOn: '2026-09-14', expiresOn: '2025-12-31' });
  assert.deepEqual(await prepareSchoolCertificate(input), input);
  assert.equal((await prepareSchoolCertificate(payload())).expiresOn, null);
});
test('payload rejects unknown fields, arrays, incorrect hashes, noncanonical base64, dates and oversized files before parsing', async () => {
  let parsed = 0;
  const validatePdf = async () => { parsed++; };
  const invalid = [[], payload({ filename: '../certificado.pdf' }), payload({ filename: 'unsafe\r\n.pdf' }), payload({ familyId: 7 }), payload({ familyId: ['7'] }), payload({ personId: ID }), payload({ sha256: 'b'.repeat(64) }), payload({ contentBase64: payload().contentBase64 + '\n' }), payload({ identityToken: 'G'.repeat(64) }), payload({ presentedOn: '2026-02-30' }), payload({ expiresOn: '1899-12-31' }), payload({ presentedOn: '2101-01-01' })];
  const huge = Buffer.alloc(SCHOOL_CERTIFICATE_MAX_BYTES + 1); huge.write('%PDF-1.4\n');
  invalid.push(payload({ contentBase64: huge.toString('base64'), sha256: digest(huge) }));
  for (const value of invalid) await assert.rejects(prepareSchoolCertificate(value, { validatePdf }));
  assert.equal(parsed, 0);
});
test('SQL adapters bind exactly the managed principal6 and validate report scope', async () => {
  const calls = [];
  const sql = { query: async (statement, values) => { calls.push({ statement, values }); return { rows: [{ result: report(CONTRACT) }] }; } };
  const result = await readSchoolCertificates(sql, access().principal, session, CONTRACT);
  assert.equal(result.rows[0].familyName, null);
  assert.deepEqual(calls[0].values, [EMAIL, SESSION, 3, RELEASE, TENANT, MEMBERSHIP, CONTRACT]);
  assert.match(calls[0].statement, /school_certificate_read_v1\(\$1::text/);
  const wrong = access().principal; wrong.tenant.source = 'owner';
  await assert.rejects(readSchoolCertificates(sql, wrong, session), expectCode('TENANT_MEMBERSHIP_REQUIRED'));
  assert.equal(calls.length, 1);
});
test('report and family GET preserve imported PostgreSQL contract UUIDs without RFC version bits', async () => {
  for (const resource of ['report', 'family']) {
    const data = report(resource === 'family' ? IMPORTED_CONTRACT : null);
    data.rows[0].contractId = IMPORTED_CONTRACT;
    const query = resource === 'family' ? { resource, contractId: IMPORTED_CONTRACT.toUpperCase() } : { resource };
    const sqlCalls = [];
    const { handler } = setup({ getInternalSql: async () => ({ query: async (statement, values) => { sqlCalls.push(values); return [{ result: data }]; } }) });
    const res = response();
    await handler({ method: 'GET', query, headers: {}, url: '/api/internal-family-certificates?' + new URLSearchParams(query) }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.rows[0].contractId, IMPORTED_CONTRACT);
    assert.equal(sqlCalls[0][6], resource === 'family' ? IMPORTED_CONTRACT : null);
  }
});
test('POST normalizes imported contract UUIDs while malformed contract identifiers never reach SQL', async () => {
  const { handler, calls } = setup(), res = response();
  await handler(request(payload({ contractId: IMPORTED_CONTRACT.toUpperCase() })), res);
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(calls.sql[0].values[6]).contractId, IMPORTED_CONTRACT);
  for (const contractId of [[IMPORTED_CONTRACT], IMPORTED_CONTRACT.replaceAll('-', ''), IMPORTED_CONTRACT + ' ', IMPORTED_CONTRACT.replace('f', 'g')]) {
    const denied = setup(), post = response(), get = response();
    await denied.handler(request(payload({ contractId })), post);
    assert.equal(post.payload.code, 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD');
    await denied.handler({ method: 'GET', query: { resource: 'family', contractId }, headers: {} }, get);
    assert.equal(get.payload.code, 'SCHOOL_CERTIFICATE_QUERY_INVALID');
    assert.equal(denied.calls.sql.length, 0); assert.equal(denied.calls.parsed, 0);
  }
});
test('imported contract compatibility does not relax principal, attempt or generated certificate UUIDs', async () => {
  const attempt = setup(), req = request(), res = response(); req.headers['idempotency-key'] = IMPORTED_CONTRACT;
  await attempt.handler(req, res);
  assert.equal(res.payload.code, 'SCHOOL_CERTIFICATE_IDEMPOTENCY_KEY_INVALID'); assert.equal(attempt.calls.sql.length, 0);
  for (const key of ['id', 'membershipId']) {
    const principal = access().principal; principal.tenant[key] = IMPORTED_CONTRACT;
    await assert.rejects(readSchoolCertificates({ query: async () => assert.fail('SQL must not run') }, principal, session), expectCode('TENANT_MEMBERSHIP_REQUIRED'));
  }
  await assert.rejects(readSchoolCertificates({ query: async () => assert.fail('SQL must not run') }, access().principal, { ...session, id: IMPORTED_CONTRACT }), expectCode('SESSION_INVALID'));
  const download = setup(), downloadRes = response();
  await download.handler({ method: 'GET', query: { resource: 'download', certificateId: IMPORTED_CONTRACT }, headers: {} }, downloadRes);
  assert.equal(downloadRes.payload.code, 'SCHOOL_CERTIFICATE_QUERY_INVALID'); assert.equal(download.calls.auth, 0);
  await assert.rejects(registerSchoolCertificate({ query: async () => [{ result: { ...registered(), certificateId: IMPORTED_CONTRACT } }] }, access().principal, session, payload(), ID), expectCode('CONTRACT_DRIFT'));
});
test('response validation rejects extra private fields, duplicated family rows and unrequested contracts', () => {
  for (const mutate of [d => { d.secret = 'synthetic'; }, d => { d.rows[0].sourcePayload = {}; }, d => { d.rows.push({ ...d.rows[0] }); }, d => { d.rows[0].administrativeActive = false; }, d => { d.scope.currentCensusCertified = true; }, d => { d.rows[0].historyCount = 1; }, d => { d.rows[0].familyId = 7; }, d => { d.rows[0].identityToken = ['f'.repeat(64)]; }, d => { d.scope.sourceCutoffFrom = '2026-09-01'; }]) {
    const d = report(); mutate(d); assert.throws(() => validateSchoolCertificateReport(d), expectCode('CONTRACT_DRIFT'));
  }
  assert.throws(() => validateSchoolCertificateReport(report(CONTRACT), ID), expectCode('CONTRACT_DRIFT'));
  const inactive = report(CONTRACT); inactive.rows[0].administrativeActive = false;
  assert.equal(validateSchoolCertificateReport(inactive, CONTRACT).rows.length, 1);
  const oversized = report(); oversized.rows = Array.from({ length: 5001 }, (_, i) => ({ ...oversized.rows[0], familyId: String(i + 1) }));
  assert.throws(() => validateSchoolCertificateReport(oversized), expectCode('CONTRACT_DRIFT'));
});
test('POST authorizes both capabilities, preserves payload/idempotency and reports duplicate success', async () => {
  for (const duplicate of [false, true]) {
    const { handler, calls } = setup({ getInternalSql: async () => ({ query: async (statement, values) => { calls.sql.push({ statement, values }); return [{ result: registered(duplicate) }]; } }) });
    const req = request(), res = response(); await handler(req, res);
    assert.equal(res.statusCode, duplicate ? 200 : 201); assert.deepEqual(res.payload, { ok: true, data: registered(duplicate) });
    assert.deepEqual(calls.options.requiredCapabilities, ['workforce.employee.read', 'employee.record.propose']);
    assert.equal(calls.options.allowLegacy, false); assert.equal(calls.options.requireCertifiedDataBinding, true);
    assert.deepEqual(JSON.parse(calls.sql[0].values[6]), req.body); assert.equal(calls.sql[0].values[7], ID);
    assert.equal(calls.parsed, 1);
    if (duplicate) assert.equal(res.headers['Idempotency-Replayed'], 'true');
  }
});
test('GET report strips register authority when the principal lacks propose capability', async () => {
  const { handler } = setup({ requireCompatibleInternalAccess: async () => access(['workforce.employee.read']), getInternalSql: async () => ({ query: async () => [{ result: report() }] }) });
  const res = response(); await handler({ method: 'GET', query: { resource: 'report' }, headers: {} }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.payload.data.canRegister, false);
  assert.equal(res.payload.data.scope.payrollEligibilityCertified, false);
});
test('read remains available with full storage and exposes only the bounded pilot capacity', async () => {
  for (const [capacityBytes, usedBytes] of [[8388608, 0], [8388608, 8388608], [1048576, 2097152], [0, 500], [0, 0]]) {
    const result = report(); result.storage.capacityBytes = capacityBytes; result.storage.usedBytes = usedBytes; result.storage.remainingBytes = 0; result.canRegister = false;
    if (usedBytes > 0) {
      const bytes = syntheticPdf();
      result.rows[0].certificate = { id: ID, filename: 'conservado.pdf', sha256: digest(bytes), byteLength: bytes.length, presentedOn: '2026-09-14', expiresOn: null, recordedAt: '2026-09-14T01:00:00.123456+00:00' };
      result.rows[0].historyCount = 1;
    }
    const { handler } = setup({ getInternalSql: async () => ({ query: async () => [{ result }] }) });
    const res = response(); await handler({ method: 'GET', query: { resource: 'report' }, headers: {} }, res);
    assert.equal(res.statusCode, 200); assert.equal(res.payload.data.rows.length, 1); assert.equal(res.payload.data.canRegister, false);
    assert.deepEqual(res.payload.data.storage, { mode: 'database_pilot', usedBytes, remainingBytes: 0, capacityBytes });
    if (usedBytes > 0) assert.equal(res.payload.data.rows[0].certificate.id, ID);
  }
});
test('storage response rejects missing/extra fields, unlimited modes and impossible byte counts', () => {
  for (const patch of [null, [], { mode: 'r2' }, { capacityBytes: 16777216 }, { capacityBytes: null }, { capacityBytes: -1 }, { capacityBytes: 1.5 }, { usedBytes: -1 }, { usedBytes: Number.MAX_SAFE_INTEGER + 1 }, { usedBytes: '0' }, { remainingBytes: '8388608' }, { remainingBytes: 1.5 }, { remainingBytes: -1 }, { remainingBytes: 8388609 }, { usedBytes: 1, remainingBytes: 8388608 }, { databaseSize: 123 }]) {
    const result = report(); result.storage = patch === null || Array.isArray(patch) ? patch : { ...result.storage, ...patch };
    assert.throws(() => validateSchoolCertificateReport(result), expectCode('CONTRACT_DRIFT'));
  }
  const missing = report(); delete missing.storage;
  assert.throws(() => validateSchoolCertificateReport(missing), expectCode('CONTRACT_DRIFT'));
  const fullButAllowed = report(); fullButAllowed.storage.remainingBytes = 0;
  assert.throws(() => validateSchoolCertificateReport(fullButAllowed), expectCode('CONTRACT_DRIFT'));
  const conservative = report(); conservative.storage.usedBytes = 1024; conservative.storage.remainingBytes = 2048;
  assert.equal(validateSchoolCertificateReport(conservative).storage.remainingBytes, 2048);
  const overQuota = report(); overQuota.storage = { mode: 'database_pilot', usedBytes: 2097152, capacityBytes: 1048576, remainingBytes: 1 };
  overQuota.canRegister = false;
  assert.throws(() => validateSchoolCertificateReport(overQuota), expectCode('CONTRACT_DRIFT'));
});
test('storage exhaustion returns a safe actionable error without infrastructure details or fallback', async () => {
  let registrations = 0;
  const { handler } = setup({ getInternalSql: async () => ({ query: async () => { registrations++; throw new Error('SCHOOL_CERTIFICATE_STORAGE_FULL'); } }) });
  const req = request(), before = JSON.stringify(req.body), res = response(); await handler(req, res);
  assert.equal(res.statusCode, 503); assert.equal(res.payload.code, 'SCHOOL_CERTIFICATE_STORAGE_FULL');
  assert.equal(res.payload.error, 'El archivo privado alcanzó su capacidad disponible. La carga se conserva; hace falta ampliar el almacenamiento antes de reintentar.');
  assert.doesNotMatch(JSON.stringify(res.payload), /pg_|postgres|cluster|database|neon|cloudflare|r2|bytes|SQL/i);
  assert.equal(registrations, 1); assert.equal(JSON.stringify(req.body), before);
});
test('POST blocks absent session, legacy/foreign authority, bad session and missing capabilities before PDF/SQL', async () => {
  const variants = [null, { ...access(), mode: 'legacy' }, (() => { const a = access(); a.principal.tenant.source = 'owner'; return a; })(), access([]), access(['workforce.employee.read']), (() => { const a = access(); a.session.email = 'other@example.invalid'; return a; })(), (() => { const a = access(); a.principal.tenant.certifiedReleaseSha = 'b'.repeat(40); return a; })()];
  for (const value of variants) {
    const { handler, calls } = setup({ requireCompatibleInternalAccess: async (_req, res) => { if (value === null) res.status(401).json({ ok: false }); return value; } });
    const res = response(); await handler(request(), res);
    assert.ok([401, 403, 503].includes(res.statusCode)); assert.equal(calls.parsed, 0); assert.equal(calls.sql.length, 0);
  }
});
test('POST rejects cross origin, origin spoofing/duplicates and invalid content type before authentication', async () => {
  for (const change of [r => { delete r.headers.origin; }, r => { r.headers.origin += '/'; }, r => { r.headers.origin = 'https://municipio.example.attacker.invalid'; }, r => { r.headers['sec-fetch-site'] = 'cross-site'; }, r => { r.headers.origin = ['https://municipio.example']; }, r => { r.rawHeaders = ['Origin', r.headers.origin, 'Origin', r.headers.origin]; }, r => { r.headers['content-type'] = 'text/plain'; }]) {
    const { handler, calls } = setup(), req = request(), res = response(); change(req); await handler(req, res);
    assert.ok([400, 403, 415].includes(res.statusCode)); assert.equal(calls.auth, 0); assert.equal(calls.parsed, 0);
  }
});
test('query allowlist rejects repeated/array/extra query parameters and POST queries', async () => {
  for (const q of [{}, { resource: ['report'] }, { resource: 'report', contractId: CONTRACT }, { resource: 'family', contractId: [CONTRACT] }, { resource: 'download', certificateId: 'bad' }, { resource: 'family', contractId: CONTRACT, tenantId: TENANT }]) {
    const { handler, calls } = setup(), res = response(); await handler({ method: 'GET', query: q, headers: {} }, res);
    assert.equal(res.payload.code, 'SCHOOL_CERTIFICATE_QUERY_INVALID'); assert.equal(calls.auth, 0);
  }
  for (const req of [{ method: 'GET', query: { resource: 'report' }, url: '/api/internal-family-certificates?resource=report&resource=family', headers: {} }, { ...request(), query: { resource: 'report' } }]) {
    const { handler } = setup(), res = response(); await handler(req, res); assert.equal(res.statusCode, 400);
  }
});
test('bounded streamed/raw/preparsed JSON rejects oversize, duplicate fields and malformed bodies before PDF/SQL', async () => {
  const duplicate = JSON.stringify(payload()).replace('"familyId":"7"', '"familyId":"8","familyId":"7"');
  const bodies = [duplicate, duplicate.replace('"familyId":"8"', '"family\\u0049d":"8"'), '{', '[]', [payload()], ' '.repeat(SCHOOL_CERTIFICATE_MAX_BODY_BYTES + 1), { ...payload(), extra: 'x'.repeat(SCHOOL_CERTIFICATE_MAX_BODY_BYTES) }];
  for (const body of bodies) {
    const { handler, calls } = setup(), res = response(); await handler(request(body), res);
    assert.ok([400, 413].includes(res.statusCode)); assert.equal(calls.parsed, 0); assert.equal(calls.sql.length, 0);
  }
  const { handler, calls } = setup(), req = Object.assign(Readable.from([Buffer.alloc(SCHOOL_CERTIFICATE_MAX_BODY_BYTES), Buffer.from('x')]), request());
  delete req.body; const res = response(); await handler(req, res);
  assert.equal(res.statusCode, 413); assert.equal(calls.parsed, 0);
});
test('declared length and idempotency validation prevent parser and registration calls', async () => {
  for (const patch of [{ 'content-length': String(SCHOOL_CERTIFICATE_MAX_BODY_BYTES + 1) }, { 'content-length': ['1'] }, { 'content-length': '-1' }, { 'idempotency-key': '' }, { 'idempotency-key': ['a', 'b'] }, { 'idempotency-key': 'not-a-uuid' }]) {
    const { handler, calls } = setup(), req = request(), res = response(); Object.assign(req.headers, patch); await handler(req, res);
    assert.ok([400, 413, 428].includes(res.statusCode)); assert.equal(calls.parsed, 0); assert.equal(calls.sql.length, 0);
  }
});
test('download returns validated binary attachment with private headers and no nominal filename', async () => {
  const bytes = syntheticPdf();
  const { handler } = setup({ getInternalSql: async () => ({ query: async () => [{ result: { version: 'family-schooling-download.v1', filename: 'synthetic-name.pdf', contentBase64: bytes.toString('base64'), sha256: digest(bytes), byteLength: bytes.length } }] }) });
  const res = response(); await handler({ method: 'GET', query: { resource: 'download', certificateId: ID }, headers: {} }, res);
  assert.equal(res.statusCode, 200); assert.deepEqual(res.bytes, bytes); assert.equal(res.payload, null);
  assert.match(res.headers['Content-Disposition'], /^attachment; filename="certificado-escolar-/); assert.doesNotMatch(res.headers['Content-Disposition'], /synthetic-name/);
  assert.match(res.headers['Cache-Control'], /no-store/); assert.equal(res.headers['X-Content-Type-Options'], 'nosniff'); assert.match(res.headers['Content-Security-Policy'], /sandbox/);
});
test('download rejects stored byte/hash/length corruption and extra fields before returning any PDF', async () => {
  const bytes = syntheticPdf(), base = { version: 'family-schooling-download.v1', filename: 'fixture.pdf', contentBase64: bytes.toString('base64'), sha256: digest(bytes), byteLength: bytes.length };
  for (const patch of [{ sha256: '0'.repeat(64) }, { byteLength: bytes.length + 1 }, { contentBase64: Buffer.from('not a PDF').toString('base64') }, { filename: 'x\r\n.pdf' }, { privatePayload: 'synthetic' }]) {
    await assert.rejects(downloadSchoolCertificate({ query: async () => [{ result: { ...base, ...patch } }] }, access().principal, session, ID), expectCode('CONTRACT_DRIFT'));
  }
});
test('safe SQL errors expose only allowlisted codes and never raw database messages', async () => {
  for (const [message, expected, status] of [['SCHOOL_CERTIFICATE_IDENTITY_CHANGED', 'IDENTITY_CHANGED', 409], ['SCHOOL_CERTIFICATE_IDEMPOTENCY_REUSE', 'IDEMPOTENCY_REUSE', 409], ['SCHOOL_CERTIFICATE_SESSION_BUSY', 'SESSION_BUSY', 409], ['SCHOOL_CERTIFICATE_NOT_FOUND', 'NOT_FOUND', 404], ['SCHOOL_CERTIFICATE_SOURCE_MAPPING_DRIFT', 'SOURCE_MAPPING_DRIFT', 503], ['private SQL detail fixture@example.invalid', 'SERVICE_UNAVAILABLE', 503]]) {
    const { handler } = setup({ getInternalSql: async () => ({ query: async () => { throw new Error(message); } }) }), res = response();
    await handler(request(), res); assert.equal(res.statusCode, status); assert.equal(res.payload.code, `SCHOOL_CERTIFICATE_${expected}`);
    assert.doesNotMatch(JSON.stringify(res.payload), /fixture@example.invalid/);
    if (expected === 'SOURCE_MAPPING_DRIFT') assert.equal(res.payload.error, 'La fuente de vínculos cambió. Hay que revisar su correspondencia antes de usar este reporte.');
    if (expected === 'SESSION_BUSY') assert.equal(res.headers['Retry-After'], '1');
  }
});
test('register response rejects extra fields and malformed IDs', async () => {
  for (const result of [{ ...registered(), sourcePayload: {} }, { ...registered(), certificateId: [] }, { ...registered(), duplicate: 'true' }]) {
    await assert.rejects(registerSchoolCertificate({ query: async () => [{ result }] }, access().principal, session, payload(), ID), expectCode('CONTRACT_DRIFT'));
  }
});
