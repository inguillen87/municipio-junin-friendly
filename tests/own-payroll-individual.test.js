import test from 'node:test';
import assert from 'node:assert/strict';
import {detail,command,receipt} from './fixtures/own-payroll-liquidation-synthetic.js';
import {saved} from './fixtures/own-payroll-run-synthetic.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {ownRunWorkspaceRows,formatOwnRunDecimal} from '../assets/own-payroll-run-workspace-model.js';
import {ownLiquidationIndividual,ownLiquidationNextPreparation,ownLiquidationDecisionPreparation,verifiedOwnLiquidationDetail,verifiedOwnLiquidationReceipt} from '../assets/own-payroll-liquidation-model.js';
function annul(d,selection={kind:'all',values:[]}){
 const people=d.employees.filter(e=>selection.kind==='all'||selection.values.includes(e.contractId));
 for(const [index,e]of people.entries()){e.state='annulled';e.version=2;e.liquidationVersion=1;e.allowedCommands=[];e.events=[{id:uid(400+index*2),command:'confirm',version:1,liquidationVersion:1,recordedAt:'2026-10-08T12:00:00Z',actorLabel:'Revisor sintético',reason:'Confirmación exclusivamente sintética'},{id:uid(401+index*2),command:'annul',version:2,liquidationVersion:1,recordedAt:'2026-10-08T12:01:00Z',actorLabel:'Revisor sintético',reason:'Anulación exclusivamente sintética'}];}
 const body=command({runId:d.id,resultSha256:d.capture.saved.resultSha256,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,command:'annul',selection});
 return receipt({runId:d.id,resultSha256:body.resultSha256,body,bodySha256:ownRunHash(body),affected:people.map(e=>({contractId:e.contractId,state:e.state,version:e.version,liquidationVersion:e.liquidationVersion}))});
}
test('resumen individual completo conserva los seis conceptos aunque la corrida tenga 246 filas y una búsqueda activa',()=>{
 const d=detail(41),id=d.employees.at(-1).contractId,before=structuredClone(d);
 const filtered=ownRunWorkspaceRows(d.capture,'1001',2,25);assert.ok(filtered.rows.every(r=>r.contractId!==id));
 const summary=ownLiquidationIndividual(d,id);assert.equal(summary.complete,true);assert.equal(summary.rows.length,6);assert.deepEqual(summary.rows,d.capture.saved.result.rows.filter(r=>r.contractId===id));assert.deepEqual(summary.totals,d.capture.saved.result.employeeTotals.at(-1));assert.deepEqual(d,before);
 summary.rows[0].amount='0.00';assert.deepEqual(d,before);
});
test('anulación conserva conceptos y neto original y separa el estado histórico sin inventar cero',()=>{
 const d=detail(),id=d.employees[0].contractId,original=ownLiquidationIndividual(d,id);annul(d,{kind:'contracts',values:[id]});
 const historical=ownLiquidationIndividual(d,id);assert.equal(historical.state,'annulled');assert.equal(historical.liquidationVersion,1);assert.equal(historical.events.length,2);assert.deepEqual(historical.rows,original.rows);assert.deepEqual(historical.totals,original.totals);assert.notEqual(historical.totals.net,'0.00');assert.equal(ownLiquidationIndividual(d,d.employees[1].contractId).state,'calculated');
});
test('cancelación conserva su cálculo y no fabrica versión confirmada',()=>{
 const d=detail(),e=d.employees[0];e.state='cancelled';e.version=1;e.allowedCommands=[];e.events=[{id:uid(410),command:'cancel',version:1,liquidationVersion:null,recordedAt:'2026-10-08T12:00:00Z',actorLabel:'Preparador sintético',reason:'Cancelación exclusivamente sintética'}];
 const s=ownLiquidationIndividual(d,e.contractId);assert.equal(s.state,'cancelled');assert.equal(s.liquidationVersion,null);assert.deepEqual(s.totals,d.capture.saved.result.employeeTotals[0]);
});
test('identidad inexistente y resultado incompleto nunca ofrecen resumen parcial',()=>{
 const d=detail();assert.throws(()=>ownLiquidationIndividual(d,uid(999)));assert.throws(()=>ownLiquidationIndividual(d,'1001'));
 d.capture.saved.result.rows.pop();d.capture.saved.result.rowCount--;assert.throws(()=>ownLiquidationIndividual(d,d.employees[0].contractId));
});
test('valor grande y ocho decimales permanecen exactos en el resumen, sin conversión a Number',()=>{
 const d=detail(),id=d.employees[0].contractId;d.capture.saved.result.employeeTotals[0].net='9007199254740993.00000001';
 const s=ownLiquidationIndividual(d,id);assert.equal(s.totals.net,'9007199254740993.00000001');assert.equal(formatOwnRunDecimal(s.totals.net),'$ 9.007.199.254.740.993,00000001');
});
test('trasladar todos conserva los 869 legajos afectados sin filtros ni límite de una página',()=>{
 const d=detail(869),r=annul(d),before=structuredClone({d,r});ownRunWorkspaceRows(d.capture,'1001',1,25);
 const next=ownLiquidationNextPreparation(d,r);assert.equal(next.selection.kind,'contracts');assert.equal(next.selection.values.length,869);assert.equal(next.affected.length,869);assert.equal(next.period,d.capture.body.period);assert.equal(next.liquidationType,d.capture.body.liquidationType);assert.deepEqual(next.selection.values,r.affected.map(e=>e.contractId).sort());assert.deepEqual({d,r},before);
});
test('todos de una corrida parcial no amplía la preparación a toda la población capturada',()=>{
 const d=detail(6),id=d.employees[0].contractId;d.capture.body.selection={kind:'contracts',values:[id]};d.capture.bodySha256=ownRunHash(d.capture.body);d.capture.payload.selection=structuredClone(d.capture.body.selection);d.capture.payloadSha256=ownRunHash(d.capture.payload);d.capture.saved=saved(d.capture);d.employees=d.employees.filter(e=>e.contractId===id);
 const r=annul(d),next=ownLiquidationNextPreparation(d,r);assert.equal(d.capture.saved.input.employees.length,6);assert.deepEqual(next.selection,{kind:'contracts',values:[id]});assert.equal(next.affected.length,1);
});
test('un legajo anulado no traslada al compañero sin anular ni copia motivos o importes',()=>{
 const d=detail(),id=d.employees[0].contractId,r=annul(d,{kind:'contracts',values:[id]}),next=ownLiquidationNextPreparation(d,r);
 assert.deepEqual(next.selection,{kind:'contracts',values:[id]});assert.equal(next.affected.length,1);assert.equal(next.affected[0].employeeNumber,d.capture.saved.input.employees[0].employeeNumber);assert.equal(next.reason,undefined);assert.equal(next.totals,undefined);assert.equal(next.reviewConfirmed,undefined);assert.equal(d.employees[1].state,'calculated');
});
test('un comprobante de otra corrida, otro resultado o alcance cambiado no habilita la continuación',()=>{
 const d=detail(),r=annul(d);for(const change of [v=>{v.runId=uid(990);v.body.runId=v.runId;},v=>{v.resultSha256=hash('f');v.body.resultSha256=v.resultSha256;},v=>{v.affected.pop();},v=>{v.affected[0].version++;}]){const bad=structuredClone(r);change(bad);assert.throws(()=>ownLiquidationNextPreparation(d,bad));}
 assert.throws(()=>ownLiquidationNextPreparation(detail(),receipt()));
});
test('la continuación verifica el cuerpo original del comprobante y la integridad del cálculo antes de mostrar',async()=>{
 const d=detail(),r=annul(d);assert.equal(await verifiedOwnLiquidationReceipt(r),r);assert.equal(await verifiedOwnLiquidationDetail(d),d);
 await assert.rejects(verifiedOwnLiquidationReceipt({...r,bodySha256:hash('f')}));const changed=structuredClone(d);changed.capture.saved.result.rows[0].amount='0.00';await assert.rejects(verifiedOwnLiquidationDetail(changed));
});
test('un legajo anulado que ya tiene otra liquidación confirmada vigente no se prepara de nuevo; el resto del conjunto tampoco se recorta',()=>{
 const d=detail(6),r=annul(d),other=uid(991);
 assert.equal(ownLiquidationNextPreparation(d,r).affected.length,6);
 // blockedBy is the current detail's own signal: the contract is confirmed in another run of the period/type.
 d.employees[5].blockedBy=other;
 assert.throws(()=>ownLiquidationNextPreparation(d,r),/ya tiene otra liquidación confirmada/);
 assert.throws(()=>ownLiquidationNextPreparation(d,{...r,affected:r.affected.slice(0,5)}));
 // A blocked contract outside the annulled scope does not affect a partial continuation.
 const partial=detail(),id=partial.employees[0].contractId,receiptPartial=annul(partial,{kind:'contracts',values:[id]});
 partial.employees[1].blockedBy=other;partial.employees[1].allowedCommands=[];
 assert.deepEqual(ownLiquidationNextPreparation(partial,receiptPartial).selection,{kind:'contracts',values:[id]});
});

