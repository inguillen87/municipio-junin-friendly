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
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
]);

const payrollFixture = Object.freeze({
  ok: true,
  status: 'ready',
  sourcePolicy: {
    label: 'GRH · fixture sintético de QA',
    detail: 'Prueba local del contrato visual; no representa una liquidación municipal.',
  },
  latestClosed: {
    month: '2026-07-01', closureStatus: 'closed', contracts: 3,
    grossPayable: 300, employeeWithholdings: 50, netPayable: 250,
    employerContributions: 30, employerCostProxy: 330,
    arithmeticDifference: 0, roundingTolerance: 0,
    arithmeticReconciled: true, executivePublishable: true,
  },
  currentOpen: {
    month: '2026-08-01', closureStatus: 'open', contracts: 3,
    arithmeticReconciled: false, executivePublishable: false,
  },
  runs: [{
    month: '2026-07-01', closureStatus: 'closed', contracts: 3,
    netPayable: 250, employerCostProxy: 330,
    arithmeticReconciled: true, executivePublishable: true,
  }],
  quality: { sourceRowsReconciled: true, arithmeticReconciled: true, currentOpenBlocked: true },
  limitations: ['Fixture sintético de navegador; no habilita cálculo ni publicación.'],
});

function safeFile(requestPath) {
  const relative = decodeURIComponent(requestPath).replace(/^\/+/, '');
  const resolved = path.resolve(root, relative || 'nomina-control.html');
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/api/internal-data' && url.searchParams.get('resource') === 'payrollControl') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify(payrollFixture));
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
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

async function inspect(viewport, label) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const issues = [];
  page.on('console', (message) => { if (message.type() === 'error') issues.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => { if (response.status() >= 400) issues.push(`HTTP ${response.status()} ${response.url()}`); });

  try {
    await page.goto(`${baseUrl}/nomina-control.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-payroll-formula-lab]');
    assert.equal(await page.locator('#mainContent').isVisible(), true);
    assert.match(await page.locator('#formulaLabTitle').innerText(), /Revisar una fórmula/);
    assert.match(await page.locator('[data-formula-status]').innerText(), /Sintaxis válida/);

    const input = page.locator('[data-formula-input]');
    await input.fill('R[100] + R[100] > 1');
    await page.getByRole('button', { name: 'Analizar estructura' }).click();
    assert.match(await page.locator('[data-formula-status]').innerText(), /Sintaxis válida/);
    assert.match(await page.locator('[data-formula-dependencies]').innerText(), /R\[100\] · 2 usos/);
    assert.match(await page.locator('[data-formula-constants]').innerText(), /1 · 1 uso · metadatos pendientes/);
    assert.match(await page.locator('[data-formula-diagnostics]').innerText(), /aparece 2 veces/);
    assert.match(await page.locator('[data-formula-diagnostics]').innerText(), /no tiene concepto, unidad ni vigencia/);

    await input.fill('R[1] / 0');
    await page.getByRole('button', { name: 'Analizar estructura' }).click();
    assert.match(await page.locator('[data-formula-status]').innerText(), /Fórmula inválida/);
    assert.match(await page.locator('[data-formula-diagnostics]').innerText(), /divide por cero literal/);

    await input.fill('R[1] < <img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: 'Analizar estructura' }).click();
    assert.equal(await page.locator('img[src="x"]').count(), 0);
    assert.match(await page.locator('[data-formula-diagnostics]').innerText(), /Carácter no permitido|Token inesperado|Identificador no permitido/);

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      formulaVisible: Boolean(document.querySelector('[data-payroll-formula-lab]')?.getBoundingClientRect().width),
      storedFormula: localStorage.length + sessionStorage.length,
    }));
    assert.equal(layout.overflow, false, `${label}: overflow horizontal`);
    assert.equal(layout.formulaVisible, true, `${label}: laboratorio oculto`);
    assert.equal(layout.storedFormula, 0, `${label}: la fórmula no debe persistirse en storage`);

    await page.locator('[data-payroll-formula-lab]').scrollIntoViewIfNeeded();
    const screenshot = path.join(os.tmpdir(), `municontrol-payroll-formula-${label}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    screenshots.push(screenshot);
  } finally {
    await context.close();
  }
  assert.deepEqual(issues, [], `${label}: ${issues.join('\n')}`);
}

try {
  await inspect({ width: 1440, height: 900 }, 'desktop');
  await inspect({ width: 390, height: 844 }, 'mobile');
  console.log(`Payroll formula browser QA: OK; screenshots: ${screenshots.join(', ')}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
