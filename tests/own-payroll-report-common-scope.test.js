import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {reportFixture,rehashReportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {variableReportFixture} from './fixtures/own-payroll-report-variables-synthetic.js';
import {ownReportBundle,ownReportDocument,emptyOwnReportFilters,emptyOwnStatisticsSelection} from '../assets/own-payroll-report-model.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';

const views=['statistics','statement','payroll','summary','concepts','sources'];
const capturedViews=['legajo','variables','variable_usage','variable_sources'];
const selection=patch=>({...emptyOwnStatisticsSelection(),...patch});
const meta=(d,key)=>d.metadata.find(row=>row[0]===key)?.[1];
const bundle=f=>ownReportBundle(f.query,f.details,f.receipts,f.captures??null);
const report=(b,view,scope,filters=emptyOwnReportFilters(),ids=[],jurisdiction='42')=>ownReportDocument(b,filters,view,'agreement_department',ids,jurisdiction,selection(scope));
function varied(count=6){
 const f=reportFixture(count),s=f.receipts[0].snapshot;
 const dimensions=[['01','01','42'],['1','01','42'],['01','1','42'],['01','01','55'],['01','01','42'],['1','1','55']];
 f.details[0].rows=[];f.details[0].captures=[];s.version='own-close-snapshot.v2';
 for(let i=0;i<s.employees.length;i++){
  const e=s.employees[i],[department,agreement,jurisdiction]=dimensions[i%dimensions.length];
  e.departmentCode=department;e.agreementCode=agreement;
  e.jurisdiction={code:jurisdiction,basis:'captured_own_registration',sourceSha256:'a'.repeat(64)};
  for(const c of s.concepts.filter(c=>c.contractId===e.contractId)){c.departmentCode=department;c.agreementCode=agreement;}
 }
 return rehashReportFixture(f);
}
const pdfText=d=>[...Buffer.from(reportPdf(d)).toString('latin1').matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(' ');
function csvRows(d){
 const text=reportCsv(d);assert.equal(text.charCodeAt(0),0xfeff);
 return text.slice(1).trimEnd().split('\r\n').map(line=>{
  const cells=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){
   const c=line[i];
   if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
   else if(c===';'&&!quoted){cells.push(value);value='';}else value+=c;
  }
  assert.equal(quoted,false);cells.push(value);return cells;
 });
}
function assertExports(d,department,agreement){
 const rows=csvRows(d),header=rows[0],context=['Repartición elegida','Convenio elegido','Jurisdicción elegida'];
 assert.equal(rows.length,d.rows.length+1,'CSV has a header and every complete detail row, with no metadata rows');
 for(const row of rows.slice(1)){
  assert.equal(row.length,header.length);
  for(const [key,value]of [[context[0],department],[context[1],agreement],[context[2],meta(d,context[2])]]){
   assert.ok(header.includes(key),key);assert.equal(row[header.indexOf(key)],value,key);
  }
 }
 const xlsx=unzipSync(reportXlsx(d)),control=strFromU8(xlsx['xl/worksheets/sheet3.xml']);
 assert.equal((strFromU8(xlsx['xl/worksheets/sheet1.xml']).match(/<row /g)||[]).length,d.rows.length+1);
 for(const [key,value]of [[context[0],department],[context[1],agreement]]){
  const row=[...control.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].find(m=>m[1].includes(key));
  assert.ok(row,key);assert.ok(row[1].includes('>'+value+'</t>'),key+' is retained literally in Control');
 }
 const pdf=pdfText(d);assert.ok(pdf.includes('Repartición elegida: '+department));assert.ok(pdf.includes('Convenio elegido: '+agreement));
 if(d.payrollStatement){
  assert.equal(d.payrollStatement.reconciliation.length,6);
  assert.ok(d.payrollStatement.reconciliation.every(row=>row[1]===row[2]&&/^0(?:\.0+)?$/.test(row[3])));
  assert.ok(strFromU8(xlsx['xl/workbook.xml']).includes('name="Conciliación"'));
 }
}

test('Estadísticas 01/01/concepto a Expediente y Planilla mantiene la población exacta, sin sumar códigos 1',()=>{
 const f=varied(),before=JSON.stringify(f),b=bundle(f),employees=f.receipts[0].snapshot.employees;
 const ids=[employees[0].contractId,employees[4].contractId],concept=f.receipts[0].snapshot.concepts.find(c=>c.nature==='auxiliary').conceptCode;
 const scope={department:'01',agreement:'01',concept};
 const statistics=report(b,'statistics',scope),statement=report(b,'statement',scope),payroll=report(b,'payroll',scope);
 assert.equal(meta(statistics,'Participaciones seleccionadas'),2);assert.ok(statistics.rows.every(row=>row[2]===concept));
 for(const [view,d]of [['statement',statement],['payroll',payroll]]){
  const expected=report(b,view,{},emptyOwnReportFilters(),ids);
  assert.deepEqual(d.rows,expected.rows);assert.equal(meta(d,'Participaciones seleccionadas'),2);
  assert.equal(meta(d,'Repartición elegida'),'01');assert.equal(meta(d,'Convenio elegido'),'01');
  assert.equal(meta(d,'Concepto elegido'),undefined,'concept selection has no effect outside statistics');
 }
 assert.deepEqual(statement.payrollStatement,statistics.payrollStatement,'all six closed totals reconcile the same participants, not the selected concept');
 assert.deepEqual(statement.payrollStatement.reconciliation,report(b,'statement',{},emptyOwnReportFilters(),ids).payrollStatement.reconciliation);
 assert.equal(JSON.stringify(f),before,'stored snapshots, keys and complete sources remain unchanged');
});

test('códigos comunes se cruzan con legajos exactos, rangos y jurisdicción en todas las vistas',()=>{
 const f=varied(),b=bundle(f),employees=f.receipts[0].snapshot.employees,ids=[0,1,3,4].map(i=>employees[i].contractId);
 const filters={...emptyOwnReportFilters(),employeeFrom:'1001',employeeTo:'1004',departmentFrom:'01',departmentTo:'01'};
 for(const view of views){
  const scope={department:'01',agreement:'01'},actual=report(b,view,scope,filters,ids,'55');
  const expected=report(b,view,{},emptyOwnReportFilters(),[employees[3].contractId],'55');
  assert.equal(meta(actual,'Participaciones seleccionadas'),1,view);assert.deepEqual(actual.rows,expected.rows,view);
  assert.equal(meta(actual,'Grupos originales cerrados'),f.receipts.length,'the complete census is not cropped');
  if(actual.payrollStatement)assert.deepEqual(actual.payrollStatement,expected.payrollStatement);
 }
});

test('repartición y convenio ajenos fallan también fuera de estadísticas; concepto ajeno no restringe esos informes',()=>{
 const b=bundle(varied());
 for(const view of views)for(const key of ['department','agreement'])assert.throws(()=>report(b,view,{[key]:'999999999'}),/histórico consultado/,view+' '+key);
 for(const view of views.filter(view=>view!=='statistics')){
  const normal=report(b,view,{department:'01',agreement:'01'}),remembered=report(b,view,{department:'01',agreement:'01',concept:'999999999'});
  assert.deepEqual(remembered.rows,normal.rows);assert.deepEqual(remembered.payrollStatement,normal.payrollStatement);
 }
 assert.throws(()=>report(b,'statistics',{department:'01',agreement:'01',concept:'999999999'}),/concepto seleccionado/);
});

test('intersección común vacía conserva ausencia y nunca fabrica seis totales cero',()=>{
 const b=bundle(varied());
 for(const view of views){
  const d=report(b,view,{department:'01',agreement:'1'},emptyOwnReportFilters(),[],'55');
  assert.equal(meta(d,'Participaciones seleccionadas'),0);assert.equal(meta(d,'Neto exacto del alcance'),'Sin participaciones');
  if(view!=='sources')assert.deepEqual(d.rows,[]);
  if(d.payrollStatement)assert.ok(d.payrollStatement.reconciliation.every(row=>row.slice(1).every(value=>value===null)));
  assert.equal(csvRows(d).length,d.rows.length+1);
 }
});

test('legajo y variables mantienen capturas completas antes de aplicar el alcance común',()=>{
 const f=variableReportFixture(3,{historical:true}),b=bundle(f),employee=f.receipts[0].snapshot.employees[0],before=JSON.stringify(f);
 const filters={...emptyOwnReportFilters(),employeeTo:employee.employeeNumber};
 for(const view of capturedViews){
  const d=report(b,view,{department:'1',agreement:'1',concept:'999999999'},filters,[employee.contractId],'all');
  const expected=report(b,view,{},emptyOwnReportFilters(),[employee.contractId],'all');
  assert.deepEqual(d.rows,expected.rows);assert.equal(meta(d,'Participaciones seleccionadas'),1);
  assert.throws(()=>report(b,view,{department:'01'},filters,[employee.contractId],'all'),/histórico consultado/);
  const without=ownReportBundle(f.query,f.details,f.receipts);assert.throws(()=>report(without,view,{department:'1',agreement:'1'},filters,[employee.contractId],'all'),/capturas originales/);
 }
 const legajo=report(b,'legajo',{department:'1',agreement:'1'},filters,[employee.contractId],'all');
 assert.deepEqual(legajo.rows.filter(row=>row[2].startsWith('Total cerrado:')).map(row=>row[7]),['remuneration','non_remuneration','deduction','employer_contribution','gross','net'].map(key=>employee.totals[key]));
 assert.throws(()=>ownReportBundle(f.query,f.details,f.receipts,f.captures.slice(1)),/capturas originales/);
 assert.equal(JSON.stringify(f),before);
});

test('PDF, Excel y CSV de cada vista conservan códigos exactos y detalle completo con más de una página',()=>{
 const f=varied(96),b=bundle(f);
 for(const view of views){
  const d=report(b,view,{department:'01',agreement:'01'});
  assert.equal(meta(d,'Participaciones seleccionadas'),32,view);assertExports(d,'01','01');
  if(view==='payroll'||view==='concepts')assert.ok(d.rows.length>25);
 }
});

test('exportaciones con capturas originales también conservan el alcance común visible',()=>{
 const f=variableReportFixture(3,{historical:true}),b=bundle(f),id=f.receipts[0].snapshot.employees[0].contractId;
 for(const view of capturedViews)assertExports(report(b,view,{department:'1',agreement:'1'},emptyOwnReportFilters(),[id],'all'),'1','1');
});

test('el contexto CSV nuevo no altera otros layouts ni añade filas de metadatos',()=>{
 const d={layout:'synthetic-other-report.v1',title:'Consulta sintética',columns:[{label:'Código',type:'text'},{label:'Cantidad',type:'integer'}],rows:[['01',2]],metadata:[['Fuente','QA']],notes:[],filename:'municontrol_qa_other'};
 assert.equal(reportCsv(d),'\ufeff"Código";"Cantidad"\r\n"01";"2"\r\n');
 assert.doesNotMatch(pdfText(d),/Repartición elegida|Convenio elegido|Alcance exacto/);
});
