import test from 'node:test';import assert from 'node:assert/strict';
import {monthlyCorrectionPatch,monthlyCorrectionValues,monthlyCorrectionPlan,monthlyCorrectionCommand,monthlyCorrectionDetail,monthlyCorrectionUnchanged,monthlyCorrectionAttempt,monthlyCorrectionReceipt,monthlyCorrectionReviewPlan,monthlyCorrectionVerifiedPlan} from '../assets/payroll-monthly-correction-model.js';
import {approved,id,scope,effects,stamp} from './fixtures/payroll-monthly-annul-synthetic.js';
const candidate=b=>({version:'payroll-monthly-correction.v1',scopeKey:scope,proposalId:null,proposalSha256:null,previewSha256:null,status:'candidate',reason:null,patch:null,canPropose:true,canReview:false,items:[{snapshotSha256:'d'.repeat(64),batch:b,identityCurrent:true}],decision:null,effects:{...effects}});
const why='Corregir el código declarado del lote completo';
const preview=plan=>({version:'payroll-monthly-correction.v1',scopeKey:plan.scopeKey,proposalId:null,proposalSha256:null,previewSha256:'9'.repeat(64),status:'preview',reason:plan.body.reason,patch:plan.body.patch,canPropose:true,canReview:false,items:structuredClone(plan.items),decision:null,effects:{...effects}});
test('26 complete batches and 793 rows compare outside filters preserving source identity and all unselected values',()=>{
 const details=Array.from({length:26},(_,i)=>candidate(approved(i,60,i%2===1))),before=structuredClone(details),plan=monthlyCorrectionPlan(details,scope,{observation:'Corrección de ensayo'},why);
 assert.equal(plan.items.length,26);assert.equal(plan.items.reduce((n,i)=>n+i.batch.rowCount,0),793);assert.deepEqual(details,before);assert(Object.isFrozen(plan.items));
 for(const i of plan.items)for(const r of i.after.rows){const original=i.batch.rows[r.rowOrdinal-1];assert.equal(r.observation,'Corrección de ensayo');for(const k of Object.keys(original).filter(k=>k!=='observation'))assert.deepEqual(r[k],original[k]);}
 assert.equal(plan.items[0].after.rows[0].amountCents,null);assert.equal(plan.items[0].after.rows[1].amountCents,'0');assert.equal(plan.items[0].after.rows[2].amountCents,'9223372036854775807');
});
test('chosen null and zero remain distinct; quantity decimals are never evaluated or rounded',()=>{
 const b=approved(2,1);b.rows[0].costCenterSourceId='42';assert.equal(monthlyCorrectionValues(b,{amountCents:'0'}).after.rows[0].amountCents,'0');assert.equal(monthlyCorrectionValues(b,{quantityDecimal:'999999999999.123456'}).after.rows[0].quantityDecimal,'999999999999.123456');assert.equal(monthlyCorrectionValues(b,{costCenterSourceId:null}).after.rows[0].costCenterSourceId,null);
 b.rows[0].quantityDecimal='100';assert.throws(()=>monthlyCorrectionValues(b,{quantityDecimal:'100.000000'}),/no tiene cambios/);assert.equal(monthlyCorrectionValues(b,{quantityDecimal:'1.230000'}).after.rows[0].quantityDecimal,'1.23');
 for(const patch of [{quantityDecimal:1},{quantityDecimal:'-0.0'},{quantityDecimal:'1e2'},{quantityDecimal:'1.1234567'},{amountCents:100},{amountCents:'9999999999999999999'},{amountCents:'-0'},{payrollType:'invented'},{forced:'true'},{legajo:'9'},{}])assert.throws(()=>monthlyCorrectionPatch(patch));
});
test('duplicate destinations, no-change batch, missing values, native unsupported type and forced missing reason reject the whole selection',()=>{
 const b=approved(2,2);b.rows[1]={...structuredClone(b.rows[0]),rowOrdinal:2,conceptSourceId:'999'};assert.throws(()=>monthlyCorrectionValues(b,{conceptSourceId:b.rows[0].conceptSourceId}),/destino repetido/);
 assert.throws(()=>monthlyCorrectionPlan([candidate(approved(2,1)),candidate(approved(3,1))],scope,{payrollType:'monthly'},why),/no tiene cambios/);
 assert.throws(()=>monthlyCorrectionValues(approved(1,1),{amountCents:null,quantityDecimal:null}),/sin unidades/);
 assert.throws(()=>monthlyCorrectionValues(approved(1,1,true),{payrollType:'sac'}),/propia admite Mensual/);
 assert.throws(()=>monthlyCorrectionValues(approved(1,1),{forced:true}),/forzado/);
 const adjusted=approved(1,1);adjusted.rows[0].adjustmentMonth=adjusted.periodMonth;assert.throws(()=>monthlyCorrectionValues(adjusted,{periodMonth:'2008-01-01'}),/ajuste/);
});
test('the complete selection limit is global without truncating, skipping or splitting any batch',()=>{
 const details=Array.from({length:11},(_,i)=>candidate(approved(i,500)));const before=structuredClone(details);assert.throws(()=>monthlyCorrectionPlan(details,scope,{observation:'Corrección'},why),/5.000/);assert.deepEqual(details,before);
 assert.throws(()=>monthlyCorrectionPlan([candidate(approved(1,1)),candidate(approved(1,1))],scope,{observation:'Corrección'},why),/repetido/);
});
test('same-version last-row drift, revocation and changed membership invalidate the complete comparison',()=>{
 const details=[candidate(approved(2,60)),candidate(approved(3,60))],plan=monthlyCorrectionPlan(details,scope,{observation:'Corrección'},why);
 assert.equal(monthlyCorrectionUnchanged(plan,details),true);details[1].items[0].batch.rows[59].amountCents='0';assert.equal(monthlyCorrectionUnchanged(plan,details),false);
 const fresh=[candidate(approved(2,60)),candidate(approved(3,60))];fresh[1].canPropose=false;assert.equal(monthlyCorrectionUnchanged(plan,fresh),false);
 fresh[1].canPropose=true;fresh[1].scopeKey='e'.repeat(64);assert.equal(monthlyCorrectionUnchanged(plan,fresh),false);
});
test('uncertain submission is frozen with exact key, body, order, patch and reason; receipt cannot substitute another command',()=>{
 const details=[candidate(approved(2,1))],patch={observation:'Corrección'},draft=monthlyCorrectionPlan(details,scope,patch,why),plan=monthlyCorrectionVerifiedPlan(preview(draft),draft),attempt=monthlyCorrectionAttempt(plan,id(9000));patch.observation='Otra';details[0].items[0].batch.rows[0].quantityDecimal='0';
 assert.equal(JSON.parse(attempt.serializedBody).payload.patch.observation,'Corrección');assert.equal(attempt.body.reason,why);assert(Object.isFrozen(attempt));
 const receipt={version:'payroll-monthly-correction.v1',eventId:id(8000),proposalId:id(8000),key:attempt.key,bodySha256:'f'.repeat(64),body:structuredClone(attempt.body),replayed:true,status:'pending',recordedAt:stamp,effects:{...effects}};assert.equal(monthlyCorrectionReceipt(receipt,attempt),receipt);
 const changed=structuredClone(receipt);changed.body.patch.observation='Otra';assert.throws(()=>monthlyCorrectionReceipt(changed,attempt),/original/);
});
test('independent review and immutable history require the same complete before/after comparison',()=>{
 const plan=monthlyCorrectionPlan([candidate(approved(2,1))],scope,{amountCents:'0'},why),detail={version:'payroll-monthly-correction.v1',scopeKey:scope,proposalId:id(8000),proposalSha256:'e'.repeat(64),previewSha256:'9'.repeat(64),status:'pending',reason:why,patch:plan.body.patch,canPropose:false,canReview:true,items:structuredClone(plan.items),decision:null,effects:{...effects}};
 monthlyCorrectionDetail(detail);const review=monthlyCorrectionReviewPlan(detail,'approve','Revisé todos los campos corregidos');assert.equal(review.body.items,null);assert.equal(monthlyCorrectionUnchanged(review,[detail]),true);
 const wrong=structuredClone(detail);wrong.items[0].after.rows[0].legajo='9';assert.throws(()=>monthlyCorrectionDetail(wrong),/comparación/);
 const revoked=structuredClone(detail);revoked.canReview=false;assert.throws(()=>monthlyCorrectionReviewPlan(revoked,'approve','Revisé todos los campos corregidos'),/otra persona/);
 const resolved=structuredClone(detail);resolved.status='rejected';resolved.canReview=false;resolved.decision={command:'reject',reason:'No corresponde corregir el conjunto',recordedAt:stamp};monthlyCorrectionDetail(resolved);assert.throws(()=>monthlyCorrectionReviewPlan(resolved,'approve','Revisé todos los campos corregidos'));
});
test('a local comparison cannot save without the server verified preview, whose complete fields and warnings are pinned',()=>{
 const draft=monthlyCorrectionPlan([candidate(approved(2,1))],scope,{conceptSourceId:'99'},why);assert.throws(()=>monthlyCorrectionAttempt(draft,id(9000)),/no habilita/);
 const verified=preview(draft);verified.items[0].after.rows[0].issues=[{code:'concept_not_observed',severity:'warning',blocking:false,field:'conceptSourceId',details:{basis:'published_grh_observation'}}];verified.items[0].after.warningIssueCount=1;
 const plan=monthlyCorrectionVerifiedPlan(verified,draft);assert.equal(plan.body.previewSha256,verified.previewSha256);assert.equal(plan.items[0].after.warningIssueCount,1);monthlyCorrectionAttempt(plan,id(9000));
 const incomplete=structuredClone(verified);incomplete.items[0].after.rows=[];assert.throws(()=>monthlyCorrectionVerifiedPlan(incomplete,draft));
 const wrong=structuredClone(verified);wrong.reason='Otro motivo suficientemente largo';assert.throws(()=>monthlyCorrectionVerifiedPlan(wrong,draft));
});
test('strict payloads reject smuggled identity, commands, prototypes, extra fields and unverified targets',()=>{
 const body=monthlyCorrectionPlan([candidate(approved(1,1))],scope,{observation:'Corrección'},why).body;
 for(const change of [{...body,command:'replace'},{...body,extra:1},{...body,reason:'corto'},{...body,patch:{constructor:'bad'}},{...body,patch:{contractId:id(4)}},{...body,items:[{...body.items[0],snapshotSha256:'x'}]}])assert.throws(()=>monthlyCorrectionCommand(change));
 const stale=candidate(approved(1,1,true));stale.items[0].identityCurrent=false;assert.throws(()=>monthlyCorrectionDetail(stale));
});
test('verified preview cannot replace both original and corrected values behind unchanged version and snapshot hash',()=>{
 const draft=monthlyCorrectionPlan([candidate(approved(2,2)),candidate(approved(3,2))],scope,{observation:'Corrección'},why),good=preview(draft);
 for(const change of [i=>{i.batch.rows[1].amountCents='9';i.after.rows[1].amountCents='9';},i=>{i.batch.rows[1].legajo='9';i.after.rows[1].legajo='9';},i=>{i.batch.reasonReference='Otro';i.after.reasonReference='Otro';}]){
  const wrong=structuredClone(good);change(wrong.items[1]);monthlyCorrectionDetail(wrong);assert.throws(()=>monthlyCorrectionVerifiedPlan(wrong,draft),/valor original/);
 }
 assert.throws(()=>monthlyCorrectionVerifiedPlan(good,{scopeKey:scope,body:draft.body}),/original/);
 assert.equal(monthlyCorrectionVerifiedPlan(good,draft).items.length,2);
});
