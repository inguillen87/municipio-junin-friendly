import assert from 'node:assert/strict';
import test from 'node:test';
import { createReportWorkspaceController, REPORT_TASKS, resolveReportLocation } from '../src/islands/report-workspace-navigation.js';

function createFixture(hash = '') {
  const byId = new Map();
  const focused = [];
  const scrolled = [];
  function node(id, tagName = 'div', parent = null, { panel, hidden = false } = {}) {
    const value = {
      id, tagName, parentElement: parent, children: [], hidden,
      dataset: panel ? { reportPanel: panel } : {},
      matches(selector) { return selector.split(',').some(tag => tag.trim() === this.tagName); },
      closest(selector) {
        for (let ancestor = this; ancestor; ancestor = ancestor.parentElement) {
          if (selector === '[hidden]' && ancestor.hidden) return ancestor;
          if (selector === '[data-report-panel]' && ancestor.dataset.reportPanel) return ancestor;
        }
        return null;
      },
      querySelector(selector) {
        for (const child of this.children) {
          if (child.matches(selector)) return child;
          const descendant = child.querySelector(selector);
          if (descendant) return descendant;
        }
        return null;
      },
      focus(options) { focused.push({ id: this.id, options }); },
      scrollIntoView(options) { scrolled.push({ id: this.id, options }); },
    };
    parent?.children.push(value);
    byId.set(id, value);
    return value;
  }
  const body = node('body', 'body');
  const title = node('reportWorkspaceTitle', 'h1', body);
  const overview = node('reportOverview', 'section', body, { panel: 'overview' });
  const reportContent = node('reportContent', 'article', overview, { hidden: true });
  const summary = node('resumen', 'header', reportContent);
  node('overviewHeading', 'h2', summary);
  for (const id of ['gestiones', 'ausentismo', 'sectores', 'metodologia', 'descargas']) {
    const section = node(id, 'section', reportContent);
    node(`${id}Heading`, 'h2', section);
  }
  const bank = node('bancarizacion', 'section', body, { panel: 'bank' });
  node('bankControlTitle', 'h2', bank);
  const fileInput = node('bankControlWorkbook', 'input', bank);
  fileInput.files = [{ name: 'planilla-de-prueba.xlsx', size: 100 }];
  fileInput.value = 'selected-local-file';
  const period = node('bankControlPeriod', 'input', bank);
  period.value = '2026-08';
  const bankResult = node('bankResult', 'div', bank, { hidden: true });
  bankResult.textContent = 'Resultado local conservado';
  const schooling = node('escolaridades', 'section', body, { panel: 'schooling' });
  node('schoolingTitle', 'h2', schooling);
  const f931 = node('f931', 'section', body, { panel: 'f931' });
  node('f931Title', 'h2', f931);
  node('outsideTool', 'button', body);
  const panels = [overview, bank, schooling, f931];
  const document = {
    body,
    getElementById: id => byId.get(id) ?? null,
    querySelectorAll: selector => selector === '[data-report-panel]' ? panels : [],
  };
  const eventListeners = new Map();
  const frames = new Map();
  const cancelledFrames = [];
  const registrations = [];
  let nextFrame = 0;
  let location = new URL(`https://municipio.example/reportes-rrhh${hash}`);
  const history = [location.href];
  let historyIndex = 0;
  const window = {
    get location() { return location; },
    addEventListener(type, listener) {
      registrations.push(type);
      if (!eventListeners.has(type)) eventListeners.set(type, new Set());
      eventListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { eventListeners.get(type)?.delete(listener); },
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { cancelledFrames.push(id); frames.delete(id); },
    history: {
      pushState(_state, _title, href) {
        location = new URL(href, location);
        history.splice(++historyIndex, history.length, location.href);
      },
      back() {
        if (historyIndex === 0) return;
        location = new URL(history[--historyIndex]);
        emit('popstate');
        emit('hashchange');
      },
    },
  };
  function emit(type) {
    for (const listener of eventListeners.get(type) ?? []) listener({ type });
  }
  function flushFrames() {
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(); }
  }
  return {
    window, document, byId, panels, title, reportContent, fileInput, period, bankResult,
    focused, scrolled, frames, cancelledFrames, registrations, eventListeners, history,
    emit, flushFrames,
    changeHash(nextHash) { location.hash = nextHash; emit('hashchange'); },
  };
}

