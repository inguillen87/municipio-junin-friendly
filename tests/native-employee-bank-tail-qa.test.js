import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedNativeBankTail, withNativeBankActor } from '../scripts/lib/native-employee-bank-tail-qa.mjs';
import { bankOutputFixture, syntheticNet, syntheticTaxId } from './fixtures/own-bank-output-synthetic.js';
import fs from 'node:fs';
import { ownRunHash } from '../lib/internal-own-payroll-run.js';

const otherId = 'bbbbbbbb-0000-4000-8000-000000000001';
function refreshSources(fixture) {
  fixture.closes[0].snapshotSha256 = ownRunHash(fixture.closes[0].snapshot);
  fixture.batch.snapshot.sources[0].snapshotSha256 = fixture.closes[0].snapshotSha256;
  fixture.batch.snapshotSha256 = ownRunHash(fixture.batch.snapshot);
}
function tailFixture(net) {
  const fixture = bankOutputFixture(1);
  if (net !== undefined) syntheticNet(fixture, net);
  const record = fixture.batch.snapshot.records[0];
  // This pure fixture is not a runtime journey: explicitly declare its version2.
  record.liquidationVersion = 2;
  fixture.closes[0].snapshot.employees[0].liquidationVersion = 2;
  refreshSources(fixture);
  return { ...fixture, profile: { currency: fixture.profile.currency, creditDate: fixture.profile.creditDate }, journey: {
    status: 'assertions_completed_pending_outer_cleanup', contractId: record.contractId, registrationId: record.registrationId,
    legajo: record.employeeNumber, secondRunId: record.runId, liquidationVersion: 2,
    closeGroupId: record.sourceGroupId, receiptBatchId: fixture.batch.id, receiptSnapshotSha256: fixture.batch.snapshotSha256,
  } };
}

test('actual control validators accept the same version2 journey before outer cleanup without mutating its sources', async () => {
  const input = tailFixture(), before = structuredClone(input);
  const review = await verifiedNativeBankTail(input);
  assert.equal(review.kind, 'control');
  assert.equal(review.recordCount, 1);
  assert.equal(review.rows[0].account.accountType, null);
  assert.equal(review.rows[0].runId, input.journey.secondRunId);
  assert.deepEqual(input, before);
});

for (const [key, value] of [
  ['contractId', otherId], ['registrationId', otherId], ['legajo', 'OTRO-LEGAJO'], ['secondRunId', otherId],
  ['liquidationVersion', 1], ['closeGroupId', otherId], ['receiptBatchId', otherId], ['receiptSnapshotSha256', '0'.repeat(64)],
]) test('rejects an otherwise valid emission detached from journey.' + key, async () => {
  const input = tailFixture(); input.journey[key] = value;
  await assert.rejects(verifiedNativeBankTail(input));
});

test('rejects missing journey identity before treating the fixture as evidence', async () => {
  const input = tailFixture(); delete input.journey.receiptSnapshotSha256;
  await assert.rejects(verifiedNativeBankTail(input), /QA_NATIVE_BANK_JOURNEY_FIELD/);
});

for (const key of ['remuneration', 'non_remuneration', 'deduction', 'employer_contribution', 'gross', 'net']) {
  test('rejects changed original close aggregate including ' + key + ' after source hashes are refreshed', async () => {
    const input = tailFixture(), totals = input.closes[0].snapshot.totals;
    totals[key] = totals[key] === '999.99' ? '998.99' : '999.99';
    refreshSources(input); input.journey.receiptSnapshotSha256 = input.batch.snapshotSha256;
    await assert.rejects(verifiedNativeBankTail(input));
  });
}

test('rejects a closed employee attached to another run even with refreshed close and emission hashes', async () => {
  const input = tailFixture(); input.closes[0].snapshot.employees[0].runId = otherId;
  refreshSources(input); input.journey.receiptSnapshotSha256 = input.batch.snapshotSha256;
  await assert.rejects(verifiedNativeBankTail(input));
});

