// Real area panel/model against generated DOM and HTTP only; no accounts or SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { mountAttendanceExpectedDevices } from '../assets/attendance-expected-devices-panel.js';
import { EXPECTED_DEVICES_VERSION, EXPECTED_DEVICES_CAPABILITIES, expectedDevicesStable } from '../assets/attendance-expected-devices-model.js';
import { PayrollPanelElement as Element, payrollPanelEvents as events } from './fixtures/payroll-panel-dom.js';

const id = number => 'bbbbbbbb-0000-4000-8000-' + String(number).padStart(12, '0');
const hash = value => createHash('sha256').update(expectedDevicesStable(value)).digest('hex');
const area = { organizationUnitSourceId: '701', sectorSourceId: '5' };
const areaLabel = 'Repartición sintética QA / Sector exclusivamente ficticio';
const device = { id: id(20), label: 'Reloj sintético QA', siteLabel: 'Punto exclusivamente ficticio' };
const contract = { id: id(10), label: 'Contrato exclusivamente sintético QA', areaLabel, subjectVersion: 'c'.repeat(64) };
const instant = '2026-11-16T16:00:00Z';
const principal = () => ({ tenantId: id(1), membershipId: id(2), actorPersonId: id(3), sessionId: id(4), sessionVersion: 2,
  sourceBindingId: id(5), scopeVersion: 'a'.repeat(64), capabilities: [...EXPECTED_DEVICES_CAPABILITIES],
  areaScopes: [{ scopeId: id(6), ...area, areaLabel, version: 1 }] });
const record = (changes = {}) => ({ id: id(30), version: 1, status: 'proposed', contractId: contract.id, contractLabel: contract.label,
  area: { ...area }, areaLabel, validFrom: '2026-11-01', validUntil: '2026-11-30', devices: [{ ...device }], complete: true,
  subjectVersion: contract.subjectVersion, deviceCatalogVersion: 'd'.repeat(64), proposalSha256: 'e'.repeat(64),
  proposedAt: instant, decidedAt: null, retiredAt: null, retiredEffectiveFrom: null, canReview: true, canRetire: false, ...changes });
