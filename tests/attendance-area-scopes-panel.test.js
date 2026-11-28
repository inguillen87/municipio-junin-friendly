// Real panel and model against a generated DOM and synthetic HTTP only: no accounts, no SQL, no municipal data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mountAttendanceAreaScopes, AREA_SCOPES_CONTEXT_EVENT, aasInstant } from '../assets/attendance-area-scopes-panel.js';
import { areaScopeIdentity } from '../assets/attendance-area-scopes-model.js';
import { PayrollPanelElement as Element, payrollPanelEvents as events } from './fixtures/payroll-panel-dom.js';
import { id, TENANT, OTHER_TENANT, ADMIN_EMAIL, unit, otherUnit, sector, member, scope, reading } from './fixtures/attendance-area-scopes-synthetic.js';

const instant = '2026-11-19T12:00:05+00:00';
const settle = () => new Promise(resolve => setImmediate(resolve));
const visible = (changes = {}) => ({ tenantId: TENANT, tenantLabel: 'Municipio sintético QA', canRead: true, canManage: true, visible: true, ...changes });

function harness(initial = {}) {
  const root = new Element(), docEvents = events(), win = events(), requests = [], saved = new Map();
  const doc = { ...docEvents, hidden: false, createElement: tag => new Element(tag) };
  const state = { data: reading(), unavailable: false, failPost: false, commitBeforeFailure: false, postRejection: null, readRejection: null, mutateRead: null, ...initial };
  let keyNumber = 1, version = 0;
  const fetch = async (url, options = {}) => {
    const parsed = new URL(url, 'https://synthetic.invalid');
    assert.equal(parsed.pathname, '/api/internal-attendance-area-scopes', 'sólo la fachada de áreas');
    assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store');
    requests.push({ url, method: options.method, body: options.body, headers: structuredClone(options.headers) });
    if (state.unavailable) return new Response(JSON.stringify({ ok: false, code: 'ATTENDANCE_AREA_SCOPE_UNAVAILABLE' }), { status: 503 });
    if (options.method === 'POST') {
      if (state.postRejection) return new Response(JSON.stringify({ ok: false, code: state.postRejection.code, error: 'x' }), { status: state.postRejection.status });
      const envelope = JSON.parse(options.body), sent = envelope.payload, key = options.headers['idempotency-key'];
      assert.deepEqual(Object.keys(envelope), ['operation', 'tenantId', 'payload']); assert.equal(envelope.operation, 'command'); assert.equal(envelope.tenantId, state.data.tenantId);
      assert.match(key, /^dddddddd-0000-4000-8000-\d{12}$/);
      let answer = saved.get(key);
      if (answer) answer = { ...structuredClone(answer), changed: false, replayed: true };
      else {
        const identity = areaScopeIdentity({ membershipId: sent.membershipId, capability: sent.capability, ...sent.area });
        const existing = state.data.scopes.find(item => areaScopeIdentity(item) === identity);
        const wanted = sent.operation === 'grant', changed = !existing || existing.active !== wanted;
        const facts = existing ? { ...existing } : scope(40 + ++version, { membershipId: sent.membershipId, capability: sent.capability,
          organizationUnitSourceId: sent.area.organizationUnitSourceId, sectorSourceId: sent.area.sectorSourceId,
          organizationUnitLabel: state.data.organizationUnits.find(item => item.id === sent.area.organizationUnitSourceId).label,
          sectorLabel: sent.area.sectorSourceId === null ? null : state.data.sectors.find(item => item.id === sent.area.sectorSourceId).label,
          capabilityHeld: state.data.memberships.find(item => item.membershipId === sent.membershipId).areaCapabilities.includes(sent.capability), version: 0 });
        if (changed) Object.assign(facts, { active: wanted, version: facts.version + 1, authorizationReference: sent.authorizationReference, updatedAt: instant });
        answer = { version: state.data.version, resource: 'command', tenantId: state.data.tenantId, operation: sent.operation, changed, replayed: false,
          scope: { scopeId: facts.scopeId, membershipId: facts.membershipId, capability: facts.capability, organizationUnitSourceId: facts.organizationUnitSourceId,
            sectorSourceId: facts.sectorSourceId, active: facts.active, version: facts.version, authorizationReference: facts.authorizationReference,
            updatedByEmail: facts.updatedByEmail, updatedAt: facts.updatedAt } };
        if (!state.failPost || state.commitBeforeFailure) {
          saved.set(key, structuredClone(answer));
          if (changed) { state.data.scopes = [...state.data.scopes.filter(item => item.scopeId !== facts.scopeId), facts]; state.data.scopeSetVersion = String(version).repeat(64).slice(0, 64); }
        }
      }
      if (state.failPost) throw Error('Pérdida de red sintética');
      return new Response(JSON.stringify({ ok: true, data: answer }), { status: 200 });
    }
    assert.equal(parsed.searchParams.get('resource'), 'scopes');
    if (state.readRejection) return new Response(JSON.stringify({ ok: false, code: state.readRejection.code }), { status: state.readRejection.status });
    const payload = structuredClone({ ...state.data, tenantId: parsed.searchParams.get('tenantId') });
    await state.mutateRead?.(payload);
    return new Response(JSON.stringify({ ok: true, data: payload }), { status: 200 });
  };
  const mounted = mountAttendanceAreaScopes(root, { document: doc, window: win, fetch, context: initial.context ?? visible(),
    createKey: () => 'dddddddd-0000-4000-8000-' + String(keyNumber++).padStart(12, '0') });
  const q = key => { const found = root.querySelector('[data-aas-' + key + ']'); assert.ok(found, key); return found; };
  const click = key => q(key).emit('click');
  const edit = async (key, value, event = 'change') => { q(key).value = value; await q(key).emit(event); };
  const rows = () => q('rows').children.map(row => Object.fromEntries(row.children.map(cell => [cell.getAttribute('data-label'), cell.textContent])));
  const posts = () => requests.filter(item => item.method === 'POST');
  const context = detail => docEvents.dispatch(AREA_SCOPES_CONTEXT_EVENT, detail);
  async function start(account = id(10)) { await mounted.ready; await edit('account', account); }
  async function prepareGrant({ capability = 'attendance.area.read', unitId = otherUnit.id, sectorId = 'none', reference = 'Resolución sintética QA 12/2026' } = {}) {
    await edit('capability', capability); await edit('unit', unitId); await edit('sector', sectorId); q('grant-reference').value = reference; await click('prepare-grant');
  }
  const confirm = async () => { q('confirm').checked = true; await q('confirm').emit('change'); await click('send'); await settle(); };
  return { root, doc, docEvents, win, state, requests, mounted, q, click, edit, rows, posts, context, start, prepareGrant, confirm };
}
const text = h => h.root.textContent;

