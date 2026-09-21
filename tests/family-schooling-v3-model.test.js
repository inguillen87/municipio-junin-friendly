import test from 'node:test';
import assert from 'node:assert/strict';
import { certificateFields, certificateEvidenceLabel, certificateState, schoolingCertificate, schoolingData,
  schoolingFilter, schoolingHistoryData, schoolingRegistrationResult, schoolingRevision } from '../assets/family-schooling-model.js';
import { schoolingFixture, schoolingFixtureV2, schoolingFixtureV3, syntheticUuid } from './fixtures/family-schooling-synthetic.js';

const context = () => {
  const row = schoolingFixtureV3(1).data.rows[0];
  return { contractId: row.contractId, familyRef: row.familyRef, identityToken: row.identityToken };
};
const paper = (overrides = {}) => ({
  id: syntheticUuid(20001), filename: null, sha256: null, byteLength: null,
  presentedOn: '2026-09-21', expiresOn: null, recordedAt: '2026-09-21T12:00:00.123456Z', recordKind: 'schooling_record',
  institution: null, educationLevel: null, course: null, schoolYear: null, issuedOn: null,
  evidenceMode: 'paper_declared', paperReference: 'Mesa de entradas, expediente QA 123', reason: 'Presentación declarada en papel',
  supersedesId: null, recordedBy: 'operador@example.invalid', ...overrides,
});
const form = (overrides = {}) => ({ presentedOn: '2026-09-21', evidenceMode: 'paper_declared',
  paperReference: 'Recepción QA 123', reason: 'Registro de presentación', ...overrides });
const history = (rows, overrides = {}) => ({ ok: true, data: {
  version: 'family-schooling-history.v3', ...context(), rows, total: rows.length, ...overrides,
} });
const withPaper = () => {
  const p = schoolingFixtureV3(3);
  p.data.rows[0].certificate = paper(); p.data.rows[0].historyCount = 1;
  return p;
};

test('v3 is explicit and preserves v1/v2 PDF metadata without inventing school details', () => {
  const first = schoolingFixture(3), second = schoolingFixtureV2(3), third = schoolingFixtureV3(3);
  assert.equal(schoolingData(first).version, 'family-schooling.v1');
  assert.equal(schoolingData(second, { version: 2 }).version, 'family-schooling.v2');
  assert.throws(() => schoolingData(third));
  const certificate = schoolingData(third, { version: 3 }).rows[1].certificate;
  assert.equal(certificate.recordKind, 'legacy_pdf'); assert.equal(certificate.evidenceMode, 'pdf');
  for (const key of Object.keys(first.data.rows[1].certificate)) assert.equal(certificate[key], first.data.rows[1].certificate[key]);
  for (const key of ['institution', 'educationLevel', 'course', 'schoolYear', 'issuedOn', 'paperReference', 'reason', 'supersedesId', 'recordedBy']) assert.equal(certificate[key], null);
  assert.match(certificateEvidenceLabel(certificate), /datos escolares anteriores no informados/);
});

test('manual form retains unknown metadata as null and never derives year, issue date, expiry or course', () => {
  const result = certificateFields(form({ institution: ' ', educationLevel: '', course: null, schoolYear: '', issuedOn: '', expiresOn: '' }));
  assert.deepEqual(result, { institution: null, educationLevel: null, course: null, schoolYear: null, issuedOn: null,
    presentedOn: '2026-09-21', expiresOn: null, evidenceMode: 'paper_declared', paperReference: 'Recepción QA 123', reason: 'Registro de presentación' });
  assert.ok(Object.isFrozen(result));
});

test('manual form normalizes documented metadata and preserves explicit dates without imposing eligibility rules', () => {
  const result = certificateFields(form({ institution: '  Escuela Mari\u0301a  ', educationLevel: ' Primario ', course: ' 6.º B ',
    schoolYear: ' 2025 ', issuedOn: '2026-09-20', presentedOn: '2026-09-21', expiresOn: '2025-12-31' }));
  assert.equal(result.institution, 'Escuela María'); assert.equal(result.course, '6.º B'); assert.equal(result.schoolYear, 2025);
  assert.equal(result.issuedOn, '2026-09-20'); assert.equal(result.expiresOn, '2025-12-31');
  assert.equal(certificateFields(form({ issuedOn: '2024-02-29', schoolYear: 1900 })).issuedOn, '2024-02-29');
  assert.equal(certificateFields(form({ schoolYear: 2100 })).schoolYear, 2100);
});

