import test from 'node:test';
import assert from 'node:assert/strict';
import {grhFileRequest,grhPreview,grhIncidentReport,grhWriteAttempt} from '../assets/payroll-grh-import-model.js';
import {reviewGrhImport} from '../lib/internal-grh-import.js';
import {fixture,id,principal,session} from './fixtures/grh-import-synthetic.js';

async function review(f){
 const expected=await grhFileRequest(Buffer.from(f.payload.contentBase64,'base64'),{concept:f.payload.concept,periodMonth:f.payload.periodMonth});
 const raw=(await reviewGrhImport(f.readSql,f.runtime,principal(),session(),f.payload)).data;
 return {expected,raw,checked:grhPreview({ok:true,replayed:false,data:raw},expected)};
}
const csvRows=report=>report.csv.replace(/^\uFEFF/,'').trimEnd().split('\r\n').slice(1);

test('incident report includes every source line across three display pages',async()=>{
 const f=fixture(125);f.state.records=[];
 const {checked}=await review(f),report=grhIncidentReport(checked);
 assert.equal(report.affectedRows,125);assert.equal(report.globalIssues,0);
 assert.deepEqual(csvRows(report).map(row=>Number(row.split(',')[0].replaceAll('"',''))),Array.from({length:125},(_,i)=>i+1));
 assert.equal(f.state.writes,0);
});

test('the four unresolved statuses remain distinct and resolved rows are absent',async()=>{
 const f=fixture(6);
 f.state.records.push({...f.state.records[0],contractId:id(800),legajo:'4001'});
 f.state.records.push({...f.state.records[1],contractId:id(801),personId:id(802),legajo:'4002'});
 f.state.records[4].legajo=f.state.records[3].legajo;
 f.state.records=f.state.records.filter(r=>r.dni!=='99000003');
 const {checked}=await review(f),report=grhIncidentReport(checked),rows=csvRows(report);
 assert.equal(report.affectedRows,5);
 for(const [index,status] of ['Elegir contrato','Identidad duplicada','Vínculo no encontrado','Destino repetido','Destino repetido'].entries())assert.ok(rows[index].startsWith('"'+(index+1)+'","'+status+'",'));
 assert.equal(rows.length,5);assert.equal(f.state.writes,0);
});

test('CSV contains only allowlisted text and source line numbers, never nominal values or formulas',async()=>{
 const f=fixture(2);
 f.state.records[0].name='=HYPERLINK("https://example.invalid","QA, fórmula")';
 f.state.records.push({...f.state.records[0],contractId:id(888),legajo:'8001',name:'+CMD | @SUM(1;2) "QA"'});
 const {checked}=await review(f),report=grhIncidentReport(checked);
 assert.equal(report.csv,'\uFEFF"Fila de origen","Estado","Acción sugerida"\r\n"1","Elegir contrato","Elegí el contrato correspondiente y volvé a revisar el archivo completo."\r\n');
 for(const r of checked.rows){
  for(const value of [r.dni,r.amountCents,r.conceptSourceId,...r.candidates.flatMap(c=>[c.name,c.legajo,c.contractId,c.startDate])])assert.equal(report.csv.includes(value),false,value);
 }
 for(const value of [checked.sourceSha256,checked.previewToken,checked.periodMonth,f.payload.contentBase64,Buffer.from(f.payload.contentBase64,'base64').toString()])assert.equal(report.csv.includes(value),false);
 assert.doesNotMatch(report.csv,/"[=+\-@\t]/);assert.equal(f.state.writes,0);
});

test('quantity limit is one global incident with no invented omitted source rows',async()=>{
 const f=fixture(501),{checked}=await review(f),report=grhIncidentReport(checked);
 assert.equal(report.affectedRows,0);assert.equal(report.globalIssues,1);
 assert.equal(csvRows(report).length,1);assert.match(csvRows(report)[0],/^"","Límite de cantidad",/);
 assert.doesNotMatch(report.csv,/Sin observaciones|"501"|"500"/);assert.equal(checked.readyToPrepare,false);
});

test('global quantity incident does not suppress unresolved rows',async()=>{
 const f=fixture(501);f.state.records.pop();
 const {checked}=await review(f),report=grhIncidentReport(checked);
 assert.equal(report.affectedRows,1);assert.equal(report.globalIssues,1);
 assert.ok(csvRows(report)[0].startsWith('"501","Vínculo no encontrado",'));
 assert.ok(csvRows(report)[1].startsWith('"","Límite de cantidad",'));
});

test('a clean verified preview reports no observations without inventing row errors',async()=>{
 const {checked}=await review(fixture()),report=grhIncidentReport(checked);
 assert.equal(report.affectedRows,0);assert.equal(report.globalIssues,0);
 assert.equal(csvRows(report).length,1);assert.match(csvRows(report)[0],/^"","Sin observaciones",/);
 assert.match(report.csv,/No acredita importación, aprobación ni liquidación/);
});

test('report refuses unverified, copied, filtered and forged previews',async()=>{
 const {raw,checked}=await review(fixture(60));
 for(const invalid of [null,undefined,raw,structuredClone(checked),Object.freeze({...checked}),{...checked,rows:checked.rows.slice(0,50)},{...checked,rows:[{sourceLines:['=CMD()'],status:'not_found'}]}])assert.throws(()=>grhIncidentReport(invalid),/Revisá el archivo completo/);
});

test('report generation cannot mutate the verified preview or a pending write body and key',async()=>{
 const {expected,checked}=await review(fixture(60)),attempt=grhWriteAttempt(expected,checked,id(999),'scope');
 const before=JSON.stringify({expected,checked,attempt});
 grhIncidentReport(checked);grhIncidentReport(checked);
 assert.equal(JSON.stringify({expected,checked,attempt}),before);assert.ok(Object.isFrozen(checked));
});
