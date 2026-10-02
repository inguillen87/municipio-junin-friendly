import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TimeCatalogReviewSession, catalogCivilDate, catalogPageLabel} from '../assets/time-catalog-review-model.js';
import {ID, record, command, payload, flags, scopeVersion} from './fixtures/time-catalog-synthetic.js';
const permissions = {canPropose: true, canApprove: false, canAudit: false, canReadAssignments: false};
const base = patch => ({version: 'time-catalog.v1', scopeVersion, permissions: {...permissions}, ...patch});
const boot = patch => base({summary: {calendar: 0, shift: 0, ruleProfile: 30, assignment: 0, submitted: 0}, ...flags, ...patch});
const detail = (r = record(), patch = {}) => {
  const perms = patch.permissions || permissions, ownDraft = r.status === 'draft' && perms.canPropose && r.kind !== 'assignment';
  return base({record: r, timeline: [], auditAvailable: false, timelineLimit: 100, timelineMayBeIncomplete: false,
    editPayload: ownDraft ? payload(r.kind) : null, assignment: null,
    allowedCommands: ownDraft ? ['update_draft','submit'] : r.kind === 'assignment' ? [] : r.status === 'submitted' && perms.canApprove ? ['approve','reject'] : r.status === 'approved' && perms.canApprove ? ['retire'] : [], ...patch});
};
const ready = (r = record(), perms = permissions) => { perms={canReadAssignments:false,...perms}; const s = new TimeCatalogReviewSession(); s.bootstrap(boot({permissions: perms})); s.detail(detail(r, {permissions: perms, auditAvailable: perms.canAudit}), r.id); return s; };

