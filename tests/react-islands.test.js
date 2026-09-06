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

test('React incremental: la isla de instalación queda sólo en acceso, con alternativa sin JavaScript', () => {
  const login = read('login.html');
  assert.equal((login.match(/id="mc-install-share-root"/g) || []).length, 1);
  assert.equal((login.match(/<!-- MC_REACT_ISLANDS -->/g) || []).length, 1);
  assert.match(login, /Usar MuniControl en tu celular/);
  assert.match(login, /Agregar a la pantalla de inicio/);
  for (const file of ['friendly-dashboard.html', 'nomina-control.html', 'recibos-sueldo.html', 'internal-dashboard.html']) {
    assert.doesNotMatch(read(file), /mc-install-share-root|assets\/islands/);
  }
});

test('React incremental: reportes monta únicamente navegación y conserva herramientas existentes', () => {
  const html = read('reportes-rrhh.html');
  assert.equal((html.match(/id="mc-report-workspace-root"/g) || []).length, 1);
  assert.equal((html.match(/<!-- MC_REPORT_WORKSPACE -->/g) || []).length, 1);
  assert.equal((html.match(/data-report-panel="/g) || []).length, 4);
  assert.match(html, /href="#bancarizacion"/);
  assert.match(html, /href="#escolaridades"/);
  assert.match(html, /href="#f931"/);
  assert.match(read('src/islands/ReportWorkspace.jsx'), /useSyncExternalStore/);
  assert.doesNotMatch(read('src/islands/ReportWorkspace.jsx'), /fetch\(|localStorage|FileReader|dangerouslySetInnerHTML/);
  assert.match(read('scripts/build-friendly.mjs'), /assets\/report-workspace.css/);
  assert.match(read('sw.js'), /MC_REPORT_WORKSPACE_PRECACHE/);
  assert.match(read('scripts/build-friendly.mjs'), /island.name === 'report-workspace'/);
  assert.doesNotMatch(read('sw.js').split('const PUBLIC_NAVIGATION_FALLBACKS')[0], /install-share|login\.html/);
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
