import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonSources} from './fixtures/own-payroll-comparison-synthetic.js';
import {ownGrhComparison,ownGrhComparisonView,ownGrhComparisonDocument,OWN_GRH_JOIN} from '../assets/own-grh-comparison-model.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';

const hex=n=>n.toString(16).padStart(64,'0'),id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const group={remuneration:'993',non_remuneration:'994',deduction:'996',employer_contribution:'990'};
function sample(n=2){
 const {base}=comparisonSources(n),people=new Map(base.saved.input.employees.map(e=>[e.contractId,e]));
 const statements=base.saved.result.employeeTotals.map((t,i)=>({
  legajo:people.get(t.contractId).employeeNumber,statementId:id(i+1),statementHash:hex(i+1),
  lines:[...base.saved.result.rows.filter(r=>r.contractId===t.contractId&&r.nature!=='auxiliary').map(r=>({
   code:r.conceptCode,description:'Concepto '+r.conceptCode,amount:r.amount,quantity:null,totalGroup:group[r.nature],unit:null})),
   ...[['990',t.employer_contribution],['993',t.remuneration],['994',t.non_remuneration],['995','0.00'],['996',t.deduction],['999',t.net]]
    .map(([code,amount])=>({code,description:'Total '+code,amount,quantity:null,totalGroup:null,unit:null}))]}));
 const grh={version:'grh-statement-lines.v1',official:false,datasetId:id(900),period:base.saved.input.period,
  payrollType:'M',closureStatus:'closed',sourceHash:hex(900),complete:true,statements};
 return ownGrhComparison(base,grh,OWN_GRH_JOIN);
}
test('vista: filtra, busca por legajo exacto y pagina sin mutar el original',()=>{
 const m=sample(),before=m.rows.length,v=ownGrhComparisonView(m,{search:'1001',pageSize:1,page:2});
 assert.equal(v.rows.length,1);assert.equal(v.page,2);assert.equal(v.total,before);assert.equal(m.rows.length,before);
 assert.ok(v.filtered>1);assert.ok(v.rows.every(r=>r.legajo==='1001'));
 assert.equal(ownGrhComparisonView(m,{page:999}).page,Math.ceil(m.rows.length/25));
 for(const bad of [{view:'all'},{status:'bad'},{page:0},{pageSize:101},{search:'x'.repeat(101)}])
  assert.throws(()=>ownGrhComparisonView(m,bad),/filtros|vista/);
});
test('redondeo visible y distinto de sin diferencia; revisión no lo confunde',()=>{
 const m=sample(1),r=m.rows.find(r=>r.status==='equal');
 // El filtro usa el estado que calculó el comparador; no reinterpreta importes.
 const view=ownGrhComparisonView(m,{status:'equal'});
 assert.equal(view.filtered,view.equal);assert.ok(view.rows.some(x=>x.code===r.code));
 assert.equal(ownGrhComparisonView(m,{status:'rounding'}).filtered,0);
 assert.equal(ownGrhComparisonView(m,{status:'review'}).filtered,m.rows.filter(x=>x.review).length);
});
test('documento completo ignora filtros y página; montos, huellas y legajos son texto',()=>{
 const m=sample(),short=ownGrhComparisonView(m,{search:'1001',pageSize:1,status:'equal'}),d=ownGrhComparisonDocument(m,'concepts');
 assert.ok(short.rows.length<d.rows.length);assert.equal(d.rows.length,m.rows.length);
 assert.deepEqual(d.columns.map(c=>c.label),['Legajo','Concepto','MuniControl','GRH','Diferencia (MuniControl menos GRH)','Estado']);
 assert.equal(d.rows[0][0],m.rows[0].legajo);assert.equal(typeof d.rows[0][0],'string');
 assert.equal(d.metadata.find(([k])=>k==='Resultado propio SHA-256')[1],m.own.resultSha256);
 assert.equal(d.metadata.find(([k])=>k==='Fuente GRH SHA-256')[1],m.grh.sourceHash);
 assert.equal(ownGrhComparisonDocument(m,'totals').rows.length,m.totals.length);
 assert.throws(()=>ownGrhComparisonDocument(m,'all'),/vista/);
});
test('CSV, Excel y PDF respetan el documento de GRH y la trazabilidad',()=>{
 const d=ownGrhComparisonDocument(sample(1)),csv=reportCsv(d),xlsx=reportXlsx(d),pdf=reportPdf(d);
 assert.ok(csv.includes('Fuente GRH SHA-256'));assert.ok(csv.includes('Diferencia (MuniControl menos GRH)'));
 assert.ok(xlsx instanceof Uint8Array&&xlsx.length>100);assert.ok(pdf instanceof Uint8Array&&pdf.length>100);
});
