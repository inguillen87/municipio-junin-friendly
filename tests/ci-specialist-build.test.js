// Observable workflow contracts only. No SQL, browser launch, provider or app import.
// YAML 1.2 comes from the already locked/exported Playwright utility bundle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import utilsBundle from 'playwright-core/lib/utilsBundle';
const {yaml}=utilsBundle;
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const digest=value=>createHash('sha256').update(value).digest('hex');
const globalPath='.github/workflows/ci-global-full-suite.yml';
const sourceSha='${{ github.event.pull_request.head.sha || github.sha }}';
const checkout='actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const setupNode='actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';
const upload='actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02';
const fullCommand=/\bnpm run build(?![A-Za-z0-9:_-])/;
const bundleCommand=/\bnpm run build:vercel\b/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function parse(source,label){
 assert.equal(typeof source,'string',label+': YAML source required');
 const document=yaml.parseDocument(source,{version:'1.2',uniqueKeys:true});
 assert.deepEqual(document.errors,[],label+': invalid/duplicate YAML keys');
 const value=document.toJS();assert.ok(object(value)&&object(value.on)&&object(value.jobs),label+': repository workflow mapping required');return value;
}
const global=()=>parse(read(globalPath),globalPath);
const jobs=value=>Object.values(value.jobs);
const runs=job=>(job.steps??[]).filter(step=>typeof step.run==='string').map(step=>step.run);
function bundledWorkflows(){
 const directory=new URL('../.github/workflows/',import.meta.url),found=[];
 for(const name of fs.readdirSync(directory).filter(name=>/\.ya?ml$/.test(name))){
  const file='.github/workflows/'+name,source=read(file);if(!source.includes('npm run build:vercel'))continue;
  const value=parse(source,file),bundled=jobs(value).filter(job=>runs(job).some(command=>bundleCommand.test(command)));
  if(bundled.length)found.push({file,value,bundled});
 }assert.ok(found.length>0,'specialist workflows must actually exist');return found;
}
function pushBranches(specialists){
 const branches=new Set();
 for(const {file,value}of specialists){
  const rule=value.on.push;assert.ok(object(rule)&&Array.isArray(rule.branches),file+': explicit push branches required for automatic full-suite coverage');
  assert.equal(Object.hasOwn(rule,'branches-ignore'),false,file+': branch exclusions require an explicit coverage extension');
  for(const branch of rule.branches){assert.equal(typeof branch,'string');assert.ok(!/[!*?\[\]]/.test(branch),file+': new branch patterns require reviewed coverage');branches.add(branch);}
 }return [...branches].sort();
}
function assertGlobal(value){
 assert.deepEqual(Object.keys(value.on).sort(),['pull_request','push','workflow_dispatch'],'GLOBAL_EVENTS');
 assert.ok(value.on.pull_request===null||object(value.on.pull_request)&&Object.keys(value.on.pull_request).length===0,'GLOBAL_PR_FILTERS_NOT_ALLOWED');
 assert.ok(value.on.workflow_dispatch===null||object(value.on.workflow_dispatch)&&Object.keys(value.on.workflow_dispatch).length===0,'GLOBAL_DISPATCH_FILTERS_NOT_ALLOWED');
 assert.deepEqual(Object.keys(value.on.push).sort(),['branches'],'GLOBAL_PUSH_PATH_OR_OTHER_FILTER');
 assert.ok(Array.isArray(value.on.push.branches)&&value.on.push.branches.includes('master'),'GLOBAL_MASTER_REQUIRED');
 assert.equal(new Set(value.on.push.branches).size,value.on.push.branches.length,'GLOBAL_UNIQUE_BRANCHES');
 assert.ok(value.on.push.branches.every(branch=>typeof branch==='string'&&!/[!*?\[\]]/.test(branch)),'GLOBAL_EXPLICIT_BRANCHES_ONLY');
 assert.deepEqual(value.permissions,{contents:'read'},'GLOBAL_LEAST_PRIVILEGE');
 assert.equal(jobs(value).length,1,'GLOBAL_SINGLE_FULL_SUITE_JOB');
 const job=jobs(value)[0];assert.equal(job['runs-on'],'ubuntu-24.04');assert.equal(job['timeout-minutes'],180);
 assert.equal(job.if,undefined,'GLOBAL_JOB_MUST_NOT_SKIP');assert.equal(job['continue-on-error'],undefined,'GLOBAL_NO_FAILURE_WAIVER');assert.equal(job.strategy,undefined,'GLOBAL_FULL_SUITE_NOT_SHARDED');
 assert.deepEqual(job.env,{EXPECTED_SOURCE_SHA:sourceSha},'GLOBAL_EVENT_SHA_ENV');
 const steps=job.steps,checkoutSteps=steps.filter(step=>step.uses===checkout);assert.equal(checkoutSteps.length,1,'GLOBAL_PINNED_CHECKOUT');
 assert.deepEqual(checkoutSteps[0].with,{ref:sourceSha,'persist-credentials':false},'GLOBAL_IMMUTABLE_EVENT_CHECKOUT');
 const setup=steps.filter(step=>step.uses===setupNode);assert.equal(setup.length,1,'GLOBAL_PINNED_NODE');assert.deepEqual(setup[0].with,{'node-version-file':'.nvmrc',cache:'npm'});
 const attest=steps.find(step=>typeof step.run==='string'&&step.run.includes('git rev-parse HEAD'));assert.ok(attest,'GLOBAL_HEAD_ATTESTATION');assert.equal(attest.shell,'bash');
 assert.ok(attest.run.includes('set -euo pipefail')&&attest.run.includes('test "$(git rev-parse HEAD)" = "$EXPECTED_SOURCE_SHA"')&&attest.run.includes('verification/global-full-suite-source.txt'),'GLOBAL_HEAD_ATTESTATION');
 assert.equal(attest.if,undefined,'GLOBAL_ATTESTATION_NOT_CONDITIONAL');assert.equal(attest['continue-on-error'],undefined);
 const install=steps.filter(step=>step.run==='npm ci --ignore-scripts');assert.equal(install.length,1,'GLOBAL_INSTALL_ALL_LOCKED_DEPENDENCIES');
 const full=steps.filter(step=>typeof step.run==='string'&&fullCommand.test(step.run));assert.equal(full.length,1,'GLOBAL_FULL_SUITE_REQUIRED');
 assert.equal(full[0].shell,'bash','GLOBAL_BASH_REQUIRED');assert.equal(full[0].if,undefined);assert.equal(full[0]['continue-on-error'],undefined);
 assert.deepEqual(full[0].run.trim().split('\n'),['set -euo pipefail','npm run build 2>&1 | tee verification/global-full-suite.log'],'GLOBAL_COMPLETE_TEST_COMMAND_AND_PIPEFAIL');
 assert.ok(steps.indexOf(checkoutSteps[0])<steps.indexOf(attest)&&steps.indexOf(attest)<steps.indexOf(install[0])&&steps.indexOf(install[0])<steps.indexOf(full[0]),'GLOBAL_SOURCE_CHECK_PRECEDES_EXECUTION');
 const evidence=steps.filter(step=>step.uses===upload);assert.equal(evidence.length,1,'GLOBAL_PINNED_EVIDENCE');assert.equal(evidence[0].if,'always()','GLOBAL_EVIDENCE_EVEN_ON_FAILURE');
 assert.ok(evidence[0].with.name.includes('${{ env.EXPECTED_SOURCE_SHA }}')&&evidence[0].with.name.includes('${{ github.run_id }}')&&evidence[0].with.name.includes('${{ github.run_attempt }}'),'GLOBAL_EVIDENCE_SOURCE_IDENTITY');
 assert.deepEqual(evidence[0].with.path.trim().split('\n'),['verification/global-full-suite-source.txt','verification/global-full-suite.log']);assert.equal(evidence[0].with['if-no-files-found'],'error');
 assert.ok(steps.indexOf(evidence[0])>steps.indexOf(full[0]));
}
function assertCoverage(value,specialists){assertGlobal(value);assert.deepEqual([...value.on.push.branches].sort(),pushBranches(specialists),'GLOBAL_PUSH_BRANCH_UNION');}
// Bounded event model for the positive branch/path patterns present in these
// repository workflows. Unsupported negative patterns fail rather than guess.
function matches(name,patterns){return patterns.some(pattern=>{assert.equal(typeof pattern,'string');assert.ok(!pattern.startsWith('!'),'negative patterns need an explicit event proof');return path.matchesGlob(name,pattern);});}
function triggered(value,event,{base='master',branch='master',files=[],tag=false}={}){
 if(!Object.hasOwn(value.on,event))return false;
 const rule=value.on[event]??{};assert.ok(object(rule),'event mapping required');if(event==='workflow_dispatch')return true;
 if(event==='push'&&tag&&rule.branches)return false;
 if(rule.branches&&!matches(event==='pull_request'?base:branch,rule.branches))return false;
 if(rule.paths&&!files.some(file=>matches(file,rule.paths)))return false;
 assert.equal(Object.hasOwn(rule,'paths-ignore'),false,'paths-ignore requires an explicit event proof');
 return true;
}

