// Pure TEST source construction. This is not a connection or execution admission.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const shape=(value,keys,label)=>{assert.ok(value!==null&&typeof value==='object'&&!Array.isArray(value),label);assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),label);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const FINAL_REVIEW_TEST_TARGET=freeze({kind:'test',major:17,projectId:'noisy-poetry-54471701',branchId:'br-orange-rain-ac6uvvxu',endpointId:'ep-aged-firefly-acoaqlsh',host:'ep-aged-firefly-acoaqlsh.sa-east-1.aws.neon.tech',database:'neondb',role:'neondb_owner',databaseOid:16395,guardOid:532699,parentBranchId:'br-plain-dust-acpjgebb'});
export const FINAL_REVIEW_TEST_CHECK_SHA256=freeze({'183':'b2d23c149cc1e22080a78770f7caacc3763ae2dcf748a7dd978f7f3815bdabc3','218':'73c9e14dc141fc059974b71042bd173f062b7990f76e8679818e9af844fa499c'});
const capabilities=new WeakMap();
/** Validate a complete metadata-only observation at construction. The caller must
 * separately admit its provenance, freshness, source bytes and operation before
 * any native execution. A caller-supplied digest is not provider attestation. */
export function prepareFinalReviewTestTargetAdmission({sourceCommit,nativeObservationRaw,nativeObservationSha256}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/,'FINAL_REVIEW_TEST_SOURCE_COMMIT');
 assert.ok(Buffer.isBuffer(nativeObservationRaw),'FINAL_REVIEW_TEST_RAW_REQUIRED');assert.ok(nativeObservationRaw.length>0&&nativeObservationRaw.length<=65536,'FINAL_REVIEW_TEST_RAW_SIZE');
 assert.match(nativeObservationSha256,/^[a-f0-9]{64}$/,'FINAL_REVIEW_TEST_OBSERVATION_SHA');assert.equal(hash(nativeObservationRaw),nativeObservationSha256,'FINAL_REVIEW_TEST_OBSERVATION_SHA');
 const text=nativeObservationRaw.toString('utf8');assert.ok(Buffer.from(text,'utf8').equals(nativeObservationRaw),'FINAL_REVIEW_TEST_UTF8');const observation=JSON.parse(text),t=FINAL_REVIEW_TEST_TARGET;
 shape(observation,['version','sourceCommit','projectId','branch','compute','proof','expectedTuple183Sha256','expectedTuple218Sha256','observedExact183','testAdmissionGranted','ddlStatementsExecuted','nominalRowsReturned','businessWrites','productionCalls'],'FINAL_REVIEW_TEST_OBSERVATION_FIELDS');
 assert.equal(observation.version,'root-oct28-existing-test-native-readonly-preflight.v1');assert.match(observation.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(observation.projectId,t.projectId);
 const b=observation.branch;shape(b,['id','name','parent','currentState','primary','default','protected'],'FINAL_REVIEW_TEST_BRANCH_FIELDS');
 assert.equal(b.id,t.branchId);assert.equal(b.name,'codex-annul-ddl-post215-20261028-r1');assert.equal(b.parent,t.parentBranchId);assert.equal(b.currentState,'ready');for(const key of ['primary','default','protected'])assert.equal(b[key],false,'FINAL_REVIEW_TEST_BRANCH_PROTECTION');
 assert.ok(Array.isArray(observation.compute)&&observation.compute.length===1,'FINAL_REVIEW_TEST_COMPUTE_COUNT');const c=observation.compute[0];shape(c,['id','branchId','projectId','host','type','state'],'FINAL_REVIEW_TEST_COMPUTE_FIELDS');
 for(const[key,expected]of Object.entries({id:t.endpointId,branchId:t.branchId,projectId:t.projectId,host:t.host,type:'read_write'}))assert.equal(c[key],expected,'FINAL_REVIEW_TEST_COMPUTE_IDENTITY');assert.ok(['idle','active'].includes(c.state),'FINAL_REVIEW_TEST_COMPUTE_STATE');
 const p=observation.proof;shape(p,['version','branchId','database','guardOid','readOnly','isolation','projectId','endpointId','catalogOnly','currentUser','databaseOid','serverMajor','sessionUser','managedConstraints','runtimeRolePresent','finalRevisionPresent'],'FINAL_REVIEW_TEST_NATIVE_FIELDS');
 assert.equal(p.version,'oct28-test-native-identity-preflight.v1');for(const[key,expected]of Object.entries({branchId:t.branchId,database:t.database,guardOid:String(t.guardOid),readOnly:true,isolation:'repeatable read',projectId:t.projectId,endpointId:t.endpointId,catalogOnly:true,currentUser:t.role,databaseOid:String(t.databaseOid),serverMajor:t.major,sessionUser:t.role,runtimeRolePresent:true,finalRevisionPresent:true}))assert.equal(p[key],expected,'FINAL_REVIEW_TEST_NATIVE_IDENTITY');
 assert.ok(Array.isArray(p.managedConstraints)&&p.managedConstraints.length===1,'FINAL_REVIEW_TEST_CHECK_COUNT');const check=p.managedConstraints[0];shape(check,['name','local','validated','expressionSha256'],'FINAL_REVIEW_TEST_CHECK_FIELDS');assert.equal(check.name,'grh_final_source_revision_source_tuple_check');assert.equal(check.local,true);assert.equal(check.validated,true);
 const state=Object.keys(FINAL_REVIEW_TEST_CHECK_SHA256).find(key=>FINAL_REVIEW_TEST_CHECK_SHA256[key]===check.expressionSha256);assert.ok(state,'FINAL_REVIEW_TEST_CHECK_STATE');
 assert.equal(observation.expectedTuple183Sha256,FINAL_REVIEW_TEST_CHECK_SHA256['183']);assert.equal(observation.expectedTuple218Sha256,FINAL_REVIEW_TEST_CHECK_SHA256['218']);assert.equal(observation.observedExact183,state==='183');assert.equal(observation.testAdmissionGranted,false,'FINAL_REVIEW_TEST_EXECUTION_NOT_ADMITTED');for(const key of ['ddlStatementsExecuted','nominalRowsReturned','businessWrites','productionCalls'])assert.equal(observation[key],0,'FINAL_REVIEW_TEST_OBSERVATION_WRITES');
 const context=freeze({version:'final-review-test-target-construction.v1',scope:'test-source-construction-only',sourceCommit,observationSourceCommit:observation.sourceCommit,observationSha256:nativeObservationSha256,observedTupleState:state,target:t,executionAdmitted:false,connects:false,executesSql:false});
 const capability=freeze({version:context.version,scope:context.scope,executionAdmitted:false,connects:false,executesSql:false});capabilities.set(capability,context);return capability;
}
export function requireFinalReviewTestTargetAdmission(capability,{sourceCommit}){
 const context=capabilities.get(capability);assert.ok(context,'FINAL_REVIEW_TEST_ORIGINAL_CAPABILITY_REQUIRED');assert.equal(context.sourceCommit,sourceCommit,'FINAL_REVIEW_TEST_CONSTRUCTION_SOURCE_MISMATCH');return context;
}
