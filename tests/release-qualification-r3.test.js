// PROPOSED by Claude (source only; not run by Claude). Target: tests/release-qualification-r3.test.js
// R3 causal regressions: semantic build binding from real attestation records, pinned verifier bytes at the
// candidate, and the effective build command seen by GET (READY and pre-promotion). Synthetic data only.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {RELEASE_CONTRACT as C} from '../scripts/release-qualification-contract.mjs';
import {evaluateQualification,evaluateStage,evaluateBuildBinding,validateAdmission,productionTarget,stageBuildCommand} from '../scripts/release-qualification-gate.mjs';
import {runReleaseStage,runReleasePromotion} from '../scripts/release-promotion-runner.mjs';
import {OWN_RELEASE_TARGETS} from '../scripts/lib/own-payroll-release-target.mjs';
import {SHA,OTHER,STAGED,hash,enc,repoBytes,contentAnswer,observation,releaseInfo,deployment,createObservation,binding,admission,
 TARGET,RUNTIME_ROLE,observationRecord,completeRecord,attestationRecords,fakeWorld} from './fixtures/release-qualification-synthetic.js';

const VERIFIER='scripts/verify-vercel-build-db-attestation.mjs';
const q=mutate=>{const o=structuredClone(observation());mutate?.(o);return evaluateQualification({sha:SHA,observation:o});};
const stage=()=>evaluateStage({qualification:q(),createObservation:createObservation(),deployment:deployment(STAGED),releaseInfo:releaseInfo()});
const bind=(records,over={})=>evaluateBuildBinding({stage:stage(),binding:binding({records,...over.binding}),admission:over.admission??admission()});
const has=(result,code)=>{assert.ok(result.reasons.includes(code),code+' not in '+JSON.stringify(result.reasons));assert.equal(result.bound??result.qualified??result.stageVerified,false);};
const recs=edit=>{const r=attestationRecords();edit(r);return r;};
// Known TEST destination (br-orange-rain / ep-aged-firefly): a real, admitted-for-TEST endpoint that is NOT production.
const TEST={neonProjectId:TARGET.projectId,neonBranchId:'br-orange-rain-ac6uvvxu',neonEndpointId:'ep-aged-firefly-acoaqlsh'};

test('contrato R3 = fuentes del repo: pin del verificador, rol runtime y destinos canónicos',()=>{
 assert.equal(C.pinnedSources.length,1);assert.equal(C.pinnedSources[0].path,VERIFIER);
 assert.equal(hash(repoBytes(VERIFIER)),C.pinnedSources[0].sha256,'verifier bytes in the repo = reviewed body');
 const verifier=Buffer.from(repoBytes(VERIFIER)).toString('utf8');
 assert.ok(verifier.indexOf('provisionAbsent(env);\n  const context=buildContext(env,sourceSha);')>0,'guard runs before context/clients');
 assert.ok(verifier.indexOf('provisionAbsent(env);\n  if(argv.length!==2')>0&&verifier.indexOf('provisionAbsent(env);\n  if(argv.length!==2')<verifier.indexOf("await import('@neondatabase/serverless')"),'guard runs before the driver import');
 assert.ok(Buffer.from(repoBytes('lib/internal-identity-access.js')).toString('utf8').includes("const IDENTITY_RUNTIME_ROLE = 'municontrol_actions_runtime_app';"));
 assert.equal(C.buildClients.actionsRuntimeRole,RUNTIME_ROLE);
 assert.deepEqual(OWN_RELEASE_TARGETS.map(t=>t.major).sort(),[17,18]);
 for(const t of OWN_RELEASE_TARGETS)assert.equal(productionTarget(admission({productionDatabaseMajor:t.major})),t);
});

