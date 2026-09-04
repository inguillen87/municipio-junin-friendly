import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const screenshots = [];
const downloads = [];
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

const controlImportBootstrapFixture = Object.freeze({
  ok: true,
  data: {
    principal: {
      tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      membershipId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      certifiedBindingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      roleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
      employmentLinked: true,
      capabilities: [
        'payroll.control_import.read',
        'payroll.control_import.prepare',
        'payroll.control_import.audit.read',
        'payroll.art_report.generate',
      ],
    },
    batches: [],
    recentEvents: [],
    limits: {
      maxSourceBytes: 16384,
      contractVersion: 'payroll-control-import.v1',
      hmacKeyVersion: 'hmac-v1',
      definitionKey: 'payroll-post-close-701-703.v1',
      sourceKinds: ['grh_observed', 'operator_control'],
      concepts: ['701', '703'],
    },
  },
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
  if (request.method === 'GET' && url.pathname === '/api/internal-payroll-control-import'
      && url.searchParams.get('resource') === 'bootstrap') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify(controlImportBootstrapFixture));
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

    const postClose = page.locator('[data-payroll-post-close-reconciler]');
    assert.equal(await postClose.getByLabel('Extracto agregado del reporte GRH').count(), 1);
    assert.equal(await postClose.getByLabel('Extracto agregado de la planilla de control').count(), 1);
    assert.equal(await postClose.locator('[data-post-close-observed-file-state]').innerText(), 'No hay un archivo seleccionado.');
    assert.equal(await postClose.locator('[data-post-close-control-file-state]').innerText(), 'No hay un archivo seleccionado.');
    await postClose.getByRole('button', { name: 'Conciliar archivos' }).click();
    const postCloseErrorSummary = postClose.locator('[data-post-close-error-summary]');
    assert.equal(await postCloseErrorSummary.isVisible(), true);
    assert.equal(await postCloseErrorSummary.evaluate((element) => document.activeElement === element), true);
    assert.equal(await postClose.locator('[data-post-close-observed-file]').getAttribute('aria-invalid'), 'true');
    assert.equal(await postClose.locator('[data-post-close-control-file]').getAttribute('aria-invalid'), 'true');
    assert.match(await postCloseErrorSummary.innerText(), /Elegí el extracto agregado del reporte GRH/);
    const observedExact = [
      'periodo;jurisdiccion;concepto;importe_ars',
      '2026-07;42;701;82882370,98',
      '2026-07;42;703;106546119,35',
    ].join('\n');
    const controlExact = [
      'periodo;jurisdiccion;concepto;importe_ars',
      '2026-07;42;701;82882370,98',
      '2026-07;42;703;106546119,35',
    ].join('\r\n');
    await postClose.locator('[data-post-close-period]').fill('2026-07');
    await postClose.locator('[data-post-close-jurisdiction]').selectOption('42');
    await postClose.locator('[data-post-close-observed-file]').setInputFiles({
      name: 'reporte-grh-nominal-secreto.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(observedExact),
    });
    await postClose.locator('[data-post-close-control-file]').setInputFiles({
      name: 'planilla-control-contable-secreta.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(controlExact),
    });
    assert.match(await postClose.locator('[data-post-close-observed-file-state]').innerText(), /^Archivo seleccionado · \d+ bytes\.$/);
    assert.match(await postClose.locator('[data-post-close-control-file-state]').innerText(), /^Archivo seleccionado · \d+ bytes\.$/);
    assert.doesNotMatch(await postClose.locator('[data-post-close-observed-file-state]').innerText(), /reporte-grh-nominal-secreto/);
    assert.equal(await postCloseErrorSummary.isVisible(), false);
    await postClose.getByRole('button', { name: 'Conciliar archivos' }).click();
    await page.waitForFunction(() => document.querySelector('[data-post-close-status]')?.textContent.includes('Coincidencia exacta'));
    assert.equal(await postClose.locator('[data-post-close-rows] tr').count(), 2);
    assert.match(await postClose.locator('[data-post-close-rows] tr').first().innerText(), /42\s+701\s+\$ 82\.882\.370,98/);
    assert.equal(await postClose.locator('[data-post-close-total-observed]').innerText(), '$ 189.428.490,33');
    assert.equal(await postClose.locator('[data-post-close-total-difference]').innerText(), '$ 0,00');
    const evidenceDetails = postClose.locator('[data-post-close-evidence-details]');
    assert.equal(await evidenceDetails.getAttribute('open'), null);
    assert.match(await postClose.locator('[data-post-close-evidence-summary]').innerText(), /2 fuentes identificadas · \d+ y \d+ bytes · huellas diferentes/);
    assert.equal(await postClose.locator('[data-post-close-observed-hash]').isVisible(), false);
    await evidenceDetails.locator('summary').click();
    assert.match(await postClose.locator('[data-post-close-observed-hash]').innerText(), /^sha256:[a-f0-9]{64}$/);
    assert.equal(await postClose.locator('[data-post-close-observed-hash]').isVisible(), true);
    await evidenceDetails.locator('summary').click();
    assert.doesNotMatch(await postClose.innerText(), /reporte-grh-nominal-secreto|planilla-control-contable-secreta/);
    assert.equal(await postClose.locator('[data-post-close-observed-file]').inputValue(), '');
    assert.equal(await postClose.locator('[data-post-close-control-file]').inputValue(), '');
    assert.equal(await postClose.locator('[data-post-close-observed-file-state]').innerText(), 'No hay un archivo seleccionado.');
    assert.equal(await postClose.locator('[data-post-close-control-file-state]').innerText(), 'No hay un archivo seleccionado.');
    assert.equal(await postClose.locator('[data-post-close-export-actions]').isVisible(), true);
    assert.equal(await postClose.locator('[data-post-close-export-xlsx]').isEnabled(), true);
    assert.equal(await postClose.locator('[data-post-close-export-pdf]').isEnabled(), true);
    assert.match(await postClose.locator('[data-post-close-export-status]').innerText(), /borrador local con coincidencia aritmética/);
    assert.equal(await postClose.locator('[data-post-close-export-status]').getAttribute('data-state'), 'ok');

    const persistedControl = page.locator('[data-payroll-control-import-workflow]');
    await page.waitForFunction(() => document.querySelector('[data-control-import-status]')?.textContent.includes('Se cargaron'));
    assert.equal(await persistedControl.locator('[data-control-import-prepare-panel]').isVisible(), true);
    assert.match(await persistedControl.locator('[data-control-import-maker-checker]').innerText(), /otra identidad autorizada debe aprobarlas/i);
    assert.match(await persistedControl.locator('[data-control-import-empty]').innerText(), /No hay corridas informadas/);

    const art = page.locator('[data-payroll-art-report-workbench]');
    await page.waitForFunction(() => document.querySelector('[data-art-status]')?.textContent.includes('Contexto validado'));
    assert.equal(await art.locator('[data-art-form]').isVisible(), true);
    await art.locator('[data-art-period]').fill('2026-08');
    await art.locator('[data-art-scope]').selectOption('all');
    await art.locator('[data-art-snapshot]').fill('grh-art-2026-08-qa');
    await art.locator('[data-art-cutoff]').fill('2026-09-03T18:00');
    const artSource = [
      'liquidacion;jurisdiccion;legajo;dni;cuil;sexo;dias_trabajados;concepto_993_ars;concepto_995_ars',
      'mensual-2026-08-j42;42;1001;12345678;20123456786;M;31;100000,00;2500,00',
    ].join('\r\n');
    await art.locator('[data-art-file]').setInputFiles({
      name: 'personas-art-privado.csv', mimeType: 'text/csv', buffer: Buffer.from(artSource),
    });
    assert.doesNotMatch(await art.locator('[data-art-file-state]').innerText(), /personas-art-privado/);
    await art.getByRole('button', { name: 'Generar control ART' }).click();
    await page.waitForFunction(() => document.querySelector('[data-art-status]')?.textContent.includes('sin errores de fila'));
    assert.equal(await art.locator('[data-art-accepted]').innerText(), '1');
    assert.equal(await art.locator('[data-art-rejected]').innerText(), '0');
    assert.equal(await art.locator('[data-art-salary]').innerText(), '$ 102.500,00');
    assert.match(await art.locator('[data-art-fingerprint]').innerText(), /^sha256:[a-f0-9]{64}$/);
    assert.equal(await art.locator('[data-art-downloads] button').count(), 6);
    assert.equal(await art.getByRole('button', { name: 'Descargar Excel' }).count(), 1);
    assert.equal(await art.getByRole('button', { name: 'Descargar PDF' }).count(), 1);
    assert.doesNotMatch(await art.innerText(), /personas-art-privado/);

    const [artXlsxDownload] = await Promise.all([
      page.waitForEvent('download'),
      art.getByRole('button', { name: 'Descargar Excel' }).click(),
    ]);
    assert.match(artXlsxDownload.suggestedFilename(), /^municontrol_art-provincia_2026-08_todos_[a-f0-9]{12}\.xlsx$/);
    const artXlsxPath = path.join(os.tmpdir(), `municontrol-payroll-art-${label}.xlsx`);
    await artXlsxDownload.saveAs(artXlsxPath);
    const artXlsxBytes = fs.readFileSync(artXlsxPath);
    assert.deepEqual([...artXlsxBytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    assert.equal(artXlsxBytes.includes(Buffer.from('Documento interno restringido')), true);
    assert.equal(artXlsxBytes.includes(Buffer.from('personas-art-privado')), false);
    downloads.push(artXlsxPath);

    const [artPdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      art.getByRole('button', { name: 'Descargar PDF' }).click(),
    ]);
    assert.match(artPdfDownload.suggestedFilename(), /^municontrol_art-provincia_2026-08_todos_[a-f0-9]{12}\.pdf$/);
    const artPdfPath = path.join(os.tmpdir(), `municontrol-payroll-art-${label}.pdf`);
    await artPdfDownload.saveAs(artPdfPath);
    const artPdfBytes = fs.readFileSync(artPdfPath);
    assert.equal(artPdfBytes.subarray(0, 8).toString('ascii'), '%PDF-1.4');
    assert.equal(artPdfBytes.includes(Buffer.from('personas-art-privado')), false);
    downloads.push(artPdfPath);

    await art.scrollIntoViewIfNeeded();
    const artScreenshot = path.join(os.tmpdir(), `municontrol-payroll-art-${label}.png`);
    await page.screenshot({ path: artScreenshot, fullPage: false });
    screenshots.push(artScreenshot);

    const bankDiagnostic = page.locator('[data-payroll-bank-report-workbench]');
    assert.equal(await bankDiagnostic.isVisible(), true);
    await bankDiagnostic.locator('[data-bank-diagnostic-file]').setInputFiles({
      name: 'cuentas-bancarias-privadas.txt',
      mimeType: 'text/plain',
      buffer: Buffer.concat([Buffer.alloc(30, 0x41), Buffer.from('\r\n')]),
    });
    await bankDiagnostic.locator('[data-bank-diagnostic-payroll-rows]').fill('1');
    await bankDiagnostic.locator('[data-bank-diagnostic-payroll-cents]').fill('10000');
    await bankDiagnostic.locator('[data-bank-diagnostic-bank-cents]').fill('10000');
    await bankDiagnostic.getByRole('button', { name: 'Validar archivo bancario' }).click();
    await page.waitForFunction(() => document.querySelector('[data-bank-diagnostic-status]')?.textContent.includes('Diagnóstico local finalizado'));
    assert.match(await bankDiagnostic.locator('[data-bank-diagnostic-structure]').innerText(), /Coincide con la estructura observada/);
    assert.equal(await bankDiagnostic.locator('[data-bank-diagnostic-records]').innerText(), '1');
    assert.match(await bankDiagnostic.locator('[data-bank-diagnostic-reconciliation]').innerText(), /Conciliado/);
    assert.doesNotMatch(await bankDiagnostic.innerText(), /cuentas-bancarias-privadas/);
    assert.match(await bankDiagnostic.locator('[data-bank-diagnostic-blocked]').innerText(), /acreditación bloqueadas/);

    const healthDiagnostic = page.locator('[data-payroll-health-fixed-width-workbench]');
    assert.equal(await healthDiagnostic.isVisible(), true);
    await healthDiagnostic.locator('[data-health-files]').setInputFiles({
      name: 'osep-personas-privadas.txt',
      mimeType: 'text/plain',
      buffer: Buffer.concat([Buffer.alloc(121, 0x41), Buffer.from('\r\n')]),
    });
    await healthDiagnostic.getByRole('button', { name: 'Validar paquete de salud' }).click();
    await page.waitForFunction(() => document.querySelector('[data-health-status]')?.textContent.includes('Estructura física validada'));
    assert.match(await healthDiagnostic.locator('[data-health-summary]').innerText(), /1 archivos · 1 registros · 0 incidencias/);
    assert.match(await healthDiagnostic.locator('[data-health-results]').innerText(), /SEGURO_MUTUAL/);
    assert.doesNotMatch(await healthDiagnostic.innerText(), /osep-personas-privadas/);
    assert.match(await healthDiagnostic.locator('[data-health-official-gate]').innerText(), /presentación oficial bloqueadas/);

    const [xlsxDownload] = await Promise.all([
      page.waitForEvent('download'),
      postClose.locator('[data-post-close-export-xlsx]').click(),
    ]);
    assert.equal(xlsxDownload.suggestedFilename(), 'municontrol_control-poscierre_2026-07_jurisdiccion-42.xlsx');
    const xlsxPath = path.join(os.tmpdir(), `municontrol-payroll-post-close-${label}.xlsx`);
    await xlsxDownload.saveAs(xlsxPath);
    const xlsxBytes = fs.readFileSync(xlsxPath);
    assert.deepEqual([...xlsxBytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    assert.equal(xlsxBytes.includes(Buffer.from('COINCIDENCIA ARITMÉTICA LOCAL - AL CENTAVO')), true);
    assert.equal(xlsxBytes.includes(Buffer.from('reporte-grh-nominal-secreto')), false);
    downloads.push(xlsxPath);

    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      postClose.locator('[data-post-close-export-pdf]').click(),
    ]);
    assert.equal(pdfDownload.suggestedFilename(), 'municontrol_control-poscierre_2026-07_jurisdiccion-42.pdf');
    const pdfPath = path.join(os.tmpdir(), `municontrol-payroll-post-close-${label}.pdf`);
    await pdfDownload.saveAs(pdfPath);
    const pdfBytes = fs.readFileSync(pdfPath);
    assert.equal(pdfBytes.subarray(0, 8).toString('ascii'), '%PDF-1.4');
    assert.equal(pdfBytes.includes(Buffer.from('Borrador local de control - No oficial')), true);
    assert.equal(pdfBytes.includes(Buffer.from('reporte-grh-nominal-secreto')), false);
    downloads.push(pdfPath);

    const controlDifference = [
      'periodo;jurisdiccion;concepto;importe_ars',
      '2026-07;42;701;82882370,97',
      '2026-07;42;703;106546119,35',
    ].join('\n');
    await postClose.locator('[data-post-close-observed-file]').setInputFiles({
      name: 'origen.csv', mimeType: 'text/csv', buffer: Buffer.from(observedExact),
    });
    await postClose.locator('[data-post-close-control-file]').setInputFiles({
      name: 'control.csv', mimeType: 'text/csv', buffer: Buffer.from(controlDifference),
    });
    await postClose.getByRole('button', { name: 'Conciliar archivos' }).click();
    await page.waitForFunction(() => document.querySelector('[data-post-close-status]')?.textContent.includes('Hay diferencias'));
    assert.equal(await postClose.locator('[data-post-close-observation]').getAttribute('required'), '');
    assert.equal(await postClose.locator('[data-post-close-total-difference]').innerText(), '$ 0,01');
    assert.equal(await postClose.locator('[data-post-close-export-actions]').isVisible(), false);
    const privateObservation = 'Revisar planilla <img src=x onerror=alert(1)> persona privada';
    await postClose.locator('[data-post-close-observation]').fill(privateObservation);
    await postClose.getByRole('button', { name: 'Conciliar archivos' }).click();
    await page.waitForFunction(() => document.querySelector('[data-post-close-status]')?.textContent.includes('Observación recibida'));
    assert.equal(await postClose.locator('img[src="x"]').count(), 0);
    assert.doesNotMatch(await postClose.innerText(), /persona privada|<img/);
    assert.match(await postClose.locator('[data-post-close-observation-note]').innerText(), /su texto no se conserva/);
    assert.equal(await postClose.locator('[data-post-close-observation]').getAttribute('required'), null);
    assert.equal(await postClose.locator('[data-post-close-observed-file]').inputValue(), '');
    assert.equal(await postClose.locator('[data-post-close-control-file]').inputValue(), '');
    assert.equal(await postClose.locator('[data-post-close-export-actions]').isVisible(), true);
    assert.match(await postClose.locator('[data-post-close-export-status]').innerText(), /diferencia abierta/);
    assert.equal(await postClose.locator('[data-post-close-export-status]').getAttribute('data-state'), 'warning');

    const monthlyClose = page.locator('[data-monthly-close-precheck]');
    assert.equal(await monthlyClose.isVisible(), true);
    await monthlyClose.getByRole('button', { name: 'Validar y conciliar' }).click();
    const monthlyError = monthlyClose.locator('[data-monthly-close-errors]');
    assert.equal(await monthlyError.isVisible(), true);
    assert.equal(await monthlyError.evaluate((element) => document.activeElement === element), true);
    const monthlyConcepts = [
      'periodo;jurisdiccion;reparticion_codigo;concepto_codigo;ocurrencias;cantidad_centesimas;haberes_rem_centavos;haberes_no_rem_centavos;asignaciones_familiares_centavos;retenciones_centavos;contribuciones_centavos',
      '2026-08;42;1;993;2;200;1000;0;0;0;0',
      '2026-08;42;2;994;3;300;2000;100;0;50;0',
    ].join('\n');
    const monthlyBank = [
      'periodo;jurisdiccion;reparticion_codigo;banco_codigo;tipo_cuenta;operaciones;importe_neto_centavos',
      '2026-08;42;1;191;cuenta_corriente;2;1000',
      '2026-08;42;2;72;caja_ahorro;3;2050',
    ].join('\r\n');
    await monthlyClose.locator('[data-monthly-close-period]').fill('2026-08');
    await monthlyClose.locator('[data-monthly-close-jurisdiction]').selectOption('42');
    await monthlyClose.locator('[data-monthly-close-concept-file]').setInputFiles({
      name: 'conceptos-agregados-privados.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(monthlyConcepts),
    });
    await monthlyClose.locator('[data-monthly-close-bank-file]').setInputFiles({
      name: 'banco-agregado-privado.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(monthlyBank),
    });
    await monthlyClose.getByRole('button', { name: 'Validar y conciliar' }).click();
    await page.waitForFunction(() => (
      document.querySelector('[data-monthly-close-status]')?.textContent.includes('Coincidencia exacta')
    ));
    assert.equal(await monthlyClose.locator('[data-monthly-close-rows] tr').count(), 2);
    assert.equal(await monthlyClose.locator('[data-monthly-close-total-concept]').innerText(), '$ 30,50');
    assert.equal(await monthlyClose.locator('[data-monthly-close-total-bank]').innerText(), '$ 30,50');
    assert.equal(await monthlyClose.locator('[data-monthly-close-total-difference]').innerText(), '$ 0,00');
    assert.match(await monthlyClose.locator('[data-monthly-close-evidence]').innerText(), /sha256:[a-f0-9]{64}/);
    assert.doesNotMatch(
      await monthlyClose.innerText(),
      /conceptos-agregados-privados|banco-agregado-privado/,
    );
    assert.equal(await monthlyClose.locator('[data-monthly-close-concept-file]').inputValue(), '');
    assert.equal(await monthlyClose.locator('[data-monthly-close-bank-file]').inputValue(), '');

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      overflowElements: [...document.querySelectorAll('body *')].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
      }).slice(0, 12).map((element) => ({
        tag: element.tagName,
        className: String(element.className || '').slice(0, 80),
        text: String(element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
      })),
      formulaVisible: Boolean(document.querySelector('[data-payroll-formula-lab]')?.getBoundingClientRect().width),
      previewVisible: Boolean(document.querySelector('[data-grh-source-preview]')?.getBoundingClientRect().width),
      postCloseVisible: Boolean(document.querySelector('[data-payroll-post-close-reconciler]')?.getBoundingClientRect().width),
      monthlyCloseVisible: Boolean(document.querySelector('[data-monthly-close-precheck]')?.getBoundingClientRect().width),
      persistedControlVisible: Boolean(document.querySelector('[data-payroll-control-import-workflow]')?.getBoundingClientRect().width),
      artVisible: Boolean(document.querySelector('[data-payroll-art-report-workbench]')?.getBoundingClientRect().width),
      bankDiagnosticVisible: Boolean(document.querySelector('[data-payroll-bank-report-workbench]')?.getBoundingClientRect().width),
      healthDiagnosticVisible: Boolean(document.querySelector('[data-payroll-health-fixed-width-workbench]')?.getBoundingClientRect().width),
      postCloseGeometry: (() => {
        const panel = document.querySelector('.post-close-results');
        const state = document.querySelector('[data-post-close-status]');
        const table = document.querySelector('[data-payroll-post-close-reconciler] .table-wrap');
        const tools = document.querySelector('[aria-label="Herramientas internas"]');
        const shape = (element) => element ? ({
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }) : null;
        return { panel: shape(panel), state: shape(state), table: shape(table), tools: shape(tools) };
      })(),
      storedFormula: localStorage.length + sessionStorage.length,
    }));
    assert.equal(layout.overflow, false, `${label}: overflow horizontal ${JSON.stringify(layout.overflowElements)}`);
    assert.equal(layout.formulaVisible, true, `${label}: laboratorio oculto`);
    assert.equal(layout.previewVisible, true, `${label}: previsualización oculta`);
    assert.equal(layout.postCloseVisible, true, `${label}: control poscierre oculto`);
    assert.equal(layout.monthlyCloseVisible, true, `${label}: precontrol mensual oculto`);
    assert.equal(layout.persistedControlVisible, true, `${label}: corridas persistidas ocultas`);
    assert.equal(layout.artVisible, true, `${label}: reporte ART oculto`);
    assert.equal(layout.bankDiagnosticVisible, true, `${label}: diagnóstico bancario oculto`);
    assert.equal(layout.healthDiagnosticVisible, true, `${label}: diagnóstico OSEP/Mutual oculto`);
    assert.ok(layout.postCloseGeometry.panel.right <= viewport.width + 1, `${label}: panel poscierre fuera de viewport ${JSON.stringify(layout.postCloseGeometry)}`);
    assert.ok(layout.postCloseGeometry.state.right <= viewport.width + 1, `${label}: estado poscierre fuera de viewport ${JSON.stringify(layout.postCloseGeometry)}`);
    assert.ok(layout.postCloseGeometry.table.right <= viewport.width + 1, `${label}: tabla poscierre fuera de viewport ${JSON.stringify(layout.postCloseGeometry)}`);
    assert.equal(layout.storedFormula, 0, `${label}: la fórmula no debe persistirse en storage`);

    await postClose.scrollIntoViewIfNeeded();
    const screenshot = path.join(os.tmpdir(), `municontrol-payroll-post-close-${label}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    screenshots.push(screenshot);

    await postClose.locator('[data-post-close-observed-file]').setInputFiles({
      name: 'misma-a.csv', mimeType: 'text/csv', buffer: Buffer.from(observedExact),
    });
    await postClose.locator('[data-post-close-control-file]').setInputFiles({
      name: 'misma-b.csv', mimeType: 'text/csv', buffer: Buffer.from(observedExact),
    });
    await postClose.getByRole('button', { name: 'Conciliar archivos' }).click();
    await page.waitForFunction(() => document.querySelector('[data-post-close-observation-note]')?.textContent.includes('bytes idénticos'));
    assert.equal(await postClose.locator('[data-post-close-export-actions]').isVisible(), false);
    assert.match(
      await postClose.locator('[data-post-close-export-status]').textContent(),
      /bloqueada porque los dos archivos contienen exactamente los mismos bytes/,
    );
    assert.equal(await postClose.locator('[data-post-close-export-status]').getAttribute('data-state'), 'error');

    await postClose.getByRole('button', { name: 'Limpiar' }).click();
    assert.equal(await postClose.locator('[data-post-close-result]').isVisible(), false);
    assert.equal(await postClose.locator('[data-post-close-rows] tr').count(), 0);
    assert.equal(await postClose.locator('[data-post-close-observed-hash]').innerText(), '—');
    assert.equal(await postClose.locator('[data-post-close-total-observed]').innerText(), '—');
    assert.equal(await postClose.locator('[data-post-close-export-actions]').isVisible(), false);
    assert.equal(await postClose.locator('[data-post-close-export-xlsx]').isDisabled(), true);
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
    assert.match(await page.locator('#errorHost').innerText(), /control poscierre y el precontrol mensual técnico/);
    assert.equal(await page.locator('[data-payroll-formula-lab]').isVisible(), true);
    assert.equal(await page.locator('[data-grh-source-preview]').isVisible(), true);
    assert.equal(await page.locator('[data-payroll-post-close-reconciler]').isVisible(), true);
    assert.equal(await page.locator('[data-monthly-close-precheck]').isVisible(), true);
    assert.match(await page.locator('[data-formula-status]').innerText(), /Sintaxis válida/);
    assert.match(await page.locator('[data-source-preview-status]').innerText(), /Esperando un archivo local/);
    assert.match(await page.locator('[data-post-close-status]').innerText(), /Esperando período, jurisdicción y dos archivos agregados/);

    const postClose = page.locator('[data-payroll-post-close-reconciler]');
    const observed = [
      'periodo;jurisdiccion;concepto;importe_ars',
      '2026-07;55;701;100,00',
      '2026-07;55;703;200,00',
    ].join('\n');
    const control = observed.replaceAll('\n', '\r\n');
    await postClose.locator('[data-post-close-period]').fill('2026-07');
    await postClose.locator('[data-post-close-jurisdiction]').selectOption('55');
    await postClose.locator('[data-post-close-observed-file]').setInputFiles({
      name: 'grh.csv', mimeType: 'text/csv', buffer: Buffer.from(observed),
    });
    await postClose.locator('[data-post-close-control-file]').setInputFiles({
      name: 'control.csv', mimeType: 'text/csv', buffer: Buffer.from(control),
    });
    await postClose.getByRole('button', { name: 'Conciliar archivos' }).click();
    await page.waitForFunction(() => document.querySelector('[data-post-close-status]')?.textContent.includes('Coincidencia exacta'));
    assert.equal(await postClose.locator('[data-post-close-export-xlsx]').isEnabled(), true);
    const [download] = await Promise.all([
      page.waitForEvent('download'), postClose.locator('[data-post-close-export-xlsx]').click(),
    ]);
    assert.equal(download.suggestedFilename(), 'municontrol_control-poscierre_2026-07_jurisdiccion-55.xlsx');
  } finally {
    await context.close();
  }
  assert.deepEqual(issues, [], `fallback: ${issues.join('\n')}`);
}

try {
  await inspect({ width: 1440, height: 900 }, 'desktop');
  await inspect({ width: 390, height: 844 }, 'mobile');
  await inspectUnavailablePayroll();
  console.log(`Payroll formula browser QA: OK; screenshots: ${screenshots.join(', ')}; downloads: ${downloads.join(', ')}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
