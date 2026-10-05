import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
import { approvedSources } from './fixtures/own-payroll-approved-synthetic.js';
import { hash, uid } from './fixtures/own-payroll-program-synthetic.js';
import { fixedApprovedRecord } from './fixtures/payroll-fixed-novelties-synthetic.js';
test('catálogo aprobado y novedad propia alimentan cálculo exacto sin fuentes GRH', () => {
  const input = prepareOwnPayrollInput(approvedSources()), snapshot = createOwnPayrollSnapshot(input);
  assert.equal(input.employees[0].inputs.find(i => i.key === 'addition').value, '20.00000000');
  assert.equal(input.employees[1].inputs.find(i => i.key === 'addition').value, '0.00000000');
  assert.equal(snapshot.result.rows.length, 12); assert.equal(snapshot.result.municipalApprovalVerified, false);
  assert.ok(!JSON.stringify(input).includes('employeeName')); assert.ok(!JSON.stringify(input).includes('observation'));
});
test('601 contratos completos calculan el último; búsqueda no define población', () => { const source = approvedSources(601), input = prepareOwnPayrollInput(source), result = createOwnPayrollSnapshot(input).result; assert.equal(result.employeeTotals.length, 601); assert.equal(result.rows.length, 3606); assert.ok(result.rows.some(r => r.contractId === uid(601))); });
for (const [label, change, code] of [
  ['programa pendiente', s => s.programState.program = { ...s.programState.program, revision: 0, definition: null, salaryVersion: null, proposalId: null, approvalId: null }, 'PROGRAM_APPROVAL_REQUIRED'],
  ['catálogo cambiado', s => s.programState.salaryCatalog.version = hash('f'), 'PROGRAM_APPROVAL_REQUIRED'],
  ['población incompleta', s => s.population.complete = false, 'POPULATION_INCOMPLETE'],
  ['novedades incompletas', s => s.monthly.complete = false, 'SOURCE_INCOMPLETE'],
  ['identidad cambiada', s => s.population.employees[0].identityToken = hash('f'), 'SOURCE_IDENTITY_CHANGED'],
  ['origen antiguo', s => s.population.employees[0].origin = 'GRH', 'POPULATION_INVALID'],
  ['contrato repetido', s => s.population.employees.push({ ...s.population.employees[0] }), 'POPULATION_INVALID'],
  ['lote duplicado', s => s.monthly.batches.push(structuredClone(s.monthly.batches[0])), 'SOURCE_SCOPE_INVALID'],
  ['importe ausente', s => { s.monthly.batches[0].rows[0].amountCents = null; s.monthly.batches[0].rows[0].quantityDecimal = '1'; }, 'SOURCE_VALUE_MISSING'],
  ['parámetro ausente', s => s.programState.salaryCatalog.items.find(x => x.code === '8800').value = null, 'SOURCE_DEFINITION_MISSING'],
  ['ajuste anterior sin regla', s => s.monthly.batches[0].rows[0].adjustmentMonth = '2026-09-01', 'RETROACTIVE_RULE_REQUIRED'],
  ['modo forzado sin regla', s => { s.monthly.batches[0].rows[0].forced = true; s.monthly.batches[0].rows[0].observation = 'Justificación inventada QA'; }, 'FORCED_RULE_REQUIRED'],
  ['concepto sin tratamiento', s => s.monthly.batches[0].rows[0].conceptSourceId = '999999999', 'SOURCE_UNUSED'],
]) test('bloquea ' + label + ' sin cálculo parcial', () => { const source = approvedSources(); change(source); assert.throws(() => prepareOwnPayrollInput(source), e => e.code === code); });
test('sumar varias novedades requiere decisión expresa; no se supone que son únicas', () => {
  const source = approvedSources(), second = structuredClone(source.monthly.batches[0]); second.id = uid(201); second.rows[0].amountCents = '25'; source.monthly.batches.push(second);
  assert.equal(prepareOwnPayrollInput(source).employees[0].inputs.find(i => i.key === 'addition').value, '20.25000000');
  source.programState.program.definition.bindings.find(b => b.key === 'addition').combine = 'single'; assert.throws(() => prepareOwnPayrollInput(source), e => e.code === 'SOURCE_AMBIGUOUS');
});
test('escala exige clase exacta; no toma el valor de otra categoría', () => {
  const source = approvedSources(), binding = source.programState.program.definition.bindings.find(b => b.key === 'base'); binding.sourceKind = 'scale';
  Object.assign(source.programState.salaryCatalog.items.find(x => x.code === '8800'), { kind: 'scale', categoryCode: '6', nature: null });
  assert.equal(prepareOwnPayrollInput(source).employees[0].inputs.find(i => i.key === 'base').value, '100.10000000');
  source.population.employees[1].categoryCode = '7'; assert.throws(() => prepareOwnPayrollInput(source), e => e.code === 'SOURCE_VALUE_MISSING');
});
test('novedades fijas conservan aprobación e identidad y bloquean prorrateo implícito', () => {
  const source = approvedSources(); source.programState.program.definition.bindings.find(b => b.key === 'addition').sourceKind = 'fixed_amount';
  const row = fixedApprovedRecord(1, { conceptSourceId: '120', quantityDecimal: null, amountCents: '225', validFrom: '2026-10-01', validTo: null }); row.subject = structuredClone(source.monthly.batches[0].rows[0].subject);
  source.monthly.batches = []; source.fixed.list.data.rows = [row]; source.fixed.list.data.total = 1;
  source.fixed.export.data.rows = [{ recordId: row.id, version: row.version, proposalId: row.approved.id, subject: row.subject, values: row.approved.values }]; source.fixed.export.data.total = 1;
  assert.equal(prepareOwnPayrollInput(source).employees[0].inputs.find(i => i.key === 'addition').value, '2.25000000');
  row.approved.values.validFrom = '2026-10-15'; assert.throws(() => prepareOwnPayrollInput(source), e => e.code === 'PRORATION_REQUIRED');
  row.approved.values.validFrom = '2026-10-01'; row.identityCurrent = false; assert.throws(() => prepareOwnPayrollInput(source));
});
