import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeBatchQuery,verifyBatchPreview,withinBatchRange} from '../assets/payroll-document-batch-model.js';
import {internalPayrollDocumentBatch} from '../lib/internal-payroll-document-batch.js';
import {batchFixture,batchPreview,batchBinding,BATCH_DATASET,BATCH_SNAPSHOT} from './fixtures/payroll-document-selection-synthetic.js';
import {capabilitiesForInternalDataResource} from '../lib/internal-resource-access.js';
for(const [name,change]of Object.entries({unknown:q=>q.unexpected='x',invalidDataset:q=>q.datasetId='abc',array:q=>q.fromNumber=['1'],space:q=>q.fromNumber=' 1',decimal:q=>q.fromNumber='1.5',negative:q=>q.fromNumber='-1',overflow:q=>q.fromNumber='1'.repeat(13),inverted:q=>{q.fromNumber='10';q.toNumber='2';},sectorInverted:q=>{q.fromSector='11';q.toSector='02';},injection:q=>q.fromNumber="1' OR true",pageZero:q=>q.page='0',hugePage:q=>q.page='81',badLimit:q=>q.limit='2000',badHash:q=>q.selectionHash='wrong'})){
 test('invalid batch '+name+' is rejected before data reads',async()=>{const f=batchFixture(),q={datasetId:BATCH_DATASET};change(q);const r=await internalPayrollDocumentBatch(f.sql,{query:q},batchBinding,BATCH_SNAPSHOT,{readRoster:f.readRoster});assert.equal(r.status,400);assert.equal(f.calls.length,0);assert.equal(f.rosterReads,0);});
}
test('full population is filtered before pagination and the end authorization is checked',async()=>{
 const f=batchFixture(),r=await batchPreview({},f),d=verifyBatchPreview(r.payload.data);assert.equal(r.status,200);assert.equal(d.counts.dataset,62);assert.equal(d.counts.selected,62);assert.equal(d.counts.eligible,59);assert.equal(d.counts.review,3);assert.equal(d.rows.length,25);assert.equal(d.pagination.pages,3);assert.equal(f.rosterReads,2);assert.equal(d.groups.reduce((n,g)=>n+g.selected,0),62);
 assert.doesNotMatch(JSON.stringify(d),/PRIVATE_DNI|PRIVATE_CUIL|concept993|123\.45|No usar/);
});
test('inclusive number and sector bounds preserve original strings',async()=>{
 const d=(await batchPreview({fromNumber:'0020',toNumber:'50',fromSector:'02',toSector:'02'})).payload.data;
 assert.equal(d.counts.selected,21);assert.equal(d.rows[0].number,'0020');assert.equal(d.rows.at(-1).number,'0040');assert.equal(d.filters.fromNumber,'0020');assert.equal(d.rows.every(r=>r.sectorCode==='02'),true);
});
test('sector 2 precedes 10 numerically, not lexicographically',async()=>{
 const d=(await batchPreview({fromSector:'2',toSector:'10'})).payload.data;assert.equal(d.counts.selected,55);assert.equal(d.counts.unclassifiedSector,3);assert.deepEqual(d.groups.map(g=>g.code),['02','10']);
});
test('page change preserves selection hash, full totals and stable sorting',async()=>{
 const first=(await batchPreview()).payload.data,second=(await batchPreview({page:'2',selectionHash:first.selectionHash})).payload.data;
 assert.equal(second.rows[0].number,'0026');assert.equal(second.rows.length,25);assert.deepEqual(second.counts,first.counts);assert.equal(second.selectionHash,first.selectionHash);
 const third=(await batchPreview({page:'3'})).payload.data;assert.equal(third.rows.length,12);assert.equal(third.rows.find(r=>r.number==='0060').state,'ambiguous');assert.equal(third.rows.find(r=>r.number==='0060').contractId,null);
});
test('a legitimate empty filter differs from an unavailable source',async()=>{
 const r=await batchPreview({fromNumber:'700',toNumber:'800'});assert.equal(r.status,200);const d=verifyBatchPreview(r.payload.data);assert.equal(d.counts.selected,0);assert.deepEqual(d.rows,[]);assert.deepEqual(d.groups,[]);assert.equal(d.pagination.pages,1);
});
test('a changed directory or source invalidates the previous selection',async()=>{
 const first=(await batchPreview()).payload.data,f=batchFixture();f.records[0].assignments[0].name='Updated QA';assert.equal((await batchPreview({selectionHash:first.selectionHash},f)).status,409);
 assert.equal((await batchPreview({page:'4'})).status,409);
});
test('access revoked after directory reading returns no nominal result',async()=>{
 const f=batchFixture();f.deniedAfter=2;const r=await batchPreview({},f);assert.equal(r.status,403);assert.equal(r.payload.data,undefined);assert.equal(f.rosterReads,2);
});
test('missing or mismatched source metadata is rejected, not reported as no employees',async()=>{
 for(const change of [f=>f.metadata.total++,f=>f.metadata.payloadHash='e'.repeat(64),f=>f.metadata.date='2026-09-30',f=>f.records.pop(),f=>f.records[0].number='NOT_A_SOURCE_KEY']){const f=batchFixture();change(f);await assert.rejects(batchPreview({},f),e=>e.code.startsWith('PAYROLL_BATCH_'));}
});
test('same names and leading-zero references never merge contracts',async()=>{
 const f=batchFixture(2);f.records[0].number='1';f.roster.rows[0].legajo='1';f.records[1].number='01';f.roster.rows[1].legajo='01';f.records.forEach(r=>r.assignments[0].name='Same synthetic name');
 const d=(await batchPreview({fromNumber:'1',toNumber:'1'},f)).payload.data;assert.equal(d.counts.selected,2);assert.deepEqual(d.rows.map(r=>r.number),['01','1']);assert.notEqual(d.rows[0].contractId,d.rows[1].contractId);
});
test('SQL is explicitly tenant, company, database, source-binding and literal-legajo scoped',async()=>{
 const f=batchFixture();await batchPreview({},f);assert.equal(f.calls.length,2);
 for(const c of f.calls){assert.match(c.text,/b\.tenant_id/);assert.match(c.text,/source_database/);assert.match(c.text,/source_company_id/);assert.match(c.text,/verified IS TRUE/);assert.deepEqual(c.values.slice(0,4),[BATCH_DATASET,batchBinding.tenantId,batchBinding.database,batchBinding.companyId]);assert.doesNotMatch(c.text,/\b(?:UPDATE|DELETE|INSERT|ALTER|GRANT)\b/);}
 assert.match(f.calls[1].text,/c\.legacy_legajo=numbers\.number/);assert.match(f.calls[1].text,/b\.id=\(SELECT source_binding_id/);
 assert.deepEqual(new Set(capabilitiesForInternalDataResource('payrolldocumentbatch')),new Set(['workforce.employee.read','payroll.read']));
});
for(const mutate of [d=>d.signatureApplied=true,d=>d.officialReceipt=true,d=>d.paymentDate='2026-08-31',d=>d.departmentBasis='historical',d=>d.counts.selected++,d=>d.groups[0].selected++,d=>d.rows[0].contractId=null,d=>d.rows[0].bankAccount='PRIVATE_ACCOUNT',d=>d.rows[0].number='9000'])test('inconsistent selection DTO is not rendered',async()=>{
 const d=(await batchPreview({fromNumber:'1',toNumber:'25'})).payload.data;mutate(d);assert.throws(()=>verifyBatchPreview(d));
});
test('input ranges do not coerce unrelated strings or unknown department values to zero',()=>{
 assert.equal(withinBatchRange(null,'1','9'),false);assert.equal(withinBatchRange('A2','1','9'),false);assert.equal(withinBatchRange('002','2','2'),true);assert.equal(withinBatchRange(null,'',''),true);
 assert.equal(normalizeBatchQuery({datasetId:BATCH_DATASET}).limit,25);
});
test('missing dataset remains unavailable instead of becoming an empty population',async()=>{
 const f=batchFixture(),r=await internalPayrollDocumentBatch(f.sql,{query:{datasetId:BATCH_DATASET}},batchBinding,BATCH_SNAPSHOT,{readRoster:async()=>({status:200,payload:{ok:true,data:{found:false}}})});assert.equal(r.status,404);assert.equal(f.calls.length,0);
});
test('duplicate certified metadata rows are rejected before directory selection',async()=>{
 const f=batchFixture(),query=f.sql.query;f.sql.query=async(...args)=>{const rows=await query(...args);return args[0].includes('metadata')?[...rows,...rows]:rows;};await assert.rejects(batchPreview({},f),{code:'PAYROLL_BATCH_SCOPE_INVALID'});
});
test('a source changed during final payroll reauthorization returns no prior rows',async()=>{
 const f=batchFixture();let n=0;const read=async()=>{const result=await f.readRoster();if(++n===2)result.payload.data.reportHash='e'.repeat(64);return result;};
 const r=await internalPayrollDocumentBatch(f.sql,{query:{datasetId:BATCH_DATASET}},batchBinding,BATCH_SNAPSHOT,{readRoster:read});assert.equal(r.status,409);assert.equal(r.payload.data,undefined);
});
test('source cutoff requires an explicit UTC instant, not an ambiguous local timestamp',async()=>{
 const d=(await batchPreview()).payload.data;assert.equal(d.directory.cutoff,'2026-09-10T18:17:30Z');d.directory.cutoff='2026-09-10T15:17:30';assert.throws(()=>verifyBatchPreview(d));
});
import {createInternalDataHandler} from '../api/internal-data.js';
test('route requires managed certified payroll and employee permissions before any SQL',async()=>{
 let accessRequest=null,reads=0;
 const handler=createInternalDataHandler({requireCompatibleInternalAccess:async(_req,res,requirements)=>{accessRequest=requirements;res.status(403).json({ok:false});return null;},getInternalSql:async()=>{reads++;throw Error('Unexpected directory read');},getActionCenterSql:async()=>{reads++;throw Error('Unexpected payroll read');},env:{}});
 const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;},setHeader(){},end(){}};
 await handler({method:'GET',query:{resource:'payrolldocumentbatch',datasetId:BATCH_DATASET}},res);
 assert.equal(res.code,403);assert.equal(reads,0);assert.equal(accessRequest.allowLegacy,false);assert.equal(accessRequest.requireDataPlaneReady,true);assert.equal(accessRequest.requireCertifiedDataBinding,true);assert.deepEqual(new Set(accessRequest.requiredCapabilities),new Set(['payroll.read','workforce.employee.read']));
});
