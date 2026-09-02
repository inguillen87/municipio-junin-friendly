import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const screenshots = [];
const previewRequests = [];
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

function previewFixture(byteLength) {
  return {
    ok: true,
    data: {
      contractVersion: 'grh-source-preview.v1',
      definitionKey: 'grh-calculo-pipe-utf8.v1',
      status: 'has_rejections',
      format: 'pipe',
      encoding: 'utf-8',
      contentFingerprint: `hmac-sha256:${'a'.repeat(64)}`,
      schemaSha256: 'b'.repeat(64),
      byteLength,
      recordCount: 2,
      acceptedCount: 1,
      rejectedRecordCount: 1,
      structuralErrorCount: 0,
      issueCount: 1,
      schemaValid: true,
      rejectionSummary: { LEGAJO_INTEGER_INVALID: 1 },
      rejectionsTruncated: false,
      includesRecordValues: false,
      persistencePerformed: false,
    },
    includesRecordValues: false,
    persistencePerformed: false,
  };
}

function safeFile(requestPath) {
  const relative = decodeURIComponent(requestPath).replace(/^\/+/, '');
  const resolved = path.resolve(root, relative || 'nomina-control.html');
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/api/internal-data' && url.searchParams.get('resource') === 'payrollControl') {
    if (request.headers['x-payroll-fixture'] === 'unavailable') {
      response.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ ok: false, code: 'PAYROLL_UNAVAILABLE', error: 'Fuente no disponible' }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify(payrollFixture));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/internal-grh-source-preview') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        previewRequests.push(body);
        const byteLength = Buffer.from(body.contentBase64, 'base64').byteLength;
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify(previewFixture(byteLength)));
      } catch {
        response.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ ok: false, code: 'FIXTURE_INVALID', error: 'Fixture inválido' }));
      }
    });
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
    await page.goto(`${baseUrl}/nomina-control.html`, { waitUntil: 'domcontentloaded' });
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

    const catalogInput = page.locator('[data-catalog-input]');
    assert.match(await page.locator('[data-catalog-status]').innerText(), /Catálogo estructuralmente válido/);
    assert.equal(await page.locator('[data-catalog-graph] li').count(), 3);
    assert.match(await page.locator('[data-catalog-diagnostics]').innerText(), /constante 1 no tiene concepto/);

    await catalogInput.fill([
      'R[1] = N[2]',
      'N[2] = R[1]',
      'R[1] = U[9]',
      'A[3] = L[404]',
    ].join('\n'));
    await page.getByRole('button', { name: 'Auditar catálogo' }).click();
    assert.match(await page.locator('[data-catalog-status]').innerText(), /Catálogo con pendientes/);
    assert.match(await page.locator('[data-catalog-status]').innerText(), /1 ciclos/);
    assert.match(await page.locator('[data-catalog-status]').innerText(), /2 referencias inexistentes/);
    assert.match(await page.locator('[data-catalog-status]').innerText(), /1 duplicados/);
    const catalogFindings = await page.locator('[data-catalog-diagnostics]').innerText();
    assert.match(catalogFindings, /R\[1\] está duplicada/);
    assert.match(catalogFindings, /L\[404\] no existe/);
    assert.match(catalogFindings, /Dependencia circular/);

    await catalogInput.fill('R[1] = <img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: 'Auditar catálogo' }).click();
    assert.equal(await page.locator('img[src="x"]').count(), 0);
    assert.match(await page.locator('[data-catalog-status]').innerText(), /Catálogo con pendientes/);

    const sourceText = [
      'codi_01|peri_31|mes_31|feca_31|tipo_31|lega_12|codi_27|cant_31|impo_31|codi_02|codi_06|codi_07',
      '101|2026|8|2026-08-31|M|1001|45|1,5|1200,25|2|6|7',
      '102|2026|8|2026-08-31|M|INVALIDO|45|1|800|2|6|7',
    ].join('\n');
    const sourcePreview = page.locator('[data-grh-source-preview]');
    await sourcePreview.locator('[data-source-preview-file]').setInputFiles({
      name: 'empleados-confidencial-agosto.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(sourceText),
    });
    assert.doesNotMatch(
      await sourcePreview.locator('[data-source-preview-file-state]').innerText(),
      /empleados-confidencial/,
    );
    await sourcePreview.getByRole('button', { name: 'Analizar sin importar' }).click();
    await assert.doesNotReject(() => sourcePreview.locator('[data-source-preview-status]').waitFor({ state: 'visible' }));
    await page.waitForFunction(() => document.querySelector('[data-source-preview-status]')?.textContent.includes('Preview con observaciones'));
    assert.equal(await sourcePreview.locator('[data-source-preview-result]').isVisible(), true);
    assert.equal(await sourcePreview.locator('[data-source-preview-records]').innerText(), '2');
    assert.equal(await sourcePreview.locator('[data-source-preview-accepted]').innerText(), '1');
    assert.equal(await sourcePreview.locator('[data-source-preview-rejected]').innerText(), '1');
    assert.match(await sourcePreview.locator('[data-source-preview-findings]').innerText(), /LEGAJO_INTEGER_INVALID · 1 caso/);
    const previewRequest = previewRequests.at(-1);
    assert.deepEqual(Object.keys(previewRequest).sort(), ['contentBase64', 'definitionKey']);
    assert.equal(previewRequest.definitionKey, 'grh-calculo-pipe-utf8.v1');
    assert.equal(Buffer.from(previewRequest.contentBase64, 'base64').toString('utf8'), sourceText);
    assert.doesNotMatch(JSON.stringify(previewRequest), /empleados-confidencial|tenantId|sourceBindingId/);
    assert.equal(await sourcePreview.locator('[data-source-preview-file]').inputValue(), '');

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      formulaVisible: Boolean(document.querySelector('[data-payroll-formula-lab]')?.getBoundingClientRect().width),
      previewVisible: Boolean(document.querySelector('[data-grh-source-preview]')?.getBoundingClientRect().width),
      storedFormula: localStorage.length + sessionStorage.length,
    }));
    assert.equal(layout.overflow, false, `${label}: overflow horizontal`);
    assert.equal(layout.formulaVisible, true, `${label}: laboratorio oculto`);
    assert.equal(layout.previewVisible, true, `${label}: previsualización oculta`);
    assert.equal(layout.storedFormula, 0, `${label}: la fórmula no debe persistirse en storage`);

    await sourcePreview.scrollIntoViewIfNeeded();
    const screenshot = path.join(os.tmpdir(), `municontrol-payroll-source-preview-${label}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    screenshots.push(screenshot);
  } finally {
    await context.close();
  }
  assert.deepEqual(issues, [], `${label}: ${issues.join('\n')}`);
}

async function inspectUnavailablePayroll() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'x-payroll-fixture': 'unavailable' },
  });
  const page = await context.newPage();
  const issues = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource:.*503/.test(message.text())) {
      issues.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  try {
    await page.goto(`${baseUrl}/nomina-control.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mainContent:not([hidden])');
    assert.equal(await page.locator('#errorHost').isVisible(), true);
    assert.match(await page.locator('#errorHost').innerText(), /No se pudieron consultar las corridas/);
    assert.match(await page.locator('#errorHost').innerText(), /laboratorio de fórmulas y la previsualización sin importar/);
    assert.equal(await page.locator('[data-payroll-formula-lab]').isVisible(), true);
    assert.equal(await page.locator('[data-grh-source-preview]').isVisible(), true);
    assert.match(await page.locator('[data-formula-status]').innerText(), /Sintaxis válida/);
    assert.match(await page.locator('[data-source-preview-status]').innerText(), /Esperando un archivo local/);
  } finally {
    await context.close();
  }
  assert.deepEqual(issues, [], `fallback: ${issues.join('\n')}`);
}

try {
  await inspect({ width: 1440, height: 900 }, 'desktop');
  await inspect({ width: 390, height: 844 }, 'mobile');
  await inspectUnavailablePayroll();
  console.log(`Payroll formula browser QA: OK; screenshots: ${screenshots.join(', ')}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
