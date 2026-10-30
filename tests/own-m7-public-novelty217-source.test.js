// Proposed source-only regressions; all native-shaped values below are mocks.
// Their acceptance is validator coverage, never evidence of PostgreSQL execution.
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicPrerequisiteDefinitions} from '../scripts/lib/own-m7-public-schema-batch.mjs';
import {buildOwnReportCensusInstallation} from '../scripts/lib/own-payroll-report-census-installation.mjs';
import {ownInstallationSettings,ownInstallationDestination} from '../scripts/prepare-own-payroll-installation.mjs';
import {composeOwnM7PublicNovelty217,assertOwnM7PublicNovelty217Phase,assertOwnM7PublicNovelty217Durability,assertOwnM7PublicNovelty217PriorRecord,assertOwnM7PublicNovelty217Before201,assertOwnM7PublicNovelty217After201,assertOwnM7PublicNovelty217Capacity201Record,projectOwnM7Census200Through217} from '../scripts/lib/own-m7-public-novelty217-source.mjs';
const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL(file,root),'utf8'),sourceCommit='a'.repeat(40);
let memo;
function fixture(){if(memo)return memo;const prerequisites=publicPrerequisiteDefinitions(read),plan=composeOwnM7PublicNovelty217({read,sourceCommit,operationalPairBaseline:'published107',prerequisites});return memo={plan,target:plan.targets.find(t=>t.target.major===17),prerequisites};}
before(()=>{fixture();});
function mocked217(target){
 const b=fixture().plan.source217,installed={version:b.version,sourceCommit,sourceHashes:b.sourceHashes,mode:'install',...b.counters,transactionDataPreserved:true,preservationSha256:'1'.repeat(64),priorMetadataSha256:'2'.repeat(64),objectSha256:'3'.repeat(64)};
 const durable={...installed,mode:'verify',transactionDataPreserved:false},repeated={...installed,mode:'verify'};
 return {stage:'novelty217',version:b.version,target:target.target,state:'VALIDATED',phase:'complete',preflight:true,rehearsed:true,installed:true,durableObserved:true,durabilityVerified:true,repeated:true,validatedReceiptCount:3,automaticRetry:false,businessOperations:0,nominalRowsReturned:0,installedProof:installed,durableProof:durable,repeatedProof:repeated};
}
const mockedBoundary=(plan,record,epoch)=>({version:'novelty217-capacity201-bookend.v1',sourceCommit,sourceHashes:plan.bookend.sourceHashes,capacity201SourceSha256:plan.source217.capacity201Lineage.sourceSha256,epoch,functions:3,newFunctions:0,adaptedFunctions:0,newTables:0,iamWrites:0,businessWrites:0,objectSha256:record.installedProof.objectSha256});
const mocked201=plan=>({version:'own-full-capacity-canonical190-installation.v1',sourceCommit,sourceSqlSha256:plan.capacity201.sourceSqlSha256,priorStateSha256:'4'.repeat(64),priorStatePreserved:true,existingFunctionMetadataPreserved:true,businessWrites:0,newFunctions:16,adaptedFunctions:9,changedChecks:3});