test('lee sólo el municipio filtrado y muestra las cuentas; los datos aparecen recién al elegir una cuenta', async () => {
  const h = harness(); await h.mounted.ready;
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].method, 'GET');
  assert.equal(h.requests[0].url, '/api/internal-attendance-area-scopes?resource=scopes&tenantId=' + TENANT);
  assert.deepEqual(h.q('account').children.map(option => option.value), ['', id(10), id(11), id(12)]);
  assert.match(h.q('account').children[3].textContent, /Administración sintética QA · administracion\.qa@example\.invalid \(tu cuenta\)$/);
  assert.equal(h.q('workspace').hidden, false); assert.equal(h.q('content').hidden, true); assert.equal(h.rows().length, 0);
  assert.match(h.q('status').textContent, /^Lista actualizada para Municipio sintético QA\. Elegí una cuenta\.$/);
  assert.equal(h.q('status').getAttribute('aria-live'), 'polite'); assert.equal(h.q('status').getAttribute('role'), 'status');
  assert.deepEqual(h.q('capability').children.map(option => option.textContent), ['Elegir permiso…', 'Consultar asistencia por área', 'Preparar dispositivos esperados', 'Revisar dispositivos esperados', 'Consultar historial de dispositivos']);
  assert.deepEqual(h.q('sector').children.map(option => option.textContent), ['Elegir sector…', 'Sin sector', sector.label], '«Sin sector» se elige a propósito; no es el valor inicial');
  await h.edit('account', id(10));
  assert.equal(h.q('content').hidden, false);
  assert.deepEqual(h.rows(), [{ Permiso: 'Consultar asistencia por área', 'Repartición': unit.label, Sector: sector.label, Estado: 'Vigente',
    'Referencia de autorización': 'Nota sintética QA 001/2026', 'Última modificación': ADMIN_EMAIL + ' · ' + aasInstant('2026-11-19T12:00:00.000000+00:00'), 'Acción': 'Retirar' }]);
  assert.equal(h.q('rows').children[0].getAttribute('data-list-row'), '', 'cada fila es una tarjeta en el teléfono');
  assert.equal(aasInstant('2026-11-19T12:00:00.000000+00:00'), '19/11/2026 09:00 h');
  assert.equal(h.posts().length, 0);
});