test('verificador en el SHA candidato: bytes ajenos, ausentes o incoherentes no califican',()=>{
 assert.equal(q().qualified,true);
 has(q(o=>{o.contents[VERIFIER]=contentAnswer(VERIFIER,enc(Buffer.from(repoBytes(VERIFIER)).toString('utf8').replace("fail('PROVISION_EVENT_PRESENT')","void 0")));}),'PINNED_SOURCE_CHANGED:'+VERIFIER);
 has(q(o=>{o.contents[VERIFIER]=contentAnswer(VERIFIER,enc(Buffer.from(repoBytes(VERIFIER)).toString('utf8')+'\n'));}),'PINNED_SOURCE_CHANGED:'+VERIFIER);
 has(q(o=>{delete o.contents[VERIFIER];}),'CONTENT_INVALID:'+VERIFIER);
 has(q(o=>{o.contents[VERIFIER].sha='0'.repeat(40);}),'CONTENT_BLOB_MISMATCH:'+VERIFIER);
 has(q(o=>{o.contents[VERIFIER].size-=1;}),'CONTENT_BLOB_MISMATCH:'+VERIFIER);
});

test('admisión: el destino productivo es una entrada canónica nombrada por root, nunca inferida',()=>{
 for(const productionDatabaseMajor of [undefined,null,16,'17',17.5])assert.deepEqual(validateAdmission(admission({productionDatabaseMajor}),SHA),['ADMISSION_PRODUCTION_DATABASE']);
 assert.deepEqual(validateAdmission(admission(),SHA),[]);
});

test('binding: registros reales completos ligan SHA, producción, roles y destino; se conservan registros y tiempos',()=>{
 const r=bind(attestationRecords());assert.equal(r.bound,true,JSON.stringify(r.reasons));
 assert.deepEqual(r.records,[{created:1793100766887,event:'observation',clientClass:'DATABASE_URL'},{created:1793100767264,event:'observation',clientClass:'ACTIONS_DATABASE_URL'},{created:1793100767264,event:'complete',clientClass:null}]);
 assert.match(r.recordsSha256,/^[a-f0-9]{64}$/);assert.deepEqual(r.target,{major:17,projectId:TARGET.projectId,branchId:TARGET.branchId,endpointId:TARGET.endpointId,database:TARGET.database});
 assert.equal(bind(recs(x=>{x[0].value.configuredHostname='ep-aged-firefly-acoaqlsh.sa-east-1.aws.neon.tech';})).bound,true,'the hostname is never used as identity');
});

test('binding: flags y contadores sin registros, o registros vacíos, no alcanzan',()=>{
 has(bind(undefined),'BINDING_RECORDS_MISSING');has(bind(null),'BINDING_RECORDS_MISSING');
 const {records,...flagsOnly}=binding();has(evaluateBuildBinding({stage:stage(),binding:flagsOnly,admission:admission()}),'BINDING_RECORDS_MISSING');
 const empty=bind([]);has(empty,'BINDING_RECORDS_SHAPE');has(empty,'BINDING_OBSERVATION_MISSING:DATABASE_URL');has(empty,'BINDING_COMPLETE_MISSING');
 has(bind(recs(x=>{x[1].created=null;})),'BINDING_RECORDS_SHAPE');has(bind(recs(x=>{x[2]={created:1,value:null};})),'BINDING_RECORDS_SHAPE');
});

test('binding: dos clientes en TEST u otro endpoint; destino esperado viene de la admisión, no de lo observado',()=>{
 const testBoth=bind(recs(x=>{Object.assign(x[0].value,TEST);Object.assign(x[1].value,TEST);}));
 has(testBoth,'BINDING_DESTINATION:DATABASE_URL');has(testBoth,'BINDING_DESTINATION:ACTIONS_DATABASE_URL');
 has(bind(recs(x=>{x[1].value.neonEndpointId='ep-other-endpoint-1';})),'BINDING_DESTINATION:ACTIONS_DATABASE_URL');
 has(bind(recs(x=>{x[0].value.serverMajor=18;})),'BINDING_DESTINATION:DATABASE_URL');
 has(bind(recs(x=>{x[0].value.database='neondb_copy';})),'BINDING_DESTINATION:DATABASE_URL');
 const otherAdmitted=bind(attestationRecords(),{admission:admission({productionDatabaseMajor:18})});
 has(otherAdmitted,'BINDING_DESTINATION:DATABASE_URL');has(otherAdmitted,'BINDING_DESTINATION:ACTIONS_DATABASE_URL');
 has(bind(attestationRecords(),{admission:admission({productionDatabaseMajor:undefined})}),'BINDING_TARGET_UNADMITTED');
});