test('actual YAML 1.2 keeps on as a string key and rejects ambiguous duplicate event mappings',()=>{
 const value=global();assert.ok(Object.hasOwn(value,'on'));assertGlobal(value);
 assert.throws(()=>parse('name: bad\non: {}\non: {}\njobs: {}\n','duplicate'),/invalid\/duplicate YAML keys/);
});
test('global job runs the complete existing suite, checks out its event SHA and preserves failure evidence',()=>assertGlobal(global()));
test('every bundle-only specialist retains a full-suite path for all PR bases and its exact push branches',()=>{
 const specialists=bundledWorkflows();assertCoverage(global(),specialists);
 for(const {file,value,bundled}of specialists){
  for(const job of bundled){assert.equal(job['timeout-minutes'],45,file);assert.equal(runs(job).some(command=>fullCommand.test(command)),false,file+': no repeated full suite in specialist');assert.ok(runs(job).some(command=>/\bnode\s+--test\b|\bnode scripts\/verify-|\bpsql\b/.test(command)),file+': own verification must remain');}
  if(Object.hasOwn(value.on,'pull_request'))for(const base of ['master','codex/native-leave-workflow-20261001','review-base-not-listed-anywhere'])assert.equal(triggered(global(),'pull_request',{base,files:[file]}),true,file+': PR base '+base);
 }
});
test('source-only React and root HTML changes retain automatic full-suite coverage despite the old central path gaps',()=>{
 const central=['.github/workflows/noelia-payroll-circuit.yml','.github/workflows/own-payroll-full-capacity.yml'].map(file=>parse(read(file),file));
 for(const [file,changed]of [['.github/workflows/native-salary-release.yml','src/islands/NativeSalaryCatalog.jsx'],['.github/workflows/native-family-schooling-release.yml','internal-dashboard.html'],['.github/workflows/noelia-report-workspace.yml','src/islands/PayrollParameters.jsx']]){
  assert.ok(fs.existsSync(new URL('../'+changed,import.meta.url)),changed);
  assert.equal(triggered(parse(read(file),file),'pull_request',{files:[changed]}),true,file+': specialist route');
  assert.ok(central.every(workflow=>!triggered(workflow,'pull_request',{files:[changed]})),changed+': original central gap is exercised');
  assert.equal(triggered(global(),'pull_request',{files:[changed]}),true,changed+': global relay');
 }
});
test('non-master PRs, arbitrary paths and all historical specialist push branches run the global suite',()=>{
 const value=global(),specialists=bundledWorkflows();assertCoverage(value,specialists);
 for(const base of ['master','codex/native-leave-workflow-20261001','work/codex-autonomy-20260930','another-base'])for(const file of ['src/islands/NativeSalaryCatalog.jsx','internal-dashboard.html','.vercelignore','new/previously-unlisted.route'])assert.equal(triggered(value,'pull_request',{base,files:[file]}),true);
 for(const branch of pushBranches(specialists))assert.equal(triggered(value,'push',{branch,files:['new/previously-unlisted.route']}),true,branch);
 assert.equal(triggered(value,'push',{branch:'codex/unused-unrelated-branch',files:['assets/any.js']}),false,'unrelated pushes do not start a new global suite');
 assert.equal(triggered(value,'push',{branch:'master',tag:true,files:['assets/any.js']}),false,'branch filter does not expand to tag pushes');
 assert.equal(triggered(value,'workflow_dispatch'),true,'global workflow can be dispatched explicitly');
});
test('event contract rejects restored path/base filters and missing or wildcard push branches',()=>{
 const current=global(),specialists=bundledWorkflows();
 for(const mutate of [value=>{value.on.pull_request={branches:['master']};},value=>{value.on.pull_request={paths:['assets/**']};},value=>{value.on.push.paths=['assets/**'];},value=>{value.on.push.branches=value.on.push.branches.filter(branch=>branch!=='codex/own-position-comparison-20261006');},value=>{value.on.push.branches.push('**');},value=>{delete value.on.pull_request;value.on.pull_request_target={};}]){const changed=structuredClone(current);mutate(changed);assert.throws(()=>assertCoverage(changed,specialists));}
});
test('job contract rejects a bundle substitution, swallowed pipeline errors, mutable checkout and success-only evidence',()=>{
 const current=global();
 for(const mutate of [value=>{jobs(value)[0].steps.find(step=>step.run?.includes('npm run build 2>&1')).run='set -euo pipefail\nnpm run build:vercel 2>&1 | tee verification/global-full-suite.log\n';},value=>{jobs(value)[0].steps.find(step=>step.run?.includes('npm run build 2>&1')).run='npm run build 2>&1 | tee verification/global-full-suite.log\n';},value=>{jobs(value)[0].steps.find(step=>step.uses===checkout).with.ref='${{ github.ref }}';},value=>{jobs(value)[0].steps.find(step=>step.run?.includes('git rev-parse HEAD')).run='echo source accepted\n';},value=>{jobs(value)[0].steps.find(step=>step.uses===upload).if='success()';},value=>{jobs(value)[0].steps.find(step=>step.run?.includes('npm run build 2>&1'))['continue-on-error']=true;},value=>{value.permissions.actions='write';},value=>{jobs(value)[0].if="github.ref == 'refs/heads/master'";}]){const changed=structuredClone(current);mutate(changed);assert.throws(()=>assertGlobal(changed));}
});
test('both general integration reviewers retain the complete suite with a 180-minute budget',()=>{
 for(const file of ['.github/workflows/source-review.yml','.github/workflows/codex-complete-review.yml']){
  const value=parse(read(file),file),fullJobs=jobs(value).filter(job=>runs(job).some(command=>fullCommand.test(command)));assert.equal(fullJobs.length,1,file);
  assert.equal(fullJobs[0]['timeout-minutes'],180,file);assert.equal(runs(fullJobs[0]).some(command=>bundleCommand.test(command)),false,file);
  assert.ok(runs(fullJobs[0]).some(command=>/node scripts\/verify-[^\n]+/.test(command)),file+': its integration/browser verification stays present');
 }
});
test('both existing release gates remain pinned full-suite workflows and package commands stay unchanged',()=>{
 const contract=read('scripts/release-qualification-contract.mjs');
 for(const file of ['.github/workflows/noelia-payroll-circuit.yml','.github/workflows/own-payroll-full-capacity.yml']){
  const source=read(file),value=parse(source,file),anchor="{path:'"+file+"',name:",at=contract.indexOf(anchor);assert.ok(at>=0,file+': existing required release contract');
  const shaAt=contract.indexOf("sha256:'",at);assert.ok(shaAt>at);assert.equal(digest(source),contract.slice(shaAt+8,shaAt+72),file+': existing release pin');
  assert.ok(jobs(value).some(job=>job['timeout-minutes']===180&&runs(job).some(command=>fullCommand.test(command))),file+': full suite remains');assert.equal(jobs(value).some(job=>runs(job).some(command=>bundleCommand.test(command))),false,file);
 }
 const {scripts}=JSON.parse(read('package.json'));
 assert.equal(scripts.test,'node scripts/verify-platform-baseline.mjs && node scripts/verify-friendly-containment.mjs && node --test tests/*.test.js');
 assert.equal(scripts.build,'npm run test && node scripts/build-friendly.mjs');
 assert.equal(scripts['build:vercel'],'node scripts/verify-platform-baseline.mjs && node scripts/verify-friendly-containment.mjs && node scripts/build-friendly.mjs');
});
