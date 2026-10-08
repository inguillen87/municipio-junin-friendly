import test from 'node:test';
import assert from 'node:assert/strict';
import {adoptionProposalInput} from '../assets/employment-adoption-contract.js';
import {sealAdoptionReview} from '../assets/employment-adoption-review-model.js';
import {adoptionPreparationPayload,adoptionPreparationBootstrap,adoptionPreparationReceipt} from '../assets/employment-adoption-preparation-model.js';
import {reviewRaw,reviewRow} from './fixtures/employment-adoption-review-synthetic.js';
import {catalogVersion,attemptKey,preparationEnvelope} from './fixtures/employment-adoption-preparation-synthetic.js';
import {adoptionHistoryProof} from '../lib/internal-employment-adoption-history.js';
import {proof as historyProof} from './fixtures/employment-adoption-history-synthetic.js';

test('inactive pending history requires the exact new proof and preserves old proofs',()=>{
 const old=historyProof(),expected={tenantId:old.scope.tenantId,membershipId:old.scope.membershipId,contractId:old.contract.id};
 assert.deepEqual(adoptionHistoryProof(old,expected),old);
 const value=historyProof();value.version='employment-adoption-history.v2';value.contract.jurisdictionCode=null;value.history.jurisdictionStatus='pending_inactive_origin';
 assert.deepEqual(adoptionHistoryProof(value,expected),value);
 for(const change of [v=>delete v.history.jurisdictionStatus,v=>v.history.jurisdictionStatus='active',v=>v.contract.jurisdictionCode='42',v=>v.version='employment-adoption-history.v1',v=>v.history.extra=true]){const v=structuredClone(value);change(v);assert.throws(()=>adoptionHistoryProof(v,expected));}
 const legacyNull=historyProof();legacyNull.contract.jurisdictionCode=null;assert.throws(()=>adoptionHistoryProof(legacyNull,expected));
});

const policy={allowInactivePending:true};
const inactive={status:'inactive',endDate:'2026-09-30'};
const review=rows=>sealAdoptionReview(reviewRaw(rows.length,{rows}));
const declaration=r=>({snapshot:r.snapshot,rows:r.rows.map(row=>({contractId:row.contractId,jurisdictionCode:row.jurisdictionCode??(row.status==='inactive'?null:'42')}))});
const payload=(r,d=declaration(r),options=policy)=>adoptionPreparationPayload(r,catalogVersion,d,'Antecedente sintético QA','Conservar los históricos pendientes sin inventar jurisdicción',options);

