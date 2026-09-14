// This harness only accepts the existing, private restore on loopback.
// It never connects on its own and never authorizes a production publication.
import { randomUUID } from 'node:crypto';
import { splitPostgresStatements } from './sql-statements.mjs';

const TARGET = Object.freeze({
  host: '127.0.0.1/32', port: 55439,
  database: 'restore_monthly_20260914', role: 'restore_owner',
});

function reject(code) { throw Object.assign(new Error(code), { code }); }
function identifier(value) {
  if (typeof value !== 'string' || !/^[a-z_][a-z_0-9]*$/.test(value)) reject('GRH_REHEARSAL_INVALID_SCHEMA');
  return `"${value}"`;
}

function leadingWords(statement) {
  let index = 0;
  const words = [];
  while (index < statement.length && words.length < 2) {
    if (/\s/.test(statement[index])) { index++; continue; }
    if (statement.startsWith('--', index)) {
      const newline = statement.indexOf('\n', index + 2);
      index = newline < 0 ? statement.length : newline + 1;
      continue;
    }
    if (statement.startsWith('/*', index)) {
      let depth = 1;
      index += 2;
      while (depth && index < statement.length) {
        if (statement.startsWith('/*', index)) { depth++; index += 2; }
        else if (statement.startsWith('*/', index)) { depth--; index += 2; }
        else index++;
      }
      continue;
    }
    const word = /^[a-z_]+/i.exec(statement.slice(index));
    if (!word) break;
    words.push(word[0].toUpperCase());
    index += word[0].length;
  }
  return words;
}

function guardedOperationClient(client) {
  return Object.freeze({
    async query(query, values) {
      const sql = typeof query === 'string' ? query : query?.text;
      if (typeof sql !== 'string' || typeof values === 'function'
          || (typeof query === 'object' && query !== null
            && ![Object.prototype, null].includes(Object.getPrototypeOf(query)))) {
        reject('GRH_REHEARSAL_OPERATION_QUERY_REQUIRED');
      }
      let statements;
      try { statements = splitPostgresStatements(sql); }
      catch { reject('GRH_REHEARSAL_OPERATION_QUERY_REQUIRED'); }
      for (const statement of statements) {
        const [first, second] = leadingWords(statement);
        if (['BEGIN', 'COMMIT', 'ROLLBACK', 'END', 'ABORT', 'START'].includes(first)
            || (first === 'PREPARE' && second === 'TRANSACTION')) {
          reject('GRH_REHEARSAL_TRANSACTION_CONTROL_FORBIDDEN');
        }
      }
      return client.query(query, values);
    },
  });
}

export async function verifyLocalRehearsalTarget(client) {
  if (typeof client?.query !== 'function') reject('GRH_REHEARSAL_CLIENT_REQUIRED');
  const result = await client.query(`SELECT inet_server_addr()::text AS host,
    inet_server_port() AS port, current_database() AS database, current_user AS role,
    current_setting('neon.branch_id', true) AS neon_branch`);
  if (!Array.isArray(result?.rows) || result.rows.length !== 1) reject('GRH_REHEARSAL_LOCAL_TARGET_REQUIRED');
  const row = result.rows[0];
  if (Object.entries(TARGET).some(([key, value]) => row[key] !== value)
      || (row.neon_branch !== null && row.neon_branch !== '')) reject('GRH_REHEARSAL_LOCAL_TARGET_REQUIRED');
}

