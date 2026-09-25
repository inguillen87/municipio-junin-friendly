// Ejecución explícita de preflight; no carga .env, instala esquemas ni conmuta la fuente.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {parseArgs} from 'node:util';
import {neon} from '@neondatabase/serverless';
import {prepareSuccessorPackage} from './lib/grh-successor-package-source.mjs';
import {planSuccessorOperationalRead,evaluateSuccessorOperationalRead,validateSuccessorTarget} from './lib/grh-successor-operational-read.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function parseSuccessorOperationalArgs(args){
 let values;try{({values}=parseArgs({args,strict:true,allowPositionals:false,options:{target:{type:'string'},'baseline-core':{type:'string'},'candidate-core':{type:'string'},'baseline-curated':{type:'string'},'candidate-curated':{type:'string'},'read-only':{type:'boolean'}}}));}catch{fail('SUCCESSOR_READ_ARGUMENT_INVALID');}
 const paths=['target','baseline-core','candidate-core','baseline-curated','candidate-curated'];
 if(values['read-only']!==true||!paths.every(k=>typeof values[k]==='string'&&path.isAbsolute(values[k])))fail('SUCCESSOR_READ_ARGUMENT_INVALID');
 return values;
}
export async function runSuccessorOperationalRead({prepared,target,transaction,signal}={}){
 if(typeof transaction!=='function')fail('SUCCESSOR_READ_TRANSACTION_REQUIRED');
 signal?.throwIfAborted();const plan=planSuccessorOperationalRead(prepared,target);
 const results=await transaction(plan.queries,plan.options,signal);
 signal?.throwIfAborted();return evaluateSuccessorOperationalRead(plan,results);
}
async function main(){
 const args=parseSuccessorOperationalArgs(process.argv.slice(2)),targetPath=args.target;
 const stat=await fs.lstat(targetPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)fail('SUCCESSOR_READ_TARGET_FILE_INVALID');
 const target=validateSuccessorTarget(JSON.parse(await fs.readFile(targetPath,'utf8')));
 const connection=process.env.MC_SUCCESSOR_READ_DATABASE_URL;if(!connection)fail('SUCCESSOR_READ_CONNECTION_REQUIRED');
 const prepared=await prepareSuccessorPackage({baselineCore:args['baseline-core'],candidateCore:args['candidate-core'],baselineCurated:args['baseline-curated'],candidateCurated:args['candidate-curated']});
 const sql=neon(connection),started=performance.now();
 const report=await runSuccessorOperationalRead({prepared,target,signal:AbortSignal.timeout(120000),transaction:(queries,options,signal)=>sql.transaction(queries.map(q=>sql.query(q.text,q.values)),{...options,fetchOptions:{signal}})});
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),queryMilliseconds:Math.round(performance.now()-started),...report},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(/^SUCCESSOR_[A-Z_]+$/.test(error?.code??'')?error.code:'SUCCESSOR_OPERATIONAL_READ_FAILED');process.exitCode=1;});
