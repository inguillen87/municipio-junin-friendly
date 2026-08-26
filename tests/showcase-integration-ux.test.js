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
  assert.match(html, /Mapa relativo de puntos reportados/);
  assert.match(html, /No representa ubicación en tiempo real de empleados ni conectividad activa/);
  assert.equal((html.match(/class="map-point(?: media)?"/g) || []).length, 13);
  for (let index = 1; index <= 13; index += 1) {
    assert.match(html, new RegExp(`PM-${String(index).padStart(2, '0')}`));
  }
  assert.match(html, /7 puntos con extracción por red informada/);
  assert.match(html, /6 puntos con medio removible informado/);
  assert.match(html, /Matriz de preparación/);
  assert.match(html, /Serie y hardware ID/);
  assert.match(html, /Firmware y protocolo/);
  assert.match(html, /Relevar físicamente un K20 piloto/);
  assert.doesNotMatch(html, /navigator\.geolocation|google\.maps|mapbox|leaflet/i);
});

test('el inventario funcional cierra sesión en login en vez de recargar una sesión residual', () => {
  const html = read('modulos.html');
  assert.match(html, /fetch\('\/api\/internal-auth',\{method:'DELETE',credentials:'same-origin'\}\)/);
  assert.match(html, /location\.replace\('login\.html'\)/);
  assert.doesNotMatch(html, /location\.reload\(\)/);
});
