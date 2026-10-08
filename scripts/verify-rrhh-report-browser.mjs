import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import readXlsxFile from 'read-excel-file/node';

// Compiled public report plus a synthetic read-only session. This server never
// authenticates a municipal account or implements a business writer.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'public');
const outputRoot = path.resolve(process.env.RRHH_REPORT_QA_OUTPUT || path.join(projectRoot, 'verification', 'rrhh-report-browser'));
assert.ok(outputRoot.startsWith(path.join(projectRoot, 'verification') + path.sep), 'QA output must stay inside the worktree');
const sessionFixture = {
  ok: true, authenticated: true, sessionVersion: 2,
  user: { id: '11111111-1111-4111-8111-111111111111', name: 'Consulta sintética QA', email: 'rrhh-qa@example.invalid' },
  access: { context: 'tenant', tenant: { id: '22222222-2222-4222-8222-222222222222', roleKey: 'QA_READ_ONLY' },
    tenantCapabilities: ['workforce.summary.read'], platformCapabilities: [], platformRoles: [] },
};
const apiRequests = [];
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

function safeFile(requestPath) {
  const relative = decodeURIComponent(requestPath).replace(/^\/+/, '') || 'reportes-rrhh.html';
  const resolved = path.resolve(publicRoot, relative);
  return resolved === publicRoot || resolved.startsWith(`${publicRoot}${path.sep}`) ? resolved : null;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    apiRequests.push({ method: request.method, path: url.pathname, query: url.search });
    const allowed = request.method === 'GET' && url.pathname === '/api/internal-auth' && url.search === '';
    response.writeHead(allowed ? 200 : 404, {
      'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    });
    response.end(JSON.stringify(allowed ? sessionFixture : { ok: false, code: 'QA_PRIVATE_API_NOT_IMPLEMENTED' }));
    return;
  }
  const file = safeFile(url.pathname);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': mimeTypes.get(path.extname(file)) || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

fs.mkdirSync(outputRoot, { recursive: true });
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.RRHH_REPORT_BROWSER_CHANNEL ? { channel: process.env.RRHH_REPORT_BROWSER_CHANNEL } : {}),
});
const artifacts = {};

