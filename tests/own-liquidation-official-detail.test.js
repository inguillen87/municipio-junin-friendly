// Confirmar, anular y revisar una liquidación leen el detalle con `ownLiquidationDetail`. Un resultado guardado con totales
// oficiales (V4) o con política de emisión (V5) se valida con el lector oficial: se comprueba la captura original y se vuelve a
// calcular entera. V1/V2 conservan su validador histórico y su mismo objeto. Corpus sintético del paquete de cierres.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {officialCloseCorpus,officialCapture,hash} from './fixtures/own-payroll-official-close-synthetic.js';
import {detail as historicalDetail} from './fixtures/own-payroll-liquidation-synthetic.js';
import {ownLiquidationDetail,verifiedOwnLiquidationDetail,ownLiquidationReview,ownLiquidationIndividual,ownLiquidationSelection} from '../assets/own-payroll-liquidation-model.js';

const all={kind:'all',values:[]};
const detailOf=capture=>({version:'own-liquidation-detail.v1',id:capture.id,scopeVersion:'a'.repeat(64),stateVersion:'b'.repeat(64),capture,
 employees:capture.saved.result.employeeTotals.map(t=>({contractId:t.contractId,state:'calculated',version:0,liquidationVersion:null,blockedBy:null,allowedCommands:['confirm','cancel'],events:[]})),
 effects:{paymentExecuted:false,accountingPosted:false,periodClosed:false},reviewAccessRequired:false});
const official=(name='days14_both_omitted')=>detailOf(officialCapture(name));

for(const fixture of officialCloseCorpus)test('el detalle acepta el resultado '+fixture.input.version.split('.').at(-1).toUpperCase()+' original y lo devuelve verificado en una copia: '+fixture.name,async()=>{
 const detail=official(fixture.name),before=JSON.stringify(detail);
 assert.equal(ownLiquidationDetail(detail),detail);
 const verified=await verifiedOwnLiquidationDetail(detail);
 assert.notEqual(verified,detail);assert.notEqual(verified.capture,detail.capture);assert.deepEqual(verified,detail);
 assert.equal(JSON.stringify(detail),before,'la verificación no modifica lo recibido');
 assert.equal(ownLiquidationSelection(verified,all,'confirm').count,fixture.result.employeeCount);
});

test('la revisión antes de confirmar muestra el neto oficial, no la suma de renglones, y no inventa un renglón de ajuste',()=>{
 const detail=official('days14_both_omitted'),result=detail.capture.saved.result;
 assert.equal(result.employeeTotals[0].net,'200.01');assert.equal(result.lineEmployeeTotals[0].net,'200.02');
 const review=ownLiquidationReview(detail,all,'confirm');
 assert.equal(review.totals.net,'200.01');assert.equal(review.rows[0].net,'200.01');assert.equal(review.count,1);assert.equal(review.allowed,true);
 const person=ownLiquidationIndividual(detail,result.employeeTotals[0].contractId);
 assert.equal(person.totals.net,'200.01');assert.equal(person.rows.length,12,'todos los renglones económicos, incluidos los que el recibo no imprime');
 assert.deepEqual(person.rows.filter(r=>['302','306'].includes(r.conceptCode)).map(r=>r.amount),['0.00','0.00']);
 assert.equal(person.paymentExecuted,false);
});

test('una población completa se revisa entera: 37 contratos y sus 444 renglones',()=>{
 const detail=official('full_population37');ownLiquidationDetail(detail);
 const review=ownLiquidationReview(detail,all,'confirm');assert.equal(review.count,37);assert.equal(review.rows.length,37);
 assert.equal(detail.capture.saved.result.rowCount,444);
});

test('un resultado V4/V5 alterado no se acepta: importe, total, renglón quitado, versión o contrato ajeno',()=>{
 const changes={
  'importe de un renglón':d=>{d.capture.saved.result.rows[0].amount='1.00';},
  'neto oficial':d=>{d.capture.saved.result.employeeTotals[0].net='999.99';},
  'neto de renglones':d=>{d.capture.saved.result.lineEmployeeTotals[0].net='200.01';},
  'un renglón menos':d=>{d.capture.saved.result.rows.pop();},
  'versión de entrada rebajada a la histórica':d=>{d.capture.saved.input.version='own-payroll-input.v2';},
  'período de la entrada':d=>{d.capture.saved.input.period='2026-09';},
  'detalle con un contrato de menos':d=>{d.employees=[];},
  'identificador de otra corrida':d=>{d.id='70000000-0000-4000-8000-000000009999';},
 };
 for(const [name,change]of Object.entries(changes)){const detail=official();change(detail);assert.throws(()=>ownLiquidationDetail(detail),undefined,name);}
});

