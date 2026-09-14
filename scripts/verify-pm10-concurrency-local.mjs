#!/usr/bin/env node
// Destructive QA is permitted ONLY in the explicitly confirmed local restore.
// Credentials and copied source bytes stay in memory. Output is aggregate-only.
// A successful run leaves one committed test event in this disposable copy;
// the immutable evidence is deliberately not deleted. Never use on a live DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {assertPm10Receipt, validatePm10Payload} from '../lib/internal-pm10-reception.js';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const hash = value => createHash('sha256').update(value).digest('hex');
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const safeError = error => String(error?.message || '').match(/^([A-Z][A-Z0-9_]{2,95})(?:\n|$)/)?.[1] || 'LOCAL_QA_FAILED';
const insideRepo = value => {
  const relative = path.relative(repoRoot, value);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
};

export function validateLocalConnection(config, confirmed) {
  assert.equal(confirmed, true, 'LOCAL_RESTORE_CONFIRMATION_REQUIRED');
  assert.ok(config && typeof config === 'object' && !Array.isArray(config), 'LOCAL_CONFIG_INVALID');
  assert.equal(Object.keys(config).sort().join(','), 'database,host,password,port,user', 'LOCAL_CONFIG_KEYS_INVALID');
  assert.ok(['127.0.0.1', 'localhost'].includes(config.host), 'LOCAL_HOST_REQUIRED');
  assert.equal(Number(config.port), 55439, 'LOCAL_RESTORE_PORT_REQUIRED');
  // libpq accepts a connection URI in dbname: forbid it before spawning psql.
  assert.equal(config.database, 'restore_check', 'LOCAL_RESTORE_DATABASE_REQUIRED');
  assert.match(config.user, /^[A-Za-z_][A-Za-z0-9_]{0,62}$/, 'LOCAL_USER_INVALID');
  assert.ok(typeof config.password === 'string' && config.password.length > 0 && !/[\r\n\0]/.test(config.password), 'LOCAL_PASSWORD_INVALID');
  return {...config, host:'127.0.0.1', port:55439};
}

