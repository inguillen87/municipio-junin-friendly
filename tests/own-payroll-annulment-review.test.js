import test from 'node:test';
import assert from 'node:assert/strict';
import {ownAnnulReviewIndex,verifiedOwnAnnulReviewIndex,loadOwnAnnulReview,ownAnnulReviewRows,ownAnnulReviewSelection,ownAnnulReviewAttempt,ownAnnulReviewCommand,ownAnnulReviewReceipt,verifiedOwnAnnulReviewReceipt,loadOwnAnnulPreparation,loadOwnAnnulOutcome} from '../assets/own-payroll-annulment-review-model.js';
import {verifiedOwnAnnulReceipt} from '../assets/own-payroll-annulment-model.js';
import {annulReviewScenario,annulReviewIndexFor,sealAnnulReviewIndex,annulReviewReceipt} from './fixtures/own-payroll-annulment-review-synthetic.js';
import {annulReceipt,afterAnnul} from './fixtures/own-payroll-annulment-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
const all={kind:'all',values:[]};
const read=details=>async id=>structuredClone(details.find(detail=>detail.id===id));
const rejected=promise=>assert.rejects(promise);

test('three partial active runs are verified sequentially while the exhaustive historical index remains compact',async()=>{
 const s=annulReviewScenario(),calls=[];let active=0,maximum=0;
 const review=await loadOwnAnnulReview(s.index,async id=>{calls.push(id);active++;maximum=Math.max(maximum,active);await Promise.resolve();active--;return structuredClone(s.details.find(run=>run.id===id));});
 assert.equal(maximum,1);assert.deepEqual(calls,s.index.index.filter(row=>row.states.confirmed>0).map(row=>row.id));assert.equal(calls.length,3);assert.equal(review.index.length,4);assert.equal(review.reviewSha256,s.index.reviewSha256);
 const rows=ownAnnulReviewRows(review),selection=ownAnnulReviewSelection(review,all);assert.equal(rows.length,9);assert.equal(selection.count,9);assert.equal(selection.runCount,3);assert.equal(selection.allowed,true);
 assert.deepEqual(rows.map(row=>row.contractId),[...new Set(rows.map(row=>row.contractId))].sort());
 for(const row of rows){assert.equal(Object.hasOwn(row,'inputs'),false);assert.equal(Object.hasOwn(row,'capture'),false);assert.deepEqual(Object.keys(row.totals).sort(),['deduction','gross','net']);}
 assert.equal(JSON.stringify(review).includes('capture'),false);assert.equal(JSON.stringify(review).includes('inputs'),false);assert.equal(Object.hasOwn(review,'runs'),false);
 const attempt=ownAnnulReviewAttempt(s.receipt.key,s.receipt.body,'synthetic-access',selection);await verifiedOwnAnnulReviewReceipt(s.receipt,attempt);assert.equal(attempt.expected.length,9);
 assert.throws(()=>ownAnnulReviewAttempt(s.receipt.key,{...s.receipt.body,selection:{kind:'contracts',values:[rows[0].contractId]}},'synthetic-access',selection));
 assert.throws(()=>ownAnnulReviewAttempt(s.receipt.key,{...s.receipt.body,stateVersion:'f'.repeat(64)},'synthetic-access',selection));
 assert.throws(()=>ownAnnulReviewRows(structuredClone(review)));assert.throws(()=>ownAnnulReviewAttempt(s.receipt.key,s.receipt.body,'synthetic-access',structuredClone(selection)));
});

test('a missing or duplicated active detail cannot finalize any partial review',async()=>{
 for(const mode of ['missing','duplicate']){const s=annulReviewScenario();let calls=0;await rejected(loadOwnAnnulReview(s.index,async id=>{calls++;return mode==='missing'&&calls===3?undefined:structuredClone(s.details.find(run=>run.id===(mode==='duplicate'&&calls===3?s.details[0].id:id)));}));assert.equal(calls,3);}
});

