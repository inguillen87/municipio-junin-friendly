import test from 'node:test';
import assert from 'node:assert/strict';
import {closeDetail,closeCommand,closeReceipt} from './fixtures/own-payroll-close-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {ownCloseCommand,ownCloseDetail,selectedOwnCloseRows,ownCloseSnapshot,ownCloseAttempt,ownCloseReceipt,verifiedOwnCloseDetail,verifiedOwnCloseReceipt,OWN_CLOSE_TOTAL_KEYS} from '../assets/own-payroll-close-model.js';
import {decimal,rational,exactAdd,quantize} from '../assets/own-payroll-exact.js';
import {OWN_RUN_TYPES} from '../assets/own-payroll-run-workspace-model.js';

test('cierre reúne todas las páginas y corridas sin sumar dos veces el mismo legajo',()=>{
 const d=closeDetail(61),before=JSON.stringify(d),snapshot=ownCloseSnapshot(d,{kind:'all',values:[]});
 assert.equal(snapshot.employeeCount,61);assert.equal(snapshot.populationComplete,true);assert.equal(new Set(snapshot.employees.map(e=>e.contractId)).size,61);assert.equal(new Set(snapshot.employees.map(e=>e.runId)).size,2);
 for(const key of OWN_CLOSE_TOTAL_KEYS){let expected=rational(0n);for(const employee of snapshot.employees)expected=exactAdd(expected,decimal(employee.totals[key]));assert.equal(snapshot.totals[key],quantize(expected,{precision:snapshot.precision,mode:'exact'}).amount);}
 assert.equal(snapshot.concepts.length,d.captures[0].saved.result.rowCount);assert.equal(JSON.stringify(d),before);assert.equal(snapshot.payrollPosted,false);assert.equal(snapshot.paymentExecuted,false);
});
test('selección parcial conserva cobertura explícita y no representa cierre completo',()=>{
 const d=closeDetail(41),selection={kind:'contracts',values:[d.rows[40].contractId]},snapshot=ownCloseSnapshot(d,selection);
 assert.equal(snapshot.employeeCount,1);assert.equal(snapshot.populationCount,41);assert.equal(snapshot.populationComplete,false);assert.equal(snapshot.employees[0].runId,d.rows[40].runId);
 for(const kind of ['agreements','departments'])assert.equal(selectedOwnCloseRows(d,{kind,values:[d.rows[0][kind==='agreements'?'agreementCode':'departmentCode']]}).length,41);
});
test('destino sin confirmar, cerrado o sin separación de funciones invalida todo el alcance',()=>{
 for(const change of [{state:'missing',runId:null,resultSha256:null,liquidationVersion:null,groupId:null,canClose:false},{state:'closed',groupId:uid(500),canClose:false},{canClose:false}]){const d=closeDetail(41);Object.assign(d.rows[40],change);assert.throws(()=>ownCloseSnapshot(d,{kind:'all',values:[]}));}
 const d=closeDetail();assert.throws(()=>selectedOwnCloseRows(d,{kind:'contracts',values:[d.rows[0].contractId,uid(900)]}));
});
test('cálculos de otro tipo, metadatos alterados y destinos duplicados no acreditan cierre',()=>{
 for(const mutate of [d=>{d.captures[1].body.liquidationType='vacation';},d=>{d.rows[0].agreementCode='999';},d=>{d.rows[0].resultSha256='f'.repeat(64);},d=>{d.rows.push(structuredClone(d.rows[0]));},d=>{d.complete=false;}]){const d=closeDetail();mutate(d);assert.throws(()=>ownCloseDetail(d));}
});
test('importe ausente conserva su ausencia: no se supone cero para cerrar',()=>{const d=closeDetail();d.captures[0].saved.result.employeeTotals[0].net=null;assert.throws(()=>ownCloseSnapshot(d,{kind:'all',values:[]}));});
test('los siete tipos admitidos mantienen su identidad y rechazan fechas o tipos inventados',()=>{
 for(const liquidationType of Object.keys(OWN_RUN_TYPES))assert.equal(ownCloseCommand(closeCommand({liquidationType})).liquidationType,liquidationType);
 for(const patch of [{period:'2026-13'},{liquidationType:'inventado'},{reason:'breve'},{reviewConfirmed:false},{groupId:uid(400)},{amount:'0'},{actorPersonId:uid(2)},{search:'persona'},{page:2}])assert.throws(()=>ownCloseCommand(closeCommand(patch)));
});
test('reapertura y reintento no reemplazan cuerpo ni clave originales',()=>{
 const body=closeCommand({command:'reopen',groupId:uid(400)}),attempt=ownCloseAttempt(uid(500),body,'synthetic-access');body.reason='Otro motivo después de congelar';
 assert.equal(attempt.key,uid(500));assert.notEqual(attempt.body.reason,body.reason);assert.ok(Object.isFrozen(attempt.body.selection.values));assert.throws(()=>{attempt.body.groupId=uid(401);});
 assert.throws(()=>ownCloseCommand(closeCommand({command:'reopen',groupId:uid(400),selection:{kind:'contracts',values:[uid(1)]}})));
});
test('un total numérico alterado o conceptos faltantes nunca acreditan un cierre',()=>{for(const change of [d=>{d.captures[0].saved.result.employeeTotals[0].net='0.00';},d=>{d.captures[0].saved.result.rows.pop();},d=>{d.captures[0].saved.result.employeeTotals.push(structuredClone(d.captures[0].saved.result.employeeTotals[0]));}]){const d=closeDetail();change(d);assert.throws(()=>ownCloseSnapshot(d,{kind:'all',values:[]}));}});
test('integridad de fuentes e histórico se comprueba antes de presentar un cierre',async()=>{await verifiedOwnCloseDetail(closeDetail());await verifiedOwnCloseReceipt(closeReceipt());const d=closeDetail();d.captures[0].payloadSha256='f'.repeat(64);await assert.rejects(verifiedOwnCloseDetail(d));const r=closeReceipt();r.snapshotSha256='f'.repeat(64);await assert.rejects(verifiedOwnCloseReceipt(r));});
test('el recibo rechaza recortes, duplicados, totales y cobertura falsa aunque concuerde la clave',()=>{for(const change of [r=>r.snapshot.employees.pop(),r=>r.snapshot.concepts.pop(),r=>{r.snapshot.populationCount++;},r=>{r.snapshot.totals.net='0.00';},r=>r.snapshot.concepts.push(structuredClone(r.snapshot.concepts[0])),r=>{r.groupId=uid(401);},r=>{r.snapshot.employees[0].employeeNumber='999';}]){const r=closeReceipt();change(r);assert.throws(()=>ownCloseReceipt(r));}const r=closeReceipt();assert.throws(()=>ownCloseReceipt(r,{key:r.key,body:r.body,snapshot:{...r.snapshot,concepts:[]}}));});
test('historial inexistente y estados globales inventados no habilitan reaperturas',()=>{for(const patch of [{groups:[{id:uid(400),state:'closed'}]},{rows:[] ,complete:false}])assert.throws(()=>ownCloseDetail({...closeDetail(),...patch}));});
