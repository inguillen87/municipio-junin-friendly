// Public/read-only verification of the deployed workspace. No uploads or API calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const base = 'https://municipio-junin-friendly.vercel.app';
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-report-production-'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const issues = [];
    let apiCalls = 0;
    await context.route('**/api/**', route => { apiCalls++; return route.abort(); });
    const page = await context.newPage();
    page.on('pageerror', error => issues.push(error.message));
    page.on('response', response => { if (response.status() >= 400) issues.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    await page.goto(`${base}/reportes-rrhh#bancarizacion`);
    await page.locator('.report-task-link[aria-current="page"][href="#bancarizacion"]').waitFor();
    await page.waitForFunction(() => !document.querySelector('#reportContent').hidden);
    assert.equal(await page.locator('[data-report-panel]:not([hidden])').count(), 1);
    assert.equal(await page.locator('.bank-control-requirements').getAttribute('open'), null);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, `reportes-${width}.png`) });
    for (const target of ['escolaridades', 'f931', 'resumen']) {
      await page.locator(`.report-task-link[href="#${target}"]`).click();
      await page.locator(`.report-task-link[aria-current="page"][href="#${target}"]`).waitFor();
      assert.equal(await page.locator('[data-report-panel]:not([hidden])').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    assert.equal(await page.locator('[data-f931-submit]').isDisabled(), true);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.report-index').isVisible(), false);
    assert.equal(await page.locator('#reportContent').isVisible(), true);
    assert.equal(apiCalls, 0);
    assert.deepEqual(issues, []);
    results.push({ width, liveNavigation: true, sourceLoaded: true, printWithoutNavigation: true, noOverflow: true, apiCalls });
    await context.close();
  }
  console.log(JSON.stringify({ base, output, publicReadOnly: true, results }, null, 2));
} finally { await browser.close(); }
