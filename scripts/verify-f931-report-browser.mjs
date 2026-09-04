import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(os.tmpdir(), 'municontrol-f931-report-browser');
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
  const resolved = path.resolve(root, relative);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
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

function createValidF931Fixture(privateMarker) {
  const first = Buffer.alloc(463, 0x20);
  const second = Buffer.alloc(463, 0x41);
  Buffer.from(privateMarker, 'ascii').copy(first, 0, 0, Math.min(privateMarker.length, 60));
  second[80] = 0xd1;
  return Buffer.concat([first, Buffer.from('\r\n'), second, Buffer.from('\r\n')]);
}

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

fs.mkdirSync(outputRoot, { recursive: true });
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const artifacts = {};

async function inspect(viewport, label, mode) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const issues = [];
  page.on('console', (message) => { if (message.type() === 'error') issues.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => { if (response.status() >= 400) issues.push(`HTTP ${response.status()} ${response.url()}`); });

  try {
    await page.goto(`${baseUrl}/reportes-rrhh.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#reportContent:not([hidden])');
    await page.waitForFunction(() => document.querySelectorAll('[data-f931-requirements] li').length === 11);
    assert.equal(await page.locator('[data-f931-generate]').isDisabled(), true);
    assert.equal(await page.locator('[data-f931-submit]').isDisabled(), true);
    assert.match(await page.locator('[data-f931-gate]').innerText(), /Generación y presentación bloqueadas/);
    assert.equal(await page.locator('.f931-file-input').evaluate((node) => getComputedStyle(node).position), 'absolute');

    if (mode === 'declared') {
      await page.locator('[data-f931-scope-mode]').selectOption('declared');
      assert.equal(await page.locator('[data-f931-scope]').isDisabled(), false);
      await page.locator('[data-f931-scope]').selectOption('jurisdiction_42');
    } else {
      assert.equal(await page.locator('[data-f931-scope]').isDisabled(), true);
    }

    const marker = `PERSONA-PRIVADA-${label.toUpperCase()}-NO-MOSTRAR`;
    const fileName = `legajos-privados-${label}.txt`;
    await page.locator('[data-f931-file]').setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: createValidF931Fixture(marker),
    });
    await page.locator('[data-f931-validate]').click();
    await page.waitForFunction(() => ['ok', 'warning'].includes(
      document.querySelector('[data-f931-status]')?.dataset.state,
    ));

    assert.equal(await page.locator('[data-f931-result]').isVisible(), true);
    assert.equal(await page.locator('[data-f931-structure]').innerText(), 'Estructura física válida');
    assert.equal(await page.locator('[data-f931-records]').innerText(), '2');
    assert.match(await page.locator('[data-f931-fingerprint]').innerText(), /^sha256:[a-f0-9]{64}$/);
    assert.equal(await page.locator('[data-f931-matches] li').count(), 3);
    assert.equal(await page.locator('[data-f931-matches] li[data-state="ok"]').count(), 0);
    assert.equal(await page.locator('[data-f931-generate]').isDisabled(), true);
    assert.equal(await page.locator('[data-f931-submit]').isDisabled(), true);
    if (mode === 'declared') {
      assert.equal(await page.locator('[data-f931-resolved-scope]').innerText(), 'Jurisdicción 42');
      assert.equal(await page.locator('[data-f931-status]').getAttribute('data-state'), 'ok');
    } else {
      assert.equal(await page.locator('[data-f931-resolved-scope]').innerText(), 'No identificable por huella');
      assert.equal(await page.locator('[data-f931-status]').getAttribute('data-state'), 'warning');
    }
    assert.doesNotMatch(await page.locator('body').innerText(), new RegExp(`${fileName}|${marker}`));

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      hasContent: document.body.innerText.trim().length > 0,
      hasErrorOverlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')),
    }));
    assert.equal(dimensions.hasContent, true, `${label}: página vacía`);
    assert.equal(dimensions.hasErrorOverlay, false, `${label}: overlay de error`);
    assert.equal(dimensions.scrollWidth <= dimensions.clientWidth + 1, true, `${label}: overflow horizontal`);
    await page.locator('#f931').scrollIntoViewIfNeeded();
    const screenshot = path.join(outputRoot, `f931-${label}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    artifacts[label] = screenshot;
    assert.deepEqual(issues, [], `${label}: errores de navegador:\n${issues.join('\n')}`);
  } finally {
    await context.close();
  }
}

try {
  await inspect({ width: 1440, height: 1000 }, 'desktop', 'declared');
  await inspect({ width: 390, height: 844 }, 'mobile', 'auto');
  process.stdout.write(`${JSON.stringify({ ok: true, artifacts }, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
