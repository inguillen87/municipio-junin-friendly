import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publishedAssetPaths,missingPublishedAssetImports} from './helpers/published-asset-import-closure.js';

// Every browser module published by scripts/build-friendly.mjs must find its static
// imports in the same published set. A missing dependency is a 404 at runtime and the
// whole importing panel fails to load (found on 2026-11-05 with art-extra-suss-template.js).
const root = new URL('..', import.meta.url);
// Published set: the allowlist of build-friendly plus the assets other build steps emit
// (clock fleet copies by bare name; the React parameter loader is rewritten into output).
const build = fs.readFileSync(new URL('scripts/build-friendly.mjs', root), 'utf8');
const clockFleet = fs.readFileSync(new URL('scripts/build-clock-fleet.mjs', root), 'utf8');
const published = publishedAssetPaths({build, clockFleet});

test('published browser assets only import other published assets (static imports)', () => {
  assert.ok(published.size > 300, 'allowlist read');
  const missing = missingPublishedAssetImports(published, file => {
    const abs = new URL(file, root);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  });
  assert.deepEqual(missing, [], 'static imports not published:\n' + missing.join('\n'));
});
