import test from 'node:test';
import assert from 'node:assert/strict';
import { salaryItems, salaryRowKey, salaryDiff } from '../assets/native-salary-catalog-model.js';
import { ownProgramDefinition, ownProgramStructure, ownProgramHistory, ownProgramRuleKey } from '../assets/own-payroll-program-model.js';
import { calculateOwnPayroll } from '../assets/own-payroll-engine.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
import { row } from './fixtures/native-salary-synthetic.js';
import { payrollInput, employee, rule, lit, ref, binary, policy } from './fixtures/own-payroll-synthetic.js';
import { auxiliarySources, auxiliaryCapture, auxiliaryProgram, auxiliaryDefinitions,auxiliaryDocuments } from './fixtures/own-payroll-auxiliary-synthetic.js';
import { ownCloseReceipt,verifiedOwnCloseReceipt } from '../assets/own-payroll-close-model.js';
import { ownReceiptSnapshot,ownReceiptRecord,ownReceiptVisibleRecords } from '../assets/own-payroll-receipt-model.js';
import { createOwnReceiptPdf } from '../assets/own-payroll-receipt-pdf.js';
import { prepareOwnPlanilla,ownPlanillaPage } from '../assets/own-payroll-receipt-planilla-model.js';
import { ownPlanillaCsv,ownPlanillaXlsx } from '../assets/own-payroll-receipt-planilla-export.js';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { ownRunWorkspaceResult, ownRunWorkspaceRows, ownRunWorkspaceCsv } from '../assets/own-payroll-run-workspace-model.js';
import { ownComparison } from '../assets/own-payroll-comparison-model.js';
import { ownReportVariableSources } from '../assets/own-payroll-report-variables.js';
import { ownLegajoReportRows } from '../assets/own-payroll-report-legajo.js';
import { salaryFileExport, salaryFilePlan } from '../assets/native-salary-file-model.js';
import { salaryCopyPlan } from '../assets/native-salary-copy-model.js';
import { requireExactProgramChanges } from '../assets/own-payroll-program-precision.js';
import { ownRunHash } from '../lib/internal-own-payroll-run.js';

const auxiliary = (code, stage = 'exact') => ({ op: 'auxiliary', code, stage });
const rules = () => [
  rule('88', lit('100.11', 'money'), { nature: 'auxiliary', rounding: policy('exact') }),
  rule('88', lit('7.29', 'money'), { rounding: policy('exact') }),
  rule('95', binary('add', auxiliary('88'), ref('88', 'exact')), { rounding: policy('exact') }),
];
const definitions = () => [
  row({ kind: 'auxiliary', code: '88', nature: 'auxiliary', unit: 'money', value: '100.11' }),
  row({ code: '88', unit: 'money', value: '7.29' }),
  row({ code: '95', unit: 'money' }),
];

test('maestro: concepto y auxiliar 88 conservan códigos propios y dependencias inequívocas', () => {
  const items = definitions(); items[2].dependencies = [salaryRowKey(items[0]), salaryRowKey(items[1])].sort();
  assert.equal(salaryItems(items).length, 3);
  assert.equal(new Set(items.map(salaryRowKey)).size, 3);
  assert.equal(salaryDiff([], items).length, 3);
});

test('programa nuevo: declara el espacio de cada referencia sin reinterpretar el contrato anterior', () => {
  const p = { namespaceVersion: 'own-payroll-namespaces.v2', rules: rules(), bindings: [], totalsPrecision: 2 };
  assert.equal(ownProgramDefinition(p, definitions()).rules.length, 3);
  assert.throws(() => ownProgramStructure({ rules: rules(), bindings: [], totalsPrecision: 2 }));
});

test('cálculo nuevo: usa ambos 88, conserva centavos y no suma auxiliares al haber', () => {
  const result = calculateOwnPayroll(payrollInput({ version: 'own-payroll-input.v2', rules: rules(), employees: [employee(1)] }));
  assert.equal(result.version, 'own-payroll-result.v2');
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows.find(r => r.conceptCode === '95').amount, '107.40');
  assert.deepEqual(result.rows.find(r => r.conceptCode === '95').dependencies, ['auxiliary:88', 'concept:88']);
  assert.equal(result.employeeTotals[0].gross, '114.69');
  assert.equal(result.employeeTotals[0].net, '114.69');
});

test('v1 conserva la instantánea y resultado anteriores sin convertir sus referencias', () => {
  const snapshot = createOwnPayrollSnapshot(payrollInput());
  assert.equal(snapshot.input.version, 'own-payroll-input.v1');
  assert.equal(snapshot.result.version, 'own-payroll-result.v1');
  assert.equal(snapshot.inputSha256, '631d9b1b820fed8841a1a78f64ed95d9061f1c12a2e9c4cafa99444267c9557e');
  assert.equal(snapshot.resultSha256, '5763a436e28c9a578dd8b9c95d937932e4195c3e072c031ef3ad7707ec7171c5');
  assert.equal(snapshot.result.employeeTotals[0].net, '128.63');
  assert.deepEqual(snapshot.result.rows.find(r => r.conceptCode === '210').dependencies, ['100', '110', '120']);
});