test('v2 preserves the complete 57-contract review and null jurisdictions beyond all pages',async()=>{
 const r=await review(Array.from({length:57},(_,n)=>reviewRow(n+1,n===0?{jurisdictionCode:'42'}:n===1?{...inactive,jurisdictionCode:'55'}:{...inactive,startDate:n===56?null:'2010-01-01'})));
 const before=JSON.stringify(r),d=declaration(r),declarations=JSON.stringify(d),body=await payload(r,d);
 assert.equal(body.version,'employment-adoption-input.v2');assert.equal(body.rows.length,57);
 assert.equal(body.rows[0].jurisdictionCode,'42');assert.equal(body.rows[1].jurisdictionCode,'55');
 assert.equal(body.rows.filter(x=>x.jurisdictionCode===null).length,55);
 assert.equal(body.rows[56].contractId,r.rows[56].contractId);assert.equal(JSON.stringify(r),before);assert.equal(JSON.stringify(d),declarations);
});
test('general v2 declaration applies to active contracts and conserves an inactive missing jurisdiction',async()=>{
 const r=await review([reviewRow(1),reviewRow(2,inactive)]),body=await payload(r,'42');
 assert.deepEqual(body.rows.map(row=>row.jurisdictionCode),['42',null]);
});
test('an expressly documented jurisdiction on an inactive row remains available',async()=>{
 const r=await review([reviewRow(1,inactive)]),d=declaration(r);d.rows[0].jurisdictionCode='55';
 assert.equal((await payload(r,d)).rows[0].jurisdictionCode,'55');
});
test('v1 keeps requiring the original explicit jurisdiction for every row',async()=>{
 const r=await review([reviewRow(1,inactive)]);
 await assert.rejects(payload(r,declaration(r),{}));
 const body=await payload(r,'42',{});assert.equal(body.version,undefined);assert.equal(body.rows[0].jurisdictionCode,'42');
});
for(const [name,patch] of Object.entries({active:{},missingEnd:{status:'inactive',endDate:null},futureEnd:{status:'inactive',endDate:'2027-01-01'},endToday:{status:'inactive',endDate:'2026-10-06'},inverted:{...inactive,startDate:'2026-10-01'},stateError:{...inactive,status:'state_error'}})){
 test('v2 refuses null jurisdiction for '+name,async()=>{
  const r=await review([reviewRow(1,patch)]),d=declaration(r);d.rows[0].jurisdictionCode=null;
  await assert.rejects(payload(r,d));
 });
}
test('a previously declared inactive jurisdiction cannot be cleared or substituted',async()=>{
 const r=await review([reviewRow(1,{...inactive,jurisdictionCode:'42'})]);
 for(const value of [null,'55']){const d=declaration(r);d.rows[0].jurisdictionCode=value;await assert.rejects(payload(r,d));}
});
test('v2 declaration rejects filtered rows, reordered contracts, duplicate rows and stale snapshot',async()=>{
 const r=await review([reviewRow(1,inactive),reviewRow(2,inactive)]);
 for(const mutate of [d=>d.rows.pop(),d=>d.rows.reverse(),d=>d.rows[1]=d.rows[0],d=>d.snapshot='f'.repeat(64)]){const d=declaration(r);mutate(d);await assert.rejects(payload(r,d));}
});
test('wire v2 requires its exact marker and explicit null rather than absence, blank or invented codes',async()=>{
 const r=await review([reviewRow(1,inactive)]),body=await payload(r);
 assert.deepEqual(adoptionProposalInput(body),body);
 for(const value of [undefined,'','042','0']){const changed=structuredClone(body);changed.rows[0].jurisdictionCode=value;assert.throws(()=>adoptionProposalInput(changed));}
 const unmarked=structuredClone(body);delete unmarked.version;assert.throws(()=>adoptionProposalInput(unmarked));
 const unknown=structuredClone(body);unknown.version='employment-adoption-input.v3';assert.throws(()=>adoptionProposalInput(unknown));
});
test('only the explicit bootstrap v2 advertises support and old attempts remain readable',async()=>{
 const r=await review([reviewRow(1,inactive)]),oldBody=await payload(r,'42',{}),attempt=await preparationEnvelope(oldBody);
 const bootstrap={version:'employment-adoption-preparation.v2',review:r,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[attempt]};
 assert.equal((await adoptionPreparationBootstrap(bootstrap)).version,bootstrap.version);
 assert.equal((await adoptionPreparationBootstrap({...bootstrap,version:'employment-adoption-preparation.v1'})).version,'employment-adoption-preparation.v1');
 await assert.rejects(adoptionPreparationBootstrap({...bootstrap,version:'employment-adoption-preparation.v3'}));
});
test('v2 receipt verifies the same immutable body/key; a changed null cannot reuse its receipt',async()=>{
 const r=await review([reviewRow(1,inactive)]),body=await payload(r),before=JSON.stringify(body),envelope=await preparationEnvelope(body);
 assert.equal((await adoptionPreparationReceipt(envelope,{key:attemptKey,body})).bodySha256,envelope.bodySha256);
 const changed=structuredClone(body);changed.rows[0].jurisdictionCode='42';await assert.rejects(adoptionPreparationReceipt(envelope,{key:attemptKey,body:changed}));
 assert.equal(JSON.stringify(body),before);
});
test('preparation policy rejects unknown options and non-boolean authorization',async()=>{
 const r=await review([reviewRow(1,inactive)]);
 for(const options of [{allowInactivePending:'true'},{allowInactivePending:true,force:true},null])await assert.rejects(payload(r,declaration(r),options));
});
