// PROPOSED by Claude (source only; not run by Claude). Target: tests/release-qualification-gate.test.js
// Pure regressions for false greens. Synthetic provider answers only: no network, CI, Vercel or credentials.
import test from 'node:test';import assert from 'node:assert/strict';
import {RELEASE_CONTRACT as C,CHECKOUT_ATTESTATION_STEP} from '../scripts/release-qualification-contract.mjs';
import {projectNoeliaAnnulmentWorkflowToFiscalEpoch} from './fixtures/noelia-fiscal-workflow-source-projection.js';
import {evaluateQualification,evaluateProductionHolder,evaluateStage,evaluateBuildBinding,evaluateReadback,validateAdmission,paginated,contentBytes,stageBuildCommand} from '../scripts/release-qualification-gate.mjs';
import {zipEntries,zipEntryBytes} from '../scripts/lib/release-zip-entries.mjs';
import {SHA,OTHER,ADMIN,PREVIOUS,STAGED,hash,enc,repoBytes,contentAnswer,zipOf,reportFor,reportZip,observation,setPages,replaceZip,
 releaseInfo,deployment,createObservation,binding,admission,inspectionsFor} from './fixtures/release-qualification-synthetic.js';

const [NOELIA,CAPACITY]=C.workflows,[N_RUN,C_RUN]=[100,101];
const q=mutate=>{const o=structuredClone(observation());mutate?.(o);return evaluateQualification({sha:SHA,observation:o});};
const has=(mutate,code)=>{const r=q(mutate);assert.ok(r.reasons.includes(code),code+' not in '+JSON.stringify(r.reasons));assert.equal(r.qualified,false);};
const run0=(o,change)=>Object.assign(o.runsPages[0].workflow_runs[0],change);
const jobsOf=(o,runId)=>o.jobsPagesByRun[runId][0].jobs;

const capacityFullSuite='      - name: Full web suite and package\n        shell: bash\n        run: |\n          set -o pipefail\n          mkdir -p verification\n          npm run build 2>&1 | tee verification/release-full-suite.log\n';
function assertCapacityFullSuite(source){
 assert.equal(source.split(capacityFullSuite).length,2,'one exact full-suite capture with pipefail');
 assert.equal([...source.matchAll(/^[ \t]+(?:- )?(?:run:[ \t]*)?npm run build\b/gm)].length,1,'one full build; no duplicate or filtered replacement');
}

test('contrato = bytes revisados del repo: rutas, nombres, matrices, pasos, atestación, artefactos, scripts y vercel.json',()=>{
 assert.ok(Object.isFrozen(C)&&Object.isFrozen(C.workflows[0].jobs[0].report.fields));
 assert.deepEqual(C.workflows.map(w=>w.path),['.github/workflows/noelia-payroll-circuit.yml','.github/workflows/own-payroll-full-capacity.yml']);
 for(const w of C.workflows){
  const bytes=repoBytes(w.path),text=Buffer.from(bytes).toString('utf8');
  assert.equal(hash(bytes),w.sha256,w.path);assert.equal(text.includes('\r'),false);
  assert.ok(text.startsWith('name: '+w.name+'\n')||text.includes('\nname: '+w.name+'\n'),w.path);
  const named=[...text.matchAll(/^      - name: (.+)$/gm)].map(m=>m[1]);
  assert.deepEqual(named,w.steps,'every named step, in order');assert.equal(w.steps[0],CHECKOUT_ATTESTATION_STEP);
  assert.ok(text.includes('      - name: '+CHECKOUT_ATTESTATION_STEP+'\n        run: test "$(git rev-parse HEAD)" = "$GITHUB_SHA"\n'));
  assert.ok(text.includes('\n  workflow_dispatch:\n'),'dispatch on the exact ref must exist');
  assert.equal((text.match(/--source-commit=\$\{\{ github\.sha \}\}/g)??[]).length>0,true);
  assert.equal(w.jobs.map(j=>j.major).join(),'17,18');
 }
 const noelia=Buffer.from(repoBytes(NOELIA.path)).toString('utf8'),capacity=Buffer.from(repoBytes(CAPACITY.path)).toString('utf8');
 assert.ok(noelia.includes('\n  circuit:\n')&&noelia.includes('      matrix:\n        major: [17, 18]\n')&&noelia.includes('name: noelia-circuit-pg${{ matrix.major }}-${{ github.sha }}\n'));
 assert.ok(noelia.includes('      - name: Build and run all existing regressions\n        run: npm run build\n'),'full suite inside both Noelia jobs');
 assert.ok(noelia.includes('node scripts/verify-noelia-payroll-circuit.mjs --transport=ci --major=${{ matrix.major }} --source-commit=${{ github.sha }} --browser=chromium --jurisdictions=true --positions=true --fiscal=true --annulment=true --output=verification/noelia-circuit-ci\n'));
 assert.ok(capacity.includes('    name: M7, receipt126 and Family195 browser, positions210-212 SQL / PG${{ matrix.pg }} / published107\n')&&capacity.includes('        pg: [17, 18]\n'));
 assertCapacityFullSuite(capacity);
 assert.ok(capacity.includes('--major=${{ matrix.pg }} --transport=ci --source-commit=${{ github.sha }} --operational-pair-baseline=published107 --output=verification/own-full-capacity-pg${{ matrix.pg }}\n'));
 assert.ok(capacity.includes('name: own-full-capacity-pg${{ matrix.pg }}-published107-${{ github.sha }}\n'));
 const pkg=JSON.parse(Buffer.from(repoBytes('package.json')).toString('utf8')),vercel=JSON.parse(Buffer.from(repoBytes('vercel.json')).toString('utf8'));
 for(const [k,v] of Object.entries(C.scripts))assert.equal(pkg.scripts[k],v,k);
 assert.equal(vercel.buildCommand,'npm run build:vercel');assert.equal(C.vercelJson.buildCommand,vercel.buildCommand);assert.deepEqual(vercel.git,{deploymentEnabled:{'internal-*':false,master:false}});
 assert.equal(new Set(C.vercel.productionDomains).size,3);assert.match(stageBuildCommand(SHA),/^node scripts\/verify-vercel-build-db-attestation\.mjs --source-sha a{40} && npm run build:vercel$/);
});