test('binding: roles cruzados, sessionUser distinto, campos nulos o extra, sólo lectura ausente',()=>{
 const crossed=bind(recs(x=>{Object.assign(x[0].value,{currentUser:RUNTIME_ROLE,sessionUser:RUNTIME_ROLE});Object.assign(x[1].value,{currentUser:TARGET.role,sessionUser:TARGET.role});}));
 has(crossed,'BINDING_ROLE:DATABASE_URL');has(crossed,'BINDING_ROLE:ACTIONS_DATABASE_URL');
 has(bind(recs(x=>{x[1].value.sessionUser=TARGET.role;})),'BINDING_ROLE:ACTIONS_DATABASE_URL');
 has(bind(recs(x=>{x[0].value.currentUser='someone_else';})),'BINDING_ROLE:DATABASE_URL');
 has(bind(recs(x=>{Object.assign(x[0].value,{neonEndpointId:null,neonIdentityComplete:false});})),'BINDING_NEON_IDENTITY:DATABASE_URL');
 has(bind(recs(x=>{x[1].value.transactionReadOnly='off';})),'BINDING_READ_ONLY:ACTIONS_DATABASE_URL');
 has(bind(recs(x=>{x[0].value.connectionString='postgresql://redacted';})),'BINDING_OBSERVATION_FIELDS:DATABASE_URL');
 has(bind(recs(x=>{delete x[1].value.configuredHostnameSource;})),'BINDING_OBSERVATION_FIELDS:ACTIONS_DATABASE_URL');
});

test('binding: versión, SHA, ambiente, eventos y clientes duplicados/ajenos',()=>{
 has(bind(recs(x=>{x[0].value.version='municontrol-vercel-build-db-attestation.v0';})),'BINDING_RECORD_VERSION');
 has(bind(recs(x=>{x[1].value.sourceSha=OTHER;})),'BINDING_RECORD_SHA');has(bind(recs(x=>{x[2].value.sourceSha=OTHER;})),'BINDING_RECORD_SHA');
 has(bind(recs(x=>{for(const r of x)r.value.environment='preview';})),'BINDING_RECORD_ENVIRONMENT');
 has(bind(recs(x=>{x[2]={created:1793100767264,value:{version:'municontrol-vercel-build-db-attestation.v1',event:'failure',code:'CLIENT_UNAVAILABLE',clientClass:null}};})),'BINDING_RECORD_EVENT:failure');
 const twoOwners=bind(recs(x=>{x[1]={created:1793100767264,value:observationRecord('DATABASE_URL',TARGET.role)};}));
 has(twoOwners,'BINDING_OBSERVATION_DUPLICATE:DATABASE_URL');has(twoOwners,'BINDING_OBSERVATION_MISSING:ACTIONS_DATABASE_URL');
 has(bind(recs(x=>{x[1].value.clientClass='OTHER_DATABASE_URL';})),'BINDING_OBSERVATION_UNEXPECTED');
});

test('binding: complete duplicado, ausente, incoherente o anterior a las observaciones',()=>{
 const dup=bind(recs(x=>{x.push({created:1793100767300,value:completeRecord()});}));has(dup,'BINDING_COMPLETE_DUPLICATE');has(dup,'BINDING_RECORDS_SHAPE');
 has(bind(recs(x=>{x.pop();})),'BINDING_COMPLETE_MISSING');
 has(bind(recs(x=>{x[2].value.clientsObserved=1;})),'BINDING_COMPLETE_INCOHERENT');
 has(bind(recs(x=>{x[2].value.observationOnly=false;})),'BINDING_COMPLETE_INCOHERENT');
 has(bind(recs(x=>{x[2].value.neonIdentityComplete=null;})),'BINDING_COMPLETE_INCOHERENT');
 has(bind(recs(x=>{x[2].created=1793100766000;})),'BINDING_COMPLETE_BEFORE_OBSERVATION');
});

