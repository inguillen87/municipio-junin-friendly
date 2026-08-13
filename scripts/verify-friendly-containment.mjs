import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const config = JSON.parse(read('vercel.json'));
const rewrites = new Map(config.rewrites.map(({ source, destination }) => [source, destination]));

assert.equal(rewrites.get('/'), '/friendly-dashboard.html');
assert.equal(rewrites.get('/rrhh-data/:path*'), '/api/friendly-policy');
for (const route of ['/rrhh', '/hacienda', '/ia', '/reportes', '/api/rrhh', '/api/payroll', '/api/ai-analyze']) {
  assert.ok(rewrites.has(route), `falta contener ${route}`);
}

assert.ok(!fs.existsSync(new URL('../.new_token.txt', import.meta.url)), 'el artefacto secreto no debe existir');
const ignore = read('.vercelignore');
for (const pattern of ['.new_token.txt', 'data-rrhh/', 'api/**', '*.html']) assert.ok(ignore.includes(pattern));

for (const file of ['login.html', 'friendly-dashboard.html', 'datos-personales.html']) {
  const html = read(file);
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(match[1])) continue;
    new vm.Script(match[2], { filename: file });
  }
  assert.ok(!/Buenos Aires|Partido de Jun[ií]n|cross-source|k\s*=\s*10/i.test(html), `${file} contiene copy no permitido`);
}

const friendlyData = JSON.parse(read('friendly-data.json'));
assert.equal(friendlyData.jurisdiction.municipality, 'Junín');
assert.equal(friendlyData.jurisdiction.province, 'Mendoza');
assert.equal(friendlyData.source.timezone, 'America/Argentina/Mendoza');
assert.equal(friendlyData.privacy.grain, 'aggregate');
assert.equal(friendlyData.privacy.containsPersonRows, false);
assert.equal(friendlyData.workforce.historicalRecords, 2450);
assert.equal(friendlyData.workforce.active, 882);
assert.equal(friendlyData.workforce.inactive, 1568);
assert.equal(friendlyData.management.current.balance, 49);
assert.equal(friendlyData.management.previous.balance, 31);
assert.equal(friendlyData.absence.totalEvents, 31572);
assert.equal(friendlyData.availability.payrollAmounts, 'unavailable');
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

const login = read('login.html');
assert.match(login, /intendente@junin\.gob\.ar/);
assert.match(login, /Junin2026!/);
assert.doesNotMatch(login, /Legajo\s*571|ALONSO|DNI|CUIL/i);

console.log('Friendly containment: OK');
