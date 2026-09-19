import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {noveltyBatchControl, noveltyControlCsv, noveltyReviewPage} from '../assets/payroll-novelty-review.js';
const row = (i, changes = {}) => ({rowOrdinal:i,legajo:String(1000+i),conceptSourceId:'44',amountCents:null,quantityDecimal:'1',forced:false,
  costCenterSourceId:null,adjustmentMonth:null,movementType:'standard',legalInstrument:null,observation:'Control sintético, no municipal',...changes});
const rows = () => [row(1),row(2,{amountCents:'0'}),row(3,{amountCents:'-250',forced:true,adjustmentMonth:'2026-08-01'}),row(4,{conceptSourceId:'95',amountCents:'10001',legajo:'1001'})];

test('full draft separates absent, explicit zero and negative amounts without valuing units',()=>{
  const r=noveltyBatchControl(rows());assert.equal(r.rows,4);assert.equal(r.missing,1);assert.equal(r.manual,3);assert.equal(r.zero,1);assert.equal(r.negative,1);
  assert.equal(r.knownAmountCents,'9751');assert.equal(r.completeAmountCents,null);assert.equal(r.forced,1);assert.equal(r.adjustments,1);assert.equal(r.quantitiesSummed,false);
});
test('concept summaries preserve overlapping employee membership and reconcile row counts',()=>{
  const r=noveltyBatchControl(rows());assert.equal(r.distinctLegajos,3);assert.equal(r.concepts.reduce((n,c)=>n+c.distinctLegajos,0),4);
  assert.equal(r.concepts.reduce((n,c)=>n+c.rows,0),r.rows);assert.equal(r.concepts[0].knownAmountCents,'-250');assert.equal(r.concepts[0].completeAmountCents,null);assert.equal(r.concepts[1].completeAmountCents,'10001');
});
test('all amounts supplied is not treated as a payroll calculation or approval',()=>{
  const r=noveltyBatchControl([row(1,{amountCents:'0'})]);assert.equal(r.completeAmountCents,'0');
  assert.equal(r.scope,'complete_validated_draft');assert.equal(r.saved,false);assert.equal(r.payrollCalculated,false);assert.equal(r.payrollPosted,false);
});
test('all absent amounts keep partial coverage even when known sum is zero',()=>{
  const r=noveltyBatchControl([row(1),row(2)]);assert.equal(r.knownAmountCents,'0');assert.equal(r.completeAmountCents,null);assert.equal(r.manual,0);
});
test('integer cents remain exact beyond floating-point integer precision',()=>{
  const r=noveltyBatchControl([row(1,{amountCents:'900719925474099301'}),row(2,{amountCents:'-900719925474099300'})]);assert.equal(r.knownAmountCents,'1');assert.equal(r.completeAmountCents,'1');
});
test('concept IDs are sorted numerically without converting them to Number',()=>{
  const r=noveltyBatchControl([row(1,{conceptSourceId:'90071992547409931'}),row(2,{conceptSourceId:'2'}),row(3,{conceptSourceId:'90071992547409930'})]);
  assert.deepEqual(r.concepts.map(c=>c.conceptSourceId),['2','90071992547409930','90071992547409931']);
});
test('500 rows are counted in full, with no hidden truncation',()=>{
  const source=Array.from({length:500},(_,i)=>row(i+1,{amountCents:'123'}));assert.equal(noveltyBatchControl(source).knownAmountCents,'61500');assert.throws(()=>noveltyBatchControl([...source,row(501)]));
});
test('invalid or ambiguous structural values cannot produce a trusted control',()=>{
  for(const patch of [{amountCents:0},{amountCents:'-0'},{amountCents:''},{amountCents:'1.5'},{amountCents:'01'},{amountCents:'1e3'},
    {amountCents:'9'.repeat(19)},{legajo:1},{conceptSourceId:'__proto__'},{conceptSourceId:'01'},{forced:1},{forced:true},{rowOrdinal:0},
    {adjustmentMonth:'2026-02-30'},{adjustmentMonth:'2007-01-01'},{adjustmentMonth:undefined}])assert.throws(()=>noveltyBatchControl([row(1,patch)]));
  assert.throws(()=>noveltyBatchControl([]));assert.throws(()=>noveltyBatchControl(null));assert.throws(()=>noveltyBatchControl([row(1),row(1)]));
});
test('summary and all filters leave the complete draft and original ordinals untouched',()=>{
  const source=rows().map(Object.freeze),before=JSON.stringify(source);Object.freeze(source);
  const r=noveltyBatchControl(source);for(const kind of ['all','missing','manual','forced','zero','negative','adjustment'])noveltyReviewPage(source,{kind,concept:'44'});
  assert.equal(JSON.stringify(source),before);assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.concepts[0]));
});
test('an exact concept filter does not also match codes containing the same digits',()=>{
  const source=[row(1),row(2,{conceptSourceId:'144'})];assert.deepEqual(noveltyReviewPage(source,{concept:'44'}).rows.map(r=>r.rowOrdinal),[1]);
  assert.equal(noveltyReviewPage(source,{concept:'0'}).filtered,0);assert.equal(noveltyReviewPage(source,{concept:'0'}).total,2);
});
test('new attention filters preserve the total scope and combine with concept and text search',()=>{
  for(const [kind,n]of [['zero',2],['negative',3],['adjustment',3]]){const r=noveltyReviewPage(rows(),{kind,concept:'44'});assert.equal(r.rows[0].rowOrdinal,n);assert.equal(r.total,4);}
  assert.equal(noveltyReviewPage(rows(),{concept:'95',kind:'negative'}).filtered,0);assert.equal(noveltyReviewPage(rows(),{concept:'95',search:'1001'}).filtered,1);
  for(const concept of [44,null,'01','44;95','__proto__'])assert.throws(()=>noveltyReviewPage(rows(),{concept}));
});
test('CSV is explicitly a complete local draft summary, not a payment or saved batch',()=>{
  const csv=noveltyControlCsv(rows());assert.ok(csv.startsWith('\ufeff'));assert.equal(csv.split('\r\n').length,5);
  assert.match(csv,/"LOTE";"Todos";"4";"3"/);assert.match(csv,/"CONCEPTO";"44"/);assert.match(csv,/Parcial: faltan importes/);assert.match(csv,/No es liquidación, aprobación ni pago/);
  assert.doesNotMatch(csv,/1001|1002|Control sintético, no municipal/);
});
test('CSV preserves large exact decimal strings and text-safes a negative value',()=>{
  const csv=noveltyControlCsv([row(1,{amountCents:'900719925474099301',conceptSourceId:'90071992547409931'}),row(2,{conceptSourceId:'44',amountCents:'-250'})]);
  assert.ok(csv.includes("\"'90071992547409931\""));assert.ok(csv.includes("\"'9007199254740993.01\""));assert.ok(csv.includes("\"'-2.50\""));
});
test('control output is deterministic for the same validated draft',()=>{assert.equal(noveltyControlCsv(rows()),noveltyControlCsv(rows()));});
test('no new networking, persistence or HTML execution path is introduced in local review',()=>{
  for(const file of ['assets/payroll-novelty-review.js','assets/payroll-novelty-review-panel.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/\bfetch\s*\(|localStorage|sessionStorage|indexedDB|innerHTML|insertAdjacentHTML|console\./);
});
