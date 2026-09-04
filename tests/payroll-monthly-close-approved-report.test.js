import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_MONTHLY_CLOSE_APPROVED_PROOF_VERSION,
  PayrollMonthlyCloseApprovedProofError,
  createPayrollMonthlyCloseApprovedPdf,
  downloadPayrollMonthlyCloseApprovedProof,
  isPayrollMonthlyCloseApprovedProofReady,
} from '../assets/payroll-monthly-close-approved-report.js';

const RUN_ID = '10000000-0000-4000-8000-000000000001';
const REFERENCE = 'ref:20000000-0000-4000-8000-000000000002';

function approvedRun() {
  return {
    id: RUN_ID,
    contractVersion: 'payroll-monthly-close-run.v1',
    period: '2026-08',
    jurisdiction: '42',
    status: 'approved',
    version: 3,
    sourceSetSha256: 'a'.repeat(64),
    sourceCount: 3,
    mismatchCount: 0,
    blockingIssueCount: 0,
    reasonCode: 'approved_by_checker',
    reasonReference: REFERENCE,
    closeApproved: true,
    totals: {
      reportedEarningsLessRetentionsCents: '3050',
      reportedBankNetCents: '3050',
      differenceCents: '0',
    },
    sources: [
      ['grh-concept-statistics.v1', 'grh_observed', '1', '4'],
      ['bank-accreditation-summary.v1', 'bank_control', '2', '5'],
      ['government-payroll-summary.v1', 'government_control', '3', '6'],
    ].map(([definitionKey, sourceKind, contentDigit, manifestDigit], index) => ({
      definitionKey,
      sourceKind,
      contentHmacSha256: contentDigit.repeat(64),
      manifestSha256: manifestDigit.repeat(64),
      byteLength: 100 + index,
      recordCount: index + 1,
    })),
    reconciliation: {
      basis: 'three_source_exact_aggregate_reconciliation',
      formula: 'haberes_rem + haberes_no_rem + asignaciones_familiares - retenciones',
      toleranceCents: '0',
      status: 'matched',
      matched: true,
      comparisons: [
        {
          repartitionCode: '1',
          reportedEarningsLessRetentionsCents: '1000',
          reportedBankNetCents: '1000',
          differenceCents: '0',
          matches: true,
          issueCodes: [],
        },
        {
          repartitionCode: '2',
          reportedEarningsLessRetentionsCents: '2050',
          reportedBankNetCents: '2050',
          differenceCents: '0',
          matches: true,
          issueCodes: [],
        },
      ],
      governmentComparisons: [
        {
          comparisonKey: 'earnings',
          reportedGrhCents: '3100',
          reportedGovernmentCents: '3100',
          differenceCents: '0',
          matches: true,
          issueCode: null,
        },
        {
          comparisonKey: 'employer_contributions',
          reportedGrhCents: '750',
          reportedGovernmentCents: '750',
          differenceCents: '0',
          matches: true,
          issueCode: null,
        },
      ],
      totals: {
        reportedEarningsLessRetentionsCents: '3050',
        reportedBankNetCents: '3050',
        differenceCents: '0',
      },
      blockingIssues: [],
      rulesInferred: false,
      governmentSummaryCompared: true,
      payrollNetCertified: false,
    },
    blockingIssues: [],
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:02:00.000Z',
    submittedAt: '2026-09-04T10:01:00.000Z',
    decidedAt: '2026-09-04T10:02:00.000Z',
    timeline: [
      {
        id: 1,
        command: 'prepare',
        fromStatus: null,
        toStatus: 'prepared',
        expectedVersion: 0,
        resultingVersion: 1,
        reasonCode: 'sources_prepared',
        reasonReference: null,
        actorRoleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
        eventSha256: '7'.repeat(64),
        occurredAt: '2026-09-04T10:00:00.000Z',
      },
      {
        id: 2,
        command: 'submit',
        fromStatus: 'prepared',
        toStatus: 'submitted',
        expectedVersion: 1,
        resultingVersion: 2,
        reasonCode: 'ready_for_review',
        reasonReference: REFERENCE,
        actorRoleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
        eventSha256: '8'.repeat(64),
        occurredAt: '2026-09-04T10:01:00.000Z',
      },
      {
        id: 3,
        command: 'approve',
        fromStatus: 'submitted',
        toStatus: 'approved',
        expectedVersion: 2,
        resultingVersion: 3,
        reasonCode: 'approved_by_checker',
        reasonReference: REFERENCE,
        actorRoleKey: 'HUGO_APROBADOR_INTEGRAL',
        eventSha256: '9'.repeat(64),
        occurredAt: '2026-09-04T10:02:00.000Z',
      },
    ],
    allowedCommands: [],
  };
}

function decodedPdf(artifact) {
  return Buffer.from(artifact.bytes).toString('latin1');
}

function expectBlocked(run, code) {
  assert.equal(isPayrollMonthlyCloseApprovedProofReady(run), false);
  assert.throws(
    () => createPayrollMonthlyCloseApprovedPdf(run),
    (error) => error instanceof PayrollMonthlyCloseApprovedProofError
      && error.code === code,
  );
}