const base = person => ({ version: EXPECTED_DEVICES_VERSION, principal: structuredClone(person), installationReady: false, coverageCertified: false, payrollPosted: false });
const history = value => [
  { command: 'propose', expectedVersion: 0, resultingVersion: 1, reasonCode: 'initial_declaration', occurredAt: instant },
  ...(value.version >= 2 ? [{ command: value.status === 'rejected' ? 'reject' : 'approve', expectedVersion: 1, resultingVersion: 2,
    reasonCode: value.status === 'rejected' ? 'insufficient_evidence' : 'declaration_verified', occurredAt: instant }] : []),
  ...(value.version === 3 ? [{ command: 'retire', expectedVersion: 2, resultingVersion: 3, reasonCode: 'declaration_retired', occurredAt: instant }] : []),
];
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness(t, initial = {}) {
  const root = new Element(), docEvents = events(), win = events(), requests = [], saved = new Map();
  const doc = { ...docEvents, hidden: false, createElement: tag => new Element(tag) };
  const state = {
    principal: principal(), records: [record()], unavailable: false, complete: true, choicesEmpty: false,
    auditAvailable: true, failPost: false, commitBeforeFailure: false, postRejection: null, blockerCodes: ['AREA_HISTORY_UNRESOLVED'],
    holdChoices: null, mutateResponse: null, authCount: 0, beforeBootstrap: null,
    ...initial,
  };
  let keyNumber = 100;
  const fetch = async (url, options = {}) => {
    const parsed = new URL(url, 'https://synthetic.invalid');
    assert.equal(parsed.pathname, '/api/internal-attendance-expected-devices', 'only area-scoped facade');
    assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store');
    requests.push({ url, method: options.method, body: options.body, headers: structuredClone(options.headers) });
    let payload, status = 200;
    if (state.unavailable) return new Response(JSON.stringify({ ok: false, code: 'ATTENDANCE_EXPECTED_DEVICES_NOT_INSTALLED' }), { status: 503 });
    if (options.method === 'POST') {
      if (state.postRejection) return new Response(JSON.stringify({ ok: false, code: state.postRejection.code }), { status: state.postRejection.status });
      const envelope = JSON.parse(options.body), command = envelope.payload, key = options.headers['idempotency-key'];
      assert.equal(envelope.operation, 'command'); assert.ok(key);
      let response = saved.get(key);
      if (!response) {
        const previous = command.command === 'propose' ? null : state.records.find(item => item.id === command.proposalId);
        let result;
        if (command.command === 'propose') result = record({
          contractId: command.payload.contractId, area: command.payload.area, validFrom: command.payload.validFrom, validUntil: command.payload.validUntil,
          subjectVersion: command.payload.subjectVersion, deviceCatalogVersion: command.payload.deviceCatalogVersion, proposalSha256: hash(command), canReview: false,
        });
        else result = { ...previous, version: command.expectedVersion + 1,
          status: ({ approve: 'approved', reject: 'rejected', retire: 'retired' })[command.command],
          decidedAt: instant, canReview: false, canRetire: command.command === 'approve',
          retiredAt: command.command === 'retire' ? instant : null, retiredEffectiveFrom: command.command === 'retire' ? command.payload.effectiveFrom : null };
        response = { ...base(state.principal), receipt: { attemptKey: key, requestSha256: hash(command), body: command, recordId: result.id,
          recordVersion: result.version, status: result.status, scopeVersion: command.scopeVersion, recordedAt: instant },
        record: result, replayed: false, attemptKey: key, requestSha256: hash(command) };
        if (!state.failPost || state.commitBeforeFailure) { saved.set(key, structuredClone(response)); state.records = [structuredClone(result)]; }
      } else response = { ...structuredClone(response), principal: structuredClone(state.principal), replayed: true };
      if (state.failPost) throw Error('Synthetic network loss');
      payload = response;
    } else {
      const resource = parsed.searchParams.get('resource');
      if (resource === 'bootstrap') {
        state.authCount++; await state.beforeBootstrap?.(state.authCount);
        payload = base(state.principal);
      } else if (resource === 'list') {
        assert.deepEqual(JSON.parse(parsed.searchParams.get('area')), area);
        const statusFilter = parsed.searchParams.get('status'), limit = Number(parsed.searchParams.get('limit')), offset = Number(parsed.searchParams.get('offset'));
        const records = state.records.filter(item => statusFilter === 'all' || item.status === statusFilter);
        payload = { ...base(state.principal), area: { ...area }, areaLabel, status: statusFilter, limit, offset,
          total: records.length, records: records.slice(offset, offset + limit), complete: true };
      } else if (resource === 'choices') {
        await state.holdChoices?.();
        assert.deepEqual(JSON.parse(parsed.searchParams.get('area')), area);
        payload = { ...base(state.principal), area: { ...area }, areaLabel, validFrom: parsed.searchParams.get('validFrom'), validUntil: parsed.searchParams.get('validUntil'),
          contracts: state.choicesEmpty ? [] : [{ ...contract }], devices: state.choicesEmpty ? [] : [{ ...device }], deviceCatalogVersion: 'd'.repeat(64),
          complete: state.complete, blockerCodes: state.complete ? [] : state.blockerCodes };
      } else if (resource === 'detail') {
        const found = state.records.find(item => item.id === parsed.searchParams.get('id'));
        assert.ok(found);
        payload = { ...base(state.principal), record: structuredClone(found), history: state.auditAvailable ? history(found) : [],
          auditAvailable: state.auditAvailable, historyComplete: state.auditAvailable };
      } else if (resource === 'attempt') {
        const key = parsed.searchParams.get('key'), original = saved.get(key);
        payload = original ? { ...structuredClone(original), principal: structuredClone(state.principal), found: true, replayed: true }
          : { ...base(state.principal), found: false, receipt: null, record: null, replayed: false, attemptKey: key, requestSha256: null };
      } else assert.fail('unexpected resource: ' + resource);
    }
    await state.mutateResponse?.(payload, parsed.searchParams.get('resource') || 'command');
    return new Response(JSON.stringify({ ok: true, data: payload }), { status });
  };
  const mounted = mountAttendanceExpectedDevices(root, { document: doc, window: win, fetch, createKey: () => id(keyNumber++) });
  const q = key => { const result = root.querySelector('[data-aed-' + key + ']'); assert.ok(result, key); return result; };
  const clicks = key => q(key).emit('click');
  const edit = async (key, value, event = 'change') => { q(key).value = value; await q(key).emit(event); };
  const posts = () => requests.filter(item => item.method === 'POST');
  async function start() { await mounted.ready; await edit('area', id(6)); await clicks('load-area'); }
  async function choices() { await edit('valid-from', '2026-11-01'); await edit('valid-until', '2026-11-30'); await clicks('choices'); }
  async function prepare() {
    await choices(); await edit('contract', contract.id);
    const selected = q('devices').querySelector('[data-aed-device]'); selected.checked = true; await selected.emit('change');
    q('complete').checked = true; await q('complete').emit('change');
    await edit('propose-reason-code', 'initial_declaration'); await edit('propose-reason', 'Documento ficticio QA de asignación declarada.', 'input');
    await clicks('prepare');
  }
  async function send() { q('confirm').checked = true; await q('confirm').emit('change'); await clicks('send'); }
  async function open() { await q('records').querySelector('[data-aed-open]').emit('click'); }
  async function decide(action = 'approve') {
    await open(); await edit('decision', action);
    await edit('decision-reason-code', ({ approve: 'declaration_verified', reject: 'insufficient_evidence', retire: 'declaration_retired' })[action]);
    await edit('decision-reason', 'Revisión de constancia exclusivamente ficticia QA.', 'input');
    if (action === 'retire') await edit('retire-date', '2026-11-20');
    await clicks('prepare-decision');
  }
  t.after(() => mounted.destroy());
  return { state, requests, saved, q, root, doc, docEvents, mounted, start, choices, prepare, send, open, decide, edit, clicks, posts };
}

