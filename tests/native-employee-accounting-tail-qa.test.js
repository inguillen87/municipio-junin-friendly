import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedNativeAccountingSource, explicitNativeAccountingDefinition, explicitNativeJournalRules, withNativeAccountingActor, createNativeAccountingQaSql } from '../scripts/lib/native-employee-accounting-tail-qa.mjs';
import { verifiedNativeBankTail } from '../scripts/lib/native-employee-bank-tail-qa.mjs';
import { bankOutputFixture, syntheticNet } from './fixtures/own-bank-output-synthetic.js';
import { syntheticAccountingBootstrap } from './fixtures/own-payroll-accounting-synthetic.js';
import { runCommand } from './fixtures/own-payroll-run-synthetic.js';
import { imputationWorkspaceFixture } from './fixtures/own-payroll-imputation-synthetic.js';
import { ownRunHash } from '../lib/internal-own-payroll-run.js';
import { accountingBootstrap, accountingHash } from '../assets/own-payroll-accounting-model.js';
import { verifiedImputation, imputationSourceHashValue, IMPUTATION_SOURCE_VERSION } from '../assets/own-payroll-imputation-model.js';
import { IMPUTATION_VERSION } from '../assets/own-payroll-imputation-workspace-model.js';
import { JOURNAL_VERSION, JOURNAL_SOURCE_VERSION, journalSourceHashValue, calculateJournal, journalSource } from '../assets/own-payroll-journal-model.js';

const ids = { contract: 'cccccccc-0000-4000-8000-000000000001', registration: 'cccccccc-0000-4000-8000-000000000002', run: 'cccccccc-0000-4000-8000-000000000003', close: 'cccccccc-0000-4000-8000-000000000004' };
const totals = ['remuneration', 'non_remuneration', 'deduction', 'employer_contribution', 'gross', 'net'];

// Pure manufactured model input, never a response fixture or an existing DB ID.
// Keep the complete original29 close beside the new one-person V2 close.
async function sourceFixture(net) {
  const target = bankOutputFixture(1), original = bankOutputFixture(29);
  if (net !== undefined) syntheticNet(target, net);
  const record = target.batch.snapshot.records[0], close = target.closes[0], employee = close.snapshot.employees[0];
  Object.assign(record, { contractId: ids.contract, registrationId: ids.registration, runId: ids.run, sourceGroupId: ids.close, employeeNumber: '99001', departmentCode: '20', liquidationVersion: 2 });
  Object.assign(employee, { contractId: ids.contract, runId: ids.run, employeeNumber: '99001', departmentCode: '20', liquidationVersion: 2 });
  employee.totals.contractId = ids.contract;
  for (const concept of close.snapshot.concepts) Object.assign(concept, { contractId: ids.contract, employeeNumber: '99001', departmentCode: '20' });
  close.id = ids.close; close.groupId = ids.close;
  close.body.selection = { kind: 'contracts', values: [ids.contract] };
  close.bodySha256 = ownRunHash(close.body); close.snapshot.selection = structuredClone(close.body.selection);
  close.snapshot.populationCount = 30; close.snapshot.populationComplete = false;
  close.snapshotSha256 = ownRunHash(close.snapshot);
  Object.assign(target.batch.snapshot.sources[0], { id: ids.close, snapshotSha256: close.snapshotSha256, populationCount: 30, selectedCount: 1 });
  target.batch.snapshot.version = 'own-receipt-snapshot.v2'; target.batch.snapshot.identityBasis = 'owned_registration_verified_at_capture';
  target.batch.snapshot.params.contracts = [ids.contract];
  target.batch.snapshot.sources = [{ ...original.batch.snapshot.sources[0], selectedCount: 0 }, target.batch.snapshot.sources[0]];
  target.closes = [original.closes[0], close];
  Object.assign(target.accounts.sources.contracts[0], { contractId: ids.contract, registrationId: ids.registration, employeeNumber: '99001' });
  target.accounts.sources.contracts = [...original.accounts.sources.contracts, ...target.accounts.sources.contracts];
  target.accounts.configuration.definition.accounts[0].contractId = ids.contract;
  target.batch.snapshotSha256 = ownRunHash(target.batch.snapshot);
  const journey = { status: 'assertions_completed_pending_outer_cleanup', contractId: ids.contract, registrationId: ids.registration, legajo: '99001', secondRunId: ids.run, liquidationVersion: 2, closeGroupId: ids.close, receiptBatchId: target.batch.id, receiptSnapshotSha256: target.batch.snapshotSha256 };
  const sources = { batch: target.batch, accounts: target.accounts, closes: target.closes }, profile = { currency: 'ARS', creditDate: '2026-10-09' };
  const review = await verifiedNativeBankTail({ journey, ...sources, profile });
  const bankTail = { contractId: ids.contract, registrationId: ids.registration, runId: ids.run, liquidationVersion: 2, closeGroupId: ids.close, closeSnapshotSha256: close.snapshotSha256, receiptBatchId: target.batch.id, receiptSnapshotSha256: target.batch.snapshotSha256, receiptSources: structuredClone(target.batch.snapshot.sources), sixTotals: structuredClone(record.totals), profile, controlFingerprint: review.fingerprint };
  return { journey, sources, bankTail };
}

