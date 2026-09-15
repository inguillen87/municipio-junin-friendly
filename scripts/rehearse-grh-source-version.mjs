import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GRH_VERSION_ENTITIES,importGrhSourceVersionWithinTransaction} from './lib/grh-core-source-version.mjs';

const reject=code=>{throw Object.assign(new Error(code),{code})};
async function existingData(client){
 const names=['payroll_run','payroll_monthly_fact','employment_movement','payroll_snapshot_assignment','employment_status_snapshot',
  'vw_nomina_totales','vw_liquidacion_mensual','vw_dotacion_cierre_mensual'];
 const result={};for(const name of names)result[name]=(await client.query(`SELECT count(*)::text AS rows,
  md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')) AS fingerprint FROM public.${name} r`)).rows[0];return result;
}

/** No connection creation and no production mode. All DDL/data is rolled back
 * in the same existing loopback restore used for the prior source rehearsals. */
export async function rehearseGrhSourceVersion({client,prepared,expectedPayloadSha256,baselineBatchId,baselineImportRunId,tenantId,sourceBindingId}){
 const report={version:'grh-core-version-rehearsal.v1',localOnly:true,productionWrites:false,operational:false,committed:false,rollbackConfirmed:false};
 let transaction=false,before;
 try{
  const target=(await client.query(`SELECT current_database() AS database,inet_server_addr()::text AS host,inet_server_port() AS port,
   current_user AS role,current_setting('neon.branch_id',true) AS branch`)).rows[0];
  if(target.database!=='restore_monthly_20260914'||!/^127\.0\.0\.1(?:\/32)?$/.test(target.host)||target.port!==5432||target.role!=='restore_owner'||target.branch)reject('GRH_VERSION_LOCAL_TARGET_REQUIRED');
  let idle=false;try{await client.query('SAVEPOINT grh_version_idle_check');await client.query('RELEASE SAVEPOINT grh_version_idle_check')}catch(error){if(error.code==='25P01')idle=true;else throw error}
  if(!idle)reject('GRH_VERSION_IDLE_CONNECTION_REQUIRED');
  if(!(await client.query("SELECT to_regclass('public.grh_core_source_version') IS NULL AS absent")).rows[0].absent)reject('GRH_VERSION_CLEAN_RESTORE_REQUIRED');
  before=await existingData(client);await client.query("BEGIN; SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='3s'");transaction=true;
  const ddl=readFileSync(new URL('./migrations/061-grh-core-source-version.sql',import.meta.url),'utf8');
  report.migrationSha256=createHash('sha256').update(ddl).digest('hex');await client.query(ddl);
  const options={client,prepared,expectedPayloadSha256,baselineBatchId,baselineImportRunId,tenantId,sourceBindingId};
  report.import=await importGrhSourceVersionWithinTransaction(options);
  await client.query('SET CONSTRAINTS grh_core_source_version_sealed_at_commit IMMEDIATE');
  await client.query('SET CONSTRAINTS grh_core_source_version_sealed_at_commit DEFERRED');
  report.replay=await importGrhSourceVersionWithinTransaction(options);assert.equal(report.replay.inserted,false);assert.equal(report.replay.versionId,report.import.versionId);
  const id=report.import.versionId;report.entities={};
  for(const entity of GRH_VERSION_ENTITIES){
   const rows=(await client.query(`SELECT count(*)::integer AS rows,count(DISTINCT source_id)::integer AS unique_keys,
    bool_and(NOT operational AND source_revision='candidate') AS review_only,
    min(source_cutoff)::text AS cutoff,min(source_payroll_date)::text AS source_payroll_date
    FROM grh_core_source_version_rows_v1($1,$2,'candidate')`,[id,entity])).rows[0];
   assert.equal(rows.rows,prepared.entities[entity].counts.candidate);assert.equal(rows.rows,rows.unique_keys);assert.equal(rows.review_only,true);report.entities[entity]=rows;
  }
  report.baselineRead=(await client.query(`SELECT count(*)::integer AS rows,min(source_cutoff)::text AS cutoff,
   bool_and(source_revision='baseline' AND NOT operational) AS exact_revision
   FROM grh_core_source_version_rows_v1($1,'payrollRuns','baseline')`,[id])).rows[0];
  assert.equal(report.baselineRead.rows,prepared.entities.payrollRuns.counts.baseline);assert.equal(report.baselineRead.exact_revision,true);
  report.historicalAbsences=(await client.query(`SELECT d.entity,count(*)::integer AS rows,
   bool_and(d.previous_source_payload IS NOT NULL AND d.previous_record IS NOT NULL) AS previous_evidence_preserved
   FROM grh_core_source_delta d WHERE d.version_id=$1 AND d.entity IN('payrollMonthly','movements') AND d.operation='remove' GROUP BY d.entity ORDER BY d.entity`,[id])).rows;
  assert.equal(report.historicalAbsences.reduce((sum,row)=>sum+row.rows,0),14);
  const negative=[];
  async function denied(name,sql,params,expected,setup){
   await client.query('SAVEPOINT grh_version_negative');try{if(setup)await setup();let error;
    try{await client.query(sql,params)}catch(e){error=e}
    if(!error||(error.message!==expected&&error.code!==expected))reject('GRH_VERSION_NEGATIVE_CHECK_FAILED');negative.push(name);
   }finally{await client.query('ROLLBACK TO SAVEPOINT grh_version_negative');await client.query('RESET ROLE')}
  }
  await denied('unknown_version',"SELECT * FROM grh_core_source_version_rows_v1('11111111-1111-4111-8111-111111111111','payrollRuns')",[],'GRH_VERSION_NOT_FOUND');
  await denied('unknown_entity','SELECT * FROM grh_core_source_version_rows_v1($1,$2)',[id,'unknown'],'GRH_VERSION_ENTITY_INVALID');
  await denied('implicit_latest_rejected',"SELECT * FROM grh_core_source_version_rows_v1($1,'payrollRuns','latest')",[id],'GRH_VERSION_REVISION_INVALID');
  await denied('immutable_delta','UPDATE grh_core_source_delta SET record=record WHERE version_id=$1',[id],'GRH_VERSION_IMMUTABLE');
  await denied('immutable_version','DELETE FROM grh_core_source_version WHERE id=$1',[id],'GRH_VERSION_IMMUTABLE');
  await denied('no_truncate','TRUNCATE grh_core_source_version,grh_core_source_delta,grh_core_source_version_seal',[],'GRH_VERSION_IMMUTABLE');
  await denied('sealed_no_late_inserts','INSERT INTO grh_core_source_delta SELECT * FROM grh_core_source_delta WHERE version_id=$1 LIMIT 1',[id],'GRH_VERSION_ALREADY_SEALED');
  await denied('unsealed_unavailable',"SELECT * FROM grh_core_source_version_rows_v1('22222222-2222-4222-8222-222222222222','payrollRuns')",[],'GRH_VERSION_NOT_SEALED',async()=>{
   await client.query(`INSERT INTO grh_core_source_version SELECT (jsonb_populate_record(NULL::grh_core_source_version,
    to_jsonb(v)||jsonb_build_object('id','22222222-2222-4222-8222-222222222222','source_sha256',repeat('e',64)))).*
    FROM grh_core_source_version v WHERE id=$1`,[id]);
  });
  await denied('unsealed_cannot_commit','SET CONSTRAINTS grh_core_source_version_sealed_at_commit IMMEDIATE',[],'GRH_VERSION_SEAL_REQUIRED',async()=>{
   await client.query(`INSERT INTO grh_core_source_version SELECT (jsonb_populate_record(NULL::grh_core_source_version,
    to_jsonb(v)||jsonb_build_object('id','33333333-3333-4333-8333-333333333333','source_sha256',repeat('f',64)))).*
    FROM grh_core_source_version v WHERE id=$1`,[id]);
  });
  await denied('base_drift_blocks_review',"SELECT grh_core_source_version_assert_v1($1,'payrollRuns')",[id],'GRH_VERSION_BASELINE_DRIFT',async()=>{
   await client.query(`UPDATE payroll_run SET source_date_ig=coalesce(source_date_ig,DATE '2026-01-01')+1
    WHERE id=(SELECT id FROM payroll_run WHERE source_batch_id=$1 ORDER BY id LIMIT 1)`,[baselineBatchId]);
  });
  const runtime=async()=>{await client.query('GRANT USAGE ON SCHEMA public TO municontrol_actions_runtime_app');await client.query('SET LOCAL ROLE municontrol_actions_runtime_app')};
  await denied('runtime_table_denied','SELECT * FROM grh_core_source_delta LIMIT 1',[],'42501',runtime);
  await denied('runtime_function_denied',"SELECT * FROM grh_core_source_version_rows_v1($1,'payrollRuns')",[id],'42501',runtime);
  report.negativeChecks=negative;
  assert.deepEqual(await existingData(client),before);report.currentDataAndViewsUnchanged=true;
  await client.query('ROLLBACK');transaction=false;
  assert.equal((await client.query("SELECT to_regclass('public.grh_core_source_version') IS NULL AS absent")).rows[0].absent,true);
  assert.deepEqual(await existingData(client),before);report.rollbackConfirmed=true;report.schemaRolledBack=true;report.status='verified-rolled-back';return report;
 }catch(error){if(transaction)await client.query('ROLLBACK').catch(()=>{});throw error;}
}
