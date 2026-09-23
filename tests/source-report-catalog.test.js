import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceReportCatalog, sourceReportTypeLabel, sourceReportDocument } from '../assets/payroll-source-report-model.js';
import { monthlyType } from '../assets/payroll-monthly-summary-model.js';
import { syntheticCostReport } from '../scripts/salary-cost-synthetic.mjs';

const catalog=()=>({version:'payroll-source-report.v1',mode:'catalog',official:false,total:4,truncated:false,items:[
 ['2026-09-02','M'],['2026-09-28','M'],['2026-09-01T00:00:00.000Z','V'],['2026-08-31','S'],
].map(([date,type],index)=>({datasetId:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),date,type,payloadHash:'a'.repeat(64),closureStatus:'unknown',statementCount:2,lineCount:3,sourceLabel:'Fuente sintética'}))});

test('month and type intersect, preserving two different runs in one month',()=>{
 const d=catalog(),before=JSON.stringify(d),view=sourceReportCatalog(d,{month:'2026-09',type:'M'});
 assert.deepEqual(view.items.map(i=>i.date),['2026-09-02','2026-09-28']);
 assert.deepEqual(view.months,['2026-09','2026-08']);assert.deepEqual(view.types,['M','S','V']);
 assert.equal(JSON.stringify(d),before);assert.equal('amount' in view,false);
});
test('civil source date never shifts month for timezone',()=>{
 assert.deepEqual(sourceReportCatalog(catalog(),{month:'2026-09',type:'V'}).items.map(i=>i.date),['2026-09-01T00:00:00.000Z']);
});
test('all means available catalog choices, not an aggregate report',()=>{
 assert.equal(sourceReportCatalog(catalog()).items.length,4);
 assert.equal(sourceReportCatalog(catalog(),{type:'S'}).items.length,1);
 assert.deepEqual(sourceReportCatalog(catalog(),{month:'2026-09',type:'S'}).items,[]);
});
test('truncated catalog preserves the known coverage and never claims all periods',()=>{
 const d=catalog();d.truncated=true;d.total=300;
 const v=sourceReportCatalog(d,{month:'2025-01'});assert.equal(v.truncated,true);assert.equal(v.total,300);assert.deepEqual(v.items,[]);
});
test('unknown types stay selectable with their original code',()=>{
 const d=catalog();d.items[0].type='X';
 assert.equal(sourceReportCatalog(d,{type:'X'}).items.length,1);assert.equal(sourceReportTypeLabel('X'),'Tipo de origen X');
});
for(const filter of [{month:'2026-00'},{month:'2026-13'},{month:'2026-9'},{month:'2026-09-01'},{month:'1899-12'},{type:'monthly'},{type:''}])
 test('malformed catalog filter rejected '+JSON.stringify(filter),()=>assert.throws(()=>sourceReportCatalog(catalog(),filter)));
test('source report and catalog cannot substitute each other',()=>{
 assert.throws(()=>sourceReportCatalog(syntheticCostReport()));
 const d=catalog();d.items[1].datasetId=d.items[0].datasetId;assert.throws(()=>sourceReportCatalog(d));
});
test('GRH display names match module 8 without changing canonical payroll types',()=>{
 for(const [code,label] of Object.entries({F:'Final',M:'Mes',O:'Otros conceptos',P:'Primera quincena',S:'SAC',V:'Vacaciones'})){
  assert.equal(sourceReportTypeLabel(code),label);assert.equal(monthlyType(code),label);
 }
 const d=syntheticCostReport();d.type='S';const document=sourceReportDocument(d);
 assert.equal(document.metadata.find(([key])=>key==='Tipo')[1],'SAC (S)');
 assert.equal(document.metadata.find(([key])=>key==='Fecha de liquidación')[1],d.date);
 assert.equal(d.type,'S');assert.equal('canonicalPayrollType' in d,false);
});
