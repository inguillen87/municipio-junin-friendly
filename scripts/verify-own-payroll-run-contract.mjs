import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ownRunCapture } from '../assets/own-payroll-run-model.js';
import { ownRunHash } from '../lib/internal-own-payroll-run.js';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
const root = path.resolve(import.meta.dirname, '..');
export function readOwnRunSqlFixture(logFile) {
  const target = path.resolve(logFile); assert.ok(target.startsWith(path.join(root, 'verification') + path.sep));
  const lines = fs.readFileSync(target, 'utf8').split(/\r?\n/); assert.ok(!lines.some(x => /ERROR:/.test(x))); assert.ok(lines.some(x => x.trim() === 'ROLLBACK'));
  const marker = 'OWN_RUN_SYNTHETIC_CONTRACT:', matches = lines.filter(x => x.includes(marker)); assert.equal(matches.length, 1);
  const c = ownRunCapture(JSON.parse(matches[0].split(marker)[1])); assert.ok(c.saved); assert.equal(c.bodySha256, ownRunHash(c.body)); assert.equal(c.payloadSha256, ownRunHash(c.payload));
  const summary = lines.find(x => x.trimStart().startsWith('{"ok": true,') && x.includes('ownRunChecksPassed')); assert.ok(summary); const sqlReport = JSON.parse(summary.trim());
  const migration = fs.readFileSync(path.join(root, 'scripts/migrations/123-own-payroll-runs.sql'), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(sqlReport.migration123Sha256, ownRunHashRaw(migration)); assert.ok(sqlReport.ownRunChecksPassed >= 30);
  const { sourceInventory: _audit, ...sources } = c.payload, expected = createOwnPayrollSnapshot(prepareOwnPayrollInput(sources));
  assert.deepEqual(c.saved.input, expected.input); assert.deepEqual(c.saved.result, expected.result); assert.equal(c.saved.inputSha256, expected.inputSha256); assert.equal(c.saved.resultSha256, expected.resultSha256);
  if (sqlReport.fullMonthlyWriter) {
    assert.equal(c.payload.monthly.batches.length, 2);
    assert.equal(c.payload.fixed.export.data.total, 0);
    const rows = c.payload.monthly.batches.flatMap(b => b.rows);
    assert.equal(rows.reduce((sum, r) => sum + BigInt(r.amountCents), 0n), 2025n);
    assert.ok(rows.every(r => r.subject.origin === 'MUNICONTROL' && r.subject.sourceCutoff === null && r.issues.length === 1 && r.issues[0].code === 'concept_not_observed' && r.issues[0].blocking === false));
    assert.equal(expected.input.employees[0].inputs.find(i => i.key === 'addition').value, '20.25000000');
  }
  return { capture: c, sqlReport };
}
import { createHash } from 'node:crypto';
const ownRunHashRaw = s => createHash('sha256').update(s).digest('hex');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  assert.equal(process.argv.length, 3); const { capture: c, sqlReport } = readOwnRunSqlFixture(process.argv[2]);
  console.log(JSON.stringify({ passed: true, synthetic: true, sqlChecks: sqlReport.checksPassed, captureChecks: sqlReport.ownRunChecksPassed, fullMonthlyWriter: !!sqlReport.fullMonthlyWriter, monthlyBatchCount: c.payload.monthly.batches.length, preservedObservationCount: c.payload.monthly.batches.flatMap(b => b.rows).reduce((sum,r)=>sum+r.issues.length,0), inputSha256: c.saved.inputSha256, resultSha256: c.saved.resultSha256, employeeCount: c.saved.result.employeeCount, rowCount: c.saved.result.rowCount, productiveInstallation: false, municipalApprovalVerified: false, paymentExecuted: false }));
} catch (e) { console.error(JSON.stringify({ passed: false, message: e.message })); process.exitCode = 1; }
