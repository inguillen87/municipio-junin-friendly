// Disposable loopback browser acceptance. Only synthetic files and API responses.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { publishedBuildVerification } from './lib/published-build-verification.mjs';
const root = path.resolve('public'), out = path.resolve('verification/source-review'); fs.mkdirSync(out, { recursive: true });
const published = process.argv.includes('--published'), assets = new Map(), checkedFiles = [];
for (const file of ['nomina-control.html', 'assets/grh-source-preview.js']) assets.set(file, fs.readFileSync(path.join(root, file)));
if (published) {
  const release = JSON.parse(fs.readFileSync(path.join(root, 'release-info.json'), 'utf8'));
  assert.equal(release.sourceState, 'committed'); assert.match(release.commitSha, /^[a-f0-9]{40}$/);
  const build = publishedBuildVerification({ origin: 'https://municipio-junin-friendly.vercel.app', release: release.commitSha });
  for (const file of ['release-info.json', ...assets.keys()]) {
    const r = await build.fetchFile(file); assert.equal(r.status, 200);
    const bytes = Buffer.from(await r.arrayBuffer()); assert.ok(bytes.equals(fs.readFileSync(path.join(root, file))), 'Published bytes differ: ' + file);
    if (assets.has(file)) assets.set(file, bytes); checkedFiles.push(file);
  }
}
const html = assets.get('nomina-control.html').toString('utf8');
const panel = html.match(/<section\b[^>]*data-grh-source-preview[^>]*>[\s\S]*?<\/section>/)?.[0]; assert.ok(panel);
const styles = [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/g)].map(m => m[0]).join('');
const pipe = 'grh-calculo-pipe-utf8.v1', amaru = 'junin-638-amaru-fixed55.v1';
let mode = 'valid', delay = 0; const calls = [], checks = [], errors = [];
function aggregate(body) {
  const fixed = body.definitionKey === amaru;
  return { ok: true, includesRecordValues: false, persistencePerformed: false, data: {
    contractVersion: 'grh-source-preview.v1', definitionKey: body.definitionKey, status: 'valid', format: fixed ? 'fixed_width' : 'pipe', encoding: fixed ? 'ascii' : body.definitionKey.includes('windows1252') ? 'windows-1252' : 'utf-8',
    contentFingerprint: 'hmac-sha256:' + 'a'.repeat(64), schemaSha256: 'b'.repeat(64), byteLength: Buffer.from(body.contentBase64, 'base64').length,
    recordCount: 1, acceptedCount: 1, rejectedRecordCount: 0, issueCount: 0, structuralErrorCount: 0, schemaValid: true, rejectionSummary: {}, rejectionsTruncated: false, includesRecordValues: false, persistencePerformed: false,
  }};
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api/internal-grh-source-preview') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw), state = mode; calls.push(body);
    const result = aggregate(body);
    if (state === 'mismatch') result.data.definitionKey = body.definitionKey === pipe ? amaru : pipe;
    if (state === 'size') result.data.byteLength++;
    if (state === 'pii') result.data.records = [{ name: 'PRIVATE_TEST_VALUE' }];
    if (state === 'observations') Object.assign(result.data, { status: 'has_rejections', acceptedCount: 0, rejectedRecordCount: 1, issueCount: 1, rejectionSummary: { DNI_JUNIN638_DNI_INVALID: 1 } });
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (res.destroyed) return;
    const code = /^\d+$/.test(state) ? Number(state) : 200;
    res.writeHead(code, { 'content-type': state === 'html' ? 'text/html' : 'application/json', 'cache-control': state === 'cached' ? 'public, max-age=60' : 'private, no-store' });
    return res.end(code !== 200 ? JSON.stringify({ ok: false, error: 'PRIVATE_TEST_VALUE postgres://sensitive-connection' }) : state === 'html' ? '<h1>PRIVATE_TEST_VALUE</h1>' : state === 'oversized' ? ' '.repeat(65537) : JSON.stringify(result));
  }
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  if (url.pathname === '/assets/grh-source-preview.js') { res.setHeader('content-type', 'application/javascript'); return res.end(assets.get('assets/grh-source-preview.js')); }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (url.pathname !== '/') { res.writeHead(404); return res.end(); }
  res.setHeader('content-type', 'text/html');
  res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">' + styles + '<body><main style="max-width:1440px;margin:auto;padding:16px"><template id="qa-template">' + panel + '</template></main><script type="module">import {mountGrhSourcePreview} from "/assets/grh-source-preview.js";window.qa={readDelay:0,navigated:null,requestSignals:[]};document.querySelector("main").append(document.querySelector("template").content.cloneNode(true));mountGrhSourcePreview(document,{timeoutMs:1500,request:(url,options)=>{qa.requestSignals.push(options.signal);return fetch(url,options);},readFile:async file=>{const ms=qa.readDelay;if(ms)await new Promise(r=>setTimeout(r,ms));return file.arrayBuffer();},navigate:target=>{qa.navigated=target;}});window.qa.ready=true;</script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.CLOCK_BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } }); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const reload = async () => { mode = 'valid'; delay = 0; await page.goto(origin); await page.waitForFunction(() => window.qa?.ready); };
  const host = page.locator('[data-grh-source-preview]'), input = host.locator('[data-source-preview-file]'), definition = host.locator('[data-source-preview-definition]');
  const submit = host.locator('[data-source-preview-submit]'), status = host.locator('[data-source-preview-status]'), result = host.locator('[data-source-preview-result]');
  const upload = async (content = 'QA ONLY', name = 'never-publish-this-name.txt') => input.setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
  const wait = text => status.filter({ hasText: text }).waitFor();
  const analyze = async () => { await submit.click(); await wait('Análisis válido'); };
  await reload(); assert.equal(await host.locator('[data-source-preview-cancel]').isVisible(), false);
  await page.evaluate(() => document.dispatchEvent(new Event('municontrol:capabilities-ready'))); assert.match(await status.innerText(), /Esperando un archivo local/);
  await upload(); await analyze(); assert.equal(await result.isVisible(), true); assert.equal(await input.inputValue(), '');
  assert.equal(await host.getAttribute('aria-busy'), 'false');
  assert.equal(await page.evaluate(() => qa.requestSignals.at(-1).aborted), false, 'A fully consumed valid reply must complete without aborting its finished request.');
  checks.push('A verified complete reply releases the busy state without cancelling the finished request.');
  assert.deepEqual(Object.keys(calls.at(-1)).sort(), ['contentBase64', 'definitionKey']);
  assert.doesNotMatch(await host.innerText(), /never-publish-this-name|PRIVATE_TEST_VALUE/);
  checks.push('Complete analysis returns only aggregate counts, frees the file and sends no filename or source identifiers.');
  await definition.selectOption(amaru); assert.equal(await result.isVisible(), false); await upload(' '.repeat(55)); mode = 'observations';
  await submit.click(); await wait('Análisis con observaciones'); assert.match(await host.innerText(), /DNI inválido/); assert.match(await host.innerText(), /no confirma aceptación por AMARU/);
  assert.equal(await page.evaluate(() => qa.requestSignals.at(-1).aborted), false);
  assert.match(await host.locator('[data-source-preview-format-help]').innerText(), /55 bytes.*posición 5.*posición 44/);
  checks.push('AMARU gets field-specific guidance and never turns structural acceptance into recipient acceptance.');
  await reload(); await upload('OLD'); delay = 400; const first = page.waitForRequest('**/api/internal-grh-source-preview'); await submit.click(); await first;
  await upload('NEW FILE'); await page.waitForTimeout(600); assert.equal(await result.isVisible(), false); assert.notEqual(await input.inputValue(), '');
  assert.equal(await page.evaluate(() => qa.requestSignals.at(-1).aborted), true, 'Replacing the file must still cancel an unfinished analysis.');
  delay = 0; await analyze(); assert.equal(Buffer.from(calls.at(-1).contentBase64, 'base64').toString(), 'NEW FILE');
  checks.push('Replacing a file aborts the old analysis; a late response cannot erase the new selection or restore old counts.');
  await reload(); await upload(); delay = 400; const second = page.waitForRequest('**/api/internal-grh-source-preview'); await submit.click(); await second;
  await definition.selectOption(amaru); await page.waitForTimeout(600); assert.equal(await result.isVisible(), false); assert.notEqual(await input.inputValue(), ''); delay = 0; await analyze(); assert.equal(calls.at(-1).definitionKey, amaru);
  checks.push('Changing format withdraws the prior result and pins the next response to the selected definition.');
  await reload(); await upload(); const beforeReadCancel = calls.length; await page.evaluate(() => { qa.readDelay = 500; }); await submit.click(); await host.getByRole('button', { name: 'Cancelar análisis' }).click();
  await page.waitForTimeout(700); assert.equal(calls.length, beforeReadCancel); assert.equal(await result.isVisible(), false); assert.notEqual(await input.inputValue(), '');
  assert.equal(await submit.evaluate(el => el === document.activeElement), true); await page.evaluate(() => { qa.readDelay = 0; }); await analyze();
  checks.push('Cancelling local reading prevents any POST, retains the file and returns focus for a manual retry.');
  await reload(); await upload(); delay = 400; const beforeDouble = calls.length;
  await submit.click(); await host.locator('form').evaluate(form => form.requestSubmit()); await wait('Análisis válido'); assert.equal(calls.length, beforeDouble + 1);
  checks.push('Double submission cannot start two active requests.');
  for (const scenario of ['503', '429', '422', 'html', 'cached', 'oversized', 'mismatch', 'size', 'pii']) {
    await reload(); await upload(); mode = scenario; const before = calls.length; await submit.click(); await wait(/reintentar|revisá/i);
    assert.equal(await result.isVisible(), false); assert.notEqual(await input.inputValue(), ''); assert.equal(await submit.isEnabled(), true);
    assert.equal(calls.length, before + 1); assert.doesNotMatch(await host.innerText(), /PRIVATE_TEST_VALUE|postgres:\/\//);
    mode = 'valid'; await analyze(); assert.equal(calls.length, before + 2);
    checks.push('Safe recovery without reselecting or auto-resending: ' + scenario + '.');
  }
  await reload(); await upload('OFFLINE'); const offlineBefore = calls.length; await page.context().setOffline(true);
  await submit.click(); await wait('podés reintentar'); assert.equal(calls.length, offlineBefore); assert.notEqual(await input.inputValue(), '');
  await page.context().setOffline(false); await analyze(); assert.equal(calls.length, offlineBefore + 1);
  checks.push('Offline browser failure keeps the file; reconnecting does not resubmit until the operator retries.');
  await reload(); await upload(); delay = 2100; await submit.click(); await wait('agotó su plazo');
  assert.notEqual(await input.inputValue(), ''); assert.equal(await submit.isEnabled(), true); await page.waitForTimeout(800); assert.equal(await result.isVisible(), false);
  delay = 0; await analyze(); checks.push('Network timeout recovers the form and ignores the eventual response.');
  await reload(); await upload(); const beforeFileTimeout = calls.length; await page.evaluate(() => { qa.readDelay = 2100; });
  await submit.click(); await wait('agotó su plazo'); await page.waitForTimeout(800); assert.equal(calls.length, beforeFileTimeout); assert.equal(await result.isVisible(), false);
  await page.evaluate(() => { qa.readDelay = 0; }); await analyze(); checks.push('The deadline also covers file reading, before the network request.');
  for (const denied of ['401', '403']) {
    await reload(); await upload(); mode = denied; await submit.click(); await wait(/sesión/);
    assert.equal(await result.isVisible(), false); assert.equal(await input.inputValue(), ''); assert.equal(await submit.isDisabled(), true);
    assert.equal(await input.isDisabled(), true); assert.doesNotMatch(await host.innerText(), /PRIVATE_TEST_VALUE/);
    assert.equal(await page.evaluate(() => qa.navigated !== null), denied === '401');
    checks.push('Access revoked: ' + denied + ' clears file and output; only expired sessions navigate to login.');
  }
  await reload(); await upload(); await analyze(); await host.getByRole('button', { name: 'Limpiar archivo y resultado' }).click();
  assert.equal(await result.isVisible(), false); assert.equal(await host.locator('[data-source-preview-records]').innerText(), '—'); assert.equal(await input.evaluate(el => el === document.activeElement), true);
  checks.push('Clear removes both selection and old aggregate values, restoring keyboard focus.');
  for (const event of ['municontrol:capabilities-ready', 'visibilitychange']) {
    await reload(); await upload(); delay = 300; const pending = page.waitForRequest('**/api/internal-grh-source-preview'); await submit.click(); await pending;
    await page.evaluate(name => { if (name === 'visibilitychange') Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event(name)); }, event);
    await page.waitForTimeout(500); assert.equal(await result.isVisible(), false); assert.equal(await input.inputValue(), '');
    checks.push('Context change during reading withdraws all state: ' + event + '.');
  }
  await reload(); await upload(); await page.evaluate(() => {
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  assert.equal(await input.inputValue(), ''); await upload('RESTORED'); const restoredCalls = calls.length; await analyze(); assert.equal(calls.length, restoredCalls + 1);
  checks.push('Back-forward cache restoration remounts one clean controller without preserving a private file or duplicate handlers.');
  await reload(); await upload(); delay = 300; const removed = page.waitForRequest('**/api/internal-grh-source-preview'); await submit.click(); await removed;
  await host.evaluate(el => el.remove()); await page.waitForTimeout(500); assert.equal(await host.count(), 0); checks.push('Unmount aborts work and removes listeners without late UI resurrection.');
  for (const [content, expected] of [['', 'vacío'], ['x'.repeat(2097153), 'límite']]) {
    await reload(); await upload(content); const before = calls.length; await submit.click(); await wait(expected); assert.equal(calls.length, before);
  }
  checks.push('Empty and oversized files are refused before upload.');
  await reload(); await definition.selectOption(amaru); await upload(' '.repeat(55)); mode = 'observations'; await submit.click(); await wait('Análisis con observaciones');
  await host.screenshot({ path: path.join(out, 'desktop.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const element of [submit, definition, host.locator('[data-source-preview-clear]')]) assert.ok((await element.boundingBox()).height >= 44);
    await host.screenshot({ path: path.join(out, 'mobile-' + width + '.png') });
  }
  checks.push('320/390px keeps results readable, controls at least 44px and no page overflow.');
  assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  for (const body of calls) assert.deepEqual(Object.keys(body).sort(), ['contentBase64', 'definitionKey']);
  const report = { ok: true, mode: published ? 'published_assets_synthetic_api' : 'local_build_synthetic_api', checkedFiles, checksPassed: checks.length, checks, errors, realMunicipalSessionTested: false, municipalFilesUsed: false, privateRequestsForwarded: 0, businessWrites: 0 };
  fs.writeFileSync(path.join(out, published ? 'published.json' : 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