test('conceder exige permiso, repartición, sector o «Sin sector», referencia y una confirmación explícita; después relee la lista', async () => {
  const h = harness(); await h.start();
  await h.click('prepare-grant');
  assert.match(h.q('status').textContent, /Elegí el permiso, la repartición y el sector/); assert.equal(h.q('confirmation').hidden, true);
  await h.prepareGrant({ reference: 'corta' });
  assert.match(h.q('status').textContent, /entre 10 y 500 caracteres/); assert.equal(h.q('confirmation').hidden, true);
  await h.prepareGrant({ unitId: unit.id, sectorId: sector.id });
  assert.match(h.q('status').textContent, /ya tiene concedida esa área/); assert.equal(h.posts().length, 0);
  await h.prepareGrant({ reference: '  Resolución   sintética QA\n12/2026 ' });
  assert.equal(h.q('confirmation').hidden, false); assert.equal(h.q('confirm-title').textContent, 'Revisar antes de conceder el área');
  assert.deepEqual(h.q('confirm-facts').children.map(item => item.textContent), ['Cuenta', 'Cuenta sintética 10 · cuenta10@example.invalid', 'Permiso', 'Consultar asistencia por área',
    'Repartición', otherUnit.label, 'Sector', 'Sin sector', 'Referencia de autorización', 'Resolución sintética QA 12/2026']);
  assert.equal(h.q('send').disabled, true, 'sin tildar la revisión no se envía'); assert.equal(h.q('grant-fields').disabled, true, 'lo revisado no se edita por debajo');
  await h.click('send'); assert.equal(h.posts().length, 0);
  await h.q('send').listeners.get('click')[0](); await settle(); assert.equal(h.posts().length, 0, 'tampoco si se fuerza el botón deshabilitado');
  await h.confirm();
  assert.equal(h.posts().length, 1);
  const sent = JSON.parse(h.posts()[0].body);
  assert.deepEqual(sent, { operation: 'command', tenantId: TENANT, payload: { operation: 'grant', membershipId: id(10), capability: 'attendance.area.read',
    area: { organizationUnitSourceId: otherUnit.id, sectorSourceId: null }, authorizationReference: 'Resolución sintética QA 12/2026', scopeSetVersion: 'b'.repeat(64) } });
  assert.equal(h.posts()[0].headers['idempotency-key'], 'dddddddd-0000-4000-8000-000000000001'); assert.equal(h.posts()[0].headers['Content-Type'], 'application/json');
  assert.equal(h.requests.at(-1).method, 'GET', 'después de cada cambio se vuelve a leer la lista');
  assert.match(h.q('receipt').textContent, /^Área concedida \(revisión 1\): Consultar asistencia por área · Cuenta sintética 10/); assert.equal(h.q('receipt').hidden, false);
  assert.equal(h.q('status').dataset.state, 'success'); assert.equal(h.q('confirmation').hidden, true);
  assert.equal(h.q('account').value, id(10), 'la cuenta elegida se conserva'); assert.equal(h.rows().length, 2);
  assert.deepEqual(h.rows().map(row => row.Sector).sort(), ['Sin sector', sector.label].sort());
});