test('all855 confirmed contracts across three partial runs survive review and one complete attempt',async()=>{
 const s=annulReviewScenario({count:855}),calls=[];const review=await loadOwnAnnulReview(s.index,async id=>{calls.push(id);return structuredClone(s.details.find(run=>run.id===id));}),selected=ownAnnulReviewSelection(review,all);
 assert.equal(calls.length,3);assert.equal(review.index.length,4);assert.deepEqual(review.index.filter(row=>row.states.confirmed).map(row=>row.states.confirmed),[285,285,285]);assert.equal(selected.count,855);assert.equal(selected.runCount,3);
 const attempt=ownAnnulReviewAttempt(s.receipt.key,s.receipt.body,'synthetic-access',selected);await verifiedOwnAnnulReviewReceipt(s.receipt,attempt);assert.equal(attempt.expected.length,855);assert.equal(new Set(attempt.expected.map(row=>row.contractId)).size,855);assert.equal(attempt.expected.at(-1).contractId,ownAnnulReviewRows(review).at(-1).contractId);
});

test('active input, payload, algorithm, state and count references are bound to each actual downloaded full detail',async()=>{
 for(const field of ['inputSha256','payloadSha256','algorithmSha256','stateVersion','employeeCount','conceptRowCount','totalsPrecision']){const s=annulReviewScenario(),row=s.index.index[0];if(typeof row[field]==='number'){row[field]++;if(field==='employeeCount')row.states.calculated++;}else row[field]='e'.repeat(64);sealAnnulReviewIndex(s.index);await rejected(loadOwnAnnulReview(s.index,read(s.details)));}
});

test('an omitted confirmed ID cannot be hidden behind balanced metadata counts',async()=>{
 const s=annulReviewScenario(),row=s.index.index[0];row.confirmedContractIds.pop();row.states.confirmed--;row.states.calculated++;sealAnnulReviewIndex(s.index);ownAnnulReviewIndex(s.index);await rejected(loadOwnAnnulReview(s.index,read(s.details)));
});

test('duplicate confirmed identities across otherwise different runs reject the entire period index',()=>{
 const s=annulReviewScenario(),a=s.index.index[0],b=s.index.index[1];b.confirmedContractIds[0]=a.confirmedContractIds[0];b.confirmedContractIds.sort();sealAnnulReviewIndex(s.index);assert.throws(()=>ownAnnulReviewIndex(s.index));
});

test('an altered capture amount fails existing full-detail hash verification before review becomes available',async()=>{
 const s=annulReviewScenario();s.details[2].capture.saved.result.employeeTotals[0].net='0.00';await rejected(loadOwnAnnulReview(s.index,read(s.details)));
});

test('a state-hash change is rejected and closed groups block the full selected scope without dropping a person',async()=>{
 const s=annulReviewScenario(),changed=structuredClone(s.index);changed.stateVersion='f'.repeat(64);await rejected(verifiedOwnAnnulReviewIndex(changed));
 const run=s.index.index[0],id=run.confirmedContractIds[0],group=uid(900);s.index.closed=[{runId:run.id,contractId:id,groupId:group}];s.index.closeHistory=[{id:group,bodySha256:ownRunHash('synthetic close body'),snapshotSha256:ownRunHash('synthetic close snapshot')}];sealAnnulReviewIndex(s.index);
 const review=await loadOwnAnnulReview(s.index,read(s.details));assert.equal(ownAnnulReviewSelection(review,all).count,9);assert.equal(ownAnnulReviewSelection(review,all).allowed,false);assert.equal(ownAnnulReviewSelection(review,{kind:'contracts',values:[s.index.index[1].confirmedContractIds[0]]}).allowed,true);
});

test('no-current-confirmation index still retains every historical reference and loads no full capture',async()=>{
 const s=annulReviewScenario(),calls=[];const review=await loadOwnAnnulReview(s.after.index,async id=>{calls.push(id);throw Error('No active capture may be requested');});assert.equal(calls.length,0);assert.equal(review.index.length,4);assert.equal(ownAnnulReviewRows(review).length,0);assert.throws(()=>ownAnnulReviewSelection(review,all));
});

test('preparation rereads every affected run and preserves all original contracts after one annulment receipt',async()=>{
 const s=annulReviewScenario(),calls=[];const prepared=await loadOwnAnnulPreparation(s.after.index,s.receipt,'2026-10-31',async id=>{calls.push(id);return structuredClone(s.after.details.find(run=>run.id===id));});
 assert.deepEqual(calls,[...new Set(s.receipt.affected.map(row=>row.runId))].sort());assert.equal(calls.length,3);assert.equal(prepared.affected.length,9);assert.deepEqual(prepared.selection.values,s.receipt.affected.map(row=>row.contractId).sort());assert.equal(Object.hasOwn(prepared,'capture'),false);
});

