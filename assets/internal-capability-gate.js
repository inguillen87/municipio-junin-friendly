(function (global) {
  'use strict';

  var AUTH_URL = '/api/internal-auth';
  var CAPABILITY_PATTERN = /^[a-z][a-z0-9._-]{2,119}$/;
  var ROUTE_REQUIREMENTS = Object.freeze({
    'internal-dashboard.html': { any: ['workforce.summary.read', 'workforce.employee.read'] },
    'internal-dashboard.html#inicio': { any: ['workforce.summary.read'] },
    'internal-dashboard.html#legajos': { any: ['workforce.employee.read'] },
    'centro-acciones.html': { any: ['actions.read'] },
    'fuentes-tiempo.html': { any: ['time.source.read', 'time.catalog.read'] },
    'relojes-marcaciones.html': { any: ['attendance.read'] },
    'estructura.html': { any: ['workforce.structure.read'] },
    'integracion-datos.html': { any: ['lineage.read'] },
    'nomina-control.html': { any: ['payroll.read'] },
    'novedades-nomina.html': { any: ['payroll.novelty.read'] },
    'gestion-comparativa.html': { any: ['management.analytics.read'] },
    'presupuesto-control.html': { any: ['budget.approved.read'] },
    'ausentismo-control.html': { any: ['absence.analytics.read', 'absence.nominal.read'] },
    'licencias-control.html': { any: ['leave.policy.read', 'leave.preview.read'] },
    'calidad-operativa.html': { any: ['quality.read', 'lineage.read'] },
    'asistente.html': { any: ['assistant.use'] },
    'reportes-rrhh.html': { any: ['workforce.summary.read', 'management.analytics.read'] },
    'friendly-dashboard.html': { any: ['workforce.summary.read', 'management.analytics.read'] },
    'administracion-plataforma.html': { platform: true }
  });

  function normalizedCapabilities(value) {
    return new Set(Array.isArray(value) ? value.map(function (entry) {
      return String(entry || '').trim();
    }).filter(function (entry) {
      return CAPABILITY_PATTERN.test(entry);
    }) : []);
  }

  function requiredCapabilities(value) {
    return String(value || '').trim().split(/\s+/).filter(function (entry) {
      return CAPABILITY_PATTERN.test(entry);
    });
  }

  function normalizedRoute(href, baseHref) {
    try {
      var url = new URL(href, baseHref);
      var pathname = url.pathname.replace(/\/+$/, '');
      var file = pathname.slice(pathname.lastIndexOf('/') + 1) || 'internal-dashboard.html';
      var hash = url.hash.toLowerCase();
      if (file === 'internal-dashboard.html' && (hash === '#inicio' || hash === '#legajos')) return file + hash;
      return file;
    } catch (_) {
      return '';
    }
  }

  function allowed(requirement, tenantCapabilities, platformCapabilities) {
    var contract = requirement && typeof requirement === 'object' ? requirement : {};
    var tenant = tenantCapabilities instanceof Set ? tenantCapabilities : normalizedCapabilities(tenantCapabilities);
    var platform = platformCapabilities instanceof Set ? platformCapabilities : normalizedCapabilities(platformCapabilities);
    if (contract.platform === true) {
      return Array.from(platform).some(function (capability) { return capability.startsWith('platform.'); });
    }
    var any = Array.isArray(contract.any) ? contract.any : [];
    var all = Array.isArray(contract.all) ? contract.all : [];
    if (any.length && !any.some(function (capability) { return tenant.has(capability); })) return false;
    if (all.length && !all.every(function (capability) { return tenant.has(capability); })) return false;
    return any.length > 0 || all.length > 0;
  }

  function setVisibility(node, visible) {
    if (!node) return;
    node.hidden = !visible;
    if (visible) {
      node.removeAttribute('data-mc-capability-denied');
      node.removeAttribute('aria-hidden');
    } else {
      node.setAttribute('data-mc-capability-denied', 'true');
      node.setAttribute('aria-hidden', 'true');
    }
  }

  function elementRequirement(node, baseHref) {
    if (!node || typeof node.getAttribute !== 'function') return null;
    var any = requiredCapabilities(node.getAttribute('data-requires-any-capability'));
    var all = requiredCapabilities(node.getAttribute('data-requires-all-capability'));
    var platform = node.hasAttribute('data-requires-platform-capability');
    if (any.length || all.length || platform) return { any: any, all: all, platform: platform };
    var href = node.getAttribute('href');
    if (!href) return null;
    return ROUTE_REQUIREMENTS[normalizedRoute(href, baseHref)] || null;
  }

  function apply(root, access, baseHref) {
    var scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    var contract = access && typeof access === 'object' ? access : {};
    var tenant = normalizedCapabilities(contract.tenantCapabilities);
    var platform = normalizedCapabilities(contract.platformCapabilities);
    var candidates = scope.querySelectorAll('a[href], [data-requires-any-capability], [data-requires-all-capability], [data-requires-platform-capability]');
    Array.prototype.forEach.call(candidates, function (node) {
      var requirement = elementRequirement(node, baseHref || global.location.href);
      if (requirement) setVisibility(node, allowed(requirement, tenant, platform));
    });
    Array.prototype.forEach.call(scope.querySelectorAll('.nav-group'), function (group) {
      var destinations = Array.prototype.slice.call(group.querySelectorAll('a[href], button'));
      group.hidden = destinations.length > 0 && !destinations.some(function (item) { return !item.hidden; });
    });
    return { tenantCapabilities: tenant, platformCapabilities: platform };
  }

  function installFailClosedStyle() {
    if (!global.document || document.getElementById('mcCapabilityGateStyle')) return;
    var gatedRoutes = Object.keys(ROUTE_REQUIREMENTS).map(function (route) { return route.split('#')[0]; });
    gatedRoutes = Array.from(new Set(gatedRoutes));
    var pendingSelectors = gatedRoutes.map(function (route) {
      return 'html:not([data-mc-capability-ready="true"]) a[href*="' + route + '"]';
    });
    pendingSelectors.push(
      'html:not([data-mc-capability-ready="true"]) [data-requires-any-capability]',
      'html:not([data-mc-capability-ready="true"]) [data-requires-all-capability]',
      'html:not([data-mc-capability-ready="true"]) [data-requires-platform-capability]',
      '[data-mc-capability-denied="true"]'
    );
    var style = document.createElement('style');
    style.id = 'mcCapabilityGateStyle';
    style.textContent = pendingSelectors.join(',\n') + '{display:none!important}';
    document.head.appendChild(style);
  }

  function validSession(payload) {
    return Boolean(payload && payload.ok === true && payload.authenticated === true
      && payload.access && typeof payload.access === 'object');
  }

  async function loadSession() {
    var response = await global.fetch(AUTH_URL, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-store' }
    });
    if (!response.ok) throw new Error('capability_session_unavailable');
    var payload = await response.json();
    if (!validSession(payload)) throw new Error('capability_session_invalid');
    return payload;
  }

  function start() {
    if (!global.document || typeof global.fetch !== 'function') return Promise.resolve(null);
    document.documentElement.setAttribute('data-mc-capability-state', 'checking');
    var sessionPromise = loadSession();
    var domPromise = document.readyState === 'loading'
      ? new Promise(function (resolve) { document.addEventListener('DOMContentLoaded', resolve, { once: true }); })
      : Promise.resolve();
    return Promise.all([sessionPromise, domPromise]).then(function (values) {
      var result = apply(document, values[0].access, global.location.href);
      document.documentElement.setAttribute('data-mc-capability-ready', 'true');
      document.documentElement.setAttribute('data-mc-capability-state', 'ready');
      document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready', { detail: result }));
      return result;
    }).catch(function () {
      document.documentElement.removeAttribute('data-mc-capability-ready');
      document.documentElement.setAttribute('data-mc-capability-state', 'denied');
      return null;
    });
  }

  installFailClosedStyle();
  var api = Object.freeze({
    apply: apply,
    allowed: allowed,
    normalizedRoute: normalizedRoute,
    requirements: ROUTE_REQUIREMENTS,
    ready: start()
  });
  global.MuniControlCapabilityGate = api;
})(typeof window === 'undefined' ? globalThis : window);
