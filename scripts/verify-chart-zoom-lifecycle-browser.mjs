// Real shared chart components and ECharts, with synthetic data and no API access.
// Checks that a zoom/PNG never outlives its source chart or access context.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {buildCharts} from './build-charts.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'verification', 'chart-zoom-lifecycle');
fs.mkdirSync(output, {recursive: true});
const {outfile} = await buildCharts(root, path.join(output, 'build'));
const origin = 'https://chart-zoom-lifecycle.invalid', checks = [], errors = [], downloads = [];
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><style>
body{font:16px system-ui;background:white}#protected{max-width:900px;margin:30px auto}[hidden]{display:none!important}
</style><body><section id="protected"><div id="charts"></div></section><script type="module">
import * as aggregate from '/assets/aggregate-chart-view.js';
import * as loader from '/assets/mc-chart-loader.js';
const spec={key:'synthetic-private',title:'Dato nominal de prueba',subtitle:'Datos sintéticos',kind:'bar',unit:'money',labels:['Persona QA reservada'],series:[{name:'Importe',values:['12345.67']}]};
window.zoomQA={
 async draw(){window.qaMounted=await aggregate.drawAggregateCharts(document.getElementById('charts'),[spec]);document.querySelector('.mc-chart-card').__mcRows=()=>({head:['Persona','Importe'],body:[['Persona QA reservada','12345.67']]});},
 clear(){aggregate.clearAggregateCharts(document.getElementById('charts'));},
 async redraw(){await loader.drawChart(document.querySelector('#charts .mc-chart'),m=>m.trendOption({points:[['Nuevo',1],['Actual',2]],name:'Actualizado'}));}
};window.zoomQAReady=true;
</script></body></html>`;
const browser = await chromium.launch({headless: true});
try {
 const context = await browser.newContext({viewport: {width: 1200, height: 900}, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: true});
 await context.route('**/*', route => {
  const u = new URL(route.request().url());
  if (u.origin !== origin || u.pathname.startsWith('/api/')) return route.abort();
  if (u.pathname === '/') return route.fulfill({status: 200, contentType: 'text/html', body: html});
  const file = u.pathname === '/assets/mc-charts.js' ? outfile : path.resolve(root, u.pathname.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
  return route.fulfill({status: 200, contentType: path.extname(file) === '.css' ? 'text/css' : 'text/javascript', body: fs.readFileSync(file)});
 });
 const page = await context.newPage(); page.setDefaultTimeout(10000);
 page.on('pageerror', error => errors.push(error.message));
 page.on('download', download => downloads.push(download.suggestedFilename()));
 async function open() {
  await page.goto(origin); await page.waitForFunction(() => window.zoomQAReady);
  await page.evaluate(() => window.zoomQA.draw());
  await page.locator('.mc-chart-expand').click();
  await page.waitForFunction(() => document.querySelector('.mc-zoom .mc-chart[data-loading=false] canvas'));
  assert.match(await page.locator('.mc-zoom').textContent(), /Persona QA reservada/);
  await page.evaluate(() => { window.retainedDialog = document.querySelector('.mc-zoom'); window.retainedSave = [...retainedDialog.querySelectorAll('button')].find(b => b.textContent === 'Descargar imagen'); });
 }
 async function withdrawn(label, action) {
  await open(); const before = downloads.length;
  await page.evaluate(action);
  await page.waitForFunction(() => document.querySelector('.mc-zoom') === null);
  assert.deepEqual(await page.evaluate(() => ({text: retainedDialog.textContent, canvases: retainedDialog.querySelectorAll('canvas').length, disabled: retainedSave.disabled})), {text: '', canvases: 0, disabled: true});
  await page.evaluate(async () => { retainedSave.click(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  assert.equal(downloads.length, before, 'a retained download button must not export withdrawn data');
  checks.push(label);
 }
 await open();
 const saved = page.waitForEvent('download'); await page.getByRole('button', {name: 'Descargar imagen', exact: true}).click();
 const download = await saved; const png = fs.readFileSync(await download.path());
 assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
 checks.push('a current, visible source still enlarges with its numbers and downloads a valid PNG');

 await withdrawn('disposing the aggregate source clears the modal, nominal text and export', () => zoomQA.clear());
 await withdrawn('hiding the protected ancestor clears the modal', () => { document.getElementById('protected').hidden = true; });
 await withdrawn('CSS withdrawal of the protected ancestor clears the modal', () => { document.getElementById('protected').style.display = 'none'; });
 await withdrawn('detaching the protected source clears the modal', () => { document.getElementById('protected').remove(); });
 await withdrawn('direct ECharts disposal clears the modal', async () => { const {echarts} = await import('/assets/mc-charts.js'); echarts.getInstanceByDom(document.querySelector('#charts .mc-chart')).dispose(); });
 await withdrawn('updating the mounted source invalidates its previous zoom', () => qaMounted[0].update({series: []}));
 await withdrawn('redrawing the same source closes its old zoom', () => zoomQA.redraw());
 await withdrawn('a capability context change withdraws the modal and export', () => document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready', {detail: {tenantCapabilities: new Set()}})));
 await withdrawn('a task context change withdraws the modal', () => document.dispatchEvent(new CustomEvent('taskchange', {detail: {id: 'otra'}})));
 await withdrawn('hiding the document withdraws the modal', () => { Object.defineProperty(document, 'hidden', {configurable: true, value: true}); document.dispatchEvent(new Event('visibilitychange')); });
 await withdrawn('pagehide withdraws the modal before navigation or bfcache', () => window.dispatchEvent(new Event('pagehide')));

 await open(); const before = downloads.length;
 await page.evaluate(() => { document.getElementById('protected').hidden = true; retainedSave.click(); });
 await page.waitForFunction(() => document.querySelector('.mc-zoom') === null);
 assert.equal(downloads.length, before); checks.push('PNG export checks current source validity synchronously before observer delivery');

 await page.goto(origin); await page.waitForFunction(() => window.zoomQAReady); await page.evaluate(() => zoomQA.draw());
 await page.evaluate(() => { document.querySelector('.mc-chart-expand').click(); zoomQA.clear(); });
 await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
 assert.equal(await page.locator('.mc-zoom, #charts canvas').count(), 0);
 checks.push('closing while the zoom draw is pending cannot resurrect its canvas');
 assert.deepEqual(errors, []);
 fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({checksPassed: checks.length, checks, errors, browser: browser.version(), syntheticData: true, backendRequests: 0}, null, 2));
 console.log(JSON.stringify({checksPassed: checks.length, errors}));
} catch (error) {
 fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({message: error.message, checks, errors}, null, 2));
 throw error;
} finally { await browser.close(); }
