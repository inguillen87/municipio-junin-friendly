import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {comparisonFixture,uid} from './fixtures/position-comparison-synthetic.js';
import {budgetHash} from '../assets/annual-position-budget-model.js';
import {verifiedPositionComparison,positionComparisonDocument,positionComparisonSummary,positionComparisonVisible} from '../assets/position-comparison-model.js';
import {reportCsv,reportPdf,reportXlsx} from '../assets/report-document.js';
import {reportPdfTextLines,reportPdfTextWidth} from '../assets/report-pdf-text.js';

const detailed={active:'all',order:'number',view:'detailed'};
const pdfText=bytes=>[...new TextDecoder().decode(bytes).matchAll(/<([0-9a-f]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(' ');

test('el paquete estático incluye la clausura de imports del panel M10 y del exportador',()=>{
 const build=fs.readFileSync('scripts/build-friendly.mjs','utf8'),block=build.match(/const shellFiles = \[([\s\S]*?)\];/);
 assert.ok(block);const copied=new Set([...block[1].matchAll(/'([^']+)'/g)].map(m=>m[1])),visited=new Set();
 function inspect(file){
  if(visited.has(file))return;visited.add(file);assert.ok(copied.has(file),'Módulo ausente del paquete: '+file);
  const source=fs.readFileSync(file,'utf8');
  for(const m of source.matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g)){
   if(m[1].startsWith('.'))inspect(path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])));
  }
 }
 inspect('assets/position-comparison-panel.js');inspect('assets/report-document.js');assert.ok(visited.size>10);
});

test('M10 conserva denominación y clave separadas en el detalle completo y sus descargas',async()=>{
 const v=await verifiedPositionComparison(await comparisonFixture()),before=structuredClone(v),summary=positionComparisonSummary(v),d=positionComparisonDocument(v,detailed);
 assert.equal(d.columns.length,9);assert.equal(d.columns[8].label,'Cargo según captura');
 assert.equal(d.rows.length,51);assert.equal(d.rows[0][0],'QA0001');assert.equal(d.rows[0][8],'Cargo exclusivamente sintético 1');
 assert.equal(positionComparisonVisible(d,'Cargo exclusivamente sintético 1').filtered,51);
 assert.equal(positionComparisonVisible(d).pages,3);
 const csv=reportCsv(d),xlsx=reportXlsx(d),pdf=pdfText(reportPdf(d));
 assert.equal(csv.split('\r\n').length,53);assert.equal(csv.split('Cargo exclusivamente sintético 1').length-1,51);
 assert.ok(new TextDecoder().decode(xlsx).includes('Cargo exclusivamente sintético 1'));
 assert.match(pdf,/Cargo exclusivamente sintético 1/);
 assert.deepEqual(positionComparisonSummary(v),summary);assert.deepEqual(v,before);
});

test('M10 usa la denominación capturada aunque la norma elegida tenga el mismo código y otro nombre',async()=>{
 const v=await comparisonFixture(2),p=structuredClone(v.annual.proposals[0]);p.id=uid(20);p.decision={...p.decision,id:uid(21),revision:2};
 p.body.definition.rows.find(r=>r.code==='QA0001').label='Cargo renombrado en revisión posterior';p.requestSha256=await budgetHash(p.body);
 v.annual.proposals.push(p);v.annual.proposalCount=2;v.annual.catalog={version:'c'.repeat(64),revision:2,definition:p.body.definition,definitionSha256:await budgetHash(p.body.definition),proposalId:p.id,approvalId:p.decision.id};v.revision=2;
 await verifiedPositionComparison(v);const d=positionComparisonDocument(v,detailed),simple=positionComparisonDocument(v,{...detailed,view:'simple'});
 assert.equal(d.rows[0][8],'Cargo exclusivamente sintético 1');assert.equal(d.rows[0][7],'Otra versión normativa');
 assert.equal(simple.rows.find(r=>r[0]==='QA0001')[1],'Cargo renombrado en revisión posterior');assert.equal(positionComparisonSummary(v).find(r=>r.code==='QA0001').difference,null);
 for(const text of [reportCsv(d),new TextDecoder().decode(reportXlsx(d)),pdfText(reportPdf(d))]){assert.ok(text.includes('Cargo exclusivamente sintético 1'));assert.ok(!text.includes('Cargo renombrado en revisión posterior'));}
});

test('M10 no inventa denominación cuando falta la captura o la asignación',async()=>{
 for(const status of ['not_captured','unassigned','identity_changed']){
  const v=await comparisonFixture(1),c=v.captures[0];
  if(status==='not_captured')Object.assign(c.positions,{status,payload:null,payloadSha256:null});
  else{Object.assign(c.positions.payload.employees[0],{status,allocations:[]});c.positions.payloadSha256=await budgetHash(c.positions.payload);}
  await verifiedPositionComparison(v);const d=positionComparisonDocument(v,detailed);assert.equal(d.rows[0][8],null);
  assert.ok(positionComparisonSummary(v).every(r=>r.difference===null));assert.equal(d.rows.length,1);
 }
});

