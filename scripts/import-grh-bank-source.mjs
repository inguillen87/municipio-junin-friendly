import { readFile,realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { Client,neonConfig } from '@neondatabase/serverless';
import { validateBankSourcePayload,bankUuid,bankHash } from '../lib/internal-payroll-bank-source.js';

export async function importBankSource(client,payload,options) {
 validateBankSourcePayload(payload);
 if(!bankUuid(options.tenantId)||!bankUuid(options.sourceBindingId)||!bankHash(options.payloadSha256)||!bankHash(options.expectedSourceSha256)
  ||payload.sourceSha256!==options.expectedSourceSha256||!Number.isSafeInteger(options.expectedDatasets)||options.expectedDatasets<1)throw Error('BANK_IMPORT_CONTEXT_INVALID');
 const context=await client.query(`SELECT b.source_database,b.source_company_id::text AS company
  FROM platform_tenant_source_binding b JOIN tenant_identity_policy p ON p.tenant_id=b.tenant_id AND p.certified_source_binding_id=b.id
  WHERE b.tenant_id=$1::uuid AND b.id=$2::uuid AND b.verified AND p.tenant_data_plane_ready`,[options.tenantId,options.sourceBindingId]);
 if(context.rows.length!==1||context.rows[0].source_database!==payload.sourceDatabase||context.rows[0].company!==payload.company)throw Error('BANK_IMPORT_BINDING_MISMATCH');
 const datasets=await client.query(`SELECT count(*)::integer AS total FROM payroll_detail_dataset
  WHERE tenant_id=$1::uuid AND source_binding_id=$2::uuid AND source_sha256=$3 AND source_database=$4 AND company_id=$5::bigint`,
 [options.tenantId,options.sourceBindingId,payload.sourceSha256,payload.sourceDatabase,payload.company]);
 if(datasets.rows[0]?.total!==options.expectedDatasets)throw Error('BANK_IMPORT_DATASET_COUNT_MISMATCH');
 const summary={mode:options.apply?'apply':'dry-run',sourceSha256:payload.sourceSha256,payloadSha256:options.payloadSha256,
  cutoff:payload.cutoff,employees:payload.employees.length,assignments:payload.assignments.length,matchingDatasets:datasets.rows[0].total};
 if(!options.apply)return summary;
 await client.query('BEGIN');let commitAttempted=false;
 try{
  await client.query("SELECT pg_advisory_xact_lock(hashtext('payroll-bank-source-import'),hashtext($1))",[options.tenantId+':'+payload.sourceSha256]);
  const values=[options.tenantId,options.sourceBindingId,payload.sourceSha256,payload.sourceDatabase,payload.company];
  const existing=await client.query(`SELECT payload_sha256 FROM payroll_bank_source WHERE tenant_id=$1::uuid AND source_binding_id=$2::uuid
   AND source_sha256=$3 AND source_database=$4 AND company_id=$5::bigint`,values);
  if(existing.rows.length){if(existing.rows.length!==1||existing.rows[0].payload_sha256!==options.payloadSha256)throw Error('BANK_IMPORT_IMMUTABLE_SOURCE_CONFLICT')}
  else await client.query(`INSERT INTO payroll_bank_source(tenant_id,source_binding_id,source_sha256,source_database,company_id,payload_sha256,source_cutoff,employee_count,assignment_count,source_payload)
   VALUES($1::uuid,$2::uuid,$3,$4,$5::bigint,$6,$7,$8,$9,$10::jsonb)`,[...values,options.payloadSha256,payload.cutoff,payload.employees.length,payload.assignments.length,JSON.stringify(payload)]);
  commitAttempted=true;await client.query('COMMIT');return {...summary,inserted:existing.rows.length===0};
 }catch(error){
  if(!commitAttempted)await client.query('ROLLBACK').catch(()=>{});
  error.bankImportCommitState=commitAttempted?'unknown':'not_committed';throw error;
 }
}
async function main(){
 const args={};for(let i=2;i<process.argv.length;i++){const key=process.argv[i];if(key==='--apply')args.apply=true;else if(key.startsWith('--')&&process.argv[i+1]&&!process.argv[i+1].startsWith('--'))args[key.slice(2)]=process.argv[++i];else throw Error('BANK_IMPORT_ARGUMENT_INVALID')}
 const allowed=['input','tenant-id','source-binding-id','expected-source-sha256','expected-payload-sha256','expected-host','expected-datasets','apply'];
 if(Object.keys(args).some(k=>!allowed.includes(k))||!args.input||!args['expected-host'])throw Error('BANK_IMPORT_ARGUMENT_INVALID');
 const file=await realpath(path.resolve(args.input)),bytes=await readFile(file);
 if(bytes.length>5*1024*1024||createHash('sha256').update(bytes).digest('hex')!==args['expected-payload-sha256'])throw Error('BANK_IMPORT_PAYLOAD_HASH_MISMATCH');
 const payload=validateBankSourcePayload(JSON.parse(bytes.toString('utf8')));
 const connectionString=process.env.BANK_SOURCE_DATABASE_URL||process.env.DATABASE_URL;
 if(!connectionString)throw Error('BANK_IMPORT_CONNECTION_REQUIRED');
 const target=new URL(connectionString);if(target.hostname!==args['expected-host']||target.pathname!=='/neondb')throw Error('BANK_IMPORT_HOST_MISMATCH');
 neonConfig.webSocketConstructor=WebSocket;
 const client=new Client({connectionString});await client.connect();
 try{
  const live=(await client.query("SELECT current_setting('neon.branch_id',true) AS branch,current_database() AS database,current_user AS role")).rows[0];
  if(live.branch!=='br-plain-dust-acpjgebb'||live.database!=='neondb'||live.role!=='neondb_owner')throw Error('BANK_IMPORT_LIVE_TARGET_MISMATCH');
  console.log(JSON.stringify(await importBankSource(client,payload,{tenantId:args['tenant-id'],sourceBindingId:args['source-binding-id'],
  expectedSourceSha256:args['expected-source-sha256'],payloadSha256:args['expected-payload-sha256'],expectedDatasets:Number(args['expected-datasets']),apply:args.apply===true})))}finally{await client.end()}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main().catch(error=>{
 const state=error.bankImportCommitState??'not_committed';
 console.error(JSON.stringify({ok:false,code:/^BANK_IMPORT_[A-Z_]+$/.test(error.message)?error.message:'BANK_IMPORT_FAILED',
  commitState:state,requiresSourceReconciliation:state==='unknown'}));process.exitCode=1;
});
