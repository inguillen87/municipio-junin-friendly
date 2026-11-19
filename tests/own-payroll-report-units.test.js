import test from 'node:test';import assert from 'node:assert/strict';
import {ownReportDocument,emptyOwnReportFilters,verifiedOwnReportBundle} from '../assets/own-payroll-report-model.js';
import {reportCsv} from '../assets/report-document.js';
import {historicalReportFixture,rehashReportFixture} from './fixtures/own-payroll-report-synthetic.js';

test('conceptos y estadísticas nombran la unidad en palabras, no con el código interno',async()=>{
 const f=historicalReportFixture('2026-11','monthly'),b=await verifiedOwnReportBundle(f.query,f.details,f.receipts);
 for(const view of ['concepts','statistics']){
  const d=ownReportDocument(b,emptyOwnReportFilters(),view),index=d.columns.findIndex(c=>c.label==='Unidad');assert.ok(index>=0,view);assert.ok(d.rows.length>0);
  assert.deepEqual([...new Set(d.rows.map(r=>r[index]))],['Dinero'],view);
  const csv=reportCsv(d);assert.match(csv,/"Dinero"/);assert.doesNotMatch(csv,/"money"/);
 }
});

test('una unidad distinta de dinero también sale en palabras y no cambia la de los demás conceptos',async()=>{
 const f=historicalReportFixture('2026-11','monthly'),s=f.receipts[0].snapshot,first=s.concepts.filter(c=>c.nature==='auxiliary');
 assert.ok(first.length>=1);for(const c of first)c.unit='days';
 const b=await verifiedOwnReportBundle(...(({query,details,receipts})=>[query,details,receipts])(rehashReportFixture(f)));
 const d=ownReportDocument(b,emptyOwnReportFilters(),'concepts'),unit=d.columns.findIndex(c=>c.label==='Unidad'),nature=d.columns.findIndex(c=>c.label==='Naturaleza');
 assert.deepEqual([...new Set(d.rows.filter(r=>r[nature]==='Auxiliar').map(r=>r[unit]))],['Días']);
 assert.deepEqual([...new Set(d.rows.filter(r=>r[nature]!=='Auxiliar').map(r=>r[unit]))],['Dinero']);
});