test('retirar pide su propia referencia y una confirmación explícita; la fila queda retirada y conserva su historial', async () => {
  const h = harness(); await h.start();
  const button = h.q('rows').querySelector('[data-aas-withdraw]');
  assert.match(button.getAttribute('aria-label'), /^Retirar Consultar asistencia por área en Repartición sintética QA \/ Sector exclusivamente ficticio$/);
  await button.emit('click');
  assert.equal(h.q('withdraw-fields').hidden, false); assert.match(h.q('withdraw-target').textContent, /^Vas a retirar: Consultar asistencia por área · Repartición sintética QA \/ Sector exclusivamente ficticio\.$/);
  assert.equal(h.posts().length, 0, 'apretar «Retirar» todavía no cambia nada');
  await h.click('prepare-withdraw'); assert.match(h.q('status').textContent, /referencia de autorización/); assert.equal(h.q('confirmation').hidden, true);
  h.q('withdraw-reference').value = 'Nota sintética QA 045/2026 de baja'; await h.click('prepare-withdraw');
  assert.equal(h.q('confirm-title').textContent, 'Revisar antes de retirar el área'); assert.equal(h.q('send').textContent, 'Retirar el área'); assert.equal(h.q('send').disabled, true);
  await h.click('cancel'); assert.equal(h.q('confirmation').hidden, true); assert.equal(h.q('withdraw-fields').hidden, false); assert.equal(h.posts().length, 0);
  await h.click('prepare-withdraw'); await h.confirm();
  assert.equal(h.posts().length, 1);
  assert.deepEqual(JSON.parse(h.posts()[0].body).payload, { operation: 'withdraw', membershipId: id(10), capability: 'attendance.area.read',
    area: { organizationUnitSourceId: unit.id, sectorSourceId: sector.id }, authorizationReference: 'Nota sintética QA 045/2026 de baja', scopeSetVersion: 'b'.repeat(64) });
  assert.match(h.q('receipt').textContent, /^Área retirada \(revisión 2\)/);
  assert.deepEqual(h.rows().map(row => [row.Estado, row['Acción'], row['Referencia de autorización']]), [['Retirada', 'Para volver a concederla, usá el paso 2.', 'Nota sintética QA 045/2026 de baja']]);
  assert.equal(h.q('withdraw-fields').hidden, true);
});

test('avisa cuando el área no va a funcionar porque la cuenta no tiene el permiso, sin impedir registrarla', async () => {
  const data = reading(); data.scopes.push(scope(21, { membershipId: id(11), capabilityHeld: false }));
  const h = harness({ data }); await h.start(id(11));
  assert.match(h.q('warning').textContent, /todavía no funcionan porque la cuenta no tiene el permiso correspondiente\. Asignalo en Usuarios y roles\./);
  assert.match(h.q('warning').textContent, /le falta el permiso «Consultar asistencia por área»/); assert.equal(h.q('warning').hidden, false);
  assert.match(h.rows()[0].Estado, /^VigenteTodavía no funciona: falta asignar el permiso\.$/);
  await h.edit('capability', 'attendance.area.devices.propose');
  assert.equal(h.q('grant-note').hidden, false); assert.match(h.q('grant-note').textContent, /todavía no tiene el permiso «Preparar dispositivos esperados»\. Podés registrar el área, pero no va a funcionar/);
  await h.prepareGrant({ capability: 'attendance.area.devices.propose' });
  assert.match(h.q('confirm-note').textContent, /el área queda registrada, pero no va a funcionar hasta que se lo asignen en Usuarios y roles/);
  await h.confirm(); assert.equal(h.posts().length, 1);
  // Con el permiso, sin aviso.
  const ok = harness(); await ok.start();
  assert.equal(ok.q('warning').hidden, true); await ok.edit('capability', 'attendance.area.read'); assert.equal(ok.q('grant-note').hidden, true);
});

test('la cuenta propia, una cuenta no activa y una sesión de sólo consulta no pueden lo que el servidor también niega', async () => {
  const data = reading(); data.scopes.push(scope(22, { membershipId: id(12) }));
  data.memberships.push(member(13, { status: 'suspended', grantable: false, areaCapabilities: [] }));
  data.scopes.push(scope(23, { membershipId: id(13), capabilityHeld: false, organizationUnitSourceId: '999', organizationUnitLabel: null, areaInCatalog: false }));
  const h = harness({ data }); await h.start(id(12));
  assert.match(h.q('account-note').textContent, /Es tu propia cuenta: podés ver sus áreas, pero tiene que cambiarlas otra persona administradora\./);
  assert.equal(h.q('grant-fields').disabled, true); assert.equal(h.q('rows').querySelector('[data-aas-withdraw]').disabled, true);
  await h.q('rows').querySelector('[data-aas-withdraw]').emit('click'); await h.click('prepare-grant');
  assert.equal(h.q('withdraw-fields').hidden, true); assert.equal(h.q('confirmation').hidden, true); assert.equal(h.posts().length, 0);
  // Cuenta no activa: sólo retirar. El área que ya no figura en el catálogo se puede retirar igual.
  await h.edit('account', id(13));
  assert.match(h.q('account').children[4].textContent, /\(cuenta no activa\)$/); assert.match(h.q('account-note').textContent, /sólo se le pueden retirar áreas/);
  assert.equal(h.q('grant-fields').disabled, true); assert.equal(h.rows()[0]['Repartición'], 'Repartición 999 (ya no figura en el catálogo)');
  assert.match(h.q('warning').textContent, /ya no figura en el catálogo aprobado/);
  await h.q('rows').querySelector('[data-aas-withdraw]').emit('click'); h.q('withdraw-reference').value = 'Nota sintética QA de baja 9/2026'; await h.click('prepare-withdraw'); await h.confirm();
  assert.equal(h.posts().length, 1); assert.equal(JSON.parse(h.posts()[0].body).payload.operation, 'withdraw');
  // Sólo consulta: ve, pero no puede preparar cambios.
  const reader = harness({ context: visible({ canManage: false }) }); await reader.start();
  assert.match(reader.q('account-note').textContent, /puede consultar las áreas, pero no concederlas ni retirarlas/);
  assert.equal(reader.q('grant-fields').disabled, true); assert.equal(reader.q('rows').querySelector('[data-aas-withdraw]').disabled, true);
  await reader.q('rows').querySelector('[data-aas-withdraw]').emit('click'); assert.equal(reader.posts().length, 0);
});

