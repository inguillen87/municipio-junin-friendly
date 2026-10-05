import { bootstrap, program, hash, uid } from './own-payroll-program-synthetic.js';
import { approved } from './payroll-monthly-annul-synthetic.js';
import { fixedEffects } from './payroll-fixed-novelties-synthetic.js';
export function approvedSources(count = 2) {
  const population = { complete: true, version: hash('d'), employees: Array.from({ length: count }, (_, n) => ({ contractId: uid(n + 1), employeeNumber: String(1001 + n), agreementCode: '1', departmentCode: '1', categoryCode: '6', identityToken: hash('e'), origin: 'MUNICONTROL' })) };
  const b = approved(1, 1, true); Object.assign(b, { periodMonth: '2026-10-01', payrollType: 'monthly' });
  Object.assign(b.rows[0], { rowOrdinal: 1, employmentContractId: uid(1), legajo: '1001', conceptSourceId: '120', quantityDecimal: null, amountCents: '2000', adjustmentMonth: null, forced: false, identityCurrent: true, issues: [] });
  Object.assign(b.rows[0].subject, { contractId: uid(1), legajo: '1001', identityToken: hash('e') });
  const fixedData = { periodMonth: '2026-10-01', snapshotToken: hash('f'), rows: [], total: 0, effects: { ...fixedEffects } };
  return { period: '2026-10', liquidationType: 'monthly', selection: { kind: 'all', values: [] }, programState: bootstrap({ program: { version: hash('b'), revision: 1, definition: program(), salaryVersion: hash('c'), proposalId: uid(50), approvalId: uid(51) } }), population, monthly: { complete: true, batches: [b] }, fixed: { list: { ok: true, data: { ...fixedData, version: 'payroll-fixed-list.v1' } }, export: { ok: true, data: { ...fixedData, version: 'payroll-fixed-export.v1' } } } };
}
