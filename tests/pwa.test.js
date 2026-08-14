import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file, encoding = 'utf8') => fs.readFileSync(new URL(`../${file}`, import.meta.url), encoding);

function pngDimensions(file) {
  const bytes = read(file, null);
  assert.deepEqual(Array.from(bytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10], `${file} no es PNG`);
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', `${file} no contiene IHDR`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function bootWorker({ responseHeaders = {} } = {}) {
  const listeners = new Map();
  const added = [];
  const deleted = [];
  const puts = [];
  let skipWaitingCalls = 0;
  let claimCalls = 0;
  const activeCacheName = 'municontrol-friendly-public-test-version';
  const cache = {
    async addAll(urls) { added.push(...Array.from(urls)); },
    async put(key, response) { puts.push({ key, response }); }
  };
  const caches = {
    async open(name) {
      assert.equal(name, activeCacheName);
      return cache;
    },
    async keys() {
      return ['unrelated-cache', 'municontrol-friendly-public-old-version', activeCacheName];
    },
    async delete(name) { deleted.push(name); return true; },
    async match() { return undefined; }
  };
  const context = vm.createContext({
    caches,
    console,
    fetch: async () => new Response('ok', { status: 200, headers: responseHeaders }),
    Headers,
    Map,
    Object,
    Promise,
    Request,
    Response,
    Set,
    URL,
    self: {
      location: { origin: 'https://friendly.example' },
      clients: { async claim() { claimCalls += 1; } },
      skipWaiting() { skipWaitingCalls += 1; },
      addEventListener(type, handler) { listeners.set(type, handler); }
    }
  });
  const source = read('sw.js').replaceAll('__PWA_CACHE_VERSION__', 'test-version');
  vm.runInContext(source, context, { filename: 'sw.js' });
  return {
    listeners,
    added,
    deleted,
    puts,
    get skipWaitingCalls() { return skipWaitingCalls; },
    get claimCalls() { return claimCalls; }
  };
}

function dispatchFetch(worker, request) {
  let responsePromise;
  worker.listeners.get('fetch')({
    request,
    respondWith(value) { responsePromise = value; }
  });
  return responsePromise;
}

test('manifest PWA es instalable y referencia iconos locales válidos', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.lang, 'es-AR');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#0b2637');

  const icon192 = manifest.icons.find((icon) => icon.sizes === '192x192' && icon.purpose === 'any');
  const icon512 = manifest.icons.find((icon) => icon.sizes === '512x512' && icon.purpose === 'any');
  const maskable = manifest.icons.find((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable');
  assert.ok(icon192);
  assert.ok(icon512);
  assert.ok(maskable);
  assert.deepEqual(pngDimensions(icon192.src.slice(1)), { width: 192, height: 192 });
  assert.deepEqual(pngDimensions(icon512.src.slice(1)), { width: 512, height: 512 });
  assert.deepEqual(pngDimensions(maskable.src.slice(1)), { width: 512, height: 512 });
  assert.deepEqual(pngDimensions('assets/pwa/icon-180.png'), { width: 180, height: 180 });
});

test('service worker precachea sólo el shell público agregado', async () => {
  const worker = bootWorker();
  let installPromise;
  worker.listeners.get('install')({ waitUntil(value) { installPromise = value; } });
  await installPromise;

  for (const expected of ['/friendly-dashboard.html', '/friendly-data.json', '/manifest.webmanifest']) {
    assert.ok(worker.added.includes(expected), `falta precachear ${expected}`);
  }
  for (const forbidden of ['/api/internal-data', '/api/internal-assistant', '/internal-dashboard.html', '/datos-personales.html', '/estructura.html', '/nomina-control.html', '/asistente.html', '/centro-ayuda.html', '/assets/internal-guide.js', '/assets/product-guidance.js']) {
    assert.ok(!worker.added.includes(forbidden), `no se debe precachear ${forbidden}`);
  }
  assert.equal(worker.skipWaitingCalls, 0, 'una instalación no debe reemplazar la versión activa a mitad de sesión');
});

test('service worker nunca intercepta APIs, páginas internas ni rutas nominales', () => {
  const worker = bootWorker();
  const privatePaths = [
    '/api/internal-data?resource=people',
    '/internal',
    '/internal-dashboard.html',
    '/datos-personales.html',
    '/estructura',
    '/organigrama',
    '/integracion-datos',
    '/nomina-control',
    '/asistente',
    '/asistente.html',
    '/centro-ayuda',
    '/centro-ayuda.html',
    '/ayuda',
    '/assets/internal-guide.js',
    '/assets/product-guidance.js',
    '/rrhh',
    '/rrhh-sync'
  ];
  for (const path of privatePaths) {
    const request = { method: 'GET', url: `https://friendly.example${path}`, mode: 'navigate', headers: new Headers() };
    assert.equal(dispatchFetch(worker, request), undefined, `el worker no debe responder ${path}`);
  }
  const external = { method: 'GET', url: 'https://example.org/friendly-data.json', mode: 'cors', headers: new Headers() };
  assert.equal(dispatchFetch(worker, external), undefined);
});