test('area-only account opens without global attendance or workforce grants and starts with no defaults', async t => {
  const h = harness(t); await h.mounted.ready;
  assert.equal(h.q('workspace').hidden, false); assert.equal(h.q('content').hidden, true);
  assert.equal(h.q('area').value, ''); assert.equal(h.q('valid-from').value, ''); assert.equal(h.q('valid-until').value, '');
  assert.equal(h.q('complete').checked, false); assert.equal(h.q('confirm').checked, false);
  assert.equal(h.posts().length, 0); assert.equal(h.q('load-area').disabled, true);
  assert.equal(h.state.principal.capabilities.includes('attendance.read'), false);
  assert.equal(h.state.principal.capabilities.includes('workforce.employee.read'), false);
  assert.match(h.q('area').textContent, /Repartición sintética QA/);
});

test('area list displays the authorized labels and empty declarations never certify completeness', async t => {
  const h = harness(t, { records: [] }); await h.start();
  assert.equal(h.q('content').hidden, false); assert.match(h.q('area-label').textContent, /Sector exclusivamente ficticio/);
  assert.match(h.q('records').textContent, /no acredita que el padrón esté completo/);
  assert.equal(h.q('next').disabled, true); assert.equal(h.q('previous').disabled, true);
  assert.equal(h.posts().length, 0);
});

test('authorized catalog, documentary completeness and final confirmation are all required before proposing', async t => {
  const h = harness(t); await h.start(); await h.prepare();
  assert.equal(h.q('comparison').hidden, false); assert.equal(h.q('send').disabled, true); assert.equal(h.posts().length, 0);
  assert.match(h.q('comparison-facts').textContent, /Repartición sintética QA/);
  assert.match(h.q('comparison-facts').textContent, /Reloj sintético QA/);
  assert.equal(h.q('confirm').checked, false);
  await h.send();
  assert.equal(h.posts().length, 1);
  const command = JSON.parse(h.posts()[0].body).payload;
  assert.equal(command.command, 'propose'); assert.deepEqual(command.payload.area, area);
  assert.equal(command.payload.contractId, contract.id); assert.deepEqual(command.payload.deviceIds, [device.id]);
  assert.equal(command.payload.complete, true); assert.equal(command.payload.subjectVersion, contract.subjectVersion);
  assert.equal(command.payload.validFrom, '2026-11-01'); assert.equal(command.payload.validUntil, '2026-11-30');
  assert.equal(h.q('receipt').hidden, false); assert.match(h.q('receipt').textContent, /En revisión/);
  assert.match(h.q('receipt').textContent, /no certifica cobertura/);
});

