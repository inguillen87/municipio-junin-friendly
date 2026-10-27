// Proposed institutional217 adapter. Source planning and receipt validation only.
// The caller obtains prerequisites from publicPrerequisiteDefinitions(read).
// This module never imports the public-batch assembler back (no import cycle).
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildNoveltyAdministrative217Installation,assertNoveltyAdministrative217Durability,composeNovelty217Capacity201Bookend} from './novelty-administrative217-installation.mjs';
import {composeOwnFullCapacity190PublicInstallation,assertOwnFullCapacity190PublicProof,assertOwnFullCapacity190PublicDurability} from './own-full-capacity-190-public-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {OWN_RELEASE_TARGETS} from './own-payroll-release-target.mjs';
import {ownInstallationSettings,ownInstallationDestination} from '../prepare-own-payroll-installation.mjs';

export const OWN_M7_PUBLIC_NOVELTY217_STAGE='novelty217';
export const OWN_M7_PUBLIC_NOVELTY217_VERSION='own-m7-public-novelty217-source.v1';
const plans=new WeakMap(),targets=new WeakMap(),SHA=/^[a-f0-9]{64}$/;
const hash=v=>createHash('sha256').update(v).digest('hex');
const targetKeys=['major','projectId','branchId','endpointId','database','role','host'];
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const c of Object.values(v))freeze(c);Object.freeze(v);}return v;};
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const sameTarget=(actual,wanted)=>{assert.ok(actual&&typeof actual==='object','PUBLIC217_ACTUAL_TARGET_REQUIRED');for(const key of targetKeys)assert.equal(actual[key],wanted[key],'PUBLIC217_TARGET_DRIFT:'+key);};
const prefix=(target,readOnly)=>[...(readOnly?['SET TRANSACTION READ ONLY']:[]),...ownInstallationSettings,ownInstallationDestination(target)];
const merge=(...maps)=>{const out={};for(const map of maps)for(const [file,digest]of Object.entries(map)){assert.match(digest,SHA);if(Object.hasOwn(out,file))assert.equal(out[file],digest,'PUBLIC217_SOURCE_CONFLICT:'+file);out[file]=digest;}return out;};
const once=(value,before,after)=>{assert.equal(value.split(before).length,2,'PUBLIC217_FINITE_SOURCE_ANCHOR');return value.replace(before,()=>after);};

function sourceRecord(targetPlan){const record=targets.get(targetPlan);assert.ok(record,'PUBLIC217_UNMINTED_TARGET_PLAN');return record;}
function phase217(receipt,batch,phase,installed){
 assert.ok(['installation','durable','repetition'].includes(phase),'PUBLIC217_UNKNOWN_PHASE');
 const keys=['version','sourceCommit','sourceHashes','mode',...Object.keys(batch.counters),'transactionDataPreserved','preservationSha256','priorMetadataSha256','objectSha256'];
 exact(receipt,keys,'PUBLIC217_NATIVE_PROOF_SHAPE');assert.equal(receipt.version,batch.version);assert.equal(receipt.sourceCommit,batch.sourceCommit);assert.deepEqual(receipt.sourceHashes,batch.sourceHashes);
 assert.equal(receipt.mode,phase==='installation'?'install':'verify','PUBLIC217_NATIVE_MODE');assert.equal(receipt.transactionDataPreserved,phase!=='durable','PUBLIC217_NATIVE_PRESERVATION_PHASE');
 for(const [key,value]of Object.entries(batch.counters))assert.equal(receipt[key],value,'PUBLIC217_COUNTER:'+key);
 for(const key of ['preservationSha256','priorMetadataSha256','objectSha256'])assert.match(receipt[key],SHA);
 if(phase!=='installation'){
  assert.ok(installed,'PUBLIC217_REAL_INSTALL_RECEIPT_REQUIRED');phase217(installed,batch,'installation');
  for(const key of ['priorMetadataSha256','objectSha256'])assert.equal(receipt[key],installed[key],'PUBLIC217_DURABLE_METADATA:'+key);
 }
 return {phaseValidated:true,stage:OWN_M7_PUBLIC_NOVELTY217_STAGE,phase};
}

