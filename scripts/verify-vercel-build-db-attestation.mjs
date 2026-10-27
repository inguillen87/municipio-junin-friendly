// Build-only observation. Importing this module reads no env and opens no client.
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const ATTESTATION_VERSION='municontrol-vercel-build-db-attestation.v1';
export const BUILD_METADATA_SQL=`SELECT
 current_setting('server_version_num')::integer / 10000 AS "serverMajor",
 current_database()::text AS "database",
 current_user::text AS "currentUser",
 session_user::text AS "sessionUser",
 current_setting('neon.project_id',true) AS "neonProjectId",
 current_setting('neon.branch_id',true) AS "neonBranchId",
 current_setting('neon.endpoint_id',true) AS "neonEndpointId",
 current_setting('transaction_read_only') AS "transactionReadOnly"`;
const clients=Object.freeze(['DATABASE_URL','ACTIONS_DATABASE_URL']);
const fields=Object.freeze(['serverMajor','database','currentUser','sessionUser','neonProjectId','neonBranchId','neonEndpointId','transactionReadOnly']);
const codes=new Set(['BUILD_CONTEXT_REQUIRED','SOURCE_SHA_REQUIRED','SOURCE_SHA_MISMATCH','SQL_FACTORY_REQUIRED','OUTPUT_REQUIRED','CLIENT_CONFIGURATION_REQUIRED','CONFIGURED_HOSTNAME_INVALID','CLIENT_UNAVAILABLE','METADATA_INVALID','READ_ONLY_NOT_OBSERVED','OUTPUT_FAILED','NEON_IDENTITY_INCOMPLETE','ARGUMENTS_INVALID','UNEXPECTED_FAILURE']);
class AttestationFailure extends Error{
 constructor(code,clientClass=null){super(code);this.code=code;this.clientClass=clientClass;}
}
const fail=(code,clientClass=null)=>{throw new AttestationFailure(code,clientClass);};
function configuredBuildHostname(connection,clientClass){
 let hostname;try{hostname=new URL(connection).hostname;}catch{fail('CONFIGURED_HOSTNAME_INVALID',clientClass);}
 // Exact current Neon endpoint FQDN shape; never emit the URL or any other part.
 if(!/^ep-[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*\.aws\.neon\.tech$/.test(hostname)||hostname.length>253||hostname.split('.').some(label=>label.length>63))fail('CONFIGURED_HOSTNAME_INVALID',clientClass);
 return hostname;
}
function buildContext(env,sourceSha){
 const isVercel=env?.VERCEL,environment=env?.VERCEL_ENV,buildSourceSha=env?.VERCEL_GIT_COMMIT_SHA;
 if(isVercel!=='1'||!['preview','production'].includes(environment))fail('BUILD_CONTEXT_REQUIRED');
 if(typeof sourceSha!=='string'||!/^[a-f0-9]{40}$/.test(sourceSha))fail('SOURCE_SHA_REQUIRED');
 if(buildSourceSha!==sourceSha)fail('SOURCE_SHA_MISMATCH');
 return Object.freeze({sourceSha,environment});
}
function observation(row,context,clientClass,configuredHostname){
 if(!row||Object.getPrototypeOf(row)!==Object.prototype||Object.keys(row).length!==fields.length||!fields.every(key=>Object.hasOwn(row,key)))fail('METADATA_INVALID',clientClass);
 if(!Number.isInteger(row.serverMajor)||row.serverMajor<1||row.serverMajor>99)fail('METADATA_INVALID',clientClass);
 // Server identity fields remain observed; the configured host has separate provenance.
 for(const key of ['database','currentUser','sessionUser'])if(typeof row[key]!=='string'||!/^[A-Za-z0-9_$-]{1,63}$/.test(row[key]))fail('METADATA_INVALID',clientClass);
 for(const [key,pattern]of [['neonProjectId',/^[a-z0-9][a-z0-9-]{0,127}$/],['neonBranchId',/^br-[a-z0-9-]{1,120}$/],['neonEndpointId',/^ep-[a-z0-9-]{1,120}$/]])if(row[key]!==null&&(typeof row[key]!=='string'||!pattern.test(row[key])))fail('METADATA_INVALID',clientClass);
 if(row.transactionReadOnly!=='on')fail('READ_ONLY_NOT_OBSERVED',clientClass);
 const neonIdentityComplete=['neonProjectId','neonBranchId','neonEndpointId'].every(key=>row[key]!==null);
 return Object.freeze({version:ATTESTATION_VERSION,event:'observation',...context,clientClass,
  serverMajor:row.serverMajor,database:row.database,currentUser:row.currentUser,sessionUser:row.sessionUser,
  neonProjectId:row.neonProjectId,neonBranchId:row.neonBranchId,neonEndpointId:row.neonEndpointId,
  transactionReadOnly:'on',neonIdentityComplete,configuredHostname,configuredHostnameSource:'configured-build-env'});
}
async function emit(writeLine,value,clientClass=null){try{await writeLine(JSON.stringify(value));}catch{fail('OUTPUT_FAILED',clientClass);}}
function safeFailure(error,clientClass=null){
 if(error instanceof AttestationFailure&&codes.has(error.code)&&(!error.clientClass||clients.includes(error.clientClass)))return error;
 return new AttestationFailure('UNEXPECTED_FAILURE',clientClass);
}

export async function attestVercelBuildDatabases({env,sourceSha,createSql,writeLine}){
 let clientClass=null;
 try{
  const context=buildContext(env,sourceSha);
  if(typeof createSql!=='function')fail('SQL_FACTORY_REQUIRED');
  if(typeof writeLine!=='function')fail('OUTPUT_REQUIRED');
  // Preflight BOTH variables before either query. No local fallback or other key.
  const configured=clients.map(key=>{
   const value=env[key];if(typeof value!=='string'||!value.trim())fail('CLIENT_CONFIGURATION_REQUIRED',key);
   // Match the app: internal DATABASE_URL stays unchanged; actions URL is trimmed.
   const connection=key==='ACTIONS_DATABASE_URL'?value.trim():value;
   return {key,connection,configuredHostname:configuredBuildHostname(connection,key)};
  });
  const observed=[];
  for(const {key,connection,configuredHostname}of configured){
   clientClass=key;let sql;
   try{sql=createSql(connection);}catch{fail('CLIENT_UNAVAILABLE',key);}
   if(!sql||typeof sql.query!=='function'||typeof sql.transaction!=='function')fail('CLIENT_UNAVAILABLE',key);
   let result;
   try{
    // One metadata SELECT per client. The driver encloses it in READ ONLY;
    // its batch option is required (a plain query does not send this header).
    result=await sql.transaction([sql.query(BUILD_METADATA_SQL,[])],{
     readOnly:true,isolationLevel:'ReadCommitted',arrayMode:false,fullResults:false,
     fetchOptions:{signal:AbortSignal.timeout(15000)}
    });
   }catch{fail('CLIENT_UNAVAILABLE',key);}
   if(!Array.isArray(result)||result.length!==1||!Array.isArray(result[0])||result[0].length!==1)fail('METADATA_INVALID',key);
   const value=observation(result[0][0],context,key,configuredHostname);await emit(writeLine,value,key);observed.push(value);
  }
  // Missing Neon settings are reported as NULL, never inferred from a gateway,
  // DB name, major or URL. Both valid RO observations remain useful evidence.
  if(observed.some(value=>!value.neonIdentityComplete))fail('NEON_IDENTITY_INCOMPLETE');
  const complete=Object.freeze({version:ATTESTATION_VERSION,event:'complete',...context,clientsObserved:2,neonIdentityComplete:true,observationOnly:true});
  await emit(writeLine,complete);return Object.freeze(observed);
 }catch(error){throw safeFailure(error,clientClass);}
}

export async function main(argv=process.argv.slice(2),env=process.env){
 let createSql;
 try{
  if(argv.length!==2||argv[0]!=='--source-sha')fail('ARGUMENTS_INVALID');
  buildContext(env,argv[1]);
  // Dynamic import only on direct CLI execution. Normal build env stays in memory.
  const {neon}=await import('@neondatabase/serverless');createSql=neon;
  await attestVercelBuildDatabases({env,sourceSha:argv[1],createSql,writeLine:line=>console.log(line)});
  return 0;
 }catch(error){
  const safe=safeFailure(error);
  // Never print exception.message, cause, stack, argv, env, headers or URL.
  console.error(JSON.stringify({version:ATTESTATION_VERSION,event:'failure',code:safe.code,clientClass:safe.clientClass}));
  return 1;
 }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().then(code=>{process.exitCode=code;},()=>{console.error('{"version":"municontrol-vercel-build-db-attestation.v1","event":"failure","code":"UNEXPECTED_FAILURE","clientClass":null}');process.exitCode=1;});
}
