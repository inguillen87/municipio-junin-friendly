import test from 'node:test';
import assert from 'node:assert/strict';
import {reportFixture,historicalReportFixture,reportGroup,rehashReportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {ownReportQuery,ownReportPeriods,ownReportFilters,emptyOwnReportFilters,ownReportBundle,verifiedOwnReportBundle,ownReportDocument} from '../assets/own-payroll-report-model.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';
import {OWN_RUN_TYPES} from '../assets/own-payroll-run-workspace-model.js';
const bundle=f=>ownReportBundle(f.query,f.details,f.receipts),filters=patch=>({...emptyOwnReportFilters(),...patch});

test('rango inclusivo conserva cambio de año y los siete tipos, sin tipo todos inventado',()=>{
 assert.deepEqual(ownReportPeriods({from:'2026-11',to:'2027-02',types:['monthly']}),['2026-11','2026-12','2027-01','2027-02']);
 assert.equal(ownReportPeriods({from:'2026-01',to:'2026-12',types:Object.keys(OWN_RUN_TYPES)}).length,12);
 for(const patch of [{from:'2026-00'},{to:'2026-09'},{to:'2027-10'},{types:[]},{types:['all']},{types:['monthly','monthly']},{extra:1}])assert.throws(()=>ownReportQuery({...reportFixture().query,...patch}));
 const sparse=Array(2);sparse[1]='monthly';assert.throws(()=>ownReportQuery({...reportFixture().query,types:sparse}));
});
test('61 legajos y todos sus conceptos se conservan aunque no estén en la primera página',()=>{
 const f=reportFixture(),original=JSON.stringify(f),b=bundle(f),doc=ownReportDocument(b);
 assert.equal(doc.rows.length,61);assert.equal(doc.rows[60][2],'1061');assert.equal(ownReportDocument(b,filters(),'concepts').rows.length,f.receipts[0].snapshot.conceptCount);assert.equal(JSON.stringify(f),original);
 for(const format of [reportCsv,reportXlsx,reportPdf])assert.ok(format(doc).length>1000);
 assert.match(reportCsv(doc),/1061/);assert.equal(doc.metadata.find(r=>r[0]==='Participaciones seleccionadas')[1],61);
});
test('el rango y todos los tipos requieren cada consulta del censo, incluidos los vacíos',()=>{
 const a=historicalReportFixture('2026-09','monthly',501),b=historicalReportFixture('2026-10','monthly',502),c=historicalReportFixture('2026-10','sac',503),empty=structuredClone(a.details[0]);empty.liquidationType='sac';empty.groups=[];
 const q={from:'2026-09',to:'2026-10',types:['monthly','sac']},details=[a.details[0],empty,b.details[0],c.details[0]],receipts=[...a.receipts,...b.receipts,...c.receipts],value=ownReportBundle(q,details,receipts);
 const doc=ownReportDocument(value);assert.equal(doc.rows.length,6);assert.equal(doc.metadata.find(r=>r[0]==='Contratos distintos')[1],2);assert.equal(new Set(doc.rows.map(r=>r[0]+':'+r[1])).size,3);
 assert.throws(()=>ownReportBundle(q,details.slice(1),receipts),/todo el histórico/);assert.throws(()=>ownReportBundle(q,[details[0],details[0],details[2],details[3]],receipts),/repetido/);
 const sources=ownReportDocument(value,filters(),'sources');assert.equal(sources.rows.length,4);assert.equal(sources.rows.find(r=>r[2]==='Sin grupo cerrado')[3],null);
});
test('un grupo faltante, duplicado, ajeno o reabierto nunca produce un informe parcial',()=>{
 const f=reportFixture();assert.throws(()=>ownReportBundle(f.query,f.details,[]),/Falta/);assert.throws(()=>ownReportBundle(f.query,f.details,[...f.receipts,...f.receipts]),/Falta/);
 const wrong=structuredClone(f);wrong.receipts[0].groupId=uid(800);assert.throws(()=>bundle(wrong));
 const reopened=structuredClone(f);reopened.details[0].groups[0].state='reopened';reopened.details[0].groups[0].reopenedAt='2026-10-05T15:00:00Z';reopened.details[0].groups[0].canReopen=false;reopened.details[0].rows=[];reopened.details[0].captures=[];assert.throws(()=>bundle(reopened),/reabierto/);
 const live=ownReportBundle(reopened.query,reopened.details,[]);assert.equal(ownReportDocument(live).rows.length,0);assert.equal(ownReportDocument(live).metadata.find(r=>r[0]==='Neto exacto del alcance')[1],'Sin participaciones');
});
test('dos cierres del mismo contrato/período/tipo rechazan todo; otros meses/tipos son participaciones distintas',()=>{
 const f=reportFixture(2),copy=structuredClone(f.receipts[0]);copy.id=uid(900);copy.groupId=copy.id;copy.key=uid(901);f.receipts.push(copy);f.details[0].groups.push(reportGroup(copy));assert.throws(()=>bundle(f),/dos veces/);
});
test('los límites del operador son inclusivos y preservan códigos originales',()=>{
 const b=bundle(reportFixture());const doc=ownReportDocument(b,filters({employeeFrom:'001025',employeeTo:'001050',departmentFrom:'01',departmentTo:'001',agreementFrom:'1',agreementTo:'1'}));
 assert.equal(doc.rows.length,26);assert.equal(doc.rows[0][2],'1025');assert.equal(doc.rows.at(-1)[2],'1050');assert.throws(()=>ownReportFilters(filters({employeeFrom:'6',employeeTo:'5'})));assert.throws(()=>ownReportFilters(filters({departmentFrom:'1e1'})));assert.throws(()=>ownReportFilters({...filters(),search:'x'}));
 const none=ownReportDocument(b,filters({employeeFrom:'8000'}));assert.deepEqual(none.rows,[]);assert.equal(none.metadata.find(r=>r[0]==='Bruto exacto del alcance')[1],'Sin participaciones');
});
test('la dimensión histórica gobierna aunque el padrón actual tenga otra repartición',()=>{
 const f=historicalReportFixture('2026-10','monthly');for(const r of f.receipts[0].snapshot.concepts)r.departmentCode='00042';for(const e of f.receipts[0].snapshot.employees)e.departmentCode='00042';rehashReportFixture(f);
 const b=bundle(f),doc=ownReportDocument(b,filters({departmentFrom:'42',departmentTo:'42'}));assert.equal(doc.rows.length,2);assert.equal(doc.rows[0][4],'00042');assert.equal(ownReportDocument(b,filters({departmentTo:'1'})).rows.length,0);assert.match(doc.notes.join(' '),/Jurisdicción.*no se infieren/);
});
test('el histórico parcial conserva cantidades y huella, sin declararlo cierre municipal',()=>{
 const f=reportFixture(2);f.receipts[0].snapshot.populationCount=5;f.receipts[0].snapshot.populationComplete=false;rehashReportFixture(f);const doc=ownReportDocument(bundle(f),filters(),'sources');assert.equal(doc.rows[0][3],2);assert.equal(doc.rows[0][4],5);assert.equal(doc.rows[0][6],f.receipts[0].snapshotSha256);assert.match(doc.notes.join(' '),/no certifica cobertura/);
});
test('estadísticas concilian las participaciones y mantienen auxiliares fuera de los haberes',()=>{
 const f=reportFixture(),b=bundle(f),all=ownReportDocument(b,filters(),'statistics');assert.equal(all.rows.reduce((n,r)=>n+r[5],0),f.receipts[0].snapshot.conceptCount);
 assert.ok(all.rows.some(r=>r[3]==='Auxiliar'));for(const grouping of ['department','agreement','agreement_department'])assert.equal(ownReportDocument(b,filters(),'statistics',grouping).rows.length,all.rows.length);const combined=ownReportDocument(b,filters(),'statistics','agreement_department');assert.equal(combined.columns[1].label,'Convenio / repartición');assert.ok(combined.rows.every(r=>r[1]==='1 / 1'));
 assert.equal(all.metadata.find(r=>r[0]==='Neto exacto del alcance')[1],f.receipts[0].snapshot.totals.net);assert.ok(all.notes.some(n=>n.includes('no se suman como haberes')));
});
test('no mezcla la unidad de un concepto entre versiones ni redondea el auxiliar',()=>{
 const f=historicalReportFixture('2026-10','monthly'),r=f.receipts[0].snapshot.concepts.find(r=>r.nature==='auxiliary');assert.ok(r);r.unit='percentage';r.amount='-0.00000001';rehashReportFixture(f);
 const doc=ownReportDocument(bundle(f),filters(),'statistics');assert.ok(doc.rows.some(row=>row[4]==='percentage'&&row[6]==='-0.00000001'));assert.equal(doc.rows.filter(row=>row[2]===r.conceptCode).length,2);
});
test('CSV, Excel y PDF preservan precisión exacta como texto y no publican trazas o motivos',()=>{
 const f=reportFixture(2),doc=ownReportDocument(bundle(f),filters(),'concepts'),csv=reportCsv(doc),xlsx=Buffer.from(reportXlsx(doc)).toString('utf8'),pdf=Buffer.from(reportPdf(doc)).toString('latin1');
 assert.ok(csv.startsWith('\ufeff'));assert.match(xlsx,/inlineStr/);assert.match(pdf,/%PDF-1.4/);for(const out of [csv,xlsx,pdf]){assert.doesNotMatch(out,/Cierre exclusivamente sintético para QA|inputSha256|actorEmail|identityToken|trace/);}
});
test('PDF propio informa rango, tipos, filtros, cantidades y totales originales',()=>{
 const f=reportFixture(2),d=ownReportDocument(bundle(f),filters({employeeFrom:'1001'})),pdf=Buffer.from(reportPdf(d)).toString('latin1'),text=[...pdf.matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(' ');
 assert.match(text,/2026-10 a 2026-10/);assert.match(text,/Tipos: Mensual/);assert.match(text,/Legajos: 1001 a fin/);assert.match(text,/Participaciones: 2/);assert.ok(text.includes('Neto: '+f.receipts[0].snapshot.totals.net));
});
test('el CSV neutraliza fórmulas de texto del campo unidad y Excel usa texto sin fórmula',()=>{
 const f=historicalReportFixture('2026-10','monthly'),r=f.receipts[0].snapshot.concepts.find(r=>r.nature==='auxiliary');r.unit='  =HYPERLINK("sintetico")';rehashReportFixture(f);const d=ownReportDocument(bundle(f),filters(),'concepts');assert.match(reportCsv(d),/'  =HYPERLINK/);const xlsx=Buffer.from(reportXlsx(d)).toString('utf8');assert.match(xlsx,/  =HYPERLINK\(&quot;sintetico&quot;\)/);assert.doesNotMatch(xlsx,/<f>\s*=HYPERLINK/);
});
test('copia omitida, total alterado y hash alterado se rechazan antes de descargar',async()=>{
 for(const mutate of [f=>f.receipts[0].snapshot.concepts.pop(),f=>f.receipts[0].snapshot.totals.net='0.00',f=>f.receipts[0].snapshot.employees[0].totals.net=null]){const f=reportFixture();mutate(f);assert.throws(()=>bundle(f));}
 const f=reportFixture(2);await verifiedOwnReportBundle(f.query,f.details,f.receipts);f.receipts[0].bodySha256='a'.repeat(64);await assert.rejects(verifiedOwnReportBundle(f.query,f.details,f.receipts),/integridad/);
});
test('sin fuentes cerradas informa ausencia sin inventar errores ni netos cero',()=>{
 const f=historicalReportFixture('2026-10','monthly');f.details[0].groups=[];const b=ownReportBundle(f.query,f.details,[]);assert.equal(ownReportDocument(b).rows.length,0);assert.equal(ownReportDocument(b,filters(),'sources').rows.length,1);assert.equal(ownReportDocument(b).metadata.find(r=>r[0]==='Neto exacto del alcance')[1],'Sin participaciones');
});
test('2001 filas propias se exportan completas; el límite de reportes anteriores sigue vigente',()=>{
 const base=ownReportDocument(bundle(reportFixture(2))),d={...base,rows:Array.from({length:2001},(_,n)=>['2026-10','Mensual',String(n+1),'1','1','0.001','0.000','0.001'])};assert.match(reportCsv(d),/"2001"/);assert.ok(reportXlsx(d).length>1000);const pdf=Buffer.from(reportPdf(d)).toString('latin1'),text=[...pdf.matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1'));for(let n=1;n<=2001;n++)assert.ok(text.includes(String(n)),'PDF contains original legajo '+n);assert.throws(()=>reportCsv({...d,layout:'compact-concepts.v1'}));assert.throws(()=>reportCsv({...d,rows:Array(250001).fill(d.rows[0])}));
});
test('más de diez mil conceptos se conservan completos para permitir consolidación anual',()=>{
 const f=reportFixture(2001),b=bundle(f);assert.ok(f.receipts[0].snapshot.conceptCount>10000);assert.equal(ownReportDocument(b,filters(),'concepts').rows.length,f.receipts[0].snapshot.conceptCount);
});
test('no modifica cuerpos, claves ni snapshots ya guardados al emitir las cuatro vistas',()=>{
 const f=reportFixture(2),before=JSON.stringify(f),b=bundle(f);for(const view of ['payroll','summary','concepts','statistics','sources'])for(const exportFn of [reportCsv,reportXlsx,reportPdf])exportFn(ownReportDocument(b,filters(),view));assert.equal(JSON.stringify(f),before);assert.equal(f.receipts[0].snapshotSha256,ownRunHash(f.receipts[0].snapshot));
});
test('resumen por período/tipo/convenio/repartición concilia sin volver a sumar conceptos',()=>{
 const f=reportFixture(61),doc=ownReportDocument(bundle(f),filters(),'summary');assert.equal(doc.rows.length,1);assert.equal(doc.rows[0][4],61);assert.deepEqual(doc.rows[0].slice(5),['gross','deduction','net'].map(k=>f.receipts[0].snapshot.totals[k]));const selected=ownReportDocument(bundle(f),filters({employeeTo:'1002'}),'summary');assert.equal(selected.rows[0][4],2);
});
