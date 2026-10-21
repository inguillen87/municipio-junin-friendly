import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownNoveltyHash,verifyOwnNoveltyHashes} from '../lib/internal-own-payroll-novelties.js';
import {OWN_NOVELTY_SUCCESSION_BATCH} from '../assets/own-payroll-novelties-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {batch} from './fixtures/own-payroll-novelties-synthetic.js';
import {payrollInput,payrollId} from './fixtures/own-payroll-synthetic.js';

function sources(){
 const parent=batch(2),rows=parent.rows.map(row=>({...structuredClone(row),values:{...row.values,amountCents:'2500'}})),child={...structuredClone(parent),version:OWN_NOVELTY_SUCCESSION_BATCH,id:payrollId(29000),rows,rowsSha256:ownNoveltyHash(rows.map(({values,subject})=>({values,subject}))),supersedes:{batchId:parent.id,expectedRevision:parent.revision,rowsSha256:parent.rowsSha256,snapshotSha256:ownNoveltyHash(parent)},correctionReason:'Corrección inventada QA de veinte a veinticinco pesos; no es una regla municipal.'};
 verifyOwnNoveltyHashes(parent);verifyOwnNoveltyHashes(child);
 const before=approvedSources(2);before.monthly={complete:true,batches:[],nativeBatches:[parent]};const after=structuredClone(before);after.monthly.nativeBatches=[child];return {parent,child,before,after};
}
const addition=input=>input.employees.map(employee=>employee.inputs.find(row=>row.key==='addition').value);
const amounts=(snapshot,code)=>snapshot.result.rows.filter(row=>row.conceptCode===code).map(row=>row.amount);

test('approved successor source feeds25 instead of20 into real adapter and snapshot without rewriting old calculation',()=>{
 const {parent,child,before,after}=sources(),parentBytes=Buffer.from(salarySerialized(parent)),sourceBefore=salarySerialized(before),oldInput=prepareOwnPayrollInput(before),oldSnapshot=createOwnPayrollSnapshot(oldInput),oldBytes=Buffer.from(salarySerialized(oldSnapshot));
 assert.deepEqual(before.programState.program.definition.rules.find(rule=>rule.code==='120').expression,payrollInput().rules.find(rule=>rule.code==='120').expression);
 assert.deepEqual(addition(oldInput),['20.00000000','20.00000000']);assert.deepEqual(amounts(oldSnapshot,'120'),['20.00','20.00']);
 const newInput=prepareOwnPayrollInput(after),newSnapshot=createOwnPayrollSnapshot(newInput);
 assert.deepEqual(addition(newInput),['25.00000000','25.00000000']);assert.deepEqual(amounts(newSnapshot,'120'),['25.00','25.00']);assert.notEqual(newInput.sourceVersions.novelties,oldInput.sourceVersions.novelties);assert.notEqual(newSnapshot.inputSha256,oldSnapshot.inputSha256);assert.notEqual(newSnapshot.resultSha256,oldSnapshot.resultSha256);
 assert.equal(newInput.sourceVersions.population,oldInput.sourceVersions.population);assert.equal(newInput.sourceVersions.rules,oldInput.sourceVersions.rules);assert.deepEqual(after.programState,before.programState);assert.deepEqual(after.population,before.population);assert.deepEqual(newInput.rules,oldInput.rules);
 assert.deepEqual(newInput.employees.map(({contractId,employeeNumber,agreementCode,departmentCode})=>({contractId,employeeNumber,agreementCode,departmentCode})),oldInput.employees.map(({contractId,employeeNumber,agreementCode,departmentCode})=>({contractId,employeeNumber,agreementCode,departmentCode})));
 // These exact rates and rounding are declared by the existing invented QA
 // fixture. approvedSources uses parameter8800=100.10 for BOTH employees.
 assert.deepEqual(amounts(oldSnapshot,'210'),['3.98','3.98']);assert.deepEqual(amounts(newSnapshot,'210'),['4.13','4.13']);assert.deepEqual(oldSnapshot.result.employeeTotals.map(row=>({gross:row.gross,net:row.net})),[{gross:'132.61',net:'128.63'},{gross:'132.61',net:'128.63'}]);assert.deepEqual(newSnapshot.result.employeeTotals.map(row=>({gross:row.gross,net:row.net})),[{gross:'137.61',net:'133.48'},{gross:'137.61',net:'133.48'}]);
 assert.equal(Buffer.compare(parentBytes,Buffer.from(salarySerialized(parent))),0);assert.equal(salarySerialized(before),sourceBefore);assert.equal(Buffer.compare(oldBytes,Buffer.from(salarySerialized(oldSnapshot))),0);assert.deepEqual(createOwnPayrollSnapshot(oldSnapshot.input),oldSnapshot);assert.equal(child.supersedes.snapshotSha256,ownNoveltyHash(parent));
 assert.equal(newSnapshot.result.municipalApprovalVerified,false);assert.equal(newSnapshot.result.paymentExecuted,false);
});

test('ancestor and approved replacement together fail in either order instead of silently summing45; independent sum remains explicit',()=>{
 const {parent,child,before,after}=sources();assert.deepEqual(addition(prepareOwnPayrollInput(before)),['20.00000000','20.00000000']);assert.deepEqual(addition(prepareOwnPayrollInput(after)),['25.00000000','25.00000000']);
 assert.equal(before.programState.program.definition.bindings.find(binding=>binding.key==='addition').combine,'sum');
 for(const nativeBatches of [[parent,child],[child,parent]]){const ambiguous=structuredClone(before);ambiguous.monthly.nativeBatches=structuredClone(nativeBatches);assert.throws(()=>prepareOwnPayrollInput(ambiguous),error=>error.code==='SOURCE_SUPERSEDED');}
 // Preserve the adapter's existing, explicitly approved sum behavior for
 // independent legacy fixture sources; the new guard is about lineage only.
 const unrelated=approvedSources(2),second=structuredClone(unrelated.monthly.batches[0]);second.id=payrollId(201);second.rows[0].amountCents='25';unrelated.monthly.batches.push(second);assert.equal(addition(prepareOwnPayrollInput(unrelated))[0],'20.25000000');
});
