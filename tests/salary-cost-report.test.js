import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceSalaryCost, sourceReportDocument } from '../assets/payroll-source-report-model.js';
import { reportPdf, reportXlsx } from '../assets/report-document.js';

import { syntheticCostReport } from '../scripts/salary-cost-synthetic.mjs';

const source=()=>syntheticCostReport();
const edit=(d,code,amount)=>{const r=d.rows.find(x=>x.code===code);r.amount=amount;r.missingAmounts=amount===null?1:0;return d;};

test('exact five-code formula and controls, no 990 added twice',()=>{
  const d=source(),old=JSON.stringify(d),c=sourceSalaryCost(d);
  assert.equal(c.amount,'1245.00');assert.equal(c.earnings,'1075.00');assert.equal(c.contributions,'170.00');
  assert.equal(c.controls.contributionsDifference,'0.08');assert.equal(c.controls.netDifference,'1.00');
  assert.equal(c.controls.netCalculated,'875.00');assert.equal(c.official,false);assert.equal(JSON.stringify(d),old);
});
for(const code of ['993','994','995','701','703'])test('missing '+code+' is not zero or partial cost',()=>{
  const d=source();d.rows=d.rows.filter(r=>r.code!==code);d.lineCount-=2;
  const c=sourceSalaryCost(d);assert.equal(c.amount,null);assert.deepEqual(c.missingCodes,[code]);
  assert.ok(reportPdf(sourceReportDocument(d)).length>1000);
  assert.doesNotMatch(new TextDecoder().decode(reportXlsx(sourceReportDocument(d))),/<f>SUM\(C2:C6\)<\/f>/);
});
for(const code of ['993','994','995','701','703'])test('incomplete amount '+code+' stays missing',()=>{
  const c=sourceSalaryCost(edit(source(),code,null));assert.equal(c.amount,null);assert.deepEqual(c.missingCodes,[code]);
});
test('explicit zero and negative corrections are preserved',()=>{
  const d=edit(edit(source(),'994','0.00'),'703','-0.01');const c=sourceSalaryCost(d);
  assert.equal(c.amount,'1094.99');assert.equal(c.contributions,'69.99');
});
test('retentions never reduce employer cost; 990 never increases it',()=>{
  const d=edit(edit(source(),'996','999999.99'),'990','999999.99');assert.equal(sourceSalaryCost(d).amount,'1245.00');
});
for(const filter of [{group:'discounts'},{group:'contributions'},{group:'totals'},{search:'sin-coincidencias'}])test('cost retains complete dataset scope '+JSON.stringify(filter),()=>{
  const d=source(),doc=sourceReportDocument(d,filter);assert.deepEqual(doc.salaryCost,sourceSalaryCost(d));assert.equal(doc.totals.length,0);
});
test('BigInt arithmetic is exact near the source monetary bound',()=>{
  const d=source();for(const code of ['993','994','995','701','703'])edit(d,code,'9999999999999.99');
  assert.equal(sourceSalaryCost(d).amount,'49999999999999.95');
});
test('negative zero arithmetic is normalized without changing source values',()=>{
  const d=source();for(const code of ['993','994','995','701','703'])edit(d,code,'-0.00');assert.equal(sourceSalaryCost(d).amount,'0.00');assert.equal(d.rows.find(r=>r.code==='993').amount,'-0.00');
});
test('generic report exports retain their three-sheet layout',()=>{
  const doc=sourceReportDocument(source());delete doc.salaryCost;delete doc.layout;
  const zip=new TextDecoder().decode(reportXlsx(doc));assert.doesNotMatch(zip,/name="Costo salarial"/);assert.match(zip,/name="Control"/);
});
test('workbook adds numeric cost components, formulas and cached control results',()=>{
  const zip=new TextDecoder().decode(reportXlsx(sourceReportDocument(source(),{search:'no-match'})));
  assert.match(zip,/name="Costo salarial"/);assert.match(zip,/<f>SUM\(C2:C6\)<\/f><v>1245<\/v>/);
  assert.match(zip,/<f>C11-C10<\/f><v>0.08<\/v>/);assert.match(zip,/<f>C17-C16<\/f><v>1<\/v>/);
  assert.match(zip,/<c r="C2" s="3"><v>1000<\/v>/);
});
test('compact PDF retains all rows and keeps 91 synthetic concepts within three pages',()=>{
  const doc=sourceReportDocument(source()),pdf=new TextDecoder().decode(reportPdf(doc));
  assert.ok(pdf.startsWith('%PDF-1.4'));assert.ok((pdf.match(/\/Type \/Page /g)||[]).length<=3);
  for(const row of doc.rows){const hex=Buffer.from(row[1],'latin1').toString('hex');assert.ok(pdf.includes(hex));}
});
for(const change of [c=>c.amount='0.00',c=>c.controls.netDifference='0.00',c=>c.missingCodes=['993'],c=>c.components[0].code='990'])test('inconsistent salary annex fails closed '+change,()=>{
  const doc=sourceReportDocument(source());change(doc.salaryCost);assert.throws(()=>reportPdf(doc));assert.throws(()=>reportXlsx(doc));
});
test('an unavailable control does not block an otherwise complete five-code cost',()=>{
  const d=source();d.rows=d.rows.filter(r=>r.code!=='990');d.lineCount-=2;
  assert.equal(sourceSalaryCost(d).amount,'1245.00');assert.equal(sourceSalaryCost(d).controls.contributionsDifference,null);
});
