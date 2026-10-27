// Unit transport fixtures only. No receipt/admission/native execution is claimed.
import {executeOwnM7PublicAnnulmentTail} from '../../scripts/lib/own-m7-public-annulment208209.mjs';
import {composeOwnM7PublicNovelty217} from '../../scripts/lib/own-m7-public-novelty217-source.mjs';
import {publicPrerequisiteDefinitions} from '../../scripts/lib/own-m7-public-schema-batch.mjs';
export async function mockedCompleteM7Tail(batch,major=17){
 const pair=batch.targets.find(t=>t.major===major).stageBatches.annul208209,specs=[...pair.review208.faults.map(fault=>({stage:pair.review208,fault})),{stage:pair.review208},...pair.preparation209.faults.map(fault=>({stage:pair.preparation209,fault})),{stage:pair.preparation209}];let n=0;
 const client=async()=>{
  const {stage,fault}=specs[n++],identities=Object.fromEntries(['epoch','rehearsal','installation','durable','repetition'].map((slot,i)=>[slot,{pid:100+n*10+i,backendStart:'2026-10-27T00:00:00.000001+00:00',serverVersionNum:String(major*10000+11)}]));
  const prior=(stage.stage===208?'1':'3').repeat(64),object=(stage.stage===208?'2':'4').repeat(64);
  const proof=slot=>{const value={version:stage.stage===208?'own-annulment-review208-installation-proof.v1':'own-annul-preparation209-installation-proof.v1',sourceCommit:batch.sourceCommit,sourceSqlSha256:stage.sourceHashes[stage.stage===208?'scripts/migrations/208-own-annulment-review-index.sql':'scripts/migrations/209-own-annulment-preparation-projection.sql'],sourceHashes:stage.sourceHashes,predecessorPinsSha256:stage.predecessorPinsSha256,mode:slot==='durable'||slot==='repetition'?'verify':'install',newFunctions:stage.stage===208?7:3,privateHelpers:stage.stage===208?3:1,runtimeFacades:stage.stage===208?4:2,newTables:0,adaptedFunctions:0,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,transactionDataPreserved:slot!=='durable',priorStateSha256:prior,objectSha256:object,native:identities[slot]};if(slot!=='durable')value.beforeStateSha256=prior;if(stage.stage===209)value.epoch208PriorStateSha256='1'.repeat(64);return value;};
  const bundle={version:'own-release-annulment-dedicated-pg.v1',target:{...pair.target,transport:'postgres_tls_dedicated'},identities,tlsObservations:Object.entries(identities).map(([slot,native])=>({slot,ssl:true,native})),credentialsExposed:false,automaticRetry:false,close:async()=>{}};
  bundle.transaction=async(slot,sql)=>{
   if(slot==='epoch'){
    if(sql.at(-1).includes('own-annulment-review208-function-bookend.v1'))return [[{proof:{version:'own-annulment-review208-function-bookend.v1',sourceCommit:batch.sourceCommit,sourceSqlSha256:pair.review208.sourceHashes['scripts/migrations/208-own-annulment-review-index.sql'],predecessorPinsSha256:pair.review208.predecessorPinsSha256,objectSha256:'2'.repeat(64)}}]];
    return [[{epoch:{version:'public-annul-source-epoch.v1',stage:stage.stage,sourceCommit:batch.sourceCommit,sourceHashes:stage.sourceHashes,predecessorPinsSha256:stage.predecessorPinsSha256,priorStateSha256:prior,newFunctions:0,native:identities.epoch}}]];
   }
   if(slot==='rehearsal'){const error=Object.assign(Error(fault?.code??stage.rehearsalFault.code),{code:'P0001'});if(!fault)error.detail=JSON.stringify({version:'public-annul-native-rehearsal-detail.v1',stage:stage.stage,sourceCommit:batch.sourceCommit,proof:proof(slot)});Object.defineProperty(error,'ownDedicatedSession',{value:{slot,native:identities[slot],sessionTerminated:true}});throw error;}
   return [[{proof:proof(slot)}]];
  };return bundle;
 };
 return executeOwnM7PublicAnnulmentTail({batch,major,client,record:()=>{}});
}
export function mocked217And201({batch,read,major=17}){
 const p=composeOwnM7PublicNovelty217({read,sourceCommit:batch.sourceCommit,operationalPairBaseline:'published107',prerequisites:publicPrerequisiteDefinitions(read)}),b=p.source217,target={...p.targets.find(t=>t.target.major===major).target,transport:'neon_https',postgresSsl:true};
 const installed={version:b.version,sourceCommit:batch.sourceCommit,sourceHashes:b.sourceHashes,mode:'install',...b.counters,transactionDataPreserved:true,preservationSha256:'5'.repeat(64),priorMetadataSha256:'6'.repeat(64),objectSha256:'7'.repeat(64)},durable={...installed,mode:'verify',transactionDataPreserved:false},repeated={...installed,mode:'verify'};
 const base={sourceCommit:batch.sourceCommit,target,state:'VALIDATED',phase:'complete',preflight:true,rehearsed:true,installed:true,durableObserved:true,durabilityVerified:true,businessOperations:0,nominalRowsReturned:0,automaticRetry:false,validation:{fixture:true},nativeEquivalencePublicIncluded:false};
 const r217={...base,stage:'novelty217',version:b.version,repeated:true,installedProof:installed,durableProof:durable,repeatedProof:repeated,validatedReceiptCount:3};
 const proof201={version:'own-full-capacity-canonical190-installation.v1',sourceCommit:batch.sourceCommit,sourceSqlSha256:p.capacity201.sourceSqlSha256,priorStateSha256:'8'.repeat(64),priorStatePreserved:true,existingFunctionMetadataPreserved:true,businessWrites:0,newFunctions:16,adaptedFunctions:9,changedChecks:3};
 const boundary=epoch=>({version:'novelty217-capacity201-bookend.v1',sourceCommit:batch.sourceCommit,sourceHashes:p.bookend.sourceHashes,capacity201SourceSha256:p.capacity201.sourceSqlSha256,epoch,functions:3,newFunctions:0,adaptedFunctions:0,newTables:0,iamWrites:0,businessWrites:0,objectSha256:installed.objectSha256});
 const r201={...base,stage:'capacity201',version:p.capacity201.version,repeated:false,installedProof:proof201,durableProof:{...proof201},validatedReceiptCount:2,novelty217Before201Proof:boundary('pre201'),novelty217After201Proof:boundary('post201'),novelty217BoundaryReceiptCount:2};return {r217,r201};
}
