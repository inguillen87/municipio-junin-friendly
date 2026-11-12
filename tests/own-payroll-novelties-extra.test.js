// Novedades del mes: el movimiento «tal como figura en el origen» y los demás datos de cada fila.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {OWN_NOVELTY_MOVEMENTS,OWN_NOVELTY_MOVEMENT_OTHER,ownNoveltyMovementValue,ownNoveltyMovementLabel,ownNoveltyMovementChoice,ownNoveltyRowExtras} from '../assets/own-payroll-novelties-extra.js';
import {ownNoveltyCommand} from '../assets/own-payroll-novelties-model.js';

const uid=n=>'70000000-0000-4000-8000-'+String(n).padStart(12,'0');
const row=(n,over={})=>({rowOrdinal:n,legajo:String(1000+n),contractId:uid(n),identityToken:String(n).repeat(64).slice(0,64).replace(/[^a-f0-9]/g,'a'),conceptSourceId:'609',costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:null,amountCents:'100',movementType:null,legalInstrument:null,observation:null,forced:false,...over});
const body=rows=>({command:'prepare',periodMonth:'2026-10-01',payrollType:'monthly',rows,reviewConfirmed:true});

test('la lista ofrece los movimientos habituales y uno de origen, sin inventar categorías',()=>{
  assert.deepEqual(OWN_NOVELTY_MOVEMENTS,{standard:'Normal',adjustment:'Ajuste'});
  assert.equal(ownNoveltyMovementValue('',''),null);assert.equal(ownNoveltyMovementValue('','m'),null);
  assert.equal(ownNoveltyMovementValue('standard',''),'standard');assert.equal(ownNoveltyMovementValue('adjustment','x'),'adjustment');
  assert.equal(ownNoveltyMovementValue(OWN_NOVELTY_MOVEMENT_OTHER,'m'),'m');assert.equal(ownNoveltyMovementValue(OWN_NOVELTY_MOVEMENT_OTHER,'  m  '),'m');
  assert.equal(ownNoveltyMovementValue(OWN_NOVELTY_MOVEMENT_OTHER,'alta-2.b_1'),'alta-2.b_1');
});

test('el movimiento de origen se guarda tal cual o no se guarda: no se corrige ni se traduce',()=>{
  for(const bad of ['','   ','M','Ajuste','con espacio','-m','ñ','a'.repeat(33),null,undefined])assert.throws(()=>ownNoveltyMovementValue(OWN_NOVELTY_MOVEMENT_OTHER,bad),/movimiento/i);
  assert.throws(()=>ownNoveltyMovementValue('otra-cosa','m'),/Elegí el movimiento de la lista/);
  // El valor que acepta la pantalla es exactamente el que acepta el modelo de la fila.
  for(const value of ['m','standard','adjustment','alta-2.b_1','0'])assert.equal(ownNoveltyCommand(body([row(1,{movementType:value})])).rows[0].movementType,value);
});

