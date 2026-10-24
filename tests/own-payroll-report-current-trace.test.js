// Current-trace regressions. Fixtures/approvals are synthetic;
// this unit suite is not SQL, browser, publication or municipal acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {currentTraceReportFixture} from './fixtures/own-payroll-report-forced-synthetic.js';
import {ownReportBundle,ownReportDocument,emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';
import {ownReportVariableSources} from '../assets/own-payroll-report-variables.js';
import {ownRunWorkspaceResult,verifiedWorkspaceCapture} from '../assets/own-payroll-run-workspace-model.js';
import {ownCloseReceipt,ownCloseDetail} from '../assets/own-payroll-close-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {decimal,exactEvidence} from '../assets/own-payroll-exact.js';
import {reportGroup} from './fixtures/own-payroll-report-synthetic.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';

const views=['legajo','variables','variable_usage','variable_sources'];
const base=f=>ownReportBundle(f.query,f.details,f.receipts);
const bundle=f=>ownReportBundle(f.query,f.details,f.receipts,f.captures);
const document=(b,view='legajo',filters=emptyOwnReportFilters(),ids=[])=>ownReportDocument(b,filters,view,'concept',ids,'all');
const row=(f,code='100',contractId=f.captures[0].saved.input.employees[0].contractId)=>f.captures[0].saved.result.rows.find(r=>r.conceptCode===code&&r.contractId===contractId);
const phase=f=>row(f,'110').trace.find(t=>t.operation==='quantity_phase');

// Negative fixtures intentionally re-link OUTER envelopes after a semantic
// mutation, so a stale outer digest cannot masquerade as a trace-binding test.
// This does not assert that a server would authenticate the modified capture.
function relinkNegative(f){
 for(const c of f.captures){c.bodySha256=ownRunHash(c.body);c.payloadSha256=ownRunHash(c.payload);c.saved.inputSha256=ownRunHash(c.saved.input);c.saved.resultSha256=ownRunHash(c.saved.result);}
 for(const d of f.details){d.captures=structuredClone(f.captures);for(const r of d.rows)r.resultSha256=f.captures.find(c=>c.id===r.runId).saved.resultSha256;}
 for(const receipt of f.receipts){
  for(const e of receipt.snapshot.employees){const c=f.captures.find(c=>c.id===e.runId);e.inputSha256=c.saved.inputSha256;e.resultSha256=c.saved.resultSha256;}
  receipt.snapshot.concepts=receipt.snapshot.employees.flatMap(e=>structuredClone(f.captures.find(c=>c.id===e.runId).saved.result.rows.filter(r=>r.contractId===e.contractId)));
  receipt.snapshotSha256=ownRunHash(receipt.snapshot);
  for(const d of f.details)for(const g of d.groups)if(g.id===receipt.groupId)Object.assign(g,reportGroup(receipt));
 }
 return f;
}
async function semanticReject(f,{emptyFilter=false}={}){
 relinkNegative(f);
 // Establish that complete/hash-consistent envelopes reach trace semantics.
 for(const c of f.captures){assert.ok(ownRunWorkspaceResult(c));await verifiedWorkspaceCapture(c);}
 for(const d of f.details)ownCloseDetail(d);for(const r of f.receipts)ownCloseReceipt(r);
 const b={...base(f),captures:f.captures},filters=emptyFilter?{...emptyOwnReportFilters(),employeeFrom:'9999'}:emptyOwnReportFilters();
 for(const view of views)assert.throws(()=>document(b,view,filters),/traza|forzad|cantidad|fase|referencia|política|operación|variable|original/iu,view);
}

for(const [amountCents,expected]of [['0','0.00'],['12863','128.63'],['-12863','-128.63']])test('M8 current trace: fijo aprobado '+amountCents+' conserva importes, fuentes y seis totales sin atribuir la fórmula sustituida',async()=>{
 const f=currentTraceReportFixture(2,{kind:'fixed',amountCents}),before=JSON.stringify(f);
 for(const c of f.captures)await verifiedWorkspaceCapture(c);
 const b=bundle(f),originals=ownReportVariableSources(b,f.captures),d=document(b);
 assert.equal(d.rows.length,20);assert.equal(d.rows.filter(r=>r[2].startsWith('Total cerrado:')).length,12);
 for(const e of f.captures[0].saved.input.employees){
  assert.deepEqual(e.inputs,[],'la cantidad de la fórmula sustituida no se fabrica ni aparece como usada');
  assert.equal(e.fixedForcedAmounts.length,1);assert.equal(e.fixedForcedAmounts[0].amountCents,amountCents);
  const p=originals.participations.get('2026-10:monthly:'+e.contractId);assert.deepEqual(p.variables,[]);
  for(const code of ['100','110','120','900'])assert.equal(row(f,code,e.contractId).amount,expected);
  const totals=f.receipts[0].snapshot.employees.find(p=>p.contractId===e.contractId).totals;
  assert.deepEqual(d.rows.filter(r=>r[1].startsWith(e.employeeNumber+' / ')&&r[2].startsWith('Total cerrado:')).map(r=>r[7]),['remuneration','non_remuneration','deduction','employer_contribution','gross','net'].map(k=>totals[k]));
 }
 assert.ok(document(b,'variables').rows.every(r=>r[2]==='Sin variables capturadas'));
 assert.equal(document(b,'variable_sources').rows[0][4],2);
 assert.equal(JSON.stringify(f),before,'las cuatro consultas no cambian fuentes, trazas, claves ni cierre');
});

for(const [stage,expected]of [['exact','1.005'],['rounded','1.010']])test('M8 current trace: U '+stage+' conserva 1.005 y uso directo/indirecto sin confundir cantidad con importe del concepto100',async()=>{
 const f=currentTraceReportFixture(2,{kind:'quantity',stage}),before=JSON.stringify(f);for(const c of f.captures)await verifiedWorkspaceCapture(c);
 const b=bundle(f),originals=ownReportVariableSources(b,f.captures),variables=document(b,'variables'),used=document(b,'variable_usage');
 assert.equal(variables.rows.length,2);assert.equal(used.rows.length,6);
 assert.ok(variables.rows.every(r=>r[2].startsWith('fixedUnits100 / ')&&r[3]==='1.00500000'&&r[4]==='Unidades'&&r[5]===1&&r[6]===2));
 for(const p of originals.participations.values()){
  const v=p.variables[0];assert.deepEqual(v.occurrences,[{concept:'Concepto 110',kind:'Uso directo'},{concept:'Concepto 120',kind:'Uso por concepto referenciado'},{concept:'Auxiliar 900',kind:'Uso por concepto referenciado'}]);
  assert.ok(!v.occurrences.some(v=>v.concept==='Concepto 100'),'U100 no es una dependencia del importe de100');
 }
 for(const e of f.captures[0].saved.input.employees){assert.deepEqual(e.fixedForcedAmounts,[]);assert.equal(row(f,'100',e.contractId).amount,'10.000');for(const code of ['110','120','900'])assert.equal(row(f,code,e.contractId).amount,expected);}
 assert.equal(document(b).rows.length,20);assert.equal(document(b,'variable_sources').rows[0][4],2);assert.equal(JSON.stringify(f),before);
});

test('M8 current trace: 61 participaciones conservan todo el detalle, variables, fuentes y descargas más allá de una página',()=>{
 const f=currentTraceReportFixture(61,{kind:'quantity'}),before=JSON.stringify(f),b=bundle(f),d=document(b),variables=document(b,'variables'),used=document(b,'variable_usage');
 assert.equal(d.rows.length,610);assert.equal(variables.rows.length,61);assert.equal(used.rows.length,183);assert.equal(new Set(d.rows.map(r=>r[1])).size,61);
 const csv=reportCsv(d);assert.equal(csv.split('\r\n').length-2,610);assert.ok(csv.includes('1061 / 1 / 1'));
 assert.ok(reportXlsx(d) instanceof Uint8Array);assert.ok(reportPdf(d) instanceof Uint8Array);assert.equal(JSON.stringify(f),before);
});

test('M8 current trace: fijo de otro contrato no sustituye la referencia de la fila original',async()=>{
 const f=currentTraceReportFixture(2),second=f.captures[0].saved.input.employees[1],other=row(f,'100',second.contractId).trace[0];row(f).trace[0].reference=other.reference;await semanticReject(f);
});
test('M8 current trace: ledger modificado no autoriza la referencia anterior aunque se reconstruyan hashes exteriores',async()=>{
 const f=currentTraceReportFixture();f.captures[0].saved.input.employees[0].fixedForcedAmounts[0].sourceRowSha256='f'.repeat(64);await semanticReject(f);
});
test('M8 current trace: fijo con etapa rounded no corresponde al reemplazo exacto aprobado',async()=>{
 const f=currentTraceReportFixture();row(f).trace[0].stage='rounded';await semanticReject(f);
});
test('M8 current trace: fijo con valor de traza distinto no corresponde al importe y exactValue guardados',async()=>{
 const f=currentTraceReportFixture();row(f).trace[0].result=exactEvidence(decimal('128.64'));await semanticReject(f);
});
test('M8 current trace: evento ajeno no entra en la lista de operaciones sólo por tener resultado plausible',async()=>{
 const f=currentTraceReportFixture();row(f).trace[0].operation='foreign_approval_event';await semanticReject(f);
});
test('M8 current trace: U con otro código declarado no cambia la identidad del nodo original',async()=>{
 const f=currentTraceReportFixture(1,{kind:'quantity'});phase(f).reference='quantity:110';await semanticReject(f);
});
test('M8 current trace: U con etapa distinta no toma una política de redondeo no declarada',async()=>{
 const f=currentTraceReportFixture(1,{kind:'quantity'});phase(f).stage='rounded';await semanticReject(f);
});
test('M8 current trace: U con resultado distinto del input y fase originales no se acepta por conservar el importe final',async()=>{
 const f=currentTraceReportFixture(1,{kind:'quantity'});phase(f).result=exactEvidence(decimal('1.006'));await semanticReject(f);
});
test('M8 current trace: U sin feature explícita sigue siendo una operación no admitida por el contrato original',()=>{
 const f=currentTraceReportFixture(1,{kind:'quantity'}),c=f.captures[0];
 for(const p of [c.saved.input,c.payload.programState.program.definition]){delete p.fixedForcedAmountsVersion;delete p.fixedForcedAmountsPolicy;}
 for(const e of c.saved.input.employees)delete e.fixedForcedAmounts;
 assert.throws(()=>ownRunWorkspaceResult(c),{code:'OPERATION_UNSUPPORTED'});
});
test('M8 current trace: cambiar el input sin su hash original falla integridad antes de consultar informes',async()=>{
 const f=currentTraceReportFixture(1,{kind:'quantity'}),c=f.captures[0];c.saved.input.employees[0].inputs[0].value='1.006';await assert.rejects(verifiedWorkspaceCapture(c),/integridad/);
});
test('M8 current trace: captura cambiada y cierre original conservado no se vuelven consistentes sólo rehashando el resultado',()=>{
 const f=currentTraceReportFixture(),c=f.captures[0];row(f).trace[0].reference+='x';c.saved.resultSha256=ownRunHash(c.saved.result);assert.throws(()=>bundle(f),/liquidación cerrada original|resultado original confirmado/);
});
test('M8 current trace: filtro sin filas no oculta una traza ajena del censo cerrado completo',async()=>{
 const f=currentTraceReportFixture(3,{kind:'quantity'}),filters={...emptyOwnReportFilters(),employeeFrom:'9999'},b=bundle(f);
 for(const view of views)assert.deepEqual(document(b,view,filters).rows,[]);
 phase(f).reference='quantity:999999';await semanticReject(f,{emptyFilter:true});
});

// Equal values in captured branches do not make their identities interchangeable.

test('M8 cursor choose: ambas entradas iguales se capturan, pero sólo la rama ejecutada demuestra uso',async()=>{
 const f=currentTraceReportFixture(1,{kind:'quantity',quantityChoose:true}),before=JSON.stringify(f),c=f.captures[0],person=c.saved.input.employees[0];
 const a=person.inputs.find(i=>i.key==='fixedUnits100'),b=person.inputs.find(i=>i.key==='otherUnits');
 assert.ok(a&&b);assert.equal(a.unit,'units');assert.equal(b.unit,a.unit);assert.equal(a.value,'1.00500000');assert.equal(b.value,a.value);
 assert.deepEqual(row(f,'110').trace.filter(t=>t.operation==='input').map(t=>t.reference),['fixedUnits100']);
 assert.deepEqual(row(f,'110').trace.filter(t=>t.operation==='compare').map(t=>t.result),[true]);
 await verifiedWorkspaceCapture(c);
 const complete=bundle(f),originals=ownReportVariableSources(complete,f.captures),p=originals.participations.get('2026-10:monthly:'+person.contractId);
 const used=p.variables.find(v=>v.input.key==='fixedUnits100'),notUsed=p.variables.find(v=>v.input.key==='otherUnits');
 assert.deepEqual(used.occurrences,[{concept:'Concepto 110',kind:'Uso directo'},{concept:'Concepto 120',kind:'Uso por concepto referenciado'},{concept:'Auxiliar 900',kind:'Uso por concepto referenciado'}]);
 assert.deepEqual(notUsed.occurrences,[]);
 const variables=document(complete,'variables');
 assert.equal(variables.rows.length,2);
 const aRow=variables.rows.find(r=>r[2].startsWith('fixedUnits100 / ')),bRow=variables.rows.find(r=>r[2].startsWith('otherUnits / '));
 assert.deepEqual(aRow.slice(3,7),['1.00500000','Unidades',1,2]);assert.deepEqual(bRow.slice(3,7),['1.00500000','Unidades',0,0]);
 assert.equal(document(complete).rows.length,10);assert.equal(JSON.stringify(f),before);
});

test('M8 cursor regression: input de la rama no ejecutada con igual valor no suplanta la referencia del nodo ejecutado',async()=>{
 const f=currentTraceReportFixture(1,{kind:'quantity',quantityChoose:true}),c=f.captures[0],person=c.saved.input.employees[0];
 const a=person.inputs.find(i=>i.key==='fixedUnits100'),b=person.inputs.find(i=>i.key==='otherUnits');
 assert.equal(a.value,b.value);assert.equal(a.unit,b.unit);
 const r=row(f,'110'),execution=r.trace.filter(t=>t.operation==='input');assert.equal(execution.length,1);assert.equal(execution[0].reference,a.key);
 const originalAst=JSON.stringify(c.saved.input.rules),originalInputs=JSON.stringify(person.inputs),originalResult=JSON.stringify(r.exactValue),originalTotals=JSON.stringify(c.saved.result.employeeTotals),originalPhase=JSON.stringify(phase(f));
 // Change only the executed input's identity. Its value/result, the choose
 // predicate, all AST nodes, captured values, totals and quantity phase remain
 // byte-identical as data. Envelope digests are re-linked by semanticReject.
 execution[0].reference=b.key;
 assert.equal(JSON.stringify(c.saved.input.rules),originalAst);assert.equal(JSON.stringify(person.inputs),originalInputs);
 assert.equal(JSON.stringify(r.exactValue),originalResult);assert.equal(JSON.stringify(c.saved.result.employeeTotals),originalTotals);assert.equal(JSON.stringify(phase(f)),originalPhase);
 await semanticReject(f);
});
