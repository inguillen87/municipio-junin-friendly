// Review only. No connections, writes or business decisions.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {composeOwnM7PublicSchemaBatch} from './lib/own-m7-public-schema-batch.mjs';
import {ownerAuthorityQaSourceClosure,assertOwnerAuthorityQaSourceBookend} from './verify-municipal-owner-adoption-authority.mjs';
import {createRecordingSourceReader,assertConsumedWithinClosure} from './lib/owner-qa-source-closure-reader.mjs';
export function prepareOwnM7SchemaBatch({read,sourceCommit,operationalPairBaseline}){return composeOwnM7PublicSchemaBatch({read,sourceCommit,operationalPairBaseline});}
// Fixed roots only; every dependency/read is discovered by existing guards.
// WIP outside this closure is preserved. WIP inside it is never ignored.
export const OWN_M7_SOURCE_REVIEW_ENTRIES=Object.freeze([
 'scripts/prepare-own-m7-schema-batch-installation.mjs',
 'scripts/install-own-m7-schema-batch.mjs',
 'scripts/lib/own-m7-public-schema-batch.mjs',
 'tests/own-m7-public-schema-batch.test.js','tests/own-m7-public201215-executor.test.js','package.json','package-lock.json'
]);
export function ownM7CommittedSourceClosure({root,sourceCommit,consumed,readBytes=file=>fs.readFileSync(path.join(root,file)),committedBytes=file=>execFileSync('git',['show',sourceCommit+':'+file],{cwd:root,maxBuffer:24*1024*1024})}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok(Array.isArray(consumed));
 const sourceClosure=ownerAuthorityQaSourceClosure({readBytes,entries:OWN_M7_SOURCE_REVIEW_ENTRIES,additional:consumed.map(row=>row.file)});
 const sourceBookend=assertOwnerAuthorityQaSourceBookend(sourceClosure,{readBytes,committedBytes});
 const consumedBinding=assertConsumedWithinClosure(consumed,sourceClosure);
 return Object.freeze({sourceClosure,sourceBookend,consumedBinding});
}
export function prepareOwnM7CommittedReview({root,sourceCommit,operationalPairBaseline}){
 const recorder=createRecordingSourceReader({root});
 // Record RAW before explicit LF normalization; no source trimEnd().
 const batch=prepareOwnM7SchemaBatch({read:recorder.read,sourceCommit,operationalPairBaseline});
 const consumed=recorder.consumed(),custody=ownM7CommittedSourceClosure({root,sourceCommit,consumed});
 return Object.freeze({...batch,sourceCustody:Object.freeze({...custody,consumed})});
}
const ownM7ReviewBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
export function assertOwnM7ReviewBytes(actual,review){
 assert.ok(Buffer.isBuffer(actual),'OWN_M7_REVIEW_RAW_BUFFER_REQUIRED');
 assert.ok(actual.equals(ownM7ReviewBytes(review)),'OWN_M7_REVIEW_BYTES_CHANGED');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args={};for(const a of process.argv.slice(2)){const m=/^--(output|baseline)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
  assert.ok(['pre107','published107'].includes(args.baseline),'OWN_M7_EXPLICIT_BASELINE_REQUIRED');
  const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(args.output);assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const batch=prepareOwnM7CommittedReview({root,sourceCommit,operationalPairBaseline:args.baseline});
  fs.writeFileSync(output,ownM7ReviewBytes(batch),{flag:'wx'});
  console.log(JSON.stringify({sourceCommit,operationalPairBaseline:args.baseline,stages:batch.stageOrder,notComposed:batch.notComposed,connects:false,executesSql:false,roleAssignmentsAdded:0,capabilityDefinitionsAdded:0}));
 }catch{console.error(JSON.stringify({ok:false,code:'OWN_M7_PREPARATION_FAILED'}));process.exitCode=1;}
}
