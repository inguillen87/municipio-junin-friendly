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
const version = '058-payroll-monthly-source-summary';
let committed = false;
let commitAttempted = false;
const result = {branchId, backupSha256:backup.sha256, version, mode:args.apply === 'true' ? 'apply' : 'rollback'};
async function baseline() {
  return (await client.query(`SELECT
    (SELECT md5(string_agg(md5(row_to_json(f)::text),'' ORDER BY family_id)) FROM grh_family f) AS family_digest,
    (SELECT md5(string_agg(md5(row_to_json(c)::text),'' ORDER BY id)) FROM employment_contract c) AS contract_digest,
    (SELECT count(*)::integer FROM attendance_canonical_punch) AS canonical_punches,
    (SELECT md5(string_agg(id::text||status||coalesce(last_accepted_at::text,''),',' ORDER BY id)) FROM attendance_connector) AS connector_state,
    (SELECT count(*)::integer FROM tenant_identity_session) AS identity_sessions,
    (SELECT count(*)::integer FROM tenant_membership) AS memberships,
    (SELECT md5(string_agg(md5(row_to_json(d)::text),'' ORDER BY id)) FROM payroll_detail_dataset d) AS payroll_dataset_digest,
    (SELECT md5(string_agg(md5(row_to_json(s)::text),'' ORDER BY id)) FROM payroll_detail_statement s) AS payroll_statement_digest,
    (SELECT count(*)::integer FROM school_certificate) AS certificates,
    (SELECT count(*)::integer FROM school_certificate_blob) AS certificate_blobs,
    (SELECT count(*)::integer FROM school_certificate_event) AS certificate_events,
    (SELECT count(*)::integer FROM payroll_run) AS payroll_runs,
    (SELECT count(*)::integer FROM payroll_monthly_fact) AS payroll_facts`)).rows[0];
}
try {
  const target = (await client.query("SELECT current_setting('neon.branch_id',true) AS branch, current_user AS role")).rows[0];
  assert.equal(target.branch, branchId, 'LIVE_BRANCH_MISMATCH');
  assert.equal(target.role, 'neondb_owner');
  const before = await baseline();
  await client.query("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('municontrol:monthly-source-schema',0))");
  const sql = fs.readFileSync(new URL('./migrations/'+version+'.sql', import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const existing = (await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE version=$1', [version])).rows[0];
  if (existing) assert.equal(existing.checksum_sha256, checksum, 'INSTALLED_MIGRATION_DRIFT');
  else {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(version,checksum_sha256) VALUES($1,$2)', [version,checksum]);
  }
  const permissions = (await client.query(`SELECT
    has_function_privilege('municontrol_actions_runtime_app','payroll_monthly_source_summary_v1(text,uuid,integer,text,uuid,uuid,text,uuid[])','EXECUTE') AS reader,
    has_table_privilege('municontrol_actions_runtime_app','payroll_monthly_source_read_event','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS audit_access,
    has_table_privilege('municontrol_actions_runtime_app','payroll_detail_dataset','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS source_access,
    has_table_privilege('municontrol_actions_runtime_app','payroll_detail_statement','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS statement_access`)).rows[0];
  assert.deepEqual(permissions, {reader:true,audit_access:false,source_access:false,statement_access:false});
  const triggers = (await client.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='payroll_monthly_source_read_event'::regclass
    AND NOT tgisinternal AND tgenabled='O' ORDER BY tgname`)).rows.map(row=>row.tgname);
  assert.deepEqual(triggers,['payroll_monthly_source_read_event_immutable','payroll_monthly_source_read_event_no_truncate']);
  assert.deepEqual(await baseline(), before, 'EXISTING_DATA_CHANGED');
  if (args.apply === 'true') { commitAttempted = true; await client.query('COMMIT'); committed = true; }
  else await client.query('ROLLBACK');
  assert.deepEqual(await baseline(), before, 'EXISTING_DATA_CHANGED_AFTER_TRANSACTION');
  Object.assign(result, {checksum,alreadyApplied:Boolean(existing),committed,runtimePermissionsVerified:true,existingDataUnchanged:true,completedAt:new Date().toISOString()});
  console.log(JSON.stringify(result,null,2));
} catch (error) {
  if (!commitAttempted) await client.query('ROLLBACK').catch(() => {});
  // A lost COMMIT acknowledgement cannot certify a rollback. Reconcile the
  // migration ledger and checksum in a fresh connection before any retry.
  const commitState = committed ? 'committed' : commitAttempted ? 'unknown' : 'not_committed';
  // No SQL error details: they may contain source rows or credentials.
  console.error(JSON.stringify({ok:false,committed:commitAttempted && !committed ? null : committed,commitState,requiresLedgerReconciliation:commitState==='unknown',code:/^[A-Z_]{3,90}$/.test(error.message) ? error.message : 'MONTHLY_SOURCE_SCHEMA_FAILED',sqlState:/^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : undefined}));
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
