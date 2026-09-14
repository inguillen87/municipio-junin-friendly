// Aggregate synthetic fixtures. Never municipal records or source dump contents.
const tables = ['persona', 'legajo', 'familia', 'vinculo', 'histocal', 'histolegajo', 'organiza'];
export function backupReviewFixture({ unchanged = false } = {}) {
  const domains = tables.map((table, i) => ({ table, baselineRows: unchanged ? 20 : 22 + i, candidateRows: unchanged ? 20 : 23 + i,
    unchanged: 20, added: unchanged ? 0 : 2, removed: unchanged ? 0 : 1, changed: unchanged ? 0 : 1 + i,
    identityChanged: unchanged ? 0 : 1, statusChanged: unchanged ? 0 : 1, dateChanged: unchanged ? 0 : 1 }));
  const fields = { IDENTITY_CHANGED: 'identityChanged', REMOVED_ROWS: 'removed', STATUS_CHANGED: 'statusChanged', DATE_CHANGED: 'dateChanged', ADDED_ROWS: 'added', CHANGED_ROWS: 'changed' };
  return { version: 'grh-backup-review.v1', toolVersion: '1.0.0', mappingVersion: 'grh-key-review.v1', generatedAt: '2026-09-14T08:42:00.123456Z',
    baseline: { sha256: 'a'.repeat(64), bytes: 102400, cutoffAt: '2026-08-06 23:15:10', database: 'grh_junin' },
    candidate: { sha256: 'b'.repeat(64), bytes: 103400, cutoffAt: '2026-09-10 01:20:30', database: 'grh_junin' },
    domains, issues: domains.flatMap(d => Object.entries(fields).filter(([, f]) => d[f] > 0).map(([code, field]) => ({ code, table: d.table, count: d[field] }))),
    scope: { comparisonOnly: true, readyForPromotion: false, databaseWrites: false, canonicalCompared: false, payrollFactsCompared: false, operationalEvidenceCompared: false } };
}
