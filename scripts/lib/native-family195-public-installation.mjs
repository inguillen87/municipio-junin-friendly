// Initial public195 schema only. Reuses canonical195 source and the reviewed pg driver.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareNativeFamily195PublicMaterialPreflight,classifyNativeFamily195PublicMaterialPreflight,nativeFamily195PublicSourcePlan} from './native-family195-public-preflight.mjs';
import {assertNativeFamilySelfService195Durability} from './native-family-self-service-195-installation.mjs';
import {OWN_RELEASE_TARGETS} from './own-payroll-release-target.mjs';
import {ownInstallationSettings,ownInstallationDestination} from '../prepare-own-payroll-installation.mjs';
import {ownReleaseAnnulmentClient,ownReleasePgDependencySource,ownReleaseErrorObservation,ownReleaseReceiptObservation} from './own-payroll-release-annulment-pg.mjs';
const VERSION='native-family195-public-installation.v1';
const LATE_FAILURE='FAMILY_SELF195_REHEARSAL_LATE_FAILURE';
const slots=Object.freeze(['epoch','rehearsal','installation','durable','repetition']);
const plans=new WeakMap(),hash=v=>createHash('sha256').update(v).digest('hex');
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
const own=(value,key)=>{const d=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):null;return d&&Object.hasOwn(d,'value')?d.value:undefined;};
const exact=(value,keys)=>assert.deepEqual(Object.keys(value).sort(),[...keys].sort());
const nativeEqual=(a,b)=>a&&b&&a.pid===b.pid&&a.backendStart===b.backendStart&&a.serverVersionNum===b.serverVersionNum;
const contextGuard=readOnly=>"DO $family195_context$ BEGIN IF current_setting('transaction_read_only')<>"+(readOnly?"'on'":"'off'")+" OR current_setting('transaction_isolation')<>'repeatable read' OR current_setting('standard_conforming_strings')<>'on' THEN RAISE EXCEPTION 'FAMILY195_PUBLIC_TRANSACTION_REQUIRED';END IF;END $family195_context$";
const prefix=(target,readOnly)=>[...ownInstallationSettings,ownInstallationDestination(target),"SET LOCAL search_path=pg_catalog, public, pg_temp",contextGuard(readOnly)];

