// SOURCE/DI only. This protocol does not connect, obtain credentials, execute a
// real query or admit production. Native provenance and saved-byte custody are
// separate obligations; a structurally valid DI observation cannot supply them.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertOwnM7Annul208209AtomicSource,bookendOwnM7Annul208209AtomicSource} from './own-m7-annul208209-atomic-source.mjs';
import {buildOwnAnnulmentLedgerContract} from './own-annulment-ledger-contract.mjs';
import {buildOwnAnnulmentAtomicPreservation} from './own-annulment-atomic-preservation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationDestination} from '../prepare-own-payroll-installation.mjs';
import {ownReleaseErrorObservation} from './own-payroll-release-annulment-pg.mjs';
import {ownReleaseAnnulmentAtomicFailureObservation} from './own-payroll-release-annulment-atomic-pg.mjs';

export const OWN_M7_ANNUL208209_ATOMIC_PROTOCOL_VERSION='own-m7-annul208209-atomic-protocol.v2';
export const OWN_M7_ANNUL208209_ATOMIC_PROTOCOL_SLOTS=Object.freeze(['epoch','rehearsal','rollbackObserver','installation','durable']);
const FILE='scripts/lib/own-m7-annul208209-atomic-protocol.mjs',TARGET_FILE='scripts/lib/own-payroll-release-target.mjs';
const TARGET_SHA='85c1f346424ee97279434701245bb50bf819850a3114405d0647fe846721d448';
const HELPER_FILES=['scripts/lib/own-annulment-ledger-contract.mjs','scripts/lib/own-annulment-ledger-trigger-profile.mjs','scripts/lib/own-annulment-atomic-preservation.mjs','scripts/prepare-own-payroll-installation.mjs','scripts/lib/own-payroll-release-annulment-atomic-pg.mjs','scripts/lib/own-payroll-release-annulment-pg.mjs'];
const LEDGER_PROFILE='positions128129-adopted.v2';
const ADAPTER_PINS=Object.freeze({'scripts/lib/own-payroll-release-annulment-atomic-pg.mjs':'7f7cfb6500edef5a144a5370a9998b7afa08893e6b25d882cdc0841ede8d8456','scripts/lib/own-payroll-release-annulment-pg.mjs':'78ea06c3debc74dc5b577e33a73a31687ef18ddab97cb31cfafbe39e5cd01840'});
const PRODUCTION_TARGETS=Object.freeze([
 Object.freeze({major:17,projectId:'noisy-poetry-54471701',branchId:'br-plain-dust-acpjgebb',database:'neondb',role:'neondb_owner',guardOid:532699,host:'ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech',endpointId:'ep-shiny-cherry-actlyudg'}),
 Object.freeze({major:18,projectId:'wild-cake-87689498',branchId:'br-plain-dawn-ac8crb1h',database:'neondb',role:'neondb_owner',guardOid:24740,host:'ep-falling-rain-aca27ph1.sa-east-1.aws.neon.tech',endpointId:'ep-falling-rain-aca27ph1'}),
]);
const HASH=/^[a-f0-9]{64}$/,START=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const targetKeys=Object.keys(PRODUCTION_TARGETS[0]),nativeKeys=['pid','backendStart','serverVersionNum'];
const slots=OWN_M7_ANNUL208209_ATOMIC_PROTOCOL_SLOTS,readOnly={epoch:true,rehearsal:false,rollbackObserver:true,installation:false,durable:true};
const PRIOR='__OWN_ANNUL_ATOMIC_PRIOR_CATALOG_SHA256__',plans=new WeakMap(),records=new WeakMap();
const sha=value=>createHash('sha256').update(value).digest('hex'),q=value=>"'"+String(value).replaceAll("'","''")+"'";
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const copy=value=>structuredClone(value),nativeKey=value=>value.pid+':'+value.backendStart;
const suffix=target=>target.kind==='test'?'+test':'',version=(stem,target)=>stem+suffix(target);
function mergeHashes(...maps){const result={};for(const map of maps)for(const[file,digest]of Object.entries(map)){assert.match(digest,HASH);if(Object.hasOwn(result,file))assert.equal(result[file],digest,'ATOMIC_PROTOCOL_SOURCE_CONFLICT:'+file);result[file]=digest;}return result;}
function targetOf(value,major){
 const base=PRODUCTION_TARGETS.find(target=>target.major===major);assert.ok(base,'ATOMIC_PROTOCOL_MAJOR');
 assert.ok(value&&['production','test'].includes(value.kind),'ATOMIC_PROTOCOL_TARGET_KIND');
 exact(value,[...targetKeys,'kind',...(value.kind==='test'?['parentBranchId']:[])],'ATOMIC_PROTOCOL_TARGET_FIELDS');
 if(value.kind==='production')assert.deepEqual(value,{...base,kind:'production'},'ATOMIC_PROTOCOL_PRODUCTION_TARGET');
 else{
  for(const key of ['major','projectId','database','role','guardOid'])assert.equal(value[key],base[key],'ATOMIC_PROTOCOL_TEST_BASE:'+key);
  assert.equal(value.parentBranchId,base.branchId,'ATOMIC_PROTOCOL_TEST_PARENT');assert.match(value.branchId,/^br-[a-z0-9-]+$/);assert.match(value.endpointId,/^ep-[a-z0-9-]+$/);
  assert.equal(value.host,value.endpointId+base.host.slice(base.host.indexOf('.')),'ATOMIC_PROTOCOL_TEST_HOST');
  for(const production of PRODUCTION_TARGETS)for(const key of ['branchId','endpointId','host'])assert.notEqual(value[key],production[key],'ATOMIC_PROTOCOL_TEST_PRODUCTION_FORBIDDEN:'+key);
 }
 return freeze(copy(value));
}
function nativeOf(value,major){exact(value,nativeKeys,'ATOMIC_PROTOCOL_NATIVE_FIELDS');assert.ok(Number.isSafeInteger(value.pid)&&value.pid>0);assert.match(value.backendStart,START);assert.match(value.serverVersionNum,/^\d{6}$/);assert.equal(Math.trunc(Number(value.serverVersionNum)/10000),major);return value;}
function bundleOf(plan,bundle){
 exact(bundle,['version','target','identities','tlsObservations','transactionObserved','close','credentialsExposed','automaticRetry'],'ATOMIC_PROTOCOL_BUNDLE_FIELDS');
 assert.equal(bundle.version,version('own-release-annulment-atomic-pg.v1',plan.target),'ATOMIC_PROTOCOL_TRANSPORT_VERSION');
 assert.deepEqual(bundle.target,{...plan.target,transport:'postgres_tls_dedicated'},'ATOMIC_PROTOCOL_BUNDLE_TARGET');assert.equal(typeof bundle.transactionObserved,'function');assert.equal(typeof bundle.close,'function');
 assert.equal(bundle.credentialsExposed,false);assert.equal(bundle.automaticRetry,false);identitiesAndTlsOf(plan,bundle.identities,bundle.tlsObservations);return bundle;
}
function identitiesAndTlsOf(plan,identities,tlsObservations){
 exact(identities,slots,'ATOMIC_PROTOCOL_FIVE_IDENTITIES');
 for(const slot of slots)nativeOf(identities[slot],plan.major);assert.equal(new Set(slots.map(slot=>nativeKey(identities[slot]))).size,5,'ATOMIC_PROTOCOL_FIVE_BACKENDS');
 assert.ok(Array.isArray(tlsObservations)&&tlsObservations.length===5,'ATOMIC_PROTOCOL_FIVE_TLS');
 assert.deepEqual(tlsObservations.map(value=>value.slot).sort(),[...slots].sort());
 for(const observed of tlsObservations){
  exact(observed,['slot','postgresSsl','clientTls','native'],'ATOMIC_PROTOCOL_TLS_FIELDS');assert.equal(typeof observed.postgresSsl,'boolean');assert.deepEqual(observed.native,identities[observed.slot]);
  const tls=observed.clientTls;exact(tls,['version','encrypted','authorized','protocol','rejectUnauthorized','servername','hostnameVerified','peerCertificateSha256'],'ATOMIC_PROTOCOL_CLIENT_TLS_FIELDS');
  assert.equal(tls.version,'own-release-client-tls.v1');for(const key of ['encrypted','authorized','rejectUnauthorized','hostnameVerified'])assert.equal(tls[key],true,'ATOMIC_PROTOCOL_CLIENT_TLS_REQUIRED:'+key);
  assert.ok(['TLSv1.2','TLSv1.3'].includes(tls.protocol));assert.equal(tls.servername,plan.target.host);assert.match(tls.peerCertificateSha256,HASH);
 }
}
function context(target,ro){return `DO $annul_atomic_context$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(ro?'on':'off')} OR current_setting('standard_conforming_strings')<>'on' OR current_setting('search_path')<>'pg_catalog, public, pg_temp' OR current_setting('TimeZone')<>'UTC' OR current_setting('server_version_num')::integer/10000<>${target.major} OR current_database()<>${q(target.database)} OR current_user<>${q(target.role)} OR current_setting('neon.project_id',true) IS DISTINCT FROM ${q(target.projectId)} OR current_setting('neon.branch_id',true) IS DISTINCT FROM ${q(target.branchId)} OR current_setting('neon.endpoint_id',true) IS DISTINCT FROM ${q(target.endpointId)} OR to_regprocedure('public.native_employee_contract_guard_v1()')::oid IS DISTINCT FROM ${target.guardOid}::oid THEN RAISE EXCEPTION 'ANNUL_ATOMIC_NATIVE_CONTEXT_REQUIRED';END IF;END $annul_atomic_context$`;}
const prefix=(target,ro)=>['SET LOCAL search_path=pg_catalog,public,pg_temp',"SET LOCAL timezone='UTC'",'SET LOCAL standard_conforming_strings=on','SET LOCAL check_function_bodies=on','SET LOCAL row_security=off',"SET LOCAL lock_timeout='5s'","SET LOCAL statement_timeout='"+(ro?'45':'180')+"s'","SET LOCAL idle_in_transaction_session_timeout='60s'",ownInstallationDestination(target),context(target,ro)];
const locks="DO $annul_atomic_locks$ BEGIN PERFORM pg_advisory_xact_lock(208);PERFORM pg_advisory_xact_lock(209);END $annul_atomic_locks$";
const digest=slot=>`encode(public.digest(current_setting(${q(slot)})::jsonb::text,'sha256'),'hex')`;
const priorGuard=slot=>`DO $annul_atomic_prior_catalog$ BEGIN IF ${digest(slot)}<>${q(PRIOR)} THEN RAISE EXCEPTION 'ANNUL_ATOMIC_PRIOR_CATALOG_CHANGED';END IF;END $annul_atomic_prior_catalog$`;
const sameCatalog=(before,after)=>`DO $annul_atomic_catalog_preserved$ BEGIN IF current_setting(${q(before)})::jsonb IS DISTINCT FROM current_setting(${q(after)})::jsonb THEN RAISE EXCEPTION 'ANNUL_ATOMIC_CATALOG_CHANGED';END IF;END $annul_atomic_catalog_preserved$`;
function commands(statements){return statements.flatMap(statement=>splitPostgresStatements(statement).map(value=>{
 const clean=value.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim(),match=/^(SET|DO|SELECT)\b/.exec(clean);assert.ok(match,'ATOMIC_PROTOCOL_CLOSED_SQL_COMMAND');return match[1];
}));}
function phaseSql(plan,slot,catalogPrior){
 assert.ok(slots.includes(slot));if(slot!=='epoch')assert.match(catalogPrior,HASH,'ATOMIC_PROTOCOL_PRIOR_CATALOG_REQUIRED');
 return plan.phases[slot].statements.map(statement=>{
  if(!statement.includes(PRIOR))return statement;assert.equal(statement.split(PRIOR).length,2,'ATOMIC_PROTOCOL_SINGLE_PRIOR_PLACEHOLDER');return statement.replace(PRIOR,()=>catalogPrior);
 });
}
function phaseProof({slot,target,sourceCommit,sourceManifestSha256,payloadTemplateSha256,catalogBefore,catalogAfter,rowsBefore,rowsAfter,names}){
 const object=readOnly[slot]&&slot!=='durable'?'NULL':`(SELECT encode(public.digest(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]')::text,'sha256'),'hex') FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY(ARRAY[${names.map(q).join(',')}]))`;
 return `SELECT jsonb_build_object('version',${q(version('own-m7-annul208209-atomic-proof.v2',target))},'ledgerProfile',${q(LEDGER_PROFILE)},'slot',${q(slot)},'sourceCommit',${q(sourceCommit)},'sourceManifestSha256',${q(sourceManifestSha256)},'payloadTemplateSha256',${q(payloadTemplateSha256)},'targetSha256',${q(sha(JSON.stringify(target)))},'native',jsonb_build_object('pid',pg_backend_pid(),'backendStart',(SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()),'serverVersionNum',current_setting('server_version_num')),'catalogBeforeSha256',${digest(catalogBefore)},'catalogAfterSha256',${digest(catalogAfter)},'rowsBeforeSha256',${rowsBefore?digest(rowsBefore):'NULL'},'rowsAfterSha256',${rowsAfter?digest(rowsAfter):'NULL'},'objectSha256',${object},'functionCount',(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY[${names.map(q).join(',')}]))) AS proof`;
}

