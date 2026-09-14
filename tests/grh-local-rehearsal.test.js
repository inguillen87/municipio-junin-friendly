import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireGrhPublicationLocks, GRH_PUBLICATION_LOCKS } from '../scripts/lib/grh-publication-lock.mjs';
import { runLocalRollbackRehearsal, verifyLocalRehearsalTarget } from '../scripts/lib/grh-local-rehearsal.mjs';
import { rehearseGrhPublication } from '../scripts/rehearse-grh-publication.mjs';

const target = { host: '127.0.0.1/32', port: 55439, database: 'restore_monthly_20260914', role: 'restore_owner', neon_branch: null };

function client(options = {}) {
  const calls = [];
  let tx = options.alreadyInTransaction ?? false;
  let aborted = false;
  const savepoints = new Set();
  let comparisons = 0;
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('inet_server_addr')) return { rows: [{ ...target, ...options.target }] };
    const savepoint = /^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT) "?([a-z_0-9]+)"?$/.exec(sql);
    if (savepoint) {
      if (!tx) throw Object.assign(new Error('not in transaction'), { code: '25P01' });
      if (savepoint[1] === 'SAVEPOINT') {
        if (aborted) throw Object.assign(new Error('transaction aborted'), { code: '25P02' });
        savepoints.add(savepoint[2]);
      } else {
        if (!savepoints.has(savepoint[2])) throw Object.assign(new Error('savepoint missing'), { code: '3B001' });
        if (savepoint[1] === 'RELEASE SAVEPOINT') savepoints.delete(savepoint[2]);
        else aborted = false;
      }
      return { rows: [] };
    }
    if (sql.startsWith('BEGIN')) { tx = true; aborted = false; savepoints.clear(); return { rows: [] }; }
    if (sql === 'COMMIT') { tx = false; aborted = false; savepoints.clear(); return { rows: [] }; }
    if (sql === 'ROLLBACK') {
      if (options.rollbackFailure) throw new Error('private database detail');
      tx = false; aborted = false; savepoints.clear(); return { rows: [] };
    }
    if (sql.startsWith('SET LOCAL')) return { rows: [] };
    if (sql.includes('FROM pg_tables')) {
      comparisons++;
      return { rows: [{ name: options.badIdentifier ?? 'action_request' }] };
    }
    if (sql.includes('string_agg')) return { rows: [{ records: '4', digest: (options.tableChanged && comparisons > 1 ? 'b' : 'a').repeat(32) }] };
    if (sql.includes('FROM pg_sequences')) return { rows: [{ name: 'data_quality_issue_id_seq' }] };
    if (sql.includes('last_value::text')) return { rows: [{ last_value: options.sequenceChanged && comparisons > 1 ? '21' : '20', is_called: true }] };
    if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: options.acquired ?? true }] };
    if (sql === 'SELECT rehearsal_sql_failure()') {
      aborted = true;
      throw Object.assign(new Error('private SQL detail'), { code: '23514' });
    }
    if (sql === "SELECT 'COMMIT; BEGIN; ROLLBACK' AS example") return { rows: [] };
    throw new Error('unexpected query');
  } };
}

for (const [field, value] of Object.entries({
  host: '172.18.0.1/32', port: '55439', database: 'neondb', role: 'neondb_owner', neon_branch: 'br-operational',
})) {
  test(`ensayo rechaza destino divergente en ${field} antes de abrir una transacción`, async () => {
    const db = client({ target: { [field]: value } });
    let ran = false;
    const report = await runLocalRollbackRehearsal({ client: db, operation: async () => { ran = true; } });
    assert.equal(report.status, 'blocked');
    assert.equal(report.localTargetVerified, false);
    assert.equal(ran, false);
    assert.equal(db.calls.length, 1);
    assert.equal(report.rollbackConfirmed, false);
  });
}