test('retira los datos cuando la pestaña se oculta, cambian los permisos, cambia el municipio o se sale de la sección', async () => {
  const h = harness(); await h.start();
  const withdrawn = () => { assert.equal(h.rows().length, 0); assert.deepEqual(h.q('account').children.map(option => option.value), ['']); assert.equal(h.q('workspace').hidden, true);
    assert.doesNotMatch(text(h), /example\.invalid|Cuenta sintética|Nota sintética|Repartición sintética/); };
  h.doc.hidden = true; h.docEvents.dispatch('visibilitychange');
  withdrawn(); assert.match(h.q('status').textContent, /Se retiraron los datos de la pantalla/);
  const before = h.requests.length; await h.click('refresh'); assert.equal(h.requests.length, before, 'oculta, no consulta');
  h.doc.hidden = false; await h.click('refresh'); await h.edit('account', id(10)); assert.equal(h.rows().length, 1);
  h.docEvents.dispatch('municontrol:capabilities-ready');
  withdrawn(); assert.match(h.q('status').textContent, /Cambió el acceso/);
  // Otro municipio en el filtro de administración: se retira lo anterior y se lee el nuevo.
  h.context(visible({ tenantId: OTHER_TENANT, tenantLabel: 'Otro municipio sintético' })); await settle();
  assert.equal(h.requests.at(-1).url, '/api/internal-attendance-area-scopes?resource=scopes&tenantId=' + OTHER_TENANT);
  assert.match(h.q('status').textContent, /^Lista actualizada para Otro municipio sintético\./); assert.equal(h.q('account').value, '', 'no se arrastra la cuenta del municipio anterior');
  // Sin permiso de consulta o sin municipio no hay pedido.
  const count = h.requests.length;
  h.context(visible({ tenantId: OTHER_TENANT, canRead: false, canManage: false })); await settle();
  withdrawn(); assert.match(h.q('status').textContent, /no tiene permiso para administrar las áreas/);
  h.context(visible({ tenantId: '' })); await settle();
  assert.match(h.q('status').textContent, /Elegí un municipio en el filtro de administración/);
  h.context(visible({ visible: false })); await settle();
  withdrawn(); assert.equal(h.requests.length, count);
  // Salir de la sección con datos en pantalla: se retiran sin consultar, y «Actualizar» no consulta fuera de la vista.
  h.context(visible()); await settle(); await h.edit('account', id(10)); assert.equal(h.rows().length, 1);
  const shown = h.requests.length;
  h.context(visible({ visible: false })); await settle();
  withdrawn(); assert.match(h.q('status').textContent, /Se retiraron los datos de la pantalla/); assert.equal(h.requests.length, shown);
  await h.q('refresh').listeners.get('click')[0](); await settle(); assert.equal(h.requests.length, shown);
  // Al cerrar la página no queda nada y ya no escucha.
  h.context(visible()); await settle(); await h.edit('account', id(10)); assert.equal(h.rows().length, 1);
  h.win.dispatch('pagehide'); withdrawn();
  const closed = h.requests.length; h.context(visible()); await settle(); await h.click('refresh'); assert.equal(h.requests.length, closed);
});

