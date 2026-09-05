import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PAYROLL_RECEIPT_PREVIEW_VERSION,
  createPayrollReceiptPdfArtifact,
  createPayrollReceiptSummary,
  downloadPayrollReceiptPdf,
} from '../assets/payroll-receipt-preview.js';

const employee = Object.freeze({
  contractId: '11111111-1111-4111-8111-111111111111',
  nombre: 'PÉREZ, MARÍA DEL CARMEN',
  legajo: '1042',
  organizacion: 'Municipalidad de Junín',
  sector: 'Liquidación de sueldos',
  convenio: 'Municipales',
});

const tenant = Object.freeze({
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'junin-mendoza',
});

const payroll = Object.freeze({
  payrollDate: '2026-08-31',
  payrollType: 'M',
  canonicalPayrollType: 'monthly',
  closureStatus: 'closed',
  presentationStatus: 'closed_reconciled',
  itemCount: 42,
  distinctConcepts: 15,
  subjectEarnings: '1000000.10',
  nonSubjectEarnings: '200000.00',
  familyAllowance: '10000.00',
  employeeWithholdings: '210000.10',
  net: '1000000.00',
  netPayable: '1000000.00',
  employerContributions: '250000.50',
  reconciliation: { status: 'matched', difference: '0.00' },
  sourceCutoff: '2026-09-02T12:51:17.000Z',
});

test('genera un resumen individual real, tenant-bound, inmutable y explícitamente no oficial', () => {
  const summary = createPayrollReceiptSummary(employee, payroll, { tenant, generatedAt: '2026-09-04T12:00:00.000Z' });
  assert.equal(summary.contractVersion, PAYROLL_RECEIPT_PREVIEW_VERSION);
  assert.deepEqual(summary.context, { tenantId: tenant.id, tenantSlug: tenant.slug, tenantLabel: 'Junin Mendoza' });
  assert.equal(summary.employee.name, employee.nombre);
  assert.equal(summary.employee.legajo, '1042');
  assert.equal(summary.payroll.grossEarnings, '1210000.10');
  assert.equal(summary.payroll.netPayable, '1000000.00');
  assert.equal(summary.payroll.reconciliationDifference, '0.00');
  assert.equal(summary.authority, 'GRH');
  assert.equal(summary.officialReceipt, false);
  assert.equal(summary.conceptLinesAvailable, false);
  assert.equal(summary.signed, false);
  assert.ok(Object.isFrozen(summary));
  assert.ok(Object.isFrozen(summary.context));
  assert.ok(Object.isFrozen(summary.employee));
  assert.ok(Object.isFrozen(summary.payroll));
});

test('acepta identificadores uuid históricos de PostgreSQL aunque no codifiquen versión RFC', () => {
  const summary = createPayrollReceiptSummary(
    { ...employee, contractId: '00000000-0000-0000-0000-000000000001' },
    payroll,
    {
      tenant: { id: '00000000-0000-0000-0000-000000000002', slug: 'junin-mendoza' },
      generatedAt: '2026-09-04T12:00:00.000Z',
    },
  );
  assert.equal(summary.employee.contractId, '00000000-0000-0000-0000-000000000001');
  assert.equal(summary.context.tenantId, '00000000-0000-0000-0000-000000000002');
});

test('traduce el código GRH a un nombre cotidiano y conserva el origen como trazabilidad', () => {
  const summary = createPayrollReceiptSummary(employee, { ...payroll, canonicalPayrollType: null, payrollType: 'P' }, { tenant });
  assert.equal(summary.payroll.payrollTypeLabel, 'Primera quincena');
  assert.equal(summary.payroll.payrollTypeDetail, 'Tipo informado por GRH · código P');
  assert.equal(summary.payroll.sourcePayrollTypeCode, 'P');
});

test('crea un PDF local íntegro con ámbito, alcance y trazabilidad visibles', () => {
  const summary = createPayrollReceiptSummary(employee, payroll, { tenant, generatedAt: '2026-09-04T12:00:00.000Z' });
  const artifact = createPayrollReceiptPdfArtifact(summary);
  const decoded = new TextDecoder('latin1').decode(artifact.bytes);
  assert.equal(artifact.fileName, 'municontrol_resumen-liquidacion_2026-08-31_mensual-segunda-quincena_grh-m_legajo-1042.pdf');
  assert.equal(artifact.mimeType, 'application/pdf');
  assert.equal(artifact.officialReceipt, false);
  assert.equal(artifact.containsPersonalData, true);
  assert.ok(decoded.startsWith('%PDF-1.4'));
  assert.match(decoded, /RESUMEN INDIVIDUAL DE LIQUIDACION/);
  assert.match(decoded, /No es el recibo oficial/);
  assert.match(decoded, /Junin Mendoza/);
  assert.match(decoded, /PÉREZ, MARÍA DEL CARMEN/);
  assert.match(decoded, /\/Title \(Resumen de liquidación 2026-08-31 - Mensual \/ segunda quincena - GRH M - legajo 1042\)/);
  assert.match(decoded, /%%EOF/);
});

