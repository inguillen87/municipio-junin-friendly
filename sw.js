'use strict';

// El build reemplaza este token por un hash reproducible del shell público.
const CACHE_VERSION = '__PWA_CACHE_VERSION__';
const CACHE_PREFIX = 'municontrol-friendly-public-';
const STATIC_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;
const LEGACY_CACHE_NAMES = new Set(['municontrol-junin-v2']);

// Sólo contenido público, agregado y sin identidad personal.
const PRECACHE_URLS = Object.freeze([
  '/friendly-dashboard.html',
  '/modulos.html',
  '/reportes-rrhh.html',
  '/calidad-datos.html',
  '/control-horario-readiness.html',
  '/attendance-readiness-evidence.v1.json',
  '/control-horario-homologacion.html',
  '/attendance-policy-candidates.v1.json',
  '/assets/junin-tardiness-policy.js',
  '/assets/rrhh-report-pack.js',
  '/assets/payroll-schooling-report.js',
  '/assets/payroll-schooling-report-workbench.js',
  '/assets/payroll-f931-prevalidator.js',
  '/assets/payroll-f931-workbench.js',
  '/assets/payroll-bank-control-exporter.js',
  '/assets/payroll-bank-control-xlsx-adapter.js',
  '/assets/payroll-bank-control-xlsx-worker.js',
  '/assets/vendor/fflate.min.js',
  '/friendly-data.json',
  '/manifest.webmanifest',
  '/assets/pwa/icon.svg',
  '/assets/pwa/icon-192.png',
  '/assets/pwa/icon-512.png',
  '/assets/pwa/icon-maskable-512.png'
]);

const PUBLIC_NAVIGATION_FALLBACKS = new Map([
  ['/', '/friendly-dashboard.html'],
  ['/dashboard', '/friendly-dashboard.html'],
  ['/inicio', '/friendly-dashboard.html'],
  ['/friendly-dashboard.html', '/friendly-dashboard.html'],
  ['/modulos', '/modulos.html'],
  ['/modulos.html', '/modulos.html'],
  ['/reportes', '/reportes-rrhh.html'],
  ['/reportes-rrhh', '/reportes-rrhh.html'],
  ['/reportes-rrhh.html', '/reportes-rrhh.html'],
  ['/calidad-datos', '/calidad-datos.html'],
  ['/calidad-datos.html', '/calidad-datos.html'],
  ['/control-horario-readiness', '/control-horario-readiness.html'],
  ['/control-horario-readiness.html', '/control-horario-readiness.html'],
  ['/control-horario-homologacion', '/control-horario-homologacion.html'],
  ['/control-horario-homologacion.html', '/control-horario-homologacion.html']
]);

const NEVER_INTERCEPT_PREFIXES = Object.freeze([
  '/api/',
  '/internal',
  '/rrhh-data/'
]);

const NEVER_INTERCEPT_PATHS = new Set([
  '/login',
  '/login.html',
  '/activar-cuenta',
  '/activar-cuenta.html',
  '/seguridad-cuenta',
  '/seguridad-cuenta.html',
  '/rrhh',
  '/rrhh-sync',
  '/estructura',
  '/estructura.html',
  '/organigrama',
  '/datos-personales.html',
  '/integracion-datos',
  '/integracion-datos.html',
  '/nomina-control',
  '/nomina-control.html',
  '/recibos-sueldo',
  '/recibos-sueldo.html',
  '/novedades-nomina',
  '/novedades-nomina.html',
  '/centro-acciones',
  '/centro-acciones.html',
  '/fuentes-tiempo',
  '/fuentes-tiempo.html',
  '/gestion-comparativa',
  '/gestion-comparativa.html',
  '/presupuesto-control',
  '/presupuesto-control.html',
  '/ausentismo-control',
  '/ausentismo-control.html',
  '/licencias-control',
  '/licencias-control.html',
  '/calidad-operativa',
  '/calidad-operativa.html',
  '/asistente',
  '/asistente.html',
  '/ia',
  '/ia-hf',
  '/centro-ayuda',
  '/centro-ayuda.html',
  '/ayuda',
  '/assets/internal-guide.js',
  '/assets/identity-security.css',
  '/assets/product-guidance.js',
  '/assets/payroll-novelty-exporter.js',
  '/assets/payroll-novelty-xlsx-exporter.js',
  '/assets/payroll-novelty-workbench.js',
  '/assets/payroll-receipt-preview.js',
  '/assets/payroll-receipt-center.js',
  '/assets/mendoza-title-vi.js',
  '/assets/junin-budget-2026.js',
  '/admin',
  '/auditoria',
  '/exportar',
  '/importar',
  '/upload',
  '/ingest'
]);

function isNeverIntercepted(pathname) {
  return NEVER_INTERCEPT_PATHS.has(pathname)
    || NEVER_INTERCEPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isExplicitPublicStatic(pathname) {
  return PRECACHE_URLS.includes(pathname);
}

function responseMayBeStored(response) {
  if (!response || !response.ok || response.type === 'opaque') return false;
  const cacheControl = response.headers.get('cache-control') || '';
  return !/(?:^|,)\s*(?:private|no-store)(?:\s|,|$)/i.test(cacheControl)
    && !response.headers.has('set-cookie');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // No skipWaiting automático: la versión activa no cambia a mitad de sesión.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => (
          (name.startsWith(CACHE_PREFIX) && name !== STATIC_CACHE)
          || LEGACY_CACHE_NAMES.has(name)
        ))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isNeverIntercepted(url.pathname)) return;
  if (request.headers.has('authorization') || request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    const fallback = PUBLIC_NAVIGATION_FALLBACKS.get(url.pathname);
    if (!fallback) return;
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match(fallback)) || Response.error();
      }
    })());
    return;
  }

  if (!isExplicitPublicStatic(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const response = await fetch(request);
    if (responseMayBeStored(response)) {
      await cache.put(url.pathname, response.clone());
    }
    return response;
  })());
});
