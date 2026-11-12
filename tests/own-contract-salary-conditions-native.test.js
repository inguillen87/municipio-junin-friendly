import test from 'node:test';import assert from 'node:assert/strict';
import {salaryNativeDefinition,salaryNativeBootstrap,salaryNativeDraft,salaryNativeCommand,salaryNativeDetail,salaryNativeReceipt,prepareSalaryNative,decideSalaryNative,salaryNativeCapture} from '../assets/own-contract-salary-conditions-native-model.js';
import {salaryConditionsDefinition} from '../assets/own-contract-salary-conditions-model.js';
import {nativeDefinition,nativeBootstrap,nativeCommand,nativeDetail,nativeReceipt,nativeSources,id} from './fixtures/own-native-salary-conditions-synthetic.js';
test('three explicit fields retain null, false and exact zero as distinct declarations',()=>{
 for(const values of [{teacherPayEnabled:null,housingHigherDedicationPayEnabled:false,payrollMonthBaseDays:'0'},{teacherPayEnabled:true,housingHigherDedicationPayEnabled:null,payrollMonthBaseDays:'999999999999999999.12345678'}]){const d={...nativeDefinition(),...values};assert.deepEqual(salaryNativeDefinition(d,'2026-10'),d);}
 assert.throws(()=>salaryConditionsDefinition(nativeDefinition(),'2026-10'));
});
for(const [name,change] of [
 ['numeric boolean',d=>d.teacherPayEnabled=1],['numeric false',d=>d.housingHigherDedicationPayEnabled=0],['text boolean',d=>d.teacherPayEnabled='false'],
 ['numeric days',d=>d.payrollMonthBaseDays=30],['negative days',d=>d.payrollMonthBaseDays='-1'],['rounded days',d=>d.payrollMonthBaseDays='30.123456789'],['comma days',d=>d.payrollMonthBaseDays='30,5'],
 ['no evidence',d=>d.documentReference=''],['future evidence',d=>d.asOfDate='2026-11-01'],['invented L147',d=>d.L147='1']
])test(name+' is rejected without inference',()=>{const d=nativeDefinition();change(d);assert.throws(()=>salaryNativeDefinition(d,'2026-10'));});
test('two selected contracts out of 848 can prepare without filling the remaining roster',()=>{
 const b=salaryNativeBootstrap(nativeBootstrap()),draft=salaryNativeDraft(b);assert.equal(draft.length,2);assert.equal(draft[1].contractId,id(848));assert.equal(draft[1].definition.payrollMonthBaseDays,null);assert.equal(draft[1].definition.asOfDate,'');
 draft.forEach(r=>Object.assign(r.definition,nativeDefinition()));draft[0].definition.teacherPayEnabled=false;
 const body=prepareSalaryNative(b,draft,'Dos constancias exclusivamente sintéticas');assert.deepEqual(body.contractIds,b.contractIds);assert.equal(body.items.length,2);assert.equal(body.reviewConfirmed,false);assert.equal(body.items[0].definition.teacherPayEnabled,false);
});
for(const [name,change] of [['unsorted',b=>b.contractIds.reverse()],['repeated',b=>b.contractIds=[b.contractIds[0],b.contractIds[0]]],['missing item',b=>b.items.pop()],['extra field',b=>b.L18=30],['self confirmed',b=>b.reviewConfirmed=true]])test('command rejects '+name,()=>{const b=nativeCommand();change(b);assert.throws(()=>salaryNativeCommand(b));});
test('one distinct reviewer decides the complete immutable selection',async()=>{
 const d=await nativeDetail();assert.equal((await salaryNativeDetail(d)).body.items.length,2);const body=await decideSalaryNative(d,'approve','Revisión sintética de las dos constancias');assert.equal(body.reviewConfirmed,true);assert.equal(body.items,null);assert.deepEqual(body.contractIds,d.contractIds);
 d.proposal.canReview=false;await assert.rejects(()=>decideSalaryNative(d,'approve','Revisión sintética de las dos constancias'),e=>e.code==='SALARY_CONDITIONS_INDEPENDENT_REQUIRED');
});
test('a changed selected source blocks approval but still allows rejection',async()=>{
 const d=await nativeDetail();d.current=false;await assert.rejects(()=>decideSalaryNative(d,'approve','Revisión sintética de las dos constancias'),e=>e.code==='SALARY_CONDITIONS_BASE_CHANGED');assert.equal((await decideSalaryNative(d,'reject','La fuente de esta selección cambió')).command,'reject');
});
test('changed body or recovered attempt never borrows another proposal identity',async()=>{
 const d=await nativeDetail();d.body.items[1].definition.teacherPayEnabled=false;await assert.rejects(()=>salaryNativeDetail(d));const r=await nativeReceipt();assert.deepEqual(await salaryNativeReceipt(r,{key:r.requestKey,body:r.body}),r);await assert.rejects(()=>salaryNativeReceipt(r,{key:id(11003),body:r.body}));
});
test('joint capture carries two independent approval sources without extending V1',()=>{
 const s=nativeSources(),c=salaryNativeCapture(s.salaryConditions,s.population.employees,s.period);assert.notEqual(c.records[0].approvalId,c.legacy.records[0].approvalId);assert.equal(Object.hasOwn(c.legacy.records[0].definition,'teacherPayEnabled'),false);
 const bad=structuredClone(c);bad.records[1].identityToken='f'.repeat(64);assert.throws(()=>salaryNativeCapture(bad,s.population.employees,s.period));
});