test('califica sólo con los cuatro jobs revisados, sus pasos y sus informes del mismo SHA canónico; nunca es suficiente',()=>{
 const r=q();assert.deepEqual(r.reasons,[]);assert.equal(r.qualified,true);assert.match(r.note,/never sufficient/);assert.ok(Object.isFrozen(r));
 assert.deepEqual(r.evidence.runs.map(x=>[x.runId,x.event,x.jobs.map(j=>j.major).join()]),[[N_RUN,'push','17,18'],[C_RUN,'push','17,18']]);
 assert.ok(r.evidence.runs.every(x=>x.jobs.every(j=>/^sha256:[a-f0-9]{64}$/.test(j.artifact.digest))));
 assert.deepEqual(Object.keys(r.evidence.files).sort(),['.github/workflows/noelia-payroll-circuit.yml','.github/workflows/own-payroll-full-capacity.yml','package.json','scripts/verify-vercel-build-db-attestation.mjs','vercel.json']);
 assert.ok(q(o=>{for(const r of o.runsPages[0].workflow_runs)r.event='workflow_dispatch';}).qualified,'dispatch on master of the same SHA');
});

test('SHA: formato, observación ajena, cabeza canónica movida o commit no observado',()=>{
 assert.deepEqual(evaluateQualification({sha:'A'.repeat(40),observation:observation()}).reasons,['SHA_FORMAT']);
 assert.deepEqual(evaluateQualification({sha:SHA}).reasons,['OBSERVATION_MISSING']);
 has(o=>{o.sha=OTHER;},'OBSERVATION_SHA');
 has(o=>{o.masterRef.object.sha=OTHER;},'SHA_NOT_CANONICAL_HEAD');has(o=>{o.masterRef.object.type='tag';},'SHA_NOT_CANONICAL_HEAD');
 has(o=>{o.commit.sha=OTHER;},'COMMIT_UNOBSERVED');
});

test('nunca se heredan corridas de otro SHA, fork, repo homónimo, PR/merge, otra rama o workflow homónimo de otra ruta',()=>{
 const tag=NOELIA.path;
 has(o=>run0(o,{head_sha:OTHER}),'RUN_MISSING:'+tag);
 has(o=>run0(o,{head_repository:{id:C.repository.id,full_name:'fork/municipio-junin-friendly'}}),'RUN_MISSING:'+tag);
 has(o=>run0(o,{head_repository:{id:1,full_name:C.repository.fullName}}),'RUN_MISSING:'+tag);
 has(o=>run0(o,{repository:{id:C.repository.id,full_name:'other/municipio-junin-friendly'}}),'RUN_MISSING:'+tag);
 has(o=>run0(o,{event:'pull_request'}),'RUN_NOT_CANONICAL_EVENT:'+tag);
 has(o=>run0(o,{event:'pull_request_target'}),'RUN_NOT_CANONICAL_EVENT:'+tag);
 has(o=>run0(o,{head_branch:'codex/integrated-native-payroll-circuit-20261021'}),'RUN_NOT_CANONICAL_EVENT:'+tag);
 has(o=>run0(o,{path:'.github/workflows/noelia-payroll-circuit-copy.yml'}),'RUN_MISSING:'+tag);
 has(o=>run0(o,{name:'Noelia complete own payroll circuit (renamed)'}),'WORKFLOW_NAME_CHANGED:'+tag);
});

