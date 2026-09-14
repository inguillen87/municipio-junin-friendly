// Applies only additive, reviewed PM-10 migrations to the established operational branch.
// Credentials stay in the environment; private backup reports stay outside Git.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Pool,neonConfig} from '@neondatabase/serverless';
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
if(args['confirm-operational-branch']!=='br-plain-dust-acpjgebb'||!args['backup-report'])throw Error('EXPLICIT_OPERATIONAL_TARGET_AND_RESTORED_BACKUP_REQUIRED');
const backupPath=path.resolve(args['backup-report']),backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
assert.equal(backup.branchId,'br-plain-dust-acpjgebb');assert.equal(backup.projectId,'noisy-poetry-54471701');
assert.equal(backup.restorationVerified,true);assert.ok(/^[a-f0-9]{64}$/.test(backup.sha256));
assert.ok(Date.now()-Date.parse(backup.completedAt)<86400000,'BACKUP_OLDER_THAN_24_HOURS');
const archive=path.resolve(path.dirname(backupPath),backup.file);
assert.equal(path.dirname(archive),path.dirname(backupPath),'BACKUP_PATH_INVALID');
const digest=createHash('sha256');for await(const chunk of fs.createReadStream(archive))digest.update(chunk);
assert.equal(digest.digest('hex'),backup.sha256,'BACKUP_CONTENT_CHANGED');
const url=new URL(process.env.DATABASE_URL);url.hostname='ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech';
neonConfig.webSocketConstructor=WebSocket;
const pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:10000});
const client=await pool.connect();let committed=false;
const migrations=['055-pm10-continuous-reception','056-pm10-continuous-dashboard'];
const result={mode:args.apply==='true'?'apply':'rollback',branchId:backup.branchId,backupSha256:backup.sha256,migrations:[]};
async function baseline(){return(await client.query(`SELECT
 (SELECT count(*)::integer FROM attendance_canonical_punch) AS canonical,
 (SELECT count(*)::integer FROM attendance_clock_snapshot_row) AS historical,
 (SELECT count(*)::integer FROM attendance_identity_map) AS identities,
 (SELECT md5(string_agg(id::text||status||coalesce(last_accepted_at::text,''),',' ORDER BY id)) FROM attendance_connector) AS connector_state`)).rows[0];}
try{
 const target=(await client.query("SELECT current_setting('neon.branch_id',true) AS branch,current_user AS role")).rows[0];
 if(target.branch)assert.equal(target.branch,backup.branchId,'LIVE_BRANCH_MISMATCH');
 assert.equal(target.role,'neondb_owner','OWNER_MIGRATION_CONNECTION_REQUIRED');
 const before=await baseline();
 await client.query("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'");
 await client.query("SELECT pg_advisory_xact_lock(hashtextextended('municontrol:pm10-schema',0))");
 for(const version of migrations){
  const sql=fs.readFileSync(new URL('./migrations/'+version+'.sql',import.meta.url),'utf8');
  const checksum=createHash('sha256').update(sql).digest('hex');
  const old=(await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE version=$1',[version])).rows[0];
  if(old){assert.equal(old.checksum_sha256,checksum,'INSTALLED_MIGRATION_DRIFT');result.migrations.push({version,checksum,alreadyApplied:true});continue;}
  await client.query(sql);
  await client.query('INSERT INTO schema_migrations(version,checksum_sha256) VALUES($1,$2)',[version,checksum]);
  result.migrations.push({version,checksum,alreadyApplied:false});
 }
 const permissions=(await client.query(`SELECT
 has_function_privilege('municontrol_actions_runtime_app','attendance_pm10_receive_v1(text,text,jsonb,text)','EXECUTE') AS receiver,
 has_function_privilege('municontrol_actions_runtime_app','attendance_clock_dashboard_v3(text,uuid,integer,text,uuid,uuid,text,date,date,integer,integer,text,text,integer,uuid,text)','EXECUTE') AS dashboard,
 has_table_privilege('municontrol_actions_runtime_app','attendance_pm10_record','SELECT') AS raw_read,
 has_table_privilege('municontrol_actions_runtime_app','attendance_clock_identity_key','SELECT') AS key_read`)).rows[0];
 assert.deepEqual(permissions,{receiver:true,dashboard:true,raw_read:false,key_read:false});
 assert.deepEqual(await baseline(),before,'ADDITIVE_MIGRATION_CHANGED_SOURCE_OR_CONNECTOR');
 if(args.apply==='true'){await client.query('COMMIT');committed=true;}else await client.query('ROLLBACK');
 assert.deepEqual(await baseline(),before,'SOURCE_CHANGED_AFTER_MIGRATION');
 Object.assign(result,{completedAt:new Date().toISOString(),committed,baseline:before,runtimePermissionsVerified:true,connectorActivated:false});
 console.log(JSON.stringify(result,null,2));
}catch(error){if(!committed)await client.query('ROLLBACK').catch(()=>{});throw error;}
finally{client.release();await pool.end();}