// Row hashes are retained in memory; returned reports contain aggregate outcomes.
// Sequence state is checked separately because PostgreSQL nextval does not roll back.
async function fingerprint(client) {
  const names = await client.query("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  if (!Array.isArray(names?.rows) || !names.rows.length) reject('GRH_REHEARSAL_INVALID_SCHEMA');
  const tables = {};
  for (const { name } of names.rows) {
    const result = await client.query(`SELECT count(*)::text AS records,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS digest
      FROM public.${identifier(name)} t`);
    const row = result?.rows?.[0];
    if (result?.rows?.length !== 1 || !/^\d+$/.test(row?.records ?? '')
        || !/^[a-f0-9]{32}$/.test(row?.digest ?? '')) reject('GRH_REHEARSAL_SNAPSHOT_FAILED');
    tables[name] = row;
  }
  const sequenceNames = await client.query("SELECT sequencename AS name FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename");
  if (!Array.isArray(sequenceNames?.rows)) reject('GRH_REHEARSAL_SNAPSHOT_FAILED');
  const sequences = {};
  for (const { name } of sequenceNames.rows) {
    const result = await client.query(`SELECT last_value::text AS last_value, is_called FROM public.${identifier(name)}`);
    const row = result?.rows?.[0];
    if (result?.rows?.length !== 1 || !/^-?\d+$/.test(row?.last_value ?? '')
        || typeof row.is_called !== 'boolean') reject('GRH_REHEARSAL_SNAPSHOT_FAILED');
    sequences[name] = row;
  }
  return { tables, sequences };
}

/** Always roll back. The caller must supply an idle, dedicated local connection. */
export async function runLocalRollbackRehearsal({ client, operation, maximumSequenceAdvances = {} }) {
  const report = {
    version: 'grh-local-publication-rehearsal.v1', status: 'blocked',
    committed: false, productionWrites: false, sourceRefreshAuthorized: false,
    localTargetVerified: false, transactionStarted: false, rollbackConfirmed: false,
    tablesUnchanged: null, sequencesUnchanged: null,
    sequenceAdvances: {}, sequenceAdvancesWithinPolicy: null,
  };
  let before;
  let stage = 'target';
  const sentinel = `grh_rehearsal_${randomUUID().replaceAll('-', '')}`;
  let sentinelEstablished = false;
  try {
    await verifyLocalRehearsalTarget(client);
    report.localTargetVerified = true;
    if (typeof operation !== 'function') reject('GRH_REHEARSAL_OPERATION_REQUIRED');
    if (!maximumSequenceAdvances || Array.isArray(maximumSequenceAdvances)
        || typeof maximumSequenceAdvances !== 'object'
        || Object.entries(maximumSequenceAdvances).some(([name, maximum]) =>
          !['data_import_runs_id_seq', 'data_quality_issue_id_seq'].includes(name)
          || !Number.isSafeInteger(maximum) || maximum < 0 || maximum > 1000)) {
      reject('GRH_REHEARSAL_SEQUENCE_POLICY_INVALID');
    }
    maximumSequenceAdvances = Object.freeze({ ...maximumSequenceAdvances });
    // A dedicated connection is required: do not roll back a caller's pending work.
    // SAVEPOINT succeeds only when a transaction is already in progress.
    let alreadyInTransaction = false;
    try {
      await client.query('SAVEPOINT grh_rehearsal_idle_check');
      alreadyInTransaction = true;
      await client.query('RELEASE SAVEPOINT grh_rehearsal_idle_check');
    } catch (error) {
      if (error?.code !== '25P01') reject('GRH_REHEARSAL_IDLE_CONNECTION_REQUIRED');
    }
    if (alreadyInTransaction) reject('GRH_REHEARSAL_IDLE_CONNECTION_REQUIRED');
    stage = 'baseline';
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    report.transactionStarted = true;
    await client.query("SET LOCAL statement_timeout = '90s'");
    before = await fingerprint(client);
    await client.query('ROLLBACK');
    report.transactionStarted = false;
    report.tableCount = Object.keys(before.tables).length;
    report.sequenceCount = Object.keys(before.sequences).length;
    stage = 'publication';
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE');
    report.transactionStarted = true;
    await client.query("SET LOCAL statement_timeout = '90s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query(`SAVEPOINT ${identifier(sentinel)}`);
    sentinelEstablished = true;
    await operation(guardedOperationClient(client));
    report.status = 'verified-rolled-back';
  } catch {
    report.failureStage = stage;
    report.code = stage === 'target' ? 'GRH_REHEARSAL_LOCAL_CONNECTION_REJECTED'
      : stage === 'baseline' ? 'GRH_REHEARSAL_BASELINE_FAILED' : 'GRH_REHEARSAL_PUBLICATION_REJECTED';
  } finally {
    if (report.transactionStarted) {
      try {
        // A successful ROLLBACK outside a transaction proves nothing. The
        // private savepoint must still belong to the transaction we opened.
        // ROLLBACK TO also recovers an aborted transaction after a SQL error.
        if (sentinelEstablished) await client.query(`ROLLBACK TO SAVEPOINT ${identifier(sentinel)}`);
        await client.query('ROLLBACK');
        report.rollbackConfirmed = true;
      } catch (error) {
        report.status = 'verification-failed';
        report.rollbackConfirmed = false;
        report.committed = sentinelEstablished ? null : false;
        report.connectionRequiresDiscard = true;
        report.code = ['25P01', '3B001'].includes(error?.code)
          ? 'GRH_REHEARSAL_TRANSACTION_OWNERSHIP_LOST' : 'GRH_REHEARSAL_ROLLBACK_UNCONFIRMED';
        // Do not roll back a replacement transaction that the callback may
        // have opened. The caller should discard this dedicated connection.
      }
    }
  }
  if (before && report.rollbackConfirmed) {
    stage = 'conservation';
    let snapshotTransaction = false;
    try {
      await verifyLocalRehearsalTarget(client);
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      snapshotTransaction = true;
      await client.query("SET LOCAL statement_timeout = '90s'");
      const after = await fingerprint(client);
      report.tablesUnchanged = JSON.stringify(after.tables) === JSON.stringify(before.tables);
      report.sequencesUnchanged = JSON.stringify(after.sequences) === JSON.stringify(before.sequences);
      let sequencePolicyValid = Object.keys(before.sequences).join('|') === Object.keys(after.sequences).join('|');
      for (const [name, previous] of Object.entries(before.sequences)) {
        const next = after.sequences[name];
        if (!next || (previous.is_called && !next.is_called)
            || (!next.is_called && previous.last_value !== next.last_value)) { sequencePolicyValid = false; continue; }
        const delta = BigInt(next.last_value) - BigInt(previous.last_value)
          + (!previous.is_called && next.is_called ? 1n : 0n);
        if (delta < 0n || delta > BigInt(maximumSequenceAdvances[name] ?? 0)) sequencePolicyValid = false;
        if (delta !== 0n) report.sequenceAdvances[name] = delta.toString();
      }
      report.sequenceAdvancesWithinPolicy = sequencePolicyValid;
      if (!report.tablesUnchanged || !sequencePolicyValid) {
        report.status = 'verification-failed';
        report.code = 'GRH_REHEARSAL_STATE_CHANGED';
      }
    } catch {
      report.status = 'verification-failed';
      report.code = 'GRH_REHEARSAL_CONSERVATION_UNCONFIRMED';
    } finally {
      if (snapshotTransaction) {
        try { await client.query('ROLLBACK'); } catch {
          report.status = 'verification-failed';
          report.code = 'GRH_REHEARSAL_ROLLBACK_UNCONFIRMED';
        }
      }
    }
  }
  return report;
}
