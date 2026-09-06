import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const pagePath = fileURLToPath(new URL('../reportes-rrhh.html', import.meta.url));
const html = fs.readFileSync(pagePath, 'utf8');
const sourceData = JSON.parse(fs.readFileSync(new URL('../friendly-data.json', import.meta.url), 'utf8'));
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1]).find((content) => content.includes('async function start()'));

function element(tagName = 'div', attributes = '') {
  const listeners = new Map();
  const node = {
    tagName,
    hidden: /\shidden(?:\s|>)/.test(`${attributes}>`),
    disabled: /\sdisabled(?:\s|>)/.test(`${attributes}>`),
    textContent: '', value: '', files: [], children: [], dataset: {},
    attributes: new Map(), listeners,
    style: { setProperty() {} },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) ?? []) listener({ type, target: this });
    },
  };
  return node;
}

function runPage(responses) {
  const nodes = new Map();
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    nodes.set(match[3], element(match[1], match[2]));
  }
  const requests = [];
  const document = {
    getElementById: (id) => nodes.get(id),
    createElement: (tagName) => element(tagName),
    createElementNS: (_namespace, tagName) => element(tagName),
  };
  const fetch = async (url, options) => {
    requests.push({ url, options });
    const response = responses[requests.length - 1];
    if (response instanceof Error) throw response;
    if (!response) throw new Error('Unexpected repeated request');
    return typeof response === 'function' ? response() : response;
  };
  const run = vm.compileFunction(script, ['document', 'fetch'], {
    filename: path.resolve(pagePath),
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });
  const workbook = { name: 'planilla-de-prueba.xlsx', size: 100 };
  nodes.get('bankControlWorkbook').files = [workbook];
  nodes.get('bankControlPeriod').value = '2026-08';
  run(document, fetch);
  return { nodes, requests, workbook };
}

