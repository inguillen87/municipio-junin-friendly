import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNoeliaClassifiedPlanillaCsv} from '../scripts/lib/noelia-planilla-csv-qa.mjs';
import {reportFixture,rehashReportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {ownReportBundle,ownReportDocument,emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';
import {reportCsv} from '../assets/report-document.js';
function fixture(){
 const f=reportFixture(29),snapshot=f.receipts[0].snapshot;
 f.details[0].rows=[];f.details[0].captures=[];snapshot.version='own-close-snapshot.v2';
 const special=['A/3501','0901','901'];
 for(let i=0;i<snapshot.employees.length;i++){
  const e=snapshot.employees[i];if(i<special.length)e.employeeNumber=special[i];
  e.jurisdiction={code:i<5?'42':'55',basis:'captured_own_registration',sourceSha256:'a'.repeat(64)};
  for(const row of snapshot.concepts.filter(row=>row.contractId===e.contractId))row.employeeNumber=e.employeeNumber;
 }
 rehashReportFixture(f);
 const bundle=ownReportBundle(f.query,f.details,f.receipts);
 return{f,bundle,snapshot};
}
function classified(scope,jurisdiction='42'){
 const document=ownReportDocument(scope.bundle,emptyOwnReportFilters(),'payroll','concept',[],jurisdiction);
 const employeeNumbers=scope.snapshot.employees.filter(e=>e.jurisdiction.code===jurisdiction).map(e=>e.employeeNumber);
 const context={'Períodos':scope.f.query.from+' a '+scope.f.query.to,'Jurisdicción elegida':'Jurisdicción '+jurisdiction,'Repartición elegida':'Todas','Convenio elegido':'Todos','Rangos':'Legajos: inicio a fin · Reparticiones: inicio a fin · Convenios: inicio a fin','Selección de legajos':'Todos los contratos del alcance'};
 return{document,expected:{jurisdiction,employeeNumbers,context}};
}
const validate=(document,expected)=>assertNoeliaClassifiedPlanillaCsv(reportCsv(document),expected);
const copy=v=>structuredClone(v);
test('real current closed model and CSV exporter preserve original5/24 cohorts after six trailing context columns',()=>{
 const scope=fixture();
 for(const code of ['42','55']){
  const {document,expected}=classified(scope,code),csv=reportCsv(document),lines=csv.split('\r\n').filter(Boolean);
  assert.equal(expected.employeeNumbers.length,code==='42'?5:24);
  assert.equal(lines.length,expected.employeeNumbers.length+1);
  assert.equal(lines.slice(1).every(line=>line.endsWith('"'+code+'"')),false,'the previous last-column assertion rejects this valid real export');
  const actual=assertNoeliaClassifiedPlanillaCsv(csv,expected);
  assert.equal(actual.header.at(-1),'Selección de legajos');
  assert.deepEqual([...actual.employeeNumbers].sort(),[...expected.employeeNumbers].sort());
 }
});
test('quoted semicolons, escaped quotes and embedded CRLF are parsed as one exact contextual value',()=>{
 const {document,expected}=classified(fixture());
 const value='Rango; "QA"\r\nsegunda línea';
 document.metadata.find(r=>r[0]==='Rangos')[1]=value;expected.context.Rangos=value;
 assert.equal(validate(document,expected).rows.length,5);
});
test('missing, duplicate and foreign participants reject despite unchanged jurisdiction and equal row count',()=>{
 const {document,expected}=classified(fixture());
 for(const mutate of [d=>{d.rows[0][2]=d.rows[1][2];},d=>{d.rows[0][2]='FOREIGN/QA';},d=>{d.rows.find(row=>row[2]==='0901')[2]='901';}]){
  const changed=copy(document);mutate(changed);assert.equal(changed.rows.length,5);
  assert.throws(()=>validate(changed,expected),/QA_NOELIA_CSV_COHORT/);
 }
 const missing=copy(document);missing.rows.pop();assert.throws(()=>validate(missing,expected),/QA_NOELIA_CSV_COHORT_COUNT/);
});
test('captured jurisdiction is checked by header even when selected context still says42',()=>{
 const {document,expected}=classified(fixture()),index=document.columns.findIndex(c=>c.label==='Jurisdicción conservada');
 document.rows[0][index]='55';
 assert.equal(document.metadata.find(r=>r[0]==='Jurisdicción elegida')[1],'Jurisdicción 42');
 assert.throws(()=>validate(document,expected),/QA_NOELIA_CSV_JURISDICTION/);
});
test('each complete selected scope context is checked on every exported row',()=>{
 const {document,expected}=classified(fixture());
 for(const key of Object.keys(expected.context)){
  const changed=copy(document);changed.metadata.find(r=>r[0]===key)[1]='Wrong synthetic scope';
  assert.throws(()=>validate(changed,expected),/QA_NOELIA_CSV_CONTEXT/);
 }
});
test('missing or duplicate semantic headers and inconsistent row widths reject the complete download',()=>{
 const {document,expected}=classified(fixture()),csv=reportCsv(document);
 assert.throws(()=>assertNoeliaClassifiedPlanillaCsv(csv.replace('"Jurisdicción conservada"','"Jurisdicción ausente"'),expected),/QA_NOELIA_CSV_HEADER/);
 assert.throws(()=>assertNoeliaClassifiedPlanillaCsv(csv.replace('"Convenio";','"Legajo";'),expected),/QA_NOELIA_CSV_HEADER/);
 const lines=csv.split('\r\n');lines[1]+=';"extra"';
 assert.throws(()=>assertNoeliaClassifiedPlanillaCsv(lines.join('\r\n'),expected),/QA_NOELIA_CSV_COLUMNS/);
});
test('truncated records, malformed quotes and bare line endings never yield a partial accepted cohort',()=>{
 const {document,expected}=classified(fixture()),csv=reportCsv(document);
 for(const changed of [csv.slice(0,-3),csv.replace('"Período";','"Período"x;'),csv.replace('\r\n','\n')])assert.throws(()=>assertNoeliaClassifiedPlanillaCsv(changed,expected),/QA_NOELIA_CSV_/);
});
test('semantic columns can move without confusing captured jurisdiction with trailing context',()=>{
 const {document,expected}=classified(fixture()),order=[8,2,0,1,3,4,5,6,7];
 document.columns=order.map(i=>document.columns[i]);document.rows=document.rows.map(row=>order.map(i=>row[i]));
 assert.equal(validate(document,expected).rows.length,5);
});
