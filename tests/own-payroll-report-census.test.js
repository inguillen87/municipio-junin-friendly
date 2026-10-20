import test from 'node:test';import assert from 'node:assert/strict';
import {ownReportCensus,ownReportCensusQuery,ownReportCensusSource,verifiedOwnReportCensus} from '../assets/own-payroll-report-census-model.js';
import {reportCensusFixture,oneGroupCensus,rehashCensus} from './fixtures/own-payroll-report-census-synthetic.js';

test('censo vacío completo es explícito y no finge una revisión operativa sin padrón',async()=>{
 const value=reportCensusFixture();assert.equal(await verifiedOwnReportCensus(value),value);
 assert.equal(value.eventCount,0);assert.deepEqual(value.events,[]);assert.deepEqual(value.groups,[]);
 for(const field of ['rows','captures','rosterVersion','populationDomain','canWrite'])assert.equal(Object.hasOwn(value,field),false);
});
test('la huella vacía queda ligada a ámbito, período y tipo',async()=>{
 const a=reportCensusFixture(),period=reportCensusFixture({period:'2026-10'}),type=reportCensusFixture({liquidationType:'monthly'}),scope=reportCensusFixture({scopeVersion:'f'.repeat(64)});
 assert.equal(new Set([a,period,type,scope].map(v=>v.sourceVersion)).size,4);
 for(const v of [a,period,type,scope])await verifiedOwnReportCensus(v);
 const tampered=structuredClone(a);tampered.period='2026-10';await assert.rejects(verifiedOwnReportCensus(tampered),/huella/);
});
test('reapertura conservada tiene dos eventos y no se presenta como ausencia',async()=>{
 const value=oneGroupCensus({reopened:true});await verifiedOwnReportCensus(value);
 assert.equal(value.eventCount,2);assert.equal(value.groups.length,1);assert.equal(value.groups[0].state,'reopened');
 assert.notEqual(value.sourceVersion,reportCensusFixture({liquidationType:'monthly'}).sourceVersion);
});
for(const [label,change]of [
 ['complete falso',v=>v.complete=false],
 ['count no completo',v=>v.eventCount++],
 ['campo operativo agregado',v=>v.rows=[]],
 ['grupo omitido',v=>v.groups=[]],
 ['evento de cierre omitido',v=>{v.events=[];v.eventCount=0;}],
 ['cierre duplicado',v=>{v.events.push(structuredClone(v.events[0]));v.eventCount++;}],
 ['grupo duplicado',v=>v.groups.push(structuredClone(v.groups[0]))],
 ['huella de grupo ajena',v=>v.groups[0].snapshotSha256='e'.repeat(64)],
 ['cobertura falsa',v=>v.groups[0].populationComplete=false],
 ['tiempo original cambiado',v=>v.groups[0].recordedAt='2026-09-29T12:00:00.000Z'],
 ['reapertura fingida',v=>{v.groups[0].state='reopened';v.groups[0].reopenedAt='2026-10-07T12:00:00.000Z';}],
 ['arreglo disperso',v=>{v.events.length=2;v.eventCount=2;}]
])test('rechaza '+label+' sin convertirlo en vacío',()=>{const value=oneGroupCensus();change(value);assert.throws(()=>ownReportCensus(value));});
test('rechaza reapertura huérfana y pérdida de un evento aunque se recalculen count y hash',()=>{
 const orphan=oneGroupCensus({reopened:true});orphan.events.shift();orphan.eventCount=1;orphan.groups=[];rehashCensus(orphan);assert.throws(()=>ownReportCensus(orphan));
 const lost=oneGroupCensus({reopened:true});lost.events.pop();lost.eventCount=1;rehashCensus(lost);assert.throws(()=>ownReportCensus(lost));
});
test('reapertura no puede retroceder en tiempo ni cambiar el snapshot original',()=>{
 for(const change of [v=>v.events[1].recordedAt=v.groups[0].reopenedAt='2026-09-29T12:00:00.000Z',v=>v.events[1].snapshotSha256='e'.repeat(64)]){
  const value=oneGroupCensus({reopened:true});change(value);rehashCensus(value);assert.throws(()=>ownReportCensus(value));
 }
});
test('la huella cubre también los metadatos y el cuerpo de cada evento',async()=>{
 for(const change of [v=>v.events[0].bodySha256='e'.repeat(64),v=>v.groups[0].populationCount=3]){
  const value=oneGroupCensus();change(value);if(value.groups[0].populationCount===3)value.groups[0].populationComplete=false;
  ownReportCensus(value);await assert.rejects(verifiedOwnReportCensus(value),/huella/);
 }
});
test('query exacta; no acepta selecciones del padrón o del navegador',()=>{
 assert.deepEqual(ownReportCensusQuery({period:'2026-09',liquidationType:'sac'}),{period:'2026-09',liquidationType:'sac'});
 for(const query of [{period:'2026-13',liquidationType:'sac'},{period:'2026-09',liquidationType:'all'},{period:'2026-09',liquidationType:'sac',search:'x'}])assert.throws(()=>ownReportCensusQuery(query));
});
test('el documento de huella contiene todo el contrato salvo su propia huella',()=>{
 const value=oneGroupCensus();const source=ownReportCensusSource(value);
 assert.equal(Object.hasOwn(source,'sourceVersion'),false);assert.deepEqual({...source,sourceVersion:value.sourceVersion},value);
});
