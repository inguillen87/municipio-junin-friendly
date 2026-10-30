// Synthetic SOURCE/DI regressions only. No native admission or saved-receipt
// provenance is established by the fake transport below.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
const restores=[],external=[];
const block=(object,key)=>{const original=object[key];restores.push(()=>{object[key]=original;});object[key]=()=>{external.push(key);throw Error('ATOMIC_PROTOCOL_TEST_EXTERNAL_EFFECT:'+key);};};
for(const key of ['connect','createConnection','createServer'])block(net,key);block(net.Socket.prototype,'connect');block(tls,'connect');block(tls,'createServer');
for(const object of [http,https])for(const key of ['request','get','createServer'])block(object,key);
for(const key of ['lookup','resolve','resolve4','resolve6','reverse'])block(dns,key);
for(const key of ['exec','execFile','execSync','execFileSync','spawn','spawnSync','fork'])block(childProcess,key);block(globalThis,'fetch');syncBuiltinESMExports();after(()=>{for(const restore of restores.reverse())restore();syncBuiltinESMExports();});
const protocol=await import('../scripts/lib/own-m7-annul208209-atomic-protocol.mjs');
const {composeOwnM7Annul208209AtomicProtocol:compose,executeOwnM7Annul208209AtomicProtocol:execute,assertOwnM7Annul208209AtomicProtocolRecord:validate,bookendOwnM7Annul208209AtomicProtocol:bookend,ownM7Annul208209AtomicProtocolFailure:failure,OWN_M7_ANNUL208209_ATOMIC_PROTOCOL_SLOTS:SLOTS}=protocol;
const {composeOwnM7Annul208209AtomicSource}=await import('../scripts/lib/own-m7-annul208209-atomic-source.mjs');
const {buildOwnAnnulmentLedgerContract}=await import('../scripts/lib/own-annulment-ledger-contract.mjs');
const {buildOwnAnnulmentAtomicPreservation}=await import('../scripts/lib/own-annulment-atomic-preservation.mjs');
const {ownInstallationDestination}=await import('../scripts/prepare-own-payroll-installation.mjs');
const {createOwnReleaseAnnulmentAtomicSessions,ownReleaseAnnulmentAtomicFailureObservation}=await import('../scripts/lib/own-payroll-release-annulment-atomic-pg.mjs');
const FILE='scripts/lib/own-m7-annul208209-atomic-protocol.mjs',SQL208='scripts/migrations/208-own-annulment-review-index.sql',SQL209='scripts/migrations/209-own-annulment-preparation-projection.sql';
const PROFILE_FILE='scripts/lib/own-annulment-ledger-trigger-profile.mjs';
const sourceCommit='a'.repeat(40),sha=value=>createHash('sha256').update(value).digest('hex'),clone=value=>structuredClone(value);
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
const rawCache=new Map(),overrides=new Map(),read=file=>overrides.has(file)?overrides.get(file):(rawCache.has(file)?rawCache.get(file):(rawCache.set(file,fs.readFileSync(new URL('../'+file,import.meta.url),'utf8')),rawCache.get(file)));
const base={major:17,projectId:'noisy-poetry-54471701',branchId:'br-plain-dust-acpjgebb',database:'neondb',role:'neondb_owner',guardOid:532699,host:'ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech',endpointId:'ep-shiny-cherry-actlyudg'};
const prod={...base,kind:'production'},testTarget={...base,kind:'test',parentBranchId:base.branchId,branchId:'br-synthetic-source-only',endpointId:'ep-synthetic-source-only',host:'ep-synthetic-source-only.sa-east-1.aws.neon.tech'};
let cached;const components=()=>cached??=composeOwnM7Annul208209AtomicSource({read,sourceCommit,major:17});
const planFor=(target=testTarget)=>compose({components:components(),read,target});
const versions=plan=>plan.target.kind==='test'?'+test':'';
function fakeProof(plan,slot,native){
 return{version:'own-m7-annul208209-atomic-proof.v2'+versions(plan),ledgerProfile:'positions128129-adopted.v2',slot,sourceCommit,sourceManifestSha256:plan.sourceManifestSha256,payloadTemplateSha256:plan.phases[slot].payloadTemplateSha256,targetSha256:sha(JSON.stringify(plan.target)),native:clone(native),catalogBeforeSha256:'c'.repeat(64),catalogAfterSha256:'c'.repeat(64),rowsBeforeSha256:plan.phases[slot].readOnly?null:(slot==='rehearsal'?'a':'b').repeat(64),rowsAfterSha256:plan.phases[slot].readOnly?null:(slot==='rehearsal'?'a':'b').repeat(64),objectSha256:slot==='epoch'||slot==='rollbackObserver'?null:(slot==='rehearsal'?'d':'e').repeat(64),functionCount:slot==='epoch'||slot==='rollbackObserver'?0:10};
}
function fakeBundle(plan,options={}){
 const events=[],identities=Object.fromEntries(SLOTS.map((slot,index)=>[slot,{pid:5100+index,backendStart:'2026-10-28T00:00:00.00000'+index+'+00:00',serverVersionNum:'170011'}]));
 const tlsObservations=SLOTS.map(slot=>({slot,postgresSsl:false,native:identities[slot],clientTls:{version:'own-release-client-tls.v1',encrypted:true,authorized:true,protocol:'TLSv1.3',rejectUnauthorized:true,servername:plan.target.host,hostnameVerified:true,peerCertificateSha256:'f'.repeat(64)}}));
 const bundle={version:'own-release-annulment-atomic-pg.v1'+versions(plan),target:{...plan.target,transport:'postgres_tls_dedicated'},identities,tlsObservations,credentialsExposed:false,automaticRetry:false,close:async()=>{events.push({type:'close'});},transactionObserved:async(slot,statements,tx)=>{
  events.push({type:'call',slot,statements:[...statements],readOnly:tx.readOnly,end:tx.end});let endRequested=false,endCommand=null;
  try{
   if(options.throwBefore===slot)throw options.originalError??Error('synthetic before end');
   const proof=fakeProof(plan,slot,identities[slot]),statementCommands=[...plan.phases[slot].statementCommands],rows=statementCommands.map(()=>[]);rows[rows.length-1]=[{proof}];
   const envelope={slot,end:tx.end,rows,statementCommands,native:clone(identities[slot]),readOnly:tx.readOnly,beginCommand:'BEGIN'};
   options.mutate?.(slot,envelope,statements);
   events.push({type:'beforeEnd',slot});if(options.skipCallback!==slot)await tx.onBeforeEnd(freeze(envelope));
   if(options.duplicateCallback===slot)await tx.onBeforeEnd(envelope);
   events.push({type:'end',slot,end:tx.end});endRequested=true;
   if(options.lostEnd===slot)throw Error('synthetic response lost');
   if(options.rollbackTag===slot){endCommand='ROLLBACK';throw Error('synthetic COMMIT responded ROLLBACK');}
   endCommand=tx.end;
   const observed={version:bundle.version,slot,kind:plan.target.kind,readOnly:tx.readOnly,beginCommand:'BEGIN',requestedEnd:tx.end,endRequested:true,endCommand,commitObserved:tx.end==='COMMIT',rollbackObserved:tx.end==='ROLLBACK',native:clone(identities[slot]),rows:clone(envelope.rows),statementCommands:clone(envelope.statementCommands)};
   options.mutateReturn?.(slot,observed);return observed;
  }catch(error){try{Object.defineProperty(error,'ownAtomicTransaction',{value:{slot,kind:plan.target.kind,native:identities[slot],phase:'transaction',beginCommand:'BEGIN',requestedEnd:tx.end,endRequested,endCommand,commitObserved:endCommand==='COMMIT',sessionTerminated:true},enumerable:false});}catch{}events.push({type:'failure',slot,endRequested,endCommand});throw error;}
 }};
 return{bundle,events,persisted:[],persist:async function(record){events.push({type:'persist',slot:record.currentSlot,status:record.status,endRequested:record.currentSlot?record.phases[record.currentSlot]?.endRequested:null});this.persisted.push(record);}};
}
async function run(plan=planFor(),options={}){
 const h=fakeBundle(plan,options),persist=async record=>{await h.persist(record);if(options.failPersist?.(record))throw Error('synthetic persistence failure');};
 return{...h,plan,record:await execute({plan,bundle:h.bundle,persist})};
}

