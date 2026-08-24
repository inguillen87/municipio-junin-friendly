import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const config = JSON.parse(read('vercel.json'));
const rewrites = new Map(config.rewrites.map(({ source, destination }) => [source, destination]));

assert.equal(rewrites.get('/'), '/friendly-dashboard.html');
assert.equal(rewrites.get('/rrhh-data/:path*'), '/api/friendly-policy');
assert.equal(rewrites.get('/internal'), '/internal-dashboard.html');
assert.equal(rewrites.get('/activar-cuenta'), '/activar-cuenta.html');
assert.equal(rewrites.get('/seguridad-cuenta'), '/seguridad-cuenta.html');
assert.equal(rewrites.get('/rrhh'), '/internal-dashboard.html');
assert.equal(rewrites.get('/centro-acciones'), '/centro-acciones.html');
assert.equal(rewrites.get('/fuentes-tiempo'), '/fuentes-tiempo.html');
assert.equal(rewrites.get('/administracion-plataforma'), '/administracion-plataforma.html');
assert.equal(rewrites.get('/admin'), '/administracion-plataforma.html');
assert.equal(rewrites.get('/modulos'), '/modulos.html');
assert.equal(rewrites.get('/reportes'), '/reportes-rrhh.html');
assert.equal(rewrites.get('/organigrama'), '/estructura.html');
assert.equal(rewrites.get('/integracion-datos'), '/integracion-datos.html');
assert.equal(rewrites.get('/nomina-control'), '/nomina-control.html');
assert.equal(rewrites.get('/gestion-comparativa'), '/gestion-comparativa.html');
assert.equal(rewrites.get('/presupuesto-control'), '/presupuesto-control.html');
assert.equal(rewrites.get('/ausentismo-control'), '/ausentismo-control.html');
assert.equal(rewrites.get('/licencias-control'), '/licencias-control.html');
assert.equal(rewrites.get('/calidad-operativa'), '/calidad-operativa.html');
assert.equal(rewrites.get('/asistente'), '/asistente.html');
assert.equal(rewrites.get('/centro-ayuda'), '/centro-ayuda.html');
assert.equal(rewrites.get('/ayuda'), '/centro-ayuda.html');
assert.ok(config.functions['api/internal-auth.js'], 'falta publicar autenticación interna');
assert.ok(config.functions['api/internal-identity.js'], 'falta publicar el gateway de identidad');
assert.ok(config.functions['api/internal-data.js'], 'falta publicar API interna');
assert.ok(config.functions['api/internal-actions.js'], 'falta publicar API de acciones internas');
assert.ok(config.functions['api/internal-admin.js'], 'falta publicar API de administración de plataforma');
assert.ok(config.functions['api/internal-assistant.js'], 'falta publicar asistente interno');
for (const route of ['/rrhh', '/hacienda', '/ia', '/reportes', '/api/rrhh', '/api/payroll', '/api/ai-analyze']) {
  assert.ok(rewrites.has(route), `falta contener ${route}`);
}

