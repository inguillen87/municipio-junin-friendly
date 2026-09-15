// Local branding checks. Every API uses fixtures; no municipal session or records.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { buildAttendanceDeviceAuthFixture, buildAttendanceDeviceBootstrapFixture, buildAttendanceReportedInventoryFixture } from './verify-attendance-device-browser.mjs';

const base = path.resolve('public'), output = path.resolve('verification'), origin = 'https://municontrol.test';
const approved = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/approved-brand-20260905.json', import.meta.url), 'utf8'));
assert.equal(approved.sourceCommit, '96bd6cea63dd483ef041f509c225b949802a0cc0');
for (const [file, sha256] of Object.entries(approved.files)) {
  const actual = createHash('sha256').update(fs.readFileSync(path.join(base, file))).digest('hex');
  assert.equal(actual, sha256, `Exact approved asset: ${file}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.webmanifest')));
assert.equal(manifest.name, 'MuniControl · Junín');
for (const icon of manifest.icons) {
  assert.match(icon.src, /^\/assets\/pwa\/identity-[a-f0-9]{12}\//);
  const bytes = fs.readFileSync(path.join(base, icon.src));
  assert.deepEqual(bytes, fs.readFileSync(path.join(base, 'assets/pwa', path.basename(icon.src))));
}
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.CLOCK_BROWSER_CHANNEL } : {}) });
try {
  for (const width of [1440, 390]) {
    for (const routeName of ['login', 'reportes-rrhh', 'relojes-marcaciones', 'modulos']) {
      const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 1000 }, locale: 'es-AR', serviceWorkers: 'block' });
      const errors = [], missing = [];
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname.startsWith('/api/')) {
          assert.equal(request.method(), 'GET');
          if (url.pathname === '/api/internal-auth') {
            const auth = buildAttendanceDeviceAuthFixture();
            auth.access.tenantCapabilities = routeName === 'relojes-marcaciones' ? ['attendance.read'] : ['attendance.read', 'workforce.employee.read', 'workforce.summary.read', 'payroll.read'];
            return route.fulfill({ json: routeName === 'login' ? { ok: true, authenticated: false } : auth });
          }
          const resource = url.searchParams.get('resource');
          if (resource === 'bootstrap') return route.fulfill({ json: buildAttendanceDeviceBootstrapFixture() });
          if (resource === 'reported-inventory') return route.fulfill({ json: buildAttendanceReportedInventoryFixture() });
          return route.fulfill({ json: { ok: true, resource, data: [], pagination: { total: 0, pages: 0, page: 1 } } });
        }
        const file = path.resolve(base, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { missing.push(url.pathname); return route.fulfill({ status: 404, body: '' }); }
        const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
        return route.fulfill({ body: fs.readFileSync(file), contentType: mime });
      });
      const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/${routeName}.html`);
      if (routeName === 'relojes-marcaciones') {
        await page.locator('#appShell').waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.documentElement.getAttribute('data-mc-capability-ready') === 'true');
        assert.equal(await page.locator('a.brand-home').count(), 0);
        assert.equal(await page.locator('.brand-home').getAttribute('href'), null);
        assert.equal(await page.locator('.nav-link[href="/personal#inicio"]').count(), 1);
        assert.equal(await page.locator('.nav-link[href="/personal#inicio"]').isVisible(), false);
        if (width < 700) {
          await page.locator('#menuButton').click();
          await page.waitForFunction(() => document.getElementById('sidebar').getBoundingClientRect().left >= -1);
        }
      }
      const logo = page.locator('.brand .brand-name, .brand strong').first();
      await logo.waitFor({ state: 'visible' });
      const box = await logo.boundingBox();
      assert.ok(box.x >= -1 && box.y >= 0 && box.x + box.width <= width + 1, `${routeName}: wordmark is inside the viewport`);
      const logoUrl = await logo.evaluate(el => getComputedStyle(el).backgroundImage.match(/url\("?([^"\)]+)/)?.[1]);
      assert.match(logoUrl, /\/assets\/brand\/logo-horizontal(?:-inverse)?\.svg$/);
      assert.ok(await page.evaluate(async url => { const img = new Image(); img.src = url; await img.decode(); return img.naturalWidth > 0; }, logoUrl));
      assert.doesNotMatch(await page.title(), /Friendly/);
      assert.equal(await page.locator('link[rel=icon]').count(), 1);
      assert.match(await page.locator('link[rel=icon]').getAttribute('href'), /identity-[a-f0-9]{12}/);
      assert.match(await page.locator('meta[property="og:image"]').getAttribute('content'), /municontrol-social-card-v1\.png$/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${routeName} ${width}: page overflow`);
      assert.equal(await page.locator('.brand-mark:visible, .brand > .mark:visible').count(), 0, 'No obsolete monogram beside the wordmark');
      await page.evaluate(() => { const badge = document.createElement('div'); badge.textContent = 'VERIFICACIÓN LOCAL DE MARCA · Sesión y APIs de prueba'; badge.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff0cb;color:#453406;font:700 11px Arial;padding:7px;text-align:center'; document.body.append(badge); });
      await page.screenshot({ path: path.join(output, `brand-restored-${routeName}-${width}.png`) });
      assert.deepEqual(errors, [], `${routeName}: JavaScript`);
      assert.deepEqual(missing.filter(value => value.includes('/brand/') || value.includes('/pwa/')), []);
      await context.close();
    }
    console.log(`Brand ${width}px passed: four visible shells, exact vector and PNG assets, no obsolete mark, versioned icon, social metadata and layout.`);
  }
  console.log(`Approved wordmark SHA-256 ${createHash('sha256').update(fs.readFileSync(path.join(base, 'assets/brand/logo-horizontal.svg'))).digest('hex')}`);
} finally { await browser.close(); }
