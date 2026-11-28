// Panel real contra DOM mínimo y HTTP sintético; sin cuentas ni SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAreaEffectivity} from '../assets/attendance-area-effectivity-ui.js';
import {PayrollPanelElement as Element, payrollPanelEvents as events} from './fixtures/payroll-panel-dom.js';
import {id, state, partial, pending, decided, receipt} from './fixtures/attendance-area-effectivity-synthetic.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function harness(initial = {}) {
  const root = new Element('details'), requests = [];
  const doc = {...events(), createElement: tag => new Element(tag)};
  const server = {state: state(), post: null, failNetwork: false, ...initial};
  let keys = 0;
  const fetch = async (url, init) => {
    requests.push({url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null});
    if (server.failNetwork) throw new TypeError('network');
    if (init.method === 'POST') {
      const answer = server.post(JSON.parse(init.body).payload);
      return {ok: answer.status < 300, status: answer.status, json: async () => answer.body};
    }
    if (server.getStatus) return {ok: false, status: server.getStatus, json: async () => ({ok: false, code: 'ATTENDANCE_AREA_EFFECTIVITY_' + (server.getCode ?? 'UNAVAILABLE'), error: 'x'})};
    return {ok: true, status: 200, json: async () => ({ok: true, data: structuredClone(server.state)})};
  };
  const panel = mountAreaEffectivity(root, {document: doc, fetch, createKey: () => id(100 + ++keys)});
  const find = mark => root.querySelector('[data-ae-' + mark + ']');
  const open = async () => { root.open = true; await root.emit('toggle'); await settle(); };
  return {root, panel, server, requests, find, open, text: () => root.textContent};
}

