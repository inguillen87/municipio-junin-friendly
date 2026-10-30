import test from 'node:test';
import assert from 'node:assert/strict';
import {familyRowsDelta,bindNativeFamily195Technical,FAMILY195_SYNTHETIC_INPUTS} from '../scripts/lib/native-family-195-same190-continuation.mjs';
const TABLES=['school_certificate_blob','school_certificate','school_certificate_event','school_certificate_storage_policy','employee_family_member','employee_family_member_event','school_certificate_record','school_certificate_record_event','native_family_storage_policy','native_family_request','native_family_request_event'];
const row=(id,sha,provenance={})=>({key:{id},sha256:sha,provenance:{requestId:null,actorMembershipId:null,submitterMembershipId:null,contractId:null,blobSha256:null,...provenance}});
const snapshot=rows=>({tables:TABLES.map(table=>({table,state:{count:(rows[table]??[]).length,rows:rows[table]??[]}})),schoolPolicy:{singleton:true,generation:0},nativePolicy:{singleton:true}});
test('rows delta counts only new rows, keeps prior rows by PK and sha256 and returns their provenance',()=>{
 const before=snapshot({native_family_request:[row('a','1'.repeat(64))]});
 const after=snapshot({native_family_request:[row('a','1'.repeat(64)),row('b','2'.repeat(64))],native_family_request_event:[row('e','3'.repeat(64),{requestId:'b'})]});
 const delta=familyRowsDelta(before,after);
 assert.deepEqual(delta.counts,{native_family_request:1,native_family_request_event:1});assert.equal(delta.preserved,1);
 assert.deepEqual(delta.added.native_family_request.map(r=>r.key.id),['b']);assert.equal(delta.added.native_family_request_event[0].provenance.requestId,'b');
});
test('a removed or mutated prior row, a missing table or a count mismatch is rejected',()=>{
 const before=snapshot({native_family_request:[row('a','1'.repeat(64))]});
 assert.throws(()=>familyRowsDelta(before,snapshot({})),/FAMILY195_BUSINESS_PRIOR_ROW_REMOVED/);
 assert.throws(()=>familyRowsDelta(before,snapshot({native_family_request:[row('a','9'.repeat(64))]})),/FAMILY195_BUSINESS_PRIOR_ROW_MUTATED/);
 const short={...snapshot({}),tables:snapshot({}).tables.slice(1)};assert.throws(()=>familyRowsDelta(before,short),/FAMILY195_BUSINESS_ELEVEN_TABLES/);
 const bad=snapshot({native_family_request:[row('a','1'.repeat(64))]});bad.tables[9].state.count=5;assert.throws(()=>familyRowsDelta(before,bad),/FAMILY195_BUSINESS_COUNT_CONSISTENT/);
});
test('technical binding demands the exact technical proof and binds once per h',()=>{
 const h={json(){},qa:{schema:'mc_qa_fixed_092_'+'a'.repeat(32),normalized:s=>s},sourceCommit:'b'.repeat(40),major:17};
 const durable={objectFingerprint:'c'.repeat(64),prerequisiteFingerprint:'d'.repeat(64)};
 const proof={durability:{passed:true},rehearsalSnapshotEqual:true,lateFailureSnapshotEqual:true,repetitionRejected:true,durable};
 const technical={version:'native-family195-same190-technical-proof.v1',passed:true,schema:h.qa.schema,sourceCommit:h.sourceCommit,major:17,prerequisiteClosure:'native',nativeFamilyV5Source:'110',actorsCreated:0,businessOperations:0,proofs:{prerequisites:proof,self195:proof}};
 assert.throws(()=>bindNativeFamily195Technical(h,{...technical,version:'other'}),/FAMILY195_BUSINESS_TECHNICAL_VERSION/);
 assert.throws(()=>bindNativeFamily195Technical(h,{...technical,proofs:{prerequisites:proof}}),/FAMILY195_BUSINESS_TECHNICAL_PROOF:self195/);
 assert.strictEqual(bindNativeFamily195Technical(h,technical),technical);
 assert.throws(()=>bindNativeFamily195Technical(h,technical),/FAMILY195_BUSINESS_TECHNICAL_ALREADY_BOUND/);
});
test('synthetic inputs carry the synthetic label on every text and an ISO date',()=>{
 for(const [key,value] of Object.entries(FAMILY195_SYNTHETIC_INPUTS))assert.ok(key==='presentedOn'?/^\d{4}-\d{2}-\d{2}$/.test(value):/sintétic/i.test(value),key);
});


test('school policy generation changes only its row hash; quotas, native policy and prior PK stay protected',()=>{
 const policy=sha=>({...row('policy',sha),key:{singleton:true}});
 const before=snapshot({school_certificate_storage_policy:[policy('1'.repeat(64))]});
 before.schoolPolicy={singleton:true,pdf_quota_bytes:8388608,generation:0};
 const after=snapshot({school_certificate_storage_policy:[policy('2'.repeat(64))]});
 after.schoolPolicy={...before.schoolPolicy,generation:2};
 const delta=familyRowsDelta(before,after);
 assert.deepEqual(delta.counts,{});assert.deepEqual(delta.added,{});assert.equal(delta.preserved,1);
 const quotaChanged=structuredClone(after);quotaChanged.schoolPolicy.pdf_quota_bytes--;
 assert.throws(()=>familyRowsDelta(before,quotaChanged),/FAMILY195_BUSINESS_SCHOOL_POLICY_EXCEPT_GENERATION/);
 const nativeChanged=structuredClone(after);nativeChanged.nativePolicy.singleton=false;
 assert.throws(()=>familyRowsDelta(before,nativeChanged),/FAMILY195_BUSINESS_NATIVE_POLICY/);
 const pkChanged=structuredClone(after);pkChanged.tables.find(item=>item.table==='school_certificate_storage_policy').state.rows[0].key.singleton=false;
 assert.throws(()=>familyRowsDelta(before,pkChanged),/FAMILY195_BUSINESS_PRIOR_ROW_REMOVED:school_certificate_storage_policy/);
});
