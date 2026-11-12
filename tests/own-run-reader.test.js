// La pantalla Calcular muestra un resultado guardado de cualquier versión. V1/V2 siguen por el validador histórico; V4/V5 se leen
// con el validador oficial y la pantalla dice lo que tienen de propio: total oficial, conciliación y renglones que el recibo no imprime.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {officialCapture} from './fixtures/own-payroll-official-close-synthetic.js';
import {detail as historicalDetail} from './fixtures/own-payroll-liquidation-synthetic.js';
import {ownRunResult,verifiedRunCapture,ownRunRows,ownRunCsv,ownRunOfficialSummary,ownRunOfficialText} from '../assets/own-payroll-run-reader.js';
import {ownRunWorkspaceResult,ownRunWorkspaceRows,ownRunWorkspaceCsv} from '../assets/own-payroll-run-workspace-model.js';

test('un resultado V5 se lee entero: renglones, búsqueda, páginas y CSV salen del resultado guardado',()=>{
 const capture=officialCapture('full_population37'),{input,result,people}=ownRunResult(capture);
 assert.equal(input,capture.saved.input);assert.equal(result,capture.saved.result);assert.equal(people.size,37);
 const first=ownRunRows(capture,'',1);assert.equal(first.total,444);assert.equal(first.filtered,444);assert.equal(first.rows.length,25);assert.equal(first.pages,18);
 const last=ownRunRows(capture,'',99);assert.equal(last.page,18);assert.equal(last.rows.length,444-17*25);
 const one=ownRunRows(capture,result.rows[0].employeeNumber,1);assert.ok(one.filtered>0&&one.filtered<444);assert.ok(one.rows.every(r=>r.employeeNumber.includes(result.rows[0].employeeNumber)));
 const csv=ownRunCsv(capture).trimEnd().split('\r\n');assert.equal(csv.length,445,'encabezado y un renglón por concepto, sin recortar');assert.match(csv[0],/^﻿"Periodo";"Liquidacion"/);
});

test('el validador histórico de la pantalla no acepta V4/V5: sólo el lector explícito los abre',()=>{
 const capture=officialCapture('days14_both_omitted');
 assert.throws(()=>ownRunWorkspaceResult(capture));assert.throws(()=>ownRunWorkspaceRows(capture));assert.throws(()=>ownRunWorkspaceCsv(capture));
 assert.equal(ownRunRows(capture).total,12);
});

test('la pantalla dice lo propio del total oficial: conciliación sin concepto de ajuste y renglones que el recibo no imprime',()=>{
 const omitted=ownRunOfficialSummary(officialCapture('days14_both_omitted'));assert.deepEqual(omitted,{reconciled:1,employees:1,omitted:2});
 assert.equal(ownRunOfficialText(omitted),'Los totales son los oficiales de la liquidación. En 1 legajo el neto oficial difiere de la suma de sus renglones por el redondeo del total: la diferencia queda registrada en la conciliación y no se agrega ningún concepto de ajuste. 2 renglones en cero no se imprimen en el recibo; siguen en el resultado.');
 const one=ownRunOfficialSummary(officialCapture('only302_omitted'));assert.equal(one.omitted,1);assert.match(ownRunOfficialText(one),/1 renglón en cero no se imprime en el recibo; sigue en el resultado\.$/);
 const visible=ownRunOfficialSummary(officialCapture('eligible_zero_tariffs'));assert.equal(visible.omitted,0,'un cero con derecho se imprime');assert.doesNotMatch(ownRunOfficialText(visible),/no se imprim/);
 const v4=ownRunOfficialSummary(officialCapture('legacy_v4_unchanged'));assert.deepEqual(v4,{reconciled:1,employees:1,omitted:0});
 const many=ownRunOfficialSummary(officialCapture('full_population37'));assert.equal(many.employees,37);assert.equal(many.reconciled,37);assert.match(ownRunOfficialText(many),/^Los totales son los oficiales de la liquidación\. En 37 legajos el neto oficial difiere/);
 assert.equal(ownRunOfficialText({reconciled:0,employees:3,omitted:0}),'Los totales son los oficiales de la liquidación. En todos los legajos coinciden con la suma de sus renglones.');
});