test('estados no terminados y conclusiones distintas de success, en corrida, job y paso',()=>{
 const tag=NOELIA.path;
 for(const status of ['queued','requested','waiting','pending','in_progress'])has(o=>run0(o,{status,conclusion:null}),'RUN_INCOMPLETE:'+tag);
 for(const conclusion of ['failure','cancelled','timed_out','skipped','neutral','action_required','stale','startup_failure',null]){
  has(o=>run0(o,{conclusion}),'RUN_NOT_SUCCESS:'+tag+':'+String(conclusion));
  has(o=>{jobsOf(o,N_RUN)[1].conclusion=conclusion;},'JOB_NOT_SUCCESS:'+tag+':circuit (18):'+String(conclusion));
 }
 has(o=>{Object.assign(jobsOf(o,N_RUN)[0],{status:'in_progress',conclusion:null});},'JOB_NOT_SUCCESS:'+tag+':circuit (17):null');
 has(o=>{jobsOf(o,N_RUN)[0].head_sha=OTHER;},'JOB_NOT_SUCCESS:'+tag+':circuit (17):success');
 const step='Complete actual HTTP, SQL and browser circuit, jurisdiction and annual positions';
 has(o=>{jobsOf(o,N_RUN)[1].steps.find(s=>s.name===step).conclusion='skipped';},'STEP_NOT_SUCCESS:'+tag+':circuit (18):'+step+':skipped');
 has(o=>{jobsOf(o,C_RUN)[0].steps.at(-1).conclusion='cancelled';},'STEP_NOT_SUCCESS:'+CAPACITY.path+':'+CAPACITY.jobs[0].name+':Complete job:cancelled');
});

test('matriz incompleta, duplicada o ajena; pasos obligatorios ausentes o duplicados',()=>{
 const tag=NOELIA.path,ctag=CAPACITY.path;
 has(o=>setPages(o,'jobs',N_RUN,jobsOf(o,N_RUN).slice(0,1)),'JOB_MISSING:'+tag+':circuit (18)');
 has(o=>setPages(o,'jobs',C_RUN,jobsOf(o,C_RUN).slice(1)),'JOB_MISSING:'+ctag+':'+CAPACITY.jobs[0].name);
 has(o=>setPages(o,'jobs',N_RUN,[...jobsOf(o,N_RUN),{...jobsOf(o,N_RUN)[1],id:999}]),'JOB_DUPLICATE:'+tag+':circuit (18)');
 has(o=>setPages(o,'jobs',N_RUN,[...jobsOf(o,N_RUN),{...jobsOf(o,N_RUN)[1],id:999,name:'circuit (19)'}]),'JOB_UNEXPECTED:'+tag+':circuit (19)');
 has(o=>{jobsOf(o,N_RUN)[0].steps=jobsOf(o,N_RUN)[0].steps.filter(s=>s.name!==CHECKOUT_ATTESTATION_STEP);},'STEP_MISSING:'+tag+':circuit (17):'+CHECKOUT_ATTESTATION_STEP);
 has(o=>{const j=jobsOf(o,N_RUN)[0];j.steps.push({...j.steps.find(s=>s.name==='Build and run all existing regressions'),number:99});},'STEP_DUPLICATE:'+tag+':circuit (17):Build and run all existing regressions');
 has(o=>{jobsOf(o,N_RUN)[0].steps=[];},'JOB_STEPS_UNOBSERVED:'+tag+':circuit (17)');
});

test('intentos: un re-run parcial no toma prestados éxitos de otro intento; una corrida más nueva fallida o en curso manda',()=>{
 const tag=NOELIA.path;
 has(o=>{run0(o,{run_attempt:2});setPages(o,'jobs',N_RUN,[...jobsOf(o,N_RUN),{...jobsOf(o,N_RUN)[0],id:990,run_attempt:2}]);},'JOB_MISSING:'+tag+':circuit (18)');
 const newer=(o,change)=>{o.runsPages[0].workflow_runs.push({...o.runsPages[0].workflow_runs[0],id:200,created_at:'2026-10-28T20:00:00Z',event:'workflow_dispatch',...change});o.runsPages[0].total_count++;
  setPages(o,'jobs',200,jobsOf(o,N_RUN).map(j=>({...j,id:j.id+1000,run_id:200})));setPages(o,'artifacts',200,[]);};
 has(o=>newer(o,{conclusion:'failure'}),'RUN_NOT_SUCCESS:'+tag+':failure');
 has(o=>newer(o,{status:'in_progress',conclusion:null}),'RUN_INCOMPLETE:'+tag);
 has(o=>newer(o,{}),'ARTIFACT_MISSING:'+tag+':noelia-circuit-pg17-'+SHA);
});