function bootstrapFor(context) {
  const boot = syntheticAccountingBootstrap();
  boot.sources.departments = [{ code: '20', label: 'Reparticion exclusivamente sintetica' }];
  boot.sources.contracts = [{ contractId: context.journey.contractId, registrationId: context.journey.registrationId, employeeNumber: context.journey.legajo, name: context.record.name }];
  boot.sources.concepts = context.record.concepts.filter(c => c.nature !== 'auxiliary').map(c => ({ agreementCode: '1', code: c.code, nature: c.nature, label: c.label, validFrom: '2026-10', validUntil: null }));
  return accountingBootstrap(boot);
}

async function previewFor(context, configuration) {
  const group = structuredClone(context.close), body = runCommand({ version: 'own-payroll-run-command.v2', liquidationDate: '2026-10-31', selection: { kind: 'contracts', values: [ids.contract] } });
  const source = { version: IMPUTATION_SOURCE_VERSION, scopeVersion: 'e'.repeat(64), fiscalYear: '2026', group, state: 'closed', configuration: configuration ?? { version: 'c'.repeat(64), revision: 0, definition: null, proposalId: null, approvalId: null }, dateSources: [{ runId: ids.run, body, bodySha256: await accountingHash(body), inputSha256: group.snapshot.employees[0].inputSha256 }], sourceVersion: '0'.repeat(64), complete: true };
  source.sourceVersion = await accountingHash(imputationSourceHashValue(source));
  const allocation = await verifiedImputation(source);
  return { version: IMPUTATION_VERSION, source, allocation, allocationSha256: await accountingHash(allocation), revision: 0 };
}

async function approvedSourceFixture(net) {
  const input = await sourceFixture(net), context = await verifiedNativeAccountingSource(input), boot = bootstrapFor(context), definition = explicitNativeAccountingDefinition(boot, context);
  const preview = await previewFor(context, { version: 'c'.repeat(64), revision: 1, definition, proposalId: 'cccccccc-0000-4000-8000-000000000005', approvalId: 'cccccccc-0000-4000-8000-000000000006' });
  const fixture = await imputationWorkspaceFixture(2), detail = fixture.detail;
  detail.scopeVersion = preview.source.scopeVersion; detail.source = preview.source; detail.allocation = preview.allocation; detail.allocationSha256 = preview.allocationSha256;
  Object.assign(detail.body, { groupId: ids.close, scopeVersion: detail.scopeVersion, sourceVersion: preview.source.sourceVersion, allocationSha256: preview.allocationSha256 });
  Object.assign(detail.proposal, { groupId: ids.close, sourceVersion: preview.source.sourceVersion, allocationSha256: preview.allocationSha256, requestSha256: await accountingHash(detail.body), employeeCount: 1, conceptCount: 6, status: 'approved', decision: { command: 'approve', reason: 'Revision independiente exclusivamente sintetica', actorLabel: 'Revisor sintetico', recordedAt: '2026-10-31T12:00:00Z', revision: 1 } });
  const source = { version: JOURNAL_SOURCE_VERSION, scopeVersion: detail.scopeVersion, basis: 'imputation', imputation: detail, original: null, sourceVersion: '0'.repeat(64), complete: true };
  source.sourceVersion = await accountingHash(journalSourceHashValue(source));
  await journalSource(source);
  return { input, context, boot, definition, preview, source };
}