test('referencia ausente de un espacio no se satisface con el mismo número en el otro', () => {
  for (const missing of ['auxiliary', 'remuneration']) {
    const input = payrollInput({ version: 'own-payroll-input.v2', rules: rules().filter(r => r.code !== '88' || r.nature !== missing) });
    assert.throws(() => calculateOwnPayroll(input), e => e.code === 'RULE_MISSING');
  }
});

test('ciclo entre concepto y auxiliar y duplicado dentro del mismo espacio impiden todo cálculo', () => {
  const cycle = rules(); cycle[0].expression = ref('88', 'exact'); cycle[1].expression = auxiliary('88');
  assert.throws(() => calculateOwnPayroll(payrollInput({ version: 'own-payroll-input.v2', rules: cycle })), e => e.code === 'RULE_CYCLE');
  assert.throws(() => calculateOwnPayroll(payrollInput({ version: 'own-payroll-input.v2', rules: [...rules(), rules()[0]] })), e => e.code === 'RULE_OVERLAP');
  const repeated = definitions(); repeated.push(structuredClone(repeated[0])); assert.throws(() => salaryItems(repeated), /repetida/);
});

test('los dos parámetros 88 toman el origen explícito; 37 contratos conservan toda la población', () => {
  const input = prepareOwnPayrollInput(auxiliarySources(37)), snapshot = createOwnPayrollSnapshot(input);
  assert.equal(input.version, 'own-payroll-input.v2');
  assert.deepEqual(input.employees[36].inputs.map(i => [i.key, i.value]), [['auxiliaryValue', '100.11000000'], ['conceptValue', '7.29000000']]);
  assert.equal(snapshot.result.employeeCount, 37); assert.equal(snapshot.result.rowCount, 111);
  assert.equal(snapshot.result.employeeTotals[36].net, '114.69');
});

test('parámetro auxiliar ausente y origen cambiado bloquean, aunque el concepto 88 tenga valor', () => {
  for (const edit of [s => s.programState.salaryCatalog.items.find(r => r.kind === 'auxiliary').value = null,
    s => s.programState.program.definition.bindings.find(b => b.sourceKind === 'auxiliary_parameter').sourceCode = '95']) {
    const source = auxiliarySources(); edit(source); assert.throws(() => prepareOwnPayrollInput(source), e => e.code === 'SOURCE_DEFINITION_MISSING');
  }
});

test('detalle, filtro y CSV conservan ambos espacios y todas las páginas del cálculo guardado', () => {
  const c = auxiliaryCapture(37); assert.equal(ownRunWorkspaceResult(c).result.rowCount, 111);
  const view = ownRunWorkspaceRows(c, '88', 3); assert.equal(view.filtered, 74); assert.equal(view.rows.length, 24);
  const csv = ownRunWorkspaceCsv(c); assert.equal(csv.split('\r\n').length, 113); assert.match(csv, /Auxiliar/);
  const wrong = structuredClone(c); wrong.saved.input.version = 'own-payroll-input.v1'; assert.throws(() => ownRunWorkspaceResult(wrong));
});

test('comparación no sobrescribe el concepto 88 con el auxiliar 88', () => {
  const base = auxiliaryCapture(), next = auxiliaryCapture(1, { id: '10000000-0000-4000-8000-000000000099', key: '10000000-0000-4000-8000-000000000098' });
  const model = ownComparison(base, next); assert.equal(model.rows.length, 3);
  assert.equal(model.rows.filter(r => r.label === '88').length, 2); assert.equal(model.rows.filter(r => r.changed).length, 0);
});

test('informe histórico conserva descripciones y usos separados de ambos 88', () => {
  const c = auxiliaryCapture(), p = c.saved.input.employees[0], totals = c.saved.result.employeeTotals[0];
  const bundle = { captures: [c], employees: [{ identity: 'participación sintética', period: '2026-10', type: 'monthly', employee: { ...p, runId: c.id, precision: 2, totals, inputSha256: c.saved.inputSha256, resultSha256: c.saved.resultSha256, liquidationVersion: 1 }, source: { snapshot: { concepts: c.saved.result.rows } } }] };
  const variables = ownReportVariableSources(bundle, [c]).participations.get('participación sintética').variables;
  assert.deepEqual(variables[0].occurrences.map(o => o.concept), ['Auxiliar 88', 'Concepto 95']);
  assert.deepEqual(variables[1].occurrences.map(o => o.concept), ['Concepto 88', 'Concepto 95']);
  const rows = ownLegajoReportRows(bundle, bundle.employees); assert.equal(rows.length, 9);
  assert.ok(rows.some(r => r[2].includes('Valor auxiliar exclusivamente sintético') && r[6] === '100.11'));
  assert.ok(rows.some(r => r[2].includes('Haber exclusivamente sintético') && r[3] === '7.29'));
});

