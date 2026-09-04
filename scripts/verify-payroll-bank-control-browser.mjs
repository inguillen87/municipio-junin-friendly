import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { unzipSync } from 'fflate';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const publicRoot = path.join(root, 'public');
const fixture = process.env.BANK_CONTROL_XLSX_FIXTURE;
const outerZip = process.env.BANK_CONTROL_OUTER_ZIP;
const expectedHeader =
  'periodo;jurisdiccion;reparticion_codigo;banco_codigo;tipo_cuenta;operaciones;importe_neto_centavos';

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
const browser = await chromium.launch({ headless: true, downloadsPath: downloadDirectory });

try {
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto(`http://127.0.0.1:${port}/reportes-rrhh.html`, { waitUntil: 'networkidle' });
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
  assert.ok(Number(summary.operations) > 0);
  assert.ok(financialTotals.every((value) => /^\$\s+[0-9.]+,[0-9]{2}$/.test(value)));
  assert.equal(summary.operations42 + summary.operations55, Number(summary.operations));
  assert.ok(summary.aggregateRows > 0);

  for (const jurisdiction of ['42', '55']) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator(`[data-bank-control-export="${jurisdiction}"]`).click(),
    ]);
    const bytes = fs.readFileSync(await download.path());
    const lines = new TextDecoder().decode(bytes).split('\r\n');
    assert.equal(lines[0], expectedHeader);
    assert.ok(lines.slice(1).filter(Boolean).every((line) => line.startsWith(`2026-08;${jurisdiction};`)));
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    operations: summary.operations,
    worksheets: summary.worksheets,
    aggregateRows: summary.aggregateRows,
    operations42: summary.operations42,
    operations55: summary.operations55,
  })}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(downloadDirectory, { recursive: true, force: true });
  if (workbookBytes) workbookBytes.fill(0);
  if (outerBytes) outerBytes.fill(0);
}
