// Existing operational branch only. Default execution validates with ROLLBACK.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Pool, neonConfig } from '@neondatabase/serverless';

const branchId = 'br-plain-dust-acpjgebb', version = '059-action-source-history';
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const index = arg.indexOf('='); assert.ok(arg.startsWith('--') && index > 2, 'INVALID_ARGUMENT');
  return [arg.slice(2, index), arg.slice(index + 1)];
}));
assert.equal(args['confirm-operational-branch'], branchId, 'EXPLICIT_EXISTING_BRANCH_REQUIRED');
assert.ok(args['backup-report'], 'RESTORED_BACKUP_REPORT_REQUIRED');
assert.ok(Object.keys(args).every(key => ['confirm-operational-branch','backup-report','apply'].includes(key)), 'UNKNOWN_ARGUMENT');
assert.ok(args.apply === undefined || ['true','false'].includes(args.apply), 'INVALID_APPLY_MODE');
const backupPath = path.resolve(args['backup-report']), backup = JSON.parse(fs.readFileSync(backupPath,'utf8'));
assert.equal(backup.projectId,'noisy-poetry-54471701'); assert.equal(backup.branchId,branchId);
assert.equal(backup.restorationVerified,true); assert.match(backup.sha256,/^[a-f0-9]{64}$/);
const age = Date.now() - Date.parse(backup.completedAt);
assert.ok(Number.isFinite(age) && age >= 0 && age < 86400000,'RECENT_BACKUP_REQUIRED');
const archive = path.resolve(path.dirname(backupPath),backup.file);
assert.equal(path.dirname(archive),path.dirname(backupPath),'INVALID_BACKUP_PATH');
const archiveHash = createHash('sha256'); for await (const chunk of fs.createReadStream(archive)) archiveHash.update(chunk);
assert.equal(archiveHash.digest('hex'),backup.sha256,'BACKUP_CONTENT_CHANGED');

const previousBodies = {
  action_center_tenant_list_v2:'781cc7fe82082d5b5f6f1b1380546006',
  action_center_tenant_detail_v2:'41fcb2d8686bfe7f3859832a2d172e39',
  action_center_overtime_list_v1:'a5b476906fda19f3d599d4e4613d065f',
  action_center_overtime_detail_v1:'ed0ca4958b17a2d645bfdb388d5041c8',
  action_center_apply_tenant_command:'8a32cc6e1feef9eef609edb6a71e5d96',
  action_center_apply_overtime_command_v1:'937186277a15173e3fbbeee978557d2c',
};
const helpers = ['action_center_case_source_context_v1','action_center_assert_case_source_current_v1'];
const migration = fs.readFileSync(new URL('./migrations/'+version+'.sql',import.meta.url),'utf8');
const checksum = createHash('sha256').update(migration).digest('hex');
const newBodies = Object.fromEntries([...migration.matchAll(/CREATE OR REPLACE FUNCTION\s+(?:public\.)?(\w+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)]
  .map(match => [match[1],createHash('md5').update(match[2]).digest('hex')]));
assert.deepEqual(Object.keys(newBodies).sort(),[...Object.keys(previousBodies),...helpers].sort(),'MIGRATION_FUNCTION_SET_CHANGED');
let url; try { url = new URL(process.env.DATABASE_URL); } catch { throw Error('DATABASE_URL_INVALID'); }
assert.ok(['postgres:','postgresql:'].includes(url.protocol),'INVALID_DATABASE_PROTOCOL');
assert.equal(decodeURIComponent(url.username),'neondb_owner','OWNER_CONNECTION_REQUIRED');
assert.ok([...url.searchParams.keys()].every(key => ['sslmode','channel_binding'].includes(key)),'UNEXPECTED_CONNECTION_ROUTING');
url.hostname='ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech'; url.port='5432'; url.pathname='/neondb';
neonConfig.webSocketConstructor=WebSocket;
const pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:10000});
let client; try { client=await pool.connect(); } catch { await pool.end(); throw Error('OPERATIONAL_CONNECTION_FAILED'); }
let committed=false,commitAttempted=false;
const result={branchId,version,checksum,backupSha256:backup.sha256,mode:args.apply==='true'?'apply':'rollback'};
const tables = ['action_case','action_case_event','employment_contract','person_identity','source_import_batch','source_staging_row',
  'grh_family','school_certificate','school_certificate_blob','school_certificate_event','attendance_canonical_punch','attendance_pm10_receipt',
  'tenant_membership','tenant_identity_session','payroll_detail_dataset','payroll_detail_statement','payroll_run','payroll_monthly_fact'];