test('paginación truncada, inconsistente, repetida o ausente nunca cuenta',()=>{
 assert.equal(paginated([{total_count:0,jobs:[]}],'jobs').reason,null);assert.equal(paginated([],'jobs').reason,'PAGINATION_INVALID');
 has(o=>{o.runsPages[0].total_count=3;},'PAGINATION_INCOMPLETE:runs');
 has(o=>{const rows=o.runsPages[0].workflow_runs;o.runsPages=[{total_count:2,workflow_runs:[rows[0]]},{total_count:3,workflow_runs:[rows[1]]}];},'PAGINATION_INCONSISTENT:runs');
 has(o=>{const rows=o.runsPages[0].workflow_runs;o.runsPages=[{total_count:3,workflow_runs:[...rows,rows[0]]}];},'PAGINATION_DUPLICATE:runs');
 has(o=>{delete o.jobsPagesByRun[N_RUN];},'PAGINATION_INVALID:jobs:'+NOELIA.path);
 has(o=>{o.jobsPagesByRun[C_RUN][0].total_count=3;},'PAGINATION_INCOMPLETE:jobs:'+CAPACITY.path);
 has(o=>{o.artifactsPagesByRun[N_RUN][0].total_count=5;},'PAGINATION_INCOMPLETE:artifacts:'+NOELIA.path);
});

test('artefactos: ausentes, duplicados, vencidos, de otra corrida/SHA, sin digest, con bytes distintos o no descargados',()=>{
 const name=major=>NOELIA.path+':noelia-circuit-pg'+major+'-'+SHA,art=(o,i)=>o.artifactsPagesByRun[N_RUN][0].artifacts[i];
 has(o=>setPages(o,'artifacts',N_RUN,[art(o,0)]),'ARTIFACT_MISSING:'+name(18));
 has(o=>setPages(o,'artifacts',N_RUN,[art(o,0),art(o,1),{...art(o,1),id:777}]),'ARTIFACT_DUPLICATE:'+name(18));
 has(o=>{art(o,0).expired=true;},'ARTIFACT_EXPIRED:'+name(17));
 has(o=>{art(o,0).workflow_run.id=999;},'ARTIFACT_RUN_BINDING:'+name(17));
 has(o=>{art(o,0).workflow_run.head_sha=OTHER;},'ARTIFACT_RUN_BINDING:'+name(17));
 has(o=>{art(o,0).workflow_run.head_repository_id=1;},'ARTIFACT_RUN_BINDING:'+name(17));
 has(o=>{art(o,0).digest=null;},'ARTIFACT_DIGEST_MISSING:'+name(17));
 has(o=>{art(o,0).digest='sha256:'+'0'.repeat(64);},'ARTIFACT_DIGEST_MISMATCH:'+name(17));
 has(o=>{art(o,0).size_in_bytes+=1;},'ARTIFACT_DIGEST_MISMATCH:'+name(17));
 has(o=>{delete o.artifactZips[art(o,0).id];},'ARTIFACT_UNOBSERVED:'+name(17));
});

test('informes: el SHA/major/transport/baseline del checkout probado deben coincidir; passed:true solo no alcanza',()=>{
 const [n17,n18]=NOELIA.jobs,[c17]=CAPACITY.jobs,nl=major=>NOELIA.path+':noelia-circuit-pg'+major+'-'+SHA,cl=CAPACITY.path+':own-full-capacity-pg17-published107-'+SHA;
 has(o=>replaceZip(o,N_RUN,0,reportZip(NOELIA,n17,reportFor(n17,OTHER))),'REPORT_FIELD:'+nl(17)+':sourceCommit');
 has(o=>replaceZip(o,N_RUN,1,reportZip(NOELIA,n18,reportFor(n18,SHA,{major:17}))),'REPORT_FIELD:'+nl(18)+':major');
 has(o=>replaceZip(o,N_RUN,0,reportZip(NOELIA,n17,reportFor(n17,SHA,{transport:'local'}))),'REPORT_FIELD:'+nl(17)+':transport');
 has(o=>replaceZip(o,N_RUN,0,reportZip(NOELIA,n17,reportFor(n17,SHA,{passed:false}))),'REPORT_FIELD:'+nl(17)+':passed');
 has(o=>replaceZip(o,N_RUN,0,reportZip(NOELIA,n17,reportFor(n17,SHA,{productionWrites:true}))),'REPORT_FIELD:'+nl(17)+':productionWrites');
 has(o=>replaceZip(o,C_RUN,0,reportZip(CAPACITY,c17,reportFor(c17,SHA,{operationalPairBaseline:'pre107'}))),'REPORT_FIELD:'+cl+':operationalPairBaseline');
 has(o=>replaceZip(o,C_RUN,0,reportZip(CAPACITY,c17,reportFor(c17,SHA,{version:'other.v1'}))),'REPORT_FIELD:'+cl+':version');
 has(o=>replaceZip(o,N_RUN,0,zipOf({'noelia-circuit-ci/other.json':'{}'})),'REPORT_MISSING:'+nl(17));
 has(o=>replaceZip(o,N_RUN,0,zipOf({'a/noelia-circuit-ci/result.json':JSON.stringify(reportFor(n17)),'b/noelia-circuit-ci/result.json':'{}'})),'REPORT_DUPLICATE:'+nl(17));
 has(o=>replaceZip(o,N_RUN,0,enc('not a zip at all, just bytes')),'REPORT_UNREADABLE:'+nl(17));
 has(o=>replaceZip(o,N_RUN,0,zipOf({'noelia-circuit-ci/result.json':'{"passed":true'})),'REPORT_UNREADABLE:'+nl(17));
});