// Proposed causal tests: cross-user continuation of an INDIVIDUAL annul decision.
// One stored decision event covers every affected contract (SQL124 events carry
// e.id); the preparer only holds the run's current authenticated detail.
// Synthetic id spaces never meet: confirms uid(100000+index), the decision
// uid(700), run uid(90), key uid(9), receipt uid(80); 869 contracts stay unique.
function annulDecision(d,selection={kind:'all',values:[]},decisionId=uid(700)){
 const people=d.employees.filter(e=>selection.kind==='all'||selection.values.includes(e.contractId));
 for(const [index,e]of people.entries()){e.state='annulled';e.version=2;e.liquidationVersion=1;e.allowedCommands=[];e.events=[{id:uid(100000+index),command:'confirm',version:1,liquidationVersion:1,recordedAt:'2026-10-08T12:00:00Z',actorLabel:'Revisor sintético',reason:'Confirmación exclusivamente sintética'},{id:decisionId,command:'annul',version:2,liquidationVersion:1,recordedAt:'2026-10-08T12:01:00Z',actorLabel:'Revisor sintético',reason:'Anulación exclusivamente sintética'}];}
 return decisionId;
}
test('la decisión individual se reconstruye completa desde la lectura autenticada de la corrida, sin comprobante, clave ni identidad del revisor',()=>{
 const d=detail(6),chosen=d.employees.slice(0,3).map(e=>e.contractId),decisionId=annulDecision(d,{kind:'contracts',values:chosen}),before=structuredClone(d);
 const next=ownLiquidationDecisionPreparation(d,decisionId);
 assert.deepEqual(next.selection,{kind:'contracts',values:[...chosen].sort()});assert.equal(next.affected.length,3);
 for(const row of next.affected)assert.equal(row.employeeNumber,d.capture.saved.input.employees.find(p=>p.contractId===row.contractId).employeeNumber);
 assert.equal(next.runId,d.id);assert.equal(next.decisionId,decisionId);assert.equal(next.stateVersion,d.stateVersion);assert.equal(next.period,d.capture.body.period);assert.equal(next.liquidationType,d.capture.body.liquidationType);assert.equal(next.liquidationDate,d.capture.body.liquidationDate??null);
 for(const secret of ['receiptKey','key','reason','totals','reviewConfirmed','actorLabel','sourceReference'])assert.equal(Object.hasOwn(next,secret),false);
 assert.ok(d.employees.slice(3).every(e=>e.state==='calculated'));assert.deepEqual(d,before);
});
test('todos de la corrida y una corrida parcial conservan exactamente los legajos de la decisión, sin ampliar ni recortar',()=>{
 const whole=detail(869),wholeId=annulDecision(whole);ownRunWorkspaceRows(whole.capture,'1001',1,25);
 const all=ownLiquidationDecisionPreparation(whole,wholeId);assert.equal(all.selection.values.length,869);assert.equal(all.affected.length,869);assert.deepEqual(all.selection.values,whole.employees.map(e=>e.contractId).sort());
 const partial=detail(6),id=partial.employees[0].contractId;partial.capture.body.selection={kind:'contracts',values:[id]};partial.capture.bodySha256=ownRunHash(partial.capture.body);partial.capture.payload.selection=structuredClone(partial.capture.body.selection);partial.capture.payloadSha256=ownRunHash(partial.capture.payload);partial.capture.saved=saved(partial.capture);partial.employees=partial.employees.filter(e=>e.contractId===id);
 const partialId=annulDecision(partial),next=ownLiquidationDecisionPreparation(partial,partialId);assert.equal(partial.capture.saved.input.employees.length,6);assert.deepEqual(next.selection,{kind:'contracts',values:[id]});assert.equal(next.affected.length,1);
});
test('una confirmación, un identificador ajeno o una corrida sin esa decisión nunca preparan un alcance',()=>{
 const d=detail(),decisionId=annulDecision(d,{kind:'contracts',values:[d.employees[0].contractId]});
 assert.throws(()=>ownLiquidationDecisionPreparation(d,d.employees[0].events[0].id));
 assert.throws(()=>ownLiquidationDecisionPreparation(d,uid(999)));assert.throws(()=>ownLiquidationDecisionPreparation(d,d.id));assert.throws(()=>ownLiquidationDecisionPreparation(d,'not-a-uuid'));
 assert.throws(()=>ownLiquidationDecisionPreparation(detail(),decisionId));
});
test('otra liquidación confirmada vigente en otra corrida bloquea la decisión completa, no sólo ese legajo',()=>{
 const d=detail(6),decisionId=annulDecision(d);d.employees[4].blockedBy=uid(880);
 assert.throws(()=>ownLiquidationDecisionPreparation(d,decisionId),/otra liquidación confirmada/);
 d.employees[4].blockedBy=null;assert.equal(ownLiquidationDecisionPreparation(d,decisionId).affected.length,6);
});
test('un legajo cuyo último evento no es la decisión referida no se traslada y rechaza el conjunto',()=>{
 const d=detail(6),decisionId=annulDecision(d,{kind:'contracts',values:d.employees.slice(0,2).map(e=>e.contractId)});
 // A third contract carries the same decision id as a CONFIRM (consistent DTO):
 // the id alone never prepares; the command and final state must match.
 const tampered=structuredClone(d);tampered.employees[2].events=[{...tampered.employees[0].events[1],command:'confirm',version:1}];tampered.employees[2].state='confirmed';tampered.employees[2].version=1;tampered.employees[2].liquidationVersion=1;tampered.employees[2].allowedCommands=['annul'];
 assert.throws(()=>ownLiquidationDecisionPreparation(tampered,decisionId));
 // A changed liquidation version is rejected by the DTO or the model; never a partial set.
 const versioned=structuredClone(d);versioned.employees[1].events[1].liquidationVersion=2;versioned.employees[1].liquidationVersion=2;
 assert.throws(()=>ownLiquidationDecisionPreparation(versioned,decisionId));
 assert.equal(ownLiquidationDecisionPreparation(d,decisionId).affected.length,2);
});
