import {chartSlot, drawChart} from './mc-chart-loader.js';
import {aggregateOption, chartValue, chartNumber} from './aggregate-chart-model.js';
export {executiveCharts, comparisonChart} from './aggregate-chart-model.js';

const liveCharts = new WeakMap();
const node = (tag, text) => {const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n;};
export function clearAggregateCharts(container) {
 if (!container) return;
 const old = liveCharts.get(container);
 if (old) {old.cancelled = true; old.observer?.disconnect(); for (const chart of old.mounted) chart.dispose(); liveCharts.delete(container);}
 container.replaceChildren();
}
export function drawAggregateCharts(container, specs) {
 if (!container) return Promise.resolve([]);
 clearAggregateCharts(container);
 const href = new URL('./aggregate-charts.css', import.meta.url).href;
 if (![...document.querySelectorAll('link[rel=stylesheet]')].some(link => link.href === href)) {const link = node('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link);}
 const state = {cancelled: false, mounted: []}; liveCharts.set(container, state);
 container.classList.add('mc-aggregate-charts');
 // Removing the protected panel also removes its canvases and resize observers.
 if (typeof MutationObserver === 'function') {
  state.observer = new MutationObserver(() => {if (!container.isConnected) clearAggregateCharts(container);});
  state.observer.observe(document.documentElement, {childList: true, subtree: true});
 }
 return Promise.all(specs.filter(s => s.labels.length).map(spec => {
  const slot = chartSlot(spec.title, {subtitle: spec.subtitle, size: spec.horizontal ? 'lg' : 'md', key: spec.key});
  const details = node('details'), summary = node('summary', 'Ver cifras del gráfico'), table = node('table');
  const head = node('thead'), header = node('tr');
  for (const label of ['Período / categoría', ...spec.series.map(s => s.name), ...(spec.context ? ['Contexto'] : [])]) {const th = node('th', label); th.scope = 'col'; header.append(th);}
  head.append(header); table.append(head); const body = node('tbody');
  spec.labels.forEach((label, i) => {const tr = node('tr'); tr.append(node('th', label)); tr.firstElementChild.scope = 'row';
   for (const series of spec.series) tr.append(node('td', chartValue(series.values[i], spec.unit)));
   if (spec.context) tr.append(node('td', spec.context[i] || '')); body.append(tr);
  });
  table.append(body); const scroll = node('div'); scroll.style.overflowX = 'auto'; scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Cifras de ' + spec.title); scroll.append(table);
  details.append(summary, scroll); slot.figure.append(details); container.append(slot.figure);
  const unsafe = spec.series.some(s => s.values.some(v => v !== null && chartNumber(v, spec.unit) === null));
  if (unsafe) {slot.host.dataset.loading = 'unavailable'; slot.host.textContent = 'La magnitud excede la escala segura del gráfico. Consultá las cifras exactas.'; details.open = true; return null;}
  return drawChart(slot.host, m => aggregateOption(m, spec), {ariaLabel: spec.title + '. ' + spec.subtitle}).then(mounted => {
   if (!mounted) {if (!state.cancelled && slot.host.isConnected) {slot.host.dataset.loading = 'unavailable'; slot.host.textContent = 'No se pudo dibujar el gráfico. Las cifras siguen disponibles.'; details.open = true;} return null;}
   if (state.cancelled || !container.isConnected || !slot.host.isConnected) {mounted.dispose(); return null;}
   state.mounted.push(mounted); return mounted;
  });
 }));
}
