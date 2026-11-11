import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const css=read('assets/mc-charts.css'),entry=read('src/charts/mc-charts-entry.js'),loader=read('assets/mc-chart-loader.js');

// Behaviour is exercised end to end by scripts/verify-own-payroll-liquidation-ui.mjs (real SQL, real browser): it measures the
// document inside the resize event, when the charts still hold the width they were drawn with. These guards keep the style
// sheet and the chart mount from drifting apart in a refactor that never runs the browser verifier.
test('un gráfico ya dibujado nunca queda más ancho que su tarjeta mientras espera que lo redibujen',()=>{
 // ECharts fixes the pixel width of its wrapper and of its canvas (or svg) when it draws; only chart.resize() changes it.
 assert.match(entry,/const observer = new ResizeObserver\(\(\) => chart && !chart\.isDisposed\(\) && chart\.resize\(/);
 assert.match(entry,/observer\.observe\(host\); host\.__mcObserved = observer;/);
 // Between the narrower layout and that callback the drawing follows its card; without this rule a 332 px canvas inside a
 // 262 px card made a 320 px page 361 px wide.
 assert.ok(css.includes('\n.mc-chart>div:first-child,.mc-chart>div:first-child>canvas,.mc-chart>div:first-child>svg{max-width:100%}\n'));
});

test('el arreglo no recorta: la tarjeta no esconde lo que sobresale y el límite sólo alcanza al dibujo',()=>{
 // Clipping the host would have hidden the overflow too, and with it every tooltip that is not confined to the chart.
 const hostRules=[...css.matchAll(/\.mc-chart\{([^}]*)\}/g)].map(match=>match[1]);
 assert.ok(hostRules.includes('position:relative;width:100%;height:260px;border-radius:12px')&&hostRules.length>=2,'la regla base y sus variantes de alto');
 for(const rule of hostRules)assert.doesNotMatch(rule,/overflow|clip|contain/);
 // The tooltip is a later child of the same host: :first-child leaves its width alone.
 assert.doesNotMatch(css,/\.mc-chart>div\{/);assert.doesNotMatch(css,/\.mc-chart\s+div\{/);
});

test('todos los gráficos de las pantallas se montan en un contenedor .mc-chart',()=>{
 assert.match(loader,/const host = document\.createElement\('div'\); host\.className = 'mc-chart';/);
 assert.match(loader,/const host = make\('div', \{class: 'mc-chart mc-zoom-chart',/);
 assert.match(loader,/const mounted = m\.mountChart\(host, build\(m, \{zoom\}\), \{ariaLabel\}\);/);
});