async function waitUntilIdle(page) {
  const deadline = Date.now() + 4000;
  while (page.nodes.get('reportOverview').getAttribute('aria-busy') === 'true') {
    if (Date.now() > deadline) throw new Error('The report did not leave its loading state');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function assertWorkbookPreserved(page) {
  assert.equal(page.nodes.get('bankControlWorkbook').files[0], page.workbook);
  assert.equal(page.nodes.get('bankControlPeriod').value, '2026-08');
}

test('el espacio de reportes tiene un único título y conserva navegación útil sin React', () => {
  assert.match(html, /<body data-mc-workspace="reports">/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<h1 id="reportWorkspaceTitle">Reportes y controles<\/h1>/);
  assert.match(html, /<h2 class="report-title">Dotación, movimientos y ausentismo<\/h2>/);
  assert.match(html, /id="mc-report-workspace-root"/);
  for (const id of ['bancarizacion', 'escolaridades', 'f931', 'descargas']) {
    assert.match(html, new RegExp(`href="#${id}"`));
  }
  assert.match(html, /municontrol-enterprise\.css[\s\S]*\/assets\/report-workspace\.css/);
  assert.equal((html.match(/<!-- MC_REPORT_WORKSPACE -->/g) ?? []).length, 1);
});

test('los tres controles locales quedan fuera del informe dependiente de la fuente', () => {
  const normalized = html.replaceAll('\r\n', '\n');
  const end = normalized.indexOf('</article>\n      </section>', normalized.indexOf('<section id="reportOverview"'));
  assert.ok(end > 0);
  const report = normalized.slice(normalized.indexOf('<section id="reportOverview"'), end);
  assert.match(report, /id="reportContent" hidden/);
  assert.match(report, /id="descargas"/);
  assert.match(report, /id="footerSource"/);
  for (const [id, panel] of [['bancarizacion', 'bank'], ['escolaridades', 'schooling'], ['f931', 'f931']]) {
    const opening = normalized.match(new RegExp(`<section[^>]+id="${id}"[^>]*>`))?.[0];
    assert.ok(opening);
    assert.match(opening, new RegExp(`data-report-panel="${panel}"`));
    assert.doesNotMatch(opening, /\shidden(?:\s|>)/);
    assert.ok(normalized.indexOf(opening) > end);
    assert.doesNotMatch(report, new RegExp(`id="${id}"`));
  }
});

test('un 503 mantiene ocultas las cifras y descargas del informe, no borra archivos locales', async () => {
  const page = runPage([{ ok: false, status: 503 }]);
  await waitUntilIdle(page);
  assert.equal(page.nodes.get('reportContent').hidden, true);
  assert.equal(page.nodes.get('loadError').hidden, false);
  assert.equal(page.nodes.get('loading').hidden, true);
  assert.equal(page.nodes.get('downloadRrhhXlsx').disabled, true);
  assert.equal(page.nodes.get('downloadRrhhPdf').disabled, true);
  assert.equal(page.nodes.get('retryReportLoad').disabled, false);
  assert.match(page.nodes.get('reportLoadErrorMessage').textContent, /sin salir de esta página/);
  assert.match(page.nodes.get('reportLoadErrorMessage').textContent, /siguen disponibles/);
  for (const id of ['bancarizacion', 'escolaridades', 'f931']) assert.equal(page.nodes.get(id).hidden, false);
  assertWorkbookPreserved(page);
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, 'friendly-data.json');
});

test('reintentar recupera la fuente y las descargas sin recargar ni duplicar eventos', async () => {
  const page = runPage([
    { ok: false, status: 503 },
    { ok: true, status: 200, json: async () => structuredClone(sourceData) },
  ]);
  await waitUntilIdle(page);
  page.nodes.get('retryReportLoad').dispatch('click');
  await waitUntilIdle(page);
  assert.equal(page.requests.length, 2);
  assert.equal(page.nodes.get('reportContent').hidden, false);
  assert.equal(page.nodes.get('loadError').hidden, true);
  assert.equal(page.nodes.get('downloadRrhhXlsx').disabled, false);
  assert.equal(page.nodes.get('downloadRrhhPdf').disabled, false);
  assert.equal(page.nodes.get('reportPackStatus').dataset.state, 'ready');
  assert.equal(page.nodes.get('metricHistorical').textContent, new Intl.NumberFormat('es-AR').format(sourceData.workforce.historicalRecords));
  assertWorkbookPreserved(page);
  page.nodes.get('retryReportLoad').dispatch('click');
  await waitUntilIdle(page);
  assert.equal(page.requests.length, 2, 'un informe recuperado no debe recargarse desde un reintento residual');
  assert.equal(page.nodes.get('downloadRrhhXlsx').listeners.get('click').length, 1);
  assert.equal(page.nodes.get('downloadRrhhPdf').listeners.get('click').length, 1);
});

test('un archivo agregado inválido no habilita indicadores ni exportación', async () => {
  const page = runPage([{ ok: true, status: 200, json: async () => ({}) }]);
  await waitUntilIdle(page);
  assert.equal(page.nodes.get('reportContent').hidden, true);
  assert.equal(page.nodes.get('downloadRrhhXlsx').disabled, true);
  assert.equal(page.nodes.get('downloadRrhhPdf').disabled, true);
  assert.equal(page.nodes.get('loadError').hidden, false);
  assertWorkbookPreserved(page);
});

test('el reintento no duplica consultas mientras una carga sigue pendiente', async () => {
  let resolveResponse;
  const pending = new Promise((resolve) => { resolveResponse = resolve; });
  const page = runPage([() => pending]);
  assert.equal(page.nodes.get('retryReportLoad').disabled, true);
  page.nodes.get('retryReportLoad').dispatch('click');
  assert.equal(page.requests.length, 1);
  resolveResponse({ ok: false, status: 503 });
  await waitUntilIdle(page);
  assert.equal(page.nodes.get('retryReportLoad').disabled, false);
  assertWorkbookPreserved(page);
});
