import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startAttendanceDeviceBrowserServer, buildAttendanceDeviceAuthFixture, buildAttendanceDeviceBootstrapFixture, buildAttendanceReportedInventoryFixture } from './verify-attendance-device-browser.mjs';

const server = await startAttendanceDeviceBrowserServer();
const browser = await chromium.launch({ headless: true, ...(process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.CLOCK_BROWSER_CHANNEL } : {}) });
const hash = 'a'.repeat(64); // Local fixture only; never a collector credential.
const source = fs.readFileSync(new URL('../relojes-marcaciones.html', import.meta.url), 'utf8')
  .replace(/<script\b[^>]*\bsrc="(?!assets\/attendance-connector-admin\.js)[^"]*"[^>]*><\/script>/g, '');

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const fixture = { id: '70000000-0000-4000-8000-000000000010', externalKey: 'pm10-test-connector', driverKey: 'zkteco', tokenVersion: 1, status: 'suspended', version: 1 };
    const auth = buildAttendanceDeviceAuthFixture();
    let manage = false, nextFailure = 0;
    const posts = [];
    await page.route('**/relojes-marcaciones.html', route => route.fulfill({ contentType: 'text/html', body: source }));
    await page.route('https://**', route => route.fulfill({ status: 200, body: '' }));
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const fulfill = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/internal-auth') return fulfill(auth);
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        posts.push({ body, key: request.headers()['idempotency-key'] });
        if (nextFailure) { const status = nextFailure; nextFailure = 0; return fulfill({ ok: false }, status); }
        assert.equal(body.payload.expectedVersion, fixture.version);
        assert.equal(body.payload.id, fixture.id);
        assert.match(posts.at(-1).key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        if (body.command === 'connector.rotate_token') {
          assert.deepEqual(Object.keys(body.payload).sort(), ['expectedVersion', 'id', 'tokenSha256']);
          assert.equal(body.payload.tokenSha256, hash);
          fixture.tokenVersion += 1;
        } else {
          assert.equal(body.command, 'connector.update');
          assert.deepEqual(Object.keys(body.payload).sort(), ['expectedVersion', 'id', 'status']);
          fixture.status = body.payload.status;
        }
        fixture.version += 1;
        return fulfill({ ok: true });
      }
      const resource = url.searchParams.get('resource');
      if (resource === 'bootstrap') {
        const value = buildAttendanceDeviceBootstrapFixture();
        if (manage) value.capabilities.push('attendance.connector.manage');
        value.summary.connectorCount = 1;
        value.summary.activeConnectorCount = fixture.status === 'active' ? 1 : 0;
        return fulfill(value);
      }
      if (resource === 'reported-inventory') return fulfill(buildAttendanceReportedInventoryFixture());
      const data = resource === 'connector' ? [fixture] : [];
      return fulfill({ ok: true, resource, data, pagination: { total: data.length, pages: data.length ? 1 : 0, page: 1 } });
    });
    await page.goto(server.baseUrl + '/relojes-marcaciones.html');
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.getByText('Administración técnica · equipos, conectores, lotes y auditoría', { exact: true }).click();
    await page.locator('#tab-connector').click();
    await page.getByText('pm10-test-connector', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cambiar credencial · pm10-test-connector', exact: true }).count(), 0);
    manage = true;
    await page.locator('#refreshButton').click();
    const rotate = page.getByRole('button', { name: 'Cambiar credencial · pm10-test-connector', exact: true });
    await rotate.click();
    await page.locator('#connectorTokenSha256').fill('invalid');
    await page.locator('#connectorDialogSubmit').click();
    assert.equal(posts.length, 0);
    await page.locator('#connectorTokenSha256').fill(hash);
    nextFailure = 503;
    await page.locator('#connectorDialogSubmit').click();
    await page.locator('#connectorFormError').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#connectorTokenSha256').inputValue(), hash);
    await page.locator('#connectorDialogSubmit').click();
    await page.locator('#connectorDialog').waitFor({ state: 'hidden' });
    assert.equal(posts[0].key, posts[1].key);
    assert.equal(fixture.status, 'suspended');
    assert.equal(await page.locator('#connectorTokenSha256').inputValue(), '');
    await page.getByRole('button', { name: 'Activar · pm10-test-connector', exact: true }).click();
    await page.locator('#connectorDialogSubmit').click();
    await page.locator('#connectorDialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Suspender · pm10-test-connector', exact: true }).click();
    await page.locator('#connectorDialogSubmit').click();
    await page.locator('#connectorDialog').waitFor({ state: 'hidden' });
    assert.equal(fixture.status, 'suspended');
    for (const rejectedStatus of [409, 403]) {
      await rotate.click();
      await page.locator('#connectorTokenSha256').fill(hash);
      const unchangedVersion = fixture.version;
      nextFailure = rejectedStatus;
      await page.locator('#connectorDialogSubmit').click();
      await page.locator('#connectorDialog').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#connectorTokenSha256').inputValue(), '');
      assert.equal(fixture.version, unchangedVersion);
      await page.waitForFunction(() => !document.getElementById('refreshButton').disabled);
    }
    await rotate.click();
    await page.locator('#connectorTokenSha256').fill(hash);
    const beforeSessionChange = posts.length;
    auth.user.id = 'new-session';
    await page.locator('#connectorDialogSubmit').click();
    await page.locator('#connectorDialog').waitFor({ state: 'hidden' });
    assert.equal(posts.length, beforeSessionChange);
    assert.equal(await page.locator('#connectorTokenSha256').inputValue(), '');
    await rotate.click();
    await page.locator('#connectorTokenSha256').fill(hash);
    manage = false;
    await page.locator('#connectorDialogSubmit').click();
    await page.locator('#connectorDialog').waitFor({ state: 'hidden' });
    assert.equal(posts.length, beforeSessionChange);
    assert.equal(await page.locator('#connectorTokenSha256').inputValue(), '');
    await page.locator('#refreshButton').click();
    await page.waitForFunction(() => !document.getElementById('refreshButton').disabled);
    assert.equal(await rotate.count(), 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Connector UI ${width}px: read-only gate, hash validation, retry idempotency, rotation, activation, suspension, 409/403, session change, revocation and layout passed.`);
  }
} finally {
  await browser.close();
  await server.close();
}