export function composeOwnM7Annul208209AtomicProtocol(options){
 exact(options,['components','read','target'],'ATOMIC_PROTOCOL_OPTIONS_EXACT');const{components,read}=options;assert.equal(typeof read,'function');assertOwnM7Annul208209AtomicSource(components);assert.equal(components.ledgerProfile,LEDGER_PROFILE,'ATOMIC_PROTOCOL_LEDGER_PROFILE');
 const{sourceCommit,major}=components,target=targetOf(options.target,major),raws=new Map();
 const readRaw=file=>{const text=read(file);assert.equal(typeof text,'string');const raw=Buffer.from(text,'utf8');assert.equal(raw.toString('utf8'),text);if(raws.has(file))assert.ok(raw.equals(raws.get(file)),'ATOMIC_PROTOCOL_RAW_DRIFT:'+file);else raws.set(file,raw);return raw;};
 // Recheck every component RAW descriptor with this reader; a second source
 // reader cannot substitute an equivalent-LF but different-RAW source epoch.
 for(const input of components.sourceInputs){const raw=readRaw(input.path);assert.equal(raw.length,input.rawUtf8Bytes,'ATOMIC_PROTOCOL_COMPONENT_RAW_BYTES');assert.equal(sha(raw),input.rawSha256,'ATOMIC_PROTOCOL_COMPONENT_RAW_SHA');}
 assert.equal(sha(readRaw(TARGET_FILE)),TARGET_SHA,'ATOMIC_PROTOCOL_TARGET_SOURCE');
 for(const file of [FILE,...HELPER_FILES]){const raw=readRaw(file);if(Object.hasOwn(ADAPTER_PINS,file))assert.equal(sha(raw),ADAPTER_PINS[file],'ATOMIC_PROTOCOL_ADAPTER_SOURCE:'+file);}
 const ledger=buildOwnAnnulmentLedgerContract({readRaw,sourceCommit}),names=[...components.ownPins208,...components.ownPins209].map(pin=>pin.name);
 const preservation=buildOwnAnnulmentAtomicPreservation({readRaw,sourceCommit,ownFunctionNames:names});
 const ownHashes=Object.fromEntries([...raws].filter(([file])=>[FILE,TARGET_FILE,...HELPER_FILES].includes(file)).map(([file,raw])=>[file,sha(raw)]));
 const sourceHashes=mergeHashes(components.sourceHashes,ledger.sourceHashes,preservation.sourceHashes,ownHashes),sourceManifestSha256=sha(JSON.stringify(sourceHashes));
 const phases={},cat=preservation.slots.catalog,rows=preservation.slots.rows;
 const pre=(slot)=>[...prefix(target,readOnly[slot]),...(!readOnly[slot]?[locks]:[]),preservation.preconditionGuard,ledger.guard];
 for(const slot of slots){
  let payload,catalogBefore,catalogAfter,rowsBefore=null,rowsAfter=null;
  if(slot==='epoch'||slot==='rollbackObserver'){
   const key=slot==='epoch'?'epoch':'rollbackObserver';catalogBefore=cat[key];catalogAfter=cat[key];payload=[...pre(slot),...components.compatibilityGuards,preservation.catalog[key],...(slot==='epoch'?[]:[priorGuard(cat[key])])];
  }else if(slot==='durable'){
   catalogBefore=cat.durable;catalogAfter=cat.durable;payload=[...pre(slot),...components.post208Guards,...components.pre209Guards,...components.post209Guards,preservation.catalog.durable,priorGuard(cat.durable)];
  }else{
   const key=slot==='rehearsal'?'rehearsal':'installation',before=key+'Before',after=key+'After';catalogBefore=cat[before];catalogAfter=cat[after];rowsBefore=rows[key].before;rowsAfter=rows[key].after;
   payload=[...pre(slot),...components.compatibilityGuards,components.pre208Guards[0],preservation.catalog[before],priorGuard(cat[before]),preservation.rows[key].before,components.raw208,...components.post208Guards,...components.pre209Guards,components.raw209,...components.post209Guards,ledger.guard,preservation.catalog[after],sameCatalog(cat[before],cat[after]),preservation.rows[key].after,preservation.rows[key].compare];
  }
  const payloadTemplateSha256=sha(JSON.stringify(payload.map(sha))),proof=phaseProof({slot,target,sourceCommit,sourceManifestSha256,payloadTemplateSha256,catalogBefore,catalogAfter,rowsBefore,rowsAfter,names});
  const statements=[...payload,proof];phases[slot]={slot,readOnly:readOnly[slot],end:slot==='rehearsal'?'ROLLBACK':'COMMIT',statements,templateStatementSha256:statements.map(sha),statementCommands:commands(statements),payloadTemplateSha256};
 }
 const plan={version:version('own-m7-annul208209-atomic-plan.v2',target),sourceCommit,major,target,sourceHashes,sourceManifestSha256,ledgerProfile:LEDGER_PROFILE,phaseOrder:[...slots],phases,
  sourceAdmissionContract:{version:version('own-m7-annul208209-atomic-source-admission.v2',target),ledgerProfile:LEDGER_PROFILE,ledgerTriggerProjection:copy(components.ledgerTriggerProjection),ledgerHandlerPinsSha256:sha(JSON.stringify(components.ledgerHandlerPins)),compatibilityGuardSha256:components.compatibilityGuards.map(sha),ledgerG1Sha256:sha(ledger.guard),preconditionSha256:sha(preservation.preconditionGuard),catalogEpochSha256:sha(preservation.catalog.epoch)},
  newFunctions:10,sourcePlanOnly:true,connects:false,executesSql:false,createsActors:false,executionAdmitted:false,receiptIssued:false};
 freeze(plan);plans.set(plan,{components,readRaw,raws,ledger,preservation,target,sourceCommit,major});bookendOwnM7Annul208209AtomicProtocol(plan);return plan;
}
export function bookendOwnM7Annul208209AtomicProtocol(plan){
 const seal=plans.get(plan);assert.ok(seal,'ATOMIC_PROTOCOL_MINTED_PLAN_REQUIRED');bookendOwnM7Annul208209AtomicSource(seal.components);for(const[file,raw]of seal.raws)assert.ok(seal.readRaw(file).equals(raw),'ATOMIC_PROTOCOL_RAW_BOOKEND:'+file);seal.ledger.sourceBookend();seal.preservation.sourceBookend();
 return freeze({version:'own-m7-annul208209-atomic-protocol-source-bookend.v2',sourceCommit:seal.sourceCommit,ledgerProfile:LEDGER_PROFILE,sourceVerified:true,executionAdmitted:false});
}
function validateProof(plan,slot,proof,identity,catalogPrior){
 exact(proof,['version','ledgerProfile','slot','sourceCommit','sourceManifestSha256','payloadTemplateSha256','targetSha256','native','catalogBeforeSha256','catalogAfterSha256','rowsBeforeSha256','rowsAfterSha256','objectSha256','functionCount'],'ATOMIC_PROTOCOL_PROOF_FIELDS');
 assert.equal(proof.version,version('own-m7-annul208209-atomic-proof.v2',plan.target));assert.equal(proof.ledgerProfile,LEDGER_PROFILE);assert.equal(proof.slot,slot);assert.equal(proof.sourceCommit,plan.sourceCommit);assert.equal(proof.sourceManifestSha256,plan.sourceManifestSha256);assert.equal(proof.payloadTemplateSha256,plan.phases[slot].payloadTemplateSha256);assert.equal(proof.targetSha256,sha(JSON.stringify(plan.target)));nativeOf(proof.native,plan.major);assert.deepEqual(proof.native,identity,'ATOMIC_PROTOCOL_PROOF_NATIVE');
 assert.match(proof.catalogBeforeSha256,HASH);assert.match(proof.catalogAfterSha256,HASH);assert.equal(proof.catalogBeforeSha256,proof.catalogAfterSha256,'ATOMIC_PROTOCOL_CATALOG_NOT_PRESERVED');if(slot!=='epoch')assert.equal(proof.catalogBeforeSha256,catalogPrior,'ATOMIC_PROTOCOL_CATALOG_EPOCH_CHANGED');
 if(readOnly[slot]){assert.equal(proof.rowsBeforeSha256,null);assert.equal(proof.rowsAfterSha256,null);}else{assert.match(proof.rowsBeforeSha256,HASH);assert.match(proof.rowsAfterSha256,HASH);assert.equal(proof.rowsBeforeSha256,proof.rowsAfterSha256,'ATOMIC_PROTOCOL_ROWS_NOT_PRESERVED');}
 assert.equal(proof.functionCount,slot==='epoch'||slot==='rollbackObserver'?0:10,'ATOMIC_PROTOCOL_FUNCTION_COUNT');if(slot==='epoch'||slot==='rollbackObserver')assert.equal(proof.objectSha256,null);else assert.match(proof.objectSha256,HASH);
 return proof;
}
function beforeEnd(plan,slot,envelope,identity,catalogPrior,expectedStatements){
 exact(envelope,['slot','end','rows','statementCommands','native','readOnly','beginCommand'],'ATOMIC_PROTOCOL_BEFORE_END_FIELDS');assert.equal(envelope.slot,slot);assert.equal(envelope.end,plan.phases[slot].end);assert.equal(envelope.readOnly,readOnly[slot]);assert.equal(envelope.beginCommand,'BEGIN');assert.deepEqual(envelope.native,identity);assert.deepEqual(envelope.statementCommands,plan.phases[slot].statementCommands,'ATOMIC_PROTOCOL_STATEMENT_COMMANDS');
 assert.ok(Object.isFrozen(envelope)&&Object.isFrozen(envelope.rows)&&Object.isFrozen(envelope.statementCommands)&&Object.isFrozen(envelope.native),'ATOMIC_PROTOCOL_FROZEN_BEFORE_END_REQUIRED');
 assert.ok(Array.isArray(envelope.rows));assert.equal(envelope.rows.length,envelope.statementCommands.length,'ATOMIC_PROTOCOL_ROWS_COMMAND_COUNT');
 for(let index=0;index<envelope.rows.length-1;index++)assert.deepEqual(envelope.rows[index],[],'ATOMIC_PROTOCOL_UNEXPECTED_ROWS');
 assert.equal(envelope.rows.at(-1)?.length,1,'ATOMIC_PROTOCOL_SINGLE_PROOF_ROW');exact(envelope.rows.at(-1)[0],['proof'],'ATOMIC_PROTOCOL_PROOF_ROW');const proof=validateProof(plan,slot,envelope.rows.at(-1)[0].proof,identity,catalogPrior);
 return{slot,readOnly:readOnly[slot],native:copy(identity),beginCommand:'BEGIN',requestedEnd:envelope.end,endIntentPersisted:true,endRequested:false,endCommand:null,commitObserved:false,rollbackObserved:false,statementSha256:expectedStatements.map(sha),statementCommands:[...envelope.statementCommands],rows:copy(envelope.rows),proof:copy(proof)};
}
function observedEnd(plan,slot,value,prepared){
 exact(value,['version','slot','kind','readOnly','beginCommand','requestedEnd','endRequested','endCommand','commitObserved','rollbackObserved','native','rows','statementCommands'],'ATOMIC_PROTOCOL_OBSERVED_END_FIELDS');
 assert.equal(value.version,version('own-release-annulment-atomic-pg.v1',plan.target));assert.equal(value.kind,plan.target.kind);assert.equal(value.slot,slot);assert.equal(value.readOnly,readOnly[slot]);assert.equal(value.beginCommand,'BEGIN');assert.equal(value.requestedEnd,plan.phases[slot].end);assert.equal(value.endRequested,true);assert.equal(value.endCommand,plan.phases[slot].end,'ATOMIC_PROTOCOL_END_NOT_OBSERVED');assert.equal(value.commitObserved,slot!=='rehearsal');assert.equal(value.rollbackObserved,slot==='rehearsal');assert.deepEqual(value.native,prepared.native);assert.deepEqual(value.statementCommands,prepared.statementCommands);assert.deepEqual(value.rows,prepared.rows,'ATOMIC_PROTOCOL_POST_END_ROWS_CHANGED');
 return{...prepared,endRequested:true,endCommand:value.endCommand,commitObserved:value.commitObserved,rollbackObserved:value.rollbackObserved};
}
const snapshot=value=>freeze(copy(value));
function failureErrorObservation(error){
 const observed=ownReleaseErrorObservation(error);
 return{version:'own-m7-annul208209-atomic-error.v1',code:observed.code,message:observed.fields.message??{type:'absent',contentPersisted:false}};
}
function failureContext(error){
 // Frozen exceptions cannot receive a context property. The transport's
 // minted WeakMap observation remains authoritative in that case.
 const native=ownReleaseAnnulmentAtomicFailureObservation(error).transaction;
 let value=native;
 if(!value){try{const descriptor=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'ownAtomicTransaction'):null;value=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;}catch{}}
 if(!value||typeof value!=='object')return null;const result={};
 for(const key of ['beginCommand','requestedEnd','endRequested','endCommand','commitObserved']){try{const descriptor=Object.getOwnPropertyDescriptor(value,key);if(descriptor&&Object.hasOwn(descriptor,'value'))result[key]=descriptor.value;}catch{}}
 return result;
}
export async function executeOwnM7Annul208209AtomicProtocol(options){
 exact(options,['plan','bundle','persist'],'ATOMIC_PROTOCOL_EXECUTE_OPTIONS');const{plan,bundle,persist}=options;assert.ok(plans.has(plan),'ATOMIC_PROTOCOL_MINTED_PLAN_REQUIRED');assert.equal(typeof persist,'function');bookendOwnM7Annul208209AtomicProtocol(plan);bundleOf(plan,bundle);
 const seal=plans.get(plan);assert.notEqual(seal.executionStarted,true,'ATOMIC_PROTOCOL_SINGLE_ATTEMPT');seal.executionStarted=true;
 const record={version:version(OWN_M7_ANNUL208209_ATOMIC_PROTOCOL_VERSION,plan.target),sourceCommit:plan.sourceCommit,sourceHashes:copy(plan.sourceHashes),sourceManifestSha256:plan.sourceManifestSha256,ledgerProfile:LEDGER_PROFILE,target:copy(plan.target),identities:copy(bundle.identities),tlsObservations:copy(bundle.tlsObservations),phaseOrder:[...slots],phases:{},sourceAdmission:null,status:'IN_PROGRESS',currentSlot:null,installationCommitIntentPersisted:false,installationCommitObserved:false,durabilityObserved:false,structuralObservationOnly:true,productionAdmitted:false,failure:null};
 let catalogPrior;
 try{
  for(const slot of slots){
   record.currentSlot=slot;bookendOwnM7Annul208209AtomicProtocol(plan);bundleOf(plan,bundle);assert.deepEqual(bundle.identities,record.identities,'ATOMIC_PROTOCOL_BUNDLE_IDENTITIES_CHANGED');assert.deepEqual(bundle.tlsObservations,record.tlsObservations,'ATOMIC_PROTOCOL_BUNDLE_TLS_CHANGED');const statements=phaseSql(plan,slot,catalogPrior);let prepared=null;
   const end=await bundle.transactionObserved(slot,statements,{readOnly:readOnly[slot],end:plan.phases[slot].end,onBeforeEnd:async envelope=>{
    assert.equal(prepared,null,'ATOMIC_PROTOCOL_SINGLE_BEFORE_END');prepared=beforeEnd(plan,slot,envelope,record.identities[slot],catalogPrior,statements);
    if(slot==='durable')assert.equal(prepared.proof.objectSha256,record.phases.installation.proof.objectSha256,'ATOMIC_PROTOCOL_DURABLE_FUNCTIONS_CHANGED');
    record.phases[slot]=prepared;if(slot==='installation')record.installationCommitIntentPersisted=true;await persist(snapshot(record));bookendOwnM7Annul208209AtomicProtocol(plan);
   }});
   assert.ok(prepared,'ATOMIC_PROTOCOL_BEFORE_END_REQUIRED');record.phases[slot]=observedEnd(plan,slot,end,prepared);
   if(slot==='epoch'){catalogPrior=prepared.proof.catalogBeforeSha256;record.sourceAdmission={...copy(plan.sourceAdmissionContract),sourceCommit:plan.sourceCommit,target:copy(plan.target),sourceManifestSha256:plan.sourceManifestSha256,catalogSha256:catalogPrior,native:copy(record.identities.epoch),epochPayloadTemplateSha256:plan.phases.epoch.payloadTemplateSha256,observationOnly:true,productionAdmitted:false};}
   if(slot==='installation')record.installationCommitObserved=true;if(slot==='durable')record.durabilityObserved=true;await persist(snapshot(record));
  }
  bookendOwnM7Annul208209AtomicProtocol(plan);record.currentSlot=null;record.status='VALIDATED';const complete=snapshot(record);records.set(complete,{plan});assertOwnM7Annul208209AtomicProtocolRecord({plan,record:complete});await persist(complete);return complete;
 }catch(error){
  // Never infer a rollback or lack of commit from an exception label. Even a
  // persistence failure after an observed commit remains UNCERTAIN here.
  record.status='UNCERTAIN';record.durabilityObserved=false;
  const observation=failureContext(error);
  record.failure={slot:record.currentSlot,uncertain:true,noFurtherSql:true,beginCommand:observation?.beginCommand==='BEGIN'?'BEGIN':null,requestedEnd:['COMMIT','ROLLBACK'].includes(observation?.requestedEnd)?observation.requestedEnd:null,endRequested:observation?.endRequested===true,endCommand:['COMMIT','ROLLBACK'].includes(observation?.endCommand)?observation.endCommand:null,commitObserved:observation?.commitObserved===true,error:failureErrorObservation(error)};
  if(record.currentSlot==='installation'&&record.failure.commitObserved)record.installationCommitObserved=true;
  const stopped=snapshot(record);records.set(stopped,{plan,error});try{await persist(stopped);}catch{}return stopped;
 }
}

