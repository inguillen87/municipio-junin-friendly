// Same-run public-byte envelopes for the audited PostgreSQL workflow matrices.
// Full test success is enforced by the producer job and needs, never this manifest.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {assertOwnArtBuildEnvironment,ownArtBuildIdentity,createOwnArtBuildEnvelope,verifyOwnArtBuildEnvelope} from '../own-art-tested-build.mjs';

export const CI_BUILD_PROFILE='ci-shared-tested-public.v1';
export const CI_BUILD_WORKFLOWS=Object.freeze([
 'exact-program-precision','municipal-owner-adoption','municipal-owner-catalog','municipal-owner-program','municipal-owner-salary',
 'own-agreement-working-time','own-bank-accounts','own-contract-working-time','own-fiscal-facts','own-monthly-participation',
 'own-payroll-accounting','own-payroll-administrative-operator','own-salary-conditions','own-salary-seniority',
 'program-scale-reference','salary-auxiliary-namespace','salary-day-units'
]);
const HEX=/^[a-f0-9]{64}$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fingerprint=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String).join('|');
function sourceHash(file){
 const before=fs.lstatSync(file,{bigint:true});
 assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n,'CI_BUILD_REGULAR_SINGLE_LINK');
 const bytes=fs.readFileSync(file),after=fs.lstatSync(file,{bigint:true});
 assert.equal(fingerprint(after),fingerprint(before),'CI_BUILD_SOURCE_CHANGED_DURING_READ');return sha(bytes);
}
export function ciBuildWorkflow(profile){
 assert.ok(CI_BUILD_WORKFLOWS.includes(profile),'CI_BUILD_WORKFLOW_PROFILE');
 return '.github/workflows/'+profile+'.yml';
}
export function assertCiBuildEnvironment(env){
 assertOwnArtBuildEnvironment(env);
 // Optional local UI/reader inputs also change the scope of tests/*.test.js.
 const forbidden=['MC_SHELL_SOURCE','MC_SCREENSHOT_PATH','MC_READER_QA_ARTIFACTS'].filter(key=>Object.hasOwn(env,key));
 assert.equal(forbidden.length,0,'CI_BUILD_OPTIONAL_LOCAL_INPUT');
}
export function assertCiBuildProfile(identity){
 assert.equal(identity?.consumerProfile,CI_BUILD_PROFILE,'CI_BUILD_PROFILE');
 assert.equal(identity.consumerWorkflow,ciBuildWorkflow(identity.workflowProfile),'CI_BUILD_WORKFLOW');
 assert.match(identity.profileHelperSha256??'',HEX,'CI_BUILD_HELPER_PIN');
 assert.match(identity.consumerWorkflowSha256??'',HEX,'CI_BUILD_WORKFLOW_PIN');
}
export function ciBuildIdentity(root,profile,env=process.env){
 const consumerWorkflow=ciBuildWorkflow(profile);
 const identity={...ownArtBuildIdentity(root,env),consumerProfile:CI_BUILD_PROFILE,workflowProfile:profile,consumerWorkflow,
  profileHelperSha256:sourceHash(path.join(root,'scripts/lib/ci-tested-build.mjs')),
  consumerWorkflowSha256:sourceHash(path.join(root,consumerWorkflow))};
 assertCiBuildProfile(identity);return identity;
}
export function createCiBuildEnvelope(options){assertCiBuildProfile(options.identity);return createOwnArtBuildEnvelope(options);}
export function verifyCiBuildEnvelope(options){assertCiBuildProfile(options.identity);return verifyOwnArtBuildEnvelope(options);}
function main(){
 const [mode,profile]=process.argv.slice(2);
 assert.ok(['preflight','create','verify'].includes(mode)&&process.argv.length===4,'CI_BUILD_ARGS');ciBuildWorkflow(profile);
 const root=process.cwd(),env=process.env;assert.equal(process.platform,'linux','CI_BUILD_PLATFORM');
 if(mode==='preflight'){assertCiBuildEnvironment(env);ciBuildIdentity(root,profile,env);return;}
 assert.ok(env.RUNNER_TEMP&&path.isAbsolute(env.RUNNER_TEMP),'CI_BUILD_RUNNER_TEMP');
 const envelope=path.join(env.RUNNER_TEMP,'ci-tested-public-'+profile),identity=ciBuildIdentity(root,profile,env);
 const result=mode==='create'?createCiBuildEnvelope({root,envelope,identity}):
  verifyCiBuildEnvelope({root,envelope,identity,expectedManifestSha256:env.CI_BUILD_MANIFEST_SHA256,install:true});
 assert.deepEqual(ciBuildIdentity(root,profile,env),identity,'CI_BUILD_CONTEXT_BOOKEND');
 if(mode==='create'){
  assert.ok(env.GITHUB_OUTPUT&&path.isAbsolute(env.GITHUB_OUTPUT),'CI_BUILD_OUTPUT');
  fs.appendFileSync(env.GITHUB_OUTPUT,'manifest-sha='+result.manifestSha256+'\n');
 }
 console.log(JSON.stringify({profile:CI_BUILD_PROFILE,workflowProfile:profile,mode,checkoutSha:identity.checkoutSha,
  prHeadSha:identity.prHeadSha,runId:identity.runId,runAttempt:identity.runAttempt,...result}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