test('a later confirmation in an unrelated indexed run blocks preparation before any details are downloaded',async()=>{
 const s=annulReviewScenario(),history=s.after.index.index.at(-1),id=s.receipt.affected[0].contractId;history.confirmedContractIds=[id];history.states.confirmed=1;history.states.calculated--;sealAnnulReviewIndex(s.after.index);let calls=0;await rejected(loadOwnAnnulPreparation(s.after.index,s.receipt,'2026-10-31',async()=>{calls++;throw Error('must reject using the exhaustive index');}));assert.equal(calls,0);
});

test('missing last affected run, altered annulment state and truncated receipt cannot silently narrow recalculation',async()=>{
 for(const mode of ['missing','state','receipt']){const s=annulReviewScenario();if(mode==='state'){const row=s.after.details[2].employees.find(row=>row.state==='annulled');row.version++;}if(mode==='receipt')s.receipt.affected.pop();await rejected(loadOwnAnnulPreparation(s.after.index,s.receipt,'2026-10-31',async id=>mode==='missing'&&id===s.after.details[2].id?undefined:structuredClone(s.after.details.find(run=>run.id===id))));}
});

test('date grouping validates all affected runs before selecting either original date group',async()=>{
 const s=annulReviewScenario({includeHistory:false}),legacy=s.legacy,run=legacy.runs[2];delete run.capture.body.version;delete run.capture.body.liquidationDate;run.capture.version='own-payroll-run.v1';run.capture.bodySha256=ownRunHash(run.capture.body);
 // Reuse the existing receipt/annulment fixture protocol, without changing inputs or amounts.
 const receipt=annulReceipt(legacy),after=afterAnnul(legacy,receipt),index=annulReviewIndexFor(after.runs);
 for(const [date,count]of [['2026-10-31',6],[null,3]]){const calls=[];const prepared=await loadOwnAnnulPreparation(index,receipt,date,async id=>{calls.push(id);return structuredClone(after.runs.find(run=>run.id===id));});assert.equal(calls.length,3);assert.equal(prepared.affected.length,count);assert.equal(prepared.liquidationDate,date);}
});

// The period-state201 fingerprint never covered these administrative fields.
// The new whole-index digest must reject this before even requesting a detail.
test('hiding one complete active run behind balanced zero-confirmed metadata fails the whole-index digest',async()=>{
 const s=annulReviewScenario(),beforeState=s.index.stateVersion,beforeReview=s.index.reviewSha256,row=s.index.index[0];row.states.calculated+=row.states.confirmed;row.states.confirmed=0;row.confirmedContractIds=[];
 ownAnnulReviewIndex(s.index);assert.equal(s.index.stateVersion,beforeState);assert.equal(s.index.reviewSha256,beforeReview);let calls=0;
 await assert.rejects(verifiedOwnAnnulReviewIndex(s.index),{code:'OWN_ANNUL_REVIEW_REVIEW_CHANGED'});
 await assert.rejects(loadOwnAnnulReview(s.index,async()=>{calls++;throw Error('digest must reject before requesting capture');}),{code:'OWN_ANNUL_REVIEW_REVIEW_CHANGED'});assert.equal(calls,0);
});

test('self-consistently resealed false index changes the command digest; client cannot claim it proves server truth',async()=>{
 const s=annulReviewScenario(),real=structuredClone(s.index),row=s.index.index[0];row.states.calculated+=row.states.confirmed;row.states.confirmed=0;row.confirmedContractIds=[];sealAnnulReviewIndex(s.index);
 assert.equal(s.index.stateVersion,real.stateVersion);assert.notEqual(s.index.reviewSha256,real.reviewSha256);
 // A digest is not a signature. Only writer-v2 comparing its recomputed whole
 // current index before writes can reject a coherent false administrative view.
 const review=await loadOwnAnnulReview(s.index,read(s.details)),selected=ownAnnulReviewSelection(review,all);assert.equal(selected.count,6);
 assert.throws(()=>ownAnnulReviewAttempt(s.receipt.key,s.receipt.body,'synthetic-access',selected));
 const attempted=ownAnnulReviewAttempt(s.receipt.key,{...s.receipt.body,reviewSha256:s.index.reviewSha256},'synthetic-access',selected);
 assert.notEqual(attempted.body.reviewSha256,real.reviewSha256);assert.equal(attempted.expected.length,6);assert.notEqual(attempted.expected.length,s.receipt.affected.length);
});

