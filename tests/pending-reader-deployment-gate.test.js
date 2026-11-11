// El control de compilación del despliegue corre `npm test` sobre los archivos que deja pasar .vercelignore. La
// fachada 227 es SQL, y los SQL quedan fuera salvo los que se nombran: si falta su línea, sus pruebas de instalación
// fallan sólo en el despliegue (así falló la primera publicación de la campanita).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('the 227 facade read by its installation tests is let through to the deployment build', () => {
 const ignore = fs.readFileSync('.vercelignore', 'utf8').split(/\r?\n/);
 assert.ok(ignore.includes('*.sql'), 'los SQL se excluyen por omisión');
 assert.equal(ignore.filter(l => l === '!scripts/migrations/227-own-salary-conditions-pending.sql').length, 1);
 assert.ok(ignore.indexOf('!scripts/migrations/227-own-salary-conditions-pending.sql') > ignore.indexOf('*.sql'), 'la excepción va después de la exclusión general');
 assert.ok(fs.existsSync('tests/own-salary-conditions-pending-installation.test.js') && !fs.existsSync('tests/own-salary-conditions-pending-installation.test.mjs'), 'sus pruebas corren en el control normal');
 assert.ok(fs.readFileSync('package.json', 'utf8').includes('"build": "npm run test && node scripts/build-friendly.mjs"'), 'la compilación del despliegue corre las pruebas');
});