async function baseline() {
  const query='SELECT '+tables.map(table=>`(SELECT jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))) FROM public.${table} t) AS ${table}`).join(',');
  return (await client.query(query)).rows[0];
}
async function functions() {
  return (await client.query(`SELECT proname AS name,md5(prosrc) AS body,prosecdef AS definer,
    has_function_privilege('municontrol_actions_runtime_app',oid,'EXECUTE') AS runtime_execute,
    EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
    pg_get_userbyid(proowner) AS owner,proconfig AS config
    FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY($1::text[]) ORDER BY proname`,[Object.keys(newBodies)])).rows;
}
try {
  await client.query("SET statement_timeout='45s'");
  const target=(await client.query("SELECT current_setting('neon.branch_id',true) AS branch,current_user AS role")).rows[0];
  assert.equal(target.branch,branchId,'LIVE_BRANCH_MISMATCH');assert.equal(target.role,'neondb_owner');
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('municontrol:action-source-history-schema',0))");
  const before=await baseline(),beforeFunctions=await functions();
  const existing=(await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE version=$1',[version])).rows[0];
  if(existing)assert.equal(existing.checksum_sha256,checksum,'INSTALLED_MIGRATION_DRIFT');
  else {
    assert.deepEqual(Object.fromEntries(beforeFunctions.map(f=>[f.name,f.body])),previousBodies,'EXISTING_FUNCTION_DRIFT');
    await client.query(migration);
    await client.query('INSERT INTO schema_migrations(version,checksum_sha256) VALUES($1,$2)',[version,checksum]);
  }
  const installed=await functions();
  assert.deepEqual(Object.fromEntries(installed.map(f=>[f.name,f.body])),newBodies,'INSTALLED_FUNCTION_CONTENT_MISMATCH');
  for(const f of installed){
    assert.equal(f.definer,true,'FUNCTION_AUTHORITY_CHANGED');assert.equal(f.owner,'neondb_owner','FUNCTION_OWNER_CHANGED');
    assert.ok(f.config?.includes('search_path=public, pg_temp'),'FUNCTION_SEARCH_PATH_CHANGED');
    assert.equal(f.public_execute,false,'PUBLIC_EXECUTE_FORBIDDEN');
    assert.equal(f.runtime_execute,!helpers.includes(f.name),'FUNCTION_RUNTIME_BOUNDARY_CHANGED');
  }
  const forbidden=(await client.query(`SELECT count(*)::integer AS count FROM unnest($1::text[]) name
    WHERE has_table_privilege('municontrol_actions_runtime_app',name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`,
    [['action_case','action_case_event','source_import_batch','source_staging_row','employment_contract','person_identity']])).rows[0].count;
  assert.equal(forbidden,0,'DIRECT_SOURCE_ACCESS_FORBIDDEN');
  assert.deepEqual(await baseline(),before,'EXISTING_DATA_CHANGED');
  if(args.apply==='true'){
    commitAttempted=true;await client.query('COMMIT');committed=true;
    assert.deepEqual(await functions(),installed,'COMMITTED_FUNCTIONS_CHANGED');
    assert.equal((await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE version=$1',[version])).rows[0]?.checksum_sha256,checksum,'COMMITTED_LEDGER_CHANGED');
  }
  else {await client.query('ROLLBACK');assert.deepEqual(await functions(),beforeFunctions,'ROLLBACK_FUNCTIONS_NOT_RESTORED');}
  Object.assign(result,{committed,alreadyApplied:Boolean(existing),runtimePermissionsVerified:true,functionBodiesVerified:true,
    existingDataUnchanged:true,dataVerification:'same_repeatable_read_snapshot',completedAt:new Date().toISOString()});
  console.log(JSON.stringify(result,null,2));
}catch(error){
  if(!commitAttempted)await client.query('ROLLBACK').catch(()=>{});
  const commitState=committed?'committed':commitAttempted?'unknown':'not_committed';
  console.error(JSON.stringify({ok:false,committed:commitAttempted&&!committed?null:committed,commitState,
    requiresLedgerReconciliation:commitState==='unknown',code:/^[A-Z_]{3,90}$/.test(error.message)?error.message:'ACTION_SOURCE_HISTORY_SCHEMA_FAILED',
    sqlState:/^[A-Z0-9]{5}$/.test(error.code||'')?error.code:undefined}));process.exitCode=1;
}finally{client.release();await pool.end();}
