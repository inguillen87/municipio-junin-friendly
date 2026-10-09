import test from 'node:test';
import assert from 'node:assert/strict';
import {accountingDefinition, accountingHistory, accountingHash, accountingAttempt} from '../assets/own-payroll-accounting-model.js';
import {verifiedImputation} from '../assets/own-payroll-imputation-model.js';
import {approvedImputationCsv} from '../assets/own-payroll-imputation-workspace-model.js';
import {syntheticAccountingDefinition, syntheticAccountingCommand, accountingIds} from './fixtures/own-payroll-accounting-synthetic.js';
import {imputationWorkspaceFixture, rehashImputationFixture} from './fixtures/own-payroll-imputation-synthetic.js';

const bankFields = () => ({bankDestinationVersion:'own-accounting-bank-destination.v1', bankConceptReference:'CONCEPTO-BANCARIO-SINTETICO', bankMovementReference:'MOVIMIENTO-BANCARIO-SINTETICO', netCreditorKind:'none', netCreditorReference:null, indicatesNet:false});
const extended = () => {const d=syntheticAccountingDefinition(); Object.assign(d.mappings[0],bankFields()); return d;};
function readCsv(csv) {
  assert.ok(csv.endsWith('\r\n'));
  return csv.slice(0,-2).split('\r\n').map(line=>{
    const fields=[],pattern=/"((?:[^"]|"")*)"(?:;|$)/g;let cursor=0,m;
    while((m=pattern.exec(line))){assert.equal(m.index,cursor);fields.push(m[1].replaceAll('""','"'));cursor=pattern.lastIndex;}
    assert.equal(cursor,line.length);return fields;
  });
}
async function approvedExtended(count=31) {
  const f=await imputationWorkspaceFixture(count), d=f.detail;
  d.source.configuration.definition.mappings.forEach((m,i)=>Object.assign(m,bankFields(),{netCreditorKind:['not_informed','none','reference'][i%3],netCreditorReference:i%3===2?'0000123':null,indicatesNet:[null,false,true][i%3]}));
  await rehashImputationFixture(d.source);
  d.allocation=await verifiedImputation(d.source); d.allocationSha256=await accountingHash(d.allocation);
  Object.assign(d.body,{sourceVersion:d.source.sourceVersion,allocationSha256:d.allocationSha256});
  Object.assign(d.proposal,{sourceVersion:d.body.sourceVersion,allocationSha256:d.allocationSha256,requestSha256:await accountingHash(d.body),status:'approved',decision:{command:'approve',reason:'Decisión independiente exclusivamente sintética',actorLabel:'Revisora sintética',recordedAt:'2026-10-09T15:00:00Z',revision:1}});
  return d;
}

