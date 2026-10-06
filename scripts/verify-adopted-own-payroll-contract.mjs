import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ownRunCapture } from '../assets/own-payroll-run-model.js';
import { ownRunHash } from '../lib/internal-own-payroll-run.js';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
export function readAdoptedOwnRunSqlFixture(logFile) {
  const root=fs.realpathSync(new URL('../verification/',import.meta.url)),file=fs.realpathSync(path.resolve(logFile)),relative=path.relative(root,file);
  assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative),'QA evidence must stay in this worktree');
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
  assert.ok(!lines.some(l=>/ERROR:/.test(l)));assert.ok(lines.some(l=>l.trim()==='ROLLBACK'));
  const summary=lines.find(l=>l.trimStart().startsWith('{"ok": true,')&&l.includes('adoptedOwnRunChecksPassed'));assert.ok(summary);
  const report=JSON.parse(summary.trim());assert.equal(report.ok,true);assert.equal(report.adoptedOwnRunChecksPassed,23);
  const captures={};
  for(const [kind,marker] of [['legacy','ADOPTED_RUN_LEGACY_CONTRACT:'],['adopted','ADOPTED_RUN_SYNTHETIC_CONTRACT:']]) {
    const matches=lines.filter(l=>l.includes(marker));assert.equal(matches.length,1);
    const c=ownRunCapture(JSON.parse(matches[0].split(marker)[1]));assert.ok(c.saved);
    assert.equal(c.bodySha256,ownRunHash(c.body));assert.equal(c.payloadSha256,ownRunHash(c.payload));
    const {sourceInventory:_audit,...sources}=c.payload,expected=createOwnPayrollSnapshot(prepareOwnPayrollInput(sources));
    assert.deepEqual(c.saved.input,expected.input);assert.deepEqual(c.saved.result,expected.result);
    assert.equal(c.saved.inputSha256,expected.inputSha256);assert.equal(c.saved.resultSha256,expected.resultSha256);
    assert.equal(c.saved.result.payrollPosted,false);assert.equal(c.saved.result.paymentExecuted,false);captures[kind]=c;
  }
  const c=captures.adopted;
  assert.equal(c.saved.input.employees[0].employeeNumber,'A/3501');assert.equal(c.payload.monthly.batches.length,1);
  assert.equal(c.payload.fixed.export.data.total,1);assert.equal(c.saved.result.employeeTotals[0].net,'129.84');
  assert.deepEqual(c.payload.monthly.batches[0].rows[0].issues,[{code:'concept_not_observed',severity:'warning',blocking:false,field:'conceptSourceId',details:{basis:'published_grh_observation'}}]);
  return {captures,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length,3);const {captures,report}=readAdoptedOwnRunSqlFixture(process.argv[2]);
  console.log(JSON.stringify({passed:true,synthetic:true,sqlChecks:report.checksPassed,newChecks:report.adoptedOwnRunChecksPassed,
    oldAndAdoptedInputsAndResultsRecomputed:true,monthlyBatches:captures.adopted.payload.monthly.batches.length,
    fixedRows:captures.adopted.payload.fixed.export.data.total,resultRows:captures.adopted.saved.result.rowCount,
    municipalInstallation:false,payrollPosted:false,paymentExecuted:false}));
}
