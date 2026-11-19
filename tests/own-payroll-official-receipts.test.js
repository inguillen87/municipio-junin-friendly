import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ownReceiptRecord,ownReceiptSnapshot,ownReceiptSelf,ownReceiptBatch,verifiedOwnReceiptPreview,verifiedOwnReceiptSnapshot,verifiedOwnReceiptSelf} from '../assets/own-payroll-receipt-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {createOwnReceiptPdf} from '../assets/own-payroll-receipt-pdf.js';
const corpus=JSON.parse(readFileSync(new URL('./fixtures/own-payroll-consumer-corpus.json',import.meta.url),'utf8')).cases;
const hash=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
const uid=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0');
const select=name=>structuredClone(corpus.find(one=>one.name===name));
function snapshot(one){
 const record=structuredClone(one.receiptRecord),v5=record.inputVersion==='own-payroll-input.v5';
 return {version:v5?'own-receipt-snapshot.v5':'own-receipt-snapshot.v4',params:{period:'2026-10',types:['monthly'],filters:{employeeFrom:'',employeeTo:'',agreementFrom:'',agreementTo:'',departmentFrom:'',departmentTo:''},issuer:{name:'SYNTHETIC QA MUNICIPALITY',taxId:'30990000001',address:'SYNTHETIC ADDRESS 123'},paymentDate:null,legend:'Synthetic QA only'},sourceVersion:'a'.repeat(64),sources:[{id:record.sourceGroupId,snapshotSha256:hash(one.close),period:'2026-10',type:'monthly',employeeCount:one.close.employeeCount,populationCount:one.close.populationCount,selectedCount:1}],records:[record],recordCount:1,conceptCount:record.concepts.length,economicConceptCount:record.economicConceptCount,omittedRowCount:record.omittedRowCount,identityBasis:'owned_registration_verified_at_capture',paymentDateBasis:'declared',signatureState:'pending',payrollPosted:false,paymentExecuted:false};
}
function batch(value){return {version:'own-receipt-batch.v1',id:uid(1),preparedAt:'2026-11-11T15:00:00Z',preparedBy:'Synthetic maker',snapshot:value,snapshotSha256:hash(value),state:'prepared',sourceCurrent:true,review:null,permissions:{canApprove:true,canWithdraw:true,canDownload:true}};}
for(const one of corpus)test(one.name+': SQL record and complete receipt snapshot validate without mutation',()=>{
 const original=salarySerialized(one),record=ownReceiptRecord(one.receiptRecord);assert.equal(record,one.receiptRecord);ownReceiptSnapshot(snapshot(one));assert.equal(salarySerialized(one),original);
});
test('official net and line sum both survive receipt; PDF prints official net',async()=>{
 const one=select('zero_quantities_null_facts'),s=snapshot(one);assert.equal(s.records[0].totals.net,'200.01');assert.equal(s.records[0].lineTotals.net,'200.02');assert.equal(s.records[0].totalReconciliation.netDifferenceFromLines,'-0.01');
 const pdf=await createOwnReceiptPdf(batch(s));assert.equal(pdf.recordCount,1);assert.ok(pdf.bytes.length>1000);
 const fragments=[...Buffer.from(pdf.bytes).toString().matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('|');assert.ok(fragments.includes('200,01'));assert.ok(fragments.includes('200,02'));assert.ok(fragments.includes('-0,01'));
});
test('V5 omitted 302/306 stay economic and auditable; eligible zero rows remain printed',()=>{
 const omitted=select('days14_both_omitted').receiptRecord;ownReceiptRecord(omitted);
 assert.equal(omitted.omittedRowCount,2);assert.deepEqual(omitted.omissionAudit.map(o=>o.decision.conceptCode),['302','306']);
 for(const code of ['302','306']){assert.ok(omitted.economicRows.some(row=>row.conceptCode===code));assert.ok(omitted.quantities.some(row=>row.conceptCode===code));assert.ok(!omitted.concepts.some(row=>row.code===code));}
 const kept=select('eligible_zero_tariffs').receiptRecord;ownReceiptRecord(kept);assert.equal(kept.omittedRowCount,0);assert.ok(kept.concepts.some(row=>row.code==='302'&&row.amount==='0.00'));assert.ok(kept.concepts.some(row=>row.code==='306'&&row.amount==='0.00'));
});
const mutations=[
 ['official net replaced by line net',r=>r.totals.net=r.lineTotals.net],
 ['line total replaced by official total',r=>r.lineTotals.net=r.totals.net],
 ['reconciliation removed',r=>r.totalReconciliation=null],
 ['reconciliation forged',r=>r.totalReconciliation.netDifferenceFromLines='0.00'],
 ['economic row removed',r=>r.economicRows.pop()],
 ['quantity removed',r=>r.quantities.pop()],
 ['tariff evidence removed',r=>r.familyTariffDecisions.pop()],
 ['frozen tariff record removed',r=>r.familyTariffRecord=null],
 ['official source policy removed',r=>r.sourceEvidence.officialTotalsPolicy=null],
 ['source hash changed',r=>r.sourceEvidence.resultSha256='f'.repeat(64)],
 ['label from another capture',r=>r.economicConcepts[0].labelSourceSha256='f'.repeat(64)],
 ['printed amount changed',r=>r.concepts[0].amount='999.00'],
 ['printed identity changed',r=>r.contractId=uid(777)],
 ['line field omitted',r=>delete r.lineTotals],
 ['unexpected approval marker',r=>r.approved=true],
];
for(const [name,mutate] of mutations)test('rejects '+name,()=>{const r=select('zero_quantities_null_facts').receiptRecord;mutate(r);assert.throws(()=>ownReceiptRecord(r));});
for(const [name,mutate] of [
 ['omission audit removed',r=>r.omissionAudit.pop()],
 ['omission count changed',r=>r.omittedRowCount--],
 ['emission decision changed',r=>r.rowEmissions[0].decision='emit'],
 ['selector restored by zero amount',r=>r.receiptRowKeys.push(r.contractId+':concept:302')],
 ['hidden economic record lost',r=>r.economicConcepts=r.economicConcepts.filter(c=>c.code!=='302')],
])test('rejects V5 '+name,()=>{const r=select('days14_both_omitted').receiptRecord;mutate(r);assert.throws(()=>ownReceiptRecord(r));});
test('complete snapshot rejects lost counters, downgrade, duplicate identity and forged signature',()=>{
 for(const mutate of [s=>s.economicConceptCount--,s=>s.omittedRowCount--,s=>s.version='own-receipt-snapshot.v4',s=>s.records.push(structuredClone(s.records[0])),s=>s.signatureState='signed',s=>s.paymentExecuted=true]){const s=snapshot(select('days14_both_omitted'));mutate(s);assert.throws(()=>ownReceiptSnapshot(s));}
});
test('receipt original hash is required independently of financial validation',async()=>{
 const s=snapshot(select('days14_both_omitted')),preview={version:'own-receipt-preview.v1',scopeVersion:'a'.repeat(64),snapshot:s,snapshotSha256:hash(s),permissions:{canPrepare:true}};
 await verifiedOwnReceiptPreview(preview);preview.snapshot.params.legend='Changed synthetic legend';await assert.rejects(()=>verifiedOwnReceiptPreview(preview));
});
test('async snapshot and preview verify a private copy before the first await',async()=>{
 const original=snapshot(select('zero_quantities_null_facts')),before=structuredClone(original);
 const pending=verifiedOwnReceiptSnapshot(original);original.records[0].totals.net='999.99';original.records[0].quantities.pop();
 const verified=await pending;assert.deepEqual(verified,before);assert.notEqual(verified,original);
 const value=snapshot(select('zero_quantities_null_facts')),preview={version:'own-receipt-preview.v1',scopeVersion:'a'.repeat(64),snapshot:value,snapshotSha256:hash(value),permissions:{canPrepare:true}},expected=structuredClone(preview);
 const pendingPreview=verifiedOwnReceiptPreview(preview);preview.snapshot.records[0].totals.net='888.88';preview.snapshot.sourceVersion='f'.repeat(64);
 assert.deepEqual(await pendingPreview,expected);
});
test('self service accepts only one linked identity with intact V5 evidence',()=>{
 const s=snapshot(select('days14_both_omitted'));const item={batchId:uid(2),preparedAt:'2026-11-11T15:00:00Z',approvedAt:'2026-11-11T15:01:00Z',params:{period:s.params.period,issuer:s.params.issuer,paymentDate:null,legend:s.params.legend},record:s.records[0],source:{id:s.sources[0].id,snapshotSha256:s.sources[0].snapshotSha256,period:'2026-10',type:'monthly'},signatureState:'pending',paymentDateBasis:'declared',payrollPosted:false,paymentExecuted:false};
 const self={version:'own-receipt-self.v1',items:[item]};assert.equal(ownReceiptSelf(self),self);const other=structuredClone(item);other.batchId=uid(3);other.record.personId=uid(99);self.items.push(other);assert.throws(()=>ownReceiptSelf(self));
});
test('async self service cannot return caller mutations made while hashing tariff metadata',async()=>{
 const s=snapshot(select('zero_quantities_null_facts'));const item={batchId:uid(2),preparedAt:'2026-11-11T15:00:00Z',approvedAt:'2026-11-11T15:01:00Z',params:{period:s.params.period,issuer:s.params.issuer,paymentDate:null,legend:s.params.legend},record:s.records[0],source:{id:s.sources[0].id,snapshotSha256:s.sources[0].snapshotSha256,period:'2026-10',type:'monthly'},signatureState:'pending',paymentDateBasis:'declared',payrollPosted:false,paymentExecuted:false};
 const self={version:'own-receipt-self.v1',items:[item]},expected=structuredClone(self),pending=verifiedOwnReceiptSelf(self);self.items[0].record.totals.net='999.99';self.items[0].record.name='Mutated caller record';
 assert.deepEqual(await pending,expected);
});
test('reopened and withdrawn receipt still cannot be downloaded',async()=>{
 const b=batch(snapshot(select('days14_both_omitted')));b.sourceCurrent=false;b.permissions.canDownload=false;ownReceiptBatch(b);await assert.rejects(()=>createOwnReceiptPdf(b));b.permissions.canDownload=true;assert.throws(()=>ownReceiptBatch(b));
});
