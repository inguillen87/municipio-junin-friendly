import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/task-workspace.js', import.meta.url), 'utf8');
assert.equal(source.split('export function ').length, 3);

function workspace() {
  let focused = null;
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.hidden = false; this.disabled = false; this.events = new Map(); this.attributes = new Map(); }
    append(...nodes) { this.children.push(...nodes); }
    prepend(...nodes) { this.children.unshift(...nodes); }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    addEventListener(key, handler) { this.events.set(key, handler); }
    dispatchEvent() { return true; }
    focus() { if (!this.hidden && !this.disabled) focused = this; }
    scrollIntoView() {}
  }
  const document = { createElement: tag => new Element(tag), getElementById: () => null };
  const context = { document, location: { hash: '' }, window: { addEventListener() {}, history: { pushState() {} } },
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    requestAnimationFrame: callback => callback() };
  // Only the two source-pinned function declarations are evaluated. No module
  // imports, fetch, application bootstrap, process, SQL or real DOM is exposed.
  vm.runInNewContext(source.replaceAll('export function ', 'function ') + '\nglobalThis.buildWorkspace=taskWorkspace;', context, { timeout: 1000 });
  const host = new Element('div');
  const ids = ['summary', 'compare', 'corrections', 'history', 'parameters', 'migration'];
  const result = context.buildWorkspace({ host, initial: 'summary', groups: ids.map(id => ({ id, label: id, nodes: [] })) });
  const list = host.children[0].children[0];
  const key = (id, value) => {
    let prevented = false;
    list.events.get('keydown')({ target: result.buttons.get(id), key: value, preventDefault() { prevented = true; } });
    return { focused: focused?.dataset.task ?? null, prevented };
  };
  const ownOnly = () => { for (const id of ['corrections', 'history', 'migration']) result.buttons.get(id).hidden = true; };
  return { ...result, key, ownOnly };
}

test('flechas saltan las tareas históricas ocultas sin perder el foco', () => {
  const w = workspace(); w.ownOnly();
  assert.deepEqual(w.key('compare', 'ArrowRight'), { focused: 'parameters', prevented: true });
  assert.deepEqual(w.key('parameters', 'ArrowLeft'), { focused: 'compare', prevented: true });
});

test('Home y End eligen los extremos visibles después de retirar permisos', () => {
  const w = workspace(); w.ownOnly(); w.buttons.get('summary').hidden = true;
  assert.equal(w.key('parameters', 'Home').focused, 'compare');
  assert.equal(w.key('compare', 'End').focused, 'parameters');
});

test('un tab deshabilitado tampoco interrumpe el recorrido por teclado', () => {
  const w = workspace(); w.buttons.get('corrections').disabled = true; w.buttons.get('history').hidden = true;
  assert.equal(w.key('compare', 'ArrowRight').focused, 'parameters');
});

test('las flechas recorren y envuelven sólo los tabs disponibles', () => {
  const w = workspace(); w.ownOnly();
  assert.equal(w.key('parameters', 'ArrowRight').focused, 'summary');
  assert.equal(w.key('summary', 'ArrowLeft').focused, 'parameters');
});

test('sin tabs disponibles no se inventa un destino ni se captura la tecla', () => {
  const w = workspace(); for (const button of w.buttons.values()) button.hidden = true;
  assert.deepEqual(w.key('compare', 'ArrowRight'), { focused: null, prevented: false });
});

test('el recorrido completo conserva sus destinos y no captura otras teclas', () => {
  const w = workspace();
  assert.equal(w.key('compare', 'ArrowRight').focused, 'corrections');
  assert.equal(w.key('summary', 'End').focused, 'migration');
  assert.equal(w.key('migration', 'Home').focused, 'summary');
  assert.deepEqual(w.key('compare', 'Enter'), { focused: 'summary', prevented: false });
});

// Sectioned (vertical) workspace: one tablist per process, sections open on activation, registration for a menu.
function sectioned({menu = null, initial = 'calculo', sections = null} = {}) {
  let focused = null;
  const registrations = [];
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.hidden = false; this.disabled = false; this.events = new Map(); this.attributes = new Map(); }
    append(...nodes) { this.children.push(...nodes); }
    prepend(...nodes) { this.children.unshift(...nodes); }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    addEventListener(key, handler) { this.events.set(key, handler); }
    dispatchEvent() { return true; }
    focus() { if (!this.hidden && !this.disabled) focused = this; }
    scrollIntoView() {}
  }
  const document = { createElement: tag => new Element(tag), getElementById: () => null, dispatchEvent: event => { registrations.push(event); return true; } };
  const context = { document, location: { hash: '' }, window: { addEventListener() {}, history: { pushState() {} } },
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    requestAnimationFrame: callback => callback() };
  vm.runInNewContext(source.replaceAll('export function ', 'function ') + '\nglobalThis.buildWorkspace=taskWorkspace;', context, { timeout: 1000 });
  const host = new Element('div');
  // Panel order deliberately differs from the visual order declared by the sections.
  const ids = ['summary', 'calculo', 'decisiones', 'anulacion', 'cierre', 'reportes', 'recibos', 'migration'];
  const config = sections ?? [{ label: null, tasks: ['summary'] }, { label: 'Liquidar', tasks: ['calculo', 'anulacion', 'decisiones', 'cierre'] }, { label: 'Documentos', tasks: ['reportes', 'recibos'] }, { label: null, tasks: ['migration'] }];
  const build = () => context.buildWorkspace({ host, initial, groups: ids.map(id => ({ id, label: id, nodes: [] })), sections: config, menu });
  const result = build();
  const nav = host.children[0];
  const lists = nav.children.map(child => child.attributes.get('role') === 'tablist' ? child : child.children[1]);
  const key = (list, id, value) => {
    let prevented = false;
    list.events.get('keydown')({ target: result.buttons.get(id), key: value, preventDefault() { prevented = true; } });
    return { focused: focused?.dataset.task ?? null, prevented };
  };
  return { ...result, host, nav, lists, key, registrations, context };
}

