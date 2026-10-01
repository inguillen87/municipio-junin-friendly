import test from 'node:test';
import assert from 'node:assert/strict';
import {savedNoveltyBatch,sameNoveltyDecision} from '../assets/payroll-native-monthly-model.js';
import {noveltyBatchControl,noveltyReviewPage} from '../assets/payroll-novelty-review.js';
import {batch,row,id} from './fixtures/novelty-saved-review-synthetic.js';

test('saved review preserves and detaches all 500 original rows',()=>{
  const original=batch(500),reviewed=savedNoveltyBatch(original),ordinals=[];
  for(let page=1;page<=20;page++)ordinals.push(...noveltyReviewPage(reviewed.rows,{page}).rows.map(r=>r.rowOrdinal));
  assert.deepEqual(ordinals,Array.from({length:500},(_,i)=>i+1));
  original.rows[0].amountCents='0';assert.equal(reviewed.rows[0].amountCents,'12345');
  assert.ok(Object.isFrozen(reviewed.rows[0].issues));assert.ok(Object.isFrozen(reviewed));
});

for(const change of [b=>b.rows.pop(),b=>b.rows.reverse(),b=>b.rows[1].rowOrdinal=1,b=>b.rows[1].employmentContractId='',
  b=>b.rows[1].amountCents='',b=>b.rows[1].amountCents='1e4',b=>b.rows[1].amountCents='9223372036854775808',
  b=>b.rows[1].amountCents='-9223372036854775809',b=>b.rows[1].quantityDecimal='NaN',
  b=>b.rows[1].issues=null,b=>b.rows[1].issues=[{code:'conflict',blocking:'true',severity:'error'}],
  b=>b.rows[1].issues=[{code:'conflict',blocking:true,severity:'unknown'}]])test('incomplete or malformed saved evidence cannot become a review: '+change,()=>{
  const b=batch();change(b);assert.throws(()=>savedNoveltyBatch(b));
});

test('saved amounts retain int64 precision, explicit zero and unknown coverage',()=>{
  const b=batch(4);b.rows=[row(1,{amountCents:'9223372036854775807'}),row(2,{amountCents:'-9223372036854775808'}),row(3,{amountCents:'0'}),row(4,{amountCents:null,quantityDecimal:'1.25'})];
  const control=noveltyBatchControl(savedNoveltyBatch(b).rows,{saved:true});
  assert.equal(control.knownAmountCents,'-1');assert.equal(control.completeAmountCents,null);
  assert.equal(control.zero,1);assert.equal(control.missing,1);assert.equal(control.quantitiesSummed,false);
  assert.equal(control.scope,'complete_saved_batch');assert.equal(control.saved,true);assert.equal(control.payrollCalculated,false);
  assert.throws(()=>noveltyBatchControl(b.rows),'draft limits remain unchanged');
});

test('issue filters combine with exact concept and search without reducing full scope',()=>{
  const b=batch();b.rows[40].issues=[{code:'duplicate_business_key',blocking:true,severity:'error'}];
  b.rows[55].issues=[{code:'concept_not_observed',blocking:false,severity:'warning'}];
  b.rows[55].conceptSourceId='1614';
  const reviewed=savedNoveltyBatch(b),before=JSON.stringify(reviewed),sum=noveltyBatchControl(reviewed.rows,{saved:true});
  assert.equal(noveltyReviewPage(reviewed.rows,{issueKind:'issues'}).filtered,2);
  assert.equal(noveltyReviewPage(reviewed.rows,{issueKind:'clear'}).filtered,58);
  const view=noveltyReviewPage(reviewed.rows,{issueKind:'blocking',concept:'614',search:'1041'});
  assert.equal(view.total,60);assert.equal(view.rows[0].rowOrdinal,41);
  assert.equal(noveltyReviewPage(reviewed.rows,{issueKind:'issues',concept:'614'}).filtered,1);
  assert.equal(noveltyReviewPage(reviewed.rows,{search:'no match'}).total,60);
  assert.equal(JSON.stringify(reviewed),before);assert.deepEqual(noveltyBatchControl(reviewed.rows,{saved:true}),sum);
  assert.throws(()=>noveltyReviewPage(reviewed.rows,{issueKind:'unknown'}));
});

test('a decision needs identical complete evidence and a current allowed command',()=>{
  const first=savedNoveltyBatch(batch());assert.equal(sameNoveltyDecision(first,batch(),'submit'),true);
  assert.equal(sameNoveltyDecision(first,batch(),'approve'),false);
  const reorder=batch();reorder.allowedCommands.reverse();reorder.rows[0]=Object.fromEntries(Object.entries(reorder.rows[0]).reverse());
  assert.equal(sameNoveltyDecision(first,reorder,'submit'),true,'JSON property order is not a business change');
  for(const change of [b=>b.id=id(50),b=>b.version++,b=>b.status='submitted',b=>b.periodMonth='2026-10-01',
    b=>b.rows[59].amountCents='0',b=>b.rows[59].employmentContractId=id(999),b=>b.rows[59].observation='Cambio sintético',
    b=>b.rows[59].issues.push({code:'conflict',blocking:true,severity:'error'}),b=>b.allowedCommands=['cancel']]){
    const current=batch();change(current);assert.equal(sameNoveltyDecision(first,current,'submit'),false,String(change));
  }
});

test('native saved batches preserve current versus historical identity',()=>{
  const b=batch(1);Object.assign(b,{contractVersion:'payroll-novelty-batch.v2',sourceMode:'individual'});
  Object.assign(b.rows[0],{identityCurrent:true,subject:{contractId:id(101),legajo:'1001',employeeName:'Persona sintética',
    identityToken:'a'.repeat(64),sourceCutoff:null,origin:'MUNICONTROL',registrationId:id(500),registeredAt:'2026-09-30T12:00:00Z'}});
  const reviewed=savedNoveltyBatch(b);b.rows[0].identityCurrent=false;b.allowedCommands=['cancel'];
  assert.equal(sameNoveltyDecision(reviewed,b,'submit'),false);
  assert.equal(savedNoveltyBatch(b).rows[0].subject.origin,'MUNICONTROL');
});