test('paper declaration requires a usable reception reference; PDF cannot silently carry a paper declaration', () => {
  const fields = certificateFields(form({ evidenceMode: 'pdf', paperReference: '', expiresOn: null }));
  assert.equal(fields.paperReference, null);
  for (const values of [{ paperReference: '' }, { paperReference: '1234' }, { evidenceMode: 'pdf' },
    { evidenceMode: 'approved' }, { reason: '' }, { reason: '1234' }]) assert.throws(() => certificateFields(form(values)));
});

test('manual form rejects malformed civil dates, numeric coercion, line breaks and unrecognized fields', () => {
  for (const values of [{ presentedOn: '' }, { presentedOn: '2026-02-30' }, { issuedOn: '2025-02-29' },
    { presentedOn: '2026-09-21T00:00:00Z' }, { expiresOn: '2101-01-01' }, { issuedOn: '1899-12-31' },
    { schoolYear: true }, { schoolYear: '2.026e3' }, { schoolYear: '02026' }, { schoolYear: 2026.5 },
    { schoolYear: 1899 }, { schoolYear: 2101 }, { course: '6\nB' }, { reason: 'Registro\tmanual' },
    { institution: '<Escuela>' }, { approved: true }]) assert.throws(() => certificateFields(form(values)), JSON.stringify(values));
  for (const [field, limit] of [['institution', 180], ['educationLevel', 80], ['course', 100], ['reason', 500], ['paperReference', 500]]) {
    assert.equal(certificateFields(form({ [field]: 'a'.repeat(limit) }))[field].length, limit);
    assert.throws(() => certificateFields(form({ [field]: 'a'.repeat(limit + 1) })));
  }
  // Match the API's UTF-16 bounds; a supplementary character occupies two units.
  assert.throws(() => certificateFields(form({ course: '🎓'.repeat(51) })));
});

test('paper and attached PDF remain distinct evidence with no approval or payroll certification', () => {
  const data = schoolingData(withPaper(), { version: 3 }), certificate = data.rows[0].certificate;
  assert.equal(certificate.filename, null); assert.equal(certificate.byteLength, null); assert.equal(certificate.sha256, null);
  assert.match(certificateEvidenceLabel(certificate), /papel declarada.*sin PDF/);
  assert.equal(certificateEvidenceLabel(null), 'Sin registro en MuniControl');
  assert.equal(certificateState(data.rows[0]), 'Sin vencimiento informado');
  assert.equal(certificateState({ certificate: { ...certificate, expiresOn: '2026-09-20' } }, '2026-09-21'), 'Vencimiento informado superado');
  assert.equal(data.scope.payrollEligibilityCertified, false); assert.equal(data.scope.currentCensusCertified, false);
  assert.deepEqual(schoolingFilter(data).counts, { contracts: 2, children: 3, registered: 3, unregistered: 0, review: 0, records: 3 });
  assert.equal(schoolingFilter(data, { status: 'no_expiry' }).rows.length, 2);
  const pdf = schoolingCertificate({ ...paper(), evidenceMode: 'pdf', paperReference: null,
    ...schoolingFixture(2).data.rows[1].certificate });
  assert.equal(pdf.recordKind, 'schooling_record'); assert.equal(certificateEvidenceLabel(pdf), 'PDF adjunto');
});