function visiblePanels(fixture) {
  return fixture.panels.filter(panel => !panel.hidden).map(panel => panel.dataset.reportPanel);
}

test('el resolver reconoce los cuatro trabajos, enlaces del informe y vista completa', () => {
  const fixture = createFixture();
  assert.equal(REPORT_TASKS.length, 4);
  for (const task of REPORT_TASKS) {
    assert.deepEqual(resolveReportLocation(`#${task.target}`, fixture.document), { mode: task.id, target: task.target });
  }
  for (const target of ['gestiones', 'ausentismo', 'sectores', 'metodologia', 'descargas']) {
    assert.deepEqual(resolveReportLocation(`#${target}`, fixture.document), { mode: 'overview', target });
  }
  assert.deepEqual(resolveReportLocation('#todas-las-herramientas', fixture.document), { mode: 'all', target: 'reportWorkspaceTitle' });
  assert.deepEqual(resolveReportLocation('#bancarizaci%6Fn', fixture.document), { mode: 'bank', target: 'bancarizacion' });
});

test('el resolver encuentra controles internos sólo dentro de un panel reconocido', () => {
  const fixture = createFixture();
  assert.deepEqual(resolveReportLocation('#bankControlWorkbook', fixture.document), { mode: 'bank', target: 'bankControlWorkbook' });
  assert.deepEqual(resolveReportLocation('#schoolingTitle', fixture.document), { mode: 'schooling', target: 'schoolingTitle' });
  for (const hash of ['', '#', undefined, null, '#desconocido', '#outsideTool', '#%E0%A4%A', '#%ZZ']) {
    assert.deepEqual(resolveReportLocation(hash, fixture.document), { mode: 'overview', target: 'reportWorkspaceTitle' });
  }
});

test('start muestra el panel elegido y registra cada evento una sola vez', () => {
  const fixture = createFixture('#escolaridades');
  const controller = createReportWorkspaceController(fixture.window, fixture.document);
  assert.equal(controller.getSnapshot(), 'schooling');
  controller.start();
  controller.start();
  assert.deepEqual(visiblePanels(fixture), ['schooling']);
  assert.equal(fixture.document.body.dataset.reportNavigation, 'ready');
  assert.equal(fixture.registrations.filter(type => type === 'hashchange').length, 1);
  assert.equal(fixture.registrations.filter(type => type === 'popstate').length, 1);
  assert.equal(fixture.frames.size, 1);
  fixture.flushFrames();
  assert.equal(fixture.focused.at(-1).id, 'schoolingTitle');
  assert.deepEqual(fixture.focused.at(-1).options, { preventScroll: true });
  assert.equal(fixture.scrolled.at(-1).id, 'escolaridades');
  controller.destroy();
});

test('navegar conserva archivos, campos y ocultación interna de cada herramienta', () => {
  const fixture = createFixture();
  const originalFile = fixture.fileInput.files[0];
  const controller = createReportWorkspaceController(fixture.window, fixture.document);
  controller.start();
  controller.navigate('bancarizacion');
  assert.deepEqual(visiblePanels(fixture), ['bank']);
  controller.navigate('f931');
  assert.deepEqual(visiblePanels(fixture), ['f931']);
  controller.navigate('todas-las-herramientas');
  assert.deepEqual(visiblePanels(fixture), ['overview', 'bank', 'schooling', 'f931']);
  assert.equal(fixture.reportContent.hidden, true, 'navegar no valida ni revela el informe dependiente de datos');
  assert.equal(fixture.bankResult.hidden, true, 'navegar no revela resultados aún no validados');
  assert.equal(fixture.bankResult.textContent, 'Resultado local conservado');
  assert.equal(fixture.fileInput.files[0], originalFile);
  assert.equal(fixture.fileInput.value, 'selected-local-file');
  assert.equal(fixture.period.value, '2026-08');
  controller.destroy();
});

