import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const guide = read('assets/internal-guide.js');

function sidebarMarkup(file) {
  const html = read(file);
  const start = html.indexOf('<aside class="sidebar"');
  const end = html.indexOf('</aside>', start);
  assert.ok(start >= 0 && end > start, `${file} debe conservar un único sidebar reconocible`);
  return html.slice(start, end + '</aside>'.length);
}

function operationalTargets(file) {
  const sidebar = sidebarMarkup(file);
  const markers = ['<nav class="primary-nav"', '<nav class="nav-wrap"', '<nav class="nav"'];
  const start = markers.map((marker) => sidebar.indexOf(marker)).filter((index) => index >= 0).sort((a, b) => a - b)[0];
  assert.notEqual(start, undefined, `${file} debe usar un perfil de navegación conocido`);
  return [...sidebar.slice(start).matchAll(/<(?:a|button)\b([^>]*)>/gi)].map((match) => {
    const attributes = match[1];
    const view = attributes.match(/\bdata-view="([^"]+)"/i)?.[1]?.toLowerCase();
    if (view === 'inicio') return 'inicio';
    if (view === 'legajos') return 'personas';
    const href = attributes.match(/\bhref="([^"]+)"/i)?.[1]?.toLowerCase() || '';
    if (/internal-dashboard(?:\.html)?#inicio$/.test(href)) return 'inicio';
    if (/internal-dashboard(?:\.html)?#legajos$/.test(href)) return 'personas';
    if (/centro-acciones(?:\.html)?(?:$|[#?])/.test(href)) return 'acciones';
    return href || (view ? `view:${view}` : '');
  }).filter(Boolean);
}

test('la navegación progresiva compila y recuerda sólo durante la sesión', () => {
  new vm.Script(guide, { filename: 'assets/internal-guide.js' });
  assert.match(guide, /municontrol:progressive-navigation:v1:/);
  assert.match(guide, /sessionStorage\.getItem\(NAV_STORAGE_KEY\)/);
  assert.match(guide, /sessionStorage\.setItem\(NAV_STORAGE_KEY/);
  assert.doesNotMatch(guide, /localStorage/);
  assert.match(guide, /label\.textContent = 'Más herramientas'/);
  assert.match(guide, /button\.setAttribute\('aria-expanded'/);
  assert.match(guide, /data-mc-nav-expanded="false"[^}]*\.mc-nav-secondary:not\(\.mc-nav-current\)/);
  assert.doesNotMatch(guide, /data-mc-nav-expanded="true"[^}]*display\s*:\s*none/i,
    'al expandir, los destinos originales deben volver a quedar disponibles');
});

test('los tres perfiles operativos conservan Inicio, Personas y Centro de acciones como tareas esenciales', () => {
  const profiles = [
    ['internal-dashboard.html', /class="primary-nav"[\s\S]*class="suite-links"/],
    ['centro-acciones.html', /class="nav-wrap"[\s\S]*class="nav-group"/],
    ['ausentismo-control.html', /class="nav" aria-label="Operación interna"[\s\S]*class="nav" aria-label="Herramientas internas"/]
  ];

  for (const [file, profile] of profiles) {
    const html = read(file);
    assert.deepEqual(operationalTargets(file).slice(0, 3), ['inicio', 'personas', 'acciones'],
      `${file} debe mantener el orden esencial que valida el fail-safe`);
    assert.match(sidebarMarkup(file), profile, `${file} debe conservar su perfil estructural reconocido`);
    assert.equal((html.match(/assets\/internal-guide\.js/g) || []).length, 1,
      `${file} debe cargar una sola instancia de la navegación común`);
  }

  assert.match(read('centro-acciones.html'), /href="centro-acciones\.html" aria-current="page"/);
  assert.match(read('ausentismo-control.html'), /href="ausentismo-control\.html" aria-current="page"/);
  assert.match(guide, /\.mc-nav-secondary:not\(\.mc-nav-current\)/,
    'la opción avanzada activa debe permanecer visible cuando el menú está contraído');
});

test('un markup desconocido falla antes de modificar el sidebar y revierte una operación incompleta', () => {
  const setupStart = guide.indexOf('function setupProgressiveNavigation()');
  const setupEnd = guide.indexOf('\n  function ensureHeaderButton', setupStart);
  assert.ok(setupStart > 0 && setupEnd > setupStart, 'debe existir una transacción aislada de navegación');
  const setup = guide.slice(setupStart, setupEnd);

  assert.match(setup, /var initialPlan = inspectProgressiveNavigation\(\);\s*if \(!initialPlan\) return null;/);
  assert.match(setup, /var plan = inspectProgressiveNavigation\(\);\s*if \(!plan\)/);
  assert.match(setup, /catch \(_\) \{\s*rollbackProgressiveNavigation\(plan, button, injectedLink\);/);
  assert.ok(setup.indexOf('if (!plan)') < setup.indexOf("classList.add('mc-nav-secondary')"),
    'no debe mutar clases hasta validar nuevamente todo el contrato');
  assert.match(guide, /sidebars\.length !== 1/);
  assert.match(guide, /keys\[index\] !== ESSENTIAL_NAV_KEYS\[index\]/);
});

test('la reducción visual no reescribe permisos, estados ni destinos', () => {
  const navigationStart = guide.indexOf('function refreshProgressiveNavigation');
  const navigationEnd = guide.indexOf('\n  function ensureHeaderButton', navigationStart);
  assert.ok(navigationStart > 0 && navigationEnd > navigationStart);
  const navigation = guide.slice(navigationStart, navigationEnd);

  assert.doesNotMatch(navigation, /\.href\s*=|setAttribute\(['"]href|\.hidden\s*=|removeAttribute\(['"]hidden/);
  assert.doesNotMatch(navigation, /setAttribute\(['"]data-(?:any-capability|requires-any-capability|platform-admin)/);
  assert.doesNotMatch(navigation, /removeAttribute\(['"]data-(?:any-capability|requires-any-capability|platform-admin)/);

  const portal = sidebarMarkup('internal-dashboard.html');
  assert.match(portal, /data-any-capability="actions\.read" href="centro-acciones\.html"/);
  assert.match(portal, /data-platform-admin href="administracion-plataforma\.html"/);
  assert.match(portal, /data-any-capability="payroll\.read" href="nomina-control\.html"/);
});
