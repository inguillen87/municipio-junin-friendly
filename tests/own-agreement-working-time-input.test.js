import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
import { ownRunHash } from '../lib/internal-own-payroll-run.js';
import { ownProgramHistory } from '../assets/own-payroll-program-model.js';
import { auxiliarySources } from './fixtures/own-payroll-auxiliary-synthetic.js';
import { row } from './fixtures/native-salary-synthetic.js';
import { rule, policy } from './fixtures/own-payroll-synthetic.js';
import { hash, uid } from './fixtures/own-payroll-program-synthetic.js';

function seal(s) {
 s.workingTime.version = ownRunHash(['own-contract-working-time.v1', s.period, s.workingTime.records]);
 s.agreementWorkingTime.version = ownRunHash(['own-agreement-working-time.v1', s.period, s.agreementWorkingTime.records]);
 s.population.version = ownRunHash({employees:s.population.employees, workingTime:s.workingTime, agreementWorkingTime:s.agreementWorkingTime}); return s;
}
function source(count = 37) {
 const s = auxiliarySources(count), p = s.programState.program.definition;
 p.workingTimeVersion = 'own-contract-working-time.v1'; p.agreementWorkingTimeVersion = 'own-agreement-working-time.v1';
 for (const [code,key,sourceKind] of [['991','contractHours','working_time_fact'],['992','agreementHours','agreement_time_fact']]) {
  s.programState.salaryCatalog.items.push(row({kind:'auxiliary', code, nature:'auxiliary', unit:'hours'}));
  p.rules.push(rule(code, {op:'input', key, unit:'hours'}, {nature:'auxiliary', unit:'hours', rounding:policy('exact',8)}));
  p.bindings.push({agreementCode:'1', key, unit:'hours', sourceKind, sourceField:'monthlyHours', onMissing:'error', combine:'single', ruleReference:'Fuente de horas exclusivamente sintética QA'});
 }
 const basic = p.rules.find(r => r.code === '95');
 basic.expression = {op:'multiply', left:{op:'auxiliary', code:'88', stage:'exact'}, right:{op:'divide', left:{op:'input', key:'contractHours', unit:'hours'}, right:{op:'input', key:'agreementHours', unit:'hours'}}};
 basic.rounding = policy('exact',3); p.totalsPrecision = 3;
 s.workingTime = {complete:true, version:hash('a'), records:s.population.employees.map((e,i) => ({contractId:e.contractId, identityToken:e.identityToken, configuration:{version:hash('a'), revision:1, proposalId:uid(500 + i), approvalId:uid(600 + i), identityToken:e.identityToken, definition:{dailyHours:null, monthlyHours:'80.125', asOfDate:'2026-10-01', documentReference:'Contrato exclusivamente sintético QA'}}}))};
 s.agreementWorkingTime = {complete:true, version:hash('a'), records:[{agreementCode:'1', agreementToken:hash('b'), revision:1, definition:{monthlyHours:'160.250', asOfDate:'2026-10-01', documentReference:'Convenio exclusivamente sintético QA'}, approvalId:uid(9000), approvedAgreementToken:hash('b')}]};
 return seal(s);
}

test('a native synthetic basic uses separate approved contract and agreement hours with exact fractional cents', () => {
 const s = source(855), input = prepareOwnPayrollInput(s), result = createOwnPayrollSnapshot(input).result;
 assert.equal(input.employees.length, 855); assert.equal(result.employeeCount, 855);
 assert.ok(result.rows.filter(r => r.conceptCode === '95').every(r => r.amount === '50.055'));
 assert.equal(result.employeeTotals.at(-1).net, '57.345');
 const last = input.employees.at(-1).inputs;
 assert.equal(last.find(r => r.key === 'contractHours').value, '80.12500000');
 assert.equal(last.find(r => r.key === 'agreementHours').value, '160.25000000');
 assert.ok(last.find(r => r.key === 'agreementHours').sourceReference.includes('Horas del convenio'));
 assert.notEqual(last.find(r => r.key === 'contractHours').sourceReference, last.find(r => r.key === 'agreementHours').sourceReference);
 assert.equal(s.agreementWorkingTime.records.length, 1); assert.equal(result.paymentExecuted, false);
});

for (const [label, mutate] of [
 ['missing complete agreement source', s => delete s.agreementWorkingTime],
 ['missing selected agreement', s => s.agreementWorkingTime.records.pop()],
 ['duplicate agreement', s => s.agreementWorkingTime.records.push(s.agreementWorkingTime.records[0])],
 ['unapproved hours', s => Object.assign(s.agreementWorkingTime.records[0], {revision:0, definition:null, approvalId:null, approvedAgreementToken:null})],
 ['unknown hours', s => s.agreementWorkingTime.records[0].definition.monthlyHours = null],
 ['changed agreement identity', s => s.agreementWorkingTime.records[0].approvedAgreementToken = hash('f')],
 ['implicit conversion to days', s => s.programState.program.definition.bindings.at(-1).unit = 'days'],
 ['missing hours silently zero', s => s.programState.program.definition.bindings.at(-1).onMissing = 'zero'],
 ['summing an agreement fact', s => s.programState.program.definition.bindings.at(-1).combine = 'sum'],
 ['missing explicit agreement source version', s => delete s.programState.program.definition.agreementWorkingTimeVersion],
 ['contract field substituted into agreement', s => s.programState.program.definition.bindings.at(-1).sourceField = 'dailyHours'],
]) test(label + ' refuses the complete payroll instead of dropping employees or inventing values', () => {
 const s = source(); mutate(s); assert.throws(() => prepareOwnPayrollInput(s));
});

test('agreement zero is captured as zero and a synthetic division by zero is explicitly refused', () => {
 const s = source(1); s.agreementWorkingTime.records[0].definition.monthlyHours = '0';
 const input = prepareOwnPayrollInput(seal(s)); assert.equal(input.employees[0].inputs.find(r => r.key === 'agreementHours').value, '0.00000000');
 assert.throws(() => createOwnPayrollSnapshot(input), e => e.code === 'DIVISION_BY_ZERO');
});

test('changed documentary agreement hours require a new complete fingerprint without rewriting prior input', () => {
 const s = source(1), old = prepareOwnPayrollInput(s);
 s.agreementWorkingTime.records[0].definition.monthlyHours = '80.125';
 assert.throws(() => prepareOwnPayrollInput(s), e => e.code === 'SOURCE_VERSION_INVALID');
 const next = prepareOwnPayrollInput(seal(s)); assert.notEqual(next.sourceVersions.population, old.sourceVersions.population);
 assert.equal(old.employees[0].inputs.find(r => r.key === 'agreementHours').value, '160.25000000');
 assert.equal(createOwnPayrollSnapshot(next).result.rows.find(r => r.conceptCode === '95').amount, '100.110');
});

test('earlier approved programs retain their exact input and reject unsolicited agreement hours', () => {
 const s = auxiliarySources(1), old = prepareOwnPayrollInput(s); s.agreementWorkingTime = source(1).agreementWorkingTime;
 assert.throws(() => prepareOwnPayrollInput(s)); delete s.agreementWorkingTime; assert.deepEqual(prepareOwnPayrollInput(s), old);
 const before = source(1).programState.program.definition, after = structuredClone(before); delete after.agreementWorkingTimeVersion;
 assert.throws(() => ownProgramHistory(before, after), e => e.code === 'PROGRAM_HISTORY_REQUIRED');
});
