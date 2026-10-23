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
