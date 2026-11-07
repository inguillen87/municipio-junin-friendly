import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APPROVAL_SOURCES, APPROVAL_ELSEWHERE, visibleApprovalSources, approvalTotals, lastClosedMonth, periodLabel } from '../assets/approvals-inbox-model.js';

const byKey = Object.fromEntries(APPROVAL_SOURCES.map(s => [s.key, s]));

test('every source is a read-only GET to an existing API and links to its own review screen', () => {
  for (const s of APPROVAL_SOURCES) {
    const url = s.url({ period: '2026-10' });
    assert.match(url, /^\/api\/internal-[a-z-]+\?resource=(bootstrap|list|queue)/, s.key);
    assert.ok(fs.existsSync(new URL('../api/' + url.split('?')[0].slice(5) + '.js', import.meta.url)), 'api exists for ' + s.key);
    assert.match(s.href, /^\/(nomina|novedades|personal|acciones)/, s.key);
    assert.ok(s.caps.length > 0, s.key);
  }
  assert.equal(new Set(APPROVAL_SOURCES.map(s => s.key)).size, APPROVAL_SOURCES.length);
  assert.ok(APPROVAL_ELSEWHERE.some(x => /Bajas/.test(x.title)));
});

test('only sources whose capabilities the account holds are queried', () => {
  assert.deepEqual(visibleApprovalSources(['payroll.parameter.read']).map(s => s.key), ['parameters']);
  assert.deepEqual(visibleApprovalSources(new Set(['actions.read'])).map(s => s.key), ['leave']);
  assert.ok(!visibleApprovalSources(['workforce.employee.read']).some(s => s.key === 'adoption'));
});

test('parsers count pending items, reviewable ones and summarize three lines', () => {
  const program = byKey.program.pick({ data: { proposals: [
    { status: 'pending', canReview: true, authorLabel: 'Noelia', createdAt: '2026-11-06T10:00:00Z', reason: 'Programa de octubre convenio 1' },
    { status: 'pending', canReview: false, authorLabel: 'Hugo', createdAt: '2026-11-05T10:00:00Z', reason: 'Otra' },
    { status: 'approved', canReview: false, authorLabel: 'X', createdAt: '2026-11-01T10:00:00Z', reason: 'Vieja' },
  ] } });
  assert.equal(program.count, 2); assert.equal(program.reviewable, 1);
  assert.deepEqual(program.items[0], { who: 'Noelia', when: '06/11', what: 'Programa de octubre convenio 1' });
  const params = byKey.parameters.pick({ ok: true, proposals: [{ status: 'submitted', draft: { ruleId: 'SAC', validFrom: '2026-10-01' }, submittedAt: '2026-11-02T15:00:00Z' }], total: 4 });
  assert.equal(params.count, 4); assert.equal(params.reviewable, null); assert.equal(params.items[0].what, 'SAC · desde octubre 2026');
  const fixed = byKey['fixed-novelties'].pick({ data: { rows: [{ subject: { legajo: '571' }, pending: { operation: 'set', canReview: true, proposedAt: '2026-11-03T15:00:00Z', values: { conceptSourceId: '638' } } }, { subject: { legajo: '9' }, pending: null }] } });
  assert.equal(fixed.count, 1); assert.equal(fixed.reviewable, 1); assert.equal(fixed.items[0].what, 'Legajo 571 · alta o cambio · concepto 638');
  const batches = byKey['monthly-batches'].pick({ ok: true, batches: [{ status: 'submitted', periodMonth: '2026-10-01', payrollType: 'monthly', rowCount: 12, allowedCommands: ['approve', 'reject'] }, { status: 'draft' }] });
  assert.equal(batches.count, 1); assert.equal(batches.reviewable, 1); assert.equal(batches.items[0].what, 'octubre 2026 · mensual · 12 filas');
  const own = byKey['own-novelties'].pick({ data: { permissions: { canApprove: false }, batches: [{ status: 'submitted', periodMonth: '2026-10-01', payrollType: 'monthly', rowCount: 1 }] } });
  assert.equal(own.count, 1); assert.equal(own.reviewable, 0); assert.equal(own.items[0].what, 'octubre 2026 · mensual · 1 fila');
  const adoption = byKey.adoption.pick({ data: { rows: [{ independent: true, proposal: { status: 'pending', total: 3 } }] } });
  assert.deepEqual([adoption.count, adoption.reviewable, adoption.items[0].what], [1, 1, '3 legajos']);
  const leave = byKey.leave.pick({ ok: true, data: [{ subject: { displayName: 'Pérez, Ana', legajo: '12' }, updatedAt: '2026-11-04T15:00:00Z', payload: { startsOn: '2026-11-10' } }], pagination: { total: 7 } });
  assert.equal(leave.count, 7); assert.deepEqual(leave.items[0], { who: 'Pérez, Ana', when: '04/11', what: 'Legajo 12 · desde 10/11/2026' });
  assert.deepEqual(byKey.program.pick(null), { count: 0, reviewable: 0, items: [] });
});