test('conserva concepto, movimiento, acreedor de neto e Indica neto separados de las cuentas anteriores',()=>{
  const d=extended(),before=structuredClone(d),r=accountingDefinition(d).mappings[0];
  assert.deepEqual(r,before.mappings[0]);assert.notEqual(r.bankConceptReference,r.bankAccountReference);
  assert.equal(r.creditorReference,null);assert.equal(r.netCreditorKind,'none');assert.equal(r.indicatesNet,false);assert.deepEqual(d,before);
});
test('no informado, ninguno, referencia y No/Sí conservan significados distintos',()=>{
  for(const [kind,reference] of [['not_informed',null],['none',null],['reference','0'],['reference','0000123']]) for(const indicatesNet of [null,false,true]){
    const d=extended();Object.assign(d.mappings[0],{bankConceptReference:null,bankMovementReference:null,netCreditorKind:kind,netCreditorReference:reference,indicatesNet});
    const r=accountingDefinition(d).mappings[0];assert.equal(r.netCreditorKind,kind);assert.equal(r.netCreditorReference,reference);assert.equal(r.indicatesNet,indicatesNet);
  }
});
test('rechaza variantes parciales, referencias incompatibles, booleanos coercionados y campos libres',()=>{
  for(const change of [r=>delete r.indicatesNet,r=>r.bankDestinationVersion='unknown',r=>r.netCreditorKind='unknown',r=>r.netCreditorReference='CREEDOR',r=>{r.netCreditorKind='reference';r.netCreditorReference=null;},r=>r.indicatesNet='false',r=>r.indicatesNet=0,r=>r.bankConceptReference=' ',r=>r.bankMovementReference='<script>',r=>r.bankAccountReference=0,r=>r.extra='libre']){
    const d=extended();change(d.mappings[0]);assert.throws(()=>accountingDefinition(d));
  }
});
test('el registro anterior conserva exactamente su definición y huella, sin valores nuevos inferidos',async()=>{
  const d=syntheticAccountingDefinition();assert.deepEqual(accountingDefinition(d),d);
  assert.equal(await accountingHash(d),'f0f159393aeee5b181d833a25267d14dad537e96f5c52747d07f9f6f266ca657');
  const f=await imputationWorkspaceFixture(2);assert.equal(f.detail.allocationSha256,'9e04f201fb00549e8d8c104299babebc3d29f9ac958ac017146d083f771591b3');
  assert.ok(!Object.hasOwn(f.detail.allocation.rows.find(r=>r.destination).destination,'indicatesNet'));
});
test('una asociación anterior se cierra y reemplaza, sin enriquecer su historia ni modificar el intento congelado',async()=>{
  const old=syntheticAccountingDefinition(),enriched=extended();assert.throws(()=>accountingHistory(old,enriched),e=>e.code==='ACCOUNTING_HISTORY_REQUIRED');
  const next=structuredClone(old);next.mappings[0].validUntil='2026-09-30';next.mappings.push({...enriched.mappings[0],validFrom:'2026-10-01'});accountingHistory(old,next);
  const command=syntheticAccountingCommand(),attempt=accountingAttempt(accountingIds.key,command,'qa-account'),hash=await accountingHash(attempt.body);
  command.definition=next;assert.equal(await accountingHash(attempt.body),hash);assert.deepEqual(attempt.body.definition,old);assert.equal(attempt.key,accountingIds.key);
});
test('la imputación y CSV completos conservan todos los datos bancarios, páginas, conceptos e importes',async()=>{
  const d=await approvedExtended(),before=structuredClone(d),rows=readCsv(await approvedImputationCsv(d));
  assert.ok(d.allocation.rows.length>25);assert.equal(rows.length,d.allocation.conceptCount+1);assert.equal(rows[0].length,37);
  assert.deepEqual(rows[0].slice(32),['Concepto bancario','Movimiento bancario','Acreedor de neto · declaración','Acreedor de neto · referencia','Indica neto']);
  const kinds={not_informed:'No informado',none:'Ninguno',reference:'Acreedor declarado'};
  for(const [i,r] of d.allocation.rows.entries()){
    assert.equal(rows[i+1].length,37);assert.equal(rows[i+1][4],String(i+1));assert.equal(rows[i+1][14],"'"+r.amount);
    if(!r.destination){assert.deepEqual(rows[i+1].slice(32),Array(5).fill(''));continue;}
    assert.equal(r.destination.bankDestinationVersion,'own-accounting-bank-destination.v1');
    assert.deepEqual(rows[i+1].slice(32),["'"+r.destination.bankConceptReference,"'"+r.destination.bankMovementReference,"'"+kinds[r.destination.netCreditorKind],r.destination.netCreditorReference===null?'':"'"+r.destination.netCreditorReference,r.destination.indicatesNet===null?"'No informado":r.destination.indicatesNet?"'Sí":"'No"]);
  }
  assert.deepEqual(d,before);assert.deepEqual(d.allocation.allocatedTotals,before.source.group.snapshot.totals ? Object.fromEntries(Object.keys(d.allocation.allocatedTotals).map(k=>[k,d.source.group.snapshot.totals[k]])) : null);
});
test('alteración bancaria, cierre o decisión pendiente invalida el CSV y no crea operaciones',async()=>{
  for(const change of [d=>d.allocation.rows.find(r=>r.destination).destination.indicatesNet=true,d=>d.allocation.rows.find(r=>r.destination).destination.netCreditorKind='reference',d=>d.source.configuration.definition.mappings[0].bankConceptReference='OTRO',d=>d.sourceCurrent=false,d=>{d.proposal.status='pending';d.proposal.decision=null;}]){
    const d=await approvedExtended();change(d);await assert.rejects(approvedImputationCsv(d));assert.equal(d.allocation.accountingPosted,false);assert.equal(d.allocation.paymentExecuted,false);
  }
});
test('las referencias bancarias son texto literal seguro en CSV, incluidos separadores, fórmulas y ceros',async()=>{
 const d=await approvedExtended();for(const m of d.source.configuration.definition.mappings)Object.assign(m,{bankConceptReference:'=SUM(1;2)',bankMovementReference:'@CALL("fixture")',netCreditorKind:'reference',netCreditorReference:'0000123'});
 await rehashImputationFixture(d.source);d.allocation=await verifiedImputation(d.source);d.allocationSha256=await accountingHash(d.allocation);Object.assign(d.body,{sourceVersion:d.source.sourceVersion,allocationSha256:d.allocationSha256});Object.assign(d.proposal,{sourceVersion:d.body.sourceVersion,allocationSha256:d.allocationSha256,requestSha256:await accountingHash(d.body)});
 const rows=readCsv(await approvedImputationCsv(d));assert.equal(rows.length,d.allocation.conceptCount+1);for(const row of rows.slice(1).filter(r=>r[5]==="'Imputado")){assert.equal(row.length,37);assert.deepEqual(row.slice(32,36),["'=SUM(1;2)","'@CALL(\"fixture\")","'Acreedor declarado","'0000123"]);}
});