test('a consistent version1 source cannot stand in for the second confirmed version', async () => {
  const input = tailFixture(); input.closes[0].snapshot.employees[0].liquidationVersion = 1;
  input.batch.snapshot.records[0].liquidationVersion = 1;
  refreshSources(input); input.journey.receiptSnapshotSha256 = input.batch.snapshotSha256;
  await assert.rejects(verifiedNativeBankTail(input), /QA_NATIVE_BANK_RECORD_CHANGED: liquidationVersion/);
});

for (const [name, change] of [
  ['unapproved emission', f => { f.batch.state = 'prepared'; f.batch.review = null; }],
  ['stale emission', f => { f.batch.sourceCurrent = false; }],
  ['withdrawn download access', f => { f.batch.permissions.canDownload = false; }],
  ['missing original close', f => { f.closes = []; }],
  ['unapproved account configuration', f => { f.accounts.configuration = { ...f.accounts.configuration, revision: 0, definition: null, proposalId: null, approvalId: null }; }],
  ['missing native identity source', f => { f.accounts.sources.contracts = []; }],
]) test('rejects ' + name + ' through actual source validators', async () => {
  const input = tailFixture(); change(input);
  await assert.rejects(verifiedNativeBankTail(input));
});

for (const [net, cents, issue] of [
  ['0.00', '0', 'NON_POSITIVE'], ['1.23000000', '123', null], ['1.23000001', null, 'FRACTIONAL_CENTS'],
]) test('retains original net ' + net + ' and exact nullable cents without rounding', async () => {
  const input = tailFixture(net), review = await verifiedNativeBankTail(input), row = review.rows[0];
  assert.equal(row.net, net); assert.equal(row.cents, cents);
  if (issue) { assert.ok(row.issues.includes(issue)); assert.equal(review.totalCents, null); }
  else assert.equal(BigInt(row.cents), 123n);
});

for (const value of [null, 0]) test('does not coerce invalid raw monetary literal ' + String(value) + ' into string zero', async () => {
  const input = tailFixture(); input.batch.snapshot.records[0].totals.net = value;
  input.batch.snapshotSha256 = ownRunHash(input.batch.snapshot);
  input.journey.receiptSnapshotSha256 = input.batch.snapshotSha256;
  await assert.rejects(verifiedNativeBankTail(input));
});

function actorContext() {
  const actor = { principal: { tenant: { effectiveCapabilities: ['workforce.employee.read', 'payroll.parameter.read'] } }, session: { marker: 'same synthetic session' } };
  let current = { marker: 'prior actor' };
  return { actor, getCurrent: () => current, setCurrent: value => { current = value; } };
}
for (const [capability, permission, other] of [
  ['payroll.parameter.prepare', 'canPropose', 'payroll.parameter.approve'],
  ['payroll.parameter.approve', 'canReview', 'payroll.parameter.prepare'],
]) test('actor exposure follows actual bootstrap ' + permission + ' and restores the prior actor', async () => {
  const context = actorContext(), prior = context.getCurrent(), before = structuredClone(context.actor), bootstrap = tailFixture().accounts;
  bootstrap.permissions = { canPropose: permission === 'canPropose', canReview: permission === 'canReview' };
  const result = await withNativeBankActor({ ...context, bootstrap, capability }, async () => {
    const selected = context.getCurrent(); assert.notEqual(selected, context.actor);
    assert.ok(selected.principal.tenant.effectiveCapabilities.includes(capability));
    assert.ok(!selected.principal.tenant.effectiveCapabilities.includes(other));
    await Promise.resolve(); assert.equal(context.getCurrent(), selected);
    return 'observed';
  });
  assert.equal(result, 'observed'); assert.equal(context.getCurrent(), prior); assert.deepEqual(context.actor, before);
});

