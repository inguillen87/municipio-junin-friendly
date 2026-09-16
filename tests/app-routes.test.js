import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import '../assets/app-routes.js';

const routes = globalThis.MuniControlRoutes;
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const config = JSON.parse(read('vercel.json'));
const tenant = ['internal-dashboard.html', 'relojes-marcaciones.html', 'nomina-control.html', 'seguridad-cuenta.html'];
const platform = ['administracion-plataforma.html', 'seguridad-cuenta.html'];

test('cada ruta canónica conserva el shell y los enlaces históricos en un salto', () => {
  const redirects = new Map(config.redirects.map(r => [r.source, r]));
  for (const entry of routes.definitions) {
    assert.equal(config.rewrites.find(r => r.source === entry.path)?.destination, '/' + entry.file);
    assert.equal(routes.resolve(entry.path)?.file, entry.file);
    for (const alias of entry.aliases) {
      assert.equal(routes.resolve(alias)?.file, entry.file);
      if (alias === '/' || alias === entry.path) continue;
      assert.equal(redirects.get(alias)?.destination, entry.path);
      assert.equal(redirects.get(alias)?.permanent, false);
      assert.equal(redirects.has(entry.path), false, 'sin cadenas ni ciclos');
    }
  }
  assert.equal(config.cleanUrls, false, 'las funciones API no reciben normalización global');
  assert.equal(routes.resolve('/inicio').file, 'friendly-dashboard.html');
  assert.equal(routes.resolve('/personal').file, 'internal-dashboard.html');
});

test('next conserva consulta y ancla válidas dentro del mismo contexto autorizado', () => {
  const next = value => routes.safeDestination(value, tenant, 'internal-dashboard.html');
  for (const value of ['/nomina?period=2026-08#comparar', 'nomina-control.html?period=2026-08#comparar', '/nomina-control?period=2026-08#comparar']) {
    assert.equal(next(value), '/nomina?period=2026-08#comparar');
  }
  assert.equal(next('/relojes#conectores'), '/relojes#conectores');
  assert.equal(next('/personal#legajos'), '/personal#legajos');
  assert.equal(next('/nomina#/<script>'), '/nomina');
  assert.equal(routes.safeDestination('/seguridad-cuenta.html#sesiones', platform, 'administracion-plataforma.html'), '/seguridad#sesiones');
  assert.equal(routes.safeDestination('/personal', platform, 'administracion-plataforma.html'), '/administracion');
  assert.equal(next('/administracion'), '/personal');
});

test('next desconocido, externo o ambiguo falla cerrado al portal de su contexto', () => {
  for (const next of ['', '/desconocido', '/inicio', 'https://evil.invalid/nomina', '//evil.invalid/nomina', 'javascript:alert(1)', '\\evil.invalid', '/x/../nomina', '/./nomina', '/%2e%2e/nomina', '%2Fnomina', '//nomina', '/nomina%3Ffoo', '/nomina\n', '/nomina\\', ' nomina', '/api/internal-auth']) {
    assert.equal(routes.safeDestination(next, tenant, 'internal-dashboard.html'), '/personal', JSON.stringify(next));
    assert.equal(routes.safeDestination(next, platform, 'administracion-plataforma.html'), '/administracion', JSON.stringify(next));
  }
  assert.equal(routes.canonicalHref('https://evil.invalid/nomina'), 'https://evil.invalid/nomina');
  assert.equal(routes.canonicalHref('#legajos'), '#legajos');
  assert.equal(routes.canonicalHref('reportes-rrhh.html?period=2026-08#planilla-bancaria'), '/reportes?period=2026-08#planilla-bancaria');
});

test('retorno al acceso conserva la dirección completa y rechaza otro origen', () => {
  const base = 'https://municipio.invalid/relojes?period=2026-08#conectores';
  assert.equal(routes.loginHref(base, base), '/acceso?next=%2Frelojes%3Fperiod%3D2026-08%23conectores');
  assert.equal(routes.loginHref('https://evil.invalid/relojes', base), '/acceso');
  assert.equal(routes.loginHref('//evil.invalid/relojes', base), '/acceso');
  assert.equal(routes.loginHref('/desconocido', base), '/acceso');
  assert.equal(routes.loginHref('/acceso', base), '/acceso');
});