test('every v2 attempt binds marked review headers, whole-index digest and exact selection',async()=>{
 const s=annulReviewScenario(),review=await loadOwnAnnulReview(s.index,read(s.details)),selected=ownAnnulReviewSelection(review,all);
 for(const patch of [{period:'2026-11'},{liquidationType:'sac'},{scopeVersion:'d'.repeat(64)},{stateVersion:'d'.repeat(64)},{reviewSha256:'d'.repeat(64)},{selection:{kind:'contracts',values:[selected.rows[0].contractId]}}])assert.throws(()=>ownAnnulReviewAttempt(s.receipt.key,{...s.receipt.body,...patch},'synthetic-access',selected));
 assert.throws(()=>ownAnnulReviewCommand(s.legacyReceipt.body));assert.throws(()=>ownAnnulReviewAttempt(s.receipt.key,s.receipt.body,'',selected));
 const attempt=ownAnnulReviewAttempt(s.receipt.key,s.receipt.body,'synthetic-access',selected);assert.equal(attempt.body.version,'own-annul-command.v2');assert.equal(attempt.body.reviewSha256,review.reviewSha256);
});

test('explicit v2 receipts bind the real v2 body digest, all children and all expected affected records',async()=>{
 const s=annulReviewScenario(),review=await loadOwnAnnulReview(s.index,read(s.details)),selected=ownAnnulReviewSelection(review,all),attempt=ownAnnulReviewAttempt(s.receipt.key,s.receipt.body,'synthetic-access',selected);
 ownAnnulReviewReceipt(s.receipt,attempt);await verifiedOwnAnnulReviewReceipt(s.receipt,attempt);
 await assert.rejects(verifiedOwnAnnulReceipt(s.receipt));await assert.rejects(verifiedOwnAnnulReviewReceipt(s.legacyReceipt,attempt));assert.throws(()=>ownAnnulReviewReceipt(s.legacyReceipt));
 for(const mutate of [r=>{r.body.reviewSha256='d'.repeat(64);},r=>{r.receipts[0].body.reason+=' changed';},r=>{r.affected.pop();},r=>{r.receipts.pop();},r=>{r.affected[0].version++;},r=>{r.receipts[1].id=r.receipts[0].id;},r=>{r.receipts[1].key=r.receipts[0].key;}]){const changed=structuredClone(s.receipt);mutate(changed);await assert.rejects(verifiedOwnAnnulReviewReceipt(changed,attempt));}
 const altered=structuredClone(s.receipt);altered.body.reviewSha256='d'.repeat(64);await assert.rejects(verifiedOwnAnnulReviewReceipt(altered));
 const replay=structuredClone(s.receipt);replay.replayed=true;await verifiedOwnAnnulReviewReceipt(replay,attempt);
});

test('legacy v1 receipts remain recoverable and preparable only within the same scope',async()=>{
 const s=annulReviewScenario();await verifiedOwnAnnulReviewReceipt(s.legacyReceipt);await verifiedOwnAnnulReceipt(s.legacyReceipt);
 const prepared=await loadOwnAnnulPreparation(s.after.index,s.legacyReceipt,'2026-10-31',read(s.after.details));assert.equal(prepared.affected.length,9);
 for(const receipt of [s.receipt,s.legacyReceipt]){const index=structuredClone(s.after.index);index.scopeVersion='f'.repeat(64);sealAnnulReviewIndex(index);let calls=0;await assert.rejects(loadOwnAnnulPreparation(index,receipt,'2026-10-31',async()=>{calls++;throw Error('scope must reject before loading');}),{code:'OWN_ANNUL_REVIEW_STATE_CHANGED'});assert.equal(calls,0);}
});

