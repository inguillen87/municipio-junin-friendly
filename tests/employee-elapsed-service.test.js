import test from 'node:test';import assert from 'node:assert/strict';
import {elapsedServiceAtCutoff as elapsed,elapsedServiceLabel,elapsedServiceNote,compareServiceSource} from '../assets/employee-elapsed-service.js';
const source=(hireDate='2013-07-01',sourceCutoff='2026-09-10T18:17:30Z')=>({origin:'GRH',scope:'source_snapshot',hireDate,sourceCutoff,years:{value:0,status:'reported'},months:{value:0,status:'reported'}});
test('el caso comunicado muestra 13 años y 2 meses sin modificar el cero de origen',()=>{
 const s=source(),copy=structuredClone(s),r=elapsed(s);assert.equal(elapsedServiceLabel(r),'13 años y 2 meses');assert.equal(r.totalMonths,158);assert.equal(r.recognizedForPayroll,false);assert.deepEqual(s,copy);assert.equal(compareServiceSource(s,r),'different_components');assert.match(elapsedServiceNote(s,r),/no antigüedad reconocida/);
});
for(const [start,end,years,months]of [['2025-09-11','2026-09-10',0,11],['2025-09-10','2026-09-10',1,0],['2026-09-10','2026-09-10',0,0],['2026-01-31','2026-02-28',0,1],['2024-02-29','2025-02-28',1,0],['2024-02-29','2025-02-27',0,11],['2026-01-31','2026-03-30',0,1],['2026-01-31','2026-03-31',0,2]])test('meses completos con aniversario ajustado '+start+' a '+end,()=>{
 const r=elapsed(source(start,end+'T15:00:00Z'));assert.equal(r.status,'available');assert.equal(r.years,years);assert.equal(r.months,months);
});
test('el corte es un instante de Mendoza, no el día UTC ni el reloj del navegador',()=>{
 const r=elapsed(source('2025-09-10','2026-09-10T01:00:00Z'));assert.equal(r.cutoff,'2026-09-09');assert.equal(r.totalMonths,11);
});
for(const [value,reason]of [[null,'hire_date_unavailable'],['','hire_date_unavailable'],['2026-02-30','hire_date_unavailable'],['2027-01-01','hire_after_cutoff']])test('no calcula un ingreso inválido '+value,()=>assert.equal(elapsed(source(value)).reason,reason));
for(const cutoff of [null,'2026-09-10','2026-02-30T00:00:00Z','2026-09-10T25:00:00Z'])test('no toma un corte global o no verificado '+cutoff,()=>assert.equal(elapsed(source('2013-07-01',cutoff)).reason,'cutoff_unavailable'));
test('el egreso limita el tiempo sin cambiar las fechas fuente',()=>{
 const r=elapsed(source(),{terminationDate:'2016-09-30'});assert.equal(r.to,'2016-09-30');assert.equal(r.years,3);assert.equal(r.months,2);assert.equal(r.stoppedAtTermination,true);assert.match(elapsedServiceNote(source(),r),/hasta el egreso/);
 assert.equal(elapsed(source(),{terminationDate:'2028-01-01'}).to,'2026-09-10');
});
