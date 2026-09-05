import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('React incremental: dependencias estables fijadas y sin servidor paralelo', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.react, '19.2.8');
  assert.equal(pkg.dependencies['react-dom'], pkg.dependencies.react);
  assert.equal(pkg.devDependencies.esbuild, '0.28.2');
  assert.equal(pkg.dependencies.next, undefined);
  assert.ok(fs.existsSync(new URL('../api/internal-auth.js', import.meta.url)));
});

test('React incremental: sólo acceso tiene la isla, con alternativa sin JavaScript', () => {
  const login = read('login.html');
  assert.equal((login.match(/id="mc-install-share-root"/g) || []).length, 1);
  assert.equal((login.match(/<!-- MC_REACT_ISLANDS -->/g) || []).length, 1);
  assert.match(login, /Usar MuniControl en tu celular/);
  assert.match(login, /Agregar a la pantalla de inicio/);
  for (const file of ['friendly-dashboard.html', 'nomina-control.html', 'recibos-sueldo.html', 'internal-dashboard.html']) {
    assert.doesNotMatch(read(file), /mc-install-share-root|assets\/islands/);
  }
});

test('React incremental: build hash, producción, licencia y límite de tamaño', () => {
  const build = read('scripts/build-react-islands.mjs');
  assert.match(build, /entryNames: '\[name\]-\[hash\]'/);
  assert.match(build, /sourcemap: false/);
  assert.match(build, /legalComments: 'linked'/);
  assert.match(build, /gzipBytes < 90000/);
  assert.match(build, /process\.env\.NODE_ENV/);
  assert.match(build, /<script defer src=/);
});