test('a reader with an unverified person link cannot propose or decide even if capabilities exist', async t => {
  const p = principal(); p.actorPersonId = null;
  const h = harness(t, { principal: p, records: [record({ canReview: false })] }); await h.start();
  assert.equal(h.q('identity').hidden, false); assert.match(h.q('identity').textContent, /Falta el vínculo verificado/);
  assert.equal(h.q('proposal-fields').disabled, true); await h.open();
  assert.equal(h.q('decision-fields').disabled, true); assert.equal(h.q('decision').options.length, 1);
  assert.equal(h.posts().length, 0);
});

test('incomplete area population allows only demonstrated individual contracts without certifying population or absences', async t => {
  const h = harness(t, { complete: false }); await h.start(); await h.choices();
  assert.equal(h.q('choices-content').hidden, false); assert.equal(h.q('prepare').disabled, false);
  assert.match(h.q('status').textContent, /población del área está incompleta/);
  assert.match(h.q('source').textContent, /no habilita cálculo de ausencias/);
  await h.prepare(); await h.send();
  assert.equal(h.posts().length, 1); assert.equal(JSON.parse(h.posts()[0].body).payload.payload.complete, true, 'explicit device-set declaration is independent of population completeness');
});

test('technical population limit cannot expose a usable catalog even if a response includes some rows', async t => {
  const h = harness(t, { complete: false, blockerCodes: ['AREA_POPULATION_TECHNICAL_LIMIT'] }); await h.start(); await h.choices();
  assert.equal(h.q('choices-content').hidden, true); assert.equal(h.q('prepare').disabled, true);
  assert.match(h.q('status').textContent, /límite técnico/); assert.equal(h.posts().length, 0);
});

test('complete but empty authorized choices cannot stage a declaration', async t => {
  const h = harness(t, { choicesEmpty: true }); await h.start(); await h.choices();
  assert.match(h.q('status').textContent, /No se deduce un padrón vacío completo/);
  await h.clicks('prepare'); assert.equal(h.q('comparison').hidden, true); assert.equal(h.posts().length, 0);
});

test('missing backend is visibly unavailable and never a successful empty list', async t => {
  const h = harness(t, { unavailable: true }); await h.mounted.ready;
  assert.equal(h.q('workspace').hidden, true); assert.equal(h.q('status').dataset.state, 'unavailable');
  assert.match(h.q('status').textContent, /pendiente de habilitación/); assert.equal(h.q('receipt').hidden, true);
  assert.equal(h.posts().length, 0);
});

test('dates remain explicit and a technical range limit produces an actionable error before reading choices', async t => {
  const h = harness(t); await h.start(); await h.clicks('choices');
  assert.match(h.q('status').textContent, /vigencia completa/);
  await h.edit('valid-from', '2026-01-01'); await h.edit('valid-until', '2027-02-01'); await h.clicks('choices');
  assert.match(h.q('status').textContent, /366 días/);
  assert.equal(h.requests.filter(item => item.url.includes('resource=choices')).length, 0);
});

test('the original proposer receives no approval option; an independent reviewer confirms the exact revision', async t => {
  const h = harness(t, { records: [record({ canReview: false })] }); await h.start(); await h.open();
  assert.equal(h.q('decision').options.length, 1); assert.match(h.q('review-note').textContent, /no puede aprobarla/);
  await h.clicks('prepare-decision'); assert.equal(h.q('comparison').hidden, true);
  h.state.records = [record()]; await h.clicks('access'); await h.edit('area', id(6)); await h.clicks('load-area');
  await h.decide(); assert.equal(h.q('comparison').hidden, false); assert.equal(h.q('send').disabled, true);
  assert.match(h.q('history').textContent, /Declaración inicial/);
  await h.send();
  const command = JSON.parse(h.posts()[0].body).payload;
  assert.equal(command.command, 'approve'); assert.equal(command.proposalId, id(30)); assert.equal(command.expectedVersion, 1);
  assert.equal(command.payload, null); assert.match(h.q('receipt').textContent, /Aprobada/);
});

