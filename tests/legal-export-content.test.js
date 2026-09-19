import test from 'node:test';
import assert from 'node:assert/strict';
import {legalPageCsv,legalDossierHtml,assertSameLegalRecord} from '../assets/legal-document-export.js';
import {record,list} from './fixtures/legal-registry-synthetic.js';
const AT='2026-09-18T23:00:00.000Z';
test('historical dossier includes evidence and version references',()=>{
 const r=record(1,2),html=legalDossierHtml(r,AT);
 for(const text of [r.document.sha256,r.metadata.sourceReference,r.metadata.articles[0].text,r.history[0].reason,AT,'VERSIÓN HISTÓRICA'])assert.ok(html.includes(text));
 assert.ok(html.includes('No es el PDF original'));
 assert.ok(html.includes('@media print'));
});
test('dossier safely presents literal punctuation',()=>{
 const r=record();r.recordedBy='Tema <b>literal</b> & "referencia"';
 const html=legalDossierHtml(r,AT);
 assert.ok(html.includes('Tema &lt;b&gt;literal&lt;/b&gt; &amp; &quot;referencia&quot;'));
 assert.ok(html.includes("default-src 'none'"));
});
test('invalid records and missing export timestamps are rejected',()=>{
 const r=record();r.document.sha256='invalid';assert.throws(()=>legalDossierHtml(r,AT));
 for(const at of [null,'bad','2026-09-18'])assert.throws(()=>legalDossierHtml(record(),at));
});
test('revalidation preserves current record and refuses drift',()=>{
 const r=record();assert.deepEqual(assertSameLegalRecord(r,structuredClone(r)),r);
 assert.throws(()=>assertSameLegalRecord(r,record(1,2)));
 const changed=record();changed.metadata.title='Nuevo título';assert.throws(()=>assertSameLegalRecord(r,changed));
});
test('page export is bounded and contains applied filters and version',()=>{
 const csv=legalPageCsv(list(26,2),{q:'luminarias',kind:'ordenanza',year:'1990'},AT);
 assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"2";"26";"luminarias";"ordenanza";"1990"'));
 assert.ok(csv.includes('&version=1'));assert.equal(csv.split('\r\n').length,3);
});
test('CSV distinguishes literal cells from formulas',()=>{
 for(const title of ['=1+1','+12','-12','@texto','  =1+1','\ttexto']){
  const data=list();data.rows[0].title=title;const csv=legalPageCsv(data,{},AT);
  assert.ok(csv.includes('"\''+title+'"'));
 }
 const data=list();data.rows[0].title='Tema; "detalle"';assert.ok(legalPageCsv(data,{},AT).includes('"Tema; ""detalle"""'));
});
test('invalid filters, pages and item counts cannot be exported',()=>{
 assert.throws(()=>legalPageCsv(list(),{q:'x'.repeat(161)},AT));
 assert.throws(()=>legalPageCsv(list(),{kind:'otro'},AT));
 const data=list();data.pageSize=100;assert.throws(()=>legalPageCsv(data,{},AT));
});
test('empty page yields only labelled CSV headers',()=>{
 const csv=legalPageCsv(list(0),{},AT);assert.equal(csv.split('\r\n').length,2);
 assert.ok(csv.includes('Página exportada'));
});
