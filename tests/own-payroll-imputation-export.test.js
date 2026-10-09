import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedImputationCsv} from '../assets/own-payroll-imputation-workspace-model.js';
import {verifiedImputation} from '../assets/own-payroll-imputation-model.js';
import {accountingHash} from '../assets/own-payroll-accounting-model.js';
import {imputationWorkspaceFixture,remeasureSyntheticClosure} from './fixtures/own-payroll-imputation-synthetic.js';

// Independent quoted-CSV reader: a semicolon or doubled quote in a reference
// must never create a new field, row or executable spreadsheet expression.
function readCsv(csv){
 assert.ok(csv.endsWith('\r\n'));
 return csv.slice(0,-2).split('\r\n').map(line=>{
  const fields=[],pattern=/"((?:[^"]|"")*)"(?:;|$)/g;let cursor=0,m;
  while((m=pattern.exec(line))){assert.equal(m.index,cursor);fields.push(m[1].replaceAll('""','"'));cursor=pattern.lastIndex;}
  assert.equal(cursor,line.length);return fields;
 });
}
async function approved(count=31,modify=null){
 const f=await imputationWorkspaceFixture(count),d=f.detail;
 if(modify){modify(d.source);await remeasureSyntheticClosure(d.source,8);d.allocation=await verifiedImputation(d.source);d.allocationSha256=await accountingHash(d.allocation);d.body.sourceVersion=d.source.sourceVersion;d.body.allocationSha256=d.allocationSha256;Object.assign(d.proposal,{sourceVersion:d.body.sourceVersion,allocationSha256:d.allocationSha256,requestSha256:await accountingHash(d.body)});}
 d.proposal.status='approved';d.proposal.decision={command:'approve',reason:'Decisión independiente exclusivamente sintética',actorLabel:'Revisora sintética',recordedAt:'2026-10-09T15:00:00Z',revision:1};return d;
}

test('distribución aprobada exporta cada concepto de todas las páginas, con ordinal y destino originales',async()=>{
 const d=await approved(),before=structuredClone(d),rows=readCsv(await approvedImputationCsv(d));
 assert.ok(d.allocation.rows.length>25);assert.equal(rows.length,d.source.group.snapshot.conceptCount+1);assert.equal(rows[0].length,32);
 for(const [i,r]of d.allocation.rows.entries()){
  const values=rows[i+1];assert.equal(values.length,rows[0].length);assert.equal(values[4],String(i+1));assert.equal(values[6],"'"+r.employeeNumber);assert.equal(values[11],"'"+r.conceptCode);assert.equal(values[14],"'"+r.amount);assert.equal(values[15],r.destination?"'"+r.destination.budgetItemReference:'');assert.equal(values[27],"'"+d.source.group.snapshotSha256);assert.equal(values[28],"'"+d.allocationSha256);
 }
 assert.deepEqual(d,before,'exportar no modifica la fuente, decisión o cuerpos conservados');
});
test('conserva centavos grandes y negativos, códigos con ceros y auxiliares fraccionarios como texto',async()=>{
 const d=await approved(31,s=>{
  const employee=s.group.snapshot.employees[0];employee.employeeNumber='000023';
  for(const row of s.group.snapshot.concepts.filter(r=>r.contractId===employee.contractId))row.employeeNumber=employee.employeeNumber;
  s.group.snapshot.concepts.find(r=>r.nature==='remuneration').amount='9007199254740993.01';
  s.group.snapshot.concepts.find(r=>r.nature==='deduction').amount='-10.01';
  s.group.snapshot.concepts.find(r=>r.nature==='auxiliary').amount='0.33333333';
 });
 const rows=readCsv(await approvedImputationCsv(d));assert.ok(rows.some(r=>r[6]==="'000023"));assert.ok(rows.some(r=>r[14]==="'9007199254740993.01"));assert.ok(rows.some(r=>r[14]==="'-10.01"));assert.ok(rows.some(r=>r[14]==="'0.33333333"&&r[5]==="'Auxiliar · sin movimiento monetario"));
});
test('neutraliza referencias con fórmulas y separadores sin perder su texto ni agregar columnas',async()=>{
 const injected=['=HYPERLINK("https://fixture.invalid";"a")','+SUM(1;2)','-123','@SUM(1)','000012345678901234567890'];
 const d=await approved(31,s=>{for(const m of s.configuration.definition.mappings){[m.supplierReference,m.creditorReference,m.accountingAccountReference,m.bankAccountReference,m.bankReference]=injected;}});
 const rows=readCsv(await approvedImputationCsv(d));for(const row of rows.slice(1).filter(r=>r[5]==="'Imputado")){assert.equal(row.length,32);assert.deepEqual(row.slice(18,23),injected.map(v=>"'"+v));}
});
test('una referencia nula queda vacía y un cero explícito se conserva, sin inventar un destino auxiliar',async()=>{
 const d=await approved(31,s=>{for(const m of s.configuration.definition.mappings){m.supplierReference=null;m.creditorReference='0';}}),rows=readCsv(await approvedImputationCsv(d));
 for(const row of rows.slice(1)){if(row[5]==="'Imputado"){assert.equal(row[18],'');assert.equal(row[19],"'0");}else assert.deepEqual(row.slice(15,27),Array(12).fill(''));}
});
test('el archivo no agrega nombres, DNI, UUID, motivos o identidades de los revisores',async()=>{
 const d=await approved(),csv=await approvedImputationCsv(d);
 for(const e of d.source.group.snapshot.employees)assert.ok(!csv.includes(e.contractId));for(const id of [d.proposal.id,d.source.group.groupId,d.source.configuration.proposalId,d.source.configuration.approvalId])assert.ok(!csv.includes(id));for(const text of [d.body.reason,d.proposal.authorLabel,d.proposal.decision.actorLabel,d.proposal.decision.reason])assert.ok(!csv.includes(text));
});
for(const status of ['pending','rejected'])test('impide descargar una propuesta '+status,async()=>{
 const d=await approved();d.proposal.status=status;d.proposal.decision=status==='pending'?null:{...d.proposal.decision,command:'reject',revision:0};await assert.rejects(approvedImputationCsv(d),e=>e.code==='IMPUTATION_EXPORT_UNAVAILABLE');
});
test('cierre reabierto, configuración cambiada o revisión reemplazada impiden la copia vigente',async()=>{
 const d=await approved();d.sourceCurrent=false;await assert.rejects(approvedImputationCsv(d),e=>e.code==='IMPUTATION_EXPORT_UNAVAILABLE');
});
test('rechaza una distribución recortada o un importe alterado aunque la decisión diga aprobada',async()=>{
 for(const modify of [d=>d.allocation.rows.pop(),d=>d.allocation.rows[0].amount='0.00',d=>d.source.group.snapshot.concepts.pop(),d=>d.proposal.decision.revision=2]){const d=await approved();modify(d);await assert.rejects(approvedImputationCsv(d));}
});
test('un grupo parcial conserva todas sus filas y declara sus cantidades sin presentarse como nómina completa',async()=>{
 const d=await approved(31,s=>{s.group.snapshot.populationCount=869;s.group.snapshot.populationComplete=false;}),rows=readCsv(await approvedImputationCsv(d));
 assert.equal(rows.length,d.allocation.conceptCount+1);for(const r of rows.slice(1))assert.deepEqual(r.slice(29),['31','869',"'Grupo parcial"]);
});
