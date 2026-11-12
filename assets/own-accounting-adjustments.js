// Ajustes contables de cierres con total oficial (V4/V5): descomposición exacta, por contrato, de la diferencia entre
// los renglones originales y los totales oficiales, en nueve componentes con signo y en centavos enteros.
//
// Es el candidato de Root `ACCOUNTING_ADJUSTMENTS_CANDIDATE_20261112` (núcleo 870d596c41c4…, adaptador fa85d135b633…), llevado a un solo
// módulo con los lectores de este repositorio. La lógica no se cambió: sólo las rutas de los imports. No elige cuentas,
// no crea conceptos de liquidación, no modifica un cierre y nunca marca una imputación como lista: `ready` es siempre
// falso hasta que exista la configuración v2 aprobada y su verificación nativa. El contrato completo está en el
// CONTRACT.md de esa entrega.
import { verifiedOwnCloseReceipt } from './own-payroll-close-model.js';
import { salarySerialized } from './native-salary-catalog-model.js';

// ── Núcleo: aritmética pura ─────────────────────────────────────────────────────────────────────────────────────────
// Candidate arithmetic only. No account selection, payroll mutation or approval.
export const ADJUSTMENT_CANDIDATE_VERSION = 'own-accounting-adjustments.candidate.v1';
export const TOTAL_KEYS = Object.freeze(['remuneration', 'non_remuneration', 'deduction', 'employer_contribution', 'gross', 'net']);
export const COMPONENT_KINDS = Object.freeze([
  'category.remuneration', 'category.non_subject', 'category.family_allowances',
  'category.deduction', 'category.employer_contribution',
  'consolidation.non_remuneration', 'consolidation.gross',
  'adjustment.net_outside_gross', 'consolidation.net_equation'
]);
const CATEGORY = Object.freeze({ '990': 'employer_contribution', '993': 'remuneration', '994': 'non_subject', '995': 'family_allowances', '996': 'deduction' });
const need = (ok, message) => { if (!ok) throw Error('ACCOUNTING_ADJUSTMENT_CANDIDATE: ' + message); };
const exactKeys = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
export function cents(value) {
  need(typeof value === 'string' && value.length <= 120 && /^-?(0|[1-9][0-9]*)\.[0-9]{2}$/.test(value) && value !== '-0.00', 'Expected canonical exact cents.');
  return BigInt(value.replace('.', ''));
}
export function money(value) {
  need(typeof value === 'bigint', 'Expected integer cents.');
  const digits = (value < 0n ? -value : value).toString().padStart(3, '0');
  return (value < 0n ? '-' : '') + digits.slice(0, -2) + '.' + digits.slice(-2);
}
const fraction = value => {
  need(exactKeys(value, ['numerator', 'denominator']) && /^-?(0|[1-9][0-9]*)$/.test(value.numerator) && /^[1-9][0-9]*$/.test(value.denominator), 'Invalid exact source fraction.');
  return { n: BigInt(value.numerator), d: BigInt(value.denominator) };
};
const add = (a, b) => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const negate = a => ({ n: -a.n, d: a.d });
const equal = (a, b) => a.n * b.d === b.n * a.d;
const rounded = a => {
  const scaled = a.n * 100n, remainder = scaled % a.d;
  let value = scaled / a.d;
  if ((remainder < 0n ? -remainder : remainder) * 2n >= a.d) value += scaled < 0n ? -1n : 1n;
  return value;
};
const empty = () => Object.fromEntries(TOTAL_KEYS.map(k => [k, 0n]));
const asMoney = values => Object.fromEntries(TOTAL_KEYS.map(k => [k, money(values[k])]));
const totals = (v, id) => {
  need(exactKeys(v, ['contractId', ...TOTAL_KEYS]) && v.contractId === id, 'Totals must identify the same contract.');
  return Object.fromEntries(TOTAL_KEYS.map(k => [k, cents(v[k])]));
};
const sameTotals = (a, b) => a.contractId === b.contractId && TOTAL_KEYS.every(k => a[k] === b[k]);
const sameMoney = (actual, expected, message) => need(cents(actual) === expected, message);

/** Pure decomposition of an employee already verified by the original reader.
 * categoryLineAmounts are exact sums of the immutable concept rows selected by
 * the captured policy. The public adapter computes them; callers do not choose
 * them. This function is NOT a substitute for source/hash/approval validation.
 */
