// Synthetic source-summary contracts; never municipal evidence or copied source amounts.
import { monthlyFixture, monthlySource } from '../fixtures/payroll-monthly-summary-synthetic.js';
export const mutualSyntheticCodes = ['0614', '620', '623', '641', '649', '665', '675', '676', '677', '678', '606', '996', '995'];
export function mutualFixture(codes = mutualSyntheticCodes, sources = null) {
  const payload = monthlyFixture(codes.length, sources ?? [monthlySource(1, codes.length), monthlySource(2, codes.length)]);
  payload.data.rows = payload.data.rows.map((row, index) => ({ ...row, code: codes[index], description: 'Descuento sintético ' + codes[index],
    totalGroup: ['995', '996'].includes(codes[index]) ? '0' : '0996', missingQuantities: 0, quantity: '2.00', missingAmounts: 0, amount: index === 0 ? '0.10' : '0.20' }));
  return payload;
}
export function mutualCatalog() {
  const summary = mutualFixture();
  return { ok: true, data: { version: summary.data.version, mode: 'catalog', period: null, items: summary.data.sources, total: summary.data.sources.length, scope: summary.data.scope } };
}
