import test from 'node:test';
import assert from 'node:assert/strict';
import { busyRetrySql, isBusyError } from '../lib/busy-read-retry.js';

test('busy and lock collisions are recognised; business errors are not', () => {
  for (const message of ['NATIVE_SALARY_BUSY', 'raise OWN_RUN_BUSY', 'OWN_PROGRAM_BUSY at line 3', 'canceling statement: lock_not_available']) assert.equal(isBusyError({ message }), true, message);
  assert.equal(isBusyError({ code: '55P03', message: 'x' }), true);
  for (const message of ['OWN_PROGRAM_FORBIDDEN', 'ACTION_SESSION_INVALID', 'BUSYNESS', 'busy']) assert.equal(isBusyError({ message }), false, message);
});

test('a read retries a collision with backoff and returns the first success; other errors pass through at once', async () => {
  const waits = [];
  let calls = 0;
  const sql = { query: async (text, values) => { calls++; if (calls < 3) throw new Error('NATIVE_SALARY_BUSY'); return [{ text, values }]; }, transaction: function () { return this === sql; } };
  const retried = busyRetrySql(sql, { sleep: async ms => { waits.push(ms); } });
  assert.deepEqual(await retried.query('SELECT 1', [1]), [{ text: 'SELECT 1', values: [1] }]);
  assert.equal(calls, 3); assert.equal(waits.length, 2); assert.ok(waits[1] > waits[0] - 160);
  assert.equal(retried.transaction(), true, 'other methods keep their receiver');
  let failing = 0;
  const forbidden = busyRetrySql({ query: async () => { failing++; throw new Error('OWN_PROGRAM_FORBIDDEN'); } }, { sleep: async () => {} });
  await assert.rejects(forbidden.query('x'), /FORBIDDEN/); assert.equal(failing, 1);
  let busy = 0;
  const always = busyRetrySql({ query: async () => { busy++; throw new Error('OWN_RUN_BUSY'); } }, { attempts: 4, sleep: async () => {} });
  await assert.rejects(always.query('x'), /OWN_RUN_BUSY/); assert.equal(busy, 4);
});

test('only GET bootstraps are wrapped; mutations keep a single attempt', async () => {
  const fs = await import('node:fs');
  for (const file of ['api/internal-own-payroll-program.js', 'api/internal-own-payroll-run.js', 'api/internal-employment-catalog.js']) {
    assert.match(fs.readFileSync(file, 'utf8'), /=== 'GET' \? busyRetrySql\(await getSql\(env\)\) : await getSql\(env\)/, file);
  }
});
