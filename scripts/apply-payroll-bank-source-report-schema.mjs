// Additive migration on the existing branch. The CLI defaults to ROLLBACK.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Pool,neonConfig} from '@neondatabase/serverless';

export const BANK_SCHEMA_VERSION='060-payroll-bank-source-report';
export const BANK_OPERATIONAL_BRANCH='br-plain-dust-acpjgebb';
const facade='public.payroll_bank_source_report_v1(text,uuid,integer,text,uuid,uuid,uuid)';
const immutable='public.payroll_bank_source_immutable_v1()';
const sha=value=>createHash('sha256').update(value).digest('hex');
async function financialBaseline(client){
 return (await client.query(`SELECT
  (SELECT md5(string_agg(md5(row_to_json(f)::text),'' ORDER BY family_id)) FROM grh_family f) AS family_digest,
  (SELECT md5(string_agg(md5(row_to_json(c)::text),'' ORDER BY id)) FROM employment_contract c) AS contract_digest,
  (SELECT md5(string_agg(md5(row_to_json(d)::text),'' ORDER BY id)) FROM payroll_detail_dataset d) AS payroll_dataset_digest,
  (SELECT md5(string_agg(md5(row_to_json(s)::text),'' ORDER BY id)) FROM payroll_detail_statement s) AS payroll_statement_digest,
  (SELECT md5(string_agg(md5(row_to_json(r)::text),'' ORDER BY row_to_json(r)::text)) FROM payroll_run r) AS payroll_run_digest,
  (SELECT md5(string_agg(md5(row_to_json(m)::text),'' ORDER BY row_to_json(m)::text)) FROM payroll_monthly_fact m) AS payroll_fact_digest`)).rows[0];
}
async function functionFingerprint(client){
 const row=(await client.query(`SELECT pg_get_functiondef($1::regprocedure) AS reader,pg_get_functiondef($2::regprocedure) AS immutable`,[facade,immutable])).rows[0];
 return sha(JSON.stringify(row));
}
async function verifyInstalled(client){
 const permissions=(await client.query(`SELECT
  has_schema_privilege('municontrol_actions_runtime_app','public','USAGE') AS schema_usage,
  has_function_privilege('municontrol_actions_runtime_app',$1,'EXECUTE') AS reader,
  has_table_privilege('municontrol_actions_runtime_app','payroll_bank_source','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS bank_access,
  has_table_privilege('municontrol_actions_runtime_app','payroll_bank_report_read_event','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS audit_access,
  has_table_privilege('municontrol_actions_runtime_app','payroll_detail_dataset','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS source_access,
  has_table_privilege('municontrol_actions_runtime_app','payroll_detail_statement','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS statement_access`,[facade])).rows[0];
 assert.deepEqual(permissions,{schema_usage:true,reader:true,bank_access:false,audit_access:false,source_access:false,statement_access:false},'BANK_RUNTIME_PERMISSIONS_INVALID');
 const triggers=(await client.query(`SELECT tgname,tgtype::integer AS type,tgenabled,
  tgfoid='payroll_bank_source_immutable_v1()'::regprocedure AS correct_function
  FROM pg_trigger WHERE tgrelid IN('payroll_bank_source'::regclass,'payroll_bank_report_read_event'::regclass)
  AND NOT tgisinternal ORDER BY tgname`)).rows;
 assert.deepEqual(triggers,[
  {tgname:'payroll_bank_report_read_event_immutable',type:27,tgenabled:'O',correct_function:true},
  {tgname:'payroll_bank_report_read_event_no_truncate',type:34,tgenabled:'O',correct_function:true},
  {tgname:'payroll_bank_source_immutable',type:27,tgenabled:'O',correct_function:true},
  {tgname:'payroll_bank_source_no_truncate',type:34,tgenabled:'O',correct_function:true},
 ],'BANK_IMMUTABILITY_TRIGGERS_INVALID');
 const security=(await client.query(`SELECT prosecdef,proconfig,NOT EXISTS(
  SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_denied
  FROM pg_proc WHERE oid=$1::regprocedure`,[facade])).rows[0];
 assert.deepEqual(security,{prosecdef:true,proconfig:['search_path=public, pg_temp'],public_denied:true},'BANK_FACADE_SECURITY_INVALID');
 return functionFingerprint(client);
}

