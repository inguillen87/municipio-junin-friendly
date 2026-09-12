import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptySheetRow, appendSheetGroup, reviewSheetRows, sheetPage, SHEET_FIELDS } from '../assets/payroll-novelty-sheet-model.js';
import { NoveltyReviewError } from '../assets/payroll-novelty-review.js';
// A contract-shaped parser checks forwarding. Full-browser acceptance uses the real workbench parser.
const parse=(r,i,p)=>{
  if(!r[0]||!r[1])throw Error(`Fila ${i}: campos incompletos.`);
  return {rowOrdinal:i,legajo:r[0],conceptSourceId:r[1],costCenterSourceId:r[2]||null,adjustmentMonth:r[3]?r[3]+'-01':null,quantityDecimal:r[4]||null,amountCents:r[5]||null,movementType:r[6]||null,legalInstrument:r[7]||null,observation:r[8]||null,forced:r[9]==='SI'};
};
test('new native row has ten original fields; never inserts amount zero or enables forced mode',()=>{
 const r=emptySheetRow('1001','44','2,5');assert.equal(r.length,SHEET_FIELDS.length);assert.equal(r[5],'');assert.equal(r[9],'NO');assert.equal(r[4],'2,5');
});
test('group appends exact IDs and quantities without mutating prior raw rows',()=>{
 const old=[emptySheetRow('1000','44','1')],copy=JSON.stringify(old);const r=appendSheetGroup(old,{legajos:'1001\r\n1002',concepto:'44',unidades:'1,25'});
 assert.equal(JSON.stringify(old),copy);assert.equal(r.length,3);assert.notEqual(r[0],old[0]);assert.deepEqual(r.slice(1).map(x=>[x[0],x[4],x[5],x[9]]),[['1001','1,25','','NO'],['1002','1,25','','NO']]);
});
for(const input of ['1,339','1.339','1 339','1339;1440','1e3','001339','1001\n\n1002','1001-1010','-1001','<script>x</script>','١٠٠١','100000000000000000000'])test('ambiguous/invalid identifier rejected atomically '+input,()=>{
 assert.throws(()=>appendSheetGroup([],{legajos:input,concepto:'44'}));
});
test('group duplicate within input is never silently deleted',()=>assert.throws(()=>appendSheetGroup([],{legajos:'1001\n1001',concepto:'44'}),/repetido/));
test('group duplicate with existing plain business key blocks all additions',()=>{
 const old=[emptySheetRow('1001','44','1')];assert.throws(()=>appendSheetGroup(old,{legajos:'1002\n1001',concepto:'44'}),/ya tiene/);assert.equal(old.length,1);
});
test('different concept for same legajo is not an automatic duplicate',()=>assert.equal(appendSheetGroup([emptySheetRow('1001','44')],{legajos:'1001',concepto:'95'}).length,2));
test('maximum500 exact, plus one rejected without modifying current array',()=>{
 const list=Array.from({length:500},(_,i)=>String(10001+i)).join('\n');const rows=appendSheetGroup([],{legajos:list,concepto:'44',unidades:'1'});assert.equal(rows.length,500);assert.throws(()=>appendSheetGroup(rows,{legajos:'9999',concepto:'44'}),/500/);assert.equal(rows.length,500);
});
test('large numeric legajo stays a string',()=>assert.equal(appendSheetGroup([],{legajos:'9007199254740993',concepto:'44'})[0][0],'9007199254740993'));
test('empty list, bad concept and too-long body reject',()=>{
 for(const q of [{legajos:'',concepto:'44'},{legajos:'1001',concepto:''},{legajos:'1001',concepto:'4,4'},{legajos:'1'.repeat(12001),concepto:'44'}])assert.throws(()=>appendSheetGroup([],q));
});
test('all native rows pass through same parser; result not an upload or input mutation',()=>{
 const rows=[emptySheetRow('1001','44','1'),emptySheetRow('1002','95','2')],before=JSON.stringify(rows),calls=[];
 const result=reviewSheetRows(rows,(r,i,p)=>{calls.push([i,p]);return parse(r,i,p)},'2026-09-01');assert.equal(result.length,2);assert.equal(result[1].conceptSourceId,'95');assert.equal(JSON.stringify(rows),before);assert.deepEqual(calls,[[1,'2026-09-01'],[2,'2026-09-01']]);
});
test('all errors and duplicate flags; no partially accepted result',()=>{
 const r=[emptySheetRow('','44'),emptySheetRow('1002','44'),emptySheetRow('1002','44'),emptySheetRow('1003','')];
 assert.throws(()=>reviewSheetRows(r,parse,'2026-09-01'),e=>{assert.ok(e instanceof NoveltyReviewError);assert.equal(e.origin,'screen');assert.equal(e.rowCount,4);assert.deepEqual(e.issues.map(i=>i.rowOrdinal),[1,3,4]);assert.ok(e.issues.every(i=>i.line===null));return true});
});
test('duplicate key includes center, month adjustment and movement',()=>{
 const a=emptySheetRow('1001','44');const b=[...a];b[2]='3';const c=[...a];c[3]='2026-08';const d=[...a];d[6]='adjustment';assert.equal(reviewSheetRows([a,b,c,d],parse,'2026-09-01').length,4);
});
test('paging never truncates or edits the batch',()=>{
 const all=Array.from({length:57},(_,i)=>emptySheetRow(String(i+1),'44'));const before=JSON.stringify(all);const v=sheetPage(all,6,10);assert.equal(v.rows.length,7);assert.equal(v.offset,50);assert.equal(v.total,57);assert.equal(sheetPage(all,99,25).page,3);v.rows[0][0]='changed';assert.equal(JSON.stringify(all),before);
});
test('invalid shape/size/page refuses instead of inventing data',()=>{
 assert.throws(()=>reviewSheetRows([],parse,''));assert.throws(()=>reviewSheetRows([['1']],parse,''));assert.throws(()=>sheetPage([],0));assert.throws(()=>sheetPage([],1,7));assert.throws(()=>sheetPage(Array.from({length:501},()=>emptySheetRow())));
});
test('integration uses same governed bulk payload, explicit confirmation and production shell list',()=>{
 const s=fs.readFileSync('assets/payroll-novelty-workbench.js','utf8');assert.match(s,/reviewSheetRows\(sheetEditor.values\(\), rowFromValues, periodMonth\)/);assert.match(s,/\['agile', 'sheet'\]\.includes\(entryMode\) \? 'bulk'/);assert.match(s,/completedEntryMode === 'sheet'\) sheetEditor.clear/);
 const b=fs.readFileSync('scripts/build-friendly.mjs','utf8');for(const n of ['payroll-novelty-sheet.js','payroll-novelty-sheet-model.js','payroll-novelty-sheet.css'])assert.ok(b.includes(n));
 const ui=fs.readFileSync('assets/payroll-novelty-sheet.js','utf8');assert.doesNotMatch(ui,/fetch\(|localStorage|sessionStorage/);assert.match(ui,/window.confirm/);assert.match(ui,/onChange\(\)/);
});