// The original is deliberately outside the serializable observation. Root may
// inspect it and its transport WeakMap observation without issuing more SQL.
export function ownM7Annul208209AtomicProtocolFailure(record){const seal=records.get(record);assert.ok(seal,'ATOMIC_PROTOCOL_MINTED_RECORD_REQUIRED');return seal.error;}

export function assertOwnM7Annul208209AtomicProtocolRecord(options){
 exact(options,['plan','record'],'ATOMIC_PROTOCOL_RECORD_OPTIONS');const{plan,record}=options;assert.ok(plans.has(plan),'ATOMIC_PROTOCOL_MINTED_PLAN_REQUIRED');assert.equal(records.get(record)?.plan,plan,'ATOMIC_PROTOCOL_MINTED_RECORD_REQUIRED');
 exact(record,['version','sourceCommit','sourceHashes','sourceManifestSha256','ledgerProfile','target','identities','tlsObservations','phaseOrder','phases','sourceAdmission','status','currentSlot','installationCommitIntentPersisted','installationCommitObserved','durabilityObserved','structuralObservationOnly','productionAdmitted','failure'],'ATOMIC_PROTOCOL_RECORD_FIELDS');assert.equal(record.ledgerProfile,LEDGER_PROFILE);
 assert.equal(record.version,version(OWN_M7_ANNUL208209_ATOMIC_PROTOCOL_VERSION,plan.target));assert.equal(record.status,'VALIDATED','ATOMIC_PROTOCOL_VALIDATED_OBSERVATION_REQUIRED');assert.equal(record.sourceCommit,plan.sourceCommit);assert.deepEqual(record.sourceHashes,plan.sourceHashes);assert.equal(record.sourceManifestSha256,plan.sourceManifestSha256);assert.deepEqual(record.target,plan.target);assert.deepEqual(record.phaseOrder,slots);assert.equal(record.structuralObservationOnly,true);assert.equal(record.productionAdmitted,false);assert.equal(record.failure,null);assert.equal(record.currentSlot,null);assert.equal(record.installationCommitIntentPersisted,true);assert.equal(record.installationCommitObserved,true);assert.equal(record.durabilityObserved,true);identitiesAndTlsOf(plan,record.identities,record.tlsObservations);
 exact(record.phases,slots,'ATOMIC_PROTOCOL_COMPLETE_PHASES');const prior=record.phases.epoch.proof.catalogBeforeSha256;
 for(const slot of slots){const phase=record.phases[slot];exact(phase,['slot','readOnly','native','beginCommand','requestedEnd','endIntentPersisted','endRequested','endCommand','commitObserved','rollbackObserved','statementSha256','statementCommands','rows','proof'],'ATOMIC_PROTOCOL_PHASE_FIELDS');assert.equal(phase.slot,slot);assert.equal(phase.readOnly,readOnly[slot]);assert.equal(phase.requestedEnd,plan.phases[slot].end);assert.equal(phase.endIntentPersisted,true);assert.equal(phase.beginCommand,'BEGIN');assert.equal(phase.endRequested,true);assert.equal(phase.endCommand,plan.phases[slot].end);assert.equal(phase.commitObserved,slot!=='rehearsal');assert.equal(phase.rollbackObserved,slot==='rehearsal');assert.deepEqual(phase.native,record.identities[slot]);assert.deepEqual(phase.statementSha256,phaseSql(plan,slot,prior).map(sha));assert.deepEqual(phase.statementCommands,plan.phases[slot].statementCommands);assert.deepEqual(phase.rows,[...phase.statementCommands.slice(0,-1).map(()=>[]),[{proof:phase.proof}]]);validateProof(plan,slot,phase.proof,record.identities[slot],prior);}
 assert.equal(record.phases.installation.proof.objectSha256,record.phases.durable.proof.objectSha256,'ATOMIC_PROTOCOL_DURABILITY_MISMATCH');
 assert.deepEqual(record.sourceAdmission,{...copy(plan.sourceAdmissionContract),sourceCommit:plan.sourceCommit,target:copy(plan.target),sourceManifestSha256:plan.sourceManifestSha256,catalogSha256:prior,native:copy(record.identities.epoch),epochPayloadTemplateSha256:plan.phases.epoch.payloadTemplateSha256,observationOnly:true,productionAdmitted:false});
 bookendOwnM7Annul208209AtomicProtocol(plan);return record;
}
