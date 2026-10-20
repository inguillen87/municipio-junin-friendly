import test from 'node:test';import assert from 'node:assert/strict';
import {ownReportBundle,ownReportDocument,verifiedOwnReportBundle} from '../assets/own-payroll-report-model.js';
import {verifiedOwnReportCensus} from '../assets/own-payroll-report-census-model.js';
import {historicalReportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {censusForReceipt,reportCensusFixture,rehashCensus} from './fixtures/own-payroll-report-census-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';

test('mensual cerrado más SAC vacío completo no depende de la revisión operativa actual',async()=>{
 const original=historicalReportFixture('2026-09','monthly'),scope=original.details[0].scopeVersion;
 const censuses=[censusForReceipt(original.receipts[0],scope),reportCensusFixture({scopeVersion:scope})];
 for(const census of censuses){await verifiedOwnReportCensus(census);assert.equal(Object.hasOwn(census,'rows'),false);assert.equal(Object.hasOwn(census,'captures'),false);}
 const bundle=ownReportBundle({from:'2026-09',to:'2026-09',types:['monthly','sac']},censuses,original.receipts);
 assert.equal(bundle.sources.length,1);assert.equal(bundle.employees.length,2);
 assert.ok(ownReportDocument(bundle).rows.length>=2);
});
test('omitir la celda sin cierres o incluir un grupo no autorizado no entrega el mensual parcial',()=>{
 const original=historicalReportFixture('2026-09','monthly'),census=censusForReceipt(original.receipts[0],original.details[0].scopeVersion);
 assert.throws(()=>ownReportBundle({from:'2026-09',to:'2026-09',types:['monthly','sac']},[census],original.receipts));
 const wrong=reportCensusFixture({scopeVersion:'f'.repeat(64)});
 assert.throws(()=>ownReportBundle({from:'2026-09',to:'2026-09',types:['monthly','sac']},[census,wrong],original.receipts));
});

test('consulta verificada exige las huellas originales de cada celda, también la vacía',async()=>{
 const f=historicalReportFixture('2026-09','monthly'),q={...f.query,types:['monthly','sac']};
 const closed=censusForReceipt(f.receipts[0],f.details[0].scopeVersion),empty=reportCensusFixture({scopeVersion:closed.scopeVersion});
 const original=await verifiedOwnReportBundle(q,[closed,empty],f.receipts);assert.equal(original.employees.length,2);
 const corrupt=structuredClone(empty);corrupt.sourceVersion='f'.repeat(64);
 await assert.rejects(verifiedOwnReportBundle(q,[closed,corrupt],f.receipts),/huella/);
 assert.throws(()=>ownReportBundle(q,[closed,closed],f.receipts),/repetido/);
});

test('la reapertura altera la prueba completa y excluye el cierre anterior de todas las descargas',async()=>{
 const f=historicalReportFixture('2026-09','monthly'),closed=censusForReceipt(f.receipts[0],f.details[0].scopeVersion);
 const original=await verifiedOwnReportBundle(f.query,[closed],f.receipts),reopened=structuredClone(closed),at='2026-10-07T12:00:00.000Z';
 reopened.events.push({id:uid(990),groupId:closed.groups[0].id,command:'reopen',bodySha256:'d'.repeat(64),snapshotSha256:closed.groups[0].snapshotSha256,recordedAt:at});reopened.events.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);reopened.eventCount++;
 Object.assign(reopened.groups[0],{state:'reopened',reopenedAt:at});rehashCensus(reopened);
 await assert.rejects(verifiedOwnReportBundle(f.query,[reopened],f.receipts),/reabierto/);
 const current=await verifiedOwnReportBundle(f.query,[reopened],[]);assert.notEqual(current.proof,original.proof);assert.equal(current.employees.length,0);
 assert.equal(ownReportDocument(current).rows.length,0);
 const originalJson=JSON.stringify(f.receipts),document=ownReportDocument(original);
 for(const writer of [reportCsv,reportXlsx,reportPdf])assert.ok(writer(document).length>0);
 assert.equal(JSON.stringify(f.receipts),originalJson);
});

test('el metadato de cobertura debe coincidir con el recibo original, con hash válido en ambos',()=>{
 const f=historicalReportFixture('2026-09','monthly'),census=censusForReceipt(f.receipts[0],f.details[0].scopeVersion);
 census.groups[0].populationCount++;census.groups[0].populationComplete=false;rehashCensus(census);
 assert.throws(()=>ownReportBundle(f.query,[census],f.receipts),/cobertura/);
});
