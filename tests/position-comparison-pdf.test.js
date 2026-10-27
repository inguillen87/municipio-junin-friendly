import test from 'node:test';import assert from 'node:assert/strict';
import {comparisonPdfFixture,addComparisonPdfRevision} from './fixtures/position-comparison-pdf-synthetic.js';
import {budgetHash} from '../assets/annual-position-budget-model.js';
import {verifiedPositionComparison,positionComparisonDocument,positionComparisonVisible} from '../assets/position-comparison-model.js';
import {reportPdf,reportCsv,reportXlsx} from '../assets/report-document.js';
const f={active:'all',order:'number',view:'detailed'},decode=bytes=>[...Buffer.from(bytes).toString('ascii').matchAll(/<([0-9a-f]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')),joined=bytes=>decode(bytes).join(' ').replace(/\s+/g,'');
test('el mismo PDF detallado conserva57 legajos y53 filas anuales, incluidas52 sin liquidación',async()=>{
 const v=await verifiedPositionComparison(await comparisonPdfFixture()),sha=await budgetHash(v),d=positionComparisonDocument(v,f,sha),a=d.positionAnnualSummary,bytes=reportPdf(d),text=joined(bytes);
 assert.equal(d.rows.length,57);assert.equal(a.rows.length,56);assert.equal(positionComparisonVisible(d,'Persona sintética QA 001').filtered,1);
 for(const row of v.annual.proposals[0].body.definition.rows)assert.ok(text.includes(row.code),row.code);
 for(const e of v.captures[0].dimensions.payload.employees)assert.ok(text.includes(e.name.replace(/\s/g,'')),e.employeeNumber);
 assert.ok(text.includes('12.50'));assert.ok(text.includes('1026.000000000000000057'));assert.ok(text.includes('-1013.500000000000000057'));
 const raw=Buffer.from(bytes).toString('ascii'),pages=(raw.match(/\/Type \/Page\b/g)||[]).length;assert.ok(pages>3);
 assert.equal(decode(bytes).filter(s=>s==='Consulta SHA-256: '+sha).length,pages);assert.equal(decode(bytes).filter(s=>s==='Norma SHA-256: '+'d'.repeat(64)).length,pages);
});
test('dimensiones, fuente, nulos y cero se conservan; tres totales separados con18 decimales',async()=>{
 const v=await verifiedPositionComparison(await comparisonPdfFixture()),d=positionComparisonDocument(v,f),a=d.positionAnnualSummary,first=a.rows[0];
 assert.match(first[1],/Jurisdicción: 01.*Régimen: No informado.*Agrupamiento: No informado.*Referencia: Fila inventada QA 0/);
 assert.deepEqual(first.slice(3,6),['0','0','0']);const totals=a.rows.filter(r=>r[0]==='TOTAL');assert.equal(totals.length,3);
 assert.deepEqual(totals.map(r=>[r[2],r[3],r[4],r[5]]),[['Cargos','50','0','50'],['Horas cátedra','12.5','1026.000000000000000057','-1013.500000000000000057'],['Personal contratado','1','0','1']]);
 const text=joined(reportPdf(d));for(const s of ['Anexo inventado QA','Detalle de anexo','Fila inventada QA 52','Jurisdicción: 01'])assert.ok(text.includes(s.replace(/\s/g,'')),s);
});
test('norma elegida histórica no se sustituye por la última plantilla; asignaciones siguen originales',async()=>{
 const v=await addComparisonPdfRevision(await comparisonPdfFixture(2,3));await verifiedPositionComparison(v);
 const d=positionComparisonDocument(v,f);assert.equal(v.annual.catalog.definition.rows[1].quantity,'999');assert.equal(d.positionAnnualSummary.rows[1][3],'12.50');assert.equal(d.rows[0][5],'18.000000000000000001');
});
test('asignaciones sin fila en la norma elegida permanecen con sus cantidades; diferencias no evaluables',async()=>{
 const v=await addComparisonPdfRevision(await comparisonPdfFixture(57,53),{removeAssigned:true});v.revision=2;await verifiedPositionComparison(v);const d=positionComparisonDocument(v,f);
 assert.equal(d.rows.length,57);assert.ok(d.rows.every(r=>r[0]==='QA0001'&&r[5]==='18.000000000000000001'&&r[7]==='Otra versión normativa'));
 assert.ok(d.positionAnnualSummary.rows.every(r=>r[5]===null));assert.ok(joined(reportPdf(d)).includes('QA0001'));
});
test('sin captura original se mantienen filas y ausencias; no se toma nombre ni estado actual',async()=>{
 const v=await comparisonPdfFixture(2,3),c=v.captures[0];c.dimensions={...c.dimensions,status:'not_captured',payload:null,payloadSha256:null};c.positions={...c.positions,status:'not_captured',payload:null,payloadSha256:null};await verifiedPositionComparison(v);
 const d=positionComparisonDocument(v,{...f,active:'yes'});assert.equal(d.rows.length,2);assert.ok(d.rows.every(r=>r[2]===null&&r[5]===null));assert.ok(d.positionAnnualSummary.rows.every(r=>r[5]===null));assert.ok(joined(reportPdf(d)).includes('Noinformado'));
});
test('el filtro de estado se aplica al alcance; búsqueda y página no cambian anexo ni CSV/Excel',async()=>{
 const v=await verifiedPositionComparison(await comparisonPdfFixture()),d=positionComparisonDocument(v,{...f,active:'yes'}),rows=structuredClone(d.rows),annex=structuredClone(d.positionAnnualSummary);
 positionComparisonVisible(d,'Persona sintética QA 001',3);assert.deepEqual(d.rows,rows);assert.deepEqual(d.positionAnnualSummary,annex);assert.equal(d.rows.length,29);assert.equal(d.positionAnnualSummary.rows[1][4],'522.000000000000000029');
 assert.equal(reportCsv(d).split('\r\n').length,31);assert.ok(reportXlsx(d).length>1000);assert.ok(!reportCsv(d).includes('TOTAL'));
});
test('sin grupos cerrados no inventa acreditación ni diferencias aunque conserva toda la norma',async()=>{
 const v=await comparisonPdfFixture();v.groups=[];v.employees=[];v.captures=[];await verifiedPositionComparison(v);const d=positionComparisonDocument(v,f);assert.equal(d.rows.length,0);assert.equal(d.positionAnnualSummary.rows.length,56);assert.ok(d.positionAnnualSummary.rows.every(r=>r[4]==='0'&&r[5]===null));assert.ok(joined(reportPdf(d)).includes('Sinresultados'));
});
test('rechaza anexo de otro año, tipo, norma, estado o consulta y anidación recursiva',async()=>{
 const v=await verifiedPositionComparison(await comparisonPdfFixture(2,3));for(const key of ['Ejercicio','Tipo','SHA-256 norma','Estado elegido','SHA-256 consulta']){const d=positionComparisonDocument(v,f);d.positionAnnualSummary.metadata.find(r=>r[0]===key)[1]='otro';assert.throws(()=>reportPdf(d),/otra consulta/);}
 const d=positionComparisonDocument(v,f);d.positionAnnualSummary.positionAnnualSummary=d;assert.throws(()=>reportPdf(d),/adjunta no válida/);
});
test('texto no representable en dimensiones del anexo se rechaza entero, sin sustitución',async()=>{
 const v=await verifiedPositionComparison(await comparisonPdfFixture(2,3)),d=positionComparisonDocument(v,f);d.positionAnnualSummary.rows[0][1]+=' Ж';assert.throws(()=>reportPdf(d),/conservar el texto original/);
});
test('fila normativa larga se divide entre páginas sin perder caracteres ni invadir el pie',async()=>{
 const v=await verifiedPositionComparison(await comparisonPdfFixture(2,3)),d=positionComparisonDocument(v,f);d.positionAnnualSummary.rows[0][6]='LARGO '.repeat(160)+'FIN-SINTETICO';const bytes=reportPdf(d),text=decode(bytes),raw=Buffer.from(bytes).toString('ascii');assert.ok(text.some(s=>s.includes('FIN-SINTETICO')));assert.ok(text.some(s=>s==='Continuación de fila QA0000'));const firstStream=/stream\n([\s\S]+?)endstream/.exec(raw)[1];assert.ok(decode(Buffer.from(firstStream,'ascii')).includes('QA0000'),'una fila que no cabe entera aprovecha la primera página');assert.equal(text.join(' ').split(/\bLARGO\b/).length-1,160);
 for(const m of raw.matchAll(/1 0 0 1 ([0-9.]+) (-?[0-9.]+) Tm/g)){const y=Number(m[2]);assert.ok(y>=62||[31,19,8].includes(y),'texto fuera del cuerpo o pie: '+y);}
});

test('totales con más dígitos que cada fuente no desbordan ni redondean',async()=>{
 const v=await comparisonPdfFixture(2,3),c=v.captures[0];for(const e of c.positions.payload.employees)e.allocations[0].quantity='999999999999999999.999999999999999999';c.positions.payloadSha256=await budgetHash(c.positions.payload);await verifiedPositionComparison(v);
 const d=positionComparisonDocument(v,f),total=d.positionAnnualSummary.rows.find(r=>r[0]==='TOTAL'&&r[2]==='Horas cátedra');assert.equal(total[4],'1999999999999999999.999999999999999998');assert.equal(total[5],'-1999999999999999987.499999999999999998');assert.ok(joined(reportPdf(d)).includes(total[4]));
});

test('el anexo reutiliza el resumen del mismo documento sin volver a recorrer capturas',async()=>{
 const v=await verifiedPositionComparison(await comparisonPdfFixture(57,53));let reads=0;const counted=new Proxy(v,{get(target,key,receiver){if(key==='captures')reads++;return Reflect.get(target,key,receiver);}});
 const d=positionComparisonDocument(counted,f);assert.equal(reads,2,'sólo detalle y resumen existentes; sin consultas o barridos extra para el anexo');assert.equal(d.rows.length,57);assert.equal(d.positionAnnualSummary.rows.length,56);
});
