// Comando administrativo explícito. No se importa desde APIs ni se ejecuta durante un despliegue.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {parseArgs} from 'node:util';
import {Pool,neonConfig} from '@neondatabase/serverless';
import {executeIndexCapacity,validateIndexCapacityPlan} from './lib/grh-index-capacity.mjs';
export function parseIndexMaintenanceArgs(args){
 let values;try{({values}=parseArgs({args,strict:true,allowPositionals:false,options:{plan:{type:'string'},'expect-plan':{type:'string'},execute:{type:'boolean'}}}));}catch{throw Error('INDEX_CAPACITY_ARGUMENT_INVALID');}
 if(!path.isAbsolute(values.plan??'')||!/^[a-f0-9]{64}$/.test(values['expect-plan']??'')||values.execute!==true)throw Error('INDEX_CAPACITY_ARGUMENT_INVALID');return values;
}
async function main(){
 const args=parseIndexMaintenanceArgs(process.argv.slice(2)),stat=await fs.lstat(args.plan);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128*1024)throw Error('INDEX_CAPACITY_PLAN_FILE_INVALID');
 const plan=JSON.parse(await fs.readFile(args.plan,'utf8'));validateIndexCapacityPlan(plan,args['expect-plan']);
 let connection;try{connection=new URL(process.env.MC_INDEX_MAINTENANCE_DATABASE_URL);}catch{throw Error('INDEX_CAPACITY_CONNECTION_REQUIRED');}
 if(connection.protocol!=='postgresql:'||!connection.hostname.endsWith('.neon.tech')||connection.hostname.includes('-pooler.')||connection.pathname!=='/'+plan.target.databaseName)throw Error('INDEX_CAPACITY_CONNECTION_REQUIRED');
 neonConfig.webSocketConstructor=WebSocket;const pool=new Pool({connectionString:connection.href,max:1,connectionTimeoutMillis:15000});let client;
 try{client=await pool.connect();const receipt=await executeIndexCapacity({client,plan,expectedSha256:args['expect-plan'],confirm:true,signal:AbortSignal.timeout(10*60000)});console.log(JSON.stringify({...receipt,checkedAt:new Date().toISOString()},null,2));}
 finally{if(client)client.release(true);await pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 const code=/^INDEX_CAPACITY_[A-Z_]+$/.test(error?.code??error?.message??'')?(error.code??error.message):'INDEX_CAPACITY_FAILED';
 console.error(JSON.stringify({code,outcomeUnknown:error.outcomeUnknown===true,completed:error.completed??[],automaticRetry:false,sourcePromoted:false}));process.exitCode=1;
});