test('capability-gate aplica exactamente las mismas capacidades a aliases y anclas', () => {
  const appended = [], window = { MuniControlRoutes: routes, location: { href: 'https://municipio.invalid/relojes' } };
  const document = { head: { appendChild(node) { appended.push(node); } }, getElementById() { return null; }, createElement() { return {}; } };
  window.document = document;
  vm.runInNewContext(read('assets/internal-capability-gate.js'), { window, document, URL, Set, Map, Promise });
  const gate = window.MuniControlCapabilityGate;
  assert.equal(gate.normalizedRoute('/personal#legajos', window.location.href), 'internal-dashboard.html#legajos');
  for (const href of ['/nomina', '/nomina-control', '/nomina-control.html']) {
    const requirement = gate.requirements[gate.normalizedRoute(href, window.location.href)];
    assert.equal(gate.allowed(requirement, ['attendance.read'], []), false);
    assert.equal(gate.allowed(requirement, ['payroll.read'], []), true);
  }
  const nodes = ['/relojes', '/nomina', '/administracion', '/desconocido'].map(href => ({
    hidden: false, getAttribute: key => key === 'href' ? href : null, hasAttribute: () => false, setAttribute() {}, removeAttribute() {}
  }));
  gate.apply({ querySelectorAll: selector => selector === '.nav-group' ? [] : nodes }, { tenantCapabilities: ['attendance.read'] }, window.location.href);
  assert.deepEqual(nodes.map(n => n.hidden), [false, true, true, true]);
  assert.match(appended[0].textContent, /a\[href="\/nomina"\]/, 'oculto también antes de recibir la sesión');
});

test('las nuevas rutas privadas conservan no-store y no entran al caché offline', () => {
  const privatePaths = ['/acceso', '/personal', '/acciones', '/relojes', '/tiempo', '/administracion', '/seguridad', '/integracion', '/nomina', '/novedades', '/comparativa', '/ausentismo', '/licencias', '/datos'];
  const worker = read('sw.js');
  const blocked = worker.match(/const NEVER_INTERCEPT_PATHS = new Set\(\[([\s\S]*?)\]\)/)[1];
  for (const route of privatePaths) {
    const headers = config.headers.find(entry => entry.source === route)?.headers;
    assert.match(headers?.find(h => h.key === 'Cache-Control')?.value || '', /private, no-store/);
    assert.ok(blocked.includes("'" + route + "'"), route);
  }
  assert.match(worker, /PRECACHE_URLS = Object.freeze\(\[\s*'\/assets\/app-routes.js'/);
});

test('si el contrato de rutas no carga, los destinos limpios permanecen cerrados', () => {
  const appended = [], window = { location: { href: 'https://municipio.invalid/relojes' } };
  const document = { head: { appendChild(node) { appended.push(node); } }, getElementById() { return null; }, createElement() { return {}; } };
  window.document = document;
  vm.runInNewContext(read('assets/internal-capability-gate.js'), { window, document, URL, Set, Map, Promise });
  const node = { hidden: false, getAttribute: key => key === 'href' ? '/nomina' : null, hasAttribute: () => false, setAttribute() {}, removeAttribute() {} };
  window.MuniControlCapabilityGate.apply({ querySelectorAll: selector => selector === '.nav-group' ? [] : [node] }, { tenantCapabilities: ['attendance.read'] }, window.location.href);
  assert.equal(node.hidden, true);
  assert.match(appended[0].textContent, /a\[href\]/);
});

test('runtime link normalization preserves authority, downloads, query and fragments', () => {
  function anchor(href, download = false) {
    return { nodeType: 1, tagName: 'A', hidden: true, count: 0, href,
      hasAttribute: key => key === 'download' && download,
      getAttribute(key) { return key === 'href' ? this.href : null; },
      setAttribute(key, value) { assert.equal(key, 'href'); this.href = value; this.count++; },
    };
  }
  const nodes = [anchor('nomina-control.html?period=2026-08#comparar'), anchor('#legajos'), anchor('?year=2026'), anchor('https://external.invalid/nomina-control.html'), anchor('reportes-rrhh.html', true)];
  const stop = routes.observeLinks({ baseURI: 'https://muni.invalid/personal', querySelectorAll: () => nodes });
  assert.deepEqual(nodes.map(n => n.href), ['/nomina?period=2026-08#comparar', '#legajos', '?year=2026', 'https://external.invalid/nomina-control.html', 'reportes-rrhh.html']);
  assert.ok(nodes.every(n => n.hidden), 'rewriting a path never grants access');
  routes.observeLinks({ baseURI: 'https://muni.invalid/personal', querySelectorAll: () => nodes });
  assert.equal(nodes[0].count, 1, 'idempotent, no mutation loop');
  assert.equal(typeof stop, 'function'); stop();
});