test('totals exclude failed reads and unknown reviewable counts', () => {
  assert.deepEqual(approvalTotals([{ count: 2, reviewable: 1 }, { count: 4, reviewable: null }, { error: true }, { count: 0, reviewable: 0 }]), { waiting: 6, reviewable: 1, unknown: 4 });
  assert.equal(lastClosedMonth(new Date(2026, 10, 6)), '2026-10');
  assert.equal(lastClosedMonth(new Date(2027, 0, 3)), '2026-12');
  assert.equal(periodLabel('2026-10-01'), 'octubre 2026');
});

test('bandeja lives at the top of Resumen and never posts', () => {
  const nav = fs.readFileSync(new URL('../assets/payroll-navigation.js', import.meta.url), 'utf8');
  assert.match(nav, /nodes:\[publicationNotice,approvals,summary,/);
  const ui = fs.readFileSync(new URL('../assets/approvals-inbox.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /method:\s*'POST'|method:\s*"POST"/);
  assert.match(ui, /const worker = async/); assert.match(ui, /Promise\.all\(\[worker\(\), worker\(\)\]\)/);
});

test('section tabs follow deep links from the bandeja: reveal the tab and open the details', () => {
  const tabs = fs.readFileSync(new URL('../assets/section-tabs.js', import.meta.url), 'utf8');
  assert.match(tabs, /addEventListener\('hashchange', followHash\); followHash\(\);/);
  assert.match(tabs, /if \(d\.tagName === 'DETAILS'\) d\.open = true;/);
});

test('monthly batches explain own batches and an account not linked to a legajo, and link each batch', async () => {
  const { monthlyBatches } = await import('../assets/approvals-inbox-model.js');
  const id = '537d0cc7-2db6-413f-a1bc-af1553cda622';
  const r = monthlyBatches({ principal: { capabilities: ['payroll.novelty.approve'], employmentLinked: false }, batches: [
    { id, status: 'submitted', periodMonth: '2026-08-01', payrollType: 'monthly', rowCount: 1, allowedCommands: [], submittedAt: '2026-09-15T12:50:16Z', rows: [{ legajo: '1339', conceptSourceId: '44', quantityDecimal: '95' }] },
    { id: 'da8572b5-c76a-43d6-8ba3-5be88b08d302', status: 'submitted', periodMonth: '2026-08-01', payrollType: 'monthly', rowCount: 1, allowedCommands: ['cancel'], rows: [{ legajo: '1339', conceptSourceId: '144', quantityDecimal: '0' }] },
  ] });
  assert.equal(r.count, 2); assert.equal(r.reviewable, 0);
  assert.equal(r.items[0].what, 'agosto 2026 · mensual · legajo 1339 · concepto 44 · cant. 95');
  assert.equal(r.items[0].href, '/novedades?batchId=' + id + '#lotes');
  assert.equal(r.items[1].who, 'preparado por vos');
  assert.match(r.note, /1 lo preparaste vos: podés cancelarlo/);
  assert.match(r.note, /no está vinculada a un legajo/);
  assert.equal(monthlyBatches({ batches: [{ status: 'submitted', rowCount: 1, allowedCommands: ['approve'] }] }).note, 'Podés aprobarlo o rechazarlo.');
});

