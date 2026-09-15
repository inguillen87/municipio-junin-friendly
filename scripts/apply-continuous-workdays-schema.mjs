// Prepared deployment tool only. Explicit existing branch + restored backup +
// reviewed file checksum are required even for the default ROLLBACK rehearsal.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const WORKDAY_SCHEMA_TARGET=Object.freeze({branchId:'br-plain-dust-acpjgebb',projectId:'noisy-poetry-54471701',
 host:'ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech',database:'neondb',version:'065-clock-workday-source-continuous'});
const signature='attendance_clock_workday_source_v2(text,uuid,integer,text,uuid,uuid,text,date,date,uuid)';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ensure=(value,code)=>{if(!value)throw Error(code)};
export function parseWorkdaySchemaArguments(argv) {
 const args={};
 for(const item of argv){
  const match=/^--([a-z][a-z-]+)=(.+)$/.exec(item);ensure(match,'INVALID_ARGUMENT');
  const [,key,value]=match;ensure(['confirm-operational-branch','backup-report','expected-checksum','apply'].includes(key),'UNKNOWN_ARGUMENT');
  ensure(!Object.hasOwn(args,key),'DUPLICATE_ARGUMENT');args[key]=value;
 }
 ensure(args['confirm-operational-branch']===WORKDAY_SCHEMA_TARGET.branchId,'EXPLICIT_OPERATIONAL_TARGET_REQUIRED');
 ensure(args['backup-report'],'RESTORED_BACKUP_REQUIRED');ensure(/^[a-f0-9]{64}$/.test(args['expected-checksum'] || ''),'REVIEWED_CHECKSUM_REQUIRED');
 ensure(args.apply===undefined || ['true','false'].includes(args.apply),'INVALID_APPLY_MODE');
 return args;
}
export function verifyWorkdaySchemaConnection(value) {
 let url;try{url=new URL(value)}catch{throw Error('DATABASE_URL_INVALID')}
 ensure(['postgres:','postgresql:'].includes(url.protocol),'DATABASE_PROTOCOL_INVALID');
 ensure(url.hostname===WORKDAY_SCHEMA_TARGET.host,'OPERATIONAL_ENDPOINT_MISMATCH');
 ensure(url.port==='' || url.port==='5432','DATABASE_PORT_INVALID');
 ensure(url.pathname==='/'+WORKDAY_SCHEMA_TARGET.database,'DATABASE_NAME_INVALID');
 ensure(decodeURIComponent(url.username)==='neondb_owner' && url.password,'OWNER_CONNECTION_REQUIRED');
 const keys=[...url.searchParams.keys()];
 ensure(keys.length===new Set(keys).size && keys.every(k=>['sslmode','channel_binding'].includes(k)) && !url.hash,'UNEXPECTED_CONNECTION_ROUTING');
 ensure(['require','verify-full'].includes(url.searchParams.get('sslmode')),'DATABASE_TLS_REQUIRED');
 ensure(!url.searchParams.has('channel_binding') || url.searchParams.get('channel_binding')==='require','CHANNEL_BINDING_INVALID');
 return url;
}
export function verifyWorkdayFunctionDefinition(metadata,sql) {
 const body=/AS \$\$([\s\S]+?)\$\$;/.exec(sql)?.[1];
 ensure(body && metadata?.body===body && metadata.owner==='neondb_owner' && metadata.language==='plpgsql','INSTALLED_FUNCTION_DRIFT');
 ensure(Array.isArray(metadata.config) && metadata.config.length===1 &&
  /^search_path=public,\s*pg_temp$/.test(metadata.config[0]),'FUNCTION_SEARCH_PATH_DRIFT');
}
export async function prepareWorkdaySchema(argv,env=process.env,now=Date.now()) {
 const args=parseWorkdaySchemaArguments(argv),url=verifyWorkdaySchemaConnection(env.DATABASE_URL);
 const migrationPath=fileURLToPath(new URL('./migrations/'+WORKDAY_SCHEMA_TARGET.version+'.sql',import.meta.url));
 const bytes=fs.readFileSync(migrationPath),checksum=hash(bytes);
 ensure(checksum===args['expected-checksum'],'REVIEWED_MIGRATION_CHANGED');
 const backupPath=fs.realpathSync(path.resolve(args['backup-report'])),repository=fs.realpathSync(fileURLToPath(new URL('..',import.meta.url)));
 const relative=path.relative(repository,backupPath);
 ensure(relative.startsWith('..'+path.sep) || path.isAbsolute(relative),'BACKUP_MUST_BE_OUTSIDE_WORKTREE');
 const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
 ensure(backup.branchId===WORKDAY_SCHEMA_TARGET.branchId && backup.projectId===WORKDAY_SCHEMA_TARGET.projectId,'BACKUP_TARGET_MISMATCH');
 ensure(backup.restorationVerified===true && /^[a-f0-9]{64}$/.test(backup.sha256 || ''),'VERIFIED_RESTORATION_REQUIRED');
 const age=now-Date.parse(backup.completedAt);ensure(Number.isFinite(age) && age>=0 && age<86400000,'RECENT_BACKUP_REQUIRED');
 ensure(typeof backup.file==='string' && backup.file===path.basename(backup.file),'BACKUP_PATH_INVALID');
 const archive=fs.realpathSync(path.resolve(path.dirname(backupPath),backup.file));
 ensure(path.dirname(archive)===path.dirname(backupPath) && fs.statSync(archive).isFile(),'BACKUP_PATH_INVALID');
 const archiveHash=createHash('sha256');for await(const chunk of fs.createReadStream(archive))archiveHash.update(chunk);
 ensure(archiveHash.digest('hex')===backup.sha256,'BACKUP_CONTENT_CHANGED');
 return {url,sql:bytes.toString('utf8'),checksum,backupSha256:backup.sha256,apply:args.apply==='true'};
}
export async function applyContinuousWorkdaySchema(argv,env=process.env) {
 let pool,client,committed=false;
 try {
  const prepared=await prepareWorkdaySchema(argv,env);
  const {Pool,neonConfig}=await import('@neondatabase/serverless');neonConfig.webSocketConstructor=WebSocket;
  pool=new Pool({connectionString:prepared.url.toString(),max:1,connectionTimeoutMillis:10000});client=await pool.connect();
  const target=(await client.query("SELECT current_setting('neon.branch_id',true) AS branch,current_user AS role,current_database() AS database")).rows[0];
  // The fixed, verified endpoint is required; attest branch_id too when Neon exposes it.
  ensure(!target.branch || target.branch===WORKDAY_SCHEMA_TARGET.branchId,'LIVE_BRANCH_MISMATCH');
  ensure(target.role==='neondb_owner' && target.database===WORKDAY_SCHEMA_TARGET.database,'LIVE_DATABASE_CONTEXT_MISMATCH');
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('municontrol:pm10-schema',0))");
  for(const version of ['055-pm10-continuous-reception','056-pm10-continuous-dashboard']){
   const row=(await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE version=$1',[version])).rows[0];
   ensure(row,'DEPENDENCY_MIGRATION_REQUIRED');
   ensure(row.checksum_sha256===hash(fs.readFileSync(new URL('./migrations/'+version+'.sql',import.meta.url))),'DEPENDENCY_MIGRATION_DRIFT');
  }
  async function baseline(){return (await client.query(`SELECT
   (SELECT md5(string_agg(md5(to_jsonb(r)::text),'' ORDER BY snapshot_id,ordinal)) FROM attendance_clock_snapshot_row r) AS historical_rows,
   (SELECT md5(string_agg(md5(to_jsonb(r)::text),'' ORDER BY device_id,raw_sha256)) FROM attendance_pm10_record r) AS continuous_rows,
   (SELECT md5(string_agg(md5(to_jsonb(r)::text),'' ORDER BY id)) FROM attendance_pm10_receipt r) AS receipts,
   (SELECT md5(string_agg(md5(to_jsonb(r)::text),'' ORDER BY id)) FROM attendance_canonical_punch r) AS canonical,
   (SELECT md5(string_agg(md5(to_jsonb(r)::text),'' ORDER BY id)) FROM attendance_identity_map r) AS identities,
   (SELECT md5(string_agg(md5(to_jsonb(r)::text),'' ORDER BY id)) FROM attendance_connector r) AS connectors,
   md5(pg_get_functiondef('attendance_clock_workday_source_v1(text,uuid,integer,text,uuid,uuid,text,date,date,uuid)'::regprocedure)) AS legacy_workdays,
   md5(pg_get_functiondef('attendance_clock_dashboard_v3(text,uuid,integer,text,uuid,uuid,text,date,date,integer,integer,text,text,integer,uuid,text)'::regprocedure)) AS dashboard`)).rows[0]}
  const before=await baseline(),existing=(await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE version=$1',[WORKDAY_SCHEMA_TARGET.version])).rows[0];
  if(existing)ensure(existing.checksum_sha256===prepared.checksum,'INSTALLED_MIGRATION_DRIFT');
  else {
   await client.query(prepared.sql);
   await client.query('INSERT INTO schema_migrations(version,checksum_sha256) VALUES($1,$2)',[WORKDAY_SCHEMA_TARGET.version,prepared.checksum]);
  }
  const definition=(await client.query(`SELECT p.prosrc AS body,p.proconfig AS config,
   pg_get_userbyid(p.proowner) AS owner,l.lanname AS language
   FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=$1::regprocedure`,[signature])).rows[0];
  verifyWorkdayFunctionDefinition(definition,prepared.sql);
  const permissions=(await client.query(`SELECT
   has_function_privilege('municontrol_actions_runtime_app',$1,'EXECUTE') AS reader,
   (SELECT prosecdef FROM pg_proc WHERE oid=$1::regprocedure) AS security_definer,
   EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    WHERE p.oid=$1::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_execute,
   has_table_privilege('municontrol_actions_runtime_app','attendance_clock_snapshot','SELECT') AS capture_read,
   has_table_privilege('municontrol_actions_runtime_app','attendance_clock_snapshot_row','SELECT') AS history_read,
   has_table_privilege('municontrol_actions_runtime_app','attendance_pm10_receipt','SELECT') AS receipt_read,
   has_table_privilege('municontrol_actions_runtime_app','attendance_pm10_record','SELECT') AS record_read,
   has_table_privilege('municontrol_actions_runtime_app','attendance_clock_identity_key','SELECT') AS key_read`,[signature])).rows[0];
  ensure(permissions.reader && permissions.security_definer &&
   ['public_execute','capture_read','history_read','receipt_read','record_read','key_read'].every(k=>permissions[k]===false),'RUNTIME_PERMISSIONS_INVALID');
  ensure(JSON.stringify(await baseline())===JSON.stringify(before),'EXISTING_DATA_OR_READERS_CHANGED');
  if(prepared.apply){await client.query('COMMIT');committed=true}else await client.query('ROLLBACK');
  // The receiver can continue committing after this transaction. Do not compare
  // a later live baseline with the transaction snapshot and call it corruption.
  const result={ok:true,version:WORKDAY_SCHEMA_TARGET.version,branchId:WORKDAY_SCHEMA_TARGET.branchId,
   checksum:prepared.checksum,backupSha256:prepared.backupSha256,alreadyApplied:Boolean(existing),committed,
   mode:prepared.apply?'apply':'rollback',runtimePermissionsVerified:true,existingDataUnchangedWithinTransaction:true,
   legacyReadersUnchanged:true,connectorActivated:false,payrollModified:false,completedAt:new Date().toISOString()};
  console.log(JSON.stringify(result,null,2));return result;
 }catch(error){
  if(client && !committed)await client.query('ROLLBACK').catch(()=>{});
  const result={ok:false,committed,code:/^[A-Z_]{3,90}$/.test(error?.message || '')?error.message:'CONTINUOUS_WORKDAY_SCHEMA_FAILED'};
  if(/^[A-Z0-9]{5}$/.test(error?.code || ''))result.sqlState=error.code;
  console.error(JSON.stringify(result));process.exitCode=1;return result;
 }finally{client?.release();if(pool)await pool.end()}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await applyContinuousWorkdaySchema(process.argv.slice(2));
