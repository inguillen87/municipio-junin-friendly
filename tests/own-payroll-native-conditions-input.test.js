import test from 'node:test';import assert from 'node:assert/strict';
import {nativeSources,sealNativeSources} from './fixtures/own-native-salary-conditions-synthetic.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownProgramHistory,ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {programWorkspaceChanges} from '../assets/own-payroll-program-workspace-model.js';
import {conditionSources} from './fixtures/own-payroll-conditions-synthetic.js';
test('native booleans remain match values and days keep eight exact decimals through actual producer and engine',()=>{
 const s=nativeSources(),input=prepareOwnPayrollInput(s),first=input.employees[0],values=Object.fromEntries(first.inputs.map(i=>[i.key,i]));
 assert.equal(input.salaryConditionsVersion,'own-contract-salary-conditions.v2');assert.equal(values.teacherPayEnabled.value,true);assert.equal(values.housingHigherDedicationPayEnabled.value,false);assert.equal(values.payrollMonthBaseDays.value,'30.00000001');
 assert.ok(values.teacherPayEnabled.sourceReference.includes(s.salaryConditions.records[0].approvalId));assert.ok(values.titleCode.sourceReference.includes(s.salaryConditions.legacy.records[0].approvalId));assert.ok(values.titleCode.sourceReference.includes(s.salaryConditions.legacy.version));
 const result=createOwnPayrollSnapshot(input).result;assert.equal(result.rows.find(r=>r.conceptCode==='901').amount,'1.12500000');assert.equal(result.rows.find(r=>r.conceptCode==='902').amount,'0.00000000');assert.equal(result.rows.find(r=>r.conceptCode==='903').amount,'30.00000001');
});
for(const [name,change] of [
 ['legacy pin',s=>s.salaryConditions.legacy.version='f'.repeat(64)],['joint pin',s=>s.salaryConditions.version='f'.repeat(64)],['native code under V1',s=>s.programState.program.definition.salaryConditionsVersion='own-contract-salary-conditions.v1'],
 ['numeric boolean',s=>s.salaryConditions.records[0].definition.teacherPayEnabled=1],['inferred month days',s=>s.salaryConditions.records[0].definition.payrollMonthBaseDays=30],['decimal unit for boolean',s=>s.programState.program.definition.bindings.find(b=>b.key==='teacherPayEnabled').unit='units'],
 ['no native approval',s=>Object.assign(s.salaryConditions.records[0],{revision:0,definition:null,approvalId:null})]
])test('rejects '+name+' before producing a complete input',()=>{const s=nativeSources();change(s);assert.throws(()=>prepareOwnPayrollInput(s));});
test('approved null is preserved and only fails when its reviewed branch consumes it',()=>{
 const s=nativeSources();s.salaryConditions.records[0].definition.housingHigherDedicationPayEnabled=null;sealNativeSources(s);const input=prepareOwnPayrollInput(s);assert.equal(input.employees[0].inputs.find(x=>x.key==='housingHigherDedicationPayEnabled').value,null);assert.throws(()=>createOwnPayrollSnapshot(input));
 const r=s.programState.program.definition.rules.find(r=>r.code==='902');r.expression={op:'choose',condition:{op:'match',key:'teacherPayEnabled',type:'boolean',operator:'eq',value:true},then:{op:'literal',unit:'money',value:'0'},else:r.expression};const safe=createOwnPayrollSnapshot(prepareOwnPayrollInput(s));assert.ok(safe.result.employeeCount===2);
});
test('legacy remains equal and a V2 programme cannot downgrade while its opt-in difference remains reviewable',()=>{
 const before=conditionSources(1).programState.program.definition,after={...structuredClone(before),salaryConditionsVersion:'own-contract-salary-conditions.v2'};
 assert.doesNotThrow(()=>ownProgramHistory(before,after));assert.throws(()=>ownProgramHistory(after,before),e=>e.code==='PROGRAM_HISTORY_REQUIRED');
 const diff=programWorkspaceChanges(before,after);assert.deepEqual(diff.salaryConditionsVersion,{before:before.salaryConditionsVersion,after:after.salaryConditionsVersion});assert.equal(diff.changed,1);
 const source=conditionSources(1);assert.equal(ownProgramDefinition(source.programState.program.definition,source.programState.salaryCatalog.items).salaryConditionsVersion,'own-contract-salary-conditions.v1');assert.equal(prepareOwnPayrollInput(source).salaryConditionsVersion,'own-contract-salary-conditions.v1');
});
