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
