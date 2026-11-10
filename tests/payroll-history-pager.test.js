// Liquidaciones → Historial: la tabla de corridas informadas (24 filas en producción, 3,6 pantallas con su sección de
// evidencia) se pagina de a 12 con el paginador declarativo, sin cambiar lo que dibuja la pantalla.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('la tabla de corridas se pagina de a doce y la página carga el paginador y sus estilos', () => {
 const page = fs.readFileSync(new URL('../nomina-control.html', import.meta.url), 'utf8'), build = fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');
 assert.ok(page.includes('<tbody id="runRows" data-mc-pager="12" data-mc-pager-noun="corridas" data-mc-pager-search="off"></tbody>'));
 assert.equal(page.split('<script type="module" src="assets/list-pager.js"></script>').length - 1, 1);
 assert.equal(page.split('<link rel="stylesheet" href="assets/section-tabs.css">').length - 1, 1);
 for (const asset of ["'assets/list-pager.js'", "'assets/section-tabs.css'"]) assert.ok(build.includes(asset), asset);
 assert.ok(page.includes("var host = byId('runRows');"), 'la pantalla sigue dibujando todas las filas; el paginador sólo las muestra de a una página');
});
