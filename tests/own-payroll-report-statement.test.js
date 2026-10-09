import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {reportFixture,historicalReportFixture,rehashReportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {jurisdictionFixture} from './fixtures/own-payroll-jurisdiction-synthetic.js';
import {ownReportBundle,ownReportDocument,emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';
const bundle=f=>ownReportBundle(f.query,f.details,f.receipts);
const document=(f,filters=emptyOwnReportFilters(),ids=[],grouping='agreement_department',jurisdiction='all')=>ownReportDocument(bundle(f),filters,'statement',grouping,ids,jurisdiction);

test('informe para expediente conserva seis totales y concilia conceptos originales sin sumar auxiliares',()=>{
  const f=reportFixture(),prior=JSON.stringify(f),d=document(f),s=f.receipts[0].snapshot;
  assert.equal(d.rows.length,1);assert.equal(d.rows[0][2],61);
  assert.equal(d.payrollStatement.version,'own-payroll-statement.v1');
  assert.deepEqual(d.payrollStatement.reconciliation.map(r=>r[1]),['remuneration','non_remuneration','deduction','employer_contribution','gross','net'].map(k=>s.totals[k]));
  assert.ok(d.payrollStatement.reconciliation.every(r=>r[1]===r[2]&&Number(r[3])===0));
  assert.equal(d.rows[0][7],s.totals.net);assert.equal(d.rows[0][8],s.totals.employer_contribution);
  assert.equal(JSON.stringify(f),prior);
});

test('meses y tipos conservan sus participaciones y exponen un cierre ausente sin crear importes cero',()=>{
  const a=historicalReportFixture('2026-09','monthly',501),b=historicalReportFixture('2026-10','monthly',502),c=historicalReportFixture('2026-10','sac',503),empty=structuredClone(a.details[0]);
  empty.liquidationType='sac';empty.groups=[];
  const f={query:{from:'2026-09',to:'2026-10',types:['monthly','sac']},details:[a.details[0],empty,b.details[0],c.details[0]],receipts:[...a.receipts,...b.receipts,...c.receipts]},d=document(f);
  assert.equal(d.rows.length,3);assert.equal(d.rows.reduce((n,r)=>n+r[2],0),6);
  assert.equal(d.metadata.find(r=>r[0]==='Contratos distintos')[1],2);
  assert.equal(d.payrollStatement.coverage.find(r=>r[0]==='Períodos / tipos sin grupo cerrado')[1],1);
  assert.match(d.payrollStatement.populationNotice,/parcial/);
});

test('selección exacta y rangos inclusive gobiernan portada, conciliación y detalle juntos',()=>{
  const f=reportFixture(),id=f.receipts[0].snapshot.employees[30].contractId;
  const d=document(f,{...emptyOwnReportFilters(),employeeFrom:'1031',employeeTo:'1040'},[id]);
  assert.equal(d.rows[0][2],1);assert.equal(d.payrollStatement.reconciliation[5][1],f.receipts[0].snapshot.employees[30].totals.net);
  assert.equal(d.payrollStatement.coverage.find(r=>r[0]==='Grupos reducidos por filtros explícitos')[1],1);
  assert.match(d.payrollStatement.populationNotice,/parcial/);
});

test('una fuente parcial sigue identificada aunque sus totales concilien',()=>{
  const f=reportFixture(2),s=f.receipts[0].snapshot;s.populationCount=3;s.populationComplete=false;rehashReportFixture(f);
  const d=document(f);assert.equal(d.payrollStatement.coverage.find(r=>r[0]==='Grupos con cierre original parcial')[1],1);
  assert.match(d.payrollStatement.populationNotice,/no certifica/);
});

test('ocho decimales permanecen exactos en documento, primera hoja, Excel y CSV',()=>{
  const f=reportFixture(1),s=f.receipts[0].snapshot,e=s.employees[0],base=s.concepts[0];
  const values={remuneration:'0.11111111',non_remuneration:'0.88888888',deduction:'0.00000001',employer_contribution:'0.22222222',gross:'0.99999999',net:'0.99999998'};
  s.concepts=[...Object.entries(values).slice(0,4).map(([nature,amount],i)=>({...base,conceptCode:String(i+1),nature,amount})),{...base,conceptCode:'5',nature:'auxiliary',amount:'1000'}];
  e.precision=s.precision=8;e.conceptCount=s.conceptCount=5;e.totals={contractId:e.contractId,...values};s.totals=values;rehashReportFixture(f);
  const d=document(f);assert.equal(d.rows[0][7],'0.99999998');
  assert.equal(d.payrollStatement.reconciliation[5][3],'0.00000000');
  assert.match(reportCsv(d),/0\.99999998/);
  const zip=unzipSync(reportXlsx(d));assert.match(strFromU8(zip['xl/worksheets/sheet5.xml']),/0\.99999998/);
  assert.doesNotMatch(strFromU8(zip['xl/worksheets/sheet5.xml']),/<f>|t="n"/);
  assert.ok(reportPdf(d).length>1000);
});

test('sin participaciones el expediente no convierte ausencia en cero ni declara conciliación aprobada',()=>{
  const d=document(reportFixture(),{...emptyOwnReportFilters(),employeeFrom:'9999'});
  assert.equal(d.rows.length,0);assert.ok(d.payrollStatement.reconciliation.every(r=>r.slice(1).every(v=>v===null)));
  assert.match(d.payrollStatement.status,/no se presume cero/);assert.equal(reportCsv(d).trim().split('\r\n').length,1);
});

test('fuente alterada se rechaza antes de generar un resumen que parezca conciliado',()=>{
  const f=reportFixture();f.receipts[0].snapshot.concepts[0].amount='9999';rehashReportFixture(f);
  assert.throws(()=>document(f),/no concilian/);
});

test('31 reparticiones completas y todos los grupos sobreviven en las descargas',()=>{
  const f=reportFixture(31),s=f.receipts[0].snapshot;
  for(let i=0;i<s.employees.length;i++){
    const e=s.employees[i];e.departmentCode=String(i+1).padStart(2,'0');
    for(const r of s.concepts.filter(r=>r.contractId===e.contractId))r.departmentCode=e.departmentCode;
  }
  rehashReportFixture(f);const d=document(f);assert.equal(d.rows.length,31);
  assert.equal(reportCsv(d).trim().split('\r\n').length,32);
  const zip=unzipSync(reportXlsx(d));assert.match(strFromU8(zip['xl/workbook.xml']),/name="Expediente"/);
  assert.match(strFromU8(zip['xl/workbook.xml']),/name="Conciliación"/);
  assert.equal((strFromU8(zip['xl/worksheets/sheet1.xml']).match(/<row /g)||[]).length,32);
  assert.match(strFromU8(zip['xl/worksheets/sheet1.xml']),/repartición 31/);
  const pdf=new TextDecoder().decode(reportPdf(d));assert.match(pdf,/MediaBox \[0 0 595 842\]/);assert.match(pdf,/MediaBox \[0 0 842 595\]/);
  const texts=[...pdf.matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(' ');
  assert.match(texts,/repartición 31/);
});

test('agrupaciones guardan dimensiones históricas y no infieren jurisdicción ausente',()=>{
  for(const grouping of ['concept','agreement_department','agreement','department','jurisdiction']){
    const d=document(reportFixture(2),emptyOwnReportFilters(),[],grouping);
    assert.equal(d.rows[0][2],2);assert.match(d.rows[0][1],/No capturada en el cálculo/);
  }
  assert.throws(()=>document(reportFixture(2),emptyOwnReportFilters(),[],'agreement_department','42'),/jurisdicciones no capturadas/);
});

test('portada dañada o separada de la conciliación bloquea los tres exportadores',()=>{
  const d=document(reportFixture(2));d.payrollStatement.totals[0][1]='1';
  for(const exportReport of [reportPdf,reportXlsx,reportCsv])assert.throws(()=>exportReport(d),/Conciliación no válida/);
});

test('42, 55 y jurisdicción no informada se mantienen separados y el filtro reconcilia sólo lo elegido',()=>{
  const f=jurisdictionFixture(3,i=>['42','55',null][i]),d=document(f);
  assert.equal(d.rows.length,3);assert.ok(d.rows.every(row=>row[2]===1));
  assert.throws(()=>document(f,emptyOwnReportFilters(),[],'agreement_department','42'),/sin informar/);
  const complete=jurisdictionFixture(2);
  for(const code of ['42','55']){
    const filtered=document(complete,emptyOwnReportFilters(),[],'agreement_department',code);
    const original=complete.receipts[0].snapshot.employees.find(e=>e.jurisdiction.code===code);
    assert.equal(filtered.rows.length,1);assert.equal(filtered.payrollStatement.reconciliation[5][1],original.totals.net);
    assert.equal(filtered.payrollStatement.coverage[2][1],1);
  }
});

test('un control de conciliación contradictorio no se imprime ni exporta',()=>{
  for(const values of [['1','2','0'],['1','1','1'],['1',null,null]]){
    const d=document(reportFixture(2));d.payrollStatement.reconciliation[0].splice(1,3,...values);d.payrollStatement.totals[0][1]=values[0];
    for(const exportReport of [reportPdf,reportXlsx,reportCsv])assert.throws(()=>exportReport(d),/Conciliación no válida/);
  }
});

test('la primera hoja no reemplaza las notas de alcance del detalle PDF',()=>{
  const d=document(reportFixture(2)),pdf=new TextDecoder().decode(reportPdf(d));
  const texts=[...pdf.matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(' ');
  assert.match(texts,/Los grupos reabiertos se conservan/);assert.match(texts,/clasificación 42\/55/);
});
