import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { unzipSync } from 'fflate';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const publicRoot = path.join(root, 'public');
const fixture = process.env.BANK_CONTROL_XLSX_FIXTURE;
const outerZip = process.env.BANK_CONTROL_OUTER_ZIP;
const python = process.env.BANK_CONTROL_PYTHON || 'python';
const qaCaptureDirectory = process.env.BANK_CONTROL_QA_CAPTURE_DIR;
const qaNominalCopy = process.env.BANK_CONTROL_QA_NOMINAL_PATH;
if (qaCaptureDirectory && !path.isAbsolute(qaCaptureDirectory)) throw new Error('La carpeta QA debe ser absoluta');
if (qaNominalCopy && (!path.isAbsolute(qaNominalCopy) || path.resolve(qaNominalCopy).startsWith(`${root}${path.sep}`))) {
  throw new Error('La copia nominal QA debe quedar fuera del repositorio');
}

if ((fixture ? 1 : 0) + (outerZip ? 1 : 0) !== 1) {
  throw new Error('Definí una única fuente local de validación');
}

let upload = fixture;
let outerBytes = null;
let workbookBytes = null;
if (fixture) {
  if (!fs.statSync(fixture).isFile()) throw new Error('La copia temporal XLSX no está disponible');
} else {
  if (!fs.statSync(outerZip).isFile()) throw new Error('El ZIP local no está disponible');
  outerBytes = fs.readFileSync(outerZip);
  const entries = unzipSync(outerBytes, {
    filter: (entry) => entry.name.replaceAll('\\', '/')
      === 'AGOSTO/LIQUIDACION MENSUAL/ACREDITACION/PLANILLA CONTROL GENERAL 08.2026.xlsx',
  });
  const matches = Object.values(entries);
  if (matches.length !== 1 || matches[0].byteLength <= 0 || matches[0].byteLength > 2 * 1024 * 1024) {
    throw new Error('El ZIP no contiene una única planilla mensual de tamaño admitido');
  }
  workbookBytes = matches[0];
  upload = {
    name: 'PLANILLA CONTROL GENERAL 08.2026.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(workbookBytes.buffer, workbookBytes.byteOffset, workbookBytes.byteLength),
  };
}

const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
]);

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const relative = pathname === '/' ? 'reportes-rrhh.html' : decodeURIComponent(pathname.slice(1));
  const absolute = path.resolve(publicRoot, relative);
  if (!absolute.startsWith(`${publicRoot}${path.sep}`) || !fs.existsSync(absolute)) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('Content-Type', types.get(path.extname(absolute)) ?? 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(absolute).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const downloadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'municontrol-bank-control-'));
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome', downloadsPath: downloadDirectory });

