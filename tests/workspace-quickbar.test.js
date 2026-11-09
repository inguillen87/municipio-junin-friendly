import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { QUICKBARS } from '../assets/workspace-quickbar.js';

test('every quick action points at an existing control of its screen and never sends requests itself', () => {
  const source = fs.readFileSync('assets/workspace-quickbar.js', 'utf8');
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
  const page = fs.readFileSync('internal-dashboard.html', 'utf8'), roster = fs.readFileSync('assets/native-roster-ui.js', 'utf8');
  assert.match(page, /<nav data-quickbar="legajos" data-requires-all-capability="workforce\.employee\.read"><\/nav>/);
  for (const action of QUICKBARS.legajos.actions) {
    assert.ok(['focus', 'filter', 'scroll', 'click', 'print', 'link', 'open'].includes(action.run), action.text);
    if (action.run === 'link') { assert.ok(fs.existsSync(action.href.split('#')[0]), action.href); continue; }
    const hooks = [...action.target.matchAll(/\[([a-z-]+)(?:="[^"]*")?\]|#([A-Za-z]+)|name="([a-z]+)"|\.([a-z-]+)/g)].map(m => m[1] || m[2] || m[3] || m[4]);
    for (const hook of hooks) assert.ok(page.includes(hook) || roster.includes(hook), action.text + ' → ' + hook);
  }
});

test('Ausentismo and Relojes quickbars only target ids their pages define', () => {
  for (const [screen, file] of [['ausentismo', 'ausentismo-control.html'], ['relojes', 'relojes-marcaciones.html']]) {
    const page = fs.readFileSync(file, 'utf8');
    assert.match(page, new RegExp(`<nav data-quickbar="${screen}"></nav>`)); assert.match(page, /src="assets\/workspace-quickbar\.js"/);
    for (const action of QUICKBARS[screen].actions) for (const selector of [action.target, action.before, action.reveal].filter(Boolean)) {
      const id = /^#([A-Za-z]+)$/.exec(selector)?.[1], chart = /data-mc-chart="([a-z-]+)"/.exec(selector)?.[1];
      if (id) assert.ok(page.includes(`id="${id}"`), screen + ' → ' + selector);
      else if (chart) assert.ok(fs.readFileSync('assets/absence-charts.js', 'utf8').includes(`key: '${chart}'`), selector);
      else assert.fail('unexpected selector ' + selector);
    }
  }
});

test('Inicio shortcuts open real pages and payroll tasks that exist', () => {
  const tasks = fs.readFileSync('assets/payroll-navigation.js', 'utf8');
  assert.match(fs.readFileSync('internal-dashboard.html', 'utf8'), /<nav data-quickbar="inicio"><\/nav>/);
  for (const { href } of QUICKBARS.inicio.actions) {
    const [file, hash] = href.split('#');
    if (file) assert.ok(fs.existsSync(file), href);
    if (file === 'nomina-control.html') assert.match(tasks, new RegExp(`id:'${hash}'`), href);
    if (!file) assert.match(fs.readFileSync('internal-dashboard.html', 'utf8'), new RegExp(`data-section="${hash}"`), href);
  }
});

test('Novedades quickbar targets the entry modes and sections of its page', () => {
  const page = fs.readFileSync('novedades-nomina.html', 'utf8');
  assert.match(page, /<nav data-quickbar="novedades"><\/nav>/);
  for (const action of QUICKBARS.novedades.actions) for (const selector of [action.target, action.reveal].filter(Boolean)) {
    const id = /^#([A-Za-z]+)$/.exec(selector)?.[1], mode = /value="([a-z]+)"/.exec(selector)?.[1];
    if (id) assert.ok(page.includes(`id="${id}"`), selector);
    else if (mode) assert.ok(page.includes(`name="sourceMode" value="${mode}"`), selector);
    else assert.fail(selector);
  }
});

test('quick actions are grouped and wrap: no row scrolls sideways, and a compact dock keeps the same groups', async () => {
  const { QUICK_GROUPS, quickGroupOf } = await import('../assets/workspace-quickbar.js');
  for (const [screen, config] of Object.entries(QUICKBARS)) {
    const groups = new Set(config.actions.map(quickGroupOf));
    for (const group of groups) assert.ok(QUICK_GROUPS[group], screen + ' → ' + group);
    assert.ok(groups.size >= 2 && groups.size <= 5, screen + ' groups: ' + groups.size);
  }
  const css = fs.readFileSync('assets/workspace-quickbar.css', 'utf8');
  assert.doesNotMatch(css, /overflow-x\s*:\s*(auto|scroll)/);
  assert.match(css, /\.mc-quickbar-row\{display:flex;flex-wrap:wrap/);
  assert.match(css, /\.mc-quickdock\{position:fixed/);
  assert.match(fs.readFileSync('assets/employee-detail-navigation.css', 'utf8'), /\.esn-chips\{grid-area:chips;display:flex;flex-wrap:wrap/);
  const source = fs.readFileSync('assets/workspace-quickbar.js', 'utf8');
  assert.match(source, /setAttribute\('aria-haspopup', 'menu'\)/);
  assert.match(source, /event\.key === 'Escape'/);
});

test('the desktop dock tucks away while scrolling down and never on the phone bottom bar', () => {
  const js = fs.readFileSync(new URL('../assets/workspace-quickbar.js', import.meta.url), 'utf8');
  const style = fs.readFileSync(new URL('../assets/workspace-quickbar.css', import.meta.url), 'utf8');
  assert.match(style, /\.mc-quickdock\[data-tucked=true\]\{transform:translate\(-50%,calc\(-100% - 16px\)\);opacity:0;pointer-events:none\}/);
  assert.match(style, /@media\(max-width:760px\)\{[^@]*\.mc-quickdock\[data-tucked=true\]\{transform:none\}/);
  assert.match(js, /matchMedia\('\(max-width:760px\)'\)\.matches\) return tuck\(false\)/);
  assert.match(js, /dock\.addEventListener\('focusin', \(\) => tuck\(false\)\)/);
});
