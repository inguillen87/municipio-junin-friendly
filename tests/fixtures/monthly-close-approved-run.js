// Synthetic, aggregate-only evidence. This fixture does not certify a real payroll run.
export const MONTHLY_CLOSE_RUN_ID = '10000000-0000-4000-8000-000000000001';
const REFERENCE = 'ref:20000000-0000-4000-8000-000000000002';

export function approvedMonthlyCloseRun(overrides = {}) {
  return {
    id: MONTHLY_CLOSE_RUN_ID,
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
        actorRoleKey: 'TENANT_RRHH_APPROVER',
        eventSha256: '9'.repeat(64),
        occurredAt: '2026-09-04T10:02:00.000Z',
      },
    ],
    allowedCommands: [],
    ...overrides,
  };
}

export function flags(closeApproved = false) {
  return {
    includesPersonalRecords: false,
    rawContentStored: false,
    grhMutation: false,
    payrollCalculated: false,
    payrollPosted: false,
    bankArtifactGenerated: false,
    governmentArtifactGenerated: false,
    fiscalArtifactGenerated: false,
    closeApproved,
  };
}

export function bootstrap({
  run = approvedMonthlyCloseRun(),
  capabilities = [
    'payroll.monthly_close.read',
    'payroll.monthly_close.approve',
    'payroll.monthly_close.audit.read',
  ],
  roleKey = 'HUGO_APROBADOR_INTEGRAL',
} = {}) {
  return {
    ok: true,
    data: {
      principal: {
        tenantId: '20000000-0000-4000-8000-000000000002',
        membershipId: '30000000-0000-4000-8000-000000000003',
        certifiedBindingId: '40000000-0000-4000-8000-000000000004',
        roleKey,
        employmentLinked: true,
        capabilities,
      },
      limits: {
        contractVersion: 'payroll-monthly-close-run.v1',
        maxSourceBytes: 256 * 1024,
        sourceContracts: run.sources.map((source) => source.definitionKey),
        jurisdictions: ['42', '55'],
      },
      runs: [run],
      recentEvents: [],
      flags: flags(),
    },
  };
}
