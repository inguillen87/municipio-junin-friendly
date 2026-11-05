import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {salaryGridDocument} from '../assets/native-salary-grid-export.js';
import {reportXlsx,reportPdf,reportCsv} from '../assets/report-document.js';
import {row} from './fixtures/native-salary-synthetic.js';
import {salaryItems} from '../assets/native-salary-catalog-model.js';

const rows=salaryItems([row({code:'1',label:'Básico sintético',unit:'days'}),row({code:'88',kind:'auxiliary',nature:'auxiliary',unit:'money',value:'1000.50',precision:2}),row({code:'1',kind:'scale',categoryCode:'6',nature:null,unit:'money',value:'463058.18000000',precision:8,validFrom:'2026-09',validUntil:'2026-09'})]);

test('the maestro grid document keeps the exporter contract: 8 text columns, filter note, revision metadata and a municontrol filename',()=>{
 const filtered=rows.filter(r=>r.kind!=='scale'),doc=salaryGridDocument({rows,filtered,revision:5,version:'b'.repeat(64),filters:{query:'88',kind:'auxiliary'}});const aux=doc.rows.findIndex(r=>r[0]==='Auxiliar'),concept=doc.rows.findIndex(r=>r[0]==='Concepto');
 assert.equal(doc.columns.length,8);assert.ok(doc.columns.every(c=>c.type==='text'));
 assert.equal(doc.rows.length,2);assert.ok(doc.rows.every(r=>r.length===8));
 assert.ok(aux>=0&&concept>=0);assert.equal(doc.rows[aux][6],'1000.50');assert.match(doc.rows[concept][7],/^2026-10 → — · Habilitada$/);
 assert.match(doc.notes[0],/búsqueda «88» · tipo Auxiliar · 2 de 3 definiciones/);
 assert.match(doc.filename,/^municontrol_maestro-salarial_rev5_\d{4}-\d{2}-\d{2}$/);
 assert.ok(reportXlsx(doc) instanceof Uint8Array);assert.ok(reportPdf(doc).length>500);assert.match(reportCsv(doc),/"Auxiliar";"88"/);
});
test('the export module is published and the island loads it on demand rather than bundling it',()=>{
 assert.match(fs.readFileSync('scripts/build-friendly.mjs','utf8'),/'assets\/native-salary-grid-export\.js'/);
 assert.match(fs.readFileSync('src/islands/NativeSalaryCatalog.jsx','utf8'),/new URL\('\/assets\/native-salary-grid-export\.js'/);
 assert.doesNotMatch(fs.readFileSync('src/islands/NativeSalaryCatalog.jsx','utf8'),/from '\.\.\/\.\.\/assets\/report-document\.js'/);
});