test('exige metadatos del destino completos y una conexión dedicada sin trabajo pendiente', async () => {
  await assert.rejects(verifyLocalRehearsalTarget({ query: async () => ({ rows: [] }) }), /LOCAL_TARGET_REQUIRED/);
  await assert.rejects(verifyLocalRehearsalTarget(client({ target: { neon_branch: undefined } })), /LOCAL_TARGET_REQUIRED/);
  const db = client({ alreadyInTransaction: true });
  const report = await runLocalRollbackRehearsal({ client: db, operation: async () => assert.fail('must not execute') });
  assert.equal(report.status, 'blocked');
  assert.equal(db.calls.some(({ sql }) => sql === 'ROLLBACK' || sql.startsWith('BEGIN')), false);
});

test('reversión comprueba tablas y secuencias sin exponer huellas ni filas', async () => {
  const db = client();
  let ran = 0;
  const report = await runLocalRollbackRehearsal({ client: db, operation: async () => { ran++; } });
  assert.equal(ran, 1);
  assert.equal(report.status, 'verified-rolled-back');
  assert.equal(report.rollbackConfirmed, true);
  assert.equal(report.tablesUnchanged, true);
  assert.equal(report.sequencesUnchanged, true);
  assert.equal(report.tableCount, 1);
  assert.equal(report.sequenceCount, 1);
  assert.equal(report.committed, false);
  assert.equal(db.calls.filter(({ sql }) => sql === 'ROLLBACK').length, 3);
  assert.equal(db.calls.some(({ sql }) => /\bCOMMIT\b/.test(sql)), false);
  assert.doesNotMatch(JSON.stringify(report), /action_request|aaaa|last_value/);
});

test('fallo de una etapa revierte la transacción completa y comprueba conservación', async () => {
  const db = client();
  const report = await runLocalRollbackRehearsal({ client: db, operation: async () => { throw new Error('PRIVATE EMPLOYEE SQL'); } });
  assert.equal(report.status, 'blocked');
  assert.equal(report.failureStage, 'publication');
  assert.equal(report.rollbackConfirmed, true);
  assert.equal(report.tablesUnchanged, true);
  assert.equal(report.sequencesUnchanged, true);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|EMPLOYEE|SQL/);
});

test('un error SQL abortado se recupera mediante el centinela antes del rollback completo', async () => {
  const db = client();
  const report = await runLocalRollbackRehearsal({ client: db,
    operation: async (transaction) => transaction.query('SELECT rehearsal_sql_failure()') });
  assert.equal(report.status, 'blocked');
  assert.equal(report.rollbackConfirmed, true);
  assert.equal(report.committed, false);
  assert.equal(report.tablesUnchanged, true);
  assert.ok(db.calls.some(({ sql }) => /^ROLLBACK TO SAVEPOINT "grh_rehearsal_[a-f0-9]{32}"$/.test(sql)));
});

for (const replaceTransaction of [false, true]) {
  test(`no acredita rollback si la operación usa la conexión original para COMMIT${replaceTransaction ? ' y BEGIN' : ''}`, async () => {
    const db = client();
    const report = await runLocalRollbackRehearsal({ client: db, operation: async () => {
      // Simulates a dependency bypassing the guarded parameter through a
      // captured raw connection. The sentinel must detect this regression.
      await db.query('COMMIT');
      if (replaceTransaction) await db.query('BEGIN');
    } });
    assert.equal(report.status, 'verification-failed');
    assert.equal(report.code, 'GRH_REHEARSAL_TRANSACTION_OWNERSHIP_LOST');
    assert.equal(report.committed, null);
    assert.equal(report.rollbackConfirmed, false);
    assert.equal(report.tablesUnchanged, null);
    assert.equal(report.sequencesUnchanged, null);
    assert.equal(report.connectionRequiresDiscard, true);
    // Only the baseline was rolled back. A replacement transaction belongs
    // to the callback and must not be mistaken for the original transaction.
    assert.equal(db.calls.filter(({ sql }) => sql === 'ROLLBACK').length, 1);
  });
}

