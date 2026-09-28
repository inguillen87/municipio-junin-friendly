import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {collectPayrollDocuments,revalidateDocumentCollection,verifiedDocumentCollection,COLLECTION_LIMITS,collectionErrorMessage} from '../assets/payroll-document-collection.js';
import {createPayrollDocumentSetPdf} from '../assets/payroll-document-set-pdf.js';
import {collectionFixture} from './fixtures/payroll-collection-synthetic.js';
import {stableBatchValue} from '../assets/payroll-document-batch-model.js';
const execute=async(f,{preview,...options}={})=>collectPayrollDocuments({preview:preview??await f.preview(),request:f.request,signal:new AbortController().signal,...options});
test('assembles every page in order, rereads all details and emits one complete indexed PDF',async()=>{
 const f=collectionFixture(55);f.state.delay=1;const c=await execute(f);
 assert.equal(c.models.length,55);assert.equal(c.people[0].number,'0001');assert.equal(c.people.at(-1).number,'0055');assert.equal(c.concepts,605);
 assert.equal(c.models.at(-1).rows.length,11);assert.equal(c.models.at(-1).legajo,'0055');assert.equal(c.signatureApplied,false);assert.equal(c.paymentDate,null);
 assert.ok(Object.isFrozen(c));assert.ok(Object.isFrozen(c.models[0].rows));assert.ok(f.maximum<=3);assert.equal(f.perPerson.size,55);assert.ok([...f.perPerson.values()].every(n=>n===2));
 assert.deepEqual(f.calls.filter(q=>q.resource==='payrolldocumentbatch').map(q=>q.page),['1','2','1','2']);
 const pdf=createPayrollDocumentSetPdf(c);assert.equal(pdf.documents,55);assert.ok(pdf.pages>55);assert.match(new TextDecoder().decode(pdf.bytes).slice(0,8),/%PDF-1.4/);
 assert.equal(await revalidateDocumentCollection(c,{request:f.request,signal:new AbortController().signal}),true);assert.equal(verifiedDocumentCollection(c),c);
});
test('collects from the complete pinned selection even when preview was another page',async()=>{
 const f=collectionFixture(55),preview=await f.preview({page:'2'}),c=await execute(f,{preview});assert.equal(c.people.length,55);assert.equal(c.people[0].number,'0001');
});
test('inclusive number and sector ranges, not the visible page, define the package',async()=>{
 const f=collectionFixture(55),preview=await f.preview({fromNumber:'0020',toNumber:'50',fromSector:'02',toSector:'02'}),c=await execute(f,{preview});
 assert.equal(c.models.length,21);assert.equal(c.models.at(-1).legajo,'0040');assert.equal(c.models[0].legajo,'0020');
});
test('empty or unresolved populations cause no detail request',async()=>{
 for(const [f,q,code]of [[collectionFixture(62),{},'COLLECTION_IDENTITY_REVIEW'],[collectionFixture(5),{fromNumber:'800'},'COLLECTION_EMPTY']]){
  await assert.rejects(execute(f,{preview:await f.preview(q)}),{code});assert.equal(f.calls.length,0);
 }
});
for(const [field,value]of [['datasetId','99999999-9999-4999-8999-999999999999'],['payrollDate','2026-08-30'],['sourcePeriod',2025],['sourceMonth',7],['payrollType','V'],['sourceHash','f'.repeat(64)],['closureStatus','unknown'],['statementId','bad']])test('rejects detail with wrong '+field,async()=>{
 const f=collectionFixture(2);f.state.modifyDetail=d=>{d[field]=value;};await assert.rejects(execute(f));
});
for(const field of ['name','contractId','number'])test('full-population hash rejects tampered '+field+' without trusting a repeated hash',async()=>{
 const f=collectionFixture(2);f.state.modifyPage=p=>{p.rows[0][field]=field==='name'?'Changed QA':field==='number'?'0010':'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';};
 await assert.rejects(execute(f));assert.equal(f.perPerson.size,0);
});
test('duplicated identifiers on different pages are not discarded silently',async()=>{
 const f=collectionFixture(55);f.state.modifyPage=(p,q)=>{if(q.page==='2')p.rows[0]={...p.rows[0],number:'0001'};};await assert.rejects(execute(f),{code:'COLLECTION_IDENTITY_REVIEW'});
});
test('requested page identity cannot be replaced by another page',async()=>{
 const f=collectionFixture(55);f.state.modifyPage=(p,q)=>{if(q.page==='2')p.pagination.page=1;};await assert.rejects(execute(f));
});
test('missing detail does not yield a partial collection',async()=>{
 const f=collectionFixture(3);f.state.modifyDetail=(d,n)=>{if(n===2)d.available=false;};await assert.rejects(execute(f),{code:'COLLECTION_DETAIL_MISSING'});
});
test('duplicated statements across different agents are rejected',async()=>{
 const f=collectionFixture(3);f.state.modifyDetail=d=>{d.statementId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';};await assert.rejects(execute(f),{code:'COLLECTION_DETAIL_CHANGED'});
});
for(const field of ['amount','description'])test('reread detects changed '+field+' even with unchanged declared hashes',async()=>{
 const f=collectionFixture(2);f.state.modifyDetail=(d,n,count)=>{if(n===1&&count===2)d.lines[0][field]=field==='amount'?'999.00':'Changed synthetic description';};
 await assert.rejects(execute(f),{code:'COLLECTION_DETAIL_CHANGED'});
});
test('directory change during preparation invalidates the whole collection',async()=>{
 const f=collectionFixture(2);f.state.modifyDetail=(d,n,count)=>{if(n===2&&count===2)f.fixture.records[0].assignments[0].name='Changed QA';};await assert.rejects(execute(f));
});
test('last pre-download check rejects a changed directory',async()=>{
 const f=collectionFixture(2),c=await execute(f);f.fixture.records[0].assignments[0].name='Changed final QA';await assert.rejects(revalidateDocumentCollection(c,{request:f.request,signal:new AbortController().signal}));
});
test('revoked permissions never produce or revalidate a collection',async()=>{
 const f=collectionFixture(2),p=await f.preview();f.state.denied=true;await assert.rejects(execute(f,{preview:p}),{status:403});f.state.denied=false;const c=await execute(f);f.state.denied=true;await assert.rejects(revalidateDocumentCollection(c,{request:f.request,signal:new AbortController().signal}),{status:403});
});
test('cancelled start makes no request',async()=>{
 const f=collectionFixture(2),p=await f.preview(),a=new AbortController();a.abort();await assert.rejects(execute(f,{preview:p,signal:a.signal}),{name:'AbortError'});assert.equal(f.calls.length,0);
});
test('cancel interrupts an uncooperative pending reader without late success',async()=>{
 const f=collectionFixture(2),p=await f.preview(),a=new AbortController();let finish;f.state.wait=()=>new Promise(r=>finish=r);
 const pending=execute(f,{preview:p,signal:a.signal});await new Promise(r=>setTimeout(r,5));a.abort();await assert.rejects(pending,{name:'AbortError'});finish?.();
});
test('cancel during details stops the remaining work',async()=>{
 const f=collectionFixture(20),a=new AbortController();f.state.delay=2;await assert.rejects(execute(f,{signal:a.signal,progress:p=>{if(p.phase==='details'&&p.done===1)a.abort();}}),{name:'AbortError'});assert.ok(f.perPerson.size<=3);
});
test('unverified objects cannot be rendered or downloaded',async()=>{
 const f=collectionFixture(2),c=await execute(f);assert.throws(()=>verifiedDocumentCollection({...c}),{code:'COLLECTION_NOT_VERIFIED'});assert.throws(()=>createPayrollDocumentSetPdf(structuredClone(c)),{code:'COLLECTION_NOT_VERIFIED'});
});
test('unsupported text is not replaced by question marks in the batch PDF',async()=>{
 const f=collectionFixture(2);f.fixture.records[0].assignments[0].name='Persona QA 漢字';const c=await execute(f);assert.throws(()=>createPayrollDocumentSetPdf(c),{code:'COLLECTION_TEXT_UNSUPPORTED'});
});
test('operator messages never expose raw server content',()=>{
 assert.doesNotMatch(collectionErrorMessage(Error('postgres://user:secret PRIVATE_QA')),/postgres|secret|PRIVATE_QA/);assert.match(collectionErrorMessage({status:403}),/sesión/);assert.match(collectionErrorMessage({name:'AbortError'}),/parciales/);
 assert.equal(COLLECTION_LIMITS.concurrency,3);assert.equal(COLLECTION_LIMITS.people,2000);
});

import {createPayrollDocumentSetPdfAsync} from '../assets/payroll-document-set-pdf.js';
test('async construction matches sync output, with progress between documents',async()=>{
 const c=await execute(collectionFixture(3)),stages=[],controller=new AbortController();
 const result=await createPayrollDocumentSetPdfAsync(c,{signal:controller.signal,progress:p=>stages.push(p)});
 assert.deepEqual(result.bytes,createPayrollDocumentSetPdf(c).bytes);assert.equal(stages.length,3);assert.equal(stages.at(-1).done,3);
});
test('already cancelled PDF construction returns no artifact',async()=>{
 const c=await execute(collectionFixture(2)),controller=new AbortController();controller.abort();
 await assert.rejects(createPayrollDocumentSetPdfAsync(c,{signal:controller.signal}),{name:'AbortError'});
});
test('cancellation between rendered documents rejects the entire PDF',async()=>{
 const c=await execute(collectionFixture(8)),controller=new AbortController(),stages=[];
 await assert.rejects(createPayrollDocumentSetPdfAsync(c,{signal:controller.signal,progress:p=>{stages.push(p);controller.abort();}}),{name:'AbortError'});assert.equal(stages.length,1);
});
test('collection deadline also interrupts an unresponsive reader',async()=>{
 const f=collectionFixture(2),preview=await f.preview();f.state.wait=()=>new Promise(()=>{});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Elapsed','TimeoutError')),10);
 try{await assert.rejects(execute(f,{preview,signal:controller.signal}),{name:'TimeoutError'});}finally{clearTimeout(timer);}
});
test('forged collection remains forbidden in the async renderer',async()=>{
 const c=await execute(collectionFixture(1));await assert.rejects(createPayrollDocumentSetPdfAsync({...c},{signal:new AbortController().signal}),{code:'COLLECTION_NOT_VERIFIED'});
});
