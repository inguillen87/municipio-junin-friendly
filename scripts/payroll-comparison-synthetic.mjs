/** Entirely synthetic source responses for isolated tests. Never seeds the backend. */
export const IDS = ['00000001-0000-4000-8000-000000000056', '00000002-0000-4000-8000-000000000056', '00000003-0000-4000-8000-000000000056', '00000004-0000-4000-8000-000000000056'];
const row = (code, description, amount, count = 2, totalGroup = '993') => ({ code, description, amount,
  sourceRows: count, missingAmounts: amount === null ? 1 : 0, totalGroup, unit: null });
export function comparisonFixtures() {
  const baseRows = [row('1', 'Básico sintético', '1000.10'), row('2', 'Base cero sintética', '0.00'), row('3', 'Ajuste sintético', '-2.00'),
    row('44', 'Mayor dedicación sintética', '100.00'), row('80', 'Definición anterior sintética', '20.00'), row('95', 'Full time sintético', '50.00'),
    row('550', 'Bono sintético sin importe', null), row('601', 'Descuento sintético', '25.00', 2, '996'),
    row('700', 'Solo en base sintético', '7.00', 1, '990'), row('993', 'Totalizador sintético', '1000.10', 4, '0')];
  const targetRows = [row('1', 'Básico sintético', '1100.11'), row('2', 'Base cero sintética', '5.00'), row('3', 'Ajuste sintético', '-3.00'),
    row('44', 'Mayor dedicación sintética', '80.00'), row('80', 'Definición nueva sintética', '30.00'), row('95', 'Full time sintético', '50.00', 3),
    row('550', 'Bono sintético sin importe', '20.00'), row('601', 'Descuento sintético', '25.00', 2, '996'),
    row('703', 'Solo en comparada sintético', '10.00', 1, '990'), row('993', 'Totalizador sintético', '1100.11', 5, '0')];
  const make = (i, rows, date, type = 'M') => ({ version: 'payroll-source-report.v1', mode: 'report', found: true, official: false,
    datasetId: IDS[i], date, type, statementCount: i === 0 ? 4 : 5, lineCount: rows.reduce((sum, r) => sum + r.sourceRows, 0),
    closureStatus: i === 0 ? 'closed' : 'open', sourceLabel: 'Conjunto SINTÉTICO de QA ' + (i + 1),
    payloadHash: String(i + 1).repeat(64), reportHash: String(i + 5).repeat(64), rows });
  const reports = [make(0, baseRows, '2026-07-31'), make(1, targetRows, '2026-08-31'),
    make(2, structuredClone(targetRows), '2026-06-30'), make(3, structuredClone(targetRows), '2026-06-30', 'S')];
  const items = reports.map(r => Object.fromEntries(['datasetId', 'date', 'type', 'statementCount', 'lineCount', 'closureStatus', 'payloadHash', 'sourceLabel'].map(k => [k, r[k]])));
  return { reports, catalog: { version: 'payroll-source-report.v1', mode: 'catalog', official: false, total: items.length, truncated: false, items } };
}
