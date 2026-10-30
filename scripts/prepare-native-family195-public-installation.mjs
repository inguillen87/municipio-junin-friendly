// Source review only. Fixed roots, raw committed custody, no connection.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareNativeFamily195PublicInstallation,assertNativeFamily195BuildBinding} from './lib/native-family195-public-installation.mjs';
import {createRecordingSourceReader,assertConsumedWithinClosure} from './lib/owner-qa-source-closure-reader.mjs';
import {ownerAuthorityQaSourceClosure,assertOwnerAuthorityQaSourceBookend} from './verify-municipal-owner-adoption-authority.mjs';
const entries=Object.freeze(['scripts/prepare-native-family195-public-installation.mjs','scripts/install-native-family195-public.mjs',
 'scripts/lib/native-family195-public-preflight.mjs','scripts/lib/native-family195-public-installation.mjs',
 'tests/native-family195-public-preflight.test.js','tests/native-family195-public-installation.test.js','.vercelignore','package.json','package-lock.json']);
const hash=value=>createHash('sha256').update(value).digest('hex');
export function prepareNativeFamily195CommittedReview({root,sourceCommit,bindingRaw,bindingSha256}){
 const recorder=createRecordingSourceReader({root});const plan=prepareNativeFamily195PublicInstallation({read:recorder.read,sourceCommit});
 const binding=assertNativeFamily195BuildBinding({raw:bindingRaw,sha256:bindingSha256,sourceCommit,target:plan.target});
 const consumed=recorder.consumed(),readBytes=file=>fs.readFileSync(path.join(root,file));
 const sourceClosure=ownerAuthorityQaSourceClosure({readBytes,entries,additional:consumed.map(row=>row.file)});
 const committedBytes=file=>execFileSync('git',['show',sourceCommit+':'+file],{cwd:root,maxBuffer:32*1024*1024});
 const sourceBookend=assertOwnerAuthorityQaSourceBookend(sourceClosure,{readBytes,committedBytes});
 const consumedBinding=assertConsumedWithinClosure(consumed,sourceClosure);
 const review=Object.freeze({version:'native-family195-public-source-review.v1',sourceCommit,plan,binding,
  sourceCustody:Object.freeze({sourceClosure,sourceBookend,consumedBinding,consumed}),connects:false,executesSql:false,productionAdmission:false});
 return {plan,review,bookend:()=>assertOwnerAuthorityQaSourceBookend(sourceClosure,{readBytes,committedBytes})};
}
export const nativeFamily195ReviewBytes=review=>Buffer.from(JSON.stringify(review,null,2)+'\n','utf8');
export function assertNativeFamily195ReviewBytes(actual,review){assert.ok(Buffer.isBuffer(actual));assert.ok(actual.equals(nativeFamily195ReviewBytes(review)),'FAMILY195_PUBLIC_REVIEW_BYTES_CHANGED');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args={};for(const value of process.argv.slice(2)){const m=/^--(binding|binding-sha256|output)=(.+)$/.exec(value);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
  assert.match(args['binding-sha256'],/^[a-f0-9]{64}$/);const root=path.resolve(import.meta.dirname,'..');
  const output=path.resolve(args.output);assert.ok(output.startsWith(path.join(root,'verification')+path.sep));assert.ok(!fs.existsSync(output));
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const bindingRaw=fs.readFileSync(path.resolve(args.binding));assert.equal(hash(bindingRaw),args['binding-sha256']);
  const {review}=prepareNativeFamily195CommittedReview({root,sourceCommit,bindingRaw,bindingSha256:args['binding-sha256']});
  fs.writeFileSync(output,nativeFamily195ReviewBytes(review),{flag:'wx'});
  console.log(JSON.stringify({sourceCommit,major:17,reviewWritten:true,layoutPending:0,connects:false,executesSql:false,productionAdmission:false}));
 }catch{console.error(JSON.stringify({ok:false,code:'FAMILY195_PUBLIC_PREPARATION_FAILED'}));process.exitCode=1;}
}
