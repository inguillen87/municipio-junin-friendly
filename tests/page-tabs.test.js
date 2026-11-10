import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const pages = fs.readdirSync(new URL('..', import.meta.url)).filter(file => file.endsWith('.html') && /data-mc-tabs='/.test(read(file)));
const config = file => {
  const html = read(file), tag = html.match(/<div data-mc-tabs='([^']+)'([^>]*)><\/div>/);
  assert.ok(tag, file + ': un único bloque declarativo de pestañas');
  return { html, tabs: JSON.parse(tag[1]), key: tag[2].match(/data-mc-tabs-key="([^"]+)"/)?.[1], label: tag[2].match(/data-mc-tabs-label="([^"]+)"/)?.[1], attrs: tag[2] };
};
// Bloques que no están en el HTML fuente: los arma otro módulo al cargar o los instala la compilación (scripts/build-clock-fleet.mjs).
const DYNAMIC = new Set(['estructura.html #contenido > .mc-chart-row', 'relojes-marcaciones.html #clockFleetReception']);

test('las pantallas largas declaran pestañas en lenguaje llano en lugar de una página interminable', () => {
  assert.deepEqual(pages.sort(), ['ausentismo-control.html', 'calidad-datos.html', 'calidad-operativa.html', 'centro-ayuda.html', 'control-horario-homologacion.html', 'control-horario-readiness.html',
    'estructura.html', 'gestion-comparativa.html', 'integracion-datos.html', 'licencias-control.html', 'modulos.html', 'presupuesto-control.html', 'relojes-marcaciones.html']);
  const keys = new Set();
  for (const file of pages) {
    const { html, tabs, key, label } = config(file);
    assert.equal(html.match(/data-mc-tabs='/g).length, 1, file);
    assert.match(html, /<link rel="stylesheet" href="\/?assets\/section-tabs\.css">/, file);
    assert.match(html, /<script type="module" src="\/?assets\/page-tabs\.js"><\/script>/, file);
    assert.match(key, /^mc\.[a-z-]+\.tab$/, file); assert.ok(!keys.has(key), file + ': clave de pestaña recordada única'); keys.add(key);
    assert.ok(label && label.length > 8, file + ': nombre accesible de la barra');
    assert.ok(tabs.length >= 2 && tabs.length <= 9, file);
    assert.equal(new Set(tabs.map(tab => tab.id)).size, tabs.length, file + ': ids sin repetir');
    for (const tab of tabs) {
      assert.match(tab.id, /^[a-z]+$/, file);
      assert.ok(tab.label.length >= 3 && tab.label.length <= 28, file + ' ' + tab.id + ': título corto');
      assert.ok((tab.hint || '').length <= 34, file + ' ' + tab.id + ': ayuda breve');
      assert.doesNotMatch(tab.label + ' ' + (tab.hint || ''), /tenant|payload|snapshot|binding|endpoint|API|lineage|dataset|gobernanza|trazab|homolog|calculabilidad/i, file + ' ' + tab.id + ': sin jerga técnica');
      // Cada selector apunta a un bloque que la pantalla trae en su HTML (o a uno dinámico conocido).
      for (const selector of tab.sel.split(',').map(part => part.trim())) {
        if (DYNAMIC.has(file + ' ' + selector)) continue;
        const id = selector.match(/^#([\w-]+)$/), labelled = selector.match(/^section\[aria-labelledby=([\w-]+)\]$/), cls = selector.match(/^[\w .>#-]*\.([\w-]+)$/), data = selector.match(/^\[(data-[\w-]+)\]$/);
        const found = id ? html.includes('id="' + id[1] + '"') : labelled ? new RegExp('<section[^>]*aria-labelledby="' + labelled[1] + '"').test(html)
          : cls ? new RegExp('class="[^"]*\\b' + cls[1] + '\\b').test(html) : data ? html.includes(data[1]) : false;
        assert.ok(found, file + ' ' + tab.id + ': «' + selector + '» existe en la pantalla');
      }
    }
    // Un bloque nunca queda en dos pestañas.
    const all = tabs.flatMap(tab => tab.sel.split(',').map(part => part.trim()));
    assert.equal(new Set(all).size, all.length, file + ': cada bloque en una sola pestaña');
  }
});

test('pestañas y paginador son sólo presentación: sin pedidos, sin HTML crudo, y al imprimir sale todo', () => {
  const tabs = read('assets/page-tabs.js'), pager = read('assets/list-pager.js'), core = read('assets/section-tabs.js'), css = read('assets/section-tabs.css');
  for (const source of [tabs, pager]) assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|innerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.cookie/);
  assert.match(tabs, /import \{ mountSectionTabs \} from '\.\/section-tabs\.js';\nimport '\.\/list-pager\.js';/);
  assert.match(tabs, /if \(!collect\(\)\) \{ api\.refresh\(\); return; \}/); // bloques que llegan después y contenedores que se llenan más tarde
  assert.doesNotMatch(tabs, /addEventListener\('submit'|focusin/); // un módulo que consulta solo al cargar no debe cambiar la pestaña de la persona
  assert.match(core, /sync: \(\) => \{ if \(current !== null\) activate\(current, false\); \}/);
  assert.match(core, /show: id => \{ if \(!items\.some\(t => t\.id === id\)\) return; wanted = id; activate\(id, false\); \}/);
  assert.match(core, /globalThis\.mcSectionTabsShow = node => reveal\(node, false\);/);
  assert.match(core, /new ResizeObserver\(place\)\.observe\(list\)/); // la barra puede montarse con la pantalla todavía oculta
  assert.match(core, /const filled = n => !skipEmpty \|\| n\.childElementCount > 0 \|\| Boolean\(n\.textContent\.trim\(\)\);/);
  assert.match(tabs, /mountSectionTabs\(\{ host, tabs, initial, skipEmpty: true,/); // un contenedor sin llenar no ofrece pestaña
  assert.match(pager, /classList\.toggle\('mc-page-off', !shown\.has\(n\)\)/);
  assert.doesNotMatch(pager, /\bn\.hidden\s*=/); // las filas no usan `hidden`: ese atributo es de la pantalla
  assert.match(css, /html:not\(\.mc-tabs-all\) \.mc-tab-off\{display:none!important\}/);
  assert.match(css, /@media print\{\.mc-pager\{display:none!important\}\.mc-page-off\{display:revert!important\}\.mc-tab-replaced\{display:revert!important\}html:not\(\.mc-tabs-all\) \.mc-tab-off\{display:block!important\}\}/);
  const build = read('scripts/build-friendly.mjs');
  for (const asset of ['assets/page-tabs.js', 'assets/list-pager.js', 'assets/section-tabs.js', 'assets/section-tabs.css']) assert.ok(build.includes("'" + asset + "'"), asset + ' se publica');
});

test('los recorridos guiados y los atajos traen al frente la pestaña del bloque que señalan', () => {
  assert.match(read('assets/internal-guide.js'), /if \(typeof window\.mcSectionTabsShow === 'function'\) window\.mcSectionTabsShow\(target\);/);
  assert.match(read('assets/structure-charts.js'), /globalThis\.mcSectionTabsReveal\?\.\(panel\)/);
  const clock = read('assets/clock-dashboard.js');
  assert.match(clock, /globalThis\.mcSectionTabsReveal\?\.\(fleet\);fleet\.scrollIntoView/);
  assert.match(clock, /globalThis\.mcSectionTabsReveal\?\.\(root\);root\.scrollIntoView/);
  assert.match(read('licencias-control.html'), /"id":"persona"[^}]*"hash":"preview previewPanel"/); // el traspaso desde la ficha abre «Consultar una persona»
  assert.match(read('centro-ayuda.html'), /data-mc-tabs-all-when="#helpSearch"/); // el buscador de ayuda muestra resultados de todas las pestañas
  assert.match(read('relojes-marcaciones.html'), /"id":"tecnico"[^}]*"on":"mc:clock-fleet-map-focus"/); // «Ubicar en mapa» trae la pestaña del mapa
  const tabsSource = read('assets/page-tabs.js');
  assert.match(tabsSource, /addEventListener\('beforeprint', \(\) => forPrint\(true\)\); addEventListener\('afterprint', \(\) => forPrint\(false\)\);/);
  assert.match(tabsSource, /window\.print = \(\) => \{ forPrint\(true\); requestAnimationFrame\(\(\) => requestAnimationFrame\(/); // los gráficos se dibujan antes de imprimir
});

test('las tablas largas se ven de a una página', () => {
  assert.match(read('licencias-control.html'), /<tbody id="mappingTableBody" data-mc-pager="8" data-mc-pager-noun="motivos"><\/tbody>/);
  for (const id of ['organizationRows', 'sectorRows', 'jobRoleRows', 'organizationCatalogRows', 'sectorCatalogRows']) assert.match(read('estructura.html'), new RegExp('<tbody id="' + id + '" data-mc-pager="12" data-mc-pager-noun="[a-z]+" data-mc-pager-search="off">'));
  assert.match(read('assets/clock-fleet-workspace-panel.js'), /cards\.dataset\.mcPager='6';cards\.dataset\.mcPagerNoun='relojes';cards\.dataset\.mcPagerSearch='off';/);
  const rules = read('src/islands/LeaveRulesBrowser.jsx');
  assert.match(rules, /const PAGE_SIZE = 8;/); assert.match(rules, /shown\.map\(rule => <details/); assert.match(rules, /className="lr-pages"/);
});
