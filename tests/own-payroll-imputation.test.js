import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateImputation,verifiedImputation,verifiedImputationSource,imputationSource,imputationIncidentCsv} from '../assets/own-payroll-imputation-model.js';
import {imputationFixture,rehashImputationFixture,remeasureSyntheticClosure} from './fixtures/own-payroll-imputation-synthetic.js';

test('imputación parcial conserva centavos aunque el total cerrado tenga precisión entera por compensación exacta',async()=>{const s=await imputationFixture(2);for(const r of s.group.snapshot.concepts)if(r.nature!=='auxiliary')r.amount='100';const rem=s.group.snapshot.concepts.filter(r=>r.contractId===s.group.snapshot.employees[0].contractId&&r.nature==='remuneration');assert.equal(rem.length,2);rem[0].amount='100.01';rem[1].amount='99.99';await remeasureSyntheticClosure(s,0);s.configuration.definition.mappings=s.configuration.definition.mappings.filter(m=>m.conceptCode!==rem[1].conceptCode);await rehashImputationFixture(s);const r=await verifiedImputation(s);assert.equal(r.ready,false);assert.equal(r.allocatedTotals.remuneration,'200.01');assert.equal(r.rows.find(x=>x.ordinal===1).amount,'100.01');});

test('imputación completa conserva todos los conceptos y concilia cuatro naturalezas sin volver a calcular salarios',async()=>{
 const s=await imputationFixture(61),before=structuredClone(s),r=await verifiedImputation(s);
 assert.equal(r.ready,true);assert.equal(r.employeeCount,61);assert.equal(r.rows.length,s.group.snapshot.conceptCount);assert.equal(r.allocatedCount+r.auxiliaryCount,r.conceptCount);
 assert.deepEqual(r.allocatedTotals,Object.fromEntries(Object.entries(s.group.snapshot.totals).slice(0,4)));assert.equal(r.accountingPosted,false);assert.equal(r.paymentExecuted,false);
 assert.deepEqual(s,before);assert.ok(r.groups.every(g=>g.conceptCount===g.ordinals.length));
 assert.equal(new Set(r.groups.flatMap(g=>g.ordinals)).size,r.moneyCount);
});
test('jurisdicciones conservadas 42/55 eligen destinos separados del mismo concepto',async()=>{
 const s=await imputationFixture(),r=await verifiedImputation(s);assert.deepEqual([...new Set(r.rows.filter(r=>r.state==='allocated').map(r=>r.destination.jurisdictionCode))].sort(),['42','55']);
});
test('una fecha original faltante permanece desconocida y no inventa errores de destino por esa ausencia',async()=>{
 const s=await imputationFixture();for(const d of s.dateSources){delete d.body.version;delete d.body.liquidationDate;}await rehashImputationFixture(s);
 const r=await verifiedImputation(s);assert.equal(r.ready,false);assert.ok(r.issues.some(i=>i.code==='date_missing'));assert.ok(r.rows.every(r=>r.liquidationDate===null));assert.ok(!r.issues.some(i=>i.code==='mapping_missing'||i.code==='institution_missing'));
});
test('un cierre histórico sin jurisdicción no se completa desde configuración o dato actual',async()=>{
 const s=await imputationFixture();s.group.snapshot.version='own-close-snapshot.v1';for(const e of s.group.snapshot.employees)delete e.jurisdiction;await rehashImputationFixture(s);
 const r=await verifiedImputation(s);assert.equal(r.ready,false);assert.ok(r.issues.some(i=>i.code==='jurisdiction_missing'));assert.ok(!r.issues.some(i=>i.code==='mapping_missing'));
});
test('todos los destinos ausentes quedan como incidencias completas, incluso después de la primera página',async()=>{
 const s=await imputationFixture(61);s.configuration.definition.mappings=[];await rehashImputationFixture(s);const r=await verifiedImputation(s);
 assert.equal(r.ready,false);assert.equal(r.issues.filter(i=>i.code==='mapping_missing').length,r.moneyCount);assert.ok(r.issues.some(i=>i.ordinal>25));assert.equal(r.rows.length,r.conceptCount);assert.equal(r.groups.length,0);
});
test('la naturaleza distinta no se convierte en un destino ausente ni se suma en otra naturaleza',async()=>{
 const s=await imputationFixture();s.configuration.definition.mappings[0].nature='employer_contribution';await rehashImputationFixture(s);const r=await verifiedImputation(s);
 assert.equal(r.ready,false);assert.ok(r.issues.some(i=>i.code==='nature_mismatch'));assert.ok(!r.issues.some(i=>i.code==='mapping_missing'));
});
test('institución y función se eligen por contrato, concepto y fecha, sin prioridad entre dos asociaciones',async()=>{
 const s=await imputationFixture(2),first=s.configuration.definition.assignments[0];first.validUntil='2026-10-30';s.configuration.definition.assignments.push({...first,validFrom:'2026-10-31',validUntil:null,institutionalReference:'INSTITUCION-SUCESORA'});await rehashImputationFixture(s);
 const r=await verifiedImputation(s);assert.ok(r.rows.filter(r=>r.contractId===first.contractId&&r.state==='allocated').every(r=>r.destination.institutionalReference==='INSTITUCION-SUCESORA'));
 s.configuration.definition.assignments[0].validUntil=null;assert.throws(()=>calculateImputation(s),/superpuestas|superpone/);
});
test('una asociación institucional por otro concepto no cubre todos los conceptos del contrato',async()=>{
 const s=await imputationFixture(2);s.configuration.definition.assignments[0].conceptCode='999999';await rehashImputationFixture(s);const r=await verifiedImputation(s);
 assert.equal(r.ready,false);assert.ok(r.issues.some(i=>i.code==='institution_missing'));
});
test('año presupuestario es una elección explícita; no se toma el primer año disponible',async()=>{
 const s=await imputationFixture();s.fiscalYear='2027';await rehashImputationFixture(s);const r=await verifiedImputation(s);assert.equal(r.ready,false);assert.ok(r.issues.some(i=>i.code==='mapping_missing'));
});
test('vigencias tienen límites inclusivos y no se sustituye la fecha civil por el período',async()=>{
 const s=await imputationFixture();for(const m of s.configuration.definition.mappings)m.validUntil='2026-10-30';await rehashImputationFixture(s);assert.ok((await verifiedImputation(s)).issues.some(i=>i.code==='mapping_missing'));
 for(const m of s.configuration.definition.mappings)m.validUntil='2026-10-31';await rehashImputationFixture(s);assert.equal((await verifiedImputation(s)).ready,true);
});
test('configuración no aprobada es una incidencia global; no inventa un destino faltante para cada fila',async()=>{
 const s=await imputationFixture();s.configuration={...s.configuration,revision:0,definition:null,proposalId:null,approvalId:null};await rehashImputationFixture(s);const r=await verifiedImputation(s);
 assert.equal(r.ready,false);assert.deepEqual(r.globalIssues,['configuration_required']);assert.equal(r.issues.length,0);assert.equal(r.rows.length,r.conceptCount);
 assert.ok(r.rows.every(r=>r.state==='configuration_required'||r.state==='auxiliary'));
});
test('cierre reabierto, fuente parcial y cantidades contradictorias son rechazados',async()=>{
 const s=await imputationFixture();for(const patch of [{state:'reopened'},{complete:false},{sourceVersion:null}])assert.throws(()=>imputationSource({...s,...patch}));
 const broken=structuredClone(s);broken.group.snapshot.conceptCount++;assert.throws(()=>calculateImputation(broken));
});
test('no acepta fechas ajenas, fuente original ausente ni una corrida repetida por mayúsculas',async()=>{
 const s=await imputationFixture();assert.throws(()=>imputationSource({...s,dateSources:[]}));
 const more=structuredClone(s);more.dateSources.push({...more.dateSources[0],runId:more.dateSources[0].runId.toUpperCase()});assert.throws(()=>imputationSource(more));
 const other=structuredClone(s);other.dateSources[0].body.period='2026-09';assert.throws(()=>imputationSource(other));
});
test('huellas de cuerpos, cierre y fuente retiran una revisión alterada',async()=>{
 const s=await imputationFixture(),date=structuredClone(s);date.dateSources[0].body.liquidationDate='2026-10-30';await assert.rejects(verifiedImputationSource(date));
 const closed=structuredClone(s);closed.group.snapshot.totals.gross='0.00';await assert.rejects(verifiedImputationSource(closed));
 const mapping=structuredClone(s);mapping.configuration.definition.mappings[0].budgetItemReference='DESTINO-ALTERADO';await assert.rejects(verifiedImputationSource(mapping));
});
test('referencias nulas siguen siendo nulas y la cuenta bancaria nunca completa una cuenta contable',async()=>{
 const s=await imputationFixture();for(const m of s.configuration.definition.mappings){m.accountingAccountReference=null;m.bankAccountReference='SOLO-BANCARIA';}await rehashImputationFixture(s);
 const r=await verifiedImputation(s);assert.ok(r.groups.every(g=>g.destination.accountingAccountReference===null&&g.destination.bankAccountReference==='SOLO-BANCARIA'&&g.destination.creditorReference===null));
});
test('CSV seguro de incidencias no contiene datos personales, referencias financieras, UUID ni importes',async()=>{
 const s=await imputationFixture(61);s.configuration.definition.mappings=[];await rehashImputationFixture(s);const r=await verifiedImputation(s),csv=imputationIncidentCsv(r);
 assert.equal(csv.split('\r\n').length,r.issues.length+2);assert.match(csv,/Ordinal del concepto cerrado/);
 for(const row of r.rows){assert.ok(!csv.includes(row.contractId));assert.ok(!csv.includes(row.employeeNumber));assert.ok(!csv.includes(row.amount));}
 assert.ok(!csv.includes('SINTETIC'));assert.ok(!/"[=+@]/.test(csv));
});
test('revisión sin incidencias genera sólo los encabezados del CSV',async()=>{const r=await verifiedImputation(await imputationFixture());assert.equal(imputationIncidentCsv(r).split('\r\n').length,2);});
test('revisión completa de 869 contratos conserva todos los conceptos y consolida destinos sin cortar filas',async()=>{
 const r=await verifiedImputation(await imputationFixture(869));assert.equal(r.employeeCount,869);assert.equal(r.rows.length,r.conceptCount);assert.equal(r.ready,true);assert.equal(r.groups.reduce((n,g)=>n+g.conceptCount,0),r.moneyCount);
});
test('una fracción de centavo conserva el importe original y bloquea la imputación, sin redondeo ni compensación',async()=>{
 const s=await imputationFixture(2),row=s.group.snapshot.concepts.find(r=>r.nature!=='auxiliary');row.amount='100.015';await remeasureSyntheticClosure(s,3);
 const r=await verifiedImputation(s),kept=r.rows.find(r=>r.contractId===row.contractId&&r.conceptCode===row.conceptCode);
 assert.equal(kept.amount,'100.015');assert.equal(r.ready,false);assert.deepEqual(kept.issues,['fractional_cent']);assert.equal(kept.state,'needs_review');assert.deepEqual(r.sourceTotals,s.group.snapshot.totals);
});
test('ceros decimales adicionales conservan su representación y no inventan una fracción de centavo',async()=>{
 const s=await imputationFixture(2);s.group.snapshot.concepts.find(r=>r.nature!=='auxiliary').amount='100.01000000';await remeasureSyntheticClosure(s,8);
 const r=await verifiedImputation(s);assert.equal(r.ready,true);assert.ok(r.rows.some(r=>r.amount==='100.01000000'));assert.ok(!r.issues.some(i=>i.code==='fractional_cent'));
});
test('importes grandes y negativos se agregan exactamente sin pasar por Number ni cambiar su naturaleza',async()=>{
 const s=await imputationFixture(2),row=s.group.snapshot.concepts.find(r=>r.nature==='remuneration');row.amount='-99999999999999.99';await remeasureSyntheticClosure(s,2);
 const r=await verifiedImputation(s);assert.equal(r.ready,true);assert.deepEqual(r.allocatedTotals,Object.fromEntries(Object.entries(s.group.snapshot.totals).slice(0,4)));assert.equal(r.rows.find(r=>r.contractId===row.contractId&&r.conceptCode===row.conceptCode).amount,row.amount);
});
test('una fuente con sólo auxiliares informa ausencia de movimientos monetarios y no inventa errores',async()=>{
 const s=await imputationFixture(2);for(const row of s.group.snapshot.concepts)row.nature='auxiliary';await remeasureSyntheticClosure(s,2);
 const r=await verifiedImputation(s);assert.equal(r.ready,false);assert.equal(r.moneyCount,0);assert.equal(r.auxiliaryCount,r.conceptCount);assert.deepEqual(r.issues,[]);assert.deepEqual(r.globalIssues,[]);
});