test('las secciones respetan el orden visual declarado: Anular período antes de Confirmar y anular', () => {
  const w = sectioned();
  assert.deepEqual(w.nav.children.map(child => child.tagName), ['DIV', 'DETAILS', 'DETAILS', 'DIV']);
  assert.deepEqual(w.lists[1].children.map(button => button.dataset.task), ['calculo', 'anulacion', 'decisiones', 'cierre']);
  assert.equal(w.nav.children[1].children[0].tagName, 'SUMMARY');
  for (const list of w.lists) assert.equal(list.attributes.get('aria-orientation'), 'vertical');
  assert.ok([...w.panels.values()].every(panel => w.host.children.includes(panel)), 'panels stay in the host');
});

test('flechas verticales y horizontales recorren sólo la sección del foco y envuelven en ella', () => {
  const w = sectioned();
  assert.deepEqual(w.key(w.lists[1], 'calculo', 'ArrowDown'), { focused: 'anulacion', prevented: true });
  assert.deepEqual(w.key(w.lists[1], 'anulacion', 'ArrowUp'), { focused: 'calculo', prevented: true });
  assert.equal(w.key(w.lists[1], 'calculo', 'ArrowUp').focused, 'cierre');
  assert.equal(w.key(w.lists[1], 'cierre', 'ArrowRight').focused, 'calculo');
  assert.equal(w.key(w.lists[1], 'anulacion', 'End').focused, 'cierre');
  assert.equal(w.key(w.lists[1], 'cierre', 'Home').focused, 'calculo');
  assert.deepEqual(w.key(w.lists[2], 'calculo', 'ArrowDown'), { focused: 'calculo', prevented: false });
  w.buttons.get('decisiones').hidden = true;
  assert.equal(w.key(w.lists[1], 'anulacion', 'ArrowDown').focused, 'cierre');
});

test('cada sección conserva un tab alcanzable con Tab y la tarea activa es la única con tabindex 0 en su sección', () => {
  const w = sectioned();
  const tabIndexOf = id => w.buttons.get(id).tabIndex;
  assert.deepEqual(['summary', 'calculo', 'anulacion', 'reportes', 'recibos', 'migration'].map(tabIndexOf), [0, 0, -1, 0, -1, 0]);
  w.activate('recibos');
  assert.deepEqual(['summary', 'calculo', 'reportes', 'recibos', 'migration'].map(tabIndexOf), [0, 0, -1, 0, 0]);
});

test('activar una tarea abre su sección cerrada y las independientes no tienen acordeón', () => {
  const w = sectioned();
  const liquidar = w.nav.children[1], documentos = w.nav.children[2];
  liquidar.open = false; documentos.open = false;
  assert.equal(w.activate('cierre'), true);
  assert.equal(liquidar.open, true); assert.equal(documentos.open, false);
  assert.equal(w.host.dataset.activeTask, 'cierre');
  assert.equal(w.activate('summary'), true); assert.equal(liquidar.open, true);
});

test('el registro para el menú lateral sólo ocurre con menu y lleva la navegación y el host', () => {
  const plain = sectioned();
  assert.equal(plain.registrations.length, 0); assert.equal(plain.nav.dataset.taskMenu, undefined);
  const registered = sectioned({ menu: 'liquidaciones' });
  assert.equal(registered.registrations.length, 1);
  const event = registered.registrations[0];
  assert.equal(event.type, 'municontrol:task-workspace'); assert.equal(event.detail.menu, 'liquidaciones');
  assert.equal(event.detail.nav, registered.nav); assert.equal(event.detail.host, registered.host);
  assert.equal(registered.nav.dataset.taskMenu, 'liquidaciones');
});

test('una tarea sin sección o una sección con tarea inexistente o repetida falla al construir', () => {
  assert.throws(() => sectioned({ sections: [{ label: 'Sólo una', tasks: ['calculo'] }] }), /tarea sin sección: summary/);
  assert.throws(() => sectioned({ sections: [{ label: null, tasks: ['summary', 'calculo', 'decisiones', 'anulacion', 'cierre', 'reportes', 'recibos', 'migration', 'inexistente'] }] }), /tarea inexistente: inexistente/);
  assert.throws(() => sectioned({ sections: [{ label: null, tasks: ['summary', 'summary'] }] }), /tarea repetida/);
});
