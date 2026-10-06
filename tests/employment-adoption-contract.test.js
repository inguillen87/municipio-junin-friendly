import test from 'node:test';import assert from 'node:assert/strict';
import {ADOPTION_MAX_ROWS,EMPLOYMENT_ORIGINS,adoptionProposalInput,adoptionReviewInput,adoptionReceipt} from '../assets/employment-adoption-contract.js';
import {adoptionProposal,adoptionReview,adoptionWireReceipt,adoptionContractId} from './fixtures/employment-adoption-synthetic.js';

test('ownership origins match the existing historical and native schema, without a fabricated MUNI origin',()=>{
  assert.deepEqual(EMPLOYMENT_ORIGINS,{historical:'GRH',own:'MUNICONTROL'});assert.ok(Object.isFrozen(EMPLOYMENT_ORIGINS));
});
test('a complete 2452-contract selection keeps every ID, version and declared jurisdiction',()=>{
  const input=adoptionProposal(),before=structuredClone(input),result=adoptionProposalInput(input);
  assert.deepEqual(result,input);assert.deepEqual(input,before);assert.equal(result.rows.length,2452);
  assert.ok(Object.isFrozen(result.rows)&&Object.isFrozen(result.rows[2451]));assert.notEqual(result.rows[0],input.rows[0]);
});
test('all ten thousand contracts are kept; an additional row rejects the whole selection',()=>{
  assert.equal(adoptionProposalInput(adoptionProposal(ADOPTION_MAX_ROWS)).rows.length,ADOPTION_MAX_ROWS);
  assert.throws(()=>adoptionProposalInput(adoptionProposal(ADOPTION_MAX_ROWS+1)),{code:'LIMIT'});
  assert.throws(()=>adoptionProposalInput(adoptionProposal(0)),{code:'LIMIT'});
});
test('duplicate contract IDs are rejected across the full selection, including different UUID case',()=>{
  const input=adoptionProposal();input.rows[2451].contractId=input.rows[9].contractId.toUpperCase();
  assert.throws(()=>adoptionProposalInput(input),{code:'DUPLICATE'});
});
for(const field of ['personId','dni','cuil','fullName','sourceSystem','tenantId','sourceBatchId','amount','startDate'])test('a caller cannot insert '+field+' into an ownership row',()=>{
  const input=adoptionProposal(1);input.rows[0][field]='caller-value';assert.throws(()=>adoptionProposalInput(input),{code:'INPUT_INVALID'});
});
for(const field of ['sourceContextVersion','selectionVersion','catalogVersion'])test('source or catalog freshness requires an exact '+field,()=>{
  for(const value of [null,'','latest','a'.repeat(63),1]){const input=adoptionProposal(1);input[field]=value;assert.throws(()=>adoptionProposalInput(input),{code:'INPUT_INVALID'});}
});
test('jurisdiction is declared rather than inferred from municipality, source or array position',()=>{
  for(const value of [null,'','101','GRH',42]){const input=adoptionProposal(1);input.rows[0].jurisdictionCode=value;assert.throws(()=>adoptionProposalInput(input),{code:'INPUT_INVALID'});}
});
test('missing and additional fields, unsafe strings and accessors cannot become a valid proposal',()=>{
  for(const mutate of [v=>{delete v.rows[0].contractVersion;},v=>{v.selectedPage=1;},v=>{v.reason='sin razón';},v=>{v.legalReference='a\nact';},v=>{v.reason='<script>alert(1)</script>';},v=>{Object.defineProperty(v.rows[0],'contractId',{get(){throw Error('must not read accessor');},enumerable:true});}]){
    const input=adoptionProposal(1);mutate(input);assert.throws(()=>adoptionProposalInput(input),{code:'INPUT_INVALID'});
  }
});
test('the declared text boundaries count Unicode characters without increasing the minimum to hide a fixture error',()=>{
  assert.equal(adoptionProposalInput({...adoptionProposal(1),reason:'sin motivo'}).reason,'sin motivo');
  assert.throws(()=>adoptionProposalInput({...adoptionProposal(1),reason:'sin razón'}),{code:'INPUT_INVALID'});
});
test('hidden or symbol fields cannot enter a proposal or a review',()=>{
  for(const create of [()=>adoptionProposal(1),()=>adoptionReview('approve')]){
    for(const key of ['hiddenExtra',Symbol('extra')]){
      const input=create();Object.defineProperty(input,key,{value:true,enumerable:false});
      assert.throws(()=>('rows'in input?adoptionProposalInput:adoptionReviewInput)(input),{code:'INPUT_INVALID'});
    }
  }
});
test('text normalization does not change contract IDs or source/catalog versions',()=>{
  const input=adoptionProposal(1);input.reason='  Adopcio\u0301n sintética con antecedentes completos  ';const result=adoptionProposalInput(input);
  assert.equal(result.reason,'Adopción sintética con antecedentes completos');assert.deepEqual(result.rows,input.rows);assert.equal(result.sourceContextVersion,input.sourceContextVersion);
});
for(const decision of ['approve','reject'])test('review '+decision+' identifies one complete proposal with its unchanged source/catalog context',()=>{
  const input=adoptionReview(decision),result=adoptionReviewInput(input);assert.deepEqual(result,input);assert.ok(Object.isFrozen(result));
});
test('review cannot replace rows, identities, scope or context by declaration',()=>{
  for(const field of ['rows','personId','tenantId','sourceSystem','payrollCalculated']){const input=adoptionReview('approve');input[field]=true;assert.throws(()=>adoptionReviewInput(input),{code:'INPUT_INVALID'});}
  for(const decision of ['adopt','force',null])assert.throws(()=>adoptionReviewInput({...adoptionReview('approve'),decision}),{code:'INPUT_INVALID'});
});
for(const status of ['pending','approved','rejected'])test('receipt '+status+' preserves exact group quantity and administrative effects',()=>{
  const input=adoptionWireReceipt(status),receipt=adoptionReceipt(input,{total:2452,sourceContextVersion:'a'.repeat(64),catalogVersion:'c'.repeat(64)});
  assert.deepEqual(receipt,input);assert.ok(Object.isFrozen(receipt.effects));assert.notEqual(receipt.effects,input.effects);
});
test('a partial or stale confirmation is rejected instead of announcing successful adoption',()=>{
  for(const edit of [v=>{v.total=2451;},v=>{v.sourceContextVersion='f'.repeat(64);},v=>{v.catalogVersion='f'.repeat(64);},v=>{v.proposalId=adoptionContractId(90001);}]){
    const receipt=adoptionWireReceipt('approved');edit(receipt);assert.throws(()=>adoptionReceipt(receipt,{total:2452,sourceContextVersion:'a'.repeat(64),catalogVersion:'c'.repeat(64),proposalId:adoptionContractId(90000)}),{code:'CONTRACT_INVALID'});
  }
});
for(const [field,value]of [['identitiesCreated',1],['contractsCreated',1],['contractsAdopted',2451],['sourceHistoryRetained',false],['payrollCalculated',true],['payrollPosted',true],['paymentsExecuted',true]])test('a receipt cannot claim the forbidden or incomplete effect '+field,()=>{
  const receipt=adoptionWireReceipt('approved');receipt.effects[field]=value;assert.throws(()=>adoptionReceipt(receipt),{code:'CONTRACT_INVALID'});
});
test('pending and rejected receipts never authorize ownership changes, while replay retains exact contents',()=>{
  for(const status of ['pending','rejected']){const receipt=adoptionWireReceipt(status);receipt.effects.contractsAdopted=1;assert.throws(()=>adoptionReceipt(receipt),{code:'CONTRACT_INVALID'});}
  const receipt=adoptionWireReceipt('approved');receipt.replayed=true;assert.deepEqual(adoptionReceipt(receipt),receipt);
});
test('inconsistent status, missing decision time, unrecognized fields and invalid expected correlation fail closed',()=>{
  for(const edit of [v=>{v.operation='propose';},v=>{v.decidedAt=null;},v=>{v.partial=true;},v=>{v.effects.accountCreated=false;},v=>{v.replayed='true';}]){
    const receipt=adoptionWireReceipt('approved');edit(receipt);assert.throws(()=>adoptionReceipt(receipt),{code:'CONTRACT_INVALID'});
  }
  assert.throws(()=>adoptionReceipt(adoptionWireReceipt(),{tenantId:adoptionContractId(1)}),{code:'CONTRACT_INVALID'});
});
test('an approval acknowledgement must match the proposal version and the requested decision',()=>{
  const receipt=adoptionWireReceipt('approved');
  assert.deepEqual(adoptionReceipt(receipt,{proposalVersion:'e'.repeat(64),status:'approved'}),receipt);
  for(const expected of [{proposalVersion:'f'.repeat(64)},{status:'rejected'}])assert.throws(()=>adoptionReceipt(receipt,expected),{code:'CONTRACT_INVALID'});
});
test('invalid expected receipt shape is rejected without reading a caller accessor',()=>{
  for(const value of [null,[],new Date(),{get total(){throw Error('must not read accessor');}}])assert.throws(()=>adoptionReceipt(adoptionWireReceipt(),value),{code:'CONTRACT_INVALID'});
  const symbol=Symbol('extra');assert.throws(()=>adoptionReceipt(adoptionWireReceipt(),{[symbol]:true}),{code:'CONTRACT_INVALID'});
});
test('decision time cannot silently roll a nonexistent calendar date or hour forward',()=>{
  for(const decidedAt of ['2026-02-30T12:00:00Z','2026-10-06T24:00:00Z','2026-10-06T12:60:00Z','2026-10-06T12:00:60Z'])assert.throws(()=>adoptionReceipt({...adoptionWireReceipt('approved'),decidedAt}),{code:'CONTRACT_INVALID'});
  for(const decidedAt of ['2024-02-29T12:00:00.123456-03:00','2026-10-06T12:00:00Z'])assert.equal(adoptionReceipt({...adoptionWireReceipt('approved'),decidedAt}).decidedAt,decidedAt);
});
