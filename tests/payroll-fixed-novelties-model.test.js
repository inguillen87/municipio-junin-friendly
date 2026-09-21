import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { FIXED_MAX_ROWS, fixedBootstrap, fixedEmployee, fixedList, fixedDetail, fixedReceipt, fixedForm, fixedAmount, fixedMoney, fixedMoneyInput, fixedText, fixedPeriod, fixedCoverage, fixedState, fixedView, fixedExportData, fixedPrincipalKey, fixedCapability } from '../assets/payroll-fixed-novelties-model.js';
import { fixedCsv, fixedXlsx } from '../assets/payroll-fixed-novelties-export.js';
import { fixedFixture, fixedApprovedRecord, fixedSubject, fixedUuid } from './fixtures/payroll-fixed-novelties-synthetic.js';

// All evidence is generated in memory. This suite never contacts the API or DB.
const wrap = data => ({ ok: true, data });
const fields = (extra = {}) => ({ legajo: '1001', conceptSourceId: '27', costCenterSourceId: '', payrollType: 'monthly', quantityDecimal: '1', amountArs: '', forced: false, forcedReason: '', legalInstrument: 'Resolución sintética QA', validFrom: '2026-09-15', validTo: '', reason: 'Alta sintética documentada', ...extra });
const fixture = (count = 1) => { const f = fixedFixture(); f.state.records = Array.from({ length: count }, (_, i) => fixedApprovedRecord(i)); return f; };
const validated = f => fixedList(wrap(f.list('2026-09-01')), '2026-09-01');
const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)])) : value;
function propose(f, row, operation = 'set', changes = {}) {
  f.state.role = 'preparer';
  if (row && !f.state.histories.has(row.id)) f.state.histories.set(row.id, [row.latest]);
  const draft = fixedForm(fields(changes)), subject = row?.subject || fixedSubject(draft.legajo);
  const payload = { recordId: row?.id ?? null, expectedVersion: row?.version ?? 0, contractId: subject.contractId, legajo: subject.legajo, identityToken: subject.identityToken, operation, values: operation === 'set' ? draft.values : null, reason: draft.reason };
  const result = f.mutate('propose', payload, fixedUuid(70000 + f.state.sequence)); assert.equal(result.status, 201);
  return fixedReceipt(wrap(result.data), 'propose');
}
function review(f, row, decision) {
  f.state.role = 'reviewer';
  const result = f.mutate('review', { recordId: row.id, proposalId: row.pending.id, expectedVersion: row.version, decision, reason: 'Cotejo independiente sintético' }, fixedUuid(80000 + row.version));
  assert.equal(result.status, 201); return fixedReceipt(wrap(result.data), 'review');
}