test('fuentes en el SHA: bytes de workflow alterados, contenido inconsistente, scripts debilitados, vercel.json abierto',()=>{
 const changed=p=>{const b=repoBytes(p);return enc(Buffer.from(b).toString('utf8')+' ');};
 for(const w of C.workflows)has(o=>{o.contents[w.path]=contentAnswer(w.path,changed(w.path));},'WORKFLOW_BYTES_CHANGED:'+w.path);
 has(o=>{o.contents[NOELIA.path].sha='0'.repeat(40);},'CONTENT_BLOB_MISMATCH:'+NOELIA.path);
 has(o=>{o.contents[NOELIA.path].size+=1;},'CONTENT_BLOB_MISMATCH:'+NOELIA.path);
 has(o=>{o.contents[NOELIA.path].path='other.yml';},'CONTENT_INVALID:'+NOELIA.path);
 has(o=>{delete o.contents['vercel.json'];},'CONTENT_INVALID:vercel.json');
 const pkg=JSON.parse(Buffer.from(repoBytes('package.json')).toString('utf8')),vercel=JSON.parse(Buffer.from(repoBytes('vercel.json')).toString('utf8'));
 const withScripts=s=>contentAnswer('package.json',enc({...pkg,scripts:{...pkg.scripts,...s}}));
 has(o=>{o.contents['package.json']=withScripts({'build:vercel':'node scripts/verify-platform-baseline.mjs && node scripts/build-friendly.mjs'});},'SOURCE_SCRIPT_CHANGED:build:vercel');
 has(o=>{o.contents['package.json']=withScripts({test:'node scripts/verify-platform-baseline.mjs && node scripts/verify-friendly-containment.mjs'});},'SOURCE_SCRIPT_CHANGED:test');
 has(o=>{o.contents['package.json']=withScripts({build:'npm run build:vercel'});},'SOURCE_SCRIPT_CHANGED:build');
 for(const buildCommand of [undefined,'npm run build','node scripts/build-friendly.mjs'])has(o=>{o.contents['vercel.json']=contentAnswer('vercel.json',enc({...vercel,buildCommand}));},'SOURCE_VERCEL_BUILD_COMMAND');
 has(o=>{o.contents['vercel.json']=contentAnswer('vercel.json',enc({...vercel,git:{deploymentEnabled:{'internal-*':false}}}));},'SOURCE_VERCEL_GIT_DEPLOYMENT_OPEN');
 has(o=>{o.contents['vercel.json']=contentAnswer('vercel.json',enc({...vercel,git:{deploymentEnabled:{'internal-*':false,master:true}}}));},'SOURCE_VERCEL_GIT_DEPLOYMENT_OPEN');
 has(o=>{const {git,...rest}=vercel;o.contents['vercel.json']=contentAnswer('vercel.json',enc(rest));},'SOURCE_VERCEL_GIT_DEPLOYMENT_OPEN');
 has(o=>{o.contents['vercel.json']=contentAnswer('vercel.json',enc('{'));},'SOURCE_INVALID:vercel.json');
 for(const literal of ['null','false','0','[]'])has(o=>{o.contents['package.json']=contentAnswer('package.json',enc(literal));},'SOURCE_INVALID:package.json');
 assert.equal(contentBytes(contentAnswer('package.json'),'package.json').reason,null);
});

