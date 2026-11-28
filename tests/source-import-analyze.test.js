import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCommittedSource, SOURCE_ANALYZE_PROFILES} from '../scripts/lib/source-import-analyze.mjs';
import {runGrhCoreCliTransaction} from '../scripts/import-grh-core-canonical.mjs';

function connection({guard, fail} = {}) {
 const calls = [];
 return {calls, async connect() {}, async end() {}, async query(sql, args) {
  calls.push({sql, args});
  if (fail?.(sql, calls)) throw Object.assign(Error('private password and imported identity'), {code: '57014'});
  if (sql.includes('source-analyze:guard')) return {rows: guard ?? args[0].map(name => ({name, kind: 'r', allowed: true}))};
  return {rows: []};
 }};
}
test('a rehearsal performs no planner queries, and unknown table profiles cannot execute SQL', async () => {
 const client = connection();
 assert.equal((await analyzeCommittedSource({client, profile: 'final_revision'})).status, 'skipped_not_committed');
 await assert.rejects(analyzeCommittedSource({client, profile: 'public; DROP TABLE anything', committed: true}), {code: 'SOURCE_ANALYZE_ARGUMENT'});
 assert.equal(client.calls.length, 0);
});
test('each fixed profile analyzes its full set after commit, under local bounded timeouts', async () => {
 for (const profile of Object.keys(SOURCE_ANALYZE_PROFILES)) {
  const client = connection(), report = await analyzeCommittedSource({client, profile, committed: true});
  assert.equal(report.status, 'completed'); assert.equal(report.retryImport, false);
  assert.deepEqual(report.analyzedTables, SOURCE_ANALYZE_PROFILES[profile]);
  assert.equal(client.calls[0].sql, 'BEGIN READ WRITE');
  assert.match(client.calls[1].sql, /SET LOCAL statement_timeout='30s'/);
  assert.match(client.calls[1].sql, /SET LOCAL lock_timeout='2s'/);
  assert.deepEqual(client.calls[2].args, [SOURCE_ANALYZE_PROFILES[profile]]);
  assert.equal(client.calls[3].sql, 'ANALYZE ' + SOURCE_ANALYZE_PROFILES[profile].map(n => 'public."' + n + '"').join(', '));
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
 }
});
test('missing tables, duplicate names, wrong kinds or missing privileges fail visibly before ANALYZE', async () => {
 const valid = SOURCE_ANALYZE_PROFILES.final_revision.map(name => ({name, kind: 'r', allowed: true}));
 for (const guard of [valid.slice(1), [valid[0], valid[0], valid[2]], valid.map(r => ({...r, allowed: false})), valid.map(r => ({...r, kind: 'v'}))]) {
  const client = connection({guard}), report = await analyzeCommittedSource({client, profile: 'final_revision', committed: true});
  assert.equal(report.status, 'failed'); assert.equal(report.dataCommitted, true); assert.equal(report.retryImport, false);
  assert.equal(report.code, 'SOURCE_ANALYZE_SCOPE_OR_PRIVILEGE');
  assert.equal(client.calls.some(r => r.sql.startsWith('ANALYZE ')), false);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
 }
});
test('maintenance timeout preserves a confirmed import and never asks to repeat it', async () => {
 const client = connection({fail: sql => sql.startsWith('ANALYZE ')});
 const report = await runGrhCoreCliTransaction({client, apply: true, operation: async () => ({counts: {synthetic: 9}})});
 assert.equal(report.ok, true); assert.equal(report.committed, true);
 assert.equal(report.plannerMaintenance.status, 'failed'); assert.equal(report.plannerMaintenance.retryImport, false);
 assert.equal(report.plannerMaintenance.code, 'SOURCE_ANALYZE_SQLSTATE_57014');
 assert.equal(client.calls.filter(r => r.sql === 'COMMIT').length, 1);
 assert.ok(client.calls.findIndex(r => r.sql === 'COMMIT') < client.calls.findIndex(r => r.sql.startsWith('ANALYZE ')));
 assert.doesNotMatch(JSON.stringify(report), /private|password|identity/);
});
test('an unconfirmed source commit never starts ANALYZE and remains explicitly uncertain', async () => {
 const client = connection({fail: sql => sql === 'COMMIT'});
 const report = await runGrhCoreCliTransaction({client, apply: true, operation: async () => ({})});
 assert.equal(report.committed, null); assert.equal(report.requiresLedgerReconciliation, true);
 assert.equal(client.calls.some(r => r.sql.startsWith('ANALYZE ') || r.sql === 'BEGIN READ WRITE'), false);
});
test('failed maintenance cleanup discards the connection but does not change the saved source outcome', async () => {
 const client = connection({fail: sql => sql.startsWith('ANALYZE ') || sql === 'ROLLBACK'});
 const report = await analyzeCommittedSource({client, profile: 'final_revision', committed: true});
 assert.equal(report.connectionReusable, false); assert.equal(report.dataCommitted, true); assert.equal(report.retryImport, false);
});