test('la conexión cedida rechaza control transaccional incluso con comentarios o varias sentencias', async () => {
  for (const statement of [
    'COMMIT', 'BEGIN', 'ROLLBACK', 'END', 'ABORT', 'START TRANSACTION', 'PREPARE TRANSACTION \'x\'',
    '-- leading comment\nCOMMIT', '/* outer /* nested */ comment */ COMMIT',
    "SELECT 'allowed'; COMMIT", 'START /* separator */ TRANSACTION', { text: 'COMMIT' },
  ]) {
    const db = client();
    const report = await runLocalRollbackRehearsal({ client: db, operation: async (transaction) => {
      assert.deepEqual(Object.keys(transaction), ['query']);
      assert.ok(Object.isFrozen(transaction));
      await transaction.query(statement);
    } });
    assert.equal(report.status, 'blocked');
    assert.equal(report.rollbackConfirmed, true);
    assert.equal(report.committed, false);
    assert.equal(report.tablesUnchanged, true);
    assert.equal(db.calls.some(({ sql }) => sql === statement), statement === 'ROLLBACK');
  }
});

test('palabras de control dentro de valores SQL no impiden la operación válida', async () => {
  const db = client();
  const report = await runLocalRollbackRehearsal({ client: db,
    operation: async (transaction) => transaction.query("SELECT 'COMMIT; BEGIN; ROLLBACK' AS example") });
  assert.equal(report.status, 'verified-rolled-back');
  assert.equal(report.rollbackConfirmed, true);
});

for (const changed of ['tableChanged', 'sequenceChanged']) {
  test(`no acredita conservación cuando cambia ${changed}`, async () => {
    const report = await runLocalRollbackRehearsal({ client: client({ [changed]: true }), operation: async () => {} });
    assert.equal(report.status, 'verification-failed');
    assert.equal(report.code, 'GRH_REHEARSAL_STATE_CHANGED');
    assert.equal(report[changed === 'tableChanged' ? 'tablesUnchanged' : 'sequencesUnchanged'], false);
  });
}

test('rollback fallido y esquema ilegible no se presentan como verificados', async () => {
  const failed = await runLocalRollbackRehearsal({ client: client({ rollbackFailure: true }), operation: async () => {} });
  assert.equal(failed.rollbackConfirmed, false);
  assert.equal(failed.status, 'verification-failed');
  assert.equal(failed.tablesUnchanged, null);
  const schema = await runLocalRollbackRehearsal({ client: client({ badIdentifier: 'table; SELECT 1' }), operation: async () => assert.fail('must not execute') });
  assert.equal(schema.status, 'blocked');
  assert.equal(schema.code, 'GRH_REHEARSAL_BASELINE_FAILED');
});

test('bloqueos excluyen los cuatro escritores anteriores en orden y requieren booleano verdadero', async () => {
  const db = client({ alreadyInTransaction: true });
  await acquireGrhPublicationLocks(db);
  assert.deepEqual(db.calls.filter(({ values }) => values).map(({ values }) => values[0]), GRH_PUBLICATION_LOCKS);
  for (const acquired of [false, 'true', 1]) {
    const busy = client({ acquired, alreadyInTransaction: true });
    await assert.rejects(acquireGrhPublicationLocks(busy), { code: 'GRH_PUBLICATION_BUSY' });
    assert.equal(busy.calls.filter(({ values }) => values).length, 1);
  }
});

test('orquestador rechaza rutas y fallos no definidos antes de consultar datos', async () => {
  const db = { query: async () => assert.fail('must not query') };
  const local = new URL('file:///private/source/');
  for (const options of [
    {}, { curatedDataDir: new URL('https://example.invalid/source/'), coreDataDir: local },
    { curatedDataDir: local, coreDataDir: local, failAfter: 'arbitrary code' },
  ]) {
    const report = await rehearseGrhPublication({ client: db, ...options });
    assert.equal(report.code, 'GRH_REHEARSAL_INPUT_INVALID');
    assert.equal(report.sourceRefreshAuthorized, false);
  }
});
