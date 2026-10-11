import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
import { ownProgramDefinition, ownProgramHistory } from '../assets/own-payroll-program-model.js';
import { auxiliarySources } from './fixtures/own-payroll-auxiliary-synthetic.js';
import { row } from './fixtures/native-salary-synthetic.js';
import { rule, policy } from './fixtures/own-payroll-synthetic.js';
import { hash, uid } from './fixtures/own-payroll-program-synthetic.js';
import { ownRunHash } from '../lib/internal-own-payroll-run.js';
function seal(s){s.employmentFacts.version=ownRunHash(['own-salary-seniority.v1',s.period,s.employmentFacts.records]);s.population.version=ownRunHash({employees:s.population.employees,employmentFacts:s.employmentFacts});return s;}
function source(count = 37) {
 const s = auxiliarySources(count), p = s.programState.program.definition;
 s.programState.salaryCatalog.items.push(row({ kind: 'auxiliary', code: '991', nature: 'auxiliary', unit: 'units' }));
 p.employmentFactsVersion = 'own-salary-seniority.v1';
 p.rules.push(rule('991', { op: 'input', key: 'recognizedYears', unit: 'units' }, { nature: 'auxiliary', unit: 'units', rounding: policy('exact') }));
 p.bindings.push({ agreementCode: '1', key: 'recognizedYears', unit: 'units', sourceKind: 'employment_fact', sourceField: 'seniorityYears', onMissing: 'error', combine: 'single', ruleReference: 'Conteo reconocido exclusivamente sintético' });
 s.employmentFacts = { complete: true, version: hash('a'), records: s.population.employees.map((e, i) => ({ contractId: e.contractId, identityToken: e.identityToken, configuration: { version: hash('a'), revision: 1, proposalId: uid(500 + i), approvalId: uid(600 + i), identityToken: e.identityToken, definition: { years: String(i), months: null, asOfDate: '2026-10-01', documentReference: 'Constancia sintética de antigüedad' } } })) };
 return seal(s);
}
test('complete native-only population captures declared zero and all later pages; auxiliaries do not enter salary totals', () => {
 const s = source(), input = prepareOwnPayrollInput(s), result = createOwnPayrollSnapshot(input).result;
 assert.equal(input.employees.length, 37); assert.equal(input.employees[36].inputs.find(i => i.key === 'recognizedYears').value, '36.00000000');
 assert.equal(input.employees[0].inputs.find(i => i.key === 'recognizedYears').value, '0.00000000');
 assert.equal(result.employeeCount, 37); assert.ok(result.employeeTotals.every(t => t.net === '114.69'));
 assert.ok(input.employees[0].inputs.some(i => i.sourceReference.includes('Antigüedad propia') && i.sourceReference.includes('2026-10-01')));
 assert.ok(!JSON.stringify(input).includes('employeeName'));
});
for (const [label, mutate] of [
 ['missing complete source', s => delete s.employmentFacts],
 ['missing employee on a later page', s => s.employmentFacts.records.pop()],
 ['unapproved fact', s => Object.assign(s.employmentFacts.records[36].configuration, { revision: 0, definition: null, proposalId: null, approvalId: null, identityToken: null })],
 ['null years', s => s.employmentFacts.records[36].configuration.definition.years = null],
 ['changed identity', s => s.employmentFacts.records[36].identityToken = hash('f')],
 ['unapproved field', s => s.programState.program.definition.bindings.at(-1).sourceField = 'hireDate'],
 ['money unit', s => s.programState.program.definition.bindings.at(-1).unit = 'money'],
 ['absence converted to zero', s => s.programState.program.definition.bindings.at(-1).onMissing = 'zero'],
 ['implicit source version', s => delete s.programState.program.definition.employmentFactsVersion],
 ['ambiguous old namespace', s => delete s.programState.program.definition.namespaceVersion],
]) test(label + ' blocks the entire payroll', () => { const s = source(); mutate(s); assert.throws(() => prepareOwnPayrollInput(s)); });
test('months remain an independent declared component, without years conversion or annual aging', () => {
 const s = source(1), b = s.programState.program.definition.bindings.at(-1);
 b.sourceField = 'seniorityMonths'; s.employmentFacts.records[0].configuration.definition = { years: '8', months: '11', asOfDate: '2025-01-01', documentReference: 'Constancia sintética de componente' };
 assert.equal(prepareOwnPayrollInput(seal(s)).employees[0].inputs.find(i => i.key === 'recognizedYears').value, '11.00000000');
});
test('maximum documentary reference stays whole in the capture and never exceeds bounded engine provenance', () => {
 const s=source(1);s.employmentFacts.records[0].configuration.definition.documentReference='Constancia '+ 'x'.repeat(169);
 const input=prepareOwnPayrollInput(seal(s));assert.equal(s.employmentFacts.records[0].configuration.definition.documentReference.length,180);
 assert.ok(input.employees[0].inputs.find(i=>i.key==='recognizedYears').sourceReference.length<=180);
});
test('population version includes approved facts and corruption cannot masquerade as another immutable source',()=>{
 const s=source(1),old=prepareOwnPayrollInput(s);s.employmentFacts.records[0].configuration.definition.years='9';
 assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_VERSION_INVALID');
 const next=prepareOwnPayrollInput(seal(s));assert.notEqual(old.sourceVersions.population,next.sourceVersions.population);assert.equal(old.employees[0].inputs.find(i=>i.key==='recognizedYears').value,'0.00000000');
});
test('old programs reject unsolicited facts and keep their exact program shape; explicit version cannot be downgraded', () => {
 const s = auxiliarySources(), p = structuredClone(s.programState.program.definition), old = prepareOwnPayrollInput(s);
 assert.deepEqual(ownProgramDefinition(p, s.programState.salaryCatalog.items), p);
 s.employmentFacts = source(1).employmentFacts; assert.throws(() => prepareOwnPayrollInput(s));
 delete s.employmentFacts; assert.deepEqual(prepareOwnPayrollInput(s), old);
 const next = source(1).programState.program.definition, down = structuredClone(next); delete down.employmentFactsVersion;
 assert.throws(() => ownProgramHistory(next, down), e => e.code === 'PROGRAM_HISTORY_REQUIRED');
});
