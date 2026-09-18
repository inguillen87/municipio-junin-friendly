import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {GRH_VERSION_ENTITIES,importGrhSourceVersionWithinTransaction} from './lib/grh-core-source-version.mjs';
const quote=x=>'"'+x.replaceAll('"','""')+'"';
async function fingerprints(client){
 const tables=(await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public' OR schemaname LIKE 'mc_backup_%' OR schemaname LIKE 'mc_access_%' ORDER BY 1,2")).rows;
 const result={};for(const t of tables){result[t.schemaname+'.'+t.tablename]=(await client.query(`SELECT count(*)::text rows,md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')) digest FROM ${quote(t.schemaname)}.${quote(t.tablename)} r`)).rows[0];}return result;
}
export async function rehearseCurrentGrhSource({client,prepared,expectedPayloadSha256,baselineBatchId,baselineImportRunId,tenantId,sourceBindingId}){
 const target=(await client.query("SELECT current_database() database,host(inet_server_addr()) host,inet_server_port() port,current_setting('neon.branch_id',true) branch")).rows[0];
 if(target.database!=='current_rehearsal'||target.host!=='127.0.0.1'||target.port!==55441||target.branch)throw Error('CURRENT_REHEARSAL_LOCAL_ONLY');
 const report={version:'grh-current-restoration-rehearsal.v1',startedAt:new Date().toISOString(),productionWrites:0,sourceActivated:false,checks:[],candidate:{}};let before,tx=false;
 try{
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL timezone='UTC';SET LOCAL statement_timeout='120s';SET LOCAL lock_timeout='3s'");tx=true;
  before=await fingerprints(client);report.baselineTables=Object.keys(before).length;
  if((await client.query("SELECT to_regclass('public.grh_core_source_version') IS NOT NULL present")).rows[0].present)throw Error('CURRENT_REHEARSAL_CLEAN_RESTORE_REQUIRED');
  const ddl=await fs.readFile(new URL('./migrations/061-grh-core-source-version.sql',import.meta.url),'utf8');report.ddlSha256=createHash('sha256').update(ddl).digest('hex');await client.query(ddl);
  const args={client,prepared,expectedPayloadSha256,baselineBatchId,baselineImportRunId,tenantId,sourceBindingId};
  report.import=await importGrhSourceVersionWithinTransaction(args);await client.query('SET CONSTRAINTS grh_core_source_version_sealed_at_commit IMMEDIATE');report.checks.push('candidate_sealed_against_current_restoration');
  report.replay=await importGrhSourceVersionWithinTransaction(args);assert.equal(report.replay.inserted,false);report.checks.push('same_package_replay_no_second_insert');
  for(const entity of GRH_VERSION_ENTITIES){
   const row=(await client.query("SELECT count(*)::int rows,count(DISTINCT source_id)::int unique_keys,bool_and(NOT operational) review_only FROM grh_core_source_version_rows_v1($1,$2,'candidate')",[report.import.versionId,entity])).rows[0];
   assert.equal(row.rows,prepared.entities[entity].counts.candidate);assert.equal(row.unique_keys,row.rows);assert.equal(row.review_only,true);report.candidate[entity]={...row,changes:prepared.entities[entity].counts};
  }
  report.cohort=(await client.query("SELECT count(*) FILTER (WHERE (record->>'administrative_active')::boolean)::int administrative_active,count(*) FILTER (WHERE (record->>'administrative_active')::boolean AND (record->>'liquidated_current')::boolean)::int active_and_liquidated,count(*) FILTER (WHERE (record->>'administrative_active')::boolean AND NOT (record->>'liquidated_current')::boolean)::int active_not_liquidated FROM grh_core_source_version_rows_v1($1,'employmentReconciliation','candidate')",[report.import.versionId])).rows[0];
  report.closures=(await client.query("SELECT max(record->>'payroll_date') FILTER (WHERE record->>'closure_status'='closed') closed,max(record->>'payroll_date') FILTER (WHERE record->>'closure_status'='open') open FROM grh_core_source_version_rows_v1($1,'payrollRuns','candidate')",[report.import.versionId])).rows[0];
  await client.query('SAVEPOINT runtime_read');let denied=false;
  try{await client.query('SET LOCAL ROLE municontrol_actions_runtime_app');await client.query("SELECT * FROM public.grh_core_source_version_rows_v1($1,'payrollMonthly','candidate') LIMIT 1",[report.import.versionId]);}
  catch(e){if(e.code!=='42501')throw e;denied=true;}
  finally{await client.query('ROLLBACK TO SAVEPOINT runtime_read');}
  assert.equal(denied,true);report.checks.push('candidate_is_not_runtime_source');report.ok=true;
 }catch(e){report.ok=false;report.code=/^[A-Z0-9_]+$/.test(e.code||'')?e.code:/^[A-Z0-9_]+$/.test(e.message||'')?e.message:'CURRENT_SOURCE_REHEARSAL_FAILED';}
 finally{if(tx){await client.query('ROLLBACK');report.rolledBack=true;}}
 if(before){await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL timezone='UTC'");try{
  const after=await fingerprints(client);report.differences=Object.keys({...before,...after}).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));
  report.dataPreserved=report.differences.length===0;report.schemaRemoved=!(await client.query("SELECT to_regclass('public.grh_core_source_version') IS NOT NULL present")).rows[0].present;
  if(!report.dataPreserved||!report.schemaRemoved)report.ok=false;
 }finally{await client.query('ROLLBACK');}}
 report.finishedAt=new Date().toISOString();return report;
}