test('una sección que no está a la vista no consulta hasta que la administración la abre', async () => {
  const h = harness({ context: visible({ visible: false }) }); await h.mounted.ready;
  assert.equal(h.requests.length, 0); assert.match(h.q('status').textContent, /Abrí esta sección/);
  h.context(visible()); await settle();
  assert.equal(h.requests.length, 1); assert.equal(h.q('workspace').hidden, false);
  // El contexto inicial también puede venir de los atributos que escribe la página antes de que cargue el módulo.
  const root = new Element(); Object.assign(root.dataset, { tenantId: TENANT, tenantLabel: 'Municipio sintético QA', canRead: 'true', canManage: 'false', visible: 'true' });
  const asked = []; const docEvents = events();
  const mounted = mountAttendanceAreaScopes(root, { document: { ...docEvents, hidden: false, createElement: tag => new Element(tag) }, window: events(),
    fetch: async url => { asked.push(url); return new Response(JSON.stringify({ ok: true, data: reading() }), { status: 200 }); } });
  await mounted.ready; assert.deepEqual(asked, ['/api/internal-attendance-area-scopes?resource=scopes&tenantId=' + TENANT]);
});

test('si las áreas cambiaron desde la última lectura no se registra nada: se explica y se actualiza la lista', async () => {
  const h = harness(); await h.start(); await h.prepareGrant();
  h.state.postRejection = { status: 409, code: 'ATTENDANCE_AREA_SCOPE_STALE' };
  h.state.data.scopes.push(scope(24, { organizationUnitSourceId: otherUnit.id, organizationUnitLabel: otherUnit.label }));
  await h.confirm();
  assert.equal(h.posts().length, 1); assert.equal(h.requests.at(-1).method, 'GET');
  assert.match(h.q('status').textContent, /^Las áreas o el catálogo cambiaron desde tu última consulta\. No se registró el cambio\. Se actualizó la lista: revisala antes de volver a intentar\.$/);
  assert.equal(h.q('recovery').hidden, true, 'un rechazo no deja un envío pendiente'); assert.equal(h.q('confirmation').hidden, true); assert.equal(h.rows().length, 2);
  for (const [code, status, expected] of [['SELF_ASSIGNMENT', 403, /tu propia cuenta/], ['AREA_NOT_IN_CATALOG', 409, /no figura en el catálogo aprobado/], ['MEMBERSHIP_NOT_ACTIVE', 409, /no está activa/]]) {
    const other = harness(); await other.start(); await other.prepareGrant(); other.state.postRejection = { status, code: 'ATTENDANCE_AREA_SCOPE_' + code }; await other.confirm();
    assert.match(other.q('status').textContent, expected, code); assert.equal(other.q('recovery').hidden, true); assert.equal(other.posts().length, 1);
  }
});

test('un envío sin respuesta queda pendiente: se reintenta exactamente el mismo, con la misma clave, y no se duplica', async () => {
  const h = harness({ failPost: true, commitBeforeFailure: true }); await h.start(); await h.prepareGrant(); await h.confirm();
  assert.equal(h.posts().length, 1); assert.equal(h.q('recovery').hidden, false); assert.equal(h.q('status').dataset.state, 'uncertain');
  assert.match(h.q('status').textContent, /No se confirmó el envío\. Puede haberse registrado/);
  assert.equal(h.q('grant-fields').disabled, true); assert.equal(h.q('account-fields').disabled, true, 'nada más se puede preparar mientras tanto');
  h.state.failPost = false; await h.click('retry'); await settle();
  assert.equal(h.posts().length, 2); assert.equal(h.posts()[1].body, h.posts()[0].body); assert.deepEqual(h.posts()[1].headers, h.posts()[0].headers);
  assert.match(h.q('receipt').textContent, /^Ese envío ya estaba registrado\. La fila figura hoy como vigente \(revisión 1\)/);
  assert.equal(h.q('recovery').hidden, true); assert.equal(h.rows().length, 2);
  // Ocupado: nada se registró; se ofrece reintentar lo mismo.
  const busy = harness({ postRejection: { status: 409, code: 'ATTENDANCE_AREA_SCOPE_BUSY' } }); await busy.start(); await busy.prepareGrant(); await busy.confirm();
  assert.match(busy.q('status').textContent, /Hay otra operación en curso/); assert.equal(busy.q('recovery').hidden, false);
  busy.state.postRejection = null; await busy.click('retry'); await settle();
  assert.equal(busy.posts()[1].headers['idempotency-key'], busy.posts()[0].headers['idempotency-key']); assert.match(busy.q('receipt').textContent, /^Área concedida/);
  // Descartar: no se reenvía; se vuelve a leer para comprobar.
  const dropped = harness({ failPost: true }); await dropped.start(); await dropped.prepareGrant(); await dropped.confirm();
  dropped.state.failPost = false; await dropped.click('discard'); await settle();
  assert.equal(dropped.posts().length, 1); assert.equal(dropped.q('recovery').hidden, true); assert.equal(dropped.requests.at(-1).method, 'GET');
});