assert.ok(!fs.existsSync(new URL('../.new_token.txt', import.meta.url)), 'el artefacto secreto no debe existir');
const ignore = read('.vercelignore');
for (const pattern of ['.new_token.txt', 'data-rrhh/', 'api/rrhh.js', 'api/lib/db.js', '*.html', 'lookups.json', 'transcripts_audios.json', 'quick-seed.js', 'test_prisma.js']) assert.ok(ignore.includes(pattern));
assert.doesNotMatch(ignore, /^sw\.js$/m, 'el service worker PWA debe llegar al build de Vercel');
assert.doesNotMatch(ignore, /^manifest\.webmanifest$/m, 'el manifiesto PWA debe llegar al build de Vercel');
assert.match(ignore, /^!gestion-comparativa\.html$/m, 'la comparación de gestiones debe llegar al build de Vercel');
assert.match(ignore, /^!presupuesto-control\.html$/m, 'el presupuesto aprobado debe llegar al build de Vercel');
assert.match(ignore, /^!centro-acciones\.html$/m, 'el Centro de acciones debe llegar al build de Vercel');
assert.match(ignore, /^!fuentes-tiempo\.html$/m, 'la gobernanza temporal debe llegar al build de Vercel');
assert.match(ignore, /^!administracion-plataforma\.html$/m, 'la administración de plataforma debe llegar al build de Vercel');
assert.match(ignore, /^!activar-cuenta\.html$/m, 'la activación segura debe llegar al build de Vercel');
assert.match(ignore, /^!seguridad-cuenta\.html$/m, 'el Centro de seguridad debe llegar al build de Vercel');
assert.match(ignore, /^!assets\/identity-security\.css$/m, 'el shell institucional de identidad debe llegar al build de Vercel');
assert.match(ignore, /^!scripts\/migrations\/003-action-center\.sql$/m, 'la migración de acciones debe llegar al gate de build');
assert.match(ignore, /^!scripts\/migrations\/004-tenant-iam-control-plane\.sql$/m, 'la migración IAM debe llegar al gate de build');
assert.match(ignore, /^!scripts\/migrations\/005-tenant-identity-gateway\.sql$/m, 'la migración del gateway de identidad debe llegar al gate de build');
for (const migration of [
  '006-tenant-action-authority.sql',
  '007-action-center-read-facades.sql',
  '008-governed-overtime-actions.sql',
  '009-tenant-lifecycle-hardening.sql',
  '010-governed-time-source-registry.sql',
  '011-versioned-time-catalog.sql',
  '012-platform-owner-governance.sql',
  '013-existing-identity-membership-governance.sql',
  '014-governed-source-binding-provisioning.sql',
  '015-email-otp-mfa.sql',
]) {
  assert.match(
    ignore,
    new RegExp(`^!scripts/migrations/${migration.replaceAll('.', '\\.')}$`, 'm'),
    `${migration} debe llegar al gate remoto de build`,
  );
}
assert.doesNotMatch(ignore, /^docs\/$/m, 'Vercel debe poder recorrer docs para re-incluir evidencia exacta');
for (const document of [
  'COMPETITIVE_PRODUCT_ROADMAP.md',
  'IDENTITY_PRODUCTION_AUDIT_20260821.md',
  'GRH_TIME_SOURCE_DISCOVERY_20260819.md',
  'JUNIN_ATTENDANCE_INPUTS_20260821.md',
  'CIVITAS_ESUELDOS_EVIDENCE_20260821.md',
  'GOVERNED_TENANT_MEMBERSHIP_20260821.md',
  'QA_IDENTITY_MEMBERSHIP_20260821.md',
]) {
  assert.match(
    ignore,
    new RegExp(`^!docs/${document.replaceAll('.', '\\.')}$`, 'm'),
    `${document} debe llegar al gate remoto de privacidad`,
  );
}
const gitIgnoreUrl = new URL('../.gitignore', import.meta.url);
if (fs.existsSync(gitIgnoreUrl)) {
  const gitIgnore = fs.readFileSync(gitIgnoreUrl, 'utf8');
  for (const pattern of ['.new_token.txt', 'data-rrhh/', 'rrhh-data/', 'prisma/', '*.db', '*.sql']) {
    assert.ok(gitIgnore.includes(pattern), `git debe ignorar ${pattern}`);
  }
} else {
  assert.equal(process.env.VERCEL, '1', '.gitignore sólo puede faltar dentro del build aislado de Vercel');
}

for (const file of ['login.html', 'activar-cuenta.html', 'seguridad-cuenta.html', 'friendly-dashboard.html', 'modulos.html', 'reportes-rrhh.html', 'calidad-datos.html', 'datos-personales.html', 'internal-dashboard.html', 'centro-acciones.html', 'fuentes-tiempo.html', 'administracion-plataforma.html', 'estructura.html', 'integracion-datos.html', 'nomina-control.html', 'gestion-comparativa.html', 'presupuesto-control.html', 'ausentismo-control.html', 'licencias-control.html', 'calidad-operativa.html', 'asistente.html', 'centro-ayuda.html']) {
  const html = read(file);
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(match[1])) continue;
    new vm.Script(match[2], { filename: file });
  }
  assert.ok(!/Buenos Aires|Partido de Jun[ií]n|cross-source|k\s*=\s*10/i.test(html), `${file} contiene copy no permitido`);
}

