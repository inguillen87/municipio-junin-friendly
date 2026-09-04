import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

function loadWorkToday() {
  const context = {};
  vm.runInNewContext(read('assets/internal-work-today.js'), context, {
    filename: 'assets/internal-work-today.js'
  });
  return context.MuniControlWorkToday;
}

function cardKeys(model) {
  return model.cards.map((card) => card.key);
}

class FakeNode {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.textContent = '';
    this.className = '';
    this.href = '';
    this.ownerDocument = null;
    this.lookup = null;
  }

  get firstChild() { return this.children[0] || null; }
  appendChild(node) { this.children.push(node); return node; }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'data-mode') this.dataset.mode = String(value);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'data-mode') delete this.dataset.mode;
  }
  querySelector(selector) { return this.lookup ? this.lookup.get(selector) || null : null; }
}

function fakeWorkTodayRoot() {
  const document = {
    createElement(tagName) {
      const node = new FakeNode(tagName);
      node.ownerDocument = document;
      return node;
    }
  };
  const rootNode = new FakeNode('section');
  rootNode.ownerDocument = document;
  rootNode.hidden = true;
  const selectors = [
    '[data-work-today-title]', '[data-work-today-eyebrow]',
    '[data-work-today-summary]', '[data-work-today-badge]',
    '[data-work-today-list]', '[data-work-today-boundary]'
  ];
  rootNode.lookup = new Map(selectors.map((selector) => {
    const node = new FakeNode();
    node.ownerDocument = document;
    return [selector, node];
  }));
  return rootNode;
}

test('Marcelo ve preparación y gestión según capacidades efectivas, aunque también pueda decidir', () => {
  const workToday = loadWorkToday();
  const model = workToday.buildModel({
    tenantCapabilities: [
      'actions.read', 'leave.request.area.create', 'leave.request.area.decide',
      'payroll.novelty.prepare', 'payroll.novelty.approve',
      'payroll.monthly_close.prepare'
    ]
  }, 'Propietario de plataforma · Operación integral');

  assert.equal(model.mode, 'prepare');
  assert.equal(model.title, 'Preparar y gestionar');
  assert.equal(model.eyebrow, 'Mi trabajo hoy');
  assert.deepEqual(Array.from(cardKeys(model)), ['actions', 'novelties', 'payroll']);
  assert.ok(model.cards.every((card) => /Abrir/.test(card.action)));
  assert.match(model.boundary, /separación de funciones/);
});

test('Hugo ve revisión y decisión sin accesos de preparación inventados', () => {
  const workToday = loadWorkToday();
  const model = workToday.buildModel({
    tenantCapabilities: [
      'actions.read', 'leave.request.area.decide', 'time.overtime.approve',
      'payroll.novelty.approve', 'payroll.control_import.validate',
      'payroll.reprocessing.approve', 'payroll.monthly_close.approve'
    ]
  }, 'Aprobador institucional integral');

  assert.equal(model.mode, 'decide');
  assert.equal(model.title, 'Revisar y decidir');
  assert.equal(model.eyebrow, 'Mi trabajo hoy');
  assert.deepEqual(Array.from(cardKeys(model)), ['actions', 'novelties', 'payroll']);
  assert.ok(model.cards.every((card) => /Revisar/.test(card.action)));
  assert.doesNotMatch(JSON.stringify(model.cards), /Preparar/);
});

test('admin ve consulta y control sin CTA de mutación', () => {
  const workToday = loadWorkToday();
  const model = workToday.buildModel({
    tenantCapabilities: [
      'workforce.summary.read', 'workforce.employee.read', 'actions.read',
      'payroll.read', 'payroll.novelty.read', 'management.analytics.read'
    ]
  }, 'Consulta institucional integral');

  assert.equal(model.mode, 'consult');
  assert.equal(model.title, 'Consultar y controlar');
  assert.deepEqual(Array.from(cardKeys(model)), ['people', 'actions', 'novelties', 'payroll', 'reports']);
  assert.ok(model.cards.every((card) => /^(Consultar|Ver)/.test(card.action)));
  assert.doesNotMatch(JSON.stringify(model), /Crear|Aprobar|Rechazar|Cancelar/);
  assert.match(model.boundary, /no crean, envían, aprueban, rechazan ni cancelan/);
});

test('el nombre del rol no concede capacidades y el bloque falla cerrado sin accesos útiles', () => {
  const workToday = loadWorkToday();
  const ownerByNameOnly = workToday.buildModel({ tenantCapabilities: [] }, 'Propietario de plataforma');
  const malformed = workToday.buildModel({ tenantCapabilities: ['payroll.monthly_close.prepare<script>'] }, 'Aprobador');

  assert.equal(ownerByNameOnly, null);
  assert.equal(malformed, null);
});

test('renderiza enlaces fijos con texto seguro y conserva oculto el bloque sin modelo', () => {
  const workToday = loadWorkToday();
  const rootNode = fakeWorkTodayRoot();
  const model = workToday.render({
    root: rootNode,
    access: { tenantCapabilities: ['payroll.monthly_close.approve'] },
    roleLabel: 'Aprobador institucional integral'
  });
  const list = rootNode.lookup.get('[data-work-today-list]');

  assert.equal(model.mode, 'decide');
  assert.equal(rootNode.hidden, false);
  assert.equal(rootNode.dataset.mode, 'decide');
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].href, 'nomina-control.html');
  assert.equal(list.children[0].attributes.get('data-work-today-card'), 'payroll');
  assert.match(rootNode.lookup.get('[data-work-today-badge]').textContent, /Aprobador institucional integral/);

  workToday.render({ root: rootNode, access: { tenantCapabilities: [] }, roleLabel: 'Propietario' });
  assert.equal(rootNode.hidden, true);
  assert.equal(rootNode.dataset.mode, undefined);
});

test('el inicio integra el bloque después de autenticar y el build incluye el asset privado', () => {
  const html = read('internal-dashboard.html');
  const asset = read('assets/internal-work-today.js');
  const build = read('scripts/build-friendly.mjs');
  const worker = read('sw.js');

  assert.match(html, /id="workToday"[^>]+hidden/);
  assert.equal((html.match(/assets\/internal-work-today\.js/g) || []).length, 1);
  assert.match(html, /MuniControlWorkToday\.render\(\{ root: els\.workToday, access: payload\.access, roleLabel: user\.role \}\)/);
  assert.match(build, /'assets\/internal-work-today\.js'/);
  assert.doesNotMatch(worker, /internal-work-today/);
  assert.doesNotMatch(asset, /fetch\s*\(|localStorage|sessionStorage|innerHTML/);
});