test('un resultado histórico sigue igual: mismo objeto, mismo validador y ninguna aclaración',async()=>{
 const capture=historicalDetail().capture;
 assert.deepEqual(ownRunResult(capture),ownRunWorkspaceResult(capture));assert.equal(await verifiedRunCapture(capture),capture);
 assert.equal(ownRunOfficialSummary(capture),null);assert.equal(ownRunOfficialText(null),'');
 assert.deepEqual(ownRunRows(capture),ownRunWorkspaceRows(capture));assert.equal(ownRunCsv(capture),ownRunWorkspaceCsv(capture));
});

test('la verificación con huellas devuelve una copia y exige la clave y el cuerpo del intento original',async()=>{
 const capture=officialCapture('days14_both_omitted'),attempt={key:capture.key,body:structuredClone(capture.body)};
 const verified=await verifiedRunCapture(capture,attempt);assert.notEqual(verified,capture);assert.deepEqual(verified,capture);
 await assert.rejects(verifiedRunCapture(capture,{key:'70000000-0000-4000-8000-000000007777',body:attempt.body}),/La captura cambió el cuerpo o la clave originales\./);
 await assert.rejects(verifiedRunCapture(capture,{key:attempt.key,body:{...attempt.body,period:'2026-09'}}),/La captura cambió el cuerpo o la clave originales\./);
 const tampered=officialCapture('days14_both_omitted');tampered.saved.resultSha256='f'.repeat(64);await assert.rejects(verifiedRunCapture(tampered,null));
 const pending=verifiedRunCapture(capture,attempt);capture.saved.result.employeeTotals[0].net='999.99';assert.equal((await pending).saved.result.employeeTotals[0].net,'200.01');
});

test('la copia verificada queda inmutable y su lectura se conserva; cualquier otro objeto se vuelve a calcular cada vez',async()=>{
 const source=officialCapture('full_population37'),verified=await verifiedRunCapture(source);
 assert.equal(Object.isFrozen(verified),true);assert.equal(Object.isFrozen(verified.saved.result.rows[0]),true);assert.equal(Object.isFrozen(source),false,'lo recibido no se toca');
 const first=ownRunResult(verified);assert.equal(ownRunResult(verified),first,'una sola lectura para la copia inmutable');assert.equal(first.result,verified.saved.result);
 assert.throws(()=>{'use strict';verified.saved.result.employeeTotals[0].net='999.99';},TypeError);
 assert.notEqual(ownRunResult(source),ownRunResult(source),'un objeto que puede cambiar no se recuerda');
 source.saved.result.employeeTotals[0].net='999.99';assert.throws(()=>ownRunResult(source),'y si cambió, la lectura lo rechaza');
 assert.equal(ownRunRows(verified,'',2).page,2);assert.equal(ownRunOfficialSummary(verified).employees,37);
});

test('la pantalla usa sólo estos lectores para mostrar, paginar, descargar y recuperar un resultado',()=>{
 const panel=fs.readFileSync(new URL('../assets/own-payroll-run-panel.js',import.meta.url),'utf8');
 for(const name of ['verifiedWorkspaceCapture','ownRunWorkspaceResult','ownRunWorkspaceRows','ownRunWorkspaceCsv'])assert.equal(panel.includes(name),false,name);
 assert.equal(panel.split('await verifiedRunCapture(').length-1,5);assert.match(panel,/const \{input,result,people\}=ownRunResult\(value\);/);
 assert.match(panel,/const official=ownRunOfficialText\(ownRunOfficialSummary\(value\)\);\$\('result-official'\)\.textContent=official;\$\('result-official'\)\.hidden=!official;/);
 assert.match(panel,/\$\('result-official'\)\.textContent='';\$\('result-official'\)\.hidden=true;/,'al limpiar la pantalla la aclaración se retira');
 const model=fs.readFileSync(new URL('../assets/own-payroll-run-workspace-model.js',import.meta.url),'utf8');
 assert.doesNotMatch(model,/official|historical-result/,'el validador histórico no importa el lector oficial');
});
