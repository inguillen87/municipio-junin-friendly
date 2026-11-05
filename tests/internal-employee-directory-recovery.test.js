// R15 · Recuperación de la consulta de legajos (Personas) sin F5. Ejercita las funciones REALES de internal-dashboard.html
// extraídas por nombre y ejecutadas en un contexto VM, junto con los bindings reales de Buscar/filtros, con DOM mínimo,
// transporte y reloj controlados por la prueba. El transporte IGNORA abort de forma explícita (nunca observa la señal):
// el plazo y la cancelación deben resolver la espera por sí mismos. No se copia la implementación ni se espera tiempo
// real. Los resultados creados en el realm VM se comparan por campos primitivos o tras un puente JSON explícito al realm
// del host. No prueba el 500 del servidor, su rendimiento ni la disponibilidad municipal; auth/summary y el botón
// Actualizar global quedan fuera de alcance.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const html = await readFile(new URL('../internal-dashboard.html', import.meta.url), 'utf8');

function balanced(source, open) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return index;
  }
  assert.fail('bloque sin cierre');
}
function functionSource(name) {
  const matches = [...html.matchAll(new RegExp(`\\n\\s*((?:async\\s+)?function ${name}\\()`, 'g'))];
  assert.equal(matches.length, 1, `función ${name} única`);
  const start = matches[0].index + matches[0][0].indexOf(matches[0][1]);
  const open = html.indexOf('{', html.indexOf(')', start) + 1);
  return html.slice(start, balanced(html, open) + 1);
}
function line(prefix) {
  const lines = html.split('\n').map(l => l.trim()).filter(l => l.startsWith(prefix));
  assert.equal(lines.length, 1, `línea única ${prefix}`);
  return lines[0];
}
function statement(marker) {
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, marker);
  assert.equal(html.indexOf(marker, start + 1), -1, `${marker} único`);
  const end = html.indexOf('});', start);
  return html.slice(start, end + 3);
}
function objectConst(name) {
  const marker = `const ${name} = {`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, marker);
  assert.equal(html.indexOf(marker, start + 1), -1, `${marker} único`);
  return html.slice(start, balanced(html, start + marker.length - 1) + 1) + ';';
}

const FUNCTIONS = ['text', 'finiteNumber', 'nonNegativeNumber', 'normalizeBoolean', 'formatNumber', 'displayValue', 'create',
  'readableKey', 'errorMessage', 'friendlyNetworkError', 'capabilitySet', 'renderDirectoryScope', 'refreshSectorOptions', 'refreshFacetOptions',
  'collectDirectoryFacets', 'collectRowSectors', 'normalizeEmployees', 'employeeQuery', 'setEmployeesLoading',
  'startEmployeeOperation', 'finishEmployeeOperation', 'invalidateEmployeeOperation', 'cancelEmployeeQuery',
  'employeeUnavailableReason', 'ensureEmployeeOperationCurrent', 'employeeHttpFailure',
  'requestEmployeeDirectory', 'renderEmployeesNotice', 'retireDirectoryFacets', 'withdrawEmployeeDirectory',
  'employeeVisibilityChanged', 'employeeCapabilitiesChanged', 'loadEmployees', 'statusDisplay', 'crosswalkDisplay',
  'controlStateLabel', 'appendCell', 'detailButton', 'renderEmployees', 'renderEmployeesError', 'applyFilters', 'showView'];
const BINDINGS = [
  line('let searchTimer = null;'),
  statement("els.employeeHistory.addEventListener('toggle', "),
  line("els.employeeFilters.addEventListener('submit', "),
  statement("els.employeeSearch.addEventListener('input', function () {"),
  ...['sectorFilter', 'organizationFilter', 'agreementFilter', 'statusFilter', 'crosswalkFilter'].map(id => line(`els.${id}.addEventListener('change', applyFilters);`)),
];
const PROGRAM = [
  line('const DATA_URL = '), line('const PAGE_LIMIT = '), line('const EMPLOYEE_QUERY_DEADLINE_MS = '), line('const VALID_VIEWS = '),
  line('const numberFormatter = '), line('const integerFormatter = '),
  line('class UnauthorizedError extends Error'), line('class EmployeeQueryInterruption extends Error'), line('class EmployeeDirectoryResponseError extends Error'),
  objectConst('state'), objectConst('EMPLOYEE_NOTICES'),
  ...FUNCTIONS.map(functionSource),
  ...BINDINGS,
  'globalThis.api = { state, loadEmployees, cancelEmployeeQuery, withdrawEmployeeDirectory, employeeVisibilityChanged, employeeCapabilitiesChanged, showView };',
].join('\n');

// Puente explícito del realm VM al del host para comparar resultados sin depender de prototipos.
const plain = value => JSON.parse(JSON.stringify(value));