test('full storage does not hide existing records or revoke manual registration permission in v3', () => {
  const payload = withPaper(); payload.data.storage = { mode: 'database_pilot', capacityBytes: 0, usedBytes: 1000, remainingBytes: 0 };
  const data = schoolingData(payload, { version: 3 });
  assert.equal(data.canRegister, true); assert.equal(data.rows.length, 3); assert.equal(data.rows[0].certificate.evidenceMode, 'paper_declared');
  payload.data.canRegister = false; assert.equal(schoolingData(payload, { version: 3 }).canRegister, false);
  for (const [version, fixture] of [[1, schoolingFixture], [2, schoolingFixtureV2]]) {
    const legacy = fixture(2); legacy.data.storage.remainingBytes = 0;
    assert.throws(() => schoolingData(legacy, { version }));
  }
});

test('v3 rejects hybrid evidence, invented legacy metadata, noncanonical fields and invalid record authors', () => {
  for (const change of [c => c.filename = 'phantom.pdf', c => c.sha256 = 'a'.repeat(64), c => c.byteLength = 7,
    c => c.paperReference = null, c => c.reason = null, c => c.recordedBy = null, c => c.recordedBy = 'operator',
    c => c.recordKind = 'approved', c => c.supersedesId = c.id, c => c.schoolYear = '2026',
    c => c.institution = '', c => c.institution = 'Mari\u0301a', c => c.issuedOn = '2026-02-30',
    c => c.presentedOn = '2026-09-21T00:00:00Z', c => delete c.course, c => c.approved = true]) {
    const certificate = paper(); change(certificate); assert.throws(() => schoolingCertificate(certificate));
  }
  const legacy = schoolingFixtureV3(2).data.rows[1].certificate;
  assert.throws(() => schoolingCertificate({ ...legacy, institution: 'Institución inferida' }));
  assert.throws(() => schoolingCertificate({ ...legacy, filename: '../certificado.pdf' }));
  assert.throws(() => schoolingCertificate({ ...legacy, paperReference: 'Recepción QA 123' }));
});

test('v3 report validates exact fields, unified family identities and unresolved counts', () => {
  const p = withPaper(); p.data.rows[0].familyRef = { kind: 'own', id: syntheticUuid(40000) };
  Object.assign(p.data.rows[0], { declarationState: 'declared', familyRecordedAt: '2026-09-20T12:00:00Z', validFrom: null, identityReviewRequired: true });
  p.data.scope.unresolvedFamilyRows = 1;
  const data = schoolingData(p, { version: 3 });
  assert.equal(schoolingFilter(data).counts.children, 2); assert.equal(schoolingFilter(data).counts.review, 1);
  for (const mutate of [value => value.data.rows[0].approved = true, value => value.data.scope.payrollEligibilityCertified = true,
    value => value.data.total = 3, value => value.data.rows[0].familyId = '1', value => value.data.scope.unresolvedFamilyRows = 0]) {
    const copy = structuredClone(p); mutate(copy); assert.throws(() => schoolingData(copy, { version: 3 }));
  }
});

test('v3 revision changes for each documentary fact while permission and capacity remain independent', () => {
  const p = withPaper(), before = schoolingRevision(schoolingData(p, { version: 3 }));
  for (const [key, value] of Object.entries({ institution: 'Escuela QA', educationLevel: 'Primario', course: '6 B', schoolYear: 2026,
    issuedOn: '2026-09-19', presentedOn: '2026-09-20', expiresOn: '2026-12-01', paperReference: 'Otra recepción QA',
    reason: 'Rectificación documental', supersedesId: syntheticUuid(20000), recordedBy: 'segundo@example.invalid', recordedAt: '2026-09-21T12:00:00.123457Z' })) {
    const copy = structuredClone(p); copy.data.rows[0].certificate[key] = value;
    assert.notEqual(schoolingRevision(schoolingData(copy, { version: 3 })), before, key);
  }
  p.data.canRegister = false; p.data.storage.remainingBytes = 0;
  assert.equal(schoolingRevision(schoolingData(p, { version: 3 })), before);
});

