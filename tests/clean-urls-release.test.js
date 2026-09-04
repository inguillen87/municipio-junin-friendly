import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { cleanFriendlyRouteReferences } from '../scripts/clean-friendly-route-references.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const HTML_ROUTES = [
  'login.html',
  'activar-cuenta.html',
  'seguridad-cuenta.html',
  'friendly-dashboard.html',
  'modulos.html',
  'reportes-rrhh.html',
  'calidad-datos.html',
  'internal-dashboard.html',
  'centro-acciones.html',
  'control-horario-readiness.html',
  'control-horario-homologacion.html',
  'fuentes-tiempo.html',
  'relojes-marcaciones.html',
  'administracion-plataforma.html',
  'estructura.html',
  'integracion-datos.html',
  'nomina-control.html',
  'novedades-nomina.html',
  'gestion-comparativa.html',
  'presupuesto-control.html',
  'ausentismo-control.html',
  'licencias-control.html',
  'calidad-operativa.html',
  'asistente.html',
  'centro-ayuda.html',
  'datos-personales.html'
];

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`función ${name} incompleta`);
}

test('Vercel publica HTML con URLs limpias y conserva aliases sin destinos .html', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlash, false);

  for (const rewrite of config.rewrites) {
    assert.doesNotMatch(rewrite.source, /\.html(?:$|[?#])/i, `source no canónico: ${rewrite.source}`);
    assert.doesNotMatch(rewrite.destination, /\.html(?:$|[?#])/i, `destination no canónico: ${rewrite.destination}`);
  }

  const rewrites = new Map(config.rewrites.map(({ source, destination }) => [source, destination]));
  for (const canonical of ['/login', '/centro-acciones', '/nomina-control', '/reportes-rrhh']) {
    assert.equal(rewrites.has(canonical), false, `${canonical} debe resolver por cleanUrls sin rewrite intermedio`);
  }
  assert.equal(rewrites.get('/internal'), '/internal-dashboard');
  assert.equal(rewrites.get('/admin'), '/administracion-plataforma');
  assert.equal(rewrites.get('/reportes'), '/reportes-rrhh');
  assert.equal(rewrites.get('/hacienda'), '/friendly-dashboard?section=hacienda');
  assert.equal(rewrites.get('/api/chat'), '/api/friendly-policy');
});

test('el limpiador del build cambia sólo pantallas conocidas y preserva query, hash y APIs', () => {
  const source = [
    '<a href="centro-acciones.html?estado=pendiente#bandeja">Abrir</a>',
    'login.html?next=nomina-control.html%23cierre-mensual',
    '/api/export-data?format=report.html',
    '/assets/manual.html',
    'https://externo.example/reporte.html'
  ].join('\n');
  const result = cleanFriendlyRouteReferences(source, HTML_ROUTES);

  assert.match(result, /href="centro-acciones\?estado=pendiente#bandeja"/);
  assert.match(result, /login\?next=nomina-control%23cierre-mensual/);
  assert.match(result, /\/api\/export-data\?format=report\.html/);
  assert.match(result, /\/assets\/manual\.html/);
  assert.match(result, /externo\.example\/reporte\.html/);
});

test('el login construido acepta next nuevo o legado y conserva query y hash seguros', () => {
  const builtLogin = cleanFriendlyRouteReferences(read('login.html'), HTML_ROUTES);
  const source = extractFunction(builtLogin, 'allowedDestination');
  const destination = (search, contextKind = 'tenant') => new Function(
    'window',
    'URLSearchParams',
    'contextKind',
    `${source}; return allowedDestination(contextKind);`
  )({ location: { search } }, URLSearchParams, contextKind);

  assert.equal(
    destination('?next=centro-acciones%3Festado%3Dpendiente%23bandeja'),
    'centro-acciones?estado=pendiente#bandeja'
  );
  assert.equal(
    destination('?next=centro-acciones.html%3Festado%3Dpendiente%23bandeja'),
    'centro-acciones?estado=pendiente#bandeja'
  );
  assert.equal(destination('?next=https%3A%2F%2Fevil.example%2F'), 'internal-dashboard');
  assert.equal(destination('?next=administracion-plataforma.html', 'platform'), 'administracion-plataforma');
});

test('el build aplica el limpiador después de copiar el shell y antes de calcular su versión', () => {
  const build = read('scripts/build-friendly.mjs');
  const copyAt = build.indexOf('fs.copyFileSync(path.join(root, file), destination)');
  const cleanAt = build.indexOf('cleanFriendlyRouteReferences(source, htmlRouteFiles)');
  const hashAt = build.indexOf("const versionHash = crypto.createHash('sha256')");

  assert.ok(copyAt >= 0 && cleanAt > copyAt, 'primero debe copiarse el shell');
  assert.ok(hashAt > cleanAt, 'la huella PWA debe representar el artefacto ya normalizado');
  assert.match(build, /'sw\.js'/);
});