try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' });
  let externalRequests = 0;
  let writeRequests = 0;
  await context.route('**/*', async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== `http://127.0.0.1:${port}`) {
      externalRequests += 1;
      return route.abort();
    }
    if (request.method() !== 'GET') {
      writeRequests += 1;
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/reportes-rrhh.html#bancarizacion`, { waitUntil: 'networkidle' });
  await page.locator('body[data-report-navigation="ready"]').waitFor();
  await page.locator('[data-bank-control-period]').fill('2026-08');
  for (const bank of ['credicoop', 'santander', 'nacion']) {
    await page.locator(`[data-bank-control-account="${bank}"]`).selectOption('cuenta_corriente');
  }
  await page.locator('[data-bank-control-file]').setInputFiles(upload);
  if (workbookBytes) workbookBytes.fill(0);
  if (outerBytes) outerBytes.fill(0);
  await page.locator('[data-bank-control-submit]').click();
  await page.locator('[data-bank-control-status][data-state="ok"]').waitFor({ timeout: 30_000 });

  const summary = {
    operations: await page.locator('[data-bank-control-operations]').innerText(),
    worksheets: await page.locator('[data-bank-control-worksheets]').innerText(),
    aggregateRows: await page.locator('[data-bank-control-rows] tr').count(),
  };
  const financialTotals = await Promise.all([
    'all', '42', '55',
  ].map((key) => page.locator(`[data-bank-control-total="${key}"]`).innerText()));
  const jurisdictionOperations = await page.locator('[data-bank-control-rows] tr').evaluateAll((rows) => {
    const totals = { 42: 0, 55: 0 };
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      const jurisdiction = cells[0]?.textContent?.trim().replace(/^J/, '');
      if (Object.hasOwn(totals, jurisdiction)) totals[jurisdiction] += Number(cells[4]?.textContent ?? 0);
    }
    return totals;
  });
  summary.operations42 = jurisdictionOperations['42'];
  summary.operations55 = jurisdictionOperations['55'];
  assert.equal(summary.worksheets, '8');
  assert.equal(Number(summary.operations), 842);
  assert.ok(financialTotals.every((value) => /^\$\s+[0-9.]+,[0-9]{2}$/.test(value)));
  assert.equal(summary.operations42 + summary.operations55, Number(summary.operations));
  assert.ok(summary.aggregateRows > 0);

  const nominalButton = page.locator('[data-bank-control-export-nominal]');
  assert.equal(await nominalButton.isEnabled(), true);
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await page.locator('[data-bank-control-total]').evaluateAll(nodes => nodes.every(node =>
      getComputedStyle(node).whiteSpace === 'nowrap' && node.scrollWidth <= node.clientWidth + 1)));
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  let capturesSaved = 0;
  if (qaCaptureDirectory) {
    fs.mkdirSync(qaCaptureDirectory, { recursive: true });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('.bank-nominal-exports').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('[data-bank-control-detail]').evaluate(node => node.open), false);
      const nominalBox = await page.locator('.bank-nominal-exports').boundingBox();
      const totalsBox = await page.locator('.bank-control-totals').boundingBox();
      const clip = await page.evaluate(({ nominalBox, totalsBox }) => ({
        x: Math.max(0, Math.min(nominalBox.x, totalsBox.x) + scrollX),
        y: Math.max(0, nominalBox.y + scrollY),
        width: Math.min(innerWidth - Math.min(nominalBox.x, totalsBox.x), Math.max(nominalBox.width, totalsBox.width)),
        height: totalsBox.y + totalsBox.height - nominalBox.y,
      }), { nominalBox, totalsBox });
      await page.screenshot({ path: path.join(qaCaptureDirectory, `bank-nominal-${width}.png`), clip, fullPage: true });
      capturesSaved += 1;
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
  }

  const [nominalDownload] = await Promise.all([page.waitForEvent('download'), nominalButton.click()]);
  assert.equal(nominalDownload.suggestedFilename(), 'municontrol_planilla-bancaria_2026-08.xlsx');
  const nominalPath = await nominalDownload.path();
  const sourceArgs = fixture ? ['--source-xlsx', fixture] : ['--outer-zip', outerZip];
  let independent;
  try {
    independent = JSON.parse(execFileSync(python, [path.join(root, 'scripts/verify-payroll-bank-nominal-source.py'),
      ...sourceArgs, '--download', nominalPath], { encoding: 'utf8', timeout: 30_000, windowsHide: true, maxBuffer: 1024 * 1024 }));
  } catch {
    throw new Error('La comparación independiente de la planilla nominal no pasó. No se imprimen registros ni importes.');
  }
  assert.equal(independent.ok, true);
  assert.equal(independent.operations, 842);
  assert.equal(independent.worksheets, 8);
  assert.equal(independent.totals_verified, 8);
  if (qaNominalCopy) fs.copyFileSync(nominalPath, qaNominalCopy, fs.constants.COPYFILE_EXCL);
  const nominalBytes = fs.readFileSync(nominalPath);
  const nominalHash = createHash('sha256').update(nominalBytes).digest('hex');
  nominalBytes.fill(0);
  await nominalDownload.delete();

  await page.locator('#mc-report-workspace-root a[href="#escolaridades"]').click();
  await page.locator('[data-report-panel="schooling"]').waitFor({ state: 'visible' });
  await page.locator('#mc-report-workspace-root a[href="#bancarizacion"]').click();
  await page.locator('[data-report-panel="bank"]').waitFor({ state: 'visible' });
  assert.equal(await nominalButton.isEnabled(), true);
  assert.equal(await page.locator('[data-bank-control-operations]').innerText(), '842');
  const [returnedDownload] = await Promise.all([page.waitForEvent('download'), nominalButton.click()]);
  const returnedBytes = fs.readFileSync(await returnedDownload.path());
  assert.equal(createHash('sha256').update(returnedBytes).digest('hex') === nominalHash, true);
  returnedBytes.fill(0);
  await returnedDownload.delete();

  const exportCases = [
    { jurisdiction: '42', bank: 'all', label: 'Todos los bancos y transferencias', filePart: '_j42_todos.xlsx' },
    { jurisdiction: '55', bank: 'all', label: 'Todos los bancos y transferencias', filePart: '_j55_todos.xlsx' },
    { jurisdiction: '42', bank: 'credicoop', label: 'Credicoop', filePart: '_j42_credicoop.xlsx' },
    { jurisdiction: '42', bank: 'santander', label: 'Santander', filePart: '_j42_santander.xlsx' },
    { jurisdiction: '42', bank: 'nacion', label: 'Nación', filePart: '_j42_nacion.xlsx' },
    { jurisdiction: '42', bank: 'transferencias', label: 'Transferencias especiales', filePart: '_j42_transferencias.xlsx' },
    { jurisdiction: '55', bank: 'credicoop', label: 'Credicoop', filePart: '_j55_credicoop.xlsx' },
    { jurisdiction: '55', bank: 'santander', label: 'Santander', filePart: '_j55_santander.xlsx' },
    { jurisdiction: '55', bank: 'nacion', label: 'Nación', filePart: '_j55_nacion.xlsx' },
    { jurisdiction: '55', bank: 'transferencias', label: 'Transferencias especiales', filePart: '_j55_transferencias.xlsx' },
  ];
  for (const exportCase of exportCases) {
    await page.locator('[data-bank-control-export-jurisdiction]')
      .selectOption(exportCase.jurisdiction);
    await page.locator('[data-bank-control-export-bank]').selectOption(exportCase.bank);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-bank-control-export-xlsx]').click(),
    ]);
    assert.ok(download.suggestedFilename().endsWith(exportCase.filePart));
    const bytes = fs.readFileSync(await download.path());
    assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    const entries = unzipSync(bytes);
    const workbookXml = new TextDecoder().decode(entries['xl/workbook.xml']);
    const detailXml = new TextDecoder().decode(entries['xl/worksheets/sheet2.xml']);
    assert.ok(/sheet name="Resumen".*sheet name="Por repartición"/s.test(workbookXml));
    assert.ok(new RegExp(`Detalle de control J${exportCase.jurisdiction}`).test(detailXml));
    assert.ok(detailXml.includes(exportCase.label));
    assert.ok(/Acreditación.*No generada/s.test(detailXml));
    assert.ok(!/APELLIDO Y NOMBRE|CTA BANCARIA|C\.B\.U/i.test(detailXml));
    bytes.fill(0);
    await download.delete();
  }

  let unexpectedDownloads = 0;
  page.on('download', () => { unexpectedDownloads += 1; });
  await page.locator('[data-bank-control-reset]').click();
  assert.equal(await nominalButton.isDisabled(), true);
  assert.equal(await page.locator('[data-bank-control-export-xlsx]').isDisabled(), true);
  await nominalButton.dispatchEvent('click');
  await page.locator('[data-bank-control-period]').fill('2026-08');
  for (const bank of ['credicoop', 'santander', 'nacion']) {
    await page.locator(`[data-bank-control-account="${bank}"]`).selectOption('cuenta_corriente');
  }
  await page.locator('[data-bank-control-file]').setInputFiles({ name: 'invalid-local.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('not an XLSX workbook') });
  await page.locator('[data-bank-control-submit]').click();
  await page.locator('[data-bank-control-status][data-state="error"]').waitFor({ timeout: 30_000 });
  assert.equal(await nominalButton.isDisabled(), true);
  await nominalButton.dispatchEvent('click');
  await page.waitForTimeout(250);
  assert.equal(unexpectedDownloads, 0);
  assert.equal(externalRequests, 0);
  assert.equal(writeRequests, 0);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    operations: Number(summary.operations),
    worksheets: Number(summary.worksheets),
    aggregateRows: summary.aggregateRows,
    operations42: summary.operations42,
    operations55: summary.operations55,
    xlsxExportsVerified: exportCases.length,
    nominalWorksheets: independent.worksheets,
    nominalOperations: independent.operations,
    nominalSubtotalsVerified: independent.subtotals_verified,
    nominalTotalsVerified: independent.totals_verified,
    nominalFieldsReconciled: independent.nominal_multisets_match,
    nominalIdentifiersPreserved: independent.identifiers_preserved,
    nominalFormulaCachesReconciled: independent.formula_caches_match,
    navigationPreservesDownload: true,
    resetBlocksDownload: true,
    invalidSourceBlocksDownload: true,
    externalRequests,
    writeRequests,
    capturesSaved,
    qaNominalCopyPreserved: Boolean(qaNominalCopy),
  })}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  assert.ok(path.resolve(downloadDirectory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}municontrol-bank-control-`));
  fs.rmSync(downloadDirectory, { recursive: true, force: true });
  if (workbookBytes) workbookBytes.fill(0);
  if (outerBytes) outerBytes.fill(0);
}
