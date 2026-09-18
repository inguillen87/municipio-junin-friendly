/** Synthetic action-history UX: every API is intercepted; no municipal session or write. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { historyCapabilities, historyIds, actionHistoryFixture, actionHistoryBootstrap } from '../tests/fixtures/action-history-synthetic.js';

const publishedOrigin = process.env.ACTION_HISTORY_PUBLISHED_ORIGIN;
if (publishedOrigin !== undefined) assert.equal(publishedOrigin, 'https://municipio-junin-friendly.vercel.app', 'PUBLISHED_ORIGIN_NOT_ALLOWED');
const origin = publishedOrigin ?? 'https://municontrol.test', base = path.resolve('public'), out = path.resolve('verification');
const mode = publishedOrigin ? 'published_assets_with_synthetic_api' : 'local_build_with_synthetic_api';
fs.mkdirSync(out, { recursive: true });
const checks = [], errors = [], requests = [], publishedAssets = new Set(), publishedFailures = new Set();
let detailStatus = 200, detailCode = '', delayDetail = null, inconsistentCommands = true, invalidContext = false, legacy = false, payrollEscalation = false;
async function publicAsset(url, expected) {
  assert.equal(url.origin, 'https://municipio-junin-friendly.vercel.app'); assert.ok(!url.pathname.startsWith('/api/'));
  const requested=url.pathname==='/centro-acciones.html'?new URL('/acciones',url.origin):url;
  const r = await fetch(requested.href, { method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  assert.equal(r.status, 200, 'PUBLISHED_ASSET_UNAVAILABLE');
  const reader = r.body.getReader(), chunks = []; let length = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; assert.ok(length <= expected.length, 'PUBLISHED_ASSET_SIZE_MISMATCH'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(chunks, length); assert.ok(bytes.equals(expected), 'PUBLISHED_ASSET_CONTENT_MISMATCH'); publishedAssets.add(url.pathname); return bytes;
}
const channel = process.env.ACTION_HISTORY_BROWSER_CHANNEL || process.env.CLOCK_BROWSER_CHANNEL;
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'es-AR', timezoneId: 'UTC', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()); requests.push({ url: request.url(), method: request.method(), body: request.postData() });
    if (url.origin !== origin) return route.abort();
    assert.equal(request.method(), 'GET', 'UNEXPECTED_WRITE');
    if (!url.pathname.startsWith('/api/')) {
      const file = path.resolve(base, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(file); if (publishedOrigin) { try { body = await publicAsset(url, body); } catch { publishedFailures.add(url.pathname); return route.abort(); } }
      return route.fulfill({ status: 200, contentType: /\.m?js$/.test(file) ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream', body });
    }
    if (url.pathname === '/api/internal-auth') return route.fulfill({ json: { ok: true, user: { id: 'qa-operator', email: 'synthetic@local.invalid', displayName: 'Operador de prueba sintética' }, access: { tenantCapabilities: historyCapabilities, platformCapabilities: [], platformRoles: [] } } });
    if (url.pathname !== '/api/internal-actions') return route.fulfill({ status: 403, json: { ok: false, error: 'Recurso no incluido en esta prueba sintética' } });
    const resource = url.searchParams.get('resource'), overtime = url.searchParams.get('caseType') === 'overtime_entry';
    if (resource === 'bootstrap') return route.fulfill({ json: actionHistoryBootstrap(overtime) });
    if (resource === 'list') {
      let records = overtime ? [actionHistoryFixture(3)] : [0, 1, 2].map(actionHistoryFixture);
      if (url.searchParams.get('view') === 'closed') records = [];
      return route.fulfill({ json: { ok: true, data: records, pagination: { page: 1, limit: 25, total: records.length, pages: records.length ? 1 : 0 } } });
    }
    if (resource === 'detail') {
      if (delayDetail) { const wait = delayDetail; delayDetail = null; await wait; }
      if (detailStatus !== 200) return route.fulfill({ status: detailStatus, json: { ok: false, code: detailCode, error: 'PRIVATE_SERVER_ERROR_MARKER' } });
      const index = historyIds.indexOf(url.searchParams.get('id'));
      if (index < 0) return route.fulfill({ status: 404, json: { ok: false } });
      const record = actionHistoryFixture(index);
      if (invalidContext) record.sourceContext = { status: 'PRIVATE_SOURCE_MARKER' };
      if (legacy) delete record.sourceContext;
      if (payrollEscalation && index === 2) { record.projection = 'nominal'; record.subject = actionHistoryFixture(1).subject; }
      return route.fulfill({ json: { ok: true, data: record, allowedCommands: index === 0 || inconsistentCommands ? ['approve', 'reject', 'submit', 'cancel', 'update_draft'] : [], timeline: [{ id: '1', eventType: 'submitted', toStatus: 'submitted', occurredAt: '2026-08-01T13:00:00Z', actor: { email: 'QA_ACTOR_MARKER' } }] } });
    }
    return route.fulfill({ status: 400, json: { ok: false } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  const dialog = page.locator('#actionDialog'), body = page.locator('#actionDialogBody');
  async function load() { await page.goto(origin + '/centro-acciones.html'); await page.waitForSelector('#appShell:not([hidden])'); await page.waitForSelector('#actionQueue:not([hidden])'); }
  async function open(index) { await page.locator(`[data-open-action="${historyIds[index]}"]`).click(); await page.waitForFunction(() => document.querySelector('#actionDialogBody').getAttribute('aria-busy') === 'false'); }
  async function close() { await page.keyboard.press('Escape'); assert.equal(await dialog.evaluate(n => n.open), false); }
  async function noCommands() { assert.equal(await body.locator('[data-action-command]').count(), 0); }
  async function evidence(name, width) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1050 });
    await page.evaluate(async () => {
      let banner = document.getElementById('synthetic-evidence');
      if (!banner) { banner = document.createElement('div'); banner.id = 'synthetic-evidence'; banner.textContent = 'QA SINTÉTICA · Sin sesión ni datos municipales'; banner.style.cssText = 'padding:8px;text-align:center;background:#fff1c7;color:#463809;font:700 12px Arial'; }
      const activeDialog = document.querySelector('#actionDialog[open]');
      if (activeDialog) { activeDialog.prepend(banner); activeDialog.scrollTop = 0; }
      else { banner.style.position = 'fixed'; banner.style.bottom = '0'; banner.style.left = '0'; banner.style.right = '0'; banner.style.zIndex = '9999'; document.body.append(banner); document.querySelector('#actionQueue').scrollIntoView({ block: 'start', behavior: 'instant' }); }
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'PAGE_OVERFLOW');
    await page.screenshot({ path: path.join(out, name + '.png') });
  }
  await load();
  const guide=page.locator('#actionWorkflowGuide'),apiReads=()=>requests.filter(r=>new URL(r.url).pathname.startsWith('/api/')).length;
  const beforeGuideReads=apiReads(),closedHeight=await page.locator('#actionWorkflow').evaluate(e=>e.getBoundingClientRect().height);
  assert.equal(await guide.evaluate(e=>e.open),false);
  await guide.locator('summary').focus();await page.keyboard.press('Enter');
  assert.equal(await guide.evaluate(e=>e.open),true);assert.equal(await guide.locator('[data-workflow-step]').count(),4);
  const openHeight=await page.locator('#actionWorkflow').evaluate(e=>e.getBoundingClientRect().height);assert.ok(openHeight>closedHeight+100);
  await guide.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await guide.evaluate(e=>e.open),false);
  assert.equal(apiReads(),beforeGuideReads);checks.push('collapsible workflow retains four existing steps, opens by keyboard and makes no API request');
  await page.getByRole('link',{name:'Ir a la bandeja',exact:true}).click();assert.equal(new URL(page.url()).hash,'#queueTitle');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'queueTitle');assert.equal(apiReads(),beforeGuideReads);
  assert.ok(await page.locator('#queueTitle').evaluate(e=>e.getBoundingClientRect().top>=70));checks.push('direct queue link restores focus below the sticky header without requesting or modifying data');
  await evidence('action-workspace-overview-320-qa',320);await page.setViewportSize({width:1440,height:1050});
  const row = page.locator(`[data-action-row="${historyIds[1]}"]`);
  assert.match(await row.innerText(), /Respaldo anterior · Sólo consulta/); assert.match(await row.innerText(), /31\/07\/2026.*23:30/);
  assert.equal(await row.locator('[data-label="Estado"]').innerText(), await page.locator(`[data-action-row="${historyIds[0]}"] [data-label="Estado"]`).innerText());
  assert.equal(await row.locator('[data-label="Próxima acción"]').innerText(), 'Consultar historial');
  checks.push('list distinguishes previous backup and preserves administrative state with origin time in Argentina even in UTC browser');
  await evidence('action-history-list-desktop-qa', 1440); await evidence('action-history-list-mobile-qa', 390); await page.setViewportSize({ width: 1440, height: 1050 });
  await open(1); await noCommands(); assert.match(await body.locator('[data-action-source]').innerText(), /31\/07\/2026.*23:30[\s\S]*10\/09\/2026.*03:00/);
  assert.doesNotMatch(await body.locator('.command-panel').innerText(), /Aguardando decisión|Siguiente paso: Enviar|aprobador distinto/);
  assert.ok(await body.locator('.timeline li').count()); checks.push('historical detail keeps origin and current cutoffs, history and status while rejecting inconsistent API commands');
  await evidence('action-history-detail-desktop-qa', 1440); await evidence('action-history-detail-mobile-qa', 390); await close();
  assert.equal(await page.locator(`[data-open-action="${historyIds[1]}"]`).evaluate(n => document.activeElement === n), true);
  checks.push('desktop/mobile layouts and Escape return focus to the exact action');
  await page.setViewportSize({ width: 1440, height: 1050 }); await open(0); assert.ok(await body.locator('[data-action-command="approve"]').isVisible());
  const beforeDecisionReads=apiReads();await body.locator('[data-action-command="approve"]').click();
  await body.locator('#decisionReason').fill('Borrador de fundamento sintético, sin confirmar.');
  await body.locator('#manualValidationConfirmed').check();assert.equal(apiReads(),beforeDecisionReads);
  await evidence('action-workspace-decision-320-qa',320);await body.locator('.decision-form').screenshot({path:path.join(out,'action-workspace-form-320-qa.png')});await evidence('action-workspace-decision-desktop-qa',1440);await body.locator('.decision-form').screenshot({path:path.join(out,'action-workspace-form-desktop-qa.png')});
  await body.locator('#decisionFormHost').getByRole('button',{name:'Volver',exact:true}).click();
  assert.equal(await body.locator('form[data-command-form]').count(),0);assert.equal(apiReads(),beforeDecisionReads);
  checks.push('decision form retains explicit confirmation, readable required controls and cancel without a write');await close();
  checks.push('current action retains explicit authorized approval command');
  detailStatus = 409; detailCode = 'ACTION_SESSION_BUSY'; await open(0); await noCommands(); assert.match(await body.innerText(), /última consulta disponible/); assert.doesNotMatch(await body.innerText(), /PRIVATE_SERVER_ERROR_MARKER/);
  detailStatus = 200; await body.getByRole('button', { name: 'Actualizar detalle', exact: true }).click(); await page.waitForSelector('#actionDialogBody [data-action-command="approve"]'); await close();
  checks.push('busy revalidation keeps the previous reading with zero stale commands; explicit successful refresh restores authorized commands');
  detailStatus = 503; await open(0); await noCommands(); assert.match(await body.innerText(), /operaciones permanecen bloqueadas/); await close(); detailStatus = 200;
  checks.push('service failure preserves reading without claiming fresh authorization');
  detailStatus = 403; await open(0); assert.equal(await body.locator('.error-state').count(), 1); assert.doesNotMatch(await body.innerText(), /Persona de prueba|PRIVATE_SERVER_ERROR_MARKER/); await close(); detailStatus = 200;
  checks.push('revoked detail access clears prior nominal reading and does not reflect server error text');
  payrollEscalation = true; await open(2); await noCommands(); assert.equal(await body.getAttribute('data-projection'), 'payroll'); assert.equal(await body.locator('.timeline').count(), 0); assert.doesNotMatch(await body.innerText(), /Persona de prueba|QA_ACTOR_MARKER/); assert.match(await body.innerText(), /Respaldo anterior · Sólo consulta/); await close(); payrollEscalation = false;
  checks.push('payroll historical projection keeps source notice but never nominal identity or timeline, even if detail attempts escalation');
  invalidContext = true; await open(0); await noCommands(); assert.match(await body.innerText(), /Procedencia no confirmada/); assert.doesNotMatch(await body.innerText(), /PRIVATE_SOURCE_MARKER/); await close(); invalidContext = false;
  checks.push('unknown provenance fails closed without displaying its raw value');
  legacy = true; await open(0); assert.ok(await body.locator('[data-action-command="approve"]').isVisible()); assert.equal(await body.locator('[data-action-source]').count(), 0); await close(); legacy = false;
  checks.push('pre-migration DTO without provenance retains explicit legacy behavior without inventing dates');
  legacy = true; await open(1); await noCommands(); assert.match(await body.innerText(), /Respaldo anterior · Sólo consulta/); assert.match(await body.innerText(), /última consulta disponible/); await close(); legacy = false;
  checks.push('historical list provenance cannot be weakened by a detail response missing the new metadata');
  let release; delayDetail = new Promise(resolve => { release = resolve; }); await page.locator(`[data-open-action="${historyIds[1]}"]`).click(); await close(); release(); await page.waitForTimeout(100); assert.equal(await dialog.evaluate(n => n.open), false);
  checks.push('late detail response cannot reopen or repopulate a dismissed consultation');
  await page.locator('#actionTypeFilter').selectOption('overtime_entry'); await page.waitForSelector(`[data-open-action="${historyIds[3]}"]`); await open(3); await noCommands(); assert.equal(await body.getAttribute('data-projection'), 'restricted_nominal'); assert.match(await body.innerText(), /Respaldo anterior · Sólo consulta/); assert.equal(await body.locator('.error-state').count(), 0); await close();
  checks.push('restricted overtime history is readable with no transition or approval recommendation');
  assert.ok(requests.every(r => r.method === 'GET' && r.body === null)); assert.doesNotMatch(JSON.stringify(requests), /QA_ACTOR_MARKER|Persona de prueba|PRIVATE_SOURCE_MARKER/);
  assert.deepEqual(errors, []); assert.equal(publishedFailures.size, 0); if (publishedOrigin) assert.ok(publishedAssets.size > 0);
  checks.push('all APIs are synthetic GET only; no backend writes or nominal query parameters');
  const result = { ok: true, mode, checksPassed: checks.length, checks, errors, publishedAssetsMatch: publishedOrigin ? true : null, publishedAssetsChecked: [...publishedAssets].sort(), syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false, serviceWorkersBlocked: true, browser: browser.version() };
  fs.writeFileSync(path.join(out, 'action-history-browser.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  fs.writeFileSync(path.join(out, 'action-history-browser.json'), JSON.stringify({ ok: false, mode, checksPassed: checks.length, publishedAssetsMatch: publishedOrigin ? false : null, failedPublicAssets: [...publishedFailures], syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false }, null, 2)); throw error;
} finally { await browser.close(); }
