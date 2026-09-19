import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {unzipSync,strFromU8} from 'fflate';
import {bankReportData,bankReportFilter} from '../assets/payroll-bank-generator-model.js';
import {bankReportReconciliation,bankControlNotes,assertBankReportUnchanged,bankControlSelection} from '../assets/payroll-bank-reconciliation.js';
import {bankControlPackage,bankControlExceptionsCsv,BANK_PACKAGE_MAX_BYTES} from '../assets/payroll-bank-control-package.js';
import {bankReportXlsx,bankReportPdf} from '../assets/payroll-bank-generator-export.js';
import {storedZip} from '../assets/clock-dashboard-zip.js';
import {bankGeneratorFixture,bankFixtureId,bankFixtureCbu} from './fixtures/payroll-bank-generator-synthetic.js';
const when='2026-09-19T14:00:00.000Z',sha=b=>createHash('sha256').update(b).digest('hex');
const data=(n=75,mutate)=>bankReportData(bankGeneratorFixture(n,mutate),{resource:'report',datasetId:bankFixtureId});
test('both groupings reconcile the same complete source instead of adding them together',()=>{
 const review=bankReportReconciliation(data());assert.equal(review.rows,75);assert.equal(review.knownTotal,'75000.75');assert.equal(review.total,'75000.75');
 for(const groups of [review.banks,review.jurisdictions]){assert.equal(groups.reduce((n,g)=>n+g.rows,0),75);assert.equal(groups.reduce((n,g)=>n+BigInt(g.knownTotal.replace('.','')),0n),7500075n);}
 assert.equal(review.scope,'complete_authorized_report');assert.equal(review.paymentApproved,false);
});
test('a filtered single person retains source-wide shared-CBU observations',()=>{
 const report=data(3),view=bankReportFilter(report,{search:'00001'}),review=bankReportReconciliation(report);
 assert.equal(view.rows.length,1);assert.equal(review.sharedCbuGroups,1);assert.equal(review.sharedCbuRows,3);assert.match(bankControlNotes(review,view.rows[0]),/más de un legajo/);
 const text=bankControlExceptionsCsv(view,review);assert.ok(text.includes('00001'));assert.ok(!text.includes('00002'));assert.ok(!text.includes(bankFixtureCbu));
});
test('missing, zero and negative amounts are kept distinct with exact integer cents',()=>{
 const report=data(4,r=>{r.rows[0].netAmount=null;r.rows[1].netAmount='0.00';r.rows[2].netAmount='-1.01';r.rows[3].netAmount='9999999999999999999999.99';}),review=bankReportReconciliation(report);
 assert.equal(review.total,null);assert.equal(review.knownTotal,'9999999999999999999998.98');assert.equal(review.missingAmounts,1);assert.equal(review.zeroNetRows,1);assert.equal(review.negativeNetRows,1);
 assert.deepEqual([...review.rowChecks['00001']],['SHARED_CBU']);assert.ok(review.rowChecks['00002'].includes('ZERO_NET'));assert.ok(review.rowChecks['00003'].includes('NEGATIVE_NET'));
});
test('zero records are not confused with a missing response',()=>{const empty=structuredClone(data(1));empty.rows=[];empty.dataset.statementCount=0;assert.equal(bankReportReconciliation(empty).rows,0);assert.equal(bankReportReconciliation(empty).total,'0.00');assert.throws(()=>bankReportReconciliation(null));});
test('unidentified bank and jurisdiction stay visible as their own groups',()=>{const p=bankGeneratorFixture(2);p.data.rows[0].bankKey=null;p.data.rows[0].jurisdiction=null;const report=bankReportData(p),review=bankReportReconciliation(report);assert.equal(review.banks.find(g=>g.key===null).rows,1);assert.equal(review.jurisdictions.find(g=>g.key===null).rows,1);});
test('revalidation rejects mutated rows even when upstream hashes have not changed',()=>{const report=data(2);assert.equal(assertBankReportUnchanged(report,structuredClone(report)).rows.length,2);for(const [key,value]of [['netAmount','1.00'],['cbu','1'.repeat(22)],['name','Otra persona'],['issues',['OTHER']]]){const fresh=structuredClone(report);fresh.rows[0][key]=value;assert.throws(()=>assertBankReportUnchanged(report,fresh),e=>e.code==='SOURCE_CHANGED');}});
test('foreign rows, altered totals and empty exports fail instead of emitting a partial package',async()=>{
 const report=data(2),selected=bankReportFilter(report);assert.throws(()=>bankControlSelection(report,{...selected,total:'0.00'}));assert.throws(()=>bankControlSelection(report,bankReportFilter(data(2))));
 await assert.rejects(bankControlPackage(report,bankReportFilter(report,{search:'no-matches'}),when),/no contiene filas/);await assert.rejects(bankControlPackage(report,selected,'yesterday'));
});
test('binary ZIP entries are byte-for-byte exact and text archives remain compatible',()=>{
 const bytes=Uint8Array.from([0,255,128,13,10,80,75]),files=unzipSync(storedZip([['binary.bin',bytes],['readme.txt','Prueba']]));assert.deepEqual(files['binary.bin'],bytes);assert.equal(strFromU8(files['readme.txt']),'Prueba');
 assert.equal(sha(storedZip([['a.txt','control'],['b.xml','<a>test</a>']])),'497e077a3c03c948eb77b13d574349ee0fd41d1d75b57a564d4c4dce2db40a60');assert.throws(()=>storedZip([['bad',{}]]));
});
test('package binds exact Excel/PDF, explicit scopes and every artifact hash',async()=>{
 const report=data(75),view=bankReportFilter(report,{bank:'credicoop'}),result=await bankControlPackage(report,view,when),files=unzipSync(result.bytes);
 assert.deepEqual(Object.keys(files).sort(),['LEEME.txt','conciliacion.csv','control.pdf','manifiesto.json','observaciones.csv','planilla.xlsx'].sort());assert.equal(sha(result.bytes),result.sha256);assert.ok(result.bytes.length<BANK_PACKAGE_MAX_BYTES);
 const manifest=JSON.parse(strFromU8(files['manifiesto.json']));assert.equal(manifest.selection.rows,25);assert.equal(manifest.fullReportSummary.rows,75);assert.equal(manifest.selection.total,'25000.25');assert.equal(manifest.controlScope.bankTransferGenerated,false);assert.equal(manifest.controlScope.approved,false);assert.equal(manifest.controlScope.encrypted,false);
 for(const artifact of manifest.artifacts){assert.equal(artifact.sha256,sha(files[artifact.name]));assert.equal(artifact.bytes,files[artifact.name].length);}
 assert.deepEqual(files['planilla.xlsx'],bankReportXlsx(report,view,when));assert.deepEqual(files['control.pdf'],bankReportPdf(report,view,when));assert.match(strFromU8(files['LEEME.txt']),/No contiene TXT de acreditación/);
 assert.ok(!strFromU8(files['manifiesto.json']).includes(bankFixtureCbu));assert.ok(!strFromU8(files['manifiesto.json']).includes('Persona sintética'));
});
test('same source, filters and query instant produce an identical package',async()=>{const report=data(3),view=bankReportFilter(report),a=await bankControlPackage(report,view,when),b=await bankControlPackage(report,view,when);assert.equal(a.sha256,b.sha256);assert.deepEqual(a.bytes,b.bytes);});
test('cancelled package operations return no artifact, including cancellation during hashes',async()=>{const report=data(2),view=bankReportFilter(report),controller=new AbortController();controller.abort();await assert.rejects(bankControlPackage(report,view,when,{signal:controller.signal}),{name:'AbortError'});const mid=new AbortController(),pending=bankControlPackage(report,view,when,{signal:mid.signal});mid.abort();await assert.rejects(pending,{name:'AbortError'});});
test('unsupported PDF characters block the package rather than silently dropping the PDF',async()=>{const report=data(1,r=>r.rows[0].name='Persona 漢'),view=bankReportFilter(report);await assert.rejects(bankControlPackage(report,view,when),/caracteres/);assert.ok(bankReportXlsx(report,view,when).byteLength>0);});
test('both control formats retain cross-legajo review notes after filtering',()=>{
 const report=data(3),view=bankReportFilter(report,{search:'00001'}),xlsx=unzipSync(bankReportXlsx(report,view,when));
 assert.match(strFromU8(xlsx['xl/worksheets/sheet1.xml']),/CBU informado en más de un legajo/);
 const pdf=new TextDecoder().decode(bankReportPdf(report,view,when)),text=[...pdf.matchAll(/<([0-9a-f]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(' ');assert.match(text,/CBU informado en más de un legajo/);
});
test('raw search text is not duplicated in the manifest and spreadsheet cells cannot execute formulas',async()=>{
 const p=bankGeneratorFixture(1);p.data.rows[0].legajo='=1+1';p.data.rows[0].name='Nombre de búsqueda';const report=bankReportData(p),view=bankReportFilter(report,{search:'Nombre de búsqueda'}),result=await bankControlPackage(report,view,when),files=unzipSync(result.bytes);
 assert.equal(result.manifest.selection.filters.searchApplied,true);assert.equal(result.manifest.selection.filters.searchSha256,sha('Nombre de búsqueda'));assert.ok(!strFromU8(files['manifiesto.json']).includes('Nombre de búsqueda'));assert.ok(strFromU8(files['observaciones.csv']).includes('"\'=1+1"'));
});
test('async package generation snapshots mutable caller data before yielding',async()=>{
 const report=structuredClone(data(1)),view=bankReportFilter(report),pending=bankControlPackage(report,view,when);report.rows[0].name='Changed during hashing';const result=await pending,files=unzipSync(unzipSync(result.bytes)['planilla.xlsx']);assert.ok(!strFromU8(files['xl/worksheets/sheet1.xml']).includes('Changed during hashing'));
});
test('new assets ship through the existing report module without privileged endpoints',()=>{
 const build=fs.readFileSync('scripts/build-friendly.mjs','utf8'),ui=fs.readFileSync('assets/payroll-bank-generator.js','utf8');
 for(const name of ['payroll-bank-reconciliation.js','payroll-bank-review-panel.js','payroll-bank-control-package.js'])assert.ok(build.includes(name));
 assert.ok(ui.includes('assertBankReportUnchanged(original,fresh)'));assert.ok(ui.includes('signal:job.signal'));assert.doesNotMatch(ui,/localStorage|sessionStorage|method:\s*['"]POST['"]/);
});
