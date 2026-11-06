import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {reportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {ownReportBundle,ownReportDocument,emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';
import {reportCsv,reportPdf,reportXlsx} from '../assets/report-document.js';

const fixture=reportFixture(3),bundle=ownReportBundle(fixture.query,fixture.details,fixture.receipts);
const documentFor=view=>ownReportDocument(bundle,emptyOwnReportFilters(),view);
const model=documentFor('payroll');
const rows=(...values)=>({...model,rows:values.map(([legajo,...money])=>['2026-10','Mensual',legajo,'01','009',...money])});
const sheets=d=>{
 const zip=unzipSync(reportXlsx(d)),part=name=>strFromU8(zip['xl/'+name+'.xml']);
 return {data:part('worksheets/sheet1'),totals:part('worksheets/sheet2'),control:part('worksheets/sheet3'),styles:part('styles')};
};
function cell(xml,ref){const m=xml.match(new RegExp('<c r="'+ref+'"([^>]*)>([\\s\\S]*?)</c>'));assert.ok(m,'missing '+ref);return {attrs:m[1],body:m[2]};}
function literal(xml,ref,value){const {attrs,body}=cell(xml,ref);assert.match(attrs,/t="inlineStr"/);assert.equal(body,'<is><t xml:space="preserve">'+value+'</t></is>');}
function num(xml,ref,value){const {attrs,body}=cell(xml,ref);assert.doesNotMatch(attrs,/t="(?:inlineStr|e)"/);assert.match(attrs,/s="3"/);assert.equal(body,'<v>'+value+'</v>');}
function na(xml,ref){const {attrs,body}=cell(xml,ref);assert.match(attrs,/t="e"/);assert.equal(body,'<v>#N/A</v>');}
function total(xml,ref,letter,last,expected){const {attrs,body}=cell(xml,ref);assert.match(attrs,/s="3"/);assert.equal(body,'<f>SUMPRODUCT(ROUND(Datos!'+letter+'2:'+letter+last+'*100,0))/100</f><v>'+expected+'</v>');}

test('only the own payroll planilla explicitly marks its three amounts; CSV/PDF and the original rows are untouched',()=>{
 assert.deepEqual(model.columns.filter(c=>c.xlsxAmount).map(c=>[c.label,c.type,c.xlsxAmount]),[
  ['Bruto exacto','text','gross'],['Retenciones exactas','text','deduction'],['Neto exacto','text','net']]);
 const plain={...model,columns:model.columns.map(({xlsxAmount,...c})=>c)};
 assert.equal(reportCsv(plain),reportCsv(model));assert.deepEqual(reportPdf(plain),reportPdf(model));
 assert.doesNotMatch(sheets(plain).data,/\(numérico\)/);
 for(const view of ['summary','concepts','statistics','sources','statement']){
  const d=documentFor(view);assert.equal(d.columns.some(c=>c.xlsxAmount),false);assert.doesNotMatch(sheets(d).data,/\(numérico\)/);
 }
});
test('actual worksheets retain identifiers, scale, row count and metadata alongside formatted numeric cells and exact cached totals',()=>{
 const d=rows(['0901','0.1000','0','0.10'],['901','0.200','0.00','0.2'],['A/3501','-0.01000','0.100','-0.11']);
 const {data,control,totals,styles}=sheets(d);
 assert.equal((data.match(/<row /g)||[]).length,4);
 for(const [i,id] of ['0901','901','A/3501'].entries()){literal(data,'C'+(i+2),id);literal(data,'D'+(i+2),'01');literal(data,'E'+(i+2),'009');}
 literal(data,'F1','Bruto exacto');literal(data,'F2','0.1000');literal(data,'G2','0');literal(data,'H4','-0.11');
 literal(data,'I1','Bruto (numérico)');literal(data,'J1','Retenciones (numérico)');literal(data,'K1','Neto (numérico)');
 num(data,'I2','0.1');num(data,'J2','0');num(data,'I4','-0.01');num(data,'K4','-0.11');
 assert.match(data,/<autoFilter ref="A1:K4"/);assert.match(styles,/numFmtId="164" formatCode="#,##0.00;\[Red\]-#,##0.00"/);
 total(totals,'B3','I',4,'0.29');total(totals,'B4','J',4,'0.1');total(totals,'B5','K',4,'0.19');
 assert.match(totals,/COUNTA\(Datos!A2:A4\)/);assert.match(control,/Bruto exacto del alcance/);assert.match(control,/Importes para sumar/);
 const scoped={...d,columns:[...d.columns,{label:'Jurisdicción conservada',type:'text'}],rows:d.rows.map(r=>[...r,'42'])};
 const withJ=sheets(scoped);literal(withJ.data,'I2','42');num(withJ.data,'J2','0.1');total(withJ.totals,'B3','J',4,'0.29');
});
test('nonzero subcents, absent values and amounts outside the cents limit never become zero, rounded numbers or partial totals',()=>{
 const d=rows(['0901','0.001','9999999999999.99','12345678901234567890123456789.12345678'],['901','0.00','0.00000',null]);
 const {data,totals}=sheets(d);
 literal(data,'F2','0.001');literal(data,'G2','9999999999999.99');literal(data,'H2','12345678901234567890123456789.12345678');
 na(data,'I2');num(data,'I3','0');num(data,'J2','9999999999999.99');na(data,'K2');na(data,'K3');
 assert.match(cell(totals,'B3').body,/No sumable.*Filas sin importe numérico: 1/);
 assert.match(cell(totals,'B5').body,/No sumable.*Filas sin importe numérico: 2/);
 assert.doesNotMatch(cell(totals,'B3').body,/<f>|<v>/);total(totals,'B4','J',3,'9999999999999.99');
});
test('an aggregate exceeding cents precision disables its numeric column even with valid rows or opposite signs; empty is not zero',()=>{
 for(const add of ['0.01','-0.01']){
  const {data,totals}=sheets(rows(['1','9999999999999.99','0.01','0.00'],['2',add,'0.01','0.00']));
  na(data,'I2');na(data,'I3');literal(data,'F3',add);total(totals,'B4','J',3,'0.02');
  assert.match(cell(totals,'B3').body,/No sumable.*suma de importes absolutos/);assert.doesNotMatch(cell(totals,'B3').body,/<f>/);
 }
 const empty=sheets(rows());literal(empty.totals,'B3','Sin participaciones');assert.doesNotMatch(empty.data,/<row r="2"/);
});
