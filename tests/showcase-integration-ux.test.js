import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('el sistema visual compartido unifica marca y movimiento accesible en las vistas principales', () => {
  const css = read('assets/municontrol-enterprise.css');
  assert.match(css, /url\("pwa\/icon\.svg"\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@keyframes mc-enter/);
  assert.doesNotMatch(css, /municontrol-mark\.svg/);

  for (const file of [
    'login.html', 'internal-dashboard.html', 'centro-acciones.html',
    'administracion-plataforma.html', 'fuentes-tiempo.html',
    'relojes-marcaciones.html', 'estructura.html', 'integracion-datos.html',
    'nomina-control.html', 'licencias-control.html', 'ausentismo-control.html',
    'reportes-rrhh.html', 'gestion-comparativa.html', 'presupuesto-control.html',
    'calidad-operativa.html', 'calidad-datos.html', 'asistente.html',
    'centro-ayuda.html', 'seguridad-cuenta.html', 'activar-cuenta.html',
  ]) {
    const html = read(file);
    assert.equal((html.match(/assets\/municontrol-enterprise\.css/g) || []).length, 1, file);
    assert.match(html, /assets\/pwa\/icon\.svg/);
  }

  assert.match(read('scripts/build-friendly.mjs'), /'assets\/municontrol-enterprise\.css'/);
});

test('relojes muestra cobertura geográfica reportada sin fingir seguimiento ni conectividad', () => {
  const html = read('relojes-marcaciones.html');
  assert.match(html, /Cobertura y preparación técnica/);
  assert.match(html, /Mapa geográfico de puntos reportados/);
  assert.match(html, /No representa ubicación en tiempo real de empleados ni conectividad activa/);
  assert.match(html, /leaflet@1\.9\.4\/dist\/leaflet\.css/);
  assert.match(html, /leaflet@1\.9\.4\/dist\/leaflet\.js/);
  assert.match(html, /integrity="sha256-p4NxAoJBhIIN\+hmNHrzRCf9tD\/miZyoHS5obTRR9BMY="/);
  assert.match(html, /integrity="sha256-20nQCchB9co0qIjJZRGuk2\/Z9VM\+kNiyxNV1lvTlZBo="/);
  assert.match(html, /tile\.openstreetmap\.org/);
  assert.match(html, /apiUrl\('reported-inventory'\)/);
  assert.match(html, /Array\.isArray\(payload\.data\).*?Array\.isArray\(inventory\.sites\).*?Array\.isArray\(payload\.sites\)/s);
  assert.match(html, /Concentración de puntos \(no personas ni fichadas\)/);
  assert.match(html, /reported_site_density/);
  assert.match(html, /Reencuadrar los puntos/);
  assert.match(html, /Ubicación informada por planilla · pendiente de verificación física/);
  for (const field of ['Dirección', 'Modelo', 'Canal', 'Coordenadas']) assert.match(html, new RegExp(field));
  assert.match(html, /mapFallback[^>]*role="status"/);
  assert.match(html, /mapAccessibleList/);
  assert.doesNotMatch(html, /class="map-point|--x:\d|--y:\d|data-(?:lat|lng|latitude|longitude)=/i);
  assert.match(html, /Matriz de preparación/);
  assert.match(html, /Serie y hardware ID/);
  assert.match(html, /Firmware y protocolo/);
  assert.match(html, /Relevar físicamente un K20 piloto/);
  assert.doesNotMatch(html, /navigator\.geolocation|google\.maps|mapbox|getUserMedia/i);
});

test('los sidebars operativos conservan acceso directo a relojes y marcaciones', () => {
  for (const file of [
    'estructura.html', 'integracion-datos.html', 'nomina-control.html',
    'licencias-control.html', 'ausentismo-control.html',
    'gestion-comparativa.html', 'presupuesto-control.html',
    'calidad-operativa.html', 'asistente.html',
  ]) {
    const html = read(file);
    const attendanceIndex = html.indexOf('href="relojes-marcaciones.html"');
    const integrationIndex = html.indexOf('href="integracion-datos.html"');
    const attendanceLink = html.match(/<a[^>]*href="relojes-marcaciones\.html"[^>]*>[\s\S]*?<\/a>/)?.[0] || '';
    assert.equal((html.match(/href="relojes-marcaciones\.html"/g) || []).length, 1, file);
    assert.ok(attendanceIndex > -1 && attendanceIndex < integrationIndex, `${file}: RM debe estar junto y antes de IC`);
    assert.match(attendanceLink, /Relojes y marcaciones/, file);
  }
});

test('el inventario funcional cierra sesión en login en vez de recargar una sesión residual', () => {
  const html = read('modulos.html');
  assert.match(html, /fetch\('\/api\/internal-auth',\{method:'DELETE',credentials:'same-origin'\}\)/);
  assert.match(html, /location\.replace\('login\.html'\)/);
  assert.doesNotMatch(html, /location\.reload\(\)/);
});
