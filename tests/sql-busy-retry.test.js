import test from 'node:test';
import assert from 'node:assert/strict';
import { busyRetrying, installSqlBusyRetry, isBusyError } from '../lib/sql-busy-retry.js';

const busy = () => Object.assign(new Error('psql: ERROR:  NATIVE_EMPLOYMENT_CATALOG_BUSY'), {});
const quiet = { sleep: async () => {}, random: () => 0.5 };

test('recognises only lock-busy errors', () => {
  assert.equal(isBusyError(busy()), true);
  assert.equal(isBusyError(new Error('SALARY_CONDITIONS_BUSY')), true);
  assert.equal(isBusyError(new Error('SALARY_CONDITIONS_FORBIDDEN')), false);
  assert.equal(isBusyError(new Error('busy')), false);
  assert.equal(isBusyError(null), false);
});

test('a busy query is repeated until it answers', async () => {
  let calls = 0;
  const run = busyRetrying(async value => { calls += 1; if (calls < 4) throw busy(); return value * 2; }, quiet);
  assert.equal(await run(21), 42);
  assert.equal(calls, 4);
});

test('other errors are never repeated', async () => {
  let calls = 0;
  const run = busyRetrying(async () => { calls += 1; throw new Error('SALARY_CONDITIONS_FORBIDDEN'); }, quiet);
  await assert.rejects(run(), /FORBIDDEN/);
  assert.equal(calls, 1);
});

test('gives up with the original error after the attempts or the time budget', async () => {
  let calls = 0;
  const always = async () => { calls += 1; throw busy(); };
  await assert.rejects(busyRetrying(always, { ...quiet, attempts: 3 })(), /CATALOG_BUSY/);
  assert.equal(calls, 3);
  calls = 0; let clock = 0;
  await assert.rejects(busyRetrying(always, { ...quiet, now: () => clock, sleep: async ms => { clock += ms; }, budgetMs: 200 })(), /CATALOG_BUSY/);
  assert.ok(calls >= 2 && calls < 8 && clock <= 200);
});

test('waits grow and stay under the cap', async () => {
  const waits = [];
  await assert.rejects(busyRetrying(async () => { throw busy(); }, { random: () => 1, sleep: async ms => { waits.push(ms); }, now: () => 0 })());
  assert.deepEqual(waits.slice(0, 6), [90, 180, 360, 720, 900, 900]);assert.equal(waits.length, 13);
});

test('installs on the same client object, once', async () => {
  let calls = 0;
  const sql = { query: async (text, values) => { calls += 1; if (calls === 1) throw busy(); return [{ text, values }]; } };
  const same = installSqlBusyRetry(sql, quiet);
  assert.equal(same, sql);
  const wrapped = sql.query;
  installSqlBusyRetry(sql, quiet);
  assert.equal(sql.query, wrapped);
  assert.deepEqual(await sql.query('SELECT 1', [2]), [{ text: 'SELECT 1', values: [2] }]);
  assert.equal(calls, 2);
});
