import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

function containingFunction(source, needle) {
  const needleIndex = source.indexOf(needle);
  assert.notEqual(needleIndex, -1, `No se encontró ${needle}`);
  const prefix = source.slice(0, needleIndex + needle.length);
  const declarations = [...prefix.matchAll(/(?:^|\n)\s*function\s+[A-Za-z_$][\w$]*\s*\(/g)];
  const declaration = declarations.at(-1);
  assert.ok(declaration, `No se encontró la función que contiene ${needle}`);
  const start = declaration.index + declaration[0].search(/function\s+/);
  const opening = source.indexOf('{', start);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`La función que contiene ${needle} quedó sin cierre`);
}

function handoffHarness(source, storedValue, now = 500_000) {
  const consumer = containingFunction(source, 'sessionStorage.getItem(PAYROLL_NOVELTY_HANDOFF_KEY)');
  const declaration = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(consumer);
  assert.ok(declaration);
  const values = new Map(storedValue === undefined
    ? []
    : [['municontrol.payroll-novelty-handoff.v1', storedValue]]);
  const elements = new Map([
    ['legajo', { value: '' }],
    ['periodMonth', { value: '' }],
    ['payrollType', { value: '' }],
  ]);
  const individualMode = { checked: false };
  const calls = { updateMode: 0, invalidatePreparedDraft: 0, showMessage: [] };
  const context = {
    PAYROLL_NOVELTY_HANDOFF_KEY: 'municontrol.payroll-novelty-handoff.v1',
    PAYROLL_NOVELTY_HANDOFF_MAX_AGE_MS: 5 * 60 * 1000,
    TYPE_LABELS: Object.freeze({ monthly: 'Mensual', sac: 'SAC', vacation: 'Vacaciones' }),
    sessionStorage: {
      getItem(key) { return values.get(key) ?? null; },
      removeItem(key) { values.delete(key); },
    },
    document: { querySelector() { return individualMode; } },
    byId(id) { return elements.get(id); },
    updateMode() { calls.updateMode += 1; },
    invalidatePreparedDraft() { calls.invalidatePreparedDraft += 1; },
    showMessage(...args) { calls.showMessage.push(args); },
    Date: { now: () => now },
  };
  vm.runInNewContext(`${consumer}\nglobalThis.consumeHandoff = ${declaration[1]};`, context, {
    filename: 'payroll-novelty-handoff-runtime.js',
  });
  return {
    consume: context.consumeHandoff,
    values,
    elements,
    individualMode,
    calls,
  };
}

class FakeElement {
  constructor(tagName, className = '', textContent = '') {
    this.tagName = tagName;
    this.className = className;
    this.textContent = textContent;
    this.children = [];
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.open = false;
  }

  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  dispatch(name) { return this.listeners.get(name)?.({ target: this }); }
}

