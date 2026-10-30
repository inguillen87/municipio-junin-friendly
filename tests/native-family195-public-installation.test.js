import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {syntheticReleaseTlsObservations} from './fixtures/own-m10-institutional-receipt-mocks.js';
import {prepareNativeFamily195PublicInstallation as prepare,assertNativeFamily195BuildBinding as bindingCheck,executeNativeFamily195PublicInstallation as execute} from '../scripts/lib/native-family195-public-installation.mjs';
const root=new URL('../',import.meta.url),read=file=>fs.readFileSync(new URL(file,root),'utf8'),sourceCommit='a'.repeat(40),hash=v=>createHash('sha256').update(v).digest('hex');
let cached;const plan=()=>cached??=prepare({read,sourceCommit});
const clone=structuredClone;
// Explicit validator/transport fixtures only. No fixture proves a provider,
// PostgreSQL installation, business circuit, user session or production state.
function buildReceipt(){const p=plan();return {version:'vercel-normal-build-binding-observation.v1',sourceCommit,deploymentId:'dpl_SYNTHETIC195',deploymentReadyObserved:true,effectiveBuildCommandObserved:true,builtinShaMatchedByPinnedVerifier:true,normalBuildEnvironment:true,applicationClientsUseSamePg17Branch:true,applicationClientsObserved:2,metadataSqlOnly:true,metadataSelects:2,ddl:0,dml:0,municipalOperations:0,pg18ApplicationBindingObserved:false,
 records:[...['DATABASE_URL','ACTIONS_DATABASE_URL'].map(clientClass=>({value:{version:'municontrol-vercel-build-db-attestation.v1',event:'observation',sourceSha:sourceCommit,environment:'production',clientClass,serverMajor:17,database:p.target.database,currentUser:clientClass==='DATABASE_URL'?p.target.role:'municontrol_actions_runtime_app',sessionUser:clientClass==='DATABASE_URL'?p.target.role:'municontrol_actions_runtime_app',neonProjectId:p.target.projectId,neonBranchId:p.target.branchId,neonEndpointId:p.target.endpointId,transactionReadOnly:'on',neonIdentityComplete:true}})),{value:{version:'municontrol-vercel-build-db-attestation.v1',event:'complete',sourceSha:sourceCommit,environment:'production',clientsObserved:2,neonIdentityComplete:true,observationOnly:true}}]};}
function binding(receipt=buildReceipt()){const raw=Buffer.from(JSON.stringify(receipt));return {bindingRaw:raw,bindingSha256:hash(raw)};}
function preflightRows(){const p=plan(),o={version:'native-family195-public-material-preflight.v1',sourceCommit,sourceHashes:clone(p.sourceHashes),serverMajor:17,database:p.target.database,currentUser:p.target.role,sessionUser:p.target.role,readOnly:'on',isolation:'repeatable read',prerequisiteFunctionCount:13,prerequisiteFunctionsSourceGuardPassed:true,
 relations:[],newObjects:{relations:[],types:[],functions:[],triggers:[]},capabilityDefinitions:[],assignmentCounts:{roles:0,overrides:0,exclusive:0}};
 // Actual required parents come from the emitted source contract, not a copy of
 // its names. The strings below are decoded as data; no SQL is executed.
 const sql=p.phases.preflight.find(s=>s.startsWith('WITH wanted(name)'));
 const names=/SELECT unnest\(ARRAY\[([^]*?)\]::text\[\]\)/.exec(sql);assert.ok(names);
 o.relations=[...names[1].matchAll(/'([^']+)'/g)].map(m=>({name:m[1],present:true,catalog:{class:{relname:m[1]},columns:[],constraints:[],indexes:[],triggers:[],policies:[]}}));
 return [[{observation:o}],[{layout:{version:'native-family195-prerequisite-table-layout.v1',contractSha256:p.layout.contractSha256,searchPath:'pg_catalog, public, pg_temp',serverVersionNum:170011,relations:8,mismatches:[]}}]];}
