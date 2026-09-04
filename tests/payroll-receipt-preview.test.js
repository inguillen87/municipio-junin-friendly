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

test('crea un PDF local íntegro con ámbito, alcance y trazabilidad visibles', () => {
  const summary = createPayrollReceiptSummary(employee, payroll, { tenant, generatedAt: '2026-09-04T12:00:00.000Z' });
  const artifact = createPayrollReceiptPdfArtifact(summary);
  const decoded = new TextDecoder('latin1').decode(artifact.bytes);
  assert.equal(artifact.fileName, 'municontrol_resumen-liquidacion_2026-08_legajo-1042.pdf');
  assert.equal(artifact.mimeType, 'application/pdf');
  assert.equal(artifact.officialReceipt, false);
  assert.equal(artifact.containsPersonalData, true);
  assert.ok(decoded.startsWith('%PDF-1.4'));
  assert.match(decoded, /RESUMEN INDIVIDUAL DE LIQUIDACION/);
  assert.match(decoded, /No es el recibo oficial/);
  assert.match(decoded, /Junin Mendoza/);
  assert.match(decoded, /PÉREZ, MARÍA DEL CARMEN/);
  assert.match(decoded, /%%EOF/);
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
