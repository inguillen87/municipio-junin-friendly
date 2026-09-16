(function (global) {
  'use strict';

  // Public paths are presentation only. Page/API authorization remains unchanged.
  var definitions = [
    ['login.html', '/acceso', ['/login']],
    ['activar-cuenta.html', '/activar-cuenta', []],
    ['seguridad-cuenta.html', '/seguridad', ['/seguridad-cuenta']],
    ['friendly-dashboard.html', '/inicio', ['/', '/dashboard']],
    ['internal-dashboard.html', '/personal', ['/internal', '/internal-dashboard', '/rrhh']],
    ['centro-acciones.html', '/acciones', ['/centro-acciones']],
    ['relojes-marcaciones.html', '/relojes', ['/relojes-marcaciones']],
    ['fuentes-tiempo.html', '/tiempo', ['/fuentes-tiempo']],
    ['administracion-plataforma.html', '/administracion', ['/administracion-plataforma', '/admin']],
    ['estructura.html', '/estructura', ['/organigrama']],
    ['integracion-datos.html', '/integracion', ['/integracion-datos']],
    ['nomina-control.html', '/nomina', ['/nomina-control']],
    ['novedades-nomina.html', '/novedades', ['/novedades-nomina']],
    ['gestion-comparativa.html', '/comparativa', ['/gestion-comparativa']],
    ['presupuesto-control.html', '/presupuesto-control', []],
    ['ausentismo-control.html', '/ausentismo', ['/ausentismo-control']],
    ['licencias-control.html', '/licencias', ['/licencias-control']],
    ['calidad-operativa.html', '/calidad-operativa', []],
    ['asistente.html', '/asistente', ['/ia', '/ia-hf']],
    ['centro-ayuda.html', '/ayuda', ['/centro-ayuda']],
    ['modulos.html', '/modulos', []],
    ['reportes-rrhh.html', '/reportes', ['/reportes-rrhh', '/inteligencia', '/analytics', '/informe-rrhh']],
    ['calidad-datos.html', '/calidad-datos', []],
    ['control-horario-readiness.html', '/control-horario-readiness', []],
    ['control-horario-homologacion.html', '/control-horario-homologacion', []],
    ['datos-personales.html', '/datos', ['/rrhh-sync', '/exportar', '/importar', '/upload', '/ingest', '/auditoria']]
  ].map(function (item) {
    return Object.freeze({ file: item[0], path: item[1], aliases: Object.freeze(Array.from(new Set(['/' + item[0], '/' + item[0].replace(/\.html$/, '')].concat(item[2])))) });
  });
  var paths = Object.create(null);
  definitions.forEach(function (route) {
    [route.path].concat(route.aliases).forEach(function (path) { paths[path] = route; });
  });
  // These established public shortcuts carry section semantics in the existing
  // server/page routing. Keep their clean paths and map only their permission key.
  ['/index-loaded', '/afip', '/ciudadano', '/configuracion', '/control', '/cuentas-claras', '/expedientes', '/form-public', '/forms', '/presentacion', '/hacienda', '/licitaciones', '/presupuesto', '/proveedores', '/servicios', '/talleres'].forEach(function (path) {
    paths[path] = { file: 'friendly-dashboard.html', path: path };
  });
  ['/manuales', '/mapa', '/obras', '/vecinos', '/whatsapp'].forEach(function (path) {
    paths[path] = { file: 'modulos.html', path: path };
  });

  function resolve(href, baseHref) {
    try {
      var base = new URL(baseHref || 'https://municontrol.invalid/');
      var url = new URL(href, base);
      if (url.origin !== base.origin || !/^https?:$/.test(url.protocol)) return null;
      var route = paths[url.pathname.replace(/\/+$/, '') || '/'];
      return route ? { file: route.file, path: route.path, search: url.search, hash: url.hash } : null;
    } catch (_) { return null; }
  }

  function canonicalHref(href, baseHref) {
    if (typeof href !== 'string' || !href || /^[?#]/.test(href)) return href;
    var route = resolve(href, baseHref);
    return route ? route.path + route.search + route.hash : href;
  }

  function loginHref(href, baseHref) {
    var route = resolve(href, baseHref);
    if (!route || route.file === 'login.html' || route.file === 'activar-cuenta.html') return '/acceso';
    return '/acceso?next=' + encodeURIComponent(route.path + route.search + route.hash);
  }

  function safeDestination(next, allowedFiles, fallbackFile) {
    var fallback = paths['/' + fallbackFile];
    if (!fallback || allowedFiles.indexOf(fallback.file) < 0) throw new Error('Invalid access destination contract');
    // Reject schemes, protocol-relative, encoded paths and dot segments before URL normalization.
    var value = typeof next === 'string' ? next : '';
    var path = value.split(/[?#]/)[0];
    if (!/^\/?[a-z0-9][a-z0-9.-]*\/?$/i.test(path) || path.includes('..')) return fallback.path;
    var route = resolve(value);
    if (!route || allowedFiles.indexOf(route.file) < 0) return fallback.path;
    var hash = /^#[a-z0-9][a-z0-9_-]{0,63}$/i.test(route.hash) ? route.hash : '';
    return route.path + route.search + hash;
  }

  function normalizeLink(node, baseHref) {
    if (!node || node.nodeType !== 1 || node.tagName !== 'A' || node.hasAttribute('download')) return;
    var original = node.getAttribute('href');
    var canonical = canonicalHref(original, baseHref);
    if (canonical !== original) node.setAttribute('href', canonical);
  }

  function observeLinks(root) {
    if (!root || !root.querySelectorAll) return function () {};
    var baseHref = function () { return root.baseURI || (global.location && global.location.href) || 'https://municontrol.invalid/'; };
    function normalizeTree(node) {
      normalizeLink(node, baseHref());
      if (node && node.querySelectorAll) node.querySelectorAll('a[href]').forEach(function (link) { normalizeLink(link, baseHref()); });
    }
    normalizeTree(root);
    if (typeof global.MutationObserver !== 'function') return function () {};
    var observer = new global.MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'attributes') normalizeLink(record.target, baseHref());
        else record.addedNodes.forEach(normalizeTree);
      });
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
    return function () { observer.disconnect(); };
  }

  global.MuniControlRoutes = Object.freeze({ definitions: Object.freeze(definitions), resolve: resolve, canonicalHref: canonicalHref, loginHref: loginHref, safeDestination: safeDestination, observeLinks: observeLinks });
  if (global.document && typeof global.document.addEventListener === 'function') {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', function () { observeLinks(global.document); }, { once: true });
    else observeLinks(global.document);
  }
})(typeof window === 'undefined' ? globalThis : window);
