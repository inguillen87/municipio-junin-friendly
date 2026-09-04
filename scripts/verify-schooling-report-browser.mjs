import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(os.tmpdir(), 'municontrol-schooling-report-browser');
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

function writeU16(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function concat(parts) {
  const result = Buffer.alloc(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    Buffer.from(part).copy(result, offset);
    offset += part.byteLength;
  }
  return result;
}

function createMinimalXlsx(privateMarker) {
  const entries = [
    ['[Content_Types].xml', '<Types/>'],
    ['_rels/.rels', '<Relationships/>'],
    ['xl/workbook.xml', '<workbook/>'],
    ['xl/worksheets/sheet1.xml', `<worksheet>${privateMarker}</worksheet>`],
  ];
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [entryName, content] of entries) {
    const name = Buffer.from(entryName, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const local = Buffer.alloc(30 + name.byteLength + data.byteLength);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20);
    writeU32(local, 18, data.byteLength);
    writeU32(local, 22, data.byteLength);
    writeU16(local, 26, name.byteLength);
    name.copy(local, 30);
    data.copy(local, 30 + name.byteLength);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.byteLength);
    writeU32(central, 0, 0x02014b50);
    writeU16(central, 4, 20);
    writeU16(central, 6, 20);
    writeU32(central, 20, data.byteLength);
    writeU32(central, 24, data.byteLength);
    writeU16(central, 28, name.byteLength);
    writeU32(central, 42, localOffset);
    name.copy(central, 46);
    centralParts.push(central);
    localOffset += local.byteLength;
  }
  const locals = concat(localParts);
  const central = concat(centralParts);
  const eocd = Buffer.alloc(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 8, entries.length);
  writeU16(eocd, 10, entries.length);
  writeU32(eocd, 12, central.byteLength);
  writeU32(eocd, 16, locals.byteLength);
  return concat([locals, central, eocd]);
}

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

fs.mkdirSync(outputRoot, { recursive: true });
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const artifacts = {};

async function inspect(viewport, label, runDiagnostic) {
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
    await page.waitForFunction(() => document.querySelectorAll('[data-schooling-requirements] li').length === 10);
    assert.equal(await page.locator('[data-schooling-generation]').isDisabled(), true);
    assert.match(await page.locator('[data-schooling-gate]').innerText(), /Generación bloqueada/);
    assert.equal(await page.locator('.schooling-file-input').evaluate((node) => getComputedStyle(node).position), 'absolute');

    if (runDiagnostic) {
      const marker = 'PERSONA-PRIVADA-NO-DEBE-VERSE';
      const fileName = 'legajo-privado-no-mostrar.xlsx';
      await page.locator('[data-schooling-file]').setInputFiles({
        name: fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: createMinimalXlsx(marker),
      });
      await page.locator('[data-schooling-validate]').click();
      await page.waitForFunction(() => document.querySelector('[data-schooling-status]')?.dataset.state === 'ok');
      assert.equal(await page.locator('[data-schooling-result]').isVisible(), true);
      assert.equal(await page.locator('[data-schooling-structure]').innerText(), 'Contenedor XLSX válido');
      assert.equal(await page.locator('[data-schooling-parts]').innerText(), '4');
      assert.equal(await page.locator('[data-schooling-worksheets]').innerText(), '1');
      assert.match(await page.locator('[data-schooling-fingerprint]').innerText(), /^sha256:[a-f0-9]{64}$/);
      assert.equal(await page.locator('[data-schooling-generation]').isDisabled(), true);
      assert.doesNotMatch(await page.locator('body').innerText(), new RegExp(`${fileName}|${marker}`));
    }

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    assert.equal(dimensions.scrollWidth <= dimensions.clientWidth + 1, true, `${label}: overflow horizontal`);
    await page.locator('#escolaridades').scrollIntoViewIfNeeded();
    const screenshot = path.join(outputRoot, `schooling-${label}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    artifacts[label] = screenshot;
    assert.deepEqual(issues, [], `${label}: errores de navegador:\n${issues.join('\n')}`);
  } finally {
    await context.close();
  }
}

try {
  await inspect({ width: 1440, height: 1000 }, 'desktop', true);
  await inspect({ width: 390, height: 844 }, 'mobile', false);
  process.stdout.write(`${JSON.stringify({ ok: true, artifacts }, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