test('preserves both complete sources and original six raw concepts/totals before outer cleanup', async () => {
  const input = await sourceFixture(), before = structuredClone(input), value = await verifiedNativeAccountingSource(input);
  assert.deepEqual(value.sources, input.sources); assert.equal(value.close.groupId, ids.close);
  assert.deepEqual(value.sources.batch.snapshot.sources.map(s => [s.employeeCount, s.populationCount, s.selectedCount]), [[29, 29, 0], [1, 30, 1]]);
  assert.equal(value.sources.closes[0].snapshot.employees.length, 29);
  assert.equal(value.record.concepts.length, 6); assert.deepEqual(new Set(value.record.concepts.map(c => c.nature)), new Set(['remuneration', 'non_remuneration', 'deduction', 'employer_contribution', 'auxiliary']));
  assert.deepEqual(Object.keys(value.record.totals), totals); assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(value.sources.closes[0].snapshot));
});

test('selects target by group UUID with reversed close and receipt-source collections', async () => {
  const input = await sourceFixture(); input.sources.closes.reverse(); input.sources.batch.snapshot.sources.reverse();
  input.sources.batch.snapshotSha256 = ownRunHash(input.sources.batch.snapshot); input.journey.receiptSnapshotSha256 = input.sources.batch.snapshotSha256;
  input.bankTail.receiptSnapshotSha256 = input.sources.batch.snapshotSha256; input.bankTail.receiptSources = structuredClone(input.sources.batch.snapshot.sources);
  input.bankTail.controlFingerprint = (await verifiedNativeBankTail({ journey: input.journey, ...input.sources, profile: input.bankTail.profile })).fingerprint;
  const value = await verifiedNativeAccountingSource(input); assert.equal(value.close.groupId, ids.close); assert.equal(value.sources.closes[1].snapshot.employeeCount, 29);
});

for (const [name, mutate] of [
  ['original29 omitted', f => { f.sources.batch.snapshot.sources.shift(); f.sources.closes.shift(); }],
  ['unselected original corrupted', f => { f.sources.closes[0].snapshot.rosterVersion = '0'.repeat(64); }],
  ['bank prior zero selection omitted', f => { f.bankTail.receiptSources.shift(); }],
  ['bank UUID detached', f => { f.bankTail.contractId = f.journey.registrationId; }],
  ['bank registration detached', f => { f.bankTail.registrationId = f.journey.contractId; }],
  ['bank second run detached', f => { f.bankTail.runId = f.journey.contractId; }],
  ['bank version1', f => { f.bankTail.liquidationVersion = 1; }],
  ['bank target changed', f => { f.bankTail.closeGroupId = f.sources.closes[0].groupId; }],
  ['bank last total changed', f => { f.bankTail.sixTotals.net = '999.99'; }],
]) test('rejects ' + name + ' without filtering evidence', async () => {
  const input = await sourceFixture(); mutate(input); await assert.rejects(verifiedNativeAccountingSource(input));
});

for (const [net, cents] of [['0.00', '0'], ['1.23000001', null]]) test('retains raw ' + net + ' and distinct nullable bank cents', async () => {
  const value = await verifiedNativeAccountingSource(await sourceFixture(net));
  assert.equal(value.record.totals.net, net); assert.equal(value.bankReview.rows[0].cents, cents);
  assert.equal(value.bankReview.rows[0].account.accountType, null);
});