test('al abrir consulta una vez y muestra totales, exclusiones y áreas sin nombrar personas', async () => {
  const h = harness(); await h.open();
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].url, '/api/internal-attendance-area-effectivity'); assert.equal(h.requests[0].method, 'GET');
  assert.match(h.text(), /Todavía no hay ninguna declaración aprobada/); assert.match(h.text(), /2 contratos no tienen repartición y sector completos/);
  assert.match(h.text(), /1 alta anulada queda fuera/); assert.match(h.text(), /Se incluyen 5 contratos adoptados activos/);
  assert.equal(h.root.querySelectorAll('[data-ae-area-row]').length, 2); assert.equal(h.find('scope'), null, 'sin declaraciones previas no hay nada que elegir'); assert.equal(h.find('date').value, '2026-11-19'); assert.equal(h.find('date').getAttribute('max'), '2026-11-19');
  await h.root.emit('toggle'); await settle(); assert.equal(h.requests.length, 1);
});
test('preparar exige confirmación, fecha válida y referencia; después envía una sola vez con su clave', async () => {
  const h = harness(); await h.open();
  h.server.post = payload => { h.server.state = state({pending: pending({ownProposal: true, effectiveFrom: payload.effectiveFrom, authorizationReference: payload.authorizationReference})}); return {status: 201, body: {ok: true, data: receipt(payload)}}; };
  await h.find('submit').emit('click'); assert.match(h.find('status').textContent, /Marcá la confirmación/); assert.equal(h.requests.length, 1);
  h.find('confirm').checked = true;
  await h.find('submit').emit('click'); assert.match(h.find('status').textContent, /referencia documental/); assert.equal(h.requests.length, 1);
  h.find('reference').value = '  Nota sintética 12/2026 de prueba  '; h.find('date').value = '2026-11-20';
  await h.find('submit').emit('click'); assert.match(h.find('status').textContent, /no puede ser futura/); assert.equal(h.requests.length, 1);
  h.find('date').value = '2026-11-01';
  await h.find('submit').emit('click'); await settle();
  const sent = h.requests[1];
  assert.equal(sent.method, 'POST'); assert.equal(sent.headers['idempotency-key'], id(101)); assert.equal(sent.headers['content-type'], 'application/json');
  assert.deepEqual(sent.body, {operation: 'command', payload: {action: 'propose', authorizationReference: 'Nota sintética 12/2026 de prueba', effectiveFrom: '2026-11-01', previewVersion: 'b'.repeat(64), scope: 'missing'}});
  assert.equal(h.requests.length, 3); assert.match(h.find('status').textContent, /Declaración preparada/);
  assert.match(h.text(), /La preparaste vos/); assert.equal(h.find('approve'), null); assert.match(h.find('reject').textContent, /Retirar mi declaración/); assert.equal(h.find('submit'), null);
});
test('otra persona aprueba con motivo; quien no puede aprobar no ve el botón', async () => {
  const h = harness({state: state({pending: pending()})}); await h.open();
  assert.match(h.text(), /Rige desde01\/11\/2026/); assert.match(h.text(), /prepara@example\.invalid/);
  h.server.post = payload => { const done = state({history: [decided('approved')], declaredContracts: 5}); done.preview.scopes.missing = {eligible: 0, areas: [], version: 'b'.repeat(64)}; h.server.state = done; return {status: 201, body: {ok: true, data: receipt(payload)}}; };
  await h.find('approve').emit('click'); assert.match(h.find('status').textContent, /Escribí el motivo/); assert.equal(h.requests.length, 1);
  h.find('reason').value = 'Decisión sintética de prueba';
  await h.find('approve').emit('click'); await settle();
  assert.deepEqual(h.requests[1].body.payload, {action: 'review', decision: 'approve', proposalId: id(9), proposalVersion: 'c'.repeat(64), reason: 'Decisión sintética de prueba'});
  assert.match(h.find('status').textContent, /Declaración aprobada/); assert.match(h.text(), /5 contratos tienen una declaración vigente, de 5 en condiciones de ser declarados\. No falta ninguno\./); assert.match(h.text(), /Aprobada · rige desde 01\/11\/2026/);
  const readonly = harness({state: state({pending: pending(), permissions: {canPropose: true, canReview: false}})}); await readonly.open();
  assert.equal(readonly.find('approve'), null); assert.equal(readonly.find('reject'), null); assert.match(readonly.text(), /no puede decidir esta declaración/);
  const stale = harness({state: state({pending: pending({stale: true})})}); await stale.open();
  assert.equal(stale.find('approve'), null); assert.notEqual(stale.find('reject'), null); assert.match(stale.text(), /ya no se puede aprobar/);
});
test('una falla de red conserva la clave para repetir el mismo envío; un rechazo definitivo la libera', async () => {
  const h = harness(); await h.open();
  h.find('confirm').checked = true; h.find('reference').value = 'Nota sintética 12/2026 de prueba'; h.find('date').value = '2026-11-01';
  h.server.failNetwork = true;
  await h.find('submit').emit('click'); await settle();
  assert.match(h.find('status').textContent, /No se pudo confirmar el envío/); assert.equal(h.requests.at(-1).headers['idempotency-key'], id(101));
  h.server.failNetwork = false; h.server.post = () => ({status: 409, body: {ok: false, code: 'ATTENDANCE_AREA_EFFECTIVITY_PREVIEW_CHANGED', error: 'x'}});
  await h.find('submit').emit('click'); await settle();
  const posts = h.requests.filter(r => r.method === 'POST');
  assert.equal(posts.length, 2); assert.equal(posts[1].headers['idempotency-key'], id(101)); assert.match(h.find('status').textContent, /Los legajos cambiaron/);
  h.find('confirm').checked = true; h.find('reference').value = 'Nota sintética 12/2026 de prueba'; h.find('date').value = '2026-11-01';
  h.server.post = payload => ({status: 201, body: {ok: true, data: receipt(payload)}});
  await h.find('submit').emit('click'); await settle();
  assert.equal(h.requests.filter(r => r.method === 'POST').at(-1).headers['idempotency-key'], id(102));
});
test('sin permiso o sin instalación no queda ningún dato en pantalla', async () => {
  const h = harness(); await h.open(); assert.notEqual(h.find('overview'), null);
  h.server.getStatus = 403; h.server.getCode = 'FORBIDDEN';
  await h.find('refresh').emit('click'); await settle();
  assert.equal(h.find('overview'), null); assert.match(h.find('status').textContent, /no tiene permiso/);
  const missing = harness({getStatus: 503}); await missing.open();
  assert.equal(missing.find('overview'), null); assert.match(missing.find('status').textContent, /todavía no está habilitada/);
  const tampered = harness({state: {...state(), preview: {...state().preview, contracts: [{contractId: id(7)}]}}}); await tampered.open();
  assert.equal(tampered.find('overview'), null); assert.match(tampered.find('status').textContent, /no coincide con lo esperado/);
});
test('con declaraciones vigentes se elige completar los que faltan o declarar de nuevo a todos', async () => {
  const h = harness({state: partial()}); await h.open();
  assert.match(h.text(), /3 contratos tienen una declaración vigente, de 5 en condiciones de ser declarados\. Faltan 2\./);
  assert.equal(h.find('scope').value, 'missing'); assert.match(h.find('scope-summary').textContent, /Se incluyen 2 contratos adoptados activos/);
  assert.equal(h.find('scope-areas').querySelectorAll('[data-ae-area-row]').length, 1);
  h.find('scope').value = 'all'; await h.find('scope').emit('change');
  assert.match(h.find('scope-summary').textContent, /Se incluyen 5 contratos.*dejan de estar acreditados/); assert.equal(h.find('scope-areas').querySelectorAll('[data-ae-area-row]').length, 2);
  h.server.post = payload => ({status: 201, body: {ok: true, data: receipt(payload)}});
  h.find('confirm').checked = true; h.find('reference').value = 'Nota sintética 12/2026 de prueba'; h.find('date').value = '2026-11-01';
  await h.find('submit').emit('click'); await settle();
  const sent = h.requests.find(r => r.method === 'POST').body.payload;
  assert.equal(sent.scope, 'all'); assert.equal(sent.previewVersion, 'd'.repeat(64));
  const full = partial({declaredContracts: 5}); full.preview.scopes.missing = {eligible: 0, areas: [], version: 'b'.repeat(64)};
  const only = harness({state: full}); await only.open();
  assert.equal(only.find('scope'), null); assert.match(only.find('scope-summary').textContent, /Se incluyen 5 contratos.*dejan de estar acreditados/);
});