test('«m», sin movimiento, cantidad cero y forzado sobreviven del formulario a la propuesta',()=>{
  const observation='Fuente: legamov de octubre 2026, respaldo 09/11. Cargado por Claude (asistente) a pedido de Marcelo.';
  const sent=body([
    row(1,{conceptSourceId:'609',costCenterSourceId:'19',adjustmentMonth:'2026-10-01',quantityDecimal:'0',amountCents:'4000000',movementType:ownNoveltyMovementValue(OWN_NOVELTY_MOVEMENT_OTHER,'m'),observation,forced:true}),
    row(2,{conceptSourceId:'639',costCenterSourceId:'2',quantityDecimal:'0',amountCents:'1500000',movementType:ownNoveltyMovementValue('',''),observation}),
    row(3,{conceptSourceId:'649',costCenterSourceId:'22',adjustmentMonth:'2026-10-01',quantityDecimal:'0',amountCents:'3004138',movementType:ownNoveltyMovementValue(OWN_NOVELTY_MOVEMENT_OTHER,'m'),observation,forced:true}),
  ]);
  const command=ownNoveltyCommand(sent),again=ownNoveltyCommand(JSON.parse(JSON.stringify(command)));
  assert.deepEqual(command.rows.map(r=>[r.conceptSourceId,r.movementType,r.quantityDecimal,r.amountCents,r.forced,r.adjustmentMonth,r.costCenterSourceId]),[
    ['609','m','0','4000000',true,'2026-10-01','19'],['639',null,'0','1500000',false,null,'2'],['649','m','0','3004138',true,'2026-10-01','22']]);
  assert.deepEqual(again.rows,command.rows);
  // El movimiento forma parte de la identidad de la fila: «m» y sin movimiento son destinos distintos, no un duplicado.
  assert.equal(ownNoveltyCommand(body([row(1,{movementType:'m'}),row(2,{contractId:uid(1),identityToken:row(1).identityToken,legajo:'1001',movementType:null})])).rows.length,2);
});

test('lo guardado se lee con su nombre, y el de origen entre comillas',()=>{
  assert.equal(ownNoveltyMovementLabel(null),'Sin movimiento');assert.equal(ownNoveltyMovementLabel('standard'),'Normal');assert.equal(ownNoveltyMovementLabel('adjustment'),'Ajuste');
  assert.equal(ownNoveltyMovementLabel('m'),'«m» (tal como figura en el origen)');
  assert.deepEqual(ownNoveltyMovementChoice('m'),{choice:OWN_NOVELTY_MOVEMENT_OTHER,other:'m'});assert.deepEqual(ownNoveltyMovementChoice(null),{choice:'',other:''});assert.deepEqual(ownNoveltyMovementChoice('adjustment'),{choice:'adjustment',other:''});
  for(const value of [null,'standard','adjustment','m','alta-2.b_1']){const c=ownNoveltyMovementChoice(value);assert.equal(ownNoveltyMovementValue(c.choice,c.other),value);}
});

test('los demás datos de la fila se muestran completos y sólo si están informados',()=>{
  assert.deepEqual(ownNoveltyRowExtras(row(1)),[]);
  assert.deepEqual(ownNoveltyRowExtras(row(1,{forced:true,costCenterSourceId:'19',adjustmentMonth:'2026-10-01',movementType:'m',legalInstrument:'Resolución 12/2026',observation:'Fuente: legamov'})),
    ['Importe forzado','Centro de costo 19','Mes de ajuste 10/2026','Movimiento: «m» (tal como figura en el origen)','Instrumento: Resolución 12/2026','Observación: Fuente: legamov']);
  assert.deepEqual(ownNoveltyRowExtras(row(1,{costCenterSourceId:'0',movementType:'standard'})),['Centro de costo 0','Movimiento: Normal']);
});

test('la pantalla usa el campo de origen, muestra los demás datos en la revisión y publica el módulo',()=>{
  const panel=fs.readFileSync('assets/own-payroll-novelties-panel.js','utf8'),build=fs.readFileSync('scripts/build-friendly.mjs','utf8');
  assert.match(panel,/<option value="\$\{OWN_NOVELTY_MOVEMENT_OTHER\}">Otro movimiento documentado<\/option>/);
  assert.match(panel,/movementType:ownNoveltyMovementValue\(\$\('movement'\)\.value,\$\('movement-other'\)\.value\)/);
  assert.doesNotMatch(panel,/movementType:\$\('movement'\)\.value/);
  assert.match(panel,/\['Fila','Legajo','Concepto','Unidades','Importe en pesos','Otros datos',\.\.\.\(editable\?\['Acción'\]:\[\]\)\]/);
  assert.match(panel,/extras=ownNoveltyRowExtras\(r\)/);
  assert.match(build,/'assets\/own-payroll-novelties-extra\.js'/);
});