const qualified=()=>q();
const stageInput=over=>({qualification:qualified(),createObservation:createObservation(),deployment:deployment(STAGED),releaseInfo:releaseInfo(),...over});
// `alias` is creation-time: a deployment promoted earlier need not list the production domains there.
const holderDeployment=()=>deployment(PREVIOUS,{alias:['previous1-team.vercel.app'],gitSource:{type:'github',sha:OTHER,repoId:C.repository.id}});
test('admisión (con atestación de ajustes Vercel no visibles en fuentes) y titular actual por inspect de cada dominio',()=>{
 assert.deepEqual(validateAdmission(admission(),SHA),[]);assert.deepEqual(validateAdmission(admission({sourceSha:OTHER}),SHA),['ADMISSION_SHA']);
 assert.deepEqual(validateAdmission(admission({previousProductionDeploymentId:'prev'}),SHA),['ADMISSION_PREVIOUS_DEPLOYMENT']);assert.deepEqual(validateAdmission({},SHA),['ADMISSION_VERSION']);
 for(const providerSettingsAttested of [undefined,{productionBranch:'main',projectBuildCommand:null},{productionBranch:'master',projectBuildCommand:'npm run build:vercel'},{productionBranch:'master'}])
  assert.deepEqual(validateAdmission(admission({providerSettingsAttested}),SHA),['ADMISSION_PROVIDER_SETTINGS_UNATTESTED']);
 assert.equal(evaluateProductionHolder({previousId:PREVIOUS,deployment:holderDeployment(),inspections:inspectionsFor(PREVIOUS)}).holds,true);
 const r=evaluateProductionHolder({previousId:PREVIOUS,deployment:holderDeployment(),inspections:{...inspectionsFor(PREVIOUS),'www.municontrol.com':{id:'dpl_other'}}});
 assert.deepEqual(r.reasons,['HOLDER_INSPECT_MISMATCH:www.municontrol.com']);
 assert.deepEqual(evaluateProductionHolder({previousId:PREVIOUS,deployment:holderDeployment()}).reasons.length,3);
 assert.ok(evaluateProductionHolder({previousId:PREVIOUS,deployment:{...holderDeployment(),readyState:'ERROR'},inspections:inspectionsFor(PREVIOUS)}).reasons.includes('HOLDER_NOT_READY'));
});
test('stage: proyecto/equipo/target/SHA/comando/dominios/release-info exactos; READY no alcanza',()=>{
 const ok=evaluateStage(stageInput({}));assert.equal(ok.stageVerified,true,JSON.stringify(ok.reasons));assert.equal(ok.adminUiSha256,ADMIN);
 const has=(over,code)=>assert.ok(evaluateStage(stageInput(over)).reasons.includes(code),code);
 has({qualification:{...qualified(),qualified:false}},'STAGE_NOT_QUALIFIED');
 has({createObservation:createObservation({autoAssignCustomDomains:true})},'STAGE_DOMAIN_ASSIGNMENT_NOT_DISABLED');
 has({createObservation:createObservation({autoAssignCustomDomains:undefined})},'STAGE_DOMAIN_ASSIGNMENT_NOT_DISABLED');
 has({createObservation:createObservation({effectiveBuildCommand:'npm run build:vercel'})},'STAGE_BUILD_COMMAND_UNOBSERVED_OR_CHANGED');
 has({createObservation:createObservation({effectiveBuildCommand:null})},'STAGE_BUILD_COMMAND_UNOBSERVED_OR_CHANGED');
 has({createObservation:createObservation({target:'preview'})},'STAGE_CREATE_TARGET');
 has({deployment:deployment(STAGED,{target:'preview'})},'STAGE_TARGET');has({deployment:deployment(STAGED,{target:'production',customEnvironment:{slug:'qa'}})},'STAGE_TARGET');
 has({deployment:deployment(STAGED,{readyState:'BUILDING'})},'STAGE_NOT_READY');has({deployment:deployment(STAGED,{deletedAt:1})},'STAGE_DELETED');
 has({deployment:deployment(STAGED,{projectId:'prj_other'})},'STAGE_PROJECT');has({deployment:deployment(STAGED,{team:{id:C.vercel.teamId,slug:'other'}})},'STAGE_TEAM');
 has({deployment:deployment('dpl_other')},'STAGE_IDENTITY');
 has({deployment:deployment(STAGED,{gitSource:{type:'github',sha:OTHER,repoId:C.repository.id}})},'STAGE_SOURCE_SHA');
 has({deployment:deployment(STAGED,{gitSource:{type:'github',sha:SHA,repoId:1}})},'STAGE_SOURCE_SHA');
 has({deployment:deployment(STAGED,{alias:['www.municontrol.com']})},'STAGE_ALREADY_ON_PRODUCTION_DOMAIN');
 has({releaseInfo:releaseInfo(OTHER)},'STAGE_RELEASE_INFO_SHA');has({releaseInfo:{...releaseInfo(),sourceState:'modified',commitSha:null}},'STAGE_RELEASE_INFO_SHA');
 has({releaseInfo:null},'STAGE_RELEASE_INFO_INVALID');
});
test('binding de root: mismo SHA y despliegue, banderas exactas, cero escrituras, no promovido',()=>{
 const stage=evaluateStage(stageInput({}));assert.equal(evaluateBuildBinding({stage,binding:binding(),admission:admission()}).bound,true);
 const has=(over,code)=>assert.ok(evaluateBuildBinding({stage,binding:binding(over),admission:admission()}).reasons.includes(code),code);
 has({sourceCommit:OTHER},'BINDING_SOURCE_COMMIT');has({deploymentId:'dpl_old'},'BINDING_DEPLOYMENT');has({version:'x'},'BINDING_VERSION');
 has({builtinShaMatchedByPinnedVerifier:false},'BINDING_FLAG:builtinShaMatchedByPinnedVerifier');has({normalBuildEnvironment:undefined},'BINDING_FLAG:normalBuildEnvironment');
 has({dml:1},'BINDING_COUNT:dml');has({municipalOperations:undefined},'BINDING_COUNT:municipalOperations');has({productionDomainPromoted:true},'BINDING_ALREADY_PROMOTED');
 assert.ok(evaluateBuildBinding({stage:{...stage,stageVerified:false},binding:binding(),admission:admission()}).reasons.includes('BINDING_STAGE_NOT_VERIFIED'));
});
test('lectura posterior: cada dominio por inspect sirve el stage y su release-info es el mismo commit y artefacto',()=>{
 const stage=evaluateStage(stageInput({})),D=C.vercel.productionDomains,releases=(r=releaseInfo())=>Object.fromEntries(D.map(d=>[d,r]));
 const input=over=>({stage,stageDeployment:deployment(STAGED),inspections:inspectionsFor(STAGED),domainReleases:releases(),...over});
 assert.equal(evaluateReadback(input({})).promotedAndReadBack,true,'creation-time alias without the domains is not a mismatch');
 const has=(over,code)=>assert.ok(evaluateReadback(input(over)).reasons.includes(code),code);
 has({stageDeployment:deployment(STAGED,{readyState:'ERROR'})},'READBACK_STAGE_NOT_READY');
 has({inspections:{...inspectionsFor(STAGED),'municontrol.com':{id:PREVIOUS}}},'READBACK_INSPECT_MISMATCH:municontrol.com');
 has({domainReleases:releases(releaseInfo(OTHER))},'READBACK_DOMAIN_RELEASE:municontrol.com');
 has({domainReleases:releases(releaseInfo(SHA,'f'.repeat(64)))},'READBACK_DOMAIN_RELEASE:www.municontrol.com');
 has({domainReleases:{}},'READBACK_DOMAIN_RELEASE_INVALID:municontrol.com');
 has({inspections:undefined},'READBACK_INSPECT_MISMATCH:www.municontrol.com');
});