test('Back y hashchange mantienen panel y suscripción sin duplicar la transición', () => {
  const fixture = createFixture();
  const controller = createReportWorkspaceController(fixture.window, fixture.document);
  const observed = [];
  controller.subscribe(() => observed.push(controller.getSnapshot()));
  controller.start();
  controller.navigate('bancarizacion');
  controller.navigate('f931');
  fixture.window.history.back();
  assert.equal(controller.getSnapshot(), 'bank');
  assert.deepEqual(visiblePanels(fixture), ['bank']);
  assert.deepEqual(observed, ['bank', 'f931', 'bank']);
  fixture.changeHash('#escolaridades');
  assert.deepEqual(visiblePanels(fixture), ['schooling']);
  fixture.emit('hashchange');
  fixture.emit('popstate');
  assert.deepEqual(observed, ['bank', 'f931', 'bank', 'schooling']);
  assert.equal(fixture.frames.size, 1);
  controller.destroy();
});

test('el controlador ignora navigate desconocido y no duplica historial para el destino actual', () => {
  const fixture = createFixture('#bancarizacion');
  const controller = createReportWorkspaceController(fixture.window, fixture.document);
  controller.start();
  const href = fixture.window.location.href;
  controller.navigate('outsideTool');
  controller.navigate('https://otro.example/');
  assert.equal(fixture.window.location.href, href);
  assert.deepEqual(visiblePanels(fixture), ['bank']);
  controller.navigate('bancarizacion');
  assert.equal(fixture.history.length, 1);
  fixture.changeHash('#desconocido');
  assert.equal(controller.getSnapshot(), 'overview');
  assert.deepEqual(visiblePanels(fixture), ['overview']);
  fixture.changeHash('#%ZZ');
  assert.equal(controller.getSnapshot(), 'overview');
  fixture.flushFrames();
  assert.equal(fixture.focused.at(-1).id, 'reportWorkspaceTitle');
  controller.destroy();
});

test('los enlaces del informe enfocan un destino visible sin revelar reportContent oculto', () => {
  const fixture = createFixture('#descargas');
  const controller = createReportWorkspaceController(fixture.window, fixture.document);
  controller.start();
  fixture.flushFrames();
  assert.equal(fixture.reportContent.hidden, true);
  assert.equal(fixture.focused.at(-1).id, 'reportWorkspaceTitle');
  fixture.reportContent.hidden = false;
  controller.navigate('descargas');
  fixture.flushFrames();
  assert.equal(fixture.focused.at(-1).id, 'descargasHeading');
  assert.equal(fixture.scrolled.at(-1).id, 'descargas');
  assert.equal(fixture.reportContent.hidden, false);
  controller.destroy();
});

test('una selección rápida cancela el foco anterior y sólo enfoca la última tarea', () => {
  const fixture = createFixture();
  const controller = createReportWorkspaceController(fixture.window, fixture.document);
  controller.start();
  controller.navigate('bancarizacion');
  controller.navigate('escolaridades');
  assert.equal(fixture.cancelledFrames.length, 1);
  assert.equal(fixture.frames.size, 1);
  fixture.flushFrames();
  assert.deepEqual(fixture.focused.map(item => item.id), ['schoolingTitle']);
  controller.destroy();
});

test('unsubscribe y destroy liberan listeners y foco pendiente sin borrar datos de los paneles', () => {
  const fixture = createFixture();
  const controller = createReportWorkspaceController(fixture.window, fixture.document);
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => { notifications += 1; });
  controller.start();
  controller.navigate('bancarizacion');
  unsubscribe();
  controller.navigate('f931');
  assert.equal(notifications, 1);
  const originalFile = fixture.fileInput.files[0];
  controller.destroy();
  controller.destroy();
  assert.equal(fixture.frames.size, 0);
  assert.equal(fixture.eventListeners.get('hashchange').size, 0);
  assert.equal(fixture.eventListeners.get('popstate').size, 0);
  assert.equal(fixture.document.body.dataset.reportNavigation, undefined);
  assert.deepEqual(visiblePanels(fixture), ['overview', 'bank', 'schooling', 'f931']);
  fixture.changeHash('#escolaridades');
  fixture.flushFrames();
  assert.equal(controller.getSnapshot(), 'f931');
  assert.equal(notifications, 1);
  assert.equal(fixture.focused.length, 0);
  assert.equal(fixture.reportContent.hidden, true);
  assert.equal(fixture.bankResult.hidden, true);
  assert.equal(fixture.fileInput.files[0], originalFile);
  assert.equal(fixture.period.value, '2026-08');
});