// psql is used instead of the Neon WebSocket driver. The clean environment and
// explicit hostaddr prevent inherited PG service/host settings from rerouting.
class LocalSession {
  constructor(executable, config) {
    const env = {};
    for (const key of ['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','TEMP','TMP']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    Object.assign(env, {PGHOSTADDR:'127.0.0.1', PGHOST:'127.0.0.1', PGPORT:'55439',
      PGDATABASE:config.database, PGUSER:config.user, PGPASSWORD:config.password,
      PGSSLMODE:'disable', PGCONNECT_TIMEOUT:'5', PGCLIENTENCODING:'UTF8',
      PGAPPNAME:'pm10-local-concurrency-qa'});
    this.child = spawn(executable, ['-X','-qAt','--no-password','-h','127.0.0.1','-p','55439',
      '-U',config.user,'-d',config.database,'--set=ON_ERROR_STOP=off','--set=VERBOSITY=terse'],
    {env, windowsHide:true, stdio:['pipe','pipe','pipe']});
    this.stdout = '';
    this.pending = null;
    this.closed = false;
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.consume(chunk));
    this.child.stderr.on('data', chunk => {
      if (this.pending) {
        this.pending.stderr += chunk;
        if (this.pending.stderr.length > 65536) this.fail('LOCAL_PSQL_OUTPUT_LIMIT');
      }
    });
    this.child.on('error', () => this.fail('LOCAL_PSQL_START_FAILED'));
    this.child.on('exit', () => { this.closed = true; this.fail('LOCAL_PSQL_CLOSED'); });
  }
  fail(code) {
    if (!this.pending) return;
    const pending = this.pending; this.pending = null;
    clearTimeout(pending.timer); pending.reject(Error(code));
  }
  consume(chunk) {
    this.stdout += chunk;
    if (this.stdout.length > 65536) { this.fail('LOCAL_PSQL_OUTPUT_LIMIT'); this.child.kill(); return; }
    let newline;
    while ((newline = this.stdout.indexOf('\n')) >= 0) {
      const line = this.stdout.slice(0, newline).replace(/\r$/, '');
      this.stdout = this.stdout.slice(newline + 1);
      const pending = this.pending;
      if (!pending) continue;
      if (line.startsWith(pending.marker + ' ')) {
        const [, failed, state] = line.split(' ');
        // stdout and stderr are separate pipes; allow error output to drain.
        setTimeout(() => {
          if (this.pending !== pending) return;
          clearTimeout(pending.timer); this.pending = null;
          if (failed === 'true' || /^ERROR:/m.test(pending.stderr)) {
            const code = pending.stderr.match(/\b(?:PM10|ATTENDANCE)_[A-Z_]+\b/)?.[0];
            const error = Error(code || 'LOCAL_SQL_FAILED');
            error.code = /^[A-Z0-9]{5}$/.test(state || '') ? state : null;
            pending.reject(error);
          } else pending.resolve(pending.rows);
        }, 15);
      } else if (line.startsWith('{') || line.startsWith('[')) {
        try { pending.rows.push(JSON.parse(line)); } catch { this.fail('LOCAL_SQL_JSON_INVALID'); }
      }
    }
  }
  query(sql) {
    if (this.pending || this.closed) return Promise.reject(Error('LOCAL_SESSION_UNAVAILABLE'));
    return new Promise((resolve, reject) => {
      const marker = '__PM10_' + randomUUID().replaceAll('-', '') + '__';
      const timer = setTimeout(() => { this.fail('LOCAL_SQL_TIMEOUT'); this.child.kill(); }, 15000);
      this.pending = {marker, timer, resolve, reject, rows:[], stderr:''};
      this.child.stdin.write(sql.trim() + '\n\\echo ' + marker + ' :ERROR :SQLSTATE\n');
    });
  }
  async one(sql) {
    const rows = await this.query(sql);
    assert.equal(rows.length, 1, 'LOCAL_SQL_ONE_ROW_REQUIRED');
    return rows[0];
  }
  async close() {
    if (this.closed) return;
    try { await this.query('ROLLBACK;'); } catch { /* Closing also rolls back. */ }
    this.child.stdin.end('\\q\n');
    await new Promise(resolve => {
      if (this.closed) return resolve();
      const timer = setTimeout(() => { this.child.kill(); resolve(); }, 1000);
      this.child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}

async function counts(session) {
  return session.one(`SELECT jsonb_build_object(
    'canonical',(SELECT count(*) FROM attendance_canonical_punch),
    'raw',(SELECT count(*) FROM attendance_raw_event),
    'historical',(SELECT count(*) FROM attendance_clock_snapshot_row),
    'identities',(SELECT count(*) FROM attendance_identity_map),
    'batches',(SELECT count(*) FROM attendance_ingest_batch),
    'receipts',(SELECT count(*) FROM attendance_pm10_receipt),
    'records',(SELECT count(*) FROM attendance_pm10_record),
    'audit',(SELECT count(*) FROM attendance_gateway_audit_event),
    'connectorState',(SELECT md5(string_agg(to_jsonb(c)::text,'|' ORDER BY c.id)) FROM attendance_connector c),
    'tenantState',(SELECT md5(string_agg(to_jsonb(t)::text,'|' ORDER BY t.id)) FROM platform_tenant t),
    'identityState',(SELECT md5(string_agg(to_jsonb(m)::text,'|' ORDER BY m.id)) FROM attendance_identity_map m)
  );`);
}
function reportCounts(value) {
  return Object.fromEntries(Object.entries(value).filter(([, count]) => typeof count === 'number'));
}
async function begin(session) {
  await session.query("BEGIN; SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s';");
}
async function expectedFailure(session, work, expected) {
  await session.query('SAVEPOINT expected_failure;');
  let failure;
  try { await work(); } catch (error) { failure = error; }
  await session.query('ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure;');
  assert.ok(failure && (failure.message === expected || failure.code === expected), 'EXPECTED_REJECTION_NOT_OBSERVED');
  return expected;
}
function testPayload(sourceHex) {
  const bytes = Buffer.from(sourceHex, 'hex');
  assert.equal(bytes.length, 40, 'SOURCE_RECORD_SIZE_INVALID');
  // Keep the source identity and time only in memory to exercise an existing
  // mapping. A random unused tail produces a unique, explicitly QA event.
  randomBytes(8).copy(bytes, 32);
  bytes.writeUInt16LE(randomBytes(2).readUInt16LE(), 0);
  const recordsSha256 = hash(bytes), snapshotSha256 = hash('LOCAL-CONCURRENCY-QA:' + randomUUID());
  return validatePm10Payload({version:'pm10-delivery.v1', serial:'CQTU225360168',
    batchId:hash(snapshotSha256 + ':' + recordsSha256), snapshotSha256, recordsSha256,
    totalRecords:1, snapshotRecordCount:1, partStart:0, capturedAt:new Date().toISOString(),
    partSha256:recordsSha256, ordinals:[1], recordsBase64:bytes.toString('base64')});
}

async function run(args) {
  assert.equal(args['confirm-local-restore'], 'true', 'LOCAL_RESTORE_CONFIRMATION_REQUIRED');
  assert.ok(path.isAbsolute(args['connection-file'] || ''), 'PRIVATE_CONNECTION_PATH_REQUIRED');
  const connectionPath = fs.realpathSync(args['connection-file']);
  assert.ok(!insideRepo(connectionPath), 'PRIVATE_CONFIG_OUTSIDE_REPO_REQUIRED');
  assert.ok(path.isAbsolute(args.psql || ''), 'PSQL_ABSOLUTE_PATH_REQUIRED');
  const executable = fs.realpathSync(args.psql);
  assert.match(path.basename(executable), /^psql(?:\.exe)?$/i, 'PSQL_EXECUTABLE_REQUIRED');
  const config = validateLocalConnection(JSON.parse(fs.readFileSync(connectionPath, 'utf8')), true);
  const sessions = [], passed = [];
  let stage = 'local_handshake', committed = false, baseline, final;
  const migrationHashes = {};
  try {
    const a = new LocalSession(executable, config), b = new LocalSession(executable, config);
    sessions.push(a, b);
    for (const session of sessions) {
      const server = await session.one(`SELECT jsonb_build_object('address',host(inet_server_addr()),
        'port',inet_server_port(),'version',current_setting('server_version_num')::integer,'database',current_database());`);
      assert.equal(server.address, '127.0.0.1', 'LOCAL_SERVER_ADDRESS_MISMATCH');
      assert.equal(server.port, 55439, 'LOCAL_SERVER_PORT_MISMATCH');
      assert.equal(server.database, 'restore_check', 'LOCAL_SERVER_DATABASE_MISMATCH');
      assert.equal(server.version, 170011, 'LOCAL_SERVER_VERSION_MISMATCH');
      await session.query("SET standard_conforming_strings=on; SET client_min_messages=warning; SET idle_in_transaction_session_timeout='30s';");
    }
    passed.push('two independent local PostgreSQL 17.11 sessions verified');
    if (args['apply-migrations'] === 'true') {
      stage = 'local_migrations';
      await begin(a);
      for (const name of ['055-pm10-continuous-reception.sql', '056-pm10-continuous-dashboard.sql']) {
        const sql = fs.readFileSync(new URL('migrations/' + name, import.meta.url), 'utf8');
        migrationHashes[name] = hash(sql);
        await a.query(sql);
      }
      await a.query('SET CONSTRAINTS ALL IMMEDIATE;');
      await a.query('COMMIT;');
      passed.push('055 and 056 committed exclusively in disposable local restore');
    }
    stage = 'source_context';
    const context = await a.one(`SELECT jsonb_build_object('connector',c.id,'external',c.external_key,
      'tokenHash',c.token_sha256,'connectorStatus',c.status,'lastAccepted',c.last_accepted_at,
      'tenant',c.tenant_id,'device',c.device_id,'release',p.certified_release_sha,'mapping',m.id,
      'identityHmac',m.identity_hmac_sha256,'sourceHex',encode(substring(cs.raw_attendance FROM 5+(sr.ordinal-1)*40 FOR 40),'hex'))
      FROM attendance_connector c
      JOIN attendance_device d ON d.id=c.device_id AND d.serial_number='CQTU225360168'
      JOIN tenant_identity_policy p ON p.tenant_id=c.tenant_id
      JOIN platform_tenant t ON t.id=c.tenant_id AND t.status='active'
      JOIN platform_tenant_source_binding binding ON binding.id=p.certified_source_binding_id
      JOIN attendance_clock_snapshot cs ON cs.device_id=c.device_id AND cs.tenant_id=c.tenant_id
      JOIN attendance_clock_snapshot_row sr ON sr.snapshot_id=cs.id AND cardinality(sr.issue_codes)=0
      JOIN attendance_identity_map m ON m.tenant_id=c.tenant_id AND m.device_id=c.device_id
        AND m.identity_hmac_sha256=sr.identity_hmac AND m.status='active'
        AND m.valid_from<=sr.local_timestamp::date AND (m.valid_to IS NULL OR m.valid_to>=sr.local_timestamp::date)
      JOIN employment_contract ec ON ec.id=m.employment_contract_id
        AND ec.source_system=binding.source_system AND ec.legacy_company_id=binding.source_company_id
        AND ec.status IN ('active','inactive') AND ec.start_date<=sr.local_timestamp::date
        AND (ec.end_date IS NULL OR ec.end_date>=sr.local_timestamp::date)
      JOIN source_import_batch ib ON ib.id=ec.source_batch_id AND ib.source_system=binding.source_system
        AND ib.source_database=binding.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL
      ORDER BY cs.captured_at DESC,sr.ordinal LIMIT 1;`);
    const body = testPayload(context.sourceHex);
    const activate = session => session.query(`UPDATE attendance_connector SET status='active' WHERE id=${quote(context.connector)};`);
    const receive = async session => assertPm10Receipt(await session.one(`SELECT attendance_pm10_receive_v1(
      ${quote(context.external)},${quote(context.tokenHash)},${quote(JSON.stringify(body))}::jsonb,${quote(context.release)});`), body);
    const lockIdentity = session => session.query(`SELECT pg_advisory_xact_lock(hashtextextended(
      ${quote('attendance-identity:' + context.tenant + ':' + context.device + ':' + context.identityHmac)},0));`);
    const lockIdentityRow = session => session.query(`SELECT id FROM attendance_identity_map WHERE id=${quote(context.mapping)} FOR UPDATE NOWAIT;`);
    const revoke = session => session.query(`UPDATE attendance_identity_map SET status='revoked',revoked_at=now(),
      version=version+1,updated_at=now() WHERE id=${quote(context.mapping)};`);
    const mapState = session => session.one(`SELECT jsonb_build_object('count',count(*),'mapped',count(*) FILTER(WHERE p.reconciliation_state='mapped'),
      'unmapped',count(*) FILTER(WHERE p.reconciliation_state='unmapped' AND p.identity_map_id IS NULL))
      FROM attendance_pm10_record r JOIN attendance_canonical_punch p ON p.raw_event_id=r.raw_event_id
      WHERE r.raw_sha256=${quote(body.partSha256)} AND r.device_id=${quote(context.device)};`);
    baseline = await counts(a);
    const rollbackBoth = async () => {
      await a.query('ROLLBACK;'); await b.query('ROLLBACK;');
      assert.deepEqual(await counts(a), baseline, 'ROLLBACK_BASELINE_CHANGED');
    };

    stage = 'tenant_inactive';
    await begin(a); await activate(a);
    const provisional = await receive(a); assert.equal(provisional.newCanonical, 1);
    for (const status of ['suspended','archived']) {
      await a.query(`UPDATE platform_tenant SET status=${quote(status)},version=version+1 WHERE id=${quote(context.tenant)};`);
      await expectedFailure(a, () => receive(a), 'PM10_BINDING_REQUIRED');
    }
    await rollbackBoth();
    passed.push('suspended and archived tenant reject even a previously accepted receipt replay; rollback exact');

    stage = 'tenant_row_lock';
    await begin(a); await activate(a); await begin(b);
    await b.query(`UPDATE platform_tenant SET status='suspended',version=version+1 WHERE id=${quote(context.tenant)};`);
    await expectedFailure(a, () => receive(a), 'PM10_BUSY');
    await b.query('ROLLBACK;');
    await receive(a); await rollbackBoth();
    passed.push('concurrent tenant suspension cannot race receiver active check; retry after rollback succeeds');

    stage = 'identity_advisory_first';
    await begin(a); await activate(a); await begin(b); await lockIdentity(b);
    await expectedFailure(a, () => receive(a), 'PM10_BUSY');
    await b.query('ROLLBACK;'); await receive(a);
    assert.deepEqual(await mapState(a), {count:1,mapped:1,unmapped:0});
    await rollbackBoth();
    passed.push('shared identity advisory key blocks reception while revoke owns it; retry maps once');

    stage = 'identity_row_first';
    await begin(a); await activate(a); await begin(b); await lockIdentityRow(b);
    await expectedFailure(a, () => receive(a), 'PM10_BUSY');
    await revoke(b); // Proves the failed receiver released the advisory lock.
    await expectedFailure(a, () => receive(a), 'PM10_BUSY');
    await b.query('ROLLBACK;'); await receive(a); await rollbackBoth();
    passed.push('revoke row-first order does not deadlock; failed receiver releases advisory lock; rollback exact');

    stage = 'receiver_first';
    await begin(a); await activate(a); await receive(a); await begin(b);
    await expectedFailure(b, () => lockIdentityRow(b), '55P03');
    await a.query('ROLLBACK;'); await lockIdentityRow(b); await revoke(b); await rollbackBoth();
    passed.push('receiver holds identity row through transaction; concurrent revoke rejects promptly and retries after rollback');

    stage = 'already_revoked';
    await begin(a); await activate(a); await revoke(a); await receive(a);
    assert.deepEqual(await mapState(a), {count:1,mapped:0,unmapped:1});
    await rollbackBoth();
    passed.push('revoked identity is retained as unmapped and is never automatically recreated');

    stage = 'concurrent_ingest_rollback';
    await begin(a); await activate(a); await receive(a); await begin(b);
    await expectedFailure(b, () => receive(b), 'PM10_BUSY');
    await a.query('ROLLBACK;'); await activate(b);
    const retry = await receive(b), replay = await receive(b);
    assert.equal(retry.newCanonical, 1);
    assert.deepEqual({...replay,replayed:false}, retry);
    assert.equal(replay.replayed, true);
    await rollbackBoth();
    passed.push('concurrent same-batch ingestion is busy before rollback; next session accepts exactly once then replays');

    stage = 'committed_delivery';
    await begin(a); await activate(a); const accepted = await receive(a);
    assert.equal(accepted.newCanonical, 1); assert.equal(accepted.replayed, false);
    await begin(b);
    await expectedFailure(b, () => receive(b), 'PM10_BUSY');
    const invisible = await b.one(`SELECT jsonb_build_object('count',count(*)) FROM attendance_pm10_receipt
      WHERE connector_id=${quote(context.connector)} AND batch_key=${quote(body.batchId)};`);
    assert.equal(invisible.count, 0, 'UNCOMMITTED_RECEIPT_VISIBLE');
    await a.query('SET CONSTRAINTS ALL IMMEDIATE;');
    // Do not leave the restored connector activated or change its telemetry.
    await a.query(`UPDATE attendance_connector SET status=${quote(context.connectorStatus)},
      last_accepted_at=${context.lastAccepted === null ? 'NULL' : quote(context.lastAccepted) + '::timestamptz'}
      WHERE id=${quote(context.connector)};`);
    await a.query('COMMIT;'); committed = true;
    // Lose the accepting client completely: replay must come from committed SQL.
    await a.close();
    await activate(b);
    const durableReplay = await receive(b);
    assert.equal(durableReplay.replayed, true);
    assert.deepEqual({...durableReplay,replayed:false}, accepted);
    assert.deepEqual(await mapState(b), {count:1,mapped:1,unmapped:0});
    await b.query('ROLLBACK;');
    final = await counts(b);
    for (const key of ['canonical','raw','batches','receipts','records','audit']) {
      assert.equal(final[key], baseline[key] + 1, 'COMMITTED_EVIDENCE_COUNT_MISMATCH');
    }
    for (const key of ['historical','identities','connectorState','tenantState','identityState']) {
      assert.equal(final[key], baseline[key], 'COMMITTED_FIXTURE_CHANGED_PROTECTED_STATE');
    }
    passed.push('receipt invisible before commit; same durable receipt after accepting client closes; one canonical/raw/receipt/record/audit only');
    return {ok:true,checksPassed:passed,migrationHashes,baseline:reportCounts(baseline),final:reportCounts(final),
      rollbackScenariosRestored:true,localFixtureCommitted:true,durableReplayVerified:true,
      connectorAndTenantRestored:true,productionContacted:false,clockContacted:false,observedAt:new Date().toISOString()};
  } catch (error) {
    return {ok:false,stage,code:error.code || null,reason:safeError(error),checksPassed:passed,
      localFixtureCommitted:committed,productionContacted:false,clockContacted:false};
  } finally {
    for (const session of sessions) await session.close();
  }
}

function selfTest() {
  const synthetic = {host:'127.0.0.1',port:55439,database:'restore_check',user:'synthetic_qa',password:'synthetic-only'};
  assert.equal(validateLocalConnection(synthetic, true).host, '127.0.0.1');
  assert.equal(validateLocalConnection({...synthetic,host:'localhost'}, true).host, '127.0.0.1');
  for (const mutation of [{host:'example.invalid'},{host:'127.0.0.1.example.invalid'},
    {host:'::1'},{port:5432},{database:'postgres'},{database:'postgresql://example.invalid/db'},
    {user:'user host=example.invalid'},{password:'x\n'},{service:'remote'}]) {
    assert.throws(() => validateLocalConnection({...synthetic,...mutation}, true));
  }
  assert.throws(() => validateLocalConnection(synthetic, false));
  return {ok:true,selfTest:true,guardRejections:10,databaseContacted:false};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = {};
    for (const value of process.argv.slice(2)) {
      const match = /^--([a-z-]+)=(.+)$/.exec(value);
      assert.ok(match && ['confirm-local-restore','connection-file','psql','apply-migrations','self-test'].includes(match[1]), 'LOCAL_ARGUMENT_INVALID');
      assert.ok(!Object.hasOwn(args,match[1]), 'LOCAL_ARGUMENT_DUPLICATE'); args[match[1]] = match[2];
    }
    for (const key of ['apply-migrations','self-test']) if (args[key] !== undefined) {
      assert.ok(['true','false'].includes(args[key]), 'LOCAL_BOOLEAN_ARGUMENT_INVALID');
    }
    const report = args['self-test'] === 'true' ? selfTest() : await run(args);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ok:false,reason:safeError(error)})); process.exitCode = 1;
  }
}