async function assertHealthy(page, label) {
  const state = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    reportVisible: !document.querySelector('#reportContent')?.hidden,
    layout: (() => {
      const shell = document.querySelector('.report-shell');
      const style = shell ? getComputedStyle(shell) : null;
      return {
        bodyWidth: document.body.getBoundingClientRect().width,
        shellWidth: shell?.getBoundingClientRect().width,
        shellCssWidth: style?.width,
        shellMinWidth: style?.minWidth,
        shellPadding: style ? `${style.paddingLeft} ${style.paddingRight}` : null,
        shellGrid: style?.gridTemplateColumns,
      };
    })(),
    overflowElements: [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${[...element.classList].slice(0, 2).map((name) => `.${name}`).join('')}`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.left < -1 || item.right > document.documentElement.clientWidth + 1)
      .slice(0, 12),
  }));
  assert.equal(state.reportVisible, true, `${label}: el informe debe quedar visible`);
  assert.equal(
    state.overflow,
    false,
    `${label}: overflow horizontal (${state.scrollWidth}px sobre ${state.clientWidth}px): ${JSON.stringify({ layout: state.layout, elements: state.overflowElements })}`,
  );
}

async function inspect(viewport, label, downloadFiles) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort());
  const page = await context.newPage();
  const issues = [];
  const requestsBefore = apiRequests.length;
  page.on('console', (message) => { if (message.type() === 'error') issues.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => { if (response.status() >= 400) issues.push(`HTTP ${response.status()} ${response.url()}`); });

  try {
    const [sessionResponse] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/internal-auth'
        && response.request().method() === 'GET'),
      page.goto(`${baseUrl}/reportes-rrhh.html`, { waitUntil: 'domcontentloaded' }),
    ]);
    assert.equal(sessionResponse.status(), 200, `${label}: respuesta de sesión sintética`);
    assert.deepEqual(await sessionResponse.json(), sessionFixture, `${label}: contrato de sesión completo`);
    await page.waitForSelector('#reportContent:not([hidden])');
    await page.waitForFunction(() => document.querySelector('#reportPackStatus')?.dataset.state === 'ready');
    await page.locator('.rc-overview summary').click();
    await page.waitForFunction(() => /2[.\s]?452/.test(document.querySelector('#metricHistorical')?.textContent || ''));
    assert.match(await page.locator('#metricHistorical').innerText(), /2[.\s]?452/);
    assert.match(await page.locator('#metricActive').innerText(), /875/);
    assert.match(await page.locator('#metricAbsences').innerText(), /31[.\s]?702/);
    await page.getByRole('tab', {name:'Informe completo',exact:true}).click();
    assert.equal(await page.locator('#snapshotDate').getAttribute('datetime'), '2026-09-10');
    assert.ok((await page.locator('#managementCutoff').innerText()).includes(await page.locator('#snapshotDate').innerText()), 'La leyenda de movimientos debe mostrar el mismo corte que la fuente del informe');
    assert.match(await page.locator('#exportCutoff').innerText(), /2026/);
    assert.match(await page.locator('#exportDataset').innerText(), /GRH/i);
    assert.match(await page.locator('#exportSha').innerText(), /^sha256:[a-f0-9]{12}/i);
    assert.equal(await page.locator('#downloadRrhhXlsx').isEnabled(), true);
    assert.equal(await page.locator('#downloadRrhhPdf').isEnabled(), true);
    assert.equal(await page.locator('#exportPackActions').getAttribute('aria-busy'), 'false');
    await assertHealthy(page, label);

    if (downloadFiles) {
      const [xlsxDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('#downloadRrhhXlsx').click(),
      ]);
      assert.match(xlsxDownload.suggestedFilename(), /^municontrol_informe-rrhh_2026-09-10_[a-f0-9]{12}\.xlsx$/);
      artifacts.xlsx = path.join(outputRoot, xlsxDownload.suggestedFilename());
      await xlsxDownload.saveAs(artifacts.xlsx);
      const xlsxBytes = fs.readFileSync(artifacts.xlsx);
      assert.deepEqual([...xlsxBytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
      for (const sheet of ['Resumen', 'Movimientos', 'Ausentismo', 'Sectores', 'Metodología']) {
        const rows = await readXlsxFile(artifacts.xlsx, { sheet });
        assert.ok(rows.length >= 4, `${sheet}: la hoja debe contener datos`);
      }

      const [pdfDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('#downloadRrhhPdf').click(),
      ]);
      assert.match(pdfDownload.suggestedFilename(), /^municontrol_informe-rrhh_2026-09-10_[a-f0-9]{12}\.pdf$/);
      artifacts.pdf = path.join(outputRoot, pdfDownload.suggestedFilename());
      await pdfDownload.saveAs(artifacts.pdf);
      const pdfBytes = fs.readFileSync(artifacts.pdf);
      assert.equal(pdfBytes.subarray(0, 8).toString('latin1').startsWith('%PDF-1.4'), true);
      assert.ok(pdfBytes.byteLength > 4_000, 'El PDF no debe quedar vacío');
      assert.match(await page.locator('#reportPackStatus').innerText(), /\.pdf$/i);
    }

    const screenshot = path.join(outputRoot, `rrhh-report-${label}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    artifacts[`screenshot_${label}`] = screenshot;
    assert.ok(apiRequests.length > requestsBefore, `${label}: la interfaz debe comprobar la sesión`);
    assert.ok(apiRequests.slice(requestsBefore).every(request => request.method === 'GET'
      && request.path === '/api/internal-auth' && request.query === ''), `${label}: ninguna API privada ni escritura inesperada`);
    assert.deepEqual(issues, [], `${label}: errores de navegador:\n${issues.join('\n')}`);
  } catch (error) {
    const state = await page.evaluate(() => ({
      capabilityState: document.documentElement.getAttribute('data-mc-capability-state'),
      capabilityReady: document.documentElement.getAttribute('data-mc-capability-ready'),
      reportState: document.querySelector('#reportPackStatus')?.dataset.state,
      gateLoaded: Boolean(globalThis.MuniControlCapabilityGate),
    })).catch(() => null);
    fs.writeFileSync(path.join(outputRoot, `failure-${label}.json`), JSON.stringify({
      error: String(error.stack), issues, apiRequests: apiRequests.slice(requestsBefore), state,
    }, null, 2));
    await page.screenshot({ path: path.join(outputRoot, `failure-${label}.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

try {
  await inspect({ width: 1440, height: 900 }, 'desktop', true);
  await inspect({ width: 390, height: 844 }, 'mobile', false);
  const result = { ok: true, artifacts, browser: browser.version(), widths: [1440, 390],
    authResponsesSynthetic: true, apiRequests, realMunicipalSessionTested: false, businessWrites: 0,
    scope: 'published aggregate report, compiled local assets and synthetic read-only session' };
  fs.writeFileSync(path.join(outputRoot, 'result.json'), JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