test('history is immutable, context bound, and retains original rows across corrections and intervening v2 writes', () => {
  const legacy = schoolingFixtureV3(2).data.rows[1].certificate;
  const initial = paper({ id: syntheticUuid(20000), recordedAt: '2026-09-19T12:00:00Z', supersedesId: legacy.id });
  const intervening = { ...legacy, id: syntheticUuid(20002), recordedAt: '2026-09-20T12:00:00Z' };
  const correction = paper({ supersedesId: initial.id, institution: 'Escuela QA corregida', reason: 'Corrección de institución' });
  const payload = history([correction, intervening, initial, legacy]), result = schoolingHistoryData(payload, context());
  assert.equal(result.total, 4); assert.equal(result.rows[0].supersedesId, initial.id);
  assert.equal(result.rows[2].institution, null); assert.equal(result.rows[3].recordKind, 'legacy_pdf');
  payload.data.rows[0].institution = 'Mutación posterior'; payload.data.familyRef.id = '999';
  assert.equal(result.rows[0].institution, 'Escuela QA corregida'); assert.equal(result.familyRef.id, '1');
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.familyRef)); assert.ok(Object.isFrozen(result.rows)); assert.ok(result.rows.every(Object.isFrozen));
  assert.throws(() => result.rows.reverse()); assert.throws(() => result.rows[0].reason = 'Cambio silencioso');
});

test('history rejects cross-family, cross-contract and stale identity responses or incomplete envelopes', () => {
  for (const overrides of [{ contractId: syntheticUuid(2) }, { familyRef: { kind: 'grh', id: '2' } },
    { familyRef: { kind: 'own', id: syntheticUuid(40000) } }, { identityToken: 'f'.repeat(64) }, { total: 2 }, { total: '1' },
    { version: 'family-schooling-history.v2' }, { truncated: true }]) assert.throws(() => schoolingHistoryData(history([paper()], overrides), context()));
  const p = history([paper()]); p.ok = false; assert.throws(() => schoolingHistoryData(p, context()));
  delete p.data.identityToken; p.ok = true; assert.throws(() => schoolingHistoryData(p, context()));
  assert.equal(schoolingHistoryData(history([]), context()).total, 0);
});

test('history ordering preserves microseconds, timezone equivalence and deterministic UUID ties', () => {
  const high = paper({ id: syntheticUuid(20002) }), low = paper({ id: syntheticUuid(20001), recordedAt: '2026-09-21T09:00:00.123455-03:00' });
  assert.equal(schoolingHistoryData(history([high, low]), context()).total, 2);
  assert.throws(() => schoolingHistoryData(history([low, high]), context()));
  low.recordedAt = '2026-09-21T09:00:00.123456-03:00';
  assert.equal(schoolingHistoryData(history([high, low]), context()).total, 2);
  assert.throws(() => schoolingHistoryData(history([low, high]), context()));
});

test('history rejects duplicate IDs, absent or newer superseded rows and overflow rather than truncating', () => {
  const older = paper({ id: syntheticUuid(20000), recordedAt: '2026-09-20T12:00:00Z' });
  for (const rows of [[paper(), paper()], [paper({ supersedesId: syntheticUuid(99999) })],
    [paper(), { ...older, supersedesId: paper().id }]]) assert.throws(() => schoolingHistoryData(history(rows), context()));
  const rows = Array.from({ length: 5000 }, (_, i) => paper({ id: syntheticUuid(30000 - i) }));
  assert.equal(schoolingHistoryData(history(rows), context()).total, 5000);
  rows.push(paper({ id: syntheticUuid(1) })); assert.throws(() => schoolingHistoryData(history(rows), context()));
});

test('successful and recovered registration responses confirm one record, not approval', () => {
  for (const duplicate of [false, true]) {
    const payload = { ok: true, data: { version: 'family-schooling-register.v3', certificateId: syntheticUuid(20001), duplicate } };
    const result = schoolingRegistrationResult(payload);
    assert.equal(result.certificateId, syntheticUuid(20001)); assert.equal(result.duplicate, duplicate); assert.ok(Object.isFrozen(result));
    for (const change of [d => d.duplicate = 'true', d => d.certificateId = 'outside', d => d.version = 'family-schooling-register.v2', d => d.approved = true]) {
      const copy = structuredClone(payload); change(copy.data); assert.throws(() => schoolingRegistrationResult(copy));
    }
  }
});
