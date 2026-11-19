// Focal regression QA: a source-legajo history must withdraw private data after
// a denied later page. Local built assets, fictional responses and GET only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {absenceWorkspaceAnalytics, absenceWorkspaceEvents} from '../tests/fixtures/absence-workspace-synthetic.js';

const root = path.resolve(import.meta.dirname, '..');
const base = path.join(root, 'public');
const out = path.join(root, 'verification', 'absence-exact-history');
fs.mkdirSync(out, {recursive: true});
const origin = 'https://absence-exact-history.invalid';
const snapshot = 'a'.repeat(64), personName = 'IdentidadFocalRetirada', privateReason = 'MotivoFocalRetirado';
const person = {contractId: null, companyId: 101, legajo: '27', name: personName, sector: 'Sector de prueba', events: 51, sourceDeclaredDays: 51, reportedDaysEvents: 51, distinctReasons: 1, topReason: 'Licencia de prueba', lastEventDate: '2026-09-08'};
const browser = await chromium.launch({headless: true});
const checks = [], errors = [], requests = [], layoutFailures = [];
try {
  for (const denial of [null, 401, 403, 'snapshot']) {
    const context = await browser.newContext({viewport: {width: 1366, height: 1000}, locale: 'es-AR', reducedMotion: 'reduce', serviceWorkers: 'block'});
    // La pantalla tiene pestañas: el ranking de personas y su historial viven en «Personas».
    await context.addInitScript(() => { try { localStorage.setItem('mc.ausentismo.tab', 'personas'); } catch {} });
    let exactReads = 0;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), q = url.searchParams;
      if (url.origin !== origin) return route.abort();
      assert.equal(request.method(), 'GET', 'Focal QA must not mutate business data');
      if (!url.pathname.startsWith('/api/')) {
        const file = path.resolve(base, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status: 404, body: ''});
        return route.fulfill({status: 200, body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'});
      }
      const resource = q.get('resource');
      requests.push({denial, resource, companyId: q.get('companyId'), legajo: q.get('legajo'), page: q.get('page')});
      const send = (data, status = 200) => route.fulfill({status, json: data, headers: {'Cache-Control': 'private, no-store'}});
      if (url.pathname === '/api/internal-auth') return send({ok: true, authenticated: true, sessionVersion: 2, user: {id: 'focal-user', name: 'Usuario de prueba', email: 'qa@example.invalid'}, access: {tenant: {id: 'focal-tenant'}, tenantCapabilities: ['absence.analytics.read', 'absence.nominal.read', 'workforce.employee.read', 'lineage.read'], platformRoles: [], platformCapabilities: []}});
      if (resource === 'absenceanalytics') return send(absenceWorkspaceAnalytics(q));
      if (resource === 'absencepeople') return send({ok: true, data: [person], order: 'events', limit: 10, meta: {snapshot}});
      if (resource === 'absenceevents' && q.has('legajo')) {
        exactReads++;
        assert.equal(q.get('companyId'), '101');
        assert.equal(q.get('legajo'), '27');
        assert.equal(q.get('limit'), '50');
        assert.equal(q.get('from'), '2026-08-01');
        assert.equal(q.get('to'), '2026-09-10');
        assert.ok(!q.get('search') && !q.get('contractId') && !q.has('bucket'));
        const page = Number(q.get('page'));
        assert.equal(page, exactReads);
        if (page === 2 && Number.isInteger(denial)) return send({ok: false, code: denial === 401 ? 'INTERNAL_SESSION_REQUIRED' : 'TENANT_CAPABILITY_REQUIRED'}, denial);
        assert.ok(page === 1 || page === 2, 'No unbounded pagination');
        const data = Array.from({length: page === 1 ? 50 : 1}, () => ({...person, eventDate: '2026-09-08', untilDate: '2026-09-08', reason: privateReason, sourceDeclaredDays: 1}));
        return send({ok: true, data, pagination: {page, limit: 50, total: 51, pages: 2}, meta: {snapshot: page === 2 && denial === 'snapshot' ? 'b'.repeat(64) : snapshot, detailScope: 'exact_source_legajo'}});
      }
      if (resource === 'absenceevents') {
        const value = absenceWorkspaceEvents(q);
        value.meta = {snapshot};
        value.range = {requested: {from: q.get('from'), to: q.get('to')}, effective: {from: q.get('from'), to: q.get('to')}, clamped: {from: false, to: false}};
        return send(value);
      }
      return send({ok: true, resource, data: []});
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/ausentismo-control.html?from=2026-08-01&to=2026-09-10');
    const open = page.getByRole('button', {name: 'Ver historial de ' + personName, exact: true});
    await open.waitFor();
    await open.click();
    const dialog = page.locator('.ab-history');
    await dialog.getByRole('status').filter({hasText: 'Mostrando 50 de 51'}).waitFor();
    assert.equal(await dialog.locator('tbody tr').count(), 50);
    if (denial === null) {
      await dialog.screenshot({path: path.join(out, 'exact-history-desktop.png')});
      await page.setViewportSize({width: 390, height: 844});
      await dialog.screenshot({path: path.join(out, 'exact-history-mobile.png')});
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1, {}, {timeout: 5000}).catch(async () => {
        const diagnostic = await page.evaluate(() => ({width: innerWidth, documentWidth: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].map(e => ({tag: e.tagName, id: e.id, className: e.className, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, width: e.getBoundingClientRect().width})).filter(r => r.right > innerWidth + 1 && r.width > 0).slice(0, 25)}));
        fs.writeFileSync(path.join(out, 'overflow-diagnostic.json'), JSON.stringify(diagnostic, null, 2));
        layoutFailures.push(diagnostic);
      });
      if (!layoutFailures.length) checks.push('A populated ranking and source history fit a 390-pixel viewport without document overflow.');
    }
    await dialog.getByRole('button', {name: 'Ver más', exact: true}).click();
    if (denial === null) {
      await dialog.getByRole('status').filter({hasText: 'Mostrando 51 de 51'}).waitFor();
      assert.equal(await dialog.locator('tbody tr').count(), 51);
      assert.equal(await dialog.getByRole('button', {name: 'Ver más', exact: true}).isVisible(), false);
      assert.equal(exactReads, 2);
      checks.push('Unlinked source history retains exact company 101, legajo 27, dates and snapshot across 50 + 1 rows.');
    } else {
      await page.waitForFunction(({name, reason}) => !document.body.textContent.includes(name) && !document.body.textContent.includes(reason), {name: personName, reason: privateReason}, {timeout: 5000});
      assert.equal(await page.locator('.ab-history tbody tr').count(), 0);
      assert.equal(await page.getByRole('button', {name: 'Ver historial de ' + personName, exact: true}).count(), 0);
      assert.equal(exactReads, 2);
      checks.push((denial === 'snapshot' ? 'A changed snapshot' : 'HTTP ' + denial) + ' on page two removes the earlier nominal identity, ranking entry and all history rows.');
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  const result = {version: 'absence-exact-history-focal-qa.v1', checkedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), passed: layoutFailures.length === 0, checksPassed: checks.length, checks, requests, errors, layoutFailures, syntheticApi: true, municipalSessionTested: false, businessWrites: 0, browser: browser.version()};
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  assert.deepEqual(layoutFailures, [], 'The populated ranking or source history overflows the mobile viewport');
} finally {
  await browser.close();
}
