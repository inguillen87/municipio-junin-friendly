import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {RELEASE_VERSION} from '../assets/release-status-model.js';
import {CI_BUILD_PROFILE,CI_BUILD_WORKFLOWS,ciBuildWorkflow,assertCiBuildEnvironment,ciBuildIdentity,createCiBuildEnvelope,verifyCiBuildEnvelope} from '../scripts/lib/ci-tested-build.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Preserve the runner and dependency-install boundaries of each original PG job.
const BASELINE_RUNNERS=Object.freeze({
 'exact-program-precision':'ubuntu-latest','municipal-owner-adoption':'ubuntu-24.04',
 'municipal-owner-catalog':'ubuntu-24.04','municipal-owner-program':'ubuntu-24.04',
 'municipal-owner-salary':'ubuntu-24.04','own-agreement-working-time':'ubuntu-24.04',
 'own-bank-accounts':'ubuntu-latest','own-contract-working-time':'ubuntu-24.04',
 'own-fiscal-facts':'ubuntu-latest','own-monthly-participation':'ubuntu-24.04',
 'own-payroll-accounting':'ubuntu-latest','own-payroll-administrative-operator':'ubuntu-24.04',
 'own-salary-conditions':'ubuntu-24.04','own-salary-seniority':'ubuntu-latest',
 'program-scale-reference':'ubuntu-latest','salary-auxiliary-namespace':'ubuntu-latest',
 'salary-day-units':'ubuntu-24.04',
});
function workflowJobs(source){
 const marker='\njobs:\n',offset=source.indexOf(marker);assert.ok(offset>=0,'WORKFLOW_JOBS_REQUIRED');
 const text=source.slice(offset+marker.length),headers=[...text.matchAll(/^  ([A-Za-z_][A-Za-z0-9_-]*):\n/gm)];
 assert.equal(headers.length,2,'PRODUCER_AND_CONSUMER_REQUIRED');
 return Object.fromEntries(headers.map((entry,i)=>[entry[1],text.slice(entry.index+entry[0].length,headers[i+1]?.index??text.length)]));
}
function assertJobInstallBoundary(job,profile,label){
 assert.equal(/^    runs-on: (.+)$/m.exec(job)?.[1],BASELINE_RUNNERS[profile],'RUNNER_GUARD:'+label);
 const steps=job.split(/^      - /m).slice(1),checkout=steps.filter(step=>/uses: actions\/checkout@/.test(step));
 assert.equal(checkout.length,1,'CHECKOUT_REQUIRED:'+label);
 assert.match(checkout[0],/^          persist-credentials: false$/m,'CHECKOUT_CREDENTIAL_GUARD:'+label);
 assert.equal(steps.filter(step=>/^(?:        )?run: npm ci --ignore-scripts$/m.test(step)).length,1,'INSTALL_SCRIPT_GUARD:'+label);
}
const identity=profile=>({checkoutSha:'a'.repeat(40),treeSha:'b'.repeat(40),prHeadSha:'c'.repeat(40),eventName:'pull_request',
 ref:'refs/pull/1/merge',repository:'inguillen87/municipio-junin-friendly',runId:'101',runAttempt:'1',
 lockSha256:'d'.repeat(64),packageSha256:'e'.repeat(64),helperSha256:'f'.repeat(64),workflowSha256:'1'.repeat(64),
 nodeVersion:process.version,nodeBinarySha256:'2'.repeat(64),npmVersion:'11.19.0',platform:'linux',arch:'x64',
 consumerProfile:CI_BUILD_PROFILE,workflowProfile:profile,consumerWorkflow:ciBuildWorkflow(profile),
 profileHelperSha256:'4'.repeat(64),consumerWorkflowSha256:'5'.repeat(64)});
