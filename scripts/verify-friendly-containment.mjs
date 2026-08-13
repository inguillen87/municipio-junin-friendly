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

const login = read('login.html');
assert.match(login, /intendente@junin\.gob\.ar/);
assert.match(login, /Junin2026!/);
assert.doesNotMatch(login, /Legajo\s*571|ALONSO|DNI|CUIL/i);

console.log('Friendly containment: OK');