export function decomposeOfficialAccountingEmployee(input) {
  need(exactKeys(input, ['contractId', 'lineTotals', 'officialTotals', 'reconciliation', 'categoryLineAmounts']), 'Unexpected decomposition fields.');
  const { contractId, lineTotals, officialTotals, reconciliation: r, categoryLineAmounts } = input;
  need(typeof contractId === 'string' && /^[a-f0-9-]{36}$/i.test(contractId) && r?.contractId === contractId, 'Missing contract provenance.');
  const line = totals(lineTotals, contractId), official = totals(officialTotals, contractId);
  need(sameTotals(r.originalLineTotals, lineTotals) && sameTotals(r.officialTotals, officialTotals), 'Reconciliation totals changed.');
  need(exactKeys(categoryLineAmounts, Object.keys(CATEGORY)), 'All five category line sums are required.');
  const printed = Object.fromEntries(Object.entries(categoryLineAmounts).map(([k, v]) => [k, cents(v)]));
  need(line.remuneration === printed['993'] && line.non_remuneration === printed['994'] + printed['995'] && line.deduction === printed['996'] && line.employer_contribution === printed['990'], 'Category line sums do not reconstruct original totals.');
  need(line.gross === line.remuneration + line.non_remuneration && line.net === line.gross - line.deduction, 'Original row-total identities failed.');
  need(exactKeys(r.exactComponents, ['990', '993', '994', '995', '996', '888', '998', '999']), 'All eight exact original components are required.');
  const exact = Object.fromEntries(Object.entries(r.exactComponents).map(([k, v]) => [k, fraction(v)]));
  const grossExact = add(add(exact['993'], exact['994']), exact['995']);
  const netExact = add(add(grossExact, exact['888']), negate(exact['996']));
  need(equal(netExact, exact['998']) && equal(netExact, exact['999']) && netExact.n > 0n, 'Original official net identity failed.');
  const roundedSource = Object.fromEntries(Object.entries(exact).map(([k, v]) => [k, rounded(v)]));
  const expectedOfficial = { remuneration: roundedSource['993'], non_remuneration: rounded(add(exact['994'], exact['995'])), deduction: roundedSource['996'], employer_contribution: roundedSource['990'], gross: rounded(grossExact), net: rounded(netExact) };
  need(TOTAL_KEYS.every(k => official[k] === expectedOfficial[k]), 'Official totals do not match exact source components.');
  need(exactKeys(r.categoryDifferences, Object.values(CATEGORY)), 'All category differences must be preserved.');
  const category = Object.fromEntries(Object.entries(CATEGORY).map(([code, key]) => {
    const amount = roundedSource[code] - printed[code];
    sameMoney(r.categoryDifferences[key], amount, 'Original category difference changed.');
    return [key, amount];
  }));
  const nonRemConsolidation = official.non_remuneration - roundedSource['994'] - roundedSource['995'];
  const grossConsolidation = official.gross - official.remuneration - official.non_remuneration;
  const outsideGross = roundedSource['888'];
  const equation = official.net - official.gross - outsideGross + official.deduction;
  const netDifference = official.net - line.net;
  sameMoney(r.netAdjustmentOutsideGross, outsideGross, 'Original outside-gross adjustment changed.');
  sameMoney(r.displayedEquationRounding, equation, 'Original net-equation rounding changed.');
  sameMoney(r.netDifferenceFromLines, netDifference, 'Original net difference changed.');
  sameMoney(r.roundingDifferenceFromLines, netDifference - outsideGross, 'Original rounding aggregate changed.');
  const records = [
    ['category.remuneration', category.remuneration, ['remuneration', 'gross', 'net'], '993'],
    ['category.non_subject', category.non_subject, ['non_remuneration', 'gross', 'net'], '994'],
    ['category.family_allowances', category.family_allowances, ['non_remuneration', 'gross', 'net'], '995'],
    ['category.deduction', category.deduction, ['deduction', '-net'], '996'],
    ['category.employer_contribution', category.employer_contribution, ['employer_contribution'], '990'],
    ['consolidation.non_remuneration', nonRemConsolidation, ['non_remuneration', 'gross', 'net'], null],
    ['consolidation.gross', grossConsolidation, ['gross', 'net'], null],
    ['adjustment.net_outside_gross', outsideGross, ['net'], '888'],
    ['consolidation.net_equation', equation, ['net'], null]
  ];
  const aggregate = empty();
  const components = records.map(([kind, amount, effects, sourceTotal]) => {
    const values = empty();
    for (const effect of effects) values[effect.replace(/^-/, '')] = effect.startsWith('-') ? -amount : amount;
    for (const key of TOTAL_KEYS) aggregate[key] += values[key];
    return { kind, amount: money(amount), sourceTotal, totalEffects: asMoney(values), isPayrollConcept: false, postingRequired: amount !== 0n };
  });
  need(TOTAL_KEYS.every(k => line[k] + aggregate[k] === official[k]), 'Decomposition does not reconstruct all six official totals.');
  need(components.filter(c => c.kind === 'category.employer_contribution').every(c => c.totalEffects.net === '0.00'), 'Employer contribution must stay outside net.');
  return {
    version: ADJUSTMENT_CANDIDATE_VERSION, contractId,
    lineTotals: { ...lineTotals }, officialTotals: { ...officialTotals }, components,
    totalEffects: asMoney(aggregate),
    diagnostics: { netDifferenceFromLines: money(netDifference), roundingDifferenceFromLines: money(netDifference - outsideGross), aggregateFieldsAreAdditionalPostings: false },
    reconstructedTotals: asMoney(Object.fromEntries(TOTAL_KEYS.map(k => [k, line[k] + aggregate[k]]))),
    identitiesVerified: true, ready: false, productionIntegrationEnabled: false
  };
}