function proof(initial){const c=plan().proofContract,prior='c'.repeat(64);return {version:c.version,sourceCommit:c.sourceCommit,sourceHashes:clone(c.sourceHashes),sql195Sha256:c.sql195Sha256,...c.fixed,...(initial?{beforeFingerprint:prior}:{}),priorFingerprint:prior,objectFingerprint:'d'.repeat(64),prerequisiteFingerprint:'e'.repeat(64)};}
function harness({alter,errorAt,closeError}={}){
 const slots=['epoch','rehearsal','installation','durable','repetition'],identities=Object.fromEntries(slots.map((s,i)=>[s,{pid:4000+i,backendStart:'2026-10-27T00:00:00+00:00',serverVersionNum:'170011'}]));
 const calls=[],states=[],client=async()=>bundle;
 const bundle={version:'own-release-annulment-dedicated-pg.v2',target:{...plan().target,transport:'postgres_tls_dedicated'},identities,tlsObservations:syntheticReleaseTlsObservations(identities,plan().target),
 async transaction(slot,statements,options){calls.push({slot,statements,options});if(errorAt===calls.length)throw Error('SYNTHETIC_TRANSPORT_FAILURE');
  if(slot==='rehearsal'){const e=Object.assign(Error('FAMILY_SELF195_REHEARSAL_LATE_FAILURE'),{code:'P0001'});Object.defineProperty(e,'ownDedicatedSession',{value:{slot,native:identities[slot],sessionTerminated:true}});if(alter)alter({kind:'rehearsal',error:e});throw e;}
  let rows=statements===plan().phases.preflight?preflightRows():[[{proof:proof(slot==='installation')}]];if(alter)alter({kind:'rows',slot,rows,call:calls.length});return rows;
 },async close(){calls.push({close:true});if(closeError)throw Error('SYNTHETIC_CLOSE_FAILURE');}};
 return {client,bundle,calls,states,record:value=>states.push(clone(value))};
}
test('plan reuses canonical195 phases, keeps destination guards and repeats only independent reads',()=>{
 const p=plan();assert.equal(p.major,17);assert.equal(p.productionAdmission,false);assert.equal(p.readOnlyTransactionEnd,'COMMIT');assert.equal(p.readOnlyRollbackObserved,false);assert.equal(p.repetitionKind,'read-only-verification');
 assert.equal(p.dependencySource.version,'8.23.1');assert.equal(p.roleAssignmentsAdded,0);assert.equal(p.businessOperations,0);
 assert.deepEqual(p.phases.durable,p.phases.repetition);assert.ok(p.phases.installation.some(s=>s.startsWith('CREATE TABLE public.native_family_request')));
 assert.ok(p.phases.rehearsal.at(-1).includes('FAMILY_SELF195_REHEARSAL_LATE_FAILURE'));assert.ok(!p.phases.rehearsal.some(s=>s===p.phases.installation.at(-1)));
 for(const s of p.phases.repetition)assert.ok(!s.startsWith('CREATE '));
 for(const phase of Object.values(p.phases)){assert.ok(phase.some(s=>s.startsWith('DO $destination$')));assert.ok(phase.includes("SET LOCAL search_path=pg_catalog, public, pg_temp"));}
});
test('normal build binding validates both actual client classes and rejects old SHA, role, environment or target',()=>{
 const b=binding();assert.equal(bindingCheck({raw:b.bindingRaw,sha256:b.bindingSha256,sourceCommit,target:plan().target}).schemaReadinessProved,false);
 for(const mutate of [r=>r.sourceCommit='b'.repeat(40),r=>r.records[0].value.neonBranchId='foreign',r=>r.records[1].value.currentUser='neondb_owner',r=>r.records[1].value.environment='preview',r=>r.records[2].value.clientsObserved=1,r=>r.ddl=1,r=>r.deploymentReadyObserved=false]){const r=buildReceipt();mutate(r);const x=binding(r);assert.throws(()=>bindingCheck({raw:x.bindingRaw,sha256:x.bindingSha256,sourceCommit,target:plan().target}));}
 assert.throws(()=>bindingCheck({raw:Buffer.from(b.bindingRaw.toString()+' '),sha256:b.bindingSha256,sourceCommit,target:plan().target}),/BYTES_CHANGED/);
});
test('coordinator runs preflight, exact late rollback readback, one install and two RO verifications in order',async()=>{
 const h=harness(),result=await execute({plan:plan(),...binding(),client:h.client,record:h.record});
 assert.equal(result.state,'VALIDATED');assert.equal(result.liveTransport,false);assert.equal(result.noeliaReady,false);assert.equal(result.durabilityVerified,true);assert.equal(result.readOnlyRollbackObserved,false);assert.equal(result.rehearsalRollbackCommandObserved,false);
 assert.deepEqual(h.calls.filter(x=>!x.close).map(x=>[x.slot,x.options.readOnly]),[['epoch',true],['rehearsal',false],['epoch',true],['installation',false],['durable',true],['epoch',true]]);
 assert.equal(h.calls.filter(x=>x.slot==='installation').length,1);assert.equal(h.calls.at(-1).close,true);
 assert.equal(result.rehearsalMessageToken,'FAMILY_SELF195_REHEARSAL_LATE_FAILURE');assert.equal(result.roleAssignmentsAdded,0);
 const recordedInstall=h.states.findIndex(x=>x.installed===true);const durableStart=h.states.findIndex(x=>x.phase==='durable');assert.ok(recordedInstall>=0&&recordedInstall<durableStart);assert.ok(h.states[recordedInstall].installedProof);
});
test('wrong rehearsal code/token/session end never authorizes subsequent SQL',async()=>{
 for(const change of [e=>e.code='XX000',e=>e.message='ANOTHER_TOKEN',e=>{e.ownDedicatedSession.sessionTerminated=false;},e=>{e.ownDedicatedSession.native={...e.ownDedicatedSession.native,pid:1};}]){
  const h=harness({alter:o=>{if(o.kind==='rehearsal')change(o.error);}});await assert.rejects(execute({plan:plan(),...binding(),client:h.client,record:h.record}),/INSTALL_UNCERTAIN/);assert.equal(h.calls.filter(x=>!x.close).length,2);assert.equal(h.states.at(-1).noFurtherSql,true);
 }
});
test('family195 distinguishes backend SSL from strict client TLS and rejects malformed channel observations before SQL',async()=>{
 const accepted=harness();assert.ok(accepted.bundle.tlsObservations.every(row=>row.postgresSsl===false));
 const result=await execute({plan:plan(),...binding(),client:accepted.client,record:accepted.record});assert.equal(result.state,'VALIDATED');
 for(const mutate of [
  b=>{b.version='own-release-annulment-dedicated-pg.v1';},
  b=>{b.tlsObservations[0].clientTls.encrypted=false;},
  b=>{b.tlsObservations[0].clientTls.authorized=false;},
  b=>{b.tlsObservations[0].clientTls.hostnameVerified=false;},
  b=>{b.tlsObservations[0].clientTls.rejectUnauthorized=false;},
  b=>{b.tlsObservations[0].clientTls.servername='foreign.invalid';},
  b=>{b.tlsObservations[0].clientTls.protocol='TLSv1.1';},
  b=>{b.tlsObservations[0].clientTls.peerCertificateSha256='invalid';},
  b=>{b.tlsObservations[0].postgresSsl='false';},
  b=>{b.tlsObservations[1]=structuredClone(b.tlsObservations[0]);}
 ]){const h=harness();mutate(h.bundle);await assert.rejects(execute({plan:plan(),...binding(),client:h.client,record:h.record}));assert.equal(h.calls.filter(x=>!x.close).length,0);}
});
test('partial source material and layout drift stop before any rehearsal or installation',async()=>{
 for(const change of [rows=>rows[0][0].observation.newObjects.functions.push({signature:'stray'}),rows=>rows[1][0].layout.mismatches.push({relation:'school_certificate_blob',area:'check',detail:'weakened'}),rows=>rows[0][0].observation.prerequisiteFunctionsSourceGuardPassed=false]){
  const h=harness({alter:o=>{if(o.kind==='rows'&&o.call===1)change(o.rows);}});await assert.rejects(execute({plan:plan(),...binding(),client:h.client,record:h.record}));assert.equal(h.calls.filter(x=>!x.close).length,1);
 }
});
test('a changed rollback readback, install conservation failure or invalid durable proof cannot continue',async()=>{
 for(const [call,change]of [[3,r=>{r[0][0].observation.relations[0].catalog.class.reltuples=42;}],[4,r=>{r[0][0].proof.beforeFingerprint='f'.repeat(64);}],[5,r=>{r[0][0].proof.objectFingerprint='f'.repeat(64);}],[6,r=>{r[0][0].proof.requestRows=1;}]]){
  const h=harness({alter:o=>{if(o.kind==='rows'&&o.call===call)change(o.rows);}});await assert.rejects(execute({plan:plan(),...binding(),client:h.client,record:h.record}));assert.equal(h.calls.filter(x=>!x.close).length,call);assert.equal(h.states.at(-1).noCleanup,true);
 }
});
test('ambiguous transport, duplicated proof columns and close failure preserve uncertainty without retry',async()=>{
 const h=harness({errorAt:4});await assert.rejects(execute({plan:plan(),...binding(),client:h.client,record:h.record}));assert.equal(h.calls.filter(x=>!x.close).length,4);assert.equal(h.states.at(-1).installed,false);
 const duplicate=harness({alter:o=>{if(o.kind==='rows'&&o.call===4)o.rows.push([{proof:proof(true)}]);}});await assert.rejects(execute({plan:plan(),...binding(),client:duplicate.client,record:duplicate.record}));assert.equal(duplicate.calls.filter(x=>!x.close).length,4);
 const close=harness({closeError:true});await assert.rejects(execute({plan:plan(),...binding(),client:close.client,record:close.record}));assert.equal(close.states.at(-1).state,'UNCERTAIN');assert.equal(close.states.at(-1).durabilityVerified,true);
});
test('cloned plan and changed build bytes reject before client acquisition',async()=>{
 let acquired=0;const client=async()=>{acquired++;throw Error('should not acquire');};const record=()=>{};
 await assert.rejects(execute({plan:{...plan()},...binding(),client,record}),/SOURCE_PLAN_REQUIRED/);
 const b=binding();await assert.rejects(execute({plan:plan(),bindingRaw:Buffer.from(b.bindingRaw.toString()+' '),bindingSha256:b.bindingSha256,client,record}),/BYTES_CHANGED/);assert.equal(acquired,0);
});