// Local rehearsal is bounded to the already restored database and is never a CLI flag.
export async function applyBankReportSchema(client,{apply=false,localRestore=false}={}){
 const target=(await client.query(`SELECT current_database() AS database,current_user AS role,
  current_setting('neon.branch_id',true) AS branch,inet_server_addr()::text AS host,inet_server_port() AS port`)).rows[0];
 if(localRestore){
  assert.equal(target.database,'restore_monthly_20260914','LOCAL_RESTORE_DATABASE_MISMATCH');
  assert.ok(/^127\.0\.0\.1(?:\/32)?$/.test(target.host)&&target.port===5432,'LOCAL_RESTORE_HOST_MISMATCH');
  assert.equal(target.role,'restore_owner','LOCAL_RESTORE_OWNER_REQUIRED');
 }else{
  assert.equal(target.database,'neondb','LIVE_DATABASE_MISMATCH');
  assert.equal(target.branch,BANK_OPERATIONAL_BRANCH,'LIVE_BRANCH_MISMATCH');
  assert.equal(target.role,'neondb_owner','OWNER_CONNECTION_REQUIRED');
 }
 const before=await financialBaseline(client),sql=fs.readFileSync(new URL('./migrations/'+BANK_SCHEMA_VERSION+'.sql',import.meta.url),'utf8'),checksum=sha(sql);
 let commitAttempted=false,committed=false;
 try{
  await client.query("BEGIN; SET LOCAL search_path=public,pg_temp; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('municontrol:bank-source-schema',0))");
  const preflight=(await client.query(`SELECT
   to_regprocedure('public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)') IS NOT NULL AS session_facade,
   has_schema_privilege('municontrol_actions_runtime_app','public','USAGE') AS runtime_schema,
   EXISTS(SELECT 1 FROM tenant_identity_policy p JOIN platform_tenant_source_binding b
    ON b.tenant_id=p.tenant_id AND b.id=p.certified_source_binding_id JOIN platform_tenant t ON t.id=p.tenant_id
    WHERE p.tenant_data_plane_ready AND b.verified AND b.source_system='GRH' AND t.status='active') AS certified_binding,
   to_regclass('public.payroll_bank_source') IS NOT NULL AS existing_bank_table`)).rows[0];
  assert.ok(preflight.session_facade&&preflight.runtime_schema&&preflight.certified_binding,'BANK_SCHEMA_PREFLIGHT_FAILED');
  const existing=(await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE version=$1',[BANK_SCHEMA_VERSION])).rows[0];
  if(existing){
   assert.equal(existing.checksum_sha256,checksum,'INSTALLED_MIGRATION_DRIFT');
   const installedFingerprint=await verifyInstalled(client);
   await client.query('SAVEPOINT bank_expected_definition');
   await client.query(sql);
   const expectedFingerprint=await verifyInstalled(client);
   await client.query('ROLLBACK TO SAVEPOINT bank_expected_definition');
   assert.equal(installedFingerprint,expectedFingerprint,'BANK_FUNCTION_DRIFT');
  }else{
   assert.ok(!preflight.existing_bank_table||localRestore,'UNLEDGERED_BANK_SCHEMA');
   await client.query(sql);
   await client.query('INSERT INTO schema_migrations(version,checksum_sha256) VALUES($1,$2)',[BANK_SCHEMA_VERSION,checksum]);
  }
  const fingerprint=await verifyInstalled(client);
  assert.deepEqual(await financialBaseline(client),before,'EXISTING_FINANCIAL_DATA_CHANGED');
  if(apply){commitAttempted=true;await client.query('COMMIT');committed=true}else await client.query('ROLLBACK');
  assert.deepEqual(await financialBaseline(client),before,'EXISTING_FINANCIAL_DATA_CHANGED_AFTER_TRANSACTION');
  return {version:BANK_SCHEMA_VERSION,branchId:localRestore?null:BANK_OPERATIONAL_BRANCH,localOnly:localRestore,mode:apply?'apply':'rollback',
   checksum,functionFingerprint:fingerprint,alreadyApplied:Boolean(existing),committed,runtimePermissionsVerified:true,
   immutabilityVerified:true,existingFinancialDataUnchanged:true,completedAt:new Date().toISOString()};
 }catch(error){
  if(!commitAttempted)await client.query('ROLLBACK').catch(()=>{});
  error.bankCommitState=committed?'committed':commitAttempted?'unknown':'not_committed';throw error;
 }
}
async function main(){
 const args={};for(const arg of process.argv.slice(2)){const match=/^--([a-z-]+)=(.+)$/.exec(arg);assert.ok(match&&!Object.hasOwn(args,match[1]),'INVALID_ARGUMENT');args[match[1]]=match[2]}
 assert.ok(Object.keys(args).every(k=>['confirm-operational-branch','backup-report','apply'].includes(k)),'UNKNOWN_ARGUMENT');
 assert.equal(args['confirm-operational-branch'],BANK_OPERATIONAL_BRANCH,'EXPLICIT_EXISTING_BRANCH_REQUIRED');
 assert.ok(args.apply===undefined||['true','false'].includes(args.apply),'INVALID_APPLY_MODE');
 assert.ok(args['backup-report'],'RESTORED_BACKUP_REPORT_REQUIRED');
 const backupPath=path.resolve(args['backup-report']),backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
 assert.equal(backup.projectId,'noisy-poetry-54471701','BACKUP_PROJECT_MISMATCH');assert.equal(backup.branchId,BANK_OPERATIONAL_BRANCH,'BACKUP_BRANCH_MISMATCH');
 assert.equal(backup.restorationVerified,true,'RESTORED_BACKUP_REQUIRED');assert.match(backup.sha256,/^[a-f0-9]{64}$/,'BACKUP_HASH_REQUIRED');
 const age=Date.now()-Date.parse(backup.completedAt);assert.ok(Number.isFinite(age)&&age>=0&&age<86400000,'RECENT_BACKUP_REQUIRED');
 const archive=path.resolve(path.dirname(backupPath),backup.file);assert.equal(path.dirname(archive),path.dirname(backupPath),'INVALID_BACKUP_PATH');
 const hash=createHash('sha256');for await(const chunk of fs.createReadStream(archive))hash.update(chunk);assert.equal(hash.digest('hex'),backup.sha256,'BACKUP_CONTENT_CHANGED');
 let target;try{target=new URL(process.env.DATABASE_URL)}catch{throw Error('DATABASE_URL_INVALID')}
 assert.ok(['postgres:','postgresql:'].includes(target.protocol),'DATABASE_PROTOCOL_INVALID');
 assert.equal(decodeURIComponent(target.username),'neondb_owner','OWNER_CONNECTION_REQUIRED');
 assert.ok(['ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech','ep-shiny-cherry-actlyudg-pooler.sa-east-1.aws.neon.tech'].includes(target.hostname),'OPERATIONAL_HOST_MISMATCH');
 assert.ok(target.port===''||target.port==='5432','DATABASE_PORT_INVALID');assert.equal(target.pathname,'/neondb','DATABASE_NAME_INVALID');
 assert.ok([...target.searchParams.keys()].every(k=>['sslmode','channel_binding'].includes(k)),'UNEXPECTED_CONNECTION_ROUTING');
 neonConfig.webSocketConstructor=WebSocket;const pool=new Pool({connectionString:target.toString(),max:1,connectionTimeoutMillis:10000});let client;
 try{client=await pool.connect();console.log(JSON.stringify({...await applyBankReportSchema(client,{apply:args.apply==='true'}),backupSha256:backup.sha256},null,2))}
 finally{client?.release();await pool.end()}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main().catch(error=>{
 const state=error.bankCommitState??'not_committed';console.error(JSON.stringify({ok:false,commitState:state,requiresLedgerReconciliation:state==='unknown',
  code:/^[A-Z_]{3,90}$/.test(error.message)?error.message:'BANK_SCHEMA_FAILED',sqlState:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:undefined}));process.exitCode=1;
});
