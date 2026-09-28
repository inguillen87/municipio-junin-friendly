import test from 'node:test';import assert from 'node:assert/strict';
import {capturePayrollDetailSelection,verifyPayrollDetailSelection} from '../assets/payroll-detail-selection.js';
import {syntheticDetail} from '../scripts/payroll-detail-synthetic.mjs';
const item=(overrides={})=>({datasetId:syntheticDetail().datasetId,payrollDate:'2026-07-31',payrollType:'M',sourcePeriod:2026,sourceMonth:7,...overrides});
const check=(data=syntheticDetail(),selected=item())=>verifyPayrollDetailSelection(data,capturePayrollDetailSelection(selected));
test('accepts the selected run without rewriting source values',()=>{const data=syntheticDetail(),before=JSON.stringify(data);assert.equal(check(data),data);assert.equal(JSON.stringify(data),before);});
test('captures immutable selection rather than retaining the live object',()=>{const value=item(),selected=capturePayrollDetailSelection(value);value.payrollType='V';value.sourceMonth=8;assert.ok(Object.isFrozen(selected));assert.equal(verifyPayrollDetailSelection(syntheticDetail(),selected).payrollType,'M');});
for(const [key,value]of [['payrollDate','2026-07-30'],['payrollType','V'],['sourcePeriod',2025],['sourceMonth',8]])test('same dataset cannot hide a different '+key,()=>{
 assert.throws(()=>check({...syntheticDetail(),[key]:value}),{code:'DETAIL_SELECTION_CHANGED'});
});
test('historic summary without a dataset still pins date, period and type',()=>{
 const selected=item();delete selected.datasetId;assert.ok(check(syntheticDetail(),selected));
 assert.throws(()=>check({...syntheticDetail(),sourceMonth:8},selected),{code:'DETAIL_SELECTION_CHANGED'});
});
test('wrong dataset retains the existing source-version explanation',()=>{
 assert.throws(()=>check({...syntheticDetail(),datasetId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'}),{code:'DETAIL_DATASET_CHANGED'});
});
for(const d of [null,{}, {datasetId:'bad'}, {datasetId:null}])test('unidentified reply is rejected '+JSON.stringify(d),()=>assert.throws(()=>check(d),{code:'DETAIL_SELECTION_CHANGED'}));
for(const [key,value]of [['payrollDate','2026-02-30'],['payrollDate','2026-07-31junk'],['payrollDate','2026-07-31T99:00:00Z'],['sourcePeriod',null],['sourcePeriod',true],['sourcePeriod',2026.5],['sourcePeriod','2026x'],['sourcePeriod',1800],['sourcePeriod',2101],['sourceMonth',null],['sourceMonth',true],['sourceMonth',0],['sourceMonth',13],['sourceMonth','7.0'],['payrollType','Monthly'],['payrollType','m'],['payrollType',null],['datasetId','bad']])test('invalid selection is refused '+key+' '+String(value),()=>{
 assert.throws(()=>capturePayrollDetailSelection(item({[key]:value})),{code:'DETAIL_SELECTION_INVALID'});
});
test('calendar day keeps source timezone rather than shifting to the next month',()=>{
 const selected=capturePayrollDetailSelection(item({payrollDate:'2026-07-31T23:30:00-03:00'}));assert.equal(selected.date,'2026-07-31');assert.ok(verifyPayrollDetailSelection(syntheticDetail(),selected));
});
test('canonical source integers can be represented as strings in the selection',()=>{
 assert.ok(check(syntheticDetail(),item({sourcePeriod:'2026',sourceMonth:'7'})));
});
test('an adjustment period is compared literally, not inferred from payroll date',()=>{
 const selected=item({sourceMonth:6});assert.ok(check({...syntheticDetail(),sourceMonth:6},selected));
});
for(const value of [null,undefined,{},item(),{date:'2026-07-31',period:2026,month:7,type:'M'}])test('unverified selection cannot authorize the reader',()=>{
 assert.throws(()=>verifyPayrollDetailSelection(syntheticDetail(),value),{code:'DETAIL_SELECTION_INVALID'});
});
test('diagnostic never includes a malicious or private response value',()=>{
 try{check({...syntheticDetail(),payrollType:'PRIVATE_SQL_ERROR'});assert.fail('Must reject');}catch(error){assert.doesNotMatch(error.message,/PRIVATE_SQL_ERROR|SELECT|postgres|http/);}
});
