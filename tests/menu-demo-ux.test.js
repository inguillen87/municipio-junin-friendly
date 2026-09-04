import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function parseInlineScripts(file) {
  const html = read(file);
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: file });
  }
  return html;
}

test('Administración activa el recorrido contextual ya definido', () => {
  const html = parseInlineScripts('administracion-plataforma.html');
  const guide = read('assets/internal-guide.js');
  assert.match(html, /<body data-mc-page="platformAdmin">/);
  assert.match(guide, /platformAdmin:\s*\{/);
  assert.doesNotMatch(html, /data-mc-page="platform-admin"/);
});

test('Actualizar sólo anuncia éxito cuando todas las consultas necesarias lo confirman', () => {
  const html = parseInlineScripts('internal-dashboard.html');
  assert.match(html, /return \{ ok: true, resource: 'summary' \}/);
  assert.match(html, /return \{ ok: false, resource: 'summary', error: error \}/);
  assert.match(html, /return \{ ok: true, resource: 'employees' \}/);
  assert.match(html, /return \{ ok: false, resource: 'employees', error: error \}/);

  const start = html.indexOf('function refreshCurrentView()');
  const end = html.indexOf('\n      let searchTimer', start);
  assert.ok(start > 0 && end > start, 'debe existir un contrato aislable para la actualización manual');
  const refresh = html.slice(start, end);
  assert.match(refresh, /Promise\.allSettled\(tasks\)/);
  assert.match(refresh, /result\.status === 'rejected'/);
  assert.match(refresh, /result\.value\.ok !== true/);
  assert.match(refresh, /La actualización quedó incompleta/);
  assert.match(refresh, /Información actualizada\./);
  assert.doesNotMatch(refresh, /Actualización finalizada/);
});

test('el portal ofrece Administración sólo al propietario global con capacidad efectiva', () => {
  const html = parseInlineScripts('internal-dashboard.html');
  const admin = parseInlineScripts('administracion-plataforma.html');
  const auth = read('api/internal-auth.js');
  assert.match(html, /data-platform-admin href="administracion-plataforma\.html"/);
  assert.match(html, /data-any-capability="workforce\.employee\.read"/);
  assert.match(html, /function applyNavigationAccess\(access\)/);
  const start = html.indexOf('function applyNavigationAccess(access)');
  const end = html.indexOf('\n      function detailRequestFromLocation', start);
  assert.ok(start > 0 && end > start, 'debe existir el gate de navegación por capacidades');
  const navigationGate = html.slice(start, end);
  assert.match(navigationGate, /platformCapabilities/);
  assert.match(navigationGate, /platformRoles/);
  assert.match(navigationGate, /platformRoles\.has\('PLATFORM_OWNER'\)/);
  assert.match(navigationGate, /'platform\.tenants\.manage'/);
  assert.match(navigationGate, /'platform\.users\.invite'/);
  assert.doesNotMatch(navigationGate, /contract\.context !== 'platform'/);
  assert.match(admin, /function switchToPlatformContext\(\)/);
  assert.match(admin, /postIdentityCommand\('switch_context', \{ context: \{ kind: 'platform' \} \}/);
  assert.match(admin, /if \(!state\.identityAccess\.platformContext \|\| !state\.identityAccess\.mfa \|\| !state\.identityAccess\.canAdminPlatform\)/);
  assert.match(auth, /platformCapabilities/);
  assert.match(auth, /tenantCapabilities/);
});

test('el menú Friendly identifica los módulos que aún no tienen fuente operativa', () => {
  const html = parseInlineScripts('friendly-dashboard.html');
  assert.match(html, /Servicios, obras y reclamos<small class="nav-state">Sin integración<\/small>/);
  assert.match(html, /Compras y proveedores<small class="nav-state">Sin fuente<\/small>/);
  assert.match(html, /Mapa de producto<small class="nav-state">Inventario<\/small>/);
});
