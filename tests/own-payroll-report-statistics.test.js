import test from 'node:test';
import assert from 'node:assert/strict';
import {reportFixture,historicalReportFixture,rehashReportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {ownReportBundle,ownReportDocument,ownStatisticsChoices,ownStatisticsSelection,emptyOwnStatisticsSelection,emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';
const value=f=>ownReportBundle(f.query,f.details,f.receipts);
const choice=patch=>({...emptyOwnStatisticsSelection(),...patch});
const stats=(f,selection={},grouping='agreement_department',jurisdiction='all',filters=emptyOwnReportFilters())=>ownReportDocument(value(f),filters,'statistics',grouping,[],jurisdiction,choice(selection));
function varied(count=61){
 const f=reportFixture(count),s=f.receipts[0].snapshot;
 f.details[0].rows=[];f.details[0].captures=[];
 for(let i=0;i<s.employees.length;i++){
  const e=s.employees[i];e.departmentCode=i%2?'01':'1';e.agreementCode=i%3?'2':'1';
  for(const c of s.concepts.filter(c=>c.contractId===e.contractId)){c.departmentCode=e.departmentCode;c.agreementCode=e.agreementCode;}
 }
 return rehashReportFixture(f);
}
const pdfText=d=>[...Buffer.from(reportPdf(d)).toString('latin1').matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(' ');

test('opciones completas del histórico preservan códigos y todas las páginas',()=>{
 const f=varied(),c=ownStatisticsChoices(value(f));
 assert.deepEqual(c.departments,['01','1']);assert.deepEqual(c.agreements,['1','2']);
 assert.deepEqual(new Set(c.concepts),new Set(f.receipts[0].snapshot.concepts.map(c=>c.conceptCode)));
 assert.ok(f.receipts[0].snapshot.employees.length>25);
 assert.equal(JSON.stringify(f).includes('currentRoster'),false);
});
test('estadísticas con más de una página conservan todas las agrupaciones y conceptos en el archivo',()=>{
 const f=varied(61),s=f.receipts[0].snapshot;
 for(let i=0;i<s.employees.length;i++){
  const e=s.employees[i];e.departmentCode=String(Math.floor(i/2)%12+1);e.agreementCode=String(i%2+1);
  for(const c of s.concepts.filter(c=>c.contractId===e.contractId)){c.departmentCode=e.departmentCode;c.agreementCode=e.agreementCode;}
 }
 rehashReportFixture(f);const d=stats(f),csv=reportCsv(d);
 assert.ok(d.rows.length>25);assert.equal(csv.split('\r\n').length-2,d.rows.length);
 assert.equal(d.rows.reduce((n,row)=>n+row[5],0),s.concepts.length);
 assert.ok(d.payrollStatement.reconciliation.every(row=>/^0(?:\.0+)?$/.test(row[3])));
 assert.equal(ownStatisticsChoices(value(f)).departments.length,12);
});
test('selecciones de códigos exactos no confunden 01 con 1',()=>{
 const f=varied(),a=stats(f,{department:'01'}),b=stats(f,{department:'1'});
 assert.equal(a.metadata.find(r=>r[0]==='Participaciones seleccionadas')[1],30);
 assert.equal(b.metadata.find(r=>r[0]==='Participaciones seleccionadas')[1],31);
 assert.ok(a.rows.every(r=>r[1].endsWith(' / 01')));
 assert.equal(a.statisticsSelection.department,'01');
});
test('convenio, repartición y rangos definen el mismo alcance exacto',()=>{
 const f=varied(),d=stats(f,{department:'01',agreement:'1'},'department','all',{...emptyOwnReportFilters(),employeeTo:'1025'});
 const selected=f.receipts[0].snapshot.employees.filter(e=>e.departmentCode==='01'&&e.agreementCode==='1'&&BigInt(e.employeeNumber)<=1025n);
 assert.equal(d.metadata.find(r=>r[0]==='Participaciones seleccionadas')[1],selected.length);
 assert.ok(d.rows.every(r=>r[1]==='01'));
 assert.ok(d.payrollStatement.reconciliation.every(r=>/^0(?:\.0+)?$/.test(r[3])));
});
test('elegir concepto limita el detalle sin convertirlo en el bruto o neto',()=>{
 const f=varied(),c=f.receipts[0].snapshot.concepts.find(c=>c.nature==='auxiliary').conceptCode,a=stats(f),b=stats(f,{concept:c});
 assert.ok(b.rows.every(r=>r[2]===c));assert.ok(b.rows.length<a.rows.length);
 assert.deepEqual(b.payrollStatement,a.payrollStatement);
 assert.equal(b.metadata.find(r=>r[0]==='Neto exacto del alcance')[1],f.receipts[0].snapshot.totals.net);
 assert.equal(b.metadata.find(r=>r[0]==='Participaciones seleccionadas')[1],61);
});
test('códigos ajenos y selecciones malformadas se rechazan íntegramente',()=>{
 const f=varied();for(const key of ['department','agreement','concept'])assert.throws(()=>stats(f,{[key]:'999999999'}),/histórico consultado/);
 for(const bad of [null,{}, {department:'',agreement:'',concept:'',extra:1},choice({concept:'=1'}),choice({department:1}),choice({agreement:'-1'}),choice({concept:'1e2'})])assert.throws(()=>ownStatisticsSelection(bad));
});
test('selección válida sin participaciones no inventa totales cero',()=>{
 const f=varied(),d=stats(f,{department:'01'},'concept','all',{...emptyOwnReportFilters(),employeeFrom:'9000'});
 assert.deepEqual(d.rows,[]);assert.ok(d.payrollStatement.reconciliation.every(r=>r.slice(1).every(v=>v===null)));
 assert.equal(d.metadata.find(r=>r[0]==='Neto exacto del alcance')[1],'Sin participaciones');
});
test('tipo y unidad permanecen separados entre meses y versiones',()=>{
 const a=historicalReportFixture('2026-09','monthly',501),b=historicalReportFixture('2026-10','sac',502),empty=structuredClone(a.details[0]);empty.liquidationType='sac';empty.groups=[];
 const other=structuredClone(b.details[0]);other.liquidationType='monthly';other.groups=[];
 const f={query:{from:'2026-09',to:'2026-10',types:['monthly','sac']},details:[a.details[0],empty,other,b.details[0]],receipts:[...a.receipts,...b.receipts]};
 const d=stats(f);assert.equal(new Set(d.rows.map(r=>r[0])).size,2);
 assert.equal(d.payrollStatement.coverage.find(r=>r[0]==='Períodos / tipos sin grupo cerrado')[1],2);
 assert.equal(d.metadata.find(r=>r[0]==='Contratos distintos')[1],2);
});
test('las cinco agrupaciones concilian todos los conceptos seleccionados',()=>{
 const f=varied(),c=f.receipts[0].snapshot.concepts[0].conceptCode;
 for(const grouping of ['concept','department','agreement','agreement_department','jurisdiction']){
  const d=stats(f,{concept:c},grouping),lines=f.receipts[0].snapshot.concepts.filter(r=>r.conceptCode===c);
  assert.equal(d.rows.reduce((n,r)=>n+r[5],0),lines.length);
  assert.equal(d.payrollStatement.reconciliation.length,6);
 }
});
test('jurisdicción capturada filtra la misma población y los mismos conceptos',()=>{
 const f=varied(4),s=f.receipts[0].snapshot;s.version='own-close-snapshot.v2';
 for(let i=0;i<s.employees.length;i++)s.employees[i].jurisdiction={code:i%2?'42':'55',basis:'captured_own_registration',sourceSha256:'a'.repeat(64)};
 rehashReportFixture(f);const d=stats(f,{department:'01'},'department','42');
 assert.equal(d.metadata.find(r=>r[0]==='Participaciones seleccionadas')[1],2);assert.ok(d.rows.every(r=>r[1]==='01'));
 s.employees[1].jurisdiction.code=null;rehashReportFixture(f);assert.throws(()=>stats(f,{department:'01'},'department','42'),/jurisdicciones/);
});
test('Excel y PDF incluyen conciliación y selecciones; CSV conserva contexto y filas completas',()=>{
 const f=varied(),d=stats(f,{department:'01'}),csv=reportCsv(d),xlsx=Buffer.from(reportXlsx(d)).toString('utf8'),pdf=pdfText(d);
 assert.equal(csv.split('\r\n').length-2,d.rows.length);assert.match(csv,/Repartición elegida/);assert.match(csv,/"01"/);
 assert.match(xlsx,/name="Estadísticas"/);assert.match(xlsx,/name="Conciliación"/);assert.doesNotMatch(xlsx,/<f>/);
 assert.match(pdf,/Estadísticas de conceptos/);assert.match(pdf,/Repartición elegida: 01/);assert.match(pdf,/Diferencia exacta/);
 const originals=f.receipts[0].snapshot.employees.filter(e=>e.departmentCode==='01'),precision=Math.max(...originals.map(e=>e.precision)),scale=10n**BigInt(precision);
 const numerator=originals.reduce((n,e)=>{const [whole,fraction='']=e.totals.gross.split('.');return n+BigInt(whole)*scale+BigInt(fraction.padEnd(precision,'0')||'0');},0n);
 const gross=String(numerator/scale)+(precision?'.'+String(numerator%scale).padStart(precision,'0'):'');
 assert.ok(pdf.includes(gross));assert.equal(d.payrollStatement.reconciliation.find(r=>r[0]==='Bruto')[1],gross);
});
test('estadísticas agregadas no exponen contrato, nombre, DNI o clave de cierre',()=>{
 const f=varied(2),d=stats(f);for(const output of [reportCsv(d),Buffer.from(reportXlsx(d)).toString('utf8'),pdfText(d)]){
  for(const e of f.receipts[0].snapshot.employees)assert.ok(!output.includes(e.contractId));
  assert.ok(!output.includes(f.receipts[0].groupId));assert.ok(!output.includes(f.receipts[0].key));
 }
});
test('CSV neutraliza unidades con fórmula y Excel conserva texto exacto',()=>{
 const f=varied(2),row=f.receipts[0].snapshot.concepts.find(c=>c.nature==='auxiliary');row.unit=' =HYPERLINK("sintetico")';row.amount='-0.00000001';rehashReportFixture(f);
 const d=stats(f,{concept:row.conceptCode});assert.match(reportCsv(d),/' =HYPERLINK/);assert.match(reportCsv(d),/'-0.00000001/);assert.doesNotMatch(Buffer.from(reportXlsx(d)).toString('utf8'),/<f>/);
});
test('fuentes incompletas o totales alterados no generan estadísticas parciales',()=>{
 for(const mutate of [f=>f.receipts[0].snapshot.concepts.pop(),f=>f.receipts[0].snapshot.totals.net='0.00']){const f=varied();mutate(f);assert.throws(()=>stats(f));}
 const f=varied();assert.throws(()=>ownStatisticsChoices({...value(f),sources:[]}));
});
test('producir opciones y estadísticas no modifica snapshots, cuerpos o claves pendientes',()=>{
 const f=varied(),before=JSON.stringify(f);ownStatisticsChoices(value(f));
 for(const grouping of ['concept','department','agreement','agreement_department','jurisdiction'])for(const format of [reportCsv,reportXlsx,reportPdf])format(stats(f,{},grouping));
 assert.equal(JSON.stringify(f),before);
});
