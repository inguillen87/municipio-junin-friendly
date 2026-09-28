import test from 'node:test';import assert from 'node:assert/strict';
import {documentPeriodLabel,documentPeriodOptions,documentPeriodStatus} from '../assets/payroll-document-periods.js';
const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const row=(n,date,type='M',closureStatus='closed')=>({datasetId:id(n),date,type,closureStatus,statementCount:3,lineCount:12,payloadHash:String(n).repeat(64).slice(0,64),sourceLabel:'Catálogo sintético'});
const catalogue=()=>({version:'payroll-source-report.v1',mode:'catalog',official:false,total:5,truncated:false,items:[row(1,'2026-08-31'),row(2,'2026-08-31','P','open'),row(3,'2025-12-31'),row(4,'2026-08-31','M','unknown'),row(5,'2026-09-30','X')]});
test('available months and original type codes remain separate',()=>{
 const v=documentPeriodOptions(catalogue());assert.deepEqual(v.months.map(x=>x.value),['2026-09','2026-08','2025-12']);
 assert.deepEqual(v.types.map(x=>x.value),['M','P','X']);assert.match(v.types[2].label,/Tipo de origen X/);assert.equal(v.matching,5);
});
test('month and type filters intersect without merging repeated runs',()=>{
 const v=documentPeriodOptions(catalogue(),{month:'2026-08',type:'M'});assert.equal(v.items.length,2);assert.ok(v.items.every(x=>x.sameDateAndType));
 assert.deepEqual(v.items.map(x=>x.datasetId),[id(1),id(4)]);assert.match(documentPeriodStatus(v),/mantienen separadas por identificador/);
});
test('unknown closure never becomes a closed or open run',()=>{
 const v=documentPeriodOptions(catalogue());assert.match(v.items.find(x=>x.datasetId===id(4)).label,/Cierre no informado/);
 assert.match(v.items.find(x=>x.datasetId===id(2)).label,/Abierta/);
});
test('zero results do not broaden the selected period and type',()=>{
 const v=documentPeriodOptions(catalogue(),{month:'2025-12',type:'P'});assert.equal(v.matching,0);assert.deepEqual(v.items,[]);
 assert.match(documentPeriodStatus(v),/No hay coincidencias; no se cambió el filtro/);
});
test('missing period and type are reported instead of silently reset',()=>{
 const v=documentPeriodOptions(catalogue(),{month:'2024-01',type:'V'});assert.equal(v.missingMonth,true);assert.equal(v.missingType,true);assert.equal(v.matching,0);
});
test('limited catalogues explicitly retain their limited scope',()=>{
 const c=catalogue();c.total=300;c.truncated=true;const v=documentPeriodOptions(c);assert.equal(v.returned,5);assert.equal(v.total,300);assert.match(documentPeriodStatus(v),/no representa todo el histórico/);
});
test('presentation never mutates source order or values',()=>{
 const c=catalogue(),before=JSON.stringify(c);documentPeriodOptions(c,{month:'2026-08'});assert.equal(JSON.stringify(c),before);
});
test('labels use the date declared by source rather than UTC conversion',()=>{
 const c=catalogue();c.items[0].date='2026-08-31T23:30:00-03:00';const v=documentPeriodOptions(c,{month:'2026-08'});
 assert.ok(v.items.some(x=>x.datasetId===id(1)));assert.match(v.items.find(x=>x.datasetId===id(1)).label,/2026-08-31/);
});
for(const v of ['2026-00','2026-13','2026-8','invalid','2026-08-01',null])test('rejects invalid month label '+String(v),()=>assert.throws(()=>documentPeriodLabel(v)));
for(const filter of [{month:'2026-13'},{type:'monthly'},{type:'MM'},{month:'all',type:'1'}])test('rejects invalid catalogue filter '+JSON.stringify(filter),()=>assert.throws(()=>documentPeriodOptions(catalogue(),filter)));
test('empty source catalogue stays empty and honest',()=>{
 const c=catalogue();c.items=[];c.total=0;const v=documentPeriodOptions(c);assert.equal(v.matching,0);assert.equal(v.returned,0);assert.deepEqual(v.types,[]);
});
test('duplicate dataset ID is rejected rather than combined',()=>{
 const c=catalogue();c.items[1].datasetId=c.items[0].datasetId;assert.throws(()=>documentPeriodOptions(c));
});
test('catalogue size cannot be smaller than returned items',()=>{
 const c=catalogue();c.truncated=true;c.total=1;assert.throws(()=>documentPeriodOptions(c),/DOCUMENT_CATALOG_INVALID/);
});
