import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const [galenoPath, sussPath] = process.argv.slice(2).map((value) => path.resolve(value || ''));
if (!galenoPath || !sussPath || !fs.existsSync(galenoPath) || !fs.existsSync(sussPath)) {
  throw new Error('Uso: node scripts/verify-payroll-art-noelia-browser.mjs <galeno.xlsx> <suss.xlsx>');
}

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
]);

const principal = {
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  membershipId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  certifiedBindingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  roleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
  employmentLinked: true,
  capabilities: [
    'payroll.control_import.read',
    'payroll.control_import.prepare',
    'payroll.control_import.audit.read',
  ],
  reportCapabilities: ['payroll.art_report.generate'],
};

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function safeFile(urlPath) {
  let relative = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (!relative || relative === 'nomina-control') relative = 'nomina-control.html';
  const resolved = path.resolve(publicRoot, relative);
  return resolved.startsWith(`${publicRoot}${path.sep}`) ? resolved : null;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/api/internal-auth') {
    json(response, 200, {
      ok: true,
      authenticated: true,
      access: {
        tenantCapabilities: ['payroll.read', 'payroll.art_report.generate'],
        platformCapabilities: [],
      },
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/internal-payroll-control-import'
      && url.searchParams.get('resource') === 'bootstrap') {
    json(response, 200, {
      ok: true,
      data: {
        principal,
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
    return;
  }
  const filePath = safeFile(url.pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': mimeTypes.get(path.extname(filePath)) || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(response);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/nomina-control#artReportSection`, {
    waitUntil: 'domcontentloaded',
  });
  const art = page.locator('[data-payroll-art-report-workbench]');
  await page.waitForFunction(() => document.querySelector('[data-art-status]')?.textContent.includes('Contexto validado'));
  await art.locator('[data-art-period]').fill('2026-08');
  await art.locator('[data-art-snapshot]').fill('noelia-art-2026-08-browser');
  await art.locator('[data-art-cutoff]').fill('2026-09-03T18:45');
  await art.locator('[data-art-galeno-file]').setInputFiles(galenoPath);
  await art.locator('[data-art-suss-file]').setInputFiles(sussPath);
  await art.locator('[data-art-submit]').click();
  await page.waitForFunction(() => document.querySelector('[data-art-result]')?.hidden === false);

  const metrics = {
    state: await art.locator('[data-art-result-state]').innerText(),
    sourceRows: Number(await art.locator('[data-art-source-rows]').innerText()),
    acceptedRows: Number(await art.locator('[data-art-accepted]').innerText()),
    rejectedRows: Number(await art.locator('[data-art-rejected]').innerText()),
    comparisonRows: Number(await art.locator('[data-art-compared]').innerText()),
    comparisonMismatches: Number(await art.locator('[data-art-mismatches]').innerText()),
    primaryDownloads: await art.locator('[data-art-primary-downloads] button').count(),
    auditDownloads: await art.locator('[data-art-downloads] button').count(),
  };
  assert.match(metrics.state, /^REPORTE GENERADO CON \d+ FILAS A CORREGIR$/i);
  assert.ok(metrics.sourceRows > 0);
  assert.ok(metrics.acceptedRows > 0);
  assert.ok(metrics.rejectedRows > 0);
  assert.ok(metrics.comparisonRows > 0);
  assert.ok(metrics.comparisonMismatches >= 0);
  assert.equal(metrics.primaryDownloads, 2);
  assert.equal(metrics.auditDownloads, 4);
  assert.match(await art.locator('[data-art-rejected-list]').textContent(), /GALENO .* SUSS .*:/);

  const [xlsxDownload] = await Promise.all([
    page.waitForEvent('download'),
    art.getByRole('button', { name: 'Descargar reporte ART en Excel', exact: true }).click(),
  ]);
  const xlsxBytes = fs.readFileSync(await xlsxDownload.path());
  assert.deepEqual([...xlsxBytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);

  const [pdfDownload] = await Promise.all([
    page.waitForEvent('download'),
    art.getByRole('button', { name: 'Descargar reporte ART en PDF', exact: true }).click(),
  ]);
  const pdfBytes = fs.readFileSync(await pdfDownload.path());
  assert.equal(pdfBytes.subarray(0, 8).toString('ascii'), '%PDF-1.4');

  process.stdout.write(`${JSON.stringify(metrics)}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