test('la verificación con huellas rechaza un resultado cuyo contenido no corresponde a su huella guardada',async()=>{
 for(const key of ['inputSha256','resultSha256']){const detail=official();detail.capture.saved[key]='f'.repeat(64);ownLiquidationDetail(detail);await assert.rejects(verifiedOwnLiquidationDetail(detail),undefined,key);}
 for(const key of ['bodySha256','payloadSha256']){const detail=official();detail.capture[key]='f'.repeat(64);await assert.rejects(verifiedOwnLiquidationDetail(detail),undefined,key);}
 const detail=official();assert.equal(detail.capture.saved.resultSha256,hash(detail.capture.saved.result));await verifiedOwnLiquidationDetail(detail);
});

test('cambiar el objeto mientras se calculan las huellas no cambia lo verificado ni lo devuelto',async()=>{
 const detail=official(),expected=structuredClone(detail);
 const pending=verifiedOwnLiquidationDetail(detail);
 detail.capture.saved.result.employeeTotals[0].net='999.99';detail.employees[0].allowedCommands=['annul'];detail.capture.saved.result.rows.length=0;
 const verified=await pending;
 assert.deepEqual(verified,expected);assert.equal(verified.capture.saved.result.employeeTotals[0].net,'200.01');
 assert.throws(()=>ownLiquidationDetail(detail),'el objeto cambiado, leído otra vez, no pasa');
});

test('los resultados históricos conservan su validador y su mismo objeto',async()=>{
 const detail=historicalDetail();assert.ok(['own-payroll-input.v1','own-payroll-input.v2'].includes(detail.capture.saved.input.version));
 assert.equal(ownLiquidationDetail(detail),detail);assert.equal(await verifiedOwnLiquidationDetail(detail),detail);
 const lowered=historicalDetail();lowered.capture.saved.input.version='own-payroll-input.v4';
 assert.throws(()=>ownLiquidationDetail(lowered),undefined,'declarar V4 sobre un resultado histórico no lo convierte en oficial');
});

test('el lector se elige por la versión que declara el resultado guardado, con opt-in explícito', ()=>{
 const source=fs.readFileSync(new URL('../assets/own-payroll-liquidation-model.js',import.meta.url),'utf8');
 // `ownRunResult` es el lector por versión: histórico → validador histórico; V4/V5 → validador oficial, salvo la lectura ya
 // recordada de una captura congelada.
 assert.match(source,/const verified=ownRunResult\(v\.capture\);if\(!verified\|\|v\.capture\.id!==v\.id\|\|v\.employees\.length!==verified\.result\.employeeCount\)fail\(\);/);
 assert.match(source,/if\(!ownHistoricalOfficialInput\(v\?\.capture\?\.saved\?\.input\)\)\{ownLiquidationDetail\(v\);await verifiedWorkspaceCapture\(v\.capture\);return v;\}/,'la ruta histórica no cambia');
 assert.match(source,/const value=copyRowEmissionData\(v\);\n/,'la copia privada se toma antes del primer await');
 assert.match(source,/const verified=\{\.\.\.value,capture:rememberedRunCapture\(await verifiedOwnOfficialCapture\(value\.capture\)\)\};\n ownLiquidationDetail\(verified\);return verified;/);
 const runReader=fs.readFileSync(new URL('../assets/own-payroll-run-reader.js',import.meta.url),'utf8');
 assert.match(runReader,/if\(!ownHistoricalOfficialInput\(capture\?\.saved\?\.input\)\|\|!read\.has\(capture\)\)return ownHistoricalRunResult\(capture\);/,'sin lectura recordada, el lector valida y recalcula');
 assert.match(runReader,/if\(ownHistoricalOfficialInput\(capture\?\.saved\?\.input\)&&!read\.has\(capture\)\)\{frozen\(capture\);read\.set\(capture,ownHistoricalRunResult\(capture\)\);\}/,'sólo se recuerda la lectura de una captura congelada, calculada después de congelarla');
 const reader=fs.readFileSync(new URL('../assets/own-payroll-historical-result-model.js',import.meta.url),'utf8');
 assert.match(reader,/export const ownHistoricalOfficialInput=input=>\['own-payroll-input\.v4','own-payroll-input\.v5'\]\.includes\(input\?\.version\);/);
});
