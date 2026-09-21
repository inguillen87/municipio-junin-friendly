import test from 'node:test';
import assert from 'node:assert/strict';
import { createInternalFamilyCertificatesHandler } from '../api/internal-family-certificates.js';
import { prepareSchoolCertificate, validateSchoolCertificateReport, validateSchoolCertificateHistory,
  readSchoolCertificateAttempt, readSchoolCertificateHistory } from '../lib/internal-family-certificates.js';
import { schoolingFixtureV3, syntheticUuid as uuid, syntheticSchoolPdf, syntheticSchoolHash } from './fixtures/family-schooling-synthetic.js';
import { schoolingData, schoolingHistoryData } from '../assets/family-schooling-model.js';

// Generated test-only identities/documents; no database or municipal files read.
const report = () => schoolingFixtureV3(2).data;
const family = report().rows[0];
const scope = { contractId: family.contractId, familyRef: family.familyRef, identityToken: family.identityToken };
const session = { id: uuid(800), email: 'qa@example.invalid', version: 1, releaseSha: 'a'.repeat(40) };
const principal = caps => ({ user: { email: session.email }, tenant: { source: 'membership', id: uuid(801), membershipId: uuid(802),
  certifiedReleaseSha: session.releaseSha, effectiveCapabilities: caps ?? ['workforce.employee.read', 'employee.record.propose'] } });
const receipt = duplicate => ({ version: 'family-schooling-register.v3', certificateId: uuid(100), duplicate });
const paper = patch => ({ ...scope, expectedCertificateId: null, institution: null, educationLevel: null, course: null, schoolYear: null,
  issuedOn: null, presentedOn: '2026-09-21', expiresOn: null, evidenceMode: 'paper_declared', paperReference: 'Recibido en carpeta de escolaridad',
  filename: null, contentBase64: null, sha256: null, reason: 'Registro administrativo de escolaridad', ...patch });
const pdf = patch => paper({ evidenceMode: 'pdf', paperReference: null, filename: 'prueba.pdf', contentBase64: syntheticSchoolPdf.toString('base64'), sha256: syntheticSchoolHash, ...patch });
const certificate = patch => ({ id: uuid(100), filename: null, sha256: null, byteLength: null, presentedOn: '2026-09-21', expiresOn: null,
  recordedAt: '2026-09-21T12:00:00.123456+00:00', recordKind: 'schooling_record', institution: null, educationLevel: null, course: null,
  schoolYear: null, issuedOn: null, evidenceMode: 'paper_declared', paperReference: 'Archivo de oficina', reason: 'Registro administrativo de escolaridad',
  supersedesId: null, recordedBy: session.email, ...patch });
const history = rows => ({ version: 'family-schooling-history.v3', ...scope, rows: rows ?? [certificate()], total: rows?.length ?? 1 });
const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; }, end(v) { this.bytes = v; return this; } });
const req = (body = paper()) => ({ method: 'POST', query: { version: '3' }, url: '/api/internal-family-certificates?version=3', body,
  headers: { origin: 'https://qa.example', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'idempotency-key': uuid(900) } });
function setup(result = receipt(false), caps) {
  const calls = { sql: [], pdf: 0, auth: [] };
  const handler = createInternalFamilyCertificatesHandler({ env: { INTERNAL_APP_ORIGIN: 'https://qa.example' },
    requireCompatibleInternalAccess: async (_req, _res, opts) => { calls.auth.push(opts); return { mode: 'managed', principal: principal(caps) }; },
    actionMutationSession: () => session,
    getInternalSql: async () => ({ query: async (statement, values) => { calls.sql.push({ statement, values }); if (result instanceof Error) throw result; return [{ result }]; } }),
    validatePdf: async () => { calls.pdf++; } });
  return { handler, calls };
}
const code = name => ({ code: `SCHOOL_CERTIFICATE_${name}` });

