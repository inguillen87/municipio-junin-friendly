import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { prepareAdoptedFamilyBatch as prepare, prepareReviewedFamilyDeclaration as finish } from '../lib/adopted-family-preparation.js';
import { inputFixture,reseal,subject,sourceRow,id,hex,currentContext,reviewFor,memberAndLink } from './fixtures/adopted-family-preparation-synthetic.js';
const now=new Date('2026-11-05T12:00:00Z');
const first=plan=>plan.rows.find(r=>r.values?.dni==='91000001');
const throwsCode=(fn,code)=>assert.throws(fn,e=>e.code===`ADOPTED_FAMILY_${code}`);

test('complete preparation preserves historical end, unknowns and unsupported relatives; grants no authority',()=>{
 const input=inputFixture(),copy=structuredClone(input),{plan,summary}=prepare(input);
 assert.deepEqual(input,copy);assert.equal(summary.sourceRows,4);assert.equal(summary.historicalEndDates,1);
 assert.deepEqual(summary.statusCounts,{awaiting_explicit_review:2,historical_end_recorded:1,unsupported_relationship:1});
 assert.equal(summary.executable,false);assert.equal(summary.adoptionsPerformed,0);assert.equal(plan.authorityGranted,false);
 assert.equal(plan.rows.find(r=>r.values?.dni==='91000002').values.validTo,'2020-02-03');
 assert.equal(plan.rows.find(r=>r.values?.dni===null).values.birthDate,null);
 assert.ok(plan.rows.every(r=>!r.schoolingImported&&!r.consentInferred));
});
test('ordering does not change the plan fingerprint',()=>{const a=inputFixture(),b=structuredClone(a);b.rows.reverse();b.cohort.reverse();assert.equal(prepare(a).plan.planSha256,prepare(b).plan.planSha256);});
test('an omitted source row cannot pass the captured count',()=>{const a=inputFixture();a.rows.pop();throwsCode(()=>prepare(a),'INCOMPLETE_CAPTURE');});
test('changed family facts cannot pass an unchanged projection pin',()=>{const a=inputFixture();a.rows[0].familyName='Cambio sintético';throwsCode(()=>prepare(a),'INPUT_EVIDENCE_CHANGED');});
for (const [name,change] of [
 ['unapproved decision',a=>a.cohort[0].decision='reject'],
 ['transaction mismatch',a=>a.cohort[0].decisionXid='9002'],
 ['foreign registration',a=>a.cohort[0].registeredPersonId=id(9999)],
 ['changed current contract',a=>a.cohort[0].currentContractSha256=hex('8')],
 ['wrong original batch',a=>a.cohort[0].beforeSourceBatchId=id(7)],
 ['source masquerading as native',a=>a.cohort[0].currentSourceSystem='GRH']]) {
 test(`rejects ${name}`,()=>{const a=inputFixture();change(a);reseal(a);throwsCode(()=>prepare(a),'ADOPTION_PROVENANCE');});
}
test('child mapping must be exact evidence, never inferred from the numeric code alone',()=>{const a=inputFixture();a.source.relationship.name='OTRO';throwsCode(()=>prepare(a),'CHILD_MAPPING');});
test('source run and exact legajo must match; leading zeros are not stripped',()=>{
 for(const change of [a=>a.rows[0].importRunId='100',a=>a.rows[0].legajo='01001']) {const a=inputFixture();change(a);reseal(a);throwsCode(()=>prepare(a),'SOURCE_ROW_SCOPE');}
});
test('duplicate source identity is rejected rather than silently choosing a row',()=>{const a=inputFixture();a.rows.push({...a.rows[0]});reseal(a);throwsCode(()=>prepare(a),'DUPLICATE_SOURCE_ID');});
test('unknown dates remain unknown in the reviewed draft',()=>{
 const {plan}=prepare(inputFixture()),row=plan.rows.find(r=>r.values?.dni===null);
 const result=finish(plan,reviewFor(plan,row),currentContext(row),{now});
 assert.equal(result.payload.birthDate,null);assert.equal(result.payload.validFrom,null);assert.equal(result.payload.validTo,null);assert.equal(result.payload.dni,null);
 assert.equal(result.executable,false);assert.equal(result.requiresAuthenticatedAtomicWriter,true);
});
test('historical end requires acknowledgement and is retained exactly',()=>{
 const {plan}=prepare(inputFixture()),row=plan.rows.find(r=>r.historicalEndDatePresent);
 const review=reviewFor(plan,row);review.acknowledgeHistoricalEnd=false;
 throwsCode(()=>finish(plan,review,currentContext(row),{now}),'HISTORICAL_END_ACK_REQUIRED');
 const result=finish(plan,reviewFor(plan,row),currentContext(row),{now});assert.equal(result.payload.validTo,'2020-02-03');assert.equal(result.payload.validFrom,null);
});
test('review cannot substitute an empty end date or add schooling',()=>{
 const {plan}=prepare(inputFixture()),row=first(plan);
 for(const extra of [{validTo:null},{schoolYear:2026},{consent:true}]) throwsCode(()=>finish(plan,{...reviewFor(plan,row),...extra},currentContext(row),{now}),'INPUT_SHAPE');
});
test('unsupported relatives cannot become children through finalization',()=>{
 const {plan}=prepare(inputFixture()),row=plan.rows.find(r=>r.status==='unsupported_relationship');throwsCode(()=>finish(plan,reviewFor(plan,row),currentContext(row),{now}),'ROW_NOT_PREPARABLE');
});
for(const [name,change] of [['DNI',a=>a.rows[0].dni='00000000'],['birth date',a=>a.rows[0].birthDate='2026-02-30'],['end before birth',a=>a.rows[0].endDate='2000-01-01'],['missing name',a=>a.rows[0].familyName=null]]) {
 test(`invalid source ${name} stays in resolution`,()=>{const a=inputFixture();change(a);reseal(a);const {plan}=prepare(a);assert.ok(plan.rows.some(r=>r.status==='requires_resolution'));});
}
test('same DNI within one contract blocks both source candidates',()=>{const a=inputFixture();a.rows[1].dni=a.rows[0].dni;reseal(a);const {plan}=prepare(a);assert.equal(plan.rows.filter(r=>r.issues.includes('ambiguous_source_identity')).length,2);});
test('same name and birth with different DNI is an ambiguity, not a merge',()=>{const a=inputFixture();a.rows[1].identityNameKey=a.rows[0].identityNameKey;reseal(a);assert.equal(prepare(a).plan.rows.filter(r=>r.issues.includes('ambiguous_source_identity')).length,2);});
test('unknown birth matches the name bucket conservatively',()=>{const a=inputFixture();a.rows[1].identityNameKey=a.rows[0].identityNameKey;a.rows[1].birthDate=null;reseal(a);assert.equal(prepare(a).plan.rows.filter(r=>r.issues.includes('ambiguous_source_identity')).length,2);});
test('same DNI on different employee contracts is not a duplicate person merge',()=>{const a=inputFixture();a.rows[3].dni=a.rows[0].dni;reseal(a);assert.ok(prepare(a).plan.rows.every(r=>!r.issues.includes('ambiguous_source_identity')));});
test('existing own family without provenance causes explicit overlap review',()=>{
 const a=inputFixture(),row=first(prepare(a).plan);a.ownMembers.push(memberAndLink(a,row).member);
 assert.ok(first(prepare(a).plan).issues.includes('overlap_with_existing_own_family'));
});
test('exact source link replay does not create a second declaration',()=>{
 const a=inputFixture(),row=first(prepare(a).plan),{member,link}=memberAndLink(a,row);a.ownMembers.push(member);a.sourceLinks.push(link);
 const {plan}=prepare(a),existing=first(plan);assert.equal(existing.status,'already_incorporated');assert.equal(existing.existingMemberId,member.id);
 throwsCode(()=>finish(plan,reviewFor(plan,existing),currentContext(existing),{now}),'ROW_NOT_PREPARABLE');
});
test('changed source uses the same logical key and becomes a conflict',()=>{
 const a=inputFixture(),row=first(prepare(a).plan),{member,link}=memberAndLink(a,row);a.ownMembers.push(member);a.sourceLinks.push(link);
 a.rows[0].sourceRowSha256=hex('7');reseal(a);const changed=first(prepare(a).plan);
 assert.equal(changed.sourceKey,row.sourceKey);assert.ok(changed.issues.includes('source_changed_after_incorporation'));
});
test('missing or different linked member cannot satisfy idempotency',()=>{
 const a=inputFixture(),row=first(prepare(a).plan),{link}=memberAndLink(a,row);a.sourceLinks.push(link);
 assert.ok(first(prepare(a).plan).issues.includes('source_link_member_mismatch'));
});
test('a real current native context is still required for a draft',()=>{
 const {plan}=prepare(inputFixture()),row=first(plan),context=currentContext(row);context.canDeclare=false;
 throwsCode(()=>finish(plan,reviewFor(plan,row),context,{now}),'CURRENT_NATIVE_CONTEXT_REQUIRED');
 context.canDeclare=true;context.subject.registrationId=id(9999);
 throwsCode(()=>finish(plan,reviewFor(plan,row),context,{now}),'CURRENT_NATIVE_CONTEXT_REQUIRED');
});
test('native validator normalizes allowed DNI punctuation and the context token is used verbatim',()=>{
 const {plan}=prepare(inputFixture()),row=first(plan),context=currentContext(row),result=finish(plan,reviewFor(plan,row),context,{now});
 assert.equal(result.payload.dni,'91000001');assert.equal(result.payload.contractIdentityToken,context.subject.identityToken);
 assert.equal(result.requiresSourceProvenanceLedger,true);assert.equal(result.authorityGranted,false);
});
test('mutating a sealed plan, including historical end, fails closed',()=>{
 const {plan}=prepare(inputFixture()),row=plan.rows.find(r=>r.historicalEndDatePresent),review=reviewFor(plan,row);row.values.validTo=null;
 throwsCode(()=>finish(plan,review,currentContext(row),{now}),'PLAN_CHANGED');
});
test('851 synthetic parents / 1339 source rows preserve 382 end dates without writing',t=>{
 const a=inputFixture();a.cohort=Array.from({length:851},(_,i)=>subject(i+1,a.scope,a.source));
 a.rows=Array.from({length:1339},(_,i)=>sourceRow(i+1,a.source,a.cohort[i%851].legajo));
 a.rows.forEach((r,i)=>{if(i>=1045)r.relationshipCode='1';else if(i<382)r.endDate='2020-02-03';});reseal(a);
 const start=performance.now(),result=prepare(a);t.diagnostic(`Synthetic preparation ${Math.round(performance.now()-start)} ms`);
 assert.equal(result.summary.contracts,851);assert.equal(result.summary.sourceRows,1339);assert.equal(result.summary.historicalEndDates,382);
 assert.equal(result.summary.statusCounts.unsupported_relationship,294);assert.equal(result.summary.statusCounts.historical_end_recorded,382);
 assert.equal(result.summary.statusCounts.awaiting_explicit_review,663);assert.equal(result.summary.databaseWrites,0);
});
