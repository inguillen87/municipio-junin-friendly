// Operación de mantenimiento explícita. Por defecto ensaya y revierte; nunca selecciona la fuente.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {parseArgs} from 'node:util';
import {Pool,neonConfig} from '@neondatabase/serverless';
import {prepareSuccessorPackage} from './lib/grh-successor-package-source.mjs';
import {verifySuccessorPackage} from './lib/grh-successor-package.mjs';
import {validateSuccessorTarget} from './lib/grh-successor-operational-read.mjs';
import {stageSuccessorWithinTransaction} from './lib/grh-successor-staging-load.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function parseSuccessorStageArgs(args){
 let values;try{({values}=parseArgs({args,strict:true,allowPositionals:false,options:{target:{type:'string'},'baseline-core':{type:'string'},'candidate-core':{type:'string'},'baseline-curated':{type:'string'},'candidate-curated':{type:'string'},'expect-package':{type:'string'},'install-schema':{type:'boolean'},rehearse:{type:'boolean'},'commit-staging':{type:'boolean'}}}));}catch{fail('SUCCESSOR_STAGE_ARGUMENT_INVALID');}
 if(!['target','baseline-core','candidate-core','baseline-curated','candidate-curated'].every(k=>typeof values[k]==='string'&&path.isAbsolute(values[k]))
  ||!/^[a-f0-9]{64}$/.test(values['expect-package']??'')||Number(values.rehearse===true)+Number(values['commit-staging']===true)!==1)fail('SUCCESSOR_STAGE_ARGUMENT_INVALID');
 return values;
}
export async function executeSuccessorStage({connect,prepared,target,expectedPackageSha256,installSchema=false,commit=false,signal}={}){
 if(typeof connect!=='function'||typeof commit!=='boolean'||typeof installSchema!=='boolean')fail('SUCCESSOR_STAGE_ARGUMENT_INVALID');
 signal?.throwIfAborted();const pack=verifySuccessorPackage(structuredClone(prepared)),destination=validateSuccessorTarget(target);
 if(pack.payloadSha256!==expectedPackageSha256)fail('SUCCESSOR_STAGE_PACKAGE_CHANGED');
 let client,inTransaction=false,commitSent=false,discardConnection=false;
 try{
  client=await connect();signal?.throwIfAborted();if(typeof client?.query!=='function'||typeof client?.release!=='function')fail('SUCCESSOR_STAGE_CLIENT_REQUIRED');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');inTransaction=true;
  await client.query("SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='120s'");
  const receipt=await stageSuccessorWithinTransaction({client,prepared:pack,target:destination,expectedPackageSha256,installSchema,signal});
  signal?.throwIfAborted();commitSent=commit;
  await client.query(commit?'COMMIT':'ROLLBACK');inTransaction=false;
  return Object.freeze({...receipt,committed:commit,rolledBack:!commit,callerOwnedTransaction:false,maintenanceOutcome:commit?'staging_saved':'rehearsal_rolled_back'});
 }catch(error){
  if(inTransaction)try{await client.query('ROLLBACK');}catch{discardConnection=true;}
  if(commitSent){discardConnection=true;const unknown=new Error('SUCCESSOR_STAGE_COMMIT_UNCONFIRMED');unknown.code='SUCCESSOR_STAGE_COMMIT_UNCONFIRMED';unknown.outcomeUnknown=true;throw unknown;}
  throw error;
 }finally{if(client?.release)client.release(discardConnection?Error('SUCCESSOR_STAGE_CONNECTION_DISCARDED'):undefined);}
}
async function main(){
 const args=parseSuccessorStageArgs(process.argv.slice(2)),stat=await fs.lstat(args.target);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)fail('SUCCESSOR_STAGE_TARGET_FILE_INVALID');
 const target=validateSuccessorTarget(JSON.parse(await fs.readFile(args.target,'utf8')));
 const connection=process.env.MC_SUCCESSOR_STAGE_DATABASE_URL;let url;
 try{url=new URL(connection);}catch{fail('SUCCESSOR_STAGE_CONNECTION_REQUIRED');}
 if(url.protocol!=='postgresql:'||!url.hostname.endsWith('.neon.tech')||url.pathname!=='/'+target.databaseName)fail('SUCCESSOR_STAGE_CONNECTION_REQUIRED');
 const prepared=await prepareSuccessorPackage({baselineCore:args['baseline-core'],candidateCore:args['candidate-core'],baselineCurated:args['baseline-curated'],candidateCurated:args['candidate-curated']});
 neonConfig.webSocketConstructor=WebSocket;const pool=new Pool({connectionString:connection,max:1,connectionTimeoutMillis:15000});
 try{const receipt=await executeSuccessorStage({connect:()=>pool.connect(),prepared,target,expectedPackageSha256:args['expect-package'],installSchema:args['install-schema']===true,commit:args['commit-staging']===true,signal:AbortSignal.timeout(240000)});
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),...receipt},null,2));
 }finally{await pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(/^SUCCESSOR_[A-Z_]+$/.test(e?.code??'')?e.code:'SUCCESSOR_STAGE_FAILED');process.exitCode=1;});