test('the new source plan retains exact G1/compatibility/registry guards and puts both whole SQL sources into each single RW transaction',()=>{
 const p=planFor(),c=components(),g1=buildOwnAnnulmentLedgerContract({readRaw:file=>Buffer.from(read(file)),sourceCommit}),preservation=buildOwnAnnulmentAtomicPreservation({readRaw:file=>Buffer.from(read(file)),sourceCommit,ownFunctionNames:[...c.ownPins208,...c.ownPins209].map(pin=>pin.name)});
 assert.deepEqual(p.phaseOrder,['epoch','rehearsal','rollbackObserver','installation','durable']);assert.equal(p.version,'own-m7-annul208209-atomic-plan.v2+test');assert.equal(p.ledgerProfile,'positions128129-adopted.v2');assert.equal(p.executionAdmitted,false);assert.equal(p.receiptIssued,false);assert.equal(p.sourcePlanOnly,true);assert.equal(p.sourceHashes[PROFILE_FILE],c.sourceHashes[PROFILE_FILE]);assert.deepEqual(p.sourceAdmissionContract.ledgerTriggerProjection,c.ledgerTriggerProjection);assert.equal(p.sourceAdmissionContract.ledgerHandlerPinsSha256,sha(JSON.stringify(c.ledgerHandlerPins)));
 for(const slot of SLOTS){const statements=p.phases[slot].statements;assert.ok(statements.includes(ownInstallationDestination(p.target)));assert.ok(statements.includes(g1.guard));assert.ok(statements.includes(preservation.preconditionGuard));assert.ok(statements.includes('SET LOCAL check_function_bodies=on'));assert.ok(statements.includes('SET LOCAL row_security=off'));assert.ok(preservation.preconditionGuard.includes("current_setting('session_replication_role')<>'origin'"));assert.equal(statements.some(sql=>sql.startsWith('SET TRANSACTION')),false);assert.equal(p.phases[slot].templateStatementSha256.length,statements.length);assert.deepEqual(p.phases[slot].templateStatementSha256,statements.map(sha));}
 assert.equal(p.sourceHashes['scripts/lib/own-payroll-release-annulment-atomic-pg.mjs'],'7f7cfb6500edef5a144a5370a9998b7afa08893e6b25d882cdc0841ede8d8456');assert.equal(p.sourceHashes['scripts/lib/own-payroll-release-annulment-pg.mjs'],'78ea06c3debc74dc5b577e33a73a31687ef18ddab97cb31cfafbe39e5cd01840');
 for(const slot of ['rehearsal','installation']){
  const statements=p.phases[slot].statements,a=statements.indexOf(c.raw208),b=statements.indexOf(c.raw209);assert.ok(a>0&&b>a);assert.equal(statements.filter(sql=>sql===c.raw208).length,1);assert.equal(statements.filter(sql=>sql===c.raw209).length,1);
  assert.deepEqual(statements.slice(a+1,a+1+c.post208Guards.length),c.post208Guards);assert.deepEqual(statements.slice(a+1+c.post208Guards.length,b),c.pre209Guards);assert.deepEqual(statements.slice(b+1,b+1+c.post209Guards.length),c.post209Guards);
  const lock=statements.findIndex(sql=>sql.includes('pg_advisory_xact_lock(208)'));assert.ok(lock>=0&&lock<statements.indexOf(preservation.catalog[slot+'Before']));assert.ok(statements.includes("SET LOCAL lock_timeout='5s'"));assert.ok(statements.includes("SET LOCAL statement_timeout='180s'"));assert.ok(statements.includes(preservation.rows[slot].compare));
 }
 for(const slot of ['epoch','rollbackObserver','durable']){const joined=p.phases[slot].statements.join('\n');assert.ok(!joined.includes('FROM %I.%I'));assert.ok(!joined.includes('last_value'));assert.ok(!joined.includes('is_called'));assert.ok(!joined.includes('rows_rehearsal'));assert.ok(!joined.includes('rows_installation'));}
 for(const slot of SLOTS){assert.ok(p.phases[slot].statements.includes(c.registryGuards.ledgerTriggers));for(const pin of c.ledgerHandlerPins)assert.ok(p.phases[slot].statements.join('\n').includes(pin.sha256));assert.ok(!p.phases[slot].statements.includes(c.legacyRegistryGuards.ledgerTriggers));}
 assert.equal(p.phases.rehearsal.end,'ROLLBACK');assert.equal(p.phases.installation.end,'COMMIT');assert.ok(Object.isFrozen(p));assert.ok(Object.isFrozen(p.phases.installation.statements));assert.equal(bookend(p).sourceVerified,true);
});

