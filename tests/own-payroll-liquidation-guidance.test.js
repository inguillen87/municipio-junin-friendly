import test from 'node:test';
import assert from 'node:assert/strict';
import {ownDecisionCounts,ownDecisionScopeText,ownDecisionHistoryText} from '../assets/own-payroll-liquidation-panel.js';
import {ownLiquidationReview} from '../assets/own-payroll-liquidation-model.js';
import {detail} from './fixtures/own-payroll-liquidation-synthetic.js';
test('la guía sigue las decisiones del servidor y el permiso de la sesión: no adivina el autor',()=>{
 const data=detail(2);data.employees[0].allowedCommands=['cancel'];data.employees[1].allowedCommands=[];
 const caps={confirm:true,annul:true,cancel:false},counts=ownDecisionCounts(data.employees,cmd=>caps[cmd]);
 assert.deepEqual(counts.map(x=>[x.command,x.eligible,x.permitted]),[['confirm',0,true],['annul',0,true],['cancel',1,false]]);
 assert.deepEqual(data.employees.map(e=>e.allowedCommands),[['cancel'],[]]);
});
test('alcance mixto muestra elegibles sobre total sin recortar; búsqueda visual no interviene',()=>{
 const d=detail(2);d.employees[0].allowedCommands=[];const view=ownLiquidationReview(d,{kind:'all',values:[]},'confirm');
 assert.equal(view.count,2);assert.equal(view.allowed,false);const original=structuredClone(view);
 assert.match(ownDecisionScopeText(view,'confirm',true),/1 de 2 admiten «Confirmar»/);assert.deepEqual(view,original);
 assert.match(ownDecisionScopeText(view,'confirm',false),/no tiene permiso/);
 const only=ownLiquidationReview(d,{kind:'contracts',values:[d.employees[1].contractId]},'confirm');
 assert.match(ownDecisionScopeText(only,'confirm',true),/^1 legajo seleccionado\. Admite la decisión/);
});
test('historial vacío no indica elegir una corrida inexistente y distingue imposibilidad de consultar',()=>{
 assert.match(ownDecisionHistoryText([],true),/no hay resultados calculados/);
 assert.match(ownDecisionHistoryText([{canConsult:false}],true),/no puede consultar/);
 assert.match(ownDecisionHistoryText([{canConsult:true}],false),/no puede consultar/);
 assert.match(ownDecisionHistoryText([{canConsult:true}],true),/Elegí una corrida/);
});

test('el conteo de legajos concuerda en número: «1 legajo afectado», «29 legajos afectados»', async () => {
  const { ownLegajoCount } = await import('../assets/own-payroll-liquidation-panel.js');
  assert.equal(ownLegajoCount(1, 'afectado', 'afectados'), '1 legajo afectado');
  assert.equal(ownLegajoCount(29, 'afectado', 'afectados'), '29 legajos afectados');
  assert.equal(ownLegajoCount(1, 'registrado', 'registrados'), '1 legajo registrado');
  assert.equal(ownLegajoCount(0, 'registrado', 'registrados'), '0 legajos registrados');
  const fs = await import('node:fs');
  const liquidation = fs.readFileSync(new URL('../assets/own-payroll-liquidation-panel.js', import.meta.url), 'utf8');
  assert.doesNotMatch(liquidation, /\} legajos (registrados|afectados)/, 'ningún conteo queda con el plural fijo');
  assert.equal(liquidation.split("ownLegajoCount(v.affected.length,'registrado','registrados')").length - 1, 2);
  assert.match(liquidation, /ownLegajoCount\(v\.count,'afectado','afectados'\)\} de esta corrida\./);
  // Cerrar: «Cierre registrado» y «Reapertura registrada», y el singular del conteo.
  const close = fs.readFileSync(new URL('../assets/own-payroll-close-panel.js', import.meta.url), 'utf8');
  assert.doesNotMatch(close, /'Cierre':'Reapertura'\} registrada/);
  assert.equal(close.split("v.body.command==='close'?'Cierre registrado':'Reapertura registrada'").length - 1, 2);
  assert.equal(close.split("v.snapshot.employeeCount===1?'1 legajo':v.snapshot.employeeCount+' legajos'").length - 1, 2);
});
