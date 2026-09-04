import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

function fakeNode(attributes = {}) {
  const values = new Map(Object.entries(attributes));
  return {
    hidden: false,
    getAttribute(name) { return values.has(name) ? values.get(name) : null; },
    hasAttribute(name) { return values.has(name); },
    setAttribute(name, value) { values.set(name, String(value)); },
    removeAttribute(name) { values.delete(name); },
  };
}

function loadGate() {
  const appended = [];
  const documentElement = {
    setAttribute() {},
    removeAttribute() {},
  };
  const document = {
    head: { appendChild(node) { appended.push(node); } },
    documentElement,
    readyState: 'complete',
    createElement(tag) { return { tagName: tag, id: '', textContent: '' }; },
    getElementById() { return null; },
    querySelectorAll() { return []; },
  };
  const window = {
    document,
    location: { href: 'https://municipio.example/licencias-control.html' },
  };
  vm.runInNewContext(read('assets/internal-capability-gate.js'), {
    window,
    document,
    URL,
    Set,
    Map,
    Object,
    Array,
    String,
    Promise,
  }, { filename: 'assets/internal-capability-gate.js' });
  return { gate: window.MuniControlCapabilityGate, appended };
}

test('el gate compartido resuelve rutas internas con capacidades tenant exactas', () => {
  const { gate } = loadGate();
  assert.equal(gate.normalizedRoute('internal-dashboard.html#legajos', 'https://municipio.example/licencias-control.html'), 'internal-dashboard.html#legajos');
  assert.equal(gate.allowed(gate.requirements['internal-dashboard.html#legajos'], ['workforce.employee.read'], []), true);
  assert.equal(gate.allowed(gate.requirements['internal-dashboard.html#legajos'], ['workforce.summary.read'], []), false);
  assert.equal(gate.allowed(gate.requirements['nomina-control.html'], ['payroll.read'], []), true);
  assert.equal(gate.allowed(gate.requirements['nomina-control.html'], ['workforce.summary.read'], []), false);
  assert.equal(gate.allowed(gate.requirements['recibos-sueldo.html'], ['workforce.employee.read', 'payroll.read'], []), true);
  assert.equal(gate.allowed(gate.requirements['recibos-sueldo.html'], ['payroll.read'], []), false);
});

test('la administración global exige rol propietario y capacidad efectiva de plataforma', () => {
  const { gate } = loadGate();
  const requirement = gate.requirements['administracion-plataforma.html'];
  assert.equal(gate.allowed(requirement, ['payroll.read'], []), false);
  assert.equal(gate.allowed(requirement, [], ['platform.tenants.manage'], []), false);
  assert.equal(gate.allowed(requirement, [], ['platform.tenants.read'], ['PLATFORM_OWNER']), false);
  assert.equal(gate.allowed(requirement, [], ['platform.tenants.manage'], ['PLATFORM_OWNER']), true);
  assert.equal(gate.allowed(requirement, [], ['tenant.admin'], ['PLATFORM_OWNER']), false);
});

test('apply oculta destinos y mutaciones no autorizados y deja visibles las lecturas permitidas', () => {
  const { gate } = loadGate();
  const people = fakeNode({ href: 'internal-dashboard.html#legajos' });
  const payroll = fakeNode({ href: 'nomina-control.html' });
  const createLeave = fakeNode({ 'data-requires-any-capability': 'leave.request.self.create leave.request.area.create' });
  const platform = fakeNode({ href: 'administracion-plataforma.html' });
  const rootNode = {
    querySelectorAll(selector) {
      if (selector === '.nav-group') return [];
      return [people, payroll, createLeave, platform];
    },
  };
  gate.apply(rootNode, {
    tenantCapabilities: ['workforce.employee.read'],
    platformCapabilities: [],
    platformRoles: [],
  }, 'https://municipio.example/licencias-control.html');
  assert.equal(people.hidden, false);
  assert.equal(payroll.hidden, true);
  assert.equal(createLeave.hidden, true);
  assert.equal(platform.hidden, true);
  assert.equal(createLeave.getAttribute('aria-hidden'), 'true');

  gate.apply(rootNode, {
    tenantCapabilities: ['workforce.employee.read'],
    platformCapabilities: ['platform.tenants.manage'],
    platformRoles: ['PLATFORM_OWNER'],
  }, 'https://municipio.example/licencias-control.html');
  assert.equal(platform.hidden, false);
  assert.equal(platform.hasAttribute('aria-hidden'), false);
});

test('el estado inicial queda cerrado antes de resolver la sesión', () => {
  const { appended } = loadGate();
  assert.equal(appended.length, 1);
  assert.match(appended[0].textContent, /html:not\(\[data-mc-capability-ready="true"\]\)/);
  assert.match(appended[0].textContent, /data-mc-capability-denied/);
  assert.match(appended[0].textContent, /centro-acciones\.html/);
});

test('las pantallas internas secundarias cargan una única compuerta reutilizable', () => {
  const pages = [
    'centro-acciones.html', 'fuentes-tiempo.html', 'relojes-marcaciones.html',
    'estructura.html', 'integracion-datos.html', 'asistente.html',
    'gestion-comparativa.html', 'presupuesto-control.html', 'ausentismo-control.html',
    'licencias-control.html', 'calidad-operativa.html', 'novedades-nomina.html',
    'centro-ayuda.html', 'nomina-control.html', 'recibos-sueldo.html',
  ];
  for (const page of pages) {
    const html = read(page);
    assert.equal((html.match(/assets\/internal-capability-gate\.js/g) || []).length, 1, page);
  }
  const build = read('scripts/build-friendly.mjs');
  assert.match(build, /'assets\/internal-capability-gate\.js'/);
});

test('los accesos de mutación más visibles declaran su capacidad exacta', () => {
  const actions = read('centro-acciones.html');
  const licenses = read('licencias-control.html');
  const sources = read('fuentes-tiempo.html');
  assert.match(actions, /id="createActionButton"[^>]+data-requires-any-capability="leave\.request\.self\.create leave\.request\.area\.create leave\.request\.all\.manage"/);
  assert.match(actions, /id="createOvertimeButton"[^>]+data-requires-any-capability="time\.overtime\.enter"/);
  assert.match(licenses, /href="centro-acciones\.html" data-requires-any-capability="leave\.request\.self\.create leave\.request\.area\.create leave\.request\.all\.manage">Nueva solicitud/);
  assert.match(sources, /id="createButton"[^>]+data-requires-any-capability="time\.source\.propose"/);
});