test('comando efectivo: el eco de CREATE no alcanza; el GET READY debe mostrarlo exacto y sin contradicción',()=>{
 const s=over=>evaluateStage({qualification:q(),createObservation:createObservation(),deployment:deployment(STAGED,over),releaseInfo:releaseInfo()});
 assert.equal(s({}).stageVerified,true);assert.equal(s({projectSettings:undefined,buildCommand:stageBuildCommand(SHA)}).stageVerified,true);
 has(s({projectSettings:undefined}),'STAGE_GET_BUILD_COMMAND_UNOBSERVED');has(s({projectSettings:{buildCommand:null}}),'STAGE_GET_BUILD_COMMAND_UNOBSERVED');
 has(s({projectSettings:{buildCommand:'npm run build:vercel'}}),'STAGE_GET_BUILD_COMMAND_CHANGED');
 has(s({projectSettings:{buildCommand:stageBuildCommand(OTHER)}}),'STAGE_GET_BUILD_COMMAND_CHANGED');
 has(s({buildCommand:'npm run build'}),'STAGE_GET_BUILD_COMMAND_CHANGED');
});

const packet=()=>fs.mkdtempSync(path.join(os.tmpdir(),'release-r3-'));
const mutations=calls=>calls.filter(c=>c==='vercel.create'||c==='adapter.promote'||c==='vercel.run');
test('runner: GET READY con otro comando no deja stage verificado',async()=>{
 const w=fakeWorld();const get=w.transport.vercel.getDeployment;
 w.transport.vercel.getDeployment=async id=>{const a=await get(id);if(id!==STAGED)return a;const d=JSON.parse(a.text);d.projectSettings={buildCommand:'npm run build:vercel'};return{exitCode:0,text:JSON.stringify(d)};};
 const dir=packet(),r=await runReleaseStage({sha:SHA,packet:dir,admission:admission(),transport:w.transport,pause:w.pause});
 assert.equal(r.state,'STAGE_REJECTED_NO_PROMOTION');assert.ok(r.stage.reasons.includes('STAGE_GET_BUILD_COMMAND_CHANGED'));assert.equal(fs.existsSync(path.join(dir,'STAGE_VERIFIED.json')),false);
});
test('runner: GET prepromoción con comando distinto o ausente -> sin mutación; binding sin registros -> sin mutación',async()=>{
 for(const change of [d=>{d.projectSettings={buildCommand:'npm run build'};},d=>{delete d.projectSettings;}]){
  const w=fakeWorld(),dir=packet();assert.equal((await runReleaseStage({sha:SHA,packet:dir,admission:admission(),transport:w.transport,pause:w.pause})).state,'STAGE_VERIFIED_AWAITING_ROOT_BUILD_BINDING');
  change(w.state.deployments[STAGED]);w.calls.length=0;
  const r=await runReleasePromotion({sha:SHA,packet:dir,admission:admission(),binding:binding(),adapter:w.adapter,transport:w.transport,pause:w.pause});
  assert.equal(r.state,'STAGE_REVERIFICATION_FAILED_NO_MUTATION');assert.deepEqual(mutations(w.calls),[]);
 }
 const w=fakeWorld(),dir=packet();await runReleaseStage({sha:SHA,packet:dir,admission:admission(),transport:w.transport,pause:w.pause});w.calls.length=0;
 const {records,...flagsOnly}=binding();
 const r=await runReleasePromotion({sha:SHA,packet:dir,admission:admission(),binding:flagsOnly,adapter:w.adapter,transport:w.transport,pause:w.pause});
 assert.equal(r.state,'BUILD_BINDING_REJECTED_NO_MUTATION');assert.ok(r.binding.reasons.includes('BINDING_RECORDS_MISSING'));assert.deepEqual(mutations(w.calls),[]);
});