test('optional unconfigured preview keeps six rows and auxiliary without claiming ready', async () => {
  const input = await sourceFixture(), context = await verifiedNativeAccountingSource(input), preview = await previewFor(context);
  assert.equal(preview.allocation.ready, false); assert.deepEqual(preview.allocation.globalIssues, ['configuration_required']);
  const result = await verifiedNativeAccountingSource({ ...input, preview });
  assert.equal(result.preview.allocation.rows.length, 6); assert.equal(result.preview.allocation.rows.find(r => r.conceptCode === '900').state, 'auxiliary');
  assert.equal(result.preview.allocation.ready, false);
});

test('rejects a valid rehashed date source for another declared liquidation date', async () => {
  const input = await sourceFixture(), context = await verifiedNativeAccountingSource(input), preview = await previewFor(context);
  preview.source.dateSources[0].body.liquidationDate = '2026-10-30'; preview.source.dateSources[0].bodySha256 = await accountingHash(preview.source.dateSources[0].body);
  preview.source.sourceVersion = await accountingHash(imputationSourceHashValue(preview.source)); preview.allocation = await verifiedImputation(preview.source); preview.allocationSha256 = await accountingHash(preview.allocation);
  await assert.rejects(verifiedNativeAccountingSource({ ...input, preview }), /DECLARED_LIQUIDATION_DATE/);
});

test('finite accounting definition maps all five monetary codes and only the actual new UUID', async () => {
  const context = await verifiedNativeAccountingSource(await sourceFixture()), boot = bootstrapFor(context), before = structuredClone(boot), definition = explicitNativeAccountingDefinition(boot, context);
  assert.deepEqual(definition.mappings.map(r => r.conceptCode), ['100', '110', '120', '210', '310']);
  for (const row of definition.mappings) {
    assert.deepEqual([row.fiscalYear, row.jurisdictionCode, row.agreementCode, row.departmentCode, row.validFrom, row.validUntil], ['2026', '42', '1', '20', '2026-10-01', '2026-10-31']);
    assert.equal(row.accountingAccountReference, 'CUENTA-PRINCIPAL-SINTETICA-' + row.conceptCode); assert.equal(row.bankAccountReference, null);
  }
  assert.equal(definition.assignments.length, 1); assert.equal(definition.assignments[0].contractId, ids.contract); assert.equal(definition.assignments[0].conceptCode, null); assert.equal(definition.assignments[0].validUntil, null);
  assert.equal(context.record.concepts.find(c => c.code === '900').nature, 'auxiliary'); assert.deepEqual(boot, before);
});

for (const [name, mutate] of [
  ['missing approved mapping concept', b => { b.sources.concepts = b.sources.concepts.filter(r => r.code !== '310'); }],
  ['other actor denied', b => { b.permissions.canPropose = false; }],
  ['other registration', b => { b.sources.contracts[0].registrationId = ids.run; }],
  ['different raw department20', b => { b.sources.departments[0].code = '020'; }],
]) test('definition rejects ' + name + ' through actual typed sources', async () => {
  const context = await verifiedNativeAccountingSource(await sourceFixture()), boot = bootstrapFor(context); mutate(boot);
  assert.throws(() => explicitNativeAccountingDefinition(boot, context));
});

test('raw auxiliary removal and raw NULL/number totals cannot become a valid context', async () => {
  const context = await verifiedNativeAccountingSource(await sourceFixture());
  for (const change of [c => { c.record.concepts.pop(); }, c => { c.record.totals.net = null; }, c => { c.record.totals.net = 0; }]) {
    const altered = structuredClone(context); change(altered); assert.throws(() => explicitNativeAccountingDefinition(bootstrapFor(context), altered));
  }
});

