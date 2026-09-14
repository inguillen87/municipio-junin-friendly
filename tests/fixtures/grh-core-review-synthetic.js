// Aggregate synthetic reports only. No source records or municipal values.
export function coreReviewFixture({ unchanged = false } = {}) {
  const names = ['payrollRuns', 'payrollSnapshot', 'movements', 'payrollMonthly', 'employmentReconciliation'];
  const artifacts = Object.fromEntries(names.map((name, index) => {
    const changed = unchanged ? 0 : index + 1, added = unchanged ? 0 : 2, removed = unchanged ? 0 : 1;
    return [name, { baselineRows: 20 + changed + removed, candidateRows: 20 + changed + added,
      unchanged: 20, changed, added, removed, baselineLogicalPayloadBytes: (20 + changed + removed) * 100,
      candidateLogicalPayloadBytes: (20 + changed + added) * 100, changedPreviousLogicalPayloadBytes: changed * 100, addedLogicalPayloadBytes: added * 100 }];
  }));
  return { version: 'grh-core-artifact-comparison.v1', status: 'verified', databaseWrites: false, publicationAuthorized: false,
    baseline: { profileId: 'grh-junin-2026-08-06', sourceSha256: 'A'.repeat(64), manifestSha256: 'c'.repeat(64), cutoff: '2026-08-06T12:30:00' },
    candidate: { profileId: 'grh-junin-2026-09-10', sourceSha256: 'B'.repeat(64), manifestSha256: 'd'.repeat(64), cutoff: '2026-09-10T15:45:00' }, artifacts,
    semantics: { keys: 'Literal sourceKey from deterministic artifacts; snapshot IDs may be replaced between months.',
      removedRowsAreEmployeeTerminations: false, bytesAreDatabaseStorageMeasurement: false, payrollSnapshotIsPaymentEvidence: false,
      monthlyHistoryKeyOverlap: artifacts.payrollMonthly.unchanged + artifacts.payrollMonthly.changed, currentSchemaSupportsOverlappingMonthlyVersions: false } };
}
