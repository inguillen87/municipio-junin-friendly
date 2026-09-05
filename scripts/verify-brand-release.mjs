// Built-file visual checks plus a receipt workflow with invented local fixtures.
// Every request is intercepted. No production API, database or session is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const origin = 'http://127.0.0.1:41897';
const socialImage = 'https://municipio-junin-friendly.vercel.app/assets/brand/municontrol-social-card-v1.png';
const fixtureEmployee = Object.freeze({
  contractId: '77777777-7777-4777-8777-777777777777',
  nombre: 'PERSONA QA INVENTADA', legajo: '990001',
  organizacion: 'Municipio QA', sector: 'Liquidaciones de prueba', convenio: 'Municipales QA',
});
const fixtureSession = Object.freeze({
  ok: true, authenticated: true,
  user: { name: 'Cuenta QA de marca', role: 'ADMINISTRATIVO_QA' },
  access: {
    tenant: { id: '88888888-8888-4888-8888-888888888888', slug: 'municipio-qa' },
    tenantCapabilities: ['workforce.employee.read', 'payroll.read'],
    platformCapabilities: [], platformRoles: [],
  },
});
const fixturePayroll = Object.freeze({
  payrollDate: '2026-08-31', payrollType: 'M', canonicalPayrollType: 'monthly',
  closureStatus: 'closed', presentationStatus: 'closed_reconciled',
  itemCount: 5, distinctConcepts: 5,
  subjectEarnings: '100000.00', nonSubjectEarnings: '20000.00', familyAllowance: '3000.00',
  employeeWithholdings: '23000.00', netPayable: '100000.00', employerContributions: '20000.00',
  reconciliation: { status: 'matched', difference: '0.00' },
  sourceCutoff: '2026-09-01T12:00:00.000Z',
});
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};
await fs.mkdir(path.join(root, 'tmp/brand-qa'), { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(publicRoot, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.display, 'standalone');
for (const icon of manifest.icons) {
  assert.match(icon.src, /^\/assets\/pwa\/identity-[a-f0-9]{12}\//);
  await fs.access(path.join(publicRoot, icon.src));
}
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  for (const width of [1280, 390]) {
    for (const file of ['recibos-sueldo.html','login.html','friendly-dashboard.html']) {
      const receiptWorkflow = file === 'recibos-sueldo.html';
      const page = await browser.newPage({
        viewport: { width, height: 900 }, javaScriptEnabled: receiptWorkflow,
        acceptDownloads: true, reducedMotion: 'reduce', serviceWorkers: 'block',
      });
      page.setDefaultTimeout(15000);
      const missing = [];
      const blockedExternal = [];
      const unexpectedApi = [];
      const apiCalls = [];
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) {
          blockedExternal.push(url.origin);
          return route.abort();
        }
        if (url.pathname.startsWith('/api/')) {
          const method = request.method();
          apiCalls.push({ path: url.pathname, method, resource: url.searchParams.get('resource') });
          const json = (body, status = 200) => route.fulfill({
            status, contentType: 'application/json; charset=utf-8',
            headers: { 'Cache-Control': 'private, no-store' }, body: JSON.stringify(body),
          });
          if (receiptWorkflow && url.pathname === '/api/internal-auth' && method === 'GET') return json(fixtureSession);
          if (receiptWorkflow && url.pathname === '/api/internal-data') {
            if (method === 'POST') {
              let body;
              try { body = request.postDataJSON(); } catch { body = null; }
              if (body?.resource === 'employees' && body.search === 'PERSONA QA' && body.page === 1 && body.limit === 12) {
                return json({ ok: true, data: [fixtureEmployee], meta: { fixture: true } });
              }
            }
            if (method === 'GET' && url.searchParams.get('resource') === 'employeepayroll'
                && url.searchParams.get('contractId') === fixtureEmployee.contractId
                && url.searchParams.get('page') === '1' && url.searchParams.get('limit') === '24') {
              return json({ ok: true, data: { items: [fixturePayroll] }, meta: { fixture: true, pagination: { page: 1, pages: 1, total: 1 } } });
            }
          }
          unexpectedApi.push({ path: url.pathname, method });
          return json({ ok: false, error: 'API no prevista por la prueba local de marca.' }, 500);
        }
        const target = path.resolve(publicRoot, `.${url.pathname}`);
        if (!target.startsWith(`${publicRoot}${path.sep}`)) return route.abort();
        try {
          const bytes = await fs.readFile(target);
          const ext = path.extname(target);
          return route.fulfill({ contentType: contentTypes[ext] || 'application/octet-stream', body: bytes });
        } catch { missing.push(url.pathname); return route.fulfill({status:404,body:'Not found'}); }
      });
      await page.goto(`${origin}/${file}`, {waitUntil:'load'});
      let downloadedPdf = null;
      if (receiptWorkflow) {
        // The real module validates this fixture session and opens its own shell.
        // Do not change hidden attributes or bypass the capability gate.
        await page.locator('#appShell').waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.documentElement.dataset.mcCapabilityReady === 'true');
        assert.equal(await page.locator('#authGate').isVisible(), false);
        await page.getByLabel('Persona o legajo').fill('PERSONA QA');
        await page.getByRole('button', { name: 'Buscar persona', exact: true }).click();
        await page.getByRole('button', { name: /PERSONA QA INVENTADA.*Ver liquidaciones/ }).click();
        await page.getByRole('button', { name: 'Revisar y descargar', exact: true }).click();
        await page.locator('#previewSection').waitFor({ state: 'visible' });
        assert.match(await page.locator('#previewEmployee').innerText(), /PERSONA QA INVENTADA/);
        assert.match(await page.locator('#previewAmounts').innerText(), /100\.000,00/);
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Descargar PDF de control', exact: true }).click();
        const download = await downloadPromise;
        const pdfPath = path.join(root, `tmp/brand-qa/recibo-fixture-${width}.pdf`);
        await download.saveAs(pdfPath);
        assert.equal(await download.failure(), null);
        const pdf = await fs.readFile(pdfPath);
        const pdfText = pdf.toString('latin1');
        assert.ok(pdfText.startsWith('%PDF-1.4'));
        assert.equal((pdfText.match(/MuniControl identity portal v1/g) || []).length, 1, 'marca vectorial en el PDF descargado');
        assert.match(pdfText, /PERSONA QA INVENTADA/);
        assert.match(pdfText, /No es el recibo oficial/);
        assert.doesNotMatch(pdfText, /\/Type\s*\/Sig\b/);
        assert.match(download.suggestedFilename(), /2026-08-31_.*grh-m_.*990001\.pdf$/);
        downloadedPdf = { bytes: pdf.length, brandEmbedded: true, officialReceipt: false, filename: download.suggestedFilename() };
        assert.ok(apiCalls.some(call => call.path === '/api/internal-auth' && call.method === 'GET'));
        assert.ok(apiCalls.some(call => call.path === '/api/internal-data' && call.method === 'POST'));
        assert.ok(apiCalls.some(call => call.resource === 'employeepayroll'));
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      }
      const state = await page.evaluate(() => {
        const brand = document.querySelector('.brand .brand-name, .brand strong');
        const rect = brand?.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          brandWidth: rect?.width, brandImage: brand && getComputedStyle(brand).backgroundImage,
          ogImage: document.querySelector('meta[property="og:image"]')?.content,
          twitterImage: document.querySelector('meta[name="twitter:image"]')?.content,
          twitterCard: document.querySelector('meta[name="twitter:card"]')?.content,
          ogTitle: document.querySelector('meta[property="og:title"]')?.content,
          imageCount: document.querySelectorAll('meta[property="og:image"]').length,
          favicons: Array.from(document.querySelectorAll('link[rel="icon"]'), link => link.href),
        };
      });
      assert.equal(state.overflow, false, `${file}/${width}: horizontal overflow`);
      assert.ok(state.brandWidth>=130, `${file}/${width}: brand readable`);
      assert.match(state.brandImage, file === 'login.html' ? /logo-horizontal\.svg/ : /logo-horizontal-inverse\.svg/, `${file}: logo legible según el fondo del encabezado`);
      assert.equal(missing.length,0,JSON.stringify(missing));
      assert.deepEqual(unexpectedApi, []);
      assert.deepEqual(blockedExternal, []);
      assert.deepEqual(pageErrors, []);
      assert.equal(state.ogImage,socialImage);
      assert.equal(state.twitterImage,socialImage);
      assert.equal(state.twitterCard,'summary_large_image');
      assert.equal(state.ogTitle,'MuniControl | Gestión municipal, más simple');
      assert.equal(state.imageCount,1);
      assert.ok(state.favicons.length, `${file}: favicon presente`);
      for (const href of state.favicons) {
        const favicon = new URL(href);
        assert.equal(favicon.origin, origin, `${file}: sin favicon antiguo inline o externo`);
        assert.match(favicon.pathname,/^\/assets\/pwa\/identity-[a-f0-9]{12}\/icon\.svg$/);
        assert.ok(manifest.icons.some(icon => icon.src === favicon.pathname));
        await fs.access(path.join(publicRoot, favicon.pathname));
      }
      await page.screenshot({path:path.join(root,`tmp/brand-qa/${file.replace('.html','')}-${width}.png`),fullPage:receiptWorkflow});
      results.push({page:file,width,overflow:false,brandVisible:true,fixtureWorkflow:receiptWorkflow,interceptedApiCalls:apiCalls.length,downloadedPdf});
      await page.close();
    }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({builtFilesOnly:true,receiptData:'invented local fixtures',liveApiCalls:0,visualCaptures:results.length,results},null,2));
