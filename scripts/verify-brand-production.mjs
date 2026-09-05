// Public, read-only release verification. No authentication, API or database calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const base = 'https://municipio-junin-friendly.vercel.app';
const results = [];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const normalized = (bytes, file) => /\.(?:svg|js|css|webmanifest)$/.test(file)
  ? Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n')) : bytes;
async function get(route, headers = {}) {
  return fetch(`${base}${route}`, { headers, signal: AbortSignal.timeout(20000) });
}

const manifest = JSON.parse(await fs.readFile(path.join(publicRoot, 'manifest.webmanifest'), 'utf8'));
const files = [...new Set([
  'assets/brand/logo-horizontal.svg', 'assets/brand/logo-horizontal-inverse.svg',
  'assets/brand/municontrol-mark.svg', 'assets/brand/avatar.svg',
  'assets/brand/municontrol-social-card-v1.png', 'assets/municontrol-enterprise.css',
  'assets/payroll-receipt-preview.js', 'manifest.webmanifest', 'sw.js',
  ...manifest.icons.map(icon => icon.src.slice(1)),
  manifest.icons[0].src.slice(1).replace('icon-192.png', 'icon-180.png'),
])];
for (const file of files) {
  const response = await get(`/${file}`);
  assert.equal(response.status, 200, file);
  const remote = normalized(Buffer.from(await response.arrayBuffer()), file);
  const local = normalized(await fs.readFile(path.join(publicRoot, file)), file);
  assert.equal(hash(remote), hash(local), `${file}: served content must match reviewed build`);
  results.push({ file, status: 200, matchesLocalBuild: true });
}
for (const agent of ['WhatsApp/2.26.0 A', 'facebookexternalhit/1.1']) {
  for (const route of ['/', '/login', '/recibos-sueldo']) {
    const response = await get(route, { 'User-Agent': agent });
    assert.equal(response.status, 200, `${agent} ${route}`);
    const html = await response.text();
    assert.equal((html.match(/property="og:image"/g) || []).length, 1);
    assert.ok(html.includes(`content="${base}/assets/brand/municontrol-social-card-v1.png"`));
    assert.ok(html.includes('MuniControl | Gestión municipal, más simple'));
    assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
    assert.match(html, /\/assets\/pwa\/identity-[a-f0-9]{12}\/icon\.svg/);
    results.push({ route, userAgent: agent, status: 200, publicSocialMetadata: true });
  }
}
const privateOutput = await get('/output/pdf/noelia-bono-municontrol-firma-grafica.pdf');
assert.equal(privateOutput.status, 404, 'the private PDF must not be published as a static asset');
console.log(JSON.stringify({ base, publicReadOnly: true, privatePdfNotPublished: true, checks: results.length, results }, null, 2));