test('el ajuste PDF mide Helvetica y conserva palabras largas sin invadir otra columna',()=>{
 assert.ok(Math.abs(reportPdfTextWidth('WWW')-24.072)<0.000001);
 assert.ok(Math.abs(reportPdfTextWidth('iii')-5.661)<0.000001);
 assert.equal(reportPdfTextWidth('áéíóú'),reportPdfTextWidth('aeiou'));
 for(const strong of [false,true])for(const value of ['W'.repeat(180),'0'.repeat(64),'Cargo con tildes y espacios','@'.repeat(80),'Æ'.repeat(40)]){
  const parts=reportPdfTextLines(value,100,8.5,strong);
  assert.equal(parts.join('').replace(/\s/g,''),value.replace(/\s/g,''));
  assert.ok(parts.every(line=>reportPdfTextWidth(line,8.5,strong)<=100));
 }
 for(const width of [0,-1,NaN,Infinity])assert.throws(()=>reportPdfTextLines('Cargo',width));
 assert.throws(()=>reportPdfTextLines('W',1));
});

test('M10 admite nueve columnas; otros límites de reporte siguen vigentes',async()=>{
 const d=positionComparisonDocument(await verifiedPositionComparison(await comparisonFixture(1)),detailed);
 assert.doesNotThrow(()=>reportCsv(d));
 assert.throws(()=>reportCsv({...d,layout:'generic.v1'}),/Reporte no válido/);
 assert.doesNotThrow(()=>reportCsv({...d,layout:'own-payroll-report.v1'}));
 assert.throws(()=>reportCsv({...d,columns:[...d.columns,d.columns[0]],rows:d.rows.map(r=>[...r,r[0]])}),/Reporte no válido/);
});

test('M10 conserva descripción de180, código de64 y nombre de160 caracteres en PDF y archivos completos',async()=>{
 const v=await comparisonFixture(2),label='W'.repeat(180),code='000'+'W'.repeat(61),name='W'.repeat(160);
 const definition=v.annual.proposals[0].body.definition,row=definition.rows.find(r=>r.code==='QA0001');Object.assign(row,{code,label});
 v.annual.proposals[0].requestSha256=await budgetHash(v.annual.proposals[0].body);v.annual.catalog.definitionSha256=await budgetHash(definition);
 for(const capture of v.captures){
  for(const employee of capture.positions.payload.employees)for(const allocation of employee.allocations){allocation.rowCode=code;allocation.definitionSha256=v.annual.catalog.definitionSha256;Object.assign(allocation.normative.row,{code,label});}
  capture.positions.payloadSha256=await budgetHash(capture.positions.payload);for(const employee of capture.dimensions.payload.employees)employee.name=name;capture.dimensions.payloadSha256=await budgetHash(capture.dimensions.payload);
 }
 await verifiedPositionComparison(v);const d=positionComparisonDocument(v,detailed),csv=reportCsv(d),xlsx=new TextDecoder().decode(reportXlsx(d)),bytes=reportPdf(d);
 assert.equal(d.rows[0][0],code);assert.equal(d.rows[0][8],label);assert.equal(d.rows[0][2],name);
 for(const value of [code,label,name]){assert.ok(csv.includes(value));assert.ok(xlsx.includes(value));}
 const pdf=new TextDecoder().decode(bytes),parts=[...pdf.matchAll(/BT \/F1 8\.5 Tf [^\n]+? 1 0 0 1 ([\d.]+) ([\d.]+) Tm <([0-9a-f]+)> Tj ET/g)];
 const total=d.columns.reduce((sum,c)=>sum+c.width,0),widths=d.columns.map(c=>c.width/total*770);
 const lastX=42+widths.slice(0,-1).reduce((sum,n)=>sum+n,0),labelParts=parts.filter(m=>Math.abs(Number(m[1])-lastX)<0.000001);
 assert.equal(labelParts.map(m=>Buffer.from(m[3],'hex').toString('latin1')).join(''),label.repeat(2));
 assert.ok(labelParts.every(m=>Buffer.from(m[3],'hex').length*8.024<=widths[8]-12+0.000001));
 assert.ok(parts.every(m=>Number(m[2])>=62));assert.match(pdf,/\/Count [2-9][0-9]* /);
});

test('una celda M10 que continúa en otra página conserva todos sus caracteres y el número de fila',async()=>{
 const d=positionComparisonDocument(await verifiedPositionComparison(await comparisonFixture(1)),detailed),label='W'.repeat(1000);d.rows[0][8]=label;
 const pdf=new TextDecoder().decode(reportPdf(d)),total=d.columns.reduce((sum,c)=>sum+c.width,0),lastX=42+d.columns.slice(0,-1).reduce((sum,c)=>sum+c.width/total*770,0);
 const parts=[...pdf.matchAll(/BT \/F1 8\.5 Tf [^\n]+? 1 0 0 1 ([\d.]+) ([\d.]+) Tm <([0-9a-f]+)> Tj ET/g)],labelParts=parts.filter(m=>Math.abs(Number(m[1])-lastX)<0.000001);
 assert.equal(labelParts.map(m=>Buffer.from(m[3],'hex').toString('latin1')).join(''),label);
 assert.ok(parts.every(m=>Number(m[2])>=62));assert.match(pdfText(new TextEncoder().encode(pdf)),/Fila del informe 1 · continuación/);
});