function findElement(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    if (child && typeof child === 'object') {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

function payrollHistoryHarness(source, responses) {
  const renderer = containingFunction(source, 'function renderEmployeePayrollHistory(employee)');
  const calls = [];
  const requests = [];
  const context = {
    DATA_URL: '/api/internal-data',
    create(tagName, className, textContent) { return new FakeElement(tagName, className, textContent); },
    text(value) { return value === null || value === undefined ? '' : String(value).trim(); },
    async requestJSON(url, options = {}) {
      calls.push(url);
      requests.push({ url, options });
      const response = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (response instanceof Error) throw response;
      if (typeof response === 'function') return response({ url, options });
      return response;
    },
    nonNegativeNumber(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    },
    formatNumber(value) { return String(value); },
    payrollCard() { throw new Error('esta prueba no necesita renderizar filas'); },
    UnauthorizedError: class UnauthorizedError extends Error {},
    AbortController,
    state: { payrollController: null },
    URLSearchParams,
  };
  vm.runInNewContext(`${renderer}\nglobalThis.renderPayrollHistory = renderEmployeePayrollHistory;`, context, {
    filename: 'employee-payroll-history-runtime.js',
  });
  return { render: context.renderPayrollHistory, calls, requests };
}

function noveltyTypeNormalizer(source) {
  const normalizer = containingFunction(source, 'function noveltyPayrollType(value)');
  const context = {
    text(value) { return value === null || value === undefined ? '' : String(value).trim(); },
  };
  vm.runInNewContext(`${normalizer}\nglobalThis.normalize = noveltyPayrollType;`, context, {
    filename: 'employee-payroll-type-normalizer-runtime.js',
  });
  return context.normalize;
}

function payrollNoveltyStarter(source) {
  const normalizer = containingFunction(source, 'function noveltyPayrollType(value)');
  const starter = containingFunction(source, 'function startPayrollNovelty(employee, liquidation)');
  const handoffs = [];
  const redirects = [];
  const toasts = [];
  const context = {
    PAYROLL_NOVELTY_HANDOFF_KEY: 'municontrol.payroll-novelty-handoff.v1',
    text(value) { return value === null || value === undefined ? '' : String(value).trim(); },
    currentMonthValue() { return '2026-09'; },
    toast(...args) { toasts.push(args); },
    writeOperationalHandoff(key, payload) {
      handoffs.push({ key, payload });
      return true;
    },
    location: { assign(path) { redirects.push(path); } },
  };
  vm.runInNewContext(`${normalizer}\n${starter}\nglobalThis.start = startPayrollNovelty;`, context, {
    filename: 'employee-payroll-novelty-starter-runtime.js',
  });
  return { start: context.start, handoffs, redirects, toasts };
}

test('la ficha ofrece historial mensual real bajo demanda y no lo presenta como recibo', async () => {
  const html = await read('internal-dashboard.html');

  assert.match(html, /employeePayrollHistory/);
  assert.match(html, /Historial de liquidaciones/);
  assert.match(html, /resumen mensual[^<\n]*no (?:es )?(?:un )?recibo oficial/i);
  assert.match(html, /employeepayroll/);
  assert.match(html, /closed_reconciled/);
  assert.match(html, /closed_mismatch/);
  assert.match(html, /control aritmético derivado/i);
  assert.match(html, /tolerancia ± \$ 0,01/i);
  assert.doesNotMatch(html, /Diferencia de conciliación informada/i);
  assert.match(html, /meta\.setAttribute\('role', 'status'\)/);
  assert.match(html, /meta\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(html, /uncertified/);
  assert.match(html, /Cargar novedad/);

  assert.match(html, /new URLSearchParams\(\{[\s\S]{0,180}resource: 'employeepayroll',[\s\S]{0,180}contractId:/);
  assert.match(html, /addEventListener\('toggle',[\s\S]{0,180}if \(!section\.open\)/);
  assert.match(html, /if \(activeController\) activeController\.abort\(\)/);
});

test('Cargar novedad crea un handoff privado mínimo sin datos en la URL', async () => {
  const html = await read('internal-dashboard.html');
  assert.match(html, /const PAYROLL_NOVELTY_HANDOFF_KEY = 'municontrol\.payroll-novelty-handoff\.v1'/);

  const handoffIndex = html.indexOf('writeOperationalHandoff(PAYROLL_NOVELTY_HANDOFF_KEY');
  assert.notEqual(handoffIndex, -1);
  const handoff = html.slice(handoffIndex, handoffIndex + 520);
  assert.match(handoff, /legajo\s*:/);
  assert.match(handoff, /periodMonth\s*:/);
  assert.match(handoff, /payrollType\s*:/);
  assert.doesNotMatch(handoff, /(?:contractId|nombre|dni|cuil|email|telefono|domicilio)\s*:/i);
  assert.match(handoff, /location\.assign\('novedades-nomina\.html'\)/);

  assert.doesNotMatch(html, /location\.assign\([^\n]*(?:legajo|contractId|periodMonth|payrollType)/i);
  assert.doesNotMatch(html, /localStorage\.(?:setItem|getItem)\(PAYROLL_NOVELTY_HANDOFF_KEY/);
});

test('el historial presenta los códigos GRH en lenguaje cotidiano sin ampliar el handoff vigente', async () => {
  const html = await read('internal-dashboard.html');
  const workbench = await read('assets/payroll-novelty-workbench.js');
  const contract = JSON.parse(await read('contracts/grh-payroll-type-map.v1.json'));
  const normalize = noveltyTypeNormalizer(html);
  const starter = payrollNoveltyStarter(html);
  assert.deepEqual(contract.verifiedMappings.map(({ sourceCode, canonicalType }) => ({
    sourceCode, canonicalType,
  })), [{ sourceCode: 'M', canonicalType: 'monthly' }]);
  for (const canonical of ['monthly', 'first_fortnight', 'sac', 'vacation', 'supplementary', 'final', 'other']) {
    assert.equal(normalize(canonical), canonical);
  }
  for (const sourceCode of ['M', 'P', 'S', 'V', 'O', 'F', 'desconocido', '']) {
    assert.equal(normalize(sourceCode), null, sourceCode);
  }
  starter.start(
    { legajo: '571' },
    { payrollDate: '2026-08-31', payrollType: 'M', canonicalPayrollType: 'monthly' },
  );
  starter.start(
    { legajo: '571' },
    { payrollDate: '2026-07-31', payrollType: 'P', canonicalPayrollType: null },
  );
  assert.deepEqual(starter.handoffs.map(({ payload }) => payload.payrollType), [
    'monthly', null,
  ]);
  assert.deepEqual(starter.redirects, [
    'novedades-nomina.html', 'novedades-nomina.html',
  ]);
  assert.deepEqual(starter.toasts, []);
  assert.match(html, /payrollTypeLabel\(item\.canonicalPayrollType, item\.payrollType\)/);
  assert.match(html, /Tipo informado por GRH · código/);
  assert.match(html, /P: 'Primera quincena'/);
  assert.match(html, /S: 'Aguinaldo \(SAC\)'/);
  assert.match(html, /O: 'Liquidación adicional \/ otros conceptos'/);
  assert.doesNotMatch(html, /Código GRH/);
  assert.match(workbench, /handoffRequiresPayrollTypeSelection\s*=\s*!payrollType/);
  assert.match(workbench, /if \(handoffRequiresPayrollTypeSelection\)[\s\S]{0,360}placeholder\.value\s*=\s*''/);
  assert.match(workbench, /if \(handoffRequiresPayrollTypeSelection && !current\) select\.value = ''/);
  const loadIndex = workbench.indexOf('consumePayrollNoveltyHandoff();');
  assert.ok(loadIndex >= 0);
  assert.ok(workbench.indexOf('loadBootstrap();', loadIndex) > loadIndex,
    'el bootstrap que reconstruye el select debe ejecutarse después de consumir el handoff');
});

test('el historial no consulta al renderizar, carga una vez al abrir y pagina sólo por acción', async () => {
  const source = await read('internal-dashboard.html');
  const harness = payrollHistoryHarness(source, [
    { data: { items: [] }, meta: { pagination: { page: 1, pages: 2, total: 13 } } },
    { data: { items: [] }, meta: { pagination: { page: 2, pages: 2, total: 13 } } },
  ]);
  const section = harness.render({ contractId: '11111111-1111-4111-8111-111111111111' });
  const more = findElement(section, (node) => node.textContent === 'Ver períodos anteriores');
  assert.ok(more);
  assert.equal(harness.calls.length, 0, 'renderizar la ficha no debe consultar salarios');

  section.dispatch('toggle');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.length, 0, 'cerrado no consulta');

  section.open = true;
  section.dispatch('toggle');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.length, 1);
  assert.match(harness.calls[0], /resource=employeepayroll/);
  assert.match(harness.calls[0], /contractId=11111111-1111-4111-8111-111111111111/);
  assert.match(harness.calls[0], /page=1/);

  section.dispatch('toggle');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.length, 1, 'reabrir un historial cargado no repite la consulta');

  await more.dispatch('click');
  assert.equal(harness.calls.length, 2);
  assert.match(harness.calls[1], /page=2/);
});

test('un error al paginar conserva una acción explícita de reintento', async () => {
  const source = await read('internal-dashboard.html');
  const harness = payrollHistoryHarness(source, [
    { data: { items: [] }, meta: { pagination: { page: 1, pages: 2, total: 13 } } },
    new Error('corte temporal'),
  ]);
  const section = harness.render({ contractId: '11111111-1111-4111-8111-111111111111' });
  const more = findElement(section, (node) => node.textContent === 'Ver períodos anteriores');
  section.open = true;
  section.dispatch('toggle');
  await new Promise((resolve) => setImmediate(resolve));
  await more.dispatch('click');
  assert.equal(more.hidden, false);
  assert.equal(more.disabled, false);
  assert.equal(more.textContent, 'Reintentar períodos anteriores');
});

test('la consulta salarial usa AbortController y se cancela al cerrar o reemplazar ficha', async () => {
  const html = await read('internal-dashboard.html');
  const history = containingFunction(html, 'function renderEmployeePayrollHistory(employee)');
  const close = containingFunction(html, 'function closeDialog()');
  const open = containingFunction(html, 'async function openEmployee(contractId, legajo, companyId, fallbackName)');
  assert.match(history, /new AbortController\(\)/);
  assert.match(history, /requestJSON\([^;]+\{ signal: controller\.signal \}\)/);
  assert.match(history, /error\.name === 'AbortError'/);
  assert.match(history, /if \(activeController\) activeController\.abort\(\)/);
  assert.match(close, /state\.payrollController\.abort\(\)/);
  assert.match(open, /state\.payrollController\.abort\(\)/);
});

test('colapsar el historial aborta la consulta salarial en curso', async () => {
  const source = await read('internal-dashboard.html');
  let observedSignal = null;
  const harness = payrollHistoryHarness(source, [({ options }) => new Promise((resolve, reject) => {
    observedSignal = options.signal;
    options.signal.addEventListener('abort', () => {
      const error = new Error('abortada');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  })]);
  const section = harness.render({ contractId: '11111111-1111-4111-8111-111111111111' });

  section.open = true;
  section.dispatch('toggle');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(observedSignal);
  assert.equal(observedSignal.aborted, false);

  section.open = false;
  section.dispatch('toggle');
  assert.equal(observedSignal.aborted, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.length, 1);
});

test('una acción salarial bloqueada expone la razón visible y la asocia al botón', async () => {
  const html = await read('internal-dashboard.html');
  const card = containingFunction(html, 'function payrollCard(item, employee)');
  assert.match(card, /payroll-action-unavailable/);
  assert.match(card, /novelty\.setAttribute\('aria-describedby', availability\.id\)/);
  assert.match(card, /actionContext\.appendChild\(availability\)/);
});

test('Novedades consume el handoff una sola vez, dentro de cinco minutos y sin autoenviar', async () => {
  const source = await read('assets/payroll-novelty-workbench.js');

  assert.match(source, /const PAYROLL_NOVELTY_HANDOFF_KEY = 'municontrol\.payroll-novelty-handoff\.v1'/);
  assert.match(source, /PAYROLL_NOVELTY_HANDOFF_MAX_AGE_MS\s*=\s*(?:5\s*\*\s*60\s*\*\s*1000|300000)/);
  const consumer = containingFunction(source, 'sessionStorage.getItem(PAYROLL_NOVELTY_HANDOFF_KEY)');
  const getIndex = consumer.indexOf('sessionStorage.getItem(PAYROLL_NOVELTY_HANDOFF_KEY)');
  const removeIndex = consumer.indexOf('sessionStorage.removeItem(PAYROLL_NOVELTY_HANDOFF_KEY)');
  const parseIndex = consumer.indexOf('JSON.parse');
  assert.ok(getIndex >= 0 && removeIndex > getIndex, 'el handoff debe eliminarse al consumirlo');
  assert.ok(parseIndex === -1 || removeIndex < parseIndex, 'también debe descartarse si el JSON es inválido');
  assert.match(consumer, /createdAt/);
  assert.match(consumer, /Date\.now\(\)/);
  assert.match(consumer, /PAYROLL_NOVELTY_HANDOFF_MAX_AGE_MS/);
  assert.match(consumer, /byId\('legajo'\)\.value/);
  assert.match(consumer, /byId\('periodMonth'\)\.value/);
  assert.match(consumer, /byId\('payrollType'\)\.value/);
  assert.doesNotMatch(consumer, /\b(?:api|fetch|preflight|prepare)\s*\(/);
  assert.doesNotMatch(consumer, /\.disabled\s*=\s*true/);

  const declaration = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(consumer);
  assert.ok(declaration);
  const initialize = containingFunction(source, 'function initialize()');
  assert.match(initialize, new RegExp(`\\b${declaration[1]}\\s*\\(`));
  assert.doesNotMatch(source, /localStorage\.(?:setItem|getItem)\(PAYROLL_NOVELTY_HANDOFF_KEY/);
});

test('el consumidor aplica TTL y one-shot en runtime sin ejecutar ninguna operación remota', async () => {
  const source = await read('assets/payroll-novelty-workbench.js');
  const valid = JSON.stringify({
    createdAt: 200_000,
    legajo: '571',
    periodMonth: '2026-08',
    payrollType: 'monthly',
  });
  const accepted = handoffHarness(source, valid);
  assert.equal(accepted.consume(), true, 'el límite exacto de cinco minutos debe ser aceptado');
  assert.equal(accepted.consume(), false, 'el mismo handoff no puede consumirse dos veces');
  assert.equal(accepted.values.size, 0);
  assert.equal(accepted.elements.get('legajo').value, '571');
  assert.equal(accepted.elements.get('periodMonth').value, '2026-08');
  assert.equal(accepted.elements.get('payrollType').value, 'monthly');
  assert.equal(accepted.individualMode.checked, true);
  assert.deepEqual(accepted.calls, {
    updateMode: 1,
    invalidatePreparedDraft: 1,
    showMessage: [[
      'success',
      'Legajo y período preparados',
      'Completá concepto, unidades o importe y revisá la novedad. Nada fue enviado automáticamente.',
    ]],
  });

  const rejectedValues = [
    '{json roto',
    JSON.stringify({ createdAt: 199_999, legajo: '571', periodMonth: '2026-08', payrollType: 'monthly' }),
    JSON.stringify({ createdAt: 500_001, legajo: '571', periodMonth: '2026-08', payrollType: 'monthly' }),
    JSON.stringify({ createdAt: 500_000, legajo: '571', periodMonth: '2026-08', payrollType: 'no-permitido' }),
  ];
  for (const value of rejectedValues) {
    const rejected = handoffHarness(source, value);
    assert.equal(rejected.consume(), false, value);
    assert.equal(rejected.values.size, 0, 'también los handoffs inválidos deben descartarse');
    assert.equal(rejected.calls.updateMode, 0);
    assert.equal(rejected.calls.invalidatePreparedDraft, 0);
    assert.deepEqual(rejected.calls.showMessage, []);
  }

  const unclassified = handoffHarness(source, JSON.stringify({
    createdAt: 500_000,
    legajo: '571',
    periodMonth: '2026-08',
    payrollType: null,
  }));
  assert.equal(unclassified.consume(), true);
  assert.equal(unclassified.elements.get('payrollType').value, '');
  assert.match(unclassified.calls.showMessage[0][2], /Elegí el tipo de liquidación/);
});
