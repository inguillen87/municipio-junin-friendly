import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPayrollComparison, comparisonSourcesUnchanged, comparisonView, comparisonDocument, comparisonMoney, comparisonTypeLabel } from '../assets/payroll-comparison-model.js';
import { reportPdf, reportXlsx, reportCsv } from '../assets/report-document.js';
import { comparisonFixtures } from '../scripts/payroll-comparison-synthetic.mjs';

const sources = () => comparisonFixtures().reports;
const model = () => createPayrollComparison(...sources().slice(0, 2));
const item = (m, code) => m.rows.find(r => r.code === code);
function changeAmount(d, code, amount) { const row = d.rows.find(r => r.code === code); row.amount = amount; row.missingAmounts = amount === null ? 1 : 0; }

test('exact cents, signed differences and rounded percentages', () => {
  const m = model(); assert.equal(item(m, '1').delta, '100.01'); assert.equal(item(m, '1').percent, '10,00 %');
  assert.equal(item(m, '44').delta, '-20.00'); assert.equal(item(m, '44').percent, '-20,00 %');
  assert.equal(comparisonMoney('-0.01'), '-$ 0,01');
});
test('half-away percentage rounding does not use floating point', () => {
  const [a,b] = sources(); changeAmount(a,'1','32.00'); changeAmount(b,'1','32.01');
  assert.equal(item(createPayrollComparison(a,b),'1').percent,'0,03 %');
  changeAmount(b,'1','31.99'); assert.equal(item(createPayrollComparison(a,b),'1').percent,'-0,03 %');
  changeAmount(a,'1','8.00'); changeAmount(b,'1','8.01'); assert.equal(item(createPayrollComparison(a,b),'1').percent,'0,13 %');
});
test('zero is observed, but absent concept is never turned into zero', () => {
  const m = model(); assert.equal(item(m,'2').baseAmount,'0.00'); assert.equal(item(m,'2').delta,'5.00');
  assert.match(item(m,'2').percent,/Base cero/); assert.equal(item(m,'703').baseAmount,null); assert.equal(item(m,'703').delta,null);
  assert.equal(item(m,'700').targetAmount,null); assert.equal(item(m,'700').delta,null);
});
test('negative base does not produce a misleading percentage', () => {
  const r = item(model(),'3'); assert.equal(r.delta,'-1.00'); assert.match(r.percent,/Base negativa/);
});
test('missing aggregate amount stays absent and non-evaluable', () => {
  const r = item(model(),'550'); assert.equal(r.delta,null); assert.equal(r.status,'missing'); assert.match(r.state,/base: 1 sin importe/);
});
test('equal total with different concept population is not unchanged', () => {
  const r = item(model(),'95'); assert.equal(r.delta,'0.00'); assert.equal(r.status,'coverage'); assert.equal(r.review,true);
});
test('changed definition blocks arithmetic even when the code matches', () => {
  const r = item(model(),'80'); assert.equal(r.delta,null); assert.equal(r.status,'definition'); assert.match(r.description,/Base:.*Comparada:/);
});
for (const key of ['totalGroup','unit']) test('changed '+key+' needs review', () => {
  const [a,b] = sources(); b.rows[0][key] = key === 'unit' ? 'HORAS' : '994';
  assert.equal(item(createPayrollComparison(a,b),'1').status,'definition');
});
test('identical rows are explicitly unchanged', () => { const r = item(model(),'601'); assert.equal(r.status,'unchanged'); assert.equal(r.delta,'0.00'); });
test('source amounts at the limit remain exact; delta overflow is explicit', () => {
  const [a,b] = sources(); changeAmount(a,'1','-9999999999999.99'); changeAmount(b,'1','9999999999999.99');
  const m = createPayrollComparison(a,b); assert.equal(item(m,'1').status,'range'); assert.equal(item(m,'1').delta,null);
  assert.ok(reportXlsx(comparisonDocument(m)).byteLength > 0);
});
test('no totalizer sum in KPI, view or workbook', () => {
  const m = model(), v = comparisonView(m); assert.equal(v.count,10); assert.ok(v.rows.every(r=>!r.totalizer));
  assert.deepEqual(comparisonView(m,{group:'totals'}).rows.map(r=>r.code),['993']);
  assert.equal(comparisonView(m,{group:'all'}).count,11); assert.deepEqual(comparisonDocument(m).totals,[]);
});
test('review filter and changed filter preserve missing and definition cases', () => {
  const m = model(); assert.deepEqual(comparisonView(m,{change:'review'}).rows.map(r=>r.code),['80','95','550','700','703']);
  assert.deepEqual(comparisonView(m,{change:'unchanged'}).rows.map(r=>r.code),['601']);
  assert.equal(comparisonView(m,{change:'changed'}).rows.length,9);
});
test('search is accent insensitive; exports use exactly the filter', () => {
  const m = model(); assert.equal(comparisonView(m,{search:'basico'}).count,1);
  const d = comparisonDocument(m,{search:'basico'}); assert.equal(d.rows[0][0],'1'); assert.equal(d.rows.length,1);
  assert.equal(reportCsv(d).split('\r\n').length,3);
});
test('difference ranking uses absolute cents and puts missing last', () => {
  const v = comparisonView(model(),{sort:'difference'}); assert.equal(v.rows[0].code,'1'); assert.equal(v.rows[1].code,'44');
  const index = v.rows.findIndex(r=>r.delta===null); assert.ok(v.rows.slice(index).every(r=>r.delta===null));
});
test('empty filter cannot fall back to unfiltered exports', () => {
  const d = comparisonDocument(model(),{search:'no-such-code-qa'}); assert.deepEqual(d.rows,[]);
  assert.equal(reportCsv(d).split('\r\n').length,2); assert.ok(reportPdf(d).length>1000); assert.ok(reportXlsx(d).length>1000);
});
for (const filter of [{group:'invalid'},{change:'invalid'},{sort:'invalid'},{search:'a'.repeat(101)}]) test('invalid filter rejected '+JSON.stringify(filter), () => assert.throws(()=>comparisonView(model(),filter)));
test('different types and same dataset cannot be compared', () => {
  const [a,b,,s] = sources(); assert.throws(()=>createPayrollComparison(a,a),/distintas/); assert.throws(()=>createPayrollComparison(a,s),/mismo tipo/);
  assert.equal(comparisonTypeLabel('S'),'Sueldo anual complementario'); assert.equal(comparisonTypeLabel('Z'),'Tipo Z (origen)');
});
test('same date, reversed order, population and closure are not hidden', () => {
  const [a,b] = sources(); assert.equal(createPayrollComparison(a,b).differentPopulationSize,true);
  assert.equal(createPayrollComparison(a,b).nonClosed,true); assert.equal(createPayrollComparison(b,a).reversedDates,true);
  b.date=a.date; assert.equal(createPayrollComparison(a,b).sameDate,true);
});
test('comparison snapshot is immutable and cannot be forged', () => {
  const [a,b] = sources(), before = JSON.stringify([a,b]); const m = createPayrollComparison(a,b);
  assert.equal(JSON.stringify([a,b]),before); a.rows[0].amount='9.00'; assert.equal(item(m,'1').baseAmount,'1000.10');
  assert.throws(()=>m.rows.push({})); assert.throws(()=>{m.base.date='2026-01-01';});
  assert.throws(()=>comparisonDocument({...m})); assert.throws(()=>comparisonSourcesUnchanged({...m},a,b));
});
test('reread recognizes unchanged sources, ignores only row order', () => {
  const [a,b] = sources(), m=createPayrollComparison(a,b); assert.equal(comparisonSourcesUnchanged(m,a,b),true);
  a.rows.reverse(); assert.equal(comparisonSourcesUnchanged(m,a,b),true);
});
for (const key of ['payloadHash','reportHash','closureStatus','sourceLabel','date','type','datasetId','statementCount']) test('reread detects drift in '+key+' despite other matching fields', () => {
  const [a,b,,s]=sources(),m=createPayrollComparison(a,b);
  if(key.endsWith('Hash')) b[key]='a'.repeat(64);
  else if(key==='closureStatus') b[key]='closed'; else if(key==='sourceLabel')b[key]='Otra fuente sintética';
  else if(key==='date') b[key]='2026-09-30'; else if(key==='type') b[key]='S';
  else if(key==='datasetId') b[key]=s.datasetId; else b[key]++;
  assert.equal(comparisonSourcesUnchanged(m,a,b),false);
});
test('matching hashes cannot conceal changed contents', () => {
  const [a,b]=sources(),m=createPayrollComparison(a,b); changeAmount(b,'1','1100.12');
  assert.equal(comparisonSourcesUnchanged(m,a,b),false);
});
for (const bad of [null,{}, {version:'bad'}, {version:'payroll-source-report.v1',official:false,mode:'report',found:false}]) test('unavailable source rejects '+JSON.stringify(bad), () => assert.throws(()=>createPayrollComparison(sources()[0],bad)));
for (const field of ['unit','totalGroup','amount','sourceRows','missingAmounts']) test('malformed concept '+field+' rejected', () => {
  const [a,b]=sources(); b.rows[0][field]=field==='amount'?'NaN':field==='sourceRows'?0:field==='missingAmounts'?99:{};
  assert.throws(()=>createPayrollComparison(a,b));
});
test('union of two complete 1000-code sources exports all 2000 without silent truncation', () => {
  const [a,b]=sources(); for (const [d,start] of [[a,10000],[b,20000]]) {
    d.rows=Array.from({length:1000},(_,i)=>({code:String(start+i),description:'Concepto sintético '+i,totalGroup:'993',unit:null,sourceRows:1,missingAmounts:0,amount:'1.00'}));d.lineCount=1000;
  }
  const m=createPayrollComparison(a,b),d=comparisonDocument(m);assert.equal(d.rows.length,2000);
  assert.equal(reportCsv(d).split('\r\n').length,2002);assert.ok(reportXlsx(d).length>50000);
});
test('exports carry both source identities, two report hashes and actual scope', () => {
  const m=model(),d=comparisonDocument(m,{search:'44'}),text=new TextDecoder().decode(reportXlsx(d));
  for(const marker of [m.base.datasetId,m.target.datasetId,m.base.reportHash,m.target.reportHash])assert.ok(text.includes(marker));
  assert.equal(d.metadata.find(r=>r[0]==='Filas del filtro')[1],1);assert.ok(d.filename.includes('2026-07-31_2026-08-31'));
  assert.ok(new TextDecoder().decode(reportPdf(d)).startsWith('%PDF-1.4'));assert.match(d.notes.join(' '),/no modifica|no.*sueldos|no sueldos/i);
});
test('formula-like labels remain text in XLSX and are neutralized in CSV', () => {
  const [a,b]=sources();a.rows[0].description=b.rows[0].description='=SUM(A1:A9)';const d=comparisonDocument(createPayrollComparison(a,b),{search:'SUM'});
  assert.match(reportCsv(d),/"'=SUM/);assert.ok(new TextDecoder().decode(reportXlsx(d)).includes('t="inlineStr"'));
});
test('both task shells publish comparison and no new write route', () => {
  for(const file of ['assets/payroll-navigation.js','assets/report-centre.js'])assert.match(fs.readFileSync(file,'utf8'),/mountPayrollComparison/);
  const ui=fs.readFileSync('assets/payroll-comparison.js','utf8');assert.match(ui,/resource: 'payrollsourcereport'/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|method:\s*['"](?:POST|PUT|DELETE)/);
  assert.match(ui,/comparisonSourcesUnchanged/);assert.match(ui,/visibilitychange/);assert.match(ui,/taskchange/);
});