test('the synthetic coordinator follows E-R(ROLLBACK)-O-I(COMMIT)-D, awaits pre-end persistence and accepts F changes only between transactions',async()=>{
 const {record,plan,events,persisted}=await run();assert.equal(record.status,'VALIDATED');assert.equal(record.productionAdmitted,false);assert.equal(record.structuralObservationOnly,true);assert.equal(validate({plan,record}),record);
 assert.deepEqual(events.filter(event=>event.type==='call').map(event=>event.slot),SLOTS);assert.deepEqual(events.filter(event=>event.type==='end').map(event=>event.end),['COMMIT','ROLLBACK','COMMIT','COMMIT','COMMIT']);
 for(const slot of SLOTS){const at=events.findIndex(event=>event.type==='end'&&event.slot===slot);assert.equal(events[at-1].type,'persist');assert.equal(events[at-1].slot,slot);assert.equal(events[at-1].endRequested,false);assert.equal(record.phases[slot].beginCommand,'BEGIN');}
 assert.notEqual(record.phases.rehearsal.proof.rowsBeforeSha256,record.phases.installation.proof.rowsBeforeSha256);assert.notEqual(record.phases.rehearsal.proof.objectSha256,record.phases.installation.proof.objectSha256);assert.equal(record.phases.installation.proof.objectSha256,record.phases.durable.proof.objectSha256);
 for(const phase of Object.values(record.phases))assert.equal(phase.proof.catalogBeforeSha256,record.sourceAdmission.catalogSha256);
 assert.equal(record.version,'own-m7-annul208209-atomic-protocol.v2+test');assert.equal(record.ledgerProfile,'positions128129-adopted.v2');assert.equal(record.sourceAdmission.version,'own-m7-annul208209-atomic-source-admission.v2+test');assert.equal(record.sourceAdmission.ledgerProfile,record.ledgerProfile);assert.equal(record.sourceAdmission.productionAdmitted,false);assert.ok(!JSON.stringify(record).includes('novelty217Prior'));assert.ok(!JSON.stringify(record).includes('validatedNativeProofs'));
 assert.equal(persisted.find(value=>value.currentSlot==='installation'&&!value.phases.installation.endRequested).installationCommitObserved,false);assert.equal(record.installationCommitObserved,true);assert.equal(record.durabilityObserved,true);
 const i=events.find(event=>event.type==='call'&&event.slot==='installation');assert.deepEqual(record.phases.installation.statementSha256,i.statements.map(sha));assert.ok(!i.statements.join('\n').includes('__OWN_ANNUL_ATOMIC_PRIOR_CATALOG_SHA256__'));assert.notDeepEqual(record.phases.installation.statementSha256,plan.phases.installation.templateStatementSha256);
});