class FakeNode {
  constructor(tagName, className = '', content) {
    Object.assign(this, { tagName, className, children: [], dataset: {}, attrs: {}, style: {}, listeners: {}, hidden: false, disabled: false, value: '', focused: 0 });
    this.ownText = content === undefined ? '' : String(content);
  }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get options() { return this.children; }
  append(...nodes) { for (const node of nodes) { if (node && node.tagName === '#fragment') this.children.push(...node.children); else this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  emit(type, event = { type }) { for (const callback of this.listeners[type] || []) callback(event); return event; }
  click() { this.emit('click'); }
  focus() { this.focused += 1; }
  find(predicate) {
    for (const child of this.children) {
      if (child instanceof FakeNode) { if (predicate(child)) return child; const nested = child.find(predicate); if (nested) return nested; }
    }
    return null;
  }
  querySelector(selector) { return selector === '[data-legajo]' ? this.find(node => Boolean(node.dataset.legajo)) : null; }
}

function harness() {
  let now = 0, sequence = 0;
  const timers = new Map();
  const clock = {
    setTimeout(callback, ms) { const id = ++sequence; timers.set(id, { at: now + ms, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    pending: () => timers.size,
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) if (timer.at <= now && timers.has(id)) { timers.delete(id); timer.callback(); }
    },
  };
  const requests = [], bodies = [];
  const transport = {
    // Ignora abort a propósito: la promesa sólo la resuelve la prueba.
    fetch(url, options) { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); requests.push({ url, options, resolve, reject }); return promise; },
  };
  // hold: cuerpo retenido controlado por la prueba; reject: la lectura del cuerpo falla.
  const response = (status, body, { hold = false, reject = false } = {}) => ({
    status, ok: status >= 200 && status < 300,
    text() {
      if (reject) return Promise.reject(new TypeError('cuerpo interrumpido'));
      if (!hold) return Promise.resolve(body);
      return new Promise((resolve, fail) => bodies.push({ resolve, reject: fail }));
    },
  });
  const json = (status, value, options) => response(status, JSON.stringify(value), options);
  const events = [], redirects = [], detailWithdrawals = [];
  const ids = ['employeeHistory', 'employeeRows', 'employeeTableWrap', 'employeeResultCount', 'cancelEmployeeQuery', 'previousPage', 'nextPage', 'paginationStatus',
    'scopeContracts', 'scopePeople', 'scopeMatched', 'scopeAmbiguous', 'scopeUnmatched', 'sectorFilter', 'organizationFilter', 'agreementFilter',
    'statusFilter', 'crosswalkFilter', 'employeeSearch', 'employeeFilters', 'breadcrumbCurrent', 'topbarViewTitle'];
  const els = Object.fromEntries(ids.map(id => [id, new FakeNode(id)]));
  els.cancelEmployeeQuery.hidden = true; els.statusFilter.value = 'administrative_active'; els.crosswalkFilter.value = 'all';
  const document = {
    hidden: false, title: '',
    createElement: tag => new FakeNode(tag),
    createTextNode: value => ({ tagName: '#text', textContent: String(value) }),
    createDocumentFragment: () => new FakeNode('#fragment'),
    querySelectorAll: () => [], querySelector: () => null, dispatchEvent: () => true,
  };
  class Event { constructor(type) { this.type = type; } }
  class CustomEvent extends Event { constructor(type, init) { super(type); this.detail = init?.detail; } }
  const window = {
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    dispatchEvent: event => events.push(event.type),
    location: { hash: '' }, history: { pushState() {} }, scrollTo() {},
  };
  const context = {
    window, document, els, fetch: transport.fetch, AbortController, URLSearchParams, Intl, Node: FakeNode, Event, CustomEvent,
    qualityLabels: {}, redirectToLogin: () => redirects.push('login'), withdrawEmployeeDetail: () => detailWithdrawals.push('detail'),
    openEmployee: () => assert.fail('la lista no abre fichas por sí sola'),
  };
  vm.runInNewContext(PROGRAM, context, { filename: 'internal-employee-directory-recovery.js' });
  const api = context.api;
  return {
    api, state: api.state, els, document, clock, requests, bodies, response, json, events, redirects, detailWithdrawals,
    rows: () => els.employeeRows.textContent,
    action: () => els.employeeRows.find(node => node.tagName === 'button' && node.textContent === 'Volver a consultar'),
    submit() { let prevented = 0; els.employeeFilters.emit('submit', { type: 'submit', preventDefault() { prevented += 1; } }); return prevented; },
    flush: async () => { for (let i = 0; i < 12; i += 1) await new Promise(resolve => setImmediate(resolve)); },
  };
}
// Precondición explícita de los casos positivos: vista Personas, documento visible y permiso vigente recibido.
function ready(h) {
  // Precondición de los casos del transporte: histórico abierto y solicitado por el operador.
  h.els.employeeHistory.open = true;
  h.state.employeeHistoryQueried = true;
  h.state.currentView = 'legajos';
  h.document.hidden = false;
  h.api.employeeCapabilitiesChanged({ detail: { tenantCapabilities: ['workforce.employee.read'] } });
  return h;
}
const fresh = () => ready(harness());

const EMPLOYEE = (legajo, nombre) => ({ contractId: `00000000-0000-4000-8000-${String(legajo).padStart(12, '0')}`, companyId: 1, legajo: String(legajo), nombre, administrativeStatus: 'active', crosswalkStatus: 'matched', sector: 'Sector A' });
const PAGE = (rows, extra = {}) => ({ ok: true, data: rows, pagination: { page: 1, limit: 25, total: rows.length, pages: 1 }, scope: { totalContracts: 10, totalPeople: 9, matched: 8, ambiguous: 1, unmatched: 1 }, facets: { sectors: [{ value: 'Sector A' }], organizations: [{ value: 'Org A' }], agreements: [{ value: 'Conv A' }] }, ...extra });
const OK = { ok: true, resource: 'employees' };
const STALE = { ok: false, resource: 'employees', stale: true };

async function settled(h, pending, value) { h.requests.at(-1).resolve(value); await h.flush(); return pending; }

test('la fuente fija el plazo, el botón accesible, Buscar explícito y separa la consulta de legajos de requestJSON y del Actualizar global', () => {
  assert.match(html, /const EMPLOYEE_QUERY_DEADLINE_MS = 25000;/);
  assert.match(html, /<button class="button" id="cancelEmployeeQuery" type="button" hidden>Cancelar consulta<\/button>/);
  assert.match(html, /els\.cancelEmployeeQuery\.addEventListener\('click', cancelEmployeeQuery\);/);
  assert.match(html, /els\.employeeFilters\.addEventListener\('submit', function \(event\) \{ event\.preventDefault\(\); window\.clearTimeout\(searchTimer\); applyFilters\(true\); \}\);/);
  assert.ok(html.indexOf("els.logoutButton.addEventListener('click', function () { withdrawEmployeeDirectory('session'); });") < html.indexOf("els.logoutButton.addEventListener('click', logout);"));
  assert.match(html, /document\.addEventListener\('visibilitychange',employeeVisibilityChanged\);/);
  assert.match(html, /document\.addEventListener\('municontrol:capabilities-ready',employeeCapabilitiesChanged\);/);
  assert.doesNotMatch(functionSource('requestJSON'), /EMPLOYEE_QUERY_DEADLINE_MS|employeeOperation/);
  assert.doesNotMatch(functionSource('loadEmployees'), /requestJSON\(/);
  assert.doesNotMatch(functionSource('refreshCurrentView').split('els.refreshButton.disabled = true;')[1], /loadEmployees/);
  for (const name of ['requestEmployeeDirectory', 'loadEmployees', 'withdrawEmployeeDirectory', 'renderEmployeesNotice', 'retireDirectoryFacets', 'employeeCapabilitiesChanged'])
    assert.doesNotMatch(functionSource(name), /localStorage|sessionStorage|caches\.|method:\s*'(?:POST|PUT|PATCH|DELETE)'|setInterval/);
  assert.doesNotMatch(objectConst('EMPLOYEE_NOTICES'), /controlador|generaci|SQL|AbortError|abort|fetch|25000/i);
});

test('control positivo: Buscar explícito, data[] publicada con total, filtros y página de 25; sin temporizadores remanentes', async () => {
  const h = fresh();
  h.api.showView('legajos', false, false);
  assert.equal(h.requests.length, 0, 'entrar en Personas no consulta antecedentes');
  h.submit();
  assert.equal(h.requests.length, 1);
  const { url, options } = h.requests[0];
  assert.match(url, /^\/api\/internal-data\?resource=employees&search=&sector=&organization=&agreement=&status=administrative_active&crosswalk=all&includeFacets=1&page=1&limit=25$/);
  assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store'); assert.equal(options.headers.Accept, 'application/json');
  assert.equal(h.els.cancelEmployeeQuery.hidden, false); assert.equal(h.clock.pending(), 1);
  h.requests[0].resolve(h.json(200, PAGE([EMPLOYEE(42, 'PERSONA A'), EMPLOYEE(43, 'PERSONA B')])));
  await h.flush();
  assert.equal(h.state.employeesLoaded, true); assert.equal(h.state.employeesLoading, false);
  assert.equal(h.els.employeeResultCount.textContent, '2 legajos encontrados');
  assert.ok(h.els.employeeRows.querySelector('[data-legajo]'));
  assert.equal(h.els.cancelEmployeeQuery.hidden, true); assert.equal(h.clock.pending(), 0);
  assert.deepEqual(h.events, ['municontrol:workforce-scope']); assert.equal(h.redirects.length, 0);
});

test('envelopes legítimos: [] es "Sin resultados"; employees[] sin total (nulo ≠ 0); data[] tiene precedencia; página vacía con total>0; numéricos en texto; filas con campos opcionales', async () => {
  const h = fresh();
  assert.deepEqual(plain(await settled(h, h.api.loadEmployees(1), h.json(200, PAGE([])))), OK);
  assert.match(h.rows(), /Sin resultados/);
  assert.deepEqual(plain(await settled(h, h.api.loadEmployees(2), h.json(200, { ok: true, employees: [EMPLOYEE(7, 'PERSONA C')] }))), OK);
  assert.equal(h.els.employeeResultCount.textContent, '1 resultados en esta página · total no disponible');
  assert.equal(h.state.pagination.total, null);
  assert.deepEqual(plain(await settled(h, h.api.loadEmployees(3), h.json(200, { ok: true, data: [EMPLOYEE(8, 'DE DATA')], employees: [EMPLOYEE(9, 'DE EMPLOYEES')] }))), OK);
  assert.match(h.rows(), /DE DATA/); assert.doesNotMatch(h.rows(), /DE EMPLOYEES/);
  assert.deepEqual(plain(await settled(h, h.api.loadEmployees(4), h.json(200, { ok: true, data: [], pagination: { page: 4, limit: 25, total: 30, pages: 2 } }))), OK);
  assert.match(h.rows(), /Sin resultados/); assert.equal(h.els.employeeResultCount.textContent, '30 legajos encontrados');
  assert.deepEqual(plain(await settled(h, h.api.loadEmployees(5), h.json(200, { ok: true, data: [{ legajo: 'A-1' }, {}], pagination: { page: '1', limit: '25', total: '2', pages: '1' } }))), OK);
  assert.equal(h.state.pagination.total, 2); assert.equal(h.els.employeeResultCount.textContent, '2 legajos encontrados');
  assert.match(h.rows(), /A-1/);
});

test('200 ilegible, vacío, sin colección, arreglo suelto o 204 → error recuperable, nunca lista vacía válida', async () => {
  for (const reply of [r => r.response(200, '<html>no es json'), r => r.response(200, '   '), r => r.json(200, { ok: true, pagination: { total: 0 } }),
    r => r.json(200, []), r => r.json(200, { ok: true, data: null, employees: 'x' }), r => r.response(204, '')]) {
    const h = fresh();
    const result = await settled(h, h.api.loadEmployees(1), reply(h));
    assert.equal(result.ok, false); assert.equal(typeof result.error, 'object');
    assert.match(h.rows(), /No pudimos cargar los legajos/); assert.match(h.rows(), /no se pudo interpretar/);
    assert.doesNotMatch(h.rows(), /Sin resultados/);
    assert.equal(h.state.employeesLoaded, false); assert.equal(h.state.employeesLoading, false); assert.equal(h.clock.pending(), 0);
    assert.ok(h.action() === null && h.els.employeeRows.find(n => n.tagName === 'button' && n.textContent === 'Reintentar'));
  }
});

test('elementos del DTO no-objeto (primitiva, null, arreglo) son error de contrato antes de publicar scope, facetas, eventos o lista', async () => {
  for (const payload of [{ ok: true, data: [1] }, { ok: true, data: [[]] }, { ok: true, data: [null] }, { ok: true, data: ['42'] },
    { ok: true, employees: [EMPLOYEE(1, 'VÁLIDA'), 5] }, { ok: true, data: [{}, []], pagination: { total: 2 } }]) {
    const h = fresh();
    const result = await settled(h, h.api.loadEmployees(1), h.json(200, { ...payload, scope: { totalContracts: 99 }, facets: { sectors: [{ value: 'Sector Z' }] } }));
    assert.equal(result.ok, false); assert.equal(typeof result.error, 'object');
    assert.match(h.rows(), /no se pudo interpretar/); assert.doesNotMatch(h.rows(), /Sin resultados|VÁLIDA/);
    assert.ok(!h.events.includes('municontrol:workforce-scope'));
    assert.equal(h.els.scopeContracts.textContent, ''); assert.equal(h.state.sectors.size, 0); assert.equal(h.state.employeesLoaded, false);
  }
});

for (const stage of ['fetch', 'cuerpo']) {
  test(`plazo de UI sobre ${stage} 200 que no termina y transporte que ignora abort: libera estado y ofrece acción, sin reintento automático`, async () => {
    const h = fresh();
    const pending = h.api.loadEmployees(1);
    const request = h.requests[0];
    if (stage === 'cuerpo') { request.resolve(h.response(200, '', { hold: true })); await h.flush(); assert.equal(h.bodies.length, 1); }
    h.clock.advance(24_999); await h.flush();
    assert.equal(h.state.employeesLoading, true); assert.equal(request.options.signal.aborted, false);
    h.clock.advance(1);
    assert.deepEqual(plain(await pending), { ok: false, resource: 'employees', timeout: true });
    assert.equal(request.options.signal.aborted, true);
    assert.equal(h.state.employeesLoading, false); assert.equal(h.els.cancelEmployeeQuery.hidden, true); assert.equal(h.clock.pending(), 0);
    assert.match(h.rows(), /La consulta tardó demasiado/); assert.ok(h.action());
    assert.equal(h.requests.length, 1);
    if (stage === 'fetch') request.resolve(h.json(200, PAGE([EMPLOYEE(1, 'TARDÍA')])));
    else h.bodies[0].resolve(JSON.stringify(PAGE([EMPLOYEE(1, 'TARDÍA')])));
    await h.flush();
    assert.match(h.rows(), /La consulta tardó demasiado/); assert.doesNotMatch(h.rows(), /TARDÍA/);
    assert.deepEqual(h.events, ['municontrol:workforce-reset']);
  });
}

test('Cancelar consulta: sin reintento, foco en la acción; consulta duplicada normal se evita y la misma query se reconsulta explícitamente', async () => {
  const h = fresh();
  const first = h.api.loadEmployees(1);
  assert.deepEqual(plain(await h.api.loadEmployees(1)), { ok: false, resource: 'employees', pending: true });
  assert.equal(h.requests.length, 1);
  h.api.cancelEmployeeQuery();
  assert.deepEqual(plain(await first), { ok: false, resource: 'employees', cancelled: true });
  assert.equal(h.requests[0].options.signal.aborted, true); assert.equal(h.clock.pending(), 0);
  assert.match(h.rows(), /Consulta cancelada/); assert.equal(h.action().focused, 1);
  await h.flush(); assert.equal(h.requests.length, 1);
  h.action().click();
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].url, h.requests[0].url);
  h.requests[1].resolve(h.json(200, PAGE([EMPLOYEE(5, 'PERSONA D')]))); await h.flush();
  assert.equal(h.state.employeesLoaded, true); assert.match(h.rows(), /PERSONA D/);
  h.requests[0].resolve(h.json(200, PAGE([EMPLOYEE(6, 'CANCELADA')]))); await h.flush();
  assert.doesNotMatch(h.rows(), /CANCELADA/);
});

const LATE = {
  'éxito': h => h.json(200, PAGE([EMPLOYEE(9, 'DE A')])),
  'error': h => h.json(500, { ok: false, error: 'Fallo de A' }),
  '401': h => h.json(401, { ok: false }),
  '401 cuerpo retenido': h => h.response(401, '', { hold: true }),
  '401 cuerpo rechazado': h => h.response(401, '', { reject: true }),
  '403 cuerpo retenido': h => h.response(403, '', { hold: true }),
  '403 cuerpo rechazado': h => h.response(403, '', { reject: true }),
};
// Ventana: los ENCABEZADOS de A llegan después de iniciar B (A ya fue reemplazada: su cuerpo nunca se lee). La ventana
// de un cuerpo 403 de A cuya lectura YA había empezado antes de iniciar B se prueba aparte, más abajo.
for (const [late, reply] of Object.entries(LATE)) {
  test(`encabezados A tardíos tras iniciar B (${late}): no sobrescribe, no redirige, no cancela el plazo de B`, async () => {
    const h = fresh();
    h.state.filters.search = 'A'; const a = h.api.loadEmployees(1); const requestA = h.requests[0];
    h.state.filters.search = 'B'; const b = h.api.loadEmployees(1); const requestB = h.requests[1];
    assert.equal(requestA.options.signal.aborted, true); assert.equal(requestB.options.signal.aborted, false);
    assert.deepEqual(plain(await a), STALE);
    assert.equal(h.clock.pending(), 1);
    requestA.resolve(reply(h)); await h.flush();
    assert.equal(h.bodies.length, 0, 'el cuerpo de una A ya reemplazada no se lee');
    assert.equal(h.redirects.length, 0); assert.equal(h.clock.pending(), 1, 'el plazo de B sigue vivo');
    assert.match(h.rows(), /Consultando legajos/);
    requestB.resolve(h.json(200, PAGE([EMPLOYEE(10, 'DE B')]))); await h.flush();
    assert.deepEqual(plain(await b), OK);
    assert.match(h.rows(), /DE B/); assert.doesNotMatch(h.rows(), /DE A|Fallo de A/); assert.equal(h.redirects.length, 0); assert.equal(h.clock.pending(), 0);
  });
}

// Ventana distinta: encabezados 403 de A recibidos y aceptados ANTES de iniciar B; su lectura de cuerpo ya empezó y
// queda retenida (deferred exacto en h.bodies[0]). Luego se inicia B y recién entonces se resuelve o rechaza ese cuerpo.
async function startedForbiddenBody(h) {
  h.state.filters.search = 'A';
  const a = h.api.loadEmployees(1); const requestA = h.requests[0];
  requestA.resolve(h.response(403, '', { hold: true })); await h.flush();
  assert.equal(h.bodies.length, 1, 'la lectura del cuerpo 403 de A ya comenzó');
  const bodyA = h.bodies[0];
  assert.equal(h.state.employeesLoading, true); assert.equal(h.redirects.length, 0); assert.equal(h.clock.pending(), 1);
  assert.match(h.rows(), /Consultando legajos/);
  return { a, requestA, bodyA };
}
const SETTLE_A = {
  resuelto: body => body.resolve(JSON.stringify({ ok: false, error: 'Prohibido de A' })),
  rechazado: body => body.reject(new TypeError('cuerpo de A interrumpido')),
};
for (const [settle, finish] of Object.entries(SETTLE_A)) {
  test(`cuerpo 403 de A ya en lectura, B iniciada, cuerpo A ${settle}: A stale sin redirect ni aviso; B conserva timer, controlador y query y publica`, async () => {
    const h = fresh();
    const { a, requestA, bodyA } = await startedForbiddenBody(h);
    h.state.filters.search = 'B'; const b = h.api.loadEmployees(1); const requestB = h.requests[1];
    assert.equal(requestA.options.signal.aborted, true); assert.equal(requestB.options.signal.aborted, false);
    assert.deepEqual(plain(await a), STALE);
    finish(bodyA); await h.flush();
    assert.equal(h.redirects.length, 0); assert.equal(h.clock.pending(), 1, 'el timer de B sigue vivo');
    assert.equal(requestB.options.signal.aborted, false, 'el controlador de B no se aborta');
    assert.equal(h.state.employeeLastQuery, requestB.url); assert.equal(h.state.employeesLoading, true);
    assert.match(h.rows(), /Consultando legajos/); assert.doesNotMatch(h.rows(), /Prohibido de A|permiso|No pudimos cargar/);
    requestB.resolve(h.json(200, PAGE([EMPLOYEE(10, 'DE B')]))); await h.flush();
    assert.deepEqual(plain(await b), OK);
    assert.match(h.rows(), /DE B/); assert.doesNotMatch(h.rows(), /Prohibido de A/);
    assert.equal(h.redirects.length, 0); assert.equal(h.clock.pending(), 0); assert.equal(h.requests.length, 2);
  });
  test(`cuerpo 403 de A ya en lectura, B pendiente, cuerpo A ${settle}: el plazo propio de B vence igual (el cuerpo viejo no lo cancela)`, async () => {
    const h = fresh();
    const { a, bodyA } = await startedForbiddenBody(h);
    h.state.filters.search = 'B'; const b = h.api.loadEmployees(1); const requestB = h.requests[1];
    assert.deepEqual(plain(await a), STALE);
    finish(bodyA); await h.flush();
    assert.equal(h.clock.pending(), 1);
    h.clock.advance(24_999); await h.flush(); assert.equal(h.state.employeesLoading, true);
    h.clock.advance(1);
    assert.deepEqual(plain(await b), { ok: false, resource: 'employees', timeout: true });
    assert.equal(requestB.options.signal.aborted, true);
    assert.match(h.rows(), /La consulta tardó demasiado/); assert.doesNotMatch(h.rows(), /Prohibido de A/);
    assert.equal(h.redirects.length, 0); assert.equal(h.clock.pending(), 0); assert.equal(h.requests.length, 2);
  });
}
// Retiro por las funciones/eventos reales del harness mientras el cuerpo 403 de A está en lectura; volver/restaurar.
const WITHDRAW_A = {
  ocultación: { lose: h => { h.document.hidden = true; h.api.employeeVisibilityChanged(); }, back: h => { h.document.hidden = false; h.api.employeeVisibilityChanged(); h.api.showView('legajos', false, false); }, notice: /Consulta retirada/ },
  'salida de área': { lose: h => h.api.showView('inicio', false, false), back: h => h.api.showView('legajos', false, false), notice: /Consulta retirada/ },
  permisos: { lose: h => h.api.employeeCapabilitiesChanged({ detail: { tenantCapabilities: ['payroll.read'] } }), back: h => h.api.employeeCapabilitiesChanged({ detail: { tenantCapabilities: ['workforce.employee.read'] } }), notice: /Consulta de legajos no disponible/ },
};
for (const [cause, { lose, back, notice }] of Object.entries(WITHDRAW_A)) {
  for (const [settle, finish] of Object.entries(SETTLE_A)) {
    test(`cuerpo 403 de A ya en lectura, retiro por ${cause}, cuerpo A ${settle} antes de volver: retiro intacto, sin redirect, sin GET al volver`, async () => {
      const h = fresh();
      const { a, requestA, bodyA } = await startedForbiddenBody(h);
      lose(h);
      assert.deepEqual(plain(await a), STALE);
      assert.equal(requestA.options.signal.aborted, true); assert.equal(h.clock.pending(), 0);
      assert.match(h.rows(), notice);
      const eventsAfterWithdrawal = h.events.length;
      finish(bodyA); await h.flush();
      assert.match(h.rows(), notice); assert.doesNotMatch(h.rows(), /Prohibido de A|No pudimos cargar|Sin resultados/);
      assert.equal(h.redirects.length, 0); assert.equal(h.clock.pending(), 0); assert.equal(h.events.length, eventsAfterWithdrawal);
      assert.equal(h.state.employeesLoaded, false); assert.equal(h.state.employeesLoading, false);
      back(h); await h.flush();
      assert.equal(h.requests.length, 1, 'volver/restaurar no consulta solo'); assert.equal(h.clock.pending(), 0);
      assert.match(h.rows(), /Consulta retirada/); assert.ok(h.action());
    });
    test(`cuerpo 403 de A ya en lectura, retiro por ${cause}, consulta explícita B y luego cuerpo A ${settle}: B no se altera`, async () => {
      const h = fresh();
      const { a, bodyA } = await startedForbiddenBody(h);
      lose(h);
      assert.deepEqual(plain(await a), STALE);
      back(h); await h.flush();
      assert.equal(h.requests.length, 1);
      h.action().click();
      assert.equal(h.requests.length, 2); const requestB = h.requests[1];
      assert.equal(h.clock.pending(), 1); assert.equal(h.state.employeeLastQuery, requestB.url);
      finish(bodyA); await h.flush();
      assert.equal(h.redirects.length, 0); assert.equal(h.clock.pending(), 1, 'el timer de B sigue vivo');
      assert.equal(requestB.options.signal.aborted, false); assert.equal(h.state.employeeLastQuery, requestB.url);
      assert.equal(h.state.employeesLoading, true); assert.doesNotMatch(h.rows(), /Prohibido de A|No pudimos cargar/);
      requestB.resolve(h.json(200, PAGE([EMPLOYEE(11, 'EXPLÍCITA B')]))); await h.flush();
      assert.match(h.rows(), /EXPLÍCITA B/); assert.equal(h.clock.pending(), 0); assert.equal(h.redirects.length, 0);
    });
  }
}

test('A tardía 401 antes de que B responda: B conserva su propio plazo y vence sola', async () => {
  const h = fresh();
  h.state.filters.search = 'A'; h.api.loadEmployees(1); const requestA = h.requests[0];
  h.state.filters.search = 'B'; const b = h.api.loadEmployees(1);
  requestA.resolve(h.json(401, { ok: false })); await h.flush();
  h.clock.advance(25_000);
  assert.deepEqual(plain(await b), { ok: false, resource: 'employees', timeout: true });
  assert.equal(h.redirects.length, 0); assert.equal(h.clock.pending(), 0);
});

test('401 vigente redirige una vez SIN esperar el cuerpo (retenido, rechazado o resuelto); nunca se informa como plazo', async () => {
  for (const make of [h => h.response(401, '', { hold: true }), h => h.response(401, '', { reject: true }), h => h.response(401, '<html>'), h => h.json(401, { ok: false })]) {
    const h = fresh();
    const pending = h.api.loadEmployees(1);
    h.requests[0].resolve(make(h)); await h.flush();
    assert.deepEqual(plain(await pending), { ok: false, resource: 'employees', unauthorized: true });
    assert.deepEqual(h.redirects, ['login']); assert.equal(h.clock.pending(), 0); assert.equal(h.bodies.length, 0, 'no se lee el cuerpo del 401');
    assert.doesNotMatch(h.rows(), /tardó demasiado/);
  }
});

test('403 vigente conserva el estado de permiso con cuerpo retenido, rechazado, ilegible o resuelto: sin redirección, sin plazo, sin bucle', async () => {
  const cases = [
    { make: h => h.response(403, '', { hold: true }), wait: true, message: /Tu usuario no tiene permiso para consultar legajos\./ },
    { make: h => h.response(403, '', { reject: true }), message: /Tu usuario no tiene permiso para consultar legajos\./ },
    { make: h => h.response(403, '<html>prohibido'), message: /Tu usuario no tiene permiso para consultar legajos\./ },
    { make: h => h.json(403, { ok: false, error: 'Sin permiso para consultar legajos.' }), message: /Sin permiso para consultar legajos\./ },
  ];
  for (const { make, wait, message } of cases) {
    const h = fresh();
    const pending = h.api.loadEmployees(1);
    h.requests[0].resolve(make(h)); await h.flush();
    if (wait) { assert.equal(h.state.employeesLoading, true); h.clock.advance(25_000); }
    const result = await pending;
    assert.equal(result.ok, false); assert.equal(result.error.status, 403); assert.equal(result.error.retryable, false);
    assert.match(h.rows(), message); assert.doesNotMatch(h.rows(), /tardó demasiado|Sin resultados/);
    assert.equal(h.redirects.length, 0); assert.equal(h.state.employeeReadRevoked, false);
    h.clock.advance(120_000); await h.flush();
    assert.equal(h.requests.length, 1); assert.equal(h.clock.pending(), 0);
  }
});

for (const cause of ['hidden', 'area', 'permission']) {
  const lose = h => {
    if (cause === 'hidden') h.document.hidden = true;            // sin entregar visibilitychange
    if (cause === 'area') h.state.currentView = 'inicio';       // sin pasar por showView
    if (cause === 'permission') h.state.tenantCapabilities = new Set(['payroll.read']);   // estado ya no habilitado, sin evento
  };
  test(`vigencia real (${cause}) antes de iniciar: sin GET`, async () => {
    const h = fresh(); lose(h);
    const result = plain(await h.api.loadEmployees(1, { explicit: true }));
    assert.deepEqual(result, cause === 'permission' ? { ok: false, resource: 'employees', forbidden: true } : { ok: false, resource: 'employees', unavailable: true });
    assert.equal(h.requests.length, 0); assert.equal(h.clock.pending(), 0);
    if (cause === 'permission') { assert.equal(h.state.employeeReadRevoked, true); assert.match(h.rows(), /Consulta de legajos no disponible/); }
  });
  for (const stage of ['fetch', 'cuerpo']) {
    for (const status of [200, 401]) {
      // status 401: el 401 se atiende con los encabezados y nunca lee cuerpo; la variante 'cuerpo' repite la entrega de
      // encabezados 401 (no prueba un cuerpo 401 leído).
      const phase = status === 200 ? `antes de resolver ${stage} 200` : `antes de entregar encabezados 401 (variante ${stage}; el 401 no lee cuerpo)`;
      test(`vigencia real (${cause}) perdida ${phase}: no publica, no redirige, retira`, async () => {
        const h = fresh();
        const pending = h.api.loadEmployees(1);
        const body = status === 200 ? JSON.stringify(PAGE([EMPLOYEE(77, 'SIN VIGENCIA')])) : '';
        if (stage === 'cuerpo' && status === 200) { h.requests[0].resolve(h.response(200, '', { hold: true })); await h.flush(); }
        lose(h);
        if (stage === 'cuerpo' && status === 200) h.bodies[0].resolve(body);
        else h.requests[0].resolve(h.response(status, body));
        await h.flush();
        assert.deepEqual(plain(await pending), STALE);
        assert.doesNotMatch(h.rows(), /SIN VIGENCIA/); assert.equal(h.redirects.length, 0);
        assert.ok(!h.events.includes('municontrol:workforce-scope'));
        assert.match(h.rows(), cause === 'permission' ? /Consulta de legajos no disponible/ : /Consulta retirada/);
        assert.equal(h.state.employeesLoading, false); assert.equal(h.clock.pending(), 0);
        assert.equal(h.requests[0].options.signal.aborted, true);
        if (status === 401) assert.equal(h.bodies.length, 0, 'ningún cuerpo 401 se lee');
      });
    }
  }
}

test('plazo vencido o falla de red con el documento ya oculto (sin evento): no publica el aviso; retira', async () => {
  for (const finish of ['plazo', 'red']) {
    const h = fresh();
    const pending = h.api.loadEmployees(1);
    h.document.hidden = true;
    if (finish === 'plazo') h.clock.advance(25_000); else h.requests[0].reject(new TypeError('red no disponible'));
    await h.flush();
    assert.deepEqual(plain(await pending), STALE);
    assert.match(h.rows(), /Consulta retirada/); assert.doesNotMatch(h.rows(), /tardó demasiado|No pudimos cargar/);
    assert.equal(h.state.employeesLoading, false); assert.equal(h.clock.pending(), 0);
  }
});

test('ocultar documento (evento real) con respuesta retenida: invalida primero, retira lista/contadores/facetas/evidencia, conserva filtros; al volver no hay GET', async () => {
  const h = fresh();
  h.api.showView('legajos', false, false);
  h.submit();
  h.requests[0].resolve(h.json(200, PAGE([EMPLOYEE(42, 'PERSONA A')]))); await h.flush();
  h.state.filters.search = 'PERS'; h.state.filters.sector = 'Sector A';
  const pending = h.api.loadEmployees(2); const retained = h.requests[1];
  h.document.hidden = true; h.api.employeeVisibilityChanged();
  assert.deepEqual(h.detailWithdrawals, ['detail']);
  assert.deepEqual(plain(await pending), STALE);
  assert.equal(retained.options.signal.aborted, true); assert.equal(h.clock.pending(), 0);
  assert.match(h.rows(), /Consulta retirada/); assert.doesNotMatch(h.rows(), /PERSONA A/);
  assert.equal(h.els.scopeContracts.textContent, '—'); assert.equal(h.state.employeesLoaded, false); assert.equal(h.state.employeesLoading, false);
  assert.deepEqual([...h.state.sectors], ['Sector A']); assert.deepEqual([...h.state.organizations], []); assert.equal(h.state.directoryFacetsLoaded, false);
  assert.equal(h.state.filters.search, 'PERS'); assert.equal(h.events.at(-1), 'municontrol:workforce-reset');
  retained.resolve(h.json(401, { ok: false })); await h.flush();
  assert.equal(h.redirects.length, 0); assert.match(h.rows(), /Consulta retirada/);
  h.document.hidden = false; h.api.employeeVisibilityChanged(); h.api.showView('legajos', false, false);
  assert.deepEqual(plain(await h.api.loadEmployees(1)), { ok: false, resource: 'employees', withdrawn: true });
  assert.equal(h.requests.length, 2, 'sin GET automático al volver');
  h.action().click();
  assert.equal(h.requests.length, 3); assert.match(h.requests[2].url, /search=PERS&sector=Sector\+A/);
});

test('Buscar (submit real) tras retiro es una consulta nueva con filtros conservados; debounce y cambios de filtro no consultan solos', async () => {
  const h = fresh();
  h.api.showView('legajos', false, false);
  h.submit();
  h.requests[0].resolve(h.json(200, PAGE([EMPLOYEE(42, 'PERSONA A')]))); await h.flush();
  h.document.hidden = true; h.api.employeeVisibilityChanged(); h.document.hidden = false; h.api.employeeVisibilityChanged();
  h.els.employeeSearch.value = '  PERS  ';
  h.els.employeeSearch.emit('input'); h.clock.advance(380); await h.flush();
  h.els.statusFilter.value = 'all'; h.els.statusFilter.emit('change'); await h.flush();
  assert.equal(h.requests.length, 1, 'ni el debounce ni el cambio de filtro consultan tras el retiro');
  assert.match(h.rows(), /Consulta retirada/);
  h.els.employeeSearch.emit('input');
  assert.equal(h.submit(), 1, 'preventDefault del submit real');
  h.clock.advance(1_000); await h.flush();
  assert.equal(h.requests.length, 2, 'Buscar consulta una vez; el debounce pendiente quedó anulado');
  assert.match(h.requests[1].url, /search=PERS&.*status=all&/);
  h.requests[1].resolve(h.json(200, PAGE([EMPLOYEE(50, 'BUSCADA')]))); await h.flush();
  assert.match(h.rows(), /BUSCADA/);
  h.els.employeeSearch.value = 'OTRA'; h.els.employeeSearch.emit('input'); h.clock.advance(380);
  assert.equal(h.requests.length, 3, 'sin retiro, el debounce original sigue consultando');
});

test('Buscar con permiso retirado no consulta; restaurar no consulta; Buscar posterior sí', async () => {
  const h = fresh();
  h.api.employeeCapabilitiesChanged({ detail: { tenantCapabilities: ['payroll.read'] } });
  h.submit(); h.els.statusFilter.emit('change'); await h.flush();
  assert.equal(h.requests.length, 0); assert.match(h.rows(), /Consulta de legajos no disponible/);
  h.api.employeeCapabilitiesChanged({ detail: { tenantCapabilities: new Set(['workforce.employee.read']) } });
  await h.flush(); assert.equal(h.requests.length, 0, 'restaurar no dispara GET');
  assert.match(h.rows(), /Consulta retirada/);
  h.submit();
  assert.equal(h.requests.length, 1);
});

test('salir del área retira la lista; volver muestra la acción explícita y no consulta sola', async () => {
  const h = fresh();
  h.api.showView('legajos', false, false);
  h.submit();
  h.requests[0].resolve(h.json(200, PAGE([EMPLOYEE(42, 'PERSONA A')]))); await h.flush();
  h.api.showView('inicio', false, false);
  assert.match(h.rows(), /Consulta retirada/); assert.doesNotMatch(h.rows(), /PERSONA A/);
  h.api.showView('legajos', false, false);
  assert.equal(h.requests.length, 1); assert.ok(h.action());
});

test('cerrar sesión con consulta pendiente: la continuación no publica', async () => {
  const h = fresh();
  const pending = h.api.loadEmployees(1);
  h.api.withdrawEmployeeDirectory('session');
  h.requests[0].resolve(h.json(200, PAGE([EMPLOYEE(3, 'TRAS SALIDA')]))); await h.flush();
  assert.deepEqual(plain(await pending), STALE);
  assert.doesNotMatch(h.rows(), /TRAS SALIDA/); assert.equal(h.clock.pending(), 0);
});

test('pérdida de workforce.employee.read (evento real): retira con respuesta retenida, bloquea consultas; al restaurar sólo consulta explícita', async () => {
  const h = fresh();
  const pending = h.api.loadEmployees(1); const retained = h.requests[0];
  h.api.employeeCapabilitiesChanged({ detail: { tenantCapabilities: ['payroll.read'] } });
  assert.deepEqual(h.detailWithdrawals, ['detail']); assert.equal(h.state.tenantCapabilities.has('workforce.employee.read'), false);
  assert.deepEqual(plain(await pending), STALE);
  assert.match(h.rows(), /Consulta de legajos no disponible/); assert.equal(h.action(), null);
  retained.resolve(h.json(200, PAGE([EMPLOYEE(8, 'SIN PERMISO')]))); await h.flush();
  assert.doesNotMatch(h.rows(), /SIN PERMISO/);
  assert.deepEqual(plain(await h.api.loadEmployees(1, { explicit: true })), { ok: false, resource: 'employees', forbidden: true });
  h.api.showView('legajos', false, false);
  assert.equal(h.requests.length, 1);
  h.api.employeeCapabilitiesChanged({ detail: { tenantCapabilities: new Set(['workforce.employee.read']) } });
  assert.equal(h.requests.length, 1, 'restaurar no dispara GET');
  assert.match(h.rows(), /Consulta retirada/);
  h.action().click();
  assert.equal(h.requests.length, 2);
});

test('error del servidor conserva la referencia segura y no deja filas previas como éxito', async () => {
  const h = fresh();
  await settled(h, h.api.loadEmployees(1), h.json(200, PAGE([EMPLOYEE(42, 'PREVIA')])));
  const failed = h.api.loadEmployees(2);
  const result = await settled(h, failed, h.json(500, { ok: false, error: 'No se pudo consultar.', requestId: '12345678-1234-1234-1234-123456789abc' }));
  assert.equal(result.error.status, 500);
  assert.match(h.rows(), /Referencia: 12345678-1234-1234-1234-123456789abc/); assert.doesNotMatch(h.rows(), /PREVIA/);
  assert.equal(h.state.employeesLoaded, false);
});


// Decisión del propietario (5/11/26): los listados cargan a priori, como GRH. Mostrar Personas no consulta el
// archivo histórico, pero abrir «Antecedentes» lo consulta una vez, sin otro «Buscar».
test('Personas no consulta el archivo; abrir Antecedentes consulta una vez sin «Buscar» y no usa summary', async () => {
  const h = fresh(); h.els.employeeHistory.open = false; h.state.employeeHistoryQueried = false;
  h.api.showView('legajos', false, false);
  assert.equal(h.requests.length, 0);
  h.els.employeeHistory.open = true; h.els.employeeHistory.emit('toggle');
  assert.equal(h.requests.length, 1);
  assert.equal(h.state.employeeHistoryQueried, true);
  h.requests[0].resolve(h.json(200, PAGE([EMPLOYEE(12, 'ANTECEDENTE SINTÉTICO')]))); await h.flush();
  assert.match(h.rows(), /ANTECEDENTE SINTÉTICO/);
  assert.doesNotMatch(functionSource('authenticate'), /loadSummary\(|loadEmployees\(/);
  assert.match(functionSource('showView'), /target !== 'legajos'.*loadSummary\(/);
});

test('cerrar Antecedentes retira una lectura pendiente; reabrir consulta de nuevo y un 401 tardío del retiro no redirige', async () => {
  const h = fresh(), pending = h.api.loadEmployees(1), retained = h.requests[0];
  h.els.employeeHistory.open = false; h.els.employeeHistory.emit('toggle');
  assert.deepEqual(plain(await pending), STALE);
  assert.equal(retained.options.signal.aborted, true); assert.equal(h.clock.pending(), 0);
  assert.equal(h.state.employeeHistoryQueried, false);
  h.els.employeeHistory.open = true; h.els.employeeHistory.emit('toggle');
  assert.equal(h.requests.length, 2);
  retained.resolve(h.json(401, {ok:false})); await h.flush();
  assert.equal(h.redirects.length, 0); assert.doesNotMatch(h.rows(), /Sin resultados/);
  h.requests[1].resolve(h.json(200, PAGE([]))); await h.flush();
});

test('Actualizar Personas vuelve a consultar sólo la entrada visible elegida; no llama summary ni pierde filtros de antecedentes', () => {
  for (const ownOpen of [false, true]) for (const historyOpen of [false, true]) {
    const roster = { open: ownOpen }, events = [], calls = [];
    const context = {
      state: { currentView: 'legajos', pagination: { page: 3 } },
      document: { querySelector: () => roster, dispatchEvent: event => events.push(event.type) },
      els: { employeeHistory: { open: historyOpen } },
      Event: class { constructor(type) { this.type = type; } },
      loadEmployees: (...args) => calls.push(args),
      loadSummary: () => assert.fail('Actualizar Personas no consulta summary'),
    };
    vm.runInNewContext(functionSource('refreshCurrentView') + '\nrefreshCurrentView();', context);
    if (ownOpen || !historyOpen) {
      assert.equal(roster.open, true);
      assert.deepEqual(events, ['mc:native-roster-refresh']); assert.equal(calls.length, 0);
    } else {
      assert.deepEqual(events, []);
      assert.deepEqual(plain(calls), [[3, { explicit: true }]]);
    }
  }
});