test('a failed operation restores actor and propagates the original failure', async () => {
  const context = actorContext(), prior = context.getCurrent(), failure = new Error('original failure');
  await assert.rejects(withNativeBankActor({ ...context, bootstrap: tailFixture().accounts, capability: 'payroll.parameter.prepare' }, async () => { await Promise.resolve(); throw failure; }), error => error === failure);
  assert.equal(context.getCurrent(), prior);
});

test('denied or unrelated authority never changes actor or invokes the operation', async () => {
  for (const capability of ['payroll.parameter.prepare', 'payroll.parameter.approve', 'employee.record.create']) {
    const context = actorContext(), prior = context.getCurrent(), bootstrap = tailFixture().accounts;
    bootstrap.permissions = { canPropose: false, canReview: false }; let calls = 0;
    await assert.rejects(withNativeBankActor({ ...context, bootstrap, capability }, () => { calls++; }));
    assert.equal(calls, 0); assert.equal(context.getCurrent(), prior);
  }
});
// Exact SQL-facade transport guard; stub records strings only, never SQL execution.
test('native bank QA adapter preserves legacy delegation and exact bound facades',async()=>{
 const {createNativeBankQaSql}=await import('../scripts/lib/native-employee-bank-tail-qa.mjs');const calls=[],original=[],schema='mc_qa_fixed_092_'+'a'.repeat(32),db={query:async(...args)=>{original.push(args);return 'legacy';},run:async(...args)=>{calls.push(args);return {fixture:true};}},adapter=createNativeBankQaSql(db,{schema});
 const query='SELECT public.own_close_group_v1($1::jsonb,$2::uuid) AS result',values=['{}','10000000-0000-4000-8000-000000000001'];assert.equal(await adapter.query(query,values),'legacy');assert.deepEqual(original,[[query,values]]);
 assert.deepEqual(await adapter.query('SELECT public.own_bank_accounts_bootstrap_v1($1::jsonb) AS result',['{"x":"a\'b"}']),[{result:{fixture:true}}]);assert.equal(calls.length,1);assert.equal(calls[0][1],true);assert.ok(calls[0][0].startsWith('SELECT '+schema+'.own_bank_accounts_bootstrap_v1('));assert.ok(calls[0][0].includes("a''b"));
});
test('native bank QA adapter rejects extra statements, arguments and facade drift',async()=>{
 const {createNativeBankQaSql}=await import('../scripts/lib/native-employee-bank-tail-qa.mjs');let executions=0;const adapter=createNativeBankQaSql({query:()=>{throw Error('legacy must not run');},run:async()=>{executions++;return{};}},{schema:'mc_qa_fixed_092_'+'a'.repeat(32)});
 for(const [query,values]of [['SELECT public.own_bank_accounts_bootstrap_v1($1::jsonb); SELECT evil() AS result',['{}']],['SELECT public.own_bank_accounts_bootstrap_v1($1::jsonb) AS result',['{}','unused']],['SELECT public.own_bank_accounts_bootstrap_v1($1::jsonb /*changed*/) AS result',['{}']],['SELECT public.own_bank_accounts_unknown_v1($1::jsonb) AS result',['{}']]])await assert.rejects(()=>adapter.query(query,values));assert.equal(executions,0);
});