test('217 public source stage binds both existing targets, retains its native rollback token and emits no QA relocation',()=>{
 const {plan}=fixture();assert.deepEqual(plan.targets.map(t=>t.target.major),[17,18]);assert.equal(plan.source217.capacity201Epoch,'pre201');
 for(const target of plan.targets){assert.equal(target.id,'novelty217');assert.equal(target.rehearsalExpectedError,plan.source217.rehearsalExpectedError);assert.ok(target.rehearsal.at(-1).includes(target.rehearsalExpectedError));
  for(const [phase,ro]of [['preflight',true],['rehearsal',false],['installation',false],['durableVerification',true],['repetition',false],['before201Verification',true],['after201Verification',true]]){
   const expected=[...(ro?['SET TRANSACTION READ ONLY']:[]),...ownInstallationSettings,ownInstallationDestination(target.target)];assert.deepEqual(target[phase].slice(0,expected.length),expected);assert.doesNotMatch(target[phase].join('\n'),/mc_qa_fixed_092_/);
  }
 }
 assert.equal(plan.source217.helper,plan.bookend.post201Batch.helper);assert.equal(plan.source217.context,plan.bookend.post201Batch.context);assert.equal(plan.source217.readiness,plan.bookend.post201Batch.readiness);
});
test('each217 phase rejects absent, mixed or changed receipts before any later phase can count',()=>{
 const {target}=fixture(),r=mocked217(target);assertOwnM7PublicNovelty217Phase({targetPlan:target,phase:'installation',receipt:r.installedProof});
 assert.throws(()=>assertOwnM7PublicNovelty217Phase({targetPlan:target,phase:'durable',receipt:r.durableProof}),/REAL_INSTALL/);
 for(const mutate of [v=>v.mode='install',v=>v.transactionDataPreserved=true,v=>v.objectSha256='9'.repeat(64),v=>v.extra=true,v=>v.sourceCommit='b'.repeat(40)]){const receipt=structuredClone(r.durableProof);mutate(receipt);assert.throws(()=>assertOwnM7PublicNovelty217Phase({targetPlan:target,phase:'durable',receipt,installed:r.installedProof}));}
 assert.equal(assertOwnM7PublicNovelty217Durability({targetPlan:target,installed:r.installedProof,durable:r.durableProof,repeated:r.repeatedProof}).passed,true);
 assert.throws(()=>assertOwnM7PublicNovelty217Phase({targetPlan:{...target},phase:'installation',receipt:r.installedProof}),/UNMINTED/);
});
test('prior217 requires actual three-receipt artifact shape and target instead of trusting a passed flag',()=>{
 const {target}=fixture(),r=mocked217(target);assert.equal(assertOwnM7PublicNovelty217PriorRecord({targetPlan:target,record:r}).installed,r.installedProof);
 for(const mutate of [v=>delete v.repeatedProof,v=>v.installedProof={passed:true},v=>v.state='UNCERTAIN',v=>v.target={...v.target,major:18},v=>v.validatedReceiptCount=2,v=>v.repeated=false]){const changed=structuredClone(r);mutate(changed);assert.throws(()=>assertOwnM7PublicNovelty217PriorRecord({targetPlan:target,record:changed}));}
});
test('201 bookend accepts institutional receipts and rejects the QA envelope or changed three-function metadata',()=>{
 const {plan,target}=fixture(),r=mocked217(target),before=mockedBoundary(plan,r,'pre201'),after=mockedBoundary(plan,r,'post201'),installed=mocked201(plan),durable=structuredClone(installed);
 assert.equal(assertOwnM7PublicNovelty217Before201({targetPlan:target,prior217Record:r,actualTarget:target.target,observed:before}).readOnly,true);
 assert.equal(assertOwnM7PublicNovelty217After201({targetPlan:target,prior217Record:r,actualTarget:target.target,installed201:installed,durable201:durable,observed:after}).passed,true);
 const common={targetPlan:target,prior217Record:r,actualTarget:target.target,installed201:installed,durable201:durable,observed:after};
 assert.throws(()=>assertOwnM7PublicNovelty217After201({...common,installed201:{version:'own-full-capacity-canonical190-epochs.v1',epoch201:{installed,durable}}}));
 assert.throws(()=>assertOwnM7PublicNovelty217After201({...common,durable201:{...durable,priorStateSha256:'5'.repeat(64)}}));
 assert.throws(()=>assertOwnM7PublicNovelty217After201({...common,observed:{...after,objectSha256:'6'.repeat(64)}}),/THREE_FUNCTION_METADATA_CHANGED/);
 assert.throws(()=>assertOwnM7PublicNovelty217After201({...common,actualTarget:{...target.target,endpointId:'unreviewed'}}),/TARGET_DRIFT/);
});
test('a downstream201 record cannot skip either native217 boundary or replace the original217 receipts',()=>{
 const {plan,target}=fixture(),prior=mocked217(target),installed=mocked201(plan),record={stage:'capacity201',state:'VALIDATED',phase:'complete',target:target.target,preflight:true,rehearsed:true,installed:true,durableObserved:true,durabilityVerified:true,repeated:false,validatedReceiptCount:2,automaticRetry:false,businessOperations:0,nominalRowsReturned:0,installedProof:installed,durableProof:structuredClone(installed),novelty217Before201Proof:mockedBoundary(plan,prior,'pre201'),novelty217After201Proof:mockedBoundary(plan,prior,'post201')};
 assert.equal(assertOwnM7PublicNovelty217Capacity201Record({targetPlan:target,prior217Record:prior,record}).validatedBothNativeBoundaries,true);
 for(const key of ['novelty217Before201Proof','novelty217After201Proof']){const missing=structuredClone(record);delete missing[key];assert.throws(()=>assertOwnM7PublicNovelty217Capacity201Record({targetPlan:target,prior217Record:prior,record:missing}));}
 assert.throws(()=>assertOwnM7PublicNovelty217Capacity201Record({targetPlan:target,prior217Record:{passed:true},record}));
});
test('200 replacement operates on its complete source predecessor once per phase and has a whole-array inverse',()=>{
 const {plan,target}=fixture(),census=buildOwnReportCensusInstallation({read,sourceCommit}),guard=plan.source217.predecessor.afterCheck,header=ro=>[...(ro?['SET TRANSACTION READ ONLY']:[]),...ownInstallationSettings,ownInstallationDestination(target.target)];
 const input={id:'census200',preflight:[...header(true),guard,census.contextCheck,census.prerequisiteCheck],rehearsal:[...header(false),guard,...census.statements],installation:[...header(false),guard,...census.statements],durableVerification:[...header(true),...census.verification],repetition:null};
 const projected=projectOwnM7Census200Through217({plan,targetPlan:target,censusStage:input});assert.equal(projected.projection.length,3);
 for(const phase of ['preflight','rehearsal','installation'])assert.deepEqual(projected.stage[phase].map(s=>s===plan.source217.afterCheck?guard:s),input[phase]);
 assert.equal(projected.stage.durableVerification,input.durableVerification);
 assert.throws(()=>projectOwnM7Census200Through217({plan,targetPlan:target,censusStage:{...input,preflight:[...input.preflight,guard]}}),/WHOLE_PREIMAGE/);
 assert.throws(()=>projectOwnM7Census200Through217({plan,targetPlan:target,censusStage:{...input,installation:input.installation.filter(s=>s!==guard)}}),/WHOLE_PREIMAGE/);
 assert.throws(()=>projectOwnM7Census200Through217({plan,targetPlan:plan.targets.find(t=>t.target.major===18),censusStage:input}),/TARGET_PREFIX_DRIFT/);
});