// Internal inputs only, all supplied by the existing committed source assembler.
// No CLI accepts caller SQL, prerequisite definitions or target replacements.
export function composeOwnM7PublicNovelty217({read,sourceCommit,operationalPairBaseline,prerequisites}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok(['pre107','published107'].includes(operationalPairBaseline));
 exact(prerequisites,['prerequisiteDefinitions','prerequisiteRuntime','aclEvidence','sourceHashes'],'PUBLIC217_PUBLIC_PREREQUISITES_REQUIRED');
 assert.equal(prerequisites.prerequisiteDefinitions.length,8);assert.ok(Array.isArray(prerequisites.prerequisiteRuntime));
 for(const [file,digest]of Object.entries(prerequisites.sourceHashes))assert.equal(hash(read(file).replace(/\r\n?/g,'\n')),digest,'PUBLIC217_PREREQUISITE_SOURCE_CHANGED:'+file);
 const source=buildNoveltyAdministrative217Installation({read,sourceCommit,operationalPairBaseline,prerequisiteDefinitions:[...prerequisites.prerequisiteDefinitions],prerequisiteRuntime:[...prerequisites.prerequisiteRuntime],capacity201Epoch:'pre201'});
 const capacity201=composeOwnFullCapacity190PublicInstallation({read,sourceCommit}),bookend=composeNovelty217Capacity201Bookend({batch:source});
 assert.equal(capacity201.schema,'public');assert.equal(capacity201.sourceSqlSha256,source.capacity201Lineage.sourceSha256);assert.equal(source.helperPin.signature,'public.own_novelty_administrative_context_v1(jsonb)');
 assert.equal(source.helper,bookend.post201Batch.helper);assert.equal(source.context,bookend.post201Batch.context);assert.equal(source.readiness,bookend.post201Batch.readiness);
 const beforeClose=pinsCheck([source.capacity201Lineage.beforePin],'NOVELTY217_201_CLOSE_SOURCE_EPOCH_CHANGED');
 const afterClose=bookend.verification[2];assert.equal(afterClose,pinsCheck([source.capacity201Lineage.afterPin],'NOVELTY217_201_CLOSE_SOURCE_EPOCH_CHANGED'));
 const beforeProof=once(bookend.verification[3],"'epoch','post201'","'epoch','pre201'");
 const before201=[...bookend.verification.slice(0,2),beforeClose,beforeProof];
 assert.deepEqual([before201[0],before201[1],afterClose,once(before201[3],"'epoch','pre201'","'epoch','post201'")],bookend.verification,'PUBLIC217_WHOLE_BOOKEND_INVERSE');
 const sourceHashes=merge(prerequisites.sourceHashes,source.sourceHashes,capacity201.sourceHashes),made=[];
 const plan={version:OWN_M7_PUBLIC_NOVELTY217_VERSION,stageId:OWN_M7_PUBLIC_NOVELTY217_STAGE,sourceCommit,operationalPairBaseline,sourceHashes,
  source217:source,capacity201,bookend,storedThreeFunctionsUnchanged:true,sourceOnly:true,connects:false,executesSql:false,executionAdmitted:false};
 for(const target of OWN_RELEASE_TARGETS){
  const stage={id:OWN_M7_PUBLIC_NOVELTY217_STAGE,version:source.version,target,sourceCommit,rehearsalExpectedError:source.rehearsalExpectedError,
   preflight:[...prefix(target,true),...source.preflight],rehearsal:[...prefix(target,false),...source.rehearsal],installation:[...prefix(target,false),...source.installation],
   durableVerification:[...prefix(target,true),...source.verification],repetition:[...prefix(target,false),...source.repetition],
   before201Verification:[...prefix(target,true),...before201],after201Verification:[...prefix(target,true),...bookend.verification],
   newFunctions:1,adaptedFunctions:2,newTables:0,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,businessOperations:0};
  freeze(stage);targets.set(stage,{plan,target,source,capacity201,bookend});made.push(stage);
 }
 plan.targets=made;freeze(plan);plans.set(plan,{read});return plan;
}