test('definition preserves earlier approved history and refuses replacement under the same key', async () => {
  const context = await verifiedNativeAccountingSource(await sourceFixture()), boot = bootstrapFor(context), definition = explicitNativeAccountingDefinition(boot, context);
  const historical = { ...definition.mappings[0], validFrom: '2026-01-01', validUntil: '2026-09-30', accountingAccountReference: 'CUENTA-HISTORICA-SINTETICA' };
  boot.configuration = { ...boot.configuration, revision: 1, definition: { mappings: [historical], assignments: [] }, proposalId: ids.run, approvalId: ids.close };
  const result = explicitNativeAccountingDefinition(boot, context); assert.deepEqual(result.mappings.find(r => r.validFrom === historical.validFrom), historical);
  boot.configuration.definition = structuredClone(definition); boot.configuration.definition.mappings[0].accountingAccountReference = 'OTRA-CUENTA';
  assert.throws(() => explicitNativeAccountingDefinition(boot, context), /EXISTING_POLICY_CHANGED/);
});

test('journal uses explicit concept/account rules for every group and actual model yields two entries each', async () => {
  const { context, source } = await approvedSourceFixture(), before = structuredClone(source), rules = await explicitNativeJournalRules(source, context), result = await calculateJournal(source, '2026-10-31', rules);
  assert.equal(rules.length, 5); assert.equal(result.ready, true); assert.equal(result.entries.length, 10);
  for (const [i, group] of source.imputation.allocation.groups.entries()) {
    const code = group.destination.conceptCode, expectedSide = { '100': 'debit', '110': 'debit', '120': 'debit', '210': 'credit', '310': 'debit' }[code];
    assert.equal(rules[i].side, expectedSide); assert.equal(rules[i].counterAccountReference, 'CONTRAPARTIDA-SINTETICA-' + code);
    assert.equal(rules[i].documentReference, 'Documento exclusivamente sintetico del par ' + code);
    assert.equal(result.entries.filter(e => e.groupOrdinal === i + 1).length, 2);
  }
  assert.deepEqual(result.sourceTotals, context.record.totals); assert.deepEqual(source, before);
  assert.equal(result.auxiliaryCount, 1); assert.equal(source.imputation.allocation.rows.find(r => r.conceptCode === '900').destination, null);
});

test('journal retains exact zero amounts and declared sides without inventing movements for auxiliary', async () => {
  const { context, source } = await approvedSourceFixture('0.00'), rules = await explicitNativeJournalRules(source, context), result = await calculateJournal(source, '2026-10-31', rules);
  assert.equal(result.entries.length, 10); assert.equal(result.sourceTotals.net, '0.00');
  assert.ok(result.entries.every(e => e.amount === '0.00')); assert.equal(result.totals.debit, '0.00'); assert.equal(result.totals.credit, '0.00');
});

test('journal refuses subcent allocation incidents without rounding or omitting the source', async () => {
  const input = await sourceFixture('1.23000001'), context = await verifiedNativeAccountingSource(input), definition = explicitNativeAccountingDefinition(bootstrapFor(context), context), preview = await previewFor(context, { version: 'c'.repeat(64), revision: 1, definition, proposalId: ids.run, approvalId: ids.close });
  assert.equal(preview.allocation.ready, false); assert.ok(preview.allocation.issues.some(i => i.code === 'fractional_cent'));
  assert.equal(preview.allocation.sourceTotals.net, '1.23000001');
});

for (const [name, mutate] of [
  ['unapproved', s => { s.imputation.proposal.status = 'pending'; s.imputation.proposal.decision = null; }],
  ['stale', s => { s.imputation.sourceCurrent = false; }],
  ['changed raw last total', s => { s.imputation.allocation.sourceTotals.net = '999.99'; }],
  ['missing sixth raw row', s => { s.imputation.allocation.rows.pop(); }],
  ['unknown primary account', s => { s.imputation.source.configuration.definition.mappings[0].accountingAccountReference = 'OTRA-CUENTA'; }],
]) test('journal rejects ' + name + ' rather than using incomplete proof', async () => {
  const { context, source } = await approvedSourceFixture(); mutate(source); await assert.rejects(explicitNativeJournalRules(source, context));
});

