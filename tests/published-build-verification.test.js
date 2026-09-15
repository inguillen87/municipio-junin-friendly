import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publishedBuildVerification } from '../scripts/lib/published-build-verification.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'municontrol-published-build-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'public');
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.copyFileSync(new URL('../assets/app-routes.js', import.meta.url), path.join(root, 'assets/app-routes.js'));
  fs.writeFileSync(path.join(directory, 'novedades-nomina.html'), '<a href="login.html">source</a>');
  fs.writeFileSync(path.join(root, 'novedades-nomina.html'), '<a href="/acceso">built</a>');
  fs.writeFileSync(path.join(root, 'assets/report-centre.js'), 'import("/assets/islands/catalog-123.js");');
  return { directory, root };
}

test('published checks hash transformed build bytes and request canonical HTML without following redirects', async t => {
  const { directory, root } = fixture(t), calls = [];
  const build = publishedBuildVerification({ root, origin: 'https://municipal.example', release: 'reviewed-sha',
    fetchImpl: async (url, options) => { calls.push({url, options}); return { url: url.href, status: 200 }; } });
  const expected = build.expectedHashes(['novedades-nomina.html', 'assets/report-centre.js']);
  assert.equal(expected['novedades-nomina.html'], hash(fs.readFileSync(path.join(root, 'novedades-nomina.html'))));
  assert.notEqual(expected['novedades-nomina.html'], hash(fs.readFileSync(path.join(directory, 'novedades-nomina.html'))));
  await build.fetchFile('novedades-nomina.html');
  await build.fetchFile('assets/report-centre.js');
  assert.equal(calls[0].url.pathname, '/novedades');
  assert.equal(calls[0].url.searchParams.get('release'), 'reviewed-sha');
  assert.equal(calls[1].url.pathname, '/assets/report-centre.js');
  assert.ok(calls.every(call => call.options.redirect === 'error' && call.options.cache === 'no-store'));
  assert.notEqual(expected['assets/report-centre.js'], hash('import("__MC_REPORT_CATALOG_BUNDLE__");'));
  assert.notEqual(expected['assets/report-centre.js'], hash(fs.readFileSync(path.join(root, 'assets/report-centre.js')) + '\n'));
});

test('missing built files cannot fall back to otherwise present sources', t => {
  const { root } = fixture(t);
  const build = publishedBuildVerification({ root, origin: 'https://municipal.example' });
  fs.unlinkSync(path.join(root, 'novedades-nomina.html'));
  assert.throws(() => build.expectedHashes(['novedades-nomina.html']), { code: 'ENOENT' });
  fs.unlinkSync(path.join(root, 'assets/app-routes.js'));
  assert.throws(() => publishedBuildVerification({ root, origin: 'https://municipal.example' }), { code: 'ENOENT' });
});

test('a redirect, foreign response or unknown route never becomes a successful publication check', async t => {
  const { root } = fixture(t);
  for (const url of ['https://foreign.example/novedades', 'https://municipal.example/acceso']) {
    const build = publishedBuildVerification({ root, origin: 'https://municipal.example', fetchImpl: async () => ({url, status: 200}) });
    await assert.rejects(build.fetchFile('novedades-nomina.html'), /PUBLISHED_RESPONSE_URL_CHANGED/);
    assert.throws(() => build.url('unknown.html'), /PUBLISHED_ROUTE_MISSING/);
    assert.throws(() => build.expectedHashes(['../novedades-nomina.html']), /PUBLISHED_FILE_INVALID/);
  }
  const build = publishedBuildVerification({ root, origin: 'https://municipal.example', fetchImpl: async () => { throw TypeError('unexpected redirect'); } });
  await assert.rejects(build.fetchFile('novedades-nomina.html'), /unexpected redirect/);
});