test('service worker ofrece fallback sólo para navegaciones públicas conocidas', async () => {
  const worker = bootWorker();
  const safeNavigation = {
    method: 'GET',
    url: 'https://friendly.example/calidad-datos',
    mode: 'navigate',
    headers: new Headers()
  };
  assert.equal(typeof dispatchFetch(worker, safeNavigation)?.then, 'function');

  const unknownNavigation = {
    method: 'GET',
    url: 'https://friendly.example/persona/123',
    mode: 'navigate',
    headers: new Headers()
  };
  assert.equal(dispatchFetch(worker, unknownNavigation), undefined);

  const authorizedStatic = {
    method: 'GET',
    url: 'https://friendly.example/friendly-data.json',
    mode: 'cors',
    headers: new Headers({ authorization: 'Bearer redacted' })
  };
  assert.equal(dispatchFetch(worker, authorizedStatic), undefined);
});

test('service worker respeta no-store y activa actualizaciones sólo por orden explícita', async () => {
  const worker = bootWorker({ responseHeaders: { 'cache-control': 'private, no-store' } });
  const safeStatic = {
    method: 'GET',
    url: 'https://friendly.example/friendly-data.json',
    mode: 'cors',
    headers: new Headers()
  };
  await dispatchFetch(worker, safeStatic);
  assert.equal(worker.puts.length, 0, 'una respuesta no-store no debe entrar al runtime cache');

  worker.listeners.get('message')({ data: { type: 'IGNORED' } });
  assert.equal(worker.skipWaitingCalls, 0);
  worker.listeners.get('message')({ data: { type: 'SKIP_WAITING' } });
  assert.equal(worker.skipWaitingCalls, 1);

  let activatePromise;
  worker.listeners.get('activate')({ waitUntil(value) { activatePromise = value; } });
  await activatePromise;
  assert.deepEqual(worker.deleted, ['municontrol-friendly-public-old-version']);
  assert.equal(worker.claimCalls, 1);
});

test('los puntos de entrada enlazan el manifiesto y registran el worker', () => {
  for (const file of ['login.html', 'friendly-dashboard.html', 'modulos.html', 'reportes-rrhh.html', 'calidad-datos.html']) {
    const html = read(file);
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/, `${file} debe enlazar el manifiesto`);
    assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/pwa\/icon-180\.png">/, `${file} debe publicar icono iOS`);
    assert.match(html, /serviceWorker\.register\('\/sw\.js', \{ scope: '\/' \}\)/, `${file} debe registrar el worker`);
  }
});

test('build publica PWA con versión por contenido y Vercel usa cache headers correctos', () => {
  const build = read('scripts/build-friendly.mjs');
  assert.match(build, /createHash\('sha256'\)/);
  assert.match(build, /manifest\.webmanifest/);
  assert.match(build, /icon-maskable-512\.png/);
  assert.match(build, /replaceAll\(versionToken, cacheVersion\)/);

  const ignore = read('.vercelignore');
  assert.doesNotMatch(ignore, /^sw\.js$/m);
  assert.doesNotMatch(ignore, /^manifest\.webmanifest$/m);

  const vercel = JSON.parse(read('vercel.json'));
  const headers = new Map(vercel.headers.map((entry) => [entry.source, new Map(entry.headers.map(({ key, value }) => [key, value]))]));
  assert.match(headers.get('/sw.js').get('Cache-Control'), /no-cache/);
  assert.equal(headers.get('/sw.js').get('Service-Worker-Allowed'), '/');
  assert.match(headers.get('/assets/pwa/(.*)').get('Cache-Control'), /immutable/);
  for (const route of ['/api/(.*)', '/internal', '/internal-dashboard.html', '/estructura', '/datos-personales.html', '/nomina-control', '/asistente', '/ia', '/ia-hf', '/centro-ayuda', '/centro-ayuda.html', '/ayuda', '/assets/internal-guide.js', '/assets/product-guidance.js', '/admin']) {
    assert.match(headers.get(route).get('Cache-Control'), /no-store/, `${route} debe impedir cache compartido`);
  }
});