const internalDashboard = read('internal-dashboard.html');
assert.match(internalDashboard, /\/api\/internal-auth/, 'el panel debe validar la sesión interna');
assert.match(internalDashboard, /\/api\/internal-data/, 'el panel debe consultar la API interna');
assert.doesNotMatch(internalDashboard, /<input[^>]+(?:email|password)[^>]+value\s*=/i, 'las credenciales internas no deben estar embebidas');
const internalGuide = read('assets/internal-guide.js');
assert.match(internalGuide, /sessionStorage/, 'la guía debe aislar el progreso a la sesión activa');
assert.doesNotMatch(internalGuide, /localStorage/, 'la guía no debe compartir progreso entre empleados del mismo navegador');
assert.match(internalGuide, /product-guidance\.js/, 'la guía debe consumir el catálogo de producto compartido');
assert.match(read('api/internal-assistant.js'), /product-guidance\.js/, 'la IA debe consumir el mismo catálogo de producto');
for (const file of ['internal-dashboard.html', 'centro-acciones.html', 'administracion-plataforma.html', 'estructura.html', 'integracion-datos.html', 'nomina-control.html', 'gestion-comparativa.html', 'presupuesto-control.html', 'ausentismo-control.html', 'licencias-control.html', 'calidad-operativa.html', 'asistente.html']) {
  assert.match(read(file), /assets\/internal-guide\.js/, `${file} debe cargar la ayuda contextual compartida`);
}
assert.match(read('api/internal-data.js'), /mendoza-title-vi\.js/, 'la API de licencias debe consumir el catalogo normativo versionado');
assert.match(read('api/internal-assistant.js'), /leavenormative/, 'la IA debe poder explicar el modulo normativo sin improvisar reglas');
assert.match(read('modulos.html'), /href="licencias-control\.html"/, 'el mapa de producto debe descubrir Licencias normativas');
assert.match(read('modulos.html'), /href="presupuesto-control\.html"/, 'el mapa de producto debe descubrir el presupuesto aprobado');
assert.match(read('modulos.html'), /href="administracion-plataforma\.html"/, 'el mapa de producto debe descubrir la administración de plataforma');
assert.match(read('friendly-dashboard.html'), /Control normativo de licencias/, 'el tablero publico debe distinguir control normativo de saldos vigentes');
assert.match(read('asistente.html'), /value="leave_policy"/, 'el asistente debe ofrecer la consulta normativa explícita');
assert.match(read('login.html'), /centro-acciones\.html/, 'el acceso interno debe permitir volver al Centro de acciones');
assert.match(read('login.html'), /administracion-plataforma\.html/, 'el acceso interno debe descubrir la administración de plataforma');
assert.match(read('login.html'), /licencias-control\.html/, 'el acceso interno debe permitir volver al módulo de Licencias');
assert.match(read('login.html'), /gestion-comparativa\.html/, 'el acceso interno debe permitir volver a la comparación de gestiones');
assert.match(read('login.html'), /presupuesto-control\.html/, 'el acceso interno debe permitir volver al presupuesto aprobado');
for (const file of ['api/friendly-policy.js', 'api/internal-auth.js', 'api/internal-identity.js', 'api/internal-data.js', 'api/internal-actions.js', 'api/internal-admin.js', 'api/internal-assistant.js']) {
  assert.doesNotMatch(ignore, new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `${file} no debe estar excluido de Vercel`);
}

const friendlyData = JSON.parse(read('friendly-data.json'));
assert.equal(friendlyData.jurisdiction.municipality, 'Junín');
assert.equal(friendlyData.jurisdiction.province, 'Mendoza');
assert.equal(friendlyData.source.timezone, 'not_recorded_in_dump');
assert.equal(friendlyData.privacy.grain, 'aggregate');
assert.equal(friendlyData.privacy.containsPersonRows, false);
assert.equal(friendlyData.workforce.historicalRecords, 2450);
assert.equal(friendlyData.workforce.active, 882);
assert.equal(friendlyData.workforce.inactive, 1568);
assert.equal(friendlyData.management.current.balance, 49);
assert.equal(friendlyData.management.previous.balance, 31);
assert.equal(friendlyData.absence.totalEvents, 31572);
assert.equal(friendlyData.availability.payrollAmounts, 'internal_closed_runs_only');
assert.equal(friendlyData.availability.budgetExecution, 'unavailable');
assert.equal(
  friendlyData.workforce.activeSectors.reduce((sum, row) => sum + row.value, 0),
  friendlyData.workforce.active,
  'los sectores activos deben reconciliar con la dotación activa'
);
const serializedData = JSON.stringify(friendlyData);
assert.doesNotMatch(
  serializedData,
  /"(?:dni|cuil|documento|legajo|nombre|apellido|telefono|phone|email|domicilio|direccion|calle|salario|sueldo|remuneracion|nacimiento)"\s*:/i,
  'el snapshot Friendly no debe incluir campos nominales'
);
for (const group of friendlyData.workforce.activeSectors) {
  assert.ok(
    group.value >= friendlyData.privacy.minimumPublishedGroupSize,
    `el grupo ${group.label} no alcanza el mínimo de publicación`
  );
}

const dashboard = read('friendly-dashboard.html');
for (const section of ['inicio', 'personas', 'gestion', 'ausentismo', 'calidad', 'hoja-ruta', 'datos']) {
  assert.match(dashboard, new RegExp(`id=["']${section}["']`), `falta sección Friendly ${section}`);
}
assert.match(dashboard, /titles\[requested\]\?requested:'inicio'/, 'los hashes desconocidos deben volver a inicio');
assert.match(dashboard, /friendly-data\.json/, 'el tablero debe cargar la fuente agregada');
assert.match(dashboard, /URLSearchParams\(location\.search\)\.get\('section'\)/, 'las rutas heredadas deben abrir su seccion correcta');
assert.match(dashboard, /routeSections\[location\.pathname\]/, 'las rutas reescritas deben resolver la seccion desde el path visible');
assert.equal(rewrites.get('/hacienda'), '/friendly-dashboard.html?section=hacienda');
assert.equal(rewrites.get('/servicios'), '/friendly-dashboard.html?section=servicios');
assert.equal(rewrites.get('/licitaciones'), '/friendly-dashboard.html?section=compras');

const login = read('login.html');
assert.doesNotMatch(login, /const\s+USERS\s*=|function\s+fillUser\s*\(/, 'el acceso público no debe depender de credenciales demo embebidas');
assert.match(login, /function openPublicView\(\)/);
assert.doesNotMatch(login, /Legajo\s*571|ALONSO|DNI|CUIL/i);

console.log('Friendly containment: OK');
