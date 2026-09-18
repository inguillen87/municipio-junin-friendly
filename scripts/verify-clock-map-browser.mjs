/** Map contract QA. All API, Leaflet and tile requests are intercepted locally.
 * No municipal session, real tiles, pan/zoom scraping or backend mutations. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {patchClockFleetHtml} from './build-clock-fleet.mjs';
import {getReportedAttendanceInventory} from '../lib/internal-attendance-reported-inventory.js';

const origin = 'https://clock-map.test', base = path.resolve(process.env.CLOCK_MAP_BUILD_DIR ?? 'public');
const out = path.resolve('verification/clock-map'), html = fs.readFileSync(path.join(base, 'relojes-marcaciones.html'), 'utf8').replaceAll('\r\n', '\n');
const source = patchClockFleetHtml(fs.readFileSync('relojes-marcaciones.html', 'utf8').replaceAll('\r\n', '\n'));
assert.ok(html.includes(source.slice(source.indexOf('function showMapFallback'), source.indexOf('function td('))), 'CLOCK_MAP_BUILD_STALE');
fs.mkdirSync(out, { recursive: true });
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8f2ef"/><path d="M0 80h256M0 180h256M80 0v256M180 0v256" stroke="#abc9c0"/><text x="12" y="140" fill="#49655d">MAPA SINTÉTICO QA</text></svg>';
const sites = [
  { code: 'QA-01', name: 'Sede sintética norte', address: 'Dirección ficticia 100', model: 'Reloj QA', reportedExtraction: 'Red', latitude: -33.14, longitude: -68.48 },
  { code: 'QA-02', name: 'Sede sintética sur', address: 'Dirección ficticia 200', model: 'Reloj QA', reportedExtraction: 'USB', latitude: -33.15, longitude: -68.49 },
];
const checks = [], errors = [], tileHeaders = [];
const browser = await chromium.launch({ headless: true, ...(process.env.CLOCK_MAP_BROWSER_CHANNEL ? { channel: process.env.CLOCK_MAP_BROWSER_CHANNEL } : {}) });
try {
  async function scenario({ zeroStatus = false, noObserver = false, missingLeaflet = false, initialMode = 'success', confirmedAddition = false, startHash = 'mapa' } = {}) {
    const declared=confirmedAddition?getReportedAttendanceInventory({tenant:{slug:'junin-mendoza'}}):null;const displayedSites=declared?.data??sites,apiQueries=[];
    let mode = initialMode, release = null, held = null;
    if (mode === 'hold') held = new Promise(resolve => { release = resolve; });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'es-AR', reducedMotion: 'reduce', serviceWorkers: 'block' });
    if (zeroStatus) await context.addInitScript(() => Object.defineProperty(PerformanceResourceTiming.prototype, 'responseStatus', { configurable: true, get: () => 0 }));
    if (noObserver) await context.addInitScript(() => { window.PerformanceObserver = undefined; });
    else await context.addInitScript(() => { const NativeObserver = window.PerformanceObserver; window.__mapQaCallbacks = []; window.PerformanceObserver = class extends NativeObserver { constructor(callback) { super(callback); window.__mapQaCallbacks.push(callback); } }; });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      assert.equal(request.method(), 'GET', 'MAP_QA_UNEXPECTED_MUTATION');
      if (url.origin === 'https://tile.openstreetmap.org') {
        const headers = await request.allHeaders(); tileHeaders.push(headers);
        assert.equal(headers.referer, origin + '/', 'TILES_MUST_RECEIVE_ORIGIN_ONLY');
        assert.equal(headers.origin, origin); assert.doesNotMatch(headers.referer, /relojes|privacy_probe|sensitive/);
        assert.ok(!headers['cache-control'] && !headers.pragma, 'TILES_MUST_KEEP_BROWSER_CACHE_DEFAULTS');
        if (mode === 'network-error') return route.abort('failed');
        if (mode === 'hold') await held;
        return route.fulfill({ status: mode === '403' ? 403 : mode === '500' ? 500 : 200,
          contentType: mode === '500' ? 'image/png' : 'image/svg+xml',
          headers: { 'access-control-allow-origin': '*', 'cache-control': mode === 'success' ? 'public, max-age=604800' : 'no-store' },
          body: mode === '500' ? 'invalid image body' : svg });
      }
      if (url.origin === 'https://privacy-probe.test') {
        assert.ok(!(await request.allHeaders()).referer, 'GLOBAL_NO_REFERRER_MUST_REMAIN_EFFECTIVE');
        return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
      }
      if (url.origin === 'https://unpkg.com' && url.pathname.startsWith('/leaflet@1.9.4/dist/')) {
        if (missingLeaflet && url.pathname.endsWith('.js')) return route.fulfill({ status: 404, body: '' });
        const file = path.join('node_modules/leaflet/dist', path.basename(url.pathname));
        return route.fulfill({ status: 200, contentType: file.endsWith('.css') ? 'text/css' : 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
      }
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/api/')) {
        apiQueries.push(url.pathname+url.search);
        if (url.pathname === '/api/internal-auth') return route.fulfill({ json: { ok: true, authenticated: true, user: { name: 'Operador QA', email: 'qa@example.invalid', role: 'ADMIN_INTERNO' }, access: { tenantCapabilities: ['attendance.read'], platformCapabilities: [] } } });
        const resource = url.searchParams.get('resource');
        if (url.pathname === '/api/internal-attendance' && resource === 'bootstrap') return route.fulfill({ json: { ok: true, capabilities: ['attendance.read'], summary: { siteCount: 2, deviceCount: 2 }, features: { hardwareConnected: false, hoursCalculated: false, payrollPosted: false, biometricTemplatesStored: false } } });
        if (url.pathname === '/api/internal-attendance' && resource === 'reported-inventory') return route.fulfill({ json: { ok: true, data: displayedSites, heatMetric: 'reported_site_density', source: declared?.source??{ fileName: 'Inventario sintético QA', sheet: 'Pruebas' } } });
        return route.fulfill({ json: { ok: true, resource, data: [], pagination: { page: 1, pages: 0, total: 0 } } });
      }
      if (url.pathname === '/relojes') return route.fulfill({ contentType: 'text/html', headers: { 'referrer-policy': 'no-referrer' }, body: html });
      const file = path.resolve(base, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: /\.m?js$/.test(file) ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream', body: fs.readFileSync(file) });
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
    if (mode === 'hold') await page.clock.install();
    await page.goto(origin + '/relojes?privacy_probe=sensitive#'+startHash, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(n => document.querySelectorAll('#mapAccessibleList li').length === n,displayedSites.length);
    await page.evaluate(() => { const label = document.createElement('div'); label.textContent = 'QA SINTÉTICA · APIs y mapa simulados · Sin sesión municipal'; label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff0cb;color:#453406;font:700 12px Arial;padding:8px;text-align:center'; document.body.append(label); });
    const loaded = () => page.waitForFunction(() => document.querySelector('#mapFallback').hidden === true);
    const failed = async () => { try { await page.waitForFunction(() => document.querySelector('#mapFallbackTitle').textContent === 'Mapa base no disponible' && !document.querySelector('#mapFallback').hidden); }
      catch (error) { console.log(JSON.stringify({ mode, errors, details: await page.evaluate(() => ({ title: document.querySelector('#mapFallbackTitle').textContent, hidden: document.querySelector('#mapFallback').hidden, status: document.querySelector('#mapStatus').textContent, resources: performance.getEntriesByType('resource').filter(item => item.name.includes('tile.openstreetmap')).map(item => ({ status: item.responseStatus, type: item.initiatorType })) })) })); throw error; } };
    return { context, page, loaded, failed, apiQueries, setMode: value => { mode = value; }, release: () => release?.() };
  }
  const good = await scenario(), page = good.page;
  await good.loaded(); assert.equal(await page.locator('.reported-marker').count(), 2);
  assert.equal(await page.locator('.map-accessible-details summary').isVisible(), true);
  assert.equal(await page.locator('#attendanceMap').getAttribute('aria-busy'), 'false');
  for (const tile of await page.locator('.leaflet-tile').all()) { assert.equal(await tile.getAttribute('referrerpolicy'), 'strict-origin'); assert.equal(await tile.getAttribute('crossorigin'), 'anonymous'); }
  assert.equal(await page.locator('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]').isVisible(), true);
  await page.locator('#attendanceMap').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'map-success-synthetic-1440.png') });
  await page.evaluate(() => new Promise(resolve => { const image = new Image(); image.onload = image.onerror = resolve; image.src = 'https://privacy-probe.test/image.svg'; document.body.append(image); image.hidden = true; }));
  checks.push('native Leaflet images send only accurate origin; path/query excluded and global no-referrer remains effective for other images');
  checks.push('canonical OSM host, anonymous CORS, visible linked attribution and normal cache headers');
  await page.locator('#refreshButton').click(); await good.loaded();
  await page.evaluate(() => window.__mapQaCallbacks.forEach(callback => callback({ getEntries: () => [{ name: 'https://tile.openstreetmap.org/0/0/0.png', responseStatus: 403, startTime: 0 }] })));
  assert.equal(await page.locator('#mapFallback').isHidden(), true);
  checks.push('late failure timing from a previous map attempt cannot revoke the current successful map');
  await good.context.close();
  for (const mode of ['403', '500', 'network-error']) {
    const fault = await scenario({ initialMode: mode }), faultPage = fault.page; await fault.failed();
    assert.equal(await faultPage.locator('.reported-marker').count(), 2); assert.equal(await faultPage.locator('#mapAccessibleList li').count(), 2);
    assert.equal(await faultPage.locator('.map-accessible-details').getAttribute('open') !== null, true);
    assert.equal(await faultPage.locator('.leaflet-tile').count(), 0); assert.equal(await faultPage.locator('#attendanceMap').getAttribute('aria-busy'), 'false');
    assert.match(await faultPage.locator('#mapFallbackCopy').innerText(), /listado accesible/);
    fault.setMode('success'); await faultPage.locator('#retryReportedMap').click(); await fault.loaded();
    if (mode === '403') { await faultPage.locator('#attendanceMap').scrollIntoViewIfNeeded(); await faultPage.screenshot({ path: path.join(out, 'map-recovered-synthetic-1440.png') }); }
    assert.equal(await faultPage.locator('.reported-marker').count(), 2); assert.equal(await faultPage.locator('#mapAccessibleList li').count(), 2); await fault.context.close();
  }
  checks.push('403 with valid image body, 500 invalid image and network failure trigger a truthful fallback; explicit retry recovers without duplicate markers');
  const stalled = await scenario({ initialMode: 'hold' });
  await stalled.page.waitForFunction(() => document.querySelector('#mapFallbackTitle').textContent === 'Cargando el mapa geográfico');
  await stalled.page.clock.fastForward(26000); await stalled.failed(); stalled.setMode('success'); stalled.release();
  await stalled.page.locator('#retryReportedMap').click(); await stalled.loaded(); await stalled.context.close();
  checks.push('stalled tile loading times out to the list and an explicit retry recovers; no automatic retries');
  const visual = await scenario({ initialMode: '403' }); await visual.failed();
  for (const width of [1440, 390]) {
    await visual.page.setViewportSize({ width, height: width < 700 ? 844 : 1100 });
    await visual.page.locator('#mapFallback').scrollIntoViewIfNeeded();
    assert.ok(await visual.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await visual.page.locator('#retryReportedMap').focus(); assert.equal(await visual.page.locator('#retryReportedMap').evaluate(element => element === document.activeElement), true);
    await visual.page.screenshot({ path: path.join(out, 'map-fallback-synthetic-' + width + '.png') });
  }
  checks.push('desktop and 390px fallback remain readable without page overflow; retry and list use keyboard-accessible controls');
  await visual.context.close();
  for (const options of [{ zeroStatus: true }, { noObserver: true }]) {
    const compatible = await scenario(options); await compatible.loaded(); assert.equal(await compatible.page.locator('.reported-marker').count(), 2); await compatible.context.close();
  }
  checks.push('zero or unavailable responseStatus and unavailable PerformanceObserver never reject valid map images');
  const missing = await scenario({ missingLeaflet: true }); await missing.failed();
  assert.equal(await missing.page.locator('#mapAccessibleList').isVisible(), true); assert.match(await missing.page.locator('#mapFallbackCopy').innerText(), /biblioteca cartográfica/);
  await missing.context.close(); checks.push('unavailable Leaflet keeps the authorized points in the accessible list');
  const updated=await scenario({confirmedAddition:true,startHash:'pm-14'});await updated.loaded();const pmPage=updated.page;
  assert.equal(await pmPage.locator('.reported-marker').count(),14);assert.equal(await pmPage.locator('.map-pin-number').count(),14);
  assert.match(await pmPage.locator('#mapSourceNote').innerText(),/13 puntos.*1 alta confirmada/);
  const entry=pmPage.locator('[data-site-key="pm-14"]');assert.match(await entry.innerText(),/PM-14.*Edificio Nuevo/);assert.match(await entry.innerText(),/Román Cano e Hipólito Yrigoyen/);assert.match(await entry.innerText(),/referencia cartográfica del edificio/);
  const before=updated.apiQueries.length;await entry.getByRole('button',{name:'Ubicar PM-14',exact:true}).click();assert.equal(updated.apiQueries.length,before);
  await pmPage.locator('.leaflet-popup-content').waitFor();assert.match(await pmPage.locator('.leaflet-popup-content').innerText(),/-33.142220, -68.484521/);assert.match(await pmPage.locator('.leaflet-popup-content').innerText(),/no posición medida del reloj/);
  assert.equal(await pmPage.locator('.confirmed-addition .map-pin-number').innerText(),'14');assert.equal(await pmPage.locator('.confirmed-addition.fleet-received').count(),0);
  await pmPage.evaluate(()=>document.dispatchEvent(new CustomEvent('mc:clock-fleet-data',{detail:{checkedAt:'2026-09-18T12:00:00Z',sites:[{key:'pm-10',records:1,receipts:1,lastReceivedAt:'2026-09-18T11:00:00Z'}]}})));
  assert.equal(await pmPage.locator('.confirmed-addition.fleet-received').count(),0);assert.match(await entry.innerText(),/Sin acuses asociados/);
  checks.push('PM-14 uses a separate municipal addition and building reference; all 13 workbook points retained, no PM-10 receipts inherited');
  for(const width of [1440,390,320]){await pmPage.setViewportSize({width,height:width===1440?1050:844});await pmPage.locator('#attendanceMap').scrollIntoViewIfNeeded();await entry.getByRole('button',{name:'Ubicar PM-14',exact:true}).click();await pmPage.locator('#attendanceMap').scrollIntoViewIfNeeded();assert.ok(await pmPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await pmPage.screenshot({path:path.join(out,'pm14-'+width+'.png')});}
  checks.push('Numbered markers, PM-14 deep-link and accessible focus work at 1440/390/320px without additional API calls');await updated.context.close();
  assert.deepEqual(errors, []); assert.ok(tileHeaders.length > 0);
  const result = { ok: true, checksPassed: checks.length, checks, syntheticDataOnly: false, publicInventoryCoordinates:true, syntheticApiResponses:true, realTileRequests: 0, municipalSessionTested: false, backendWrites: false, builtMapMatchesSource: true, browser: browser.version() };
  fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); }