test('read results retain exact values and are detached from response mutation', () => {
  const r = record(), s = ready(r); r.configuration.parameters[0].decimalValue = '1';
  assert.equal(s.selected.configuration.parameters.find(p => p.valueKind === 'decimal').decimalValue, '99999999999999.123456');
  assert.equal(s.selected.configuration.parameters.find(p => p.valueKind === 'integer').integerValue, '999999999999999999');
  assert.equal(catalogCivilDate('2026-10-01'), '01/10/2026');
});
test('a full page preserves global totals; an omitted row or duplicate cannot look complete', () => {
  const s = ready(), r = record(), rows = Array.from({length: 25}, (_, i) => ({...r, id: `aaaaaaaa-0000-4000-8000-${String(i + 1).padStart(12, '0')}`}));
  const input = {kind: '', status: '', limit: 25, offset: 0};
  const data = base({records: rows, page: {limit: 25, offset: 0, total: 30, hasMore: true}});
  s.list(data, input); assert.equal(s.page.total, 30); assert.equal(s.records.length, 25);
  assert.throws(() => s.list({...data, records: rows.slice(1)}, input));
  assert.throws(() => s.list({...data, records: [...rows.slice(1), rows[1]]}, input));
  assert.throws(() => s.list(data, {...input, kind: 'shift'}));
});
test('a later page becoming empty retains the real global total without an inverted range', () => {
  const s = ready(), data = base({records: [], page: {limit: 25, offset: 25, total: 24, hasMore: false}});
  s.list(data, {kind: '', status: '', limit: 25, offset: 25}); assert.equal(s.page.total, 24);
  assert.equal(catalogPageLabel(s.page, 0), '0 en esta página · 24 configuraciones en el filtro. Usá Anterior para volver.');
});
test('source, actor scope or permissions changing invalidates every read and frozen attempt', () => {
  for (const change of [{scopeVersion: 'f'.repeat(64) + '.' + 'a'.repeat(64)}, {permissions: {...permissions, canPropose: false}}]) {
    const s = ready(); s.prepare('submit', 'ready_for_review', 'Preparación sintética completa.', false, ID);
    assert.throws(() => s.bootstrap(boot(change)), /Cambió/); assert.equal(s.scope, null); assert.equal(s.pending, null); assert.equal(s.selected, null); assert.equal(s.records.length, 0);
  }
});
test('pending same-byte attempt cannot be mutated or replaced by another decision', () => {
  const s = ready(), attempt = s.prepare('submit', 'ready_for_review', 'Preparación sintética completa.', false, ID);
  const bytes = attempt.body; s.selected.version++; assert.equal(s.attempt().body, bytes);
  assert.throws(() => { attempt.body = 'other'; });
  assert.throws(() => s.prepare('submit', 'ready_for_review', 'Preparación sintética completa.', false, ID));
  s.bootstrap(boot()); assert.equal(s.attempt(), attempt); assert.deepEqual(s.commands(), []);
});
test('an uncertain attempt survives consultation of a newer state without inventing a receipt', () => {
  const s = ready(), attempt = s.prepare('submit', 'ready_for_review', 'Preparación sintética completa.', false, ID);
  s.detail(detail({...record(), status: 'submitted', version: 2}), ID);
  assert.equal(s.attempt(), attempt); assert.equal(s.selected.version, 2); assert.deepEqual(s.commands(), []);
});
test('only a matching receipt releases the frozen attempt; historical replay remains explicit', () => {
  const s = ready(), attempt = s.prepare('submit', 'ready_for_review', 'Preparación sintética completa.', false, ID);
  const ack = {version: 'time-catalog.v1', scopeVersion, data: {...record(), status: 'submitted', version: 2, reasonCode: 'ready_for_review'},
    replayed: true, historical: true, requestSha256: 'b'.repeat(64), attemptKey: ID, ...flags};
  for (const change of [{attemptKey: 'aaaaaaaa-0000-4000-8000-000000000001'}, {scopeVersion: 'f'.repeat(64)}, {minutesCalculated: true},
    {data: {...ack.data, version: 3}}, {data: {...ack.data, status: 'approved'}}, {replayed: false}, {employeeName: 'PRIVATE'}]) {
    assert.throws(() => s.confirm({...ack, ...change})); assert.equal(s.attempt(), attempt);
  }
  assert.deepEqual(s.confirm(ack), {replayed: true, historical: true}); assert.equal(s.pending, null);
});
test('hide or revocation clears private reads, evidence and attempt; late receipt cannot rehydrate it', () => {
  const s = ready(); s.prepare('submit', 'ready_for_review', 'Preparación sintética completa.', false, ID); const generation = s.generation;
  s.invalidate(); assert.ok(s.generation > generation); assert.equal(s.selected, null); assert.equal(s.summary, null); assert.equal(s.scope, null); assert.equal(s.pending, null);
  assert.throws(() => s.confirm({})); assert.throws(() => s.attempt()); assert.deepEqual(s.commands(), []);
});
test('separation of roles and explicit human approval cannot be silently inferred', () => {
  const r = {...record(), status: 'submitted', version: 2}, s = ready(r, {canPropose: false, canApprove: true, canAudit: false});
  assert.deepEqual(s.commands(), ['approve', 'reject']);
  assert.throws(() => s.prepare('approve', 'configuration_verified', 'Verificación sintética completa.', false, ID));
  assert.equal(s.prepare('approve', 'configuration_verified', 'Verificación sintética completa.', true, ID).key, ID);
  const governed = ready(r, {canPropose: true, canApprove: true, canAudit: false});
  governed.detail(detail(r, {permissions: governed.permissions, allowedCommands: []}), r.id); assert.deepEqual(governed.commands(), []);
  assert.deepEqual(ready(r).commands(), []);
});
test('assignment target is unavailable: even an approver cannot decide blindly', () => {
  for (const status of ['draft', 'submitted', 'approved']) {
    const r = {...record(command({kind: 'assignment', payload: payload('assignment')})), status};
    const s = ready(r, {canPropose: false, canApprove: true, canAudit: false}); assert.deepEqual(s.commands(), []);
    assert.throws(() => s.prepare('approve', 'configuration_verified', 'Verificación sintética completa.', true, ID));
  }
});
test('audit never disguises its 100-event ceiling or removes malformed events', () => {
  const r = {...record(), version: 101}, perms = {...permissions, canAudit: true}, s = ready(r, perms);
  const timeline = Array.from({length: 100}, (_, i) => ({command: 'update_draft', reasonCode: 'draft_corrected', expectedVersion: i + 1, resultingVersion: i + 2, occurredAt: '2026-10-02T10:00:00Z'}));
  const d = detail(r, {permissions: perms, timeline, auditAvailable: true, timelineMayBeIncomplete: true});
  s.detail(d, ID); assert.equal(s.timeline.length, 100); assert.equal(s.timelineMayBeIncomplete, true);
  assert.throws(() => s.detail({...d, timelineMayBeIncomplete: false}, ID));
  assert.throws(() => s.detail({...d, timeline: [{...timeline[0], reason: 'PRIVATE'}, ...timeline.slice(1)]}, ID));
});
test('module is included in the build and gated without altering the postponed route patch', () => {
  const build = fs.readFileSync('scripts/build-friendly.mjs', 'utf8'), gate = fs.readFileSync('assets/internal-capability-gate.js', 'utf8');
  for (const f of ['catalogo-tiempo.html', 'assets/time-catalog-review.js', 'assets/time-catalog-review-model.js', 'assets/time-catalog-editor.js', 'assets/time-catalog-review.css', 'assets/time-catalog-contract.js']) assert.ok(build.includes("'" + f + "'"));
  assert.match(gate, /'catalogo-tiempo\.html': \{ all: \['time\.catalog\.read'\] \}/);
  assert.match(fs.readFileSync('.vercelignore', 'utf8'), /^!catalogo-tiempo\.html$/m);
  const ui = fs.readFileSync('assets/time-catalog-review.js', 'utf8'); assert.doesNotMatch(ui, /localStorage|sessionStorage|indexedDB|innerHTML|sendBeacon/);
});
