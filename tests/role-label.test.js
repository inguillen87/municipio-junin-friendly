import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../assets/role-label.js'; // script clásico: publica window.MuniControlRoleLabel

const roleLabel = globalThis.MuniControlRoleLabel;
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('el rol se muestra con nombre legible y nunca con la clave interna cruda', () => {
  assert.equal(roleLabel('PLATFORM_OWNER_OPERATIVO_INTEGRAL'), 'Responsable de la plataforma · operación completa');
  assert.equal(roleLabel('platform_owner'), 'Responsable de la plataforma');
  assert.equal(roleLabel('TENANT_RRHH_ADMIN_OPERATIVO'), 'Administración de Recursos Humanos');
  assert.equal(roleLabel('NOMINA_OPERADOR_RRHH'), 'Nomina operador RR. HH.'); // rol sin nombre cargado: sus palabras, no la clave
  assert.equal(roleLabel('Liquidadora de sueldos'), 'Liquidadora de sueldos'); // un texto ya escrito para personas se respeta
  assert.equal(roleLabel(''), 'Acceso interno');
  assert.equal(roleLabel(null, 'Usuario interno'), 'Usuario interno');
  assert.equal(roleLabel(42), 'Acceso interno');
});

test('los encabezados usan el nombre legible y la pantalla de seguridad conserva la clave para soporte', () => {
  const source = read('assets/role-label.js');
  assert.doesNotMatch(source, /fetch\s*\(|localStorage|sessionStorage|innerHTML|capabilit/i); // sólo texto: no decide permisos
  for (const file of ['centro-ayuda.html', 'asistente.html', 'calidad-operativa.html', 'ausentismo-control.html', 'gestion-comparativa.html', 'licencias-control.html', 'presupuesto-control.html', 'seguridad-cuenta.html']) {
    const html = read(file);
    // Va en el <head> (script clásico): queda definido antes de que la pantalla dibuje el encabezado. El orden respecto de otras hojas no importa.
    assert.ok(html.slice(0, html.indexOf('</head>')).includes('<script src="assets/role-label.js"></script>'), file);
    assert.match(html, /\(window\.MuniControlRoleLabel \|\| function \(value\) \{ return value; \}\)\(/, file);
  }
  const security = read('seguridad-cuenta.html');
  assert.match(security, /return label === raw \? raw : label \+ ' \(' \+ raw \+ '\)';/);
  assert.match(security, /appendFact\(summary, 'Tu rol en el municipio', roleName\(tenant\.roleKey\)\);/);
  assert.ok(read('scripts/build-friendly.mjs').includes("'assets/role-label.js'"));
});