test('journal rejects a fully rehashed approved source with a different explicit primary account', async () => {
  const f = await approvedSourceFixture(), s = f.source.imputation.source, d = f.source.imputation;
  s.configuration.definition.mappings[0].accountingAccountReference = 'CUENTA-DISTINTA-VALIDA';
  s.sourceVersion = await accountingHash(imputationSourceHashValue(s)); d.allocation = await verifiedImputation(s); d.allocationSha256 = await accountingHash(d.allocation);
  Object.assign(d.body, { sourceVersion: s.sourceVersion, allocationSha256: d.allocationSha256 }); Object.assign(d.proposal, { sourceVersion: s.sourceVersion, allocationSha256: d.allocationSha256, requestSha256: await accountingHash(d.body) });
  f.source.sourceVersion = await accountingHash(journalSourceHashValue(f.source)); await journalSource(f.source);
  await assert.rejects(explicitNativeJournalRules(f.source, f.context), /EXPLICIT_JOURNAL_DESTINATION_REQUIRED/);
});

function actorContext() {
  const actor = { principal: { tenant: { effectiveCapabilities: ['payroll.parameter.read'] } }, session: { marker: 'synthetic session' } }; let current = { marker: 'other prior actor' };
  return { actor, getCurrent: () => current, setCurrent: value => { current = value; } };
}
async function actorBootstrap(kind) {
  if (kind === 'accounting') return syntheticAccountingBootstrap();
  if (kind === 'imputation') return (await imputationWorkspaceFixture(2)).boot;
  return { version: JOURNAL_VERSION, scopeVersion: 'a'.repeat(64), period: '2026-10', liquidationType: 'monthly', imputations: [], journals: [], permissions: { canPropose: true, canPost: true }, complete: true, paymentExecuted: false };
}
for (const [kind, permission] of [['accounting', 'canPropose'], ['accounting', 'canReview'], ['imputation', 'canPropose'], ['imputation', 'canReview'], ['journal', 'canPropose'], ['journal', 'canPost']]) test('actor ' + kind + '.' + permission + ' follows typed bootstrap and restores original actor', async () => {
  const context = actorContext(), bootstrap = await actorBootstrap(kind), prior = context.getCurrent(), before = structuredClone(context.actor); bootstrap.permissions[permission] = true;
  const capability = permission === 'canPropose' ? 'payroll.parameter.prepare' : 'payroll.parameter.approve', other = permission === 'canPropose' ? 'payroll.parameter.approve' : 'payroll.parameter.prepare';
  assert.equal(await withNativeAccountingActor({ ...context, bootstrap, kind, permission }, async () => { const selected = context.getCurrent(); assert.notEqual(selected, context.actor); assert.ok(selected.principal.tenant.effectiveCapabilities.includes(capability)); assert.ok(!selected.principal.tenant.effectiveCapabilities.includes(other)); return 'observed'; }), 'observed');
  assert.equal(context.getCurrent(), prior); assert.deepEqual(context.actor, before);
});

test('denied, mismatched kind/permission and wrong typed bootstrap never expose another actor authority', async () => {
  for (const [kind, permission, bootstrap] of [['accounting', 'canPropose', { ...syntheticAccountingBootstrap(), permissions: { canPropose: false, canReview: false } }], ['accounting', 'canPost', syntheticAccountingBootstrap()], ['journal', 'canReview', await actorBootstrap('journal')], ['journal', 'canPost', syntheticAccountingBootstrap()], ['unknown', 'canPropose', syntheticAccountingBootstrap()]]) {
    const context = actorContext(), prior = context.getCurrent(); let calls = 0;
    await assert.rejects(withNativeAccountingActor({ ...context, bootstrap, kind, permission }, () => { calls++; })); assert.equal(calls, 0); assert.equal(context.getCurrent(), prior);
  }
});
test('actor restores prior identity after async failure and relays the same error', async () => {
  const context = actorContext(), prior = context.getCurrent(), failure = new Error('synthetic operation failure');
  await assert.rejects(withNativeAccountingActor({ ...context, bootstrap: syntheticAccountingBootstrap(), kind: 'accounting', permission: 'canPropose' }, async () => { await Promise.resolve(); throw failure; }), error => error === failure);
  assert.equal(context.getCurrent(), prior);
});