test('ZIP: lee entradas reales con descriptor y rechaza CRC, truncado, duplicado, ruta, cifrado y basura final',()=>{
 const zip=zipOf({'x/result.json':'{"a":1}','y.txt':''}),entries=zipEntries(zip);
 assert.deepEqual([...entries.keys()],['x/result.json','y.txt']);assert.equal(Buffer.from(zipEntryBytes(zip,entries.get('x/result.json'))).toString(),'{"a":1}');
 assert.equal(zipEntryBytes(zip,entries.get('y.txt')).length,0);
 const code=(fn,c)=>assert.throws(fn,e=>e.code===c,c);
 const crc=Buffer.from(zip);crc.writeUInt32LE((entries.get('x/result.json').crc^1)>>>0,crc.indexOf(Buffer.from([0x50,0x4b,1,2]))+16);
 code(()=>{const z=new Uint8Array(crc);zipEntryBytes(z,zipEntries(z).get('x/result.json'));},'ZIP_ENTRY_CRC');
 code(()=>zipEntries(zip.subarray(0,zip.length-5)),'ZIP_EOCD_MISSING');
 code(()=>zipEntries(new Uint8Array([...zip,0])),'ZIP_LAYOUT_UNSUPPORTED');
 code(()=>zipEntries(zipOf({'../x':'1'})),'ZIP_ENTRY_PATH');code(()=>zipEntries(zipOf({'/abs':'1'})),'ZIP_ENTRY_PATH');
 const dup=Buffer.from(zipOf({'aa':'1','ab':'2'}));const second=dup.lastIndexOf(Buffer.from('ab'));dup.write('aa',second);code(()=>zipEntries(new Uint8Array(dup)),'ZIP_ENTRY_DUPLICATE');
 const enc_=Buffer.from(zipOf({'a':'1'}));enc_.writeUInt16LE(9,enc_.indexOf(Buffer.from([0x50,0x4b,1,2]))+8);code(()=>zipEntries(new Uint8Array(enc_)),'ZIP_ENCRYPTED');
});


test('capacity full-suite evidence preserves pipefail, tee and one complete build',()=>{
 const source=Buffer.from(repoBytes(CAPACITY.path)).toString('utf8');assertCapacityFullSuite(source);
 for(const change of [
  value=>value.replace('          set -o pipefail\n',''),
  value=>value.replace(' 2>&1 | tee verification/release-full-suite.log',''),
  value=>value.replace('npm run build 2>&1','npm run build -- --test-name-pattern=one 2>&1'),
  value=>value+'      - run: npm run build\n'
 ])assert.throws(()=>assertCapacityFullSuite(change(source)),assert.AssertionError);
});

