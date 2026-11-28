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

test('los conteos del circuito se leen en singular cuando son uno, en las diez pantallas', async () => {
  const fs = await import('node:fs');
  const { countWords } = await import('../assets/count-words.js');
  assert.equal(countWords(1, 'legajo', 'legajos'), '1 legajo');
  assert.equal(countWords(0, 'fila', 'filas'), '0 filas');
  assert.equal(countWords(29, 'recibo', 'recibos'), '29 recibos');
  assert.equal(countWords('1', 'corrida', 'corridas'), '1 corrida', 'el conteo que llega como texto se lee igual');
  assert.equal(countWords('1.234', 'legajo', 'legajos'), '1.234 legajos', 'mil doscientos treinta y cuatro no es uno');
  const { ownReportCount } = await import('../assets/own-payroll-report-model.js');
  assert.equal(ownReportCount, countWords, 'Informes usa el mismo ayudante');
  const fixedPlural = /\$\{[^{}]+\} (legajos|filas|recibos|corridas|contratos|conceptos|renglones|reparticiones|registros)(?![a-záéíóúñ])/;
  for (const name of ['novelties-panel', 'liquidation-panel', 'annulment-panel', 'close-panel', 'summary-panel', 'receipt-panel', 'receipt-planilla-panel', 'receipt-planilla-export', 'receipt-self', 'report-panel']) {
    const source = fs.readFileSync(new URL('../assets/own-payroll-' + name + '.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, fixedPlural, name + ': ningún conteo queda con el plural fijo');
  }
  const receipts = fs.readFileSync(new URL('../assets/own-payroll-receipt-panel.js', import.meta.url), 'utf8');
  assert.match(receipts, /import \{countWords as howMany\} from '\.\/count-words\.js';/);
  const novelties = fs.readFileSync(new URL('../assets/own-payroll-novelties-panel.js', import.meta.url), 'utf8');
  assert.match(novelties, /\$\{detail\.rowCount===1\?'la fila':'las '\+detail\.rowCount\+' filas'\} del lote completo\./);
  assert.match(novelties, /\$\{added\.length===1\?'Agregada 1 fila':'Agregadas '\+added\.length\+' filas'\}\./);
  const close = fs.readFileSync(new URL('../assets/own-payroll-close-panel.js', import.meta.url), 'utf8');
  assert.match(close, /\$\{g\.employeeCount===1\?'Se reabrirá el legajo':'Se reabrirán los '\+g\.employeeCount\+' legajos'\} del grupo completo\./);
});