test('catalogue drift in O, mismatched same-transaction rows or foreign function metadata stops before the next call',async()=>{
 for(const[badSlot,mutate,expected]of[
  ['rollbackObserver',proof=>{proof.catalogBeforeSha256=proof.catalogAfterSha256='1'.repeat(64);},['epoch','rehearsal','rollbackObserver']],
  ['rehearsal',proof=>{proof.rowsAfterSha256='1'.repeat(64);},['epoch','rehearsal']],
  ['installation',proof=>{proof.functionCount=7;},['epoch','rehearsal','rollbackObserver','installation']],
  ['durable',proof=>{proof.objectSha256='1'.repeat(64);},SLOTS],
 ]){
  const {record,events}=await run(planFor(),{mutate:(slot,envelope)=>{if(slot===badSlot)mutate(envelope.rows.at(-1)[0].proof);}});
  assert.equal(record.status,'UNCERTAIN');assert.deepEqual(events.filter(event=>event.type==='call').map(event=>event.slot),expected);assert.equal(events.some(event=>event.type==='end'&&event.slot===badSlot),false);assert.equal(record.failure.noFurtherSql,true);assert.equal(record.durabilityObserved,false);
 }
});

test('unexpected errors, persistence failures, response loss and COMMIT-to-ROLLBACK never produce optimistic non-commit claims or further calls',async()=>{
 for(const options of[{throwBefore:'installation'},{lostEnd:'installation'},{rollbackTag:'installation'},{failPersist:record=>record.currentSlot==='installation'&&record.phases.installation?.endRequested===false},{failPersist:record=>record.currentSlot==='installation'&&record.phases.installation?.endRequested===true}]){
  const {record,events}=await run(planFor(),options);assert.equal(record.status,'UNCERTAIN');assert.equal(record.failure.uncertain,true);assert.equal(record.failure.noFurtherSql,true);assert.deepEqual(events.filter(event=>event.type==='call').map(event=>event.slot),['epoch','rehearsal','rollbackObserver','installation']);assert.equal(record.durabilityObserved,false);assert.ok(!JSON.stringify(record).includes('NOT_COMMITTED'));assert.ok(!JSON.stringify(record).includes('STOPPED_BEFORE_INSTALL'));
  if(options.lostEnd)assert.equal(record.failure.endRequested,true);if(options.rollbackTag){assert.equal(record.failure.endCommand,'ROLLBACK');assert.equal(record.installationCommitObserved,false);}if(options.throwBefore)assert.equal(record.failure.endRequested,false);
  if(options.failPersist&&record.phases.installation?.endRequested)assert.equal(record.installationCommitObserved,true);
 }
});

