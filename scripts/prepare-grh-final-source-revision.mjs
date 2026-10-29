// Explicit final-source maintenance. Rehearsal rolls back; saving never selects a source or adopts employees.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {parseArgs} from 'node:util';
import {Pool,neonConfig} from '@neondatabase/serverless';
import {prepareSuccessorPackage} from './lib/grh-successor-package-source.mjs';
import {validateSuccessorTarget} from './lib/grh-successor-operational-read.mjs';
import {prepareFinalSourceRevisionWithinTransaction,validateFinalSourceRevisionInput,FINAL_SOURCE_REVISION_PROFILES,FINAL_SOURCE_REVISION_OCTOBER28,validateFinalSourceConservationProfile} from './lib/grh-final-source-revision.mjs';
import {prepareFinalContractTransitionWithinTransaction,summarizeFinalContractTransition} from './lib/grh-final-contract-transition.mjs';
import {verifyCoreManifestProvenance} from './lib/grh-core-manifest-provenance.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export const finalSourceMaintenanceErrorCode=error=>/^(?:GRH_FINAL_(?:REVISION|CONSUMER|TRANSITION)|SUCCESSOR)_[A-Z_]+$/.test(error?.code??'')
 ?error.code:'GRH_FINAL_REVISION_FAILED';
// E-R2. An END (COMMIT or ROLLBACK) that got no answer is UNCERTAIN: the outcome is unknown, no further SQL is sent on
// that connection (no ROLLBACK after COMMIT, no second ROLLBACK), nothing is retried and the connection is discarded.
// The evidence carries identifiers and timestamps only, never rows.
export const FINAL_REVISION_UNCERTAIN_EVIDENCE_VERSION='grh-final-revision-uncertain-end-evidence.v1';
// Root boundary: accept bounded identifiers only. Never fall back to message or truncate arbitrary text.
const uncertainErrorIdentity=error=>{
 const code=error?.code,name=error?.name;
 if(typeof code==='string'&&/^[A-Z0-9_]{1,64}$/.test(code))return code;
 if(typeof name==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name))return name;
 return '';
};
export function uncertainEndError(statement,evidence,cause){
 const code=statement==='COMMIT'?'GRH_FINAL_REVISION_COMMIT_UNCONFIRMED':'GRH_FINAL_REVISION_END_UNCONFIRMED';
 return Object.assign(new Error(code),{code,outcomeUnknown:true,noFurtherSql:true,retried:false,connectionDiscarded:true,
  evidence:Object.freeze({version:FINAL_REVISION_UNCERTAIN_EVIDENCE_VERSION,...evidence,statement,cause:uncertainErrorIdentity(cause)})});
}
export function parseFinalSourceRevisionArgs(args){
 let values;try{({values}=parseArgs({args,strict:true,allowPositionals:false,options:{target:{type:'string'},
  'baseline-core':{type:'string'},'candidate-core':{type:'string'},'baseline-curated':{type:'string'},'candidate-curated':{type:'string'},
  'expect-package':{type:'string'},'install-schema':{type:'boolean'},rehearse:{type:'boolean'},'save-revision':{type:'boolean'},
  'review-contracts':{type:'boolean'},'verify-predecessor-manifest':{type:'boolean'},'candidate-profile':{type:'string'},'conservation-profile':{type:'string'}}}));}
 catch{fail('GRH_FINAL_REVISION_ARGUMENT');}
 if(!['target','baseline-core','candidate-core','baseline-curated','candidate-curated'].every(k=>typeof values[k]==='string'&&path.isAbsolute(values[k]))
  ||!/^[a-f0-9]{64}$/.test(values['expect-package']??'')||Number(values.rehearse===true)+Number(values['save-revision']===true)!==1)
  fail('GRH_FINAL_REVISION_ARGUMENT');
 if(values['candidate-profile']!==undefined&&!FINAL_SOURCE_REVISION_PROFILES.includes(values['candidate-profile']))fail('GRH_FINAL_REVISION_ARGUMENT');
 // Oct28 is an explicit opt-in that never reviews contracts (no consumers, adoption, v1 canonical or F eligibility).
 if(values['candidate-profile']===FINAL_SOURCE_REVISION_OCTOBER28.profileId&&values['review-contracts']!==undefined)fail('GRH_FINAL_REVISION_ARGUMENT');
 if(values['conservation-profile']!==undefined)validateFinalSourceConservationProfile(values['conservation-profile']);
 return values;
}
export async function executeFinalSourceRevision({connect,prepared,target,expectedPackageSha256,installSchema=false,commit=false,reviewContracts=false,baselineCoreManifestBytes,signal,conservationProfileId}={}){
 if(typeof connect!=='function'||typeof commit!=='boolean'||typeof installSchema!=='boolean'||typeof reviewContracts!=='boolean')fail('GRH_FINAL_REVISION_ARGUMENT');
 const profileId=validateFinalSourceConservationProfile(conservationProfileId);
 signal?.throwIfAborted();const checked=validateFinalSourceRevisionInput(prepared,target,expectedPackageSha256);
 if(checked.pack.candidate.profileId===FINAL_SOURCE_REVISION_OCTOBER28.profileId&&reviewContracts!==FINAL_SOURCE_REVISION_OCTOBER28.reviewContracts)fail('GRH_FINAL_REVISION_ARGUMENT');
 verifyCoreManifestProvenance(baselineCoreManifestBytes,checked.pack.baseline);
 let client,inTransaction=false,endSent=null,discard=false;
 const evidence={phase:'connect',sourceProfile:checked.pack.candidate.profileId,packageSha256:expectedPackageSha256,commitRequested:commit,revisionId:null,beganAt:null,endSentAt:null};
 try{
  client=await connect();signal?.throwIfAborted();
  if(typeof client?.query!=='function'||typeof client?.release!=='function')fail('GRH_FINAL_REVISION_CLIENT_REQUIRED');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');inTransaction=true;evidence.phase='transaction';evidence.beganAt=new Date().toISOString();
  await client.query("SET LOCAL timezone='UTC';SET LOCAL statement_timeout='120s';SET LOCAL lock_timeout='2s';SET LOCAL idle_in_transaction_session_timeout='120s'");
  const receipt=await prepareFinalSourceRevisionWithinTransaction({client,prepared:checked.pack,target:checked.target,
   expectedPackageSha256,installSchema,baselineCoreManifestBytes,signal,conservationProfileId:profileId});
  const contractTransition=reviewContracts?summarizeFinalContractTransition(await prepareFinalContractTransitionWithinTransaction({
   client,target:checked.target,revisionId:receipt.revisionId,expectedPackageSha256,
   sourceProfileId:checked.pack.candidate.profileId,signal})):null;
  evidence.revisionId=receipt.revisionId??null;
  signal?.throwIfAborted();endSent=commit?'COMMIT':'ROLLBACK';evidence.phase='end';evidence.endSentAt=new Date().toISOString();
  await client.query(endSent);inTransaction=false;evidence.phase='ended';
  return Object.freeze({...receipt,committed:commit,rolledBack:!commit,callerOwnedTransaction:false,
   ...(contractTransition?{contractTransition}:{}),
   maintenanceOutcome:commit?'revision_saved':'rehearsal_rolled_back'});
 }catch(error){
  // END already sent: UNCERTAIN. Zero SQL on this connection from here on; it is discarded, not reused.
  if(endSent){discard=true;throw uncertainEndError(endSent,evidence,error);}
  // Failure before END: one ROLLBACK attempt. Its missing answer is also an ambiguous END, never a safe failure.
  if(inTransaction){
   endSent='ROLLBACK';evidence.phase='cleanup-end';evidence.endSentAt=new Date().toISOString();
   evidence.originalErrorCodeOrName=uncertainErrorIdentity(error);
   try{await client.query(endSent);}catch(cleanupError){discard=true;throw uncertainEndError(endSent,evidence,cleanupError);}
  }
  throw error;
 }finally{if(typeof client?.release==='function')client.release(discard?Error('GRH_FINAL_REVISION_CONNECTION_DISCARDED'):undefined);}
}
async function main(){
 const args=parseFinalSourceRevisionArgs(process.argv.slice(2)),stat=await fs.lstat(args.target);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)fail('GRH_FINAL_REVISION_TARGET_FILE');
 const target=validateSuccessorTarget(JSON.parse(await fs.readFile(args.target,'utf8')));
 const connection=process.env.MC_FINAL_SOURCE_REVISION_DATABASE_URL;let url;
 try{url=new URL(connection);}catch{fail('GRH_FINAL_REVISION_CONNECTION_REQUIRED');}
 if(url.protocol!=='postgresql:'||!url.hostname.endsWith('.neon.tech')||url.pathname!=='/'+target.databaseName)
  fail('GRH_FINAL_REVISION_CONNECTION_REQUIRED');
 const prepared=await prepareSuccessorPackage({baselineCore:args['baseline-core'],candidateCore:args['candidate-core'],
  baselineCurated:args['baseline-curated'],candidateCurated:args['candidate-curated'],
  candidateProfileId:args['candidate-profile']??'grh-junin-2026-10-01'});
 // Validate before creating a pool or opening any connection.
 validateFinalSourceRevisionInput(prepared,target,args['expect-package']);
 let baselineCoreManifestBytes;
 if(args['verify-predecessor-manifest']===true){
  const directory=await fs.realpath(args['baseline-core']),file=path.join(directory,'grh-core-manifest.json');
  const entry=await fs.lstat(file);
  if(!entry.isFile()||entry.isSymbolicLink()||entry.size>1024*1024||path.dirname(await fs.realpath(file))!==directory)
   fail('GRH_FINAL_REVISION_MANIFEST_PROVENANCE');
  baselineCoreManifestBytes=await fs.readFile(file);
 }
 neonConfig.webSocketConstructor=WebSocket;const pool=new Pool({connectionString:connection,max:1,connectionTimeoutMillis:15000});
 try{const receipt=await executeFinalSourceRevision({connect:()=>pool.connect(),prepared,target,expectedPackageSha256:args['expect-package'],
  installSchema:args['install-schema']===true,commit:args['save-revision']===true,reviewContracts:args['review-contracts']===true,baselineCoreManifestBytes,
  conservationProfileId:args['conservation-profile'],
  signal:AbortSignal.timeout(240000)});
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),...receipt},null,2));
 }catch(error){
  // An uncertain END leaves a write-once evidence file next to the other verification receipts; no retry is attempted.
  if(error?.outcomeUnknown===true&&error.evidence){
   await fs.mkdir('verification',{recursive:true});
   const file=path.join('verification','final-source-revision-uncertain-'+String(error.evidence.endSentAt).replace(/[:.]/g,'-')+'.json');
   await fs.writeFile(file,JSON.stringify({code:error.code,outcomeUnknown:true,noFurtherSql:true,retried:false,...error.evidence},null,2)+'\n',{flag:'wx'});
   console.error(JSON.stringify({code:error.code,outcomeUnknown:true,evidenceFile:file}));
  }
  throw error;
 }finally{await pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 console.error(finalSourceMaintenanceErrorCode(error));process.exitCode=1;
});
