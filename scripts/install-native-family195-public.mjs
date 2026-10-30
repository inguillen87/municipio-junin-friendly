// One reviewed initial schema195 invocation. No user/role assignment or business command.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareNativeFamily195CommittedReview,assertNativeFamily195ReviewBytes} from './prepare-native-family195-public-installation.mjs';
import {executeNativeFamily195PublicInstallation} from './lib/native-family195-public-installation.mjs';
import {ownReleaseErrorObservation} from './lib/own-payroll-release-annulment-pg.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let output,sequence=0;
 try{
  const args={};for(const value of process.argv.slice(2)){const m=/^--(binding|binding-sha256|review|review-sha256|output)=(.+)$/.exec(value);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
  const root=path.resolve(import.meta.dirname,'..');output=path.resolve(args.output);
  assert.ok(output.startsWith(path.join(root,'verification')+path.sep));assert.ok(!fs.existsSync(output),'FAMILY195_PUBLIC_PRIOR_INVOCATION_PRESERVED');
  for(const key of ['binding-sha256','review-sha256'])assert.match(args[key],/^[a-f0-9]{64}$/);
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const bindingRaw=fs.readFileSync(path.resolve(args.binding)),reviewRaw=fs.readFileSync(path.resolve(args.review));
  assert.equal(hash(bindingRaw),args['binding-sha256']);assert.equal(hash(reviewRaw),args['review-sha256']);
  const {plan,review,bookend}=prepareNativeFamily195CommittedReview({root,sourceCommit,bindingRaw,bindingSha256:args['binding-sha256']});
  assertNativeFamily195ReviewBytes(reviewRaw,review);bookend();
  fs.mkdirSync(output); // Fresh immutable receipt directory, only after source validation.
  const record=value=>{const name=String(++sequence).padStart(3,'0')+'-state.json';fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});};
  let result;
  try{result=await executeNativeFamily195PublicInstallation({plan,bindingRaw,bindingSha256:args['binding-sha256'],record});}
  finally{const sourceAfter=bookend();assert.equal(hash(fs.readFileSync(path.resolve(args.binding))),args['binding-sha256']);fs.writeFileSync(path.join(output,'source-bookend.json'),JSON.stringify(sourceAfter,null,2)+'\n',{flag:'wx'});}
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({sourceCommit,major:17,installed:result.installed,durabilityVerified:result.durabilityVerified,readOnlyTransactionEnd:'COMMIT',roleAssignmentsAdded:0,businessOperations:0,noeliaReady:false}));
 }catch(error){
  const failure={ok:false,state:'UNCERTAIN',code:'FAMILY195_PUBLIC_INSTALL_FAILED',error:ownReleaseErrorObservation(error),noFurtherSql:true,noCleanup:true,automaticRetry:false};
  if(output&&fs.existsSync(output))try{fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify(failure,null,2)+'\n',{flag:'wx'});}catch{}
  console.error(JSON.stringify(failure));process.exitCode=1;
 }
}