export function assertOwnM7PublicNovelty217Phase({targetPlan,phase,receipt,installed}){const {source}=sourceRecord(targetPlan);return phase217(receipt,source,phase,installed);}
export function assertOwnM7PublicNovelty217Durability({targetPlan,installed,durable,repeated}){
 const {source}=sourceRecord(targetPlan);phase217(installed,source,'installation');phase217(durable,source,'durable',installed);phase217(repeated,source,'repetition',installed);
 return assertNoveltyAdministrative217Durability({installed,durable,repeated,batch:source});
}

// The actual CLI stage record is supplied, not its `validation.passed` flag.
// Validate these three real receipt bodies again after reading the frozen file.
export function assertOwnM7PublicNovelty217PriorRecord({targetPlan,record}){
 const {target,source}=sourceRecord(targetPlan);assert.ok(record&&typeof record==='object');
 assert.equal(record.stage,OWN_M7_PUBLIC_NOVELTY217_STAGE);assert.equal(record.version,source.version);sameTarget(record.target,target);
 assert.equal(record.state,'VALIDATED');assert.equal(record.phase,'complete');for(const key of ['preflight','rehearsed','installed','durableObserved','durabilityVerified','repeated'])assert.equal(record[key],true,'PUBLIC217_REAL_STAGE_RECORD_REQUIRED:'+key);
 assert.equal(record.validatedReceiptCount,3);assert.equal(record.automaticRetry,false);assert.equal(record.businessOperations,0);assert.equal(record.nominalRowsReturned,0);
 const receipts={installed:record.installedProof,durable:record.durableProof,repeated:record.repeatedProof};
 assertOwnM7PublicNovelty217Durability({targetPlan,...receipts});return receipts;
}

function boundary217({targetPlan,record,observed,epoch}){
 const {bookend,source}=sourceRecord(targetPlan),receipts=assertOwnM7PublicNovelty217PriorRecord({targetPlan,record});
 exact(observed,['version','sourceCommit','sourceHashes','capacity201SourceSha256','epoch','functions','newFunctions','adaptedFunctions','newTables','iamWrites','businessWrites','objectSha256'],'PUBLIC217_BOUNDARY_PROOF_SHAPE');
 assert.equal(observed.version,'novelty217-capacity201-bookend.v1');assert.equal(observed.sourceCommit,source.sourceCommit);assert.deepEqual(observed.sourceHashes,bookend.sourceHashes);assert.equal(observed.capacity201SourceSha256,source.capacity201Lineage.sourceSha256);assert.equal(observed.epoch,epoch);assert.equal(observed.functions,3);
 for(const key of ['newFunctions','adaptedFunctions','newTables','iamWrites','businessWrites'])assert.equal(observed[key],0);
 assert.match(observed.objectSha256,SHA);assert.equal(observed.objectSha256,receipts.installed.objectSha256,'PUBLIC217_THREE_FUNCTION_METADATA_CHANGED');
 return {phaseValidated:true,epoch,storedThreeFunctionsUnchanged:true,readOnly:true,globalSnapshotAcross201Compared:false};
}
export function assertOwnM7PublicNovelty217Before201({targetPlan,prior217Record,actualTarget,observed}){
 const {target}=sourceRecord(targetPlan);sameTarget(actualTarget,target);return boundary217({targetPlan,record:prior217Record,observed,epoch:'pre201'});
}
export function assertOwnM7PublicNovelty217After201({targetPlan,prior217Record,actualTarget,installed201,durable201,observed}){
 const {target,capacity201}=sourceRecord(targetPlan);sameTarget(actualTarget,target);
 // Institutional receipts keep their own actual ABI; no QA epoch envelope.
 assertOwnFullCapacity190PublicProof({proof:installed201,batch:capacity201});assertOwnFullCapacity190PublicProof({proof:durable201,batch:capacity201});
 const capacityValidation=assertOwnFullCapacity190PublicDurability({installed:installed201,durable:durable201,batch:capacity201});
 const bookendValidation=boundary217({targetPlan,record:prior217Record,observed,epoch:'post201'});
 return {passed:true,capacity201Validation:capacityValidation,bookendValidation,readOnly:true,storedThreeFunctionsUnchanged:true,businessOperations:0};
}