test('retiring an approval requires an explicit effective date and preserves its version', async t => {
  const h = harness(t, { records: [record({ status: 'approved', version: 2, decidedAt: instant, canReview: false, canRetire: true })] });
  await h.start(); await h.open(); await h.edit('decision', 'retire');
  assert.equal(h.q('retire-date').value, ''); assert.equal(h.q('retire-date-field').hidden, false);
  await h.edit('decision-reason-code', 'declaration_retired'); await h.edit('decision-reason', 'Retiro exclusivamente sintético y documentado.', 'input');
  await h.clicks('prepare-decision'); assert.equal(h.q('comparison').hidden, true);
  await h.edit('retire-date', '2026-11-20'); await h.clicks('prepare-decision'); await h.send();
  const command = JSON.parse(h.posts()[0].body).payload;
  assert.deepEqual(command.payload, { effectiveFrom: '2026-11-20' }); assert.equal(command.expectedVersion, 2);
  assert.match(h.q('receipt').textContent, /Retirada/);
});

test('history withheld by the audit capability is labeled without pretending an empty complete history', async t => {
  const h = harness(t, { auditAvailable: false }); await h.start(); await h.open();
  assert.match(h.q('history').textContent, /no tiene acceso al historial/);
  assert.doesNotMatch(h.q('history').textContent, /sin decisiones/);
});

test('uncertain POST locks the original content and lookup-found recovers its immutable receipt without another POST', async t => {
  const h = harness(t, { failPost: true, commitBeforeFailure: true }); await h.start(); await h.prepare(); await h.send();
  assert.equal(h.q('recovery').hidden, false); assert.equal(h.q('area-fields').disabled, true);
  assert.equal(h.q('proposal-fields').disabled, true); assert.equal(h.q('retry').hidden, true);
  assert.match(h.q('status').textContent, /No se confirmó/);
  await h.clicks('recover');
  assert.equal(h.posts().length, 1); assert.equal(h.q('receipt').hidden, false);
  assert.match(h.q('status').textContent, /comprobante original/);
});

test('lookup-not-found enables only the identical serialized POST and idempotency key', async t => {
  const h = harness(t, { failPost: true }); await h.start(); await h.prepare(); await h.send();
  const first = structuredClone(h.posts()[0]); await h.clicks('recover');
  assert.equal(h.q('retry').hidden, false); assert.equal(h.q('retry').disabled, false);
  h.q('propose-reason').value = 'Una modificación posterior no cambia el intento original.';
  h.state.failPost = false; await h.clicks('retry');
  assert.equal(h.posts().length, 2); assert.equal(h.posts()[1].body, first.body);
  assert.equal(h.posts()[1].headers['idempotency-key'], first.headers['idempotency-key']);
  assert.equal(h.q('receipt').hidden, false);
});

test('first atomic OVERLAP rejection permits correction only after re-reading access, area and catalogs', async t => {
  const h = harness(t, { postRejection: { status: 409, code: 'ATTENDANCE_EXPECTED_DEVICES_OVERLAP' } });
  await h.start(); await h.prepare(); await h.send();
  assert.equal(h.q('workspace').hidden, true); assert.equal(h.q('recovery').hidden, true);
  assert.match(h.q('status').textContent, /superpone/); assert.match(h.q('status').textContent, /releé el área/);
  assert.equal(h.q('receipt').hidden, true); assert.equal(h.q('send').disabled, true);
  const first = structuredClone(h.posts()[0]);
  h.state.postRejection = null; await h.clicks('access'); await h.start(); await h.prepare(); await h.send();
  assert.equal(h.posts().length, 2);
  assert.notEqual(h.posts()[1].headers['idempotency-key'], first.headers['idempotency-key']);
  assert.equal(h.q('receipt').hidden, false);
});

test('503 and lookup-not-found preserve the original attempt; a later 409 cannot discard an earlier uncertain transmission', async t => {
  const h = harness(t, { postRejection: { status: 503, code: 'ATTENDANCE_EXPECTED_DEVICES_UNAVAILABLE' } });
  await h.start(); await h.prepare(); await h.send();
  assert.equal(h.q('recovery').hidden, false); await h.clicks('recover');
  assert.equal(h.q('retry').hidden, false); const first = structuredClone(h.posts()[0]);
  h.state.postRejection = { status: 409, code: 'ATTENDANCE_EXPECTED_DEVICES_SCOPE_CHANGED' };
  await h.clicks('retry');
  assert.equal(h.posts()[1].body, first.body); assert.equal(h.posts()[1].headers['idempotency-key'], first.headers['idempotency-key']);
  assert.equal(h.q('recovery').hidden, false); assert.equal(h.q('area-fields').disabled, true);
  assert.equal(h.q('receipt').hidden, true);
});

