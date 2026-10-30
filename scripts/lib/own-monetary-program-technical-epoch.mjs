// PRIVATE SOURCE PROPOSAL ONLY. No import, syntax check or execution admitted.
// All effects belong to the already guarded caller's synchronous native callbacks.
// This module owns no transport, seed, fixture, authority or cleanup.
import assert from 'node:assert/strict';
import {
 requireOwnMonetaryInstallationEpoch,
 assertOwnMonetaryInstallationDurability,
 assertOwnMonetaryInstallationRollback,
} from './own-monetary-program-guarded-installation.mjs';
import {assertOwnerAuthorityQaSourceBookend} from '../verify-municipal-owner-adoption-authority.mjs';

const VERSION='own-monetary-program-technical-epoch.v2';
const QA_VERSION='own-monetary-program-qa-projection.v2';
const INSTALL_VERSION='own-monetary-program-guarded-installation.v2';
const PHASE_ERROR='MONETARY_INSTALL_PHASE_CHANGED';
const HELPER_SIGNATURES=Object.freeze([
 'own_monetary_manifest_fields_v1(jsonb,text[],text[])',
 'own_monetary_manifest_reference_v1(jsonb)',
 'own_monetary_manifest_json_guard_v1(jsonb,integer,integer)',
 'own_monetary_manifest_hash_v1(jsonb)',
 'own_monetary_manifest_rounding_v1(jsonb)',
 'own_monetary_manifest_nodes_v1(jsonb,text,integer)',
 'own_monetary_manifest_verify_v1(jsonb)',
]);
const PHASES=Object.freeze(['rehearsal','installation','verification','repetition','rollback','rollbackVerification']);
const COUNTERS=Object.freeze({newTables:0,newFunctions:7,adaptedFunctions:2,businessWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0});
const RECEIPT_KEYS=Object.freeze(['version','sourceCommit','sourceHashes','operationalPairBaseline','noveltySuccession','mode',...Object.keys(COUNTERS),'transactionDataPreserved','preservationSha256','priorMetadataSha256','objectSha256'].sort());
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const OPTION_KEYS=Object.freeze(['check','expectRollback','foundation','json','qa','readFullSnapshot','setPhase','sourceCustody','technicalEpochs']);
const SOURCE_PINS=Object.freeze({
 'scripts/lib/own-monetary-program-qa-projection.mjs':'60cc7b6ad3a868b923b51b26c7361a25a12a062f715f8be77dbcd3483e50d837',
 'scripts/lib/own-monetary-program-guarded-installation.mjs':'0c55c03740a792e86061dbd8bcc05fb80969d46a5d2ca58969d5789532ecd243',
 'scripts/verify-municipal-owner-adoption-authority.mjs':'6194ab3f20092277c7b30c8a3c1fd7cb2bae3041ce8a3a63df107ea3b628cfeb',
});
const SELF_SOURCE='scripts/lib/own-monetary-program-technical-epoch.mjs';
function dataRecord(value,label){
 assert.ok(isObject(value),'MONETARY_TECHNICAL_DATA_RECORD_REQUIRED:'+label);
 for(const key of Reflect.ownKeys(value)){
  assert.equal(typeof key,'string','MONETARY_TECHNICAL_STRING_KEYS_REQUIRED:'+label);
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  assert.ok(Object.hasOwn(descriptor,'value')&&descriptor.enumerable,'MONETARY_TECHNICAL_DATA_FIELDS_REQUIRED:'+label);
 }
 return value;
}
function sourceHashMap(value,label,{repository=false}={}){
 dataRecord(value,label);const entries=Object.entries(value);
 assert.ok(entries.length>0&&entries.length<=1000,'MONETARY_TECHNICAL_SOURCE_SCOPE_REQUIRED:'+label);
 for(const[path,digest]of entries){
  assert.ok(path.length>0&&typeof digest==='string'&&/^[a-f0-9]{64}$/.test(digest),'MONETARY_TECHNICAL_SOURCE_HASH_REQUIRED:'+label);
  if(repository)assert.ok(/^[A-Za-z0-9_.\/-]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').includes('..')&&!path.includes('//'),'MONETARY_TECHNICAL_REPOSITORY_SOURCE_REQUIRED:'+path);
 }
 return Object.freeze(Object.fromEntries(entries));
}
function sourceCustodyState(value,qa){
 dataRecord(value,'sourceCustody');assert.deepEqual(Reflect.ownKeys(value).sort(),['closure','committedBytes','sourceCommit']);
 assert.equal(value.sourceCommit,qa.sourceCommit,'MONETARY_TECHNICAL_SOURCE_COMMIT_CHANGED');assert.equal(typeof value.committedBytes,'function','MONETARY_TECHNICAL_COMMITTED_BYTES_REQUIRED');
 assert.notEqual(Object.prototype.toString.call(value.committedBytes),'[object AsyncFunction]','MONETARY_TECHNICAL_SYNCHRONOUS_COMMITTED_BYTES_REQUIRED');
 const original=dataRecord(value.closure,'sourceClosure');assert.deepEqual(Reflect.ownKeys(original).sort(),['externalModules','externalParser','files']);
 const parser=dataRecord(original.externalParser,'externalParser');assert.deepEqual(Reflect.ownKeys(parser).sort(),['files','nodeVersion','repositorySource']);
 assert.equal(parser.repositorySource,false);assert.equal(typeof parser.nodeVersion,'string');
 assert.ok(Array.isArray(original.externalModules)&&original.externalModules.every(name=>typeof name==='string'),'MONETARY_TECHNICAL_EXTERNAL_MODULES_REQUIRED');
 const files=sourceHashMap(original.files,'files',{repository:true}),externalFiles=sourceHashMap(parser.files,'externalParser.files');
 for(const[path,expected]of Object.entries(SOURCE_PINS))assert.equal(files[path],expected,'MONETARY_TECHNICAL_SOURCE_PIN_CHANGED:'+path);
 dataRecord(qa.sourceHashes,'qa.sourceHashes');
 for(const path of[SELF_SOURCE,...Object.keys(qa.sourceHashes)])assert.ok(Object.hasOwn(files,path),'MONETARY_TECHNICAL_SOURCE_CLOSURE_INCOMPLETE:'+path);
 // Copy the host's prepared source closure once. No later callback may reseal
 // expectations from newly observed bytes or provide a Boolean verifier.
 const closure=Object.freeze({files,externalModules:Object.freeze([...original.externalModules]),externalParser:Object.freeze({nodeVersion:parser.nodeVersion,files:externalFiles,repositorySource:false})});
 return Object.freeze({closure,committedBytes:value.committedBytes,sourceCommit:value.sourceCommit});
}
function sourceBookend(state){
 // This is the real public FS/commit/parser/runtime validator. Only the native
 // host supplies committedBytes, closed over its already fixed sourceCommit.
 const proof=assertOwnerAuthorityQaSourceBookend(state.closure,{committedBytes:state.committedBytes});
 assert.deepEqual(Object.keys(proof).sort(),['committedBytesVerified','externalParserRawBookend','fileCount','passed','rawBytesVerified']);
 assert.equal(proof.passed,true);assert.equal(proof.fileCount,Object.keys(state.closure.files).length);
 assert.equal(proof.rawBytesVerified,true);assert.equal(proof.committedBytesVerified,true);assert.equal(proof.externalParserRawBookend,true);
 return Object.freeze({...proof});
}
function nativeObject(value,label){
 assert.ok(isObject(value),'MONETARY_TECHNICAL_NATIVE_OBJECT_REQUIRED:'+label);
 assert.notEqual(typeof value.then,'function','MONETARY_TECHNICAL_SYNCHRONOUS_CALLBACK_REQUIRED:'+label);
 return value;
}

// R3 has no exported one-receipt rehearsal validator. Check that exact source
// contract directly, without inventing a durable/repeated pair from rehearsal.
// These checks alone never prove COMMIT, rollback or cross-connection durability.
function rehearsalReceipt(value,batch){
 const receipt=nativeObject(value,'rehearsal');
 assert.equal(batch.version,INSTALL_VERSION,'MONETARY_INSTALL_BATCH_PROTOCOL_CHANGED');
 assert.deepEqual(Object.keys(receipt).sort(),RECEIPT_KEYS,'MONETARY_TECHNICAL_REHEARSAL_KEYS_CHANGED');
 assert.equal(receipt.version,INSTALL_VERSION,'MONETARY_INSTALL_RECEIPT_PROTOCOL_CHANGED');
 assert.equal(receipt.sourceCommit,batch.sourceCommit);
 assert.deepEqual(receipt.sourceHashes,batch.sourceHashes);
 assert.equal(receipt.operationalPairBaseline,batch.operationalPairBaseline);
 assert.equal(receipt.noveltySuccession,batch.noveltySuccession);
 assert.equal(receipt.mode,'install');assert.equal(receipt.transactionDataPreserved,true);
 for(const[key,expected]of Object.entries(COUNTERS))assert.equal(receipt[key],expected);
 for(const key of['preservationSha256','priorMetadataSha256','objectSha256'])assert.match(receipt[key],/^[a-f0-9]{64}$/);
}

// Both existing hosts return complete preservation fingerprints. Preserve every
// returned field; do not reduce the snapshot to a selected table or function.
function fullSnapshot(readFullSnapshot,label){
 const value=nativeObject(readFullSnapshot(),label);
 assert.ok(Object.hasOwn(value,'sha256')||Object.hasOwn(value,'fingerprint'),'MONETARY_TECHNICAL_FULL_SNAPSHOT_REQUIRED');
 for(const key of['sha256','fingerprint'])if(Object.hasOwn(value,key))assert.match(value[key],/^[a-f0-9]{64}$/);
 if(Object.hasOwn(value,'tables'))assert.ok(Number.isSafeInteger(value.tables)&&value.tables>=0,'MONETARY_TECHNICAL_SNAPSHOT_TABLE_COUNT_INVALID');
 return structuredClone(value);
}

function aclStatement(qa){
 const signatures=HELPER_SIGNATURES.map(signature=>qa.schema+'.'+signature);
 assert.ok(Array.isArray(qa.expectedQaMonetaryNewPins)&&qa.expectedQaMonetaryNewPins.length===7,'MONETARY_TECHNICAL_SEVEN_HELPER_PINS_REQUIRED');
 assert.deepEqual(qa.expectedQaMonetaryNewPins.map(pin=>pin.signature),signatures,'MONETARY_TECHNICAL_SEVEN_HELPER_SIGNATURES_REQUIRED');
 assert.ok(qa.expectedQaMonetaryNewPins.every(pin=>pin.runtime===false),'MONETARY_TECHNICAL_PRIVATE_HELPERS_REQUIRED');
 const rows=signatures.map((signature,index)=>'('+String(index)+','+q(signature)+')').join(',');
 return "SELECT jsonb_build_object('version','own-monetary-helper-acl.v1','helperCount',(SELECT count(*) FROM pg_proc WHERE pronamespace="+q(qa.schema)+"::regnamespace AND left(proname,22)='own_monetary_manifest_'),'helpers',(SELECT jsonb_agg(jsonb_build_object('signature',expected.signature,'exists',p.oid IS NOT NULL,'runtimeExecute',CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') END) ORDER BY expected.ordinal) FROM (VALUES "+rows+") expected(ordinal,signature) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature))) AS proof";
}
function assertAcl(receipt,qa,present){
 nativeObject(receipt,'private-helper-acl');
 assert.deepEqual(Object.keys(receipt).sort(),['helperCount','helpers','version']);
 assert.equal(receipt.version,'own-monetary-helper-acl.v1');assert.equal(receipt.helperCount,present?7:0);
 assert.deepEqual(receipt.helpers,HELPER_SIGNATURES.map(signature=>({signature:qa.schema+'.'+signature,exists:present,runtimeExecute:present?false:null})),'MONETARY_TECHNICAL_PRIVATE_HELPER_ACL_CHANGED');
}
function assertExpectedNativeFailure(value){
 const failure=nativeObject(value,'phase-negative');assert.equal(failure.status,3,'MONETARY_TECHNICAL_EXPECTED_NATIVE_FAILURE');
 if(Object.hasOwn(failure,'code')){assert.equal(failure.rejected,true);assert.equal(failure.code,PHASE_ERROR);}
 else{assert.equal(typeof failure.stderr,'string');assert.match(failure.stderr,new RegExp('\\b'+PHASE_ERROR+'\\b'));}
}

export function verifyOwnMonetaryProgramTechnicalEpoch(options){
 dataRecord(options,'options');assert.deepEqual(Reflect.ownKeys(options).sort(),OPTION_KEYS);
 const{qa,foundation,sourceCustody,technicalEpochs,json,expectRollback,readFullSnapshot,check,setPhase}=options;
 for(const callback of[json,expectRollback,readFullSnapshot,check,setPhase]){assert.equal(typeof callback,'function');assert.notEqual(Object.prototype.toString.call(callback),'[object AsyncFunction]','MONETARY_TECHNICAL_SYNCHRONOUS_CALLBACK_REQUIRED');}
 assert.equal(qa?.version,QA_VERSION,'MONETARY_TECHNICAL_QA_PROTOCOL_CHANGED');assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.match(qa.sourceCommit,/^[a-f0-9]{40}$/);assert.ok([17,18].includes(qa.major));assert.ok(['pre107','published107'].includes(qa.operationalPairBaseline));
 assert.equal(qa.run7Included,false);assert.equal(qa.projectionSourceDerived,true);assert.equal(qa.observedMetadataUsed,false);
 assert.equal(qa.canonicalPhaseArraysPreserved,true);assert.equal(qa.capabilitiesAdded,false);assert.equal(qa.permissionsAdded,false);
 assert.ok(qa.actor?.membershipId&&qa.checker?.membershipId);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId,'MONETARY_TECHNICAL_INDEPENDENT_ACTORS_REQUIRED');
 assert.equal(qa.monetaryFoundationMode,'existing','MONETARY_TECHNICAL_EXISTING_HOST_REQUIRED');dataRecord(foundation,'foundation');
 const host={foundation,actor:foundation.actor,checker:foundation.checker,major:qa.major,schema:qa.schema,sourceCommit:qa.sourceCommit,operationalPairBaseline:qa.operationalPairBaseline};
 const assertHost=()=>{
  assert.strictEqual(qa.qa192.qa,host.foundation,'MONETARY_TECHNICAL_FOUNDATION_CHANGED');
  assert.strictEqual(host.foundation.actor,host.actor,'MONETARY_TECHNICAL_HOST_ACTOR_CHANGED');assert.strictEqual(host.foundation.checker,host.checker,'MONETARY_TECHNICAL_HOST_CHECKER_CHANGED');
  assert.strictEqual(qa.actor,host.actor,'MONETARY_TECHNICAL_ACTOR_CHANGED');assert.strictEqual(qa.checker,host.checker,'MONETARY_TECHNICAL_CHECKER_CHANGED');
  assert.strictEqual(qa.qa192.actor,host.actor,'MONETARY_TECHNICAL_192_ACTOR_CHANGED');assert.strictEqual(qa.qa192.checker,host.checker,'MONETARY_TECHNICAL_192_CHECKER_CHANGED');
  for(const key of['major','schema','sourceCommit','operationalPairBaseline']){assert.equal(qa[key],host[key],'MONETARY_TECHNICAL_QA_CONTEXT_CHANGED:'+key);assert.equal(host.foundation[key],host[key],'MONETARY_TECHNICAL_HOST_CONTEXT_CHANGED:'+key);}
  assert.equal(qa.monetaryFoundationMode,'existing');assert.equal(host.foundation.connects,false);assert.equal(host.foundation.executesSql,false);
 };
 assertHost();const custody=sourceCustodyState(sourceCustody,qa);
 const batch=qa.monetaryInstallation,local=qa.localMonetary;
 assert.equal(batch?.version,INSTALL_VERSION,'MONETARY_INSTALL_BATCH_PROTOCOL_CHANGED');assert.equal(batch.sourceCommit,qa.sourceCommit);assert.equal(batch.operationalPairBaseline,qa.operationalPairBaseline);
 assert.equal(batch.run7Included,false);assert.equal(typeof batch.noveltySuccession,'boolean');assert.equal(!!qa.novelty197,batch.noveltySuccession);
 assert.equal(batch.requiredBeforeRunnerLine,58);assert.equal(batch.requiredAfterRunnerLine,77);
 for(const phase of PHASES){assert.ok(Array.isArray(local?.[phase])&&local[phase].length>0&&local[phase].every(statement=>typeof statement==='string'),'MONETARY_TECHNICAL_LOCAL_PHASE_REQUIRED:'+phase);assert.equal(local[phase].length,batch[phase].length,'MONETARY_TECHNICAL_PHASE_COUNT_CHANGED');}
 // This is the real R3 gate over canonical196/197 reinstallation proofs from
 // runner77. There is no injected validator or Boolean approval callback here.
 requireOwnMonetaryInstallationEpoch({technicalEpochs,batch});
 const aclSql=aclStatement(qa),proofs={};
 const sourceCalls=[],initialSourceBookend=sourceBookend(custody);
 const sqlCallback=(kind,label,invoke)=>{
  assertHost();const before=sourceBookend(custody);let value,callbackFailure,failed=false;
  try{value=nativeObject(invoke(),label);}catch(error){callbackFailure=error;failed=true;}
  let after;
  try{after=sourceBookend(custody);assertHost();}catch(sourceFailure){
   if(failed)throw new AggregateError([callbackFailure,sourceFailure],'MONETARY_TECHNICAL_CALLBACK_AND_SOURCE_FAILURE',{cause:callbackFailure});
   throw sourceFailure;
  }
  sourceCalls.push({sequence:sourceCalls.length+1,kind,label,before,after,callbackOutcome:failed?'threw':'returned'});
  if(failed)throw callbackFailure;
  return value;
 };
 const snapshot=label=>fullSnapshot(()=>sqlCallback('readFullSnapshot',label,readFullSnapshot),label);
 const sameSnapshot=(baseline,label)=>assert.deepEqual(snapshot(label),baseline,'MONETARY_TECHNICAL_FULL_STATE_CHANGED:'+label);
 const nativeJson=(statements,settings,label)=>sqlCallback('json',label,()=>json(statements,settings));

 setPhase('monetary-rehearsal-rollback');
 const predecessorBaseline=snapshot('predecessor-baseline');
 proofs.rehearsal=nativeJson(local.rehearsal,{end:'ROLLBACK'},'rehearsal');rehearsalReceipt(proofs.rehearsal,batch);
 sameSnapshot(predecessorBaseline,'after-rehearsal-rollback');

 setPhase('monetary-installation');
 const installed=nativeJson(local.installation,{},'installation'),initialInstalledBaseline=snapshot('initial-installed-baseline');
 setPhase('monetary-durable-readonly');const durable=nativeJson(local.verification,{readOnly:true},'durable');
 setPhase('monetary-repetition');const repeated=nativeJson(local.repetition,{},'repetition');
 const firstDurability=assertOwnMonetaryInstallationDurability({installed,durable,repeated,batch});assert.equal(firstDurability.passed,true);
 proofs.initial={installed,durable,repeated,durability:firstDurability};sameSnapshot(initialInstalledBaseline,'after-initial-durable-repeat');
 setPhase('monetary-private-helper-acl');proofs.initialPrivateHelperAcl=nativeJson([aclSql],{readOnly:true},'initial-private-helper-acl');assertAcl(proofs.initialPrivateHelperAcl,qa,true);sameSnapshot(initialInstalledBaseline,'after-initial-acl');

 setPhase('monetary-phase-negative');
 proofs.phaseNegative=sqlCallback('expectRollback','phase-negative',()=>expectRollback(local.installation,PHASE_ERROR));assertExpectedNativeFailure(proofs.phaseNegative);sameSnapshot(initialInstalledBaseline,'after-phase-negative');
 check(firstDurability.passed,'monetary rehearsal rollback, native installation/durable/repetition, exact private ACL and phase rejection preserve the full installed epoch');

 setPhase('monetary-no-history-rollback');const rolledBack=nativeJson(local.rollback,{},'rollback');
 setPhase('monetary-rollback-durable-readonly');const rollbackDurable=nativeJson(local.rollbackVerification,{readOnly:true},'rollback-durable');
 const rollback=assertOwnMonetaryInstallationRollback({rolledBack,durable:rollbackDurable,batch});assert.equal(rollback.passed,true);
 proofs.rollback={rolledBack,durable:rollbackDurable,rollback};sameSnapshot(predecessorBaseline,'after-no-history-rollback');
 setPhase('monetary-rollback-helper-absence');proofs.rollbackHelperAbsence=nativeJson([aclSql],{readOnly:true},'rollback-helper-absence');assertAcl(proofs.rollbackHelperAbsence,qa,false);sameSnapshot(predecessorBaseline,'after-rollback-absence-read');

 // Dropped/recreated helpers get new physical identities. Compare only inside
 // this new installation epoch; never compare its object SHA to rehearsal or
 // the first install to conceal legitimate OID changes.
 setPhase('monetary-reinstallation');const reinstalled=nativeJson(local.installation,{},'reinstallation'),reinstalledBaseline=snapshot('reinstalled-baseline');
 setPhase('monetary-reinstallation-durable-readonly');const durableReinstalled=nativeJson(local.verification,{readOnly:true},'reinstalled-durable');
 setPhase('monetary-reinstallation-repetition');const repeatedReinstalled=nativeJson(local.repetition,{},'reinstalled-repetition');
 const reinstallationDurability=assertOwnMonetaryInstallationDurability({installed:reinstalled,durable:durableReinstalled,repeated:repeatedReinstalled,batch});assert.equal(reinstallationDurability.passed,true);
 proofs.reinstalled={installed:reinstalled,durable:durableReinstalled,repeated:repeatedReinstalled,durability:reinstallationDurability};sameSnapshot(reinstalledBaseline,'after-reinstalled-durable-repeat');
 setPhase('monetary-reinstalled-private-helper-acl');proofs.reinstalledPrivateHelperAcl=nativeJson([aclSql],{readOnly:true},'reinstalled-private-helper-acl');assertAcl(proofs.reinstalledPrivateHelperAcl,qa,true);sameSnapshot(reinstalledBaseline,'after-reinstalled-acl');
 proofs.fullSnapshots={predecessor:predecessorBaseline,initialInstalled:initialInstalledBaseline,reinstalled:reinstalledBaseline};
 check(rollback.passed&&reinstallationDurability.passed,'monetary no-history rollback restores FULL predecessor state; new-epoch native reinstall/durable/repeat and seven private helpers pass without business writes');
 assertHost();const finalSourceBookend=sourceBookend(custody);
 proofs.sourceBookends={version:'own-monetary-sql-callback-source-bookends.v1',sourceCommit:custody.sourceCommit,closure:custody.closure,initial:initialSourceBookend,calls:sourceCalls,final:finalSourceBookend};
 return{version:VERSION,passed:true,proofs,canonicalFoundationReused:true,sourceBookendBeforeAndAfterEverySqlCallback:true,canonicalPredecessorEpochRequired:true,fullSnapshotsCompared:true,wholeDatabaseStaticAcrossConnections:false,technicalWritesOnly:true,businessWrites:0,iamWrites:0,permissionsAdded:0,newTransport:false,newFixture:false,newSeed:false,monetaryProgrammeApproved:false,payrollCalculated:false,payrollPosted:false,sourcePromotionAdmitted:false,complete:false};
}
