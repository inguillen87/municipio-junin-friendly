import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {reconstructWorkdays, filterWorkdays, WORKDAY_RULES} from '../lib/attendance-workdays.js';
import {duration,workdayCsv,workdayXlsx} from '../assets/workday-export.js';
import {money,salarySummaryModel,createPayrollSummaryPdf} from '../assets/payroll-summary-pdf.js';
const H='a'.repeat(64),S='b'.repeat(64);
const event=(ordinal,code,time,patch={})=>({ordinal,code,occurredAt:`2026-09-09T${time}-03:00`,localTimestamp:`2026-09-09 ${time}`,personKey:H,streamKey:S,personLabel:'Agente sintético',legajo:9001,identityState:'mapped',issues:[],...patch});
const run=(events,patch={})=>reconstructWorkdays({events,from:'2026-09-09',to:'2026-09-09',model:'K20/ID',timezone:'America/Argentina/Mendoza',...patch});
const pair=[event(1,0,'07:00:00'),event(2,1,'13:00:00')];
test('tramo ordinario exacto, sin importe ni horas pagables',()=>{const r=run(pair).rows[0];assert.equal(r.ordinarySeconds,21600);assert.equal(r.status,'closed');assert.equal(r.payableSeconds,null);assert.equal(r.amountArs,null);assert.equal(r.payrollEligible,false)});
test('pausa cerrada resta exactamente una vez',()=>{const r=run([pair[0],event(3,2,'10:00:00'),event(4,3,'10:15:00'),pair[1]]).rows[0];assert.equal(r.ordinarySeconds,20700);assert.equal(r.pauseSeconds,900);assert.deepEqual(r.intervals[0].pauseOrdinals,[3,4])});
test('extra separado del ordinario',()=>{const r=run([...pair,event(3,4,'15:00:00'),event(4,5,'17:00:00')]).rows[0];assert.equal(r.ordinarySeconds,21600);assert.equal(r.extraSeconds,7200)});
for(const [label,events,code] of [
 ['entrada aislada',[pair[0]],'missing_exit'],['salida aislada',[pair[1]],'missing_entry'],
 ['entrada repetida',[pair[0],event(3,0,'08:00:00'),pair[1]],'repeated_entry'],
 ['cambio de tipo',[pair[0],event(3,4,'08:00:00'),event(4,5,'10:00:00')],'mixed_interval'],
 ['pausa sin entrada',[event(1,2,'08:00:00')],'pause_without_entry'],
 ['regreso sin pausa',[pair[0],event(3,3,'08:00:00'),pair[1]],'return_without_pause'],
 ['pausa sin cerrar',[pair[0],event(3,2,'08:00:00'),pair[1]],'pause_not_closed'],
 ['pausa repetida',[pair[0],event(3,2,'08:00:00'),event(4,2,'08:05:00'),pair[1]],'repeated_pause'],
 ['salida incompatible',[pair[0],event(2,5,'09:00:00')],'wrong_exit'],
 ['codigo desconocido',[pair[0],event(3,99,'08:00:00'),pair[1]],'unknown_code'],
 ['fuente observada',[pair[0],event(3,0,'08:00:00',{issues:['future_timestamp']}),pair[1]],'source_observation'],
 ['simultaneidad',[pair[0],event(3,1,'07:00:00')],'simultaneous_events'],
]) test(label+' se observa sin aprobar',()=>{const r=run(events).rows[0];assert.equal(r.status,'review');assert.ok(r.issues.some(i=>i.code===code));assert.equal(r.payrollEligible,false)});
test('no une personas diferentes',()=>{const r=run([pair[0],event(2,1,'13:00:00',{personKey:'c'.repeat(64),streamKey:'d'.repeat(64),legajo:9002})]);assert.equal(r.summary.intervalCount,0);assert.equal(r.rows.length,2)});
test('no une contratos diferentes',()=>{const r=run([pair[0],event(2,1,'13:00:00',{streamKey:'d'.repeat(64),legajo:9002})]);assert.equal(r.summary.intervalCount,0)});
test('no vinculado mantiene tiempos y control pendiente',()=>{const r=run(pair.map(e=>({...e,identityState:'unmapped',legajo:null}))).rows[0];assert.equal(r.ordinarySeconds,21600);assert.equal(r.status,'review');assert.ok(r.issues.some(i=>i.code==='identity_unlinked'))});
test('nocturno se asigna al inicio con advertencia',()=>{const r=run([event(1,0,'22:00:00'),event(2,1,'06:00:00',{occurredAt:'2026-09-10T06:00:00-03:00',localTimestamp:'2026-09-10 06:00:00'})]).rows[0];assert.equal(r.ordinarySeconds,28800);assert.equal(r.day,'2026-09-09');assert.ok(r.issues.some(i=>i.code==='overnight_review'))});
test('contexto no atribuye segunda jornada a salida nocturna',()=>{const r=run([event(1,0,'22:00:00'),event(2,1,'06:00:00',{occurredAt:'2026-09-10T06:00:00-03:00',localTimestamp:'2026-09-10 06:00:00'})],{from:'2026-09-10',to:'2026-09-10'});assert.equal(r.rows.length,0)});
test('rechaza tramo mayor de 24 horas',()=>{const r=run([pair[0],event(2,1,'08:00:00',{occurredAt:'2026-09-10T08:00:00-03:00',localTimestamp:'2026-09-10 08:00:00'})],{to:'2026-09-10'});assert.equal(r.summary.intervalCount,0);assert.ok(r.rows.some(r=>r.issues.some(i=>i.code==='span_exceeded')))});
test('modelo no homologado no hereda cálculos K20',()=>{const r=run(pair,{model:'MB360'});assert.equal(r.summary.intervalCount,0);assert.equal(r.rules.profileSupported,false)});
for(const [label,events,patch] of [['ordinal repetido',[pair[0],pair[0]],{}],['hora local incompatible',[event(1,0,'07:00:00',{localTimestamp:'2026-09-09 10:00:00'})],{}],['código negativo',[event(1,-1,'07:00:00')],{}],['fecha inválida',pair,{from:'2026-02-31'}],['ventana enorme',pair,{from:'2025-01-01'}]])test('valida '+label,()=>assert.throws(()=>run(events,patch)));
test('búsqueda y filtro después de reconstruir',()=>{const rows=run(pair).rows;assert.equal(filterWorkdays(rows,{search:'sintetico',status:'closed'}).length,1);assert.equal(filterWorkdays(rows,{status:'review'}).length,0);assert.equal(rows[0].ordinarySeconds,21600)});
test('exportador preserva duraciones mayores a 24h',()=>assert.equal(duration(90061),'25:01:01'));
test('CSV exporta referencias sin fórmulas inyectables',()=>{const r=run(pair).rows[0];const csv=workdayCsv([{...r,personLabel:'=1+1'}]);assert.match(csv,/"'=1\+1"/);assert.match(csv,/06:00:00/);assert.match(csv,/No aprobado para liquidar/)});
test('Excel contiene hojas, formato de duración y control',()=>{const rows=run(pair).rows;const b=workdayXlsx({site:{label:'Sitio de prueba'},filters:{from:'2026-09-09',to:'2026-09-09',status:'all'},snapshotId:'QA',rules:WORKDAY_RULES},rows);const s=Buffer.from(b).toString();assert.equal(Buffer.from(b).readUInt32LE(),0x04034b50);for(const v of ['Jornadas','Tramos','Control','[h]:mm:ss','Sin firma ni certificación'])assert.ok(s.includes(v));assert.ok(!s.includes('<f>'))});
const person={name:'PERSONA DE PRUEBA',legajo:'9001'};
const item={payrollDate:'2026-08-31',canonicalPayrollType:'monthly',presentationStatus:'open',subjectEarnings:'200000.00',nonSubjectEarnings:'10000.00',familyAllowance:'15000.00',employeeWithholdings:'25000.00',netPayable:'200000.00',employerContributions:'45000.00',sourceCutoff:'2026-09-01',distinctConcepts:12};
test('resumen concilia decimal sin doble descuento patronal',()=>{const m=salarySummaryModel(person,item);assert.equal(m.matches,true);assert.equal(m.difference,'$ 0,00');assert.match(m.status,/PRELIQUIDACIÓN/)});
test('resumen conserva diferencia en vez de redondearla',()=>{const m=salarySummaryModel(person,{...item,netPayable:'200000.04'});assert.equal(m.matches,false);assert.equal(m.difference,'$ -0,04')});
for(const v of ['12,50','abc',null,'1.001','1e4'])test('importe inválido '+String(v),()=>assert.throws(()=>money(v)));
test('resumen es PDF real sin firma digital simulada',()=>{const b=createPayrollSummaryPdf(person,item);assert.ok(Buffer.from(b).toString().startsWith('%PDF-1.4'));assert.ok(Buffer.from(b).toString().includes('%%EOF'));assert.ok(!Buffer.from(b).toString().includes('/Type /Sig'))});
test('resumen valida fecha y nombre',()=>{assert.throws(()=>salarySummaryModel({},item));assert.throws(()=>salarySummaryModel(person,{...item,payrollDate:'2026-02-31'}))});
const ctx={};vm.runInNewContext(fs.readFileSync('assets/action-language.js','utf8'),ctx);const labels=ctx.MuniControlActionLanguage;
for(const [key,value]of [['restricted','Restringida'],['not_calculable','Cálculo pendiente'],['pending','Pendiente de verificación'],['special','Licencia especial'],['submitted','Enviada a revisión']])test('etiqueta en español '+key,()=>assert.equal(labels.label(key),value));
test('no inventa denominación de motivo 11',()=>assert.equal(labels.reason('',11),'Motivo 11 · denominación pendiente'));
test('regla desconocida no filtra identificador técnico',()=>assert.equal(labels.policy('internal-secret-value'),'Régimen pendiente de identificación'));
test('integración declarada en API, legajo y build',()=>{assert.match(fs.readFileSync('api/internal-attendance.js','utf8'),/resource === 'clock-workdays'/);assert.match(fs.readFileSync('internal-dashboard.html','utf8'),/summaryDownload.dataset.payrollSummaryDownload/);const s=fs.readFileSync('relojes-marcaciones.html','utf8');assert.match(s,/data-workday-release="workdays-v1"/);assert.doesNotMatch(s,/id="clockHeatmap"/);assert.match(fs.readFileSync('scripts/build-friendly.mjs','utf8'),/'assets\/workday-panel.js'/)});
