// Synthetic contract data only. These are not municipal payroll evidence.
export const monthlyUuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
export const monthlyScope = () => ({ kind: 'selected_available_general', completeMonthCertified: false, payrollCalculated: false, payrollPosted: false, official: false });
export function monthlySource(n, concepts = 75, period = '2026-08') {
  return { datasetId: monthlyUuid(n), date: n === 1 ? '2026-09-01' : '2026-08-' + String(10 + n % 18).padStart(2, '0'), sourcePeriod: Number(period.slice(0, 4)), sourceMonth: Number(period.slice(5)),
    type: n % 2 ? 'M' : 'O', closureStatus: n === 1 ? 'closed' : n === 2 ? 'open' : 'unknown', statementCount: 2, lineCount: concepts * 2,
    sourceLabel: 'Fuente sintética QA ' + n, sourceSha256: 'a'.repeat(64), payloadHash: n.toString(16).padStart(64, '0'), importedAt: '2026-09-14T12:34:56.123456Z' };
}
export function monthlyCatalog(count = 3, concepts = 75) {
  return { ok: true, data: { version: 'payroll-monthly-source-summary.v1', mode: 'catalog', period: null,
    items: Array.from({ length: count }, (_, n) => monthlySource(n + 1, concepts)), total: count, scope: monthlyScope() } };
}
export function monthlyFixture(concepts = 75, sources = [monthlySource(1, concepts), monthlySource(2, concepts)]) {
  const sourceRows = sources.length * 2;
  const rows = Array.from({ length: concepts }, (_, n) => ({ code: String(n + 1).padStart(3, '0'), description: 'Concepto sintético ' + String(n + 1).padStart(4, '0'), unit: 'UNIDAD', totalGroup: '993',
    sourceRows, distinctLegajos: 2, missingQuantities: n === 1 ? 1 : 0, quantity: n === 1 ? null : n === 2 ? '9999999999999999999999.99' : '2.00',
    missingAmounts: n === 0 ? 1 : 0, amount: n === 0 ? null : n === 2 ? '-9999999999999999999999.99' : '3456.78' }));
  return { ok: true, data: { version: 'payroll-monthly-source-summary.v1', mode: 'summary', period: '2026-08', sources,
    counts: { datasetCount: sources.length, statementParticipations: sources.length * 2, distinctLegajos: 2, lineCount: concepts * sourceRows, conceptCount: concepts },
    rows, reportHash: 'f'.repeat(64), scope: monthlyScope() } };
}