test('SQL adapter supports exactly the fourteen real facades with strings, escaped literals and fixed schema; legacy unchanged', async () => {
  const calls = [], legacy = [], schema = 'mc_qa_fixed_092_' + 'a'.repeat(32), adapter = createNativeAccountingQaSql({ query: async (...args) => { legacy.push(args); return 'legacy'; }, run: async (...args) => { calls.push(args); return { syntheticCapture: true }; } }, { schema });
  const contracts = [
    ['accounting', 'bootstrap', ['jsonb']], ['accounting', 'detail', ['jsonb', 'uuid']], ['accounting', 'attempt', ['jsonb', 'uuid']], ['accounting', 'command', ['jsonb', 'jsonb', 'uuid']],
    ['imputation', 'bootstrap', ['jsonb', 'text', 'text']], ['imputation', 'source', ['jsonb', 'uuid', 'text']], ['imputation', 'detail', ['jsonb', 'uuid']], ['imputation', 'attempt', ['jsonb', 'uuid']], ['imputation', 'command', ['jsonb', 'jsonb', 'uuid']],
    ['journal', 'bootstrap', ['jsonb', 'text', 'text']], ['journal', 'source', ['jsonb', 'text', 'uuid']], ['journal', 'detail', ['jsonb', 'uuid']], ['journal', 'attempt', ['jsonb', 'uuid']], ['journal', 'command', ['jsonb', 'jsonb', 'uuid']],
  ];
  for (const [family, name, types] of contracts) {
    const values = types.map((_, i) => i === 0 ? '{"literal":"a\'b public.own_journal_ $2"}' : 'synthetic-' + i), query = 'SELECT public.own_' + family + '_' + name + '_v1(' + types.map((type, i) => '$' + (i + 1) + '::' + type).join(',') + ') AS result';
    assert.deepEqual(await adapter.query(query, values), [{ result: { syntheticCapture: true } }]);
    const [sql, json] = calls.at(-1); assert.equal(json, true); assert.ok(sql.startsWith('SELECT ' + schema + '.own_' + family + '_' + name + '_v1('));
    assert.ok(sql.includes("a''b public.own_journal_ $2"));
  }
  assert.equal(calls.length, 14);
  const query = 'SELECT public.own_close_group_v1($1::jsonb,$2::uuid) AS result', values = ['{}', ids.close]; assert.equal(await adapter.query(query, values), 'legacy'); assert.deepEqual(legacy, [[query, values]]);
});

test('SQL facade rejects malformed/multiple/unknown RPCs and unsafe arity/types before capture', async () => {
  let calls = 0, legacy = 0; const adapter = createNativeAccountingQaSql({ query: () => { legacy++; }, run: () => { calls++; } }, { schema: 'mc_qa_fixed_092_' + 'a'.repeat(32) });
  const valid = 'SELECT public.own_accounting_bootstrap_v1($1::jsonb) AS result';
  for (const [query, values] of [[valid + '; SELECT evil()', ['{}']], [' ' + valid, ['{}']], [valid.replace('public.', 'other.'), ['{}']], [valid.replace('bootstrap', 'unknown'), ['{}']], [valid.replace('::jsonb', '::text'), ['{}']], [valid, ['{}', 'extra']], [valid, [null]], [valid, [0]], [valid, new Array(1)], [valid, Object.assign(['{}'], { secret: 'never inserted' })]]) await assert.rejects(adapter.query(query, values));
  assert.equal(calls, 0); assert.equal(legacy, 0);
  assert.throws(() => createNativeAccountingQaSql({}, { schema: 'public' }));
});