test('changed tenant, identity or session cannot recover or repeat a pending mutation', async t => {
  const h = harness(t, { failPost: true }); await h.start(); await h.prepare(); await h.send();
  h.state.principal.sessionId = id(99); await h.clicks('recover');
  assert.equal(h.q('workspace').hidden, true); assert.equal(h.q('receipt').hidden, true);
  assert.match(h.q('status').textContent, /Cambió la cuenta, la sesión o el alcance/);
  assert.equal(h.posts().length, 1); assert.equal(h.q('recover').disabled, true);
  assert.equal(h.requests.filter(item => item.url.includes('resource=attempt')).length, 0);
});

test('cross-scope catalog response is rejected before any contract labels are exposed', async t => {
  const h = harness(t); await h.start();
  h.state.mutateResponse = (payload, resource) => { if (resource === 'choices') payload.principal.tenantId = id(99); };
  await h.choices(); assert.equal(h.q('workspace').hidden, true);
  assert.doesNotMatch(h.q('contract').textContent, /Contrato exclusivamente sintético/);
  assert.equal(h.posts().length, 0);
});

test('hidden page discards a late catalog response and removes all authorized labels', async t => {
  const h = harness(t); await h.start();
  await h.edit('valid-from', '2026-11-01'); await h.edit('valid-until', '2026-11-30');
  let release, entered;
  const began = new Promise(resolve => { entered = resolve; });
  h.state.holdChoices = async () => { entered(); await new Promise(resolve => { release = resolve; }); };
  const pending = h.clicks('choices'); await began;
  h.doc.hidden = true; h.docEvents.dispatch('visibilitychange'); release(); await pending; await settle();
  assert.equal(h.q('workspace').hidden, true); assert.equal(h.q('comparison').hidden, true);
  assert.equal(h.q('valid-from').value, ''); assert.doesNotMatch(h.root.textContent, /Contrato exclusivamente sintético/);
  assert.equal(h.posts().length, 0);
});

test('declared sources cannot be altered after comparison without withdrawing final confirmation', async t => {
  const h = harness(t); await h.start(); await h.prepare();
  await h.clicks('cancel'); assert.equal(h.q('comparison').hidden, true); assert.equal(h.q('confirm').checked, false);
  await h.edit('valid-until', '2026-11-29'); assert.equal(h.q('choices-content').hidden, true);
  assert.equal(h.q('complete').checked, false); assert.equal(h.posts().length, 0);
});

test('scoped route preserves login intent, no-store and the existing global attendance gate', () => {
  const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const window = {}, document = { head: { appendChild() {} }, getElementById() { return null; }, createElement() { return {}; } };
  vm.runInNewContext(read('assets/app-routes.js'), { window, URL });
  window.document = document;
  vm.runInNewContext(read('assets/internal-capability-gate.js'), { window, document, URL, Set, Map, Promise });
  const gate = window.MuniControlCapabilityGate;
  assert.equal(gate.allowed(gate.requirements['asistencia-dispositivos.html'], ['attendance.area.read'], []), true);
  assert.equal(gate.allowed(gate.requirements['relojes-marcaciones.html'], ['attendance.area.read'], []), false);
  assert.equal(window.MuniControlRoutes.resolve('/asistencia-dispositivos').file, 'asistencia-dispositivos.html');
  assert.match(read('login.html'), /tenantSafeNext[^\n]*asistencia-dispositivos\.html/);
  const config = JSON.parse(read('vercel.json'));
  for (const source of ['/asistencia-dispositivos', '/asistencia-dispositivos.html']) {
    assert.match(config.headers.find(entry => entry.source === source).headers.find(entry => entry.key === 'Cache-Control').value, /private, no-store/);
    assert.ok(read('sw.js').includes("'" + source + "'"));
  }
  assert.doesNotMatch(read('asistencia-dispositivos.html'), /clock-dashboard\.js|internal-attendance\.js|workday-panel\.js/);
});
