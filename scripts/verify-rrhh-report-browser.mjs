import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import readXlsxFile from 'read-excel-file/node';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const outputRoot = path.join(os.tmpdir(), 'municontrol-rrhh-report-browser');
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
const browser = await chromium.launch({ headless: true });
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
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  const issues = [];
  page.on('console', (message) => { if (message.type() === 'error') issues.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => { if (response.status() >= 400) issues.push(`HTTP ${response.status()} ${response.url()}`); });

  try {
    await page.goto(`${baseUrl}/reportes-rrhh.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#reportContent:not([hidden])');
    await page.waitForFunction(() => document.querySelector('#reportPackStatus')?.dataset.state === 'ready');
    assert.match(await page.locator('#metricHistorical').innerText(), /2[.\s]?450/);
    assert.match(await page.locator('#metricActive').innerText(), /882/);
    assert.match(await page.locator('#metricAbsences').innerText(), /31[.\s]?572/);
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
      assert.match(xlsxDownload.suggestedFilename(), /^municontrol_informe-rrhh_2026-08-06_[a-f0-9]{12}\.xlsx$/);
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
      assert.match(pdfDownload.suggestedFilename(), /^municontrol_informe-rrhh_2026-08-06_[a-f0-9]{12}\.pdf$/);
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
    assert.deepEqual(issues, [], `${label}: errores de navegador:\n${issues.join('\n')}`);
  } finally {
    await context.close();
  }
}

try {
  await inspect({ width: 1440, height: 900 }, 'desktop', true);
  await inspect({ width: 390, height: 844 }, 'mobile', false);
  process.stdout.write(`${JSON.stringify({ ok: true, artifacts }, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
