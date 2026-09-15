import { buildBankReport } from '../../lib/internal-payroll-bank-source.js';
export const bankFixtureId = '11111111-1111-4111-8111-111111111111';
const checksum = (digits, weights) => String((10 - [...digits].reduce((sum, n, i) => sum + Number(n) * weights[i], 0) % 10) % 10);
const first = '1910001', second = '0000001234567';
export const bankFixtureCbu = first + checksum(first, [7, 1, 3, 9, 7, 1, 3]) + second + checksum(second, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]);
export function bankGeneratorRaw(count = 75) {
  return { version: 'payroll-bank-source-read.v1', mode: 'report', dataset: { datasetId: bankFixtureId, period: '2026-08', date: '2026-08-31', type: 'M', statementCount: count, sourceLabel: 'Fuente sintética para pruebas', sourceSha256: 'a'.repeat(64), payloadHash: 'c'.repeat(64) },
    bankSource: { sourceSha256: 'a'.repeat(64), payloadSha256: 'd'.repeat(64), cutoff: '2026-08-19T15:17:09' },
    rows: Array.from({ length: count }, (_, i) => ({ legajo: String(i + 1).padStart(5, '0'), name: 'Persona sintética ' + (i + 1), cuil: '20111111112', bankCode: i % 3 === 0 ? '101' : i % 3 === 1 ? '102' : '105', bankLabel: i % 3 === 0 ? 'BANCO CREDICOOP SUC.JUNIN' : i % 3 === 1 ? 'BANCO SANTANDER' : 'BANCO NACION', accountTypeCode: i % 2 ? '2' : '4', accountNumber: '0000012345', cbuLegacy: null, cbuCurrent: bankFixtureCbu, repartitionCode: i % 2 ? '17' : '01', repartitionLabel: 'Repartición sintética', netAmount: '1000.01' })) };
}
export function bankGeneratorFixture(count = 75, mutate) { const raw = bankGeneratorRaw(count); mutate?.(raw); return { ok: true, data: buildBankReport(raw) }; }
export function bankGeneratorCatalog(count = 75) { return { ok: true, data: { version: 'payroll-bank-report.v1', mode: 'catalog', items: [{ ...bankGeneratorRaw(count).dataset, bankSourceAvailable: true }] } }; }
