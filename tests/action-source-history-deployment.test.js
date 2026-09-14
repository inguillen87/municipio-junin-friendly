import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const moduleUrl = new URL('../scripts/apply-action-source-history-schema.mjs', import.meta.url);
const read = name => fs.readFileSync(new URL('../scripts/' + name, import.meta.url), 'utf8');
const applier = fs.readFileSync(moduleUrl, 'utf8');
const migration = read('migrations/059-action-source-history.sql');
const rollback = read('rollback/059-action-source-history.sql');
const branch = 'br-plain-dust-acpjgebb';
const approvedHost = 'ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech';
const originals = {
  action_center_tenant_list_v2: '007-action-center-read-facades.sql',
  action_center_tenant_detail_v2: '018-action-center-operational-completion.sql',
  action_center_overtime_list_v1: '008-governed-overtime-actions.sql',
  action_center_overtime_detail_v1: '008-governed-overtime-actions.sql',
  action_center_apply_tenant_command: '017-tenant-action-unlinked-operator.sql',
  action_center_apply_overtime_command_v1: '008-governed-overtime-actions.sql',
};
const hash = (text, algorithm = 'sha256') => createHash(algorithm).update(text).digest('hex');
const normalize = text => text.replaceAll('\r\n', '\n');
function definition(sql, name) {
  const matches = splitPostgresStatements(sql).filter(statement => new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${name}\\(`).test(statement));
  assert.equal(matches.length, 1, 'ONE_DEFINITION_REQUIRED: ' + name);
  return normalize(matches[0].slice(matches[0].indexOf('CREATE OR REPLACE FUNCTION')));
}
function functionBody(sql, name) {
  const value = definition(sql, name);
  assert.ok(value.includes('AS $$') && value.endsWith('$$'));
  return value.slice(value.indexOf('AS $$') + 5, -2);
}

// Execute the actual argument, archive and target guards, stopping before any
// driver initialization. Real synthetic files exercise hashing; no SQL mock,
// credentials, database import, connection or network call is involved.
const boundary = applier.indexOf('neonConfig.webSocketConstructor=WebSocket;');
assert.ok(boundary > 0 && boundary < applier.indexOf('new Pool('));
const preflight = applier.slice(0, boundary)
  .replace(/^import .+;\r?\n/gm, '')
  .replaceAll('import.meta.url', 'moduleUrl');
assert.doesNotMatch(preflight, /\b(?:new Pool|fetch|connect)\s*\(/);
const runPreflight = new (Object.getPrototypeOf(async function () {}).constructor)(
  'assert', 'fs', 'path', 'createHash', 'process', 'URL', 'moduleUrl',
  preflight + '\nreturn { branchId, version, checksum, newBodies, previousBodies, url: url.toString(), apply: args.apply };',
);
async function withBackup(callback) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tempRoot, 'mc-action059-deploy-'));
  const archive = Buffer.from('Synthetic backup bytes: this is not a municipal database.');
  const reportPath = path.join(directory, 'synthetic-backup.json');
  const report = { projectId: 'noisy-poetry-54471701', branchId: branch, restorationVerified: true, file: 'synthetic-backup.bin', sha256: hash(archive), completedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(directory, report.file), archive);
  function run({ change = {}, args = [], url = 'postgresql://neondb_owner:synthetic@invalid.local:1234/other?sslmode=require' } = {}) {
    fs.writeFileSync(reportPath, JSON.stringify({ ...report, ...change }));
    return runPreflight(assert, fs, path, createHash, {
      argv: ['node', 'synthetic-preflight', '--confirm-operational-branch=' + branch, '--backup-report=' + reportPath, ...args],
      env: { DATABASE_URL: url },
    }, URL, moduleUrl);
  }
  try { await callback({ run, report, directory }); }
  finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), tempRoot); assert.ok(path.basename(resolved).startsWith('mc-action059-deploy-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

test('059 preflight pins the operational host/database and defaults to rollback despite credential-source URL', async () => {
  await withBackup(async ({ run }) => {
    const result = await run(), target = new URL(result.url);
    assert.equal(result.branchId, branch); assert.equal(target.hostname, approvedHost);
    assert.equal(target.pathname, '/neondb'); assert.equal(target.port, '5432'); assert.equal(result.apply, undefined);
    assert.equal(result.checksum, hash(migration));
    for (const [name, file] of Object.entries(originals)) assert.equal(result.previousBodies[name], hash(functionBody(read('migrations/' + file), name), 'md5'), name);
  });
});

for (const [label, options, error] of [
  ['wrong branch', { args: ['--confirm-operational-branch=br-other'] }, /EXPLICIT_EXISTING_BRANCH_REQUIRED/],
  ['unknown parameter', { args: ['--endpoint=arbitrary'] }, /UNKNOWN_ARGUMENT/],
  ['invalid apply flag', { args: ['--apply=yes'] }, /INVALID_APPLY_MODE/],
  ['non-owner connection', { url: 'postgresql://runtime:synthetic@invalid.local/db' }, /OWNER_CONNECTION_REQUIRED/],
  ['connection routing override', { url: 'postgresql://neondb_owner:synthetic@invalid.local/db?options=route_elsewhere' }, /UNEXPECTED_CONNECTION_ROUTING/],
  ['unrestored backup', { change: { restorationVerified: false } }, /Expected values/],
  ['other project backup', { change: { projectId: 'another-project' } }, /Expected values/],
  ['other branch backup', { change: { branchId: 'br-other' } }, /Expected values/],
  ['old backup', { change: { completedAt: '2000-01-01T00:00:00Z' } }, /RECENT_BACKUP_REQUIRED/],
  ['future backup', { change: { completedAt: '2100-01-01T00:00:00Z' } }, /RECENT_BACKUP_REQUIRED/],
  ['archive outside report directory', { change: { file: '../outside.bin' } }, /INVALID_BACKUP_PATH/],
  ['changed archive hash', { change: { sha256: 'a'.repeat(64) } }, /BACKUP_CONTENT_CHANGED/],
]) test('059 real preflight rejects ' + label + ' before any connection', async () => {
  await withBackup(async ({ run }) => assert.rejects(run(options), error));
});

test('059 database verification stays within one bounded repeatable-read snapshot', () => {
  const timeout = applier.indexOf('SET statement_timeout='), target = applier.indexOf("SELECT current_setting('neon.branch_id',true)");
  const targetGuard = applier.indexOf("assert.equal(target.branch,branchId,'LIVE_BRANCH_MISMATCH')");
  const begin = applier.indexOf('BEGIN ISOLATION LEVEL REPEATABLE READ'), lock = applier.indexOf('SELECT pg_advisory_xact_lock');
  const before = applier.indexOf('const before=await baseline()'), compare = applier.indexOf("assert.deepEqual(await baseline(),before,'EXISTING_DATA_CHANGED')");
  const commit = applier.indexOf("await client.query('COMMIT')");
  assert.ok(timeout >= 0 && timeout < target && target < targetGuard && targetGuard < begin);
  assert.ok(begin < lock && lock < before && before < compare && compare < commit);
  assert.match(applier.slice(begin, before), /lock_timeout='3s'; SET LOCAL statement_timeout='45s'/);
  assert.equal((applier.match(/await baseline\(\)/g) || []).length, 2, 'no fresh-snapshot data comparison after commit or rollback');
  assert.doesNotMatch(applier.slice(commit), /await baseline\(/);
  assert.match(applier, /same_repeatable_read_snapshot/);
});

test('059 checks branch, installed checksum, original/new bodies and exact runtime boundaries before commit', () => {
  const commit = applier.indexOf("await client.query('COMMIT')");
  for (const guard of ['LIVE_BRANCH_MISMATCH', 'INSTALLED_MIGRATION_DRIFT', 'EXISTING_FUNCTION_DRIFT', 'INSTALLED_FUNCTION_CONTENT_MISMATCH', 'FUNCTION_AUTHORITY_CHANGED', 'FUNCTION_OWNER_CHANGED', 'FUNCTION_SEARCH_PATH_CHANGED', 'PUBLIC_EXECUTE_FORBIDDEN', 'FUNCTION_RUNTIME_BOUNDARY_CHANGED', 'DIRECT_SOURCE_ACCESS_FORBIDDEN']) {
    const index = applier.indexOf(guard); assert.ok(index > 0 && index < commit, guard);
  }
  assert.match(applier, /if\(existing\)assert\.equal\(existing\.checksum_sha256,checksum/);
  assert.match(applier, /assert\.equal\(f\.runtime_execute,!helpers\.includes\(f\.name\)/);
  assert.match(applier.slice(commit), /COMMITTED_FUNCTIONS_CHANGED/);
  assert.match(applier.slice(commit), /COMMITTED_LEDGER_CHANGED/);
});

test('059 keeps an uncertain COMMIT distinct from rollback and only confirms persisted schema after its ACK', () => {
  assert.match(applier, /if\(args\.apply==='true'\)\{\s*commitAttempted=true;await client\.query\('COMMIT'\);committed=true;/);
  assert.match(applier, /else \{await client\.query\('ROLLBACK'\);assert\.deepEqual\(await functions\(\),beforeFunctions,'ROLLBACK_FUNCTIONS_NOT_RESTORED'\)/);
  assert.match(applier, /if\(!commitAttempted\)await client\.query\('ROLLBACK'\)/);
  assert.match(applier, /committed\?'committed':commitAttempted\?'unknown':'not_committed'/);
  assert.match(applier, /committed:commitAttempted&&!committed\?null:committed/);
  assert.match(applier, /requiresLedgerReconciliation:commitState==='unknown'/);
});

test('059 rollback is precisely six CREATE OR REPLACE definitions, with no top-level DML, ledger deletion or command invocation', () => {
  const statements = splitPostgresStatements(rollback);
  assert.equal(statements.length, 6);
  for (const statement of statements) {
    const executable = statement.replace(/--[^\n]*(?:\n|$)/g, '').trim();
    assert.match(executable, /^CREATE OR REPLACE FUNCTION (?:public\.)?action_center_[a-z0-9_]+\(/);
    assert.ok(executable.endsWith('$$'), 'only function definition is executed');
  }
  assert.doesNotMatch(rollback, /\b(?:DROP|TRUNCATE|COPY|ALTER TABLE|CREATE TABLE)\b/i);
  assert.doesNotMatch(rollback, /DELETE FROM\s+(?:public\.)?schema_migrations/i);
  assert.doesNotMatch(rollback, /action_center_(?:case_source_context|assert_case_source_current)_v1/);
  for (const [name, file] of Object.entries(originals)) {
    assert.equal(definition(rollback, name), definition(read('migrations/' + file), name), 'complete original signature, security mode and body: ' + name);
  }
});
