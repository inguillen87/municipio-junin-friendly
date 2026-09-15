// Additive migration to the existing operational branch. Default: ROLLBACK.
// Source data, private PDFs and credentials must never be printed or committed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Pool, neonConfig} from '@neondatabase/serverless';
import {employeeFamilySchemaEvidence, assertEmployeeFamilySchemaPreserved, readEmployeeFamilyStorageMeasurement, employeeFamilyApplierArgs, employeeFamilyOperationalUrl} from './lib/employee-family-schema-evidence.mjs';

const args = employeeFamilyApplierArgs(process.argv.slice(2));
const version = '064-employee-family-members';
const sql = fs.readFileSync(new URL('./migrations/'+version+'.sql', import.meta.url), 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');
assert.equal(checksum, args['expected-checksum'], 'MIGRATION_CHECKSUM_MISMATCH');
const branchId = 'br-plain-dust-acpjgebb';
assert.equal(args['confirm-operational-branch'], branchId, 'EXPLICIT_EXISTING_BRANCH_REQUIRED');
assert.ok(args['backup-report'], 'RESTORED_BACKUP_REPORT_REQUIRED');
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

const url = employeeFamilyOperationalUrl(process.env.DATABASE_URL);
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({connectionString:url.toString(), max:1, connectionTimeoutMillis:10000});
let client;
try { client = await pool.connect(); }
catch { await pool.end(); throw Error('OPERATIONAL_CONNECTION_FAILED'); }
let committed = false;
const result = {branchId, backupSha256:backup.sha256, version, mode:args.apply === 'true' ? 'apply' : 'rollback'};
try {
  const target = (await client.query("SELECT current_setting('neon.branch_id',true) AS branch, current_user AS role")).rows[0];
  if (target.branch) assert.equal(target.branch, branchId, 'LIVE_BRANCH_MISMATCH');
  assert.equal(target.role, 'neondb_owner');
  const before = await employeeFamilySchemaEvidence(client);
  result.storageBefore = await readEmployeeFamilyStorageMeasurement(client);
  await client.query("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('municontrol:schooling-schema',0))");
  const prior = (await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE version=$1', ['057-family-schooling-certificates'])).rows[0];
  assert.ok(prior, 'SCHOOLING_057_REQUIRED');
  assert.equal(prior.checksum_sha256, createHash('sha256').update(fs.readFileSync(new URL('./migrations/057-family-schooling-certificates.sql', import.meta.url))).digest('hex'), 'SCHOOLING_057_DRIFT');
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
    has_function_privilege('municontrol_actions_runtime_app','employee_family_context_v1(text,uuid,integer,text,uuid,uuid,uuid)','EXECUTE') AS family_context,
    has_function_privilege('municontrol_actions_runtime_app','employee_family_declare_v1(text,uuid,integer,text,uuid,uuid,jsonb,text)','EXECUTE') AS family_writer,
    has_function_privilege('municontrol_actions_runtime_app','school_certificate_read_v2(text,uuid,integer,text,uuid,uuid,uuid)','EXECUTE') AS reader_v2,
    has_function_privilege('municontrol_actions_runtime_app','school_certificate_register_v2(text,uuid,integer,text,uuid,uuid,jsonb,text)','EXECUTE') AS writer_v2,
    has_function_privilege('municontrol_actions_runtime_app','school_certificate_download_v2(text,uuid,integer,text,uuid,uuid,uuid)','EXECUTE') AS downloader_v2,
    has_table_privilege('municontrol_actions_runtime_app','employee_family_member','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS family_direct,
    has_table_privilege('municontrol_actions_runtime_app','employee_family_member_event','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS family_audit_direct,
    has_function_privilege('municontrol_actions_runtime_app','employee_family_subject_v1(jsonb,uuid,boolean)','EXECUTE') AS family_subject_helper,
    has_table_privilege('municontrol_actions_runtime_app','school_certificate','SELECT') AS metadata_read,
    has_table_privilege('municontrol_actions_runtime_app','school_certificate_blob','SELECT') AS blob_read,
    has_table_privilege('municontrol_actions_runtime_app','school_certificate_event','SELECT') AS audit_read,
    has_table_privilege('municontrol_actions_runtime_app','school_certificate_storage_policy','SELECT,INSERT,UPDATE,DELETE') AS policy_access,
    has_function_privilege('municontrol_actions_runtime_app','school_certificate_storage_capacity_v1()','EXECUTE') AS capacity_helper,
    has_function_privilege('municontrol_actions_runtime_app','school_certificate_storage_reserve_v1(uuid,text,integer)','EXECUTE') AS reserve_helper`)).rows[0];
  assert.deepEqual(permissions, {reader:true,writer:true,downloader:true,family_context:true,family_writer:true,reader_v2:true,writer_v2:true,downloader_v2:true,
    family_direct:false,family_audit_direct:false,family_subject_helper:false,metadata_read:false,blob_read:false,audit_read:false,policy_access:false,capacity_helper:false,reserve_helper:false});
  result.storagePrepared = await readEmployeeFamilyStorageMeasurement(client);
  assertEmployeeFamilySchemaPreserved(before, await employeeFamilySchemaEvidence(client));
  if (args.apply === 'true') { await client.query('COMMIT'); committed = true; }
  else await client.query('ROLLBACK');
  assertEmployeeFamilySchemaPreserved(before, await employeeFamilySchemaEvidence(client));
  result.storageAfter = await readEmployeeFamilyStorageMeasurement(client);
  Object.assign(result, {checksum,alreadyApplied:Boolean(existing),committed,runtimePermissionsVerified:true,existingSchoolingRowsPreserved:true,legacy057DefinitionsAndAclPreserved:true,completedAt:new Date().toISOString()});
  console.log(JSON.stringify(result,null,2));
} catch (error) {
  if (!committed) await client.query('ROLLBACK').catch(() => {});
  // No SQL error details: they may contain source rows or credentials.
  console.error(JSON.stringify({ok:false,committed,code:/^[A-Z_]{3,90}$/.test(error.message) ? error.message : 'EMPLOYEE_FAMILY_SCHEMA_FAILED',sqlState:/^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : undefined}));
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