test('declared codes and civil dates are explicit; empty optional values remain absent', () => {
  const draft = fixedForm(fields());
  assert.equal(draft.values.conceptSourceId, '27'); assert.equal(draft.values.costCenterSourceId, null);
  assert.equal(draft.values.validFrom, '2026-09-15'); assert.equal(draft.values.validTo, null); assert.equal(draft.values.amountCents, null);
  assert.throws(() => fixedForm(fields({ conceptSourceId: '' }))); assert.throws(() => fixedForm(fields({ validFrom: '' })));
  assert.throws(() => fixedForm(fields({ legajo: '01001' }))); assert.throws(() => fixedForm(fields({ payrollType: '' })));
  assert.equal(Object.isFrozen(draft.values), true);
});
test('null differs from zero and exact signed money never passes through floating point', () => {
  assert.equal(fixedAmount(''), null); assert.equal(fixedAmount('0'), '0'); assert.equal(fixedAmount('0,01'), '1');
  assert.equal(fixedAmount('-123,45'), '-12345'); assert.equal(fixedAmount('9999999999999999,99'), '999999999999999999');
  assert.equal(fixedMoneyInput('-999999999999999999'), '-9999999999999999,99');
  assert.equal(fixedAmount(fixedMoneyInput('999999999999999999')), '999999999999999999');
  assert.match(fixedMoney(null), /Sin importe/); assert.match(fixedMoney('0'), /0,00/);
  for (const amount of ['-0', '-0,00', '1.000,50', '1e4', '12,345', '01', '10000000000000000']) assert.throws(() => fixedAmount(amount), amount);
  assert.throws(() => fixedForm(fields({ quantityDecimal: '', amountArs: '' })));
  assert.equal(fixedForm(fields({ quantityDecimal: '', amountArs: '0' })).values.quantityDecimal, null);
  assert.equal(fixedForm(fields({ quantityDecimal: '0' })).values.quantityDecimal, '0');
});
test('decimal quantities preserve six decimals without inventing totals', () => {
  assert.equal(fixedForm(fields({ quantityDecimal: '-999999999999,123456' })).values.quantityDecimal, '-999999999999.123456');
  for (const quantityDecimal of ['-0', '-0.000', '0.1234567', '1000000000000', '1e3', '1.000,25']) assert.throws(() => fixedForm(fields({ quantityDecimal })));
});
test('forced values require both an explicit amount and a reason; explicit zero is allowed', () => {
  assert.throws(() => fixedForm(fields({ forced: true, forcedReason: 'Respaldo sintético' })));
  assert.throws(() => fixedForm(fields({ forced: true, amountArs: '0', forcedReason: '' })));
  const valid = fixedForm(fields({ forced: true, amountArs: '0', forcedReason: 'Respaldo sintético' }));
  assert.equal(valid.values.amountCents, '0'); assert.equal(valid.values.forced, true);
  assert.equal(fixedForm(fields({ forced: false, forcedReason: 'Texto residual' })).values.forcedReason, null);
});
test('civil validity is inclusive, leap-aware and never prorates stored values', () => {
  assert.throws(() => fixedForm(fields({ validFrom: '2025-02-29' }))); assert.throws(() => fixedForm(fields({ validTo: '2026-09-14' })));
  assert.throws(() => fixedForm(fields({ validFrom: '1899-12-31' }))); assert.throws(() => fixedForm(fields({ validTo: '2101-01-01' })));
  assert.equal(fixedPeriod('2024-02'), '2024-02-01'); assert.throws(() => fixedPeriod('2024-02-02'));
  const value = fixedForm(fields({ validFrom: '2024-02-29', validTo: '2024-02-29', amountArs: '123,45' })).values;
  assert.deepEqual(fixedCoverage(value, '2024-02-01'), { intersects: true, partial: true, label: 'Vigencia parcial · sin prorrateo' });
  assert.equal(fixedCoverage(value, '2024-03-01').intersects, false); assert.equal(value.amountCents, '12345');
  assert.equal(fixedCoverage({ ...value, validFrom: '2024-02-01', validTo: '2024-02-29' }, '2024-02-01').partial, false);
});
test('instrument and reasons are normalized, bounded plain text with no controls', () => {
  assert.equal(fixedText('  Resolucio\u0301n sintética  ', 'instrumento'), 'Resolución sintética');
  for (const value of ['abcd', 'x'.repeat(501), 'linea\nnueva', '<b>texto</b>', 'texto\u0000']) assert.throws(() => fixedText(value, 'motivo'));
  assert.throws(() => fixedForm(fields({ legalInstrument: 'x'.repeat(301) })));
});
test('bootstrap preserves minimum capabilities, employment requirement and exact limits', () => {
  const f = fixture(); f.state.role = 'readonly'; f.state.employmentLinked = false;
  const b = fixedBootstrap(wrap(f.bootstrap())); assert.equal(b.principal.employmentLinked, false);
  assert.equal(b.principal.capabilities.includes('payroll.fixed.prepare'), false); assert.equal(b.limits.maxRecords, FIXED_MAX_ROWS);
  assert.equal(fixedPrincipalKey(b), [f.principal().tenantId, f.principal().membershipId, f.principal().certifiedBindingId].join(':'));
  for (const change of [d => d.limits.maxRecords = 5000, d => d.effects.payrollCalculated = true, d => d.principal.capabilities.push(d.principal.capabilities[0]), d => d.extra = true]) {
    const d = structuredClone(f.bootstrap()); change(d); assert.throws(() => fixedBootstrap(wrap(d)));
  }
});
test('dedicated fixed permissions come from the registry while the monthly host still gates nominal access', () => {
  const read = ['payroll.novelty.read', 'payroll.novelty.nominal.read'];
  const monthly = new Set([...read, 'payroll.novelty.prepare', 'payroll.novelty.approve', 'payroll.novelty.export']);
  const registry = { principal: { capabilities: [...read, 'payroll.fixed.prepare', 'payroll.fixed.approve', 'payroll.novelty.export'] } };
  for (const cap of ['payroll.fixed.prepare', 'payroll.fixed.approve']) {
    assert.equal(monthly.has(cap), false); assert.equal(fixedCapability(registry, monthly, cap), true);
    assert.equal(fixedCapability({ principal: { capabilities: [...monthly] } }, monthly, cap), false);
    assert.equal(fixedCapability(registry, new Set(['payroll.novelty.read']), cap), false);
    assert.equal(fixedCapability({ principal: { capabilities: [cap] } }, monthly, cap), false);
  }
  assert.equal(fixedCapability(registry, monthly, 'payroll.novelty.export'), true);
  assert.equal(fixedCapability(registry, new Set(read), 'payroll.novelty.export'), false);
  assert.equal(fixedCapability(null, monthly, 'payroll.fixed.prepare'), false);
});
test('exact employee lookup preserves historical source precision and rejects mismatched identity', () => {
  const subject = fixedSubject('1001'); subject.sourceCutoff = '2026-09-01T12:00:00.123456Z';
  const response = { version: 'payroll-fixed-employee.v1', subject };
  assert.equal(fixedEmployee(wrap(response), '1001').sourceCutoff, subject.sourceCutoff);
  assert.throws(() => fixedEmployee(wrap(response), '1002'));
  for (const stamp of ['2026-02-30T12:00:00Z', '2026-09-01T24:00:00Z', '2026-09-01T12:00:00.1234567Z']) {
    assert.throws(() => fixedEmployee(wrap({ ...response, subject: { ...subject, sourceCutoff: stamp } }), '1001'));
  }
});
test('list rejects truncation, duplicates, unexpected fields and inconsistent period', () => {
  const f = fixture(2); assert.equal(validated(f).rows.length, 2);
  for (const change of [d => d.total++, d => d.rows.push(d.rows[0]), d => d.rows[0].extra = 'secret', d => d.effects.payrollPosted = true, d => d.periodMonth = null]) {
    const d = structuredClone(f.list('2026-09-01')); change(d); assert.throws(() => fixedList(wrap(d), '2026-09-01'));
  }
  const tooMany = fixture(501); assert.throws(() => validated(tooMany));
  const out = fixture(1); out.state.records[0].latest.values.validFrom = '2027-01-01'; out.state.records[0].latest.values.validTo = null;
  const d = out.list(null); d.periodMonth = '2026-09-01'; assert.throws(() => fixedList(wrap(d), '2026-09-01'));
});
test('a pending correction leaves the last approved values active; rejection preserves them', () => {
  const f = fixture(), row = f.state.records[0], approved = structuredClone(row.approved);
  propose(f, row, 'set', { quantityDecimal: '7', amountArs: '123,45' });
  let checked = validated(f).rows[0]; assert.match(fixedState(checked), /cambio pendiente/); assert.deepEqual(checked.approved, approved);
  assert.equal(checked.pending.values.quantityDecimal, '7');
  let exported = fixedExportData(wrap(f.exporter('2026-09-01')), validated(f)); assert.equal(exported.rows[0].values.quantityDecimal, '1');
  review(f, row, 'reject'); checked = validated(f).rows[0]; assert.equal(checked.pending, null); assert.equal(checked.approved.id, approved.id);
  assert.equal(fixedView(validated(f), { status: 'rejected' }).rows.length, 1);
  exported = fixedExportData(wrap(f.exporter('2026-09-01')), validated(f)); assert.equal(exported.rows[0].values.amountCents, null);
});
test('annulment is a proposal first and removes active export values only after independent approval', () => {
  const f = fixture(), row = f.state.records[0]; propose(f, row, 'annul');
  assert.equal(validated(f).rows[0].pending.values, null); assert.equal(fixedExportData(wrap(f.exporter('2026-09-01')), validated(f)).rows.length, 1);
  review(f, row, 'approve'); const all = fixedList(wrap(f.list(null)));
  assert.equal(fixedState(all.rows[0]), 'Anulada por revisión'); assert.equal(fixedView(all, { status: 'annulled' }).rows.length, 1);
  assert.equal(fixedExportData(wrap(f.exporter('2026-09-01')), validated(f)).rows.length, 0);
});
test('history retains proposals, decisions, exact timestamps and immutable source snapshots', () => {
  const f = fixture(), row = f.state.records[0]; propose(f, row, 'set', { quantityDecimal: '2' }); review(f, row, 'reject');
  propose(f, row, 'set', { quantityDecimal: '3' }); review(f, row, 'approve');
  const raw = f.detail(row.id), checked = fixedDetail(wrap(reverseKeys(raw)), row.id);
  assert.equal(checked.history.length, 3); assert.equal(checked.history[0].proposedAt, '2026-09-21T12:00:00.123456Z');
  assert.equal(checked.history[1].review.decision, 'reject'); assert.equal(checked.history[2].values.quantityDecimal, '1');
  assert.equal(Object.isFrozen(checked.history[0].values), true); assert.throws(() => checked.history[0].values.quantityDecimal = '99');
  for (const change of [d => d.history.reverse(), d => d.history.push(d.history[0]), d => d.history.pop(), d => d.history.splice(1, 1), d => d.history[0].values.quantityDecimal = '9', d => d.history[0].recordId = fixedUuid(999)]) {
    const d = structuredClone(raw); change(d); assert.throws(() => fixedDetail(wrap(d), row.id));
  }
});
test('contradictory reviews, proposal identity and version relationships fail closed', () => {
  for (const change of [
    row => row.latest.review.reviewedBy = row.latest.proposedBy,
    row => row.version++,
    row => row.latest.review.version = 1,
    row => row.approved = null,
    row => row.latest.canReview = true,
    row => { row.identityCurrent = false; row.canPropose = true; },
  ]) { const f = fixture(), d = f.list(null); change(d.rows[0]); assert.throws(() => fixedList(wrap(d))); }
  const f = fixture(); propose(f, f.state.records[0]); const d = f.list(null);
  d.rows[0].pending = { ...d.rows[0].pending, reason: 'Discrepancia inesperada' }; assert.throws(() => fixedList(wrap(d)));
});
test('filtering covers the whole result, normalizes accents and never exports only one page', () => {
  const f = fixture(45), list = validated(f); assert.equal(fixedView(list, { search: 'sintetico' }).rows.length, 45);
  assert.equal(fixedView(list, { search: '1001' }).rows.length, 1); assert.equal(fixedView(list, { status: 'partial' }).rows.length, 45);
  const checked = fixedExportData(wrap(f.exporter('2026-09-01')), list); assert.equal(checked.total, 45);
  const csv = fixedCsv(checked), book = unzipSync(fixedXlsx(checked));
  assert.equal((csv.match(/AGENTE SINTÉTICO/g) || []).length, 45); assert.equal((strFromU8(book['xl/worksheets/sheet1.xml']).match(/<row /g) || []).length, 46);
});
test('export must match the complete consulted snapshot, approved version and source identity', () => {
  const f = fixture(2), list = validated(f), raw = f.exporter('2026-09-01');
  assert.equal(fixedExportData(wrap(reverseKeys(raw)), list).total, 2);
  for (const change of [d => d.snapshotToken = 'a'.repeat(64), d => d.rows[0].version++, d => d.rows[0].proposalId = fixedUuid(99), d => d.rows[0].values.quantityDecimal = '99', d => d.rows[0].subject.employeeName = 'OTRA PERSONA', d => { d.rows.pop(); d.total--; }, d => d.effects.grhMutation = true]) {
    const d = structuredClone(raw); change(d); assert.throws(() => fixedExportData(wrap(d), list));
  }
  f.state.records[0].identityCurrent = false; assert.throws(() => fixedExportData(wrap(f.exporter('2026-09-01')), validated(f)));
});
test('control downloads neutralize formula text, preserve full values and omit private internal identifiers', () => {
  const f = fixture(); f.state.records[0].subject.employeeName = '=SUM(1;2)';
  const v = f.state.records[0].approved.values; v.quantityDecimal = '-1.250000'; v.amountCents = '-12345'; v.legalInstrument = 'Acto A & B "sintético"';
  const checked = fixedExportData(wrap(f.exporter('2026-09-01')), validated(f)), csv = fixedCsv(checked, { search: '@filtro', status: 'partial' });
  assert.ok(csv.startsWith('\ufeff')); assert.match(csv, /"'=SUM\(1;2\)"/); assert.match(csv, /"'-12345"/); assert.match(csv, /"'@filtro"/);
  assert.match(csv, /-1\.250000/); assert.match(csv, /sin prorrateo/);
  const book = unzipSync(fixedXlsx(checked)), sheet = strFromU8(book['xl/worksheets/sheet1.xml']), control = strFromU8(book['xl/worksheets/sheet2.xml']);
  assert.match(sheet, /A1:Q2/); assert.match(sheet, /t="inlineStr"/); assert.match(sheet, /Acto A &amp; B &quot;sintético&quot;/); assert.doesNotMatch(sheet, /<f[ >]/);
  assert.match(control, /No es liquidación/); assert.match(control, /no se calculan, suman ni prorratean/);
  for (const secret of [checked.rows[0].subject.identityToken, checked.rows[0].recordId, checked.rows[0].proposalId, checked.rows[0].subject.contractId, 'preparer@example.invalid', 'reviewer@example.invalid']) {
    assert.equal(csv.includes(secret), false); assert.equal(sheet.includes(secret), false); assert.equal(control.includes(secret), false);
  }
});
test('receipts preserve exact command and replay identity without accepting unknown result types', () => {
  const f = fixedFixture(), receipt = propose(f, null); assert.equal(receipt.command, 'propose'); assert.equal(receipt.recordVersion, 1);
  assert.throws(() => fixedReceipt(wrap(receipt), 'review')); assert.throws(() => fixedReceipt(wrap({ ...receipt, duplicate: 'true' }), 'propose'));
  assert.equal(fixedReceipt(wrap({ ...receipt, duplicate: true }), 'propose').duplicate, true);
  assert.equal(fixedReceipt(wrap(receipt), 'propose', { recordId: receipt.recordId, expectedVersion: 0 }).recordId, receipt.recordId);
  for (const expected of [{ recordId: fixedUuid(999) }, { proposalId: fixedUuid(999) }, { expectedVersion: 1 }]) assert.throws(() => fixedReceipt(wrap(receipt), 'propose', expected));
});