test('CSV y copia del maestro retienen ambos códigos y sus dependencias sin alias', () => {
  const items = definitions(), classification = [{ kind: 'agreements', code: '1' }, { kind: 'agreements', code: '2' }];
  items[2].dependencies = [salaryRowKey(items[0]), salaryRowKey(items[1])].sort();
  assert.deepEqual(salaryFilePlan([], salaryFileExport(items), classification).items, salaryItems(items));
  const copied = salaryCopyPlan(items, [{ key: salaryRowKey(items[2]), before: items[2] }], ['2'], classification);
  assert.equal(copied.items.length, 6); assert.equal(copied.newDefinitionsCount, 3);
  assert.deepEqual(copied.items.find(r => r.agreementCode === '2' && r.code === '95').dependencies, ['auxiliary:2::88:2026-10', 'concept:2::88:2026-10']);
});

test('historia y precisión no confunden reglas del mismo número ni permiten volver a v1', () => {
  const before = auxiliaryProgram(), after = structuredClone(before); after.rules = after.rules.filter(r => r.nature !== 'auxiliary');
  assert.throws(() => ownProgramHistory(before, after), e => e.code === 'PROGRAM_HISTORY_REQUIRED');
  assert.notEqual(ownProgramRuleKey(before.rules[0], before.namespaceVersion), ownProgramRuleKey(before.rules[1], before.namespaceVersion));
  const downgrade = structuredClone(before); delete downgrade.namespaceVersion; assert.throws(() => ownProgramHistory(before, downgrade));
  const precision = auxiliaryProgram(); precision.rules.find(r => r.code === '95').expression.left.stage = 'rounded';
  assert.throws(() => requireExactProgramChanges(null, precision), e => e.code === 'PROGRAM_PRECISION_REQUIRED');
  assert.notEqual(ownRunHash(auxiliaryDefinitions()), ownRunHash(definitions()));
});

test('cierre, recibos y planilla verifican ambos 88 en 37 contratos, sin recortar por búsqueda',async()=>{
  const {closed,batch}=auxiliaryDocuments(37);await verifiedOwnCloseReceipt(closed);ownReceiptSnapshot(batch.snapshot);
  assert.equal(closed.snapshot.version,'own-close-snapshot.v3');assert.equal(closed.snapshot.conceptCount,111);
  assert.equal(ownReceiptVisibleRecords(batch.snapshot,'Agente sintético 36').filtered,1);assert.equal(ownReceiptVisibleRecords(batch.snapshot,'',2).rows.length,12);
  const pdf=await createOwnReceiptPdf(batch);assert.equal(pdf.recordCount,37);
  const planilla=await prepareOwnPlanilla(batch,[closed]);assert.equal(planilla.selected,37);assert.equal(planilla.totals.net,'4243.53');assert.equal(planilla.records[36].concepts.length,3);
  assert.equal(ownPlanillaPage(planilla,'Agente sintético 36').filtered,1);const csv=ownPlanillaCsv(planilla);assert.equal(csv.split('\r\n').length,39);assert.match(csv,/114.69/);const xlsx=Buffer.from(ownPlanillaXlsx(planilla));assert.ok(xlsx.includes(Buffer.from('Valor auxiliar exclusivamente sintético')));assert.ok(xlsx.includes(Buffer.from('Haber exclusivamente sintético')));
});

test('las versiones antiguas y los duplicados del mismo espacio siguen rechazados en cierre y recibo',()=>{
  const {closed,batch}=auxiliaryDocuments(2),s=batch.snapshot;
  for(const version of ['own-receipt-snapshot.v1','own-receipt-snapshot.v2']){const x=structuredClone(s);x.version=version;assert.throws(()=>ownReceiptSnapshot(x));}
  const r=structuredClone(s.records[0]);delete r.namespaceVersion;assert.throws(()=>ownReceiptRecord(r));
  r.namespaceVersion='own-payroll-namespaces.v2';r.concepts.push(structuredClone(r.concepts[0]));assert.throws(()=>ownReceiptRecord(r));
  const x=structuredClone(closed);x.snapshot.concepts[1]=structuredClone(x.snapshot.concepts[0]);assert.throws(()=>ownCloseReceipt(x));
  const y=structuredClone(closed);y.snapshot.version='own-close-snapshot.v2';assert.throws(()=>ownCloseReceipt(y));
});
