import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../administracion-plataforma.html', import.meta.url), 'utf8');

function parseInlineScripts() {
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) {
      assert.doesNotThrow(() => new vm.Script(match[2], { filename: 'administracion-plataforma.html' }));
    }
  }
}

test('Superadministración explica el alcance global sin prometer alta laboral inexistente', () => {
  parseInlineScripts();
  assert.match(html, /<span class="nav-label">Superadministración<\/span>/);
  assert.match(html, /id="superAdminHubTitle">Superadministración<\/h2>/);
  assert.match(html, /no concede por sí solo permisos laborales dentro de cada municipio/i);

  const hub = html.match(/<section class="superadmin-hub"[\s\S]*?<\/section>/);
  assert.ok(hub, 'falta el centro de accesos rápidos');
  assert.match(hub[0], /id="superAdminCreateTenant"[^>]*disabled/);
  assert.match(hub[0], /id="superAdminUsers"[^>]*disabled/);
  assert.match(hub[0], /id="superAdminAudit"[^>]*disabled/);
  assert.match(hub[0], />Crear gobierno</);
  assert.match(hub[0], />Usuarios y roles</);
  assert.match(hub[0], />Auditoría</);
  assert.doesNotMatch(hub[0], /alta (?:de )?emplead/i);
});

test('los accesos rápidos se habilitan sólo con contexto, MFA y capacidades efectivas', () => {
  const capabilityGate = html.match(/function platformCapabilityAllowed\(capabilities\) \{([\s\S]*?)\n    \}/);
  assert.ok(capabilityGate, 'falta la compuerta de capacidades de plataforma');
  assert.match(capabilityGate[1], /identityAccess\.authorized === true/);
  assert.match(capabilityGate[1], /identityAccess\.platformContext === true/);
  assert.match(capabilityGate[1], /identityAccess\.mfa === true/);
  assert.match(capabilityGate[1], /identityAccess\.capabilities\.includes\(capability\)/);

  const render = html.match(/function renderSuperAdministration\(\) \{([\s\S]*?)\n    \}\n\n    function renderContext/);
  assert.ok(render, 'falta el render fail-closed de Superadministración');
  assert.match(render[1], /platform\.tenants\.manage/);
  assert.match(render[1], /mutationAllowed\('create_tenant', false\)/);
  assert.match(render[1], /platform\.users\.read/);
  assert.match(render[1], /platform\.roles\.manage/);
  assert.match(render[1], /platform\.audit\.read/);
  assert.match(render[1], /superAdminHub\.hidden = !canSeeHub/);
  assert.match(render[1], /superAdminCreateTenant\.disabled = !canCreateTenant/);
  assert.match(render[1], /superAdminUsers\.disabled = !canOpenUsers/);
  assert.match(render[1], /superAdminAudit\.disabled = !canOpenAudit/);
  assert.doesNotMatch(render[1], /PLATFORM_OWNER/);
});

test('cada acceso rápido reutiliza un flujo funcional ya existente', () => {
  const createFlow = html.match(/function openCreateTenantFlow\(\) \{([\s\S]*?)\n    \}\n\n    function showView/);
  assert.ok(createFlow, 'falta el flujo compartido de alta de gobierno');
  assert.match(createFlow[1], /platformCapabilityAllowed\(\['platform\.tenants\.manage'\]\)/);
  assert.match(createFlow[1], /mutationAllowed\('create_tenant', false\)/);
  assert.match(createFlow[1], /createTenantForm\.reset\(\)/);
  assert.match(createFlow[1], /openDialog\(el\.createTenantDialog\)/);

  assert.match(html, /createTenantButton\.addEventListener\('click', openCreateTenantFlow\)/);
  assert.match(html, /superAdminCreateTenant\.addEventListener\('click', openCreateTenantFlow\)/);
  assert.match(html, /superAdminUsers\.addEventListener\('click',[\s\S]*?showView\('access'\)/);
  assert.match(html, /superAdminAudit\.addEventListener\('click',[\s\S]*?showView\('audit'\)/);
});
