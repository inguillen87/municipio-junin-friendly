import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

test('the shell UX script is published and injected on every sidebar page next to the capability gate', () => {
  const build = read('scripts/build-friendly.mjs');
  assert.match(build, /'assets\/internal-shell-ux\.js',/);
  assert.match(build, /withShellUx[\s\S]*internal-shell-ux\.js[\s\S]*<script src="\/assets\/internal-shell-ux\.js"><\/script><\/head>/);
  const source = read('assets/internal-shell-ux.js');
  assert.match(source, /VISIBILITY_GRACE_MS = 20 \* 60 \* 1000/);
  assert.match(source, /addEventListener\('visibilitychange'/);
  assert.match(source, /select\[multiple\]/);
  assert.doesNotMatch(source, /addEventListener\('pagehide'|logoutButton/, 'logout and page unload keep the panels\' own erase policy');
});

async function browser() {
  try {
    const { chromium } = await import('playwright');
    return await chromium.launch();
  } catch { return null; }
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><script>${read('assets/internal-shell-ux.js')}</script></head><body>
<label>Reparticiones<select id="codes" multiple size="4"><option value="1">1 · A</option><option value="2">2 · B</option><option value="3" disabled>3 · C</option></select></label>
<p id="erased">no</p>
<script>
  window.changes = 0; window.seen = [];
  document.getElementById('codes').addEventListener('change', e => { window.changes++; window.seen = Array.from(e.target.selectedOptions, o => o.value); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) document.getElementById('erased').textContent = 'yes'; });
</script></body></html>`;

test('multi-select helpers select and clear every enabled option with a real change event', { timeout: 60000 }, async (t) => {
  const chrome = await browser();
  if (!chrome) { t.skip('Chromium unavailable'); return; }
  try {
    const page = await chrome.newPage();
    await page.setContent(PAGE);
    await page.waitForSelector('[data-mc-multi-helpers]');
    assert.equal(await page.textContent('.mc-multi-count'), '0 de 2 elegidas');
    await page.click('.mc-multi-helper:has-text("Todas")');
    assert.deepEqual(await page.evaluate(() => window.seen), ['1', '2']);
    assert.equal(await page.textContent('.mc-multi-count'), '2 de 2 elegidas');
    assert.equal(await page.isDisabled('.mc-multi-helper:has-text("Todas")'), true);
    await page.click('.mc-multi-helper:has-text("Ninguna")');
    assert.deepEqual(await page.evaluate(() => window.seen), []);
    assert.equal(await page.evaluate(() => window.changes), 2);
    // A select added later is decorated as well.
    await page.evaluate(() => { const s = document.createElement('select'); s.multiple = true; s.id = 'late'; s.innerHTML = '<option>x</option>'; document.body.appendChild(s); });
    await page.waitForSelector('#late + [data-mc-multi-helpers]');
  } finally { await chrome.close(); }
});

test('visibility grace keeps the panels alive while the tab is hidden and delivers the erase after the grace', { timeout: 60000 }, async (t) => {
  const chrome = await browser();
  if (!chrome) { t.skip('Chromium unavailable'); return; }
  try {
    const page = await chrome.newPage();
    await page.setContent(PAGE);
    // The browser's own answer is emulated through the prototype getter the shim reads lazily.
    const hiddenNative = async () => page.evaluate(() => Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get.call(document));
    assert.equal(await page.evaluate(() => document.hidden), false);
    await page.evaluate(() => { Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return window.__nativeHidden === true; } }); });
    await page.evaluate(() => { window.__nativeHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await hiddenNative(), true);
    assert.equal(await page.evaluate(() => document.hidden), false, 'panels keep seeing a visible document during the grace');
    assert.equal(await page.textContent('#erased'), 'no');
    await page.evaluate(() => { window.__nativeHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.textContent('#erased'), 'no');
    assert.equal(await page.evaluate(() => document.hidden), false);
    assert.equal(await page.getAttribute('html', 'data-mc-visibility-grace'), String(20 * 60 * 1000));
    // After the grace the panels get the real erase, and the tab coming back is delivered too.
    await page.evaluate(() => { window.__nativeHidden = true; document.dispatchEvent(new Event('visibilitychange')); window.MuniControlShellUx.expireVisibilityGrace(); });
    assert.equal(await page.textContent('#erased'), 'yes');
    assert.equal(await page.evaluate(() => document.hidden), true);
    await page.evaluate(() => { window.__nativeHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.evaluate(() => document.hidden), false);
  } finally { await chrome.close(); }
});
