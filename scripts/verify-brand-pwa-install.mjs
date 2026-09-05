// Real Chrome service-worker smoke using only the built public shell.
// No credentials, production requests, API handlers or application data writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const workerSource = await fs.readFile(path.join(publicRoot, 'sw.js'), 'utf8');
const manifest = JSON.parse(await fs.readFile(path.join(publicRoot, 'manifest.webmanifest'), 'utf8'));
const brandPaths = ['/assets/municontrol-enterprise.css', '/assets/brand/logo-horizontal.svg', '/assets/brand/logo-horizontal-inverse.svg'];
const precacheBlock = workerSource.match(/const\s+PRECACHE_URLS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
assert.ok(precacheBlock, 'build contiene la lista pública explícita del service worker');
const precache = Array.from(precacheBlock[1].matchAll(/(['"])(.*?)\1/g), (match) => match[2]);
assert.ok(precache.length > brandPaths.length);
const neverBlock = workerSource.match(/const\s+NEVER_INTERCEPT_PATHS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
assert.ok(neverBlock, 'build conserva las exclusiones privadas explícitas');
const neverPaths = new Set(Array.from(neverBlock[1].matchAll(/(['"])(.*?)\1/g), (match) => match[2]));
const privatePath = (value) => neverPaths.has(value) || /^\/(?:api(?:\/|$)|internal|rrhh-data(?:\/|$)|recibos-sueldo(?:[/.]|$)|datos-personales(?:[/.]|$)|nomina-control(?:[/.]|$)|login(?:[/.]|$))/.test(value);
for (const pathname of precache) {
  assert.match(pathname, /^\/(?!\/)[a-zA-Z0-9/_.-]+$/);
  assert.ok(!privatePath(pathname), `fuera del precache: ${pathname}`);
}
for (const pathname of brandPaths) assert.ok(precache.includes(pathname), `${pathname}: precache explícito`);
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.scope, '/');
assert.equal(manifest.start_url, '/');
for (const icon of manifest.icons) assert.match(icon.src, /^\/assets\/pwa\/identity-[a-f0-9]{12}\//);

const allowed = new Map();
for (const pathname of new Set(['/', '/sw.js', ...precache, ...manifest.icons.map(icon => icon.src)])) {
  const relative = pathname === '/' ? 'friendly-dashboard.html' : pathname.slice(1);
  const filename = path.extname(relative) ? relative : `${relative}.html`;
  const resolved = path.resolve(publicRoot, filename);
  assert.ok(resolved.startsWith(`${publicRoot}${path.sep}`), `archivo dentro de public/: ${pathname}`);
  const real = await fs.realpath(resolved);
  assert.ok(real.startsWith(`${publicRoot}${path.sep}`), `sin enlace fuera de public/: ${pathname}`);
  allowed.set(pathname, real);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const served = [];
const rejected = [];
let networkDisconnected = false;
const server = http.createServer(async (request, response) => {
  if (networkDisconnected) { request.socket.destroy(); return; }
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const filename = allowed.get(pathname);
  if (request.method !== 'GET' || !filename || privatePath(pathname)) {
    rejected.push({ method: request.method, pathname });
    response.writeHead(404, { 'Cache-Control': 'no-store' });
    response.end('Not available in the public PWA smoke.');
    return;
  }
  try {
    const bytes = await fs.readFile(filename);
    served.push(pathname);
    response.writeHead(200, {
      'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': pathname === '/sw.js' ? 'no-cache' : 'public, max-age=60',
      ...(pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
    });
    response.end(bytes);
  } catch {
    response.writeHead(500, { 'Cache-Control': 'no-store' });
    response.end('Built asset unavailable.');
  }
});
let browser;
let origin;
const blockedExternal = [];
const blockedApi = [];
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-background-networking'] });
  const context = await browser.newContext({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { blockedExternal.push(url.origin); return route.abort(); }
    if (url.pathname.startsWith('/api/')) { blockedApi.push(url.pathname); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(15000);
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    return registration?.active?.state === 'activated' && Boolean(navigator.serviceWorker.controller);
  });
  const installed = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const names = await caches.keys();
    const entries = [];
    for (const name of names) {
      const cache = await caches.open(name);
      entries.push({ name, urls: (await cache.keys()).map(request => new URL(request.url).pathname) });
    }
    return { state: registration.active?.state, script: registration.active?.scriptURL, scope: registration.scope, entries };
  });
  assert.equal(installed.state, 'activated');
  assert.equal(installed.script, `${origin}/sw.js`);
  assert.equal(installed.scope, `${origin}/`);
  assert.equal(installed.entries.length, 1, 'contexto limpio con una sola versión de caché');
  assert.match(installed.entries[0].name, /^municontrol-friendly-public-build-[a-f0-9]{16}$/);
  assert.deepEqual(new Set(installed.entries[0].urls), new Set(precache));
  assert.ok(installed.entries[0].urls.every(pathname => !privatePath(pathname)));
  // Disconnect the actual local source too: onLine can remain true in Chrome
  // with an intercepted request, so it is not accepted as offline evidence.
  const servedBeforeOffline = served.length;
  networkDisconnected = true;
  await context.setOffline(true);
  const offlinePage = await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  assert.equal(offlinePage.status(), 200);
  assert.ok(offlinePage.fromServiceWorker(), 'navegación sin red recuperada por el service worker');
  await page.waitForFunction(() => document.querySelector('#dashboard')?.hidden === false);
  const offline = await page.evaluate(async (paths) => {
    const resources = [];
    for (const pathname of paths) {
      const response = await fetch(pathname, { cache: 'no-store' });
      const text = await response.text();
      resources.push({ pathname, status: response.status, type: response.headers.get('content-type'), length: text.length });
    }
    const brand = document.querySelector('.brand-name');
    return {
      online: navigator.onLine,
      title: document.title,
      brandImage: brand ? getComputedStyle(brand).backgroundImage : null,
      resources,
    };
  }, brandPaths);
  assert.equal(served.length, servedBeforeOffline, 'cero archivos nuevos servidos después de cortar la red local');
  assert.match(offline.title, /MuniControl/);
  assert.match(offline.brandImage, /logo-horizontal-inverse\.svg/);
  for (const resource of offline.resources) {
    assert.equal(resource.status, 200, resource.pathname);
    assert.ok(resource.length > 100, `${resource.pathname}: contenido recuperado sin red`);
    assert.match(resource.type, resource.pathname.endsWith('.css') ? /text\/css/ : /image\/svg\+xml/);
  }
  const cacheKeysAfterOffline = await page.evaluate(async () => {
    const paths = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
    }
    return paths;
  });
  assert.ok(cacheKeysAfterOffline.every(pathname => !privatePath(pathname)), 'sin rutas privadas/API en caché tras el recorrido');
  assert.deepEqual(blockedExternal, [], 'el shell y worker no solicitaron recursos externos');
  assert.ok(served.every(pathname => !privatePath(pathname)), 'el servidor sólo sirvió archivos públicos');
  assert.deepEqual(rejected.filter(request => request.pathname !== '/favicon.ico'), [], 'sin recursos locales no permitidos');
  console.log(JSON.stringify({
    smoke: 'built public PWA in real Chrome', activated: installed.state === 'activated',
    cache: installed.entries[0].name, precachedAssets: installed.entries[0].urls.length,
    versionedIcons: manifest.icons.length, offlineNavigation: true, offlineBrandResources: offline.resources,
    localNetworkDisconnected: true, browserReportsOnline: offline.online,
    privateOrApiCached: false, apiCallsServed: 0, blockedSessionChecks: blockedApi.length,
    externalRequests: blockedExternal.length,
  }, null, 2));
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    if (server.listening) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
}
