// Source UI and fictional HTTP envelopes only. No municipal session or SQL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { collectiveJobsBrowserFixture } from '../tests/fixtures/own-collective-jobs-browser-synthetic.js';

export async function verifyCollectiveWorkingTimeBrowser({ root = fileURLToPath(new URL('../', import.meta.url)), output } = {}) {
 assert.ok(output && path.isAbsolute(output)); fs.mkdirSync(output, { recursive: false });
 const fixture = await collectiveJobsBrowserFixture(257), origin = 'https://working-time-collective.test';
 const checks = [], errors = [], legacyWrites = [], baselineWrites = fixture.source.writes.length;
 const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
 let page;
 const check = (ok, message) => { assert.ok(ok, message); checks.push(message); };
 try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 1100 }, locale: 'es-AR', serviceWorkers: 'block' });
  // Poll deterministically. Executing work is a fixture-server action, never a
  // browser timer, so a closed page cannot be responsible for job progress.
  await context.addInitScript(() => {
   const original = window.setInterval; window.__collectivePolls = [];
   window.setInterval = (fn, delay, ...args) => {
    if ([5000, 20000].includes(delay)) { window.__collectivePolls.push({ delay, run: () => fn(...args) }); return -window.__collectivePolls.length; }
    return original(fn, delay, ...args);
   };
  });
  await context.route('**/*', async route => {
   const request = route.request(), url = new URL(request.url());
   if (url.origin !== origin) return route.abort();
   if (url.pathname === '/api/internal-auth') return route.fulfill({ json: await fixture.source.io.authorize() });
   if (url.pathname === '/api/internal-own-collective-jobs') {
    try {
     const body = request.method() === 'POST' ? JSON.parse(request.postData()) : null;
     const payload = await fixture.request(request.url(), request.method(), body, request.headers()['idempotency-key']);
     return route.fulfill({ status: payload.dispatch === 'queued' ? 202 : 200, json: payload });
    } catch (error) {
     return route.fulfill({ status: error.status ?? 503, json: { ok: false, code: error.code ?? 'COLLECTIVE_JOB_UNAVAILABLE', error: error.message } });
    }
   }
   if (url.pathname.startsWith('/api/')) {
    if (request.method() === 'POST') legacyWrites.push({ path: url.pathname, body: request.postData() });
    return route.fulfill({ status: 403, json: { ok: false, error: 'Canal ajeno a esta prueba sintética.' } });
   }
   const relative = url.pathname === '/' ? 'tests/fixtures/own-contract-working-time-collective-browser.html' : url.pathname.slice(1), file = path.resolve(root, relative);
   assert.ok(file.startsWith(path.resolve(root) + path.sep));
   if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
   return route.fulfill({ contentType: { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)] ?? 'application/octet-stream', body: fs.readFileSync(file) });
  });
  const c = key => page.locator(`[data-collective-time-${key}]`);
  const idle = () => page.waitForFunction(() => document.querySelector('.working-time-collective')?.getAttribute('aria-busy') === 'false');
  const fresh = async () => {
   if (page && !page.isClosed()) await page.close();
   page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000);
   await page.goto(origin + '/tests/fixtures/own-contract-working-time-collective-browser.html');
   await page.waitForFunction(() => document.querySelector('.own-working-time')?.getAttribute('aria-busy') === 'false');
   await page.getByText('Jornada para varios legajos · carga y aprobación por lote', { exact: true }).click(); await idle();
  };
  const open = async id => { await c('jobs').selectOption(id); await c('open-job').click(); await idle(); };
  const mutations = () => fixture.requests.filter(request => request.method === 'POST');
  await fresh(); await c('mode').selectOption('approve');
  await c('file').setInputFiles({ name: 'jornadas-sinteticas.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture.file)) }); await idle();
  await c('reason').fill('Revisión independiente del conjunto exclusivamente sintético QA'); await c('prepare').click(); await idle();
  const job = [...fixture.jobs.values()][0];
  check(fixture.jobs.size === 1 && mutations().length === 1 && mutations()[0].operation === 'create', 'one bounded creation uploads the complete file without per-person HTTP writes');
  check(job.file.total === 257 && job.file.records.length === 257 && job.items.length === 0, 'all 257 records are accepted before asynchronous preparation begins');
  check(fixture.source.writes.length === baselineWrites && legacyWrites.length === 0, 'creating a review produces no canonical decisions or legacy POST');
  check(await c('send').isDisabled(), 'an incomplete server review cannot be confirmed');

  await page.close(); await fixture.advance(job.id, 100);
  check(job.items.length === 100 && job.phase === 'preparing', 'server preparation advances with the original page closed');
  await fresh(); await open(job.id);
  check((await c('count').innerText()).includes('100 revisados') && await c('send').isDisabled(), 'a new page recovers the saved partial review without uploading the file again');
  await fixture.advance(job.id); fixture.hooks.changedComparisonHash = true;
  await c('refresh').click(); await idle();
  check(await c('comparison').isHidden() && await c('send').isDisabled(), 'a changed hash on the second page blocks the entire comparison and confirmation');
  fixture.hooks.changedComparisonHash = false; await c('refresh').click(); await idle();
  const offsets = fixture.requests.filter(request => request.resource === 'detail').map(request => request.offset);
  check(offsets.includes('0') && offsets.includes('200'), 'the review fetches every page under the same immutable hash');
  check((await c('count').innerText()).includes('257 revisados') && (await c('page').innerText()).includes('257'), 'the full review count stays visible while the table displays one page');
  check(await c('send').isDisabled() && !await c('confirm').isChecked(), 'whole-set confirmation starts unchecked after a complete read');
  await c('next').click(); check((await c('page').innerText()).includes('Página 2'), 'table pagination changes only the visible comparison page');
  await c('search').fill('QA-257'); check((await c('rows').innerText()).includes('QA-257'), 'the final contract survives display pagination and filtering');
  check((await c('count').innerText()).includes('257 revisados'), 'a filtered view retains the original complete command scope'); await c('search').fill('');
  for (const width of [1366, 390, 320]) {
   await page.setViewportSize({ width, height: 1100 });
   check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `no body overflow at ${width}px`);
   check(await c('send').evaluate(element => element.getBoundingClientRect().height >= 44), `primary target is at least 44px at ${width}px`);
   await page.locator('.working-time-collective').screenshot({ path: path.join(output, `collective-${width}.png`) });
  }

  fixture.hooks.loseConfirmAck = true; await c('confirm').check(); await c('send').click(); await idle();
  check(job.phase === 'running' && mutations().filter(request => request.operation === 'confirm').length === 1, 'a lost confirmation response leaves one accepted server job');
  await c('refresh').click(); await idle();
  check(await c('send').isDisabled() && mutations().filter(request => request.operation === 'confirm').length === 1, 'status recovery after a lost response performs no second confirmation');
  await fixture.advance(job.id, 11); fixture.pause(job.id); await page.close();
  await fixture.advance(job.id); check(job.confirmed === 11, 'paused server work preserves the committed prefix');
  await fresh(); await open(job.id);
  check(await c('resume').isVisible() && (await c('count').innerText()).includes('11 comprobantes'), 'reopening recovers paused progress with the existing receipts');
  await c('resume').click(); await idle();
  check(mutations().filter(request => request.operation === 'resume').length === 1 && job.phase === 'running', 'resume addresses the original saved job');
  await page.close(); await fixture.advance(job.id);
  check(job.phase === 'complete' && job.confirmed === 257, 'the accepted job completes with no page open');
  check(fixture.source.writes.length === baselineWrites + 257 && new Set(fixture.source.writes.slice(baselineWrites).map(value => value.key)).size === 257, 'completion retains one canonical decision and one original key per contract');
  await fresh(); await open(job.id);
  check((await c('status').innerText()).includes('Conjunto recorrido por completo') && (await c('count').innerText()).includes('257 comprobantes'), 'a fresh browser page recovers the complete durable-result contract');
  check(await c('send').isDisabled() && await c('resume').isHidden(), 'a completed job cannot be submitted or resumed from the UI');
  check(mutations().filter(request => request.operation === 'create').length === 1 && mutations().filter(request => request.operation === 'cancel').length === 0, 'closing and reopening views neither recreates nor cancels the job');
  check(legacyWrites.length === 0, 'the collective panel never falls back to the browser-driven per-contract loop');

  fixture.hooks.denied = true; await c('refresh').click(); await idle();
  check(await c('comparison').isHidden() && await c('progress-section').isHidden(), 'an authoritative 403 masks all private comparison and progress data');
  check(await c('reason').inputValue() === '' && await c('file-label').innerText() === 'Sin archivo.' && await c('rows').innerText() === '', 'revocation clears the loaded file, rationale and nominal rows');
  check(job.confirmed === 257 && mutations().filter(request => request.operation === 'cancel').length === 0, 'masking a revoked view leaves server receipts unchanged');
  check(errors.length === 0, 'zero browser page errors');
  const result = { version: 'collective-working-time-browser-synthetic.v2', checks, errors, requests: fixture.requests.length,
   mutations: mutations().map(request => request.operation), individualDecisions: job.confirmed, closedPageContinuation: true,
   secureContext: await page.evaluate(() => ({ isSecureContext, hasSubtle: typeof crypto?.subtle?.digest === 'function', hasRandomUUID: typeof crypto?.randomUUID === 'function' })),
   usesSyntheticLoopbackOnly: true, sqlExecuted: false, productionVisited: false };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); return result;
 } catch (error) {
  const diagnostic = { error: String(error), stack: error.stack, checks, errors, requestCount: fixture.requests.length, mutations: fixture.requests.filter(value => value.method === 'POST').map(value => value.operation), usesSyntheticLoopbackOnly: true, sqlExecuted: false, productionVisited: false };
  if (page && !page.isClosed()) {
   try { diagnostic.visibleState = await page.evaluate(() => ({ url: location.href, bodyText: document.body.innerText, status: document.querySelector('[data-collective-time-status]')?.textContent, count: document.querySelector('[data-collective-time-count]')?.textContent })); } catch (error) { diagnostic.stateError = String(error); }
   try { await page.screenshot({ path: path.join(output, 'failure-synthetic.png'), fullPage: true }); diagnostic.screenshot = 'failure-synthetic.png'; } catch (error) { diagnostic.screenshotError = String(error); }
  }
  fs.writeFileSync(path.join(output, 'failure-synthetic.json'), JSON.stringify(diagnostic, null, 2) + '\n', { flag: 'wx' }); throw error;
 } finally { await browser.close(); }
}