// Pure V2 source fixture: no identity here is used as an existing DB identity.
// The original complete 29-person close remains intact with zero selected rows.
function twoSourceTailFixture() {
  const input = tailFixture(), original = bankOutputFixture(29);
  const record = input.batch.snapshot.records[0], target = input.closes[0], employee = target.snapshot.employees[0];
  const contractId = 'cccccccc-0000-4000-8000-000000000001', registrationId = 'cccccccc-0000-4000-8000-000000000002';
  const runId = 'cccccccc-0000-4000-8000-000000000003', groupId = 'cccccccc-0000-4000-8000-000000000004';
  Object.assign(record, { contractId, registrationId, runId, sourceGroupId: groupId, employeeNumber: '99001' });
  Object.assign(employee, { contractId, runId, employeeNumber: record.employeeNumber });
  employee.totals.contractId = contractId;
  for (const concept of target.snapshot.concepts) Object.assign(concept, { contractId, employeeNumber: record.employeeNumber });
  target.id = groupId; target.groupId = groupId;
  target.body.selection = { kind: 'contracts', values: [contractId] };
  target.bodySha256 = ownRunHash(target.body);
  target.snapshot.selection = structuredClone(target.body.selection);
  target.snapshot.populationCount = 30; target.snapshot.populationComplete = false;
  target.snapshotSha256 = ownRunHash(target.snapshot);
  const source = input.batch.snapshot.sources[0];
  Object.assign(source, { id: groupId, snapshotSha256: target.snapshotSha256, populationCount: 30, selectedCount: 1 });
  input.batch.snapshot.version = 'own-receipt-snapshot.v2';
  input.batch.snapshot.identityBasis = 'owned_registration_verified_at_capture';
  input.batch.snapshot.params.contracts = [contractId];
  input.batch.snapshot.sources = [{ ...original.batch.snapshot.sources[0], selectedCount: 0 }, source];
  input.closes = [original.closes[0], target];
  Object.assign(input.accounts.sources.contracts[0], { contractId, registrationId, employeeNumber: record.employeeNumber });
  input.accounts.sources.contracts = [...original.accounts.sources.contracts, ...input.accounts.sources.contracts];
  input.accounts.configuration.definition.accounts[0].contractId = contractId;
  input.batch.snapshotSha256 = ownRunHash(input.batch.snapshot);
  Object.assign(input.journey, { contractId, registrationId, legajo: record.employeeNumber, secondRunId: runId, closeGroupId: groupId, receiptSnapshotSha256: input.batch.snapshotSha256 });
  return input;
}

test('V2 one-record receipt retains both real-model closes including original29 selectedCount0', async () => {
  const input = twoSourceTailFixture(), before = structuredClone(input);
  const { prepareBankControl, verifiedBankControl } = await import('../assets/own-bank-output-model.js');
  // Prove the fixture is accepted by the actual product model before the QA guard.
  verifiedBankControl(await prepareBankControl(input.batch, input.accounts, input.profile, input.closes));
  assert.equal(input.batch.snapshot.version, 'own-receipt-snapshot.v2');
  assert.deepEqual(input.batch.snapshot.sources.map(source => [source.employeeCount, source.populationCount, source.selectedCount]), [[29, 29, 0], [1, 30, 1]]);
  const review = await verifiedNativeBankTail(input);
  assert.equal(review.rows.length, 1); assert.equal(review.rows[0].contractId, input.journey.contractId);
  assert.equal(review.rows[0].sourceGroupId, input.journey.closeGroupId);
  assert.equal(review.rows[0].liquidationVersion, 2);
  assert.equal(input.closes[0].snapshot.employees.length, 29);
  assert.equal(input.closes[1].snapshot.populationComplete, false);
  assert.deepEqual(input, before);
});

test('V2 target lookup uses exact group identity independently of close collection order', async () => {
  const input = twoSourceTailFixture(); input.closes.reverse(); const before = structuredClone(input);
  const review = await verifiedNativeBankTail(input);
  assert.equal(review.rows[0].closeSha256, input.closes[0].snapshotSha256);
  assert.deepEqual(input, before);
});

for (const [name, change] of [
  ['missing unselected original close', input => { input.closes.shift(); }],
  ['duplicate original in place of target', input => { input.closes[1] = structuredClone(input.closes[0]); }],
  ['corrupted unselected close', input => { input.closes[0].snapshotSha256 = '0'.repeat(64); }],
  ['changed original close outside its pinned source', input => { input.closes[0].snapshot.rosterVersion = '0'.repeat(64); input.closes[0].snapshotSha256 = ownRunHash(input.closes[0].snapshot); }],
  ['false nonzero selection for original29', input => { input.batch.snapshot.sources[0].selectedCount = 1; input.batch.snapshotSha256 = ownRunHash(input.batch.snapshot); input.journey.receiptSnapshotSha256 = input.batch.snapshotSha256; }],
  ['filtered zero-selection source and close', input => { input.batch.snapshot.sources.shift(); input.closes.shift(); input.batch.snapshotSha256 = ownRunHash(input.batch.snapshot); }],
]) test('V2 rejects ' + name + ' without dropping the original29 evidence', async () => {
  const input = twoSourceTailFixture(); change(input);
  await assert.rejects(verifiedNativeBankTail(input));
});

