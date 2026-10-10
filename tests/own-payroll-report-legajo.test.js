import test from 'node:test';
import assert from 'node:assert/strict';
import {variableReportFixture} from './fixtures/own-payroll-report-variables-synthetic.js';
import {ownReportBundle,ownReportDocument,emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';
import {ownLegajoReportRows} from '../assets/own-payroll-report-legajo.js';
import {calculateOwnPayroll} from '../assets/own-payroll-engine.js';
import {verifiedWorkspaceCapture} from '../assets/own-payroll-run-workspace-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';
const bundle=f=>ownReportBundle(f.query,f.details,f.receipts,f.captures);
const report=(b,filters=emptyOwnReportFilters(),ids=[],j='all')=>ownReportDocument(b,filters,'legajo','concept',ids,j);
const conceptRows=d=>d.rows.filter(r=>!r[2].startsWith('Total cerrado:'));
function labels(f,value){
 for(const c of f.captures){
  const state=c.payload.programState;
  for(const d of state.salaryCatalog.items)if(d.code==='100')d.label=value;
  c.saved.input.sourceVersions.rules=ownRunHash({program:state.program,salary:state.salaryCatalog});
  c.saved.result=calculateOwnPayroll(c.saved.input);
  c.payloadSha256=ownRunHash(c.payload);c.saved.inputSha256=ownRunHash(c.saved.input);c.saved.resultSha256=ownRunHash(c.saved.result);
 }
 for(const receipt of f.receipts){
  for(const e of receipt.snapshot.employees){const c=f.captures.find(c=>c.id===e.runId);e.inputSha256=c.saved.inputSha256;e.resultSha256=c.saved.resultSha256;}
  receipt.snapshotSha256=ownRunHash(receipt.snapshot);
  for(const d of f.details)for(const g of d.groups)if(g.id===receipt.groupId)g.snapshotSha256=receipt.snapshotSha256;
 }
 return f;
}

test('61 contratos: conceptos completos y seis totalizadores originales por participación, sin cambiar capturas',()=>{
 const f=variableReportFixture(),before=JSON.stringify(f),d=report(bundle(f));
 assert.equal(d.columns.length,9);assert.equal(d.legajoReport,true);
 assert.equal(conceptRows(d).length,f.receipts[0].snapshot.conceptCount);
 assert.equal(d.rows.filter(r=>r[2].startsWith('Total cerrado:')).length,61*6);
 assert.equal(d.rows.length,61*6+f.receipts[0].snapshot.conceptCount);
 assert.equal(new Set(d.rows.map(r=>r[1])).size,61);assert.equal(JSON.stringify(f),before);
});

test('cada naturaleza ocupa sólo su columna; no se mezclan descuentos, aportes o auxiliares con haberes',()=>{
 const f=variableReportFixture(3,{age:'used'}),d=report(bundle(f)),columns={remuneration:3,non_remuneration:3,deduction:4,employer_contribution:5,auxiliary:6};
 for(const e of f.receipts[0].snapshot.employees)for(const c of f.receipts[0].snapshot.concepts.filter(c=>c.contractId===e.contractId)){
  const r=d.rows.find(r=>r[1].startsWith(e.employeeNumber+' / ')&&r[2].startsWith(c.conceptCode+' / '));
  assert.ok(r);assert.equal(r[columns[c.nature]],c.amount);
  for(let i=3;i<=7;i++)if(i!==columns[c.nature])assert.equal(r[i],'');
 }
 assert.match(d.notes.join(' '),/celda vacía.*cero explícito/);
});

test('cero y ocho decimales del auxiliar no se redondean, y los totalizadores no duplican los importes',()=>{
 const f=variableReportFixture(3,{age:'used',declaredDate:'2026-10-31'}),d=report(bundle(f));
 assert.ok(d.rows.some(r=>r[6]==='0.00000000'));assert.ok(d.rows.some(r=>r[6]==='12.12345678'));
 for(const e of f.receipts[0].snapshot.employees){const t=d.rows.filter(r=>r[1].startsWith(e.employeeNumber+' / ')&&r[2].startsWith('Total cerrado:'));assert.deepEqual(t.map(r=>r[7]),['remuneration','non_remuneration','deduction','employer_contribution','gross','net'].map(k=>e.totals[k]));}
 assert.ok(d.rows.every(r=>r[8].endsWith('2026-10-31')));assert.match(d.notes.join(' '),/no calculan un SAC nuevo/);
});

test('descripción histórica diferente en cada mes y tipo, sin depender de filas actuales del padrón',async()=>{
 const a=labels(variableReportFixture(2,{historical:true,ordinal:50}),'Descripción original de octubre'),b=labels(variableReportFixture(2,{historical:true,period:'2026-11',type:'vacation',ordinal:70}),'Descripción original de vacaciones');
 for(const c of [...a.captures,...b.captures])await verifiedWorkspaceCapture(c);
 const emptyA=structuredClone(a.details[0]),emptyB=structuredClone(b.details[0]);emptyA.liquidationType='vacation';emptyA.groups=[];emptyB.liquidationType='monthly';emptyB.groups=[];
 const value=ownReportBundle({from:'2026-10',to:'2026-11',types:['monthly','vacation']},[...a.details,...b.details,emptyA,emptyB],[...a.receipts,...b.receipts],[...a.captures,...b.captures]),d=report(value);
 assert.equal(d.rows.filter(r=>r[2].includes('Descripción original de octubre')).length,2);
 assert.equal(d.rows.filter(r=>r[2].includes('Descripción original de vacaciones')).length,2);
 assert.equal(new Set(d.rows.map(r=>r[0])).size,2);assert.match(d.rows[0][8],/Fecha no declarada/);
});

test('semestre y año completos consultan también los meses vacíos sin inventar sueldos ni ceros',()=>{
 const f=variableReportFixture(2,{historical:true}),details=[];
 for(let i=0;i<12;i++){const year=2026+Math.floor((9+i)/12),month=(9+i)%12+1,d=structuredClone(f.details[0]);d.period=year+'-'+String(month).padStart(2,'0');if(i)d.groups=[];details.push(d);}
 const q={from:'2026-10',to:'2027-09',types:['monthly']},d=report(ownReportBundle(q,details,f.receipts,f.captures));
 assert.ok(d.rows.every(r=>r[0].startsWith('2026-10')));assert.equal(d.metadata.find(r=>r[0]==='Períodos')[1],'2026-10 a 2027-09');
 assert.throws(()=>ownReportBundle(q,details.slice(1),f.receipts,f.captures),/todo el histórico/);
});

test('filtros numéricos y contratos exactos gobiernan conceptos y totalizadores juntos, incluidas letras',()=>{
 const f=variableReportFixture(5),b=bundle(f),d=report(b,{...emptyOwnReportFilters(),employeeFrom:'1002',employeeTo:'1004'});
 assert.equal(new Set(d.rows.map(r=>r[1])).size,3);assert.equal(d.rows.filter(r=>r[2].startsWith('Total cerrado:')).length,18);
 const id=f.receipts[0].snapshot.employees[0].contractId;assert.equal(new Set(report(b,emptyOwnReportFilters(),[id]).rows.map(r=>r[1])).size,1);
 const opaque=variableReportFixture(2,{opaqueNumber:'A-001'}),o=bundle(opaque);assert.ok(report(o,emptyOwnReportFilters(),[opaque.receipts[0].snapshot.employees[0].contractId]).rows.every(r=>r[1].startsWith('A-001 / ')));
 assert.throws(()=>report(o,{...emptyOwnReportFilters(),employeeFrom:'1'}),/no admiten un rango/);
});

test('fuente incompleta, descripción ausente o naturaleza inconsistente bloquean el conjunto incluso con filtro sin filas',()=>{
 const f=variableReportFixture(2,{historical:true});
 for(const change of [g=>g.captures.pop(),g=>g.captures[0].payload.programState.salaryCatalog.items=g.captures[0].payload.programState.salaryCatalog.items.filter(d=>d.code!=='100'),g=>g.captures[0].payload.programState.salaryCatalog.items.find(d=>d.code==='100').nature='deduction']){
  const bad=structuredClone(f);change(bad);assert.throws(()=>report(bundle(bad),{...emptyOwnReportFilters(),employeeFrom:'9999'}));
 }
 const without=ownReportBundle(f.query,f.details,f.receipts);assert.throws(()=>report(without),/capturas originales/);
});

test('límite explícito cuenta conceptos y totalizadores completos; no produce filas parciales',()=>{
 const b=bundle(variableReportFixture(3)),d=report(b);
 assert.throws(()=>ownLegajoReportRows(b,b.employees,d.rows.length-1),/no se omitieron|no se.*subconjunto|supera/i);
 assert.equal(ownLegajoReportRows(b,b.employees,d.rows.length).length,d.rows.length);
});

test('descargas completas de más de una página: CSV seguro, Excel literal sin fórmulas y PDF',()=>{
 const f=labels(variableReportFixture(61,{historical:true}), '=CONCEPTO "QA"; conservación'),d=report(bundle(f));
 const csv=reportCsv(d);assert.equal(csv.split('\r\n').length-2,d.rows.length);assert.ok(csv.includes('1061 /'));assert.ok(csv.includes('""QA""'));
 const excel=Buffer.from(reportXlsx(d)).toString('utf8');assert.ok(!excel.includes('<f>'));assert.ok(excel.includes('1061 /'));assert.ok(excel.includes('name="Control"'));
 const pdf=reportPdf(d);assert.ok(pdf.length>1000);assert.equal(d.rows.at(-1)[2],'Total cerrado: Neto');
 assert.throws(()=>reportXlsx({...d,legajoReport:'true'}),/por legajo no válido/);
});