// The source-configured Preview path changes packaging only. A synthetic READY
// Preview, pending CI or the plain bundle command can never become a production stage.
test('fast Preview source retains full CI and cannot replace staged attestation, canonical SHA or domain fencing',()=>{
 assert.equal(C.scripts.test,'node scripts/verify-platform-baseline.mjs && node scripts/verify-friendly-containment.mjs && node --test tests/*.test.js');
 assert.equal(C.scripts.build,'npm run test && node scripts/build-friendly.mjs');
 assert.equal(C.scripts['build:vercel'],'node scripts/verify-platform-baseline.mjs && node scripts/verify-friendly-containment.mjs && node scripts/build-friendly.mjs');
 assert.deepEqual(C.providerSettingsRequired,{productionBranch:'master',projectBuildCommand:null});
 const pending=q(o=>{o.runsPages[0].workflow_runs[0].status='in_progress';});assert.equal(pending.qualified,false);
 const rejected=evaluateStage({...stageInput(),qualification:pending});assert.ok(rejected.reasons.includes('STAGE_NOT_QUALIFIED'));
 const plain=evaluateStage({...stageInput(),createObservation:createObservation({effectiveBuildCommand:'npm run build:vercel'}),deployment:deployment(STAGED,{projectSettings:{buildCommand:'npm run build:vercel'}})});assert.ok(plain.reasons.includes('STAGE_BUILD_COMMAND_UNOBSERVED_OR_CHANGED'));assert.ok(plain.reasons.includes('STAGE_GET_BUILD_COMMAND_CHANGED'));
 const preview=evaluateStage({...stageInput(),createObservation:createObservation({target:'preview'}),deployment:deployment(STAGED,{target:'preview'})});assert.ok(preview.reasons.includes('STAGE_CREATE_TARGET'));assert.ok(preview.reasons.includes('STAGE_TARGET'));
 const domains=evaluateStage({...stageInput(),createObservation:createObservation({autoAssignCustomDomains:true})});assert.ok(domains.reasons.includes('STAGE_DOMAIN_ASSIGNMENT_NOT_DISABLED'));
});

// Three finite additions, in two unified-diff hunks: fiscal flag + two outputs.
// The full inverse is the real505e127e parent, not an invented workflow baseline.
test('Noelia fiscal workflow succession recovers the complete reviewed parent and rejects the old or newly drifted bytes',()=>{
 const file='.github/workflows/noelia-payroll-circuit.yml',currentRaw=Buffer.from(repoBytes(file)),raw=projectNoeliaAnnulmentWorkflowToFiscalEpoch(file,currentRaw),current=raw.toString('utf8');
 assert.equal(currentRaw.length,15103);assert.equal(hash(currentRaw),'e58ee59c3ade7a66b4577f1434dd238affd39fc90f2f08789deb44ae22a37090');
 assert.equal(currentRaw.toString('utf8').split(' --annulment=true').length,2);assert.ok(!current.includes(' --annulment=true'));
 assert.throws(()=>projectNoeliaAnnulmentWorkflowToFiscalEpoch(file,raw),'the previous fiscal-only workflow is not admitted as current');
 assert.throws(()=>projectNoeliaAnnulmentWorkflowToFiscalEpoch(file,Buffer.concat([currentRaw,Buffer.from('\n')])));
 const changed=Buffer.from(currentRaw);changed[0]^=1;assert.throws(()=>projectNoeliaAnnulmentWorkflowToFiscalEpoch(file,changed));
 assert.throws(()=>projectNoeliaAnnulmentWorkflowToFiscalEpoch(file,Buffer.from(currentRaw.toString('utf8').replace(' --annulment=true',' --annulment=false'))));
 const unknown=Buffer.from('unrelated');assert.strictEqual(projectNoeliaAnnulmentWorkflowToFiscalEpoch('tests/unrelated.test.js',unknown),unknown);
 assert.equal(raw.length,15086);assert.equal(hash(raw),'e3a700eb4f9acc9108179d4308a43198ed10282c527bdcb5e09f961bd0cb16b8');assert.equal(C.workflows.find(w=>w.path===file).sha256,hash(currentRaw));
 let parent=current;for(const addition of [" --fiscal=true","            verification/noelia-circuit-ci/noelia-f931-native-readback.json\n","            verification/noelia-circuit-ci/noelia-fiscal160-installation.json\n"]){assert.equal(parent.split(addition).length,2);parent=parent.replace(addition,'');}
 assert.equal(Buffer.byteLength(parent),14918);assert.equal(hash(enc(parent)),'e87d8e2490cffbbe081d4a0345cdaa9e482d66fdac8b3825bba1e2bb6e7ef754');
 assert.equal(q().qualified,true,'all current source pins must agree before negative probes');
 has(o=>{o.contents[file]=contentAnswer(file,raw);},'WORKFLOW_BYTES_CHANGED:'+file);
 has(o=>{o.contents[file]=contentAnswer(file,enc(parent));},'WORKFLOW_BYTES_CHANGED:'+file);
 has(o=>{o.contents[file]=contentAnswer(file,enc(current+'\n'));},'WORKFLOW_BYTES_CHANGED:'+file);
 has(o=>{o.contents[file]=contentAnswer(file,Buffer.concat([currentRaw,Buffer.from('\n')]));},'WORKFLOW_BYTES_CHANGED:'+file);
});