test('pre-end proof/command/native checks reject causal faults before committing and full returned rows are rechecked after the end',async()=>{
 for(const mutate of[
  envelope=>{envelope.beginCommand='SELECT';},envelope=>{envelope.statementCommands[0]='SELECT';},envelope=>{envelope.rows[0]=[{passed:true}];},envelope=>{envelope.rows.at(-1)[0].proof.passed=true;},envelope=>{envelope.rows.at(-1)[0].proof.native.pid++;},envelope=>{envelope.rows.at(-1)[0].proof.payloadTemplateSha256='0'.repeat(64);},envelope=>{envelope.rows.at(-1)[0].proof.version='own-m7-annul208209-atomic-proof.v1+test';},envelope=>{envelope.rows.at(-1)[0].proof.ledgerProfile='positions128129-original.v1';},
 ]){
  const {record,events}=await run(planFor(),{mutate:(slot,envelope)=>{if(slot==='installation')mutate(envelope);}});assert.equal(record.status,'UNCERTAIN');assert.equal(events.some(event=>event.type==='end'&&event.slot==='installation'),false);assert.equal(events.some(event=>event.type==='call'&&event.slot==='durable'),false);
 }
 const changed=await run(planFor(),{mutateReturn:(slot,value)=>{if(slot==='installation')value.rows[0]=[{foreign:true}];}});assert.equal(changed.record.status,'UNCERTAIN');assert.equal(changed.events.some(event=>event.type==='call'&&event.slot==='durable'),false);
 const skipped=await run(planFor(),{skipCallback:'installation'});assert.equal(skipped.record.status,'UNCERTAIN');assert.equal(skipped.events.some(event=>event.type==='call'&&event.slot==='durable'),false);
 const duplicate=await run(planFor(),{duplicateCallback:'installation'});assert.equal(duplicate.record.status,'UNCERTAIN');assert.equal(duplicate.events.some(event=>event.type==='end'&&event.slot==='installation'),false);
});

test('production and TEST require distinct exact kinds, versions, destinations, parent and five native TLS observations',async()=>{
 const p=planFor();for(const target of[{...testTarget,parentBranchId:'br-foreign'},{...testTarget,branchId:prod.branchId},{...testTarget,endpointId:prod.endpointId},{...testTarget,host:prod.host},{...prod,branchId:testTarget.branchId},{...testTarget,passed:true}])assert.throws(()=>planFor(target));
 for(const mutate of[
  h=>{h.bundle.version='own-release-annulment-dedicated-pg.v2';},h=>{h.bundle.target.kind='production';},h=>{h.bundle.target.parentBranchId='br-foreign';},h=>{h.bundle.identities.rehearsal=h.bundle.identities.epoch;},h=>{h.bundle.tlsObservations[0].clientTls.authorized=false;},h=>{h.bundle.tlsObservations[0].clientTls.servername='foreign.invalid';},h=>{h.bundle.transaction=async()=>{};},h=>{h.bundle.passed=true;},
 ]){const h=fakeBundle(p);mutate(h);await assert.rejects(()=>execute({plan:p,bundle:h.bundle,persist:async()=>{}}));assert.equal(h.events.length,0);}
 const production=await run(planFor(prod));assert.equal(production.record.version,'own-m7-annul208209-atomic-protocol.v2');assert.equal(production.record.target.kind,'production');assert.equal(production.record.productionAdmitted,false);assert.equal(production.record.sourceAdmission.observationOnly,true);
 const synthetic=await run();assert.throws(()=>validate({plan:production.plan,record:synthetic.record}),/MINTED_RECORD_REQUIRED/);assert.throws(()=>validate({plan:synthetic.plan,record:production.record}),/MINTED_RECORD_REQUIRED/);
});

