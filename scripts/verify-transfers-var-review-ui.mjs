// Synthetic component QA of the actual built section, stylesheet and browser modules.
// No municipal session, API, payroll operation or bank submission is simulated as acceptance.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {syntheticVarFile, syntheticVarRecord} from '../tests/fixtures/transferencias-varias-synthetic.js';

const root = path.resolve(import.meta.dirname, '..');
const args = {};
for (const argument of process.argv.slice(2)) {
  const match = /^--(browser|output)=(.+)$/.exec(argument);
  assert.ok(match && !Object.hasOwn(args, match[1]), 'VAR_QA_OPTION');
  args[match[1]] = match[2];
}
assert.ok(['chrome', 'chromium'].includes(args.browser));
const output = path.resolve(args.output ?? '');
assert.ok(output.startsWith(path.join(root, 'verification') + path.sep) && !fs.existsSync(output), 'VAR_QA_OUTPUT');
const publicRoot = path.join(root, 'public');
const source = fs.readFileSync(path.join(publicRoot, 'nomina-control.html'), 'utf8');
const start = source.indexOf('<section class="section" aria-labelledby="bankDiagnosticTitle"');
assert.ok(start >= 0);
const section = source.slice(start, source.indexOf('</section>', start) + 10);
assert.ok(section.includes('data-bank-diagnostic-export-observations'));
const style = source.match(/<style>([\s\S]*?)<\/style>/)?.[1];
assert.ok(style);
const html = `<!doctype html><html lang="es" data-mc-capability-state="ready"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ensayo sintético Transferencias varias</title><style>${style}</style></head><body><main style="padding:16px;max-width:1400px;margin:auto">${section}</main><script type="module" src="/assets/payroll-bank-report-workbench.js"></script></body></html>`;
const checks = [], errors = [], requests = [], downloads = [];
const ok = (condition, label) => {assert.ok(condition, label); checks.push(label);};
let server, browser, page, origin, failed;
fs.mkdirSync(output);
try {
  server = http.createServer((req, res) => {
    requests.push({method:req.method, path:req.url});
    if (req.method !== 'GET') {res.writeHead(405).end(); return;}
    if (req.url === '/') {res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}).end(html); return;}
    if (!/^\/assets\/[a-z0-9-]+\.js$/.test(req.url)) {res.writeHead(404).end(); return;}
    const file = path.join(publicRoot, req.url.slice(1));
    if (!fs.existsSync(file)) {res.writeHead(404).end(); return;}
    res.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8'}).end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true, ...(args.browser === 'chrome' ? {channel:'chrome'} : {})});
  const context = await browser.newContext({acceptDownloads:true, viewport:{width:1280,height:900}});
  await context.route('**/*', route => {
    if (route.request().url().startsWith(origin + '/')) return route.continue();
    errors.push('unexpected-external-request'); return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('download', download => downloads.push(download.suggestedFilename()));
  await page.goto(origin);
  const $ = suffix => page.locator(`[data-bank-diagnostic-${suffix}]`);
  const submit = page.getByRole('button', {name:'Validar archivo bancario'});
  await $('profile').selectOption('transferencias-varias-167.observed.v1');
  const idle = () => page.waitForFunction(() => document.querySelector('[data-payroll-bank-report-workbench]').getAttribute('aria-busy') === 'false');
  async function load(bytes) {
    await $('file').setInputFiles({name:'ensayo-sintetico.txt', mimeType:'text/plain', buffer:Buffer.from(bytes)});
    await submit.click(); await idle();
  }
  async function download() {
    const event = page.waitForEvent('download');
    await $('export-observations').click();
    const artifact = await event;
    const file = path.join(output, `incidencias-${downloads.length}.csv`);
    await artifact.saveAs(file);
    return fs.readFileSync(file, 'utf8');
  }
  const badRows = Array.from({length:231}, () => {const r=syntheticVarRecord();r[164]=66;return r;});
  ok(await $('export-observations').isDisabled(), 'No download before a verified review');
  await load(syntheticVarFile(badRows));
  ok(await $('records').textContent() === '231', 'All 231 source rows reviewed');
  ok(await $('field-rows').locator('li').count() === 26, '25 detailed incidences plus explicit complete-download notice');
  ok(!await $('field-rows').isVisible() && await $('export-observations').isVisible(), 'Progressive row detail leaves complete download immediately available');
  ok((await $('field-summary').textContent()).includes('231 observaciones'), 'Complete observation count displayed');
  ok(downloads.length === 0, 'Review never downloads automatically');
  const csv = await download();
  ok(csv.trim().split('\r\n').length === 232 && csv.includes('"231";"Revisar"'), 'CSV includes every incidence beyond both 25 visible and 200 old diagnostics');
  ok(!/PERSONA|20123456789|1234567890123456789012|0000000042|12345/.test(csv), 'CSV contains no synthetic nominal or amount values');
  ok(csv.split('\r\n').filter(Boolean).every(line => line.split(';').every(cell => !/^"[=+@-]/.test(cell))), 'CSV cells cannot become formulas');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({width,height:900});
    const geometry = await page.evaluate(() => {
      const button = document.querySelector('[data-bank-diagnostic-export-observations]');
      const bounds = button.getBoundingClientRect();
      return {width:innerWidth,scroll:document.documentElement.scrollWidth,height:bounds.height,left:bounds.left,right:bounds.right};
    });
    ok(geometry.scroll <= width && geometry.left >= 0 && geometry.right <= width && geometry.height >= 44, `Accessible download fits ${width}px without page overflow`);
    await $('export-observations').focus();
    ok(await $('export-observations').evaluate(node => node === document.activeElement), `Keyboard download focus at ${width}px`);
    await page.screenshot({path:path.join(output, `var-${width}.png`),fullPage:true});
  }
  await $('bank-cents').fill('10000');
  ok(!await $('result').isVisible() && await $('export-observations').isDisabled(), 'Changing declared total invalidates previous review and download');
  ok((await $('status').textContent()).includes('Volvé a validar') && await $('fingerprint').textContent() === '—', 'Changed controls retire previous fingerprint and successful-review message');
  await $('reset').click(); await $('profile').selectOption('transferencias-varias-167.observed.v1');
  await $('payroll-rows').fill('1'); await $('payroll-cents').fill('10000'); await $('bank-cents').fill('10000');
  await load(syntheticVarFile([syntheticVarRecord()]));
  ok((await $('field-reconciliation').textContent()).includes('2345 centavos'), 'Actual TXT total detects two equally wrong declarations');
  ok(await $('status').getAttribute('data-state') === 'error', 'Misdeclared totals never display successful overall reconciliation');
  const cleanCsv = await download();
  ok(cleanCsv.includes('"Sin observaciones"') && !cleanCsv.includes('"Revisar"'), 'Field review without observations does not invent a row error from manual-total disagreement');
  await $('payroll-cents').fill('12345'); await $('bank-cents').fill('12345');
  await submit.click(); await idle();
  ok((await $('field-reconciliation').textContent()).includes('coincide exactamente'), 'Three exact totals reconcile without rounding');
  await $('scope').dispatchEvent('input');
  ok(!await $('result').isVisible() && await $('export-observations').isDisabled(), 'Scope change invalidates review');
  await submit.click(); await idle();
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready', {detail:{tenantCapabilities:new Set()}}));
  });
  ok(!await $('result').isVisible() && await $('file').inputValue() === '' && await $('export-observations').isDisabled(), 'Permission withdrawal clears source file and review');
  const priorDownloads = downloads.length;
  await $('export-observations').dispatchEvent('click');
  await load(syntheticVarFile([syntheticVarRecord()]));
  ok(downloads.length === priorDownloads && !await $('result').isVisible(), 'Revoked access refuses both review and download even with a dispatched click');
  for (const malformed of ['empty-array','permission-array','object','missing']) {
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready', {detail:{tenantCapabilities:new Set(['payroll.read'])}})));
    await load(syntheticVarFile([syntheticVarRecord()]));
    ok(await $('result').isVisible(), 'Real Set capability event restores voluntary review before malformed '+malformed);
    await page.evaluate(kind => {
      const capabilities = kind === 'empty-array' ? [] : kind === 'permission-array' ? ['payroll.read'] : kind === 'object' ? {has:'payroll.read'} : undefined;
      document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready', {detail:{tenantCapabilities:capabilities}}));
    }, malformed);
    ok(!await $('result').isVisible() && await $('file').inputValue() === '' && await $('export-observations').isDisabled() && errors.length === 0, 'Malformed '+malformed+' capability event retires source and review without exceptions');
    await $('export-observations').dispatchEvent('click');
    await load(syntheticVarFile([syntheticVarRecord()]));
    ok(downloads.length === priorDownloads && !await $('result').isVisible(), 'Malformed '+malformed+' capability event cannot authorize review or download');
  }
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready', {detail:{tenantCapabilities:new Set(['payroll.read'])}})));
  await load(syntheticVarFile([syntheticVarRecord()]));
  await page.evaluate(() => document.documentElement.setAttribute('data-mc-capability-state', 'denied'));
  await page.waitForFunction(() => document.querySelector('[data-bank-diagnostic-file]').value === '');
  ok(!await $('result').isVisible() && await $('export-observations').isDisabled(), 'Existing capability-gate denial retires review');
  await page.evaluate(() => document.documentElement.setAttribute('data-mc-capability-state', 'ready'));
  await load(syntheticVarFile([syntheticVarRecord()]));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {configurable:true,value:'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  ok(!await $('result').isVisible() && await $('file').inputValue() === '' && await $('export-observations').isDisabled(), 'Hiding page removes private file and verified download');
  await $('export-observations').dispatchEvent('click');
  ok(downloads.length === priorDownloads, 'Hidden-page click cannot produce bytes');
  await page.evaluate(() => {delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      const file = this; window.releaseVarRead = () => original.call(file).then(window.resolveVarRead);
      return new Promise(resolve => {window.resolveVarRead = resolve;});
    };
    window.restoreVarRead = () => {File.prototype.arrayBuffer = original;};
  });
  await $('file').setInputFiles({name:'lectura-demorada.txt',mimeType:'text/plain',buffer:Buffer.from(syntheticVarFile(badRows))});
  await submit.click();
  ok(await $('reset').isEnabled(), 'Operator can cancel an in-flight file read');
  await $('reset').click();
  await page.evaluate(() => window.restoreVarRead());
  await $('profile').selectOption('transferencias-varias-167.observed.v1');
  await load(syntheticVarFile([syntheticVarRecord()]));
  await page.evaluate(() => window.releaseVarRead());
  ok(await $('records').textContent() === '1' && (await $('field-summary').textContent()).includes('Campos observados completos'), 'Late completion cannot resurrect a retired review or overwrite a new one');
  await load(syntheticVarFile(Array.from({length:231}, () => syntheticVarRecord().subarray(0,166))));
  ok((await download()).trim().split('\r\n').length === 232, 'Complete CSV also includes all physical-width errors');
  await load(syntheticVarFile([syntheticVarRecord(),syntheticVarRecord({month:'9'})]));
  const mixed = await download();
  ok(mixed.includes('"Global";"Revisar"') && mixed.trim().split('\r\n').length === 2, 'Mixed periods remain one global incidence and never silently split the file');
  await load(syntheticVarFile(Array.from({length:10001}, () => syntheticVarRecord())));
  ok(!await $('result').isVisible() && await $('export-observations').isDisabled() && (await $('status').textContent()).includes('10.000'), 'Quantity limit rejects whole review without omitted-row export');
  await $('profile').selectOption('credicoop-accreditation-30.observed.v1');
  await load(syntheticVarFile([new Uint8Array(30).fill(65)]));
  ok(await $('result').isVisible() && !await $('fields').isVisible() && await $('export-observations').isDisabled(), 'Other observed bank profiles keep their structural controls');
  ok(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0), 'No persistence of the review');
  ok(requests.every(r => r.method === 'GET' && (r.path === '/' || /^\/assets\//.test(r.path))), 'No API or business-operation request');
  ok(errors.length === 0, 'No browser error or external request');
} catch (error) {
  failed = error;
  fs.writeFileSync(path.join(output, 'failure.log'), error.stack ?? String(error));
  if (page) await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(output,'result.json'), JSON.stringify({ok:!failed,browser:args.browser,checks,errors,requests,downloads,syntheticOnly:true,componentQa:true,municipalSessionAccepted:false,bankSubmitted:false,paymentExecuted:false,serverClosed:true},null,2));
}
if (failed) throw failed;
process.stdout.write(JSON.stringify({ok:true,checks:checks.length,output,syntheticOnly:true})+'\n');