// Requires the actual, reviewed build-observation bytes. A boolean or an old SHA
// cannot stand in for the two normal build clients on the selected branch.
export function assertNativeFamily195BuildBinding({raw,sha256,sourceCommit,target}){
 assert.ok(Buffer.isBuffer(raw),'FAMILY195_BINDING_RAW_REQUIRED');assert.match(sha256,/^[a-f0-9]{64}$/);assert.equal(hash(raw),sha256,'FAMILY195_BINDING_BYTES_CHANGED');
 const r=JSON.parse(raw.toString('utf8'));assert.equal(r.version,'vercel-normal-build-binding-observation.v1');assert.equal(r.sourceCommit,sourceCommit,'FAMILY195_BINDING_SOURCE_CHANGED');assert.match(r.deploymentId,/^dpl_[A-Za-z0-9]+$/);
 for(const key of ['deploymentReadyObserved','effectiveBuildCommandObserved','builtinShaMatchedByPinnedVerifier','normalBuildEnvironment','applicationClientsUseSamePg17Branch'])assert.equal(r[key],true,'FAMILY195_BINDING_REQUIRED:'+key);
 assert.equal(r.applicationClientsObserved,2);assert.equal(r.metadataSqlOnly,true);assert.equal(r.metadataSelects,2);for(const key of ['ddl','dml','municipalOperations'])assert.equal(r[key],0);
 assert.equal(r.pg18ApplicationBindingObserved,false);assert.ok(Array.isArray(r.records)&&r.records.length===3);
 const observations=r.records.map(x=>x.value).filter(x=>x.event==='observation');assert.equal(observations.length,2);
 assert.deepEqual(observations.map(x=>x.clientClass).sort(),['ACTIONS_DATABASE_URL','DATABASE_URL']);
 for(const item of observations){
  assert.equal(item.version,'municontrol-vercel-build-db-attestation.v1');assert.equal(item.sourceSha,sourceCommit);assert.equal(item.environment,'production');assert.equal(item.serverMajor,17);
  for(const [key,value]of Object.entries({database:target.database,neonProjectId:target.projectId,neonBranchId:target.branchId,neonEndpointId:target.endpointId,transactionReadOnly:'on',neonIdentityComplete:true}))assert.equal(item[key],value,'FAMILY195_BINDING_DESTINATION:'+key);
  const role=item.clientClass==='DATABASE_URL'?target.role:'municontrol_actions_runtime_app';assert.equal(item.currentUser,role);assert.equal(item.sessionUser,role);
 }
 const completed=r.records.map(x=>x.value).filter(x=>x.event==='complete');assert.equal(completed.length,1);assert.equal(completed[0].version,'municontrol-vercel-build-db-attestation.v1');assert.equal(completed[0].sourceSha,sourceCommit);assert.equal(completed[0].environment,'production');assert.equal(completed[0].clientsObserved,2);assert.equal(completed[0].neonIdentityComplete,true);assert.equal(completed[0].observationOnly,true);
 return Object.freeze({receiptSha256:sha256,deploymentId:r.deploymentId,sourceCommit,major:17,applicationClientsObserved:2,exactBuildReceiptValidated:true,schemaReadinessProved:false,productionDomainPromoted:false});
}
export function prepareNativeFamily195PublicInstallation({read,sourceCommit}){
 const preflight=prepareNativeFamily195PublicMaterialPreflight({read,sourceCommit,major:17});
 const {batch,layoutGuard}=nativeFamily195PublicSourcePlan(preflight),target=OWN_RELEASE_TARGETS.find(t=>t.major===17);
 const dependencySource=ownReleasePgDependencySource({packageJson:read('package.json'),packageLock:read('package-lock.json')});
 const phases={
  preflight:[...prefix(target,true),...preflight.statements],
  rehearsal:[...prefix(target,false),layoutGuard,...batch.rehearsalLateFailure],
  installation:[...prefix(target,false),layoutGuard,...batch.installation],
  durable:[...prefix(target,true),...batch.durableVerification],
  // Verification-only repetition: CREATE195 is never repeated.
  repetition:[...prefix(target,true),...batch.durableVerification]
 };
 const plan=freeze({version:VERSION,sourceCommit,major:17,target:{...target},dependencySource,sourceHashes:{...preflight.sourceHashes},
  layout:preflight.layout,phases,proofContract:{version:batch.version,sourceCommit:batch.sourceCommit,sourceHashes:batch.sourceHashes,sql195Sha256:batch.sql195Sha256,fixed:batch.fixed},
  readOnlyTransactionEnd:'COMMIT',readOnlyRollbackObserved:false,rehearsalExpectedError:LATE_FAILURE,repetitionKind:'read-only-verification',
  connects:false,executesSql:false,roleAssignmentsAdded:0,existingAclChanges:0,businessOperations:0,nominalRowsReturned:0,productionAdmission:false});
 plans.set(plan,{preflight,batch,target});return plan;
}
function sourcePlan(plan){const r=plans.get(plan);assert.ok(r,'FAMILY195_PUBLIC_SOURCE_PLAN_REQUIRED');return r;}
function column(rows,name){const found=rows.flatMap(row=>row).filter(row=>row&&Object.hasOwn(row,name));assert.equal(found.length,1,'FAMILY195_PUBLIC_RESULT_REQUIRED:'+name);return found[0][name];}
function initial(contract,rows){
 const observation=column(rows,'observation'),layout=column(rows,'layout');
 const classified=classifyNativeFamily195PublicMaterialPreflight(contract.preflight,observation,layout);
 assert.equal(classified.status,'INITIAL_INSTALL_CANDIDATE','FAMILY195_PUBLIC_INITIAL_WINDOW_CLOSED');assert.equal(classified.prerequisiteTableLayoutReviewRequired,false,'FAMILY195_PUBLIC_LAYOUT_REVIEW_REQUIRED');
 // Only metadata digest and closed classification leave memory.
 return {digest:ownReleaseReceiptObservation({observation,layout}),summary:{status:classified.status,layoutMismatches:classified.layoutMismatches.length,layoutPending:classified.layoutPending,prerequisiteFunctionCount:13,prerequisiteTables:8}};
}
function installedShape(receipt,batch){
 exact(receipt,['version','sourceCommit','sourceHashes','sql195Sha256',...Object.keys(batch.fixed),'beforeFingerprint','priorFingerprint','objectFingerprint','prerequisiteFingerprint']);
 assert.equal(receipt.version,batch.version);assert.equal(receipt.sourceCommit,batch.sourceCommit);assert.deepEqual(receipt.sourceHashes,batch.sourceHashes);assert.equal(receipt.sql195Sha256,batch.sql195Sha256);
 for(const [key,value]of Object.entries(batch.fixed))assert.equal(receipt[key],value,key);
 for(const key of ['beforeFingerprint','priorFingerprint','objectFingerprint','prerequisiteFingerprint'])assert.match(receipt[key],/^[a-f0-9]{64}$/);
 assert.equal(receipt.beforeFingerprint,receipt.priorFingerprint,'FAMILY195_PUBLIC_PRIOR_CHANGED');return receipt;
}
function dedicated(bundle,target){
 assert.equal(bundle.version,'own-release-annulment-dedicated-pg.v1');assert.equal(typeof bundle.transaction,'function');assert.equal(typeof bundle.close,'function');
 for(const [key,value]of Object.entries(target))assert.equal(bundle.target[key],value,'FAMILY195_PUBLIC_TARGET_CHANGED:'+key);
 assert.equal(bundle.target.transport,'postgres_tls_dedicated');assert.deepEqual(Object.keys(bundle.identities).sort(),[...slots].sort());assert.equal(bundle.tlsObservations.length,5);
 const keys=[];for(const slot of slots){const n=bundle.identities[slot];assert.ok(Number.isSafeInteger(n.pid)&&n.pid>0);assert.match(n.backendStart,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/);assert.match(n.serverVersionNum,/^17\d{4}$/);keys.push(n.pid+':'+n.backendStart);
  const tls=bundle.tlsObservations.filter(x=>x.slot===slot);assert.equal(tls.length,1);assert.equal(tls[0].ssl,true);assert.ok(nativeEqual(tls[0].native,n));}
 assert.equal(new Set(keys).size,5,'FAMILY195_PUBLIC_FIVE_BACKENDS_REQUIRED');
}
function expectedRehearsal(error,bundle){
 const owned=own(error,'ownDedicatedSession');return own(error,'code')==='P0001'&&own(error,'message')===LATE_FAILURE&&owned&&own(owned,'slot')==='rehearsal'&&own(owned,'sessionTerminated')===true&&nativeEqual(own(owned,'native'),bundle.identities.rehearsal);
}
// DI is only for unit tests. The executable entry point supplies no alternative
// client; native identity/TLS and exact source statements remain checked here.
export async function executeNativeFamily195PublicInstallation({plan,bindingRaw,bindingSha256,record,client=ownReleaseAnnulmentClient}){
 const contract=sourcePlan(plan);assert.equal(typeof record,'function');assert.equal(typeof client,'function');
 const binding=assertNativeFamily195BuildBinding({raw:bindingRaw,sha256:bindingSha256,sourceCommit:plan.sourceCommit,target:contract.target});
 const state={version:VERSION,sourceCommit:plan.sourceCommit,major:17,phase:'before-client',state:'PENDING',binding,
  liveTransport:client===ownReleaseAnnulmentClient,readOnlyTransactionEnd:'COMMIT',readOnlyRollbackObserved:false,rehearsalRollbackCommandObserved:false,
  preflight:false,rehearsed:false,installed:false,durableObserved:false,repeated:false,durabilityVerified:false,
  roleAssignmentsAdded:0,existingAclChanges:0,businessOperations:0,nominalRowsReturned:0,automaticRetry:false,noeliaReady:false};
 let bundle,failed=null;
 try{
  record(state);bundle=await client(17,{dependencySource:plan.dependencySource});dedicated(bundle,contract.target);
  state.nativeBackends={...bundle.identities};record(state);
  state.phase='preflight';record(state);const before=initial(contract,await bundle.transaction('epoch',plan.phases.preflight,{readOnly:true}));Object.assign(state,{preflight:true,preflightObservation:before});record(state);
  state.phase='rehearsal';record(state);let error=null;
  try{await bundle.transaction('rehearsal',plan.phases.rehearsal,{readOnly:false});}catch(cause){error=cause;}
  if(error){state.rehearsalError=ownReleaseErrorObservation(error);record(state);}
  assert.ok(expectedRehearsal(error,bundle),'FAMILY195_PUBLIC_REHEARSAL_UNCERTAIN_NO_FURTHER_SQL');
  // Exact source late exception + owned session Terminate allow one independent
  // RO readback. No ROLLBACK command is claimed or sent by the coordinator.
  state.rehearsalExpectedErrorObserved=true;state.rehearsalMessageToken=LATE_FAILURE;state.rehearsalSessionTerminated=true;state.phase='rehearsal-readback';record(state);
  const after=initial(contract,await bundle.transaction('epoch',plan.phases.preflight,{readOnly:true}));assert.deepEqual(after.digest,before.digest,'FAMILY195_PUBLIC_REHEARSAL_STATE_CHANGED');
  Object.assign(state,{rehearsed:true,rehearsalReadback:after});record(state);
  state.phase='installation';record(state);const installedRows=await bundle.transaction('installation',plan.phases.installation,{readOnly:false});
  const installedRaw=column(installedRows,'proof');state.installationObservation=ownReleaseReceiptObservation(installedRaw);record(state);
  const installed=installedShape(installedRaw,contract.batch);Object.assign(state,{installed:true,installedProof:installed});record(state);
  // Initial layout is intentionally NOT rerun here:195 adds the source-pinned
  // inbound blob FK. The original195 durable verifier audits that addition.
  state.phase='durable';record(state);const durableRows=await bundle.transaction('durable',plan.phases.durable,{readOnly:true});
  const durable=column(durableRows,'proof');state.durableObservation=ownReleaseReceiptObservation(durable);record(state);
  const validation=assertNativeFamilySelfService195Durability({installed,durable,batch:contract.batch});
  Object.assign(state,{durableObserved:true,installedProof:installed,durableProof:durable,validation});record(state);
  state.phase='repetition-verification';record(state);const repeatedRows=await bundle.transaction('epoch',plan.phases.repetition,{readOnly:true});
  const repeated=column(repeatedRows,'proof');state.repetitionObservation=ownReleaseReceiptObservation(repeated);record(state);
  assertNativeFamilySelfService195Durability({installed,durable:repeated,batch:contract.batch});assert.deepEqual(repeated,durable);
  Object.assign(state,{repeated:true,repeatedProof:repeated,durabilityVerified:true});
 }catch(error){failed=error;Object.assign(state,{state:'UNCERTAIN',noFurtherSql:true,noCleanup:true,automaticRetry:false,failure:ownReleaseErrorObservation(error)});try{record(state);}catch{}}
 if(bundle){try{await bundle.close();state.ownedSessionsClosed=true;}catch(error){if(!failed)failed=error;Object.assign(state,{state:'UNCERTAIN',noFurtherSql:true,noCleanup:true,closeFailure:ownReleaseErrorObservation(error)});try{record(state);}catch{}}}
 if(failed){const error=Error('FAMILY195_PUBLIC_INSTALL_UNCERTAIN',{cause:failed});error.uncertain=true;error.noFurtherSql=true;throw error;}
 Object.assign(state,{phase:'complete',state:'VALIDATED'});record(state);return state;
}