test('minted source/plan/record identity, exact factory options, single attempts and RAW bookends cannot be bypassed by fixtures or clones',async()=>{
 const c=components();assert.throws(()=>compose({components:{...c},read,target:testTarget}),/MINTED_SOURCE_COMPONENTS_REQUIRED/);
 for(const file of ['scripts/lib/own-payroll-release-annulment-atomic-pg.mjs','scripts/lib/own-payroll-release-annulment-pg.mjs'])assert.throws(()=>compose({components:c,read:path=>path===file?read(path)+'\n':read(path),target:testTarget}),/RAW|ADAPTER_SOURCE/);
 for(const extra of[{passed:true},{sourceAdmission:{}},{prior:{}},{observedMetadata:{}},{ledger:{guard:'SELECT true'}}])assert.throws(()=>compose({components:c,read,target:testTarget,...extra}),/OPTIONS_EXACT/);
 const p=planFor(),h=fakeBundle(p);await assert.rejects(()=>execute({plan:{...p},bundle:h.bundle,persist:async()=>{}}),/MINTED_PLAN_REQUIRED/);assert.throws(()=>bookend({...p}),/MINTED_PLAN_REQUIRED/);
 const {record,plan,bundle}=await run();for(const forged of[{...record},clone(record),{...record,version:'own-m7-annul208209-atomic-protocol.v1+test',status:'VALIDATED'},{version:'own-m7-public-annulment-tail.v1',passed:true}])assert.throws(()=>validate({plan,record:forged}),/MINTED_RECORD_REQUIRED/);await assert.rejects(()=>execute({plan,bundle,persist:async()=>{}}),/SINGLE_ATTEMPT/);
 const raw=read(SQL209),changed=raw.replace('\n','\r\n');try{overrides.set(SQL209,changed);assert.throws(()=>bookend(p),/RAW_SOURCE_BOOKEND|RAW_DRIFT/);}finally{overrides.delete(SQL209);}
 const own=read(FILE);try{overrides.set(FILE,own+'\n');assert.throws(()=>bookend(p),/RAW_DRIFT/);}finally{overrides.delete(FILE);}
 assert.equal(bookend(p).sourceVerified,true);assert.deepEqual(external,[]);
});

test('a frozen original failure is preserved exactly outside JSON; safe diagnostics expose code and message digest without credentials or stack',async()=>{
 const secret='postgresql://private_actor:secret-password@private.invalid/private-db',original=Object.freeze(Object.assign(Error(secret),{code:'42703',detail:'private nominal detail',stack:'private credential stack'}));
 const {record,events}=await run(planFor(),{throwBefore:'installation',originalError:original});assert.equal(record.status,'UNCERTAIN');assert.equal(failure(record),original);assert.equal(record.failure.error.code,'42703');assert.equal(record.failure.error.message.sha256,sha(secret));assert.equal(record.failure.error.message.bytes,Buffer.byteLength(secret));assert.deepEqual(Object.keys(record.failure.error).sort(),['code','message','version']);assert.ok(!JSON.stringify(record).includes(secret));assert.ok(!JSON.stringify(record).includes('secret-password'));assert.ok(!JSON.stringify(record).includes('private nominal detail'));assert.ok(!JSON.stringify(record).includes('private credential stack'));assert.equal(events.some(event=>event.type==='call'&&event.slot==='durable'),false);assert.throws(()=>failure({...record}),/MINTED_RECORD_REQUIRED/);
 const successful=await run();assert.equal(failure(successful.record),undefined);assert.deepEqual(external,[]);
 let getters=0;const hostile=Error('synthetic accessor failure');Object.defineProperty(hostile,'ownAtomicTransaction',{get(){getters++;throw Error('must not invoke accessor');}});Object.freeze(hostile);
 const accessor=await run(planFor(),{throwBefore:'installation',originalError:hostile});assert.equal(accessor.record.status,'UNCERTAIN');assert.equal(failure(accessor.record),hostile);assert.equal(getters,0);
 const frozenContext=Object.freeze({beginCommand:'BEGIN',requestedEnd:'COMMIT',endRequested:true,endCommand:'COMMIT',commitObserved:true}),withContext=Error('synthetic frozen observed commit');Object.defineProperty(withContext,'ownAtomicTransaction',{value:frozenContext});Object.freeze(withContext);
 const committed=await run(planFor(),{throwBefore:'installation',originalError:withContext});assert.equal(committed.record.status,'UNCERTAIN');assert.equal(failure(committed.record),withContext);assert.equal(committed.record.failure.endRequested,true);assert.equal(committed.record.failure.endCommand,'COMMIT');assert.equal(committed.record.installationCommitObserved,true);assert.equal(committed.events.some(event=>event.type==='call'&&event.slot==='durable'),false);
});

