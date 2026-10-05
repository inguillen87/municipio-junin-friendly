import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ownProgramBootstrap, ownProgramReceipt } from '../assets/own-payroll-program-model.js';
import { programFingerprint } from '../lib/internal-own-payroll-program.js';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
import { approvedSources } from '../tests/fixtures/own-payroll-approved-synthetic.js';
const root = path.resolve(import.meta.dirname, '..');
export function readOwnProgramSqlFixture(logFile) {
  const target = path.resolve(logFile), verification = path.join(root, 'verification') + path.sep;
  assert.ok(target.startsWith(verification), 'Only local verification output is accepted');
  const log = fs.readFileSync(target, 'utf8'), lines = log.split(/\r?\n/), marker = 'OWN_PROGRAM_SYNTHETIC_CONTRACT:';
  assert.ok(!lines.some(x => /ERROR:/.test(x)), 'SQL verification contains a failure');
  assert.ok(lines.some(x => x.trim() === 'ROLLBACK'), 'Synthetic transaction did not finish with rollback');
  const matches = lines.filter(x => x.includes(marker)); assert.equal(matches.length, 1);
  const data = JSON.parse(matches[0].split(marker)[1]); ownProgramBootstrap(data.bootstrap);
  for (const r of [data.proposal, data.approval]) { ownProgramReceipt(r); assert.equal(r.requestSha256, programFingerprint(r.body)); }
  const summary = lines.find(x => x.trimStart().startsWith('{"ok": true,') && x.includes('ownProgramChecksPassed'));
  assert.ok(summary, 'Completed SQL result is missing'); const sqlReport = JSON.parse(summary.trim());
  const migration = fs.readFileSync(path.join(root, 'scripts/migrations/122-own-payroll-programs.sql'), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(sqlReport.migration122Sha256, createHash('sha256').update(migration).digest('hex')); assert.ok(sqlReport.ownProgramChecksPassed >= 41);
  return { ...data, sqlReport };
}
export function verifyOwnProgramContract(logFile) {
  const data = readOwnProgramSqlFixture(logFile), source = approvedSources(); source.programState = data.bootstrap;
  const snapshot = createOwnPayrollSnapshot(prepareOwnPayrollInput(source));
  assert.equal(snapshot.result.rows.length, 12); assert.equal(snapshot.result.municipalApprovalVerified, false);
  const amounts = snapshot.result.rows.filter(r => r.contractId === source.population.employees[0].contractId).map(r => r.amount);
  assert.deepEqual(amounts, ['100.10', '12.51', '20.00', '3.98', '15.02', '33.36666667']);
  return { passed: true, synthetic: true, sqlChecks: data.sqlReport.checksPassed, programChecks: data.sqlReport.ownProgramChecksPassed, programRevision: data.bootstrap.program.revision, salaryRevision: data.bootstrap.salaryCatalog.revision, resultRows: snapshot.result.rows.length, inputSha256: snapshot.inputSha256, resultSha256: snapshot.resultSha256, productiveInstallation: false, municipalApprovalVerified: false, paymentExecuted: false };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  assert.equal(process.argv.length, 3); const report = verifyOwnProgramContract(process.argv[2]); console.log(JSON.stringify(report));
} catch (e) { console.error(JSON.stringify({ passed: false, message: e.message })); process.exitCode = 1; }
