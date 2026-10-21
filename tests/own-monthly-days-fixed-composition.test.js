// All amounts, declarations and identities below are invented synthetic fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedSyntheticSources } from './fixtures/own-monthly-days-approved-synthetic.js';
import { syntheticCapture } from './fixtures/own-monthly-days-capture-synthetic.js';
import { ownRunCapture } from '../assets/own-payroll-run-model.js';
import { ownProgramParticipationSourceRequired } from '../assets/own-monthly-day-declaration-program.js';
import { prepareOwnPayrollInput, prepareOwnPayrollInputComplete } from '../lib/own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
const adapter = mode => mode === 'fixed-v2' ? prepareOwnPayrollInputComplete : prepareOwnPayrollInput;

test('approved own193 partial days reach both adapters and exact engine without an unused157 source', () => {
  for (const mode of ['legacy','fixed-v2']) {
    const sources = approvedSyntheticSources('sql193',{mode,recognizedDays:'16'});
    const before = JSON.stringify(sources);
    assert.equal(Object.hasOwn(sources,'periodParticipation'),false);
    assert.equal(ownProgramParticipationSourceRequired(sources.programState.program.definition,'monthly'),false);
    const input = adapter(mode)(sources), result = createOwnPayrollSnapshot(input).result;
    assert.equal(input.employees[0].inputs.find(v=>v.key==='decl_rec_days').value,'16');
    assert.equal(result.rows.find(r=>r.conceptCode==='1').amount,'160000.00');
    assert.equal(result.employeeTotals[0].net,'194000.00');
    assert.equal(result.paymentExecuted,false);
    assert.equal(result.municipalApprovalVerified,false);
    assert.equal(JSON.stringify(sources),before);
  }
});

test('193 does not waive157 for an explicit period_fact or predecessor/nonmonthly programme', () => {
  const definition = approvedSyntheticSources('sql193').programState.program.definition;
  assert.equal(ownProgramParticipationSourceRequired(definition,'monthly'),false);
  const explicit = structuredClone(definition);
  explicit.bindings.push({agreementCode:'12',key:'explicit_period',unit:'days',sourceKind:'period_fact'});
  assert.equal(ownProgramParticipationSourceRequired(explicit,'monthly'),true);
  const predecessor = structuredClone(definition); delete predecessor.monthlyDayDeclarationVersion;
  assert.equal(ownProgramParticipationSourceRequired(predecessor,'monthly'),true);
  assert.equal(ownProgramParticipationSourceRequired(definition,'first_fortnight'),true);
});

test('192 full-month policy rejects partial declarations rather than changing source authority', () => {
  for (const mode of ['legacy','fixed-v2']) {
    const sources = approvedSyntheticSources('sql192',{mode,recognizedDays:'16'});
    assert.throws(()=>adapter(mode)(sources), e=>e.code==='MONTHLY_DAY_CAPTURE_INVALID');
  }
});

test('approved nullable contract hours remain null and only a consumed branch raises INPUT_MISSING', () => {
  for (const mode of ['legacy','fixed-v2']) {
    const safe=adapter(mode)(approvedSyntheticSources('sql193',{mode,agreementMonthlyHours:'140'}));
    assert.equal(safe.employees[0].inputs.find(i=>i.key==='contract_daily_hours').value,null);
    createOwnPayrollSnapshot(safe);
    const consumed=adapter(mode)(approvedSyntheticSources('sql193',{mode,agreementMonthlyHours:'139'}));
    assert.equal(consumed.employees[0].inputs.find(i=>i.key==='contract_daily_hours').value,null);
    assert.throws(()=>createOwnPayrollSnapshot(consumed),e=>e.code==='INPUT_MISSING');
  }
});

test('days retain exact fixed-v2 forced ledger and source-row provenance', () => {
  const sources=approvedSyntheticSources('sql192',{mode:'fixed-v2',forcedFixed:true});
  const input=prepareOwnPayrollInputComplete(sources), result=createOwnPayrollSnapshot(input).result;
  assert.equal(result.rows.find(r=>r.conceptCode==='107').amount,'25000.00');
  assert.equal(input.employees[0].fixedForcedAmounts[0].amountCents,'2500000');
  assert.equal(input.employees[0].fixedForcedAmounts[0].recordId,sources.fixed.export.data.rows[0].recordId);
  assert.equal(input.fixedForcedAmountsVersion,'own-fixed-forced-amount.v1');
});

test('run capture retains immutable dated body/key and stored prior algorithm with approved193', () => {
  const stored='1'.repeat(64), capture=syntheticCapture('sql193',{mode:'fixed-v2',days:'16',saved:true,algorithm:stored});
  const before=JSON.stringify(capture), attempt={key:capture.key,body:structuredClone(capture.body)};
  assert.equal(ownRunCapture(capture,attempt),capture);
  assert.equal(capture.saved.algorithmSha256,stored);
  assert.equal(JSON.stringify(capture),before);
  attempt.body.liquidationDate='2026-10-30';
  assert.throws(()=>ownRunCapture(capture,attempt),e=>e.code==='RUN_CONTRACT_INVALID');
  assert.equal(JSON.stringify(capture),before);
});