test('genera un PDF determinista desde aprobación, conciliación y hora del servidor', () => {
  const first = createPayrollMonthlyCloseApprovedPdf(approvedRun());
  const second = createPayrollMonthlyCloseApprovedPdf(structuredClone(approvedRun()));
  const pdf = decodedPdf(first);

  assert.equal(first.contractVersion, PAYROLL_MONTHLY_CLOSE_APPROVED_PROOF_VERSION);
  assert.equal(first.sourceContractVersion, 'payroll-monthly-close-run.v1');
  assert.equal(first.containsPersonalRecords, false);
  assert.equal(first.fileName, 'municontrol_cierre-aprobado_2026-08_j42_10000000.pdf');
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(isPayrollMonthlyCloseApprovedProofReady(approvedRun()), true);
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /APROBADA Y CONCILIADA AL CENTAVO/);
  assert.match(pdf, /2026-08 \/ J42/);
  assert.match(pdf, new RegExp(RUN_ID));
  assert.match(pdf, /\$ 30,50/);
  assert.match(pdf, /HUGO_APROBADOR_INTEGRAL/);
  assert.match(pdf, /2026-09-04 10:02:00 UTC/);
  assert.match(pdf, new RegExp('9'.repeat(32)));
  assert.match(pdf, /No es F\.931\/LSD ni constancia fiscal/);
  assert.match(pdf, /No transmite datos ni modifica GRH o PostgreSQL/);
  assert.match(pdf, /%%EOF\n$/);
});

test('el comprobante sólo incluye campos agregados y rechaza deriva con PII', () => {
  const run = approvedRun();
  run.employeeId = 'employee-123';
  expectBlocked(run, 'APPROVED_PROOF_PII_DETECTED');

  const pdf = decodedPdf(createPayrollMonthlyCloseApprovedPdf(approvedRun()));
  assert.doesNotMatch(pdf, /employee|legajo|cuil|cbu|correo|@/i);
});

test('falla cerrado para estados no aprobados, diferencias y bloqueos', () => {
  const submitted = approvedRun();
  submitted.status = 'submitted';
  submitted.closeApproved = false;
  expectBlocked(submitted, 'APPROVED_PROOF_NOT_AUTHORIZED');

  const oneCent = approvedRun();
  oneCent.totals.reportedBankNetCents = '3049';
  oneCent.totals.differenceCents = '1';
  expectBlocked(oneCent, 'APPROVED_PROOF_TOTALS_INVALID');

  const blocked = approvedRun();
  blocked.blockingIssueCount = 1;
  blocked.blockingIssues.push({ code: 'MONTHLY_CLOSE_METRIC_NOT_INFORMED' });
  expectBlocked(blocked, 'APPROVED_PROOF_NOT_AUTHORIZED');

  const rejected = approvedRun();
  rejected.status = 'rejected';
  rejected.closeApproved = false;
  expectBlocked(rejected, 'APPROVED_PROOF_NOT_AUTHORIZED');
});

test('falla cerrado ante deriva de conciliación, Gobierno, fuentes o aprobación', () => {
  const reconciliation = approvedRun();
  reconciliation.reconciliation.status = 'blocked';
  reconciliation.reconciliation.matched = false;
  expectBlocked(reconciliation, 'APPROVED_PROOF_RECONCILIATION_INVALID');

  const government = approvedRun();
  government.reconciliation.governmentComparisons[0].reportedGovernmentCents = '3099';
  government.reconciliation.governmentComparisons[0].differenceCents = '1';
  government.reconciliation.governmentComparisons[0].matches = false;
  expectBlocked(government, 'APPROVED_PROOF_GOVERNMENT_INVALID');

  const source = approvedRun();
  source.sources[1].manifestSha256 = 'invalid';
  expectBlocked(source, 'APPROVED_PROOF_SOURCES_INVALID');

  const approval = approvedRun();
  approval.timeline.at(-1).expectedVersion = 1;
  expectBlocked(approval, 'APPROVED_PROOF_APPROVAL_INVALID');

  const timestamp = approvedRun();
  timestamp.decidedAt = '2026-09-04T10:03:00.000Z';
  expectBlocked(timestamp, 'APPROVED_PROOF_APPROVAL_INVALID');
});

test('descarga con nombre controlado, revoca la URL y detecta alteración de bytes', () => {
  const artifact = createPayrollMonthlyCloseApprovedPdf(approvedRun());
  let clicked = 0;
  let removed = 0;
  let appended = 0;
  let revoked = '';
  const anchor = {
    click() { clicked += 1; },
    remove() { removed += 1; },
  };
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
    }
  }
  const fileName = downloadPayrollMonthlyCloseApprovedProof(artifact, {
    documentImpl: {
      createElement: (tag) => {
        assert.equal(tag, 'a');
        return anchor;
      },
      body: { appendChild: (node) => { assert.equal(node, anchor); appended += 1; } },
    },
    urlApi: {
      createObjectURL: (blob) => {
        assert.equal(blob.type, 'application/pdf');
        return 'blob:approved-proof';
      },
      revokeObjectURL: (href) => { revoked = href; },
    },
    BlobImpl: FakeBlob,
  });
  assert.equal(fileName, artifact.fileName);
  assert.equal(anchor.download, artifact.fileName);
  assert.equal(anchor.href, 'blob:approved-proof');
  assert.equal(clicked, 1);
  assert.equal(removed, 1);
  assert.equal(appended, 1);
  assert.equal(revoked, 'blob:approved-proof');

  artifact.bytes[0] = 0;
  assert.throws(
    () => downloadPayrollMonthlyCloseApprovedProof(artifact),
    (error) => error.code === 'APPROVED_PROOF_ARTIFACT_INVALID',
  );
});

test('el módulo no consulta red, storage ni reloj actual para construir evidencia', () => {
  const source = fs.readFileSync(new URL(
    '../assets/payroll-monthly-close-approved-report.js', import.meta.url,
  ), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|localStorage|sessionStorage|indexedDB|console\./);
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)\s*\.toISOString/);
  assert.doesNotMatch(source, /innerHTML|document\.write/);
  assert.match(source, /run\.status !== 'approved'/);
  assert.match(source, /run\.blockingIssueCount !== 0/);
  assert.match(source, /reconciliation\.toleranceCents !== '0'/);
  assert.match(source, /event\.command !== 'approve'/);
});