test('v3 paper preserves unknown metadata as null and never invokes PDF processing', async () => {
  const input = paper();
  assert.deepEqual(await prepareSchoolCertificate(input, { version: 3, validatePdf: () => assert.fail('no PDF') }), input);
  const normalized = await prepareSchoolCertificate(paper({ institution: '  Escuela de prueba  ', course: 'An\u0303o uno' }), { version: 3 });
  assert.equal(normalized.institution, 'Escuela de prueba'); assert.equal(normalized.course, 'Año uno');
});
test('v3 PDF uses the actual parser while preserving explicit metadata and civil dates', async () => {
  const input = pdf({ institution: 'Escuela sintética', educationLevel: 'Nivel informado', course: 'Curso informado', schoolYear: 2026,
    issuedOn: '2026-02-10', expiresOn: '2025-12-31' });
  assert.deepEqual(await prepareSchoolCertificate(input, { version: 3 }), input);
});
test('v3 rejects inferred substitutes, malformed dates/evidence/identity and extra approval flags before SQL', async () => {
  const patches = [{ institution: '' }, { educationLevel: ' ' }, { course: '<curso>' }, { institution: 'x'.repeat(181) }, { course: 'line\nbreak' },
    { schoolYear: '2026' }, { schoolYear: 2026.5 }, { schoolYear: 1899 }, { schoolYear: 2101 }, { issuedOn: '2026-02-30' }, { presentedOn: null },
    { expiresOn: '2101-01-01' }, { expectedCertificateId: 'stale' }, { evidenceMode: null }, { paperReference: null }, { paperReference: 'abc' },
    { filename: 'unexpected.pdf' }, { sha256: syntheticSchoolHash }, { contentBase64: '' }, { reason: null }, { reason: 'abc' }, { approved: true },
    { familyRef: { kind: 'grh', id: uuid(7) } }, { identityToken: 'wrong' }];
  for (const patch of patches) {
    const { handler, calls } = setup(), response = res(); await handler(req(paper(patch)), response);
    assert.equal(response.statusCode, 422, JSON.stringify(patch)); assert.equal(calls.sql.length, 0); assert.equal(calls.pdf, 0);
  }
  for (const patch of [{ paperReference: 'Unexpected paper' }, { sha256: '0'.repeat(64) }, { filename: '../bad.pdf' }, { contentBase64: null }]) {
    await assert.rejects(prepareSchoolCertificate(pdf(patch), { version: 3 }));
  }
});
test('v3 POST scopes all writes, normalizes metadata and replays the same key without replacing payload', async () => {
  for (const duplicate of [false, true]) {
    const { handler, calls } = setup(receipt(duplicate)), response = res();
    await handler(req(), response);
    assert.equal(response.statusCode, duplicate ? 200 : 201);
    assert.deepEqual(calls.auth[0].requiredCapabilities, ['workforce.employee.read', 'employee.record.propose']);
    assert.match(calls.sql[0].statement, /school_certificate_register_v3/);
    assert.deepEqual(calls.sql[0].values.slice(0, 6), [session.email, session.id, 1, session.releaseSha, uuid(801), uuid(802)]);
    assert.deepEqual(JSON.parse(calls.sql[0].values[6]), paper()); assert.equal(calls.sql[0].values[7], uuid(900));
    assert.equal(calls.pdf, 0); if (duplicate) assert.equal(response.headers['Idempotency-Replayed'], 'true');
  }
});
test('v3 history binds exact identity and its response passes the independent frontend validator', async () => {
  const data = history(), { handler, calls } = setup(data), response = res();
  const query = { resource: 'history', version: '3', contractId: scope.contractId, familyKind: 'grh', familyId: scope.familyRef.id, identityToken: scope.identityToken };
  await handler({ method: 'GET', query, url: '/api/internal-family-certificates?' + new URLSearchParams(query), headers: {} }, response);
  assert.equal(response.statusCode, 200); assert.match(calls.sql[0].statement, /school_certificate_history_v3/);
  assert.deepEqual(calls.sql[0].values.slice(6), [scope.contractId, 'grh', scope.familyRef.id, scope.identityToken]);
  assert.deepEqual(calls.auth[0].requiredCapabilities, ['workforce.employee.read']);
  assert.doesNotThrow(() => schoolingHistoryData(response.body, scope));
});
test('v3 report exposes manual registration at PDF quota zero without salary certification', () => {
  const data = report(); Object.assign(data.storage, { remainingBytes: 0, capacityBytes: 0 });
  data.rows[0].certificate = certificate(); data.rows[0].historyCount = 1;
  assert.equal(validateSchoolCertificateReport(data, null, 3).canRegister, true);
  assert.doesNotThrow(() => schoolingData({ ok: true, data }, { version: 3 }));
  assert.equal(data.scope.payrollEligibilityCertified, false);
});
test('v3 history accepts legacy PDF followed by an immutable paper correction', () => {
  const legacy = report().rows[1].certificate;
  const data = history([certificate({ supersedesId: legacy.id }), legacy]);
  assert.deepEqual(validateSchoolCertificateHistory(data, scope), data);
  assert.doesNotThrow(() => schoolingHistoryData({ ok: true, data }, scope));
});
test('v3 history fails closed on foreign scope, malformed metadata, omitted records or invalid temporal chain', () => {
  const mutations = [d => { d.contractId = uuid(999); }, d => { d.familyRef = { kind: 'grh', id: '999' }; }, d => { d.identityToken = '0'.repeat(64); },
    d => { d.total++; }, d => { d.rows[0].salaryApproved = true; }, d => { d.rows[0].recordedBy = null; }, d => { d.rows[0].schoolYear = '2026'; },
    d => { d.rows[0].byteLength = 1; }, d => { d.rows[0].supersedesId = uuid(999); }, d => { d.rows[0].recordKind = 'approved'; }];
  for (const mutate of mutations) { const data = history(); mutate(data); assert.throws(() => validateSchoolCertificateHistory(data, scope), code('CONTRACT_DRIFT')); }
  const old = certificate({ id: uuid(101), recordedAt: '2026-09-21T12:00:00.123455Z' });
  assert.throws(() => validateSchoolCertificateHistory(history([old, certificate()]), scope), code('CONTRACT_DRIFT'));
  assert.throws(() => validateSchoolCertificateHistory(history([certificate(), certificate()]), scope), code('CONTRACT_DRIFT'));
});
test('attempt recovery requires writer capability, binds own principal/key, and rejects inconsistent receipts', async () => {
  const query = { resource: 'attempt', version: '3', key: uuid(900) };
  const { handler, calls } = setup(receipt(true)), response = res(); await handler({ method: 'GET', query, headers: {} }, response);
  assert.equal(response.statusCode, 200); assert.match(calls.sql[0].statement, /school_certificate_attempt_v3/);
  assert.equal(calls.sql[0].values[6], uuid(900)); assert.deepEqual(calls.auth[0].requiredCapabilities, ['workforce.employee.read', 'employee.record.propose']);
  const denied = setup(receipt(true), ['workforce.employee.read']), denial = res(); await denied.handler({ method: 'GET', query, headers: {} }, denial);
  assert.equal(denial.statusCode, 403); assert.equal(denied.calls.sql.length, 0);
  await assert.rejects(readSchoolCertificateAttempt({ query: async () => [{ result: receipt(false) }] }, principal(), session, uuid(900)), code('CONTRACT_DRIFT'));
});
test('history query and SQL adapter reject malformed scope before database access', async () => {
  const base = { resource: 'history', version: '3', contractId: scope.contractId, familyKind: 'grh', familyId: '7', identityToken: scope.identityToken };
  for (const patch of [{ version: '2' }, { familyKind: 'own' }, { identityToken: null }, { familyId: ['7'] }, { unrelated: 'x' }]) {
    const { handler, calls } = setup(history()), response = res(); await handler({ method: 'GET', query: { ...base, ...patch }, headers: {} }, response);
    assert.equal(response.statusCode, 400); assert.equal(calls.sql.length, 0);
  }
  await assert.rejects(readSchoolCertificateHistory({ query: () => assert.fail('SQL') }, principal(), session, { ...scope, identityToken: 'bad' }), code('QUERY_INVALID'));
});
test('v3 conflicts remain actionable without exposing SQL text or guessing successful registration', async () => {
  for (const suffix of ['REVISION_CONFLICT', 'IDENTITY_REVIEW_REQUIRED', 'IDENTITY_CHANGED', 'IDEMPOTENCY_REUSE', 'SESSION_BUSY']) {
    const error = new Error('SCHOOL_CERTIFICATE_' + suffix), { handler } = setup(error), response = res(); await handler(req(), response);
    assert.equal(response.statusCode, 409); assert.equal(response.body.code, error.message); assert.equal(response.body.ok, false);
  }
});
test('v3 downloads use the v3 facade and preserve binary integrity and private headers', async () => {
  const data = { version: 'family-schooling-download.v3', filename: 'certificado.pdf', contentBase64: syntheticSchoolPdf.toString('base64'),
    sha256: syntheticSchoolHash, byteLength: syntheticSchoolPdf.length };
  const { handler, calls } = setup(data), response = res();
  await handler({ method: 'GET', query: { resource: 'download', version: '3', certificateId: uuid(100) }, headers: {} }, response);
  assert.equal(response.statusCode, 200); assert.match(calls.sql[0].statement, /school_certificate_download_v3/);
  assert.deepEqual(response.bytes, syntheticSchoolPdf); assert.match(response.headers['Cache-Control'], /private, no-store/);
  assert.equal(response.headers['Content-Type'], 'application/pdf');
  const unavailable = setup(new Error('SCHOOL_CERTIFICATE_NOT_FOUND')), missing = res();
  await unavailable.handler({ method: 'GET', query: { resource: 'download', version: '3', certificateId: uuid(100) }, headers: {} }, missing);
  assert.equal(missing.statusCode, 404); assert.equal(missing.bytes, undefined);
});
