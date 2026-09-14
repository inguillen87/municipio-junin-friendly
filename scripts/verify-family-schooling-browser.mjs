/** Browser contract QA with synthetic people/PDF only. Every API is intercepted. No backend is written.
 * Optional published mode fetches only public GET assets from the single allowed origin,
 * with no credentials or redirects, and requires exact equality with the local build. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';
import { schoolingFixture, syntheticUuid, syntheticSchoolPdf, syntheticSchoolHash } from '../tests/fixtures/family-schooling-synthetic.js';

const publishedOrigin = process.env.SCHOOLING_PUBLISHED_ORIGIN;
if (publishedOrigin !== undefined) assert.equal(publishedOrigin, 'https://municipio-junin-friendly.vercel.app', 'SCHOOLING_PUBLISHED_ORIGIN_NOT_ALLOWED');
const base = path.resolve('public'), out = path.resolve('verification'), origin = publishedOrigin ?? 'https://municontrol.test';
const mode = publishedOrigin ? 'published_assets_with_synthetic_api' : 'local_build_with_synthetic_api';
fs.mkdirSync(out, { recursive: true });
const checks = [], errors = [], posts = [], downloads = [];
const publishedAssets = new Set(), publishedFailures = new Set();
async function publicAsset(url, expected) {
  // Do not forward browser headers/cookies, use a bypass token, or follow a redirect.
  assert.equal(url.origin, 'https://municipio-junin-friendly.vercel.app');
  assert.ok(!url.pathname.startsWith('/api/'));
  const response = await fetch(url.href, { method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, 'PUBLISHED_ASSET_UNAVAILABLE');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      assert.ok(length <= expected.length, 'PUBLISHED_ASSET_SIZE_MISMATCH'); chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const actual = Buffer.concat(chunks, length);
  assert.ok(actual.equals(expected), 'PUBLISHED_ASSET_CONTENT_MISMATCH');
  publishedAssets.add(url.pathname); return actual;
}
let dataset = schoolingFixture(), failRead = 0, postError = null, failRefreshAfterSave = false, delayReport = null;
let reportRequests = 0, authRequests = 0;
const employee = { contractId: syntheticUuid(1), legajo: '000001', nombre: 'AGENTE SINTÉTICO 0001', companyId: 7,
  activo: true, liquidable: false, administrativeStatus: 'active', payrollStatus: 'not_liquidated', controlState: 'activo_no_incluido',
  crosswalkStatus: 'matched', sector: 'Sector QA', organizacion: 'Unidad QA', convenio: 'Convenio QA', cargo: 'Cargo QA' };
const browser = await chromium.launch({ headless: true, ...(process.env.SCHOOLING_BROWSER_CHANNEL || process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.SCHOOLING_BROWSER_CHANNEL || process.env.CLOCK_BROWSER_CHANNEL } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'es-AR', acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    if (u.origin !== origin) return route.abort();
    if (!u.pathname.startsWith('/api/')) {
      if (request.method() !== 'GET') return route.abort();
      const file = path.resolve(base, '.' + decodeURIComponent(u.pathname));
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(file);
      if (publishedOrigin) {
        try { body = await publicAsset(u, body); }
        catch { publishedFailures.add(u.pathname); return route.abort(); }
      }
      return route.fulfill({ status: 200, contentType: file.endsWith('.js') || file.endsWith('.mjs') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream', body });
    }
    const resource = u.searchParams.get('resource');
    if (u.pathname === '/api/internal-family-certificates') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON(), key = request.headers()['idempotency-key']; posts.push({ body, key });
        if (postError) { const next = postError; postError = null; return route.fulfill({ status: next.status, json: { ok: false, code: next.code, error: 'Fallo sintético controlado' } }); }
        assert.match(body.familyId, /^[0-9]{1,20}$/); assert.equal(body.sha256, syntheticSchoolHash);
        assert.deepEqual(Buffer.from(body.contentBase64, 'base64'), syntheticSchoolPdf);
        const row = dataset.data.rows.find(r => r.contractId === body.contractId && r.familyId === body.familyId);
        assert.equal(body.identityToken, row.identityToken);
        row.certificate = { id: syntheticUuid(20000 + posts.length), filename: body.filename, byteLength: syntheticSchoolPdf.length, sha256: body.sha256,
          presentedOn: body.presentedOn, expiresOn: body.expiresOn, recordedAt: '2026-09-14T15:10:10.123456+00:00' };
        row.historyCount++;
        if (failRefreshAfterSave) { failRead = 503; failRefreshAfterSave = false; }
        return route.fulfill({ status: 201, json: { ok: true, data: { version: 'family-schooling-register.v1', certificateId: row.certificate.id, duplicate: false } } });
      }
      if (resource === 'report') { reportRequests++; if (delayReport) { const pending = delayReport; delayReport = null; await pending; } }
      if (failRead) return route.fulfill({ status: failRead, json: { ok: false, code: failRead === 403 ? 'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED' : 'SCHOOL_CERTIFICATE_SERVICE_UNAVAILABLE' } });
      if (resource === 'download') return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'content-length': String(syntheticSchoolPdf.length), 'content-disposition': 'attachment; filename="certificado-sintetico.pdf"' }, body: syntheticSchoolPdf });
      const payload = structuredClone(dataset);
      if (resource === 'family') { payload.data.scope.cohort = 'contract_children'; payload.data.rows = payload.data.rows.filter(r => r.contractId === u.searchParams.get('contractId')); }
      return route.fulfill({ status: 200, json: payload });
    }
    let payload = { ok: true, data: [] };
    if (u.pathname === '/api/internal-auth') {
      authRequests++;
      payload = { ok: true, authenticated: true, user: { name: 'Operador QA', email: 'qa@example.invalid', role: 'ADMIN_INTERNO' },
        access: { tenantCapabilities: ['workforce.employee.read', 'workforce.summary.read', 'employee.record.propose'], platformCapabilities: [], platformRoles: [] } };
    } else if (resource === 'employees') payload = { ok: true, data: [employee], pagination: { page: 1, limit: 25, total: 1, pages: 1 },
      scope: { totalContracts: 1, totalPeople: 1, matched: 1, ambiguous: 0, unmatched: 0 }, facets: { sectors: [], organizations: [], agreements: [] } };
    else if (resource === 'employee') payload = { ok: true, data: { ...employee, employmentHistory: [], ausencias: [], licencias: [], familiares: [], movements: [], personas: { available: false } }, meta: {} };
    return route.fulfill({ status: 200, json: payload });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => errors.push(e.message)); page.on('download', download => downloads.push(download));
  const report = page.locator('#certificados-escolares'), status = report.locator('[data-fs-status]');
  const family = page.locator('[data-family-schooling-ficha]');
  async function consulted() {
    await report.locator('[data-fs-consult]').click();
    await page.waitForFunction(() => document.querySelector('[data-fs-status]')?.textContent.includes('Reporte consultado'));
  }
  async function familyReady() {
    await family.locator('[data-fs-family-refresh]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-family-schooling-ficha]')?.getAttribute('aria-busy') === 'false');
  }
  async function fillCertificate() {
    await family.locator('[data-fs-file]').setInputFiles({ name: 'certificado-sintetico.pdf', mimeType: 'application/pdf', buffer: syntheticSchoolPdf });
    await family.locator('[data-fs-presented]').fill('2026-04-04'); await family.locator('[data-fs-expires]').fill('2025-12-31');
  }
  async function savedOrFailed() { await page.waitForFunction(() => document.querySelector('[data-family-schooling-ficha]')?.getAttribute('aria-busy') === 'false'); }
  async function retained() {
    assert.equal(await family.locator('[data-fs-presented]').inputValue(), '2026-04-04');
    assert.equal(await family.locator('[data-fs-expires]').inputValue(), '2025-12-31');
    assert.equal(await family.locator('[data-fs-file]').evaluate(n => n.files[0]?.name), 'certificado-sintetico.pdf');
  }
  async function syntheticLabel() { await page.addStyleTag({ content: 'body:after,dialog:after{content:"QA · DATOS Y PDF SINTÉTICOS";position:fixed;right:8px;bottom:8px;z-index:999999;background:#123649;color:white;padding:8px;font:11px sans-serif}' }); }
  async function frameReport() {
    await page.evaluate(async () => { document.activeElement?.blur(); await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  }
  async function showEditor() {
    await page.evaluate(async () => { document.activeElement?.blur(); await document.fonts.ready; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    await family.locator('.fs-editor').evaluate(n => {
      const body = n.closest('.dialog-body'), dialog = n.closest('dialog'); dialog.scrollTop = 0;
      body.scrollTop += n.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
    });
    await page.waitForFunction(() => { const form = document.querySelector('.fs-editor'), body = form?.closest('.dialog-body'); return form && Math.abs(form.getBoundingClientRect().top - body.getBoundingClientRect().top - 12) < 3; });
  }

  await page.goto(origin + '/reportes-rrhh.html#certificados-escolares'); await report.locator('[data-fs-consult]').waitFor();
  assert.equal(reportRequests, 0); await consulted();
  assert.equal(await report.locator('[data-fs-contracts]').innerText(), '38'); assert.equal(await report.locator('[data-fs-children]').innerText(), '75');
  assert.equal(await report.locator('[data-fs-registered]').innerText(), '50'); assert.equal(await report.locator('tbody tr').count(), 50);
  assert.match(await report.innerText(), /ausente no permiten afirmar que no se presentó/);
  checks.push('actual report page queries an atomic synthetic cohort; distinct contracts, children and recorded certificates remain separate');
  await report.locator('[data-fs-search]').fill('0075'); assert.equal(await report.locator('tbody tr').count(), 1);
  assert.match(await report.locator('tbody').innerText(), /Hijo Sintético 0075/); checks.push('search covers children beyond the first visible page');
  await report.locator('[data-fs-reset]').click(); await report.locator('[data-fs-filter]').selectOption('unregistered');
  assert.equal(await report.locator('[data-fs-children]').innerText(), '25'); assert.equal(await report.locator('[data-fs-registered]').innerText(), '0');
  await report.locator('[data-fs-reset]').click();
  const excelEvent = page.waitForEvent('download'); await report.locator('[data-fs-export]').click(); const excel = await excelEvent;
  const excelPath = path.join(out, 'family-schooling-synthetic.xlsx'); await excel.saveAs(excelPath);
  const zip = unzipSync(fs.readFileSync(excelPath)); assert.equal((strFromU8(zip['xl/worksheets/sheet1.xml']).match(/<row /g) || []).length, 76);
  assert.match(strFromU8(zip['xl/worksheets/sheet2.xml']), /2026-08-06T18:15:21Z/); checks.push('real Excel download contains all 75 filtered rows, with provenance and no external workbook');
  await syntheticLabel(); await frameReport(); await page.screenshot({ path: path.join(out, 'family-schooling-report-desktop-qa.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await report.locator('[data-fs-search]').focus(); await page.keyboard.type('0075'); assert.equal(await report.locator('tbody tr').count(), 1);
  await frameReport(); await page.screenshot({ path: path.join(out, 'family-schooling-report-mobile-qa.png'), fullPage: true }); checks.push('report supports keyboard filtering, bounded mobile layout and reduced motion');
  await page.setViewportSize({ width: 1440, height: 1050 }); await report.locator('[data-fs-reset]').click();
  const beforeChanged = downloads.length; dataset.data.rows[0].sourceCutoff = '2026-08-06T19:15:21Z';
  await report.locator('[data-fs-export]').click(); await page.waitForFunction(() => document.querySelector('[data-fs-status]')?.textContent.includes('Los datos cambiaron'));
  assert.equal(downloads.length, beforeChanged); assert.equal(await report.locator('tbody tr').count(), 0); checks.push('same-day source timestamp change cancels export and clears obsolete rows');
  await consulted(); let release; delayReport = new Promise(resolve => release = resolve); const priorRequests = reportRequests, priorDownloads = downloads.length;
  const pendingRead = page.waitForRequest(r => r.url().includes('/api/internal-family-certificates?resource=report'));
  await report.locator('[data-fs-export]').click(); await pendingRead;
  await page.locator('#task-tab-biblioteca').click(); release();
  await page.locator('#task-tab-certificados-escolares').click();
  assert.match(await status.innerText(), /canceló al salir/); assert.equal(downloads.length, priorDownloads); assert.equal(reportRequests, priorRequests + 1);
  checks.push('leaving the report aborts pending revalidation and prevents a late download');
  failRead = 403; await report.locator('[data-fs-consult]').click(); await page.waitForFunction(() => document.querySelector('[data-fs-status]')?.textContent.includes('no tiene permiso'));
  assert.equal(await report.locator('tbody tr').count(), 0); assert.equal(await report.locator('[data-fs-result]').isVisible(), false);
  checks.push('revoked read permission clears names, counts and export'); failRead = 0; await consulted();
  dataset.data.storage.remainingBytes = 100; dataset.data.storage.usedBytes = dataset.data.storage.capacityBytes - 100;
  await report.locator('tbody a').first().click(); await familyReady();
  assert.equal(await page.locator('dialog[open]').count(), 1); assert.equal(await family.locator('.fs-child').count(), 2);
  assert.equal(new URL(page.url()).searchParams.get('contractId'), syntheticUuid(1)); checks.push('report opens the actual scoped employee dialog and its independent certificate panel');
  await family.locator('[data-fs-register]').first().focus(); await page.keyboard.press('Enter');
  assert.equal(await family.locator('[data-fs-file]').evaluate(n => n === document.activeElement), true);
  assert.equal(await page.locator('dialog dialog').count(), 0); await fillCertificate();
  assert.match(await family.locator('[data-fs-storage]').innerText(), /capacidad inicial limitada.*100 bytes/);
  assert.equal(await family.locator('[data-fs-file-storage]').isVisible(), true); assert.equal(await family.locator('[data-fs-save]').isEnabled(), true);
  await family.locator('[data-fs-file]').setInputFiles({ name: 'demasiado-grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2097153) });
  await family.locator('[data-fs-save]').click(); assert.equal(posts.length, 0); assert.match(await family.locator('[data-fs-form-status]').innerText(), /supera 2 MiB/);
  await fillCertificate(); postError = { status: 422, code: 'SCHOOL_CERTIFICATE_PDF_TOO_MANY_PAGES' };
  await family.locator('[data-fs-save]').click(); await savedOrFailed(); await retained();
  assert.match(await family.locator('[data-fs-form-status]').innerText(), /supera las 30 páginas/);
  checks.push('oversize file is blocked locally and a server page-limit error preserves PDF and manually entered dates');
  postError = { status: 503, code: 'SCHOOL_CERTIFICATE_SERVICE_UNAVAILABLE' }; await family.locator('[data-fs-save]').click(); await savedOrFailed(); await retained();
  const retryKey = posts.at(-1).key; assert.match(retryKey, /^[a-f0-9-]{36}$/);
  postError = { status: 409, code: 'SCHOOL_CERTIFICATE_SESSION_BUSY' }; await family.locator('[data-fs-save]').click(); await savedOrFailed(); await retained();
  assert.equal(posts.at(-1).key, retryKey); assert.match(await family.locator('[data-fs-form-status]').innerText(), /otra operación en curso/);
  assert.equal(await family.locator('[data-fs-recheck]').isVisible(), false); checks.push('transient failure and session contention preserve PDF/dates and retry the same idempotency key');
  postError = { status: 503, code: 'SCHOOL_CERTIFICATE_STORAGE_FULL' }; await family.locator('[data-fs-save]').click(); await savedOrFailed(); await retained();
  assert.equal(posts.at(-1).key, retryKey); assert.match(await family.locator('[data-fs-form-status]').innerText(), /no tiene espacio disponible/);
  assert.doesNotMatch(await family.locator('[data-fs-form-status]').innerText(), /no tiene permiso/);
  assert.equal(await family.locator('[data-fs-recheck]').isVisible(), true);
  checks.push('PDF above reported free space shows an advisory without blocking deduplication; STORAGE_FULL preserves the same draft and retry key');
  postError = { status: 409, code: 'SCHOOL_CERTIFICATE_IDENTITY_CHANGED' }; dataset.data.rows[0].identityToken = 'b'.repeat(64); dataset.data.rows[0].familyName = 'Hijo Sintético Revisado';
  await family.locator('[data-fs-save]').click(); await savedOrFailed(); assert.equal(await family.locator('[data-fs-save]').isDisabled(), true);
  await family.locator('[data-fs-recheck]').click(); await savedOrFailed(); await retained();
  assert.equal(await family.locator('[data-fs-save]').isDisabled(), true); assert.equal(await family.locator('[data-fs-identity-review]').isVisible(), true);
  await family.locator('[data-fs-confirm-identity]').click(); assert.equal(await family.locator('[data-fs-save]').isEnabled(), true); await retained();
  checks.push('identity conflict offers requery without lost input and requires explicit reviewed-child confirmation before saving');
  await syntheticLabel(); await page.setViewportSize({ width: 390, height: 844 }); await showEditor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(out, 'family-schooling-editor-mobile-qa.png') });
  await page.setViewportSize({ width: 1440, height: 1050 }); await showEditor();
  await page.screenshot({ path: path.join(out, 'family-schooling-editor-desktop-qa.png') });
  failRefreshAfterSave = true; await family.locator('[data-fs-save]').click(); await savedOrFailed();
  assert.equal(posts.at(-1).body.identityToken, 'b'.repeat(64)); assert.notEqual(posts.at(-1).key, retryKey);
  assert.equal(posts.at(-1).body.presentedOn, '2026-04-04'); assert.equal(posts.at(-1).body.expiresOn, '2025-12-31');
  assert.match(await family.locator('[data-fs-family-status]').innerText(), /Certificado guardado.*No pudimos actualizar/);
  assert.equal(await family.locator('[data-fs-file]').count(), 0); checks.push('valid save ACK stays confirmed when the following refresh fails; earlier expiry is retained exactly');
  failRead = 0; await family.locator('[data-fs-family-refresh]').click(); await savedOrFailed();
  assert.match(await family.innerText(), /Hijo Sintético Revisado/); const pdfEvent = page.waitForEvent('download');
  await family.locator('[data-fs-document]').first().click(); const pdfDownload = await pdfEvent; const pdfPath = path.join(out, 'family-schooling-synthetic.pdf'); await pdfDownload.saveAs(pdfPath);
  assert.deepEqual(fs.readFileSync(pdfPath), syntheticSchoolPdf); checks.push('registered PDF is downloaded only after access, type, length and SHA-256 checks');
  dataset.data.canRegister = false; await family.locator('[data-fs-family-refresh]').click(); await savedOrFailed();
  assert.equal(await family.locator('[data-fs-register]').count(), 0); assert.match(await family.innerText(), /Tu perfil permite consultar/);
  checks.push('authoritative canRegister false removes mutation controls despite a client propose capability');
  for (const remainingBytes of [1, 9]) {
    dataset.data.storage.remainingBytes = remainingBytes; dataset.data.storage.usedBytes = dataset.data.storage.capacityBytes - remainingBytes;
    await family.locator('[data-fs-family-refresh]').click(); await savedOrFailed();
    assert.equal(await family.locator('[data-fs-register]').count(), 0);
    assert.match(await family.locator('[data-fs-storage]').innerText(), /Sin espacio disponible/);
    assert.doesNotMatch(await family.innerText(), /La carga requiere permiso/);
  }
  checks.push('1 and 9 remaining bytes are correctly shown as insufficient storage, never a missing permission');
  dataset.data.storage.capacityBytes = 0; dataset.data.storage.remainingBytes = 0;
  await family.locator('[data-fs-family-refresh]').click(); await savedOrFailed();
  assert.equal(await family.locator('[data-fs-register]').count(), 0);
  assert.match(await family.locator('[data-fs-storage]').innerText(), /Sin espacio disponible.*PDF guardados/);
  assert.doesNotMatch(await family.innerText(), /La carga requiere permiso/); assert.equal(await family.locator('[data-fs-document]').count(), 2);
  await page.goto(origin + '/reportes-rrhh.html#certificados-escolares'); await consulted();
  assert.equal(await report.locator('[data-fs-children]').innerText(), '75'); assert.match(await report.locator('[data-fs-storage]').innerText(), /Sin espacio disponible/);
  dataset.data.storage = structuredClone(schoolingFixture().data.storage); dataset.data.canRegister = true;
  const capacityExcelEvent = page.waitForEvent('download'); await report.locator('[data-fs-export]').click(); const capacityExcel = await capacityExcelEvent;
  await capacityExcel.saveAs(excelPath);
  assert.equal((strFromU8(unzipSync(fs.readFileSync(excelPath))['xl/worksheets/sheet1.xml']).match(/<row /g) || []).length, 76);
  checks.push('exhausted or lowered shared quota preserves family documents/report/Excel; a storage-only or canRegister change never invalidates export');
  await report.locator('tbody a').first().click(); await familyReady();
  await family.locator('[data-fs-register]').first().click(); await fillCertificate();
  const postsBeforeBack = posts.length, authBeforeBack = authRequests;
  const navigation = page.waitForEvent('load'); await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); }); await navigation;
  await page.waitForFunction(() => document.querySelector('#employeeRows button'));
  assert.ok(authRequests > authBeforeBack); assert.equal(posts.length, postsBeforeBack); assert.equal(await page.locator('[data-fs-file]').count(), 0);
  checks.push('bfcache restore restarts normal session checks and never replays or retains an upload draft');
  assert.deepEqual(errors, []);
  assert.equal(publishedFailures.size, 0, 'PUBLISHED_ASSET_VERIFICATION_FAILED');
  if (publishedOrigin) assert.ok(publishedAssets.size > 0, 'PUBLISHED_ASSETS_NOT_VERIFIED');
  const result = { mode, origin, publishedAssetsMatch: publishedOrigin ? true : null, publishedAssetsChecked: [...publishedAssets].sort(),
    checksPassed: checks.length, checks, errors, syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false, serviceWorkersBlocked: true, browser: browser.version() };
  fs.writeFileSync(path.join(out, 'family-schooling-browser.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  const failure = { mode, origin, ok: false, publishedAssetsMatch: publishedOrigin ? false : null,
    publishedAssetsChecked: [...publishedAssets].sort(), failedPublicAssets: [...publishedFailures].sort(), checksPassed: checks.length,
    code: publishedFailures.size ? 'PUBLISHED_ASSET_VERIFICATION_FAILED' : 'BROWSER_SCENARIO_FAILED',
    syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false, serviceWorkersBlocked: true };
  fs.writeFileSync(path.join(out, 'family-schooling-browser.json'), JSON.stringify(failure, null, 2)); console.error(JSON.stringify(failure));
  throw error;
} finally { await browser.close(); }
