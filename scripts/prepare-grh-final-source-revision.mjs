// Explicit final-source maintenance. Rehearsal rolls back; saving never selects a source or adopts employees.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {parseArgs} from 'node:util';
import {Pool,neonConfig} from '@neondatabase/serverless';
import {prepareSuccessorPackage} from './lib/grh-successor-package-source.mjs';
import {validateSuccessorTarget} from './lib/grh-successor-operational-read.mjs';
import {prepareFinalSourceRevisionWithinTransaction,validateFinalSourceRevisionInput} from './lib/grh-final-source-revision.mjs';
import {prepareFinalContractTransitionWithinTransaction,summarizeFinalContractTransition} from './lib/grh-final-contract-transition.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export const finalSourceMaintenanceErrorCode=error=>/^(?:GRH_FINAL_(?:REVISION|CONSUMER|TRANSITION)|SUCCESSOR)_[A-Z_]+$/.test(error?.code??'')
 ?error.code:'GRH_FINAL_REVISION_FAILED';
export function parseFinalSourceRevisionArgs(args){
 let values;try{({values}=parseArgs({args,strict:true,allowPositionals:false,options:{target:{type:'string'},
  'baseline-core':{type:'string'},'candidate-core':{type:'string'},'baseline-curated':{type:'string'},'candidate-curated':{type:'string'},
  'expect-package':{type:'string'},'install-schema':{type:'boolean'},rehearse:{type:'boolean'},'save-revision':{type:'boolean'},
  'review-contracts':{type:'boolean'}}}));}
 catch{fail('GRH_FINAL_REVISION_ARGUMENT');}
 if(!['target','baseline-core','candidate-core','baseline-curated','candidate-curated'].every(k=>typeof values[k]==='string'&&path.isAbsolute(values[k]))
  ||!/^[a-f0-9]{64}$/.test(values['expect-package']??'')||Number(values.rehearse===true)+Number(values['save-revision']===true)!==1)
  fail('GRH_FINAL_REVISION_ARGUMENT');
 return values;
}
export async function executeFinalSourceRevision({connect,prepared,target,expectedPackageSha256,installSchema=false,commit=false,reviewContracts=false,signal}={}){
 if(typeof connect!=='function'||typeof commit!=='boolean'||typeof installSchema!=='boolean'||typeof reviewContracts!=='boolean')fail('GRH_FINAL_REVISION_ARGUMENT');
 signal?.throwIfAborted();const checked=validateFinalSourceRevisionInput(prepared,target,expectedPackageSha256);
 let client,inTransaction=false,commitSent=false,discard=false;
 try{
  client=await connect();signal?.throwIfAborted();
  if(typeof client?.query!=='function'||typeof client?.release!=='function')fail('GRH_FINAL_REVISION_CLIENT_REQUIRED');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');inTransaction=true;
  await client.query("SET LOCAL timezone='UTC';SET LOCAL statement_timeout='120s';SET LOCAL lock_timeout='2s';SET LOCAL idle_in_transaction_session_timeout='120s'");
  const receipt=await prepareFinalSourceRevisionWithinTransaction({client,prepared:checked.pack,target:checked.target,
   expectedPackageSha256,installSchema,signal});
  const contractTransition=reviewContracts?summarizeFinalContractTransition(await prepareFinalContractTransitionWithinTransaction({
   client,target:checked.target,revisionId:receipt.revisionId,expectedPackageSha256,signal})):null;
  signal?.throwIfAborted();commitSent=commit;
  await client.query(commit?'COMMIT':'ROLLBACK');inTransaction=false;
  return Object.freeze({...receipt,committed:commit,rolledBack:!commit,callerOwnedTransaction:false,
   ...(contractTransition?{contractTransition}:{}),
   maintenanceOutcome:commit?'revision_saved':'rehearsal_rolled_back'});
 }catch(error){
  if(inTransaction)try{await client.query('ROLLBACK');}catch{discard=true;}
  if(commitSent){discard=true;const uncertain=Object.assign(new Error('GRH_FINAL_REVISION_COMMIT_UNCONFIRMED'),
   {code:'GRH_FINAL_REVISION_COMMIT_UNCONFIRMED',outcomeUnknown:true});throw uncertain;}
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
  baselineCurated:args['baseline-curated'],candidateCurated:args['candidate-curated'],candidateProfileId:'grh-junin-2026-10-01'});
 // Validate before creating a pool or opening any connection.
 validateFinalSourceRevisionInput(prepared,target,args['expect-package']);
 neonConfig.webSocketConstructor=WebSocket;const pool=new Pool({connectionString:connection,max:1,connectionTimeoutMillis:15000});
 try{const receipt=await executeFinalSourceRevision({connect:()=>pool.connect(),prepared,target,expectedPackageSha256:args['expect-package'],
  installSchema:args['install-schema']===true,commit:args['save-revision']===true,reviewContracts:args['review-contracts']===true,
  signal:AbortSignal.timeout(240000)});
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),...receipt},null,2));
 }finally{await pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 console.error(finalSourceMaintenanceErrorCode(error));process.exitCode=1;
});
