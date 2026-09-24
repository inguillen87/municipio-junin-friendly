/** Synthetic local-review UX. All API calls are mocked; only GET session metadata is permitted.
 * Optional published asset verification uses credential-free public GET and exact local-build bytes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { backupReviewFixture } from '../tests/fixtures/grh-backup-review-synthetic.js';
import { coreReviewFixture } from '../tests/fixtures/grh-core-review-synthetic.js';
import { successorFixture } from '../tests/fixtures/grh-successor-panel-synthetic.js';

const publishedOrigin = process.env.BACKUP_REVIEW_PUBLISHED_ORIGIN;
if (publishedOrigin !== undefined) assert.equal(publishedOrigin, 'https://municipio-junin-friendly.vercel.app', 'PUBLISHED_ORIGIN_NOT_ALLOWED');
const origin = publishedOrigin ?? 'https://municontrol.test', base = path.resolve('public'), out = path.resolve('verification');
const mode = publishedOrigin ? 'published_assets_with_synthetic_api' : 'local_build_with_synthetic_api';
fs.mkdirSync(out, { recursive: true });
const checks = [], errors = [], requests = [], publishedAssets = new Set(), publishedFailures = new Set(), publishedRedirects = new Set();
let authStatus = 200, lineage = true, delayAuth = null, authCount = 0, malformedSession = false;
async function publicAsset(url, expected) {
  assert.equal(url.origin, 'https://municipio-junin-friendly.vercel.app'); assert.ok(!url.pathname.startsWith('/api/'));
  let r = await fetch(url.href, { method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (url.pathname === '/integracion-datos.html' && r.status === 307) {
    assert.equal(r.headers.get('location'), '/integracion', 'UNEXPECTED_PUBLIC_ROUTE_REDIRECT'); await r.body?.cancel();
    r = await fetch(url.origin + '/integracion', { method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    publishedRedirects.add('/integracion-datos.html → /integracion');
  }
  assert.equal(r.status, 200, 'PUBLISHED_ASSET_UNAVAILABLE');
  const reader = r.body.getReader(), chunks = []; let length = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; assert.ok(length <= expected.length, 'PUBLISHED_ASSET_SIZE_MISMATCH'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(chunks, length); assert.ok(bytes.equals(expected), 'PUBLISHED_ASSET_CONTENT_MISMATCH'); publishedAssets.add(url.pathname); return bytes;
}
const browser = await chromium.launch({ headless: true, ...(process.env.BACKUP_REVIEW_BROWSER_CHANNEL || process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.BACKUP_REVIEW_BROWSER_CHANNEL || process.env.CLOCK_BROWSER_CHANNEL } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'es-AR', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    requests.push({ url: request.url(), method: request.method(), body: request.postData() });
    if (url.origin !== origin) return route.abort();
    assert.equal(request.method(), 'GET', 'UNEXPECTED_WRITE_OR_UPLOAD');
    if (!url.pathname.startsWith('/api/')) {
      const file = path.resolve(base, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(file); if (publishedOrigin) { try { body = await publicAsset(url, body); } catch { publishedFailures.add(url.pathname); return route.abort(); } }
      return route.fulfill({ status: 200, contentType: /\.m?js$/.test(file) ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream', body });
    }
    if (url.pathname === '/api/internal-auth') {
      authCount++; if (delayAuth) { const wait = delayAuth; delayAuth = null; await wait; }
      if (malformedSession) return route.fulfill({ status: 200, contentType: 'application/json', body: 'PRIVATE_NOMINAL_MARKER malformed response' });
      return route.fulfill({ status: authStatus, json: authStatus === 200 ? { ok: true, authenticated: true, access: { tenantCapabilities: lineage ? ['lineage.read'] : ['quality.read'], platformCapabilities: [], platformRoles: [] } } : { ok: false, error: 'Fallo sintético de sesión' } });
    }
    // The new panel must work independently when its actor cannot read integration quality.
    return route.fulfill({ status: 403, json: { ok: false, error: 'Calidad no permitida para este perfil sintético' } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  const panel = page.locator('#revisar-respaldo'), input = panel.locator('[data-br-file]'), state = panel.locator('[data-br-status]');
  const ready = () => page.waitForFunction(() => document.querySelector('#revisar-respaldo')?.dataset.backupMounted === 'true' && document.documentElement.dataset.mcCapabilityState !== 'checking');
  const idle = () => page.waitForFunction(() => document.querySelector('#revisar-respaldo')?.getAttribute('aria-busy') === 'false');
  async function load() { const target = origin + '/integracion-datos.html#revisar-respaldo'; if (page.url() === target) await page.reload(); else await page.goto(target); await ready(); }
  function bytes(value = backupReviewFixture()) { return Buffer.from(JSON.stringify(value)); }
  async function select(value = backupReviewFixture()) { await input.setInputFiles({ name: 'PRIVATE_LOCAL_FILENAME.json', mimeType: 'application/json', buffer: Buffer.isBuffer(value) ? value : bytes(value) }); }
  async function open() { await panel.locator('[data-br-open]').click(); await idle(); }
  async function result() { await select(); await open(); assert.equal(await panel.locator('[data-br-result]').isVisible(), true); }
  async function evidence(name, width, target) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1050 });
    await page.evaluate(async selector => { let banner = document.getElementById('synthetic-evidence'); if (!banner) { banner = document.createElement('div'); banner.id = 'synthetic-evidence'; banner.textContent = 'QA SINTÉTICA · Sesión simulada · Sin datos municipales'; banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:8px;text-align:center;background:#fff1c7;color:#463809;font:700 12px Arial'; document.body.append(banner); } document.activeElement?.blur(); await document.fonts.ready; const n = document.querySelector(selector); window.scrollTo({ top: scrollY + n.getBoundingClientRect().top - 15, behavior: 'instant' }); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }, target);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'PAGE_OVERFLOW');
    await page.screenshot({ path: path.join(out, name + '.png') });
  }
  await load(); assert.equal(await panel.isVisible(), true); assert.equal(await page.locator('#content').isVisible(), false); assert.equal(await page.locator('#errorHost').isVisible(), true);
  checks.push('lineage-only actor can open the local-review panel despite integrationquality 403');
  const beforeChoice = requests.length; await select(); assert.equal(requests.length, beforeChoice); assert.equal(await panel.locator('[data-br-result]').isVisible(), false);
  checks.push('choosing the local aggregate report triggers no request and no premature result');
  const beforeOpen = authCount; await open(); assert.ok(authCount > beforeOpen); assert.equal(await panel.locator('[data-br-result]').isVisible(), true);
  assert.equal(await panel.locator('[data-br-domains] tr').count(), 7); assert.equal(await panel.locator('[data-br-issues] li').count(), 42); assert.equal(await panel.locator('[data-br-added]').innerText(), '14'); assert.equal(await panel.locator('[data-br-removed]').innerText(), '7'); assert.equal(await panel.locator('[data-br-changed]').innerText(), '28');
  checks.push('opening rechecks lineage permission then validates and displays all seven domains with exact aggregate totals');
  assert.match(await panel.locator('[data-br-candidate]').innerText(), /10\/09\/2026 01:20:30.*zona horaria no informada/);
  await panel.locator('summary').last().click(); assert.ok((await panel.locator('[data-br-trace]').innerText()).includes(createHash('sha256').update(bytes()).digest('hex')));
  assert.match(await panel.innerText(), /servidor no autenticó/); assert.match(await panel.innerText(), /no demuestra una baja administrativa/);
  checks.push('declared cutoffs retain their clock value and report hash is explicitly local and unauthenticated');
  await evidence('grh-backup-review-desktop-qa', 1440, '#revisar-respaldo'); await evidence('grh-backup-review-mobile-qa', 390, '#revisar-respaldo');
  await evidence('grh-backup-review-result-mobile-qa', 390, '[data-br-result]'); await page.setViewportSize({ width: 1440, height: 1050 });
  checks.push('desktop and 390px mobile preserve labels, readable controls and contained table scrolling');
  await select(backupReviewFixture({ unchanged: true })); await open(); assert.match(await panel.locator('[data-br-verdict]').innerText(), /Sin diferencias.*no certifica todo GRH/); assert.equal(await panel.locator('[data-br-changed]').innerText(), '0');
  checks.push('zero detected changes never becomes a promotion approval or a whole-GRH reconciliation');
  const beforeSuccessorChoice=requests.length;await select(successorFixture());assert.equal(requests.length,beforeSuccessorChoice);
  await open();assert.equal(await panel.locator('[data-br-result]').isVisible(),true);
  assert.equal(await panel.locator('[data-br-domains] tr').count(),5);assert.equal(await panel.locator('[data-br-successor] tbody tr').count(),7);
  assert.equal(await panel.locator('[data-br-changed]').innerText(),'5');
  assert.match(await panel.locator('[data-br-core-corrections]').innerText(),/4 para 3 contratos/);
  assert.match(await panel.locator('[data-br-issues]').innerText(),/3 asignaciones conservan/);
  assert.match(await panel.locator('[data-br-successor] .br-notice').innerText(),/candidato 2026-08-31/);
  assert.equal(await panel.locator('[data-br-successor] td').filter({hasText:/^Cerrada$/}).count(),1);
  checks.push('actual integration page opens successor reports without uploads and distinguishes source ID rotation, contracts and per-type closures');
  await evidence('grh-successor-integrated-desktop-qa',1440,'#revisar-respaldo');
  await evidence('grh-successor-integrated-mobile-qa',390,'[data-br-result]');
  await evidence('grh-successor-closures-mobile-qa',390,'[data-br-successor]');
  assert.ok(await panel.locator('[data-br-successor] .br-table-wrap').evaluate(n=>n.scrollWidth>n.clientWidth));
  await page.setViewportSize({width:1440,height:1050});await open();assert.equal(await panel.locator('[data-br-successor]').count(),1);
  assert.equal(await panel.locator('[data-br-successor] tbody tr').count(),7);
  checks.push('successor evidence stays scrollable on mobile and repeated reads do not duplicate the added sections');
  const beforeCoreChoice = requests.length; await select(coreReviewFixture()); assert.equal(requests.length, beforeCoreChoice);
  const beforeCoreOpen = authCount; await open(); assert.ok(authCount > beforeCoreOpen);
  assert.equal(await panel.locator('[data-br-result]').isVisible(), true); assert.equal(await panel.locator('[data-br-domains] tr').count(), 5);
  assert.equal(await panel.locator('[data-br-added]').innerText(), '10'); assert.equal(await panel.locator('[data-br-removed]').innerText(), '5'); assert.equal(await panel.locator('[data-br-changed]').innerText(), '15');
  assert.equal(await panel.locator('[data-br-changed-label]').innerText(), 'Registros modificados · 5 conjuntos');
  assert.match(await panel.locator('[data-br-core-corrections]').innerText(), /4 registros conservan su clave y tienen contenido distinto/);
  assert.match(await panel.locator('[data-br-issues]').innerText(), /24 registros conservan su clave/);
  assert.match(await panel.locator('[data-br-limit]').innerText(), /no autoriza cargar o reemplazar datos, pagar ni dar de baja/);
  assert.match(await panel.locator('[data-br-candidate]').innerText(), /10\/09\/2026 15:45:00.*zona horaria no informada/);
  assert.ok((await panel.locator('[data-br-trace]').innerText()).includes(createHash('sha256').update(bytes(coreReviewFixture())).digest('hex')));
  assert.match(await panel.locator('[data-br-trace]').innerText(), /no miden el espacio ocupado/);
  checks.push('five-domain core comparison displays exact record totals and monthly corrections from the report, with no payment or personnel-termination claim');
  await evidence('grh-core-review-desktop-qa', 1440, '#revisar-respaldo'); await evidence('grh-core-review-mobile-qa', 390, '#revisar-respaldo');
  await evidence('grh-core-review-result-mobile-qa', 390, '[data-br-result]');
  await evidence('grh-core-review-detail-desktop-qa', 1440, '[data-br-core-corrections]');
  await evidence('grh-core-review-detail-mobile-qa', 390, '[data-br-core-corrections]');
  assert.ok(await panel.locator('[data-br-table-region]').evaluate(n => n.scrollWidth > n.clientWidth), 'MOBILE_TABLE_MUST_SCROLL_INSIDE_PANEL');
  await panel.locator('[data-br-table-region]').evaluate(n => { n.scrollLeft = n.scrollWidth; });
  assert.ok(await panel.locator('[data-br-table-region]').evaluate(n => n.scrollLeft > 0));
  await page.setViewportSize({ width: 1440, height: 1050 });
  checks.push('core report remains readable on desktop and 390px mobile with contained accessible table scrolling');
  await select(coreReviewFixture({ unchanged: true })); await open();
  assert.match(await panel.locator('[data-br-verdict]').innerText(), /Sin diferencias.*no certifica todo GRH/);
  assert.match(await panel.locator('[data-br-core-corrections]').innerText(), /0 registros/);
  for (const mutate of [p => p.people = [{ nombre: 'PRIVATE_NOMINAL_MARKER' }], p => p.candidate.path = 'PRIVATE_NOMINAL_MARKER',
    p => p.artifacts.movements.employeeName = 'PRIVATE_NOMINAL_MARKER', p => p.semantics.keys = 'PRIVATE_NOMINAL_MARKER',
    p => p.artifacts.payrollMonthly.changed++, p => p.semantics.monthlyHistoryKeyOverlap++, p => p.publicationAuthorized = true]) {
    const report = coreReviewFixture(); mutate(report); await select(report); await open();
    assert.equal(await panel.locator('[data-br-result]').isVisible(), false); assert.match(await state.innerText(), /no cumple el contrato/);
    assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE_NOMINAL_MARKER/); assert.equal(await input.evaluate(n => n.files.length), 1);
  }
  checks.push('core report rejects nominal fields, private paths, inconsistent totals and invented publication claims while preserving the selection');
  await select(coreReviewFixture()); authStatus = 503; await open(); assert.equal(await input.evaluate(n => n.files.length), 1);
  assert.equal(await panel.locator('[data-br-open]').isEnabled(), true); authStatus = 200; await open();
  assert.equal(await panel.locator('[data-br-domains] tr').count(), 5);
  await select(); await open(); assert.equal(await panel.locator('[data-br-domains] tr').count(), 7);
  assert.equal(await panel.locator('[data-br-core-corrections]').isVisible(), false);
  assert.equal(await panel.locator('[data-br-changed-label]').innerText(), 'Registros modificados · 7 tablas');
  assert.match(await panel.locator('[data-br-limit]').innerText(), /detalle de las liquidaciones/);
  assert.equal(await panel.locator('[data-br-successor]').isVisible(),false);
  assert.equal(await panel.locator('[data-br-successor]').innerText(),'');
  checks.push('retry and switching to either older format clear all successor-only evidence');
  for (const mutate of [p => p.people = [{ name: 'PRIVATE_NOMINAL_MARKER' }], p => p.issues[0].code = 'PRIVATE_NOMINAL_MARKER', p => p.candidate.path = 'PRIVATE_NOMINAL_MARKER']) {
    const p = backupReviewFixture(); mutate(p); await select(p); await open(); assert.equal(await panel.locator('[data-br-result]').isVisible(), false); assert.match(await state.innerText(), /no cumple el contrato/); assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE_NOMINAL_MARKER/);
    assert.equal(await input.evaluate(n => n.files.length), 1);
  }
  checks.push('unknown fields, nominal arrays and source-text issue codes are rejected without reflecting their values');
  for (const mutate of [p => p.domains[0].candidateRows++, p => p.issues.pop(), p => p.scope.readyForPromotion = true, p => p.candidate.cutoffAt = p.baseline.cutoffAt]) {
    const p = backupReviewFixture(); mutate(p); await select(p); await open(); assert.equal(await panel.locator('[data-br-result]').isVisible(), false); assert.match(await state.innerText(), /no cumple el contrato/);
  }
  checks.push('inconsistent recounts, missing issues, promotion flags and non-newer cutoffs fail closed');
  await select(Buffer.alloc(262145, 32)); const beforeOversize = authCount; await open(); assert.equal(authCount, beforeOversize); assert.match(await state.innerText(), /256 KiB/);
  checks.push('oversized reports stop locally before any additional session request or file read');
  await select(); authStatus = 503; await open(); assert.equal(await input.evaluate(n => n.files.length), 1); assert.equal(await panel.locator('[data-br-open]').isEnabled(), true); assert.match(await state.innerText(), /Conservamos/);
  authStatus = 200; await open(); assert.equal(await panel.locator('[data-br-result]').isVisible(), true);
  checks.push('transient session failure preserves the selected local report for an explicit successful retry');
  malformedSession = true; await open(); assert.match(await state.innerText(), /Conservamos la selección/); assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE_NOMINAL_MARKER/); assert.equal(await input.evaluate(n => n.files.length), 1);
  malformedSession = false;
  await page.evaluate(() => { window.qaOriginalFileRead = FileReader.prototype.readAsArrayBuffer; FileReader.prototype.readAsArrayBuffer = function () { throw Error('Cannot read C:/PRIVATE_NOMINAL_MARKER.json'); }; });
  await open(); assert.match(await state.innerText(), /Conservamos la selección/); assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE_NOMINAL_MARKER/); assert.equal(await input.evaluate(n => n.files.length), 1);
  await page.evaluate(() => { FileReader.prototype.readAsArrayBuffer = window.qaOriginalFileRead; delete window.qaOriginalFileRead; }); await open(); assert.equal(await panel.locator('[data-br-result]').isVisible(), true);
  checks.push('malformed session JSON and unexpected local-file exceptions never reveal server text or personal filenames');
  await select(successorFixture()); await open(); assert.equal(await panel.locator('[data-br-domains] tr').count(), 5);
  lineage = false; await open(); assert.equal(await panel.isVisible(), false); assert.equal(await input.evaluate(n => n.files.length), 0); assert.equal(await panel.locator('[data-br-domains] tr').count(), 0);
  checks.push('revoked lineage permission removes the report and file selection before reading again');
  await load(); assert.equal(await panel.isVisible(), false); assert.match(await page.locator('#backupReviewAccessNotice').innerText(), /permiso vigente/);
  authStatus = 401; await load(); assert.equal(await panel.isVisible(), false); assert.match(await page.locator('#backupReviewAccessNotice').innerText(), /sesión no está disponible/);
  checks.push('initial missing lineage and unavailable session never expose the review controls');
  authStatus = 200; lineage = true; await load(); await select(); let release; delayAuth = new Promise(resolve => { release = resolve; });
  await panel.locator('[data-br-open]').click(); await page.waitForFunction(() => document.querySelector('#revisar-respaldo')?.getAttribute('aria-busy') === 'true');
  await select(backupReviewFixture({ unchanged: true })); release(); await idle(); assert.equal(await panel.locator('[data-br-result]').isVisible(), false); await open(); assert.equal(await panel.locator('[data-br-changed]').innerText(), '0');
  checks.push('changing the local file during an in-flight access check cancels the old generation');
  await select(); delayAuth = new Promise(resolve => { release = resolve; }); await panel.locator('[data-br-open]').click(); await panel.locator('[data-br-clear]').click(); release(); await idle();
  assert.equal(await panel.locator('[data-br-result]').isVisible(), false); assert.equal(await input.evaluate(n => n.files.length), 0); assert.equal(await input.evaluate(n => n === document.activeElement), true);
  checks.push('clear cancels pending work, removes the local selection and returns keyboard focus to the file control');
  await result(); await page.evaluate(() => document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready', { detail: { tenantCapabilities: new Set(['lineage.read']) } })));
  assert.equal(await panel.locator('[data-br-result]').isVisible(), false); assert.equal(await input.evaluate(n => n.files.length), 0);
  checks.push('scope refresh discards a prior comparison even when the capability name remains the same');
  await result(); const beforeBack = authCount, navigation = page.waitForEvent('load');
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); }); await navigation; await ready();
  assert.ok(authCount > beforeBack); assert.equal(await panel.locator('[data-br-result]').isVisible(), false); assert.equal(await input.evaluate(n => n.files.length), 0);
  checks.push('bfcache restoration restarts the existing access gate without replaying a local file');
  for(const mutate of [v=>v.publication.ready=true,v=>v.entities.payrollSnapshot.contracts.after=99,v=>v.entities.payrollMonthly.changedFields.privateField=1,v=>v.runEvidence.candidate.currentRuns[0].payrollType='PRIVATE_NOMINAL_MARKER']){
    const value=successorFixture();mutate(value);await select(value);await open();
    assert.equal(await panel.locator('[data-br-result]').isVisible(),false);assert.match(await state.innerText(),/no cumple el contrato/);
    assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE_NOMINAL_MARKER/);
  }
  checks.push('successor review rejects invalid totals, nominal fields and claimed publication authority without partial rendering');
  const missingClosure=successorFixture();delete missingClosure.runEvidence.candidate.latestClosedByType.M;
  await select(missingClosure);await open();assert.match(await panel.locator('[data-br-successor] .br-notice').innerText(),/candidato no informada/);
  checks.push('unreported monthly closure is not invented from the vacation run');
  await panel.locator('[data-br-clear]').click();assert.equal(await panel.locator('[data-br-successor]').innerText(),'');
  assert.equal(await input.evaluate(n=>n.files.length),0);assert.equal(await panel.locator('[data-br-result]').isVisible(),false);
  checks.push('clearing a successor report removes new tables, source evidence and selected file');
  assert.ok(requests.every(r => r.method === 'GET' && r.body === null));
  assert.doesNotMatch(JSON.stringify(requests), /PRIVATE_LOCAL_FILENAME|PRIVATE_NOMINAL_MARKER|grh-backup-review\.v1|grh-core-artifact-comparison\.v1|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/);
  assert.ok(requests.filter(r => new URL(r.url).pathname.startsWith('/api/')).every(r => ['/api/internal-auth', '/api/internal-data'].includes(new URL(r.url).pathname)));
  checks.push('all network requests are content-free GETs; no filename, report, backup hash, nominal marker or upload leaves the browser');
  assert.deepEqual(errors, []); assert.equal(publishedFailures.size, 0); if (publishedOrigin) assert.ok(publishedAssets.size > 0);
  const resultJson = { mode, origin, checksPassed: checks.length, checks, errors, publishedAssetsMatch: publishedOrigin ? true : null, publishedAssetsChecked: [...publishedAssets].sort(), publishedRedirectsVerified: [...publishedRedirects].sort(),
    syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false, sourceUploads: false, serviceWorkersBlocked: true, browser: browser.version() };
  fs.writeFileSync(path.join(out, 'grh-backup-review-browser.json'), JSON.stringify(resultJson, null, 2)); console.log(JSON.stringify(resultJson));
} catch (error) {
  fs.writeFileSync(path.join(out, 'grh-backup-review-browser.json'), JSON.stringify({ ok: false, mode, checksPassed: checks.length, publishedAssetsMatch: publishedOrigin ? false : null,
    failedPublicAssets: [...publishedFailures].sort(), syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false, sourceUploads: false }, null, 2)); throw error;
} finally { await browser.close(); }
