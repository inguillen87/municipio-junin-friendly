// Synthetic persons and document only. Never sourced from municipal records.
import { createHash } from 'node:crypto';
export const syntheticUuid = n => '70000000-0000-4000-8000-' + String(n).padStart(12, '0');
function pdf() {
  const stream = 'BT /F1 18 Tf 50 750 Td (QA SYNTHETIC SCHOOL CERTIFICATE) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream'];
  let out = '%PDF-1.4\n', offsets = [0];
  objects.forEach((o, i) => { offsets.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const at = out.length; out += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.from(out + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + at + '\n%%EOF\n');
}
export const syntheticSchoolPdf = pdf();
export const syntheticSchoolHash = createHash('sha256').update(syntheticSchoolPdf).digest('hex');
export function schoolingFixture(count = 75, { canRegister = true, contractId = null } = {}) {
  const rows = Array.from({ length: count }, (_, i) => ({ contractId: syntheticUuid(Math.floor(i / 2) + 1),
    legajo: String(Math.floor(i / 2) + 1).padStart(6, '0'), employeeName: 'Agente Sintético ' + String(Math.floor(i / 2) + 1).padStart(4, '0'),
    familyId: String(i + 1), familyName: 'Hijo Sintético ' + String(i + 1).padStart(4, '0'),
    birthDate: '2015-04-03', familyEndDate: i === 5 ? '2025-12-31' : null, identityToken: createHash('sha256').update('family-synthetic-' + i).digest('hex'),
    sourceCutoff: '2026-08-06T18:15:21Z', administrativeActive: true,
    certificate: i % 3 === 0 ? null : { id: syntheticUuid(10000 + i), filename: 'certificado-sintetico.pdf', sha256: syntheticSchoolHash,
      byteLength: syntheticSchoolPdf.length, presentedOn: '2026-04-04', expiresOn: i % 3 === 1 ? null : '2025-12-31', recordedAt: '2026-09-14T10:20:30.123456+00:00' },
    historyCount: i % 3 === 0 ? 0 : 1,
  }));
  return { ok: true, data: { version: 'family-schooling.v1', canRegister,
    storage: { mode: 'database_pilot', capacityBytes: 8388608, usedBytes: syntheticSchoolPdf.length, remainingBytes: 8388608 - syntheticSchoolPdf.length },
    rows: contractId ? rows.filter(r => r.contractId === contractId) : rows,
    scope: { cohort: contractId ? 'contract_children' : 'administrative_active_with_children', sourceCutoffFrom: '2026-08-06T18:15:21Z', sourceCutoffTo: '2026-08-06T18:15:21Z', currentCensusCertified: false, payrollEligibilityCertified: false } } };
}

export function schoolingFixtureV2(count = 75, options = {}) {
  const payload = schoolingFixture(count, options);
  payload.data.version = 'family-schooling.v2';
  payload.data.scope.unresolvedFamilyRows = 0;
  for (const row of payload.data.rows) {
    row.familyRef = { kind: 'grh', id: row.familyId }; delete row.familyId;
    Object.assign(row, { validFrom: null, familyRecordedAt: null, declarationState: 'source', identityReviewRequired: false });
  }
  return payload;
}

export function schoolingFixtureV3(count = 75, options = {}) {
  const payload = schoolingFixtureV2(count, options);
  payload.data.version = 'family-schooling.v3';
  for (const row of payload.data.rows) if (row.certificate) Object.assign(row.certificate, {
    recordKind: 'legacy_pdf', institution: null, educationLevel: null, course: null, schoolYear: null,
    issuedOn: null, evidenceMode: 'pdf', paperReference: null, reason: null, supersedesId: null, recordedBy: null,
  });
  return payload;
}

export function schoolingFixtureV4(count = 75, options = {}) {
  const payload = schoolingFixtureV3(count, options); payload.data.version = 'family-schooling.v4';
  payload.data.rows.forEach((row, i) => {
    row.sourceSchooling = i < 2 ? { presentedOn: '2026-03-11', expiresOn: i === 0 ? '2027-03-31' : '2025-12-31', presentationState: 'valid', expiryState: 'valid',
      sourceSystem: 'GRH', sourceTable: 'familia', sourceKey: row.familyRef.id, sourceSha256: 'a'.repeat(64), sourceImportRunId: 3,
      sourceBatchId: syntheticUuid(90000), sourceCutoff: row.sourceCutoff, sourceDeclaredCutoff: '2026-08-06T15:15:21',
      loadedAt: '2026-09-21T12:30:00Z', reviewState: 'historical_unreviewed', documentAvailable: false } : null;
    const source = row.certificate ?? row.sourceSchooling;
    row.effectiveDates = { origin: row.certificate ? 'manual' : row.sourceSchooling ? 'grh_source' : 'none', presentedOn: source?.presentedOn ?? null, expiresOn: source?.expiresOn ?? null };
  });
  return payload;
}
