/** Browser contract QA with synthetic people/PDF only. Every API is intercepted. No backend is written.
 * Optional published mode fetches only public GET assets from the single allowed origin,
 * with no credentials or redirects, and requires exact equality with the local build. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';
import { schoolingFixtureV2 as schoolingFixture, syntheticUuid, syntheticSchoolPdf, syntheticSchoolHash } from '../tests/fixtures/family-schooling-synthetic.js';
import '../assets/app-routes.js';

const publishedOrigin = process.env.SCHOOLING_PUBLISHED_ORIGIN;
if (publishedOrigin !== undefined) assert.equal(publishedOrigin, 'https://municipio-junin-friendly.vercel.app', 'SCHOOLING_PUBLISHED_ORIGIN_NOT_ALLOWED');
const base = path.resolve('public'), out = path.resolve('verification'), origin = publishedOrigin ?? 'https://municontrol.test';
for (const asset of ['assets/family-schooling.js','assets/family-schooling-model.js','assets/family-schooling-export.js','assets/family-schooling.css']) {
  assert.ok(fs.existsSync(path.join(base, asset)) && fs.readFileSync(path.join(base, asset)).equals(fs.readFileSync(asset)), 'STALE_OR_MISSING_BUILD_ASSET: ' + asset);
}
const mode = publishedOrigin ? 'published_assets_with_synthetic_api' : 'local_build_with_synthetic_api';
fs.mkdirSync(out, { recursive: true });
const checks = [], errors = [], posts = [], downloads = [];
const publishedAssets = new Set(), publishedFailures = new Set();
let qaPage;
async function publicAsset(url, expected) {
  // Do not forward browser headers/cookies, use a bypass token, or follow a redirect.
  assert.equal(url.origin, 'https://municipio-junin-friendly.vercel.app');
  assert.ok(!url.pathname.startsWith('/api/'));
  // Read the canonical static shell directly; legacy URLs now redirect. Never
  // send the synthetic employee selection or any session information upstream.
  const knownRoute = globalThis.MuniControlRoutes.resolve(url.href, publishedOrigin);
  const assetUrl = new URL(knownRoute?.path || url.pathname, publishedOrigin);
  const response = await fetch(assetUrl.href, { method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) });
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
  publishedAssets.add(assetUrl.pathname); return actual;
}
let dataset = schoolingFixture(), failRead = 0, postError = null, failRefreshAfterSave = false, delayReport = null;
let reportRequests = 0, authRequests = 0, downloadRequests = 0;
let familyRequests = 0, authDenied = false, payrollAccess = false, wrongEmployee = false, wrongFamily = false;
let delayedEmployee = null, alternateEmployee = false;
let canDeclare = true, proposeCapability = true, childError = null, dropChildAck = false, contractToken = 'd'.repeat(64);
const declarations = [], declaredByKey = new Map();
const employee = { contractId: syntheticUuid(1), legajo: '000001', nombre: 'AGENTE SINTÉTICO 0001', companyId: 7,
  activo: true, liquidable: false, administrativeStatus: 'active', payrollStatus: 'not_liquidated', controlState: 'activo_no_incluido',
  crosswalkStatus: 'matched', sector: 'Sector QA', organizacion: 'Unidad QA', convenio: 'Convenio QA', cargo: 'Cargo QA' };
const secondEmployee = { ...employee, contractId: syntheticUuid(2), legajo: '000002', nombre: 'AGENTE SINTÉTICO 0002' };
const browser = await chromium.launch({ headless: true, ...(process.env.SCHOOLING_BROWSER_CHANNEL || process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.SCHOOLING_BROWSER_CHANNEL || process.env.CLOCK_BROWSER_CHANNEL } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'es-AR', acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    if (u.origin !== origin) return route.abort();
    if (!u.pathname.startsWith('/api/')) {
      if (request.method() !== 'GET') return route.abort();
      const pages = { '/nomina': 'nomina-control.html', '/personal': 'internal-dashboard.html', '/reportes': 'reportes-rrhh.html', '/acceso': 'login.html' };
      const file = path.resolve(base, pages[u.pathname] || '.' + decodeURIComponent(u.pathname));
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(file);
      if (publishedOrigin) {
        try { body = await publicAsset(u, body); }
        catch { publishedFailures.add(u.pathname); return route.abort(); }
      }
      return route.fulfill({ status: 200, contentType: file.endsWith('.js') || file.endsWith('.mjs') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream', body });
    }
    const resource = u.searchParams.get('resource');
    if (resource === 'employee' && delayedEmployee) {
      const pending = delayedEmployee; delayedEmployee = null; await pending;
      return route.fulfill({ status: 503, json: { ok: false, error: 'Demora sintética de la ficha anterior' } });
    }
    if (u.pathname === '/api/internal-family-certificates') {
      assert.equal(u.searchParams.get('version'), '2', 'UNIFIED_API_VERSION_REQUIRED');
      if (resource === 'download') downloadRequests++;
      if (request.method() === 'POST') {
        const body = request.postDataJSON(), key = request.headers()['idempotency-key']; posts.push({ body, key });
        if (postError) { const next = postError; postError = null; return route.fulfill({ status: next.status, json: { ok: false, code: next.code, error: 'Fallo sintético controlado' } }); }
        assert.ok(['grh','own'].includes(body.familyRef.kind)); assert.equal(body.sha256, syntheticSchoolHash);
        assert.deepEqual(Buffer.from(body.contentBase64, 'base64'), syntheticSchoolPdf);
        const row = dataset.data.rows.find(r => r.contractId === body.contractId && r.familyRef.kind === body.familyRef.kind && r.familyRef.id === body.familyRef.id);
        assert.equal(body.identityToken, row.identityToken);
        row.certificate = { id: syntheticUuid(20000 + posts.length), filename: body.filename, byteLength: syntheticSchoolPdf.length, sha256: body.sha256,
          presentedOn: body.presentedOn, expiresOn: body.expiresOn, recordedAt: '2026-09-14T15:10:10.123456+00:00' };
        row.historyCount++;
        if (failRefreshAfterSave) { failRead = 503; failRefreshAfterSave = false; }
        return route.fulfill({ status: 201, json: { ok: true, data: { version: 'family-schooling-register.v2', certificateId: row.certificate.id, duplicate: false } } });
      }
      if (resource === 'report') { reportRequests++; if (delayReport) { const pending = delayReport; delayReport = null; await pending; } }
      if (failRead) return route.fulfill({ status: failRead, json: { ok: false, code: failRead === 403 ? 'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED' : 'SCHOOL_CERTIFICATE_SERVICE_UNAVAILABLE' } });
      if (resource === 'download') return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'content-length': String(syntheticSchoolPdf.length), 'content-disposition': 'attachment; filename="certificado-sintetico.pdf"' }, body: syntheticSchoolPdf });
      const payload = structuredClone(dataset);
      if (resource === 'family') {
        familyRequests++; payload.data.scope.cohort = 'contract_children'; payload.data.rows = payload.data.rows.filter(r => r.contractId === u.searchParams.get('contractId'));
        if (wrongFamily && payload.data.rows.length) payload.data.rows[0].contractId = syntheticUuid(2);
      }
      payload.data.scope.unresolvedFamilyRows = payload.data.rows.filter(r => r.identityReviewRequired).length;
      return route.fulfill({ status: 200, json: payload });
    }
    if (u.pathname === '/api/internal-family-members') {
      if (request.method() === 'GET') {
        assert.equal(resource, 'context');
        const subjectEmployee = u.searchParams.get('contractId') === secondEmployee.contractId ? secondEmployee : employee;
        return route.fulfill({ status: 200, json: { ok: true, data: { version: 'employee-family-context.v1', canDeclare,
          subject: { contractId: subjectEmployee.contractId, legajo: subjectEmployee.legajo, employeeName: subjectEmployee.nombre,
            sourceCutoff: '2026-08-06T18:15:21Z', identityToken: contractToken } } } });
      }
      const body = request.postDataJSON(), key = request.headers()['idempotency-key']; declarations.push({ body, key });
      assert.deepEqual(Object.keys(body).sort(), ['birthDate','contractId','contractIdentityToken','dni','familyName','validFrom','validTo']);
      if (childError) { const next = childError; childError = null; return route.fulfill({ status: next.status, json: { ok: false, code: next.code } }); }
      assert.equal(body.contractIdentityToken, contractToken);
      const previous = declaredByKey.get(key);
      if (previous) {
        assert.deepEqual(previous.body, body);
        return route.fulfill({ status: 200, json: { ok: true, data: { ...previous.result, duplicate: true } } });
      }
      const ref = { kind: 'own', id: syntheticUuid(30000 + declaredByKey.size) }, recordedAt = '2026-09-15T03:00:00.123456Z', identityToken = 'e'.repeat(64);
      const row = { ...structuredClone(dataset.data.rows[0]), familyRef: ref, contractId: body.contractId, familyName: body.familyName,
        birthDate: body.birthDate, validFrom: body.validFrom, familyEndDate: body.validTo, familyRecordedAt: recordedAt, declarationState: 'declared',
        identityReviewRequired: false, identityToken, certificate: null, historyCount: 0 };
      dataset.data.rows.push(row);
      const result = { version: 'employee-family-declare.v1', familyRef: ref, identityToken, recordedAt, state: 'declared', duplicate: false };
      declaredByKey.set(key, { body, result });
      if (dropChildAck) { dropChildAck = false; return route.abort('timedout'); }
      return route.fulfill({ status: 201, json: { ok: true, data: result } });
    }
    let payload = { ok: true, data: [] };
    if (u.pathname === '/api/internal-auth') {
      authRequests++;
      if (authDenied) return route.fulfill({ status: 401, json: { ok: false, authenticated: false } });
      payload = { ok: true, authenticated: true, user: { name: 'Operador QA', email: 'qa@example.invalid', role: 'ADMIN_INTERNO' },
        access: { tenantCapabilities: ['workforce.employee.read', 'workforce.summary.read', ...(proposeCapability ? ['employee.record.propose'] : []), ...(payrollAccess ? ['payroll.read'] : [])], platformCapabilities: [], platformRoles: [] } };
    } else if (resource === 'employees') payload = { ok: true, data: alternateEmployee ? [employee, secondEmployee] : [employee], pagination: { page: 1, limit: 25, total: alternateEmployee ? 2 : 1, pages: 1 },
      scope: { totalContracts: 1, totalPeople: 1, matched: 1, ambiguous: 0, unmatched: 0 }, facets: { sectors: [], organizations: [], agreements: [] } };
    else if (resource === 'employee') payload = { ok: true, data: { ...(alternateEmployee && u.searchParams.get('contractId') === secondEmployee.contractId ? secondEmployee : employee), ...(wrongEmployee ? { contractId: syntheticUuid(2) } : {}), employmentHistory: [], ausencias: [], licencias: [], familiares: [], movements: [], personas: { available: false } }, meta: {} };
    return route.fulfill({ status: 200, json: payload });
  });
  const page = await context.newPage(); qaPage = page; page.setDefaultTimeout(12000);
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
  assert.equal(await report.locator('.fs-table').evaluate(n => getComputedStyle(n).display), 'table');
  const expiredRow = report.locator('tbody tr').filter({ hasText: 'Hijo Sintético 0003' });
  assert.equal(await expiredRow.locator('.fs-pill.warning').count(), 1);
  assert.match(await expiredRow.locator('.fs-pill.warning').innerText(), /Vencimiento informado superado/);
  assert.equal(await report.locator('tbody tr').filter({ hasText: 'Hijo Sintético 0002' }).locator('.fs-pill.warning').count(), 0);
  checks.push('expired certificate uses the warning state while an undated certificate does not; desktop retains table layout');
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await report.locator('[data-fs-search]').focus(); await page.keyboard.type('0075'); assert.equal(await report.locator('tbody tr').count(), 1);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await report.locator('tbody tr').evaluate(row => ({
      tableFits: row.closest('.fs-table-wrap').scrollWidth <= row.closest('.fs-table-wrap').clientWidth + 1,
      fields: [...row.querySelectorAll('td,button,a')].map(n => { const r = n.getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width}; }),
      labels: [...row.querySelectorAll('td')].map(n => n.textContent),
    }));
    assert.equal(bounds.tableFits, true);
    assert.ok(bounds.fields.every(b => b.left >= 0 && b.right <= width + 1 && b.width > 0));
    assert.ok(bounds.labels.some(label => /Presentación registrada/.test(label)));
    assert.ok(bounds.labels.some(label => /Vencimiento registrado/.test(label)));
    assert.equal(await report.getByRole('table').count(), 1);
    assert.equal(await report.getByRole('row').count(), 2);
    assert.equal(await report.getByRole('cell').count(), 6);
  }
  const mobilePdfEvent = page.waitForEvent('download');
  await report.getByRole('button', { name: 'Descargar certificado PDF de Hijo Sintético 0075', exact: true }).click();
  const mobilePdf = await mobilePdfEvent, mobilePdfPath = path.join(out, 'family-schooling-mobile-synthetic.pdf');
  await mobilePdf.saveAs(mobilePdfPath);
  assert.deepEqual(fs.readFileSync(mobilePdfPath), syntheticSchoolPdf);
  checks.push('320px and 390px cards expose all six labelled fields and actions without horizontal scrolling; mobile PDF download preserves exact bytes');
  await frameReport(); await page.screenshot({ path: path.join(out, 'family-schooling-report-mobile-qa.png'), fullPage: true }); checks.push('report supports keyboard filtering, bounded mobile layout and reduced motion');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await report.locator('.fs-table').evaluate(n => getComputedStyle(n).display), 'table');
  assert.equal(await report.locator('.fs-table thead').evaluate(n => getComputedStyle(n).position), 'static');
  await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
  checks.push('printing at mobile width retains the tabular report with its visible header');
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

  dataset = schoolingFixture(); const postsBeforeNavigation = posts.length;
  const targetUrl = origin + '/internal-dashboard.html?contractId=' + syntheticUuid(1) + '&section=family&familyId=2#legajos';
  async function visit(url) { return page.url() === url ? page.reload() : page.goto(url); }
  async function exactChildVisible() {
    await familyReady();
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    const target = family.locator('[data-fs-family-id="2"]');
    assert.equal(await target.evaluate(n => n === document.activeElement), true);
    const bounded = await target.evaluate(n => { const r=n.getBoundingClientRect(), body=n.closest('.dialog-body').getBoundingClientRect(); return r.top>=body.top-1 && r.top<body.bottom && r.left>=body.left && r.right<=body.right+1; });
    if (!bounded) await page.screenshot({ path: path.join(out, 'family-schooling-target-layout-failure-qa.png') });
    assert.equal(bounded, true, JSON.stringify(await target.evaluate(n => {const body=n.closest('.dialog-body'),dialog=n.closest('dialog');return {card:n.getBoundingClientRect().toJSON(),body:body.getBoundingClientRect().toJSON(),bodyScroll:body.scrollTop,dialogScroll:dialog.scrollTop,dialog:dialog.getBoundingClientRect().toJSON()};}))); assert.equal(await page.locator('dialog[open]').count(), 1);
    assert.equal(await family.locator('[data-fs-file]').count(), 0);
  }
  await page.goto(origin + '/reportes-rrhh.html#certificados-escolares'); await consulted();
  await report.locator('[data-fs-search]').fill('Hijo Sintético 0002');
  await report.locator('tbody a').first().click(); await exactChildVisible();
  assert.equal(new URL(page.url()).searchParams.get('familyId'), '2');
  assert.equal(await family.locator('[data-fs-add-child]').isVisible(), true);
  assert.equal(await page.locator('.fs-source-history').getAttribute('open'), null);
  await syntheticLabel(); await page.screenshot({ path: path.join(out, 'family-schooling-target-desktop-qa.png') });
  checks.push('filtered report opens and focuses its exact child inside the authorized employee dialog without starting an upload');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => innerWidth === 390 && matchMedia('(max-width:700px)').matches);
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  await visit(targetUrl); await exactChildVisible();
  await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('dialog[open]'))), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await syntheticLabel(); await page.screenshot({ path: path.join(out, 'family-schooling-target-mobile-qa.png') });
  checks.push('exact-child navigation remains within the mobile viewport and the existing dialog focus trap');

  for (const familyId of ['999', '3', 'invalid']) {
    await page.goto(targetUrl.replace('familyId=2', 'familyId=' + familyId)); await familyReady();
    const missing = family.locator('[data-fs-target-status]'); assert.equal(await missing.isVisible(), true);
    assert.match(await missing.innerText(), /no aparece.*no se seleccionó otro hijo/);
    assert.equal(await missing.evaluate(n => n === document.activeElement), true);
    assert.equal(await family.locator('[data-fs-file]').count(), 0);
  }
  await page.goto(targetUrl.replace('familyId=2', 'familyId=2&familyId=1')); await page.locator('#employeeRows button').first().waitFor();
  assert.equal(await page.locator('dialog[open]').count(), 0);
  checks.push('missing, other-contract and invalid child references show a clear notice; ambiguous query parameters never open a selection');
  wrongEmployee = true; const beforeWrongEmployee = familyRequests;
  await visit(targetUrl); await page.locator('#dialogBody .notice.error').waitFor();
  assert.equal(familyRequests, beforeWrongEmployee); assert.equal(await family.count(), 0); wrongEmployee = false;
  wrongFamily = true; await visit(targetUrl); await familyReady();
  assert.equal(await family.locator('.fs-child').count(), 0); assert.match(await family.locator('[data-fs-family-status]').innerText(), /No se pudo verificar/); wrongFamily = false;
  checks.push('a mismatched employee or family response cannot open certificates from a different contract');

  const lowerContract = 'abcdef01-0000-4000-8000-000000000001';
  employee.contractId = lowerContract; dataset.data.rows.slice(0, 2).forEach(row => row.contractId = lowerContract);
  await visit(targetUrl.replace(syntheticUuid(1), lowerContract.toUpperCase())); await exactChildVisible();
  employee.contractId = syntheticUuid(1); dataset = schoolingFixture();
  checks.push('valid uppercase PostgreSQL UUID links reach the same canonical employee and exact child');

  alternateEmployee = true; await page.goto(origin + '/internal-dashboard.html#legajos');
  await page.locator('#employeeRows').getByRole('button', { name: 'Ver ficha', exact: true }).nth(1).waitFor();
  let releaseOldEmployee; delayedEmployee = new Promise(resolve => releaseOldEmployee = resolve);
  const oldRequest = page.waitForRequest(r => new URL(r.url()).searchParams.get('resource') === 'employee');
  await page.locator('#employeeRows').getByRole('button', { name: 'Ver ficha', exact: true }).first().click(); await oldRequest;
  await page.keyboard.press('Escape');
  await page.locator('#employeeRows').getByRole('button', { name: 'Hijos y certificados', exact: true }).nth(1).click(); await familyReady();
  releaseOldEmployee(); await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  assert.equal(await page.locator('#dialogTitle').innerText(), secondEmployee.nombre);
  assert.deepEqual(await family.locator('[data-fs-family-id]').evaluateAll(nodes => nodes.map(n => n.dataset.fsFamilyId)), ['3', '4']);
  assert.equal(await page.locator('#dialogBody .notice.error').count(), 0); alternateEmployee = false;
  checks.push('closing a delayed employee and opening another preserves the new dialog when the old request fails');

  authDenied = true; const beforeAuth = familyRequests; await visit(targetUrl);
  await page.waitForURL(u => ['/acceso', '/login.html'].includes(u.pathname));
  const next = new URL(new URL(page.url()).searchParams.get('next'), origin);
  assert.equal(next.searchParams.get('contractId'), syntheticUuid(1)); assert.equal(next.searchParams.get('familyId'), '2');
  assert.equal(next.searchParams.get('section'), 'family'); assert.equal(familyRequests, beforeAuth);
  authDenied = false; await page.goto(next.href); await exactChildVisible();
  checks.push('an expired session preserves the validated child destination and rechecks access before reopening it');

  await page.goto(origin + '/internal-dashboard.html#legajos'); await page.locator('#employeeRows button').first().waitFor();
  await page.locator('#employeeSearch').fill('000001'); await page.locator('#employeeFilters').evaluate(n => n.requestSubmit());
  await page.locator('#employeeRows').getByRole('button', { name: 'Hijos y certificados', exact: true }).first().click(); await familyReady();
  assert.equal(await page.locator('#employeeFamilyTitle').evaluate(n => n === document.activeElement), true);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#employeeSearch').inputValue(), '000001'); assert.equal(await page.locator('#statusFilter').inputValue(), 'administrative_active');
  await page.locator('#employeeRows').getByRole('button', { name: 'Ver ficha', exact: true }).click(); await familyReady();
  await page.locator('.employee-quick-actions').getByRole('button', { name: 'Hijos y certificados', exact: true }).click();
  assert.equal(await page.locator('#employeeFamilyTitle').evaluate(n => n === document.activeElement), true);
  checks.push('Personas and the employee quick actions reach certificates without replacing roster filters or duplicating dialogs');

  payrollAccess = true; await page.goto(origin + '/nomina-control.html');
  await page.locator('.page-head').getByRole('link', { name: 'Hijos y certificados', exact: true }).click();
  await report.locator('[data-fs-consult]').waitFor(); assert.equal(new URL(page.url()).hash, '#certificados-escolares');
  assert.equal(posts.length, postsBeforeNavigation); payrollAccess = false;
  checks.push('Nómina exposes a visible mobile entry to the certificate report; all navigation remains read-only');

  // Own declarations: simulated server persistence is independent of PDF state.
  dataset = schoolingFixture();
  const ownUrl = origin + '/personal?contractId=' + syntheticUuid(1) + '&section=family#legajos';
  const childField = name => family.locator('[data-fs-child-field="' + name + '"]');
  const childSubmit = family.locator('[data-fs-child-save]'), childStatus = family.locator('[data-fs-child-status]');
  proposeCapability = false; await page.goto(ownUrl); await familyReady();
  assert.equal(await family.locator('[data-fs-add-child]').isVisible(), false);
  assert.equal(await family.locator('[data-fs-register]').count(), 0);
  proposeCapability = true; canDeclare = false; await page.reload(); await familyReady();
  assert.equal(await family.locator('[data-fs-add-child]').isDisabled(), true);
  assert.match(await family.locator('[data-fs-create-status]').innerText(), /No permite agregar hijos/);
  canDeclare = true;
  dataset.data.storage.capacityBytes = 0; dataset.data.storage.remainingBytes = 0; dataset.data.canRegister = false;
  await family.locator('[data-fs-family-refresh]').click(); await savedOrFailed();
  await family.locator('[data-fs-add-child]').click();
  assert.equal(await childField('familyName').evaluate(n => n === document.activeElement), true);
  await childField('familyName').fill('Hija Declarada QA');
  await page.setViewportSize({ width: 390, height: 844 }); await syntheticLabel(); await showEditor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(out, 'family-schooling-declaration-mobile-qa.png') });
  await page.setViewportSize({ width: 1440, height: 1050 }); await showEditor();
  await page.screenshot({ path: path.join(out, 'family-schooling-declaration-desktop-qa.png') });
  dropChildAck = true;
  await childSubmit.click(); await savedOrFailed();
  assert.equal(dataset.data.rows.filter(r => r.familyRef.kind === 'own').length, 1);
  assert.equal(await childField('familyName').inputValue(), 'Hija Declarada QA');
  assert.equal(await childField('birthDate').inputValue(), '');
  const attempt = declarations.at(-1);
  assert.deepEqual([attempt.body.birthDate,attempt.body.dni,attempt.body.validFrom,attempt.body.validTo], [null,null,null,null]);
  assert.match(await childStatus.innerText(), /formulario permanece abierto/);
  await childSubmit.click(); await savedOrFailed();
  assert.equal(declarations.at(-1).key, attempt.key); assert.deepEqual(declarations.at(-1).body, attempt.body);
  assert.equal(dataset.data.rows.filter(r => r.familyRef.kind === 'own').length, 1);
  assert.equal(await childField('familyName').count(), 0);
  const ownRef = declaredByKey.get(attempt.key).result.familyRef;
  const ownCard = family.locator('[data-fs-family-kind="own"][data-fs-family-id="' + ownRef.id + '"]');
  assert.match(await ownCard.innerText(), /Declarado en MuniControl/);
  assert.equal(await ownCard.locator('[data-fs-register]').count(), 0);
  assert.equal(await page.locator('.fs-source-history').getAttribute('open'), null);
  assert.doesNotMatch(await family.innerText(), /La respuesta no incluyó familiares asociados/);
  checks.push('minimum name-only declaration works with exhausted PDF quota; a timed-out ACK replays identical data/key and creates exactly one own child');
  checks.push('declaration permission is verified independently on server context; absent propose authority hides both mutation paths');
  dataset.data.storage = structuredClone(schoolingFixture().data.storage); dataset.data.canRegister = true;
  await family.locator('[data-fs-family-refresh]').click(); await savedOrFailed();
  await ownCard.locator('[data-fs-register]').click(); await fillCertificate();
  postError = { status: 422, code: 'SCHOOL_CERTIFICATE_PDF_INVALID' };
  await family.locator('[data-fs-save]').click(); await savedOrFailed(); await retained();
  assert.match(await family.locator('[data-fs-form-status]').innerText(), /alta del hijo sigue guardada/);
  assert.equal(dataset.data.rows.filter(r => r.familyRef.kind === 'own').length, 1);
  await showEditor(); await page.screenshot({ path: path.join(out, 'family-schooling-own-pdf-error-qa.png') });
  await family.locator('[data-fs-save]').click(); await savedOrFailed();
  assert.deepEqual(posts.at(-1).body.familyRef, ownRef);
  assert.equal(await ownCard.locator('[data-fs-document]').count(), 1);
  assert.match(await family.locator('[data-fs-family-status]').innerText(), /Certificado guardado/);
  await ownCard.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'family-schooling-own-certificate-qa.png') });
  checks.push('declared child flows into an explicitly scoped v2 certificate; a PDF error retains both the persisted child and the PDF draft before successful retry');

  const staleDownload = await ownCard.locator('[data-fs-document]').elementHandle();
  failRead = 403; const beforeRevokedDownload = downloads.length;
  await ownCard.locator('[data-fs-document]').click(); await savedOrFailed();
  assert.equal(downloads.length, beforeRevokedDownload); assert.equal(await family.locator('.fs-child').count(), 0);
  assert.equal(await family.locator('[data-fs-document]').count(), 0); assert.equal(await family.locator('[data-fs-add-child]').isDisabled(), true);
  assert.equal(await family.locator('[data-fs-storage]').isVisible(), false);
  const deniedDownloadRequests = downloadRequests;
  await staleDownload.evaluate(n => n.click()); assert.equal(downloadRequests, deniedDownloadRequests);
  await family.locator('[data-fs-family-refresh]').click(); await savedOrFailed(); assert.equal(await family.locator('.fs-child').count(), 0);
  failRead = 0; await family.locator('[data-fs-family-refresh]').click(); await savedOrFailed();
  assert.equal(await ownCard.locator('[data-fs-document]').count(), 1);
  checks.push('403 during PDF download clears consulted names, documents, storage and mutation authority; even the detached old action cannot request another download before revalidation');

  await ownCard.locator('[data-fs-register]').click(); await fillCertificate();
  postError = { status: 403, code: 'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED' };
  await family.locator('[data-fs-save]').click(); await savedOrFailed(); await retained();
  const revokedUploadKey = posts.at(-1).key;
  assert.equal(await family.locator('.fs-child').count(), 0); assert.equal(await family.locator('[data-fs-document]').count(), 0);
  assert.equal(await family.locator('[data-fs-save]').isDisabled(), true);
  assert.match(await family.locator('.fs-editor h4').innerText(), /Carga de certificado pendiente/);
  failRead = 403; await family.locator('[data-fs-recheck]').click(); await savedOrFailed(); await retained();
  assert.equal(await family.locator('[data-fs-save]').isDisabled(), true); assert.equal(await family.locator('.fs-child').count(), 0);
  failRead = 0; await family.locator('[data-fs-recheck]').click(); await savedOrFailed(); await retained();
  assert.equal(await family.locator('[data-fs-save]').isEnabled(), true);
  await family.locator('[data-fs-save]').click(); await savedOrFailed(); assert.equal(posts.at(-1).key, revokedUploadKey);
  checks.push('403 during upload keeps only its local PDF/dates and exact target draft, disables saving, and requires a successful fresh read before the same-key retry');

  await family.locator('[data-fs-add-child]').click(); await childField('familyName').fill('Otro Vínculo QA');
  childError = { status: 403, code: 'EMPLOYEE_FAMILY_CAPABILITY_REQUIRED' };
  await childSubmit.click(); await savedOrFailed(); const permissionKey = declarations.at(-1).key;
  assert.equal(await childSubmit.isDisabled(), true); assert.equal(await childField('familyName').inputValue(), 'Otro Vínculo QA');
  await family.locator('[data-fs-child-recheck]').click(); await savedOrFailed(); assert.equal(await childSubmit.isEnabled(), true);
  childError = { status: 409, code: 'EMPLOYEE_FAMILY_IDENTITY_CHANGED' }; contractToken = 'c'.repeat(64);
  await childSubmit.click(); await savedOrFailed();
  assert.equal(declarations.at(-1).key, permissionKey);
  await family.locator('[data-fs-child-recheck]').click(); await savedOrFailed();
  assert.equal(await childSubmit.isDisabled(), true); assert.equal(await childField('familyName').inputValue(), 'Otro Vínculo QA');
  assert.match(await childStatus.innerText(), /identidad del legajo cambió.*no se trasladó/);
  assert.equal(dataset.data.rows.filter(r => r.familyRef.kind === 'own').length, 1);
  await family.locator('[data-fs-child-cancel]').click(); contractToken = 'd'.repeat(64);
  checks.push('revoked permission preserves the declaration draft and retry key; a reassigned employee identity cannot receive the old draft after requery');

  // Matching source records are reviewed separately; never merged or counted as distinct verified children.
  dataset.data.rows[0].identityReviewRequired = true;
  dataset.data.rows.at(-1).identityReviewRequired = true;
  await page.goto(origin + '/reportes#certificados-escolares'); await consulted();
  assert.equal(await report.locator('[data-fs-children]').innerText(), '74');
  assert.match(await report.locator('[data-fs-review-count]').innerText(), /2/);
  const ownExportEvent = page.waitForEvent('download'); await report.locator('[data-fs-export]').click();
  const ownExport = await ownExportEvent; const ownXlsxPath = path.join(out, 'family-schooling-own-synthetic.xlsx'); await ownExport.saveAs(ownXlsxPath);
  const ownZip = unzipSync(fs.readFileSync(ownXlsxPath)), ownSheet = strFromU8(ownZip['xl/worksheets/sheet1.xml']);
  assert.match(ownSheet, /Hija Declarada QA/); assert.match(ownSheet, /2026-09-15T03:00:00.123456Z/);
  assert.match(ownSheet, /2026-08-06T18:15:21Z/); assert.doesNotMatch(ownSheet, new RegExp(ownRef.id));
  await report.locator('[data-fs-search]').fill('Hija Declarada QA');
  const href = await report.locator('tbody a').first().getAttribute('href');
  assert.equal(new URL(href, origin).searchParams.get('familyKind'), 'own');
  await report.locator('tbody a').first().click(); await familyReady();
  assert.equal(await ownCard.evaluate(n => n === document.activeElement), true);
  assert.match(await ownCard.innerText(), /Coincidencia por revisar/);
  const ownDestination = page.url(); authDenied = true; await page.reload();
  await page.waitForURL(u => ['/acceso','/login.html'].includes(u.pathname));
  const ownNext = new URL(new URL(page.url()).searchParams.get('next'), origin);
  assert.equal(ownNext.searchParams.get('familyKind'), 'own'); assert.equal(ownNext.searchParams.get('familyId'), ownRef.id);
  authDenied = false; await page.goto(ownNext.href); await familyReady();
  assert.equal(await ownCard.evaluate(n => n === document.activeElement), true);
  await page.goto(ownDestination.replace('familyKind=own', 'familyKind=grh')); await familyReady();
  assert.equal(await family.locator('[data-fs-target-status]').isVisible(), true);
  checks.push('unified report and Excel preserve declaration date separately from GRH cutoff; suspected matches are flagged without merging/counting them as distinct verified children');
  checks.push('own deep links retain their discriminator through login, focus the exact own child, and never reinterpret an own UUID as a GRH family');
  assert.deepEqual(errors, []);
  assert.equal(publishedFailures.size, 0, 'PUBLISHED_ASSET_VERIFICATION_FAILED');
  if (publishedOrigin) assert.ok(publishedAssets.size > 0, 'PUBLISHED_ASSETS_NOT_VERIFIED');
  const result = { mode, origin, publishedAssetsMatch: publishedOrigin ? true : null, publishedAssetsChecked: [...publishedAssets].sort(),
    checksPassed: checks.length, checks, errors, syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false, serviceWorkersBlocked: true, browser: browser.version() };
  fs.writeFileSync(path.join(out, 'family-schooling-browser.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  if (qaPage && !qaPage.isClosed()) await qaPage.screenshot({ path: path.join(out, 'family-schooling-navigation-failure-qa.png') }).catch(() => {});
  const failure = { mode, origin, ok: false, publishedAssetsMatch: publishedOrigin ? false : null,
    publishedAssetsChecked: [...publishedAssets].sort(), failedPublicAssets: [...publishedFailures].sort(), checksPassed: checks.length,
    code: publishedFailures.size ? 'PUBLISHED_ASSET_VERIFICATION_FAILED' : 'BROWSER_SCENARIO_FAILED',
    syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false, serviceWorkersBlocked: true };
  fs.writeFileSync(path.join(out, 'family-schooling-browser.json'), JSON.stringify(failure, null, 2)); console.error(JSON.stringify(failure));
  throw error;
} finally { await browser.close(); }
