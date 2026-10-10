import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// This verifier owns a loopback server and intercepts every identity request.
// It never opens a deployment, uses real credentials or connects to a database.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
assert.ok(fs.existsSync(path.join(root, 'login.html')), 'Build required before browser verification');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (pathname.startsWith('/api/')) { res.writeHead(500); res.end('Identity must be intercepted'); return; }
  const file = path.resolve(root, pathname === '/acceso' ? 'login.html' : pathname.replace(/^\/+/, ''));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const result = { ok: false, viewports: [], cases: 0, syntheticOnly: true, productionAccess: false, databaseWrites: false, externalRequests: 0, pageErrors: [] };

try {
  browser = await chromium.launch({ headless: true, ...(process.env.IDENTITY_QA_BROWSER_EXECUTABLE ? { executablePath: process.env.IDENTITY_QA_BROWSER_EXECUTABLE } : {}) });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 800 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    let scenario = 'configured503';
    const requests = [];
    page.on('pageerror', error => result.pageErrors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { result.externalRequests++; await route.abort(); return; }
      if (url.pathname !== '/api/internal-identity') { await route.continue(); return; }
      const body = route.request().postDataJSON();
      requests.push(body);
      assert.ok(['login', 'select_context'].includes(body.command), 'No other identity command is allowed');
      if (body.command === 'login') {
        assert.equal(body.payload.email, 'access-feedback@local.invalid');
        assert.equal(body.payload.password, 'synthetic-access-feedback-only');
      }
      if (scenario === 'network') { await route.abort('internetdisconnected'); return; }
      if (scenario === 'context' && body.command === 'login') {
        await route.fulfill({ status: 202, json: { code: 'CONTEXT_REQUIRED', flowToken: 'synthetic-flow-token', expectedVersion: 4, expiresAt: '2099-01-01T00:00:00Z', contexts: [
          { kind: 'platform', label: 'Administración de plataforma' },
          { kind: 'tenant', tenantId: '20000000-0000-4000-8000-000000000002', tenantName: 'Municipalidad sintética' },
        ] } });
        return;
      }
      if (scenario === 'html503') { await route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>Service Unavailable</h1>' }); return; }
      await route.fulfill({ status: scenario === 'auth401' ? 401 : 503, json: { ok: false, code: scenario === 'auth401' ? 'IDENTITY_AUTH_FAILED' : 'IDENTITY_GATEWAY_NOT_CONFIGURED', error: 'synthetic server diagnostic must not be shown' } });
    });
    for (const [name, expected] of [['configured503', /servicio de acceso no está disponible/], ['html503', /servicio de acceso no está disponible/], ['network', /No se pudo conectar/], ['auth401', /Revisá los datos/]]) {
      scenario = name;
      await page.goto(`${origin}/acceso?next=%2Fnomina%23conciliacion`);
      await page.getByLabel('Correo institucional').fill('access-feedback@local.invalid');
      await page.getByLabel('Contraseña', { exact: true }).fill('synthetic-access-feedback-only');
      const before = requests.length;
      await page.getByRole('button', { name: 'Ingresar al portal interno', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: expected }).waitFor();
      assert.match(await page.locator('#accessStatus').innerText(), expected);
      assert.doesNotMatch(await page.locator('#errorMsg').innerText(), /synthetic server diagnostic|<h1>/);
      assert.equal(await page.locator('#emailInput').inputValue(), 'access-feedback@local.invalid');
      assert.equal(await page.locator('#passInput').inputValue(), '');
      assert.equal(await page.locator('#btnLogin').isEnabled(), true);
      assert.equal(requests.length - before, 1, 'no automatic retry');
      assert.equal(await page.locator('#contextStep').isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
      const box = await page.locator('#btnLogin').boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44, 'accessible touch target');
      result.cases++;
    }
    scenario = 'context';
    await page.goto(`${origin}/acceso`);
    await page.getByLabel('Correo institucional').fill('access-feedback@local.invalid');
    await page.getByLabel('Contraseña', { exact: true }).fill('synthetic-access-feedback-only');
    await page.getByRole('button', { name: 'Ingresar al portal interno', exact: true }).click();
    await page.locator('#contextStep').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#contextOptions input').count(), 2);
    assert.equal(await page.locator('#contextOptions input:checked').count(), 0, 'scope must be explicit');
    assert.equal(await page.locator('#continueContextButton').isEnabled(), false);
    await page.locator('#contextOptions input').nth(viewport.width === 390 ? 1 : 0).check();
    const beforeFlow = await page.evaluate(() => ({ token: contextFlow.token, version: contextFlow.version, key: contextFlow.idempotencyKey }));
    await page.locator('#continueContextButton').click();
    await page.getByRole('alert').filter({ hasText: /servicio de acceso no está disponible/ }).waitFor();
    assert.equal(await page.locator('#contextOptions input:checked').count(), 1);
    assert.equal(requests.at(-1).payload.context.kind, viewport.width === 390 ? 'tenant' : 'platform');
    assert.deepEqual(await page.evaluate(() => ({ token: contextFlow.token, version: contextFlow.version, key: contextFlow.idempotencyKey })), beforeFlow);
    assert.equal(await page.locator('#continueContextButton').isEnabled(), true);
    assert.equal(await page.locator('#mfaStep').isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(await context.cookies(), []);
    result.cases++;
    result.viewports.push(viewport.width);
    await context.close();
  }
  assert.equal(result.externalRequests, 0);
  assert.deepEqual(result.pageErrors, []);
  result.ok = true;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