// Downstream stages validate this native evidence again. A stored passed flag
// or the201 installed/durable pair alone does not establish the217 bookend.
export function assertOwnM7PublicNovelty217Capacity201Record({targetPlan,prior217Record,record}){
 const {target}=sourceRecord(targetPlan);assert.ok(record&&typeof record==='object');sameTarget(record.target,target);
 assert.equal(record.stage,'capacity201');assert.equal(record.state,'VALIDATED');assert.equal(record.phase,'complete');
 for(const key of ['preflight','rehearsed','installed','durableObserved','durabilityVerified'])assert.equal(record[key],true);
 assert.equal(record.repeated,false);assert.equal(record.validatedReceiptCount,2);assert.equal(record.automaticRetry,false);assert.equal(record.businessOperations,0);assert.equal(record.nominalRowsReturned,0);
 const before=assertOwnM7PublicNovelty217Before201({targetPlan,prior217Record,actualTarget:record.target,observed:record.novelty217Before201Proof});
 const after=assertOwnM7PublicNovelty217After201({targetPlan,prior217Record,actualTarget:record.target,installed201:record.installedProof,durable201:record.durableProof,observed:record.novelty217After201Proof});
 return {passed:true,validatedInstitutional201:true,validatedReal217Triplet:true,validatedBothNativeBoundaries:true,before,after};
}

// Project only the complete predecessor statement, once in each actual200 phase.
// Settings, destination guards, all200 SQL and its proof ABI stay identical.
export function projectOwnM7Census200Through217({plan,targetPlan,censusStage}){
 assert.ok(plans.has(plan),'PUBLIC217_UNMINTED_SOURCE_PLAN');const record=sourceRecord(targetPlan);assert.strictEqual(record.plan,plan);
 assert.equal(censusStage.id,'census200');const before=record.source.predecessor.afterCheck,after=record.source.afterCheck;
 assert.notEqual(before,after);const projected={...censusStage},evidence=[];
 for(const phase of ['preflight','rehearsal','installation']){
  const rows=censusStage[phase],wantedPrefix=prefix(record.target,phase==='preflight');assert.ok(Array.isArray(rows));assert.deepEqual(rows.slice(0,wantedPrefix.length),wantedPrefix,'PUBLIC217_CENSUS_TARGET_PREFIX_DRIFT:'+phase);assert.equal(rows.filter(s=>s===before).length,1,'PUBLIC217_CENSUS_WHOLE_PREIMAGE_REQUIRED:'+phase);
  const changed=rows.map(s=>s===before?after:s);assert.equal(changed.filter(s=>s===after).length,1);
  assert.deepEqual(changed.map(s=>s===after?before:s),rows,'PUBLIC217_CENSUS_WHOLE_INVERSE:'+phase);projected[phase]=changed;
  evidence.push({phase,multiplicity:1,beforeSha256:hash(before),afterSha256:hash(after),wholeArrayInverse:true});
 }
 assert.strictEqual(projected.durableVerification,censusStage.durableVerification);assert.strictEqual(projected.repetition,censusStage.repetition);
 return freeze({stage:projected,projection:evidence,source217Version:record.source.version,observedMetadataUsed:false});
}