test('sin instalación, sin permiso o con una respuesta que no cierra, no muestra datos', async () => {
  const off = harness({ unavailable: true }); await off.mounted.ready;
  assert.match(off.q('status').textContent, /todavía no está habilitada o no responde\. No se consultó ni cambió ningún dato\./); assert.equal(off.q('status').dataset.state, 'unavailable'); assert.equal(off.q('workspace').hidden, true);
  const denied = harness({ readRejection: { status: 403, code: 'ATTENDANCE_AREA_SCOPE_FORBIDDEN' } }); await denied.mounted.ready;
  assert.match(denied.q('status').textContent, /no tiene permiso/); assert.equal(denied.q('status').dataset.state, 'denied'); assert.equal(denied.q('login').hidden, true);
  const expired = harness({ readRejection: { status: 401, code: 'IDENTITY_SESSION_REQUIRED' } }); await expired.mounted.ready;
  assert.match(expired.q('status').textContent, /La sesión venció/); assert.equal(expired.q('login').hidden, false);
  for (const mutateRead of [d => d.tenantId = OTHER_TENANT, d => d.memberships[0].dni = 'FORBIDDEN_SYNTHETIC', d => d.scopes[0].capabilityHeld = false, d => d.scopes[0].organizationUnitLabel = 'FORBIDDEN_SYNTHETIC']) {
    const h = harness({ mutateRead }); await h.mounted.ready;
    assert.match(h.q('status').textContent, /La respuesta no coincide con el municipio o la operación consultados/); assert.equal(h.q('workspace').hidden, true);
    assert.doesNotMatch(text(h), /FORBIDDEN_SYNTHETIC|example\.invalid/);
  }
});

test('el panel escribe datos sólo como texto, no guarda nada en el navegador y habla en lenguaje llano', () => {
  const source = fs.readFileSync(new URL('../assets/attendance-area-scopes-panel.js', import.meta.url), 'utf8');
  const template = source.slice(source.indexOf('host.innerHTML = `'), source.indexOf('`;', source.indexOf('host.innerHTML = `')));
  assert.equal(source.split('innerHTML').length - 1, 1, 'una sola plantilla fija'); assert.doesNotMatch(template, /\$\{/, 'sin datos interpolados');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|insertAdjacentHTML|outerHTML|\beval\(/);
  assert.doesNotMatch(source.replace(/\/\/[^\n]*/g, ''), /console\./);
  // Sin jerga hacia la persona: ni «scope», ni «tenant», ni «membresía», ni «binding», ni claves técnicas de capacidad.
  const copy = [...source.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map(m => m[1]).filter(value => /\s/.test(value) && /[áéíóúñ¿¡]|[a-z]{4,} [a-z]{2,}/i.test(value)).join('\n') + template.replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(copy, /\bscopes?\b|\btenant\b|membres[ií]a|\bbinding\b|idempot|\bSQL\b|attendance\.area/i);
  assert.match(template, /Áreas de asistencia de la cuenta/); assert.match(template, /Referencia de autorización/); assert.match(source, /'Sin sector'/);
  const css = fs.readFileSync(new URL('../assets/attendance-area-scopes-panel.css', import.meta.url), 'utf8');
  assert.match(css, /\.aas button,\.aas a\.button\{min-height:44px/); assert.match(css, /\.aas select,\.aas textarea\{[^}]*min-height:44px/);
  assert.match(css, /@media \(max-width:620px\)\{[\s\S]*\.aas-table td::before\{content:attr\(data-label\)/, 'tarjetas en el teléfono');
  assert.doesNotMatch(css, /min-width:\s*(?:3[3-9]\d|[4-9]\d\d|\d{4,})px/, 'nada obliga a más de 320 px de ancho');
});
