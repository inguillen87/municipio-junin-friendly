import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Every browser module published by scripts/build-friendly.mjs must find its static
// imports in the same published set. A missing dependency is a 404 at runtime and the
// whole importing panel fails to load (found on 2026-11-05 with art-extra-suss-template.js).
const root = new URL('..', import.meta.url);
// Published set: the allowlist of build-friendly plus the assets other build steps emit
// (clock fleet copies by bare name; the React parameter loader is rewritten into output).
const build = fs.readFileSync(new URL('scripts/build-friendly.mjs', root), 'utf8');
const clockFleet = fs.readFileSync(new URL('scripts/build-clock-fleet.mjs', root), 'utf8');
const published = new Set([
  ...[...build.matchAll(/'(assets\/[^']+\.(?:js|mjs))'/g)].map(m => m[1]),
  ...[...clockFleet.matchAll(/'([a-z0-9-]+\.js)'/g)].map(m => 'assets/' + m[1]),
  'assets/payroll-parameters-loader.js',
]);
const generated = file => file.startsWith('assets/vendor/'); // copied from node_modules at build time
const importPattern = /(?:^|\n)\s*(?:import\s+(?:[^'";]*?\s+from\s+)?|export\s+(?:\*|\{[^}]*\})\s+from\s+)['"](\.{1,2}\/[^'"]+)['"]/g;

test('published browser assets only import other published assets (static imports)', () => {
  assert.ok(published.size > 300, 'allowlist read');
  const missing = [];
  for (const file of published) {
    const abs = new URL(file, root);
    if (generated(file)) continue;
    if (!fs.existsSync(abs)) { missing.push(`${file} (file absent)`); continue; }
    const source = fs.readFileSync(abs, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      if (!target.startsWith('assets/')) continue; // shared modules outside assets are bundled or served elsewhere
      if (!published.has(target)) missing.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(missing, [], 'static imports not published:\n' + missing.join('\n'));
});