test('outcome after a lost acknowledgement is rebuilt from the verified receipt and authenticated reads: every affected contract, historical amounts, same key, no local selection',async()=>{
 const s=annulReviewScenario(),calls=[];
 const before=ownAnnulReviewSelection(await loadOwnAnnulReview(s.index,read(s.details)),all);
 const outcome=await loadOwnAnnulOutcome(s.after.index,s.receipt,async id=>{calls.push(id);return structuredClone(s.after.details.find(run=>run.id===id));});
 assert.deepEqual(calls,[...new Set(s.receipt.affected.map(row=>row.runId))].sort());assert.equal(calls.length,3);
 assert.equal(outcome.annulled,true);assert.equal(outcome.count,9);assert.equal(outcome.runCount,3);assert.equal(outcome.key,s.receipt.key);assert.equal(outcome.receiptId,s.receipt.id);assert.equal(outcome.confirmedAgainCount,0);
 assert.deepEqual(outcome.totals,before.totals);
 for(const row of outcome.rows){const prior=before.rows.find(r=>r.contractId===row.contractId);assert.ok(prior);assert.deepEqual(row.totals,prior.totals);assert.equal(row.employeeNumber,prior.employeeNumber);assert.equal(row.decisionVersion,prior.version+1);assert.equal(row.liquidationVersion,prior.liquidationVersion);assert.equal(row.confirmedAgainIn,null);assert.equal(Object.hasOwn(row,'inputs'),false);}
 assert.deepEqual(outcome.rows.map(row=>row.contractId),[...outcome.rows.map(row=>row.contractId)].sort());assert.ok(Object.isFrozen(outcome)&&Object.isFrozen(outcome.rows[0]));
});

test('a partial contracts annulment rebuilds only its own run and contracts, never widening to the whole period',async()=>{
 const s=annulReviewScenario(),runId=s.receipt.affected[0].runId,subset=s.receipt.affected.filter(row=>row.runId===runId),ids=subset.map(row=>row.contractId).sort();
 const partial={...s.receipt,body:{...s.receipt.body,selection:{kind:'contracts',values:ids}},affected:subset,receipts:s.receipt.receipts.filter(child=>child.runId===runId)};
 partial.bodySha256=ownRunHash(partial.body);
 const calls=[],outcome=await loadOwnAnnulOutcome(s.after.index,partial,async id=>{calls.push(id);return structuredClone(s.after.details.find(run=>run.id===id));});
 assert.deepEqual(calls,[runId]);assert.equal(outcome.count,subset.length);assert.equal(outcome.runCount,1);assert.deepEqual(outcome.rows.map(row=>row.contractId),ids);
});

test('outcome verifies the original v2 body hash before loading any detail; changing all related reasons without reseal is rejected',async()=>{
 const s=annulReviewScenario(),changed=structuredClone(s.receipt);changed.body.reason='Motivo adulterado exclusivamente sintético QA';
 for(const child of changed.receipts)child.body.reason=changed.body.reason;
 let calls=0;await assert.rejects(loadOwnAnnulOutcome(s.after.index,changed,async id=>{calls++;return structuredClone(s.after.details.find(run=>run.id===id));}),{code:'OWN_ANNUL_REVIEW_RECEIPT_CHANGED'});assert.equal(calls,0);
});

test('a later confirmation in another run is reported on the outcome without hiding the historical annulment, while preparation still refuses it',async()=>{
 const s=annulReviewScenario(),history=s.after.index.index.at(-1),id=s.receipt.affected[0].contractId;
 history.confirmedContractIds=[id];history.states.confirmed=1;history.states.calculated--;sealAnnulReviewIndex(s.after.index);
 const outcome=await loadOwnAnnulOutcome(s.after.index,s.receipt,read(s.after.details));
 assert.equal(outcome.count,9);assert.equal(outcome.confirmedAgainCount,1);assert.equal(outcome.rows.find(row=>row.contractId===id).confirmedAgainIn,history.id);assert.ok(outcome.rows.filter(row=>row.contractId!==id).every(row=>row.confirmedAgainIn===null));
 await rejected(loadOwnAnnulPreparation(s.after.index,s.receipt,'2026-10-31',read(s.after.details)));
});

test('outcome rejects a changed annulment state, a missing affected run, a truncated receipt and another period instead of showing a partial result',async()=>{
 for(const mode of ['state','missing','receipt','period']){
  const s=annulReviewScenario();
  if(mode==='state'){const row=s.after.details[2].employees.find(row=>row.state==='annulled');row.version++;}
  if(mode==='receipt')s.receipt.affected.pop();
  if(mode==='period'){s.after.index.period='2026-11';sealAnnulReviewIndex(s.after.index);}
  await rejected(loadOwnAnnulOutcome(s.after.index,s.receipt,async id=>mode==='missing'&&id===s.after.details[2].id?undefined:structuredClone(s.after.details.find(run=>run.id===id))));
 }
});