function temporary(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-ci-build-'));
 t.after(()=>{assert.ok(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('mc-ci-build-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;
}
function fixture(t,profile=CI_BUILD_WORKFLOWS[0]){
 const base=temporary(t),root=path.join(base,'producer'),consumer=path.join(base,'consumer'),envelope=path.join(base,'packet'),id=identity(profile);
 fs.mkdirSync(path.join(root,'public','.well-known'),{recursive:true});fs.mkdirSync(consumer);
 fs.writeFileSync(path.join(root,'public','.well-known','synthetic.txt'),'synthetic public byte\n');
 fs.writeFileSync(path.join(root,'public','release-info.json'),JSON.stringify({version:RELEASE_VERSION,commitSha:id.checkoutSha,sourceState:'committed',adminUiSha256:'3'.repeat(64)})+'\n');
 const created=createCiBuildEnvelope({root,envelope,identity:id});
 const verify=(options={})=>verifyCiBuildEnvelope({root:consumer,envelope,identity:id,expectedManifestSha256:created.manifestSha256,...options});
 return {root,consumer,envelope,id,created,verify};
}
for(const profile of CI_BUILD_WORKFLOWS)test('exact public bytes transfer only to the same workflow profile: '+profile,t=>{
 const f=fixture(t,profile);f.verify({install:true});
 assert.equal(fs.readFileSync(path.join(f.consumer,'public','.well-known','synthetic.txt'),'utf8'),'synthetic public byte\n');
 assert.equal(f.created.files,2);assert.notEqual(f.id.checkoutSha,f.id.prHeadSha);
 assert.throws(()=>f.verify({install:true}),/ART_BUILD_TARGET_EXISTS/);
});
test('unknown workflow, path traversal and unprofiled receipts are rejected before use',t=>{
 for(const profile of ['',undefined,'../outside','own-payroll-close','own-art','exact-program-precision.yml'])assert.throws(()=>ciBuildWorkflow(profile),/CI_BUILD_WORKFLOW_PROFILE/);
 const f=fixture(t);
 for(const patch of [{consumerProfile:'own-art-tested-public.v1'},{consumerWorkflow:'.github/workflows/other.yml'},{profileHelperSha256:''},{consumerWorkflowSha256:''}])
  assert.throws(()=>f.verify({identity:{...f.id,...patch},install:true}),/CI_BUILD_(PROFILE|WORKFLOW|HELPER_PIN|WORKFLOW_PIN)/);
 assert.equal(fs.existsSync(path.join(f.consumer,'public')),false);
});
test('valid packet from another workflow or run cannot supply this consumer',t=>{
 const f=fixture(t),other=CI_BUILD_WORKFLOWS[1];
 assert.throws(()=>f.verify({identity:{...f.id,workflowProfile:other,consumerWorkflow:ciBuildWorkflow(other)},install:true}),/ART_BUILD_IDENTITY/);
 for(const key of ['checkoutSha','treeSha','prHeadSha','runId','runAttempt','repository','ref','lockSha256','packageSha256','nodeVersion','nodeBinarySha256','npmVersion','profileHelperSha256','consumerWorkflowSha256']){
  const value=key.endsWith('Sha256')?'9'.repeat(64):f.id[key]+'x';
  assert.throws(()=>f.verify({identity:{...f.id,[key]:value},install:true}),/ART_BUILD_IDENTITY/);
 }
 assert.equal(fs.existsSync(path.join(f.consumer,'public')),false);
});
test('absent or substituted external digest never falls back to an unverified download',t=>{
 for(const digest of [undefined,'','1'.repeat(64)]){const f=fixture(t);assert.throws(()=>f.verify({expectedManifestSha256:digest,install:true}),/ART_BUILD_(EXPECTED_MANIFEST_SHA|MANIFEST_SHA)/);assert.equal(fs.existsSync(path.join(f.consumer,'public')),false);}
 const f=fixture(t),file=path.join(f.envelope,'build-custody.json');fs.unlinkSync(file);
 assert.throws(()=>f.verify({install:true}),/ART_BUILD_ENVELOPE_SET/);assert.equal(fs.existsSync(path.join(f.consumer,'public')),false);
});
test('changed, missing, extra or aliased public bytes fail before installation',t=>{
 for(const mode of ['changed','missing','extra','hardlink','symlink']){
  const f=fixture(t),file=path.join(f.envelope,'public','.well-known','synthetic.txt');
  if(mode==='changed')fs.appendFileSync(file,'changed');
  if(mode==='missing')fs.unlinkSync(file);
  if(mode==='extra')fs.writeFileSync(path.join(f.envelope,'public','extra.txt'),'extra');
  if(mode==='hardlink')fs.linkSync(file,path.join(f.envelope,'public','alias.txt'));
  if(mode==='symlink')fs.symlinkSync(file,path.join(f.envelope,'public','alias.txt'));
  assert.throws(()=>f.verify({install:true}),/ART_BUILD_(PUBLIC_SET_OR_BYTES|REGULAR_SINGLE_LINK|SYMLINK)/);
  assert.equal(fs.existsSync(path.join(f.consumer,'public')),false);
 }
});
test('manifest self-consistency cannot replace the producer job digest',t=>{
 const f=fixture(t),file=path.join(f.envelope,'build-custody.json'),packet=JSON.parse(fs.readFileSync(file));packet.identity.runAttempt='2';
 const bytes=Buffer.from(JSON.stringify(packet)+'\n');fs.writeFileSync(file,bytes);assert.notEqual(sha(bytes),f.created.manifestSha256);
 assert.throws(()=>f.verify({install:true}),/ART_BUILD_MANIFEST_SHA/);assert.equal(fs.existsSync(path.join(f.consumer,'public')),false);
});
test('shared producer refuses ambient database, loader hooks and optional private test input',()=>{
 assert.doesNotThrow(()=>assertCiBuildEnvironment({CI:'true',PATH:'/synthetic'}));
 for(const key of ['PGPASSWORD','PGHOST','PGPORT','PGDATABASE','PGSERVICE','DATABASE_URL','DATABASE_URL_UNPOOLED','NEON_BRANCH_ID','NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','FRIENDLY_AGGREGATE_AUGUST_DIR','FRIENDLY_AGGREGATE_S11_DIR','MC_SHELL_SOURCE','MC_SCREENSHOT_PATH','MC_READER_QA_ARTIFACTS'])
  assert.throws(()=>assertCiBuildEnvironment({[key]:'private-marker'}),e=>/BUILD_(AMBIENT_DB_OR_PRIVATE_INPUT|OPTIONAL_LOCAL_INPUT)/.test(e.message)&&!e.message.includes('private-marker'));
});
test('real checkout identity pins the selected workflow, helper and clean source',t=>{
 const root=temporary(t),profile=CI_BUILD_WORKFLOWS[0];
 const files={'package.json':'{"type":"module"}\n','package-lock.json':'{}\n','scripts/own-art-tested-build.mjs':'// synthetic base helper\n','.github/workflows/own-art.yml':'name: synthetic base\n','scripts/lib/ci-tested-build.mjs':'// synthetic profile helper\n',[ciBuildWorkflow(profile)]:'name: synthetic consumer\n'};
 for(const [file,content]of Object.entries(files)){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
 const git=(...args)=>execFileSync('git',['-c','core.hooksPath='+path.join(root,'no-hooks'),'-c','commit.gpgsign=false','-c','user.name=Synthetic QA','-c','user.email=synthetic@example.invalid',...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','--quiet');git('add','.');git('commit','--quiet','-m','Synthetic isolated fixture');
 const env={GITHUB_SHA:git('rev-parse','HEAD'),GITHUB_REPOSITORY:'inguillen87/municipio-junin-friendly',GITHUB_EVENT_NAME:'pull_request',ART_PR_HEAD_SHA:'c'.repeat(40),GITHUB_RUN_ID:'101',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/pull/1/merge'};
 const got=ciBuildIdentity(root,profile,env);assert.match(got.npmVersion,/^\d+\.\d+\.\d+(?:[-+].+)?$/);assert.equal(got.platform,process.platform);assert.equal(got.consumerWorkflow,ciBuildWorkflow(profile));assert.equal(got.profileHelperSha256,sha(files['scripts/lib/ci-tested-build.mjs']));assert.equal(got.consumerWorkflowSha256,sha(files[ciBuildWorkflow(profile)]));assert.equal(got.checkoutSha,env.GITHUB_SHA);
 assert.throws(()=>ciBuildIdentity(root,profile,{...env,GITHUB_SHA:'e'.repeat(40)}),/ART_BUILD_CHECKOUT_SHA/);
 fs.appendFileSync(path.join(root,ciBuildWorkflow(profile)),'# changed\n');assert.throws(()=>ciBuildIdentity(root,profile,env),/ART_BUILD_TRACKED_SOURCE_CHANGED/);
});
test('all selected matrices retain explicit failed-producer and external-artifact gates',()=>{
 assert.deepEqual(Object.keys(BASELINE_RUNNERS).sort(),[...CI_BUILD_WORKFLOWS].sort());
 for(const profile of CI_BUILD_WORKFLOWS){
  const source=fs.readFileSync(new URL('../'+ciBuildWorkflow(profile),import.meta.url),'utf8'),jobs=workflowJobs(source),consumers=Object.keys(jobs).filter(key=>key!=='tested_build');
  assert.equal(consumers.length,1);const consumer=jobs[consumers[0]];
  assertJobInstallBoundary(jobs.tested_build,profile,'tested_build');
  assertJobInstallBoundary(consumer,profile,consumers[0]);
  assert.equal((source.match(/npm run build/g)||[]).length,1,profile);
  assert.ok(consumer.startsWith("    needs: tested_build\n    if: ${{ always() }}\n"),profile);
  const failed=consumer.indexOf("if: ${{ always() && (needs.tested_build.result != 'success' || cancelled()) }}"),checkout=consumer.indexOf('uses: actions/checkout@');
  assert.ok(failed>=0&&failed<checkout&&consumer.slice(failed,checkout).includes('run: exit 1'),profile);
  const outputs=consumer.indexOf('Require exact producer outputs'),download=consumer.indexOf('uses: actions/download-artifact@'),verify=consumer.indexOf('run: node scripts/lib/ci-tested-build.mjs verify '+profile);
  assert.ok(outputs>checkout&&download>outputs&&verify>download,profile);
  assert.match(consumer,/artifact-ids: \$\{\{ needs\.tested_build\.outputs\.artifact_id \}\}/);
  assert.match(consumer,/CI_BUILD_MANIFEST_SHA256: \$\{\{ needs\.tested_build\.outputs\.manifest_sha \}\}/);
  assert.doesNotMatch(source,/continue-on-error|workflow_run|pull_request_target|GITHUB_ENV|secrets\./);
 }
});
for(const [label,from,to,error]of [
 ['runner','    runs-on: ubuntu-24.04','    runs-on: ubuntu-latest','RUNNER_GUARD'],
 ['dependency-install script guard','run: npm ci --ignore-scripts','run: npm ci','INSTALL_SCRIPT_GUARD'],
 ['checkout credential guard','persist-credentials: false','persist-credentials: true','CHECKOUT_CREDENTIAL_GUARD'],
])test('consumer-only loss of '+label+' cannot be masked by the unchanged producer',()=>{
 const profile='municipal-owner-adoption',source=fs.readFileSync(new URL('../'+ciBuildWorkflow(profile),import.meta.url),'utf8'),jobs=workflowJobs(source);
 const altered={...jobs,verify:jobs.verify.replace(from,to)};
 assert.notEqual(altered.verify,jobs.verify);assert.equal(altered.tested_build,jobs.tested_build);
 assertJobInstallBoundary(altered.tested_build,profile,'tested_build');
 assert.throws(()=>assertJobInstallBoundary(altered.verify,profile,'verify'),new RegExp(error+':verify'));
});

function npmProbeForTest({platform='win32',executable='C:\\Pinned Node & Tools\\node.exe',readError,execError,realpathError}={}){
 const source=fs.readFileSync(new URL('../scripts/own-art-tested-build.mjs',import.meta.url),'utf8');
 const start=source.indexOf('function readNpmVersion(root)'),end=source.indexOf('\nexport function ownArtBuildIdentity',start);
 assert.ok(start>0&&end>start,'ACTUAL_NPM_PROBE_SOURCE_REQUIRED');
 const body=source.slice(start,end).trim(),calls=[];
 const context={path:platform==='win32'?path.win32:path.posix,process:{platform,execPath:executable},
  fs:{realpathSync(file){calls.push({kind:'realpath',file});if(realpathError)throw realpathError;return executable;}},
  readStable(file){calls.push({kind:'read',file});if(readError)throw readError;return Buffer.from('synthetic npm entry');},
  execFileSync(command,args,options){calls.push({kind:'execute',command,args:Array.from(args),options:{...options}});if(execError)throw execError;return '11.19.0\n';}};
 const probe=new vm.Script('('+body+')',{filename:'actual-own-art-npm-probe.vm'}).runInNewContext(context,{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}});
 return {probe,calls};
}

test('Windows npm version uses the current Node and its stable bundled JS entry with fixed argv and no shell',()=>{
 const executable='C:\\Pinned Node & Tools\\node.exe',root='D:\\Synthetic source & fixture',f=npmProbeForTest({executable});
 assert.equal(f.probe(root),'11.19.0');
 const cli='C:\\Pinned Node & Tools\\node_modules\\npm\\bin\\npm-cli.js';
 assert.deepEqual(f.calls.map(c=>c.kind),['realpath','read','execute']);
 assert.equal(f.calls[0].file,executable);assert.equal(f.calls[1].file,cli);
 assert.deepEqual(f.calls[2],{kind:'execute',command:executable,args:[cli,'--version'],options:{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true,shell:false}});
 assert.equal(f.calls.some(c=>c.command==='npm'||c.command==='npm.cmd'||c.command==='cmd.exe'),false);
});

test('non-Windows npm version preserves the existing bare npm command and never reads a Windows CLI',()=>{
 const f=npmProbeForTest({platform:'linux',executable:'/pinned node/bin/node'});
 assert.equal(f.probe('/synthetic source'),'11.19.0');
 assert.deepEqual(f.calls,[{kind:'execute',command:'npm',args:['--version'],options:{cwd:'/synthetic source',encoding:'utf8',timeout:10000,windowsHide:true,shell:false}}]);
});

test('missing Windows bundled npm CLI fails with its original error before any process or fallback',()=>{
 const error=Object.assign(new Error('Synthetic missing npm CLI'),{code:'ENOENT'}),f=npmProbeForTest({readError:error});
 assert.throws(()=>f.probe('D:\\synthetic'),e=>e===error);
 assert.deepEqual(f.calls.map(c=>c.kind),['realpath','read']);
});

test('failed Windows npm CLI execution preserves the exact child error and never invents a version',()=>{
 const error=Object.assign(new Error('Synthetic npm version failure'),{code:'EFAIL',status:37}),f=npmProbeForTest({execError:error});
 assert.throws(()=>f.probe('D:\\synthetic'),e=>e===error);
 assert.equal(f.calls.filter(c=>c.kind==='execute').length,1);
});

test('invalid current Node path fails before CLI read or any alternate executable',()=>{
 const error=Object.assign(new Error('Synthetic missing Node'),{code:'ENOENT'}),f=npmProbeForTest({realpathError:error});
 assert.throws(()=>f.probe('D:\\synthetic'),e=>e===error);
 assert.deepEqual(f.calls.map(c=>c.kind),['realpath']);
});

test('non-Windows missing npm preserves its original subprocess error without fallback',()=>{
 const error=Object.assign(new Error('Synthetic missing npm'),{code:'ENOENT'}),f=npmProbeForTest({platform:'linux',execError:error});
 assert.throws(()=>f.probe('/synthetic'),e=>e===error);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].command,'npm');
});
