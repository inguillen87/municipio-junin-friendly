import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SUMMARY_FIELDS, salarySummaryModel, verifySalarySummarySnapshot} from '../assets/payroll-summary-model.js';
import {createPayrollSummaryPdf} from '../assets/payroll-summary-pdf.js';
import {syntheticEmployee, syntheticSummaries} from '../scripts/payroll-summary-synthetic.mjs';
const [missing,complete,mismatch]=syntheticSummaries();
const employee=syntheticEmployee;

test('real DTO uses nombre only: the reported document failure is covered',()=>{
  assert.equal(employee.name,undefined);
  const result=salarySummaryModel(employee,missing);
  assert.equal(result.name,employee.nombre);assert.equal(result.legajo,'0057');
  assert.equal(result.values.nonSubjectEarnings,'No informado');assert.equal(result.matches,null);assert.equal(result.difference,null);
  assert.equal(result.reconciliationStatus,'not_evaluable');
  assert.ok(createPayrollSummaryPdf(employee,missing).byteLength>1000);
});
for(const alias of ['name','fullName','full_name'])test('retains explicit identity alias '+alias,()=>{
  assert.equal(salarySummaryModel({[alias]:'PERSONA QA',legajo:57},complete).name,'PERSONA QA');
});
for(const field of Object.keys(SUMMARY_FIELDS))test('missing amount is labelled, never coerced to zero: '+field,()=>{
  const result=salarySummaryModel(employee,{...complete,[field]:null});
  assert.equal(result.values[field],'No informado');assert.ok(result.missingFields.includes(field));
  assert.equal(result.matches,field==='employerContributions'?true:null);
});
test('missing undefined values also remain unknown',()=>{const row={...complete};delete row.familyAllowance;assert.equal(salarySummaryModel(employee,row).matches,null)});
test('explicit zero is distinct from missing; complete source reconciles',()=>{
  const result=salarySummaryModel(employee,complete);assert.equal(result.values.nonSubjectEarnings,'$ 0,00');assert.equal(result.matches,true);assert.equal(result.difference,'$ 0,00');
});
test('arithmetic difference is preserved without changing source',()=>{
  const result=salarySummaryModel(employee,mismatch);assert.equal(result.matches,false);assert.equal(result.difference,'$ 0,02');
});
for(const value of ['', '1000', '1.000,00', '1e3', {}, 1000, 'NaN', 'Infinity'])test('malformed populated value is not treated as unknown: '+JSON.stringify(value),()=>{
  assert.throws(()=>salarySummaryModel(employee,{...complete,subjectEarnings:value}),/haberes remunerativos.*formato inválido/);
});
test('absent identity has a useful error, no invented name',()=>assert.throws(()=>salarySummaryModel({legajo:'0057'},complete),/nombre/));
test('numeric legajo accepted; unsafe or malformed identifiers rejected',()=>{
  assert.equal(salarySummaryModel({...employee,legajo:57},complete).legajo,'57');
  for(const legajo of [Number.MAX_SAFE_INTEGER+1,'../57',-1,{},true])assert.throws(()=>salarySummaryModel({...employee,legajo},complete));
});
test('no source amounts means no meaningless summary',()=>{
  assert.throws(()=>salarySummaryModel(employee,{...complete,...Object.fromEntries(Object.keys(SUMMARY_FIELDS).map(k=>[k,null]))}),/no tiene importes/);
});
test('model and PDF never mutate source DTOs',()=>{
  const row=Object.freeze({...missing}),person=Object.freeze({...employee}),before=JSON.stringify([row,person]);
  createPayrollSummaryPdf(person,row);assert.equal(JSON.stringify([row,person]),before);
});
test('fresh read must contain exactly the selected source row',()=>{
  const payload={ok:true,data:{items:[complete,missing]}};assert.equal(verifySalarySummarySnapshot(employee,missing,payload),missing);
  for(const items of [[],[complete],[missing,missing]])assert.throws(()=>verifySalarySummarySnapshot(employee,missing,{ok:true,data:{items}}));
});
for(const [key,value] of [['netPayable','940.00'],['nonSubjectEarnings','0.00'],['sourceCutoff','2026-09-10'],['presentationStatus','closed_reconciled'],['distinctConcepts',24]])test('source change stops download: '+key,()=>{
  assert.throws(()=>verifySalarySummarySnapshot(employee,missing,{ok:true,data:{items:[{...missing,[key]:value}]}}),/cambiaron/);
});
test('malformed fresh envelope rejected',()=>assert.throws(()=>verifySalarySummarySnapshot(employee,missing,{ok:true,data:{}}),/verificar/));
test('long names, large exact amounts and civil dates render without truncating the model',()=>{
  const person={nombre:'W'.repeat(150),legajo:'0000057'};
  const row={...complete,payrollDate:'2026-07-31T23:00:00-03:00',netPayable:'9007199254740993.02'};
  assert.equal(salarySummaryModel(person,row).name.length,150);assert.equal(salarySummaryModel(person,row).date,'2026-07-31');
  assert.ok(createPayrollSummaryPdf(person,row).byteLength>1000);
});
test('UI passes actual employee and rereads the page; test no longer invents name',()=>{
  const source=fs.readFileSync('internal-dashboard.html','utf8');
  assert.match(source,/module.downloadPayrollSummary\(employee,fresh\)/);assert.doesNotMatch(source,/downloadPayrollSummary\(\{name:employee.name/);
  assert.match(source,/requestJSON\(DATA_URL\+'\?'\+payrollQuery/);
  assert.doesNotMatch(fs.readFileSync('scripts/verify-document-library-legajo.mjs','utf8'),/name:'AGENTE QA 01'/);
});
