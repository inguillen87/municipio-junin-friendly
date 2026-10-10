import test from 'node:test';import assert from 'node:assert/strict';
import {variableReportFixture} from './fixtures/own-payroll-report-variables-synthetic.js';
import {ownReportBundle,ownReportDocument,emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';
import {ownReportVariableSources} from '../assets/own-payroll-report-variables.js';
import {verifiedWorkspaceCapture} from '../assets/own-payroll-run-workspace-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';
const bundle=f=>ownReportBundle(f.query,f.details,f.receipts,f.captures),doc=(b,filters=emptyOwnReportFilters(),ids=[],jurisdiction='all')=>ownReportDocument(b,filters,'variables','concept',ids,jurisdiction);

test('variables originales completas de 61 legajos: uso directo e indirecto, fuentes, descripción y nueve columnas exportables',async()=>{
 const f=variableReportFixture(),before=JSON.stringify(f),b=bundle(f),d=doc(b);
 for(const c of f.captures)await verifiedWorkspaceCapture(c);
 assert.equal(d.rows.length,122);const used=ownReportDocument(b,emptyOwnReportFilters(),'variable_usage');assert.equal(used.rows.length,427);assert.equal(d.columns.length,9);assert.equal(new Set(d.rows.map(r=>r[1])).size,61);
 assert.equal(used.rows.filter(r=>r[2].startsWith('base /')&&r[6]==='Uso directo').length,61);
 assert.equal(used.rows.filter(r=>r[2].startsWith('base /')&&r[6]==='Uso por concepto referenciado').length,244);
 assert.match(d.rows.find(r=>r[2].startsWith('base /'))[7],/Parámetro 8800.*Catálogo:/);
 assert.match(d.rows[0][8],/Fecha no declarada/);
 const csv=reportCsv(d);assert.equal(csv.split('\r\n').length-2,122);assert.ok(reportXlsx(d).byteLength>0);assert.ok(reportPdf(d).byteLength>0);
 assert.equal(JSON.stringify(f),before,'consulta no cambia cuerpos, claves, reglas, datos o resultados');
});
test('antigüedad nula, cero y ocho decimales permanecen distintos; una rama no ejecutada no demuestra uso',()=>{
 const d=doc(bundle(variableReportFixture(3,{age:true}))),ages=d.rows.filter(r=>r[2].startsWith('antiguedad /'));
 assert.deepEqual(ages.map(r=>r[3]),[null,'0.00000000','12.12345678']);assert.ok(ages.every(r=>r[4]==='Unidades'&&r[5]===0&&r[6]===0));
 assert.match(d.notes.join(' '),/antigüedad.*capturada.*ausencia no equivale a cero/i);
});
test('antigüedad efectivamente usada, incluidos cero y centésimos, conserva unidad y fecha declaradas sin reconstrucción',()=>{
 const b=bundle(variableReportFixture(3,{age:'used',declaredDate:'2026-10-31'})),d=doc(b),ages=d.rows.filter(r=>r[2].startsWith('antiguedad /'));
 assert.deepEqual(ages.map(r=>r[3]),['12.12345678','0.00000000','12.12345678']);assert.ok(ages.every(r=>r[5]===1&&r[6]===0&&r[8].endsWith('2026-10-31')));
 const sources=ownReportDocument(b,emptyOwnReportFilters(),'variable_sources');assert.ok(sources.rows.every(r=>r[3]==='2026-10-31'));
});
test('capturas históricas fuera del padrón/listado actual; meses y tipos completos, sin inferir datos actuales',()=>{
 const a=variableReportFixture(2,{historical:true,ordinal:10}),b=variableReportFixture(2,{period:'2026-11',type:'sac',historical:true,ordinal:20}),missingA=structuredClone(a.details[0]),missingB=structuredClone(b.details[0]);missingA.liquidationType='sac';missingA.groups=[];missingB.liquidationType='monthly';missingB.groups=[];
 const q={from:'2026-10',to:'2026-11',types:['monthly','sac']},value=ownReportBundle(q,[...a.details,...b.details,missingA,missingB],[...a.receipts,...b.receipts],[...a.captures,...b.captures]),d=doc(value);
 assert.equal(d.rows.length,8);assert.equal(new Set(d.rows.map(r=>r[0])).size,2);assert.equal(ownReportDocument(value,emptyOwnReportFilters(),'variable_sources').rows.length,4);
});
test('rangos y legajos exactos gobiernan las variables y sus fuentes; búsqueda no entra en el contrato de exportación',()=>{
 const f=variableReportFixture(),b=bundle(f),filters={...emptyOwnReportFilters(),employeeFrom:'1025',employeeTo:'1050'};
 assert.equal(doc(b,filters).rows.length,26*2);assert.equal(doc(b,emptyOwnReportFilters(),[f.receipts[0].snapshot.employees[0].contractId]).rows.length,2);
 const sources=ownReportDocument(b,filters,'variable_sources');assert.equal(sources.rows.reduce((n,r)=>n+r[4],0),26);assert.throws(()=>doc(b,emptyOwnReportFilters(),[],'42'),/jurisdicciones no capturadas/);
 assert.throws(()=>doc(b,{...filters,search:'base'}));
});
test('ausencia, duplicación, captura ajena, datos cambiados o hash de otra liquidación rechazan el conjunto incluso con filtro vacío',()=>{
 const f=variableReportFixture(3);for(const change of [g=>g.captures.pop(),g=>g.captures[1]=g.captures[0],g=>g.captures[0].id='10000000-0000-4000-8000-999999999999',g=>g.captures[0].saved.inputSha256='f'.repeat(64),g=>g.captures[0].saved.input.employees[0].departmentCode='99',g=>g.captures[0].saved.result.rows[0].trace=[]]){
  const bad=structuredClone(f);change(bad);assert.throws(()=>doc(bundle(bad),{...emptyOwnReportFilters(),employeeFrom:'9999'}));
 }
 assert.throws(()=>ownReportDocument(ownReportBundle(f.query,f.details,f.receipts),emptyOwnReportFilters(),'variables'),/Faltan capturas/);
});
test('hash alterado y traza coherentemente reemplazada no se aceptan como fuente original',async()=>{
 const f=variableReportFixture(2),bad=structuredClone(f.captures[0]);bad.saved.input.employees[0].inputs[0].sourceReference='Fuente inventada alterada';await assert.rejects(verifiedWorkspaceCapture(bad),/integridad/);
 const changed=structuredClone(f);changed.captures[0].saved.result.rows[0].trace[0].reference='antiguedad';changed.captures[0].saved.resultSha256=ownRunHash(changed.captures[0].saved.result);assert.throws(()=>bundle(changed),/liquidación cerrada original/);
});
test('CSV seguro, literales exactos y capacidad global explícita; no recorta el informe para un filtro',()=>{
 const f=variableReportFixture(3,{age:true,opaqueNumber:'=1+1'});for(const c of f.captures){c.payload.programState.salaryCatalog.items.find(d=>d.code==='8801').label='=Descripción sintética';c.payloadSha256=ownRunHash(c.payload);}
 const b=bundle(f),csv=reportCsv(doc(b));assert.match(csv,/12\.12345678/);assert.match(csv,/0\.00000000/);assert.ok(!csv.includes('"=Descripción sintética"'));assert.ok(csv.includes("\"'=1+1 / 1 / 1\""));assert.ok(!csv.includes('"=1+1 / 1 / 1"'));
 assert.throws(()=>ownReportVariableSources(b,f.captures,2),/completo.*250\.000.*No se omitieron/);
});
test('censo sin liquidaciones cerradas informa ausencia de variables, sin valores o incidencias inventados',()=>{
 const f=variableReportFixture(2);f.details[0].rows=[];f.details[0].captures=[];f.details[0].groups=[];const b=ownReportBundle(f.query,f.details,[],[]);assert.deepEqual(doc(b).rows,[]);assert.deepEqual(ownReportDocument(b,emptyOwnReportFilters(),'variable_sources').rows,[]);
});
test('PDF conserva los encabezados largos dentro de su fondo y separa el cuerpo, en todas las páginas',()=>{
 const b=bundle(variableReportFixture(6));
 for(const view of ['variables','variable_usage','variable_sources']){const d=ownReportDocument(b,emptyOwnReportFilters(),view),pdf=new TextDecoder().decode(reportPdf(d)),streams=[...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)];assert.ok(streams.length>=(view==='variable_sources'?1:2),'variables y uso abarcan varias páginas; las fuentes agrupan las dos corridas');
 for(const [,page]of streams){const bar=/0\.09 0\.24 0\.30 rg 36 ([\d.]+) [\d.]+ ([\d.]+) re f/.exec(page);assert.ok(bar);const bottom=Number(bar[1]),height=Number(bar[2]),headings=[...page.matchAll(/BT \/F2 8 Tf 1 1 1 rg 1 0 0 1 [\d.]+ ([\d.]+) Tm <([a-f0-9]+)> Tj ET/g)];assert.ok(headings.length>=d.columns.length);
  if(view!=='variable_sources')assert.ok(headings.some(h=>Buffer.from(h[2],'hex').toString('latin1').endsWith('repartición')),'encabezado de repartición presente en cada página');
  for(const h of headings)assert.ok(Number(h[1])>bottom+3&&Number(h[1])<bottom+height,'cada línea del encabezado queda dentro del fondo');
  const body=page.slice(bar.index+bar[0].length).matchAll(/BT \/F[12] 8\.5 Tf 0\.08 0\.22 0\.29 rg 1 0 0 1 [\d.]+ ([\d.]+) Tm/g);for(const t of body)assert.ok(Number(t[1])<bottom-3,'el cuerpo no se superpone con los encabezados');
 }
 }
});
