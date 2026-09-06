// Built-page verification with every request intercepted. No municipal/production API.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const publicRoot = path.resolve(import.meta.dirname, '../public');
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-report-workspace-'));
const origin = 'https://report-workspace.test';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const checks = [];

async function fixture({ width = 1280, failSource = false, blockIsland = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  let sourceCalls = 0;
  const errors = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, origin, 'No request may leave the local fixture');
    assert.equal(route.request().method(), 'GET', 'No tool may submit data');
    if (url.pathname === '/friendly-data.json') {
      sourceCalls++;
      if (failSource && sourceCalls === 1) return route.fulfill({ status: 503, body: 'Unavailable' });
    }
    if (blockIsland && url.pathname.includes('/islands/report-workspace-')) return route.fulfill({ contentType: 'text/javascript', body: '' });
    const relative = url.pathname === '/reportes-rrhh' ? 'reportes-rrhh.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(publicRoot, relative);
    assert.ok(file.startsWith(`${publicRoot}${path.sep}`));
    try { return route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body: await fs.readFile(file) }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return route.fulfill({ status: 404, body: '' }); }
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors, sourceCalls: () => sourceCalls };
}

async function show(page, mode) {
  await page.waitForFunction(mode => {
    const visible = [...document.querySelectorAll('[data-report-panel]')].filter(panel => !panel.hidden);
    return mode === 'all' ? visible.length === 4 : visible.length === 1 && visible[0].dataset.reportPanel === mode;
  }, mode);
}
async function healthy(page, label) {
  const layout = await page.evaluate(() => ({
    width: innerWidth, document: document.documentElement.scrollWidth,
    font: getComputedStyle(document.querySelector('h1')).fontFamily,
    logo: getComputedStyle(document.querySelector('.brand-name')).backgroundImage,
    controls: [...document.querySelectorAll('.report-task-link')].map(link => link.getBoundingClientRect().height),
    h1: document.querySelectorAll('h1').length,
    overflow: [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > innerWidth + 1 && !node.closest('[hidden]')).slice(0, 6).map(node => node.id || node.className),
  }));
  assert.ok(layout.document <= layout.width + 1, `${label}: ${JSON.stringify(layout)}`);
  assert.equal(layout.h1, 1);
  assert.ok(!layout.font.includes('Georgia'));
  assert.match(layout.logo, /logo-horizontal\.svg/);
  assert.ok(layout.controls.every(height => height >= 44));
}

try {
  for (const width of [1280, 768, 390, 320]) {
    const { context, page, errors, sourceCalls } = await fixture({ width, failSource: true });
    await page.goto(`${origin}/reportes-rrhh#bancarizacion`);
    await show(page, 'bank');
    await page.waitForFunction(() => document.querySelector('#loadError').hidden === false);
    assert.equal(await page.locator('#downloadRrhhXlsx').isDisabled(), true);
    await page.locator('#bankControlPeriod').fill('2026-08');
    await page.locator('#bankControlCredicoop').selectOption('cuenta_corriente');
    const file = { name: 'selected-example.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('synthetic selection only; not an accepted workbook') };
    await page.locator('#bankControlWorkbook').setInputFiles(file);
    await page.locator('#reportWorkspaceSkip').focus();
    await page.keyboard.press('Enter');
    await show(page, 'bank');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'reportWorkspaceTitle');
    await healthy(page, `${width} bank`);
    await page.evaluate(() => scrollTo(0, 0));
    if ([1280, 390].includes(width)) await page.screenshot({ path: path.join(output, `bank-${width}.png`), fullPage: false });
    for (const [target, mode] of [['escolaridades', 'schooling'], ['f931', 'f931']]) {
      await page.locator(`.report-task-link[href="#${target}"]`).click();
      await show(page, mode);
      await healthy(page, `${width} ${mode}`);
    }
    await page.goBack();
    await show(page, 'schooling');
    await page.goForward();
    await show(page, 'f931');
    assert.equal(await page.locator('[data-f931-submit]').isDisabled(), true);
    await page.locator('.report-task-link[href="#resumen"]').click();
    await show(page, 'overview');
    assert.equal(await page.locator('#loadError').isVisible(), true);
    await page.locator('#retryReportLoad').click();
    await page.locator('#downloadRrhhXlsx:enabled').waitFor();
    assert.equal(sourceCalls(), 2);
    await healthy(page, `${width} recovered overview`);
    await page.locator('.report-task-link[href="#bancarizacion"]').click();
    await show(page, 'bank');
    assert.equal(await page.locator('#bankControlPeriod').inputValue(), '2026-08');
    assert.equal(await page.locator('#bankControlCredicoop').inputValue(), 'cuenta_corriente');
    assert.equal(await page.locator('#bankControlWorkbook').evaluate(input => input.files.length), 1);
    await page.locator('.report-task-extras a[href="#descargas"]').click();
    await show(page, 'overview');
    await page.waitForFunction(() => document.activeElement?.closest('#descargas') !== null);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadRrhhXlsx').click()]);
    assert.match(download.suggestedFilename(), /\.xlsx$/);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.report-index').isVisible(), false);
    assert.equal(await page.locator('.site-header').isVisible(), false);
    assert.equal(await page.locator('#reportContent').isVisible(), true);
    await page.emulateMedia({ media: 'screen' });
    await page.locator('.report-task-extras a[href="#todas-las-herramientas"]').click();
    await show(page, 'all');
    await page.evaluate(() => { location.hash = '#%ZZ'; });
    await show(page, 'overview');
    assert.deepEqual(errors, []);
    checks.push({ width, sourceFailureRecovery: true, selectionRetained: true, history: true, actualXlsxDownload: true, noOverflow: true });
    await context.close();
  }

  const delayed = await fixture();
  await delayed.page.goto(`${origin}/reportes-rrhh#descargas`);
  await delayed.page.locator('#downloadRrhhXlsx:enabled').waitFor();
  await delayed.page.waitForFunction(() => document.activeElement?.closest('#descargas') !== null);
  assert.deepEqual(delayed.errors, []);
  await delayed.context.close();
  checks.push({ bookmarkedDownloadAfterSourceLoad: true });

  const fallback = await fixture({ failSource: true, blockIsland: true });
  await fallback.page.goto(`${origin}/reportes-rrhh#bancarizacion`);
  await fallback.page.waitForFunction(() => document.querySelector('#loadError').hidden === false);
  assert.equal(await fallback.page.locator('[data-report-panel]:not([hidden])').count(), 4);
  assert.equal(await fallback.page.locator('#bankControlWorkbook').isEnabled(), true);
  assert.deepEqual(fallback.errors, []);
  await fallback.context.close();
  checks.push({ islandUnavailableFallback: true });
  console.log(JSON.stringify({ output, externalRequests: 0, checks }, null, 2));
} finally { await browser.close(); }