test('the real transport WeakMap retains a frozen exception with no context property, using an inert constructor that issues no query',async()=>{
 const original=Object.freeze(Object.assign(Error('UNIT_SYNTHETIC_FROZEN_CONNECT'),{code:'ECONNRESET'}));let fakeConstructors=0,fakeQueries=0,fakeEnds=0;
 class UnitClient{
  constructor(){fakeConstructors++;}on(){return this;}async connect(){throw original;}async query(){fakeQueries++;throw Error('UNIT_QUERY_FORBIDDEN');}async end(){fakeEnds++;}
 }
 await assert.rejects(()=>createOwnReleaseAnnulmentAtomicSessions({major:17,Client:UnitClient,connectionValue:'postgresql://'+base.role+':unit-synthetic@'+base.host+'/'+base.database+'?sslmode=verify-full'}),error=>error===original);
 assert.equal(fakeConstructors,1);assert.equal(fakeQueries,0);assert.equal(fakeEnds,1);assert.equal(Object.hasOwn(original,'ownAtomicTransaction'),false);
 const observed=ownReleaseAnnulmentAtomicFailureObservation(original);assert.equal(observed.transaction.phase,'factory-identity');assert.equal(observed.transaction.requestedEnd,'COMMIT');assert.equal(observed.transaction.endRequested,false);assert.equal(observed.transaction.sessionTerminated,true);
 // The fake coordinator receives this same exact exception. Reading the
 // missing property would lose requestedEnd; the minted observer retains it.
 const {record}=await run(planFor(),{throwBefore:'installation',originalError:original});assert.equal(failure(record),original);assert.equal(record.status,'UNCERTAIN');assert.equal(record.failure.requestedEnd,'COMMIT');assert.equal(record.failure.endRequested,false);assert.equal(record.failure.error.code,'ECONNRESET');assert.deepEqual(external,[]);
});

test('RAW source drift during awaited installation persistence is detected before requesting COMMIT, with no durable call',async()=>{
 for(const file of [FILE,PROFILE_FILE]){
  const plan=planFor(),h=fakeBundle(plan),original=read(file);let changed=false,record;
  try{
   record=await execute({plan,bundle:h.bundle,persist:async value=>{
    await h.persist(value);
    if(!changed&&value.status==='IN_PROGRESS'&&value.currentSlot==='installation'&&!value.phases.installation.endRequested){changed=true;overrides.set(file,original+'\n-- synthetic RAW drift during pre-end persistence');}
   }});
  }finally{overrides.delete(file);}
  assert.equal(changed,true);assert.equal(record.status,'UNCERTAIN');assert.equal(record.failure.endRequested,false);assert.equal(record.failure.error.code,'ERR_ASSERTION');assert.equal(record.installationCommitObserved,false);assert.equal(h.events.some(event=>event.type==='end'&&event.slot==='installation'),false);assert.equal(h.events.some(event=>event.type==='call'&&event.slot==='durable'),false);assert.match(failure(record).message,/RAW_SOURCE_BOOKEND_CHANGED|ATOMIC_PROTOCOL_RAW_DRIFT/);assert.deepEqual(external,[]);
 }
});