// ── Adaptador: verifica el recibo original y agrega procedencia y huella ───────────────────────────────────────────
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salarySerialized(value))))].map(x => x.toString(16).padStart(2, '0')).join('');
const freeze = v => { if (v && typeof v === 'object') { for (const item of Object.values(v)) freeze(item); Object.freeze(v); } return v; };

/** Pure preparation: verifies the original immutable receipt, then derives
 * separate accounting adjustments. It never marks an allocation approved/ready.
 * Configuration v2 and its native verification are deliberately not installed.
 */
export async function deriveAccountingAdjustmentCandidate(originalReceipt) {
  const receipt = await verifiedOwnCloseReceipt(originalReceipt), snapshot = receipt.snapshot;
  const source = { groupId: receipt.groupId, bodySha256: receipt.bodySha256, snapshotSha256: receipt.snapshotSha256, snapshotVersion: snapshot.version, period: snapshot.period, liquidationType: snapshot.liquidationType };
  if (['own-close-snapshot.v1', 'own-close-snapshot.v2', 'own-close-snapshot.v3'].includes(snapshot.version)) {
    return freeze({ version: ADJUSTMENT_CANDIDATE_VERSION, route: 'retain_original_legacy_reader', source, adjustments: [], ready: false, productionIntegrationEnabled: false, accountingPosted: false, paymentExecuted: false });
  }
  need(['own-close-snapshot.v4', 'own-close-snapshot.v5'].includes(snapshot.version), 'Unsupported snapshot version.');
  const employees = [], adjustments = [], allComponents = [], aggregate = Object.fromEntries(TOTAL_KEYS.map(k => [k, 0n]));
  for (const e of snapshot.employees) {
    if (!['own-payroll-input.v4', 'own-payroll-input.v5'].includes(e.inputVersion)) {
      employees.push({ contractId: e.contractId, runId: e.runId, route: 'retain_original_legacy_reader' });
      continue;
    }
    const sourceEvidence = snapshot.sources.find(s => s.runId === e.runId), policy = sourceEvidence.officialTotalsPolicy;
    const rows = snapshot.concepts.filter(r => r.contractId === e.contractId);
    const categoryLineAmounts = Object.fromEntries(Object.entries(policy.contributions).map(([target, codes]) => [target, money(codes.reduce((sum, code) => {
      const matches = rows.filter(r => r.nature !== 'auxiliary' && r.conceptCode === code);
      need(matches.length === 1 && matches[0].unit === 'money', 'A captured contribution lost its unique monetary row.');
      return sum + cents(matches[0].amount);
    }, 0n))]));
    const value = decomposeOfficialAccountingEmployee({ contractId: e.contractId, lineTotals: e.lineTotals, officialTotals: e.totals, reconciliation: e.totalReconciliation, categoryLineAmounts });
    const provenance = {
      ...source, contractId: e.contractId, runId: e.runId, inputSha256: e.inputSha256, resultSha256: e.resultSha256,
      agreementCode: e.agreementCode, departmentCode: e.departmentCode, jurisdiction: structuredClone(e.jurisdiction),
      reconciliationSha256: await hash(e.totalReconciliation), officialTotalsPolicySha256: await hash(policy)
    };
    employees.push({ ...value, provenance });
    for (const component of value.components) {
      const key = await hash({ version: ADJUSTMENT_CANDIDATE_VERSION, ...source, contractId: e.contractId, runId: e.runId, kind: component.kind });
      const complete = { key, ...component, provenance, documentReference: null, budgetItemReference: null, accountingAccountReference: null };
      allComponents.push(complete);
      if (component.postingRequired) adjustments.push(complete);
    }
    for (const key of TOTAL_KEYS) aggregate[key] += cents(value.totalEffects[key]);
  }
  for (const key of TOTAL_KEYS) need(cents(snapshot.lineTotals[key]) + aggregate[key] === cents(snapshot.totals[key]), 'Whole-close totals did not reconstruct.');
  const content = {
    version: ADJUSTMENT_CANDIDATE_VERSION, route: 'official_adjustment_candidate', source,
    employees, allComponents, adjustments, adjustmentCount: adjustments.length,
    lineTotals: structuredClone(snapshot.lineTotals), officialTotals: structuredClone(snapshot.totals),
    totalEffects: Object.fromEntries(TOTAL_KEYS.map(k => [k, money(aggregate[k])])),
    originalEconomicRowsPreserved: true, originalSnapshotPreserved: true,
    aggregateFieldsAreAdditionalPostings: false,
    blockers: [...(adjustments.length ? ['approved_adjustment_configuration_required', 'native_liquidation_dates_and_assignments_required'] : []), 'candidate_not_integrated'],
    ready: false, productionIntegrationEnabled: false, accountingPosted: false, paymentExecuted: false
  };
  return freeze({ ...content, projectionSha256: await hash(content) });
}
