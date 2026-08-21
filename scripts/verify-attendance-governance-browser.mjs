import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const screenshots = [];
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
]);
const cleanRoutes = new Map([
  ['/', '/friendly-dashboard.html'],
  ['/control-horario-homologacion', '/control-horario-homologacion.html'],
  ['/control-horario-readiness', '/control-horario-readiness.html'],
]);

function safeFile(requestPath) {
  const pathname = cleanRoutes.get(requestPath) || requestPath;
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  const resolved = path.resolve(root, relative);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const file = safeFile(pathname);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': mimeTypes.get(path.extname(file)) || 'application/octet-stream',
    'cache-control': pathname === '/sw.js' ? 'no-store' : 'public, max-age=0, must-revalidate',
    ...(pathname === '/sw.js' ? { 'service-worker-allowed': '/' } : {}),
  });
  fs.createReadStream(file).pipe(response);
});

const externalBaseUrl = (process.env.BASE_URL || '').trim().replace(/\/$/, '');
if (!externalBaseUrl) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}
const address = server.address();
const baseUrl = externalBaseUrl || `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

async function inspect(viewport, label) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const issues = [];
  let offline = false;
  page.on('console', (message) => { if (message.type() === 'error') issues.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => { if (!offline) issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`); });
  page.on('response', (response) => { if (response.status() >= 400) issues.push(`HTTP ${response.status()} ${response.url()}`); });

  try {
    await page.goto(`${baseUrl}/control-horario-homologacion`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#pending-toggle');
    assert.match(await page.title(), /Homologación de turnos y reglas/);
    assert.match(await page.locator('.stamp').innerText(), /no homologado/i);
    assert.equal(await page.locator('tbody tr').count(), 15);
    assert.equal(await page.locator('tbody tr[data-state="candidate"]').count(), 3);
    assert.equal(await page.locator('tbody tr[data-state="pending"]').count(), 12);
    await page.locator('#pending-toggle').click();
    assert.equal(await page.locator('#pending-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('tbody tr:visible').count(), 12);
    await page.locator('#pending-toggle').click();
    assert.equal(await page.locator('tbody tr:visible').count(), 15);

    const layout = await page.evaluate(() => {
      const rgba = (value) => {
        const parts = value.match(/[\d.]+/g)?.map(Number) || [];
        return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts[3] ?? 1 };
      };
      const opaqueBackground = (element) => {
        for (let node = element; node; node = node.parentElement) {
          const color = rgba(getComputedStyle(node).backgroundColor);
          if (color.a > 0.98) return color;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
      };
      const luminance = ({ r, g, b }) => {
        const channels = [r, g, b].map((value) => {
          const normalized = value / 255;
          return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const contrast = (foreground, background) => {
        const first = luminance(foreground);
        const second = luminance(background);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      };
      const visible = [...document.querySelectorAll('body *')].filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
      const contrastFailures = visible
        .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
        .map((element) => {
          const style = getComputedStyle(element);
          const ratio = contrast(rgba(style.color), opaqueBackground(element));
          return { tag: element.tagName, text: element.textContent.trim().slice(0, 48), ratio };
        })
        .filter(({ ratio }) => ratio < 4.5);
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        minFontSize: Math.min(...visible.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)).filter(Number.isFinite)),
        heading: document.querySelector('h1')?.textContent?.trim(),
        contrastFailures,
      };
    });
    assert.equal(layout.overflow, false, `${label}: overflow horizontal`);
    assert.ok(layout.minFontSize >= 12, `${label}: texto menor a 12 px (${layout.minFontSize})`);
    assert.deepEqual(layout.contrastFailures, [], `${label}: contraste menor a 4.5:1`);
    assert.match(layout.heading || '', /Turnos que se pueden explicar/);

    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      scrollTo(0, 0);
    });
    const screenshot = path.join(os.tmpdir(), `municontrol-s006b-${label}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    screenshots.push(screenshot);

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) location.reload();
    });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    offline = true;
    await context.setOffline(true);
    await page.goto(`${baseUrl}/control-horario-homologacion.html`, { waitUntil: 'domcontentloaded' });
    assert.match(await page.locator('.stamp').innerText(), /no homologado/i);
    await page.goto(`${baseUrl}/control-horario-homologacion`, { waitUntil: 'domcontentloaded' });
    assert.match(await page.locator('h1').innerText(), /Turnos que se pueden explicar/);
    offline = false;
    await context.setOffline(false);
  } finally {
    await context.close();
  }
  assert.deepEqual(issues, [], `${label}: ${issues.join('\n')}`);
}

try {
  const contractResponse = await fetch(`${baseUrl}/attendance-policy-candidates.v1.json`);
  assert.equal(contractResponse.status, 200);
  const contract = await contractResponse.json();
  assert.equal(contract.status, 'draft_not_homologated');
  await inspect({ width: 1440, height: 900 }, 'desktop');
  await inspect({ width: 390, height: 844 }, 'mobile');
  console.log(`S006-B browser QA: OK; screenshots: ${screenshots.join(', ')}`);
} finally {
  await browser.close();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
}