test('separa descargas del mismo legajo y mes por fecha completa y tipo de liquidación', () => {
  const cases = [
    { payrollDate: '2026-08-27', payrollType: 'M', canonicalPayrollType: 'monthly' },
    { payrollDate: '2026-08-14', payrollType: 'O', canonicalPayrollType: 'other' },
    { payrollDate: '2026-08-27', payrollType: 'O', canonicalPayrollType: 'other' },
    { payrollDate: '2026-08-27', payrollType: 'S', canonicalPayrollType: 'sac' },
    { payrollDate: '2026-08-27', payrollType: 'P', canonicalPayrollType: 'first_fortnight' },
    { payrollDate: '2026-08-27', payrollType: 'V', canonicalPayrollType: 'vacation' },
    { payrollDate: '2026-08-27', payrollType: 'F', canonicalPayrollType: 'final' },
  ];
  const names = cases.map((identity) => {
    const summary = createPayrollReceiptSummary(employee, { ...payroll, ...identity }, { tenant });
    assert.equal(summary.payroll.netPayable, payroll.netPayable);
    assert.equal(summary.signed, false);
    const artifact = createPayrollReceiptPdfArtifact(summary);
    assert.ok(artifact.fileName.includes(identity.payrollDate));
    assert.ok(artifact.fileName.includes(`grh-${identity.payrollType.toLowerCase()}`));
    assert.match(artifact.fileName, /^[a-z0-9_-]+\.pdf$/);
    return artifact.fileName;
  });
  assert.equal(new Set(names).size, cases.length);
});

test('conserva códigos históricos distintos aunque compartan etiqueta pendiente', () => {
  const names = ['X', 'Y'].map((code) => createPayrollReceiptPdfArtifact(
    createPayrollReceiptSummary(employee, {
      ...payroll, payrollType: code, canonicalPayrollType: null,
    }, { tenant }),
  ).fileName);
  assert.notEqual(names[0], names[1]);
  assert.match(names[0], /_grh-x_legajo-1042\.pdf$/);
  assert.match(names[1], /_grh-y_legajo-1042\.pdf$/);
});

test('usa el tipo canónico sin código GRH y mantiene el nombre estable al descargar otra vez', () => {
  const source = { ...payroll, payrollType: 'monthly', canonicalPayrollType: 'monthly' };
  const names = ['2026-09-04T12:00:00Z', '2026-09-05T16:00:00Z'].map((generatedAt) => (
    createPayrollReceiptPdfArtifact(createPayrollReceiptSummary(employee, source, { tenant, generatedAt })).fileName
  ));
  assert.equal(names[0], names[1]);
  assert.match(names[0], /2026-08-31_mensual_tipo-monthly_legajo-1042\.pdf$/);
});

test('bloquea períodos abiertos, diferencias y artefactos inventados', () => {
  assert.throws(
    () => createPayrollReceiptSummary(employee, { ...payroll, closureStatus: 'open', presentationStatus: 'open' }),
    { code: 'RECEIPT_PERIOD_NOT_READY' },
  );
  assert.throws(
    () => createPayrollReceiptSummary(employee, {
      ...payroll,
      netPayable: '999999.98',
      reconciliation: { status: 'matched', difference: '0.00' },
    }),
    { code: 'RECEIPT_RECONCILIATION_INVALID' },
  );
  assert.throws(
    () => createPayrollReceiptPdfArtifact(Object.freeze({ officialReceipt: false })),
    { code: 'RECEIPT_SUMMARY_INVALID' },
  );
  assert.throws(
    () => downloadPayrollReceiptPdf(Object.freeze({ bytes: new Uint8Array([1, 2, 3]) })),
    { code: 'RECEIPT_ARTIFACT_INVALID' },
  );
  assert.throws(
    () => createPayrollReceiptSummary(employee, payroll, { tenant: { id: tenant.id, slug: 'ámbito inválido' } }),
    { code: 'RECEIPT_TENANT_INVALID' },
  );
});

test('no convierte en recibo conciliado diferencias como las de los ejemplos mensuales', () => {
  for (const [netPayable, difference] of [['999999.90', '0.10'], ['999999.75', '0.25']]) {
    assert.throws(() => createPayrollReceiptSummary(employee, {
      ...payroll,
      netPayable,
      reconciliation: { status: 'matched', difference },
    }, { tenant }), { code: 'RECEIPT_RECONCILIATION_INVALID' });
  }
});

test('descarga únicamente el artefacto validado y revoca la URL temporal', () => {
  const artifact = createPayrollReceiptPdfArtifact(createPayrollReceiptSummary(employee, payroll, { tenant }));
  let clicked = 0;
  let removed = 0;
  let appended = 0;
  let revoked = '';
  const anchor = {
    href: '', download: '', hidden: false,
    click() { clicked += 1; },
    remove() { removed += 1; },
  };
  const fileName = downloadPayrollReceiptPdf(artifact, {
    documentImpl: { createElement: () => anchor, body: { appendChild() { appended += 1; } } },
    urlApi: { createObjectURL: () => 'blob:receipt', revokeObjectURL(value) { revoked = value; } },
    BlobImpl: Blob,
  });
  assert.equal(fileName, artifact.fileName);
  assert.equal(anchor.href, 'blob:receipt');
  assert.equal(anchor.download, artifact.fileName);
  assert.equal(clicked, 1);
  assert.equal(removed, 1);
  assert.equal(appended, 1);
  assert.equal(revoked, 'blob:receipt');
});