test('Noelia QA declares the existing valid synthetic issuer before creating either receipt snapshot', async () => {
  const source = fs.readFileSync(new URL('../scripts/verify-noelia-payroll-circuit.mjs', import.meta.url), 'utf8');
  const issuers = [...source.matchAll(/taxId:'(\d{11})'/g)].map(match => match[1]);
  assert.equal(issuers.length, 2, 'QA_NATIVE_BANK_BOTH_DECLARED_ISSUERS_REQUIRED');
  for (const issuer of issuers) {
    const input = twoSourceTailFixture();
    input.batch.snapshot.params.issuer.taxId = issuer;
    input.batch.snapshotSha256 = ownRunHash(input.batch.snapshot);
    input.journey.receiptSnapshotSha256 = input.batch.snapshotSha256;
    // Exercise the real complete-source model with the raw pre-emission value.
    await verifiedNativeBankTail(input);
    assert.equal(issuer, syntheticTaxId('3099000000'));
  }
  const invalid = twoSourceTailFixture();
  invalid.batch.snapshot.params.issuer.taxId = '30990000001';
  invalid.batch.snapshotSha256 = ownRunHash(invalid.batch.snapshot);
  invalid.journey.receiptSnapshotSha256 = invalid.batch.snapshotSha256;
  const { prepareBankControl, verifiedBankControl } = await import('../assets/own-bank-output-model.js');
  const review = await prepareBankControl(invalid.batch, invalid.accounts, invalid.profile, invalid.closes);
  assert.ok(review.issues.includes('ISSUER_INVALID'));
  assert.throws(() => verifiedBankControl(review));
  await assert.rejects(verifiedNativeBankTail(invalid));
});

test('bank-only workflow preserves the exact synthetic financial-tail output paths', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/noelia-payroll-circuit.yml', import.meta.url), 'utf8');
  const upload = workflow.slice(workflow.indexOf('      - name: Preserve synthetic evidence even when a check fails'));
  const helper = fs.readFileSync(new URL('../scripts/lib/native-employee-bank-tail-qa.mjs', import.meta.url), 'utf8');
  const browser = fs.readFileSync(new URL('../scripts/lib/noelia-payroll-circuit-browser.mjs', import.meta.url), 'utf8');
  const evidence = ['native-employee-bank-control.csv', 'native-employee-bank-control.xlsx', 'native-bank-tail-source-conservation.json', 'native-bank-installation-source-pins.json', 'native-bank-tail-failure.json'];
  const declared = upload.split(/\r?\n/).filter(line => /^            verification\//.test(line)).map(line => line.trim());
  for (const name of evidence) {
    assert.equal(declared.filter(value => value === 'verification/noelia-circuit-ci/' + name).length, 1, 'QA_NATIVE_BANK_ARTIFACT_PATH_MISSING: ' + name);
  }
  for (const name of evidence.slice(2)) assert.ok(helper.includes("'" + name + "'"), 'QA_NATIVE_BANK_ARTIFACT_PRODUCER_MISSING: ' + name);
  assert.ok(browser.includes("'native-employee-bank-control.'+kind"));
  assert.ok(browser.includes("for(const kind of ['csv','xlsx'])"));
  assert.ok(upload.includes('        if: always()'));
  assert.ok(upload.includes('uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'));
  assert.ok(upload.includes('name: noelia-circuit-pg${{ matrix.major }}-${{ github.sha }}'));
});
