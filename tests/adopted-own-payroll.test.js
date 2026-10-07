import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOwnPayrollInput, calculateOwnPayroll } from '../assets/own-payroll-engine.js';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
import { approvedSources } from './fixtures/own-payroll-approved-synthetic.js';
import { payrollInput } from './fixtures/own-payroll-synthetic.js';
import { adoptedRunInput } from './fixtures/adopted-own-payroll-synthetic.js';
import { capture, saved } from './fixtures/own-payroll-run-synthetic.js';
import { ownRunWorkspaceCsv, ownRunWorkspaceRows } from '../assets/own-payroll-run-workspace-model.js';
import { ownRunHash } from '../lib/internal-own-payroll-run.js';
import { buildAdoptedOwnRunQa } from '../scripts/verify-adopted-own-payroll-sql.mjs';

test('approved own sources preserve raw opaque employee numbers through deterministic calculation',()=>{
  for(const employeeNumber of [' A/009010 ','00095','Área 9','😀'.repeat(64)]){
    const s=approvedSources(1);s.population.employees[0].employeeNumber=employeeNumber;
    s.monthly.batches[0].rows[0].legajo=employeeNumber;s.monthly.batches[0].rows[0].subject.legajo=employeeNumber;
    const before=JSON.stringify(s),snapshot=createOwnPayrollSnapshot(prepareOwnPayrollInput(s));
    assert.equal(snapshot.input.employees[0].employeeNumber,employeeNumber);
    assert.ok(snapshot.result.rows.every(r=>r.employeeNumber===employeeNumber));
    assert.deepEqual(calculateOwnPayroll(snapshot.input),snapshot.result);assert.equal(JSON.stringify(s),before);
    assert.equal(snapshot.result.paymentExecuted,false);assert.equal(snapshot.result.payrollPosted,false);
  }
});
test('opaque identifiers cannot broaden agreement, department, concept, origin or source-identity validation',()=>{
  for(const patch of [{agreementCode:'A/1'},{departmentCode:'Área 9'},{categoryCode:'1/2'},{origin:'GRH'}]){
    const s=approvedSources(1);Object.assign(s.population.employees[0],patch);assert.throws(()=>prepareOwnPayrollInput(s));
  }
  const s=approvedSources(1);s.population.employees[0].employeeNumber='A/9';assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_IDENTITY_CHANGED');
  const input=adoptedRunInput('2026-11','A/9','20.00000000','1.25000000');input.rules[0].code='A/100';assert.throws(()=>normalizeOwnPayrollInput(input));
});
test('controls and overlong own identifiers fail atomically while duplicate displayed numbers retain distinct UUIDs',()=>{
  for(const employeeNumber of ['',null,95,'x'.repeat(65),'😀'.repeat(65),'A\n9','A\u00809','A\u009f9']){
    assert.throws(()=>normalizeOwnPayrollInput(adoptedRunInput('2026-11',employeeNumber)));
    const s=approvedSources(1);s.population.employees[0].employeeNumber=employeeNumber;assert.throws(()=>prepareOwnPayrollInput(s));
  }
  const i=payrollInput();i.employees.forEach(e=>e.employeeNumber=' A/009010 ');
  const result=calculateOwnPayroll(i);assert.equal(result.employeeCount,2);assert.equal(new Set(result.employeeTotals.map(e=>e.contractId)).size,2);
  i.employees[1].contractId=i.employees[0].contractId;assert.throws(()=>normalizeOwnPayrollInput(i),e=>e.code==='DUPLICATE');
});
test('invented combined source arithmetic is exact and never homologates municipal code95',()=>{
  const result=calculateOwnPayroll(adoptedRunInput('2026-11','A/3501','20.00000000','1.25000000'));
  assert.equal(result.rows.find(r=>r.conceptCode==='120').amount,'21.25');assert.equal(result.employeeTotals[0].net,'129.84');
  const s=approvedSources(1);s.monthly.batches[0].rows[0].conceptSourceId='95';assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_UNUSED');
  s.monthly.batches[0].rows[0].conceptSourceId='120';s.monthly.batches[0].rows[0].amountCents=null;s.monthly.batches[0].rows[0].quantityDecimal='100';
  assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_VALUE_MISSING');
});
test('complete CSV preserves opaque identifiers and neutralizes formulas even when a view has no matches',()=>{
  for(const number of [' A/009010 ','00095','=HYPERLINK("https://example.invalid")','  +95','@SUM(1,2)']){
    const c=capture();c.saved=saved(c);
    for(const e of c.saved.input.employees)e.employeeNumber=number;
    for(const r of c.saved.result.rows)r.employeeNumber=number;
    c.saved.inputSha256=ownRunHash(c.saved.input);c.saved.resultSha256=ownRunHash(c.saved.result);
    assert.equal(ownRunWorkspaceRows(c,'sin coincidencias',1,2).rows.length,0);
    const csv=ownRunWorkspaceCsv(c);
    assert.equal(csv.split('\r\n').filter(Boolean).length,c.saved.result.rowCount+1);
    assert.ok(csv.includes('"\''+number.replaceAll('"','""')+'"'));
    assert.ok(!csv.includes(c.saved.input.employees[0].contractId));
  }
});
test('new integration includes every old run, adoption and monthly check, preserves close guards and rolls back',async()=>{
  for(const serverMajor of [17,18]){
    const qa=await buildAdoptedOwnRunQa({serverMajor});
    assert.equal(qa.report.ownRunChecksPassed,36);assert.equal(qa.report.adoptedMonthlyChecksPassed,30);
    assert.equal(qa.report.checksPassed,919+qa.report.adoptedOwnRunChecksPassed);
    assert.ok(qa.sql.includes("current_database()<>'"+(serverMajor===17?'fixed_novelties_qa':'own_payroll_run_qa')+"'"));
    assert.ok(qa.sql.includes("current_setting('neon.project_id',true)"));assert.ok(qa.sql.trimEnd().endsWith('ROLLBACK;'));
    assert.ok(qa.sql.includes("SET LOCAL statement_timeout='300s';"));assert.ok(qa.sql.includes("SET LOCAL lock_timeout='2s';"));
    assert.ok(qa.sql.includes('ADOPTED_RUN_SYNTHETIC_CONTRACT:'));assert.ok(qa.sql.includes('ADOPTED_RUN_LEGACY_CONTRACT:'));
    assert.ok(qa.sql.indexOf('CREATE TEMP TABLE qa140_legacy')<qa.sql.indexOf('CREATE TEMP TABLE qa136_fresh_before'),'new fixture is complete before the unchanged lifecycle snapshot');
    assert.ok(qa.sql.indexOf('CREATE TEMP TABLE qa139_legacy')<qa.sql.indexOf('CREATE TEMP TABLE qa136_fresh_before'),'monthly fresh hire cannot replace the original comparison UUID later');
    assert.ok(qa.sql.includes('own_close_guard_v1'));assert.ok(qa.sql.includes('one selected unknown municipal history invalidates the complete capture'));
    assert.ok(qa.sql.includes('all scope globally refuses missing dates or classification without saving a partial population'));
  }
});
