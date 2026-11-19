// Entirely invented data. This fixture constructs closed-source contracts; it
// does not claim that a database close or a salary calculation was performed.
import { createHash } from 'node:crypto';
import { salarySerialized } from '../../assets/native-salary-catalog-model.js';
import { decimal, exactEvidence, rational, exactAdd, exactSubtract, quantize } from '../../assets/own-payroll-exact.js';
import { OWN_PAYROLL_NAMESPACE_VERSION } from '../../assets/own-payroll-engine.js';
import { OWN_OSEP_DECLARATIONS_VERSION, OWN_OSEP_GRH_MAPPING_DRAFT } from '../../assets/own-osep-report-model.js';

export const uid = value => '10000000-0000-4000-8000-' + String(value).padStart(12, '0');
export const fixtureHash = value => createHash('sha256').update(salarySerialized(value)).digest('hex');
const totalKeys = ['remuneration', 'non_remuneration', 'deduction', 'employer_contribution', 'gross', 'net'];
const amountRows = [
  ['1', 'remuneration', '1000.00'], ['2', 'non_remuneration', '50.00'],
  ['701', 'employer_contribution', '75.00'], ['993', 'auxiliary', '1000.00'], ['994', 'auxiliary', '50.00'],
  ['998', 'auxiliary', '971.00'], ['601', 'deduction', '50.00'], ['602', 'deduction', '11.00'], ['608', 'deduction', '2.00'],
  ['603', 'deduction', '0.00'], ['604', 'deduction', '2.50'], ['682', 'deduction', '1.00'],
  ['683', 'deduction', '3.00'], ['684', 'deduction', '4.00'], ['605', 'deduction', '0.00'], ['685', 'deduction', '5.50'],
];

export function financialRow(employee, code, nature, amount) {
  const value = exactEvidence(decimal(amount));
  return { contractId: employee.contractId, employeeNumber: employee.employeeNumber, agreementCode: employee.agreementCode,
    departmentCode: employee.departmentCode, conceptCode: code, nature, unit: 'money', amount,
    exactValue: value, rounding: { precision: 2, mode: 'exact' }, ruleReference: 'Regla exclusivamente sintética para probar el adaptador',
    dependencies: [], trace: [{ operation: 'literal', reference: null, stage: null, result: value }] };
}

export function rehashFixture(source, { recalculateTotals = true } = {}) {
  for (const group of source.content.groups) {
    const s = group.snapshot;
    if (recalculateTotals) {
      const totals = Object.fromEntries(totalKeys.map(key => [key, rational(0n)]));
      for (const e of s.employees) {
        const rows = s.concepts.filter(r => r.contractId === e.contractId), sums = Object.fromEntries(totalKeys.slice(0, 4).map(key => [key, rational(0n)]));
        for (const row of rows) if (Object.hasOwn(sums, row.nature)) sums[row.nature] = exactAdd(sums[row.nature], decimal(row.amount));
        sums.gross = exactAdd(sums.remuneration, sums.non_remuneration); sums.net = exactSubtract(sums.gross, sums.deduction);
        e.totals = { contractId: e.contractId, ...Object.fromEntries(totalKeys.map(key => [key, quantize(sums[key], { precision: e.precision, mode: 'exact' }).amount])) };
        e.conceptCount = rows.length;
        for (const key of totalKeys) totals[key] = exactAdd(totals[key], sums[key]);
      }
      s.totals = Object.fromEntries(totalKeys.map(key => [key, quantize(totals[key], { precision: s.precision, mode: 'exact' }).amount]));
      s.conceptCount = s.concepts.length;
    }
    group.snapshotSha256 = fixtureHash(s); group.bodySha256 = fixtureHash(group.body);
  }
  source.sourceVersion = fixtureHash(source.content); return source;
}

