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
  assert.doesNotMatch(source, /Object\.defineProperty\(document,\s*'(?:hidden|visibilityState)'|addEventListener\('visibilitychange'|stopImmediatePropagation|VISIBILITY_GRACE_MS/);
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
<fieldset id="scope"><label>Reparticiones<select id="codes" multiple size="4"><option value="1">1 · A</option><option value="2">2 · B</option><option value="3" disabled>3 · C</option><optgroup id="unavailable" label="No disponibles" disabled><option value="4">4 · D</option></optgroup></select></label></fieldset>
<p id="erased">no</p>
<script>
  window.changes = 0; window.seen = []; window.visibilitySeen = [];
  document.getElementById('codes').addEventListener('change', e => { window.changes++; window.seen = Array.from(e.target.selectedOptions, o => o.value); });
  document.addEventListener('visibilitychange', () => { window.visibilitySeen.push(document.hidden); if (document.hidden) document.getElementById('erased').textContent = 'yes'; });
</script></body></html>`;

test('multi-select helpers select and clear enabled options, preserve locked choices and respect disabled controls', { timeout: 60000 }, async (t) => {
  const chrome = await browser();
  if (!chrome) { t.skip('Chromium unavailable'); return; }
  try {
    const page = await chrome.newPage();
    await page.setContent(PAGE);
    await page.waitForSelector('[data-mc-multi-helpers]');
    const all = '.mc-multi-helper:has-text("Todas")', none = '.mc-multi-helper:has-text("Ninguna")';
    assert.equal(await page.textContent('.mc-multi-count'), '0 de 2 disponibles');
    await page.click(all);
    assert.deepEqual(await page.evaluate(() => window.seen), ['1', '2']);
    assert.equal(await page.textContent('.mc-multi-count'), '2 de 2 disponibles');
    assert.equal(await page.isDisabled(all), true);
    const noOpChanges = await page.evaluate(() => window.changes);
    await page.evaluate(() => document.querySelector('.mc-multi-helper').dispatchEvent(new Event('click')));
    assert.equal(await page.evaluate(() => window.changes), noOpChanges, 'an unchanged selection does not emit another change');
    await page.click(none);
    assert.deepEqual(await page.evaluate(() => window.seen), []);
    assert.equal(await page.evaluate(() => window.changes), 2);

    await page.evaluate(() => { const s = document.getElementById('codes'); s.options[0].selected = true; s.options[2].selected = true; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.click(none);
    assert.deepEqual(await page.evaluate(() => window.seen), ['3'], 'Ninguna preserves a selected disabled option');
    const guardedChanges = await page.evaluate(() => window.changes);
    await page.evaluate(() => { document.getElementById('scope').disabled = true; document.querySelector('.mc-multi-helper').dispatchEvent(new Event('click')); });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.mc-multi-helper')).every(b => b.disabled));
    assert.deepEqual(await page.evaluate(() => window.seen), ['3']);
    assert.equal(await page.evaluate(() => window.changes), guardedChanges, 'the handler rejects a synthetic click while the fieldset is disabled');
    await page.evaluate(() => { document.getElementById('scope').disabled = false; });
    await page.waitForFunction(() => !document.querySelector('.mc-multi-helper').disabled);
    await page.evaluate(() => { document.getElementById('codes').disabled = true; document.querySelector('.mc-multi-helper').dispatchEvent(new Event('click')); });
    assert.equal(await page.evaluate(() => window.changes), guardedChanges, 'the handler rechecks the select before changing its options');
    await page.evaluate(() => { document.getElementById('codes').disabled = false; });
    await page.waitForFunction(() => !document.querySelector('.mc-multi-helper').disabled);

    await page.evaluate(() => { document.getElementById('unavailable').disabled = false; });
    await page.waitForFunction(() => document.querySelector('.mc-multi-count').textContent === '0 de 3 disponibles');
    await page.click(all);
    assert.deepEqual(await page.evaluate(() => window.seen), ['1', '2', '3', '4']);
    await page.evaluate(() => { document.getElementById('unavailable').disabled = true; });
    await page.waitForFunction(() => document.querySelector('.mc-multi-count').textContent === '2 de 2 disponibles');
    await page.click(none);
    assert.deepEqual(await page.evaluate(() => window.seen), ['3', '4'], 'Ninguna also preserves choices in a disabled optgroup');

    // A select added later is decorated as well.
    await page.evaluate(() => { const s = document.createElement('select'); s.multiple = true; s.id = 'late'; s.innerHTML = '<option>x</option>'; document.body.appendChild(s); });
    await page.waitForSelector('#late + [data-mc-multi-helpers]');
  } finally { await chrome.close(); }
});

test('the shell preserves native visibility getters and delivers hidden and visible events to the panels', { timeout: 60000 }, async (t) => {
  const chrome = await browser();
  if (!chrome) { t.skip('Chromium unavailable'); return; }
  try {
    const page = await chrome.newPage();
    await page.setContent(PAGE);
    assert.deepEqual(await page.evaluate(() => ({ hidden: Object.hasOwn(document, 'hidden'), state: Object.hasOwn(document, 'visibilityState') })), { hidden: false, state: false });
    await page.evaluate(() => {
      Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return window.__nativeHidden === true; } });
      Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return window.__nativeHidden === true ? 'hidden' : 'visible'; } });
      window.visibilitySeen = [];
      window.__nativeHidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => document.hidden), true);
    assert.equal(await page.evaluate(() => document.visibilityState), 'hidden');
    assert.equal(await page.textContent('#erased'), 'yes');
    await page.evaluate(() => { window.__nativeHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.evaluate(() => document.hidden), false);
    assert.equal(await page.evaluate(() => document.visibilityState), 'visible');
    assert.deepEqual(await page.evaluate(() => window.visibilitySeen), [true, false]);
    assert.equal(await page.getAttribute('html', 'data-mc-visibility-grace'), null);
  } finally { await chrome.close(); }
});