import AT_fs from 'node:fs';
import AT_path from 'node:path';
import {fileURLToPath as AT_fileURLToPath} from 'node:url';
import {installNativeAccountingTailQa} from '../scripts/lib/native-employee-accounting-tail-qa.mjs';
import {SQL147_SHA256} from '../scripts/lib/own-accounting-installation.mjs';
import {SQL148_SHA256} from '../scripts/lib/own-imputation-installation.mjs';
import {SQL152_SHA256} from '../scripts/lib/own-journal-installation.mjs';
import {noeliaCircuitEndpoint} from '../scripts/lib/noelia-payroll-circuit-browser.mjs';
const AT_testRoot=AT_fileURLToPath(new URL('../',import.meta.url));
function AT_installProof(index){
 const [version,migrationSha256,newFunctions,runtimeFacades]=[['own-accounting-installation.v1',SQL147_SHA256,13,4],['own-imputation-installation.v1',SQL148_SHA256,11,5],['own-journal-installation.v1',SQL152_SHA256,13,5]][Math.floor(index/2)];
 const proof={version,sourceCommit:'a'.repeat(40),migrationSha256,newTables:1,newFunctions,runtimeFacades,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,eventRows:0,preservationSha256:'b'.repeat(64)};
 return index%2?proof:{...proof,beforeFingerprint:proof.preservationSha256};
}
function AT_installOutput(){const parent=AT_path.join(AT_testRoot,'verification','native-accounting-tail-pure');AT_fs.mkdirSync(parent,{recursive:true});return AT_fs.mkdtempSync(AT_path.join(parent,'case-'));}
test('canonical accounting installers retain147 then148 then152 and independent zero-event proofs before writes',async()=>{
 const calls=[],output=AT_installOutput(),proofs=await installNativeAccountingTailQa({db:{run:async sql=>{calls.push(sql);return AT_installProof(calls.length-1);}},qa:{normalized:s=>s},sourceCommit:'a'.repeat(40),output});
 assert.equal(calls.length,6);assert.deepEqual(proofs.map(p=>p.major),[147,148,152]);
 for(const [i,[code,table]]of [['ACCOUNTING','own_payroll_accounting_event'],['IMPUTATION','own_payroll_imputation_event'],['JOURNAL','own_payroll_journal_event']].entries()){
  assert.ok(calls[i*2].includes(code+'_PREREQUISITE_METADATA'));assert.ok(calls[i*2].includes('CREATE TABLE public.'+table));
  assert.ok(calls[i*2+1].includes(code+'_PREREQUISITE_METADATA'));assert.ok(!calls[i*2+1].includes('CREATE TABLE'));
  assert.equal(proofs[i].installed.eventRows,0);assert.equal(proofs[i].durable.eventRows,0);
 }
});
test('rejected first durable accounting proof stops before148 and152 instead of inventing an installation pass',async()=>{
 const calls=[],output=AT_installOutput();await assert.rejects(installNativeAccountingTailQa({db:{run:async sql=>{calls.push(sql);return calls.length===2?{...AT_installProof(1),eventRows:1}:AT_installProof(0);}},qa:{normalized:s=>s},sourceCommit:'a'.repeat(40),output}));
 assert.equal(calls.length,2);assert.equal(AT_fs.existsSync(AT_path.join(output,'native-accounting-installation-147-proof.json')),false);assert.equal(AT_fs.existsSync(AT_path.join(output,'native-accounting-installation-148.sql')),false);
});
test('accounting appendix custody contains both actual exports, source conservation, all3 pins and failure path',()=>{
 const workflow=AT_fs.readFileSync(AT_path.join(AT_testRoot,'.github/workflows/noelia-payroll-circuit.yml'),'utf8');
 for(const name of ['native-employee-imputation.csv','native-employee-journal.csv','native-accounting-tail-source-conservation.json','native-accounting-installation-147-source-pins.json','native-accounting-installation-148-source-pins.json','native-accounting-installation-152-source-pins.json','native-accounting-tail-failure.json'])assert.equal(workflow.split('verification/noelia-circuit-ci/'+name).length,2,name);
 assert.ok(workflow.includes('verification/noelia-circuit-ci/*-proof.json'));assert.ok(workflow.includes('verification/noelia-circuit-ci/*.png'));
});
test('the same loopback browser server resolves all3 canonical accounting endpoints and no alias',()=>{
 for(const kind of ['accounting','imputation','journal'])assert.equal(noeliaCircuitEndpoint('/api/internal-own-payroll-'+kind),kind);
 assert.equal(noeliaCircuitEndpoint('/api/internal-own-payroll-accounting-extra'),null);
});
