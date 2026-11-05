// Participation profile over the unchanged OwnART same-run public-byte protocol.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {assertOwnArtBuildEnvironment,ownArtBuildIdentity,createOwnArtBuildEnvelope,verifyOwnArtBuildEnvelope} from '../own-art-tested-build.mjs';

export const PERIOD_BUILD_PROFILE='own-period-participation-tested-public.v1';
const HEX=/^[a-f0-9]{64}$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fingerprint=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String).join('|');
function sourceHash(file){
 const before=fs.lstatSync(file,{bigint:true});
 assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n,'PERIOD_BUILD_REGULAR_SINGLE_LINK');
 const bytes=fs.readFileSync(file),after=fs.lstatSync(file,{bigint:true});
 assert.equal(fingerprint(after),fingerprint(before),'PERIOD_BUILD_CHANGED_DURING_READ');
 return sha(bytes);
}
export function assertOwnPeriodBuildProfile(identity){
 assert.equal(identity?.consumerProfile,PERIOD_BUILD_PROFILE,'PERIOD_BUILD_PROFILE');
 assert.match(identity.profileHelperSha256??'',HEX,'PERIOD_BUILD_HELPER_PIN');
 assert.match(identity.consumerWorkflowSha256??'',HEX,'PERIOD_BUILD_WORKFLOW_PIN');
}
export function ownPeriodBuildIdentity(root,env=process.env){
 const identity={...ownArtBuildIdentity(root,env),consumerProfile:PERIOD_BUILD_PROFILE,
  profileHelperSha256:sourceHash(path.join(root,'scripts/lib/own-period-participation-tested-build.mjs')),
  consumerWorkflowSha256:sourceHash(path.join(root,'.github/workflows/own-period-participation.yml'))};
 assertOwnPeriodBuildProfile(identity);return identity;
}
export function createOwnPeriodBuildEnvelope(options){
 assertOwnPeriodBuildProfile(options.identity);return createOwnArtBuildEnvelope(options);
}
export function verifyOwnPeriodBuildEnvelope(options){
 assertOwnPeriodBuildProfile(options.identity);return verifyOwnArtBuildEnvelope(options);
}
function main(){
 const mode=process.argv[2];
 assert.ok(['preflight','create','verify'].includes(mode)&&process.argv.length===3,'PERIOD_BUILD_ARGS');
 const root=process.cwd(),env=process.env;assert.equal(process.platform,'linux','PERIOD_BUILD_PILOT_PLATFORM');
 if(mode==='preflight'){assertOwnArtBuildEnvironment(env);ownPeriodBuildIdentity(root,env);return;}
 assert.ok(env.RUNNER_TEMP&&path.isAbsolute(env.RUNNER_TEMP),'PERIOD_BUILD_RUNNER_TEMP');
 const envelope=path.join(env.RUNNER_TEMP,'own-period-tested-public'),identity=ownPeriodBuildIdentity(root,env);
 const result=mode==='create'?createOwnPeriodBuildEnvelope({root,envelope,identity}):
  verifyOwnPeriodBuildEnvelope({root,envelope,identity,expectedManifestSha256:env.PERIOD_MANIFEST_SHA256,install:true});
 assert.deepEqual(ownPeriodBuildIdentity(root,env),identity,'PERIOD_BUILD_CONTEXT_BOOKEND');
 if(mode==='create'){
  assert.ok(env.GITHUB_OUTPUT&&path.isAbsolute(env.GITHUB_OUTPUT),'PERIOD_BUILD_OUTPUT');
  fs.appendFileSync(env.GITHUB_OUTPUT,'manifest-sha='+result.manifestSha256+'\n');
 }
 console.log(JSON.stringify({profile:PERIOD_BUILD_PROFILE,mode,checkoutSha:identity.checkoutSha,prHeadSha:identity.prHeadSha,
  runId:identity.runId,runAttempt:identity.runAttempt,...result}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