export function osepFixture(count = 3, { jurisdictions = ['42'], namespaced = false } = {}) {
  const selection = { kind: 'all', values: [] }, snapshot = {
    version: namespaced ? 'own-close-snapshot.v3' : 'own-close-snapshot.v2', period: '2026-11', liquidationType: 'monthly',
    populationDomain: 'native_registered', rosterVersion: 'c'.repeat(64), selection, employeeCount: count, populationCount: count,
    populationComplete: true, precision: 2, totals: {}, employees: [], concepts: [], conceptCount: 0,
    payrollCalculated: true, payrollPosted: false, paymentExecuted: false,
  };
  const people = [];
  for (let i = 0; i < count; i++) {
    const employee = { contractId: uid(1000 + i), employeeNumber: String(1001 + i), agreementCode: '1', departmentCode: '1',
      runId: uid(2000 + i), inputSha256: 'd'.repeat(64), resultSha256: 'e'.repeat(64), liquidationVersion: 1,
      precision: 2, conceptCount: amountRows.length, totals: {},
      jurisdiction: { code: jurisdictions[i % jurisdictions.length], basis: 'captured_own_registration', sourceSha256: 'f'.repeat(64) },
      ...(namespaced ? { namespaceVersion: OWN_PAYROLL_NAMESPACE_VERSION } : {}),
    };
    snapshot.employees.push(employee);
    snapshot.concepts.push(...amountRows.map(([code, nature, amount]) => financialRow(employee, code, nature, amount)));
    people.push({ contractId: employee.contractId, personId: uid(3000 + i), registrationId: uid(4000 + i), employeeNumber: employee.employeeNumber,
      name: 'Persona Sintética ' + i, dni: String(99000000 + i), cuil: null, sex: null, identityToken: fixtureHash({ synthetic: i }),
      days: { version: 'a'.repeat(64), revision: 0, definition: null, proposalId: null, approvalId: null, identityToken: null, sourceVersion: null }, daysCurrent: null });
  }
  const body = { period: snapshot.period, liquidationType: 'monthly', scopeVersion: 'a'.repeat(64), stateVersion: 'b'.repeat(64), selection: structuredClone(selection),
    command: 'close', groupId: null, reason: 'Cierre exclusivamente sintético del adaptador', reviewConfirmed: true };
  const group = { version: 'own-close-receipt.v1', id: uid(1), key: uid(2), body, bodySha256: 'a'.repeat(64), groupId: uid(1),
    snapshot, snapshotSha256: 'a'.repeat(64), recordedAt: '2026-11-05T00:00:00.000Z', replayed: false };
  return rehashFixture({ version: 'own-art-preview.v1', scopeVersion: 'a'.repeat(64), sourceVersion: 'a'.repeat(64),
    content: { version: 'own-art-source.v1', params: { period: snapshot.period, types: ['monthly'] }, groups: count ? [group] : [], people,
      sourceRecordCount: count, complete: true, origin: 'MUNICONTROL' } });
}

export function identityFixture(source) {
  return { version: OWN_OSEP_DECLARATIONS_VERSION, scopeVersion: source.scopeVersion, sourceVersion: source.sourceVersion,
    period: source.content.params.period, rows: source.content.people.map(p => ({ contractId: p.contractId, personId: p.personId,
      registrationId: p.registrationId, identityToken: p.identityToken, documentTypeCode: '3', bankrupt: null,
      reference: 'Declaración exclusivamente sintética QA' })) };
}
export function osepOptions(source, jurisdictionCode = '42') {
  return { scope: { ...structuredClone(source.content.params), jurisdictionCode }, mapping: structuredClone(OWN_OSEP_GRH_MAPPING_DRAFT), identityDeclarations: identityFixture(source) };
}
export function setConcept(source, code, change, contractIndex = 0) {
  const group = source.content.groups[0], employee = group.snapshot.employees[contractIndex];
  const row = group.snapshot.concepts.find(r => r.contractId === employee.contractId && r.conceptCode === code);
  Object.assign(row, change); return row;
}
