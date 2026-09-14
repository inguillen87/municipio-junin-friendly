// Additive migration to the existing operational branch. Default: ROLLBACK.
// Source data, private PDFs and credentials must never be printed or committed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Pool, neonConfig} from '@neondatabase/serverless';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const index = arg.indexOf('=');
  return [arg.slice(2, index), arg.slice(index + 1)];
}));
const branchId = 'br-plain-dust-acpjgebb';
assert.equal(args['confirm-operational-branch'], branchId, 'EXPLICIT_EXISTING_BRANCH_REQUIRED');
assert.ok(args['backup-report'], 'RESTORED_BACKUP_REPORT_REQUIRED');
assert.ok(Object.keys(args).every(key => ['confirm-operational-branch','backup-report','apply'].includes(key)), 'UNKNOWN_ARGUMENT');
assert.ok(args.apply === undefined || ['true','false'].includes(args.apply), 'INVALID_APPLY_MODE');
const backupPath = path.resolve(args['backup-report']);
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
assert.equal(backup.projectId, 'noisy-poetry-54471701');
assert.equal(backup.branchId, branchId);
assert.equal(backup.restorationVerified, true);
assert.match(backup.sha256, /^[a-f0-9]{64}$/);
const age = Date.now() - Date.parse(backup.completedAt);
assert.ok(Number.isFinite(age) && age >= 0 && age < 86400000, 'RECENT_BACKUP_REQUIRED');
const archive = path.resolve(path.dirname(backupPath), backup.file);
assert.equal(path.dirname(archive), path.dirname(backupPath), 'INVALID_BACKUP_PATH');
const archiveHash = createHash('sha256');
for await (const chunk of fs.createReadStream(archive)) archiveHash.update(chunk);
assert.equal(archiveHash.digest('hex'), backup.sha256, 'BACKUP_CONTENT_CHANGED');

let url;
try { url = new URL(process.env.DATABASE_URL); }
catch { throw Error('DATABASE_URL_INVALID'); }
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'INVALID_DATABASE_PROTOCOL');
assert.equal(decodeURIComponent(url.username), 'neondb_owner', 'OWNER_CONNECTION_REQUIRED');
assert.ok([...url.searchParams.keys()].every(key => ['sslmode','channel_binding'].includes(key)), 'UNEXPECTED_CONNECTION_ROUTING');
url.hostname = 'ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech';
url.port = '5432';
url.pathname = '/neondb';
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({connectionString:url.toString(), max:1, connectionTimeoutMillis:10000});
let client;
try { client = await pool.connect(); }
catch { await pool.end(); throw Error('OPERATIONAL_CONNECTION_FAILED'); }
const version = '057-family-schooling-certificates';
let committed = false;
const result = {branchId, backupSha256:backup.sha256, version, mode:args.apply === 'true' ? 'apply' : 'rollback'};
async function baseline() {
  return (await client.query(`SELECT
    (SELECT md5(string_agg(md5(row_to_json(f)::text),'' ORDER BY family_id)) FROM grh_family f) AS family_digest,
    (SELECT md5(string_agg(md5(row_to_json(c)::text),'' ORDER BY id)) FROM employment_contract c) AS contract_digest,
    (SELECT count(*)::integer FROM attendance_canonical_punch) AS canonical_punches,
    (SELECT md5(string_agg(id::text||status||coalesce(last_accepted_at::text,''),',' ORDER BY id)) FROM attendance_connector) AS connector_state,
    (SELECT count(*)::integer FROM tenant_identity_session) AS identity_sessions,
    (SELECT count(*)::integer FROM tenant_membership) AS memberships`)).rows[0];
}
try {
  const target = (await client.query("SELECT current_setting('neon.branch_id',true) AS branch, current_user AS role")).rows[0];
  if (target.branch) assert.equal(target.branch, branchId, 'LIVE_BRANCH_MISMATCH');
  assert.equal(target.role, 'neondb_owner');
  const before = await baseline();
  await client.query("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('municontrol:schooling-schema',0))");
  const sql = fs.readFileSync(new URL('./migrations/'+version+'.sql', import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const existing = (await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE version=$1', [version])).rows[0];
  if (existing) assert.equal(existing.checksum_sha256, checksum, 'INSTALLED_MIGRATION_DRIFT');
  else {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(version,checksum_sha256) VALUES($1,$2)', [version,checksum]);
  }
  const permissions = (await client.query(`SELECT
    has_function_privilege('municontrol_actions_runtime_app','school_certificate_read_v1(text,uuid,integer,text,uuid,uuid,uuid)','EXECUTE') AS reader,
    has_function_privilege('municontrol_actions_runtime_app','school_certificate_register_v1(text,uuid,integer,text,uuid,uuid,jsonb,text)','EXECUTE') AS writer,
    has_function_privilege('municontrol_actions_runtime_app','school_certificate_download_v1(text,uuid,integer,text,uuid,uuid,uuid)','EXECUTE') AS downloader,
    has_table_privilege('municontrol_actions_runtime_app','school_certificate','SELECT') AS metadata_read,
    has_table_privilege('municontrol_actions_runtime_app','school_certificate_blob','SELECT') AS blob_read,
    has_table_privilege('municontrol_actions_runtime_app','school_certificate_event','SELECT') AS audit_read,
    has_table_privilege('municontrol_actions_runtime_app','school_certificate_storage_policy','SELECT,INSERT,UPDATE,DELETE') AS policy_access,
    has_function_privilege('municontrol_actions_runtime_app','school_certificate_storage_capacity_v1()','EXECUTE') AS capacity_helper,
    has_function_privilege('municontrol_actions_runtime_app','school_certificate_storage_reserve_v1(uuid,text,integer)','EXECUTE') AS reserve_helper`)).rows[0];
  assert.deepEqual(permissions, {reader:true,writer:true,downloader:true,metadata_read:false,blob_read:false,audit_read:false,policy_access:false,capacity_helper:false,reserve_helper:false});
  const capacity = (await client.query('SELECT school_certificate_storage_capacity_v1() AS result')).rows[0].result;
  assert.equal(capacity.available, true, 'STORAGE_MEASUREMENT_UNAVAILABLE');
  assert.ok(capacity.capacityBytes >= 0 && capacity.capacityBytes <= 8388608, 'STORAGE_QUOTA_INVALID');
  assert.ok(capacity.clusterReserveBytes >= 16777216, 'STORAGE_RESERVE_INVALID');
  result.storage = {mode:capacity.mode,usedBytes:capacity.usedBytes,capacityBytes:capacity.capacityBytes,remainingBytes:capacity.remainingBytes};
  assert.deepEqual(await baseline(), before, 'EXISTING_DATA_CHANGED');
  if (args.apply === 'true') { await client.query('COMMIT'); committed = true; }
  else await client.query('ROLLBACK');
  assert.deepEqual(await baseline(), before, 'EXISTING_DATA_CHANGED_AFTER_TRANSACTION');
  Object.assign(result, {checksum,alreadyApplied:Boolean(existing),committed,runtimePermissionsVerified:true,existingDataUnchanged:true,completedAt:new Date().toISOString()});
  console.log(JSON.stringify(result,null,2));
} catch (error) {
  if (!committed) await client.query('ROLLBACK').catch(() => {});
  // No SQL error details: they may contain source rows or credentials.
  console.error(JSON.stringify({ok:false,committed,code:/^[A-Z_]{3,90}$/.test(error.message) ? error.message : 'SCHOOLING_SCHEMA_FAILED',sqlState:/^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : undefined}));
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
