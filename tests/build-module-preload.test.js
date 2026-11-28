// The build announces each page's static module graph with <link rel="modulepreload"> so a first visit fetches it in
// parallel (Novedades: 11 import levels; Nómina: 15). Only same-origin static imports are listed; import() stays lazy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const build = fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');

test('the build adds module preloads after every page is written and before the release identity', () => {
  const call = build.indexOf('addModulePreloads(output);');
  assert.ok(call > build.indexOf('buildDocumentReader(root, output);'), 'after the last page transformation');
  assert.ok(call < build.indexOf("const versionHash = crypto.createHash('sha256');"), 'before hashing the release');
  assert.ok(call < build.indexOf('buildReleaseIdentity(root, output);'));
});

test('module preload discovery follows static imports only and never leaves the output folder', async () => {
  const body = build.slice(build.indexOf('function addModulePreloads(outputRoot) {'));
  const { default: path } = await import('node:path');
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-preload-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets/a.js'), "import { b } from './b.js';\nimport './c.js';\nexport * from './d.js';\nconst lazy = () => import('./lazy.js');\n");
  fs.writeFileSync(path.join(dir, 'assets/b.js'), "import '../../outside.js';\nexport const b = 1;\n");
  fs.writeFileSync(path.join(dir, 'assets/c.js'), "import { a } from './a.js';\n");
  fs.writeFileSync(path.join(dir, 'assets/d.js'), 'export const d = 1;\n');
  fs.writeFileSync(path.join(dir, 'assets/lazy.js'), 'export const lazy = 1;\n');
  fs.writeFileSync(path.join(dir, 'page.html'), '<html><head><title>x</title></head><body><script type="module" src="/assets/a.js"></script><script type="module">import "./assets/d.js";</script></body></html>');
  fs.writeFileSync(path.join(dir, 'plain.html'), '<html><head></head><body><script src="/assets/a.js"></script></body></html>');
  const { addModulePreloads } = await import('data:text/javascript;base64,' + Buffer.from("import fs from 'node:fs';import path from 'node:path';export " + body).toString('base64'));
  addModulePreloads(dir);
  const page = fs.readFileSync(path.join(dir, 'page.html'), 'utf8');
  assert.deepEqual([...page.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m => m[1]), ['/assets/a.js', '/assets/b.js', '/assets/c.js', '/assets/d.js']);
  assert.ok(page.indexOf('modulepreload') < page.indexOf('</head>'));
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'plain.html'), 'utf8'), /modulepreload/, 'classic scripts are not modules');
  addModulePreloads(dir);
  assert.equal([...fs.readFileSync(path.join(dir, 'page.html'), 'utf8').matchAll(/modulepreload/g)].length, 4, 'idempotent');
  fs.rmSync(dir, { recursive: true, force: true });
});
